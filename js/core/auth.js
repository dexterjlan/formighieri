async function persistAppUserUpdate(payload, column, value, email, role) {
    const flagged = typeof withProdThirdPartyFlag === 'function'
        ? withProdThirdPartyFlag(payload, email, role)
        : payload;
    let { error } = await supabaseClient
        .from('appUsers')
        .update(flagged)
        .eq(column, value);

    if (error?.message?.includes('isThirdParty')) {
        ({ error } = await supabaseClient
            .from('appUsers')
            .update(payload)
            .eq(column, value));
    }

    return { error };
}

async function persistAppUserInsert(payload, email, role) {
    const flagged = typeof withProdThirdPartyFlag === 'function'
        ? withProdThirdPartyFlag(payload, email, role)
        : payload;
    let result = await supabaseClient
        .from('appUsers')
        .insert(flagged);

    if (result.error?.message?.includes('isThirdParty')) {
        result = await supabaseClient
            .from('appUsers')
            .insert(payload);
    }

    return result;
}

async function enterApp(authUserId, authUser = null) {
    if (enterAppInProgress) {
        return enterAppInProgress;
    }

    enterAppInProgress = (async () => {
        showAppSessionLoading('Entrando no FGP...', 'Carregando seu perfil');
        await Promise.all([
            loadUserProfile(authUserId, authUser),
            typeof loadSystemSettings === 'function'
                ? loadSystemSettings()
                : Promise.resolve()
        ]);
        showAppSessionLoading('Abrindo sua última tela...', 'Quase lá');
        await showMainPanel();
    })();

    try {
        await enterAppInProgress;
    } catch (err) {
        console.error("enterApp:", err);
        alertAppDialog(err.message || "Erro ao entrar no sistema.");
        currentUser = null;
    } finally {
        hideAppSessionLoading();
        enterAppInProgress = null;
    }
}

async function ensureAppUserOnRegister(user, name, email, role, session = null) {
    let activeSession = session;
    if (!activeSession) {
        ({ data: { session: activeSession } } = await supabaseClient.auth.getSession());
    }
    if (!activeSession) {
        await new Promise(resolve => setTimeout(resolve, 300));
        ({ data: { session: activeSession } } = await supabaseClient.auth.getSession());
    }
    if (!activeSession) {
        return { error: null, deferred: true };
    }

    // Aguarda o trigger handle_new_user criar o registro em appUsers, se necessário.
    await new Promise(resolve => setTimeout(resolve, 400));

    const { data: byAuth, error: readByAuthError } = await supabaseClient
        .from('appUsers')
        .select('id, role')
        .eq('authId', user.id)
        .maybeSingle();

    if (readByAuthError) {
        return { error: readByAuthError };
    }

    if (byAuth) {
        return persistAppUserUpdate({ name, email, role }, 'id', byAuth.id, email, role);
    }

    const { data: byEmail, error: readByEmailError } = await supabaseClient
        .from('appUsers')
        .select('id')
        .eq('email', email)
        .maybeSingle();

    if (readByEmailError) {
        return { error: readByEmailError };
    }

    if (byEmail) {
        return persistAppUserUpdate({ authId: user.id, name, role }, 'id', byEmail.id, email, role);
    }

    const insertResult = await persistAppUserInsert({
        authId: user.id,
        email,
        name,
        role,
        isActive: true
    }, email, role);

    if (insertResult.error?.code === '23505') {
        return persistAppUserUpdate({ name, email, role }, 'authId', user.id, email, role);
    }

    return insertResult;
}

async function syncRegisteredUserProfile(user, name, email, role, session = null) {
    const result = await ensureAppUserOnRegister(user, name, email, role, session);
    if (!result.error) return null;

    const { data: existing } = await supabaseClient
        .from('appUsers')
        .select('id')
        .eq('authId', user.id)
        .maybeSingle();

    if (existing) {
        const { error: updateError } = await persistAppUserUpdate(
            { name, email, role },
            'id',
            existing.id,
            email,
            role
        );
        return updateError;
    }

    return result.error;
}

async function applyMissingRoleFromMetadata(profile, user) {
    const normalized = normalizeAppUserProfile(profile);
    if (!normalized || normalized.role) return normalized;

    const metadataRole = user?.user_metadata?.role || null;
    if (!metadataRole) return normalized;

    const { data: updated, error } = await supabaseClient
        .from('appUsers')
        .update({ role: metadataRole })
        .eq('id', normalized.id)
        .select('id, name, email, role, isActive, authId, isConferenceReviewer, isCommercialManager, isProjectsManager, isPpcp, isReviewer, isFactoryManager, isDetailing, isThirdParty')
        .single();

    if (error) {
        console.warn('applyMissingRoleFromMetadata:', error.message);
        return normalized;
    }

    return normalizeAppUserProfile(updated || normalized);
}

