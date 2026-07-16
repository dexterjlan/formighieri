async function fetchEmRevisaoStatusChangedAtByProjectIds(projectIds) {
    if (!projectIds.length) return {};

    const statusIds = await getPendenciasStatusIdsByNames([
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

async function fetchCommercialApprovalsByProjectIds(projectIds) {
    if (!projectIds.length) return {};

    const columnSets = [
        'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt, status',
        'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt',
        'id, orderId, projectName, designerId, approved, approvedAt, status',
        'id, orderId, projectName, designerId, approved, approvedAt'
    ];

    let lastError = null;

    for (const columns of columnSets) {
        const result = await supabaseClient
            .from('CommercialApproval')
            .select(columns)
            .in('orderProjectId', projectIds);

        if (!result.error) {
            const byProject = {};
            (result.data || []).forEach(approval => {
                if (approval.orderProjectId) {
                    byProject[approval.orderProjectId] = normalizeCommercialApproval(approval);
                }
            });
            return byProject;
        }
        lastError = result.error;
    }

    console.error('fetchCommercialApprovalsByProjectIds:', lastError);
    return {};
}

function isPendenciasEmRevisaoOverviewMode() {
    return isAdmin() || isGestorProjetos();
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
            approvalsByProject: {}
        };
    }

    const statusIds = await getPendenciasStatusIdsByNames([
        PENDENCIAS_STATUS_EM_REVISAO,
        'Em revisão'
    ]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_EM_REVISAO}" não encontrado.`),
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
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
            statusChangedAtByProject: {},
            approvalsByProject: {}
        };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);
    if (overviewMode) {
        projects = await enrichPendenciasProjectsWithDesigner(projects);
    }

    const projectIds = projects.map(project => project.id);
    const [statusChangedAtByProject, approvalsByProject] = await Promise.all([
        fetchEmRevisaoStatusChangedAtByProjectIds(projectIds),
        fetchCommercialApprovalsByProjectIds(projectIds)
    ]);

    return {
        error: null,
        overviewMode,
        projects,
        statusChangedAtByProject,
        approvalsByProject
    };
}

