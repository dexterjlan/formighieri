let anteprojetoConferencesCache = [];
let anteprojetoObservationsCache = [];
let editingAnteprojetoConferenceId = null;
let pendingAnteprojetoReturnConferenceId = null;

function isAdminOrOrderConsultorForOrder(orderId) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Consultor') return false;
    const consultantName = getOrderConsultantName(orderId);
    return Boolean(consultantName && currentUser.name === consultantName);
}

function isAnteprojetoConferenceConfirmed(conference) {
    return conference?.status === 'Confirmada' || conference?.status === 'Aprovada';
}

function isAnteprojetoConferenceApproved(conference) {
    return conference?.status === 'Aprovada';
}

function canCreateAnteprojetoConference() {
    if (!activeOrderId) return false;
    return canCreateAsAdminOrConferente();
}

function canEditAnteprojetoConference(conference) {
    if (conference && isAnteprojetoConferenceConfirmed(conference)) return false;
    if (!conference) {
        return canCreateAnteprojetoConference();
    }
    if (currentUser?.role === 'Admin') return true;
    return currentUser?.role === 'Projetista' && conference.designerId === currentUser.id;
}

function canExtendAnteprojetoConferenceStructure(conference) {
    return !conference;
}

function canEditAnteprojetoConsultorFields(conference) {
    if (!conference || isAnteprojetoConferenceConfirmed(conference)) return false;
    return isAdminOrOrderConsultorForOrder(conference.orderId || activeOrderId);
}

function canConfirmAnteprojetoConference(conference) {
    if (!conference || isAnteprojetoConferenceConfirmed(conference)) return false;
    return isAdminOrOrderConsultorForOrder(conference.orderId || activeOrderId);
}

function canApproveAnteprojetoConference(conference) {
    if (!conference || conference.status !== 'Confirmada') return false;
    if (!isGestorComercial()) return false;
    return true;
}

function canReturnAnteprojetoConferenceToConsultor(conference) {
    return canApproveAnteprojetoConference(conference);
}

function getConferenceModules(conference) {
    return (conference?.conferenceProjects || []).flatMap(project => project.modules || []);
}

function getConferenceModuleObservations(conference) {
    return getConferenceModules(conference).flatMap(module => {
        const raw = module.observations;
        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
        return list.map(obs => ({
            ...obs,
            moduleId: module.id,
            moduleName: module.name
        }));
    });
}

function normalizeOrderId(orderId) {
    return orderId == null ? null : Number(orderId);
}

function getCachedOrderProjects(orderId) {
    const normalizedId = normalizeOrderId(orderId);
    if (normalizedId == null || typeof orderProjectsCache === 'undefined') return [];
    return orderProjectsCache.filter(project => Number(project.orderId) === normalizedId);
}

async function resolveOrderProjectsForOrder(orderId) {
    const normalizedId = normalizeOrderId(orderId);
    if (normalizedId == null) return [];

    let result = await supabaseClient
        .from('OrderProject')
        .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)')
        .eq('orderId', normalizedId)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('OrderProjectStatus') || result.error?.message?.includes('statusId')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name)')
            .eq('orderId', normalizedId)
            .order('name', { ascending: true });
    }

    if (result.error?.message?.includes('environmentType')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*')
            .eq('orderId', normalizedId)
            .order('name', { ascending: true });
    }

    if (result.error) {
        console.error('resolveOrderProjectsForOrder:', result.error);
        return [];
    }

    return enrichAnteprojetoProjectsWithStatus(result.data || []);
}

async function getConferenciaEnviadaStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Conferência Enviada')
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Conferência Enviada')
        .maybeSingle();

    return fallback?.id || null;
}

async function applyConferenciaEnviadaStatusToProjects(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getConferenciaEnviadaStatusId();
    if (!statusId) {
        throw new Error('Status "Conferência Enviada" não encontrado. Cadastre em Gestão → Status de Projeto.');
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;
}

async function getConferenciaRealizadaStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Conferência Realizada')
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Conferência Realizada')
        .maybeSingle();

    return fallback?.id || null;
}

function getConferenceOrderProjectIds(conference) {
    return [...new Set(
        (conference?.conferenceProjects || [])
            .map(project => Number(project.orderProjectId))
            .filter(Boolean)
    )];
}

async function applyConferenciaRealizadaStatusToProjects(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getConferenciaRealizadaStatusId();
    if (!statusId) {
        throw new Error('Status "Conferência Realizada" não encontrado. Cadastre em Gestão → Status de Projeto.');
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;
}

async function getAguardandoProjetoTecnicoStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Aguardando Projeto Técnico')
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Aguardando Projeto Técnico')
        .maybeSingle();

    return fallback?.id || null;
}

