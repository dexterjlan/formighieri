function showMainPanel() {
    if (!currentUser) return;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("register-screen").classList.add("hidden");
    document.getElementById("register-screen").classList.remove("flex");
    document.getElementById("main-panel").classList.remove("hidden");
    const roleLabel = currentUser.role || "Sem perfil";
    document.getElementById("user-display").innerText =
        `Logado como: ${currentUser.name} (${roleLabel})`;
    updateAdminNav();
    updateCommercialApprovalButtonVisibility();
    showWelcome();
    initApp();
}

function updateAdminNav() {
    document.getElementById("btn-system-settings").classList.toggle("hidden", !isAdmin());
    document.getElementById("btn-gestao").classList.toggle("hidden", !canAccessGestao());
    document.getElementById("btn-conversations-query").classList.toggle("hidden", !canSeeQueryNav());
    document.getElementById("btn-approvals-query").classList.toggle("hidden", !canSeeQueryNav());
    document.getElementById("btn-calendario").classList.toggle("hidden", !canAccessGoogleCalendar());
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
    loadQueryFilterOptions();
    searchConversations();
}

function showApprovalsQuery() {
    if (!canSeeQueryNav()) return;
    hideSubViews();
    document.getElementById("approvals-query-view").classList.remove("hidden");
    updateMainNavActive('approvals');
    updateAdminNav();
    loadApprovalQueryFilterOptions();
    searchCommercialApprovalsQuery();
}

function bindNavigationEvents() {
    document.getElementById("btn-inicio").addEventListener("click", showWelcome);
    document.getElementById("btn-back-dashboard").addEventListener("click", showDashboard);
    document.getElementById("btn-conversations-query").addEventListener("click", showConversationsQuery);
    document.getElementById("btn-approvals-query").addEventListener("click", showApprovalsQuery);
}
