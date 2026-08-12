const GESTAO_GANTT_STATUS_START = 'Aguardando Projeto Técnico';
const GESTAO_GANTT_STATUS_END = 'Implantação';
const GESTAO_GANTT_WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const GESTAO_GANTT_DESIGNER_PALETTE = [
    { from: '#4f46e5', to: '#6366f1' },
    { from: '#0d9488', to: '#14b8a6' },
    { from: '#dc2626', to: '#ef4444' },
    { from: '#d97706', to: '#f59e0b' },
    { from: '#7c3aed', to: '#8b5cf6' },
    { from: '#db2777', to: '#ec4899' },
    { from: '#0891b2', to: '#06b6d4' },
    { from: '#65a30d', to: '#84cc16' },
    { from: '#c2410c', to: '#ea580c' },
    { from: '#4338ca', to: '#5b21b6' }
];

let gestaoGanttMonthAnchor = startOfGestaoGanttMonth(new Date());
let gestaoGanttProjectsCache = [];
let gestaoGanttProjectClientFilter = '';
let gestaoGanttProjectDesignerFilter = '';
let gestaoGanttCalendarClientFilter = '';
let gestaoGanttCalendarDesignerFilter = '';
let gestaoGanttEventsBound = false;
let gestaoGanttSaving = false;

function isProgramacaoProjetosReadOnly() {
    return typeof canEditProgramacaoProjetos === 'function'
        ? !canEditProgramacaoProjetos()
        : !canAccessGestao();
}

function applyProgramacaoProjetosReadOnlyUi() {
    const panel = document.getElementById('gestao-gantt-panel');
    const readOnly = isProgramacaoProjetosReadOnly();
    panel?.classList.toggle('gestao-gantt-readonly', readOnly);
    document.getElementById('gestao-gantt-readonly-notice')?.classList.toggle('hidden', !readOnly);
    document.querySelector('#gestao-gantt-content .gestao-gantt-layout')
        ?.classList.toggle('gestao-gantt-layout--calendar-only', readOnly);
}

function updateProgramacaoProjetosNavVisibility() {
    const button = document.getElementById('gestao-nav-gantt');
    if (button) {
        button.classList.toggle('hidden', !canViewProgramacaoProjetos());
    }
}

window.applyProgramacaoProjetosReadOnlyUi = applyProgramacaoProjetosReadOnlyUi;
window.updateProgramacaoProjetosNavVisibility = updateProgramacaoProjetosNavVisibility;

const GESTAO_GANTT_DESIGNER_FILTER_NONE = 'none';

function startOfGestaoGanttMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfGestaoGanttMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function gestaoGanttAddDays(date, days) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
}

function gestaoGanttToDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function gestaoGanttParseDateKey(dateKey) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function gestaoGanttDaysBetween(startDate, endDate) {
    const ms = endDate.getTime() - startDate.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatGestaoGanttMonthYearLabel(date) {
    const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatGestaoGanttMonthDayRangeLabel(monthAnchor = gestaoGanttMonthAnchor) {
    const monthEnd = endOfGestaoGanttMonth(monthAnchor);
    const lastDay = monthEnd.getDate();
    const monthName = monthAnchor.toLocaleDateString('pt-BR', { month: 'long' });
    const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return `1–${lastDay} ${monthLabel}`;
}

function formatGestaoGanttDayNumber(dateKey) {
    const date = gestaoGanttParseDateKey(dateKey);
    if (!date) return '—';
    return String(date.getDate());
}

function getGestaoGanttMonthDateKeys() {
    const monthStart = startOfGestaoGanttMonth(gestaoGanttMonthAnchor);
    const monthEnd = endOfGestaoGanttMonth(gestaoGanttMonthAnchor);
    const keys = [];

    for (let cursor = new Date(monthStart); cursor <= monthEnd; cursor = gestaoGanttAddDays(cursor, 1)) {
        keys.push(gestaoGanttToDateKey(cursor));
    }

    return keys;
}

function buildGestaoGanttMonthWeeks(monthAnchor = gestaoGanttMonthAnchor) {
    const monthStart = startOfGestaoGanttMonth(monthAnchor);
    const monthEnd = endOfGestaoGanttMonth(monthAnchor);
    const weeks = [];

    let weekStart = new Date(monthStart);
    weekStart = gestaoGanttAddDays(weekStart, -weekStart.getDay());

    while (weekStart <= monthEnd) {
        const days = [];

        for (let index = 0; index < 7; index += 1) {
            const date = gestaoGanttAddDays(weekStart, index);
            days.push({
                dateKey: gestaoGanttToDateKey(date),
                inMonth: date.getMonth() === monthAnchor.getMonth()
                    && date.getFullYear() === monthAnchor.getFullYear()
            });
        }

        weeks.push({ weekStart: new Date(weekStart), days });
        weekStart = gestaoGanttAddDays(weekStart, 7);
    }

    return weeks;
}

function matchesGestaoGanttClientFilter(entry, clientQuery) {
    const query = String(clientQuery || '').trim().toLowerCase();
    if (!query) return true;

    const clientName = (entry.order.cliente?.nome || '').toLowerCase();
    return clientName.includes(query);
}

function matchesGestaoGanttDesignerFilter(project, designerFilter) {
    const filter = String(designerFilter || '');
    if (!filter) return true;

    const designerId = Number(project?.designerId) || 0;
    if (filter === GESTAO_GANTT_DESIGNER_FILTER_NONE) return !designerId;

    return designerId === Number(filter);
}

function getGestaoGanttProjectListEntries() {
    return gestaoGanttProjectsCache.filter(entry =>
        matchesGestaoGanttClientFilter(entry, gestaoGanttProjectClientFilter)
        && matchesGestaoGanttDesignerFilter(entry.project, gestaoGanttProjectDesignerFilter)
    );
}

function getGestaoGanttCalendarEntries() {
    return gestaoGanttProjectsCache.filter(entry =>
        matchesGestaoGanttClientFilter(entry, gestaoGanttCalendarClientFilter)
        && matchesGestaoGanttDesignerFilter(entry.project, gestaoGanttCalendarDesignerFilter)
    );
}

function renderGestaoGanttDesignerFilterOptions(selectedValue) {
    const normalizedSelected = String(selectedValue || '');

    const projetistaOptions = (gestaoProjetistasCache || []).map(projetista => {
        const selected = normalizedSelected === String(projetista.id) ? 'selected' : '';
        return `<option value="${projetista.id}" ${selected}>${escapeHtml(projetista.name)}</option>`;
    }).join('');

    return `
        <option value="">Todos os projetistas</option>
        <option value="${GESTAO_GANTT_DESIGNER_FILTER_NONE}" ${normalizedSelected === GESTAO_GANTT_DESIGNER_FILTER_NONE ? 'selected' : ''}>Sem projetista</option>
        ${projetistaOptions}
    `;
}

function getGestaoGanttProjectListEmptyMessage() {
    const clientQuery = String(gestaoGanttProjectClientFilter || '').trim();
    const designerFilter = String(gestaoGanttProjectDesignerFilter || '');

    if (clientQuery && designerFilter === GESTAO_GANTT_DESIGNER_FILTER_NONE) {
        return `Nenhum projeto sem projetista para cliente contendo "${escapeHtml(clientQuery)}".`;
    }
    if (clientQuery && designerFilter) {
        const designerName = getGestaoGanttDesignerNameById(designerFilter);
        return `Nenhum projeto de ${escapeHtml(designerName)} para cliente contendo "${escapeHtml(clientQuery)}".`;
    }
    if (clientQuery) {
        return `Nenhum projeto para cliente contendo "${escapeHtml(clientQuery)}".`;
    }
    if (designerFilter === GESTAO_GANTT_DESIGNER_FILTER_NONE) {
        return 'Nenhum projeto sem projetista neste período.';
    }
    if (designerFilter) {
        const designerName = getGestaoGanttDesignerNameById(designerFilter);
        return `Nenhum projeto para o projetista ${escapeHtml(designerName)}.`;
    }

    return `Nenhum projeto entre "${GESTAO_GANTT_STATUS_START}" e "${GESTAO_GANTT_STATUS_END}".`;
}

function getGestaoGanttStatusRangeBounds(statuses) {
    const startStatus = statuses.find(status => status.name === GESTAO_GANTT_STATUS_START);
    const endStatus = statuses.find(status => status.name === GESTAO_GANTT_STATUS_END);
    return {
        minSort: startStatus?.sortOrder ?? null,
        maxSort: endStatus?.sortOrder ?? null
    };
}

function getGestaoGanttProjectStatusSortOrder(project, statusById = {}) {
    const fromJoin = project?.projectStatus?.sortOrder;
    if (fromJoin != null) return Number(fromJoin);
    const status = statusById[project?.statusId];
    return status?.sortOrder != null ? Number(status.sortOrder) : 9999;
}

function isGestaoGanttVisibleProject(project) {
    if (typeof isComplementarOrderProject === 'function' && isComplementarOrderProject(project)) return false;
    if (typeof isSubstituidoOrderProject === 'function' && isSubstituidoOrderProject(project)) return false;
    return true;
}

function isGestaoGanttProjectInStatusRange(project, minSort, maxSort, statusById) {
    if (minSort == null || maxSort == null) return false;
    const sortOrder = getGestaoGanttProjectStatusSortOrder(project, statusById);
    return sortOrder >= minSort && sortOrder <= maxSort;
}

function getGestaoGanttDesignerNameById(designerId) {
    const normalizedId = Number(designerId);
    if (!normalizedId) return 'Sem projetista';
    const fromCache = (gestaoProjetistasCache || []).find(item => Number(item.id) === normalizedId);
    return fromCache?.name || 'Projetista';
}

function getGestaoGanttDesignerName(project) {
    if (project?.designer?.name) return project.designer.name;
    return getGestaoGanttDesignerNameById(project?.designerId);
}

function getGestaoGanttDesignerColorIndex(designerId) {
    const key = String(designerId || 'none');
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
        hash = ((hash << 5) - hash) + key.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash) % GESTAO_GANTT_DESIGNER_PALETTE.length;
}

function getGestaoGanttDesignerBarStyle(designerId) {
    const colors = GESTAO_GANTT_DESIGNER_PALETTE[getGestaoGanttDesignerColorIndex(designerId)];
    return `--gestao-gantt-bar-from: ${colors.from}; --gestao-gantt-bar-to: ${colors.to};`;
}

function getGestaoGanttPrevisaoInputValue(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).slice(0, 10);
}

function getGestaoGanttPrevisaoInputMaxDate(deliveryDate) {
    if (!deliveryDate) return '';
    return String(deliveryDate).slice(0, 10);
}

