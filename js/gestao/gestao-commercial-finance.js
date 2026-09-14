let gestaoCommercialFinanceActiveScreen = 'meta-venda';
let gestaoCommercialFinanceOrdersCache = [];
let gestaoCommercialFinanceTargetsByYearMonth = {};
let gestaoCommercialFinanceClosedSaleMonths = new Set();
let gestaoCommercialFinanceCommissionEntriesCache = [];
let gestaoCommercialFinanceSchemaReady = true;
let gestaoCommercialFinanceCommissionCloseSchemaReady = true;
let gestaoCommercialFinanceMetaYear = Number(getCommercialFinanceCurrentYearMonth().split('-')[0]);
let gestaoCommercialFinanceMetaSelectedYearMonth = null;
let gestaoCommercialFinanceComissaoYear = Number(getCommercialFinanceCurrentYearMonth().split('-')[0]);
let gestaoCommercialFinanceComissaoMonth = getCommercialFinanceCurrentYearMonth();
let gestaoCommercialFinanceMetaEventsBound = false;
let gestaoCommercialFinanceClientInstallmentsModalOrderId = null;
let gestaoCommercialFinanceClientInstallmentsSchemaReady = true;

function assertGestaoCommercialFinanceAccess() {
    if (!canAccessGestaoCommercialFinance()) {
        alertAppDialog('Somente administradores e gestores comerciais podem acessar Comercial Financeiro.', { variant: 'warning', title: 'Aviso' });
        return false;
    }
    return true;
}

function setGestaoCommercialFinanceNavExpanded(expanded) {
    const items = document.getElementById('gestao-nav-comercial-financeiro-items');
    const chevron = document.getElementById('gestao-nav-comercial-financeiro-chevron');
    if (!items) return;
    items.classList.toggle('hidden', !expanded);
    if (chevron) chevron.textContent = expanded ? '▼' : '▶';
}

function updateGestaoCommercialFinanceNavVisibility() {
    const group = document.getElementById('gestao-nav-comercial-financeiro-group');
    const visible = canAccessGestaoCommercialFinance();
    group?.classList.toggle('hidden', !visible);
}

window.updateGestaoCommercialFinanceNavVisibility = updateGestaoCommercialFinanceNavVisibility;

function markCommercialFinanceSchemaUnavailable(error) {
    const message = String(error?.message || '');
    if (message.includes('SalesMonthlyTarget')
        || message.includes('SalesCommissionTier')
        || message.includes('permission denied')
        || message.includes('does not exist')) {
        gestaoCommercialFinanceSchemaReady = false;
    }
}

function markCommercialFinanceCommissionCloseSchemaUnavailable(error) {
    const message = String(error?.message || '');
    if (message.includes('SalesCommissionMonthClose')
        || message.includes('SalesCommissionEntry')
        || message.includes('permission denied')
        || message.includes('does not exist')) {
        gestaoCommercialFinanceCommissionCloseSchemaReady = false;
    }
}

function markCommercialFinanceClientInstallmentsSchemaUnavailable(error) {
    const message = String(error?.message || '');
    if (message.includes('SalesOrderClientInstallment')
        || message.includes('permission denied')
        || message.includes('does not exist')) {
        gestaoCommercialFinanceClientInstallmentsSchemaReady = false;
    }
}

async function fetchCommercialFinanceCommissionTiers(salesMonthlyTargetId) {
    const { data, error } = await supabaseClient
        .from('SalesCommissionTier')
        .select('id, minAmount, maxAmount, ratePercent, sortOrder')
        .eq('salesMonthlyTargetId', salesMonthlyTargetId)
        .order('sortOrder', { ascending: true });

    if (error) {
        markCommercialFinanceSchemaUnavailable(error);
        return { data: [], error };
    }

    return { data: sortCommercialFinanceCommissionTiers(data || []), error: null };
}

async function fetchCommercialFinanceMonthlyTarget(yearMonth) {
    const { data, error } = await supabaseClient
        .from('SalesMonthlyTarget')
        .select('id, yearMonth, targetAmount')
        .eq('yearMonth', yearMonth)
        .maybeSingle();

    if (error) {
        markCommercialFinanceSchemaUnavailable(error);
        return { data: null, error };
    }

    gestaoCommercialFinanceSchemaReady = true;
    if (!data?.id) {
        return { data: null, error: null };
    }

    const tiersResult = await fetchCommercialFinanceCommissionTiers(data.id);
    if (tiersResult.error) {
        return { data: null, error: tiersResult.error };
    }

    return {
        data: { ...data, tiers: tiersResult.data },
        error: null
    };
}

async function fetchCommercialFinanceMonthlyTargets() {
    const { data, error } = await supabaseClient
        .from('SalesMonthlyTarget')
        .select('id, yearMonth, targetAmount')
        .order('yearMonth', { ascending: true });

    if (error) {
        markCommercialFinanceSchemaUnavailable(error);
        return { data: [], error };
    }

    gestaoCommercialFinanceSchemaReady = true;
    const targetsByYearMonth = {};
    for (const target of data || []) {
        const tiersResult = await fetchCommercialFinanceCommissionTiers(target.id);
        if (tiersResult.error) {
            return { data: [], error: tiersResult.error };
        }
        targetsByYearMonth[target.yearMonth] = {
            ...target,
            tiers: tiersResult.data
        };
    }
    gestaoCommercialFinanceTargetsByYearMonth = targetsByYearMonth;
    return { data: Object.values(targetsByYearMonth), error: null };
}

async function saveCommercialFinanceMonthlyTarget(yearMonth, targetAmount, tiers) {
    const normalizedYearMonth = String(yearMonth || '').trim();
    const normalizedAmount = roundCommercialFinanceMoney(
        typeof parseSaleValueInput === 'function'
            ? parseSaleValueInput(targetAmount)
            : Number(targetAmount)
    );

    if (!normalizedYearMonth) {
        return { ok: false, message: 'Informe o mês da meta.' };
    }
    if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
        return { ok: false, message: 'Informe um valor de meta válido.' };
    }

    const normalizedTiers = (tiers || []).map((tier, index) => ({
        minAmount: roundCommercialFinanceMoney(
            typeof parseSaleValueInput === 'function'
                ? parseSaleValueInput(tier.minAmount)
                : Number(tier.minAmount)
        ),
        maxAmount: tier.maxAmount === '' || tier.maxAmount == null
            ? null
            : roundCommercialFinanceMoney(
                typeof parseSaleValueInput === 'function'
                    ? parseSaleValueInput(tier.maxAmount)
                    : Number(tier.maxAmount)
            ),
        ratePercent: Number(String(tier.ratePercent || '').replace(',', '.')),
        sortOrder: index
    }));

    for (const tier of normalizedTiers) {
        if (!Number.isFinite(tier.minAmount) || tier.minAmount < 0) {
            return { ok: false, message: 'Faixa com valor mínimo inválido.' };
        }
        if (tier.maxAmount != null && (!Number.isFinite(tier.maxAmount) || tier.maxAmount < tier.minAmount)) {
            return { ok: false, message: 'Faixa com valor máximo inválido.' };
        }
        if (!Number.isFinite(tier.ratePercent) || tier.ratePercent < 0) {
            return { ok: false, message: 'Faixa com alíquota inválida.' };
        }
    }

    const existing = await fetchCommercialFinanceMonthlyTarget(normalizedYearMonth);
    if (existing.error) {
        return { ok: false, message: existing.error.message };
    }

    let targetId = existing.data?.id || null;

    if (targetId) {
        const { data: updated, error: updateError } = await supabaseClient
            .from('SalesMonthlyTarget')
            .update({
                targetAmount: normalizedAmount,
                updatedAt: new Date().toISOString()
            })
            .eq('id', targetId)
            .select('id')
            .maybeSingle();

        if (updateError) {
            return { ok: false, message: updateError.message };
        }
        if (!updated?.id) {
            return { ok: false, message: 'Meta não foi atualizada. Verifique permissão de admin e se o script SQL foi executado.' };
        }
    } else {
        const { data: inserted, error: insertError } = await supabaseClient
            .from('SalesMonthlyTarget')
            .insert({
                yearMonth: normalizedYearMonth,
                targetAmount: normalizedAmount
            })
            .select('id')
            .single();

        if (insertError) {
            return { ok: false, message: insertError.message };
        }
        targetId = inserted?.id;
        if (!targetId) {
            return { ok: false, message: 'Meta não foi criada. Verifique permissão de admin e se o script SQL foi executado.' };
        }
    }

    const { error: deleteError } = await supabaseClient
        .from('SalesCommissionTier')
        .delete()
        .eq('salesMonthlyTargetId', targetId);

    if (deleteError) {
        return { ok: false, message: deleteError.message };
    }

    if (normalizedTiers.length) {
        const payload = normalizedTiers.map(tier => ({
            salesMonthlyTargetId: targetId,
            minAmount: tier.minAmount,
            maxAmount: tier.maxAmount,
            ratePercent: tier.ratePercent,
            sortOrder: tier.sortOrder
        }));

        const { error: tiersError } = await supabaseClient
            .from('SalesCommissionTier')
            .insert(payload);

        if (tiersError) {
            return { ok: false, message: tiersError.message };
        }
    }

    await fetchCommercialFinanceMonthlyTargets();
    return { ok: true };
}

async function fetchCommercialFinanceClientInstallmentsByOrderIds(orderIds = []) {
    const normalizedIds = [...new Set(orderIds.map(id => Number(id)).filter(Boolean))];
    if (!normalizedIds.length) {
        return { data: {}, error: null };
    }

    const { data, error } = await supabaseClient
        .from('SalesOrderClientInstallment')
        .select('salesOrderId, installmentNumber, paymentYearMonth, clientInstallmentAmount')
        .in('salesOrderId', normalizedIds)
        .order('installmentNumber', { ascending: true });

    if (error) {
        markCommercialFinanceClientInstallmentsSchemaUnavailable(error);
        return { data: {}, error };
    }

    gestaoCommercialFinanceClientInstallmentsSchemaReady = true;
    const byOrderId = {};
    (data || []).forEach(row => {
        const orderId = Number(row.salesOrderId);
        if (!byOrderId[orderId]) byOrderId[orderId] = [];
        byOrderId[orderId].push(row);
    });
    return { data: byOrderId, error: null };
}

async function attachCommercialFinanceClientInstallmentsToOrders(orders = []) {
    const orderIds = (orders || []).map(order => Number(order.id)).filter(Boolean);
    const { data: byOrderId, error } = await fetchCommercialFinanceClientInstallmentsByOrderIds(orderIds);
    if (error) {
        return orders;
    }

    return (orders || []).map(order => ({
        ...order,
        clientInstallments: byOrderId[Number(order.id)] || order.clientInstallments || []
    }));
}

async function fetchCommercialFinanceOrders() {
    let orders = [];

    if (typeof fetchGestaoOrders === 'function') {
        const { data, error } = await fetchGestaoOrders();
        if (error) {
            return { data: [], error };
        }
        orders = data || [];
    } else {
        const selectVariants = [
            'id, orderCode, saleDate, consultantUserId, paymentMethod, installmentCount, commissionConfirmed, commissionRatePercent, client:Client(name), consultor:appUsers!consultantUserId(id, name), projects:OrderProject(id, saleValue, isReplacement, replacesProjectId, replaces:replacesProjectId(saleValue)), clientInstallments:SalesOrderClientInstallment(installmentNumber, paymentYearMonth, clientInstallmentAmount)',
            'id, orderCode, saleDate, consultantUserId, paymentMethod, installmentCount, commissionConfirmed, client:Client(name), consultor:appUsers!consultantUserId(id, name), projects:OrderProject(id, saleValue, isReplacement, replacesProjectId, replaces:replacesProjectId(saleValue)), clientInstallments:SalesOrderClientInstallment(installmentNumber, paymentYearMonth, clientInstallmentAmount)',
            'id, orderCode, saleDate, consultantUserId, paymentMethod, installmentCount, commissionConfirmed, client:Client(name), consultor:appUsers!consultantUserId(id, name), projects:OrderProject(id, saleValue, isReplacement, replacesProjectId, replaces:replacesProjectId(saleValue))'
        ];

        let lastError = null;
        for (const selectQuery of selectVariants) {
            const { data, error } = await supabaseClient
                .from('salesOrders')
                .select(selectQuery)
                .order('saleDate', { ascending: false });

            if (!error) {
                orders = data || [];
                lastError = null;
                break;
            }
            lastError = error;
            if (!/SalesOrderClientInstallment|relationship|embed|schema cache/i.test(error.message || '')) {
                return { data: [], error };
            }
        }

        if (lastError) {
            return { data: [], error: lastError };
        }
    }

    gestaoCommercialFinanceOrdersCache = await attachCommercialFinanceClientInstallmentsToOrders(orders);
    return { data: gestaoCommercialFinanceOrdersCache, error: null };
}

