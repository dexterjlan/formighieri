const PENDENCIAS_WPS_ITEM_TABLE_ID = 'pendencias-wps-item-registration';

function getPendenciasWpsItemRegistrationColumns() {
    if (typeof getRequisicoesWpsItemRegistrationColumns !== 'function') {
        return [];
    }

    const columns = getRequisicoesWpsItemRegistrationColumns().filter(column => column.key !== 'action');
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

    columns.push(actionColumn({
        label: 'Ações',
        align: 'left',
        thClass: 'min-w-[14rem]',
        cellClass: 'p-3 text-left',
        render: row => {
            const sentStatus = typeof WPS_ITEM_REGISTRATION_STATUS_SENT !== 'undefined'
                ? WPS_ITEM_REGISTRATION_STATUS_SENT
                : 'Sent';
            const parts = [`<button type="button"
            class="pendencias-wps-item-registration-open-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
            data-wps-item-registration-id="${row.id}">Abrir</button>`];
            if (row.status === sentStatus) {
                parts.push(`<button type="button"
                    class="pendencias-wps-item-in-budget-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-sky-100 text-sky-800 hover:bg-sky-200"
                    data-wps-item-registration-id="${row.id}">Em orçamento</button>`);
            }
            return `<div class="flex flex-wrap gap-1.5">${parts.join('')}</div>`;
        }
    }));

    return columns;
}

function bindPendenciasWpsItemRegistrationActions(records, root = document) {
    const byId = Object.fromEntries((records || []).map(record => [Number(record.id), record]));
    root.querySelectorAll('.pendencias-wps-item-registration-open-btn').forEach(button => {
        button.addEventListener('click', () => {
            const record = byId[Number(button.dataset.wpsItemRegistrationId)];
            if (record && typeof openWpsItemRegistrationForm === 'function') {
                openWpsItemRegistrationForm(record, { mode: 'pendencias' });
            }
        });
    });
    root.querySelectorAll('.pendencias-wps-item-in-budget-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const record = byId[Number(button.dataset.wpsItemRegistrationId)];
            if (!record || typeof markWpsItemRegistrationInBudget !== 'function') return;
            if (typeof setWpsItemRegistrationActionContext === 'function') {
                setWpsItemRegistrationActionContext({ mode: 'pendencias', record });
            }
            await markWpsItemRegistrationInBudget(record.id, { record });
        });
    });
}

function renderPendenciasWpsItemRegistrationList(records) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (records || []).map(record => (
        typeof mapWpsItemRegistrationInteractiveRow === 'function'
            ? mapWpsItemRegistrationInteractiveRow(record)
            : { id: record.id, record }
    ));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Cadastro Item WPS',
        subtitle: 'Solicitações enviadas ou em orçamento aguardando cadastro no WPS.',
        refreshButtonId: 'btn-pendencias-refresh-wps-item-registration',
        refreshButtonClass: 'text-xs bg-white border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg font-medium hover:bg-amber-50',
        onRefresh: loadPendenciasWpsItemRegistration,
        tableId: PENDENCIAS_WPS_ITEM_TABLE_ID,
        rows,
        columns: getPendenciasWpsItemRegistrationColumns(),
        defaultSort: [{ key: 'createdAt', direction: 'desc' }],
        emptyMessage: 'Nenhuma solicitação enviada aguardando cadastro.',
        filteredEmptyMessage: 'Nenhuma solicitação encontrada com os filtros aplicados.',
        minWidth: '920px',
        onBind: ({ root }) => {
            bindPendenciasWpsItemRegistrationActions(records, root);
        }
    });
}

async function loadPendenciasWpsItemRegistration() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando solicitações WPS...</p>';
    }

    if (typeof canActWpsItemRegistrationBuyer === 'function' && !canActWpsItemRegistrationBuyer()) {
        renderPendenciasPlaceholder('Cadastro Item WPS', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const sentStatus = typeof WPS_ITEM_REGISTRATION_STATUS_SENT !== 'undefined'
        ? WPS_ITEM_REGISTRATION_STATUS_SENT
        : 'Sent';
    const inBudgetStatus = typeof WPS_ITEM_REGISTRATION_STATUS_IN_BUDGET !== 'undefined'
        ? WPS_ITEM_REGISTRATION_STATUS_IN_BUDGET
        : 'InBudget';

    if (typeof fetchWpsItemRegistrationRequests !== 'function') {
        renderPendenciasPlaceholder('Cadastro Item WPS', 'Módulo de cadastro WPS indisponível.');
        return;
    }

    const { data, error } = await fetchWpsItemRegistrationRequests({
        statusIn: [sentStatus, inBudgetStatus]
    });
    if (error) {
        renderPendenciasPlaceholder(
            'Cadastro Item WPS',
            `Erro ao carregar: ${error.message}. Execute supabase/feats/create-wps-item-registration.sql no Supabase SQL Editor.`
        );
        return;
    }

    renderPendenciasWpsItemRegistrationList(data || []);
}

window.loadPendenciasWpsItemRegistration = loadPendenciasWpsItemRegistration;
