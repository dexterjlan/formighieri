const COMMERCIAL_PANEL_PERIOD_LABELS = {
    this_year: 'Este ano',
    this_month: 'Este mês',
    last_30: 'Últimos 30 dias',
    last_90: 'Últimos 90 dias',
    last_year: 'Ano passado'
};

const COMMERCIAL_PANEL_MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const COMMERCIAL_PANEL_PALETTE = [
    '#ec4899', '#d4a017', '#f9a8d4', '#0f766e', '#84cc16',
    '#166534', '#6366f1', '#f97316', '#06b6d4', '#64748b'
];

const COMMERCIAL_PANEL_DEAL_SELECT = [
    'id, ownerUserId, stageId, status, value, lostReason, architectId, wonAt, lostAt, createdAt, owner:appUsers!ownerUserId(id, name), stage:DealStage(id, name, sortOrder)',
    'id, ownerUserId, stageId, status, value, lostReason, wonAt, lostAt, createdAt, owner:appUsers!ownerUserId(id, name), stage:DealStage(id, name, sortOrder)',
    'id, ownerUserId, stageId, status, value, lostReason, wonAt, lostAt, createdAt'
];

let comercialPanelPeriod = 'this_year';
let comercialPanelUserId = '';
let comercialPanelDealsCache = [];

function comercialPanelEmptyHtml(message) {
    return `<p class="text-xs text-slate-400 text-center py-8">${escapeHtml(message)}</p>`;
}

function comercialPanelPeriodLabel() {
    return COMMERCIAL_PANEL_PERIOD_LABELS[comercialPanelPeriod] || 'Este ano';
}

function padComercialPanelDatePart(value) {
    return String(value).padStart(2, '0');
}

function toComercialPanelLocalIso(date) {
    const year = date.getFullYear();
    const month = padComercialPanelDatePart(date.getMonth() + 1);
    const day = padComercialPanelDatePart(date.getDate());
    return `${year}-${month}-${day}`;
}

function getComercialPanelRanges(periodKey = comercialPanelPeriod) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let currentFrom;
    let currentTo = tomorrow;
    let previousFrom;
    let previousTo;

    if (periodKey === 'this_month') {
        currentFrom = new Date(now.getFullYear(), now.getMonth(), 1);
        previousFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousTo = currentFrom;
    } else if (periodKey === 'last_30' || periodKey === 'last_90') {
        const days = periodKey === 'last_90' ? 90 : 30;
        currentFrom = new Date(todayStart);
        currentFrom.setDate(currentFrom.getDate() - days);
        previousTo = currentFrom;
        previousFrom = new Date(previousTo);
        previousFrom.setDate(previousFrom.getDate() - days);
    } else if (periodKey === 'last_year') {
        currentFrom = new Date(now.getFullYear() - 1, 0, 1);
        currentTo = new Date(now.getFullYear(), 0, 1);
        previousFrom = new Date(now.getFullYear() - 2, 0, 1);
        previousTo = currentFrom;
    } else {
        currentFrom = new Date(now.getFullYear(), 0, 1);
        previousFrom = new Date(now.getFullYear() - 1, 0, 1);
        previousTo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1);
    }

    return { currentFrom, currentTo, previousFrom, previousTo, fetchFrom: previousFrom };
}

function isComercialPanelDateInRange(value, from, to) {
    const time = toComercialTimestamp(value);
    if (!time) return false;
    return time >= from.getTime() && time < to.getTime();
}

function getComercialPanelDealValue(deal) {
    const number = Number(deal?.value);
    return Number.isFinite(number) ? number : 0;
}

function getComercialPanelOwnerKey(deal) {
    return deal?.ownerUserId != null ? String(deal.ownerUserId) : 'none';
}

function getComercialPanelOwnerName(deal) {
    const name = String(deal?.owner?.name || '').trim();
    return name || 'Sem dono';
}

