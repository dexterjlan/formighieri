function isEmRevisaoTecnicaApproval(approval) {
    const projectStatusName = typeof getCommercialApprovalProjectStatusName === 'function'
        ? getCommercialApprovalProjectStatusName(approval)
        : '';

    if (projectStatusName) {
        return isOrderProjectEmRevisaoComercialProjStatus(projectStatusName);
    }

    return approval?.status === 'Em revisão';
}

function isCreatingNewTecnicaRevision(approval) {
    return currentRevisionType === 'tecnica'
        && (!editingRevisionId
            || isCommercialApprovalEmRevisaoComercialConsStatus(approval?.status)
            || approval?.status === 'Aguardando Aprovação');
}

function canConsultorEditExistingTecnicaRevision(approval) {
    if (!approval || currentRevisionType !== 'tecnica') return false;
    if (isCreatingNewTecnicaRevision(approval)) return false;
    if (!isEmRevisaoTecnicaApproval(approval)) return false;
    return canEditRevisionActivitiesConsultor(approval);
}

function canConsultorEditExistingTecnicaRevisionActivity(approval, activity = null) {
    if (!canConsultorEditExistingTecnicaRevision(approval)) return false;
    return !activity?.completed;
}

function canEditRevisionActivitiesConsultor(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (typeof currentRevisionType !== 'undefined' && currentRevisionType === 'comercial') {
        if (typeof isGestorComercial === 'function' && isGestorComercial()) return true;
    }
    if (!approval) {
        return currentUser?.role === 'Admin';
    }
    return typeof isAdminOrOrderConsultorForApproval === 'function'
        && isAdminOrOrderConsultorForApproval(approval);
}

function canEditRevisionActivityProjetista(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role === 'Projetista'
        && approval?.designerId
        && Number(approval.designerId) === Number(currentUser.id)) return true;
    return false;
}

function canEditRevisionActivityCompletionFields(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Projetista') return false;
    if (!approval?.designerId || Number(approval.designerId) !== Number(currentUser.id)) return false;

    const projectStatusName = typeof getCommercialApprovalProjectStatusName === 'function'
        ? getCommercialApprovalProjectStatusName(approval)
        : '';

    const inTechnicalRevision = projectStatusName
        ? isOrderProjectEmRevisaoComercialProjStatus(projectStatusName)
        : approval?.status === 'Em revisão';

    if (!inTechnicalRevision) return false;

    if (currentRevisionType === 'tecnica' && !isCreatingNewTecnicaRevision(approval) && !isTechnicalRevisionStarted()) {
        return false;
    }

    return true;
}

function canViewCommercialRevision(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role === 'Projetista'
        && approval?.designerId
        && Number(approval.designerId) === Number(currentUser.id)) return true;
    return typeof isAdminOrOrderConsultorForApproval === 'function'
        && isAdminOrOrderConsultorForApproval(approval);
}

function canOpenRevisionModal(approval) {
    if (!approval) return false;

    if (isEmRevisaoTecnicaApproval(approval)) {
        if (currentUser?.role === 'Projetista') {
            return approval?.designerId && Number(approval.designerId) === Number(currentUser.id);
        }
        if (currentUser?.role === 'Admin') return true;
        return typeof isAdminOrOrderConsultorForApproval === 'function'
            && isAdminOrOrderConsultorForApproval(approval);
    }

    const projectStatusName = typeof getCommercialApprovalProjectStatusName === 'function'
        ? getCommercialApprovalProjectStatusName(approval)
        : '';
    if (isOrderProjectEmRevisaoComercialConsStatus(projectStatusName)) {
        return canRequestNewRevision(approval, projectStatusName);
    }

    return canRequestNewRevision(approval, projectStatusName);
}

function canRequestNewRevision(approval, projectStatusName = null) {
    if (!approval) return false;

    const canUserExecute = currentUser?.role === 'Admin'
        || (typeof isAdminOrOrderConsultorForApproval === 'function' && isAdminOrOrderConsultorForApproval(approval));
    if (!canUserExecute) return false;

    const status = projectStatusName || (typeof getCommercialApprovalProjectStatusName === 'function' ? getCommercialApprovalProjectStatusName(approval) : '');
    if (status) {
        return isOrderProjectEmRevisaoComercialConsStatus(status);
    }

    return isCommercialApprovalEmRevisaoComercialConsStatus(approval?.status);
}

function canSendBackToApproval(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Projetista') return false;
    if (!approval?.designerId || Number(approval.designerId) !== Number(currentUser.id)) return false;

    const projectStatusName = typeof getCommercialApprovalProjectStatusName === 'function'
        ? getCommercialApprovalProjectStatusName(approval)
        : '';

    if (projectStatusName) {
        return isOrderProjectEmRevisaoComercialProjStatus(projectStatusName);
    }

    return approval?.status === 'Em revisão';
}

function allRevisionActivitiesCompleted() {
    const activities = collectRevisionActivitiesFromDom().filter(a => a.description);
    if (activities.length === 0) return false;
    return activities.every(a => a.completed);
}

function getCurrentApproval() {
    return commercialApprovalsCache.find(a => a.id === currentRevisionApprovalId);
}

function getCommercialApprovalDesignerId(approval) {
    if (approval?.designerId) return Number(approval.designerId);
    const orderProjectId = Number(approval?.orderProjectId || approval?.id);
    if (!orderProjectId) return null;
    if (typeof orderProjectsCache !== 'undefined' && Array.isArray(orderProjectsCache)) {
        const project = orderProjectsCache.find(item => Number(item.id) === orderProjectId);
        if (project?.designerId) return Number(project.designerId);
    }
    return null;
}

function renderRevisionResizableText(text, tone = 'default') {
    const hasText = Boolean(text);
    const content = hasText ? escapeHtml(text) : '—';
    const toneClass = hasText
        ? (tone === 'muted' ? 'text-slate-600' : 'text-slate-800')
        : 'text-slate-400';

    return `<div class="revision-resizable-field revision-resizable-field--readonly ${toneClass}">${content}</div>`;
}

let currentRevisionType = 'tecnica';
let currentRevisionMeta = {
    revisionStartedAt: null,
    revisionCompletedAt: null
};

function resetCurrentRevisionMeta() {
    currentRevisionMeta = {
        revisionStartedAt: null,
        revisionCompletedAt: null
    };
}

function isTechnicalRevisionStarted() {
    return Boolean(currentRevisionMeta.revisionStartedAt);
}

function isTechnicalRevisionInProgress() {
    return isTechnicalRevisionStarted() && !currentRevisionMeta.revisionCompletedAt;
}

