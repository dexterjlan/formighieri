let thirdPartyProjectDetailState = {
    project: null,
    driveFile: null,
    selectedFile: null
};

function setThirdPartyProjectDetailLoading(active, message = 'Processando...') {
    const wrap = document.getElementById('third-party-project-detail-loading');
    const msg = document.getElementById('third-party-project-detail-loading-msg');
    if (!wrap) return;
    wrap.classList.toggle('hidden', !active);
    if (msg) msg.textContent = message;
}

function waitThirdPartyProjectDetailStatus(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeThirdPartyDriveFileSlug(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^\w.\-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40) || 'Terceiro';
}

function buildThirdPartyDriveFileName(orderCode, projectName, subtypeName, originalName) {
    const ext = typeof getDriveFileExtension === 'function'
        ? getDriveFileExtension(originalName)
        : '';
    const safeExt = ext ? `.${ext}` : '';
    const order = sanitizeThirdPartyDriveFileSlug(orderCode) || 'Pedido';
    const project = sanitizeThirdPartyDriveFileSlug(projectName) || 'Projeto';
    const subtype = sanitizeThirdPartyDriveFileSlug(subtypeName) || 'Terceiro';
    let base = `Terceiro-${order}-${project}-${subtype}${safeExt}`;
    if (base.length > 100) {
        base = `Terceiro-${order}-${subtype}${safeExt}`;
    }
    return base.slice(0, 120);
}

async function resolveThirdPartyProjectDriveContext(project) {
    const projectId = Number(project?.id);
    const orderProjectId = Number(project?.orderProjectId);
    const orderId = Number(project?.orderId);
    if (!projectId || !orderProjectId || !orderId) return null;

    let orderCode = project?.order?.orderCode || '';
    let projectName = project?.orderProject?.name || '';

    if (!orderCode || !projectName) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(`id, name, projectCode, order:salesOrders(orderCode)`)
            .eq('id', orderProjectId)
            .maybeSingle();

        if (error || !data) return null;
        orderCode = data.order?.orderCode || orderCode;
        projectName = data.name || projectName;
    }

    if (!orderCode) return null;

    const subtypeName = project?.thirdPartySubtype?.name || 'Terceiro';

    return {
        entityType: DRIVE_FILE_ENTITY_TYPE.THIRD_PARTY_PROJECT,
        entityId: projectId,
        orderId,
        orderProjectId,
        orderCode,
        projectName,
        folderKind: DRIVE_FILE_FOLDER_KIND.THIRD_PARTY,
        folderPath: buildDriveFolderPath(orderCode, projectName, DRIVE_FILE_FOLDER_KIND.THIRD_PARTY),
        replaceByEntity: true,
        fileName: buildThirdPartyDriveFileName(orderCode, projectName, subtypeName, 'arquivo.pdf')
    };
}

async function loadThirdPartyProjectDetailDriveFile(project) {
    const projectId = Number(project?.id);
    if (!projectId || typeof findDriveFileForEntity !== 'function') {
        thirdPartyProjectDetailState.driveFile = null;
        return null;
    }

    const file = await findDriveFileForEntity({
        entityType: DRIVE_FILE_ENTITY_TYPE.THIRD_PARTY_PROJECT,
        entityId: projectId,
        folderKind: DRIVE_FILE_FOLDER_KIND.THIRD_PARTY
    });
    thirdPartyProjectDetailState.driveFile = file || null;
    return file;
}

