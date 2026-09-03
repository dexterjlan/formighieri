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

function hideAuthScreens() {
    const login = document.getElementById('login-screen');
    const register = document.getElementById('register-screen');
    const forgot = document.getElementById('forgot-password-screen');
    const reset = document.getElementById('reset-password-screen');

    login?.classList.add('hidden');
    register?.classList.add('hidden');
    register?.classList.remove('flex');
    forgot?.classList.add('hidden');
    forgot?.classList.remove('flex');
    reset?.classList.add('hidden');
    reset?.classList.remove('flex');
}

function setAppSessionLoading(active, message = 'Carregando...', detail = 'Aguarde um instante') {
    const overlay = document.getElementById('app-session-loading');
    if (!overlay) return;

    overlay.classList.toggle('hidden', !active);
    overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
    overlay.setAttribute('aria-busy', active ? 'true' : 'false');

    if (active) {
        const msgEl = document.getElementById('app-session-loading-msg');
        const detailEl = document.getElementById('app-session-loading-detail');
        if (msgEl && message) msgEl.textContent = message;
        if (detailEl && detail) detailEl.textContent = detail;
        // Força reflow para o overlay entrar no layout antes do próximo await.
        void overlay.offsetWidth;
    }

    document.body.classList.toggle('overflow-hidden', Boolean(active));
}

function yieldForAppPaint() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setTimeout(resolve, 0);
            });
        });
    });
}

async function showAppSessionLoading(message, detail) {
    setAppSessionLoading(true, message, detail);
    await yieldForAppPaint();
}

function hideAppSessionLoading() {
    setAppSessionLoading(false);
}

function revealAuthenticatedShell() {
    if (!currentUser) return;

    hideAuthScreens();
    document.getElementById('main-panel').classList.remove('hidden');

    const roleLabel = currentUser.role || 'Sem perfil';
    document.getElementById('user-display').innerText = typeof getLoggedInUserDisplayText === 'function'
        ? getLoggedInUserDisplayText()
        : `Logado como: ${currentUser.name} (${roleLabel})`;

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

    const legacyGestaoNav = {
        gantt: 'project-scheduling',
        'programacao-projetos': 'project-scheduling'
    };
    const gestaoNav = legacyGestaoNav[state.gestaoNav] || state.gestaoNav || 'pedido';
    const openGestaoPanel = {
        pedido: () => {
            if (typeof showGestaoPedidoListPanel === 'function') showGestaoPedidoListPanel();
            if (typeof loadGestaoOrdersList === 'function') loadGestaoOrdersList();
        },
        'project-status': () => {
            if (typeof showGestaoProjectStatusPanel === 'function') showGestaoProjectStatusPanel();
        },
        'alterar-status-projeto': () => {
            if (typeof showGestaoAlterarStatusProjetoPanel === 'function') showGestaoAlterarStatusProjetoPanel();
        },
        'create-detailing': () => {
            if (typeof showGestaoCreateDetailingPanel === 'function') showGestaoCreateDetailingPanel();
        },
        clientes: () => {
            if (typeof showGestaoClientesPanel === 'function') showGestaoClientesPanel();
            if (typeof loadGestaoClientesList === 'function') loadGestaoClientesList();
        },
        'calendar-event-types': () => {
            if (typeof showGestaoCalendarEventTypesPanel === 'function') showGestaoCalendarEventTypesPanel();
            if (typeof loadGestaoCalendarEventTypesList === 'function') loadGestaoCalendarEventTypesList();
        },
        marceneiros: () => {
            if (typeof showGestaoMarceneirosPanel === 'function') showGestaoMarceneirosPanel();
        },
        montadores: () => {
            if (typeof showGestaoMontadoresPanel === 'function') showGestaoMontadoresPanel();
            if (typeof loadGestaoMontadoresList === 'function') loadGestaoMontadoresList();
        },
        usuarios: () => {
            if (typeof showGestaoUsuariosPanel === 'function') showGestaoUsuariosPanel();
        },
        dashboard: () => {
            if (typeof showGestaoDashboardPanel === 'function') showGestaoDashboardPanel();
        },
        kanban: () => {
            if (typeof showKanbanView === 'function') showKanbanView({ fromGestao: true });
            else if (typeof showGestaoKanbanPanel === 'function') showGestaoKanbanPanel();
        },
        'cronograma-pedido': () => {
            if (typeof showGestaoCronogramaPedidoPanel === 'function') showGestaoCronogramaPedidoPanel();
        },
        'project-scheduling': () => {
            if (typeof showProjectSchedulingView === 'function') showProjectSchedulingView({ fromGestao: true });
            else if (typeof showGestaoProjectSchedulingPanel === 'function') showGestaoProjectSchedulingPanel();
        },
        relatorios: () => {
            if (typeof showGestaoRelatoriosPanel === 'function') showGestaoRelatoriosPanel();
        },
        performance: () => {
            if (typeof showGestaoPerformancePanel === 'function') showGestaoPerformancePanel();
        },
        'montagem-programacao': () => {
            if (typeof showProgramacaoMontagemView === 'function') showProgramacaoMontagemView({ fromGestao: true });
            else if (typeof showGestaoMontagemProgramacaoPanel === 'function') showGestaoMontagemProgramacaoPanel();
        },
        'programacao-producao': () => {
            if (typeof showGestaoProgramacaoProducaoPanel === 'function') showGestaoProgramacaoProducaoPanel();
        }
    };

    (openGestaoPanel[gestaoNav] || openGestaoPanel.pedido)();
}

