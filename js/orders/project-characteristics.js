const PROJECT_CHARACTERISTIC_NONE_VALUE = 'none';
const GESTAO_THIRD_PARTY_MAX_PROJECT_STATUS_NAME = 'Em Produção';
const GESTAO_THIRD_PARTY_IMPLANTACAO_STATUS_ABERTO = 'Aberto';

let projectCharacteristicsCache = [];
let pendingConferenceCharacteristicsConfirm = null;
let pendingProjectCharacteristicsSelections = null;
let gestaoProjectCharacteristicsInitialIds = [];

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

async function fetchThirdPartyLinkedCharacteristicIds() {
    const { data, error } = await supabaseClient
        .from('ThirdPartySubtype')
        .select('projectCharacteristicId')
        .not('projectCharacteristicId', 'is', null)
        .eq('isActive', true);

    if (error) {
        if (error.message?.includes('projectCharacteristicId')) {
            return new Set();
        }
        console.error('fetchThirdPartyLinkedCharacteristicIds:', error);
        return new Set();
    }

    return new Set(
        (data || [])
            .map(row => Number(row.projectCharacteristicId))
            .filter(Boolean)
    );
}

function renderProjectCharacteristicOptionLabel(characteristic, linkedCharacteristicIds = new Set()) {
    const isThirdPartyLinked = linkedCharacteristicIds.has(Number(characteristic.id));
    const asterisk = isThirdPartyLinked
        ? '<span class="project-characteristic-third-party-marker" title="Projeto de terceiros">*</span>'
        : '';
    return `${escapeHtml(characteristic.name)}${asterisk}`;
}

