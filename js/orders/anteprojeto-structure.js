function getUsedProjectSectionIds() {
    return new Set(
        Array.from(document.querySelectorAll('.anteprojeto-project-section'))
            .map(section => Number(section.dataset.orderProjectId))
    );
}

async function loadAnteprojetoAvailableProjects(conference = null, editingConferenceId = null) {
    const allProjects = await resolveOrderProjectsForOrder(activeOrderId);
    const usedProjectIds = getUsedOrderProjectIds(editingConferenceId);
    const selectedMap = Object.fromEntries(
        (conference?.conferenceProjects || []).map(project => [Number(project.orderProjectId), project])
    );

    anteprojetoAvailableProjectsCache = allProjects
        .filter(project => {
            const id = Number(project.id);
            if (selectedMap[id]) return true;
            if (usedProjectIds.has(id)) return false;
            if (isComplementarOrderProject(project) || isSubstituidoOrderProject(project)) return false;
            return isProjectPlantaLevantada(project);
        })
        .map(project => ({
            orderProjectId: Number(project.id),
            label: getProjectLabel(project)
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }));

    refreshAnteprojetoAddProjectSelect();
}

function refreshAnteprojetoAddProjectSelect() {
    const select = document.getElementById('anteprojeto-add-project-select');
    if (!select) return;

    const usedInStructure = getUsedProjectSectionIds();
    const available = anteprojetoAvailableProjectsCache.filter(
        project => !usedInStructure.has(project.orderProjectId)
    );

    select.innerHTML = '<option value="">Selecione projeto...</option>';
    available.forEach(project => {
        select.innerHTML += `<option value="${project.orderProjectId}">${escapeHtml(project.label)}</option>`;
    });

    const addBtn = document.getElementById('btn-add-anteprojeto-project');
    if (addBtn) addBtn.disabled = !available.length;
}

function updateAnteprojetoProjectsEmptyState() {
    const container = document.getElementById('anteprojeto-projects-structure');
    const emptyMsg = document.getElementById('anteprojeto-projects-empty-msg');
    const hasSections = container?.querySelectorAll('.anteprojeto-project-section').length > 0;
    emptyMsg?.classList.toggle('hidden', hasSections);
}

function clearAnteprojetoStructure() {
    const container = document.getElementById('anteprojeto-projects-structure');
    if (container) container.innerHTML = '';
    updateAnteprojetoProjectsEmptyState();
    refreshAnteprojetoAddProjectSelect();
}

async function addAnteprojetoProjectSection(project = {}, options = {}) {
    const container = document.getElementById('anteprojeto-projects-structure');
    if (!container || !project.orderProjectId) return null;

    const { canEditStructure = true, canExtendStructure = true, canEditConsultor = false, readOnly = false } = options;
    const structureDisabled = readOnly || !canEditStructure;
    const extendDisabled = readOnly || !canExtendStructure;

    const section = document.createElement('div');
    section.className = 'anteprojeto-project-section border border-sky-200 rounded-xl bg-sky-50/30 overflow-hidden';
    section.dataset.orderProjectId = String(project.orderProjectId);
    section.dataset.projectLabel = project.label || 'Projeto';

    section.innerHTML = `
        <div class="flex justify-between items-center gap-2 px-4 py-2.5 bg-sky-100/50 border-b border-sky-200">
            <span class="text-xs font-bold text-slate-800">🏠 ${escapeHtml(project.label || 'Projeto')}</span>
            ${extendDisabled
                ? ''
                : '<button type="button" class="anteprojeto-remove-project-btn text-xs text-red-600 hover:text-red-800 font-medium">Remover projeto</button>'}
        </div>
        <div class="anteprojeto-modules-list px-4 py-3 space-y-3 bg-white/80"></div>
        <p class="anteprojeto-modules-empty-msg text-xs text-slate-400 text-center py-3">Nenhum módulo neste projeto.</p>
        <div class="anteprojeto-add-module-bar px-4 py-3 bg-sky-50 border-t-2 border-sky-300 ${extendDisabled ? 'hidden' : ''}">
            <p class="text-[10px] font-semibold text-sky-800 uppercase tracking-wide mb-2">+ Novo módulo</p>
            <div class="flex gap-2">
                <input type="text" class="anteprojeto-new-module-name flex-1 px-2.5 py-2 text-xs border-2 border-sky-200 rounded-lg bg-white focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200"
                    placeholder="Nome do módulo">
                <button type="button" class="anteprojeto-add-module-btn text-xs bg-sky-700 text-white px-3 py-2 rounded-lg font-semibold hover:bg-sky-800 shadow-sm whitespace-nowrap">Adicionar módulo</button>
            </div>
        </div>
    `;

    section.querySelector('.anteprojeto-add-module-btn')?.addEventListener('click', async () => {
        addModuleFromSectionInput(section, options);
    });

    section.querySelector('.anteprojeto-new-module-name')?.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addModuleFromSectionInput(section, options);
        }
    });

    section.querySelector('.anteprojeto-remove-project-btn')?.addEventListener('click', async () => {
        if (!(await confirmAppDialog('Remover este projeto e todos os módulos dele?'))) return;
        section.remove();
        updateAnteprojetoProjectsEmptyState();
        refreshAnteprojetoAddProjectSelect();
    });

    container.appendChild(section);
    (project.modules || []).forEach(module => addAnteprojetoModuleCard(section, module, options));

    updateAnteprojetoProjectsEmptyState();
    refreshAnteprojetoAddProjectSelect();
    return section;
}

