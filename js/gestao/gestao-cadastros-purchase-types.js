let gestaoThirdPartySubtypesCache = [];
let gestaoThirdPartySubtypeCharacteristicEnabled = true;

function setGestaoThirdPartySubtypeCharacteristicAvailability(enabled) {
    gestaoThirdPartySubtypeCharacteristicEnabled = enabled;
    const hint = document.getElementById('gestao-third-party-subtypes-sql-hint');
    if (hint) {
        hint.classList.toggle('hidden', enabled);
    }

    document.querySelectorAll('.gestao-third-party-subtype-characteristic-wrap').forEach(element => {
        element.classList.toggle('hidden', !enabled);
    });
    document.querySelectorAll('.gestao-third-party-subtype-characteristic').forEach(element => {
        element.disabled = !enabled;
    });
    document.getElementById('gestao-new-third-party-subtype-characteristic')?.toggleAttribute('disabled', !enabled);
}

function getGestaoProjectCharacteristicOptionsHtml(selectedId = null, includeEmpty = true) {
    const characteristics = gestaoProjectCharacteristicsCache || [];
    const normalizedSelected = selectedId != null && selectedId !== '' ? Number(selectedId) : null;
    const options = [];

    if (includeEmpty) {
        options.push('<option value="">Nenhuma</option>');
    }

    characteristics.forEach(characteristic => {
        const id = Number(characteristic.id);
        const selected = normalizedSelected === id ? ' selected' : '';
        options.push(`<option value="${id}"${selected}>${escapeHtml(characteristic.name)}</option>`);
    });

    return options.join('');
}

async function populateGestaoNewThirdPartySubtypeCharacteristicSelect() {
    const select = document.getElementById('gestao-new-third-party-subtype-characteristic');
    if (!select) return;

    await loadGestaoProjectCharacteristics(true);
    select.innerHTML = getGestaoProjectCharacteristicOptionsHtml(null, true);
}

async function loadGestaoThirdPartySubtypes(activeOnly = false) {
    const buildQuery = (includeCharacteristic) => {
        const fields = includeCharacteristic
            ? 'id, name, sortOrder, isActive, projectCharacteristicId'
            : 'id, name, sortOrder, isActive';
        let query = supabaseClient
            .from('ThirdPartySubtype')
            .select(fields)
            .order('sortOrder', { ascending: true })
            .order('name', { ascending: true });

        if (activeOnly) {
            query = query.eq('isActive', true);
        }

        return query;
    };

    let result = await buildQuery(true);

    if (result.error?.message?.includes('projectCharacteristicId')) {
        setGestaoThirdPartySubtypeCharacteristicAvailability(false);
        result = await buildQuery(false);
    } else {
        setGestaoThirdPartySubtypeCharacteristicAvailability(!result.error);
    }

    if (result.error) {
        console.error('loadGestaoThirdPartySubtypes:', result.error);
        gestaoThirdPartySubtypesCache = [];
        return [];
    }

    gestaoThirdPartySubtypesCache = result.data || [];
    return gestaoThirdPartySubtypesCache;
}

