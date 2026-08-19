const GESTAO_PROJECT_SCHEDULING_STATUS_RANGE_BY_NAME = {
    [ORDER_PROJECT_TECHNICAL_STATUS_NAME]: {
        start: 'Aguardando Projeto Técnico',
        end: ORDER_PROJECT_IMPLANTATION_STATUS_NAME
    },
    [ORDER_PROJECT_CONFERENCE_SENT_STATUS_NAME]: {
        start: 'Vendido',
        end: ORDER_PROJECT_CONFERENCE_SENT_STATUS_NAME
    },
    [ORDER_PROJECT_IMPLANTATION_STATUS_NAME]: {
        start: 'Aguardando Projeto Técnico',
        end: ORDER_PROJECT_IMPLANTATION_STATUS_NAME
    },
    [ORDER_PROJECT_INTERNAL_ASSEMBLY_STATUS_NAME]: {
        start: 'Aguardando Aprovação',
        end: ORDER_PROJECT_INTERNAL_ASSEMBLY_STATUS_NAME
    }
};
const GESTAO_PROJECT_SCHEDULING_WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const GESTAO_PROJECT_SCHEDULING_DESIGNER_PALETTE = [
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

let gestaoProjectSchedulingMonthAnchor = startOfGestaoProjectSchedulingMonth(new Date());
let gestaoProjectSchedulingWeekAnchor = startOfWeekSunday(new Date());
let gestaoProjectSchedulingViewMode = 'month';
let gestaoProjectSchedulingProjectsCache = [];
let gestaoProjectSchedulingProjectClientFilter = '';
let gestaoProjectSchedulingProjectDesignerFilter = '';
let gestaoProjectSchedulingProjectHideWithForecast = false;
let gestaoProjectSchedulingCalendarClientFilter = '';
let gestaoProjectSchedulingCalendarDesignerFilter = '';
let gestaoProjectSchedulingEventsBound = false;
let gestaoProjectSchedulingSaving = false;
let gestaoProjectSchedulingSelectedStatusId = null;
let gestaoProjectSchedulingForecastStatuses = [];
let gestaoProjectSchedulingForecastByProjectId = new Map();
let gestaoProjectSchedulingConferenceReviewersCache = [];
let gestaoProjectSchedulingPpcpUsersCache = [];

const GESTAO_PROJECT_SCHEDULING_ACTION_OVERLAY = createModalOverlayConfig('gestao-project-scheduling-action');

function setGestaoProjectSchedulingActionLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(GESTAO_PROJECT_SCHEDULING_ACTION_OVERLAY, active, message, status);
}

function waitGestaoProjectSchedulingStatus(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function canEditGestaoProjectSchedulingStatus(status = getGestaoProjectSchedulingSelectedStatus()) {
    if (typeof canEditProjectScheduling === 'function') {
        if (canEditProjectScheduling()) return true;
    } else if (typeof canAccessGestao === 'function' && canAccessGestao()) {
        return true;
    }

    return typeof isConferente === 'function'
        && isConferente()
        && status?.name === ORDER_PROJECT_CONFERENCE_SENT_STATUS_NAME;
}

function isProjectSchedulingReadOnly() {
    return !canEditGestaoProjectSchedulingStatus();
}

function applyProjectSchedulingReadOnlyUi() {
    const panel = document.getElementById('gestao-project-scheduling-panel');
    const layout = document.querySelector('#gestao-project-scheduling-content .gestao-project-scheduling-layout');
    const tablePanel = document.querySelector('.gestao-project-scheduling-table-panel');
    const readOnly = isProjectSchedulingReadOnly();

    panel?.classList.toggle('gestao-project-scheduling-readonly', readOnly);
    document.getElementById('gestao-project-scheduling-readonly-notice')?.classList.toggle('hidden', !readOnly);
    layout?.classList.toggle('gestao-project-scheduling-layout--readonly', readOnly);
    layout?.classList.toggle('gestao-project-scheduling-layout--calendar-only', readOnly);
    tablePanel?.classList.toggle('hidden', readOnly);
}

function updateProjectSchedulingNavVisibility() {
    const button = document.getElementById('gestao-nav-project-scheduling');
    if (button) {
        button.classList.toggle('hidden', !canViewProjectScheduling());
    }
}

window.applyProjectSchedulingReadOnlyUi = applyProjectSchedulingReadOnlyUi;
window.updateProjectSchedulingNavVisibility = updateProjectSchedulingNavVisibility;

const GESTAO_PROJECT_SCHEDULING_DESIGNER_FILTER_NONE = 'none';

function getGestaoProjectSchedulingForecastStatuses(statuses = []) {
    if (typeof getOrderProjectStatusesWithForecastSupport === 'function') {
        const supported = getOrderProjectStatusesWithForecastSupport(statuses);
        if (supported.length) return supported;
    }
    return (statuses || []).filter(status => status.name === ORDER_PROJECT_TECHNICAL_STATUS_NAME);
}

function resolveGestaoProjectSchedulingSelectedStatusId(statuses = []) {
    const forecastStatuses = getGestaoProjectSchedulingForecastStatuses(statuses);
    gestaoProjectSchedulingForecastStatuses = forecastStatuses;

    const currentId = Number(gestaoProjectSchedulingSelectedStatusId);
    if (currentId && forecastStatuses.some(status => Number(status.id) === currentId)) {
        return currentId;
    }

    const canEditAll = typeof canEditProjectScheduling === 'function'
        ? canEditProjectScheduling()
        : (typeof canAccessGestao === 'function' && canAccessGestao());
    const conferenceStatus = forecastStatuses.find(status => status.name === ORDER_PROJECT_CONFERENCE_SENT_STATUS_NAME);
    if (!canEditAll && typeof isConferente === 'function' && isConferente() && conferenceStatus) {
        gestaoProjectSchedulingSelectedStatusId = Number(conferenceStatus.id);
        return gestaoProjectSchedulingSelectedStatusId;
    }

    const technicalStatus = forecastStatuses.find(status => status.name === ORDER_PROJECT_TECHNICAL_STATUS_NAME);
    const fallbackId = Number(technicalStatus?.id || forecastStatuses[0]?.id) || null;
    gestaoProjectSchedulingSelectedStatusId = fallbackId;
    return fallbackId;
}

function getGestaoProjectSchedulingSelectedStatus() {
    const selectedId = Number(gestaoProjectSchedulingSelectedStatusId);
    return gestaoProjectSchedulingForecastStatuses.find(status => Number(status.id) === selectedId) || null;
}

function getGestaoProjectSchedulingSelectedStatusId() {
    return Number(gestaoProjectSchedulingSelectedStatusId) || null;
}

function getGestaoProjectSchedulingAssigneeKind(status) {
    return typeof getOrderProjectStatusForecastAssigneeKind === 'function'
        ? getOrderProjectStatusForecastAssigneeKind(status)
        : null;
}

function getGestaoProjectSchedulingAssigneeLabel(kind) {
    if (kind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) return 'Marceneiro';
    if (kind === ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER) return 'Projetista';
    if (kind === ORDER_PROJECT_FORECAST_ASSIGNEE_CONFERENCE_REVIEWER) return 'Conferente';
    if (kind === ORDER_PROJECT_FORECAST_ASSIGNEE_PPCP) return 'PPCP';
    return 'Responsável';
}

function isGestaoProjectSchedulingAppUserAssigneeKind(assigneeKind) {
    return assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER
        || assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CONFERENCE_REVIEWER
        || assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_PPCP;
}

function isGestaoProjectSchedulingForecastOnlyAssigneeKind(assigneeKind) {
    return assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CONFERENCE_REVIEWER
        || assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_PPCP;
}

function shouldGestaoProjectSchedulingSaveAssigneeOnForecast(assigneeKind) {
    return Boolean(assigneeKind);
}

function shouldGestaoProjectSchedulingShowAssociatedPerson(assigneeKind) {
    return assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER
        || assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER;
}

function shouldGestaoProjectSchedulingShowAssociateButton(assigneeKind) {
    return shouldGestaoProjectSchedulingShowAssociatedPerson(assigneeKind);
}

function getGestaoProjectSchedulingAssigneeUsersByKind(assigneeKind) {
    if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
        return gestaoMarceneirosCache || [];
    }
    if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CONFERENCE_REVIEWER) {
        return gestaoProjectSchedulingConferenceReviewersCache || [];
    }
    if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_PPCP) {
        return gestaoProjectSchedulingPpcpUsersCache || [];
    }
    return gestaoProjetistasCache || [];
}

function getGestaoProjectSchedulingAssigneeNameById(assigneeId, assigneeKind) {
    const normalizedId = Number(assigneeId);
    if (!normalizedId) {
        return `Sem ${getGestaoProjectSchedulingAssigneeLabel(assigneeKind).toLowerCase()}`;
    }

    if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
        return getGestaoProjectSchedulingCabinetMakerNameById(normalizedId);
    }

    const fromCache = getGestaoProjectSchedulingAssigneeUsersByKind(assigneeKind)
        .find(item => Number(item.id) === normalizedId);
    return fromCache?.name || getGestaoProjectSchedulingAssigneeLabel(assigneeKind);
}

function getGestaoProjectSchedulingAssociatedAssignee(project) {
    const kind = getGestaoProjectSchedulingAssigneeKind(getGestaoProjectSchedulingSelectedStatus());

    if (kind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
        const cabinetMakerId = Number(project?.cabinetMakerId) || 0;
        return {
            kind,
            id: cabinetMakerId,
            name: project?.cabinetMaker?.name || getGestaoProjectSchedulingCabinetMakerNameById(cabinetMakerId)
        };
    }

    if (kind === ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER) {
        const userId = Number(project?.designerId) || 0;
        return {
            kind,
            id: userId,
            name: project?.designer?.name || getGestaoProjectSchedulingAssigneeNameById(userId, kind)
        };
    }

    return null;
}

