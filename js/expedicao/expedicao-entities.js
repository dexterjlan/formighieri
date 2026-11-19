const EXPEDITION_ENTITY_TYPES = [
    { value: 'Assistance', label: 'Assistência' },
    { value: 'ExternalAssemblyInspection', label: 'Vistoria' },
    { value: 'PartRequest', label: 'Requisição de peça' },
    { value: 'Purchase', label: 'Requisição de compra' }
];

function getExpeditionEntityTypeLabel(entityType) {
    return EXPEDITION_ENTITY_TYPES.find(item => item.value === entityType)?.label || entityType || '—';
}

function buildAddrSnapshotFromRecord(record) {
    if (!record) return null;
  const addrId = Number(record.id || record.addrId) || null;
    if (!addrId && !record.street && !record.city) return null;

    return {
        id: addrId,
        nickname: record.nickname || '',
        street: record.street || '',
        number: record.number || '',
        complement: record.complement || '',
        neighborhood: record.neighborhood || '',
        city: record.city || '',
        state: record.state || '',
        postalCode: record.postalCode || '',
        labelName: record.labelName || ''
    };
}

function formatExpeditionAddressOneLine(snapshot) {
    if (!snapshot) return '';
    const street = [snapshot.street, snapshot.number].filter(Boolean).join(', ');
    const city = [snapshot.city, snapshot.state].filter(Boolean).join(' - ');
    return [street, snapshot.neighborhood, city].filter(Boolean).join(' · ');
}

function formatExpeditionFactoryAddressFromSettings(settings = {}) {
    const snapshot = {
        street: settings.expeditionFactoryStreet || '',
        number: settings.expeditionFactoryNumber || '',
        complement: settings.expeditionFactoryComplement || '',
        neighborhood: settings.expeditionFactoryNeighborhood || '',
        city: settings.expeditionFactoryCity || '',
        state: settings.expeditionFactoryState || '',
        postalCode: settings.expeditionFactoryPostalCode || ''
    };
    if (typeof formatAddrFullDisplay === 'function') {
        const text = formatAddrFullDisplay(snapshot).trim();
        if (text) return text;
    }
    return formatExpeditionAddressOneLine(snapshot);
}

function expeditionMapsAddressParam(snapshot) {
    if (!snapshot) return '';
    const parts = [
        [snapshot.street, snapshot.number].filter(Boolean).join(', '),
        snapshot.neighborhood,
        snapshot.city,
        snapshot.state,
        snapshot.postalCode
    ].filter(Boolean);
    return parts.join(', ');
}

async function fetchAddrRecordById(addrId) {
    const key = Number(addrId);
    if (!key) return null;

    if (typeof fetchGestaoClientAddrs === 'function') {
        const record = await fetchGestaoClientAddrs(null, { addrId: key });
        if (record) return record;
    }

    const { data, error } = await supabaseClient
        .from('addr')
        .select('id, nickname, street, number, complement, neighborhood, city, state, postalCode')
        .eq('id', key)
        .maybeSingle();

    if (error) {
        console.warn('fetchAddrRecordById:', error);
        return null;
    }
    return data || null;
}

function escapeExpeditionIlikePattern(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
}

async function fetchSalesOrderForExpedition(orderId) {
    const key = Number(orderId);
    if (!key) return null;

    const selects = [
        'id, orderCode, addrId, clientId, client:Client(name), address:addr(id, nickname, street, number, complement, neighborhood, city, state, postalCode, isPrimary)',
        'id, orderCode, addrId, clientId, client:Client(name)',
        'id, orderCode, clientId, client:Client(name)',
        'id, orderCode, clientId'
    ];

    for (const select of selects) {
        const { data, error } = await supabaseClient
            .from('salesOrders')
            .select(select)
            .eq('id', key)
            .maybeSingle();

        if (!error) return data;
        if (!/addrId|relationship|embed|schema cache|column/i.test(error.message || '')) {
            console.warn('fetchSalesOrderForExpedition:', error);
            break;
        }
    }

    return null;
}

async function resolveSalesOrderAddress(orderId) {
    const key = Number(orderId);
    if (!key) return { addr: null, error: 'Pedido não informado.' };

    const order = await fetchSalesOrderForExpedition(key);
    if (!order) {
        return { addr: null, error: 'Pedido não encontrado.' };
    }

    let addr = order.address ? buildAddrSnapshotFromRecord(order.address) : null;
    if (!addr && Number(order.addrId)) {
        addr = await fetchAddrRecordById(order.addrId);
    }
    if (!addr && Number(order.clientId)) {
        addr = await resolveClientPrimaryAddress(order.clientId);
    }
    if (!addr) {
        return { addr: null, error: 'Pedido sem endereço de entrega cadastrado.', order };
    }

    return { addr, order };
}

