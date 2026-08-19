const ORDER_PROJECT_TECHNICAL_STATUS_NAME = 'Projeto Técnico';
const ORDER_PROJECT_INTERNAL_ASSEMBLY_STATUS_NAME = 'Montagem Interna';
const ORDER_PROJECT_CONFERENCE_SENT_STATUS_NAME = 'Conferência Enviada';
const ORDER_PROJECT_IMPLANTATION_STATUS_NAME = 'Implantação';

const ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER = 'designer';
const ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER = 'cabinet_maker';
const ORDER_PROJECT_FORECAST_ASSIGNEE_CONFERENCE_REVIEWER = 'conference_reviewer';
const ORDER_PROJECT_FORECAST_ASSIGNEE_PPCP = 'ppcp';

function buildOrderProjectStatusForecastPayload(forecastStartDate, forecastEndDate, userId = undefined, cabinetMakerId = undefined) {
    const payload = {
        forecastStartDate: forecastStartDate || null,
        forecastEndDate: forecastEndDate || null
    };

    if (userId !== undefined) payload.userId = userId || null;
    if (cabinetMakerId !== undefined) payload.cabinetMakerId = cabinetMakerId || null;

    return payload;
}

function hasOrderProjectStatusForecastDates(forecastStartDate, forecastEndDate) {
    return Boolean(forecastStartDate || forecastEndDate);
}

function hasOrderProjectStatusForecastContent({
    forecastStartDate = null,
    forecastEndDate = null,
    userId = null,
    cabinetMakerId = null
} = {}) {
    return Boolean(forecastStartDate || forecastEndDate || userId || cabinetMakerId);
}

function isOrderProjectStatusForecastRangeValid(forecastStartDate, forecastEndDate) {
    if (!forecastStartDate || !forecastEndDate) return true;
    return String(forecastStartDate) <= String(forecastEndDate);
}

function isOrderProjectStatusForecastTableError(message = '') {
    const normalized = String(message);
    return normalized.includes('OrderProjectStatusForecast')
        || normalized.includes('supportsForecast')
        || normalized.includes('forecastAssigneeKind');
}

function normalizeOrderProjectStatusForecastRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        orderProjectId: row.orderProjectId,
        statusId: row.statusId,
        forecastStartDate: row.forecastStartDate || null,
        forecastEndDate: row.forecastEndDate || null,
        userId: row.userId || null,
        cabinetMakerId: row.cabinetMakerId || null
    };
}

function getOrderProjectStatusForecastAssigneeKind(status) {
    if (!status) return null;

    if (status.forecastAssigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER
        || status.forecastAssigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER
        || status.forecastAssigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_CONFERENCE_REVIEWER
        || status.forecastAssigneeKind === ORDER_PROJECT_FORECAST_ASSIGNEE_PPCP) {
        return status.forecastAssigneeKind;
    }

    if (status.name === ORDER_PROJECT_TECHNICAL_STATUS_NAME) {
        return ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER;
    }

    if (status.name === ORDER_PROJECT_INTERNAL_ASSEMBLY_STATUS_NAME) {
        return ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER;
    }

    if (status.name === ORDER_PROJECT_CONFERENCE_SENT_STATUS_NAME) {
        return ORDER_PROJECT_FORECAST_ASSIGNEE_CONFERENCE_REVIEWER;
    }

    if (status.name === ORDER_PROJECT_IMPLANTATION_STATUS_NAME) {
        return ORDER_PROJECT_FORECAST_ASSIGNEE_PPCP;
    }

    return null;
}

function getOrderProjectStatusForecastDateRange(forecast) {
    const startKey = String(forecast?.forecastStartDate || '').split('T')[0];
    const endKey = String(forecast?.forecastEndDate || '').split('T')[0];

    if (!startKey && !endKey) return null;

    const startDate = startKey || endKey;
    const endDate = endKey || startKey;

    return {
        forecastStartDate: startDate,
        forecastEndDate: endDate
    };
}

function resolveOrderProjectStatusForecast(project, forecastRow = null) {
    if (forecastRow) {
        return normalizeOrderProjectStatusForecastRow(forecastRow);
    }

    const legacyStart = project?.technicalProjectForecastStartDate || null;
    const legacyEnd = project?.technicalProjectForecastEndDate || null;
    const legacyUserId = project?.designerId || null;

    if (!legacyStart && !legacyEnd && !legacyUserId) return null;

    return {
        orderProjectId: project?.id,
        statusId: null,
        forecastStartDate: legacyStart,
        forecastEndDate: legacyEnd,
        userId: legacyUserId,
        cabinetMakerId: null
    };
}

