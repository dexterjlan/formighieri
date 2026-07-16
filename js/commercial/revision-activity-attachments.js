const REVISION_ACTIVITY_ATTACHMENTS_BUCKET = 'commercial-revision-attachments';
const REVISION_ACTIVITY_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
const REVISION_ACTIVITY_ATTACHMENT_SIGNED_URL_TTL = 3600;

const REVISION_ACTIVITY_ATTACHMENT_ALLOWED_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
]);

let revisionActivityAttachmentDraftCounter = 0;
let revisionActivityAttachmentDrafts = new Map();
let revisionActivityAttachmentExisting = new Map();
let revisionActivityAttachmentRemovedIds = new Set();
let revisionActivityImageTargetRowId = null;
const revisionActivityAttachmentUrlCache = new Map();

function getRevisionActivityStorageEnvPrefix() {
    return window.FORMIGHIERI_APP_ENV === 'prod' ? 'prod' : 'dev';
}

function sanitizeRevisionActivityAttachmentFileName(fileName) {
    const base = String(fileName || 'imagem')
        .trim()
        .replace(/[^\w.\-() ]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 120);
    return base || 'imagem';
}

function buildRevisionActivityAttachmentStoragePath(revisionId, activityId, fileName) {
    const env = getRevisionActivityStorageEnvPrefix();
    const safeName = sanitizeRevisionActivityAttachmentFileName(fileName);
    const unique = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${env}/revisions/${revisionId}/${activityId}/${unique}-${safeName}`;
}

function isRevisionActivityAttachmentImage(file) {
    if (!file) return false;
    const mime = String(file.type || '').toLowerCase();
    return mime.startsWith('image/') && (
        REVISION_ACTIVITY_ATTACHMENT_ALLOWED_TYPES.has(mime)
        || mime === 'image/pjpeg'
    );
}

function canEditRevisionActivityAttachments(approval = null) {
    const resolvedApproval = approval
        || (typeof getCurrentApproval === 'function' ? getCurrentApproval() : null);
    if (revisionModalViewOnly) return false;
    return typeof canEditRevisionActivitiesConsultor === 'function'
        && canEditRevisionActivitiesConsultor(resolvedApproval);
}

function resetRevisionActivityAttachments() {
    revisionActivityAttachmentDrafts.forEach(draft => {
        if (draft?.previewUrl) {
            URL.revokeObjectURL(draft.previewUrl);
        }
    });

    revisionActivityAttachmentDraftCounter = 0;
    revisionActivityAttachmentDrafts = new Map();
    revisionActivityAttachmentExisting = new Map();
    revisionActivityAttachmentRemovedIds = new Set();
    revisionActivityImageTargetRowId = null;
}

function getRevisionActivityImageForRow(rowId) {
    const key = String(rowId);
    const existingRaw = revisionActivityAttachmentExisting.get(key) || null;
    const existing = existingRaw && !revisionActivityAttachmentRemovedIds.has(existingRaw.id)
        ? existingRaw
        : null;
    const draft = revisionActivityAttachmentDrafts.get(key) || null;
    return { existing, draft };
}

function hasRevisionActivityImage(rowId) {
    const { existing, draft } = getRevisionActivityImageForRow(rowId);
    return Boolean(existing || draft);
}

function migrateRevisionActivityAttachmentDrafts(fromRowId, toRowId) {
    const fromKey = String(fromRowId);
    const toKey = String(toRowId);
    if (fromKey === toKey) return;

    const draft = revisionActivityAttachmentDrafts.get(fromKey);
    if (!draft) {
        revisionActivityAttachmentDrafts.delete(fromKey);
        return;
    }

    revisionActivityAttachmentDrafts.set(toKey, draft);
    revisionActivityAttachmentDrafts.delete(fromKey);
}

function renderRevisionActivityAttachmentsHtml(rowId, approval = null) {
    const canEdit = canEditRevisionActivityAttachments(approval);
    const { existing, draft } = getRevisionActivityImageForRow(rowId);
    const visibleItem = draft || existing;

    const imageHtml = visibleItem ? (draft ? `
        <div class="revision-activity-attachment-item" data-revision-attachment-draft-id="${draft.tempId}">
            <div class="revision-activity-attachment-item__preview-wrap">
                <img src="${draft.previewUrl}" alt="${escapeHtml(draft.file.name)}"
                    class="revision-activity-attachment-item__preview">
            </div>
            ${canEdit ? `
                <button type="button"
                    class="revision-activity-attachment-item__remove"
                    data-remove-revision-draft-attachment="${draft.tempId}"
                    aria-label="Remover imagem">×</button>
            ` : ''}
        </div>
    ` : `
        <div class="revision-activity-attachment-item" data-revision-attachment-existing-id="${existing.id}">
            <div class="revision-activity-attachment-item__preview-wrap">
                <img alt="${escapeHtml(existing.fileName || 'Imagem')}"
                    class="revision-activity-attachment-item__preview"
                    data-revision-attachment-storage-path="${escapeHtml(existing.storagePath)}">
            </div>
            ${canEdit ? `
                <button type="button"
                    class="revision-activity-attachment-item__remove"
                    data-remove-revision-existing-attachment="${existing.id}"
                    aria-label="Remover imagem">×</button>
            ` : ''}
        </div>
    `) : '';

    return `
        <div class="revision-activity-attachments" data-revision-activity-row-id="${escapeHtml(String(rowId))}">
            ${visibleItem ? `<div class="revision-activity-attachments__list">${imageHtml}</div>` : ''}
            ${canEdit && !visibleItem ? `
                <button type="button"
                    class="revision-activity-attachments__add-btn"
                    data-add-revision-activity-image="${escapeHtml(String(rowId))}">
                    + Imagem
                </button>
            ` : (visibleItem ? '' : '<span class="revision-activity-attachments__empty">—</span>')}
        </div>
    `;
}

function refreshRevisionActivityAttachmentsForRow(rowId) {
    const tr = document.querySelector(`#revision-activities-list tr[data-row-id="${CSS.escape(String(rowId))}"]`);
    if (!tr) return;

    const container = tr.querySelector('.revision-activity-attachments');
    if (!container) return;

    const approval = typeof getCurrentApproval === 'function' ? getCurrentApproval() : null;
    container.outerHTML = renderRevisionActivityAttachmentsHtml(rowId, approval);
    hydrateRevisionActivityAttachmentPreviews(tr);
}

