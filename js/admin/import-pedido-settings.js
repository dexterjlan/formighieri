const SETTINGS_NAV_ACTIVE_CLASS = 'settings-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white';
const SETTINGS_NAV_INACTIVE_CLASS = 'settings-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-transparent';

let importConsultorFgpUsersCache = [];

function setSettingsNavActive(panelKey) {
    const buttons = {
        geral: document.getElementById('settings-nav-geral'),
        'import-pedido': document.getElementById('settings-nav-import-pedido')
    };

    Object.entries(buttons).forEach(([key, button]) => {
        if (!button) return;
        button.className = key === panelKey ? SETTINGS_NAV_ACTIVE_CLASS : SETTINGS_NAV_INACTIVE_CLASS;
    });

    document.getElementById('settings-general-panel')?.classList.toggle('hidden', panelKey !== 'geral');
    document.getElementById('settings-import-pedido-panel')?.classList.toggle('hidden', panelKey !== 'import-pedido');
}

function renderImportStatusWpsList(rows) {
    const tbody = document.getElementById('import-status-wps-list');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-6 text-center text-xs text-amber-700">
                    Nenhum mapeamento cadastrado. Execute <code>supabase/create-import-wps-mappings.sql</code> no Supabase ou adicione abaixo.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr data-row-id="${row.id}">
            <td class="p-3">
                <input type="text" class="import-status-wps-field w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    data-field="StatusWPS" value="${escapeHtml(row.StatusWPS || '')}" required>
            </td>
            <td class="p-3">
                <input type="text" class="import-status-wps-field w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    data-field="StatusFGP" value="${escapeHtml(row.StatusFGP || '')}" required>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="import-status-wps-save text-xs bg-slate-900 text-white hover:bg-slate-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="import-status-wps-delete text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.import-status-wps-save').forEach(button => {
        button.addEventListener('click', () => saveImportStatusWpsRow(button.closest('tr')));
    });
    tbody.querySelectorAll('.import-status-wps-delete').forEach(button => {
        button.addEventListener('click', () => deleteImportStatusWpsRow(button.closest('tr')));
    });
}

function renderImportConsultorWpsList(rows) {
    const tbody = document.getElementById('import-consultor-wps-list');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-6 text-center text-xs text-amber-700">
                    Nenhum mapeamento cadastrado. Execute <code>supabase/create-import-wps-mappings.sql</code> no Supabase ou adicione abaixo.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr data-row-id="${row.id}">
            <td class="p-3">
                <input type="text" class="import-consultor-wps-field w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    data-field="ConsultorWPS" value="${escapeHtml(row.ConsultorWPS || '')}" required>
            </td>
            <td class="p-3">
                ${getImportConsultorFgpSelectHtml(row.ConsultorFGP || '')}
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="import-consultor-wps-save text-xs bg-slate-900 text-white hover:bg-slate-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="import-consultor-wps-delete text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.import-consultor-wps-save').forEach(button => {
        button.addEventListener('click', () => saveImportConsultorWpsRow(button.closest('tr')));
    });
    tbody.querySelectorAll('.import-consultor-wps-delete').forEach(button => {
        button.addEventListener('click', () => deleteImportConsultorWpsRow(button.closest('tr')));
    });
}

async function loadImportConsultorFgpUsers() {
    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('isActive', true)
        .eq('role', 'Consultor')
        .order('name', { ascending: true });

    if (error) {
        console.error('loadImportConsultorFgpUsers:', error);
        importConsultorFgpUsersCache = [];
        return [];
    }

    importConsultorFgpUsersCache = data || [];
    return importConsultorFgpUsersCache;
}

