let detailingDriveContext = null;
let detailingDriveFilesCache = [];
let detailingDescriptiveFileCache = null;

async function resolveDetailingDescriptiveOrderId() {
    if (typeof activeDetalhamentoOrderId !== 'undefined' && activeDetalhamentoOrderId) {
        return Number(activeDetalhamentoOrderId);
    }

    const projectId = Number(activeDetalhamentoOrderProjectId);
    if (!projectId) return null;

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('orderId')
        .eq('id', projectId)
        .maybeSingle();

    if (error) {
        console.warn('resolveDetailingDescriptiveOrderId:', error);
        return null;
    }

    return Number(data?.orderId) || null;
}

function resetDetailingDescriptiveSection() {
    detailingDescriptiveFileCache = null;
    const section = document.getElementById('detalhamento-descriptive-section');
    section?.classList.add('hidden');
}

async function loadDetailingDescriptiveSection() {
    const section = document.getElementById('detalhamento-descriptive-section');
    const nameEl = document.getElementById('detalhamento-descriptive-name');
    const metaEl = document.getElementById('detalhamento-descriptive-meta');
    if (!section) return;

    detailingDescriptiveFileCache = null;
    section.classList.add('hidden');

    const orderId = await resolveDetailingDescriptiveOrderId();
    if (!orderId || typeof fetchSalesOrderDescriptiveDriveFile !== 'function') {
        return;
    }

    try {
        const file = await fetchSalesOrderDescriptiveDriveFile(orderId);
        if (!file?.id) return;

        detailingDescriptiveFileCache = file;
        section.classList.remove('hidden');
        if (nameEl) {
            nameEl.textContent = file.fileName || 'Descritivo.pdf';
            nameEl.title = file.fileName || 'Descritivo.pdf';
        }
        if (metaEl) {
            const size = typeof formatDriveFileSize === 'function'
                ? formatDriveFileSize(file.fileSizeBytes)
                : '';
            const updated = file.updatedAt && typeof formatDetailingDriveDate === 'function'
                ? formatDetailingDriveDate(file.updatedAt)
                : '';
            metaEl.textContent = 'Mesmo arquivo para todos os projetos deste pedido.'
                + (size || updated ? ` ${[size, updated].filter(Boolean).join(' · ')}` : '');
        }
    } catch (error) {
        console.warn('loadDetailingDescriptiveSection:', error);
    }
}

