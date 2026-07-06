async function loadPendenciasAguardandoMedicao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasAguardandoMedicao()) {
        renderPendenciasPlaceholder('Aguardando Medição', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects } = await fetchPendenciasAguardandoMedicaoProjects();

    if (error) {
        renderPendenciasPlaceholder('Aguardando Medição', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasAguardandoMedicaoList(projects);
}

function canAccessPendenciasAprovarConferencia() {
    return canSeePendenciasGestorComercialMenu();
}

async function fetchPendenciasConferenceByProjectIds(projectIds, conferenceStatus = 'Confirmada') {
    if (!projectIds.length) return {};

    let result = await supabaseClient
        .from('AnteprojetoConferenceProject')
        .select(`
            orderProjectId,
            conference:AnteprojetoConference(id, orderId, status, createdAt)
        `)
        .in('orderProjectId', projectIds);

    if (result.error?.message?.includes('AnteprojetoConference')) {
        result = await supabaseClient
            .from('AnteprojetoConferenceProject')
            .select('orderProjectId, conferenceId')
            .in('orderProjectId', projectIds);
    }

    if (result.error) {
        console.error('fetchPendenciasConferenceByProjectIds:', result.error);
        return {};
    }

    const conferenceIds = [...new Set(
        (result.data || [])
            .map(row => row.conference?.id || row.conferenceId)
            .filter(Boolean)
    )];

    let conferenceById = {};
    if (conferenceIds.length) {
        const { data: conferences, error } = await supabaseClient
            .from('AnteprojetoConference')
            .select('id, orderId, status, createdAt')
            .in('id', conferenceIds);

        if (error) {
            console.error('fetchPendenciasConferenceByProjectIds conferences:', error);
            return {};
        }

        conferenceById = Object.fromEntries((conferences || []).map(item => [item.id, item]));
    }

    const map = {};
    (result.data || []).forEach(row => {
        const projectId = Number(row.orderProjectId);
        const conference = row.conference
            || conferenceById[row.conferenceId]
            || null;

        if (!conference || conference.status !== conferenceStatus) return;

        const existing = map[projectId];
        const conferenceTime = conference.createdAt ? new Date(conference.createdAt).getTime() : 0;
        const existingTime = existing?.createdAt ? new Date(existing.createdAt).getTime() : 0;
        if (!existing || conferenceTime >= existingTime) {
            map[projectId] = conference;
        }
    });

    return map;
}

async function fetchPendenciasAprovarConferenciaProjects() {
    const statusIds = await getPendenciasStatusIdsByNames([PENDENCIAS_STATUS_CONFERENCIA_REALIZADA]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_CONFERENCIA_REALIZADA}" não encontrado.`),
            projects: [],
            conferenceByProjectId: {}
        };
    }

    const result = await queryPendenciasProjects({ statusIds });
    if (result.error) {
        return { error: result.error, projects: [], conferenceByProjectId: {} };
    }

    const projects = sortPendenciasByDeliveryDate(result.data || []);
    const conferenceByProjectId = await fetchPendenciasConferenceByProjectIds(
        projects.map(project => project.id),
        'Confirmada'
    );

    return { error: null, projects, conferenceByProjectId };
}

function renderPendenciasAprovarConferenciaList(projects, conferenceByProjectId) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const subtitle = isGestorComercial()
        ? 'Projetos com conferência realizada aguardando aprovação comercial.'
        : 'Visualização dos projetos com conferência realizada aguardando aprovação.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const conference = conferenceByProjectId[project.id];
        const canView = Boolean(conference);

        const actionCell = canView
            ? `<button type="button" onclick="openAnteprojetoConferenceFromPendencias(${conference.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Conferência</button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aprovar Conferência</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-aprovar-conferencia"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[820px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-36">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto com conferência realizada aguardando aprovação.</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-aprovar-conferencia')
        ?.addEventListener('click', () => loadPendenciasAprovarConferencia());
}

async function loadPendenciasAprovarConferencia() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasAprovarConferencia()) {
        renderPendenciasPlaceholder('Aprovar Conferência', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects, conferenceByProjectId } = await fetchPendenciasAprovarConferenciaProjects();

    if (error) {
        renderPendenciasPlaceholder('Aprovar Conferência', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasAprovarConferenciaList(projects, conferenceByProjectId);
}

function isPendenciasConsultorConferenciaOverviewMode() {
    return isAdmin() || isGestorComercial();
}

function canAccessPendenciasConsultorConferencia() {
    return canSeePendenciasConsultorMenu();
}

async function fetchPendenciasConsultorConferenciaProjects() {
    const overviewMode = isPendenciasConsultorConferenciaOverviewMode();
    const statusIds = await getPendenciasStatusIdsByNames([PENDENCIAS_STATUS_CONFERENCIA_ENVIADA]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_CONFERENCIA_ENVIADA}" não encontrado.`),
            overviewMode,
            projects: [],
            conferenceByProjectId: {}
        };
    }

    const result = await queryPendenciasProjects({ statusIds });
    if (result.error) {
        return { error: result.error, overviewMode, projects: [], conferenceByProjectId: {} };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);

    if (!overviewMode) {
        projects = projects.filter(project => {
            const consultantName = project.order?.consultantName;
            return Boolean(consultantName && currentUser?.name === consultantName);
        });
    }

    const conferenceByProjectId = await fetchPendenciasConferenceByProjectIds(
        projects.map(project => project.id),
        'Em andamento'
    );

    return { error: null, overviewMode, projects, conferenceByProjectId };
}

