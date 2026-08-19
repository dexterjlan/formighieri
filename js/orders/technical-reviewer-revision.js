let currentTechnicalReviewerProject = null;
let editingTechnicalReviewerRevisionId = null;
let technicalReviewerRevisionModalViewOnly = false;
let technicalReviewerRevisionActivityRowCounter = 0;
let currentTechnicalReviewerRevisionMeta = {
    revisionStartedAt: null,
    revisionCompletedAt: null
};

function resetTechnicalReviewerRevisionMeta() {
    currentTechnicalReviewerRevisionMeta = {
        revisionStartedAt: null,
        revisionCompletedAt: null
    };
}

function isTechnicalReviewerRevisionStarted() {
    return Boolean(currentTechnicalReviewerRevisionMeta.revisionStartedAt);
}

function isTechnicalReviewerRevisionInProgress() {
    return isTechnicalReviewerRevisionStarted() && !currentTechnicalReviewerRevisionMeta.revisionCompletedAt;
}

function isTechnicalReviewerRevisionCompleted() {
    return Boolean(currentTechnicalReviewerRevisionMeta.revisionCompletedAt);
}

async function loadTechnicalReviewerRevisionMeta(revisionId) {
    if (!revisionId) {
        resetTechnicalReviewerRevisionMeta();
        return;
    }

    const data = await fetchRevisionById(revisionId);
    if (!data) {
        resetTechnicalReviewerRevisionMeta();
        return;
    }

    currentTechnicalReviewerRevisionMeta = {
        revisionStartedAt: data.revisionStartedAt || null,
        revisionCompletedAt: data.revisionCompletedAt || null
    };
}

function getCurrentTechnicalReviewerProject() {
    return currentTechnicalReviewerProject;
}

function canViewTechnicalReviewerRevision(project) {
    if (!project) return false;
    if (isAdmin()) return true;
    if (canReviewerActOnProject(project)) return true;
    if (canDesignerActOnTechnicalReviewerProject(project)) return true;
    return isGestorProjetos();
}

function canReviewerEditTechnicalReviewerRevisionDescriptions() {
    if (technicalReviewerRevisionModalViewOnly) return false;
    if (isTechnicalReviewerRevisionCompleted()) return false;
    const project = getCurrentTechnicalReviewerProject();
    return project && canReviewerActOnProject(project);
}

function canDesignerEditTechnicalReviewerRevisionCompletion() {
    if (technicalReviewerRevisionModalViewOnly) return false;
    if (isTechnicalReviewerRevisionCompleted()) return false;
    const project = getCurrentTechnicalReviewerProject();
    if (!project || !canDesignerActOnTechnicalReviewerProject(project)) return false;
    if (isAdmin()) return true;
    return isTechnicalReviewerRevisionStarted();
}

function canDesignerStartTechnicalReviewerRevision(project) {
    if (technicalReviewerRevisionModalViewOnly) return false;
    if (!project || !canDesignerActOnTechnicalReviewerProject(project)) return false;
    if (!editingTechnicalReviewerRevisionId) return false;
    if (isTechnicalReviewerRevisionStarted()) return false;
    if (isAdmin()) return false;
    return true;
}

function isDesignerTechnicalReviewerRevisionResponder(project) {
    if (isAdmin()) return false;
    return canDesignerActOnTechnicalReviewerProject(project);
}

function refreshTechnicalReviewerRevisionCompletionFieldStates() {
    const project = getCurrentTechnicalReviewerProject();
    const canEdit = canDesignerEditTechnicalReviewerRevisionCompletion();
    document.querySelectorAll('#tr-revision-activities-list tr').forEach(tr => {
        const checkbox = tr.querySelector('.tr-revision-activity-completed');
        const observation = tr.querySelector('.tr-revision-activity-observation');
        if (checkbox) checkbox.disabled = !canEdit;
        if (observation) observation.disabled = !canEdit;
    });
    updateTechnicalReviewerRevisionModalControls(project);
}

