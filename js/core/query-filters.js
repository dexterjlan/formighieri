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
