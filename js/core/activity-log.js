const ACTIVITY_LOG_ACTIONS = {
    'order_project.status_changed': 'Status do projeto alterado',
    'order_project.internal_assembly_started': 'Início da montagem interna',
    'order_project.internal_assembly_finished': 'Fim da montagem interna',
    'order_project.cabinet_maker_assigned': 'Marceneiro associado',
    'detailing.created': 'Detalhamento criado',
    'detailing.designer_assigned': 'Projetista de detalhamento associado',
    'detailing.started': 'Detalhamento iniciado',
    'detailing.completed': 'Detalhamento encerrado',
    'detailing.status_changed': 'Status do detalhamento alterado',
    'revision.started': 'Revisão iniciada',
    'revision.completed': 'Revisão concluída',
    'revision.status_changed': 'Status da revisão alterado'
};

const ACTIVITY_LOG_PAGE_SIZE_DEFAULT = 50;

function getActivityLogActionLabel(action) {
    const key = String(action || '').trim();
    return ACTIVITY_LOG_ACTIONS[key] || key || '—';
}

function getActivityLogValueDisplay(value) {
    if (!value || typeof value !== 'object') return '—';
    const display = value.display;
    if (display !== undefined && display !== null && String(display).trim() !== '') {
        return String(display);
    }
    if (value.raw === undefined || value.raw === null) return '—';
    if (typeof value.raw === 'string') return value.raw;
    try {
        return JSON.stringify(value.raw);
    } catch (_error) {
        return String(value.raw);
    }
}

function formatActivityLogChangeSummary(entry) {
    const before = getActivityLogValueDisplay(entry?.previousValue);
    const after = getActivityLogValueDisplay(entry?.newValue);
    if (before === '—' && after === '—') return '—';
    if (before === '—') return after;
    if (after === '—') return before;
    return `${before} → ${after}`;
}

function formatActivityLogRevisionMeta(entry) {
    const revisionType = entry?.metadata?.revisionType;
    if (!revisionType) return '';
    const labels = {
        commercial_commercial: 'Comercial',
        commercial_technical: 'Técnica',
        technical_reviewer: 'Revisor técnico',
        third_party: 'Terceiro'
    };
    const label = labels[revisionType] || revisionType;
    return ` (${label})`;
}

function toActivityLogJsonbValue(raw, display) {
    return {
        raw: raw === undefined ? null : raw,
        display: display === undefined || display === null ? '' : String(display)
    };
}

async function logActivityChange(options = {}) {
    if (!supabaseClient) return null;

    const entityType = String(options.entityType || '').trim();
    const entityId = Number(options.entityId);
    const action = String(options.action || '').trim();
    if (!entityType || !entityId || !action) return null;

    try {
        const { data, error } = await supabaseClient.rpc('append_activity_log', {
            p_entity_type: entityType,
            p_entity_id: entityId,
            p_action: action,
            p_field_name: options.fieldName || null,
            p_previous_value: options.previousValue || null,
            p_new_value: options.newValue || null,
            p_metadata: options.metadata || null,
            p_order_project_id: options.orderProjectId ? Number(options.orderProjectId) : null,
            p_order_id: options.orderId ? Number(options.orderId) : null
        });

        if (error) {
            if (String(error.message || '').includes('append_activity_log')
                || String(error.message || '').includes('ActivityLog')) {
                console.warn('logActivityChange: execute supabase/feats/create-activity-log.sql');
            } else {
                console.warn('logActivityChange:', error);
            }
            return null;
        }

        return data;
    } catch (error) {
        console.warn('logActivityChange:', error);
        return null;
    }
}

async function resolveActivityLogOrderIdByCode(orderCode) {
    const code = String(orderCode || '').trim();
    if (!code) return null;

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select('id')
        .eq('orderCode', code)
        .maybeSingle();

    if (error) {
        console.warn('resolveActivityLogOrderIdByCode:', error);
        return null;
    }

    return Number(data?.id) || null;
}