function renderPendenciasEmRevisaoList(projects, statusChangedAtByProject, approvalsByProject, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const statusChangedAt = statusChangedAtByProject[project.id];
        const designerName = project.designer?.name || '—';
        const approval = approvalsByProject[project.id];
        const canViewRevision = !overviewMode
            && approval
            && typeof canViewCommercialRevision === 'function'
            && canViewCommercialRevision(approval);
        const actionCell = canViewRevision
            ? `<button type="button" onclick="openCommercialRevisionsHistoryView(${approval.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Revisões</button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                ${overviewMode
                    ? `<td class="p-3 text-xs text-slate-700">${escapeHtml(designerName)}</td>`
                    : ''}
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${statusChangedAt ? formatDate(statusChangedAt) : '—'}</td>
                ${overviewMode ? '' : `<td class="p-3 text-right whitespace-nowrap">${actionCell}</td>`}
            </tr>
        `;
    }).join('');

    const subtitle = overviewMode
        ? 'Todos os projetos em revisão.'
        : 'Projetos associados a você neste status.';
    const emptyMessage = overviewMode
        ? 'Nenhum projeto em revisão.'
        : 'Nenhum projeto em revisão associado a você.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Em Revisão</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-em-revisao"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[${overviewMode ? '920' : '820'}px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                ${overviewMode ? '<th class="text-left p-3 font-semibold">Projetista</th>' : ''}
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Data Em Revisão</th>
                                ${overviewMode ? '' : '<th class="text-right p-3 font-semibold w-32">Ações</th>'}
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-em-revisao')
        ?.addEventListener('click', () => loadPendenciasEmRevisao());
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

    const { error, overviewMode, projects, statusChangedAtByProject, approvalsByProject } =
        await fetchPendenciasEmRevisaoProjects();

    if (error) {
        renderPendenciasPlaceholder('Em Revisão', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEmRevisaoList(
        projects,
        statusChangedAtByProject,
        approvalsByProject,
        overviewMode
    );
}

function isPendenciasProjetoTecnicoOverviewMode() {
    return isAdmin() || isGestorProjetos();
}

function canAccessPendenciasProjetoTecnico() {
    return currentUser?.role === 'Projetista' || isAdmin() || isGestorProjetos();
}

function canSubmitCommercialApprovalFromPendencias(project, approval) {
    if (!project || isPendenciasProjetoTecnicoOverviewMode()) return false;
    if (approval && !isCommercialApprovalApproved(approval)) return false;
    if (currentUser?.role === 'Admin') return true;
    return currentUser?.role === 'Projetista'
        && Number(project.designerId) === Number(currentUser.id);
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
        projects.map(project => project.id)
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

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const designerName = project.designer?.name || '—';
        const approval = approvalsByProject[project.id];
        const canSubmit = canSubmitCommercialApprovalFromPendencias(project, approval);
        const actionCell = canSubmit
            ? `<button type="button" onclick="submitCommercialApprovalFromPendencias(${project.id})"
                class="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1 rounded-lg font-medium">Enviar para Aprovação</button>`
            : overviewMode
                ? '<span class="text-xs text-slate-300">—</span>'
                : approval && !isCommercialApprovalApproved(approval)
                    ? `<span class="text-xs text-amber-700">Aprovação em aberto</span>`
                    : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                ${overviewMode
                    ? `<td class="p-3 text-xs text-slate-700">${escapeHtml(designerName)}</td>`
                    : ''}
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                ${overviewMode ? '' : `<td class="p-3 text-right whitespace-nowrap">${actionCell}</td>`}
            </tr>
        `;
    }).join('');

    const subtitle = overviewMode
        ? 'Todos os projetos em projeto técnico.'
        : 'Projetos associados a você neste status.';
    const emptyMessage = overviewMode
        ? 'Nenhum projeto em projeto técnico.'
        : 'Nenhum projeto em projeto técnico associado a você.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Projeto Técnico</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-projeto-tecnico"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[${overviewMode ? '920' : '820'}px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                ${overviewMode ? '<th class="text-left p-3 font-semibold">Projetista</th>' : ''}
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                ${overviewMode ? '' : '<th class="text-right p-3 font-semibold w-44">Ações</th>'}
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-projeto-tecnico')
        ?.addEventListener('click', () => loadPendenciasProjetoTecnico());
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
    return isAdmin() || isGestorProjetos();
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
        order:salesOrders(id, orderCode, clientName),
        orderProject:OrderProject(id, name, projectCode, environmentType:EnvironmentType(name))
    `;
    const selectFallback = `
        *,
        order:salesOrders(id, orderCode, clientName)
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

    let requests = (result.data || []).filter(request => isRequestWaitingProjetista(request));

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

    const rows = requests.map(request => {
        const orderCode = request.order?.orderCode || '—';
        const clientName = request.order?.clientName || '—';
        const projectLabel = getPendenciasRequestProjectLabel(request);
        const designerName = request.designerName || '—';
        const canViewRequest = !overviewMode
            && isRequestWaitingProjetista(request)
            && canEditProjetistaResponse(request);
        const actionCell = canViewRequest
            ? `<button type="button" onclick="openRequestFromPendencias(${request.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Requisição</button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                ${overviewMode
                    ? `<td class="p-3 text-xs text-slate-700">${escapeHtml(designerName)}</td>`
                    : ''}
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${request.createdAt ? formatDate(request.createdAt) : '—'}</td>
                ${overviewMode ? '' : `<td class="p-3 text-right whitespace-nowrap">${actionCell}</td>`}
            </tr>
        `;
    }).join('');

    const subtitle = overviewMode
        ? 'Requisições em aberto aguardando resposta do projetista.'
        : 'Requisições aguardando sua resposta.';
    const emptyMessage = overviewMode
        ? 'Nenhuma requisição aguardando projetista.'
        : 'Nenhuma requisição aguardando sua resposta.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Requisição</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-requisicao"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${requests.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[${overviewMode ? '920' : '820'}px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                ${overviewMode ? '<th class="text-left p-3 font-semibold">Projetista</th>' : ''}
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Data Abertura</th>
                                ${overviewMode ? '' : '<th class="text-right p-3 font-semibold w-36">Ações</th>'}
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-requisicao')
        ?.addEventListener('click', () => loadPendenciasRequisicao());
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
