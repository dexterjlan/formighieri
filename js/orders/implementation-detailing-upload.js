let implantacaoDetalhamentoRecord = null;
let implantacaoDetalhamentoDriveContext = null;
let implantacaoDetalhamentoSelectedFile = null;

function isImplantacaoSentToProduction(record) {
    const status = record?.status || '';
    return status === IMPLANTACAO_STATUS_ENVIADO_PRODUCAO
        || status === IMPLANTACAO_STATUS_ENCERRADO;
}

function clearImplantacaoDetalhamentoFileSelection() {
    implantacaoDetalhamentoSelectedFile = null;
    const input = document.getElementById('implantacao-detalhamento-file-input');
    if (input) input.value = '';
    const display = document.getElementById('implantacao-detalhamento-file-display');
    if (display) display.value = '';
    updateImplantacaoDetalhamentoUploadButtons();
}

function updateImplantacaoDetalhamentoUploadButtons() {
    const btnSelect = document.getElementById('btn-implantacao-detalhamento-select-file');
    const btnUpload = document.getElementById('btn-implantacao-detalhamento-upload');
    const selectDisabled = btnSelect?.disabled || btnSelect?.hasAttribute('disabled');
    if (btnUpload) {
        btnUpload.disabled = Boolean(selectDisabled) || !implantacaoDetalhamentoSelectedFile;
    }
}

async function refreshImplantacaoDetalhamentoUploadSection(record = activeImplantacaoRecord) {
    const hint = document.getElementById('implantacao-detalhamento-upload-hint');
    const pathEl = document.getElementById('implantacao-detalhamento-drive-path');
    const btnSelect = document.getElementById('btn-implantacao-detalhamento-select-file');

    clearImplantacaoDetalhamentoFileSelection();
    implantacaoDetalhamentoRecord = null;
    implantacaoDetalhamentoDriveContext = null;

    if (!isImplantacaoSentToProduction(record)) {
        if (hint) hint.textContent = 'Disponível após enviar o projeto para produção.';
        pathEl?.classList.add('hidden');
        if (btnSelect) btnSelect.disabled = true;
        updateImplantacaoDetalhamentoUploadButtons();
        return;
    }

    if (!activeImplantacaoOrderProjectId) {
        if (btnSelect) btnSelect.disabled = true;
        updateImplantacaoDetalhamentoUploadButtons();
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
        updateImplantacaoDetalhamentoUploadButtons();
        return;
    }

    const canUpload = typeof canActImplantacao === 'function' && canActImplantacao(record);
    if (hint) {
        hint.textContent = canUpload
            ? 'Envie PDF, ZIP ou RAR para a pasta de detalhamento (até 100 MB).'
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
    updateImplantacaoDetalhamentoUploadButtons();
}

function resetImplantacaoDetalhamentoUploadSection() {
    implantacaoDetalhamentoRecord = null;
    implantacaoDetalhamentoDriveContext = null;
    clearImplantacaoDetalhamentoFileSelection();

    const hint = document.getElementById('implantacao-detalhamento-upload-hint');
    const pathEl = document.getElementById('implantacao-detalhamento-drive-path');
    const btnSelect = document.getElementById('btn-implantacao-detalhamento-select-file');

    if (hint) hint.textContent = 'Disponível após enviar o projeto para produção.';
    pathEl?.classList.add('hidden');
    if (btnSelect) btnSelect.disabled = true;
    updateImplantacaoDetalhamentoUploadButtons();
}

async function handleImplantacaoDetalhamentoUpload() {
    const file = implantacaoDetalhamentoSelectedFile;
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
        setLoading: typeof setImplantacaoModalLoading === 'function' ? setImplantacaoModalLoading : null,
        waitStatus: typeof waitImplantacaoStatus === 'function' ? waitImplantacaoStatus : null
    });

    if (uploaded) {
        clearImplantacaoDetalhamentoFileSelection();
    }
}

function bindImplantacaoDetalhamentoUploadEvents() {
    document.getElementById('btn-implantacao-detalhamento-select-file')?.addEventListener('click', () => {
        document.getElementById('implantacao-detalhamento-file-input')?.click();
    });

    document.getElementById('implantacao-detalhamento-file-input')?.addEventListener('change', (event) => {
        const input = event.target;
        const file = input.files?.[0] || null;
        implantacaoDetalhamentoSelectedFile = file;
        const display = document.getElementById('implantacao-detalhamento-file-display');
        if (display) display.value = file?.name || '';
        updateImplantacaoDetalhamentoUploadButtons();
    });

    document.getElementById('btn-implantacao-detalhamento-upload')
        ?.addEventListener('click', handleImplantacaoDetalhamentoUpload);
}

window.refreshImplantacaoDetalhamentoUploadSection = refreshImplantacaoDetalhamentoUploadSection;
window.resetImplantacaoDetalhamentoUploadSection = resetImplantacaoDetalhamentoUploadSection;
window.bindImplantacaoDetalhamentoUploadEvents = bindImplantacaoDetalhamentoUploadEvents;
