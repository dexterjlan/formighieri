const PENDENCIAS_ASSISTANCE_TABLE_ID = 'pendencias-assistencias';

function formatAssistancePendenciaValue(value) {
    if (value == null || value === '') return '—';
    if (typeof formatSaleValueAsCurrencyInput === 'function') {
        return formatSaleValueAsCurrencyInput(value);
    }
    return String(value);
}

function getAssistancePendenciaStatusLabel(status) {
    if (typeof getAssistanceStatusLabel === 'function') {
        return getAssistanceStatusLabel(status);
    }
    return status || '—';
}

function mapPendenciasAssistanceInteractiveRow(record) {
    const addressLabel = typeof formatAssistanceAddressLabel === 'function'
        ? (formatAssistanceAddressLabel(record?.address) || '—')
        : '—';
    const status = record?.status || '';
    const totalValue = record?.totalValue;
    return {
        id: record?.id,
        record,
        clientName: record?.client?.name || '—',
        orderCode: record?.order?.orderCode || '—',
        addressLabel,
        isWarrantyLabel: record?.isWarranty ? 'Sim' : 'Não',
        status,
        statusLabel: getAssistancePendenciaStatusLabel(status),
        totalValue,
        totalValueLabel: formatAssistancePendenciaValue(totalValue),
        quoteFileName: record?.quoteFileName || '—'
    };
}

