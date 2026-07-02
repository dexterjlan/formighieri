function canEditRevisionActivitiesConsultor(approval) {
    if (!approval) {
        return currentUser?.role === 'Admin';
    }
    return typeof isAdminOrOrderConsultorForApproval === 'function'
        && isAdminOrOrderConsultorForApproval(approval);
}

function canEditRevisionActivityProjetista(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role === 'Projetista' && approval?.designerId === currentUser.id) return true;
    return false;
}

function canEditRevisionActivityCompletionFields(approval) {
    if (approval?.status !== 'Em revisão') return false;
    if (currentUser?.role === 'Admin') return true;
    return currentUser?.role === 'Projetista' && approval?.designerId === currentUser.id;
}

function canViewCommercialRevision(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role === 'Projetista' && approval?.designerId === currentUser.id) return true;
    return typeof isAdminOrOrderConsultorForApproval === 'function'
        && isAdminOrOrderConsultorForApproval(approval);
}

function canOpenRevisionModal(approval) {
    if (approval.status === 'Em revisão') {
        if (currentUser?.role === 'Admin') return true;
        if (currentUser?.role === 'Projetista' && approval?.designerId === currentUser.id) return true;
        return typeof isAdminOrOrderConsultorForApproval === 'function'
            && isAdminOrOrderConsultorForApproval(approval);
    }
    return canRequestNewRevision(approval);
}

function canRequestNewRevision(approval) {
    return approval?.status === 'Aguardando Aprovação'
        && typeof isAdminOrOrderConsultorForApproval === 'function'
        && isAdminOrOrderConsultorForApproval(approval);
}

function canSendBackToApproval(approval) {
    if (approval?.status !== 'Em revisão') return false;
    if (currentUser?.role === 'Admin') return true;
    return currentUser?.role === 'Projetista' && approval?.designerId === currentUser.id;
}

function allRevisionActivitiesCompleted() {
    const activities = collectRevisionActivitiesFromDom().filter(a => a.description);
    if (activities.length === 0) return false;
    return activities.every(a => a.completed);
}

function getCurrentApproval() {
    return commercialApprovalsCache.find(a => a.id === currentRevisionApprovalId);
}