async function resolveExternalAssemblyInspectionOrderId(inspectionId, row = null) {
    const direct = Number(row?.orderId || 0);
    if (direct) return direct;

    const key = Number(inspectionId);
    if (!key) return null;

    const { data, error } = await supabaseClient
        .from('ExternalAssemblyInspectionProject')
        .select('orderProject:OrderProject(orderId)')
        .eq('inspectionId', key)
        .order('id', { ascending: true })
        .limit(1);

    if (error) {
        console.warn('resolveExternalAssemblyInspectionOrderId:', error);
        return null;
    }

    return Number(data?.[0]?.orderProject?.orderId) || null;
}

async function backfillExternalAssemblyInspectionOrderIds(rows = []) {
    if (!rows.length) return [];

    const missingIds = rows
        .filter(row => !Number(row.orderId))
        .map(row => Number(row.id))
        .filter(Boolean);

    const orderIdByInspectionId = new Map();

    if (missingIds.length) {
        const { data: links, error } = await supabaseClient
            .from('ExternalAssemblyInspectionProject')
            .select('inspectionId, orderProject:OrderProject(orderId)')
            .in('inspectionId', missingIds);

        if (error) {
            console.warn('backfillExternalAssemblyInspectionOrderIds:', error);
        } else {
            (links || []).forEach(link => {
                const inspectionId = Number(link.inspectionId);
                const orderId = Number(link.orderProject?.orderId);
                if (inspectionId && orderId && !orderIdByInspectionId.has(inspectionId)) {
                    orderIdByInspectionId.set(inspectionId, orderId);
                }
            });
        }
    }

    return rows.map(row => {
        const inspectionId = Number(row.id);
        const orderId = Number(row.orderId) || orderIdByInspectionId.get(inspectionId) || null;
        return { ...row, orderId };
    }).filter(row => Number(row.orderId));
}

async function resolveClientPrimaryAddress(clientId) {
    const key = Number(clientId);
    if (!key) return null;

    const { data, error } = await supabaseClient
        .from('addr')
        .select('id, nickname, street, number, complement, neighborhood, city, state, postalCode, isPrimary')
        .eq('clientId', key)
        .order('isPrimary', { ascending: false })
        .order('id', { ascending: true })
        .limit(1);

    if (error) {
        console.warn('resolveClientPrimaryAddress:', error);
        return null;
    }
    return data?.[0] || null;
}

function expeditionEntityFieldValue(value) {
    const text = value == null ? '' : String(value).trim();
    return text || '—';
}

function formatExpeditionAssistanceScheduledLabel(row) {
    if (typeof formatAssistanceScheduledDateLabel === 'function') {
        const label = formatAssistanceScheduledDateLabel(row?.scheduledAt);
        if (label) return label;
    }
    if (row?.scheduledAt && typeof formatDate === 'function') {
        return formatDate(row.scheduledAt);
    }
    return '';
}

function getExpeditionOrderProjectLabel(row) {
    const op = row?.orderProject;
    if (!op) return '';
    return String(op.name || op.projectCode || '').trim();
}

function formatExpeditionInspectionSequenceLabel(row) {
    const seq = row?.expeditionInspectionSequence;
    if (seq == null || seq === '') return '';
    return String(seq);
}

function getExpeditionEntitySearchRowFields(row, entityType) {
    if (entityType === 'Assistance') {
        return [
            { label: 'ID', value: row?.id },
            { label: 'Cliente', value: row?.client?.name },
            { label: 'Pedido', value: row?.order?.orderCode },
            { label: 'Data agendamento', value: formatExpeditionAssistanceScheduledLabel(row) }
        ];
    }
    if (entityType === 'ExternalAssemblyInspection') {
        const projectLabel = row?.expeditionProjectLabel || getExpeditionOrderProjectLabel(row);
        return [
            { label: 'Req. compra', value: row?.purchaseId || row?.id },
            { label: 'Cliente', value: row?.order?.client?.name },
            { label: 'Pedido', value: row?.order?.orderCode },
            { label: 'Projeto', value: projectLabel },
            { label: 'Nº vistoria', value: formatExpeditionInspectionSequenceLabel(row) }
        ];
    }
    if (entityType === 'PartRequest') {
        return [
            { label: 'Peça', value: row?.pieceName },
            { label: 'Cliente', value: row?.client?.name },
            { label: 'Pedido', value: row?.order?.orderCode },
            { label: 'Projeto', value: getExpeditionOrderProjectLabel(row) }
        ];
    }
    if (entityType === 'Purchase') {
        return [
            { label: 'ID', value: row?.id },
            { label: 'Cliente', value: getExpeditionPurchaseClientName(row) },
            { label: 'Pedido', value: row?.order?.orderCode || row?.orderProject?.order?.orderCode },
            { label: 'Projeto', value: getExpeditionOrderProjectLabel(row) }
        ];
    }
    return [{ label: 'Item', value: row?.id != null ? `#${row.id}` : '' }];
}

