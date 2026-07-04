let gestaoOrdersCache = [];
let gestaoEnvironmentTypesCache = [];
let gestaoProjetistasCache = [];
let gestaoProjectStatusesCache = [];
let editingGestaoOrderId = null;

const GESTAO_NAV_ACTIVE_CLASS = 'gestao-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100';
const GESTAO_NAV_INACTIVE_CLASS = 'gestao-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-transparent';

function canAccessGestao() {
    return isAdmin();
}

function formatGestaoDate(dateStr) {
    if (!dateStr) return '—';
    const part = String(dateStr).split('T')[0];
    const [year, month, day] = part.split('-');
    if (!year || !month || !day) return '—';
    return `${day}/${month}/${year}`;
}

function toGestaoInputDate(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).split('T')[0];
}

function updateGestaoProjectsEmptyState() {
    const tbody = document.getElementById('gestao-projects-rows');
    const emptyMsg = document.getElementById('gestao-projects-empty-msg');
    const hasRows = tbody?.querySelectorAll('tr').length > 0;
    emptyMsg?.classList.toggle('hidden', hasRows);
}

function setGestaoNavActive(navKey) {
    const navMap = {
        pedido: document.getElementById('gestao-nav-pedido'),
        'project-status': document.getElementById('gestao-nav-project-status'),
        kanban: document.getElementById('gestao-nav-kanban')
    };

    Object.entries(navMap).forEach(([key, button]) => {
        if (!button) return;
        button.className = key === navKey ? GESTAO_NAV_ACTIVE_CLASS : GESTAO_NAV_INACTIVE_CLASS;
    });
}

function hideAllGestaoPanels() {
    document.getElementById('gestao-pedido-list-panel')?.classList.add('hidden');
    document.getElementById('gestao-pedido-form-panel')?.classList.add('hidden');
    document.getElementById('gestao-project-status-panel')?.classList.add('hidden');
    document.getElementById('gestao-kanban-panel')?.classList.add('hidden');
    document.getElementById('gestao-project-history-panel')?.classList.add('hidden');
}

function formatGestaoDateTime(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return formatGestaoDate(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatStatusDurationSeconds(seconds) {
    if (seconds == null || seconds === undefined) return null;
    const total = Number(seconds);
    if (!Number.isFinite(total) || total < 0) return null;

    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);

    if (days > 0) return `${days} dia${days === 1 ? '' : 's'} ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}min`;
    if (minutes > 0) return `${minutes}min`;
    return 'menos de 1 min';
}

function showGestaoProjectHistoryPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-project-history-panel')?.classList.remove('hidden');
    setGestaoNavActive('kanban');
}

async function loadGestaoProjectStatuses(activeOnly = false) {
    let query = supabaseClient
        .from('OrderProjectStatus')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('loadGestaoProjectStatuses:', error);
        gestaoProjectStatusesCache = [];
        return [];
    }

    gestaoProjectStatusesCache = data || [];
    return gestaoProjectStatusesCache;
}

function getDefaultProjectStatusId() {
    const vendido = gestaoProjectStatusesCache.find(
        status => status.isActive !== false && status.name === 'Vendido'
    );
    if (vendido) return vendido.id;

    const firstActive = gestaoProjectStatusesCache.find(status => status.isActive !== false);
    return firstActive?.id || gestaoProjectStatusesCache[0]?.id || null;
}

function resolveGestaoProjectStatusId(project = {}) {
    if (project.statusId || project.projectStatus?.id) {
        return project.statusId || project.projectStatus?.id;
    }
    return getDefaultProjectStatusId();
}

function getOrderProjectStatusOptionsHtml(selectedId = null) {
    const activeStatuses = gestaoProjectStatusesCache.filter(status => status.isActive !== false);
    const defaultId = selectedId ?? getDefaultProjectStatusId();

    if (!activeStatuses.length) {
        return '<option value="">Cadastre status em Gestão → Status de Projeto</option>';
    }

    return activeStatuses.map(status => `
        <option value="${status.id}" ${String(status.id) === String(defaultId) ? 'selected' : ''}>${escapeHtml(status.name)}</option>
    `).join('');
}

