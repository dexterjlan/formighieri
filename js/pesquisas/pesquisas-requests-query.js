const PESQUISAS_REQUESTS_STATUS_OPTIONS = [
    'Aguardando Consultor',
    'Aguardando Projetista',
    'Encerrado'
];
const PESQUISAS_REQUESTS_DEFAULT_CHECKED_STATUSES = PESQUISAS_REQUESTS_STATUS_OPTIONS
    .filter(status => status !== 'Encerrado');
let pesquisasRequestsCache = [];

async function fetchPesquisasOrderRequests() {
    const { data, error } = await supabaseClient
        .from('OrderRequest')
        .select('*')
        .order('createdAt', { ascending: false });

    if (error) throw error;
    return data || [];
}

async function enrichPesquisasRequests(requests = []) {
    if (!requests.length) return [];

    const orderIds = [...new Set(requests.map(item => item.orderId).filter(Boolean))];
    const projectIds = [...new Set(requests.map(item => item.orderProjectId).filter(Boolean))];

    let ordersById = {};
    if (orderIds.length) {
        const { data: orders } = await supabaseClient
            .from('salesOrders')
            .select(getSalesOrderMinimalEmbedSelect())
            .in('id', orderIds);
        ordersById = Object.fromEntries((orders || []).map(order => [order.id, order]));
    }

    let projectsById = {};
    if (projectIds.length) {
        const { data: projects } = await supabaseClient
            .from('OrderProject')
            .select('id, name, projectCode')
            .in('id', projectIds);
        projectsById = Object.fromEntries((projects || []).map(project => [project.id, project]));
    }

    return requests.map(request => {
        const order = ordersById[request.orderId] || null;
        const project = projectsById[request.orderProjectId] || null;
        return {
            ...request,
            order,
            orderProject: project,
            projectName: project?.name || '—'
        };
    });
}

async function openPesquisasRequestDetail(requestId) {
    const id = Number(requestId);
    if (!id) return;

    let request = pesquisasRequestsCache.find(item => Number(item.id) === id);

    if (!request) {
        const { data, error } = await supabaseClient
            .from('OrderRequest')
            .select(`*, order:salesOrders(${getSalesOrderMinimalEmbedSelect()}), orderProject:OrderProject(id, name, projectCode)`)
            .eq('id', id)
            .maybeSingle();

        if (error || !data) {
            alertAppDialog('Requisição não encontrada.');
            return;
        }

        request = {
            ...data,
            projectName: data.orderProject?.name || '—'
        };
    }

    const cacheIndex = conversationsCache.findIndex(item => Number(item.id) === id);
    if (cacheIndex >= 0) {
        conversationsCache[cacheIndex] = { ...conversationsCache[cacheIndex], ...request };
    } else {
        conversationsCache = [...conversationsCache, request];
    }

    if (typeof canEditConversation === 'function' && canEditConversation(request)) {
        await editConversation(id);
        return;
    }

    if (typeof viewConversationDetails === 'function') {
        await viewConversationDetails(id);
        return;
    }

    alertAppDialog('Sem permissão para visualizar esta requisição.', { variant: 'warning', title: 'Aviso' });
}

window.openPesquisasRequestDetail = openPesquisasRequestDetail;

async function searchPesquisasRequests() {
    const tbody = document.getElementById('pesquisas-requests-list');
    const countEl = document.getElementById('pesquisas-requests-count');
    if (!tbody || !countEl) return;

    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-xs text-slate-400 text-center">Carregando...</td></tr>`;

    try {
        if (!pesquisasRequestsCache.length) {
            pesquisasRequestsCache = await enrichPesquisasRequests(await fetchPesquisasOrderRequests());
        }

        const filters = getPesquisasTextFilters('requests');
        const rows = pesquisasRequestsCache.filter(request => matchesPesquisasTextFilters(request, filters, {
            orderCode: item => item.order?.orderCode || '',
            clientName: item => getOrderClientName(item.order) || '',
            status: item => normalizeRequestStatus(item)
        }));

        countEl.textContent = `${rows.length} registro${rows.length === 1 ? '' : 's'}`;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-xs text-slate-400">Nenhuma requisição encontrada.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(request => {
            const status = normalizeRequestStatus(request);
            const statusClass = getRequestStatusBadgeClass(status);
            return `
                <tr class="border-b border-slate-100 last:border-0">
                    <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(request.order?.orderCode || '—')}</td>
                    <td class="p-3 text-xs text-slate-700">${escapeHtml(getOrderClientName(request.order) || '—')}</td>
                    <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(request.projectName || '—')}</td>
                    <td class="p-3">${getRequestTypeBadgeHtml(request)}</td>
                    <td class="p-3 text-xs">
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(status)}</span>
                    </td>
                    <td class="p-3 whitespace-nowrap">
                        <button type="button"
                            onclick="openPesquisasRequestDetail(${request.id})"
                            class="text-xs bg-indigo-100 text-indigo-800 hover:bg-indigo-200 px-2.5 py-1 rounded-lg font-medium">Detalhe</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('searchPesquisasRequests:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-xs text-red-500 text-center">Erro ao carregar requisições: ${escapeHtml(error.message || 'Erro desconhecido')}</td></tr>`;
        countEl.textContent = '0 registros';
    }
}

async function loadPesquisasRequestsQuery() {
    const content = document.getElementById('pesquisas-content');
    if (!content) return;

    const statusOptions = [...PESQUISAS_REQUESTS_STATUS_OPTIONS];
    const defaultCheckedStatuses = [...PESQUISAS_REQUESTS_DEFAULT_CHECKED_STATUSES];

    const tableHeadHtml = `
        <th class="text-left p-3 font-semibold">Pedido</th>
        <th class="text-left p-3 font-semibold">Cliente</th>
        <th class="text-left p-3 font-semibold">Projeto</th>
        <th class="text-left p-3 font-semibold">Tipo</th>
        <th class="text-left p-3 font-semibold">Status</th>
        <th class="text-left p-3 font-semibold w-24">Ação</th>
    `;

    content.innerHTML = renderPesquisasQueryShell(
        'requests',
        'Requisições',
        'Consulte requisições entre consultor e projetista.',
        statusOptions,
        tableHeadHtml,
        'pesquisas-requests-list',
        defaultCheckedStatuses
    );

    bindPesquisasQueryForm('requests', searchPesquisasRequests, defaultCheckedStatuses);
    await searchPesquisasRequests();
}

window.loadPesquisasRequestsQuery = loadPesquisasRequestsQuery;