function isProjetistaTechnicalRevisionResponder(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Projetista') return false;
    if (!approval?.designerId || Number(approval.designerId) !== Number(currentUser.id)) return false;

    const projectStatusName = typeof getCommercialApprovalProjectStatusName === 'function'
        ? getCommercialApprovalProjectStatusName(approval)
        : '';

    if (projectStatusName) {
        return isOrderProjectEmRevisaoComercialProjStatus(projectStatusName);
    }

    return approval?.status === 'Em revisão';
}

async function loadRevisionMeta(revisionId) {
    if (!revisionId) {
        resetCurrentRevisionMeta();
        return;
    }

    const data = await fetchRevisionById(revisionId);

    if (!data) {
        resetCurrentRevisionMeta();
        return;
    }

    currentRevisionMeta = {
        revisionStartedAt: data.revisionStartedAt || null,
        revisionCompletedAt: data.revisionCompletedAt || null
    };
}

function refreshRevisionActivityCompletionFieldStates(approval) {
    const canEdit = canEditRevisionActivityCompletionFields(approval);
    document.querySelectorAll('#revision-activities-list tr').forEach(tr => {
        const checkbox = tr.querySelector('.revision-activity-completed');
        const observation = tr.querySelector('.revision-activity-observation');
        if (checkbox) checkbox.disabled = !canEdit;
        if (observation) observation.disabled = !canEdit;
    });
}

function updateRevisionProgressBanner(approval) {
    const banner = document.getElementById('revision-progress-info');
    if (!banner) return;

    if (currentRevisionType !== 'tecnica' || revisionModalViewOnly || isCreatingNewTecnicaRevision(approval)) {
        banner.classList.add('hidden');
        banner.textContent = '';
        return;
    }

    if (!isProjetistaTechnicalRevisionResponder(approval) || currentUser?.role === 'Admin') {
        if (isTechnicalRevisionStarted()) {
            const startedLabel = formatDate(currentRevisionMeta.revisionStartedAt);
            const completedLabel = currentRevisionMeta.revisionCompletedAt
                ? formatDate(currentRevisionMeta.revisionCompletedAt)
                : null;
            banner.className = completedLabel
                ? 'text-xs rounded-lg border px-3 py-2 border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'text-xs rounded-lg border px-3 py-2 border-sky-200 bg-sky-50 text-sky-800';
            banner.textContent = completedLabel
                ? `Revisão técnica: ${startedLabel} → ${completedLabel}`
                : `Revisão técnica em andamento desde ${startedLabel}`;
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
            banner.textContent = '';
        }
        return;
    }

    if (!isTechnicalRevisionStarted()) {
        banner.className = 'text-xs rounded-lg border px-3 py-2 border-amber-200 bg-amber-50 text-amber-800';
        banner.textContent = 'Clique em Iniciar Revisão para liberar os campos Realizado e Observação.';
        banner.classList.remove('hidden');
        return;
    }

    if (isTechnicalRevisionInProgress()) {
        banner.className = 'text-xs rounded-lg border px-3 py-2 border-sky-200 bg-sky-50 text-sky-800';
        banner.textContent = `Revisão em andamento desde ${formatDate(currentRevisionMeta.revisionStartedAt)}.`;
        banner.classList.remove('hidden');
        return;
    }

    banner.className = 'text-xs rounded-lg border px-3 py-2 border-emerald-200 bg-emerald-50 text-emerald-800';
    banner.textContent = `Revisão concluída em ${formatDate(currentRevisionMeta.revisionCompletedAt)}.`;
    banner.classList.remove('hidden');
}

function canProjetistaStartTechnicalRevision(approval) {
    if (revisionModalViewOnly) return false;
    if (currentRevisionType !== 'tecnica') return false;
    if (isCreatingNewTecnicaRevision(approval)) return false;
    if (!editingRevisionId) return false;
    if (isTechnicalRevisionStarted()) return false;
    if (currentUser?.role === 'Admin') return false;
    return isProjetistaTechnicalRevisionResponder(approval);
}

function renderRevisionActivityRow(activity) {
    const approval = getCurrentApproval();
    const isComercial = currentRevisionType === 'comercial';
    const isCreatingNewTecnica = isCreatingNewTecnicaRevision(approval);
    const canConsultorEditExistingActivity = canConsultorEditExistingTecnicaRevisionActivity(approval, activity);

    const consultorCanEdit = !revisionModalViewOnly
        && canEditRevisionActivitiesConsultor(approval)
        && (isComercial || isCreatingNewTecnica || canConsultorEditExistingActivity);

    const completionCanEdit = !revisionModalViewOnly && (
        isComercial
            ? consultorCanEdit
            : (!isCreatingNewTecnica && canEditRevisionActivityCompletionFields(approval))
    );
    const rowId = activity.id || activity.tempId;

    const tr = document.createElement('tr');
    tr.dataset.rowId = rowId;
    if (activity.completedAt) {
        tr.dataset.completedAt = activity.completedAt;
    }

    const obsPlaceholder = isComercial ? 'Observação do consultor...' : 'Observação do projetista...';

    tr.innerHTML = `
        <td class="p-3 align-top">
            <textarea rows="2" class="revision-activity-description revision-resizable-input px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 disabled:bg-slate-50"
                placeholder="Descreva a atividade..."
                ${consultorCanEdit ? '' : 'disabled'}>${escapeHtml(activity.description || '')}</textarea>
            ${typeof renderRevisionActivityAttachmentsHtml === 'function'
                ? renderRevisionActivityAttachmentsHtml(rowId, approval, activity)
                : ''}
        </td>
        <td class="p-3 align-top text-center">
            <input type="checkbox" class="revision-activity-completed h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                ${activity.completed ? 'checked' : ''}
                ${completionCanEdit ? '' : 'disabled'}>
        </td>
        <td class="p-3 align-top">
            <textarea rows="2" class="revision-activity-observation revision-resizable-input px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 disabled:bg-slate-50"
                placeholder="${obsPlaceholder}"
                ${completionCanEdit ? '' : 'disabled'}>${escapeHtml(activity.observation || '')}</textarea>
        </td>
        <td class="p-3 align-top">
            <p class="revision-activity-completed-at px-2 py-1.5 text-xs border border-slate-100 rounded-lg bg-slate-50 text-slate-600 whitespace-nowrap">
                ${activity.completedAt ? formatDate(activity.completedAt) : '—'}
            </p>
        </td>
    `;

    const checkbox = tr.querySelector('.revision-activity-completed');
    const completedAtEl = tr.querySelector('.revision-activity-completed-at');
    checkbox?.addEventListener('change', async function () {
        if (this.checked) {
            const now = new Date().toISOString();
            tr.dataset.completedAt = now;
            completedAtEl.textContent = formatDate(now);
        } else {
            delete tr.dataset.completedAt;
            completedAtEl.textContent = '—';
        }
        updateRevisionModalControls(approval);
    });

    if (typeof hydrateRevisionActivityAttachmentPreviews === 'function') {
        hydrateRevisionActivityAttachmentPreviews(tr);
    }

    return tr;
}

