function getOrderConsultantNameForApproval(approval) {
    if (!approval) return null;
    if (approval.orderConsultantName) return approval.orderConsultantName;
    if (approval.order?.consultantName) return approval.order.consultantName;
    if (approval.orderId && typeof ordersCache !== 'undefined') {
        const order = ordersCache.find(o => o.id === approval.orderId);
        if (order?.consultantName) return order.consultantName;
    }
    return null;
}

function isAdminOrOrderConsultorForApproval(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Consultor') return false;

    const consultantName = getOrderConsultantNameForApproval(approval);
    return Boolean(consultantName && currentUser.name === consultantName);
}

function canEditCommercialApprovalCommercialFields(approval) {
    return isAdminOrOrderConsultorForApproval(approval || { orderId: activeOrderId });
}

function canApproveCommercialApproval(approval) {
    return approval?.status === 'Aguardando Aprovação'
        && isAdminOrOrderConsultorForApproval(approval);
}

function canEditCommercialApprovalCommercialFieldsOnly(approval) {
    if (!isAdminOrOrderConsultorForApproval(approval)) return false;
    return !approval || approval.status === 'Aguardando Aprovação';
}

function canEditCommercialApprovalDesignerFields(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role === 'Projetista' && approval?.designerId === currentUser.id) return true;
    return false;
}

function canOpenCommercialApprovalModal() {
    if (!activeOrderId) return false;
    if (currentUser?.role === 'Admin') return true;
    return currentUser?.role === 'Projetista';
}

function canEditCommercialApproval(approval) {
    if (isAdminOrOrderConsultorForApproval(approval)) return true;
    return canEditCommercialApprovalDesignerFields(approval);
}

async function loadApprovalProjetistas(selectedId) {
    const select = document.getElementById("approval-designer");
    select.disabled = false;
    select.classList.remove('bg-slate-100', 'cursor-not-allowed');

    if (currentUser?.role === 'Projetista' && !canEditCommercialApprovalCommercialFields({ orderId: activeOrderId })) {
        select.innerHTML = `<option value="${currentUser.id}">${currentUser.name}</option>`;
        select.value = String(currentUser.id);
        select.disabled = true;
        select.classList.add('bg-slate-100', 'cursor-not-allowed');
        return;
    }

    const { data: projetistas, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .order('name', { ascending: true });

    select.innerHTML = '<option value="">Selecione...</option>';

    if (error || !projetistas || projetistas.length === 0) {
        select.innerHTML += '<option value="" disabled>Nenhum projetista cadastrado</option>';
        return;
    }

    projetistas.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });

    if (selectedId) {
        select.value = String(selectedId);
    }
}

function setupCommercialApprovalFormFields(approval, isEditMode) {
    const commercialCanEdit = canEditCommercialApprovalCommercialFieldsOnly(approval);
    const statusWrap = document.getElementById('approval-status-readonly-wrap');
    const statusLabel = document.getElementById('approval-status-readonly-label');
    const createWrap = document.getElementById('approval-create-wrap');
    const editWrap = document.getElementById('approval-edit-wrap');

    document.getElementById('approval-designer').disabled = !commercialCanEdit || currentUser?.role === 'Projetista';

    if (isEditMode) {
        createWrap.classList.add('hidden');
        editWrap.classList.remove('hidden');
        statusWrap.classList.remove('hidden');
        statusLabel.textContent = getApprovalStatusLabel(approval.status);
        return;
    }

    createWrap.classList.remove('hidden');
    editWrap.classList.add('hidden');
    statusWrap.classList.add('hidden');
}

function getExistingApprovalsByProjectId(approvals, projects) {
    const byProjectId = {};

    approvals.forEach(approval => {
        if (approval.orderProjectId) {
            byProjectId[approval.orderProjectId] = approval;
            return;
        }

        const match = projects.find(p => p.name === approval.projectName);
        if (match) {
            byProjectId[match.id] = approval;
        }
    });

    return byProjectId;
}