function formatExpeditionEntitySearchRowLabel(row, entityType) {
    return getExpeditionEntitySearchRowFields(row, entityType)
        .map(field => expeditionEntityFieldValue(field.value))
        .filter(value => value !== '—')
        .join(' · ');
}

function getExpeditionEntitySearchColumnLabels(entityType) {
    return getExpeditionEntitySearchRowFields({ id: 0 }, entityType).map(field => field.label);
}

function renderExpeditionEntitySearchHeaderHtml(entityType) {
    const labels = getExpeditionEntitySearchColumnLabels(entityType);
    return `
        <div class="expedition-entity-pick expedition-entity-pick--header">
            ${labels.map(label => `
                <span class="expedition-entity-pick__label">${escapeHtml(label)}</span>
            `).join('')}
        </div>
    `;
}

function renderExpeditionEntitySearchRowHtml(row, entityType) {
    const fields = getExpeditionEntitySearchRowFields(row, entityType);
    return `
        <div class="expedition-entity-pick expedition-entity-pick--values">
            ${fields.map(field => `
                <span class="expedition-entity-pick__value">${escapeHtml(expeditionEntityFieldValue(field.value))}</span>
            `).join('')}
        </div>
    `;
}

function isExpeditionPurchaseSearchExcluded(row) {
    if (!row) return true;
    if (Number(row.assistanceRequestId) || Number(row.externalAssemblyInspectionId)) return true;
    const reason = row.purchaseReason;
    if (reason?.isSystem === true) return true;
    if (typeof isRequisicoesPurchaseAssistenciaReason === 'function' && isRequisicoesPurchaseAssistenciaReason(reason)) {
        return true;
    }
    if (typeof isRequisicoesPurchaseVistoriaReason === 'function' && isRequisicoesPurchaseVistoriaReason(reason)) {
        return true;
    }
    return false;
}

const EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED =
    'orderProject:OrderProject(id, name, projectCode, orderId, order:salesOrders(id, orderCode, addrId, clientId, client:Client(name)))';

const EXPEDITION_PURCHASE_SELECTS = [
    `id, status, orderProjectId, assistanceRequestId, externalAssemblyInspectionId, purchaseReasonId, requestObservation, purchaseType, ${EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED}, purchaseReason:PurchaseReason(name, isSystem)`,
    `id, status, orderProjectId, assistanceRequestId, externalAssemblyInspectionId, purchaseReasonId, requestObservation, purchaseType, ${EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED}, purchaseReason:PurchaseReason(name)`,
    `id, status, orderProjectId, assistanceRequestId, externalAssemblyInspectionId, purchaseReasonId, note, purchaseType, ${EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED}, purchaseReason:PurchaseReason(name)`
];

function getExpeditionPurchaseOrderId(row) {
    return Number(row?.orderId)
        || Number(row?.order?.id)
        || Number(row?.orderProject?.orderId)
        || Number(row?.orderProject?.order?.id)
        || null;
}

function getExpeditionPurchaseClientName(row) {
    return String(
        row?.orderProject?.order?.client?.name
            || row?.order?.client?.name
            || row?.client?.name
            || ''
    ).trim();
}

function getExpeditionPurchaseClientId(row) {
    return Number(row?.orderProject?.order?.clientId)
        || Number(row?.order?.clientId)
        || Number(row?.clientId)
        || null;
}

function normalizeExpeditionPurchaseRow(row) {
    if (!row) return row;
    const order = row.order || row.orderProject?.order || null;
    return { ...row, order, orderId: getExpeditionPurchaseOrderId({ ...row, order }) };
}

function isExpeditionPurchaseEmbedRetryError(message = '') {
    return /isSystem|relationship|embed|schema cache|requestObservation|description/i.test(message);
}

