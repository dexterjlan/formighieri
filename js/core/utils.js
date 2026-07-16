function formatAuthError(error) {
    if (!error) return "Erro desconhecido.";
    const message = error.message || error.msg || error.error_description;
    const code = error.code || error.status;

    if (code === 500 || code === '500') {
        return message && message !== '{}'
            ? message + " — Erro no banco ao criar perfil. Rode o SQL em supabase/rls-policies.sql."
            : "Erro no servidor ao salvar perfil (500). Rode supabase/rls-policies.sql no Supabase. Se o e-mail já existir em appUsers, vincule ou remova o registro duplicado.";
    }

    if (code === 42501 || code === '42501' || message?.includes('row-level security')) {
        return (message || 'Política RLS bloqueou a operação.')
            + " — Execute supabase/rls-policies.sql no SQL Editor do Supabase.";
    }

    if (message && code) return `${message} (${code})`;
    if (message) return message;
    if (code) return `Erro ${code}`;
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
}

function toggleModal(id, show) {
    document.getElementById(id).classList.toggle('hidden', !show);
}
window.toggleModal = toggleModal;

function canEditConsultorResponse() {
    return currentUser?.role === 'Admin' || currentUser?.role === 'Consultor';
}

function canEditProjetistaResponse(conv) {
    if (currentUser?.role === 'Admin') return true;
    return currentUser?.role === 'Projetista' && conv?.designerId === currentUser.id;
}

function getOrderConsultantName(orderId) {
    if (!orderId || typeof ordersCache === 'undefined') return null;
    return ordersCache.find(o => o.id === orderId)?.consultantName || null;
}

function isOrderConsultorForRequest(conv) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Consultor') return false;
    const consultantName = getOrderConsultantName(conv?.orderId);
    return Boolean(consultantName && currentUser.name === consultantName);
}

function normalizeRequestStatus(conv) {
    const status = conv?.status;
    if (status === 'Aberto') {
        return conv?.requestProfile === 'Consultor'
            ? 'Aguardando Projetista'
            : 'Aguardando Consultor';
    }
    return status;
}

function getInitialRequestStatus(requestProfile) {
    return requestProfile === 'Consultor'
        ? 'Aguardando Projetista'
        : 'Aguardando Consultor';
}

function isRequestClosed(conv) {
    return normalizeRequestStatus(conv) === 'Encerrado';
}

function isRequestOpen(conv) {
    return !isRequestClosed(conv);
}

function isRequestWaitingConsultor(conv) {
    return normalizeRequestStatus(conv) === 'Aguardando Consultor';
}

function isRequestWaitingProjetista(conv) {
    return normalizeRequestStatus(conv) === 'Aguardando Projetista';
}

function getRequestStatusBadgeClass(status) {
    const normalized = status === 'Aberto'
        ? 'Aguardando Consultor'
        : status;
    if (normalized === 'Encerrado') return 'bg-slate-100 text-slate-600';
    if (normalized === 'Aguardando Consultor') return 'bg-amber-100 text-amber-800';
    if (normalized === 'Aguardando Projetista') return 'bg-sky-100 text-sky-800';
    return 'bg-amber-100 text-amber-800';
}

function getRequestOverdueDays() {
    const days = Number(
        systemSettingsCache?.requestOverdueDays ?? SYSTEM_SETTINGS_DEFAULTS.requestOverdueDays
    );
    return Number.isFinite(days) && days > 0 ? days : SYSTEM_SETTINGS_DEFAULTS.requestOverdueDays;
}

function getApprovalOverdueDays() {
    const days = Number(
        systemSettingsCache?.approvalOverdueDays ?? SYSTEM_SETTINGS_DEFAULTS.approvalOverdueDays
    );
    return Number.isFinite(days) && days > 0 ? days : SYSTEM_SETTINGS_DEFAULTS.approvalOverdueDays;
}

