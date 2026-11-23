const TECHNICAL_REVIEWER_REVIEW_REVISOR_STATUS = ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR;
const TECHNICAL_REVIEWER_REVIEW_PROJ_STATUS = ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ;

async function getTechnicalReviewerReviewRevisorStatusId() {
    return getOrderProjectStatusIdByName(TECHNICAL_REVIEWER_REVIEW_REVISOR_STATUS);
}

async function getTechnicalReviewerReviewProjStatusId() {
    return getOrderProjectStatusIdByName(TECHNICAL_REVIEWER_REVIEW_PROJ_STATUS);
}

function canActProjectReviewer(user = currentUser) {
    return isAdmin(user) || isReviewer(user);
}

async function applyOrderProjectStatusByName(orderProjectIds, statusName, options = {}) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getOrderProjectStatusIdByName(statusName);
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
    if (!project || !isProjectInTechnicalReviewerReviewStatus(project)) return false;
    if (isAdmin()) return true;
    if (!canActProjectReviewer()) return false;
    return Number(project.reviewerId) === Number(currentUser?.id);
}

function isTechnicalReviewerReviewStartedOnProject(project) {
    return Boolean(project?.technicalReviewerReviewStartedAt);
}

function canReviewerStartTechnicalReviewOnProject(project) {
    return canReviewerActOnProject(project) && !isTechnicalReviewerReviewStartedOnProject(project);
}

async function startTechnicalReviewerReviewOnProject(orderProjectId) {
    const projectId = Number(orderProjectId);
    if (!projectId) {
        return { ok: false, error: new Error('Projeto inválido.') };
    }

    const now = new Date().toISOString();
    let { error } = await supabaseClient
        .from('OrderProject')
        .update({
            technicalReviewerReviewStartedAt: now,
            updatedById: currentUser?.id || null,
            updatedAt: now
        })
        .eq('id', projectId)
        .is('technicalReviewerReviewStartedAt', null);

    if (error?.message?.includes('technicalReviewerReviewStartedAt')) {
        return {
            ok: false,
            error: new Error('Execute supabase/feats/order-project-technical-reviewer-assignment.sql no Supabase SQL Editor.')
        };
    }

    if (error) return { ok: false, error };

    return { ok: true, startedAt: now };
}

async function assignOrderProjectTechnicalReviewer(orderProjectId, reviewerId, options = {}) {
    const projectId = Number(orderProjectId);
    const nextReviewerId = reviewerId ? Number(reviewerId) : null;
    const resetStarted = options.resetStarted !== false;
    if (!projectId) {
        return { ok: false, error: new Error('Projeto inválido.') };
    }

    const now = new Date().toISOString();
    const payload = {
        reviewerId: nextReviewerId,
        updatedById: currentUser?.id || null,
        updatedAt: now
    };
    if (resetStarted) {
        payload.technicalReviewerReviewStartedAt = null;
    }

    const { error } = await supabaseClient
        .from('OrderProject')
        .update(payload)
        .eq('id', projectId);

    if (error?.message?.includes('reviewerId')) {
        return {
            ok: false,
            error: new Error('Execute supabase/feats/order-project-technical-reviewer-assignment.sql no Supabase SQL Editor.')
        };
    }

    if (error) return { ok: false, error };

    return { ok: true };
}

function canDesignerActOnTechnicalReviewerProject(project) {
    if (!project || !isProjectInTechnicalReviewerProjStatus(project)) return false;
    if (isAdmin()) return true;
    return currentUser?.role === 'Projetista'
        && Number(project.designerId) === Number(currentUser?.id);
}

window.canReviewerActOnProject = canReviewerActOnProject;
window.isTechnicalReviewerReviewStartedOnProject = isTechnicalReviewerReviewStartedOnProject;
window.canReviewerStartTechnicalReviewOnProject = canReviewerStartTechnicalReviewOnProject;
window.startTechnicalReviewerReviewOnProject = startTechnicalReviewerReviewOnProject;
window.assignOrderProjectTechnicalReviewer = assignOrderProjectTechnicalReviewer;
window.canDesignerActOnTechnicalReviewerProject = canDesignerActOnTechnicalReviewerProject;
window.getOrderProjectStatusNameFromProject = getOrderProjectStatusNameFromProject;
window.isProjectInTechnicalReviewerReviewStatus = isProjectInTechnicalReviewerReviewStatus;
window.isProjectInTechnicalReviewerProjStatus = isProjectInTechnicalReviewerProjStatus;