async function deleteCommercialFinanceClientInstallments(orderId) {
    const { error } = await supabaseClient
        .from('SalesOrderClientInstallment')
        .delete()
        .eq('salesOrderId', orderId);

    if (error) {
        markCommercialFinanceClientInstallmentsSchemaUnavailable(error);
        return { ok: false, message: error.message };
    }

    return { ok: true };
}

async function saveCommercialFinanceClientInstallments(orderId, installments = []) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) {
        return { ok: false, message: 'Pedido inválido.' };
    }

    const deleteResult = await deleteCommercialFinanceClientInstallments(normalizedOrderId);
    if (!deleteResult.ok) {
        return deleteResult;
    }

    const normalizedInstallments = (installments || [])
        .map((installment, index) => ({
            installmentNumber: index + 1,
            paymentYearMonth: String(installment.paymentYearMonth || '').trim(),
            clientInstallmentAmount: parseCommercialFinanceClientInstallmentAmount(
                installment.clientInstallmentAmount
            )
        }))
        .filter(installment =>
            installment.paymentYearMonth
            && installment.clientInstallmentAmount != null
            && installment.clientInstallmentAmount > 0
        );

    if (normalizedInstallments.length) {
        const payload = normalizedInstallments.map(installment => ({
            salesOrderId: normalizedOrderId,
            installmentNumber: installment.installmentNumber,
            paymentYearMonth: installment.paymentYearMonth,
            clientInstallmentAmount: installment.clientInstallmentAmount,
            updatedAt: new Date().toISOString()
        }));

        const attempts = [
            payload,
            payload.map(item => {
                const copy = { ...item };
                delete copy.updatedAt;
                return copy;
            })
        ];

        let lastError = null;
        for (const insertPayload of attempts) {
            const { error } = await supabaseClient
                .from('SalesOrderClientInstallment')
                .insert(insertPayload);
            if (!error) {
                lastError = null;
                break;
            }
            lastError = error;
            if (!/updatedAt/i.test(error.message || '')) {
                break;
            }
        }

        if (lastError) {
            markCommercialFinanceClientInstallmentsSchemaUnavailable(lastError);
            return { ok: false, message: lastError.message };
        }
    }

    gestaoCommercialFinanceClientInstallmentsSchemaReady = true;
    const cached = gestaoCommercialFinanceOrdersCache.find(order => Number(order.id) === normalizedOrderId);
    if (cached) {
        cached.clientInstallments = normalizedInstallments;
        cached.installmentCount = normalizedInstallments.length || 1;
    }

    return { ok: true, installments: normalizedInstallments };
}

async function fetchCommercialFinanceClosedSaleMonths() {
    const { data, error } = await supabaseClient
        .from('SalesCommissionMonthClose')
        .select('id, saleYearMonth, closedAt')
        .order('saleYearMonth', { ascending: true });

    if (error) {
        markCommercialFinanceCommissionCloseSchemaUnavailable(error);
        return { data: [], error };
    }

    gestaoCommercialFinanceCommissionCloseSchemaReady = true;
    gestaoCommercialFinanceClosedSaleMonths = new Set((data || []).map(item => item.saleYearMonth));
    return { data: data || [], error: null };
}

async function fetchCommercialFinanceCommissionEntries(filters = {}) {
    const selectVariants = [
        'id, monthCloseId, salesOrderId, consultantUserId, saleDate, saleYearMonth, referenceYearMonth, orderCode, clientName, consultantName, saleValue, clientInstallmentAmount, commissionAmount, ratePercent, installmentNumber, installmentCount',
        'id, monthCloseId, salesOrderId, consultantUserId, saleDate, saleYearMonth, referenceYearMonth, orderCode, clientName, consultantName, saleValue, commissionAmount, ratePercent, installmentNumber, installmentCount'
    ];
    let lastError = null;

    for (const selectQuery of selectVariants) {
        let query = supabaseClient
            .from('SalesCommissionEntry')
            .select(selectQuery)
            .order('referenceYearMonth', { ascending: true })
            .order('saleDate', { ascending: true })
            .order('orderCode', { ascending: true })
            .order('installmentNumber', { ascending: true });

        if (filters.year) {
            query = query.like('saleYearMonth', `${Number(filters.year)}-%`);
        }
        if (filters.saleYearMonth) {
            query = query.eq('saleYearMonth', filters.saleYearMonth);
        }
        if (filters.referenceYearMonth) {
            query = query.eq('referenceYearMonth', filters.referenceYearMonth);
        }

        const { data, error } = await query;
        if (!error) {
            gestaoCommercialFinanceCommissionCloseSchemaReady = true;
            gestaoCommercialFinanceCommissionEntriesCache = (data || []).map(entry => ({
                ...entry,
                clientInstallmentAmount: entry.clientInstallmentAmount ?? entry.commissionAmount ?? 0
            }));
            return { data: gestaoCommercialFinanceCommissionEntriesCache, error: null };
        }

        lastError = error;
        if (!/clientInstallmentAmount|column|schema cache/i.test(error.message || '')) {
            break;
        }
    }

    if (lastError) {
        markCommercialFinanceCommissionCloseSchemaUnavailable(lastError);
        return { data: [], error: lastError };
    }

    return { data: [], error: null };
}

async function closeCommercialFinanceSaleMonth(saleYearMonth) {
    const normalizedYearMonth = String(saleYearMonth || '').trim();
    if (!normalizedYearMonth) {
        return { ok: false, message: 'Informe o mês de venda para fechar.' };
    }
    if (gestaoCommercialFinanceClosedSaleMonths.has(normalizedYearMonth)) {
        return { ok: false, message: 'Este mês de venda já foi fechado.' };
    }

    await fetchCommercialFinanceMonthlyTargets();
    await fetchCommercialFinanceOrders();

    const monthOrders = filterCommercialFinanceOrdersBySaleYearMonth(
        gestaoCommercialFinanceOrdersCache,
        normalizedYearMonth
    );
    const confirmedOrders = filterCommercialFinanceCommissionOrders(monthOrders);
    const usesImportedRates = monthCommercialFinanceOrdersUseImportedCommissionRates(monthOrders);
    const tiers = gestaoCommercialFinanceTargetsByYearMonth[normalizedYearMonth]?.tiers || [];
    if (!tiers.length && !usesImportedRates) {
        return { ok: false, message: `Cadastre as faixas de comissão em Meta de Venda para ${formatCommercialFinanceYearMonthLabel(normalizedYearMonth)}.` };
    }
    for (const order of confirmedOrders) {
        const validation = validateCommercialFinanceOrderForCommission(order);
        if (!validation.ok) {
            return { ok: false, message: validation.message };
        }
    }

    const draft = buildCommercialFinanceCommissionEntryDrafts(
        gestaoCommercialFinanceOrdersCache,
        gestaoCommercialFinanceTargetsByYearMonth,
        normalizedYearMonth
    );

    if (!draft.confirmedCount) {
        return { ok: false, message: 'Não há vendas confirmadas para fechar neste mês.' };
    }
    if (draft.pendingCount > 0) {
        return {
            ok: false,
            message: `Ainda há ${draft.pendingCount} venda(s) sem confirmação em ${formatCommercialFinanceYearMonthLabel(normalizedYearMonth)}. Confirme todas antes de fechar.`
        };
    }
    if (!draft.entries.length) {
        return { ok: false, message: 'Nenhuma parcela de comissão foi gerada para este mês.' };
    }

    const closedByUserId = Number(currentUser?.id) || null;
    const closePayload = {
        saleYearMonth: normalizedYearMonth,
        closedByUserId: closedByUserId || null
    };

    const { data: closeRow, error: closeError } = await supabaseClient
        .from('SalesCommissionMonthClose')
        .insert(closePayload)
        .select('id, saleYearMonth, closedAt')
        .single();

    if (closeError) {
        markCommercialFinanceCommissionCloseSchemaUnavailable(closeError);
        return { ok: false, message: closeError.message };
    }

    const entryPayload = draft.entries.map(entry => ({
        monthCloseId: closeRow.id,
        salesOrderId: entry.salesOrderId || null,
        consultantUserId: entry.consultantUserId,
        saleDate: entry.saleDate,
        saleYearMonth: entry.saleYearMonth,
        referenceYearMonth: entry.referenceYearMonth,
        orderCode: entry.orderCode,
        clientName: entry.clientName,
        consultantName: entry.consultantName,
        saleValue: entry.saleValue,
        clientInstallmentAmount: entry.clientInstallmentAmount,
        commissionAmount: entry.commissionAmount,
        ratePercent: entry.ratePercent,
        installmentNumber: entry.installmentNumber,
        installmentCount: entry.installmentCount
    }));

    const { error: entriesError } = await supabaseClient
        .from('SalesCommissionEntry')
        .insert(entryPayload);

    if (entriesError) {
        await supabaseClient
            .from('SalesCommissionMonthClose')
            .delete()
            .eq('id', closeRow.id);
        markCommercialFinanceCommissionCloseSchemaUnavailable(entriesError);
        return { ok: false, message: entriesError.message };
    }

    gestaoCommercialFinanceClosedSaleMonths.add(normalizedYearMonth);
    return {
        ok: true,
        entryCount: entryPayload.length,
        saleYearMonth: normalizedYearMonth
    };
}

function isCommercialFinanceSaleMonthClosed(saleYearMonth) {
    const normalized = String(saleYearMonth || '').trim();
    return Boolean(normalized) && gestaoCommercialFinanceClosedSaleMonths.has(normalized);
}

function getCommercialFinanceOrderSaleYearMonth(order) {
    return getCommercialFinanceYearMonthFromDate(order?.saleDate);
}

function isCommercialFinanceOrderInClosedMonth(order) {
    return isCommercialFinanceSaleMonthClosed(getCommercialFinanceOrderSaleYearMonth(order));
}

async function reopenCommercialFinanceSaleMonth(saleYearMonth) {
    const normalizedYearMonth = String(saleYearMonth || '').trim();
    if (!normalizedYearMonth) {
        return { ok: false, message: 'Informe o mês de venda para reabrir.' };
    }
    if (!gestaoCommercialFinanceClosedSaleMonths.has(normalizedYearMonth)) {
        return { ok: false, message: 'Este mês de venda não está fechado.' };
    }

    const { error } = await supabaseClient
        .from('SalesCommissionMonthClose')
        .delete()
        .eq('saleYearMonth', normalizedYearMonth);

    if (error) {
        markCommercialFinanceCommissionCloseSchemaUnavailable(error);
        return { ok: false, message: error.message };
    }

    gestaoCommercialFinanceClosedSaleMonths.delete(normalizedYearMonth);
    gestaoCommercialFinanceCommissionEntriesCache = (gestaoCommercialFinanceCommissionEntriesCache || [])
        .filter(entry => entry.saleYearMonth !== normalizedYearMonth);

    return { ok: true, saleYearMonth: normalizedYearMonth };
}