async function loadApprovalProjectCheckboxes() {
    const container = document.getElementById('approval-projects-list');
    const projects = await fetchOrderProjectsForOrder(activeOrderId);

    if (!projects.length) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">Cadastre projetos no pedido antes de solicitar aprovação.</p>';
        return;
    }

    const existingByProjectId = getExistingApprovalsByProjectId(commercialApprovalsCache, projects);
    const sortedProjects = [...projects].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    );

    container.innerHTML = '';

    sortedProjects.forEach(project => {
        const existing = existingByProjectId[project.id];
        const hasApproval = Boolean(existing);
        const statusLabel = hasApproval ? getApprovalStatusLabel(normalizeCommercialApproval(existing).status) : '';

        const label = document.createElement('label');
        label.className = `flex items-center gap-2 px-2 py-1.5 rounded-md border ${hasApproval ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'} cursor-pointer hover:bg-white transition`;

        label.innerHTML = `
            <input type="checkbox" name="approval-project" value="${project.id}"
                data-project-name="${project.name.replace(/"/g, '&quot;')}"
                ${hasApproval ? 'data-existing-approval="true"' : ''}
                class="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 shrink-0"
                ${hasApproval ? 'checked disabled' : ''}>
            <span class="flex-1 min-w-0 text-xs leading-tight">
                <span class="font-semibold text-slate-800">${project.name}</span>
                <span class="text-slate-400"> · ${project.environmentType?.name || '-'}</span>
                ${hasApproval ? `<span class="text-[10px] text-emerald-700 font-medium"> · ${statusLabel}</span>` : ''}
            </span>
        `;

        container.appendChild(label);
    });
}

function getSelectedNewApprovalProjectIds() {
    return [...document.querySelectorAll('input[name="approval-project"]:checked')]
        .filter(input => !input.dataset.existingApproval)
        .map(input => Number(input.value));
}

async function getOpenRequestsForProjects(orderId, projectIds) {
    if (!orderId || !projectIds.length) return [];

    const { data, error } = await supabaseClient
        .from('OrderRequest')
        .select('id, orderProjectId, status, requestProfile')
        .eq('orderId', orderId)
        .in('orderProjectId', projectIds);

    if (error) {
        if (error.message?.includes('orderProjectId')) return [];
        console.error('getOpenRequestsForProjects:', error);
        return [];
    }

    return (data || []).filter(isRequestOpen);
}

function confirmApprovalDespiteOpenRequests(openRequests, projects) {
    const lines = openRequests.map(req => {
        const project = projects.find(p => p.id === req.orderProjectId);
        const name = project?.name || 'Projeto';
        const status = normalizeRequestStatus(req);
        return `• ${name} (${status})`;
    });

    return confirm(
        `Os projetos abaixo possuem requisições em aberto:\n\n${lines.join('\n')}\n\nDeseja solicitar aprovação comercial mesmo assim?`
    );
}

async function getOpenCommercialApprovalsForProject(orderId, orderProjectId) {
    if (!orderId || !orderProjectId) return [];

    let { data, error } = await supabaseClient
        .from('CommercialApproval')
        .select('id, projectName, status, approved, orderProjectId')
        .eq('orderId', orderId)
        .eq('orderProjectId', orderProjectId);

    if (error?.message?.includes('orderProjectId')) {
        const projects = typeof fetchOrderProjectsForOrder === 'function'
            ? await fetchOrderProjectsForOrder(orderId)
            : [];
        const project = projects.find(p => p.id === orderProjectId);
        if (!project) return [];

        ({ data, error } = await supabaseClient
            .from('CommercialApproval')
            .select('id, projectName, status, approved')
            .eq('orderId', orderId)
            .eq('projectName', project.name));
    }

    if (error) {
        console.error('getOpenCommercialApprovalsForProject:', error);
        return [];
    }

    return (data || []).filter(a => normalizeCommercialApproval(a).status !== 'Aprovado');
}

async function validateConsultorRequestAgainstOpenApproval(orderProjectId, existingRequest) {
    if (currentUser?.role !== 'Consultor' || !orderProjectId || !activeOrderId) {
        return true;
    }

    const isNew = !existingRequest;
    const projectChanged = existingRequest
        && Number(existingRequest.orderProjectId) !== Number(orderProjectId);

    if (!isNew && !projectChanged) {
        return true;
    }

    const openApprovals = await getOpenCommercialApprovalsForProject(activeOrderId, orderProjectId);
    if (!openApprovals.length) {
        return true;
    }

    const projects = await fetchOrderProjectsForOrder(activeOrderId);
    const project = projects.find(p => p.id === orderProjectId);
    const name = project?.name || openApprovals[0].projectName || 'Projeto';
    const status = getApprovalStatusLabel(normalizeCommercialApproval(openApprovals[0]).status);

    alert(
        `O projeto "${name}" possui solicitação de aprovação comercial em aberto (${status}). ` +
        'Solicite uma revisão ou edite a solicitação existente antes de criar uma nova requisição.'
    );
    return false;
}

