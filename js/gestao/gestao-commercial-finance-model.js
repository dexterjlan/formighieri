const COMMERCIAL_FINANCE_PAYMENT_CASH = 'cash';
const COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT = 'installment';
const COMMERCIAL_FINANCE_ENTRY_TYPE_CONSULTANT = 'consultant';
const COMMERCIAL_FINANCE_ENTRY_TYPE_MANAGER_OWN = 'manager_own';
const COMMERCIAL_FINANCE_ENTRY_TYPE_MANAGER_TEAM = 'manager_team';
const COMMERCIAL_FINANCE_ENTRY_TYPE_MANAGER_DELIVERY_BONUS = 'manager_delivery_bonus';

function canAccessGestaoCommercialFinance(user = currentUser) {
    if (typeof isAdmin === 'function' && isAdmin(user)) {
        return true;
    }
    if (typeof isGestorComercial === 'function' && isGestorComercial(user)) {
        return true;
    }
    return user?.role === 'Admin';
}

function getCommercialFinanceYearMonthFromDate(dateStr) {
    const normalized = typeof normalizeIsoDateValue === 'function'
        ? normalizeIsoDateValue(dateStr)
        : String(dateStr || '').split('T')[0];
    if (!normalized || normalized.length < 7) return '';
    return normalized.slice(0, 7);
}

function getCommercialFinanceCurrentYearMonth() {
    const now = typeof getLocalIsoDate === 'function' ? getLocalIsoDate() : new Date().toISOString().slice(0, 10);
    return getCommercialFinanceYearMonthFromDate(now);
}

function addCommercialFinanceMonths(yearMonth, monthCount) {
    const [yearText, monthText] = String(yearMonth || '').split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return '';

    const date = new Date(year, month - 1 + monthCount, 1);
    const nextYear = date.getFullYear();
    const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
    return `${nextYear}-${nextMonth}`;
}

function formatCommercialFinanceYearMonthLabel(yearMonth) {
    if (!yearMonth) return '—';
    const [year, month] = String(yearMonth).split('-');
    if (!year || !month) return yearMonth;
    const date = new Date(Number(year), Number(month) - 1, 1);
    if (Number.isNaN(date.getTime())) return yearMonth;
    const label = date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    return label.replace('.', '');
}

function formatCommercialFinanceMonthShortName(monthNumber) {
    const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const index = Number(monthNumber) - 1;
    return labels[index] || '—';
}

function buildCommercialFinanceYearMonthKey(year, monthNumber) {
    return `${Number(year)}-${String(monthNumber).padStart(2, '0')}`;
}

function getCommercialFinancePreviousYearMonth(yearMonth) {
    return addCommercialFinanceMonths(yearMonth, -1);
}

function normalizeCommercialFinancePaymentMethod(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT || normalized === 'parcelado') {
        return COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT;
    }
    if (normalized === COMMERCIAL_FINANCE_PAYMENT_CASH || normalized === 'avista' || normalized === 'a_vista') {
        return COMMERCIAL_FINANCE_PAYMENT_CASH;
    }
    return COMMERCIAL_FINANCE_PAYMENT_CASH;
}

function getCommercialFinancePaymentMethodLabel(paymentMethod) {
    return paymentMethod === COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT ? 'Parcelado' : 'À vista';
}

function normalizeCommercialFinanceInstallmentCount(value, paymentMethod) {
    const count = Math.max(1, Math.round(Number(value) || 1));
    if (paymentMethod !== COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT) {
        return 1;
    }
    return count;
}

function isCommercialFinanceSaleImported(sale) {
    return Boolean(sale?.isImported);
}

function isCommercialFinanceCommissionConfirmed(record) {
    return Boolean(record?.isImported ?? record?.commissionConfirmed);
}

function filterCommercialFinanceCommissionSales(sales = []) {
    return (sales || []).filter(sale => isCommercialFinanceSaleImported(sale));
}

function filterCommercialFinanceCommissionOrders(orders = []) {
    return filterCommercialFinanceCommissionSales(orders);
}

function getCommercialFinanceImportedSaleValue(sale) {
    const value = Number(sale?.saleValue);
    return Number.isFinite(value) ? roundCommercialFinanceMoney(value) : 0;
}

function commercialFinanceSaleToCommissionRecord(sale) {
    if (!sale) return null;

    return {
        id: sale.salesOrderId || sale.id,
        salesOrderId: sale.salesOrderId || null,
        commissionSaleId: sale.id,
        orderCode: sale.orderCode || '',
        saleDate: sale.saleDate,
        saleYearMonth: sale.saleYearMonth || getCommercialFinanceYearMonthFromDate(sale.saleDate),
        consultantUserId: sale.consultantUserId,
        consultor: sale.consultant || { id: sale.consultantUserId, name: sale.consultantName || '' },
        client: { name: sale.clientName || '' },
        saleValue: getCommercialFinanceImportedSaleValue(sale),
        paymentMethod: sale.paymentMethod,
        installmentCount: sale.installmentCount,
        commissionCountsForTier: sale.countsForTier,
        commissionRateOverride: sale.rateOverride,
        commissionRatePercent: sale.importedRatePercent,
        isImported: sale.isImported,
        commissionConfirmed: sale.isImported,
        clientInstallments: sale.installments || [],
        source: sale.source || 'fgp_order'
    };
}

function mergeCommercialFinanceOrderWithSale(order, sale) {
    const defaults = {
        paymentMethod: COMMERCIAL_FINANCE_PAYMENT_CASH,
        installmentCount: 1,
        commissionCountsForTier: true,
        commissionRateOverride: null,
        commissionRatePercent: null,
        isImported: false,
        commissionConfirmed: false,
        clientInstallments: []
    };

    if (!order) {
        return sale ? commercialFinanceSaleToCommissionRecord(sale) : null;
    }

    if (!sale) {
        return { ...order, ...defaults };
    }

    const mappedSale = commercialFinanceSaleToCommissionRecord(sale);
    return {
        ...order,
        ...mappedSale,
        projects: order.projects,
        client: order.client || mappedSale.client,
        consultor: order.consultor || mappedSale.consultor
    };
}