async function fetchExpeditionPurchaseRowById(id) {
    const key = Number(id);
    if (!key) return { row: null, error: null };
    let lastError = null;
    for (const select of EXPEDITION_PURCHASE_SELECTS) {
        const result = await supabaseClient
            .from('Purchase')
            .select(select)
            .eq('id', key)
            .maybeSingle();
        if (!result.error) {
            return { row: normalizeExpeditionPurchaseRow(result.data), error: null };
        }
        lastError = result.error;
        if (!isExpeditionPurchaseEmbedRetryError(result.error.message || '')) break;
    }
    return { row: null, error: lastError };
}

function applyExpeditionPurchaseSearchFilter(query, q) {
    if (!q) return query;
    if (/^\d+$/.test(q)) return query.eq('id', Number(q));
    const pattern = `%${escapeExpeditionIlikePattern(q)}%`;
    return query.or(`requestObservation.ilike.${pattern},note.ilike.${pattern},purchaseType.ilike.${pattern}`);
}

async function searchExpeditionPurchaseEntities(q, max) {
    let data = [];
    let lastError = null;
    for (const select of EXPEDITION_PURCHASE_SELECTS) {
        let req = supabaseClient
            .from('Purchase')
            .select(select)
            .order('id', { ascending: false })
            .limit(max * 2);
        req = applyExpeditionPurchaseSearchFilter(req, q);
        const result = await req;
        if (!result.error) {
            data = (result.data || []).map(normalizeExpeditionPurchaseRow);
            break;
        }
        lastError = result.error;
        if (!isExpeditionPurchaseEmbedRetryError(result.error.message || '')) {
            throw result.error;
        }
    }
    if (lastError && !data.length) throw lastError;
    return data
        .filter(row => !isExpeditionPurchaseSearchExcluded(row))
        .slice(0, max);
}

function expeditionVistoriaPurchaseRowMatchesQuery(row, queryText) {
    const q = String(queryText || '').trim();
    if (!q) return true;
    if (/^\d+$/.test(q)) {
        const num = Number(q);
        return num === Number(row?.id)
            || num === Number(row?.purchaseId)
            || num === Number(row?.externalAssemblyInspectionId);
    }
    const haystack = [
        row?.order?.client?.name,
        row?.order?.orderCode,
        row?.expeditionProjectLabel,
        getExpeditionOrderProjectLabel(row),
        row?.requestObservation,
        row?.note,
        row?.purchaseType,
        row?.purchaseStatus,
        row?.status
    ].join(' ').toLowerCase();
    return haystack.includes(q.toLowerCase());
}

async function enrichExpeditionVistoriaPurchaseRows(purchases = []) {
    const normalized = (purchases || []).map(normalizeExpeditionPurchaseRow);
    const inspectionIds = [...new Set(
        normalized.map(row => Number(row.externalAssemblyInspectionId)).filter(Boolean)
    )];
    if (!inspectionIds.length) return [];

    const { data: inspections, error } = await supabaseClient
        .from('ExternalAssemblyInspection')
        .select('id, status, orderId, observation')
        .in('id', inspectionIds);

    if (error) throw error;

    const enrichedInspections = await enrichExternalAssemblyInspectionRowsForExpedition(inspections || []);
    const inspectionById = new Map(enrichedInspections.map(row => [Number(row.id), row]));

    return normalized
        .filter(purchase => inspectionById.has(Number(purchase.externalAssemblyInspectionId)))
        .map(purchase => {
            const inspection = inspectionById.get(Number(purchase.externalAssemblyInspectionId));
            return {
                ...inspection,
                order: inspection?.order || purchase.order,
                orderProject: purchase.orderProject || inspection?.orderProject,
                id: Number(purchase.id),
                purchaseId: Number(purchase.id),
                externalAssemblyInspectionId: Number(purchase.externalAssemblyInspectionId),
                purchaseStatus: purchase.status,
                purchaseType: purchase.purchaseType,
                requestObservation: purchase.requestObservation,
                note: purchase.note,
                purchaseReason: purchase.purchaseReason
            };
        });
}