function applyOrderProjectStatusForecastToProject(project, forecastRow) {
    if (!project) return project;

    const forecast = resolveOrderProjectStatusForecast(project, forecastRow);
    project.statusForecast = forecast;
    project.technicalProjectForecastStartDate = forecast?.forecastStartDate || null;
    project.technicalProjectForecastEndDate = forecast?.forecastEndDate || null;
    return project;
}

async function fetchOrderProjectStatusForecasts(orderProjectIds, statusId = null) {
    const ids = [...new Set((orderProjectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!ids.length) return [];

    let query = supabaseClient
        .from('OrderProjectStatusForecast')
        .select('id, orderProjectId, statusId, forecastStartDate, forecastEndDate, userId, cabinetMakerId')
        .in('orderProjectId', ids);

    if (Array.isArray(statusId)) {
        const statusIds = [...new Set(statusId.map(id => Number(id)).filter(Boolean))];
        if (!statusIds.length) return [];
        query = query.in('statusId', statusIds);
    } else if (statusId) {
        query = query.eq('statusId', Number(statusId));
    }

    const { data, error } = await query;

    if (error) {
        if (isOrderProjectStatusForecastTableError(error.message)) {
            console.warn('OrderProjectStatusForecast indisponível:', error.message);
            return [];
        }
        throw error;
    }

    return (data || []).map(normalizeOrderProjectStatusForecastRow);
}

async function fetchOrderProjectStatusForecastMap(orderProjectIds, statusId) {
    const rows = await fetchOrderProjectStatusForecasts(orderProjectIds, statusId);
    const map = new Map();
    rows.forEach(row => {
        map.set(Number(row.orderProjectId), row);
    });
    return map;
}

async function enrichOrderProjectsWithStatusForecast(projects, statusId) {
    const list = Array.isArray(projects) ? projects : [];
    const normalizedStatusId = Number(statusId);
    if (!list.length || !normalizedStatusId) return list;

    const forecastMap = await fetchOrderProjectStatusForecastMap(
        list.map(project => project.id),
        normalizedStatusId
    );

    list.forEach(project => {
        applyOrderProjectStatusForecastToProject(project, forecastMap.get(Number(project.id)) || null);
    });

    return list;
}

async function saveOrderProjectStatusForecast({
    orderProjectId,
    statusId,
    forecastStartDate,
    forecastEndDate,
    userId,
    cabinetMakerId,
    updatedById
}) {
    const projectId = Number(orderProjectId);
    const normalizedStatusId = Number(statusId);
    if (!projectId || !normalizedStatusId) {
        return { error: { message: 'Projeto ou status inválido.' } };
    }

    const { data: existingRow } = await supabaseClient
        .from('OrderProjectStatusForecast')
        .select('id, forecastStartDate, forecastEndDate, userId, cabinetMakerId')
        .eq('orderProjectId', projectId)
        .eq('statusId', normalizedStatusId)
        .maybeSingle();

    const existing = normalizeOrderProjectStatusForecastRow(existingRow);
    const startDate = forecastStartDate !== undefined ? (forecastStartDate || null) : (existing?.forecastStartDate || null);
    const endDate = forecastEndDate !== undefined ? (forecastEndDate || null) : (existing?.forecastEndDate || null);
    const resolvedUserId = userId !== undefined ? (userId || null) : (existing?.userId || null);
    const resolvedCabinetMakerId = cabinetMakerId !== undefined
        ? (cabinetMakerId || null)
        : (existing?.cabinetMakerId || null);

    if (!hasOrderProjectStatusForecastContent({
        forecastStartDate: startDate,
        forecastEndDate: endDate,
        userId: resolvedUserId,
        cabinetMakerId: resolvedCabinetMakerId
    })) {
        const { error } = await supabaseClient
            .from('OrderProjectStatusForecast')
            .delete()
            .eq('orderProjectId', projectId)
            .eq('statusId', normalizedStatusId);

        if (error && !isOrderProjectStatusForecastTableError(error.message)) {
            return { error, deleted: true };
        }

        return { data: null, error: isOrderProjectStatusForecastTableError(error?.message) ? error : null, deleted: true };
    }

    if (!isOrderProjectStatusForecastRangeValid(startDate, endDate)) {
        return { error: { message: 'A data de início deve ser anterior ou igual à data de fim.' } };
    }

    if (resolvedUserId && resolvedCabinetMakerId) {
        return { error: { message: 'Informe apenas um responsável por previsão.' } };
    }

    const now = new Date().toISOString();
    const actorId = updatedById || currentUser?.id || null;
    const payload = {
        orderProjectId: projectId,
        statusId: normalizedStatusId,
        forecastStartDate: startDate,
        forecastEndDate: endDate,
        userId: resolvedUserId,
        cabinetMakerId: resolvedCabinetMakerId,
        updatedAt: now,
        updatedById: actorId
    };

    let data = null;
    let error = null;

    if (existing?.id) {
        ({ data, error } = await supabaseClient
            .from('OrderProjectStatusForecast')
            .update(payload)
            .eq('id', existing.id)
            .select('id, orderProjectId, statusId, forecastStartDate, forecastEndDate, userId, cabinetMakerId')
            .maybeSingle());
    } else {
        ({ data, error } = await supabaseClient
            .from('OrderProjectStatusForecast')
            .insert({ ...payload, createdById: actorId })
            .select('id, orderProjectId, statusId, forecastStartDate, forecastEndDate, userId, cabinetMakerId')
            .maybeSingle());
    }

    if (error) {
        return { error, deleted: false };
    }

    return {
        data: normalizeOrderProjectStatusForecastRow(data),
        error: null,
        deleted: false
    };
}

async function getOrderProjectTechnicalStatusId() {
    const statuses = typeof loadGestaoProjectStatuses === 'function'
        ? await loadGestaoProjectStatuses(true)
        : [];

    const fromCache = statuses.find(status => status.name === ORDER_PROJECT_TECHNICAL_STATUS_NAME);
    if (fromCache?.id) return fromCache.id;

    if (typeof getPendenciasStatusIdByName === 'function') {
        return getPendenciasStatusIdByName(ORDER_PROJECT_TECHNICAL_STATUS_NAME);
    }

    return null;
}

function getOrderProjectForecastStatusNames() {
    return [
        ORDER_PROJECT_TECHNICAL_STATUS_NAME,
        ORDER_PROJECT_INTERNAL_ASSEMBLY_STATUS_NAME,
        ORDER_PROJECT_CONFERENCE_SENT_STATUS_NAME,
        ORDER_PROJECT_IMPLANTATION_STATUS_NAME
    ];
}

function getOrderProjectStatusesWithForecastSupport(statuses = []) {
    const forecastNames = new Set(getOrderProjectForecastStatusNames());
    return (statuses || []).filter(status => forecastNames.has(status.name));
}

window.buildOrderProjectStatusForecastPayload = buildOrderProjectStatusForecastPayload;
window.hasOrderProjectStatusForecastDates = hasOrderProjectStatusForecastDates;
window.hasOrderProjectStatusForecastContent = hasOrderProjectStatusForecastContent;
window.isOrderProjectStatusForecastRangeValid = isOrderProjectStatusForecastRangeValid;
window.isOrderProjectStatusForecastTableError = isOrderProjectStatusForecastTableError;
window.getOrderProjectStatusForecastAssigneeKind = getOrderProjectStatusForecastAssigneeKind;
window.getOrderProjectStatusForecastDateRange = getOrderProjectStatusForecastDateRange;
window.resolveOrderProjectStatusForecast = resolveOrderProjectStatusForecast;
window.applyOrderProjectStatusForecastToProject = applyOrderProjectStatusForecastToProject;
window.fetchOrderProjectStatusForecasts = fetchOrderProjectStatusForecasts;
window.fetchOrderProjectStatusForecastMap = fetchOrderProjectStatusForecastMap;
window.enrichOrderProjectsWithStatusForecast = enrichOrderProjectsWithStatusForecast;
window.saveOrderProjectStatusForecast = saveOrderProjectStatusForecast;
window.getOrderProjectTechnicalStatusId = getOrderProjectTechnicalStatusId;
window.getOrderProjectForecastStatusNames = getOrderProjectForecastStatusNames;
window.getOrderProjectStatusesWithForecastSupport = getOrderProjectStatusesWithForecastSupport;
window.ORDER_PROJECT_TECHNICAL_STATUS_NAME = ORDER_PROJECT_TECHNICAL_STATUS_NAME;
window.ORDER_PROJECT_INTERNAL_ASSEMBLY_STATUS_NAME = ORDER_PROJECT_INTERNAL_ASSEMBLY_STATUS_NAME;
window.ORDER_PROJECT_CONFERENCE_SENT_STATUS_NAME = ORDER_PROJECT_CONFERENCE_SENT_STATUS_NAME;
window.ORDER_PROJECT_IMPLANTATION_STATUS_NAME = ORDER_PROJECT_IMPLANTATION_STATUS_NAME;
window.ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER = ORDER_PROJECT_FORECAST_ASSIGNEE_DESIGNER;
window.ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER = ORDER_PROJECT_FORECAST_ASSIGNEE_CABINET_MAKER;
window.ORDER_PROJECT_FORECAST_ASSIGNEE_CONFERENCE_REVIEWER = ORDER_PROJECT_FORECAST_ASSIGNEE_CONFERENCE_REVIEWER;
window.ORDER_PROJECT_FORECAST_ASSIGNEE_PPCP = ORDER_PROJECT_FORECAST_ASSIGNEE_PPCP;
