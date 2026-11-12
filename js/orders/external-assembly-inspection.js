const EAI_ORDER_PROJECT_STATUS = 'Montagem Externa';

const EAI_STATUS_OPEN = 'Open';
const EAI_STATUS_IN_PROGRESS = 'InProgress';
const EAI_STATUS_FINISHED = 'Finished';

const EAI_STATUS_LABELS = {
    [EAI_STATUS_OPEN]: 'Aberto',
    [EAI_STATUS_IN_PROGRESS]: 'Em andamento',
    [EAI_STATUS_FINISHED]: 'Finalizado'
};

const EAI_STATUS_BADGE = {
    [EAI_STATUS_OPEN]: 'bg-slate-100 text-slate-700',
    [EAI_STATUS_IN_PROGRESS]: 'bg-amber-100 text-amber-800',
    [EAI_STATUS_FINISHED]: 'bg-emerald-100 text-emerald-800'
};

const EAI_INSPECTION_SELECT = `
    id, orderId, observation, status, createdAt, updatedAt, createdById, updatedById,
    createdBy:appUsers!ExternalAssemblyInspection_createdById_fkey(id, name),
    updatedBy:appUsers!ExternalAssemblyInspection_updatedById_fkey(id, name)
`;

const EAI_PROJECT_SELECT = `
    id, inspectionId, orderProjectId, status, createdAt, updatedAt,
    orderProject:OrderProject(id, name, projectCode, orderId,
        projectStatus:OrderProjectStatus(id, name),
        order:salesOrders(id, orderCode))
`;

const EAI_ACTIVITY_SELECT = `
    id, inspectionProjectId, description, isDone, responseComment, sortOrder, doneAt, doneById, createdAt, updatedAt,
    doneBy:appUsers!ExternalAssemblyInspectionActivity_doneById_fkey(id, name)
`;

let eaiCreateState = null;
let eaiDetailState = null;
let eaiListState = null;
let eaiCreateImageTarget = null;
let eaiDetailImageTarget = null;
let eaiCreateActivityCounter = 0;
let eaiDetailActivityDraftCounter = 0;

const eaiCreateOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('external-assembly-inspection-create-modal', {
        loadingOverlayId: 'eai-create-modal-loading',
        closeButtonSelector: '#btn-eai-create-close, #btn-eai-create-cancel'
    })
    : null;

const eaiDetailOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('external-assembly-inspection-detail-modal', {
        loadingOverlayId: 'eai-detail-modal-loading',
        closeButtonSelector: '#btn-eai-detail-close, #btn-eai-detail-close-footer'
    })
    : null;

let eaiDriveUploadBatch = null;

function setExternalAssemblyInspectionOverlayMessage(message, status) {
    const createModal = document.getElementById('external-assembly-inspection-create-modal');
    const detailModal = document.getElementById('external-assembly-inspection-detail-modal');
    if (createModal && !createModal.classList.contains('hidden') && eaiCreateOverlay) {
        eaiCreateOverlay.setLoading(true, message, status);
        return;
    }
    if (detailModal && !detailModal.classList.contains('hidden') && eaiDetailOverlay) {
        eaiDetailOverlay.setLoading(true, message, status);
    }
}

function clearExternalAssemblyInspectionOverlayMessage() {
    const createModal = document.getElementById('external-assembly-inspection-create-modal');
    const detailModal = document.getElementById('external-assembly-inspection-detail-modal');
    if (createModal && !createModal.classList.contains('hidden')) {
        eaiCreateOverlay?.setLoading(false);
        return;
    }
    if (detailModal && !detailModal.classList.contains('hidden')) {
        eaiDetailOverlay?.setLoading(false);
    }
}

async function applyExternalAssemblyInspectionPickedImageFile(file, onReady) {
    if (!file || typeof onReady !== 'function') return;
    try {
        setExternalAssemblyInspectionOverlayMessage('Otimizando imagem...');
        let prepared = file;
        if (typeof prepareDriveImageUploadFile === 'function') {
            prepared = await prepareDriveImageUploadFile(file, {
                maxBytes: typeof DRIVE_FILE_REVISION_IMAGE_MAX_BYTES !== 'undefined'
                    ? DRIVE_FILE_REVISION_IMAGE_MAX_BYTES
                    : (2 * 1024 * 1024)
            });
        }
        const validation = validateExternalAssemblyInspectionImageFile(prepared);
        if (validation) {
            alertAppDialog(validation);
            return;
        }
        onReady(prepared);
    } catch (error) {
        alertAppDialog(error?.message || 'Não foi possível preparar a imagem.');
    } finally {
        clearExternalAssemblyInspectionOverlayMessage();
    }
}

function updateExternalAssemblyInspectionImageUploadProgress(sent, total) {
    if (!total) return;
    const pct = Math.min(100, Math.round((sent / total) * 100));
    const batch = eaiDriveUploadBatch;
    const scopeLabel = batch?.response ? ' de resposta' : ' da atividade';
    const message = batch && batch.total > 1
        ? `Enviando imagem${scopeLabel} (${batch.index} de ${batch.total}, ${pct}%)...`
        : `Enviando imagem${scopeLabel} (${pct}%)...`;
    setExternalAssemblyInspectionOverlayMessage(message);
}

function primeExternalAssemblyInspectionDriveUpload() {
    if (typeof primeGoogleDriveAppsScript === 'function') {
        primeGoogleDriveAppsScript();
    }
}

async function persistExternalAssemblyInspectionActivityImages(uploads) {
    const queue = (uploads || []).filter(item => item?.file && item?.activityId);
    if (!queue.length) return;

    setExternalAssemblyInspectionOverlayMessage('Preparando envio ao Google Drive...');
    if (typeof ensureGoogleDriveAppsScriptReady === 'function') {
        await ensureGoogleDriveAppsScriptReady();
    }

    eaiDriveUploadBatch = { index: 0, total: queue.length, response: false };
    try {
        for (const item of queue) {
            eaiDriveUploadBatch.index += 1;
            eaiDriveUploadBatch.response = Boolean(item.context?.response);
            let uploadFile = item.file;
            if (typeof prepareDriveImageUploadFile === 'function') {
                uploadFile = await prepareDriveImageUploadFile(item.file, {
                    maxBytes: typeof DRIVE_FILE_REVISION_IMAGE_MAX_BYTES !== 'undefined'
                        ? DRIVE_FILE_REVISION_IMAGE_MAX_BYTES
                        : (2 * 1024 * 1024)
                });
            }
            const uploadValidation = validateExternalAssemblyInspectionImageFile(uploadFile);
            if (uploadValidation) {
                throw new Error(uploadValidation);
            }
            const safeName = String(uploadFile?.name || 'imagem').trim() || 'imagem';
            await uploadExternalAssemblyInspectionActivityImage(
                uploadFile,
                item.activityId,
                item.context,
                updateExternalAssemblyInspectionImageUploadProgress,
                { fileName: `atividade-${item.activityId}-${safeName}` }
            );
        }
    } finally {
        eaiDriveUploadBatch = null;
    }
}

function isExternalAssemblyInspectionTablesMissingError(error) {
    const message = String(error?.message || error || '');
    return /ExternalAssemblyInspection/i.test(message)
        && /could not find|does not exist|schema cache|não encontr|row-level security/i.test(message);
}

function isExternalAssemblyInspectionRlsError(error) {
    const message = String(error?.message || error || '');
    return /ExternalAssemblyInspection/i.test(message) && /row-level security/i.test(message);
}

function formatExternalAssemblyInspectionStatus(status) {
    return EAI_STATUS_LABELS[status] || status || '—';
}

function getExternalAssemblyInspectionProjectName(projectOrMeta) {
    if (!projectOrMeta) return 'Projeto';
    const name = projectOrMeta.name ?? projectOrMeta.orderProject?.name ?? '';
    return String(name).trim() || 'Projeto';
}

function formatExternalAssemblyInspectionDateTime(value) {
    if (!value) return '—';
    if (typeof formatGestaoDateTime === 'function') return formatGestaoDateTime(value);
    if (typeof formatDisplayDate === 'function') return formatDisplayDate(value);
    return String(value);
}

function formatExternalAssemblyInspectionDate(value) {
    if (!value) return '—';
    if (typeof formatDisplayDate === 'function') return formatDisplayDate(value);
    return String(value).split('T')[0] || String(value);
}

function buildExternalAssemblyInspectionSummaryMeta(inspection) {
    const isFinished = inspection?.status === EAI_STATUS_FINISHED;
    return {
        creatorName: inspection?.createdBy?.name || '—',
        createdAt: formatExternalAssemblyInspectionDateTime(inspection?.createdAt),
        finalizedBy: isFinished ? (inspection?.updatedBy?.name || '—') : '—',
        finalizedAt: isFinished
            ? formatExternalAssemblyInspectionDateTime(inspection?.updatedAt)
            : '—'
    };
}

function renderExternalAssemblyInspectionDetailSummaryHtml(inspection) {
    const meta = buildExternalAssemblyInspectionSummaryMeta(inspection);
    const item = (label, value) => `
        <div>
            <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">${escapeHtml(label)}</p>
            <p class="text-xs text-slate-800 mt-0.5">${escapeHtml(value)}</p>
        </div>
    `;
    return `
        <motiondiv class="eai-detail-summary rounded-xl border border-slate-200 bg-slate-50/90 p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            ${item('Criado por', meta.creatorName)}
            ${item('Criado em', meta.createdAt)}
            ${item('Finalizado por', meta.finalizedBy)}
            ${item('Finalizado em', meta.finalizedAt)}
        </motiondiv>
    `.replaceAll('motiondiv', 'div');
}

function syncExternalAssemblyInspectionDetailSummary(inspection) {
    const mount = document.getElementById('eai-detail-summary-mount');
    if (!mount) return;
    if (!inspection?.id) {
        mount.innerHTML = '';
        return;
    }
    mount.innerHTML = renderExternalAssemblyInspectionDetailSummaryHtml(inspection);
}

function renderExternalAssemblyInspectionStatusBadge(status) {
    const label = formatExternalAssemblyInspectionStatus(status);
    const badgeClass = EAI_STATUS_BADGE[status] || 'bg-slate-100 text-slate-700';
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeClass}">${escapeHtml(label)}</span>`;
}

function summarizeExternalAssemblyInspectionsForDisplay(inspections = []) {
    const byId = new Map();
    (inspections || []).forEach(item => {
        const id = Number(item?.id);
        if (!id || byId.has(id)) return;
        byId.set(id, item);
    });
    const rows = [...byId.values()];
    const total = rows.length;
    const finished = rows.filter(item => item.status === EAI_STATUS_FINISHED).length;
    const inProgressCount = rows.filter(item => item.status === EAI_STATUS_IN_PROGRESS).length;

    if (!total) {
        return { finished: 0, total: 0, tone: 'none' };
    }

    let tone = 'gray';
    if (finished === total) {
        tone = 'green';
    } else if (inProgressCount > 0) {
        tone = 'yellow';
    }

    return { finished, total, tone };
}

function buildExternalAssemblyInspectionKanbanButtonLabel(summary = {}) {
    const finished = Number(summary.finished) || 0;
    const total = Number(summary.total) || 0;
    return `Vistoria(${finished}/${total})`;
}

function normalizeExternalAssemblyInspectionKanbanButtonTone(tone, summary = {}) {
    const total = Number(summary.total) || 0;
    if (!total) return 'none';
    const allowed = new Set(['none', 'gray', 'yellow', 'green']);
    if (allowed.has(tone)) return tone;
    return 'gray';
}

