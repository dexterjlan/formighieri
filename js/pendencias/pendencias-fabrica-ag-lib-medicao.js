function buildPendenciasCompraNotificationDetails(item = {}) {
    return {
        id: item.id,
        purchaseId: item.id,
        orderProjectId: item.orderProjectId,
        orderCode: item.orderCode,
        clientName: item.clientName,
        projectName: item.projectName,
        purchaseType: item.purchaseType,
        subtypeName: item.subtypeName,
        reasonName: item.reasonName,
        status: item.status,
        note: item.note
    };
}

async function fetchPendenciasFabricaAgLibMedicao() {
    await ensureCompraStatusesLoaded(true);
    const statusNames = typeof getCompraAguardandoLibMedicaoStatusNames === 'function'
        ? getCompraAguardandoLibMedicaoStatusNames()
        : [];

    return fetchPendenciasComprasByStatuses(statusNames);
}

async function loadPendenciasFabricaAgLibMedicao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando compras...</p>';
    }

    if (typeof canSeePendenciasFabricaAgLibMedicaoMenu === 'function'
        && !canSeePendenciasFabricaAgLibMedicaoMenu()) {
        renderPendenciasPlaceholder('Ag. Lib. Medição', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, items } = await fetchPendenciasFabricaAgLibMedicao();

    if (error) {
        renderPendenciasPlaceholder('Ag. Lib. Medição', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasFabricaAgLibMedicaoList(items);
}

function renderPendenciasFabricaAgLibMedicaoList(items) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = typeof canActPendenciasFabricaAgLibMedicao === 'function'
        && canActPendenciasFabricaAgLibMedicao();

    const rows = (items || []).map(item => mapPendenciasInteractiveIdentity(item.project, {
        id: item.id,
        orderCode: item.orderCode || '—',
        clientName: item.clientName || '—',
        projectName: item.projectName || '—',
        tipoLabel: typeof formatCompraTipoLabel === 'function'
            ? formatCompraTipoLabel(item.purchaseType, item.subtypeName)
            : (item.purchaseType || '—'),
        reasonName: item.reasonName || resolvePendenciasPurchaseReasonName(item) || '—',
        statusName: item.status || '—',
        statusClass: typeof getCompraStatusBadgeClass === 'function'
            ? getCompraStatusBadgeClass(item.status)
            : 'bg-orange-100 text-orange-800',
        raw: item
    }));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Ag. Lib. Medição',
        subtitle: 'Requisições de compra aguardando liberação de medição (Fábrica ou Obra).',
        refreshButtonId: 'btn-pendencias-refresh-ag-lib-medicao',
        refreshButtonClass: 'order-tab-action-btn text-xs bg-white border border-cyan-200 text-cyan-800 px-3 py-1.5 rounded-lg font-medium hover:bg-cyan-50',
        onRefresh: loadPendenciasFabricaAgLibMedicao,
        tableId: 'pendencias-fabrica-ag-lib-medicao',
        rows,
        minWidth: '1000px',
        emptyMessage: 'Nenhuma requisição aguardando liberação de medição.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({
                orderLabel: 'Pedido',
                clientLabel: 'Cliente',
                projectLabel: 'Projeto'
            }),
            {
                key: 'tipoLabel',
                label: 'Tipo',
                cellClass: 'p-3 text-xs text-slate-600'
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
                label: 'Ação',
                render: (row) => canAct && row.id
                    ? `<button type="button"
                        class="pendencias-ag-lib-medicao-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        data-compra-id="${row.id}">
                        Liberar Medição
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-ag-lib-medicao-btn').forEach(button => {
                button.addEventListener('click', () => {
                    const compraId = Number(button.dataset.compraId);
                    if (!compraId) return;
                    const row = rows.find(item => Number(item.id) === compraId);
                    const source = row?.raw || row;
                    handlePendenciasLiberarMedicaoCompra(compraId, source);
                });
            });
        }
    });
}

async function handlePendenciasLiberarMedicaoCompra(compraId, sourceItem = {}) {
    if (!compraId || typeof canActPendenciasFabricaAgLibMedicao !== 'function'
        || !canActPendenciasFabricaAgLibMedicao()) {
        return;
    }

    const targetStatus = typeof COMPRA_STATUS_MEDICAO_LIBERADA !== 'undefined'
        ? COMPRA_STATUS_MEDICAO_LIBERADA
        : 'Medição Liberada';

    const confirmed = typeof confirmAppDialog === 'function'
        ? await confirmAppDialog('Liberar medição desta requisição de compra? Compras será notificado.')
        : window.confirm('Liberar medição desta requisição de compra?');

    if (!confirmed) return;

    try {
        setPendenciasActionLoading(true, 'Atualizando status...');

        const now = new Date().toISOString();
        const { data, error } = await supabaseClient
            .from('Purchase')
            .update({
                status: targetStatus,
                updatedById: currentUser?.id || null,
                updatedAt: now
            })
            .eq('id', compraId)
            .select('*')
            .single();

        if (error) throw error;

        const notifyDetails = buildPendenciasCompraNotificationDetails({
            ...sourceItem,
            ...data,
            status: targetStatus
        });

        setPendenciasActionLoading(true, 'Enviando e-mail e Matrix para Compras...');

        if (typeof notifyCompraMedicaoLiberadaToCompras === 'function') {
            await notifyCompraMedicaoLiberadaToCompras(notifyDetails);
        }

        setPendenciasActionLoading(true, 'Medição liberada com sucesso!', 'success');
        await waitPendenciasStatus(900);
        setPendenciasActionLoading(false);

        await loadPendenciasFabricaAgLibMedicao();
        if (typeof scheduleAppDocumentTitlePendenciasCountRefresh === 'function') {
            scheduleAppDocumentTitlePendenciasCountRefresh(800);
        }
    } catch (error) {
        setPendenciasActionLoading(true, `Erro: ${error.message}`, 'error');
        await waitPendenciasStatus(2200);
        setPendenciasActionLoading(false);
    }
}

window.loadPendenciasFabricaAgLibMedicao = loadPendenciasFabricaAgLibMedicao;
window.fetchPendenciasFabricaAgLibMedicao = fetchPendenciasFabricaAgLibMedicao;