function renderThirdPartyProjectDetailDriveSection(project, driveFile) {
    const emptyEl = document.getElementById('third-party-project-detail-file-empty');
    const currentEl = document.getElementById('third-party-project-detail-file-current');
    const nameEl = document.getElementById('third-party-project-detail-file-name');
    const metaEl = document.getElementById('third-party-project-detail-file-meta');
    const pathEl = document.getElementById('third-party-project-detail-drive-path');
    const legacyPathEl = document.getElementById('third-party-project-detail-legacy-path');
    const uploadWrap = document.getElementById('third-party-project-detail-upload-wrap');
    const downloadBtn = document.getElementById('btn-third-party-project-detail-download');
    const sendBtn = document.getElementById('btn-third-party-project-detail-send');
    const finishBtn = document.getElementById('btn-third-party-project-detail-finish');

    const requiresCommercial = typeof isThirdPartyProjectCommercialApprovalRequired === 'function'
        && isThirdPartyProjectCommercialApprovalRequired(project);
    const canAct = typeof canActThirdPartyProjectAsProjetista === 'function'
        && canActThirdPartyProjectAsProjetista(project);
    const isOpen = project?.status === THIRD_PARTY_PROJECT_STATUS_OPEN;
    const legacyPath = String(project?.filePath || '').trim();

    if (pathEl && thirdPartyProjectDetailState.driveContext?.folderPath) {
        pathEl.textContent = thirdPartyProjectDetailState.driveContext.folderPath;
    }

    if (legacyPathEl) {
        legacyPathEl.textContent = legacyPath || '—';
        legacyPathEl.closest('.third-party-project-detail-legacy-wrap')
            ?.classList.toggle('hidden', !legacyPath);
    }

    if (!driveFile?.id) {
        emptyEl?.classList.remove('hidden');
        currentEl?.classList.add('hidden');
        if (downloadBtn) downloadBtn.disabled = true;
    } else {
        emptyEl?.classList.add('hidden');
        currentEl?.classList.remove('hidden');
        if (nameEl) nameEl.textContent = driveFile.fileName || 'Arquivo';
        if (metaEl) {
            const size = typeof formatDriveFileSize === 'function'
                ? formatDriveFileSize(driveFile.fileSizeBytes)
                : '';
            const updated = driveFile.updatedAt && typeof formatGestaoDateTime === 'function'
                ? formatGestaoDateTime(driveFile.updatedAt)
                : '';
            metaEl.textContent = [size, updated].filter(Boolean).join(' · ') || '—';
        }
        if (downloadBtn) downloadBtn.disabled = false;
    }

    const showUpload = canAct && (isOpen || project?.status === THIRD_PARTY_PROJECT_STATUS_IN_REVIEW);
    uploadWrap?.classList.toggle('hidden', !showUpload);

    if (sendBtn) {
        sendBtn.classList.toggle('hidden', !requiresCommercial);
        sendBtn.disabled = !canAct || !isOpen || (!driveFile?.driveFileId && !legacyPath);
    }

    if (finishBtn) {
        finishBtn.classList.toggle('hidden', requiresCommercial);
        finishBtn.disabled = !canAct
            || project?.status === THIRD_PARTY_PROJECT_STATUS_APPROVED
            || (!driveFile?.driveFileId && !legacyPath);
    }
}

function clearThirdPartyProjectDetailFileSelection() {
    thirdPartyProjectDetailState.selectedFile = null;
    const input = document.getElementById('third-party-project-detail-file-input');
    if (input) input.value = '';
    const display = document.getElementById('third-party-project-detail-file-display');
    if (display) display.value = '';
    const uploadBtn = document.getElementById('btn-third-party-project-detail-upload');
    if (uploadBtn) uploadBtn.disabled = true;
}

async function refreshThirdPartyProjectDetailAfterChange(projectId) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return;

    let project = null;
    if (typeof fetchThirdPartyProjectById === 'function') {
        project = await fetchThirdPartyProjectById(normalizedId);
    }

    if (!project) {
        project = thirdPartyProjectDetailState.project;
    }

    if (!project) return;

    thirdPartyProjectDetailState.project = project;
    thirdPartyProjectDetailState.driveContext = await resolveThirdPartyProjectDriveContext(project);
    const driveFile = await loadThirdPartyProjectDetailDriveFile(project);
    renderThirdPartyProjectDetailModalFields(project);
    renderThirdPartyProjectDetailDriveSection(project, driveFile);
    clearThirdPartyProjectDetailFileSelection();
}

function renderThirdPartyProjectDetailModalFields(project) {
    const statusLabel = getThirdPartyProjectStatusLabel(project.status);
    const statusClass = getThirdPartyProjectStatusBadgeClass(project.status);
    const requiresCommercial = isThirdPartyProjectCommercialApprovalRequired(project);

    document.getElementById('third-party-project-detail-title').textContent = getThirdPartyProjectLabel(project);
    document.getElementById('third-party-project-detail-subtitle').textContent =
        `Pedido ${project.order?.orderCode || '—'} · ${getOrderClientName(project.order) || '—'}`;

    document.getElementById('third-party-project-detail-status').innerHTML =
        `<span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(statusLabel)}</span>`;

    const flowHint = document.getElementById('third-party-project-detail-flow-hint');
    if (flowHint) {
        flowHint.textContent = requiresCommercial
            ? 'Este subtipo exige aprovação do consultor após o envio do arquivo.'
            : 'Este subtipo não exige aprovação comercial: envie o arquivo e conclua no detalhe.';
    }

    document.getElementById('third-party-project-detail-project').textContent =
        project.orderProject?.name || '—';
    document.getElementById('third-party-project-detail-subtype').textContent =
        project.thirdPartySubtype?.name || '—';
    document.getElementById('third-party-project-detail-characteristic').textContent =
        project.projectCharacteristic?.name || '—';
    document.getElementById('third-party-project-detail-designer').textContent =
        project.designer?.name || 'Sem projetista';
    document.getElementById('third-party-project-detail-sent-at').textContent =
        typeof formatThirdPartyProjectDateTime === 'function'
            ? formatThirdPartyProjectDateTime(project.sentAt)
            : '—';
    document.getElementById('third-party-project-detail-approved-at').textContent =
        typeof formatThirdPartyProjectDateTime === 'function'
            ? formatThirdPartyProjectDateTime(project.approvedAt)
            : '—';

    const historyBtn = document.getElementById('btn-third-party-project-detail-history');
    if (historyBtn) {
        historyBtn.dataset.thirdPartyProjectId = String(project.id);
    }
}

