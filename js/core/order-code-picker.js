let orderCodePickerTarget = null;
let orderCodePickerLastResults = [];

async function searchOrdersByClientName(clientName, limit = 50) {
    const term = String(clientName || '').trim();
    if (term.length < 2) {
        return { error: null, orders: [], tooShort: true };
    }

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select(`id, orderCode, clientId, consultantUserId, cliente:Cliente!inner(nome), consultor:appUsers!consultantUserId(name)`)
        .ilike('cliente.nome', `%${term}%`)
        .order('orderCode', { ascending: false })
        .limit(limit);

    if (error) {
        return { error, orders: [] };
    }

    return { error: null, orders: data || [] };
}

function renderOrderCodePickerResults(orders, options = {}) {
    const listEl = document.getElementById('order-code-picker-results');
    const statusEl = document.getElementById('order-code-picker-status');
    if (!listEl || !statusEl) return;

    if (options.loading) {
        statusEl.textContent = 'Buscando pedidos...';
        listEl.innerHTML = '';
        orderCodePickerLastResults = [];
        return;
    }

    if (options.error) {
        statusEl.textContent = `Erro ao buscar: ${options.error}`;
        listEl.innerHTML = '';
        orderCodePickerLastResults = [];
        return;
    }

    if (options.hint) {
        statusEl.textContent = options.hint;
        listEl.innerHTML = '';
        orderCodePickerLastResults = [];
        return;
    }

    if (options.tooShort) {
        statusEl.textContent = 'Informe ao menos 2 caracteres do nome do cliente.';
        listEl.innerHTML = '';
        orderCodePickerLastResults = [];
        return;
    }

    if (!orders.length) {
        statusEl.textContent = 'Nenhum pedido encontrado para este cliente.';
        listEl.innerHTML = '';
        orderCodePickerLastResults = [];
        return;
    }

    statusEl.textContent = `${orders.length} pedido(s) encontrado(s). Clique para selecionar.`;
    orderCodePickerLastResults = orders;
    listEl.innerHTML = orders.map(order => `
        <button type="button"
            class="order-code-picker-result"
            data-order-id="${order.id}">
            <span class="order-code-picker-result__code">${escapeHtml(order.orderCode || '—')}</span>
            <span class="order-code-picker-result__client">${escapeHtml(getOrderClientName(order) || '—')}</span>
            ${getOrderConsultantNameFromRecord(order)
                ? `<span class="order-code-picker-result__consultant">${escapeHtml(getOrderConsultantNameFromRecord(order))}</span>`
                : ''}
        </button>
    `).join('');
}

async function runOrderCodePickerSearch() {
    const searchInput = document.getElementById('order-code-picker-search');
    const term = searchInput?.value.trim() || '';

    renderOrderCodePickerResults([], { loading: true });

    const result = await searchOrdersByClientName(term);
    if (result.tooShort) {
        renderOrderCodePickerResults([], { tooShort: true });
        return;
    }

    if (result.error) {
        renderOrderCodePickerResults([], { error: result.error.message });
        return;
    }

    renderOrderCodePickerResults(result.orders);
}

function applyOrderCodePickerSelection(orderCode, clientName) {
    if (!orderCodePickerTarget) return;

    const orderInput = document.getElementById(orderCodePickerTarget.orderInputId);
    const clientInput = document.getElementById(orderCodePickerTarget.clientInputId);

    if (orderInput) {
        orderInput.value = orderCode || '';
        orderInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (clientInput) {
        clientInput.value = clientName || '';
    }

    if (typeof orderCodePickerTarget.onApply === 'function') {
        orderCodePickerTarget.onApply({ orderCode, clientName });
    }
}

function closeOrderCodePickerModal() {
    toggleModal('order-code-picker-modal', false);
    orderCodePickerTarget = null;
}

function openOrderCodePicker(config) {
    if (!config?.orderInputId) return;

    orderCodePickerTarget = config;

    const searchInput = document.getElementById('order-code-picker-search');
    const clientInput = document.getElementById(config.clientInputId);
    const presetTerm = clientInput?.value?.trim() || '';

    if (searchInput) {
        searchInput.value = presetTerm;
    }

    renderOrderCodePickerResults([], {
        hint: 'Informe o nome do cliente e clique em Buscar.'
    });

    toggleModal('order-code-picker-modal', true);

    if (presetTerm.length >= 2) {
        runOrderCodePickerSearch();
    } else {
        searchInput?.focus();
    }
}

function bindOrderCodePickerEvents() {
    document.getElementById('order-code-picker-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        await runOrderCodePickerSearch();
    });

    document.getElementById('btn-order-code-picker-close')?.addEventListener('click', closeOrderCodePickerModal);

    document.getElementById('order-code-picker-results')?.addEventListener('click', event => {
        const button = event.target.closest('.order-code-picker-result');
        if (!button) return;

        const order = orderCodePickerLastResults.find(item => Number(item.id) === Number(button.dataset.orderId));
        if (!order) return;

        applyOrderCodePickerSelection(order.orderCode, getOrderClientName(order));
        closeOrderCodePickerModal();
    });

    document.getElementById('btn-cal-event-order-picker')?.addEventListener('click', () => {
        openOrderCodePicker({
            orderInputId: 'cal-event-order-code',
            clientInputId: 'cal-event-client-name',
            onApply: () => {
                if (typeof syncCalendarClientNameField === 'function') {
                    syncCalendarClientNameField();
                }
            }
        });
    });

    document.getElementById('btn-montagem-prog-order-picker')?.addEventListener('click', () => {
        openOrderCodePicker({
            orderInputId: 'montagem-prog-order-code',
            clientInputId: 'montagem-prog-client-name',
            onApply: () => {
                if (typeof syncMontagemProgClientRequired === 'function') {
                    syncMontagemProgClientRequired();
                }
            }
        });
    });
}

window.openOrderCodePicker = openOrderCodePicker;
window.bindOrderCodePickerEvents = bindOrderCodePickerEvents;
