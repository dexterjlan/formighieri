const DRIVE_FILE_CHUNK_BYTES = 4 * 1024 * 1024;
const DRIVE_FILE_DIRECT_MAX_BYTES = 8 * 1024 * 1024;

const DRIVE_FILE_FOLDER_KIND = {
    DETAILING: 'detailing',
    REVISION: 'revision',
    REQUEST: 'request'
};

const DRIVE_FILE_ENTITY_TYPE = {
    DETAILING: 'Detailing',
    REVISION_ACTIVITY: 'RevisionActivity',
    ORDER_REQUEST: 'OrderRequest',
    ORDER_REQUEST_ACTIVITY: 'OrderRequestActivity'
};

const DRIVE_FILE_FOLDER_NAMES = {
    [DRIVE_FILE_FOLDER_KIND.DETAILING]: 'detalhamento',
    [DRIVE_FILE_FOLDER_KIND.REVISION]: 'revisao',
    [DRIVE_FILE_FOLDER_KIND.REQUEST]: 'requisicao'
};

const DRIVE_FILE_MAX_BYTES = 100 * 1024 * 1024;
const DRIVE_FILE_DOCUMENT_EXTENSIONS = ['pdf', 'zip'];
const DRIVE_FILE_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];
const DRIVE_FILE_ALLOWED_EXTENSIONS = DRIVE_FILE_DOCUMENT_EXTENSIONS;
const DRIVE_FILE_INPUT_ACCEPT = '.pdf,.zip,application/pdf,application/zip';
const DRIVE_FILE_IMAGE_INPUT_ACCEPT = 'image/*';
const DRIVE_FILE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DRIVE_FILE_REVISION_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const DRIVE_FILE_SELECT = [
    'id',
    'driveFileId',
    'driveFolderId',
    'fileName',
    'mimeType',
    'fileSizeBytes',
    'url',
    'ingestStatus',
    'ingestError',
    'folderKind',
    'entityType',
    'entityId',
    'orderId',
    'orderProjectId',
    'folderPath',
    'createdAt',
    'updatedAt'
].join(', ');

function isGoogleDriveAppsScriptConfigured() {
    return Boolean(
        typeof GOOGLE_APPS_SCRIPT_URL === 'string' && GOOGLE_APPS_SCRIPT_URL
        && typeof NOTIFICATION_SCRIPT_SECRET === 'string' && NOTIFICATION_SCRIPT_SECRET
    );
}

function getDriveFileExtension(fileName) {
    const name = String(fileName || '');
    const dot = name.lastIndexOf('.');
    if (dot < 0) return '';
    return name.slice(dot + 1).toLowerCase();
}

function isImageDriveFolderKind(folderKind) {
    return folderKind === DRIVE_FILE_FOLDER_KIND.REQUEST
        || folderKind === DRIVE_FILE_FOLDER_KIND.REVISION;
}

function allowedDriveExtensionsForFolderKind(folderKind) {
    if (isImageDriveFolderKind(folderKind)) {
        return DRIVE_FILE_IMAGE_EXTENSIONS;
    }
    return DRIVE_FILE_DOCUMENT_EXTENSIONS;
}

function maxDriveUploadBytesForFolderKind(folderKind) {
    if (folderKind === DRIVE_FILE_FOLDER_KIND.REQUEST) {
        return DRIVE_FILE_IMAGE_MAX_BYTES;
    }
    if (folderKind === DRIVE_FILE_FOLDER_KIND.REVISION) {
        return DRIVE_FILE_REVISION_IMAGE_MAX_BYTES;
    }
    return DRIVE_FILE_MAX_BYTES;
}

function isAllowedDriveUploadFileName(fileName, folderKind = DRIVE_FILE_FOLDER_KIND.DETAILING) {
    return allowedDriveExtensionsForFolderKind(folderKind).includes(getDriveFileExtension(fileName));
}

function mimeTypeForDriveUpload(fileName, mimeType) {
    const ext = getDriveFileExtension(fileName);
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'zip') return 'application/zip';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'heic') return 'image/heic';
    if (ext === 'heif') return 'image/heif';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    return String(mimeType || 'application/octet-stream');
}