function setProjectCharacteristicsThirdPartyHint(linkedCharacteristicIds = new Set(), characteristics = []) {
    const hintEl = document.getElementById('project-characteristics-modal-third-party-hint');
    if (!hintEl) return;

    const hasLinkedCharacteristics = characteristics.some(characteristic =>
        linkedCharacteristicIds.has(Number(characteristic.id))
    );

    hintEl.classList.toggle('hidden', !hasLinkedCharacteristics);
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

function renderGestaoProjectCharacteristicsFormHtml(characteristics = [], selectedIds = [], linkedCharacteristicIds = new Set()) {
    const selected = new Set(selectedIds.map(id => Number(id)).filter(Boolean));
    const hasNone = selected.size === 0;

    const optionsHtml = characteristics.map(characteristic => {
        const isThirdPartyLinked = linkedCharacteristicIds.has(Number(characteristic.id));
        const asterisk = isThirdPartyLinked
            ? '<span class="project-characteristic-third-party-marker" title="Projeto de terceiros">*</span>'
            : '';

        return `
        <label class="project-characteristic-option">
            <input type="checkbox"
                class="gestao-project-characteristic-checkbox h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                data-characteristic-id="${characteristic.id}"
                ${selected.has(Number(characteristic.id)) ? 'checked' : ''}>
            <span>${escapeHtml(characteristic.name)}${asterisk}</span>
        </label>
    `;
    }).join('');

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

function setGestaoProjectCharacteristicsThirdPartyHint(linkedCharacteristicIds = new Set(), characteristics = []) {
    const hintEl = document.getElementById('gestao-project-characteristics-third-party-hint');
    if (!hintEl) return;

    const hasLinkedCharacteristics = characteristics.some(characteristic =>
        linkedCharacteristicIds.has(Number(characteristic.id))
    );

    hintEl.classList.toggle('hidden', !hasLinkedCharacteristics);
}

function getGestaoProjectCharacteristicsInitialIds() {
    return [...gestaoProjectCharacteristicsInitialIds];
}

function diffCharacteristicIds(previousIds = [], newIds = []) {
    const previous = new Set(previousIds.map(id => Number(id)).filter(Boolean));
    const next = new Set(newIds.map(id => Number(id)).filter(Boolean));

    return {
        added: [...next].filter(id => !previous.has(id)),
        removed: [...previous].filter(id => !next.has(id))
    };
}

function getProjectCharacteristicNameById(characteristicId, characteristics = projectCharacteristicsCache) {
    const match = (characteristics || []).find(item => Number(item.id) === Number(characteristicId));
    return match?.name || `Característica #${characteristicId}`;
}

async function resolveGestaoProjectStatusForThirdPartyCheck(project = {}) {
    if (project.projectStatus?.name) return project.projectStatus;

    const statusId = Number(project.statusId);
    if (!statusId) return null;

    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name, sortOrder')
        .eq('id', statusId)
        .maybeSingle();

    if (error) {
        console.warn('resolveGestaoProjectStatusForThirdPartyCheck:', error);
        return null;
    }

    return data;
}

async function isGestaoProjectStatusWithinEmProducao(project = {}) {
    const status = await resolveGestaoProjectStatusForThirdPartyCheck(project);
    if (!status?.name) return true;

    const { data: emProducaoStatus } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name, sortOrder')
        .eq('name', GESTAO_THIRD_PARTY_MAX_PROJECT_STATUS_NAME)
        .maybeSingle();

    if (emProducaoStatus?.sortOrder != null && status.sortOrder != null) {
        return Number(status.sortOrder) <= Number(emProducaoStatus.sortOrder);
    }

    const blockedStatusNames = new Set([
        'Montagem Interna',
        'Expedição',
        'Projeto Substituído'
    ]);

    return !blockedStatusNames.has(status.name);
}

async function isGestaoImplantacaoOpenForProject(orderProjectId) {
    const normalizedProjectId = Number(orderProjectId);
    if (!normalizedProjectId || typeof fetchImplantacaoByOrderProjectId !== 'function') {
        return true;
    }

    const implantacao = await fetchImplantacaoByOrderProjectId(normalizedProjectId);
    if (!implantacao) return true;

    return implantacao.status === GESTAO_THIRD_PARTY_IMPLANTACAO_STATUS_ABERTO;
}

async function canAddThirdPartyCharacteristicsInGestao(project = {}, characteristicIds = []) {
    const uniqueIds = [...new Set(characteristicIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) {
        return { allowed: true, addedIds: [] };
    }

    const linkedCharacteristicIds = await fetchThirdPartyLinkedCharacteristicIds();
    const addedIds = uniqueIds.filter(id => linkedCharacteristicIds.has(id));
    if (!addedIds.length) {
        return { allowed: true, addedIds: [] };
    }

    const statusAllowed = await isGestaoProjectStatusWithinEmProducao(project);
    if (!statusAllowed) {
        return {
            allowed: false,
            addedIds,
            reason: 'Não é possível adicionar características com projeto de terceiros porque o projeto já está além de "Em Produção".'
        };
    }

    const implantacaoOpen = await isGestaoImplantacaoOpenForProject(project.id);
    if (!implantacaoOpen) {
        return {
            allowed: false,
            addedIds,
            reason: 'Não é possível adicionar características com projeto de terceiros porque a implantação do projeto não está aberta.'
        };
    }

    return { allowed: true, addedIds };
}

async function fetchThirdPartyCharacteristicIdsSentToComprasForOrderProject(orderProjectId) {
    const normalizedProjectId = Number(orderProjectId);
    if (!normalizedProjectId || typeof fetchImplantacaoByOrderProjectId !== 'function') {
        return new Set();
    }

    const implantacao = await fetchImplantacaoByOrderProjectId(normalizedProjectId);
    if (!implantacao?.id) return new Set();

    const { data, error } = await supabaseClient
        .from('ImplantacaoPurchaseItem')
        .select('sentToCommercial, thirdPartySubtype:ThirdPartySubtype(id, projectCharacteristicId)')
        .eq('implantacaoId', implantacao.id)
        .eq('purchaseType', 'Terceiro')
        .eq('sentToCommercial', true);

    if (error) {
        if (error.message?.includes('ImplantacaoPurchaseItem') || error.message?.includes('ThirdPartySubtype')) {
            return new Set();
        }
        console.warn('fetchThirdPartyCharacteristicIdsSentToComprasForOrderProject:', error);
        return new Set();
    }

    return new Set(
        (data || [])
            .map(item => Number(item.thirdPartySubtype?.projectCharacteristicId))
            .filter(Boolean)
    );
}

async function validateAndConfirmGestaoProjectCharacteristicsChanges(options = {}) {
    const {
        project = {},
        previousCharacteristicIds = [],
        newCharacteristicIds = []
    } = options;

    const diff = diffCharacteristicIds(previousCharacteristicIds, newCharacteristicIds);
    const linkedCharacteristicIds = await fetchThirdPartyLinkedCharacteristicIds();
    const addedThirdPartyIds = diff.added.filter(id => linkedCharacteristicIds.has(id));
    const removedThirdPartyIds = diff.removed.filter(id => linkedCharacteristicIds.has(id));

    if (!addedThirdPartyIds.length && !removedThirdPartyIds.length) {
        return {
            proceed: true,
            addedThirdPartyCharacteristicIds: [],
            removedThirdPartyCharacteristicIds: []
        };
    }

    const characteristics = projectCharacteristicsCache.length
        ? projectCharacteristicsCache
        : await loadProjectCharacteristics(true);

    if (removedThirdPartyIds.length && project.id) {
        const sentToComprasCharacteristicIds = await fetchThirdPartyCharacteristicIdsSentToComprasForOrderProject(project.id);
        const blockedRemovalIds = removedThirdPartyIds.filter(id => sentToComprasCharacteristicIds.has(id));

        if (blockedRemovalIds.length) {
            const labels = blockedRemovalIds.map(id => getProjectCharacteristicNameById(id, characteristics));
            alertAppDialog(
                `Não é possível remover ${labels.length > 1 ? 'as características' : 'a característica'} ${labels.join(', ')} porque ${labels.length > 1 ? 'já foram enviadas' : 'já foi enviada'} para compras.`,
                { variant: 'warning', title: 'Ação não permitida' }
            );
            return { proceed: false };
        }

        const existingProjects = typeof fetchThirdPartyProjectsByOrderProjectId === 'function'
            ? await fetchThirdPartyProjectsByOrderProjectId(project.id)
            : [];
        const projectsToDelete = existingProjects.filter(row =>
            removedThirdPartyIds.includes(Number(row.projectCharacteristicId))
        );

        if (projectsToDelete.length) {
            const labels = projectsToDelete.map(row => {
                const characteristicName = row.projectCharacteristic?.name
                    || getProjectCharacteristicNameById(row.projectCharacteristicId, characteristics);
                const subtypeName = row.thirdPartySubtype?.name;
                return subtypeName ? `${characteristicName} (${subtypeName})` : characteristicName;
            });
            const uniqueLabels = [...new Set(labels)];

            const confirmed = await confirmAppDialog(
                `Ao remover ${uniqueLabels.length > 1 ? 'essas características' : 'esta característica'}, ${projectsToDelete.length > 1 ? 'os projetos de terceiros vinculados serão excluídos' : 'o projeto de terceiros vinculado será excluído'}: ${uniqueLabels.join(', ')}.\n\nDeseja continuar?`,
                {
                    title: 'Excluir projeto de terceiros?',
                    confirmLabel: 'Sim, continuar',
                    cancelLabel: 'Não, voltar',
                    variant: 'danger'
                }
            );

            if (!confirmed) {
                return { proceed: false };
            }
        }
    }

    if (addedThirdPartyIds.length) {
        const addCheck = await canAddThirdPartyCharacteristicsInGestao(project, addedThirdPartyIds);
        if (!addCheck.allowed) {
            alertAppDialog(addCheck.reason || 'Não é possível adicionar esta característica com projeto de terceiros.', {
                variant: 'warning',
                title: 'Ação não permitida'
            });
            return { proceed: false };
        }

        const labels = addedThirdPartyIds.map(id => getProjectCharacteristicNameById(id, characteristics));
        const confirmed = await confirmAppDialog(
            `Será criado um projeto de terceiros para ${labels.length > 1 ? 'as características' : 'a característica'} ${labels.join(', ')}. Esse fluxo precisa ser aprovado pelo consultor do pedido.\n\nDeseja continuar?`,
            {
                title: 'Criar projeto de terceiros?',
                confirmLabel: 'Sim, continuar',
                cancelLabel: 'Cancelar'
            }
        );

        if (!confirmed) {
            return { proceed: false };
        }
    }

    return {
        proceed: true,
        addedThirdPartyCharacteristicIds: addedThirdPartyIds,
        removedThirdPartyCharacteristicIds: removedThirdPartyIds
    };
}

function resetGestaoProjectCharacteristicsForm() {
    const optionsEl = document.getElementById('gestao-project-characteristics-options');
    const emptyEl = document.getElementById('gestao-project-characteristics-empty');
    if (optionsEl) optionsEl.innerHTML = '';
    emptyEl?.classList.add('hidden');
    gestaoProjectCharacteristicsInitialIds = [];
    document.getElementById('gestao-project-characteristics-third-party-hint')?.classList.add('hidden');
}

async function loadGestaoProjectCharacteristicsForm(project = {}) {
    const optionsEl = document.getElementById('gestao-project-characteristics-options');
    const emptyEl = document.getElementById('gestao-project-characteristics-empty');
    if (!optionsEl) return;

    const [characteristics, linkedCharacteristicIds] = await Promise.all([
        loadProjectCharacteristics(true),
        fetchThirdPartyLinkedCharacteristicIds()
    ]);

    let selectedIds = project.characteristicIds;
    if (selectedIds == null && project.id) {
        const characteristicsMap = await fetchOrderProjectCharacteristicsMap([project.id]);
        const rows = characteristicsMap.get(Number(project.id)) || [];
        selectedIds = rows.map(row => Number(row.characteristicId));
    }
    selectedIds = selectedIds || [];
    gestaoProjectCharacteristicsInitialIds = [...selectedIds];

    if (!characteristics.length) {
        optionsEl.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        setGestaoProjectCharacteristicsThirdPartyHint(linkedCharacteristicIds, characteristics);
        return;
    }

    emptyEl?.classList.add('hidden');
    optionsEl.innerHTML = renderGestaoProjectCharacteristicsFormHtml(
        characteristics,
        selectedIds,
        linkedCharacteristicIds
    );
    bindGestaoProjectCharacteristicsFormInteractions(optionsEl);
    setGestaoProjectCharacteristicsThirdPartyHint(linkedCharacteristicIds, characteristics);
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

async function getConferenceProjectsForCharacteristics(conference) {
    if (!conference) return [];

    let projects = [];
    if (Array.isArray(conference.conferenceProjects) && conference.conferenceProjects.length) {
        projects = conference.conferenceProjects
            .map(entry => entry.orderProject || { id: entry.orderProjectId || entry.orderProject?.id })
            .filter(p => p && p.id);
    }

    if (!projects.length && Array.isArray(conference.projects) && conference.projects.length) {
        projects = conference.projects.filter(p => p && p.id);
    }

    if (!projects.length && conference.orderId && typeof resolveOrderProjectsForOrder === 'function') {
        projects = await resolveOrderProjectsForOrder(conference.orderId);
    }

    return projects;
}

function getProjectCharacteristicLabel(project) {
    if (!project) return 'Projeto';
    return project.name || `Projeto #${project.id}`;
}

function renderProjectCharacteristicsModalContent(projects, characteristics, existingByProjectId, linkedCharacteristicIds = new Set()) {
    if (!projects || !projects.length) {
        return '<p class="text-xs text-slate-500">Nenhum projeto na conferência.</p>';
    }

    return projects.map(project => {
        const projectId = Number(project.id);
        const existingRows = existingByProjectId.get(projectId) || [];
        let existingIds = new Set(existingRows.map(row => Number(row.characteristicId)));

        if (!existingIds.size && Array.isArray(project.characteristicIds) && project.characteristicIds.length > 0) {
            existingIds = new Set(project.characteristicIds.map(id => Number(id)));
        }

        const isNoneSelected = existingByProjectId.has(projectId) && existingIds.size === 0;

        const optionsHtml = characteristics.map(characteristic => `
            <label class="project-characteristic-option">
                <input type="checkbox"
                    class="project-characteristic-checkbox h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    data-project-id="${projectId}"
                    data-characteristic-id="${characteristic.id}"
                    ${existingIds.has(Number(characteristic.id)) ? 'checked' : ''}>
                <span>${renderProjectCharacteristicOptionLabel(characteristic, linkedCharacteristicIds)}</span>
            </label>
        `).join('');

        const noneHtml = `
            <label class="project-characteristic-option project-characteristic-option--none">
                <input type="checkbox"
                    class="project-characteristic-none h-4 w-4 rounded border-slate-300 text-slate-500 focus:ring-slate-400"
                    data-project-id="${projectId}"
                    value="${PROJECT_CHARACTERISTIC_NONE_VALUE}"
                    ${isNoneSelected ? 'checked' : ''}>
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

    const projects = await getConferenceProjectsForCharacteristics(conference);
    const projectIds = projects.map(project => Number(project.id)).filter(Boolean);
    const [existingByProjectId, linkedCharacteristicIds] = await Promise.all([
        fetchOrderProjectCharacteristicsMap(projectIds),
        fetchThirdPartyLinkedCharacteristicIds()
    ]);
    const content = document.getElementById('project-characteristics-modal-content');
    const subtitle = document.getElementById('project-characteristics-modal-subtitle');

    if (subtitle) {
        subtitle.textContent = 'Informe as características de cada projeto antes de confirmar a conferência.';
    }

    if (content) {
        content.innerHTML = renderProjectCharacteristicsModalContent(
            projects,
            characteristics,
            existingByProjectId,
            linkedCharacteristicIds
        );
        bindProjectCharacteristicsModalInteractions();
    }

    setProjectCharacteristicsThirdPartyHint(linkedCharacteristicIds, characteristics);

    pendingConferenceCharacteristicsConfirm = onComplete || null;
    toggleModal('project-characteristics-modal', true);
    return true;
}

async function finalizeProjectCharacteristicsSave(selections, { continueFlow = true } = {}) {
    try {
        await saveProjectCharacteristicsSelections(selections);
        toggleModal('project-characteristics-third-party-budget-modal', false);
        toggleModal('project-characteristics-modal', false);
        document.getElementById('project-characteristics-modal-third-party-hint')?.classList.add('hidden');

        const onComplete = continueFlow ? pendingConferenceCharacteristicsConfirm : null;
        pendingConferenceCharacteristicsConfirm = null;
        pendingProjectCharacteristicsSelections = null;

        if (typeof onComplete === 'function') {
            await onComplete();
        }
    } catch (error) {
        console.error('finalizeProjectCharacteristicsSave:', error);
        const sqlHint = error.message?.includes('OrderProjectCharacteristic') || error.message?.includes('ProjectCharacteristic')
            ? '\n\nExecute supabase/create-project-characteristic.sql e supabase/create-order-project-characteristic.sql no Supabase.'
            : '';
        alertAppDialog('Erro ao salvar características: ' + error.message + sqlHint);
    }
}

function openProjectCharacteristicsThirdPartyBudgetModal() {
    toggleModal('project-characteristics-third-party-budget-modal', true);
}

function closeProjectCharacteristicsThirdPartyBudgetModal() {
    pendingProjectCharacteristicsSelections = null;
    toggleModal('project-characteristics-third-party-budget-modal', false);
}

async function confirmProjectCharacteristicsThirdPartyBudget(continueFlow) {
    const selections = pendingProjectCharacteristicsSelections;
    if (!selections) return;

    await finalizeProjectCharacteristicsSave(selections, { continueFlow });
}

async function saveProjectCharacteristicsModal(event) {
    event?.preventDefault();

    const selections = collectProjectCharacteristicsSelections();
    if (!validateProjectCharacteristicsSelections(selections)) return;

    if (pendingConferenceCharacteristicsConfirm) {
        pendingProjectCharacteristicsSelections = selections;
        openProjectCharacteristicsThirdPartyBudgetModal();
        return;
    }

    await finalizeProjectCharacteristicsSave(selections, { continueFlow: true });
}

function closeProjectCharacteristicsModal() {
    pendingConferenceCharacteristicsConfirm = null;
    pendingProjectCharacteristicsSelections = null;
    document.getElementById('project-characteristics-modal-third-party-hint')?.classList.add('hidden');
    toggleModal('project-characteristics-third-party-budget-modal', false);
    toggleModal('project-characteristics-modal', false);
    if (typeof setAnteprojetoConferenceActionLoading === 'function') {
        setAnteprojetoConferenceActionLoading(false);
    }
    if (typeof refreshAnteprojetoModalConfirmButton === 'function') {
        refreshAnteprojetoModalConfirmButton();
    }
}

function bindProjectCharacteristicsEvents() {
    document.getElementById('project-characteristics-form')?.addEventListener('submit', saveProjectCharacteristicsModal);
    document.getElementById('btn-project-characteristics-cancel')?.addEventListener('click', closeProjectCharacteristicsModal);
    document.getElementById('btn-project-characteristics-third-party-budget-yes')?.addEventListener('click', async () => {
        await confirmProjectCharacteristicsThirdPartyBudget(true);
    });
    document.getElementById('btn-project-characteristics-third-party-budget-no')?.addEventListener('click', async () => {
        await confirmProjectCharacteristicsThirdPartyBudget(false);
    });
}

window.closeProjectCharacteristicsModal = closeProjectCharacteristicsModal;
window.openProjectCharacteristicsModalForConference = openProjectCharacteristicsModalForConference;
window.fetchOrderProjectCharacteristicsMap = fetchOrderProjectCharacteristicsMap;
window.renderProjectViewCharacteristics = renderProjectViewCharacteristics;
window.loadGestaoProjectCharacteristicsForm = loadGestaoProjectCharacteristicsForm;
window.resetGestaoProjectCharacteristicsForm = resetGestaoProjectCharacteristicsForm;
window.collectGestaoProjectCharacteristicsFormSelection = collectGestaoProjectCharacteristicsFormSelection;
window.validateGestaoProjectCharacteristicsSelection = validateGestaoProjectCharacteristicsSelection;
window.validateAndConfirmGestaoProjectCharacteristicsChanges = validateAndConfirmGestaoProjectCharacteristicsChanges;
window.getGestaoProjectCharacteristicsInitialIds = getGestaoProjectCharacteristicsInitialIds;
window.replaceOrderProjectCharacteristics = replaceOrderProjectCharacteristics;