async function restorePesquisasView(state) {
    if (!canAccessPesquisas()) {
        showWelcome();
        return;
    }

    hideSubViews();
    document.getElementById('pesquisas-view')?.classList.remove('hidden');
    updateMainNavActive('pesquisas');
    updateAdminNav();

    const savedSection = state.pesquisasSection || 'revisions';
    pesquisasActiveSection = ['revisions', 'requests', 'purchases'].includes(savedSection)
        ? savedSection
        : 'revisions';

    if (typeof renderPesquisasSidebar === 'function') renderPesquisasSidebar();
    if (typeof loadPesquisasContent === 'function') await loadPesquisasContent();
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
    if (typeof updatePesquisasNav === 'function') updatePesquisasNav();

    const gestorSection = typeof getPrimaryGestorPendenciasSection === 'function'
        ? getPrimaryGestorPendenciasSection()
        : null;
    const savedSection = state.pendenciasSection || null;
    const gestorSections = ['gestor-projetos', 'gestor-comercial', 'gestor-fabrica'];

    if (gestorSection && (!savedSection || !gestorSections.includes(savedSection))) {
        pendenciasActiveSection = gestorSection;
        pendenciasActiveItem = null;
    } else if (typeof getDefaultPendenciasSection === 'function') {
        pendenciasActiveSection = savedSection || getDefaultPendenciasSection();
        pendenciasActiveItem = state.pendenciasItem || null;
    } else {
        pendenciasActiveSection = savedSection || null;
        pendenciasActiveItem = state.pendenciasItem || null;
    }

    if (typeof renderPendenciasSidebar === 'function') renderPendenciasSidebar();
    if (typeof loadPendenciasContent === 'function') await loadPendenciasContent();
}

