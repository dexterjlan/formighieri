let gestaoOrdersCache = [];
let orderProjectViewContext = null;
let gestaoEnvironmentTypesCache = [];
let gestaoProjetistasCache = [];
let gestaoProjectStatusesCache = [];
let gestaoMarceneirosCache = [];
let editingGestaoOrderId = null;
let gestaoOrderProjectsDraft = [];
let editingGestaoProjectDraftIndex = null;

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
        dashboard: document.getElementById('gestao-nav-dashboard'),
        kanban: document.getElementById('gestao-nav-kanban'),
        gantt: document.getElementById('gestao-nav-gantt'),
        relatorios: document.getElementById('gestao-nav-relatorios'),
        performance: document.getElementById('gestao-nav-performance')
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
    document.getElementById('gestao-project-form-panel')?.classList.add('hidden');
    document.getElementById('gestao-project-status-panel')?.classList.add('hidden');
    document.getElementById('gestao-marceneiros-panel')?.classList.add('hidden');
    document.getElementById('gestao-usuarios-panel')?.classList.add('hidden');
    document.getElementById('gestao-dashboard-panel')?.classList.add('hidden');
    document.getElementById('gestao-kanban-panel')?.classList.add('hidden');
    document.getElementById('gestao-gantt-panel')?.classList.add('hidden');
    document.getElementById('gestao-relatorios-panel')?.classList.add('hidden');
    document.getElementById('gestao-performance-panel')?.classList.add('hidden');
    document.getElementById('gestao-import-panel')?.classList.add('hidden');
    document.getElementById('gestao-project-history-panel')?.classList.add('hidden');
    if (typeof setGestaoDashboardFullscreen === 'function') {
        setGestaoDashboardFullscreen(false);
    }
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
    const activeStatuses = gestaoProjectStatusesCache.filter(status =>
        status.isActive !== false && !isSubstituidoStatusName(status.name)
    );
    const selectedStatus = gestaoProjectStatusesCache.find(status => String(status.id) === String(selectedId));
    const statuses = selectedStatus && isSubstituidoStatusName(selectedStatus.name)
        ? [...activeStatuses, selectedStatus]
        : activeStatuses;
    const defaultId = selectedId ?? getDefaultProjectStatusId();

    if (!statuses.length) {
        return '<option value="">Cadastre status em Gestão → Status de Projeto</option>';
    }

    return statuses.map(status => `
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

    input.addEventListener('input', async () => {
        const normalized = normalizeProjectCodeInput(input.value);
        if (input.value !== normalized) {
            input.value = normalized;
        }
    });
}

function getGestaoOrderClientDeliveryDate() {
    return document.getElementById('gestao-ord-client-delivery')?.value || '';
}

function getGestaoMaxProjectTechnicalDeliveryDate(orderDeliveryDate = getGestaoOrderClientDeliveryDate()) {
    if (!orderDeliveryDate) return '';
    const [year, month, day] = orderDeliveryDate.split('-').map(Number);
    if (!year || !month || !day) return '';

    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() - 1);

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function syncGestaoProjectTechnicalDeliveryConstraints() {
    const projectDelivery = document.getElementById('gestao-project-delivery');
    if (!projectDelivery) return;

    const orderDelivery = getGestaoOrderClientDeliveryDate();
    const maxDate = getGestaoMaxProjectTechnicalDeliveryDate(orderDelivery);

    if (maxDate) {
        projectDelivery.max = maxDate;
    } else {
        projectDelivery.removeAttribute('max');
    }
}

function applyGestaoProjectStatusReadonly() {
    const statusSelect = document.getElementById('gestao-project-status');
    if (!statusSelect) return;
    statusSelect.disabled = true;
}

function renderProjectViewComplementarChildrenList(children = []) {
    const listEl = document.getElementById('project-view-complementar-children-list');
    if (!listEl) return;

    if (!children.length) {
        listEl.innerHTML = '<p class="text-slate-500">—</p>';
        return;
    }

    listEl.innerHTML = children
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
        .map(child => {
            const code = normalizeProjectCodeInput(child.projectCode || '');
            const name = child.name || '—';
            const statusName = getGestaoProjectStatusName(child);
            const statusClass = getOrderProjectStatusBadgeClass(statusName);

            return `
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="font-mono text-slate-800">${escapeHtml(code)}</span>
                    <span class="text-slate-400">·</span>
                    <span class="text-slate-800">${escapeHtml(name)}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusClass}">${escapeHtml(statusName)}</span>
                </div>
            `;
        })
        .join('');
}

function findComplementarChildrenInCaches(parentProjectId) {
    const normalizedId = Number(parentProjectId);
    if (!normalizedId) return [];

    const matches = [];
    const seen = new Set();

    const addMatch = (project) => {
        if (!isComplementarOrderProject(project)) return;
        if (Number(project.parentProjectId) !== normalizedId) return;

        const key = Number(project.id) || `${project.projectCode || ''}-${project.name || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        matches.push(project);
    };

    if (Array.isArray(orderProjectsCache)) {
        orderProjectsCache.forEach(addMatch);
    }

    if (Array.isArray(gestaoOrderProjectsDraft)) {
        gestaoOrderProjectsDraft.forEach(addMatch);
    }

    return matches;
}

