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

    const rows = (projects || []).map(project => {
        const statusChangedAt = statusChangedAtByProject[project.id];
        const revision = revisionsByProject[project.id];
        return mapPendenciasInteractiveIdentity(project, {
            revisionProgressLabel: getTechnicalReviewerRevisionProgressLabel(revision),
            revisionProgressClass: getTechnicalReviewerRevisionProgressClass(revision),
            statusChangedAtLabel: statusChangedAt ? formatDate(statusChangedAt) : '—',
            statusChangedAt,
            canAct: canReviewerActOnProject(project)
        });
    });

    const columns = [
        ...getPendenciasInteractiveIdentityColumns({ includeDesigner: overviewMode }),
        getPendenciasInteractiveStatusColumn({
            key: 'revisionProgressLabel',
            label: 'Revisão',
            render: (row) => `<span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${row.revisionProgressClass}">${escapeHtml(row.revisionProgressLabel || '—')}</span>`
        }),
        getPendenciasInteractiveDateColumn({
            key: 'statusChangedAtLabel',
            label: 'Desde',
            sortKey: 'statusChangedAt',
            cellClass: 'p-3 text-xs text-slate-500 whitespace-nowrap'
        })
    ];

    if (!overviewMode) {
        columns.push(
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-40',
                render: (row) => row.canAct
                    ? `<div class="flex flex-wrap justify-end gap-1.5">
                        <button type="button" onclick="approveTechnicalReviewerProjectToNomear(${row.id})"
                            class="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1 rounded-lg font-medium">Aprovar</button>
                        <button type="button" onclick="openTechnicalReviewerRevisionModal(${row.id})"
                            class="text-xs bg-teal-100 text-teal-800 hover:bg-teal-200 px-2.5 py-1 rounded-lg font-medium">Revisão</button>
                    </div>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        );
    }

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Em Revisão Técnica Revisor',
        subtitle: overviewMode
            ? 'Todos os projetos aguardando revisão do revisor.'
            : 'Projetos aguardando sua revisão técnica.',
        refreshButtonId: 'btn-pendencias-refresh-em-revisao-tecnica-revisor',
        refreshButtonClass: 'order-tab-action-btn text-xs bg-white border border-teal-200 text-teal-800 px-3 py-1.5 rounded-lg font-medium hover:bg-teal-50',
        onRefresh: loadPendenciasEmRevisaoTecnicaRevisor,
        tableId: 'pendencias-em-revisao-tecnica-revisor',
        rows,
        columns,
        emptyMessage: overviewMode
            ? 'Nenhum projeto em revisão técnica do revisor.'
            : 'Nenhum projeto aguardando revisão do revisor.',
        minWidth: overviewMode ? '960px' : '820px'
    });
}

function renderPendenciasEmRevisaoTecnicaProjList(projects, statusChangedAtByProject, revisionsByProject, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (projects || []).map(project => {
        const statusChangedAt = statusChangedAtByProject[project.id];
        const revision = revisionsByProject[project.id];
        return mapPendenciasInteractiveIdentity(project, {
            revisionProgressLabel: getTechnicalReviewerRevisionProgressLabel(revision),
            revisionProgressClass: getTechnicalReviewerRevisionProgressClass(revision),
            statusChangedAtLabel: statusChangedAt ? formatDate(statusChangedAt) : '—',
            statusChangedAt,
            canAct: canDesignerActOnTechnicalReviewerProject(project)
        });
    });

    const columns = [
        ...getPendenciasInteractiveIdentityColumns({ includeDesigner: overviewMode }),
        getPendenciasInteractiveStatusColumn({
            key: 'revisionProgressLabel',
            label: 'Revisão',
            render: (row) => `<span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${row.revisionProgressClass}">${escapeHtml(row.revisionProgressLabel || '—')}</span>`
        }),
        getPendenciasInteractiveDateColumn({
            key: 'statusChangedAtLabel',
            label: 'Desde',
            sortKey: 'statusChangedAt',
            cellClass: 'p-3 text-xs text-slate-500 whitespace-nowrap'
        })
    ];

    if (!overviewMode) {
        columns.push(
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-36',
                render: (row) => row.canAct
                    ? `<button type="button" onclick="openTechnicalReviewerRevisionModal(${row.id})"
                        class="text-xs bg-teal-100 text-teal-800 hover:bg-teal-200 px-2.5 py-1 rounded-lg font-medium">Executar Revisão</button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        );
    }

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Em Revisão Técnica Proj.',
        subtitle: overviewMode
            ? 'Todos os projetos em revisão técnica do projetista.'
            : 'Projetos em revisão técnica sob sua responsabilidade.',
        refreshButtonId: 'btn-pendencias-refresh-em-revisao-tecnica-proj',
        refreshButtonClass: 'order-tab-action-btn text-xs bg-white border border-teal-200 text-teal-800 px-3 py-1.5 rounded-lg font-medium hover:bg-teal-50',
        onRefresh: loadPendenciasEmRevisaoTecnicaProj,
        tableId: 'pendencias-em-revisao-tecnica-proj',
        rows,
        columns,
        emptyMessage: overviewMode
            ? 'Nenhum projeto em revisão técnica do projetista.'
            : 'Nenhum projeto em revisão técnica associado a você.',
        minWidth: overviewMode ? '960px' : '820px'
    });
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
