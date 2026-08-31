const ORDER_REQUEST_ATTACHMENTS_BUCKET = 'order-request-attachments';
const ORDER_REQUEST_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ORDER_REQUEST_ATTACHMENT_SIGNED_URL_TTL = 3600;
const ORDER_REQUEST_ATTACHMENT_SELECT = 'id, orderRequestId, orderRequestActivityId, storagePath, fileName, mimeType, fileSizeBytes, sortOrder, createdAt';
const ORDER_REQUEST_ATTACHMENT_SELECT_LEGACY = 'id, orderRequestId, storagePath, fileName, mimeType, fileSizeBytes, sortOrder, createdAt';

const ORDER_REQUEST_ATTACHMENT_ALLOWED_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
]);

let convAttachmentExisting = [];
let convAttachmentRemovedIds = [];
let requestActivityAttachmentDraftCounter = 0;
let requestActivityAttachmentDrafts = new Map();
let requestActivityAttachmentExisting = new Map();
let requestActivityAttachmentRemovedIds = new Set();
let requestActivityImageTargetRowId = null;
const orderRequestAttachmentUrlCache = new Map();

function getOrderRequestStorageEnvPrefix() {
    return window.FORMIGHIERI_APP_ENV === 'prod' ? 'prod' : 'dev';
}

function sanitizeOrderRequestAttachmentFileName(fileName) {
    const base = String(fileName || 'imagem')
        .trim()
        .replace(/[^\w.\-() ]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 120);
    return base || 'imagem';
}

function buildOrderRequestAttachmentStoragePath(orderId, requestId, fileName, activityId = null) {
    const env = getOrderRequestStorageEnvPrefix();
    const safeName = sanitizeOrderRequestAttachmentFileName(fileName);
    const unique = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const activityPart = activityId ? `${activityId}/` : '';
    return `${env}/requests/${orderId}/${requestId}/${activityPart}${unique}-${safeName}`;
}

function isOrderRequestAttachmentImage(file) {
    if (!file) return false;
    const mime = String(file.type || '').toLowerCase();
    return mime.startsWith('image/') && (
        ORDER_REQUEST_ATTACHMENT_ALLOWED_TYPES.has(mime)
        || mime === 'image/pjpeg'
    );
}

function canEditRequestActivityImage(conv = null) {
    return typeof canEditRequestActivityDescriptions === 'function'
        && canEditRequestActivityDescriptions(conv);
}

function isRequestDriveAttachment(item) {
    return Boolean(item && (item.driveFileId || item.entityType === 'OrderRequestActivity'));
}

function requestAttachmentRemovalKey(item) {
    if (!item?.id) return '';
    return `${isRequestDriveAttachment(item) ? 'drive' : 'storage'}:${item.id}`;
}

function pickRequestActivityImage(activityId, storageByActivity = {}, driveByActivity = {}) {
    const key = String(activityId);
    return driveByActivity[key] || driveByActivity[activityId]
        || storageByActivity[key] || storageByActivity[activityId]
        || null;
}

function mergeRequestActivityAttachmentMaps(storageByActivity = {}, driveByActivity = {}) {
    const merged = { ...storageByActivity };
    Object.entries(driveByActivity || {}).forEach(([activityId, item]) => {
        merged[activityId] = item;
        merged[Number(activityId)] = item;
    });
    return merged;
}

function requestAttachmentPreviewAttrs(item) {
    if (isRequestDriveAttachment(item)) {
        if (typeof driveFilePreviewImgAttrs === 'function') {
            return driveFilePreviewImgAttrs(item);
        }
        const previewUrl = typeof resolveDriveFilePreviewUrl === 'function'
            ? resolveDriveFilePreviewUrl(item)
            : (item.url || '');
        const openUrl = typeof resolveDriveFileViewUrl === 'function'
            ? (resolveDriveFileViewUrl(item) || previewUrl)
            : previewUrl;
        return `src="${escapeHtml(previewUrl)}" referrerpolicy="no-referrer" data-attachment-drive-url="${escapeHtml(openUrl)}"`;
    }
    return `data-attachment-storage-path="${escapeHtml(item.storagePath || '')}"`;
}

