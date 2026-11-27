const EXPEDITION_ENTITY_TYPES = [
    { value: 'OrderProject', label: 'Projeto' },
    { value: 'Pickup', label: 'Coleta' },
    { value: 'Fueling', label: 'Abastecimento' },
    { value: 'Assistance', label: 'Assistência' },
    { value: 'ExternalAssemblyInspection', label: 'Vistoria' },
    { value: 'PartRequest', label: 'Requisição de peça' },
    { value: 'Purchase', label: 'Requisição de compra' }
];

const EXPEDITION_ORDER_PROJECT_SELECT = `
    id, projectCode, name, orderId, statusId,
    projectStatus:OrderProjectStatus(id, name),
    order:salesOrders(id, orderCode, addrId, clientId, client:Client(name))
`;

const EXPEDITION_ORDER_PROJECT_SELECT_NO_STATUS = `
    id, projectCode, name, orderId, statusId,
    order:salesOrders(id, orderCode, addrId, clientId, client:Client(name))
`;

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

function getExpeditionOrderProjectStatusName(row) {
    if (!row) return '';
    if (typeof getOrderProjectStatusName === 'function') {
        const name = getOrderProjectStatusName(row);
        if (name) return name;
    }
    return String(row.projectStatus?.name || '').trim();
}

async function loadExpeditionOrderProjectStatusById() {
    let statuses = [];
    if (typeof loadOrderProjectStatusesCache === 'function') {
        statuses = await loadOrderProjectStatusesCache();
    } else if (typeof getOrderProjectStatuses === 'function') {
        statuses = await getOrderProjectStatuses();
    }
    return Object.fromEntries((statuses || []).map(item => [item.id, item]));
}

async function enrichExpeditionOrderProjectRowsWithStatus(rows = []) {
    if (!rows.length) return rows;
    if (rows.every(row => getExpeditionOrderProjectStatusName(row))) return rows;

    const statusById = await loadExpeditionOrderProjectStatusById();

    return rows.map(row => ({
        ...row,
        projectStatus: row.projectStatus
            || (row.statusId ? statusById[row.statusId] || null : null)
    }));
}

async function enrichExpeditionEntityRowsWithOrderProjectStatus(rows = []) {
    if (!rows.length) return rows;
    const needsEnrich = rows.some(row => row?.orderProject?.statusId && !getExpeditionOrderProjectStatusName(row.orderProject));
    if (!needsEnrich) return rows;

    const statusById = await loadExpeditionOrderProjectStatusById();

    return rows.map(row => {
        const orderProject = row?.orderProject;
        if (!orderProject?.statusId || getExpeditionOrderProjectStatusName(orderProject)) return row;
        return {
            ...row,
            orderProject: {
                ...orderProject,
                projectStatus: orderProject.projectStatus || statusById[orderProject.statusId] || null
            }
        };
    });
}

function formatExpeditionInspectionSequenceLabel(row) {
    const seq = row?.expeditionInspectionSequence;
    if (seq == null || seq === '') return '';
    return String(seq);
}

function getExpeditionPickRequisitionKindLabel(row) {
    return row?.expeditionPickEntityType === 'PartRequest' ? 'Peça' : 'Compra';
}

function getExpeditionPickRequisitionDisplayId(row) {
    if (row?.expeditionPickEntityType === 'PartRequest') {
        return row?.partRequestId ?? row?.expeditionPickEntityId ?? row?.id;
    }
    return row?.purchaseId ?? row?.expeditionPickEntityId ?? row?.id;
}

function isExpeditionLinkedRequisitionPickRow(row) {
    return row?.expeditionPickEntityType === 'PartRequest'
        || row?.expeditionPickEntityType === 'Purchase';
}

