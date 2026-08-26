function getOrderConsultantNameForApproval(approval) {
    if (!approval) return null;
    if (approval.orderConsultantName) return approval.orderConsultantName;
    if (approval.order) return getOrderConsultantNameFromRecord(approval.order) || null;
    if (approval.orderId && typeof ordersCache !== 'undefined') {
        const order = ordersCache.find(o => o.id === approval.orderId);
        return getOrderConsultantNameFromRecord(order) || null;
    }
    return null;
}

function isAdminOrOrderConsultorForApproval(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Consultor') return false;

    return isCurrentUserOrderConsultor(
        getOrderConsultantNameForApproval(approval),
        approval.order?.consultantUserId ?? null
    );
}

function canAccessCommercialRevision(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (typeof isGestorComercial === 'function' && isGestorComercial()) return true;
    return isAdminOrOrderConsultorForApproval(approval);
}
window.canAccessCommercialRevision = canAccessCommercialRevision;

function canEditCommercialApprovalCommercialFields(approval) {
    return isAdminOrOrderConsultorForApproval(approval || { orderId: activeOrderId });
}

function canApproveCommercialApproval(approval) {
    if (!approval) return false;
    if (!isAdminOrOrderConsultorForApproval(approval)) return false;

    const projectStatusName = getCommercialApprovalProjectStatusName(approval);
    if (isOrderProjectEmRevisaoComercialConsStatus(projectStatusName) || projectStatusName === 'Aguardando Aprovação') {
        return true;
    }

    return !approval.approved && approval.status !== 'Aprovado';
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
const COMMERCIAL_APPROVAL_REQUESTED_PROJECT_STATUS = ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS;

async function getEmRevisaoComercialProjectStatusId() {
    const candidateNames = [
        ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS,
        ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_COMERCIAL
    ];

    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name')
        .in('name', candidateNames)
        .eq('isActive', true);

    if (!error && data?.length) {
        for (const targetName of candidateNames) {
            const found = data.find(item => item.name === targetName);
            if (found) return found.id;
        }
    }

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name')
        .in('name', candidateNames);

    if (fallback?.length) {
        for (const targetName of candidateNames) {
            const found = fallback.find(item => item.name === targetName);
            if (found) return found.id;
        }
    }

    return null;
}

async function getAguardandoAprovacaoProjectStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Aguardando Aprovação')
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Aguardando Aprovação')
        .maybeSingle();

    return fallback?.id || null;
}