async function restoreAppNavState() {
    const state = readAppNavState();
    if (!state?.view) return false;

    suppressAppNavPersist = true;

    try {
        if (typeof isThirdParty === 'function' && isThirdParty()) {
            await restorePendenciasView({
                view: 'pendencias',
                pendenciasSection: state.pendenciasSection,
                pendenciasItem: state.pendenciasItem
            });
            return true;
        }

        const legacyViewMap = {
            'programacao-projetos': 'project-scheduling'
        };
        const view = legacyViewMap[state.view] || state.view;

        switch (view) {
            case 'home':
                showWelcome();
                return true;
            case 'dashboard':
                showDashboard();
                if (state.activeOrderId && typeof selectOrder === 'function') {
                    await selectOrder(state.activeOrderId);
                    if (state.orderDetailTab && typeof switchOrderDetailTab === 'function') {
                        switchOrderDetailTab(state.orderDetailTab);
                        if (state.orderDetailTab === 'third-party'
                            && typeof loadOrderThirdPartyProjectsTab === 'function') {
                            await loadOrderThirdPartyProjectsTab(state.activeOrderId);
                        }
                    }
                }
                return true;
            case 'gestao':
                await restoreGestaoView(state);
                return true;
            case 'pendencias':
                await restorePendenciasView(state);
                return true;
            case 'pesquisas':
                await restorePesquisasView(state);
                return true;
            case 'calendar':
                if (typeof showCalendar === 'function') {
                    await showCalendar();
                    return true;
                }
                return false;
            case 'project-scheduling':
                if (typeof showProjectSchedulingView === 'function') {
                    await showProjectSchedulingView();
                    return true;
                }
                return false;
            case 'kanban':
                if (typeof showKanbanView === 'function') {
                    await showKanbanView();
                    return true;
                }
                return false;
            case 'programacao-montagem':
                if (typeof showProgramacaoMontagemView === 'function') {
                    await showProgramacaoMontagemView();
                    return true;
                }
                return false;
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
    if (typeof updateUserImpersonationBanner === 'function') {
        updateUserImpersonationBanner();
    }

    if (appShellReady) return;

    const skipRestore = typeof isImpersonating === 'function' && isImpersonating();
    const restored = skipRestore ? false : await restoreAppNavState();
    if (!restored) {
        if (typeof isThirdParty === 'function' && isThirdParty()
            && typeof canAccessPendencias === 'function' && canAccessPendencias()
            && typeof showPendencias === 'function') {
            showPendencias();
        } else {
            showWelcome();
        }
    }

    if (typeof initApp === 'function') initApp();
    appShellReady = true;
}

function updateAdminNav() {
    const thirdParty = typeof isThirdParty === 'function' && isThirdParty();
    document.getElementById("btn-inicio")?.classList.toggle("hidden", thirdParty);
    document.getElementById("btn-back-dashboard")?.classList.toggle("hidden", thirdParty);
    document.getElementById("btn-system-settings").classList.toggle("hidden", !isAdmin() || thirdParty);
    document.getElementById("btn-gestao").classList.toggle("hidden", !canAccessGestao());
    document.getElementById("btn-conversations-query").classList.toggle("hidden", !canSeeQueryNav());
    document.getElementById("btn-approvals-query").classList.toggle("hidden", !canSeeQueryNav());
    document.getElementById("btn-calendario").classList.toggle("hidden", !canAccessCalendar());
    document.getElementById("btn-kanban")?.classList.toggle("hidden", typeof canViewKanban === 'function' ? !canViewKanban() : true);
    document.getElementById("btn-project-scheduling")?.classList.toggle("hidden", !canViewProjectScheduling());
    document.getElementById("btn-programacao-montagem")?.classList.toggle("hidden", !canViewProgramacaoMontagem());
    if (typeof updateGestaoCadastrosNavVisibility === 'function') updateGestaoCadastrosNavVisibility();
    if (typeof updatePendenciasNav === 'function') updatePendenciasNav();
    if (typeof updatePesquisasNav === 'function') updatePesquisasNav();
    if (typeof updateOrderDetailTabsVisibility === 'function') updateOrderDetailTabsVisibility();
    if (typeof updateCalendarGoogleSyncControls === 'function') updateCalendarGoogleSyncControls();
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
        kanban: document.getElementById('btn-kanban'),
        'project-scheduling': document.getElementById('btn-project-scheduling'),
        'programacao-montagem': document.getElementById('btn-programacao-montagem'),
        gestao: document.getElementById('btn-gestao'),
        pendencias: document.getElementById('btn-pendencias'),
        pesquisas: document.getElementById('btn-pesquisas'),
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
    document.getElementById("pesquisas-view")?.classList.add("hidden");
}

function showDashboard() {
    if (typeof canAccessOrdersDashboard === 'function' && !canAccessOrdersDashboard()) {
        if (typeof canAccessPendencias === 'function' && canAccessPendencias() && typeof showPendencias === 'function') {
            showPendencias();
        } else {
            showWelcome();
        }
        return;
    }

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
    document.getElementById("btn-project-scheduling")?.addEventListener("click", () => {
        if (typeof showProjectSchedulingView === 'function') showProjectSchedulingView();
    });
    document.getElementById("btn-kanban")?.addEventListener("click", () => {
        if (typeof showKanbanView === 'function') showKanbanView();
    });
    document.getElementById("btn-programacao-montagem")?.addEventListener("click", () => {
        if (typeof showProgramacaoMontagemView === 'function') showProgramacaoMontagemView();
    });
}
