const ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS = 'Em Revisão Comercial Cons.';
const ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ = 'Em Revisão Comercial Proj.';
const ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR = 'Em Revisão Técnica Revisor';
const ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_LIDER_LEGACY = 'Em Revisão Técnica Lider';
const ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ = 'Em Revisão Técnica Proj.';
const ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_COMERCIAL = 'Em Revisão Comercial';
const ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_TECNICA = 'Em Revisão Técnica';

const ORDER_PROJECT_LEGACY_REVISION_STATUS_NAMES = new Set([
    'Em Revisão',
    'Em revisão'
]);

function isOrderProjectEmRevisaoComercialConsStatus(statusName) {
    const normalized = String(statusName || '').trim();
    return normalized === ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS
        || normalized === ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_COMERCIAL;
}

function isOrderProjectEmRevisaoComercialProjStatus(statusName) {
    const normalized = String(statusName || '').trim();
    return normalized === ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ
        || normalized === ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_TECNICA
        || ORDER_PROJECT_LEGACY_REVISION_STATUS_NAMES.has(normalized);
}

function isOrderProjectCommercialRevisionStatus(statusName) {
    return isOrderProjectEmRevisaoComercialConsStatus(statusName)
        || isOrderProjectEmRevisaoComercialProjStatus(statusName);
}

function isOrderProjectEmRevisaoTecnicaRevisorStatus(statusName) {
    const normalized = String(statusName || '').trim();
    return normalized === ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR
        || normalized === ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_LIDER_LEGACY;
}

function isOrderProjectEmRevisaoTecnicaProjStatus(statusName) {
    return String(statusName || '').trim() === ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ;
}

function isOrderProjectTechnicalReviewerReviewStatus(statusName) {
    return isOrderProjectEmRevisaoTecnicaRevisorStatus(statusName)
        || isOrderProjectEmRevisaoTecnicaProjStatus(statusName);
}

function normalizeOrderProjectWorkloadStatusName(statusName) {
    if (ORDER_PROJECT_LEGACY_REVISION_STATUS_NAMES.has(statusName)
        || statusName === ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_TECNICA) {
        return ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ;
    }
    if (statusName === ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_COMERCIAL) {
        return ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS;
    }
    return statusName;
}

function getOrderProjectStatusName(project) {
    return project?.projectStatus?.name || project?.statusName || '—';
}

function getOrderProjectStatusSortOrder(project) {
    const fromJoin = project?.projectStatus?.sortOrder;
    if (fromJoin != null && Number.isFinite(Number(fromJoin))) {
        return Number(fromJoin);
    }

    const statusId = project?.statusId || project?.projectStatus?.id;
    const statusName = getOrderProjectStatusName(project);

    if (typeof gestaoProjectStatusesCache !== 'undefined' && gestaoProjectStatusesCache.length) {
        const match = gestaoProjectStatusesCache.find(status =>
            (statusId && Number(status.id) === Number(statusId))
            || status.name === statusName
        );
        if (match?.sortOrder != null) {
            return Number(match.sortOrder);
        }
    }

    return null;
}

function isOrderProjectStatusInOrderRevisionsListRange(project) {
    const sortOrder = getOrderProjectStatusSortOrder(project);
    if (sortOrder == null) return false;
    return sortOrder >= ORDER_PROJECT_REVISIONS_LIST_MIN_SORT_ORDER
        && sortOrder <= ORDER_PROJECT_REVISIONS_LIST_MAX_SORT_ORDER;
}

const COMPLEMENTAR_PARENT_BLOCKED_FROM_SORT_ORDER = 10;

const ORDER_PROJECT_REVISIONS_LIST_MIN_SORT_ORDER = 10;
const ORDER_PROJECT_REVISIONS_LIST_MAX_SORT_ORDER = 14;

const COMPLEMENTAR_PARENT_BLOCKED_STATUS_NAMES = new Set([
    'Aguardando Aprovação',
    ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS,
    ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ,
    ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_COMERCIAL,
    ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_TECNICA,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ,
    'Em Revisão',
    'Em revisão',
    'Nomear',
    'Aguardando PPCP',
    'Implantação',
    'Em Produção',
    'Montagem Interna',
    'Expedição'
]);

function isComplementaryOrderProject(project) {
    return project?.isComplementary === true;
}

function canActOnOrderProject(project) {
    return !isComplementaryOrderProject(project) && !isReplacedOrderProject(project);
}

function getComplementarParentProjectCode(project) {
    return project?.parentProject?.projectCode
        || project?.parentProjectCode
        || '';
}

function getComplementarParentOrderCode(project) {
    return project?.parentProject?.order?.orderCode
        || project?.parentOrderCode
        || '';
}

function isComplementaryParentStatusAllowed(statusName, sortOrder = null) {
    if (sortOrder != null && Number(sortOrder) >= COMPLEMENTAR_PARENT_BLOCKED_FROM_SORT_ORDER) {
        return false;
    }
    return !COMPLEMENTAR_PARENT_BLOCKED_STATUS_NAMES.has(statusName);
}

function renderComplementarProjectNoticeHtml(project) {
    if (!isComplementaryOrderProject(project)) return '';

    const parentCode = getComplementarParentProjectCode(project) || '—';
    const orderCode = getComplementarParentOrderCode(project);
    const orderSuffix = orderCode ? ` · pedido ${escapeHtml(orderCode)}` : '';

    return `<span class="inline-flex items-center text-[10px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-full shrink-0" title="Projeto Complementar vinculado ao projeto ${escapeHtml(parentCode)}">Projeto Complementar · ${escapeHtml(parentCode)}${orderSuffix}</span>`;
}