function getEnvironmentOptionsHtml(selectedId = '') {
    const types = gestaoEnvironmentTypesCache.length
        ? gestaoEnvironmentTypesCache
        : (typeof environmentTypesCache !== 'undefined' ? environmentTypesCache : []);

    return types.map(type => `
        <option value="${type.id}" ${String(type.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(type.name)}</option>
    `).join('');
}

function getProjetistaOptionsHtml(selectedId = '') {
    return gestaoProjetistasCache.map(user => `
        <option value="${user.id}" ${String(user.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(user.name)}</option>
    `).join('');
}

function isNumericProjectCode(value) {
    return /^\d+$/.test(String(value || '').trim());
}

function normalizeProjectCodeInput(value) {
    return String(value || '').replace(/\D/g, '');
}

function bindGestaoProjectCodeInput(input) {
    if (!input) return;

    input.addEventListener('input', () => {
        const normalized = normalizeProjectCodeInput(input.value);
        if (input.value !== normalized) {
            input.value = normalized;
        }
    });
}

function addGestaoProjectRow(project = {}) {
    const tbody = document.getElementById('gestao-projects-rows');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.className = 'gestao-project-row';
    if (project.id) row.dataset.projectId = String(project.id);

    row.innerHTML = `
        <td class="p-2">
            <input type="text" class="gestao-project-code w-full px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600"
                value="${escapeHtml(normalizeProjectCodeInput(project.projectCode || ''))}" placeholder="Somente números"
                inputmode="numeric" pattern="[0-9]+" title="Informe somente números" required>
        </td>
        <td class="p-2">
            <input type="text" class="gestao-project-name w-full px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600"
                value="${escapeHtml(project.name || '')}" placeholder="Nome" required>
        </td>
        <td class="p-2">
            <select class="gestao-project-environment w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-600" required>
                <option value="">Selecione...</option>
                ${getEnvironmentOptionsHtml(project.environmentTypeId)}
            </select>
        </td>
        <td class="p-2">
            <input type="date" class="gestao-project-delivery w-full px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600"
                value="${toGestaoInputDate(project.deliveryDate)}">
        </td>
        <td class="p-2">
            <select class="gestao-project-status w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-600" required>
                ${getOrderProjectStatusOptionsHtml(resolveGestaoProjectStatusId(project))}
            </select>
        </td>
        <td class="p-2">
            <select class="gestao-project-designer w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-600">
                <option value="">Selecione...</option>
                ${getProjetistaOptionsHtml(project.designerId)}
            </select>
        </td>
        <td class="p-2 text-center">
            <button type="button" class="gestao-remove-project text-red-600 hover:text-red-800 text-xs font-medium">×</button>
        </td>
    `;

    row.querySelector('.gestao-remove-project')?.addEventListener('click', () => {
        row.remove();
        updateGestaoProjectsEmptyState();
    });

    bindGestaoProjectCodeInput(row.querySelector('.gestao-project-code'));

    tbody.appendChild(row);
    updateGestaoProjectsEmptyState();
}

function clearGestaoProjectRows() {
    const tbody = document.getElementById('gestao-projects-rows');
    if (tbody) tbody.innerHTML = '';
    updateGestaoProjectsEmptyState();
}

function collectGestaoProjectsFromDom() {
    return Array.from(document.querySelectorAll('.gestao-project-row')).map(row => ({
        id: row.dataset.projectId ? Number(row.dataset.projectId) : null,
        projectCode: row.querySelector('.gestao-project-code')?.value.trim() || '',
        name: row.querySelector('.gestao-project-name')?.value.trim() || '',
        environmentTypeId: Number(row.querySelector('.gestao-project-environment')?.value) || null,
        deliveryDate: row.querySelector('.gestao-project-delivery')?.value || null,
        statusId: Number(row.querySelector('.gestao-project-status')?.value) || getDefaultProjectStatusId(),
        designerId: row.querySelector('.gestao-project-designer')?.value
            ? Number(row.querySelector('.gestao-project-designer').value)
            : null
    }));
}

