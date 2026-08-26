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

async function enterApp(authUserId) {
    if (enterAppInProgress) {
        return enterAppInProgress;
    }

    enterAppInProgress = (async () => {
        await loadUserProfile(authUserId);
        await loadSystemSettings();
        showMainPanel();
    })();

    try {
        await enterAppInProgress;
    } catch (err) {
        console.error("enterApp:", err);
        alertAppDialog(err.message || "Erro ao entrar no sistema.");
        currentUser = null;
    } finally {
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

async function loadUserProfile(authUserId) {
    const { data: profile, error: profileError } = await queryAppUserByAuthId(authUserId);

    const { data: { user } } = await supabaseClient.auth.getUser();
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

        try {
            const email = document.getElementById("login-email").value.trim().toLowerCase();
            const password = document.getElementById("login-password").value;

            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error || !data.user) {
                alertAppDialog("Usuário ou senha inválidos." + (error ? " " + formatAuthError(error) : ""), { variant: 'error', title: 'Erro' });
                return;
            }

            await enterApp(data.user.id);
        } catch (err) {
            console.error("login:", err);
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
                await enterApp(data.user.id);
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

    document.getElementById("btn-logout").addEventListener("click", async function () {
        if (typeof clearAppNavState === 'function') clearAppNavState();
        await supabaseClient.auth.signOut();
        location.reload();
    });

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
            currentUser = null;
            appShellReady = false;
            if (typeof clearAppNavState === 'function') clearAppNavState();
            return;
        }
        if (!session) return;
        if (event === 'TOKEN_REFRESHED') return;
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            if (appShellReady) return;
            await enterApp(session.user.id);
        }
    });
}
