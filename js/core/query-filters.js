function getMultiSelectFilterValues(selectId, defaultValues = []) {
    const select = document.getElementById(selectId);
    if (!select) return [...defaultValues];
    return Array.from(select.selectedOptions).map(option => option.value);
}

function resetMultiSelectFilter(selectId, defaultValues = []) {
    const select = document.getElementById(selectId);
    if (!select) return;

    Array.from(select.options).forEach(option => {
        option.selected = defaultValues.includes(option.value);
    });
}

function renderCheckboxFilterGroup(containerId, items = [], options = {}) {
    const {
        defaultCheckedValues = [],
        inputName = containerId,
        checkAllByDefault = !defaultCheckedValues.length
    } = options;

    return items.map((value, index) => {
        const checked = checkAllByDefault || defaultCheckedValues.includes(value);
        const inputId = `${containerId}-${index}`;
        return `
            <label for="${escapeHtml(inputId)}" class="fm-checkbox-filter__item flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox"
                    id="${escapeHtml(inputId)}"
                    class="fm-checkbox-filter__input h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    name="${escapeHtml(inputName)}"
                    value="${escapeHtml(value)}"
                    ${checked ? 'checked' : ''}>
                <span>${escapeHtml(value)}</span>
            </label>
        `;
    }).join('');
}

function getCheckboxFilterValues(containerId, defaultValues = []) {
    const container = document.getElementById(containerId);
    if (!container) return [...defaultValues];

    return [...container.querySelectorAll('input[type="checkbox"]:checked')]
        .map(input => input.value);
}

function resetCheckboxFilter(containerId, defaultValues = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.checked = defaultValues.includes(input.value);
    });
}

async function loadConsultantAndDesignerFilterOptions(options = {}) {
    const {
        consultantSelectId = null,
        designerSelectId = null,
        consultantEmptyLabel = 'Todos',
        designerEmptyLabel = 'Todos'
    } = options;

    const { data: consultants, error: consultantsError } = await supabaseClient
        .from('appUsers')
        .select('name')
        .eq('role', 'Consultor')
        .eq('isActive', true)
        .order('name', { ascending: true });

    if (consultantsError) throw consultantsError;

    const { data: designers, error: designersError } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .order('name', { ascending: true });

    if (designersError) throw designersError;

    if (consultantSelectId) {
        const consultantSelect = document.getElementById(consultantSelectId);
        if (consultantSelect) {
            consultantSelect.innerHTML = `<option value="">${consultantEmptyLabel}</option>`;
            consultants?.forEach(consultant => {
                consultantSelect.innerHTML += `<option value="${consultant.name}">${consultant.name}</option>`;
            });
        }
    }

    if (designerSelectId) {
        const designerSelect = document.getElementById(designerSelectId);
        if (designerSelect) {
            designerSelect.innerHTML = `<option value="">${designerEmptyLabel}</option>`;
            designers?.forEach(designer => {
                designerSelect.innerHTML += `<option value="${designer.id}">${designer.name}</option>`;
            });
        }
    }

    return {
        consultants: consultants || [],
        designers: designers || []
    };
}