function renderPendenciasConsultorConferenciaList(projects, conferenceByProjectId, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const subtitle = overviewMode
        ? 'Todos os projetos com conferência enviada aguardando retorno do consultor.'
        : 'Projetos dos seus pedidos com conferência enviada.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const conference = conferenceByProjectId[project.id];
        const canView = Boolean(conference);

        const actionCell = canView
            ? `<button type="button" onclick="openAnteprojetoConferenceFromPendencias(${conference.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Conferência</button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    const emptyMessage = overviewMode
        ? 'Nenhum projeto com conferência enviada.'
        : 'Nenhum projeto com conferência enviada nos seus pedidos.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Conferência</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-consultor-conferencia"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[820px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-36">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-consultor-conferencia')
        ?.addEventListener('click', () => loadPendenciasConsultorConferencia());
}

async function loadPendenciasConsultorConferencia() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasConsultorConferencia()) {
        renderPendenciasPlaceholder('Conferência', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, conferenceByProjectId } =
        await fetchPendenciasConsultorConferenciaProjects();

    if (error) {
        renderPendenciasPlaceholder('Conferência', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasConsultorConferenciaList(projects, conferenceByProjectId, overviewMode);
}

function enrichPendenciasApprovalWithProject(approval, project) {
    if (!approval) return null;
    return {
        ...approval,
        orderId: approval.orderId || project?.orderId,
        orderConsultantName: project?.order?.consultantName || approval.orderConsultantName
    };
}

async function fetchPendenciasConsultorAguardandoAprovacaoProjects() {
    const overviewMode = isPendenciasConsultorConferenciaOverviewMode();
    const statusIds = await getPendenciasStatusIdsByNames([PENDENCIAS_STATUS_AGUARDANDO_APROVACAO]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_AGUARDANDO_APROVACAO}" não encontrado.`),
            overviewMode,
            projects: [],
            approvalsByProject: {}
        };
    }

    const result = await queryPendenciasProjects({ statusIds });
    if (result.error) {
        return { error: result.error, overviewMode, projects: [], approvalsByProject: {} };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);

    if (!overviewMode) {
        projects = projects.filter(project => {
            const consultantName = project.order?.consultantName;
            return Boolean(consultantName && currentUser?.name === consultantName);
        });
    }

    const approvalsByProjectRaw = await fetchCommercialApprovalsByProjectIds(
        projects.map(project => project.id)
    );

    const approvalsByProject = {};
    projects = projects.filter(project => {
        const approval = enrichPendenciasApprovalWithProject(
            approvalsByProjectRaw[project.id],
            project
        );
        if (!approval || approval.status !== PENDENCIAS_STATUS_AGUARDANDO_APROVACAO) {
            return false;
        }
        approvalsByProject[project.id] = approval;
        return true;
    });

    pendenciasAguardandoAprovacaoCache = Object.values(approvalsByProject);

    return { error: null, overviewMode, projects, approvalsByProject };
}

