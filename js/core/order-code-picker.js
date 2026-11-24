let orderCodePickerTarget = null;
let orderCodePickerLastResults = [];
let orderCodePickerSourceOrders = [];
let orderCodePickerMobileSearchTimer = null;

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

function filterOrdersByClientOrCodeTerm(orders, term) {
    const normalized = String(term || '').trim().toLowerCase();
    if (!normalized) return orders || [];

    return (orders || []).filter(order => {
        const clientName = (typeof getOrderClientName === 'function' ? getOrderClientName(order) : '')
            .toLowerCase();
        const orderCode = String(order.orderCode || '').toLowerCase();
        return clientName.includes(normalized) || orderCode.includes(normalized);
    });
}

function getOrderCodePickerLocalFilterFn() {
    if (orderCodePickerTarget?.filterByOrderCodeOrClient) {
        return filterOrdersByClientOrCodeTerm;
    }
    return filterOrdersByClientTerm;
}

function renderOrderCodePickerResults(orders, options = {}) {
    const listEl = document.getElementById('order-code-picker-results');
    const statusEl = document.getElementById('order-code-picker-status');
    if (!listEl || !statusEl) return;

    if (options.loading) {
        statusEl.textContent = options.loadingMessage || 'Buscando pedidos...';
        renderOrderCodePickerStatusRow('Buscando pedidos...');
        orderCodePickerLastResults = [];
        return;
    }

    if (options.error) {
        statusEl.textContent = `Erro ao buscar: ${options.error}`;
        renderOrderCodePickerStatusRow(`Erro ao buscar: ${options.error}`);
        orderCodePickerLastResults = [];
        return;
    }

    if (options.hint) {
        statusEl.textContent = options.hint;
        renderOrderCodePickerStatusRow(options.hint);
        orderCodePickerLastResults = [];
        return;
    }

    if (options.tooShort) {
        statusEl.textContent = 'Informe ao menos 2 caracteres do nome do cliente.';
        renderOrderCodePickerStatusRow('Informe ao menos 2 caracteres do nome do cliente.');
        orderCodePickerLastResults = [];
        return;
    }

    if (!orders.length) {
        const emptyMessage = options.emptyMessage || 'Nenhum pedido encontrado para este cliente.';
        statusEl.textContent = emptyMessage;
        renderOrderCodePickerStatusRow(emptyMessage);
        orderCodePickerLastResults = [];
        return;
    }

    statusEl.textContent = options.statusMessage
        || `${orders.length} pedido(s) encontrado(s). Clique para selecionar.`;
    orderCodePickerLastResults = orders;
    listEl.innerHTML = orders.map(order => `
        <tr class="order-code-picker-row hover:bg-slate-50" data-order-id="${order.id}" role="button" tabindex="0">
            <td class="p-2.5 font-mono font-semibold text-slate-900">${escapeHtml(order.orderCode || '—')}</td>
            <td class="p-2.5 text-slate-700">
                <span class="block truncate max-w-[12rem] sm:max-w-none">${escapeHtml(getOrderClientName(order) || '—')}</span>
                ${getOrderConsultantNameFromRecord(order)
                    ? `<span class="block text-[10px] text-slate-400 mt-0.5 truncate">${escapeHtml(getOrderConsultantNameFromRecord(order))}</span>`
                    : ''}
            </td>
            <td class="p-2.5 text-center">
                <span class="text-[10px] font-bold text-indigo-700 uppercase">Sel.</span>
            </td>
        </tr>
    `).join('');
}

function renderOrderCodePickerStatusRow(message) {
    const listEl = document.getElementById('order-code-picker-results');
    if (!listEl) return;
    const safe = typeof escapeHtml === 'function' ? escapeHtml(message) : message;
    listEl.innerHTML = `
        <tr>
            <td colspan="3" class="p-4 text-center text-slate-400">${safe}</td>
        </tr>
    `;
}