function sanitizeDriveUploadFileName(fileName, folderKind = DRIVE_FILE_FOLDER_KIND.DETAILING) {
    const base = String(fileName || 'arquivo')
        .trim()
        .replace(/[^\w.\-() ]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 120);
    const safe = base || 'arquivo';
    const ext = getDriveFileExtension(safe);
    if (allowedDriveExtensionsForFolderKind(folderKind).includes(ext)) return safe;
    return `${safe}.bin`;
}

function validateDriveUploadFiles(files, folderKind = DRIVE_FILE_FOLDER_KIND.DETAILING) {
    const list = Array.from(files || []);
    const allowed = allowedDriveExtensionsForFolderKind(folderKind);
    const maxBytes = maxDriveUploadBytesForFolderKind(folderKind);
    const invalidType = list.find(file => !allowed.includes(getDriveFileExtension(file?.name)));
    if (invalidType) {
        if (isImageDriveFolderKind(folderKind)) {
            return `O arquivo "${invalidType.name}" não é permitido. Use uma imagem (JPEG, PNG, WebP, GIF ou HEIC).`;
        }
        return `O arquivo "${invalidType.name}" não é permitido. Envie apenas PDF ou ZIP.`;
    }
    const tooLarge = list.find(file => Number(file?.size) > maxBytes);
    if (tooLarge) {
        if (folderKind === DRIVE_FILE_FOLDER_KIND.REVISION) {
            return `A imagem "${tooLarge.name}" deve ter no máximo 2 MB.`;
        }
        if (folderKind === DRIVE_FILE_FOLDER_KIND.REQUEST) {
            return `A imagem "${tooLarge.name}" deve ter no máximo 10 MB.`;
        }
        return `O arquivo "${tooLarge.name}" passa de 100 MB. Envie arquivos menores.`;
    }
    return '';
}

function driveFolderLeafName(folderKind) {
    return DRIVE_FILE_FOLDER_NAMES[folderKind] || String(folderKind || '').trim() || 'arquivos';
}

function getDriveRootFolderName() {
    return window.FORMIGHIERI_APP_ENV === 'dev' ? 'FGP-DEV' : 'FGP';
}

function buildDriveFolderPath(orderCode, projectName, folderKind) {
    return [
        getDriveRootFolderName(),
        String(orderCode || '').trim(),
        String(projectName || '').trim(),
        driveFolderLeafName(folderKind)
    ].filter(Boolean).join(' / ');
}

function formatDriveFileSize(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isDriveFileTableMissingError(error) {
    const message = String(error?.message || '');
    return message.includes('DriveFile')
        || message.includes('schema cache')
        || error?.code === '42P01'
        || error?.code === 'PGRST205';
}

function driveFileMissingSetupMessage(error) {
    if (isDriveFileTableMissingError(error)) {
        return 'Execute no SQL Editor (DEV): supabase/feats/create-drive-file.sql';
    }
    return error?.message || 'Erro ao enviar arquivo.';
}

function postGoogleDriveAction(payload) {
    if (!isGoogleDriveAppsScriptConfigured()) {
        return Promise.reject(new Error('Drive não configurado no Apps Script.'));
    }
    return fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            secret: NOTIFICATION_SCRIPT_SECRET,
            environment: typeof FORMIGHIERI_APP_ENV === 'string' ? FORMIGHIERI_APP_ENV : 'prod',
            createdById: typeof currentUser?.id !== 'undefined' ? currentUser.id : null,
            ...payload
        })
    });
}

function waitDriveMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function newDriveUploadId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fetchDriveFileRow(rowId) {
    const { data, error } = await supabaseClient
        .from('DriveFile')
        .select(DRIVE_FILE_SELECT)
        .eq('id', Number(rowId))
        .maybeSingle();
    if (error) throw new Error(driveFileMissingSetupMessage(error));
    return data || null;
}

