const PESQUISAS_DETAILING_STATUS_OPTIONS = [
    DETALHAMENTO_STATUS_AGUARDANDO,
    DETALHAMENTO_STATUS_EM_ANDAMENTO,
    DETALHAMENTO_STATUS_PRONTO
];
const PESQUISAS_DETAILING_DEFAULT_CHECKED_STATUSES = PESQUISAS_DETAILING_STATUS_OPTIONS
    .filter(status => status !== DETALHAMENTO_STATUS_PRONTO);
const PESQUISAS_DETAILING_TABLE_COLSPAN = 8;

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
    return {
        ...record,
        orderCode: order.orderCode || '',
        clientName: typeof getOrderClientName === 'function' ? (getOrderClientName(order) || '') : '',
        projectName: project.name || '',
        projectId: project.id || record.orderProjectId,
        designerName: record.designer?.name || '',
        designerId: record.designerId || record.designer?.id || null
    };
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

async function searchPesquisasDetailing() {
    const tbody = document.getElementById('pesquisas-detailing-list');
    const countEl = document.getElementById('pesquisas-detailing-count');
    if (!tbody || !countEl) return;

    tbody.innerHTML = `<tr><td colspan="${PESQUISAS_DETAILING_TABLE_COLSPAN}" class="p-4 text-xs text-slate-400 text-center">Carregando...</td></tr>`;

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
                status: item => item.status || ''
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

        countEl.textContent = `${rows.length} registro${rows.length === 1 ? '' : 's'}`;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="${PESQUISAS_DETAILING_TABLE_COLSPAN}" class="p-6 text-center text-xs text-slate-400">Nenhum detalhamento encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(record => {
            const statusClass = typeof getDetalhamentoStatusBadgeClass === 'function'
                ? getDetalhamentoStatusBadgeClass(record.status)
                : 'bg-amber-100 text-amber-800';
            const projectName = record.projectName || 'Projeto';

            return `
                <tr class="border-b border-slate-100 last:border-0">
                    <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(record.orderCode || '—')}</td>
                    <td class="p-3 text-xs text-slate-700">${escapeHtml(record.clientName || '—')}</td>
                    <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectName || '—')}</td>
                    <td class="p-3 text-xs text-slate-600">${escapeHtml(record.designerName || '—')}</td>
                    <td class="p-3 text-xs">
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(record.status || '—')}</span>
                    </td>
                    <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${escapeHtml(formatPesquisasDetailingDate(record.startedAt))}</td>
                    <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${escapeHtml(formatPesquisasDetailingDate(record.completedAt))}</td>
                    <td class="p-3 whitespace-nowrap">
                        <button type="button"
                            class="pesquisas-detailing-open-btn text-xs bg-indigo-100 text-indigo-800 hover:bg-indigo-200 px-2.5 py-1 rounded-lg font-medium"
                            data-project-id="${Number(record.projectId) || 0}"
                            data-project-name="${escapeHtml(projectName)}">Detalhe</button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.pesquisas-detailing-open-btn').forEach(button => {
            button.addEventListener('click', () => {
                openPesquisasDetailingDetail(button.dataset.projectId, button.dataset.projectName);
            });
        });
    } catch (error) {
        console.error('searchPesquisasDetailing:', error);
        tbody.innerHTML = `<tr><td colspan="${PESQUISAS_DETAILING_TABLE_COLSPAN}" class="p-4 text-xs text-red-500 text-center">Erro ao carregar detalhamentos: ${escapeHtml(error.message || 'Erro desconhecido')}</td></tr>`;
        countEl.textContent = '0 registros';
    }
}

async function loadPesquisasDetailingQuery() {
    const content = document.getElementById('pesquisas-content');
    if (!content) return;

    pesquisasDetailingCache = [];
    const statusOptions = [...PESQUISAS_DETAILING_STATUS_OPTIONS];
    const defaultCheckedStatuses = [...PESQUISAS_DETAILING_DEFAULT_CHECKED_STATUSES];

    const tableHeadHtml = `
        <th class="text-left p-3 font-semibold">Pedido</th>
        <th class="text-left p-3 font-semibold">Cliente</th>
        <th class="text-left p-3 font-semibold">Nome do projeto</th>
        <th class="text-left p-3 font-semibold">Projetista</th>
        <th class="text-left p-3 font-semibold">Status</th>
        <th class="text-left p-3 font-semibold">Início</th>
        <th class="text-left p-3 font-semibold">Fim</th>
        <th class="text-left p-3 font-semibold w-24">Ação</th>
    `;

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

    content.innerHTML = renderPesquisasQueryShell(
        'detailing',
        'Detalhamento',
        'Consulte detalhamentos por pedido, cliente, projeto, projetista e status.',
        statusOptions,
        tableHeadHtml,
        'pesquisas-detailing-list',
        defaultCheckedStatuses,
        extraFiltersHtml
    );

    bindPesquisasQueryForm('detailing', searchPesquisasDetailing, defaultCheckedStatuses, {
        selectIds: ['pesquisas-detailing-designer'],
        textIds: ['pesquisas-detailing-project']
    });

    try {
        await populatePesquisasDetailingDesignerFilter();
    } catch (error) {
        console.warn('loadPesquisasDetailingQuery filters:', error);
    }

    await searchPesquisasDetailing();
}

window.loadPesquisasDetailingQuery = loadPesquisasDetailingQuery;
