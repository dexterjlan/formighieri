const PESQUISAS_DETAILING_STATUS_OPTIONS = [
    DETALHAMENTO_STATUS_AGUARDANDO,
    DETALHAMENTO_STATUS_EM_ANDAMENTO,
    DETALHAMENTO_STATUS_PRONTO
];
const PESQUISAS_DETAILING_DEFAULT_CHECKED_STATUSES = PESQUISAS_DETAILING_STATUS_OPTIONS
    .filter(status => status !== DETALHAMENTO_STATUS_PRONTO);

let pesquisasDetailingCache = [];

function formatPesquisasDetailingDate(value) {
    if (!value) return '—';
    if (typeof formatDisplayDate === 'function') return formatDisplayDate(value);
    if (typeof formatDate === 'function') return formatDate(value);
    return String(value).slice(0, 10);
}

async function fetchPesquisasDetailings() {
    const selectColumns = typeof DETALHAMENTO_PENDENCIAS_SELECT === 'string'
        ? DETALHAMENTO_PENDENCIAS_SELECT
        : `
            id, orderProjectId, status, designerId, startedAt, completedAt,
            designer:appUsers!Detailing_designerId_fkey(id, name),
            orderProject:OrderProject(
                id, orderId, projectCode, name,
                order:salesOrders(${typeof getSalesOrderMinimalEmbedSelect === 'function' ? getSalesOrderMinimalEmbedSelect() : 'id, orderCode'})
            )
        `;

    const { data, error } = await supabaseClient
        .from('Detailing')
        .select(selectColumns)
        .order('createdAt', { ascending: false });

    if (error?.message?.includes('Detailing') || error?.message?.includes('does not exist')) {
        throw new Error('Tabela Detailing não encontrada.');
    }
    if (error) throw error;
    return data || [];
}

function mapPesquisasDetailingRow(record) {
    const project = record.orderProject || {};
    const order = project.order || {};
    const statusName = record.status || '—';

    return mapPendenciasInteractiveIdentity(record, {
        id: record.id,
        projectId: project.id || record.orderProjectId,
        orderCode: order.orderCode || '—',
        clientName: typeof getOrderClientName === 'function' ? (getOrderClientName(order) || '—') : '—',
        projectName: project.name || '—',
        designerName: record.designer?.name || '—',
        designerId: record.designerId || record.designer?.id || null,
        statusName,
        statusClass: typeof getDetalhamentoStatusBadgeClass === 'function'
            ? getDetalhamentoStatusBadgeClass(statusName)
            : 'bg-amber-100 text-amber-800',
        startedAt: record.startedAt,
        startedAtLabel: formatPesquisasDetailingDate(record.startedAt),
        completedAt: record.completedAt,
        completedAtLabel: formatPesquisasDetailingDate(record.completedAt)
    });
}

async function enrichPesquisasDetailings(records = []) {
    return (records || []).map(mapPesquisasDetailingRow);
}

async function populatePesquisasDetailingDesignerFilter() {
    const select = document.getElementById('pesquisas-detailing-designer');
    if (!select) return;

    let designers = [];
    if (typeof fetchDetalhamentoProjetistas === 'function') {
        designers = await fetchDetalhamentoProjetistas(true);
    }

    if (!designers.length && typeof loadConsultantAndDesignerFilterOptions === 'function') {
        const loaded = await loadConsultantAndDesignerFilterOptions({
            designerSelectId: 'pesquisas-detailing-designer'
        });
        if (loaded?.designers?.length) return;
    }

    select.innerHTML = '<option value="">Todos</option>';
    designers.forEach(designer => {
        select.innerHTML += `<option value="${designer.id}">${escapeHtml(designer.name)}</option>`;
    });
}

async function openPesquisasDetailingDetail(projectId, projectName) {
    const id = Number(projectId);
    if (!id) return;

    if (typeof openDetalhamentoModal === 'function') {
        await openDetalhamentoModal(id, projectName || 'Projeto');
        return;
    }
    if (typeof openDetailingModal === 'function') {
        await openDetailingModal(id, projectName || 'Projeto');
        return;
    }
    alertAppDialog('Não foi possível abrir o detalhamento.');
}

window.openPesquisasDetailingDetail = openPesquisasDetailingDetail;

