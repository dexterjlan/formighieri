function resolvePendenciasPurchaseReasonName(compra, reasonsById = {}) {
    const fromCadastro = reasonsById[compra.purchaseReasonId];
    if (fromCadastro) return fromCadastro;
    if (compra.assistanceRequestId) return 'Assistência';
    if (compra.externalAssemblyInspectionId) return 'Vistoria';
    if (compra.implementationId || compra.implementationPurchaseItemId) return 'Implantação';
    if (compra.requestOrigin === 'assistance') return 'Assistência';
    if (compra.requestOrigin === 'externalAssemblyInspection') return 'Vistoria';
    if (compra.requestOrigin === 'implementation') return 'Implantação';
    return '';
}

async function enrichPendenciasCompraItemsFromRows(compras) {
    if (!compras?.length) {
        return [];
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
            throw projectResult.error;
        }
    }

    const projectsById = Object.fromEntries(
        excludeInactivePendenciasProjects(await enrichPendenciasProjectsWithStatus(projectResult.data || []))
            .map(project => [project.id, project])
    );

    const reasonIds = [...new Set(compras.map(item => item.purchaseReasonId).filter(Boolean))];
    let reasonsById = {};

    if (reasonIds.length) {
        const reasonResult = await supabaseClient
            .from('PurchaseReason')
            .select('id, name')
            .in('id', reasonIds);

        if (!reasonResult.error && reasonResult.data) {
            reasonsById = Object.fromEntries(reasonResult.data.map(row => [row.id, row.name]));
        }
    }

    const assistanceIds = [...new Set(compras.map(item => item.assistanceRequestId).filter(Boolean))];
    let assistanceById = {};

    if (assistanceIds.length) {
        const assistanceResult = await supabaseClient
            .from('AssistanceRequest')
            .select('id, orderId, clientId, client:Client(id, name), order:salesOrders(id, orderCode, client:Client(name))')
            .in('id', assistanceIds);

        if (!assistanceResult.error && assistanceResult.data) {
            assistanceById = Object.fromEntries(assistanceResult.data.map(row => [row.id, row]));
        }
    }

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

    const createdByIds = [...new Set(compras.map(item => item.createdById).filter(Boolean))];
    let requestersById = {};

    if (createdByIds.length) {
        const usersResult = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', createdByIds);

        if (!usersResult.error && usersResult.data) {
            requestersById = Object.fromEntries(usersResult.data.map(row => [row.id, row.name]));
        }
    }

    return compras.map(compra => {
        const project = compra.orderProjectId ? projectsById[compra.orderProjectId] : null;
        const assistance = assistanceById[compra.assistanceRequestId] || null;
        const purchaseItem = purchaseItemsById[compra.implementationPurchaseItemId] || null;
        const subtypeName = purchaseItem?.thirdPartySubtype?.name || '';
        const clientName = getOrderClientName(project?.order)
            || assistance?.client?.name
            || getOrderClientName(assistance?.order)
            || '';
        const orderCode = project?.order?.orderCode
            || assistance?.order?.orderCode
            || '—';

        return {
            ...compra,
            project,
            assistance,
            clientName,
            orderCode,
            projectName: project?.name || '—',
            subtypeName,
            requesterName: requestersById[compra.createdById] || '',
            reasonName: resolvePendenciasPurchaseReasonName(compra, reasonsById)
        };
    });
}

async function fetchPendenciasComprasByStatuses(statusNames) {
    const names = [...new Set((statusNames || []).map(name => String(name || '').trim()).filter(Boolean))];
    if (!names.length) {
        return { error: null, items: [] };
    }

    const { data, error } = await supabaseClient
        .from('Purchase')
        .select('*')
        .in('status', names)
        .order('createdAt', { ascending: false });

    if (error?.message?.includes('Purchase') || error?.message?.includes('does not exist')) {
        return {
            error: new Error('Tabela Purchase não encontrada. Consulte PENDING-PROD-SQL.md ou supabase/schema/.'),
            items: []
        };
    }

    if (error) {
        return { error, items: [] };
    }

    try {
        const items = await enrichPendenciasCompraItemsFromRows(data || []);
        return { error: null, items };
    } catch (enrichError) {
        return { error: enrichError, items: [] };
    }
}

async function fetchPendenciasEnviadosCompras() {
    const { error, compras } = await fetchComprasAbertas();

    if (error) {
        return { error, items: [] };
    }

    if (!compras.length) {
        return { error: null, items: [] };
    }

    try {
        const items = await enrichPendenciasCompraItemsFromRows(compras);
        return { error: null, items };
    } catch (enrichError) {
        return { error: enrichError, items: [] };
    }
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
        orderCode: item.orderCode || '—',
        clientName: item.clientName || '—',
        projectName: item.projectName || '—',
        tipoLabel: typeof formatCompraTipoLabel === 'function'
            ? formatCompraTipoLabel(item.purchaseType, item.subtypeName)
            : (item.purchaseType || '—'),
        requesterName: item.requesterName || '—',
        reasonName: item.reasonName || resolvePendenciasPurchaseReasonName(item) || '—',
        statusName: item.status || '—',
        statusClass: typeof getCompraStatusBadgeClass === 'function'
            ? getCompraStatusBadgeClass(item.status)
            : 'bg-amber-100 text-amber-800'
    }));

    const subtitle = canActCompraModal()
        ? 'Solicitações de compra em aberto (implantação, vistoria, assistência e demais motivos).'
        : 'Visualização das solicitações de compra em aberto.';

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Enviados para Compras',
        subtitle,
        refreshButtonId: 'btn-pendencias-refresh-enviados-compras',
        refreshButtonClass: 'order-tab-action-btn text-xs bg-white border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg font-medium hover:bg-amber-50',
        onRefresh: loadPendenciasEnviadosCompras,
        tableId: 'pendencias-enviados-compras',
        rows,
        minWidth: '1080px',
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
            {
                key: 'requesterName',
                label: 'Solicitante',
                cellClass: 'p-3 text-xs text-slate-700 whitespace-nowrap'
            },
            {
                key: 'reasonName',
                label: 'Motivo',
                cellClass: 'p-3',
                render: (row) => (typeof renderPurchaseReasonBadge === 'function'
                    ? renderPurchaseReasonBadge(row.reasonName)
                    : escapeHtml(row.reasonName || '—'))
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