async function fetchExternalAssemblyInspectionSummaryByOrderProjectIds(orderProjectIds = []) {
    const ids = [...new Set((orderProjectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!ids.length) return {};

    const { data, error } = await supabaseClient
        .from('ExternalAssemblyInspectionProject')
        .select('orderProjectId, inspection:ExternalAssemblyInspection(id, status)')
        .in('orderProjectId', ids);

    if (error) {
        if (isExternalAssemblyInspectionTablesMissingError(error)) {
            return {};
        }
        throw error;
    }

    const inspectionsByProjectId = {};
    (data || []).forEach(link => {
        const projectId = Number(link.orderProjectId);
        const inspection = link.inspection;
        if (!projectId || !inspection?.id) return;
        if (!inspectionsByProjectId[projectId]) inspectionsByProjectId[projectId] = [];
        inspectionsByProjectId[projectId].push(inspection);
    });

    const summaries = {};
    ids.forEach(projectId => {
        summaries[projectId] = summarizeExternalAssemblyInspectionsForDisplay(
            inspectionsByProjectId[projectId] || []
        );
    });
    return summaries;
}

function canCreateExternalAssemblyInspection(order = null) {
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    if (typeof isGestorProjetos === 'function' && isGestorProjetos()) return true;
    if (typeof isGestorComercial === 'function' && isGestorComercial()) return true;
    if (typeof isGestorFabrica === 'function' && isGestorFabrica()) return true;
    if (typeof isFabricaRole === 'function' && isFabricaRole()) return true;
    if (order && Number(order.consultantUserId) === Number(currentUser?.id)) return true;
    return false;
}

function canRespondExternalAssemblyInspectionActivity() {
    return (typeof isAdmin === 'function' && isAdmin())
        || (typeof isGestorProjetos === 'function' && isGestorProjetos());
}

function canChangeExternalAssemblyInspectionStatus() {
    return canRespondExternalAssemblyInspectionActivity();
}

function getExternalAssemblyInspectionCreatorId(inspection) {
    return Number(inspection?.createdById ?? inspection?.createdBy?.id ?? 0);
}

function isExternalAssemblyInspectionCreator(inspection) {
    const creatorId = getExternalAssemblyInspectionCreatorId(inspection);
    const userId = Number(currentUser?.id ?? 0);
    return creatorId > 0 && userId > 0 && creatorId === userId;
}

function canEditExternalAssemblyInspectionActivities(inspection, inspectionProject) {
    if (!inspection || !inspectionProject) return false;
    if (inspection.status !== EAI_STATUS_OPEN) return false;
    if (inspectionProject.status !== EAI_STATUS_OPEN) return false;
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    return isExternalAssemblyInspectionCreator(inspection);
}

function resolveOrderForExternalAssemblyInspection(orderId) {
  const fromCache = typeof ordersCache !== 'undefined' && Array.isArray(ordersCache)
        ? ordersCache.find(item => Number(item.id) === Number(orderId))
        : null;
    if (fromCache) return fromCache;
    if (typeof activeOrderId !== 'undefined' && Number(activeOrderId) === Number(orderId)
        && typeof ordersCache !== 'undefined') {
        return ordersCache.find(item => Number(item.id) === Number(orderId)) || { id: orderId };
    }
    return { id: orderId };
}

function buildExternalAssemblyInspectionDriveFolderPath(orderCode, projectName, inspectionId) {
    return [
        typeof getDriveRootFolderName === 'function' ? getDriveRootFolderName() : 'FGP',
        String(orderCode || '').trim(),
        String(projectName || '').trim(),
        'vistoria',
        String(inspectionId || '').trim()
    ].filter(Boolean).join(' / ');
}

function validateExternalAssemblyInspectionImageFile(file) {
    if (!file) return 'Selecione uma imagem.';
    const mime = String(file.type || '').toLowerCase();
    const allowed = typeof DRIVE_FILE_IMAGE_EXTENSIONS !== 'undefined'
        ? DRIVE_FILE_IMAGE_EXTENSIONS
        : ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];
    const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const mimeOk = mime.startsWith('image/');
    const extOk = allowed.includes(ext);
    if (!mimeOk && !extOk) {
        return 'Envie apenas imagem (JPG, PNG, WebP, etc.).';
    }
    const maxBytes = typeof DRIVE_FILE_REVISION_IMAGE_MAX_BYTES !== 'undefined'
        ? DRIVE_FILE_REVISION_IMAGE_MAX_BYTES
        : (2 * 1024 * 1024);
    if (Number(file.size) > maxBytes) {
        return `Imagem até ${(maxBytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB.`;
    }
    return '';
}

function syncExternalAssemblyInspectionOrderClientHeader(order, target = {}) {
    const codeEl = target.codeEl
        || (target.codeId ? document.getElementById(target.codeId) : null);
    const clientEl = target.clientEl
        || (target.clientId ? document.getElementById(target.clientId) : null);
    const orderCode = String(order?.orderCode || '—').trim() || '—';
    const clientName = typeof getOrderClientName === 'function'
        ? getOrderClientName(order)
        : (order?.client?.name || '—');
    if (codeEl) codeEl.textContent = orderCode;
    if (clientEl) clientEl.textContent = clientName || '—';
}

async function syncExternalAssemblyInspectionListModalHeader(orderId, projectLabel = '') {
    const projectEl = document.getElementById('eai-list-project-label');
    if (projectEl) {
        projectEl.textContent = String(projectLabel || '—').trim() || '—';
    }

    let order = resolveOrderForExternalAssemblyInspection(orderId);
    if (typeof fetchOrderDetailRecord === 'function' && orderId) {
        try {
            order = await fetchOrderDetailRecord(Number(orderId));
        } catch (error) {
            console.warn('syncExternalAssemblyInspectionListModalHeader fetchOrder:', error);
        }
    }
    syncExternalAssemblyInspectionOrderClientHeader(order, {
        codeId: 'eai-list-order-code',
        clientId: 'eai-list-order-client'
    });
}

async function syncExternalAssemblyInspectionDetailModalHeader(inspection) {
    if (!inspection) return;

    const inspectionIdEl = document.getElementById('eai-detail-inspection-id');
    if (inspectionIdEl) {
        inspectionIdEl.textContent = String(inspection.id || '—');
    }

    const orderId = Number(inspection.orderId);
    let order = resolveOrderForExternalAssemblyInspection(orderId);
    if (typeof fetchOrderDetailRecord === 'function' && orderId) {
        try {
            order = await fetchOrderDetailRecord(orderId);
        } catch (error) {
            console.warn('syncExternalAssemblyInspectionDetailModalHeader fetchOrder:', error);
        }
    }
    syncExternalAssemblyInspectionOrderClientHeader(order, {
        codeId: 'eai-detail-order-code',
        clientId: 'eai-detail-order-client'
    });
}

function revokeExternalAssemblyInspectionCreatePreview(row) {
    if (row?._imagePreviewUrl) {
        URL.revokeObjectURL(row._imagePreviewUrl);
        row._imagePreviewUrl = null;
    }
}

function bindExternalAssemblyInspectionCreateActivityAttachmentMount(row, mount) {
    if (!row || !mount) return;

    mount.querySelector('.eai-create-activity-image-btn')?.addEventListener('click', () => {
        eaiCreateImageTarget = { rowId: row.dataset.rowId, row };
        document.getElementById('eai-create-image-input')?.click();
    });

    mount.querySelector('.eai-create-activity-image-remove')?.addEventListener('click', () => {
        revokeExternalAssemblyInspectionCreatePreview(row);
        delete row._imageFile;
        syncExternalAssemblyInspectionCreateActivityImageUi(row);
    });

    mount.querySelector('.revision-activity-attachment-item__preview')?.addEventListener('click', () => {
        const url = row._imagePreviewUrl;
        if (!url || typeof openImageAttachmentLightbox !== 'function') return;
        openImageAttachmentLightbox(url, row._imageFile?.name || 'Imagem');
    });
}

function renderExternalAssemblyInspectionCreateAttachmentMount(row) {
    const file = row?._imageFile;
    if (!file) {
        return `
            <div class="revision-activity-attachments eai-create-activity-attachments">
                <button type="button"
                    class="revision-activity-attachments__add-btn eai-create-activity-image-btn">
                    + Imagem
                </button>
            </div>
        `;
    }

    const previewUrl = row._imagePreviewUrl || '';
    return `
        <div class="revision-activity-attachments eai-create-activity-attachments">
            <div class="revision-activity-attachments__list">
                <div class="revision-activity-attachment-item">
                    <div class="revision-activity-attachment-item__preview-wrap">
                        <img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(file.name)}"
                            class="revision-activity-attachment-item__preview">
                    </div>
                    <button type="button"
                        class="revision-activity-attachment-item__remove eai-create-activity-image-remove"
                        aria-label="Remover imagem">×</button>
                </div>
            </div>
        </div>
    `;
}

function syncExternalAssemblyInspectionCreateActivityImageUi(row) {
    if (!row) return;
    const mount = row.querySelector('.eai-create-activity-attachments-mount');
    if (!mount) return;

    revokeExternalAssemblyInspectionCreatePreview(row);
    if (row._imageFile) {
        row._imagePreviewUrl = URL.createObjectURL(row._imageFile);
    }

    mount.innerHTML = renderExternalAssemblyInspectionCreateAttachmentMount(row);
    bindExternalAssemblyInspectionCreateActivityAttachmentMount(row, mount);
}

function buildExternalAssemblyInspectionDetailImageAdapter(row, fileKey, previewKey) {
    return {
        get _imageFile() {
            return row[fileKey];
        },
        set _imageFile(value) {
            row[fileKey] = value;
        },
        get _imagePreviewUrl() {
            return row[previewKey];
        },
        set _imagePreviewUrl(value) {
            row[previewKey] = value;
        },
        dataset: { rowId: String(row.dataset.activityId || '') }
    };
}

function bindExternalAssemblyInspectionDetailAttachmentMount(mount, adapter, options) {
    if (!mount || !adapter || !options) return;

    mount.querySelector('.eai-create-activity-image-btn')?.addEventListener('click', options.onPick);
    mount.querySelector('.eai-create-activity-image-remove')?.addEventListener('click', () => {
        revokeExternalAssemblyInspectionCreatePreview(adapter);
        delete adapter._imageFile;
        options.onSync();
    });
    mount.querySelector('.revision-activity-attachment-item__preview')?.addEventListener('click', () => {
        const url = adapter._imagePreviewUrl;
        if (!url || typeof openImageAttachmentLightbox !== 'function') return;
        openImageAttachmentLightbox(url, adapter._imageFile?.name || 'Imagem');
    });
}

function syncExternalAssemblyInspectionDetailAttachmentUi(row, {
    mountSelector,
    fileKey,
    previewKey,
    existingHtmlKey,
    onPick
}) {
    const mount = row.querySelector(mountSelector);
    if (!mount) return;

    const adapter = buildExternalAssemblyInspectionDetailImageAdapter(row, fileKey, previewKey);

    if (adapter._imageFile) {
        if (!adapter._imagePreviewUrl) {
            adapter._imagePreviewUrl = URL.createObjectURL(adapter._imageFile);
        }
    } else if (row[existingHtmlKey]) {
        mount.innerHTML = `
            <div class="space-y-1">${row[existingHtmlKey]}
            <button type="button" class="eai-detail-replace-image text-[10px] font-medium text-indigo-800">Trocar imagem</button></div>`;
        mount.querySelector('.eai-detail-replace-image')?.addEventListener('click', onPick);
        return;
    }

    mount.innerHTML = renderExternalAssemblyInspectionCreateAttachmentMount(adapter);
    bindExternalAssemblyInspectionDetailAttachmentMount(mount, adapter, {
        onPick,
        onSync: () => syncExternalAssemblyInspectionDetailAttachmentUi(row, {
            mountSelector,
            fileKey,
            previewKey,
            existingHtmlKey,
            onPick
        })
    });
}

function syncExternalAssemblyInspectionDetailCreationImageUi(row) {
    syncExternalAssemblyInspectionDetailAttachmentUi(row, {
        mountSelector: '.eai-detail-creation-attachments-mount',
        fileKey: '_creationImageFile',
        previewKey: '_creationPreviewUrl',
        existingHtmlKey: '_existingCreationImageHtml',
        onPick: () => {
            eaiDetailImageTarget = {
                activityId: Number(row.dataset.activityId),
                response: false,
                row
            };
            document.getElementById('eai-detail-image-input')?.click();
        }
    });
}

function syncExternalAssemblyInspectionDetailResponseImageUi(row) {
    syncExternalAssemblyInspectionDetailAttachmentUi(row, {
        mountSelector: '.eai-detail-response-attachments-mount',
        fileKey: '_responseImageFile',
        previewKey: '_responsePreviewUrl',
        existingHtmlKey: '_existingResponseImageHtml',
        onPick: () => {
            eaiDetailImageTarget = {
                activityId: Number(row.dataset.activityId),
                response: true,
                row
            };
            document.getElementById('eai-detail-response-image-input')?.click();
        }
    });
}

function revokeExternalAssemblyInspectionDetailRowPreviews(row) {
    if (row._creationPreviewUrl) {
        URL.revokeObjectURL(row._creationPreviewUrl);
        row._creationPreviewUrl = null;
    }
    if (row._responsePreviewUrl) {
        URL.revokeObjectURL(row._responsePreviewUrl);
        row._responsePreviewUrl = null;
    }
}

function getEligibleExternalAssemblyInspectionProjects(projects) {
    return (projects || []).filter(project => {
        if (typeof canActOnOrderProject === 'function' && !canActOnOrderProject(project)) return false;
        if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) return false;
        if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) return false;
        const statusName = typeof getOrderProjectStatusName === 'function'
            ? getOrderProjectStatusName(project)
            : (project?.projectStatus?.name || '');
        return statusName === EAI_ORDER_PROJECT_STATUS;
    });
}