function renderRevisionActivityRow(activity) {
    const approval = getCurrentApproval();
    const isNewRevision = approval?.status === 'Aguardando Aprovação';
    const consultorCanEdit = !revisionModalViewOnly
        && canEditRevisionActivitiesConsultor(approval)
        && (isNewRevision || approval?.status === 'Em revisão');
    const completionCanEdit = !revisionModalViewOnly && canEditRevisionActivityCompletionFields(approval);
    const rowId = activity.id || activity.tempId;

    const tr = document.createElement('tr');
    tr.dataset.rowId = rowId;
    if (activity.completedAt) {
        tr.dataset.completedAt = activity.completedAt;
    }

    tr.innerHTML = `
        <td class="p-3 align-top">
            <input type="text" class="revision-activity-description w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 disabled:bg-slate-50"
                value="${activity.description || ''}"
                placeholder="Descreva a atividade..."
                ${consultorCanEdit ? '' : 'disabled'}>
        </td>
        <td class="p-3 align-top text-center">
            <input type="checkbox" class="revision-activity-completed h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                ${activity.completed ? 'checked' : ''}
                ${completionCanEdit ? '' : 'disabled'}>
        </td>
        <td class="p-3 align-top">
            <textarea rows="2" class="revision-activity-observation w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 disabled:bg-slate-50"
                placeholder="Observação do projetista..."
                ${completionCanEdit ? '' : 'disabled'}>${activity.observation || ''}</textarea>
        </td>
        <td class="p-3 align-top">
            <p class="revision-activity-completed-at px-2 py-1.5 text-xs border border-slate-100 rounded-lg bg-slate-50 text-slate-600 whitespace-nowrap">
                ${activity.completedAt ? formatDate(activity.completedAt) : '—'}
            </p>
        </td>
    `;

    const checkbox = tr.querySelector('.revision-activity-completed');
    const completedAtEl = tr.querySelector('.revision-activity-completed-at');
    checkbox?.addEventListener('change', function () {
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

    const isNewRevision = approval.status === 'Aguardando Aprovação';
    const canSend = canSendBackToApproval(approval);
    const allComplete = allRevisionActivitiesCompleted();

    addBtn.classList.toggle('hidden', !canEditRevisionActivitiesConsultor(approval));
    saveBtn.classList.toggle('hidden', !canOpenRevisionModal(approval));
    sendBackBtn.classList.toggle('hidden', !canSend);
    sendBackBtn.disabled = !canSend || !allComplete;
    sendBackBtn.classList.toggle('opacity-50', !allComplete);
    sendBackBtn.classList.toggle('cursor-not-allowed', !allComplete);
    saveBtn.textContent = isNewRevision ? 'Criar Revisão' : 'Salvar Revisão';
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
        alert('Erro ao carregar atividades da revisão: ' + error.message);
        return;
    }

    if (!activities || activities.length === 0) {
        document.getElementById('revision-empty-msg').classList.remove('hidden');
        updateRevisionModalControls(getCurrentApproval());
        return;
    }

    activities.forEach(addRevisionActivityRow);
    updateRevisionModalControls(getCurrentApproval());
}

async function ensureApprovalInCache(approvalId) {
    let approval = commercialApprovalsCache.find(a => a.id === approvalId);
    if (approval) return approval;

    let { data, error } = await supabaseClient
        .from('CommercialApproval')
        .select('id, orderId, projectName, designerId, approved, approvedAt, status')
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
        .select('consultantName')
        .eq('id', data.orderId)
        .maybeSingle();

    approval = normalizeCommercialApproval({
        ...data,
        orderConsultantName: orderInfo?.consultantName || null
    });
    commercialApprovalsCache.push(approval);
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
    document.getElementById('revision-approval-info').textContent =
        `Projeto: ${approval.projectName} | Status da aprovação: ${getApprovalStatusLabel(approval.status)}`;

    const badge = document.getElementById('revision-status-badge');
    badge.textContent = approval.status === 'Aguardando Aprovação' ? 'Nova revisão' : getApprovalStatusLabel(approval.status);
    badge.className = `text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${getApprovalStatusBadgeClass(approval.status === 'Aguardando Aprovação' ? 'Em revisão' : approval.status)}`;
}

async function openCommercialRevisionModal(approvalId) {
    revisionModalViewOnly = false;
    const approval = await ensureApprovalInCache(approvalId);
    if (!approval || !canOpenRevisionModal(approval)) return;

    currentRevisionApprovalId = approvalId;
    editingRevisionId = null;
    revisionActivityRowCounter = 0;

    document.getElementById('revision-activities-list').innerHTML = '';
    document.getElementById('revision-empty-msg').classList.add('hidden');
    setupCommercialRevisionModalHeader(approval);
    updateRevisionModalControls(approval);

    if (approval.status === 'Em revisão') {
        const { data: revision } = await supabaseClient
            .from('CommercialRevision')
            .select('id')
            .eq('commercialApprovalId', approvalId)
            .order('createdAt', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (revision) {
            editingRevisionId = revision.id;
            await loadRevisionActivities(revision.id);
        }
    } else {
        addRevisionActivityRow();
    }

    toggleModal('commercial-revision-modal', true);
}

async function openCommercialRevisionView(approvalId) {
    const approval = await ensureApprovalInCache(approvalId);
    if (!approval || !canViewCommercialRevision(approval)) return;

    const revision = await getLatestRevisionForApproval(approvalId);
    if (!revision) {
        alert('Nenhuma revisão encontrada para esta aprovação.');
        return;
    }

    if (approval.status === 'Em revisão' && canOpenRevisionModal(approval)) {
        return openCommercialRevisionModal(approvalId);
    }

    revisionModalViewOnly = true;
    currentRevisionApprovalId = approvalId;
    editingRevisionId = revision.id;
    revisionActivityRowCounter = 0;

    document.getElementById('revision-activities-list').innerHTML = '';
    document.getElementById('revision-empty-msg').classList.add('hidden');
    setupCommercialRevisionModalHeader(approval);
    await loadRevisionActivities(revision.id);
    toggleModal('commercial-revision-modal', true);
}

function closeCommercialRevisionModal() {
    revisionModalViewOnly = false;
    editingRevisionId = null;
    currentRevisionApprovalId = null;
    toggleModal('commercial-revision-modal', false);
}

async function persistCommercialRevision() {
    const approval = getCurrentApproval();
    if (!approval) return false;

    const activities = collectRevisionActivitiesFromDom().filter(a => a.description);
    if (activities.length === 0) {
        alert('Adicione ao menos uma atividade.');
        return false;
    }

    const now = new Date().toISOString();
    let revisionId = editingRevisionId;

    if (!revisionId) {
        const { data: revision, error: revisionError } = await supabaseClient
            .from('CommercialRevision')
            .insert([{
                commercialApprovalId: approval.id
            }])
            .select('id')
            .single();

        if (revisionError || !revision) {
            alert('Erro ao criar revisão: ' + (revisionError?.message || 'Erro desconhecido'));
            return false;
        }

        revisionId = revision.id;
        editingRevisionId = revisionId;

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
            alert('Erro ao atualizar status da aprovação: ' + statusError.message);
            return false;
        }
    }

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
                alert('Erro ao salvar atividade: ' + error.message);
                return false;
            }
        } else {
            const { error } = await supabaseClient
                .from('CommercialRevisionActivity')
                .insert([{ ...payload, revisionId }]);
            if (error) {
                alert('Erro ao salvar atividade: ' + error.message);
                return false;
            }
        }
    }

    await supabaseClient
        .from('CommercialRevision')
        .update({ updatedAt: now })
        .eq('id', revisionId);

    return true;
}

function refreshCommercialApprovalViews() {
    if (activeOrderId) {
        loadCommercialApprovals(activeOrderId);
    }
    if (typeof refreshApprovalsQueryIfVisible === 'function') {
        refreshApprovalsQueryIfVisible();
    }
}