async function searchExpeditionVistoriaPurchaseEntities(queryText, limit = 25) {
    const q = String(queryText || '').trim();
    const max = Math.min(Math.max(limit, 5), 50);
    const fetchLimit = max * 4;
    let purchases = [];
    let lastError = null;

    for (const select of EXPEDITION_PURCHASE_SELECTS) {
        let req = supabaseClient
            .from('Purchase')
            .select(select)
            .not('externalAssemblyInspectionId', 'is', null)
            .order('id', { ascending: false })
            .limit(fetchLimit);

        if (q && /^\d+$/.test(q)) {
            const num = Number(q);
            req = req.or(`id.eq.${num},externalAssemblyInspectionId.eq.${num}`);
        } else if (q) {
            req = applyExpeditionPurchaseSearchFilter(req, q);
        }

        const result = await req;
        if (!result.error) {
            purchases = result.data || [];
            break;
        }
        lastError = result.error;
        if (!isExpeditionPurchaseEmbedRetryError(result.error.message || '')) {
            throw result.error;
        }
    }

    if (lastError && !purchases.length) throw lastError;

    let rows = await enrichExpeditionVistoriaPurchaseRows(purchases);
    if (q && !/^\d+$/.test(q)) {
        rows = rows.filter(row => expeditionVistoriaPurchaseRowMatchesQuery(row, q));
    }

    return rows.slice(0, max);
}

async function enrichExternalAssemblyInspectionRowsWithProjects(rows = []) {
    if (!rows.length) return rows;

    const inspectionIds = rows.map(row => Number(row.id)).filter(Boolean);
    if (!inspectionIds.length) return rows;

    const { data: links, error } = await supabaseClient
        .from('ExternalAssemblyInspectionProject')
        .select('inspectionId, orderProject:OrderProject(name, projectCode)')
        .in('inspectionId', inspectionIds);

    if (error) {
        console.warn('enrichExternalAssemblyInspectionRowsWithProjects:', error);
        return rows;
    }

    const labelsByInspectionId = new Map();
    (links || []).forEach(link => {
        const inspectionId = Number(link.inspectionId);
        const project = link?.orderProject;
        if (!inspectionId || !project) return;
        const label = String(project.name || project.projectCode || '').trim();
        if (!label) return;
        const list = labelsByInspectionId.get(inspectionId) || [];
        if (!list.includes(label)) list.push(label);
        labelsByInspectionId.set(inspectionId, list);
    });

    return rows.map(row => {
        const inspectionId = Number(row.id);
        const labels = labelsByInspectionId.get(inspectionId) || [];
        return {
            ...row,
            expeditionProjectLabel: labels.join(', ')
        };
    });
}

async function enrichExternalAssemblyInspectionRowsWithSequence(rows = []) {
    if (!rows.length) return rows;

    const inspectionIds = rows.map(row => Number(row.id)).filter(Boolean);
    if (!inspectionIds.length) return rows;

    const { data: rowLinks, error: rowLinksError } = await supabaseClient
        .from('ExternalAssemblyInspectionProject')
        .select('inspectionId, orderProjectId')
        .in('inspectionId', inspectionIds);

    if (rowLinksError) {
        console.warn('enrichExternalAssemblyInspectionRowsWithSequence:', rowLinksError);
        return rows;
    }

    const primaryProjectByInspectionId = new Map();
    (rowLinks || []).forEach(link => {
        const inspectionId = Number(link.inspectionId);
        const orderProjectId = Number(link.orderProjectId);
        if (!inspectionId || !orderProjectId) return;
        if (!primaryProjectByInspectionId.has(inspectionId)) {
            primaryProjectByInspectionId.set(inspectionId, orderProjectId);
        }
    });

    const orderProjectIds = [...new Set([...primaryProjectByInspectionId.values()])];
    if (!orderProjectIds.length) return rows;

    const { data: projectLinks, error: projectLinksError } = await supabaseClient
        .from('ExternalAssemblyInspectionProject')
        .select('inspectionId, orderProjectId, inspection:ExternalAssemblyInspection(id, createdAt)')
        .in('orderProjectId', orderProjectIds);

    if (projectLinksError) {
        console.warn('enrichExternalAssemblyInspectionRowsWithSequence:', projectLinksError);
        return rows;
    }

    const inspectionsByProjectId = new Map();
    (projectLinks || []).forEach(link => {
        const orderProjectId = Number(link.orderProjectId);
        const inspectionId = Number(link.inspectionId);
        const createdAt = link?.inspection?.createdAt || '';
        if (!orderProjectId || !inspectionId) return;
        const list = inspectionsByProjectId.get(orderProjectId) || [];
        const existing = list.find(item => item.inspectionId === inspectionId);
        if (!existing) {
            list.push({ inspectionId, createdAt });
        }
        inspectionsByProjectId.set(orderProjectId, list);
    });

    const sequenceByProjectInspection = new Map();
    inspectionsByProjectId.forEach((list, orderProjectId) => {
        list.sort((a, b) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (ta !== tb) return ta - tb;
            return a.inspectionId - b.inspectionId;
        });
        list.forEach((item, index) => {
            sequenceByProjectInspection.set(`${orderProjectId}:${item.inspectionId}`, index + 1);
        });
    });

    return rows.map(row => {
        const inspectionId = Number(row.id);
        const orderProjectId = primaryProjectByInspectionId.get(inspectionId);
        const sequence = orderProjectId
            ? sequenceByProjectInspection.get(`${orderProjectId}:${inspectionId}`)
            : null;
        return {
            ...row,
            expeditionInspectionSequence: sequence ?? null
        };
    });
}

