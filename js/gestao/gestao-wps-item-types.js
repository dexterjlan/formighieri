async function loadGestaoWpsItemTypesList() {
    const tbody = document.getElementById('gestao-wps-item-types-list');
    const hint = document.getElementById('gestao-wps-item-types-sql-hint');
    if (!tbody) return;

    const { data, error } = await supabaseClient
        .from('WpsItemType')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        hint?.classList.remove('hidden');
        tbody.innerHTML = '';
        return;
    }

    hint?.classList.add('hidden');

    if (!data?.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-slate-400">Nenhum tipo cadastrado.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = data.map(row => `
        <tr data-wps-item-type-id="${row.id}">
            <td class="p-3">
                <input type="number" min="0" step="1"
                    class="gestao-wps-item-type-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(row.sortOrder) || 0}">
            </td>
            <td class="p-3">
                <input type="text" required
                    class="gestao-wps-item-type-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(row.name)}">
            </td>
            <td class="p-3 text-center">
                <input type="checkbox"
                    class="gestao-wps-item-type-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${row.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <button type="button"
                    class="gestao-save-wps-item-type text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                    Salvar
                </button>
            </td>
        </tr>
    `).join('');
}

async function addGestaoWpsItemType(event) {
    event.preventDefault();
    const nameInput = document.getElementById('gestao-wps-item-type-name');
    const sortInput = document.getElementById('gestao-wps-item-type-sort');
    const name = nameInput?.value?.trim();
    if (!name) return;

    const sortOrder = Number(sortInput?.value) || 0;

    await withGestaoCadastroSaveOverlay(document.getElementById('gestao-wps-item-types-panel'), async () => {
        const { error } = await supabaseClient.from('WpsItemType').insert([{
            name,
            sortOrder,
            isActive: true,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null
        }]);

        if (error) {
            alertAppDialog(`${error.message} Execute supabase/feats/create-wps-item-registration.sql no Supabase SQL Editor.`);
            return;
        }

        if (nameInput) nameInput.value = '';
        if (sortInput) sortInput.value = '0';
        await loadGestaoWpsItemTypesList();
    });
}

async function saveGestaoWpsItemTypeRow(row) {
    if (!row) return;
    const id = Number(row.dataset.wpsItemTypeId);
    if (!id) return;

    const name = row.querySelector('.gestao-wps-item-type-name')?.value?.trim();
    if (!name) {
        alertAppDialog('Informe o nome do tipo.');
        return;
    }

    const sortOrder = Number(row.querySelector('.gestao-wps-item-type-sort')?.value) || 0;
    const isActive = Boolean(row.querySelector('.gestao-wps-item-type-active')?.checked);

    await withGestaoCadastroSaveOverlay(document.getElementById('gestao-wps-item-types-panel'), async () => {
        const { error } = await supabaseClient
            .from('WpsItemType')
            .update({
                name,
                sortOrder,
                isActive,
                updatedById: currentUser?.id || null,
                updatedAt: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            alertAppDialog(error.message);
            return;
        }

        await loadGestaoWpsItemTypesList();
    });
}

function bindGestaoWpsItemTypeEvents() {
    document.getElementById('gestao-wps-item-type-form')?.addEventListener('submit', addGestaoWpsItemType);
    document.getElementById('gestao-wps-item-types-list')?.addEventListener('click', event => {
        const button = event.target.closest('.gestao-save-wps-item-type');
        if (!button) return;
        event.preventDefault();
        saveGestaoWpsItemTypeRow(button.closest('tr'));
    });
}

window.loadGestaoWpsItemTypesList = loadGestaoWpsItemTypesList;
window.bindGestaoWpsItemTypeEvents = bindGestaoWpsItemTypeEvents;