function updateTechnicalReviewerRevisionProgressBanner(project) {
    const banner = document.getElementById('tr-revision-progress-info');
    if (!banner) return;

    const designerMode = project && canDesignerActOnTechnicalReviewerProject(project);
    const reviewerMode = project && canReviewerActOnProject(project);

    if (technicalReviewerRevisionModalViewOnly || (!designerMode && !reviewerMode)) {
        banner.classList.add('hidden');
        banner.textContent = '';
        return;
    }

    if (!editingTechnicalReviewerRevisionId) {
        banner.classList.add('hidden');
        banner.textContent = '';
        return;
    }

    if (reviewerMode && !designerMode) {
        if (isTechnicalReviewerRevisionStarted()) {
            const startedLabel = formatDate(currentTechnicalReviewerRevisionMeta.revisionStartedAt);
            const completedLabel = currentTechnicalReviewerRevisionMeta.revisionCompletedAt
                ? formatDate(currentTechnicalReviewerRevisionMeta.revisionCompletedAt)
                : null;
            banner.className = completedLabel
                ? 'text-xs rounded-lg border px-3 py-2 border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'text-xs rounded-lg border px-3 py-2 border-sky-200 bg-sky-50 text-sky-800';
            banner.textContent = completedLabel
                ? `Revisão do projetista: ${startedLabel} → ${completedLabel}`
                : `Revisão do projetista em andamento desde ${startedLabel}`;
            banner.classList.remove('hidden');
        } else {
            banner.className = 'text-xs rounded-lg border px-3 py-2 border-amber-200 bg-amber-50 text-amber-800';
            banner.textContent = 'Aguardando o projetista iniciar a revisão.';
            banner.classList.remove('hidden');
        }
        return;
    }

    if (!isTechnicalReviewerRevisionStarted()) {
        banner.className = 'text-xs rounded-lg border px-3 py-2 border-amber-200 bg-amber-50 text-amber-800';
        banner.textContent = 'Clique em Iniciar Revisão para liberar os campos Realizado e Observação.';
        banner.classList.remove('hidden');
        return;
    }

    if (isTechnicalReviewerRevisionInProgress()) {
        banner.className = 'text-xs rounded-lg border px-3 py-2 border-sky-200 bg-sky-50 text-sky-800';
        banner.textContent = `Revisão em andamento desde ${formatDate(currentTechnicalReviewerRevisionMeta.revisionStartedAt)}.`;
        banner.classList.remove('hidden');
        return;
    }

    banner.className = 'text-xs rounded-lg border px-3 py-2 border-emerald-200 bg-emerald-50 text-emerald-800';
    banner.textContent = `Revisão concluída em ${formatDate(currentTechnicalReviewerRevisionMeta.revisionCompletedAt)}.`;
    banner.classList.remove('hidden');
}

function collectTechnicalReviewerRevisionActivitiesFromDom() {
    const rows = document.querySelectorAll('#tr-revision-activities-list tr');
    return Array.from(rows).map((tr, index) => {
        const rowId = tr.dataset.rowId;
        const isPersisted = rowId && !String(rowId).startsWith('temp-');
        const completed = tr.querySelector('.tr-revision-activity-completed')?.checked || false;

        return {
            rowId,
            id: isPersisted ? Number(rowId) : null,
            description: tr.querySelector('.tr-revision-activity-description')?.value.trim() || '',
            completed,
            observation: tr.querySelector('.tr-revision-activity-observation')?.value.trim() || '',
            completedAt: completed ? (tr.dataset.completedAt || new Date().toISOString()) : null,
            sortOrder: index
        };
    });
}

function allTechnicalReviewerRevisionActivitiesCompleted() {
    const activities = collectTechnicalReviewerRevisionActivitiesFromDom().filter(activity => activity.description);
    if (!activities.length) return false;
    return activities.every(activity => activity.completed);
}

