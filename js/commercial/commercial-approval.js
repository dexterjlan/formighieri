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

function setupCommercialApprovalFormFields(approval, isEditMode) {
    const statusWrap = document.getElementById('approval-status-readonly-wrap');
    const statusLabel = document.getElementById('approval-status-readonly-label');
    const createWrap = document.getElementById('approval-create-wrap');
    const editWrap = document.getElementById('approval-edit-wrap');
    const designerReadonlyWrap = document.getElementById('approval-designer-readonly-wrap');
    const submitBtn = document.getElementById('commercial-approval-form-submit');

    if (isEditMode) {
        createWrap.classList.add('hidden');
        editWrap.classList.remove('hidden');
        statusWrap.classList.remove('hidden');
        designerReadonlyWrap?.classList.remove('hidden');
        statusLabel.textContent = getApprovalStatusLabel(approval.status);
        submitBtn?.classList.add('hidden');
        return;
    }

    createWrap.classList.remove('hidden');
    editWrap.classList.add('hidden');
    statusWrap.classList.add('hidden');
    designerReadonlyWrap?.classList.add('hidden');
    submitBtn?.classList.remove('hidden');
}

async function fetchCommercialApprovalProjectDesigner(projectId) {
    if (!projectId) return null;

    let result = await supabaseClient
        .from('OrderProject')
        .select('id, designerId, designer:appUsers!OrderProject_designerId_fkey(id, name)')
        .eq('id', projectId)
        .maybeSingle();

    if (result.error?.message?.includes('designer')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, designerId')
            .eq('id', projectId)
            .maybeSingle();
    }

    if (result.error || !result.data) return null;

    const project = result.data;
    if (project.designer?.name) return project.designer;

    if (project.designerId) {
        const { data: designer } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .eq('id', project.designerId)
            .maybeSingle();
        return designer || { id: project.designerId, name: '—' };
    }

    return null;
}

async function setApprovalDesignerReadonlyLabel(approval) {
    const label = document.getElementById('approval-designer-readonly-label');
    if (!label) return;

    const designer = approval?.orderProjectId
        ? await fetchCommercialApprovalProjectDesigner(approval.orderProjectId)
        : null;

    if (designer?.name) {
        label.textContent = designer.name;
        return;
    }

    if (approval?.designerId) {
        const { data: user } = await supabaseClient
            .from('appUsers')
            .select('name')
            .eq('id', approval.designerId)
            .maybeSingle();
        label.textContent = user?.name || '—';
        return;
    }

    label.textContent = '—';
}

const COMMERCIAL_APPROVAL_PROJECT_STATUS = 'Projeto Técnico';
const COMMERCIAL_APPROVAL_REQUESTED_PROJECT_STATUS = 'Aguardando Aprovação';

async function getAguardandoAprovacaoProjectStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', COMMERCIAL_APPROVAL_REQUESTED_PROJECT_STATUS)
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', COMMERCIAL_APPROVAL_REQUESTED_PROJECT_STATUS)
        .maybeSingle();

    return fallback?.id || null;
}

async function applyAguardandoAprovacaoStatusToProjects(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getAguardandoAprovacaoProjectStatusId();
    if (!statusId) {
        throw new Error(`Status "${COMMERCIAL_APPROVAL_REQUESTED_PROJECT_STATUS}" não encontrado. Cadastre em Gestão → Status de Projeto.`);
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;
}

const COMMERCIAL_REVISION_PROJECT_STATUS = 'Em Revisão';

async function getEmRevisaoProjectStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', COMMERCIAL_REVISION_PROJECT_STATUS)
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', COMMERCIAL_REVISION_PROJECT_STATUS)
        .maybeSingle();

    return fallback?.id || null;
}

async function applyEmRevisaoStatusToProjects(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getEmRevisaoProjectStatusId();
    if (!statusId) {
        throw new Error(`Status "${COMMERCIAL_REVISION_PROJECT_STATUS}" não encontrado. Cadastre em Gestão → Status de Projeto.`);
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;
}

async function resolveCommercialApprovalOrderProjectId(approval) {
    let orderProjectId = approval?.orderProjectId;

    if (!orderProjectId && approval?.id) {
        const { data } = await supabaseClient
            .from('CommercialApproval')
            .select('orderProjectId')
            .eq('id', approval.id)
            .maybeSingle();
        orderProjectId = data?.orderProjectId;
    }

    return orderProjectId ? Number(orderProjectId) : null;
}

async function applyEmRevisaoStatusForCommercialApproval(approval) {
    const orderProjectId = await resolveCommercialApprovalOrderProjectId(approval);
    if (!orderProjectId) return;

    await applyEmRevisaoStatusToProjects([orderProjectId]);
}

async function applyAguardandoAprovacaoStatusForCommercialApproval(approval) {
    const orderProjectId = await resolveCommercialApprovalOrderProjectId(approval);
    if (!orderProjectId) return;

    await applyAguardandoAprovacaoStatusToProjects([orderProjectId]);
}

const COMMERCIAL_APPROVED_PROJECT_STATUS = 'Nomear';

async function getNomearProjectStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', COMMERCIAL_APPROVED_PROJECT_STATUS)
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', COMMERCIAL_APPROVED_PROJECT_STATUS)
        .maybeSingle();

    return fallback?.id || null;
}