function getComercialPanelOwnerColor(ownerKey, colorMap) {
    if (colorMap.has(ownerKey)) return colorMap.get(ownerKey);
    const color = COMMERCIAL_PANEL_PALETTE[colorMap.size % COMMERCIAL_PANEL_PALETTE.length];
    colorMap.set(ownerKey, color);
    return color;
}

function formatComercialPanelCompactMoney(value) {
    const number = Number(value) || 0;
    if (number >= 1000000) {
        return `R$ ${(number / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    }
    if (number >= 1000) {
        return `R$ ${Math.round(number / 1000).toLocaleString('pt-BR')} mil`;
    }
    return typeof formatComercialMoney === 'function' ? formatComercialMoney(number) : String(number);
}

function formatComercialPanelDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const totalHours = Math.round(ms / 3600000);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (days <= 0) {
        return hours === 1 ? '1 hora' : `${hours} horas`;
    }
    const dayLabel = days === 1 ? '1 dia' : `${days} dias`;
    if (!hours) return dayLabel;
    const hourLabel = hours === 1 ? '1 hora' : `${hours} horas`;
    return `${dayLabel}, ${hourLabel}`;
}

function getComercialPanelCloseAt(deal) {
    if (deal?.status === 'won') return deal.wonAt || deal.updatedAt;
    if (deal?.status === 'lost') return deal.lostAt || deal.updatedAt;
    return null;
}

function fillComercialPanelUserSelect() {
    const select = document.getElementById('comercial-panel-user');
    const wrap = document.getElementById('comercial-panel-user-wrap');
    if (!select || !wrap) return;

    const show = canSeeAllDeals() && comercialOwnerFilter === 'all';
    wrap.classList.toggle('hidden', !show);
    if (!show) {
        comercialPanelUserId = '';
        select.value = '';
        return;
    }

    const current = comercialPanelUserId;
    select.innerHTML = '<option value="">Todos</option>';
    (comercialConsultantsCache || []).forEach(user => {
        const option = document.createElement('option');
        option.value = String(user.id);
        option.textContent = user.name || `Usuário #${user.id}`;
        select.appendChild(option);
    });
    if (current && [...select.options].some(option => option.value === current)) {
        select.value = current;
    } else {
        comercialPanelUserId = '';
        select.value = '';
    }
}

async function fetchComercialPanelDeals(fetchFrom) {
    const fromIso = toComercialPanelLocalIso(fetchFrom);
    const ownerUserId = canSeeAllDeals() && comercialOwnerFilter === 'all'
        ? (comercialPanelUserId ? Number(comercialPanelUserId) : null)
        : Number(currentUser?.id);
    if (!ownerUserId && !(canSeeAllDeals() && comercialOwnerFilter === 'all')) {
        comercialPanelDealsCache = [];
        return [];
    }
    const pageSize = 1000;
    let lastError = null;

    for (const select of COMMERCIAL_PANEL_DEAL_SELECT) {
        const deals = [];
        let from = 0;
        let failed = false;

        while (true) {
            let query = supabaseClient
                .from('Deal')
                .select(select)
                .or(`status.eq.open,createdAt.gte.${fromIso},wonAt.gte.${fromIso},lostAt.gte.${fromIso}`)
                .order('id', { ascending: true })
                .range(from, from + pageSize - 1);
            if (ownerUserId) query = query.eq('ownerUserId', ownerUserId);

            const { data, error } = await query;
            if (error) {
                lastError = error;
                failed = true;
                if (!/relationship|embed|schema cache|column/i.test(error.message || '')) {
                    console.error('fetchComercialPanelDeals:', error);
                    return [];
                }
                break;
            }

            deals.push(...(data || []));
            if (!data || data.length < pageSize) {
                comercialPanelDealsCache = deals;
                return deals;
            }
            from += pageSize;
        }

        if (!failed) {
            comercialPanelDealsCache = deals;
            return deals;
        }
    }

    console.error('fetchComercialPanelDeals:', lastError);
    comercialPanelDealsCache = [];
    return [];
}

