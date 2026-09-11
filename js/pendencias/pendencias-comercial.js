async function loadPendenciasAguardandoMedicao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasAguardandoMedicao()) {
        renderPendenciasPlaceholder('Aguardando Medição', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects } = await fetchPendenciasAguardandoMeasurementProjects();

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
        .from('PreliminaryDesignConferenceProject')
        .select(`
            orderProjectId,
            conference:PreliminaryDesignConference(id, orderId, status, createdAt)
        `)
        .in('orderProjectId', projectIds);

    if (result.error?.message?.includes('PreliminaryDesignConference')) {
        result = await supabaseClient
            .from('PreliminaryDesignConferenceProject')
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
            .from('PreliminaryDesignConference')
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
    const conferenceIds = [...new Set(
        Object.values(conferenceByProjectId).map(conference => conference?.id).filter(Boolean)
    )];
    const conferenceDetailsById = await fetchPendenciasConferenceDetailsByIds(conferenceIds);

    return { error: null, projects, conferenceByProjectId, conferenceDetailsById };
}

function renderPendenciasAprovarConferenciaList(projects, conferenceByProjectId, conferenceDetailsById) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const conferenceGroups = groupPendenciasConsultorConferenciaByConference(projects, conferenceByProjectId);
    const subtitle = isGestorComercial()
        ? 'Conferências confirmadas aguardando aprovação comercial.'
        : 'Visualização das conferências confirmadas aguardando aprovação.';

    const rows = conferenceGroups.map(group => mapPendenciasInteractiveIdentity(group.order, {
        id: group.conference?.id || group.projects[0]?.id,
        order: group.order,
        projectName: getPendenciasConsultorConferenciaProjectSummary(group.projects),
        conferenceId: group.conference?.id || ''
    }));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Aprovar Conferência',
        subtitle,
        refreshButtonId: 'btn-pendencias-refresh-aprovar-conferencia',
        onRefresh: loadPendenciasAprovarConferencia,
        tableId: 'pendencias-aprovar-conferencia',
        rows,
        emptyMessage: 'Nenhuma conferência confirmada aguardando aprovação.',
        minWidth: '680px',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({
                projectLabel: 'Projetos',
                projectCellClass: 'p-3 text-xs text-slate-500'
            }),
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-56',
                render: (row) => row.conferenceId
                    ? `<div class="flex flex-wrap justify-end gap-1">
                        <button type="button"
                            class="pendencias-aprovar-conferencia-ver-btn text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium"
                            data-conference-id="${row.conferenceId}">
                            Ver Conferência
                        </button>
                    </div>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-aprovar-conferencia-ver-btn').forEach(button => {
                button.addEventListener('click', () => {
                    openAnteprojetoConferenceFromPendencias(Number(button.dataset.conferenceId));
                });
            });
        }
    });
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

    const { error, projects, conferenceByProjectId, conferenceDetailsById } =
        await fetchPendenciasAprovarConferenciaProjects();

    if (error) {
        renderPendenciasPlaceholder('Aprovar Conferência', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasAprovarConferenciaList(projects, conferenceByProjectId, conferenceDetailsById);
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
        projects = projects.filter(project => isCurrentUserOrderConsultor(
            getOrderConsultantNameFromRecord(project.order),
            project.order?.consultantUserId
        ));
    }

    const conferenceByProjectId = await fetchPendenciasConferenceByProjectIds(
        projects.map(project => project.id),
        'Em andamento'
    );

    return { error: null, overviewMode, projects, conferenceByProjectId };
}

function groupPendenciasConsultorConferenciaByConference(projects, conferenceByProjectId) {
    const groupsByKey = new Map();

    (projects || []).forEach(project => {
        const conference = conferenceByProjectId[project.id];
        const groupKey = conference?.id ? `conference-${conference.id}` : `project-${project.id}`;

        if (!groupsByKey.has(groupKey)) {
            groupsByKey.set(groupKey, {
                conference: conference || null,
                order: project.order || {},
                projects: []
            });
        }

        groupsByKey.get(groupKey).projects.push(project);
    });

    return [...groupsByKey.values()]
        .map(group => ({
            ...group,
            projects: sortPendenciasByDeliveryDate(group.projects)
        }))
        .sort((a, b) => {
            const orderA = a.order?.orderCode || '';
            const orderB = b.order?.orderCode || '';
            const orderCompare = String(orderA).localeCompare(String(orderB), 'pt-BR', { numeric: true });
            if (orderCompare !== 0) return orderCompare;

            const dateA = a.conference?.createdAt ? new Date(a.conference.createdAt).getTime() : 0;
            const dateB = b.conference?.createdAt ? new Date(b.conference.createdAt).getTime() : 0;
            return dateB - dateA;
        });
}

function getPendenciasConsultorConferenciaProjectSummary(projects) {
    const labelFn = typeof getPendenciasProjectDetailLabel === 'function'
        ? getPendenciasProjectDetailLabel
        : project => project?.name || 'Projeto';
    const separator = typeof PENDENCIAS_DETAIL_SEPARATOR === 'string'
        ? PENDENCIAS_DETAIL_SEPARATOR
        : ' | ';

    return (projects || []).map(labelFn).join(separator);
}

async function fetchPendenciasConferenceDetailsByIds(conferenceIds) {
    const detailsById = {};
    if (!conferenceIds.length || typeof fetchAnteprojetoConferenceById !== 'function') {
        return detailsById;
    }

    const uniqueIds = [...new Set(conferenceIds.filter(Boolean))];
    await Promise.all(uniqueIds.map(async conferenceId => {
        const conference = await fetchAnteprojetoConferenceById(conferenceId);
        if (conference) {
            detailsById[conferenceId] = conference;
        }
    }));

    return detailsById;
}

function renderPendenciasConsultorConferenciaList(projects, conferenceByProjectId, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const conferenceGroups = groupPendenciasConsultorConferenciaByConference(projects, conferenceByProjectId);
    const subtitle = overviewMode
        ? 'Conferências enviadas aguardando retorno do consultor.'
        : 'Conferências dos seus pedidos aguardando retorno.';

    const rows = conferenceGroups.map(group => {
        const deliveryDates = group.projects
            .map(project => project.deliveryDate)
            .filter(Boolean)
            .sort();

        return mapPendenciasInteractiveIdentity(group.order, {
            id: group.conference?.id || group.projects[0]?.id,
            order: group.order,
            projectName: getPendenciasConsultorConferenciaProjectSummary(group.projects),
            deliveryLabel: formatPendenciasDeliveryDate(deliveryDates[0]),
            deliveryDate: deliveryDates[0] || null,
            conferenceId: group.conference?.id || ''
        });
    });

    const emptyMessage = overviewMode
        ? 'Nenhuma conferência enviada aguardando retorno.'
        : 'Nenhuma conferência enviada nos seus pedidos.';

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Conferência',
        subtitle,
        refreshButtonId: 'btn-pendencias-refresh-consultor-conferencia',
        onRefresh: loadPendenciasConsultorConferencia,
        tableId: 'pendencias-consultor-conferencia',
        rows,
        emptyMessage,
        minWidth: '820px',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({
                projectLabel: 'Projetos',
                projectCellClass: 'p-3 text-xs text-slate-500'
            }),
            getPendenciasInteractiveDateColumn({
                key: 'deliveryLabel',
                label: 'Entrega',
                sortKey: 'deliveryDate'
            }),
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-56',
                render: (row) => row.conferenceId
                    ? `<div class="flex flex-wrap justify-end gap-1">
                        <button type="button"
                            class="pendencias-consultor-conferencia-ver-btn text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium"
                            data-conference-id="${row.conferenceId}">
                            Ver Conferência
                        </button>
                    </div>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-consultor-conferencia-ver-btn').forEach(button => {
                button.addEventListener('click', () => {
                    openAnteprojetoConferenceFromPendencias(Number(button.dataset.conferenceId));
                });
            });
        }
    });
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
        orderConsultantName: getOrderConsultantNameFromRecord(project?.order) || approval.orderConsultantName
    };
}