async function enrichExternalAssemblyInspectionRowsForExpedition(rows = []) {
    const withOrders = await enrichExternalAssemblyInspectionRowsWithOrders(rows);
    const withProjects = await enrichExternalAssemblyInspectionRowsWithProjects(withOrders);
    return enrichExternalAssemblyInspectionRowsWithSequence(withProjects);
}

async function resolveExpeditionEntityContext(entityType, entityId) {
    const key = Number(entityId);
    if (!entityType || !key) {
        return { ok: false, message: 'Selecione um item válido.' };
    }

    if (entityType === 'Assistance') {
        const result = await supabaseClient
            .from('AssistanceRequest')
            .select('id, description, status, addrId, clientId, orderId, scheduledAt, client:Client(name), order:salesOrders(orderCode), address:addr(id, nickname, street, number, complement, neighborhood, city, state, postalCode, isPrimary)')
            .eq('id', key)
            .maybeSingle();

        if (result.error) return { ok: false, message: result.error.message };
        const row = result.data;
        if (!row) return { ok: false, message: 'Assistência não encontrada.' };

        let addr = row.address || (row.addrId ? await fetchAddrRecordById(row.addrId) : null);
        if (!addr && row.orderId) {
            const orderCtx = await resolveSalesOrderAddress(row.orderId);
            addr = orderCtx.addr;
        }
        if (!addr) return { ok: false, message: 'Assistência sem endereço cadastrado.' };

        const label = formatExpeditionEntitySearchRowLabel(
            { ...row, scheduledAt: row.scheduledAt },
            'Assistance'
        );

        return {
            ok: true,
            entityType,
            entityId: key,
            label,
            addr: buildAddrSnapshotFromRecord(addr),
            meta: row
        };
    }

    if (entityType === 'ExternalAssemblyInspection') {
        const result = await supabaseClient
            .from('ExternalAssemblyInspection')
            .select('id, status, orderId, observation')
            .eq('id', key)
            .maybeSingle();

        if (result.error) return { ok: false, message: result.error.message };
        const row = result.data;
        if (!row) return { ok: false, message: 'Vistoria não encontrada.' };
        const orderId = Number(row.orderId)
            || await resolveExternalAssemblyInspectionOrderId(key, row);
        if (!orderId) {
            return { ok: false, message: 'Vistoria sem pedido associado.' };
        }

        const orderCtx = await resolveSalesOrderAddress(orderId);
        if (!orderCtx.addr) {
            return { ok: false, message: orderCtx.error || 'Pedido da vistoria sem endereço cadastrado.' };
        }

        const order = orderCtx.order || {};
        const enriched = await enrichExternalAssemblyInspectionRowsForExpedition([{ ...row, orderId }]);
        const displayRow = {
            ...(enriched[0] || row),
            order: enriched[0]?.order || order
        };
        const label = formatExpeditionEntitySearchRowLabel(displayRow, 'ExternalAssemblyInspection');

        return {
            ok: true,
            entityType,
            entityId: key,
            label,
            addr: buildAddrSnapshotFromRecord(orderCtx.addr),
            meta: row
        };
    }

    if (entityType === 'PartRequest') {
        const result = await supabaseClient
            .from('PartRequest')
            .select('id, pieceName, status, clientId, orderId, orderProjectId, client:Client(name), order:salesOrders(id, orderCode, addrId), orderProject:OrderProject(name, projectCode)')
            .eq('id', key)
            .maybeSingle();

        if (result.error) return { ok: false, message: result.error.message };
        const row = result.data;
        if (!row) return { ok: false, message: 'Requisição de peça não encontrada.' };

        let addr = null;
        if (row.orderId) {
            const orderCtx = await resolveSalesOrderAddress(row.orderId);
            addr = orderCtx.addr;
        }
        if (!addr && row.clientId) {
            addr = await resolveClientPrimaryAddress(row.clientId);
        }
        if (!addr) return { ok: false, message: 'Requisição de peça sem endereço associado.' };

        const label = formatExpeditionEntitySearchRowLabel(row, 'PartRequest');

        return {
            ok: true,
            entityType,
            entityId: key,
            label,
            addr: buildAddrSnapshotFromRecord(addr),
            meta: row
        };
    }

    if (entityType === 'Purchase') {
        const { row: purchaseRow, error: purchaseError } = await fetchExpeditionPurchaseRowById(key);
        if (!purchaseRow && purchaseError) return { ok: false, message: purchaseError.message };
        if (!purchaseRow) return { ok: false, message: 'Requisição de compra não encontrada.' };
        const row = purchaseRow;

        let addr = null;
        if (row.assistanceRequestId) {
            const assistanceCtx = await resolveExpeditionEntityContext('Assistance', row.assistanceRequestId);
            if (assistanceCtx.ok) addr = assistanceCtx.addr;
        }
        if (!addr && row.externalAssemblyInspectionId) {
            const eaiCtx = await resolveExpeditionEntityContext('ExternalAssemblyInspection', row.externalAssemblyInspectionId);
            if (eaiCtx.ok) addr = eaiCtx.addr;
        }
        const orderId = getExpeditionPurchaseOrderId(row);
        if (!addr && orderId) {
            const orderCtx = await resolveSalesOrderAddress(orderId);
            addr = orderCtx.addr;
        }
        const clientId = getExpeditionPurchaseClientId(row);
        if (!addr && clientId) {
            addr = await resolveClientPrimaryAddress(clientId);
        }
        if (!addr) return { ok: false, message: 'Compra sem endereço associado.' };

        if (isExpeditionPurchaseSearchExcluded(row)) {
            return { ok: false, message: 'Requisição de compra de sistema não pode ser usada na expedição.' };
        }
        let label = formatExpeditionEntitySearchRowLabel(row, 'Purchase');
        if (Number(row.externalAssemblyInspectionId)) {
            const [vistoriaRow] = await enrichExpeditionVistoriaPurchaseRows([row]);
            if (vistoriaRow) {
                label = formatExpeditionEntitySearchRowLabel(vistoriaRow, 'ExternalAssemblyInspection');
            }
        }

        return {
            ok: true,
            entityType,
            entityId: key,
            label,
            addr: buildAddrSnapshotFromRecord(addr),
            meta: row
        };
    }

    return { ok: false, message: 'Tipo de item inválido.' };
}

