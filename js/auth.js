async function enterApp(authUserId) {
    if (enterAppInProgress) {
        return enterAppInProgress;
    }

    enterAppInProgress = (async () => {
        await loadUserProfile(authUserId);
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

async function loadUserProfile(authUserId) {
    const { data: profile, error: profileError } = await supabaseClient
        .from('appUsers')
        .select('*')
        .eq('authId', authUserId)
        .maybeSingle();

    if (profile) {
        if (profile.isActive === false) {
            await supabaseClient.auth.signOut();
            throw new Error("Usuário desativado. Entre em contato com o administrador.");
        }
        currentUser = profile;
        return;
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        throw new Error("Sessão inválida.");
    }

    const { data: legacyUser } = await supabaseClient
        .from('appUsers')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

    if (legacyUser) {
        const { data: linked, error: linkError } = await supabaseClient
            .from('appUsers')
            .update({ authId: user.id })
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

        if (password !== passwordConfirm) {
            alert("As senhas não coincidem.");
            return;
        }

        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: { name }
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
            await enterApp(data.user.id);
            document.getElementById("register-form").reset();
            return;
        }

        alert("Conta criada! Um administrador definirá seu perfil. Faça login após a confirmação do e-mail (se solicitada).");
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
