const FACTORY_ROLE_MARCENEIRO_NAME = 'Marceneiro';
const GESTAO_FACTORY_SQL_HINT =
    'Execute supabase/feats/factory-role-and-employee.sql no Supabase SQL Editor (DEV).';

let gestaoFactoryRolesCache = [];
let gestaoFactoryEmployeesCache = [];

function getGestaoMarceneiroFactoryRoleId() {
    const role = (gestaoFactoryRolesCache || []).find(
        item => String(item.name || '').trim() === FACTORY_ROLE_MARCENEIRO_NAME
    );
    return role?.id ? Number(role.id) : null;
}

function isGestaoMarceneiroFactoryRoleId(factoryRoleId) {
    const marceneiroId = getGestaoMarceneiroFactoryRoleId();
    return marceneiroId != null && Number(factoryRoleId) === marceneiroId;
}

function findFactorySortOrderConflict(sortOrder, items, excludeId = null) {
    const normalizedOrder = Number(sortOrder) || 0;
    const exclude = excludeId == null ? null : Number(excludeId);
    return (items || []).find(item => {
        if (exclude != null && Number(item.id) === exclude) return false;
        return Number(item.sortOrder) === normalizedOrder;
    });
}

function getNextFactoryRoleSortOrder(items) {
    const orders = (items || []).map(item => Number(item.sortOrder) || 0);
    if (!orders.length) return 10;
    return Math.max(...orders) + 10;
}

function getNextFactoryEmployeeSortOrder(items) {
    const orders = (items || []).map(item => Number(item.sortOrder) || 0);
    if (!orders.length) return 1;
    return Math.max(...orders) + 1;
}

function syncGestaoNewFactoryRoleSortInput() {
    const input = document.getElementById('gestao-new-factory-role-sort');
    if (!input) return;
    input.value = String(getNextFactoryRoleSortOrder(gestaoFactoryRolesCache));
}

function syncGestaoNewFactoryEmployeeSortInput() {
    const input = document.getElementById('gestao-new-factory-employee-sort');
    if (!input) return;
    input.value = String(getNextFactoryEmployeeSortOrder(gestaoFactoryEmployeesCache));
}

async function loadGestaoFactoryRoles(activeOnly = false) {
    const { data, error } = await supabaseClient
        .from('FactoryRole')
        .select('id, name, sortOrder, isActive, createdAt, updatedAt')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        console.error('loadGestaoFactoryRoles:', error);
        gestaoFactoryRolesCache = [];
        return [];
    }

    gestaoFactoryRolesCache = activeOnly
        ? (data || []).filter(role => role.isActive !== false)
        : (data || []);
    return gestaoFactoryRolesCache;
}

function buildGestaoFactoryRoleOptionsHtml(selectedId = null, { activeOnly = true } = {}) {
    const rows = activeOnly
        ? (gestaoFactoryRolesCache || []).filter(role => role.isActive !== false)
        : (gestaoFactoryRolesCache || []);
    const options = rows.map(role => {
        const inactive = role.isActive === false ? ' (inativo)' : '';
        const selected = Number(selectedId) === Number(role.id) ? ' selected' : '';
        return `<option value="${role.id}"${selected}>${escapeHtml(`${role.name || ''}${inactive}`)}</option>`;
    }).join('');
    return `<option value="">Selecione…</option>${options}`;
}