async function queryAppUserByAuthId(authUserId) {
    let result = await supabaseClient
        .from('appUsers')
        .select('id, name, email, role, isActive, authId, isConferenceReviewer, isCommercialManager, isProjectsManager, isPpcp, isReviewer, isFactoryManager, isDetailing, isThirdParty')
        .eq('authId', authUserId)
        .maybeSingle();

    if (result.error?.message?.includes('isPpcp') || result.error?.message?.includes('isReviewer') || result.error?.message?.includes('isProjectLeader') || result.error?.message?.includes('isFactoryManager') || result.error?.message?.includes('isDetailing') || result.error?.message?.includes('isThirdParty')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name, email, role, isActive, authId, isConferenceReviewer, isCommercialManager, isProjectsManager')
            .eq('authId', authUserId)
            .maybeSingle();
    }

    return result;
}

async function refreshCurrentUserProfile() {
    if (!currentUser) return;

    const authId = currentUser.authId;
    const userId = currentUser.id;
    if (!authId && !userId) return;

    let query = supabaseClient
        .from('appUsers')
        .select('id, name, email, role, isActive, authId, isConferenceReviewer, isCommercialManager, isProjectsManager, isPpcp, isReviewer, isFactoryManager, isDetailing, isThirdParty');

    if (authId) {
        query = query.eq('authId', authId);
    } else {
        query = query.eq('id', userId);
    }

    let { data, error } = await query.maybeSingle();

    if (error?.message?.includes('isPpcp') || error?.message?.includes('isReviewer') || error?.message?.includes('isProjectLeader') || error?.message?.includes('isFactoryManager') || error?.message?.includes('isDetailing') || error?.message?.includes('isThirdParty')) {
        let fallbackQuery = supabaseClient
            .from('appUsers')
            .select('id, name, email, role, isActive, authId, isConferenceReviewer, isCommercialManager, isProjectsManager');
        fallbackQuery = authId
            ? fallbackQuery.eq('authId', authId)
            : fallbackQuery.eq('id', userId);
        ({ data, error } = await fallbackQuery.maybeSingle());
    }

    if (error || !data) return;

    currentUser = normalizeAppUserProfile({ ...currentUser, ...data });

    const roleLabel = currentUser.role || 'Sem perfil';
    const display = document.getElementById('user-display');
    if (display) {
        display.innerText = `Logado como: ${currentUser.name} (${roleLabel})`;
    }

    if (typeof updateAdminNav === 'function') updateAdminNav();
}

async function loadUserProfile(authUserId, authUser = null) {
    const profilePromise = queryAppUserByAuthId(authUserId);
    const userPromise = authUser?.id
        ? Promise.resolve(authUser)
        : supabaseClient.auth.getUser().then(({ data }) => data?.user || null);

    const [{ data: profile, error: profileError }, user] = await Promise.all([
        profilePromise,
        userPromise
    ]);

    if (!user) {
        throw new Error("Sessão inválida.");
    }

    const metadataRole = user.user_metadata?.role || null;

    if (profile) {
        if (profile.isActive === false) {
            await supabaseClient.auth.signOut();
            throw new Error("Usuário desativado. Entre em contato com o administrador.");
        }

        currentUser = await applyMissingRoleFromMetadata(profile, user);
        return;
    }

    const { data: legacyUser } = await supabaseClient
        .from('appUsers')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

    if (legacyUser) {
        const { data: linked, error: linkError } = await supabaseClient
            .from('appUsers')
            .update({
                authId: user.id,
                role: legacyUser.role || metadataRole || null
            })
            .eq('id', legacyUser.id)
            .select('*')
            .single();

        if (linked) {
            if (linked.isActive === false) {
                await supabaseClient.auth.signOut();
                throw new Error("Usuário desativado. Entre em contato com o administrador.");
            }
            currentUser = normalizeAppUserProfile(linked);
            return;
        }
        if (linkError) {
            console.warn("Erro ao vincular usuário legado:", linkError.message);
        }
    }

    const insertPayload = {
        authId: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email,
        role: metadataRole,
        isActive: true
    };
    const flaggedPayload = typeof withProdThirdPartyFlag === 'function'
        ? withProdThirdPartyFlag(insertPayload, user.email, metadataRole)
        : insertPayload;

    let createdResult = await supabaseClient
        .from('appUsers')
        .insert(flaggedPayload)
        .select('*')
        .single();

    if (createdResult.error?.message?.includes('isThirdParty')) {
        createdResult = await supabaseClient
            .from('appUsers')
            .insert(insertPayload)
            .select('*')
            .single();
    }

    const { data: created, error: insertError } = createdResult;

    if (created) {
        currentUser = normalizeAppUserProfile(created);
        return;
    }

    const detail = insertError?.message || profileError?.message || "verifique o SQL do Supabase";
    throw new Error("Não foi possível carregar seu perfil: " + detail);
}