function getImportConsultorFgpSelectHtml(selectedName = '') {
    const normalizedSelected = String(selectedName || '').trim();
    const users = importConsultorFgpUsersCache;
    const selectClass = 'import-consultor-wps-field w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600';

    if (!users.length) {
        return `<select class="${selectClass}" data-field="ConsultorFGP" required disabled>
            <option value="">Cadastre consultores ativos</option>
        </select>`;
    }

    const hasSelected = users.some(user => user.name === normalizedSelected);
    let optionsHtml = '';

    if (!normalizedSelected || hasSelected) {
        optionsHtml += '<option value="">Selecione...</option>';
    }

    if (normalizedSelected && !hasSelected) {
        optionsHtml += `<option value="${escapeHtml(normalizedSelected)}" selected>${escapeHtml(normalizedSelected)} (não encontrado)</option>`;
    }

    optionsHtml += users.map(user => {
        const selected = user.name === normalizedSelected ? ' selected' : '';
        return `<option value="${escapeHtml(user.name)}"${selected}>${escapeHtml(user.name)}</option>`;
    }).join('');

    return `<select class="${selectClass}" data-field="ConsultorFGP" required>${optionsHtml}</select>`;
}

function populateImportConsultorFgpNewSelect(selectedName = '') {
    const select = document.getElementById('import-consultor-wps-new-fgp');
    if (!select) return;

    const normalizedSelected = String(selectedName || '').trim();
    const users = importConsultorFgpUsersCache;

    select.innerHTML = '';
    select.disabled = false;

    if (!users.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Cadastre consultores ativos';
        select.appendChild(option);
        select.disabled = true;
        return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione...';
    select.appendChild(placeholder);

    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.name;
        option.textContent = user.name;
        if (user.name === normalizedSelected) {
            option.selected = true;
            placeholder.selected = false;
        }
        select.appendChild(option);
    });
}

function renderImportMarceneiroWpsList(rows) {
    const tbody = document.getElementById('import-marceneiro-wps-list');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-6 text-center text-xs text-amber-700">
                    Nenhum mapeamento cadastrado. Execute <code>supabase/create-import-wps-mappings.sql</code> no Supabase ou adicione abaixo.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr data-row-id="${row.id}">
            <td class="p-3">
                <input type="text" class="import-marceneiro-wps-field w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    data-field="MarceneiroWPS" value="${escapeHtml(row.MarceneiroWPS || '')}" required>
            </td>
            <td class="p-3">
                <input type="text" class="import-marceneiro-wps-field w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    data-field="MarceneiroFGP" value="${escapeHtml(row.MarceneiroFGP || '')}" required>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="import-marceneiro-wps-save text-xs bg-slate-900 text-white hover:bg-slate-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="import-marceneiro-wps-delete text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.import-marceneiro-wps-save').forEach(button => {
        button.addEventListener('click', () => saveImportMarceneiroWpsRow(button.closest('tr')));
    });
    tbody.querySelectorAll('.import-marceneiro-wps-delete').forEach(button => {
        button.addEventListener('click', () => deleteImportMarceneiroWpsRow(button.closest('tr')));
    });
}

function readImportWpsRowValues(row, fieldClass) {
    const values = {};
    row.querySelectorAll(`.${fieldClass}`).forEach(input => {
        values[input.dataset.field] = input.value.trim();
    });
    return values;
}

async function loadImportPedidoSettings() {
    await loadImportConsultorFgpUsers();
    populateImportConsultorFgpNewSelect();

    const [statusResult, consultorResult, marceneiroResult] = await Promise.all([
        supabaseClient.from('importStatusWPS').select('id, StatusWPS, StatusFGP').order('StatusWPS', { ascending: true }),
        supabaseClient.from('importConsultorWPS').select('id, ConsultorWPS, ConsultorFGP').order('ConsultorWPS', { ascending: true }),
        supabaseClient.from('importMarceneiroWPS').select('id, MarceneiroWPS, MarceneiroFGP').order('MarceneiroWPS', { ascending: true })
    ]);

    if (statusResult.error) {
        renderImportStatusWpsList([]);
        if (!statusResult.error.message?.includes('importStatusWPS')) {
            alertAppDialog('Erro ao carregar status WPS: ' + statusResult.error.message);
        }
    } else {
        renderImportStatusWpsList(statusResult.data || []);
    }

    if (consultorResult.error) {
        renderImportConsultorWpsList([]);
        if (!consultorResult.error.message?.includes('importConsultorWPS')) {
            alertAppDialog('Erro ao carregar consultor WPS: ' + consultorResult.error.message);
        }
    } else {
        renderImportConsultorWpsList(consultorResult.data || []);
    }

    if (marceneiroResult.error) {
        renderImportMarceneiroWpsList([]);
        if (!marceneiroResult.error.message?.includes('importMarceneiroWPS')) {
            alertAppDialog('Erro ao carregar marceneiro WPS: ' + marceneiroResult.error.message);
        }
    } else {
        renderImportMarceneiroWpsList(marceneiroResult.data || []);
    }
}