function refreshAllRevisionActivityAttachments() {
    document.querySelectorAll('#revision-activities-list tr[data-row-id]').forEach(tr => {
        refreshRevisionActivityAttachmentsForRow(tr.dataset.rowId);
    });
}

async function hydrateRevisionActivityAttachmentPreviews(root = document) {
    const images = root.querySelectorAll('img[data-revision-attachment-storage-path]');
    await Promise.all([...images].map(async img => {
        const storagePath = img.dataset.revisionAttachmentStoragePath;
        if (!storagePath || img.dataset.revisionAttachmentHydrated === '1') return;

        const url = await getRevisionActivityAttachmentSignedUrl(storagePath);
        if (!url) return;

        img.src = url;
        img.dataset.revisionAttachmentHydrated = '1';
    }));
}

async function getRevisionActivityAttachmentSignedUrl(storagePath) {
    if (!storagePath) return null;
    if (revisionActivityAttachmentUrlCache.has(storagePath)) {
        return revisionActivityAttachmentUrlCache.get(storagePath);
    }

    const { data, error } = await supabaseClient.storage
        .from(REVISION_ACTIVITY_ATTACHMENTS_BUCKET)
        .createSignedUrl(storagePath, REVISION_ACTIVITY_ATTACHMENT_SIGNED_URL_TTL);

    if (error) {
        console.error('getRevisionActivityAttachmentSignedUrl:', error);
        return null;
    }

    revisionActivityAttachmentUrlCache.set(storagePath, data.signedUrl);
    return data.signedUrl;
}

async function fetchRevisionActivityAttachmentsByActivityIds(activityIds = []) {
    if (!activityIds.length) return {};

    const { data, error } = await supabaseClient
        .from('CommercialRevisionActivityAttachment')
        .select('id, revisionActivityId, storagePath, fileName, mimeType, fileSizeBytes, sortOrder, createdAt')
        .in('revisionActivityId', activityIds)
        .order('sortOrder', { ascending: true })
        .order('createdAt', { ascending: true });

    if (error) {
        console.error('fetchRevisionActivityAttachmentsByActivityIds:', error);
        if (error.message?.includes('CommercialRevisionActivityAttachment')) return {};
        return {};
    }

    const byActivity = {};
    (data || []).forEach(item => {
        const key = String(item.revisionActivityId);
        if (!byActivity[key]) {
            byActivity[key] = item;
        }
    });
    return byActivity;
}

