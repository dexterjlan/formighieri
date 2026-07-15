const PROJECT_CHARACTERISTIC_NONE_VALUE = 'none';

let projectCharacteristicsCache = [];
let pendingConferenceCharacteristicsConfirm = null;

async function loadProjectCharacteristics(activeOnly = true) {
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
        console.error('loadProjectCharacteristics:', error);
        projectCharacteristicsCache = [];
        return [];
    }

    projectCharacteristicsCache = data || [];
    return projectCharacteristicsCache;
}

async function fetchOrderProjectCharacteristicsMap(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return new Map();

    const { data, error } = await supabaseClient
        .from('OrderProjectCharacteristic')
        .select('id, orderProjectId, characteristicId, characteristic:ProjectCharacteristic(id, name, sortOrder, isActive)')
        .in('orderProjectId', uniqueIds);

    if (error) {
        if (error.message?.includes('OrderProjectCharacteristic') || error.message?.includes('ProjectCharacteristic')) {
            return new Map();
        }
        throw error;
    }

    const byProjectId = new Map();
    (data || []).forEach(row => {
        const projectId = Number(row.orderProjectId);
        if (!byProjectId.has(projectId)) byProjectId.set(projectId, []);
        byProjectId.get(projectId).push(row);
    });

    return byProjectId;
}

async function replaceOrderProjectCharacteristics(orderProjectId, characteristicIds = []) {
    const normalizedProjectId = Number(orderProjectId);
    const uniqueIds = [...new Set(characteristicIds.map(id => Number(id)).filter(Boolean))];

    const { error: deleteError } = await supabaseClient
        .from('OrderProjectCharacteristic')
        .delete()
        .eq('orderProjectId', normalizedProjectId);

    if (deleteError) throw deleteError;

    if (!uniqueIds.length) return;

    const rows = uniqueIds.map(characteristicId => ({
        orderProjectId: normalizedProjectId,
        characteristicId,
        createdById: currentUser?.id || null
    }));

    const { error: insertError } = await supabaseClient
        .from('OrderProjectCharacteristic')
        .insert(rows);

    if (insertError) throw insertError;
}

function getProjectCharacteristicLabelsFromRows(rows = []) {
    return rows
        .map(row => row.characteristic?.name)
        .filter(Boolean);
}

function renderOrderProjectCharacteristicsContent(rows = []) {
    const labels = getProjectCharacteristicLabelsFromRows(rows);
    if (!labels.length) {
        return '<p class="order-projects-characteristics-empty">Nenhuma característica associada.</p>';
    }

    return `
        <div class="order-projects-characteristics-chips">
            ${labels.map(label => `
                <span class="order-project-characteristic-chip">${escapeHtml(label)}</span>
            `).join('')}
        </div>
    `;
}

function renderPendenciasProjectCharacteristicsCell(rows = []) {
    const labels = getProjectCharacteristicLabelsFromRows(rows);
    if (!labels.length) {
        return '<span class="pendencias-project-characteristic-none">Nenhuma</span>';
    }

    return `
        <div class="pendencias-project-characteristics-chips">
            ${labels.map(label => `
                <span class="pendencias-project-characteristic-chip">${escapeHtml(label)}</span>
            `).join('')}
        </div>
    `;
}

function renderGestaoProjectCharacteristicsFormHtml(characteristics = [], selectedIds = []) {
    const selected = new Set(selectedIds.map(id => Number(id)).filter(Boolean));
    const hasNone = selected.size === 0;

    const optionsHtml = characteristics.map(characteristic => `
        <label class="project-characteristic-option">
            <input type="checkbox"
                class="gestao-project-characteristic-checkbox h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                data-characteristic-id="${characteristic.id}"
                ${selected.has(Number(characteristic.id)) ? 'checked' : ''}>
            <span>${escapeHtml(characteristic.name)}</span>
        </label>
    `).join('');

    const noneHtml = `
        <label class="project-characteristic-option project-characteristic-option--none">
            <input type="checkbox"
                class="gestao-project-characteristic-none h-4 w-4 rounded border-slate-300 text-slate-500 focus:ring-slate-400"
                value="${PROJECT_CHARACTERISTIC_NONE_VALUE}"
                ${hasNone ? 'checked' : ''}>
            <span>Nenhuma</span>
        </label>
    `;

    return `${optionsHtml}${noneHtml}`;
}