function addRevisionActivityRow(activity = {}) {
    if (!activity.tempId && !activity.id) {
        revisionActivityRowCounter += 1;
        activity.tempId = `temp-${revisionActivityRowCounter}`;
    }

    document.getElementById('revision-activities-list').appendChild(renderRevisionActivityRow(activity));
    document.getElementById('revision-empty-msg').classList.add('hidden');
    const approval = getCurrentApproval();
    if (approval) updateRevisionModalControls(approval);
}

function collectRevisionActivitiesFromDom() {
    const rows = document.querySelectorAll('#revision-activities-list tr');
    return Array.from(rows).map((tr, index) => {
        const rowId = tr.dataset.rowId;
        const isPersisted = rowId && !String(rowId).startsWith('temp-');
        const completed = tr.querySelector('.revision-activity-completed')?.checked || false;

        return {
            rowId,
            id: isPersisted ? Number(rowId) : null,
            description: tr.querySelector('.revision-activity-description')?.value.trim() || '',
            completed,
            observation: tr.querySelector('.revision-activity-observation')?.value.trim() || '',
            completedAt: completed ? (tr.dataset.completedAt || new Date().toISOString()) : null,
            sortOrder: index
        };
    });
}

function updateRevisionModalControls(approval) {
    const addBtn = document.getElementById('btn-add-revision-activity');
    const saveBtn = document.getElementById('btn-save-revision');
    const sendBackBtn = document.getElementById('btn-send-back-approval');
    const startBtn = document.getElementById('btn-start-revision');

    if (revisionModalViewOnly) {
        addBtn.classList.add('hidden');
        saveBtn.classList.add('hidden');
        sendBackBtn.classList.add('hidden');
        startBtn?.classList.add('hidden');
        updateRevisionProgressBanner(approval);
        return;
    }

    if (currentRevisionType === 'comercial') {
        const canEditComercial = canEditRevisionActivitiesConsultor(approval);
        addBtn.classList.toggle('hidden', !canEditComercial);
        saveBtn.classList.toggle('hidden', !canEditComercial);
        sendBackBtn.classList.add('hidden');
        startBtn?.classList.add('hidden');
        saveBtn.textContent = 'Salvar Revisão Comercial';
        updateRevisionProgressBanner(approval);
        return;
    }

    const isCreatingNewTecnica = isCreatingNewTecnicaRevision(approval);
    const canConsultorCreate = canEditRevisionActivitiesConsultor(approval) && isCreatingNewTecnica;
    const canConsultorEditExisting = canConsultorEditExistingTecnicaRevision(approval);
    const canStart = canProjetistaStartTechnicalRevision(approval);
    const revisionStarted = isTechnicalRevisionStarted();

    if (isCreatingNewTecnica) {
        addBtn.classList.toggle('hidden', !canConsultorCreate);
        saveBtn.classList.toggle('hidden', !canConsultorCreate);
        sendBackBtn.classList.add('hidden');
        startBtn?.classList.add('hidden');
        saveBtn.textContent = 'Criar Revisão Técnica';
        updateRevisionProgressBanner(approval);
        return;
    }

    if (canConsultorEditExisting) {
        addBtn.classList.remove('hidden');
        saveBtn.classList.remove('hidden');
        sendBackBtn.classList.add('hidden');
        startBtn?.classList.add('hidden');
        saveBtn.textContent = 'Salvar Revisão Técnica';
        updateRevisionProgressBanner(approval);
        return;
    }

    const canSend = canSendBackToApproval(approval);
    const allComplete = allRevisionActivitiesCompleted();

    addBtn.classList.add('hidden');
    startBtn?.classList.toggle('hidden', !canStart);
    saveBtn.classList.toggle('hidden', !canOpenRevisionModal(approval) || (isProjetistaTechnicalRevisionResponder(approval) && !revisionStarted));
    sendBackBtn.classList.toggle('hidden', !canSend || !revisionStarted);
    sendBackBtn.disabled = !canSend || !allComplete || !revisionStarted;
    sendBackBtn.classList.toggle('opacity-50', !allComplete || !revisionStarted);
    sendBackBtn.classList.toggle('cursor-not-allowed', !allComplete || !revisionStarted);
    saveBtn.textContent = 'Salvar Revisão Técnica';
    updateRevisionProgressBanner(approval);
    refreshRevisionActivityCompletionFieldStates(approval);
}

async function loadRevisionActivities(revisionId) {
    await loadRevisionMeta(revisionId);

    const activities = await fetchRevisionActivities(revisionId);

    const tbody = document.getElementById('revision-activities-list');
    tbody.innerHTML = '';

    if (!activities || activities.length === 0) {
        document.getElementById('revision-empty-msg').classList.remove('hidden');
        updateRevisionModalControls(getCurrentApproval());
        return;
    }

    document.getElementById('revision-empty-msg').classList.add('hidden');
    activities.forEach(addRevisionActivityRow);
    if (typeof loadRevisionActivityAttachmentsForActivities === 'function') {
        await loadRevisionActivityAttachmentsForActivities(activities);
    }
    updateRevisionModalControls(getCurrentApproval());
}

async function ensureApprovalInCache(approvalId, forceRefresh = false) {
    if (typeof ensureProjectWorkflowInCache === 'function') {
        return ensureProjectWorkflowInCache(approvalId, forceRefresh);
    }
    return null;
}

async function getLatestRevisionForApproval(approvalId) {
    const approval = await ensureApprovalInCache(approvalId);
    if (!approval?.orderProjectId) return null;

    return fetchLatestRevisionForOrderProject(
        approval.orderProjectId,
        currentRevisionType === 'comercial' ? 'comercial' : 'tecnica'
    );
}

function setupCommercialRevisionModalHeader(approval) {
    const isComercial = currentRevisionType === 'comercial';
    const typeLabel = isComercial ? 'Revisão Comercial' : 'Revisão Técnica';

    document.getElementById('revision-approval-info').textContent =
        `${typeLabel} | Projeto: ${getCommercialApprovalProjectName(approval)} | Status: ${getApprovalStatusLabel(approval.status)}`;

    const badge = document.getElementById('revision-status-badge');
    badge.textContent = isComercial ? 'Revisão Comercial' : (approval.status === 'Aguardando Aprovação' ? 'Nova revisão' : getApprovalStatusLabel(approval.status));
    badge.className = `text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isComercial ? 'bg-purple-100 text-purple-800' : getApprovalStatusBadgeClass(approval.status === 'Aguardando Aprovação' ? 'Em revisão' : approval.status)}`;
}