function getCommercialFinanceRecordSaleValue(record) {
    if (record?.saleValue != null && (record.isImported || record.commissionSaleId)) {
        const importedValue = Number(record.saleValue);
        if (Number.isFinite(importedValue)) {
            return roundCommercialFinanceMoney(importedValue);
        }
    }
    return getCommercialFinanceOrderSaleValue(record);
}

function getCommercialFinanceOrderProjectSaleValue(project, projectsById = {}) {
    if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) {
        return 0;
    }
    if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) {
        return 0;
    }

    const baseValue = typeof getProjectEffectiveSaleValue === 'function'
        ? getProjectEffectiveSaleValue(project)
        : Number(project?.saleValue);
    const normalizedBase = Number.isFinite(Number(baseValue)) ? Number(baseValue) : 0;

    const childrenValue = Object.values(projectsById).reduce((sum, child) => {
        if (!child || typeof isComplementaryOrderProject !== 'function' || !isComplementaryOrderProject(child)) {
            return sum;
        }
        if (Number(child.parentProjectId) !== Number(project?.id)) return sum;
        const value = Number(child.saleValue);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    return roundCommercialFinanceMoney(normalizedBase + childrenValue);
}

function getCommercialFinanceOrderSaleValue(order) {
    const projects = Array.isArray(order?.projects) ? order.projects : [];
    const projectsById = Object.fromEntries(
        projects
            .map(project => [Number(project.id), project])
            .filter(([projectId]) => projectId)
    );

    return roundCommercialFinanceMoney(
        projects.reduce(
            (sum, project) => sum + getCommercialFinanceOrderProjectSaleValue(project, projectsById),
            0
        )
    );
}

function isCommercialFinanceHistoricalImportRecord(record) {
    return String(record?.source || '').trim() === 'historical_import';
}

function isCommercialFinanceImportedOnlyRecord(record) {
    if (!record?.commissionSaleId && !record?.isImported) {
        return false;
    }
    const salesOrderId = Number(record?.salesOrderId);
    if (!salesOrderId) {
        return Boolean(record?.commissionSaleId || record?.isImported);
    }
    return false;
}

function getCommercialFinanceRecordSaleYearMonth(record) {
    return record?.saleYearMonth || getCommercialFinanceYearMonthFromDate(record?.saleDate);
}

function filterCommercialFinanceVendasOrders(orders = [], filters = {}) {
    const monthFilter = filters.yearMonth || '';
    const consultantFilter = String(filters.consultantName || '').trim().toLowerCase();

    return (orders || []).filter(order => {
        const saleYearMonth = getCommercialFinanceRecordSaleYearMonth(order);
        if (monthFilter && saleYearMonth !== monthFilter) return false;

        const consultantName = typeof getOrderConsultantNameFromRecord === 'function'
            ? getOrderConsultantNameFromRecord(order).toLowerCase()
            : String(order?.consultor?.name || '').toLowerCase();
        if (consultantFilter && !consultantName.includes(consultantFilter)) return false;

        return true;
    });
}

function sumCommercialFinanceOrdersSaleValue(orders = []) {
    return roundCommercialFinanceMoney(
        (orders || []).reduce((total, order) => total + getCommercialFinanceRecordSaleValue(order), 0)
    );
}

function sumCommercialFinanceImportedSalesValue(sales = []) {
    return roundCommercialFinanceMoney(
        filterCommercialFinanceCommissionSales(sales).reduce(
            (total, sale) => total + getCommercialFinanceImportedSaleValue(sale),
            0
        )
    );
}

function sortCommercialFinanceCommissionTiers(tiers = []) {
    return [...tiers].sort((left, right) => {
        const leftMin = Number(left?.minAmount) || 0;
        const rightMin = Number(right?.minAmount) || 0;
        if (leftMin !== rightMin) return leftMin - rightMin;
        return Number(left?.sortOrder || 0) - Number(right?.sortOrder || 0);
    });
}

function matchCommercialFinanceCommissionTier(totalSales, tiers = []) {
    const amount = Number(totalSales) || 0;
    const sortedTiers = sortCommercialFinanceCommissionTiers(tiers);

    for (const tier of sortedTiers) {
        const minAmount = Number(tier?.minAmount) || 0;
        const maxAmount = tier?.maxAmount == null ? null : Number(tier.maxAmount);
        if (amount < minAmount) continue;
        if (maxAmount != null && Number.isFinite(maxAmount) && amount > maxAmount) continue;
        return {
            ratePercent: Number(tier.ratePercent) || 0,
            tier
        };
    }

    return { ratePercent: 0, tier: null };
}

function roundCommercialFinanceMoney(value) {
    const num = Number(value) || 0;
    return Math.round(num * 100) / 100;
}

function getCommercialFinanceOrderClientInstallments(order) {
    return [...(order?.clientInstallments || [])].sort(
        (left, right) => Number(left.installmentNumber) - Number(right.installmentNumber)
    );
}

function parseCommercialFinanceClientInstallmentAmount(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return roundCommercialFinanceMoney(value);
    }
    if (typeof parseSaleValueInput === 'function') {
        const parsed = parseSaleValueInput(value);
        return Number.isFinite(parsed) ? roundCommercialFinanceMoney(parsed) : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? roundCommercialFinanceMoney(parsed) : null;
}

function sumCommercialFinanceClientInstallmentAmounts(installments = []) {
    return (installments || []).reduce((total, item) => {
        const value = parseCommercialFinanceClientInstallmentAmount(item?.clientInstallmentAmount);
        if (value == null) return total;
        return roundCommercialFinanceMoney(total + value);
    }, 0);
}

function normalizeCommercialFinanceCashPaymentInstallments(order, installments = []) {
    const saleValue = getCommercialFinanceRecordSaleValue(order);
    const firstInstallment = (installments || [])[0] || {};
    const paymentYearMonth = String(firstInstallment.paymentYearMonth || '').trim();
    if (!paymentYearMonth) {
        return [];
    }

    return [{
        installmentNumber: 1,
        paymentYearMonth,
        clientInstallmentAmount: saleValue
    }];
}

function validateCommercialFinanceOrderForCommission(order) {
    const paymentMethod = normalizeCommercialFinancePaymentMethod(order?.paymentMethod);
    const orderCode = order?.orderCode || 'pedido';
    const saleValue = getCommercialFinanceRecordSaleValue(order);
    const installments = getCommercialFinanceOrderClientInstallments(order);

    if (paymentMethod === COMMERCIAL_FINANCE_PAYMENT_CASH) {
        const cashInstallments = normalizeCommercialFinanceCashPaymentInstallments(order, installments);
        if (!cashInstallments.length) {
            return { ok: false, message: `Pedido ${orderCode}: informe o mês de pagamento.` };
        }
        return { ok: true };
    }

    if (paymentMethod !== COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT) {
        return { ok: true };
    }
    if (!installments.length) {
        return { ok: false, message: `Pedido ${orderCode}: informe as parcelas do cliente.` };
    }

    const installmentsTotal = sumCommercialFinanceClientInstallmentAmounts(installments);
    if (Math.abs(installmentsTotal - saleValue) > 0.01) {
        return {
            ok: false,
            message: `Pedido ${orderCode}: soma das parcelas (${typeof formatSaleValue === 'function' ? formatSaleValue(installmentsTotal) : installmentsTotal}) difere do valor da venda (${typeof formatSaleValue === 'function' ? formatSaleValue(saleValue) : saleValue}).`
        };
    }

    const usedPaymentMonths = new Set();
    for (const installment of installments) {
        if (!installment.paymentYearMonth) {
            return { ok: false, message: `Pedido ${orderCode}: informe o mês de pagamento de todas as parcelas.` };
        }
        if (usedPaymentMonths.has(installment.paymentYearMonth)) {
            const monthLabel = formatCommercialFinanceYearMonthLabel(installment.paymentYearMonth);
            return {
                ok: false,
                message: `Pedido ${orderCode}: o mês ${monthLabel} não pode ser usado em mais de uma parcela.`
            };
        }
        usedPaymentMonths.add(installment.paymentYearMonth);

        const amount = parseCommercialFinanceClientInstallmentAmount(installment.clientInstallmentAmount);
        if (amount == null || amount <= 0) {
            return { ok: false, message: `Pedido ${orderCode}: informe o valor de todas as parcelas do cliente.` };
        }
    }

    return { ok: true };
}

function buildCommercialFinanceCommissionInstallments(order, ratePercent) {
    const saleValue = getCommercialFinanceRecordSaleValue(order);
    const paymentMethod = normalizeCommercialFinancePaymentMethod(order?.paymentMethod);
    const saleYearMonth = getCommercialFinanceYearMonthFromDate(order?.saleDate);
    const rate = Number(ratePercent) || 0;

    if (!saleYearMonth) {
        return [];
    }

    if (paymentMethod === COMMERCIAL_FINANCE_PAYMENT_CASH) {
        const cashInstallments = normalizeCommercialFinanceCashPaymentInstallments(
            order,
            getCommercialFinanceOrderClientInstallments(order)
        );
        const cashInstallment = cashInstallments[0];
        if (!cashInstallment?.paymentYearMonth) {
            return [];
        }

        const clientInstallmentAmount = roundCommercialFinanceMoney(cashInstallment.clientInstallmentAmount);
        const commissionAmount = roundCommercialFinanceMoney(clientInstallmentAmount * rate / 100);
        if (commissionAmount <= 0) {
            return [];
        }

        return [{
            installmentNumber: 1,
            installmentCount: 1,
            yearMonth: cashInstallment.paymentYearMonth,
            clientInstallmentAmount,
            amount: commissionAmount
        }];
    }

    const clientInstallments = getCommercialFinanceOrderClientInstallments(order);
    const installmentCount = clientInstallments.length;

    return clientInstallments.map((installment, index) => {
        const clientInstallmentAmount = roundCommercialFinanceMoney(installment.clientInstallmentAmount);
        const commissionAmount = roundCommercialFinanceMoney(clientInstallmentAmount * rate / 100);

        return {
            installmentNumber: Number(installment.installmentNumber) || (index + 1),
            installmentCount,
            yearMonth: installment.paymentYearMonth,
            clientInstallmentAmount,
            amount: commissionAmount
        };
    }).filter(item => item.yearMonth && item.clientInstallmentAmount > 0);
}

function orderCountsForCommercialFinanceTierSum(order) {
    return order?.countsForTier !== false && order?.commissionCountsForTier !== false;
}

function parseCommercialFinanceRateOverrideInput(value) {
    if (value === null || value === undefined || String(value).trim() === '') {
        return null;
    }
    const normalized = Number(String(value).replace(',', '.').replace('%', '').trim());
    return Number.isFinite(normalized) ? roundCommercialFinanceMoney(normalized) : null;
}

function formatCommercialFinanceRateOverrideForInput(order) {
    const explicitRate = getCommercialFinanceOrderExplicitRatePercent(order);
    if (explicitRate === null) return '';
    return String(explicitRate).replace('.', ',');
}

function hasCommercialFinanceImportedCommissionRate(order) {
    const rate = Number(order?.importedRatePercent ?? order?.commissionRatePercent);
    return Number.isFinite(rate) && rate > 0;
}

function getCommercialFinanceOrderExplicitRatePercent(order) {
    const overrideValue = order?.rateOverride ?? order?.commissionRateOverride;
    if (overrideValue != null && overrideValue !== '') {
        const rate = Number(overrideValue);
        return Number.isFinite(rate) ? roundCommercialFinanceMoney(rate) : null;
    }
    const importedRate = order?.importedRatePercent ?? order?.commissionRatePercent;
    if (Number.isFinite(Number(importedRate)) && Number(importedRate) > 0) {
        return roundCommercialFinanceMoney(Number(importedRate));
    }
    if (hasCommercialFinanceImportedCommissionRate(order)) {
        return roundCommercialFinanceMoney(Number(order.commissionRatePercent));
    }
    return null;
}

function buildCommercialFinanceConsultantMonthlyTotals(records = []) {
    const totalsByConsultantMonth = {};

    records.forEach(record => {
        if (!orderCountsForCommercialFinanceTierSum(record)) return;

        const consultantUserId = Number(record?.consultantUserId || record?.consultor?.id);
        const yearMonth = record?.saleYearMonth || getCommercialFinanceYearMonthFromDate(record?.saleDate);
        if (!consultantUserId || !yearMonth) return;

        const key = `${consultantUserId}:${yearMonth}`;
        if (!totalsByConsultantMonth[key]) {
            totalsByConsultantMonth[key] = {
                consultantUserId,
                yearMonth,
                totalSales: 0,
                orderIds: []
            };
        }

        totalsByConsultantMonth[key].totalSales = roundCommercialFinanceMoney(
            totalsByConsultantMonth[key].totalSales + getCommercialFinanceRecordSaleValue(record)
        );
        totalsByConsultantMonth[key].orderIds.push(Number(record.salesOrderId || record.id));
    });

    return totalsByConsultantMonth;
}

function buildCommercialFinanceConsultantAdjustmentsMap(adjustments = []) {
    const map = {};
    (adjustments || []).forEach(adjustment => {
        const consultantUserId = Number(adjustment?.consultantUserId);
        const saleYearMonth = String(adjustment?.saleYearMonth || '').trim();
        if (!consultantUserId || !saleYearMonth) return;

        const key = `${consultantUserId}:${saleYearMonth}`;
        if (!map[key]) {
            map[key] = [];
        }
        map[key].push(adjustment);
    });
    return map;
}

function sumCommercialFinanceConsultantAdjustmentPercent(adjustments = []) {
    return roundCommercialFinanceMoney(
        (adjustments || []).reduce((total, adjustment) => total + Number(adjustment?.adjustmentPercent || 0), 0)
    );
}

function getCommercialFinanceOrderCommissionRatePercent(order, rateByConsultantMonth = {}) {
    const explicitRate = getCommercialFinanceOrderExplicitRatePercent(order);
    if (explicitRate !== null) {
        return explicitRate;
    }

    const consultantUserId = Number(order?.consultantUserId || order?.consultor?.id);
    const saleYearMonth = order?.saleYearMonth || getCommercialFinanceYearMonthFromDate(order?.saleDate);
    if (!consultantUserId || !saleYearMonth) return 0;

    const rateInfo = rateByConsultantMonth[`${consultantUserId}:${saleYearMonth}`] || { ratePercent: 0 };
    return Number(rateInfo.ratePercent) || 0;
}

function monthCommercialFinanceOrdersUseImportedCommissionRates(orders = []) {
    const confirmedOrders = filterCommercialFinanceCommissionOrders(orders);
    return confirmedOrders.length > 0
        && confirmedOrders.every(order => getCommercialFinanceOrderExplicitRatePercent(order) !== null);
}

function getCommercialFinanceManagerUserId(users = []) {
    const manager = (users || []).find(user =>
        Boolean(user?.isCommercialManager)
        && user?.isActive !== false
        && (user?.role === 'Consultor' || user?.role === 'Admin')
    );
    return manager ? Number(manager.id) : null;
}

function isCommercialFinanceManagerSale(record, managerUserId) {
    const normalizedManagerId = Number(managerUserId);
    if (!normalizedManagerId) return false;
    const consultantUserId = Number(record?.consultantUserId || record?.consultor?.id);
    return consultantUserId === normalizedManagerId;
}

function isCommercialFinanceMonthlyTargetAchieved(targetAmount, realizedAmount) {
    const target = Number(targetAmount) || 0;
    const realized = Number(realizedAmount) || 0;
    return target > 0 && realized >= target;
}

function getCommercialFinanceDefaultManagerMetaTiers() {
    return [{ minAmount: 0, maxAmount: 9999999, ratePercent: 5 }];
}

function matchCommercialFinanceManagerTier(totalSales, managerTiers = []) {
    return matchCommercialFinanceCommissionTier(totalSales, managerTiers);
}

function monthNeedsCommercialFinanceTierRates(records = [], saleYearMonth, managerUserId = null) {
    const monthRecords = (records || []).filter(record => {
        const yearMonth = record?.saleYearMonth || getCommercialFinanceYearMonthFromDate(record?.saleDate);
        return yearMonth === saleYearMonth;
    });
    const confirmedRecords = filterCommercialFinanceCommissionOrders(monthRecords);
    return confirmedRecords.some(record => {
        if (managerUserId && isCommercialFinanceManagerSale(record, managerUserId)) {
            return false;
        }
        return getCommercialFinanceOrderExplicitRatePercent(record) === null;
    });
}

function monthNeedsCommercialFinanceManagerTierRates(records = [], saleYearMonth, managerUserId = null) {
    const normalizedManagerId = Number(managerUserId);
    if (!normalizedManagerId) return false;

    const monthRecords = (records || []).filter(record => {
        const yearMonth = record?.saleYearMonth || getCommercialFinanceYearMonthFromDate(record?.saleDate);
        return yearMonth === saleYearMonth;
    });
    const confirmedRecords = filterCommercialFinanceCommissionOrders(monthRecords)
        .filter(record => isCommercialFinanceManagerSale(record, normalizedManagerId));

    return confirmedRecords.some(record => getCommercialFinanceOrderExplicitRatePercent(record) === null);
}

function formatCommercialFinanceEntryTypeLabel(entryType) {
    switch (entryType) {
        case COMMERCIAL_FINANCE_ENTRY_TYPE_MANAGER_OWN:
            return 'Venda própria (gestor)';
        case COMMERCIAL_FINANCE_ENTRY_TYPE_MANAGER_TEAM:
            return 'Equipe';
        case COMMERCIAL_FINANCE_ENTRY_TYPE_MANAGER_DELIVERY_BONUS:
            return 'Bônus entrega';
        default:
            return 'Consultor';
    }
}

function buildCommercialFinanceManagerTeamEntryDrafts(
    records = [],
    saleYearMonth,
    target = {},
    managerUser = null,
    managerUserId = null
) {
    const normalizedManagerId = Number(managerUserId);
    const ratePercent = Number(target?.managerTeamSalePercent) || 0;
    if (!normalizedManagerId || ratePercent <= 0) {
        return [];
    }

    const referenceYearMonth = addCommercialFinanceMonths(saleYearMonth, 1);
    const managerName = managerUser?.name || 'Gestor comercial';

    return filterCommercialFinanceCommissionOrders(records)
        .filter(record => !isCommercialFinanceManagerSale(record, normalizedManagerId))
        .map(record => {
            const saleValue = getCommercialFinanceRecordSaleValue(record);
            const commissionAmount = roundCommercialFinanceMoney(saleValue * ratePercent / 100);
            if (commissionAmount <= 0) {
                return null;
            }

            const consultantName = typeof getOrderConsultantNameFromRecord === 'function'
                ? getOrderConsultantNameFromRecord(record)
                : (record?.consultor?.name || '');
            const clientName = typeof getOrderClientName === 'function'
                ? getOrderClientName(record)
                : (record?.client?.name || record?.clientName || '');

            return {
                entryType: COMMERCIAL_FINANCE_ENTRY_TYPE_MANAGER_TEAM,
                salesOrderId: Number(record.salesOrderId || record.id) || null,
                consultantUserId: normalizedManagerId,
                saleDate: record.saleDate,
                saleYearMonth,
                referenceYearMonth,
                orderCode: record.orderCode || '',
                clientName,
                consultantName: managerName,
                saleConsultantName: consultantName,
                saleValue,
                clientInstallmentAmount: saleValue,
                commissionAmount,
                ratePercent,
                installmentNumber: 1,
                installmentCount: 1
            };
        })
        .filter(Boolean);
}

function buildCommercialFinanceCommissionReport(
    records = [],
    targetsByYearMonth = {},
    consultantAdjustments = [],
    managerUserId = null
) {
    const confirmedOrders = filterCommercialFinanceCommissionOrders(records);
    const consultantTotals = buildCommercialFinanceConsultantMonthlyTotals(confirmedOrders);
    const adjustmentsByConsultantMonth = buildCommercialFinanceConsultantAdjustmentsMap(consultantAdjustments);
    const rateByConsultantMonth = {};
    const saleEntries = [];

    Object.values(consultantTotals).forEach(entry => {
        const isManager = Boolean(managerUserId) && Number(entry.consultantUserId) === Number(managerUserId);
        const tiers = isManager
            ? (targetsByYearMonth[entry.yearMonth]?.managerTiers || [])
            : (targetsByYearMonth[entry.yearMonth]?.tiers || []);
        const match = matchCommercialFinanceCommissionTier(entry.totalSales, tiers);
        const adjustments = isManager
            ? []
            : (adjustmentsByConsultantMonth[`${entry.consultantUserId}:${entry.yearMonth}`] || []);
        const adjustmentPercent = sumCommercialFinanceConsultantAdjustmentPercent(adjustments);
        const adjustedRate = Math.max(0, roundCommercialFinanceMoney(match.ratePercent + adjustmentPercent));

        rateByConsultantMonth[`${entry.consultantUserId}:${entry.yearMonth}`] = {
            ratePercent: adjustedRate,
            baseRatePercent: match.ratePercent,
            adjustmentPercent,
            totalSales: entry.totalSales,
            tier: match.tier,
            adjustments,
            isManager
        };
    });

    confirmedOrders.forEach(order => {
        const consultantUserId = Number(order?.consultantUserId || order?.consultor?.id);
        const saleYearMonth = order?.saleYearMonth || getCommercialFinanceYearMonthFromDate(order?.saleDate);
        if (!consultantUserId || !saleYearMonth) return;

        const ratePercent = getCommercialFinanceOrderCommissionRatePercent(order, rateByConsultantMonth);
        const installments = buildCommercialFinanceCommissionInstallments(order, ratePercent);
        const totalCommission = roundCommercialFinanceMoney(
            installments.reduce((sum, item) => sum + item.amount, 0)
        );

        saleEntries.push({
            order,
            consultantUserId,
            saleYearMonth,
            saleValue: getCommercialFinanceRecordSaleValue(order),
            ratePercent,
            totalCommission,
            installments
        });
    });

    return {
        consultantTotals,
        rateByConsultantMonth,
        saleEntries
    };
}

function getCommercialFinanceTeamSalesInMonth(sales = [], yearMonth) {
    return roundCommercialFinanceMoney(
        filterCommercialFinanceCommissionSales(sales).reduce((total, sale) => {
            const saleMonth = sale?.saleYearMonth || getCommercialFinanceYearMonthFromDate(sale?.saleDate);
            if (saleMonth !== yearMonth) return total;
            return total + getCommercialFinanceImportedSaleValue(sale);
        }, 0)
    );
}

function buildCommercialFinanceMonthlyRealizedSalesMap(sales = [], year) {
    const normalizedYear = Number(year);
    if (!Number.isFinite(normalizedYear)) {
        return {};
    }

    return Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => {
            const yearMonth = buildCommercialFinanceYearMonthKey(normalizedYear, index + 1);
            return [
                yearMonth,
                getCommercialFinanceTeamSalesInMonth(sales, yearMonth)
            ];
        })
    );
}

