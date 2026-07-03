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
    return [...document.querySelectorAll('input[name="approval-project"]:checked:not(:disabled)')]
        .map(input => Number(input.value));
}

async function insertCommercialApprovals(payloads) {
    let { error } = await supabaseClient.from('CommercialApproval').insert(payloads);

    if (error && payloads.some(p => p.status)) {
        const withoutStatus = payloads.map(({ status, ...rest }) => rest);
        ({ error } = await supabaseClient.from('CommercialApproval').insert(withoutStatus));
    }

    return error;
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
    if (!approval || !canEditCommercialApproval(approval)) return;

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

    if (activeOrderId) {
        loadCommercialApprovals(activeOrderId);
    }
    if (typeof refreshApprovalsQueryIfVisible === 'function') {
        refreshApprovalsQueryIfVisible();
    }
}

window.approveCommercialApproval = approveCommercialApproval;

function normalizeCommercialApproval(record) {
    return {
        ...record,
        status: record.status || (record.approved ? 'Aprovado' : 'Aguardando Aprovação')
    };
}

async function queryCommercialApprovals(orderId) {
    const columnSets = [
        'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt, status',
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

    list.innerHTML = '';

    try {
        approvals.forEach(a => {
            const approval = normalizeCommercialApproval(a);
            const showApprove = canApproveCommercialApproval(approval);
            const showEdit = canEditCommercialApproval(approval)
                && canEditCommercialApprovalCommercialFieldsOnly(approval);
            const status = getApprovalStatusLabel(approval.status);
            const statusClass = getApprovalStatusBadgeClass(status);
            const showRequestRevision = typeof canRequestNewRevision === 'function' && canRequestNewRevision(approval);
            const showOpenRevision = approval.status === 'Em revisão'
                && typeof canOpenRevisionModal === 'function'
                && canOpenRevisionModal(approval);
            const revisionsHtml = typeof renderCommercialRevisionsSection === 'function'
                ? renderCommercialRevisionsSection(revisionsByApproval[approval.id])
                : '';

            const div = document.createElement('div');
            div.className = 'bg-white p-5 rounded-xl border border-emerald-200 shadow-sm space-y-3';
            div.innerHTML = `
                <div class="flex justify-between items-start border-b border-slate-100 pb-2 gap-3">
                    <div>
                        <p class="text-sm font-bold text-slate-900">${approval.projectName}</p>
                        <p class="text-xs text-slate-500 mt-1">Projetista: ${projetistaNames[approval.designerId] || '-'}</p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 justify-end">
                        ${showApprove ? `<button type="button" onclick="approveCommercialApproval(${approval.id})"
                            class="text-xs bg-emerald-700 text-white hover:bg-emerald-800 px-2.5 py-1 rounded-lg font-medium">Aprovar</button>` : ''}
                        ${showRequestRevision ? `<button type="button" onclick="openCommercialRevisionModal(${approval.id})"
                            class="text-xs bg-sky-700 text-white hover:bg-sky-800 px-2.5 py-1 rounded-lg font-medium">Solicitar Revisão</button>` : ''}
                        ${showOpenRevision ? `<button type="button" onclick="openCommercialRevisionModal(${approval.id})"
                            class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Revisão</button>` : ''}
                        ${showEdit ? `<button type="button" onclick="editCommercialApproval(${approval.id})"
                            class="text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 px-2.5 py-1 rounded-lg font-medium">Editar</button>` : ''}
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${status}</span>
                    </div>
                </div>
                <p class="text-[10px] text-slate-500">Data de aprovação: ${approval.approved && approval.approvedAt ? formatDate(approval.approvedAt) : '—'}</p>
                ${revisionsHtml}
            `;
            list.appendChild(div);
        });
    } catch (renderError) {
        console.error('loadCommercialApprovals render:', renderError);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-4 bg-white rounded-xl border border-red-100">Erro ao exibir aprovações comerciais: ${renderError.message}</p>`;
    }
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
            if (!canOpenCommercialApprovalModal()) {
                alert('Somente Admin ou Projetista pode criar aprovação comercial.');
                return;
            }

            const selectedProjectIds = getSelectedNewApprovalProjectIds();

            if (!selectedProjectIds.length) {
                alert('Selecione ao menos um projeto que ainda não possui solicitação de aprovação.');
                return;
            }

            const projects = await fetchOrderProjectsForOrder(activeOrderId);
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

            const error = await insertCommercialApprovals(payloads);

            if (error) {
                alert('Erro ao salvar aprovação comercial: ' + error.message);
                return;
            }
        }

        closeCommercialApprovalModal();
        document.getElementById('commercial-approval-form').reset();
        loadCommercialApprovals(activeOrderId);
    });
}
