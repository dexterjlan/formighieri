let ordersCache = [];
let orderSummaryCounts = {};
let orderPhasesByOrderId = {};

function getOrderPhasesForOrder(orderId) {
    return orderPhasesByOrderId[Number(orderId)] || [];
}

function orderHasDeliveryPhases(orderId) {
    return getOrderPhasesForOrder(orderId).length >= 2;
}

function formatOrderDeliverySummary(orderId, clientDeliveryDate, options = {}) {
    if (orderHasDeliveryPhases(orderId)) {
        return 'Entrega em fases';
    }

    const prefix = options.prefix || 'Entrega pedido';
    const dateLabel = typeof formatGestaoDate === 'function'
        ? formatGestaoDate(clientDeliveryDate)
        : (clientDeliveryDate || '—');
    return `${prefix}: ${dateLabel}`;
}

async function loadOrderPhasesForOrders(orders = ordersCache) {
    const orderIds = [...new Set((orders || []).map(order => Number(order.id)).filter(Boolean))];
    if (!orderIds.length || typeof fetchGestaoOrderPhasesByOrderIds !== 'function') {
        orderPhasesByOrderId = {};
        return orderPhasesByOrderId;
    }

    const fetched = await fetchGestaoOrderPhasesByOrderIds(orderIds);
    orderPhasesByOrderId = { ...orderPhasesByOrderId, ...fetched };
    return orderPhasesByOrderId;
}

function getOrderProjectPhaseDisplay(project, orderId = project?.orderId) {
    const phases = getOrderPhasesForOrder(orderId);
    if (phases.length < 2) return null;

    const phaseId = Number(project?.deliveryPhaseId);
    const phase = phaseId
        ? phases.find(item => Number(item.id) === phaseId)
        : phases[0];
    if (!phase) return null;

    const dateLabel = typeof formatGestaoDate === 'function'
        ? formatGestaoDate(phase.deliveryDate)
        : (phase.deliveryDate || '—');

    return {
        name: phase.name || 'Fase',
        dateLabel
    };
}

window.getOrderPhasesForOrder = getOrderPhasesForOrder;
window.orderHasDeliveryPhases = orderHasDeliveryPhases;
window.getOrderProjectPhaseDisplay = getOrderProjectPhaseDisplay;
window.loadOrderPhasesForOrders = loadOrderPhasesForOrders;

async function fetchOrderSummaryApprovals() {
    const columnSets = ['orderId, status, approved', 'orderId, approved'];

    for (const columns of columnSets) {
        const { data, error } = await supabaseClient
            .from('CommercialApproval')
            .select(columns);

        if (!error) return data || [];
    }

    return [];
}

async function fetchOrderSummaryProjects() {
    let result = await supabaseClient
        .from('OrderProject')
        .select('orderId, statusId, projectStatus:OrderProjectStatus(name)');

    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('OrderProjectStatus')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('orderId, statusId');
    }

    if (result.error) {
        console.error('fetchOrderSummaryProjects:', result.error);
        return [];
    }

    let projects = result.data || [];
    const needsEnrich = projects.some(project => project.statusId && !project.projectStatus);

    if (needsEnrich) {
        const statusIds = [...new Set(projects.map(project => project.statusId).filter(Boolean))];
        if (statusIds.length) {
            const { data: statuses } = await supabaseClient
                .from('OrderProjectStatus')
                .select('id, name')
                .in('id', statusIds);

            const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
            projects = projects.map(project => ({
                ...project,
                projectStatus: project.projectStatus || statusById[project.statusId] || null
            }));
        }
    }

    return projects;
}