function getGestaoProjectSchedulingResolvedAssignee(project) {
    const kind = getGestaoProjectSchedulingAssigneeKind(getGestaoProjectSchedulingSelectedStatus());
    const forecast = getGestaoProjectSchedulingEntryForecast(project?.id);

    if (kind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
        const cabinetMakerId = Number(forecast?.cabinetMakerId) || 0;
        return {
            kind,
            id: cabinetMakerId,
            name: getGestaoProjectSchedulingCabinetMakerNameById(cabinetMakerId)
        };
    }

    if (isGestaoProjectSchedulingAppUserAssigneeKind(kind)) {
        const userId = Number(forecast?.userId) || 0;
        return {
            kind,
            id: userId,
            name: getGestaoProjectSchedulingAssigneeNameById(userId, kind)
        };
    }

    return null;
}

function getGestaoProjectSchedulingCabinetMakerNameById(cabinetMakerId) {
    const normalizedId = Number(cabinetMakerId);
    if (!normalizedId) return 'Sem marceneiro';
    const fromCache = (gestaoMarceneirosCache || []).find(item => Number(item.id) === normalizedId);
    return fromCache?.name || 'Marceneiro';
}

function getGestaoProjectSchedulingCabinetMakerName(project) {
    if (project?.cabinetMaker?.name) return project.cabinetMaker.name;
    return getGestaoProjectSchedulingCabinetMakerNameById(project?.cabinetMakerId);
}

function getGestaoProjectSchedulingEntryForecast(projectId) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return null;

    const fromMap = gestaoProjectSchedulingForecastByProjectId.get(normalizedId);
    if (fromMap) return fromMap;

    const selectedStatus = getGestaoProjectSchedulingSelectedStatus();
    if (selectedStatus?.name !== ORDER_PROJECT_TECHNICAL_STATUS_NAME) {
        return null;
    }

    const entry = gestaoProjectSchedulingProjectsCache.find(item => Number(item.project.id) === normalizedId);
    return typeof resolveOrderProjectStatusForecast === 'function'
        ? resolveOrderProjectStatusForecast(entry?.project, null)
        : null;
}

function renderGestaoProjectSchedulingStatusOptions(selectedStatusId) {
    return gestaoProjectSchedulingForecastStatuses.map(status => {
        const selected = Number(status.id) === Number(selectedStatusId) ? 'selected' : '';
        return `<option value="${status.id}" ${selected}>${escapeHtml(status.name)}</option>`;
    }).join('');
}

async function loadGestaoProjectSchedulingForecastsForCache() {
    const selectedStatusId = getGestaoProjectSchedulingSelectedStatusId();
    const projectIds = gestaoProjectSchedulingProjectsCache.map(entry => entry.project.id);

    gestaoProjectSchedulingForecastByProjectId = new Map();

    if (!selectedStatusId || !projectIds.length || typeof fetchOrderProjectStatusForecastMap !== 'function') {
        return;
    }

    gestaoProjectSchedulingForecastByProjectId = await fetchOrderProjectStatusForecastMap(
        projectIds,
        selectedStatusId
    );
}

function startOfGestaoProjectSchedulingMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfGestaoProjectSchedulingMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function gestaoProjectSchedulingAddDays(date, days) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
}

function gestaoProjectSchedulingToDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function gestaoProjectSchedulingParseDateKey(dateKey) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function gestaoProjectSchedulingDaysBetween(startDate, endDate) {
    const ms = endDate.getTime() - startDate.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}

const formatGestaoProjectSchedulingMonthYearLabel = formatAppMonthYearLabel;
const formatGestaoProjectSchedulingWeekRangeLabel = formatAppWeekRangeLabel;

function startOfGestaoProjectSchedulingWeek(date) {
    return startOfWeekSunday(date);
}

function buildGestaoProjectSchedulingSingleWeek(weekAnchor = gestaoProjectSchedulingWeekAnchor) {
    const weekStart = startOfGestaoProjectSchedulingWeek(weekAnchor);
    const days = [];

    for (let index = 0; index < 7; index += 1) {
        const date = gestaoProjectSchedulingAddDays(weekStart, index);
        days.push({
            dateKey: gestaoProjectSchedulingToDateKey(date),
            inMonth: true
        });
    }

    return { weekStart, days };
}

function updateGestaoProjectSchedulingPeriodNavUi() {
    const label = document.getElementById('gestao-project-scheduling-period-label');
    const prevButton = document.getElementById('btn-gestao-project-scheduling-prev-period');
    const nextButton = document.getElementById('btn-gestao-project-scheduling-next-period');
    const todayButton = document.getElementById('btn-gestao-project-scheduling-today-period');
    const weekButton = document.getElementById('btn-gestao-project-scheduling-view-week');
    const monthButton = document.getElementById('btn-gestao-project-scheduling-view-month');
    const isWeekView = gestaoProjectSchedulingViewMode === 'week';

    weekButton?.classList.toggle('gestao-project-scheduling-view-toggle__btn--active', isWeekView);
    weekButton?.setAttribute('aria-pressed', isWeekView ? 'true' : 'false');
    monthButton?.classList.toggle('gestao-project-scheduling-view-toggle__btn--active', !isWeekView);
    monthButton?.setAttribute('aria-pressed', !isWeekView ? 'true' : 'false');

    if (isWeekView) {
        if (label) {
            label.textContent = formatGestaoProjectSchedulingWeekRangeLabel(startOfGestaoProjectSchedulingWeek(gestaoProjectSchedulingWeekAnchor));
        }
        prevButton?.setAttribute('aria-label', 'Semana anterior');
        nextButton?.setAttribute('aria-label', 'Próxima semana');
        if (todayButton) todayButton.textContent = 'Semana atual';
        return;
    }

    if (label) label.textContent = formatGestaoProjectSchedulingMonthYearLabel(gestaoProjectSchedulingMonthAnchor);
    prevButton?.setAttribute('aria-label', 'Mês anterior');
    nextButton?.setAttribute('aria-label', 'Próximo mês');
    if (todayButton) todayButton.textContent = 'Hoje';
}

function setGestaoProjectSchedulingViewMode(mode) {
    const normalizedMode = mode === 'week' ? 'week' : 'month';
    if (normalizedMode === gestaoProjectSchedulingViewMode) return;

    if (normalizedMode === 'week') {
        const today = new Date();
        const monthAnchor = startOfGestaoProjectSchedulingMonth(gestaoProjectSchedulingMonthAnchor);
        const isCurrentMonth = monthAnchor.getMonth() === today.getMonth()
            && monthAnchor.getFullYear() === today.getFullYear();
        gestaoProjectSchedulingWeekAnchor = startOfGestaoProjectSchedulingWeek(isCurrentMonth ? today : gestaoProjectSchedulingMonthAnchor);
    } else {
        gestaoProjectSchedulingMonthAnchor = startOfGestaoProjectSchedulingMonth(gestaoProjectSchedulingWeekAnchor);
    }

    gestaoProjectSchedulingViewMode = normalizedMode;
    renderGestaoProjectSchedulingCalendarGrid();
}

function navigateGestaoProjectSchedulingPeriod(direction) {
    if (gestaoProjectSchedulingViewMode === 'week') {
        gestaoProjectSchedulingWeekAnchor = gestaoProjectSchedulingAddDays(startOfGestaoProjectSchedulingWeek(gestaoProjectSchedulingWeekAnchor), direction * 7);
        gestaoProjectSchedulingMonthAnchor = startOfGestaoProjectSchedulingMonth(gestaoProjectSchedulingWeekAnchor);
    } else {
        gestaoProjectSchedulingMonthAnchor = new Date(
            gestaoProjectSchedulingMonthAnchor.getFullYear(),
            gestaoProjectSchedulingMonthAnchor.getMonth() + direction,
            1
        );
    }

    renderGestaoProjectSchedulingCalendarGrid();
}

function resetGestaoProjectSchedulingPeriodToToday() {
    const today = new Date();

    if (gestaoProjectSchedulingViewMode === 'week') {
        gestaoProjectSchedulingWeekAnchor = startOfGestaoProjectSchedulingWeek(today);
        gestaoProjectSchedulingMonthAnchor = startOfGestaoProjectSchedulingMonth(today);
    } else {
        gestaoProjectSchedulingMonthAnchor = startOfGestaoProjectSchedulingMonth(today);
        gestaoProjectSchedulingWeekAnchor = startOfGestaoProjectSchedulingWeek(today);
    }

    renderGestaoProjectSchedulingCalendarGrid();
}

function formatGestaoProjectSchedulingMonthDayRangeLabel(monthAnchor = gestaoProjectSchedulingMonthAnchor) {
    const monthEnd = endOfGestaoProjectSchedulingMonth(monthAnchor);
    const lastDay = monthEnd.getDate();
    const monthName = monthAnchor.toLocaleDateString('pt-BR', { month: 'long' });
    const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return `1–${lastDay} ${monthLabel}`;
}

function formatGestaoProjectSchedulingDayNumber(dateKey) {
    const date = gestaoProjectSchedulingParseDateKey(dateKey);
    if (!date) return '—';
    return String(date.getDate());
}

function getGestaoProjectSchedulingMonthDateKeys() {
    const monthStart = startOfGestaoProjectSchedulingMonth(gestaoProjectSchedulingMonthAnchor);
    const monthEnd = endOfGestaoProjectSchedulingMonth(gestaoProjectSchedulingMonthAnchor);
    const keys = [];

    for (let cursor = new Date(monthStart); cursor <= monthEnd; cursor = gestaoProjectSchedulingAddDays(cursor, 1)) {
        keys.push(gestaoProjectSchedulingToDateKey(cursor));
    }

    return keys;
}

function buildGestaoProjectSchedulingMonthWeeks(monthAnchor = gestaoProjectSchedulingMonthAnchor) {
    const monthStart = startOfGestaoProjectSchedulingMonth(monthAnchor);
    const monthEnd = endOfGestaoProjectSchedulingMonth(monthAnchor);
    const weeks = [];

    let weekStart = new Date(monthStart);
    weekStart = gestaoProjectSchedulingAddDays(weekStart, -weekStart.getDay());

    while (weekStart <= monthEnd) {
        const days = [];

        for (let index = 0; index < 7; index += 1) {
            const date = gestaoProjectSchedulingAddDays(weekStart, index);
            days.push({
                dateKey: gestaoProjectSchedulingToDateKey(date),
                inMonth: date.getMonth() === monthAnchor.getMonth()
                    && date.getFullYear() === monthAnchor.getFullYear()
            });
        }

        weeks.push({ weekStart: new Date(weekStart), days });
        weekStart = gestaoProjectSchedulingAddDays(weekStart, 7);
    }

    return weeks;
}