async function applyAguardandoProjetoTecnicoStatusToProjects(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getAguardandoProjetoTecnicoStatusId();
    if (!statusId) {
        throw new Error('Status "Aguardando Projeto Técnico" não encontrado. Cadastre em Gestão → Status de Projeto.');
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;
}

function getUsedOrderProjectIds(editingConferenceId = null) {
    const used = new Set();
    anteprojetoConferencesCache.forEach(conference => {
        if (conference.id === editingConferenceId) return;
        (conference.conferenceProjects || []).forEach(project => {
            if (project.orderProjectId) used.add(Number(project.orderProjectId));
        });
    });
    return used;
}

async function loadAnteprojetoObservations() {
    const { data, error } = await supabaseClient
        .from('AnteprojetoObservation')
        .select('id, text')
        .order('text', { ascending: true });

    if (error) {
        console.error('loadAnteprojetoObservations:', error);
        anteprojetoObservationsCache = [];
        return [];
    }

    anteprojetoObservationsCache = data || [];
    return anteprojetoObservationsCache;
}

function refreshAnteprojetoObservationDatalist() {
    const datalist = document.getElementById('anteprojeto-observation-options');
    if (!datalist) return;
    datalist.innerHTML = anteprojetoObservationsCache
        .map(obs => `<option value="${escapeHtml(obs.text)}"></option>`)
        .join('');
}

async function upsertAnteprojetoObservation(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;

    const existing = anteprojetoObservationsCache.find(
        obs => obs.text.localeCompare(trimmed, 'pt-BR', { sensitivity: 'base' }) === 0
    );
    if (existing) return existing.id;

    const { data, error } = await supabaseClient
        .from('AnteprojetoObservation')
        .insert({ text: trimmed, createdById: currentUser.id })
        .select('id, text')
        .single();

    if (error?.code === '23505') {
        const { data: found } = await supabaseClient
            .from('AnteprojetoObservation')
            .select('id, text')
            .eq('text', trimmed)
            .maybeSingle();
        if (found) {
            anteprojetoObservationsCache.push(found);
            return found.id;
        }
    }

    if (error) {
        console.error('upsertAnteprojetoObservation:', error);
        return null;
    }

    anteprojetoObservationsCache.push(data);
    anteprojetoObservationsCache.sort((a, b) =>
        a.text.localeCompare(b.text, 'pt-BR', { sensitivity: 'base' })
    );
    refreshAnteprojetoObservationDatalist();
    return data.id;
}

let anteprojetoAvailableProjectsCache = [];

function getConferenceSketchUpPath(conference) {
    if (!conference) return '';
    if (conference.sketchUpPath) return conference.sketchUpPath;
    const legacy = (conference.conferenceProjects || []).find(project => project.sketchUpPath);
    return legacy?.sketchUpPath || '';
}

function getProjectLabel(project) {
    return project.name || 'Projeto';
}

function getProjectStatusName(project) {
    return project?.projectStatus?.name || '';
}

function isProjectPlantaLevantada(project) {
    return getProjectStatusName(project) === 'Planta Levantada';
}

async function enrichAnteprojetoProjectsWithStatus(projects) {
    if (!projects.length) return projects;

    const needsEnrich = projects.some(project => project.statusId && !project.projectStatus);
    if (!needsEnrich) return projects;

    const statusIds = [...new Set(projects.map(project => project.statusId).filter(Boolean))];
    if (!statusIds.length) return projects;

    const { data: statuses, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name')
        .in('id', statusIds);

    if (error) {
        console.error('enrichAnteprojetoProjectsWithStatus:', error);
        return projects;
    }

    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
    return projects.map(project => ({
        ...project,
        projectStatus: project.projectStatus || statusById[project.statusId] || null
    }));
}

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

async function populateAnteprojetoDesignerSelect(selectedId = null, locked = false) {
    const select = document.getElementById('anteprojeto-designer');
    const wrap = document.getElementById('anteprojeto-designer-wrap');
    if (!select || !wrap) return;

    if (currentUser?.role === 'Projetista') {
        select.innerHTML = `<option value="${currentUser.id}">${escapeHtml(currentUser.name)}</option>`;
        select.value = String(currentUser.id);
        select.disabled = true;
        wrap.classList.remove('hidden');
        return;
    }

    let result = await supabaseClient
        .from('appUsers')
        .select('id, name, conferente')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .eq('conferente', true)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('conferente')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .eq('role', 'Projetista')
            .eq('isActive', true)
            .order('name', { ascending: true });
    }

    let designers = (result.data || []).filter(user => user.conferente !== false);

    if (selectedId && !designers.some(user => Number(user.id) === Number(selectedId))) {
        const { data: selectedDesigner } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .eq('id', selectedId)
            .maybeSingle();

        if (selectedDesigner) {
            designers.push(selectedDesigner);
            designers.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
        }
    }

    select.disabled = locked;
    select.innerHTML = '<option value="">Selecione...</option>';

    if (result.error || !designers.length) {
        select.innerHTML += '<option value="" disabled>Nenhum projetista conferente cadastrado</option>';
        wrap.classList.remove('hidden');
        return;
    }

    designers.forEach(d => {
        select.innerHTML += `<option value="${d.id}">${escapeHtml(d.name)}</option>`;
    });

    if (selectedId) select.value = String(selectedId);
    wrap.classList.toggle('hidden', currentUser?.role === 'Consultor');
}

function setAnteprojetoModalFields(conference, options = {}) {
    const {
        readOnly = false,
        canEditStructure = false,
        canExtendStructure = false,
        canEditConsultor = false
    } = options;
    const structureDisabled = readOnly || !canEditStructure;
    const extendDisabled = readOnly || !canExtendStructure;

    const sketchUpEl = document.getElementById('anteprojeto-sketchup-path');
    if (sketchUpEl) sketchUpEl.disabled = structureDisabled;

    const conferenceObservationEl = document.getElementById('anteprojeto-conference-observation');
    if (conferenceObservationEl) conferenceObservationEl.disabled = structureDisabled;

    const designerEl = document.getElementById('anteprojeto-designer');
    if (designerEl) {
        const lockDesigner = currentUser?.role === 'Projetista' || Boolean(conference);
        designerEl.disabled = structureDisabled || lockDesigner;
    }

    const addProjectSelect = document.getElementById('anteprojeto-add-project-select');
    const addProjectBtn = document.getElementById('btn-add-anteprojeto-project');
    if (addProjectSelect) addProjectSelect.disabled = extendDisabled;
    if (addProjectBtn) addProjectBtn.classList.toggle('hidden', extendDisabled);
    addProjectSelect?.closest('.flex')?.classList.toggle('hidden', extendDisabled);

    document.querySelectorAll('.anteprojeto-add-module-bar, .anteprojeto-remove-project-btn, .anteprojeto-remove-module')
        .forEach(el => el.classList.toggle('hidden', extendDisabled));

    if (structureDisabled) {
        document.querySelectorAll('.anteprojeto-add-observation-bar').forEach(el => el.classList.add('hidden'));
    }

    const consultorDisabled = readOnly || !canEditConsultor;
    document.querySelectorAll('.anteprojeto-observation-checked, .anteprojeto-observation-response')
        .forEach(el => { el.disabled = consultorDisabled; });

    const submitBtn = document.getElementById('anteprojeto-form-submit');
    if (submitBtn) {
        submitBtn.classList.toggle('hidden', readOnly || (!canEditStructure && !canEditConsultor));
    }
}

function areAllAnteprojetoModalObservationsChecked() {
    const checkboxes = document.querySelectorAll(
        '#anteprojeto-projects-structure .anteprojeto-observation-checked:not(:disabled)'
    );
    if (!checkboxes.length) return false;
    return [...checkboxes].every(checkbox => checkbox.checked);
}

function refreshAnteprojetoModalConfirmButton() {
    const btn = document.getElementById('btn-anteprojeto-modal-confirm');
    if (!btn) return;

    const allChecked = areAllAnteprojetoModalObservationsChecked();
    btn.disabled = !allChecked;
    btn.classList.toggle('bg-emerald-700', allChecked);
    btn.classList.toggle('text-white', allChecked);
    btn.classList.toggle('hover:bg-emerald-800', allChecked);
    btn.classList.toggle('bg-slate-200', !allChecked);
    btn.classList.toggle('text-slate-500', !allChecked);
    btn.classList.toggle('cursor-not-allowed', !allChecked);
}

function updateAnteprojetoModalConfirmControls(conference) {
    const wrap = document.getElementById('anteprojeto-modal-confirm-wrap');
    if (!wrap) return;

    const show = Boolean(conference && canConfirmAnteprojetoConference(conference));
    wrap.classList.toggle('hidden', !show);
    if (show) {
        refreshAnteprojetoModalConfirmButton();
    }
}

function updateAnteprojetoModalApproveControls(conference) {
    const wrap = document.getElementById('anteprojeto-modal-approve-wrap');
    const approveBtn = document.getElementById('btn-anteprojeto-modal-approve');
    const returnBtn = document.getElementById('btn-anteprojeto-modal-return');
    if (!wrap || !approveBtn || !returnBtn) return;

    const canAct = Boolean(conference && canApproveAnteprojetoConference(conference));
    wrap.classList.toggle('hidden', !canAct);
    approveBtn.disabled = !canAct;
    returnBtn.disabled = !canAct;
}

const ANTEPROJETO_CONFERENCE_SELECT = `
    *,
    conferenceProjects:AnteprojetoConferenceProject(
        *,
        orderProject:OrderProject(id, name, statusId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)),
        modules:AnteprojetoModule(
            *,
            observations:AnteprojetoModuleObservation(
                *,
                observation:AnteprojetoObservation(id, text)
            )
        )
    )
`;

const ANTEPROJETO_CONFERENCE_SELECT_FALLBACK = `
    *,
    conferenceProjects:AnteprojetoConferenceProject(
        *,
        modules:AnteprojetoModule(*)
    )
`;

async function fetchAnteprojetoConferenceById(conferenceId) {
    const normalizedId = Number(conferenceId);
    if (!normalizedId) return null;

    let result = await supabaseClient
        .from('AnteprojetoConference')
        .select(ANTEPROJETO_CONFERENCE_SELECT)
        .eq('id', normalizedId)
        .maybeSingle();

    if (result.error?.message?.includes('AnteprojetoConferenceProject')) {
        result = await supabaseClient
            .from('AnteprojetoConference')
            .select(ANTEPROJETO_CONFERENCE_SELECT_FALLBACK)
            .eq('id', normalizedId)
            .maybeSingle();
    }

    if (result.error || !result.data) {
        console.error('fetchAnteprojetoConferenceById:', result.error);
        return null;
    }

    let conferences = await attachModuleObservationsToConferences([result.data]);
    conferences = await enrichAnteprojetoConferences(conferences, result.data.orderId);
    return conferences[0] || null;
}

async function openAnteprojetoConferenceFromPendencias(conferenceId) {
    const conference = await fetchAnteprojetoConferenceById(conferenceId);
    if (!conference) {
        alertAppDialog('Conferência não encontrada.');
        return;
    }

    activeOrderId = conference.orderId;
    const cacheIndex = anteprojetoConferencesCache.findIndex(item => Number(item.id) === Number(conferenceId));
    if (cacheIndex >= 0) {
        anteprojetoConferencesCache[cacheIndex] = conference;
    } else {
        anteprojetoConferencesCache = [...anteprojetoConferencesCache, conference];
    }

    await openAnteprojetoModal(conference.id);
    updateAnteprojetoModalConfirmControls(conference);
    updateAnteprojetoModalApproveControls(conference);
}

window.openAnteprojetoConferenceFromPendencias = openAnteprojetoConferenceFromPendencias;

async function updateAnteprojetoModalOrderContext(orderId) {
    const orderLineEl = document.getElementById('anteprojeto-modal-order-line');
    const consultantEl = document.getElementById('anteprojeto-modal-consultant-name');
    if (!orderLineEl || !consultantEl) return;

    let orderCode = '—';
    let clientName = '—';
    let consultantName = '—';

    if (orderId) {
        const cached = typeof ordersCache !== 'undefined'
            ? ordersCache.find(order => Number(order.id) === Number(orderId))
            : null;

        if (cached) {
            orderCode = cached.orderCode || '—';
            clientName = cached.clientName || '—';
            consultantName = cached.consultantName || '—';
        } else {
            const { data, error } = await supabaseClient
                .from('salesOrders')
                .select('orderCode, clientName, consultantName')
                .eq('id', orderId)
                .maybeSingle();

            if (!error && data) {
                orderCode = data.orderCode || '—';
                clientName = data.clientName || '—';
                consultantName = data.consultantName || '—';
            }
        }
    }

    orderLineEl.textContent = orderCode !== '—' || clientName !== '—'
        ? `${orderCode} - ${clientName}`
        : '—';
    consultantEl.textContent = consultantName;
}

async function openAnteprojetoModal(conferenceId = null) {
    if (!activeOrderId && !conferenceId) {
        alertAppDialog('Selecione um pedido primeiro.');
        return;
    }

    if (!conferenceId && !canCreateAnteprojetoConference()) {
        alertAppDialog('Somente Admin ou usuários marcados como Conferente podem criar conferências de anteprojeto.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    editingAnteprojetoConferenceId = conferenceId;
    const conference = conferenceId
        ? anteprojetoConferencesCache.find(c => c.id === conferenceId)
        : null;

    const readOnly = isAnteprojetoConferenceConfirmed(conference);
    const canEditStructure = canEditAnteprojetoConference(conference);
    const canExtendStructure = canExtendAnteprojetoConferenceStructure(conference);
    const canEditConsultor = canEditAnteprojetoConsultorFields(conference);

    document.getElementById('anteprojeto-form').reset();
    clearAnteprojetoModuleRows();

    await loadAnteprojetoObservations();
    await renderAnteprojetoProjectsPicker(conference, conferenceId || null);
    await populateAnteprojetoDesignerSelect(conference?.designerId || null, Boolean(conference));
    refreshAnteprojetoObservationDatalist();

    const sketchUpEl = document.getElementById('anteprojeto-sketchup-path');
    if (sketchUpEl) {
        sketchUpEl.value = getConferenceSketchUpPath(conference);
    }

    const conferenceObservationEl = document.getElementById('anteprojeto-conference-observation');
    if (conferenceObservationEl) {
        conferenceObservationEl.value = conference?.conferenceObservation || '';
    }

    const title = document.getElementById('anteprojeto-modal-title');
    const submitBtn = document.getElementById('anteprojeto-form-submit');

    if (conference) {
        title.textContent = readOnly ? 'Conferência de Anteprojeto' : 'Editar Conferência';
        const modalOptions = { canEditStructure, canExtendStructure, canEditConsultor, readOnly };
        groupConferenceByProjects(conference).forEach(project => {
            addAnteprojetoProjectSection(project, modalOptions);
        });
    } else {
        title.textContent = 'Nova Conferência de Anteprojeto';
    }

    setAnteprojetoModalFields(conference, { readOnly, canEditStructure, canExtendStructure, canEditConsultor });
    submitBtn.textContent = conference ? 'Salvar Conferência' : 'Criar Conferência';
    updateAnteprojetoModalConfirmControls(conference);
    updateAnteprojetoModalApproveControls(conference);
    await updateAnteprojetoModalOrderContext(conference?.orderId || activeOrderId);
    await refreshAnteprojetoModalHistory(conferenceId);
    toggleModal('anteprojeto-modal', true);
}

window.openAnteprojetoModal = openAnteprojetoModal;

function closeAnteprojetoModal() {
    setAnteprojetoModalLoading(false);
    editingAnteprojetoConferenceId = null;
    updateAnteprojetoModalConfirmControls(null);
    updateAnteprojetoModalApproveControls(null);
    refreshAnteprojetoModalHistory(null);
    toggleModal('anteprojeto-modal', false);
}

window.closeAnteprojetoModal = closeAnteprojetoModal;

async function refreshAnteprojetoRelatedViews() {
    if (typeof loadPendenciasContent === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
        await loadPendenciasContent();
    }
}

function isAnteprojetoModalVisible() {
    const modal = document.getElementById('anteprojeto-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

function isPendenciasViewVisible() {
    const view = document.getElementById('pendencias-view');
    return Boolean(view && !view.classList.contains('hidden'));
}

function isAnteprojetoReturnModalVisible() {
    const modal = document.getElementById('anteprojeto-return-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

function setAnteprojetoReturnModalLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('anteprojeto-return-modal-loading');
    const messageEl = document.getElementById('anteprojeto-return-modal-loading-msg');
    const spinner = document.getElementById('anteprojeto-return-modal-loading-spinner');
    const successIcon = document.getElementById('anteprojeto-return-modal-loading-success');
    const errorIcon = document.getElementById('anteprojeto-return-modal-loading-error');
    const show = Boolean(active);

    overlay?.classList.toggle('hidden', !show);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.toggle('text-red-600', status === 'error');
        messageEl.classList.toggle('text-emerald-700', status === 'success');
        messageEl.classList.toggle('text-slate-700', status === 'loading');
    }

    spinner?.classList.toggle('hidden', status !== 'loading');
    successIcon?.classList.toggle('hidden', status !== 'success');
    errorIcon?.classList.toggle('hidden', status !== 'error');

    ['btn-anteprojeto-return-modal-submit', 'btn-anteprojeto-return-modal-cancel'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (show) {
            el.disabled = true;
        } else {
            el.disabled = false;
        }
    });

    const observationEl = document.getElementById('anteprojeto-return-modal-observation');
    if (observationEl) {
        if (show) {
            observationEl.dataset.returnModalLoadingDisabled = '1';
            observationEl.disabled = true;
        } else if (observationEl.dataset.returnModalLoadingDisabled === '1') {
            delete observationEl.dataset.returnModalLoadingDisabled;
            observationEl.disabled = false;
        }
    }
}

function isAnteprojetoTabVisible() {
    const panel = document.getElementById('order-tab-panel-anteprojeto');
    return Boolean(panel && !panel.classList.contains('hidden'));
}

function setAnteprojetoTabActionLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('anteprojeto-tab-action-loading');
    const messageEl = document.getElementById('anteprojeto-tab-action-loading-msg');
    const spinner = document.getElementById('anteprojeto-tab-action-loading-spinner');
    const successIcon = document.getElementById('anteprojeto-tab-action-loading-success');
    const errorIcon = document.getElementById('anteprojeto-tab-action-loading-error');
    const show = Boolean(active);

    overlay?.classList.toggle('hidden', !show);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.toggle('text-red-600', status === 'error');
        messageEl.classList.toggle('text-emerald-700', status === 'success');
        messageEl.classList.toggle('text-slate-700', status === 'loading');
    }

    spinner?.classList.toggle('hidden', status !== 'loading');
    successIcon?.classList.toggle('hidden', status !== 'success');
    errorIcon?.classList.toggle('hidden', status !== 'error');
}

function setAnteprojetoConferenceActionLoading(active, message = 'Processando...', status = 'loading') {
    if (isAnteprojetoReturnModalVisible()) {
        setAnteprojetoReturnModalLoading(active, message, status);
        return;
    }

    if (isAnteprojetoModalVisible()) {
        setAnteprojetoModalLoading(active, message, status);
        return;
    }

    if (isPendenciasViewVisible() && typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(active, message, status);
        return;
    }

    if (isAnteprojetoTabVisible()) {
        setAnteprojetoTabActionLoading(active, message, status);
    }
}

async function refreshViewsAfterAnteprojetoConfirmation() {
    if (typeof loadAnteprojetoConferences === 'function' && activeOrderId) {
        await loadAnteprojetoConferences(activeOrderId);
    }
    if (typeof loadOrderProjects === 'function' && activeOrderId) {
        await loadOrderProjects(activeOrderId);
    }

    if (!isPendenciasViewVisible()) return;

    if (typeof pendenciasActiveSection !== 'undefined'
        && typeof pendenciasActiveItem !== 'undefined'
        && pendenciasActiveSection === 'consultor'
        && pendenciasActiveItem === 'conferencia'
        && typeof loadPendenciasConsultorConferencia === 'function') {
        await loadPendenciasConsultorConferencia();
        return;
    }

    await refreshAnteprojetoRelatedViews();
}

async function refreshViewsAfterAnteprojetoApproval() {
    if (typeof loadAnteprojetoConferences === 'function' && activeOrderId) {
        await loadAnteprojetoConferences(activeOrderId);
    }
    if (typeof loadOrderProjects === 'function' && activeOrderId) {
        await loadOrderProjects(activeOrderId);
    }

    if (!isPendenciasViewVisible()) return;

    if (typeof pendenciasActiveSection !== 'undefined'
        && typeof pendenciasActiveItem !== 'undefined'
        && pendenciasActiveSection === 'gestor-comercial'
        && pendenciasActiveItem === 'aprovar-conferencia'
        && typeof loadPendenciasAprovarConferencia === 'function') {
        await loadPendenciasAprovarConferencia();
        return;
    }

    await refreshAnteprojetoRelatedViews();
}

async function refreshViewsAfterAnteprojetoReturnToConsultor() {
    if (typeof loadAnteprojetoConferences === 'function' && activeOrderId) {
        await loadAnteprojetoConferences(activeOrderId);
    }
    if (typeof loadOrderProjects === 'function' && activeOrderId) {
        await loadOrderProjects(activeOrderId);
    }

    if (!isPendenciasViewVisible()) return;

    if (typeof pendenciasActiveSection !== 'undefined'
        && typeof pendenciasActiveItem !== 'undefined'
        && pendenciasActiveSection === 'gestor-comercial'
        && pendenciasActiveItem === 'aprovar-conferencia'
        && typeof loadPendenciasAprovarConferencia === 'function') {
        await loadPendenciasAprovarConferencia();
        return;
    }

    if (typeof pendenciasActiveSection !== 'undefined'
        && typeof pendenciasActiveItem !== 'undefined'
        && pendenciasActiveSection === 'consultor'
        && pendenciasActiveItem === 'conferencia'
        && typeof loadPendenciasConsultorConferencia === 'function') {
        await loadPendenciasConsultorConferencia();
        return;
    }

    await refreshAnteprojetoRelatedViews();
}

function formatAnteprojetoConferenceHistoryDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderAnteprojetoConferenceHistoryEntry(entry) {
    const authorName = entry.createdBy?.name || '—';
    const createdAt = formatAnteprojetoConferenceHistoryDate(entry.createdAt);
    return `
        <div class="border border-amber-100 rounded-lg px-3 py-2 bg-amber-50/60 text-left">
            <div class="text-[10px] text-amber-800 font-semibold mb-1">${escapeHtml(createdAt)} · ${escapeHtml(authorName)}</div>
            <div class="text-xs text-slate-700 whitespace-pre-wrap">${escapeHtml(entry.observation || '—')}</div>
        </div>
    `;
}

async function fetchAnteprojetoConferenceHistory(conferenceId) {
    const normalizedId = Number(conferenceId);
    if (!normalizedId) return [];

    const { data, error } = await supabaseClient
        .from('AnteprojetoConferenceHistory')
        .select('id, conferenceId, action, observation, createdAt, createdById, createdBy:appUsers(id, name)')
        .eq('conferenceId', normalizedId)
        .order('createdAt', { ascending: false });

    if (error?.message?.includes('AnteprojetoConferenceHistory')) {
        return [];
    }

    if (error) {
        console.error('fetchAnteprojetoConferenceHistory:', error);
        return [];
    }

    return data || [];
}

async function refreshAnteprojetoModalHistory(conferenceId) {
    const wrap = document.getElementById('anteprojeto-modal-history-wrap');
    const list = document.getElementById('anteprojeto-modal-history-list');
    if (!wrap || !list) return;

    if (!conferenceId) {
        wrap.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    const history = await fetchAnteprojetoConferenceHistory(conferenceId);
    if (!history.length) {
        wrap.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    wrap.classList.remove('hidden');
    list.innerHTML = history.map(renderAnteprojetoConferenceHistoryEntry).join('');
}

function closeAnteprojetoReturnModal() {
    setAnteprojetoReturnModalLoading(false);
    pendingAnteprojetoReturnConferenceId = null;
    const observationEl = document.getElementById('anteprojeto-return-modal-observation');
    if (observationEl) observationEl.value = '';
    toggleModal('anteprojeto-return-modal', false);
}

async function showAnteprojetoReturnObservationForm(conferenceId) {
    const normalizedId = Number(conferenceId);
    if (!normalizedId) return;

    let conference = anteprojetoConferencesCache.find(item => Number(item.id) === normalizedId);
    if (!conference && typeof fetchAnteprojetoConferenceById === 'function') {
        conference = await fetchAnteprojetoConferenceById(normalizedId);
        if (conference) {
            const cacheIndex = anteprojetoConferencesCache.findIndex(item => Number(item.id) === normalizedId);
            if (cacheIndex >= 0) {
                anteprojetoConferencesCache[cacheIndex] = conference;
            } else {
                anteprojetoConferencesCache = [...anteprojetoConferencesCache, conference];
            }
        }
    }

    if (!conference) {
        alertAppDialog('Conferência não encontrada.');
        return;
    }

    if (!canReturnAnteprojetoConferenceToConsultor(conference)) {
        alertAppDialog('Somente o gestor comercial pode devolver conferências confirmadas ao consultor.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    activeOrderId = conference.orderId || activeOrderId;
    pendingAnteprojetoReturnConferenceId = normalizedId;

    const contextEl = document.getElementById('anteprojeto-return-modal-context');
    if (contextEl) {
        let orderCode = '—';
        let clientName = '—';
        const cached = typeof ordersCache !== 'undefined'
            ? ordersCache.find(order => Number(order.id) === Number(conference.orderId))
            : null;

        if (cached) {
            orderCode = cached.orderCode || '—';
            clientName = cached.clientName || '—';
        } else if (conference.orderId) {
            const { data } = await supabaseClient
                .from('salesOrders')
                .select('orderCode, clientName')
                .eq('id', conference.orderId)
                .maybeSingle();
            if (data) {
                orderCode = data.orderCode || '—';
                clientName = data.clientName || '—';
            }
        }

        contextEl.textContent = `Pedido ${orderCode} — ${clientName}. Informe as observações para o consultor revisar a conferência.`;
    }

    const observationEl = document.getElementById('anteprojeto-return-modal-observation');
    if (observationEl) observationEl.value = '';

    toggleModal('anteprojeto-return-modal', true);
    observationEl?.focus();
}

async function returnAnteprojetoConferenceToConsultor(conferenceId, observation) {
    const normalizedId = Number(conferenceId);
    const trimmedObservation = String(observation || '').trim();
    if (!normalizedId) return;
    if (!trimmedObservation) {
        alertAppDialog('Informe as observações para devolver a conferência ao consultor.');
        return;
    }

    let conference = anteprojetoConferencesCache.find(item => Number(item.id) === normalizedId);
    if (!conference) {
        conference = await fetchAnteprojetoConferenceById(normalizedId);
        if (conference) {
            anteprojetoConferencesCache = [...anteprojetoConferencesCache, conference];
        }
    }

    if (!conference) {
        alertAppDialog('Conferência não encontrada.');
        return;
    }

    if (!canReturnAnteprojetoConferenceToConsultor(conference)) {
        alertAppDialog('Somente o gestor comercial pode devolver conferências confirmadas ao consultor.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    activeOrderId = conference.orderId || activeOrderId;

    try {
        setAnteprojetoConferenceActionLoading(true, 'Registrando observações da devolução...');

        const { error: historyError } = await supabaseClient
            .from('AnteprojetoConferenceHistory')
            .insert({
                conferenceId: normalizedId,
                action: 'voltar_consultor',
                observation: trimmedObservation,
                createdById: currentUser.id
            });

        if (historyError) {
            if (historyError.message?.includes('AnteprojetoConferenceHistory')) {
                throw new Error('Tabela de histórico não encontrada. Execute supabase/create-anteprojeto-conference-observation-history.sql no Supabase.');
            }
            throw historyError;
        }

        const now = new Date().toISOString();
        const { error: conferenceError } = await supabaseClient
            .from('AnteprojetoConference')
            .update({
                status: 'Em andamento',
                confirmedAt: null,
                confirmedById: null,
                updatedAt: now,
                updatedById: currentUser.id
            })
            .eq('id', normalizedId);

        if (conferenceError) throw conferenceError;

        setAnteprojetoConferenceActionLoading(true, 'Atualizando status dos projetos...');
        await applyConferenciaEnviadaStatusToProjects(getConferenceOrderProjectIds(conference));

        if (typeof notifyConferenciaDevolvidaConsultorEmail === 'function') {
            setAnteprojetoConferenceActionLoading(true, 'Enviando e-mail de notificação...');
            await notifyConferenciaDevolvidaConsultorEmail({
                orderId: conference.orderId,
                orderProjectIds: getConferenceOrderProjectIds(conference),
                observation: trimmedObservation
            });
        }

        setAnteprojetoConferenceActionLoading(true, 'Atualizando telas...');
        await refreshViewsAfterAnteprojetoReturnToConsultor();

        setAnteprojetoConferenceActionLoading(true, 'Conferência devolvida ao consultor!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));

        closeAnteprojetoReturnModal();
        if (isAnteprojetoModalVisible()) {
            closeAnteprojetoModal();
        }

        setAnteprojetoConferenceActionLoading(false);
    } catch (error) {
        setAnteprojetoConferenceActionLoading(true, `Erro ao devolver conferência: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setAnteprojetoConferenceActionLoading(false);
    }
}

async function submitAnteprojetoReturnModal() {
    const conferenceId = pendingAnteprojetoReturnConferenceId;
    if (!conferenceId) return;

    const observationEl = document.getElementById('anteprojeto-return-modal-observation');
    const trimmedObservation = String(observationEl?.value || '').trim();
    if (!trimmedObservation) {
        alertAppDialog('Informe as observações para devolver a conferência ao consultor.');
        return;
    }

    setAnteprojetoReturnModalLoading(true, 'Iniciando devolução ao consultor...');
    await returnAnteprojetoConferenceToConsultor(conferenceId, trimmedObservation);
}

function setAnteprojetoModalLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('anteprojeto-modal-loading');
    const messageEl = document.getElementById('anteprojeto-modal-loading-msg');
    const spinner = document.getElementById('anteprojeto-modal-loading-spinner');
    const successIcon = document.getElementById('anteprojeto-modal-loading-success');
    const errorIcon = document.getElementById('anteprojeto-modal-loading-error');
    const show = Boolean(active);

    overlay?.classList.toggle('hidden', !show);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.toggle('text-red-600', status === 'error');
        messageEl.classList.toggle('text-emerald-700', status === 'success');
        messageEl.classList.toggle('text-slate-700', status === 'loading');
    }

    spinner?.classList.toggle('hidden', status !== 'loading');
    successIcon?.classList.toggle('hidden', status !== 'success');
    errorIcon?.classList.toggle('hidden', status !== 'error');

    [
        'anteprojeto-form-submit',
        'btn-add-anteprojeto-project',
        'btn-anteprojeto-modal-confirm',
        'btn-anteprojeto-modal-approve',
        'btn-anteprojeto-modal-return'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el && show) el.disabled = true;
    });

    const closeBtn = document.querySelector('#anteprojeto-modal button[onclick="closeAnteprojetoModal()"]');
    if (closeBtn) closeBtn.disabled = show;

    document.querySelectorAll('#anteprojeto-modal input:not([disabled]), #anteprojeto-modal textarea:not([disabled]), #anteprojeto-modal select:not([disabled])')
        .forEach(el => {
            if (show) {
                el.dataset.anteprojetoLoadingDisabled = '1';
                el.disabled = true;
            } else if (el.dataset.anteprojetoLoadingDisabled === '1') {
                delete el.dataset.anteprojetoLoadingDisabled;
                el.disabled = false;
            }
        });

    if (!show) {
        const submitBtn = document.getElementById('anteprojeto-form-submit');
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function attachModuleObservationsToConferences(conferences) {
    const moduleIds = conferences.flatMap(conference =>
        (conference.conferenceProjects || []).flatMap(project =>
            (project.modules || []).map(module => module.id).filter(Boolean)
        )
    );

    if (!moduleIds.length) return conferences;

    let result = await supabaseClient
        .from('AnteprojetoModuleObservation')
        .select(`
            *,
            observation:AnteprojetoObservation(id, text)
        `)
        .in('moduleId', moduleIds)
        .order('sortOrder', { ascending: true });

    if (result.error) {
        result = await supabaseClient
            .from('AnteprojetoModuleObservation')
            .select('*')
            .in('moduleId', moduleIds)
            .order('sortOrder', { ascending: true });
    }

    if (result.error) {
        console.error('attachModuleObservationsToConferences:', result.error);
        return conferences;
    }

    const observationIds = [...new Set((result.data || []).map(row => row.observationId).filter(Boolean))];
    let observationById = {};
    if (observationIds.length) {
        const { data: catalog } = await supabaseClient
            .from('AnteprojetoObservation')
            .select('id, text')
            .in('id', observationIds);
        catalog?.forEach(item => { observationById[item.id] = item; });
    }

    const byModuleId = {};
    (result.data || []).forEach(row => {
        if (!byModuleId[row.moduleId]) byModuleId[row.moduleId] = [];
        byModuleId[row.moduleId].push({
            ...row,
            observation: row.observation || observationById[row.observationId] || null
        });
    });

    return conferences.map(conference => ({
        ...conference,
        conferenceProjects: (conference.conferenceProjects || []).map(project => ({
            ...project,
            modules: (project.modules || []).map(module => ({
                ...module,
                observations: Object.prototype.hasOwnProperty.call(byModuleId, module.id)
                    ? byModuleId[module.id]
                    : (module.observations || [])
            }))
        }))
    }));
}

async function upsertModuleObservationRow(payload) {
    const attempt = async (data) => supabaseClient
        .from('AnteprojetoModuleObservation')
        .insert(data)
        .select('id')
        .single();

    let { data, error } = await attempt(payload);
    if (error?.message?.includes('consultorChecked') || error?.message?.includes('consultorResponse')) {
        const { consultorChecked: _c, consultorResponse: _r, ...fallback } = payload;
        ({ data, error } = await attempt(fallback));
    }
    if (error) throw error;
    return data;
}

async function updateModuleObservationRow(id, payload) {
    const attempt = async (data) => supabaseClient
        .from('AnteprojetoModuleObservation')
        .update(data)
        .eq('id', id);

    let { error } = await attempt(payload);
    if (error?.message?.includes('consultorChecked') || error?.message?.includes('consultorResponse')) {
        const { consultorChecked: _c, consultorResponse: _r, ...fallback } = payload;
        ({ error } = await attempt(fallback));
    }
    if (error) throw error;
}

async function persistModuleObservations(moduleId, observations, options = {}) {
    const { canEditStructure = true, canEditConsultor = false } = options;
    const rows = observations || [];

    if (canEditConsultor && !canEditStructure) {
        for (const obs of rows) {
            if (!obs.id) continue;
            await updateModuleObservationRow(obs.id, {
                consultorChecked: obs.consultorChecked,
                consultorResponse: obs.consultorResponse || null
            });
        }
        return;
    }

    if (!canEditStructure) return;

    const { data: current } = await supabaseClient
        .from('AnteprojetoModuleObservation')
        .select('id')
        .eq('moduleId', moduleId);

    const keepIds = rows.filter(obs => obs.id).map(obs => obs.id);
    const deleteIds = (current || [])
        .map(row => row.id)
        .filter(id => !keepIds.includes(id));

    if (deleteIds.length) {
        await supabaseClient
            .from('AnteprojetoModuleObservation')
            .delete()
            .in('id', deleteIds);
    }

    for (let index = 0; index < rows.length; index += 1) {
        const obs = rows[index];
        const observationId = await upsertAnteprojetoObservation(obs.text);
        if (!observationId) {
            throw new Error(`Não foi possível salvar a observação "${obs.text}".`);
        }

        const payload = {
            observationId,
            sortOrder: index,
            consultorChecked: obs.consultorChecked || false,
            consultorResponse: obs.consultorResponse || null
        };

        if (obs.id) {
            await updateModuleObservationRow(obs.id, payload);
            continue;
        }

        await upsertModuleObservationRow({
            moduleId,
            ...payload
        });
    }
}

async function persistAnteprojetoConferenceData(conferenceId, selectedProjects, modules, options = {}) {
    const {
        canEditStructure = true,
        canExtendStructure = false,
        canEditConsultor = false
    } = options;
    const now = new Date().toISOString();
    const projectIdByOrderProject = {};

    if (canExtendStructure && canEditStructure) {
        const { data: currentProjects } = await supabaseClient
            .from('AnteprojetoConferenceProject')
            .select('id, orderProjectId')
            .eq('conferenceId', conferenceId);

        const keepOrderProjectIds = selectedProjects.map(project => project.orderProjectId);
        const deleteProjectIds = (currentProjects || [])
            .filter(project => !keepOrderProjectIds.includes(Number(project.orderProjectId)))
            .map(project => project.id);

        if (deleteProjectIds.length) {
            await supabaseClient
                .from('AnteprojetoConferenceProject')
                .delete()
                .in('id', deleteProjectIds);
        }

        for (const project of selectedProjects) {
            const existing = (currentProjects || []).find(
                row => Number(row.orderProjectId) === Number(project.orderProjectId)
            );

            if (existing) {
                const { error } = await supabaseClient
                    .from('AnteprojetoConferenceProject')
                    .update({ sortOrder: project.sortOrder })
                    .eq('id', existing.id);
                if (error) throw error;
                projectIdByOrderProject[project.orderProjectId] = existing.id;
                continue;
            }

            const { data: inserted, error } = await supabaseClient
                .from('AnteprojetoConferenceProject')
                .insert({
                    conferenceId,
                    orderProjectId: project.orderProjectId,
                    sortOrder: project.sortOrder
                })
                .select('id')
                .single();
            if (error) throw error;
            projectIdByOrderProject[project.orderProjectId] = inserted.id;
        }
    } else {
        const { data: currentProjects } = await supabaseClient
            .from('AnteprojetoConferenceProject')
            .select('id, orderProjectId')
            .eq('conferenceId', conferenceId);
        (currentProjects || []).forEach(project => {
            projectIdByOrderProject[project.orderProjectId] = project.id;
        });
    }

    const existingModuleIds = modules.filter(module => module.id).map(module => module.id);
    if (canExtendStructure && canEditStructure) {
        const conferenceProjectIds = Object.values(projectIdByOrderProject);
        let moduleRows = [];
        if (conferenceProjectIds.length) {
            const { data: currentModules } = await supabaseClient
                .from('AnteprojetoModule')
                .select('id')
                .in('conferenceProjectId', conferenceProjectIds);
            moduleRows = currentModules || [];
        }

        const deleteModuleIds = moduleRows
            .map(module => module.id)
            .filter(id => !existingModuleIds.includes(id));

        if (deleteModuleIds.length) {
            await supabaseClient.from('AnteprojetoModule').delete().in('id', deleteModuleIds);
        }
    }

    for (const module of modules) {
        const conferenceProjectId = projectIdByOrderProject[module.orderProjectId];
        if (!conferenceProjectId && canEditStructure) {
            throw new Error('Projeto do módulo não encontrado na conferência.');
        }

        if (module.id) {
            const updatePayload = { updatedAt: now };
            if (canExtendStructure && canEditStructure) {
                updatePayload.conferenceProjectId = conferenceProjectId;
                updatePayload.name = module.name;
                updatePayload.sortOrder = module.sortOrder;
            }

            const { error } = await supabaseClient
                .from('AnteprojetoModule')
                .update(updatePayload)
                .eq('id', module.id);
            if (error) throw error;

            if (canEditStructure) {
                await persistModuleObservations(module.id, module.observations || [], {
                    canEditStructure,
                    canEditConsultor
                });
            } else if (canEditConsultor && module.observations?.length) {
                await persistModuleObservations(module.id, module.observations, {
                    canEditStructure: false,
                    canEditConsultor: true
                });
            }
            continue;
        }

        if (!canExtendStructure || !canEditStructure) continue;

        const { data: insertedModule, error } = await supabaseClient
            .from('AnteprojetoModule')
            .insert({
                conferenceProjectId,
                name: module.name,
                sortOrder: module.sortOrder
            })
            .select('id')
            .single();
        if (error) throw error;

        await persistModuleObservations(insertedModule.id, module.observations || [], {
            canEditStructure: true,
            canEditConsultor: false
        });
    }
}

async function saveAnteprojetoConference() {
    const conference = editingAnteprojetoConferenceId
        ? anteprojetoConferencesCache.find(c => c.id === editingAnteprojetoConferenceId)
        : null;

    const canEditStructure = canEditAnteprojetoConference(conference);
    const canExtendStructure = canExtendAnteprojetoConferenceStructure(conference);
    const canEditConsultor = canEditAnteprojetoConsultorFields(conference);

    if (!canEditStructure && !canEditConsultor) {
        alertAppDialog('Você não tem permissão para salvar esta conferência.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const designerId = Number(document.getElementById('anteprojeto-designer')?.value);
    const sketchUpPath = document.getElementById('anteprojeto-sketchup-path')?.value.trim() || null;
    const conferenceObservation = document.getElementById('anteprojeto-conference-observation')?.value.trim() || null;
    const selectedProjects = collectSelectedProjectsFromDom();
    const modules = collectAnteprojetoModulesFromDom();

    if (canEditStructure) {
        if (!selectedProjects.length) {
            alertAppDialog('Adicione ao menos um projeto.');
            return;
        }
        if (!designerId) {
            alertAppDialog('Selecione o projetista.');
            return;
        }
        if (!modules.length) {
            alertAppDialog('Adicione ao menos um módulo.');
            return;
        }

        const modulesByProject = {};
        modules.forEach(module => {
            if (!modulesByProject[module.orderProjectId]) {
                modulesByProject[module.orderProjectId] = [];
            }
            modulesByProject[module.orderProjectId].push(module);
        });
        for (const project of selectedProjects) {
            const projectModules = modulesByProject[project.orderProjectId] || [];
            if (!projectModules.length) {
                const section = document.querySelector(
                    `.anteprojeto-project-section[data-order-project-id="${project.orderProjectId}"]`
                );
                const label = section?.dataset.projectLabel || 'um projeto';
                alertAppDialog(`Adicione ao menos um módulo em ${label}.`);
                return;
            }
        }

        for (const module of modules) {
            if (!module.name) {
                alertAppDialog('Informe o nome de todos os módulos.');
                return;
            }
            if (!module.observations.length) {
                alertAppDialog(`Adicione ao menos uma observação no módulo "${module.name}".`);
                return;
            }
        }
    }

    const now = new Date().toISOString();
    const isNewConference = !conference;

    try {
        setAnteprojetoModalLoading(true, isNewConference ? 'Registrando conferência...' : 'Salvando conferência...');
        let conferenceId = conference?.id;

        if (conference) {
            if (canEditStructure) {
                const { error } = await supabaseClient
                    .from('AnteprojetoConference')
                    .update({
                        designerId,
                        sketchUpPath,
                        conferenceObservation,
                        updatedAt: now,
                        updatedById: currentUser.id
                    })
                    .eq('id', conference.id);
                if (error) throw error;
            }
        } else {
            const { data: created, error } = await supabaseClient
                .from('AnteprojetoConference')
                .insert({
                    orderId: activeOrderId,
                    designerId,
                    sketchUpPath,
                    conferenceObservation,
                    status: 'Em andamento',
                    createdById: currentUser.id,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .select('id')
                .single();
            if (error) throw error;
            conferenceId = created.id;
        }

        setAnteprojetoModalLoading(true, 'Salvando projetos e módulos...');
        await persistAnteprojetoConferenceData(
            conferenceId,
            selectedProjects,
            modules,
            { canEditStructure, canExtendStructure, canEditConsultor }
        );

        if (isNewConference) {
            setAnteprojetoModalLoading(true, 'Atualizando status dos projetos...');
            await applyConferenciaEnviadaStatusToProjects(
                selectedProjects.map(project => project.orderProjectId)
            );
            if (typeof notifyConferenciaEnviadaEmail === 'function') {
                setAnteprojetoModalLoading(true, 'Enviando e-mail de notificação...');
                await notifyConferenciaEnviadaEmail({
                    orderId: activeOrderId,
                    orderProjectIds: selectedProjects.map(project => project.orderProjectId),
                    designerId,
                    sketchUpPath,
                    conferenceObservation
                });
            }
        }

        setAnteprojetoModalLoading(true, 'Atualizando telas...');
        await loadAnteprojetoObservations();
        refreshAnteprojetoObservationDatalist();
        await loadAnteprojetoConferences(activeOrderId);
        if (typeof loadOrderProjects === 'function' && activeOrderId) {
            await loadOrderProjects(activeOrderId);
        }
        await refreshAnteprojetoRelatedViews();

        setAnteprojetoModalLoading(
            true,
            isNewConference ? 'Conferência criada e notificação enviada!' : 'Conferência salva com sucesso!',
            'success'
        );
        await new Promise(resolve => setTimeout(resolve, 900));
        closeAnteprojetoModal();
    } catch (error) {
        setAnteprojetoModalLoading(true, `Erro ao salvar conferência: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setAnteprojetoModalLoading(false);
    }
}

async function confirmAnteprojetoConference(conferenceId, options = {}) {
    const conference = anteprojetoConferencesCache.find(c => c.id === conferenceId);
    if (!conference) return;

    if (!canConfirmAnteprojetoConference(conference)) {
        alertAppDialog('Somente o consultor do pedido ou Admin podem confirmar a conferência.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const moduleObservations = getConferenceModuleObservations(conference);
    if (!moduleObservations.length) {
        alertAppDialog('A conferência precisa ter ao menos uma observação.');
        return;
    }
    if (!moduleObservations.every(obs => obs.consultorChecked)) {
        alertAppDialog('Marque todas as observações como conferidas antes de confirmar.');
        return;
    }

    if (!options.skipCharacteristicsCheck && typeof openProjectCharacteristicsModalForConference === 'function') {
        await openProjectCharacteristicsModalForConference(conference, () =>
            confirmAnteprojetoConference(conferenceId, { skipCharacteristicsCheck: true })
        );
        return;
    }

    const now = new Date().toISOString();

    try {
        setAnteprojetoConferenceActionLoading(true, 'Registrando confirmação da conferência...');

        const { error } = await supabaseClient
            .from('AnteprojetoConference')
            .update({
                status: 'Confirmada',
                confirmedAt: now,
                confirmedById: currentUser.id,
                updatedAt: now,
                updatedById: currentUser.id
            })
            .eq('id', conferenceId);

        if (error) throw error;

        setAnteprojetoConferenceActionLoading(true, 'Atualizando status dos projetos...');
        await applyConferenciaRealizadaStatusToProjects(getConferenceOrderProjectIds(conference));

        if (typeof notifyConferenciaConfirmadaEmail === 'function') {
            setAnteprojetoConferenceActionLoading(true, 'Enviando e-mail de notificação...');
            await notifyConferenciaConfirmadaEmail({
                orderId: conference.orderId,
                orderProjectIds: getConferenceOrderProjectIds(conference)
            });
        }

        setAnteprojetoConferenceActionLoading(true, 'Atualizando telas...');
        await refreshViewsAfterAnteprojetoConfirmation();

        setAnteprojetoConferenceActionLoading(true, 'Conferência confirmada!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));

        if (isAnteprojetoModalVisible()) {
            closeAnteprojetoModal();
        }

        setAnteprojetoConferenceActionLoading(false);
    } catch (error) {
        setAnteprojetoConferenceActionLoading(true, `Erro ao confirmar conferência: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setAnteprojetoConferenceActionLoading(false);
    }
}

async function confirmAnteprojetoConferenceFromModal() {
    const conferenceId = editingAnteprojetoConferenceId;
    if (!conferenceId) return;

    const conference = anteprojetoConferencesCache.find(c => c.id === conferenceId);
    if (!conference || !canConfirmAnteprojetoConference(conference)) return;

    if (!areAllAnteprojetoModalObservationsChecked()) {
        alertAppDialog('Marque todas as observações como conferidas antes de confirmar.');
        return;
    }

    try {
        setAnteprojetoConferenceActionLoading(true, 'Salvando alterações da conferência...');

        const selectedProjects = collectSelectedProjectsFromDom();
        const modules = collectAnteprojetoModulesFromDom();
        await persistAnteprojetoConferenceData(
            conferenceId,
            selectedProjects,
            modules,
            { canEditStructure: false, canExtendStructure: false, canEditConsultor: true }
        );

        const refreshed = await fetchAnteprojetoConferenceById(conferenceId);
        if (refreshed) {
            const cacheIndex = anteprojetoConferencesCache.findIndex(item => Number(item.id) === Number(conferenceId));
            if (cacheIndex >= 0) {
                anteprojetoConferencesCache[cacheIndex] = refreshed;
            } else {
                anteprojetoConferencesCache.push(refreshed);
            }
        }

        await confirmAnteprojetoConference(conferenceId);
    } catch (error) {
        setAnteprojetoConferenceActionLoading(true, `Erro ao confirmar conferência: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setAnteprojetoConferenceActionLoading(false);
    }
}

async function confirmAnteprojetoConferenceFromPendencias(conferenceId) {
    const conference = await fetchAnteprojetoConferenceById(conferenceId);
    if (!conference) {
        alertAppDialog('Conferência não encontrada.');
        return;
    }

    activeOrderId = conference.orderId;
    const cacheIndex = anteprojetoConferencesCache.findIndex(item => Number(item.id) === Number(conferenceId));
    if (cacheIndex >= 0) {
        anteprojetoConferencesCache[cacheIndex] = conference;
    } else {
        anteprojetoConferencesCache = [...anteprojetoConferencesCache, conference];
    }

    await confirmAnteprojetoConference(conferenceId);
}

async function approveAnteprojetoConferenceFromPendencias(conferenceId) {
    const conference = await fetchAnteprojetoConferenceById(conferenceId);
    if (!conference) {
        alertAppDialog('Conferência não encontrada.');
        return;
    }

    activeOrderId = conference.orderId;
    const cacheIndex = anteprojetoConferencesCache.findIndex(item => Number(item.id) === Number(conferenceId));
    if (cacheIndex >= 0) {
        anteprojetoConferencesCache[cacheIndex] = conference;
    } else {
        anteprojetoConferencesCache = [...anteprojetoConferencesCache, conference];
    }

    await approveAnteprojetoConference(conferenceId);
}

window.confirmAnteprojetoConference = confirmAnteprojetoConference;
window.confirmAnteprojetoConferenceFromModal = confirmAnteprojetoConferenceFromModal;
window.confirmAnteprojetoConferenceFromPendencias = confirmAnteprojetoConferenceFromPendencias;
window.fetchAnteprojetoConferenceById = fetchAnteprojetoConferenceById;

async function approveAnteprojetoConference(conferenceId) {
    const conference = anteprojetoConferencesCache.find(c => c.id === conferenceId);
    if (!conference) return;

    if (!canApproveAnteprojetoConference(conference)) {
        alertAppDialog('Somente Admin com flag Gestor comercial pode aprovar a conferência.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!(await confirmAppDialog('Aprovar esta conferência e alterar os projetos para Aguardando Projeto Técnico?'))) {
        return;
    }

    try {
        setAnteprojetoConferenceActionLoading(true, 'Atualizando status dos projetos...');
        await applyAguardandoProjetoTecnicoStatusToProjects(getConferenceOrderProjectIds(conference));

        const now = new Date().toISOString();
        let updatePayload = {
            status: 'Aprovada',
            approvedAt: now,
            approvedById: currentUser.id,
            updatedAt: now,
            updatedById: currentUser.id
        };

        setAnteprojetoConferenceActionLoading(true, 'Registrando aprovação da conferência...');

        let { error: conferenceError } = await supabaseClient
            .from('AnteprojetoConference')
            .update(updatePayload)
            .eq('id', conferenceId);

        if (conferenceError?.message?.includes('approvedAt') || conferenceError?.message?.includes('Aprovada')) {
            updatePayload = {
                status: 'Aprovada',
                updatedAt: now,
                updatedById: currentUser.id
            };
            ({ error: conferenceError } = await supabaseClient
                .from('AnteprojetoConference')
                .update(updatePayload)
                .eq('id', conferenceId));
        }

        if (conferenceError) throw conferenceError;

        if (typeof notifyConferenciaAprovadaEmail === 'function') {
            setAnteprojetoConferenceActionLoading(true, 'Enviando e-mail de notificação...');
            await notifyConferenciaAprovadaEmail({
                orderId: conference.orderId,
                orderProjectIds: getConferenceOrderProjectIds(conference)
            });
        }

        setAnteprojetoConferenceActionLoading(true, 'Atualizando telas...');
        await refreshViewsAfterAnteprojetoApproval();

        setAnteprojetoConferenceActionLoading(true, 'Conferência aprovada!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));

        if (isAnteprojetoModalVisible()) {
            closeAnteprojetoModal();
        }

        setAnteprojetoConferenceActionLoading(false);
    } catch (error) {
        setAnteprojetoConferenceActionLoading(true, `Erro ao aprovar conferência: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setAnteprojetoConferenceActionLoading(false);
    }
}

window.approveAnteprojetoConference = approveAnteprojetoConference;
window.approveAnteprojetoConferenceFromPendencias = approveAnteprojetoConferenceFromPendencias;
window.canReturnAnteprojetoConferenceToConsultor = canReturnAnteprojetoConferenceToConsultor;
window.showAnteprojetoReturnObservationForm = showAnteprojetoReturnObservationForm;
window.returnAnteprojetoConferenceToConsultor = returnAnteprojetoConferenceToConsultor;
window.closeAnteprojetoReturnModal = closeAnteprojetoReturnModal;

function bindAnteprojetoTreeToggles(root) {
    root.querySelectorAll('.anteprojeto-tree-node').forEach(node => {
        const row = node.querySelector(':scope > .anteprojeto-tree-row');
        const children = node.querySelector(':scope > .anteprojeto-tree-children');
        const btn = row?.querySelector('.anteprojeto-tree-toggle');
        if (!row || !children || !btn) return;

        btn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const collapsed = children.classList.toggle('hidden');
            btn.textContent = collapsed ? '▶' : '▼';
            btn.setAttribute('aria-label', collapsed ? 'Expandir' : 'Recolher');
        });
    });
}

function renderAnteprojetoObservationTableHeader() {
    return `
        <div class="anteprojeto-obs-table-header grid grid-cols-[1fr_5rem_1fr] gap-2 px-2 py-1.5 bg-slate-50 text-[10px] uppercase text-slate-500 font-semibold border-b border-slate-200">
            <span>Observação</span>
            <span class="text-center">Conferido</span>
            <span>Resposta</span>
        </div>
    `;
}

function renderAnteprojetoObservationLeaf(obs) {
    return `
        <div class="anteprojeto-tree-leaf grid grid-cols-[1fr_5rem_1fr] gap-2 items-start px-2 py-1.5 text-xs border-b border-slate-100 last:border-0">
            <span class="text-slate-700 whitespace-pre-wrap text-left">${escapeHtml(obs.text)}</span>
            <div class="flex justify-center pt-0.5">
                <input type="checkbox" class="h-3.5 w-3.5 rounded border-slate-300 text-sky-600" disabled
                    ${obs.consultorChecked ? 'checked' : ''}>
            </div>
            <span class="text-slate-500 whitespace-pre-wrap text-left">${escapeHtml(obs.consultorResponse || '—')}</span>
        </div>
    `;
}

function renderAnteprojetoConferenceCard(conference, projetistaNames = {}) {
    const confirmed = isAnteprojetoConferenceConfirmed(conference);
    const approved = isAnteprojetoConferenceApproved(conference);
    const moduleObservations = getConferenceModuleObservations(conference);
    const checkedCount = moduleObservations.filter(obs => obs.consultorChecked).length;
    const canEdit = canEditAnteprojetoConference(conference) || canEditAnteprojetoConsultorFields(conference);
    const canConfirm = canConfirmAnteprojetoConference(conference);
    const canApprove = canApproveAnteprojetoConference(conference);
    const canReturn = canReturnAnteprojetoConferenceToConsultor(conference);
    const canOpen = confirmed || canEdit;
    const allChecked = moduleObservations.length > 0
        && moduleObservations.every(obs => obs.consultorChecked);
    const projetistaName = projetistaNames[conference.designerId] || '-';
    const statusClass = approved
        ? 'bg-indigo-100 text-indigo-800'
        : confirmed
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-sky-100 text-sky-800';
    const sketchUpPath = getConferenceSketchUpPath(conference);
    const conferenceObservation = conference.conferenceObservation || '';
    const projectCount = (conference.conferenceProjects || []).length;
    const moduleCount = getConferenceModules(conference).length;

    const card = document.createElement('div');
    card.className = `${approved ? 'bg-indigo-50/60 border-indigo-200' : confirmed ? 'bg-emerald-50/60 border-emerald-200' : 'bg-sky-50/50 border-sky-200'} rounded-xl border shadow-sm overflow-hidden`;

    const header = document.createElement('div');
    header.className = 'px-4 py-3 bg-white/60 space-y-2 border-b border-slate-100';
    header.innerHTML = `
        <div class="flex items-start gap-2">
            <div class="flex-1 min-w-0 space-y-0.5">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs font-bold text-slate-800">👤 ${escapeHtml(projetistaName)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(conference.status)}</span>
                </div>
                <div class="text-[10px] text-slate-500">
                    Conferidas: ${checkedCount}/${moduleObservations.length}
                    · ${projectCount} projeto${projectCount === 1 ? '' : 's'}
                    · ${moduleCount} módulo${moduleCount === 1 ? '' : 's'}
                </div>
            </div>
            ${canOpen
                ? `<button type="button" class="text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium shrink-0"
                    onclick="openAnteprojetoModal(${conference.id})">${confirmed ? 'Visualizar' : 'Editar'}</button>`
                : ''}
        </div>
        <div class="text-left border border-slate-200 rounded-lg px-3 py-2 bg-white/80">
            <div class="text-[10px] font-semibold text-slate-500 uppercase mb-1">Observação da conferência</div>
            <div class="text-xs text-slate-700 whitespace-pre-wrap">${escapeHtml(conferenceObservation || '—')}</div>
        </div>
        <div class="text-xs text-slate-600 text-left">
            <span class="font-semibold text-slate-500">SketchUp:</span> ${escapeHtml(sketchUpPath || '—')}
        </div>
    `;

    const body = document.createElement('div');
    body.className = 'px-4 py-3 space-y-2';

    const projectsWrap = document.createElement('div');
    projectsWrap.className = 'space-y-1';

    (conference.conferenceProjects || []).forEach(project => {
        const projectName = project.orderProject?.name || 'Projeto';
        const modules = project.modules || [];

        const projectNode = document.createElement('div');
        projectNode.className = 'anteprojeto-tree-node';

        const projectRow = document.createElement('div');
        projectRow.className = 'anteprojeto-tree-row flex items-center gap-2 py-1.5';
        projectRow.innerHTML = `
            <button type="button" class="anteprojeto-tree-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                aria-label="Expandir">▶</button>
            <span class="text-xs font-semibold text-slate-800">🏠 ${escapeHtml(projectName)}</span>
            <span class="text-[10px] text-slate-400">${modules.length} módulo${modules.length === 1 ? '' : 's'}</span>
        `;

        const projectChildren = document.createElement('div');
        projectChildren.className = 'anteprojeto-tree-children hidden ml-4 border-l border-slate-200 pl-3 space-y-1';

        modules.forEach(module => {
            const observations = normalizeModuleObservations(module.observations)
                .sort((a, b) => a.sortOrder - b.sortOrder);

            const moduleNode = document.createElement('div');
            moduleNode.className = 'anteprojeto-tree-node';

            const moduleRow = document.createElement('div');
            moduleRow.className = 'anteprojeto-tree-row flex items-center gap-2 py-1';
            moduleRow.innerHTML = `
                <button type="button" class="anteprojeto-tree-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                    aria-label="Expandir">▶</button>
                <span class="text-xs font-medium text-slate-700">${escapeHtml(module.name || 'Módulo')}</span>
                <span class="text-[10px] text-slate-400">${observations.length} obs.</span>
            `;

            const moduleChildren = document.createElement('div');
            moduleChildren.className = 'anteprojeto-tree-children hidden ml-4 border-l border-slate-200 pl-2';

            if (!observations.length) {
                moduleChildren.innerHTML = '<p class="text-[10px] text-slate-400 py-1">Nenhuma observação.</p>';
            } else {
                const table = document.createElement('div');
                table.className = 'anteprojeto-obs-table border border-slate-200 rounded-lg overflow-hidden bg-white/80';
                table.innerHTML = renderAnteprojetoObservationTableHeader();
                observations.forEach(obs => {
                    const leaf = document.createElement('div');
                    leaf.innerHTML = renderAnteprojetoObservationLeaf(obs);
                    table.appendChild(leaf.firstElementChild);
                });
                moduleChildren.appendChild(table);
            }

            moduleNode.appendChild(moduleRow);
            moduleNode.appendChild(moduleChildren);
            projectChildren.appendChild(moduleNode);
        });

        if (!modules.length) {
            projectChildren.innerHTML = '<p class="text-[10px] text-slate-400 py-1">Nenhum módulo.</p>';
        }

        projectNode.appendChild(projectRow);
        projectNode.appendChild(projectChildren);
        projectsWrap.appendChild(projectNode);
    });

    if (!projectCount) {
        projectsWrap.innerHTML = '<p class="text-xs text-slate-400 py-2">Sem projetos cadastrados.</p>';
    }

    body.appendChild(projectsWrap);

    if (canConfirm || canApprove || canReturn) {
        const confirmWrap = document.createElement('div');
        confirmWrap.className = 'flex justify-end gap-2 pt-2 border-t border-slate-100';
        if (canConfirm) {
            confirmWrap.innerHTML += `
                <button type="button" onclick="confirmAnteprojetoConference(${conference.id})"
                    class="text-xs px-3 py-1.5 rounded-lg font-medium ${allChecked ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}"
                    ${allChecked ? '' : 'disabled'}>
                    Confirmar Conferência
                </button>
            `;
        }
        if (canReturn) {
            confirmWrap.innerHTML += `
                <button type="button" onclick="showAnteprojetoReturnObservationForm(${conference.id})"
                    class="text-xs px-3 py-1.5 rounded-lg font-medium bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-200">
                    Voltar para Consultor
                </button>
            `;
        }
        if (canApprove) {
            confirmWrap.innerHTML += `
                <button type="button" onclick="approveAnteprojetoConference(${conference.id})"
                    class="text-xs px-3 py-1.5 rounded-lg font-medium bg-indigo-700 text-white hover:bg-indigo-800">
                    Aprovar
                </button>
            `;
        }
        body.appendChild(confirmWrap);
    }

    card.appendChild(header);
    card.appendChild(body);
    bindAnteprojetoTreeToggles(body);

    return card;
}

async function enrichAnteprojetoConferences(conferences, orderId) {
    const orderProjects = await resolveOrderProjectsForOrder(orderId);
    const orderProjectById = Object.fromEntries(orderProjects.map(project => [Number(project.id), project]));

    const observationIds = [
        ...new Set(
            conferences.flatMap(conference =>
                (conference.conferenceProjects || []).flatMap(project =>
                    (project.modules || []).flatMap(module => {
                        const raw = module.observations;
                        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
                        return list.map(obs => obs.observationId).filter(Boolean);
                    })
                )
            )
        )
    ];

    let observationById = {};
    if (observationIds.length) {
        const { data: observations } = await supabaseClient
            .from('AnteprojetoObservation')
            .select('id, text')
            .in('id', observationIds);
        observations?.forEach(observation => {
            observationById[observation.id] = observation;
        });
    }

    return conferences.map(conference => ({
        ...conference,
        conferenceProjects: (conference.conferenceProjects || [])
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map(project => ({
            ...project,
            orderProject: orderProjectById[Number(project.orderProjectId)] || project.orderProject || null,
            modules: (project.modules || [])
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.id - b.id))
                .map(module => {
                    const rawObservations = Array.isArray(module.observations)
                        ? module.observations
                        : module.observations
                            ? [module.observations]
                            : [];
                    return {
                        ...module,
                        observations: rawObservations
                            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                            .map(obs => ({
                                ...obs,
                                observation: obs.observation || observationById[obs.observationId] || null
                            }))
                    };
                })
        }))
    }));
}

async function loadAnteprojetoConferences(orderId) {
    const list = document.getElementById('anteprojeto-list');
    if (!list) return;

    let result = await supabaseClient
        .from('AnteprojetoConference')
        .select(`
            *,
            conferenceProjects:AnteprojetoConferenceProject(
                *,
                orderProject:OrderProject(id, name, statusId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)),
                modules:AnteprojetoModule(
                    *,
                    observations:AnteprojetoModuleObservation(
                        *,
                        observation:AnteprojetoObservation(id, text)
                    )
                )
            )
        `)
        .eq('orderId', orderId)
        .order('createdAt', { ascending: false });

    if (result.error?.message?.includes('AnteprojetoConferenceProject')) {
        result = await supabaseClient
            .from('AnteprojetoConference')
            .select(`
                *,
                conferenceProjects:AnteprojetoConferenceProject(
                    *,
                    modules:AnteprojetoModule(*)
                )
            `)
            .eq('orderId', orderId)
            .order('createdAt', { ascending: false });
    }

    if (result.error?.message?.includes('Anteprojeto')) {
        list.innerHTML = '<p class="text-xs text-amber-700 text-center py-6 bg-amber-50 rounded-xl border border-amber-100">Execute o SQL <code>supabase/create-anteprojeto.sql</code> no Supabase.</p>';
        updateOrderTabCounts(undefined, undefined, undefined, 0);
        return;
    }

    if (result.error) {
        console.error('loadAnteprojetoConferences:', result.error);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-4">Erro ao carregar conferências: ${escapeHtml(result.error.message)}</p>`;
        return;
    }

    let conferences = result.data || [];
    conferences = await attachModuleObservationsToConferences(conferences);
    conferences = await enrichAnteprojetoConferences(conferences, orderId);
    anteprojetoConferencesCache = conferences;

    const openCount = conferences.filter(conference => conference.status === 'Em andamento').length;
    updateOrderTabCounts(undefined, undefined, undefined, openCount);

    const designerIds = [...new Set(conferences.map(conference => conference.designerId).filter(Boolean))];
    const projetistaNames = {};
    if (designerIds.length) {
        const { data: users } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', designerIds);
        users?.forEach(user => { projetistaNames[user.id] = user.name; });
    }

    list.innerHTML = '';
    if (!conferences.length) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 bg-white rounded-xl border border-sky-100">Nenhuma conferência de anteprojeto para este pedido.</p>';
        updateAnteprojetoActionButtons();
        return;
    }

    conferences.forEach(conference => {
        list.appendChild(renderAnteprojetoConferenceCard(conference, projetistaNames));
    });

    updateAnteprojetoActionButtons();
}

function updateAnteprojetoActionButtons() {
    const panel = document.getElementById('order-tab-panel-anteprojeto');
    const onTab = panel && !panel.classList.contains('hidden');
    const newBtn = document.getElementById('btn-new-anteprojeto');
    if (newBtn) {
        newBtn.classList.toggle('hidden', !onTab || !canActOrderDetailTab('anteprojeto'));
    }
}

function bindAnteprojetoEvents() {
    document.getElementById('btn-new-anteprojeto')?.addEventListener('click', () => openAnteprojetoModal());
    document.getElementById('btn-anteprojeto-modal-confirm')?.addEventListener('click', async () => {
        confirmAnteprojetoConferenceFromModal();
    });
    document.getElementById('btn-anteprojeto-modal-approve')?.addEventListener('click', async () => {
        if (!editingAnteprojetoConferenceId) return;
        approveAnteprojetoConference(editingAnteprojetoConferenceId);
    });
    document.getElementById('btn-anteprojeto-modal-return')?.addEventListener('click', () => {
        if (!editingAnteprojetoConferenceId) return;
        showAnteprojetoReturnObservationForm(editingAnteprojetoConferenceId);
    });
    document.getElementById('btn-anteprojeto-return-modal-cancel')?.addEventListener('click', closeAnteprojetoReturnModal);
    document.getElementById('btn-anteprojeto-return-modal-submit')?.addEventListener('click', submitAnteprojetoReturnModal);
    document.getElementById('anteprojeto-projects-structure')?.addEventListener('change', event => {
        if (event.target?.classList?.contains('anteprojeto-observation-checked')) {
            refreshAnteprojetoModalConfirmButton();
        }
    });
    document.getElementById('btn-add-anteprojeto-project')?.addEventListener('click', async () => {
        const conference = editingAnteprojetoConferenceId
            ? anteprojetoConferencesCache.find(c => c.id === editingAnteprojetoConferenceId)
            : null;
        addAnteprojetoProjectFromSelect({
            canEditStructure: canEditAnteprojetoConference(conference),
            canExtendStructure: canExtendAnteprojetoConferenceStructure(conference),
            canEditConsultor: canEditAnteprojetoConsultorFields(conference),
            readOnly: false
        });
    });
    document.getElementById('anteprojeto-form')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        await saveAnteprojetoConference();
    });
}