async function readCommercialFinanceOrderPaymentFields(orderId, orderCode = '') {
    const normalizedOrderId = Number(orderId);
    const filters = [];
    if (normalizedOrderId) filters.push({ column: 'id', value: normalizedOrderId });
    if (orderCode) filters.push({ column: 'orderCode', value: String(orderCode).trim() });

    for (const filter of filters) {
        const { data, error } = await supabaseClient
            .from('salesOrders')
            .select('id, paymentMethod, installmentCount, commissionConfirmed')
            .eq(filter.column, filter.value)
            .maybeSingle();

        if (!error && data?.id) {
            return data;
        }
    }

    return null;
}

function syncCommercialFinanceOrderPaymentCache(orderId, fields = {}) {
    const cached = gestaoCommercialFinanceOrdersCache.find(order => Number(order.id) === Number(orderId));
    if (!cached) return;

    if (fields.paymentMethod != null) cached.paymentMethod = fields.paymentMethod;
    if (fields.installmentCount != null) cached.installmentCount = fields.installmentCount;
    if (fields.commissionConfirmed != null) cached.commissionConfirmed = Boolean(fields.commissionConfirmed);
}

function matchesCommercialFinanceOrderPaymentFields(fields, expected = {}) {
    if (!fields?.id) return false;

    const paymentMethod = normalizeCommercialFinancePaymentMethod(fields.paymentMethod);
    const expectedPaymentMethod = normalizeCommercialFinancePaymentMethod(expected.paymentMethod);
    const installmentCount = normalizeCommercialFinanceInstallmentCount(
        fields.installmentCount,
        paymentMethod
    );
    const expectedInstallmentCount = normalizeCommercialFinanceInstallmentCount(
        expected.installmentCount,
        expectedPaymentMethod
    );

    return paymentMethod === expectedPaymentMethod
        && installmentCount === expectedInstallmentCount
        && Boolean(fields.commissionConfirmed) === Boolean(expected.commissionConfirmed);
}

async function persistCommercialFinanceOrderPayment(orderId, paymentMethod, installmentCount, commissionConfirmed) {
    const normalizedOrderId = Number(orderId);
    const normalizedPaymentMethod = normalizeCommercialFinancePaymentMethod(paymentMethod);
    const cachedOrder = gestaoCommercialFinanceOrdersCache.find(order => Number(order.id) === normalizedOrderId);
    if (isCommercialFinanceOrderInClosedMonth(cachedOrder)) {
        const saleYearMonth = getCommercialFinanceOrderSaleYearMonth(cachedOrder);
        return {
            ok: false,
            message: `O mês ${formatCommercialFinanceYearMonthLabel(saleYearMonth)} está fechado. Reabra o mês para alterar.`
        };
    }
    const orderCode = cachedOrder?.orderCode || '';
    const clientInstallmentCount = getCommercialFinanceOrderClientInstallments(cachedOrder).length;
    const normalizedInstallmentCount = normalizedPaymentMethod === COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT
        ? Math.max(1, clientInstallmentCount || Number(installmentCount) || 1)
        : 1;
    const normalizedCommissionConfirmed = Boolean(commissionConfirmed);
    const expectedFields = {
        paymentMethod: normalizedPaymentMethod,
        installmentCount: normalizedInstallmentCount,
        commissionConfirmed: normalizedCommissionConfirmed
    };

    if (normalizedCommissionConfirmed) {
        const validation = validateCommercialFinanceOrderForCommission({
            ...(cachedOrder || {}),
            ...expectedFields
        });
        if (!validation.ok) {
            return { ok: false, message: validation.message };
        }
    }

    if (normalizedPaymentMethod === COMMERCIAL_FINANCE_PAYMENT_CASH) {
        const deleteResult = await deleteCommercialFinanceClientInstallments(normalizedOrderId);
        if (!deleteResult.ok && !String(deleteResult.message || '').includes('does not exist')) {
            return deleteResult;
        }
        if (cachedOrder) {
            cachedOrder.clientInstallments = [];
        }
    }

    const rpcMissingHint = 'Execute supabase/feats/set-sales-order-commission-fields.sql no Supabase SQL Editor.';
    const { data: rpcUpdated, error: rpcError } = await supabaseClient.rpc(
        'set_sales_order_commission_fields',
        {
            p_order_id: normalizedOrderId,
            p_payment_method: normalizedPaymentMethod,
            p_installment_count: normalizedInstallmentCount,
            p_commission_confirmed: normalizedCommissionConfirmed
        }
    );

    if (!rpcError && rpcUpdated === true) {
        const verified = await readCommercialFinanceOrderPaymentFields(normalizedOrderId, orderCode);
        if (matchesCommercialFinanceOrderPaymentFields(verified, expectedFields)) {
            syncCommercialFinanceOrderPaymentCache(normalizedOrderId, verified);
            return { ok: true };
        }
    }

    const basePayload = {
        paymentMethod: normalizedPaymentMethod,
        installmentCount: normalizedInstallmentCount,
        commissionConfirmed: normalizedCommissionConfirmed
    };
    const attempts = [
        { ...basePayload, updatedAt: new Date().toISOString(), updatedById: Number(currentUser?.id) || null },
        { ...basePayload, updatedAt: new Date().toISOString() },
        basePayload
    ];
    const filters = [];
    if (normalizedOrderId) filters.push({ column: 'id', value: normalizedOrderId });
    if (orderCode) filters.push({ column: 'orderCode', value: orderCode });

    let lastError = rpcError || null;

    for (const payload of attempts) {
        const cleanPayload = Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
        );

        for (const filter of filters) {
            const { error } = await supabaseClient
                .from('salesOrders')
                .update(cleanPayload)
                .eq(filter.column, filter.value);

            if (error) {
                lastError = error;
                if (error.message?.includes('updatedAt') || error.message?.includes('updatedById')) {
                    continue;
                }
                break;
            }

            const verified = await readCommercialFinanceOrderPaymentFields(normalizedOrderId, orderCode);
            if (matchesCommercialFinanceOrderPaymentFields(verified, expectedFields)) {
                syncCommercialFinanceOrderPaymentCache(normalizedOrderId, verified);
                return { ok: true };
            }
        }
    }

    const verified = await readCommercialFinanceOrderPaymentFields(normalizedOrderId, orderCode);
    if (matchesCommercialFinanceOrderPaymentFields(verified, expectedFields)) {
        syncCommercialFinanceOrderPaymentCache(normalizedOrderId, verified);
        return { ok: true };
    }

    if (lastError) {
        if (lastError.message?.includes('paymentMethod')
            || lastError.message?.includes('installmentCount')
            || lastError.message?.includes('commissionConfirmed')) {
            gestaoCommercialFinanceSchemaReady = false;
            return { ok: false, message: 'Campos de comissão ainda não existem no banco. Execute supabase/feats/create-commercial-finance-tables.sql.' };
        }
        if (/set_sales_order_commission_fields|could not find the function/i.test(String(lastError.message || ''))) {
            return { ok: false, message: rpcMissingHint };
        }
        return { ok: false, message: lastError.message };
    }

    if (/set_sales_order_commission_fields|could not find the function/i.test(String(rpcError?.message || ''))) {
        return { ok: false, message: rpcMissingHint };
    }

    return { ok: false, message: 'Pedido não foi atualizado. Verifique permissão de admin e se o pedido existe.' };
}

function buildCommercialFinanceYearMonthOptions(selectedYearMonth, monthsBack = 12, monthsForward = 3) {
    const options = [];
    const current = getCommercialFinanceCurrentYearMonth();
    for (let offset = -monthsBack; offset <= monthsForward; offset += 1) {
        const yearMonth = addCommercialFinanceMonths(current, offset);
        options.push({
            value: yearMonth,
            label: formatCommercialFinanceYearMonthLabel(yearMonth),
            selected: yearMonth === selectedYearMonth
        });
    }
    return options;
}

function renderCommercialFinanceTierRow(tier = {}, index = 0) {
    const minValue = typeof formatSaleValueForInput === 'function'
        ? formatSaleValueForInput(tier.minAmount ?? 0)
        : (tier.minAmount ?? 0);
    const maxValue = tier.maxAmount == null || tier.maxAmount === ''
        ? ''
        : (typeof formatSaleValueForInput === 'function'
            ? formatSaleValueForInput(tier.maxAmount)
            : tier.maxAmount);
    const rateValue = tier.ratePercent != null ? String(tier.ratePercent).replace('.', ',') : '';

    return `
        <tr class="gestao-commercial-finance-tier-row" data-tier-index="${index}">
            <td class="p-2">
                <input type="text" class="gestao-commercial-finance-tier-min w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(minValue)}" placeholder="0,00">
            </td>
            <td class="p-2">
                <input type="text" class="gestao-commercial-finance-tier-max w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(maxValue)}" placeholder="Sem limite">
            </td>
            <td class="p-2">
                <input type="text" class="gestao-commercial-finance-tier-rate w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(rateValue)}" placeholder="3,25">
            </td>
            <td class="p-2 text-right">
                <button type="button" class="gestao-commercial-finance-remove-tier text-xs bg-white border border-red-200 text-red-700 px-2 py-1 rounded-lg hover:bg-red-50">
                    Remover
                </button>
            </td>
        </tr>
    `;
}

function readCommercialFinanceTierRows() {
    return Array.from(document.querySelectorAll('.gestao-commercial-finance-tier-row')).map(row => ({
        minAmount: row.querySelector('.gestao-commercial-finance-tier-min')?.value || '0',
        maxAmount: row.querySelector('.gestao-commercial-finance-tier-max')?.value || '',
        ratePercent: row.querySelector('.gestao-commercial-finance-tier-rate')?.value || '0'
    }));
}

function getCommercialFinanceDefaultMetaTiers() {
    return [
        { minAmount: 0, maxAmount: 50000, ratePercent: 3 },
        { minAmount: 50001, maxAmount: 75000, ratePercent: 3.25 },
        { minAmount: 75001, maxAmount: 112500, ratePercent: 3.5 },
        { minAmount: 112501, maxAmount: 150000, ratePercent: 3.75 },
        { minAmount: 150001, maxAmount: 187500, ratePercent: 4 },
        { minAmount: 187501, maxAmount: 225000, ratePercent: 4.25 },
        { minAmount: 225001, maxAmount: 250000, ratePercent: 4.5 },
        { minAmount: 250001, maxAmount: 9999999, ratePercent: 5 }
    ];
}

function getCommercialFinanceMetaRealizedTone(targetAmount, realizedAmount) {
    const target = Number(targetAmount) || 0;
    const realized = Number(realizedAmount) || 0;
    if (target <= 0) {
        return realized > 0 ? 'is-neutral' : 'is-empty';
    }
    if (realized >= target) {
        return 'is-above';
    }
    return 'is-below';
}

