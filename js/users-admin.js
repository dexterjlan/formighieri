const USER_FLAG_CONFIG = [
    {
        id: 'conferente',
        label: 'Conferente',
        hint: 'Medição e anteprojeto',
        appliesTo: role => role === 'Projetista'
    },
    {
        id: 'gestor-comercial',
        label: 'Gestor comercial',
        hint: 'Aprovações comerciais',
        appliesTo: role => role === 'Admin'
    },
    {
        id: 'gestor-projetos',
        label: 'Gestor de projetos',
        hint: 'Pendências de projetos',
        appliesTo: role => role === 'Admin' || role === 'Projetista'
    },
    {
        id: 'ppcp',
        label: 'PPCP',
        hint: 'Aba PPCP do pedido',
        appliesTo: role => role === 'Projetista'
    },
    {
        id: 'gestor-fabrica',
        label: 'Gestor de Fábrica',
        hint: 'Aba Fábrica e Gestão',
        appliesTo: role => role === 'Marceneiro'
    }
];

const USER_ROLE_CARD_STYLES = {
    Admin: {
        accent: 'border-l-slate-800',
        bg: 'bg-slate-50',
        ring: 'ring-slate-100'
    },
    Projetista: {
        accent: 'border-l-violet-500',
        bg: 'bg-violet-50/70',
        ring: 'ring-violet-100'
    },
    Consultor: {
        accent: 'border-l-sky-500',
        bg: 'bg-sky-50/70',
        ring: 'ring-sky-100'
    },
    Marceneiro: {
        accent: 'border-l-orange-500',
        bg: 'bg-orange-50/70',
        ring: 'ring-orange-100'
    },
    '': {
        accent: 'border-l-slate-300',
        bg: 'bg-white',
        ring: 'ring-slate-100'
    }
};

function getUserCardStyle(role) {
    return USER_ROLE_CARD_STYLES[role] || USER_ROLE_CARD_STYLES[''];
}

function buildUserRoleBadges(u) {
    const isAdminUser = u.role === 'Admin';
    const isProjetistaUser = u.role === 'Projetista';
    const isMarceneiroUser = u.role === 'Marceneiro';
    const canHaveGestorProjetos = isAdminUser || isProjetistaUser;
    const badges = [];

    if (u.role === 'Admin') {
        badges.push('<span class="text-[10px] font-bold uppercase bg-slate-900 text-amber-500 px-2 py-0.5 rounded">Admin</span>');
    } else if (u.role) {
        badges.push(`<span class="text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded">${escapeHtml(u.role)}</span>`);
    } else {
        badges.push('<span class="text-[10px] font-semibold uppercase bg-slate-100 text-slate-400 px-2 py-0.5 rounded">Sem perfil</span>');
    }

    if (isProjetistaUser && u.conferente) badges.push('<span class="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-100">Conferente</span>');
    if (isAdminUser && u.gestorComercial) badges.push('<span class="text-[10px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-100">Gestor comercial</span>');
    if (canHaveGestorProjetos && u.gestorProjetos) badges.push('<span class="text-[10px] bg-violet-50 text-violet-800 px-2 py-0.5 rounded border border-violet-100">Gestor de projetos</span>');
    if (isProjetistaUser && u.ppcp) badges.push('<span class="text-[10px] bg-violet-50 text-violet-800 px-2 py-0.5 rounded border border-violet-100">PPCP</span>');
    if (isMarceneiroUser && u.gestorFabrica) badges.push('<span class="text-[10px] bg-orange-50 text-orange-800 px-2 py-0.5 rounded border border-orange-100">Gestor de Fábrica</span>');

    return badges.join('');
}

function getApplicableFlags(role) {
    if (!role) return [];
    return USER_FLAG_CONFIG.filter(flag => flag.appliesTo(role));
}

function buildUserFlagCheckbox(u, flag) {
    const checkId = `${flag.id}-check-${u.id}`;
    const checkedMap = {
        conferente: Boolean(u.conferente),
        'gestor-comercial': Boolean(u.gestorComercial),
        'gestor-projetos': Boolean(u.gestorProjetos),
        ppcp: Boolean(u.ppcp),
        'gestor-fabrica': Boolean(u.gestorFabrica)
    };

    return `
        <label class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/80 bg-white/70 hover:bg-white cursor-pointer text-[10px] font-medium text-slate-700"
            title="${flag.hint}">
            <input type="checkbox" id="${checkId}" ${checkedMap[flag.id] ? 'checked' : ''}
                class="h-3 w-3 shrink-0 rounded border-slate-300 text-amber-600 focus:ring-amber-500">
            ${flag.label}
        </label>
    `;
}