function bindAuthEvents() {
    document.getElementById("login-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        const btn = document.getElementById("btn-login-submit");
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Entrando...";
        showAppSessionLoading('Entrando no FGP...', 'Validando acesso');

        try {
            const email = document.getElementById("login-email").value.trim().toLowerCase();
            const password = document.getElementById("login-password").value;

            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error || !data.user) {
                hideAppSessionLoading();
                alertAppDialog("Usuário ou senha inválidos." + (error ? " " + formatAuthError(error) : ""), { variant: 'error', title: 'Erro' });
                return;
            }

            await enterApp(data.user.id, data.user);
        } catch (err) {
            console.error("login:", err);
            hideAppSessionLoading();
            alertAppDialog(err.message || "Erro ao entrar no sistema.");
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    document.getElementById("register-form").addEventListener("submit", async function (e) {
        e.preventDefault();

        const name = document.getElementById("reg-name").value.trim();
        const email = document.getElementById("reg-email").value.trim().toLowerCase();
        const password = document.getElementById("reg-password").value;
        const passwordConfirm = document.getElementById("reg-password-confirm").value;
        const role = document.getElementById("reg-role").value;
        const btn = document.getElementById("btn-register-submit");
        const statusEl = document.getElementById("register-status");
        const originalText = btn?.textContent || 'Criar Usuário';

        if (password !== passwordConfirm) {
            alertAppDialog("As senhas não coincidem.");
            return;
        }

        if (!role) {
            alertAppDialog("Selecione o perfil (Consultor, Projetista, Marceneiro ou Comprador).");
            document.getElementById("reg-role").focus();
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Criando usuário...';
        }
        if (statusEl) {
            statusEl.textContent = `Criando usuário: ${name} (${email})`;
            statusEl.classList.remove('hidden');
        }

        try {
            const emailRedirectTo = typeof getAppPublicUrl === 'function'
                ? getAppPublicUrl()
                : window.location.origin.replace(/\/$/, '');

            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: { name, role },
                    emailRedirectTo
                }
            });

            if (error) {
                console.error("signUp error:", error);
                alertAppDialog("Erro ao criar usuário: " + formatAuthError(error));
                return;
            }

            if (!data?.user) {
                alertAppDialog("Não foi possível criar a conta. Este e-mail pode já estar cadastrado.");
                showLoginScreen();
                return;
            }

            if (data.session) {
                await supabaseClient.auth.updateUser({
                    data: { name, role }
                });
            }

            const profileError = await syncRegisteredUserProfile(
                data.user,
                name,
                email,
                role,
                data.session
            );
            if (profileError) {
                console.error("syncRegisteredUserProfile:", profileError);
                alertAppDialog("Conta criada no login, mas falhou ao salvar o perfil: " + formatAuthError(profileError)
                    + " — Execute supabase/rls-policies.sql no SQL Editor do Supabase.", { variant: 'error', title: 'Erro' });
            }

            if (data.session) {
                await enterApp(data.user.id, data.user);
                document.getElementById("register-form").reset();
                return;
            }

            alertAppDialog(
                `Conta criada para ${email}. Verifique sua caixa de entrada e confirme o e-mail para entrar no sistema.`,
                { variant: 'success', title: 'Usuário criado' }
            );
            document.getElementById("register-form").reset();
            showLoginScreen();
        } catch (err) {
            console.error("register:", err);
            alertAppDialog(err.message || "Erro ao criar usuário.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
            if (statusEl) {
                statusEl.textContent = '';
                statusEl.classList.add('hidden');
            }
        }
    });

    document.getElementById("forgot-password-form")?.addEventListener("submit", async function (e) {
        e.preventDefault();
        const btn = document.getElementById("btn-forgot-password-submit");
        const statusEl = document.getElementById("forgot-password-status");
        const originalText = btn?.textContent || "Enviar link";
        const email = document.getElementById("forgot-password-email")?.value.trim().toLowerCase();

        if (!email) {
            alertAppDialog("Informe o e-mail da conta.", { variant: "error", title: "Erro" });
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = "Enviando...";
        }
        if (statusEl) {
            statusEl.textContent = "Enviando link de recuperação...";
            statusEl.classList.remove("hidden", "text-red-600");
            statusEl.classList.add("text-slate-500");
        }

        try {
            const redirectTo = typeof getAppPublicUrl === "function"
                ? getAppPublicUrl()
                : window.location.origin.replace(/\/$/, "");

            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo
            });

            // Mesma mensagem com ou sem conta, para não revelar se o e-mail existe.
            if (error && !isPasswordRecoveryEnumerationError(error)) {
                console.error("resetPasswordForEmail:", error);
                alertAppDialog("Não foi possível enviar o e-mail: " + formatAuthError(error), {
                    variant: "error",
                    title: "Erro"
                });
                return;
            }

            alertAppDialog(
                "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.",
                { variant: "success", title: "E-mail enviado" }
            );
            document.getElementById("forgot-password-form")?.reset();
            showLoginScreen();
        } catch (err) {
            console.error("forgot-password:", err);
            alertAppDialog(err.message || "Erro ao enviar o e-mail de recuperação.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
            if (statusEl) {
                statusEl.textContent = "";
                statusEl.classList.add("hidden");
            }
        }
    });

    document.getElementById("reset-password-form")?.addEventListener("submit", async function (e) {
        e.preventDefault();
        const password = document.getElementById("reset-password")?.value || "";
        const passwordConfirm = document.getElementById("reset-password-confirm")?.value || "";
        const btn = document.getElementById("btn-reset-password-submit");
        const statusEl = document.getElementById("reset-password-status");
        const originalText = btn?.textContent || "Salvar nova senha";

        if (password.length < 6) {
            alertAppDialog("A senha deve ter no mínimo 6 caracteres.");
            return;
        }
        if (password !== passwordConfirm) {
            alertAppDialog("As senhas não coincidem.");
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = "Salvando...";
        }
        if (statusEl) {
            statusEl.textContent = "Atualizando senha...";
            statusEl.classList.remove("hidden");
        }

        try {
            const { error } = await supabaseClient.auth.updateUser({ password });
            if (error) {
                console.error("updateUser password:", error);
                alertAppDialog("Não foi possível atualizar a senha: " + formatAuthError(error), {
                    variant: "error",
                    title: "Erro"
                });
                return;
            }

            passwordRecoveryPending = false;
            clearAuthRedirectUrl();

            const { data: { session } } = await supabaseClient.auth.getSession();
            await alertAppDialog("Senha atualizada com sucesso.", {
                variant: "success",
                title: "Senha redefinida"
            });
            if (session?.user) {
                await enterApp(session.user.id, session.user);
            } else {
                showLoginScreen();
            }
        } catch (err) {
            console.error("reset-password:", err);
            alertAppDialog(err.message || "Erro ao atualizar a senha.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
            if (statusEl) {
                statusEl.textContent = "";
                statusEl.classList.add("hidden");
            }
        }
    });

    document.getElementById("btn-reset-back-login")?.addEventListener("click", async function () {
        passwordRecoveryPending = false;
        clearAuthRedirectUrl();
        await supabaseClient.auth.signOut();
        showLoginScreen();
    });

    document.getElementById("btn-logout").addEventListener("click", async function () {
        if (typeof clearAppNavState === 'function') clearAppNavState();
        await supabaseClient.auth.signOut();
        location.reload();
    });

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
            currentUser = null;
            appShellReady = false;
            passwordRecoveryPending = false;
            if (typeof clearAppNavState === 'function') clearAppNavState();
            return;
        }
        if (event === 'PASSWORD_RECOVERY') {
            beginPasswordRecovery();
            return;
        }
        if (!session) return;
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            if (passwordRecoveryPending || isPasswordRecoveryRedirect()) {
                beginPasswordRecovery();
                return;
            }
            if (hasAuthCallbackCode()) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                if (passwordRecoveryPending) {
                    beginPasswordRecovery();
                    return;
                }
            }
            if (appShellReady) return;
            showAppSessionLoading('Entrando no FGP...', 'Restaurando sua sessão');
            await enterApp(session.user.id, session.user);
        }
    });

    if (passwordRecoveryPending) {
        beginPasswordRecovery();
    }
}

function isPasswordRecoveryRedirect() {
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('type') === 'recovery') return true;
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
        return hashParams.get('type') === 'recovery';
    } catch {
        return false;
    }
}

function hasAuthCallbackCode() {
    try {
        return Boolean(new URLSearchParams(window.location.search).get('code'));
    } catch {
        return false;
    }
}

function isPasswordRecoveryEnumerationError(error) {
    const message = String(error?.message || error?.code || '').toLowerCase();
    return message.includes('user not found')
        || message.includes('unable to validate email')
        || message.includes('email not found');
}

function clearAuthRedirectUrl() {
    try {
        const url = new URL(window.location.href);
        url.hash = '';
        url.searchParams.delete('code');
        url.searchParams.delete('type');
        history.replaceState(null, '', url.pathname + url.search);
    } catch {
        history.replaceState(null, '', window.location.pathname);
    }
}

function beginPasswordRecovery() {
    passwordRecoveryPending = true;
    const resetScreen = document.getElementById('reset-password-screen');
    if (resetScreen && !resetScreen.classList.contains('hidden')) return;
    if (typeof showResetPasswordScreen === 'function') {
        showResetPasswordScreen();
    }
}