function renderCommercialFinanceMetaCalendarMonthCard(
    year,
    monthNumber,
    targetsByYearMonth = {},
    realizedByYearMonth = {}
) {
    const yearMonth = buildCommercialFinanceYearMonthKey(year, monthNumber);
    const target = targetsByYearMonth[yearMonth];
    const targetAmount = Number(target?.targetAmount) || 0;
    const hasTarget = targetAmount > 0;
    const realizedAmount = Number(realizedByYearMonth[yearMonth]) || 0;
    const realizedTone = getCommercialFinanceMetaRealizedTone(targetAmount, realizedAmount);
    const showRealized = hasTarget || realizedAmount > 0;
    const currentYearMonth = getCommercialFinanceCurrentYearMonth();
    const isCurrent = yearMonth === currentYearMonth;
    const isSelected = yearMonth === gestaoCommercialFinanceMetaSelectedYearMonth;
    const savedTierCount = target?.tiers?.length || 0;
    const tierMetaLabel = savedTierCount
        ? `${savedTierCount} faixa${savedTierCount === 1 ? '' : 's'}`
        : 'Faixas não salvas';

    const cardToneClass = isSelected
        ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-1 ring-indigo-200'
        : isCurrent
            ? 'border-indigo-300'
            : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50';
    const realizedColorClass = realizedTone === 'is-above'
        ? 'text-emerald-600'
        : realizedTone === 'is-below'
            ? 'text-red-600'
            : 'text-slate-500';

    return `
        <button type="button"
            class="gestao-commercial-finance-meta-month-card flex flex-col items-start gap-1 min-h-[6.75rem] w-full p-3 border rounded-xl bg-white text-left transition ${cardToneClass} ${isSelected ? 'is-selected' : ''} ${isCurrent ? 'is-current' : ''}"
            data-year-month="${escapeHtml(yearMonth)}">
            <span class="gestao-commercial-finance-meta-month-card__label text-[11px] font-bold uppercase text-slate-500">${escapeHtml(formatCommercialFinanceMonthShortName(monthNumber))}</span>
            <span class="gestao-commercial-finance-meta-month-card__metric flex items-baseline gap-1 leading-tight">
                <span class="gestao-commercial-finance-meta-month-card__metric-label text-[10px] font-semibold text-slate-400">Meta:</span>
                <strong class="gestao-commercial-finance-meta-month-card__value text-[13px] font-bold text-slate-800">${hasTarget ? escapeHtml(formatSaleValue(targetAmount)) : '—'}</strong>
            </span>
            <span class="gestao-commercial-finance-meta-month-card__metric flex items-baseline gap-1 leading-tight">
                <span class="gestao-commercial-finance-meta-month-card__metric-label text-[10px] font-semibold text-slate-400">Realizado:</span>
                <span class="gestao-commercial-finance-meta-month-card__realized text-[11px] font-bold ${realizedColorClass} ${realizedTone}">
                    ${showRealized ? escapeHtml(formatSaleValue(realizedAmount)) : '—'}
                </span>
            </span>
            <span class="gestao-commercial-finance-meta-month-card__meta text-[10px] text-slate-400">${tierMetaLabel}</span>
        </button>
    `;
}

function renderCommercialFinanceMetaCalendar(year, targetsByYearMonth = {}, realizedByYearMonth = {}) {
    const months = Array.from({ length: 12 }, (_, index) => index + 1);

    return `
        <section class="gestao-commercial-finance-card bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h4 class="text-sm font-bold text-slate-900">Meta de Venda</h4>
                    <p class="text-xs text-slate-500 mt-1">
                        Clique em um mês para editar a meta do time e as faixas de alíquota.
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" id="gestao-commercial-finance-meta-prev-year"
                        class="text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-50">←</button>
                    <span id="gestao-commercial-finance-meta-year-label" class="text-sm font-bold text-slate-800 min-w-[3.5rem] text-center">${year}</span>
                    <button type="button" id="gestao-commercial-finance-meta-next-year"
                        class="text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-50">→</button>
                </div>
            </div>
            ${!gestaoCommercialFinanceSchemaReady ? `
                <p class="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Execute <code>supabase/feats/create-commercial-finance-tables.sql</code> no Supabase SQL Editor (veja também <code>PENDING-PROD-SQL.md</code>).
                </p>
            ` : ''}
            <div class="gestao-commercial-finance-meta-calendar grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 w-full">
                ${months.map(monthNumber => renderCommercialFinanceMetaCalendarMonthCard(
                    year,
                    monthNumber,
                    targetsByYearMonth,
                    realizedByYearMonth
                )).join('')}
            </div>
        </section>
    `;
}

function renderCommercialFinanceMetaEditor(yearMonth, target = null) {
    if (!yearMonth) {
        return `
            <section class="gestao-commercial-finance-card bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                <p class="text-xs text-slate-500">Selecione um mês no calendário para editar a meta e as faixas de alíquota.</p>
            </section>
        `;
    }

    const targetAmount = typeof formatSaleValueForInput === 'function'
        ? formatSaleValueForInput(target?.targetAmount ?? 0)
        : (target?.targetAmount ?? 0);
    const hasSavedTiers = Boolean(target?.tiers?.length);
    const tiers = hasSavedTiers
        ? target.tiers
        : getCommercialFinanceDefaultMetaTiers();
    const previousYearMonth = getCommercialFinancePreviousYearMonth(yearMonth);
    const previousTiers = gestaoCommercialFinanceTargetsByYearMonth[previousYearMonth]?.tiers || [];

    return `
        <section class="gestao-commercial-finance-card bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h4 class="text-sm font-bold text-slate-900">${escapeHtml(formatCommercialFinanceYearMonthLabel(yearMonth))}</h4>
                    <p class="text-xs text-slate-500 mt-1">Meta do time e faixas de comissão para vendas neste mês.</p>
                </div>
                <button type="button" id="gestao-commercial-finance-meta-close-editor"
                    class="text-xs bg-white border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg hover:bg-slate-50">
                    Fechar
                </button>
            </div>
            <form id="gestao-commercial-finance-meta-form" class="space-y-4" data-year-month="${escapeHtml(yearMonth)}">
                <div>
                    <label for="gestao-commercial-finance-meta-amount" class="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Meta do time (R$)</label>
                    <input type="text" id="gestao-commercial-finance-meta-amount" class="w-full max-w-sm px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                        value="${escapeHtml(targetAmount)}">
                </div>
                <div>
                    <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h5 class="text-xs font-bold text-slate-800">Faixas de alíquota</h5>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" id="gestao-commercial-finance-restore-default-tiers"
                                class="text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-medium hover:bg-slate-50">
                                Restaurar sugestão padrão
                            </button>
                            <button type="button" id="gestao-commercial-finance-copy-tiers-prev"
                                class="text-xs bg-white border border-indigo-200 text-indigo-800 px-2.5 py-1 rounded-lg font-medium hover:bg-indigo-50"
                                data-previous-year-month="${escapeHtml(previousYearMonth)}"
                                ${previousTiers.length ? '' : 'disabled'}>
                                Copiar do mês anterior
                            </button>
                            <button type="button" id="gestao-commercial-finance-add-tier"
                                class="text-xs bg-white border border-indigo-200 text-indigo-800 px-2.5 py-1 rounded-lg font-medium hover:bg-indigo-50">
                                Adicionar faixa
                            </button>
                        </div>
                    </div>
                    ${!hasSavedTiers ? `
                        <p class="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-2">
                            Faixas abaixo são apenas <strong>sugestão padrão</strong>. Revise os valores e clique em <strong>Salvar meta</strong> para gravar neste mês.
                        </p>
                    ` : ''}
                    ${!previousTiers.length ? `
                        <p class="text-[11px] text-slate-400 mb-2">Não há faixas salvas em ${escapeHtml(formatCommercialFinanceYearMonthLabel(previousYearMonth))}.</p>
                    ` : ''}
                    <div class="gestao-commercial-finance-table-wrap overflow-x-auto border border-slate-200 rounded-lg">
                        <table class="gestao-commercial-finance-table w-full text-xs">
                            <thead>
                                <tr class="bg-slate-50 text-slate-500">
                                    <th class="p-2 text-left font-semibold">De (R$)</th>
                                    <th class="p-2 text-left font-semibold">Até (R$)</th>
                                    <th class="p-2 text-left font-semibold">Alíquota (%)</th>
                                    <th class="p-2"></th>
                                </tr>
                            </thead>
                            <tbody id="gestao-commercial-finance-tier-rows">
                                ${tiers.map((tier, index) => renderCommercialFinanceTierRow(tier, index)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="flex justify-end gap-2">
                    <button type="submit" class="text-xs bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-800">
                        Salvar meta
                    </button>
                </div>
            </form>
        </section>
    `;
}

function renderGestaoCommercialFinanceMetaVendaView(editorTarget = null, orders = []) {
    const realizedByYearMonth = buildCommercialFinanceMonthlyRealizedSalesMap(
        orders,
        gestaoCommercialFinanceMetaYear
    );

    return `
        <div class="gestao-commercial-finance-meta-layout space-y-4">
            ${renderCommercialFinanceMetaCalendar(
                gestaoCommercialFinanceMetaYear,
                gestaoCommercialFinanceTargetsByYearMonth,
                realizedByYearMonth
            )}
            ${renderCommercialFinanceMetaEditor(gestaoCommercialFinanceMetaSelectedYearMonth, editorTarget)}
        </div>
    `;
}

function bindCommercialFinanceMetaCurrencyInputs(root = document) {
    const amountInput = root.querySelector('#gestao-commercial-finance-meta-amount');
    if (amountInput && typeof bindSaleValueCurrencyInput === 'function') {
        bindSaleValueCurrencyInput(amountInput);
    }
    root.querySelectorAll('.gestao-commercial-finance-tier-min, .gestao-commercial-finance-tier-max').forEach(input => {
        if (typeof bindSaleValueCurrencyInput === 'function') bindSaleValueCurrencyInput(input);
    });
}

function replaceCommercialFinanceTierRows(tiers = []) {
    const tbody = document.getElementById('gestao-commercial-finance-tier-rows');
    if (!tbody) return;
    const normalizedTiers = tiers.length ? tiers : getCommercialFinanceDefaultMetaTiers();
    tbody.innerHTML = normalizedTiers.map((tier, index) => renderCommercialFinanceTierRow(tier, index)).join('');
    bindCommercialFinanceMetaCurrencyInputs(tbody.closest('#gestao-commercial-finance-meta-form') || document);
}

function buildCommercialFinanceClientPaymentMonthOptions(saleDate, selectedYearMonth = '') {
    const saleYearMonth = getCommercialFinanceYearMonthFromDate(saleDate) || getCommercialFinanceCurrentYearMonth();
    const options = [];

    for (let offset = 0; offset <= 36; offset += 1) {
        const yearMonth = addCommercialFinanceMonths(saleYearMonth, offset);
        options.push({
            value: yearMonth,
            label: formatCommercialFinanceYearMonthLabel(yearMonth),
            selected: yearMonth === selectedYearMonth
        });
    }

    return options;
}

function normalizeCommercialFinanceClientInstallmentAmount(value) {
    if (typeof parseCommercialFinanceClientInstallmentAmount === 'function') {
        const parsed = parseCommercialFinanceClientInstallmentAmount(value);
        return parsed == null ? '' : parsed;
    }
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
        return roundCommercialFinanceMoney(value);
    }
    if (typeof parseSaleValueInput === 'function') {
        const parsed = parseSaleValueInput(value);
        return Number.isFinite(parsed) ? roundCommercialFinanceMoney(parsed) : '';
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? roundCommercialFinanceMoney(parsed) : '';
}

function getCommercialFinanceUsedClientPaymentMonths(installments = [], excludeIndex = -1) {
    return new Set(
        (installments || [])
            .filter((_, index) => index !== excludeIndex)
            .map(installment => installment.paymentYearMonth)
            .filter(Boolean)
    );
}

function renderCommercialFinanceClientInstallmentModalRow(
    installment = {},
    index = 0,
    saleDate = '',
    installments = []
) {
    const normalizedAmount = normalizeCommercialFinanceClientInstallmentAmount(
        installment.clientInstallmentAmount
    );
    const amountValue = typeof formatSaleValueForInput === 'function'
        ? formatSaleValueForInput(normalizedAmount)
        : (normalizedAmount ?? '');
    const monthOptions = buildCommercialFinanceClientPaymentMonthOptions(
        saleDate,
        installment.paymentYearMonth || ''
    );
    const usedMonths = getCommercialFinanceUsedClientPaymentMonths(installments, index);

    return `
        <tr class="commercial-finance-client-installment-row" data-row-index="${index}">
            <td class="p-2 text-slate-500">${index + 1}</td>
            <td class="p-2">
                <input type="text"
                    class="commercial-finance-client-installment-amount w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(amountValue)}" placeholder="0,00">
            </td>
            <td class="p-2">
                <select class="commercial-finance-client-installment-month w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                    <option value="">Selecione</option>
                    ${monthOptions.map(option => {
                        const isDisabled = usedMonths.has(option.value)
                            && option.value !== installment.paymentYearMonth;
                        return `
                        <option value="${escapeHtml(option.value)}"
                            ${option.selected ? 'selected' : ''}
                            ${isDisabled ? 'disabled' : ''}>
                            ${escapeHtml(option.label)}${isDisabled ? ' (em uso)' : ''}
                        </option>
                    `;
                    }).join('')}
                </select>
            </td>
            <td class="p-2 text-right">
                <button type="button" class="commercial-finance-client-installment-remove text-xs text-red-700 hover:underline">
                    Remover
                </button>
            </td>
        </tr>
    `;
}

