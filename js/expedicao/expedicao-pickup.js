const EXPEDITION_PICKUP_CATEGORIES = [
    { value: 'Trash', label: 'Lixo' },
    { value: 'Tool', label: 'Ferramenta' },
    { value: 'MaintenancePart', label: 'Peça para manutenção' },
    { value: 'Leftover', label: 'Sobra' }
];

function formatExpeditionPickupCategoryLabel(value) {
    const key = String(value || '').trim();
    return EXPEDITION_PICKUP_CATEGORIES.find(item => item.value === key)?.label || key || '—';
}

function isExpeditionPickupStopItem(item) {
    return String(item?.entityType || '') === 'Pickup';
}

function allocateExpeditionPickupEntityId() {
    const base = Date.now() % 1_000_000_000;
    const salt = Math.floor(Math.random() * 900_000) + 100_000;
    return base * 1000 + (salt % 1000);
}

function buildExpeditionPickupItemLabel(metadata = {}) {
    const category = formatExpeditionPickupCategoryLabel(metadata.pickupCategory);
    const orderCode = metadata.orderCode ? `Pedido ${metadata.orderCode}` : '';
    const desc = String(metadata.description || '').trim();
    return ['Coleta', category, orderCode, desc].filter(Boolean).join(' · ');
}

function buildExpeditionPickupDriveFolderPath(routeId, stopLabel) {
    if (typeof buildExpeditionRouteStopDriveFolderPath === 'function') {
        return buildExpeditionRouteStopDriveFolderPath(routeId, stopLabel);
    }
    const root = typeof getDriveRootFolderName === 'function' ? getDriveRootFolderName() : 'FGP';
    return [root, 'Rotas', String(routeId || ''), String(stopLabel || 'Parada')].join(' / ');
}

function expeditionPickupSqlHint() {
    return 'Execute os scripts de expedição coleta em PENDING-PROD-SQL.md no Supabase SQL Editor (DEV).';
}

function isExpeditionPickupSchemaError(error) {
    const message = String(error?.message || '');
    return /metadataJson|pickupUnloadedAt|pickupUnloadedById|schema cache|column/i.test(message);
}

async function fetchExpeditionRoutePickupStopItems(routeId) {
    const key = Number(routeId);
    if (!key) return [];

    const stopEmbed = 'stop:ExpeditionRouteStop(id, sortOrder, addrSnapshot)';
    const stopEmbedInner = 'stop:ExpeditionRouteStop!inner(id, sortOrder, addrSnapshot, routeId)';
    const selects = [
        `id, entityType, entityId, entityLabel, volumeCount, metadataJson,
            pickupUnloadedAt, pickupUnloadedById, stopId,
            pickupUnloadedBy:appUsers!pickupUnloadedById(id, name),
            ${stopEmbedInner}`,
        `id, entityType, entityId, entityLabel, volumeCount, metadataJson,
            pickupUnloadedAt, pickupUnloadedById, stopId,
            pickupUnloadedBy:appUsers!pickupUnloadedById(id, name),
            ${stopEmbed}`,
        `id, entityType, entityId, entityLabel, volumeCount, metadataJson,
            pickupUnloadedAt, pickupUnloadedById, stopId,
            ${stopEmbedInner}`,
        `id, entityType, entityId, entityLabel, volumeCount, metadataJson,
            pickupUnloadedAt, pickupUnloadedById, stopId,
            ${stopEmbed}`
    ];

    let lastError = null;
    for (const select of selects) {
        let query = supabaseClient
            .from('ExpeditionRouteStopItem')
            .select(select)
            .eq('entityType', 'Pickup');

        if (select.includes('!inner')) {
            query = query.eq('stop.routeId', key);
        } else {
            query = query.eq('routeId', key);
        }

        const result = await query.order('id', { ascending: true });
        if (!result.error) return result.data || [];
        lastError = result.error;
        if (!isExpeditionPickupSchemaError(result.error)
            && !/relationship|pickupUnloadedBy|routeId|schema cache/i.test(result.error.message || '')) {
            throw result.error;
        }
    }

    if (lastError && isExpeditionPickupSchemaError(lastError)) {
        console.warn('fetchExpeditionRoutePickupStopItems:', lastError);
        return [];
    }
    if (lastError) throw lastError;
    return [];
}

