let gestaoOrdersCache = [];
let gestaoEnvironmentTypesCache = [];
let gestaoProjetistasCache = [];
let gestaoProjectStatusesCache = [];
let gestaoMarceneirosCache = [];
let editingGestaoOrderId = null;

const GESTAO_NAV_ACTIVE_CLASS = 'gestao-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100';
const GESTAO_NAV_INACTIVE_CLASS = 'gestao-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-transparent';
const GESTAO_NAV_SUB_ACTIVE_CLASS = 'gestao-nav-sub-item w-full text-left pl-3 pr-2 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100';
const GESTAO_NAV_SUB_INACTIVE_CLASS = 'gestao-nav-sub-item w-full text-left pl-3 pr-2 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-50 border border-transparent';
const GESTAO_CADASTRO_NAV_KEYS = ['pedido', 'project-status', 'marceneiros', 'usuarios'];
const GESTAO_NAV_CADASTROS_TOGGLE_ACTIVE_CLASS = 'gestao-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-indigo-800 bg-indigo-50/50 border border-indigo-100 flex items-center justify-between gap-2';
const GESTAO_NAV_CADASTROS_TOGGLE_INACTIVE_CLASS = 'gestao-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-transparent flex items-center justify-between gap-2';

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

function setGestaoCadastrosNavExpanded(expanded) {
    const items = document.getElementById('gestao-nav-cadastros-items');
    const chevron = document.getElementById('gestao-nav-cadastros-chevron');
    if (!items) return;

    items.classList.toggle('hidden', !expanded);
    if (chevron) chevron.textContent = expanded ? '▼' : '▶';
}

function setGestaoNavActive(navKey) {
    const navMap = {
        pedido: document.getElementById('gestao-nav-pedido'),
        'project-status': document.getElementById('gestao-nav-project-status'),
        marceneiros: document.getElementById('gestao-nav-marceneiros'),
        usuarios: document.getElementById('gestao-nav-usuarios'),
        kanban: document.getElementById('gestao-nav-kanban'),
        relatorios: document.getElementById('gestao-nav-relatorios')
    };

    Object.entries(navMap).forEach(([key, button]) => {
        if (!button) return;

        const isSubItem = GESTAO_CADASTRO_NAV_KEYS.includes(key);
        const activeClass = isSubItem ? GESTAO_NAV_SUB_ACTIVE_CLASS : GESTAO_NAV_ACTIVE_CLASS;
        const inactiveClass = isSubItem ? GESTAO_NAV_SUB_INACTIVE_CLASS : GESTAO_NAV_INACTIVE_CLASS;
        button.className = key === navKey ? activeClass : inactiveClass;
    });

    const cadastrosActive = GESTAO_CADASTRO_NAV_KEYS.includes(navKey);
    const cadastrosToggle = document.getElementById('gestao-nav-cadastros-toggle');

    if (cadastrosActive) {
        setGestaoCadastrosNavExpanded(true);
    }

    if (cadastrosToggle) {
        cadastrosToggle.className = cadastrosActive
            ? GESTAO_NAV_CADASTROS_TOGGLE_ACTIVE_CLASS
            : GESTAO_NAV_CADASTROS_TOGGLE_INACTIVE_CLASS;
    }
}

function updateGestaoCadastrosNavVisibility() {
    document.getElementById('gestao-nav-usuarios')?.classList.toggle('hidden', !isAdmin());
}

function hideAllGestaoPanels() {
    document.getElementById('gestao-pedido-list-panel')?.classList.add('hidden');
    document.getElementById('gestao-pedido-form-panel')?.classList.add('hidden');
    document.getElementById('gestao-project-status-panel')?.classList.add('hidden');
    document.getElementById('gestao-marceneiros-panel')?.classList.add('hidden');
    document.getElementById('gestao-usuarios-panel')?.classList.add('hidden');
    document.getElementById('gestao-kanban-panel')?.classList.add('hidden');
    document.getElementById('gestao-relatorios-panel')?.classList.add('hidden');
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
            <input type="text" class="gestao-project-sale-value w-full px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600"
                value="${escapeHtml(formatSaleValueForInput(project.saleValue))}" placeholder="0,00" inputmode="decimal">
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
        saleValue: parseSaleValueInput(row.querySelector('.gestao-project-sale-value')?.value),
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

function showGestaoMarceneirosPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-marceneiros-panel')?.classList.remove('hidden');
    setGestaoNavActive('marceneiros');
}

function showGestaoUsuariosPanel() {
    if (!isAdmin()) {
        alert('Somente administradores podem gerenciar usuários.');
        return;
    }

    hideAllGestaoPanels();
    document.getElementById('gestao-usuarios-panel')?.classList.remove('hidden');
    setGestaoNavActive('usuarios');

    if (typeof loadUsersAdminList === 'function') {
        loadUsersAdminList();
    }
}

function showGestaoKanbanPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-kanban-panel')?.classList.remove('hidden');
    setGestaoNavActive('kanban');
    loadGestaoKanban();
}

function showGestaoRelatoriosPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-relatorios-panel')?.classList.remove('hidden');
    setGestaoNavActive('relatorios');
    if (typeof loadGestaoRelatorios === 'function') {
        loadGestaoRelatorios();
    }
}

function showGestao() {
    if (!canAccessGestao()) {
        alert('Somente administradores e gestores podem acessar a Gestão.');
        return;
    }

    if (typeof hideSubViews === 'function') hideSubViews();
    document.getElementById('gestao-view')?.classList.remove('hidden');
    if (typeof updateMainNavActive === 'function') updateMainNavActive('gestao');
    if (typeof updateAdminNav === 'function') updateAdminNav();
    updateGestaoCadastrosNavVisibility();

    showGestaoPedidoListPanel();
    loadGestaoOrdersList();
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
    document.getElementById('gestao-nav-cadastros-toggle')?.addEventListener('click', () => {
        const items = document.getElementById('gestao-nav-cadastros-items');
        if (!items) return;
        setGestaoCadastrosNavExpanded(items.classList.contains('hidden'));
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
    document.getElementById('gestao-nav-marceneiros')?.addEventListener('click', () => {
        editingGestaoOrderId = null;
        showGestaoMarceneirosPanel();
        loadGestaoMarceneirosList();
    });
    document.getElementById('gestao-nav-usuarios')?.addEventListener('click', () => {
        editingGestaoOrderId = null;
        showGestaoUsuariosPanel();
    });
    document.getElementById('gestao-nav-kanban')?.addEventListener('click', () => {
        editingGestaoOrderId = null;
        showGestaoKanbanPanel();
    });
    document.getElementById('gestao-nav-relatorios')?.addEventListener('click', () => {
        editingGestaoOrderId = null;
        showGestaoRelatoriosPanel();
    });
    document.getElementById('btn-gestao-kanban-refresh')?.addEventListener('click', loadGestaoKanban);
    document.getElementById('btn-gestao-project-history-back')?.addEventListener('click', showGestaoKanbanPanel);
    document.getElementById('gestao-kanban-board')?.addEventListener('click', (event) => {
        const button = event.target.closest('.gestao-kanban-history-btn');
        if (!button) return;

        openGestaoProjectStatusHistory(getGestaoProjectHistoryContext(button.dataset.orderProjectId));
    });
    document.getElementById('gestao-new-status-form')?.addEventListener('submit', addGestaoProjectStatus);
    document.getElementById('gestao-new-marceneiro-form')?.addEventListener('submit', addGestaoMarceneiro);
    if (typeof bindGestaoRelatoriosEvents === 'function') {
        bindGestaoRelatoriosEvents();
    }
}
