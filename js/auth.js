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
        alert(err.message || "Erro ao entrar no sistema.");
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
        const { error } = await supabaseClient
            .from('appUsers')
            .update({ name, email, role })
            .eq('id', byAuth.id);
        return { error };
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
        const { error } = await supabaseClient
            .from('appUsers')
            .update({ authId: user.id, name, role })
            .eq('id', byEmail.id);
        return { error };
    }

    const { error } = await supabaseClient
        .from('appUsers')
        .insert({ authId: user.id, email, name, role, isActive: true });

    if (error?.code === '23505') {
        const { error: updateError } = await supabaseClient
            .from('appUsers')
            .update({ name, email, role })
            .eq('authId', user.id);
        return { error: updateError };
    }

    return { error };
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
        const { error: updateError } = await supabaseClient
            .from('appUsers')
            .update({ name, email, role })
            .eq('id', existing.id);
        return updateError;
    }

    return result.error;
}

async function applyMissingRoleFromMetadata(profile, user) {
    if (!profile || profile.role) return profile;

    const metadataRole = user?.user_metadata?.role || null;
    if (!metadataRole) return profile;

    const { data: updated, error } = await supabaseClient
        .from('appUsers')
        .update({ role: metadataRole })
        .eq('id', profile.id)
        .select('*')
        .single();

    if (error) {
        console.warn('applyMissingRoleFromMetadata:', error.message);
        return profile;
    }

    return updated || profile;
}

async function loadUserProfile(authUserId) {
    const { data: profile, error: profileError } = await supabaseClient
        .from('appUsers')
        .select('*')
        .eq('authId', authUserId)
        .maybeSingle();

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
            currentUser = linked;
            return;
        }
        if (linkError) {
            console.warn("Erro ao vincular usuário legado:", linkError.message);
        }
    }

    const { data: created, error: insertError } = await supabaseClient
        .from('appUsers')
        .insert({
            authId: user.id,
            email: user.email,
            name: user.user_metadata?.name || user.email,
            role: metadataRole,
            isActive: true
        })
        .select('*')
        .single();

    if (created) {
        currentUser = created;
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
                alert("Usuário ou senha inválidos." + (error ? " " + formatAuthError(error) : ""));
                return;
            }

            await enterApp(data.user.id);
        } catch (err) {
            console.error("login:", err);
            alert(err.message || "Erro ao entrar no sistema.");
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

        if (password !== passwordConfirm) {
            alert("As senhas não coincidem.");
            return;
        }

        if (!role) {
            alert("Selecione o perfil (Consultor ou Projetista).");
            document.getElementById("reg-role").focus();
            return;
        }

        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: { name, role }
            }
        });

        if (error) {
            console.error("signUp error:", error);
            alert("Erro ao criar usuário: " + formatAuthError(error));
            return;
        }

        if (!data?.user) {
            alert("Não foi possível criar a conta. Este e-mail pode já estar cadastrado.");
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
            alert("Conta criada no login, mas falhou ao salvar o perfil: " + formatAuthError(profileError)
                + " — Execute supabase/rls-policies.sql no SQL Editor do Supabase.");
        }

        if (data.session) {
            await enterApp(data.user.id);
            document.getElementById("register-form").reset();
            return;
        }

        alert("Conta criada! Faça login após a confirmação do e-mail (se solicitada).");
        document.getElementById("register-form").reset();
        showLoginScreen();
    });

    document.getElementById("btn-logout").addEventListener("click", async function () {
        await supabaseClient.auth.signOut();
        location.reload();
    });

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
            currentUser = null;
            return;
        }
        if (event === 'INITIAL_SESSION' && session) {
            await enterApp(session.user.id);
        }
    });
}