function renderTechnicalReviewerRevisionActivityRow(activity = {}) {
    const project = getCurrentTechnicalReviewerProject();
    const reviewerCanEdit = canReviewerEditTechnicalReviewerRevisionDescriptions();
    const designerCanEdit = canDesignerEditTechnicalReviewerRevisionCompletion();
    const rowId = activity.id || activity.tempId;

    const tr = document.createElement('tr');
    tr.dataset.rowId = rowId;
    if (activity.completedAt) {
        tr.dataset.completedAt = activity.completedAt;
    }

    const projectForAttachments = project;

    tr.innerHTML = `
        <td class="p-3 align-top">
            <textarea rows="2" class="tr-revision-activity-description revision-resizable-input px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600 disabled:bg-slate-50 w-full"
                placeholder="Descreva a atividade..."
                ${reviewerCanEdit ? '' : 'disabled'}>${escapeHtml(activity.description || '')}</textarea>
            ${typeof renderRevisionActivityAttachmentsHtml === 'function'
                ? renderRevisionActivityAttachmentsHtml(rowId, projectForAttachments, activity, 'technicalReviewer')
                : ''}
        </td>
        <td class="p-3 align-top text-center">
            <input type="checkbox" class="tr-revision-activity-completed h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                ${activity.completed ? 'checked' : ''}
                ${designerCanEdit ? '' : 'disabled'}>
        </td>
        <td class="p-3 align-top">
            <textarea rows="2" class="tr-revision-activity-observation revision-resizable-input px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600 disabled:bg-slate-50 w-full"
                placeholder="Observação do projetista..."
                ${designerCanEdit ? '' : 'disabled'}>${escapeHtml(activity.observation || '')}</textarea>
        </td>
        <td class="p-3 align-top">
            <p class="tr-revision-activity-completed-at px-2 py-1.5 text-xs border border-slate-100 rounded-lg bg-slate-50 text-slate-600 whitespace-nowrap">
                ${activity.completedAt ? formatDate(activity.completedAt) : '—'}
            </p>
        </td>
    `;

    const checkbox = tr.querySelector('.tr-revision-activity-completed');
    const completedAtEl = tr.querySelector('.tr-revision-activity-completed-at');
    const descriptionInput = tr.querySelector('.tr-revision-activity-description');
    checkbox?.addEventListener('change', function () {
        if (this.checked) {
            const now = new Date().toISOString();
            tr.dataset.completedAt = now;
            completedAtEl.textContent = formatDate(now);
        } else {
            delete tr.dataset.completedAt;
            completedAtEl.textContent = '—';
        }
        updateTechnicalReviewerRevisionModalControls(project);
    });
    descriptionInput?.addEventListener('input', () => {
        updateTechnicalReviewerRevisionModalControls(getCurrentTechnicalReviewerProject());
    });

    if (typeof hydrateRevisionActivityAttachmentPreviews === 'function') {
        hydrateRevisionActivityAttachmentPreviews(tr);
    }

    return tr;
}

function addTechnicalReviewerRevisionActivityRow(activity = {}) {
    if (!activity.tempId && !activity.id) {
        technicalReviewerRevisionActivityRowCounter += 1;
        activity.tempId = `temp-${technicalReviewerRevisionActivityRowCounter}`;
    }

    document.getElementById('tr-revision-activities-list')
        ?.appendChild(renderTechnicalReviewerRevisionActivityRow(activity));
    document.getElementById('tr-revision-empty-msg')?.classList.add('hidden');
    updateTechnicalReviewerRevisionModalControls(getCurrentTechnicalReviewerProject());
}

async function loadTechnicalReviewerRevisionActivities(revisionId) {
    const list = document.getElementById('tr-revision-activities-list');
    if (!list) return;

    await loadTechnicalReviewerRevisionMeta(revisionId);

    list.innerHTML = '';
    const activities = await fetchRevisionActivities(revisionId);

    if (!activities.length) {
        document.getElementById('tr-revision-empty-msg')?.classList.remove('hidden');
        updateTechnicalReviewerRevisionModalControls(getCurrentTechnicalReviewerProject());
        return;
    }

    document.getElementById('tr-revision-empty-msg')?.classList.add('hidden');
    activities.forEach(activity => addTechnicalReviewerRevisionActivityRow(activity));
    if (typeof loadRevisionActivityAttachmentsForActivities === 'function') {
        await loadRevisionActivityAttachmentsForActivities(activities);
    }
    refreshTechnicalReviewerRevisionCompletionFieldStates();
}

function reviewerHasTechnicalRevisionActivitiesReady() {
    return collectTechnicalReviewerRevisionActivitiesFromDom()
        .some(activity => activity.description);
}

