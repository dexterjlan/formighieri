// Catálogo alinhado aos triggers em supabase/feats/activity-log-triggers-wave1.sql e wave2.sql
const ACTIVITY_LOG_ACTIONS = {
    // OrderProject (onda 1 + 2)
    'order_project.status_changed': 'Status do projeto alterado',
    'order_project.internal_assembly_started': 'Início da montagem interna registrado',
    'order_project.internal_assembly_start_date_changed': 'Data de início da montagem interna alterada',
    'order_project.internal_assembly_finished': 'Fim da montagem interna registrado',
    'order_project.internal_assembly_end_date_changed': 'Data de fim da montagem interna alterada',
    'order_project.cabinet_maker_assigned': 'Marceneiro associado',
    'order_project.designer_assigned': 'Projetista associado ao projeto',
    'order_project.delivery_date_changed': 'Data de entrega do projeto alterada',
    'order_project.production_month_changed': 'Mês de produção alterado',
    'order_project.technical_forecast_changed': 'Previsão de projeto técnico alterada',
    // Detailing (onda 1)
    'detailing.created': 'Detalhamento criado',
    'detailing.designer_assigned': 'Projetista de detalhamento associado',
    'detailing.started': 'Detalhamento iniciado',
    'detailing.completed': 'Detalhamento encerrado',
    'detailing.status_changed': 'Status do detalhamento alterado',
    // Revision (onda 1 + refinamento onda 2)
    'revision.started': 'Revisão iniciada',
    'revision.designer_started': 'Projetista iniciou revisão técnica',
    'revision.reviewer_started': 'Revisor iniciou revisão técnica',
    'revision.consultor_revision_started': 'Consultor iniciou revisão comercial',
    'revision.third_party_started': 'Revisão de terceiro iniciada',
    'revision.completed': 'Revisão concluída',
    'revision.designer_completed': 'Projetista concluiu revisão técnica',
    'revision.reviewer_completed': 'Revisor concluiu revisão técnica',
    'revision.consultor_revision_completed': 'Consultor concluiu revisão comercial',
    'revision.third_party_completed': 'Revisão de terceiro concluída',
    'revision.status_changed': 'Status da revisão alterado',
    // Measurement (onda 2)
    'measurement.created': 'Medição registrada',
    // Conferência de anteprojeto (onda 2)
    'preliminary_design_conference.status_changed': 'Status da conferência de anteprojeto alterado',
    // Implantação / PPCP (onda 2)
    'implementation.created': 'Implantação aberta',
    'implementation.status_changed': 'Status da implantação alterado',
    'implementation.sent_to_production': 'Implantação enviada para produção',
    'implementation.closed': 'Implantação encerrada',
    // Requisições (onda 2)
    'order_request.status_changed': 'Status da requisição alterado'
};

// Próxima onda (ainda sem trigger): ThirdPartyProject, salesOrders.actualDeliveryDate,
// OrderProjectStatusHistory manual, histórico PreliminaryDesignConferenceHistory (voltar consultor).

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
    const orderProjectIds = [...new Set(list.map(row => Number(row.orderProjectId)).filter(Boolean))];
    let orderIds = [...new Set(list.map(row => Number(row.orderId)).filter(Boolean))];

    const userById = {};
    const orderById = {};
    const orderProjectById = {};

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

    if (orderProjectIds.length) {
        const { data: projects, error } = await supabaseClient
            .from('OrderProject')
            .select('id, name, orderId')
            .in('id', orderProjectIds);
        if (!error) {
            (projects || []).forEach(project => {
                orderProjectById[Number(project.id)] = project;
                if (project.orderId) {
                    orderIds.push(Number(project.orderId));
                }
            });
        }
    }

    orderIds = [...new Set(orderIds.filter(Boolean))];

    if (orderIds.length) {
        let ordersResult = await supabaseClient
            .from('salesOrders')
            .select('id, orderCode, client:Client(name)')
            .in('id', orderIds);

        if (ordersResult.error?.message?.includes('Client')) {
            ordersResult = await supabaseClient
                .from('salesOrders')
                .select('id, orderCode')
                .in('id', orderIds);
        }

        if (!ordersResult.error) {
            (ordersResult.data || []).forEach(order => {
                orderById[Number(order.id)] = order;
            });
        }
    }

    return list.map(row => {
        const orderProject = orderProjectById[Number(row.orderProjectId)] || row.orderProject || null;
        const resolvedOrderId = Number(row.orderId) || Number(orderProject?.orderId) || null;
        const order = resolvedOrderId
            ? (orderById[resolvedOrderId] || row.order || null)
            : (row.order || null);
        const clientName = order && typeof getOrderClientName === 'function'
            ? (getOrderClientName(order) || '')
            : (order?.client?.name || '');

        return {
            ...row,
            changedBy: userById[Number(row.changedById)] || row.changedBy || null,
            order,
            orderProject,
            clientName
        };
    });
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