async function waitForDriveFileRow(rowId, isDone, timeoutMs = 90000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const row = await fetchDriveFileRow(rowId);
        if (!row) throw new Error('Registro do arquivo não encontrado.');
        if (row.ingestStatus === 'error') {
            throw new Error(row.ingestError || 'Falha no Drive');
        }
        if (isDone(row)) return row;
        await waitDriveMs(800);
    }
    throw new Error('Tempo esgotado ao enviar ao Drive. Verifique se o Web App foi republicado.');
}

function readBlobAsBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            resolve(result.replace(/^data:[^;]+;base64,/, ''));
        };
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
        reader.readAsDataURL(blob);
    });
}

async function fetchDriveFiles({ entityType, entityId, folderKind } = {}) {
    const type = String(entityType || '').trim();
    const id = Number(entityId);
    if (!type || !id) return [];

    let query = supabaseClient
        .from('DriveFile')
        .select(DRIVE_FILE_SELECT)
        .eq('entityType', type)
        .eq('entityId', id)
        .not('driveFileId', 'is', null);

    if (folderKind) {
        query = query.eq('folderKind', folderKind);
    }

    const { data, error } = await query.order('fileName');
    if (error) throw new Error(driveFileMissingSetupMessage(error));
    return Array.isArray(data) ? data : [];
}

async function findDriveFileByName({ entityType, entityId, folderKind, fileName } = {}) {
    const { data, error } = await supabaseClient
        .from('DriveFile')
        .select(DRIVE_FILE_SELECT)
        .eq('entityType', entityType)
        .eq('entityId', entityId)
        .eq('folderKind', folderKind)
        .eq('fileName', fileName)
        .order('id', { ascending: false })
        .limit(1);

    if (error) throw new Error(driveFileMissingSetupMessage(error));
    return Array.isArray(data) && data[0] ? data[0] : null;
}

function resolveDriveFileDownloadUrl(file) {
    return String(file?.url || '');
}

function driveFileGoogleusercontentUrl(driveFileId, size = '') {
    const id = encodeURIComponent(String(driveFileId || '').trim());
    if (!id) return '';
    return size
        ? `https://lh3.googleusercontent.com/d/${id}=w${size}`
        : `https://lh3.googleusercontent.com/d/${id}`;
}

function resolveDriveFileViewUrl(file) {
    const driveFileId = String(file?.driveFileId || '').trim();
    if (driveFileId) {
        return driveFileGoogleusercontentUrl(driveFileId);
    }
    const url = String(file?.url || '');
    if (url.includes('export=download')) {
        return url.replace('export=download', 'export=view');
    }
    return url;
}

function getDriveFilePreviewCandidates(file) {
    const driveFileId = String(file?.driveFileId || '').trim();
    const candidates = [];
    if (driveFileId) {
        candidates.push(driveFileGoogleusercontentUrl(driveFileId, 1000));
        candidates.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w1000`);
        candidates.push(`https://drive.google.com/uc?export=view&id=${encodeURIComponent(driveFileId)}`);
    }
    const url = String(file?.url || '').trim();
    if (url) {
        const viewUrl = url.includes('export=download')
            ? url.replace('export=download', 'export=view')
            : url;
        if (!candidates.includes(viewUrl)) {
            candidates.push(viewUrl);
        }
    }
    return candidates;
}

function resolveDriveFilePreviewUrl(file) {
    return getDriveFilePreviewCandidates(file)[0] || '';
}

function driveFilePreviewImgAttrs(file) {
    const candidates = getDriveFilePreviewCandidates(file);
    const previewUrl = candidates[0] || '';
    const fallbacks = candidates.slice(1);
    const openUrl = resolveDriveFileViewUrl(file) || previewUrl;
    const parts = [
        `src="${escapeHtml(previewUrl)}"`,
        'referrerpolicy="no-referrer"',
        `data-attachment-drive-url="${escapeHtml(openUrl)}"`
    ];
    if (fallbacks.length) {
        parts.push(`data-drive-preview-fallback="${escapeHtml(fallbacks.join('|'))}"`);
    }
    return parts.join(' ');
}

function handleDrivePreviewImageError(event) {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.drivePreviewFallback) return;

    const rest = String(img.dataset.drivePreviewFallback).split('|').filter(Boolean);
    if (!rest.length) {
        delete img.dataset.drivePreviewFallback;
        return;
    }

    img.dataset.drivePreviewFallback = rest.slice(1).join('|');
    img.src = rest[0];
}

