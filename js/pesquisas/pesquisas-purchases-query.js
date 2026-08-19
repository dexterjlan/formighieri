let pesquisasPurchasesCache = [];
let pesquisasPurchaseStatusOptions = [];

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
        return {
            ...purchase,
            project,
            orderCode: project?.order?.orderCode || '',
            clientName: getOrderClientName(project?.order) || '',
            projectName: project?.name || '',
            subtypeName,
            tipoLabel: typeof formatCompraTipoLabel === 'function'
                ? formatCompraTipoLabel(purchase.purchaseType, subtypeName)
                : (purchase.purchaseType || '—')
        };
    });
}

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

async function openPesquisasPurchaseDetail(purchaseId) {
    if (typeof openPurchaseModal === 'function') {
        await openPurchaseModal(purchaseId);
        return;
    }
    alertAppDialog('Não foi possível abrir o detalhe da compra.');
}

window.openPesquisasPurchaseDetail = openPesquisasPurchaseDetail;

async function searchPesquisasPurchases() {
    const tbody = document.getElementById('pesquisas-purchases-list');
    const countEl = document.getElementById('pesquisas-purchases-count');
    if (!tbody || !countEl) return;

    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-xs text-slate-400 text-center">Carregando...</td></tr>`;

    try {
        if (!pesquisasPurchasesCache.length) {
            pesquisasPurchasesCache = await enrichPesquisasPurchases(await fetchAllPurchasesForSearch());
        }

        const filters = getPesquisasTextFilters('purchases');
        const rows = pesquisasPurchasesCache.filter(purchase => matchesPesquisasTextFilters(purchase, filters, {
            orderCode: item => item.orderCode || '',
            clientName: item => item.clientName || '',
            status: item => item.status || ''
        }));

        countEl.textContent = `${rows.length} registro${rows.length === 1 ? '' : 's'}`;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-xs text-slate-400">Nenhuma compra encontrada.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(purchase => {
            const statusClass = typeof getCompraStatusBadgeClass === 'function'
                ? getCompraStatusBadgeClass(purchase.status)
                : 'bg-amber-100 text-amber-800';

            return `
                <tr class="border-b border-slate-100 last:border-0">
                    <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(purchase.orderCode || '—')}</td>
                    <td class="p-3 text-xs text-slate-700">${escapeHtml(purchase.clientName || '—')}</td>
                    <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(purchase.projectName || '—')}</td>
                    <td class="p-3 text-xs text-slate-600">${escapeHtml(purchase.tipoLabel || '—')}</td>
                    <td class="p-3 text-xs">
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(purchase.status || '—')}</span>
                    </td>
                    <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${purchase.expectedDeliveryAt ? formatDate(purchase.expectedDeliveryAt) : '—'}</td>
                    <td class="p-3 whitespace-nowrap">
                        <button type="button"
                            onclick="openPesquisasPurchaseDetail(${purchase.id})"
                            class="text-xs bg-indigo-100 text-indigo-800 hover:bg-indigo-200 px-2.5 py-1 rounded-lg font-medium">Detalhe</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('searchPesquisasPurchases:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-xs text-red-500 text-center">Erro ao carregar compras: ${escapeHtml(error.message || 'Erro desconhecido')}</td></tr>`;
        countEl.textContent = '0 registros';
    }
}

async function loadPesquisasPurchasesQuery() {
    const content = document.getElementById('pesquisas-content');
    if (!content) return;

    const statuses = await loadPesquisasPurchaseStatusOptions();
    const statusOptions = [...statuses];
    const defaultCheckedStatuses = getPesquisasPurchaseDefaultCheckedStatuses(statusOptions);

    const tableHeadHtml = `
        <th class="text-left p-3 font-semibold">Pedido</th>
        <th class="text-left p-3 font-semibold">Cliente</th>
        <th class="text-left p-3 font-semibold">Projeto</th>
        <th class="text-left p-3 font-semibold">Tipo</th>
        <th class="text-left p-3 font-semibold">Status</th>
        <th class="text-left p-3 font-semibold">Data Previsão Entrega</th>
        <th class="text-left p-3 font-semibold w-24">Ação</th>
    `;

    content.innerHTML = renderPesquisasQueryShell(
        'purchases',
        'Compras',
        'Consulte compras enviadas para o setor de compras.',
        statusOptions,
        tableHeadHtml,
        'pesquisas-purchases-list',
        defaultCheckedStatuses
    );

    bindPesquisasQueryForm('purchases', searchPesquisasPurchases, defaultCheckedStatuses);
    await searchPesquisasPurchases();
}

window.loadPesquisasPurchasesQuery = loadPesquisasPurchasesQuery;
