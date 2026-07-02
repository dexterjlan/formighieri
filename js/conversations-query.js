async function loadQueryFilterOptions() {
    const { data: consultores } = await supabaseClient
        .from('appUsers')
        .select('name')
        .eq('role', 'Consultor')
        .eq('isActive', true)
        .order('name', { ascending: true });

    const { data: projetistas } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .order('name', { ascending: true });

    const consultorSelect = document.getElementById("filter-consultor");
    consultorSelect.innerHTML = '<option value="">Todos</option>';
    consultores?.forEach(c => {
        consultorSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`;
    });

    const projetistaSelect = document.getElementById("filter-projetista");
    projetistaSelect.innerHTML = '<option value="">Todos</option>';
    projetistas?.forEach(p => {
        projetistaSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
}

async function searchConversations() {
    const { data: convs, error } = await supabaseClient
        .from('orderConversations')
        .select('*')
        .order('createdAt', { ascending: false });

    const tbody = document.getElementById("conversations-query-list");
    const countEl = document.getElementById("query-results-count");

    if (error || !convs) {
        tbody.innerHTML = '<tr><td colspan="10" class="p-4 text-xs text-red-500">Erro ao carregar conversas.</td></tr>';
        countEl.textContent = '0 conversas';
        return;
    }

    conversationsCache = convs;

    const { data: orders } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, clientName, consultantName');

    const orderMap = {};
    orders?.forEach(o => { orderMap[o.id] = o; });

    const designerIds = [...new Set(convs.map(c => c.designerId).filter(Boolean))];
    const projetistaNames = {};
    if (designerIds.length) {
        const { data: users } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', designerIds);
        users?.forEach(u => { projetistaNames[u.id] = u.name; });
    }

    const pedido = document.getElementById("filter-pedido").value.trim().toLowerCase();
    const cliente = document.getElementById("filter-cliente").value.trim().toLowerCase();
    const status = document.getElementById("filter-status").value;
    const consultor = document.getElementById("filter-consultor").value;
    const projetista = document.getElementById("filter-projetista").value;

    let rows = convs.map(c => ({
        ...c,
        order: orderMap[c.orderId] || {},
        projetistaName: projetistaNames[c.designerId] || '-'
    }));

    if (pedido) {
        rows = rows.filter(r => (r.order.orderCode || '').toLowerCase().includes(pedido));
    }
    if (cliente) {
        rows = rows.filter(r => (r.order.clientName || '').toLowerCase().includes(cliente));
    }
    if (status) {
        rows = rows.filter(r => r.status === status);
    }
    if (consultor) {
        rows = rows.filter(r => r.order.consultantName === consultor);
    }
    if (projetista) {
        rows = rows.filter(r => String(r.designerId) === projetista);
    }

    tbody.innerHTML = "";
    countEl.textContent = `${rows.length} conversa${rows.length === 1 ? '' : 's'}`;

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-xs text-slate-400">Nenhuma conversa encontrada.</td></tr>';
        return;
    }

    rows.forEach(r => {
        const isOpen = r.status === 'Aberto';
        const canEdit = canEditConversation(r);
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50/80";
        tr.innerHTML = `
            <td class="p-3 font-mono text-xs font-bold text-slate-600">${r.order.orderCode || '-'}</td>
            <td class="p-3 text-slate-800">${r.order.clientName || '-'}</td>
            <td class="p-3 text-slate-500">${r.order.consultantName || '-'}</td>
            <td class="p-3 text-slate-700">${r.projetistaName}</td>
            <td class="p-3">
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isOpen ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}">${r.status}</span>
            </td>
            <td class="p-3 text-xs text-slate-600 max-w-[180px]" title="${r.designerRequest || ''}">${truncateText(r.designerRequest)}</td>
            <td class="p-3 text-xs text-slate-600 max-w-[180px]" title="${r.commercialResponse || ''}">${truncateText(r.commercialResponse)}</td>
            <td class="p-3 text-xs text-slate-400 whitespace-nowrap">${formatDate(r.createdAt)}</td>
            <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${formatDate(getResponseDisplayDate(r))}</td>
            <td class="p-3 whitespace-nowrap">
                ${canEdit ? `<button type="button" onclick="editConversation(${r.id})"
                    class="text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 px-2.5 py-1 rounded-lg font-medium">Editar</button>` : '<span class="text-xs text-slate-300">—</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function bindConversationsQueryEvents() {
    document.getElementById("conversations-query-form").addEventListener("submit", function (e) {
        e.preventDefault();
        searchConversations();
    });
    document.getElementById("btn-clear-filters").addEventListener("click", function () {
        document.getElementById("filter-pedido").value = "";
        document.getElementById("filter-cliente").value = "";
        document.getElementById("filter-status").value = "";
        document.getElementById("filter-consultor").value = "";
        document.getElementById("filter-projetista").value = "";
        searchConversations();
    });
}