async function loadOrderSummaryCounts() {
    const [approvals, requests, projects] = await Promise.all([
        fetchOrderSummaryApprovals(),
        supabaseClient
            .from('OrderRequest')
            .select('orderId, status, requestProfile')
            .then(({ data }) => data || []),
        fetchOrderSummaryProjects()
    ]);

    const counts = {};

    function ensureOrderCounts(orderId) {
        if (!counts[orderId]) {
            counts[orderId] = { approvals: 0, requests: 0, projectStatuses: {} };
        }
        return counts[orderId];
    }

    approvals.forEach(approval => {
        if (!approval.orderId) return;
        const entry = ensureOrderCounts(approval.orderId);
        if (normalizeCommercialApproval(approval).status !== 'Aprovado') {
            entry.approvals += 1;
        }
    });

    requests.forEach(request => {
        if (!request.orderId) return;
        const entry = ensureOrderCounts(request.orderId);
        if (isRequestOpen(request)) {
            entry.requests += 1;
        }
    });

    projects.forEach(project => {
        if (!project.orderId) return;
        const entry = ensureOrderCounts(project.orderId);
        const statusName = getOrderProjectStatusName(project);
        entry.projectStatuses[statusName] = (entry.projectStatuses[statusName] || 0) + 1;
    });

    orderSummaryCounts = counts;
}

async function refreshOrdersListSummary() {
    await loadOrderSummaryCounts();
    renderOrdersList();
}

function renderOrderProjectStatusSummaryBadges(projectStatuses) {
    if (!projectStatuses || !Object.keys(projectStatuses).length) {
        return '';
    }

    const badges = Object.entries(projectStatuses)
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { sensitivity: 'base' }))
        .map(([statusName, count]) => {
            const statusClass = getOrderProjectStatusBadgeClass(statusName);
            return `<span class="inline-flex items-center text-[9px] leading-tight font-semibold px-1 py-0.5 rounded ${statusClass}" title="${escapeHtml(statusName)}">${count} · ${escapeHtml(statusName)}</span>`;
        });

    return `<div class="flex items-center gap-1 mt-1 flex-wrap">
        ${badges.join('')}
    </div>`;
}

function renderOrderSummaryBadges(orderId) {
    const counts = orderSummaryCounts[orderId];
    if (!counts) return '';

    return renderOrderProjectStatusSummaryBadges(counts.projectStatuses);
}

function setupOrderConsultantFilter() {
    const wrap = document.getElementById('filter-order-mine-wrap');
    const checkbox = document.getElementById('filter-order-mine');
    if (!wrap || !checkbox) return;

    const isConsultor = currentUser?.role === 'Consultor';
    wrap.classList.toggle('hidden', !isConsultor);
    if (!isConsultor) {
        checkbox.checked = false;
    }
}

function initApp() {
    setupOrderConsultantFilter();
    loadOrders();
    loadClientesDatalist();
    loadConsultants();
    loadProjetistas();
}

async function loadClientesDatalist() {
    const { data, error } = await supabaseClient
        .from('Cliente')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome', { ascending: true });

    if (error || !data) return;

    const listEl = document.getElementById('ord-client-list');
    if (listEl) {
        listEl.innerHTML = data.map(c => `<option value="${escapeHtml(c.nome)}"></option>`).join('');
    }
}

async function resolveOrCreateClienteId(clientName) {
    const trimmed = (clientName || '').trim();
    if (!trimmed) return null;

    let { data: existing, error: searchErr } = await supabaseClient
        .from('Cliente')
        .select('id, nome')
        .ilike('nome', trimmed)
        .maybeSingle();

    if (searchErr && searchErr.message?.includes('Cliente')) return null;

    if (existing?.id) return existing.id;

    let { data: created, error: insertErr } = await supabaseClient
        .from('Cliente')
        .insert([{ nome: trimmed, ativo: true }])
        .select('id')
        .single();

    if (insertErr && insertErr.message?.includes('Cliente')) return null;

    return created?.id || null;
}