async function fetchPendenciasConsultorAguardandoAprovacaoProjects(targetStatusName = null) {
    const overviewMode = isPendenciasConsultorConferenciaOverviewMode();

    const isEmRevisaoComercialView = targetStatusName
        ? targetStatusName === PENDENCIAS_STATUS_EM_REVISAO_COMERCIAL
        : (typeof pendenciasActiveItem !== 'undefined' && pendenciasActiveItem === 'em-revisao-comercial');

    const expectedStatusName = isEmRevisaoComercialView
        ? PENDENCIAS_STATUS_EM_REVISAO_COMERCIAL
        : PENDENCIAS_STATUS_AGUARDANDO_APROVACAO;

    const statusIds = await getPendenciasStatusIdsByNames([expectedStatusName]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${expectedStatusName}" não encontrado.`),
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

    projects = projects.filter(project => {
        const pStatusName = project.projectStatus?.name || '';
        return pStatusName === expectedStatusName;
    });

    if (!overviewMode) {
        projects = projects.filter(project => isCurrentUserOrderConsultor(
            getOrderConsultantNameFromRecord(project.order),
            project.order?.consultantUserId
        ));
    }

    const approvalsByProjectRaw = await fetchCommercialApprovalsByProjectIds(
        projects.map(project => project.id),
        projects
    );

    const approvalsByProject = {};
    projects = projects.filter(project => {
        const approval = enrichPendenciasApprovalWithProject(
            approvalsByProjectRaw[project.id],
            project
        );
        if (!approval) {
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

    const isEmRevisaoComercialView = (typeof pendenciasActiveItem !== 'undefined' && pendenciasActiveItem === 'em-revisao-comercial');
    const titleText = isEmRevisaoComercialView ? PENDENCIAS_STATUS_EM_REVISAO_COMERCIAL : 'Aguardando Aprovação';

    const subtitle = overviewMode
        ? `Todos os projetos em ${titleText.toLowerCase()}.`
        : `Projetos dos seus pedidos em ${titleText.toLowerCase()}.`;

    const rows = (projects || []).map(project => {
        const approval = approvalsByProject[project.id];
        const projectStatusName = project.projectStatus?.name || '';
        const canApprove = approval
            && typeof canApproveCommercialApproval === 'function'
            && canApproveCommercialApproval(approval);
        const showRequestRevision = approval
            && (isOrderProjectEmRevisaoComercialConsStatus(projectStatusName) || isEmRevisaoComercialView)
            && typeof canRequestNewRevision === 'function'
            && canRequestNewRevision(approval, projectStatusName);
        const canCommercialRevision = approval
            && typeof canAccessCommercialRevision === 'function'
            && canAccessCommercialRevision(approval);
        const showVoltarRevisao = !isEmRevisaoComercialView
            && typeof canShowOrderProjectVoltarRevisaoAction === 'function'
            && canShowOrderProjectVoltarRevisaoAction(project, project.orderId || project.order?.id);

        return mapPendenciasInteractiveIdentity(project, {
            projectName: typeof getPendenciasProjectDetailLabel === 'function'
                ? getPendenciasProjectDetailLabel(project)
                : (project?.name || 'Projeto'),
            deliveryLabel: formatPendenciasDeliveryDate(project.deliveryDate),
            deliveryDate: project.deliveryDate,
            approvalId: approval?.id || '',
            canApprove,
            showRequestRevision,
            canCommercialRevision,
            showVoltarRevisao
        });
    });

    const emptyMessage = overviewMode
        ? 'Nenhum projeto aguardando aprovação.'
        : 'Nenhum projeto aguardando aprovação nos seus pedidos.';

    renderPendenciasInteractiveTableScreen(content, {
        title: titleText,
        subtitle,
        refreshButtonId: 'btn-pendencias-refresh-consultor-aprovacao',
        onRefresh: loadPendenciasConsultorAguardandoAprovacao,
        tableId: isEmRevisaoComercialView
            ? 'pendencias-consultor-em-revisao-comercial'
            : 'pendencias-consultor-aguardando-aprovacao',
        rows,
        emptyMessage,
        minWidth: '820px',
        columns: [
            ...getPendenciasInteractiveIdentityColumns(),
            getPendenciasInteractiveDateColumn({
                key: 'deliveryLabel',
                label: 'Entrega',
                sortKey: 'deliveryDate'
            }),
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-44',
                render: (row) => {
                    const actionButtons = [];
                    if (row.canApprove) {
                        actionButtons.push(`<button type="button"
                            class="pendencias-consultor-aprovar-btn text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1 rounded-lg font-medium"
                            data-approval-id="${row.approvalId}">
                            Aprovar
                        </button>`);
                    }
                    if (row.showRequestRevision) {
                        actionButtons.push(`<button type="button"
                            class="pendencias-consultor-solicitar-revisao-btn text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium"
                            data-approval-id="${row.approvalId}">
                            Solicitar Revisão
                        </button>`);
                    }
                    if (row.canCommercialRevision) {
                        actionButtons.push(`<button type="button"
                            class="pendencias-consultor-revisao-comercial-btn text-xs bg-purple-100 text-purple-800 hover:bg-purple-200 px-2.5 py-1 rounded-lg font-medium"
                            data-approval-id="${row.approvalId}">
                            Revisão Comercial
                        </button>`);
                    }
                    if (row.showVoltarRevisao) {
                        actionButtons.push(`<button type="button"
                            class="pendencias-consultor-voltar-revisao-btn text-xs bg-amber-100 text-amber-800 hover:bg-amber-200 px-2.5 py-1 rounded-lg font-medium"
                            data-project-id="${row.id}">
                            Voltar Revisão
                        </button>`);
                    }
                    return actionButtons.length
                        ? `<div class="flex flex-wrap justify-end gap-1">${actionButtons.join('')}</div>`
                        : '<span class="text-xs text-slate-300">—</span>';
                }
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-consultor-aprovar-btn').forEach(button => {
                button.addEventListener('click', () => {
                    approveCommercialApprovalFromPendencias(Number(button.dataset.approvalId));
                });
            });
            tbody?.querySelectorAll('.pendencias-consultor-solicitar-revisao-btn').forEach(button => {
                button.addEventListener('click', () => {
                    openCommercialRevisionFromPendencias(Number(button.dataset.approvalId));
                });
            });
            tbody?.querySelectorAll('.pendencias-consultor-revisao-comercial-btn').forEach(button => {
                button.addEventListener('click', () => {
                    openCommercialRevisionCommercialFromPendencias(Number(button.dataset.approvalId));
                });
            });
            tbody?.querySelectorAll('.pendencias-consultor-voltar-revisao-btn').forEach(button => {
                button.addEventListener('click', () => {
                    voltarRevisaoComercialFromPendencias(Number(button.dataset.projectId));
                });
            });
        }
    });
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

    if (!approval && typeof ensureProjectWorkflowInCache === 'function') {
        approval = await ensureProjectWorkflowInCache(id, true);
    }

    if (!approval) return null;

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
        alertAppDialog('Solicitação comercial não encontrada.');
        return;
    }

    if (!canApproveCommercialApproval(approval)) {
        alertAppDialog('Sem permissão para aprovar esta solicitação.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    await approveCommercialApproval(approval.id);
}

async function openCommercialRevisionFromPendencias(approvalId) {
    const approval = await ensureCommercialApprovalInPendenciasContext(approvalId);

    if (!approval) {
        alertAppDialog('Solicitação comercial não encontrada.');
        return;
    }

    if (typeof openCommercialRevisionModal !== 'function') {
        alertAppDialog('Recurso de revisão indisponível.');
        return;
    }

    await openCommercialRevisionModal(approval.id);
}

async function openCommercialRevisionCommercialFromPendencias(approvalId) {
    const approval = await ensureCommercialApprovalInPendenciasContext(approvalId);

    if (!approval) {
        alertAppDialog('Solicitação comercial não encontrada.');
        return;
    }

    if (typeof openCommercialRevisionModal !== 'function') {
        alertAppDialog('Recurso de revisão indisponível.');
        return;
    }

    await openCommercialRevisionModal(approval.id, 'comercial');
}

async function voltarRevisaoComercialFromPendencias(projectId) {
    if (typeof returnOrderProjectToCommercialReview !== 'function') {
        alertAppDialog('Não foi possível voltar o projeto para revisão.');
        return;
    }

    await returnOrderProjectToCommercialReview(projectId);
}

window.approveCommercialApprovalFromPendencias = approveCommercialApprovalFromPendencias;
window.openCommercialRevisionFromPendencias = openCommercialRevisionFromPendencias;
window.openCommercialRevisionCommercialFromPendencias = openCommercialRevisionCommercialFromPendencias;
window.voltarRevisaoComercialFromPendencias = voltarRevisaoComercialFromPendencias;

async function fetchPendenciasConsultorRequisicaoRequests() {
    const overviewMode = isPendenciasConsultorConferenciaOverviewMode();

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

    let requests = (result.data || []).filter(request => isRequestWaitingConsultor(request));
    requests = await enrichItemsWithOrderConsultantUserId(requests);

    if (!overviewMode) {
        requests = requests.filter(request => isCurrentUserOrderConsultor(
            getOrderConsultantNameFromRecord(request.order),
            request.order?.consultantUserId
        ));
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
        ? 'Requisições em aberto aguardando resposta do consultor, inclusive de Detalhamento.'
        : 'Requisições dos seus pedidos aguardando sua resposta, inclusive de Detalhamento.';

    const rows = (requests || []).map(request => mapPendenciasInteractiveIdentity(request, {
        order: request.order,
        projectName: getPendenciasRequestProjectLabel(request),
        designerName: request.designerName || '—',
        requestType: typeof getRequestType === 'function' ? getRequestType(request) : request.requestType,
        requestTypeLabel: typeof formatRequestType === 'function'
            ? formatRequestType(typeof getRequestType === 'function' ? getRequestType(request) : request.requestType)
            : (request.requestType || '—'),
        createdAtLabel: request.createdAt ? formatDate(request.createdAt) : '—',
        createdAt: request.createdAt,
        canShowRequest: overviewMode
            ? currentUser?.role === 'Admin'
            : isRequestWaitingConsultor(request) && canRespondAsConsultor(request)
    }));

    const emptyMessage = overviewMode
        ? 'Nenhuma requisição aguardando consultor.'
        : 'Nenhuma requisição aguardando sua resposta.';

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Requisições',
        subtitle,
        refreshButtonId: 'btn-pendencias-refresh-consultor-requisicoes',
        onRefresh: loadPendenciasConsultorRequisicoes,
        tableId: 'pendencias-consultor-requisicao',
        rows,
        emptyMessage,
        minWidth: overviewMode ? '1000px' : '900px',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({ includeDesigner: overviewMode }),
            {
                key: 'requestTypeLabel',
                label: 'Tipo',
                cellClass: 'p-3',
                render: (row) => typeof getRequestTypeBadgeHtml === 'function'
                    ? getRequestTypeBadgeHtml({ requestType: row.requestType })
                    : escapeHtml(row.requestTypeLabel || '—')
            },
            getPendenciasInteractiveDateColumn({
                key: 'createdAtLabel',
                label: 'Data Abertura',
                sortKey: 'createdAt',
                cellClass: 'p-3 text-xs text-slate-500 whitespace-nowrap'
            }),
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-40',
                render: (row) => row.canShowRequest
                    ? `<button type="button"
                        class="pendencias-consultor-mostrar-requisicao-btn text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium"
                        data-request-id="${row.id}">
                        Mostrar Requisição
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-consultor-mostrar-requisicao-btn').forEach(button => {
                button.addEventListener('click', () => {
                    openConsultorRequestFromPendencias(Number(button.dataset.requestId));
                });
            });
        }
    });
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
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()}),
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
                .select(`*, order:salesOrders(${getSalesOrderMinimalEmbedSelect()})`)
                .eq('id', id)
                .maybeSingle();
        }

        if (result.error || !result.data) {
            alertAppDialog('Requisição não encontrada.');
            return;
        }

        request = result.data;
    }

    if (!isRequestWaitingConsultor(request)) {
        alertAppDialog('Esta requisição não está aguardando resposta do consultor.');
        return;
    }

    const canOpen = currentUser?.role === 'Admin'
        || canRespondAsConsultor(request)
        || canEditConversation(request);

    if (!canOpen) {
        alertAppDialog('Sem permissão para visualizar esta requisição.', { variant: 'warning', title: 'Aviso' });
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
    if (typeof iniciarProjetoTecnico === 'function') {
        await iniciarProjetoTecnico(projectId);
    }
}