function getLegacyConvAttachments() {
    return convAttachmentExisting.filter(item => (
        !item.orderRequestActivityId
        && !convAttachmentRemovedIds.includes(item.id)
    ));
}

function resetRequestActivityAttachments() {
    requestActivityAttachmentDrafts.forEach(item => {
        if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
        }
    });

    requestActivityAttachmentDraftCounter = 0;
    requestActivityAttachmentDrafts = new Map();
    requestActivityAttachmentExisting = new Map();
    requestActivityAttachmentRemovedIds = new Set();
    requestActivityImageTargetRowId = null;
}

function resetConvAttachments() {
    resetRequestActivityAttachments();
    convAttachmentExisting = [];
    convAttachmentRemovedIds = [];
    renderConvAttachmentsPreview();
}

function canEditConvAttachments(conv = null) {
    return canEditRequestActivityImage(conv);
}

function updateConvAttachmentModalControls(conv = null) {
    const wrap = document.getElementById('conv-attachments-wrap');
    const addBtn = document.getElementById('btn-add-conv-attachment');
    const hasLegacy = getLegacyConvAttachments().length > 0;

    wrap?.classList.toggle('hidden', !hasLegacy);
    addBtn?.classList.add('hidden');

    if (typeof refreshAllRequestActivityAttachments === 'function') {
        refreshAllRequestActivityAttachments();
    }
}

function renderConvAttachmentsPreview() {
    const wrap = document.getElementById('conv-attachments-wrap');
    const listEl = document.getElementById('conv-attachments-list');
    const emptyMsg = document.getElementById('conv-attachments-empty-msg');
    if (!listEl) return;

    const visibleExisting = getLegacyConvAttachments();
    wrap?.classList.toggle('hidden', visibleExisting.length === 0);
    emptyMsg?.classList.add('hidden');

    if (!visibleExisting.length) {
        listEl.innerHTML = '';
        return;
    }

    const conv = typeof getCurrentEditingRequest === 'function'
        ? getCurrentEditingRequest()
        : null;
    const canEdit = canEditConvAttachments(conv);

    listEl.innerHTML = visibleExisting.map(item => `
        <div class="conv-attachment-item" data-attachment-existing-id="${item.id}">
            <div class="conv-attachment-item__preview-wrap conv-attachment-item__preview-wrap--openable"
                role="button"
                tabindex="0"
                title="Abrir imagem"
                aria-label="Abrir imagem ${escapeHtml(item.fileName || '')}">
                <img alt="${escapeHtml(item.fileName || 'Imagem')}"
                    class="conv-attachment-item__preview"
                    data-attachment-storage-path="${escapeHtml(item.storagePath)}">
            </div>
            <p class="conv-attachment-item__name" title="${escapeHtml(item.fileName || '')}">
                ${escapeHtml(item.fileName || 'Imagem')}
            </p>
            ${canEdit ? `
                <button type="button"
                    class="conv-attachment-item__remove"
                    data-remove-existing-attachment="${item.id}"
                    aria-label="Remover imagem">×</button>
            ` : ''}
        </div>
    `).join('');
    hydrateConvAttachmentPreviewImages(listEl);
}

async function hydrateConvAttachmentPreviewImages(container = document.getElementById('conv-attachments-list')) {
    if (!container) return;

    const images = container.querySelectorAll('img[data-attachment-storage-path]');
    await Promise.all([...images].map(async img => {
        const storagePath = img.dataset.attachmentStoragePath;
        if (!storagePath || img.dataset.attachmentHydrated === '1') return;

        const url = await getOrderRequestAttachmentSignedUrl(storagePath);
        if (!url) return;

        img.src = url;
        img.dataset.attachmentHydrated = '1';
    }));
}

async function getOrderRequestAttachmentSignedUrl(storagePath) {
    if (!storagePath) return null;
    if (orderRequestAttachmentUrlCache.has(storagePath)) {
        return orderRequestAttachmentUrlCache.get(storagePath);
    }

    const { data, error } = await supabaseClient.storage
        .from(ORDER_REQUEST_ATTACHMENTS_BUCKET)
        .createSignedUrl(storagePath, ORDER_REQUEST_ATTACHMENT_SIGNED_URL_TTL);

    if (error) {
        console.error('getOrderRequestAttachmentSignedUrl:', error);
        return null;
    }

    orderRequestAttachmentUrlCache.set(storagePath, data.signedUrl);
    return data.signedUrl;
}