async function loadGestaoThirdPartySubtypesList() {
    const tbody = document.getElementById('gestao-third-party-subtypes-list');
    if (!tbody) return;

    await populateGestaoNewThirdPartySubtypeCharacteristicSelect();
    await loadGestaoProjectCharacteristics(true);
    const subtypes = await loadGestaoThirdPartySubtypes(false);

    if (!subtypes.length) {
        const colspan = gestaoThirdPartySubtypeCharacteristicEnabled ? 5 : 4;
        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}" class="p-6 text-center text-xs text-amber-700">
                    Nenhum subtipo cadastrado. Execute <code>supabase/create-third-party-subtype.sql</code> no Supabase.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    subtypes.forEach(subtype => {
        const tr = document.createElement('tr');
        tr.dataset.subtypeId = String(subtype.id);
        tr.innerHTML = `
            <td class="p-3">
                <input type="number" class="gestao-third-party-subtype-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(subtype.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-third-party-subtype-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(subtype.name)}" required>
            </td>
            ${gestaoThirdPartySubtypeCharacteristicEnabled ? `
            <td class="p-3 gestao-third-party-subtype-characteristic-wrap">
                <select class="gestao-third-party-subtype-characteristic w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                    ${getGestaoProjectCharacteristicOptionsHtml(subtype.projectCharacteristicId, true)}
                </select>
            </td>` : ''}
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-third-party-subtype-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${subtype.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-third-party-subtype text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="gestao-delete-third-party-subtype text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.gestao-save-third-party-subtype').forEach(button => {
        button.addEventListener('click', () => saveGestaoThirdPartySubtypeRow(button.closest('tr')));
    });
    tbody.querySelectorAll('.gestao-delete-third-party-subtype').forEach(button => {
        button.addEventListener('click', () => deleteGestaoThirdPartySubtypeRow(button.closest('tr')));
    });
}

async function saveGestaoThirdPartySubtypeRow(row) {
    if (!row || !canAccessGestao()) return;

    const subtypeId = Number(row.dataset.subtypeId);
    const name = row.querySelector('.gestao-third-party-subtype-name')?.value.trim();
    const sortOrder = Number(row.querySelector('.gestao-third-party-subtype-sort')?.value) || 0;
    const isActive = Boolean(row.querySelector('.gestao-third-party-subtype-active')?.checked);
    const characteristicRaw = row.querySelector('.gestao-third-party-subtype-characteristic')?.value;
    const projectCharacteristicId = characteristicRaw ? Number(characteristicRaw) : null;

    if (!name) {
        alertAppDialog('Informe o nome do subtipo.');
        return;
    }

    const now = new Date().toISOString();
    const payload = { name, sortOrder, isActive, updatedAt: now };
    if (gestaoThirdPartySubtypeCharacteristicEnabled) {
        payload.projectCharacteristicId = projectCharacteristicId;
    }

    const { error } = await supabaseClient
        .from('ThirdPartySubtype')
        .update(payload)
        .eq('id', subtypeId);

    if (error) {
        if (error.message?.includes('projectCharacteristicId')) {
            alertAppDialog('Execute supabase/create-third-party-subtype-characteristic-link.sql no Supabase para salvar a característica.');
            return;
        }
        alertAppDialog('Erro ao salvar subtipo: ' + error.message);
        return;
    }

    await loadGestaoThirdPartySubtypesList();
}

async function deleteGestaoThirdPartySubtypeRow(row) {
    if (!row || !canAccessGestao()) return;

    const subtypeId = Number(row.dataset.subtypeId);
    const name = row.querySelector('.gestao-third-party-subtype-name')?.value.trim() || 'este subtipo';

    const { count, error: countError } = await supabaseClient
        .from('ImplementationPurchaseItem')
        .select('id', { count: 'exact', head: true })
        .eq('thirdPartySubtypeId', subtypeId);

    if (countError) {
        if (countError.message?.includes('ImplementationPurchaseItem')) {
            alertAppDialog('Execute supabase/create-implantacao-purchase-item.sql no Supabase para habilitar a exclusão com verificação de uso.');
            return;
        }
        alertAppDialog('Erro ao verificar uso do subtipo: ' + countError.message);
        return;
    }

    if (count > 0) {
        alertAppDialog(`O subtipo "${name}" está em uso por ${count} implantação(ões). Desative-o em vez de excluir.`);
        return;
    }

    const { count: projectCount, error: projectCountError } = await supabaseClient
        .from('ThirdPartyProject')
        .select('id', { count: 'exact', head: true })
        .eq('thirdPartySubtypeId', subtypeId);

    if (projectCountError) {
        if (!projectCountError.message?.includes('ThirdPartyProject')) {
            alertAppDialog('Erro ao verificar uso do subtipo: ' + projectCountError.message);
            return;
        }
    } else if (projectCount > 0) {
        alertAppDialog(`O subtipo "${name}" está em uso por ${projectCount} projeto(s) de terceiros. Desative-o em vez de excluir.`);
        return;
    }

    if (!(await confirmAppDialog(`Excluir o subtipo "${name}"?`))) return;

    const { error } = await supabaseClient
        .from('ThirdPartySubtype')
        .delete()
        .eq('id', subtypeId);

    if (error) {
        alertAppDialog('Erro ao excluir subtipo: ' + error.message);
        return;
    }

    await loadGestaoThirdPartySubtypesList();
}

async function addGestaoThirdPartySubtype(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const name = document.getElementById('gestao-new-third-party-subtype-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-third-party-subtype-sort')?.value) || 0;
    const characteristicRaw = document.getElementById('gestao-new-third-party-subtype-characteristic')?.value;
    const projectCharacteristicId = characteristicRaw ? Number(characteristicRaw) : null;

    if (!name) {
        alertAppDialog('Informe o nome do subtipo.');
        return;
    }

    const now = new Date().toISOString();
    const payload = {
        name,
        sortOrder,
        isActive: true,
        updatedAt: now
    };
    if (gestaoThirdPartySubtypeCharacteristicEnabled && projectCharacteristicId) {
        payload.projectCharacteristicId = projectCharacteristicId;
    }

    const { error } = await supabaseClient
        .from('ThirdPartySubtype')
        .insert(payload);

    if (error) {
        if (error.message?.includes('projectCharacteristicId')) {
            alertAppDialog('Execute supabase/create-third-party-subtype-characteristic-link.sql no Supabase para vincular características.');
            return;
        }
        alertAppDialog('Erro ao adicionar subtipo: ' + error.message);
        return;
    }

    document.getElementById('gestao-new-third-party-subtype-form')?.reset();
    document.getElementById('gestao-new-third-party-subtype-sort').value = '0';
    await loadGestaoThirdPartySubtypesList();
}

let gestaoCompraStatusesCache = [];

async function loadGestaoCompraStatuses(activeOnly = false) {
    let query = supabaseClient
        .from('PurchaseStatus')
        .select('id, name, sortOrder, isActive, isClosed')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('loadGestaoCompraStatuses:', error);
        gestaoCompraStatusesCache = [];
        return [];
    }

    gestaoCompraStatusesCache = data || [];
    return gestaoCompraStatusesCache;
}

async function loadGestaoCompraStatusList() {
    const tbody = document.getElementById('gestao-compra-status-list');
    if (!tbody) return;

    const statuses = await loadGestaoCompraStatuses(false);

    if (!statuses.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-6 text-center text-xs text-amber-700">
                    Nenhum status cadastrado. Consulte <code>PENDING-PROD-SQL.md</code> ou <code>supabase/schema/</code>.
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
                <input type="number" class="gestao-compra-status-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(status.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-compra-status-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(status.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-compra-status-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${status.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-compra-status-closed h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${status.isClosed === true ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-compra-status text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="gestao-delete-compra-status text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.gestao-save-compra-status').forEach(button => {
        button.addEventListener('click', () => saveGestaoCompraStatusRow(button.closest('tr')));
    });
    tbody.querySelectorAll('.gestao-delete-compra-status').forEach(button => {
        button.addEventListener('click', () => deleteGestaoCompraStatusRow(button.closest('tr')));
    });
}

async function saveGestaoCompraStatusRow(row) {
    if (!row || !canAccessGestao()) return;

    const statusId = Number(row.dataset.statusId);
    const name = row.querySelector('.gestao-compra-status-name')?.value.trim();
    const sortOrder = Number(row.querySelector('.gestao-compra-status-sort')?.value) || 0;
    const isActive = Boolean(row.querySelector('.gestao-compra-status-active')?.checked);
    const isClosed = Boolean(row.querySelector('.gestao-compra-status-closed')?.checked);
    const previousName = gestaoCompraStatusesCache.find(status => Number(status.id) === statusId)?.name || name;

    if (!name) {
        alertAppDialog('Informe o nome do status.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('PurchaseStatus')
        .update({ name, sortOrder, isActive, isClosed, updatedAt: now })
        .eq('id', statusId);

    if (error) {
        alertAppDialog('Erro ao salvar status: ' + error.message);
        return;
    }

    if (previousName !== name) {
        const { error: comprasError } = await supabaseClient
            .from('Purchase')
            .update({ status: name, updatedAt: now })
            .eq('status', previousName);

        if (comprasError) {
            alertAppDialog('Status salvo, mas houve erro ao atualizar compras vinculadas: ' + comprasError.message);
        }
    }

    if (typeof loadCompraStatuses === 'function') {
        await loadCompraStatuses(true, true);
    }
    await loadGestaoCompraStatusList();
}

async function deleteGestaoCompraStatusRow(row) {
    if (!row || !canAccessGestao()) return;

    const statusId = Number(row.dataset.statusId);
    const name = row.querySelector('.gestao-compra-status-name')?.value.trim() || 'este status';

    const { count, error: countError } = await supabaseClient
        .from('Purchase')
        .select('id', { count: 'exact', head: true })
        .eq('status', name);

    if (countError) {
        alertAppDialog('Erro ao verificar uso do status: ' + countError.message);
        return;
    }

    if (count > 0) {
        alertAppDialog(`O status "${name}" está em uso por ${count} compra(s). Desative-o em vez de excluir.`);
        return;
    }

    if (!(await confirmAppDialog(`Excluir o status "${name}"?`))) return;

    const { error } = await supabaseClient
        .from('PurchaseStatus')
        .delete()
        .eq('id', statusId);

    if (error) {
        alertAppDialog('Erro ao excluir status: ' + error.message);
        return;
    }

    if (typeof loadCompraStatuses === 'function') {
        await loadCompraStatuses(true, true);
    }
    await loadGestaoCompraStatusList();
}

async function addGestaoCompraStatus(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const name = document.getElementById('gestao-new-compra-status-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-compra-status-sort')?.value) || 0;

    if (!name) {
        alertAppDialog('Informe o nome do status.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('PurchaseStatus')
        .insert({
            name,
            sortOrder,
            isActive: true,
            isClosed: false,
            updatedAt: now
        });

    if (error) {
        alertAppDialog('Erro ao adicionar status: ' + error.message);
        return;
    }

    document.getElementById('gestao-new-compra-status-form')?.reset();
    document.getElementById('gestao-new-compra-status-sort').value = '0';
    if (typeof loadCompraStatuses === 'function') {
        await loadCompraStatuses(true, true);
    }
    await loadGestaoCompraStatusList();
}

