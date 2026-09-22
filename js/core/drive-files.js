const DRIVE_FILE_CHUNK_BYTES = 4 * 1024 * 1024;
const DRIVE_FILE_DIRECT_MAX_BYTES = 8 * 1024 * 1024;

const DRIVE_FILE_FOLDER_KIND = {
    DETAILING: 'detailing',
    REVISION: 'revision',
    REQUEST: 'request',
    DESCRIPTIVE: 'descriptive',
    THIRD_PARTY: 'thirdParty',
    MODEL_3D: 'model3d'
};

const DRIVE_FILE_ENTITY_TYPE = {
    DETAILING: 'Detailing',
    REVISION_ACTIVITY: 'RevisionActivity',
    ORDER_REQUEST: 'OrderRequest',
    ORDER_REQUEST_ACTIVITY: 'OrderRequestActivity',
    SALES_ORDER: 'SalesOrder',
    THIRD_PARTY_PROJECT: 'ThirdPartyProject',
    ORDER_PROJECT: 'OrderProject'
};

const DRIVE_FILE_FOLDER_NAMES = {
    [DRIVE_FILE_FOLDER_KIND.DETAILING]: 'detalhamento',
    [DRIVE_FILE_FOLDER_KIND.REVISION]: 'revisao',
    [DRIVE_FILE_FOLDER_KIND.REQUEST]: 'requisicao',
    [DRIVE_FILE_FOLDER_KIND.DESCRIPTIVE]: 'descritivo',
    [DRIVE_FILE_FOLDER_KIND.THIRD_PARTY]: 'terceiros',
    [DRIVE_FILE_FOLDER_KIND.MODEL_3D]: '3d'
};

const DRIVE_FILE_MODEL_3D_EXTENSIONS = ['glb', 'gltf'];
const DRIVE_FILE_MODEL_3D_INPUT_ACCEPT = '.glb,.gltf,model/gltf-binary,model/gltf+json';

const DRIVE_FILE_MAX_BYTES = 100 * 1024 * 1024;
const DRIVE_FILE_DOCUMENT_EXTENSIONS = ['pdf', 'zip', 'rar'];
const DRIVE_FILE_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];
const DRIVE_FILE_ALLOWED_EXTENSIONS = DRIVE_FILE_DOCUMENT_EXTENSIONS;
const DRIVE_FILE_INPUT_ACCEPT = '.pdf,.zip,.rar,application/pdf,application/zip,application/vnd.rar,application/x-rar-compressed';
const DRIVE_FILE_IMAGE_INPUT_ACCEPT = 'image/*';
const DRIVE_FILE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DRIVE_FILE_REVISION_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const ORDER_PROJECT_MODEL_3D_BUCKET = 'order-project-model3d';
const ORDER_PROJECT_MODEL_3D_SIGNED_URL_TTL = 3600;

const DRIVE_FILE_SELECT = [
    'id',
    'driveFileId',
    'driveFolderId',
    'fileName',
    'mimeType',
    'fileSizeBytes',
    'url',
    'viewerStoragePath',
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
    if (folderKind === DRIVE_FILE_FOLDER_KIND.DESCRIPTIVE) {
        return ['pdf'];
    }
    if (folderKind === DRIVE_FILE_FOLDER_KIND.MODEL_3D) {
        return DRIVE_FILE_MODEL_3D_EXTENSIONS;
    }
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
    if (ext === 'rar') return 'application/vnd.rar';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'heic') return 'image/heic';
    if (ext === 'heif') return 'image/heif';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'glb') return 'model/gltf-binary';
    if (ext === 'gltf') return 'model/gltf+json';
    return String(mimeType || 'application/octet-stream');
}

function resolveDriveFileModel3dUrl(file) {
    const driveFileId = String(file?.driveFileId || '').trim();
    if (driveFileId) {
        return `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(driveFileId)}`;
    }
    return resolveDriveFileDownloadUrl(file);
}

function getOrderProjectModel3dStorageEnvPrefix() {
    return window.FORMIGHIERI_APP_ENV === 'prod' ? 'prod' : 'dev';
}

function buildOrderProjectModel3dViewerStoragePath(orderProjectId, fileName) {
    const env = getOrderProjectModel3dStorageEnvPrefix();
    const ext = getDriveFileExtension(fileName);
    const safeExt = DRIVE_FILE_MODEL_3D_EXTENSIONS.includes(ext) ? ext : 'glb';
    return `${env}/order-projects/${Number(orderProjectId)}/model.${safeExt}`;
}

