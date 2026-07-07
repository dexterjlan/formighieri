const REQUEST_QUERY_DEFAULT_STATUSES = ['Aguardando Consultor', 'Aguardando Projetista'];

function getRequestQueryStatusFilters() {
    const select = document.getElementById('filter-status');
    if (!select) return [...REQUEST_QUERY_DEFAULT_STATUSES];
    return Array.from(select.selectedOptions).map(option => option.value);
}

function resetRequestQueryStatusFilter() {
    const select = document.getElementById('filter-status');
    if (!select) return;

    Array.from(select.options).forEach(option => {
        option.selected = REQUEST_QUERY_DEFAULT_STATUSES.includes(option.value);
    });
}

function matchesRequestQueryStatusFilter(request, selectedStatuses) {
    if (!selectedStatuses.length) return false;
    return selectedStatuses.includes(normalizeRequestStatus(request));
}

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
    await ensureSystemSettingsLoaded();
    syncRequestProfileColumnVisibility();
    const showProfile = canSeeRequestProfileField();
    const tableColSpan = showProfile ? 11 : 10;

    const { data: convs, error } = await supabaseClient
        .from('OrderRequest')
        .select('*')
        .order('createdAt', { ascending: false });

    const tbody = document.getElementById("conversations-query-list");
    const countEl = document.getElementById("query-results-count");

    if (error || !convs) {
        tbody.innerHTML = `<tr><td colspan="${tableColSpan}" class="p-4 text-xs text-red-500">Erro ao carregar requisições.</td></tr>`;
        countEl.textContent = '0 requisições';
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
    const statusFilters = getRequestQueryStatusFilters();
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
    rows = rows.filter(r => matchesRequestQueryStatusFilter(r, statusFilters));
    if (consultor) {
        rows = rows.filter(r => r.order.consultantName === consultor);
    }
    if (projetista) {
        rows = rows.filter(r => String(r.designerId) === projetista);
    }

    rows = sortOrderRequests(rows);

    tbody.innerHTML = "";
    countEl.textContent = `${rows.length} requisiç${rows.length === 1 ? 'ão' : 'ões'}`;

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${tableColSpan}" class="p-6 text-center text-xs text-slate-400">Nenhuma requisição encontrada.</td></tr>`;
        return;
    }

    rows.forEach(r => {
        const status = normalizeRequestStatus(r);
        const canEdit = canEditConversation(r);
        const rowBg = getRequestHighlightBgHex(r);
        const cellStyle = `background-color: ${rowBg};`;
        const profile = formatRequestProfile(r.requestProfile);
        const profileClass = getRequestProfileBadgeClass(r.requestProfile);
        const statusClass = getRequestStatusBadgeClass(status);
        const profileCell = showProfile
            ? `<td class="p-3 conv-query-profile-col" style="${cellStyle}">
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${profileClass}">${profile}</span>
            </td>`
            : '';
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="p-3 font-mono text-xs font-bold text-slate-600" style="${cellStyle}">${r.order.orderCode || '-'}</td>
            <td class="p-3 text-slate-800" style="${cellStyle}">${r.order.clientName || '-'}</td>
            <td class="p-3 text-slate-500" style="${cellStyle}">${r.order.consultantName || '-'}</td>
            <td class="p-3 text-slate-700" style="${cellStyle}">${r.projetistaName}</td>
            <td class="p-3" style="${cellStyle}">
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${status}</span>
            </td>
            ${profileCell}
            <td class="p-3 text-xs text-slate-600 max-w-[180px]" style="${cellStyle}" title="${r.designerRequest || ''}">${truncateText(r.designerRequest)}</td>
            <td class="p-3 text-xs text-slate-600 max-w-[180px]" style="${cellStyle}" title="${getRequestResponseSummary(r)}">${truncateText(getRequestResponseSummary(r))}</td>
            <td class="p-3 text-xs text-slate-400 whitespace-nowrap" style="${cellStyle}">${formatDate(r.createdAt)}</td>
            <td class="p-3 text-xs text-slate-500 whitespace-nowrap" style="${cellStyle}">${formatDate(getResponseDisplayDate(r))}</td>
            <td class="p-3 whitespace-nowrap" style="${cellStyle}">
                ${canEdit ? `<button type="button" onclick="editConversation(${r.id})"
                    class="text-xs bg-white/80 text-slate-600 hover:bg-white px-2.5 py-1 rounded-lg font-medium">Editar</button>` : '<span class="text-xs text-slate-300">—</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function bindConversationsQueryEvents() {
    document.getElementById("conversations-query-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        searchConversations();
    });
    document.getElementById("btn-clear-filters").addEventListener("click", async function () {
        document.getElementById("filter-pedido").value = "";
        document.getElementById("filter-cliente").value = "";
        resetRequestQueryStatusFilter();
        document.getElementById("filter-consultor").value = "";
        document.getElementById("filter-projetista").value = "";
        searchConversations();
    });
}