async function insertCommercialApprovals(payloads) {
    const selectColumns = 'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt, status';
    let { data, error } = await supabaseClient
        .from('CommercialApproval')
        .insert(payloads)
        .select(selectColumns);

    if (error && payloads.some(p => p.status)) {
        const withoutStatus = payloads.map(({ status, ...rest }) => rest);
        ({ data, error } = await supabaseClient
            .from('CommercialApproval')
            .insert(withoutStatus)
            .select(selectColumns));
    }

    return { error, data: data || [] };
}

function updateCommercialApprovalButtonVisibility() {
    if (typeof updateOrderDetailActionButtons === 'function') {
        updateOrderDetailActionButtons();
        return;
    }

    const btn = document.getElementById('btn-commercial-approval');
    if (btn) {
        btn.classList.toggle('hidden', !canOpenCommercialApprovalModal());
    }
}

async function openCommercialApprovalModal() {
    if (!canOpenCommercialApprovalModal()) {
        alert('Somente Admin ou Projetista pode solicitar aprovação comercial.');
        return;
    }

    if (!activeOrderId) {
        alert('Selecione um pedido primeiro.');
        return;
    }

    editingCommercialApprovalId = null;
    document.getElementById('commercial-approval-modal-title').textContent = 'Solicitar Aprovação Comercial';
    document.getElementById('commercial-approval-form-submit').textContent = 'Salvar Solicitação';
    document.getElementById('commercial-approval-form').reset();
    setupCommercialApprovalFormFields(null, false);

    const { data: approvals } = await queryCommercialApprovals(activeOrderId);
    commercialApprovalsCache = (approvals || []).map(a => normalizeCommercialApproval(a));

    await Promise.all([
        loadApprovalProjetistas(),
        loadApprovalProjectCheckboxes()
    ]);
    toggleModal('commercial-approval-modal', true);
}

async function editCommercialApproval(id) {
    const approval = commercialApprovalsCache.find(a => a.id === id);
    if (!approval || currentUser?.role === 'Consultor' || !canEditCommercialApproval(approval)) return;

    editingCommercialApprovalId = id;
    document.getElementById('commercial-approval-modal-title').textContent = 'Aprovação Comercial';
    document.getElementById('commercial-approval-form-submit').textContent = 'Salvar Alterações';
    document.getElementById('approval-edit-project-name').textContent = approval.projectName || '-';
    setupCommercialApprovalFormFields(approval, true);
    await loadApprovalProjetistas(approval.designerId);
    toggleModal('commercial-approval-modal', true);
}

function closeCommercialApprovalModal() {
    editingCommercialApprovalId = null;
    toggleModal('commercial-approval-modal', false);
}

window.openCommercialApprovalModal = openCommercialApprovalModal;
window.closeCommercialApprovalModal = closeCommercialApprovalModal;
window.editCommercialApproval = editCommercialApproval;

async function approveCommercialApproval(id) {
    let approval = commercialApprovalsCache.find(a => a.id === id);
    if (!approval && typeof ensureApprovalInCache === 'function') {
        approval = await ensureApprovalInCache(id);
    }
    if (!approval || !canApproveCommercialApproval(approval)) return;

    if (!confirm(`Aprovar a solicitação comercial "${approval.projectName}"?`)) return;

    const now = new Date().toISOString();
    let payload = {
        approved: true,
        approvedAt: now,
        status: 'Aprovado'
    };

    setApproveButtonLoading(id, true, 'Aprovando...');

    try {
        let { error } = await supabaseClient
            .from('CommercialApproval')
            .update(payload)
            .eq('id', id);

        if (error && payload.status) {
            const { status, ...payloadWithoutStatus } = payload;
            ({ error } = await supabaseClient
                .from('CommercialApproval')
                .update(payloadWithoutStatus)
                .eq('id', id));
        }

        if (error) {
            alert('Erro ao aprovar solicitação: ' + error.message);
            return;
        }

        setApproveButtonLoading(id, true, 'Enviando notificação por e-mail...');
        await notifyApprovalEmail('approved', {
            ...approval,
            status: 'Aprovado',
            approved: true,
            approvedAt: now
        });

        if (activeOrderId) {
            loadCommercialApprovals(activeOrderId);
        }
        if (typeof refreshApprovalsQueryIfVisible === 'function') {
            refreshApprovalsQueryIfVisible();
        }
    } finally {
        setApproveButtonLoading(id, false);
    }
}