async function loadOrders() {
    let result = await supabaseClient
        .from('salesOrders')
        .select(`*, ${SALES_ORDER_RELATIONS_SELECT}`)
        .order('createdAt', { ascending: false });

    if (result.error?.message?.includes('Cliente') || result.error?.message?.includes('consultor')
        || result.error?.message?.includes('salesOrders')) {
        result = await supabaseClient
            .from('salesOrders')
            .select('*')
            .order('createdAt', { ascending: false });
    }

    if (result.error || !result.data) {
        ordersCache = [];
    } else {
        ordersCache = result.data;
    }

    await loadOrderPhasesForOrders(ordersCache);
    await loadOrderSummaryCounts();
    renderOrdersList();
}

let currentOrdersSortField = 'orderCode';
let currentOrdersSortDirection = 'desc';

function getOrdersSortPrefKey(keyName) {
    const userId = currentUser?.id || 'guest';
    return `fgp_orders_sort_${keyName}_${userId}`;
}

function loadOrdersSortPreferences() {
    try {
        const savedField = localStorage.getItem(getOrdersSortPrefKey('field'));
        const savedDir = localStorage.getItem(getOrdersSortPrefKey('direction'));
        if (savedField && ['orderCode', 'clientName', 'clientDeliveryDate'].includes(savedField)) {
            currentOrdersSortField = savedField;
        }
        if (savedDir && ['asc', 'desc'].includes(savedDir)) {
            currentOrdersSortDirection = savedDir;
        }
    } catch (e) {
        console.warn('loadOrdersSortPreferences error:', e);
    }
}

function saveOrdersSortPreferences() {
    try {
        localStorage.setItem(getOrdersSortPrefKey('field'), currentOrdersSortField);
        localStorage.setItem(getOrdersSortPrefKey('direction'), currentOrdersSortDirection);
    } catch (e) {
        console.warn('saveOrdersSortPreferences error:', e);
    }
}

function setOrdersSortDirection(direction) {
    if (direction !== 'asc' && direction !== 'desc') return;
    currentOrdersSortDirection = direction;
    saveOrdersSortPreferences();
    updateOrdersSortButtonsUI();
    renderOrdersList();
}

function updateOrdersSortButtonsUI() {
    const btnAsc = document.getElementById('btn-sort-order-asc');
    const btnDesc = document.getElementById('btn-sort-order-desc');
    if (!btnAsc || !btnDesc) return;

    if (currentOrdersSortDirection === 'asc') {
        btnAsc.className = 'p-1.5 bg-amber-100 text-amber-800 focus:outline-none border-r border-slate-200 transition-colors';
        btnDesc.className = 'p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none transition-colors';
    } else {
        btnAsc.className = 'p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none border-r border-slate-200 transition-colors';
        btnDesc.className = 'p-1.5 bg-amber-100 text-amber-800 focus:outline-none transition-colors';
    }
}

