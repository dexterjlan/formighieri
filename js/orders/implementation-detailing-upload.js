let implantacaoDetalhamentoRecord = null;
let implantacaoDetalhamentoDriveContext = null;
let implantacaoDetalhamentoSelectedFile = null;
let implantacaoDetalhamentoUploadKind = 'detailing';
let implantacaoDetalhamentoDriveFilesCache = [];

function isImplantacaoSentToProduction(record) {
    const status = record?.status || '';
    return status === IMPLANTACAO_STATUS_ENVIADO_PRODUCAO
        || status === IMPLANTACAO_STATUS_ENCERRADO;
}

function syncImplantacaoDetalhamentoSendButton() {
    const button = document.getElementById('btn-implantacao-detalhamento-send');
    const selectButton = document.getElementById('btn-implantacao-detalhamento-select-file');
    if (!button) return;
    button.disabled = Boolean(selectButton?.disabled) || !implantacaoDetalhamentoSelectedFile;
}

function clearImplantacaoDetalhamentoFileSelection() {
    implantacaoDetalhamentoSelectedFile = null;
    implantacaoDetalhamentoUploadKind = 'detailing';
    const input = document.getElementById('implantacao-detalhamento-file-input');
    if (input) input.value = '';
    const display = document.getElementById('implantacao-detalhamento-file-display');
    if (display) display.value = '';
    syncImplantacaoDetalhamentoSendButton();
}

function formatImplantacaoDetalhamentoDriveDate(isoDate) {
    if (!isoDate || typeof formatDate !== 'function') return '';
    return formatDate(isoDate);
}

