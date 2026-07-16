const ORDER_REQUEST_ATTACHMENTS_BUCKET = 'order-request-attachments';
const ORDER_REQUEST_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ORDER_REQUEST_ATTACHMENT_SIGNED_URL_TTL = 3600;

const ORDER_REQUEST_ATTACHMENT_ALLOWED_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
]);

let convAttachmentDraftCounter = 0;
let convAttachmentDraftFiles = [];
let convAttachmentExisting = [];
let convAttachmentRemovedIds = [];
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

function buildOrderRequestAttachmentStoragePath(orderId, requestId, fileName) {
    const env = getOrderRequestStorageEnvPrefix();
    const safeName = sanitizeOrderRequestAttachmentFileName(fileName);
    const unique = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${env}/requests/${orderId}/${requestId}/${unique}-${safeName}`;
}

function isOrderRequestAttachmentImage(file) {
    if (!file) return false;
    const mime = String(file.type || '').toLowerCase();
    return mime.startsWith('image/') && (
        ORDER_REQUEST_ATTACHMENT_ALLOWED_TYPES.has(mime)
        || mime === 'image/pjpeg'
    );
}

function resetConvAttachments() {
    convAttachmentDraftFiles.forEach(item => {
        if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
        }
    });

    convAttachmentDraftCounter = 0;
    convAttachmentDraftFiles = [];
    convAttachmentExisting = [];
    convAttachmentRemovedIds = [];
    renderConvAttachmentsPreview();
}

function canEditConvAttachments(conv = null) {
    if (conv && isConvRespondOnlyMode(conv)) return false;
    if (conv && isRequestClosed(conv)) return false;
    if (conv) return canEditConversation(conv);
    return Boolean(activeOrderId);
}

function updateConvAttachmentModalControls(conv = null) {
    const wrap = document.getElementById('conv-attachments-wrap');
    const addBtn = document.getElementById('btn-add-conv-attachment');
    const fileInput = document.getElementById('conv-attachment-input');
    const canEdit = canEditConvAttachments(conv);

    wrap?.classList.toggle('hidden', false);
    if (addBtn) {
        addBtn.classList.toggle('hidden', !canEdit);
    }
    if (fileInput) {
        fileInput.disabled = !canEdit;
    }
}

function renderConvAttachmentsPreview() {
    const listEl = document.getElementById('conv-attachments-list');
    const emptyMsg = document.getElementById('conv-attachments-empty-msg');
    if (!listEl) return;

    const visibleExisting = convAttachmentExisting.filter(
        item => !convAttachmentRemovedIds.includes(item.id)
    );
    const hasItems = visibleExisting.length > 0 || convAttachmentDraftFiles.length > 0;

    if (!hasItems) {
        listEl.innerHTML = '';
        emptyMsg?.classList.remove('hidden');
        return;
    }

    emptyMsg?.classList.add('hidden');

    const conv = typeof getCurrentEditingRequest === 'function'
        ? getCurrentEditingRequest()
        : null;
    const canEdit = canEditConvAttachments(conv);

    const existingHtml = visibleExisting.map(item => `
        <div class="conv-attachment-item" data-attachment-existing-id="${item.id}">
            <div class="conv-attachment-item__preview-wrap">
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

    const draftHtml = convAttachmentDraftFiles.map(item => `
        <div class="conv-attachment-item" data-attachment-draft-id="${item.tempId}">
            <div class="conv-attachment-item__preview-wrap">
                <img src="${item.previewUrl}" alt="${escapeHtml(item.file.name)}"
                    class="conv-attachment-item__preview">
            </div>
            <p class="conv-attachment-item__name" title="${escapeHtml(item.file.name)}">
                ${escapeHtml(item.file.name)}
            </p>
            <button type="button"
                class="conv-attachment-item__remove"
                data-remove-draft-attachment="${item.tempId}"
                aria-label="Remover imagem">×</button>
        </div>
    `).join('');

    listEl.innerHTML = existingHtml + draftHtml;
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

function handleConvAttachmentFileSelect(fileList) {
    const conv = typeof getCurrentEditingRequest === 'function'
        ? getCurrentEditingRequest()
        : null;
    if (!canEditConvAttachments(conv)) return;

    const files = [...(fileList || [])];
    if (!files.length) return;

    const rejected = [];

    files.forEach(file => {
        if (!isOrderRequestAttachmentImage(file)) {
            rejected.push(`${file.name} (tipo não permitido)`);
            return;
        }
        if (file.size > ORDER_REQUEST_ATTACHMENT_MAX_BYTES) {
            rejected.push(`${file.name} (máx. 10 MB)`);
            return;
        }

        convAttachmentDraftCounter += 1;
        convAttachmentDraftFiles.push({
            tempId: `draft-${convAttachmentDraftCounter}`,
            file,
            previewUrl: URL.createObjectURL(file)
        });
    });

    if (rejected.length) {
        alertAppDialog(`Alguns arquivos não foram adicionados:\n${rejected.join('\n')}`);
    }

    renderConvAttachmentsPreview();
}

function removeConvAttachmentDraft(tempId) {
    const index = convAttachmentDraftFiles.findIndex(item => item.tempId === tempId);
    if (index < 0) return;

    const [removed] = convAttachmentDraftFiles.splice(index, 1);
    if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
    }
    renderConvAttachmentsPreview();
}

