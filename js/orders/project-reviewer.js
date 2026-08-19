const TECHNICAL_REVIEWER_REVIEW_REVISOR_STATUS = ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR;
const TECHNICAL_REVIEWER_REVIEW_PROJ_STATUS = ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ;

async function getOrderProjectStatusIdByNameReviewer(statusName) {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', statusName)
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', statusName)
        .maybeSingle();

    return fallback?.id || null;
}

async function getTechnicalReviewerReviewRevisorStatusId() {
    return getOrderProjectStatusIdByNameReviewer(TECHNICAL_REVIEWER_REVIEW_REVISOR_STATUS);
}

async function getTechnicalReviewerReviewProjStatusId() {
    return getOrderProjectStatusIdByNameReviewer(TECHNICAL_REVIEWER_REVIEW_PROJ_STATUS);
}

function canActProjectReviewer(user = currentUser) {
    return isAdmin(user) || isReviewer(user);
}

async function applyOrderProjectStatusByName(orderProjectIds, statusName, options = {}) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getOrderProjectStatusIdByNameReviewer(statusName);
    if (!statusId) {
        throw new Error(`Status "${statusName}" não encontrado.`);
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser?.id || null,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;

    if (!options.skipEmail && typeof notifyOrderProjectStatusChangeForProjects === 'function') {
        await notifyOrderProjectStatusChangeForProjects(uniqueIds, statusName, options.notificationOptions);
    }
}

async function applyTechnicalReviewerReviewRevisorStatusToProjects(orderProjectIds, options = {}) {
    await applyOrderProjectStatusByName(orderProjectIds, TECHNICAL_REVIEWER_REVIEW_REVISOR_STATUS, options);
}

async function applyTechnicalReviewerReviewProjStatusToProjects(orderProjectIds, options = {}) {
    await applyOrderProjectStatusByName(orderProjectIds, TECHNICAL_REVIEWER_REVIEW_PROJ_STATUS, options);
}

async function applyTechnicalReviewerApprovedToNomear(orderProjectIds) {
    if (typeof applyNomearStatusToProjects === 'function') {
        await applyNomearStatusToProjects(orderProjectIds);
        return;
    }

    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const { data: status } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Nomear')
        .maybeSingle();

    if (!status?.id) {
        throw new Error('Status "Nomear" não encontrado.');
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId: status.id,
            isNamed: false,
            updatedById: currentUser?.id || null,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;
}

window.applyTechnicalReviewerReviewRevisorStatusToProjects = applyTechnicalReviewerReviewRevisorStatusToProjects;
window.applyTechnicalReviewerReviewProjStatusToProjects = applyTechnicalReviewerReviewProjStatusToProjects;
window.applyTechnicalReviewerApprovedToNomear = applyTechnicalReviewerApprovedToNomear;
window.canActProjectReviewer = canActProjectReviewer;

function getOrderProjectStatusNameFromProject(project) {
    return project?.projectStatus?.name || project?.statusName || '';
}

function isProjectInTechnicalReviewerReviewStatus(project) {
    return isOrderProjectEmRevisaoTecnicaRevisorStatus(getOrderProjectStatusNameFromProject(project));
}

function isProjectInTechnicalReviewerProjStatus(project) {
    return isOrderProjectEmRevisaoTecnicaProjStatus(getOrderProjectStatusNameFromProject(project));
}

function canReviewerActOnProject(project) {
    return canActProjectReviewer() && isProjectInTechnicalReviewerReviewStatus(project);
}

function canDesignerActOnTechnicalReviewerProject(project) {
    if (!project || !isProjectInTechnicalReviewerProjStatus(project)) return false;
    if (isAdmin()) return true;
    return currentUser?.role === 'Projetista'
        && Number(project.designerId) === Number(currentUser?.id);
}

window.canReviewerActOnProject = canReviewerActOnProject;
window.canDesignerActOnTechnicalReviewerProject = canDesignerActOnTechnicalReviewerProject;
window.getOrderProjectStatusNameFromProject = getOrderProjectStatusNameFromProject;
window.isProjectInTechnicalReviewerReviewStatus = isProjectInTechnicalReviewerReviewStatus;
window.isProjectInTechnicalReviewerProjStatus = isProjectInTechnicalReviewerProjStatus;
