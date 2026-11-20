function mapPendenciasFabricaRotaEntityStatus(entry) {
    const { entityType, row } = entry;
    if (typeof formatExpeditionEntityStatusDisplayLabel === 'function') {
        return formatExpeditionEntityStatusDisplayLabel(entityType, row);
    }
    return String(row?.status || '—').trim() || '—';
}

function mapPendenciasFabricaRotaPurchaseTypeLabel(entityType, row) {
    if (entityType === 'Purchase' || entityType === 'Assistance' || entityType === 'ExternalAssemblyInspection') {
        if (typeof getExpeditionPurchaseTypeDisplayLabel === 'function') {
            return getExpeditionPurchaseTypeDisplayLabel(row);
        }
        return String(row?.purchaseType || '—').trim() || '—';
    }
    return '—';
}

function mapPendenciasFabricaRotaEntityRow(entry) {
    const { entityType, entityTypeLabel, row } = entry;
    const entityId = Number(row?.id) || 0;
    const orderCode = typeof expeditionHistoryOrderCode === 'function'
        ? expeditionHistoryOrderCode(row)
        : '';
    const clientName = typeof expeditionHistoryClientName === 'function'
        ? expeditionHistoryClientName(row)
        : '';
    const projectLabel = entityType === 'OrderProject'
        ? String(row?.name || row?.projectCode || '').trim()
        : (typeof expeditionHistoryProjectLabel === 'function' ? expeditionHistoryProjectLabel(row) : '');

    const summary = typeof formatExpeditionEntitySearchRowLabel === 'function'
        ? formatExpeditionEntitySearchRowLabel(row, entityType)
        : (entityId ? `#${entityId}` : '—');

    return {
        id: `${entityType}-${entityId}`,
        entityType,
        typeLabel: entityTypeLabel || entityType,
        entityId,
        orderCode: orderCode || '—',
        clientName: clientName || '—',
        projectLabel: projectLabel || '—',
        purchaseTypeLabel: mapPendenciasFabricaRotaPurchaseTypeLabel(entityType, row),
        statusName: mapPendenciasFabricaRotaEntityStatus(entry),
        summary: summary || '—'
    };
}

function renderPendenciasFabricaRotaErrorBanner(errors = []) {
    if (!errors.length) return '';
    const lines = errors.map(item => {
        const typeLabel = typeof getExpeditionEntityTypeLabel === 'function'
            ? getExpeditionEntityTypeLabel(item.entityType)
            : item.entityType;
        return `${typeLabel}: ${item.message}`;
    }).join(' · ');
    return `
        <div class="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            Alguns tipos não puderam ser carregados: ${escapeHtml(lines)}
        </div>
    `;
}

async function loadPendenciasFabricaRota() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando itens da rota...</p>';
    }

    if (typeof canSeePendenciasFabricaRotaMenu === 'function' && !canSeePendenciasFabricaRotaMenu()) {
        renderPendenciasPlaceholder('Rota', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    if (typeof fetchExpeditionEntitiesForFabricaRotaPreview !== 'function') {
        renderPendenciasPlaceholder('Rota', 'Módulo de expedição indisponível.');
        return;
    }

    try {
        const { items, errors } = await fetchExpeditionEntitiesForFabricaRotaPreview();
        const rows = items.map(mapPendenciasFabricaRotaEntityRow);
        renderPendenciasFabricaRotaEntityList(content, rows, errors);
    } catch (error) {
        renderPendenciasPlaceholder('Rota', `Erro ao carregar: ${error?.message || error}`);
    }
}

function renderPendenciasFabricaRotaEntityList(content, rows, errors = []) {
    if (!content) return;

    const mountId = 'pendencias-fabrica-rota-entities-mount';
    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Rota</h3>
                    <p class="text-xs text-slate-400 mt-0.5">
                        Itens elegíveis por tipo de parada (mesma origem do assistente de rota, somados em uma lista).
                        Exclui o que já está em outra rota ativa.
                    </p>
                </div>
                <button type="button" id="pendencias-fabrica-rota-refresh-btn"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${typeof renderRefreshButtonInnerHtml === 'function' ? renderRefreshButtonInnerHtml() : 'Atualizar'}
                </button>
            </div>
            ${renderPendenciasFabricaRotaErrorBanner(errors)}
            <div id="${mountId}"></div>
        </div>
    `;

    content.querySelector('#pendencias-fabrica-rota-refresh-btn')
        ?.addEventListener('click', loadPendenciasFabricaRota);

    const mountEl = document.getElementById(mountId);
    if (typeof mountInteractiveTable !== 'function') {
        if (mountEl) {
            mountEl.innerHTML = '<p class="text-xs text-red-500 text-center py-8 px-4">Componente de tabela indisponível.</p>';
        }
        return;
    }

    mountInteractiveTable(mountEl, {
        tableId: 'pendencias-fabrica-rota-itens',
        rows,
        columns: [
            {
                key: 'typeLabel',
                label: 'Tipo',
                thClass: 'whitespace-nowrap',
                cellClass: 'p-3 text-xs font-semibold text-slate-800 whitespace-nowrap'
            },
            {
                key: 'entityId',
                label: 'ID',
                thClass: 'w-16 whitespace-nowrap',
                cellClass: 'p-3 text-xs font-mono text-slate-500 whitespace-nowrap'
            },
            {
                key: 'orderCode',
                label: 'Pedido',
                cellClass: 'p-3 text-xs font-mono text-slate-600 whitespace-nowrap'
            },
            {
                key: 'clientName',
                label: 'Cliente',
                cellClass: 'p-3 text-xs text-slate-600'
            },
            {
                key: 'projectLabel',
                label: 'Projeto',
                cellClass: 'p-3 text-xs font-medium text-slate-800'
            },
            {
                key: 'purchaseTypeLabel',
                label: 'Tipo compra',
                thClass: 'whitespace-nowrap',
                cellClass: 'p-3 text-xs text-slate-700 whitespace-nowrap',
                getFilterValue: row => row.purchaseTypeLabel || ''
            },
            {
                key: 'statusName',
                label: 'Status',
                thClass: 'whitespace-nowrap',
                cellClass: 'p-3 whitespace-nowrap',
                getFilterValue: row => row.statusName || '',
                render: (row) => {
                    const statusName = row.statusName || '—';
                    if (statusName === '—') return '—';
                    let statusClass = 'bg-slate-100 text-slate-600';
                    if (row.entityType === 'OrderProject' || row.entityType === 'PartRequest') {
                        statusClass = typeof getPendenciasProjectStatusBadgeClass === 'function'
                            ? getPendenciasProjectStatusBadgeClass(statusName)
                            : statusClass;
                    }
                    return `<span class="inline-flex items-center text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(statusName)}</span>`;
                }
            },
            {
                key: 'summary',
                label: 'Resumo',
                cellClass: 'p-3 text-xs text-slate-600',
                getFilterValue: row => row.summary || ''
            }
        ],
        emptyMessage: 'Nenhum item elegível para rota no momento.',
        filteredEmptyMessage: 'Nenhum item encontrado com os filtros aplicados.',
        minWidth: '72rem',
        disableSort: false,
        defaultSort: { key: 'typeLabel', direction: 'asc' }
    });

    if (typeof scheduleAppDocumentTitlePendenciasCountRefresh === 'function') {
        scheduleAppDocumentTitlePendenciasCountRefresh(800);
    }
}