function bindGestaoProjectCharacteristicsFormInteractions(container) {
    if (!container) return;

    container.querySelectorAll('.gestao-project-characteristic-none').forEach(input => {
        input.addEventListener('change', () => {
            if (!input.checked) return;
            container.querySelectorAll('.gestao-project-characteristic-checkbox')
                .forEach(checkbox => { checkbox.checked = false; });
        });
    });

    container.querySelectorAll('.gestao-project-characteristic-checkbox').forEach(input => {
        input.addEventListener('change', () => {
            if (!input.checked) return;
            const noneInput = container.querySelector('.gestao-project-characteristic-none');
            if (noneInput) noneInput.checked = false;
        });
    });
}

function collectGestaoProjectCharacteristicsFormSelection() {
    const container = document.getElementById('gestao-project-characteristics-options');
    const noneChecked = Boolean(container?.querySelector('.gestao-project-characteristic-none:checked'));
    const characteristicIds = [...container?.querySelectorAll('.gestao-project-characteristic-checkbox:checked') || []]
        .map(input => Number(input.dataset.characteristicId))
        .filter(Boolean);

    return { noneChecked, characteristicIds };
}

function validateGestaoProjectCharacteristicsSelection(selection) {
    if (selection.noneChecked || selection.characteristicIds.length) return true;

    alertAppDialog('Selecione ao menos uma característica ou "Nenhuma".');
    return false;
}

function resetGestaoProjectCharacteristicsForm() {
    const optionsEl = document.getElementById('gestao-project-characteristics-options');
    const emptyEl = document.getElementById('gestao-project-characteristics-empty');
    if (optionsEl) optionsEl.innerHTML = '';
    emptyEl?.classList.add('hidden');
}

async function loadGestaoProjectCharacteristicsForm(project = {}) {
    const optionsEl = document.getElementById('gestao-project-characteristics-options');
    const emptyEl = document.getElementById('gestao-project-characteristics-empty');
    if (!optionsEl) return;

    const characteristics = await loadProjectCharacteristics(true);

    let selectedIds = project.characteristicIds;
    if (selectedIds == null && project.id) {
        const characteristicsMap = await fetchOrderProjectCharacteristicsMap([project.id]);
        const rows = characteristicsMap.get(Number(project.id)) || [];
        selectedIds = rows.map(row => Number(row.characteristicId));
    }
    selectedIds = selectedIds || [];

    if (!characteristics.length) {
        optionsEl.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        return;
    }

    emptyEl?.classList.add('hidden');
    optionsEl.innerHTML = renderGestaoProjectCharacteristicsFormHtml(characteristics, selectedIds);
    bindGestaoProjectCharacteristicsFormInteractions(optionsEl);
}

function renderProjectViewCharacteristicsHtml(allCharacteristics = [], associatedIds = []) {
    const associated = new Set(associatedIds.map(id => Number(id)).filter(Boolean));
    const hasNone = associated.size === 0;

    if (!allCharacteristics.length) {
        return `
            <div class="project-view-characteristics-list">
                <span class="project-view-characteristic-chip project-view-characteristic-chip--none is-selected">
                    Nenhum
                </span>
            </div>
        `;
    }

    const characteristicsHtml = allCharacteristics.map(characteristic => {
        const isSelected = associated.has(Number(characteristic.id));
        return `
            <span class="project-view-characteristic-chip ${isSelected ? 'is-selected' : ''}">
                ${escapeHtml(characteristic.name)}
            </span>
        `;
    }).join('');

    return `
        <div class="project-view-characteristics-list">
            <span class="project-view-characteristic-chip project-view-characteristic-chip--none ${hasNone ? 'is-selected' : ''}">
                Nenhum
            </span>
            ${characteristicsHtml}
        </div>
    `;
}