async function fetchComplementarChildrenForProject(parentProjectId) {
    const cached = findComplementarChildrenInCaches(parentProjectId);
    if (cached.length) return cached;

    const normalizedId = Number(parentProjectId);
    if (!normalizedId) return [];

    const selectVariants = [
        'id, projectCode, name, deliveryDate, statusId, isComplementar, parentProjectId, projectStatus:OrderProjectStatus(id, name)',
        'id, projectCode, name, isComplementar, parentProjectId'
    ];

    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .eq('parentProjectId', normalizedId)
            .eq('isComplementar', true);

        if (!error && Array.isArray(data)) {
            return data.map(item => {
                if (item.statusId && !item.projectStatus && gestaoProjectStatusesCache.length) {
                    item.projectStatus = gestaoProjectStatusesCache.find(status => status.id === item.statusId) || null;
                }
                return item;
            });
        }

        if (error?.message?.includes('isComplementar') || error?.message?.includes('parentProjectId')) {
            break;
        }
    }

    return [];
}

function fillProjectViewModal(project = {}, complementarChildren = []) {
    const statusName = getGestaoProjectStatusName(project);
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value || '—';
    };

    setText('project-view-code', normalizeProjectCodeInput(project.projectCode || ''));
    setText('project-view-name', project.name || '—');
    setText('project-view-environment', project.environmentType?.name || '—');
    setText('project-view-delivery', typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.deliveryDate)
        : (project.deliveryDate || '—'));
    setText('project-view-previsao-conclusao', typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.previsaoConclusaoProjetoTecnico)
        : (project.previsaoConclusaoProjetoTecnico || '—'));
    setText('project-view-conclusao-projeto-tecnico', typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.conclusaoProjetoTecnico)
        : (project.conclusaoProjetoTecnico || '—'));
    setText('project-view-status', statusName);
    setText('project-view-designer', project.designer?.name || '—');
    setText('project-view-caminho-rede', project.caminhoRedeAprovacao || '—');

    const childWrap = document.getElementById('project-view-complementar-child-wrap');
    const parentWrap = document.getElementById('project-view-complementar-parent-wrap');
    const isComplementar = isComplementarOrderProject(project);

    childWrap?.classList.toggle('hidden', !isComplementar);
    parentWrap?.classList.toggle('hidden', isComplementar || !complementarChildren.length);

    if (isComplementar) {
        setText(
            'project-view-parent-code',
            project.parentProject?.projectCode || project.parentProjectCode || '—'
        );
        setText(
            'project-view-parent-order',
            project.parentProject?.order?.orderCode || getComplementarParentOrderCode(project) || '—'
        );
    } else {
        renderProjectViewComplementarChildrenList(complementarChildren);
    }

    const substituidoWrap = document.getElementById('project-view-substituido-wrap');
    const substituicaoWrap = document.getElementById('project-view-substituicao-wrap');
    const isSubstituido = isSubstituidoOrderProject(project);
    const isSubstituicao = isSubstituicaoOrderProject(project);

    substituidoWrap?.classList.toggle('hidden', !isSubstituido);
    substituicaoWrap?.classList.toggle('hidden', !isSubstituicao);

    if (isSubstituido) {
        setText(
            'project-view-substituido-por-code',
            getSubstituidoPorProjectCode(project) || '—'
        );
        setText(
            'project-view-substituido-por-order',
            getSubstituidoPorOrderCode(project) || '—'
        );
    }

    if (isSubstituicao) {
        setText(
            'project-view-substitui-code',
            getSubstituiProjectCode(project) || '—'
        );
        setText(
            'project-view-substitui-order',
            getSubstituiOrderCode(project) || '—'
        );
    }
}