function addAnteprojetoProjectFromSelect(options = {}) {
    if (!options.canExtendStructure) return;

    const select = document.getElementById('anteprojeto-add-project-select');
    const orderProjectId = Number(select?.value);
    if (!orderProjectId) {
        alertAppDialog('Selecione um projeto para adicionar.');
        return;
    }

    const project = anteprojetoAvailableProjectsCache.find(item => item.orderProjectId === orderProjectId);
    if (!project) return;

    addAnteprojetoProjectSection(project, options);
    if (select) select.value = '';
}

function groupConferenceByProjects(conference) {
    return (conference?.conferenceProjects || []).map(project => ({
        orderProjectId: Number(project.orderProjectId),
        label: project.orderProject?.name || 'Projeto',
        modules: (project.modules || [])
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.id - b.id))
            .map(module => ({
                ...module,
                observations: normalizeModuleObservations(module.observations)
            }))
    }));
}

async function renderAnteprojetoProjectsPicker(conference = null, editingConferenceId = null) {
    await loadAnteprojetoAvailableProjects(conference, editingConferenceId);
}

function collectSelectedProjectsFromDom() {
    return Array.from(document.querySelectorAll('.anteprojeto-project-section'))
        .map((section, index) => ({
            orderProjectId: Number(section.dataset.orderProjectId),
            sortOrder: index
        }));
}

function updateProjectSectionEmptyState(section) {
    const list = section.querySelector('.anteprojeto-modules-list');
    const emptyMsg = section.querySelector('.anteprojeto-modules-empty-msg');
    const hasCards = list?.querySelectorAll('.anteprojeto-module-card').length > 0;
    emptyMsg?.classList.toggle('hidden', hasCards);
}

function normalizeModuleObservations(observations) {
    if (!observations) return [];
    const list = Array.isArray(observations) ? observations : [observations];
    return list
        .map(obs => {
            if (typeof obs === 'string') {
                return {
                    id: null,
                    text: obs.trim(),
                    consultorChecked: false,
                    consultorResponse: ''
                };
            }
            return {
                id: obs.id || null,
                text: String(obs.text || obs.observation?.text || '').trim(),
                sortOrder: obs.sortOrder ?? 0,
                consultorChecked: Boolean(obs.consultorChecked),
                consultorResponse: obs.consultorResponse || ''
            };
        })
        .filter(obs => obs.text);
}

function normalizeObservationList(observations) {
    return normalizeModuleObservations(observations).map(obs => obs.text);
}

function getModuleObservationCount(card) {
    return card.querySelectorAll('.module-observation-item').length;
}

function updateModuleObservationToggleLabel(card) {
    const toggle = card.querySelector('.anteprojeto-toggle-observations');
    if (!toggle) return;
    const count = getModuleObservationCount(card);
    toggle.textContent = count
        ? `Observações (${count})`
        : 'Observações';
}