function groupComercialPanelStarted(deals, range, colorMap) {
    const started = deals.filter(deal => isComercialPanelDateInRange(deal.createdAt, range.currentFrom, range.currentTo));
    const groups = new Map();
    started.forEach(deal => {
        const key = getComercialPanelOwnerKey(deal);
        const current = groups.get(key) || { key, name: getComercialPanelOwnerName(deal), count: 0 };
        current.count += 1;
        groups.set(key, current);
    });
    return [...groups.values()]
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))
        .map(item => ({ ...item, color: getComercialPanelOwnerColor(item.key, colorMap) }));
}

function groupComercialPanelOpen(deals, colorMap) {
    const open = (deals || []).filter(deal => deal.status === 'open');
    const groups = new Map();
    open.forEach(deal => {
        const key = getComercialPanelOwnerKey(deal);
        const current = groups.get(key) || {
            key,
            name: getComercialPanelOwnerName(deal),
            count: 0,
            value: 0
        };
        current.count += 1;
        current.value += getComercialPanelDealValue(deal);
        groups.set(key, current);
    });
    return [...groups.values()]
        .sort((a, b) => b.value - a.value || b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))
        .map(item => ({ ...item, color: getComercialPanelOwnerColor(item.key, colorMap) }));
}

function groupComercialPanelLostReasons(deals, range) {
    const lost = deals.filter(deal => (
        deal.status === 'lost' && isComercialPanelDateInRange(getComercialPanelCloseAt(deal), range.currentFrom, range.currentTo)
    ));
    const groups = new Map();
    lost.forEach(deal => {
        const name = String(deal.lostReason || '').trim() || 'Sem motivo';
        const current = groups.get(name) || { name, count: 0 };
        current.count += 1;
        groups.set(name, current);
    });
    return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
}

function groupComercialPanelWonByMonth(deals, range, colorMap) {
    const won = deals.filter(deal => (
        deal.status === 'won' && isComercialPanelDateInRange(getComercialPanelCloseAt(deal), range.currentFrom, range.currentTo)
    ));
    const owners = new Map();
    const months = [];
    if (comercialPanelPeriod === 'this_year' || comercialPanelPeriod === 'last_year') {
        const year = range.currentFrom.getFullYear();
        for (let month = 0; month < 12; month += 1) {
            months.push({
                key: `${year}-${padComercialPanelDatePart(month + 1)}`,
                label: COMMERCIAL_PANEL_MONTH_LABELS[month],
                year,
                month
            });
        }
    } else {
        const cursor = new Date(range.currentFrom.getFullYear(), range.currentFrom.getMonth(), 1);
        const end = new Date(range.currentTo.getFullYear(), range.currentTo.getMonth(), 1);
        while (cursor <= end && months.length < 12) {
            months.push({
                key: `${cursor.getFullYear()}-${padComercialPanelDatePart(cursor.getMonth() + 1)}`,
                label: COMMERCIAL_PANEL_MONTH_LABELS[cursor.getMonth()],
                year: cursor.getFullYear(),
                month: cursor.getMonth()
            });
            cursor.setMonth(cursor.getMonth() + 1);
        }
    }

    const monthMap = new Map(months.map(month => [month.key, { ...month, owners: new Map(), total: 0 }]));
    won.forEach(deal => {
        const closeAt = new Date(getComercialPanelCloseAt(deal));
        if (Number.isNaN(closeAt.getTime())) return;
        const key = `${closeAt.getFullYear()}-${padComercialPanelDatePart(closeAt.getMonth() + 1)}`;
        const bucket = monthMap.get(key);
        if (!bucket) return;
        const ownerKey = getComercialPanelOwnerKey(deal);
        const value = getComercialPanelDealValue(deal);
        const owner = owners.get(ownerKey) || { key: ownerKey, name: getComercialPanelOwnerName(deal) };
        owners.set(ownerKey, owner);
        bucket.owners.set(ownerKey, (bucket.owners.get(ownerKey) || 0) + value);
        bucket.total += value;
    });

    const ownerList = [...owners.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map(item => ({ ...item, color: getComercialPanelOwnerColor(item.key, colorMap) }));

    return {
        months: [...monthMap.values()],
        owners: ownerList,
        maxTotal: Math.max(0, ...[...monthMap.values()].map(item => item.total))
    };
}

function getComercialPanelStageSort(deal) {
    const embedded = Number(deal?.stage?.sortOrder);
    if (Number.isFinite(embedded)) return embedded;
    const stage = (comercialStagesCache || []).find(item => Number(item.id) === Number(deal?.stageId));
    return Number(stage?.sortOrder) || 0;
}

function buildComercialPanelFunnel(deals, range) {
    const cohort = deals.filter(deal => isComercialPanelDateInRange(deal.createdAt, range.currentFrom, range.currentTo));
    const openStages = (comercialStagesCache || [])
        .filter(stage => stage.isActive !== false && (stage.outcome || 'open') === 'open')
        .slice()
        .sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(b.name, 'pt-BR'));

    const steps = openStages.map(stage => {
        const reached = cohort.filter(deal => {
            if (deal.status === 'won') return true;
            return getComercialPanelStageSort(deal) >= Number(stage.sortOrder || 0);
        }).length;
        return { id: stage.id, name: stage.name, reached, isWon: false };
    });

    const wonCount = cohort.filter(deal => deal.status === 'won').length;
    steps.push({ id: 'won', name: 'Ganho', reached: wonCount, isWon: true });
    return { cohort, steps, wonCount };
}

