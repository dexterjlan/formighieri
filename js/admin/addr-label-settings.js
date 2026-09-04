let addrLabelsCache = [];

function isAddrLabelSettingsAdmin() {
    return typeof isAdmin === 'function' && isAdmin();
}

async function loadAddrLabels(activeOnly = false) {
    let query = supabaseClient
        .from('addrlabel')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('loadAddrLabels:', error);
        addrLabelsCache = [];
        return [];
    }

    addrLabelsCache = data || [];
    return addrLabelsCache;
}

function renderAddrLabelList(rows) {
    const tbody = document.getElementById('settings-addr-label-list');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-amber-700">
                    Nenhum label cadastrado. Execute <code>supabase/feats/create-addr.sql</code> no Supabase SQL Editor ou adicione abaixo.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.dataset.labelId = String(row.id);
        tr.innerHTML = `
            <td class="p-3">
                <input type="number" class="settings-addr-label-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(row.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="settings-addr-label-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(row.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="settings-addr-label-active h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    ${row.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="settings-addr-label-save text-xs bg-slate-900 text-white hover:bg-slate-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="settings-addr-label-delete text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.settings-addr-label-save').forEach(button => {
        button.addEventListener('click', () => saveAddrLabelRow(button.closest('tr'), button));
    });
    tbody.querySelectorAll('.settings-addr-label-delete').forEach(button => {
        button.addEventListener('click', () => deleteAddrLabelRow(button.closest('tr')));
    });
}

async function loadAddrLabelSettings() {
    const rows = await loadAddrLabels(false);
    renderAddrLabelList(rows);
}

async function addAddrLabel(event) {
    event.preventDefault();
    if (!isAddrLabelSettingsAdmin()) return;

    const name = document.getElementById('settings-addr-label-new-name')?.value.trim();
    const sortOrder = Number(document.getElementById('settings-addr-label-new-sort')?.value) || 0;

    if (!name) {
        alertAppDialog('Informe o nome do label.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('addrlabel')
        .insert({
            name,
            sortOrder,
            isActive: true,
            updatedAt: now,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null
        });

    if (error) {
        const isDuplicate = error.code === '23505'
            || /unique/i.test(error.message || '')
            || /duplicate/i.test(error.message || '');
        alertAppDialog(
            isDuplicate
                ? `Já existe um label com o nome "${name}".`
                : 'Erro ao adicionar label: ' + error.message
        );
        return;
    }

    event.target.reset();
    const sortInput = document.getElementById('settings-addr-label-new-sort');
    if (sortInput) sortInput.value = '0';
    await loadAddrLabelSettings();
}

async function saveAddrLabelRow(tr, button) {
    if (!tr || !isAddrLabelSettingsAdmin()) return;

    const labelId = Number(tr.dataset.labelId);
    const name = tr.querySelector('.settings-addr-label-name')?.value.trim();
    const sortOrder = Number(tr.querySelector('.settings-addr-label-sort')?.value) || 0;
    const isActive = Boolean(tr.querySelector('.settings-addr-label-active')?.checked);

    if (!name) {
        alertAppDialog('Informe o nome do label.');
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = 'Salvando...';
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('addrlabel')
        .update({
            name,
            sortOrder,
            isActive,
            updatedAt: now,
            updatedById: currentUser?.id || null
        })
        .eq('id', labelId);

    if (button) {
        button.disabled = false;
        button.textContent = 'Salvar';
    }

    if (error) {
        const isDuplicate = error.code === '23505'
            || /unique/i.test(error.message || '')
            || /duplicate/i.test(error.message || '');
        alertAppDialog(
            isDuplicate
                ? `Já existe um label com o nome "${name}".`
                : 'Erro ao salvar label: ' + error.message
        );
        return;
    }

    await loadAddrLabelSettings();
}

async function deleteAddrLabelRow(tr) {
    if (!tr || !isAddrLabelSettingsAdmin()) return;

    const labelId = Number(tr.dataset.labelId);
    const name = tr.querySelector('.settings-addr-label-name')?.value.trim() || 'o label';

    const { count, error: countError } = await supabaseClient
        .from('addr')
        .select('id', { count: 'exact', head: true })
        .eq('labelId', labelId);

    if (countError) {
        if (countError.message?.includes('addr')) {
            alertAppDialog('Execute supabase/feats/create-addr.sql no Supabase SQL Editor.', {
                variant: 'warning',
                title: 'Aviso'
            });
            return;
        }
        alertAppDialog('Erro ao verificar uso do label: ' + countError.message);
        return;
    }

    if (count > 0) {
        alertAppDialog(`O label "${name}" possui ${count} endereço(s) vinculado(s). Desative-o em vez de excluir.`);
        return;
    }

    if (!(await confirmAppDialog(`Excluir o label "${name}"?`))) return;

    const { error } = await supabaseClient
        .from('addrlabel')
        .delete()
        .eq('id', labelId);

    if (error) {
        alertAppDialog('Erro ao excluir label: ' + error.message);
        return;
    }

    await loadAddrLabelSettings();
}

async function showAddrLabelSettingsPanel() {
    if (!isAddrLabelSettingsAdmin()) return;
    setSettingsNavActive('addr-label');
    await loadAddrLabelSettings();
}

function bindAddrLabelSettingsEvents() {
    document.getElementById('settings-nav-addr-label')?.addEventListener('click', showAddrLabelSettingsPanel);
    document.getElementById('settings-addr-label-form')?.addEventListener('submit', addAddrLabel);
}

window.loadAddrLabels = loadAddrLabels;