async function enrichExternalAssemblyInspectionRowsWithOrders(rows = []) {
    const withOrderIds = await backfillExternalAssemblyInspectionOrderIds(rows);
    const orderIds = [...new Set(withOrderIds.map(row => Number(row.orderId)).filter(Boolean))];
    if (!orderIds.length) return [];

    const orderSelects = [
        'id, orderCode, addrId, clientId, client:Client(name), address:addr(id, street, city)',
        'id, orderCode, addrId, clientId, client:Client(name)',
        'id, orderCode, clientId'
    ];

    let orders = [];
    let lastError = null;

    for (const select of orderSelects) {
        const result = await supabaseClient
            .from('salesOrders')
            .select(select)
            .in('id', orderIds);

        if (!result.error) {
            orders = result.data || [];
            break;
        }
        lastError = result.error;
        if (!/addrId|relationship|embed|schema cache|column/i.test(result.error.message || '')) {
            throw result.error;
        }
    }

    if (!orders.length && lastError) {
        console.warn('enrichExternalAssemblyInspectionRowsWithOrders:', lastError);
    }

    const ordersById = new Map(orders.map(order => [Number(order.id), order]));

    return withOrderIds.map(row => {
        const orderId = Number(row.orderId);
        const order = ordersById.get(orderId);
        return {
            ...row,
            orderId,
            order: order || { id: orderId }
        };
    });
}

async function searchExpeditionEntities(entityType, queryText, limit = 25) {
    const q = String(queryText || '').trim();
    const max = Math.min(Math.max(limit, 5), 50);

    if (entityType === 'Assistance') {
        let req = supabaseClient
            .from('AssistanceRequest')
            .select('id, description, status, addrId, scheduledAt, client:Client(name), order:salesOrders(orderCode), address:addr(id)')
            .order('id', { ascending: false })
            .limit(max);
        if (q) {
            if (/^\d+$/.test(q)) req = req.eq('id', Number(q));
            else req = req.or(`description.ilike.%${q}%,status.ilike.%${q}%`);
        }
        const { data, error } = await req;
        if (error) throw error;
        return (data || []).filter(row => row.address?.id || row.addrId);
    }

    if (entityType === 'ExternalAssemblyInspection') {
        return searchExpeditionVistoriaPurchaseEntities(q, max);
    }

    if (entityType === 'PartRequest') {
        let req = supabaseClient
            .from('PartRequest')
            .select('id, pieceName, status, orderProjectId, client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode)')
            .order('id', { ascending: false })
            .limit(max);
        if (q) {
            if (/^\d+$/.test(q)) req = req.eq('id', Number(q));
            else req = req.ilike('pieceName', `%${q}%`);
        }
        const { data, error } = await req;
        if (error) throw error;
        return data || [];
    }

    if (entityType === 'Purchase') {
        return searchExpeditionPurchaseEntities(q, max);
    }

    return [];
}

