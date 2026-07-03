async function loadUsersAdminList() {
    const { data: users, error } = await supabaseClient
        .from('appUsers')
        .select('id, name, email, role, isActive, authId, conferente')
        .order('name', { ascending: true });

    const tbody = document.getElementById("users-admin-list");
    tbody.innerHTML = "";

    if (error || !users) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-xs text-red-500">Erro ao carregar usuários.</td></tr>';
        return;
    }

    users.forEach(u => {
        const tr = document.createElement("tr");
        const isSelf = u.id === currentUser.id;
        const isActive = u.isActive !== false;
        const isConferenteUser = Boolean(u.conferente);
        const currentRole = u.role || "Sem perfil";
        const statusBadge = isActive
            ? '<span class="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Ativo</span>'
            : '<span class="text-[10px] font-bold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Inativo</span>';
        const roleDisplay = u.role === 'Admin'
            ? '<span class="text-xs font-bold bg-slate-900 text-amber-500 px-2 py-0.5 rounded">Admin</span>'
            : `<span class="text-xs text-slate-600">${currentRole}${isConferenteUser ? ' · Conferente' : ''}</span>`;
        const toggleLabel = isActive ? 'Desativar' : 'Reativar';
        const toggleClass = isActive
            ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200';
        const disableToggle = isSelf ? 'disabled title="Você não pode desativar a si mesmo"' : '';
        const disableEdit = !isActive || isSelf
            ? `disabled title="${isSelf ? 'Você não pode alterar o próprio perfil' : 'Reative o usuário para editar'}"`
            : '';

        tr.innerHTML = `
            <td class="p-3 font-medium ${isActive ? 'text-slate-900' : 'text-slate-400 line-through'}">${u.name}</td>
            <td class="p-3 text-slate-500">${u.email}</td>
            <td class="p-3">${statusBadge}</td>
            <td class="p-3">${roleDisplay}</td>
            <td class="p-3">
                <select id="role-select-${u.id}" ${disableEdit}
                    class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600 disabled:bg-slate-100 disabled:text-slate-400">
                    <option value="">Selecione...</option>
                    <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
                    <option value="Projetista" ${u.role === 'Projetista' ? 'selected' : ''}>Projetista</option>
                    <option value="Consultor" ${u.role === 'Consultor' ? 'selected' : ''}>Consultor</option>
                </select>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" id="conferente-check-${u.id}" ${isConferenteUser ? 'checked' : ''} ${disableEdit}
                    class="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 disabled:opacity-50"
                    title="Pode criar medição e conferência de anteprojeto">
            </td>
            <td class="p-3">
                <div class="flex flex-col gap-1.5">
                    <button type="button" onclick="saveUserRole(${u.id})" ${isActive && !isSelf ? '' : 'disabled'}
                        class="bg-amber-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-amber-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                        Salvar
                    </button>
                    <button type="button" onclick="toggleUserActive(${u.id}, ${isActive})" ${disableToggle}
                        class="text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${toggleClass}">
                        ${toggleLabel}
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

async function saveUserRole(userId) {
    if (!isAdmin()) return;
    if (userId === currentUser.id) {
        alert("Você não pode alterar o próprio perfil.");
        return;
    }

    const select = document.getElementById(`role-select-${userId}`);
    const conferenteCheck = document.getElementById(`conferente-check-${userId}`);
    const role = select?.value;
    const conferente = Boolean(conferenteCheck?.checked);

    if (!role) {
        alert("Selecione Admin, Projetista ou Consultor.");
        return;
    }

    const { error } = await supabaseClient
        .from('appUsers')
        .update({ role, conferente })
        .eq('id', userId);

    if (error) {
        alert("Erro ao salvar usuário: " + error.message);
        return;
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