async function applyEmRevisaoComercialStatusToProjects(orderProjectIds, options = {}) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    let statusId = await getEmRevisaoComercialProjectStatusId();
    if (!statusId) {
        statusId = await getAguardandoAprovacaoProjectStatusId();
    }
    if (!statusId) {
        throw new Error(`Status "${ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS}" não encontrado.`);
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;

    const { data: projects, error: fetchError } = await supabaseClient
        .from('OrderProject')
        .select('id, technicalProjectCompletedDate')
        .in('id', uniqueIds);

    if (fetchError?.message?.includes('technicalProjectCompletedDate')) {
        await notifyOrderProjectStatusChangeForProjects(uniqueIds, ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS, options);
        return;
    }

    if (fetchError) throw fetchError;

    const idsNeedingConclusao = (projects || [])
        .filter(project => !project.technicalProjectCompletedDate)
        .map(project => project.id);

    if (idsNeedingConclusao.length) {
        const { error: conclusaoError } = await supabaseClient
            .from('OrderProject')
            .update({
                technicalProjectCompletedDate: today,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .in('id', idsNeedingConclusao)
            .is('technicalProjectCompletedDate', null);

        if (conclusaoError?.message?.includes('technicalProjectCompletedDate')) {
            await notifyOrderProjectStatusChangeForProjects(uniqueIds, ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS, options);
            return;
        }

        if (conclusaoError) throw conclusaoError;
    }

    await notifyOrderProjectStatusChangeForProjects(uniqueIds, ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS, options);
}

async function applyAguardandoAprovacaoStatusToProjects(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getAguardandoAprovacaoProjectStatusId();
    if (!statusId) {
        throw new Error(`Status "Aguardando Aprovação" não encontrado.`);
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

    await notifyOrderProjectStatusChangeForProjects(uniqueIds, 'Aguardando Aprovação');
}

const COMMERCIAL_REVISION_PROJECT_STATUS = ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ;

async function getEmRevisaoProjectStatusId() {
    const candidateNames = [
        ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ,
        ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_TECNICA,
        ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_COMERCIAL,
        'Em Revisão',
        'Em revisão'
    ];
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name')
        .in('name', candidateNames)
        .eq('isActive', true);

    if (!error && data?.length) {
        for (const targetName of candidateNames) {
            const found = data.find(item => item.name === targetName);
            if (found) return found.id;
        }
    }

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name')
        .in('name', candidateNames);

    if (fallback?.length) {
        for (const targetName of candidateNames) {
            const found = fallback.find(item => item.name === targetName);
            if (found) return found.id;
        }
    }

    return null;
}

async function applyEmRevisaoStatusToProjects(orderProjectIds, options = {}) {
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

    await notifyOrderProjectStatusChangeForProjects(uniqueIds, COMMERCIAL_REVISION_PROJECT_STATUS, options);
}

async function resolveCommercialApprovalOrderProjectId(approval) {
    if (approval?.orderProjectId) return Number(approval.orderProjectId);
    if (approval?.id) return Number(approval.id);
    return null;
}

async function applyEmRevisaoStatusForCommercialApproval(approval, options = {}) {
    const orderProjectId = await resolveCommercialApprovalOrderProjectId(approval);
    if (!orderProjectId) return;

    await applyEmRevisaoStatusToProjects([orderProjectId], options);
}

async function applyAguardandoAprovacaoStatusForCommercialApproval(approval) {
    const orderProjectId = await resolveCommercialApprovalOrderProjectId(approval);
    if (!orderProjectId) return;

    await applyAguardandoAprovacaoStatusToProjects([orderProjectId]);
}

async function applyEmRevisaoComercialStatusForCommercialApproval(approval, options = {}) {
    const orderProjectId = await resolveCommercialApprovalOrderProjectId(approval);
    if (!orderProjectId) return;

    await applyEmRevisaoComercialStatusToProjects([orderProjectId], options);
}

window.applyEmRevisaoComercialStatusForCommercialApproval = applyEmRevisaoComercialStatusForCommercialApproval;

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
            isNamed: false,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;

    await notifyOrderProjectStatusChangeForProjects(uniqueIds, COMMERCIAL_APPROVED_PROJECT_STATUS);
}

async function applyNomearStatusForCommercialApproval(approval) {
    const orderProjectId = await resolveCommercialApprovalOrderProjectId(approval);
    if (!orderProjectId) return;

    await applyNomearStatusToProjects([orderProjectId]);
}

async function applyApprovedStatusForCommercialApproval(approval) {
    const orderProjectId = await resolveCommercialApprovalOrderProjectId(approval);
    if (!orderProjectId) return;

    const { data: project } = await supabaseClient
        .from('OrderProject')
        .select('id, statusId, projectStatus:OrderProjectStatus(id, name)')
        .eq('id', orderProjectId)
        .maybeSingle();

    const currentStatusName = project?.projectStatus?.name || '';

    if (isOrderProjectEmRevisaoComercialConsStatus(currentStatusName)
        || isOrderProjectEmRevisaoComercialProjStatus(currentStatusName)) {
        await applyAguardandoAprovacaoStatusToProjects([orderProjectId]);
    } else if (currentStatusName === 'Aguardando Aprovação') {
        if (typeof applyTechnicalReviewerReviewRevisorStatusToProjects === 'function') {
            await applyTechnicalReviewerReviewRevisorStatusToProjects([orderProjectId]);
        } else {
            await applyNomearStatusToProjects([orderProjectId]);
        }
    } else {
        await applyNomearStatusToProjects([orderProjectId]);
    }
}

function getCommercialApprovalProjectStatusName(project) {
    if (!project) return '';
    if (project.projectStatus?.name) return project.projectStatus.name;
    if (project.project?.projectStatus?.name) return project.project.projectStatus.name;
    if (project.orderProject?.projectStatus?.name) return project.orderProject.projectStatus.name;

    const orderProjectId = project.orderProjectId || project.id;
    if (orderProjectId && typeof orderProjectsCache !== 'undefined' && Array.isArray(orderProjectsCache)) {
        const proj = orderProjectsCache.find(p => Number(p.id) === Number(orderProjectId));
        if (proj?.projectStatus?.name) return proj.projectStatus.name;
    }
    return '';
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
        const canSelect = (hasApproval || Boolean(project.designerId)) && canActOnOrderProject(project);
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
                ${renderComplementarProjectNoticeHtml(project)}
                ${renderReplacedProjectNoticeHtml(project)}
                ${renderReplacementProjectNoticeHtml(project)}
                ${showDesignerName ? `<span class="text-slate-400"> · ${escapeHtml(designerName)}</span>` : ''}
                ${hasApproval ? `<span class="text-[10px] text-emerald-700 font-medium"> · ${statusLabel}</span>` : ''}
                ${showDesignerName && !hasApproval && !project.designerId && canActOnOrderProject(project) ? '<span class="text-[10px] text-amber-700 font-medium"> · Cadastre o responsável no projeto</span>' : ''}
                ${!canActOnOrderProject(project) ? '<span class="text-[10px] text-sky-700 font-medium"> · Projeto vinculado sem ações</span>' : ''}
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

    let { data, error } = await supabaseClient
        .from('OrderRequest')
        .select('id, orderProjectId, status, requestProfile, requestType')
        .eq('orderId', orderId)
        .in('orderProjectId', projectIds);

    if (error?.message?.includes('requestType')) {
        ({ data, error } = await supabaseClient
            .from('OrderRequest')
            .select('id, orderProjectId, status, requestProfile')
            .eq('orderId', orderId)
            .in('orderProjectId', projectIds));
    }

    if (error) {
        if (error.message?.includes('orderProjectId')) return [];
        console.error('getOpenRequestsForProjects:', error);
        return [];
    }

    return (data || []).filter(req => isRequestOpen(req) && isProjectRequest(req));
}

async function blockCommercialApprovalWhenOpenRequests(orderId, projectIds) {
    const openRequests = await getOpenRequestsForProjects(orderId, projectIds);
    if (!openRequests.length) {
        return true;
    }

    const projects = typeof fetchOrderProjectsForOrder === 'function'
        ? await fetchOrderProjectsForOrder(orderId)
        : [];
    const lines = openRequests.map(req => {
        const project = projects.find(item => Number(item.id) === Number(req.orderProjectId));
        const name = project?.name || 'Projeto';
        const status = normalizeRequestStatus(req);
        return `• ${name} (${status})`;
    });

    alertAppDialog(
        `Não é possível enviar para aprovação comercial enquanto houver requisições em aberto:\n\n${lines.join('\n')}`,
        { variant: 'warning', title: 'Requisições em aberto' }
    );
    return false;
}

async function confirmApprovalDespiteOpenRequests(openRequests, projects) {
    const lines = openRequests.map(req => {
        const project = projects.find(p => p.id === req.orderProjectId);
        const name = project?.name || 'Projeto';
        const status = normalizeRequestStatus(req);
        return `• ${name} (${status})`;
    });

    return await confirmAppDialog(
        `Os projetos abaixo possuem requisições em aberto:\n\n${lines.join('\n')}\n\nDeseja solicitar aprovação comercial mesmo assim?`,
        {
            title: 'Requisições em aberto',
            confirmLabel: 'Continuar mesmo assim',
            variant: 'warning'
        }
    );
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
    const name = project?.name || getCommercialApprovalProjectName(openApprovals[0]) || 'Projeto';
    const status = getApprovalStatusLabel(normalizeCommercialApproval(openApprovals[0]).status);

    alertAppDialog(
        `O projeto "${name}" possui solicitação de aprovação comercial em aberto (${status}). ` +
        'Solicite uma revisão ou edite a solicitação existente antes de criar uma nova requisição.'
    );
    return false;
}

async function insertCommercialApprovals() {
    return { error: null, data: [] };
}

let aprovacaoCaminhoModalResolver = null;
let pendingCommercialApprovalOrderDeliveryApprovalId = null;
let commercialApprovalOrderDeliveryContext = null;

function commercialApprovalOrderHasPhases(phases = commercialApprovalOrderDeliveryContext?.phases) {
    return (phases || []).length >= 2;
}

function resolveCommercialApprovalProjectPhase(project, phases) {
    if (typeof getGestaoProjectDeliveryPhase === 'function') {
        return getGestaoProjectDeliveryPhase(project, phases);
    }

    const phaseId = Number(project?.deliveryPhaseId);
    if (phaseId) {
        const phase = (phases || []).find(item => Number(item.id) === phaseId);
        if (phase) return phase;
    }

    return phases?.[0] || null;
}

async function fetchOrderProjectsForCommercialApprovalPhase(orderId, phase, phases) {
    const normalizedOrderId = Number(orderId);
    const phaseId = Number(phase?.id);
    if (!normalizedOrderId || !phaseId) return [];

    const selectVariants = [
        'id, name, deliveryDate, deliveryPhaseId, isComplementary, isReplaced',
        'id, name, deliveryDate, deliveryPhaseId',
        'id, name, deliveryDate'
    ];

    for (const columns of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(columns)
            .eq('orderId', normalizedOrderId);

        if (error) continue;

        return (data || [])
            .filter(project => {
                if (project.isComplementary || project.isReplaced) return false;
                const resolved = resolveCommercialApprovalProjectPhase(project, phases);
                return Number(resolved?.id) === phaseId;
            })
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
    }

    return [];
}

async function fetchCommercialApprovalDeliveryModalContext(approval) {
    const orderId = Number(approval?.orderId);
    const orderContext = await fetchCommercialApprovalOrderDeliveryContext(orderId);

    let phases = [];
    if (orderId && typeof fetchGestaoOrderPhases === 'function') {
        phases = await fetchGestaoOrderPhases(orderId);
    }

    const hasPhases = commercialApprovalOrderHasPhases(phases);
    const orderProjectId = await resolveCommercialApprovalOrderProjectId(approval);

    let project = null;
    if (orderProjectId) {
        const cachedProject = typeof orderProjectsCache !== 'undefined'
            ? orderProjectsCache.find(item => Number(item.id) === Number(orderProjectId))
            : null;

        if (cachedProject) {
            project = cachedProject;
        } else {
            const { data } = await supabaseClient
                .from('OrderProject')
                .select('id, name, deliveryDate, deliveryPhaseId')
                .eq('id', orderProjectId)
                .maybeSingle();
            project = data;
        }
    }

    const activePhase = hasPhases && project
        ? resolveCommercialApprovalProjectPhase(project, phases)
        : null;
    const phaseProjects = hasPhases && activePhase
        ? await fetchOrderProjectsForCommercialApprovalPhase(orderId, activePhase, phases)
        : [];

    return {
        ...orderContext,
        orderId,
        orderProjectId,
        phases,
        hasPhases,
        activePhase,
        phaseProjects,
        project
    };
}

function renderCommercialApprovalPhaseProjects(phase, projects = []) {
    const wrap = document.getElementById('commercial-approval-phase-projects-wrap');
    if (!wrap) return;

    if (!phase || !projects.length) {
        wrap.innerHTML = '<p class="text-xs text-slate-400">Nenhum projeto encontrado nesta fase.</p>';
        return;
    }

    wrap.innerHTML = `
        <div class="border border-slate-200 rounded-lg overflow-hidden bg-white" data-phase-id="${phase.id}">
            ${projects.map((project, index) => `
                <div class="flex items-center justify-between gap-3 px-3 py-2.5 ${index < projects.length - 1 ? 'border-b border-slate-100' : ''}" data-project-id="${project.id}">
                    <div class="text-xs font-semibold text-slate-800 min-w-0 truncate">${escapeHtml(project.name || 'Projeto')}</div>
                    <div class="flex items-center gap-2 shrink-0 text-right">
                        <span class="text-[11px] font-medium text-slate-500 whitespace-nowrap">${escapeHtml(phase.name || 'Fase')}</span>
                        ${index === 0 ? `
                            <input type="date"
                                id="commercial-approval-phase-delivery-${phase.id}"
                                class="commercial-approval-phase-delivery w-[9.5rem] px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                                data-phase-id="${phase.id}"
                                required
                                value="${escapeHtml(toGestaoInputDate(phase.deliveryDate))}">
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function syncCommercialApprovalOrderDeliveryUi(hasPhases = commercialApprovalOrderHasPhases()) {
    const orderDeliveryWrap = document.getElementById('commercial-approval-order-delivery-wrap');
    const orderDeliveryInput = document.getElementById('commercial-approval-order-delivery-input');
    const phaseSection = document.getElementById('commercial-approval-phase-delivery-section');
    const phaseLabel = document.getElementById('commercial-approval-phase-projects-label');
    const footnote = document.getElementById('commercial-approval-order-delivery-footnote');

    orderDeliveryWrap?.classList.toggle('hidden', hasPhases);
    phaseSection?.classList.toggle('hidden', !hasPhases);
    if (orderDeliveryInput) {
        orderDeliveryInput.required = !hasPhases;
    }

    if (phaseLabel) {
        phaseLabel.textContent = hasPhases
            ? 'Projetos da fase de entrega'
            : 'Projetos da fase';
    }

    if (footnote) {
        footnote.classList.toggle('hidden', !hasPhases);
        if (hasPhases) {
            footnote.textContent = 'Confirme ou altere a data de entrega da fase. A data de entrega do pedido será atualizada conforme a fase mais tardia.';
        }
    }
}

function collectCommercialApprovalOrderDeliverySelections() {
    const hasPhases = commercialApprovalOrderHasPhases();
    const context = commercialApprovalOrderDeliveryContext || {};

    if (hasPhases) {
        const phaseInput = document.querySelector('.commercial-approval-phase-delivery');
        const phaseDeliveryDate = phaseInput?.value || '';
        const phaseId = Number(phaseInput?.dataset?.phaseId || context.activePhase?.id);
        const orderDeliveryDate = phaseDeliveryDate;

        return {
            hasPhases: true,
            orderDeliveryDate,
            phaseDeliveries: phaseId ? [{ phaseId, deliveryDate: phaseDeliveryDate }] : []
        };
    }

    const orderDeliveryDate = document.getElementById('commercial-approval-order-delivery-input')?.value || '';
    return {
        hasPhases: false,
        orderDeliveryDate,
        phaseDeliveries: []
    };
}

function validateCommercialApprovalOrderDeliverySelections(selections) {
    if (selections.hasPhases) {
        if (!selections.phaseDeliveries.length || !selections.phaseDeliveries[0]?.deliveryDate) {
            alertAppDialog('Informe a data de entrega da fase.', { variant: 'warning', title: 'Aviso' });
            return false;
        }
        return true;
    }

    if (!selections.orderDeliveryDate) {
        alertAppDialog('Informe a data de entrega do pedido.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    return true;
}

async function persistCommercialApprovalPhaseDeliveryDates(orderId, phaseDeliveries = []) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId || !phaseDeliveries.length) return;

    const now = new Date().toISOString();

    await Promise.all(phaseDeliveries.map(async phase => {
        const { error } = await supabaseClient
            .from('OrderDeliveryPhase')
            .update({
                deliveryDate: phase.deliveryDate,
                updatedAt: now
            })
            .eq('id', phase.phaseId)
            .eq('orderId', normalizedOrderId);

        if (error) throw error;
    }));
}

async function saveCommercialApprovalOrderDeliveryDates(orderId, selections) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return;

    if (selections.hasPhases) {
        await persistCommercialApprovalPhaseDeliveryDates(normalizedOrderId, selections.phaseDeliveries);

        let orderDeliveryDate = selections.orderDeliveryDate;
        if (typeof fetchGestaoOrderPhases === 'function') {
            const refreshedPhases = await fetchGestaoOrderPhases(normalizedOrderId);
            const maxDeliveryDate = pickLatestIsoDate(...refreshedPhases.map(phase => phase.deliveryDate));
            if (maxDeliveryDate) {
                orderDeliveryDate = maxDeliveryDate;
            }
            if (typeof orderPhasesByOrderId !== 'undefined') {
                orderPhasesByOrderId[normalizedOrderId] = refreshedPhases;
            }
        }

        if (orderDeliveryDate) {
            await persistSalesOrderClientDeliveryDate(normalizedOrderId, orderDeliveryDate);
        }
        return;
    }

    if (selections.orderDeliveryDate) {
        await persistSalesOrderClientDeliveryDate(normalizedOrderId, selections.orderDeliveryDate);
    }
}

function openAprovacaoCaminhoModal(options = {}) {
    const { projectName = '—', currentPath = '' } = options;

    return new Promise(resolve => {
        aprovacaoCaminhoModalResolver = resolve;
        document.getElementById('aprovacao-caminho-project-name').textContent = projectName;
        document.getElementById('aprovacao-caminho-input').value = currentPath || '';
        toggleModal('aprovacao-caminho-modal', true);
        window.setTimeout(() => document.getElementById('aprovacao-caminho-input')?.focus(), 0);
    });
}

function closeAprovacaoCaminhoModal(result = null) {
    toggleModal('aprovacao-caminho-modal', false);
    if (aprovacaoCaminhoModalResolver) {
        aprovacaoCaminhoModalResolver(result);
        aprovacaoCaminhoModalResolver = null;
    }
}

async function saveProjectCaminhoRedeAprovacao(projectId, path) {
    const now = new Date().toISOString();
    let { error } = await supabaseClient
        .from('OrderProject')
        .update({
            approvalNetworkPath: path,
            updatedById: currentUser?.id || null,
            updatedAt: now
        })
        .eq('id', projectId);

    if (error?.message?.includes('approvalNetworkPath')) {
        throw new Error('Campo approvalNetworkPath não encontrado. Execute supabase/feats/add-order-project-conference-network-path.sql (ou create-order-project-aprovacao-path.sql) no Supabase.');
    }

    if (error) throw error;
}

async function promptProjectCaminhoRedeAprovacao(project) {
    while (true) {
        const path = await openAprovacaoCaminhoModal({
            projectName: project?.name || '—',
            currentPath: project?.approvalNetworkPath || ''
        });

        if (path === null) return null;

        const trimmed = path.trim();
        if (!trimmed) {
            alertAppDialog('Informe o caminho da rede para aprovação.');
            continue;
        }

        return trimmed;
    }
}

async function ensureProjectsCaminhoRedeAprovacao(projects) {
    if (!projects?.length) return [];

    const saved = [];

    for (const project of projects) {
        const path = await promptProjectCaminhoRedeAprovacao(project);
        if (path === null) return null;

        await saveProjectCaminhoRedeAprovacao(project.id, path);
        saved.push({ ...project, approvalNetworkPath: path });
    }

    return saved;
}

async function submitCommercialApprovalFromPendencias(projectId) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return;

    let result = await supabaseClient
        .from('OrderProject')
        .select('id, orderId, name, designerId, statusId, approvalNetworkPath, isComplementary, projectStatus:OrderProjectStatus(id, name)')
        .eq('id', normalizedId)
        .maybeSingle();

    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('OrderProjectStatus')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, name, designerId, statusId, approvalNetworkPath')
            .eq('id', normalizedId)
            .maybeSingle();
    }

    if (result.error?.message?.includes('approvalNetworkPath')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, name, designerId, statusId, projectStatus:OrderProjectStatus(id, name)')
            .eq('id', normalizedId)
            .maybeSingle();
    }

    if (result.error || !result.data) {
        alertAppDialog('Projeto não encontrado.');
        return;
    }

    const project = await enrichCommercialApprovalProjectsWithStatus([result.data]);
    const enrichedProject = project[0];

    if (isComplementaryOrderProject(enrichedProject)) {
        alertAppDialog('Projetos complementares acompanham o status do projeto pai e não podem ser enviados para aprovação.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (isReplacedOrderProject(enrichedProject)) {
        alertAppDialog('Projetos substituídos não podem ser enviados para aprovação.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const statusName = getCommercialApprovalProjectStatusName(enrichedProject);

    if (statusName !== COMMERCIAL_APPROVAL_PROJECT_STATUS) {
        alertAppDialog('Este projeto não está mais em Projeto Técnico.');
        return;
    }

    if (currentUser?.role === 'Projetista'
        && Number(enrichedProject.designerId) !== Number(currentUser.id)) {
        alertAppDialog('Sem permissão para enviar este projeto para aprovação.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!enrichedProject.designerId) {
        alertAppDialog('Projeto sem responsável cadastrado.');
        return;
    }

    const openApprovals = await getOpenCommercialApprovalsForProject(
        enrichedProject.orderId,
        normalizedId
    );
    if (openApprovals.length) {
        const status = getApprovalStatusLabel(normalizeCommercialApproval(openApprovals[0]).status);
        alertAppDialog(`Já existe solicitação de aprovação em aberto (${status}).`);
        return;
    }

    const confirmed = await confirmAppDialog(
        'O projeto será enviado para análise do consultor do pedido.',
        {
            title: `Enviar "${enrichedProject.name}" para aprovação?`,
            confirmLabel: 'Enviar para aprovação'
        }
    );
    if (!confirmed) {
        return;
    }

    const caminhoSaved = await ensureProjectsCaminhoRedeAprovacao([{
        id: enrichedProject.id,
        name: enrichedProject.name,
        approvalNetworkPath: enrichedProject.approvalNetworkPath
    }]);
    if (!caminhoSaved) return;

    const openRequests = await getOpenRequestsForProjects(enrichedProject.orderId, [normalizedId]);
    if (openRequests.length) {
        const canProceed = await blockCommercialApprovalWhenOpenRequests(
            enrichedProject.orderId,
            [normalizedId]
        );
        if (!canProceed) return;
    }

    try {
        setCommercialApprovalSubmitLoading(true, 'Registrando solicitação de aprovação...');

        setCommercialApprovalSubmitLoading(true, 'Atualizando status do projeto...');
        await applyEmRevisaoComercialStatusToProjects([normalizedId]);

        setCommercialApprovalSubmitLoading(true, 'Atualizando telas...');
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

        setCommercialApprovalSubmitLoading(true, 'Envio para aprovação concluído!', 'success');
        await waitCommercialApprovalSubmitStatus(1800);
        setCommercialApprovalSubmitLoading(false);
    } catch (error) {
        setCommercialApprovalSubmitLoading(true, `Erro ao enviar: ${error.message}`, 'error');
        await waitCommercialApprovalSubmitStatus(2500);
        setCommercialApprovalSubmitLoading(false);
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
        alertAppDialog('Somente Admin ou Projetista pode solicitar aprovação comercial.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!activeOrderId) {
        alertAppDialog('Selecione um pedido primeiro.');
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
    document.getElementById('approval-edit-project-name').textContent = getCommercialApprovalProjectName(approval) || '-';
    setupCommercialApprovalFormFields(approval, true);
    await setApprovalDesignerReadonlyLabel(approval);
    toggleModal('commercial-approval-modal', true);
}

function closeCommercialApprovalModal() {
    setCommercialApprovalFormLoading(false);
    editingCommercialApprovalId = null;
    toggleModal('commercial-approval-modal', false);
}

window.openCommercialApprovalModal = openCommercialApprovalModal;
window.closeCommercialApprovalModal = closeCommercialApprovalModal;
window.editCommercialApproval = editCommercialApproval;

async function isFirstCommercialApprovalForOrder(approval) {
    const orderId = Number(approval?.orderId);
    const orderProjectId = Number(approval?.orderProjectId || approval?.id);
    if (!orderId || !orderProjectId) return false;

    const statusIds = await getPendenciasStatusIdsByNames(['Aguardando Aprovação']);
    if (!statusIds.length) return true;

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('id')
        .eq('orderId', orderId)
        .in('statusId', statusIds)
        .neq('id', orderProjectId);

    if (error) {
        console.error('isFirstCommercialApprovalForOrder:', error);
        return true;
    }

    return !(data || []).length;
}

async function fetchCommercialApprovalOrderDeliveryContext(orderId) {
    let orderCode = '—';
    let clientName = '—';
    let clientDeliveryDate = '';

    const cachedOrder = typeof ordersCache !== 'undefined'
        ? ordersCache.find(order => Number(order.id) === Number(orderId))
        : null;

    if (cachedOrder) {
        orderCode = cachedOrder.orderCode || '—';
        clientName = getOrderClientName(cachedOrder) || '—';
        clientDeliveryDate = cachedOrder.clientDeliveryDate || '';
    } else if (orderId) {
        const { data } = await supabaseClient
            .from('salesOrders')
            .select('orderCode, clientDeliveryDate, client:Client(name)')
            .eq('id', orderId)
            .maybeSingle();

        if (data) {
            orderCode = data.orderCode || '—';
            clientName = getOrderClientName(data) || '—';
            clientDeliveryDate = data.clientDeliveryDate || '';
        }
    }

    return { orderCode, clientName, clientDeliveryDate };
}

function closeCommercialApprovalOrderDeliveryModal() {
    pendingCommercialApprovalOrderDeliveryApprovalId = null;
    commercialApprovalOrderDeliveryContext = null;
    const input = document.getElementById('commercial-approval-order-delivery-input');
    const phaseWrap = document.getElementById('commercial-approval-phase-projects-wrap');
    if (input) input.value = '';
    if (phaseWrap) phaseWrap.innerHTML = '';
    syncCommercialApprovalOrderDeliveryUi(false);
    toggleModal('commercial-approval-order-delivery-modal', false);
}

async function showCommercialApprovalOrderDeliveryModal(approval) {
    if (!approval?.id || !approval?.orderId) return;

    pendingCommercialApprovalOrderDeliveryApprovalId = Number(approval.id);
    commercialApprovalOrderDeliveryContext = await fetchCommercialApprovalDeliveryModalContext(approval);

    const contextEl = document.getElementById('commercial-approval-order-delivery-context');
    const input = document.getElementById('commercial-approval-order-delivery-input');
    const projectName = getCommercialApprovalProjectName(approval) || 'Projeto';

    if (contextEl) {
        contextEl.textContent = commercialApprovalOrderDeliveryContext.hasPhases
            ? `Pedido ${commercialApprovalOrderDeliveryContext.orderCode} — ${commercialApprovalOrderDeliveryContext.clientName}. Confirme a data de entrega da fase do projeto "${projectName}" antes de aprovar.`
            : `Pedido ${commercialApprovalOrderDeliveryContext.orderCode} — ${commercialApprovalOrderDeliveryContext.clientName}. Confirme a data de entrega do pedido antes de aprovar "${projectName}".`;
    }

    if (input) {
        input.value = typeof toGestaoInputDate === 'function'
            ? toGestaoInputDate(commercialApprovalOrderDeliveryContext.clientDeliveryDate)
            : String(commercialApprovalOrderDeliveryContext.clientDeliveryDate || '').slice(0, 10);
    }

    syncCommercialApprovalOrderDeliveryUi(commercialApprovalOrderDeliveryContext.hasPhases);
    if (commercialApprovalOrderDeliveryContext.hasPhases) {
        renderCommercialApprovalPhaseProjects(
            commercialApprovalOrderDeliveryContext.activePhase,
            commercialApprovalOrderDeliveryContext.phaseProjects
        );
    }

    toggleModal('commercial-approval-order-delivery-modal', true);
    (commercialApprovalOrderDeliveryContext.hasPhases
        ? document.querySelector('.commercial-approval-phase-delivery')
        : input)?.focus();
}

async function saveCommercialApprovalOrderDeliveryDate(orderId, clientDeliveryDate) {
    await persistSalesOrderClientDeliveryDate(orderId, clientDeliveryDate);
}

async function submitCommercialApprovalOrderDeliveryModal() {
    const approvalId = pendingCommercialApprovalOrderDeliveryApprovalId;
    if (!approvalId) return;

    const approval = commercialApprovalsCache.find(item => Number(item.id) === Number(approvalId))
        || (typeof ensureApprovalInCache === 'function' ? await ensureApprovalInCache(approvalId) : null);

    if (!approval || !canApproveCommercialApproval(approval)) {
        closeCommercialApprovalOrderDeliveryModal();
        return;
    }

    const selections = collectCommercialApprovalOrderDeliverySelections();
    if (!validateCommercialApprovalOrderDeliverySelections(selections)) return;

    try {
        await saveCommercialApprovalOrderDeliveryDates(approval.orderId, selections);
        closeCommercialApprovalOrderDeliveryModal();
        await executeCommercialApproval(approvalId);
    } catch (error) {
        alertAppDialog(`Erro ao salvar data de entrega: ${error.message}`);
    }
}

async function hasUncompletedCommercialRevisions(approvalId) {
    const orderProjectId = Number(approvalId);
    if (!orderProjectId) return false;

    const { data: revisions, error: revError } = await supabaseClient
        .from('Revision')
        .select('id')
        .eq('orderProjectId', orderProjectId)
        .eq('revisionType', REVISION_TYPE_COMMERCIAL_COMMERCIAL);

    if (revError || !revisions?.length) return false;

    const revisionIds = revisions.map(r => r.id);
    const { data: activities, error: actError } = await supabaseClient
        .from('RevisionActivity')
        .select('id')
        .in('revisionId', revisionIds)
        .eq('completed', false)
        .limit(1);

    if (actError) return false;
    return (activities || []).length > 0;
}

async function isProjectInAguardandoAprovacaoStatus(approval) {
    let orderProjectId = approval?.orderProjectId;
    if (!orderProjectId && approval?.id && typeof resolveCommercialApprovalOrderProjectId === 'function') {
        orderProjectId = await resolveCommercialApprovalOrderProjectId(approval);
    }
    if (!orderProjectId) return false;

    const { data: project } = await supabaseClient
        .from('OrderProject')
        .select('id, projectStatus:OrderProjectStatus(name)')
        .eq('id', orderProjectId)
        .maybeSingle();

    return project?.projectStatus?.name === 'Aguardando Aprovação';
}

async function approveCommercialApproval(id) {
    let approval = commercialApprovalsCache.find(a => a.id === id);
    if (!approval && typeof ensureApprovalInCache === 'function') {
        approval = await ensureApprovalInCache(id);
    }
    if (!approval || !canApproveCommercialApproval(approval)) return;

    if (await isProjectInAguardandoAprovacaoStatus(approval) && await hasUncompletedCommercialRevisions(id)) {
        alertAppDialog(
            'Não é possível aprovar o projeto pois existe(m) atividade(s) pendente(s) na Revisão Comercial. Conclua todas as atividades antes de aprovar.',
            { variant: 'warning', title: 'Revisão Comercial Pendente' }
        );
        return;
    }

    const isAguardandoAprovacao = await isProjectInAguardandoAprovacaoStatus(approval);
    if (isAguardandoAprovacao) {
        await showCommercialApprovalOrderDeliveryModal(approval);
        return;
    }

    const confirmed = await confirmAppDialog(
        'A solicitação será marcada como aprovada.',
        {
            title: `Aprovar "${getCommercialApprovalProjectName(approval)}"?`,
            confirmLabel: 'Aprovar',
            variant: 'success'
        }
    );
    if (!confirmed) return;

    await executeCommercialApproval(id);
}

async function executeCommercialApproval(id) {
    let approval = commercialApprovalsCache.find(a => a.id === id);
    if (!approval && typeof ensureApprovalInCache === 'function') {
        approval = await ensureApprovalInCache(id);
    }
    if (!approval || !canApproveCommercialApproval(approval)) return;

    if (await isProjectInAguardandoAprovacaoStatus(approval) && await hasUncompletedCommercialRevisions(id)) {
        alertAppDialog(
            'Não é possível aprovar o projeto pois existe(m) atividade(s) pendente(s) na Revisão Comercial. Conclua todas as atividades antes de aprovar.',
            { variant: 'warning', title: 'Revisão Comercial Pendente' }
        );
        return;
    }

    const orderProjectId = await resolveCommercialApprovalOrderProjectId(approval);
    let currentStatusName = '';
    if (orderProjectId) {
        const { data: proj } = await supabaseClient
            .from('OrderProject')
            .select('id, projectStatus:OrderProjectStatus(name)')
            .eq('id', orderProjectId)
            .maybeSingle();
        currentStatusName = proj?.projectStatus?.name || '';
    }

    const isMovingToAguardandoAprovacao = isOrderProjectEmRevisaoComercialConsStatus(currentStatusName)
        || isOrderProjectEmRevisaoComercialProjStatus(currentStatusName);
    const now = new Date().toISOString();

    setCommercialApprovalActionLoading(id, true, 'Registrando aprovação...');

    try {
        if (!isMovingToAguardandoAprovacao) {
            // Status do projeto é atualizado abaixo; CommercialApproval removido (fase C).
        }

        setCommercialApprovalActionLoading(id, true, 'Atualizando status do projeto...');
        if (typeof applyApprovedStatusForCommercialApproval === 'function') {
            await applyApprovedStatusForCommercialApproval(approval);
        }

        setCommercialApprovalActionLoading(id, true, 'Atualizando telas...');
        if (activeOrderId) {
            loadCommercialApprovals(activeOrderId);
            if (typeof loadOrderProjects === 'function') {
                await loadOrderProjects(activeOrderId);
            }
            if (typeof loadNomearProjects === 'function') {
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

        setCommercialApprovalActionLoading(id, true, 'Solicitação aprovada!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));
    } catch (error) {
        setCommercialApprovalActionLoading(id, true, `Erro ao aprovar: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
    } finally {
        setCommercialApprovalActionLoading(id, false);
    }
}

window.approveCommercialApproval = approveCommercialApproval;

function normalizeCommercialApproval(record) {
    if (!record) return record;
    if (typeof buildProjectWorkflowContext === 'function' && record.statusId && !record.orderProjectId) {
        return buildProjectWorkflowContext(record);
    }
    const statusName = getCommercialApprovalProjectStatusName(record);
    return {
        ...record,
        orderProjectId: record.orderProjectId || record.id,
        id: record.orderProjectId || record.id,
        status: record.status || getCommercialWorkflowStatusLabel(statusName)
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
    if (typeof queryCommercialWorkflowProjects === 'function') {
        return queryCommercialWorkflowProjects(orderId);
    }
    return { data: [], error: null };
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
    const linkedProject = approval.orderProjectId ? projectById[approval.orderProjectId] : null;
    const projectStatusName = linkedProject?.projectStatus?.name || '';
    const showRequestRevision = typeof canRequestNewRevision === 'function' && canRequestNewRevision(approval, projectStatusName);
    const environmentName = linkedProject?.environmentType?.name || '';
    const projetistaName = projetistaNames[approval.designerId] || '—';
    const approvalDate = approval.approved && approval.approvedAt
        ? formatDate(approval.approvedAt)
        : '—';
    const revisions = revisionsByApproval[approval.id] || [];
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
                        <p class="text-sm font-bold text-slate-900 truncate" title="${getCommercialApprovalProjectName(approval) || ''}">${getCommercialApprovalProjectName(approval) || '—'}</p>
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
            return;
        }

        if (!approvals || approvals.length === 0) {
            commercialApprovalsCache = [];
            list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 bg-white rounded-xl border border-emerald-100">Nenhuma aprovação comercial para este pedido.</p>';
            return;
        }

        commercialApprovalsCache = approvals.map(a => normalizeCommercialApproval(a));

        const { data: orderInfo } = await supabaseClient
            .from('salesOrders')
            .select('consultantUserId, consultor:appUsers!consultantUserId(name)')
            .eq('id', orderId)
            .maybeSingle();

        const consultantName = getOrderConsultantNameFromRecord(orderInfo);
        if (consultantName) {
            commercialApprovalsCache = commercialApprovalsCache.map(a => ({
                ...a,
                orderConsultantName: consultantName
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
        if (typeof hydrateRevisionActivityAttachmentPreviews === 'function') {
            hydrateRevisionActivityAttachmentPreviews(list);
        }
    } catch (renderError) {
        console.error('loadCommercialApprovals render:', renderError);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-4 bg-white rounded-xl border border-red-100">Erro ao exibir aprovações comerciais: ${renderError.message}</p>`;
    } finally {
        if (typeof refreshOrdersListSummary === 'function') {
            await refreshOrdersListSummary();
        }
    }
}

function setCommercialApprovalFormLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('commercial-approval-loading');
    const messageEl = document.getElementById('commercial-approval-loading-msg');
    const spinner = document.getElementById('commercial-approval-loading-spinner');
    const successIcon = document.getElementById('commercial-approval-loading-success');
    const errorIcon = document.getElementById('commercial-approval-loading-error');
    const submitBtn = document.getElementById('commercial-approval-form-submit');
    const cancelBtn = document.querySelector('#commercial-approval-form button[type="button"]');
    const fields = document.querySelectorAll('#commercial-approval-form input, #commercial-approval-form select');
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

    [submitBtn, cancelBtn].forEach(btn => {
        if (!btn) return;
        btn.disabled = show;
        btn.classList.toggle('opacity-60', show);
        btn.classList.toggle('cursor-not-allowed', show);
    });
    fields.forEach(field => { field.disabled = show; });
}

function isCommercialApprovalModalVisible() {
    const modal = document.getElementById('commercial-approval-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

function isPendenciasViewVisibleForApproval() {
    const view = document.getElementById('pendencias-view');
    return Boolean(view && !view.classList.contains('hidden'));
}

function isOrderProjectsPanelVisibleForApproval() {
    const content = document.getElementById('order-content');
    return Boolean(content && !content.classList.contains('hidden'));
}

function isApprovalsQueryViewVisibleForApproval() {
    const view = document.getElementById('approvals-query-view');
    return Boolean(view && !view.classList.contains('hidden'));
}

function setApprovalsQueryActionLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('approvals-query-action-loading');
    const messageEl = document.getElementById('approvals-query-action-loading-msg');
    const spinner = document.getElementById('approvals-query-action-loading-spinner');
    const successIcon = document.getElementById('approvals-query-action-loading-success');
    const errorIcon = document.getElementById('approvals-query-action-loading-error');
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
}

function applyCommercialApprovalContextLoading(active, message = 'Processando...', status = 'loading') {
    if (isPendenciasViewVisibleForApproval() && typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(active, message, status);
        return true;
    }

    if (isApprovalsQueryViewVisibleForApproval()) {
        setApprovalsQueryActionLoading(active, message, status);
        return true;
    }

    if (isOrderProjectsPanelVisibleForApproval()) {
        setOrderProjectsPanelActionLoading(active, message, status);
        return true;
    }

    if (isCommercialApprovalModalVisible()) {
        setCommercialApprovalFormLoading(active, message, status);
        return true;
    }

    return false;
}

function setCommercialApprovalSubmitLoading(active, message = 'Processando...', status = 'loading') {
    if (applyCommercialApprovalContextLoading(active, message, status)) {
        return;
    }

    if (typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(active, message, status);
    }
}

async function waitCommercialApprovalSubmitStatus(ms) {
    if (typeof waitPendenciasStatus === 'function') {
        await waitPendenciasStatus(ms);
        return;
    }

    await new Promise(resolve => setTimeout(resolve, ms));
}

function setCommercialApprovalActionLoading(approvalId, active, message = 'Processando...', status = 'loading') {
    if (applyCommercialApprovalContextLoading(active, message, status)) {
        return;
    }

    setApproveButtonLoading(approvalId, active, message);
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
    document.getElementById('aprovacao-caminho-form')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const path = document.getElementById('aprovacao-caminho-input')?.value || '';
        closeAprovacaoCaminhoModal(path);
    });

    document.getElementById('btn-aprovacao-caminho-cancelar')?.addEventListener('click', async () => {
        closeAprovacaoCaminhoModal(null);
    });

    document.getElementById('btn-commercial-approval-order-delivery-cancel')
        ?.addEventListener('click', closeCommercialApprovalOrderDeliveryModal);
    document.getElementById('btn-commercial-approval-order-delivery-submit')
        ?.addEventListener('click', submitCommercialApprovalOrderDeliveryModal);

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
                alertAppDialog('Somente Admin ou Projetista pode criar aprovação comercial.', { variant: 'warning', title: 'Aviso' });
                return;
            }

            selectedProjectIds = getSelectedNewApprovalProjectIds()
                .filter(projectId => {
                    const project = document.querySelector(`input[name="approval-project"][value="${projectId}"]`);
                    return project && !project.disabled;
                });

            if (!selectedProjectIds.length) {
                alertAppDialog('Selecione ao menos um projeto que ainda não possui solicitação de aprovação.');
                return;
            }
        }

        try {
            const projects = await fetchCommercialApprovalEligibleProjects(activeOrderId);
            const projectsWithoutDesigner = selectedProjectIds.filter(projectId => {
                const project = projects.find(item => Number(item.id) === Number(projectId));
                return !project?.designerId;
            });

            if (projectsWithoutDesigner.length) {
                alertAppDialog('Todos os projetos selecionados precisam ter responsável cadastrado no projeto.');
                return;
            }

            const openRequests = await getOpenRequestsForProjects(activeOrderId, selectedProjectIds);

            if (openRequests.length) {
                const canProceed = await blockCommercialApprovalWhenOpenRequests(activeOrderId, selectedProjectIds);
                if (!canProceed) return;
            }

            const selectedProjects = selectedProjectIds
                .map(projectId => projects.find(item => Number(item.id) === Number(projectId)))
                .filter(Boolean);

            const caminhoSaved = await ensureProjectsCaminhoRedeAprovacao(selectedProjects);
            if (!caminhoSaved) return;

            setCommercialApprovalFormLoading(true, 'Salvando solicitação...');

            if (!selectedProjectIds.length) {
                alertAppDialog('Não foi possível montar as solicitações com o responsável dos projetos.');
                return;
            }

            setCommercialApprovalFormLoading(true, 'Atualizando status dos projetos...');
            await applyEmRevisaoComercialStatusToProjects(selectedProjectIds);

            setCommercialApprovalFormLoading(true, 'Atualizando telas...');
            loadCommercialApprovals(activeOrderId);
            if (typeof loadOrderProjects === 'function' && activeOrderId) {
                await loadOrderProjects(activeOrderId);
            }

            setCommercialApprovalFormLoading(true, 'Solicitação enviada com sucesso!', 'success');
            await new Promise(resolve => setTimeout(resolve, 900));

            closeCommercialApprovalModal();
            document.getElementById('commercial-approval-form').reset();
        } catch (error) {
            setCommercialApprovalFormLoading(true, `Erro ao salvar solicitação: ${error.message}`, 'error');
            await new Promise(resolve => setTimeout(resolve, 2200));
        } finally {
            setCommercialApprovalFormLoading(false);
        }
    });
}