function matchesGestaoProjectSchedulingClientFilter(entry, clientQuery) {
    const query = String(clientQuery || '').trim().toLowerCase();
    if (!query) return true;

    const clientName = (entry.order.client?.name || '').toLowerCase();
    return clientName.includes(query);
}

function matchesGestaoProjectSchedulingDesignerFilter(project, designerFilter, source = 'forecast') {
    const filter = String(designerFilter || '');
    if (!filter) return true;

    const assignee = source === 'associated'
        ? getGestaoProjectSchedulingAssociatedAssignee(project)
        : getGestaoProjectSchedulingResolvedAssignee(project);
    const assigneeId = Number(assignee?.id) || 0;
    if (filter === GESTAO_PROJECT_SCHEDULING_DESIGNER_FILTER_NONE) return !assigneeId;

    return assigneeId === Number(filter);
}

function hasGestaoProjectSchedulingProjectForecast(project) {
    const forecast = gestaoProjectSchedulingForecastByProjectId.get(Number(project?.id));
    if (!forecast) return false;

    if (typeof hasOrderProjectStatusForecastContent === 'function') {
        return hasOrderProjectStatusForecastContent(forecast);
    }

    return Boolean(
        forecast.forecastStartDate
        || forecast.forecastEndDate
        || forecast.userId
        || forecast.cabinetMakerId
    );
}

function matchesGestaoProjectSchedulingHideWithForecastFilter(project) {
    if (!gestaoProjectSchedulingProjectHideWithForecast) return true;
    return !hasGestaoProjectSchedulingProjectForecast(project);
}

function getGestaoProjectSchedulingProjectListEntries() {
    const assigneeKind = getGestaoProjectSchedulingAssigneeKind(getGestaoProjectSchedulingSelectedStatus());
    const filterSource = shouldGestaoProjectSchedulingShowAssociatedPerson(assigneeKind)
        ? 'associated'
        : 'forecast';

    return gestaoProjectSchedulingProjectsCache.filter(entry =>
        matchesGestaoProjectSchedulingClientFilter(entry, gestaoProjectSchedulingProjectClientFilter)
        && matchesGestaoProjectSchedulingDesignerFilter(
            entry.project,
            gestaoProjectSchedulingProjectDesignerFilter,
            filterSource
        )
        && matchesGestaoProjectSchedulingHideWithForecastFilter(entry.project)
    );
}

function getGestaoProjectSchedulingCalendarEntries() {
    return gestaoProjectSchedulingProjectsCache.filter(entry =>
        matchesGestaoProjectSchedulingClientFilter(entry, gestaoProjectSchedulingCalendarClientFilter)
        && matchesGestaoProjectSchedulingDesignerFilter(
            entry.project,
            gestaoProjectSchedulingCalendarDesignerFilter
        )
    );
}

function renderGestaoProjectSchedulingDesignerFilterOptions(selectedValue) {
    const normalizedSelected = String(selectedValue || '');
    const assigneeKind = getGestaoProjectSchedulingAssigneeKind(getGestaoProjectSchedulingSelectedStatus());
    const assigneeLabel = getGestaoProjectSchedulingAssigneeLabel(assigneeKind).toLowerCase();

    if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
        const marceneiroOptions = (gestaoMarceneirosCache || []).map(marceneiro => {
            const selected = normalizedSelected === String(marceneiro.id) ? 'selected' : '';
            return `<option value="${marceneiro.id}" ${selected}>${escapeHtml(marceneiro.name)}</option>`;
        }).join('');

        return `
            <option value="">Todos os ${escapeHtml(assigneeLabel + 's')}</option>
            <option value="${GESTAO_PROJECT_SCHEDULING_DESIGNER_FILTER_NONE}" ${normalizedSelected === GESTAO_PROJECT_SCHEDULING_DESIGNER_FILTER_NONE ? 'selected' : ''}>Sem ${escapeHtml(assigneeLabel)}</option>
            ${marceneiroOptions}
        `;
    }

    const userOptions = getGestaoProjectSchedulingAssigneeUsersByKind(assigneeKind).map(user => {
        const selected = normalizedSelected === String(user.id) ? 'selected' : '';
        return `<option value="${user.id}" ${selected}>${escapeHtml(user.name)}</option>`;
    }).join('');

    return `
        <option value="">Todos os ${escapeHtml(assigneeLabel + 's')}</option>
        <option value="${GESTAO_PROJECT_SCHEDULING_DESIGNER_FILTER_NONE}" ${normalizedSelected === GESTAO_PROJECT_SCHEDULING_DESIGNER_FILTER_NONE ? 'selected' : ''}>Sem ${escapeHtml(assigneeLabel)}</option>
        ${userOptions}
    `;
}

function getGestaoProjectSchedulingProjectListEmptyMessage() {
    const clientQuery = String(gestaoProjectSchedulingProjectClientFilter || '').trim();
    const designerFilter = String(gestaoProjectSchedulingProjectDesignerFilter || '');

    if (clientQuery && designerFilter === GESTAO_PROJECT_SCHEDULING_DESIGNER_FILTER_NONE) {
        return `Nenhum projeto sem projetista para cliente contendo "${escapeHtml(clientQuery)}".`;
    }
    if (clientQuery && designerFilter) {
        const designerName = getGestaoProjectSchedulingDesignerNameById(designerFilter);
        return `Nenhum projeto de ${escapeHtml(designerName)} para cliente contendo "${escapeHtml(clientQuery)}".`;
    }
    if (clientQuery) {
        return `Nenhum projeto para cliente contendo "${escapeHtml(clientQuery)}".`;
    }
    if (designerFilter === GESTAO_PROJECT_SCHEDULING_DESIGNER_FILTER_NONE) {
        return 'Nenhum projeto sem projetista neste período.';
    }
    if (designerFilter) {
        const designerName = getGestaoProjectSchedulingDesignerNameById(designerFilter);
        return `Nenhum projeto para o projetista ${escapeHtml(designerName)}.`;
    }
    if (gestaoProjectSchedulingProjectHideWithForecast) {
        return 'Nenhum projeto sem previsão nesta faixa de status.';
    }

    const selectedStatus = getGestaoProjectSchedulingSelectedStatus();
    const range = getGestaoProjectSchedulingSelectedStatusRange(selectedStatus);
    if (range) {
        return `Nenhum projeto entre "${escapeHtml(range.start)}" e "${escapeHtml(range.end)}".`;
    }

    const statusName = selectedStatus?.name || 'status selecionado';
    return `Nenhum projeto em "${escapeHtml(statusName)}".`;
}

function getGestaoProjectSchedulingSelectedStatusRange(selectedStatus = null) {
    const status = selectedStatus || getGestaoProjectSchedulingSelectedStatus();
    if (!status?.name) return null;
    return GESTAO_PROJECT_SCHEDULING_STATUS_RANGE_BY_NAME[status.name] || null;
}

function getGestaoProjectSchedulingStatusRangeBounds(statuses, selectedStatus = null) {
    const range = getGestaoProjectSchedulingSelectedStatusRange(selectedStatus);
    if (!range) {
        return { minSort: null, maxSort: null };
    }

    const startStatus = (statuses || []).find(status => status.name === range.start);
    const endStatus = (statuses || []).find(status => status.name === range.end);
    return {
        minSort: startStatus?.sortOrder ?? null,
        maxSort: endStatus?.sortOrder ?? null,
        startName: range.start,
        endName: range.end
    };
}

function getGestaoProjectSchedulingProjectStatusSortOrder(project, statusById = {}) {
    const fromJoin = project?.projectStatus?.sortOrder;
    if (fromJoin != null) return Number(fromJoin);
    const status = statusById[project?.statusId];
    return status?.sortOrder != null ? Number(status.sortOrder) : 9999;
}

function isGestaoProjectSchedulingVisibleProject(project) {
    if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) return false;
    if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) return false;
    return true;
}

function isGestaoProjectSchedulingProjectInStatusRange(project, minSort, maxSort, statusById) {
    if (minSort == null || maxSort == null) return false;
    const sortOrder = getGestaoProjectSchedulingProjectStatusSortOrder(project, statusById);
    return sortOrder >= minSort && sortOrder <= maxSort;
}

function getGestaoProjectSchedulingDesignerNameById(designerId) {
    return getGestaoProjectSchedulingAssigneeNameById(designerId, ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER);
}

function getGestaoProjectSchedulingDesignerName(project) {
    if (project?.designer?.name) return project.designer.name;
    return getGestaoProjectSchedulingDesignerNameById(project?.designerId);
}

function getGestaoProjectSchedulingDesignerColorIndex(designerId) {
    const key = String(designerId || 'none');
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
        hash = ((hash << 5) - hash) + key.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash) % GESTAO_PROJECT_SCHEDULING_DESIGNER_PALETTE.length;
}

function getGestaoProjectSchedulingDesignerBarStyle(designerId) {
    const colors = GESTAO_PROJECT_SCHEDULING_DESIGNER_PALETTE[getGestaoProjectSchedulingDesignerColorIndex(designerId)];
    return `--gestao-project-scheduling-bar-from: ${colors.from}; --gestao-project-scheduling-bar-to: ${colors.to};`;
}

function getGestaoProjectSchedulingPrevisaoInputValue(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).slice(0, 10);
}

function getGestaoProjectSchedulingPrevisaoInputMaxDate(deliveryDate) {
    if (!deliveryDate) return '';
    return String(deliveryDate).slice(0, 10);
}

function validateGestaoProjectSchedulingPrevisao(inicioDate, previsaoDate) {
    if (!inicioDate && !previsaoDate) return true;

    if (!isOrderProjectStatusForecastRangeValid(inicioDate, previsaoDate)) {
        alertAppDialog(
            'O início deve ser anterior ou igual à previsão de conclusão.',
            { variant: 'warning', title: 'Aviso' }
        );
        return false;
    }
    return true;
}

