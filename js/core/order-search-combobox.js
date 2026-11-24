const ORDER_SEARCH_COMBOBOX_CACHE_STORAGE_KEY_LEGACY = 'fgp_order_search_combobox_orders_v1';
const ORDER_SEARCH_COMBOBOX_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ORDER_SEARCH_COMBOBOX_FETCH_LIMIT = 2000;

let orderSearchComboboxMemoryOrders = null;
let orderSearchComboboxMemoryLoadedAt = 0;
let orderSearchComboboxMemoryScopeKey = '';

function getOrderSearchComboboxCacheScope() {
    const env = typeof FORMIGHIERI_APP_ENV !== 'undefined' ? String(FORMIGHIERI_APP_ENV) : 'unknown';
    const supabaseUrl = typeof SUPABASE_URL !== 'undefined' ? String(SUPABASE_URL) : '';
    return { env, supabaseUrl };
}

function getOrderSearchComboboxCacheScopeKey() {
    const { env, supabaseUrl } = getOrderSearchComboboxCacheScope();
    let urlPart = 'na';
    if (supabaseUrl) {
        try {
            const host = new URL(supabaseUrl).host.replace(/\./g, '_');
            urlPart = host || urlPart;
        } catch (_) {
            urlPart = supabaseUrl.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
        }
    }
    return `${env}::${urlPart}`;
}

function getOrderSearchComboboxCacheStorageKey() {
    const scopeKey = getOrderSearchComboboxCacheScopeKey();
    return `fgp_order_search_combobox_orders_v2_${scopeKey.replace(/::/g, '_')}`;
}

function orderSearchComboboxStoredScopeMatches(parsed) {
    if (!parsed) return false;
    const { env, supabaseUrl } = getOrderSearchComboboxCacheScope();
    if (parsed.env && parsed.env !== env) return false;
    if (parsed.supabaseUrl && parsed.supabaseUrl !== supabaseUrl) return false;
    return true;
}

function resetOrderSearchComboboxMemoryCache() {
    orderSearchComboboxMemoryOrders = null;
    orderSearchComboboxMemoryLoadedAt = 0;
    orderSearchComboboxMemoryScopeKey = '';
}

function purgeMisplacedOrderSearchComboboxStorage() {
    try {
        localStorage.removeItem(ORDER_SEARCH_COMBOBOX_CACHE_STORAGE_KEY_LEGACY);
        const activeKey = getOrderSearchComboboxCacheStorageKey();
        const prefix = 'fgp_order_search_combobox_orders_v';
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index);
            if (!key || !key.startsWith(prefix)) continue;
            if (key !== activeKey) {
                localStorage.removeItem(key);
            }
        }
    } catch (_) { /* ignore */ }
}

purgeMisplacedOrderSearchComboboxStorage();

function normalizeOrderSearchComboboxQuery(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function formatOrderSearchComboboxLabel(order) {
    const clientName = order?.client?.name || (typeof getOrderClientName === 'function' ? getOrderClientName(order) : '');
    if (clientName && order?.orderCode) return `${order.orderCode} — ${clientName}`;
    return order?.orderCode || clientName || `Pedido ${order?.id || ''}`;
}

function filterOrderSearchComboboxOrders(orders, query, limit = 40) {
    const term = normalizeOrderSearchComboboxQuery(query);
    const list = orders || [];
    if (!term) return list.slice(0, limit);
    return list.filter(order => {
        const clientName = normalizeOrderSearchComboboxQuery(order?.client?.name);
        const code = normalizeOrderSearchComboboxQuery(order?.orderCode);
        return clientName.includes(term) || code.includes(term);
    }).slice(0, limit);
}

function readOrderSearchComboboxCacheFromStorage(now = Date.now()) {
    try {
        const storageKey = getOrderSearchComboboxCacheStorageKey();
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.loadedAt || !Array.isArray(parsed.orders)) return null;
        if (!orderSearchComboboxStoredScopeMatches(parsed)) {
            localStorage.removeItem(storageKey);
            return null;
        }
        if (now - Number(parsed.loadedAt) >= ORDER_SEARCH_COMBOBOX_CACHE_TTL_MS) return null;
        return parsed;
    } catch (_) {
        return null;
    }
}

