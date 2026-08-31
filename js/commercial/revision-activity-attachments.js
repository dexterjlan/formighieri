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
let revisionActivityImageTargetContext = null;
const revisionActivityAttachmentUrlCache = new Map();

const REVISION_ACTIVITY_ATTACHMENT_CONTEXTS = {
    commercial: {
        listSelector: '#revision-activities-list',
        fileInputId: 'revision-activity-image-input',
        resolveCanEdit(approval = null, activity = null) {
            return canEditRevisionActivityAttachments(approval, activity);
        },
        resolveApproval() {
            return typeof getCurrentApproval === 'function' ? getCurrentApproval() : null;
        }
    },
    technicalReviewer: {
        listSelector: '#tr-revision-activities-list',
        fileInputId: 'tr-revision-activity-image-input',
        resolveCanEdit() {
            return typeof canReviewerEditTechnicalReviewerRevisionDescriptions === 'function'
                && canReviewerEditTechnicalReviewerRevisionDescriptions();
        },
        resolveApproval() {
            return typeof getCurrentTechnicalReviewerProject === 'function'
                ? getCurrentTechnicalReviewerProject()
                : null;
        }
    }
};

function findRevisionActivityRowByRowId(rowId, listSelector = null) {
    const escaped = CSS.escape(String(rowId));
    if (listSelector) {
        return document.querySelector(`${listSelector} tr[data-row-id="${escaped}"]`);
    }
    return document.querySelector(`#revision-activities-list tr[data-row-id="${escaped}"]`)
        || document.querySelector(`#tr-revision-activities-list tr[data-row-id="${escaped}"]`);
}

function getRevisionActivityAttachmentContextForRow(rowId) {
    const tr = findRevisionActivityRowByRowId(rowId);
    if (tr?.closest('#tr-revision-activities-list')) {
        return REVISION_ACTIVITY_ATTACHMENT_CONTEXTS.technicalReviewer;
    }
    return REVISION_ACTIVITY_ATTACHMENT_CONTEXTS.commercial;
}

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

function canEditRevisionActivityAttachments(approval = null, activity = null) {
    const resolvedApproval = approval
        || (typeof getCurrentApproval === 'function' ? getCurrentApproval() : null);
    if (revisionModalViewOnly) return false;

    if (typeof canConsultorEditExistingTecnicaRevisionActivity === 'function'
        && canConsultorEditExistingTecnicaRevisionActivity(resolvedApproval, activity)) {
        return true;
    }

    return typeof canEditRevisionActivitiesConsultor === 'function'
        && canEditRevisionActivitiesConsultor(resolvedApproval);
}

function isRevisionDriveAttachment(item) {
    return Boolean(item && (item.driveFileId || item.entityType === 'RevisionActivity'));
}

function revisionAttachmentRemovalKey(item) {
    if (!item?.id) return '';
    return `${isRevisionDriveAttachment(item) ? 'drive' : 'storage'}:${item.id}`;
}