async function loadGestaoFactoryRolesList() {
    const tbody = document.getElementById('gestao-factory-roles-list');
    if (!tbody) return;

    const roles = await loadGestaoFactoryRoles(false);

    syncGestaoNewFactoryRoleSortInput();

    if (!roles.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-xs text-amber-700">
                    Nenhuma função cadastrada. ${escapeHtml(GESTAO_FACTORY_SQL_HINT)}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    roles.forEach(role => {
        const tr = document.createElement('tr');
        tr.dataset.factoryRoleId = String(role.id);
        tr.innerHTML = `
            <td class="p-3">
                <input type="number" class="gestao-factory-role-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(role.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-factory-role-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(role.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-factory-role-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${role.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-factory-role text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="gestao-delete-factory-role text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveGestaoFactoryRoleRow(row) {
    if (!row || !canAccessGestao()) return;

    const factoryRoleId = Number(row.dataset.factoryRoleId);
    const name = row.querySelector('.gestao-factory-role-name')?.value.trim();
    const sortOrder = Number(row.querySelector('.gestao-factory-role-sort')?.value) || 0;
    const isActive = Boolean(row.querySelector('.gestao-factory-role-active')?.checked);

    if (!name) {
        alertAppDialog('Informe o nome da função.');
        return;
    }

    const conflict = findFactorySortOrderConflict(sortOrder, gestaoFactoryRolesCache, factoryRoleId);
    if (conflict) {
        alertAppDialog(`Já existe uma função com a ordem ${sortOrder} (${conflict.name || 'sem nome'}).`);
        return;
    }

    await withGestaoCadastroSaveOverlay(row, async () => {
        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('FactoryRole')
            .update({ name, sortOrder, isActive, updatedAt: now })
            .eq('id', factoryRoleId);

        if (error) {
            const duplicate = /unique|duplicate/i.test(error.message || '');
            alertAppDialog(duplicate
                ? 'Já existe uma função com esse nome.'
                : `Erro ao salvar função: ${error.message}`);
            return;
        }

        await loadGestaoFactoryRolesList();
        if (typeof loadGestaoFactoryEmployeesList === 'function') {
            await loadGestaoFactoryEmployeesList();
        }
    });
}

async function deleteGestaoFactoryRoleRow(row) {
    if (!row || !canAccessGestao()) return;

    const factoryRoleId = Number(row.dataset.factoryRoleId);
    const name = row.querySelector('.gestao-factory-role-name')?.value.trim() || 'esta função';

    const { count, error: countError } = await supabaseClient
        .from('FactoryEmployee')
        .select('id', { count: 'exact', head: true })
        .eq('factoryRoleId', factoryRoleId);

    if (countError) {
        if (/FactoryEmployee|FactoryRole|schema cache/i.test(countError.message || '')) {
            alertAppDialog(GESTAO_FACTORY_SQL_HINT);
            return;
        }
        alertAppDialog('Erro ao verificar uso da função: ' + countError.message);
        return;
    }

    if (count > 0) {
        alertAppDialog(`A função "${name}" está vinculada a ${count} funcionário(s). Desative-a em vez de excluir.`);
        return;
    }

    if (!(await confirmAppDialog(`Excluir a função "${name}"?`))) return;

    const { error } = await supabaseClient
        .from('FactoryRole')
        .delete()
        .eq('id', factoryRoleId);

    if (error) {
        alertAppDialog('Erro ao excluir função: ' + error.message);
        return;
    }

    await loadGestaoFactoryRolesList();
}

async function addGestaoFactoryRole(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const name = document.getElementById('gestao-new-factory-role-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-factory-role-sort')?.value) || 0;

    if (!name) {
        alertAppDialog('Informe o nome da função.');
        return;
    }

    await loadGestaoFactoryRoles(false);
    const conflict = findFactorySortOrderConflict(sortOrder, gestaoFactoryRolesCache);
    if (conflict) {
        alertAppDialog(`Já existe uma função com a ordem ${sortOrder} (${conflict.name || 'sem nome'}).`);
        return;
    }

    await withGestaoCadastroSaveOverlay(document.getElementById('gestao-factory-roles-panel'), async () => {
        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('FactoryRole')
            .insert({
                name,
                sortOrder,
                isActive: true,
                createdAt: now,
                updatedAt: now
            });

        if (error) {
            const missing = /FactoryRole|schema cache/i.test(error.message || '');
            const duplicate = /unique|duplicate/i.test(error.message || '');
            if (missing) alertAppDialog(`${error.message}. ${GESTAO_FACTORY_SQL_HINT}`);
            else if (duplicate) alertAppDialog('Já existe uma função com esse nome.');
            else alertAppDialog('Erro ao adicionar função: ' + error.message);
            return;
        }

        document.getElementById('gestao-new-factory-role-form')?.reset();
        await loadGestaoFactoryRolesList();
    });
}

async function loadGestaoFactoryEmployees(activeOnly = false) {
    const { data, error } = await supabaseClient
        .from('FactoryEmployee')
        .select(`
            id, name, factoryRoleId, sortOrder, isActive, legacyCabinetMakerId, createdAt, updatedAt,
            factoryRole:FactoryRole(id, name, isActive)
        `)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        if (/factoryRole|FactoryRole|relationship/i.test(error.message || '')) {
            const fallback = await supabaseClient
                .from('FactoryEmployee')
                .select('id, name, factoryRoleId, sortOrder, isActive, legacyCabinetMakerId, createdAt, updatedAt')
                .order('sortOrder', { ascending: true })
                .order('name', { ascending: true });
            if (fallback.error) {
                console.error('loadGestaoFactoryEmployees:', fallback.error);
                gestaoFactoryEmployeesCache = [];
                return [];
            }
            gestaoFactoryEmployeesCache = activeOnly
                ? (fallback.data || []).filter(row => row.isActive !== false)
                : (fallback.data || []);
            return gestaoFactoryEmployeesCache;
        }
        console.error('loadGestaoFactoryEmployees:', error);
        gestaoFactoryEmployeesCache = [];
        return [];
    }

    gestaoFactoryEmployeesCache = activeOnly
        ? (data || []).filter(row => row.isActive !== false)
        : (data || []);
    return gestaoFactoryEmployeesCache;
}

async function syncLegacyCabinetMakerFromFactoryEmployee(payload, legacyCabinetMakerId) {
    if (!legacyCabinetMakerId) return { error: null };
    const now = new Date().toISOString();
    return supabaseClient
        .from('CabinetMaker')
        .update({
            name: payload.name,
            sortOrder: payload.sortOrder,
            isActive: payload.isActive,
            updatedAt: now
        })
        .eq('id', legacyCabinetMakerId);
}

async function createLegacyCabinetMakerForFactoryEmployee(payload) {
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('CabinetMaker')
        .insert({
            name: payload.name,
            sortOrder: payload.sortOrder,
            isActive: payload.isActive,
            createdAt: now,
            updatedAt: now
        })
        .select('id')
        .single();
    return { data, error };
}

async function loadGestaoFactoryEmployeesList() {
    const tbody = document.getElementById('gestao-factory-employees-list');
    const roleSelectNew = document.getElementById('gestao-new-factory-employee-role');
    if (!tbody) return;

    await loadGestaoFactoryRoles(false);
    const roleOptionsHtml = buildGestaoFactoryRoleOptionsHtml();
    if (roleSelectNew) roleSelectNew.innerHTML = roleOptionsHtml;

    const employees = await loadGestaoFactoryEmployees(false);

    syncGestaoNewFactoryEmployeeSortInput();

    if (!employees.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-6 text-center text-xs text-amber-700">
                    Nenhum funcionário cadastrado. ${escapeHtml(GESTAO_FACTORY_SQL_HINT)}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    employees.forEach(employee => {
        const roleId = employee.factoryRoleId ?? employee.factoryRole?.id;
        const tr = document.createElement('tr');
        tr.dataset.factoryEmployeeId = String(employee.id);
        if (employee.legacyCabinetMakerId) {
            tr.dataset.legacyCabinetMakerId = String(employee.legacyCabinetMakerId);
        }
        const rowRoleOptions = buildGestaoFactoryRoleOptionsHtml(roleId, { activeOnly: false });
        tr.innerHTML = `
            <td class="p-3">
                <input type="number" class="gestao-factory-employee-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(employee.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-factory-employee-name w-full min-w-[140px] px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(employee.name)}" required>
            </td>
            <td class="p-3 min-w-[160px]">
                <select class="gestao-factory-employee-role w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                    ${rowRoleOptions}
                </select>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-factory-employee-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${employee.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-factory-employee text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="gestao-delete-factory-employee text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function readGestaoFactoryEmployeeRow(row) {
    const factoryRoleId = Number(row.querySelector('.gestao-factory-employee-role')?.value);
    const name = row.querySelector('.gestao-factory-employee-name')?.value.trim();
    const sortOrder = Number(row.querySelector('.gestao-factory-employee-sort')?.value) || 0;
    const isActive = Boolean(row.querySelector('.gestao-factory-employee-active')?.checked);
    return { factoryRoleId, name, sortOrder, isActive };
}

async function saveGestaoFactoryEmployeeRow(row) {
    if (!row || !canAccessGestao()) return;

    const factoryEmployeeId = Number(row.dataset.factoryEmployeeId);
    const legacyCabinetMakerId = row.dataset.legacyCabinetMakerId
        ? Number(row.dataset.legacyCabinetMakerId)
        : null;
    const { factoryRoleId, name, sortOrder, isActive } = readGestaoFactoryEmployeeRow(row);

    if (!name) {
        alertAppDialog('Informe o nome do funcionário.');
        return;
    }
    if (!factoryRoleId) {
        alertAppDialog('Selecione a função do funcionário.');
        return;
    }

    const conflict = findFactorySortOrderConflict(sortOrder, gestaoFactoryEmployeesCache, factoryEmployeeId);
    if (conflict) {
        alertAppDialog(`Já existe um funcionário com a ordem ${sortOrder} (${conflict.name || 'sem nome'}).`);
        return;
    }

    const payload = { name, factoryRoleId, sortOrder, isActive };
    const marceneiroRole = isGestaoMarceneiroFactoryRoleId(factoryRoleId);

    await withGestaoCadastroSaveOverlay(row, async () => {
        const now = new Date().toISOString();
        let nextLegacyId = legacyCabinetMakerId;

        if (marceneiroRole && !nextLegacyId) {
            const created = await createLegacyCabinetMakerForFactoryEmployee(payload);
            if (created.error) {
                alertAppDialog('Erro ao criar vínculo de marceneiro: ' + created.error.message);
                return;
            }
            nextLegacyId = created.data?.id ?? null;
        } else if (marceneiroRole && nextLegacyId) {
            const { error: syncError } = await syncLegacyCabinetMakerFromFactoryEmployee(payload, nextLegacyId);
            if (syncError) {
                alertAppDialog('Erro ao sincronizar marceneiro legado: ' + syncError.message);
                return;
            }
        }

        const { error } = await supabaseClient
            .from('FactoryEmployee')
            .update({
                ...payload,
                legacyCabinetMakerId: marceneiroRole ? nextLegacyId : legacyCabinetMakerId,
                updatedAt: now
            })
            .eq('id', factoryEmployeeId);

        if (error) {
            alertAppDialog('Erro ao salvar funcionário: ' + error.message);
            return;
        }

        if (typeof resetMarceneirosCache === 'function') resetMarceneirosCache();
        await loadGestaoFactoryEmployeesList();
    });
}

async function countLegacyCabinetMakerUsage(cabinetMakerId) {
    const tables = [
        { table: 'OrderProject', column: 'cabinetMakerId' },
        { table: 'PartRequest', column: 'cabinetMakerId' },
        { table: 'AssistanceRequest', column: 'cabinetMakerId' }
    ];
    let total = 0;
    for (const { table, column } of tables) {
        const { count, error } = await supabaseClient
            .from(table)
            .select('id', { count: 'exact', head: true })
            .eq(column, cabinetMakerId);
        if (error) {
            if (/schema cache|does not exist|column/i.test(error.message || '')) continue;
            return { error };
        }
        total += count || 0;
    }
    return { count: total };
}

async function deleteGestaoFactoryEmployeeRow(row) {
    if (!row || !canAccessGestao()) return;

    const factoryEmployeeId = Number(row.dataset.factoryEmployeeId);
    const legacyCabinetMakerId = row.dataset.legacyCabinetMakerId
        ? Number(row.dataset.legacyCabinetMakerId)
        : null;
    const name = row.querySelector('.gestao-factory-employee-name')?.value.trim() || 'este funcionário';

    if (legacyCabinetMakerId) {
        const usage = await countLegacyCabinetMakerUsage(legacyCabinetMakerId);
        if (usage.error) {
            alertAppDialog('Erro ao verificar uso do marceneiro legado: ' + usage.error.message);
            return;
        }
        if (usage.count > 0) {
            alertAppDialog(
                `O funcionário "${name}" está vinculado ao marceneiro legado usado em ${usage.count} registro(s). Desative-o em vez de excluir.`
            );
            return;
        }
    }

    if (!(await confirmAppDialog(`Excluir o funcionário "${name}"?`))) return;

    const { error } = await supabaseClient
        .from('FactoryEmployee')
        .delete()
        .eq('id', factoryEmployeeId);

    if (error) {
        alertAppDialog('Erro ao excluir funcionário: ' + error.message);
        return;
    }

    if (legacyCabinetMakerId) {
        await supabaseClient.from('CabinetMaker').delete().eq('id', legacyCabinetMakerId);
    }

    if (typeof resetMarceneirosCache === 'function') resetMarceneirosCache();
    await loadGestaoFactoryEmployeesList();
}

async function addGestaoFactoryEmployee(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const name = document.getElementById('gestao-new-factory-employee-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-factory-employee-sort')?.value) || 0;
    const factoryRoleId = Number(document.getElementById('gestao-new-factory-employee-role')?.value);

    if (!name) {
        alertAppDialog('Informe o nome do funcionário.');
        return;
    }
    if (!factoryRoleId) {
        alertAppDialog('Selecione a função.');
        return;
    }

    await loadGestaoFactoryEmployees(false);
    const conflict = findFactorySortOrderConflict(sortOrder, gestaoFactoryEmployeesCache);
    if (conflict) {
        alertAppDialog(`Já existe um funcionário com a ordem ${sortOrder} (${conflict.name || 'sem nome'}).`);
        return;
    }

    const payload = {
        name,
        sortOrder,
        isActive: true,
        factoryRoleId
    };
    const marceneiroRole = isGestaoMarceneiroFactoryRoleId(factoryRoleId);

    await withGestaoCadastroSaveOverlay(document.getElementById('gestao-factory-employees-panel'), async () => {
        const now = new Date().toISOString();
        let legacyCabinetMakerId = null;

        if (marceneiroRole) {
            const created = await createLegacyCabinetMakerForFactoryEmployee(payload);
            if (created.error) {
                alertAppDialog('Erro ao criar marceneiro legado: ' + created.error.message);
                return;
            }
            legacyCabinetMakerId = created.data?.id ?? null;
        }

        const { error } = await supabaseClient
            .from('FactoryEmployee')
            .insert({
                ...payload,
                legacyCabinetMakerId,
                createdAt: now,
                updatedAt: now
            });

        if (error) {
            if (legacyCabinetMakerId) {
                await supabaseClient.from('CabinetMaker').delete().eq('id', legacyCabinetMakerId);
            }
            const missing = /FactoryEmployee|FactoryRole|schema cache/i.test(error.message || '');
            alertAppDialog(missing ? `${error.message}. ${GESTAO_FACTORY_SQL_HINT}` : `Erro ao adicionar: ${error.message}`);
            return;
        }

        document.getElementById('gestao-new-factory-employee-form')?.reset();
        if (typeof resetMarceneirosCache === 'function') resetMarceneirosCache();
        await loadGestaoFactoryEmployeesList();
    });
}

function bindGestaoFactoryEvents() {
    document.getElementById('gestao-new-factory-role-form')?.addEventListener('submit', addGestaoFactoryRole);
    document.getElementById('gestao-factory-roles-list')?.addEventListener('click', event => {
        const saveBtn = event.target.closest('.gestao-save-factory-role');
        if (saveBtn) {
            event.preventDefault();
            void saveGestaoFactoryRoleRow(saveBtn.closest('tr'));
            return;
        }
        const deleteBtn = event.target.closest('.gestao-delete-factory-role');
        if (deleteBtn) {
            event.preventDefault();
            void deleteGestaoFactoryRoleRow(deleteBtn.closest('tr'));
        }
    });

    document.getElementById('gestao-new-factory-employee-form')?.addEventListener('submit', addGestaoFactoryEmployee);
    document.getElementById('gestao-factory-employees-list')?.addEventListener('click', event => {
        const saveBtn = event.target.closest('.gestao-save-factory-employee');
        if (saveBtn) {
            event.preventDefault();
            void saveGestaoFactoryEmployeeRow(saveBtn.closest('tr'));
            return;
        }
        const deleteBtn = event.target.closest('.gestao-delete-factory-employee');
        if (deleteBtn) {
            event.preventDefault();
            void deleteGestaoFactoryEmployeeRow(deleteBtn.closest('tr'));
        }
    });
}

window.loadGestaoFactoryRoles = loadGestaoFactoryRoles;
window.loadGestaoFactoryRolesList = loadGestaoFactoryRolesList;
window.loadGestaoFactoryEmployees = loadGestaoFactoryEmployees;
window.loadGestaoFactoryEmployeesList = loadGestaoFactoryEmployeesList;
window.bindGestaoFactoryEvents = bindGestaoFactoryEvents;
window.getGestaoMarceneiroFactoryRoleId = getGestaoMarceneiroFactoryRoleId;
