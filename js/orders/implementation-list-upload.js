const implantacaoListSelectedFiles = {};
const implantacaoListDriveFilesCache = {};

function getImplantacaoListUiConfig(purchaseType) {
    return (typeof IMPLANTACAO_STANDARD_PURCHASE_UI !== 'undefined' ? IMPLANTACAO_STANDARD_PURCHASE_UI : [])
        .find(config => config.purchaseType === purchaseType) || null;
}

function isImplantacaoStandardPurchaseItemFulfilled(item) {
    return Boolean(item?.isNotApplicable) || hasImplantacaoListDriveFileUploaded(null, item);
}

function hasImplantacaoListDriveFileUploaded(purchaseType, item = null) {
    const row = item
        || (typeof getImplantacaoStandardPurchaseItem === 'function'
            ? getImplantacaoStandardPurchaseItem(purchaseType)
            : null);
    if (!row || row.isNotApplicable) return false;
    const type = purchaseType || row.purchaseType;
    if (type && implantacaoListDriveFilesCache[type]?.id) return true;
    return Boolean(String(row.folderPath || '').trim());
}

function updateImplantacaoListComercialCheckboxState(purchaseType, record = activeImplantacaoRecord) {
    const config = getImplantacaoListUiConfig(purchaseType);
    if (!config) return;

    const item = typeof getImplantacaoStandardPurchaseItem === 'function'
        ? getImplantacaoStandardPurchaseItem(purchaseType)
        : null;
    const comercialInput = document.getElementById(config.comercialId);
    if (!comercialInput || isImplantacaoListSentToCompras(item)) return;

    const canAct = typeof canActImplantacao === 'function' && canActImplantacao(record);
    const formLocked = (record?.status || '') === 'Encerrado';
    const hasFile = hasImplantacaoListDriveFileUploaded(purchaseType, item);

    comercialInput.disabled = !canAct || formLocked || !hasFile;
    if (!hasFile) comercialInput.checked = false;
}

async function resolveImplantacaoListDriveContext(purchaseType) {
    const item = typeof getImplantacaoStandardPurchaseItem === 'function'
        ? getImplantacaoStandardPurchaseItem(purchaseType)
        : null;
    const entityId = Number(item?.id || 0);
    const orderProjectId = Number(activeImplantacaoOrderProjectId || 0);
    if (!entityId || !orderProjectId) return null;

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('id, name, orderId, order:salesOrders(orderCode)')
        .eq('id', orderProjectId)
        .maybeSingle();

    if (error) {
        console.warn('resolveImplantacaoListDriveContext:', error);
    }

    const orderCode = data?.order?.orderCode || '';
    const projectName = data?.name || activeImplantacaoProjectName || 'Projeto';
    if (!orderCode || !projectName) return null;

    const folderKind = DRIVE_FILE_FOLDER_KIND.IMPLEMENTATION_LIST;
    const fileName = typeof buildImplementationListDriveFileName === 'function'
        ? buildImplementationListDriveFileName(orderCode, projectName, purchaseType)
        : `${orderCode}_${projectName}_Lista.pdf`;

    return {
        folderKind,
        entityType: DRIVE_FILE_ENTITY_TYPE.IMPLEMENTATION_PURCHASE_ITEM,
        entityId,
        orderCode,
        projectName,
        orderId: Number(data?.orderId || 0) || null,
        orderProjectId,
        fileName,
        folderPath: buildDriveFolderPath(orderCode, projectName, folderKind),
        replaceByEntity: true
    };
}

function clearImplantacaoListFileSelection(purchaseType) {
    implantacaoListSelectedFiles[purchaseType] = null;
    const config = getImplantacaoListUiConfig(purchaseType);
    if (!config) return;
    const input = document.getElementById(config.fileInputId);
    if (input) input.value = '';
    const display = document.getElementById(config.fileDisplayId);
    if (display) display.value = '';
    updateImplantacaoListUploadButtons(purchaseType);
}

function isImplantacaoListSentToCompras(item) {
    return typeof isImplementationPurchaseItemSentToCompras === 'function'
        && isImplementationPurchaseItemSentToCompras(item);
}