async function openThirdPartyProjectDetailModal(project) {
    const modal = document.getElementById('third-party-project-detail-modal');
    if (!modal || !project) return;

    thirdPartyProjectDetailState.project = project;
    thirdPartyProjectDetailState.driveContext = await resolveThirdPartyProjectDriveContext(project);
    clearThirdPartyProjectDetailFileSelection();

    renderThirdPartyProjectDetailModalFields(project);

    try {
        const driveFile = await loadThirdPartyProjectDetailDriveFile(project);
        renderThirdPartyProjectDetailDriveSection(project, driveFile);
    } catch (error) {
        console.error('openThirdPartyProjectDetailModal:', error);
        renderThirdPartyProjectDetailDriveSection(project, null);
    }

    toggleModal('third-party-project-detail-modal', true);
}

async function uploadThirdPartyProjectDetailFile() {
    const project = thirdPartyProjectDetailState.project;
    const file = thirdPartyProjectDetailState.selectedFile;
    if (!project?.id || !file) return;

    const context = thirdPartyProjectDetailState.driveContext
        || await resolveThirdPartyProjectDriveContext(project);
    if (!context) {
        alertAppDialog('Não foi possível identificar pedido e projeto para o upload.');
        return;
    }

    const folderKind = DRIVE_FILE_FOLDER_KIND.THIRD_PARTY;
    const validationError = validateDriveUploadFiles([file], folderKind);
    if (validationError) {
        alertAppDialog(validationError, { variant: 'warning', title: 'Arquivo inválido' });
        return;
    }

    context.fileName = buildThirdPartyDriveFileName(
        context.orderCode,
        context.projectName,
        project.thirdPartySubtype?.name,
        file.name
    );

    try {
        setThirdPartyProjectDetailLoading(true, 'Enviando arquivo...');
        await saveDriveFileUpload(file, context, (loaded, total) => {
            const pct = total ? Math.round((loaded / total) * 100) : 0;
            setThirdPartyProjectDetailLoading(true, `Enviando arquivo... ${pct}%`);
        });
        await refreshThirdPartyProjectDetailAfterChange(project.id);
        setThirdPartyProjectDetailLoading(true, 'Arquivo enviado!', 'success');
        await waitThirdPartyProjectDetailStatus(1200);
    } catch (error) {
        setThirdPartyProjectDetailLoading(true, error.message || 'Erro no upload.', 'error');
        await waitThirdPartyProjectDetailStatus(2200);
    } finally {
        setThirdPartyProjectDetailLoading(false);
    }
}

