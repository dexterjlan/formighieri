let detailingDriveContext = null;
let detailingDriveFilesCache = [];

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
        .select('id, name, projectCode, orderId, order:salesOrders(orderCode)')
        .eq('id', orderProjectId)
        .maybeSingle();

    if (error) {
        console.warn('resolveDetailingDriveContextForRecord:', error);
    }

    const orderCode = data?.order?.orderCode || '';
    const projectName = data?.name || projectNameFallback;
    if (!orderCode || !projectName) return null;

    const params = {
        folderKind: DRIVE_FILE_FOLDER_KIND.DETAILING,
        entityType: DRIVE_FILE_ENTITY_TYPE.DETAILING,
        entityId
    };

    return {
        ...params,
        orderCode,
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
                <button type="button"
                    data-drive-file-download="${Number(file.id) || 0}"
                    class="shrink-0 text-xs bg-white border border-indigo-200 text-indigo-800 px-2.5 py-1 rounded-lg font-medium hover:bg-indigo-50">
                    Baixar
                </button>
            </div>
        `;
    }).join('');
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

async function uploadFilesToDetailingDrive(fileList, context, options = {}) {
    const files = Array.from(fileList || []);
    if (!files.length || !context) return false;

    if (!isGoogleDriveAppsScriptConfigured()) {
        alertAppDialog('Drive não configurado no Apps Script.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    const validationError = typeof validateDriveUploadFiles === 'function'
        ? validateDriveUploadFiles(files)
        : '';
    if (validationError) {
        alertAppDialog(validationError, { variant: 'warning', title: 'Aviso' });
        return false;
    }

    const setLoading = typeof options.setLoading === 'function' ? options.setLoading : null;
    const waitStatus = typeof options.waitStatus === 'function'
        ? options.waitStatus
        : (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
        setLoading?.(true, 'Enviando arquivo(s) para o Drive...');

        for (const file of files) {
            await saveDriveFileUpload(file, context, (sent, total) => {
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

async function uploadDetailingDriveFiles(fileList) {
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
        setLoading: typeof setDetalhamentoModalLoading === 'function' ? setDetalhamentoModalLoading : null,
        waitStatus: typeof waitDetalhamentoStatus === 'function' ? waitDetalhamentoStatus : null
    });

    if (uploaded) {
        await loadDetailingDriveFiles();
    }
}

function bindDetailingDriveEvents() {
    document.getElementById('btn-detalhamento-drive-refresh')?.addEventListener('click', () => {
        loadDetailingDriveFiles();
    });
    document.getElementById('btn-detalhamento-drive-upload')?.addEventListener('click', () => {
        document.getElementById('detalhamento-drive-file-input')?.click();
    });
    document.getElementById('detalhamento-drive-file-input')?.addEventListener('change', async (event) => {
        const input = event.target;
        await uploadDetailingDriveFiles(input.files);
        input.value = '';
    });
    document.getElementById('detalhamento-drive-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-drive-file-download]');
        if (!button) return;
        downloadDetailingDriveFile(button.dataset.driveFileDownload);
    });
}

window.loadDetailingDriveFiles = loadDetailingDriveFiles;
window.bindDetailingDriveEvents = bindDetailingDriveEvents;
window.resolveDetailingDriveContextForRecord = resolveDetailingDriveContextForRecord;
window.uploadFilesToDetailingDrive = uploadFilesToDetailingDrive;