async function saveImportStatusWpsRow(row) {
    if (!row || !isAdmin()) return;

    const rowId = Number(row.dataset.rowId);
    const values = readImportStatusWpsRowValues(row, 'import-status-wps-field');

    if (!values.StatusWPS || !values.StatusFGP) {
        alertAppDialog('Informe StatusWPS e StatusFGP.');
        return;
    }

    const { error } = await supabaseClient
        .from('importStatusWPS')
        .update(values)
        .eq('id', rowId);

    if (error) {
        alertAppDialog('Erro ao salvar status WPS: ' + error.message);
        return;
    }

    await loadImportPedidoSettings();
}

async function deleteImportStatusWpsRow(row) {
    if (!row || !isAdmin()) return;

    const rowId = Number(row.dataset.rowId);
    const values = readImportStatusWpsRowValues(row, 'import-status-wps-field');
    if (!(await confirmAppDialog(`Excluir mapeamento "${values.StatusWPS}" → "${values.StatusFGP}"?`))) return;

    const { error } = await supabaseClient
        .from('importStatusWPS')
        .delete()
        .eq('id', rowId);

    if (error) {
        alertAppDialog('Erro ao excluir status WPS: ' + error.message);
        return;
    }

    await loadImportPedidoSettings();
}

async function addImportStatusWps(event) {
    event.preventDefault();
    if (!isAdmin()) return;

    const statusWps = document.getElementById('import-status-wps-new-wps')?.value.trim();
    const statusFgp = document.getElementById('import-status-wps-new-fgp')?.value.trim();

    if (!statusWps || !statusFgp) {
        alertAppDialog('Informe StatusWPS e StatusFGP.');
        return;
    }

    const { error } = await supabaseClient
        .from('importStatusWPS')
        .insert({ StatusWPS: statusWps, StatusFGP: statusFgp });

    if (error) {
        alertAppDialog('Erro ao adicionar status WPS: ' + error.message);
        return;
    }

    event.target.reset();
    await loadImportPedidoSettings();
}

async function saveImportConsultorWpsRow(row) {
    if (!row || !isAdmin()) return;

    const rowId = Number(row.dataset.rowId);
    const values = readImportWpsRowValues(row, 'import-consultor-wps-field');

    if (!values.ConsultorWPS || !values.ConsultorFGP) {
        alertAppDialog('Informe ConsultorWPS e ConsultorFGP.');
        return;
    }

    const { error } = await supabaseClient
        .from('importConsultorWPS')
        .update(values)
        .eq('id', rowId);

    if (error) {
        alertAppDialog('Erro ao salvar consultor WPS: ' + error.message);
        return;
    }

    await loadImportPedidoSettings();
}

async function deleteImportConsultorWpsRow(row) {
    if (!row || !isAdmin()) return;

    const rowId = Number(row.dataset.rowId);
    const values = readImportWpsRowValues(row, 'import-consultor-wps-field');
    if (!(await confirmAppDialog(`Excluir mapeamento "${values.ConsultorWPS}" → "${values.ConsultorFGP}"?`))) return;

    const { error } = await supabaseClient
        .from('importConsultorWPS')
        .delete()
        .eq('id', rowId);

    if (error) {
        alertAppDialog('Erro ao excluir consultor WPS: ' + error.message);
        return;
    }

    await loadImportPedidoSettings();
}