function expeditionPickupHistoryStopNumber(item) {
    const sortOrder = Number(item?.stop?.sortOrder);
    return Number.isFinite(sortOrder) && sortOrder >= 0 ? sortOrder + 1 : null;
}

function formatExpeditionPickupHistorySummary(item) {
    const meta = item?.metadataJson || {};
    const parts = [];
    if (meta.orderCode) parts.push(`Pedido ${meta.orderCode}`);
    const category = formatExpeditionPickupCategoryLabel(meta.pickupCategory);
    if (category && category !== '—') parts.push(category);
    const description = String(meta.description || '').trim();
    if (description) parts.push(description);
    if (parts.length) return parts.join(' · ');
    return String(item?.entityLabel || '—').trim() || '—';
}

function groupExpeditionPickupItemsForHistory(pickupItems = []) {
    return (pickupItems || []).map(item => ({
        isPickup: true,
        sortOrder: Number(item?.stop?.sortOrder),
        parada: expeditionPickupHistoryStopNumber(item),
        addr: typeof formatExpeditionAddressOneLine === 'function'
            ? formatExpeditionAddressOneLine(item.stop?.addrSnapshot)
            : '',
        entityType: 'Pickup',
        entityId: item.entityId,
        entityLabel: item.entityLabel,
        stopItemId: item.id,
        pickupItem: item,
        volumes: []
    })).sort((a, b) => {
        const orderA = Number.isFinite(a.sortOrder) ? a.sortOrder : 9999;
        const orderB = Number.isFinite(b.sortOrder) ? b.sortOrder : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return Number(a.stopItemId) - Number(b.stopItemId);
    });
}

async function loadExpeditionPickupHistoryDrivePhotos(stopItemIds = []) {
    const ids = [...new Set((stopItemIds || []).map(Number).filter(Boolean))];
    if (!ids.length || typeof fetchDriveFilesByEntityIds !== 'function') return {};

    const entityType = typeof DRIVE_FILE_ENTITY_TYPE !== 'undefined'
        ? DRIVE_FILE_ENTITY_TYPE.EXPEDITION_ROUTE_STOP_ITEM
        : 'ExpeditionRouteStopItem';
    const folderKind = typeof DRIVE_FILE_FOLDER_KIND !== 'undefined'
        ? DRIVE_FILE_FOLDER_KIND.EXPEDITION_PICKUP
        : 'expeditionPickup';

    try {
        const byEntity = await fetchDriveFilesByEntityIds({
            entityType,
            entityIds: ids,
            folderKind
        });
        const photoByStopItemId = {};
        Object.entries(byEntity || {}).forEach(([entityId, files]) => {
            const list = Array.isArray(files) ? files : (files ? [files] : []);
            const ready = list.find(file => file?.driveFileId)
                || list.find(file => String(file?.ingestStatus || '') === 'ready')
                || list[0];
            if (ready) photoByStopItemId[Number(entityId)] = ready;
        });
        return photoByStopItemId;
    } catch (error) {
        console.warn('loadExpeditionPickupHistoryDrivePhotos:', error);
        return {};
    }
}

async function prepareExpeditionRoutePickupHistoryGroups(pickupItems = []) {
    const groups = groupExpeditionPickupItemsForHistory(pickupItems);
    const photoByStopItemId = await loadExpeditionPickupHistoryDrivePhotos(
        groups.map(group => group.stopItemId)
    );

    groups.forEach(group => {
        group.itemSummary = formatExpeditionPickupHistorySummary(group.pickupItem);
        group.drivePhoto = photoByStopItemId[Number(group.stopItemId)] || null;
    });

    return groups;
}

