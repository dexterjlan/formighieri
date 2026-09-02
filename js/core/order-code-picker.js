let orderCodePickerTarget = null;
let orderCodePickerLastResults = [];
let orderCodePickerSourceOrders = [];

const ORDER_CODE_PICKER_DEFAULT_UI = {
    title: 'Buscar pedido',
    description: 'Pesquise pelo nome do cliente e selecione o pedido.',
    searchLabel: 'Nome do cliente',
    searchPlaceholder: 'Ex.: Silva'
};

async function searchOrdersByClientName(clientName, limit = 50) {
    const term = String(clientName || '').trim();
    if (term.length < 2) {
        return { error: null, orders: [], tooShort: true };
    }

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select(`id, orderCode, clientId, consultantUserId, client:Client!inner(name), consultor:appUsers!consultantUserId(name)`)
        .ilike('client.name', `%${term}%`)
        .order('orderCode', { ascending: false })
        .limit(limit);

    if (error) {
        return { error, orders: [] };
    }

    return { error: null, orders: data || [] };
}

function isOrderCodePickerLocalFilter() {
    return Boolean(orderCodePickerTarget?.filterLocally);
}

function applyOrderCodePickerChrome(config = {}) {
    const titleEl = document.getElementById('order-code-picker-title');
    const descriptionEl = document.getElementById('order-code-picker-description');
    const searchLabel = document.getElementById('order-code-picker-search-label');
    const searchInput = document.getElementById('order-code-picker-search');
    const submitBtn = document.getElementById('order-code-picker-search-submit');

    if (titleEl) titleEl.textContent = config.title || ORDER_CODE_PICKER_DEFAULT_UI.title;
    if (descriptionEl) descriptionEl.textContent = config.description || ORDER_CODE_PICKER_DEFAULT_UI.description;
    if (searchLabel) searchLabel.textContent = config.searchLabel || ORDER_CODE_PICKER_DEFAULT_UI.searchLabel;
    if (searchInput) {
        searchInput.placeholder = config.searchPlaceholder || ORDER_CODE_PICKER_DEFAULT_UI.searchPlaceholder;
    }
    submitBtn?.classList.toggle('hidden', Boolean(config.hideSearchButton));
}

function filterOrdersByClientTerm(orders, term) {
    const normalized = String(term || '').trim().toLowerCase();
    if (!normalized) return orders || [];

    return (orders || []).filter(order => {
        const clientName = (typeof getOrderClientName === 'function' ? getOrderClientName(order) : '')
            .toLowerCase();
        return clientName.includes(normalized);
    });
}