function renderPendenciasConsultorAguardandoAprovacaoList(projects, approvalsByProject, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const subtitle = overviewMode
        ? 'Todos os projetos aguardando aprovação comercial.'
        : 'Projetos dos seus pedidos aguardando aprovação comercial.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const approval = approvalsByProject[project.id];
        const canApprove = approval
            && typeof canApproveCommercialApproval === 'function'
            && canApproveCommercialApproval(approval);
        const showRequestRevision = approval
            && typeof canRequestNewRevision === 'function'
            && canRequestNewRevision(approval);
        const actionButtons = [];

        if (canApprove) {
            actionButtons.push(`<button type="button" onclick="approveCommercialApprovalFromPendencias(${approval.id})"
                class="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1 rounded-lg font-medium">Aprovar</button>`);
        }
        if (showRequestRevision) {
            actionButtons.push(`<button type="button" onclick="openCommercialRevisionFromPendencias(${approval.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Solicitar Revisão</button>`);
        }

        const actionCell = actionButtons.length
            ? `<div class="flex flex-wrap justify-end gap-1">${actionButtons.join('')}</div>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    const emptyMessage = overviewMode
        ? 'Nenhum projeto aguardando aprovação.'
        : 'Nenhum projeto aguardando aprovação nos seus pedidos.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aguardando Aprovação</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-consultor-aprovacao"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[820px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-44">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-consultor-aprovacao')
        ?.addEventListener('click', () => loadPendenciasConsultorAguardandoAprovacao());
}

async function loadPendenciasConsultorAguardandoAprovacao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasConsultorMenu()) {
        renderPendenciasPlaceholder('Aguardando Aprovação', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, approvalsByProject } =
        await fetchPendenciasConsultorAguardandoAprovacaoProjects();

    if (error) {
        renderPendenciasPlaceholder('Aguardando Aprovação', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasConsultorAguardandoAprovacaoList(projects, approvalsByProject, overviewMode);
}

async function ensureCommercialApprovalInPendenciasContext(approvalId) {
    const id = Number(approvalId);
    if (!id) return null;

    let approval = pendenciasAguardandoAprovacaoCache.find(item => Number(item.id) === id);

    if (!approval) {
        const columnSets = [
            'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt, status',
            'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt'
        ];

        for (const columns of columnSets) {
            const { data, error } = await supabaseClient
                .from('CommercialApproval')
                .select(columns)
                .eq('id', id)
                .maybeSingle();

            if (!error && data) {
                approval = normalizeCommercialApproval(data);
                break;
            }
        }
    }

    if (!approval) return null;

    if (!approval.orderConsultantName && approval.orderId) {
        const { data: orderInfo } = await supabaseClient
            .from('salesOrders')
            .select('consultantName')
            .eq('id', approval.orderId)
            .maybeSingle();
        approval = {
            ...approval,
            orderConsultantName: orderInfo?.consultantName || approval.orderConsultantName
        };
    }

    activeOrderId = approval.orderId;
    const cacheIndex = commercialApprovalsCache.findIndex(item => Number(item.id) === id);
    if (cacheIndex >= 0) {
        commercialApprovalsCache[cacheIndex] = { ...commercialApprovalsCache[cacheIndex], ...approval };
    } else {
        commercialApprovalsCache = [...commercialApprovalsCache, approval];
    }

    return approval;
}

async function approveCommercialApprovalFromPendencias(approvalId) {
    const approval = await ensureCommercialApprovalInPendenciasContext(approvalId);

    if (!approval) {
        alert('Solicitação comercial não encontrada.');
        return;
    }

    if (!canApproveCommercialApproval(approval)) {
        alert('Sem permissão para aprovar esta solicitação.');
        return;
    }

    await approveCommercialApproval(approval.id);
}

async function openCommercialRevisionFromPendencias(approvalId) {
    const approval = await ensureCommercialApprovalInPendenciasContext(approvalId);

    if (!approval) {
        alert('Solicitação comercial não encontrada.');
        return;
    }

    if (typeof openCommercialRevisionModal !== 'function') {
        alert('Recurso de revisão indisponível.');
        return;
    }

    await openCommercialRevisionModal(approval.id);
}

window.approveCommercialApprovalFromPendencias = approveCommercialApprovalFromPendencias;
window.openCommercialRevisionFromPendencias = openCommercialRevisionFromPendencias;

async function fetchPendenciasConsultorRequisicaoRequests() {
    const overviewMode = isPendenciasConsultorConferenciaOverviewMode();

    const selectWithProject = `
        *,
        order:salesOrders(id, orderCode, clientName, consultantName),
        orderProject:OrderProject(id, name, projectCode, environmentType:EnvironmentType(name))
    `;
    const selectFallback = `
        *,
        order:salesOrders(id, orderCode, clientName, consultantName)
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

    let requests = (result.data || []).filter(request => isRequestWaitingConsultor(request));

    if (!overviewMode) {
        requests = requests.filter(request => {
            const consultantName = request.order?.consultantName;
            return Boolean(consultantName && currentUser?.name === consultantName);
        });
    }

    requests = sortOrderRequests(requests);

    if (overviewMode) {
        requests = await enrichPendenciasRequestsWithDesigner(requests);
    }

    pendenciasConsultorRequisicaoCache = requests;
    return { error: null, overviewMode, requests };
}