function filterCommercialFinanceSalesBySaleYearMonth(sales = [], saleYearMonth) {
    if (!saleYearMonth) return [];
    return (sales || []).filter(sale => {
        const yearMonth = sale?.saleYearMonth || getCommercialFinanceYearMonthFromDate(sale?.saleDate);
        return yearMonth === saleYearMonth;
    });
}

function buildCommercialFinanceCommissionRecordsFromSales(sales = []) {
    return (sales || []).map(sale => commercialFinanceSaleToCommissionRecord(sale)).filter(Boolean);
}

function buildCommercialFinanceMonthlySummary(report, yearMonth) {
    const summaryByConsultant = {};

    Object.entries(report.rateByConsultantMonth).forEach(([key, rateInfo]) => {
        const [consultantUserIdText, saleMonth] = key.split(':');
        if (saleMonth !== yearMonth) return;

        const consultantUserId = Number(consultantUserIdText);
        summaryByConsultant[consultantUserId] = {
            consultantUserId,
            totalSalesInSaleMonth: rateInfo.totalSales || 0,
            ratePercent: rateInfo.ratePercent || 0,
            commissionInMonth: 0,
            sales: []
        };
    });

    report.saleEntries.forEach(entry => {
        if (!summaryByConsultant[entry.consultantUserId]) {
            summaryByConsultant[entry.consultantUserId] = {
                consultantUserId: entry.consultantUserId,
                totalSalesInSaleMonth: 0,
                ratePercent: 0,
                commissionInMonth: 0,
                sales: []
            };
        }

        const consultantSummary = summaryByConsultant[entry.consultantUserId];
        const installmentInMonth = entry.installments.find(item => item.yearMonth === yearMonth);
        if (!installmentInMonth) return;

        consultantSummary.commissionInMonth = roundCommercialFinanceMoney(
            consultantSummary.commissionInMonth + installmentInMonth.amount
        );
        consultantSummary.sales.push({
            order: entry.order,
            saleValue: entry.saleValue,
            ratePercent: entry.ratePercent,
            installmentAmount: installmentInMonth.amount,
            installmentNumber: installmentInMonth.installmentNumber,
            installmentCount: entry.installments.length,
            saleYearMonth: entry.saleYearMonth
        });
    });

    return Object.values(summaryByConsultant)
        .filter(item => item.commissionInMonth > 0 || item.totalSalesInSaleMonth > 0)
        .sort((left, right) => right.commissionInMonth - left.commissionInMonth);
}

