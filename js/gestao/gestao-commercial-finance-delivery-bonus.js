const COMMERCIAL_FINANCE_DELIVERY_ENTREGUE_STATUS = 'Entregue';

async function fetchOrderProjectsForDeliveryCompletion(orderId) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return [];

    const selectWithStatus = 'id, orderId, isReplaced, replacedByProjectId, projectStatus:OrderProjectStatus(id, name)';
    let result = await supabaseClient
        .from('OrderProject')
        .select(selectWithStatus)
        .eq('orderId', normalizedOrderId);

    if (result.error?.message?.includes('projectStatus')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, isReplaced, replacedByProjectId, statusId')
            .eq('orderId', normalizedOrderId);
    }

    if (result.error || !result.data?.length) {
        return [];
    }

    const projects = result.data;
    const needsStatus = projects.some(project => !project.projectStatus?.name && project.statusId);
    if (!needsStatus) {
        return projects;
    }

    const statusIds = [...new Set(projects.map(project => project.statusId).filter(Boolean))];
    const { data: statuses } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name')
        .in('id', statusIds);

    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
    return projects.map(project => ({
        ...project,
        projectStatus: project.projectStatus || statusById[project.statusId] || null
    }));
}

function isOrderProjectStatusEntregue(project) {
    const statusName = typeof getOrderProjectStatusName === 'function'
        ? getOrderProjectStatusName(project)
        : (project?.projectStatus?.name || '');
    return String(statusName).trim() === COMMERCIAL_FINANCE_DELIVERY_ENTREGUE_STATUS;
}

function isSalesOrderFullyDelivered(projects = []) {
    if (!projects.length) {
        return false;
    }
    return projects.every(project => isOrderProjectStatusEntregue(project));
}

async function getOrderProjectStatusIdByNameEntrega(statusName) {
    if (typeof getPendenciasStatusIdByName === 'function') {
        return getPendenciasStatusIdByName(statusName);
    }
    if (typeof getOrderProjectStatusIdByName === 'function') {
        return getOrderProjectStatusIdByName(statusName);
    }

    const { data } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', statusName)
        .maybeSingle();

    return data?.id || null;
}