function buildUserFlagsHtml(u, isActive, role) {
    if (!isActive) {
        return '<p class="text-[10px] text-slate-400 italic">Reative para editar.</p>';
    }
    if (!role) {
        return '<p class="text-[10px] text-slate-400 italic">Selecione o perfil.</p>';
    }

    const flags = getApplicableFlags(role);
    if (!flags.length) {
        return '<p class="text-[10px] text-slate-400 italic">Sem permissões extras.</p>';
    }

    return flags.map(flag => buildUserFlagCheckbox(u, flag)).join('');
}

function readUserFlagChecks(userId) {
    const checks = {};
    USER_FLAG_CONFIG.forEach(flag => {
        const check = document.getElementById(`${flag.id}-check-${userId}`);
        if (check) checks[flag.id] = check.checked;
    });
    return checks;
}

function mergeUserFlagChecks(u, checks) {
    return {
        ...u,
        conferente: checks.conferente ?? u.conferente,
        gestorComercial: checks['gestor-comercial'] ?? u.gestorComercial,
        gestorProjetos: checks['gestor-projetos'] ?? u.gestorProjetos,
        ppcp: checks.ppcp ?? u.ppcp,
        gestorFabrica: checks['gestor-fabrica'] ?? u.gestorFabrica
    };
}

function renderUserFlagsGrid(flagsGrid, u, isActive, role) {
    if (!flagsGrid) return;
    const flags = isActive && role ? getApplicableFlags(role) : [];
    flagsGrid.className = flags.length ? 'flex flex-wrap gap-1.5' : '';
    flagsGrid.innerHTML = buildUserFlagsHtml(u, isActive, role);
}

let usersAdminCache = [];

function getUsersAdminFilters() {
    return {
        name: document.getElementById('users-filter-name')?.value.trim().toLowerCase() || '',
        role: document.getElementById('users-filter-role')?.value || ''
    };
}

function userMatchesAdminFilters(u, filters) {
    if (filters.name) {
        const haystack = `${u.name || ''} ${u.email || ''}`.toLowerCase();
        if (!haystack.includes(filters.name)) return false;
    }

    if (filters.role) {
        if (filters.role === '__none__') {
            if (u.role) return false;
        } else if ((u.role || '') !== filters.role) {
            return false;
        }
    }

    return true;
}

function updateUsersAdminCount(shown, total) {
    const el = document.getElementById('users-admin-count');
    if (!el) return;

    if (!total) {
        el.textContent = '';
        return;
    }

    el.textContent = shown === total
        ? `${total} usuário${total === 1 ? '' : 's'}`
        : `${shown} de ${total} usuário${total === 1 ? '' : 's'}`;
}

