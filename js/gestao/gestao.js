let gestaoOrdersCache = [];
let gestaoEnvironmentTypesCache = [];
let gestaoProjetistasCache = [];
let gestaoProjectStatusesCache = [];
let gestaoMarceneirosCache = [];
let gestaoMontadoresCache = [];
let gestaoProjectCharacteristicsCache = [];
let editingGestaoOrderId = null;
let gestaoOrderProjectsDraft = [];
let editingGestaoProjectDraftIndex = null;

const GESTAO_NAV_ACTIVE_CLASS = 'gestao-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100';
const GESTAO_NAV_INACTIVE_CLASS = 'gestao-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-transparent';
const GESTAO_NAV_SUB_ACTIVE_CLASS = 'gestao-nav-sub-item w-full text-left pl-3 pr-2 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100';
const GESTAO_NAV_SUB_INACTIVE_CLASS = 'gestao-nav-sub-item w-full text-left pl-3 pr-2 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-50 border border-transparent';
const GESTAO_CADASTRO_NAV_KEYS = ['pedido', 'project-status', 'alterar-status-projeto', 'clientes', 'marceneiros', 'montadores', 'characteristics', 'third-party-subtypes', 'compra-status', 'usuarios'];
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
        'alterar-status-projeto': document.getElementById('gestao-nav-alterar-status-projeto'),
        clientes: document.getElementById('gestao-nav-clientes'),
        marceneiros: document.getElementById('gestao-nav-marceneiros'),
        montadores: document.getElementById('gestao-nav-montadores'),
        characteristics: document.getElementById('gestao-nav-characteristics'),
        'third-party-subtypes': document.getElementById('gestao-nav-third-party-subtypes'),
        'compra-status': document.getElementById('gestao-nav-compra-status'),
        usuarios: document.getElementById('gestao-nav-usuarios'),
        'montagem-programacao': document.getElementById('gestao-nav-montagem-programacao'),
        'programacao-producao': document.getElementById('gestao-nav-programacao-producao'),
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

    if (typeof saveAppNavState === 'function') {
        saveAppNavState({ view: 'gestao', gestaoNav: navKey });
    }

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
    const clientesBtn = document.getElementById('gestao-nav-clientes');
    if (clientesBtn) {
        clientesBtn.classList.remove('hidden');
        clientesBtn.style.display = '';
    }
    document.getElementById('gestao-nav-usuarios')?.classList.toggle('hidden', !isAdmin());
    if (typeof updateMontagemProgramacaoNavVisibility === 'function') {
        updateMontagemProgramacaoNavVisibility();
    }
}