async function renderProjectViewCharacteristics(projectId) {
    const listEl = document.getElementById('project-view-characteristics-list');
    const wrapEl = document.getElementById('project-view-characteristics-wrap');
    if (!listEl || !wrapEl) return;

    const characteristics = await loadProjectCharacteristics(true);
    const characteristicsMap = await fetchOrderProjectCharacteristicsMap([projectId]);
    const rows = characteristicsMap.get(Number(projectId)) || [];
    const associatedIds = rows.map(row => Number(row.characteristicId));

    listEl.innerHTML = renderProjectViewCharacteristicsHtml(characteristics, associatedIds);
    wrapEl.classList.remove('hidden');
}

function getConferenceProjectsForCharacteristics(conference) {
    return (conference?.conferenceProjects || [])
        .map(entry => entry.orderProject || { id: entry.orderProjectId })
        .filter(project => project?.id);
}

function getProjectCharacteristicLabel(project) {
    if (!project) return 'Projeto';
    return project.projectCode
        ? `${project.projectCode} · ${project.name || 'Projeto'}`
        : (project.name || `Projeto #${project.id}`);
}

function renderProjectCharacteristicsModalContent(conference, characteristics, existingByProjectId) {
    const projects = getConferenceProjectsForCharacteristics(conference);
    if (!projects.length) {
        return '<p class="text-xs text-slate-500">Nenhum projeto na conferência.</p>';
    }

    return projects.map(project => {
        const projectId = Number(project.id);
        const existingRows = existingByProjectId.get(projectId) || [];
        const existingIds = new Set(existingRows.map(row => Number(row.characteristicId)));

        const optionsHtml = characteristics.map(characteristic => `
            <label class="project-characteristic-option">
                <input type="checkbox"
                    class="project-characteristic-checkbox h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    data-project-id="${projectId}"
                    data-characteristic-id="${characteristic.id}"
                    ${existingIds.has(Number(characteristic.id)) ? 'checked' : ''}>
                <span>${escapeHtml(characteristic.name)}</span>
            </label>
        `).join('');

        const noneHtml = `
            <label class="project-characteristic-option project-characteristic-option--none">
                <input type="checkbox"
                    class="project-characteristic-none h-4 w-4 rounded border-slate-300 text-slate-500 focus:ring-slate-400"
                    data-project-id="${projectId}"
                    value="${PROJECT_CHARACTERISTIC_NONE_VALUE}">
                <span>Nenhuma</span>
            </label>
        `;

        return `
            <section class="project-characteristics-project" data-project-id="${projectId}">
                <h4 class="project-characteristics-project__title">${escapeHtml(getProjectCharacteristicLabel(project))}</h4>
                <div class="project-characteristics-project__options">
                    ${optionsHtml}
                    ${noneHtml}
                </div>
            </section>
        `;
    }).join('');
}

function bindProjectCharacteristicsModalInteractions() {
    const container = document.getElementById('project-characteristics-modal-content');
    if (!container) return;

    container.querySelectorAll('.project-characteristic-none').forEach(input => {
        input.addEventListener('change', () => {
            if (!input.checked) return;
            const projectId = input.dataset.projectId;
            container.querySelectorAll(`.project-characteristic-checkbox[data-project-id="${projectId}"]`)
                .forEach(checkbox => { checkbox.checked = false; });
        });
    });

    container.querySelectorAll('.project-characteristic-checkbox').forEach(input => {
        input.addEventListener('change', () => {
            if (!input.checked) return;
            const projectId = input.dataset.projectId;
            const noneInput = container.querySelector(`.project-characteristic-none[data-project-id="${projectId}"]`);
            if (noneInput) noneInput.checked = false;
        });
    });
}

function collectProjectCharacteristicsSelections() {
    const container = document.getElementById('project-characteristics-modal-content');
    const projects = container?.querySelectorAll('.project-characteristics-project') || [];
    const selections = [];

    projects.forEach(section => {
        const projectId = Number(section.dataset.projectId);
        const noneChecked = Boolean(section.querySelector('.project-characteristic-none:checked'));
        const characteristicIds = [...section.querySelectorAll('.project-characteristic-checkbox:checked')]
            .map(input => Number(input.dataset.characteristicId))
            .filter(Boolean);

        selections.push({ projectId, noneChecked, characteristicIds });
    });

    return selections;
}