async function fetchExternalAssemblyInspectionsForProject(orderProjectId) {
    const { data: links, error: linkError } = await supabaseClient
        .from('ExternalAssemblyInspectionProject')
        .select(`inspectionId, status, inspection:ExternalAssemblyInspection(${EAI_INSPECTION_SELECT.replace(/\s+/g, ' ').trim()})`)
        .eq('orderProjectId', Number(orderProjectId))
        .order('inspectionId', { ascending: false });

    if (linkError) {
        if (isExternalAssemblyInspectionTablesMissingError(linkError)) {
            return { rows: [], missingTable: true };
        }
        throw linkError;
    }

    const rows = (links || []).map(link => ({
        ...link.inspection,
        projectStatusInInspection: link.status
    })).filter(row => row?.id);

    return { rows, missingTable: false };
}

async function fetchExternalAssemblyInspectionDetail(inspectionId) {
    let inspectionResult = await supabaseClient
        .from('ExternalAssemblyInspection')
        .select(EAI_INSPECTION_SELECT.replace(/\s+/g, ' ').trim())
        .eq('id', Number(inspectionId))
        .maybeSingle();

    if (inspectionResult.error) {
        if (isExternalAssemblyInspectionTablesMissingError(inspectionResult.error)) {
            throw new Error('Execute supabase/feats/create-external-assembly-inspection.sql no Supabase SQL Editor.');
        }
        if (inspectionResult.error?.message?.includes('updatedBy')) {
            inspectionResult = await supabaseClient
                .from('ExternalAssemblyInspection')
                .select(`
                    id, orderId, observation, status, createdAt, updatedAt, createdById,
                    createdBy:appUsers!ExternalAssemblyInspection_createdById_fkey(id, name)
                `.replace(/\s+/g, ' ').trim())
                .eq('id', Number(inspectionId))
                .maybeSingle();
        } else {
            throw inspectionResult.error;
        }
    }
    if (inspectionResult.error) throw inspectionResult.error;
    if (!inspectionResult.data) return null;

    let projectsResult = await supabaseClient
        .from('ExternalAssemblyInspectionProject')
        .select(EAI_PROJECT_SELECT.replace(/\s+/g, ' ').trim())
        .eq('inspectionId', Number(inspectionId))
        .order('id', { ascending: true });

    if (projectsResult.error?.message?.includes('projectStatus')) {
        projectsResult = await supabaseClient
            .from('ExternalAssemblyInspectionProject')
            .select('id, inspectionId, orderProjectId, status, orderProject:OrderProject(id, name, projectCode, orderId)')
            .eq('inspectionId', Number(inspectionId))
            .order('id', { ascending: true });
    }
    if (projectsResult.error) throw projectsResult.error;

    const projectRows = projectsResult.data || [];
    const projectIds = projectRows.map(row => row.id);

    let activities = [];
    if (projectIds.length) {
        const { data: activityData, error: activityError } = await supabaseClient
            .from('ExternalAssemblyInspectionActivity')
            .select(EAI_ACTIVITY_SELECT.replace(/\s+/g, ' ').trim())
            .in('inspectionProjectId', projectIds)
            .order('sortOrder', { ascending: true })
            .order('id', { ascending: true });

        if (activityError?.message?.includes('doneBy')) {
            const fallbackActivities = await supabaseClient
                .from('ExternalAssemblyInspectionActivity')
                .select(`
                    id, inspectionProjectId, description, isDone, responseComment, sortOrder,
                    doneAt, doneById, createdAt, updatedAt
                `.replace(/\s+/g, ' ').trim())
                .in('inspectionProjectId', projectIds)
                .order('sortOrder', { ascending: true })
                .order('id', { ascending: true });
            if (fallbackActivities.error) throw fallbackActivities.error;
            activities = fallbackActivities.data || [];
        } else if (activityError) {
            throw activityError;
        } else {
            activities = activityData || [];
        }
    }

    const activitiesByProject = {};
    activities.forEach(activity => {
        const key = String(activity.inspectionProjectId);
        if (!activitiesByProject[key]) activitiesByProject[key] = [];
        activitiesByProject[key].push(activity);
    });

    return {
        inspection: inspectionResult.data,
        projects: projectRows.map(project => ({
            ...project,
            activities: activitiesByProject[String(project.id)] || []
        }))
    };
}

async function hasUnfinishedExternalAssemblyInspectionForProject(orderProjectId) {
    try {
        const { data, error } = await supabaseClient
            .from('ExternalAssemblyInspectionProject')
            .select('id, status')
            .eq('orderProjectId', Number(orderProjectId));

        if (error) {
            if (isExternalAssemblyInspectionTablesMissingError(error)) return false;
            console.warn('hasUnfinishedExternalAssemblyInspectionForProject:', error);
            return false;
        }
        return (data || []).some(row => row.status !== EAI_STATUS_FINISHED);
    } catch (error) {
        console.warn('hasUnfinishedExternalAssemblyInspectionForProject:', error);
        return false;
    }
}

async function assertOrderProjectMontagemExternaExitAllowed(orderProjectId, projectLabel = 'este projeto') {
    const blocked = await hasUnfinishedExternalAssemblyInspectionForProject(orderProjectId);
    if (!blocked) return true;

    alertAppDialog(
        `O projeto "${projectLabel}" possui vistoria de montagem externa não finalizada. Finalize todas as atividades ou exclua vistorias ainda abertas antes de sair de Montagem Externa.`,
        { variant: 'warning', title: 'Vistoria pendente' }
    );
    return false;
}

async function recomputeExternalAssemblyInspectionStatuses(inspectionId) {
    if (!canChangeExternalAssemblyInspectionStatus()) return;

    const detail = await fetchExternalAssemblyInspectionDetail(inspectionId);
    if (!detail) return;

    const now = new Date().toISOString();
    const projectUpdates = [];

    for (const project of detail.projects) {
        const activities = project.activities || [];
        const allDone = activities.length > 0 && activities.every(item => item.isDone);
        let nextStatus = project.status;
        if (allDone) {
            nextStatus = EAI_STATUS_FINISHED;
        }
        if (nextStatus !== project.status) {
            projectUpdates.push({ id: project.id, status: nextStatus });
        }
    }

    for (const update of projectUpdates) {
        await supabaseClient
            .from('ExternalAssemblyInspectionProject')
            .update({ status: update.status, updatedAt: now })
            .eq('id', update.id);
    }

    const refreshed = await fetchExternalAssemblyInspectionDetail(inspectionId);
    const allProjectsFinished = (refreshed?.projects || []).length > 0
        && (refreshed.projects || []).every(item => item.status === EAI_STATUS_FINISHED);

    let inspectionStatus = refreshed.inspection.status;
    if (allProjectsFinished) {
        inspectionStatus = EAI_STATUS_FINISHED;
    }

    if (inspectionStatus !== refreshed.inspection.status) {
        await supabaseClient
            .from('ExternalAssemblyInspection')
            .update({
                status: inspectionStatus,
                updatedAt: now,
                updatedById: currentUser?.id || null
            })
            .eq('id', inspectionId);
    }

    const anyInProgress = (refreshed?.projects || []).some(item => item.status === EAI_STATUS_IN_PROGRESS);
    if (anyInProgress && refreshed.inspection.status === EAI_STATUS_OPEN) {
        await promoteExternalAssemblyInspectionToInProgress(inspectionId);
    }
}

async function promoteExternalAssemblyInspectionToInProgress(inspectionId, inspectionProjectId = null) {
    if (!canChangeExternalAssemblyInspectionStatus()) {
        alertAppDialog('Somente gestor de projetos ou administrador pode alterar o status.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return;
    }

    const now = new Date().toISOString();
    const detail = await fetchExternalAssemblyInspectionDetail(inspectionId);
    if (!detail) return;

    const updates = [];
    if (detail.inspection.status === EAI_STATUS_OPEN) {
        updates.push(
            supabaseClient
                .from('ExternalAssemblyInspection')
                .update({ status: EAI_STATUS_IN_PROGRESS, updatedAt: now, updatedById: currentUser?.id || null })
                .eq('id', inspectionId)
        );
    }

    const targetProject = inspectionProjectId
        ? detail.projects.find(item => Number(item.id) === Number(inspectionProjectId))
        : detail.projects.find(item => item.status === EAI_STATUS_OPEN);

    if (targetProject && targetProject.status === EAI_STATUS_OPEN) {
        updates.push(
            supabaseClient
                .from('ExternalAssemblyInspectionProject')
                .update({ status: EAI_STATUS_IN_PROGRESS, updatedAt: now })
                .eq('id', targetProject.id)
        );
    }

    await Promise.all(updates);
}

async function uploadExternalAssemblyInspectionActivityImage(
    file,
    activityId,
    context,
    onProgress,
    options = {}
) {
    if (!file || !activityId || typeof saveDriveFileUpload !== 'function') return null;
    const folderKind = context.response
        ? DRIVE_FILE_FOLDER_KIND.EXTERNAL_ASSEMBLY_INSPECTION_RESPONSE
        : DRIVE_FILE_FOLDER_KIND.EXTERNAL_ASSEMBLY_INSPECTION;

    if (typeof validateDriveUploadFiles === 'function') {
        const validationError = validateDriveUploadFiles([file], folderKind);
        if (validationError) {
            throw new Error(validationError);
        }
    }

    return saveDriveFileUpload(file, {
        folderKind,
        entityType: DRIVE_FILE_ENTITY_TYPE.EXTERNAL_ASSEMBLY_INSPECTION_ACTIVITY,
        entityId: activityId,
        orderId: context.orderId,
        orderProjectId: context.orderProjectId,
        orderCode: context.orderCode,
        projectName: context.projectName,
        folderPath: buildExternalAssemblyInspectionDriveFolderPath(
            context.orderCode,
            context.projectName,
            context.inspectionId
        ),
        replaceByEntity: true,
        fileName: options.fileName
    }, onProgress);
}

function enrichOrderProjectActionsWithExternalAssemblyInspection(project, actions = []) {
    const statusName = typeof getOrderProjectStatusName === 'function'
        ? getOrderProjectStatusName(project)
        : (project?.projectStatus?.name || '');
    if (statusName !== EAI_ORDER_PROJECT_STATUS) return actions;
    if ((actions || []).some(action => action.id === 'external-assembly-inspection')) return actions;

    return [
        ...(actions || []),
        {
            id: 'external-assembly-inspection',
            label: 'Vistoria',
            enabled: true,
            projectId: project.id,
            projectName: project.name || ''
        }
    ];
}

function syncExternalAssemblyInspectionListCreateButton(orderId = eaiListState?.orderId ?? activeOrderId) {
    const button = document.getElementById('btn-eai-list-create');
    if (!button) return;
    const order = resolveOrderForExternalAssemblyInspection(orderId);
    button.classList.toggle('hidden', !canCreateExternalAssemblyInspection(order));
}

function closeExternalAssemblyInspectionListModal() {
    toggleModal('external-assembly-inspection-list-modal', false);
    eaiListState = null;
}

function closeExternalAssemblyInspectionCreateModal() {
    document.querySelectorAll('#eai-create-projects-mount .eai-create-activity').forEach(row => {
        revokeExternalAssemblyInspectionCreatePreview(row);
    });
    toggleModal('external-assembly-inspection-create-modal', false);
    eaiCreateState = null;
    eaiCreateImageTarget = null;
}

function closeExternalAssemblyInspectionDetailModal() {
    document.querySelectorAll('#eai-detail-projects-mount tr[data-activity-id]').forEach(row => {
        revokeExternalAssemblyInspectionDetailRowPreviews(row);
    });
    toggleModal('external-assembly-inspection-detail-modal', false);
    eaiDetailState = null;
    eaiDetailImageTarget = null;
    eaiDetailActivityDraftCounter = 0;
}

function isExternalAssemblyInspectionDetailDraftRow(row) {
    return row?.dataset?.isDraft === '1' || String(row?.dataset?.activityId || '').startsWith('draft-');
}

function ensureExternalAssemblyInspectionDetailProjectTbody(section) {
    let tbody = section?.querySelector('tbody');
    if (tbody) return tbody;
    const table = section?.querySelector('table');
    if (!table) return null;
    tbody = document.createElement('tbody');
    table.appendChild(tbody);
    return tbody;
}

function removeExternalAssemblyInspectionDetailActivityRow(trigger) {
    const row = trigger?.closest ? trigger.closest('tr[data-activity-id]') : trigger;
    if (!row) return;

    const section = row.closest('[data-inspection-project-id]');
    const tbody = row.closest('tbody');
    const rowCount = tbody?.querySelectorAll('tr[data-activity-id]').length || 0;

    if (isExternalAssemblyInspectionDetailDraftRow(row)) {
        if (rowCount <= 1) {
            alertAppDialog('O projeto precisa de ao menos uma atividade.');
            return;
        }
        revokeExternalAssemblyInspectionDetailRowPreviews(row);
        row.remove();
        if (tbody && !tbody.querySelector('tr[data-activity-id]')) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-slate-400 text-center">Sem atividades</td></tr>';
        }
        return;
    }

    void removeExternalAssemblyInspectionActivity(row);
}

