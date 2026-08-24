const PENDENCIAS_STATUS_EM_REVISAO_TECNICA_REVISOR = ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR;
const PENDENCIAS_STATUS_EM_REVISAO_TECNICA_PROJ = ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ;

function canSeePendenciasReviewerItems() {
    return canSeeAllPendenciasMenus() || isReviewer();
}

function isPendenciasTechnicalReviewerOverviewMode() {
    return isPendenciasProjetistaOverviewMode() || isGestorProjetos();
}

function canAccessPendenciasEmRevisaoTecnicaRevisor() {
    return canSeePendenciasReviewerItems();
}

function canAccessPendenciasEmRevisaoTecnicaProj() {
    return canSeeAllPendenciasMenus()
        || isGestorProjetos()
        || currentUser?.role === 'Projetista';
}

async function fetchTechnicalReviewerStatusChangedAtByProjectIds(projectIds, statusNames) {
    if (!projectIds.length || !statusNames.length) return {};

    const statusIds = await getPendenciasStatusIdsByNames(statusNames);
    if (!statusIds.length) return {};

    const { data, error } = await supabaseClient
        .from('OrderProjectStatusHistory')
        .select('orderProjectId, changedAt, newStatusId')
        .in('orderProjectId', projectIds)
        .in('newStatusId', statusIds)
        .order('changedAt', { ascending: false });

    if (error) {
        console.error('fetchTechnicalReviewerStatusChangedAtByProjectIds:', error);
        return {};
    }

    const byProject = {};
    (data || []).forEach(entry => {
        if (!byProject[entry.orderProjectId]) {
            byProject[entry.orderProjectId] = entry.changedAt;
        }
    });
    return byProject;
}

async function fetchPendenciasEmRevisaoTecnicaRevisorProjects() {
    const overviewMode = isPendenciasTechnicalReviewerOverviewMode();

    const statusIds = await getPendenciasStatusIdsByNames([
        PENDENCIAS_STATUS_EM_REVISAO_TECNICA_REVISOR,
        ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_LIDER_LEGACY
    ]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_EM_REVISAO_TECNICA_REVISOR}" não encontrado.`),
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            revisionsByProject: {}
        };
    }

    const result = await queryPendenciasProjects({ statusIds });
    if (result.error) {
        return {
            error: result.error,
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            revisionsByProject: {}
        };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);
    if (overviewMode) {
        projects = await enrichPendenciasProjectsWithDesigner(projects);
    }

    const projectIds = projects.map(project => project.id);
    const statusChangedAtByProject = await fetchTechnicalReviewerStatusChangedAtByProjectIds(
        projectIds,
        [PENDENCIAS_STATUS_EM_REVISAO_TECNICA_REVISOR, ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_LIDER_LEGACY]
    );

    const revisions = await fetchRevisionsByOrderProjectIds(projectIds, [REVISION_TYPE_TECHNICAL_REVISOR]);
    const openRevisions = revisions.filter(revision => revision.status === REVISION_STATUS_OPEN);
    const revisionIds = openRevisions.map(revision => revision.id);
    const activities = await fetchRevisionActivitiesByRevisionIds(revisionIds);

    const activitiesByRevision = {};
    activities.forEach(activity => {
        if (!activitiesByRevision[activity.revisionId]) {
            activitiesByRevision[activity.revisionId] = [];
        }
        activitiesByRevision[activity.revisionId].push(activity);
    });

    const revisionsByProject = {};
    openRevisions.forEach(revision => {
        revisionsByProject[revision.orderProjectId] = {
            ...revision,
            activities: activitiesByRevision[revision.id] || []
        };
    });

    return {
        error: null,
        overviewMode,
        projects,
        statusChangedAtByProject,
        revisionsByProject
    };
}

