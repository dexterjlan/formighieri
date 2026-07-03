let ordersCache = [];

function initApp() {
    loadOrders();
    loadConsultants();
    loadProjetistas();
}

async function loadOrders() {
    const { data: orders, error } = await supabaseClient
        .from('salesOrders')
        .select('*')
        .order('createdAt', { ascending: false });

    if (error || !orders) {
        ordersCache = [];
    } else {
        ordersCache = orders;
    }

    renderOrdersList();
}

function renderOrdersList() {
    const list = document.getElementById("orders-list");
    list.innerHTML = "";

    const filter = document.getElementById("filter-order-client")?.value.trim().toLowerCase() || '';
    const orders = ordersCache.filter(o =>
        !filter || (o.clientName || '').toLowerCase().includes(filter)
    );

    if (orders.length === 0) {
        list.innerHTML = `<p class="p-4 text-xs text-slate-400 text-center">${filter ? 'Nenhum pedido encontrado para este cliente.' : 'Nenhum pedido cadastrado.'}</p>`;
        return;
    }

    orders.forEach(o => {
        const isSelected = o.id === activeOrderId;
        const div = document.createElement("div");
        div.className = `p-4 cursor-pointer hover:bg-slate-50 transition grid grid-cols-[72px_1fr] gap-2 items-start ${isSelected ? 'bg-amber-50/60 border-l-4 border-amber-600' : ''}`;
        div.onclick = () => selectOrder(o.id);
        div.innerHTML = `
            <div class="text-xs font-mono font-bold text-slate-400">${o.orderCode}</div>
            <div>
                <div class="text-sm font-bold text-slate-900">${o.clientName}</div>
                <div class="text-xs text-slate-500 mt-1">Consultor: ${o.consultantName}</div>
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

function updateOrderTabCounts(pendingApprovalsCount, openRequestsCount, projectsCount) {
    const approvalsCountEl = document.getElementById('order-tab-approvals-count');
    const requestsCountEl = document.getElementById('order-tab-requests-count');
    const projectsCountEl = document.getElementById('order-projects-count');

    if (approvalsCountEl && pendingApprovalsCount !== undefined) {
        approvalsCountEl.textContent = `(${pendingApprovalsCount})`;
    }
    if (requestsCountEl && openRequestsCount !== undefined) {
        requestsCountEl.textContent = `(${openRequestsCount})`;
    }
    if (projectsCountEl && projectsCount !== undefined) {
        projectsCountEl.textContent = `(${projectsCount})`;
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
    const approvalsPanel = document.getElementById('order-tab-panel-approvals');
    const onApprovalsTab = approvalsPanel && !approvalsPanel.classList.contains('hidden');
    const approvalBtn = document.getElementById('btn-commercial-approval');

    if (approvalBtn) {
        approvalBtn.classList.toggle('hidden', !onApprovalsTab || !canOpenCommercialApprovalModal());
    }
}

const ORDER_DETAIL_TABS = {
    approvals: {
        tabId: 'order-tab-approvals',
        panelId: 'order-tab-panel-approvals',
        activeClass: 'order-detail-tab flex-1 px-4 py-3 text-xs font-semibold border-b-2 border-emerald-600 text-emerald-800 bg-white',
        inactiveClass: 'order-detail-tab flex-1 px-4 py-3 text-xs font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800'
    },
    requests: {
        tabId: 'order-tab-requests',
        panelId: 'order-tab-panel-requests',
        activeClass: 'order-detail-tab flex-1 px-4 py-3 text-xs font-semibold border-b-2 border-amber-600 text-amber-800 bg-white',
        inactiveClass: 'order-detail-tab flex-1 px-4 py-3 text-xs font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800'
    }
};

function switchOrderDetailTab(tab) {
    Object.entries(ORDER_DETAIL_TABS).forEach(([key, config]) => {
        const isActive = key === tab;
        const tabEl = document.getElementById(config.tabId);
        const panelEl = document.getElementById(config.panelId);

        if (tabEl) {
            tabEl.className = isActive ? config.activeClass : config.inactiveClass;
        }
        if (panelEl) {
            panelEl.classList.toggle('hidden', !isActive);
        }
    });

    updateOrderDetailActionButtons();
}

async function openOrderModal() {
    await loadConsultants();
    toggleModal('order-modal', true);
}
window.openOrderModal = openOrderModal;

async function selectOrder(id) {
    activeOrderId = id;
    document.getElementById("empty-state").classList.add("hidden");
    document.getElementById("order-content").classList.remove("hidden");

    const { data: order, error } = await supabaseClient
        .from('salesOrders')
        .select('*, creator:appUsers!salesOrders_createdById_fkey(name)')
        .eq('id', id)
        .single();

    if (error || !order) return;

    document.getElementById("det-code").innerText = order.orderCode;
    document.getElementById("det-client").innerText = order.clientName;
    document.getElementById("det-info").innerText =
        `Consultor: ${order.consultantName} | Criado por: ${order.creator?.name || 'Sistema'}`;

    loadOrders();
    loadOrderProjects(id);
    loadConversations(id);
    loadCommercialApprovals(id);
    switchOrderDetailTab('approvals');
}

function bindOrderEvents() {
    document.getElementById('order-tab-approvals').addEventListener('click', function () {
        switchOrderDetailTab('approvals');
    });
    document.getElementById('order-tab-requests').addEventListener('click', function () {
        switchOrderDetailTab('requests');
    });

    document.getElementById('filter-order-client').addEventListener('input', renderOrdersList);

    document.getElementById("ord-code").addEventListener("input", function () {
        this.value = this.value.replace(/\D/g, '');
    });

    document.getElementById("order-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        const orderCode = document.getElementById("ord-code").value.trim();
        const clientName = document.getElementById("ord-client").value.trim();
        const consultantName = document.getElementById("ord-consultant").value.trim();

        if (!orderCode) {
            alert("Informe o código do pedido (apenas números).");
            document.getElementById("ord-code").focus();
            return;
        }
        if (!clientName) {
            alert("Informe o nome do cliente.");
            document.getElementById("ord-client").focus();
            return;
        }
        if (!consultantName) {
            alert("Selecione o consultor.");
            document.getElementById("ord-consultant").focus();
            return;
        }

        const { data: existing } = await supabaseClient
            .from('salesOrders')
            .select('id')
            .eq('orderCode', orderCode)
            .maybeSingle();

        if (existing) {
            alert("Já existe um pedido cadastrado com este código.");
            return;
        }

        const payload = {
            orderCode,
            clientName,
            consultantName,
            createdById: currentUser.id,
            updatedById: currentUser.id
        };

        const { error } = await supabaseClient.from('salesOrders').insert([payload]);
        if (error) {
            alert("Erro ao salvar pedido: " + error.message);
            return;
        }
        toggleModal('order-modal', false);
        document.getElementById("order-form").reset();
        await loadConsultants();
        loadOrders();
    });
}
