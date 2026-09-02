let gestaoCreateDetailingProjectsCache = [];

const GESTAO_CREATE_DETAILING_OVERLAY = createModalOverlayConfig('gestao-create-detailing');

function setGestaoCreateDetailingLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(GESTAO_CREATE_DETAILING_OVERLAY, active, message, status);
}

function waitGestaoCreateDetailingStatus(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getGestaoCreateDetailingFilters() {
    return {
        orderCode: document.getElementById('gestao-create-detailing-filter-order')?.value.trim() || '',
        clientName: document.getElementById('gestao-create-detailing-filter-client')?.value.trim() || ''
    };
}

function getGestaoCreateDetailingProjectStatusName(project) {
    return project?.projectStatus?.name
        || (typeof gestaoProjectStatusesCache !== 'undefined'
            ? gestaoProjectStatusesCache.find(status => Number(status.id) === Number(project?.statusId))?.name
            : null)
        || '—';
}

async function fetchGestaoCreateDetailingByProjectIds(projectIds) {
    const ids = [...new Set((projectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!ids.length) return {};

    const byProjectId = {};
    const chunkSize = 200;

    for (let index = 0; index < ids.length; index += chunkSize) {
        const chunk = ids.slice(index, index + chunkSize);
        const { data, error } = await supabaseClient
            .from('Detailing')
            .select('id, orderProjectId, status')
            .in('orderProjectId', chunk);

        if (error?.message?.includes('Detailing')) {
            throw new Error('Tabela Detailing não encontrada.');
        }
        if (error) throw error;

        (data || []).forEach(row => {
            const projectId = Number(row.orderProjectId);
            if (!projectId || byProjectId[projectId]) return;
            byProjectId[projectId] = row;
        });
    }

    return byProjectId;
}

async function fetchGestaoCreateDetailingProjects(filters = {}) {
    const orderCode = String(filters.orderCode || '').trim();
    const clientName = String(filters.clientName || '').trim();

    if (!orderCode && !clientName) {
        return { projects: [], requiresFilter: true };
    }

    const orderSelect = clientName
        ? 'id, orderCode, clientId, consultantUserId, client:Client!inner(name), consultor:appUsers!consultantUserId(name)'
        : getSalesOrderMinimalEmbedSelect();

    let orderQuery = supabaseClient
        .from('salesOrders')
        .select(orderSelect)
        .order('orderCode', { ascending: true })
        .limit(200);

    if (orderCode) {
        orderQuery = orderQuery.ilike('orderCode', `%${orderCode}%`);
    }
    if (clientName) {
        orderQuery = orderQuery.ilike('client.name', `%${clientName}%`);
    }

    const { data: orders, error: ordersError } = await orderQuery;
    if (ordersError) throw new Error(ordersError.message);

    if (!orders?.length) {
        return { projects: [], requiresFilter: false };
    }

    const orderById = Object.fromEntries(orders.map(order => [Number(order.id), order]));
    const orderIds = orders.map(order => order.id);

    let projectResult = await supabaseClient
        .from('OrderProject')
        .select(`
            id, orderId, projectCode, name, statusId,
            projectStatus:OrderProjectStatus(id, name)
        `)
        .in('orderId', orderIds)
        .order('orderId', { ascending: true })
        .order('name', { ascending: true });

    if (projectResult.error?.message?.includes('projectStatus')) {
        projectResult = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, projectCode, name, statusId')
            .in('orderId', orderIds)
            .order('orderId', { ascending: true })
            .order('name', { ascending: true });
    }

    if (projectResult.error) throw new Error(projectResult.error.message);

    const projects = projectResult.data || [];
    const detailingByProjectId = await fetchGestaoCreateDetailingByProjectIds(projects.map(project => project.id));

    return {
        requiresFilter: false,
        projects: projects.map(project => ({
            ...project,
            order: orderById[Number(project.orderId)] || null,
            detailing: detailingByProjectId[Number(project.id)] || null
        }))
    };
}

function renderGestaoCreateDetailingEmptyRow(message) {
    return `
        <tr>
            <td colspan="5" class="p-6 text-center text-xs text-slate-500">${escapeHtml(message)}</td>
        </tr>
    `;
}

function renderGestaoCreateDetailingProjectsList(projects = gestaoCreateDetailingProjectsCache) {
    const tbody = document.getElementById('gestao-create-detailing-list');
    const countEl = document.getElementById('gestao-create-detailing-count');
    if (!tbody) return;

    if (countEl) {
        countEl.textContent = `${projects.length} projeto${projects.length === 1 ? '' : 's'}`;
    }

    if (!projects.length) {
        tbody.innerHTML = renderGestaoCreateDetailingEmptyRow('Nenhum projeto encontrado para os filtros informados.');
        return;
    }

    tbody.innerHTML = projects.map(project => {
        const statusName = getGestaoCreateDetailingProjectStatusName(project);
        const statusClass = typeof getOrderProjectStatusBadgeClass === 'function'
            ? getOrderProjectStatusBadgeClass(statusName)
            : 'bg-slate-100 text-slate-700';
        const projectName = project.name || '—';
        const hasDetailing = Boolean(project.detailing?.id);
        const actionButton = hasDetailing
            ? `<button type="button"
                    class="gestao-create-detailing-open text-[10px] bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
                    data-project-id="${project.id}"
                    data-project-name="${escapeHtml(projectName)}">
                    Detalhamento
                </button>`
            : `<button type="button"
                    class="gestao-create-detailing-create text-[10px] bg-emerald-700 text-white hover:bg-emerald-800 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
                    data-project-id="${project.id}"
                    data-project-name="${escapeHtml(projectName)}">
                    Criar
                </button>`;

        return `
            <tr data-project-id="${project.id}">
                <td class="p-3 font-mono text-xs text-indigo-800 whitespace-nowrap">${escapeHtml(project.order?.orderCode || '—')}</td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(typeof getOrderClientName === 'function' ? (getOrderClientName(project.order) || '—') : '—')}</td>
                <td class="p-3 text-xs text-slate-800">${escapeHtml(projectName)}</td>
                <td class="p-3 whitespace-nowrap">
                    <span class="inline-flex text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(statusName)}
                    </span>
                </td>
                <td class="p-3 text-right">${actionButton}</td>
            </tr>
        `;
    }).join('');
}

async function loadGestaoCreateDetailingProjectsList() {
    const tbody = document.getElementById('gestao-create-detailing-list');
    const countEl = document.getElementById('gestao-create-detailing-count');
    if (!tbody || !isAdmin()) return;

    const filters = getGestaoCreateDetailingFilters();
    if (!filters.orderCode && !filters.clientName) {
        gestaoCreateDetailingProjectsCache = [];
        if (countEl) countEl.textContent = '0 projetos';
        tbody.innerHTML = renderGestaoCreateDetailingEmptyRow(
            'Informe o código do pedido e/ou o nome do cliente para buscar projetos.'
        );
        return;
    }

    tbody.innerHTML = renderGestaoCreateDetailingEmptyRow('Buscando projetos...');

    try {
        if (typeof loadGestaoProjectStatuses === 'function' && !(gestaoProjectStatusesCache || []).length) {
            await loadGestaoProjectStatuses();
        }

        const result = await fetchGestaoCreateDetailingProjects(filters);
        gestaoCreateDetailingProjectsCache = result.projects || [];
        renderGestaoCreateDetailingProjectsList(gestaoCreateDetailingProjectsCache);
    } catch (error) {
        console.error('loadGestaoCreateDetailingProjectsList:', error);
        gestaoCreateDetailingProjectsCache = [];
        if (countEl) countEl.textContent = '0 projetos';
        tbody.innerHTML = renderGestaoCreateDetailingEmptyRow(`Erro ao buscar: ${error.message}`);
    }
}

function resetGestaoCreateDetailingFilters() {
    const orderInput = document.getElementById('gestao-create-detailing-filter-order');
    const clientInput = document.getElementById('gestao-create-detailing-filter-client');
    if (orderInput) orderInput.value = '';
    if (clientInput) clientInput.value = '';
    gestaoCreateDetailingProjectsCache = [];
    const tbody = document.getElementById('gestao-create-detailing-list');
    const countEl = document.getElementById('gestao-create-detailing-count');
    if (countEl) countEl.textContent = '0 projetos';
    if (tbody) {
        tbody.innerHTML = renderGestaoCreateDetailingEmptyRow(
            'Informe o código do pedido e/ou o nome do cliente para buscar projetos.'
        );
    }
}

async function openGestaoCreateDetailingRecord(projectId, projectName) {
    if (typeof openDetailingModal === 'function') {
        await openDetailingModal(projectId, projectName);
        return;
    }
    if (typeof openDetalhamentoModal === 'function') {
        await openDetalhamentoModal(projectId, projectName);
    }
}

async function createGestaoCreateDetailingRecord(projectId, projectName, button) {
    if (!isAdmin()) {
        alertAppDialog('Somente administradores podem criar detalhamento por esta tela.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const confirmed = await confirmAppDialog(
        `Criar detalhamento para o projeto "${projectName || '—'}"?`,
        { title: 'Criar detalhamento', confirmLabel: 'Criar' }
    );
    if (!confirmed) return;

    try {
        setGestaoCreateDetailingLoading(true, 'Criando detalhamento...');

        let record = null;
        if (typeof createDetalhamentoRecord === 'function') {
            record = await createDetalhamentoRecord(projectId);
            if (record && typeof notifyAguardandoDetalhamentoEmail === 'function') {
                setGestaoCreateDetailingLoading(true, 'Enviando notificação...');
                await notifyAguardandoDetalhamentoEmail({
                    orderProjectId: projectId,
                    projectFilePath: record.projectFilePath || ''
                });
            }
        } else if (typeof createDetailingForProject === 'function') {
            record = await createDetailingForProject(projectId);
        } else {
            throw new Error('Módulo de detalhamento não carregado.');
        }

        if (!record) {
            throw new Error('Não foi possível criar o detalhamento.');
        }

        setGestaoCreateDetailingLoading(true, 'Atualizando lista...');
        await loadGestaoCreateDetailingProjectsList();
        setGestaoCreateDetailingLoading(true, 'Detalhamento criado com sucesso!', 'success');
        await waitGestaoCreateDetailingStatus(1500);
        setGestaoCreateDetailingLoading(false);
        await openGestaoCreateDetailingRecord(projectId, projectName);
    } catch (error) {
        const alreadyExists = String(error?.code || '') === '23505'
            || /duplicate|unique/i.test(String(error?.message || ''));
        if (alreadyExists) {
            setGestaoCreateDetailingLoading(true, 'Detalhamento já existe. Abrindo...');
            await loadGestaoCreateDetailingProjectsList();
            await waitGestaoCreateDetailingStatus(800);
            setGestaoCreateDetailingLoading(false);
            await openGestaoCreateDetailingRecord(projectId, projectName);
            return;
        }

        console.error('createGestaoCreateDetailingRecord:', error);
        setGestaoCreateDetailingLoading(true, `Erro ao criar detalhamento: ${error.message}`, 'error');
        await waitGestaoCreateDetailingStatus(2500);
        setGestaoCreateDetailingLoading(false);
    }
}

function showGestaoCreateDetailingPanel() {
    if (!isAdmin()) {
        alertAppDialog('Somente administradores podem acessar Criar Detalhamento.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    hideAllGestaoPanels();
    document.getElementById('gestao-create-detailing-panel')?.classList.remove('hidden');
    setGestaoNavActive('create-detailing');
}

function bindGestaoCreateDetailingEvents() {
    document.getElementById('gestao-nav-create-detailing')?.addEventListener('click', () => {
        if (typeof editingGestaoOrderId !== 'undefined') editingGestaoOrderId = null;
        showGestaoCreateDetailingPanel();
    });

    document.getElementById('gestao-create-detailing-filter-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await loadGestaoCreateDetailingProjectsList();
    });

    document.getElementById('gestao-create-detailing-filter-clear')?.addEventListener('click', () => {
        resetGestaoCreateDetailingFilters();
    });

    document.getElementById('gestao-create-detailing-list')?.addEventListener('click', async (event) => {
        const openButton = event.target.closest('.gestao-create-detailing-open');
        if (openButton) {
            await openGestaoCreateDetailingRecord(
                Number(openButton.dataset.projectId),
                openButton.dataset.projectName || ''
            );
            return;
        }

        const createButton = event.target.closest('.gestao-create-detailing-create');
        if (createButton) {
            await createGestaoCreateDetailingRecord(
                Number(createButton.dataset.projectId),
                createButton.dataset.projectName || '',
                createButton
            );
        }
    });
}

bindGestaoCreateDetailingEvents();