function validateGestaoGanttPrevisao(inicioDate, previsaoDate, deliveryDate) {
    if (!inicioDate) {
        alertAppDialog('Informe o início previsto do projeto técnico.');
        return false;
    }
    if (!previsaoDate) {
        alertAppDialog('Informe a previsão de conclusão do projeto técnico.');
        return false;
    }
    if (!isPrevisaoProjetoTecnicoRangeValid(inicioDate, previsaoDate, deliveryDate)) {
        alertAppDialog(
            'O início deve ser anterior ou igual à previsão de conclusão.',
            { variant: 'warning', title: 'Aviso' }
        );
        return false;
    }
    return true;
}

function getGestaoGanttProjectForecastRange(project) {
    const endKey = String(project?.previsaoConclusaoProjetoTecnico || '').split('T')[0];
    const startKey = String(project?.technicalProjectForecastStartDate || '').split('T')[0];

    if (!endKey && !startKey) return null;

    const endDate = gestaoGanttParseDateKey(endKey || startKey);
    const startDate = gestaoGanttParseDateKey(startKey || endKey);
    if (!startDate || !endDate) return null;

    const normalizedStart = startDate <= endDate ? startDate : endDate;
    const normalizedEnd = endDate >= startDate ? endDate : startDate;

    return {
        startKey: gestaoGanttToDateKey(normalizedStart),
        endKey: gestaoGanttToDateKey(normalizedEnd)
    };
}

function getGestaoGanttBarPlacementForWeek(project, weekDays) {
    const forecast = getGestaoGanttProjectForecastRange(project);
    if (!forecast || !weekDays.length) return null;

    const weekStart = gestaoGanttParseDateKey(weekDays[0].dateKey);
    const weekEnd = gestaoGanttParseDateKey(weekDays[6].dateKey);
    const forecastStart = gestaoGanttParseDateKey(forecast.startKey);
    const forecastEnd = gestaoGanttParseDateKey(forecast.endKey);

    if (!weekStart || !weekEnd || !forecastStart || !forecastEnd) return null;
    if (forecastEnd < weekStart || forecastStart > weekEnd) return null;

    const visibleStart = forecastStart < weekStart ? weekStart : forecastStart;
    const visibleEnd = forecastEnd > weekEnd ? weekEnd : forecastEnd;
    const startCol = gestaoGanttDaysBetween(weekStart, visibleStart) + 1;
    const span = gestaoGanttDaysBetween(visibleStart, visibleEnd) + 1;

    return { startCol, span };
}

function getGestaoGanttBarPlacement(project, monthDateKeys) {
    const forecast = getGestaoGanttProjectForecastRange(project);
    if (!forecast || !monthDateKeys.length) return null;

    const monthStart = gestaoGanttParseDateKey(monthDateKeys[0]);
    const monthEnd = gestaoGanttParseDateKey(monthDateKeys[monthDateKeys.length - 1]);
    const forecastStart = gestaoGanttParseDateKey(forecast.startKey);
    const forecastEnd = gestaoGanttParseDateKey(forecast.endKey);

    if (!monthStart || !monthEnd || !forecastStart || !forecastEnd) return null;
    if (forecastEnd < monthStart || forecastStart > monthEnd) return null;

    const visibleStart = forecastStart < monthStart ? monthStart : forecastStart;
    const visibleEnd = forecastEnd > monthEnd ? monthEnd : forecastEnd;
    const startCol = gestaoGanttDaysBetween(monthStart, visibleStart) + 1;
    const span = gestaoGanttDaysBetween(visibleStart, visibleEnd) + 1;

    return { startCol, span };
}

function gestaoGanttPlacementsOverlap(left, right) {
    if (!left || !right) return false;
    const leftEnd = left.startCol + left.span;
    const rightEnd = right.startCol + right.span;
    return left.startCol < rightEnd && right.startCol < leftEnd;
}

function assignGestaoGanttDesignerLanes(projectItems, weekDays) {
    const sorted = [...projectItems].sort((left, right) =>
        String(left.forecast.startKey).localeCompare(String(right.forecast.startKey))
        || Number(left.project.id) - Number(right.project.id)
    );

    const lanes = [];

    sorted.forEach(item => {
        const placement = getGestaoGanttBarPlacementForWeek(item.project, weekDays);
        if (!placement) return;

        let targetLane = lanes.find(lane =>
            !lane.some(existing => gestaoGanttPlacementsOverlap(existing.placement, placement))
        );

        if (!targetLane) {
            targetLane = [];
            lanes.push(targetLane);
        }

        targetLane.push({ ...item, placement });
    });

    if (!lanes.length) lanes.push([]);
    return lanes;
}

function buildGestaoGanttProjects(orders, statuses) {
    const { minSort, maxSort } = getGestaoGanttStatusRangeBounds(statuses);
    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
    const entries = [];

    (orders || []).forEach(order => {
        (order.projects || []).forEach(project => {
            if (!isGestaoGanttVisibleProject(project)) return;
            if (!isGestaoGanttProjectInStatusRange(project, minSort, maxSort, statusById)) return;

            entries.push({
                project,
                order,
                statusSort: getGestaoGanttProjectStatusSortOrder(project, statusById)
            });
        });
    });

    entries.sort((left, right) => {
        if (left.statusSort !== right.statusSort) return left.statusSort - right.statusSort;

        const codeCompare = String(left.order.orderCode || '').localeCompare(
            String(right.order.orderCode || ''),
            'pt-BR',
            { numeric: true }
        );
        if (codeCompare !== 0) return codeCompare;

        return String(left.project.name || '').localeCompare(String(right.project.name || ''), 'pt-BR');
    });

    return entries;
}

