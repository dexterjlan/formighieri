async function fetchEmRevisaoStatusChangedAtByProjectIds(projectIds) {
    if (!projectIds.length) return {};

    const statusIds = await getPendenciasStatusIdsByNames([
        PENDENCIAS_STATUS_EM_REVISAO_TECNICA,
        PENDENCIAS_STATUS_EM_REVISAO,
        'Em revisão'
    ]);
    if (!statusIds.length) return {};

    const { data, error } = await supabaseClient
        .from('OrderProjectStatusHistory')
        .select('orderProjectId, changedAt, newStatusId')
        .in('orderProjectId', projectIds)
        .in('newStatusId', statusIds)
        .order('changedAt', { ascending: false });

    if (error) {
        console.error('fetchEmRevisaoStatusChangedAtByProjectIds:', error);
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


function isPendenciasEmRevisaoOverviewMode() {
    return isPendenciasProjetistaOverviewMode() || isGestorProjetos();
}

function canAccessPendenciasEmRevisao() {
    return currentUser?.role === 'Projetista' || isAdmin() || isGestorProjetos();
}

async function enrichPendenciasProjectsWithDesigner(projects) {
    if (!projects.length) return projects;
    if (projects.every(project => project.designer?.name || !project.designerId)) return projects;

    const designerIds = [...new Set(projects.map(project => project.designerId).filter(Boolean))];
    if (!designerIds.length) return projects;

    const { data: designers, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .in('id', designerIds);

    if (error) {
        console.error('enrichPendenciasProjectsWithDesigner:', error);
        return projects;
    }

    const designerById = Object.fromEntries((designers || []).map(user => [user.id, user]));
    return projects.map(project => ({
        ...project,
        designer: project.designer || designerById[project.designerId] || null
    }));
}

async function fetchPendenciasEmRevisaoProjects() {
    const overviewMode = isPendenciasEmRevisaoOverviewMode();
    const userId = Number(currentUser?.id);

    if (!overviewMode && !userId) {
        return {
            error: null,
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            approvalsByProject: {},
            revisionsByApproval: {}
        };
    }

    const statusIds = await getPendenciasStatusIdsByNames([
        PENDENCIAS_STATUS_EM_REVISAO_TECNICA,
        PENDENCIAS_STATUS_EM_REVISAO,
        'Em revisão'
    ]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_EM_REVISAO_TECNICA}" não encontrado.`),
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            approvalsByProject: {},
            revisionsByApproval: {}
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
            approvalsByProject: {},
            revisionsByApproval: {}
        };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);
    if (overviewMode) {
        projects = await enrichPendenciasProjectsWithDesigner(projects);
    }

    const projectIds = projects.map(project => project.id);
    const [statusChangedAtByProject, approvalsByProject] = await Promise.all([
        fetchEmRevisaoStatusChangedAtByProjectIds(projectIds),
        fetchCommercialApprovalsByProjectIds(projectIds, projects)
    ]);

    const approvalIds = Object.values(approvalsByProject).map(approval => approval.id).filter(Boolean);
    const revisionsByApproval = typeof fetchLatestTechnicalRevisionsByApprovalIds === 'function'
        ? await fetchLatestTechnicalRevisionsByApprovalIds(approvalIds)
        : {};

    return {
        error: null,
        overviewMode,
        projects,
        statusChangedAtByProject,
        approvalsByProject,
        revisionsByApproval
    };
}

function renderPendenciasEmRevisaoList(projects, statusChangedAtByProject, approvalsByProject, overviewMode, revisionsByApproval = {}) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (projects || []).map(project => {
        const statusChangedAt = statusChangedAtByProject[project.id];
        const approval = approvalsByProject[project.id];
        const revision = approval ? revisionsByApproval[approval.id] : null;
        const canViewRevision = !overviewMode
            && approval
            && typeof canViewCommercialRevision === 'function'
            && canViewCommercialRevision(approval);

        return mapPendenciasInteractiveIdentity(project, {
            revisionProgressLabel: typeof getTechnicalRevisionProgressLabel === 'function'
                ? getTechnicalRevisionProgressLabel(revision)
                : '—',
            revisionProgressClass: typeof getTechnicalRevisionProgressBadgeClass === 'function'
                ? getTechnicalRevisionProgressBadgeClass(revision)
                : 'bg-slate-100 text-slate-600',
            revisionStartedAtLabel: revision?.revisionStartedAt
                ? formatDate(revision.revisionStartedAt)
                : '—',
            revisionStartedAt: revision?.revisionStartedAt || null,
            statusChangedAtLabel: statusChangedAt ? formatDate(statusChangedAt) : '—',
            statusChangedAt,
            canViewRevision,
            approvalId: approval?.id
        });
    });

    const columns = [
        ...getPendenciasInteractiveIdentityColumns({ includeDesigner: overviewMode })
    ];

    if (overviewMode) {
        columns.push(
            getPendenciasInteractiveStatusColumn({
                key: 'revisionProgressLabel',
                label: 'Revisão',
                render: (row) => `<span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${row.revisionProgressClass}">${escapeHtml(row.revisionProgressLabel || '—')}</span>`
            }),
            getPendenciasInteractiveDateColumn({
                key: 'revisionStartedAtLabel',
                label: 'Início revisão',
                sortKey: 'revisionStartedAt',
                cellClass: 'p-3 text-xs text-slate-500 whitespace-nowrap'
            })
        );
    }

    columns.push(
        getPendenciasInteractiveDateColumn({
            key: 'statusChangedAtLabel',
            label: 'Data Em Revisão',
            sortKey: 'statusChangedAt',
            cellClass: 'p-3 text-xs text-slate-500 whitespace-nowrap'
        })
    );

    if (!overviewMode) {
        columns.push(
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-32',
                render: (row) => row.canViewRevision
                    ? `<button type="button" onclick="openCommercialRevisionsHistoryView(${row.approvalId})"
                        class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Revisões</button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        );
    }

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Em Revisão',
        subtitle: overviewMode
            ? 'Todos os projetos em revisão.'
            : 'Projetos associados a você neste status.',
        refreshButtonId: 'btn-pendencias-refresh-em-revisao',
        onRefresh: loadPendenciasEmRevisao,
        tableId: 'pendencias-em-revisao',
        rows,
        columns,
        emptyMessage: overviewMode
            ? 'Nenhum projeto em revisão.'
            : 'Nenhum projeto em revisão associado a você.',
        minWidth: overviewMode ? '1080px' : '820px'
    });
}

async function loadPendenciasEmRevisao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasEmRevisao()) {
        renderPendenciasPlaceholder('Em Revisão', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, statusChangedAtByProject, approvalsByProject, revisionsByApproval } =
        await fetchPendenciasEmRevisaoProjects();

    if (error) {
        renderPendenciasPlaceholder('Em Revisão', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEmRevisaoList(
        projects,
        statusChangedAtByProject,
        approvalsByProject,
        overviewMode,
        revisionsByApproval || {}
    );
}

function isPendenciasProjetoTecnicoOverviewMode() {
    return isPendenciasProjetistaOverviewMode() || isGestorProjetos();
}

function canAccessPendenciasProjetoTecnico() {
    return currentUser?.role === 'Projetista' || isAdmin() || isGestorProjetos();
}

function canSubmitCommercialApprovalFromPendencias(project, approval) {
    if (!project) return false;

    if (approval) {
        const approvalStatusName = getCommercialApprovalProjectStatusName(approval)
            || approval?.projectStatus?.name
            || approval?.status
            || '';
        const hasOpenWorkflow = typeof isProjectInOpenCommercialWorkflow === 'function'
            ? isProjectInOpenCommercialWorkflow(approvalStatusName)
            : !isCommercialApprovalApproved(approval);

        if (hasOpenWorkflow && !isCommercialApprovalApproved(approval)) {
            return false;
        }
    }

    if (typeof isAdmin === 'function' ? isAdmin() : currentUser?.role === 'Admin') return true;
    if (typeof isGestorProjetos === 'function' && isGestorProjetos()) return true;

    const designerId = project.designerId || approval?.designerId;
    if (!designerId) return false;

    return currentUser?.role === 'Projetista'
        && Number(designerId) === Number(currentUser.id);
}

async function fetchPendenciasProjetoTecnicoProjects() {
    const overviewMode = isPendenciasProjetoTecnicoOverviewMode();
    const userId = Number(currentUser?.id);

    if (!overviewMode && !userId) {
        return {
            error: null,
            overviewMode,
            projects: [],
            approvalsByProject: {}
        };
    }

    const statusIds = await getPendenciasStatusIdsByNames([PENDENCIAS_STATUS_PROJETO_TECNICO]);
    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_PROJETO_TECNICO}" não encontrado.`),
            overviewMode,
            projects: [],
            approvalsByProject: {}
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
            approvalsByProject: {}
        };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);
    if (overviewMode) {
        projects = await enrichPendenciasProjectsWithDesigner(projects);
    }

    const approvalsByProject = await fetchCommercialApprovalsByProjectIds(
        projects.map(project => project.id),
        projects
    );

    return {
        error: null,
        overviewMode,
        projects,
        approvalsByProject
    };
}

