function ensureGestaoWoodworkChecklistItemsPanelHost() {
    const panel = document.getElementById('gestao-woodwork-checklist-items-panel');
    const host = document.getElementById('gestao-characteristics-panel')?.parentElement
        || document.querySelector('#gestao-view .flex-1.min-w-0.w-full');
    if (!panel || !host || panel.parentElement === host) return;
    host.appendChild(panel);
}

function findWoodworkChecklistItemSortOrderConflict(sortOrder, items, excludeItemId = null) {
    const normalizedOrder = Number(sortOrder) || 0;
    const excludeId = excludeItemId == null ? null : Number(excludeItemId);
    return (items || []).find(item => {
        if (excludeId != null && Number(item.id) === excludeId) return false;
        return Number(item.sortOrder) === normalizedOrder;
    });
}

async function loadWoodworkQualityChecklistItems(activeOnly = false) {
    let query = supabaseClient
        .from('WoodworkQualityChecklistItem')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('id', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;
    if (error) {
        console.error('loadWoodworkQualityChecklistItems:', error);
        return { error, data: [] };
    }
    return { error: null, data: data || [] };
}

async function loadGestaoWoodworkChecklistItemsList() {
    ensureGestaoWoodworkChecklistItemsPanelHost();
    const tbody = document.getElementById('gestao-woodwork-checklist-items-list');
    if (!tbody || !isAdmin()) return;

    const { data: items, error } = await loadWoodworkQualityChecklistItems(false);
    if (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-red-600">
                    Erro ao carregar: ${escapeHtml(error.message)}. Execute <code>supabase/feats/create-woodwork-quality-checklist.sql</code> no Supabase.
                </td>
            </tr>
        `;
        return;
    }

    if (!items.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-amber-700">
                    Nenhum item cadastrado. Execute <code>supabase/feats/create-woodwork-quality-checklist.sql</code> no Supabase ou adicione abaixo.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = items.map(item => `
        <tr data-item-id="${Number(item.id)}">
            <td class="p-3">
                <input type="number" class="gestao-woodwork-item-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(item.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-woodwork-item-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(item.name || '')}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-woodwork-item-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${item.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-woodwork-item-save text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="gestao-woodwork-item-delete text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.gestao-woodwork-item-save').forEach(button => {
        button.addEventListener('click', () => saveGestaoWoodworkChecklistItemRow(button.closest('tr')));
    });
    tbody.querySelectorAll('.gestao-woodwork-item-delete').forEach(button => {
        button.addEventListener('click', () => deleteGestaoWoodworkChecklistItemRow(button.closest('tr')));
    });
}

async function saveGestaoWoodworkChecklistItemRow(row) {
    if (!row || !isAdmin()) return;

    const itemId = Number(row.dataset.itemId);
    const name = row.querySelector('.gestao-woodwork-item-name')?.value.trim();
    const sortOrder = Number(row.querySelector('.gestao-woodwork-item-sort')?.value) || 0;
    const isActive = Boolean(row.querySelector('.gestao-woodwork-item-active')?.checked);

    if (!name) {
        alertAppDialog('Informe o texto do item.');
        return;
    }

    const { data: items, error: loadError } = await loadWoodworkQualityChecklistItems(false);
    if (loadError) {
        alertAppDialog(`Erro ao salvar: ${loadError.message}`);
        return;
    }
    if (findWoodworkChecklistItemSortOrderConflict(sortOrder, items, itemId)) {
        alertAppDialog(`Já existe um item com a ordem ${sortOrder}.`);
        return;
    }

    await withGestaoCadastroSaveOverlay(null, async () => {
        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('WoodworkQualityChecklistItem')
            .update({ name, sortOrder, isActive, updatedAt: now })
            .eq('id', itemId);

        if (error) {
            alertAppDialog(`Erro ao salvar: ${error.message}`);
            return;
        }

        await loadGestaoWoodworkChecklistItemsList();
    }, 'Salvando item...');
}

async function deleteGestaoWoodworkChecklistItemRow(row) {
    if (!row || !isAdmin()) return;

    const itemId = Number(row.dataset.itemId);
    const name = row.querySelector('.gestao-woodwork-item-name')?.value.trim() || 'este item';

    if (!(await confirmAppDialog(`Excluir o item "${name}"?`, {
        title: 'Excluir item',
        confirmLabel: 'Excluir',
        variant: 'danger'
    }))) return;

    await withGestaoCadastroSaveOverlay(null, async () => {
        const { error } = await supabaseClient
            .from('WoodworkQualityChecklistItem')
            .delete()
            .eq('id', itemId);

        if (error) {
            alertAppDialog(`Erro ao excluir: ${error.message}`);
            return;
        }

        await loadGestaoWoodworkChecklistItemsList();
    }, 'Excluindo item...');
}

async function createGestaoWoodworkChecklistItem(event) {
    event?.preventDefault();
    if (!isAdmin()) return;

    const name = document.getElementById('gestao-new-woodwork-item-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-woodwork-item-sort')?.value) || 0;

    if (!name) {
        alertAppDialog('Informe o texto do item.');
        return;
    }

    const { data: items, error: loadError } = await loadWoodworkQualityChecklistItems(false);
    if (loadError) {
        alertAppDialog(`Erro ao adicionar: ${loadError.message}`);
        return;
    }
    if (findWoodworkChecklistItemSortOrderConflict(sortOrder, items)) {
        alertAppDialog(`Já existe um item com a ordem ${sortOrder}.`);
        return;
    }

    await withGestaoCadastroSaveOverlay(null, async () => {
        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('WoodworkQualityChecklistItem')
            .insert({
                name,
                sortOrder,
                isActive: true,
                createdAt: now,
                updatedAt: now
            });

        if (error) {
            alertAppDialog(`Erro ao adicionar: ${error.message}`);
            return;
        }

        document.getElementById('gestao-new-woodwork-item-form')?.reset();
        const sortInput = document.getElementById('gestao-new-woodwork-item-sort');
        if (sortInput) sortInput.value = '0';

        await loadGestaoWoodworkChecklistItemsList();
    }, 'Adicionando item...');
}

function bindGestaoWoodworkChecklistItemsEvents() {
    document.getElementById('gestao-new-woodwork-item-form')
        ?.addEventListener('submit', createGestaoWoodworkChecklistItem);
}

bindGestaoWoodworkChecklistItemsEvents();
window.loadGestaoWoodworkChecklistItemsList = loadGestaoWoodworkChecklistItemsList;
window.loadWoodworkQualityChecklistItems = loadWoodworkQualityChecklistItems;