function updateTechnicalReviewerRevisionModalControls(project) {
    const addBtn = document.getElementById('btn-add-tr-revision-activity');
    const saveBtn = document.getElementById('btn-tr-save-revision');
    const sendDesignerBtn = document.getElementById('btn-tr-send-to-designer');
    const returnReviewerBtn = document.getElementById('btn-tr-return-to-reviewer');
    const startBtn = document.getElementById('btn-tr-start-revision');

    [addBtn, saveBtn, sendDesignerBtn, returnReviewerBtn, startBtn].forEach(btn => btn?.classList.add('hidden'));

    if (technicalReviewerRevisionModalViewOnly || !project) {
        updateTechnicalReviewerRevisionProgressBanner(project);
        return;
    }

    const reviewerMode = canReviewerActOnProject(project);
    const designerMode = canDesignerActOnTechnicalReviewerProject(project);

    if (reviewerMode) {
        if (!isTechnicalReviewerRevisionCompleted()) {
            addBtn?.classList.remove('hidden');
            saveBtn?.classList.remove('hidden');

            if (reviewerHasTechnicalRevisionActivitiesReady()) {
                sendDesignerBtn?.classList.remove('hidden');
            }
        }
        updateTechnicalReviewerRevisionProgressBanner(project);
        return;
    }

    if (designerMode && !isTechnicalReviewerRevisionCompleted()) {
        const revisionStarted = isTechnicalReviewerRevisionStarted();
        const canStart = canDesignerStartTechnicalReviewerRevision(project);
        const isDesignerResponder = isDesignerTechnicalReviewerRevisionResponder(project);
        const allComplete = allTechnicalReviewerRevisionActivitiesCompleted();

        startBtn?.classList.toggle('hidden', !canStart);
        saveBtn?.classList.toggle('hidden', isDesignerResponder && !revisionStarted);
        returnReviewerBtn?.classList.remove('hidden');

        if (returnReviewerBtn) {
            returnReviewerBtn.disabled = (isDesignerResponder && !revisionStarted) || !allComplete;
            returnReviewerBtn.classList.toggle('opacity-50', (isDesignerResponder && !revisionStarted) || !allComplete);
            returnReviewerBtn.classList.toggle('cursor-not-allowed', (isDesignerResponder && !revisionStarted) || !allComplete);
        }

        updateTechnicalReviewerRevisionProgressBanner(project);
        return;
    }

    if (designerMode) {
        updateTechnicalReviewerRevisionProgressBanner(project);
        return;
    }

    updateTechnicalReviewerRevisionProgressBanner(project);
}

function setupTechnicalReviewerRevisionModalHeader(project) {
    const orderCode = project?.order?.orderCode || '—';
    const clientName = getOrderClientName(project?.order) || '—';
    const projectLabel = project?.projectCode
        ? `${project.projectCode} — ${project.name || ''}`
        : (project?.name || '—');

    const info = document.getElementById('tr-revision-project-info');
    if (info) {
        info.textContent = `${orderCode} · ${clientName} · ${projectLabel}`;
    }

    const badge = document.getElementById('tr-revision-status-badge');
    if (badge) {
        const statusName = getOrderProjectStatusNameFromProject(project);
        badge.textContent = statusName || '—';
        badge.className = `text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${getOrderProjectStatusBadgeClass(statusName)}`;
    }
}

async function fetchOrderProjectForTechnicalReviewerRevision(orderProjectId) {
    const normalizedId = Number(orderProjectId);
    if (!normalizedId) return null;

    const select = typeof getPendenciasProjectSelect === 'function'
        ? getPendenciasProjectSelect()
        : 'id, orderId, projectCode, name, designerId, statusId, deliveryDate';

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select(select)
        .eq('id', normalizedId)
        .maybeSingle();

    if (error) {
        console.error('fetchOrderProjectForTechnicalReviewerRevision:', error);
        return null;
    }

    if (!data) return null;

    const [enriched] = await enrichPendenciasProjectsWithStatus([data]);
    return enriched || data;
}

