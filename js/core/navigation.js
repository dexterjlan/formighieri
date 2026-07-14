const APP_NAV_STATE_KEY = 'formighieri-app-nav';
let appShellReady = false;
let suppressAppNavPersist = false;

function readAppNavState() {
    try {
        const raw = sessionStorage.getItem(APP_NAV_STATE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('readAppNavState:', error);
        return null;
    }
}

function saveAppNavState(patch = {}) {
    if (suppressAppNavPersist) return;

    const next = {
        ...readAppNavState(),
        ...patch
    };

    try {
        sessionStorage.setItem(APP_NAV_STATE_KEY, JSON.stringify(next));
    } catch (error) {
        console.warn('saveAppNavState:', error);
    }
}

function clearAppNavState() {
    try {
        sessionStorage.removeItem(APP_NAV_STATE_KEY);
    } catch (error) {
        console.warn('clearAppNavState:', error);
    }
}

function revealAuthenticatedShell() {
    if (!currentUser) return;

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('register-screen').classList.add('hidden');
    document.getElementById('register-screen').classList.remove('flex');
    document.getElementById('main-panel').classList.remove('hidden');

    const roleLabel = currentUser.role || 'Sem perfil';
    document.getElementById('user-display').innerText =
        `Logado como: ${currentUser.name} (${roleLabel})`;

    updateAdminNav();
    if (typeof updateCommercialApprovalButtonVisibility === 'function') {
        updateCommercialApprovalButtonVisibility();
    }
}

async function restoreGestaoView(state) {
    if (!canAccessGestao()) {
        showWelcome();
        return;
    }

    hideSubViews();
    document.getElementById('gestao-view')?.classList.remove('hidden');
    updateMainNavActive('gestao');
    updateAdminNav();
    if (typeof updateGestaoCadastrosNavVisibility === 'function') {
        updateGestaoCadastrosNavVisibility();
    }

    const gestaoNav = state.gestaoNav || 'pedido';
    const openGestaoPanel = {
        pedido: () => {
            if (typeof showGestaoPedidoListPanel === 'function') showGestaoPedidoListPanel();
            if (typeof loadGestaoOrdersList === 'function') loadGestaoOrdersList();
        },
        'project-status': () => {
            if (typeof showGestaoProjectStatusPanel === 'function') showGestaoProjectStatusPanel();
        },
        marceneiros: () => {
            if (typeof showGestaoMarceneirosPanel === 'function') showGestaoMarceneirosPanel();
        },
        usuarios: () => {
            if (typeof showGestaoUsuariosPanel === 'function') showGestaoUsuariosPanel();
        },
        dashboard: () => {
            if (typeof showGestaoDashboardPanel === 'function') showGestaoDashboardPanel();
        },
        kanban: () => {
            if (typeof showGestaoKanbanPanel === 'function') showGestaoKanbanPanel();
        },
        gantt: () => {
            if (typeof showGestaoGanttPanel === 'function') showGestaoGanttPanel();
        },
        relatorios: () => {
            if (typeof showGestaoRelatoriosPanel === 'function') showGestaoRelatoriosPanel();
        },
        performance: () => {
            if (typeof showGestaoPerformancePanel === 'function') showGestaoPerformancePanel();
        }
    };

    (openGestaoPanel[gestaoNav] || openGestaoPanel.pedido)();
}

async function restorePendenciasView(state) {
    if (!canAccessPendencias()) {
        showWelcome();
        return;
    }

    hideSubViews();
    document.getElementById('pendencias-view')?.classList.remove('hidden');
    updateMainNavActive('pendencias');
    updateAdminNav();
    if (typeof updatePendenciasNav === 'function') updatePendenciasNav();

    if (typeof getDefaultPendenciasSection === 'function') {
        pendenciasActiveSection = state.pendenciasSection || getDefaultPendenciasSection();
    } else {
        pendenciasActiveSection = state.pendenciasSection || null;
    }
    pendenciasActiveItem = state.pendenciasItem || null;

    if (typeof renderPendenciasSidebar === 'function') renderPendenciasSidebar();
    if (typeof loadPendenciasContent === 'function') await loadPendenciasContent();
}

async function restoreAppNavState() {
    const state = readAppNavState();
    if (!state?.view) return false;

    suppressAppNavPersist = true;

    try {
        switch (state.view) {
            case 'home':
                showWelcome();
                return true;
            case 'dashboard':
                showDashboard();
                if (state.activeOrderId && typeof selectOrder === 'function') {
                    await selectOrder(state.activeOrderId);
                    if (state.orderDetailTab && typeof switchOrderDetailTab === 'function') {
                        switchOrderDetailTab(state.orderDetailTab);
                    }
                }
                return true;
            case 'gestao':
                await restoreGestaoView(state);
                return true;
            case 'pendencias':
                await restorePendenciasView(state);
                return true;
            case 'calendar':
                if (typeof showCalendar === 'function') showCalendar();
                return true;
            case 'requests':
                showConversationsQuery();
                return true;
            case 'approvals':
                showApprovalsQuery();
                return true;
            case 'settings':
                if (typeof showSystemSettings === 'function') await showSystemSettings();
                return true;
            default:
                return false;
        }
    } finally {
        suppressAppNavPersist = false;
    }
}

async function showMainPanel() {
    revealAuthenticatedShell();

    if (appShellReady) return;

    const restored = await restoreAppNavState();
    if (!restored) showWelcome();

    if (typeof initApp === 'function') initApp();
    appShellReady = true;
}

function updateAdminNav() {
    document.getElementById("btn-system-settings").classList.toggle("hidden", !isAdmin());
    document.getElementById("btn-gestao").classList.toggle("hidden", !canAccessGestao());
    document.getElementById("btn-conversations-query").classList.toggle("hidden", !canSeeQueryNav());
    document.getElementById("btn-approvals-query").classList.toggle("hidden", !canSeeQueryNav());
    document.getElementById("btn-calendario").classList.toggle("hidden", !canAccessCalendar());
    if (typeof updateGestaoCadastrosNavVisibility === 'function') updateGestaoCadastrosNavVisibility();
    if (typeof updatePendenciasNav === 'function') updatePendenciasNav();
    if (typeof updateOrderDetailTabsVisibility === 'function') updateOrderDetailTabsVisibility();
}

const MAIN_NAV_ACTIVE_CLASS = 'text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg';
const MAIN_NAV_INACTIVE_CLASS = 'text-xs bg-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg';

function updateMainNavActive(activeView) {
    const buttons = {
        home: document.getElementById('btn-inicio'),
        dashboard: document.getElementById('btn-back-dashboard'),
        requests: document.getElementById('btn-conversations-query'),
        approvals: document.getElementById('btn-approvals-query'),
        calendar: document.getElementById('btn-calendario'),
        gestao: document.getElementById('btn-gestao'),
        pendencias: document.getElementById('btn-pendencias'),
        settings: document.getElementById('btn-system-settings')
    };

    Object.entries(buttons).forEach(([key, btn]) => {
        if (!btn) return;
        btn.className = key === activeView ? MAIN_NAV_ACTIVE_CLASS : MAIN_NAV_INACTIVE_CLASS;
    });
}

function hideSubViews() {
    if (typeof closeMobileMenu === 'function') {
        closeMobileMenu();
    }
    if (typeof hideCalendarFloatingTooltip === 'function') {
        hideCalendarFloatingTooltip();
    }

    document.getElementById("welcome-view").classList.add("hidden");
    document.getElementById("dashboard-view").classList.add("hidden");
    document.getElementById("system-settings-view").classList.add("hidden");
    document.getElementById("conversations-query-view").classList.add("hidden");
    document.getElementById("approvals-query-view").classList.add("hidden");
    document.getElementById("calendar-view").classList.add("hidden");
    document.getElementById("gestao-view").classList.add("hidden");
    document.getElementById("pendencias-view").classList.add("hidden");
}

function showDashboard() {
    hideSubViews();
    document.getElementById("dashboard-view").classList.remove("hidden");
    updateMainNavActive('dashboard');
    updateAdminNav();
    saveAppNavState({
        view: 'dashboard',
        activeOrderId: null,
        orderDetailTab: null
    });
}

function showUsersAdmin() {
    if (!isAdmin()) return;
    if (typeof showGestao === 'function') {
        showGestao();
        showGestaoUsuariosPanel();
    }
}

function showConversationsQuery() {
    if (!canSeeQueryNav()) return;
    hideSubViews();
    document.getElementById("conversations-query-view").classList.remove("hidden");
    updateMainNavActive('requests');
    updateAdminNav();
    saveAppNavState({ view: 'requests' });
    loadQueryFilterOptions();
    searchConversations();
}

function showApprovalsQuery() {
    if (!canSeeQueryNav()) return;
    hideSubViews();
    document.getElementById("approvals-query-view").classList.remove("hidden");
    updateMainNavActive('approvals');
    updateAdminNav();
    saveAppNavState({ view: 'approvals' });
    loadApprovalQueryFilterOptions();
    searchCommercialApprovalsQuery();
}

function bindNavigationEvents() {
    document.getElementById("btn-inicio").addEventListener("click", showWelcome);
    document.getElementById("btn-back-dashboard").addEventListener("click", showDashboard);
    document.getElementById("btn-conversations-query").addEventListener("click", showConversationsQuery);
    document.getElementById("btn-approvals-query").addEventListener("click", showApprovalsQuery);
}