function openDetailingDriveFileView(file) {
    if (!file) {
        alertAppDialog('Não foi possível abrir o arquivo.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    let url = '';
    if (typeof resolveDriveFilePdfBrowserOpenUrl === 'function') {
        url = resolveDriveFilePdfBrowserOpenUrl(file);
    }
    if (!url && typeof resolveDriveFileViewUrl === 'function') {
        url = resolveDriveFileViewUrl(file);
    }
    if (!url) {
        url = String(file?.url || '').trim();
    }
    if (!url) {
        alertAppDialog('Não foi possível abrir o arquivo.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

function viewDetailingDescriptiveFile() {
    openDetailingDriveFileView(detailingDescriptiveFileCache);
}

function downloadDetailingDescriptiveFile() {
    const file = detailingDescriptiveFileCache;
    const url = typeof resolveDriveFileDownloadUrl === 'function'
        ? resolveDriveFileDownloadUrl(file)
        : file?.url;
    if (!url) {
        alertAppDialog('Não foi possível gerar o link de download.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

function formatDetailingDriveDate(isoDate) {
    if (!isoDate || typeof formatDate !== 'function') return '';
    return formatDate(isoDate);
}

function setDetailingDriveStatus(message, isError = false) {
    const el = document.getElementById('detalhamento-drive-status');
    if (!el) return;
    if (!message) {
        el.textContent = '';
        el.classList.add('hidden');
        return;
    }
    el.textContent = message;
    el.classList.toggle('text-red-600', isError);
    el.classList.toggle('text-slate-500', !isError);
    el.classList.remove('hidden');
}

function detailingDriveEntityParams() {
    return {
        folderKind: DRIVE_FILE_FOLDER_KIND.DETAILING,
        entityType: DRIVE_FILE_ENTITY_TYPE.DETAILING,
        entityId: Number(activeDetalhamentoRecord?.id || 0)
    };
}

async function resolveDetailingDriveContextForRecord(orderProjectId, record, projectNameFallback = 'Projeto') {
    const entityId = Number(record?.id || 0);
    if (!orderProjectId || !entityId) return null;

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('id, name, projectCode, orderId, order:salesOrders(orderCode, client:Client(name))')
        .eq('id', orderProjectId)
        .maybeSingle();

    if (error) {
        console.warn('resolveDetailingDriveContextForRecord:', error);
    }

    const orderCode = data?.order?.orderCode || '';
    const projectName = data?.name || projectNameFallback;
    const clientName = (typeof getOrderClientName === 'function' && getOrderClientName(data?.order))
        || data?.order?.client?.name
        || '';
    if (!orderCode || !projectName) return null;

    const params = {
        folderKind: DRIVE_FILE_FOLDER_KIND.DETAILING,
        entityType: DRIVE_FILE_ENTITY_TYPE.DETAILING,
        entityId
    };

    return {
        ...params,
        orderCode,
        clientName,
        projectName,
        orderId: Number(data?.orderId || 0) || null,
        orderProjectId: Number(orderProjectId),
        folderPath: buildDriveFolderPath(orderCode, projectName, params.folderKind)
    };
}

async function resolveDetailingDriveContext() {
    return resolveDetailingDriveContextForRecord(
        Number(activeDetalhamentoOrderProjectId),
        activeDetalhamentoRecord,
        activeDetalhamentoProjectName || 'Projeto'
    );
}

function renderDetailingDriveFiles(files = []) {
    const list = document.getElementById('detalhamento-drive-list');
    if (!list) return;
    detailingDriveFilesCache = Array.isArray(files) ? files : [];

    if (!detailingDriveFilesCache.length) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">Nenhum arquivo nesta pasta.</p>';
        return;
    }

    list.innerHTML = detailingDriveFilesCache.map(file => {
        const name = escapeHtml(file.fileName || 'arquivo');
        const size = escapeHtml(formatDriveFileSize(file.fileSizeBytes));
        const updated = escapeHtml(formatDetailingDriveDate(file.updatedAt));
        return `
            <div class="flex items-center justify-between gap-2 py-2 px-2 rounded-lg border border-slate-100 bg-slate-50/70">
                <div class="min-w-0">
                    <p class="text-xs font-medium text-slate-800 truncate" title="${name}">${name}</p>
                    <p class="text-[10px] text-slate-400">${size}${updated ? ` · ${updated}` : ''}</p>
                </div>
                <div class="flex shrink-0 flex-wrap gap-1">
                    <button type="button"
                        data-drive-file-view="${Number(file.id) || 0}"
                        class="text-xs bg-indigo-700 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-indigo-800">
                        Ver
                    </button>
                    <button type="button"
                        data-drive-file-download="${Number(file.id) || 0}"
                        class="text-xs bg-white border border-indigo-200 text-indigo-800 px-2.5 py-1 rounded-lg font-medium hover:bg-indigo-50">
                        Baixar
                    </button>
                    ${typeof isAdmin === 'function' && isAdmin() ? `
                    <button type="button"
                        data-drive-file-delete="${Number(file.id) || 0}"
                        class="text-xs bg-white border border-red-200 text-red-700 px-2.5 py-1 rounded-lg font-medium hover:bg-red-50">
                        Excluir
                    </button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function viewDetailingDriveFile(fileId) {
    const file = detailingDriveFilesCache.find(item => Number(item.id) === Number(fileId));
    openDetailingDriveFileView(file);
}

async function deleteDetailingDriveFile(fileId) {
    if (typeof isAdmin !== 'function' || !isAdmin()) return;
    const file = detailingDriveFilesCache.find(item => Number(item.id) === Number(fileId));
    if (!file || typeof deleteDriveFileRecord !== 'function') return;

    const confirmed = await confirmAppDialog(
        `Excluir o arquivo "${file.fileName || 'arquivo'}"?`,
        { title: 'Excluir arquivo', confirmLabel: 'Excluir' }
    );
    if (!confirmed) return;

    const setLoading = typeof setDetalhamentoModalLoading === 'function' ? setDetalhamentoModalLoading : null;
    const waitStatus = typeof waitDetalhamentoStatus === 'function' ? waitDetalhamentoStatus : waitAppOverlay;
    try {
        setLoading?.(true, 'Excluindo arquivo...');
        await deleteDriveFileRecord(file);
        setLoading?.(true, 'Arquivo excluído.', 'success');
        await waitStatus(typeof APP_OVERLAY_SUCCESS_MS === 'number' ? APP_OVERLAY_SUCCESS_MS : 1800);
        setLoading?.(false);
        await loadDetailingDriveFiles();
    } catch (error) {
        setLoading?.(true, error.message || 'Não foi possível excluir o arquivo.', 'error');
        await waitStatus(typeof APP_OVERLAY_ERROR_MS === 'number' ? APP_OVERLAY_ERROR_MS : 4000);
        setLoading?.(false);
    }
}

function downloadDetailingDriveFile(fileId) {
    const file = detailingDriveFilesCache.find(item => Number(item.id) === Number(fileId));
    const url = resolveDriveFileDownloadUrl(file);
    if (!url) {
        alertAppDialog('Não foi possível gerar o link de download.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function loadDetailingDriveFiles() {
    const pathEl = document.getElementById('detalhamento-drive-path');
    const section = document.getElementById('detalhamento-drive-section');
    if (!section || section.classList.contains('hidden')) return;

    clearDetailingDriveFileSelection();

    setDetailingDriveStatus('Carregando arquivos...');
    try {
        detailingDriveContext = await resolveDetailingDriveContext();
        if (!detailingDriveContext) {
            setDetailingDriveStatus('Não foi possível identificar o detalhamento, o pedido e o projeto.', true);
            renderDetailingDriveFiles([]);
            return;
        }

        if (pathEl) {
            pathEl.textContent = detailingDriveContext.folderPath;
        }

        const files = await fetchDriveFiles(detailingDriveEntityParams());
        renderDetailingDriveFiles(files);
        setDetailingDriveStatus('');
    } catch (error) {
        console.error('loadDetailingDriveFiles:', error);
        renderDetailingDriveFiles([]);
        setDetailingDriveStatus(error.message || 'Erro ao carregar os arquivos.', true);
    }
}

const DETAILING_DRIVE_PROJECT_ACCEPT = '.zip,.rar,application/zip,application/vnd.rar,application/x-rar-compressed';
const DETAILING_DRIVE_PDF_ACCEPT = '.pdf,application/pdf';

let detailingDriveUploadKindInput = null;
let detailingDrivePendingFile = null;
let detailingDrivePendingKind = 'detailing';

function syncDetailingDriveSendButton() {
    const button = document.getElementById('btn-detalhamento-drive-send');
    if (!button) return;
    button.disabled = !detailingDrivePendingFile;
}

function clearDetailingDriveFileSelection() {
    detailingDrivePendingFile = null;
    detailingDrivePendingKind = 'detailing';
    const input = document.getElementById('detalhamento-drive-file-input');
    if (input) input.value = '';
    const nameEl = document.getElementById('detalhamento-drive-selected-name');
    if (nameEl) {
        nameEl.textContent = '';
        nameEl.classList.add('hidden');
    }
    syncDetailingDriveSendButton();
}

function detailingDriveFileExtension(fileName) {
    const name = String(fileName || '');
    const dot = name.lastIndexOf('.');
    if (dot < 0) return '';
    return name.slice(dot + 1).toLowerCase();
}

function validateDetailingDriveUploadByKind(files, uploadKind) {
    const list = Array.from(files || []);
    const isProject = uploadKind === 'project';
    const allowed = isProject ? ['zip', 'rar'] : ['pdf'];
    const label = isProject ? 'RAR ou ZIP' : 'PDF';
    const invalid = list.find(file => !allowed.includes(detailingDriveFileExtension(file?.name)));
    if (invalid) {
        return `O arquivo "${invalid.name}" não é permitido. Envie apenas ${label}.`;
    }
    const maxBytes = typeof DRIVE_FILE_MAX_BYTES === 'number' ? DRIVE_FILE_MAX_BYTES : (100 * 1024 * 1024);
    const tooLarge = list.find(file => Number(file?.size) > maxBytes);
    if (tooLarge) {
        return `O arquivo "${tooLarge.name}" passa de 100 MB. Envie arquivos menores.`;
    }
    return '';
}

function openDetailingDriveUploadKindModal(input) {
    if (!input) return;
    detailingDriveUploadKindInput = input;
    toggleModal('detailing-drive-upload-kind-modal', true);
}

function closeDetailingDriveUploadKindModal() {
    detailingDriveUploadKindInput = null;
    toggleModal('detailing-drive-upload-kind-modal', false);
}

function chooseDetailingDriveUploadKind(uploadKind) {
    const input = detailingDriveUploadKindInput;
    closeDetailingDriveUploadKindModal();
    if (!input) return;
    input.accept = uploadKind === 'project' ? DETAILING_DRIVE_PROJECT_ACCEPT : DETAILING_DRIVE_PDF_ACCEPT;
    input.multiple = false;
    input.dataset.uploadKind = uploadKind;
    input.value = '';
    input.click();
}

async function uploadFilesToDetailingDrive(fileList, context, options = {}) {
    const files = Array.from(fileList || []);
    if (!files.length || !context) return false;

    const uploadKind = options.uploadKind === 'project' ? 'project' : 'detailing';

    if (!isGoogleDriveAppsScriptConfigured()) {
        alertAppDialog('Drive não configurado no Apps Script.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    const validationError = validateDetailingDriveUploadByKind(files, uploadKind);
    if (validationError) {
        alertAppDialog(validationError, { variant: 'warning', title: 'Aviso' });
        return false;
    }

    const setLoading = typeof options.setLoading === 'function' ? options.setLoading : null;
    const waitStatus = typeof options.waitStatus === 'function'
        ? options.waitStatus
        : (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
        if (typeof ensureGoogleDriveAppsScriptReady === 'function') {
            setLoading?.(true, 'Preparando envio...');
            await ensureGoogleDriveAppsScriptReady();
        }
        setLoading?.(true, 'Enviando arquivo(s) para o Drive...');

        for (const file of files) {
            const renamed = uploadKind === 'detailing' && typeof buildDetailingDriveFileName === 'function'
                ? buildDetailingDriveFileName(context.orderCode, context.clientName, context.projectName)
                : file.name;
            const uploadContext = {
                ...context,
                preserveOriginalFileName: uploadKind === 'project',
                fileName: renamed
            };
            await saveDriveFileUpload(file, uploadContext, (sent, total) => {
                if (!setLoading || !total) return;
                const pct = Math.min(100, Math.round((sent / total) * 100));
                setLoading(true, `Enviando ${file.name} (${pct}%)...`);
            });
        }

        setLoading?.(true, 'Arquivo(s) enviado(s).', 'success');
        await waitStatus(900);
        setLoading?.(false);
        return true;
    } catch (error) {
        console.error('uploadFilesToDetailingDrive:', error);
        if (setLoading) {
            setLoading(true, error.message || 'Erro ao enviar.', 'error');
            await waitStatus(2200);
            setLoading(false);
        } else {
            alertAppDialog(error.message || 'Erro ao enviar arquivo.');
        }
        return false;
    }
}

async function uploadDetailingDriveFiles(fileList, uploadKind) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    if (!detailingDriveContext) {
        detailingDriveContext = await resolveDetailingDriveContext();
    }
    if (!detailingDriveContext) {
        alertAppDialog('Não foi possível identificar o detalhamento, o pedido e o projeto.');
        return;
    }

    const uploaded = await uploadFilesToDetailingDrive(files, detailingDriveContext, {
        uploadKind,
        setLoading: typeof setDetalhamentoModalLoading === 'function' ? setDetalhamentoModalLoading : null,
        waitStatus: typeof waitDetalhamentoStatus === 'function' ? waitDetalhamentoStatus : null
    });

    if (uploaded) {
        await loadDetailingDriveFiles();
    }
}

function bindDetailingDriveEvents() {
    document.getElementById('btn-detalhamento-descriptive-view')?.addEventListener('click', viewDetailingDescriptiveFile);
    document.getElementById('btn-detalhamento-descriptive-download')?.addEventListener('click', downloadDetailingDescriptiveFile);
    document.getElementById('btn-detalhamento-drive-refresh')?.addEventListener('click', () => {
        loadDetailingDriveFiles();
    });
    document.getElementById('btn-detalhamento-drive-upload')?.addEventListener('click', () => {
        openDetailingDriveUploadKindModal(document.getElementById('detalhamento-drive-file-input'));
    });
    document.getElementById('detalhamento-drive-file-input')?.addEventListener('change', (event) => {
        const input = event.target;
        const file = input.files?.[0] || null;
        const uploadKind = input.dataset.uploadKind === 'project' ? 'project' : 'detailing';
        input.value = '';
        if (!file) return;
        if (typeof primeGoogleDriveAppsScript === 'function') {
            primeGoogleDriveAppsScript();
        }
        detailingDrivePendingFile = file;
        detailingDrivePendingKind = uploadKind;
        const nameEl = document.getElementById('detalhamento-drive-selected-name');
        if (nameEl) {
            nameEl.textContent = file.name || '';
            nameEl.classList.remove('hidden');
        }
        syncDetailingDriveSendButton();
    });
    document.getElementById('btn-detalhamento-drive-send')?.addEventListener('click', () => {
        if (!detailingDrivePendingFile) return;
        uploadDetailingDriveFiles([detailingDrivePendingFile], detailingDrivePendingKind);
    });
    document.getElementById('detailing-drive-upload-kind-project')?.addEventListener('click', () => {
        chooseDetailingDriveUploadKind('project');
    });
    document.getElementById('detailing-drive-upload-kind-detailing')?.addEventListener('click', () => {
        chooseDetailingDriveUploadKind('detailing');
    });
    document.getElementById('detailing-drive-upload-kind-cancel')?.addEventListener('click', () => {
        closeDetailingDriveUploadKindModal();
    });
    document.getElementById('detalhamento-drive-list')?.addEventListener('click', (event) => {
        const viewButton = event.target.closest('[data-drive-file-view]');
        if (viewButton) {
            viewDetailingDriveFile(viewButton.dataset.driveFileView);
            return;
        }
        const deleteButton = event.target.closest('[data-drive-file-delete]');
        if (deleteButton) {
            deleteDetailingDriveFile(deleteButton.dataset.driveFileDelete);
            return;
        }
        const downloadButton = event.target.closest('[data-drive-file-download]');
        if (!downloadButton) return;
        downloadDetailingDriveFile(downloadButton.dataset.driveFileDownload);
    });
}

window.loadDetailingDriveFiles = loadDetailingDriveFiles;
window.loadDetailingDescriptiveSection = loadDetailingDescriptiveSection;
window.resetDetailingDescriptiveSection = resetDetailingDescriptiveSection;
window.bindDetailingDriveEvents = bindDetailingDriveEvents;
window.resolveDetailingDriveContextForRecord = resolveDetailingDriveContextForRecord;
window.uploadFilesToDetailingDrive = uploadFilesToDetailingDrive;
window.openDetailingDriveUploadKindModal = openDetailingDriveUploadKindModal;