function buildGestaoGanttDesignerGroups(entries) {
    const groups = new Map();

    entries.forEach(entry => {
        const forecast = getGestaoGanttProjectForecastRange(entry.project);
        if (!forecast) return;

        const designerId = Number(entry.project.designerId) || 0;
        const groupKey = designerId || 'none';

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                designerId,
                designerName: getGestaoGanttDesignerName(entry.project),
                projects: []
            });
        }

        groups.get(groupKey).projects.push({
            ...entry,
            forecast
        });
    });

    return [...groups.values()].sort((left, right) =>
        left.designerName.localeCompare(right.designerName, 'pt-BR')
    );
}

function updateGestaoGanttProjectInCache(projectId, updates) {
    const normalizedId = Number(projectId);
    const entry = gestaoGanttProjectsCache.find(item => Number(item.project.id) === normalizedId);
    if (!entry) return;

    Object.assign(entry.project, updates);
}

function renderGestaoGanttDesignerOptions(selectedId) {
    const options = (gestaoProjetistasCache || []).map(projetista => {
        const selected = Number(projetista.id) === Number(selectedId) ? 'selected' : '';
        return `<option value="${projetista.id}" ${selected}>${escapeHtml(projetista.name)}</option>`;
    });

    return `<option value="">Selecione...</option>${options.join('')}`;
}

function renderGestaoGanttProjectCard(entry) {
    const { project, order } = entry;
    const statusName = project.projectStatus?.name || 'Status';
    const clientName = order.cliente?.nome || 'Cliente';
    const orderCode = order.orderCode || '—';
    const projectCode = project.projectCode || '—';
    const deliveryDate = getGestaoGanttPrevisaoInputMaxDate(project.deliveryDate);
    const inicioValue = getGestaoGanttPrevisaoInputValue(project.technicalProjectForecastStartDate);
    const fimValue = getGestaoGanttPrevisaoInputValue(project.previsaoConclusaoProjetoTecnico);
    const designerName = getGestaoGanttDesignerName(project);
    const readOnly = isProgramacaoProjetosReadOnly();

    if (readOnly) {
        return `
        <article class="gestao-gantt-project-card gestao-gantt-project-card--readonly" data-order-project-id="${project.id}">
            <div class="gestao-gantt-project-card__header">
                <button type="button"
                    class="gestao-gantt-project-card__open"
                    data-order-project-id="${project.id}"
                    title="Abrir projeto">
                    <span class="gestao-gantt-project-card__codes">${escapeHtml(orderCode)} · ${escapeHtml(projectCode)}</span>
                    <span class="gestao-gantt-project-card__name">${escapeHtml(project.name || 'Projeto')}</span>
                </button>
                <span class="gestao-gantt-project-card__status">${escapeHtml(statusName)}</span>
            </div>
            <p class="gestao-gantt-project-card__client">${escapeHtml(clientName)}</p>
            <div class="gestao-gantt-project-card__dates gestao-gantt-project-card__dates--readonly">
                <div class="gestao-gantt-project-card__field">
                    <span class="gestao-gantt-project-card__label">Projetista</span>
                    <span class="gestao-gantt-project-card__value">${escapeHtml(designerName)}</span>
                </div>
                <div class="gestao-gantt-project-card__field">
                    <span class="gestao-gantt-project-card__label">Início previsto</span>
                    <span class="gestao-gantt-project-card__value">${escapeHtml(formatGestaoDate(project.technicalProjectForecastStartDate))}</span>
                </div>
                <div class="gestao-gantt-project-card__field">
                    <span class="gestao-gantt-project-card__label">Fim previsto</span>
                    <span class="gestao-gantt-project-card__value">${escapeHtml(formatGestaoDate(project.previsaoConclusaoProjetoTecnico))}</span>
                </div>
            </div>
        </article>
    `;
    }

    return `
        <article class="gestao-gantt-project-card" data-order-project-id="${project.id}">
            <div class="gestao-gantt-project-card__header">
                <button type="button"
                    class="gestao-gantt-project-card__open"
                    data-order-project-id="${project.id}"
                    title="Abrir projeto">
                    <span class="gestao-gantt-project-card__codes">${escapeHtml(orderCode)} · ${escapeHtml(projectCode)}</span>
                    <span class="gestao-gantt-project-card__name">${escapeHtml(project.name || 'Projeto')}</span>
                </button>
                <span class="gestao-gantt-project-card__status">${escapeHtml(statusName)}</span>
            </div>
            <p class="gestao-gantt-project-card__client">${escapeHtml(clientName)}</p>
            <label class="gestao-gantt-project-card__field">
                <span class="gestao-gantt-project-card__label">Projetista</span>
                <select class="gestao-gantt-designer-select w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                    data-order-project-id="${project.id}"
                    data-current-designer-id="${project.designerId || ''}"
                    data-delivery-date="${escapeHtml(deliveryDate)}">
                    ${renderGestaoGanttDesignerOptions(project.designerId)}
                </select>
            </label>
            <div class="gestao-gantt-project-card__dates">
                <label class="gestao-gantt-project-card__field">
                    <span class="gestao-gantt-project-card__label">Início previsto</span>
                    <input type="date"
                        class="gestao-gantt-previsao-inicio-input w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                        data-order-project-id="${project.id}"
                        data-delivery-date="${escapeHtml(deliveryDate)}"
                        ${inicioValue ? `value="${escapeHtml(inicioValue)}"` : ''}
                        ${fimValue ? `max="${escapeHtml(fimValue)}"` : ''}>
                </label>
                <label class="gestao-gantt-project-card__field">
                    <span class="gestao-gantt-project-card__label">Fim previsto</span>
                    <input type="date"
                        class="gestao-gantt-previsao-fim-input w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                        data-order-project-id="${project.id}"
                        data-delivery-date="${escapeHtml(deliveryDate)}"
                        ${fimValue ? `value="${escapeHtml(fimValue)}"` : ''}>
                </label>
            </div>
            <button type="button"
                class="gestao-gantt-project-card__save text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-3 py-1.5 rounded-lg font-medium w-full"
                data-order-project-id="${project.id}">
                Confirmar alterações
            </button>
        </article>
    `;
}