async function propagateReplacedProjectsDelivered(deliveredProjectIds = []) {
    const normalizedIds = [...new Set((deliveredProjectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!normalizedIds.length) {
        return [];
    }

    const { data: replacedProjects, error } = await supabaseClient
        .from('OrderProject')
        .select('id, orderId, isReplaced, replacedByProjectId, statusId, projectStatus:OrderProjectStatus(name)')
        .in('replacedByProjectId', normalizedIds)
        .eq('isReplaced', true);

    if (error || !replacedProjects?.length) {
        return [];
    }

    const entregueStatusId = await getOrderProjectStatusIdByNameEntrega(COMMERCIAL_FINANCE_DELIVERY_ENTREGUE_STATUS);
    if (!entregueStatusId) {
        console.warn('propagateReplacedProjectsDelivered: status Entregue não encontrado.');
        return [];
    }

    const toUpdate = replacedProjects.filter(project => !isOrderProjectStatusEntregue(project));
    if (!toUpdate.length) {
        return [...new Set(replacedProjects.map(project => Number(project.orderId)).filter(Boolean))];
    }

    const now = new Date().toISOString();
    const updatePayload = {
        statusId: entregueStatusId,
        updatedAt: now
    };
    if (currentUser?.id) {
        updatePayload.updatedById = currentUser.id;
    }

    const { error: updateError } = await supabaseClient
        .from('OrderProject')
        .update(updatePayload)
        .in('id', toUpdate.map(project => project.id));

    if (updateError) {
        console.warn('propagateReplacedProjectsDelivered:', updateError.message);
        return [];
    }

    return [...new Set(toUpdate.map(project => Number(project.orderId)).filter(Boolean))];
}

async function fetchCommercialFinanceConfirmedSaleByOrderId(orderId) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return null;

    const { data, error } = await supabaseClient
        .from('SalesCommissionSale')
        .select('id, salesOrderId, orderCode, saleDate, saleYearMonth, consultantUserId, clientName, saleValue, isImported, consultant:appUsers!consultantUserId(id, name)')
        .eq('salesOrderId', normalizedOrderId)
        .eq('isImported', true)
        .maybeSingle();

    if (error || !data) {
        return null;
    }

    return {
        ...data,
        consultantName: data.consultant?.name || data.consultantName || ''
    };
}

async function fetchCommercialFinanceMonthCloseId(saleYearMonth) {
    const { data, error } = await supabaseClient
        .from('SalesCommissionMonthClose')
        .select('id')
        .eq('saleYearMonth', saleYearMonth)
        .maybeSingle();

    if (error || !data?.id) {
        return null;
    }
    return Number(data.id);
}

async function fetchCommercialFinanceTeamSalesTotalForMonth(saleYearMonth) {
    const { data, error } = await supabaseClient
        .from('SalesCommissionSale')
        .select('saleYearMonth, saleDate, saleValue, isImported')
        .eq('saleYearMonth', saleYearMonth)
        .eq('isImported', true);

    if (error) {
        return 0;
    }

    return getCommercialFinanceTeamSalesInMonth(data || [], saleYearMonth);
}

async function fetchCommercialFinanceMonthlyTargetForBonus(saleYearMonth) {
    const { data, error } = await supabaseClient
        .from('SalesMonthlyTarget')
        .select('id, yearMonth, targetAmount, managerTargetBonusPercent')
        .eq('yearMonth', saleYearMonth)
        .maybeSingle();

    if (error || !data) {
        return null;
    }
    return data;
}

async function managerDeliveryBonusEntryExists(orderId) {
    const { data, error } = await supabaseClient
        .from('SalesCommissionEntry')
        .select('id')
        .eq('salesOrderId', Number(orderId))
        .eq('entryType', COMMERCIAL_FINANCE_ENTRY_TYPE_MANAGER_DELIVERY_BONUS)
        .limit(1)
        .maybeSingle();

    if (error) {
        return false;
    }
    return Boolean(data?.id);
}

function buildManagerDeliveryBonusEntryDraft(sale, target, managerUser, managerUserId, referenceYearMonth) {
    const bonusPercent = Number(target?.managerTargetBonusPercent) || 0;
    const saleValue = getCommercialFinanceImportedSaleValue(sale);
    const commissionAmount = roundCommercialFinanceMoney(saleValue * bonusPercent / 100);
    if (commissionAmount <= 0) {
        return null;
    }

    const saleYearMonth = sale.saleYearMonth || getCommercialFinanceYearMonthFromDate(sale.saleDate);
    const managerName = managerUser?.name || 'Gestor comercial';

    return {
        entryType: COMMERCIAL_FINANCE_ENTRY_TYPE_MANAGER_DELIVERY_BONUS,
        salesOrderId: Number(sale.salesOrderId) || null,
        consultantUserId: Number(managerUserId),
        saleDate: sale.saleDate,
        saleYearMonth,
        referenceYearMonth,
        orderCode: sale.orderCode || '',
        clientName: sale.clientName || '',
        consultantName: managerName,
        saleValue,
        clientInstallmentAmount: saleValue,
        commissionAmount,
        ratePercent: bonusPercent,
        installmentNumber: 1,
        installmentCount: 1
    };
}

async function tryCreateManagerDeliveryBonusForDeliveredOrder(orderId) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) {
        return { ok: false, reason: 'invalid_order' };
    }

    const projects = await fetchOrderProjectsForDeliveryCompletion(normalizedOrderId);
    if (!isSalesOrderFullyDelivered(projects)) {
        return { ok: false, reason: 'order_not_fully_delivered' };
    }

    const { data: orderRow, error: orderError } = await supabaseClient
        .from('salesOrders')
        .select('id, actualDeliveryDate, clientDeliveryDate')
        .eq('id', normalizedOrderId)
        .maybeSingle();

    if (orderError || !orderRow) {
        return { ok: false, reason: 'order_not_found' };
    }

    const deliveryDate = orderRow.actualDeliveryDate || orderRow.clientDeliveryDate;
    const deliveryYearMonth = getCommercialFinanceYearMonthFromDate(deliveryDate);
    if (!deliveryYearMonth) {
        return { ok: false, reason: 'missing_delivery_date' };
    }

    const referenceYearMonth = addCommercialFinanceMonths(deliveryYearMonth, 1);

    if (await managerDeliveryBonusEntryExists(normalizedOrderId)) {
        return { ok: false, reason: 'already_exists' };
    }

    const sale = await fetchCommercialFinanceConfirmedSaleByOrderId(normalizedOrderId);
    if (!sale) {
        return { ok: false, reason: 'sale_not_confirmed' };
    }

    const saleYearMonth = sale.saleYearMonth || getCommercialFinanceYearMonthFromDate(sale.saleDate);
    if (!saleYearMonth) {
        return { ok: false, reason: 'missing_sale_month' };
    }

    const monthCloseId = await fetchCommercialFinanceMonthCloseId(saleYearMonth);
    if (!monthCloseId) {
        return { ok: false, reason: 'sale_month_not_closed' };
    }

    const managerResult = typeof fetchCommercialFinanceManagerUser === 'function'
        ? await fetchCommercialFinanceManagerUser()
        : { data: null };
    const managerUser = managerResult.data;
    const managerUserId = managerUser?.id ? Number(managerUser.id) : null;
    if (!managerUserId) {
        return { ok: false, reason: 'no_manager' };
    }

    if (isCommercialFinanceManagerSale(sale, managerUserId)) {
        return { ok: false, reason: 'manager_own_sale' };
    }

    const target = await fetchCommercialFinanceMonthlyTargetForBonus(saleYearMonth);
    const bonusPercent = Number(target?.managerTargetBonusPercent) || 0;
    if (bonusPercent <= 0) {
        return { ok: false, reason: 'no_bonus_percent' };
    }

    const realizedAmount = await fetchCommercialFinanceTeamSalesTotalForMonth(saleYearMonth);
    if (!isCommercialFinanceMonthlyTargetAchieved(target?.targetAmount, realizedAmount)) {
        return { ok: false, reason: 'target_not_met' };
    }

    const draft = buildManagerDeliveryBonusEntryDraft(
        sale,
        target,
        managerUser,
        managerUserId,
        referenceYearMonth
    );
    if (!draft) {
        return { ok: false, reason: 'zero_commission' };
    }

    const payload = typeof mapCommercialFinanceCommissionEntryPayload === 'function'
        ? mapCommercialFinanceCommissionEntryPayload(draft, monthCloseId)
        : { ...draft, monthCloseId };

    const { error: insertError } = await supabaseClient
        .from('SalesCommissionEntry')
        .insert(payload);

    if (insertError) {
        if (/duplicate|unique|delivery_bonus_order_key/i.test(insertError.message || '')) {
            return { ok: false, reason: 'already_exists' };
        }
        console.warn('tryCreateManagerDeliveryBonusForDeliveredOrder:', insertError.message);
        return { ok: false, reason: 'insert_error', message: insertError.message };
    }

    return { ok: true, referenceYearMonth, saleYearMonth };
}

async function processManagerDeliveryBonusAfterEntrega(orderId, deliveredProjectIds = []) {
    const orderIdsToCheck = new Set([Number(orderId)].filter(Boolean));

    const relatedOrderIds = await propagateReplacedProjectsDelivered(deliveredProjectIds);
    relatedOrderIds.forEach(id => orderIdsToCheck.add(id));

    const results = [];
    for (const id of orderIdsToCheck) {
        const projects = await fetchOrderProjectsForDeliveryCompletion(id);
        if (!isSalesOrderFullyDelivered(projects)) {
            continue;
        }
        results.push({
            orderId: id,
            ...(await tryCreateManagerDeliveryBonusForDeliveredOrder(id))
        });
    }

    return results;
}

window.tryCreateManagerDeliveryBonusForDeliveredOrder = tryCreateManagerDeliveryBonusForDeliveredOrder;
window.processManagerDeliveryBonusAfterEntrega = processManagerDeliveryBonusAfterEntrega;