function getDaysOpenSince(dateStr) {
    if (!dateStr) return 0;
    const created = new Date(dateStr);
    if (Number.isNaN(created.getTime())) return 0;
    return (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
}

function isRequestOverdue(conv) {
    if (isRequestClosed(conv)) return false;
    return getDaysOpenSince(conv?.createdAt) > getRequestOverdueDays();
}

function isApprovalOverdue(approval) {
    if (isCommercialApprovalApproved(approval)) return false;
    return getDaysOpenSince(getCommercialApprovalReferenceDate(approval)) > getApprovalOverdueDays();
}

function getRequestHighlightBgHex(conv) {
    if (isRequestClosed(conv)) {
        return '#bbf7d0';
    }
    if (isRequestOverdue(conv)) {
        return '#fecaca';
    }
    return '#fde68a';
}

function getRequestHighlightBgClass(conv) {
    if (isRequestClosed(conv)) {
        return 'bg-emerald-100 border-emerald-200';
    }
    if (isRequestOverdue(conv)) {
        return 'bg-red-100 border-red-200';
    }
    return 'bg-amber-100 border-amber-200';
}

function sortOrderRequests(convs) {
    return [...convs].sort((a, b) => {
        const aOpen = isRequestOpen(a);
        const bOpen = isRequestOpen(b);
        if (aOpen !== bOpen) return aOpen ? -1 : 1;

        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
    });
}

function isCommercialApprovalApproved(approval) {
    const status = getApprovalStatusLabel(
        approval?.status || (approval?.approved ? 'Aprovado' : 'Aguardando Aprovação')
    );
    return status === 'Aprovado';
}

function getCommercialApprovalReferenceDate(approval) {
    return approval?.createdAt || approval?.updatedAt || null;
}

function getCommercialApprovalHighlightBgHex(approval) {
    if (isCommercialApprovalApproved(approval)) {
        return '#bbf7d0';
    }
    if (isApprovalOverdue(approval)) {
        return '#fecaca';
    }
    return '#fde68a';
}

function getCommercialApprovalHighlightBgClass(approval) {
    if (isCommercialApprovalApproved(approval)) {
        return 'bg-emerald-100 border-emerald-200';
    }
    if (isApprovalOverdue(approval)) {
        return 'bg-red-100 border-red-200';
    }
    return 'bg-amber-100 border-amber-200';
}

function getRequestResponseSummary(conv) {
    const parts = [];
    if (conv?.commercialResponse) parts.push(`Consultor: ${conv.commercialResponse}`);
    if (conv?.designerResponse) parts.push(`Projetista: ${conv.designerResponse}`);
    return parts.length ? parts.join(' | ') : '-';
}

function getResponseDisplayDate(conv) {
    if (conv.responseAt) return conv.responseAt;
    if (conv.commercialResponse || conv.designerResponse) return conv.updatedAt;
    return null;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function toInputDate(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).split('T')[0];
}

function formatDisplayDate(dateStr) {
    const value = toInputDate(dateStr);
    if (!value) return '—';
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return '—';
    return `${day}/${month}/${year}`;
}

function getTodayInputDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isInputDateInFuture(dateStr) {
    if (!dateStr) return false;
    return dateStr > getTodayInputDate();
}

function setActionOverlayLoading(config, active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById(config.overlayId);
    const messageEl = document.getElementById(config.messageId);
    const spinner = config.spinnerId ? document.getElementById(config.spinnerId) : null;
    const successIcon = config.successId ? document.getElementById(config.successId) : null;
    const errorIcon = config.errorId ? document.getElementById(config.errorId) : null;
    const show = Boolean(active);

    overlay?.classList.toggle('hidden', !show);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.toggle('text-red-600', status === 'error');
        messageEl.classList.toggle('text-emerald-700', status === 'success');
        messageEl.classList.toggle('text-slate-700', status === 'loading');
    }

    spinner?.classList.toggle('hidden', status !== 'loading');
    successIcon?.classList.toggle('hidden', status !== 'success');
    errorIcon?.classList.toggle('hidden', status !== 'error');
}

const ORDER_PROJECTS_ACTION_OVERLAY = {
    overlayId: 'order-projects-action-loading',
    messageId: 'order-projects-action-loading-msg',
    spinnerId: 'order-projects-action-loading-spinner',
    successId: 'order-projects-action-loading-success',
    errorId: 'order-projects-action-loading-error'
};