function renderObservationItem(observation = {}, options = {}) {
    const { canEditStructure = true, canEditConsultor = false, readOnly = false } = options;
    const data = typeof observation === 'string'
        ? { id: null, text: observation, consultorChecked: false, consultorResponse: '' }
        : observation;
    const canRemove = canEditStructure && !readOnly;
    const disabledConsultor = readOnly || !canEditConsultor ? 'disabled' : '';

    const item = document.createElement('li');
    item.className = 'module-observation-item border border-slate-200 rounded-lg bg-white p-2 space-y-2';
    if (data.id) item.dataset.moduleObservationId = String(data.id);

    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-2';

    const textSpan = document.createElement('span');
    textSpan.className = 'anteprojeto-observation-text text-slate-700 flex-1 whitespace-pre-wrap text-xs font-medium';
    textSpan.textContent = data.text || '';

    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.className = 'anteprojeto-module-observation';
    hidden.value = data.text || '';

    header.appendChild(textSpan);
    header.appendChild(hidden);

    if (canRemove) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'anteprojeto-remove-observation text-red-600 hover:text-red-800 px-1 shrink-0 text-xs';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', async () => {
            const card = item.closest('.anteprojeto-module-card');
            item.remove();
            if (card) {
                const count = getModuleObservationCount(card);
                card.querySelector('.anteprojeto-observations-empty-msg')?.classList.toggle('hidden', count > 0);
                updateModuleObservationToggleLabel(card);
            }
        });
        header.appendChild(removeBtn);
    }

    item.appendChild(header);

    const consultorWrap = document.createElement('div');
    consultorWrap.className = 'space-y-1.5 pt-1 border-t border-slate-100';
    consultorWrap.innerHTML = `
        <label class="flex items-center gap-2 text-[10px] text-slate-600">
            <input type="checkbox" class="anteprojeto-observation-checked h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                ${data.consultorChecked ? 'checked' : ''} ${disabledConsultor}>
            Conferido
        </label>
        <textarea rows="2" class="anteprojeto-observation-response w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600 disabled:bg-slate-50"
            placeholder="Resposta do consultor" ${disabledConsultor}></textarea>
    `;
    consultorWrap.querySelector('.anteprojeto-observation-response').value = data.consultorResponse || '';
    consultorWrap.querySelector('.anteprojeto-observation-checked')
        ?.addEventListener('change', refreshAnteprojetoModalConfirmButton);
    item.appendChild(consultorWrap);

    return item;
}

function addObservationToModule(card, text, options = {}) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
        alertAppDialog('Informe a observação.');
        return false;
    }

    const list = card.querySelector('.module-observations-list');
    if (!list) return false;

    list.appendChild(renderObservationItem({
        text: trimmed,
        consultorChecked: false,
        consultorResponse: ''
    }, options));
    card.querySelector('.anteprojeto-observations-empty-msg')?.classList.add('hidden');
    updateModuleObservationToggleLabel(card);
    return true;
}

function bindModuleCardEvents(card, options = {}) {
    const { canEditStructure = true, canExtendStructure = true, canEditConsultor = false, readOnly = false } = options;
    const structureDisabled = readOnly || !canEditStructure;
    const extendDisabled = readOnly || !canExtendStructure;

    card.querySelector('.anteprojeto-toggle-observations')?.addEventListener('click', async () => {
        const panel = card.querySelector('.module-observations-panel');
        if (!panel) return;
        panel.classList.toggle('hidden');
    });

    card.querySelector('.anteprojeto-add-observation-btn')?.addEventListener('click', async () => {
        const input = card.querySelector('.anteprojeto-new-observation');
        if (!input) return;
        if (addObservationToModule(card, input.value, options)) {
            input.value = '';
            input.focus();
        }
    });

    card.querySelector('.anteprojeto-new-observation')?.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const input = event.target;
            if (addObservationToModule(card, input.value, options)) {
                input.value = '';
            }
        }
    });

    card.querySelector('.anteprojeto-remove-module')?.addEventListener('click', async () => {
        const section = card.closest('.anteprojeto-project-section');
        card.remove();
        if (section) updateProjectSectionEmptyState(section);
    });

    if (structureDisabled) {
        card.querySelector('.anteprojeto-add-observation-bar')?.classList.add('hidden');
    }
}