async function markExpeditionPickupUnloaded(stopItemId) {
    const key = Number(stopItemId);
    if (!key) throw new Error('Item de coleta inválido.');

    const now = new Date().toISOString();
    const payload = {
        pickupUnloadedAt: now,
        pickupUnloadedById: currentUser?.id || null
    };

    const result = await supabaseClient
        .from('ExpeditionRouteStopItem')
        .update(payload)
        .eq('id', key)
        .eq('entityType', 'Pickup')
        .select('id, pickupUnloadedAt, stopId')
        .single();

    if (result.error && isExpeditionPickupSchemaError(result.error)) {
        throw new Error(expeditionPickupSqlHint());
    }
    if (result.error) throw result.error;
    return result.data;
}

async function uploadExpeditionPickupPhoto(file, context = {}) {
    if (!file) throw new Error('Selecione uma foto.');
    if (typeof saveDriveFileUpload !== 'function') {
        throw new Error('Upload para o Drive não está disponível.');
    }

    let uploadFile = file;
    if (typeof prepareDriveImageUploadFile === 'function') {
        uploadFile = await prepareDriveImageUploadFile(file, {
            maxBytes: typeof DRIVE_FILE_REVISION_IMAGE_MAX_BYTES !== 'undefined'
                ? DRIVE_FILE_REVISION_IMAGE_MAX_BYTES
                : (2 * 1024 * 1024)
        });
    }

    const folderKind = typeof DRIVE_FILE_FOLDER_KIND !== 'undefined'
        ? DRIVE_FILE_FOLDER_KIND.EXPEDITION_PICKUP
        : 'expeditionPickup';

    if (typeof validateDriveUploadFiles === 'function') {
        const validationError = validateDriveUploadFiles([uploadFile], folderKind);
        if (validationError) {
            throw new Error(validationError);
        }
    }

    const routeId = Number(context.routeId) || 0;
    const stopId = Number(context.stopId) || 0;
    const stopLabel = context.stopLabel
        || (typeof formatExpeditionRouteStopDriveLabel === 'function'
            ? formatExpeditionRouteStopDriveLabel(context.stopSortOrder, stopId)
            : `Parada ${stopId}`);

    return saveDriveFileUpload(uploadFile, {
        folderKind,
        entityType: 'ExpeditionRouteStopItem',
        entityId: Number(context.stopItemId),
        routeId,
        expeditionRouteId: String(routeId),
        expeditionStopLabel: stopLabel,
        orderCode: String(routeId),
        projectName: stopLabel,
        folderPath: buildExpeditionPickupDriveFolderPath(routeId, stopLabel),
        fileName: context.fileName || `coleta-${routeId}-${stopId}.jpg`,
        replaceByEntity: true,
        preserveOriginalFileName: false
    });
}

window.EXPEDITION_PICKUP_CATEGORIES = EXPEDITION_PICKUP_CATEGORIES;
window.formatExpeditionPickupCategoryLabel = formatExpeditionPickupCategoryLabel;
window.isExpeditionPickupStopItem = isExpeditionPickupStopItem;
window.allocateExpeditionPickupEntityId = allocateExpeditionPickupEntityId;
window.buildExpeditionPickupItemLabel = buildExpeditionPickupItemLabel;
window.buildExpeditionPickupDriveFolderPath = buildExpeditionPickupDriveFolderPath;
window.fetchExpeditionRoutePickupStopItems = fetchExpeditionRoutePickupStopItems;
window.markExpeditionPickupUnloaded = markExpeditionPickupUnloaded;
window.uploadExpeditionPickupPhoto = uploadExpeditionPickupPhoto;
window.expeditionPickupSqlHint = expeditionPickupSqlHint;

