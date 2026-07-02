async function loadApprovalQueryFilterOptions() {
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

    const consultorSelect = document.getElementById('approval-filter-consultor');
    consultorSelect.innerHTML = '<option value="">Todos</option>';
    consultores?.forEach(c => {
        consultorSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`;
    });

    const projetistaSelect = document.getElementById('approval-filter-projetista');
    projetistaSelect.innerHTML = '<option value="">Todos</option>';
    projetistas?.forEach(p => {
        projetistaSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
}

async function queryAllCommercialApprovals() {
    const columnSets = [
        'id, orderId, projectName, designerId, approved, approvedAt, status',
        'id, orderId, projectName, designerId, approved, approvedAt',
        'id, orderId, projectName, designerId, approved',
        '*'
    ];

    let lastError = null;

    for (const columns of columnSets) {
        const result = await supabaseClient
            .from('CommercialApproval')
            .select(columns)
            .order('id', { ascending: false });

        if (!result.error) return result;
        lastError = result.error;
    }

    return { data: null, error: lastError };
}

async function searchCommercialApprovalsQuery() {
    const tbody = document.getElementById('approvals-query-list');
    const countEl = document.getElementById('approval-query-results-count');

    const { data: approvals, error } = await queryAllCommercialApprovals();

    if (error || !approvals) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-xs text-red-500">Erro ao carregar aprovações.</td></tr>';
        countEl.textContent = '0 aprovações';
        return;
    }

    const { data: orders } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, clientName, consultantName');

    const orderMap = {};
    orders?.forEach(o => { orderMap[o.id] = o; });

    const designerIds = [...new Set(approvals.map(a => a.designerId).filter(Boolean))];
    const projetistaNames = {};
    if (designerIds.length) {
        const { data: users } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', designerIds);
        users?.forEach(u => { projetistaNames[u.id] = u.name; });
    }

    const pedido = document.getElementById('approval-filter-pedido').value.trim().toLowerCase();
    const consultor = document.getElementById('approval-filter-consultor').value;
    const projetista = document.getElementById('approval-filter-projetista').value;
    const status = document.getElementById('approval-filter-status').value;

    let rows = approvals.map(a => {
        const normalized = normalizeCommercialApproval(a);
        return {
            ...normalized,
            order: orderMap[a.orderId] || {},
            projetistaName: projetistaNames[a.designerId] || '-'
        };
    });

    if (pedido) {
        rows = rows.filter(r => (r.order.orderCode || '').toLowerCase().includes(pedido));
    }
    if (consultor) {
        rows = rows.filter(r => r.order.consultantName === consultor);
    }
    if (projetista) {
        rows = rows.filter(r => String(r.designerId) === projetista);
    }
    if (status) {
        rows = rows.filter(r => r.status === status);
    }

    const approvalIds = rows.map(r => r.id);
    const revisionsByApproval = typeof fetchCommercialRevisionsByApprovalIds === 'function'
        ? await fetchCommercialRevisionsByApprovalIds(approvalIds)
        : {};

    tbody.innerHTML = '';
    countEl.textContent = `${rows.length} aprovaç${rows.length === 1 ? 'ão' : 'ões'}`;

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-xs text-slate-400">Nenhuma aprovação encontrada.</td></tr>';
        return;
    }

    rows.forEach(r => {
        const statusLabel = getApprovalStatusLabel(r.status);
        const statusClass = getApprovalStatusBadgeClass(statusLabel);
        const hasRevision = (revisionsByApproval[r.id] || []).length > 0;
        const showViewRevision = hasRevision
            && typeof canViewCommercialRevision === 'function'
            && canViewCommercialRevision(r);
        const isWaitingApproval = r.status === 'Aguardando Aprovação';
        const showApprove = isWaitingApproval && canApproveCommercialApproval(r);
        const showRequestRevision = isWaitingApproval
            && typeof canRequestNewRevision === 'function'
            && canRequestNewRevision(r);
        const actionButtons = [];

        if (showApprove) {
            actionButtons.push(`<button type="button" onclick="approveCommercialApproval(${r.id})"
                class="text-xs bg-emerald-700 text-white hover:bg-emerald-800 px-2.5 py-1 rounded-lg font-medium">Aprovar</button>`);
        }
        if (showRequestRevision) {
            actionButtons.push(`<button type="button" onclick="openCommercialRevisionModal(${r.id})"
                class="text-xs bg-sky-700 text-white hover:bg-sky-800 px-2.5 py-1 rounded-lg font-medium">Solicitar Revisão</button>`);
        }
        if (showViewRevision) {
            actionButtons.push(`<button type="button" onclick="openCommercialRevisionView(${r.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Revisão</button>`);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-3 font-mono text-xs font-bold text-slate-600">${r.order.orderCode || '-'}</td>
            <td class="p-3 text-slate-800">${r.order.clientName || '-'}</td>
            <td class="p-3 text-slate-500">${r.order.consultantName || '-'}</td>
            <td class="p-3 text-slate-700">${r.projetistaName}</td>
            <td class="p-3 text-slate-800">${r.projectName || '-'}</td>
            <td class="p-3">
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${statusLabel}</span>
            </td>
            <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${r.approved && r.approvedAt ? formatDate(r.approvedAt) : '—'}</td>
            <td class="p-3 whitespace-nowrap">
                ${actionButtons.length
                    ? `<div class="flex flex-wrap gap-1">${actionButtons.join('')}</div>`
                    : '<span class="text-xs text-slate-300">—</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function refreshApprovalsQueryIfVisible() {
    const queryView = document.getElementById('approvals-query-view');
    if (queryView && !queryView.classList.contains('hidden')) {
        searchCommercialApprovalsQuery();
    }
}

function bindCommercialApprovalQueryEvents() {
    document.getElementById('approvals-query-form').addEventListener('submit', function (e) {
        e.preventDefault();
        searchCommercialApprovalsQuery();
    });
    document.getElementById('btn-clear-approval-filters').addEventListener('click', function () {
        document.getElementById('approval-filter-pedido').value = '';
        document.getElementById('approval-filter-consultor').value = '';
        document.getElementById('approval-filter-projetista').value = '';
        document.getElementById('approval-filter-status').value = '';
        searchCommercialApprovalsQuery();
    });
}