function updateImplantacaoListUploadButtons(purchaseType) {
    const config = getImplantacaoListUiConfig(purchaseType);
    if (!config) return;

    const item = typeof getImplantacaoStandardPurchaseItem === 'function'
        ? getImplantacaoStandardPurchaseItem(purchaseType)
        : null;
    const sentToCommercial = isImplantacaoListSentToCompras(item);
    const notApplicable = Boolean(document.getElementById(config.notApplicableId)?.checked);
    const locked = sentToCommercial || notApplicable;

    const btnSelect = document.getElementById(config.selectFileBtnId);
    const btnUpload = document.getElementById(config.uploadBtnId);
    const canAct = typeof canActImplantacao === 'function' && canActImplantacao();
    const selectDisabled = !canAct || locked;

    if (btnSelect) btnSelect.disabled = selectDisabled;
    if (btnUpload) {
        btnUpload.disabled = selectDisabled || !implantacaoListSelectedFiles[purchaseType];
    }
}

function renderImplantacaoListCurrentFile(purchaseType, file) {
    const config = getImplantacaoListUiConfig(purchaseType);
    if (!config) return;

    implantacaoListDriveFilesCache[purchaseType] = file || null;
    const emptyEl = document.getElementById(config.currentEmptyId);
    const currentEl = document.getElementById(config.currentFileId);
    const nameEl = document.getElementById(config.currentNameId);
    const metaEl = document.getElementById(config.currentMetaId);
    const downloadBtn = document.getElementById(config.downloadBtnId);

    if (!file?.id) {
        emptyEl?.classList.remove('hidden');
        currentEl?.classList.add('hidden');
        if (downloadBtn) downloadBtn.disabled = true;
        return;
    }

    emptyEl?.classList.add('hidden');
    currentEl?.classList.remove('hidden');
    if (nameEl) nameEl.textContent = file.fileName || 'Lista.pdf';
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

async function loadImplantacaoListDriveFile(purchaseType) {
    const config = getImplantacaoListUiConfig(purchaseType);
    if (!config) return;

    const item = typeof getImplantacaoStandardPurchaseItem === 'function'
        ? getImplantacaoStandardPurchaseItem(purchaseType)
        : null;
    if (!item?.id || typeof findDriveFileForEntity !== 'function') {
        renderImplantacaoListCurrentFile(purchaseType, null);
        return;
    }

    try {
        const file = await findDriveFileForEntity({
            entityType: DRIVE_FILE_ENTITY_TYPE.IMPLEMENTATION_PURCHASE_ITEM,
            entityId: item.id,
            folderKind: DRIVE_FILE_FOLDER_KIND.IMPLEMENTATION_LIST
        });
        renderImplantacaoListCurrentFile(purchaseType, file);
    } catch (error) {
        console.warn('loadImplantacaoListDriveFile:', error);
        renderImplantacaoListCurrentFile(purchaseType, null);
    }
}

async function refreshImplantacaoListUploadSection(purchaseType, record = activeImplantacaoRecord) {
    const config = getImplantacaoListUiConfig(purchaseType);
    if (!config) return;

    clearImplantacaoListFileSelection(purchaseType);
    renderImplantacaoListCurrentFile(purchaseType, null);

    const item = typeof getImplantacaoStandardPurchaseItem === 'function'
        ? getImplantacaoStandardPurchaseItem(purchaseType)
        : null;
    const sentToCommercial = isImplantacaoListSentToCompras(item);
    const canAct = typeof canActImplantacao === 'function' && canActImplantacao(record);
    const status = record?.status || '';
    const formLocked = status === 'Encerrado';

    const hint = document.getElementById(config.uploadHintId);
    const pathEl = document.getElementById(config.drivePathId);
    const comercialInput = document.getElementById(config.comercialId);
    const notApplicableInput = document.getElementById(config.notApplicableId);

    if (notApplicableInput) {
        notApplicableInput.checked = Boolean(item?.isNotApplicable);
        notApplicableInput.disabled = !canAct || sentToCommercial || formLocked;
    }

    if (comercialInput && sentToCommercial) {
        comercialInput.checked = true;
        comercialInput.disabled = true;
    }

    if (typeof updateImplantacaoComercialDateLabel === 'function') {
        updateImplantacaoComercialDateLabel(
            config.comercialId,
            config.comercialDateId,
            sentToCommercial ? item?.sentToCommercialAt : null
        );
    }

    const uploadSection = document.getElementById(config.uploadSectionId);
    const notApplicable = Boolean(item?.isNotApplicable);
    const uploadLocked = sentToCommercial || notApplicable;
    if (uploadSection) {
        uploadSection.classList.toggle('opacity-50', uploadLocked);
        uploadSection.classList.toggle('pointer-events-none', uploadLocked);
    }

    const context = await resolveImplantacaoListDriveContext(purchaseType);
    if (hint) {
        if (sentToCommercial) {
            hint.textContent = 'Enviado para compras — não é possível alterar esta lista.';
        } else if (notApplicable) {
            hint.textContent = 'Lista marcada como não possui — envio de PDF desabilitado.';
        } else {
            hint.textContent = canAct
                ? 'Envie um PDF (até 100 MB). Um novo envio substitui o arquivo anterior.'
                : 'Sem permissão para enviar arquivo.';
        }
    }

    if (pathEl) {
        if (context?.folderPath) {
            pathEl.textContent = context.folderPath;
            pathEl.classList.remove('hidden');
        } else {
            pathEl.classList.add('hidden');
        }
    }

    const btnSelect = document.getElementById(config.selectFileBtnId);
    const canUpload = canAct && !sentToCommercial && !notApplicable && !formLocked;
    if (btnSelect) btnSelect.disabled = !canUpload;
    updateImplantacaoListUploadButtons(purchaseType);
    await loadImplantacaoListDriveFile(purchaseType);
    updateImplantacaoListComercialCheckboxState(purchaseType, record);
    if (typeof updateImplantacaoActionButtons === 'function') {
        updateImplantacaoActionButtons(record);
    }
}

async function refreshImplantacaoListUploadSections(record = activeImplantacaoRecord) {
    const configs = typeof IMPLANTACAO_STANDARD_PURCHASE_UI !== 'undefined'
        ? IMPLANTACAO_STANDARD_PURCHASE_UI
        : [];
    for (const config of configs) {
        await refreshImplantacaoListUploadSection(config.purchaseType, record);
    }
}

function resetImplantacaoListUploadSections() {
    const configs = typeof IMPLANTACAO_STANDARD_PURCHASE_UI !== 'undefined'
        ? IMPLANTACAO_STANDARD_PURCHASE_UI
        : [];
    configs.forEach(config => {
        clearImplantacaoListFileSelection(config.purchaseType);
        renderImplantacaoListCurrentFile(config.purchaseType, null);
        const pathEl = document.getElementById(config.drivePathId);
        pathEl?.classList.add('hidden');
    });
}

function downloadImplantacaoListDriveFile(purchaseType) {
    const file = implantacaoListDriveFilesCache[purchaseType];
    const url = typeof resolveDriveFileDownloadUrl === 'function'
        ? resolveDriveFileDownloadUrl(file)
        : file?.url;
    if (!url) {
        alertAppDialog('Não foi possível gerar o link de download.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function handleImplantacaoListUpload(purchaseType) {
    const file = implantacaoListSelectedFiles[purchaseType];
    if (!file) return;

    const context = await resolveImplantacaoListDriveContext(purchaseType);
    if (!context) {
        alertAppDialog('Não foi possível identificar o pedido e o projeto.');
        return;
    }

    const validation = validateDriveUploadFiles([file], DRIVE_FILE_FOLDER_KIND.IMPLEMENTATION_LIST);
    if (validation) {
        alertAppDialog(validation, { variant: 'warning', title: 'Aviso' });
        return;
    }

    const item = typeof getImplantacaoStandardPurchaseItem === 'function'
        ? getImplantacaoStandardPurchaseItem(purchaseType)
        : null;
    if (!item?.id) {
        alertAppDialog('Salve a implantação antes de enviar a lista.');
        return;
    }

    if (isImplantacaoListSentToCompras(item)) {
        alertAppDialog('Esta lista já foi enviada para compras e não pode ser alterada.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    try {
        if (typeof setImplantacaoModalLoading === 'function') {
            setImplantacaoModalLoading(true, 'Enviando lista...');
        }

        await saveDriveFileUpload(file, {
            ...context,
            fileName: context.fileName
        }, (sent, total) => {
            if (!total || typeof setImplantacaoModalLoading !== 'function') return;
            const pct = Math.min(100, Math.round((sent / total) * 100));
            setImplantacaoModalLoading(true, `Enviando lista (${pct}%)...`);
        });

        const updatedItems = (activeImplementationPurchaseItems || []).map(row => {
            if (row.purchaseType !== purchaseType) return row;
            return {
                ...row,
                folderPath: context.folderPath,
                isNotApplicable: false,
                isChecked: true
            };
        });

        if (typeof saveImplementationPurchaseItems === 'function' && activeImplantacaoRecord?.id) {
            await saveImplementationPurchaseItems(updatedItems, activeImplantacaoRecord.id);
        }

        clearImplantacaoListFileSelection(purchaseType);
        await refreshImplantacaoListUploadSection(purchaseType);
        if (typeof updateImplantacaoActionButtons === 'function') {
            updateImplantacaoActionButtons();
        }

        if (typeof setImplantacaoModalLoading === 'function') {
            setImplantacaoModalLoading(true, 'Lista enviada com sucesso!', 'success');
            if (typeof waitImplantacaoStatus === 'function') await waitImplantacaoStatus(900);
            setImplantacaoModalLoading(false);
        }
    } catch (error) {
        console.error('handleImplantacaoListUpload:', error);
        if (typeof setImplantacaoModalLoading === 'function') {
            setImplantacaoModalLoading(true, error.message || 'Não foi possível enviar a lista.', 'error');
            if (typeof waitImplantacaoStatus === 'function') await waitImplantacaoStatus(2200);
            setImplantacaoModalLoading(false);
        }
    }
}

function bindImplantacaoListUploadEvents() {
    const configs = typeof IMPLANTACAO_STANDARD_PURCHASE_UI !== 'undefined'
        ? IMPLANTACAO_STANDARD_PURCHASE_UI
        : [];

    configs.forEach(config => {
        const purchaseType = config.purchaseType;

        document.getElementById(config.selectFileBtnId)?.addEventListener('click', () => {
            document.getElementById(config.fileInputId)?.click();
        });

        document.getElementById(config.fileInputId)?.addEventListener('change', (event) => {
            const input = event.target;
            const file = input.files?.[0] || null;
            if (file && !String(file.name || '').toLowerCase().endsWith('.pdf')) {
                alertAppDialog('Envie apenas arquivos PDF.', { variant: 'warning', title: 'Aviso' });
                input.value = '';
                implantacaoListSelectedFiles[purchaseType] = null;
            } else {
                implantacaoListSelectedFiles[purchaseType] = file;
            }
            const display = document.getElementById(config.fileDisplayId);
            if (display) display.value = implantacaoListSelectedFiles[purchaseType]?.name || '';
            updateImplantacaoListUploadButtons(purchaseType);
        });

        document.getElementById(config.uploadBtnId)
            ?.addEventListener('click', () => handleImplantacaoListUpload(purchaseType));

        document.getElementById(config.downloadBtnId)
            ?.addEventListener('click', () => downloadImplantacaoListDriveFile(purchaseType));

        document.getElementById(config.notApplicableId)?.addEventListener('change', async () => {
            const item = typeof getImplantacaoStandardPurchaseItem === 'function'
                ? getImplantacaoStandardPurchaseItem(purchaseType)
                : null;
            if (isImplantacaoListSentToCompras(item)) {
                const input = document.getElementById(config.notApplicableId);
                if (input) input.checked = Boolean(item?.isNotApplicable);
                return;
            }
            updateImplantacaoListUploadButtons(purchaseType);
            const uploadSection = document.getElementById(config.uploadSectionId);
            const notApplicable = Boolean(document.getElementById(config.notApplicableId)?.checked);
            uploadSection?.classList.toggle('opacity-50', notApplicable);
            uploadSection?.classList.toggle('pointer-events-none', notApplicable);
            const comercialInput = document.getElementById(config.comercialId);
            if (comercialInput) comercialInput.checked = false;
            updateImplantacaoListComercialCheckboxState(purchaseType);
            if (typeof updateImplantacaoActionButtons === 'function') {
                updateImplantacaoActionButtons();
            }
        });

        document.getElementById(config.comercialId)?.addEventListener('change', () => {
            const item = typeof getImplantacaoStandardPurchaseItem === 'function'
                ? getImplantacaoStandardPurchaseItem(purchaseType)
                : null;
            if (isImplantacaoListSentToCompras(item)) {
                const input = document.getElementById(config.comercialId);
                if (input) {
                    input.checked = true;
                    input.disabled = true;
                }
                return;
            }
            if (!hasImplantacaoListDriveFileUploaded(purchaseType, item)) {
                const input = document.getElementById(config.comercialId);
                if (input) input.checked = false;
                updateImplantacaoListComercialCheckboxState(purchaseType);
                return;
            }
            if (typeof updateImplantacaoActionButtons === 'function') {
                updateImplantacaoActionButtons();
            }
        });
    });
}

window.isImplantacaoStandardPurchaseItemFulfilled = isImplantacaoStandardPurchaseItemFulfilled;
window.refreshImplantacaoListUploadSections = refreshImplantacaoListUploadSections;
window.resetImplantacaoListUploadSections = resetImplantacaoListUploadSections;
window.bindImplantacaoListUploadEvents = bindImplantacaoListUploadEvents;
window.updateImplantacaoListUploadButtons = updateImplantacaoListUploadButtons;
window.hasImplantacaoListDriveFileUploaded = hasImplantacaoListDriveFileUploaded;
window.updateImplantacaoListComercialCheckboxState = updateImplantacaoListComercialCheckboxState;