function revisionAttachmentPreviewAttrs(item, storageAttr = 'data-revision-attachment-storage-path') {
    if (isRevisionDriveAttachment(item)) {
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
    return `${storageAttr}="${escapeHtml(item.storagePath || '')}"`;
}

async function resolveRevisionDriveFolderContext() {
    let orderId = null;
    let orderProjectId = null;
    let orderCode = '';
    let projectName = '';

    const approval = typeof getCurrentApproval === 'function' ? getCurrentApproval() : null;
    if (approval) {
        orderProjectId = Number(approval.orderProjectId || approval.id) || null;
        orderId = Number(approval.orderId || approval.order?.id || 0) || null;
        projectName = typeof getCommercialApprovalProjectName === 'function'
            ? getCommercialApprovalProjectName(approval)
            : (approval.orderProject?.name || '');
        orderCode = approval.order?.orderCode || '';
    }

    const reviewerProject = typeof getCurrentTechnicalReviewerProject === 'function'
        ? getCurrentTechnicalReviewerProject()
        : null;
    if (reviewerProject) {
        orderProjectId = orderProjectId || Number(reviewerProject.id) || null;
        orderId = orderId || Number(reviewerProject.orderId || reviewerProject.order?.id || 0) || null;
        projectName = projectName || reviewerProject.name || '';
        orderCode = orderCode || reviewerProject.order?.orderCode || '';
    }

    const thirdPartyProject = typeof getCurrentThirdPartyRevisionProject === 'function'
        ? getCurrentThirdPartyRevisionProject()
        : null;
    if (thirdPartyProject) {
        orderId = orderId || Number(thirdPartyProject.orderId || thirdPartyProject.order?.id || 0) || null;
        projectName = projectName || thirdPartyProject.name || '';
        orderCode = orderCode || thirdPartyProject.order?.orderCode || '';
    }

    if (!orderCode && orderId && typeof ordersCache !== 'undefined') {
        orderCode = ordersCache.find(order => Number(order.id) === Number(orderId))?.orderCode || '';
    }
    if (!orderCode && orderId) {
        const { data, error } = await supabaseClient
            .from('salesOrders')
            .select('orderCode')
            .eq('id', orderId)
            .maybeSingle();
        if (error) throw error;
        orderCode = data?.orderCode || '';
    }

    if (!projectName && orderProjectId) {
        if (typeof orderProjectsCache !== 'undefined') {
            projectName = orderProjectsCache.find(project => Number(project.id) === Number(orderProjectId))?.name || '';
        }
        if (!projectName) {
            const { data, error } = await supabaseClient
                .from('OrderProject')
                .select('name, orderId')
                .eq('id', orderProjectId)
                .maybeSingle();
            if (error) throw error;
            projectName = data?.name || '';
            orderId = orderId || Number(data?.orderId || 0) || null;
        }
    }

    if (!orderCode || !projectName) {
        throw new Error('Não foi possível identificar o pedido e o projeto para o Drive.');
    }

    return {
        folderKind: DRIVE_FILE_FOLDER_KIND.REVISION,
        entityType: DRIVE_FILE_ENTITY_TYPE.REVISION_ACTIVITY,
        orderId,
        orderProjectId,
        orderCode,
        projectName,
        folderPath: buildDriveFolderPath(orderCode, projectName, DRIVE_FILE_FOLDER_KIND.REVISION),
        replaceByEntity: true
    };
}

function updateRevisionImageUploadProgress(sent, total) {
    if (!total) return;
    const pct = Math.min(100, Math.round((sent / total) * 100));
    const message = `Enviando imagem da atividade (${pct}%)...`;
    const pairs = [
        ['commercial-revision-loading', typeof setCommercialRevisionModalLoading === 'function' ? setCommercialRevisionModalLoading : null],
        ['technical-reviewer-revision-loading', typeof setTechnicalReviewerRevisionModalLoading === 'function' ? setTechnicalReviewerRevisionModalLoading : null],
        ['third-party-revision-loading', typeof setThirdPartyRevisionModalLoading === 'function' ? setThirdPartyRevisionModalLoading : null]
    ];
    pairs.forEach(([overlayId, setter]) => {
        const overlay = document.getElementById(overlayId);
        if (!overlay || overlay.classList.contains('hidden') || typeof setter !== 'function') return;
        setter(true, message);
    });
}

async function persistRevisionDriveUploads(drafts, existing, activityIdByRowId = {}) {
    const hasDraft = Object.entries(activityIdByRowId).some(([rowId, rawActivityId]) => {
        const activityId = Number(rawActivityId);
        return Boolean(activityId && (drafts.get(String(rowId)) || drafts.get(String(activityId))));
    });
    if (!hasDraft) return;

    const folderContext = await resolveRevisionDriveFolderContext();
    const uploadedActivityIds = new Set();

    for (const [rowId, rawActivityId] of Object.entries(activityIdByRowId)) {
        const activityId = Number(rawActivityId);
        if (!activityId || uploadedActivityIds.has(activityId)) continue;

        const draft = drafts.get(String(rowId)) || drafts.get(String(activityId));
        if (!draft) continue;

        const safeName = sanitizeRevisionActivityAttachmentFileName(draft.file.name);
        const record = await saveDriveFileUpload(
            draft.file,
            {
                ...folderContext,
                entityId: activityId,
                fileName: `atividade-${activityId}-${safeName}`
            },
            updateRevisionImageUploadProgress
        );

        if (draft.previewUrl) {
            URL.revokeObjectURL(draft.previewUrl);
        }
        drafts.delete(String(rowId));
        drafts.delete(String(activityId));
        existing.set(String(activityId), record);
        uploadedActivityIds.add(activityId);
    }
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
    revisionActivityImageTargetContext = null;
}

function getRevisionActivityImageForRow(rowId) {
    const key = String(rowId);
    const existingRaw = revisionActivityAttachmentExisting.get(key) || null;
    const existing = existingRaw && !revisionActivityAttachmentRemovedIds.has(revisionAttachmentRemovalKey(existingRaw))
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

function renderRevisionActivityAttachmentsHtml(rowId, approval = null, activity = null, contextOrKey = null) {
    const resolvedContext = typeof contextOrKey === 'string'
        ? (REVISION_ACTIVITY_ATTACHMENT_CONTEXTS[contextOrKey] || getRevisionActivityAttachmentContextForRow(rowId))
        : (contextOrKey || getRevisionActivityAttachmentContextForRow(rowId));
    const canEdit = resolvedContext.resolveCanEdit(approval, activity);
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
                    ${revisionAttachmentPreviewAttrs(existing)}>
            </div>
            ${canEdit ? `
                <button type="button"
                    class="revision-activity-attachment-item__remove"
                    data-remove-revision-existing-attachment="${existing.id}"
                    data-remove-revision-existing-source="${isRevisionDriveAttachment(existing) ? 'drive' : 'storage'}"
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

function refreshRevisionActivityAttachmentsForRow(rowId, contextOrKey = null) {
    const context = typeof contextOrKey === 'string'
        ? (REVISION_ACTIVITY_ATTACHMENT_CONTEXTS[contextOrKey] || getRevisionActivityAttachmentContextForRow(rowId))
        : (contextOrKey || getRevisionActivityAttachmentContextForRow(rowId));
    const tr = findRevisionActivityRowByRowId(rowId, context?.listSelector);
    if (!tr) return;

    const container = tr.querySelector('.revision-activity-attachments');
    if (!container) return;

    const approval = context.resolveApproval();
    const completed = Boolean(
        tr.querySelector('.revision-activity-completed')?.checked
        || tr.querySelector('.tr-revision-activity-completed')?.checked
    );
    container.outerHTML = renderRevisionActivityAttachmentsHtml(rowId, approval, { completed }, context);
    hydrateRevisionActivityAttachmentPreviews(tr);
}

function refreshAllRevisionActivityAttachments() {
    Object.values(REVISION_ACTIVITY_ATTACHMENT_CONTEXTS).forEach(context => {
        document.querySelectorAll(`${context.listSelector} tr[data-row-id]`).forEach(tr => {
            refreshRevisionActivityAttachmentsForRow(tr.dataset.rowId, context);
        });
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

function markRevisionActivityAttachmentRemoved(attachmentId, source = 'storage') {
    const numericId = Number(attachmentId);
    if (!numericId) return;

    revisionActivityAttachmentRemovedIds.add(`${source === 'drive' ? 'drive' : 'storage'}:${numericId}`);
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

    if (isRevisionDriveAttachment(attachment)) {
        if (typeof deleteDriveFileRecord === 'function') {
            await deleteDriveFileRecord(attachment);
        }
        return;
    }

    const { error: storageError } = await supabaseClient.storage
        .from(REVISION_ACTIVITY_ATTACHMENTS_BUCKET)
        .remove([attachment.storagePath]);

    if (storageError) {
        console.warn('deleteRevisionActivityAttachmentRecord storage:', storageError);
    }

    const { error } = await supabaseClient
        .from('RevisionActivityAttachment')
        .delete()
        .eq('id', attachment.id);

    if (error) {
        throw error;
    }

    revisionActivityAttachmentUrlCache.delete(attachment.storagePath);
}

async function persistRevisionActivityAttachments(revisionId, activityIdByRowId = {}) {
    if (!revisionId) return { ok: true };

    try {
        const deletedKeys = new Set(revisionActivityAttachmentRemovedIds);
        for (const [activityId, attachment] of revisionActivityAttachmentExisting.entries()) {
            if (!attachment || !deletedKeys.has(revisionAttachmentRemovalKey(attachment))) continue;
            await deleteRevisionActivityAttachmentRecord(attachment);
            revisionActivityAttachmentExisting.delete(activityId);
        }
        revisionActivityAttachmentRemovedIds.clear();

        await persistRevisionDriveUploads(
            revisionActivityAttachmentDrafts,
            revisionActivityAttachmentExisting,
            activityIdByRowId
        );

        return { ok: true };
    } catch (error) {
        console.error('persistRevisionActivityAttachments:', error);
        return { ok: false, error };
    }
}

function handleRevisionActivityImageSelect(fileList, context = null) {
    const rowId = revisionActivityImageTargetRowId;
    const resolvedContext = context || revisionActivityImageTargetContext || REVISION_ACTIVITY_ATTACHMENT_CONTEXTS.commercial;
    if (!rowId || !resolvedContext.resolveCanEdit()) return;

    const file = [...(fileList || [])][0];
    if (!file) return;

    if (typeof isGoogleDriveAppsScriptConfigured === 'function' && !isGoogleDriveAppsScriptConfigured()) {
        alertAppDialog('Drive não configurado no Apps Script.', { variant: 'warning', title: 'Aviso' });
        return;
    }

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
                ${isRevisionDriveAttachment(attachment)
                    ? `data-open-revision-attachment-drive-url="${escapeHtml(
                        (typeof resolveDriveFileViewUrl === 'function'
                            ? resolveDriveFileViewUrl(attachment)
                            : (typeof resolveDriveFilePreviewUrl === 'function'
                                ? resolveDriveFilePreviewUrl(attachment)
                                : attachment.url)) || ''
                    )}"`
                    : `data-open-revision-attachment-storage-path="${escapeHtml(attachment.storagePath || '')}"`}
                title="${escapeHtml(attachment.fileName || 'Imagem')}">
                <img alt="${escapeHtml(attachment.fileName || 'Imagem')}"
                    ${revisionAttachmentPreviewAttrs(attachment)}>
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

function bindRevisionActivityAttachmentListEvents(listEl, context) {
    listEl?.addEventListener('click', event => {
        const addBtn = event.target.closest('[data-add-revision-activity-image]');
        if (addBtn) {
            if (!context.resolveCanEdit()) return;
            revisionActivityImageTargetRowId = addBtn.dataset.addRevisionActivityImage;
            revisionActivityImageTargetContext = context;
            document.getElementById(context.fileInputId)?.click();
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
            markRevisionActivityAttachmentRemoved(
                Number(removeExistingBtn.dataset.removeRevisionExistingAttachment),
                removeExistingBtn.dataset.removeRevisionExistingSource || 'storage'
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
        if (previewImg?.dataset.revisionAttachmentStoragePath) {
            openRevisionActivityAttachmentPreview(
                previewImg.dataset.revisionAttachmentStoragePath,
                previewImg.getAttribute('alt') || 'Imagem'
            );
        }
    });
}

function bindRevisionActivityAttachmentEvents() {
    bindRevisionActivityAttachmentListEvents(
        document.getElementById('revision-activities-list'),
        REVISION_ACTIVITY_ATTACHMENT_CONTEXTS.commercial
    );
    bindRevisionActivityAttachmentListEvents(
        document.getElementById('tr-revision-activities-list'),
        REVISION_ACTIVITY_ATTACHMENT_CONTEXTS.technicalReviewer
    );

    document.getElementById('revision-activity-image-input')?.addEventListener('change', event => {
        handleRevisionActivityImageSelect(event.target.files, REVISION_ACTIVITY_ATTACHMENT_CONTEXTS.commercial);
        event.target.value = '';
        revisionActivityImageTargetRowId = null;
        revisionActivityImageTargetContext = null;
    });

    document.getElementById('tr-revision-activity-image-input')?.addEventListener('change', event => {
        handleRevisionActivityImageSelect(event.target.files, REVISION_ACTIVITY_ATTACHMENT_CONTEXTS.technicalReviewer);
        event.target.value = '';
        revisionActivityImageTargetRowId = null;
        revisionActivityImageTargetContext = null;
    });

    document.addEventListener('click', event => {
        const driveThumb = event.target.closest('[data-open-revision-attachment-drive-url]');
        if (driveThumb) {
            openImageAttachmentLightbox(
                driveThumb.dataset.openRevisionAttachmentDriveUrl,
                driveThumb.getAttribute('title') || 'Imagem'
            );
            return;
        }

        const thumb = event.target.closest('[data-open-revision-attachment-storage-path]');
        if (!thumb) return;

        openRevisionActivityAttachmentPreview(
            thumb.dataset.openRevisionAttachmentStoragePath,
            thumb.getAttribute('title') || 'Imagem'
        );
    });
}
