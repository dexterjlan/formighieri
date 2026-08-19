const THIRD_PARTY_REVISION_ATTACHMENTS_BUCKET = 'third-party-revision-attachments';
const THIRD_PARTY_REVISION_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
const THIRD_PARTY_REVISION_ATTACHMENT_SIGNED_URL_TTL = 3600;

const THIRD_PARTY_REVISION_ATTACHMENT_ALLOWED_TYPES = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'
]);

let thirdPartyRevisionAttachmentDraftCounter = 0;
let thirdPartyRevisionAttachmentDrafts = new Map();
let thirdPartyRevisionAttachmentExisting = new Map();
let thirdPartyRevisionAttachmentRemovedIds = new Set();
let thirdPartyRevisionImageTargetRowId = null;
const thirdPartyRevisionAttachmentUrlCache = new Map();

function buildThirdPartyRevisionAttachmentStoragePath(revisionId, activityId, fileName) {
    const env = window.FORMIGHIERI_APP_ENV === 'prod' ? 'prod' : 'dev';
    const safeName = String(fileName || 'imagem').trim().replace(/[^\w.\-() ]+/g, '_').slice(0, 120) || 'imagem';
    const unique = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${env}/third-party/${revisionId}/${activityId}/${unique}-${safeName}`;
}

function isThirdPartyRevisionAttachmentImage(file) {
    if (!file) return false;
    const mime = String(file.type || '').toLowerCase();
    return mime.startsWith('image/') && (
        THIRD_PARTY_REVISION_ATTACHMENT_ALLOWED_TYPES.has(mime) || mime === 'image/pjpeg'
    );
}

function migrateThirdPartyRevisionAttachmentDrafts(fromRowId, toRowId) {
    const fromKey = String(fromRowId);
    const toKey = String(toRowId);
    if (fromKey === toKey) return;
    const draft = thirdPartyRevisionAttachmentDrafts.get(fromKey);
    if (!draft) {
        thirdPartyRevisionAttachmentDrafts.delete(fromKey);
        return;
    }
    thirdPartyRevisionAttachmentDrafts.set(toKey, draft);
    thirdPartyRevisionAttachmentDrafts.delete(fromKey);
}

function resetThirdPartyRevisionAttachments() {
    thirdPartyRevisionAttachmentDrafts.forEach(draft => {
        if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    });
    thirdPartyRevisionAttachmentDraftCounter = 0;
    thirdPartyRevisionAttachmentDrafts = new Map();
    thirdPartyRevisionAttachmentExisting = new Map();
    thirdPartyRevisionAttachmentRemovedIds = new Set();
    thirdPartyRevisionImageTargetRowId = null;
}

function getThirdPartyRevisionImageForRow(rowId) {
    const key = String(rowId);
    const existingRaw = thirdPartyRevisionAttachmentExisting.get(key) || null;
    const existing = existingRaw && !thirdPartyRevisionAttachmentRemovedIds.has(existingRaw.id) ? existingRaw : null;
    const draft = thirdPartyRevisionAttachmentDrafts.get(key) || null;
    return { existing, draft };
}

function hasThirdPartyRevisionImage(rowId) {
    const { existing, draft } = getThirdPartyRevisionImageForRow(rowId);
    return Boolean(existing || draft);
}

function migrateThirdPartyRevisionAttachmentDrafts(fromRowId, toRowId) {
    const fromKey = String(fromRowId);
    const toKey = String(toRowId);
    if (fromKey === toKey) return;
    const draft = thirdPartyRevisionAttachmentDrafts.get(fromKey);
    if (!draft) {
        thirdPartyRevisionAttachmentDrafts.delete(fromKey);
        return;
    }
    thirdPartyRevisionAttachmentDrafts.set(toKey, draft);
    thirdPartyRevisionAttachmentDrafts.delete(fromKey);
}

function renderThirdPartyRevisionAttachmentsHtml(rowId, canEdit) {
    const { existing, draft } = getThirdPartyRevisionImageForRow(rowId);
    const visibleItem = draft || existing;
    const imageHtml = visibleItem ? (draft ? `
        <div class="revision-activity-attachment-item">
            <div class="revision-activity-attachment-item__preview-wrap">
                <img src="${draft.previewUrl}" alt="${escapeHtml(draft.file.name)}" class="revision-activity-attachment-item__preview">
            </div>
            ${canEdit ? `<button type="button" class="revision-activity-attachment-item__remove" data-remove-tp-revision-draft="${draft.tempId}">×</button>` : ''}
        </div>
    ` : `
        <div class="revision-activity-attachment-item">
            <div class="revision-activity-attachment-item__preview-wrap">
                <img alt="${escapeHtml(existing.fileName || 'Imagem')}" class="revision-activity-attachment-item__preview"
                    data-tp-revision-attachment-path="${escapeHtml(existing.storagePath)}">
            </div>
            ${canEdit ? `<button type="button" class="revision-activity-attachment-item__remove" data-remove-tp-revision-existing="${existing.id}">×</button>` : ''}
        </div>
    `) : '';

    return `
        <div class="revision-activity-attachments" data-tp-revision-activity-row-id="${escapeHtml(String(rowId))}">
            ${visibleItem ? `<div class="revision-activity-attachments__list">${imageHtml}</div>` : ''}
            ${canEdit && !visibleItem ? `<button type="button" class="revision-activity-attachments__add-btn" data-add-tp-revision-image="${escapeHtml(String(rowId))}">+ Imagem</button>` : (visibleItem ? '' : '<span class="revision-activity-attachments__empty">—</span>')}
        </div>
    `;
}

function refreshThirdPartyRevisionAttachmentsForRow(rowId) {
    const tr = document.querySelector(`#third-party-revision-activities-list tr[data-row-id="${CSS.escape(String(rowId))}"]`);
    if (!tr) return;
    const container = tr.querySelector('.revision-activity-attachments');
    if (!container) return;
    const canEdit = typeof canEditThirdPartyRevisionActivityFields === 'function'
        && canEditThirdPartyRevisionActivityFields();
    container.outerHTML = renderThirdPartyRevisionAttachmentsHtml(rowId, canEdit);
    hydrateThirdPartyRevisionAttachmentPreviews(tr);
}