async function loadGestaoConsultants(selectedName = '') {
    const select = document.getElementById('gestao-ord-consultant');
    if (!select) return;

    const { data: consultants, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Consultor')
        .eq('isActive', true)
        .order('name', { ascending: true });

    select.innerHTML = '<option value="">Selecione...</option>';

    if (error || !consultants?.length) {
        select.innerHTML += '<option value="" disabled>Nenhum consultor cadastrado</option>';
        return;
    }

    consultants.forEach(consultant => {
        const selected = consultant.name === selectedName ? 'selected' : '';
        select.innerHTML += `<option value="${escapeHtml(consultant.name)}" ${selected}>${escapeHtml(consultant.name)}</option>`;
    });
}

async function loadGestaoFormOptions() {
    if (typeof loadEnvironmentTypes === 'function') {
        gestaoEnvironmentTypesCache = await loadEnvironmentTypes();
    } else {
        const { data } = await supabaseClient
            .from('EnvironmentType')
            .select('id, name')
            .order('name', { ascending: true });
        gestaoEnvironmentTypesCache = data || [];
    }

    const { data: projetistas } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .order('name', { ascending: true });

    gestaoProjetistasCache = projetistas || [];
    await loadGestaoProjectStatuses(true);
}

function showGestaoPedidoListPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-pedido-list-panel')?.classList.remove('hidden');
    setGestaoNavActive('pedido');
}

function showGestaoPedidoFormPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-pedido-form-panel')?.classList.remove('hidden');
    setGestaoNavActive('pedido');
}

function showGestaoProjectStatusPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-project-status-panel')?.classList.remove('hidden');
    setGestaoNavActive('project-status');
}

function showGestaoKanbanPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-kanban-panel')?.classList.remove('hidden');
    setGestaoNavActive('kanban');
    loadGestaoKanban();
}

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
            const codePrefix = project.projectCode ? `${escapeHtml(project.projectCode)} — ` : '';
            return `
                <li class="flex items-start justify-between gap-2">
                    <span class="text-[11px] text-slate-700 leading-snug min-w-0">${codePrefix}${escapeHtml(project.name || 'Projeto')}</span>
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

async function openGestaoCreateOrderForm() {
    if (!canAccessGestao()) return;

    editingGestaoOrderId = null;
    document.getElementById('gestao-order-form')?.reset();
    document.getElementById('gestao-order-form-title').textContent = 'Criar Pedido';
    document.getElementById('gestao-order-form-submit').textContent = 'Salvar Pedido';
    document.getElementById('gestao-ord-code').disabled = false;

    await loadGestaoFormOptions();
    await loadGestaoConsultants();
    clearGestaoProjectRows();
    addGestaoProjectRow();
    showGestaoPedidoFormPanel();
}

async function openGestaoEditOrderForm(orderId) {
    if (!canAccessGestao()) return;

    const order = gestaoOrdersCache.find(item => item.id === orderId);
    if (!order) return;

    editingGestaoOrderId = orderId;
    document.getElementById('gestao-order-form-title').textContent = 'Editar Pedido';
    document.getElementById('gestao-order-form-submit').textContent = 'Atualizar Pedido';
    document.getElementById('gestao-ord-code').value = order.orderCode || '';
    document.getElementById('gestao-ord-code').disabled = true;
    document.getElementById('gestao-ord-client').value = order.clientName || '';
    document.getElementById('gestao-ord-client-delivery').value = toGestaoInputDate(order.clientDeliveryDate);

    await loadGestaoFormOptions();
    await loadGestaoConsultants(order.consultantName || '');

    clearGestaoProjectRows();
    const projects = order.projects || [];
    if (projects.length) {
        projects.forEach(project => addGestaoProjectRow(project));
    } else {
        addGestaoProjectRow();
    }

    showGestaoPedidoFormPanel();
}

window.openGestaoEditOrderForm = openGestaoEditOrderForm;

function groupGestaoProjectsByOrderId(projects) {
    const byOrderId = {};
    (projects || []).forEach(project => {
        const orderId = Number(project.orderId);
        if (!byOrderId[orderId]) byOrderId[orderId] = [];
        byOrderId[orderId].push(project);
    });
    return byOrderId;
}

async function fetchGestaoProjectsByOrderIds(orderIds) {
    const normalizedIds = [...new Set(orderIds.map(id => Number(id)).filter(Boolean))];
    if (!normalizedIds.length) return {};

    const selectVariants = [
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name)',
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId',
        'id, orderId, name, environmentTypeId, environmentType:EnvironmentType(name)',
        'id, orderId, name, environmentTypeId'
    ];

    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .in('orderId', normalizedIds)
            .order('name', { ascending: true });

        if (!error) {
            return groupGestaoProjectsByOrderId(data || []);
        }
    }

    return {};
}

async function enrichGestaoOrdersWithProjectStatuses(orders) {
    const allProjects = orders.flatMap(order => order.projects || []);
    const needsStatus = allProjects.some(project => project.statusId && !project.projectStatus);
    if (!needsStatus) return orders;

    const { data: statuses } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name');

    const statusById = Object.fromEntries((statuses || []).map(item => [item.id, item]));

    return orders.map(order => ({
        ...order,
        projects: (order.projects || []).map(project => ({
            ...project,
            projectStatus: project.projectStatus || statusById[project.statusId] || null
        }))
    }));
}

async function fetchGestaoOrders() {
    const orderSelectVariants = [
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId)',
        '*'
    ];

    let result = null;
    let lastError = null;

    for (const selectCols of orderSelectVariants) {
        const attempt = await supabaseClient
            .from('salesOrders')
            .select(selectCols)
            .order('createdAt', { ascending: false });

        if (!attempt.error) {
            result = attempt;
            break;
        }
        lastError = attempt.error;
    }

    if (!result) {
        return { data: null, error: lastError };
    }

    let orders = result.data || [];
    const needsProjectsFetch = orders.some(order => !Array.isArray(order.projects));

    if (needsProjectsFetch && orders.length) {
        const projectsByOrderId = await fetchGestaoProjectsByOrderIds(orders.map(order => order.id));
        orders = orders.map(order => ({
            ...order,
            projects: Array.isArray(order.projects) ? order.projects : (projectsByOrderId[order.id] || [])
        }));
    }

    orders = await enrichGestaoOrdersWithProjectStatuses(orders);

    return { data: orders, error: null };
}

async function loadGestaoOrdersList() {
    const tbody = document.getElementById('gestao-orders-list');
    if (!tbody) return;

    const result = await fetchGestaoOrders();

    if (result.error) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-xs text-red-500">Erro ao carregar pedidos: ${escapeHtml(result.error.message)}</td></tr>`;
        return;
    }

    gestaoOrdersCache = result.data || [];

    if (!gestaoOrdersCache.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-xs text-slate-400">Nenhum pedido cadastrado.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    gestaoOrdersCache.forEach(order => {
        const projectCount = (order.projects || []).length;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-3 font-mono text-xs font-bold text-slate-700">${escapeHtml(order.orderCode || '—')}</td>
            <td class="p-3 text-slate-800">${escapeHtml(order.clientName || '—')}</td>
            <td class="p-3 text-slate-500">${escapeHtml(order.consultantName || '—')}</td>
            <td class="p-3 text-slate-600 whitespace-nowrap">${formatGestaoDate(order.clientDeliveryDate)}</td>
            <td class="p-3 text-slate-600">${projectCount}</td>
            <td class="p-3">
                <button type="button" onclick="openGestaoEditOrderForm(${order.id})"
                    class="text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium">
                    Editar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function insertGestaoProject(orderId, project, now) {
    const statusId = project.statusId || getDefaultProjectStatusId();
    const payloadVariants = [
        {
            orderId,
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            deliveryDate: project.deliveryDate,
            statusId,
            designerId: project.designerId,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            orderId,
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            deliveryDate: project.deliveryDate,
            statusId,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            orderId,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            statusId,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            orderId,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        }
    ];

    let lastError = null;
    const seen = new Set();

    for (const payload of payloadVariants) {
        const cleanPayload = Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined && value !== '')
        );
        const key = JSON.stringify(cleanPayload);
        if (seen.has(key)) continue;
        seen.add(key);

        const { error } = await supabaseClient.from('OrderProject').insert(cleanPayload);
        if (!error) return;
        lastError = error;
    }

    throw lastError;
}

