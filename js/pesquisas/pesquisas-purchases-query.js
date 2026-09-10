let pesquisasPurchasesCache = [];
let pesquisasPurchaseStatusOptions = [];

function getPesquisasPurchaseDefaultCheckedStatuses(statusOptions = []) {
    const closedNames = typeof getCompraClosedStatusNames === 'function'
        ? getCompraClosedStatusNames()
        : ['Fechado'];

    return statusOptions.filter(status => !closedNames.includes(status));
}

async function loadPesquisasPurchaseStatusOptions() {
    if (typeof loadPurchaseStatuses === 'function') {
        const statuses = await loadPurchaseStatuses(false);
        pesquisasPurchaseStatusOptions = (statuses || []).map(item => item.name).filter(Boolean);
        return pesquisasPurchaseStatusOptions;
    }
    return [];
}

async function fetchAllPurchasesForSearch() {
    const { data, error } = await supabaseClient
        .from('Purchase')
        .select('*')
        .order('createdAt', { ascending: false });

    if (error?.message?.includes('Purchase') || error?.message?.includes('does not exist')) {
        throw new Error('Tabela Purchase não encontrada.');
    }

    if (error) throw error;
    return data || [];
}

async function enrichPesquisasPurchases(purchases = []) {
    if (!purchases.length) return [];

    const projectIds = [...new Set(purchases.map(item => item.orderProjectId).filter(Boolean))];
    const purchaseItemIds = [...new Set(purchases.map(item => item.implementationPurchaseItemId).filter(Boolean))];

    let projectsById = {};
    if (projectIds.length) {
        let projectResult = await supabaseClient
            .from('OrderProject')
            .select(`${getPendenciasProjectSelect()}`)
            .in('id', projectIds);

        if (projectResult.error?.message?.includes('projectStatus') || projectResult.error?.message?.includes('designer')) {
            projectResult = await supabaseClient
                .from('OrderProject')
                .select(`${getPendenciasProjectSelect({ includeStatus: false, includeDesigner: false })}`)
                .in('id', projectIds);
        }

        if (!projectResult.error) {
            projectsById = Object.fromEntries((projectResult.data || []).map(project => [project.id, project]));
        }
    }

    let purchaseItemsById = {};
    if (purchaseItemIds.length) {
        const purchaseResult = await supabaseClient
            .from('ImplementationPurchaseItem')
            .select('id, purchaseType, thirdPartySubtype:ThirdPartySubtype(id, name)')
            .in('id', purchaseItemIds);

        if (!purchaseResult.error) {
            purchaseItemsById = Object.fromEntries((purchaseResult.data || []).map(item => [item.id, item]));
        }
    }

    return purchases.map(purchase => {
        const project = projectsById[purchase.orderProjectId] || null;
        const purchaseItem = purchaseItemsById[purchase.implementationPurchaseItemId] || null;
        const subtypeName = purchaseItem?.thirdPartySubtype?.name || '';
        const tipoLabel = typeof formatCompraTipoLabel === 'function'
            ? formatCompraTipoLabel(purchase.purchaseType, subtypeName)
            : (purchase.purchaseType || '—');

        return mapPendenciasInteractiveIdentity(project, {
            id: purchase.id,
            orderCode: project?.order?.orderCode || '—',
            clientName: getOrderClientName(project?.order) || '—',
            projectName: project?.name || '—',
            tipoLabel,
            statusName: purchase.status || '—',
            statusClass: typeof getCompraStatusBadgeClass === 'function'
                ? getCompraStatusBadgeClass(purchase.status)
                : 'bg-amber-100 text-amber-800',
            expectedDeliveryAt: purchase.expectedDeliveryAt,
            expectedDeliveryLabel: purchase.expectedDeliveryAt ? formatDate(purchase.expectedDeliveryAt) : '—'
        });
    });
}

async function openPesquisasPurchaseDetail(purchaseId) {
    if (typeof openPurchaseModal === 'function') {
        await openPurchaseModal(purchaseId);
        return;
    }
    alertAppDialog('Não foi possível abrir o detalhe da compra.');
}

window.openPesquisasPurchaseDetail = openPesquisasPurchaseDetail;

function renderPesquisasPurchasesTable(rows = []) {
    const mountEl = document.getElementById('pesquisas-purchases-table-mount');
    if (!mountEl) return;

    mountPesquisasInteractiveTable(mountEl, {
        refreshButtonId: 'btn-pesquisas-refresh-purchases',
        onRefresh: refreshPesquisasPurchasesQuery,
        tableId: 'pesquisas-purchases',
        rows,
        minWidth: '960px',
        emptyMessage: 'Nenhuma compra encontrada.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns(),
            {
                key: 'tipoLabel',
                label: 'Tipo',
                cellClass: 'p-3 text-xs text-slate-600'
            },
            getPendenciasInteractiveStatusColumn(),
            getPendenciasInteractiveDateColumn({
                key: 'expectedDeliveryLabel',
                label: 'Data Previsão Entrega',
                sortKey: 'expectedDeliveryAt'
            }),
            getPendenciasInteractiveActionColumn({
                label: 'Ação',
                thClass: 'w-24',
                render: (row) => row.id
                    ? `<button type="button"
                        class="pesquisas-purchases-open-btn text-xs bg-indigo-100 text-indigo-800 hover:bg-indigo-200 px-2.5 py-1 rounded-lg font-medium"
                        data-purchase-id="${Number(row.id)}">
                        Detalhe
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pesquisas-purchases-open-btn').forEach(button => {
                button.addEventListener('click', () => {
                    openPesquisasPurchaseDetail(button.dataset.purchaseId);
                });
            });
        }
    });
}

async function searchPesquisasPurchases() {
    const mountEl = document.getElementById('pesquisas-purchases-table-mount');
    if (!mountEl) return;

    try {
        if (!pesquisasPurchasesCache.length) {
            pesquisasPurchasesCache = await enrichPesquisasPurchases(await fetchAllPurchasesForSearch());
        }

        const filters = getPesquisasTextFilters('purchases');
        const rows = pesquisasPurchasesCache.filter(purchase => matchesPesquisasTextFilters(purchase, filters, {
            orderCode: item => item.orderCode || '',
            clientName: item => item.clientName || '',
            status: item => item.statusName || ''
        }));

        renderPesquisasPurchasesTable(rows);
    } catch (error) {
        console.error('searchPesquisasPurchases:', error);
        mountEl.innerHTML = `<p class="text-xs text-red-500 text-center py-10 px-4">${escapeHtml(error.message || 'Erro ao carregar compras.')}</p>`;
    }
}

async function refreshPesquisasPurchasesQuery() {
    pesquisasPurchasesCache = [];
    await searchPesquisasPurchases();
}

async function loadPesquisasPurchasesQuery() {
    const content = document.getElementById('pesquisas-content');
    if (!content) return;

    const statuses = await loadPesquisasPurchaseStatusOptions();
    const statusOptions = [...statuses];
    const defaultCheckedStatuses = getPesquisasPurchaseDefaultCheckedStatuses(statusOptions);

    renderPesquisasFilterLayout(content, {
        sectionId: 'purchases',
        title: 'Compras',
        description: 'Consulte compras enviadas para o setor de compras.',
        statusOptions,
        defaultCheckedStatuses
    });

    bindPesquisasQueryForm('purchases', searchPesquisasPurchases, defaultCheckedStatuses);

    const mountEl = document.getElementById('pesquisas-purchases-table-mount');
    if (mountEl) {
        mountEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando compras...</p>';
    }

    await searchPesquisasPurchases();
}

window.loadPesquisasPurchasesQuery = loadPesquisasPurchasesQuery;