function renderPendenciasProjetoTecnicoList(projects, approvalsByProject, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (projects || []).map(project => {
        const approval = approvalsByProject[project.id];
        return mapPendenciasInteractiveIdentity(project, {
            deliveryLabel: formatPendenciasDeliveryDate(project.deliveryDate),
            deliveryDate: project.deliveryDate,
            canSubmit: canSubmitCommercialApprovalFromPendencias(project, approval),
            hasOpenApproval: Boolean(approval && !isCommercialApprovalApproved(approval))
        });
    });

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Projeto Técnico',
        subtitle: overviewMode
            ? 'Todos os projetos em projeto técnico.'
            : 'Projetos associados a você neste status.',
        refreshButtonId: 'btn-pendencias-refresh-projeto-tecnico',
        onRefresh: loadPendenciasProjetoTecnico,
        tableId: 'pendencias-projeto-tecnico',
        rows,
        emptyMessage: overviewMode
            ? 'Nenhum projeto em projeto técnico.'
            : 'Nenhum projeto em projeto técnico associado a você.',
        minWidth: overviewMode ? '920px' : '820px',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({ includeDesigner: overviewMode }),
            getPendenciasInteractiveDateColumn({
                key: 'deliveryLabel',
                label: 'Entrega',
                sortKey: 'deliveryDate'
            }),
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-44',
                render: (row) => row.canSubmit
                    ? `<button type="button" onclick="submitCommercialApprovalFromPendencias(${row.id})"
                        class="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1 rounded-lg font-medium">Enviar para Aprovação</button>`
                    : row.hasOpenApproval
                        ? '<span class="text-xs text-amber-700">Aprovação em aberto</span>'
                        : '<span class="text-xs text-slate-300">—</span>'
            })
        ]
    });
}

