let factoryEmployeesCache = [];

function resetFactoryEmployeesCache() {
    factoryEmployeesCache = [];
}

async function loadFactoryEmployees(activeOnly = true) {
    let query = supabaseClient
        .from('FactoryEmployee')
        .select('id, name, sortOrder, isActive, factoryRoleId, factoryRole:FactoryRole(id, name)')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    let { data, error } = await query;

    if (error?.message?.match(/FactoryEmployee|FactoryRole|relationship|schema cache/i)) {
        const fallback = await supabaseClient
            .from('FactoryEmployee')
            .select('id, name, sortOrder, isActive, factoryRoleId')
            .order('sortOrder', { ascending: true })
            .order('name', { ascending: true });
        if (activeOnly && !fallback.error) {
            fallback.data = (fallback.data || []).filter(row => row.isActive !== false);
        }
        data = fallback.data;
        error = fallback.error;
    }

    if (error) {
        console.error('loadFactoryEmployees:', error);
        factoryEmployeesCache = [];
        return [];
    }

    factoryEmployeesCache = data || [];
    return factoryEmployeesCache;
}

function formatFactoryEmployeeOptionLabel(employee) {
    const name = String(employee?.name || '').trim() || '—';
    const roleName = String(employee?.factoryRole?.name || '').trim();
    if (!roleName) return name;
    return `${name} — ${roleName}`;
}

function getFactoryEmployeeOptionsHtml(selectedId = null, options = {}) {
    const { activeOnly = true, includeInactiveSelected = true } = options;
    const selected = selectedId != null ? Number(selectedId) : null;
    let rows = activeOnly
        ? (factoryEmployeesCache || []).filter(item => item.isActive !== false)
        : (factoryEmployeesCache || []).slice();

    if (includeInactiveSelected && selected) {
        const selectedRow = (factoryEmployeesCache || []).find(item => Number(item.id) === selected);
        if (selectedRow && !rows.some(item => Number(item.id) === selected)) {
            rows = [...rows, selectedRow];
        }
    }

    rows.sort((a, b) => {
        const orderDiff = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
        if (orderDiff !== 0) return orderDiff;
        return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });

    const optionsHtml = rows.map(employee => {
        const isSelected = selected != null && Number(employee.id) === selected;
        return `<option value="${employee.id}"${isSelected ? ' selected' : ''}>${escapeHtml(formatFactoryEmployeeOptionLabel(employee))}</option>`;
    }).join('');

    return `<option value="">Selecione…</option>${optionsHtml}`;
}

function resolveFactoryEmployeeRecord(record) {
    if (!record) return null;
    if (record.factoryEmployee?.id) return record.factoryEmployee;
    const id = Number(record.factoryEmployeeId);
    if (!id) return null;
    return (factoryEmployeesCache || []).find(item => Number(item.id) === id) || { id, name: record.factoryEmployee?.name };
}

function getFactoryEmployeeNameFromRecord(record) {
    const employee = resolveFactoryEmployeeRecord(record);
    if (employee?.name) return formatFactoryEmployeeOptionLabel(employee);
    if (record?.cabinetMaker?.name) return String(record.cabinetMaker.name);
    return '—';
}

window.resetFactoryEmployeesCache = resetFactoryEmployeesCache;
window.loadFactoryEmployees = loadFactoryEmployees;
window.getFactoryEmployeeOptionsHtml = getFactoryEmployeeOptionsHtml;
window.getFactoryEmployeeNameFromRecord = getFactoryEmployeeNameFromRecord;
window.formatFactoryEmployeeOptionLabel = formatFactoryEmployeeOptionLabel;