function downloadThirdPartyProjectDetailFile() {
    const file = thirdPartyProjectDetailState.driveFile;
    const url = typeof resolveDriveFileDownloadUrl === 'function'
        ? resolveDriveFileDownloadUrl(file)
        : '';
    if (!url) {
        alertAppDialog('Não foi possível gerar o link de download.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function sendThirdPartyProjectFromDetailModal() {
    const project = thirdPartyProjectDetailState.project;
    if (!project?.id) return;

    try {
        setThirdPartyProjectDetailLoading(true, 'Enviando ao consultor...');
        await sendThirdPartyProject(project.id);
        await refreshThirdPartyProjectDetailAfterChange(project.id);
        if (typeof reloadThirdPartyProjectViews === 'function') {
            await reloadThirdPartyProjectViews();
        }
        setThirdPartyProjectDetailLoading(true, 'Enviado ao consultor!');
        await waitThirdPartyProjectDetailStatus(1200);
    } catch (error) {
        setThirdPartyProjectDetailLoading(true, error.message || 'Erro ao enviar.');
        await waitThirdPartyProjectDetailStatus(1600);
        alertAppDialog(error.message || 'Erro ao enviar.', { variant: 'warning', title: 'Aviso' });
    } finally {
        setThirdPartyProjectDetailLoading(false);
    }
}

async function finishThirdPartyProjectFromDetailModal() {
    const project = thirdPartyProjectDetailState.project;
    if (!project?.id) return;

    try {
        setThirdPartyProjectDetailLoading(true, 'Concluindo projeto...');
        await markThirdPartyProjectApprovedAfterProcurementUpload(project.id);
        await refreshThirdPartyProjectDetailAfterChange(project.id);
        if (typeof reloadThirdPartyProjectViews === 'function') {
            await reloadThirdPartyProjectViews();
        }
        setThirdPartyProjectDetailLoading(true, 'Projeto concluído!');
        await waitThirdPartyProjectDetailStatus(1200);
    } catch (error) {
        setThirdPartyProjectDetailLoading(true, error.message || 'Erro ao concluir.');
        await waitThirdPartyProjectDetailStatus(1600);
        alertAppDialog(error.message || 'Erro ao concluir.', { variant: 'warning', title: 'Aviso' });
    } finally {
        setThirdPartyProjectDetailLoading(false);
    }
}

function closeThirdPartyProjectDetailModal() {
    setThirdPartyProjectDetailLoading(false);
    toggleModal('third-party-project-detail-modal', false);
}

async function reloadThirdPartyProjectViews() {
    if (typeof loadPendenciasThirdPartyProjetista === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
        await loadPendenciasThirdPartyProjetista();
    }
    if (typeof loadOrderThirdPartyProjectsTab === 'function' && activeOrderId) {
        await loadOrderThirdPartyProjectsTab(activeOrderId);
    }
}

function bindThirdPartyProjectDetailModalEvents() {
    document.getElementById('btn-close-third-party-project-detail')?.addEventListener('click', closeThirdPartyProjectDetailModal);
    document.getElementById('btn-close-third-party-project-detail-footer')?.addEventListener('click', closeThirdPartyProjectDetailModal);

    document.getElementById('btn-third-party-project-detail-select-file')?.addEventListener('click', () => {
        document.getElementById('third-party-project-detail-file-input')?.click();
    });

    document.getElementById('third-party-project-detail-file-input')?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        thirdPartyProjectDetailState.selectedFile = file || null;
        const display = document.getElementById('third-party-project-detail-file-display');
        if (display) display.value = file?.name || '';
        const uploadBtn = document.getElementById('btn-third-party-project-detail-upload');
        if (uploadBtn) uploadBtn.disabled = !file;
    });

    document.getElementById('btn-third-party-project-detail-upload')?.addEventListener('click', uploadThirdPartyProjectDetailFile);
    document.getElementById('btn-third-party-project-detail-download')?.addEventListener('click', downloadThirdPartyProjectDetailFile);
    document.getElementById('btn-third-party-project-detail-send')?.addEventListener('click', sendThirdPartyProjectFromDetailModal);
    document.getElementById('btn-third-party-project-detail-finish')?.addEventListener('click', finishThirdPartyProjectFromDetailModal);

    document.getElementById('btn-third-party-project-detail-history')?.addEventListener('click', () => {
        const projectId = Number(document.getElementById('btn-third-party-project-detail-history')?.dataset.thirdPartyProjectId);
        const project = thirdPartyProjectDetailState.project
            || (typeof orderThirdPartyProjectsCache !== 'undefined'
                ? orderThirdPartyProjectsCache.find(item => Number(item.id) === projectId)
                : null);
        if (project && typeof openThirdPartyProjectStatusHistoryModal === 'function') {
            openThirdPartyProjectStatusHistoryModal(project);
        }
    });
}

window.openThirdPartyProjectDetailModal = openThirdPartyProjectDetailModal;
window.reloadThirdPartyProjectViews = reloadThirdPartyProjectViews;
window.bindThirdPartyProjectDetailModalEvents = bindThirdPartyProjectDetailModalEvents;
window.fetchThirdPartyProjectDriveFileForCompra = async function fetchThirdPartyProjectDriveFileForCompra(thirdPartyProjectId) {
    const projectId = Number(thirdPartyProjectId);
    if (!projectId || typeof findDriveFileForEntity !== 'function') return null;
    return findDriveFileForEntity({
        entityType: DRIVE_FILE_ENTITY_TYPE.THIRD_PARTY_PROJECT,
        entityId: projectId,
        folderKind: DRIVE_FILE_FOLDER_KIND.THIRD_PARTY
    });
};