function writeOrderSearchComboboxCacheToStorage(orders, loadedAt = Date.now()) {
    try {
        const { env, supabaseUrl } = getOrderSearchComboboxCacheScope();
        localStorage.setItem(getOrderSearchComboboxCacheStorageKey(), JSON.stringify({
            loadedAt,
            env,
            supabaseUrl,
            orders: orders || []
        }));
    } catch (error) {
        console.warn('writeOrderSearchComboboxCacheToStorage:', error);
    }
}

function invalidateOrderSearchComboboxCache() {
    resetOrderSearchComboboxMemoryCache();
    try {
        localStorage.removeItem(getOrderSearchComboboxCacheStorageKey());
        purgeMisplacedOrderSearchComboboxStorage();
    } catch (_) { /* ignore */ }
}

function appendOrderSearchComboboxOrder(order) {
    if (!order?.id) return;
    const id = Number(order.id);
    const loadedAt = orderSearchComboboxMemoryLoadedAt || Date.now();
    const current = Array.isArray(orderSearchComboboxMemoryOrders)
        ? orderSearchComboboxMemoryOrders
        : [];
    if (current.some(item => Number(item.id) === id)) return;
    orderSearchComboboxMemoryOrders = [...current, order];
    orderSearchComboboxMemoryLoadedAt = loadedAt;
    writeOrderSearchComboboxCacheToStorage(orderSearchComboboxMemoryOrders, loadedAt);
}

async function refreshOrderSearchComboboxCache() {
    return fetchOrderSearchComboboxOrders({ forceReload: true });
}

async function fetchOrderSearchComboboxOrders(options = {}) {
    const forceReload = Boolean(options.forceReload);
    const now = Date.now();
    const scopeKey = getOrderSearchComboboxCacheScopeKey();

    if (orderSearchComboboxMemoryScopeKey && orderSearchComboboxMemoryScopeKey !== scopeKey) {
        resetOrderSearchComboboxMemoryCache();
    }

    if (!forceReload
        && orderSearchComboboxMemoryOrders
        && orderSearchComboboxMemoryScopeKey === scopeKey
        && now - orderSearchComboboxMemoryLoadedAt < ORDER_SEARCH_COMBOBOX_CACHE_TTL_MS) {
        return orderSearchComboboxMemoryOrders;
    }

    if (!forceReload) {
        const stored = readOrderSearchComboboxCacheFromStorage(now);
        if (stored) {
            orderSearchComboboxMemoryOrders = stored.orders;
            orderSearchComboboxMemoryLoadedAt = Number(stored.loadedAt);
            orderSearchComboboxMemoryScopeKey = scopeKey;
            return orderSearchComboboxMemoryOrders;
        }
    }

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, client:Client(name)')
        .order('orderCode', { ascending: false })
        .limit(ORDER_SEARCH_COMBOBOX_FETCH_LIMIT);

    if (error) throw error;

    orderSearchComboboxMemoryOrders = data || [];
    orderSearchComboboxMemoryLoadedAt = now;
    orderSearchComboboxMemoryScopeKey = scopeKey;
    writeOrderSearchComboboxCacheToStorage(orderSearchComboboxMemoryOrders, now);
    return orderSearchComboboxMemoryOrders;
}

function findOrderSearchComboboxOrderByCode(orders, orderCode) {
    const code = String(orderCode || '').trim();
    if (!code) return null;
    return (orders || []).find(order => String(order.orderCode || '').trim() === code) || null;
}

/**
 * Combobox de pedido (código ou nome do cliente), com cache compartilhado.
 * @param {Object} config
 * @param {HTMLElement} config.wrap
 * @param {HTMLInputElement} config.input
 * @param {HTMLElement} config.list
 * @param {number|null} [config.selectedOrderId]
 * @param {string} [config.selectedOrderCode]
 * @param {Function} [config.onSelect] — (order) => void
 * @param {Function} [config.onClear] — () => void
 * @param {Function} [config.onQueryChange] — ({ query, selectedOrder }) => void
 * @param {Function} [config.filterOrders] — (orders) => orders visíveis na lista (ex.: filtro de cliente na tela)
 */