function markConvAttachmentExistingRemoved(attachmentId) {
    const numericId = Number(attachmentId);
    if (!numericId || convAttachmentRemovedIds.includes(numericId)) return;
    convAttachmentRemovedIds.push(numericId);
    renderConvAttachmentsPreview();
}

function partitionOrderRequestAttachments(attachments = []) {
    const legacy = [];
    const byActivity = {};

    attachments.forEach(item => {
        const activityId = Number(item.orderRequestActivityId);
        if (activityId) {
            if (!byActivity[activityId]) {
                byActivity[activityId] = item;
            }
            return;
        }
        legacy.push(item);
    });

    return { legacy, byActivity };
}

async function fetchOrderRequestAttachmentRows(buildQuery) {
    let { data, error } = await buildQuery(ORDER_REQUEST_ATTACHMENT_SELECT);
    if (error?.message?.includes('orderRequestActivityId')) {
        ({ data, error } = await buildQuery(ORDER_REQUEST_ATTACHMENT_SELECT_LEGACY));
    }
    return { data, error };
}

function applyLoadedRequestAttachments(attachments = [], driveByActivity = {}) {
    const { legacy, byActivity } = partitionOrderRequestAttachments(attachments);

    convAttachmentExisting = legacy;
    convAttachmentRemovedIds = [];
    requestActivityAttachmentExisting = new Map(
        Object.entries(mergeRequestActivityAttachmentMaps(byActivity, driveByActivity))
            .map(([activityId, item]) => [String(activityId), item])
    );
    requestActivityAttachmentRemovedIds = new Set();

    renderConvAttachmentsPreview();
    refreshAllRequestActivityAttachments();
}

async function loadOrderRequestAttachmentsForModal(requestId) {
    resetRequestActivityAttachments();
    convAttachmentExisting = [];
    convAttachmentRemovedIds = [];

    if (!requestId) {
        renderConvAttachmentsPreview();
        refreshAllRequestActivityAttachments();
        return;
    }

    const { data, error } = await fetchOrderRequestAttachmentRows(select => (
        supabaseClient
            .from('OrderRequestAttachment')
            .select(select)
            .eq('orderRequestId', requestId)
            .order('sortOrder', { ascending: true })
            .order('createdAt', { ascending: true })
    ));

    if (error) {
        console.error('loadOrderRequestAttachmentsForModal:', error);
        if (error.message?.includes('OrderRequestAttachment')) {
            const driveByActivity = await fetchRequestActivityDriveFilesByActivityIds(
                await fetchRequestActivityIdsForRequest(requestId)
            );
            applyLoadedRequestAttachments([], driveByActivity);
            return;
        }
    }

    applyLoadedRequestAttachments(data || [], await fetchRequestActivityDriveFilesByActivityIds(
        await fetchRequestActivityIdsForRequest(requestId)
    ));
}

async function fetchOrderRequestAttachmentsByRequestIds(requestIds = []) {
    if (!requestIds.length) return {};

    const { data, error } = await fetchOrderRequestAttachmentRows(select => (
        supabaseClient
            .from('OrderRequestAttachment')
            .select(select)
            .in('orderRequestId', requestIds)
            .order('sortOrder', { ascending: true })
            .order('createdAt', { ascending: true })
    ));

    if (error) {
        console.error('fetchOrderRequestAttachmentsByRequestIds:', error);
        if (error.message?.includes('OrderRequestAttachment')) return {};
        return {};
    }

    const byRequest = {};
    (data || []).forEach(item => {
        if (!byRequest[item.orderRequestId]) {
            byRequest[item.orderRequestId] = [];
        }
        byRequest[item.orderRequestId].push(item);
    });
    return byRequest;
}

async function fetchRequestActivityIdsForRequest(requestId) {
    if (!requestId) return [];
    const { data, error } = await supabaseClient
        .from('OrderRequestActivity')
        .select('id')
        .eq('orderRequestId', requestId);
    if (error) {
        console.warn('fetchRequestActivityIdsForRequest:', error);
        return [];
    }
    return (data || []).map(item => Number(item.id)).filter(Boolean);
}

