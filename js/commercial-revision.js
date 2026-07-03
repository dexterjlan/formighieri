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

function renderRevisionResizableText(text, tone = 'default') {
    const hasText = Boolean(text);
    const content = hasText ? escapeHtml(text) : '—';
    const toneClass = hasText
        ? (tone === 'muted' ? 'text-slate-600' : 'text-slate-800')
        : 'text-slate-400';

    return `<div class="revision-resizable-field revision-resizable-field--readonly ${toneClass}">${content}</div>`;
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
            <textarea rows="2" class="revision-activity-description revision-resizable-input px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 disabled:bg-slate-50"
                placeholder="Descreva a atividade..."
                ${consultorCanEdit ? '' : 'disabled'}>${escapeHtml(activity.description || '')}</textarea>
        </td>
        <td class="p-3 align-middle text-center">
            <input type="checkbox" class="revision-activity-completed h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                ${activity.completed ? 'checked' : ''}
                ${completionCanEdit ? '' : 'disabled'}>
        </td>
        <td class="p-3 align-top">
            <textarea rows="2" class="revision-activity-observation revision-resizable-input px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 disabled:bg-slate-50"
                placeholder="Observação do projetista..."
                ${completionCanEdit ? '' : 'disabled'}>${escapeHtml(activity.observation || '')}</textarea>
        </td>
        <td class="p-3 align-middle">
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

async function openCommercialRevisionForRevision(approvalId, revisionId) {
    const approval = await ensureApprovalInCache(approvalId);
    if (!approval || !canViewCommercialRevision(approval)) return;

    const { data: latest } = await supabaseClient
        .from('CommercialRevision')
        .select('id')
        .eq('commercialApprovalId', approvalId)
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (approval.status === 'Em revisão' && latest?.id === revisionId && canOpenRevisionModal(approval)) {
        return openCommercialRevisionModal(approvalId);
    }

    revisionModalViewOnly = true;
    currentRevisionApprovalId = approvalId;
    editingRevisionId = revisionId;
    revisionActivityRowCounter = 0;

    document.getElementById('revision-activities-list').innerHTML = '';
    document.getElementById('revision-empty-msg').classList.add('hidden');
    setupCommercialRevisionModalHeader(approval);
    updateRevisionModalControls(approval);
    await loadRevisionActivities(revisionId);
    toggleModal('commercial-revision-modal', true);
}

window.openCommercialRevisionForRevision = openCommercialRevisionForRevision;

function closeCommercialRevisionModal() {
    revisionModalViewOnly = false;
    editingRevisionId = null;
    currentRevisionApprovalId = null;
    toggleModal('commercial-revision-modal', false);
}

async function persistCommercialRevision() {
    const approval = getCurrentApproval();
    if (!approval) return { ok: false };

    const activities = collectRevisionActivitiesFromDom().filter(a => a.description);
    if (activities.length === 0) {
        alert('Adicione ao menos uma atividade.');
        return { ok: false };
    }

    const now = new Date().toISOString();
    let revisionId = editingRevisionId;
    const createdRevision = !revisionId;

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
            return { ok: false };
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
            return { ok: false };
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
                return { ok: false };
            }
        } else {
            const { error } = await supabaseClient
                .from('CommercialRevisionActivity')
                .insert([{ ...payload, revisionId }]);
            if (error) {
                alert('Erro ao salvar atividade: ' + error.message);
                return { ok: false };
            }
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
}

function setCommercialRevisionModalLoading(isLoading, message = 'Salvando revisão...') {
    const overlay = document.getElementById('commercial-revision-loading');
    const messageEl = document.getElementById('commercial-revision-loading-msg');
    const saveBtn = document.getElementById('btn-save-revision');
    const sendBackBtn = document.getElementById('btn-send-back-approval');
    const addBtn = document.getElementById('btn-add-revision-activity');
    const cancelBtn = document.querySelector('#commercial-revision-modal button[onclick="closeCommercialRevisionModal()"]');
    const fields = document.querySelectorAll('#commercial-revision-modal textarea, #commercial-revision-modal input');

    overlay?.classList.toggle('hidden', !isLoading);
    if (messageEl) messageEl.textContent = message;
    [saveBtn, sendBackBtn, addBtn, cancelBtn].forEach(btn => {
        if (!btn) return;
        btn.disabled = isLoading;
        btn.classList.toggle('opacity-60', isLoading);
        btn.classList.toggle('cursor-not-allowed', isLoading);
    });
    fields.forEach(field => { field.disabled = isLoading; });
}