window.approveCommercialApproval = approveCommercialApproval;

function normalizeCommercialApproval(record) {
    return {
        ...record,
        status: record.status || (record.approved ? 'Aprovado' : 'Aguardando Aprovação')
    };
}

function getCommercialApprovalStatusSortOrder(status, role) {
    const normalized = getApprovalStatusLabel(status);
    const orderByRole = role === 'Projetista'
        ? { 'Em revisão': 0, 'Aguardando Aprovação': 1, 'Aprovado': 2 }
        : { 'Aguardando Aprovação': 0, 'Em revisão': 1, 'Aprovado': 2 };

    return orderByRole[normalized] ?? 99;
}

function sortCommercialApprovals(approvals) {
    const role = currentUser?.role;

    return [...approvals].sort((a, b) => {
        const approvalA = normalizeCommercialApproval(a);
        const approvalB = normalizeCommercialApproval(b);
        const statusOrderA = getCommercialApprovalStatusSortOrder(approvalA.status, role);
        const statusOrderB = getCommercialApprovalStatusSortOrder(approvalB.status, role);

        if (statusOrderA !== statusOrderB) return statusOrderA - statusOrderB;
        return (b.id || 0) - (a.id || 0);
    });
}

async function queryCommercialApprovals(orderId) {
    const columnSets = [
        'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt, status, createdAt',
        'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt, status',
        'id, orderId, projectName, designerId, approved, approvedAt, status, createdAt',
        'id, orderId, projectName, designerId, approved, approvedAt, status',
        'id, orderId, projectName, designerId, approved, approvedAt',
        'id, orderId, projectName, designerId, approved',
        '*'
    ];

    let lastError = null;

    for (const columns of columnSets) {
        const result = await supabaseClient
            .from('CommercialApproval')
            .select(columns)
            .eq('orderId', orderId)
            .order('id', { ascending: false });

        if (!result.error) return result;
        lastError = result.error;
    }

    return { data: null, error: lastError };
}

function renderCommercialApprovalActions(approval, { showApprove, showRequestRevision, showEdit }) {
    const buttons = [];

    if (showApprove) {
        buttons.push(`<button type="button" data-approve-btn="${approval.id}" onclick="approveCommercialApproval(${approval.id})"
            class="text-xs bg-emerald-700 text-white hover:bg-emerald-800 px-3 py-1.5 rounded-lg font-medium">Aprovar</button>`);
    }
    if (showRequestRevision) {
        buttons.push(`<button type="button" onclick="openCommercialRevisionModal(${approval.id})"
            class="text-xs bg-sky-700 text-white hover:bg-sky-800 px-3 py-1.5 rounded-lg font-medium">Solicitar Revisão</button>`);
    }
    if (showEdit) {
        buttons.push(`<button type="button" onclick="editCommercialApproval(${approval.id})"
            class="text-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg font-medium">Editar</button>`);
    }

    if (!buttons.length) return '';

    return `<div class="px-4 py-3 bg-white/50 border-t border-white/60 flex flex-wrap gap-2 justify-end">${buttons.join('')}</div>`;
}