function renderImplantacaoDetalhamentoDriveFiles(files = []) {
    const list = document.getElementById('implantacao-detalhamento-drive-list');
    const section = document.getElementById('implantacao-detalhamento-drive-files');
    if (!list || !section) return;

    implantacaoDetalhamentoDriveFilesCache = Array.isArray(files) ? files : [];

    if (!implantacaoDetalhamentoDriveFilesCache.length) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">Nenhum arquivo enviado ainda.</p>';
        section.classList.remove('hidden');
        return;
    }

    list.innerHTML = implantacaoDetalhamentoDriveFilesCache.map(file => {
        const name = escapeHtml(file.fileName || 'arquivo');
        const size = escapeHtml(typeof formatDriveFileSize === 'function'
            ? formatDriveFileSize(file.fileSizeBytes)
            : '');
        const updated = escapeHtml(formatImplantacaoDetalhamentoDriveDate(file.updatedAt || file.createdAt));
        return `
            <div class="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg border border-slate-100 bg-white">
                <div class="min-w-0">
                    <p class="text-xs font-medium text-slate-800 truncate" title="${name}">${name}</p>
                    <p class="text-[10px] text-slate-400">${size}${updated ? ` · ${updated}` : ''}</p>
                </div>
                <div class="flex shrink-0 flex-wrap gap-1">
                <button type="button"
                    data-implantacao-drive-file-download="${Number(file.id) || 0}"
                    class="shrink-0 text-xs bg-white border border-indigo-200 text-indigo-800 px-2 py-1 rounded-lg font-medium hover:bg-indigo-50">
                    Baixar
                </button>
                ${typeof isAdmin === 'function' && isAdmin() ? `
                <button type="button"
                    data-implantacao-drive-file-delete="${Number(file.id) || 0}"
                    class="shrink-0 text-xs bg-white border border-red-200 text-red-700 px-2 py-1 rounded-lg font-medium hover:bg-red-50">
                    Excluir
                </button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    section.classList.remove('hidden');
}

function hideImplantacaoDetalhamentoDriveFiles() {
    const section = document.getElementById('implantacao-detalhamento-drive-files');
    const list = document.getElementById('implantacao-detalhamento-drive-list');
    implantacaoDetalhamentoDriveFilesCache = [];
    if (list) list.innerHTML = '';
    section?.classList.add('hidden');
}

function downloadImplantacaoDetalhamentoDriveFile(fileId) {
    const file = implantacaoDetalhamentoDriveFilesCache.find(item => Number(item.id) === Number(fileId));
    const url = typeof resolveDriveFileDownloadUrl === 'function'
        ? resolveDriveFileDownloadUrl(file)
        : file?.url;
    if (!url) {
        alertAppDialog('Não foi possível gerar o link de download.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function deleteImplantacaoDetalhamentoDriveFile(fileId) {
    if (typeof isAdmin !== 'function' || !isAdmin()) return;
    const file = implantacaoDetalhamentoDriveFilesCache.find(item => Number(item.id) === Number(fileId));
    if (!file || typeof deleteDriveFileRecord !== 'function') return;

    const confirmed = await confirmAppDialog(
        `Excluir o arquivo "${file.fileName || 'arquivo'}"?`,
        { title: 'Excluir arquivo', confirmLabel: 'Excluir' }
    );
    if (!confirmed) return;

    const setLoading = typeof setImplantacaoModalLoading === 'function' ? setImplantacaoModalLoading : null;
    const waitStatus = typeof waitImplantacaoStatus === 'function' ? waitImplantacaoStatus : waitAppOverlay;
    try {
        setLoading?.(true, 'Excluindo arquivo...');
        await deleteDriveFileRecord(file);
        setLoading?.(true, 'Arquivo excluído.', 'success');
        await waitStatus(typeof APP_OVERLAY_SUCCESS_MS === 'number' ? APP_OVERLAY_SUCCESS_MS : 1800);
        setLoading?.(false);
        await loadImplantacaoDetalhamentoDriveFiles();
    } catch (error) {
        setLoading?.(true, error.message || 'Não foi possível excluir o arquivo.', 'error');
        await waitStatus(typeof APP_OVERLAY_ERROR_MS === 'number' ? APP_OVERLAY_ERROR_MS : 4000);
        setLoading?.(false);
    }
}

async function loadImplantacaoDetalhamentoDriveFiles() {
    const list = document.getElementById('implantacao-detalhamento-drive-list');
    if (!list || !implantacaoDetalhamentoDriveContext) {
        hideImplantacaoDetalhamentoDriveFiles();
        return;
    }

    list.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">Carregando arquivos...</p>';
    document.getElementById('implantacao-detalhamento-drive-files')?.classList.remove('hidden');

    try {
        if (typeof fetchDriveFiles !== 'function') {
            renderImplantacaoDetalhamentoDriveFiles([]);
            return;
        }

        const files = await fetchDriveFiles({
            entityType: implantacaoDetalhamentoDriveContext.entityType,
            entityId: implantacaoDetalhamentoDriveContext.entityId,
            folderKind: implantacaoDetalhamentoDriveContext.folderKind
        });
        renderImplantacaoDetalhamentoDriveFiles(files);
    } catch (error) {
        console.warn('loadImplantacaoDetalhamentoDriveFiles:', error);
        list.innerHTML = '<p class="text-xs text-red-500 text-center py-2">Erro ao carregar os arquivos.</p>';
    }
}

async function refreshImplantacaoDetalhamentoUploadSection(record = activeImplantacaoRecord) {
    const hint = document.getElementById('implantacao-detalhamento-upload-hint');
    const pathEl = document.getElementById('implantacao-detalhamento-drive-path');
    const btnSelect = document.getElementById('btn-implantacao-detalhamento-select-file');

    clearImplantacaoDetalhamentoFileSelection();
    implantacaoDetalhamentoRecord = null;
    implantacaoDetalhamentoDriveContext = null;
    hideImplantacaoDetalhamentoDriveFiles();

    if (!isImplantacaoSentToProduction(record)) {
        if (hint) hint.textContent = 'Disponível após enviar o projeto para produção.';
        pathEl?.classList.add('hidden');
        if (btnSelect) btnSelect.disabled = true;
        syncImplantacaoDetalhamentoSendButton();
        return;
    }

    if (!activeImplantacaoOrderProjectId) {
        if (btnSelect) btnSelect.disabled = true;
        syncImplantacaoDetalhamentoSendButton();
        return;
    }

    try {
        if (typeof fetchDetailingByOrderProjectId === 'function') {
            implantacaoDetalhamentoRecord = await fetchDetailingByOrderProjectId(activeImplantacaoOrderProjectId);
        }
    } catch (error) {
        console.warn('refreshImplantacaoDetalhamentoUploadSection:', error);
    }

    if (!implantacaoDetalhamentoRecord?.id) {
        if (hint) hint.textContent = 'Detalhamento ainda não disponível para este projeto.';
        pathEl?.classList.add('hidden');
        if (btnSelect) btnSelect.disabled = true;
        syncImplantacaoDetalhamentoSendButton();
        return;
    }

    const canUpload = typeof canActImplantacao === 'function' && canActImplantacao(record);
    if (hint) {
        hint.textContent = canUpload
            ? 'Escolha Projeto (RAR ou ZIP, nome original) ou Detalhamento (PDF, nome padrão). Até 100 MB.'
            : 'Sem permissão para enviar arquivo.';
    }

    if (typeof resolveDetailingDriveContextForRecord === 'function') {
        implantacaoDetalhamentoDriveContext = await resolveDetailingDriveContextForRecord(
            activeImplantacaoOrderProjectId,
            implantacaoDetalhamentoRecord,
            activeImplantacaoProjectName || 'Projeto'
        );
    }

    if (pathEl) {
        if (implantacaoDetalhamentoDriveContext?.folderPath) {
            pathEl.textContent = implantacaoDetalhamentoDriveContext.folderPath;
            pathEl.classList.remove('hidden');
        } else {
            pathEl.classList.add('hidden');
        }
    }

    if (btnSelect) btnSelect.disabled = !canUpload;
    syncImplantacaoDetalhamentoSendButton();
    await loadImplantacaoDetalhamentoDriveFiles();
}

function resetImplantacaoDetalhamentoUploadSection() {
    implantacaoDetalhamentoRecord = null;
    implantacaoDetalhamentoDriveContext = null;
    clearImplantacaoDetalhamentoFileSelection();
    hideImplantacaoDetalhamentoDriveFiles();

    const hint = document.getElementById('implantacao-detalhamento-upload-hint');
    const pathEl = document.getElementById('implantacao-detalhamento-drive-path');
    const btnSelect = document.getElementById('btn-implantacao-detalhamento-select-file');

    if (hint) hint.textContent = 'Disponível após enviar o projeto para produção.';
    pathEl?.classList.add('hidden');
    if (btnSelect) btnSelect.disabled = true;
    syncImplantacaoDetalhamentoSendButton();
}

async function handleImplantacaoDetalhamentoUpload(file, uploadKind) {
    if (!file) return;

    if (!implantacaoDetalhamentoDriveContext) {
        alertAppDialog('Não foi possível identificar a pasta de detalhamento.');
        return;
    }

    if (typeof uploadFilesToDetailingDrive !== 'function') {
        alertAppDialog('Upload de detalhamento indisponível.');
        return;
    }

    const uploaded = await uploadFilesToDetailingDrive([file], implantacaoDetalhamentoDriveContext, {
        uploadKind,
        setLoading: typeof setImplantacaoModalLoading === 'function' ? setImplantacaoModalLoading : null,
        waitStatus: typeof waitImplantacaoStatus === 'function' ? waitImplantacaoStatus : null
    });

    if (uploaded) {
        clearImplantacaoDetalhamentoFileSelection();
        await loadImplantacaoDetalhamentoDriveFiles();
    }
}

function bindImplantacaoDetalhamentoUploadEvents() {
    document.getElementById('btn-implantacao-detalhamento-select-file')?.addEventListener('click', () => {
        const input = document.getElementById('implantacao-detalhamento-file-input');
        if (!input || typeof openDetailingDriveUploadKindModal !== 'function') return;
        openDetailingDriveUploadKindModal(input);
    });

    document.getElementById('implantacao-detalhamento-file-input')?.addEventListener('change', (event) => {
        const input = event.target;
        const file = input.files?.[0] || null;
        const uploadKind = input.dataset.uploadKind === 'project' ? 'project' : 'detailing';
        input.value = '';
        if (!file) return;
        if (typeof primeGoogleDriveAppsScript === 'function') {
            primeGoogleDriveAppsScript();
        }
        implantacaoDetalhamentoSelectedFile = file;
        implantacaoDetalhamentoUploadKind = uploadKind;
        const display = document.getElementById('implantacao-detalhamento-file-display');
        if (display) display.value = file.name || '';
        syncImplantacaoDetalhamentoSendButton();
    });

    document.getElementById('btn-implantacao-detalhamento-send')?.addEventListener('click', () => {
        handleImplantacaoDetalhamentoUpload(
            implantacaoDetalhamentoSelectedFile,
            implantacaoDetalhamentoUploadKind
        );
    });

    document.getElementById('implantacao-detalhamento-drive-list')?.addEventListener('click', (event) => {
        const deleteButton = event.target.closest('[data-implantacao-drive-file-delete]');
        if (deleteButton) {
            deleteImplantacaoDetalhamentoDriveFile(deleteButton.dataset.implantacaoDriveFileDelete);
            return;
        }
        const button = event.target.closest('[data-implantacao-drive-file-download]');
        if (!button) return;
        downloadImplantacaoDetalhamentoDriveFile(button.dataset.implantacaoDriveFileDownload);
    });
}

window.refreshImplantacaoDetalhamentoUploadSection = refreshImplantacaoDetalhamentoUploadSection;
window.resetImplantacaoDetalhamentoUploadSection = resetImplantacaoDetalhamentoUploadSection;
window.bindImplantacaoDetalhamentoUploadEvents = bindImplantacaoDetalhamentoUploadEvents;