async function saveCommercialRevision() {
    setCommercialRevisionModalLoading(true, 'Salvando revisão...');

    try {
        const result = await persistCommercialRevision();
        if (!result.ok) return;

        const approval = getCurrentApproval();
        if (result.createdRevision && approval) {
            setCommercialRevisionModalLoading(true, 'Enviando notificação por e-mail...');
            await notifyApprovalEmail('revision_created', {
                ...approval,
                status: 'Em revisão'
            }, { activities: result.activities });
        }

        closeCommercialRevisionModal();
        refreshCommercialApprovalViews();
    } finally {
        setCommercialRevisionModalLoading(false);
    }
}

async function sendRevisionBackToApproval() {
    const approval = getCurrentApproval();
    if (!approval || !canSendBackToApproval(approval)) return;

    if (!allRevisionActivitiesCompleted()) {
        alert('Marque todas as atividades como realizadas antes de enviar para aprovação.');
        return;
    }

    if (!confirm('Enviar esta solicitação novamente para aprovação comercial?')) return;

    setCommercialRevisionModalLoading(true, 'Salvando revisão...');

    try {
        const result = await persistCommercialRevision();
        if (!result.ok) return;

        setCommercialRevisionModalLoading(true, 'Atualizando aprovação...');

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

        setCommercialRevisionModalLoading(true, 'Enviando notificação por e-mail...');
        await notifyApprovalEmail('sent_back_to_approval', {
            ...approval,
            status: 'Aguardando Aprovação',
            approved: false,
            approvedAt: null
        }, { activities: result.activities });

        closeCommercialRevisionModal();
        refreshCommercialApprovalViews();
    } finally {
        setCommercialRevisionModalLoading(false);
    }
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

function renderCommercialRevisionsSection(revisions, approval) {
    if (!revisions || revisions.length === 0) return '';

    const canView = approval && canViewCommercialRevision(approval);
    const sortedRevisions = [...revisions].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
    });

    const blocks = sortedRevisions.map((revision, index) => {
        const isOpenRevision = approval?.status === 'Em revisão'
            && sortedRevisions[0]?.id === revision.id;
        const activitiesHtml = revision.activities.length
            ? revision.activities.map(activity => `
                <tr class="border-t border-slate-100">
                    <td class="py-2 pr-2 align-top">${renderRevisionResizableText(activity.description)}</td>
                    <td class="py-2 px-2 text-center text-xs align-middle">
                        ${activity.completed
                            ? '<span class="text-emerald-700 font-semibold">Sim</span>'
                            : '<span class="text-slate-400">Não</span>'}
                    </td>
                    <td class="py-2 px-2 align-top">${renderRevisionResizableText(activity.observation, 'muted')}</td>
                    <td class="py-2 pl-2 text-xs text-slate-500 whitespace-nowrap align-middle">${activity.completedAt ? formatDate(activity.completedAt) : '—'}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="4" class="py-2 text-xs text-slate-400">Nenhuma atividade registrada.</td></tr>`;

        const viewButton = canView && isOpenRevision
            ? `<button type="button" onclick="openCommercialRevisionForRevision(${approval.id}, ${revision.id})"
                class="text-xs bg-sky-700 text-white hover:bg-sky-800 px-4 py-2 rounded-lg font-semibold shadow-sm whitespace-nowrap">Ver Revisão</button>`
            : '';

        return `
            <div class="bg-sky-50 border border-sky-200 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-sky-100/80 px-4 py-3 flex justify-between items-center gap-3 border-b border-sky-200">
                    <div>
                        <p class="text-xs font-bold text-sky-900">Revisão ${index + 1}</p>
                        <p class="text-[10px] text-sky-700 mt-0.5">${revision.createdAt ? formatDate(revision.createdAt) : '—'}</p>
                    </div>
                    ${viewButton}
                </div>
                <div class="overflow-x-auto bg-white/70">
                    <table class="revision-history-table min-w-[480px]">
                        <colgroup>
                            <col style="width:36%">
                            <col style="width:72px">
                            <col style="width:36%">
                            <col style="width:112px">
                        </colgroup>
                        <thead class="text-[9px] uppercase text-slate-500 bg-sky-50/50">
                            <tr>
                                <th class="px-3 py-1.5 font-semibold text-left">Atividade</th>
                                <th class="px-2 py-1.5 font-semibold text-center">Realizado</th>
                                <th class="px-2 py-1.5 font-semibold text-left">Observação</th>
                                <th class="px-3 py-1.5 font-semibold text-left">Data realização</th>
                            </tr>
                        </thead>
                        <tbody>${activitiesHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="space-y-3 pt-3 border-t border-dashed border-slate-200">
            <p class="text-[10px] font-bold text-slate-400 uppercase">Histórico de revisões</p>
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