function getCommercialFinanceRemainingClientInstallmentAmount(order, installments = []) {
    const saleValue = getCommercialFinanceOrderSaleValue(order);
    const allocated = sumCommercialFinanceClientInstallmentAmounts(
        installments.map(item => ({
            clientInstallmentAmount: normalizeCommercialFinanceClientInstallmentAmount(
                item.clientInstallmentAmount
            )
        }))
    );
    const remaining = roundCommercialFinanceMoney(saleValue - allocated);
    return remaining > 0 ? remaining : 0;
}

function readCommercialFinanceClientInstallmentModalRows() {
    return Array.from(document.querySelectorAll('.commercial-finance-client-installment-row')).map(row => {
        const rawAmount = row.querySelector('.commercial-finance-client-installment-amount')?.value || '';
        const normalizedAmount = normalizeCommercialFinanceClientInstallmentAmount(rawAmount);

        return {
            clientInstallmentAmount: normalizedAmount === '' ? '' : normalizedAmount,
            paymentYearMonth: row.querySelector('.commercial-finance-client-installment-month')?.value || ''
        };
    });
}

function syncCommercialFinanceClientInstallmentMonthOptions(order) {
    const installments = readCommercialFinanceClientInstallmentModalRows();
    const rows = Array.from(document.querySelectorAll('.commercial-finance-client-installment-row'));

    rows.forEach((row, index) => {
        const select = row.querySelector('.commercial-finance-client-installment-month');
        if (!select) return;

        const currentValue = select.value;
        const usedMonths = getCommercialFinanceUsedClientPaymentMonths(installments, index);

        Array.from(select.options).forEach(option => {
            if (!option.value) return;
            const isDisabled = usedMonths.has(option.value) && option.value !== currentValue;
            option.disabled = isDisabled;
            option.textContent = isDisabled
                ? `${formatCommercialFinanceYearMonthLabel(option.value)} (em uso)`
                : formatCommercialFinanceYearMonthLabel(option.value);
        });
    });
}

function updateCommercialFinanceClientInstallmentModalTotals(order) {
    const saleValue = getCommercialFinanceOrderSaleValue(order);
    const installments = readCommercialFinanceClientInstallmentModalRows();
    const total = sumCommercialFinanceClientInstallmentAmounts(installments);

    const saleValueEl = document.getElementById('commercial-finance-client-installments-sale-value');
    const totalEl = document.getElementById('commercial-finance-client-installments-total');
    if (saleValueEl) saleValueEl.textContent = formatSaleValue(saleValue);
    if (totalEl) {
        totalEl.textContent = formatSaleValue(total);
        totalEl.classList.toggle('text-red-600', Math.abs(total - saleValue) > 0.01);
        totalEl.classList.toggle('text-emerald-700', Math.abs(total - saleValue) <= 0.01 && total > 0);
        totalEl.classList.toggle('text-slate-800', total <= 0);
    }
}

function replaceCommercialFinanceClientInstallmentModalRows(order, installments = []) {
    const tbody = document.getElementById('commercial-finance-client-installments-rows');
    if (!tbody) return;

    const rows = installments.length
        ? installments
        : [{ clientInstallmentAmount: '', paymentYearMonth: '' }];

    tbody.innerHTML = rows
        .map((installment, index) => renderCommercialFinanceClientInstallmentModalRow(
            installment,
            index,
            order?.saleDate,
            rows
        ))
        .join('');

    tbody.querySelectorAll('.commercial-finance-client-installment-amount').forEach(input => {
        if (typeof bindSaleValueCurrencyInput === 'function') {
            bindSaleValueCurrencyInput(input);
        }
        input.addEventListener('input', () => updateCommercialFinanceClientInstallmentModalTotals(order));
    });
    tbody.querySelectorAll('.commercial-finance-client-installment-month').forEach((select, index) => {
        select.addEventListener('change', () => {
            const selectedMonth = select.value;
            if (selectedMonth) {
                const installments = readCommercialFinanceClientInstallmentModalRows();
                const isDuplicate = installments.some((installment, installmentIndex) =>
                    installmentIndex !== index && installment.paymentYearMonth === selectedMonth
                );
                if (isDuplicate) {
                    select.value = '';
                    alertAppDialog(
                        'Este mês de pagamento já foi usado em outra parcela.',
                        { variant: 'warning', title: 'Aviso' }
                    );
                }
            }
            syncCommercialFinanceClientInstallmentMonthOptions(order);
            updateCommercialFinanceClientInstallmentModalTotals(order);
        });
    });

    syncCommercialFinanceClientInstallmentMonthOptions(order);
    updateCommercialFinanceClientInstallmentModalTotals(order);
}

function openCommercialFinanceClientInstallmentsModal(orderId) {
    const order = gestaoCommercialFinanceOrdersCache.find(item => Number(item.id) === Number(orderId));
    if (!order) return;
    if (isCommercialFinanceOrderInClosedMonth(order)) {
        const saleYearMonth = getCommercialFinanceOrderSaleYearMonth(order);
        alertAppDialog(
            `O mês ${formatCommercialFinanceYearMonthLabel(saleYearMonth)} está fechado. Reabra o mês para alterar as parcelas.`,
            { variant: 'warning', title: 'Mês fechado' }
        );
        return;
    }

    gestaoCommercialFinanceClientInstallmentsModalOrderId = Number(order.id);
    const context = document.getElementById('commercial-finance-client-installments-context');
    if (context) {
        context.textContent = `Pedido ${order.orderCode || '—'} · ${getOrderClientName(order)} · Valor ${formatSaleValue(getCommercialFinanceOrderSaleValue(order))}`;
    }

    replaceCommercialFinanceClientInstallmentModalRows(
        order,
        getCommercialFinanceOrderClientInstallments(order)
    );
    toggleModal('commercial-finance-client-installments-modal', true);
}

async function saveCommercialFinanceClientInstallmentsFromModal() {
    const orderId = gestaoCommercialFinanceClientInstallmentsModalOrderId;
    const order = gestaoCommercialFinanceOrdersCache.find(item => Number(item.id) === Number(orderId));
    if (!order) return { ok: false, message: 'Pedido não encontrado.' };
    if (isCommercialFinanceOrderInClosedMonth(order)) {
        const saleYearMonth = getCommercialFinanceOrderSaleYearMonth(order);
        alertAppDialog(
            `O mês ${formatCommercialFinanceYearMonthLabel(saleYearMonth)} está fechado. Reabra o mês para alterar as parcelas.`,
            { variant: 'warning', title: 'Mês fechado' }
        );
        return { ok: false };
    }

    const installments = readCommercialFinanceClientInstallmentModalRows();
    const draftOrder = {
        ...order,
        paymentMethod: COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT,
        clientInstallments: installments.map((item, index) => ({
            installmentNumber: index + 1,
            paymentYearMonth: item.paymentYearMonth,
            clientInstallmentAmount: parseCommercialFinanceClientInstallmentAmount(
                item.clientInstallmentAmount
            )
        }))
    };
    const validation = validateCommercialFinanceOrderForCommission(draftOrder);
    if (!validation.ok) {
        alertAppDialog(validation.message, { variant: 'warning', title: 'Aviso' });
        return { ok: false };
    }

    const saveButton = document.getElementById('commercial-finance-client-installments-save');
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Salvando...';
    }

    const result = await saveCommercialFinanceClientInstallments(orderId, installments);

    if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = 'Salvar parcelas';
    }

    if (!result.ok) {
        alertAppDialog(result.message || 'Não foi possível salvar as parcelas.', { variant: 'warning', title: 'Aviso' });
        return result;
    }

    await persistCommercialFinanceOrderPayment(
        orderId,
        COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT,
        result.installments.length,
        Boolean(order.commissionConfirmed)
    );

    toggleModal('commercial-finance-client-installments-modal', false);
    gestaoCommercialFinanceClientInstallmentsModalOrderId = null;
    await loadGestaoCommercialFinanceVendas();
    return result;
}

function renderCommercialFinanceVendasClosePanel(closeYearMonth = '') {
    const selectedMonth = closeYearMonth || getCommercialFinanceCurrentYearMonth();
    const monthOrders = filterCommercialFinanceOrdersBySaleYearMonth(
        gestaoCommercialFinanceOrdersCache,
        selectedMonth
    );
    const confirmedCount = filterCommercialFinanceCommissionOrders(monthOrders).length;
    const pendingCount = monthOrders.length - confirmedCount;
    const isClosed = gestaoCommercialFinanceClosedSaleMonths.has(selectedMonth);

    return `
        <section class="gestao-commercial-finance-card bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h4 class="text-sm font-bold text-slate-900">Fechar mês de vendas</h4>
                    <p class="text-xs text-slate-500 mt-1">
                        Após confirmar todas as vendas do mês, feche para gerar os registros de comissão. À vista paga no mês seguinte; parcelado usa as parcelas do cliente.
                    </p>
                </div>
                <div class="w-full sm:w-52">
                    <label for="gestao-commercial-finance-close-month" class="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Mês de venda</label>
                    <select id="gestao-commercial-finance-close-month" class="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                        ${buildCommercialFinanceYearMonthOptions(selectedMonth, 18, 2).map(option => `
                            <option value="${escapeHtml(option.value)}" ${option.value === selectedMonth ? 'selected' : ''}>${escapeHtml(option.label)}</option>
                        `).join('')}
                    </select>
                </div>
            </div>
            ${!gestaoCommercialFinanceCommissionCloseSchemaReady ? `
                <p class="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Execute <code>supabase/feats/create-sales-commission-close-tables.sql</code> no Supabase SQL Editor.
                </p>
            ` : ''}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="gestao-commercial-finance-metric bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <span class="block text-[10px] font-semibold uppercase text-slate-400">Confirmadas</span>
                    <strong class="text-sm text-slate-900">${confirmedCount}</strong>
                </div>
                <div class="gestao-commercial-finance-metric bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <span class="block text-[10px] font-semibold uppercase text-slate-400">Pendentes</span>
                    <strong class="text-sm ${pendingCount ? 'text-amber-700' : 'text-slate-900'}">${pendingCount}</strong>
                </div>
                <div class="gestao-commercial-finance-metric ${isClosed ? 'bg-emerald-50 border-emerald-100' : 'bg-indigo-50 border-indigo-100'} border rounded-lg p-3">
                    <span class="block text-[10px] font-semibold uppercase ${isClosed ? 'text-emerald-600' : 'text-indigo-500'}">Status</span>
                    <strong class="text-sm ${isClosed ? 'text-emerald-800' : 'text-indigo-900'}">${isClosed ? 'Mês fechado' : 'Aberto'}</strong>
                </div>
            </div>
            ${isClosed ? `
                <p class="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    As vendas deste mês estão bloqueadas para edição. Use <strong>Reabrir mês</strong> para permitir alterações; os registros de comissão serão removidos.
                </p>
            ` : ''}
            <div class="flex justify-end gap-2">
                ${isClosed ? `
                    <button type="button" id="gestao-commercial-finance-reopen-month-btn"
                        class="text-xs bg-white border border-amber-300 text-amber-800 px-4 py-2 rounded-lg font-medium hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        ${!gestaoCommercialFinanceCommissionCloseSchemaReady ? 'disabled' : ''}>
                        Reabrir mês
                    </button>
                ` : `
                    <button type="button" id="gestao-commercial-finance-close-month-btn"
                        class="text-xs bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        ${!gestaoCommercialFinanceCommissionCloseSchemaReady ? 'disabled' : ''}>
                        Fechar mês
                    </button>
                `}
            </div>
        </section>
    `;
}

