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
    showDashboard();
    initApp();
}

function updateAdminNav() {
    document.getElementById("btn-manage-users").classList.toggle("hidden", !isAdmin());
}

const MAIN_NAV_ACTIVE_CLASS = 'text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg';
const MAIN_NAV_INACTIVE_CLASS = 'text-xs bg-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg';

function updateMainNavActive(activeView) {
    const buttons = {
        dashboard: document.getElementById('btn-back-dashboard'),
        requests: document.getElementById('btn-conversations-query'),
        approvals: document.getElementById('btn-approvals-query')
    };

    Object.entries(buttons).forEach(([key, btn]) => {
        if (!btn) return;
        btn.className = key === activeView ? MAIN_NAV_ACTIVE_CLASS : MAIN_NAV_INACTIVE_CLASS;
    });
}

function hideSubViews() {
    document.getElementById("dashboard-view").classList.add("hidden");
    document.getElementById("users-admin-view").classList.add("hidden");
    document.getElementById("conversations-query-view").classList.add("hidden");
    document.getElementById("approvals-query-view").classList.add("hidden");
}

function showDashboard() {
    hideSubViews();
    document.getElementById("dashboard-view").classList.remove("hidden");
    updateMainNavActive('dashboard');
    document.getElementById("btn-manage-users").classList.toggle("hidden", !isAdmin());
}

function showUsersAdmin() {
    if (!isAdmin()) return;
    hideSubViews();
    document.getElementById("users-admin-view").classList.remove("hidden");
    updateMainNavActive(null);
    document.getElementById("btn-manage-users").classList.toggle("hidden", !isAdmin());
    loadUsersAdminList();
}

function showConversationsQuery() {
    hideSubViews();
    document.getElementById("conversations-query-view").classList.remove("hidden");
    updateMainNavActive('requests');
    document.getElementById("btn-manage-users").classList.toggle("hidden", !isAdmin());
    loadQueryFilterOptions();
    searchConversations();
}

function showApprovalsQuery() {
    hideSubViews();
    document.getElementById("approvals-query-view").classList.remove("hidden");
    updateMainNavActive('approvals');
    document.getElementById("btn-manage-users").classList.toggle("hidden", !isAdmin());
    loadApprovalQueryFilterOptions();
    searchCommercialApprovalsQuery();
}

function bindNavigationEvents() {
    document.getElementById("btn-back-dashboard").addEventListener("click", showDashboard);
    document.getElementById("btn-conversations-query").addEventListener("click", showConversationsQuery);
    document.getElementById("btn-approvals-query").addEventListener("click", showApprovalsQuery);
    document.getElementById("btn-manage-users").addEventListener("click", showUsersAdmin);
}