function renderGestaoGanttProjectList() {
    const list = document.getElementById('gestao-gantt-project-list');
    const countEl = document.getElementById('gestao-gantt-project-count');
    if (!list) return;

    const entries = getGestaoGanttProjectListEntries();
    if (countEl) countEl.textContent = String(entries.length);

    if (!entries.length) {
        list.innerHTML = `
            <p class="text-xs text-slate-400 text-center py-8 px-3">
                ${getGestaoGanttProjectListEmptyMessage()}
            </p>
        `;
        return;
    }

    list.innerHTML = entries.map(entry => renderGestaoGanttProjectCard(entry)).join('');
}

function renderGestaoGanttDesignerLane(laneItems, weekDays, todayKey, designerId) {
    const slotsHtml = weekDays.map((day, index) => {
        const date = gestaoGanttParseDateKey(day.dateKey);
        const isWeekend = date && (date.getDay() === 0 || date.getDay() === 6);
        const isToday = day.dateKey === todayKey;

        return `
            <div class="gestao-gantt-day-slot ${!day.inMonth ? 'gestao-gantt-day-slot--outside' : ''} ${isWeekend ? 'gestao-gantt-day-slot--weekend' : ''} ${isToday ? 'gestao-gantt-day-slot--today' : ''}"
                style="grid-column: ${index + 1};"
                data-date="${day.dateKey}"></div>
        `;
    }).join('');

    const barsHtml = laneItems.map(item => {
        const { project, order, placement } = item;
        const clientName = order.cliente?.nome || 'Cliente';
        const projectName = project.name || 'Projeto';
        const orderCode = order.orderCode || '—';
        const designerName = getGestaoGanttDesignerNameById(designerId);

        return `
            <button type="button"
                class="gestao-gantt-bar"
                data-order-project-id="${project.id}"
                style="${getGestaoGanttDesignerBarStyle(designerId)} grid-column: ${placement.startCol} / span ${placement.span};"
                title="${escapeHtml(`${designerName} · ${orderCode} · ${clientName} · ${projectName}`)}">
                <span class="gestao-gantt-bar__title">${escapeHtml(designerName)}</span>
                <span class="gestao-gantt-bar__meta">${escapeHtml(clientName)} · ${escapeHtml(projectName)}</span>
            </button>
        `;
    }).join('');

    return `
        <div class="gestao-gantt-lane">
            ${slotsHtml}
            ${barsHtml}
        </div>
    `;
}

function renderGestaoGanttDesignerGroup(group, weekDays, todayKey) {
    const lanes = assignGestaoGanttDesignerLanes(group.projects, weekDays);

    return lanes.map(laneItems =>
        renderGestaoGanttDesignerLane(laneItems, weekDays, todayKey, group.designerId)
    ).join('');
}

function buildGestaoGanttDesignerGroupsForWeek(entries, weekDays) {
    return buildGestaoGanttDesignerGroups(entries)
        .map(group => ({
            ...group,
            projects: group.projects.filter(item => getGestaoGanttBarPlacementForWeek(item.project, weekDays))
        }))
        .filter(group => group.projects.length > 0);
}

function renderGestaoGanttWeekdayHeadersRow() {
    return `
        <div class="gestao-gantt-weekday-headers">
            ${GESTAO_GANTT_WEEKDAY_LABELS.map(label => `
                <div class="gestao-gantt-weekday-header">${escapeHtml(label)}</div>
            `).join('')}
        </div>
    `;
}

function renderGestaoGanttWeekBlock(week, entries, todayKey) {
    const { days: weekDays } = week;
    const designerGroups = buildGestaoGanttDesignerGroupsForWeek(entries, weekDays);

    const dayHeadersHtml = weekDays.map(day => {
        const dayNumber = day.inMonth ? formatGestaoGanttDayNumber(day.dateKey) : '';
        const date = gestaoGanttParseDateKey(day.dateKey);
        const isWeekend = date && (date.getDay() === 0 || date.getDay() === 6);
        const isToday = day.dateKey === todayKey;

        return `
            <div class="gestao-gantt-day-header ${!day.inMonth ? 'gestao-gantt-day-header--outside' : ''} ${isWeekend ? 'gestao-gantt-day-header--weekend' : ''} ${isToday ? 'gestao-gantt-day-header--today' : ''}">
                <span class="gestao-gantt-day-header__date">${escapeHtml(dayNumber)}</span>
            </div>
        `;
    }).join('');

    const groupsHtml = designerGroups.length
        ? designerGroups.map(group => renderGestaoGanttDesignerGroup(group, weekDays, todayKey)).join('')
        : renderGestaoGanttDesignerLane([], weekDays, todayKey, 0);

    return `
        <section class="gestao-gantt-week-block">
            <div class="gestao-gantt-calendar-table">
                <div class="gestao-gantt-day-headers">${dayHeadersHtml}</div>
                <div class="gestao-gantt-week-lanes">${groupsHtml}</div>
            </div>
        </section>
    `;
}