function validateProjectCharacteristicsSelections(selections) {
    const invalid = selections.filter(selection =>
        !selection.noneChecked && !selection.characteristicIds.length
    );

    if (!invalid.length) return true;

    alertAppDialog('Selecione ao menos uma característica ou "Nenhuma" para cada projeto.');
    return false;
}

async function saveProjectCharacteristicsSelections(selections) {
    for (const selection of selections) {
        if (selection.noneChecked) {
            await replaceOrderProjectCharacteristics(selection.projectId, []);
            continue;
        }

        await replaceOrderProjectCharacteristics(selection.projectId, selection.characteristicIds);
    }
}

async function openProjectCharacteristicsModalForConference(conference, onComplete) {
    const characteristics = await loadProjectCharacteristics(true);
    if (!characteristics.length) {
        alertAppDialog(
            'Nenhuma característica cadastrada. Cadastre em Gestão → Cadastros → Características ou execute supabase/create-project-characteristic.sql no Supabase.'
        );
        return false;
    }

    const projectIds = getConferenceProjectsForCharacteristics(conference).map(project => Number(project.id));
    const existingByProjectId = await fetchOrderProjectCharacteristicsMap(projectIds);
    const content = document.getElementById('project-characteristics-modal-content');
    const subtitle = document.getElementById('project-characteristics-modal-subtitle');

    if (subtitle) {
        subtitle.textContent = 'Informe as características de cada projeto antes de confirmar a conferência.';
    }

    if (content) {
        content.innerHTML = renderProjectCharacteristicsModalContent(conference, characteristics, existingByProjectId);
        bindProjectCharacteristicsModalInteractions();
    }

    pendingConferenceCharacteristicsConfirm = onComplete || null;
    toggleModal('project-characteristics-modal', true);
    return true;
}

async function saveProjectCharacteristicsModal(event) {
    event?.preventDefault();

    const selections = collectProjectCharacteristicsSelections();
    if (!validateProjectCharacteristicsSelections(selections)) return;

    try {
        await saveProjectCharacteristicsSelections(selections);
        toggleModal('project-characteristics-modal', false);

        const onComplete = pendingConferenceCharacteristicsConfirm;
        pendingConferenceCharacteristicsConfirm = null;

        if (typeof onComplete === 'function') {
            await onComplete();
        }
    } catch (error) {
        console.error('saveProjectCharacteristicsModal:', error);
        const sqlHint = error.message?.includes('OrderProjectCharacteristic') || error.message?.includes('ProjectCharacteristic')
            ? '\n\nExecute supabase/create-project-characteristic.sql e supabase/create-order-project-characteristic.sql no Supabase.'
            : '';
        alertAppDialog('Erro ao salvar características: ' + error.message + sqlHint);
    }
}

function bindProjectCharacteristicsEvents() {
    document.getElementById('project-characteristics-form')?.addEventListener('submit', saveProjectCharacteristicsModal);
    document.getElementById('btn-project-characteristics-cancel')?.addEventListener('click', () => {
        pendingConferenceCharacteristicsConfirm = null;
        toggleModal('project-characteristics-modal', false);
    });
}

window.openProjectCharacteristicsModalForConference = openProjectCharacteristicsModalForConference;
window.fetchOrderProjectCharacteristicsMap = fetchOrderProjectCharacteristicsMap;
window.renderProjectViewCharacteristics = renderProjectViewCharacteristics;
window.loadGestaoProjectCharacteristicsForm = loadGestaoProjectCharacteristicsForm;
window.resetGestaoProjectCharacteristicsForm = resetGestaoProjectCharacteristicsForm;
window.collectGestaoProjectCharacteristicsFormSelection = collectGestaoProjectCharacteristicsFormSelection;
window.validateGestaoProjectCharacteristicsSelection = validateGestaoProjectCharacteristicsSelection;
window.replaceOrderProjectCharacteristics = replaceOrderProjectCharacteristics;