function isActivityLogTableMissingError(message) {
    const text = String(message || '').toLowerCase();
    if (!text) return false;
    if (text.includes('schema cache') && text.includes('activitylog')) return false;
    if (text.includes('relationship') && text.includes('activitylog')) return false;
    if (text.includes('could not find') && text.includes('relationship')) return false;
    return text.includes('does not exist') && text.includes('activitylog');
}

async function enrichActivityLogRows(rows = []) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return list;

    const userIds = [...new Set(list.map(row => Number(row.changedById)).filter(Boolean))];
    const orderIds = [...new Set(list.map(row => Number(row.orderId)).filter(Boolean))];

    const userById = {};
    const orderById = {};

    if (userIds.length) {
        const { data: users, error } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', userIds);
        if (!error) {
            (users || []).forEach(user => {
                userById[Number(user.id)] = user;
            });
        }
    }

    if (orderIds.length) {
        const { data: orders, error } = await supabaseClient
            .from('salesOrders')
            .select('id, orderCode')
            .in('id', orderIds);
        if (!error) {
            (orders || []).forEach(order => {
                orderById[Number(order.id)] = order;
            });
        }
    }

    return list.map(row => ({
        ...row,
        changedBy: userById[Number(row.changedById)] || row.changedBy || null,
        order: orderById[Number(row.orderId)] || row.order || null
    }));
}

async function fetchActivityLogPage(options = {}) {
    const page = Math.max(0, Number(options.page) || 0);
    const pageSize = Math.min(100, Math.max(10, Number(options.pageSize) || ACTIVITY_LOG_PAGE_SIZE_DEFAULT));
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let orderId = options.orderId ? Number(options.orderId) : null;
    if (!orderId && options.orderCode) {
        orderId = await resolveActivityLogOrderIdByCode(options.orderCode);
        if (options.orderCode && !orderId) {
            return { rows: [], total: 0, page, pageSize, missingTable: false };
        }
    }

    let query = supabaseClient
        .from('ActivityLog')
        .select(
            'id, entityType, entityId, action, fieldName, previousValue, newValue, orderProjectId, orderId, changedAt, metadata, changedById',
            { count: 'exact' }
        )
        .order('changedAt', { ascending: false })
        .range(from, to);

    const changedById = Number(options.changedById);
    if (changedById) {
        query = query.eq('changedById', changedById);
    }

    const action = String(options.action || '').trim();
    if (action) {
        query = query.eq('action', action);
    }

    if (orderId) {
        query = query.eq('orderId', orderId);
    }

    const dateFrom = String(options.dateFrom || '').trim();
    if (dateFrom) {
        query = query.gte('changedAt', `${dateFrom}T00:00:00`);
    }

    const dateTo = String(options.dateTo || '').trim();
    if (dateTo) {
        query = query.lte('changedAt', `${dateTo}T23:59:59.999`);
    }

    const result = await query;

    if (result.error) {
        const message = String(result.error.message || '');
        if (isActivityLogTableMissingError(message)) {
            return { rows: [], total: 0, page, pageSize, missingTable: true, error: result.error };
        }
        throw result.error;
    }

    const rows = await enrichActivityLogRows(result.data || []);

    return {
        rows,
        total: Number(result.count) || 0,
        page,
        pageSize,
        missingTable: false
    };
}

window.ACTIVITY_LOG_ACTIONS = ACTIVITY_LOG_ACTIONS;
window.ACTIVITY_LOG_PAGE_SIZE_DEFAULT = ACTIVITY_LOG_PAGE_SIZE_DEFAULT;
window.getActivityLogActionLabel = getActivityLogActionLabel;
window.getActivityLogValueDisplay = getActivityLogValueDisplay;
window.formatActivityLogChangeSummary = formatActivityLogChangeSummary;
window.formatActivityLogRevisionMeta = formatActivityLogRevisionMeta;
window.toActivityLogJsonbValue = toActivityLogJsonbValue;
window.logActivityChange = logActivityChange;
window.fetchActivityLogPage = fetchActivityLogPage;