function setOrderProjectsPanelActionLoading(active, message = 'Processando...', status = 'loading') {
    setActionOverlayLoading(ORDER_PROJECTS_ACTION_OVERLAY, active, message, status);
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const REFRESH_BUTTON_ICON_HTML = '<svg class="order-tab-action-btn__icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>';

function renderRefreshButtonInnerHtml() {
    return `${REFRESH_BUTTON_ICON_HTML}<span>Atualizar</span>`;
}

function truncateText(text, max = 60) {
    if (!text) return '-';
    return text.length > max ? text.slice(0, max) + '…' : text;
}

function parseSaleValueInput(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;

    const normalized = trimmed.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const num = Number(normalized);
    if (!Number.isFinite(num) || num < 0) return NaN;

    return Math.round(num * 100) / 100;
}

function formatSaleValueForInput(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSaleValueAsCurrencyInput(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatSaleValueCurrencyMaskFromDigits(digits) {
    if (!digits) return '';
    const num = Number(digits) / 100;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function bindSaleValueCurrencyInput(input) {
    if (!input || input.dataset.saleValueCurrencyBound === '1') return;
    input.dataset.saleValueCurrencyBound = '1';

    input.addEventListener('input', () => {
        const digits = String(input.value).replace(/\D/g, '');
        input.value = formatSaleValueCurrencyMaskFromDigits(digits);
    });
}

function isProjectTechnicalDeliveryBeforeOrderDelivery(projectDeliveryDate, orderDeliveryDate) {
    if (!projectDeliveryDate || !orderDeliveryDate) return true;
    return String(projectDeliveryDate) < String(orderDeliveryDate);
}

function isPrevisaoConclusaoProjetoTecnicoValid(previsaoDate, projectDeliveryDate) {
    if (!previsaoDate) return false;
    if (!projectDeliveryDate) return true;
    return String(previsaoDate) <= String(projectDeliveryDate);
}

function formatSaleValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getApprovalStatusLabel(status) {
    return status || 'Aguardando Aprovação';
}

function getApprovalStatusBadgeClass(status) {
    if (status === 'Aprovado') return 'bg-emerald-100 text-emerald-800';
    if (status === 'Em revisão') return 'bg-sky-100 text-sky-800';
    return 'bg-amber-100 text-amber-800';
}

function isAdmin() {
    return currentUser?.role === 'Admin';
}

function normalizeAppUserProfile(profile) {
    if (!profile) return profile;
    return {
        ...profile,
        isActive: profile.isActive !== false,
        conferente: Boolean(profile.conferente),
        gestorComercial: Boolean(profile.gestorComercial),
        gestorProjetos: Boolean(profile.gestorProjetos),
        ppcp: Boolean(profile.ppcp),
        gestorFabrica: Boolean(profile.gestorFabrica)
    };
}

function isConferente(user = currentUser) {
    return user?.role === 'Projetista' && Boolean(user?.conferente);
}

function isGestorComercial(user = currentUser) {
    return (user?.role === 'Admin' || user?.role === 'Consultor') && Boolean(user?.gestorComercial);
}

function isGestorProjetos(user = currentUser) {
    return (user?.role === 'Admin' || user?.role === 'Projetista') && Boolean(user?.gestorProjetos);
}

function isPpcp(user = currentUser) {
    return user?.role === 'Projetista' && Boolean(user?.ppcp);
}

function isGestorFabrica(user = currentUser) {
    return user?.role === 'Marceneiro' && Boolean(user?.gestorFabrica);
}

function canSeeRequestProfileField(user = currentUser) {
    return user?.role === 'Admin'
        || isGestorComercial(user)
        || isGestorProjetos(user);
}

function syncRequestProfileColumnVisibility() {
    const show = canSeeRequestProfileField();
    document.querySelectorAll('.conv-query-profile-col').forEach(el => {
        el.classList.toggle('hidden', !show);
    });
}

function isMarceneiro(user = currentUser) {
    return user?.role === 'Marceneiro';
}

function isCompras(user = currentUser) {
    return user?.role === 'Compras';
}

function canSeePendenciasComprasMenu(user = currentUser) {
    return isAdmin() || isCompras(user);
}

function canActPendenciasCompras(user = currentUser) {
    return isCompras(user);
}

function canSeeOrderComprasTab(user = currentUser) {
    if (!user) return false;
    return isAdmin()
        || isCompras(user)
        || isGestorComercial(user)
        || isGestorFabrica(user);
}

function canSeeCompraModal(user = currentUser) {
    return canSeeOrderComprasTab(user);
}

function canActCompraModal(user = currentUser) {
    return isCompras(user);
}

function canSeeQueryNav(user = currentUser) {
    if (typeof QUERY_NAV_ENABLED !== 'undefined' && !QUERY_NAV_ENABLED) return false;
    return !isMarceneiro(user) && !isCompras(user);
}

function canAccessGestao(user = currentUser) {
    return user?.role === 'Admin'
        || isGestorComercial(user)
        || isGestorProjetos(user)
        || isGestorFabrica(user);
}

function canAccessMontagemProgramacao(user = currentUser) {
    return isAdmin(user) || isGestorProjetos(user);
}

function canAccessCalendar(user = currentUser) {
    if (!user) return false;
    return isAdmin(user)
        || user.role === 'Consultor'
        || isConferente(user)
        || isGestorComercial(user)
        || isGestorProjetos(user)
        || isGestorFabrica(user);
}

function canAccessGoogleCalendar(user = currentUser) {
    return canAccessCalendar(user);
}

function canSeeOrderMedicaoTab(user = currentUser) {
    if (!user) return false;
    return user.role === 'Admin' || isConferente(user) || isGestorComercial(user);
}

function canSeeOrderPpcpTab(user = currentUser) {
    if (!user) return false;
    return user.role === 'Admin' || isPpcp(user);
}

function canSeeOrderNomearTab(user = currentUser) {
    if (!user) return false;
    return user.role === 'Admin' || user.role === 'Projetista';
}

const ORDER_DETAIL_TAB_RESPONSIBLE_LABELS = {
    requests: 'Consultor, Projetista ou Admin',
    anteprojeto: 'Conferente ou Admin',
    medicao: 'Conferente ou Admin',
    fabrica: 'Gestor de Fábrica ou Admin',
    compras: 'Equipe de Compras'
};

function getOrderDetailTabResponsibleLabel(tabKey) {
    return ORDER_DETAIL_TAB_RESPONSIBLE_LABELS[tabKey] || 'o responsável';
}

function canActOrderDetailTab(tabKey, user = currentUser) {
    if (!user) return false;
    if (isAdmin(user)) return true;

    switch (tabKey) {
        case 'requests':
            return user.role === 'Consultor' || user.role === 'Projetista';
        case 'anteprojeto':
        case 'medicao':
            return isConferente(user) || isGestorComercial(user);
        case 'fabrica':
            return isGestorFabrica(user);
        case 'compras':
            return isCompras(user);
        default:
            return false;
    }
}

function canActOrderProjectNomear(project, user = currentUser) {
    if (!user || !project) return false;
    return user.role === 'Projetista'
        && Number(project.designerId) === Number(user.id);
}

function canCreateAsAdminOrConferente() {
    return isAdmin() || isConferente();
}

function bindCollapsibleListCardToggles(root, options = {}) {
    const { defaultCollapsed = true } = options;

    root.querySelectorAll('.collapsible-list-card').forEach(card => {
        const btn = card.querySelector('.list-card-toggle');
        const body = card.querySelector('.collapsible-list-body');
        const header = card.querySelector('.collapsible-list-header');
        if (!btn || !body) return;

        const setCollapsed = (collapsed) => {
            body.classList.toggle('hidden', collapsed);
            btn.textContent = collapsed ? '▶' : '▼';
            btn.setAttribute('aria-label', collapsed ? 'Expandir' : 'Recolher');
        };

        setCollapsed(defaultCollapsed);

        const toggle = (event) => {
            if (event) event.stopPropagation();
            setCollapsed(body.classList.contains('hidden') === false);
        };

        btn.addEventListener('click', toggle);
        header?.addEventListener('click', async (event) => {
            if (event.target.closest('button:not(.list-card-toggle), a, input, select, textarea, label')) return;
            toggle(event);
        });
    });
}

function formatRequestProfile(profile) {
    return profile || '—';
}

function getRequestProfileBadgeClass(profile) {
    if (profile === 'Projetista') return 'bg-sky-100 text-sky-800';
    if (profile === 'Consultor') return 'bg-amber-100 text-amber-800';
    return 'bg-slate-100 text-slate-600';
}

function updateConvRequestLabel(profile) {
    const label = document.getElementById('conv-request-label');
    if (!label) return;
    if (profile === 'Consultor') {
        label.textContent = 'Solicitação do Consultor';
    } else if (profile === 'Projetista') {
        label.textContent = 'Solicitação do Projetista';
    } else {
        label.textContent = 'Solicitação';
    }
}

function setupConvProfileFields(isEdit, conv) {
    const adminWrap = document.getElementById('conv-profile-wrap');
    const profileSelect = document.getElementById('conv-profile');
    const readOnlyWrap = document.getElementById('conv-profile-readonly-wrap');
    const readOnlyLabel = document.getElementById('conv-profile-readonly-label');
    const canSeeProfile = canSeeRequestProfileField();

    adminWrap.classList.add('hidden');
    readOnlyWrap.classList.add('hidden');
    profileSelect.required = false;
    profileSelect.onchange = null;

    if (isEdit) {
        if (canSeeProfile) {
            readOnlyWrap.classList.remove('hidden');
            readOnlyLabel.textContent = formatRequestProfile(conv?.requestProfile);
        }
        updateConvRequestLabel(conv?.requestProfile);
        return;
    }

    if (currentUser.role === 'Admin') {
        adminWrap.classList.remove('hidden');
        profileSelect.required = true;
        profileSelect.value = '';
        updateConvRequestLabel('');
        profileSelect.onchange = () => {
            updateConvRequestLabel(profileSelect.value);
            if (typeof applyConvDesignerFromSelectedProject === 'function') {
                applyConvDesignerFromSelectedProject();
            }
        };
        return;
    }

    updateConvRequestLabel(currentUser.role);
}

function getRequestProfileForCreate() {
    if (currentUser.role === 'Admin') {
        return document.getElementById('conv-profile').value.trim();
    }
    if (currentUser.role === 'Consultor' || currentUser.role === 'Projetista') {
        return currentUser.role;
    }
    return '';
}

function getOrderProjectStatusName(project) {
    return project?.projectStatus?.name || project?.statusName || '—';
}

const COMPLEMENTAR_PARENT_BLOCKED_FROM_SORT_ORDER = 10;

const COMPLEMENTAR_PARENT_BLOCKED_STATUS_NAMES = new Set([
    'Aguardando Aprovação',
    'Em Revisão',
    'Em revisão',
    'Nomear',
    'Aguardando PPCP',
    'Implantação',
    'Em Produção',
    'Montagem Interna',
    'Expedição'
]);

function isComplementarOrderProject(project) {
    return project?.isComplementar === true;
}

function canActOnOrderProject(project) {
    return !isComplementarOrderProject(project) && !isSubstituidoOrderProject(project);
}

function getComplementarParentProjectCode(project) {
    return project?.parentProject?.projectCode
        || project?.parentProjectCode
        || '';
}

function getComplementarParentOrderCode(project) {
    return project?.parentProject?.order?.orderCode
        || project?.parentOrderCode
        || '';
}

function isComplementarParentStatusAllowed(statusName, sortOrder = null) {
    if (sortOrder != null && Number(sortOrder) >= COMPLEMENTAR_PARENT_BLOCKED_FROM_SORT_ORDER) {
        return false;
    }
    return !COMPLEMENTAR_PARENT_BLOCKED_STATUS_NAMES.has(statusName);
}

function renderComplementarProjectNoticeHtml(project) {
    if (!isComplementarOrderProject(project)) return '';

    const parentCode = getComplementarParentProjectCode(project) || '—';
    const orderCode = getComplementarParentOrderCode(project);
    const orderSuffix = orderCode ? ` · pedido ${escapeHtml(orderCode)}` : '';

    return `<span class="inline-flex items-center text-[10px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-full shrink-0" title="Projeto Complementar vinculado ao projeto ${escapeHtml(parentCode)}">Projeto Complementar · ${escapeHtml(parentCode)}${orderSuffix}</span>`;
}

function excludeComplementarPendenciasProjects(projects) {
    return (projects || []).filter(project => !isComplementarOrderProject(project));
}

const SUBSTITUIDO_STATUS_NAME = 'Projeto Substituído';
const SUBSTITUICAO_MAX_ORIGINAL_SORT_ORDER = 8;

const SUBSTITUICAO_BLOCKED_STATUS_NAMES = new Set([
    'Projeto Técnico',
    'Aguardando Aprovação',
    'Em Revisão',
    'Em revisão',
    'Nomear',
    'Aguardando PPCP',
    'Implantação',
    'Em Produção',
    'Montagem Interna',
    'Expedição',
    SUBSTITUIDO_STATUS_NAME
]);

function isSubstituidoOrderProject(project) {
    return project?.isSubstituido === true
        || getOrderProjectStatusName(project) === SUBSTITUIDO_STATUS_NAME;
}

function isSubstituicaoOrderProject(project) {
    return project?.isSubstituicao === true || Boolean(project?.substituiProjectId);
}

function isSubstituidoStatusName(statusName) {
    return statusName === SUBSTITUIDO_STATUS_NAME;
}

function getSubstituidoPorProjectCode(project) {
    return project?.substituidoPorProject?.projectCode
        || project?.substituidoPorProjectCode
        || '';
}

function getSubstituidoPorOrderCode(project) {
    return project?.substituidoPorProject?.order?.orderCode
        || project?.substituidoPorOrderCode
        || '';
}

function getSubstituiProjectCode(project) {
    return project?.substituiProject?.projectCode
        || project?.substituiProjectCode
        || '';
}

function getSubstituiOrderCode(project) {
    return project?.substituiProject?.order?.orderCode
        || project?.substituiOrderCode
        || '';
}

function canMarkProjectAsSubstituido(project) {
    if (isSubstituidoOrderProject(project)) return false;
    return isSubstituidoEligibleStatus(project);
}

function isSubstituidoEligibleStatus(project) {
    if (isComplementarOrderProject(project) || isSubstituicaoOrderProject(project)) return false;

    const statusName = getOrderProjectStatusName(project);
    const sortOrder = project?.projectStatus?.sortOrder ?? null;

    if (sortOrder != null) {
        return Number(sortOrder) <= SUBSTITUICAO_MAX_ORIGINAL_SORT_ORDER;
    }

    return !SUBSTITUICAO_BLOCKED_STATUS_NAMES.has(statusName);
}

function getSubstituidoStatusId(statuses = []) {
    const list = statuses.length ? statuses : (typeof gestaoProjectStatusesCache !== 'undefined' ? gestaoProjectStatusesCache : []);
    const match = list.find(status => status.name === SUBSTITUIDO_STATUS_NAME);
    return match?.id || null;
}

function getProjectEffectiveSaleValue(project) {
    const base = Number(project?.saleValue);
    const normalizedBase = Number.isFinite(base) ? base : 0;

    if (!isSubstituicaoOrderProject(project)) {
        return normalizedBase;
    }

    const originalValue = Number(
        project?.substituiProject?.saleValue
        || project?.substituiOriginalSaleValue
    );
    return normalizedBase + (Number.isFinite(originalValue) ? originalValue : 0);
}

function renderSubstituidoProjectNoticeHtml(project) {
    if (!isSubstituidoOrderProject(project)) return '';

    const orderCode = getSubstituidoPorOrderCode(project) || '—';
    const replacementCode = getSubstituidoPorProjectCode(project);
    const projectSuffix = replacementCode ? ` · proj. ${escapeHtml(replacementCode)}` : '';

    return `<span class="inline-flex items-center text-[10px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full shrink-0" title="Projeto Substituído pelo pedido ${escapeHtml(orderCode)}${replacementCode ? ` (projeto ${escapeHtml(replacementCode)})` : ''}">Projeto Substituído · pedido ${escapeHtml(orderCode)}${projectSuffix}</span>`;
}

function renderSubstituicaoProjectNoticeHtml(project) {
    if (!isSubstituicaoOrderProject(project)) return '';

    const orderCode = getSubstituiOrderCode(project) || '—';
    const originalCode = getSubstituiProjectCode(project);
    const projectSuffix = originalCode ? ` · proj. ${escapeHtml(originalCode)}` : '';

    return `<span class="inline-flex items-center text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0" title="Projeto Substituição do pedido ${escapeHtml(orderCode)}${originalCode ? ` (projeto ${escapeHtml(originalCode)})` : ''}">Projeto Substituição · pedido ${escapeHtml(orderCode)}${projectSuffix}</span>`;
}

function excludeSubstituidoPendenciasProjects(projects) {
    return (projects || []).filter(project => !isSubstituidoOrderProject(project));
}

function excludeInactivePendenciasProjects(projects) {
    return excludeSubstituidoPendenciasProjects(excludeComplementarPendenciasProjects(projects));
}

function applyComplementarReadOnlyToElement(root, project) {
    if (!root || !isComplementarOrderProject(project)) return false;

    root.classList.add('order-project-complementar-readonly', 'opacity-70');
    root.querySelectorAll('input:not([type="hidden"]), button, select, textarea').forEach(element => {
        element.disabled = true;
    });

    return true;
}

function applySubstituidoReadOnlyToElement(root, project) {
    if (!root || !isSubstituidoOrderProject(project)) return false;

    root.classList.add('order-project-substituido-readonly', 'opacity-70');
    root.querySelectorAll('input:not([type="hidden"]), button, select, textarea').forEach(element => {
        element.disabled = true;
    });

    return true;
}

function applyOrderProjectReadOnlyToElement(root, project) {
    return applyComplementarReadOnlyToElement(root, project)
        || applySubstituidoReadOnlyToElement(root, project);
}

function getOrderProjectStatusBadgeClass(statusName) {
    if (!statusName || statusName === '—') return 'bg-slate-100 text-slate-600';
    if (statusName === 'Aguardando Aprovação') return 'bg-amber-100 text-amber-800';
    if (statusName === 'Em Revisão' || statusName === 'Em revisão') return 'bg-sky-100 text-sky-800';
    if (statusName === 'Projeto Técnico') return 'bg-violet-100 text-violet-800';
    if (statusName === 'Aguardando Projeto Técnico') return 'bg-indigo-100 text-indigo-800';
    if (statusName === 'Vendido') return 'bg-emerald-100 text-emerald-800';
    if (statusName === 'Aguardando Obra') return 'bg-orange-100 text-orange-800';
    if (statusName === 'Aguardando Medição') return 'bg-cyan-100 text-cyan-800';
    if (statusName === 'Conferência Realizada') return 'bg-teal-100 text-teal-800';
    if (statusName === 'Conferência Enviada') return 'bg-sky-100 text-sky-800';
    if (statusName === 'Medição Realizada') return 'bg-teal-100 text-teal-800';
    if (statusName === 'Planta Levantada') return 'bg-lime-100 text-lime-800';
    if (statusName === 'Nomear') return 'bg-purple-100 text-purple-800';
    if (statusName === 'Aguardando PPCP') return 'bg-fuchsia-100 text-fuchsia-800';
    if (statusName === 'Implantação') return 'bg-teal-100 text-teal-800';
    if (statusName === 'Em Produção') return 'bg-orange-100 text-orange-800';
    if (statusName === 'Montagem Interna') return 'bg-amber-100 text-amber-800';
    if (statusName === 'Expedição') return 'bg-slate-200 text-slate-800';
    if (statusName === SUBSTITUIDO_STATUS_NAME) return 'bg-rose-100 text-rose-800';
    return 'bg-slate-100 text-slate-700';
}
