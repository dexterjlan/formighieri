function getProjectStatusId(project) {
    return Number(project?.statusId || project?.projectStatus?.id || 0) || null;
}

function buildGestaoKanbanCardsForStatus(statusId, orders) {
    const cards = [];

    orders.forEach(order => {
        const projectsInStatus = (order.projects || []).filter(project =>
            getProjectStatusId(project) === Number(statusId)
        );

        if (projectsInStatus.length) {
            cards.push({ order, projects: projectsInStatus });
        }
    });

    cards.sort((a, b) => String(a.order.orderCode || '').localeCompare(
        String(b.order.orderCode || ''),
        'pt-BR',
        { numeric: true }
    ));

    return cards;
}

function renderGestaoKanbanCard(order, projects) {
    const card = document.createElement('div');
    card.className = 'bg-white border border-indigo-100 rounded-lg shadow-sm p-3 space-y-2';

    const projectsHtml = projects
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
        .map(project => {
            return `
                <li class="flex items-start justify-between gap-2">
                    <span class="text-[11px] text-slate-700 leading-snug min-w-0">${escapeHtml(project.name || 'Projeto')}</span>
                    <button type="button"
                        class="gestao-kanban-history-btn shrink-0 text-[10px] bg-white border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-md font-medium hover:bg-indigo-50"
                        data-order-project-id="${project.id}">
                        Histórico
                    </button>
                </li>
            `;
        })
        .join('');

    card.innerHTML = `
        <div class="space-y-0.5">
            <div class="font-mono text-xs font-bold text-indigo-800">${escapeHtml(order.orderCode || '—')}</div>
            <div class="text-xs font-semibold text-slate-800">${escapeHtml(order.clientName || '—')}</div>
        </div>
        <ul class="space-y-1.5 m-0 p-0 list-none">${projectsHtml}</ul>
    `;

    return card;
}

async function enrichProjectStatusHistoryEntries(entries) {
    if (!entries.length) return entries;

    const needsEnrich = entries.some(entry =>
        (entry.previousStatusId && !entry.previousStatus?.name)
        || (entry.newStatusId && !entry.newStatus?.name)
        || (entry.changedById && !entry.changedBy?.name)
    );

    if (!needsEnrich) return entries;

    const statusIds = [...new Set(entries.flatMap(entry => [
        entry.previousStatusId,
        entry.newStatusId
    ].filter(Boolean)))];
    const userIds = [...new Set(entries.map(entry => entry.changedById).filter(Boolean))];

    const [statusesResult, usersResult] = await Promise.all([
        statusIds.length
            ? supabaseClient.from('OrderProjectStatus').select('id, name').in('id', statusIds)
            : Promise.resolve({ data: [] }),
        userIds.length
            ? supabaseClient.from('appUsers').select('id, name').in('id', userIds)
            : Promise.resolve({ data: [] })
    ]);

    const statusById = Object.fromEntries((statusesResult.data || []).map(status => [status.id, status]));
    const userById = Object.fromEntries((usersResult.data || []).map(user => [user.id, user]));

    return entries.map(entry => ({
        ...entry,
        previousStatus: entry.previousStatus || statusById[entry.previousStatusId] || null,
        newStatus: entry.newStatus || statusById[entry.newStatusId] || null,
        changedBy: entry.changedBy || userById[entry.changedById] || null
    }));
}

async function fetchOrderProjectStatusHistory(orderProjectId) {
    const normalizedId = Number(orderProjectId);
    if (!normalizedId) return [];

    let result = await supabaseClient
        .from('OrderProjectStatusHistory')
        .select(`
            id,
            orderProjectId,
            previousStatusId,
            newStatusId,
            changedAt,
            changedById,
            previousStatusDurationSeconds,
            previousStatus:OrderProjectStatus!previousStatusId(id, name),
            newStatus:OrderProjectStatus!newStatusId(id, name),
            changedBy:appUsers(id, name)
        `)
        .eq('orderProjectId', normalizedId)
        .order('changedAt', { ascending: true });

    if (result.error?.message?.includes('OrderProjectStatusHistory')) {
        throw new Error('Execute supabase/create-order-project-status-history.sql no Supabase.');
    }

    if (result.error) {
        result = await supabaseClient
            .from('OrderProjectStatusHistory')
            .select('*')
            .eq('orderProjectId', normalizedId)
            .order('changedAt', { ascending: true });

        if (result.error) throw result.error;
    }

    return enrichProjectStatusHistoryEntries(result.data || []);
}

function renderProjectStatusHistoryConnector(durationSeconds) {
    const durationLabel = formatStatusDurationSeconds(durationSeconds);
    const durationHtml = durationLabel
        ? `<span class="text-[10px] text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200 shadow-sm">${escapeHtml(durationLabel)}</span>`
        : '';

    return `
        <div class="flex flex-col items-center py-1">
            <div class="w-0.5 h-5 bg-indigo-300"></div>
            ${durationHtml}
            <div class="w-0.5 h-5 bg-indigo-300"></div>
            <div class="text-indigo-400 text-xs leading-none">▼</div>
        </div>
    `;
}