async function fetchRequestActivityDriveFilesByActivityIds(activityIds = []) {
    if (!activityIds.length || typeof fetchDriveFilesByEntityIds !== 'function') return {};
    try {
        return await fetchDriveFilesByEntityIds({
            entityType: DRIVE_FILE_ENTITY_TYPE.ORDER_REQUEST_ACTIVITY,
            entityIds: activityIds,
            folderKind: DRIVE_FILE_FOLDER_KIND.REQUEST
        });
    } catch (error) {
        console.warn('fetchRequestActivityDriveFilesByActivityIds:', error);
        return {};
    }
}

function findRequestActivityRowByRowId(rowId) {
    const key = String(rowId);
    return document.querySelector(`#conv-activities-list tr[data-row-id="${key}"]`);
}

function getRequestActivityImageForRow(rowId) {
    const key = String(rowId);
    const existingRaw = requestActivityAttachmentExisting.get(key) || null;
    const existing = existingRaw && !requestActivityAttachmentRemovedIds.has(requestAttachmentRemovalKey(existingRaw))
        ? existingRaw
        : null;
    const draft = requestActivityAttachmentDrafts.get(key) || null;
    return { existing, draft };
}

function hasRequestActivityImage(rowId) {
    const { existing, draft } = getRequestActivityImageForRow(rowId);
    return Boolean(existing || draft);
}

function migrateRequestActivityAttachmentDrafts(fromRowId, toRowId) {
    const fromKey = String(fromRowId);
    const toKey = String(toRowId);
    if (fromKey === toKey) return;

    const draft = requestActivityAttachmentDrafts.get(fromKey);
    if (!draft) {
        requestActivityAttachmentDrafts.delete(fromKey);
        return;
    }

    requestActivityAttachmentDrafts.set(toKey, draft);
    requestActivityAttachmentDrafts.delete(fromKey);
}

function renderRequestActivityAttachmentsHtml(rowId, conv = null) {
    const canEdit = canEditRequestActivityImage(conv);
    const { existing, draft } = getRequestActivityImageForRow(rowId);
    const visibleItem = draft || existing;

    const imageHtml = visibleItem ? (draft ? `
        <div class="revision-activity-attachment-item" data-request-attachment-draft-id="${draft.tempId}">
            <div class="revision-activity-attachment-item__preview-wrap">
                <img src="${draft.previewUrl}" alt="${escapeHtml(draft.file.name)}"
                    class="revision-activity-attachment-item__preview">
            </div>
            ${canEdit ? `
                <button type="button"
                    class="revision-activity-attachment-item__remove"
                    data-remove-request-draft-attachment="${draft.tempId}"
                    aria-label="Remover imagem">×</button>
            ` : ''}
        </div>
    ` : `
        <div class="revision-activity-attachment-item" data-request-attachment-existing-id="${existing.id}">
            <div class="revision-activity-attachment-item__preview-wrap">
                <img alt="${escapeHtml(existing.fileName || 'Imagem')}"
                    class="revision-activity-attachment-item__preview"
                    ${requestAttachmentPreviewAttrs(existing)}>
            </div>
            ${canEdit ? `
                <button type="button"
                    class="revision-activity-attachment-item__remove"
                    data-remove-request-existing-attachment="${existing.id}"
                    data-remove-request-existing-source="${isRequestDriveAttachment(existing) ? 'drive' : 'storage'}"
                    aria-label="Remover imagem">×</button>
            ` : ''}
        </div>
    `) : '';

    return `
        <div class="revision-activity-attachments" data-request-activity-row-id="${escapeHtml(String(rowId))}">
            ${visibleItem ? `<div class="revision-activity-attachments__list">${imageHtml}</div>` : ''}
            ${canEdit && !visibleItem ? `
                <button type="button"
                    class="revision-activity-attachments__add-btn"
                    data-add-request-activity-image="${escapeHtml(String(rowId))}">
                    + Imagem
                </button>
            ` : (visibleItem ? '' : '<span class="revision-activity-attachments__empty">—</span>')}
        </div>
    `;
}