async function loadRevisionActivityAttachmentsForActivities(activities = []) {
    revisionActivityAttachmentExisting = new Map();
    revisionActivityAttachmentRemovedIds = new Set();

    const activityIds = activities
        .map(activity => Number(activity.id))
        .filter(Boolean);

    if (!activityIds.length) {
        refreshAllRevisionActivityAttachments();
        return;
    }

    const byActivity = await fetchRevisionActivityAttachmentsByActivityIds(activityIds);
    Object.entries(byActivity).forEach(([activityId, item]) => {
        revisionActivityAttachmentExisting.set(activityId, item);
    });
    refreshAllRevisionActivityAttachments();
}

function setRevisionActivityAttachmentDraft(rowId, file) {
    const key = String(rowId);
    if (hasRevisionActivityImage(rowId)) {
        return false;
    }

    revisionActivityAttachmentDraftCounter += 1;
    revisionActivityAttachmentDrafts.set(key, {
        tempId: `rev-draft-${revisionActivityAttachmentDraftCounter}`,
        file,
        previewUrl: URL.createObjectURL(file)
    });
    refreshRevisionActivityAttachmentsForRow(rowId);
    return true;
}

function removeRevisionActivityAttachmentDraft(rowId) {
    const key = String(rowId);
    const draft = revisionActivityAttachmentDrafts.get(key);
    if (!draft) return;

    if (draft.previewUrl) {
        URL.revokeObjectURL(draft.previewUrl);
    }
    revisionActivityAttachmentDrafts.delete(key);
    refreshRevisionActivityAttachmentsForRow(rowId);
}

function markRevisionActivityAttachmentRemoved(attachmentId) {
    const numericId = Number(attachmentId);
    if (!numericId) return;

    revisionActivityAttachmentRemovedIds.add(numericId);
    refreshAllRevisionActivityAttachments();
}