async function saveCommercialRevision() {
    const saved = await persistCommercialRevision();
    if (!saved) return;

    closeCommercialRevisionModal();
    refreshCommercialApprovalViews();
}

async function sendRevisionBackToApproval() {
    const approval = getCurrentApproval();
    if (!approval || !canSendBackToApproval(approval)) return;

    if (!allRevisionActivitiesCompleted()) {
        alert('Marque todas as atividades como realizadas antes de enviar para aprovação.');
        return;
    }

    if (!confirm('Enviar esta solicitação novamente para aprovação comercial?')) return;

    const saved = await persistCommercialRevision();
    if (!saved) return;

    let { error } = await supabaseClient
        .from('CommercialApproval')
        .update({
            status: 'Aguardando Aprovação',
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
        alert('Erro ao enviar para aprovação: ' + error.message);
        return;
    }

    closeCommercialRevisionModal();
    refreshCommercialApprovalViews();
}

window.openCommercialRevisionModal = openCommercialRevisionModal;
window.closeCommercialRevisionModal = closeCommercialRevisionModal;
window.openCommercialRevisionView = openCommercialRevisionView;

async function fetchCommercialRevisionsByApprovalIds(approvalIds) {
    if (!approvalIds.length) return {};

    let { data: revisions, error } = await supabaseClient
        .from('CommercialRevision')
        .select('id, commercialApprovalId, createdAt')
        .in('commercialApprovalId', approvalIds)
        .order('createdAt', { ascending: true })
        .order('id', { ascending: true });

    if (error) {
        ({ data: revisions, error } = await supabaseClient
            .from('CommercialRevision')
            .select('id, commercialApprovalId')
            .in('commercialApprovalId', approvalIds)
            .order('id', { ascending: true }));
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
    activities?.forEach(activity => {
        if (!activitiesByRevision[activity.revisionId]) {
            activitiesByRevision[activity.revisionId] = [];
        }
        activitiesByRevision[activity.revisionId].push(activity);
    });

    const byApproval = {};
    revisions.forEach(revision => {
        if (!byApproval[revision.commercialApprovalId]) {
            byApproval[revision.commercialApprovalId] = [];
        }
        byApproval[revision.commercialApprovalId].push({
            ...revision,
            activities: activitiesByRevision[revision.id] || []
        });
    });

    return byApproval;
}

function renderCommercialRevisionsSection(revisions) {
    if (!revisions || revisions.length === 0) return '';

    const blocks = revisions.map((revision, index) => {
        const activitiesHtml = revision.activities.length
            ? revision.activities.map(activity => `
                <tr class="border-t border-slate-100">
                    <td class="py-2 pr-2 text-xs text-slate-800 align-top">${activity.description || '—'}</td>
                    <td class="py-2 px-2 text-center text-xs align-top">
                        ${activity.completed
                            ? '<span class="text-emerald-700 font-semibold">Sim</span>'
                            : '<span class="text-slate-400">Não</span>'}
                    </td>
                    <td class="py-2 px-2 text-xs text-slate-600 align-top">${activity.observation || '—'}</td>
                    <td class="py-2 pl-2 text-xs text-slate-500 whitespace-nowrap align-top">${activity.completedAt ? formatDate(activity.completedAt) : '—'}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="4" class="py-2 text-xs text-slate-400">Nenhuma atividade registrada.</td></tr>`;

        return `
            <div class="border border-sky-100 rounded-lg overflow-hidden">
                <div class="bg-sky-50 px-3 py-2 flex justify-between items-center gap-2">
                    <p class="text-xs font-semibold text-sky-900">Revisão ${index + 1}</p>
                    <p class="text-[10px] text-sky-700">${revision.createdAt ? formatDate(revision.createdAt) : '—'}</p>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full min-w-[480px]">
                        <thead class="text-[9px] uppercase text-slate-400 bg-white">
                            <tr>
                                <th class="px-3 py-1.5 font-semibold text-left">Atividade</th>
                                <th class="px-2 py-1.5 font-semibold text-center w-16">Realizado</th>
                                <th class="px-2 py-1.5 font-semibold text-left">Observação</th>
                                <th class="px-3 py-1.5 font-semibold text-left w-28">Data realização</th>
                            </tr>
                        </thead>
                        <tbody>${activitiesHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="space-y-2 pt-3 border-t border-slate-100">
            <p class="text-[10px] font-bold text-slate-400 uppercase">Revisões</p>
            ${blocks}
        </div>
    `;
}

function bindCommercialRevisionEvents() {
    document.getElementById('btn-add-revision-activity').addEventListener('click', function () {
        const approval = getCurrentApproval();
        if (!canEditRevisionActivitiesConsultor(approval)) return;
        addRevisionActivityRow();
    });

    document.getElementById('btn-save-revision').addEventListener('click', saveCommercialRevision);
    document.getElementById('btn-send-back-approval').addEventListener('click', sendRevisionBackToApproval);
}