function getExpeditionEntitySearchRowFields(row, entityType) {
    if (entityType === 'OrderProject') {
        return [
            { label: 'Pedido', value: row?.order?.orderCode },
            { label: 'Cliente', value: row?.order?.client?.name },
            { label: 'Projeto', value: row?.name || row?.projectCode },
            { label: 'Status', value: getExpeditionOrderProjectStatusName(row) }
        ];
    }
    if (entityType === 'Assistance' && isExpeditionLinkedRequisitionPickRow(row)) {
        const assistanceId = Number(row?.assistanceId ?? row?.assistanceRequestId ?? row?.id);
        return [
            { label: 'Tipo', value: getExpeditionPickRequisitionKindLabel(row) },
            { label: 'Requisição', value: getExpeditionPickRequisitionDisplayId(row) },
            { label: 'Cliente', value: row?.client?.name || row?.order?.client?.name },
            { label: 'Pedido', value: row?.order?.orderCode },
            { label: 'Assistência', value: assistanceId || null },
            { label: 'Agendamento', value: formatExpeditionAssistanceScheduledLabel(row) }
        ];
    }
    if (entityType === 'Assistance') {
        return [
            { label: 'Assistência', value: row?.id },
            { label: 'Cliente', value: row?.client?.name },
            { label: 'Pedido', value: row?.order?.orderCode },
            { label: 'Agendamento', value: formatExpeditionAssistanceScheduledLabel(row) }
        ];
    }
    if (entityType === 'ExternalAssemblyInspection') {
        const projectLabel = row?.expeditionProjectLabel || getExpeditionOrderProjectLabel(row);
        return [
            { label: 'Tipo', value: getExpeditionPickRequisitionKindLabel(row) },
            { label: 'Requisição', value: getExpeditionPickRequisitionDisplayId(row) },
            { label: 'Cliente', value: row?.order?.client?.name || row?.client?.name },
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
            { label: 'Projeto', value: getExpeditionOrderProjectLabel(row) },
            { label: 'Status', value: getExpeditionOrderProjectStatusName(row?.orderProject) }
        ];
    }
    if (entityType === 'Purchase') {
        return [
            { label: 'ID', value: row?.id },
            { label: 'Cliente', value: getExpeditionPurchaseClientName(row) },
            { label: 'Pedido', value: row?.order?.orderCode || row?.orderProject?.order?.orderCode },
            { label: 'Projeto', value: getExpeditionOrderProjectLabel(row) },
            { label: 'Status', value: getExpeditionOrderProjectStatusName(row?.orderProject) }
        ];
    }
    if (entityType === 'Pickup') {
        return [
            { label: 'Pedido', value: row?.order?.orderCode },
            { label: 'Cliente', value: row?.order?.client?.name }
        ];
    }
    if (entityType === 'Fueling') {
        const addrLine = typeof formatExpeditionAddressOneLine === 'function'
            ? formatExpeditionAddressOneLine(row?.address)
            : '';
        return [
            { label: 'Posto', value: row?.name },
            { label: 'Endereço', value: addrLine }
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
    if (entityType === 'ExternalAssemblyInspection') {
        return ['Tipo', 'Requisição', 'Cliente', 'Pedido', 'Projeto', 'Nº vistoria'];
    }
    if (entityType === 'Assistance') {
        return ['Tipo', 'Requisição', 'Cliente', 'Pedido', 'Assistência', 'Agendamento'];
    }
    if (entityType === 'Fueling') {
        return ['Posto', 'Endereço'];
    }
    return getExpeditionEntitySearchRowFields({ id: 0 }, entityType).map(field => field.label);
}

function renderExpeditionEntitySearchFieldValueHtml(field) {
    const text = expeditionEntityFieldValue(field.value);
    if (field.label === 'Tipo' && text !== '—') {
        const kindClass = text === 'Peça'
            ? 'bg-violet-100 text-violet-800'
            : 'bg-emerald-100 text-emerald-800';
        return `<span class="expedition-entity-pick__value expedition-entity-pick__value--kind">
            <span class="inline-flex text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase whitespace-nowrap ${kindClass}">${escapeHtml(text)}</span>
        </span>`;
    }
    if (field.label === 'Status' && text !== '—') {
        const statusClass = typeof getPendenciasProjectStatusBadgeClass === 'function'
            ? getPendenciasProjectStatusBadgeClass(text)
            : (typeof getOrderProjectStatusBadgeClass === 'function'
                ? getOrderProjectStatusBadgeClass(text)
                : 'bg-slate-100 text-slate-600');
        return `<span class="expedition-entity-pick__value expedition-entity-pick__value--status">
            <span class="inline-flex text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase whitespace-nowrap ${statusClass}">${escapeHtml(text)}</span>
        </span>`;
    }
    return `<span class="expedition-entity-pick__value">${escapeHtml(text)}</span>`;
}

function renderExpeditionEntitySearchHeaderHtml(entityType) {
    const labels = getExpeditionEntitySearchColumnLabels(entityType);
    const colCount = Math.max(labels.length, 1);
    return `
        <div class="expedition-entity-pick expedition-entity-pick--header" style="--expedition-entity-pick-cols: ${colCount}">
            ${labels.map(label => `
                <span class="expedition-entity-pick__label">${escapeHtml(label)}</span>
            `).join('')}
        </div>
    `;
}

function renderExpeditionEntitySearchRowHtml(row, entityType) {
    const fields = getExpeditionEntitySearchRowFields(row, entityType);
    const colCount = Math.max(fields.length, 1);
    return `
        <div class="expedition-entity-pick expedition-entity-pick--values" style="--expedition-entity-pick-cols: ${colCount}">
            ${fields.map(field => renderExpeditionEntitySearchFieldValueHtml(field)).join('')}
        </div>
    `;
}

function isExpeditionPurchaseSystemRow(row) {
    const reason = row?.purchaseReason;
    if (reason?.isSystem === true) return true;
    if (typeof isRequisicoesPurchaseAssistenciaReason === 'function' && isRequisicoesPurchaseAssistenciaReason(reason)) {
        return true;
    }
    if (typeof isRequisicoesPurchaseVistoriaReason === 'function' && isRequisicoesPurchaseVistoriaReason(reason)) {
        return true;
    }
    return false;
}

function isExpeditionOriginLinkedPurchaseRow(row) {
    return Number(row?.assistanceRequestId) > 0
        || Number(row?.externalAssemblyInspectionId) > 0;
}

function isExpeditionPurchaseSearchExcluded(row) {
    if (!row) return true;
    if (isExpeditionOriginLinkedPurchaseRow(row)) return true;
    return isExpeditionPurchaseSystemRow(row);
}

function isExpeditionPartRequestOriginLinked(row) {
    if (!row) return false;
    if (typeof isPartRequestOriginLinkedRow === 'function') {
        return isPartRequestOriginLinkedRow(row);
    }
    if (Number(row?.externalAssemblyInspectionId) > 0) return true;
    if (Number(row?.assistanceRequestId) > 0) return true;
    const reason = row?.partRequestReason;
    if (typeof isRequisicoesPurchaseVistoriaReason === 'function' && isRequisicoesPurchaseVistoriaReason(reason)) {
        return true;
    }
    if (typeof isRequisicoesPurchaseAssistenciaReason === 'function' && isRequisicoesPurchaseAssistenciaReason(reason)) {
        return true;
    }
    return false;
}

function isExpeditionPartRequestSearchExcluded(row) {
    if (!row) return true;
    return isExpeditionPartRequestOriginLinked(row);
}

const EXPEDITION_PART_REQUEST_ROUTE_STATUS = 'Shipping';
const EXPEDITION_PART_REQUEST_DELIVERED_STATUS = 'Delivered';

async function tryMarkPartRequestDeliveredAfterExpeditionUnload(stopItemId, partRequestId) {
    const stopKey = Number(stopItemId);
    const requestKey = Number(partRequestId);
    if (!stopKey || !requestKey) return;

    const { data: volumes, error: volumesError } = await supabaseClient
        .from('ExpeditionVolume')
        .select('id, boardedAt, unloadedAt')
        .eq('stopItemId', stopKey);

    if (volumesError) {
        console.warn('tryMarkPartRequestDeliveredAfterExpeditionUnload volumes:', volumesError);
        return;
    }

    const list = volumes || [];
    if (!list.length) return;

    const pendingUnload = list.some(vol => vol.boardedAt && !vol.unloadedAt);
    if (pendingUnload) return;

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseClient
        .from('PartRequest')
        .update({
            status: EXPEDITION_PART_REQUEST_DELIVERED_STATUS,
            updatedAt: now,
            updatedById: currentUser?.id || null
        })
        .eq('id', requestKey)
        .eq('status', EXPEDITION_PART_REQUEST_ROUTE_STATUS);

    if (updateError) {
        console.warn('tryMarkPartRequestDeliveredAfterExpeditionUnload:', updateError);
    }
}

function isExpeditionPartRequestEligibleForRoute(row) {
    if (!row) return false;
    const status = typeof normalizePartRequestStatus === 'function'
        ? normalizePartRequestStatus(row.status)
        : String(row.status || '').trim();
    return status === EXPEDITION_PART_REQUEST_ROUTE_STATUS;
}

function applyExpeditionPartRequestRouteStatusFilter(query) {
    return query.eq('status', EXPEDITION_PART_REQUEST_ROUTE_STATUS);
}

async function resolveExpeditionVistoriaPartReasonId() {
    if (typeof resolveRequisicoesVistoriaPurchaseReasonId === 'function') {
        return resolveRequisicoesVistoriaPurchaseReasonId();
    }
    return null;
}

async function resolveExpeditionAssistenciaPartReasonId() {
    if (typeof resolveRequisicoesAssistenciaPurchaseReasonId === 'function') {
        return resolveRequisicoesAssistenciaPurchaseReasonId();
    }
    return null;
}

function isExpeditionPurchaseResolveBlocked(row) {
    if (!row) return true;
    if (isExpeditionOriginLinkedPurchaseRow(row)) return false;
    return isExpeditionPurchaseSystemRow(row);
}

function getExpeditionPickTarget(row, comboboxEntityType) {
    if (row?.expeditionPickEntityType && row?.expeditionPickEntityId != null) {
        return {
            entityType: String(row.expeditionPickEntityType),
            entityId: Number(row.expeditionPickEntityId)
        };
    }
    if (comboboxEntityType === 'ExternalAssemblyInspection') {
        return {
            entityType: 'Purchase',
            entityId: Number(row?.purchaseId || row?.id)
        };
    }
    return {
        entityType: String(comboboxEntityType || ''),
        entityId: Number(row?.id)
    };
}

function getExpeditionPurchaseTypeDisplayLabel(row) {
    if (!row) return '—';
    if (typeof formatRequisicoesImplementationPurchaseItemLabel === 'function') {
        const label = formatRequisicoesImplementationPurchaseItemLabel(row);
        if (label && label !== '—') return label;
    }
    if (typeof formatCompraTipoLabel === 'function') {
        const label = formatCompraTipoLabel(row.purchaseType, row.thirdPartySubtype?.name);
        if (label) return label;
    }
    return String(row.purchaseType || '—').trim() || '—';
}

function formatExpeditionEntityStatusDisplayLabel(entityType, row) {
    if (!row) return '—';

    if (entityType === 'OrderProject') {
        return typeof getExpeditionOrderProjectStatusName === 'function'
            ? (getExpeditionOrderProjectStatusName(row) || '—')
            : '—';
    }

    if (entityType === 'Assistance') {
        return typeof getAssistanceStatusLabel === 'function'
            ? getAssistanceStatusLabel(row.status)
            : (row.status || '—');
    }

    if (entityType === 'PartRequest') {
        return typeof getPartRequestStatusLabel === 'function'
            ? getPartRequestStatusLabel(row.status)
            : (row.status || '—');
    }

    if (entityType === 'Purchase' || entityType === 'ExternalAssemblyInspection') {
        const purchaseStatus = row.purchaseStatus ?? row.status;
        return String(purchaseStatus || '—').trim() || '—';
    }

    if (row?.orderProject && typeof getExpeditionOrderProjectStatusName === 'function') {
        const projectStatus = getExpeditionOrderProjectStatusName(row.orderProject);
        if (projectStatus) return projectStatus;
    }

    return String(row?.status || '—').trim() || '—';
}

const EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED =
    'orderProject:OrderProject(id, name, projectCode, orderId, statusId, projectStatus:OrderProjectStatus(id, name), order:salesOrders(id, orderCode, addrId, clientId, client:Client(name)))';

const EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED_NO_STATUS =
    'orderProject:OrderProject(id, name, projectCode, orderId, statusId, order:salesOrders(id, orderCode, addrId, clientId, client:Client(name)))';

const EXPEDITION_PURCHASE_SELECTS = [
    `id, trackingCode, status, orderProjectId, assistanceRequestId, externalAssemblyInspectionId, purchaseReasonId, requestObservation, purchaseType, ${EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED}, purchaseReason:PurchaseReason(name, isSystem)`,
    `id, trackingCode, status, orderProjectId, assistanceRequestId, externalAssemblyInspectionId, purchaseReasonId, requestObservation, purchaseType, ${EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED}, purchaseReason:PurchaseReason(name)`,
    `id, trackingCode, status, orderProjectId, assistanceRequestId, externalAssemblyInspectionId, purchaseReasonId, note, purchaseType, ${EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED}, purchaseReason:PurchaseReason(name)`,
    `id, trackingCode, status, orderProjectId, assistanceRequestId, externalAssemblyInspectionId, purchaseReasonId, requestObservation, purchaseType, ${EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED_NO_STATUS}, purchaseReason:PurchaseReason(name, isSystem)`,
    `id, trackingCode, status, orderProjectId, assistanceRequestId, externalAssemblyInspectionId, purchaseReasonId, requestObservation, purchaseType, ${EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED_NO_STATUS}, purchaseReason:PurchaseReason(name)`,
    `id, trackingCode, status, orderProjectId, assistanceRequestId, externalAssemblyInspectionId, purchaseReasonId, note, purchaseType, ${EXPEDITION_PURCHASE_ORDER_PROJECT_EMBED_NO_STATUS}, purchaseReason:PurchaseReason(name)`
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
    return /isSystem|relationship|embed|schema cache|requestObservation|description|projectStatus|OrderProjectStatus/i.test(message);
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
    const rows = data
        .filter(row => !isExpeditionPurchaseSearchExcluded(row))
        .slice(0, max);
    return enrichExpeditionEntityRowsWithOrderProjectStatus(rows);
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
                purchaseReason: purchase.purchaseReason,
                expeditionPickEntityType: 'Purchase',
                expeditionPickEntityId: Number(purchase.id)
            };
        });
}