async function addImportConsultorWps(event) {
    event.preventDefault();
    if (!isAdmin()) return;

    const consultorWps = document.getElementById('import-consultor-wps-new-wps')?.value.trim();
    const consultorFgp = document.getElementById('import-consultor-wps-new-fgp')?.value.trim();

    if (!consultorWps || !consultorFgp) {
        alertAppDialog('Informe ConsultorWPS e ConsultorFGP.');
        return;
    }

    const { error } = await supabaseClient
        .from('importConsultorWPS')
        .insert({ ConsultorWPS: consultorWps, ConsultorFGP: consultorFgp });

    if (error) {
        alertAppDialog('Erro ao adicionar consultor WPS: ' + error.message);
        return;
    }

    event.target.reset();
    await loadImportPedidoSettings();
}

async function saveImportMarceneiroWpsRow(row) {
    if (!row || !isAdmin()) return;

    const rowId = Number(row.dataset.rowId);
    const values = readImportWpsRowValues(row, 'import-marceneiro-wps-field');

    if (!values.MarceneiroWPS || !values.MarceneiroFGP) {
        alertAppDialog('Informe MarceneiroWPS e MarceneiroFGP.');
        return;
    }

    const { error } = await supabaseClient
        .from('importMarceneiroWPS')
        .update(values)
        .eq('id', rowId);

    if (error) {
        alertAppDialog('Erro ao salvar marceneiro WPS: ' + error.message);
        return;
    }

    await loadImportPedidoSettings();
}

async function deleteImportMarceneiroWpsRow(row) {
    if (!row || !isAdmin()) return;

    const rowId = Number(row.dataset.rowId);
    const values = readImportWpsRowValues(row, 'import-marceneiro-wps-field');
    if (!(await confirmAppDialog(`Excluir mapeamento "${values.MarceneiroWPS}" → "${values.MarceneiroFGP}"?`))) return;

    const { error } = await supabaseClient
        .from('importMarceneiroWPS')
        .delete()
        .eq('id', rowId);

    if (error) {
        alertAppDialog('Erro ao excluir marceneiro WPS: ' + error.message);
        return;
    }

    await loadImportPedidoSettings();
}

async function addImportMarceneiroWps(event) {
    event.preventDefault();
    if (!isAdmin()) return;

    const marceneiroWps = document.getElementById('import-marceneiro-wps-new-wps')?.value.trim();
    const marceneiroFgp = document.getElementById('import-marceneiro-wps-new-fgp')?.value.trim();

    if (!marceneiroWps || !marceneiroFgp) {
        alertAppDialog('Informe MarceneiroWPS e MarceneiroFGP.');
        return;
    }

    const { error } = await supabaseClient
        .from('importMarceneiroWPS')
        .insert({ MarceneiroWPS: marceneiroWps, MarceneiroFGP: marceneiroFgp });

    if (error) {
        alertAppDialog('Erro ao adicionar marceneiro WPS: ' + error.message);
        return;
    }

    event.target.reset();
    await loadImportPedidoSettings();
}

async function showImportPedidoSettingsPanel() {
    if (!isAdmin()) return;
    setSettingsNavActive('import-pedido');
    await loadImportPedidoSettings();
}

function bindImportPedidoSettingsEvents() {
    document.getElementById('settings-nav-geral')?.addEventListener('click', () => {
        setSettingsNavActive('geral');
    });
    document.getElementById('settings-nav-import-pedido')?.addEventListener('click', showImportPedidoSettingsPanel);
    document.getElementById('import-status-wps-form')?.addEventListener('submit', addImportStatusWps);
    document.getElementById('import-consultor-wps-form')?.addEventListener('submit', addImportConsultorWps);
    document.getElementById('import-marceneiro-wps-form')?.addEventListener('submit', addImportMarceneiroWps);
}