async function applyNomearStatusToProjects(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getNomearProjectStatusId();
    if (!statusId) {
        throw new Error(`Status "${COMMERCIAL_APPROVED_PROJECT_STATUS}" não encontrado. Cadastre em Gestão → Status de Projeto.`);
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            nomeado: false,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;
}

async function applyNomearStatusForCommercialApproval(approval) {
    const orderProjectId = await resolveCommercialApprovalOrderProjectId(approval);
    if (!orderProjectId) return;

    await applyNomearStatusToProjects([orderProjectId]);
}

function getCommercialApprovalProjectStatusName(project) {
    return project?.projectStatus?.name || '';
}

async function enrichCommercialApprovalProjectsWithStatus(projects) {
    if (!projects.length) return projects;

    const needsEnrich = projects.some(project => project.statusId && !project.projectStatus);
    if (!needsEnrich) return projects;

    const statusIds = [...new Set(projects.map(project => project.statusId).filter(Boolean))];
    if (!statusIds.length) return projects;

    const { data: statuses, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name')
        .in('id', statusIds);

    if (error) {
        console.error('enrichCommercialApprovalProjectsWithStatus:', error);
        return projects;
    }

    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
    return projects.map(project => ({
        ...project,
        projectStatus: project.projectStatus || statusById[project.statusId] || null
    }));
}

async function loadApprovalProjetistas() {
    // Responsável definido no cadastro do projeto.
}

async function fetchCommercialApprovalEligibleProjects(orderId) {
    let result = await supabaseClient
        .from('OrderProject')
        .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), designer:appUsers!OrderProject_designerId_fkey(id, name)')
        .eq('orderId', orderId)
        .order('createdAt', { ascending: true });

    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('statusId') || result.error?.message?.includes('designer')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name)')
            .eq('orderId', orderId)
            .order('createdAt', { ascending: true });
    }

    if (result.error) {
        console.error('fetchCommercialApprovalEligibleProjects:', result.error);
        return [];
    }

    const projects = await enrichCommercialApprovalProjectsWithStatus(result.data || []);
    const designerIds = [...new Set(projects.map(project => project.designerId).filter(Boolean))];
    let designerById = {};

    if (designerIds.length) {
        const { data: designers } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', designerIds);
        designerById = Object.fromEntries((designers || []).map(designer => [designer.id, designer]));
    }

    const enrichedProjects = projects.map(project => ({
        ...project,
        designer: project.designer || designerById[project.designerId] || null
    }));

    const statusFiltered = enrichedProjects.filter(project =>
        getCommercialApprovalProjectStatusName(project) === COMMERCIAL_APPROVAL_PROJECT_STATUS
    );

    if (currentUser?.role === 'Projetista') {
        return statusFiltered.filter(project => Number(project.designerId) === Number(currentUser.id));
    }

    return statusFiltered;
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
    const isProjetista = currentUser?.role === 'Projetista';
    const projects = await fetchCommercialApprovalEligibleProjects(activeOrderId);

    if (!projects.length) {
        container.innerHTML = `<p class="text-xs text-slate-400 text-center py-2">${isProjetista
            ? `Nenhum projeto seu com status ${COMMERCIAL_APPROVAL_PROJECT_STATUS} disponível para solicitar aprovação.`
            : `Nenhum projeto com status ${COMMERCIAL_APPROVAL_PROJECT_STATUS} disponível para solicitar aprovação.`}</p>`;
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
        const designerName = project.designer?.name || 'Sem responsável';
        const canSelect = hasApproval || Boolean(project.designerId);
        const showDesignerName = !isProjetista;

        const label = document.createElement('label');
        label.className = `flex items-center gap-2 px-2 py-1.5 rounded-md border ${hasApproval ? 'border-emerald-200 bg-emerald-50/60' : canSelect ? 'border-slate-200 bg-white cursor-pointer hover:bg-white' : 'border-slate-200 bg-slate-50 opacity-70'} transition`;

        label.innerHTML = `
            <input type="checkbox" name="approval-project" value="${project.id}"
                data-project-name="${project.name.replace(/"/g, '&quot;')}"
                data-designer-id="${project.designerId || ''}"
                ${hasApproval ? 'data-existing-approval="true"' : ''}
                class="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 shrink-0"
                ${hasApproval ? 'checked disabled' : !canSelect ? 'disabled' : ''}>
            <span class="flex-1 min-w-0 text-xs leading-tight">
                <span class="font-semibold text-slate-800">${escapeHtml(project.name)}</span>
                ${showDesignerName ? `<span class="text-slate-400"> · ${escapeHtml(designerName)}</span>` : ''}
                ${hasApproval ? `<span class="text-[10px] text-emerald-700 font-medium"> · ${statusLabel}</span>` : ''}
                ${showDesignerName && !hasApproval && !project.designerId ? '<span class="text-[10px] text-amber-700 font-medium"> · Cadastre o responsável no projeto</span>' : ''}
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

async function submitCommercialApprovalFromPendencias(projectId) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return;

    let result = await supabaseClient
        .from('OrderProject')
        .select('id, orderId, name, designerId, statusId, projectStatus:OrderProjectStatus(id, name)')
        .eq('id', normalizedId)
        .maybeSingle();

    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('OrderProjectStatus')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, name, designerId, statusId')
            .eq('id', normalizedId)
            .maybeSingle();
    }

    if (result.error || !result.data) {
        alert('Projeto não encontrado.');
        return;
    }

    const project = await enrichCommercialApprovalProjectsWithStatus([result.data]);
    const enrichedProject = project[0];
    const statusName = getCommercialApprovalProjectStatusName(enrichedProject);

    if (statusName !== COMMERCIAL_APPROVAL_PROJECT_STATUS) {
        alert('Este projeto não está mais em Projeto Técnico.');
        return;
    }

    if (currentUser?.role === 'Projetista'
        && Number(enrichedProject.designerId) !== Number(currentUser.id)) {
        alert('Sem permissão para enviar este projeto para aprovação.');
        return;
    }

    if (!enrichedProject.designerId) {
        alert('Projeto sem responsável cadastrado.');
        return;
    }

    const openApprovals = await getOpenCommercialApprovalsForProject(
        enrichedProject.orderId,
        normalizedId
    );
    if (openApprovals.length) {
        const status = getApprovalStatusLabel(normalizeCommercialApproval(openApprovals[0]).status);
        alert(`Já existe solicitação de aprovação em aberto (${status}).`);
        return;
    }

    if (!confirm(`Enviar o projeto "${enrichedProject.name}" para aprovação comercial?`)) {
        return;
    }

    const openRequests = await getOpenRequestsForProjects(enrichedProject.orderId, [normalizedId]);
    if (openRequests.length) {
        const allOrderProjects = typeof fetchOrderProjectsForOrder === 'function'
            ? await fetchOrderProjectsForOrder(enrichedProject.orderId)
            : [enrichedProject];
        const shouldContinue = confirmApprovalDespiteOpenRequests(openRequests, allOrderProjects);
        if (!shouldContinue) return;
    }

    try {
        const payload = {
            orderId: enrichedProject.orderId,
            orderProjectId: normalizedId,
            projectName: enrichedProject.name,
            designerId: enrichedProject.designerId,
            approved: false,
            approvedAt: null,
            status: 'Aguardando Aprovação'
        };

        const { error, data: insertedApprovals } = await insertCommercialApprovals([payload]);
        if (error) {
            alert('Erro ao enviar para aprovação: ' + error.message);
            return;
        }

        await applyAguardandoAprovacaoStatusToProjects([normalizedId]);

        for (const inserted of insertedApprovals) {
            await notifyApprovalEmail('approval_requested', normalizeCommercialApproval(inserted));
        }

        if (typeof loadPendenciasProjetoTecnico === 'function'
            && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
            await loadPendenciasProjetoTecnico();
        }
        if (Number(activeOrderId) === Number(enrichedProject.orderId)) {
            if (typeof loadCommercialApprovals === 'function') {
                await loadCommercialApprovals(activeOrderId);
            }
            if (typeof loadOrderProjects === 'function') {
                await loadOrderProjects(activeOrderId);
            }
        }
    } catch (error) {
        alert('Erro ao enviar para aprovação: ' + error.message);
    }
}

window.submitCommercialApprovalFromPendencias = submitCommercialApprovalFromPendencias;

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

    await loadApprovalProjectCheckboxes();
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
    await setApprovalDesignerReadonlyLabel(approval);
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

        setApproveButtonLoading(id, true, 'Atualizando status do projeto...');
        if (typeof applyNomearStatusForCommercialApproval === 'function') {
            await applyNomearStatusForCommercialApproval(approval);
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
            if (typeof loadOrderProjects === 'function') {
                await loadOrderProjects(activeOrderId);
            }
            if (typeof loadNomearProjects === 'function' && canSeeOrderNomearTab()) {
                await loadNomearProjects(activeOrderId);
            }
        }
        if (typeof refreshApprovalsQueryIfVisible === 'function') {
            refreshApprovalsQueryIfVisible();
        }
        if (typeof loadPendenciasConsultorAguardandoAprovacao === 'function'
            && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
            await loadPendenciasConsultorAguardandoAprovacao();
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
    div.className = `${cardBgClass} collapsible-list-card rounded-xl border overflow-hidden shadow-sm`;
    div.innerHTML = `
        <div class="collapsible-list-header px-4 py-3 bg-white/50 border-b border-white/60 cursor-pointer">
            <div class="flex justify-between items-start gap-3">
                <div class="flex items-start gap-2 min-w-0 flex-1">
                    <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px] mt-0.5"
                        aria-label="Expandir">▶</button>
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
                </div>
                <span class="text-[10px] px-2.5 py-1 rounded-full font-bold uppercase whitespace-nowrap shrink-0 ${statusClass}">${status}</span>
            </div>
        </div>
        <div class="collapsible-list-body hidden">
            ${actionsHtml}
            ${revisionsHtml ? `<div class="px-4 pb-4">${revisionsHtml}</div>` : ''}
        </div>
    `;
    return div;
}

async function loadCommercialApprovals(orderId) {
    await ensureSystemSettingsLoaded();

    const list = document.getElementById('commercial-approvals-list');
    if (!list) return;

    try {
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

        sortCommercialApprovals(approvals).forEach(a => {
            const approval = normalizeCommercialApproval(a);
            list.appendChild(renderCommercialApprovalCard(approval, {
                projetistaNames,
                projectById,
                revisionsByApproval
            }));
        });

        bindCollapsibleListCardToggles(list);
    } catch (renderError) {
        console.error('loadCommercialApprovals render:', renderError);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-4 bg-white rounded-xl border border-red-100">Erro ao exibir aprovações comerciais: ${renderError.message}</p>`;
    } finally {
        if (typeof refreshOrdersListSummary === 'function') {
            await refreshOrdersListSummary();
        }
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

        const existing = editingCommercialApprovalId
            ? commercialApprovalsCache.find(a => a.id === editingCommercialApprovalId)
            : null;

        if (editingCommercialApprovalId && existing) {
            return;
        }

        const isCreateMode = true;
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
            const projects = await fetchCommercialApprovalEligibleProjects(activeOrderId);
            const projectsWithoutDesigner = selectedProjectIds.filter(projectId => {
                const project = projects.find(item => Number(item.id) === Number(projectId));
                return !project?.designerId;
            });

            if (projectsWithoutDesigner.length) {
                alert('Todos os projetos selecionados precisam ter responsável cadastrado no projeto.');
                return;
            }

            const allOrderProjects = await fetchOrderProjectsForOrder(activeOrderId);
            const openRequests = await getOpenRequestsForProjects(activeOrderId, selectedProjectIds);

            if (openRequests.length) {
                const shouldContinue = confirmApprovalDespiteOpenRequests(openRequests, allOrderProjects);
                if (!shouldContinue) return;
            }

            const payloads = selectedProjectIds.map(projectId => {
                const project = projects.find(item => Number(item.id) === Number(projectId));
                return {
                    orderId: activeOrderId,
                    orderProjectId: projectId,
                    projectName: project?.name || '',
                    designerId: project?.designerId,
                    approved: false,
                    approvedAt: null,
                    status: 'Aguardando Aprovação'
                };
            }).filter(payload => payload.projectName && payload.designerId);

            if (!payloads.length) {
                alert('Não foi possível montar as solicitações com o responsável dos projetos.');
                return;
            }

            const { error, data: insertedApprovals } = await insertCommercialApprovals(payloads);

            if (error) {
                alert('Erro ao salvar aprovação comercial: ' + error.message);
                return;
            }

            await applyAguardandoAprovacaoStatusToProjects(selectedProjectIds);

            setCommercialApprovalFormLoading(true, 'Enviando notificação por e-mail...');
            for (const inserted of insertedApprovals) {
                await notifyApprovalEmail('approval_requested', normalizeCommercialApproval(inserted));
            }

            closeCommercialApprovalModal();
            document.getElementById('commercial-approval-form').reset();
            loadCommercialApprovals(activeOrderId);
            if (typeof loadOrderProjects === 'function' && activeOrderId) {
                await loadOrderProjects(activeOrderId);
            }
        } catch (error) {
            alert('Erro ao salvar solicitação: ' + error.message);
        } finally {
            setCommercialApprovalFormLoading(false);
        }
    });
}