function isExpeditionVistoriaPartRequestRow(row, vistoriaReasonId = null) {
    if (!row) return false;
    if (Number(row.externalAssemblyInspectionId) > 0) return true;
    if (vistoriaReasonId && Number(row.partRequestReasonId) === Number(vistoriaReasonId)) return true;
    return typeof isRequisicoesPurchaseVistoriaReason === 'function'
        && isRequisicoesPurchaseVistoriaReason(row.partRequestReason);
}

async function enrichExpeditionVistoriaPartRequestRows(partRequests = [], vistoriaReasonId = null) {
    const normalized = (partRequests || []).filter(row => (
        isExpeditionVistoriaPartRequestRow(row, vistoriaReasonId)
        && isExpeditionPartRequestEligibleForRoute(row)
    ));
    if (!normalized.length) return [];

    const inspectionIds = [...new Set(
        normalized.map(row => Number(row.externalAssemblyInspectionId)).filter(Boolean)
    )];
    let inspectionById = new Map();
    if (inspectionIds.length) {
        const { data: inspections, error } = await supabaseClient
            .from('ExternalAssemblyInspection')
            .select('id, status, orderId, observation')
            .in('id', inspectionIds);

        if (error) throw error;

        const enrichedInspections = await enrichExternalAssemblyInspectionRowsForExpedition(inspections || []);
        inspectionById = new Map(enrichedInspections.map(row => [Number(row.id), row]));
    }

    return normalized.map(row => {
            const partRequestId = Number(row.id);
            const inspectionId = Number(row.externalAssemblyInspectionId);
            const inspection = inspectionId > 0 ? inspectionById.get(inspectionId) : null;
            return {
                ...row,
                id: partRequestId,
                partRequestId,
                order: row.order || inspection?.order,
                orderProject: row.orderProject || inspection?.orderProject,
                expeditionProjectLabel: row.expeditionProjectLabel
                    || inspection?.expeditionProjectLabel
                    || getExpeditionOrderProjectLabel(row),
                expeditionInspectionSequence: inspection?.expeditionInspectionSequence ?? null,
                externalAssemblyInspectionId: inspectionId > 0 ? inspectionId : null,
                expeditionPickEntityType: 'PartRequest',
                expeditionPickEntityId: partRequestId
            };
        });
}