function getGestaoProjectSchedulingProjectForecastRange(project, forecastRow = null) {
    const forecast = forecastRow || getGestaoProjectSchedulingEntryForecast(project?.id);
    const dates = typeof getOrderProjectStatusForecastDateRange === 'function'
        ? getOrderProjectStatusForecastDateRange(forecast)
        : null;

    if (!dates) return null;

    const endDate = gestaoProjectSchedulingParseDateKey(dates.forecastEndDate);
    const startDate = gestaoProjectSchedulingParseDateKey(dates.forecastStartDate);
    if (!startDate || !endDate) return null;

    const normalizedStart = startDate <= endDate ? startDate : endDate;
    const normalizedEnd = endDate >= startDate ? endDate : startDate;

    return {
        startKey: gestaoProjectSchedulingToDateKey(normalizedStart),
        endKey: gestaoProjectSchedulingToDateKey(normalizedEnd)
    };
}

function getGestaoProjectSchedulingBarPlacementForWeek(project, weekDays, forecastRange = null) {
    const forecast = (forecastRange && forecastRange.startKey)
        ? forecastRange
        : getGestaoProjectSchedulingProjectForecastRange(project, forecastRange);
    if (!forecast || !weekDays.length) return null;

    const weekStart = gestaoProjectSchedulingParseDateKey(weekDays[0].dateKey);
    const weekEnd = gestaoProjectSchedulingParseDateKey(weekDays[6].dateKey);
    const forecastStart = gestaoProjectSchedulingParseDateKey(forecast.startKey);
    const forecastEnd = gestaoProjectSchedulingParseDateKey(forecast.endKey);

    if (!weekStart || !weekEnd || !forecastStart || !forecastEnd) return null;
    if (forecastEnd < weekStart || forecastStart > weekEnd) return null;

    const visibleStart = forecastStart < weekStart ? weekStart : forecastStart;
    const visibleEnd = forecastEnd > weekEnd ? weekEnd : forecastEnd;
    const startCol = gestaoProjectSchedulingDaysBetween(weekStart, visibleStart) + 1;
    const span = gestaoProjectSchedulingDaysBetween(visibleStart, visibleEnd) + 1;

    return { startCol, span };
}

function getGestaoProjectSchedulingBarPlacement(project, monthDateKeys) {
    const forecast = getGestaoProjectSchedulingProjectForecastRange(project);
    if (!forecast || !monthDateKeys.length) return null;

    const monthStart = gestaoProjectSchedulingParseDateKey(monthDateKeys[0]);
    const monthEnd = gestaoProjectSchedulingParseDateKey(monthDateKeys[monthDateKeys.length - 1]);
    const forecastStart = gestaoProjectSchedulingParseDateKey(forecast.startKey);
    const forecastEnd = gestaoProjectSchedulingParseDateKey(forecast.endKey);

    if (!monthStart || !monthEnd || !forecastStart || !forecastEnd) return null;
    if (forecastEnd < monthStart || forecastStart > monthEnd) return null;

    const visibleStart = forecastStart < monthStart ? monthStart : forecastStart;
    const visibleEnd = forecastEnd > monthEnd ? monthEnd : forecastEnd;
    const startCol = gestaoProjectSchedulingDaysBetween(monthStart, visibleStart) + 1;
    const span = gestaoProjectSchedulingDaysBetween(visibleStart, visibleEnd) + 1;

    return { startCol, span };
}

function gestaoProjectSchedulingPlacementsOverlap(left, right) {
    if (!left || !right) return false;
    const leftEnd = left.startCol + left.span;
    const rightEnd = right.startCol + right.span;
    return left.startCol < rightEnd && right.startCol < leftEnd;
}

