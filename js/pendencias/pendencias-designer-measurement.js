async function openRequestFromPendencias(requestId) {
    const id = Number(requestId);
    if (!id) return;

    let request = pendenciasRequisicaoCache.find(item => Number(item.id) === id);

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

    if (!isRequestWaitingProjetista(request) || !canEditProjetistaResponse(request)) {
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

window.openRequestFromPendencias = openRequestFromPendencias;

function groupPendenciasProjectsByOrder(projects) {
    const byOrderId = {};

    (projects || []).forEach(project => {
        const orderId = Number(project.orderId);
        if (!orderId) return;

        if (!byOrderId[orderId]) {
            byOrderId[orderId] = {
                orderId,
                order: project.order || {},
                projects: []
            };
        }

        byOrderId[orderId].projects.push(project);
    });

    return Object.values(byOrderId)
        .map(orderGroup => ({
            ...orderGroup,
            projects: sortPendenciasByDeliveryDate(orderGroup.projects)
        }))
        .sort((a, b) => String(a.order?.orderCode || '').localeCompare(
            String(b.order?.orderCode || ''),
            'pt-BR',
            { numeric: true }
        ));
}

async function fetchPendenciasProjetistaAguardandoMedicaoOrders() {
    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_AGUARDANDO_MEDICAO);
    if (error) {
        if (error.message?.includes('não encontrado')) {
            return { error: null, orders: [] };
        }
        return { error, orders: [] };
    }

    return {
        error: null,
        orders: groupPendenciasProjectsByOrder(projects)
    };
}

async function fetchPendenciasProjetistaConferenciasOrders() {
    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_PLANTA_LEVANTADA);
    if (error) {
        if (error.message?.includes('não encontrado')) {
            return { error: null, orders: [] };
        }
        return { error, orders: [] };
    }

    return {
        error: null,
        orders: groupPendenciasProjectsByOrder(projects)
    };
}