function applyOrderCodePickerLocalFilter() {
    const term = document.getElementById('order-code-picker-search')?.value.trim() || '';
    const filterFn = getOrderCodePickerLocalFilterFn();
    const filtered = filterFn(orderCodePickerSourceOrders, term);

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

    const filterHint = orderCodePickerTarget?.filterByOrderCodeOrClient
        ? 'Filtre pelo pedido ou cliente.'
        : 'Filtre pelo cliente se quiser.';
    const statusMessage = term
        ? `${filtered.length} de ${orderCodePickerSourceOrders.length} pedido(s). Clique para selecionar.`
        : `${filtered.length} pedido(s) elegíveis. ${filterHint}`;

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

    if (orderCodePickerTarget.clientIdInputId) {
        const clientIdInput = document.getElementById(orderCodePickerTarget.clientIdInputId);
        if (clientIdInput && order?.clientId) {
            clientIdInput.value = String(order.clientId);
        }
    } else if (orderCodePickerTarget.clientInputId === 'montagem-prog-client-name' && order?.clientId) {
        const clientIdInput = document.getElementById('montagem-prog-client-id');
        if (clientIdInput) clientIdInput.value = String(order.clientId);
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

function raiseOrderCodePickerAboveOpenModals() {
    const modal = document.getElementById('order-code-picker-modal');
    if (!modal) return;
    let maxZ = 50;
    document.querySelectorAll('body .fixed.inset-0').forEach(el => {
        if (el === modal || el.classList.contains('hidden')) return;
        const z = Number.parseInt(window.getComputedStyle(el).zIndex, 10);
        if (Number.isFinite(z) && z > maxZ) maxZ = z;
    });
    modal.style.zIndex = String(maxZ + 1);
}

function closeOrderCodePickerModal() {
    const modal = document.getElementById('order-code-picker-modal');
    if (modal) modal.style.zIndex = '';
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

    raiseOrderCodePickerAboveOpenModals();
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
        hint: 'Informe ao menos 2 caracteres do nome do cliente.'
    });

    if (presetTerm.length >= 2) {
        await runOrderCodePickerSearch();
    } else if (searchInput && !(typeof isMobileViewport === 'function' && isMobileViewport())) {
        searchInput.focus();
    }
}

function bindOrderCodePickerEvents() {
    document.getElementById('order-code-picker-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        await runOrderCodePickerSearch();
    });

    document.getElementById('btn-order-code-picker-close')?.addEventListener('click', closeOrderCodePickerModal);
    document.getElementById('btn-order-code-picker-close-x')?.addEventListener('click', closeOrderCodePickerModal);

    const selectOrderFromPickerRow = row => {
        if (!row?.dataset?.orderId) return;
        const order = orderCodePickerLastResults.find(item => Number(item.id) === Number(row.dataset.orderId));
        if (!order) return;
        applyOrderCodePickerSelection(order);
    };

    document.getElementById('order-code-picker-results')?.addEventListener('click', event => {
        const row = event.target.closest('[data-order-id]');
        if (!row) return;
        selectOrderFromPickerRow(row);
    });

    document.getElementById('order-code-picker-results')?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const row = event.target.closest('[data-order-id]');
        if (!row) return;
        event.preventDefault();
        selectOrderFromPickerRow(row);
    });

    document.getElementById('order-code-picker-search')?.addEventListener('input', () => {
        if (isOrderCodePickerLocalFilter()) {
            applyOrderCodePickerLocalFilter();
            return;
        }
        if (typeof isMobileViewport !== 'function' || !isMobileViewport()) return;
        window.clearTimeout(orderCodePickerMobileSearchTimer);
        orderCodePickerMobileSearchTimer = window.setTimeout(() => {
            const term = document.getElementById('order-code-picker-search')?.value.trim() || '';
            if (term.length >= 2) {
                runOrderCodePickerSearch();
            } else {
                renderOrderCodePickerResults([], { tooShort: true });
            }
        }, 350);
    });

}

window.openOrderCodePicker = openOrderCodePicker;
window.bindOrderCodePickerEvents = bindOrderCodePickerEvents;