function renderCommercialApprovalCard(approval, context) {
    const {
        projetistaNames,
        projectById,
        revisionsByApproval
    } = context;

    const status = getApprovalStatusLabel(approval.status);
    const statusClass = getApprovalStatusBadgeClass(status);
    const showApprove = canApproveCommercialApproval(approval);
    const showEdit = currentUser?.role !== 'Consultor'
        && canEditCommercialApproval(approval)
        && canEditCommercialApprovalCommercialFieldsOnly(approval);
    const showRequestRevision = typeof canRequestNewRevision === 'function' && canRequestNewRevision(approval);
    const revisions = revisionsByApproval[approval.id] || [];
    const revisionsHtml = typeof renderCommercialRevisionsSection === 'function'
        ? renderCommercialRevisionsSection(revisions, approval)
        : '';

    const linkedProject = approval.orderProjectId ? projectById[approval.orderProjectId] : null;
    const environmentName = linkedProject?.environmentType?.name || '';
    const projetistaName = projetistaNames[approval.designerId] || '—';
    const approvalDate = approval.approved && approval.approvedAt
        ? formatDate(approval.approvedAt)
        : '—';
    const revisionsLabel = revisions.length
        ? `${revisions.length} ${revisions.length > 1 ? 'revisões' : 'revisão'}`
        : 'Nenhuma';

    const actionsHtml = renderCommercialApprovalActions(approval, {
        showApprove,
        showRequestRevision,
        showEdit
    });

    const cardBgClass = getCommercialApprovalHighlightBgClass(approval);
    const div = document.createElement('div');
    div.className = `${cardBgClass} rounded-xl border overflow-hidden shadow-sm`;
    div.innerHTML = `
        <div class="px-4 py-3 bg-white/50 border-b border-white/60">
            <div class="flex justify-between items-start gap-3">
                <div class="min-w-0 flex-1">
                    <p class="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Projeto</p>
                    <p class="text-sm font-bold text-slate-900 truncate" title="${approval.projectName || ''}">${approval.projectName || '—'}</p>
                    ${environmentName ? `<p class="text-xs text-slate-500 mt-0.5">${environmentName}</p>` : ''}
                    <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span class="text-slate-600"><span class="text-slate-400">👤 Projetista:</span> <span class="font-medium text-slate-800">${projetistaName}</span></span>
                        <span class="text-slate-600"><span class="text-slate-400">Data de aprovação:</span> <span class="font-medium text-slate-800">${approvalDate}</span></span>
                        <span class="text-slate-600"><span class="text-slate-400">Revisões:</span> <span class="font-medium text-slate-800">${revisionsLabel}</span></span>
                    </div>
                </div>
                <span class="text-[10px] px-2.5 py-1 rounded-full font-bold uppercase whitespace-nowrap shrink-0 ${statusClass}">${status}</span>
            </div>
        </div>
        ${actionsHtml}
        ${revisionsHtml ? `<div class="px-4 pb-4">${revisionsHtml}</div>` : ''}
    `;
    return div;
}

async function loadCommercialApprovals(orderId) {
    const list = document.getElementById('commercial-approvals-list');
    if (!list) return;

    const { data: approvals, error } = await queryCommercialApprovals(orderId);

    if (error) {
        console.error('loadCommercialApprovals:', error);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-4 bg-white rounded-xl border border-red-100">Erro ao carregar aprovações comerciais: ${error.message}</p>`;
        updateOrderTabCounts(0, undefined);
        return;
    }

    if (!approvals || approvals.length === 0) {
        commercialApprovalsCache = [];
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 bg-white rounded-xl border border-emerald-100">Nenhuma aprovação comercial para este pedido.</p>';
        updateOrderTabCounts(0, undefined);
        return;
    }

    commercialApprovalsCache = approvals.map(a => normalizeCommercialApproval(a));
    updateOrderTabCounts(countPendingCommercialApprovals(approvals), undefined);

    const { data: orderInfo } = await supabaseClient
        .from('salesOrders')
        .select('consultantName')
        .eq('id', orderId)
        .maybeSingle();

    if (orderInfo?.consultantName) {
        commercialApprovalsCache = commercialApprovalsCache.map(a => ({
            ...a,
            orderConsultantName: orderInfo.consultantName
        }));
    }

    const designerIds = [...new Set(approvals.map(a => a.designerId).filter(Boolean))];
    const projetistaNames = {};

    if (designerIds.length) {
        const { data: users } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', designerIds);
        users?.forEach(u => { projetistaNames[u.id] = u.name; });
    }

    const approvalIds = approvals.map(a => a.id);
    const revisionsByApproval = typeof fetchCommercialRevisionsByApprovalIds === 'function'
        ? await fetchCommercialRevisionsByApprovalIds(approvalIds)
        : {};

    const projects = typeof fetchOrderProjectsForOrder === 'function'
        ? await fetchOrderProjectsForOrder(orderId)
        : [];
    const projectById = Object.fromEntries(projects.map(p => [p.id, p]));

    list.innerHTML = '';
    list.className = 'space-y-3';

    try {
        sortCommercialApprovals(approvals).forEach(a => {
            const approval = normalizeCommercialApproval(a);
            list.appendChild(renderCommercialApprovalCard(approval, {
                projetistaNames,
                projectById,
                revisionsByApproval
            }));
        });
    } catch (renderError) {
        console.error('loadCommercialApprovals render:', renderError);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-4 bg-white rounded-xl border border-red-100">Erro ao exibir aprovações comerciais: ${renderError.message}</p>`;
    }
}

