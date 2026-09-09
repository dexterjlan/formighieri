async function fetchPendenciasEnviadosCompras() {
    const { error, compras } = await fetchComprasAbertas();

    if (error) {
        return { error, items: [] };
    }

    if (!compras.length) {
        return { error: null, items: [] };
    }

    const projectIds = [...new Set(compras.map(item => item.orderProjectId).filter(Boolean))];
    let projectResult = { data: [] };

    if (projectIds.length) {
        projectResult = await supabaseClient
            .from('OrderProject')
            .select(PENDENCIAS_PROJECT_SELECT)
            .in('id', projectIds);

        if (projectResult.error?.message?.includes('projectStatus') || projectResult.error?.message?.includes('designer')) {
            projectResult = await supabaseClient
                .from('OrderProject')
                .select(PENDENCIAS_PROJECT_SELECT_FALLBACK)
                .in('id', projectIds);
        }

        if (projectResult.error) {
            return { error: projectResult.error, items: [] };
        }
    }

    const projectsById = Object.fromEntries(
        excludeInactivePendenciasProjects(await enrichPendenciasProjectsWithStatus(projectResult.data || []))
            .map(project => [project.id, project])
    );

    const purchaseItemIds = [...new Set(compras.map(item => item.implementationPurchaseItemId).filter(Boolean))];
    let purchaseItemsById = {};

    if (purchaseItemIds.length) {
        const purchaseResult = await supabaseClient
            .from('ImplementationPurchaseItem')
            .select('id, purchaseType, thirdPartySubtype:ThirdPartySubtype(id, name)')
            .in('id', purchaseItemIds);

        if (!purchaseResult.error && purchaseResult.data) {
            purchaseItemsById = Object.fromEntries(purchaseResult.data.map(row => [row.id, row]));
        }
    }

    const items = compras
        .map(compra => {
            const project = projectsById[compra.orderProjectId];
            const purchaseItem = purchaseItemsById[compra.implementationPurchaseItemId] || null;
            const subtypeName = purchaseItem?.thirdPartySubtype?.name || '';
            return {
                ...compra,
                project,
                clientName: getOrderClientName(project?.order) || '',
                projectName: project?.name || '',
                subtypeName
            };
        })
        .filter(item => item.project);

    return { error: null, items };
}

async function loadPendenciasEnviadosCompras() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando compras...</p>';
    }

    if (!canSeePendenciasComprasMenu()) {
        renderPendenciasPlaceholder('Enviados para Compras', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, items } = await fetchPendenciasEnviadosCompras();

    if (error) {
        renderPendenciasPlaceholder('Enviados para Compras', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEnviadosComprasList(items);
}

function renderPendenciasEnviadosComprasList(items) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canView = canSeeCompraModal();
    const rows = (items || []).map(item => mapPendenciasInteractiveIdentity(item.project, {
        id: item.id,
        orderCode: item.orderCode || item.project?.order?.orderCode || '—',
        clientName: item.clientName || getOrderClientName(item.project?.order) || '—',
        projectName: item.projectName || item.project?.name || '—',
        tipoLabel: typeof formatCompraTipoLabel === 'function'
            ? formatCompraTipoLabel(item.purchaseType, item.subtypeName)
            : (item.purchaseType || '—'),
        statusName: item.status || '—',
        statusClass: typeof getCompraStatusBadgeClass === 'function'
            ? getCompraStatusBadgeClass(item.status)
            : 'bg-amber-100 text-amber-800'
    }));

    const subtitle = canActCompraModal()
        ? 'Solicitações de compra geradas pela implantação.'
        : 'Visualização das solicitações de compra em aberto.';

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Enviados para Compras',
        subtitle,
        refreshButtonId: 'btn-pendencias-refresh-enviados-compras',
        refreshButtonClass: 'order-tab-action-btn text-xs bg-white border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg font-medium hover:bg-amber-50',
        onRefresh: loadPendenciasEnviadosCompras,
        tableId: 'pendencias-enviados-compras',
        rows,
        minWidth: '860px',
        emptyMessage: 'Nenhuma solicitação de compra em aberto.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({
                orderLabel: 'Código do Pedido',
                clientLabel: 'Nome do Cliente',
                projectLabel: 'Nome do Projeto'
            }),
            {
                key: 'tipoLabel',
                label: 'Tipo',
                cellClass: 'p-3 text-xs text-slate-600'
            },
            getPendenciasInteractiveStatusColumn(),
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                render: (row) => canView && row.id
                    ? `<button type="button"
                        class="pendencias-compras-open-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"
                        data-compra-id="${row.id}">
                        Ver Compras
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-compras-open-btn').forEach(button => {
                button.addEventListener('click', () => {
                    const compraId = Number(button.dataset.compraId);
                    if (!compraId || typeof openCompraModal !== 'function') return;
                    openCompraModal(compraId);
                });
            });
        }
    });
}