function renderPendenciasProjetistaOrdersList(config) {
    const {
        title,
        subtitle,
        orders,
        emptyMessage,
        refreshButtonId,
        refreshHandler,
        actionLabel,
        actionButtonClass,
        actionButtonSelector,
        tableId
    } = config;

    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canCreateAsAdminOrConferente();
    const detailLabelFn = config.detailLabelFn || getPendenciasProjectDetailLabel;
    const rows = (orders || []).map(orderGroup => {
        const projectCount = orderGroup.projects.length;
        return mapPendenciasInteractiveIdentity(orderGroup.order, {
            id: orderGroup.orderId,
            order: orderGroup.order,
            projectName: `${projectCount} projeto${projectCount === 1 ? '' : 's'}`,
            projectDetail: orderGroup.projects
                .map(project => detailLabelFn(project))
                .join(PENDENCIAS_DETAIL_SEPARATOR)
        });
    });

    renderPendenciasInteractiveTableScreen(content, {
        title,
        subtitle,
        refreshButtonId,
        onRefresh: refreshHandler,
        tableId: tableId || refreshButtonId || 'pendencias-projetista-orders',
        rows,
        emptyMessage,
        minWidth: '820px',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({
                projectLabel: 'Projetos',
                projectCellClass: 'p-3 text-xs text-slate-600 whitespace-nowrap'
            }),
            {
                key: 'projectDetail',
                label: 'Detalhe',
                cellClass: 'p-3 text-xs text-slate-500'
            },
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-40',
                render: (row) => canAct
                    ? `<button type="button"
                        class="${actionButtonSelector} text-xs px-2.5 py-1 rounded-lg font-medium ${actionButtonClass}"
                        data-order-id="${row.id}">
                        ${escapeHtml(actionLabel)}
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll(`.${actionButtonSelector}`).forEach(button => {
                button.addEventListener('click', async () => {
                    config.onAction(Number(button.dataset.orderId));
                });
            });
        }
    });
}

function isPendenciasMedicaoTableMissingError(error) {
    const message = String(error?.message || '');
    return /relation.*"Measurement".*does not exist/i.test(message)
        || /relation.*Measurement.*does not exist/i.test(message);
}

async function fetchPendenciasAguardandoPlantaMedicoes() {
    const selectVariants = [
        `
            id, orderId, observation, createdAt, createdById,
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()}),
            measurementProjects:MeasurementProject(
                id, orderProjectId, measurementDate, isFloorPlanRaised, floorPlanRaisedDate,
                orderProject:OrderProject(id, name, projectCode)
            )
        `,
        `
            id, orderId, observation, createdAt, createdById,
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()}),
            measurementProjects:MeasurementProject(id, orderProjectId, measurementDate, isFloorPlanRaised, floorPlanRaisedDate)
        `,
        `
            id, orderId, observation, createdAt, createdById,
            measurementProjects:MeasurementProject(id, orderProjectId, measurementDate, isFloorPlanRaised, floorPlanRaisedDate)
        `,
        'id, orderId, observation, createdAt, createdById'
    ];

    let result = { data: [], error: null };

    for (const selectColumns of selectVariants) {
        result = await supabaseClient
            .from('Measurement')
            .select(selectColumns)
            .order('createdAt', { ascending: false });

        if (!result.error) break;

        if (isPendenciasMedicaoTableMissingError(result.error)) {
            return { error: null, medicoes: [] };
        }
    }

    if (result.error) {
        console.error('fetchPendenciasAguardandoPlantaMedicoes:', result.error);
        return { error: result.error, medicoes: [] };
    }

    let medicoes = result.data || [];

    const orderIds = [...new Set(medicoes.map(medicao => Number(medicao.orderId)).filter(Boolean))];
    const projectIds = [...new Set(
        medicoes.flatMap(medicao =>
            (medicao.measurementProjects || [])
                .map(project => Number(project.orderProjectId))
                .filter(Boolean)
        )
    )];

    let orderById = {};
    if (orderIds.length && medicoes.some(medicao => !medicao.order)) {
        const { data: orders } = await supabaseClient
            .from('salesOrders')
            .select(getSalesOrderMinimalEmbedSelect())
            .in('id', orderIds);

        orderById = Object.fromEntries((orders || []).map(order => [Number(order.id), order]));
    }

    let projectById = {};
    if (projectIds.length && medicoes.some(medicao =>
        (medicao.measurementProjects || []).some(project => project.orderProjectId && !project.orderProject)
    )) {
        const { data: projects } = await supabaseClient
            .from('OrderProject')
            .select('id, name, projectCode')
            .in('id', projectIds);

        projectById = Object.fromEntries((projects || []).map(project => [Number(project.id), project]));
    }

    if (medicoes.some(medicao => !medicao.measurementProjects)) {
        const measurementIds = medicoes.map(medicao => medicao.id).filter(Boolean);
        if (measurementIds.length) {
            const { data: measurementProjects } = await supabaseClient
                .from('MeasurementProject')
                .select('id, measurementId, orderProjectId, measurementDate, isFloorPlanRaised, floorPlanRaisedDate')
                .in('measurementId', measurementIds);

            const projectsByMedicaoId = {};
            (measurementProjects || []).forEach(project => {
                const measurementId = Number(project.measurementId);
                if (!projectsByMedicaoId[measurementId]) projectsByMedicaoId[measurementId] = [];
                projectsByMedicaoId[measurementId].push(project);
            });

            medicoes = medicoes.map(medicao => ({
                ...medicao,
                measurementProjects: medicao.measurementProjects || projectsByMedicaoId[Number(medicao.id)] || []
            }));
        }
    }

    medicoes = medicoes.map(medicao => ({
        ...medicao,
        order: medicao.order || orderById[Number(medicao.orderId)] || null,
        measurementProjects: (medicao.measurementProjects || []).map(project => ({
            ...project,
            orderProject: project.orderProject || projectById[Number(project.orderProjectId)] || null
        }))
    }));

    const openMedicoes = medicoes.filter(medicao => {
        const projects = medicao.measurementProjects || [];
        return projects.length > 0 && projects.some(project => !project.isFloorPlanRaised);
    });

    return { error: null, medicoes: openMedicoes };
}

function getPendenciasMeasurementProjectLabel(medicaoProject) {
    return medicaoProject?.orderProject?.name || 'Projeto';
}

function getPendenciasMedicaoPrimaryDate(medicao) {
    const dates = (medicao?.measurementProjects || [])
        .map(project => project.measurementDate)
        .filter(Boolean)
        .sort();

    return dates[0] || null;
}

function renderPendenciasAguardandoPlantaList(medicoes) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canCreateAsAdminOrConferente();
    const rows = (medicoes || []).map(medicao => {
        const measurementDate = getPendenciasMedicaoPrimaryDate(medicao);
        return mapPendenciasInteractiveIdentity(medicao, {
            order: medicao.order,
            projectName: (medicao.measurementProjects || [])
                .map(project => getPendenciasMeasurementProjectLabel(project))
                .join(PENDENCIAS_DETAIL_SEPARATOR),
            measurementDateLabel: formatPendenciasDeliveryDate(measurementDate),
            measurementDate,
            orderId: medicao.orderId
        });
    });

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Aguardando Planta',
        subtitle: 'Medições em aberto com projetos aguardando planta levantada.',
        refreshButtonId: 'btn-pendencias-refresh-projetista-aguardando-planta',
        onRefresh: loadPendenciasProjetistaAguardandoPlanta,
        tableId: 'pendencias-projetista-aguardando-planta',
        rows,
        emptyMessage: 'Nenhuma medição em aberto aguardando planta.',
        minWidth: '820px',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({
                projectLabel: 'Projetos',
                projectCellClass: 'p-3 text-xs text-slate-500'
            }),
            getPendenciasInteractiveDateColumn({
                key: 'measurementDateLabel',
                label: 'Data medição',
                sortKey: 'measurementDate'
            }),
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-28',
                render: (row) => canAct
                    ? `<button type="button"
                        class="pendencias-projetista-editar-medicao-btn text-xs bg-teal-100 text-teal-800 hover:bg-teal-200 px-2.5 py-1 rounded-lg font-medium"
                        data-medicao-id="${row.id}"
                        data-order-id="${row.orderId}">
                        Editar
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-projetista-editar-medicao-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    openPendenciasEditarMedicao(
                        Number(button.dataset.medicaoId),
                        Number(button.dataset.orderId)
                    );
                });
            });
        }
    });
}

