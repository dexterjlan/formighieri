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
        appliesTo: role => role === 'Admin' || role === 'Consultor'
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
        id: 'revisor',
        label: 'Revisor',
        hint: 'Revisão técnica do revisor antes de Nomear',
        appliesTo: role => role === 'Projetista'
    },
    {
        id: 'detalhamento',
        label: 'Detalhamento',
        hint: 'Fluxo de detalhamento em produção',
        appliesTo: role => role === 'Projetista'
    },
    {
        id: 'gestor-fabrica',
        label: 'Gestor de Fábrica',
        hint: 'Aba Fábrica e Gestão',
        appliesTo: role => role === 'Marceneiro'
    },
    {
        id: 'terceiro',
        label: 'Terceiro',
        hint: 'Não funcionário: acesso somente à tela de Pendências',
        appliesTo: role => role !== 'Admin'
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
    Compras: {
        accent: 'border-l-amber-500',
        bg: 'bg-amber-50/70',
        ring: 'ring-amber-100'
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
    const isConsultorUser = u.role === 'Consultor';
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

    if (isProjetistaUser && u.isConferenceReviewer) badges.push('<span class="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-100">Conferente</span>');
    if ((isAdminUser || isConsultorUser) && u.isCommercialManager) badges.push('<span class="text-[10px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-100">Gestor comercial</span>');
    if (canHaveGestorProjetos && u.isProjectsManager) badges.push('<span class="text-[10px] bg-violet-50 text-violet-800 px-2 py-0.5 rounded border border-violet-100">Gestor de projetos</span>');
    if (isProjetistaUser && u.isPpcp) badges.push('<span class="text-[10px] bg-violet-50 text-violet-800 px-2 py-0.5 rounded border border-violet-100">PPCP</span>');
    if (isProjetistaUser && u.isReviewer) badges.push('<span class="text-[10px] bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-100">Revisor</span>');
    if (isProjetistaUser && u.isDetailing) badges.push('<span class="text-[10px] bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded border border-indigo-100">Detalhamento</span>');
    if (isMarceneiroUser && u.isFactoryManager) badges.push('<span class="text-[10px] bg-orange-50 text-orange-800 px-2 py-0.5 rounded border border-orange-100">Gestor de Fábrica</span>');
    if (u.isThirdParty) badges.push('<span class="text-[10px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded border border-stone-200">Terceiro</span>');

    return badges.join('');
}

function getApplicableFlags(role) {
    return USER_FLAG_CONFIG.filter(flag => flag.appliesTo(role));
}

function buildUserFlagCheckbox(u, flag) {
    const checkId = `${flag.id}-check-${u.id}`;
    const checkedMap = {
        conferente: Boolean(u.isConferenceReviewer),
        'gestor-comercial': Boolean(u.isCommercialManager),
        'gestor-projetos': Boolean(u.isProjectsManager),
        ppcp: Boolean(u.isPpcp),
        revisor: Boolean(u.isReviewer ?? u.isProjectLeader),
        'gestor-fabrica': Boolean(u.isFactoryManager),
        detalhamento: Boolean(u.isDetailing),
        terceiro: Boolean(u.isThirdParty)
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
    const flags = getApplicableFlags(role);
    if (!flags.length) {
        if (!role) {
            return '<p class="text-[10px] text-slate-400 italic">Selecione o perfil.</p>';
        }
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
        isConferenceReviewer: checks.conferente ?? u.isConferenceReviewer,
        isCommercialManager: checks['gestor-comercial'] ?? u.isCommercialManager,
        isProjectsManager: checks['gestor-projetos'] ?? u.isProjectsManager,
        isPpcp: checks.ppcp ?? u.isPpcp,
        isReviewer: checks.revisor ?? u.isReviewer ?? u.isProjectLeader,
        isFactoryManager: checks['gestor-fabrica'] ?? u.isFactoryManager,
        isDetailing: checks.detalhamento ?? u.isDetailing,
        isThirdParty: checks.terceiro ?? u.isThirdParty
    };
}

function renderUserFlagsGrid(flagsGrid, u, isActive, role) {
    if (!flagsGrid) return;
    const flags = isActive ? getApplicableFlags(role) : [];
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
        const canImpersonate = typeof canStartUserImpersonation === 'function'
            && canStartUserImpersonation()
            && isActive
            && !isSelf;
        const initialRole = u.role || '';
        const cardStyle = getUserCardStyle(initialRole);

        card.className = `rounded-lg border border-slate-200 border-l-4 ${cardStyle.accent} ${cardStyle.bg} ring-1 ${cardStyle.ring} overflow-hidden ${isActive ? '' : 'opacity-70'}`;
        card.innerHTML = `
            <div class="px-3 py-2.5">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div class="min-w-[160px] flex-1">
                        <label for="name-input-${u.id}" class="block text-[9px] font-semibold uppercase text-slate-400 mb-0.5">Nome</label>
                        <input type="text" id="name-input-${u.id}" value="${escapeHtml(u.name || '')}" ${disableEdit}
                            maxlength="120"
                            class="w-full px-2 py-1 text-xs font-semibold border border-slate-200/80 rounded-md bg-white/90 focus:outline-none focus:border-amber-600 disabled:bg-slate-100 disabled:text-slate-400 ${isActive ? 'text-slate-900' : 'text-slate-400 line-through'}">
                        <div class="flex flex-wrap items-center gap-1.5 mt-1">
                            ${statusBadge}
                            ${isSelf ? '<span class="text-[9px] text-slate-400">(você)</span>' : ''}
                        </div>
                        <p class="text-[10px] text-slate-500 truncate mt-0.5">${escapeHtml(u.email)}</p>
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
                            <option value="Compras" ${u.role === 'Compras' ? 'selected' : ''}>Compras</option>
                        </select>
                    </div>

                    <div class="min-w-[140px] flex-1">
                        <p class="text-[9px] font-semibold uppercase text-slate-400 mb-0.5">Permissões</p>
                        <div id="flags-grid-${u.id}"></div>
                    </div>

                    <div class="flex gap-1.5 shrink-0">
                        ${canImpersonate ? `
                            <button type="button" onclick="startUserImpersonation(${u.id})"
                                class="text-[10px] px-2.5 py-1 rounded-md font-medium whitespace-nowrap bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">
                                Ver como
                            </button>
                        ` : ''}
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
                <div class="mt-2 pt-2 border-t border-slate-200/70">
                    ${typeof renderUserCalendarColorPickerHtml === 'function'
                        ? renderUserCalendarColorPickerHtml(u, {
                            disabled: !isActive,
                            takenHexes: typeof getTakenCalendarColorHexes === 'function'
                                ? getTakenCalendarColorHexes(usersAdminCache, u.id)
                                : undefined
                        })
                        : ''}
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
        if (typeof bindUserCalendarColorPicker === 'function') {
            bindUserCalendarColorPicker(u.id);
        }

        if (roleSelect && !roleSelect.disabled) {
            roleSelect.addEventListener('change', async () => {
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
        .select('id, name, email, role, isActive, authId, isConferenceReviewer, isCommercialManager, isProjectsManager, isPpcp, isReviewer, isFactoryManager, isDetailing, isThirdParty, calendarColor')
        .order('name', { ascending: true });

    if (result.error?.message?.includes('calendarColor')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name, email, role, isActive, authId, isConferenceReviewer, isCommercialManager, isProjectsManager, isPpcp, isReviewer, isFactoryManager, isDetailing, isThirdParty')
            .order('name', { ascending: true });
    }

    if (result.error?.message?.includes('isFactoryManager') || result.error?.message?.includes('isPpcp') || result.error?.message?.includes('isReviewer') || result.error?.message?.includes('isProjectLeader') || result.error?.message?.includes('isDetailing') || result.error?.message?.includes('isThirdParty')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name, email, role, isActive, authId, isConferenceReviewer, isCommercialManager, isProjectsManager')
            .order('name', { ascending: true });
    }

    if (result.error?.message?.includes('isProjectsManager') || result.error?.message?.includes('isCommercialManager')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name, email, role, isActive, authId, isConferenceReviewer')
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
    document.getElementById('btn-users-clear-filters')?.addEventListener('click', async () => {
        const nameInput = document.getElementById('users-filter-name');
        const roleSelect = document.getElementById('users-filter-role');
        if (nameInput) nameInput.value = '';
        if (roleSelect) roleSelect.value = '';
        applyUsersAdminFilters();
    });
}

function refreshLoggedInUserDisplay() {
    if (!currentUser) return;

    const display = document.getElementById('user-display');
    if (display) {
        display.innerText = typeof getLoggedInUserDisplayText === 'function'
            ? getLoggedInUserDisplayText()
            : `Logado como: ${currentUser.name} (${currentUser.role || 'Sem perfil'})`;
    }

    if (typeof updateAdminNav === 'function') updateAdminNav();
    if (typeof updatePendenciasNav === 'function') updatePendenciasNav();
    if (typeof updateAnteprojetoActionButtons === 'function') updateAnteprojetoActionButtons();
    if (typeof updateOrderDetailTabsVisibility === 'function') updateOrderDetailTabsVisibility();
}

async function saveUserRole(userId) {
    if (!isAdmin()) return;

    const nameInput = document.getElementById(`name-input-${userId}`);
    const select = document.getElementById(`role-select-${userId}`);
    const conferenteCheck = document.getElementById(`conferente-check-${userId}`);
    const gestorComercialCheck = document.getElementById(`gestor-comercial-check-${userId}`);
    const gestorProjetosCheck = document.getElementById(`gestor-projetos-check-${userId}`);
    const ppcpCheck = document.getElementById(`ppcp-check-${userId}`);
    const revisorCheck = document.getElementById(`revisor-check-${userId}`);
    const detalhamentoCheck = document.getElementById(`detalhamento-check-${userId}`);
    const gestorFabricaCheck = document.getElementById(`gestor-fabrica-check-${userId}`);
    const terceiroCheck = document.getElementById(`terceiro-check-${userId}`);
    const calendarColor = (typeof normalizeGoogleCalendarColorHex === 'function'
        ? normalizeGoogleCalendarColorHex(getCalendarColorInput(userId)?.value)
        : '') || (typeof resolveUserCalendarPaletteColor === 'function'
            ? resolveUserCalendarPaletteColor({ id: userId }).hex
            : '');
    const name = nameInput?.value.trim() || '';
    const role = select?.value;
    const isConferenceReviewer = role === 'Projetista' && Boolean(conferenteCheck?.checked);
    const isCommercialManager = (role === 'Admin' || role === 'Consultor') && Boolean(gestorComercialCheck?.checked);
    const isProjectsManager = (role === 'Admin' || role === 'Projetista') && Boolean(gestorProjetosCheck?.checked);
    const isPpcp = role === 'Projetista' && Boolean(ppcpCheck?.checked);
    const isReviewer = role === 'Projetista' && Boolean(revisorCheck?.checked);
    const isDetailing = role === 'Projetista' && Boolean(detalhamentoCheck?.checked);
    const isFactoryManager = role === 'Marceneiro' && Boolean(gestorFabricaCheck?.checked);
    const isThirdParty = role !== 'Admin' && Boolean(terceiroCheck?.checked);

    if (!name) {
        alertAppDialog('Informe o nome do usuário.');
        nameInput?.focus();
        return;
    }

    if (!role) {
        alertAppDialog("Selecione Admin, Projetista, Consultor, Marceneiro ou Compras.");
        return;
    }

    if (calendarColor && typeof getTakenCalendarColorHexes === 'function') {
        const taken = getTakenCalendarColorHexes(usersAdminCache, userId);
        if (taken.has(calendarColor)) {
            alertAppDialog(`Essa cor já está em uso por ${taken.get(calendarColor)}. Escolha outra.`);
            return;
        }
    }

    const { data: previousUser } = await supabaseClient
        .from('appUsers')
        .select('name, role')
        .eq('id', userId)
        .maybeSingle();

    let payload = { name, role, isConferenceReviewer, isCommercialManager, isProjectsManager, isPpcp, isReviewer, isFactoryManager, isDetailing, isThirdParty, calendarColor };
    let { error } = await supabaseClient
        .from('appUsers')
        .update(payload)
        .eq('id', userId);

    if (error?.message?.includes('calendarColor')) {
        payload = { name, role, isConferenceReviewer, isCommercialManager, isProjectsManager, isPpcp, isReviewer, isFactoryManager, isDetailing, isThirdParty };
        ({ error } = await supabaseClient
            .from('appUsers')
            .update(payload)
            .eq('id', userId));
    }

    if (error?.message?.includes('isFactoryManager') || error?.message?.includes('isPpcp') || error?.message?.includes('isReviewer') || error?.message?.includes('isProjectLeader') || error?.message?.includes('isDetailing') || error?.message?.includes('isThirdParty')) {
        payload = { name, role, isConferenceReviewer, isCommercialManager, isProjectsManager };
        ({ error } = await supabaseClient
            .from('appUsers')
            .update(payload)
            .eq('id', userId));
    }

    if (error?.message?.includes('isProjectsManager') || error?.message?.includes('isCommercialManager')) {
        ({ error } = await supabaseClient
            .from('appUsers')
            .update({ name, role, isConferenceReviewer })
            .eq('id', userId));
    }

    if (error) {
        alertAppDialog("Erro ao salvar usuário: " + error.message);
        return;
    }

    if ((previousUser?.role === 'Consultor' || role === 'Consultor')
        && previousUser?.name
        && previousUser.name !== name) {
        await syncSalesOrdersConsultantName(previousUser.name, name, userId);
        await loadConsultantUsersCache(true);
    }

    if (userId === currentUser.id) {
        currentUser = {
            ...currentUser,
            name,
            role,
            isConferenceReviewer,
            isCommercialManager,
            isProjectsManager,
            isPpcp,
            isReviewer,
            isFactoryManager,
            isDetailing,
            isThirdParty,
            calendarColor
        };
        currentUser = normalizeAppUserProfile(currentUser);
        refreshLoggedInUserDisplay();
    }

    if (typeof invalidateCalendarUsersCache === 'function') {
        invalidateCalendarUsersCache();
    }

    alertAppDialog('Usuário atualizado com sucesso.', { variant: 'success', title: 'Sucesso' });
    loadUsersAdminList();
}

async function toggleUserActive(userId, currentlyActive) {
    if (!isAdmin()) return;
    if (userId === currentUser.id) {
        alertAppDialog("Você não pode desativar a si mesmo.", { variant: 'warning', title: 'Aviso' });
        return;
    }

    const action = currentlyActive ? 'desativar' : 'reativar';
    if (!(await confirmAppDialog(`Confirma ${action} este usuário?${currentlyActive ? ' Ele não poderá mais fazer login.' : ''}`))) {
        return;
    }

    const nextActive = !currentlyActive;
    const payload = { isActive: nextActive };
    if (!nextActive && typeof INACTIVE_USER_CALENDAR_COLOR !== 'undefined') {
        payload.calendarColor = INACTIVE_USER_CALENDAR_COLOR.hex;
    }

    let { error } = await supabaseClient
        .from('appUsers')
        .update(payload)
        .eq('id', userId);

    if (error?.message?.includes('calendarColor')) {
        ({ error } = await supabaseClient
            .from('appUsers')
            .update({ isActive: nextActive })
            .eq('id', userId));
    }

    if (error) {
        alertAppDialog("Erro ao atualizar status: " + error.message);
        return;
    }

    if (typeof invalidateCalendarUsersCache === 'function') {
        invalidateCalendarUsersCache();
    }

    loadUsersAdminList();
}

window.saveUserRole = saveUserRole;
window.toggleUserActive = toggleUserActive;