async function hydrateThirdPartyRevisionAttachmentPreviews(root = document) {
    const images = root.querySelectorAll('img[data-tp-revision-attachment-path]');
    await Promise.all([...images].map(async img => {
        const storagePath = img.dataset.tpRevisionAttachmentPath;
        if (!storagePath || img.dataset.tpRevisionAttachmentHydrated === '1') return;
        const { data, error } = await supabaseClient.storage
            .from(THIRD_PARTY_REVISION_ATTACHMENTS_BUCKET)
            .createSignedUrl(storagePath, THIRD_PARTY_REVISION_ATTACHMENT_SIGNED_URL_TTL);
        if (error || !data?.signedUrl) return;
        img.src = data.signedUrl;
        img.dataset.tpRevisionAttachmentHydrated = '1';
    }));
}

async function loadThirdPartyRevisionAttachmentsForActivities(activities = []) {
    thirdPartyRevisionAttachmentExisting = new Map();
    thirdPartyRevisionAttachmentRemovedIds = new Set();
    const activityIds = activities.map(activity => Number(activity.id)).filter(Boolean);
    if (!activityIds.length) return;

    const { data, error } = await supabaseClient
        .from('RevisionActivityAttachment')
        .select('id, revisionActivityId, storagePath, fileName, mimeType, fileSizeBytes, sortOrder, createdAt')
        .in('revisionActivityId', activityIds);

    if (error?.message?.includes('RevisionActivityAttachment')) return;
    if (error) throw error;

    (data || []).forEach(item => {
        thirdPartyRevisionAttachmentExisting.set(String(item.revisionActivityId), item);
    });
}