function renderGestaoCommercialFinanceVendas(orders = [], filters = {}) {
    const monthFilter = filters.yearMonth || '';
    const consultantFilter = String(filters.consultantName || '').trim().toLowerCase();

    const filteredOrders = orders.filter(order => {
        const saleYearMonth = getCommercialFinanceYearMonthFromDate(order.saleDate);
        if (monthFilter && saleYearMonth !== monthFilter) return false;
        const consultantName = getOrderConsultantNameFromRecord(order).toLowerCase();
        if (consultantFilter && !consultantName.includes(consultantFilter)) return false;
        return true;
    });

    const rows = filteredOrders.map(order => {
        const paymentMethod = normalizeCommercialFinancePaymentMethod(order.paymentMethod);
        const clientInstallments = getCommercialFinanceOrderClientInstallments(order);
        const clientInstallmentCount = clientInstallments.length;
        const saleValue = getCommercialFinanceOrderSaleValue(order);
        const commissionConfirmed = isCommercialFinanceCommissionConfirmed(order);
        const isInstallment = paymentMethod === COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT;
        const installmentsConfigured = clientInstallmentCount > 0;
        const isMonthClosed = isCommercialFinanceOrderInClosedMonth(order);
        const rowClass = [
            'gestao-commercial-finance-sale-row',
            commissionConfirmed ? 'gestao-commercial-finance-sale-row--confirmed' : '',
            isMonthClosed ? 'gestao-commercial-finance-sale-row--locked' : ''
        ].filter(Boolean).join(' ');

        return `
            <tr class="${rowClass}" data-order-id="${Number(order.id)}" ${isMonthClosed ? 'data-month-closed="true"' : ''}>
                <td class="p-2 font-mono text-[11px]">${escapeHtml(order.orderCode || '—')}</td>
                <td class="p-2">${escapeHtml(formatGestaoDate(order.saleDate))}</td>
                <td class="p-2">${escapeHtml(getOrderClientName(order))}</td>
                <td class="p-2">${escapeHtml(getOrderConsultantNameFromRecord(order))}</td>
                <td class="p-2 text-right font-semibold">${escapeHtml(formatSaleValue(saleValue))}</td>
                <td class="p-2">
                    <select class="gestao-commercial-finance-payment-method w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
                        ${isMonthClosed ? 'disabled' : ''}>
                        <option value="${COMMERCIAL_FINANCE_PAYMENT_CASH}" ${paymentMethod === COMMERCIAL_FINANCE_PAYMENT_CASH ? 'selected' : ''}>À vista</option>
                        <option value="${COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT}" ${paymentMethod === COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT ? 'selected' : ''}>Parcelado</option>
                    </select>
                </td>
                <td class="p-2">
                    <button type="button"
                        class="gestao-commercial-finance-client-installments-btn text-xs bg-white border ${installmentsConfigured ? 'border-emerald-200 text-emerald-800' : 'border-amber-200 text-amber-800'} px-2 py-1 rounded-lg font-medium hover:bg-slate-50 disabled:opacity-50"
                        ${isInstallment && !isMonthClosed ? '' : 'disabled'}>
                        ${isInstallment
                            ? (installmentsConfigured ? `${clientInstallmentCount} parcela${clientInstallmentCount === 1 ? '' : 's'}` : 'Informar parcelas')
                            : 'Mês seguinte'}
                    </button>
                </td>
                <td class="p-2 text-center">
                    <label class="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                        <input type="checkbox" class="gestao-commercial-finance-commission-confirmed h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            ${commissionConfirmed ? 'checked' : ''} ${isMonthClosed ? 'disabled' : ''}>
                        Confirmar
                    </label>
                </td>
                <td class="p-2 text-right">
                    <button type="button" class="gestao-commercial-finance-save-sale text-xs bg-indigo-700 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        ${isMonthClosed ? 'disabled' : ''}>
                        ${isMonthClosed ? 'Fechado' : 'Salvar'}
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        ${renderCommercialFinanceVendasClosePanel(filters.closeYearMonth)}
        <section class="gestao-commercial-finance-card bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div>
                <h4 class="text-sm font-bold text-slate-900">Vendas</h4>
                <p class="text-xs text-slate-500 mt-1">
                    À vista: comissão paga no mês seguinte à venda. Parcelado: informe valor e mês de cada parcela do cliente (alíquota sempre do mês da venda).
                </p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                    <label for="gestao-commercial-finance-vendas-month" class="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Mês da venda</label>
                    <select id="gestao-commercial-finance-vendas-month" class="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                        <option value="" ${monthFilter ? '' : 'selected'}>Todos</option>
                        ${buildCommercialFinanceYearMonthOptions(monthFilter || getCommercialFinanceCurrentYearMonth(), 18, 2).map(option => `
                            <option value="${escapeHtml(option.value)}" ${option.value === monthFilter ? 'selected' : ''}>${escapeHtml(option.label)}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="md:col-span-2">
                    <label for="gestao-commercial-finance-vendas-consultant" class="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Consultor</label>
                    <input type="text" id="gestao-commercial-finance-vendas-consultant" class="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                        value="${escapeHtml(filters.consultantName || '')}" placeholder="Filtrar por consultor">
                </div>
            </div>
            <div class="gestao-commercial-finance-table-wrap overflow-x-auto border border-slate-200 rounded-lg">
                <table class="gestao-commercial-finance-table w-full text-xs">
                    <thead>
                        <tr class="bg-slate-50 text-slate-500">
                            <th class="p-2 text-left font-semibold">Pedido</th>
                            <th class="p-2 text-left font-semibold">Data venda</th>
                            <th class="p-2 text-left font-semibold">Cliente</th>
                            <th class="p-2 text-left font-semibold">Consultor</th>
                            <th class="p-2 text-right font-semibold">Valor</th>
                            <th class="p-2 text-left font-semibold">Pagamento</th>
                            <th class="p-2 text-left font-semibold">Parcelas cliente</th>
                            <th class="p-2 text-center font-semibold">Comissão</th>
                            <th class="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td colspan="9" class="p-6 text-center text-slate-400">Nenhuma venda encontrada.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>
    `;
}

function renderCommercialFinanceAnnualSummaryTable(summary, year) {
    const { monthKeys, consultants, monthTotals, yearTotal } = summary;

    if (!consultants.length) {
        return '<p class="text-xs text-slate-400">Nenhuma comissão fechada para este ano.</p>';
    }

    const headerCells = monthKeys.map(monthKey => `
        <th class="p-2 text-right font-semibold whitespace-nowrap">${escapeHtml(formatCommercialFinanceMonthShortName(monthKey.split('-')[1]))}</th>
    `).join('');

    const bodyRows = consultants.map(consultant => `
        <tr>
            <td class="p-2 font-semibold text-slate-800 whitespace-nowrap">${escapeHtml(consultant.consultantName)}</td>
            ${monthKeys.map(monthKey => {
                const value = consultant.totalsByMonth[monthKey] || 0;
                return `<td class="p-2 text-right ${value ? 'text-slate-800' : 'text-slate-300'}">${value ? escapeHtml(formatSaleValue(value)) : '—'}</td>`;
            }).join('')}
            <td class="p-2 text-right font-semibold text-indigo-800">${escapeHtml(formatSaleValue(consultant.yearTotal))}</td>
        </tr>
    `).join('');

    const totalRow = `
        <tr class="bg-slate-50 font-semibold">
            <td class="p-2 text-slate-800">Total</td>
            ${monthKeys.map(monthKey => {
                const value = monthTotals[monthKey] || 0;
                return `<td class="p-2 text-right text-slate-800">${value ? escapeHtml(formatSaleValue(value)) : '—'}</td>`;
            }).join('')}
            <td class="p-2 text-right text-indigo-900">${escapeHtml(formatSaleValue(yearTotal))}</td>
        </tr>
    `;

    return `
        <div class="gestao-commercial-finance-table-wrap overflow-x-auto border border-slate-200 rounded-lg">
            <table class="gestao-commercial-finance-table gestao-commercial-finance-summary-matrix w-full text-xs">
                <thead>
                    <tr class="bg-slate-50 text-slate-500">
                        <th class="p-2 text-left font-semibold sticky left-0 bg-slate-50 z-10">Vendedor</th>
                        ${headerCells}
                        <th class="p-2 text-right font-semibold">Total ${escapeHtml(String(year))}</th>
                    </tr>
                </thead>
                <tbody>
                    ${bodyRows}
                    ${totalRow}
                </tbody>
            </table>
        </div>
    `;
}

function renderCommercialFinanceCommissionDetailMonthCell(cell = {}) {
    const clientAmount = roundCommercialFinanceMoney(cell.clientInstallmentAmount);
    const commissionAmount = roundCommercialFinanceMoney(cell.commissionAmount);
    if (clientAmount <= 0 && commissionAmount <= 0) {
        return '<span class="text-slate-300">—</span>';
    }

    return `
        <div class="commercial-finance-detail-month-cell">
            <div class="commercial-finance-detail-month-cell__client">${escapeHtml(formatSaleValue(clientAmount))}</div>
            <div class="commercial-finance-detail-month-cell__commission">${escapeHtml(formatSaleValue(commissionAmount))}</div>
        </div>
    `;
}

function renderCommercialFinanceCommissionDetailTable(matrix = {}, saleYearMonth = '') {
    const { monthKeys = [], rows = [], monthTotals = {} } = matrix;
    const visibleRows = filterCommercialFinanceCommissionDetailRows(rows, saleYearMonth);
    const fixedColumnCount = 6;
    const totalColumnCount = fixedColumnCount + monthKeys.length;

    const monthHeaderCells = monthKeys.map(monthKey => `
        <th class="p-2 text-right font-semibold whitespace-nowrap">${escapeHtml(formatCommercialFinanceMonthShortName(monthKey.split('-')[1]))}</th>
    `).join('');

    const bodyRows = visibleRows.map(row => `
        <tr>
            <td class="p-2 whitespace-nowrap">${escapeHtml(formatGestaoDate(row.saleDate))}</td>
            <td class="p-2 font-mono text-[11px] whitespace-nowrap">${escapeHtml(row.orderCode || '—')}</td>
            <td class="p-2 whitespace-nowrap">${escapeHtml(row.clientName || '—')}</td>
            <td class="p-2 whitespace-nowrap">${escapeHtml(row.consultantName || '—')}</td>
            <td class="p-2 text-right whitespace-nowrap">${escapeHtml(formatSaleValue(row.saleValue))}</td>
            <td class="p-2 text-right whitespace-nowrap">${escapeHtml(formatCommercialFinanceRatePercent(row.ratePercent))}</td>
            ${monthKeys.map(monthKey => `
                <td class="p-2 text-right align-top commercial-finance-detail-month-cell-td">
                    ${renderCommercialFinanceCommissionDetailMonthCell(row.months?.[monthKey])}
                </td>
            `).join('')}
        </tr>
    `).join('');

    const footerRow = visibleRows.length ? `
        <tr class="bg-indigo-50 text-indigo-900 font-semibold">
            <td class="p-2" colspan="${fixedColumnCount}">Total${saleYearMonth ? ` — ${escapeHtml(formatCommercialFinanceYearMonthLabel(saleYearMonth))}` : ''}</td>
            ${monthKeys.map(monthKey => `
                <td class="p-2 text-right align-top commercial-finance-detail-month-cell-td">
                    ${renderCommercialFinanceCommissionDetailMonthCell(monthTotals[monthKey])}
                </td>
            `).join('')}
        </tr>
    ` : '';

    return `
        <div class="gestao-commercial-finance-table-wrap overflow-x-auto border border-slate-200 rounded-lg">
            <table class="gestao-commercial-finance-table gestao-commercial-finance-detail-matrix w-full text-xs">
                <thead>
                    <tr class="bg-slate-50 text-slate-500">
                        <th class="p-2 text-left font-semibold whitespace-nowrap">Data Venda</th>
                        <th class="p-2 text-left font-semibold whitespace-nowrap">Pedido</th>
                        <th class="p-2 text-left font-semibold whitespace-nowrap">Cliente</th>
                        <th class="p-2 text-left font-semibold whitespace-nowrap">Vendedor</th>
                        <th class="p-2 text-right font-semibold whitespace-nowrap">Valor venda</th>
                        <th class="p-2 text-right font-semibold whitespace-nowrap">Alíquota</th>
                        ${monthHeaderCells}
                    </tr>
                </thead>
                <tbody>
                    ${bodyRows || `<tr><td colspan="${totalColumnCount}" class="p-6 text-center text-slate-400">Nenhum registro para os filtros selecionados.</td></tr>`}
                </tbody>
                ${footerRow ? `<tfoot>${footerRow}</tfoot>` : ''}
            </table>
        </div>
        <p class="text-[10px] text-slate-400 mt-2">
            Em cada mês: valor da parcela do cliente (acima) e comissão a pagar (abaixo).
        </p>
    `;
}

function formatCommercialFinanceCommissionDetailTitle(saleYearMonth, year) {
    if (!saleYearMonth) {
        return `Todas as vendas de ${year}`;
    }
    return `Vendas de ${formatCommercialFinanceYearMonthLabel(saleYearMonth)}`;
}

function renderGestaoCommercialFinanceComissao(entries = [], filters = {}) {
    const year = Number(filters.year) || gestaoCommercialFinanceComissaoYear;
    const saleYearMonth = filters.saleYearMonth !== undefined
        ? filters.saleYearMonth
        : gestaoCommercialFinanceComissaoMonth;
    const yearEntries = filterCommercialFinanceCommissionEntriesByYear(entries, year);
    const annualSummary = buildCommercialFinanceAnnualConsultantSummary(yearEntries, year);
    const detailMatrix = buildCommercialFinanceCommissionDetailMatrix(yearEntries, year);
    const detailRowCount = filterCommercialFinanceCommissionDetailRows(
        detailMatrix.rows,
        saleYearMonth
    ).length;

    return `
        <div class="space-y-4">
            <section class="gestao-commercial-finance-card bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 class="text-sm font-bold text-slate-900">Comissão de Venda</h4>
                <p class="text-xs text-slate-500">
                    Registros gerados ao fechar o mês em <strong>Vendas</strong>. Resumo anual por consultor e detalhamento no formato da planilha.
                </p>
                ${!gestaoCommercialFinanceCommissionCloseSchemaReady ? `
                    <p class="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        Execute <code>supabase/feats/create-sales-commission-close-tables.sql</code> no Supabase SQL Editor.
                    </p>
                ` : ''}
            </section>

            <section class="gestao-commercial-finance-card bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <h5 class="text-xs font-bold text-slate-800">Resumo ${escapeHtml(String(year))} por consultor</h5>
                ${renderCommercialFinanceAnnualSummaryTable(annualSummary, year)}
            </section>

            <section class="gestao-commercial-finance-card bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                <div class="flex flex-wrap gap-2">
                    <div>
                        <label for="gestao-commercial-finance-comissao-year" class="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Ano</label>
                        <select id="gestao-commercial-finance-comissao-year" class="w-28 px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                            ${Array.from({ length: 5 }, (_, index) => {
                                const optionYear = year - 2 + index;
                                return `<option value="${optionYear}" ${optionYear === year ? 'selected' : ''}>${optionYear}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div>
                        <label for="gestao-commercial-finance-comissao-month" class="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Mês da venda</label>
                        <select id="gestao-commercial-finance-comissao-month" class="w-44 px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                            <option value="" ${saleYearMonth === '' ? 'selected' : ''}>Todos os meses</option>
                            ${Array.from({ length: 12 }, (_, index) => {
                                const monthKey = buildCommercialFinanceYearMonthKey(year, index + 1);
                                return `
                                    <option value="${escapeHtml(monthKey)}" ${monthKey === saleYearMonth ? 'selected' : ''}>
                                        ${escapeHtml(formatCommercialFinanceYearMonthLabel(monthKey))}
                                    </option>
                                `;
                            }).join('')}
                        </select>
                    </div>
                </div>
            </section>

            <section class="gestao-commercial-finance-card bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <h5 class="text-xs font-bold text-slate-800">Detalhamento — ${escapeHtml(formatCommercialFinanceCommissionDetailTitle(saleYearMonth, year))}</h5>
                    <span class="text-[10px] text-slate-400">${detailRowCount} venda${detailRowCount === 1 ? '' : 's'}</span>
                </div>
                ${renderCommercialFinanceCommissionDetailTable(detailMatrix, saleYearMonth)}
            </section>
        </div>
    `;
}

async function loadGestaoCommercialFinanceMetaVenda(options = {}) {
    if (options.year != null) {
        gestaoCommercialFinanceMetaYear = Number(options.year);
    }
    if (options.yearMonth !== undefined) {
        gestaoCommercialFinanceMetaSelectedYearMonth = options.yearMonth;
        if (options.yearMonth) {
            gestaoCommercialFinanceMetaYear = Number(String(options.yearMonth).split('-')[0]);
        }
    }

    await Promise.all([
        fetchCommercialFinanceMonthlyTargets(),
        fetchCommercialFinanceOrders()
    ]);

    let editorTarget = null;
    if (gestaoCommercialFinanceMetaSelectedYearMonth) {
        editorTarget = gestaoCommercialFinanceTargetsByYearMonth[gestaoCommercialFinanceMetaSelectedYearMonth] || null;
        if (!editorTarget) {
            const { data, error } = await fetchCommercialFinanceMonthlyTarget(gestaoCommercialFinanceMetaSelectedYearMonth);
            if (error) {
                alertAppDialog(error.message || 'Não foi possível carregar a meta do mês.', { variant: 'warning', title: 'Aviso' });
            } else {
                editorTarget = data;
            }
        }
    }

    const content = document.getElementById('gestao-commercial-finance-content');
    if (!content) return;
    content.innerHTML = renderGestaoCommercialFinanceMetaVendaView(
        editorTarget,
        gestaoCommercialFinanceOrdersCache
    );
    bindCommercialFinanceMetaCurrencyInputs(content);
}

async function loadGestaoCommercialFinanceVendas() {
    const filters = {
        yearMonth: document.getElementById('gestao-commercial-finance-vendas-month')?.value
            ?? getCommercialFinanceCurrentYearMonth(),
        consultantName: document.getElementById('gestao-commercial-finance-vendas-consultant')?.value || '',
        closeYearMonth: document.getElementById('gestao-commercial-finance-close-month')?.value
            || getCommercialFinanceCurrentYearMonth()
    };
    await Promise.all([
        fetchCommercialFinanceOrders(),
        fetchCommercialFinanceClosedSaleMonths()
    ]);
    const content = document.getElementById('gestao-commercial-finance-content');
    if (!content) return;
    content.innerHTML = renderGestaoCommercialFinanceVendas(gestaoCommercialFinanceOrdersCache, filters);
    bindGestaoCommercialFinanceVendasEvents();
}

async function loadGestaoCommercialFinanceComissao() {
    const year = Number(document.getElementById('gestao-commercial-finance-comissao-year')?.value)
        || gestaoCommercialFinanceComissaoYear;
    const monthSelect = document.getElementById('gestao-commercial-finance-comissao-month');
    const saleYearMonth = monthSelect
        ? monthSelect.value
        : gestaoCommercialFinanceComissaoMonth;

    gestaoCommercialFinanceComissaoYear = year;
    if (saleYearMonth === '') {
        gestaoCommercialFinanceComissaoMonth = '';
    } else {
        gestaoCommercialFinanceComissaoMonth = saleYearMonth.startsWith(`${year}-`)
            ? saleYearMonth
            : buildCommercialFinanceYearMonthKey(year, 1);
    }

    const { data: entries, error } = await fetchCommercialFinanceCommissionEntries({ year });
    if (error) {
        const content = document.getElementById('gestao-commercial-finance-content');
        if (content) {
            content.innerHTML = `<p class="text-xs text-red-500 text-center py-10">Erro ao carregar comissões: ${escapeHtml(error.message)}</p>`;
        }
        return;
    }

    const content = document.getElementById('gestao-commercial-finance-content');
    if (!content) return;
    content.innerHTML = renderGestaoCommercialFinanceComissao(entries, {
        year,
        saleYearMonth: gestaoCommercialFinanceComissaoMonth
    });
    bindGestaoCommercialFinanceComissaoEvents();
}

async function loadGestaoCommercialFinance(screen = gestaoCommercialFinanceActiveScreen) {
    if (!assertGestaoCommercialFinanceAccess()) return;

    gestaoCommercialFinanceActiveScreen = screen;
    const content = document.getElementById('gestao-commercial-finance-content');
    if (!content) return;

    content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando...</p>';

    if (screen === 'meta-venda') {
        await loadGestaoCommercialFinanceMetaVenda();
        return;
    }
    if (screen === 'vendas') {
        await loadGestaoCommercialFinanceVendas();
        return;
    }
    if (screen === 'comissao-venda') {
        await loadGestaoCommercialFinanceComissao();
    }
}

function showGestaoCommercialFinanceiroPanel(screen = 'meta-venda') {
    if (!assertGestaoCommercialFinanceAccess()) {
        if (typeof showGestaoPedidoListPanel === 'function') {
            showGestaoPedidoListPanel();
        }
        return;
    }

    hideAllGestaoPanels();
    document.getElementById('gestao-comercial-financeiro-panel')?.classList.remove('hidden');
    setGestaoNavActive(`comercial-${screen}`);
    setGestaoCommercialFinanceNavExpanded(true);
    loadGestaoCommercialFinance(screen);
}

function bindGestaoCommercialFinanceVendasEvents() {
    document.getElementById('gestao-commercial-finance-vendas-month')?.addEventListener('change', loadGestaoCommercialFinanceVendas);
    document.getElementById('gestao-commercial-finance-vendas-consultant')?.addEventListener('change', loadGestaoCommercialFinanceVendas);
    document.getElementById('gestao-commercial-finance-close-month')?.addEventListener('change', loadGestaoCommercialFinanceVendas);
    document.getElementById('gestao-commercial-finance-vendas-consultant')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loadGestaoCommercialFinanceVendas();
        }
    });
}