async function fetchProjectDetailsForView(projectId) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return null;

    const selectVariants = [
        'id, orderId, projectCode, name, saleValue, deliveryDate, previsaoConclusaoProjetoTecnico, conclusaoProjetoTecnico, statusId, designerId, caminhoRedeAprovacao, isComplementar, parentProjectId, isSubstituido, substituidoPorProjectId, isSubstituicao, substituiProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), designer:appUsers!OrderProject_designerId_fkey(id, name), order:salesOrders(orderCode, clientName), parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), substituidoPor:substituidoPorProjectId(projectCode, order:salesOrders(orderCode)), substitui:substituiProjectId(projectCode, saleValue, order:salesOrders(orderCode))',
        'id, orderId, projectCode, name, saleValue, deliveryDate, statusId, designerId, caminhoRedeAprovacao, isComplementar, parentProjectId, isSubstituido, substituidoPorProjectId, isSubstituicao, substituiProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), designer:appUsers!OrderProject_designerId_fkey(id, name), order:salesOrders(orderCode, clientName), parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), substituidoPor:substituidoPorProjectId(projectCode, order:salesOrders(orderCode)), substitui:substituiProjectId(projectCode, saleValue, order:salesOrders(orderCode))',
        'id, orderId, projectCode, name, saleValue, deliveryDate, statusId, designerId, caminhoRedeAprovacao, isComplementar, parentProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)'
    ];

    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .eq('id', normalizedId)
            .maybeSingle();

        if (!error && data) {
            if (data.statusId && !data.projectStatus && gestaoProjectStatusesCache.length) {
                data.projectStatus = gestaoProjectStatusesCache.find(item => item.id === data.statusId) || null;
            }
            return data;
        }
    }

    return null;
}

async function openProjectViewModal(projectOrId) {
    let project = projectOrId;

    if (typeof projectOrId === 'number' || (typeof projectOrId === 'string' && projectOrId)) {
        const cached = typeof fetchOrderProjectsForOrder === 'function' && Array.isArray(orderProjectsCache)
            ? orderProjectsCache.find(item => Number(item.id) === Number(projectOrId))
            : null;
        project = cached || await fetchProjectDetailsForView(projectOrId);
    }

    if (!project) {
        alertAppDialog('Projeto não encontrado.');
        return;
    }

    if (!project.designer?.name && project.designerId) {
        const enriched = await fetchProjectDetailsForView(project.id);
        if (enriched) project = enriched;
    }

    const complementarChildren = isComplementarOrderProject(project)
        ? []
        : await fetchComplementarChildrenForProject(project.id);

    fillProjectViewModal(project, complementarChildren);
    orderProjectViewContext = typeof buildProjectStatusHistoryContext === 'function'
        ? buildProjectStatusHistoryContext(project)
        : null;
    toggleModal('order-project-view-modal', true);
}

window.openProjectViewModal = openProjectViewModal;

function bindGestaoComplementarToggle() {
    const checkbox = document.getElementById('gestao-project-complementar');
    const parentInput = document.getElementById('gestao-project-parent-code');
    const statusSelect = document.getElementById('gestao-project-status');
    if (!checkbox || !parentInput || !statusSelect) return;

    const isComplementar = checkbox.checked;
    parentInput.disabled = !isComplementar;
    if (!isComplementar) {
        parentInput.value = '';
    }
    parentInput.required = isComplementar;
    applyGestaoProjectStatusReadonly();
}