async function openCommercialRevisionModal(approvalId, revisionType = 'tecnica', options = {}) {
    currentRevisionType = revisionType;
    revisionModalViewOnly = false;
    const approval = await ensureApprovalInCache(approvalId);
    if (!approval) return;

    const forceNew = Boolean(options?.forceNew);

    if (revisionType === 'tecnica') {
        if (forceNew) {
            if (!canRequestNewRevision(approval)) return;
        } else if (!canOpenRevisionModal(approval)) {
            return;
        }
    }

    if (revisionType === 'comercial') {
        const canAccessComercial = (typeof canAccessCommercialRevision === 'function' && canAccessCommercialRevision(approval))
            || canEditRevisionActivitiesConsultor(approval);
        if (!canAccessComercial) return;
    }

    currentRevisionApprovalId = approvalId;
    editingRevisionId = null;
    revisionActivityRowCounter = 0;
    resetCurrentRevisionMeta();
    if (typeof resetRevisionActivityAttachments === 'function') {
        resetRevisionActivityAttachments();
    }

    document.getElementById('revision-activities-list').innerHTML = '';
    document.getElementById('revision-empty-msg').classList.add('hidden');

    const targetRevisionId = options?.revisionId || null;

    if (targetRevisionId) {
        editingRevisionId = targetRevisionId;
        setupCommercialRevisionModalHeader(approval);
        await loadRevisionActivities(targetRevisionId);
    } else if (forceNew) {
        editingRevisionId = null;
        setupCommercialRevisionModalHeader(approval);
        updateRevisionModalControls(approval);
        addRevisionActivityRow();
    } else if (revisionType === 'comercial') {
        const revision = await fetchLatestRevisionForOrderProject(
            approval.orderProjectId,
            'comercial'
        );

        if (revision) {
            editingRevisionId = revision.id;
            setupCommercialRevisionModalHeader(approval);
            await loadRevisionActivities(revision.id);
        } else {
            setupCommercialRevisionModalHeader(approval);
            updateRevisionModalControls(approval);
            addRevisionActivityRow();
        }
    } else if (approval.status === 'Em revisão' && currentUser?.role === 'Projetista') {
        const revision = await fetchLatestRevisionForOrderProject(
            approval.orderProjectId,
            'tecnica'
        );

        if (revision) {
            editingRevisionId = revision.id;
            setupCommercialRevisionModalHeader(approval);
            await loadRevisionActivities(revision.id);
        } else {
            setupCommercialRevisionModalHeader(approval);
            updateRevisionModalControls(approval);
            addRevisionActivityRow();
        }
    } else {
        setupCommercialRevisionModalHeader(approval);
        updateRevisionModalControls(approval);
        addRevisionActivityRow();
    }

    toggleModal('commercial-revision-modal', true);
}

function closeCommercialRevisionsHistoryModal() {
    const content = document.getElementById('commercial-revisions-history-content');
    if (content) content.innerHTML = '';
    toggleModal('commercial-revisions-history-modal', false);
}

async function openCommercialRevisionsHistoryView(approvalId, prefetched = null, options = {}) {
    const forceRefresh = Boolean(options?.forceRefresh);
    const readOnly = Boolean(options?.readOnly);
    const approval = (prefetched?.approval && !forceRefresh)
        ? prefetched.approval
        : await ensureApprovalInCache(approvalId, forceRefresh);
    if (!approval) return;

    const historyProject = {
        id: approval.orderProjectId || approval.id,
        designerId: approval.designerId,
        projectStatus: approval.projectStatus
    };
    const canViewHistory = readOnly
        ? Boolean(currentUser?.id)
        : (typeof canShowOrderProjectRevisoesAction === 'function'
            ? canShowOrderProjectRevisoesAction(historyProject, approval)
            : canViewCommercialRevision(approval));
    if (!canViewHistory) return;

    let revisions = (prefetched?.revisions && !forceRefresh) ? prefetched.revisions : null;
    if (!revisions && typeof fetchCommercialRevisionsByApprovalIds === 'function') {
        const revisionsByApproval = await fetchCommercialRevisionsByApprovalIds([approvalId]);
        revisions = revisionsByApproval[approvalId] || [];
    }

    if (!readOnly) {
        revisions = filterRevisionsForCurrentUser(revisions);
    }

    if (!revisions?.length) {
        alertAppDialog(readOnly
            ? 'Nenhuma revisão encontrada para este projeto.'
            : (currentUser?.role === 'Projetista'
                ? 'Nenhuma revisão técnica encontrada para este projeto.'
                : 'Nenhuma revisão encontrada para este projeto.'));
        return;
    }

    const contextEl = document.getElementById('commercial-revisions-history-context');
    const contentEl = document.getElementById('commercial-revisions-history-content');
    if (contextEl) {
        contextEl.textContent = `Projeto: ${getCommercialApprovalProjectName(approval) || '—'} · ${revisions.length} revisão${revisions.length === 1 ? '' : 'ões'}`;
    }

    if (contentEl) {
        contentEl.innerHTML = renderCommercialRevisionsSection(revisions, approval, {
            showInHistoryModal: true,
            readOnly
        });
        if (typeof hydrateRevisionActivityAttachmentPreviews === 'function') {
            await hydrateRevisionActivityAttachmentPreviews(contentEl);
        }
    }

    toggleModal('commercial-revisions-history-modal', true);
}

async function openCommercialRevisionView(approvalId) {
    const approval = await ensureApprovalInCache(approvalId);
    if (!approval || !canViewCommercialRevision(approval)) return;

    if (approval.status === 'Em revisão' && canOpenRevisionModal(approval)) {
        return openCommercialRevisionModal(approvalId);
    }

    if (typeof fetchCommercialRevisionsByApprovalIds === 'function') {
        const revisionsByApproval = await fetchCommercialRevisionsByApprovalIds([approvalId]);
        const revisions = revisionsByApproval[approvalId] || [];
        if (revisions.length > 1) {
            return openCommercialRevisionsHistoryView(approvalId, { approval, revisions });
        }
    }

    const revision = await getLatestRevisionForApproval(approvalId);
    if (!revision) {
        alertAppDialog('Nenhuma revisão encontrada para esta aprovação.');
        return;
    }

    revisionModalViewOnly = true;
    currentRevisionApprovalId = approvalId;
    editingRevisionId = revision.id;
    revisionActivityRowCounter = 0;
    if (typeof resetRevisionActivityAttachments === 'function') {
        resetRevisionActivityAttachments();
    }

    document.getElementById('revision-activities-list').innerHTML = '';
    document.getElementById('revision-empty-msg').classList.add('hidden');
    setupCommercialRevisionModalHeader(approval);
    await loadRevisionActivities(revision.id);
    toggleModal('commercial-revision-modal', true);
}

