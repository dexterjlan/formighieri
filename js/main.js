function showRegisterScreen() {
    document.getElementById("login-screen").classList.add("hidden");
    const register = document.getElementById("register-screen");
    register.classList.remove("hidden");
    register.classList.add("flex");
}

function showLoginScreen() {
    const register = document.getElementById("register-screen");
    register.classList.add("hidden");
    register.classList.remove("flex");
    document.getElementById("login-screen").classList.remove("hidden");
}

function initAppEvents() {
    document.getElementById("btn-show-register").addEventListener("click", showRegisterScreen);
    document.getElementById("btn-show-login").addEventListener("click", showLoginScreen);
    bindAuthEvents();
    bindNavigationEvents();
    bindSystemSettingsEvents();
    bindConversationsQueryEvents();
    bindCommercialApprovalQueryEvents();
    bindOrderEvents();
    bindOrderProjectEvents();
    bindConversationEvents();
    bindRequestActivityEvents();
    bindCommercialApprovalEvents();
    bindCommercialRevisionEvents();
}