function renderAnteprojetoModuleCard(module = {}, options = {}) {
    const { canEditStructure = true, canExtendStructure = true, canEditConsultor = false, readOnly = false } = options;
    const structureDisabled = readOnly || !canEditStructure;
    const extendDisabled = readOnly || !canExtendStructure;

    const card = document.createElement('div');
    card.className = 'anteprojeto-module-card border border-slate-200 rounded-lg bg-white overflow-hidden';
    if (module.id) card.dataset.moduleId = String(module.id);

    const observations = normalizeModuleObservations(module.observations);
    const hasObservations = observations.length > 0;
    const expandObservations = hasObservations || !structureDisabled;

    card.innerHTML = `
        <div class="flex justify-between items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50">
            <span class="anteprojeto-module-name-display text-xs font-semibold text-slate-800">${escapeHtml(module.name || '')}</span>
            <div class="flex gap-2 items-center">
                <button type="button" class="anteprojeto-toggle-observations text-[10px] text-sky-700 font-medium hover:text-sky-900">
                    ${hasObservations ? `Observações (${observations.length})` : 'Observações'}
                </button>
                ${extendDisabled
                    ? ''
                    : '<button type="button" class="anteprojeto-remove-module text-[10px] text-red-600 hover:text-red-800 font-medium">Remover</button>'}
            </div>
        </div>
        <div class="module-observations-panel px-3 py-2 space-y-2 bg-slate-50/40 ${expandObservations ? '' : 'hidden'}">
            <ol class="module-observations-list space-y-2 list-none m-0 p-0"></ol>
            <div class="anteprojeto-add-observation-bar flex gap-2 ${structureDisabled ? 'hidden' : ''}">
                <input type="text" class="anteprojeto-new-observation flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    list="anteprojeto-observation-options" placeholder="Nova observação">
                <button type="button" class="anteprojeto-add-observation-btn text-xs bg-white border border-sky-200 text-sky-800 px-2.5 py-1.5 rounded-lg font-medium hover:bg-sky-50 whitespace-nowrap">Adicionar</button>
            </div>
            <p class="anteprojeto-observations-empty-msg text-[10px] text-slate-400 ${hasObservations ? 'hidden' : ''}">Nenhuma observação neste módulo.</p>
        </div>
    `;

    const list = card.querySelector('.module-observations-list');
    observations.forEach(observation => {
        list?.appendChild(renderObservationItem(observation, options));
    });

    updateModuleObservationToggleLabel(card);
    bindModuleCardEvents(card, options);
    return card;
}

function addAnteprojetoModuleCard(section, module = {}, options = {}) {
    const list = section?.querySelector('.anteprojeto-modules-list');
    if (!list || !module.name) return;
    list.appendChild(renderAnteprojetoModuleCard(module, options));
    updateProjectSectionEmptyState(section);
}

function addModuleFromSectionInput(section, options = {}) {
    if (!options.canExtendStructure) return;

    const input = section.querySelector('.anteprojeto-new-module-name');
    const name = input?.value.trim() || '';
    if (!name) {
        alertAppDialog('Informe o nome do módulo.');
        return;
    }

    addAnteprojetoModuleCard(section, { name }, options);
    if (input) {
        input.value = '';
        input.focus();
    }

    const card = section.querySelector('.anteprojeto-modules-list .anteprojeto-module-card:last-child');
    card?.querySelector('.module-observations-panel')?.classList.remove('hidden');
    card?.querySelector('.anteprojeto-new-observation')?.focus();
}

function collectAnteprojetoModulesFromDom() {
    const modules = [];
    let sortOrder = 0;

    document.querySelectorAll('.anteprojeto-project-section').forEach(section => {
        const orderProjectId = Number(section.dataset.orderProjectId);
        section.querySelectorAll('.anteprojeto-module-card').forEach(card => {
            modules.push({
                id: card.dataset.moduleId ? Number(card.dataset.moduleId) : null,
                orderProjectId,
                name: card.querySelector('.anteprojeto-module-name-display')?.textContent.trim() || '',
                observations: Array.from(card.querySelectorAll('.module-observation-item'))
                    .map(item => ({
                        id: item.dataset.moduleObservationId ? Number(item.dataset.moduleObservationId) : null,
                        text: item.querySelector('.anteprojeto-observation-text')?.textContent.trim()
                            || item.querySelector('.anteprojeto-module-observation')?.value.trim()
                            || '',
                        consultorChecked: Boolean(item.querySelector('.anteprojeto-observation-checked')?.checked),
                        consultorResponse: item.querySelector('.anteprojeto-observation-response')?.value.trim() || ''
                    }))
                    .filter(obs => obs.text),
                sortOrder: sortOrder++
            });
        });
    });

    return modules;
}

function clearAnteprojetoModuleRows() {
    clearAnteprojetoStructure();
}