function excludeComplementarPendenciasProjects(projects) {
    return (projects || []).filter(project => !isComplementaryOrderProject(project));
}

const SUBSTITUIDO_STATUS_NAME = 'Projeto Substituído';
const SUBSTITUICAO_MAX_ORIGINAL_SORT_ORDER = 8;

const SUBSTITUICAO_BLOCKED_STATUS_NAMES = new Set([
    'Projeto Técnico',
    ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS,
    ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ,
    ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_COMERCIAL,
    ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_TECNICA,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ,
    'Aguardando Aprovação',
    'Em Revisão',
    'Em revisão',
    'Nomear',
    'Aguardando PPCP',
    'Implantação',
    'Em Produção',
    'Montagem Interna',
    'Expedição',
    SUBSTITUIDO_STATUS_NAME
]);

function isReplacedOrderProject(project) {
    return project?.isReplaced === true
        || getOrderProjectStatusName(project) === SUBSTITUIDO_STATUS_NAME;
}

function isReplacementOrderProject(project) {
    return project?.isReplacement === true || Boolean(project?.replacesProjectId);
}

function isReplacedStatusName(statusName) {
    return statusName === SUBSTITUIDO_STATUS_NAME;
}

function getReplacedByProjectCode(project) {
    return project?.replacedByProject?.projectCode
        || project?.replacedByProjectCode
        || '';
}

function getReplacedByOrderCode(project) {
    return project?.replacedByProject?.order?.orderCode
        || project?.replacedByOrderCode
        || '';
}

function getReplacesProjectCode(project) {
    return project?.replacesProject?.projectCode
        || project?.replacesProjectCode
        || '';
}

function getReplacesOrderCode(project) {
    return project?.replacesProject?.order?.orderCode
        || project?.replacesOrderCode
        || '';
}

function canMarkProjectAsReplaced(project) {
    if (isReplacedOrderProject(project)) return false;
    return isReplacedEligibleStatus(project);
}

function isReplacedEligibleStatus(project) {
    if (isComplementaryOrderProject(project) || isReplacementOrderProject(project)) return false;

    const statusName = getOrderProjectStatusName(project);
    const sortOrder = project?.projectStatus?.sortOrder ?? null;

    if (sortOrder != null) {
        return Number(sortOrder) <= SUBSTITUICAO_MAX_ORIGINAL_SORT_ORDER;
    }

    return !SUBSTITUICAO_BLOCKED_STATUS_NAMES.has(statusName);
}

function getReplacedStatusId(statuses = []) {
    const list = statuses.length ? statuses : (typeof gestaoProjectStatusesCache !== 'undefined' ? gestaoProjectStatusesCache : []);
    const match = list.find(status => status.name === SUBSTITUIDO_STATUS_NAME);
    return match?.id || null;
}

function getProjectEffectiveSaleValue(project) {
    const base = Number(project?.saleValue);
    const normalizedBase = Number.isFinite(base) ? base : 0;

    if (!isReplacementOrderProject(project)) {
        return normalizedBase;
    }

    const originalValue = Number(
        project?.replacesProject?.saleValue
        || project?.replacesOriginalSaleValue
    );
    return normalizedBase + (Number.isFinite(originalValue) ? originalValue : 0);
}

function renderReplacedProjectNoticeHtml(project) {
    if (!isReplacedOrderProject(project)) return '';

    const orderCode = getReplacedByOrderCode(project) || '—';
    const replacementCode = getReplacedByProjectCode(project);
    const projectSuffix = replacementCode ? ` · proj. ${escapeHtml(replacementCode)}` : '';

    return `<span class="inline-flex items-center text-[10px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full shrink-0" title="Projeto Substituído pelo pedido ${escapeHtml(orderCode)}${replacementCode ? ` (projeto ${escapeHtml(replacementCode)})` : ''}">Projeto Substituído · pedido ${escapeHtml(orderCode)}${projectSuffix}</span>`;
}

function renderReplacementProjectNoticeHtml(project) {
    if (!isReplacementOrderProject(project)) return '';

    const orderCode = getReplacesOrderCode(project) || '—';
    const originalCode = getReplacesProjectCode(project);
    const projectSuffix = originalCode ? ` · proj. ${escapeHtml(originalCode)}` : '';

    return `<span class="inline-flex items-center text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0" title="Projeto Substituição do pedido ${escapeHtml(orderCode)}${originalCode ? ` (projeto ${escapeHtml(originalCode)})` : ''}">Projeto Substituição · pedido ${escapeHtml(orderCode)}${projectSuffix}</span>`;
}

function excludeReplacedPendenciasProjects(projects) {
    return (projects || []).filter(project => !isReplacedOrderProject(project));
}

function excludeInactivePendenciasProjects(projects) {
    return excludeReplacedPendenciasProjects(excludeComplementarPendenciasProjects(projects));
}

function applyComplementarReadOnlyToElement(root, project) {
    if (!root || !isComplementaryOrderProject(project)) return false;

    root.classList.add('order-project-complementar-readonly', 'opacity-70');
    root.querySelectorAll('input:not([type="hidden"]), button, select, textarea').forEach(element => {
        element.disabled = true;
    });

    return true;
}

function applyReplacedReadOnlyToElement(root, project) {
    if (!root || !isReplacedOrderProject(project)) return false;

    root.classList.add('order-project-substituido-readonly', 'opacity-70');
    root.querySelectorAll('input:not([type="hidden"]), button, select, textarea').forEach(element => {
        element.disabled = true;
    });

    return true;
}

function applyOrderProjectReadOnlyToElement(root, project) {
    return applyComplementarReadOnlyToElement(root, project)
        || applyReplacedReadOnlyToElement(root, project);
}