function bindGestaoSubstituidoToggle() {
    const checkbox = document.getElementById('gestao-project-substituido');
    const replacementInput = document.getElementById('gestao-project-substituido-por-code');
    const statusSelect = document.getElementById('gestao-project-status');
    const complementarCheckbox = document.getElementById('gestao-project-complementar');
    if (!checkbox || !replacementInput || !statusSelect) return;

    const isSubstituido = checkbox.checked;
    replacementInput.disabled = !isSubstituido;
    if (!isSubstituido) {
        replacementInput.value = '';
    }
    replacementInput.required = isSubstituido;

    if (isSubstituido) {
        const substituidoStatusId = getSubstituidoStatusId(gestaoProjectStatusesCache);
        if (substituidoStatusId) {
            statusSelect.value = String(substituidoStatusId);
        }
        if (complementarCheckbox) complementarCheckbox.checked = false;
        bindGestaoComplementarToggle();
    }
    applyGestaoProjectStatusReadonly();
}

function bindGestaoProjectRelationToggles(project = {}) {
    const locked = isSubstituidoOrderProject(project);
    const relationInputs = [
        'gestao-project-complementar',
        'gestao-project-parent-code',
        'gestao-project-substituido',
        'gestao-project-substituido-por-code',
        'gestao-project-status',
        'gestao-project-code',
        'gestao-project-name',
        'gestao-project-environment',
        'gestao-project-sale-value',
        'gestao-project-delivery',
        'gestao-project-caminho-rede-aprovacao'
    ];

    if (locked) {
        relationInputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.disabled = true;
        });
        document.getElementById('gestao-project-form-submit')?.setAttribute('disabled', 'disabled');
        return;
    }

    document.getElementById('gestao-project-form-submit')?.removeAttribute('disabled');
    bindGestaoComplementarToggle();
    bindGestaoSubstituidoToggle();
}

function getGestaoProjectStatusName(project) {
    if (!project) return '—';
    if (project.projectStatus?.name) return project.projectStatus.name;
    const status = gestaoProjectStatusesCache.find(item => Number(item.id) === Number(project.statusId));
    return status?.name || '—';
}

function populateGestaoProjectFormSelects(project = {}) {
    const environmentSelect = document.getElementById('gestao-project-environment');
    if (environmentSelect) {
        environmentSelect.innerHTML = '<option value="">Selecione...</option>'
            + getEnvironmentOptionsHtml(project.environmentTypeId);
    }

    const statusSelect = document.getElementById('gestao-project-status');
    if (statusSelect) {
        statusSelect.innerHTML = getOrderProjectStatusOptionsHtml(resolveGestaoProjectStatusId(project));
    }
}

function resetGestaoProjectForm() {
    document.getElementById('gestao-project-form')?.reset();
    populateGestaoProjectFormSelects();
    document.getElementById('gestao-project-parent-code').disabled = true;
    document.getElementById('gestao-project-parent-code').required = false;
    document.getElementById('gestao-project-substituido-por-code').disabled = true;
    document.getElementById('gestao-project-substituido-por-code').required = false;
    document.getElementById('gestao-project-substituido').checked = false;
    document.getElementById('btn-gestao-remove-project')?.classList.add('hidden');
    syncGestaoProjectTechnicalDeliveryConstraints();
    applyGestaoProjectStatusReadonly();
}

function fillGestaoProjectForm(project = {}) {
    document.getElementById('gestao-project-code').value = normalizeProjectCodeInput(project.projectCode || '');
    document.getElementById('gestao-project-name').value = project.name || '';
    document.getElementById('gestao-project-sale-value').value = formatSaleValueAsCurrencyInput(project.saleValue);
    document.getElementById('gestao-project-delivery').value = toGestaoInputDate(project.deliveryDate);
    document.getElementById('gestao-project-caminho-rede-aprovacao').value = project.caminhoRedeAprovacao || '';
    document.getElementById('gestao-project-complementar').checked = Boolean(project.isComplementar);
    document.getElementById('gestao-project-parent-code').value = normalizeProjectCodeInput(
        project.parentProject?.projectCode || project.parentProjectCode || ''
    );
    document.getElementById('gestao-project-substituido').checked = Boolean(project.isSubstituido);
    document.getElementById('gestao-project-substituido-por-code').value = normalizeProjectCodeInput(
        project.substituidoPorProject?.projectCode || project.substituidoPorProjectCode || ''
    );

    populateGestaoProjectFormSelects(project);
    syncGestaoProjectTechnicalDeliveryConstraints();
    bindGestaoProjectRelationToggles(project);
}

