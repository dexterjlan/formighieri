const CRONOGRAMA_PEDIDO_SEGMENT_COLORS = {
    previsao: '#cbd5e1',
    andamento: '#8b5cf6',
    'rev-comercial': '#38bdf8',
    'rev-tecnica': '#0284c7',
    entregue: '#22c55e'
};

const CRONOGRAMA_PEDIDO_SEGMENT_LABELS = {
    previsao: 'Previsão',
    andamento: 'Projeto Técnico',
    'rev-comercial': 'Revisão comercial',
    'rev-tecnica': 'Revisão técnica',
    entregue: 'Entregue'
};

const CRONOGRAMA_PEDIDO_STATUS_PROJETO_TECNICO = 'Projeto Técnico';
const CRONOGRAMA_PEDIDO_STATUS_AGUARDANDO_APROVACAO = 'Aguardando Aprovação';

let gestaoCronogramaPedidoSelectedOrder = null;

function parseCronogramaPedidoDateOnly(value) {
    if (!value) return null;
    const part = String(value).split('T')[0];
    const [year, month, day] = part.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function addCronogramaPedidoDays(date, days) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
}

function cronogramaPedidoEndOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatCronogramaPedidoAxisDate(date) {
    if (!date) return '—';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function cronogramaPedidoDateToPercent(date, axisStart, axisEnd) {
    const startMs = axisStart.getTime();
    const endMs = axisEnd.getTime();
    const valueMs = date.getTime();
    if (endMs <= startMs) return 0;
    return Math.max(0, Math.min(100, ((valueMs - startMs) / (endMs - startMs)) * 100));
}

function mapCronogramaPedidoStatusKind(statusName) {
    if (statusName === CRONOGRAMA_PEDIDO_STATUS_PROJETO_TECNICO) return 'andamento';
    if (isOrderProjectEmRevisaoComercialConsStatus(statusName)) return 'rev-comercial';
    if (isOrderProjectEmRevisaoComercialProjStatus(statusName)) {
        return 'rev-tecnica';
    }
    if (statusName === CRONOGRAMA_PEDIDO_STATUS_AGUARDANDO_APROVACAO) return 'entregue';
    return null;
}

function isCronogramaPedidoEligibleProject(project) {
    if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) return false;
    if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) return false;
    return true;
}

function projectBelongsToCronogramaPedidoPhase(project, phase, phases = []) {
    if (!phase) return true;

    const phaseId = Number(phase.id);
    const projectPhaseId = Number(project.deliveryPhaseId);
    const firstPhaseId = Number(phases[0]?.id);

    if (projectPhaseId) {
        return projectPhaseId === phaseId;
    }

    return phaseId === firstPhaseId;
}

function historyEnteredProjetoTecnico(history) {
    return (history || []).some(entry => entry.newStatus?.name === CRONOGRAMA_PEDIDO_STATUS_PROJETO_TECNICO);
}

function historyReachedAguardandoAprovacao(history) {
    return (history || []).some(entry => entry.newStatus?.name === CRONOGRAMA_PEDIDO_STATUS_AGUARDANDO_APROVACAO);
}

function buildCronogramaPedidoPrevisaoSegment(project, history) {
    if (historyEnteredProjetoTecnico(history)) return null;

    const start = parseCronogramaPedidoDateOnly(project.technicalProjectForecastStartDate);
    const end = parseCronogramaPedidoDateOnly(project.technicalProjectForecastEndDate);
    if (!start || !end) return null;

    return {
        kind: 'previsao',
        start,
        end: cronogramaPedidoEndOfDay(end.getTime() >= start.getTime() ? end : start),
        label: CRONOGRAMA_PEDIDO_SEGMENT_LABELS.previsao
    };
}

function cronogramaPedidoDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function collapseCronogramaPedidoHistoryByDay(entries) {
    const byDay = new Map();

    for (const entry of entries || []) {
        const statusName = entry.newStatus?.name || '';
        const kind = mapCronogramaPedidoStatusKind(statusName);
        if (!kind) continue;

        const changedAt = new Date(entry.changedAt);
        if (Number.isNaN(changedAt.getTime())) continue;

        const dayKey = cronogramaPedidoDateKey(changedAt);
        byDay.set(dayKey, {
            kind,
            day: new Date(changedAt.getFullYear(), changedAt.getMonth(), changedAt.getDate())
        });
    }

    return [...byDay.values()].sort((left, right) => left.day.getTime() - right.day.getTime());
}