function assignGestaoProjectSchedulingDesignerLanes(projectItems, weekDays) {
    const sorted = [...projectItems].sort((left, right) =>
        String(left.forecast.startKey).localeCompare(String(right.forecast.startKey))
        || Number(left.project.id) - Number(right.project.id)
    );

    const lanes = [];

    sorted.forEach(item => {
        const placement = getGestaoProjectSchedulingBarPlacementForWeek(item.project, weekDays, item.forecast);
        if (!placement) return;

        let targetLane = lanes.find(lane =>
            !lane.some(existing => gestaoProjectSchedulingPlacementsOverlap(existing.placement, placement))
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

function buildGestaoProjectSchedulingProjects(orders, statuses, selectedStatus) {
    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
    const statusRange = getGestaoProjectSchedulingStatusRangeBounds(statuses, selectedStatus);
    const entries = [];

    (orders || []).forEach(order => {
        (order.projects || []).forEach(project => {
            if (!isGestaoProjectSchedulingVisibleProject(project)) return;

            if (statusRange.minSort != null && statusRange.maxSort != null) {
                if (!isGestaoProjectSchedulingProjectInStatusRange(
                    project,
                    statusRange.minSort,
                    statusRange.maxSort,
                    statusById
                )) return;
            } else if (Number(selectedStatus?.id) && Number(project.statusId) !== Number(selectedStatus.id)) {
                return;
            }

            entries.push({
                project,
                order,
                statusSort: getGestaoProjectSchedulingProjectStatusSortOrder(project, statusById)
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

function buildGestaoProjectSchedulingDesignerGroups(entries) {
    const groups = new Map();
    const status = getGestaoProjectSchedulingSelectedStatus();
    const assigneeKind = getGestaoProjectSchedulingAssigneeKind(status);

    entries.forEach(entry => {
        const forecast = getGestaoProjectSchedulingProjectForecastRange(entry.project);
        if (!forecast) return;

        const assigneeId = Number(getGestaoProjectSchedulingResolvedAssignee(entry.project)?.id) || 0;
        const groupKey = assigneeId || 'none';

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                assigneeId,
                assigneeKind,
                assigneeName: getGestaoProjectSchedulingAssigneeNameById(assigneeId, assigneeKind),
                projects: []
            });
        }

        groups.get(groupKey).projects.push({
            ...entry,
            forecast
        });
    });

    return [...groups.values()].sort((left, right) =>
        left.assigneeName.localeCompare(right.assigneeName, 'pt-BR')
    );
}

function updateGestaoProjectSchedulingProjectInCache(projectId, updates) {
    const normalizedId = Number(projectId);
    const entry = gestaoProjectSchedulingProjectsCache.find(item => Number(item.project.id) === normalizedId);
    if (!entry) return;

    Object.assign(entry.project, updates);
}

function renderGestaoProjectSchedulingDesignerOptions(selectedId) {
    const options = (gestaoProjetistasCache || []).map(projetista => {
        const selected = Number(projetista.id) === Number(selectedId) ? 'selected' : '';
        return `<option value="${projetista.id}" ${selected}>${escapeHtml(projetista.name)}</option>`;
    });

    return `<option value="">Selecione...</option>${options.join('')}`;
}

function renderGestaoProjectSchedulingAssigneeOptions(selectedId, assigneeKind) {
    if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
        const options = (gestaoMarceneirosCache || []).map(marceneiro => {
            const selected = Number(marceneiro.id) === Number(selectedId) ? 'selected' : '';
            return `<option value="${marceneiro.id}" ${selected}>${escapeHtml(marceneiro.name)}</option>`;
        });
        return `<option value="">Selecione...</option>${options.join('')}`;
    }

    const options = getGestaoProjectSchedulingAssigneeUsersByKind(assigneeKind).map(user => {
        const selected = Number(user.id) === Number(selectedId) ? 'selected' : '';
        return `<option value="${user.id}" ${selected}>${escapeHtml(user.name)}</option>`;
    });
    return `<option value="">Selecione...</option>${options.join('')}`;
}

function getGestaoProjectSchedulingForecastAssigneeValue(project, assigneeKind) {
    const forecast = gestaoProjectSchedulingForecastByProjectId.get(Number(project?.id));

    if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
        return Number(forecast?.cabinetMakerId) || null;
    }

    if (isGestaoProjectSchedulingAppUserAssigneeKind(assigneeKind)) {
        return Number(forecast?.userId) || null;
    }

    return null;
}

function renderGestaoProjectSchedulingAssigneeCell(project, assigneeKind, readOnly) {
    if (!assigneeKind) return '';

    const selectedId = getGestaoProjectSchedulingForecastAssigneeValue(project, assigneeKind);
    const label = getGestaoProjectSchedulingAssigneeLabel(assigneeKind);
    const forecastAssignee = getGestaoProjectSchedulingResolvedAssignee(project);
    const associated = shouldGestaoProjectSchedulingShowAssociatedPerson(assigneeKind)
        ? getGestaoProjectSchedulingAssociatedAssignee(project)
        : null;
    const associatedName = associated?.id
        ? associated.name
        : `Sem ${label.toLowerCase()}`;

    if (readOnly) {
        const forecastName = forecastAssignee?.id ? forecastAssignee.name : '—';
        const associatedHtml = associated
            ? `<div class="text-[10px] text-slate-400">Associado: ${escapeHtml(associatedName)}</div>`
            : '';
        return `
            <td class="p-2 text-xs text-slate-600 whitespace-nowrap">
                ${associatedHtml}
                <div>${escapeHtml(forecastName)}</div>
            </td>
        `;
    }

    const associateButtonHtml = shouldGestaoProjectSchedulingShowAssociateButton(assigneeKind)
        ? `<button type="button"
                class="gestao-project-scheduling-table-associate text-xs bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50 px-2 py-1.5 rounded-lg font-medium whitespace-nowrap"
                data-order-project-id="${project.id}"
                title="Associar ${escapeHtml(label.toLowerCase())} ao projeto">
                Associar
            </button>`
        : '';

    const associatedHtml = associated
        ? `<div class="text-[10px] text-slate-500 mb-1">Associado: <span class="font-medium text-slate-700">${escapeHtml(associatedName)}</span></div>`
        : '';

    return `
        <td class="p-2">
            ${associatedHtml}
            <div class="flex items-center gap-1.5 min-w-[12rem]">
                <select class="gestao-project-scheduling-assignee-select flex-1 min-w-0 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                    data-order-project-id="${project.id}"
                    data-assignee-kind="${escapeHtml(assigneeKind)}"
                    data-current-assignee-id="${selectedId || ''}">
                    ${renderGestaoProjectSchedulingAssigneeOptions(selectedId, assigneeKind)}
                </select>
                ${associateButtonHtml}
            </div>
        </td>
    `;
}

function getGestaoProjectSchedulingForecastInputValues(projectId) {
    const forecast = getGestaoProjectSchedulingEntryForecast(projectId);
    return {
        inicioDate: getGestaoProjectSchedulingPrevisaoInputValue(forecast?.forecastStartDate),
        previsaoDate: getGestaoProjectSchedulingPrevisaoInputValue(forecast?.forecastEndDate)
    };
}

function renderGestaoProjectSchedulingProjectTableRow(entry) {
    const { project, order } = entry;
    const statusName = project.projectStatus?.name || 'Status';
    const clientName = order.client?.name || 'Cliente';
    const orderCode = order.orderCode || '—';
    const projectCode = project.projectCode || '—';
    const projectLabel = project.name || 'Projeto';
    const selectedStatus = getGestaoProjectSchedulingSelectedStatus();
    const assigneeKind = getGestaoProjectSchedulingAssigneeKind(selectedStatus);
    const forecastValues = getGestaoProjectSchedulingForecastInputValues(project.id);
    const readOnly = isProjectSchedulingReadOnly();

    if (readOnly) {
        return `
            <tr class="gestao-project-scheduling-table-row gestao-project-scheduling-table-row--readonly" data-order-project-id="${project.id}">
                <td class="p-2 text-xs text-slate-700 whitespace-nowrap">${escapeHtml(orderCode)}</td>
                <td class="p-2 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-2 text-xs text-slate-700">
                    <button type="button" class="gestao-project-scheduling-table-open text-left text-indigo-700 hover:underline"
                        data-order-project-id="${project.id}" title="Abrir projeto">
                        ${escapeHtml(projectCode)} · ${escapeHtml(projectLabel)}
                    </button>
                </td>
                <td class="p-2 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(statusName)}</td>
                ${renderGestaoProjectSchedulingAssigneeCell(project, assigneeKind, true)}
                <td class="p-2 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(formatGestaoDate(forecastValues.inicioDate))}</td>
                <td class="p-2 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(formatGestaoDate(forecastValues.previsaoDate))}</td>
            </tr>
        `;
    }

    return `
        <tr class="gestao-project-scheduling-table-row" data-order-project-id="${project.id}">
            <td class="p-2 text-xs text-slate-700 whitespace-nowrap">${escapeHtml(orderCode)}</td>
            <td class="p-2 text-xs text-slate-600">${escapeHtml(clientName)}</td>
            <td class="p-2 text-xs text-slate-700">
                <button type="button" class="gestao-project-scheduling-table-open text-left text-indigo-700 hover:underline"
                    data-order-project-id="${project.id}" title="Abrir projeto">
                    ${escapeHtml(projectCode)} · ${escapeHtml(projectLabel)}
                </button>
            </td>
            <td class="p-2 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(statusName)}</td>
            ${renderGestaoProjectSchedulingAssigneeCell(project, assigneeKind, false)}
            <td class="p-2">
                <input type="date"
                    class="gestao-project-scheduling-previsao-inicio-input w-full min-w-[8.5rem] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                    data-order-project-id="${project.id}"
                    ${forecastValues.inicioDate ? `value="${escapeHtml(forecastValues.inicioDate)}"` : ''}
                    ${forecastValues.previsaoDate ? `max="${escapeHtml(forecastValues.previsaoDate)}"` : ''}>
            </td>
            <td class="p-2">
                <input type="date"
                    class="gestao-project-scheduling-previsao-fim-input w-full min-w-[8.5rem] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                    data-order-project-id="${project.id}"
                    ${forecastValues.previsaoDate ? `value="${escapeHtml(forecastValues.previsaoDate)}"` : ''}>
            </td>
            <td class="p-2 text-right">
                <button type="button"
                    class="gestao-project-scheduling-table-save text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap"
                    data-order-project-id="${project.id}">
                    Salvar
                </button>
            </td>
        </tr>
    `;
}

function renderGestaoProjectSchedulingProjectTable() {
    const tableBody = document.getElementById('gestao-project-scheduling-project-table-body');
    const countEl = document.getElementById('gestao-project-scheduling-project-count');
    const actionHeader = document.getElementById('gestao-project-scheduling-action-column-header');
    if (!tableBody) return;

    const selectedStatus = getGestaoProjectSchedulingSelectedStatus();
    const assigneeKind = getGestaoProjectSchedulingAssigneeKind(selectedStatus);
    const showAssignee = Boolean(assigneeKind);
    const assigneeHeader = document.getElementById('gestao-project-scheduling-assignee-column-header');
    assigneeHeader?.classList.toggle('hidden', !showAssignee);
    if (assigneeHeader && showAssignee) {
        assigneeHeader.textContent = getGestaoProjectSchedulingAssigneeLabel(assigneeKind);
    }
    actionHeader?.classList.toggle('hidden', isProjectSchedulingReadOnly());

    const entries = getGestaoProjectSchedulingProjectListEntries();
    if (countEl) countEl.textContent = String(entries.length);

    if (!entries.length) {
        const colspan = showAssignee ? (isProjectSchedulingReadOnly() ? 6 : 7) : (isProjectSchedulingReadOnly() ? 5 : 6);
        tableBody.innerHTML = `
            <tr>
                <td colspan="${colspan}" class="p-6 text-center text-xs text-slate-400">
                    ${getGestaoProjectSchedulingProjectListEmptyMessage()}
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = entries.map(entry => renderGestaoProjectSchedulingProjectTableRow(entry)).join('');
}

function renderGestaoProjectSchedulingDesignerLane(laneItems, weekDays, todayKey, group = {}) {
    const slotsHtml = weekDays.map((day, index) => {
        const date = gestaoProjectSchedulingParseDateKey(day.dateKey);
        const isWeekend = date && (date.getDay() === 0 || date.getDay() === 6);
        const isToday = day.dateKey === todayKey;

        return `
            <div class="gestao-project-scheduling-day-slot ${!day.inMonth ? 'gestao-project-scheduling-day-slot--outside' : ''} ${isWeekend ? 'gestao-project-scheduling-day-slot--weekend' : ''} ${isToday ? 'gestao-project-scheduling-day-slot--today' : ''}"
                style="grid-column: ${index + 1};"
                data-date="${day.dateKey}"></div>
        `;
    }).join('');

    const barsHtml = laneItems.map(item => {
        const { project, order, placement } = item;
        const clientName = order.client?.name || 'Cliente';
        const projectName = project.name || 'Projeto';
        const orderCode = order.orderCode || '—';
        const assigneeKind = item.assigneeKind || group.assigneeKind;
        const assigneeId = item.assigneeId != null ? item.assigneeId : group.assigneeId;
        const assigneeName = getGestaoProjectSchedulingAssigneeNameById(assigneeId, assigneeKind);

        return `
            <button type="button"
                class="gestao-project-scheduling-bar"
                data-order-project-id="${project.id}"
                style="${getGestaoProjectSchedulingDesignerBarStyle(assigneeId)} grid-column: ${placement.startCol} / span ${placement.span};"
                title="${escapeHtml(`${assigneeName} · ${orderCode} · ${clientName} · ${projectName}`)}">
                <span class="gestao-project-scheduling-bar__title">${escapeHtml(assigneeName)}</span>
                <span class="gestao-project-scheduling-bar__meta">${escapeHtml(clientName)} · ${escapeHtml(projectName)}</span>
            </button>
        `;
    }).join('');

    return `
        <div class="gestao-project-scheduling-lane">
            ${slotsHtml}
            ${barsHtml}
        </div>
    `;
}

function renderGestaoProjectSchedulingDesignerGroup(group, weekDays, todayKey) {
    const lanes = assignGestaoProjectSchedulingDesignerLanes(group.projects, weekDays);
    return lanes.map(laneItems =>
        renderGestaoProjectSchedulingDesignerLane(laneItems, weekDays, todayKey, group)
    ).join('');
}

function buildGestaoProjectSchedulingDesignerGroupsForWeek(entries, weekDays) {
    return buildGestaoProjectSchedulingDesignerGroups(entries)
        .map(group => ({
            ...group,
            projects: group.projects.filter(item => getGestaoProjectSchedulingBarPlacementForWeek(item.project, weekDays, item.forecast))
        }))
        .filter(group => group.projects.length > 0);
}

function renderGestaoProjectSchedulingWeekdayHeadersRow() {
    return `
        <div class="gestao-project-scheduling-weekday-headers">
            ${GESTAO_PROJECT_SCHEDULING_WEEKDAY_LABELS.map(label => `
                <div class="gestao-project-scheduling-weekday-header">${escapeHtml(label)}</div>
            `).join('')}
        </div>
    `;
}

function renderGestaoProjectSchedulingWeekBlock(week, entries, todayKey) {
    const { days: weekDays } = week;
    const designerGroups = buildGestaoProjectSchedulingDesignerGroupsForWeek(entries, weekDays);
    const assigneeKind = getGestaoProjectSchedulingAssigneeKind(getGestaoProjectSchedulingSelectedStatus());

    const dayHeadersHtml = weekDays.map(day => {
        const dayNumber = day.inMonth ? formatGestaoProjectSchedulingDayNumber(day.dateKey) : '';
        const date = gestaoProjectSchedulingParseDateKey(day.dateKey);
        const isWeekend = date && (date.getDay() === 0 || date.getDay() === 6);
        const isToday = day.dateKey === todayKey;

        return `
            <div class="gestao-project-scheduling-day-header ${!day.inMonth ? 'gestao-project-scheduling-day-header--outside' : ''} ${isWeekend ? 'gestao-project-scheduling-day-header--weekend' : ''} ${isToday ? 'gestao-project-scheduling-day-header--today' : ''}">
                <span class="gestao-project-scheduling-day-header__date">${escapeHtml(dayNumber)}</span>
            </div>
        `;
    }).join('');

    const groupsHtml = designerGroups.length
        ? designerGroups.map(group => renderGestaoProjectSchedulingDesignerGroup(group, weekDays, todayKey)).join('')
        : renderGestaoProjectSchedulingDesignerLane([], weekDays, todayKey, {
            assigneeId: 0,
            assigneeKind,
            status: getGestaoProjectSchedulingSelectedStatus()
        });

    return `
        <section class="gestao-project-scheduling-week-block">
            <div class="gestao-project-scheduling-calendar-table">
                <div class="gestao-project-scheduling-day-headers">${dayHeadersHtml}</div>
                <div class="gestao-project-scheduling-week-lanes">${groupsHtml}</div>
            </div>
        </section>
    `;
}

function renderGestaoProjectSchedulingWeekGrid() {
    const grid = document.getElementById('gestao-project-scheduling-calendar-grid');
    if (!grid) return;

    const todayKey = gestaoProjectSchedulingToDateKey(new Date());
    const entries = getGestaoProjectSchedulingCalendarEntries();
    const week = buildGestaoProjectSchedulingSingleWeek();
    const weekHtml = renderGestaoProjectSchedulingWeekBlock(week, entries, todayKey);
    const rangeLabel = formatGestaoProjectSchedulingWeekRangeLabel(startOfGestaoProjectSchedulingWeek(gestaoProjectSchedulingWeekAnchor));

    grid.innerHTML = `
        <div class="gestao-project-scheduling-month-range-label">${escapeHtml(rangeLabel)}</div>
        ${renderGestaoProjectSchedulingWeekdayHeadersRow()}
        <div class="gestao-project-scheduling-weeks gestao-project-scheduling-weeks--single">${weekHtml}</div>
    `;
}

function renderGestaoProjectSchedulingMonthGrid() {
    const grid = document.getElementById('gestao-project-scheduling-calendar-grid');
    if (!grid) return;

    const todayKey = gestaoProjectSchedulingToDateKey(new Date());
    const entries = getGestaoProjectSchedulingCalendarEntries();
    const weeks = buildGestaoProjectSchedulingMonthWeeks();
    const weeksHtml = weeks.map(week => renderGestaoProjectSchedulingWeekBlock(week, entries, todayKey)).join('');
    const monthDayRangeLabel = formatGestaoProjectSchedulingMonthDayRangeLabel();

    grid.innerHTML = `
        <div class="gestao-project-scheduling-month-range-label">${escapeHtml(monthDayRangeLabel)}</div>
        ${renderGestaoProjectSchedulingWeekdayHeadersRow()}
        <div class="gestao-project-scheduling-weeks">${weeksHtml}</div>
    `;
}

function renderGestaoProjectSchedulingCalendarGrid() {
    if (gestaoProjectSchedulingViewMode === 'week') {
        renderGestaoProjectSchedulingWeekGrid();
    } else {
        renderGestaoProjectSchedulingMonthGrid();
    }
    updateGestaoProjectSchedulingPeriodNavUi();
}

function renderGestaoProjectSchedulingLegend() {
    const legend = document.getElementById('gestao-project-scheduling-legend');
    if (!legend) return;

    legend.innerHTML = `
        <span class="gestao-project-scheduling-legend-item">
            <span class="gestao-project-scheduling-legend-swatch gestao-project-scheduling-legend-swatch--bar"></span>
            Período previsto
        </span>
        <span class="gestao-project-scheduling-legend-item">
            <span class="gestao-project-scheduling-legend-swatch gestao-project-scheduling-legend-swatch--today"></span>
            Hoje
        </span>
    `;
}

function renderGestaoProjectSchedulingViews() {
    renderGestaoProjectSchedulingLegend();
    if (!isProjectSchedulingReadOnly()) {
        renderGestaoProjectSchedulingProjectTable();
    }
    renderGestaoProjectSchedulingCalendarGrid();
}

function getGestaoProjectSchedulingRowValues(row) {
    const assigneeSelect = row?.querySelector('.gestao-project-scheduling-assignee-select');
    const assigneeKind = assigneeSelect?.dataset.assigneeKind || '';
    const assigneeId = Number(assigneeSelect?.value) || null;

    return {
        inicioDate: row?.querySelector('.gestao-project-scheduling-previsao-inicio-input')?.value || '',
        previsaoDate: row?.querySelector('.gestao-project-scheduling-previsao-fim-input')?.value || '',
        assigneeKind,
        assigneeId
    };
}

function getGestaoProjectSchedulingRowSavedValues(projectId) {
    const forecastValues = getGestaoProjectSchedulingForecastInputValues(projectId);
    const entry = gestaoProjectSchedulingProjectsCache.find(item => Number(item.project.id) === Number(projectId));
    const assigneeKind = getGestaoProjectSchedulingAssigneeKind(getGestaoProjectSchedulingSelectedStatus());

    return {
        inicioDate: forecastValues.inicioDate,
        previsaoDate: forecastValues.previsaoDate,
        assigneeKind,
        assigneeId: getGestaoProjectSchedulingForecastAssigneeValue(entry?.project, assigneeKind)
    };
}

function hasGestaoProjectSchedulingRowChanges(row, projectId) {
    const values = getGestaoProjectSchedulingRowValues(row);
    const saved = getGestaoProjectSchedulingRowSavedValues(projectId);
    const datesChanged = values.inicioDate !== saved.inicioDate
        || values.previsaoDate !== saved.previsaoDate;
    const assigneeChanged = Number(values.assigneeId) !== Number(saved.assigneeId);

    return datesChanged || assigneeChanged;
}

async function saveGestaoProjectSchedulingTableRow(row) {
    if (isProjectSchedulingReadOnly()) {
        alertAppDialog('Visualização somente leitura.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    const projectId = Number(row?.dataset.orderProjectId);
    const selectedStatusId = getGestaoProjectSchedulingSelectedStatusId();
    if (!projectId || !selectedStatusId) return false;

    const entry = gestaoProjectSchedulingProjectsCache.find(item => Number(item.project.id) === projectId);
    const project = entry?.project;
    if (!project) return false;

    const values = getGestaoProjectSchedulingRowValues(row);
    const saved = getGestaoProjectSchedulingRowSavedValues(projectId);
    const datesChanged = values.inicioDate !== saved.inicioDate || values.previsaoDate !== saved.previsaoDate;
    const assigneeChanged = Number(values.assigneeId) !== Number(saved.assigneeId);
    const saveAssigneeOnForecast = shouldGestaoProjectSchedulingSaveAssigneeOnForecast(values.assigneeKind);

    if (!datesChanged && !assigneeChanged) {
        alertAppDialog('Nenhuma alteração para salvar.', { variant: 'info', title: 'Aviso' });
        return false;
    }

    if (datesChanged && !validateGestaoProjectSchedulingPrevisao(values.inicioDate, values.previsaoDate)) {
        return false;
    }

    if (saveAssigneeOnForecast && assigneeChanged && !values.assigneeId
        && !values.inicioDate && !values.previsaoDate) {
        alertAppDialog(`Selecione um ${getGestaoProjectSchedulingAssigneeLabel(values.assigneeKind).toLowerCase()}.`);
        return false;
    }

    const saveButton = row.querySelector('.gestao-project-scheduling-table-save');

    if (saveButton) {
        saveButton.disabled = true;
    }

    try {
        gestaoProjectSchedulingSaving = true;
        setGestaoProjectSchedulingActionLoading(true, 'Salvando previsão...');

        if (typeof saveOrderProjectStatusForecast !== 'function') {
            alertAppDialog('Módulo de previsão indisponível.', { variant: 'warning', title: 'Aviso' });
            return false;
        }

        const forecastPayload = {
            orderProjectId: projectId,
            statusId: selectedStatusId,
            updatedById: currentUser.id
        };

        if (datesChanged) {
            forecastPayload.forecastStartDate = values.inicioDate;
            forecastPayload.forecastEndDate = values.previsaoDate;
        }

        if (saveAssigneeOnForecast) {
            if (values.assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
                forecastPayload.cabinetMakerId = values.assigneeId || null;
                forecastPayload.userId = null;
            } else {
                forecastPayload.userId = values.assigneeId || null;
                forecastPayload.cabinetMakerId = null;
            }
        }

        const { data: forecastRow, error: forecastError } = await saveOrderProjectStatusForecast(forecastPayload);

        if (forecastError && !isOrderProjectStatusForecastTableError(forecastError.message)) {
            setGestaoProjectSchedulingActionLoading(true, `Erro ao salvar previsão: ${forecastError.message}`, 'error');
            await waitGestaoProjectSchedulingStatus(2200);
            return false;
        }

        if (forecastError && isOrderProjectStatusForecastTableError(forecastError.message)) {
            alertAppDialog(
                'Execute supabase/feats/add-order-project-status-forecast.sql no Supabase para habilitar previsões por status.',
                { variant: 'warning', title: 'Aviso' }
            );
            return false;
        }

        if (forecastRow) {
            gestaoProjectSchedulingForecastByProjectId.set(projectId, forecastRow);
        } else {
            gestaoProjectSchedulingForecastByProjectId.delete(projectId);
        }

        applyOrderProjectStatusForecastToProject(project, gestaoProjectSchedulingForecastByProjectId.get(projectId) || null);

        setGestaoProjectSchedulingActionLoading(true, 'Previsão salva com sucesso!', 'success');
        await waitGestaoProjectSchedulingStatus(900);
        renderGestaoProjectSchedulingViews();
        return true;
    } finally {
        gestaoProjectSchedulingSaving = false;
        setGestaoProjectSchedulingActionLoading(false);
        if (saveButton) {
            saveButton.disabled = false;
        }
    }
}

async function associateGestaoProjectSchedulingAssignee(row) {
    if (isProjectSchedulingReadOnly()) {
        alertAppDialog('Visualização somente leitura.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    if (!canAccessGestao()) {
        alertAppDialog('Sem permissão para associar o responsável ao projeto.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    const projectId = Number(row?.dataset.orderProjectId);
    const selectedStatusId = getGestaoProjectSchedulingSelectedStatusId();
    const selectedStatus = getGestaoProjectSchedulingSelectedStatus();
    const assigneeKind = getGestaoProjectSchedulingAssigneeKind(selectedStatus);
    if (!projectId || !selectedStatusId || !assigneeKind) return false;

    const entry = gestaoProjectSchedulingProjectsCache.find(item => Number(item.project.id) === projectId);
    const project = entry?.project;
    if (!project) return false;

    const values = getGestaoProjectSchedulingRowValues(row);
    if (!values.assigneeId) {
        const label = getGestaoProjectSchedulingAssigneeLabel(assigneeKind).toLowerCase();
        alertAppDialog(`Selecione um ${label}.`);
        return false;
    }

    const associated = getGestaoProjectSchedulingAssociatedAssignee(project);
    if (Number(values.assigneeId) === Number(associated?.id)) {
        alertAppDialog('Este responsável já está associado ao projeto.', { variant: 'info', title: 'Aviso' });
        return false;
    }

    const assigneeName = getGestaoProjectSchedulingAssigneeNameById(values.assigneeId, assigneeKind);

    if (!(await confirmAppDialog(`Associar ${assigneeName} a este projeto?`))) {
        return false;
    }

    const now = new Date().toISOString();
    const associateButton = row.querySelector('.gestao-project-scheduling-table-associate');

    if (associateButton) {
        associateButton.disabled = true;
    }

    try {
        gestaoProjectSchedulingSaving = true;
        setGestaoProjectSchedulingActionLoading(true, 'Associando responsável...');

        const projectPayload = {
            updatedById: currentUser.id,
            updatedAt: now
        };

        if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
            projectPayload.cabinetMakerId = values.assigneeId;
        } else if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER) {
            projectPayload.designerId = values.assigneeId;
        } else {
            alertAppDialog('Este status não associa responsável no projeto.', { variant: 'info', title: 'Aviso' });
            return false;
        }

        const { error: projectError } = await supabaseClient
            .from('OrderProject')
            .update(projectPayload)
            .eq('id', projectId);

        if (projectError) {
            setGestaoProjectSchedulingActionLoading(true, `Erro ao associar: ${projectError.message}`, 'error');
            await waitGestaoProjectSchedulingStatus(2200);
            return false;
        }

        if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
            project.cabinetMakerId = values.assigneeId;
            project.cabinetMaker = { id: values.assigneeId, name: assigneeName };
        } else {
            project.designerId = values.assigneeId;
            project.designer = { id: values.assigneeId, name: assigneeName };
        }

        if (typeof saveOrderProjectStatusForecast === 'function') {
            const forecastPayload = {
                orderProjectId: projectId,
                statusId: selectedStatusId,
                updatedById: currentUser.id
            };

            if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
                forecastPayload.cabinetMakerId = values.assigneeId;
                forecastPayload.userId = null;
            } else {
                forecastPayload.userId = values.assigneeId;
                forecastPayload.cabinetMakerId = null;
            }

            const { data: forecastRow, error: forecastError } = await saveOrderProjectStatusForecast(forecastPayload);

            if (forecastError && !isOrderProjectStatusForecastTableError(forecastError.message)) {
                setGestaoProjectSchedulingActionLoading(true, `Responsável associado, mas falhou ao salvar previsão: ${forecastError.message}`, 'error');
                await waitGestaoProjectSchedulingStatus(2200);
                return false;
            }

            if (forecastRow) {
                gestaoProjectSchedulingForecastByProjectId.set(projectId, forecastRow);
                applyOrderProjectStatusForecastToProject(project, forecastRow);
            }
        }

        if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER) {
            const orderId = project.orderId || entry?.order?.id;
            if (orderId && typeof notifyDesignerAssignedToProjectEmail === 'function') {
                setGestaoProjectSchedulingActionLoading(true, 'Enviando notificação por e-mail...');
                await notifyDesignerAssignedToProjectEmail({
                    orderId,
                    orderProjectIds: [projectId],
                    designerId: values.assigneeId
                });
            }
        }

        setGestaoProjectSchedulingActionLoading(true, 'Responsável associado com sucesso!', 'success');
        await waitGestaoProjectSchedulingStatus(900);
        renderGestaoProjectSchedulingViews();
        return true;
    } finally {
        gestaoProjectSchedulingSaving = false;
        setGestaoProjectSchedulingActionLoading(false);
        if (associateButton) {
            associateButton.disabled = false;
        }
    }
}

async function ensureGestaoProjectSchedulingProjetistasLoaded() {
    if ((gestaoProjetistasCache || []).length) return;

    const { data } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .order('name', { ascending: true });

    gestaoProjetistasCache = data || [];
}

async function ensureGestaoProjectSchedulingMarceneirosLoaded() {
    if ((gestaoMarceneirosCache || []).length) return;

    if (typeof loadMarceneiros === 'function') {
        gestaoMarceneirosCache = await loadMarceneiros(true);
        return;
    }

    const { data } = await supabaseClient
        .from('CabinetMaker')
        .select('id, name')
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    gestaoMarceneirosCache = data || [];
}

async function ensureGestaoProjectSchedulingConferenceReviewersLoaded() {
    if ((gestaoProjectSchedulingConferenceReviewersCache || []).length) return;

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name, isConferenceReviewer')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .eq('isConferenceReviewer', true)
        .order('name', { ascending: true });

    if (error?.message?.includes('isConferenceReviewer')) {
        const fallback = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .eq('role', 'Projetista')
            .eq('isActive', true)
            .order('name', { ascending: true });
        gestaoProjectSchedulingConferenceReviewersCache = fallback.data || [];
        return;
    }

    gestaoProjectSchedulingConferenceReviewersCache = data || [];
}

async function ensureGestaoProjectSchedulingPpcpUsersLoaded() {
    if ((gestaoProjectSchedulingPpcpUsersCache || []).length) return;

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name, isPpcp')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .eq('isPpcp', true)
        .order('name', { ascending: true });

    if (error?.message?.includes('isPpcp')) {
        gestaoProjectSchedulingPpcpUsersCache = [];
        return;
    }

    gestaoProjectSchedulingPpcpUsersCache = data || [];
}

async function ensureGestaoProjectSchedulingAssigneesLoaded(status) {
    const assigneeKind = getGestaoProjectSchedulingAssigneeKind(status);

    if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER) {
        await ensureGestaoProjectSchedulingMarceneirosLoaded();
        return;
    }

    if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CONFERENCE_REVIEWER) {
        await ensureGestaoProjectSchedulingConferenceReviewersLoaded();
        return;
    }

    if (assigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_PPCP) {
        await ensureGestaoProjectSchedulingPpcpUsersLoaded();
        return;
    }

    await ensureGestaoProjectSchedulingProjetistasLoaded();
}

function renderGestaoProjectSchedulingFilterSelects() {
    const projectDesignerSelect = document.getElementById('gestao-project-scheduling-project-designer-filter');
    const calendarDesignerSelect = document.getElementById('gestao-project-scheduling-calendar-designer-filter');

    if (projectDesignerSelect) {
        projectDesignerSelect.innerHTML = renderGestaoProjectSchedulingDesignerFilterOptions(gestaoProjectSchedulingProjectDesignerFilter);
    }

    if (calendarDesignerSelect) {
        calendarDesignerSelect.innerHTML = renderGestaoProjectSchedulingDesignerFilterOptions(gestaoProjectSchedulingCalendarDesignerFilter);
    }
}

async function loadGestaoProjectScheduling() {
    const content = document.getElementById('gestao-project-scheduling-content');
    if (!content) return;

    const statusesPreview = await loadGestaoProjectStatuses(true);
    const selectedStatusIdPreview = resolveGestaoProjectSchedulingSelectedStatusId(statusesPreview);
    const readOnly = isProjectSchedulingReadOnly();

    content.innerHTML = `
        <div class="gestao-project-scheduling-layout${readOnly ? ' gestao-project-scheduling-layout--readonly gestao-project-scheduling-layout--calendar-only' : ''}">
            <section class="gestao-project-scheduling-calendar-panel">
                <div class="gestao-project-scheduling-calendar-panel__filters">
                    <label class="gestao-project-scheduling-panel__filter">
                        <span class="gestao-project-scheduling-panel__filter-label">Status</span>
                        <select id="gestao-project-scheduling-status-filter"
                            class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500">
                            ${renderGestaoProjectSchedulingStatusOptions(selectedStatusIdPreview)}
                        </select>
                    </label>
                    <label class="gestao-project-scheduling-panel__filter">
                        <span class="gestao-project-scheduling-panel__filter-label">Cliente</span>
                        <input type="text"
                            id="gestao-project-scheduling-calendar-client-filter"
                            class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                            placeholder="Filtrar por cliente..."
                            value="${escapeHtml(gestaoProjectSchedulingCalendarClientFilter)}"
                            autocomplete="off">
                    </label>
                    <label class="gestao-project-scheduling-panel__filter gestao-project-scheduling-assignee-filter">
                        <span id="gestao-project-scheduling-calendar-assignee-filter-label" class="gestao-project-scheduling-panel__filter-label">Projetista</span>
                        <select id="gestao-project-scheduling-calendar-designer-filter"
                            class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500">
                            ${renderGestaoProjectSchedulingDesignerFilterOptions(gestaoProjectSchedulingCalendarDesignerFilter)}
                        </select>
                    </label>
                </div>
                <div id="gestao-project-scheduling-legend" class="gestao-project-scheduling-legend"></div>
                <div class="gestao-project-scheduling-calendar-scroll">
                    <div id="gestao-project-scheduling-calendar-grid" class="gestao-project-scheduling-month-grid">
                        <p class="text-xs text-slate-400 text-center py-8">Carregando calendário...</p>
                    </div>
                </div>
            </section>
            <section class="gestao-project-scheduling-table-panel${readOnly ? ' hidden' : ''}">
                <div class="gestao-project-scheduling-table-panel__header-row">
                    <h4 class="gestao-project-scheduling-table-panel__title">Projetos</h4>
                    <span id="gestao-project-scheduling-project-count" class="gestao-project-scheduling-table-panel__count">0</span>
                    <div class="gestao-project-scheduling-table-panel__filters">
                        <label class="gestao-project-scheduling-panel__filter">
                            <span class="gestao-project-scheduling-panel__filter-label">Cliente</span>
                            <input type="text"
                                id="gestao-project-scheduling-project-client-filter"
                                class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                                placeholder="Filtrar tabela..."
                                value="${escapeHtml(gestaoProjectSchedulingProjectClientFilter)}"
                                autocomplete="off">
                        </label>
                        <label class="gestao-project-scheduling-panel__filter gestao-project-scheduling-assignee-filter">
                            <span id="gestao-project-scheduling-project-assignee-filter-label" class="gestao-project-scheduling-panel__filter-label">Projetista</span>
                            <select id="gestao-project-scheduling-project-designer-filter"
                                class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500">
                                ${renderGestaoProjectSchedulingDesignerFilterOptions(gestaoProjectSchedulingProjectDesignerFilter)}
                            </select>
                        </label>
                        <label class="gestao-project-scheduling-panel__filter gestao-project-scheduling-hide-forecast-filter">
                            <span class="gestao-project-scheduling-panel__filter-label">&nbsp;</span>
                            <span class="gestao-project-scheduling-hide-forecast-checkbox">
                                <input type="checkbox"
                                    id="gestao-project-scheduling-project-hide-forecast-filter"
                                    class="rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                                    ${gestaoProjectSchedulingProjectHideWithForecast ? 'checked' : ''}>
                                <span>Ocultar com previsão</span>
                            </span>
                        </label>
                    </div>
                </div>
                <div class="gestao-project-scheduling-table-scroll">
                    <table class="gestao-project-scheduling-table w-full text-sm">
                        <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-2 font-semibold">Pedido</th>
                                <th class="text-left p-2 font-semibold">Cliente</th>
                                <th class="text-left p-2 font-semibold">Projeto</th>
                                <th class="text-left p-2 font-semibold">Status atual</th>
                                <th id="gestao-project-scheduling-assignee-column-header" class="text-left p-2 font-semibold">Projetista</th>
                                <th class="text-left p-2 font-semibold">Início previsto</th>
                                <th class="text-left p-2 font-semibold">Fim previsto</th>
                                <th id="gestao-project-scheduling-action-column-header" class="text-right p-2 font-semibold w-24">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="gestao-project-scheduling-project-table-body" class="divide-y divide-slate-100">
                            <tr>
                                <td colspan="8" class="p-6 text-center text-xs text-slate-400">Carregando projetos...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    `;

    renderGestaoProjectSchedulingLegend();

    const [statuses, ordersResult] = await Promise.all([
        loadGestaoProjectStatuses(true),
        fetchGestaoOrders()
    ]);

    if (ordersResult.error) {
        const tableBody = document.getElementById('gestao-project-scheduling-project-table-body');
        const grid = document.getElementById('gestao-project-scheduling-calendar-grid');
        const message = `Erro ao carregar programação: ${escapeHtml(ordersResult.error.message)}`;
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-xs text-red-500">${message}</td></tr>`;
        }
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

    resolveGestaoProjectSchedulingSelectedStatusId(statuses);
    const selectedStatus = getGestaoProjectSchedulingSelectedStatus();
    await ensureGestaoProjectSchedulingAssigneesLoaded(selectedStatus);

    gestaoProjectSchedulingProjectsCache = buildGestaoProjectSchedulingProjects(orders, statuses, selectedStatus);
    await loadGestaoProjectSchedulingForecastsForCache();
    renderGestaoProjectSchedulingFilterSelects();
    updateGestaoProjectSchedulingAssigneeFilterVisibility();
    applyProjectSchedulingReadOnlyUi();
    renderGestaoProjectSchedulingViews();
}

function updateGestaoProjectSchedulingAssigneeFilterVisibility() {
    const selectedStatus = getGestaoProjectSchedulingSelectedStatus();
    const assigneeKind = getGestaoProjectSchedulingAssigneeKind(selectedStatus);
    const showAssignee = Boolean(assigneeKind);
    const assigneeLabel = getGestaoProjectSchedulingAssigneeLabel(assigneeKind);

    document.querySelectorAll('.gestao-project-scheduling-assignee-filter').forEach(element => {
        element.classList.toggle('hidden', !showAssignee);
    });

    document.getElementById('gestao-project-scheduling-calendar-assignee-filter-label')?.replaceChildren(
        document.createTextNode(assigneeLabel)
    );
    document.getElementById('gestao-project-scheduling-project-assignee-filter-label')?.replaceChildren(
        document.createTextNode(assigneeLabel)
    );
}

function bindGestaoProjectSchedulingEvents() {
    if (gestaoProjectSchedulingEventsBound) return;
    gestaoProjectSchedulingEventsBound = true;

    document.getElementById('btn-gestao-project-scheduling-view-week')?.addEventListener('click', () => {
        setGestaoProjectSchedulingViewMode('week');
    });

    document.getElementById('btn-gestao-project-scheduling-view-month')?.addEventListener('click', () => {
        setGestaoProjectSchedulingViewMode('month');
    });

    document.getElementById('btn-gestao-project-scheduling-prev-period')?.addEventListener('click', () => {
        navigateGestaoProjectSchedulingPeriod(-1);
    });

    document.getElementById('btn-gestao-project-scheduling-next-period')?.addEventListener('click', () => {
        navigateGestaoProjectSchedulingPeriod(1);
    });

    document.getElementById('btn-gestao-project-scheduling-today-period')?.addEventListener('click', () => {
        resetGestaoProjectSchedulingPeriodToToday();
    });

    document.getElementById('btn-gestao-project-scheduling-refresh')?.addEventListener('click', () => {
        loadGestaoProjectScheduling();
    });

    document.getElementById('gestao-project-scheduling-content')?.addEventListener('click', async event => {
        const openButton = event.target.closest('.gestao-project-scheduling-table-open, .gestao-project-scheduling-bar');
        if (openButton && !event.target.closest('.gestao-project-scheduling-table-save, .gestao-project-scheduling-table-associate')) {
            const projectId = Number(openButton.dataset.orderProjectId);
            if (projectId && typeof openProjectViewModal === 'function') {
                openProjectViewModal(projectId);
            }
            return;
        }

        if (isProjectSchedulingReadOnly()) return;

        if (gestaoProjectSchedulingSaving) return;

        const associateButton = event.target.closest('.gestao-project-scheduling-table-associate');
        if (associateButton) {
            const row = associateButton.closest('.gestao-project-scheduling-table-row');
            await associateGestaoProjectSchedulingAssignee(row);
            return;
        }

        const saveButton = event.target.closest('.gestao-project-scheduling-table-save');
        if (!saveButton) return;

        const row = saveButton.closest('.gestao-project-scheduling-table-row');
        await saveGestaoProjectSchedulingTableRow(row);
    });

    document.getElementById('gestao-project-scheduling-content')?.addEventListener('input', event => {
        const calendarClientFilter = event.target.closest('#gestao-project-scheduling-calendar-client-filter');
        if (calendarClientFilter) {
            gestaoProjectSchedulingCalendarClientFilter = calendarClientFilter.value || '';
            renderGestaoProjectSchedulingCalendarGrid();
            return;
        }

        const projectClientFilter = event.target.closest('#gestao-project-scheduling-project-client-filter');
        if (projectClientFilter) {
            gestaoProjectSchedulingProjectClientFilter = projectClientFilter.value || '';
            renderGestaoProjectSchedulingProjectTable();
            return;
        }

        if (isProjectSchedulingReadOnly()) return;

        const row = event.target.closest('.gestao-project-scheduling-table-row');
        if (!row) return;

        const projectId = Number(row.dataset.orderProjectId);
        row.classList.toggle('gestao-project-scheduling-table-row--dirty', hasGestaoProjectSchedulingRowChanges(row, projectId));

        const inicioInput = row.querySelector('.gestao-project-scheduling-previsao-inicio-input');
        const fimInput = row.querySelector('.gestao-project-scheduling-previsao-fim-input');
        if (inicioInput && fimInput?.value) {
            inicioInput.max = fimInput.value;
        }
    });

    document.getElementById('gestao-project-scheduling-content')?.addEventListener('change', async event => {
        const statusFilter = event.target.closest('#gestao-project-scheduling-status-filter');
        if (statusFilter) {
            gestaoProjectSchedulingSelectedStatusId = Number(statusFilter.value) || null;
            gestaoProjectSchedulingCalendarDesignerFilter = '';
            gestaoProjectSchedulingProjectDesignerFilter = '';
            await loadGestaoProjectScheduling();
            return;
        }

        const calendarDesignerFilter = event.target.closest('#gestao-project-scheduling-calendar-designer-filter');
        if (calendarDesignerFilter) {
            gestaoProjectSchedulingCalendarDesignerFilter = calendarDesignerFilter.value || '';
            renderGestaoProjectSchedulingCalendarGrid();
            return;
        }

        const projectDesignerFilter = event.target.closest('#gestao-project-scheduling-project-designer-filter');
        if (projectDesignerFilter) {
            gestaoProjectSchedulingProjectDesignerFilter = projectDesignerFilter.value || '';
            renderGestaoProjectSchedulingProjectTable();
            return;
        }

        const assigneeSelect = event.target.closest('.gestao-project-scheduling-assignee-select');
        if (assigneeSelect) {
            const row = assigneeSelect.closest('.gestao-project-scheduling-table-row');
            if (row) {
                const projectId = Number(row.dataset.orderProjectId);
                row.classList.toggle(
                    'gestao-project-scheduling-table-row--dirty',
                    hasGestaoProjectSchedulingRowChanges(row, projectId)
                );
            }
            return;
        }

        const hideForecastFilter = event.target.closest('#gestao-project-scheduling-project-hide-forecast-filter');
        if (hideForecastFilter) {
            gestaoProjectSchedulingProjectHideWithForecast = hideForecastFilter.checked;
            renderGestaoProjectSchedulingProjectTable();
        }

        if (isProjectSchedulingReadOnly()) return;

        const row = event.target.closest('.gestao-project-scheduling-table-row');
        if (!row) return;

        const projectId = Number(row.dataset.orderProjectId);
        row.classList.toggle('gestao-project-scheduling-table-row--dirty', hasGestaoProjectSchedulingRowChanges(row, projectId));
    });
}

window.loadGestaoProjectScheduling = loadGestaoProjectScheduling;
window.bindGestaoProjectSchedulingEvents = bindGestaoProjectSchedulingEvents;
