function showAuthScreen(screenId) {
    if (typeof hideAuthScreens === 'function') {
        hideAuthScreens();
    }
    const screen = document.getElementById(screenId);
    if (!screen) return;
    screen.classList.remove('hidden');
    if (screenId !== 'login-screen') {
        screen.classList.add('flex');
    }
}

function showRegisterScreen() {
    showAuthScreen('register-screen');
    const statusEl = document.getElementById('register-status');
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
    }
}

function showForgotPasswordScreen() {
    showAuthScreen('forgot-password-screen');
    const loginEmail = document.getElementById('login-email')?.value?.trim();
    const forgotEmail = document.getElementById('forgot-password-email');
    if (forgotEmail && loginEmail && !forgotEmail.value) {
        forgotEmail.value = loginEmail;
    }
    const statusEl = document.getElementById('forgot-password-status');
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
    }
}

function showResetPasswordScreen() {
    showAuthScreen('reset-password-screen');
    const form = document.getElementById('reset-password-form');
    form?.reset();
    const statusEl = document.getElementById('reset-password-status');
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
    }
}

function showLoginScreen() {
    showAuthScreen('login-screen');
    const statusEl = document.getElementById('register-status');
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
    }
    const registerBtn = document.getElementById('btn-register-submit');
    if (registerBtn) {
        registerBtn.disabled = false;
        registerBtn.textContent = 'Criar Usuário';
    }
}

function initAppEvents() {
    document.getElementById("btn-show-register").addEventListener("click", showRegisterScreen);
    document.getElementById("btn-show-login").addEventListener("click", showLoginScreen);
    document.getElementById("btn-show-forgot-password")?.addEventListener("click", showForgotPasswordScreen);
    document.getElementById("btn-forgot-back-login")?.addEventListener("click", showLoginScreen);
    bindAppDialogEvents();
    bindOrderCodePickerEvents();
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
    bindOrderExportEvents();
    bindOrderProjectEvents();
    bindProjectCharacteristicsEvents();
    if (typeof bindThirdPartyProjectTabEvents === 'function') {
        bindThirdPartyProjectTabEvents();
    }
    if (typeof bindThirdPartyProjectRevisionEvents === 'function') {
        bindThirdPartyProjectRevisionEvents();
    }
    bindPreliminaryDesignEvents();
    bindMeasurementEvents();
    bindOrderProjectMontagemEvents();
    bindOrderProjectEntregaEvents();
    bindNomearEvents();
    bindImplementationEvents();
    bindDetailingEvents();
    bindPurchaseEvents();
    bindPpcpEvents();
    bindConversationEvents();
    bindRequestActivityEvents();
    bindCommercialApprovalEvents();
    bindCommercialRevisionEvents();
    if (typeof bindTechnicalReviewerRevisionEvents === 'function') {
        bindTechnicalReviewerRevisionEvents();
    }
    bindPendenciasEvents();
    bindPesquisasEvents();
    bindUsersAdminEvents();
}
