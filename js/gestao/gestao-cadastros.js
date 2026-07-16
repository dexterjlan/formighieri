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
        alertAppDialog('Informe o nome do status.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProjectStatus')
        .update({ name, sortOrder, isActive, updatedAt: now })
        .eq('id', statusId);

    if (error) {
        alertAppDialog('Erro ao salvar status: ' + error.message);
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
        alertAppDialog('Erro ao verificar uso do status: ' + countError.message);
        return;
    }

    if (count > 0) {
        alertAppDialog(`O status "${name}" está em uso por ${count} projeto(s). Desative-o em vez de excluir.`);
        return;
    }

    if (!(await confirmAppDialog(`Excluir o status "${name}"?`))) return;

    const { error } = await supabaseClient
        .from('OrderProjectStatus')
        .delete()
        .eq('id', statusId);

    if (error) {
        alertAppDialog('Erro ao excluir status: ' + error.message);
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
        alertAppDialog('Informe o nome do status.');
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
        alertAppDialog('Erro ao adicionar status: ' + error.message);
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
        alertAppDialog('Informe o nome do marceneiro.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('Marceneiro')
        .update({ name, sortOrder, isActive, updatedAt: now })
        .eq('id', marceneiroId);

    if (error) {
        alertAppDialog('Erro ao salvar marceneiro: ' + error.message);
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
            alertAppDialog('Execute supabase/create-gestao-order-fields.sql e supabase/create-marceneiro.sql no Supabase para habilitar a exclusão com verificação de uso.');
            return;
        }
        alertAppDialog('Erro ao verificar uso do marceneiro: ' + countError.message);
        return;
    }

    if (count > 0) {
        alertAppDialog(`O marceneiro "${name}" está vinculado a ${count} projeto(s). Desative-o em vez de excluir.`);
        return;
    }

    if (!(await confirmAppDialog(`Excluir o marceneiro "${name}"?`))) return;

    const { error } = await supabaseClient
        .from('Marceneiro')
        .delete()
        .eq('id', marceneiroId);

    if (error) {
        alertAppDialog('Erro ao excluir marceneiro: ' + error.message);
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
        alertAppDialog('Informe o nome do marceneiro.');
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
        alertAppDialog('Erro ao adicionar marceneiro: ' + error.message);
        return;
    }

    document.getElementById('gestao-new-marceneiro-form')?.reset();
    document.getElementById('gestao-new-marceneiro-sort').value = '0';
    await loadGestaoMarceneirosList();
}

let gestaoMontadorIsActiveColumnAvailable = true;

async function loadGestaoMontadores(activeOnly = false) {
    let query = supabaseClient
        .from('Montador')
        .select('id, name, isActive')
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    let { data, error } = await query;

    if (error?.message?.includes('isActive')) {
        gestaoMontadorIsActiveColumnAvailable = false;
        const fallback = await supabaseClient
            .from('Montador')
            .select('id, name')
            .order('name', { ascending: true });

        data = (fallback.data || []).map(row => ({ ...row, isActive: true }));
        error = fallback.error;
    } else if (!error) {
        gestaoMontadorIsActiveColumnAvailable = true;
    }

    if (error) {
        console.error('loadGestaoMontadores:', error);
        gestaoMontadoresCache = [];
        return [];
    }

    gestaoMontadoresCache = data || [];
    return gestaoMontadoresCache;
}

function getGestaoActiveMontadores() {
    return (gestaoMontadoresCache || []).filter(montador => montador.isActive !== false);
}

