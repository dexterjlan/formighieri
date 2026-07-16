async function openRequestFromPendencias(requestId) {
    const id = Number(requestId);
    if (!id) return;

    let request = pendenciasRequisicaoCache.find(item => Number(item.id) === id);

    if (!request) {
        const selectWithProject = `
            *,
            order:salesOrders(id, orderCode, clientName),
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
                .select('*, order:salesOrders(id, orderCode, clientName)')
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
        actionButtonSelector
    } = config;

    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canCreateAsAdminOrConferente();
    const detailLabelFn = config.detailLabelFn || getPendenciasProjectDetailLabel;
    const rows = orders.map(orderGroup => {
        const orderCode = orderGroup.order?.orderCode || '—';
        const clientName = orderGroup.order?.clientName || '—';
        const projectCount = orderGroup.projects.length;
        const projectSummary = orderGroup.projects
            .map(project => detailLabelFn(project))
            .join(PENDENCIAS_DETAIL_SEPARATOR);
        const actionCell = canAct
            ? `<button type="button"
                class="${actionButtonSelector} text-xs px-2.5 py-1 rounded-lg font-medium ${actionButtonClass}"
                data-order-id="${orderGroup.orderId}">
                ${escapeHtml(actionLabel)}
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${projectCount} projeto${projectCount === 1 ? '' : 's'}</td>
                <td class="p-3 text-xs text-slate-500">${escapeHtml(projectSummary)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">${escapeHtml(title)}</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="${refreshButtonId}"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${orders.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[820px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projetos</th>
                                <th class="text-left p-3 font-semibold">Detalhe</th>
                                <th class="text-right p-3 font-semibold w-40">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector(`#${refreshButtonId}`)
        ?.addEventListener('click', refreshHandler);

    content.querySelectorAll(`.${actionButtonSelector}`).forEach(button => {
        button.addEventListener('click', async () => {
            config.onAction(Number(button.dataset.orderId));
        });
    });
}

function isPendenciasMedicaoTableMissingError(error) {
    const message = String(error?.message || '');
    return /relation.*"Medicao".*does not exist/i.test(message)
        || /relation.*Medicao.*does not exist/i.test(message);
}

async function fetchPendenciasAguardandoPlantaMedicoes() {
    const selectVariants = [
        `
            id, orderId, observation, createdAt, createdById,
            order:salesOrders(id, orderCode, clientName),
            medicaoProjects:MedicaoProject(
                id, orderProjectId, measurementDate, plantaLevantada, plantaLevantadaDate,
                orderProject:OrderProject(id, name, projectCode)
            )
        `,
        `
            id, orderId, observation, createdAt, createdById,
            order:salesOrders(id, orderCode, clientName),
            medicaoProjects:MedicaoProject(id, orderProjectId, measurementDate, plantaLevantada, plantaLevantadaDate)
        `,
        `
            id, orderId, observation, createdAt, createdById,
            medicaoProjects:MedicaoProject(id, orderProjectId, measurementDate, plantaLevantada, plantaLevantadaDate)
        `,
        'id, orderId, observation, createdAt, createdById'
    ];

    let result = { data: [], error: null };

    for (const selectColumns of selectVariants) {
        result = await supabaseClient
            .from('Medicao')
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
            (medicao.medicaoProjects || [])
                .map(project => Number(project.orderProjectId))
                .filter(Boolean)
        )
    )];

    let orderById = {};
    if (orderIds.length && medicoes.some(medicao => !medicao.order)) {
        const { data: orders } = await supabaseClient
            .from('salesOrders')
            .select('id, orderCode, clientName')
            .in('id', orderIds);

        orderById = Object.fromEntries((orders || []).map(order => [Number(order.id), order]));
    }

    let projectById = {};
    if (projectIds.length && medicoes.some(medicao =>
        (medicao.medicaoProjects || []).some(project => project.orderProjectId && !project.orderProject)
    )) {
        const { data: projects } = await supabaseClient
            .from('OrderProject')
            .select('id, name, projectCode')
            .in('id', projectIds);

        projectById = Object.fromEntries((projects || []).map(project => [Number(project.id), project]));
    }

    if (medicoes.some(medicao => !medicao.medicaoProjects)) {
        const medicaoIds = medicoes.map(medicao => medicao.id).filter(Boolean);
        if (medicaoIds.length) {
            const { data: medicaoProjects } = await supabaseClient
                .from('MedicaoProject')
                .select('id, medicaoId, orderProjectId, measurementDate, plantaLevantada, plantaLevantadaDate')
                .in('medicaoId', medicaoIds);

            const projectsByMedicaoId = {};
            (medicaoProjects || []).forEach(project => {
                const medicaoId = Number(project.medicaoId);
                if (!projectsByMedicaoId[medicaoId]) projectsByMedicaoId[medicaoId] = [];
                projectsByMedicaoId[medicaoId].push(project);
            });

            medicoes = medicoes.map(medicao => ({
                ...medicao,
                medicaoProjects: medicao.medicaoProjects || projectsByMedicaoId[Number(medicao.id)] || []
            }));
        }
    }

    medicoes = medicoes.map(medicao => ({
        ...medicao,
        order: medicao.order || orderById[Number(medicao.orderId)] || null,
        medicaoProjects: (medicao.medicaoProjects || []).map(project => ({
            ...project,
            orderProject: project.orderProject || projectById[Number(project.orderProjectId)] || null
        }))
    }));

    const openMedicoes = medicoes.filter(medicao => {
        const projects = medicao.medicaoProjects || [];
        return projects.length > 0 && projects.some(project => !project.plantaLevantada);
    });

    return { error: null, medicoes: openMedicoes };
}