function renderUsersAdminCards(users) {
    const container = document.getElementById("users-admin-list");
    container.innerHTML = "";

    if (!users.length) {
        const hasFilters = Boolean(getUsersAdminFilters().name || getUsersAdminFilters().role);
        container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 bg-white rounded-lg border border-slate-200">${hasFilters ? 'Nenhum usuário encontrado com os filtros aplicados.' : 'Nenhum usuário cadastrado.'}</div>`;
        return;
    }

    users.forEach(u => {
        const card = document.createElement("article");
        const isSelf = u.id === currentUser.id;
        const isActive = u.isActive !== false;
        const statusBadge = isActive
            ? '<span class="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full shrink-0">Ativo</span>'
            : '<span class="text-[10px] font-bold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded-full shrink-0">Inativo</span>';
        const toggleLabel = isActive ? 'Desativar' : 'Reativar';
        const toggleClass = isActive
            ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200';
        const disableToggle = isSelf ? 'disabled title="Você não pode desativar a si mesmo"' : '';
        const disableEdit = !isActive ? 'disabled title="Reative o usuário para editar"' : '';
        const initialRole = u.role || '';
        const cardStyle = getUserCardStyle(initialRole);

        card.className = `rounded-lg border border-slate-200 border-l-4 ${cardStyle.accent} ${cardStyle.bg} ring-1 ${cardStyle.ring} overflow-hidden ${isActive ? '' : 'opacity-70'}`;
        card.innerHTML = `
            <div class="px-3 py-2.5">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div class="min-w-[160px] flex-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <h3 class="text-xs font-semibold ${isActive ? 'text-slate-900' : 'text-slate-400 line-through'}">${escapeHtml(u.name)}</h3>
                            ${statusBadge}
                            ${isSelf ? '<span class="text-[9px] text-slate-400">(você)</span>' : ''}
                        </div>
                        <p class="text-[10px] text-slate-500 truncate">${escapeHtml(u.email)}</p>
                        <div class="flex flex-wrap gap-1 mt-1">${buildUserRoleBadges(u)}</div>
                    </div>

                    <div class="w-32 shrink-0">
                        <label for="role-select-${u.id}" class="block text-[9px] font-semibold uppercase text-slate-400 mb-0.5">Perfil</label>
                        <select id="role-select-${u.id}" ${disableEdit}
                            class="w-full px-2 py-1 text-xs border border-slate-200/80 rounded-md bg-white/90 focus:outline-none focus:border-amber-600 disabled:bg-slate-100 disabled:text-slate-400">
                            <option value="">...</option>
                            <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
                            <option value="Projetista" ${u.role === 'Projetista' ? 'selected' : ''}>Projetista</option>
                            <option value="Consultor" ${u.role === 'Consultor' ? 'selected' : ''}>Consultor</option>
                            <option value="Marceneiro" ${u.role === 'Marceneiro' ? 'selected' : ''}>Marceneiro</option>
                        </select>
                    </div>

                    <div class="min-w-[140px] flex-1">
                        <p class="text-[9px] font-semibold uppercase text-slate-400 mb-0.5">Permissões</p>
                        <div id="flags-grid-${u.id}"></div>
                    </div>

                    <div class="flex gap-1.5 shrink-0">
                        <button type="button" onclick="saveUserRole(${u.id})" ${isActive ? '' : 'disabled'}
                            class="bg-amber-600 text-white text-[10px] px-2.5 py-1 rounded-md font-medium hover:bg-amber-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                            Salvar
                        </button>
                        <button type="button" onclick="toggleUserActive(${u.id}, ${isActive})" ${disableToggle}
                            class="text-[10px] px-2.5 py-1 rounded-md font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${toggleClass}">
                            ${toggleLabel}
                        </button>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(card);

        const roleSelect = document.getElementById(`role-select-${u.id}`);
        const flagsGrid = document.getElementById(`flags-grid-${u.id}`);

        const updateCardColor = (role) => {
            const style = getUserCardStyle(role);
            card.className = `rounded-lg border border-slate-200 border-l-4 ${style.accent} ${style.bg} ring-1 ${style.ring} overflow-hidden ${isActive ? '' : 'opacity-70'}`;
        };

        renderUserFlagsGrid(flagsGrid, u, isActive, initialRole);

        if (roleSelect && !roleSelect.disabled) {
            roleSelect.addEventListener('change', () => {
                const role = roleSelect.value || '';
                const checks = readUserFlagChecks(u.id);
                updateCardColor(role);
                renderUserFlagsGrid(flagsGrid, mergeUserFlagChecks(u, checks), isActive, role);
            });
        }
    });
}

function applyUsersAdminFilters() {
    const filters = getUsersAdminFilters();
    const filtered = usersAdminCache.filter(u => userMatchesAdminFilters(u, filters));
    updateUsersAdminCount(filtered.length, usersAdminCache.length);
    renderUsersAdminCards(filtered);
}

async function loadUsersAdminList() {
    let result = await supabaseClient
        .from('appUsers')
        .select('id, name, email, role, isActive, authId, conferente, gestorComercial, gestorProjetos, ppcp, gestorFabrica')
        .order('name', { ascending: true });

    if (result.error?.message?.includes('gestorFabrica') || result.error?.message?.includes('ppcp')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name, email, role, isActive, authId, conferente, gestorComercial, gestorProjetos')
            .order('name', { ascending: true });
    }

    if (result.error?.message?.includes('gestorProjetos') || result.error?.message?.includes('gestorComercial')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name, email, role, isActive, authId, conferente')
            .order('name', { ascending: true });
    }

    const { data: users, error } = result;
    const container = document.getElementById("users-admin-list");

    if (error || !users) {
        usersAdminCache = [];
        updateUsersAdminCount(0, 0);
        container.innerHTML = '<div class="p-4 text-xs text-red-500 bg-white rounded-lg border border-red-100">Erro ao carregar usuários.</div>';
        return;
    }

    usersAdminCache = users;
    applyUsersAdminFilters();
}

function bindUsersAdminEvents() {
    document.getElementById('users-filter-name')?.addEventListener('input', applyUsersAdminFilters);
    document.getElementById('users-filter-role')?.addEventListener('change', applyUsersAdminFilters);
    document.getElementById('btn-users-clear-filters')?.addEventListener('click', () => {
        const nameInput = document.getElementById('users-filter-name');
        const roleSelect = document.getElementById('users-filter-role');
        if (nameInput) nameInput.value = '';
        if (roleSelect) roleSelect.value = '';
        applyUsersAdminFilters();
    });
}

function refreshLoggedInUserDisplay() {
    if (!currentUser) return;

    const roleLabel = currentUser.role || 'Sem perfil';
    const display = document.getElementById('user-display');
    if (display) {
        display.innerText = `Logado como: ${currentUser.name} (${roleLabel})`;
    }

    if (typeof updateAdminNav === 'function') updateAdminNav();
    if (typeof updatePendenciasNav === 'function') updatePendenciasNav();
    if (typeof updateAnteprojetoActionButtons === 'function') updateAnteprojetoActionButtons();
    if (typeof updateOrderDetailTabsVisibility === 'function') updateOrderDetailTabsVisibility();
}

async function saveUserRole(userId) {
    if (!isAdmin()) return;

    const select = document.getElementById(`role-select-${userId}`);
    const conferenteCheck = document.getElementById(`conferente-check-${userId}`);
    const gestorComercialCheck = document.getElementById(`gestor-comercial-check-${userId}`);
    const gestorProjetosCheck = document.getElementById(`gestor-projetos-check-${userId}`);
    const ppcpCheck = document.getElementById(`ppcp-check-${userId}`);
    const gestorFabricaCheck = document.getElementById(`gestor-fabrica-check-${userId}`);
    const role = select?.value;
    const conferente = role === 'Projetista' && Boolean(conferenteCheck?.checked);
    const gestorComercial = role === 'Admin' && Boolean(gestorComercialCheck?.checked);
    const gestorProjetos = (role === 'Admin' || role === 'Projetista') && Boolean(gestorProjetosCheck?.checked);
    const ppcp = role === 'Projetista' && Boolean(ppcpCheck?.checked);
    const gestorFabrica = role === 'Marceneiro' && Boolean(gestorFabricaCheck?.checked);

    if (!role) {
        alert("Selecione Admin, Projetista, Consultor ou Marceneiro.");
        return;
    }

    let payload = { role, conferente, gestorComercial, gestorProjetos, ppcp, gestorFabrica };
    let { error } = await supabaseClient
        .from('appUsers')
        .update(payload)
        .eq('id', userId);

    if (error?.message?.includes('gestorFabrica') || error?.message?.includes('ppcp')) {
        payload = { role, conferente, gestorComercial, gestorProjetos };
        ({ error } = await supabaseClient
            .from('appUsers')
            .update(payload)
            .eq('id', userId));
    }

    if (error?.message?.includes('gestorProjetos') || error?.message?.includes('gestorComercial')) {
        ({ error } = await supabaseClient
            .from('appUsers')
            .update({ role, conferente })
            .eq('id', userId));
    }

    if (error) {
        alert("Erro ao salvar usuário: " + error.message);
        return;
    }

    if (userId === currentUser.id) {
        currentUser = {
            ...currentUser,
            role,
            conferente,
            gestorComercial,
            gestorProjetos,
            ppcp,
            gestorFabrica
        };
        currentUser = normalizeAppUserProfile(currentUser);
        refreshLoggedInUserDisplay();
    }

    alert("Usuário atualizado com sucesso.");
    loadUsersAdminList();
}

async function toggleUserActive(userId, currentlyActive) {
    if (!isAdmin()) return;
    if (userId === currentUser.id) {
        alert("Você não pode desativar a si mesmo.");
        return;
    }

    const action = currentlyActive ? 'desativar' : 'reativar';
    if (!confirm(`Confirma ${action} este usuário?${currentlyActive ? ' Ele não poderá mais fazer login.' : ''}`)) {
        return;
    }

    const { error } = await supabaseClient
        .from('appUsers')
        .update({ isActive: !currentlyActive })
        .eq('id', userId);

    if (error) {
        alert("Erro ao atualizar status: " + error.message);
        return;
    }

    loadUsersAdminList();
}

window.saveUserRole = saveUserRole;
window.toggleUserActive = toggleUserActive;