function bindGestaoCommercialFinanceComissaoEvents() {
    document.getElementById('gestao-commercial-finance-comissao-year')?.addEventListener('change', () => {
        const year = Number(document.getElementById('gestao-commercial-finance-comissao-year')?.value)
            || gestaoCommercialFinanceComissaoYear;
        const currentMonth = document.getElementById('gestao-commercial-finance-comissao-month')?.value;
        if (currentMonth === '') {
            gestaoCommercialFinanceComissaoMonth = '';
        } else {
            const monthNumber = Number(String(currentMonth || '').split('-')[1]) || 1;
            gestaoCommercialFinanceComissaoMonth = buildCommercialFinanceYearMonthKey(year, monthNumber);
        }
        loadGestaoCommercialFinanceComissao();
    });
    document.getElementById('gestao-commercial-finance-comissao-month')?.addEventListener('change', loadGestaoCommercialFinanceComissao);
}

function bindGestaoCommercialFinanceEvents() {
    if (gestaoCommercialFinanceMetaEventsBound) return;
    gestaoCommercialFinanceMetaEventsBound = true;

    document.getElementById('gestao-nav-comercial-financeiro-toggle')?.addEventListener('click', () => {
        const items = document.getElementById('gestao-nav-comercial-financeiro-items');
        const expanded = items?.classList.contains('hidden');
        setGestaoCommercialFinanceNavExpanded(expanded);
    });

    document.getElementById('gestao-nav-comercial-meta-venda')?.addEventListener('click', () => {
        showGestaoCommercialFinanceiroPanel('meta-venda');
    });
    document.getElementById('gestao-nav-comercial-vendas')?.addEventListener('click', () => {
        showGestaoCommercialFinanceiroPanel('vendas');
    });
    document.getElementById('gestao-nav-comercial-comissao')?.addEventListener('click', () => {
        showGestaoCommercialFinanceiroPanel('comissao-venda');
    });
    document.getElementById('btn-gestao-comercial-financeiro-refresh')?.addEventListener('click', () => {
        loadGestaoCommercialFinance(gestaoCommercialFinanceActiveScreen);
    });

    document.getElementById('gestao-commercial-finance-content')?.addEventListener('click', async (event) => {
        const monthCard = event.target.closest('.gestao-commercial-finance-meta-month-card');
        if (monthCard?.dataset.yearMonth) {
            await loadGestaoCommercialFinanceMetaVenda({ yearMonth: monthCard.dataset.yearMonth });
            return;
        }

        if (event.target.closest('#gestao-commercial-finance-meta-prev-year')) {
            await loadGestaoCommercialFinanceMetaVenda({ year: gestaoCommercialFinanceMetaYear - 1, yearMonth: null });
            return;
        }

        if (event.target.closest('#gestao-commercial-finance-meta-next-year')) {
            await loadGestaoCommercialFinanceMetaVenda({ year: gestaoCommercialFinanceMetaYear + 1, yearMonth: null });
            return;
        }

        if (event.target.closest('#gestao-commercial-finance-meta-close-editor')) {
            await loadGestaoCommercialFinanceMetaVenda({ yearMonth: null });
            return;
        }

        const restoreDefaultTiersButton = event.target.closest('#gestao-commercial-finance-restore-default-tiers');
        if (restoreDefaultTiersButton) {
            replaceCommercialFinanceTierRows(getCommercialFinanceDefaultMetaTiers());
            return;
        }

        const copyTiersButton = event.target.closest('#gestao-commercial-finance-copy-tiers-prev');
        if (copyTiersButton) {
            const previousYearMonth = copyTiersButton.dataset.previousYearMonth;
            const previousTiers = gestaoCommercialFinanceTargetsByYearMonth[previousYearMonth]?.tiers || [];
            if (!previousTiers.length) {
                alertAppDialog('Não há faixas no mês anterior para copiar.', { variant: 'warning', title: 'Aviso' });
                return;
            }
            replaceCommercialFinanceTierRows(previousTiers.map(tier => ({ ...tier })));
            return;
        }

        const addTierButton = event.target.closest('#gestao-commercial-finance-add-tier');
        if (addTierButton) {
            const tbody = document.getElementById('gestao-commercial-finance-tier-rows');
            if (!tbody) return;
            const index = tbody.querySelectorAll('.gestao-commercial-finance-tier-row').length;
            tbody.insertAdjacentHTML('beforeend', renderCommercialFinanceTierRow({}, index));
            bindCommercialFinanceMetaCurrencyInputs(tbody.closest('#gestao-commercial-finance-meta-form') || document);
            return;
        }

        const removeTierButton = event.target.closest('.gestao-commercial-finance-remove-tier');
        if (removeTierButton) {
            removeTierButton.closest('.gestao-commercial-finance-tier-row')?.remove();
            return;
        }

        const reopenMonthButton = event.target.closest('#gestao-commercial-finance-reopen-month-btn');
        if (reopenMonthButton) {
            const saleYearMonth = document.getElementById('gestao-commercial-finance-close-month')?.value
                || getCommercialFinanceCurrentYearMonth();
            const monthLabel = formatCommercialFinanceYearMonthLabel(saleYearMonth);
            const confirmed = typeof confirmAppDialog === 'function'
                ? await confirmAppDialog(
                    `Reabrir ${monthLabel}? Os registros de comissão deste mês serão removidos e as vendas voltarão a ficar editáveis.`,
                    { title: 'Reabrir mês de vendas', confirmLabel: 'Reabrir mês' }
                )
                : window.confirm(`Reabrir ${monthLabel}?`);
            if (!confirmed) return;

            reopenMonthButton.disabled = true;
            reopenMonthButton.textContent = 'Reabrindo...';
            const result = await reopenCommercialFinanceSaleMonth(saleYearMonth);
            reopenMonthButton.disabled = false;
            reopenMonthButton.textContent = 'Reabrir mês';

            if (!result.ok) {
                alertAppDialog(result.message || 'Não foi possível reabrir o mês.', { variant: 'warning', title: 'Aviso' });
                return;
            }

            alertAppDialog(
                `${monthLabel} reaberto. As vendas do mês podem ser alteradas novamente.`,
                { variant: 'success', title: 'Sucesso' }
            );
            await loadGestaoCommercialFinanceVendas();
            return;
        }

        const closeMonthButton = event.target.closest('#gestao-commercial-finance-close-month-btn');
        if (closeMonthButton) {
            const saleYearMonth = document.getElementById('gestao-commercial-finance-close-month')?.value
                || getCommercialFinanceCurrentYearMonth();
            const monthLabel = formatCommercialFinanceYearMonthLabel(saleYearMonth);
            const confirmed = typeof confirmAppDialog === 'function'
                ? await confirmAppDialog(
                    `Fechar ${monthLabel}? Serão gerados os registros de comissão (pedido a pedido e parcela a parcela).`,
                    { title: 'Fechar mês de vendas', confirmLabel: 'Fechar mês' }
                )
                : window.confirm(`Fechar ${monthLabel}?`);
            if (!confirmed) return;

            closeMonthButton.disabled = true;
            closeMonthButton.textContent = 'Fechando...';
            const result = await closeCommercialFinanceSaleMonth(saleYearMonth);
            closeMonthButton.disabled = false;
            closeMonthButton.textContent = 'Fechar mês';

            if (!result.ok) {
                alertAppDialog(result.message || 'Não foi possível fechar o mês.', { variant: 'warning', title: 'Aviso' });
                return;
            }

            alertAppDialog(
                `Mês fechado com ${result.entryCount} registro(s) de comissão.`,
                { variant: 'success', title: 'Sucesso' }
            );
            await loadGestaoCommercialFinanceVendas();
            return;
        }

        const clientInstallmentsButton = event.target.closest('.gestao-commercial-finance-client-installments-btn');
        if (clientInstallmentsButton && !clientInstallmentsButton.disabled) {
            const row = clientInstallmentsButton.closest('.gestao-commercial-finance-sale-row');
            const orderId = Number(row?.dataset.orderId);
            if (!orderId) return;
            openCommercialFinanceClientInstallmentsModal(orderId);
            return;
        }

        const button = event.target.closest('.gestao-commercial-finance-save-sale');
        if (!button || button.disabled) return;
        const row = button.closest('.gestao-commercial-finance-sale-row');
        const orderId = Number(row?.dataset.orderId);
        if (!orderId) return;
        if (row?.dataset.monthClosed === 'true') return;

        const paymentMethod = row.querySelector('.gestao-commercial-finance-payment-method')?.value;
        const cachedOrder = gestaoCommercialFinanceOrdersCache.find(order => Number(order.id) === orderId);
        const installmentCount = getCommercialFinanceOrderClientInstallments(cachedOrder).length || 1;
        const commissionConfirmed = Boolean(row.querySelector('.gestao-commercial-finance-commission-confirmed')?.checked);
        const isMonthClosed = isCommercialFinanceOrderInClosedMonth(cachedOrder);
        button.disabled = true;
        button.textContent = 'Salvando...';

        const result = await persistCommercialFinanceOrderPayment(
            orderId,
            paymentMethod,
            installmentCount,
            commissionConfirmed
        );
        button.disabled = isMonthClosed;
        button.textContent = isMonthClosed ? 'Fechado' : 'Salvar';

        if (!result.ok) {
            alertAppDialog(result.message || 'Não foi possível salvar.', { variant: 'warning', title: 'Aviso' });
            return;
        }
        row.classList.toggle('gestao-commercial-finance-sale-row--confirmed', commissionConfirmed);
        button.textContent = 'Salvo!';
        window.setTimeout(() => {
            button.textContent = isMonthClosed ? 'Fechado' : 'Salvar';
        }, 1200);
    });

    document.getElementById('gestao-commercial-finance-content')?.addEventListener('submit', async (event) => {
        const form = event.target.closest('#gestao-commercial-finance-meta-form');
        if (!form) return;
        event.preventDefault();

        const yearMonth = form.dataset.yearMonth;
        const targetAmount = document.getElementById('gestao-commercial-finance-meta-amount')?.value;
        const tiers = readCommercialFinanceTierRows();
        const submitButton = form.querySelector('[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Salvando...';
        }

        const result = await saveCommercialFinanceMonthlyTarget(yearMonth, targetAmount, tiers);

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Salvar meta';
        }

        if (!result.ok) {
            alertAppDialog(result.message || 'Não foi possível salvar a meta.', { variant: 'warning', title: 'Aviso' });
            return;
        }

        alertAppDialog('Meta salva com sucesso.', { variant: 'success', title: 'Sucesso' });
        await loadGestaoCommercialFinanceMetaVenda({ yearMonth });
    });

    document.getElementById('gestao-commercial-finance-content')?.addEventListener('change', (event) => {
        const select = event.target.closest('.gestao-commercial-finance-payment-method');
        if (!select || select.disabled) return;
        const row = select.closest('.gestao-commercial-finance-sale-row');
        if (row?.dataset.monthClosed === 'true') return;
        const installmentsButton = row?.querySelector('.gestao-commercial-finance-client-installments-btn');
        if (!installmentsButton) return;
        const isInstallment = select.value === COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT;
        installmentsButton.disabled = !isInstallment;
        installmentsButton.textContent = isInstallment ? 'Informar parcelas' : 'Mês seguinte';
        installmentsButton.classList.remove('border-emerald-200', 'text-emerald-800', 'border-amber-200', 'text-amber-800');
        installmentsButton.classList.add(isInstallment ? 'border-amber-200' : 'border-slate-200', isInstallment ? 'text-amber-800' : 'text-slate-500');
        if (isInstallment) {
            const orderId = Number(row?.dataset.orderId);
            if (orderId) {
                window.setTimeout(() => openCommercialFinanceClientInstallmentsModal(orderId), 0);
            }
        }
    });

    document.getElementById('commercial-finance-client-installments-add-row')?.addEventListener('click', () => {
        const order = gestaoCommercialFinanceOrdersCache.find(item =>
            Number(item.id) === Number(gestaoCommercialFinanceClientInstallmentsModalOrderId)
        );
        if (!order) return;
        const installments = readCommercialFinanceClientInstallmentModalRows();
        const remainingAmount = getCommercialFinanceRemainingClientInstallmentAmount(order, installments);
        installments.push({
            clientInstallmentAmount: remainingAmount > 0 ? remainingAmount : '',
            paymentYearMonth: ''
        });
        replaceCommercialFinanceClientInstallmentModalRows(order, installments);
    });

    document.getElementById('commercial-finance-client-installments-rows')?.addEventListener('click', (event) => {
        const removeButton = event.target.closest('.commercial-finance-client-installment-remove');
        if (!removeButton) return;
        const order = gestaoCommercialFinanceOrdersCache.find(item =>
            Number(item.id) === Number(gestaoCommercialFinanceClientInstallmentsModalOrderId)
        );
        if (!order) return;
        const row = removeButton.closest('.commercial-finance-client-installment-row');
        const rowIndex = Array.from(document.querySelectorAll('.commercial-finance-client-installment-row')).indexOf(row);
        const installments = readCommercialFinanceClientInstallmentModalRows().filter((_, index) =>
            index !== rowIndex
        );
        replaceCommercialFinanceClientInstallmentModalRows(
            order,
            installments.length ? installments : [{ clientInstallmentAmount: '', paymentYearMonth: '' }]
        );
    });

    document.getElementById('commercial-finance-client-installments-cancel')?.addEventListener('click', () => {
        toggleModal('commercial-finance-client-installments-modal', false);
        gestaoCommercialFinanceClientInstallmentsModalOrderId = null;
    });

    document.getElementById('commercial-finance-client-installments-save')?.addEventListener('click', () => {
        saveCommercialFinanceClientInstallmentsFromModal();
    });
}