function mountOrderSearchCombobox(config) {
    const wrap = config?.wrap;
    const input = config?.input;
    const list = config?.list;
    if (!wrap || !input || !list) return null;

    let orders = [];
    let selectedOrderId = config.selectedOrderId != null ? Number(config.selectedOrderId) : null;
    let query = '';
    let highlight = -1;
    let loading = false;

    function getSelectedOrder() {
        if (!selectedOrderId) return null;
        return orders.find(order => Number(order.id) === Number(selectedOrderId)) || null;
    }

    function setListOpen(open) {
        list.classList.toggle('hidden', !open);
        input.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!open) highlight = -1;
    }

    function getOrdersForList() {
        const pool = typeof config.filterOrders === 'function'
            ? (config.filterOrders(orders) || [])
            : orders;
        return filterOrderSearchComboboxOrders(pool, query);
    }

    function renderOptions() {
        const matches = getOrdersForList();
        if (!matches.length) {
            highlight = -1;
            list.innerHTML = '<p class="px-3 py-2 text-xs text-slate-400">Nenhum pedido encontrado.</p>';
            return;
        }
        list.innerHTML = matches.map((order, index) => {
            const active = index === highlight ? ' bg-slate-100' : '';
            return `<button type="button" class="order-search-combobox-option w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-slate-50${active}" data-order-id="${order.id}" data-option-index="${index}" role="option">${escapeHtml(formatOrderSearchComboboxLabel(order))}</button>`;
        }).join('');
    }

    function syncInputFromSelection() {
        const selected = getSelectedOrder();
        if (selected) {
            input.value = formatOrderSearchComboboxLabel(selected);
            query = '';
            return;
        }
        if (config.selectedOrderCode && !input.value) {
            const byCode = findOrderSearchComboboxOrderByCode(orders, config.selectedOrderCode);
            if (byCode) {
                selectedOrderId = Number(byCode.id);
                input.value = formatOrderSearchComboboxLabel(byCode);
                query = '';
            }
        }
    }

    function notifyQueryChange() {
        if (typeof config.onQueryChange === 'function') {
            config.onQueryChange({
                query: String(input.value || '').trim(),
                selectedOrder: getSelectedOrder()
            });
        }
    }

    function selectOrderId(orderId) {
        selectedOrderId = Number(orderId) || null;
        const order = getSelectedOrder();
        input.value = order ? formatOrderSearchComboboxLabel(order) : '';
        query = '';
        setListOpen(false);
        if (typeof config.onSelect === 'function') config.onSelect(order);
        notifyQueryChange();
    }

    function clearSelection() {
        selectedOrderId = null;
        input.value = '';
        query = '';
        setListOpen(false);
        if (typeof config.onClear === 'function') config.onClear();
        notifyQueryChange();
    }

    async function ensureOrdersLoaded() {
        if (orders.length || loading) return;
        loading = true;
        try {
            orders = await fetchOrderSearchComboboxOrders();
            syncInputFromSelection();
            renderOptions();
        } catch (error) {
            console.error('mountOrderSearchCombobox:', error);
            list.innerHTML = `<p class="px-3 py-2 text-xs text-red-600">${escapeHtml(error.message || 'Erro ao carregar pedidos.')}</p>`;
        } finally {
            loading = false;
        }
    }

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    if (!input.getAttribute('aria-controls') && list.id) {
        input.setAttribute('aria-controls', list.id);
    }
    if (!input.getAttribute('placeholder')) {
        input.placeholder = 'Digite o código ou nome do cliente';
    }

    void ensureOrdersLoaded().then(() => {
        syncInputFromSelection();
    });

    input.addEventListener('focus', () => {
        void ensureOrdersLoaded().then(() => {
            const selected = getSelectedOrder();
            const selectedLabel = selected ? formatOrderSearchComboboxLabel(selected) : '';
            query = input.value === selectedLabel ? '' : input.value;
            highlight = -1;
            renderOptions();
            setListOpen(true);
        });
    });

    input.addEventListener('input', () => {
        query = input.value;
        const selected = getSelectedOrder();
        const selectedLabel = selected ? formatOrderSearchComboboxLabel(selected) : '';
        if (input.value.trim() !== selectedLabel) {
            selectedOrderId = null;
            if (typeof config.onClear === 'function') config.onClear();
        }
        highlight = -1;
        void ensureOrdersLoaded().then(() => {
            renderOptions();
            setListOpen(true);
            notifyQueryChange();
        });
    });

    input.addEventListener('keydown', event => {
        const optionCount = list.querySelectorAll('.order-search-combobox-option').length;
        if (event.key === 'Escape') {
            setListOpen(false);
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!optionCount) return;
            setListOpen(true);
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            highlight = (highlight + delta + optionCount) % optionCount;
            renderOptions();
            list.querySelector(`[data-option-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (event.key === 'Enter') {
            const options = [...list.querySelectorAll('.order-search-combobox-option')];
            const highlighted = options[highlight] || (options.length === 1 ? options[0] : null);
            if (!highlighted) return;
            event.preventDefault();
            selectOrderId(highlighted.dataset.orderId);
        }
    });

    list.addEventListener('mousedown', event => {
        event.preventDefault();
    });

    list.addEventListener('click', event => {
        const button = event.target.closest('[data-order-id]');
        if (!button) return;
        selectOrderId(button.dataset.orderId);
    });

    const outsideHandler = event => {
        if (!wrap.contains(event.target)) setListOpen(false);
    };
    document.addEventListener('mousedown', outsideHandler);

    return {
        clear: clearSelection,
        getSelectedOrder,
        getSelectedOrderCode: () => {
            const order = getSelectedOrder();
            return order?.orderCode ? String(order.orderCode).trim() : '';
        },
        reloadOrders: async () => {
            orders = await fetchOrderSearchComboboxOrders();
            syncInputFromSelection();
            renderOptions();
        },
        destroy: () => {
            document.removeEventListener('mousedown', outsideHandler);
        }
    };
}

const orderSearchFilterComboboxRegistry = {};

function parseOrderSearchComboboxFilterCode(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.split('—')[0].split('–')[0].trim();
}

function getOrderSearchFilterComboboxTerm(registryKey, searchInputId) {
    const combobox = orderSearchFilterComboboxRegistry[registryKey];
    const selected = combobox?.getSelectedOrder?.();
    if (selected?.orderCode) return String(selected.orderCode).trim();
    const raw = document.getElementById(searchInputId)?.value.trim() || '';
    if (!raw) return '';
    return parseOrderSearchComboboxFilterCode(raw) || raw;
}

function destroyOrderSearchFilterCombobox(registryKey) {
    const existing = orderSearchFilterComboboxRegistry[registryKey];
    if (existing?.destroy) existing.destroy();
    delete orderSearchFilterComboboxRegistry[registryKey];
}

function initOrderSearchFilterCombobox(registryKey, config) {
    destroyOrderSearchFilterCombobox(registryKey);
    const wrap = config?.wrap;
    const input = config?.input;
    const list = config?.list;
    if (!wrap || !input || !list || typeof mountOrderSearchCombobox !== 'function') return null;
    const combobox = mountOrderSearchCombobox({
        wrap,
        input,
        list,
        selectedOrderId: config.selectedOrderId,
        onSelect: config.onSelect,
        onClear: config.onClear,
        filterOrders: config.filterOrders
    });
    orderSearchFilterComboboxRegistry[registryKey] = combobox;
    return combobox;
}

function getOrderSearchFilterCombobox(registryKey) {
    return orderSearchFilterComboboxRegistry[registryKey] || null;
}

function clearOrderSearchFilterCombobox(registryKey) {
    const combobox = orderSearchFilterComboboxRegistry[registryKey];
    if (combobox?.clear) {
        combobox.clear();
        return;
    }
    const input = combobox?.input;
    if (input) input.value = '';
}

window.ORDER_SEARCH_COMBOBOX_CACHE_TTL_MS = ORDER_SEARCH_COMBOBOX_CACHE_TTL_MS;
window.normalizeOrderSearchComboboxQuery = normalizeOrderSearchComboboxQuery;
window.formatOrderSearchComboboxLabel = formatOrderSearchComboboxLabel;
window.filterOrderSearchComboboxOrders = filterOrderSearchComboboxOrders;
window.fetchOrderSearchComboboxOrders = fetchOrderSearchComboboxOrders;
window.refreshOrderSearchComboboxCache = refreshOrderSearchComboboxCache;
window.invalidateOrderSearchComboboxCache = invalidateOrderSearchComboboxCache;
window.appendOrderSearchComboboxOrder = appendOrderSearchComboboxOrder;
window.mountOrderSearchCombobox = mountOrderSearchCombobox;
window.parseOrderSearchComboboxFilterCode = parseOrderSearchComboboxFilterCode;
window.getOrderSearchFilterComboboxTerm = getOrderSearchFilterComboboxTerm;
window.initOrderSearchFilterCombobox = initOrderSearchFilterCombobox;
window.destroyOrderSearchFilterCombobox = destroyOrderSearchFilterCombobox;
window.getOrderSearchFilterCombobox = getOrderSearchFilterCombobox;
window.clearOrderSearchFilterCombobox = clearOrderSearchFilterCombobox;