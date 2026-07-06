async function loadGestaoProjectStatusList() {
    const tbody = document.getElementById('gestao-project-status-list');
    if (!tbody) return;

    const statuses = await loadGestaoProjectStatuses(false);

    if (!statuses.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-amber-700">
                    Nenhum status cadastrado. Execute <code>supabase/create-order-project-status.sql</code> no Supabase.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    statuses.forEach(status => {
        const tr = document.createElement('tr');
        tr.dataset.statusId = String(status.id);
        tr.innerHTML = `
            <td class="p-3">
                <input type="number" class="gestao-status-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(status.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-status-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(status.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-status-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${status.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-status text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="gestao-delete-status text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.gestao-save-status').forEach(button => {
        button.addEventListener('click', () => saveGestaoProjectStatusRow(button.closest('tr')));
    });
    tbody.querySelectorAll('.gestao-delete-status').forEach(button => {
        button.addEventListener('click', () => deleteGestaoProjectStatusRow(button.closest('tr')));
    });
}

async function saveGestaoProjectStatusRow(row) {
    if (!row || !canAccessGestao()) return;

    const statusId = Number(row.dataset.statusId);
    const name = row.querySelector('.gestao-status-name')?.value.trim();
    const sortOrder = Number(row.querySelector('.gestao-status-sort')?.value) || 0;
    const isActive = Boolean(row.querySelector('.gestao-status-active')?.checked);

    if (!name) {
        alert('Informe o nome do status.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProjectStatus')
        .update({ name, sortOrder, isActive, updatedAt: now })
        .eq('id', statusId);

    if (error) {
        alert('Erro ao salvar status: ' + error.message);
        return;
    }

    await loadGestaoProjectStatusList();
}

async function deleteGestaoProjectStatusRow(row) {
    if (!row || !canAccessGestao()) return;

    const statusId = Number(row.dataset.statusId);
    const name = row.querySelector('.gestao-status-name')?.value.trim() || 'este status';

    const { count, error: countError } = await supabaseClient
        .from('OrderProject')
        .select('id', { count: 'exact', head: true })
        .eq('statusId', statusId);

    if (countError) {
        alert('Erro ao verificar uso do status: ' + countError.message);
        return;
    }

    if (count > 0) {
        alert(`O status "${name}" está em uso por ${count} projeto(s). Desative-o em vez de excluir.`);
        return;
    }

    if (!confirm(`Excluir o status "${name}"?`)) return;

    const { error } = await supabaseClient
        .from('OrderProjectStatus')
        .delete()
        .eq('id', statusId);

    if (error) {
        alert('Erro ao excluir status: ' + error.message);
        return;
    }

    await loadGestaoProjectStatusList();
}

async function addGestaoProjectStatus(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const name = document.getElementById('gestao-new-status-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-status-sort')?.value) || 0;

    if (!name) {
        alert('Informe o nome do status.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProjectStatus')
        .insert({
            name,
            sortOrder,
            isActive: true,
            updatedAt: now
        });

    if (error) {
        alert('Erro ao adicionar status: ' + error.message);
        return;
    }

    document.getElementById('gestao-new-status-form')?.reset();
    document.getElementById('gestao-new-status-sort').value = '0';
    await loadGestaoProjectStatusList();
}

async function loadGestaoMarceneiros(activeOnly = false) {
    let query = supabaseClient
        .from('Marceneiro')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('loadGestaoMarceneiros:', error);
        gestaoMarceneirosCache = [];
        return [];
    }

    gestaoMarceneirosCache = data || [];
    return gestaoMarceneirosCache;
}

async function loadGestaoMarceneirosList() {
    const tbody = document.getElementById('gestao-marceneiros-list');
    if (!tbody) return;

    const marceneiros = await loadGestaoMarceneiros(false);

    if (!marceneiros.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-amber-700">
                    Nenhum marceneiro cadastrado. Execute <code>supabase/create-marceneiro.sql</code> no Supabase.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    marceneiros.forEach(marceneiro => {
        const tr = document.createElement('tr');
        tr.dataset.marceneiroId = String(marceneiro.id);
        tr.innerHTML = `
            <td class="p-3">
                <input type="number" class="gestao-marceneiro-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(marceneiro.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-marceneiro-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(marceneiro.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-marceneiro-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${marceneiro.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-marceneiro text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="gestao-delete-marceneiro text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.gestao-save-marceneiro').forEach(button => {
        button.addEventListener('click', () => saveGestaoMarceneiroRow(button.closest('tr')));
    });
    tbody.querySelectorAll('.gestao-delete-marceneiro').forEach(button => {
        button.addEventListener('click', () => deleteGestaoMarceneiroRow(button.closest('tr')));
    });
}

async function saveGestaoMarceneiroRow(row) {
    if (!row || !canAccessGestao()) return;

    const marceneiroId = Number(row.dataset.marceneiroId);
    const name = row.querySelector('.gestao-marceneiro-name')?.value.trim();
    const sortOrder = Number(row.querySelector('.gestao-marceneiro-sort')?.value) || 0;
    const isActive = Boolean(row.querySelector('.gestao-marceneiro-active')?.checked);

    if (!name) {
        alert('Informe o nome do marceneiro.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('Marceneiro')
        .update({ name, sortOrder, isActive, updatedAt: now })
        .eq('id', marceneiroId);

    if (error) {
        alert('Erro ao salvar marceneiro: ' + error.message);
        return;
    }

    await loadGestaoMarceneirosList();
}

async function deleteGestaoMarceneiroRow(row) {
    if (!row || !canAccessGestao()) return;

    const marceneiroId = Number(row.dataset.marceneiroId);
    const name = row.querySelector('.gestao-marceneiro-name')?.value.trim() || 'este marceneiro';

    const { count, error: countError } = await supabaseClient
        .from('OrderProject')
        .select('id', { count: 'exact', head: true })
        .eq('marceneiroId', marceneiroId);

    if (countError) {
        if (countError.message?.includes('marceneiroId')) {
            alert('Execute supabase/add-order-project-montagem-fields.sql no Supabase para habilitar a exclusão com verificação de uso.');
            return;
        }
        alert('Erro ao verificar uso do marceneiro: ' + countError.message);
        return;
    }

    if (count > 0) {
        alert(`O marceneiro "${name}" está vinculado a ${count} projeto(s). Desative-o em vez de excluir.`);
        return;
    }

    if (!confirm(`Excluir o marceneiro "${name}"?`)) return;

    const { error } = await supabaseClient
        .from('Marceneiro')
        .delete()
        .eq('id', marceneiroId);

    if (error) {
        alert('Erro ao excluir marceneiro: ' + error.message);
        return;
    }

    await loadGestaoMarceneirosList();
}

async function addGestaoMarceneiro(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const name = document.getElementById('gestao-new-marceneiro-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-marceneiro-sort')?.value) || 0;

    if (!name) {
        alert('Informe o nome do marceneiro.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('Marceneiro')
        .insert({
            name,
            sortOrder,
            isActive: true,
            updatedAt: now
        });

    if (error) {
        alert('Erro ao adicionar marceneiro: ' + error.message);
        return;
    }

    document.getElementById('gestao-new-marceneiro-form')?.reset();
    document.getElementById('gestao-new-marceneiro-sort').value = '0';
    await loadGestaoMarceneirosList();
}