function buildCronogramaPedidoHistorySegments(history, deliveryDate) {
    const segments = [];
    const delivery = parseCronogramaPedidoDateOnly(deliveryDate);
    const collapsed = collapseCronogramaPedidoHistoryByDay(history);
    const today = getCronogramaPedidoToday();

    for (let index = 0; index < collapsed.length; index += 1) {
        const { kind, day: start } = collapsed[index];

        if (kind === 'entregue') {
            const inclusiveEnd = delivery || start;
            segments.push({
                kind,
                start,
                end: cronogramaPedidoEndOfDay(inclusiveEnd),
                label: CRONOGRAMA_PEDIDO_SEGMENT_LABELS.entregue
            });
            break;
        }

        const nextDay = collapsed[index + 1]?.day;
        let lastInclusiveDay = nextDay ? addCronogramaPedidoDays(nextDay, -1) : today;
        let end = cronogramaPedidoEndOfDay(lastInclusiveDay);

        if (delivery && lastInclusiveDay.getTime() > delivery.getTime()) {
            end = cronogramaPedidoEndOfDay(delivery);
            lastInclusiveDay = delivery;
        }

        if (lastInclusiveDay.getTime() < start.getTime()) continue;

        segments.push({
            kind,
            start,
            end,
            label: CRONOGRAMA_PEDIDO_SEGMENT_LABELS[kind]
        });
    }

    return segments;
}

function buildCronogramaPedidoPhaseAxis(projects) {
    const withDelivery = projects.filter(project => parseCronogramaPedidoDateOnly(project.deliveryDate));
    if (!withDelivery.length) {
        return null;
    }

    const forecastStarts = withDelivery
        .map(project => parseCronogramaPedidoDateOnly(project.technicalProjectForecastStartDate))
        .filter(Boolean);

    const deliveryDates = withDelivery
        .map(project => parseCronogramaPedidoDateOnly(project.deliveryDate))
        .filter(Boolean);

    let axisStart;
    if (forecastStarts.length) {
        axisStart = new Date(Math.min(...forecastStarts.map(date => date.getTime())));
    } else {
        const minDelivery = new Date(Math.min(...deliveryDates.map(date => date.getTime())));
        axisStart = addCronogramaPedidoDays(minDelivery, -30);
    }

    const maxDelivery = new Date(Math.max(...deliveryDates.map(date => date.getTime())));
    const axisEnd = addCronogramaPedidoDays(maxDelivery, 10);

    if (axisEnd.getTime() <= axisStart.getTime()) {
        axisEnd.setTime(axisStart.getTime() + 86400000);
    }

    return { axisStart, axisEnd };
}

function cronogramaPedidoEachDay(axisStart, axisEnd) {
    const days = [];
    let cursor = new Date(axisStart.getFullYear(), axisStart.getMonth(), axisStart.getDate());
    const end = new Date(axisEnd.getFullYear(), axisEnd.getMonth(), axisEnd.getDate());

    while (cursor.getTime() <= end.getTime()) {
        days.push(new Date(cursor));
        cursor = addCronogramaPedidoDays(cursor, 1);
    }

    return days;
}

function cronogramaPedidoDayAxisMinWidth(dayCount) {
    const pixelsPerDay = 28;
    return Math.max(dayCount * pixelsPerDay, 320);
}

function getCronogramaPedidoToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function cronogramaPedidoIsSameDay(left, right) {
    if (!left || !right) return false;
    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}

function isCronogramaPedidoTodayInAxis(axisStart, axisEnd) {
    const today = getCronogramaPedidoToday();
    const start = new Date(axisStart.getFullYear(), axisStart.getMonth(), axisStart.getDate());
    const end = new Date(axisEnd.getFullYear(), axisEnd.getMonth(), axisEnd.getDate());
    return today.getTime() >= start.getTime() && today.getTime() <= end.getTime();
}