function renderProjectStatusHistoryStep(entry, index) {
    const statusName = entry.newStatus?.name || 'Status';
    const changedAt = formatGestaoDateTime(entry.changedAt);
    const changedBy = entry.changedBy?.name || '—';
    const isInitial = !entry.previousStatusId && index === 0;

    return `
        <div class="rounded-xl border-2 border-indigo-200 bg-white px-4 py-3 shadow-sm text-center max-w-md w-full mx-auto">
            <div class="text-sm font-bold text-indigo-900">${escapeHtml(statusName)}</div>
            <div class="text-[10px] text-slate-500 mt-1">${escapeHtml(changedAt)} · ${escapeHtml(changedBy)}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">${isInitial ? 'Status inicial do projeto' : `Alterado de ${escapeHtml(entry.previousStatus?.name || '—')}`}</div>
        </div>
    `;
}

function renderProjectStatusHistoryFlow(entries) {
    if (!entries.length) {
        return '<p class="text-xs text-slate-400 text-center py-12">Nenhum registro de histórico para este projeto.</p>';
    }

    const parts = [];
    entries.forEach((entry, index) => {
        if (index > 0) {
            parts.push(renderProjectStatusHistoryConnector(entry.previousStatusDurationSeconds));
        }
        parts.push(renderProjectStatusHistoryStep(entry, index));
    });

    return `
        <div class="max-w-xl mx-auto flex flex-col items-stretch py-2">
            ${parts.join('')}
        </div>
    `;
}

async function openGestaoProjectStatusHistory(context = {}) {
    if (!canAccessGestao()) return;

    const orderProjectId = Number(context.orderProjectId);
    if (!orderProjectId) return;

    const subtitle = document.getElementById('gestao-project-history-subtitle');
    const flow = document.getElementById('gestao-project-history-flow');

    const projectLabel = context.projectLabel || 'Projeto';
    const orderCode = context.orderCode || '—';
    const clientName = context.clientName || '—';

    if (subtitle) {
        subtitle.textContent = `Pedido ${orderCode} · ${clientName} · ${projectLabel}`;
    }

    showGestaoProjectHistoryPanel();

    if (flow) {
        flow.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando histórico...</p>';
    }

    try {
        const entries = await fetchOrderProjectStatusHistory(orderProjectId);
        if (flow) {
            flow.innerHTML = renderProjectStatusHistoryFlow(entries);
        }
    } catch (error) {
        if (flow) {
            flow.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar histórico: ${escapeHtml(error.message)}</p>`;
        }
    }
}

window.openGestaoProjectStatusHistory = openGestaoProjectStatusHistory;

function getGestaoProjectHistoryContext(orderProjectId) {
    const normalizedId = Number(orderProjectId);

    for (const order of gestaoOrdersCache) {
        const project = (order.projects || []).find(item => Number(item.id) === normalizedId);
        if (!project) continue;

        const projectLabel = `${project.projectCode ? `${project.projectCode} — ` : ''}${project.name || 'Projeto'}`;
        return {
            orderProjectId: normalizedId,
            projectLabel,
            orderCode: order.orderCode || '—',
            clientName: order.clientName || '—'
        };
    }

    return {
        orderProjectId: normalizedId,
        projectLabel: 'Projeto',
        orderCode: '—',
        clientName: '—'
    };
}

function renderGestaoKanbanColumn(status, orders) {
    const cards = buildGestaoKanbanCardsForStatus(status.id, orders);
    const projectCount = cards.reduce((total, card) => total + card.projects.length, 0);

    const column = document.createElement('div');
    column.className = 'w-72 shrink-0 flex flex-col max-h-[calc(100vh-240px)]';
    column.innerHTML = `
        <div class="rounded-t-xl border border-slate-200 bg-slate-100 px-3 py-2.5">
            <div class="text-xs font-bold text-slate-800">${escapeHtml(status.name)}</div>
            <div class="text-[10px] text-slate-500">${cards.length} pedido${cards.length === 1 ? '' : 's'} · ${projectCount} projeto${projectCount === 1 ? '' : 's'}</div>
        </div>
        <div class="gestao-kanban-column-body flex-1 overflow-y-auto space-y-2 p-2 border border-t-0 border-slate-200 rounded-b-xl bg-slate-50/60"></div>
    `;

    const body = column.querySelector('.gestao-kanban-column-body');

    if (!cards.length) {
        body.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-6">Nenhum projeto neste status.</p>';
        return column;
    }

    cards.forEach(({ order, projects }) => {
        body.appendChild(renderGestaoKanbanCard(order, projects));
    });

    return column;
}

async function loadGestaoKanban() {
    const board = document.getElementById('gestao-kanban-board');
    if (!board) return;

    board.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando kanban...</p>';

    const [statuses, ordersResult] = await Promise.all([
        loadGestaoProjectStatuses(true),
        fetchGestaoOrders()
    ]);

    if (ordersResult.error) {
        board.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar kanban: ${escapeHtml(ordersResult.error.message)}</p>`;
        return;
    }

    gestaoOrdersCache = ordersResult.data || [];

    if (!statuses.length) {
        board.innerHTML = `
            <p class="text-xs text-amber-700 text-center py-8 bg-amber-50 rounded-xl border border-amber-100">
                Nenhum status cadastrado. Execute <code>supabase/create-order-project-status.sql</code> no Supabase.
            </p>
        `;
        return;
    }

    const boardInner = document.createElement('div');
    boardInner.className = 'flex gap-3 min-w-max items-start';

    statuses.forEach(status => {
        boardInner.appendChild(renderGestaoKanbanColumn(status, gestaoOrdersCache));
    });

    board.innerHTML = '';
    board.appendChild(boardInner);
}