function groupExpeditionUnloadingStopsFromVolumesAndPickups(volumes = [], pickupItems = [], fuelingItems = []) {
    const stopsMap = new Map();

    const ensureStop = (stopId, sortOrder, addr) => {
        if (!stopsMap.has(stopId)) {
            stopsMap.set(stopId, {
                stopId,
                sortOrder: Number(sortOrder) || 0,
                addr: addr || {},
                volumes: [],
                pickupItems: [],
                fuelingItems: []
            });
        }
        return stopsMap.get(stopId);
    };

    (volumes || []).forEach(vol => {
        const stop = vol.stopItem?.stop;
        const stopKey = Number(stop?.id);
        if (!stopKey) return;
        const entry = ensureStop(stopKey, stop?.sortOrder, stop?.addrSnapshot);
        entry.volumes.push(vol);
    });

    (pickupItems || []).forEach(item => {
        const stopKey = Number(item.stopId || item.stop?.id);
        if (!stopKey) return;
        const entry = ensureStop(stopKey, item.stop?.sortOrder, item.stop?.addrSnapshot);
        entry.pickupItems.push(item);
    });

    (fuelingItems || []).forEach(item => {
        const stopKey = Number(item.stopId || item.stop?.id);
        if (!stopKey) return;
        const entry = ensureStop(stopKey, item.stop?.sortOrder, item.stop?.addrSnapshot);
        entry.fuelingItems.push(item);
    });

    return [...stopsMap.values()]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(stop => ({
            ...stop,
            volumes: stop.volumes.slice().sort((a, b) => {
                const itemA = Number(a.stopItem?.id) || 0;
                const itemB = Number(b.stopItem?.id) || 0;
                if (itemA !== itemB) return itemA - itemB;
                return (Number(a.volumeIndex) || 0) - (Number(b.volumeIndex) || 0);
            })
        }));
}

function expeditionStopHasUnloadingPending(stop) {
    const volPending = (stop?.volumes || []).filter(vol => vol.boardedAt && !vol.unloadedAt).length;
    const pickupPending = (stop?.pickupItems || []).filter(item => !item.pickupUnloadedAt).length;
    const fuelingPending = (stop?.fuelingItems || []).filter(item => !item.pickupUnloadedAt).length;
    return volPending + pickupPending + fuelingPending > 0;
}

function findNextExpeditionUnloadingStop(stops = []) {
    return (stops || []).find(stop => expeditionStopHasUnloadingPending(stop)) || null;
}

window.groupExpeditionUnloadingStopsFromVolumesAndPickups = groupExpeditionUnloadingStopsFromVolumesAndPickups;
window.expeditionStopHasUnloadingPending = expeditionStopHasUnloadingPending;
window.findNextExpeditionUnloadingStop = findNextExpeditionUnloadingStop;

const EXPEDITION_PICKUP_ORDER_STATUS_EXCLUDED = 'Entregue';