function formatCommercialFinanceRatePercent(ratePercent) {
    const value = Number(ratePercent);
    if (!Number.isFinite(value)) return '—';
    return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}

function formatCommercialFinanceRateDecimal(ratePercent) {
    const value = Number(ratePercent);
    if (!Number.isFinite(value)) return '—';
    const decimal = value / 100;
    return decimal.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function filterCommercialFinanceOrdersBySaleYearMonth(orders = [], saleYearMonth) {
    if (!saleYearMonth) return [];
    return (orders || []).filter(order =>
        getCommercialFinanceYearMonthFromDate(order?.saleDate) === saleYearMonth
    );
}

function buildCommercialFinanceCommissionEntryDrafts(
    records = [],
    targetsByYearMonth = {},
    saleYearMonth,
    consultantAdjustments = [],
    managerUserId = null
) {
    const monthRecords = (records || []).filter(record => {
        const yearMonth = record?.saleYearMonth || getCommercialFinanceYearMonthFromDate(record?.saleDate);
        return yearMonth === saleYearMonth;
    });
    const confirmedOrders = filterCommercialFinanceCommissionOrders(monthRecords);
    const monthTarget = targetsByYearMonth[saleYearMonth] || {};
    const tiers = monthTarget.tiers || [];
    const managerTiers = monthTarget.managerTiers || [];
    const monthAdjustments = (consultantAdjustments || []).filter(
        adjustment => adjustment.saleYearMonth === saleYearMonth
    );
    const report = buildCommercialFinanceCommissionReport(confirmedOrders, {
        [saleYearMonth]: { tiers, managerTiers }
    }, monthAdjustments, managerUserId);
    const entries = [];

    report.saleEntries.forEach(entry => {
        const order = entry.order || {};
        const consultantName = typeof getOrderConsultantNameFromRecord === 'function'
            ? getOrderConsultantNameFromRecord(order)
            : (order?.consultor?.name || '');
        const clientName = typeof getOrderClientName === 'function'
            ? getOrderClientName(order)
            : (order?.client?.name || '');
        const installmentCount = entry.installments.length || 1;
        const entryType = managerUserId && Number(entry.consultantUserId) === Number(managerUserId)
            ? COMMERCIAL_FINANCE_ENTRY_TYPE_MANAGER_OWN
            : COMMERCIAL_FINANCE_ENTRY_TYPE_CONSULTANT;

        entry.installments.forEach(installment => {
            entries.push({
                entryType,
                salesOrderId: Number(order.salesOrderId || order.id) || null,
                consultantUserId: entry.consultantUserId,
                saleDate: order.saleDate,
                saleYearMonth,
                referenceYearMonth: installment.yearMonth,
                orderCode: order.orderCode || '',
                clientName,
                consultantName,
                saleValue: entry.saleValue,
                clientInstallmentAmount: installment.clientInstallmentAmount,
                commissionAmount: installment.amount,
                ratePercent: entry.ratePercent,
                installmentNumber: installment.installmentNumber,
                installmentCount: installment.installmentCount || installmentCount
            });
        });
    });

    return {
        confirmedCount: confirmedOrders.length,
        pendingCount: 0,
        entries
    };
}

function countCommercialFinancePendingOrdersForMonth(orders = [], sales = [], saleYearMonth) {
    const importedOrderIds = new Set(
        filterCommercialFinanceCommissionSales(sales)
            .filter(sale => (sale.saleYearMonth || getCommercialFinanceYearMonthFromDate(sale.saleDate)) === saleYearMonth)
            .map(sale => Number(sale.salesOrderId))
            .filter(Boolean)
    );

    const monthOrders = filterCommercialFinanceOrdersBySaleYearMonth(orders, saleYearMonth);
    return monthOrders.filter(order => !importedOrderIds.has(Number(order.id))).length;
}

function buildCommercialFinanceAnnualConsultantSummary(entries = [], year) {
    const normalizedYear = Number(year);
    if (!Number.isFinite(normalizedYear)) {
        return { monthKeys: [], consultants: [] };
    }

    const monthKeys = Array.from({ length: 12 }, (_, index) =>
        buildCommercialFinanceYearMonthKey(normalizedYear, index + 1)
    );
    const totalsByConsultant = {};

    (entries || []).forEach(entry => {
        const referenceYearMonth = String(entry?.referenceYearMonth || '');
        if (!referenceYearMonth.startsWith(`${normalizedYear}-`)) return;

        const consultantKey = String(entry.consultantUserId || entry.consultantName || 'unknown');
        if (!totalsByConsultant[consultantKey]) {
            totalsByConsultant[consultantKey] = {
                consultantUserId: entry.consultantUserId || null,
                consultantName: entry.consultantName || '—',
                totalsByMonth: Object.fromEntries(monthKeys.map(monthKey => [monthKey, 0])),
                yearTotal: 0
            };
        }

        const amount = roundCommercialFinanceMoney(entry.commissionAmount);
        totalsByConsultant[consultantKey].totalsByMonth[referenceYearMonth] = roundCommercialFinanceMoney(
            (totalsByConsultant[consultantKey].totalsByMonth[referenceYearMonth] || 0) + amount
        );
        totalsByConsultant[consultantKey].yearTotal = roundCommercialFinanceMoney(
            totalsByConsultant[consultantKey].yearTotal + amount
        );
    });

    const consultants = Object.values(totalsByConsultant)
        .sort((left, right) => left.consultantName.localeCompare(right.consultantName, 'pt-BR'));

    const monthTotals = Object.fromEntries(monthKeys.map(monthKey => [monthKey, 0]));
    consultants.forEach(consultant => {
        monthKeys.forEach(monthKey => {
            monthTotals[monthKey] = roundCommercialFinanceMoney(
                monthTotals[monthKey] + (consultant.totalsByMonth[monthKey] || 0)
            );
        });
    });

    return {
        monthKeys,
        consultants,
        monthTotals,
        yearTotal: roundCommercialFinanceMoney(
            consultants.reduce((sum, consultant) => sum + consultant.yearTotal, 0)
        )
    };
}

function sortCommercialFinanceCommissionEntries(entries = []) {
    return [...entries].sort((left, right) => {
        const leftRef = String(left?.referenceYearMonth || '');
        const rightRef = String(right?.referenceYearMonth || '');
        if (leftRef !== rightRef) return leftRef.localeCompare(rightRef);

        const leftSaleDate = String(left?.saleDate || '');
        const rightSaleDate = String(right?.saleDate || '');
        if (leftSaleDate !== rightSaleDate) return leftSaleDate.localeCompare(rightSaleDate);

        const leftOrder = String(left?.orderCode || '');
        const rightOrder = String(right?.orderCode || '');
        if (leftOrder !== rightOrder) {
            return leftOrder.localeCompare(rightOrder, 'pt-BR', { numeric: true });
        }

        return Number(left?.installmentNumber || 0) - Number(right?.installmentNumber || 0);
    });
}

function filterCommercialFinanceCommissionEntriesByReferenceMonth(entries = [], referenceYearMonth) {
    if (!referenceYearMonth) return sortCommercialFinanceCommissionEntries(entries);
    return sortCommercialFinanceCommissionEntries(
        (entries || []).filter(entry => entry.referenceYearMonth === referenceYearMonth)
    );
}

function filterCommercialFinanceCommissionEntriesByYear(entries = [], year) {
    const normalizedYear = Number(year);
    if (!Number.isFinite(normalizedYear)) return [];
    return sortCommercialFinanceCommissionEntries(
        (entries || []).filter(entry => String(entry?.referenceYearMonth || '').startsWith(`${normalizedYear}-`))
    );
}

function buildCommercialFinanceCommissionDetailMatrix(entries = [], year) {
    const normalizedYear = Number(year);
    const monthKeys = Number.isFinite(normalizedYear)
        ? Array.from({ length: 12 }, (_, index) => buildCommercialFinanceYearMonthKey(normalizedYear, index + 1))
        : [];
    const emptyMonthCell = () => ({
        clientInstallmentAmount: 0,
        commissionAmount: 0
    });
    const rowsByOrder = {};

    (entries || []).forEach(entry => {
        const referenceYearMonth = String(entry?.referenceYearMonth || '');
        if (!referenceYearMonth.startsWith(`${normalizedYear}-`)) return;

        const saleYearMonth = String(entry?.saleYearMonth || '');
        const entryType = entry.entryType || COMMERCIAL_FINANCE_ENTRY_TYPE_CONSULTANT;
        const orderKey = `${entryType}:${entry.salesOrderId || entry.orderCode || entry.id}`;
        if (!rowsByOrder[orderKey]) {
            rowsByOrder[orderKey] = {
                salesOrderId: entry.salesOrderId,
                saleDate: entry.saleDate,
                saleYearMonth,
                orderCode: entry.orderCode || '',
                clientName: entry.clientName || '—',
                consultantName: entry.consultantName || '—',
                entryType,
                saleValue: roundCommercialFinanceMoney(entry.saleValue),
                ratePercent: entry.ratePercent,
                months: Object.fromEntries(monthKeys.map(monthKey => [monthKey, emptyMonthCell()]))
            };
        }

        const cell = rowsByOrder[orderKey].months[referenceYearMonth];
        if (!cell) return;

        cell.clientInstallmentAmount = roundCommercialFinanceMoney(
            cell.clientInstallmentAmount + Number(entry.clientInstallmentAmount || 0)
        );
        cell.commissionAmount = roundCommercialFinanceMoney(
            cell.commissionAmount + Number(entry.commissionAmount || 0)
        );
    });

    const rows = Object.values(rowsByOrder).sort((left, right) => {
        const leftSaleDate = String(left?.saleDate || '');
        const rightSaleDate = String(right?.saleDate || '');
        if (leftSaleDate !== rightSaleDate) return leftSaleDate.localeCompare(rightSaleDate);

        const leftOrder = String(left?.orderCode || '');
        const rightOrder = String(right?.orderCode || '');
        return leftOrder.localeCompare(rightOrder, 'pt-BR', { numeric: true });
    });

    const monthTotals = Object.fromEntries(monthKeys.map(monthKey => [monthKey, emptyMonthCell()]));
    rows.forEach(row => {
        monthKeys.forEach(monthKey => {
            const cell = row.months[monthKey];
            if (!cell) return;
            monthTotals[monthKey].clientInstallmentAmount = roundCommercialFinanceMoney(
                monthTotals[monthKey].clientInstallmentAmount + cell.clientInstallmentAmount
            );
            monthTotals[monthKey].commissionAmount = roundCommercialFinanceMoney(
                monthTotals[monthKey].commissionAmount + cell.commissionAmount
            );
        });
    });

    return { monthKeys, rows, monthTotals };
}

function filterCommercialFinanceCommissionDetailRows(rows = [], referenceYearMonth) {
    if (!referenceYearMonth) return rows;
    return (rows || []).filter(row => {
        const cell = row?.months?.[referenceYearMonth];
        if (!cell) return false;
        return Number(cell.commissionAmount || 0) > 0 || Number(cell.clientInstallmentAmount || 0) > 0;
    });
}

function buildCommercialFinanceCommissionDetailMonthTotals(rows = [], monthKeys = []) {
    const emptyMonthCell = () => ({
        clientInstallmentAmount: 0,
        commissionAmount: 0
    });
    const monthTotals = Object.fromEntries(monthKeys.map(monthKey => [monthKey, emptyMonthCell()]));

    (rows || []).forEach(row => {
        monthKeys.forEach(monthKey => {
            const cell = row?.months?.[monthKey];
            if (!cell) return;
            monthTotals[monthKey].clientInstallmentAmount = roundCommercialFinanceMoney(
                monthTotals[monthKey].clientInstallmentAmount + Number(cell.clientInstallmentAmount || 0)
            );
            monthTotals[monthKey].commissionAmount = roundCommercialFinanceMoney(
                monthTotals[monthKey].commissionAmount + Number(cell.commissionAmount || 0)
            );
        });
    });

    return monthTotals;
}

function buildCommercialFinanceCommissionDetailColumns(monthKeys = []) {
    const fixedColumns = [
        {
            key: 'saleDate',
            label: 'Data Venda',
            type: 'date',
            sortable: true,
            filterable: true,
            thClass: 'p-2 whitespace-nowrap normal-case',
            cellClass: 'p-2 whitespace-nowrap text-xs text-slate-700',
            getFilterValue: row => (
                typeof formatGestaoDate === 'function'
                    ? formatGestaoDate(row?.saleDate)
                    : String(row?.saleDate || '')
            ),
            render: row => escapeHtml(
                typeof formatGestaoDate === 'function'
                    ? formatGestaoDate(row?.saleDate)
                    : (row?.saleDate || '—')
            )
        },
        {
            key: 'orderCode',
            label: 'Pedido',
            sortable: true,
            filterable: true,
            thClass: 'p-2 whitespace-nowrap normal-case',
            cellClass: 'p-2 font-mono text-[11px] whitespace-nowrap text-slate-700',
            render: row => escapeHtml(row?.orderCode || '—')
        },
        {
            key: 'clientName',
            label: 'Cliente',
            sortable: true,
            filterable: true,
            thClass: 'p-2 whitespace-nowrap normal-case',
            cellClass: 'p-2 whitespace-nowrap text-xs text-slate-700',
            render: row => escapeHtml(row?.clientName || '—')
        },
        {
            key: 'consultantName',
            label: 'Vendedor',
            sortable: true,
            filterable: true,
            thClass: 'p-2 whitespace-nowrap normal-case',
            cellClass: 'p-2 whitespace-nowrap text-xs text-slate-700',
            render: row => escapeHtml(row?.consultantName || '—')
        },
        {
            key: 'entryType',
            label: 'Tipo',
            sortable: true,
            filterable: true,
            thClass: 'p-2 whitespace-nowrap normal-case',
            cellClass: 'p-2 whitespace-nowrap text-xs text-slate-700',
            getSortValue: row => formatCommercialFinanceEntryTypeLabel(row?.entryType),
            getFilterValue: row => formatCommercialFinanceEntryTypeLabel(row?.entryType),
            render: row => escapeHtml(formatCommercialFinanceEntryTypeLabel(row?.entryType))
        },
        {
            key: 'saleValue',
            label: 'Valor venda',
            type: 'number',
            sortable: false,
            filterable: false,
            align: 'right',
            thClass: 'p-2 whitespace-nowrap normal-case',
            cellClass: 'p-2 text-right whitespace-nowrap text-xs text-slate-700',
            render: row => escapeHtml(
                typeof formatSaleValue === 'function'
                    ? formatSaleValue(row?.saleValue)
                    : String(row?.saleValue ?? '—')
            )
        },
        {
            key: 'ratePercent',
            label: 'Alíquota',
            type: 'number',
            sortable: false,
            filterable: false,
            align: 'right',
            thClass: 'p-2 whitespace-nowrap normal-case',
            cellClass: 'p-2 text-right whitespace-nowrap text-xs text-slate-700',
            render: row => escapeHtml(formatCommercialFinanceRatePercent(row?.ratePercent))
        }
    ];

    return fixedColumns;
}

function appendCommercialFinanceCommissionDetailMonthColumns(columns = [], monthKeys = [], renderMonthCell) {
    const monthColumns = (monthKeys || []).map(monthKey => ({
        key: `month_${monthKey}`,
        label: formatCommercialFinanceMonthShortName(monthKey.split('-')[1]),
        sortable: false,
        filterable: false,
        align: 'right',
        thClass: 'p-2 text-right font-semibold whitespace-nowrap normal-case',
        cellClass: 'p-2 text-right align-top commercial-finance-detail-month-cell-td text-xs text-slate-700',
        render: row => (typeof renderMonthCell === 'function'
            ? renderMonthCell(row?.months?.[monthKey])
            : '—')
    }));
    return [...columns, ...monthColumns];
}