function collectGestaoProjectFormData() {
    const existing = editingGestaoProjectDraftIndex != null
        ? gestaoOrderProjectsDraft[editingGestaoProjectDraftIndex]
        : null;

    return {
        id: editingGestaoProjectDraftIndex != null
            ? (gestaoOrderProjectsDraft[editingGestaoProjectDraftIndex]?.id || null)
            : null,
        projectCode: normalizeProjectCodeInput(document.getElementById('gestao-project-code')?.value || ''),
        name: document.getElementById('gestao-project-name')?.value.trim() || '',
        environmentTypeId: Number(document.getElementById('gestao-project-environment')?.value) || null,
        saleValue: parseSaleValueInput(document.getElementById('gestao-project-sale-value')?.value),
        deliveryDate: document.getElementById('gestao-project-delivery')?.value || null,
        statusId: Number(document.getElementById('gestao-project-status')?.value) || getDefaultProjectStatusId(),
        designerId: existing?.designerId ?? null,
        previsaoConclusaoProjetoTecnico: existing?.previsaoConclusaoProjetoTecnico ?? null,
        caminhoRedeAprovacao: document.getElementById('gestao-project-caminho-rede-aprovacao')?.value?.trim() || null,
        isComplementar: Boolean(document.getElementById('gestao-project-complementar')?.checked),
        parentProjectCode: normalizeProjectCodeInput(document.getElementById('gestao-project-parent-code')?.value || ''),
        isSubstituido: Boolean(document.getElementById('gestao-project-substituido')?.checked),
        substituidoPorProjectCode: normalizeProjectCodeInput(document.getElementById('gestao-project-substituido-por-code')?.value || ''),
        isSubstituicao: Boolean(existing?.isSubstituicao),
        substituiProjectId: existing?.substituiProjectId || null,
        substituiProjectCode: normalizeProjectCodeInput(
            existing?.substituiProject?.projectCode || existing?.substituiProjectCode || ''
        ),
        substituiProject: existing?.substituiProject || null,
        substituiOriginalSaleValue: existing?.substituiOriginalSaleValue,
        parentProject: editingGestaoProjectDraftIndex != null
            ? gestaoOrderProjectsDraft[editingGestaoProjectDraftIndex]?.parentProject || null
            : null
    };
}

function renderGestaoProjectsSummaryList() {
    const tbody = document.getElementById('gestao-projects-rows');
    if (!tbody) return;

    tbody.innerHTML = '';

    gestaoOrderProjectsDraft.forEach((project, index) => {
        const statusName = getGestaoProjectStatusName(project);
        const statusClass = getOrderProjectStatusBadgeClass(statusName);
        const saleValueDisplay = formatSaleValue(project.saleValue);
        const tr = document.createElement('tr');
        tr.className = 'gestao-project-summary-row';
        tr.innerHTML = `
            <td class="p-3 font-medium text-slate-800">${escapeHtml(project.name || '—')}</td>
            <td class="p-3">
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(statusName)}</span>
            </td>
            <td class="p-3 text-slate-600 whitespace-nowrap">${formatGestaoDate(project.deliveryDate)}</td>
            <td class="p-3 text-slate-600 whitespace-nowrap">${escapeHtml(saleValueDisplay)}</td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-view-project-btn text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium">
                        Detalhes
                    </button>
                    <button type="button" class="gestao-edit-project-btn text-xs bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50 px-2.5 py-1 rounded-lg font-medium">
                        Editar
                    </button>
                </div>
            </td>
        `;

        tr.querySelector('.gestao-view-project-btn')?.addEventListener('click', () => {
            openProjectViewModal(project);
        });

        tr.querySelector('.gestao-edit-project-btn')?.addEventListener('click', () => {
            openGestaoProjectForm(index);
        });

        tbody.appendChild(tr);
    });

    updateGestaoProjectsEmptyState();
}

function clearGestaoOrderProjectsDraft() {
    gestaoOrderProjectsDraft = [];
    editingGestaoProjectDraftIndex = null;
    renderGestaoProjectsSummaryList();
}

function setGestaoOrderProjectsDraft(projects = []) {
    gestaoOrderProjectsDraft = (projects || []).map(project => ({ ...project }));
    editingGestaoProjectDraftIndex = null;
    renderGestaoProjectsSummaryList();
}