async function loadPendenciasProjetoTecnico() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasProjetoTecnico()) {
        renderPendenciasPlaceholder('Projeto Técnico', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, approvalsByProject } =
        await fetchPendenciasProjetoTecnicoProjects();

    if (error) {
        renderPendenciasPlaceholder('Projeto Técnico', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasProjetoTecnicoList(projects, approvalsByProject, overviewMode);
}

function isPendenciasRequisicaoOverviewMode() {
    return isPendenciasProjetistaOverviewMode() || isGestorProjetos();
}

function canAccessPendenciasRequisicao() {
    return currentUser?.role === 'Projetista' || isAdmin() || isGestorProjetos();
}

function getPendenciasRequestProjectLabel(request) {
    const project = request?.orderProject;
    if (!project) return '—';
    const name = project.name || project.projectCode || '—';
    const env = project.environmentType?.name ? ` (${project.environmentType.name})` : '';
    return `${name}${env}`;
}

function canCreatePendenciasRequisicao() {
    return typeof canActOrderDetailTab === 'function' && canActOrderDetailTab('requests');
}

function getPendenciasRequestOrderLabel(order) {
    const code = order?.orderCode || '';
    const clientName = typeof getOrderClientName === 'function' ? getOrderClientName(order) : '';
    return [code, clientName].filter(Boolean).join(' · ');
}

async function openCreateRequestFromPendencias() {
    if (!canCreatePendenciasRequisicao()) {
        alertAppDialog('Sem permissão para criar requisição.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (typeof openOrderCodePicker !== 'function') {
        alertAppDialog('Busca de pedido indisponível.');
        return;
    }

    const pickerConfig = {
        onSelect: async (order) => {
            if (!order?.id) {
                alertAppDialog('Pedido inválido.');
                return;
            }
            if (typeof openConvModal !== 'function') {
                alertAppDialog('Tela de requisição indisponível.');
                return;
            }

            await openConvModal({
                orderId: order.id,
                source: 'pendencias',
                orderLabel: getPendenciasRequestOrderLabel(order)
            });
        }
    };

    if (currentUser?.role === 'Projetista'
        && typeof fetchEligibleOrdersForCurrentDesignerRequest === 'function') {
        pickerConfig.filterLocally = true;
        pickerConfig.hideSearchButton = true;
        pickerConfig.loadOrders = fetchEligibleOrdersForCurrentDesignerRequest;
        pickerConfig.title = 'Selecionar pedido';
        pickerConfig.description = 'Pedidos com projetos associados a você, elegíveis para requisição. Filtre pelo cliente se quiser.';
        pickerConfig.searchLabel = 'Filtrar pelo cliente';
        pickerConfig.searchPlaceholder = 'Nome do cliente';
        pickerConfig.emptySourceMessage = 'Nenhum pedido com projeto associado a você elegível para requisição.';
    }

    openOrderCodePicker(pickerConfig);
}

window.openCreateRequestFromPendencias = openCreateRequestFromPendencias;

async function enrichPendenciasRequestsWithDesigner(requests) {
    if (!requests.length) return requests;
    if (requests.every(request => request.designerName || !request.designerId)) return requests;

    const designerIds = [...new Set(requests.map(request => request.designerId).filter(Boolean))];
    if (!designerIds.length) return requests;

    const { data: designers, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .in('id', designerIds);

    if (error) {
        console.error('enrichPendenciasRequestsWithDesigner:', error);
        return requests;
    }

    const designerById = Object.fromEntries((designers || []).map(user => [user.id, user.name]));
    return requests.map(request => ({
        ...request,
        designerName: request.designerName || designerById[request.designerId] || '—'
    }));
}

async function fetchPendenciasRequisicaoRequests() {
    const overviewMode = isPendenciasRequisicaoOverviewMode();
    const userId = Number(currentUser?.id);

    if (!overviewMode && !userId) {
        return { error: null, overviewMode, requests: [] };
    }

    const selectWithProject = `
        *,
        order:salesOrders(${getSalesOrderMinimalEmbedSelect()}),
        orderProject:OrderProject(id, name, projectCode, environmentType:EnvironmentType(name))
    `;
    const selectFallback = `
        *,
        order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
    `;

    let result = await supabaseClient
        .from('OrderRequest')
        .select(selectWithProject)
        .order('createdAt', { ascending: false });

    if (result.error?.message?.includes('orderProject')) {
        result = await supabaseClient
            .from('OrderRequest')
            .select(selectFallback)
            .order('createdAt', { ascending: false });
    }

    if (result.error) {
        return { error: result.error, overviewMode, requests: [] };
    }

    let requests = (result.data || []).filter(request => isRequestWaitingProjetista(request) && isProjectRequest(request));

    if (!overviewMode) {
        requests = requests.filter(request => Number(request.designerId) === userId);
    }

    requests = sortOrderRequests(requests);

    if (overviewMode) {
        requests = await enrichPendenciasRequestsWithDesigner(requests);
    }

    pendenciasRequisicaoCache = requests;
    return { error: null, overviewMode, requests };
}

function renderPendenciasRequisicaoList(requests, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (requests || []).map(request => mapPendenciasInteractiveIdentity(request, {
        projectName: getPendenciasRequestProjectLabel(request),
        designerName: request.designerName || '—',
        createdAtLabel: request.createdAt ? formatDate(request.createdAt) : '—',
        createdAt: request.createdAt,
        canViewRequest: !overviewMode
            && isRequestWaitingProjetista(request)
            && canEditProjetistaResponse(request)
    }));

    const columns = [
        ...getPendenciasInteractiveIdentityColumns({ includeDesigner: overviewMode }),
        getPendenciasInteractiveDateColumn({
            key: 'createdAtLabel',
            label: 'Data Abertura',
            sortKey: 'createdAt',
            cellClass: 'p-3 text-xs text-slate-500 whitespace-nowrap'
        })
    ];

    if (!overviewMode) {
        columns.push(
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-36',
                render: (row) => row.canViewRequest
                    ? `<button type="button" onclick="openRequestFromPendencias(${row.id})"
                        class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Requisição</button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        );
    }

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Requisição',
        subtitle: overviewMode
            ? 'Requisições em aberto aguardando resposta do projetista.'
            : 'Requisições aguardando sua resposta.',
        refreshButtonId: 'btn-pendencias-refresh-requisicao',
        onRefresh: loadPendenciasRequisicao,
        tableId: 'pendencias-requisicao',
        rows,
        columns,
        emptyMessage: overviewMode
            ? 'Nenhuma requisição aguardando projetista.'
            : 'Nenhuma requisição aguardando sua resposta.',
        minWidth: overviewMode ? '920px' : '820px',
        headerActionsHtml: canCreatePendenciasRequisicao()
            ? `<button type="button" id="btn-pendencias-create-requisicao"
                class="order-tab-action-btn text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-slate-800">
                <svg class="order-tab-action-btn__icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 2.5a.5.5 0 0 1 .5.5v4.5H13a.5.5 0 0 1 0 1H8.5V13a.5.5 0 0 1-1 0V8.5H3a.5.5 0 0 1 0-1h4.5V3a.5.5 0 0 1 .5-.5z"/></svg>
                <span>Criar Requisição</span>
            </button>`
            : ''
    });

    content.querySelector('#btn-pendencias-create-requisicao')
        ?.addEventListener('click', () => openCreateRequestFromPendencias());
}

async function loadPendenciasRequisicao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando requisições...</p>';
    }

    if (!canAccessPendenciasRequisicao()) {
        renderPendenciasPlaceholder('Requisição', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, requests } = await fetchPendenciasRequisicaoRequests();

    if (error) {
        renderPendenciasPlaceholder('Requisição', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasRequisicaoList(requests, overviewMode);
}
