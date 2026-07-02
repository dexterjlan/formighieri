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

function setupCommercialApprovalFormFields(approval) {
    const commercialCanEdit = canEditCommercialApprovalCommercialFieldsOnly(approval);
    const statusWrap = document.getElementById('approval-status-readonly-wrap');
    const statusLabel = document.getElementById('approval-status-readonly-label');

    document.getElementById('approval-project-name').disabled = !commercialCanEdit;
    document.getElementById('approval-designer').disabled = !commercialCanEdit || currentUser?.role === 'Projetista';

    if (approval) {
        statusWrap.classList.remove('hidden');
        statusLabel.textContent = getApprovalStatusLabel(approval.status);
    } else {
        statusWrap.classList.add('hidden');
    }
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

    editingCommercialApprovalId = null;
    document.getElementById('commercial-approval-modal-title').textContent = 'Solicitar Aprovação Comercial';
    document.getElementById('commercial-approval-form-submit').textContent = 'Salvar Solicitação';
    document.getElementById('commercial-approval-form').reset();
    setupCommercialApprovalFormFields(null);
    await loadApprovalProjetistas();
    toggleModal('commercial-approval-modal', true);
}

async function editCommercialApproval(id) {
    const approval = commercialApprovalsCache.find(a => a.id === id);
    if (!approval || !canEditCommercialApproval(approval)) return;

    editingCommercialApprovalId = id;
    document.getElementById('commercial-approval-modal-title').textContent = 'Aprovação Comercial';
    document.getElementById('commercial-approval-form-submit').textContent = 'Salvar Alterações';
    document.getElementById('approval-project-name').value = approval.projectName || '';
    setupCommercialApprovalFormFields(approval);
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

        const projectName = document.getElementById('approval-project-name').value.trim();
        const designerId = document.getElementById('approval-designer').value;
        const existing = editingCommercialApprovalId
            ? commercialApprovalsCache.find(a => a.id === editingCommercialApprovalId)
            : null;
        const commercialCanEdit = isAdminOrOrderConsultorForApproval(existing || { orderId: activeOrderId });

        if (commercialCanEdit && !projectName) {
            alert('Informe o nome do projeto.');
            return;
        }
        if (commercialCanEdit && !designerId) {
            alert('Selecione o projetista.');
            return;
        }

        let payload;

        if (editingCommercialApprovalId && existing) {
            if (!canEditCommercialApprovalCommercialFieldsOnly(existing)) {
                alert('Esta solicitação não pode mais ser editada.');
                return;
            }

            payload = {
                projectName,
                designerId
            };
        } else {
            if (!canOpenCommercialApprovalModal()) {
                alert('Somente Admin ou Projetista pode criar aprovação comercial.');
                return;
            }

            payload = {
                orderId: activeOrderId,
                projectName,
                designerId,
                approved: false,
                approvedAt: null,
                status: 'Aguardando Aprovação'
            };
        }

        let error;
        if (editingCommercialApprovalId) {
            ({ error } = await supabaseClient
                .from('CommercialApproval')
                .update(payload)
                .eq('id', editingCommercialApprovalId));

            if (error && payload.status) {
                const { status, ...payloadWithoutStatus } = payload;
                ({ error } = await supabaseClient
                    .from('CommercialApproval')
                    .update(payloadWithoutStatus)
                    .eq('id', editingCommercialApprovalId));
            }
        } else {
            ({ error } = await supabaseClient
                .from('CommercialApproval')
                .insert([payload]));

            if (error && payload.status) {
                const { status, ...payloadWithoutStatus } = payload;
                ({ error } = await supabaseClient
                    .from('CommercialApproval')
                    .insert([payloadWithoutStatus]));
            }
        }

        if (error) {
            alert('Erro ao salvar aprovação comercial: ' + error.message);
            return;
        }

        closeCommercialApprovalModal();
        document.getElementById('commercial-approval-form').reset();
        loadCommercialApprovals(activeOrderId);
    });
}