function getPendenciasAssistanceInteractiveColumns() {
    const actionColumn = typeof getPendenciasInteractiveActionColumn === 'function'
        ? getPendenciasInteractiveActionColumn
        : (options) => ({
            key: 'action',
            label: options.label || 'Ação',
            type: 'action',
            align: options.align || 'right',
            thClass: options.thClass || '',
            cellClass: options.cellClass || 'p-3 text-right whitespace-nowrap',
            render: options.render
        });

    return [
        {
            key: 'clientName',
            label: 'Cliente',
            cellClass: 'p-3 text-xs text-slate-800'
        },
        {
            key: 'orderCode',
            label: 'Pedido',
            cellClass: 'p-3 text-xs font-mono text-slate-600'
        },
        {
            key: 'addressLabel',
            label: 'Endereço',
            cellClass: 'p-3 text-xs text-slate-600 max-w-[200px]',
            render: row => {
                const text = row.addressLabel || '—';
                return `<span class="block truncate" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
            }
        },
        {
            key: 'isWarrantyLabel',
            label: 'Garantia',
            cellClass: 'p-3 text-xs text-slate-700'
        },
        {
            key: 'statusLabel',
            label: 'Status',
            sortKey: 'status',
            cellClass: 'p-3',
            getFilterValue: row => row.statusLabel,
            render: row => (typeof renderAssistanceStatusBadge === 'function'
                ? renderAssistanceStatusBadge(row.status)
                : escapeHtml(row.statusLabel))
        },
        {
            key: 'totalValueLabel',
            label: 'Valor total',
            type: 'number',
            sortKey: 'totalValue',
            cellClass: 'p-3 text-xs text-slate-700',
            getSortValue: row => row.totalValue
        },
        {
            key: 'quoteFileName',
            label: 'Arquivo',
            cellClass: 'p-3 text-xs text-slate-600'
        },
        actionColumn({
            label: 'Ações',
            align: 'left',
            thClass: 'min-w-[14rem]',
            cellClass: 'p-3 text-left',
            render: row => `<div class="flex flex-wrap gap-1.5">${renderPendenciasAssistanceActionButtons(row.record)}</div>`
        })
    ];
}

function bindPendenciasAssistanceTableActions(records, root = document) {
    const byId = Object.fromEntries((records || []).map(record => [Number(record.id), record]));
    root.querySelectorAll('.pendencias-assistance-edit-btn').forEach(button => {
        button.addEventListener('click', () => {
            const record = byId[Number(button.dataset.assistanceId)];
            if (record && typeof openAssistanceForm === 'function') {
                openAssistanceForm(record, { returnTo: 'pendencias' });
            }
        });
    });
    root.querySelectorAll('.pendencias-assistance-approval-btn').forEach(button => {
        button.addEventListener('click', () => {
            const record = byId[Number(button.dataset.assistanceId)];
            if (record && typeof sendAssistanceToApproval === 'function') {
                sendAssistanceToApproval(record);
            }
        });
    });
    root.querySelectorAll('.pendencias-assistance-separated-btn').forEach(button => {
        button.addEventListener('click', () => {
            if (typeof markAssistanceSeparated === 'function') {
                markAssistanceSeparated(Number(button.dataset.assistanceId));
            }
        });
    });
}

async function fetchPendenciasAssistencias() {
    const select = 'id, clientId, orderId, addrId, isWarranty, description, status, totalValue, quoteFilePath, quoteFileName, scheduledAt, montadorId, cabinetMakerId, client:Client(id, name), order:salesOrders(id, orderCode), address:addr(id, nickname, street, number, complement, neighborhood, city, state, isPrimary)';
    let result = await supabaseClient
        .from('AssistanceRequest')
        .select(select)
        .in('status', ['Quote', 'Separation'])
        .order('id', { ascending: false });

    if (result.error && /scheduledAt|montadorId|cabinetMakerId/i.test(result.error.message || '')) {
        result = await supabaseClient
            .from('AssistanceRequest')
            .select('id, clientId, orderId, addrId, isWarranty, description, status, totalValue, quoteFilePath, quoteFileName, client:Client(id, name), order:salesOrders(id, orderCode), address:addr(id, nickname, street, number, complement, neighborhood, city, state, isPrimary)')
            .in('status', ['Quote', 'Separation'])
            .order('id', { ascending: false });
    }

    if (result.error) return { error: result.error, records: [] };
    return { error: null, records: result.data || [] };
}

function renderPendenciasAssistanceActionButtons(record) {
    const parts = [
        `<button type="button" class="pendencias-assistance-edit-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200" data-assistance-id="${record.id}">Editar</button>`
    ];
    if (record.status === 'Quote') {
        parts.push(`<button type="button" class="pendencias-assistance-approval-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200" data-assistance-id="${record.id}">Enviar para Aprovação</button>`);
    }
    if (record.status === 'Separation') {
        parts.push(`<button type="button" class="pendencias-assistance-separated-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-sky-100 text-sky-800 hover:bg-sky-200" data-assistance-id="${record.id}">Separado</button>`);
    }
    return parts.join('');
}

async function loadPendenciasAssistencias() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando assistências...</p>';
    }

    if (typeof canSeePendenciasComprasMenu === 'function' && !canSeePendenciasComprasMenu()) {
        renderPendenciasPlaceholder('Assistências', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, records } = await fetchPendenciasAssistencias();
    if (error) {
        const hint = typeof assistanceSqlHint === 'function' ? ` ${assistanceSqlHint()}` : '';
        renderPendenciasPlaceholder('Assistências', `Erro ao carregar: ${error.message}.${hint}`);
        return;
    }

    renderPendenciasAssistenciasList(records);
}

function renderPendenciasAssistenciasList(records) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (records || []).map(mapPendenciasAssistanceInteractiveRow);

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Assistências',
        subtitle: 'Orçamento e separação: edite, envie para aprovação ou marque como separado.',
        refreshButtonId: 'btn-pendencias-refresh-assistencias',
        refreshButtonClass: 'text-xs bg-white border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg font-medium hover:bg-amber-50',
        onRefresh: loadPendenciasAssistencias,
        tableId: PENDENCIAS_ASSISTANCE_TABLE_ID,
        rows,
        columns: getPendenciasAssistanceInteractiveColumns(),
        defaultSort: [],
        emptyMessage: 'Nenhuma assistência pendente para Compras.',
        filteredEmptyMessage: 'Nenhuma assistência encontrada com os filtros aplicados.',
        minWidth: '960px',
        onBind: tbody => {
            bindPendenciasAssistanceTableActions(records, tbody || content);
        }
    });
}

window.loadPendenciasAssistencias = loadPendenciasAssistencias;