function renderCronogramaPedidoDayAxisHtml(axisStart, axisEnd) {
    const days = cronogramaPedidoEachDay(axisStart, axisEnd);
    const minWidth = cronogramaPedidoDayAxisMinWidth(days.length);
    const today = getCronogramaPedidoToday();

    const cellsHtml = days.map((day, index) => {
        const left = cronogramaPedidoDateToPercent(day, axisStart, axisEnd);
        const nextDay = index + 1 < days.length
            ? days[index + 1]
            : addCronogramaPedidoDays(day, 1);
        const right = cronogramaPedidoDateToPercent(nextDay, axisStart, axisEnd);
        const width = Math.max(right - left, 0.4);
        const dayNumber = day.getDate();
        const showMonth = dayNumber === 1 || index === 0;
        const label = showMonth
            ? `${String(dayNumber).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`
            : String(dayNumber);
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        const isToday = cronogramaPedidoIsSameDay(day, today);
        const title = isToday
            ? `Hoje — ${formatCronogramaPedidoAxisDate(day)}`
            : formatCronogramaPedidoAxisDate(day);
        const cellClasses = [
            'gestao-cronograma-pedido__day-cell',
            isWeekend ? 'is-weekend' : '',
            isToday ? 'is-today' : ''
        ].filter(Boolean).join(' ');

        return `
            <div class="${cellClasses}"
                style="left:${left}%;width:${width}%"
                title="${escapeHtml(title)}">
                <span class="gestao-cronograma-pedido__day-cell-label">${escapeHtml(label)}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="gestao-cronograma-pedido__day-axis" style="min-width:${minWidth}px">
            ${cellsHtml}
        </div>
    `;
}

function renderCronogramaPedidoTodayMarker(axisStart, axisEnd) {
    if (!isCronogramaPedidoTodayInAxis(axisStart, axisEnd)) return '';

    const today = getCronogramaPedidoToday();
    const left = cronogramaPedidoDateToPercent(today, axisStart, axisEnd);
    const title = `Hoje: ${formatCronogramaPedidoAxisDate(today)}`;

    return `
        <div class="gestao-cronograma-pedido__today-marker"
            style="left:${left}%"
            title="${escapeHtml(title)}"></div>
    `;
}

function renderCronogramaPedidoDayAxisRow(axisStart, axisEnd) {
    return `
        <div class="gestao-cronograma-pedido__row gestao-cronograma-pedido__row--axis">
            <div class="gestao-cronograma-pedido__row-label gestao-cronograma-pedido__row-label--axis">
                <span class="gestao-cronograma-pedido__axis-caption">Dias</span>
            </div>
            <div class="gestao-cronograma-pedido__track gestao-cronograma-pedido__track--axis">
                ${renderCronogramaPedidoDayAxisHtml(axisStart, axisEnd)}
            </div>
        </div>
    `;
}

function renderCronogramaPedidoSegmentHtml(segment, axisStart, axisEnd) {
    const left = cronogramaPedidoDateToPercent(segment.start, axisStart, axisEnd);
    const right = cronogramaPedidoDateToPercent(segment.end, axisStart, axisEnd);
    const width = Math.max(right - left, 0.8);
    const color = CRONOGRAMA_PEDIDO_SEGMENT_COLORS[segment.kind] || '#94a3b8';
    const title = `${segment.label}\n${formatCronogramaPedidoAxisDate(segment.start)} → ${formatCronogramaPedidoAxisDate(segment.end)}`;

    return `
        <div class="gestao-cronograma-pedido__segment"
            style="left:${left}%;width:${width}%;background-color:${color}"
            title="${escapeHtml(title)}">
            <span class="gestao-cronograma-pedido__segment-label">${escapeHtml(segment.label)}</span>
        </div>
    `;
}

function renderCronogramaPedidoDeliveryMarker(deliveryDate, axisStart, axisEnd, ended) {
    const delivery = parseCronogramaPedidoDateOnly(deliveryDate);
    if (!delivery) return '';

    const left = cronogramaPedidoDateToPercent(delivery, axisStart, axisEnd);
    const title = `Entrega: ${formatCronogramaPedidoAxisDate(delivery)}${ended ? ' (encerrado)' : ''}`;

    return `
        <div class="gestao-cronograma-pedido__delivery-marker ${ended ? 'is-ended' : ''}"
            style="left:${left}%"
            title="${escapeHtml(title)}">
            <span class="gestao-cronograma-pedido__delivery-marker-label">Entrega</span>
        </div>
    `;
}

function getCronogramaPedidoProjectStatusName(project) {
    return project?.projectStatus?.name || 'Sem status';
}

function renderCronogramaPedidoProjectRow(project, history, axisStart, axisEnd) {
    const deliveryDate = project.deliveryDate;
    const statusName = getCronogramaPedidoProjectStatusName(project);
    if (!deliveryDate) {
        return `
            <div class="gestao-cronograma-pedido__row gestao-cronograma-pedido__row--invalid">
                <div class="gestao-cronograma-pedido__row-label">
                    <div class="gestao-cronograma-pedido__project-name">${escapeHtml(project.name || 'Projeto')}</div>
                    <div class="gestao-cronograma-pedido__project-status">${escapeHtml(statusName)}</div>
                </div>
                <div class="gestao-cronograma-pedido__row-message">
                    Não é possível gerar — sem data de entrega do projeto.
                </div>
            </div>
        `;
    }

    const previsaoSegment = buildCronogramaPedidoPrevisaoSegment(project, history);
    const historySegments = buildCronogramaPedidoHistorySegments(history, deliveryDate);
    const segments = [
        ...(previsaoSegment ? [previsaoSegment] : []),
        ...historySegments
    ];

    const hasForecast = Boolean(
        project.technicalProjectForecastStartDate && project.technicalProjectForecastEndDate
    );
    const previsaoHint = !historyEnteredProjetoTecnico(history) && !hasForecast
        ? '<span class="gestao-cronograma-pedido__sem-previsao">Sem previsão</span>'
        : '';

    const ended = historyReachedAguardandoAprovacao(history);
    const segmentsHtml = segments.map(segment => renderCronogramaPedidoSegmentHtml(segment, axisStart, axisEnd)).join('');
    const deliveryMarker = renderCronogramaPedidoDeliveryMarker(deliveryDate, axisStart, axisEnd, ended);
    const todayMarker = renderCronogramaPedidoTodayMarker(axisStart, axisEnd);
    const dayCount = cronogramaPedidoEachDay(axisStart, axisEnd).length;
    const trackMinWidth = cronogramaPedidoDayAxisMinWidth(dayCount);

    return `
        <div class="gestao-cronograma-pedido__row">
            <div class="gestao-cronograma-pedido__row-label">
                <div class="gestao-cronograma-pedido__project-name">${escapeHtml(project.name || 'Projeto')}</div>
                <div class="gestao-cronograma-pedido__project-status">${escapeHtml(statusName)}</div>
                ${previsaoHint}
            </div>
            <div class="gestao-cronograma-pedido__track">
                <div class="gestao-cronograma-pedido__track-inner" style="min-width:${trackMinWidth}px">
                    ${segmentsHtml || '<span class="gestao-cronograma-pedido__track-empty">Sem períodos registrados</span>'}
                    ${todayMarker}
                    ${deliveryMarker}
                </div>
            </div>
        </div>
    `;
}

function renderCronogramaPedidoLegend() {
    const items = Object.entries(CRONOGRAMA_PEDIDO_SEGMENT_LABELS).map(([kind, label]) => `
        <span class="gestao-cronograma-pedido__legend-item">
            <span class="gestao-cronograma-pedido__legend-swatch" style="background-color:${CRONOGRAMA_PEDIDO_SEGMENT_COLORS[kind]}"></span>
            ${escapeHtml(label)}
        </span>
    `).join('');

    return `
        <div class="gestao-cronograma-pedido__legend">
            ${items}
            <span class="gestao-cronograma-pedido__legend-item">
                <span class="gestao-cronograma-pedido__legend-marker"></span>
                Data de entrega
            </span>
            <span class="gestao-cronograma-pedido__legend-item">
                <span class="gestao-cronograma-pedido__legend-marker gestao-cronograma-pedido__legend-marker--today"></span>
                Hoje
            </span>
        </div>
    `;
}

function renderCronogramaPedidoPhaseBlock(phase, projects, historiesByProjectId) {
    const axis = buildCronogramaPedidoPhaseAxis(projects.filter(project => project.deliveryDate));
    const phaseTitle = phase?.name
        ? `Fase: ${phase.name}`
        : 'Pedido sem fases de entrega';

    if (!axis) {
        const rows = projects.map(project => renderCronogramaPedidoProjectRow(project, historiesByProjectId[project.id] || [], new Date(), addCronogramaPedidoDays(new Date(), 1))).join('');
        return `
            <section class="gestao-cronograma-pedido__phase">
                <h4 class="gestao-cronograma-pedido__phase-title">${escapeHtml(phaseTitle)}</h4>
                ${rows || '<p class="text-xs text-slate-400">Nenhum projeto nesta fase.</p>'}
            </section>
        `;
    }

    const { axisStart, axisEnd } = axis;
    const rows = projects.map(project => renderCronogramaPedidoProjectRow(
        project,
        historiesByProjectId[project.id] || [],
        axisStart,
        axisEnd
    )).join('');

    return `
        <section class="gestao-cronograma-pedido__phase">
            <div class="gestao-cronograma-pedido__phase-header">
                <h4 class="gestao-cronograma-pedido__phase-title">${escapeHtml(phaseTitle)}</h4>
            </div>
            ${renderCronogramaPedidoLegend()}
            <div class="gestao-cronograma-pedido__rows">
                ${renderCronogramaPedidoDayAxisRow(axisStart, axisEnd)}
                ${rows || '<p class="text-xs text-slate-400">Nenhum projeto nesta fase.</p>'}
            </div>
        </section>
    `;
}

async function fetchCronogramaPedidoOrderByCode(orderCode) {
    const normalizedCode = String(orderCode || '').trim();
    if (!normalizedCode) {
        throw new Error('Informe o código do pedido.');
    }

    const orderRelations = 'client:Client(id, name, isActive), consultor:appUsers!consultantUserId(id, name)';
    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select(`*, ${orderRelations}`)
        .ilike('orderCode', normalizedCode)
        .order('createdAt', { ascending: false })
        .limit(5);

    if (error) throw error;

    const exact = (data || []).find(order => String(order.orderCode || '').toLowerCase() === normalizedCode.toLowerCase());
    const order = exact || (data || [])[0];
    if (!order) {
        throw new Error(`Pedido "${normalizedCode}" não encontrado.`);
    }

    const projectsByOrderId = typeof fetchGestaoProjectsByOrderIds === 'function'
        ? await fetchGestaoProjectsByOrderIds([order.id])
        : {};
    order.projects = (projectsByOrderId[order.id] || []).filter(isCronogramaPedidoEligibleProject);

    if (typeof fetchGestaoOrderPhasesByOrderIds === 'function') {
        const phasesByOrderId = await fetchGestaoOrderPhasesByOrderIds([order.id]);
        order.deliveryPhases = phasesByOrderId[order.id] || [];
    }

    return order;
}

async function loadCronogramaPedidoHistories(projects) {
    const historiesByProjectId = {};
    const fetchHistory = typeof fetchOrderProjectStatusHistory === 'function'
        ? fetchOrderProjectStatusHistory
        : null;

    if (!fetchHistory) {
        return historiesByProjectId;
    }

    await Promise.all((projects || []).map(async project => {
        try {
            historiesByProjectId[project.id] = await fetchHistory(project.id);
        } catch (error) {
            console.warn('loadCronogramaPedidoHistories:', project.id, error);
            historiesByProjectId[project.id] = [];
        }
    }));

    return historiesByProjectId;
}

function groupCronogramaPedidoProjectsByPhase(order) {
    const projects = (order.projects || []).filter(isCronogramaPedidoEligibleProject);
    const phases = typeof orderHasGestaoDeliveryPhases === 'function' && orderHasGestaoDeliveryPhases(order)
        ? order.deliveryPhases
        : [null];

    return phases.map(phase => ({
        phase,
        projects: projects
            .filter(project => projectBelongsToCronogramaPedidoPhase(project, phase, phases))
            .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR'))
    }));
}

async function renderGestaoCronogramaPedido(order) {
    const container = document.getElementById('gestao-cronograma-pedido-content');
    const subtitle = document.getElementById('gestao-cronograma-pedido-subtitle');
    if (!container) return;

    if (!order) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-12">Selecione um pedido para visualizar o cronograma.</p>';
        if (subtitle) subtitle.textContent = '';
        return;
    }

    const clientName = typeof getOrderClientName === 'function' ? getOrderClientName(order) : '';
    if (subtitle) {
        subtitle.textContent = `${order.orderCode || '—'}${clientName ? ` — ${clientName}` : ''}`;
    }

    const phaseGroups = groupCronogramaPedidoProjectsByPhase(order);
    const allProjects = phaseGroups.flatMap(group => group.projects);

    if (!allProjects.length) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-12">Este pedido não possui projetos elegíveis para o cronograma.</p>';
        return;
    }

    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando cronograma...</p>';

    const historiesByProjectId = await loadCronogramaPedidoHistories(allProjects);
    const phasesHtml = phaseGroups
        .map(group => renderCronogramaPedidoPhaseBlock(group.phase, group.projects, historiesByProjectId))
        .join('');

    container.innerHTML = phasesHtml;
}