function markConvAttachmentExistingRemoved(attachmentId) {
    const numericId = Number(attachmentId);
    if (!numericId || convAttachmentRemovedIds.includes(numericId)) return;
    convAttachmentRemovedIds.push(numericId);
    renderConvAttachmentsPreview();
}

async function loadOrderRequestAttachmentsForModal(requestId) {
    convAttachmentExisting = [];
    convAttachmentRemovedIds = [];

    if (!requestId) {
        renderConvAttachmentsPreview();
        return;
    }

    const { data, error } = await supabaseClient
        .from('OrderRequestAttachment')
        .select('id, orderRequestId, storagePath, fileName, mimeType, fileSizeBytes, sortOrder, createdAt')
        .eq('orderRequestId', requestId)
        .order('sortOrder', { ascending: true })
        .order('createdAt', { ascending: true });

    if (error) {
        console.error('loadOrderRequestAttachmentsForModal:', error);
        if (error.message?.includes('OrderRequestAttachment')) {
            convAttachmentExisting = [];
            renderConvAttachmentsPreview();
            return;
        }
    }

    convAttachmentExisting = data || [];
    renderConvAttachmentsPreview();
}

async function fetchOrderRequestAttachmentsByRequestIds(requestIds = []) {
    if (!requestIds.length) return {};

    const { data, error } = await supabaseClient
        .from('OrderRequestAttachment')
        .select('id, orderRequestId, storagePath, fileName, mimeType, fileSizeBytes, sortOrder, createdAt')
        .in('orderRequestId', requestIds)
        .order('sortOrder', { ascending: true })
        .order('createdAt', { ascending: true });

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

async function uploadOrderRequestAttachmentFile(orderId, requestId, file) {
    const storagePath = buildOrderRequestAttachmentStoragePath(orderId, requestId, file.name);
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

async function persistOrderRequestAttachments(requestId, orderId) {
    if (!requestId || !orderId) return { error: null };

    const removed = convAttachmentExisting.filter(item => convAttachmentRemovedIds.includes(item.id));
    for (const attachment of removed) {
        await deleteOrderRequestAttachmentRecord(attachment);
    }

    const baseSortOrder = convAttachmentExisting.filter(
        item => !convAttachmentRemovedIds.includes(item.id)
    ).length;

    for (let index = 0; index < convAttachmentDraftFiles.length; index += 1) {
        const draft = convAttachmentDraftFiles[index];
        const storagePath = await uploadOrderRequestAttachmentFile(orderId, requestId, draft.file);
        const payload = {
            orderRequestId: requestId,
            storagePath,
            fileName: draft.file.name,
            mimeType: draft.file.type || 'image/jpeg',
            fileSizeBytes: draft.file.size,
            sortOrder: baseSortOrder + index + 1,
            createdById: currentUser?.id || null
        };

        const { error } = await supabaseClient
            .from('OrderRequestAttachment')
            .insert(payload);

        if (error) {
            throw error;
        }
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
            <p class="font-bold text-slate-400 uppercase text-[9px] mb-2">Imagens (${attachments.length})</p>
            <div class="conv-attachments-card__grid">${thumbs}</div>
        </div>
    `;
}

async function hydrateOrderRequestAttachmentCards(container) {
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

function bindConvAttachmentEvents() {
    document.getElementById('btn-add-conv-attachment')?.addEventListener('click', () => {
        document.getElementById('conv-attachment-input')?.click();
    });

    document.getElementById('conv-attachment-input')?.addEventListener('change', event => {
        handleConvAttachmentFileSelect(event.target.files);
        event.target.value = '';
    });

    document.getElementById('conv-attachments-list')?.addEventListener('click', event => {
        const removeDraftBtn = event.target.closest('[data-remove-draft-attachment]');
        if (removeDraftBtn) {
            removeConvAttachmentDraft(removeDraftBtn.dataset.removeDraftAttachment);
            return;
        }

        const removeExistingBtn = event.target.closest('[data-remove-existing-attachment]');
        if (removeExistingBtn) {
            markConvAttachmentExistingRemoved(Number(removeExistingBtn.dataset.removeExistingAttachment));
        }
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

        const storagePath = thumb.dataset.attachmentStoragePath;
        const fileName = thumb.getAttribute('title') || 'Imagem';
        openOrderRequestAttachmentPreview(storagePath, fileName);
    });
}
