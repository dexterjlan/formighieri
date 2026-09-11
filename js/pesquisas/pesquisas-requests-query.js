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

    const designerIds = [...new Set(requests.map(request => request.designerId).filter(Boolean))];
    let designerById = {};

    if (designerIds.length) {
        const { data: designers } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', designerIds);

        designerById = Object.fromEntries((designers || []).map(designer => [designer.id, designer]));
    }

    return requests.map(request => {
        const order = ordersById[request.orderId] || null;
        const project = projectsById[request.orderProjectId] || null;
        return {
            ...request,
            order,
            orderProject: project,
            projectName: project?.name || '—',
            consultantName: typeof getOrderConsultantNameFromRecord === 'function'
                ? (getOrderConsultantNameFromRecord(order) || '—')
                : '—',
            designerName: designerById[request.designerId]?.name || '—'
        };
    });
}

function mapPesquisasRequestRows(requests = []) {
    return requests.map(request => {
        const requestType = typeof getRequestType === 'function' ? getRequestType(request) : 'project';
        const statusName = typeof normalizeRequestStatus === 'function'
            ? normalizeRequestStatus(request)
            : (request.status || '—');

        return mapPendenciasInteractiveIdentity(request, {
            id: request.id,
            orderCode: request.order?.orderCode || '—',
            clientName: getOrderClientName(request.order) || '—',
            projectName: request.projectName || '—',
            consultantName: request.consultantName || '—',
            designerName: request.designerName || '—',
            requestType,
            requestTypeLabel: typeof formatRequestType === 'function'
                ? formatRequestType(requestType)
                : requestType,
            statusName,
            statusClass: typeof getRequestStatusBadgeClass === 'function'
                ? getRequestStatusBadgeClass(statusName)
                : 'bg-slate-100 text-slate-600'
        });
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

function renderPesquisasRequestsTable(rows = []) {
    const mountEl = document.getElementById('pesquisas-requests-table-mount');
    if (!mountEl) return;

    mountPesquisasInteractiveTable(mountEl, {
        refreshButtonId: 'btn-pesquisas-refresh-requests',
        onRefresh: refreshPesquisasRequestsQuery,
        tableId: 'pesquisas-requests',
        rows,
        minWidth: '1020px',
        emptyMessage: 'Nenhuma requisição encontrada.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns(),
            {
                key: 'consultantName',
                label: 'Consultor',
                sortable: true,
                filterable: true,
                cellClass: 'p-3 text-xs text-slate-600'
            },
            {
                key: 'designerName',
                label: 'Projetista',
                sortable: true,
                filterable: true,
                cellClass: 'p-3 text-xs text-slate-600'
            },
            {
                key: 'requestTypeLabel',
                label: 'Tipo',
                cellClass: 'p-3',
                render: (row) => {
                    const badgeClass = typeof getRequestTypeBadgeClass === 'function'
                        ? getRequestTypeBadgeClass(row.requestType)
                        : 'bg-slate-100 text-slate-600';
                    return `<span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${badgeClass}">${escapeHtml(row.requestTypeLabel || '—')}</span>`;
                }
            },
            getPendenciasInteractiveStatusColumn(),
            getPendenciasInteractiveActionColumn({
                label: 'Ação',
                thClass: 'w-24',
                render: (row) => row.id
                    ? `<button type="button"
                        class="pesquisas-requests-open-btn text-xs bg-indigo-100 text-indigo-800 hover:bg-indigo-200 px-2.5 py-1 rounded-lg font-medium"
                        data-request-id="${Number(row.id)}">
                        Detalhe
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pesquisas-requests-open-btn').forEach(button => {
                button.addEventListener('click', () => {
                    openPesquisasRequestDetail(button.dataset.requestId);
                });
            });
        }
    });
}

async function searchPesquisasRequests() {
    const mountEl = document.getElementById('pesquisas-requests-table-mount');
    if (!mountEl) return;

    try {
        if (!pesquisasRequestsCache.length) {
            pesquisasRequestsCache = await enrichPesquisasRequests(await fetchPesquisasOrderRequests());
        }

        const filters = getPesquisasTextFilters('requests');
        const filtered = pesquisasRequestsCache.filter(request => matchesPesquisasTextFilters(request, filters, {
            orderCode: item => item.order?.orderCode || '',
            clientName: item => getOrderClientName(item.order) || '',
            status: item => (typeof normalizeRequestStatus === 'function' ? normalizeRequestStatus(item) : item.status)
        }));

        renderPesquisasRequestsTable(mapPesquisasRequestRows(filtered));
    } catch (error) {
        console.error('searchPesquisasRequests:', error);
        mountEl.innerHTML = `<p class="text-xs text-red-500 text-center py-10 px-4">${escapeHtml(error.message || 'Erro ao carregar requisições.')}</p>`;
    }
}

async function refreshPesquisasRequestsQuery() {
    pesquisasRequestsCache = [];
    await searchPesquisasRequests();
}

async function loadPesquisasRequestsQuery() {
    const content = document.getElementById('pesquisas-content');
    if (!content) return;

    const statusOptions = [...PESQUISAS_REQUESTS_STATUS_OPTIONS];
    const defaultCheckedStatuses = [...PESQUISAS_REQUESTS_DEFAULT_CHECKED_STATUSES];

    renderPesquisasFilterLayout(content, {
        sectionId: 'requests',
        title: 'Requisições',
        description: 'Consulte requisições entre consultor e projetista.',
        statusOptions,
        defaultCheckedStatuses
    });

    bindPesquisasQueryForm('requests', searchPesquisasRequests, defaultCheckedStatuses);

    const mountEl = document.getElementById('pesquisas-requests-table-mount');
    if (mountEl) {
        mountEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando requisições...</p>';
    }

    await searchPesquisasRequests();
}

window.loadPesquisasRequestsQuery = loadPesquisasRequestsQuery;