function renderGestaoGanttMonthGrid() {
    const grid = document.getElementById('gestao-gantt-month-grid');
    if (!grid) return;

    const todayKey = gestaoGanttToDateKey(new Date());
    const monthLabel = formatGestaoGanttMonthYearLabel(gestaoGanttMonthAnchor);
    const monthLabelEl = document.getElementById('gestao-gantt-month-label');
    if (monthLabelEl) monthLabelEl.textContent = monthLabel;

    const entries = getGestaoGanttCalendarEntries();
    const weeks = buildGestaoGanttMonthWeeks();
    const weeksHtml = weeks.map(week => renderGestaoGanttWeekBlock(week, entries, todayKey)).join('');
    const monthDayRangeLabel = formatGestaoGanttMonthDayRangeLabel();

    grid.innerHTML = `
        <div class="gestao-gantt-month-range-label">${escapeHtml(monthDayRangeLabel)}</div>
        ${renderGestaoGanttWeekdayHeadersRow()}
        <div class="gestao-gantt-weeks">${weeksHtml}</div>
    `;
}

function renderGestaoGanttLegend() {
    const legend = document.getElementById('gestao-gantt-legend');
    if (!legend) return;

    legend.innerHTML = `
        <span class="gestao-gantt-legend-item">
            <span class="gestao-gantt-legend-swatch gestao-gantt-legend-swatch--bar"></span>
            Período previsto do projeto técnico
        </span>
        <span class="gestao-gantt-legend-item">
            <span class="gestao-gantt-legend-swatch gestao-gantt-legend-swatch--today"></span>
            Hoje
        </span>
    `;
}

function renderGestaoGanttViews() {
    if (!isProgramacaoProjetosReadOnly()) {
        renderGestaoGanttProjectList();
    }
    renderGestaoGanttMonthGrid();
}

function getGestaoGanttCardValues(card) {
    return {
        inicioDate: card?.querySelector('.gestao-gantt-previsao-inicio-input')?.value || '',
        previsaoDate: card?.querySelector('.gestao-gantt-previsao-fim-input')?.value || '',
        designerId: Number(card?.querySelector('.gestao-gantt-designer-select')?.value) || null
    };
}

function getGestaoGanttCardSavedValues(project) {
    return {
        inicioDate: getGestaoGanttPrevisaoInputValue(project?.technicalProjectForecastStartDate),
        previsaoDate: getGestaoGanttPrevisaoInputValue(project?.previsaoConclusaoProjetoTecnico),
        designerId: Number(project?.designerId) || null
    };
}

function hasGestaoGanttCardChanges(card, project) {
    const values = getGestaoGanttCardValues(card);
    const saved = getGestaoGanttCardSavedValues(project);
    return values.inicioDate !== saved.inicioDate
        || values.previsaoDate !== saved.previsaoDate
        || values.designerId !== saved.designerId;
}

