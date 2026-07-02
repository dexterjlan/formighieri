function canEditCommercialApprovalCommercialFields() {
    return currentUser?.role === 'Admin' || currentUser?.role === 'Consultor';
}

function canEditCommercialApprovalDesignerResponse(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role === 'Projetista' && approval?.designerId === currentUser.id) return true;
    return false;
}

function canOpenCommercialApprovalModal() {
    return canEditCommercialApprovalCommercialFields();
}

function canEditCommercialApproval(approval) {
    if (canEditCommercialApprovalCommercialFields()) return true;
    if (canEditCommercialApprovalDesignerResponse(approval)) return true;
    return false;
}

async function loadApprovalProjetistas(selectedId) {
    const select = document.getElementById("approval-designer");
    select.disabled = false;
    select.classList.remove('bg-slate-100', 'cursor-not-allowed');

    if (currentUser?.role === 'Projetista' && !canEditCommercialApprovalCommercialFields()) {
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

function updateApprovalApprovedAtDisplay(approved, approvedAt) {
    const display = document.getElementById('approval-approved-at-display');
    if (approved && approvedAt) {
        display.textContent = formatDate(approvedAt);
    } else if (approved) {
        display.textContent = formatDate(new Date().toISOString());
    } else {
        display.textContent = '—';
    }
}

function setupCommercialApprovalFormFields(approval) {
    const isEdit = Boolean(approval);
    const commercialCanEdit = canEditCommercialApprovalCommercialFields();
    const designerCanEdit = canEditCommercialApprovalDesignerResponse(approval || {});

    document.getElementById('approval-project-name').disabled = !commercialCanEdit;
    document.getElementById('approval-designer').disabled =
        !commercialCanEdit || currentUser?.role === 'Projetista';
    document.getElementById('approval-commercial-revision').disabled = !commercialCanEdit;
    document.getElementById('approval-designer-response').disabled = !designerCanEdit;
    document.getElementById('approval-approved').disabled = !commercialCanEdit;

    const approvedCheckbox = document.getElementById('approval-approved');
    approvedCheckbox.onchange = function () {
        if (this.checked) {
            const existing = approval?.approvedAt;
            updateApprovalApprovedAtDisplay(true, existing || new Date().toISOString());
        } else {
            updateApprovalApprovedAtDisplay(false, null);
        }
    };
}

function updateCommercialApprovalButtonVisibility() {
    const btn = document.getElementById('btn-commercial-approval');
    if (btn) {
        btn.classList.toggle('hidden', !canOpenCommercialApprovalModal());
    }
}

async function openCommercialApprovalModal() {
    if (!canOpenCommercialApprovalModal()) {
        alert('Somente Admin ou Consultor pode solicitar aprovação comercial.');
        return;
    }

    editingCommercialApprovalId = null;
    document.getElementById('commercial-approval-modal-title').textContent = 'Solicitar Aprovação Comercial';
    document.getElementById('commercial-approval-form-submit').textContent = 'Salvar Solicitação';
    document.getElementById('commercial-approval-form').reset();
    updateApprovalApprovedAtDisplay(false, null);
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
    document.getElementById('approval-commercial-revision').value = approval.commercialRevisionRequest || '';
    document.getElementById('approval-designer-response').value = approval.designerRevisionResponse || '';
    document.getElementById('approval-approved').checked = approval.approved === true;
    updateApprovalApprovedAtDisplay(approval.approved, approval.approvedAt);
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

async function loadCommercialApprovals(orderId) {
    const { data: approvals, error } = await supabaseClient
        .from('CommercialApproval')
        .select('*')
        .eq('orderId', orderId)
        .order('createdAt', { ascending: false });

    const list = document.getElementById('commercial-approvals-list');

    if (error) {
        list.innerHTML = '<p class="text-xs text-red-500 text-center py-4 bg-white rounded-xl border border-red-100">Erro ao carregar aprovações comerciais.</p>';
        return;
    }

    if (!approvals || approvals.length === 0) {
        commercialApprovalsCache = [];
        list.innerHTML = '';
        return;
    }

    commercialApprovalsCache = approvals;

    const designerIds = [...new Set(approvals.map(a => a.designerId).filter(Boolean))];
    const projetistaNames = {};

    if (designerIds.length) {
        const { data: users } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', designerIds);
        users?.forEach(u => { projetistaNames[u.id] = u.name; });
    }

    list.innerHTML = `
        <div class="flex items-center justify-between">
            <h4 class="text-sm font-bold text-slate-900">Aprovações Comerciais</h4>
        </div>
    `;

    approvals.forEach(a => {
        const canEdit = canEditCommercialApproval(a);
        const approvedBadge = a.approved
            ? '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-100 text-emerald-800">Aprovado</span>'
            : '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-amber-100 text-amber-800">Pendente</span>';

        const div = document.createElement('div');
        div.className = 'bg-white p-5 rounded-xl border border-emerald-200 shadow-sm space-y-3';
        div.innerHTML = `
            <div class="flex justify-between items-start border-b border-slate-100 pb-2">
                <div>
                    <p class="text-sm font-bold text-slate-900">${a.projectName}</p>
                    <p class="text-xs text-slate-500 mt-1">Projetista: ${projetistaNames[a.designerId] || '-'}</p>
                </div>
                <div class="flex items-center gap-2">
                    ${canEdit ? `<button type="button" onclick="editCommercialApproval(${a.id})"
                        class="text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 px-2.5 py-1 rounded-lg font-medium">Editar</button>` : ''}
                    ${approvedBadge}
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div class="bg-slate-50 p-3 rounded-lg">
                    <p class="font-bold text-slate-400 uppercase text-[9px] mb-1">Revisão (Comercial)</p>
                    <p class="text-slate-800">${a.commercialRevisionRequest || '—'}</p>
                </div>
                <div class="bg-slate-50 p-3 rounded-lg">
                    <p class="font-bold text-slate-400 uppercase text-[9px] mb-1">Resposta (Projetista)</p>
                    <p class="text-slate-800">${a.designerRevisionResponse || '—'}</p>
                </div>
            </div>
            <p class="text-[10px] text-slate-500">Data de aprovação: ${a.approved && a.approvedAt ? formatDate(a.approvedAt) : '—'}</p>
        `;
        list.appendChild(div);
    });
}

function bindCommercialApprovalEvents() {
    document.getElementById('commercial-approval-form').addEventListener('submit', async function (e) {
        e.preventDefault();

        const projectName = document.getElementById('approval-project-name').value.trim();
        const designerId = document.getElementById('approval-designer').value;
        const commercialCanEdit = canEditCommercialApprovalCommercialFields();
        const existing = editingCommercialApprovalId
            ? commercialApprovalsCache.find(a => a.id === editingCommercialApprovalId)
            : null;
        const designerCanEdit = canEditCommercialApprovalDesignerResponse(existing || {});

        if (commercialCanEdit && !projectName) {
            alert('Informe o nome do projeto.');
            return;
        }
        if (commercialCanEdit && !designerId) {
            alert('Selecione o projetista.');
            return;
        }

        const now = new Date().toISOString();
        let payload;

        if (editingCommercialApprovalId && existing) {
            payload = {
                updatedAt: now,
                updatedById: currentUser.id
            };

            if (commercialCanEdit) {
                payload.projectName = projectName;
                payload.designerId = designerId;
                payload.commercialRevisionRequest =
                    document.getElementById('approval-commercial-revision').value.trim() || null;
                payload.approved = document.getElementById('approval-approved').checked;
                if (payload.approved) {
                    payload.approvedAt = existing.approved && existing.approvedAt
                        ? existing.approvedAt
                        : now;
                } else {
                    payload.approvedAt = null;
                }
            }

            if (designerCanEdit) {
                payload.designerRevisionResponse =
                    document.getElementById('approval-designer-response').value.trim() || null;
            }
        } else {
            if (!commercialCanEdit) {
                alert('Somente Admin ou Consultor pode criar aprovação comercial.');
                return;
            }

            const approved = document.getElementById('approval-approved').checked;
            payload = {
                orderId: activeOrderId,
                projectName,
                designerId,
                commercialRevisionRequest:
                    document.getElementById('approval-commercial-revision').value.trim() || null,
                designerRevisionResponse:
                    document.getElementById('approval-designer-response').value.trim() || null,
                approved,
                approvedAt: approved ? now : null,
                createdById: currentUser.id,
                updatedById: currentUser.id
            };
        }

        let error;
        if (editingCommercialApprovalId) {
            ({ error } = await supabaseClient
                .from('CommercialApproval')
                .update(payload)
                .eq('id', editingCommercialApprovalId));
        } else {
            ({ error } = await supabaseClient
                .from('CommercialApproval')
                .insert([payload]));
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