async function openCommercialRevisionForRevision(approvalId, revisionId, viewOnly = true) {
    const approval = await ensureApprovalInCache(approvalId);
    if (!approval) return;
    if (!viewOnly && !canViewCommercialRevision(approval)) return;
    if (viewOnly && !canViewCommercialRevision(approval) && !currentUser?.id) return;

    currentRevisionType = 'tecnica';
    currentRevisionApprovalId = approvalId;
    editingRevisionId = revisionId;

    const designerId = getCommercialApprovalDesignerId(approval);
    const isProjetistaAuthorized = currentUser?.role === 'Projetista'
        && designerId
        && Number(designerId) === Number(currentUser.id);
    const isAdminAuthorized = currentUser?.role === 'Admin';
    const canConsultorEditExisting = canConsultorEditExistingTecnicaRevision(approval);

    if (!viewOnly && (isAdminAuthorized || isProjetistaAuthorized || canConsultorEditExisting)) {
        return openCommercialRevisionModal(approvalId, 'tecnica', { revisionId });
    }

    revisionModalViewOnly = viewOnly;
    currentRevisionApprovalId = approvalId;
    editingRevisionId = revisionId;
    revisionActivityRowCounter = 0;
    if (typeof resetRevisionActivityAttachments === 'function') {
        resetRevisionActivityAttachments();
    }

    document.getElementById('revision-activities-list').innerHTML = '';
    document.getElementById('revision-empty-msg').classList.add('hidden');
    setupCommercialRevisionModalHeader(approval);
    updateRevisionModalControls(approval);
    await loadRevisionActivities(revisionId);
    toggleModal('commercial-revision-modal', true);
}

window.openCommercialRevisionForRevision = openCommercialRevisionForRevision;

function closeCommercialRevisionModal() {
    setCommercialRevisionModalLoading(false);
    revisionModalViewOnly = false;
    editingRevisionId = null;
    currentRevisionApprovalId = null;
    resetCurrentRevisionMeta();
    if (typeof resetRevisionActivityAttachments === 'function') {
        resetRevisionActivityAttachments();
    }
    toggleModal('commercial-revision-modal', false);
}

async function persistCommercialRevision() {
    const approval = getCurrentApproval();
    if (!approval) return { ok: false };

    const activities = collectRevisionActivitiesFromDom().filter(a => a.description);
    if (activities.length === 0) {
        alertAppDialog('Adicione ao menos uma atividade.');
        return { ok: false };
    }

    const now = new Date().toISOString();
    let revisionId = editingRevisionId;
    const createdRevision = !revisionId;

    if (!revisionId) {
        const orderProjectId = approval.orderProjectId
            || (typeof resolveCommercialApprovalOrderProjectId === 'function'
                ? await resolveCommercialApprovalOrderProjectId(approval)
                : null);

        if (!orderProjectId) {
            alertAppDialog('Projeto da aprovação comercial não encontrado.');
            return { ok: false };
        }

        const { data: revision, error: revisionError } = await createRevisionRecord({
            orderProjectId,
            revisionType: mapLegacyRevisionTypeToDb(currentRevisionType)
        });

        if (revisionError || !revision) {
            alertAppDialog('Erro ao criar revisão: ' + (revisionError?.message || 'Erro desconhecido'));
            return { ok: false };
        }

        revisionId = revision.id;
        editingRevisionId = revisionId;

        if (currentRevisionType === 'tecnica') {
            if (typeof applyEmRevisaoStatusForCommercialApproval === 'function') {
                await applyEmRevisaoStatusForCommercialApproval(approval, { skipEmail: true });
            }
        }
    }

    const activityIdByRowId = {};

    for (const activity of activities) {
        const payload = {
            description: activity.description,
            completed: activity.completed,
            observation: activity.observation || null,
            completedAt: activity.completed ? activity.completedAt : null,
            sortOrder: activity.sortOrder,
            updatedAt: now
        };

        if (activity.id) {
            const { error } = await updateRevisionActivity(activity.id, payload);
            if (error) {
                alertAppDialog('Erro ao salvar atividade: ' + error.message);
                return { ok: false };
            }
            activityIdByRowId[activity.rowId] = activity.id;
        } else {
            const { data: inserted, error } = await insertRevisionActivity(revisionId, payload);
            if (error || !inserted?.id) {
                alertAppDialog('Erro ao salvar atividade: ' + (error?.message || 'Erro desconhecido'));
                return { ok: false };
            }

            if (typeof migrateRevisionActivityAttachmentDrafts === 'function') {
                migrateRevisionActivityAttachmentDrafts(activity.rowId, inserted.id);
            }

            activityIdByRowId[activity.rowId] = inserted.id;
            activityIdByRowId[String(inserted.id)] = inserted.id;
            activity.id = inserted.id;
        }
    }

    if (typeof persistRevisionActivityAttachments === 'function') {
        const attachmentsResult = await persistRevisionActivityAttachments(revisionId, activityIdByRowId);
        if (!attachmentsResult.ok) {
            alertAppDialog('Erro ao salvar imagens das atividades: ' + (attachmentsResult.error?.message || 'Erro desconhecido'));
            return { ok: false };
        }
    }

    await updateRevisionRecord(revisionId, {});

    return { ok: true, createdRevision, activities };
}

function refreshCommercialApprovalViews() {
    if (activeOrderId) {
        loadCommercialApprovals(activeOrderId);
    }
    if (typeof refreshApprovalsQueryIfVisible === 'function') {
        refreshApprovalsQueryIfVisible();
    }
    if (typeof loadPendenciasConsultorAguardandoAprovacao === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
        loadPendenciasConsultorAguardandoAprovacao();
    }
}

const COMMERCIAL_REVISION_MODAL_OVERLAY = createModalOverlayConfig('commercial-revision', {
    disableElementIds: [
        'btn-save-revision',
        'btn-send-back-approval',
        'btn-add-revision-activity',
        'btn-start-revision'
    ],
    closeButtonSelector: '#commercial-revision-modal button[onclick="closeCommercialRevisionModal()"]',
    disableFormSelector: '#commercial-revision-modal textarea, #commercial-revision-modal input'
});

function setCommercialRevisionModalLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(COMMERCIAL_REVISION_MODAL_OVERLAY, active, message, status);
}