function renderRequestActivityAttachmentsReadonlyHtml(attachment = null) {
    if (!attachment) {
        return '<span class="revision-activity-attachments__empty">—</span>';
    }

    return `
        <div class="revision-activity-attachments__readonly">
            <button type="button"
                class="revision-activity-attachment-thumb"
                data-open-attachment-id="${attachment.id}"
                ${isRequestDriveAttachment(attachment)
                    ? `data-attachment-drive-url="${escapeHtml(
                        (typeof resolveDriveFileViewUrl === 'function'
                            ? resolveDriveFileViewUrl(attachment)
                            : (typeof resolveDriveFilePreviewUrl === 'function'
                                ? resolveDriveFilePreviewUrl(attachment)
                                : attachment.url)) || ''
                    )}"`
                    : `data-attachment-storage-path="${escapeHtml(attachment.storagePath || '')}"`}
                title="${escapeHtml(attachment.fileName || 'Imagem')}">
                <img alt="${escapeHtml(attachment.fileName || 'Imagem')}"
                    ${requestAttachmentPreviewAttrs(attachment)}>
            </button>
        </div>
    `;
}

function refreshRequestActivityAttachmentsForRow(rowId) {
    const tr = findRequestActivityRowByRowId(rowId);
    if (!tr) return;

    const container = tr.querySelector('.revision-activity-attachments');
    if (!container) return;

    const conv = typeof getCurrentEditingRequest === 'function'
        ? getCurrentEditingRequest()
        : null;
    container.outerHTML = renderRequestActivityAttachmentsHtml(rowId, conv);
    hydrateConvAttachmentPreviewImages(tr);
}

function refreshAllRequestActivityAttachments() {
    const conv = typeof getCurrentEditingRequest === 'function'
        ? getCurrentEditingRequest()
        : null;

    document.querySelectorAll('#conv-activities-list tr[data-row-id]').forEach(tr => {
        const container = tr.querySelector('.revision-activity-attachments');
        if (!container) return;
        container.outerHTML = renderRequestActivityAttachmentsHtml(tr.dataset.rowId, conv);
        hydrateConvAttachmentPreviewImages(tr);
    });
}

function setRequestActivityAttachmentDraft(rowId, file) {
    const key = String(rowId);
    if (hasRequestActivityImage(rowId)) {
        return false;
    }

    requestActivityAttachmentDraftCounter += 1;
    requestActivityAttachmentDrafts.set(key, {
        tempId: `req-draft-${requestActivityAttachmentDraftCounter}`,
        file,
        previewUrl: URL.createObjectURL(file)
    });
    refreshRequestActivityAttachmentsForRow(rowId);
    return true;
}

function removeRequestActivityAttachmentDraft(rowId) {
    const key = String(rowId);
    const draft = requestActivityAttachmentDrafts.get(key);
    if (!draft) return;

    if (draft.previewUrl) {
        URL.revokeObjectURL(draft.previewUrl);
    }
    requestActivityAttachmentDrafts.delete(key);
    refreshRequestActivityAttachmentsForRow(rowId);
}

function markRequestActivityAttachmentRemoved(attachmentId, source = 'storage') {
    const numericId = Number(attachmentId);
    if (!numericId) return;

    requestActivityAttachmentRemovedIds.add(`${source === 'drive' ? 'drive' : 'storage'}:${numericId}`);
    refreshAllRequestActivityAttachments();
}

function handleRequestActivityImageSelect(fileList) {
    const rowId = requestActivityImageTargetRowId;
    const conv = typeof getCurrentEditingRequest === 'function'
        ? getCurrentEditingRequest()
        : null;
    if (!rowId || !canEditRequestActivityImage(conv)) return;

    const file = [...(fileList || [])][0];
    if (!file) return;

    if (typeof isGoogleDriveAppsScriptConfigured === 'function' && !isGoogleDriveAppsScriptConfigured()) {
        alertAppDialog('Drive não configurado no Apps Script.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (hasRequestActivityImage(rowId)) {
        alertAppDialog('Cada atividade permite apenas uma imagem. Remova a atual para adicionar outra.');
        return;
    }

    if (!isOrderRequestAttachmentImage(file)) {
        alertAppDialog('Tipo de arquivo não permitido. Use uma imagem (JPEG, PNG, WebP, GIF ou HEIC).');
        return;
    }
    if (file.size > ORDER_REQUEST_ATTACHMENT_MAX_BYTES) {
        alertAppDialog('A imagem deve ter no máximo 10 MB.');
        return;
    }

    setRequestActivityAttachmentDraft(rowId, file);
}

async function uploadOrderRequestAttachmentFile(orderId, requestId, file, activityId = null) {
    const storagePath = buildOrderRequestAttachmentStoragePath(orderId, requestId, file.name, activityId);
    const { error } = await supabaseClient.storage
        .from(ORDER_REQUEST_ATTACHMENTS_BUCKET)
        .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || 'image/jpeg'
        });

    if (error) {
        throw error;
    }

    return storagePath;
}

async function deleteOrderRequestAttachmentRecord(attachment) {
    if (!attachment) return;

    const { error: storageError } = await supabaseClient.storage
        .from(ORDER_REQUEST_ATTACHMENTS_BUCKET)
        .remove([attachment.storagePath]);

    if (storageError) {
        console.warn('deleteOrderRequestAttachmentRecord storage:', storageError);
    }

    const { error } = await supabaseClient
        .from('OrderRequestAttachment')
        .delete()
        .eq('id', attachment.id);

    if (error) {
        throw error;
    }

    orderRequestAttachmentUrlCache.delete(attachment.storagePath);
}

async function resolveRequestDriveContext(orderId, orderProjectId, activityId) {
    if (!orderId || !orderProjectId || !activityId) {
        throw new Error('Pedido, projeto e atividade são obrigatórios para enviar a imagem.');
    }

    let orderCode = '';
    if (typeof ordersCache !== 'undefined') {
        orderCode = ordersCache.find(order => Number(order.id) === Number(orderId))?.orderCode || '';
    }
    if (!orderCode) {
        const { data, error } = await supabaseClient
            .from('salesOrders')
            .select('orderCode')
            .eq('id', orderId)
            .maybeSingle();
        if (error) throw error;
        orderCode = data?.orderCode || '';
    }

    let projectName = '';
    if (typeof getConvOrderProjectById === 'function') {
        projectName = getConvOrderProjectById(orderProjectId)?.name || '';
    }
    if (!projectName && typeof conversationsCache !== 'undefined') {
        const conv = conversationsCache.find(item => Number(item.orderProjectId) === Number(orderProjectId));
        projectName = conv?.orderProject?.name || '';
    }
    if (!projectName) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select('name')
            .eq('id', orderProjectId)
            .maybeSingle();
        if (error) throw error;
        projectName = data?.name || '';
    }

    if (!orderCode || !projectName) {
        throw new Error('Não foi possível identificar o pedido e o projeto para o Drive.');
    }

    return {
        folderKind: DRIVE_FILE_FOLDER_KIND.REQUEST,
        entityType: DRIVE_FILE_ENTITY_TYPE.ORDER_REQUEST_ACTIVITY,
        entityId: Number(activityId),
        orderId: Number(orderId),
        orderProjectId: Number(orderProjectId),
        orderCode,
        projectName,
        folderPath: buildDriveFolderPath(orderCode, projectName, DRIVE_FILE_FOLDER_KIND.REQUEST),
        replaceByEntity: true
    };
}

async function deleteRequestActivityAttachmentRecord(attachment) {
    if (!attachment) return;
    if (isRequestDriveAttachment(attachment)) {
        if (typeof deleteDriveFileRecord === 'function') {
            await deleteDriveFileRecord(attachment);
        }
        return;
    }
    await deleteOrderRequestAttachmentRecord(attachment);
}

async function uploadRequestActivityDraftForRow(rowId, orderId, orderProjectId, activityId, onProgress) {
    const key = String(rowId);
    const draft = requestActivityAttachmentDrafts.get(key);
    if (!draft) return;

    if (typeof saveDriveFileUpload !== 'function') {
        throw new Error('Envio ao Drive não está disponível.');
    }

    const context = await resolveRequestDriveContext(orderId, orderProjectId, activityId);
    const safeName = sanitizeOrderRequestAttachmentFileName(draft.file.name);
    const record = await saveDriveFileUpload(
        draft.file,
        {
            ...context,
            fileName: `atividade-${activityId}-${safeName}`
        },
        onProgress
    );

    if (draft.previewUrl) {
        URL.revokeObjectURL(draft.previewUrl);
    }

    requestActivityAttachmentDrafts.delete(key);
    requestActivityAttachmentExisting.set(String(activityId), record);
}

async function persistOrderRequestAttachments(requestId, orderId, activityIdByRowId = {}, orderProjectId = null) {
    if (!requestId || !orderId) return { error: null };

    const removedLegacy = convAttachmentExisting.filter(item => convAttachmentRemovedIds.includes(item.id));
    for (const attachment of removedLegacy) {
        await deleteOrderRequestAttachmentRecord(attachment);
    }
    convAttachmentExisting = convAttachmentExisting.filter(
        item => !convAttachmentRemovedIds.includes(item.id)
    );
    convAttachmentRemovedIds = [];

    const deletedKeys = new Set(requestActivityAttachmentRemovedIds);
    for (const [activityId, attachment] of requestActivityAttachmentExisting.entries()) {
        if (!attachment || !deletedKeys.has(requestAttachmentRemovalKey(attachment))) continue;
        await deleteRequestActivityAttachmentRecord(attachment);
        requestActivityAttachmentExisting.delete(activityId);
    }
    requestActivityAttachmentRemovedIds.clear();

    const activityIds = [...new Set(Object.values(activityIdByRowId).map(Number).filter(Boolean))];
    const resolvedProjectId = Number(orderProjectId) || null;
    for (const activityId of activityIds) {
        await uploadRequestActivityDraftForRow(
            String(activityId),
            orderId,
            resolvedProjectId,
            activityId,
            (sent, total) => {
                if (!total) return;
                const pct = Math.min(100, Math.round((sent / total) * 100));
                const message = `Enviando imagem da atividade (${pct}%)...`;
                const overlay = document.getElementById('conv-form-loading');
                if (overlay && !overlay.classList.contains('hidden') && typeof setConvFormLoading === 'function') {
                    setConvFormLoading(true, message);
                }
                if (typeof setConvActivitiesSaveLoading === 'function') {
                    setConvActivitiesSaveLoading(true, message);
                }
            }
        );
    }

    return { error: null };
}

function buildOrderRequestAttachmentsCardHtml(requestId, attachments = []) {
    if (!attachments.length) return '';

    const thumbs = attachments.map((item, index) => `
        <button type="button"
            class="conv-attachment-thumb"
            data-open-attachment-id="${item.id}"
            data-attachment-storage-path="${escapeHtml(item.storagePath)}"
            title="${escapeHtml(item.fileName || `Imagem ${index + 1}`)}">
            <img alt="${escapeHtml(item.fileName || `Imagem ${index + 1}`)}"
                data-attachment-storage-path="${escapeHtml(item.storagePath)}">
        </button>
    `).join('');

    return `
        <div class="conv-attachments-card" data-request-attachments="${requestId}">
            <p class="font-bold text-slate-400 uppercase text-[9px] mb-2">Imagens da requisição (${attachments.length})</p>
            <div class="conv-attachments-card__grid">${thumbs}</div>
        </div>
    `;
}

async function hydrateOrderRequestAttachmentCards(container) {
    await hydrateConvAttachmentPreviewImages(container);
}

function appendOrderRequestAttachmentsToCard(body, requestId, attachments = []) {
    if (!body || !attachments.length) return;

    body.insertAdjacentHTML('beforeend', buildOrderRequestAttachmentsCardHtml(requestId, attachments));
    hydrateOrderRequestAttachmentCards(body);
}

function openOrderRequestAttachmentPreview(storagePath, fileName = 'Imagem') {
    getOrderRequestAttachmentSignedUrl(storagePath).then(url => {
        if (!url) {
            alertAppDialog('Não foi possível abrir a imagem.');
            return;
        }

        openImageAttachmentLightbox(url, fileName);
    });
}

function bindRequestActivityAttachmentListEvents(listEl) {
    listEl?.addEventListener('click', event => {
        const addBtn = event.target.closest('[data-add-request-activity-image]');
        if (addBtn) {
            const conv = typeof getCurrentEditingRequest === 'function'
                ? getCurrentEditingRequest()
                : null;
            if (!canEditRequestActivityImage(conv)) return;
            requestActivityImageTargetRowId = addBtn.dataset.addRequestActivityImage;
            document.getElementById('conv-activity-image-input')?.click();
            return;
        }

        const removeDraftBtn = event.target.closest('[data-remove-request-draft-attachment]');
        if (removeDraftBtn) {
            const rowId = removeDraftBtn.closest('[data-request-activity-row-id]')?.dataset.requestActivityRowId;
            if (rowId) {
                removeRequestActivityAttachmentDraft(rowId);
            }
            return;
        }

        const removeExistingBtn = event.target.closest('[data-remove-request-existing-attachment]');
        if (removeExistingBtn) {
            markRequestActivityAttachmentRemoved(
                Number(removeExistingBtn.dataset.removeRequestExistingAttachment),
                removeExistingBtn.dataset.removeRequestExistingSource || 'storage'
            );
            return;
        }

        const previewImg = event.target.closest('.revision-activity-attachment-item__preview');
        if (previewImg?.dataset.attachmentDriveUrl) {
            openImageAttachmentLightbox(
                previewImg.dataset.attachmentDriveUrl,
                previewImg.getAttribute('alt') || 'Imagem'
            );
            return;
        }
        if (previewImg?.dataset.attachmentStoragePath) {
            openOrderRequestAttachmentPreview(
                previewImg.dataset.attachmentStoragePath,
                previewImg.getAttribute('alt') || 'Imagem'
            );
            return;
        }
        if (previewImg?.src) {
            openImageAttachmentLightbox(previewImg.src, previewImg.getAttribute('alt') || 'Imagem');
        }
    });
}

function bindConvAttachmentEvents() {
    document.getElementById('conv-activity-image-input')?.addEventListener('change', event => {
        handleRequestActivityImageSelect(event.target.files);
        event.target.value = '';
    });

    bindRequestActivityAttachmentListEvents(document.getElementById('conv-activities-list'));

    document.getElementById('conv-attachments-list')?.addEventListener('click', event => {
        const removeExistingBtn = event.target.closest('[data-remove-existing-attachment]');
        if (removeExistingBtn) {
            markConvAttachmentExistingRemoved(Number(removeExistingBtn.dataset.removeExistingAttachment));
            return;
        }

        const previewWrap = event.target.closest('.conv-attachment-item__preview-wrap--openable');
        if (!previewWrap) return;

        const item = previewWrap.closest('.conv-attachment-item');
        const img = previewWrap.querySelector('img');
        const storagePath = img?.dataset.attachmentStoragePath;
        const fileName = img?.alt
            || item?.querySelector('.conv-attachment-item__name')?.textContent?.trim()
            || 'Imagem';

        if (storagePath) {
            openOrderRequestAttachmentPreview(storagePath, fileName);
            return;
        }

        if (img?.src) {
            openImageAttachmentLightbox(img.src, fileName);
        }
    });

    document.getElementById('conv-attachments-list')?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const previewWrap = event.target.closest('.conv-attachment-item__preview-wrap--openable');
        if (!previewWrap) return;
        event.preventDefault();
        previewWrap.click();
    });

    document.getElementById('conversations-list')?.addEventListener('click', event => {
        const toggleBtn = event.target.closest('.list-card-toggle');
        const header = event.target.closest('.collapsible-list-header');
        if (toggleBtn || header) {
            const card = (toggleBtn || header)?.closest('.collapsible-list-card');
            const body = card?.querySelector('.collapsible-list-body');
            if (body) {
                window.setTimeout(() => {
                    if (!body.classList.contains('hidden')) {
                        hydrateOrderRequestAttachmentCards(body);
                    }
                }, 0);
            }
        }

        const thumb = event.target.closest('[data-open-attachment-id]');
        if (!thumb) return;

        const fileName = thumb.getAttribute('title') || 'Imagem';
        if (thumb.dataset.attachmentDriveUrl) {
            openImageAttachmentLightbox(thumb.dataset.attachmentDriveUrl, fileName);
            return;
        }
        const storagePath = thumb.dataset.attachmentStoragePath;
        openOrderRequestAttachmentPreview(storagePath, fileName);
    });
}