function renderOrdersList() {
    const list = document.getElementById("orders-list");
    list.innerHTML = "";

    const filter = document.getElementById("filter-order-client")?.value.trim().toLowerCase() || '';
    const filterMine = document.getElementById('filter-order-mine')?.checked
        && currentUser?.role === 'Consultor';

    loadOrdersSortPreferences();
    const sortFieldEl = document.getElementById('sort-order-field');
    if (sortFieldEl && sortFieldEl.value !== currentOrdersSortField) {
        sortFieldEl.value = currentOrdersSortField;
    }
    updateOrdersSortButtonsUI();

    let orders = [...ordersCache];
    if (filterMine) {
        orders = orders.filter(o => isCurrentUserOrderConsultor(
            getOrderConsultantNameFromRecord(o),
            o.consultantUserId
        ));
    }
    if (filter) {
        orders = orders.filter(o => getOrderClientName(o).toLowerCase().includes(filter));
    }

    orders.sort((a, b) => {
        let cmp = 0;
        if (currentOrdersSortField === 'clientName') {
            cmp = getOrderClientName(a).localeCompare(getOrderClientName(b), 'pt-BR', { sensitivity: 'base' });
        } else if (currentOrdersSortField === 'clientDeliveryDate') {
            const hasA = Boolean(a.clientDeliveryDate);
            const hasB = Boolean(b.clientDeliveryDate);
            if (hasA && hasB) {
                cmp = new Date(a.clientDeliveryDate).getTime() - new Date(b.clientDeliveryDate).getTime();
            } else if (hasA) {
                cmp = -1;
            } else if (hasB) {
                cmp = 1;
            } else {
                cmp = 0;
            }
        } else if (currentOrdersSortField === 'orderCode') {
            cmp = (a.orderCode || '').localeCompare(b.orderCode || '', 'pt-BR', { numeric: true });
        }
        return currentOrdersSortDirection === 'asc' ? cmp : -cmp;
    });

    if (orders.length === 0) {
        const hasFilter = filter || filterMine;
        list.innerHTML = `<p class="p-4 text-xs text-slate-400 text-center">${hasFilter ? 'Nenhum pedido encontrado com os filtros aplicados.' : 'Nenhum pedido cadastrado.'}</p>`;
        return;
    }

    orders.forEach(o => {
        const isSelected = o.id === activeOrderId;
        const div = document.createElement("div");
        div.className = [
            'cursor-pointer rounded-lg border p-3 transition shadow-sm',
            'grid grid-cols-[76px_1fr] gap-3 items-start',
            isSelected
                ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-200 shadow-md'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 hover:shadow'
        ].join(' ');
        div.onclick = () => selectOrder(o.id);
        div.innerHTML = `
            <div class="text-[11px] font-mono font-bold bg-slate-900 text-amber-500 px-2 py-1.5 rounded text-center leading-tight">${o.orderCode}</div>
            <div class="min-w-0">
                <div class="text-sm font-bold text-slate-900 leading-snug">${escapeHtml(getOrderClientName(o))}</div>
                <div class="text-[11px] text-slate-500 mt-1">📋 Consultor: ${escapeHtml(getOrderConsultantNameFromRecord(o))}</div>
                <div class="text-[11px] text-slate-500 mt-0.5">📅 ${escapeHtml(formatOrderDeliverySummary(o.id, o.clientDeliveryDate, { prefix: 'Entrega' }))}</div>
                ${renderOrderSummaryBadges(o.id)}
            </div>
        `;
        list.appendChild(div);
    });
}

