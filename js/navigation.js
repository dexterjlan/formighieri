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

function hideSubViews() {
    document.getElementById("dashboard-view").classList.add("hidden");
    document.getElementById("users-admin-view").classList.add("hidden");
    document.getElementById("conversations-query-view").classList.add("hidden");
    document.getElementById("approvals-query-view").classList.add("hidden");
}

function setQueryNavButtonsVisible(show) {
    document.getElementById("btn-conversations-query").classList.toggle("hidden", !show);
    document.getElementById("btn-approvals-query").classList.toggle("hidden", !show);
}

function showDashboard() {
    hideSubViews();
    document.getElementById("dashboard-view").classList.remove("hidden");
    document.getElementById("btn-back-dashboard").classList.add("hidden");
    setQueryNavButtonsVisible(true);
    document.getElementById("btn-manage-users").classList.toggle("hidden", !isAdmin());
}

function showUsersAdmin() {
    if (!isAdmin()) return;
    hideSubViews();
    document.getElementById("users-admin-view").classList.remove("hidden");
    setQueryNavButtonsVisible(false);
    document.getElementById("btn-manage-users").classList.add("hidden");
    document.getElementById("btn-back-dashboard").classList.remove("hidden");
    loadUsersAdminList();
}

function showConversationsQuery() {
    hideSubViews();
    document.getElementById("conversations-query-view").classList.remove("hidden");
    setQueryNavButtonsVisible(false);
    document.getElementById("btn-manage-users").classList.add("hidden");
    document.getElementById("btn-back-dashboard").classList.remove("hidden");
    loadQueryFilterOptions();
    searchConversations();
}

function showApprovalsQuery() {
    hideSubViews();
    document.getElementById("approvals-query-view").classList.remove("hidden");
    setQueryNavButtonsVisible(false);
    document.getElementById("btn-manage-users").classList.add("hidden");
    document.getElementById("btn-back-dashboard").classList.remove("hidden");
    loadApprovalQueryFilterOptions();
    searchCommercialApprovalsQuery();
}

function bindNavigationEvents() {
    document.getElementById("btn-conversations-query").addEventListener("click", showConversationsQuery);
    document.getElementById("btn-approvals-query").addEventListener("click", showApprovalsQuery);
    document.getElementById("btn-manage-users").addEventListener("click", showUsersAdmin);
    document.getElementById("btn-back-dashboard").addEventListener("click", showDashboard);
}