function expeditionHistoryOrderCode(row) {
    return String(row?.order?.orderCode || row?.orderProject?.order?.orderCode || '').trim();
}

function expeditionHistoryClientName(row) {
    return String(
        row?.order?.client?.name
        || row?.client?.name
        || getExpeditionPurchaseClientName(row)
        || ''
    ).trim();
}

function expeditionHistoryProjectLabel(row) {
    if (row?.expeditionProjectLabel) {
        return String(row.expeditionProjectLabel).trim();
    }
    const op = row?.orderProject;
    return String(op?.name || op?.projectCode || '').trim();
}

async function buildExpeditionHistoryItemSummary(entityType, entityId) {
    const type = String(entityType || '').trim();
    const id = Number(entityId);
    if (!type || !id) return '—';

    let meta = null;
    try {
        const ctx = await resolveExpeditionEntityContext(type, id);
        if (!ctx.ok) return '—';
        meta = { ...(ctx.meta || {}) };

        if (type === 'Purchase' && Number(meta.externalAssemblyInspectionId)) {
            const enrichedRows = await enrichExpeditionVistoriaPurchaseRows([meta]);
            if (enrichedRows[0]) meta = enrichedRows[0];
        } else if (type === 'ExternalAssemblyInspection') {
            const orderId = Number(meta.orderId)
                || await resolveExternalAssemblyInspectionOrderId(id, meta);
            const enrichedRows = await enrichExternalAssemblyInspectionRowsForExpedition([
                { ...meta, orderId }
            ]);
            if (enrichedRows[0]) meta = enrichedRows[0];
        }
    } catch (error) {
        console.warn('buildExpeditionHistoryItemSummary:', error);
        return '—';
    }

    const parts = [];
    const orderCode = expeditionHistoryOrderCode(meta);
    const client = expeditionHistoryClientName(meta);
    const project = expeditionHistoryProjectLabel(meta);

    if (orderCode) parts.push(orderCode);
    if (client) parts.push(client);
    if (project) parts.push(project);

    const isVistoriaLine = type === 'ExternalAssemblyInspection'
        || (type === 'Purchase' && Number(meta.externalAssemblyInspectionId));

    if (isVistoriaLine) {
        const seq = formatExpeditionInspectionSequenceLabel(meta);
        if (seq) parts.push(`Nº vistoria ${seq}`);
        else if (Number(meta.externalAssemblyInspectionId)) {
            parts.push(`Vistoria #${Number(meta.externalAssemblyInspectionId)}`);
        } else {
            parts.push(`#${id}`);
        }
    } else if (type === 'Purchase') {
        parts.push(`Req. #${id}`);
    } else {
        parts.push(`#${id}`);
    }

    return parts.length ? parts.join(' · ') : '—';
}

window.EXPEDITION_ENTITY_TYPES = EXPEDITION_ENTITY_TYPES;
window.getExpeditionEntityTypeLabel = getExpeditionEntityTypeLabel;
window.formatExpeditionFactoryAddressFromSettings = formatExpeditionFactoryAddressFromSettings;
window.formatExpeditionAddressOneLine = formatExpeditionAddressOneLine;
window.expeditionMapsAddressParam = expeditionMapsAddressParam;
window.resolveExpeditionEntityContext = resolveExpeditionEntityContext;
window.searchExpeditionEntities = searchExpeditionEntities;
window.formatExpeditionEntitySearchRowLabel = formatExpeditionEntitySearchRowLabel;
window.renderExpeditionEntitySearchRowHtml = renderExpeditionEntitySearchRowHtml;
window.renderExpeditionEntitySearchHeaderHtml = renderExpeditionEntitySearchHeaderHtml;
window.buildAddrSnapshotFromRecord = buildAddrSnapshotFromRecord;
window.buildExpeditionHistoryItemSummary = buildExpeditionHistoryItemSummary;