document.addEventListener('error', handleDrivePreviewImageError, true);

async function fetchDriveFilesByEntityIds({ entityType, entityIds = [], folderKind } = {}) {
    const type = String(entityType || '').trim();
    const ids = [...new Set((entityIds || []).map(Number).filter(Boolean))];
    if (!type || !ids.length) return {};

    let query = supabaseClient
        .from('DriveFile')
        .select(DRIVE_FILE_SELECT)
        .eq('entityType', type)
        .in('entityId', ids)
        .not('driveFileId', 'is', null);

    if (folderKind) {
        query = query.eq('folderKind', folderKind);
    }

    const { data, error } = await query.order('id', { ascending: true });
    if (error) throw new Error(driveFileMissingSetupMessage(error));

    const byEntity = {};
    (data || []).forEach(item => {
        const key = String(item.entityId);
        if (!byEntity[key]) byEntity[key] = item;
    });
    return byEntity;
}

async function findDriveFileForEntity({ entityType, entityId, folderKind } = {}) {
    const { data, error } = await supabaseClient
        .from('DriveFile')
        .select(DRIVE_FILE_SELECT)
        .eq('entityType', entityType)
        .eq('entityId', Number(entityId))
        .eq('folderKind', folderKind)
        .order('id', { ascending: false })
        .limit(1);

    if (error) throw new Error(driveFileMissingSetupMessage(error));
    return Array.isArray(data) && data[0] ? data[0] : null;
}

async function upsertPendingDriveFile(fileName, mimeType, fileSizeBytes, context = {}) {
    const existing = context.replaceByEntity
        ? await findDriveFileForEntity({
            entityType: context.entityType,
            entityId: context.entityId,
            folderKind: context.folderKind
        })
        : await findDriveFileByName({
            entityType: context.entityType,
            entityId: context.entityId,
            folderKind: context.folderKind,
            fileName
        });

    const payload = {
        fileName,
        mimeType,
        fileSizeBytes,
        folderKind: context.folderKind,
        entityType: context.entityType,
        entityId: Number(context.entityId),
        orderId: context.orderId || null,
        orderProjectId: context.orderProjectId || null,
        folderPath: context.folderPath || buildDriveFolderPath(
            context.orderCode,
            context.projectName,
            context.folderKind
        ),
        ingestStatus: 'pending',
        ingestError: 'uploading:0',
        updatedAt: new Date().toISOString()
    };

    let query;
    if (existing?.id) {
        query = supabaseClient
            .from('DriveFile')
            .update(payload)
            .eq('id', existing.id)
            .select(DRIVE_FILE_SELECT)
            .single();
    } else {
        query = supabaseClient
            .from('DriveFile')
            .insert({
                ...payload,
                createdById: typeof currentUser?.id !== 'undefined' ? currentUser.id : null
            })
            .select(DRIVE_FILE_SELECT)
            .single();
    }

    const { data, error } = await query;
    if (error) throw new Error(driveFileMissingSetupMessage(error));
    return { row: data, previousDriveFileId: existing?.driveFileId || null };
}