async function fetchExpeditionPickupOrderProjectPages(selectColumns) {
    const pageSize = 1000;
    const projects = [];
    let from = 0;

    while (true) {
        let query = supabaseClient
            .from('OrderProject')
            .select(selectColumns);

        if (typeof applyPendenciasExcludedOrderProjectQueryFilters === 'function') {
            query = applyPendenciasExcludedOrderProjectQueryFilters(query);
        } else if (selectColumns.includes('isComplementary')) {
            query = query.eq('isComplementary', false).eq('isReplaced', false);
        }

        const { data, error } = await query
            .order('id', { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) return { error, projects };
        projects.push(...(data || []));
        if (!data || data.length < pageSize) return { error: null, projects };
        from += pageSize;
    }
}

function isExpeditionPickupOrderProjectEligible(project, deliveredStatusId) {
    if (!project) return false;
    if (deliveredStatusId && Number(project.statusId) === Number(deliveredStatusId)) return false;
    const statusName = String(project.projectStatus?.name || '').trim();
    if (statusName === EXPEDITION_PICKUP_ORDER_STATUS_EXCLUDED) return false;
    return true;
}

async function fetchExpeditionPickupEligibleOrders() {
    const orderEmbed = 'order:salesOrders(id, orderCode, clientId, consultantUserId, client:Client(name), consultor:appUsers!consultantUserId(name))';
    const selects = [
        `id, orderId, statusId, isComplementary, isReplaced, aggregatorOrderProjectId, projectStatus:OrderProjectStatus(id, name), ${orderEmbed}`,
        `id, orderId, statusId, isComplementary, isReplaced, projectStatus:OrderProjectStatus(id, name), ${orderEmbed}`,
        `id, orderId, statusId, projectStatus:OrderProjectStatus(id, name), ${orderEmbed}`,
        `id, orderId, statusId, ${orderEmbed}`
    ];

    let projects = [];
    let lastError = null;
    for (const selectColumns of selects) {
        const result = await fetchExpeditionPickupOrderProjectPages(selectColumns);
        if (!result.error) {
            projects = result.projects;
            lastError = null;
            break;
        }
        lastError = result.error;
        if (!/isComplementary|isReplaced|aggregatorOrderProjectId|projectStatus|relationship/i.test(result.error.message || '')) {
            break;
        }
    }

    if (lastError && !projects.length) {
        return { error: lastError, orders: [] };
    }

    let deliveredStatusId = null;
    if (typeof getPendenciasStatusIdByName === 'function') {
        deliveredStatusId = await getPendenciasStatusIdByName(EXPEDITION_PICKUP_ORDER_STATUS_EXCLUDED);
    }

    const ordersById = new Map();
    projects
        .filter(project => isExpeditionPickupOrderProjectEligible(project, deliveredStatusId))
        .forEach(project => {
            const nestedOrder = project.order;
            const orderId = Number(nestedOrder?.id || project.orderId);
            if (!orderId || ordersById.has(orderId)) return;
            ordersById.set(orderId, nestedOrder?.id ? nestedOrder : { id: orderId });
        });

    const missingIds = [...ordersById.entries()]
        .filter(([, order]) => !order.orderCode)
        .map(([orderId]) => orderId);

    if (missingIds.length) {
        const orderSelect = typeof getSalesOrderMinimalEmbedSelect === 'function'
            ? getSalesOrderMinimalEmbedSelect()
            : 'id, orderCode, clientId, consultantUserId, client:Client(name), consultor:appUsers!consultantUserId(name)';
        const chunkSize = 100;

        for (let index = 0; index < missingIds.length; index += chunkSize) {
            const chunk = missingIds.slice(index, index + chunkSize);
            const { data: orders, error } = await supabaseClient
                .from('salesOrders')
                .select(orderSelect)
                .in('id', chunk);

            if (error) return { error, orders: [] };
            (orders || []).forEach(order => ordersById.set(Number(order.id), order));
        }
    }

    const orders = [...ordersById.values()]
        .filter(order => order?.orderCode)
        .sort((a, b) => String(b.orderCode || '').localeCompare(
            String(a.orderCode || ''),
            'pt-BR',
            { numeric: true }
        ));

    return { error: null, orders };
}

function openExpedicaoPickupOrderPicker() {
    if (typeof openOrderCodePicker !== 'function') {
        alertAppDialog('Busca de pedido indisponível.');
        return;
    }

    openOrderCodePicker({
        orderInputId: 'expedition-wizard-pickup-order-code',
        filterLocally: true,
        filterByOrderCodeOrClient: true,
        hideSearchButton: true,
        loadOrders: fetchExpeditionPickupEligibleOrders,
        title: 'Selecionar pedido',
        description: 'Pedidos com projeto que não está em Entregue. Filtre pelo código do pedido ou nome do cliente.',
        searchLabel: 'Filtrar pedido ou cliente',
        searchPlaceholder: 'Código do pedido ou cliente',
        emptySourceMessage: 'Nenhum pedido elegível para coleta (todos os projetos em Entregue ou excluídos pela regra de complementar/substituído).'
    });
}

window.fetchExpeditionPickupEligibleOrders = fetchExpeditionPickupEligibleOrders;
window.openExpedicaoPickupOrderPicker = openExpedicaoPickupOrderPicker;
window.prepareExpeditionRoutePickupHistoryGroups = prepareExpeditionRoutePickupHistoryGroups;
window.formatExpeditionPickupHistorySummary = formatExpeditionPickupHistorySummary;