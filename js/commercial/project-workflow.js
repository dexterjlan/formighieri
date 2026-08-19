const COMMERCIAL_WORKFLOW_OPEN_STATUSES = [
    'Aguardando Aprovação',
    ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS,
    ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ,
    ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_COMERCIAL,
    ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_TECNICA,
    'Em Revisão',
    'Em revisão'
];

const COMMERCIAL_WORKFLOW_LIST_STATUSES = [
    ...COMMERCIAL_WORKFLOW_OPEN_STATUSES,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ,
    'Nomear'
];

function isCommercialWorkflowApprovedStatus(statusName) {
    const normalized = String(statusName || '').trim();
    return normalized === 'Nomear'
        || isOrderProjectEmRevisaoTecnicaRevisorStatus(normalized)
        || isOrderProjectEmRevisaoTecnicaProjStatus(normalized);
}

function isProjectInOpenCommercialWorkflow(statusName) {
    const normalized = String(statusName || '').trim();
    return COMMERCIAL_WORKFLOW_OPEN_STATUSES.includes(normalized)
        || isOrderProjectEmRevisaoComercialConsStatus(normalized)
        || isOrderProjectEmRevisaoComercialProjStatus(normalized);
}

function getCommercialWorkflowStatusLabel(statusName) {
    const normalized = String(statusName || '').trim();
    if (isCommercialWorkflowApprovedStatus(normalized)) return 'Aprovado';
    if (isOrderProjectEmRevisaoComercialProjStatus(normalized)
        || normalized === 'Em Revisão'
        || normalized === 'Em revisão') {
        return 'Em revisão';
    }
    if (isOrderProjectEmRevisaoComercialConsStatus(normalized)) return 'Em revisão';
    if (normalized === 'Aguardando Aprovação') return 'Aguardando Aprovação';
    return normalized || 'Aguardando Aprovação';
}

function buildProjectWorkflowContext(project, order = null) {
    const orderProject = project?.orderProject || project;
    const statusName = getCommercialApprovalProjectStatusName(orderProject || project);
    const workflowStatus = getCommercialWorkflowStatusLabel(statusName);
    const orderProjectId = Number(orderProject?.id || project?.orderProjectId || project?.id);

    return {
        id: orderProjectId,
        orderProjectId,
        orderId: orderProject?.orderId || project?.orderId || order?.id || null,
        designerId: orderProject?.designerId || project?.designerId || null,
        orderProject: {
            id: orderProjectId,
            name: orderProject?.name || project?.name || '',
            projectCode: orderProject?.projectCode || project?.projectCode || null
        },
        projectStatus: orderProject?.projectStatus || project?.projectStatus || null,
        order: order || project?.order || null,
        approved: isCommercialWorkflowApprovedStatus(statusName),
        approvedAt: null,
        status: workflowStatus,
        createdAt: orderProject?.updatedAt || orderProject?.createdAt || project?.updatedAt || project?.createdAt || null,
        orderConsultantName: order
            ? getOrderConsultantNameFromRecord(order)
            : getOrderConsultantNameFromRecord(project?.order) || project?.orderConsultantName || null
    };
}

async function fetchOrderProjectsForWorkflowContext(projectIds) {
    const uniqueIds = [...new Set(projectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return [];

    let result = await supabaseClient
        .from('OrderProject')
        .select(`
            id, orderId, name, projectCode, designerId, statusId, createdAt, updatedAt,
            projectStatus:OrderProjectStatus(id, name),
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
        `)
        .in('id', uniqueIds);

    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('order:')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, name, projectCode, designerId, statusId, createdAt, updatedAt')
            .in('id', uniqueIds);
    }

    if (result.error) {
        console.error('fetchOrderProjectsForWorkflowContext:', result.error);
        return [];
    }

    return typeof enrichCommercialApprovalProjectsWithStatus === 'function'
        ? enrichCommercialApprovalProjectsWithStatus(result.data || [])
        : (result.data || []);
}

async function fetchCommercialApprovalsByProjectIds(projectIds) {
    const projects = await fetchOrderProjectsForWorkflowContext(projectIds);
    const byProject = {};

    projects.forEach(project => {
        const statusName = getCommercialApprovalProjectStatusName(project);
        const inCommercialWorkflow = isProjectInOpenCommercialWorkflow(statusName)
            || isCommercialWorkflowApprovedStatus(statusName);

        if (!inCommercialWorkflow) return;

        byProject[project.id] = buildProjectWorkflowContext(project, project.order || null);
    });

    return byProject;
}

async function ensureProjectWorkflowInCache(projectId, forceRefresh = false) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return null;

    let context = !forceRefresh
        ? commercialApprovalsCache.find(item => Number(item.id) === normalizedId)
        : null;

    if (!context) {
        const projects = await fetchOrderProjectsForWorkflowContext([normalizedId]);
        const project = projects[0];
        if (!project) return null;

        context = buildProjectWorkflowContext(project, project.order || null);

        const idx = commercialApprovalsCache.findIndex(item => Number(item.id) === normalizedId);
        if (idx !== -1) {
            commercialApprovalsCache[idx] = context;
        } else {
            commercialApprovalsCache.push(context);
        }
    }

    if (context?.orderProjectId && (!context.projectStatus || forceRefresh)) {
        const { data: proj } = await supabaseClient
            .from('OrderProject')
            .select('id, projectStatus:OrderProjectStatus(name)')
            .eq('id', context.orderProjectId)
            .maybeSingle();

        if (proj?.projectStatus) {
            context.projectStatus = proj.projectStatus;
            context.status = getCommercialWorkflowStatusLabel(proj.projectStatus.name);
            context.approved = isCommercialWorkflowApprovedStatus(proj.projectStatus.name);
        }
    }

    return context;
}

