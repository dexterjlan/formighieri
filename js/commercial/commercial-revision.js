function isEmRevisaoTecnicaApproval(approval) {
    const projectStatusName = typeof getCommercialApprovalProjectStatusName === 'function'
        ? getCommercialApprovalProjectStatusName(approval)
        : '';

    if (projectStatusName) {
        return projectStatusName === 'Em Revisão Técnica'
            || projectStatusName === 'Em Revisão'
            || projectStatusName === 'Em revisão';
    }

    return approval?.status === 'Em revisão';
}

function isCreatingNewTecnicaRevision(approval) {
    return currentRevisionType === 'tecnica'
        && (!editingRevisionId
            || approval?.status === 'Em Revisão Comercial'
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

    if (projectStatusName) {
        return projectStatusName === 'Em Revisão Técnica' || projectStatusName === 'Em Revisão' || projectStatusName === 'Em revisão';
    }

    return approval?.status === 'Em revisão';
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
    if (projectStatusName === 'Em Revisão Comercial') {
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
        return status === 'Em Revisão Comercial';
    }

    return approval?.status === 'Em Revisão Comercial';
}

function canSendBackToApproval(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Projetista') return false;
    if (!approval?.designerId || Number(approval.designerId) !== Number(currentUser.id)) return false;

    const projectStatusName = typeof getCommercialApprovalProjectStatusName === 'function'
        ? getCommercialApprovalProjectStatusName(approval)
        : '';

    if (projectStatusName) {
        return projectStatusName === 'Em Revisão Técnica' || projectStatusName === 'Em Revisão' || projectStatusName === 'Em revisão';
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

function renderRevisionResizableText(text, tone = 'default') {
    const hasText = Boolean(text);
    const content = hasText ? escapeHtml(text) : '—';
    const toneClass = hasText
        ? (tone === 'muted' ? 'text-slate-600' : 'text-slate-800')
        : 'text-slate-400';

    return `<div class="revision-resizable-field revision-resizable-field--readonly ${toneClass}">${content}</div>`;
}

let currentRevisionType = 'tecnica';

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

    if (revisionModalViewOnly) {
        addBtn.classList.add('hidden');
        saveBtn.classList.add('hidden');
        sendBackBtn.classList.add('hidden');
        return;
    }

    if (currentRevisionType === 'comercial') {
        const canEditComercial = canEditRevisionActivitiesConsultor(approval);
        addBtn.classList.toggle('hidden', !canEditComercial);
        saveBtn.classList.toggle('hidden', !canEditComercial);
        sendBackBtn.classList.add('hidden');
        saveBtn.textContent = 'Salvar Revisão Comercial';
        return;
    }

    const isCreatingNewTecnica = isCreatingNewTecnicaRevision(approval);
    const canConsultorCreate = canEditRevisionActivitiesConsultor(approval) && isCreatingNewTecnica;
    const canConsultorEditExisting = canConsultorEditExistingTecnicaRevision(approval);

    if (isCreatingNewTecnica) {
        addBtn.classList.toggle('hidden', !canConsultorCreate);
        saveBtn.classList.toggle('hidden', !canConsultorCreate);
        sendBackBtn.classList.add('hidden');
        saveBtn.textContent = 'Criar Revisão Técnica';
        return;
    }

    if (canConsultorEditExisting) {
        addBtn.classList.remove('hidden');
        saveBtn.classList.remove('hidden');
        sendBackBtn.classList.add('hidden');
        saveBtn.textContent = 'Salvar Revisão Técnica';
        return;
    }

    const canSend = canSendBackToApproval(approval);
    const allComplete = allRevisionActivitiesCompleted();

    addBtn.classList.add('hidden');
    saveBtn.classList.toggle('hidden', !canOpenRevisionModal(approval));
    sendBackBtn.classList.toggle('hidden', !canSend);
    sendBackBtn.disabled = !canSend || !allComplete;
    sendBackBtn.classList.toggle('opacity-50', !allComplete);
    sendBackBtn.classList.toggle('cursor-not-allowed', !allComplete);
    saveBtn.textContent = 'Salvar Revisão Técnica';
}

async function loadRevisionActivities(revisionId) {
    const { data: activities, error } = await supabaseClient
        .from('CommercialRevisionActivity')
        .select('*')
        .eq('revisionId', revisionId)
        .order('sortOrder', { ascending: true })
        .order('id', { ascending: true });

    const tbody = document.getElementById('revision-activities-list');
    tbody.innerHTML = '';

    if (error) {
        alertAppDialog('Erro ao carregar atividades da revisão: ' + error.message);
        return;
    }

    if (!activities || activities.length === 0) {
        document.getElementById('revision-empty-msg').classList.remove('hidden');
        updateRevisionModalControls(getCurrentApproval());
        return;
    }

    activities.forEach(addRevisionActivityRow);
    if (typeof loadRevisionActivityAttachmentsForActivities === 'function') {
        await loadRevisionActivityAttachmentsForActivities(activities);
    }
    updateRevisionModalControls(getCurrentApproval());
}

async function ensureApprovalInCache(approvalId, forceRefresh = false) {
    let approval = !forceRefresh
        ? commercialApprovalsCache.find(a => Number(a.id) === Number(approvalId))
        : null;

    if (!approval) {
        let { data, error } = await supabaseClient
            .from('CommercialApproval')
            .select('id, orderId, orderProjectId, projectName, designerId, approved, approvedAt, status')
            .eq('id', approvalId)
            .maybeSingle();

        if (error) {
            ({ data, error } = await supabaseClient
                .from('CommercialApproval')
                .select('id, orderId, projectName, designerId, approved, approvedAt')
                .eq('id', approvalId)
                .maybeSingle());
        }

        if (error || !data) return null;

        const { data: orderInfo } = await supabaseClient
            .from('salesOrders')
            .select('consultantUserId, consultor:appUsers!consultantUserId(name)')
            .eq('id', data.orderId)
            .maybeSingle();

        approval = normalizeCommercialApproval({
            ...data,
            orderConsultantName: getOrderConsultantNameFromRecord(orderInfo) || null
        });

        const idx = commercialApprovalsCache.findIndex(a => Number(a.id) === Number(approvalId));
        if (idx !== -1) {
            commercialApprovalsCache[idx] = approval;
        } else {
            commercialApprovalsCache.push(approval);
        }
    }

    if (approval && approval.orderProjectId && (!approval.projectStatus || forceRefresh)) {
        const { data: proj } = await supabaseClient
            .from('OrderProject')
            .select('id, projectStatus:OrderProjectStatus(name)')
            .eq('id', approval.orderProjectId)
            .maybeSingle();
        if (proj?.projectStatus) {
            approval.projectStatus = proj.projectStatus;
        }
    }

    return approval;
}

async function getLatestRevisionForApproval(approvalId) {
    let { data: revision, error } = await supabaseClient
        .from('CommercialRevision')
        .select('id')
        .eq('commercialApprovalId', approvalId)
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        ({ data: revision } = await supabaseClient
            .from('CommercialRevision')
            .select('id')
            .eq('commercialApprovalId', approvalId)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle());
    }

    return revision;
}

function setupCommercialRevisionModalHeader(approval) {
    const isComercial = currentRevisionType === 'comercial';
    const typeLabel = isComercial ? 'Revisão Comercial' : 'Revisão Técnica';

    document.getElementById('revision-approval-info').textContent =
        `${typeLabel} | Projeto: ${approval.projectName} | Status: ${getApprovalStatusLabel(approval.status)}`;

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
        let { data: revision } = await supabaseClient
            .from('CommercialRevision')
            .select('id, type')
            .eq('commercialApprovalId', approvalId)
            .eq('type', 'comercial')
            .order('createdAt', { ascending: false })
            .limit(1)
            .maybeSingle();

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
        let { data: revision } = await supabaseClient
            .from('CommercialRevision')
            .select('id, type')
            .eq('commercialApprovalId', approvalId)
            .eq('type', 'tecnica')
            .order('createdAt', { ascending: false })
            .limit(1)
            .maybeSingle();

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
    const approval = (prefetched?.approval && !forceRefresh)
        ? prefetched.approval
        : await ensureApprovalInCache(approvalId, forceRefresh);
    if (!approval || !canViewCommercialRevision(approval)) return;

    let revisions = (prefetched?.revisions && !forceRefresh) ? prefetched.revisions : null;
    if (!revisions && typeof fetchCommercialRevisionsByApprovalIds === 'function') {
        const revisionsByApproval = await fetchCommercialRevisionsByApprovalIds([approvalId]);
        revisions = revisionsByApproval[approvalId] || [];
    }

    revisions = filterRevisionsForCurrentUser(revisions);

    if (!revisions?.length) {
        alertAppDialog(currentUser?.role === 'Projetista'
            ? 'Nenhuma revisão técnica encontrada para este projeto.'
            : 'Nenhuma revisão encontrada para este projeto.');
        return;
    }

    const contextEl = document.getElementById('commercial-revisions-history-context');
    const contentEl = document.getElementById('commercial-revisions-history-content');
    if (contextEl) {
        contextEl.textContent = `Projeto: ${approval.projectName || '—'} · ${revisions.length} revisão${revisions.length === 1 ? '' : 'ões'}`;
    }

    if (contentEl) {
        contentEl.innerHTML = renderCommercialRevisionsSection(revisions, approval, { showInHistoryModal: true });
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
    if (!approval || !canViewCommercialRevision(approval)) return;

    currentRevisionType = 'tecnica';
    currentRevisionApprovalId = approvalId;
    editingRevisionId = revisionId;

    const isProjetistaAuthorized = currentUser?.role === 'Projetista'
        && Number(approval.designerId) === Number(currentUser.id);
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
        let revision = null;
        let revisionError = null;

        ({ data: revision, error: revisionError } = await supabaseClient
            .from('CommercialRevision')
            .insert([{
                commercialApprovalId: approval.id,
                type: currentRevisionType
            }])
            .select('id')
            .single());

        if (revisionError && revisionError.message?.includes('type')) {
            ({ data: revision, error: revisionError } = await supabaseClient
                .from('CommercialRevision')
                .insert([{
                    commercialApprovalId: approval.id
                }])
                .select('id')
                .single());
        }

        if (revisionError || !revision) {
            alertAppDialog('Erro ao criar revisão: ' + (revisionError?.message || 'Erro desconhecido'));
            return { ok: false };
        }

        revisionId = revision.id;
        editingRevisionId = revisionId;

        if (currentRevisionType === 'tecnica') {
            const { error: statusError } = await supabaseClient
                .from('CommercialApproval')
                .update({
                    status: 'Em revisão',
                    approved: false,
                    approvedAt: null
                })
                .eq('id', approval.id);

            if (statusError && statusError.message?.includes('status')) {
                await supabaseClient
                    .from('CommercialApproval')
                    .update({ approved: false, approvedAt: null })
                    .eq('id', approval.id);
            } else if (statusError) {
                alertAppDialog('Erro ao atualizar status da aprovação: ' + statusError.message);
                return { ok: false };
            }

            if (typeof applyEmRevisaoStatusForCommercialApproval === 'function') {
                await applyEmRevisaoStatusForCommercialApproval(approval);
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
            const { error } = await supabaseClient
                .from('CommercialRevisionActivity')
                .update(payload)
                .eq('id', activity.id);
            if (error) {
                alertAppDialog('Erro ao salvar atividade: ' + error.message);
                return { ok: false };
            }
            activityIdByRowId[activity.rowId] = activity.id;
        } else {
            const { data: inserted, error } = await supabaseClient
                .from('CommercialRevisionActivity')
                .insert([{ ...payload, revisionId }])
                .select('id')
                .single();
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

    await supabaseClient
        .from('CommercialRevision')
        .update({ updatedAt: now })
        .eq('id', revisionId);

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

function setCommercialRevisionModalLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('commercial-revision-loading');
    const messageEl = document.getElementById('commercial-revision-loading-msg');
    const spinner = document.getElementById('commercial-revision-loading-spinner');
    const successIcon = document.getElementById('commercial-revision-loading-success');
    const errorIcon = document.getElementById('commercial-revision-loading-error');
    const saveBtn = document.getElementById('btn-save-revision');
    const sendBackBtn = document.getElementById('btn-send-back-approval');
    const addBtn = document.getElementById('btn-add-revision-activity');
    const cancelBtn = document.querySelector('#commercial-revision-modal button[onclick="closeCommercialRevisionModal()"]');
    const fields = document.querySelectorAll('#commercial-revision-modal textarea, #commercial-revision-modal input');
    const show = Boolean(active);

    overlay?.classList.toggle('hidden', !show);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.toggle('text-red-600', status === 'error');
        messageEl.classList.toggle('text-emerald-700', status === 'success');
        messageEl.classList.toggle('text-slate-700', status === 'loading');
    }

    spinner?.classList.toggle('hidden', status !== 'loading');
    successIcon?.classList.toggle('hidden', status !== 'success');
    errorIcon?.classList.toggle('hidden', status !== 'error');

    [saveBtn, sendBackBtn, addBtn, cancelBtn].forEach(btn => {
        if (!btn) return;
        btn.disabled = show;
        btn.classList.toggle('opacity-60', show);
        btn.classList.toggle('cursor-not-allowed', show);
    });
    fields.forEach(field => { field.disabled = show; });
}

async function saveCommercialRevision() {
    setCommercialRevisionModalLoading(true, 'Salvando revisão...');

    try {
        const result = await persistCommercialRevision();
        if (!result.ok) return;

        const approval = getCurrentApproval();
        if (approval && currentRevisionType === 'tecnica' && canConsultorEditExistingTecnicaRevision(approval) && !result.createdRevision) {
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
            let { error: revErr } = await supabaseClient
                .from('CommercialRevision')
                .update({
                    status: 'concluido',
                    concludedAt: now,
                    completedAt: now,
                    updatedAt: now
                })
                .eq('id', editingRevisionId);

            if (revErr) {
                ({ error: revErr } = await supabaseClient
                    .from('CommercialRevision')
                    .update({
                        completedAt: now,
                        updatedAt: now
                    })
                    .eq('id', editingRevisionId));
            }

            if (revErr) {
                await supabaseClient
                    .from('CommercialRevision')
                    .update({ updatedAt: now })
                    .eq('id', editingRevisionId);
            }
        }

        setCommercialRevisionModalLoading(true, 'Atualizando aprovação...');

        let { error } = await supabaseClient
            .from('CommercialApproval')
            .update({
                status: 'Em Revisão Comercial',
                approved: false,
                approvedAt: null
            })
            .eq('id', approval.id);

        if (error && error.message?.includes('status')) {
            ({ error } = await supabaseClient
                .from('CommercialApproval')
                .update({ approved: false, approvedAt: null })
                .eq('id', approval.id));
        }

        if (error) {
            setCommercialRevisionModalLoading(true, `Erro ao enviar para aprovação: ${error.message}`, 'error');
            await new Promise(resolve => setTimeout(resolve, 2200));
            return;
        }

        approval.status = 'Em Revisão Comercial';
        approval.approved = false;
        approval.approvedAt = null;

        const cacheIdx = commercialApprovalsCache.findIndex(a => Number(a.id) === Number(approval.id));
        if (cacheIdx !== -1) {
            commercialApprovalsCache[cacheIdx] = {
                ...commercialApprovalsCache[cacheIdx],
                status: 'Em Revisão Comercial',
                approved: false,
                approvedAt: null
            };
        }

        if (typeof applyEmRevisaoComercialStatusForCommercialApproval === 'function') {
            setCommercialRevisionModalLoading(true, 'Atualizando status do projeto...');
            await applyEmRevisaoComercialStatusForCommercialApproval(approval);
        } else if (typeof applyAguardandoAprovacaoStatusForCommercialApproval === 'function') {
            setCommercialRevisionModalLoading(true, 'Atualizando status do projeto...');
            await applyAguardandoAprovacaoStatusForCommercialApproval(approval);
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

async function fetchCommercialRevisionsByApprovalIds(approvalIds) {
    if (!approvalIds.length) return {};

    let { data: revisions, error } = await supabaseClient
        .from('CommercialRevision')
        .select('id, commercialApprovalId, type, createdAt')
        .in('commercialApprovalId', approvalIds)
        .order('createdAt', { ascending: false })
        .order('id', { ascending: false });

    if (error) {
        ({ data: revisions, error } = await supabaseClient
            .from('CommercialRevision')
            .select('id, commercialApprovalId')
            .in('commercialApprovalId', approvalIds)
            .order('id', { ascending: false }));
    }

    if (error || !revisions?.length) return {};

    const revisionIds = revisions.map(r => r.id);
    const { data: activities } = await supabaseClient
        .from('CommercialRevisionActivity')
        .select('id, revisionId, description, completed, observation, completedAt, sortOrder')
        .in('revisionId', revisionIds)
        .order('sortOrder', { ascending: true })
        .order('id', { ascending: true });

    const activitiesByRevision = {};
    const activityIds = [];
    activities?.forEach(activity => {
        activityIds.push(activity.id);
        if (!activitiesByRevision[activity.revisionId]) {
            activitiesByRevision[activity.revisionId] = [];
        }
        activitiesByRevision[activity.revisionId].push(activity);
    });

    const attachmentsByActivity = typeof fetchRevisionActivityAttachmentsByActivityIds === 'function'
        ? await fetchRevisionActivityAttachmentsByActivityIds(activityIds)
        : {};

    const byApproval = {};
    const seenRevisionIds = new Set();

    (revisions || []).forEach(revision => {
        if (!revision.id || seenRevisionIds.has(revision.id)) return;
        seenRevisionIds.add(revision.id);

        if (!byApproval[revision.commercialApprovalId]) {
            byApproval[revision.commercialApprovalId] = [];
        }
        byApproval[revision.commercialApprovalId].push({
            ...revision,
            activities: (activitiesByRevision[revision.id] || []).map(activity => ({
                ...activity,
                attachment: attachmentsByActivity[String(activity.id)] || null
            }))
        });
    });

    return byApproval;
}

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
    revisions = filterRevisionsForCurrentUser(revisions);
    if (!revisions || revisions.length === 0) return '';

    const seenRevisionIds = new Set();
    revisions = (revisions || []).filter(r => {
        if (!r.id) return true;
        if (seenRevisionIds.has(r.id)) return false;
        seenRevisionIds.add(r.id);
        return true;
    });

    const chronologicalTechnical = sortCommercialRevisionsChronologically(
        revisions.filter(r => r.type !== 'comercial')
    );
    const techNumberMap = new Map();
    chronologicalTechnical.forEach((r, idx) => {
        techNumberMap.set(r.id, idx + 1);
    });

    const showInHistoryModal = Boolean(options.showInHistoryModal);
    const sortedRevisions = sortCommercialRevisionsDescending(revisions);
    const currentRevision = sortedRevisions[0] || null;

    const isAuthorizedUser = currentUser?.role === 'Admin'
        || (currentUser?.role === 'Projetista' && Number(approval?.designerId) === Number(currentUser?.id));

    const blocks = sortedRevisions.map((revision) => {
        const isCurrentRevision = currentRevision && revision.id === currentRevision.id;
        const isComercial = revision.type === 'comercial';
        
        let titleText = '';
        if (isComercial) {
            titleText = 'Revisão Comercial';
        } else {
            const num = techNumberMap.get(revision.id) || 1;
            titleText = `Revisão Técnica ${num}`;
        }

        const typeBadge = `<span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isComercial ? 'bg-purple-100 text-purple-800' : 'bg-sky-100 text-sky-800'}">${isComercial ? 'Comercial' : 'Técnica'}</span>`;

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

        const isEmRevisao = isEmRevisaoTecnicaApproval(approval);
        const canConsultorEditRevision = isCurrentRevision
            && !isComercial
            && isEmRevisao
            && canEditRevisionActivitiesConsultor(approval);
        const canEditThisRevision = isCurrentRevision && isEmRevisao && (
            isAuthorizedUser || canConsultorEditRevision
        );

        let editButtonHtml = '';
        if (canEditThisRevision) {
            editButtonHtml = `<button type="button" onclick="openCommercialRevisionForRevision(${approval.id}, ${revision.id}, false)"
                class="fm-revision-block__action text-xs bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap cursor-pointer">Editar</button>`;
        } else {
            editButtonHtml = `<button type="button" disabled
                class="fm-revision-block__action text-xs bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap opacity-50 cursor-not-allowed"
                title="${!isCurrentRevision ? 'Disponível apenas para a revisão corrente em aberto' : 'Habilitado apenas para o projetista responsável, consultor ou admin'}">Editar</button>`;
        }

        const activityCount = revision.activities.length;
        const completedCount = revision.activities.filter(a => a.completed).length;

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

    if (typeof bindRevisionActivityAttachmentEvents === 'function') {
        bindRevisionActivityAttachmentEvents();
    }
}