function appendExternalAssemblyInspectionDetailActivityRow(button) {
    const section = button.closest('[data-inspection-project-id]');
    const inspectionProjectId = Number(section?.dataset.inspectionProjectId);
    const project = eaiDetailState?.projects?.find(item => Number(item.id) === inspectionProjectId);
    const inspection = eaiDetailState?.inspection;
    if (!section || !project || !inspection || !canEditExternalAssemblyInspectionActivities(inspection, project)) {
        alertAppDialog('Somente quem criou a vistoria pode alterar atividades enquanto o projeto estiver aberto.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return;
    }

    const tbody = ensureExternalAssemblyInspectionDetailProjectTbody(section);
    if (!tbody) return;

    const placeholderRow = tbody.querySelector('td[colspan="4"]');
    if (placeholderRow) {
        placeholderRow.closest('tr')?.remove();
    }

    eaiDetailActivityDraftCounter += 1;
    const draftId = `draft-${eaiDetailActivityDraftCounter}`;
    const canRespond = canRespondExternalAssemblyInspectionActivity();

    const row = document.createElement('tr');
    row.className = 'border-t border-slate-100';
    row.dataset.activityId = draftId;
    row.dataset.isDraft = '1';
    row.dataset.inspectionProjectId = String(inspectionProjectId);
    row.innerHTML = `
        <td class="p-2 align-top">
            <textarea rows="2" class="eai-detail-activity-description w-full px-2 py-1 text-xs border border-slate-200 rounded-lg resize-y"
                placeholder="Descreva a atividade..."></textarea>
            <div class="eai-detail-creation-attachments-mount mt-1"></div>
        </td>
        <td class="p-2 align-top text-center">
            <input type="checkbox" class="eai-activity-done h-4 w-4 rounded border-slate-300 text-emerald-600" disabled>
        </td>
        <td class="p-2 align-top">
            <textarea rows="2" class="eai-activity-response w-full px-2 py-1 text-xs border border-slate-200 rounded-lg resize-y bg-slate-50"
                placeholder="Comentário do gestor..."
                disabled></textarea>
            ${canRespond ? '<div class="eai-detail-response-attachments-mount mt-1"></div>' : ''}
        </td>
        <td class="p-2 align-top text-right">
            <button type="button" class="eai-detail-remove-activity text-[10px] text-rose-700">Excluir</button>
        </td>
    `;

    tbody.appendChild(row);
    syncExternalAssemblyInspectionDetailCreationImageUi(row);
    if (canRespond) {
        syncExternalAssemblyInspectionDetailResponseImageUi(row);
    }

    row.querySelector('.eai-detail-remove-activity')?.addEventListener('click', () => {
        removeExternalAssemblyInspectionDetailActivityRow(row);
    });

    row.querySelector('.eai-detail-activity-description')?.focus();
}

async function persistExternalAssemblyInspectionDetailDraftActivities(rows, now) {
    const imageUploadQueue = [];
    const draftRows = [...rows].filter(row => isExternalAssemblyInspectionDetailDraftRow(row));
    if (!draftRows.length) return imageUploadQueue;

    const inspectionId = eaiDetailState.inspection.id;
    const inspection = eaiDetailState.inspection;

    for (const row of draftRows) {
        const description = row.querySelector('.eai-detail-activity-description')?.value.trim() || '';
        if (!description) {
            throw new Error('Informe a descrição de todas as novas atividades.');
        }

        const inspectionProjectId = Number(row.dataset.inspectionProjectId);
        const projectRow = eaiDetailState.projects.find(item => Number(item.id) === inspectionProjectId);
        if (!projectRow || !canEditExternalAssemblyInspectionActivities(inspection, projectRow)) {
            continue;
        }

        const sortOrder = (projectRow.activities || []).length;
        const { data: activityRow, error } = await supabaseClient
            .from('ExternalAssemblyInspectionActivity')
            .insert({
                inspectionProjectId,
                description,
                sortOrder,
                isDone: false,
                createdAt: now,
                updatedAt: now
            })
            .select('id')
            .single();

        if (error) throw error;

        projectRow.activities = [...(projectRow.activities || []), {
            id: activityRow.id,
            description,
            isDone: false,
            sortOrder
        }];

        row.dataset.activityId = String(activityRow.id);
        delete row.dataset.isDraft;

        if (row._creationImageFile) {
            const orderProject = projectRow.orderProject || {};
            imageUploadQueue.push({
                file: row._creationImageFile,
                activityId: activityRow.id,
                context: {
                    orderId: eaiDetailState.inspection.orderId,
                    orderProjectId: orderProject.id,
                    orderCode: orderProject.order?.orderCode || '',
                    projectName: orderProject.name || '',
                    inspectionId,
                    response: false
                }
            });
        }
    }

    return imageUploadQueue;
}

async function openExternalAssemblyInspectionListModal(orderProjectId, subtitle = '', options = {}) {
    const mount = document.getElementById('eai-list-mount');

    const projectFromCache = typeof orderProjectsCache !== 'undefined' && Array.isArray(orderProjectsCache)
        ? orderProjectsCache.find(item => Number(item.id) === Number(orderProjectId))
        : null;
    const orderId = Number(options.orderId ?? projectFromCache?.orderId ?? activeOrderId);
    const projectLabel = projectFromCache
        ? getExternalAssemblyInspectionProjectName(projectFromCache)
        : (subtitle || '');

    eaiListState = {
        orderProjectId: Number(orderProjectId),
        orderId,
        subtitle: projectLabel
    };
    syncExternalAssemblyInspectionListCreateButton(orderId);

    if (mount) {
        mount.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando...</p>';
    }
    toggleModal('external-assembly-inspection-list-modal', true);
    void syncExternalAssemblyInspectionListModalHeader(orderId, projectLabel);

    try {
        const { rows, missingTable } = await fetchExternalAssemblyInspectionsForProject(orderProjectId);
        if (!mount) return;

        if (missingTable) {
            mount.innerHTML = '<p class="text-xs text-amber-700 text-center py-8">Execute <code>supabase/feats/create-external-assembly-inspection.sql</code> no SQL Editor.</p>';
            return;
        }

        if (!rows.length) {
            mount.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Nenhuma vistoria registrada para este projeto.</p>';
            return;
        }

        mount.innerHTML = `
            <table class="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead class="bg-slate-50 text-slate-500 uppercase text-[10px]">
                    <tr>
                        <th class="text-left px-3 py-2">#</th>
                        <th class="text-left px-3 py-2">Criada em</th>
                        <th class="text-left px-3 py-2">Status vistoria</th>
                        <th class="text-left px-3 py-2">Status no projeto</th>
                        <th class="text-right px-3 py-2">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr class="border-t border-slate-100">
                            <td class="px-3 py-2 font-mono">${row.id}</td>
                            <td class="px-3 py-2">${typeof formatDisplayDate === 'function' ? formatDisplayDate(row.createdAt) : (row.createdAt || '—')}</td>
                            <td class="px-3 py-2">${renderExternalAssemblyInspectionStatusBadge(row.status)}</td>
                            <td class="px-3 py-2">${renderExternalAssemblyInspectionStatusBadge(row.projectStatusInInspection)}</td>
                            <td class="px-3 py-2 text-right">
                                <button type="button" class="eai-open-detail-btn text-[11px] font-medium text-teal-800 hover:text-teal-900"
                                    data-inspection-id="${row.id}">Ver detalhes</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        mount.querySelectorAll('.eai-open-detail-btn').forEach(button => {
            button.addEventListener('click', () => {
                void openExternalAssemblyInspectionDetailModal(Number(button.dataset.inspectionId));
            });
        });
    } catch (error) {
        if (mount) {
            mount.innerHTML = `<p class="text-xs text-red-600 text-center py-8">${escapeHtml(error.message)}</p>`;
        }
    }
}

function renderExternalAssemblyInspectionCreateProjectSection(project) {
    const section = document.createElement('div');
    section.className = 'eai-create-project-section rounded-xl border border-slate-200 p-3 space-y-2';
    section.dataset.orderProjectId = String(project.orderProjectId);

    const label = project.label || project.name || `Projeto ${project.orderProjectId}`;
    section.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-slate-800">${escapeHtml(label)}</p>
            <button type="button" class="eai-create-remove-project text-[10px] text-rose-700 hover:text-rose-900">Remover projeto</button>
        </div>
        <div class="eai-create-activities space-y-2"></div>
        <button type="button" class="eai-create-add-activity text-[11px] font-medium text-indigo-800 hover:text-indigo-900">+ Atividade</button>
    `;

    section.querySelector('.eai-create-remove-project')?.addEventListener('click', () => {
        section.remove();
        refreshExternalAssemblyInspectionCreateProjectSelect();
        syncExternalAssemblyInspectionCreateEmptyState();
    });

    section.querySelector('.eai-create-add-activity')?.addEventListener('click', () => {
        appendExternalAssemblyInspectionCreateActivityRow(section.querySelector('.eai-create-activities'));
    });

    appendExternalAssemblyInspectionCreateActivityRow(section.querySelector('.eai-create-activities'));
    return section;
}

function appendExternalAssemblyInspectionCreateActivityRow(container) {
    if (!container) return;
    eaiCreateActivityCounter += 1;
    const rowId = `tmp-${eaiCreateActivityCounter}`;
    const row = document.createElement('div');
    row.className = 'eai-create-activity rounded-lg border border-slate-100 bg-slate-50/50 p-2 space-y-2';
    row.dataset.rowId = rowId;
    row.innerHTML = `
        <textarea rows="2" class="eai-create-activity-description w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg resize-y" placeholder="Descreva a atividade..."></textarea>
        <div class="eai-create-activity-attachments-mount"></div>
        <div class="flex flex-wrap gap-2 pt-1">
            <button type="button" class="eai-create-activity-remove text-[10px] text-rose-700">Excluir atividade</button>
        </div>
    `;

    row.querySelector('.eai-create-activity-remove')?.addEventListener('click', () => {
        const siblings = container.querySelectorAll('.eai-create-activity');
        if (siblings.length <= 1) {
            alertAppDialog('O projeto precisa de ao menos uma atividade.');
            return;
        }
        revokeExternalAssemblyInspectionCreatePreview(row);
        row.remove();
    });

    syncExternalAssemblyInspectionCreateActivityImageUi(row);
    container.appendChild(row);
}

function refreshExternalAssemblyInspectionCreateProjectSelect() {
    const select = document.getElementById('eai-create-add-project');
    if (!select || !eaiCreateState) return;

    const used = new Set(
        Array.from(document.querySelectorAll('.eai-create-project-section'))
            .map(section => Number(section.dataset.orderProjectId))
    );

    const options = eaiCreateState.availableProjects.filter(
        project => !used.has(Number(project.orderProjectId))
    );

    select.innerHTML = '<option value="">Selecione projeto...</option>';
    options.forEach(project => {
        select.innerHTML += `<option value="${project.orderProjectId}">${escapeHtml(project.label)}</option>`;
    });

    const addBtn = document.getElementById('btn-eai-create-add-project');
    if (addBtn) addBtn.disabled = !options.length;
}

function syncExternalAssemblyInspectionCreateEmptyState() {
    const empty = document.getElementById('eai-create-projects-empty');
    const has = document.querySelectorAll('.eai-create-project-section').length > 0;
    empty?.classList.toggle('hidden', has);
}

async function openExternalAssemblyInspectionCreateModal(orderId = activeOrderId, options = {}) {
    primeExternalAssemblyInspectionDriveUpload();
    eaiCreateOverlay?.setLoading(false);

    let order = resolveOrderForExternalAssemblyInspection(orderId);
    if (typeof fetchOrderDetailRecord === 'function') {
        try {
            order = await fetchOrderDetailRecord(Number(orderId));
        } catch (error) {
            console.warn('openExternalAssemblyInspectionCreateModal fetchOrder:', error);
        }
    }
    if (!canCreateExternalAssemblyInspection(order)) {
        alertAppDialog('Sem permissão para criar vistoria.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const projects = typeof orderProjectsCache !== 'undefined' ? orderProjectsCache : [];
    const eligible = getEligibleExternalAssemblyInspectionProjects(projects);
    if (!eligible.length) {
        alertAppDialog('Nenhum projeto em Montagem Externa neste pedido.');
        return;
    }

    eaiCreateState = {
        orderId: Number(orderId),
        orderCode: order.orderCode || '',
        availableProjects: eligible.map(project => ({
            orderProjectId: Number(project.id),
            label: getExternalAssemblyInspectionProjectName(project),
            name: project.name || ''
        }))
    };

    syncExternalAssemblyInspectionOrderClientHeader(order, {
        codeId: 'eai-create-order-code',
        clientId: 'eai-create-order-client'
    });

    document.getElementById('eai-create-observation').value = '';
    const projectsMount = document.getElementById('eai-create-projects-mount');
    if (projectsMount) projectsMount.innerHTML = '';

    const preselectOrderProjectId = Number(options.preselectOrderProjectId);
    if (preselectOrderProjectId) {
        const preselectProject = eaiCreateState.availableProjects.find(
            item => Number(item.orderProjectId) === preselectOrderProjectId
        );
        if (preselectProject && projectsMount) {
            projectsMount.appendChild(renderExternalAssemblyInspectionCreateProjectSection(preselectProject));
        }
    }

    refreshExternalAssemblyInspectionCreateProjectSelect();
    syncExternalAssemblyInspectionCreateEmptyState();
    toggleModal('external-assembly-inspection-create-modal', true);
}

async function submitExternalAssemblyInspectionCreate(event) {
    event.preventDefault();
    if (!eaiCreateState?.orderId) return;

    const sections = [...document.querySelectorAll('.eai-create-project-section')];
    if (!sections.length) {
        alertAppDialog('Adicione ao menos um projeto.');
        return;
    }

    const observation = document.getElementById('eai-create-observation')?.value.trim() || null;
    const now = new Date().toISOString();
    const payloadProjects = [];

    for (const section of sections) {
        const orderProjectId = Number(section.dataset.orderProjectId);
        const activityRows = [...section.querySelectorAll('.eai-create-activity')];
        const activities = activityRows.map((row, index) => ({
            description: row.querySelector('.eai-create-activity-description')?.value.trim() || '',
            sortOrder: index,
            imageFile: row._imageFile || null
        })).filter(item => item.description);

        if (!activities.length) {
            alertAppDialog('Cada projeto precisa de ao menos uma atividade com descrição.');
            return;
        }
        payloadProjects.push({ orderProjectId, activities });
    }

    const imageUploadQueue = [];

    try {
        eaiCreateOverlay?.setLoading(true, 'Salvando vistoria...');

        const { data: inspection, error: inspectionError } = await supabaseClient
            .from('ExternalAssemblyInspection')
            .insert({
                orderId: eaiCreateState.orderId,
                observation,
                status: EAI_STATUS_OPEN,
                createdById: currentUser?.id || null,
                updatedById: currentUser?.id || null,
                createdAt: now,
                updatedAt: now
            })
            .select('id, orderId')
            .single();

        if (inspectionError) {
            if (isExternalAssemblyInspectionTablesMissingError(inspectionError)) {
                throw new Error('Execute supabase/feats/create-external-assembly-inspection.sql no SQL Editor.');
            }
            if (isExternalAssemblyInspectionRlsError(inspectionError)) {
                throw new Error('Execute supabase/feats/external-assembly-inspection-rls.sql no SQL Editor.');
            }
            throw inspectionError;
        }

        eaiCreateOverlay?.setLoading(true, 'Registrando projetos e atividades...');

        for (const projectPayload of payloadProjects) {
            const { data: projectRow, error: projectError } = await supabaseClient
                .from('ExternalAssemblyInspectionProject')
                .insert({
                    inspectionId: inspection.id,
                    orderProjectId: projectPayload.orderProjectId,
                    status: EAI_STATUS_OPEN,
                    createdAt: now,
                    updatedAt: now
                })
                .select('id')
                .single();

            if (projectError) throw projectError;

            const meta = eaiCreateState.availableProjects.find(
                item => Number(item.orderProjectId) === Number(projectPayload.orderProjectId)
            );

            for (const activity of projectPayload.activities) {
                const { data: activityRow, error: activityError } = await supabaseClient
                    .from('ExternalAssemblyInspectionActivity')
                    .insert({
                        inspectionProjectId: projectRow.id,
                        description: activity.description,
                        sortOrder: activity.sortOrder,
                        isDone: false,
                        createdAt: now,
                        updatedAt: now
                    })
                    .select('id')
                    .single();

                if (activityError) throw activityError;

                if (activity.imageFile) {
                    imageUploadQueue.push({
                        file: activity.imageFile,
                        activityId: activityRow.id,
                        context: {
                            orderId: eaiCreateState.orderId,
                            orderProjectId: projectPayload.orderProjectId,
                            orderCode: eaiCreateState.orderCode,
                            projectName: meta?.name || '',
                            inspectionId: inspection.id,
                            response: false
                        }
                    });
                }
            }
        }

        if (imageUploadQueue.length) {
            await persistExternalAssemblyInspectionActivityImages(imageUploadQueue);
        }

        eaiCreateOverlay?.setLoading(true, 'Vistoria salva com sucesso!', 'success');
        await new Promise(resolve => setTimeout(resolve, 450));
        closeExternalAssemblyInspectionCreateModal();
        await openExternalAssemblyInspectionDetailModal(inspection.id);
    } catch (error) {
        alertAppDialog(error.message || 'Erro ao salvar vistoria.');
    } finally {
        eaiCreateOverlay?.setLoading(false);
    }
}

function renderExternalAssemblyInspectionDetail(detail) {
    const inspection = detail.inspection;
    const observationField = document.getElementById('eai-detail-observation');
    const statusEl = document.getElementById('eai-detail-inspection-status');
    const deleteBtn = document.getElementById('btn-eai-detail-delete');

    if (statusEl) {
        statusEl.textContent = formatExternalAssemblyInspectionStatus(inspection.status);
        statusEl.className = `text-[10px] px-2 py-0.5 rounded-full font-semibold ${EAI_STATUS_BADGE[inspection.status] || 'bg-slate-100 text-slate-700'}`;
    }
    void syncExternalAssemblyInspectionDetailModalHeader(inspection);
    syncExternalAssemblyInspectionDetailSummary(inspection);
    const canEditObservation = inspection.status === EAI_STATUS_OPEN
        && (isExternalAssemblyInspectionCreator(inspection)
            || (typeof isAdmin === 'function' && isAdmin()));
    if (observationField) {
        observationField.value = inspection.observation || '';
        observationField.readOnly = !canEditObservation;
        observationField.disabled = !canEditObservation;
    }
    deleteBtn?.classList.toggle('hidden', inspection.status !== EAI_STATUS_OPEN || !(
        isExternalAssemblyInspectionCreator(inspection)
        || (typeof isAdmin === 'function' && isAdmin())
    ));

    const mount = document.getElementById('eai-detail-projects-mount');
    if (!mount) return;

    const canRespond = canRespondExternalAssemblyInspectionActivity();
    const canChangeStatus = canChangeExternalAssemblyInspectionStatus();

    mount.innerHTML = detail.projects.map(project => {
        const projectMeta = project.orderProject || {};
        const projectLabel = getExternalAssemblyInspectionProjectName(projectMeta);
        const canEditProjectActivities = canEditExternalAssemblyInspectionActivities(inspection, project);

        const activitiesHtml = (project.activities || []).map(activity => `
            <tr class="border-t border-slate-100" data-activity-id="${activity.id}" data-inspection-project-id="${project.id}">
                <td class="p-2 align-top">
                    ${canEditProjectActivities
            ? `<textarea rows="2" class="eai-detail-activity-description w-full px-2 py-1 text-xs border border-slate-200 rounded-lg resize-y"
                placeholder="Descreva a atividade...">${escapeHtml(activity.description || '')}</textarea>
               <div class="eai-detail-creation-attachments-mount mt-1"></div>`
            : `<p class="text-xs text-slate-800 whitespace-pre-wrap">${escapeHtml(activity.description)}</p>
               ${activity._creationImageHtml || ''}`}
                </td>
                <td class="p-2 align-top text-center">
                    <input type="checkbox" class="eai-activity-done h-4 w-4 rounded border-slate-300 text-emerald-600"
                        ${activity.isDone ? 'checked' : ''}
                        ${canRespond ? '' : 'disabled'}>
                </td>
                <td class="p-2 align-top">
                    <textarea rows="2" class="eai-activity-response w-full px-2 py-1 text-xs border border-slate-200 rounded-lg resize-y"
                        placeholder="Comentário do gestor..."
                        ${canRespond ? '' : 'disabled'}>${escapeHtml(activity.responseComment || '')}</textarea>
                    ${canRespond
            ? '<div class="eai-detail-response-attachments-mount mt-1"></div>'
            : (activity._responseImageHtml || '')}
                </td>
                <td class="p-2 align-top text-right">
                    ${canEditProjectActivities
            ? `<button type="button" class="eai-detail-remove-activity text-[10px] text-rose-700">Excluir</button>`
            : '<span class="text-slate-300">—</span>'}
                </td>
            </tr>
        `).join('');

        return `
            <section class="rounded-xl border border-slate-200 overflow-hidden" data-inspection-project-id="${project.id}">
                <div class="px-3 py-2 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <div class="flex flex-wrap items-center gap-2 min-w-0">
                        <span class="text-sm font-semibold text-slate-800">${escapeHtml(projectLabel)}</span>
                        ${renderExternalAssemblyInspectionStatusBadge(project.status)}
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${project.status === EAI_STATUS_OPEN && canChangeStatus
            ? `<button type="button" class="eai-project-mark-in-progress text-[10px] px-2 py-1 rounded-md bg-amber-100 text-amber-900">Em andamento</button>`
            : ''}
                        ${canEditProjectActivities
            ? `<button type="button" class="eai-project-remove text-[10px] text-rose-700">Excluir projeto</button>`
            : ''}
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-xs min-w-[640px]">
                        <thead class="text-[10px] uppercase text-slate-500 bg-white">
                            <tr>
                                <th class="text-left p-2">Atividade</th>
                                <th class="text-center p-2 w-20">Realizado</th>
                                <th class="text-left p-2">Resposta</th>
                                <th class="text-right p-2 w-20"></th>
                            </tr>
                        </thead>
                        <tbody>${activitiesHtml || '<tr><td colspan="4" class="p-3 text-slate-400 text-center">Sem atividades</td></tr>'}</tbody>
                    </table>
                </div>
                ${canEditProjectActivities
            ? `<div class="px-3 py-2 border-t border-slate-100"><button type="button" class="eai-detail-add-activity text-[11px] text-indigo-800">+ Atividade</button></div>`
            : ''}
            </section>
        `;
    }).join('');

    mount.querySelectorAll('.eai-project-mark-in-progress').forEach(button => {
        button.addEventListener('click', async () => {
            const section = button.closest('[data-inspection-project-id]');
            const inspectionProjectId = Number(section?.dataset.inspectionProjectId);
            await promoteExternalAssemblyInspectionToInProgress(inspection.id, inspectionProjectId);
            await openExternalAssemblyInspectionDetailModal(inspection.id);
        });
    });

    mount.querySelectorAll('.eai-project-remove').forEach(button => {
        button.addEventListener('click', () => void removeExternalAssemblyInspectionProject(button));
    });

    mount.querySelectorAll('.eai-detail-remove-activity').forEach(button => {
        button.addEventListener('click', () => removeExternalAssemblyInspectionDetailActivityRow(button));
    });

    mount.querySelectorAll('.eai-detail-add-activity').forEach(button => {
        button.addEventListener('click', () => appendExternalAssemblyInspectionDetailActivityRow(button));
    });

    mount.querySelectorAll('tr[data-activity-id]').forEach(row => {
        const inspectionProjectId = Number(row.dataset.inspectionProjectId);
        const project = detail.projects.find(item => Number(item.id) === inspectionProjectId);
        const activity = findExternalAssemblyInspectionActivityInState(Number(row.dataset.activityId));
        const canEditProjectActivities = project
            ? canEditExternalAssemblyInspectionActivities(inspection, project)
            : false;

        row._existingCreationImageHtml = activity?._creationImageHtml || '';
        row._existingResponseImageHtml = activity?._responseImageHtml || '';

        if (canEditProjectActivities) {
            syncExternalAssemblyInspectionDetailCreationImageUi(row);
        }
        if (canRespond) {
            syncExternalAssemblyInspectionDetailResponseImageUi(row);
        }
    });
}

async function hydrateExternalAssemblyInspectionDetailImages(detail) {
    if (typeof fetchDriveFilesByEntityIds !== 'function') return detail;

    const activityIds = [];
    detail.projects.forEach(project => {
        (project.activities || []).forEach(activity => activityIds.push(activity.id));
    });
    if (!activityIds.length) return detail;

    let creationMap = {};
    let responseMap = {};
    try {
        creationMap = await fetchDriveFilesByEntityIds({
            entityType: DRIVE_FILE_ENTITY_TYPE.EXTERNAL_ASSEMBLY_INSPECTION_ACTIVITY,
            entityIds: activityIds,
            folderKind: DRIVE_FILE_FOLDER_KIND.EXTERNAL_ASSEMBLY_INSPECTION
        });
        responseMap = await fetchDriveFilesByEntityIds({
            entityType: DRIVE_FILE_ENTITY_TYPE.EXTERNAL_ASSEMBLY_INSPECTION_ACTIVITY,
            entityIds: activityIds,
            folderKind: DRIVE_FILE_FOLDER_KIND.EXTERNAL_ASSEMBLY_INSPECTION_RESPONSE
        });
    } catch (error) {
        console.warn('hydrateExternalAssemblyInspectionDetailImages:', error);
    }

    const renderThumb = (file) => {
        if (!file) return '';
        const preview = typeof resolveDriveFilePreviewUrl === 'function' ? resolveDriveFilePreviewUrl(file) : '';
        const viewUrl = typeof resolveDriveFileViewUrl === 'function'
            ? (resolveDriveFileViewUrl(file) || preview)
            : preview;
        if (!preview) return '';
        return `
            <div class="revision-activity-attachments__readonly mt-1">
                <button type="button"
                    class="revision-activity-attachment-thumb eai-activity-image-open"
                    data-eai-open-image-url="${escapeHtml(viewUrl)}"
                    title="${escapeHtml(file.fileName || 'Imagem')}">
                    <img src="${escapeHtml(preview)}" alt="${escapeHtml(file.fileName || 'Imagem')}"
                        loading="lazy" referrerpolicy="no-referrer">
                </button>
            </div>
        `;
    };

    detail.projects.forEach(project => {
        project.activities.forEach(activity => {
            const key = String(activity.id);
            const creation = creationMap[key];
            const response = responseMap[key];
            activity._creationImageHtml = renderThumb(creation);
            activity._responseImageHtml = renderThumb(response);
        });
    });

    return detail;
}

function extractExternalAssemblyInspectionExportImageSrc(html = '') {
    if (!html) return '';
    const match = String(html).match(/\ssrc="([^"]+)"/i);
    return match ? match[1] : '';
}

function resolveExternalAssemblyInspectionRowImageSrc(row, selectors, fallbackHtml = '') {
    if (!row) return extractExternalAssemblyInspectionExportImageSrc(fallbackHtml);
    const img = row.querySelector(selectors);
    const src = img?.currentSrc || img?.src || '';
    if (src) return src;
    return extractExternalAssemblyInspectionExportImageSrc(fallbackHtml);
}

function collectExternalAssemblyInspectionExportActivityFromRow(row, activity = {}) {
    if (!row) return { ...activity };

    const descriptionInput = row.querySelector('.eai-detail-activity-description');
    const description = descriptionInput
        ? descriptionInput.value.trim()
        : String(activity.description || '').trim();
    const isDone = Boolean(row.querySelector('.eai-activity-done')?.checked);
    const responseInput = row.querySelector('.eai-activity-response');
    const responseComment = responseInput
        ? responseInput.value.trim()
        : String(activity.responseComment || '').trim();

    const creationImageUrl = resolveExternalAssemblyInspectionRowImageSrc(
        row,
        '.eai-detail-creation-attachments-mount img, .revision-activity-attachments__readonly img',
        activity._creationImageHtml
    );
    const responseImageUrl = resolveExternalAssemblyInspectionRowImageSrc(
        row,
        '.eai-detail-response-attachments-mount img',
        activity._responseImageHtml
    );

    return {
        ...activity,
        description,
        isDone,
        doneAt: isDone ? (activity.doneAt || null) : null,
        responseComment,
        creationImageUrl,
        responseImageUrl
    };
}

function buildExternalAssemblyInspectionExportSnapshot() {
    if (!eaiDetailState?.inspection?.id) return null;

    const inspection = {
        ...eaiDetailState.inspection,
        observation: document.getElementById('eai-detail-observation')?.value?.trim()
            || eaiDetailState.inspection.observation
            || ''
    };

    const projects = (eaiDetailState.projects || []).map(project => {
        const activities = (project.activities || []).map(activity => {
            const row = document.querySelector(
                `#eai-detail-projects-mount tr[data-activity-id="${activity.id}"]`
            );
            return collectExternalAssemblyInspectionExportActivityFromRow(row, activity);
        });

        return { ...project, activities };
    });

    return { inspection, projects };
}

function mergeExternalAssemblyInspectionExportSnapshot(uiSnapshot, detail) {
    if (!detail?.inspection) return uiSnapshot;

    const inspection = {
        ...detail.inspection,
        observation: uiSnapshot.inspection?.observation ?? detail.inspection.observation
    };

    const projects = (detail.projects || []).map(project => {
        const uiProject = (uiSnapshot.projects || []).find(
            item => Number(item.id) === Number(project.id)
        );
        const activities = (project.activities || []).map(activity => {
            const uiActivity = uiProject?.activities?.find(
                item => Number(item.id) === Number(activity.id)
            );
            if (!uiActivity) return activity;

            const isDone = uiActivity.isDone;
            return {
                ...activity,
                description: uiActivity.description,
                isDone,
                responseComment: uiActivity.responseComment,
                creationImageUrl: uiActivity.creationImageUrl,
                responseImageUrl: uiActivity.responseImageUrl,
                doneAt: isDone ? (activity.doneAt || uiActivity.doneAt || null) : null,
                doneBy: isDone ? (activity.doneBy || uiActivity.doneBy || null) : null
            };
        });

        return { ...project, activities };
    });

    return { inspection, projects };
}

function renderExternalAssemblyInspectionExportImages(imageUrl, label) {
    if (!imageUrl) return '';
    return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(label)}" class="eai-export-image" loading="eager">`;
}

function eaiExportEmptyMessage(message) {
    return `<p class="order-export-empty">${escapeHtml(message)}</p>`;
}

const formatExternalAssemblyInspectionExportDateTime = formatExternalAssemblyInspectionDateTime;
const formatExternalAssemblyInspectionExportDate = formatExternalAssemblyInspectionDate;

function eaiExportField(label, value) {
    const display = value == null || value === '' ? '—' : String(value);
    return `
        <div class="order-export-field">
            <div class="order-export-field__label">${escapeHtml(label)}</div>
            <div class="order-export-field__value">${escapeHtml(display)}</div>
        </div>
    `;
}

function formatExternalAssemblyInspectionExportDoneCell(activity) {
    if (!activity?.isDone) {
        return '<span class="eai-export-pill eai-export-pill--no">Não</span>';
    }
    const dateLabel = activity.doneAt
        ? formatExternalAssemblyInspectionExportDate(activity.doneAt)
        : '';
    const dateLine = dateLabel && dateLabel !== '—'
        ? `<div class="eai-export-cell-sub">${escapeHtml(dateLabel)}</div>`
        : '';
    return `<span class="eai-export-pill eai-export-pill--yes">Sim</span>${dateLine}`;
}

function formatExternalAssemblyInspectionExportApprovedCell(activity) {
    if (!activity?.isDone) return '—';
    const approverName = activity.doneBy?.name || '—';
    const approvedAt = activity.doneAt
        ? formatExternalAssemblyInspectionExportDateTime(activity.doneAt)
        : '—';
    return `
        <div class="eai-export-approved">
            <div class="eai-export-approved__name">${escapeHtml(approverName)}</div>
            <div class="eai-export-cell-sub">${escapeHtml(approvedAt)}</div>
        </div>
    `;
}

function renderExternalAssemblyInspectionInspectionSummaryHtml(inspection) {
    const statusLabel = formatExternalAssemblyInspectionStatus(inspection.status);
    const meta = buildExternalAssemblyInspectionSummaryMeta(inspection);

    return `
        <section class="order-export-section eai-export-summary-section">
            <h2 class="order-export-section__title">Resumo da vistoria</h2>
            <div class="order-export-card eai-export-summary-card">
                <div class="order-export-fields order-export-fields--grid">
                    ${eaiExportField('Vistoria', `#${inspection.id}`)}
                    ${eaiExportField('Status', statusLabel)}
                    ${eaiExportField('Criado por', meta.creatorName)}
                    ${eaiExportField('Criado em', meta.createdAt)}
                    ${eaiExportField('Finalizado por', meta.finalizedBy)}
                    ${eaiExportField('Finalizado em', meta.finalizedAt)}
                </div>
            </div>
        </section>
    `;
}

function renderExternalAssemblyInspectionExportHtml(snapshot, order = null) {
    const { inspection, projects } = snapshot;
    const orderCode = order?.orderCode || '';
    const clientName = typeof getOrderClientName === 'function' ? getOrderClientName(order) : '';

    const observationBlock = inspection.observation
        ? `<p class="order-export-note">${escapeHtml(inspection.observation)}</p>`
        : eaiExportEmptyMessage('Sem observação.');

    const projectsHtml = (projects || []).map((project, index) => {
        const projectMeta = project.orderProject || {};
        const projectLabel = getExternalAssemblyInspectionProjectName(projectMeta);
        const projectStatus = formatExternalAssemblyInspectionStatus(project.status);

        const rows = (project.activities || []).map(activity => {
            const doneCell = formatExternalAssemblyInspectionExportDoneCell(activity);
            const approvedCell = formatExternalAssemblyInspectionExportApprovedCell(activity);
            const responseText = String(activity.responseComment || '').trim() || '—';
            const creationImg = renderExternalAssemblyInspectionExportImages(
                activity.creationImageUrl,
                'Imagem da atividade'
            );
            const responseImg = renderExternalAssemblyInspectionExportImages(
                activity.responseImageUrl,
                'Imagem da resposta'
            );

            return `
                <tr class="eai-export-activity-row">
                    <td class="eai-export-col-activity">
                        <p class="eai-export-activity-text">${escapeHtml(activity.description || '—')}</p>
                        ${creationImg ? `<div class="eai-export-cell-images">${creationImg}</div>` : ''}
                    </td>
                    <td class="eai-export-col-done">${doneCell}</td>
                    <td class="eai-export-col-approved">${approvedCell}</td>
                    <td class="eai-export-col-response">
                        <p class="eai-export-response-text">${escapeHtml(responseText)}</p>
                        ${responseImg ? `<div class="eai-export-cell-images">${responseImg}</div>` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        const pageBreakClass = index > 0 ? ' order-export-section--page-break' : '';
        return `
            <section class="order-export-card eai-export-project-card${pageBreakClass}">
                <div class="eai-export-project-head">
                    <h3 class="order-export-subheading">${escapeHtml(projectLabel)}</h3>
                    <span class="eai-export-pill eai-export-pill--status">${escapeHtml(projectStatus)}</span>
                </div>
                <table class="order-export-table eai-export-activities-table">
                    <thead>
                        <tr>
                            <th>Atividade</th>
                            <th class="eai-export-th-narrow">Realizado</th>
                            <th class="eai-export-th-medium">Aprovado por</th>
                            <th>Resposta do gestor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan="4">${eaiExportEmptyMessage('Sem atividades.')}</td></tr>`}
                    </tbody>
                </table>
            </section>
        `;
    }).join('');

    return `
        <div class="order-export-document eai-export-document">
            <header class="order-export-header eai-export-header">
                <h1 class="order-export-header__title">Vistoria de Montagem Externa</h1>
                <p class="order-export-header__meta eai-export-header__primary">
                    ${escapeHtml(orderCode)}${clientName ? ` · ${escapeHtml(clientName)}` : ''}
                </p>
            </header>
            ${renderExternalAssemblyInspectionInspectionSummaryHtml(inspection)}
            <section class="order-export-section">
                <h2 class="order-export-section__title">Observação</h2>
                <div class="order-export-card">
                    ${observationBlock}
                </div>
            </section>
            <section class="order-export-section">
                <h2 class="order-export-section__title">Projetos e atividades</h2>
                ${projectsHtml || eaiExportEmptyMessage('Nenhum projeto na vistoria.')}
            </section>
        </div>
    `;
}

async function resolveExternalAssemblyInspectionExportOrder(orderId) {
    let order = typeof resolveOrderForExternalAssemblyInspection === 'function'
        ? resolveOrderForExternalAssemblyInspection(orderId)
        : null;
    if (order?.orderCode || !orderId) return order;

    try {
        const { data, error } = await supabaseClient
            .from('salesOrders')
            .select(`orderCode, client:Client(name), consultant:appUsers!salesOrders_consultantUserId_fkey(name)`)
            .eq('id', Number(orderId))
            .maybeSingle();
        if (!error && data) return data;
    } catch (error) {
        console.warn('resolveExternalAssemblyInspectionExportOrder:', error);
    }
    return order;
}

async function exportExternalAssemblyInspectionPdf() {
    const snapshot = buildExternalAssemblyInspectionExportSnapshot();
    if (!snapshot) {
        alertAppDialog('Abra uma vistoria para gerar o PDF.');
        return;
    }

    const button = document.getElementById('btn-eai-detail-export-pdf');
    const originalLabel = button?.textContent;
    if (button) {
        button.disabled = true;
        button.textContent = 'Gerando...';
    }

    try {
        let exportSnapshot = snapshot;
        if (snapshot.inspection?.id) {
            const detail = await fetchExternalAssemblyInspectionDetail(snapshot.inspection.id);
            if (detail) {
                const hydrated = await hydrateExternalAssemblyInspectionDetailImages(detail);
                exportSnapshot = mergeExternalAssemblyInspectionExportSnapshot(snapshot, hydrated);
            }
        }

        const order = await resolveExternalAssemblyInspectionExportOrder(exportSnapshot.inspection.orderId);
        const root = document.getElementById('eai-export-print-root');
        if (!root) {
            throw new Error('Container de impressão não encontrado.');
        }

        root.innerHTML = renderExternalAssemblyInspectionExportHtml(exportSnapshot, order);
        document.body.classList.add('eai-export-printing');
        window.print();
        window.addEventListener('afterprint', () => {
            document.body.classList.remove('eai-export-printing');
            root.innerHTML = '';
        }, { once: true });
    } catch (error) {
        console.error('exportExternalAssemblyInspectionPdf:', error);
        alertAppDialog('Erro ao gerar PDF: ' + (error.message || error));
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalLabel || 'Gerar PDF';
        }
    }
}

async function openExternalAssemblyInspectionDetailModal(inspectionId, options = {}) {
    if (!options.keepOverlay) {
        primeExternalAssemblyInspectionDriveUpload();
        eaiDetailOverlay?.setLoading(false);
    }

    closeExternalAssemblyInspectionListModal();
    const mountLoading = document.getElementById('eai-detail-projects-mount');
    if (mountLoading) mountLoading.innerHTML = '<p class="text-xs text-slate-400 py-6 text-center">Carregando...</p>';
    toggleModal('external-assembly-inspection-detail-modal', true);

    try {
        let detail = await fetchExternalAssemblyInspectionDetail(inspectionId);
        if (!detail) {
            alertAppDialog('Vistoria não encontrada.');
            closeExternalAssemblyInspectionDetailModal();
            return;
        }
        detail = await hydrateExternalAssemblyInspectionDetailImages(detail);
        eaiDetailState = detail;
        renderExternalAssemblyInspectionDetail(detail);
    } catch (error) {
        alertAppDialog(error.message || 'Erro ao carregar vistoria.');
        closeExternalAssemblyInspectionDetailModal();
    }
}

async function saveExternalAssemblyInspectionDetail() {
    if (!eaiDetailState?.inspection?.id) return;

    const inspectionId = eaiDetailState.inspection.id;
    const inspectionOpen = eaiDetailState.inspection.status === EAI_STATUS_OPEN;
    const now = new Date().toISOString();
    let anyActivityDone = false;
    const imageUploadQueue = [];

    try {
        eaiDetailOverlay?.setLoading(true, 'Salvando alterações...');

        const inspection = eaiDetailState.inspection;
        const canEditObservation = inspectionOpen
            && (isExternalAssemblyInspectionCreator(inspection)
                || (typeof isAdmin === 'function' && isAdmin()));

        if (canEditObservation) {
            const observation = document.getElementById('eai-detail-observation')?.value.trim() || null;
            await supabaseClient
                .from('ExternalAssemblyInspection')
                .update({
                    observation,
                    updatedAt: now,
                    updatedById: currentUser?.id || null
                })
                .eq('id', inspectionId);
        }

        let rows = document.querySelectorAll('#eai-detail-projects-mount tr[data-activity-id]');

        if ([...rows].some(row => isExternalAssemblyInspectionDetailDraftRow(row))) {
            eaiDetailOverlay?.setLoading(true, 'Salvando novas atividades...');
        }
        const draftImageQueue = await persistExternalAssemblyInspectionDetailDraftActivities(rows, now);
        imageUploadQueue.push(...draftImageQueue);

        rows = document.querySelectorAll('#eai-detail-projects-mount tr[data-activity-id]');

        if ([...rows].some(row => !isExternalAssemblyInspectionDetailDraftRow(row)
            && row.querySelector('.eai-detail-activity-description'))) {
            eaiDetailOverlay?.setLoading(true, 'Atualizando descrições das atividades...');
        }

        for (const row of rows) {
            if (isExternalAssemblyInspectionDetailDraftRow(row)) continue;

            const activityId = Number(row.dataset.activityId);
            if (!activityId) continue;

            const inspectionProjectId = Number(row.dataset.inspectionProjectId);
            const projectRow = eaiDetailState.projects.find(item => Number(item.id) === inspectionProjectId);
            if (!projectRow || !canEditExternalAssemblyInspectionActivities(inspection, projectRow)) continue;

            const descriptionInput = row.querySelector('.eai-detail-activity-description');
            if (!descriptionInput) continue;

            const description = descriptionInput.value.trim();
            if (!description) {
                throw new Error('Informe a descrição de todas as atividades.');
            }

            const previous = findExternalAssemblyInspectionActivityInState(activityId);
            if (previous && String(previous.description || '').trim() === description) continue;

            const { error: descriptionError } = await supabaseClient
                .from('ExternalAssemblyInspectionActivity')
                .update({ description, updatedAt: now })
                .eq('id', activityId);
            if (descriptionError) throw descriptionError;
            if (previous) previous.description = description;
        }

        for (const row of rows) {
            if (isExternalAssemblyInspectionDetailDraftRow(row)) continue;

            const pendingCreation = row._creationImageFile;
            if (!pendingCreation) continue;

            const activityId = Number(row.dataset.activityId);
            if (!activityId) continue;
            const inspectionProjectId = Number(row.dataset.inspectionProjectId);
            const projectRow = eaiDetailState.projects.find(item => Number(item.id) === inspectionProjectId);
            if (!projectRow || !canEditExternalAssemblyInspectionActivities(inspection, projectRow)) continue;

            const orderProject = projectRow.orderProject || {};
            imageUploadQueue.push({
                file: pendingCreation,
                activityId,
                context: {
                    orderId: eaiDetailState.inspection.orderId,
                    orderProjectId: orderProject.id,
                    orderCode: orderProject.order?.orderCode || '',
                    projectName: orderProject.name || '',
                    inspectionId,
                    response: false
                }
            });
        }

        if (canRespondExternalAssemblyInspectionActivity()) {
            eaiDetailOverlay?.setLoading(true, 'Atualizando respostas do gestor...');
            for (const row of rows) {
                if (isExternalAssemblyInspectionDetailDraftRow(row)) continue;

                const activityId = Number(row.dataset.activityId);
                if (!activityId) continue;

                const isDone = Boolean(row.querySelector('.eai-activity-done')?.checked);
                const responseComment = row.querySelector('.eai-activity-response')?.value.trim() || null;
                const previous = findExternalAssemblyInspectionActivityInState(activityId);
                const wasDone = Boolean(previous?.isDone);

                await supabaseClient
                    .from('ExternalAssemblyInspectionActivity')
                    .update({
                        isDone,
                        responseComment,
                        doneAt: isDone ? (previous?.doneAt || now) : null,
                        doneById: isDone ? (previous?.doneById || currentUser?.id || null) : null,
                        updatedAt: now
                    })
                    .eq('id', activityId);

                if (isDone && !wasDone) {
                    anyActivityDone = true;
                    const inspectionProjectId = Number(row.dataset.inspectionProjectId);
                    if (inspectionProjectId) {
                        const projectRow = eaiDetailState.projects.find(item => Number(item.id) === inspectionProjectId);
                        if (projectRow?.status === EAI_STATUS_OPEN) {
                            await supabaseClient
                                .from('ExternalAssemblyInspectionProject')
                                .update({ status: EAI_STATUS_IN_PROGRESS, updatedAt: now })
                                .eq('id', inspectionProjectId);
                        }
                    }
                }

                const pendingFile = row._responseImageFile;
                if (pendingFile) {
                    const projectRow = eaiDetailState.projects.find(p =>
                        (p.activities || []).some(a => Number(a.id) === activityId)
                    );
                    const orderProject = projectRow?.orderProject || {};
                    imageUploadQueue.push({
                        file: pendingFile,
                        activityId,
                        context: {
                            orderId: eaiDetailState.inspection.orderId,
                            orderProjectId: orderProject.id,
                            orderCode: orderProject.order?.orderCode || '',
                            projectName: orderProject.name || '',
                            inspectionId,
                            response: true
                        }
                    });
                    delete row._responseImageFile;
                }
            }
        }

        if (imageUploadQueue.length) {
            await persistExternalAssemblyInspectionActivityImages(imageUploadQueue);
        }

        if (canChangeExternalAssemblyInspectionStatus()) {
            eaiDetailOverlay?.setLoading(true, 'Atualizando status da vistoria...');
            if (anyActivityDone) {
                await promoteExternalAssemblyInspectionToInProgress(inspectionId);
            }
            await recomputeExternalAssemblyInspectionStatuses(inspectionId);
        }

        eaiDetailOverlay?.setLoading(true, 'Atualizando tela...');
        await openExternalAssemblyInspectionDetailModal(inspectionId, { keepOverlay: true });
        eaiDetailOverlay?.setLoading(true, 'Alterações salvas com sucesso!', 'success');
        await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
        alertAppDialog(error.message || 'Erro ao salvar.');
    } finally {
        eaiDetailOverlay?.setLoading(false);
    }
}

function findExternalAssemblyInspectionActivityInState(activityId) {
    for (const project of eaiDetailState?.projects || []) {
        const found = (project.activities || []).find(item => Number(item.id) === Number(activityId));
        if (found) return found;
    }
    return null;
}

async function deleteExternalAssemblyInspection() {
    const inspection = eaiDetailState?.inspection;
    if (!inspection || inspection.status !== EAI_STATUS_OPEN) return;
    if (!isExternalAssemblyInspectionCreator(inspection) && !(typeof isAdmin === 'function' && isAdmin())) {
        alertAppDialog('Somente quem criou a vistoria pode excluí-la enquanto estiver aberta.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return;
    }
    if (!(await confirmAppDialog('Excluir esta vistoria inteira?', { variant: 'danger', confirmLabel: 'Excluir' }))) return;

    try {
        eaiDetailOverlay?.setLoading(true, 'Excluindo...');
        const { error } = await supabaseClient
            .from('ExternalAssemblyInspection')
            .delete()
            .eq('id', eaiDetailState.inspection.id);
        if (error) throw error;
        closeExternalAssemblyInspectionDetailModal();
    } catch (error) {
        alertAppDialog(error.message || 'Erro ao excluir.');
    } finally {
        eaiDetailOverlay?.setLoading(false);
    }
}

async function removeExternalAssemblyInspectionProject(button) {
    const section = button.closest('[data-inspection-project-id]');
    const inspectionProjectId = Number(section?.dataset.inspectionProjectId);
    const project = eaiDetailState?.projects?.find(item => Number(item.id) === inspectionProjectId);
    const inspection = eaiDetailState?.inspection;
    if (!project || !inspection || !canEditExternalAssemblyInspectionActivities(inspection, project)) {
        alertAppDialog('Somente quem criou a vistoria pode alterar atividades enquanto o projeto estiver aberto.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return;
    }
    if (!(await confirmAppDialog('Excluir este projeto da vistoria?', { variant: 'danger', confirmLabel: 'Excluir' }))) return;

    const { error } = await supabaseClient
        .from('ExternalAssemblyInspectionProject')
        .delete()
        .eq('id', inspectionProjectId);
    if (error) {
        alertAppDialog(error.message);
        return;
    }
    await recomputeExternalAssemblyInspectionStatuses(eaiDetailState.inspection.id);
    await openExternalAssemblyInspectionDetailModal(eaiDetailState.inspection.id);
}

async function removeExternalAssemblyInspectionActivity(button) {
    const row = button.closest('tr[data-activity-id]');
    const activityId = Number(row?.dataset.activityId);
    const inspectionProjectId = Number(row?.dataset.inspectionProjectId);
    const project = eaiDetailState?.projects?.find(item => Number(item.id) === inspectionProjectId);
    const inspection = eaiDetailState?.inspection;
    if (!project || !inspection || !canEditExternalAssemblyInspectionActivities(inspection, project)) {
        alertAppDialog('Somente quem criou a vistoria pode alterar atividades enquanto o projeto estiver aberto.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return;
    }

    const remaining = (project.activities || []).filter(item => Number(item.id) !== activityId);
    if (!remaining.length) {
        alertAppDialog('O projeto precisa de ao menos uma atividade.');
        return;
    }
    if (!(await confirmAppDialog('Excluir esta atividade?', { variant: 'danger', confirmLabel: 'Excluir' }))) return;

    const { error } = await supabaseClient
        .from('ExternalAssemblyInspectionActivity')
        .delete()
        .eq('id', activityId);
    if (error) {
        alertAppDialog(error.message);
        return;
    }
    await openExternalAssemblyInspectionDetailModal(eaiDetailState.inspection.id);
}

function bindExternalAssemblyInspectionEvents() {
    document.getElementById('btn-eai-list-close')?.addEventListener('click', closeExternalAssemblyInspectionListModal);
    document.getElementById('btn-eai-list-close-footer')?.addEventListener('click', closeExternalAssemblyInspectionListModal);
    document.getElementById('btn-eai-list-create')?.addEventListener('click', () => {
        const orderId = eaiListState?.orderId ?? activeOrderId;
        const preselectOrderProjectId = eaiListState?.orderProjectId;
        closeExternalAssemblyInspectionListModal();
        void openExternalAssemblyInspectionCreateModal(orderId, { preselectOrderProjectId });
    });

    document.getElementById('btn-eai-create-close')?.addEventListener('click', closeExternalAssemblyInspectionCreateModal);
    document.getElementById('btn-eai-create-cancel')?.addEventListener('click', closeExternalAssemblyInspectionCreateModal);
    document.getElementById('eai-create-form')?.addEventListener('submit', event => {
        void submitExternalAssemblyInspectionCreate(event);
    });

    document.getElementById('btn-eai-create-add-project')?.addEventListener('click', () => {
        const select = document.getElementById('eai-create-add-project');
        const orderProjectId = Number(select?.value);
        if (!orderProjectId) return;
        const project = eaiCreateState?.availableProjects?.find(item => Number(item.orderProjectId) === orderProjectId);
        if (!project) return;
        const mount = document.getElementById('eai-create-projects-mount');
        mount?.appendChild(renderExternalAssemblyInspectionCreateProjectSection(project));
        refreshExternalAssemblyInspectionCreateProjectSelect();
        syncExternalAssemblyInspectionCreateEmptyState();
    });

    document.getElementById('eai-create-image-input')?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !eaiCreateImageTarget?.row) return;
        const row = eaiCreateImageTarget.row;
        void applyExternalAssemblyInspectionPickedImageFile(file, prepared => {
            row._imageFile = prepared;
            syncExternalAssemblyInspectionCreateActivityImageUi(row);
        });
    });

    document.getElementById('btn-eai-detail-close')?.addEventListener('click', closeExternalAssemblyInspectionDetailModal);
    document.getElementById('btn-eai-detail-close-footer')?.addEventListener('click', closeExternalAssemblyInspectionDetailModal);
    document.getElementById('btn-eai-detail-export-pdf')?.addEventListener('click', () => {
        void exportExternalAssemblyInspectionPdf();
    });
    document.getElementById('btn-eai-detail-save')?.addEventListener('click', () => void saveExternalAssemblyInspectionDetail());
    document.getElementById('btn-eai-detail-delete')?.addEventListener('click', () => void deleteExternalAssemblyInspection());

    document.getElementById('eai-detail-image-input')?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !eaiDetailImageTarget?.row || eaiDetailImageTarget.response) return;
        const row = eaiDetailImageTarget.row;
        void applyExternalAssemblyInspectionPickedImageFile(file, prepared => {
            row._creationImageFile = prepared;
            syncExternalAssemblyInspectionDetailCreationImageUi(row);
            eaiDetailImageTarget = null;
        });
    });

    document.getElementById('eai-detail-response-image-input')?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !eaiDetailImageTarget?.row || !eaiDetailImageTarget.response) return;
        const row = eaiDetailImageTarget.row;
        void applyExternalAssemblyInspectionPickedImageFile(file, prepared => {
            row._responseImageFile = prepared;
            syncExternalAssemblyInspectionDetailResponseImageUi(row);
            eaiDetailImageTarget = null;
        });
    });

    document.getElementById('btn-project-view-external-assembly-inspection')?.addEventListener('click', () => {
        const projectId = Number(orderProjectViewContext?.orderProjectId || orderProjectViewContext?.projectId);
        const label = orderProjectViewContext?.projectLabel || '';
        if (!projectId) return;
        void openExternalAssemblyInspectionListModal(projectId, label);
    });

    document.addEventListener('click', event => {
        const imageOpenBtn = event.target.closest('[data-eai-open-image-url]');
        if (imageOpenBtn) {
            const url = imageOpenBtn.dataset.eaiOpenImageUrl;
            if (url && typeof openImageAttachmentLightbox === 'function') {
                openImageAttachmentLightbox(url, imageOpenBtn.getAttribute('title') || 'Imagem');
            }
            return;
        }

        const createPreview = event.target.closest(
            '#external-assembly-inspection-create-modal .revision-activity-attachment-item__preview, '
            + '#external-assembly-inspection-detail-modal .revision-activity-attachment-item__preview'
        );
        if (createPreview) {
            const src = createPreview.currentSrc || createPreview.src;
            if (src && typeof openImageAttachmentLightbox === 'function') {
                openImageAttachmentLightbox(src, createPreview.getAttribute('alt') || 'Imagem');
            }
            return;
        }

        const kanbanBtn = event.target.closest('.gestao-kanban-eai-btn');
        if (kanbanBtn) {
            const projectId = Number(kanbanBtn.dataset.orderProjectId);
            const label = kanbanBtn.dataset.projectLabel || '';
            if (projectId) void openExternalAssemblyInspectionListModal(projectId, label);
        }
    });
}

function syncProjectViewExternalAssemblyInspectionButton(project, statusName) {
    const button = document.getElementById('btn-project-view-external-assembly-inspection');
    if (!button) return;
    const show = statusName === EAI_ORDER_PROJECT_STATUS;
    button.classList.toggle('hidden', !show);
}

window.canCreateExternalAssemblyInspection = canCreateExternalAssemblyInspection;
window.canRespondExternalAssemblyInspectionActivity = canRespondExternalAssemblyInspectionActivity;
window.canChangeExternalAssemblyInspectionStatus = canChangeExternalAssemblyInspectionStatus;
window.canEditExternalAssemblyInspectionActivities = canEditExternalAssemblyInspectionActivities;
window.isExternalAssemblyInspectionCreator = isExternalAssemblyInspectionCreator;
window.enrichOrderProjectActionsWithExternalAssemblyInspection = enrichOrderProjectActionsWithExternalAssemblyInspection;
window.openExternalAssemblyInspectionCreateModal = openExternalAssemblyInspectionCreateModal;
window.openExternalAssemblyInspectionListModal = openExternalAssemblyInspectionListModal;
window.openExternalAssemblyInspectionDetailModal = openExternalAssemblyInspectionDetailModal;
window.assertOrderProjectMontagemExternaExitAllowed = assertOrderProjectMontagemExternaExitAllowed;
window.hasUnfinishedExternalAssemblyInspectionForProject = hasUnfinishedExternalAssemblyInspectionForProject;
window.syncProjectViewExternalAssemblyInspectionButton = syncProjectViewExternalAssemblyInspectionButton;
window.bindExternalAssemblyInspectionEvents = bindExternalAssemblyInspectionEvents;
window.summarizeExternalAssemblyInspectionsForDisplay = summarizeExternalAssemblyInspectionsForDisplay;
window.buildExternalAssemblyInspectionKanbanButtonLabel = buildExternalAssemblyInspectionKanbanButtonLabel;
window.normalizeExternalAssemblyInspectionKanbanButtonTone = normalizeExternalAssemblyInspectionKanbanButtonTone;
window.fetchExternalAssemblyInspectionSummaryByOrderProjectIds = fetchExternalAssemblyInspectionSummaryByOrderProjectIds;
window.exportExternalAssemblyInspectionPdf = exportExternalAssemblyInspectionPdf;
window.getExternalAssemblyInspectionProjectName = getExternalAssemblyInspectionProjectName;