async function saveGestaoGanttProjectCard(card) {
    if (isProgramacaoProjetosReadOnly()) {
        alertAppDialog('Visualização somente leitura.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    if (!canAccessGestao()) {
        alertAppDialog('Sem permissão para alterar o projeto.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    const projectId = Number(card?.dataset.orderProjectId);
    if (!projectId) return false;

    const entry = gestaoGanttProjectsCache.find(item => Number(item.project.id) === projectId);
    const project = entry?.project;
    if (!project) return false;

    const select = card.querySelector('.gestao-gantt-designer-select');
    const deliveryDate = select?.dataset.deliveryDate || '';
    const values = getGestaoGanttCardValues(card);
    const saved = getGestaoGanttCardSavedValues(project);
    const designerChanged = values.designerId !== saved.designerId;
    const datesChanged = values.inicioDate !== saved.inicioDate || values.previsaoDate !== saved.previsaoDate;

    if (!designerChanged && !datesChanged) {
        alertAppDialog('Nenhuma alteração para salvar.', { variant: 'info', title: 'Aviso' });
        return false;
    }

    if (!values.designerId) {
        alertAppDialog('Selecione o projetista.');
        return false;
    }

    if (datesChanged && !validateGestaoGanttPrevisao(values.inicioDate, values.previsaoDate, deliveryDate)) {
        return false;
    }

    let projetista = null;
    if (designerChanged) {
        projetista = (gestaoProjetistasCache || []).find(item => Number(item.id) === Number(values.designerId));
        if (!projetista) {
            alertAppDialog('Projetista inválido.');
            return false;
        }

        const confirmMessage = datesChanged
            ? `Confirmar alterações e transferir este projeto para ${projetista.name}?`
            : `Transferir este projeto para ${projetista.name}?`;

        if (!(await confirmAppDialog(confirmMessage))) {
            return false;
        }
    }

    const now = new Date().toISOString();
    const payload = {
        updatedById: currentUser.id,
        updatedAt: now
    };

    if (designerChanged) {
        payload.designerId = values.designerId;
    }

    if (datesChanged) {
        Object.assign(payload, buildOrderProjectPrevisaoPayload(values.inicioDate, values.previsaoDate));
    }

    const saveButton = card.querySelector('.gestao-gantt-project-card__save');
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Salvando...';
    }

    try {
        gestaoGanttSaving = true;

        let { error } = await supabaseClient
            .from('OrderProject')
            .update(payload)
            .eq('id', projectId);

        if (isOrderProjectPrevisaoColumnError(error?.message)) {
            const fallbackPayload = { updatedById: currentUser.id, updatedAt: now };
            if (designerChanged) fallbackPayload.designerId = values.designerId;

            ({ error } = await supabaseClient
                .from('OrderProject')
                .update(fallbackPayload)
                .eq('id', projectId));

            if (!error && datesChanged) {
                alertAppDialog(
                    'Projetista alterado, mas os campos de previsão ainda não existem no banco. Execute supabase/create-order-project-technical-forecast-start-date.sql no Supabase.',
                    { variant: 'warning', title: 'Aviso' }
                );
            }
        }

        if (error) {
            alertAppDialog('Erro ao salvar alterações: ' + error.message);
            return false;
        }

        if (designerChanged && typeof syncOpenCommercialApprovalDesignerForProject === 'function') {
            const { error: approvalError } = await syncOpenCommercialApprovalDesignerForProject(
                projectId,
                values.designerId
            );
            if (approvalError) {
                alertAppDialog(
                    'Projeto atualizado, mas não foi possível atualizar a aprovação comercial: '
                    + approvalError.message,
                    { variant: 'warning', title: 'Aviso' }
                );
            }
        }

        if (designerChanged && projetista) {
            project.designerId = values.designerId;
            project.designer = { id: values.designerId, name: projetista.name };
        }

        updateGestaoGanttProjectInCache(projectId, payload);
        renderGestaoGanttViews();
        return true;
    } finally {
        gestaoGanttSaving = false;
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Confirmar alterações';
        }
    }
}

async function ensureGestaoGanttProjetistasLoaded() {
    if ((gestaoProjetistasCache || []).length) return;

    const { data } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .order('name', { ascending: true });

    gestaoProjetistasCache = data || [];
}

function renderGestaoGanttFilterSelects() {
    const projectDesignerSelect = document.getElementById('gestao-gantt-project-designer-filter');
    const calendarDesignerSelect = document.getElementById('gestao-gantt-calendar-designer-filter');

    if (projectDesignerSelect) {
        projectDesignerSelect.innerHTML = renderGestaoGanttDesignerFilterOptions(gestaoGanttProjectDesignerFilter);
    }

    if (calendarDesignerSelect) {
        calendarDesignerSelect.innerHTML = renderGestaoGanttDesignerFilterOptions(gestaoGanttCalendarDesignerFilter);
    }
}

async function loadGestaoGantt() {
    const content = document.getElementById('gestao-gantt-content');
    if (!content) return;

    const readOnly = isProgramacaoProjetosReadOnly();
    const projectsPanelHtml = readOnly ? '' : `
            <aside class="gestao-gantt-projects-panel">
                <div class="gestao-gantt-projects-panel__header">
                    <h4 class="gestao-gantt-projects-panel__title">Projetos</h4>
                    <span id="gestao-gantt-project-count" class="gestao-gantt-projects-panel__count">0</span>
                </div>
                <div class="gestao-gantt-projects-panel__filters">
                    <label class="gestao-gantt-projects-panel__filter">
                        <span class="gestao-gantt-projects-panel__filter-label">Cliente</span>
                        <input type="text"
                            id="gestao-gantt-project-client-filter"
                            class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                            placeholder="Filtrar por cliente..."
                            value="${escapeHtml(gestaoGanttProjectClientFilter)}"
                            autocomplete="off">
                    </label>
                    <label class="gestao-gantt-projects-panel__filter">
                        <span class="gestao-gantt-projects-panel__filter-label">Projetista</span>
                        <select id="gestao-gantt-project-designer-filter"
                            class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500">
                            ${renderGestaoGanttDesignerFilterOptions(gestaoGanttProjectDesignerFilter)}
                        </select>
                    </label>
                </div>
                <div id="gestao-gantt-project-list" class="gestao-gantt-project-list">
                    <p class="text-xs text-slate-400 text-center py-8 px-3">Carregando projetos...</p>
                </div>
            </aside>`;

    content.innerHTML = `
        <div class="gestao-gantt-layout${readOnly ? ' gestao-gantt-layout--calendar-only' : ''}">
            ${projectsPanelHtml}
            <section class="gestao-gantt-calendar-panel">
                <div class="gestao-gantt-calendar-panel__filters">
                    <label class="gestao-gantt-panel__filter">
                        <span class="gestao-gantt-panel__filter-label">Cliente</span>
                        <input type="text"
                            id="gestao-gantt-calendar-client-filter"
                            class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                            placeholder="Filtrar calendário por cliente..."
                            value="${escapeHtml(gestaoGanttCalendarClientFilter)}"
                            autocomplete="off">
                    </label>
                    <label class="gestao-gantt-panel__filter">
                        <span class="gestao-gantt-panel__filter-label">Projetista</span>
                        <select id="gestao-gantt-calendar-designer-filter"
                            class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500">
                            ${renderGestaoGanttDesignerFilterOptions(gestaoGanttCalendarDesignerFilter)}
                        </select>
                    </label>
                </div>
                <div id="gestao-gantt-legend" class="gestao-gantt-legend"></div>
                <div class="gestao-gantt-calendar-scroll">
                    <div id="gestao-gantt-month-grid" class="gestao-gantt-month-grid">
                        <p class="text-xs text-slate-400 text-center py-8">Carregando calendário...</p>
                    </div>
                </div>
            </section>
        </div>
    `;

    renderGestaoGanttLegend();

    const [statuses, ordersResult] = await Promise.all([
        loadGestaoProjectStatuses(true),
        fetchGestaoOrders(),
        ensureGestaoGanttProjetistasLoaded()
    ]);

    if (ordersResult.error) {
        const list = document.getElementById('gestao-gantt-project-list');
        const grid = document.getElementById('gestao-gantt-month-grid');
        const message = `Erro ao carregar programação: ${escapeHtml(ordersResult.error.message)}`;
        if (list) list.innerHTML = `<p class="text-xs text-red-500 text-center py-8 px-3">${message}</p>`;
        if (grid) grid.innerHTML = `<p class="text-xs text-red-500 text-center py-8">${message}</p>`;
        return;
    }

    let orders = ordersResult.data || [];

    if (typeof fetchGestaoOrderPhasesByOrderIds === 'function' && orders.length) {
        const phasesByOrderId = await fetchGestaoOrderPhasesByOrderIds(orders.map(order => order.id));
        orders = orders.map(order => ({
            ...order,
            deliveryPhases: phasesByOrderId[order.id] || []
        }));
    }

    gestaoGanttProjectsCache = buildGestaoGanttProjects(orders, statuses);
    renderGestaoGanttFilterSelects();
    applyProgramacaoProjetosReadOnlyUi();
    renderGestaoGanttViews();
}

function bindGestaoGanttEvents() {
    if (gestaoGanttEventsBound) return;
    gestaoGanttEventsBound = true;

    document.getElementById('btn-gestao-gantt-prev-month')?.addEventListener('click', () => {
        gestaoGanttMonthAnchor = new Date(gestaoGanttMonthAnchor.getFullYear(), gestaoGanttMonthAnchor.getMonth() - 1, 1);
        renderGestaoGanttMonthGrid();
    });

    document.getElementById('btn-gestao-gantt-next-month')?.addEventListener('click', () => {
        gestaoGanttMonthAnchor = new Date(gestaoGanttMonthAnchor.getFullYear(), gestaoGanttMonthAnchor.getMonth() + 1, 1);
        renderGestaoGanttMonthGrid();
    });

    document.getElementById('btn-gestao-gantt-today-month')?.addEventListener('click', () => {
        gestaoGanttMonthAnchor = startOfGestaoGanttMonth(new Date());
        renderGestaoGanttMonthGrid();
    });

    document.getElementById('btn-gestao-gantt-refresh')?.addEventListener('click', () => {
        loadGestaoGantt();
    });

    document.getElementById('gestao-gantt-content')?.addEventListener('click', async event => {
        if (isProgramacaoProjetosReadOnly()) {
            const openButton = event.target.closest('.gestao-gantt-project-card__open, .gestao-gantt-bar');
            if (!openButton) return;
            const projectId = Number(openButton.dataset.orderProjectId);
            if (!projectId || typeof openProjectViewModal !== 'function') return;
            openProjectViewModal(projectId);
            return;
        }

        const saveButton = event.target.closest('.gestao-gantt-project-card__save');
        if (saveButton) {
            if (gestaoGanttSaving) return;
            const card = saveButton.closest('.gestao-gantt-project-card');
            await saveGestaoGanttProjectCard(card);
            return;
        }

        const openButton = event.target.closest('.gestao-gantt-project-card__open, .gestao-gantt-bar');
        if (!openButton) return;

        const projectId = Number(openButton.dataset.orderProjectId);
        if (!projectId || typeof openProjectViewModal !== 'function') return;
        openProjectViewModal(projectId);
    });

    document.getElementById('gestao-gantt-content')?.addEventListener('input', event => {
        const calendarClientFilter = event.target.closest('#gestao-gantt-calendar-client-filter');
        if (calendarClientFilter) {
            gestaoGanttCalendarClientFilter = calendarClientFilter.value || '';
            renderGestaoGanttMonthGrid();
            return;
        }

        if (isProgramacaoProjetosReadOnly()) return;

        const projectClientFilter = event.target.closest('#gestao-gantt-project-client-filter');
        if (projectClientFilter) {
            gestaoGanttProjectClientFilter = projectClientFilter.value || '';
            renderGestaoGanttProjectList();
            return;
        }

        const card = event.target.closest('.gestao-gantt-project-card');
        if (!card) return;

        const projectId = Number(card.dataset.orderProjectId);
        const entry = gestaoGanttProjectsCache.find(item => Number(item.project.id) === projectId);
        card.classList.toggle('gestao-gantt-project-card--dirty', hasGestaoGanttCardChanges(card, entry?.project));

        const inicioInput = card.querySelector('.gestao-gantt-previsao-inicio-input');
        const fimInput = card.querySelector('.gestao-gantt-previsao-fim-input');
        if (inicioInput && fimInput?.value) {
            inicioInput.max = fimInput.value;
        }
    });

    document.getElementById('gestao-gantt-content')?.addEventListener('change', event => {
        const calendarDesignerFilter = event.target.closest('#gestao-gantt-calendar-designer-filter');
        if (calendarDesignerFilter) {
            gestaoGanttCalendarDesignerFilter = calendarDesignerFilter.value || '';
            renderGestaoGanttMonthGrid();
            return;
        }

        if (isProgramacaoProjetosReadOnly()) return;

        const projectDesignerFilter = event.target.closest('#gestao-gantt-project-designer-filter');
        if (projectDesignerFilter) {
            gestaoGanttProjectDesignerFilter = projectDesignerFilter.value || '';
            renderGestaoGanttProjectList();
            return;
        }

        const card = event.target.closest('.gestao-gantt-project-card');
        if (!card) return;

        const projectId = Number(card.dataset.orderProjectId);
        const entry = gestaoGanttProjectsCache.find(item => Number(item.project.id) === projectId);
        card.classList.toggle('gestao-gantt-project-card--dirty', hasGestaoGanttCardChanges(card, entry?.project));
    });
}

window.loadGestaoGantt = loadGestaoGantt;
window.bindGestaoGanttEvents = bindGestaoGanttEvents;