function renderPesquisasDetailingTable(rows = []) {
    const mountEl = document.getElementById('pesquisas-detailing-table-mount');
    if (!mountEl) return;

    mountPesquisasInteractiveTable(mountEl, {
        refreshButtonId: 'btn-pesquisas-refresh-detailing',
        onRefresh: refreshPesquisasDetailingQuery,
        tableId: 'pesquisas-detailing',
        rows,
        minWidth: '980px',
        emptyMessage: 'Nenhum detalhamento encontrado.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({
                projectLabel: 'Nome do projeto'
            }),
            {
                key: 'designerName',
                label: 'Projetista',
                cellClass: 'p-3 text-xs text-slate-600'
            },
            getPendenciasInteractiveStatusColumn(),
            getPendenciasInteractiveDateColumn({
                key: 'startedAtLabel',
                label: 'Início',
                sortKey: 'startedAt'
            }),
            getPendenciasInteractiveDateColumn({
                key: 'completedAtLabel',
                label: 'Fim',
                sortKey: 'completedAt'
            }),
            getPendenciasInteractiveActionColumn({
                label: 'Ação',
                thClass: 'w-24',
                render: (row) => row.projectId
                    ? `<button type="button"
                        class="pesquisas-detailing-open-btn text-xs bg-indigo-100 text-indigo-800 hover:bg-indigo-200 px-2.5 py-1 rounded-lg font-medium"
                        data-project-id="${Number(row.projectId)}"
                        data-project-name="${escapeHtml(row.projectName || 'Projeto')}">
                        Detalhe
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pesquisas-detailing-open-btn').forEach(button => {
                button.addEventListener('click', () => {
                    openPesquisasDetailingDetail(button.dataset.projectId, button.dataset.projectName);
                });
            });
        }
    });
}

async function searchPesquisasDetailing() {
    const mountEl = document.getElementById('pesquisas-detailing-table-mount');
    if (!mountEl) return;

    try {
        if (!pesquisasDetailingCache.length) {
            pesquisasDetailingCache = await enrichPesquisasDetailings(await fetchPesquisasDetailings());
        }

        const filters = getPesquisasTextFilters('detailing');
        const projectNameFilter = document.getElementById('pesquisas-detailing-project')?.value.trim().toLowerCase() || '';
        const designerFilter = document.getElementById('pesquisas-detailing-designer')?.value || '';

        const rows = pesquisasDetailingCache.filter(record => {
            if (!matchesPesquisasTextFilters(record, filters, {
                orderCode: item => item.orderCode || '',
                clientName: item => item.clientName || '',
                status: item => item.statusName || ''
            })) {
                return false;
            }
            if (projectNameFilter && !(record.projectName || '').toLowerCase().includes(projectNameFilter)) {
                return false;
            }
            if (designerFilter && String(record.designerId || '') !== String(designerFilter)) {
                return false;
            }
            return true;
        });

        renderPesquisasDetailingTable(rows);
    } catch (error) {
        console.error('searchPesquisasDetailing:', error);
        mountEl.innerHTML = `<p class="text-xs text-red-500 text-center py-10 px-4">${escapeHtml(error.message || 'Erro ao carregar detalhamentos.')}</p>`;
    }
}

async function refreshPesquisasDetailingQuery() {
    pesquisasDetailingCache = [];
    await searchPesquisasDetailing();
}

async function loadPesquisasDetailingQuery() {
    const content = document.getElementById('pesquisas-content');
    if (!content) return;

    pesquisasDetailingCache = [];
    const statusOptions = [...PESQUISAS_DETAILING_STATUS_OPTIONS];
    const defaultCheckedStatuses = [...PESQUISAS_DETAILING_DEFAULT_CHECKED_STATUSES];

    const extraFiltersHtml = `
        <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Nome do projeto</label>
            <input type="text" id="pesquisas-detailing-project" placeholder="Nome do projeto"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600">
        </div>
        <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Projetista</label>
            <select id="pesquisas-detailing-designer"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-600">
                <option value="">Todos</option>
            </select>
        </div>
    `;

    renderPesquisasFilterLayout(content, {
        sectionId: 'detailing',
        title: 'Detalhamento',
        description: 'Consulte detalhamentos por pedido, cliente, projeto, projetista e status.',
        statusOptions,
        defaultCheckedStatuses,
        extraFiltersHtml
    });

    bindPesquisasQueryForm('detailing', searchPesquisasDetailing, defaultCheckedStatuses, {
        selectIds: ['pesquisas-detailing-designer'],
        textIds: ['pesquisas-detailing-project']
    });

    try {
        await populatePesquisasDetailingDesignerFilter();
    } catch (error) {
        console.warn('loadPesquisasDetailingQuery filters:', error);
    }

    const mountEl = document.getElementById('pesquisas-detailing-table-mount');
    if (mountEl) {
        mountEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando detalhamentos...</p>';
    }

    await searchPesquisasDetailing();
}

window.loadPesquisasDetailingQuery = loadPesquisasDetailingQuery;