function summarizeComercialPanelWonValue(deals, from, to) {
    const won = deals.filter(deal => deal.status === 'won' && isComercialPanelDateInRange(getComercialPanelCloseAt(deal), from, to));
    const withValue = won.filter(deal => getComercialPanelDealValue(deal) > 0);
    const total = withValue.reduce((sum, deal) => sum + getComercialPanelDealValue(deal), 0);
    return {
        count: withValue.length,
        average: withValue.length ? total / withValue.length : 0
    };
}

function summarizeComercialPanelDuration(deals, from, to) {
    const closed = deals.filter(deal => (
        (deal.status === 'won' || deal.status === 'lost')
        && isComercialPanelDateInRange(getComercialPanelCloseAt(deal), from, to)
        && toComercialTimestamp(deal.createdAt)
    ));
    if (!closed.length) return { count: 0, averageMs: null };
    const totalMs = closed.reduce((sum, deal) => {
        const closeAt = toComercialTimestamp(getComercialPanelCloseAt(deal));
        const createdAt = toComercialTimestamp(deal.createdAt);
        return sum + Math.max(0, closeAt - createdAt);
    }, 0);
    return { count: closed.length, averageMs: totalMs / closed.length };
}

function renderComercialPanelStartedChart(rows) {
    const target = document.getElementById('comercial-panel-started');
    if (!target) return;
    if (!rows.length) {
        target.innerHTML = comercialPanelEmptyHtml('Nenhum negócio iniciado no período.');
        return;
    }
    const max = Math.max(...rows.map(row => row.count), 1);
    target.innerHTML = `
        <div class="comercial-panel-bars" role="img" aria-label="Negócios iniciados por consultor">
            ${rows.map(row => `
                <div class="comercial-panel-bar-row">
                    <p class="comercial-panel-bar-label" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</p>
                    <div class="comercial-panel-bar-track">
                        <div class="comercial-panel-bar-fill" style="width:${Math.max(6, (row.count / max) * 100).toFixed(2)}%; background:${row.color};"></div>
                    </div>
                    <p class="comercial-panel-bar-value">${row.count}</p>
                </div>
            `).join('')}
        </div>
        <p class="comercial-panel-axis">Número de negócios</p>
    `;
}

