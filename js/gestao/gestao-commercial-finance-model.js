const COMMERCIAL_FINANCE_PAYMENT_CASH = 'cash';
const COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT = 'installment';

function canAccessGestaoCommercialFinance(user) {
    if (typeof isAdmin === 'function') {
        return isAdmin(user);
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

function isCommercialFinanceCommissionConfirmed(order) {
    return Boolean(order?.commissionConfirmed);
}

function filterCommercialFinanceCommissionOrders(orders = []) {
    return (orders || []).filter(order => isCommercialFinanceCommissionConfirmed(order));
}

function getCommercialFinanceOrderSaleValue(order) {
    const projects = Array.isArray(order?.projects) ? order.projects : [];
    const total = projects.reduce((sum, project) => {
        const value = typeof getProjectEffectiveSaleValue === 'function'
            ? getProjectEffectiveSaleValue(project)
            : Number(project?.saleValue);
        const normalized = Number.isFinite(Number(value)) ? Number(value) : 0;
        return roundCommercialFinanceMoney(sum + normalized);
    }, 0);
    return roundCommercialFinanceMoney(total);
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

function validateCommercialFinanceOrderForCommission(order) {
    const paymentMethod = normalizeCommercialFinancePaymentMethod(order?.paymentMethod);
    const orderCode = order?.orderCode || 'pedido';

    if (paymentMethod !== COMMERCIAL_FINANCE_PAYMENT_INSTALLMENT) {
        return { ok: true };
    }

    const installments = getCommercialFinanceOrderClientInstallments(order);
    if (!installments.length) {
        return { ok: false, message: `Pedido ${orderCode}: informe as parcelas do cliente.` };
    }

    const saleValue = getCommercialFinanceOrderSaleValue(order);
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
    const saleValue = getCommercialFinanceOrderSaleValue(order);
    const paymentMethod = normalizeCommercialFinancePaymentMethod(order?.paymentMethod);
    const saleYearMonth = getCommercialFinanceYearMonthFromDate(order?.saleDate);
    const rate = Number(ratePercent) || 0;

    if (!saleYearMonth) {
        return [];
    }

    if (paymentMethod === COMMERCIAL_FINANCE_PAYMENT_CASH) {
        const referenceYearMonth = addCommercialFinanceMonths(saleYearMonth, 1);
        const commissionAmount = roundCommercialFinanceMoney(saleValue * rate / 100);
        if (commissionAmount <= 0) {
            return [];
        }

        return [{
            installmentNumber: 1,
            installmentCount: 1,
            yearMonth: referenceYearMonth,
            clientInstallmentAmount: saleValue,
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

function buildCommercialFinanceConsultantMonthlyTotals(orders = []) {
    const totalsByConsultantMonth = {};

    orders.forEach(order => {
        const consultantUserId = Number(order?.consultantUserId || order?.consultor?.id);
        const yearMonth = getCommercialFinanceYearMonthFromDate(order?.saleDate);
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
            totalsByConsultantMonth[key].totalSales + getCommercialFinanceOrderSaleValue(order)
        );
        totalsByConsultantMonth[key].orderIds.push(Number(order.id));
    });

    return totalsByConsultantMonth;
}

function hasCommercialFinanceImportedCommissionRate(order) {
    const rate = Number(order?.commissionRatePercent);
    return Number.isFinite(rate) && rate > 0;
}

function getCommercialFinanceOrderCommissionRatePercent(order, rateByConsultantMonth = {}) {
    if (hasCommercialFinanceImportedCommissionRate(order)) {
        return roundCommercialFinanceMoney(Number(order.commissionRatePercent));
    }

    const consultantUserId = Number(order?.consultantUserId || order?.consultor?.id);
    const saleYearMonth = getCommercialFinanceYearMonthFromDate(order?.saleDate);
    if (!consultantUserId || !saleYearMonth) return 0;

    const rateInfo = rateByConsultantMonth[`${consultantUserId}:${saleYearMonth}`] || { ratePercent: 0 };
    return Number(rateInfo.ratePercent) || 0;
}

function monthCommercialFinanceOrdersUseImportedCommissionRates(orders = []) {
    const confirmedOrders = filterCommercialFinanceCommissionOrders(orders);
    return confirmedOrders.length > 0
        && confirmedOrders.every(order => hasCommercialFinanceImportedCommissionRate(order));
}

function buildCommercialFinanceCommissionReport(orders = [], targetsByYearMonth = {}) {
    const confirmedOrders = filterCommercialFinanceCommissionOrders(orders);
    const consultantTotals = buildCommercialFinanceConsultantMonthlyTotals(confirmedOrders);
    const rateByConsultantMonth = {};
    const saleEntries = [];

    Object.values(consultantTotals).forEach(entry => {
        const tiers = targetsByYearMonth[entry.yearMonth]?.tiers || [];
        const match = matchCommercialFinanceCommissionTier(entry.totalSales, tiers);
        rateByConsultantMonth[`${entry.consultantUserId}:${entry.yearMonth}`] = {
            ratePercent: match.ratePercent,
            totalSales: entry.totalSales,
            tier: match.tier
        };
    });

    confirmedOrders.forEach(order => {
        const consultantUserId = Number(order?.consultantUserId || order?.consultor?.id);
        const saleYearMonth = getCommercialFinanceYearMonthFromDate(order?.saleDate);
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
            saleValue: getCommercialFinanceOrderSaleValue(order),
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

function getCommercialFinanceTeamSalesInMonth(orders = [], yearMonth, options = {}) {
    const confirmedOnly = options.confirmedOnly !== false;
    const sourceOrders = confirmedOnly
        ? filterCommercialFinanceCommissionOrders(orders)
        : (orders || []);

    return roundCommercialFinanceMoney(
        sourceOrders.reduce((total, order) => {
            if (getCommercialFinanceYearMonthFromDate(order?.saleDate) !== yearMonth) {
                return total;
            }
            return total + getCommercialFinanceOrderSaleValue(order);
        }, 0)
    );
}

function buildCommercialFinanceMonthlyRealizedSalesMap(orders = [], year) {
    const normalizedYear = Number(year);
    if (!Number.isFinite(normalizedYear)) {
        return {};
    }

    return Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => {
            const yearMonth = buildCommercialFinanceYearMonthKey(normalizedYear, index + 1);
            return [
                yearMonth,
                getCommercialFinanceTeamSalesInMonth(orders, yearMonth, { confirmedOnly: false })
            ];
        })
    );
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

function buildCommercialFinanceCommissionEntryDrafts(orders = [], targetsByYearMonth = {}, saleYearMonth) {
    const monthOrders = filterCommercialFinanceOrdersBySaleYearMonth(orders, saleYearMonth);
    const confirmedOrders = filterCommercialFinanceCommissionOrders(monthOrders);
    const tiers = targetsByYearMonth[saleYearMonth]?.tiers || [];
    const report = buildCommercialFinanceCommissionReport(confirmedOrders, {
        [saleYearMonth]: { tiers }
    });
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

        entry.installments.forEach(installment => {
            entries.push({
                salesOrderId: Number(order.id),
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
        pendingCount: monthOrders.length - confirmedOrders.length,
        entries
    };
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

        const orderKey = String(entry.salesOrderId || entry.orderCode || entry.id);
        if (!rowsByOrder[orderKey]) {
            rowsByOrder[orderKey] = {
                salesOrderId: entry.salesOrderId,
                saleDate: entry.saleDate,
                orderCode: entry.orderCode || '',
                clientName: entry.clientName || '—',
                consultantName: entry.consultantName || '—',
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
        return cell && (cell.clientInstallmentAmount > 0 || cell.commissionAmount > 0);
    });
}