function setCommercialApprovalFormLoading(isLoading, message = 'Salvando solicitação...') {
    const overlay = document.getElementById('commercial-approval-loading');
    const messageEl = document.getElementById('commercial-approval-loading-msg');
    const submitBtn = document.getElementById('commercial-approval-form-submit');
    const cancelBtn = document.querySelector('#commercial-approval-form button[type="button"]');
    const fields = document.querySelectorAll('#commercial-approval-form input, #commercial-approval-form select');

    overlay?.classList.toggle('hidden', !isLoading);
    if (messageEl) messageEl.textContent = message;
    if (submitBtn) {
        submitBtn.disabled = isLoading;
        submitBtn.classList.toggle('opacity-60', isLoading);
        submitBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    if (cancelBtn) {
        cancelBtn.disabled = isLoading;
        cancelBtn.classList.toggle('opacity-60', isLoading);
        cancelBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    fields.forEach(field => { field.disabled = isLoading; });
}

function setApproveButtonLoading(approvalId, isLoading, message = 'Aprovando...') {
    const btn = document.querySelector(`[data-approve-btn="${approvalId}"]`);
    if (!btn) return;

    if (!btn.dataset.originalText) {
        btn.dataset.originalText = btn.textContent.trim();
    }
    btn.disabled = isLoading;
    btn.textContent = isLoading ? message : btn.dataset.originalText;
    btn.classList.toggle('opacity-60', isLoading);
    btn.classList.toggle('cursor-not-allowed', isLoading);
}

function bindCommercialApprovalEvents() {
    document.getElementById('commercial-approval-form').addEventListener('submit', async function (e) {
        e.preventDefault();

        const designerId = document.getElementById('approval-designer').value;
        const existing = editingCommercialApprovalId
            ? commercialApprovalsCache.find(a => a.id === editingCommercialApprovalId)
            : null;

        if (!designerId) {
            alert('Selecione o projetista.');
            return;
        }

        const isCreateMode = !editingCommercialApprovalId || !existing;
        let selectedProjectIds = [];

        if (isCreateMode) {
            if (!canOpenCommercialApprovalModal()) {
                alert('Somente Admin ou Projetista pode criar aprovação comercial.');
                return;
            }

            selectedProjectIds = getSelectedNewApprovalProjectIds();

            if (!selectedProjectIds.length) {
                alert('Selecione ao menos um projeto que ainda não possui solicitação de aprovação.');
                return;
            }
        }

        setCommercialApprovalFormLoading(true, 'Salvando solicitação...');

        try {
            if (editingCommercialApprovalId && existing) {
                if (!canEditCommercialApprovalCommercialFieldsOnly(existing)) {
                    alert('Esta solicitação não pode mais ser editada.');
                    return;
                }

                const payload = { designerId };
                let { error } = await supabaseClient
                    .from('CommercialApproval')
                    .update(payload)
                    .eq('id', editingCommercialApprovalId);

                if (error) {
                    alert('Erro ao salvar aprovação comercial: ' + error.message);
                    return;
                }
            } else {
                const projects = await fetchOrderProjectsForOrder(activeOrderId);
                const openRequests = await getOpenRequestsForProjects(activeOrderId, selectedProjectIds);

                if (openRequests.length) {
                    const shouldContinue = confirmApprovalDespiteOpenRequests(openRequests, projects);
                    if (!shouldContinue) return;
                }

                const payloads = selectedProjectIds.map(projectId => {
                    const project = projects.find(p => p.id === projectId);
                    return {
                        orderId: activeOrderId,
                        orderProjectId: projectId,
                        projectName: project?.name || '',
                        designerId,
                        approved: false,
                        approvedAt: null,
                        status: 'Aguardando Aprovação'
                    };
                }).filter(p => p.projectName);

                const { error, data: insertedApprovals } = await insertCommercialApprovals(payloads);

                if (error) {
                    alert('Erro ao salvar aprovação comercial: ' + error.message);
                    return;
                }

                setCommercialApprovalFormLoading(true, 'Enviando notificação por e-mail...');
                for (const inserted of insertedApprovals) {
                    await notifyApprovalEmail('approval_requested', normalizeCommercialApproval(inserted));
                }
            }

            closeCommercialApprovalModal();
            document.getElementById('commercial-approval-form').reset();
            loadCommercialApprovals(activeOrderId);
        } finally {
            setCommercialApprovalFormLoading(false);
        }
    });
}