function renderOrderCodePickerResults(orders, options = {}) {
    const listEl = document.getElementById('order-code-picker-results');
    const statusEl = document.getElementById('order-code-picker-status');
    if (!listEl || !statusEl) return;

    if (options.loading) {
        statusEl.textContent = options.loadingMessage || 'Buscando pedidos...';
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
        statusEl.textContent = options.emptyMessage || 'Nenhum pedido encontrado para este cliente.';
        listEl.innerHTML = '';
        orderCodePickerLastResults = [];
        return;
    }

    statusEl.textContent = options.statusMessage
        || `${orders.length} pedido(s) encontrado(s). Clique para selecionar.`;
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

function applyOrderCodePickerLocalFilter() {
    const term = document.getElementById('order-code-picker-search')?.value.trim() || '';
    const filtered = filterOrdersByClientTerm(orderCodePickerSourceOrders, term);

    if (!orderCodePickerSourceOrders.length) {
        renderOrderCodePickerResults([], {
            emptyMessage: orderCodePickerTarget?.emptySourceMessage
                || 'Nenhum pedido atende às condições para criar a requisição.'
        });
        return;
    }

    if (!filtered.length) {
        renderOrderCodePickerResults([], {
            emptyMessage: term
                ? 'Nenhum pedido encontrado para este cliente na lista carregada.'
                : 'Nenhum pedido atende às condições para criar a requisição.'
        });
        return;
    }

    const statusMessage = term
        ? `${filtered.length} de ${orderCodePickerSourceOrders.length} pedido(s). Clique para selecionar.`
        : `${filtered.length} pedido(s) elegíveis. Filtre pelo cliente se quiser.`;

    renderOrderCodePickerResults(filtered, { statusMessage });
}

async function runOrderCodePickerSearch() {
    if (isOrderCodePickerLocalFilter()) {
        applyOrderCodePickerLocalFilter();
        return;
    }

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

function applyOrderCodePickerSelection(order) {
    if (!orderCodePickerTarget) return;

    const orderCode = order?.orderCode || '';
    const clientName = typeof getOrderClientName === 'function'
        ? (getOrderClientName(order) || '')
        : '';
    const onSelect = orderCodePickerTarget.onSelect;
    const onApply = orderCodePickerTarget.onApply;

    if (orderCodePickerTarget.orderInputId) {
        const orderInput = document.getElementById(orderCodePickerTarget.orderInputId);
        if (orderInput) {
            orderInput.value = orderCode;
            orderInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    if (orderCodePickerTarget.clientInputId) {
        const clientInput = document.getElementById(orderCodePickerTarget.clientInputId);
        if (clientInput) {
            clientInput.value = clientName;
        }
    }

    closeOrderCodePickerModal();

    if (typeof onSelect === 'function') {
        const result = onSelect(order);
        if (result && typeof result.catch === 'function') {
            result.catch(error => {
                console.error('order-code-picker onSelect:', error);
                if (typeof alertAppDialog === 'function') {
                    alertAppDialog(error.message || 'Não foi possível continuar.');
                }
            });
        }
    }

    if (typeof onApply === 'function') {
        onApply({ orderCode, clientName, order });
    }
}

function closeOrderCodePickerModal() {
    toggleModal('order-code-picker-modal', false);
    orderCodePickerTarget = null;
    orderCodePickerSourceOrders = [];
    applyOrderCodePickerChrome();
}

async function openOrderCodePicker(config) {
    const hasCallback = typeof config?.onSelect === 'function' || typeof config?.onApply === 'function';
    if (!config?.orderInputId && !hasCallback) return;

    orderCodePickerTarget = config;
    orderCodePickerSourceOrders = [];
    applyOrderCodePickerChrome(config);

    const searchInput = document.getElementById('order-code-picker-search');
    const clientInput = document.getElementById(config.clientInputId);
    const presetTerm = clientInput?.value?.trim() || '';

    if (searchInput) {
        searchInput.value = presetTerm;
    }

    toggleModal('order-code-picker-modal', true);

    if (typeof config.loadOrders === 'function') {
        renderOrderCodePickerResults([], {
            loading: true,
            loadingMessage: 'Carregando pedidos elegíveis...'
        });

        const result = await config.loadOrders();
        if (orderCodePickerTarget !== config) return;

        if (result?.error) {
            renderOrderCodePickerResults([], { error: result.error.message });
            return;
        }

        orderCodePickerSourceOrders = result?.orders || [];
        applyOrderCodePickerLocalFilter();
        searchInput?.focus();
        return;
    }

    renderOrderCodePickerResults([], {
        hint: 'Informe o nome do cliente e clique em Buscar.'
    });

    if (presetTerm.length >= 2) {
        await runOrderCodePickerSearch();
    } else {
        searchInput?.focus();
    }
}

function bindOrderCodePickerEvents() {
    document.getElementById('order-code-picker-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        await runOrderCodePickerSearch();
    });

    document.getElementById('order-code-picker-search')?.addEventListener('input', () => {
        if (!isOrderCodePickerLocalFilter()) return;
        applyOrderCodePickerLocalFilter();
    });

    document.getElementById('btn-order-code-picker-close')?.addEventListener('click', closeOrderCodePickerModal);

    document.getElementById('order-code-picker-results')?.addEventListener('click', event => {
        const button = event.target.closest('.order-code-picker-result');
        if (!button) return;

        const order = orderCodePickerLastResults.find(item => Number(item.id) === Number(button.dataset.orderId));
        if (!order) return;

        applyOrderCodePickerSelection(order);
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