async function saveDriveFileUpload(file, context = {}, onProgress) {
    const fileName = sanitizeDriveUploadFileName(
        context.fileName || file.name,
        context.folderKind
    );
    const mimeType = mimeTypeForDriveUpload(file.name, file.type);
    const fileSizeBytes = Number(file.size) || 0;
    const { row, previousDriveFileId } = await upsertPendingDriveFile(
        fileName,
        mimeType,
        fileSizeBytes,
        context
    );
    const driveContext = {
        folderKind: context.folderKind,
        orderCode: context.orderCode,
        projectName: context.projectName,
        fileName,
        mimeType,
        fileSizeBytes,
        driveFileRowId: row.id,
        previousDriveFileId
    };

    if (typeof onProgress === 'function') onProgress(0, fileSizeBytes);

    if (fileSizeBytes <= DRIVE_FILE_DIRECT_MAX_BYTES) {
        const contentBase64 = await readBlobAsBase64(file);
        await postGoogleDriveAction({
            action: 'drive_upload',
            ...driveContext,
            contentBase64
        });
        const ready = await waitForDriveFileRow(
            row.id,
            item => item.ingestStatus === 'ready' && item.driveFileId,
            90000
        );
        if (typeof onProgress === 'function') onProgress(fileSizeBytes, fileSizeBytes);
        return ready;
    }

    const uploadId = newDriveUploadId();
    await postGoogleDriveAction({
        action: 'drive_start',
        uploadId,
        ...driveContext
    });
    await waitForDriveFileRow(
        row.id,
        item => String(item.ingestError || '') === 'session:ready',
        45000
    );

    let offset = 0;
    while (offset < fileSizeBytes) {
        if (typeof onProgress === 'function') onProgress(offset, fileSizeBytes);
        const end = Math.min(offset + DRIVE_FILE_CHUNK_BYTES, fileSizeBytes);
        const expectedOffset = end;
        const contentBase64 = await readBlobAsBase64(file.slice(offset, end));
        await postGoogleDriveAction({
            action: 'drive_chunk',
            uploadId,
            driveFileRowId: row.id,
            start: offset,
            contentBase64
        });
        const updated = await waitForDriveFileRow(
            row.id,
            item => item.ingestStatus === 'ready'
                || String(item.ingestError || '') === `uploading:${expectedOffset}`,
            90000
        );
        if (updated.ingestStatus === 'ready') {
            if (typeof onProgress === 'function') onProgress(fileSizeBytes, fileSizeBytes);
            return updated;
        }
        offset = expectedOffset;
    }

    const ready = await waitForDriveFileRow(
        row.id,
        item => item.ingestStatus === 'ready' && item.driveFileId,
        30000
    );
    if (typeof onProgress === 'function') onProgress(fileSizeBytes, fileSizeBytes);
    return ready;
}

async function deleteDriveFileRecord(file) {
    if (!file?.id) return;

    const driveFileId = String(file.driveFileId || '').trim();
    if (driveFileId && isGoogleDriveAppsScriptConfigured()) {
        try {
            await postGoogleDriveAction({
                action: 'drive_delete',
                driveFileId,
                driveFileRowId: file.id
            });
        } catch (error) {
            console.warn('deleteDriveFileRecord drive_delete:', error);
        }
    }

    const { error } = await supabaseClient
        .from('DriveFile')
        .delete()
        .eq('id', file.id);

    if (error) {
        throw new Error(driveFileMissingSetupMessage(error));
    }
}

window.DRIVE_FILE_FOLDER_KIND = DRIVE_FILE_FOLDER_KIND;
window.DRIVE_FILE_ENTITY_TYPE = DRIVE_FILE_ENTITY_TYPE;
window.DRIVE_FILE_MAX_BYTES = DRIVE_FILE_MAX_BYTES;
window.DRIVE_FILE_IMAGE_MAX_BYTES = DRIVE_FILE_IMAGE_MAX_BYTES;
window.DRIVE_FILE_INPUT_ACCEPT = DRIVE_FILE_INPUT_ACCEPT;
window.DRIVE_FILE_IMAGE_INPUT_ACCEPT = DRIVE_FILE_IMAGE_INPUT_ACCEPT;
window.isGoogleDriveAppsScriptConfigured = isGoogleDriveAppsScriptConfigured;
window.buildDriveFolderPath = buildDriveFolderPath;
window.formatDriveFileSize = formatDriveFileSize;
window.validateDriveUploadFiles = validateDriveUploadFiles;
window.fetchDriveFiles = fetchDriveFiles;
window.fetchDriveFilesByEntityIds = fetchDriveFilesByEntityIds;
window.resolveDriveFileDownloadUrl = resolveDriveFileDownloadUrl;
window.resolveDriveFileViewUrl = resolveDriveFileViewUrl;
window.resolveDriveFilePreviewUrl = resolveDriveFilePreviewUrl;
window.driveFilePreviewImgAttrs = driveFilePreviewImgAttrs;
window.saveDriveFileUpload = saveDriveFileUpload;
window.deleteDriveFileRecord = deleteDriveFileRecord;