async function queryCommercialWorkflowProjects(orderId) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return { data: [], error: null };

    const statusIds = await getPendenciasStatusIdsByNames(COMMERCIAL_WORKFLOW_LIST_STATUSES);
    if (!statusIds.length) {
        return { data: [], error: null };
    }

    let result = await supabaseClient
        .from('OrderProject')
        .select(`
            id, orderId, name, projectCode, designerId, statusId, createdAt, updatedAt,
            environmentType:EnvironmentType(name),
            projectStatus:OrderProjectStatus(id, name),
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
        `)
        .eq('orderId', normalizedOrderId)
        .in('statusId', statusIds)
        .order('updatedAt', { ascending: false });

    if (result.error?.message?.includes('environmentType') || result.error?.message?.includes('projectStatus')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, name, projectCode, designerId, statusId, createdAt, updatedAt')
            .eq('orderId', normalizedOrderId)
            .in('statusId', statusIds)
            .order('updatedAt', { ascending: false });
    }

    if (result.error) return result;

    const projects = typeof enrichCommercialApprovalProjectsWithStatus === 'function'
        ? await enrichCommercialApprovalProjectsWithStatus(result.data || [])
        : (result.data || []);

    const { data: orderInfo } = await supabaseClient
        .from('salesOrders')
        .select('id, consultantUserId, consultor:appUsers!consultantUserId(name)')
        .eq('id', normalizedOrderId)
        .maybeSingle();

    const consultantName = getOrderConsultantNameFromRecord(orderInfo);
    const contexts = projects.map(project => {
        const context = buildProjectWorkflowContext(project, project.order || orderInfo);
        if (consultantName) {
            context.orderConsultantName = consultantName;
        }
        return context;
    });

    return { data: contexts, error: null };
}

async function queryCommercialApprovals(orderId) {
    return queryCommercialWorkflowProjects(orderId);
}

async function getOpenCommercialApprovalsForProject(orderId, orderProjectId) {
    const normalizedProjectId = Number(orderProjectId);
    if (!normalizedProjectId) return [];

    const projects = await fetchOrderProjectsForWorkflowContext([normalizedProjectId]);
    const project = projects[0];
    if (!project) return [];

    const statusName = getCommercialApprovalProjectStatusName(project);
    if (!isProjectInOpenCommercialWorkflow(statusName)) {
        return [];
    }

    return [buildProjectWorkflowContext(project, project.order || null)];
}

async function queryAllCommercialWorkflowProjects() {
    const statusIds = await getPendenciasStatusIdsByNames(COMMERCIAL_WORKFLOW_LIST_STATUSES);
    if (!statusIds.length) {
        return { data: [], error: null };
    }

    let result = await supabaseClient
        .from('OrderProject')
        .select(`
            id, orderId, name, projectCode, designerId, statusId, createdAt, updatedAt,
            projectStatus:OrderProjectStatus(id, name),
            orderProject:OrderProject(id, name, projectCode)
        `)
        .in('statusId', statusIds)
        .order('updatedAt', { ascending: false });

    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('orderProject')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, name, projectCode, designerId, statusId, createdAt, updatedAt')
            .in('statusId', statusIds)
            .order('updatedAt', { ascending: false });
    }

    if (result.error) return result;

    const projects = typeof enrichCommercialApprovalProjectsWithStatus === 'function'
        ? await enrichCommercialApprovalProjectsWithStatus(result.data || [])
        : (result.data || []);

    return {
        data: projects.map(project => buildProjectWorkflowContext(project)),
        error: null
    };
}

window.ensureProjectWorkflowInCache = ensureProjectWorkflowInCache;
window.fetchOrderProjectsForWorkflowContext = fetchOrderProjectsForWorkflowContext;
window.fetchCommercialApprovalsByProjectIds = fetchCommercialApprovalsByProjectIds;
window.getOpenCommercialApprovalsForProject = getOpenCommercialApprovalsForProject;
window.queryCommercialWorkflowProjects = queryCommercialWorkflowProjects;
window.queryCommercialApprovals = queryCommercialWorkflowProjects;
window.queryAllCommercialWorkflowProjects = queryAllCommercialWorkflowProjects;
window.buildProjectWorkflowContext = buildProjectWorkflowContext;
window.isCommercialWorkflowApprovedStatus = isCommercialWorkflowApprovedStatus;
window.isProjectInOpenCommercialWorkflow = isProjectInOpenCommercialWorkflow;
window.getCommercialWorkflowStatusLabel = getCommercialWorkflowStatusLabel;