async function loadConsultants() {
    const select = document.getElementById("ord-consultant");
    select.disabled = false;
    select.classList.remove('bg-slate-100', 'cursor-not-allowed');

    if (currentUser?.role === 'Consultor') {
        select.innerHTML = `<option value="${currentUser.name}">${currentUser.name}</option>`;
        select.value = currentUser.name;
        select.disabled = true;
        select.classList.add('bg-slate-100', 'cursor-not-allowed');
        return;
    }

    const { data: consultants, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Consultor')
        .eq('isActive', true)
        .order('name', { ascending: true });

    select.innerHTML = '<option value="">Selecione...</option>';

    if (error || !consultants || consultants.length === 0) {
        select.innerHTML += '<option value="" disabled>Nenhum consultor cadastrado</option>';
        return;
    }

    consultants.forEach(c => {
        select.innerHTML += `<option value="${c.name}">${c.name}</option>`;
    });
}

function updateOrderTabCounts(projectsCount, openAnteprojetoCount, medicoesCount, openRequestsCount, comprasCount) {
    const projectsCountEl = document.getElementById('order-projects-count');
    const anteprojetoCountEl = document.getElementById('order-tab-anteprojeto-count');
    const medicaoCountEl = document.getElementById('order-tab-medicao-count');
    const requestsCountEl = document.getElementById('order-tab-requests-count');
    const comprasCountEl = document.getElementById('order-tab-compras-count');

    if (projectsCountEl && projectsCount !== undefined) {
        projectsCountEl.textContent = `(${projectsCount})`;
    }
    if (anteprojetoCountEl && openAnteprojetoCount !== undefined) {
        anteprojetoCountEl.textContent = `(${openAnteprojetoCount})`;
    }
    if (medicaoCountEl && medicoesCount !== undefined) {
        medicaoCountEl.textContent = `(${medicoesCount})`;
    }
    if (requestsCountEl && openRequestsCount !== undefined) {
        requestsCountEl.textContent = `(${openRequestsCount})`;
    }
    if (comprasCountEl && comprasCount !== undefined) {
        comprasCountEl.textContent = `(${comprasCount})`;
    }
}

function countPendingCommercialApprovals(approvals) {
    if (!approvals || approvals.length === 0) return 0;
    return approvals
        .map(a => normalizeCommercialApproval(a))
        .filter(a => a.status !== 'Aprovado')
        .length;
}

function countOpenOrderRequests(conversations) {
    if (!conversations || conversations.length === 0) return 0;
    return conversations.filter(c => isRequestOpen(c)).length;
}

function updateOrderDetailActionButtons() {
    const requestsPanel = document.getElementById('order-tab-panel-requests');
    const onRequestsTab = requestsPanel && !requestsPanel.classList.contains('hidden');
    const requestsBtn = document.getElementById('btn-new-request');

    if (requestsBtn) {
        requestsBtn.classList.toggle('hidden', !onRequestsTab || !canActOrderDetailTab('requests'));
    }

    if (typeof updateAnteprojetoActionButtons === 'function') {
        updateAnteprojetoActionButtons();
    }

    if (typeof updateMedicaoActionButtons === 'function') {
        updateMedicaoActionButtons();
    }
}

function updateOrderTabReadonlyNotice(activeTab = null) {
    const notice = document.getElementById('order-tab-readonly-notice');
    if (!notice) return;

    if (!activeTab || canActOrderDetailTab(activeTab)) {
        notice.classList.add('hidden');
        notice.textContent = '';
        return;
    }

    notice.textContent = `Visualização somente leitura. Apenas ${getOrderDetailTabResponsibleLabel(activeTab)} pode executar ações nesta aba.`;
    notice.classList.remove('hidden');
}

const ORDER_DETAIL_TABS = {
    medicao: {
        tabId: 'order-tab-medicao',
        panelId: 'order-tab-panel-medicao',
        accent: 'teal'
    },
    anteprojeto: {
        tabId: 'order-tab-anteprojeto',
        panelId: 'order-tab-panel-anteprojeto',
        accent: 'sky'
    },
    requests: {
        tabId: 'order-tab-requests',
        panelId: 'order-tab-panel-requests',
        accent: 'amber'
    },
    compras: {
        tabId: 'order-tab-compras',
        panelId: 'order-tab-panel-compras',
        accent: 'rose'
    },
    'third-party': {
        tabId: 'order-tab-third-party',
        panelId: 'order-tab-panel-third-party',
        accent: 'violet'
    }
};

function getOrderDetailTabClassNames(tabKey, isActive) {
    const accent = ORDER_DETAIL_TABS[tabKey]?.accent || 'slate';
    return `order-detail-tab order-detail-tab--${accent}${isActive ? ' is-active' : ''}`;
}

function isOrderDetailTabVisible() {
    return true;
}

function getOrderDetailTabKeys() {
    return Object.keys(ORDER_DETAIL_TABS);
}

function getFirstVisibleOrderDetailTab() {
    return 'medicao';
}

function applyOrderTabButtonsVisibility() {
    getOrderDetailTabKeys().forEach(tabKey => {
        const config = ORDER_DETAIL_TABS[tabKey];
        document.getElementById(config?.tabId)?.classList.remove('hidden');
    });
}

function updateOrderTabsChromeVisibility() {
    document.getElementById('order-detail-tabs-bar')?.classList.remove('hidden');
}

function hideAllOrderDetailPanels() {
    getOrderDetailTabKeys().forEach(tabKey => {
        const config = ORDER_DETAIL_TABS[tabKey];
        document.getElementById(config.panelId)?.classList.add('hidden');
    });
}

function updateOrderDetailTabsVisibility() {
    applyOrderTabButtonsVisibility();
    updateOrderTabsChromeVisibility();
}

function switchOrderDetailTab(tab) {
    if (!tab || !ORDER_DETAIL_TABS[tab]) {
        switchOrderDetailTab('medicao');
        return;
    }

    Object.entries(ORDER_DETAIL_TABS).forEach(([key, config]) => {
        const isActive = key === tab;
        const tabEl = document.getElementById(config.tabId);
        const panelEl = document.getElementById(config.panelId);

        if (tabEl) {
            tabEl.className = getOrderDetailTabClassNames(key, isActive);
        }
        if (panelEl) {
            panelEl.classList.toggle('hidden', !isActive);
        }
    });

    updateOrderDetailActionButtons();
    updateOrderTabReadonlyNotice(tab);

    if (typeof saveAppNavState === 'function' && activeOrderId) {
        saveAppNavState({
            view: 'dashboard',
            activeOrderId,
            orderDetailTab: tab
        });
    }
}

async function openOrderModal() {
    document.getElementById('order-form')?.reset();
    if (document.getElementById('ord-client-id')) document.getElementById('ord-client-id').value = '';
    await loadConsultants();
    toggleModal('order-modal', true);
}
window.openOrderModal = openOrderModal;

async function selectOrder(id) {
    if (typeof refreshCurrentUserProfile === 'function') {
        await refreshCurrentUserProfile();
    }

    activeOrderId = id;
    document.getElementById("empty-state").classList.add("hidden");
    document.getElementById("order-content").classList.remove("hidden");

    let order = null;
    let fetchError = null;

    const primary = await supabaseClient
        .from('salesOrders')
        .select(`*, creator:appUsers!salesOrders_createdById_fkey(name), ${SALES_ORDER_RELATIONS_SELECT}`)
        .eq('id', id)
        .single();

    if (!primary.error && primary.data) {
        order = primary.data;
    } else if (primary.error?.message?.includes('Cliente') || primary.error?.message?.includes('consultor')) {
        const fallback = await supabaseClient
            .from('salesOrders')
            .select('*, creator:appUsers!salesOrders_createdById_fkey(name)')
            .eq('id', id)
            .single();
        if (!fallback.error && fallback.data) {
            order = fallback.data;
            const cached = ordersCache.find(item => Number(item.id) === Number(id));
            if (cached?.cliente) order.cliente = cached.cliente;
            if (cached?.consultor) order.consultor = cached.consultor;
        } else {
            fetchError = fallback.error || primary.error;
        }
    } else {
        fetchError = primary.error;
    }

    if (fetchError || !order) return;

    document.getElementById("det-code").innerText = order.orderCode;
    document.getElementById("det-client").innerText = getOrderClientName(order);
    document.getElementById("det-info").innerText =
        `📋 Consultor: ${getOrderConsultantNameFromRecord(order)} | Criado por: ${order.creator?.name || 'Sistema'}`;
    document.getElementById("det-delivery").innerText = formatOrderDeliverySummary(order.id, order.clientDeliveryDate);

    await loadOrderPhasesForOrders(ordersCache.length ? ordersCache : [order]);
    loadOrders();
    await loadOrderProjects(id);
    loadConversations(id);

    if (typeof loadAnteprojetoConferences === 'function') {
        loadAnteprojetoConferences(id);
    }
    if (typeof loadMedicoes === 'function') {
        loadMedicoes(id);
    }
    if (typeof loadOrderCompras === 'function') {
        loadOrderCompras(id);
    }
    if (typeof loadOrderThirdPartyProjectsTab === 'function') {
        await loadOrderThirdPartyProjectsTab(id);
    }

    updateOrderDetailTabsVisibility();
    switchOrderDetailTab(getFirstVisibleOrderDetailTab());

    if (typeof saveAppNavState === 'function') {
        saveAppNavState({
            view: 'dashboard',
            activeOrderId: id,
            orderDetailTab: getFirstVisibleOrderDetailTab()
        });
    }
}

function bindOrderEvents() {
    document.getElementById('order-tab-medicao').addEventListener('click', async function () {
        switchOrderDetailTab('medicao');
    });
    document.getElementById('order-tab-anteprojeto').addEventListener('click', async function () {
        switchOrderDetailTab('anteprojeto');
    });
    document.getElementById('order-tab-requests').addEventListener('click', async function () {
        switchOrderDetailTab('requests');
    });
    document.getElementById('order-tab-compras')?.addEventListener('click', async function () {
        switchOrderDetailTab('compras');
        if (activeOrderId && typeof loadOrderCompras === 'function') {
            loadOrderCompras(activeOrderId);
        }
    });
    document.getElementById('order-tab-third-party')?.addEventListener('click', async function () {
        switchOrderDetailTab('third-party');
        if (activeOrderId && typeof loadOrderThirdPartyProjectsTab === 'function') {
            loadOrderThirdPartyProjectsTab(activeOrderId);
        }
    });

    document.getElementById('filter-order-client').addEventListener('input', renderOrdersList);
    document.getElementById('filter-order-mine')?.addEventListener('change', renderOrdersList);
    document.getElementById('sort-order-field')?.addEventListener('change', function () {
        currentOrdersSortField = this.value || 'orderCode';
        saveOrdersSortPreferences();
        renderOrdersList();
    });
    document.getElementById('btn-sort-order-asc')?.addEventListener('click', () => setOrdersSortDirection('asc'));
    document.getElementById('btn-sort-order-desc')?.addEventListener('click', () => setOrdersSortDirection('desc'));

    document.getElementById("ord-code").addEventListener("input", async function () {
        this.value = this.value.replace(/\D/g, '');
    });

    document.getElementById("order-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        const orderCode = document.getElementById("ord-code").value.trim();
        const clientName = document.getElementById("ord-client").value.trim();
        const consultantName = document.getElementById("ord-consultant").value.trim();

        if (!orderCode) {
            alertAppDialog("Informe o código do pedido (apenas números).");
            document.getElementById("ord-code").focus();
            return;
        }
        if (!clientName) {
            alertAppDialog("Informe o nome do cliente.");
            document.getElementById("ord-client").focus();
            return;
        }
        if (!consultantName) {
            alertAppDialog("Selecione o consultor.");
            document.getElementById("ord-consultant").focus();
            return;
        }

        const consultantUserId = await resolveConsultantUserIdByNameAsync(consultantName);
        const clientIdInput = document.getElementById("ord-client-id")?.value;
        let clientId = clientIdInput ? Number(clientIdInput) : null;
        if (!clientId) {
            clientId = await resolveOrCreateClienteId(clientName);
        }

        if (!clientId) {
            alertAppDialog("Selecione um cliente válido no cadastro.");
            document.getElementById("ord-client").focus();
            return;
        }
        if (!consultantUserId) {
            alertAppDialog("Consultor não encontrado entre os usuários ativos.");
            document.getElementById("ord-consultant").focus();
            return;
        }

        const { data: existing } = await supabaseClient
            .from('salesOrders')
            .select('id')
            .eq('orderCode', orderCode)
            .maybeSingle();

        if (existing) {
            alertAppDialog("Já existe um pedido cadastrado com este código.");
            return;
        }

        const payload = {
            orderCode,
            clientId,
            consultantUserId,
            createdById: currentUser.id,
            updatedById: currentUser.id
        };

        const { error } = await supabaseClient.from('salesOrders').insert([payload]);
        if (error) {
            alertAppDialog("Erro ao salvar pedido: " + error.message);
            return;
        }
        toggleModal('order-modal', false);
        document.getElementById("order-form").reset();
        await loadClientesDatalist();
        await loadConsultants();
        loadOrders();
    });
}
