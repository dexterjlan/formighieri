const USER_IMPERSONATION_STORAGE_KEY = 'formighieri-impersonate-user-id';

let impersonationOriginalUser = null;

function isImpersonating() {
    return Boolean(impersonationOriginalUser?.id);
}

function canStartUserImpersonation() {
    return currentUser?.role === 'Admin' && !isImpersonating();
}

function readStoredImpersonationUserId() {
    try {
        return Number(sessionStorage.getItem(USER_IMPERSONATION_STORAGE_KEY)) || null;
    } catch (error) {
        console.warn('readStoredImpersonationUserId:', error);
        return null;
    }
}

function persistImpersonationUserId(userId) {
    try {
        const normalizedId = Number(userId);
        if (!normalizedId) {
            sessionStorage.removeItem(USER_IMPERSONATION_STORAGE_KEY);
            return;
        }
        sessionStorage.setItem(USER_IMPERSONATION_STORAGE_KEY, String(normalizedId));
    } catch (error) {
        console.warn('persistImpersonationUserId:', error);
    }
}

function clearUserImpersonationState() {
    impersonationOriginalUser = null;
    persistImpersonationUserId(null);
    updateUserImpersonationBanner();
}

function getLoggedInUserDisplayText() {
    if (!currentUser) return 'Usuário: -';
    const roleLabel = currentUser.role || 'Sem perfil';
    if (isImpersonating()) {
        return `Vendo como: ${currentUser.name} (${roleLabel})`;
    }
    return `Logado como: ${currentUser.name} (${roleLabel})`;
}

function updateUserImpersonationBanner() {
    const banner = document.getElementById('user-impersonation-banner');
    const textEl = document.getElementById('user-impersonation-banner-text');
    if (!banner) return;

    const active = isImpersonating();
    banner.classList.toggle('hidden', !active);

    if (!active || !textEl) return;

    const roleLabel = currentUser?.role || 'Sem perfil';
    const email = currentUser?.email ? ` · ${currentUser.email}` : '';
    textEl.textContent = `${currentUser?.name || 'Usuário'} (${roleLabel}${email})`;
}

async function queryAppUserById(userId) {
    const normalizedId = Number(userId);
    if (!normalizedId) return { data: null, error: new Error('Usuário inválido.') };

    let result = await supabaseClient
        .from('appUsers')
        .select('id, name, email, role, isActive, authId, isConferenceReviewer, isCommercialManager, isProjectsManager, isPpcp, isReviewer, isFactoryManager, isDetailing, isThirdParty, calendarColor')
        .eq('id', normalizedId)
        .maybeSingle();

    if (result.error?.message?.includes('calendarColor')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name, email, role, isActive, authId, isConferenceReviewer, isCommercialManager, isProjectsManager, isPpcp, isReviewer, isFactoryManager, isDetailing, isThirdParty')
            .eq('id', normalizedId)
            .maybeSingle();
    }

    if (result.error?.message?.includes('isFactoryManager') || result.error?.message?.includes('isPpcp') || result.error?.message?.includes('isReviewer') || result.error?.message?.includes('isProjectLeader') || result.error?.message?.includes('isDetailing') || result.error?.message?.includes('isThirdParty')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name, email, role, isActive, authId, isConferenceReviewer, isCommercialManager, isProjectsManager')
            .eq('id', normalizedId)
            .maybeSingle();
    }

    return result;
}

function applyImpersonatedUserUi() {
    updateUserImpersonationBanner();

    if (typeof refreshLoggedInUserDisplay === 'function') {
        refreshLoggedInUserDisplay();
        return;
    }

    const display = document.getElementById('user-display');
    if (display) display.innerText = getLoggedInUserDisplayText();
    if (typeof updateAdminNav === 'function') updateAdminNav();
}

function openImpersonatedUserHome() {
    if (typeof clearAppNavState === 'function') clearAppNavState();

    if (typeof isThirdParty === 'function' && isThirdParty()
        && typeof canAccessPendencias === 'function' && canAccessPendencias()
        && typeof showPendencias === 'function') {
        showPendencias();
        return;
    }

    if (typeof showWelcome === 'function') {
        showWelcome();
        return;
    }

    if (typeof hideSubViews === 'function') hideSubViews();
}

async function startUserImpersonation(userId) {
    if (!canStartUserImpersonation()) {
        alertAppDialog('Somente um administrador no próprio perfil pode ver como outro usuário.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return;
    }

    const normalizedId = Number(userId);
    if (!normalizedId || normalizedId === Number(currentUser.id)) return;

    const { data: profile, error } = await queryAppUserById(normalizedId);
    if (error) {
        alertAppDialog(`Erro ao carregar usuário: ${error.message}`);
        return;
    }

    const target = typeof normalizeAppUserProfile === 'function'
        ? normalizeAppUserProfile(profile)
        : profile;

    if (!target?.id) {
        alertAppDialog('Usuário não encontrado.');
        return;
    }

    if (target.isActive === false) {
        alertAppDialog('Só é possível ver como usuários ativos.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const roleLabel = target.role || 'Sem perfil';
    const confirmed = await confirmAppDialog(
        `Ver o sistema como ${target.name} (${roleLabel})?\n\nMenu, pendências e permissões passam a ser os deste usuário. Sua sessão de login continua sendo a sua.`,
        { title: 'Ver como usuário', confirmLabel: 'Ver como' }
    );
    if (!confirmed) return;

    impersonationOriginalUser = typeof normalizeAppUserProfile === 'function'
        ? normalizeAppUserProfile({ ...currentUser })
        : { ...currentUser };
    currentUser = target;
    persistImpersonationUserId(target.id);
    applyImpersonatedUserUi();
    openImpersonatedUserHome();
}

async function stopUserImpersonation() {
    if (!isImpersonating()) return;

    const originalId = Number(impersonationOriginalUser.id);
    const { data: profile } = originalId ? await queryAppUserById(originalId) : { data: null };
    const restored = profile
        ? (typeof normalizeAppUserProfile === 'function' ? normalizeAppUserProfile(profile) : profile)
        : impersonationOriginalUser;

    impersonationOriginalUser = null;
    persistImpersonationUserId(null);
    currentUser = restored;
    applyImpersonatedUserUi();

    if (typeof showUsersAdmin === 'function') {
        showUsersAdmin();
        return;
    }

    if (typeof showWelcome === 'function') showWelcome();
}

async function restoreUserImpersonationIfNeeded() {
    const storedId = readStoredImpersonationUserId();
    if (!storedId) {
        impersonationOriginalUser = null;
        updateUserImpersonationBanner();
        return;
    }

    if (currentUser?.role !== 'Admin') {
        clearUserImpersonationState();
        return;
    }

    if (storedId === Number(currentUser.id)) {
        clearUserImpersonationState();
        return;
    }

    const { data: profile, error } = await queryAppUserById(storedId);
    const target = typeof normalizeAppUserProfile === 'function'
        ? normalizeAppUserProfile(profile)
        : profile;

    if (error || !target?.id || target.isActive === false) {
        clearUserImpersonationState();
        return;
    }

    impersonationOriginalUser = typeof normalizeAppUserProfile === 'function'
        ? normalizeAppUserProfile({ ...currentUser })
        : { ...currentUser };
    currentUser = target;
    persistImpersonationUserId(target.id);
    updateUserImpersonationBanner();
}

function bindUserImpersonationEvents() {
    document.getElementById('btn-stop-user-impersonation')?.addEventListener('click', () => {
        stopUserImpersonation();
    });
}