async function openTechnicalReviewerRevisionModal(orderProjectId, options = {}) {
    const { viewOnly = false, revisionId = null } = options;
    technicalReviewerRevisionModalViewOnly = viewOnly;
    editingTechnicalReviewerRevisionId = null;
    resetTechnicalReviewerRevisionMeta();

    const project = await fetchOrderProjectForTechnicalReviewerRevision(orderProjectId);
    if (!project) {
        alertAppDialog('Projeto não encontrado.');
        return;
    }

    if (!canViewTechnicalReviewerRevision(project)) {
        alertAppDialog('Sem permissão para visualizar esta revisão.');
        return;
    }

    currentTechnicalReviewerProject = project;

    if (typeof resetRevisionActivityAttachments === 'function') {
        resetRevisionActivityAttachments();
    }

    document.getElementById('tr-revision-activities-list').innerHTML = '';
    document.getElementById('tr-revision-empty-msg')?.classList.add('hidden');
    setupTechnicalReviewerRevisionModalHeader(project);

    let revisionToLoad = null;
    if (revisionId) {
        revisionToLoad = await fetchRevisionById(revisionId);
        if (!revisionToLoad || Number(revisionToLoad.orderProjectId) !== Number(project.id)) {
            alertAppDialog('Revisão não encontrada para este projeto.');
            return;
        }
    } else {
        revisionToLoad = await fetchOpenTechnicalReviewerRevision(project.id);
    }

    if (revisionToLoad?.id) {
        editingTechnicalReviewerRevisionId = revisionToLoad.id;
        await loadTechnicalReviewerRevisionActivities(revisionToLoad.id);
        if (isTechnicalReviewerRevisionCompleted()) {
            technicalReviewerRevisionModalViewOnly = true;
            if (typeof refreshAllRevisionActivityAttachments === 'function') {
                refreshAllRevisionActivityAttachments();
            }
        }
    }

    const hasActivityRows = document.getElementById('tr-revision-activities-list')?.children.length > 0;
    if (!hasActivityRows && !technicalReviewerRevisionModalViewOnly && canReviewerActOnProject(project)) {
        addTechnicalReviewerRevisionActivityRow();
    }

    updateTechnicalReviewerRevisionModalControls(project);
    toggleModal('technical-reviewer-revision-modal', true);
}

async function openTechnicalReviewerRevisionForRevision(orderProjectId, revisionId, viewOnly = true) {
    const revision = revisionId ? await fetchRevisionById(revisionId) : null;
    const forceViewOnly = viewOnly || Boolean(revision?.revisionCompletedAt);
    await openTechnicalReviewerRevisionModal(orderProjectId, {
        viewOnly: forceViewOnly,
        revisionId
    });
}

function closeTechnicalReviewerRevisionModal() {
    setTechnicalReviewerRevisionModalLoading(false);
    technicalReviewerRevisionModalViewOnly = false;
    editingTechnicalReviewerRevisionId = null;
    resetTechnicalReviewerRevisionMeta();
    currentTechnicalReviewerProject = null;
    if (typeof resetRevisionActivityAttachments === 'function') {
        resetRevisionActivityAttachments();
    }
    toggleModal('technical-reviewer-revision-modal', false);
}

const TECHNICAL_REVIEWER_REVISION_MODAL_OVERLAY = createModalOverlayConfig('technical-reviewer-revision', {
    disableElementIds: [
        'btn-tr-save-revision',
        'btn-tr-send-to-designer',
        'btn-tr-return-to-reviewer',
        'btn-add-tr-revision-activity',
        'btn-tr-start-revision'
    ],
    closeButtonSelector: '#technical-reviewer-revision-modal button[onclick="closeTechnicalReviewerRevisionModal()"]',
    disableFormSelector: '#technical-reviewer-revision-modal textarea, #technical-reviewer-revision-modal input'
});

function setTechnicalReviewerRevisionModalLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(TECHNICAL_REVIEWER_REVISION_MODAL_OVERLAY, active, message, status);
}