function renderComercialPanelOpenChart(rows) {
    const target = document.getElementById('comercial-panel-open');
    if (!target) return;
    if (!rows.length) {
        target.innerHTML = comercialPanelEmptyHtml('Nenhum negócio em aberto.');
        return;
    }

    const maxCount = Math.max(...rows.map(row => row.count), 1);
    const maxValue = Math.max(...rows.map(row => row.value), 1);
    const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
    const totalValue = rows.reduce((sum, row) => sum + row.value, 0);

    target.innerHTML = `
        <div class="comercial-panel-open-legend">
            <span><i class="comercial-panel-swatch" style="background:#0f766e"></i> Quantidade</span>
            <span><i class="comercial-panel-swatch" style="background:#d4a017"></i> Valor</span>
        </div>
        <div class="comercial-panel-open-list" role="img" aria-label="Negócios em aberto por consultor">
            ${rows.map(row => `
                <div class="comercial-panel-open-row">
                    <p class="comercial-panel-bar-label" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</p>
                    <div class="comercial-panel-open-metrics">
                        <div class="comercial-panel-open-metric">
                            <span class="comercial-panel-open-metric-name">Qtd</span>
                            <div class="comercial-panel-bar-track">
                                <div class="comercial-panel-bar-fill" style="width:${Math.max(6, (row.count / maxCount) * 100).toFixed(2)}%; background:#0f766e;"></div>
                            </div>
                            <p class="comercial-panel-open-metric-value">${row.count.toLocaleString('pt-BR')}</p>
                        </div>
                        <div class="comercial-panel-open-metric">
                            <span class="comercial-panel-open-metric-name">Valor</span>
                            <div class="comercial-panel-bar-track">
                                <div class="comercial-panel-bar-fill" style="width:${Math.max(6, (row.value / maxValue) * 100).toFixed(2)}%; background:#d4a017;"></div>
                            </div>
                            <p class="comercial-panel-open-metric-value">${escapeHtml(formatComercialPanelCompactMoney(row.value))}</p>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        <p class="comercial-panel-open-total">Total em aberto: <strong>${totalCount.toLocaleString('pt-BR')}</strong> negócio${totalCount === 1 ? '' : 's'} · <strong>${escapeHtml(formatComercialMoney(totalValue))}</strong></p>
    `;
}

function renderComercialPanelLostChart(rows) {
    const target = document.getElementById('comercial-panel-lost');
    if (!target) return;
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    if (!total) {
        target.innerHTML = comercialPanelEmptyHtml('Nenhum negócio perdido no período.');
        return;
    }

    let cumulative = 0;
    const segments = rows.map((row, index) => {
        const pct = (row.count / total) * 100;
        const start = cumulative;
        cumulative += pct;
        row.color = COMMERCIAL_PANEL_PALETTE[index % COMMERCIAL_PANEL_PALETTE.length];
        return `${row.color} ${start.toFixed(2)}% ${cumulative.toFixed(2)}%`;
    });

    target.innerHTML = `
        <div class="comercial-panel-donut-wrap">
            <div class="comercial-panel-donut" style="background: conic-gradient(${segments.join(', ')});">
                <div class="comercial-panel-donut-center">
                    <strong>${total}</strong>
                    <span>perdidos</span>
                </div>
            </div>
            <ul class="comercial-panel-legend">
                ${rows.map(row => `
                    <li>
                        <span class="comercial-panel-swatch" style="background:${row.color}"></span>
                        <span class="min-w-0 truncate" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
                        <span class="whitespace-nowrap text-slate-600">${row.count} <span class="text-slate-400">(${((row.count / total) * 100).toFixed(0)}%)</span></span>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
}

function renderComercialPanelWonChart(data) {
    const target = document.getElementById('comercial-panel-won');
    if (!target) return;
    if (!data.owners.length || data.maxTotal <= 0) {
        target.innerHTML = comercialPanelEmptyHtml('Nenhum negócio ganho no período.');
        return;
    }

    const columns = data.months.map(month => {
        const stackHeight = data.maxTotal > 0 ? (month.total / data.maxTotal) * 100 : 0;
        const segments = data.owners
            .map(owner => {
                const value = month.owners.get(owner.key) || 0;
                if (value <= 0 || month.total <= 0) return '';
                const pct = (value / month.total) * 100;
                return `<div class="comercial-panel-stack-seg" style="height:${pct}%; background:${owner.color};" title="${escapeHtml(owner.name)} · ${formatComercialPanelCompactMoney(value)}"></div>`;
            })
            .join('');
        return `
            <div class="comercial-panel-month">
                <div class="comercial-panel-month-chart">
                    <div class="comercial-panel-month-stack" style="height:${Math.max(stackHeight, month.total > 0 ? 4 : 0)}%;">${segments}</div>
                </div>
                <p class="comercial-panel-month-label">${escapeHtml(month.label)}</p>
                <p class="comercial-panel-month-total">${month.total > 0 ? formatComercialPanelCompactMoney(month.total) : ''}</p>
            </div>
        `;
    }).join('');

    target.innerHTML = `
        <div class="comercial-panel-won-chart">
            <p class="comercial-panel-axis comercial-panel-axis--y">Valor do negócio (BRL)</p>
            <div class="comercial-panel-months">${columns}</div>
        </div>
        <ul class="comercial-panel-legend comercial-panel-legend--row">
            ${data.owners.map(owner => `
                <li>
                    <span class="comercial-panel-swatch" style="background:${owner.color}"></span>
                    <span>${escapeHtml(owner.name)}</span>
                </li>
            `).join('')}
        </ul>
    `;
}

function renderComercialPanelFunnel(funnel) {
    const target = document.getElementById('comercial-panel-funnel');
    if (!target) return;
    if (!funnel.cohort.length) {
        target.innerHTML = comercialPanelEmptyHtml('Nenhum negócio iniciado no período para montar a conversão.');
        return;
    }

    const maxReached = Math.max(...funnel.steps.map(step => step.reached), 1);
    const firstReached = funnel.steps[0]?.reached || 0;
    const winRate = firstReached ? Math.round((funnel.wonCount / firstReached) * 100) : 0;

    const rows = funnel.steps.map((step, index) => {
        const next = funnel.steps[index + 1];
        const conversion = next && step.reached
            ? Math.round((next.reached / step.reached) * 100)
            : null;
        const width = Math.max(18, (step.reached / maxReached) * 100);
        return `
            <div class="comercial-panel-funnel-row">
                <div class="comercial-panel-funnel-bar ${step.isWon ? 'is-won' : ''}" style="width:${width.toFixed(2)}%;">
                    <span class="comercial-panel-funnel-name">${escapeHtml(step.name)}</span>
                    <strong>${step.reached.toLocaleString('pt-BR')}</strong>
                </div>
                ${conversion != null ? `<span class="comercial-panel-funnel-rate">${conversion}%</span>` : ''}
            </div>
        `;
    }).join('');

    target.innerHTML = `
        <p class="text-xs text-slate-600 mb-3">Taxa de ganho é <strong class="text-slate-900">${winRate}%</strong> sobre os negócios iniciados no período.</p>
        <div class="comercial-panel-funnel">${rows}</div>
        <p class="text-[10px] text-slate-400 mt-3">Conversão aproximada pelo estágio atual (sem histórico de passagem entre colunas).</p>
    `;
}

function renderComercialPanelAverage(current, previous) {
    const target = document.getElementById('comercial-panel-avg');
    if (!target) return;
    if (!current.count) {
        target.innerHTML = comercialPanelEmptyHtml('Nenhum negócio ganho com valor no período.');
        return;
    }

    const delta = current.average - previous.average;
    const pct = previous.average > 0 ? (delta / previous.average) * 100 : null;
    const up = delta >= 0;
    const deltaLabel = previous.count
        ? `${up ? '+' : ''}${formatComercialMoney(delta)}${pct != null ? ` (${pct.toFixed(2).replace('.', ',')}%)` : ''}`
        : 'Sem base no período anterior';

    target.innerHTML = `
        <p class="comercial-panel-kpi">${escapeHtml(formatComercialMoney(current.average))}</p>
        <p class="comercial-panel-delta ${up ? 'is-up' : 'is-down'}">${escapeHtml(deltaLabel)}</p>
        <p class="comercial-panel-kpi-foot">Valor médio do negócio (BRL) · ${current.count} ganho${current.count === 1 ? '' : 's'}</p>
    `;
}

function renderComercialPanelDuration(summary) {
    const target = document.getElementById('comercial-panel-duration');
    if (!target) return;
    if (!summary.count || summary.averageMs == null) {
        target.innerHTML = comercialPanelEmptyHtml('Nenhum negócio ganho ou perdido no período.');
        return;
    }
    target.innerHTML = `
        <p class="comercial-panel-kpi">${escapeHtml(formatComercialPanelDuration(summary.averageMs))}</p>
        <p class="comercial-panel-kpi-foot">Duração média da criação até ganho ou perda · ${summary.count} negócio${summary.count === 1 ? '' : 's'}</p>
    `;
}

function setComercialPanelPeriodCaptions() {
    const label = comercialPanelPeriodLabel();
    const started = document.getElementById('comercial-panel-started-period');
    const lost = document.getElementById('comercial-panel-lost-period');
    const won = document.getElementById('comercial-panel-won-period');
    const funnel = document.getElementById('comercial-panel-funnel-period');
    const avg = document.getElementById('comercial-panel-avg-period');
    const duration = document.getElementById('comercial-panel-duration-period');
    if (started) started.textContent = label;
    if (lost) lost.textContent = `Perdido · ${label}`;
    if (won) won.textContent = `${label} · Ganho`;
    if (funnel) funnel.textContent = `Funil · Ganho, perdido · ${label}`;
    if (avg) avg.textContent = `${label} · Ganho`;
    if (duration) duration.textContent = `Ganho, perdido · ${label}`;
    const open = document.getElementById('comercial-panel-open-period');
    if (open) open.textContent = 'Agora · Aberto';
}

async function loadComercialPanel() {
    fillComercialPanelUserSelect();
    setComercialPanelPeriodCaptions();

    const range = getComercialPanelRanges();
    const deals = await fetchComercialPanelDeals(range.fetchFrom);
    const colorMap = new Map();

    renderComercialPanelOpenChart(groupComercialPanelOpen(deals, colorMap));
    renderComercialPanelStartedChart(groupComercialPanelStarted(deals, range, colorMap));
    renderComercialPanelLostChart(groupComercialPanelLostReasons(deals, range));
    renderComercialPanelWonChart(groupComercialPanelWonByMonth(deals, range, colorMap));
    renderComercialPanelFunnel(buildComercialPanelFunnel(deals, range));
    renderComercialPanelAverage(
        summarizeComercialPanelWonValue(deals, range.currentFrom, range.currentTo),
        summarizeComercialPanelWonValue(deals, range.previousFrom, range.previousTo)
    );
    renderComercialPanelDuration(summarizeComercialPanelDuration(deals, range.currentFrom, range.currentTo));
}

function bindComercialPanelEvents() {
    document.getElementById('comercial-tab-panel')?.addEventListener('click', () => setComercialTab('panel'));
    document.getElementById('comercial-panel-period')?.addEventListener('change', event => {
        comercialPanelPeriod = event.target.value || 'this_year';
        if (comercialActiveTab === 'panel') loadComercialPanel();
    });
    document.getElementById('comercial-panel-user')?.addEventListener('change', event => {
        comercialPanelUserId = event.target.value || '';
        if (comercialActiveTab === 'panel') loadComercialPanel();
    });
    document.getElementById('comercial-panel-refresh')?.addEventListener('click', () => {
        if (comercialActiveTab === 'panel') loadComercialPanel();
    });
}