function expeditionVistoriaPartRequestRowMatchesQuery(row, queryText) {
    const q = String(queryText || '').trim();
    if (!q) return true;
    if (/^\d+$/.test(q)) {
        const num = Number(q);
        return num === Number(row?.partRequestId ?? row?.id)
            || num === Number(row?.externalAssemblyInspectionId)
            || num === Number(row?.expeditionInspectionSequence);
    }
    const haystack = [
        row?.pieceName,
        row?.order?.orderCode,
        row?.client?.name,
        row?.expeditionProjectLabel,
        getExpeditionOrderProjectLabel(row),
        row?.status
    ].join(' ').toLowerCase();
    return haystack.includes(q.toLowerCase());
}

function mergeExpeditionPartRequestRowsById(primary = [], secondary = []) {
    const byId = new Map();
    [...primary, ...secondary].forEach(row => {
        const key = Number(row?.id);
        if (!key) return;
        if (!byId.has(key)) byId.set(key, row);
    });
    return [...byId.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

async function fetchExpeditionVistoriaPartRequestCandidates(q, fetchLimit, vistoriaReasonId) {
    const partRequestSelects = [
        'id, pieceName, status, trackingCode, externalAssemblyInspectionId, partRequestReasonId, assistanceRequestId, orderProjectId, partRequestReason:PurchaseReason(name, isSystem), client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode, statusId, projectStatus:OrderProjectStatus(id, name))',
        'id, pieceName, status, trackingCode, externalAssemblyInspectionId, partRequestReasonId, assistanceRequestId, orderProjectId, partRequestReason:PurchaseReason(name, isSystem), client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode, statusId)',
        'id, pieceName, status, trackingCode, externalAssemblyInspectionId, partRequestReasonId, orderProjectId, client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode, statusId)'
    ];

    const applyVistoriaOriginFilter = (req, select) => {
        const hasInspectionCol = select.includes('externalAssemblyInspectionId');
        const hasReasonCol = select.includes('partRequestReasonId');
        if (vistoriaReasonId && hasInspectionCol && hasReasonCol) {
            return req.or(`externalAssemblyInspectionId.not.is.null,partRequestReasonId.eq.${vistoriaReasonId}`);
        }
        if (hasInspectionCol) {
            return req.not('externalAssemblyInspectionId', 'is', null);
        }
        if (vistoriaReasonId && hasReasonCol) {
            return req.eq('partRequestReasonId', vistoriaReasonId);
        }
        return req;
    };

    for (const select of partRequestSelects) {
        const byInspection = [];
        let req = supabaseClient
            .from('PartRequest')
            .select(select)
            .order('id', { ascending: false })
            .limit(fetchLimit);
        req = applyExpeditionPartRequestRouteStatusFilter(req);
        req = applyVistoriaOriginFilter(req, select);
        const result = await req;
        if (!result.error) {
            return result.data || [];
        }

        if (!/projectStatus|OrderProjectStatus|partRequestReason|PurchaseReason|partRequestReasonId|externalAssemblyInspectionId/i.test(result.error.message || '')) {
            throw result.error;
        }

        if (select.includes('externalAssemblyInspectionId')) {
            const inspectionReq = applyExpeditionPartRequestRouteStatusFilter(
                supabaseClient
                    .from('PartRequest')
                    .select(select)
                    .not('externalAssemblyInspectionId', 'is', null)
                    .order('id', { ascending: false })
                    .limit(fetchLimit)
            );
            const inspectionResult = await inspectionReq;
            if (!inspectionResult.error) {
                byInspection.push(...(inspectionResult.data || []));
            }
        }
        if (vistoriaReasonId && select.includes('partRequestReasonId')) {
            const reasonReq = applyExpeditionPartRequestRouteStatusFilter(
                supabaseClient
                    .from('PartRequest')
                    .select(select)
                    .eq('partRequestReasonId', vistoriaReasonId)
                    .order('id', { ascending: false })
                    .limit(fetchLimit)
            );
            const reasonResult = await reasonReq;
            if (!reasonResult.error) {
                return mergeExpeditionPartRequestRowsById(byInspection, reasonResult.data || []);
            }
        }
        if (byInspection.length) {
            return mergeExpeditionPartRequestRowsById(byInspection, []);
        }
    }

    let req = applyExpeditionPartRequestRouteStatusFilter(
        supabaseClient
            .from('PartRequest')
            .select('id, pieceName, status, trackingCode, externalAssemblyInspectionId, orderProjectId, client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode)')
            .not('externalAssemblyInspectionId', 'is', null)
            .order('id', { ascending: false })
            .limit(fetchLimit)
    );

    const fallback = await req;
    if (fallback.error) throw fallback.error;
    return fallback.data || [];
}

async function searchExpeditionVistoriaPartRequestEntities(queryText, limit = 25) {
    const q = String(queryText || '').trim();
    const max = Math.min(Math.max(limit, 5), 50);
    const fetchLimit = max * 4;
    const vistoriaReasonId = await resolveExpeditionVistoriaPartReasonId().catch(() => null);
    let data = [];

    try {
        data = await fetchExpeditionVistoriaPartRequestCandidates(q, fetchLimit, vistoriaReasonId);
    } catch (error) {
        if (!/partRequestReasonId|externalAssemblyInspectionId|schema cache|does not exist/i.test(error?.message || '')) {
            throw error;
        }
        data = [];
    }

    let rows = await enrichExpeditionVistoriaPartRequestRows(data, vistoriaReasonId);
    rows = await enrichExpeditionEntityRowsWithOrderProjectStatus(rows);

    if (q) {
        rows = rows.filter(row => expeditionVistoriaPartRequestRowMatchesQuery(row, q));
    }

    return rows.slice(0, max);
}

function interleaveExpeditionVistoriaEntityRows(partRows = [], purchaseRows = [], limit = 25) {
    const max = Math.max(limit, 1);
    const merged = [];
    const parts = partRows || [];
    const purchases = purchaseRows || [];
    const rounds = Math.max(parts.length, purchases.length);
    for (let i = 0; i < rounds && merged.length < max; i++) {
        if (i < parts.length && merged.length < max) merged.push(parts[i]);
        if (i < purchases.length && merged.length < max) merged.push(purchases[i]);
    }
    return merged;
}

async function searchExpeditionVistoriaLinkedEntities(queryText, limit = 25, options = {}) {
    const max = Math.min(Math.max(limit, 5), 50);
    const [partRows, purchaseRows] = await Promise.all([
        searchExpeditionVistoriaPartRequestEntities(queryText, max).catch(error => {
            if (/externalAssemblyInspectionId|partRequestReasonId|schema cache|does not exist/i.test(error?.message || '')) {
                return [];
            }
            throw error;
        }),
        searchExpeditionVistoriaPurchaseEntities(queryText, max, options)
    ]);

    return interleaveExpeditionVistoriaEntityRows(partRows, purchaseRows, max);
}

function isExpeditionAssistenciaPartRequestRow(row, assistenciaReasonId = null) {
    if (!row) return false;
    if (Number(row.assistanceRequestId) > 0) return true;
    if (assistenciaReasonId && Number(row.partRequestReasonId) === Number(assistenciaReasonId)) return true;
    return typeof isRequisicoesPurchaseAssistenciaReason === 'function'
        && isRequisicoesPurchaseAssistenciaReason(row.partRequestReason);
}

async function enrichExpeditionAssistenciaPartRequestRows(partRequests = [], assistenciaReasonId = null) {
    const normalized = (partRequests || []).filter(row => (
        isExpeditionAssistenciaPartRequestRow(row, assistenciaReasonId)
        && isExpeditionPartRequestEligibleForRoute(row)
    ));
    if (!normalized.length) return [];

    const assistanceIds = [...new Set(
        normalized.map(row => Number(row.assistanceRequestId)).filter(Boolean)
    )];
    let assistanceById = new Map();
    if (assistanceIds.length) {
        const { data: assistances, error } = await supabaseClient
            .from('AssistanceRequest')
            .select('id, description, status, addrId, scheduledAt, clientId, orderId, client:Client(name), order:salesOrders(orderCode, clientId, client:Client(name)), address:addr(id)')
            .in('id', assistanceIds);
        if (error) throw error;
        assistanceById = new Map((assistances || []).map(row => [Number(row.id), row]));
    }

    return normalized
        .map(row => {
            const partRequestId = Number(row.id);
            const assistanceId = Number(row.assistanceRequestId);
            const assistance = assistanceId > 0 ? assistanceById.get(assistanceId) : null;
            if (!assistance) return null;
            if (!assistance.address?.id && !assistance.addrId) return null;
            return {
                ...row,
                ...assistance,
                assistanceId,
                assistanceRequestId: assistanceId,
                id: assistanceId,
                partRequestId,
                order: row.order || assistance.order,
                orderProject: row.orderProject,
                expeditionProjectLabel: getExpeditionOrderProjectLabel(row),
                expeditionPickEntityType: 'PartRequest',
                expeditionPickEntityId: partRequestId
            };
        })
        .filter(Boolean);
}

function expeditionAssistenciaPartRequestRowMatchesQuery(row, queryText) {
    const q = String(queryText || '').trim();
    if (!q) return true;
    if (/^\d+$/.test(q)) {
        const num = Number(q);
        return num === Number(row?.partRequestId ?? row?.expeditionPickEntityId)
            || num === Number(row?.assistanceId ?? row?.assistanceRequestId);
    }
    const haystack = [
        row?.pieceName,
        row?.order?.orderCode,
        row?.client?.name,
        row?.description,
        getExpeditionOrderProjectLabel(row),
        row?.status
    ].join(' ').toLowerCase();
    return haystack.includes(q.toLowerCase());
}

async function fetchExpeditionAssistenciaPartRequestCandidates(fetchLimit, assistenciaReasonId) {
    const partRequestSelects = [
        'id, pieceName, status, trackingCode, externalAssemblyInspectionId, partRequestReasonId, assistanceRequestId, orderProjectId, partRequestReason:PurchaseReason(name, isSystem), client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode, statusId, projectStatus:OrderProjectStatus(id, name))',
        'id, pieceName, status, trackingCode, externalAssemblyInspectionId, partRequestReasonId, assistanceRequestId, orderProjectId, partRequestReason:PurchaseReason(name, isSystem), client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode, statusId)',
        'id, pieceName, status, trackingCode, externalAssemblyInspectionId, partRequestReasonId, orderProjectId, client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode, statusId)'
    ];

    const applyAssistenciaOriginFilter = (req, select) => {
        const hasAssistanceCol = select.includes('assistanceRequestId');
        const hasReasonCol = select.includes('partRequestReasonId');
        if (assistenciaReasonId && hasAssistanceCol && hasReasonCol) {
            return req.or(`assistanceRequestId.not.is.null,partRequestReasonId.eq.${assistenciaReasonId}`);
        }
        if (hasAssistanceCol) {
            return req.not('assistanceRequestId', 'is', null);
        }
        if (assistenciaReasonId && hasReasonCol) {
            return req.eq('partRequestReasonId', assistenciaReasonId);
        }
        return req;
    };

    for (const select of partRequestSelects) {
        let req = applyExpeditionPartRequestRouteStatusFilter(
            supabaseClient
                .from('PartRequest')
                .select(select)
                .order('id', { ascending: false })
                .limit(fetchLimit)
        );
        req = applyAssistenciaOriginFilter(req, select);
        const result = await req;
        if (!result.error) return result.data || [];
        if (!/projectStatus|OrderProjectStatus|partRequestReason|PurchaseReason|partRequestReasonId|assistanceRequestId/i.test(result.error.message || '')) {
            throw result.error;
        }
    }

    const fallback = await applyExpeditionPartRequestRouteStatusFilter(
        supabaseClient
            .from('PartRequest')
            .select('id, pieceName, status, trackingCode, assistanceRequestId, orderProjectId, client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode)')
            .not('assistanceRequestId', 'is', null)
            .order('id', { ascending: false })
            .limit(fetchLimit)
    );
    if (fallback.error) throw fallback.error;
    return fallback.data || [];
}

async function searchExpeditionAssistenciaPartRequestEntities(queryText, limit = 25) {
    const q = String(queryText || '').trim();
    const max = Math.min(Math.max(limit, 5), 50);
    const fetchLimit = max * 4;
    const assistenciaReasonId = await resolveExpeditionAssistenciaPartReasonId().catch(() => null);
    let data = [];

    try {
        data = await fetchExpeditionAssistenciaPartRequestCandidates(fetchLimit, assistenciaReasonId);
    } catch (error) {
        if (!/assistanceRequestId|partRequestReasonId|schema cache|does not exist/i.test(error?.message || '')) {
            throw error;
        }
        data = [];
    }

    let rows = await enrichExpeditionAssistenciaPartRequestRows(data, assistenciaReasonId);
    rows = await enrichExpeditionEntityRowsWithOrderProjectStatus(rows);
    if (q) {
        rows = rows.filter(row => expeditionAssistenciaPartRequestRowMatchesQuery(row, q));
    }
    return rows.slice(0, max);
}

function interleaveExpeditionAssistanceEntityRows(partRows = [], purchaseRows = [], limit = 25) {
    return interleaveExpeditionVistoriaEntityRows(partRows, purchaseRows, limit);
}

async function searchExpeditionAssistanceLinkedEntities(queryText, limit = 25, options = {}) {
    const max = Math.min(Math.max(limit, 5), 50);
    const [partRows, purchaseRows] = await Promise.all([
        searchExpeditionAssistenciaPartRequestEntities(queryText, max).catch(error => {
            if (/assistanceRequestId|partRequestReasonId|schema cache|does not exist/i.test(error?.message || '')) {
                return [];
            }
            throw error;
        }),
        searchExpeditionAssistancePurchaseEntities(queryText, max, options)
    ]);
    return interleaveExpeditionAssistanceEntityRows(partRows, purchaseRows, max);
}

async function enrichExpeditionAssistancePurchaseRows(purchases = []) {
    const normalized = (purchases || [])
        .map(normalizeExpeditionPurchaseRow)
        .filter(row => Number(row.assistanceRequestId) > 0);

    const assistanceIds = [...new Set(normalized.map(row => Number(row.assistanceRequestId)).filter(Boolean))];
    if (!assistanceIds.length) return [];

    const { data: assistances, error } = await supabaseClient
        .from('AssistanceRequest')
        .select('id, description, status, addrId, scheduledAt, clientId, orderId, client:Client(name), order:salesOrders(orderCode, clientId, client:Client(name)), address:addr(id)')
        .in('id', assistanceIds);

    if (error) throw error;

    const assistanceById = new Map((assistances || []).map(row => [Number(row.id), row]));

    return normalized.map(purchase => {
        const assistanceId = Number(purchase.assistanceRequestId);
        const assistance = assistanceById.get(assistanceId);
        if (!assistance) return null;
        if (!assistance.address?.id && !assistance.addrId) return null;

        return {
            ...assistance,
            id: assistanceId,
            assistanceId,
            purchaseId: Number(purchase.id),
            purchaseType: purchase.purchaseType,
            purchaseStatus: purchase.status,
            order: assistance.order || purchase.order,
            client: assistance.client || purchase.order?.client,
            expeditionPickEntityType: 'Purchase',
            expeditionPickEntityId: Number(purchase.id)
        };
    }).filter(Boolean);
}

async function searchExpeditionAssistancePurchaseEntities(queryText, limit = 25, options = {}) {
    const q = String(queryText || '').trim();
    const ceiling = Number(options.maxLimit) > 0 ? Number(options.maxLimit) : 50;
    const max = Math.min(Math.max(limit, 5), ceiling);
    const fetchLimit = max * 4;
    let purchases = [];
    let lastError = null;

    for (const select of EXPEDITION_PURCHASE_SELECTS) {
        let req = supabaseClient
            .from('Purchase')
            .select(select)
            .not('assistanceRequestId', 'is', null)
            .order('id', { ascending: false })
            .limit(fetchLimit);

        if (q && /^\d+$/.test(q)) {
            const num = Number(q);
            req = req.or(`id.eq.${num},assistanceRequestId.eq.${num}`);
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

    let rows = await enrichExpeditionAssistancePurchaseRows(purchases);
    if (q && !/^\d+$/.test(q)) {
        const needle = q.toLowerCase();
        rows = rows.filter(row => {
            const haystack = [
                row.description,
                row.status,
                row.order?.orderCode,
                row.client?.name,
                row.purchaseType
            ].join(' ').toLowerCase();
            return haystack.includes(needle);
        });
    }

    return rows.slice(0, max);
}

async function searchExpeditionVistoriaPurchaseEntities(queryText, limit = 25, options = {}) {
    const q = String(queryText || '').trim();
    const ceiling = Number(options.maxLimit) > 0 ? Number(options.maxLimit) : 50;
    const max = Math.min(Math.max(limit, 5), ceiling);
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

    purchases = (purchases || [])
        .map(normalizeExpeditionPurchaseRow)
        .filter(row => Number(row.externalAssemblyInspectionId) > 0);

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

async function searchExpeditionOrderProjectEntities(queryText, limit = 25, options = {}) {
    const q = String(queryText || '').trim();
    const ceiling = Number(options.maxLimit) > 0 ? Number(options.maxLimit) : 50;
    const max = Math.min(Math.max(limit, 5), ceiling);
    const statusName = typeof PENDENCIAS_STATUS_EXPEDICAO !== 'undefined'
        ? PENDENCIAS_STATUS_EXPEDICAO
        : 'Expedição';

    const statusId = typeof getPendenciasStatusIdByName === 'function'
        ? await getPendenciasStatusIdByName(statusName)
        : null;

    if (!statusId) {
        throw new Error(`Status "${statusName}" não encontrado.`);
    }

    const buildQuery = (filterMode = 'full', selectColumns = EXPEDITION_ORDER_PROJECT_SELECT) => {
        let query = supabaseClient
            .from('OrderProject')
            .select(selectColumns)
            .eq('statusId', statusId)
            .order('id', { ascending: false })
            .limit(max * 3);

        if (filterMode === 'full' && typeof applyPendenciasExcludedOrderProjectQueryFilters === 'function') {
            query = applyPendenciasExcludedOrderProjectQueryFilters(query);
        } else if (filterMode === 'legacy') {
            query = query.eq('isComplementary', false).eq('isReplaced', false);
        }

        if (q) {
            if (/^\d+$/.test(q)) {
                query = query.or(`id.eq.${Number(q)},projectCode.ilike.%${escapeExpeditionIlikePattern(q)}%`);
            } else {
                const pattern = `%${escapeExpeditionIlikePattern(q)}%`;
                query = query.or(`name.ilike.${pattern},projectCode.ilike.${pattern}`);
            }
        }

        return query;
    };

    let result = await buildQuery('full');
    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('OrderProjectStatus')) {
        result = await buildQuery('full', EXPEDITION_ORDER_PROJECT_SELECT_NO_STATUS);
    }
    if (result.error?.message?.includes('isComplementary') || result.error?.message?.includes('aggregatorOrderProjectId')) {
        result = await buildQuery('legacy');
    }
    if (result.error) throw result.error;

    let rows = await enrichExpeditionOrderProjectRowsWithStatus((result.data || []).slice());

    if (q && !/^\d+$/.test(q)) {
        const needle = q.toLowerCase();
        rows = rows.filter(row => {
            const haystack = [
                row?.order?.orderCode,
                row?.order?.client?.name,
                row?.name,
                row?.projectCode,
                getExpeditionOrderProjectStatusName(row)
            ].join(' ').toLowerCase();
            return haystack.includes(needle);
        });
    }

    const filtered = [];
    for (const row of rows) {
        const orderId = Number(row?.orderId || row?.order?.id);
        if (!orderId) continue;
        const orderCtx = await resolveSalesOrderAddress(orderId);
        if (!orderCtx.addr) continue;
        filtered.push({ ...row, order: orderCtx.order || row.order });
        if (filtered.length >= max) break;
    }

    return filtered;
}

async function resolveExpeditionPickupContext({ orderCode, pickupCategory, description }) {
    const code = String(orderCode || '').trim();
    const category = String(pickupCategory || '').trim();
    const details = String(description || '').trim();

    if (!code) return { ok: false, message: 'Informe o código do pedido.' };
    if (!category) return { ok: false, message: 'Selecione o tipo de coleta.' };
    if (!details) return { ok: false, message: 'Informe a descrição da coleta.' };

    const allowed = (typeof EXPEDITION_PICKUP_CATEGORIES !== 'undefined' ? EXPEDITION_PICKUP_CATEGORIES : [])
        .map(item => item.value);
    if (allowed.length && !allowed.includes(category)) {
        return { ok: false, message: 'Tipo de coleta inválido.' };
    }

    const orderResult = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, addrId, clientId, client:Client(name)')
        .eq('orderCode', code)
        .maybeSingle();

    if (orderResult.error) return { ok: false, message: orderResult.error.message };
    const order = orderResult.data;
    if (!order) return { ok: false, message: 'Pedido não encontrado.' };

    const orderCtx = await resolveSalesOrderAddress(Number(order.id));
    if (!orderCtx.addr) {
        return { ok: false, message: orderCtx.error || 'Pedido sem endereço cadastrado.' };
    }

    const entityId = typeof allocateExpeditionPickupEntityId === 'function'
        ? allocateExpeditionPickupEntityId()
        : Date.now();

    const metadata = {
        pickupCategory: category,
        description: details,
        orderId: Number(order.id),
        orderCode: String(order.orderCode || code)
    };

    const label = typeof buildExpeditionPickupItemLabel === 'function'
        ? buildExpeditionPickupItemLabel(metadata)
        : `Coleta · ${code}`;

    return {
        ok: true,
        entityType: 'Pickup',
        entityId,
        label,
        addr: orderCtx.addr,
        volumeCount: 0,
        metadata,
        meta: { order, metadata }
    };
}

async function resolveExpeditionEntityContext(entityType, entityId) {
    const key = Number(entityId);
    if (!entityType || !key) {
        return { ok: false, message: 'Selecione um item válido.' };
    }

    if (entityType === 'Fueling') {
        return typeof resolveExpeditionFuelingContextById === 'function'
            ? resolveExpeditionFuelingContextById(key)
            : { ok: false, message: 'Módulo de abastecimento indisponível.' };
    }

    if (entityType === 'OrderProject') {
        const { data: row, error } = await supabaseClient
            .from('OrderProject')
            .select(EXPEDITION_ORDER_PROJECT_SELECT)
            .eq('id', key)
            .maybeSingle();

        if (error) return { ok: false, message: error.message };
        if (!row) return { ok: false, message: 'Projeto não encontrado.' };

        const orderId = Number(row.orderId || row.order?.id);
        const orderCtx = await resolveSalesOrderAddress(orderId);
        if (!orderCtx.addr) {
            return { ok: false, message: orderCtx.error || 'Pedido sem endereço cadastrado.' };
        }

        const label = formatExpeditionEntitySearchRowLabel(
            { ...row, order: orderCtx.order || row.order },
            'OrderProject'
        );

        return {
            ok: true,
            entityType: 'OrderProject',
            entityId: key,
            label,
            addr: orderCtx.addr,
            meta: { ...row, order: orderCtx.order || row.order }
        };
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
        const partRequestSelects = [
            'id, pieceName, status, trackingCode, externalAssemblyInspectionId, clientId, orderId, orderProjectId, client:Client(name), order:salesOrders(id, orderCode, addrId), orderProject:OrderProject(name, projectCode)',
            'id, pieceName, status, trackingCode, clientId, orderId, orderProjectId, client:Client(name), order:salesOrders(id, orderCode, addrId), orderProject:OrderProject(name, projectCode)'
        ];
        let row = null;
        let lastError = null;
        for (const select of partRequestSelects) {
            const result = await supabaseClient
                .from('PartRequest')
                .select(select)
                .eq('id', key)
                .maybeSingle();
            if (!result.error) {
                row = result.data;
                break;
            }
            lastError = result.error;
            if (!/externalAssemblyInspectionId|schema cache/i.test(result.error.message || '')) break;
        }
        if (!row && lastError) return { ok: false, message: lastError.message };
        if (!row) return { ok: false, message: 'Requisição de peça não encontrada.' };
        if (!isExpeditionPartRequestEligibleForRoute(row)) {
            return { ok: false, message: 'Requisição de peça só pode entrar na rota no status Expedição.' };
        }

        let addr = null;
        if (Number(row.externalAssemblyInspectionId) > 0) {
            const eaiCtx = await resolveExpeditionEntityContext(
                'ExternalAssemblyInspection',
                Number(row.externalAssemblyInspectionId)
            );
            if (eaiCtx.ok) addr = eaiCtx.addr;
        }
        if (!addr && row.orderId) {
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

        if (isExpeditionPurchaseResolveBlocked(row)) {
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

const PENDENCIAS_FABRICA_ROTA_PREVIEW_LIMIT_PER_TYPE = 100;

function getExpeditionRouteRoutedEntityType(entityType) {
    return entityType === 'ExternalAssemblyInspection' ? 'Purchase' : entityType;
}

async function filterExpeditionEntitiesAvailableForRoute(entityType, rows = []) {
    const routedEntityType = getExpeditionRouteRoutedEntityType(entityType);
    const routedIds = typeof fetchExpeditionEntityIdsAlreadyRouted === 'function'
        ? await fetchExpeditionEntityIdsAlreadyRouted(routedEntityType, null)
        : [];
    const routedSet = new Set(routedIds.map(id => Number(id)));
    return (rows || []).filter(row => {
        const id = Number(row?.id);
        return id && !routedSet.has(id);
    });
}

async function fetchExpeditionEntitiesForFabricaRotaPreview(limitPerType = PENDENCIAS_FABRICA_ROTA_PREVIEW_LIMIT_PER_TYPE) {
    const types = typeof EXPEDITION_ENTITY_TYPES !== 'undefined' ? EXPEDITION_ENTITY_TYPES : [];
    const items = [];
    const errors = [];

    for (const typeDef of types) {
        const entityType = typeDef.value;
        const entityTypeLabel = typeDef.label;
        try {
            if (entityType === 'Pickup' || entityType === 'Fueling') {
                continue;
            }

            const rawRows = await searchExpeditionEntities(entityType, '', limitPerType, {
                maxLimit: limitPerType
            });
            const availableRows = await filterExpeditionEntitiesAvailableForRoute(entityType, rawRows);
            availableRows.forEach(row => {
                items.push({ entityType, entityTypeLabel, row });
            });
        } catch (error) {
            errors.push({
                entityType,
                message: error?.message || String(error)
            });
        }
    }

    return { items, errors };
}

async function searchExpeditionEntities(entityType, queryText, limit = 25, options = {}) {
    const q = String(queryText || '').trim();
    const ceiling = Number(options.maxLimit) > 0 ? Number(options.maxLimit) : 50;
    const max = Math.min(Math.max(limit, 5), ceiling);

    if (entityType === 'Assistance') {
        return searchExpeditionAssistanceLinkedEntities(q, max, options);
    }

    if (entityType === 'ExternalAssemblyInspection') {
        return searchExpeditionVistoriaLinkedEntities(q, max, options);
    }

    if (entityType === 'PartRequest') {
        const partRequestSelects = [
            'id, pieceName, status, trackingCode, orderProjectId, externalAssemblyInspectionId, assistanceRequestId, partRequestReasonId, partRequestReason:PurchaseReason(name, isSystem), client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode, statusId, projectStatus:OrderProjectStatus(id, name))',
            'id, pieceName, status, trackingCode, orderProjectId, externalAssemblyInspectionId, assistanceRequestId, partRequestReasonId, partRequestReason:PurchaseReason(name, isSystem), client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode, statusId)',
            'id, pieceName, status, trackingCode, orderProjectId, externalAssemblyInspectionId, partRequestReasonId, client:Client(name), order:salesOrders(orderCode, addrId), orderProject:OrderProject(name, projectCode, statusId)'
        ];
        let lastError = null;
        let data = [];
        for (const select of partRequestSelects) {
            let req = applyExpeditionPartRequestRouteStatusFilter(
                supabaseClient
                    .from('PartRequest')
                    .select(select)
                    .order('id', { ascending: false })
                    .limit(max)
            );
            if (q) {
                if (/^\d+$/.test(q)) req = req.eq('id', Number(q));
                else req = req.ilike('pieceName', `%${escapeExpeditionIlikePattern(q)}%`);
            }
            const result = await req;
            if (!result.error) {
                data = result.data || [];
                lastError = null;
                break;
            }
            lastError = result.error;
            if (!/projectStatus|OrderProjectStatus|partRequestReason|PurchaseReason|partRequestReasonId/i.test(result.error.message || '')) break;
        }
        if (lastError) throw lastError;
        const rows = (data || [])
            .filter(row => !isExpeditionPartRequestSearchExcluded(row))
            .filter(isExpeditionPartRequestEligibleForRoute);
        return enrichExpeditionEntityRowsWithOrderProjectStatus(rows);
    }

    if (entityType === 'OrderProject') {
        return searchExpeditionOrderProjectEntities(q, max, options);
    }

    if (entityType === 'Purchase') {
        return searchExpeditionPurchaseEntities(q, max);
    }

    if (entityType === 'Fueling') {
        return typeof searchExpeditionFuelStations === 'function'
            ? searchExpeditionFuelStations(q, max)
            : [];
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

function formatExpeditionPurchaseVolumeTransitLabel(volume) {
    if (!volume) return 'Pendente embarque';
    if (volume.unloadedAt) return 'Desembarcado';
    if (volume.boardedAt) return 'Embarcado';
    return 'Pendente embarque';
}

function formatExpeditionRouteLabelWithId(route) {
    if (!route) return '—';
    const id = Number(route.id);
    const custom = String(route.name ?? '').trim();
    if (custom && Number.isFinite(id) && id > 0) {
        return `#${id} · ${custom}`;
    }
  return typeof formatExpeditionRouteDisplayName === 'function'
        ? formatExpeditionRouteDisplayName(route)
        : (Number.isFinite(id) && id > 0 ? `Rota ${id}` : '—');
}

async function fetchExpeditionRouteSummaryForPurchase(purchaseId, trackingCode = '') {
    const key = Number(purchaseId);
    if (!key) return null;

    const routeSelect = 'id, name, routeDate, status';
    const stopSelect = `id, routeId, route:ExpeditionRoute(${routeSelect})`;

    const { data: stopItem, error: stopError } = await supabaseClient
        .from('ExpeditionRouteStopItem')
        .select(stopSelect)
        .eq('entityType', 'Purchase')
        .eq('entityId', key)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (stopError) {
        const message = String(stopError.message || '');
        if (/schema cache|does not exist|relationship/i.test(message)) return null;
        throw stopError;
    }

    let resolvedStopItem = stopItem?.route ? stopItem : null;

    if (!resolvedStopItem) {
        const code = typeof normalizeScannableTrackingCode === 'function'
            ? normalizeScannableTrackingCode(trackingCode)
            : String(trackingCode || '').trim();
        if (!code) return null;

        const { data: volumeRow, error: volLookupError } = await supabaseClient
            .from('ExpeditionVolume')
            .select(`id, volumeCode, boardedAt, unloadedAt, stopItemId,
                stopItem:ExpeditionRouteStopItem!inner(id, entityType, entityId, routeId,
                    route:ExpeditionRoute(${routeSelect}))`)
            .eq('volumeCode', code)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (volLookupError) {
            const message = String(volLookupError.message || '');
            if (/schema cache|does not exist|relationship/i.test(message)) return null;
            throw volLookupError;
        }

        const nestedStop = volumeRow?.stopItem;
        const entityId = Number(nestedStop?.entityId);
        if (nestedStop?.entityType === 'Purchase' && entityId === key && nestedStop?.route) {
            return {
                routeId: Number(nestedStop.route.id),
                routeLabel: formatExpeditionRouteLabelWithId(nestedStop.route),
                volumeStatusLabel: formatExpeditionPurchaseVolumeTransitLabel(volumeRow)
            };
        }
        return null;
    }

    const { data: volumes, error: volError } = await supabaseClient
        .from('ExpeditionVolume')
        .select('id, volumeCode, boardedAt, unloadedAt, volumeIndex')
        .eq('stopItemId', resolvedStopItem.id)
        .order('volumeIndex', { ascending: true });

    if (volError) {
        const message = String(volError.message || '');
        if (/schema cache|does not exist/i.test(message)) return null;
        throw volError;
    }

    const route = resolvedStopItem.route;
    return {
        routeId: Number(route.id),
        routeLabel: formatExpeditionRouteLabelWithId(route),
        volumeStatusLabel: formatExpeditionPurchaseVolumeTransitLabel((volumes || [])[0])
    };
}

window.EXPEDITION_ENTITY_TYPES = EXPEDITION_ENTITY_TYPES;
window.getExpeditionEntityTypeLabel = getExpeditionEntityTypeLabel;
window.formatExpeditionFactoryAddressFromSettings = formatExpeditionFactoryAddressFromSettings;
window.formatExpeditionAddressOneLine = formatExpeditionAddressOneLine;
window.expeditionMapsAddressParam = expeditionMapsAddressParam;
window.resolveExpeditionEntityContext = resolveExpeditionEntityContext;
window.searchExpeditionEntities = searchExpeditionEntities;
window.getExpeditionPickTarget = getExpeditionPickTarget;
window.formatExpeditionEntitySearchRowLabel = formatExpeditionEntitySearchRowLabel;
window.renderExpeditionEntitySearchRowHtml = renderExpeditionEntitySearchRowHtml;
window.renderExpeditionEntitySearchHeaderHtml = renderExpeditionEntitySearchHeaderHtml;
window.buildAddrSnapshotFromRecord = buildAddrSnapshotFromRecord;
window.buildExpeditionHistoryItemSummary = buildExpeditionHistoryItemSummary;
window.resolveExpeditionPickupContext = resolveExpeditionPickupContext;
window.searchExpeditionOrderProjectEntities = searchExpeditionOrderProjectEntities;
window.fetchExpeditionEntitiesForFabricaRotaPreview = fetchExpeditionEntitiesForFabricaRotaPreview;
window.filterExpeditionEntitiesAvailableForRoute = filterExpeditionEntitiesAvailableForRoute;
window.formatExpeditionEntityStatusDisplayLabel = formatExpeditionEntityStatusDisplayLabel;
window.getExpeditionPurchaseTypeDisplayLabel = getExpeditionPurchaseTypeDisplayLabel;
window.fetchExpeditionRouteSummaryForPurchase = fetchExpeditionRouteSummaryForPurchase;
window.formatExpeditionPurchaseVolumeTransitLabel = formatExpeditionPurchaseVolumeTransitLabel;
window.tryMarkPartRequestDeliveredAfterExpeditionUnload = tryMarkPartRequestDeliveredAfterExpeditionUnload;