async function fetchPendenciasEmRevisaoTecnicaProjProjects() {
    const overviewMode = isPendenciasTechnicalReviewerOverviewMode();
    const userId = Number(currentUser?.id);

    if (!overviewMode && !userId) {
        return {
            error: null,
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            revisionsByProject: {}
        };
    }

    const statusIds = await getPendenciasStatusIdsByNames([PENDENCIAS_STATUS_EM_REVISAO_TECNICA_PROJ]);
    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_EM_REVISAO_TECNICA_PROJ}" não encontrado.`),
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            revisionsByProject: {}
        };
    }

    const result = await queryPendenciasProjects(
        overviewMode
            ? { statusIds }
            : { statusIds, designerId: userId }
    );

    if (result.error) {
        return {
            error: result.error,
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            revisionsByProject: {}
        };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);
    if (overviewMode) {
        projects = await enrichPendenciasProjectsWithDesigner(projects);
    }

    const projectIds = projects.map(project => project.id);
    const statusChangedAtByProject = await fetchTechnicalReviewerStatusChangedAtByProjectIds(
        projectIds,
        [PENDENCIAS_STATUS_EM_REVISAO_TECNICA_PROJ]
    );

    const revisions = await fetchRevisionsByOrderProjectIds(projectIds, [REVISION_TYPE_TECHNICAL_REVISOR]);
    const openRevisions = revisions.filter(revision => revision.status === REVISION_STATUS_OPEN);
    const revisionIds = openRevisions.map(revision => revision.id);
    const activities = await fetchRevisionActivitiesByRevisionIds(revisionIds);

    const activitiesByRevision = {};
    activities.forEach(activity => {
        if (!activitiesByRevision[activity.revisionId]) {
            activitiesByRevision[activity.revisionId] = [];
        }
        activitiesByRevision[activity.revisionId].push(activity);
    });

    const revisionsByProject = {};
    openRevisions.forEach(revision => {
        revisionsByProject[revision.orderProjectId] = {
            ...revision,
            activities: activitiesByRevision[revision.id] || []
        };
    });

    return {
        error: null,
        overviewMode,
        projects,
        statusChangedAtByProject,
        revisionsByProject
    };
}

function getTechnicalReviewerRevisionProgressLabel(revision) {
    if (!revision) return 'Sem revisão';
    if (revision.revisionCompletedAt) return 'Concluída';
    if (revision.revisionStartedAt) {
        const total = revision.activities?.length || 0;
        const done = revision.activities?.filter(activity => activity.completed).length || 0;
        if (total && done < total) return `${done}/${total} atividades`;
        return 'Em andamento';
    }
    if (!revision.activities?.length) return 'Sem atividades';
    return 'Aguardando início';
}

function getTechnicalReviewerRevisionProgressClass(revision) {
    if (!revision) return 'bg-slate-100 text-slate-600';
    if (revision.revisionCompletedAt) return 'bg-emerald-100 text-emerald-800';
    if (revision.revisionStartedAt) return 'bg-sky-100 text-sky-800';
    if (!revision.activities?.length) return 'bg-slate-100 text-slate-600';
    return 'bg-amber-100 text-amber-800';
}

function renderPendenciasEmRevisaoTecnicaRevisorList(projects, statusChangedAtByProject, revisionsByProject, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = getOrderClientName(project.order) || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const designerName = project.designer?.name || '—';
        const statusChangedAt = statusChangedAtByProject[project.id];
        const revision = revisionsByProject[project.id];
        const revisionProgressLabel = getTechnicalReviewerRevisionProgressLabel(revision);
        const revisionProgressClass = getTechnicalReviewerRevisionProgressClass(revision);
        const canAct = canReviewerActOnProject(project);

        const actionCell = canAct
            ? `<div class="flex flex-wrap justify-end gap-1.5">
                <button type="button" onclick="approveTechnicalReviewerProjectToNomear(${project.id})"
                    class="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1 rounded-lg font-medium">Aprovar</button>
                <button type="button" onclick="openTechnicalReviewerRevisionModal(${project.id})"
                    class="text-xs bg-teal-100 text-teal-800 hover:bg-teal-200 px-2.5 py-1 rounded-lg font-medium">Revisão</button>
            </div>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                ${overviewMode ? `<td class="p-3 text-xs text-slate-700">${escapeHtml(designerName)}</td>` : ''}
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3">
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${revisionProgressClass}">${escapeHtml(revisionProgressLabel)}</span>
                </td>
                <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${statusChangedAt ? formatDate(statusChangedAt) : '—'}</td>
                ${overviewMode ? '' : `<td class="p-3 text-right whitespace-nowrap">${actionCell}</td>`}
            </tr>
        `;
    }).join('');

    const subtitle = overviewMode
        ? 'Todos os projetos aguardando revisão do revisor.'
        : 'Projetos aguardando sua revisão técnica.';
    const emptyMessage = overviewMode
        ? 'Nenhum projeto em revisão técnica do revisor.'
        : 'Nenhum projeto aguardando revisão do revisor.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Em Revisão Técnica Revisor</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-em-revisao-tecnica-revisor"
                    class="order-tab-action-btn text-xs bg-white border border-teal-200 text-teal-800 px-3 py-1.5 rounded-lg font-medium hover:bg-teal-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[${overviewMode ? '960' : '820'}px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                ${overviewMode ? '<th class="text-left p-3 font-semibold">Projetista</th>' : ''}
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Revisão</th>
                                <th class="text-left p-3 font-semibold">Desde</th>
                                ${overviewMode ? '' : '<th class="text-right p-3 font-semibold w-40">Ações</th>'}
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-em-revisao-tecnica-revisor')
        ?.addEventListener('click', () => loadPendenciasEmRevisaoTecnicaRevisor());
}