async function loadGestaoCronogramaPedidoByOrderCode(orderCode) {
    const order = await fetchCronogramaPedidoOrderByCode(orderCode);
    gestaoCronogramaPedidoSelectedOrder = order;
    await renderGestaoCronogramaPedido(order);
    return order;
}

function openGestaoCronogramaPedidoOrderPicker() {
    if (typeof openOrderCodePicker !== 'function') return;

    openOrderCodePicker({
        orderInputId: 'gestao-cronograma-pedido-order-code',
        onApply: async ({ orderCode }) => {
            if (!orderCode) return;
            await loadGestaoCronogramaPedidoByOrderCode(orderCode);
        }
    });
}

async function loadGestaoOrderSchedule() {
    const input = document.getElementById('gestao-cronograma-pedido-order-code');
    const orderCode = input?.value.trim() || gestaoCronogramaPedidoSelectedOrder?.orderCode || '';

    if (!orderCode) {
        await renderGestaoCronogramaPedido(null);
        return;
    }

    try {
        await loadGestaoCronogramaPedidoByOrderCode(orderCode);
    } catch (error) {
        console.error('loadGestaoCronogramaPedido:', error);
        const container = document.getElementById('gestao-cronograma-pedido-content');
        if (container) {
            container.innerHTML = `<p class="text-xs text-red-500 text-center py-12">${escapeHtml(error.message || 'Erro ao carregar cronograma.')}</p>`;
        }
    }
}

function showGestaoCronogramaPedidoPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-cronograma-pedido-panel')?.classList.remove('hidden');
    setGestaoNavActive('cronograma-pedido');
    renderGestaoCronogramaPedido(gestaoCronogramaPedidoSelectedOrder);
}

function bindGestaoOrderScheduleEvents() {
    document.getElementById('btn-gestao-cronograma-pedido-load')?.addEventListener('click', () => {
        loadGestaoOrderSchedule();
    });

    document.getElementById('btn-gestao-cronograma-pedido-pick-order')?.addEventListener('click', () => {
        openGestaoCronogramaPedidoOrderPicker();
    });

    document.getElementById('gestao-cronograma-pedido-order-code')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loadGestaoOrderSchedule();
        }
    });
}

window.showGestaoCronogramaPedidoPanel = showGestaoCronogramaPedidoPanel;
window.loadGestaoOrderSchedule = loadGestaoOrderSchedule;
window.bindGestaoOrderScheduleEvents = bindGestaoOrderScheduleEvents;
window.loadGestaoCronogramaPedido = loadGestaoOrderSchedule;
window.bindGestaoCronogramaPedidoEvents = bindGestaoOrderScheduleEvents;

const loadGestaoCronogramaPedido = loadGestaoOrderSchedule;
const bindGestaoCronogramaPedidoEvents = bindGestaoOrderScheduleEvents;