function getPendenciasMedicaoProjectLabel(medicaoProject) {
    return medicaoProject?.orderProject?.name || 'Projeto';
}

function getPendenciasMedicaoPrimaryDate(medicao) {
    const dates = (medicao?.medicaoProjects || [])
        .map(project => project.measurementDate)
        .filter(Boolean)
        .sort();

    return dates[0] || null;
}

function renderPendenciasAguardandoPlantaList(medicoes) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canCreateAsAdminOrConferente();
    const rows = medicoes.map(medicao => {
        const orderCode = medicao.order?.orderCode || '—';
        const clientName = medicao.order?.clientName || '—';
        const measurementDate = formatPendenciasDeliveryDate(getPendenciasMedicaoPrimaryDate(medicao));
        const projectSummary = (medicao.medicaoProjects || [])
            .map(project => getPendenciasMedicaoProjectLabel(project))
            .join(PENDENCIAS_DETAIL_SEPARATOR);
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-projetista-editar-medicao-btn text-xs bg-teal-100 text-teal-800 hover:bg-teal-200 px-2.5 py-1 rounded-lg font-medium"
                data-medicao-id="${medicao.id}"
                data-order-id="${medicao.orderId}">
                Editar
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(measurementDate)}</td>
                <td class="p-3 text-xs text-slate-500">${escapeHtml(projectSummary)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aguardando Planta</h3>
                    <p class="text-xs text-slate-400 mt-0.5">Medições em aberto com projetos aguardando planta levantada.</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-projetista-aguardando-planta"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${medicoes.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[820px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Data medição</th>
                                <th class="text-left p-3 font-semibold">Projetos</th>
                                <th class="text-right p-3 font-semibold w-28">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhuma medição em aberto aguardando planta.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-projetista-aguardando-planta')
        ?.addEventListener('click', () => loadPendenciasProjetistaAguardandoPlanta());

    content.querySelectorAll('.pendencias-projetista-editar-medicao-btn').forEach(button => {
        button.addEventListener('click', async () => {
            openPendenciasEditarMedicao(
                Number(button.dataset.medicaoId),
                Number(button.dataset.orderId)
            );
        });
    });
}

async function openPendenciasEditarMedicao(medicaoId, orderId) {
    if (!canSeePendenciasProjetistaMedicaoConferenciaMenus()) {
        alertAppDialog('Sem permissão para editar medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    activeOrderId = Number(orderId);
    if (!activeOrderId || !medicaoId) return;

    if (typeof loadMedicoes === 'function') {
        await loadMedicoes(activeOrderId);
    }

    const medicao = medicoesCache.find(item => Number(item.id) === Number(medicaoId));
    if (medicao && typeof canEditMedicao === 'function' && !canEditMedicao(medicao)) {
        alertAppDialog('Sem permissão para editar esta medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (typeof openMedicaoModal === 'function') {
        await openMedicaoModal(medicaoId);
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
        actionLabel: 'Nova Conferência',
        actionButtonClass: 'bg-lime-100 text-lime-800 hover:bg-lime-200',
        actionButtonSelector: 'pendencias-projetista-nova-conferencia-btn',
        onAction: openPendenciasNovaConferencia
    });
}