async function persistThirdPartyRevisionAttachments(revisionId, activityIdByRowId = {}) {
    const deletedIds = new Set(thirdPartyRevisionAttachmentRemovedIds);
    for (const [activityId, attachment] of thirdPartyRevisionAttachmentExisting.entries()) {
        if (!attachment || !deletedIds.has(attachment.id)) continue;
        await supabaseClient.storage.from(THIRD_PARTY_REVISION_ATTACHMENTS_BUCKET).remove([attachment.storagePath]);
        await supabaseClient.from('RevisionActivityAttachment').delete().eq('id', attachment.id);
        thirdPartyRevisionAttachmentExisting.delete(activityId);
    }
    thirdPartyRevisionAttachmentRemovedIds.clear();

    for (const [rowId, activityId] of Object.entries(activityIdByRowId)) {
        const draft = thirdPartyRevisionAttachmentDrafts.get(String(rowId));
        if (!draft || !activityId) continue;
        const storagePath = buildThirdPartyRevisionAttachmentStoragePath(revisionId, activityId, draft.file.name);
        const { error: uploadError } = await supabaseClient.storage
            .from(THIRD_PARTY_REVISION_ATTACHMENTS_BUCKET)
            .upload(storagePath, draft.file, { cacheControl: '3600', upsert: false, contentType: draft.file.type || 'image/jpeg' });
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabaseClient
            .from('RevisionActivityAttachment')
            .insert({
                revisionActivityId: activityId,
                storagePath,
                fileName: draft.file.name,
                mimeType: draft.file.type || 'image/jpeg',
                fileSizeBytes: draft.file.size,
                sortOrder: 1,
                createdById: currentUser?.id || null
            });
        if (insertError) throw insertError;

        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
        thirdPartyRevisionAttachmentDrafts.delete(String(rowId));
    }
}

function bindThirdPartyRevisionAttachmentEvents() {
    document.getElementById('third-party-revision-activities-list')?.addEventListener('click', event => {
        const addBtn = event.target.closest('[data-add-tp-revision-image]');
        if (addBtn) {
            if (!canEditThirdPartyRevisionActivityFields()) return;
            thirdPartyRevisionImageTargetRowId = addBtn.dataset.addTpRevisionImage;
            document.getElementById('third-party-revision-activity-image-input')?.click();
            return;
        }
        const removeDraft = event.target.closest('[data-remove-tp-revision-draft]');
        if (removeDraft) {
            const rowId = removeDraft.closest('[data-tp-revision-activity-row-id]')?.dataset.tpRevisionActivityRowId;
            if (rowId) {
                const draft = thirdPartyRevisionAttachmentDrafts.get(rowId);
                if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
                thirdPartyRevisionAttachmentDrafts.delete(rowId);
                refreshThirdPartyRevisionAttachmentsForRow(rowId);
            }
        }
        const removeExisting = event.target.closest('[data-remove-tp-revision-existing]');
        if (removeExisting) {
            thirdPartyRevisionAttachmentRemovedIds.add(Number(removeExisting.dataset.removeTpRevisionExisting));
            refreshThirdPartyRevisionAttachmentsForRow(
                removeExisting.closest('[data-tp-revision-activity-row-id]')?.dataset.tpRevisionActivityRowId
            );
        }
    });

    document.getElementById('third-party-revision-activity-image-input')?.addEventListener('change', event => {
        const rowId = thirdPartyRevisionImageTargetRowId;
        const file = [...(event.target.files || [])][0];
        event.target.value = '';
        thirdPartyRevisionImageTargetRowId = null;
        if (!rowId || !file || !canEditThirdPartyRevisionActivityFields()) return;
        if (hasThirdPartyRevisionImage(rowId)) {
            alertAppDialog('Cada atividade permite apenas uma imagem.');
            return;
        }
        if (!isThirdPartyRevisionAttachmentImage(file)) {
            alertAppDialog('Use uma imagem (JPEG, PNG, WebP, GIF ou HEIC).');
            return;
        }
        if (file.size > THIRD_PARTY_REVISION_ATTACHMENT_MAX_BYTES) {
            alertAppDialog('A imagem deve ter no máximo 2 MB.');
            return;
        }
        thirdPartyRevisionAttachmentDraftCounter += 1;
        thirdPartyRevisionAttachmentDrafts.set(String(rowId), {
            tempId: `tp-draft-${thirdPartyRevisionAttachmentDraftCounter}`,
            file,
            previewUrl: URL.createObjectURL(file)
        });
        refreshThirdPartyRevisionAttachmentsForRow(rowId);
    });
}