async function updateGestaoProject(project, now) {
    const statusId = project.statusId || getDefaultProjectStatusId();
    const payloadVariants = [
        {
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            deliveryDate: project.deliveryDate,
            statusId,
            designerId: project.designerId,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            deliveryDate: project.deliveryDate,
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            updatedById: currentUser.id,
            updatedAt: now
        }
    ];

    let lastError = null;
    const seen = new Set();

    for (const payload of payloadVariants) {
        const cleanPayload = Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined && value !== '')
        );
        const key = JSON.stringify(cleanPayload);
        if (seen.has(key)) continue;
        seen.add(key);

        const { error } = await supabaseClient
            .from('OrderProject')
            .update(cleanPayload)
            .eq('id', project.id);

        if (!error) return;
        lastError = error;
    }

    throw lastError;
}

async function persistGestaoProjects(orderId, projects) {
    const now = new Date().toISOString();
    const { data: current } = await supabaseClient
        .from('OrderProject')
        .select('id')
        .eq('orderId', orderId);

    const keepIds = projects.filter(project => project.id).map(project => project.id);
    const deleteIds = (current || [])
        .map(row => row.id)
        .filter(id => !keepIds.includes(id));

    if (deleteIds.length) {
        const { error } = await supabaseClient
            .from('OrderProject')
            .delete()
            .in('id', deleteIds);
        if (error) throw error;
    }

    for (const project of projects) {
        if (project.id) {
            await updateGestaoProject(project, now);
            continue;
        }
        await insertGestaoProject(orderId, project, now);
    }
}