function isTechnicalReviewerRevisionModalVisible() {
    const modal = document.getElementById('technical-reviewer-revision-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

function isPendenciasViewVisibleForTechnicalReviewer() {
    const view = document.getElementById('pendencias-view');
    return Boolean(view && !view.classList.contains('hidden'));
}

function isOrderProjectsPanelVisibleForTechnicalReviewer() {
    const content = document.getElementById('order-content');
    return Boolean(content && !content.classList.contains('hidden'));
}

function setTechnicalReviewerActionLoading(active, message = 'Processando...', status = 'loading') {
    if (isTechnicalReviewerRevisionModalVisible()) {
        setTechnicalReviewerRevisionModalLoading(active, message, status);
        return;
    }

    if (isPendenciasViewVisibleForTechnicalReviewer() && typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(active, message, status);
        return;
    }

    if (isOrderProjectsPanelVisibleForTechnicalReviewer()
        && typeof setOrderProjectsPanelActionLoading === 'function') {
        setOrderProjectsPanelActionLoading(active, message, status);
    }
}

async function persistTechnicalReviewerRevision() {
    const project = getCurrentTechnicalReviewerProject();
    if (!project) return { ok: false };

    if (editingTechnicalReviewerRevisionId) {
        const existingRevision = await fetchRevisionById(editingTechnicalReviewerRevisionId);
        if (existingRevision?.revisionCompletedAt) {
            alertAppDialog('Esta revisão já foi finalizada e não pode ser alterada.');
            return { ok: false };
        }
    }

    const activities = collectTechnicalReviewerRevisionActivitiesFromDom().filter(activity => activity.description);
    if (!activities.length) {
        alertAppDialog('Adicione ao menos uma atividade.');
        return { ok: false };
    }

    const now = new Date().toISOString();
    let revisionId = editingTechnicalReviewerRevisionId;

    if (!revisionId) {
        const { data: revision, error: revisionError } = await createRevisionRecord({
            orderProjectId: project.id,
            revisionType: REVISION_TYPE_TECHNICAL_REVISOR
        });

        if (revisionError || !revision) {
            alertAppDialog('Erro ao criar revisão: ' + (revisionError?.message || 'Erro desconhecido'));
            return { ok: false };
        }

        revisionId = revision.id;
        editingTechnicalReviewerRevisionId = revisionId;
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

    return { ok: true, revisionId, activities };
}

function refreshTechnicalReviewerPendenciasViews() {
    if (typeof loadPendenciasEmRevisaoTecnicaRevisor === 'function'
        && pendenciasActiveItem === 'em-revisao-tecnica-revisor') {
        loadPendenciasEmRevisaoTecnicaRevisor();
    }
    if (typeof loadPendenciasEmRevisaoTecnicaProj === 'function'
        && pendenciasActiveItem === 'em-revisao-tecnica-proj') {
        loadPendenciasEmRevisaoTecnicaProj();
    }
    if (typeof loadPendenciasContent === 'function'
        && !pendenciasActiveItem
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
        loadPendenciasContent();
    }
}

async function startTechnicalReviewerRevision() {
    const project = getCurrentTechnicalReviewerProject();
    if (!canDesignerStartTechnicalReviewerRevision(project) || !editingTechnicalReviewerRevisionId) return;

    const confirmed = await confirmAppDialog(
        'Os campos Realizado e Observação serão liberados e os revisores serão notificados por e-mail.',
        {
            title: 'Iniciar revisão técnica?',
            confirmLabel: 'Iniciar'
        }
    );
    if (!confirmed) return;

    setTechnicalReviewerRevisionModalLoading(true, 'Iniciando revisão...');

    try {
        const now = new Date().toISOString();
        const { error } = await updateRevisionRecord(editingTechnicalReviewerRevisionId, {
            revisionStartedAt: now
        });

        if (error) {
            setTechnicalReviewerRevisionModalLoading(true, `Erro ao iniciar revisão: ${error.message}`, 'error');
            await new Promise(resolve => setTimeout(resolve, 2200));
            return;
        }

        const data = await fetchRevisionById(editingTechnicalReviewerRevisionId);
        currentTechnicalReviewerRevisionMeta = {
            revisionStartedAt: data?.revisionStartedAt || now,
            revisionCompletedAt: data?.revisionCompletedAt || null
        };

        setTechnicalReviewerRevisionModalLoading(true, 'Enviando notificação por e-mail...');
        if (typeof notifyTechnicalReviewerRevisionStartedEmail === 'function') {
            await notifyTechnicalReviewerRevisionStartedEmail({
                orderId: project.orderId,
                orderProjectIds: [project.id],
                designerId: project.designerId
            });
        }

        setTechnicalReviewerRevisionModalLoading(true, 'Revisão iniciada!', 'success');
        await new Promise(resolve => setTimeout(resolve, 700));
        setTechnicalReviewerRevisionModalLoading(false);
        refreshTechnicalReviewerRevisionCompletionFieldStates();
        refreshTechnicalReviewerPendenciasViews();
    } catch (error) {
        setTechnicalReviewerRevisionModalLoading(true, `Erro ao iniciar revisão: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setTechnicalReviewerRevisionModalLoading(false);
    }
}

async function saveTechnicalReviewerRevision() {
    setTechnicalReviewerRevisionModalLoading(true, 'Salvando revisão...');

    try {
        const result = await persistTechnicalReviewerRevision();
        if (!result.ok) return;

        if (result.revisionId) {
            await loadTechnicalReviewerRevisionActivities(result.revisionId);
        }

        setTechnicalReviewerRevisionModalLoading(true, 'Revisão salva com sucesso!', 'success');
        await new Promise(resolve => setTimeout(resolve, 700));
        updateTechnicalReviewerRevisionModalControls(getCurrentTechnicalReviewerProject());
        refreshTechnicalReviewerPendenciasViews();
    } catch (error) {
        setTechnicalReviewerRevisionModalLoading(true, `Erro ao salvar revisão: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
    } finally {
        setTechnicalReviewerRevisionModalLoading(false);
    }
}

async function approveTechnicalReviewerProjectToNomear(orderProjectId) {
    const projectId = Number(orderProjectId);
    if (!projectId) return;

    const project = await fetchOrderProjectForTechnicalReviewerRevision(projectId);
    if (!project || !canReviewerActOnProject(project)) {
        alertAppDialog('Sem permissão para aprovar este projeto.');
        return;
    }

    const confirmed = await confirmAppDialog(
        'O projeto será enviado para Nomear sem nova revisão com o projetista.',
        {
            title: 'Aprovar e enviar para Nomear?',
            confirmLabel: 'Aprovar'
        }
    );
    if (!confirmed) return;

    setTechnicalReviewerActionLoading(true, 'Aprovando projeto...');

    try {
        setTechnicalReviewerActionLoading(true, 'Concluindo revisão aberta...');
        const openRevision = await fetchOpenTechnicalReviewerRevision(projectId);
        if (openRevision?.id) {
            await completeRevisionRecord(openRevision.id);
        }

        setTechnicalReviewerActionLoading(true, 'Atualizando status para Nomear...');
        await applyTechnicalReviewerApprovedToNomear([projectId]);

        setTechnicalReviewerActionLoading(true, 'Atualizando telas...');
        refreshTechnicalReviewerPendenciasViews();

        if (typeof loadOrderProjects === 'function' && activeOrderId) {
            await loadOrderProjects(activeOrderId);
        }

        setTechnicalReviewerActionLoading(true, 'Projeto aprovado!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));
    } catch (error) {
        setTechnicalReviewerActionLoading(true, `Erro ao aprovar: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
    } finally {
        setTechnicalReviewerActionLoading(false);
    }
}

async function sendTechnicalReviewerRevisionToDesigner() {
    const project = getCurrentTechnicalReviewerProject();
    if (!project || !canReviewerActOnProject(project)) return;

    if (!reviewerHasTechnicalRevisionActivitiesReady()) {
        alertAppDialog('Adicione ao menos uma atividade.');
        return;
    }

    if (!project.designerId) {
        alertAppDialog('Este projeto não possui projetista atribuído.');
        return;
    }

    const confirmed = await confirmAppDialog(
        'As atividades serão enviadas ao projetista responsável para execução.',
        {
            title: 'Enviar para o projetista?',
            confirmLabel: 'Enviar'
        }
    );
    if (!confirmed) return;

    setTechnicalReviewerRevisionModalLoading(true, 'Salvando revisão...');

    try {
        const result = await persistTechnicalReviewerRevision();
        if (!result.ok) return;

        setTechnicalReviewerRevisionModalLoading(true, 'Atualizando status do projeto...');
        await applyTechnicalReviewerReviewProjStatusToProjects([project.id], { skipEmail: true });

        setTechnicalReviewerRevisionModalLoading(true, 'Enviando notificação por e-mail...');
        if (typeof notifyOrderProjectStatusChangeForProjects === 'function') {
            await notifyOrderProjectStatusChangeForProjects(
                [project.id],
                ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ,
                {
                    orderId: project.orderId,
                    designerId: project.designerId
                }
            );
        }

        setTechnicalReviewerRevisionModalLoading(true, 'Enviado para o projetista!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));
        closeTechnicalReviewerRevisionModal();
        refreshTechnicalReviewerPendenciasViews();

        if (typeof loadOrderProjects === 'function' && activeOrderId) {
            await loadOrderProjects(activeOrderId);
        }
    } catch (error) {
        setTechnicalReviewerRevisionModalLoading(true, `Erro ao enviar: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
    } finally {
        setTechnicalReviewerRevisionModalLoading(false);
    }
}

async function returnTechnicalReviewerRevisionToReviewer() {
    const project = getCurrentTechnicalReviewerProject();
    if (!project || !canDesignerActOnTechnicalReviewerProject(project)) return;

    if (!isTechnicalReviewerRevisionStarted() && isDesignerTechnicalReviewerRevisionResponder(project)) {
        alertAppDialog('Inicie a revisão antes de devolver ao revisor.');
        return;
    }

    if (!allTechnicalReviewerRevisionActivitiesCompleted()) {
        alertAppDialog('Marque todas as atividades como realizadas antes de devolver ao revisor.');
        return;
    }

    const confirmed = await confirmAppDialog(
        'O projeto retornará ao revisor para análise final.',
        {
            title: 'Devolver ao revisor?',
            confirmLabel: 'Devolver'
        }
    );
    if (!confirmed) return;

    setTechnicalReviewerRevisionModalLoading(true, 'Salvando revisão...');

    try {
        const result = await persistTechnicalReviewerRevision();
        if (!result.ok) return;

        setTechnicalReviewerRevisionModalLoading(true, 'Concluindo revisão...');
        const now = new Date().toISOString();
        if (editingTechnicalReviewerRevisionId) {
            await completeRevisionRecord(editingTechnicalReviewerRevisionId, now);
            currentTechnicalReviewerRevisionMeta.revisionCompletedAt = now;
        }

        setTechnicalReviewerRevisionModalLoading(true, 'Atualizando status do projeto...');
        await applyTechnicalReviewerReviewRevisorStatusToProjects([project.id]);

        setTechnicalReviewerRevisionModalLoading(true, 'Devolvido ao revisor!', 'success');
        await new Promise(resolve => setTimeout(resolve, 700));
        closeTechnicalReviewerRevisionModal();
        refreshTechnicalReviewerPendenciasViews();

        if (typeof loadOrderProjects === 'function' && activeOrderId) {
            await loadOrderProjects(activeOrderId);
        }
    } catch (error) {
        setTechnicalReviewerRevisionModalLoading(true, `Erro ao devolver: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
    } finally {
        setTechnicalReviewerRevisionModalLoading(false);
    }
}

function bindTechnicalReviewerRevisionEvents() {
    document.getElementById('btn-add-tr-revision-activity')?.addEventListener('click', () => {
        if (!canReviewerEditTechnicalReviewerRevisionDescriptions()) return;
        addTechnicalReviewerRevisionActivityRow();
    });

    document.getElementById('btn-tr-save-revision')?.addEventListener('click', saveTechnicalReviewerRevision);
    document.getElementById('btn-tr-start-revision')?.addEventListener('click', startTechnicalReviewerRevision);
    document.getElementById('btn-tr-send-to-designer')?.addEventListener('click', sendTechnicalReviewerRevisionToDesigner);
    document.getElementById('btn-tr-return-to-reviewer')?.addEventListener('click', returnTechnicalReviewerRevisionToReviewer);
}

window.openTechnicalReviewerRevisionModal = openTechnicalReviewerRevisionModal;
window.openTechnicalReviewerRevisionForRevision = openTechnicalReviewerRevisionForRevision;
window.closeTechnicalReviewerRevisionModal = closeTechnicalReviewerRevisionModal;
window.approveTechnicalReviewerProjectToNomear = approveTechnicalReviewerProjectToNomear;