async function openPendenciasEditarMedicao(measurementId, orderId) {
    if (!canSeePendenciasProjetistaMedicaoConferenciaMenus()) {
        alertAppDialog('Sem permissão para editar medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    activeOrderId = Number(orderId);
    if (!activeOrderId || !measurementId) return;

    if (typeof loadMedicoes === 'function') {
        await loadMedicoes(activeOrderId);
    }

    const medicao = medicoesCache.find(item => Number(item.id) === Number(measurementId));
    if (medicao && typeof canEditMedicao === 'function' && !canEditMedicao(medicao)) {
        alertAppDialog('Sem permissão para editar esta medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (typeof openMedicaoModal === 'function') {
        await openMedicaoModal(measurementId);
    }
}

window.openPendenciasEditarMedicao = openPendenciasEditarMedicao;

async function loadPendenciasProjetistaAguardandoPlanta() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando medições...</p>';
    }

    if (!canSeePendenciasProjetistaMedicaoConferenciaMenus()) {
        renderPendenciasPlaceholder('Aguardando Planta', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, medicoes } = await fetchPendenciasAguardandoPlantaMedicoes();

    if (error) {
        renderPendenciasPlaceholder('Aguardando Planta', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasAguardandoPlantaList(medicoes);
}

async function openPendenciasNovaMedicao(orderId) {
    if (!canCreateAsAdminOrConferente()) {
        alertAppDialog('Sem permissão para criar medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    activeOrderId = Number(orderId);
    if (!activeOrderId) return;

    if (typeof loadMedicoes === 'function') {
        await loadMedicoes(activeOrderId);
    }

    if (typeof openMedicaoModal === 'function') {
        await openMedicaoModal();
    }
}

async function openPendenciasNovaConferencia(orderId) {
    if (!canCreateAsAdminOrConferente()) {
        alertAppDialog('Sem permissão para criar conferência.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    activeOrderId = Number(orderId);
    if (!activeOrderId) return;

    if (typeof loadAnteprojetoConferences === 'function') {
        await loadAnteprojetoConferences(activeOrderId);
    }

    if (typeof openAnteprojetoModal === 'function') {
        await openAnteprojetoModal();
    }
}

window.openPendenciasNovaMedicao = openPendenciasNovaMedicao;
window.openPendenciasNovaConferencia = openPendenciasNovaConferencia;

async function loadPendenciasProjetistaAguardandoMedicao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando pedidos...</p>';
    }

    if (!canSeePendenciasProjetistaMedicaoConferenciaMenus()) {
        renderPendenciasPlaceholder('Aguardando Medição', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, orders } = await fetchPendenciasProjetistaAguardandoMedicaoOrders();

    if (error) {
        renderPendenciasPlaceholder('Aguardando Medição', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasProjetistaOrdersList({
        title: 'Aguardando Medição',
        subtitle: 'Pedidos com pelo menos um projeto aguardando medição.',
        orders,
        emptyMessage: 'Nenhum pedido com projeto aguardando medição.',
        refreshButtonId: 'btn-pendencias-refresh-projetista-aguardando-medicao',
        refreshHandler: () => loadPendenciasProjetistaAguardandoMedicao(),
        tableId: 'pendencias-projetista-aguardando-medicao',
        actionLabel: 'Nova Medição',
        actionButtonClass: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200',
        actionButtonSelector: 'pendencias-projetista-nova-medicao-btn',
        onAction: openPendenciasNovaMedicao
    });
}

async function loadPendenciasProjetistaConferencias() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando pedidos...</p>';
    }

    if (!canSeePendenciasProjetistaMedicaoConferenciaMenus()) {
        renderPendenciasPlaceholder('Conferências', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, orders } = await fetchPendenciasProjetistaConferenciasOrders();

    if (error) {
        renderPendenciasPlaceholder('Conferências', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasProjetistaOrdersList({
        title: 'Conferências',
        subtitle: 'Pedidos com pelo menos um projeto em planta levantada.',
        orders,
        emptyMessage: 'Nenhum pedido com projeto em planta levantada.',
        refreshButtonId: 'btn-pendencias-refresh-projetista-conferencias',
        refreshHandler: () => loadPendenciasProjetistaConferencias(),
        tableId: 'pendencias-projetista-conferencias',
        actionLabel: 'Nova Conferência',
        actionButtonClass: 'bg-lime-100 text-lime-800 hover:bg-lime-200',
        actionButtonSelector: 'pendencias-projetista-nova-conferencia-btn',
        onAction: openPendenciasNovaConferencia
    });
}

