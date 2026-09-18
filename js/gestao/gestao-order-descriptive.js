let gestaoOrderDescriptiveSelectedFile = null;
let gestaoOrderDescriptiveCurrentFile = null;

const GESTAO_ORDER_DESCRIPTIVE_INPUT_ACCEPT = '.pdf,application/pdf';

const GESTAO_ORDER_DESCRIPTIVE_OVERLAY = typeof createModalOverlayConfig === 'function'
    ? createModalOverlayConfig('gestao-order-descriptive', {
        disableElementIds: [
            'btn-gestao-ord-descriptive-select',
            'btn-gestao-ord-descriptive-upload',
            'btn-gestao-ord-descriptive-download'
        ]
    })
    : null;

function setGestaoOrderDescriptiveLoading(active, message = 'Processando...', status = 'loading') {
    if (typeof setModalOverlayLoading !== 'function' || !GESTAO_ORDER_DESCRIPTIVE_OVERLAY) return;
    setModalOverlayLoading(GESTAO_ORDER_DESCRIPTIVE_OVERLAY, active, message, status);
}

function waitGestaoOrderDescriptiveStatus(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getGestaoOrderDescriptiveOrderContext() {
    const orderId = typeof resolveGestaoOrderIdForSave === 'function'
        ? resolveGestaoOrderIdForSave()
        : (Number(document.getElementById('gestao-ord-id')?.value) || null);
    const orderCode = document.getElementById('gestao-ord-code')?.value?.trim() || '';
    const clientName = document.getElementById('gestao-ord-client')?.value?.trim() || '';

    if (!orderId || !orderCode) return null;

    return {
        orderId: Number(orderId),
        orderCode,
        clientName
    };
}

function buildGestaoOrderDescriptiveDriveContext(orderContext) {
    if (!orderContext?.orderId) return null;

    return {
        entityType: DRIVE_FILE_ENTITY_TYPE.SALES_ORDER,
        entityId: orderContext.orderId,
        orderId: orderContext.orderId,
        orderCode: orderContext.orderCode,
        projectName: '',
        folderKind: DRIVE_FILE_FOLDER_KIND.DESCRIPTIVE,
        folderPath: buildDriveFolderPath(orderContext.orderCode, '', DRIVE_FILE_FOLDER_KIND.DESCRIPTIVE),
        replaceByEntity: true,
        fileName: buildDescriptiveDriveFileName(orderContext.orderCode, orderContext.clientName)
    };
}

function clearGestaoOrderDescriptiveFileSelection() {
    gestaoOrderDescriptiveSelectedFile = null;
    const input = document.getElementById('gestao-ord-descriptive-file-input');
    if (input) input.value = '';
    const display = document.getElementById('gestao-ord-descriptive-file-display');
    if (display) display.value = '';
    updateGestaoOrderDescriptiveUploadButtons();
}

function updateGestaoOrderDescriptiveUploadButtons() {
    const btnSelect = document.getElementById('btn-gestao-ord-descriptive-select');
    const btnUpload = document.getElementById('btn-gestao-ord-descriptive-upload');
    const selectDisabled = btnSelect?.disabled || btnSelect?.hasAttribute('disabled');
    if (btnUpload) {
        btnUpload.disabled = Boolean(selectDisabled) || !gestaoOrderDescriptiveSelectedFile;
    }
}

function renderGestaoOrderDescriptiveCurrentFile(file) {
    gestaoOrderDescriptiveCurrentFile = file || null;
    const emptyEl = document.getElementById('gestao-ord-descriptive-empty');
    const currentEl = document.getElementById('gestao-ord-descriptive-current');
    const nameEl = document.getElementById('gestao-ord-descriptive-current-name');
    const metaEl = document.getElementById('gestao-ord-descriptive-current-meta');
    const downloadBtn = document.getElementById('btn-gestao-ord-descriptive-download');

    if (!file?.id) {
        emptyEl?.classList.remove('hidden');
        currentEl?.classList.add('hidden');
        if (downloadBtn) downloadBtn.disabled = true;
        return;
    }

    emptyEl?.classList.add('hidden');
    currentEl?.classList.remove('hidden');
    if (nameEl) nameEl.textContent = file.fileName || 'Descritivo.pdf';
    if (metaEl) {
        const size = typeof formatDriveFileSize === 'function'
            ? formatDriveFileSize(file.fileSizeBytes)
            : '';
        const updated = file.updatedAt && typeof formatDate === 'function'
            ? formatDate(file.updatedAt)
            : '';
        metaEl.textContent = [size, updated].filter(Boolean).join(' · ') || '—';
    }
    if (downloadBtn) downloadBtn.disabled = false;
}

async function loadGestaoOrderDescriptiveFile() {
    const orderContext = getGestaoOrderDescriptiveOrderContext();
    if (!orderContext) {
        renderGestaoOrderDescriptiveCurrentFile(null);
        return;
    }

    try {
        const file = typeof findDriveFileForEntity === 'function'
            ? await findDriveFileForEntity({
                entityType: DRIVE_FILE_ENTITY_TYPE.SALES_ORDER,
                entityId: orderContext.orderId,
                folderKind: DRIVE_FILE_FOLDER_KIND.DESCRIPTIVE
            })
            : null;
        renderGestaoOrderDescriptiveCurrentFile(file);
    } catch (error) {
        console.warn('loadGestaoOrderDescriptiveFile:', error);
        renderGestaoOrderDescriptiveCurrentFile(null);
    }
}

async function refreshGestaoOrderDescriptiveSection() {
    const section = document.getElementById('gestao-ord-descriptive-section');
    const hint = document.getElementById('gestao-ord-descriptive-hint');
    const pathEl = document.getElementById('gestao-ord-descriptive-drive-path');
    const btnSelect = document.getElementById('btn-gestao-ord-descriptive-select');
    const canEdit = typeof canAccessGestao === 'function' && canAccessGestao();

    clearGestaoOrderDescriptiveFileSelection();
    renderGestaoOrderDescriptiveCurrentFile(null);

    const orderContext = getGestaoOrderDescriptiveOrderContext();
    if (!orderContext) {
        section?.classList.remove('hidden');
        if (hint) hint.textContent = 'Salve o pedido para enviar o PDF Descritivo.';
        pathEl?.classList.add('hidden');
        if (btnSelect) btnSelect.disabled = true;
        updateGestaoOrderDescriptiveUploadButtons();
        return;
    }

    section?.classList.remove('hidden');
    const driveContext = buildGestaoOrderDescriptiveDriveContext(orderContext);
    if (hint) {
        hint.textContent = canEdit
            ? 'Envie um PDF (até 100 MB). Um novo envio substitui o arquivo anterior.'
            : 'Sem permissão para enviar arquivo.';
    }
    if (pathEl) {
        if (driveContext?.folderPath) {
            pathEl.textContent = driveContext.folderPath;
            pathEl.classList.remove('hidden');
        } else {
            pathEl.classList.add('hidden');
        }
    }
    if (btnSelect) btnSelect.disabled = !canEdit;
    updateGestaoOrderDescriptiveUploadButtons();
    await loadGestaoOrderDescriptiveFile();
}

function resetGestaoOrderDescriptiveSection() {
    gestaoOrderDescriptiveCurrentFile = null;
    clearGestaoOrderDescriptiveFileSelection();
    renderGestaoOrderDescriptiveCurrentFile(null);
    const hint = document.getElementById('gestao-ord-descriptive-hint');
    const pathEl = document.getElementById('gestao-ord-descriptive-drive-path');
    const btnSelect = document.getElementById('btn-gestao-ord-descriptive-select');
    if (hint) hint.textContent = 'Salve o pedido para enviar o PDF Descritivo.';
    pathEl?.classList.add('hidden');
    if (btnSelect) btnSelect.disabled = true;
    updateGestaoOrderDescriptiveUploadButtons();
}

function downloadGestaoOrderDescriptiveFile() {
    const file = gestaoOrderDescriptiveCurrentFile;
    const url = typeof resolveDriveFileDownloadUrl === 'function'
        ? resolveDriveFileDownloadUrl(file)
        : file?.url;
    if (!url) {
        alertAppDialog('Não foi possível gerar o link de download.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function uploadGestaoOrderDescriptiveFile() {
    const file = gestaoOrderDescriptiveSelectedFile;
    if (!file) return;

    const orderContext = getGestaoOrderDescriptiveOrderContext();
    const driveContext = buildGestaoOrderDescriptiveDriveContext(orderContext);
    if (!driveContext) {
        alertAppDialog('Salve o pedido antes de enviar o Descritivo.');
        return;
    }

    const validation = validateDriveUploadFiles([file], DRIVE_FILE_FOLDER_KIND.DESCRIPTIVE);
    if (validation) {
        alertAppDialog(validation, { variant: 'warning', title: 'Aviso' });
        return;
    }

    try {
        setGestaoOrderDescriptiveLoading(true, 'Enviando Descritivo...');

        await saveDriveFileUpload(file, driveContext, (sent, total) => {
            if (!total) return;
            const pct = Math.min(100, Math.round((sent / total) * 100));
            setGestaoOrderDescriptiveLoading(true, `Enviando Descritivo (${pct}%)...`);
        });

        clearGestaoOrderDescriptiveFileSelection();
        await loadGestaoOrderDescriptiveFile();
        setGestaoOrderDescriptiveLoading(true, 'Descritivo enviado com sucesso!', 'success');
        await waitGestaoOrderDescriptiveStatus(900);
    } catch (error) {
        console.error('uploadGestaoOrderDescriptiveFile:', error);
        setGestaoOrderDescriptiveLoading(true, error.message || 'Não foi possível enviar o Descritivo.', 'error');
        await waitGestaoOrderDescriptiveStatus(2200);
    } finally {
        setGestaoOrderDescriptiveLoading(false);
        updateGestaoOrderDescriptiveUploadButtons();
    }
}

function bindGestaoOrderDescriptiveEvents() {
    document.getElementById('btn-gestao-ord-descriptive-select')?.addEventListener('click', () => {
        document.getElementById('gestao-ord-descriptive-file-input')?.click();
    });
    document.getElementById('gestao-ord-descriptive-file-input')?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        gestaoOrderDescriptiveSelectedFile = file || null;
        const display = document.getElementById('gestao-ord-descriptive-file-display');
        if (display) display.value = file?.name || '';
        updateGestaoOrderDescriptiveUploadButtons();
    });
    document.getElementById('btn-gestao-ord-descriptive-upload')?.addEventListener('click', uploadGestaoOrderDescriptiveFile);
    document.getElementById('btn-gestao-ord-descriptive-download')?.addEventListener('click', downloadGestaoOrderDescriptiveFile);
}

window.refreshGestaoOrderDescriptiveSection = refreshGestaoOrderDescriptiveSection;
window.resetGestaoOrderDescriptiveSection = resetGestaoOrderDescriptiveSection;
window.bindGestaoOrderDescriptiveEvents = bindGestaoOrderDescriptiveEvents;