async function uploadRevisionActivityAttachmentFile(revisionId, activityId, file) {
    const storagePath = buildRevisionActivityAttachmentStoragePath(revisionId, activityId, file.name);
    const { error } = await supabaseClient.storage
        .from(REVISION_ACTIVITY_ATTACHMENTS_BUCKET)
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

async function deleteRevisionActivityAttachmentRecord(attachment) {
    if (!attachment) return;

    const { error: storageError } = await supabaseClient.storage
        .from(REVISION_ACTIVITY_ATTACHMENTS_BUCKET)
        .remove([attachment.storagePath]);

    if (storageError) {
        console.warn('deleteRevisionActivityAttachmentRecord storage:', storageError);
    }

    const { error } = await supabaseClient
        .from('CommercialRevisionActivityAttachment')
        .delete()
        .eq('id', attachment.id);

    if (error) {
        throw error;
    }

    revisionActivityAttachmentUrlCache.delete(attachment.storagePath);
}

async function insertRevisionActivityAttachmentRecord(activityId, file, storagePath, sortOrder) {
    const payload = {
        revisionActivityId: activityId,
        storagePath,
        fileName: file.name,
        mimeType: file.type || 'image/jpeg',
        fileSizeBytes: file.size,
        sortOrder,
        createdById: currentUser?.id || null
    };

    const { data, error } = await supabaseClient
        .from('CommercialRevisionActivityAttachment')
        .insert(payload)
        .select('id, revisionActivityId, storagePath, fileName, mimeType, fileSizeBytes, sortOrder, createdAt')
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function uploadRevisionActivityDraftForRow(rowId, revisionId, activityId) {
    const key = String(rowId);
    const draft = revisionActivityAttachmentDrafts.get(key);
    if (!draft) return;

    const storagePath = await uploadRevisionActivityAttachmentFile(revisionId, activityId, draft.file);
    const record = await insertRevisionActivityAttachmentRecord(
        activityId,
        draft.file,
        storagePath,
        1
    );

    if (draft.previewUrl) {
        URL.revokeObjectURL(draft.previewUrl);
    }

    revisionActivityAttachmentDrafts.delete(key);
    revisionActivityAttachmentExisting.set(String(activityId), record);
}

async function persistRevisionActivityAttachments(revisionId, activityIdByRowId = {}) {
    if (!revisionId) return { ok: true };

    try {
        const deletedIds = new Set(revisionActivityAttachmentRemovedIds);
        for (const [activityId, attachment] of revisionActivityAttachmentExisting.entries()) {
            if (!attachment || !deletedIds.has(attachment.id)) continue;
            await deleteRevisionActivityAttachmentRecord(attachment);
            revisionActivityAttachmentExisting.delete(activityId);
        }
        revisionActivityAttachmentRemovedIds.clear();

        for (const activityId of [...new Set(Object.values(activityIdByRowId).map(Number).filter(Boolean))]) {
            await uploadRevisionActivityDraftForRow(String(activityId), revisionId, activityId);
        }

        return { ok: true };
    } catch (error) {
        console.error('persistRevisionActivityAttachments:', error);
        return { ok: false, error };
    }
}

function handleRevisionActivityImageSelect(fileList) {
    const rowId = revisionActivityImageTargetRowId;
    if (!rowId || !canEditRevisionActivityAttachments()) return;

    const file = [...(fileList || [])][0];
    if (!file) return;

    if (hasRevisionActivityImage(rowId)) {
        alertAppDialog('Cada atividade permite apenas uma imagem. Remova a atual para adicionar outra.');
        return;
    }

    if (!isRevisionActivityAttachmentImage(file)) {
        alertAppDialog('Tipo de arquivo não permitido. Use uma imagem (JPEG, PNG, WebP, GIF ou HEIC).');
        return;
    }
    if (file.size > REVISION_ACTIVITY_ATTACHMENT_MAX_BYTES) {
        alertAppDialog('A imagem deve ter no máximo 2 MB.');
        return;
    }

    setRevisionActivityAttachmentDraft(rowId, file);
}

function renderRevisionActivityAttachmentsReadonlyHtml(attachment = null) {
    if (!attachment) {
        return '<span class="revision-activity-attachments__empty">—</span>';
    }

    return `
        <div class="revision-activity-attachments__readonly">
            <button type="button"
                class="revision-activity-attachment-thumb"
                data-open-revision-attachment-storage-path="${escapeHtml(attachment.storagePath)}"
                title="${escapeHtml(attachment.fileName || 'Imagem')}">
                <img alt="${escapeHtml(attachment.fileName || 'Imagem')}"
                    data-revision-attachment-storage-path="${escapeHtml(attachment.storagePath)}">
            </button>
        </div>
    `;
}

function openRevisionActivityAttachmentPreview(storagePath, fileName = 'Imagem') {
    getRevisionActivityAttachmentSignedUrl(storagePath).then(url => {
        if (!url) {
            alertAppDialog('Não foi possível abrir a imagem.');
            return;
        }

        openImageAttachmentLightbox(url, fileName);
    });
}

function bindRevisionActivityAttachmentEvents() {
    document.getElementById('revision-activities-list')?.addEventListener('click', event => {
        const addBtn = event.target.closest('[data-add-revision-activity-image]');
        if (addBtn) {
            if (!canEditRevisionActivityAttachments()) return;
            revisionActivityImageTargetRowId = addBtn.dataset.addRevisionActivityImage;
            document.getElementById('revision-activity-image-input')?.click();
            return;
        }

        const removeDraftBtn = event.target.closest('[data-remove-revision-draft-attachment]');
        if (removeDraftBtn) {
            const rowId = removeDraftBtn.closest('[data-revision-activity-row-id]')?.dataset.revisionActivityRowId;
            if (rowId) {
                removeRevisionActivityAttachmentDraft(rowId);
            }
            return;
        }

        const removeExistingBtn = event.target.closest('[data-remove-revision-existing-attachment]');
        if (removeExistingBtn) {
            markRevisionActivityAttachmentRemoved(Number(removeExistingBtn.dataset.removeRevisionExistingAttachment));
            return;
        }

        const previewImg = event.target.closest('.revision-activity-attachment-item__preview');
        if (previewImg?.dataset.revisionAttachmentStoragePath) {
            openRevisionActivityAttachmentPreview(
                previewImg.dataset.revisionAttachmentStoragePath,
                previewImg.getAttribute('alt') || 'Imagem'
            );
        }
    });

    document.getElementById('revision-activity-image-input')?.addEventListener('change', event => {
        handleRevisionActivityImageSelect(event.target.files);
        event.target.value = '';
        revisionActivityImageTargetRowId = null;
    });

    document.addEventListener('click', event => {
        const thumb = event.target.closest('[data-open-revision-attachment-storage-path]');
        if (!thumb) return;

        openRevisionActivityAttachmentPreview(
            thumb.dataset.openRevisionAttachmentStoragePath,
            thumb.getAttribute('title') || 'Imagem'
        );
    });
}