async function startTechnicalRevision() {
    const approval = getCurrentApproval();
    if (!canProjetistaStartTechnicalRevision(approval) || !editingRevisionId) return;

    const confirmed = await confirmAppDialog(
        'Os campos Realizado e Observação serão liberados e o consultor será notificado por e-mail.',
        {
            title: 'Iniciar revisão técnica?',
            confirmLabel: 'Iniciar'
        }
    );
    if (!confirmed) return;

    setCommercialRevisionModalLoading(true, 'Iniciando revisão...');

    try {
        const now = new Date().toISOString();
        const { error } = await updateRevisionRecord(editingRevisionId, {
            revisionStartedAt: now
        });

        if (error) {
            setCommercialRevisionModalLoading(true, `Erro ao iniciar revisão: ${error.message}`, 'error');
            await new Promise(resolve => setTimeout(resolve, 2200));
            return;
        }

        const data = await fetchRevisionById(editingRevisionId);

        currentRevisionMeta = {
            revisionStartedAt: data?.revisionStartedAt || now,
            revisionCompletedAt: data?.revisionCompletedAt || null
        };

        setCommercialRevisionModalLoading(true, 'Enviando notificação por e-mail...');
        if (typeof notifyApprovalEmail === 'function') {
            await notifyApprovalEmail('revision_started', {
                ...approval,
                status: 'Em revisão'
            }, { activities: collectRevisionActivitiesFromDom() });
        }

        setCommercialRevisionModalLoading(true, 'Revisão iniciada!', 'success');
        await new Promise(resolve => setTimeout(resolve, 700));
        setCommercialRevisionModalLoading(false);
        updateRevisionModalControls(approval);
        refreshRevisionActivityCompletionFieldStates(approval);
    } catch (error) {
        setCommercialRevisionModalLoading(true, `Erro ao iniciar revisão: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setCommercialRevisionModalLoading(false);
    }
}

async function saveCommercialRevision() {
    setCommercialRevisionModalLoading(true, 'Salvando revisão...');

    try {
        const result = await persistCommercialRevision();
        if (!result.ok) return;

        const approval = getCurrentApproval();
        if (approval && result.createdRevision && typeof notifyApprovalEmail === 'function') {
            setCommercialRevisionModalLoading(true, 'Enviando notificação por e-mail...');
            if (currentRevisionType === 'tecnica' && typeof notifyOrderProjectStatusChangeForProjects === 'function') {
                const orderProjectId = approval.orderProjectId
                    || (typeof resolveCommercialApprovalOrderProjectId === 'function'
                        ? await resolveCommercialApprovalOrderProjectId(approval)
                        : null);
                if (orderProjectId) {
                    await notifyOrderProjectStatusChangeForProjects(
                        [orderProjectId],
                        typeof ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ !== 'undefined'
                            ? ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ
                            : 'Em Revisão Comercial Proj.',
                        {
                            orderId: approval.orderId,
                            designerId: approval.designerId,
                            activities: result.activities,
                            activitiesTitle: 'Atividades da revisão'
                        }
                    );
                }
            } else {
                await notifyApprovalEmail('revision_created', {
                    ...approval,
                    status: 'Em revisão'
                }, { activities: result.activities });
            }
        } else if (approval && currentRevisionType === 'tecnica' && canConsultorEditExistingTecnicaRevision(approval) && !result.createdRevision) {
            setCommercialRevisionModalLoading(true, 'Enviando notificação por e-mail...');
            await notifyApprovalEmail('revision_updated', {
                ...approval,
                status: 'Em revisão'
            }, { activities: result.activities });
        }

        setCommercialRevisionModalLoading(true, 'Atualizando telas...');
        refreshCommercialApprovalViews();
        if (result.createdRevision && typeof loadOrderProjects === 'function' && activeOrderId) {
            await loadOrderProjects(activeOrderId);
        }

        setCommercialRevisionModalLoading(true, 'Revisão salva com sucesso!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));

        closeCommercialRevisionModal();
    } catch (error) {
        setCommercialRevisionModalLoading(true, `Erro ao salvar revisão: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
    } finally {
        setCommercialRevisionModalLoading(false);
    }
}

async function completeTechnicalRevisionRecord(revisionId, now) {
    const { error } = await completeRevisionRecord(revisionId, now);
    if (error) {
        throw error;
    }
    return true;
}

async function sendRevisionBackToApproval() {
    const approval = getCurrentApproval();
    if (!approval || !canSendBackToApproval(approval)) return;

    if (!allRevisionActivitiesCompleted()) {
        alertAppDialog('Marque todas as atividades como realizadas antes de enviar para aprovação.');
        return;
    }

    const confirmed = await confirmAppDialog(
        'A solicitação será reenviada para análise do consultor do pedido.',
        {
            title: 'Reenviar para aprovação comercial?',
            confirmLabel: 'Reenviar'
        }
    );
    if (!confirmed) return;

    setCommercialRevisionModalLoading(true, 'Salvando revisão...');

    try {
        const result = await persistCommercialRevision();
        if (!result.ok) return;

        setCommercialRevisionModalLoading(true, 'Concluindo revisão...');
        const now = new Date().toISOString();
        if (editingRevisionId) {
            const completed = await completeTechnicalRevisionRecord(editingRevisionId, now);
            if (!completed) return;
            currentRevisionMeta.revisionCompletedAt = now;
        }

        setCommercialRevisionModalLoading(true, 'Atualizando status do projeto...');

        if (typeof applyEmRevisaoComercialStatusForCommercialApproval === 'function') {
            await applyEmRevisaoComercialStatusForCommercialApproval(approval, { skipEmail: true });
        } else if (typeof applyAguardandoAprovacaoStatusForCommercialApproval === 'function') {
            await applyAguardandoAprovacaoStatusForCommercialApproval(approval);
        }

        approval.status = ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS;
        const cacheIdx = commercialApprovalsCache.findIndex(a => Number(a.id) === Number(approval.id));
        if (cacheIdx !== -1) {
            commercialApprovalsCache[cacheIdx] = {
                ...commercialApprovalsCache[cacheIdx],
                status: ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS
            };
        }

        setCommercialRevisionModalLoading(true, 'Enviando notificação por e-mail...');
        if (typeof notifyApprovalEmail === 'function') {
            await notifyApprovalEmail('sent_back_to_approval', {
                ...approval,
                status: ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS
            }, { activities: result.activities });
        }

        setCommercialRevisionModalLoading(true, 'Atualizando telas...');
        refreshCommercialApprovalViews();
        if (typeof loadOrderProjects === 'function' && activeOrderId) {
            await loadOrderProjects(activeOrderId);
        }

        const historyModal = document.getElementById('commercial-revisions-history-modal');
        if (historyModal && !historyModal.classList.contains('hidden')) {
            await openCommercialRevisionsHistoryView(approval.id, null, { forceRefresh: true });
        }

        setCommercialRevisionModalLoading(true, 'Reenviado para aprovação com sucesso!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));

        closeCommercialRevisionModal();
    } catch (error) {
        setCommercialRevisionModalLoading(true, `Erro ao reenviar para aprovação: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
    } finally {
        setCommercialRevisionModalLoading(false);
    }
}

window.openCommercialRevisionModal = openCommercialRevisionModal;
window.closeCommercialRevisionModal = closeCommercialRevisionModal;
window.openCommercialRevisionView = openCommercialRevisionView;
window.openCommercialRevisionsHistoryView = openCommercialRevisionsHistoryView;
window.closeCommercialRevisionsHistoryModal = closeCommercialRevisionsHistoryModal;

function getLatestTechnicalRevisionByApproval(revisions = []) {
    const technical = (revisions || []).filter(revision => revision.type === 'tecnica');
    return sortCommercialRevisionsDescending(technical)[0] || null;
}

function getTechnicalRevisionProgressLabel(revision) {
    if (!revision) return '—';
    if (revision.revisionCompletedAt) return 'Concluída';
    if (revision.revisionStartedAt) return 'Em andamento';
    return 'Aguardando início';
}

function getTechnicalRevisionProgressBadgeClass(revision) {
    const label = getTechnicalRevisionProgressLabel(revision);
    if (label === 'Em andamento') return 'bg-sky-100 text-sky-800';
    if (label === 'Aguardando início') return 'bg-amber-100 text-amber-800';
    if (label === 'Concluída') return 'bg-emerald-100 text-emerald-800';
    return 'bg-slate-100 text-slate-600';
}

async function fetchLatestTechnicalRevisionsByApprovalIds(approvalIds) {
    if (!approvalIds.length || typeof fetchCommercialRevisionsByApprovalIds !== 'function') {
        return {};
    }

    const revisionsByApproval = await fetchCommercialRevisionsByApprovalIds(approvalIds);
    const result = {};

    Object.entries(revisionsByApproval).forEach(([approvalId, revisions]) => {
        const latest = getLatestTechnicalRevisionByApproval(revisions);
        if (latest) {
            result[approvalId] = latest;
        }
    });

    return result;
}

window.fetchLatestTechnicalRevisionsByApprovalIds = fetchLatestTechnicalRevisionsByApprovalIds;
window.getTechnicalRevisionProgressLabel = getTechnicalRevisionProgressLabel;
window.getTechnicalRevisionProgressBadgeClass = getTechnicalRevisionProgressBadgeClass;

function filterRevisionsForCurrentUser(revisions) {
    if (!revisions || !Array.isArray(revisions)) return [];
    if (currentUser?.role === 'Projetista') {
        return revisions.filter(r => r.type !== 'comercial');
    }
    return revisions;
}

function sortCommercialRevisionsChronologically(revisions) {
    return [...revisions].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.id || 0) - (b.id || 0);
    });
}

function sortCommercialRevisionsDescending(revisions) {
    return [...revisions].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
    });
}

function sortRevisionsWithCommercialFirst(revisions) {
    return sortCommercialRevisionsDescending(revisions);
}

function getCurrentCommercialRevision(revisions) {
    const sorted = sortCommercialRevisionsDescending(revisions);
    return sorted[0] || null;
}

function isCommercialRevisionAwaitingResponse(approval) {
    return approval?.status === 'Em revisão';
}

function isProjetistaRevisionResponder(approval) {
    return currentUser?.role === 'Projetista'
        && typeof canEditRevisionActivityCompletionFields === 'function'
        && canEditRevisionActivityCompletionFields(approval);
}

function getRevisionActionButtonLabel(approval, showInHistoryModal) {
    if (isProjetistaRevisionResponder(approval)) {
        return 'Editar';
    }
    return showInHistoryModal ? 'Ver detalhes' : 'Ver Revisão';
}

function shouldShowRevisionActionButton(approval, isCurrentRevision) {
    if (!approval || !isCurrentRevision) return false;
    if (!canViewCommercialRevision(approval)) return false;
    if (!isCommercialRevisionAwaitingResponse(approval)) return false;
    return canOpenRevisionModal(approval);
}

function renderCommercialRevisionsSection(revisions, approval, options = {}) {
    if (!options.readOnly) {
        revisions = filterRevisionsForCurrentUser(revisions);
    }
    if (!revisions || revisions.length === 0) return '';

    const seenRevisionIds = new Set();
    revisions = (revisions || []).filter(r => {
        if (!r.id) return true;
        if (seenRevisionIds.has(r.id)) return false;
        seenRevisionIds.add(r.id);
        return true;
    });

    const chronologicalCommercialTechnical = sortCommercialRevisionsChronologically(
        revisions.filter(r => r.type === 'tecnica')
    );
    const chronologicalTechnicalReviewer = sortCommercialRevisionsChronologically(
        revisions.filter(r => r.type === 'technical_reviewer')
    );
    const techNumberMap = new Map();
    chronologicalCommercialTechnical.forEach((r, idx) => {
        techNumberMap.set(r.id, idx + 1);
    });
    const reviewerNumberMap = new Map();
    chronologicalTechnicalReviewer.forEach((r, idx) => {
        reviewerNumberMap.set(r.id, idx + 1);
    });

    const showInHistoryModal = Boolean(options.showInHistoryModal);
    const sortedRevisions = sortCommercialRevisionsDescending(revisions);
    const latestTechnicalRevision = sortCommercialRevisionsDescending(
        revisions.filter(revision => revision.type === 'tecnica')
    )[0] || null;
    const latestTechnicalReviewerRevision = sortCommercialRevisionsDescending(
        revisions.filter(revision => revision.type === 'technical_reviewer')
    )[0] || null;

    const designerId = getCommercialApprovalDesignerId(approval);
    const isAssignedDesigner = currentUser?.role === 'Projetista'
        && designerId
        && Number(designerId) === Number(currentUser?.id);
    const canDesignerOrAdminEdit = currentUser?.role === 'Admin' || isAssignedDesigner;
    const isEmRevisao = isEmRevisaoTecnicaApproval(approval);

    const blocks = sortedRevisions.map((revision) => {
        const isComercial = revision.type === 'comercial';
        const isTechnicalReviewer = revision.type === 'technical_reviewer';
        const isCurrentTechnical = !isComercial && !isTechnicalReviewer
            && latestTechnicalRevision
            && Number(revision.id) === Number(latestTechnicalRevision.id);
        const isCurrentTechnicalReviewer = isTechnicalReviewer
            && latestTechnicalReviewerRevision
            && Number(revision.id) === Number(latestTechnicalReviewerRevision.id);
        
        let titleText = '';
        if (isComercial) {
            titleText = 'Revisão Comercial';
        } else if (isTechnicalReviewer) {
            const num = reviewerNumberMap.get(revision.id) || 1;
            titleText = `Revisão Revisor ${num}`;
        } else {
            const num = techNumberMap.get(revision.id) || 1;
            titleText = `Revisão Técnica ${num}`;
        }

        const typeBadgeClass = isComercial
            ? 'bg-purple-100 text-purple-800'
            : (isTechnicalReviewer ? 'bg-teal-100 text-teal-800' : 'bg-sky-100 text-sky-800');
        const typeBadgeLabel = isComercial
            ? 'Comercial'
            : (isTechnicalReviewer ? 'Revisor' : 'Técnica');
        const typeBadge = `<span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${typeBadgeClass}">${typeBadgeLabel}</span>`;

        const activitiesHtml = revision.activities.length
            ? revision.activities.map(activity => `
                <tr class="border-t border-slate-100">
                    <td class="py-2 pr-2 align-top">
                        ${renderRevisionResizableText(activity.description)}
                        ${typeof renderRevisionActivityAttachmentsReadonlyHtml === 'function'
                            ? `<div class="mt-2">${renderRevisionActivityAttachmentsReadonlyHtml(activity.attachment)}</div>`
                            : ''}
                    </td>
                    <td class="py-2 px-2 text-center text-xs align-top">
                        ${activity.completed
                            ? '<span class="text-emerald-700 font-semibold">Sim</span>'
                            : '<span class="text-slate-400">Não</span>'}
                    </td>
                    <td class="py-2 px-2 align-top">${renderRevisionResizableText(activity.observation, 'muted')}</td>
                    <td class="py-2 pl-2 text-xs text-slate-500 whitespace-nowrap align-top">${activity.completedAt ? formatDate(activity.completedAt) : '—'}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="4" class="py-2 text-xs text-slate-400">Nenhuma atividade registrada.</td></tr>`;

        const canConsultorEditRevision = isCurrentTechnical
            && isEmRevisao
            && canEditRevisionActivitiesConsultor(approval);
        const canEditThisRevision = isCurrentTechnical && isEmRevisao && (
            canDesignerOrAdminEdit || canConsultorEditRevision
        );

        let editButtonHtml = '';
        const orderProjectId = approval.orderProjectId || approval.id;

        if (isCurrentTechnicalReviewer && !revision.revisionCompletedAt) {
            const projectForAccess = {
                id: orderProjectId,
                designerId: approval.designerId,
                projectStatus: approval.projectStatus
            };
            const canEditTechnicalReviewer = isAdmin()
                || (typeof canDesignerActOnTechnicalReviewerProject === 'function'
                    && canDesignerActOnTechnicalReviewerProject(projectForAccess))
                || (typeof canReviewerActOnProject === 'function'
                    && canReviewerActOnProject(projectForAccess));
            if (canEditTechnicalReviewer) {
                editButtonHtml = `<button type="button" onclick="openTechnicalReviewerRevisionForRevision(${orderProjectId}, ${revision.id}, false)"
                    class="fm-revision-block__action text-xs bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap cursor-pointer">Editar</button>`;
            }
        } else if (canEditThisRevision) {
            editButtonHtml = `<button type="button" onclick="openCommercialRevisionForRevision(${approval.id}, ${revision.id}, false)"
                class="fm-revision-block__action text-xs bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap cursor-pointer">Editar</button>`;
        }

        const activityCount = revision.activities.length;
        const completedCount = revision.activities.filter(a => a.completed).length;
        const workPeriodMeta = !isComercial && (revision.revisionStartedAt || revision.revisionCompletedAt)
            ? `<span class="fm-revision-block__meta-sep">·</span><span>${
                revision.revisionCompletedAt
                    ? `Trabalho: ${formatDate(revision.revisionStartedAt)} → ${formatDate(revision.revisionCompletedAt)}`
                    : revision.revisionStartedAt
                        ? `Em andamento desde ${formatDate(revision.revisionStartedAt)}`
                        : 'Aguardando início'
            }</span>`
            : '';

        return `
            <article class="fm-revision-block">
                <header class="fm-revision-block__header flex justify-between items-center">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2">
                            <p class="fm-revision-block__title font-semibold text-slate-900">${titleText}</p>
                            ${typeBadge}
                        </div>
                        <p class="fm-revision-block__meta mt-0.5">
                            <span>${revision.createdAt ? formatDate(revision.createdAt) : '—'}</span>
                            <span class="fm-revision-block__meta-sep">·</span>
                            <span>${completedCount}/${activityCount} atividades concluídas</span>
                            ${workPeriodMeta}
                        </p>
                    </div>
                    ${editButtonHtml}
                </header>
                <div class="fm-revision-block__table-wrap overflow-x-auto">
                    <table class="revision-history-table min-w-[480px] w-full text-xs">
                        <colgroup>
                            <col style="width:36%">
                            <col style="width:72px">
                            <col style="width:36%">
                            <col style="width:112px">
                        </colgroup>
                        <thead>
                            <tr>
                                <th class="text-left p-3 font-semibold">Atividade</th>
                                <th class="text-center p-3 font-semibold align-top">Realizado</th>
                                <th class="text-left p-3 font-semibold align-top">Observação</th>
                                <th class="text-left p-3 font-semibold align-top">Data realização</th>
                            </tr>
                        </thead>
                        <tbody>${activitiesHtml}</tbody>
                    </table>
                </div>
            </article>
        `;
    }).join('');

    if (showInHistoryModal) {
        return `<div class="fm-revision-history-list space-y-4">${blocks}</div>`;
    }

    return `
        <div class="fm-revision-embedded-section space-y-3 pt-3 border-t border-dashed border-slate-200">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Histórico de revisões</p>
            <div class="fm-revision-history-list space-y-3">${blocks}</div>
        </div>
    `;
}

function bindCommercialRevisionEvents() {
    document.getElementById('btn-add-revision-activity').addEventListener('click', async function () {
        const approval = getCurrentApproval();
        const canAddActivity = canEditRevisionActivitiesConsultor(approval)
            && (currentRevisionType === 'comercial'
                || isCreatingNewTecnicaRevision(approval)
                || canConsultorEditExistingTecnicaRevision(approval));
        if (!canAddActivity) return;
        addRevisionActivityRow();
    });

    document.getElementById('btn-save-revision').addEventListener('click', saveCommercialRevision);
    document.getElementById('btn-send-back-approval').addEventListener('click', sendRevisionBackToApproval);
    document.getElementById('btn-start-revision')?.addEventListener('click', startTechnicalRevision);

    if (typeof bindRevisionActivityAttachmentEvents === 'function') {
        bindRevisionActivityAttachmentEvents();
    }
}