async function openGestaoProjectForm(index = null) {
    if (!canAccessGestao()) return;

    editingGestaoProjectDraftIndex = index;
    await loadGestaoFormOptions();
    resetGestaoProjectForm();

    const title = document.getElementById('gestao-project-form-title');
    const removeBtn = document.getElementById('btn-gestao-remove-project');

    if (index != null && gestaoOrderProjectsDraft[index]) {
        if (title) title.textContent = 'Editar Projeto';
        fillGestaoProjectForm(gestaoOrderProjectsDraft[index]);
        removeBtn?.classList.remove('hidden');
    } else {
        if (title) title.textContent = 'Novo Projeto';
        const defaultStatusId = getDefaultProjectStatusId();
        if (defaultStatusId) {
            document.getElementById('gestao-project-status').value = String(defaultStatusId);
        }
        syncGestaoProjectTechnicalDeliveryConstraints();
        bindGestaoProjectRelationToggles();
    }

    showGestaoProjectFormPanel();
}

function showGestaoProjectFormPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-project-form-panel')?.classList.remove('hidden');
    setGestaoNavActive('pedido');
}

function saveGestaoProjectDraft(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    saveGestaoProjectDraftAsync();
}

async function saveGestaoProjectDraftAsync() {
    const project = collectGestaoProjectFormData();

    if (!project.projectCode || !project.name || !project.environmentTypeId || !project.statusId) {
        alertAppDialog('Preencha código, nome, ambiente e status do projeto.');
        return;
    }

    if (!isNumericProjectCode(project.projectCode)) {
        alertAppDialog('O código do projeto deve conter somente números.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (project.isComplementar && !project.parentProjectCode) {
        alertAppDialog('Informe o código do projeto pai para projetos complementares.');
        return;
    }

    if (project.isSubstituido && !project.substituidoPorProjectCode) {
        alertAppDialog('Informe o código do projeto substituto.');
        return;
    }

    if (project.isComplementar && project.isSubstituido) {
        alertAppDialog('O projeto não pode ser complementar e substituído ao mesmo tempo.');
        return;
    }

    if (project.isSubstituido && !canMarkProjectAsSubstituido(
        editingGestaoProjectDraftIndex != null
            ? gestaoOrderProjectsDraft[editingGestaoProjectDraftIndex]
            : project
    )) {
        alertAppDialog('Este projeto só pode ser marcado como substituído até "Aguardando Projeto Técnico".', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (Number.isNaN(project.saleValue)) {
        alertAppDialog('Informe um valor de venda válido.');
        return;
    }

    const orderDeliveryDate = getGestaoOrderClientDeliveryDate();
    if (project.deliveryDate && orderDeliveryDate
        && !isProjectTechnicalDeliveryBeforeOrderDelivery(project.deliveryDate, orderDeliveryDate)) {
        alertAppDialog('A data de entrega do projeto técnico deve ser anterior à data de entrega do pedido.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const duplicateCodeIndex = gestaoOrderProjectsDraft.findIndex((item, itemIndex) =>
        item.projectCode === project.projectCode && itemIndex !== editingGestaoProjectDraftIndex
    );
    if (duplicateCodeIndex !== -1) {
        alertAppDialog('Já existe outro projeto neste pedido com o mesmo código.');
        return;
    }

    if (project.isComplementar && project.parentProjectCode) {
        const parents = await fetchGestaoParentProjectsByCodes([project.parentProjectCode]);
        const parent = parents[project.parentProjectCode];
        if (parent) {
            project.parentProject = {
                projectCode: parent.projectCode,
                order: parent.order || null
            };
        }
    }

    if (project.isSubstituido && project.substituidoPorProjectCode) {
        const replacements = await fetchGestaoParentProjectsByCodes([project.substituidoPorProjectCode]);
        const replacement = replacements[project.substituidoPorProjectCode];
        if (replacement) {
            project.substituidoPorProject = {
                projectCode: replacement.projectCode,
                order: replacement.order || null
            };
        }
    }

    if (project.isSubstituido) {
        const substituidoStatusId = getSubstituidoStatusId();
        if (substituidoStatusId) {
            project.statusId = substituidoStatusId;
            project.projectStatus = gestaoProjectStatusesCache.find(status => status.id === substituidoStatusId) || {
                id: substituidoStatusId,
                name: SUBSTITUIDO_STATUS_NAME
            };
        }
    }

    if (editingGestaoProjectDraftIndex != null) {
        gestaoOrderProjectsDraft[editingGestaoProjectDraftIndex] = {
            ...gestaoOrderProjectsDraft[editingGestaoProjectDraftIndex],
            ...project
        };
    } else {
        gestaoOrderProjectsDraft.push(project);
    }

    editingGestaoProjectDraftIndex = null;
    renderGestaoProjectsSummaryList();
    showGestaoPedidoFormPanel();
}

async function removeGestaoProjectDraft() {
    if (editingGestaoProjectDraftIndex == null) return;

    const project = gestaoOrderProjectsDraft[editingGestaoProjectDraftIndex];
    const confirmed = await confirmAppDialog(
        `Remover o projeto "${project?.name || 'sem nome'}" deste pedido?`,
        { title: 'Remover projeto', confirmLabel: 'Remover' }
    );
    if (!confirmed) return;

    gestaoOrderProjectsDraft.splice(editingGestaoProjectDraftIndex, 1);
    editingGestaoProjectDraftIndex = null;
    renderGestaoProjectsSummaryList();
    showGestaoPedidoFormPanel();
}

window.openGestaoProjectForm = openGestaoProjectForm;

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
        alertAppDialog('Somente administradores podem gerenciar usuários.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    hideAllGestaoPanels();
    document.getElementById('gestao-usuarios-panel')?.classList.remove('hidden');
    setGestaoNavActive('usuarios');

    if (typeof loadUsersAdminList === 'function') {
        loadUsersAdminList();
    }
}

function showGestaoDashboardPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-dashboard-panel')?.classList.remove('hidden');
    setGestaoNavActive('dashboard');
    if (typeof loadGestaoDashboard === 'function') {
        loadGestaoDashboard();
    }
}

function showGestaoKanbanPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-kanban-panel')?.classList.remove('hidden');
    setGestaoNavActive('kanban');
    loadGestaoKanban();
}

function showGestaoGanttPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-gantt-panel')?.classList.remove('hidden');
    setGestaoNavActive('gantt');
    if (typeof loadGestaoGantt === 'function') {
        loadGestaoGantt();
    }
}

function showGestaoRelatoriosPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-relatorios-panel')?.classList.remove('hidden');
    setGestaoNavActive('relatorios');
    if (typeof loadGestaoRelatorios === 'function') {
        loadGestaoRelatorios();
    }
}

function showGestaoPerformancePanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-performance-panel')?.classList.remove('hidden');
    setGestaoNavActive('performance');
    if (typeof loadGestaoPerformance === 'function') {
        loadGestaoPerformance();
    }
}

function showGestao() {
    if (!canAccessGestao()) {
        alertAppDialog('Somente administradores e gestores podem acessar a Gestão.', { variant: 'warning', title: 'Aviso' });
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
    document.getElementById('btn-gestao-back-list')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoPedidoListPanel();
    });
    document.getElementById('btn-gestao-cancel-order')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoPedidoListPanel();
    });
    document.getElementById('btn-gestao-add-project')?.addEventListener('click', () => openGestaoProjectForm());
    document.getElementById('gestao-order-form')?.addEventListener('submit', saveGestaoOrder);
    document.getElementById('gestao-project-form')?.addEventListener('submit', saveGestaoProjectDraft);
    document.getElementById('btn-gestao-back-order-form')?.addEventListener('click', () => {
        editingGestaoProjectDraftIndex = null;
        showGestaoPedidoFormPanel();
    });
    document.getElementById('btn-gestao-cancel-project')?.addEventListener('click', () => {
        editingGestaoProjectDraftIndex = null;
        showGestaoPedidoFormPanel();
    });
    document.getElementById('btn-gestao-remove-project')?.addEventListener('click', removeGestaoProjectDraft);
    bindGestaoProjectCodeInput(document.getElementById('gestao-project-code'));
    bindGestaoProjectCodeInput(document.getElementById('gestao-project-parent-code'));
    bindGestaoProjectCodeInput(document.getElementById('gestao-project-substituido-por-code'));
    bindSaleValueCurrencyInput(document.getElementById('gestao-project-sale-value'));
    document.getElementById('gestao-ord-client-delivery')?.addEventListener('change', syncGestaoProjectTechnicalDeliveryConstraints);
    document.getElementById('gestao-project-complementar')?.addEventListener('change', () => {
        if (document.getElementById('gestao-project-complementar')?.checked) {
            document.getElementById('gestao-project-substituido').checked = false;
        }
        bindGestaoProjectRelationToggles();
    });
    document.getElementById('gestao-project-substituido')?.addEventListener('change', bindGestaoProjectRelationToggles);
    document.getElementById('btn-close-order-project-view')?.addEventListener('click', () => {
        toggleModal('order-project-view-modal', false);
        orderProjectViewContext = null;
    });
    document.getElementById('btn-close-order-project-view-footer')?.addEventListener('click', () => {
        toggleModal('order-project-view-modal', false);
        orderProjectViewContext = null;
    });
    document.getElementById('btn-order-project-status-history')?.addEventListener('click', () => {
        if (!orderProjectViewContext) return;
        if (typeof openProjectStatusHistoryModal === 'function') {
            openProjectStatusHistoryModal(orderProjectViewContext);
        }
    });
    document.getElementById('btn-close-project-status-history')?.addEventListener('click', () => {
        toggleModal('order-project-status-history-modal', false);
    });
    document.getElementById('btn-close-project-status-history-footer')?.addEventListener('click', () => {
        toggleModal('order-project-status-history-modal', false);
    });
    document.getElementById('gestao-ord-code')?.addEventListener('input', async function () {
        this.value = this.value.replace(/\D/g, '');
    });
    document.getElementById('gestao-nav-cadastros-toggle')?.addEventListener('click', async () => {
        const items = document.getElementById('gestao-nav-cadastros-items');
        if (!items) return;
        setGestaoCadastrosNavExpanded(items.classList.contains('hidden'));
    });
    document.getElementById('gestao-nav-pedido')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoPedidoListPanel();
        loadGestaoOrdersList();
    });
    document.getElementById('gestao-nav-project-status')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoProjectStatusPanel();
        loadGestaoProjectStatusList();
    });
    document.getElementById('gestao-nav-marceneiros')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoMarceneirosPanel();
        loadGestaoMarceneirosList();
    });
    document.getElementById('gestao-nav-usuarios')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoUsuariosPanel();
    });
    document.getElementById('gestao-nav-dashboard')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoDashboardPanel();
    });
    document.getElementById('gestao-nav-kanban')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoKanbanPanel();
    });
    document.getElementById('gestao-nav-gantt')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoGanttPanel();
    });
    document.getElementById('gestao-nav-relatorios')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoRelatoriosPanel();
    });
    document.getElementById('gestao-nav-performance')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoPerformancePanel();
    });
    document.getElementById('btn-gestao-kanban-refresh')?.addEventListener('click', loadGestaoKanban);
    document.getElementById('btn-gestao-project-history-back')?.addEventListener('click', showGestaoKanbanPanel);
    document.getElementById('gestao-kanban-board')?.addEventListener('click', async (event) => {
        const button = event.target.closest('.gestao-kanban-history-btn');
        if (!button) return;

        openGestaoProjectStatusHistory(getGestaoProjectHistoryContext(button.dataset.orderProjectId));
    });
    document.getElementById('gestao-new-status-form')?.addEventListener('submit', addGestaoProjectStatus);
    document.getElementById('gestao-new-marceneiro-form')?.addEventListener('submit', addGestaoMarceneiro);
    if (typeof bindGestaoRelatoriosEvents === 'function') {
        bindGestaoRelatoriosEvents();
    }
    if (typeof bindGestaoPerformanceEvents === 'function') {
        bindGestaoPerformanceEvents();
    }
    if (typeof bindGestaoImportEvents === 'function') {
        bindGestaoImportEvents();
    }
    if (typeof bindGestaoGanttEvents === 'function') {
        bindGestaoGanttEvents();
    }
    if (typeof bindGestaoDashboardEvents === 'function') {
        bindGestaoDashboardEvents();
    }
}