async function saveGestaoOrder(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const orderCode = document.getElementById('gestao-ord-code')?.value.trim();
    const clientName = document.getElementById('gestao-ord-client')?.value.trim();
    const consultantName = document.getElementById('gestao-ord-consultant')?.value.trim();
    const clientDeliveryDate = document.getElementById('gestao-ord-client-delivery')?.value || null;
    const projects = collectGestaoProjectsFromDom();

    if (!orderCode) {
        alert('Informe o código do pedido.');
        return;
    }
    if (!clientName) {
        alert('Informe o nome do cliente.');
        return;
    }
    if (!consultantName) {
        alert('Selecione o consultor.');
        return;
    }
    if (!projects.length) {
        alert('Adicione ao menos um projeto.');
        return;
    }

    for (const project of projects) {
        if (!project.projectCode || !project.name || !project.environmentTypeId || !project.statusId) {
            alert('Preencha código, nome, ambiente e status de todos os projetos.');
            return;
        }
        if (!isNumericProjectCode(project.projectCode)) {
            alert(`O código do projeto "${project.name}" deve conter somente números.`);
            return;
        }
    }

    const now = new Date().toISOString();

    try {
        let orderId = editingGestaoOrderId;

        if (editingGestaoOrderId) {
            let { error } = await supabaseClient
                .from('salesOrders')
                .update({
                    clientName,
                    consultantName,
                    clientDeliveryDate,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', editingGestaoOrderId);

            if (error?.message?.includes('clientDeliveryDate')) {
                ({ error } = await supabaseClient
                    .from('salesOrders')
                    .update({
                        clientName,
                        consultantName,
                        updatedById: currentUser.id
                    })
                    .eq('id', editingGestaoOrderId));
            }

            if (error) throw error;
        } else {
            const { data: existing } = await supabaseClient
                .from('salesOrders')
                .select('id')
                .eq('orderCode', orderCode)
                .maybeSingle();

            if (existing) {
                alert('Já existe um pedido com este código.');
                return;
            }

            const orderPayload = {
                orderCode,
                clientName,
                consultantName,
                clientDeliveryDate,
                createdById: currentUser.id,
                updatedById: currentUser.id,
                updatedAt: now
            };

            let { data: created, error } = await supabaseClient
                .from('salesOrders')
                .insert(orderPayload)
                .select('id')
                .single();

            if (error?.message?.includes('clientDeliveryDate')) {
                const { clientDeliveryDate: _d, updatedAt: _u, ...fallback } = orderPayload;
                ({ data: created, error } = await supabaseClient
                    .from('salesOrders')
                    .insert(fallback)
                    .select('id')
                    .single());
            }

            if (error) throw error;
            orderId = created.id;
        }

        await persistGestaoProjects(orderId, projects);

        editingGestaoOrderId = null;
        showGestaoPedidoListPanel();
        await loadGestaoOrdersList();

        if (typeof loadOrders === 'function') {
            await loadOrders();
        }
        if (typeof loadOrderProjects === 'function' && activeOrderId === orderId) {
            await loadOrderProjects(orderId);
        }
    } catch (error) {
        const sqlHint = error.message?.includes('clientDeliveryDate')
            || error.message?.includes('projectCode')
            || error.message?.includes('statusId')
            || error.message?.includes('OrderProjectStatus')
            ? '\n\nExecute os SQL supabase/create-gestao-order-fields.sql e supabase/create-order-project-status.sql no Supabase.'
            : '';
        alert('Erro ao salvar pedido: ' + error.message + sqlHint);
    }
}

function showGestao() {
    if (!canAccessGestao()) {
        alert('Somente administradores podem acessar a Gestão.');
        return;
    }

    if (typeof hideSubViews === 'function') hideSubViews();
    document.getElementById('gestao-view')?.classList.remove('hidden');
    if (typeof updateMainNavActive === 'function') updateMainNavActive('gestao');
    if (typeof updateAdminNav === 'function') updateAdminNav();

    showGestaoPedidoListPanel();
    loadGestaoOrdersList();
}

async function loadGestaoProjectStatusList() {
    const tbody = document.getElementById('gestao-project-status-list');
    if (!tbody) return;

    const statuses = await loadGestaoProjectStatuses(false);

    if (!statuses.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-amber-700">
                    Nenhum status cadastrado. Execute <code>supabase/create-order-project-status.sql</code> no Supabase.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    statuses.forEach(status => {
        const tr = document.createElement('tr');
        tr.dataset.statusId = String(status.id);
        tr.innerHTML = `
            <td class="p-3">
                <input type="number" class="gestao-status-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(status.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-status-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(status.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-status-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${status.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-status text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="gestao-delete-status text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.gestao-save-status').forEach(button => {
        button.addEventListener('click', () => saveGestaoProjectStatusRow(button.closest('tr')));
    });
    tbody.querySelectorAll('.gestao-delete-status').forEach(button => {
        button.addEventListener('click', () => deleteGestaoProjectStatusRow(button.closest('tr')));
    });
}

async function saveGestaoProjectStatusRow(row) {
    if (!row || !canAccessGestao()) return;

    const statusId = Number(row.dataset.statusId);
    const name = row.querySelector('.gestao-status-name')?.value.trim();
    const sortOrder = Number(row.querySelector('.gestao-status-sort')?.value) || 0;
    const isActive = Boolean(row.querySelector('.gestao-status-active')?.checked);

    if (!name) {
        alert('Informe o nome do status.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProjectStatus')
        .update({ name, sortOrder, isActive, updatedAt: now })
        .eq('id', statusId);

    if (error) {
        alert('Erro ao salvar status: ' + error.message);
        return;
    }

    await loadGestaoProjectStatusList();
}

async function deleteGestaoProjectStatusRow(row) {
    if (!row || !canAccessGestao()) return;

    const statusId = Number(row.dataset.statusId);
    const name = row.querySelector('.gestao-status-name')?.value.trim() || 'este status';

    const { count, error: countError } = await supabaseClient
        .from('OrderProject')
        .select('id', { count: 'exact', head: true })
        .eq('statusId', statusId);

    if (countError) {
        alert('Erro ao verificar uso do status: ' + countError.message);
        return;
    }

    if (count > 0) {
        alert(`O status "${name}" está em uso por ${count} projeto(s). Desative-o em vez de excluir.`);
        return;
    }

    if (!confirm(`Excluir o status "${name}"?`)) return;

    const { error } = await supabaseClient
        .from('OrderProjectStatus')
        .delete()
        .eq('id', statusId);

    if (error) {
        alert('Erro ao excluir status: ' + error.message);
        return;
    }

    await loadGestaoProjectStatusList();
}

async function addGestaoProjectStatus(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const name = document.getElementById('gestao-new-status-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-status-sort')?.value) || 0;

    if (!name) {
        alert('Informe o nome do status.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProjectStatus')
        .insert({
            name,
            sortOrder,
            isActive: true,
            updatedAt: now
        });

    if (error) {
        alert('Erro ao adicionar status: ' + error.message);
        return;
    }

    document.getElementById('gestao-new-status-form')?.reset();
    document.getElementById('gestao-new-status-sort').value = '0';
    await loadGestaoProjectStatusList();
}

function bindGestaoEvents() {
    document.getElementById('btn-gestao')?.addEventListener('click', showGestao);
    document.getElementById('btn-gestao-create-order')?.addEventListener('click', openGestaoCreateOrderForm);
    document.getElementById('btn-gestao-back-list')?.addEventListener('click', () => {
        editingGestaoOrderId = null;
        showGestaoPedidoListPanel();
    });
    document.getElementById('btn-gestao-cancel-order')?.addEventListener('click', () => {
        editingGestaoOrderId = null;
        showGestaoPedidoListPanel();
    });
    document.getElementById('btn-gestao-add-project')?.addEventListener('click', () => addGestaoProjectRow());
    document.getElementById('gestao-order-form')?.addEventListener('submit', saveGestaoOrder);
    document.getElementById('gestao-ord-code')?.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '');
    });
    document.getElementById('gestao-nav-pedido')?.addEventListener('click', () => {
        editingGestaoOrderId = null;
        showGestaoPedidoListPanel();
        loadGestaoOrdersList();
    });
    document.getElementById('gestao-nav-project-status')?.addEventListener('click', () => {
        editingGestaoOrderId = null;
        showGestaoProjectStatusPanel();
        loadGestaoProjectStatusList();
    });
    document.getElementById('gestao-nav-kanban')?.addEventListener('click', () => {
        editingGestaoOrderId = null;
        showGestaoKanbanPanel();
    });
    document.getElementById('btn-gestao-kanban-refresh')?.addEventListener('click', loadGestaoKanban);
    document.getElementById('btn-gestao-project-history-back')?.addEventListener('click', showGestaoKanbanPanel);
    document.getElementById('gestao-kanban-board')?.addEventListener('click', (event) => {
        const button = event.target.closest('.gestao-kanban-history-btn');
        if (!button) return;

        openGestaoProjectStatusHistory(getGestaoProjectHistoryContext(button.dataset.orderProjectId));
    });
    document.getElementById('gestao-new-status-form')?.addEventListener('submit', addGestaoProjectStatus);
}