function renderPendenciasEmRevisaoTecnicaProjList(projects, statusChangedAtByProject, revisionsByProject, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = getOrderClientName(project.order) || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const designerName = project.designer?.name || '—';
        const statusChangedAt = statusChangedAtByProject[project.id];
        const revision = revisionsByProject[project.id];
        const revisionProgressLabel = getTechnicalReviewerRevisionProgressLabel(revision);
        const revisionProgressClass = getTechnicalReviewerRevisionProgressClass(revision);
        const canAct = canDesignerActOnTechnicalReviewerProject(project);

        const actionCell = canAct
            ? `<button type="button" onclick="openTechnicalReviewerRevisionModal(${project.id})"
                class="text-xs bg-teal-100 text-teal-800 hover:bg-teal-200 px-2.5 py-1 rounded-lg font-medium">Executar Revisão</button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                ${overviewMode ? `<td class="p-3 text-xs text-slate-700">${escapeHtml(designerName)}</td>` : ''}
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3">
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${revisionProgressClass}">${escapeHtml(revisionProgressLabel)}</span>
                </td>
                <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${statusChangedAt ? formatDate(statusChangedAt) : '—'}</td>
                ${overviewMode ? '' : `<td class="p-3 text-right whitespace-nowrap">${actionCell}</td>`}
            </tr>
        `;
    }).join('');

    const subtitle = overviewMode
        ? 'Todos os projetos em revisão técnica do projetista.'
        : 'Projetos em revisão técnica sob sua responsabilidade.';
    const emptyMessage = overviewMode
        ? 'Nenhum projeto em revisão técnica do projetista.'
        : 'Nenhum projeto em revisão técnica associado a você.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Em Revisão Técnica Proj.</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-em-revisao-tecnica-proj"
                    class="order-tab-action-btn text-xs bg-white border border-teal-200 text-teal-800 px-3 py-1.5 rounded-lg font-medium hover:bg-teal-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[${overviewMode ? '960' : '820'}px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                ${overviewMode ? '<th class="text-left p-3 font-semibold">Projetista</th>' : ''}
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Revisão</th>
                                <th class="text-left p-3 font-semibold">Desde</th>
                                ${overviewMode ? '' : '<th class="text-right p-3 font-semibold w-36">Ações</th>'}
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-em-revisao-tecnica-proj')
        ?.addEventListener('click', () => loadPendenciasEmRevisaoTecnicaProj());
}

async function loadPendenciasEmRevisaoTecnicaRevisor() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasEmRevisaoTecnicaRevisor()) {
        renderPendenciasPlaceholder('Em Revisão Técnica Revisor', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, statusChangedAtByProject, revisionsByProject } =
        await fetchPendenciasEmRevisaoTecnicaRevisorProjects();

    if (error) {
        renderPendenciasPlaceholder('Em Revisão Técnica Revisor', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEmRevisaoTecnicaRevisorList(
        projects,
        statusChangedAtByProject,
        revisionsByProject,
        overviewMode
    );
}

async function loadPendenciasEmRevisaoTecnicaProj() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasEmRevisaoTecnicaProj()) {
        renderPendenciasPlaceholder('Em Revisão Técnica Proj.', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, statusChangedAtByProject, revisionsByProject } =
        await fetchPendenciasEmRevisaoTecnicaProjProjects();

    if (error) {
        renderPendenciasPlaceholder('Em Revisão Técnica Proj.', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEmRevisaoTecnicaProjList(
        projects,
        statusChangedAtByProject,
        revisionsByProject,
        overviewMode
    );
}

window.loadPendenciasEmRevisaoTecnicaRevisor = loadPendenciasEmRevisaoTecnicaRevisor;
window.loadPendenciasEmRevisaoTecnicaProj = loadPendenciasEmRevisaoTecnicaProj;
