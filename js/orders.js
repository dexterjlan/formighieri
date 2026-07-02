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

    const list = document.getElementById("orders-list");
    list.innerHTML = "";

    if (error || !orders) return;

    orders.forEach(o => {
        const isSelected = o.id === activeOrderId;
        const div = document.createElement("div");
        div.className = `p-4 cursor-pointer hover:bg-slate-50 transition flex flex-col gap-1 ${isSelected ? 'bg-amber-50/60 border-l-4 border-amber-600' : ''}`;
        div.onclick = () => selectOrder(o.id);
        div.innerHTML = `
            <div class="text-xs font-mono font-bold text-slate-400">${o.orderCode}</div>
            <div class="text-sm font-bold text-slate-900">${o.clientName}</div>
            <div class="text-xs text-slate-500">Consultor: ${o.consultantName}</div>
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
    loadConversations(id);
    loadCommercialApprovals(id);
    updateCommercialApprovalButtonVisibility();
}

function bindOrderEvents() {
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