function hideAllGestaoPanels() {
    document.getElementById('gestao-pedido-list-panel')?.classList.add('hidden');
    document.getElementById('gestao-pedido-form-panel')?.classList.add('hidden');
    document.getElementById('gestao-project-form-panel')?.classList.add('hidden');
    document.getElementById('gestao-project-status-panel')?.classList.add('hidden');
    document.getElementById('gestao-alterar-status-projeto-panel')?.classList.add('hidden');
    document.getElementById('gestao-clientes-panel')?.classList.add('hidden');
    document.getElementById('gestao-marceneiros-panel')?.classList.add('hidden');
    document.getElementById('gestao-montadores-panel')?.classList.add('hidden');
    document.getElementById('gestao-characteristics-panel')?.classList.add('hidden');
    document.getElementById('gestao-third-party-subtypes-panel')?.classList.add('hidden');
    document.getElementById('gestao-compra-status-panel')?.classList.add('hidden');
    document.getElementById('gestao-montagem-programacao-panel')?.classList.add('hidden');
    document.getElementById('gestao-programacao-producao-panel')?.classList.add('hidden');
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
    if (typeof setGestaoKanbanFullscreen === 'function') {
        setGestaoKanbanFullscreen(false);
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

function isGestaoProjectVendido(project = {}) {
    const statusName = project.projectStatus?.name
        || gestaoProjectStatusesCache.find(
            status => String(status.id) === String(project.statusId)
        )?.name
        || '';
    return statusName === 'Vendido';
}

function syncGestaoProjectRemoveButtonVisibility(project = null) {
    const removeBtn = document.getElementById('btn-gestao-remove-project');
    if (!removeBtn) return;

    if (project && isGestaoProjectVendido(project)) {
        removeBtn.classList.remove('hidden');
        return;
    }

    removeBtn.classList.add('hidden');
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

function bindGestaoComplementarToggle() {
    const checkbox = document.getElementById('gestao-project-complementar');
    const parentCodeInput = document.getElementById('gestao-project-parent-code');
    const parentDisplayInput = document.getElementById('gestao-project-parent-display');
    const parentPickerBtn = document.getElementById('gestao-project-parent-picker-btn');
    const statusSelect = document.getElementById('gestao-project-status');
    const substituidoCheckbox = document.getElementById('gestao-project-substituido');
    if (!checkbox || !statusSelect) return;

    const isComplementar = checkbox.checked;

    if (isComplementar && substituidoCheckbox?.checked) {
        substituidoCheckbox.checked = false;
        bindGestaoSubstituidoToggle();
    }

    if (parentCodeInput) parentCodeInput.disabled = !isComplementar;
    if (parentDisplayInput) parentDisplayInput.disabled = !isComplementar;
    if (parentPickerBtn) parentPickerBtn.disabled = !isComplementar;

    if (!isComplementar) {
        if (parentCodeInput) parentCodeInput.value = '';
        if (parentDisplayInput) parentDisplayInput.value = '';
    }
    applyGestaoProjectStatusReadonly();
}

function bindGestaoSubstituidoToggle() {
    const checkbox = document.getElementById('gestao-project-substituido');
    const replacementCodeInput = document.getElementById('gestao-project-substituido-por-code');
    const replacementDisplayInput = document.getElementById('gestao-project-substituido-por-display');
    const replacementPickerBtn = document.getElementById('gestao-project-substituido-por-picker-btn');
    const statusSelect = document.getElementById('gestao-project-status');
    const complementarCheckbox = document.getElementById('gestao-project-complementar');
    if (!checkbox || !statusSelect) return;

    const isSubstituido = checkbox.checked;

    if (isSubstituido && complementarCheckbox?.checked) {
        complementarCheckbox.checked = false;
        bindGestaoComplementarToggle();
    }

    if (replacementCodeInput) replacementCodeInput.disabled = !isSubstituido;
    if (replacementDisplayInput) replacementDisplayInput.disabled = !isSubstituido;
    if (replacementPickerBtn) replacementPickerBtn.disabled = !isSubstituido;

    if (!isSubstituido) {
        if (replacementCodeInput) replacementCodeInput.value = '';
        if (replacementDisplayInput) replacementDisplayInput.value = '';
    }

    if (isSubstituido) {
        const substituidoStatusId = getSubstituidoStatusId(gestaoProjectStatusesCache);
        if (substituidoStatusId) {
            statusSelect.value = String(substituidoStatusId);
        }
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
        'gestao-project-phase',
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
    const phaseSelect = document.getElementById('gestao-project-phase');
    if (phaseSelect && !isSubstituidoOrderProject(project)) {
        phaseSelect.disabled = false;
    }
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
    const parentCodeInput = document.getElementById('gestao-project-parent-code');
    const parentDisplayInput = document.getElementById('gestao-project-parent-display');
    const parentPickerBtn = document.getElementById('gestao-project-parent-picker-btn');
    if (parentCodeInput) {
        parentCodeInput.value = '';
        parentCodeInput.disabled = true;
    }
    if (parentDisplayInput) {
        parentDisplayInput.value = '';
        parentDisplayInput.disabled = true;
    }
    if (parentPickerBtn) {
        parentPickerBtn.disabled = true;
    }

    const replacementCodeInput = document.getElementById('gestao-project-substituido-por-code');
    const replacementDisplayInput = document.getElementById('gestao-project-substituido-por-display');
    const replacementPickerBtn = document.getElementById('gestao-project-substituido-por-picker-btn');
    if (replacementCodeInput) {
        replacementCodeInput.value = '';
        replacementCodeInput.disabled = true;
    }
    if (replacementDisplayInput) {
        replacementDisplayInput.value = '';
        replacementDisplayInput.disabled = true;
    }
    if (replacementPickerBtn) {
        replacementPickerBtn.disabled = true;
    }

    document.getElementById('gestao-project-substituido').checked = false;
    document.getElementById('btn-gestao-remove-project')?.classList.add('hidden');
    if (typeof resetGestaoProjectCharacteristicsForm === 'function') {
        resetGestaoProjectCharacteristicsForm();
    }
    syncGestaoProjectTechnicalDeliveryConstraints();
    applyGestaoProjectStatusReadonly();
    syncGestaoProjectPhaseFieldVisibility();
}

async function lookupAndSetParentProjectDisplay(parentCode) {
    if (!parentCode) return;
    const { data: parentProj } = await supabaseClient
        .from('OrderProject')
        .select('id, projectCode, name, order:salesOrders(orderCode)')
        .eq('projectCode', parentCode)
        .maybeSingle();

    if (parentProj) {
        const orderCode = parentProj.order?.orderCode || '';
        const name = parentProj.name || '';
        const displayEl = document.getElementById('gestao-project-parent-display');
        if (displayEl && document.getElementById('gestao-project-parent-code')?.value === parentCode) {
            displayEl.value = (orderCode && name) ? `${orderCode} - ${name}` : (name || parentCode);
        }
    }
}

async function lookupAndSetSubstituidoPorProjectDisplay(code) {
    if (!code) return;
    const { data: proj } = await supabaseClient
        .from('OrderProject')
        .select('id, projectCode, name, order:salesOrders(orderCode)')
        .eq('projectCode', code)
        .maybeSingle();

    if (proj) {
        const orderCode = proj.order?.orderCode || '';
        const name = proj.name || '';
        const displayEl = document.getElementById('gestao-project-substituido-por-display');
        if (displayEl && document.getElementById('gestao-project-substituido-por-code')?.value === code) {
            displayEl.value = (orderCode && name) ? `${orderCode} - ${name}` : (name || code);
        }
    }
}

function fillGestaoProjectForm(project = {}) {
    document.getElementById('gestao-project-code').value = normalizeProjectCodeInput(project.projectCode || '');
    document.getElementById('gestao-project-name').value = project.name || '';
    document.getElementById('gestao-project-sale-value').value = formatSaleValueAsCurrencyInput(project.saleValue);
    document.getElementById('gestao-project-delivery').value = toGestaoInputDate(project.deliveryDate);
    document.getElementById('gestao-project-caminho-rede-aprovacao').value = project.caminhoRedeAprovacao || '';
    document.getElementById('gestao-project-complementar').checked = Boolean(project.isComplementar);
    
    const parentCode = normalizeProjectCodeInput(
        project.parentProject?.projectCode || project.parentProjectCode || ''
    );
    const parentOrderCode = project.parentProject?.order?.orderCode || project.parentOrderCode || '';
    const parentName = project.parentProject?.name || project.parentName || '';

    if (document.getElementById('gestao-project-parent-code')) {
        document.getElementById('gestao-project-parent-code').value = parentCode;
    }

    const parentDisplayEl = document.getElementById('gestao-project-parent-display');
    if (parentDisplayEl) {
        if (!parentCode) {
            parentDisplayEl.value = '';
        } else if (parentOrderCode && parentName) {
            parentDisplayEl.value = `${parentOrderCode} - ${parentName}`;
        } else if (parentName) {
            parentDisplayEl.value = parentName;
        } else {
            parentDisplayEl.value = parentCode;
        }
    }

    if (parentCode && (!parentOrderCode || !parentName)) {
        lookupAndSetParentProjectDisplay(parentCode);
    }

    document.getElementById('gestao-project-substituido').checked = Boolean(project.isSubstituido);
    const replacementCode = normalizeProjectCodeInput(
        project.substituidoPorProject?.projectCode || project.substituidoPorProjectCode || ''
    );
    const replacementOrderCode = project.substituidoPorProject?.order?.orderCode || project.substituidoPorOrderCode || '';
    const replacementName = project.substituidoPorProject?.name || project.substituidoPorName || '';

    if (document.getElementById('gestao-project-substituido-por-code')) {
        document.getElementById('gestao-project-substituido-por-code').value = replacementCode;
    }

    const replacementDisplayEl = document.getElementById('gestao-project-substituido-por-display');
    if (replacementDisplayEl) {
        if (!replacementCode) {
            replacementDisplayEl.value = '';
        } else if (replacementOrderCode && replacementName) {
            replacementDisplayEl.value = `${replacementOrderCode} - ${replacementName}`;
        } else if (replacementName) {
            replacementDisplayEl.value = replacementName;
        } else {
            replacementDisplayEl.value = replacementCode;
        }
    }

    if (replacementCode && (!replacementOrderCode || !replacementName)) {
        lookupAndSetSubstituidoPorProjectDisplay(replacementCode);
    }

    populateGestaoProjectFormSelects(project);
    populateGestaoProjectPhaseSelect(project.deliveryPhaseId || '');
    syncGestaoProjectTechnicalDeliveryConstraints();
    bindGestaoProjectRelationToggles(project);
    syncGestaoProjectPhaseFieldVisibility();
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
        deliveryPhaseId: hasGestaoOrderMultiplePhases()
            ? (typeof resolveGestaoDeliveryPhaseIdFromForm === 'function'
                ? resolveGestaoDeliveryPhaseIdFromForm(document.getElementById('gestao-project-phase')?.value)
                : (document.getElementById('gestao-project-phase')?.value || null))
            : null,
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

function syncGestaoOrderProjectsPhaseDeliveryColumn(visible) {
    document.getElementById('gestao-projects-col-phase-delivery')?.classList.toggle('hidden', !visible);
    document.querySelectorAll('.gestao-projects-phase-delivery-col').forEach(cell => {
        cell.classList.toggle('hidden', !visible);
    });
}

function renderGestaoProjectsSummaryList() {
    const tbody = document.getElementById('gestao-projects-rows');
    if (!tbody) return;

    const isPhasedOrder = typeof hasGestaoOrderMultiplePhases === 'function' && hasGestaoOrderMultiplePhases();
    syncGestaoOrderProjectsPhaseDeliveryColumn(isPhasedOrder);

    tbody.innerHTML = '';

    gestaoOrderProjectsDraft.forEach((project, index) => {
        const statusName = getGestaoProjectStatusName(project);
        const statusClass = getOrderProjectStatusBadgeClass(statusName);
        const saleValueDisplay = formatSaleValue(project.saleValue);
        const phaseDeliveryLabel = isPhasedOrder && typeof getGestaoProjectPhaseDeliveryDisplay === 'function'
            ? getGestaoProjectPhaseDeliveryDisplay(project)
            : '—';
        const tr = document.createElement('tr');
        tr.className = 'gestao-project-summary-row';
        tr.innerHTML = `
            <td class="p-3 font-medium text-slate-800">${escapeHtml(project.name || '—')}</td>
            <td class="p-3">
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(statusName)}</span>
            </td>
            <td class="p-3 text-slate-600 whitespace-nowrap gestao-projects-phase-delivery-col${isPhasedOrder ? '' : ' hidden'}">${escapeHtml(phaseDeliveryLabel)}</td>
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

    if (index != null && gestaoOrderProjectsDraft[index]) {
        if (title) title.textContent = 'Editar Projeto';
        fillGestaoProjectForm(gestaoOrderProjectsDraft[index]);
        syncGestaoProjectRemoveButtonVisibility(gestaoOrderProjectsDraft[index]);
        syncGestaoProjectPhaseFieldVisibility();
        if (typeof loadGestaoProjectCharacteristicsForm === 'function') {
            await loadGestaoProjectCharacteristicsForm(gestaoOrderProjectsDraft[index]);
        }
    } else {
        if (title) title.textContent = 'Novo Projeto';
        syncGestaoProjectRemoveButtonVisibility(null);
        const defaultStatusId = getDefaultProjectStatusId();
        if (defaultStatusId) {
            document.getElementById('gestao-project-status').value = String(defaultStatusId);
        }
        if (hasGestaoOrderMultiplePhases()) {
            populateGestaoProjectPhaseSelect(getGestaoFirstOrderPhaseId());
        }
        syncGestaoProjectTechnicalDeliveryConstraints();
        bindGestaoProjectRelationToggles();
        syncGestaoProjectPhaseFieldVisibility();
        if (typeof loadGestaoProjectCharacteristicsForm === 'function') {
            await loadGestaoProjectCharacteristicsForm({});
        }
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

    if (typeof collectGestaoProjectCharacteristicsFormSelection === 'function'
        && typeof validateGestaoProjectCharacteristicsSelection === 'function') {
        const characteristicsSelection = collectGestaoProjectCharacteristicsFormSelection();
        if (!validateGestaoProjectCharacteristicsSelection(characteristicsSelection)) return;
        project.characteristicIds = characteristicsSelection.noneChecked
            ? []
            : characteristicsSelection.characteristicIds;
    }

    let thirdPartyCharacteristicChanges = null;
    if (typeof validateAndConfirmGestaoProjectCharacteristicsChanges === 'function') {
        thirdPartyCharacteristicChanges = await validateAndConfirmGestaoProjectCharacteristicsChanges({
            project,
            previousCharacteristicIds: typeof getGestaoProjectCharacteristicsInitialIds === 'function'
                ? getGestaoProjectCharacteristicsInitialIds()
                : [],
            newCharacteristicIds: project.characteristicIds || []
        });

        if (!thirdPartyCharacteristicChanges?.proceed) return;
    }

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

    if (hasGestaoOrderMultiplePhases() && !project.deliveryPhaseId) {
        alertAppDialog('Selecione a fase de entrega do projeto.');
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

    const savedProjectCode = project.projectCode;

    if (editingGestaoProjectDraftIndex != null) {
        gestaoOrderProjectsDraft[editingGestaoProjectDraftIndex] = {
            ...gestaoOrderProjectsDraft[editingGestaoProjectDraftIndex],
            ...project
        };
    } else {
        gestaoOrderProjectsDraft.push(project);
    }

    try {
        if (editingGestaoOrderId && typeof persistGestaoProjects === 'function') {
            await persistGestaoProjects(editingGestaoOrderId, gestaoOrderProjectsDraft);
            if (typeof fetchGestaoOrderProjects === 'function') {
                const map = await fetchGestaoOrderProjects([editingGestaoOrderId]);
                const freshProjects = map[editingGestaoOrderId] || [];
                if (freshProjects.length && typeof setGestaoOrderProjectsDraft === 'function') {
                    setGestaoOrderProjectsDraft(freshProjects);
                }
            }
        } else {
            if (project.id
                && Array.isArray(project.characteristicIds)
                && typeof replaceOrderProjectCharacteristics === 'function') {
                await replaceOrderProjectCharacteristics(project.id, project.characteristicIds);
            }
        }

        const savedProject = gestaoOrderProjectsDraft.find(item => item.projectCode === savedProjectCode);
        const savedProjectId = Number(savedProject?.id || project.id);
        const orderIdForThirdParty = Number(editingGestaoOrderId || savedProject?.orderId);

        if (savedProjectId && thirdPartyCharacteristicChanges?.removedThirdPartyCharacteristicIds?.length
            && typeof deleteThirdPartyProjectsForOrderProjectCharacteristics === 'function') {
            await deleteThirdPartyProjectsForOrderProjectCharacteristics(
                savedProjectId,
                thirdPartyCharacteristicChanges.removedThirdPartyCharacteristicIds
            );
        }

        if (savedProjectId && orderIdForThirdParty
            && thirdPartyCharacteristicChanges?.addedThirdPartyCharacteristicIds?.length
            && typeof createThirdPartyProjectsForOrderProjectCharacteristics === 'function') {
            await createThirdPartyProjectsForOrderProjectCharacteristics({
                orderProjectId: savedProjectId,
                orderId: orderIdForThirdParty,
                characteristicIds: thirdPartyCharacteristicChanges.addedThirdPartyCharacteristicIds
            });
        }
    } catch (error) {
        alertAppDialog(`Erro ao salvar projeto no banco: ${error.message}`);
        return;
    }

    editingGestaoProjectDraftIndex = null;
    renderGestaoProjectsSummaryList();
    showGestaoPedidoFormPanel();
}

async function removeGestaoProjectDraft() {
    if (editingGestaoProjectDraftIndex == null) return;

    const project = gestaoOrderProjectsDraft[editingGestaoProjectDraftIndex];
    if (!isGestaoProjectVendido(project)) {
        alertAppDialog('Somente projetos com status "Vendido" podem ser removidos.');
        return;
    }

    const confirmed = await confirmAppDialog(
        `Remover o projeto "${project?.name || 'sem nome'}" deste pedido?`,
        { title: 'Remover projeto', confirmLabel: 'Remover' }
    );
    if (!confirmed) return;

    gestaoOrderProjectsDraft.splice(editingGestaoProjectDraftIndex, 1);

    if (editingGestaoOrderId && typeof persistGestaoProjects === 'function') {
        try {
            await persistGestaoProjects(editingGestaoOrderId, gestaoOrderProjectsDraft);
            if (typeof fetchGestaoOrderProjects === 'function') {
                const map = await fetchGestaoOrderProjects([editingGestaoOrderId]);
                const freshProjects = map[editingGestaoOrderId] || [];
                if (typeof setGestaoOrderProjectsDraft === 'function') {
                    setGestaoOrderProjectsDraft(freshProjects);
                }
            }
        } catch (error) {
            alertAppDialog(`Erro ao remover projeto no banco: ${error.message}`);
            return;
        }
    }

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

function showGestaoAlterarStatusProjetoPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-alterar-status-projeto-panel')?.classList.remove('hidden');
    setGestaoNavActive('alterar-status-projeto');
    if (typeof loadGestaoAlterarStatusProjectsList === 'function') {
        loadGestaoAlterarStatusProjectsList();
    }
}

function showGestaoClientesPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-clientes-panel')?.classList.remove('hidden');
    setGestaoNavActive('clientes');
}

function showGestaoMarceneirosPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-marceneiros-panel')?.classList.remove('hidden');
    setGestaoNavActive('marceneiros');
}

function showGestaoMontadoresPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-montadores-panel')?.classList.remove('hidden');
    setGestaoNavActive('montadores');
}

function showGestaoCharacteristicsPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-characteristics-panel')?.classList.remove('hidden');
    setGestaoNavActive('characteristics');
}

function showGestaoThirdPartySubtypesPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-third-party-subtypes-panel')?.classList.remove('hidden');
    setGestaoNavActive('third-party-subtypes');
}

function showGestaoCompraStatusPanel() {
    hideAllGestaoPanels();
    document.getElementById('gestao-compra-status-panel')?.classList.remove('hidden');
    setGestaoNavActive('compra-status');
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
    setGestaoCadastrosNavExpanded(true);

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
    bindGestaoProjectViewEvents();
    document.getElementById('gestao-ord-code')?.addEventListener('input', async function () {
        this.value = this.value.replace(/\D/g, '');
    });

    const triggerOrdClientPicker = () => {
        openClientePickerModal(cliente => {
            const input = document.getElementById('ord-client');
            const idInput = document.getElementById('ord-client-id');
            if (input) input.value = cliente.nome;
            if (idInput) idInput.value = cliente.id;
        });
    };
    document.getElementById('ord-client-picker-btn')?.addEventListener('click', triggerOrdClientPicker);
    document.getElementById('ord-client')?.addEventListener('click', triggerOrdClientPicker);

    const triggerGestaoOrdClientPicker = () => {
        openClientePickerModal(cliente => {
            const input = document.getElementById('gestao-ord-client');
            const idInput = document.getElementById('gestao-ord-client-id');
            if (input) input.value = cliente.nome;
            if (idInput) idInput.value = cliente.id;
        });
    };
    document.getElementById('gestao-ord-client-picker-btn')?.addEventListener('click', triggerGestaoOrdClientPicker);
    document.getElementById('gestao-ord-client')?.addEventListener('click', triggerGestaoOrdClientPicker);
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
    document.getElementById('gestao-nav-alterar-status-projeto')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoAlterarStatusProjetoPanel();
    });
    document.getElementById('gestao-nav-clientes')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoClientesPanel();
        if (typeof loadGestaoClientesList === 'function') {
            loadGestaoClientesList();
        }
    });
    document.getElementById('gestao-nav-marceneiros')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoMarceneirosPanel();
        loadGestaoMarceneirosList();
    });
    document.getElementById('gestao-nav-montadores')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoMontadoresPanel();
        loadGestaoMontadoresList();
    });
    document.getElementById('gestao-nav-characteristics')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoCharacteristicsPanel();
        loadGestaoProjectCharacteristicsList();
    });
    document.getElementById('gestao-nav-third-party-subtypes')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoThirdPartySubtypesPanel();
        if (typeof loadGestaoThirdPartySubtypesList === 'function') {
            loadGestaoThirdPartySubtypesList();
        }
    });
    document.getElementById('gestao-nav-compra-status')?.addEventListener('click', async () => {
        editingGestaoOrderId = null;
        showGestaoCompraStatusPanel();
        if (typeof loadGestaoCompraStatusList === 'function') {
            loadGestaoCompraStatusList();
        }
    });
    document.getElementById('gestao-new-characteristic-form')?.addEventListener('submit', addGestaoProjectCharacteristic);
    document.getElementById('gestao-new-third-party-subtype-form')?.addEventListener('submit', addGestaoThirdPartySubtype);
    document.getElementById('gestao-new-compra-status-form')?.addEventListener('submit', addGestaoCompraStatus);
    document.getElementById('gestao-project-parent-picker-btn')?.addEventListener('click', () => openProjectRelationPickerModal('parent'));
    document.getElementById('gestao-project-parent-display')?.addEventListener('click', () => {
        if (!document.getElementById('gestao-project-parent-display')?.disabled) {
            openProjectRelationPickerModal('parent');
        }
    });
    document.getElementById('gestao-project-substituido-por-picker-btn')?.addEventListener('click', () => openProjectRelationPickerModal('substituido'));
    document.getElementById('gestao-project-substituido-por-display')?.addEventListener('click', () => {
        if (!document.getElementById('gestao-project-substituido-por-display')?.disabled) {
            openProjectRelationPickerModal('substituido');
        }
    });
    document.getElementById('gestao-new-cliente-form')?.addEventListener('submit', (e) => {
        if (typeof addGestaoCliente === 'function') addGestaoCliente(e);
    });
    document.getElementById('gestao-clientes-list')?.addEventListener('click', (event) => {
        const saveBtn = event.target.closest('.gestao-save-cliente');
        if (saveBtn && typeof saveGestaoClienteRow === 'function') {
            event.preventDefault();
            saveGestaoClienteRow(saveBtn.closest('tr'), saveBtn);
            return;
        }

        const deleteBtn = event.target.closest('.gestao-delete-cliente');
        if (deleteBtn && typeof deleteGestaoClienteRow === 'function') {
            event.preventDefault();
            deleteGestaoClienteRow(deleteBtn.closest('tr'));
        }
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
    document.getElementById('gestao-new-montador-form')?.addEventListener('submit', addGestaoMontador);
    document.getElementById('gestao-montadores-list')?.addEventListener('click', (event) => {
        const saveButton = event.target.closest('.gestao-save-montador');
        if (saveButton) {
            event.preventDefault();
            saveGestaoMontadorRow(saveButton.closest('tr'), saveButton);
            return;
        }

        const deleteButton = event.target.closest('.gestao-delete-montador');
        if (deleteButton) {
            event.preventDefault();
            deleteGestaoMontadorRow(deleteButton.closest('tr'));
        }
    });
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
    if (typeof bindGestaoKanbanEvents === 'function') {
        bindGestaoKanbanEvents();
    }
    if (typeof bindGestaoPhasesEvents === 'function') {
        bindGestaoPhasesEvents();
    }
    if (typeof bindMontagemProgramacaoEvents === 'function') {
        bindMontagemProgramacaoEvents();
    }
    if (typeof bindProgramacaoProducaoEvents === 'function') {
        bindProgramacaoProducaoEvents();
    }
}

let parentProjectPickerCache = [];

function renderParentProjectPickerList(projects = parentProjectPickerCache) {
    const tbody = document.getElementById('parent-project-picker-list');
    const searchInput = document.getElementById('parent-project-picker-search');
    const filterText = (searchInput?.value || '').trim().toLowerCase();

    if (!tbody) return;

    const filtered = (projects || []).filter(proj => {
        if (!filterText) return true;
        const orderCode = String(proj.order?.orderCode || '').toLowerCase();
        const projectCode = String(proj.projectCode || '').toLowerCase();
        const name = String(proj.name || '').toLowerCase();
        return orderCode.includes(filterText) || projectCode.includes(filterText) || name.includes(filterText);
    });

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-4 text-center text-slate-400">Nenhum projeto encontrado.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(proj => {
        const tr = document.createElement('tr');
        const orderCode = proj.order?.orderCode || '—';
        const projectCode = proj.projectCode || '—';
        const name = proj.name || '—';
        const status = proj.projectStatus?.name || '—';

        tr.innerHTML = `
            <td class="p-2.5 font-mono font-medium text-slate-900">${escapeHtml(orderCode)}</td>
            <td class="p-2.5 font-mono font-semibold text-indigo-700">${escapeHtml(projectCode)}</td>
            <td class="p-2.5">${escapeHtml(name)}</td>
            <td class="p-2.5 text-slate-500">${escapeHtml(status)}</td>
            <td class="p-2.5 text-center">
                <button type="button" class="select-parent-project-btn px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-medium transition-colors"
                    data-project-code="${escapeHtml(projectCode)}"
                    data-order-code="${escapeHtml(orderCode)}"
                    data-project-name="${escapeHtml(name)}">
                    Selecionar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.select-parent-project-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const code = e.currentTarget.dataset.projectCode;
            const orderCode = e.currentTarget.dataset.orderCode;
            const name = e.currentTarget.dataset.projectName;
            const displayVal = (orderCode && name) ? `${orderCode} - ${name}` : (name || code || '');

            if (currentProjectPickerTarget === 'substituido') {
                const codeInput = document.getElementById('gestao-project-substituido-por-code');
                const displayInput = document.getElementById('gestao-project-substituido-por-display');
                if (codeInput) codeInput.value = code || '';
                if (displayInput) displayInput.value = displayVal;
            } else {
                const parentCodeInput = document.getElementById('gestao-project-parent-code');
                const parentDisplayInput = document.getElementById('gestao-project-parent-display');
                if (parentCodeInput) parentCodeInput.value = code || '';
                if (parentDisplayInput) parentDisplayInput.value = displayVal;
            }
            toggleModal('parent-project-picker-modal', false);
        });
    });
}

let currentProjectPickerTarget = 'parent';

async function openParentProjectPickerModal() {
    return openProjectRelationPickerModal('parent');
}

async function openSubstituidoProjectPickerModal() {
    return openProjectRelationPickerModal('substituido');
}

async function openProjectRelationPickerModal(target = 'parent') {
    currentProjectPickerTarget = target;
    const modalTitleHeader = document.querySelector('#parent-project-picker-modal h3');
    if (modalTitleHeader) {
        modalTitleHeader.textContent = target === 'substituido'
            ? 'Selecionar Projeto Substituto'
            : 'Selecionar Projeto Pai';
    }
    let clientId = null;
    let clientName = '';
    let currentOrderId = null;

    let activeOrder = null;
    if (typeof editingGestaoOrderId !== 'undefined' && editingGestaoOrderId) {
        activeOrder = gestaoOrdersCache.find(o => Number(o.id) === Number(editingGestaoOrderId));
    }

    if (activeOrder) {
        currentOrderId = Number(activeOrder.id);
        clientId = activeOrder.clientId;
        clientName = activeOrder.cliente?.nome || activeOrder.clientName || '';
    } else {
        clientName = document.getElementById('gestao-order-client-name')?.value.trim()
            || document.getElementById('ord-client')?.value.trim()
            || '';
    }

    const titleEl = document.getElementById('parent-project-picker-client-title');
    const tbody = document.getElementById('parent-project-picker-list');
    const searchInput = document.getElementById('parent-project-picker-search');

    if (searchInput) {
        searchInput.value = '';
    }

    if (!tbody) return;

    if (titleEl) {
        titleEl.textContent = clientName ? `Cliente: ${clientName}` : 'Projetos do mesmo cliente';
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="p-4 text-center text-slate-400">Carregando projetos do cliente...</td>
        </tr>
    `;
    toggleModal('parent-project-picker-modal', true);

    let orderIds = [];

    if (clientId) {
        const { data: clientOrders } = await supabaseClient
            .from('salesOrders')
            .select('id')
            .eq('clientId', clientId);
        if (clientOrders?.length) {
            orderIds = clientOrders.map(o => o.id);
        }
    }

    if (!orderIds.length && clientName) {
        const { data: nameOrders } = await supabaseClient
            .from('salesOrders')
            .select('id')
            .ilike('clientName', clientName.trim());
        if (nameOrders?.length) {
            orderIds = nameOrders.map(o => o.id);
        }
    }

    // Remover o ID do próprio pedido dos orderIds elegíveis para projeto pai
    if (currentOrderId) {
        orderIds = orderIds.filter(id => Number(id) !== currentOrderId);
    }

    if (!orderIds.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-4 text-center text-slate-400">Nenhum outro pedido encontrado para este cliente.</td>
            </tr>
        `;
        return;
    }

    let { data: projects, error } = await supabaseClient
        .from('OrderProject')
        .select('id, projectCode, name, orderId, isComplementar, isSubstituido, projectStatus:OrderProjectStatus(name, sortOrder), order:salesOrders(orderCode, clientName)')
        .in('orderId', orderIds)
        .order('createdAt', { ascending: false });

    if (error?.message?.includes('projectStatus')) {
        ({ data: projects } = await supabaseClient
            .from('OrderProject')
            .select('id, projectCode, name, orderId, isComplementar, isSubstituido, order:salesOrders(orderCode, clientName)')
            .in('orderId', orderIds)
            .order('createdAt', { ascending: false }));
    }

    const BLOCKED_STATUSES_AFTER_AGUARDANDO_PT = new Set([
        'Projeto Técnico',
        'Em Revisão Comercial',
        'Em Revisão Técnica',
        'Aguardando Aprovação',
        'Em Revisão',
        'Em revisão',
        'Nomear',
        'Aguardando PPCP',
        'Implantação',
        'Em Produção',
        'Montagem Interna',
        'Expedição',
        'Projeto Substituído'
    ]);

    const currentProjectDraftCode = document.getElementById('gestao-project-code')?.value.trim();
    const availableProjects = (projects || []).filter(p => {
        if (p.isComplementar) return false;
        if (p.isSubstituido) return false;
        if (currentOrderId && Number(p.orderId) === currentOrderId) return false;
        if (currentProjectDraftCode && String(p.projectCode) === String(currentProjectDraftCode)) return false;

        const sortOrder = p.projectStatus?.sortOrder ?? null;
        const statusName = p.projectStatus?.name || '';

        if (sortOrder != null) {
            if (Number(sortOrder) > 8) return false;
        } else if (statusName) {
            if (BLOCKED_STATUSES_AFTER_AGUARDANDO_PT.has(statusName)) return false;
        }

        return true;
    });

    parentProjectPickerCache = availableProjects;

    if (!availableProjects.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-4 text-center text-slate-400">Nenhum projeto disponível até "Aguardando Projeto Técnico" em outros pedidos deste cliente.</td>
            </tr>
        `;
        return;
    }

    renderParentProjectPickerList(parentProjectPickerCache);

    if (searchInput) {
        searchInput.oninput = () => renderParentProjectPickerList(parentProjectPickerCache);
    }
}

let clientePickerCache = [];
let activeClientePickerCallback = null;

async function openClientePickerModal(onSelectCallback) {
    activeClientePickerCallback = onSelectCallback;
    const searchInput = document.getElementById('cliente-picker-search');
    const tbody = document.getElementById('cliente-picker-list');

    if (searchInput) searchInput.value = '';
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="3" class="p-4 text-center text-slate-400">Carregando clientes ativos...</td>
        </tr>
    `;
    toggleModal('cliente-picker-modal', true);

    const { data: clientes, error } = await supabaseClient
        .from('Cliente')
        .select('id, nome, ativo')
        .eq('ativo', true)
        .order('nome', { ascending: true });

    if (error || !clientes || !clientes.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-4 text-center text-slate-400">Nenhum cliente ativo cadastrado. Cadastre em Gestão → Cadastros → Clientes.</td>
            </tr>
        `;
        clientePickerCache = [];
        return;
    }

    clientePickerCache = clientes;
    renderClientePickerList();

    if (searchInput) {
        searchInput.oninput = () => renderClientePickerList();
    }
}

window.openClientePickerModal = openClientePickerModal;

function renderClientePickerList() {
    const tbody = document.getElementById('cliente-picker-list');
    const searchInput = document.getElementById('cliente-picker-search');
    const filterText = (searchInput?.value || '').trim().toLowerCase();

    if (!tbody) return;

    const filtered = (clientePickerCache || []).filter(c => {
        if (!filterText) return true;
        return (c.nome || '').toLowerCase().includes(filterText);
    });

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-4 text-center text-slate-400">Nenhum cliente ativo encontrado com o filtro informado.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(cliente => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-2.5 font-mono text-slate-400">#${cliente.id}</td>
            <td class="p-2.5 font-medium text-slate-900">${escapeHtml(cliente.nome)}</td>
            <td class="p-2.5 text-center">
                <button type="button" class="select-cliente-btn px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-medium transition-colors"
                    data-cliente-id="${cliente.id}" data-cliente-nome="${escapeHtml(cliente.nome)}">
                    Selecionar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.select-cliente-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = Number(e.currentTarget.dataset.clienteId);
            const nome = e.currentTarget.dataset.clienteNome;
            if (typeof activeClientePickerCallback === 'function') {
                activeClientePickerCallback({ id, nome });
            }
            toggleModal('cliente-picker-modal', false);
        });
    });
}