async function mirrorModel3dViewerStorage(file, fileName, mimeType, driveFileRowId, orderProjectId) {
    const projectId = Number(orderProjectId);
    const rowId = Number(driveFileRowId);
    if (!projectId || !rowId) return null;

    const storagePath = buildOrderProjectModel3dViewerStoragePath(projectId, fileName);
    const { error: uploadError } = await supabaseClient.storage
        .from(ORDER_PROJECT_MODEL_3D_BUCKET)
        .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: mimeType || 'application/octet-stream'
        });
    if (uploadError) throw uploadError;

    const { error: updateError } = await supabaseClient
        .from('DriveFile')
        .update({
            viewerStoragePath: storagePath,
            updatedAt: new Date().toISOString()
        })
        .eq('id', rowId);
    if (updateError) throw updateError;
    return storagePath;
}

function resolveModel3dViewerStoragePath(file) {
    const explicit = String(file?.viewerStoragePath || '').trim();
    if (explicit) return explicit;
    const orderProjectId = Number(file?.orderProjectId);
    const fileName = file?.fileName;
    if (!orderProjectId || !fileName) return '';
    return buildOrderProjectModel3dViewerStoragePath(orderProjectId, fileName);
}

async function fetchView3dModelBlobFromDriveFile(file) {
    const storagePath = resolveModel3dViewerStoragePath(file);
    if (!storagePath) {
        throw new Error(
            'Visualização indisponível. Um admin deve enviar o modelo novamente na tela 3D.'
        );
    }

    const { data, error } = await supabaseClient.storage
        .from(ORDER_PROJECT_MODEL_3D_BUCKET)
        .createSignedUrl(storagePath, ORDER_PROJECT_MODEL_3D_SIGNED_URL_TTL);
    if (error || !data?.signedUrl) {
        throw new Error(error?.message || 'Não foi possível abrir o modelo (Storage).');
    }

    const response = await fetch(data.signedUrl);
    if (!response.ok) {
        throw new Error(`Falha ao baixar o modelo (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    if (!blob.size) {
        throw new Error('Arquivo 3D vazio. Envie o modelo novamente.');
    }
    return URL.createObjectURL(blob);
}

function revokeView3dModelBlobUrl(viewer) {
    if (!viewer) return;
    const blobUrl = String(viewer.dataset.blobUrl || '').trim();
    if (!blobUrl) return;
    try {
        URL.revokeObjectURL(blobUrl);
    } catch (_) { /* ignore */ }
    delete viewer.dataset.blobUrl;
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

const DESCRIPTIVE_DRIVE_FILE_NAME_MAX_LENGTH = 80;

function stripDiacriticsForDriveFileName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function sanitizeDescriptiveClientFileSlug(clientName) {
    return stripDiacriticsForDriveFileName(clientName)
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^\w.\-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

function buildDescriptiveDriveFileName(orderCode, clientName, maxLength = DESCRIPTIVE_DRIVE_FILE_NAME_MAX_LENGTH) {
    const ext = '.pdf';
    const order = String(orderCode || '').trim().replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_') || 'Pedido';
    let client = sanitizeDescriptiveClientFileSlug(clientName) || 'Cliente';

    const assemble = (ord, cli) => `Descritivo-${ord}-${cli}${ext}`;

    let ord = order;
    let cli = client;
    let name = assemble(ord, cli);

    while (name.length > maxLength && cli.length > 1) {
        cli = cli.slice(0, -1);
        name = assemble(ord, cli);
    }
    while (name.length > maxLength && ord.length > 1) {
        ord = ord.slice(0, -1);
        name = assemble(ord, cli);
    }
    if (name.length > maxLength) {
        name = `${name.slice(0, maxLength - ext.length)}${ext}`;
    }
    return name;
}

function validateDriveUploadFiles(files, folderKind = DRIVE_FILE_FOLDER_KIND.DETAILING) {
    const list = Array.from(files || []);
    const allowed = allowedDriveExtensionsForFolderKind(folderKind);
    const maxBytes = maxDriveUploadBytesForFolderKind(folderKind);
    const invalidType = list.find(file => !allowed.includes(getDriveFileExtension(file?.name)));
    if (invalidType) {
        if (folderKind === DRIVE_FILE_FOLDER_KIND.DESCRIPTIVE) {
            return `O arquivo "${invalidType.name}" não é permitido. Envie apenas PDF.`;
        }
        if (isImageDriveFolderKind(folderKind)) {
            return `O arquivo "${invalidType.name}" não é permitido. Use uma imagem (JPEG, PNG, WebP, GIF ou HEIC).`;
        }
        if (folderKind === DRIVE_FILE_FOLDER_KIND.MODEL_3D) {
            return `O arquivo "${invalidType.name}" não é permitido. Envie apenas GLB ou GLTF.`;
        }
        return `O arquivo "${invalidType.name}" não é permitido. Envie apenas PDF, ZIP ou RAR.`;
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

/** ID do arquivo a partir de driveFileId ou URL salva (uc, file/d, etc.). */
function extractGoogleDriveFileId(source) {
    const fromField = String(
        source && typeof source === 'object' ? source.driveFileId : ''
    ).trim();
    if (fromField) return fromField;

    const url = String(
        source && typeof source === 'object' ? source.url : source
    ).trim();
    if (!url) return '';

    const fromQuery = url.match(/[?&]id=([^&]+)/i);
    if (fromQuery) return decodeURIComponent(fromQuery[1]);

    const fromPath = url.match(/\/file\/d\/([^/?#]+)/i);
    if (fromPath) return decodeURIComponent(fromPath[1]);

    return '';
}

/** Abrir PDF no navegador (preview do Drive — evita download forçado do uc?export=view). */
function resolveDriveFilePdfBrowserOpenUrl(file) {
    const driveFileId = extractGoogleDriveFileId(file);
    if (driveFileId) {
        return `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`;
    }
    const stored = String(file?.url || '').trim();
    if (!stored) return '';
    if (/\/file\/d\/[^/?#]+\/preview/i.test(stored)) return stored;
    const pathMatch = stored.match(/^(https:\/\/drive\.google\.com\/file\/d\/[^/?#]+)/i);
    if (pathMatch) return `${pathMatch[1]}/preview`;
    if (/\/file\/d\/[^/?#]+\/view/i.test(stored)) {
        return stored.replace(/\/view(\?.*)?$/i, '/preview');
    }
    return stored;
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

async function finalizeDriveFileUploadRow(row, storageMirrorPromise, folderKind) {
    if (folderKind === DRIVE_FILE_FOLDER_KIND.MODEL_3D && storageMirrorPromise) {
        await storageMirrorPromise;
        return fetchDriveFileRow(row.id);
    }
    return row;
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

    const storageMirrorPromise = context.folderKind === DRIVE_FILE_FOLDER_KIND.MODEL_3D
        ? mirrorModel3dViewerStorage(
            file,
            fileName,
            mimeType,
            row.id,
            context.orderProjectId
        ).catch(mirrorError => {
            console.warn('mirrorModel3dViewerStorage:', mirrorError);
            return null;
        })
        : null;

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
        return finalizeDriveFileUploadRow(ready, storageMirrorPromise, context.folderKind);
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
            return finalizeDriveFileUploadRow(updated, storageMirrorPromise, context.folderKind);
        }
        offset = expectedOffset;
    }

    const ready = await waitForDriveFileRow(
        row.id,
        item => item.ingestStatus === 'ready' && item.driveFileId,
        30000
    );
    if (typeof onProgress === 'function') onProgress(fileSizeBytes, fileSizeBytes);
    return finalizeDriveFileUploadRow(ready, storageMirrorPromise, context.folderKind);
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

    const viewerPath = String(file.viewerStoragePath || '').trim();
    if (viewerPath) {
        try {
            await supabaseClient.storage
                .from(ORDER_PROJECT_MODEL_3D_BUCKET)
                .remove([viewerPath]);
        } catch (storageError) {
            console.warn('deleteDriveFileRecord model3d storage:', storageError);
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
window.buildDescriptiveDriveFileName = buildDescriptiveDriveFileName;
window.formatDriveFileSize = formatDriveFileSize;
window.validateDriveUploadFiles = validateDriveUploadFiles;
window.fetchDriveFiles = fetchDriveFiles;
window.fetchDriveFilesByEntityIds = fetchDriveFilesByEntityIds;
window.resolveDriveFileDownloadUrl = resolveDriveFileDownloadUrl;
window.extractGoogleDriveFileId = extractGoogleDriveFileId;
window.resolveDriveFilePdfBrowserOpenUrl = resolveDriveFilePdfBrowserOpenUrl;
window.resolveDriveFileModel3dUrl = resolveDriveFileModel3dUrl;
window.fetchView3dModelBlobFromDriveFile = fetchView3dModelBlobFromDriveFile;
window.revokeView3dModelBlobUrl = revokeView3dModelBlobUrl;
window.resolveDriveFileViewUrl = resolveDriveFileViewUrl;
window.resolveDriveFilePreviewUrl = resolveDriveFilePreviewUrl;
window.driveFilePreviewImgAttrs = driveFilePreviewImgAttrs;
window.saveDriveFileUpload = saveDriveFileUpload;
window.deleteDriveFileRecord = deleteDriveFileRecord;
window.findDriveFileForEntity = findDriveFileForEntity;

async function fetchSalesOrderDescriptiveDriveFile(orderId) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return null;

    return findDriveFileForEntity({
        entityType: DRIVE_FILE_ENTITY_TYPE.SALES_ORDER,
        entityId: normalizedOrderId,
        folderKind: DRIVE_FILE_FOLDER_KIND.DESCRIPTIVE
    });
}

window.fetchSalesOrderDescriptiveDriveFile = fetchSalesOrderDescriptiveDriveFile;