function renderPendenciasConsultorRequisicaoList(requests, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const subtitle = overviewMode
        ? 'Requisições em aberto aguardando resposta do consultor.'
        : 'Requisições dos seus pedidos aguardando sua resposta.';

    const rows = requests.map(request => {
        const orderCode = request.order?.orderCode || '—';
        const clientName = request.order?.clientName || '—';
        const projectLabel = getPendenciasRequestProjectLabel(request);
        const designerName = request.designerName || '—';
        const canShowRequest = overviewMode
            ? currentUser?.role === 'Admin'
            : isRequestWaitingConsultor(request) && canRespondAsConsultor(request);
        const actionCell = canShowRequest
            ? `<button type="button" onclick="openConsultorRequestFromPendencias(${request.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Mostrar Requisição</button>`
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
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    const emptyMessage = overviewMode
        ? 'Nenhuma requisição aguardando consultor.'
        : 'Nenhuma requisição aguardando sua resposta.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Requisições</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-consultor-requisicoes"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
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
                                <th class="text-right p-3 font-semibold w-40">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-consultor-requisicoes')
        ?.addEventListener('click', () => loadPendenciasConsultorRequisicoes());
}

async function loadPendenciasConsultorRequisicoes() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando requisições...</p>';
    }

    if (!canSeePendenciasConsultorMenu()) {
        renderPendenciasPlaceholder('Requisições', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, requests } = await fetchPendenciasConsultorRequisicaoRequests();

    if (error) {
        renderPendenciasPlaceholder('Requisições', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasConsultorRequisicaoList(requests, overviewMode);
}

async function openConsultorRequestFromPendencias(requestId) {
    const id = Number(requestId);
    if (!id) return;

    let request = pendenciasConsultorRequisicaoCache.find(item => Number(item.id) === id);

    if (!request) {
        const selectWithProject = `
            *,
            order:salesOrders(id, orderCode, clientName, consultantName),
            orderProject:OrderProject(id, name, projectCode, environmentType:EnvironmentType(name))
        `;
        let result = await supabaseClient
            .from('OrderRequest')
            .select(selectWithProject)
            .eq('id', id)
            .maybeSingle();

        if (result.error?.message?.includes('orderProject')) {
            result = await supabaseClient
                .from('OrderRequest')
                .select('*, order:salesOrders(id, orderCode, clientName, consultantName)')
                .eq('id', id)
                .maybeSingle();
        }

        if (result.error || !result.data) {
            alert('Requisição não encontrada.');
            return;
        }

        request = result.data;
    }

    if (!isRequestWaitingConsultor(request)) {
        alert('Esta requisição não está aguardando resposta do consultor.');
        return;
    }

    const canOpen = currentUser?.role === 'Admin'
        || canRespondAsConsultor(request)
        || canEditConversation(request);

    if (!canOpen) {
        alert('Sem permissão para visualizar esta requisição.');
        return;
    }

    const cacheIndex = conversationsCache.findIndex(item => Number(item.id) === id);
    if (cacheIndex >= 0) {
        conversationsCache[cacheIndex] = { ...conversationsCache[cacheIndex], ...request };
    } else {
        conversationsCache = [...conversationsCache, request];
    }

    activeOrderId = request.orderId;
    await editConversation(id);
}

window.openConsultorRequestFromPendencias = openConsultorRequestFromPendencias;

async function iniciarPendenciaProjetoTecnico(projectId) {
    if (!projectId) return;

    const statusId = await getPendenciasStatusIdByName(PENDENCIAS_STATUS_PROJETO_TECNICO);
    if (!statusId) {
        alert(`Status "${PENDENCIAS_STATUS_PROJETO_TECNICO}" não encontrado.`);
        return;
    }

    const { data: project, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, designerId')
        .eq('id', projectId)
        .maybeSingle();

    if (readError || !project) {
        alert('Projeto não encontrado.');
        return;
    }

    if (Number(project.designerId) !== Number(currentUser?.id) && !isAdmin()) {
        alert('Somente o responsável do projeto pode iniciá-lo.');
        return;
    }

    if (!confirm('Iniciar projeto técnico deste projeto?')) return;

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', projectId);

    if (error) {
        alert('Erro ao iniciar projeto: ' + error.message);
        return;
    }

    await loadPendenciasAguardandoProjetoTecnico();
}
