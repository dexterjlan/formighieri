function showRegisterScreen() {
    document.getElementById("login-screen").classList.add("hidden");
    const register = document.getElementById("register-screen");
    register.classList.remove("hidden");
    register.classList.add("flex");
    const statusEl = document.getElementById("register-status");
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
    }
}

function showLoginScreen() {
    const register = document.getElementById("register-screen");
    register.classList.add("hidden");
    register.classList.remove("flex");
    document.getElementById("login-screen").classList.remove("hidden");
    const statusEl = document.getElementById("register-status");
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
    }
    const registerBtn = document.getElementById("btn-register-submit");
    if (registerBtn) {
        registerBtn.disabled = false;
        registerBtn.textContent = 'Criar Usuário';
    }
}

function initAppEvents() {
    document.getElementById("btn-show-register").addEventListener("click", showRegisterScreen);
    document.getElementById("btn-show-login").addEventListener("click", showLoginScreen);
    bindAppDialogEvents();
    bindAuthEvents();
    bindNavigationEvents();
    bindResponsiveLayout();
    bindCalendarEvents();
    bindWelcomeEvents();
    bindGestaoEvents();
    bindSystemSettingsEvents();
    bindConversationsQueryEvents();
    bindCommercialApprovalQueryEvents();
    bindOrderEvents();
    bindOrderProjectEvents();
    bindAnteprojetoEvents();
    bindMedicaoEvents();
    bindFabricaEvents();
    bindNomearEvents();
    bindImplantacaoEvents();
    bindCompraEvents();
    bindPpcpEvents();
    bindConversationEvents();
    bindRequestActivityEvents();
    bindCommercialApprovalEvents();
    bindCommercialRevisionEvents();
    bindPendenciasEvents();
    bindUsersAdminEvents();
}