async function loadGestaoMontadoresList() {
    const tbody = document.getElementById('gestao-montadores-list');
    if (!tbody) return;

    const montadores = await loadGestaoMontadores(false);

    if (!montadores.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-amber-700">
                    Nenhum montador cadastrado. Execute <code>supabase/create-montador.sql</code> no Supabase.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    montadores.forEach(montador => {
        const tr = document.createElement('tr');
        tr.dataset.montadorId = String(montador.id);
        tr.innerHTML = `
            <td class="p-3 text-xs font-mono text-slate-500">${escapeHtml(String(montador.id))}</td>
            <td class="p-3">
                <input type="text" class="gestao-montador-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(montador.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-montador-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${montador.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-montador text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="gestao-delete-montador text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function setGestaoMontadorSaveButtonState(button, state = 'idle') {
    if (!button) return;

    if (state === 'saving') {
        button.dataset.originalLabel = button.textContent;
        button.disabled = true;
        button.textContent = 'Salvando...';
        return;
    }

    if (state === 'saved') {
        button.disabled = false;
        button.textContent = 'Salvo!';
        window.setTimeout(() => {
            button.textContent = button.dataset.originalLabel || 'Salvar';
        }, 1200);
        return;
    }

    button.disabled = false;
    button.textContent = button.dataset.originalLabel || 'Salvar';
}

async function persistGestaoMontadorRow(montadorId, name, isActive) {
    const payload = gestaoMontadorIsActiveColumnAvailable
        ? { name, isActive }
        : { name };

    let { data, error } = await supabaseClient
        .from('Montador')
        .update(payload)
        .eq('id', montadorId)
        .select('id')
        .maybeSingle();

    if (error?.message?.includes('isActive')) {
        gestaoMontadorIsActiveColumnAvailable = false;
        ({ data, error } = await supabaseClient
            .from('Montador')
            .update({ name })
            .eq('id', montadorId)
            .select('id')
            .maybeSingle());
    }

    return { data, error, isActiveUnsupported: !gestaoMontadorIsActiveColumnAvailable };
}

async function saveGestaoMontadorRow(row, button = null) {
    if (!row) {
        alertAppDialog('Não foi possível identificar o montador para salvar.');
        return;
    }

    if (!canAccessGestao()) {
        alertAppDialog('Sem permissão para alterar montadores.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const montadorId = Number(row.dataset.montadorId);
    const name = row.querySelector('.gestao-montador-name')?.value.trim();
    const isActive = Boolean(row.querySelector('.gestao-montador-active')?.checked);

    if (!montadorId) {
        alertAppDialog('Montador inválido. Recarregue a lista e tente novamente.');
        return;
    }

    if (!name) {
        alertAppDialog('Informe o nome do montador.');
        return;
    }

    setGestaoMontadorSaveButtonState(button, 'saving');

    try {
        const { data, error, isActiveUnsupported } = await persistGestaoMontadorRow(montadorId, name, isActive);

        if (error) {
            alertAppDialog('Erro ao salvar montador: ' + error.message);
            setGestaoMontadorSaveButtonState(button, 'idle');
            return;
        }

        if (!data?.id) {
            alertAppDialog('Montador não encontrado ou sem permissão para salvar.', { variant: 'warning', title: 'Aviso' });
            setGestaoMontadorSaveButtonState(button, 'idle');
            return;
        }

        const cachedMontador = (gestaoMontadoresCache || []).find(item => Number(item.id) === montadorId);
        if (cachedMontador) {
            cachedMontador.name = name;
            cachedMontador.isActive = isActive;
        }

        setGestaoMontadorSaveButtonState(button, 'saved');

        if (isActiveUnsupported) {
            alertAppDialog(
                'Nome salvo, mas o campo Ativo ainda não existe no banco. Execute supabase/alter-montador-is-active.sql no Supabase.',
                { variant: 'warning', title: 'Aviso' }
            );
        }
    } catch (error) {
        console.error('saveGestaoMontadorRow:', error);
        alertAppDialog('Erro ao salvar montador: ' + (error.message || 'erro inesperado'));
        setGestaoMontadorSaveButtonState(button, 'idle');
    }
}

async function deleteGestaoMontadorRow(row) {
    if (!row || !canAccessGestao()) return;

    const montadorId = Number(row.dataset.montadorId);
    const name = row.querySelector('.gestao-montador-name')?.value.trim() || 'este montador';

    const { count, error: countError } = await supabaseClient
        .from('MontagemProgramacaoMontador')
        .select('id', { count: 'exact', head: true })
        .eq('montadorId', montadorId);

    if (countError) {
        if (countError.message?.includes('MontagemProgramacaoMontador')) {
            alertAppDialog('Execute supabase/create-montagem-programacao.sql no Supabase para habilitar a exclusão com verificação de uso.');
            return;
        }
        alertAppDialog('Erro ao verificar uso do montador: ' + countError.message);
        return;
    }

    if (count > 0) {
        alertAppDialog(`O montador "${name}" está vinculado a ${count} programação(ões). Desative-o em vez de excluir.`);
        return;
    }

    if (!(await confirmAppDialog(`Excluir o montador "${name}"?`))) return;

    const { error } = await supabaseClient
        .from('Montador')
        .delete()
        .eq('id', montadorId);

    if (error) {
        alertAppDialog('Erro ao excluir montador: ' + error.message);
        return;
    }

    await loadGestaoMontadoresList();
}

async function addGestaoMontador(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const name = document.getElementById('gestao-new-montador-name')?.value.trim();

    if (!name) {
        alertAppDialog('Informe o nome do montador.');
        return;
    }

    let { error } = await supabaseClient
        .from('Montador')
        .insert({ name, isActive: true });

    if (error?.message?.includes('isActive')) {
        ({ error } = await supabaseClient
            .from('Montador')
            .insert({ name }));
    }

    if (error) {
        alertAppDialog('Erro ao adicionar montador: ' + error.message);
        return;
    }

    document.getElementById('gestao-new-montador-form')?.reset();
    await loadGestaoMontadoresList();
}

async function loadGestaoProjectCharacteristics(activeOnly = false) {
    let query = supabaseClient
        .from('ProjectCharacteristic')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('loadGestaoProjectCharacteristics:', error);
        gestaoProjectCharacteristicsCache = [];
        return [];
    }

    gestaoProjectCharacteristicsCache = data || [];
    return gestaoProjectCharacteristicsCache;
}

async function loadGestaoProjectCharacteristicsList() {
    const tbody = document.getElementById('gestao-characteristics-list');
    if (!tbody) return;

    const characteristics = await loadGestaoProjectCharacteristics(false);

    if (!characteristics.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-amber-700">
                    Nenhuma característica cadastrada. Execute <code>supabase/create-project-characteristic.sql</code> no Supabase.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    characteristics.forEach(characteristic => {
        const tr = document.createElement('tr');
        tr.dataset.characteristicId = String(characteristic.id);
        tr.innerHTML = `
            <td class="p-3">
                <input type="number" class="gestao-characteristic-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(characteristic.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-characteristic-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(characteristic.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-characteristic-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${characteristic.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-characteristic text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="gestao-delete-characteristic text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.gestao-save-characteristic').forEach(button => {
        button.addEventListener('click', () => saveGestaoProjectCharacteristicRow(button.closest('tr')));
    });
    tbody.querySelectorAll('.gestao-delete-characteristic').forEach(button => {
        button.addEventListener('click', () => deleteGestaoProjectCharacteristicRow(button.closest('tr')));
    });
}

async function saveGestaoProjectCharacteristicRow(row) {
    if (!row || !canAccessGestao()) return;

    const characteristicId = Number(row.dataset.characteristicId);
    const name = row.querySelector('.gestao-characteristic-name')?.value.trim();
    const sortOrder = Number(row.querySelector('.gestao-characteristic-sort')?.value) || 0;
    const isActive = Boolean(row.querySelector('.gestao-characteristic-active')?.checked);

    if (!name) {
        alertAppDialog('Informe o nome da característica.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('ProjectCharacteristic')
        .update({ name, sortOrder, isActive, updatedAt: now })
        .eq('id', characteristicId);

    if (error) {
        alertAppDialog('Erro ao salvar característica: ' + error.message);
        return;
    }

    await loadGestaoProjectCharacteristicsList();
}

async function deleteGestaoProjectCharacteristicRow(row) {
    if (!row || !canAccessGestao()) return;

    const characteristicId = Number(row.dataset.characteristicId);
    const name = row.querySelector('.gestao-characteristic-name')?.value.trim() || 'esta característica';

    const { count, error: countError } = await supabaseClient
        .from('OrderProjectCharacteristic')
        .select('id', { count: 'exact', head: true })
        .eq('characteristicId', characteristicId);

    if (countError) {
        if (countError.message?.includes('OrderProjectCharacteristic')) {
            alertAppDialog('Execute supabase/create-order-project-characteristic.sql no Supabase para habilitar a exclusão com verificação de uso.');
            return;
        }
        alertAppDialog('Erro ao verificar uso da característica: ' + countError.message);
        return;
    }

    if (count > 0) {
        alertAppDialog(`A característica "${name}" está em uso por ${count} projeto(s). Desative-a em vez de excluir.`);
        return;
    }

    if (!(await confirmAppDialog(`Excluir a característica "${name}"?`))) return;

    const { error } = await supabaseClient
        .from('ProjectCharacteristic')
        .delete()
        .eq('id', characteristicId);

    if (error) {
        alertAppDialog('Erro ao excluir característica: ' + error.message);
        return;
    }

    await loadGestaoProjectCharacteristicsList();
}

async function addGestaoProjectCharacteristic(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const name = document.getElementById('gestao-new-characteristic-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-characteristic-sort')?.value) || 0;

    if (!name) {
        alertAppDialog('Informe o nome da característica.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('ProjectCharacteristic')
        .insert({
            name,
            sortOrder,
            isActive: true,
            updatedAt: now
        });

    if (error) {
        alertAppDialog('Erro ao adicionar característica: ' + error.message);
        return;
    }

    document.getElementById('gestao-new-characteristic-form')?.reset();
    document.getElementById('gestao-new-characteristic-sort').value = '0';
    await loadGestaoProjectCharacteristicsList();
}
