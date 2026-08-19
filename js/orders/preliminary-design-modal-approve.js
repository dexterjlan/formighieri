let anteprojetoApproveDeliveryContext = null;

function getAnteprojetoMaxProjectDeliveryDate(orderDeliveryDate) {
    if (!orderDeliveryDate) return '';
    const [year, month, day] = orderDeliveryDate.split('-').map(Number);
    if (!year || !month || !day) return '';

    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() - 1);

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function anteprojetoApproveOrderHasPhases(phases = anteprojetoApproveDeliveryContext?.phases) {
    return (phases || []).length >= 2;
}

function resolveAnteprojetoApproveProjectPhase(project, phases) {
    if (typeof getGestaoProjectDeliveryPhase === 'function') {
        return getGestaoProjectDeliveryPhase(project, phases);
    }

    const phaseId = Number(project?.deliveryPhaseId);
    if (phaseId) {
        const phase = (phases || []).find(item => Number(item.id) === phaseId);
        if (phase) return phase;
    }

    return phases?.[0] || null;
}

function groupAnteprojetoApproveProjectsByPhase(projects = [], phases = []) {
    const byPhaseId = new Map();

    for (const project of projects) {
        const phase = resolveAnteprojetoApproveProjectPhase(project, phases);
        if (!phase) continue;

        const phaseId = Number(phase.id);
        if (!byPhaseId.has(phaseId)) {
            byPhaseId.set(phaseId, { phase, projects: [] });
        }
        byPhaseId.get(phaseId).projects.push(project);
    }

    return (phases || [])
        .filter(phase => byPhaseId.has(Number(phase.id)))
        .map(phase => byPhaseId.get(Number(phase.id)));
}

function resolveAnteprojetoApproveProjectDeliveryDate(project, phaseDeliveryDate) {
    const existingDate = toGestaoInputDate(project?.deliveryDate);
    if (existingDate && isProjectTechnicalDeliveryBeforeOrderDelivery(existingDate, phaseDeliveryDate)) {
        return existingDate;
    }

    return getAnteprojetoMaxProjectDeliveryDate(phaseDeliveryDate);
}

function syncAnteprojetoApproveProjectDeliveryConstraints() {
    if (anteprojetoApproveOrderHasPhases()) return;

    const orderDelivery = document.getElementById('anteprojeto-approve-order-delivery')?.value || '';
    const maxDate = getAnteprojetoMaxProjectDeliveryDate(orderDelivery);

    document.querySelectorAll('.anteprojeto-approve-project-delivery').forEach(input => {
        if (maxDate) {
            input.max = maxDate;
        } else {
            input.removeAttribute('max');
        }
    });
}

function syncAnteprojetoApprovePhaseDeliveryInputs(changedInput) {
    const phaseId = changedInput?.dataset?.phaseId;
    if (!phaseId) return;

    document.querySelectorAll(`.anteprojeto-approve-phase-delivery[data-phase-id="${phaseId}"]`).forEach(input => {
        if (input !== changedInput) input.value = changedInput.value;
    });
}

function syncAnteprojetoApproveDeliveryUi(hasPhases = anteprojetoApproveOrderHasPhases()) {
    const orderDeliveryWrap = document.getElementById('anteprojeto-approve-order-delivery-wrap');
    const orderDeliveryEl = document.getElementById('anteprojeto-approve-order-delivery');
    const projectsLabel = document.getElementById('anteprojeto-approve-projects-label');
    const footnote = document.getElementById('anteprojeto-approve-delivery-footnote');

    orderDeliveryWrap?.classList.toggle('hidden', hasPhases);
    if (orderDeliveryEl) {
        orderDeliveryEl.required = !hasPhases;
    }

    if (projectsLabel) {
        projectsLabel.textContent = hasPhases
            ? 'Projetos por fase de entrega'
            : 'Datas de entrega dos projetos';
    }

    if (footnote) {
        footnote.textContent = hasPhases
            ? 'Confirme ou altere a data de entrega de cada fase. A data de entrega do pedido será a mais tardia entre as fases.'
            : 'A data de entrega do projeto técnico deve ser anterior à data de entrega do pedido.';
    }
}

const ANTEPROJETO_APPROVE_MODAL_OVERLAY = createModalOverlayConfig('anteprojeto-approve-modal', {
    disableElementIds: [
        'btn-anteprojeto-approve-modal-cancel',
        'btn-anteprojeto-approve-modal-submit',
        'anteprojeto-approve-order-delivery',
        'anteprojeto-approve-conference-path'
    ],
    disableFormSelector: '.anteprojeto-approve-project-delivery, .anteprojeto-approve-phase-delivery',
    disableDatasetKey: 'approveModalLoadingDisabled'
});

function setAnteprojetoApproveModalLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(ANTEPROJETO_APPROVE_MODAL_OVERLAY, active, message, status);
}

function closePreliminaryDesignApproveDeliveryModal() {
    setAnteprojetoApproveModalLoading(false);
    pendingAnteprojetoApproveConferenceId = null;
    anteprojetoApproveDeliveryContext = null;
    const orderDeliveryEl = document.getElementById('anteprojeto-approve-order-delivery');
    const pathEl = document.getElementById('anteprojeto-approve-conference-path');
    const projectsWrap = document.getElementById('anteprojeto-approve-projects-wrap');
    if (orderDeliveryEl) orderDeliveryEl.value = '';
    if (pathEl) pathEl.value = '';
    if (projectsWrap) projectsWrap.innerHTML = '';
    syncAnteprojetoApproveDeliveryUi(false);
    toggleModal('anteprojeto-approve-modal', false);
}

async function fetchAnteprojetoApprovalDeliveryContext(conference) {
    const projectIds = getConferenceOrderProjectIds(conference);
    let orderCode = '—';
    let clientName = '—';
    let clientDeliveryDate = '';

    const cachedOrder = typeof ordersCache !== 'undefined'
        ? ordersCache.find(order => Number(order.id) === Number(conference.orderId))
        : null;

    if (cachedOrder) {
        orderCode = cachedOrder.orderCode || '—';
        clientName = getOrderClientName(cachedOrder) || '—';
        clientDeliveryDate = cachedOrder.clientDeliveryDate || '';
    } else if (conference.orderId) {
        const { data } = await supabaseClient
            .from('salesOrders')
            .select('orderCode, clientDeliveryDate, client:Client(name)')
            .eq('id', conference.orderId)
            .maybeSingle();

        if (data) {
            orderCode = data.orderCode || '—';
            clientName = getOrderClientName(data) || '—';
            clientDeliveryDate = data.clientDeliveryDate || '';
        }
    }

    let projects = (conference.conferenceProjects || [])
        .map(entry => ({
            id: Number(entry.orderProjectId),
            name: entry.orderProject?.name || 'Projeto',
            deliveryDate: entry.orderProject?.deliveryDate || null,
            deliveryPhaseId: entry.orderProject?.deliveryPhaseId ?? null,
            approvalNetworkPath: entry.orderProject?.approvalNetworkPath || ''
        }))
        .filter(project => project.id);

    const missingIds = projects.map(project => project.id);

    if (missingIds.length) {
        let result = await supabaseClient
            .from('OrderProject')
            .select('id, name, deliveryDate, deliveryPhaseId, approvalNetworkPath')
            .in('id', missingIds);

        if (result.error?.message?.includes('approvalNetworkPath')
            || result.error?.message?.includes('deliveryPhaseId')) {
            result = await supabaseClient
                .from('OrderProject')
                .select('id, name, deliveryDate, deliveryPhaseId')
                .in('id', missingIds);

            if (result.error?.message?.includes('deliveryPhaseId')) {
                result = await supabaseClient
                    .from('OrderProject')
                    .select('id, name, deliveryDate')
                    .in('id', missingIds);
            }
        }

        if (!result.error && result.data?.length) {
            const projectById = Object.fromEntries(result.data.map(row => [Number(row.id), row]));
            projects = projects.map(project => ({
                ...project,
                name: projectById[project.id]?.name || project.name,
                deliveryDate: project.deliveryDate || projectById[project.id]?.deliveryDate || null,
                deliveryPhaseId: project.deliveryPhaseId ?? projectById[project.id]?.deliveryPhaseId ?? null,
                approvalNetworkPath: project.approvalNetworkPath || projectById[project.id]?.approvalNetworkPath || ''
            }));
        }
    }

    projects.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

    let phases = [];
    if (conference.orderId && typeof fetchGestaoOrderPhases === 'function') {
        phases = await fetchGestaoOrderPhases(conference.orderId);
    }

    const hasPhases = phases.length >= 2;

    return {
        orderCode,
        clientName,
        clientDeliveryDate,
        projects,
        phases,
        hasPhases
    };
}

function renderAnteprojetoApproveProjectsFieldsFlat(projects = []) {
    const wrap = document.getElementById('anteprojeto-approve-projects-wrap');
    if (!wrap) return;

    if (!projects.length) {
        wrap.innerHTML = '<p class="text-xs text-slate-400">Nenhum projeto na conferência.</p>';
        return;
    }

    wrap.innerHTML = projects.map(project => `
        <div class="border border-slate-200 rounded-lg p-3 bg-slate-50/40" data-project-id="${project.id}">
            <div class="text-xs font-semibold text-slate-800 mb-2">${escapeHtml(project.name)}</div>
            <label class="block text-[11px] font-semibold text-slate-500 mb-1" for="anteprojeto-approve-project-${project.id}">
                Data de entrega do projeto <span class="text-red-500">*</span>
            </label>
            <input type="date" id="anteprojeto-approve-project-${project.id}" required
                class="anteprojeto-approve-project-delivery w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                data-project-id="${project.id}"
                value="${escapeHtml(toGestaoInputDate(project.deliveryDate))}">
        </div>
    `).join('');
}

function renderAnteprojetoApproveProjectsFieldsPhased(projects = [], phases = []) {
    const wrap = document.getElementById('anteprojeto-approve-projects-wrap');
    if (!wrap) return;

    const groups = groupAnteprojetoApproveProjectsByPhase(projects, phases);
    if (!groups.length) {
        wrap.innerHTML = '<p class="text-xs text-slate-400">Nenhum projeto na conferência.</p>';
        return;
    }

    wrap.innerHTML = groups.map(({ phase, projects: phaseProjects }) => `
        <div class="border border-slate-200 rounded-lg overflow-hidden bg-white" data-phase-id="${phase.id}">
            ${phaseProjects.map((project, index) => `
                <div class="flex items-center justify-between gap-3 px-3 py-2.5 ${index < phaseProjects.length - 1 ? 'border-b border-slate-100' : ''}" data-project-id="${project.id}">
                    <div class="text-xs font-semibold text-slate-800 min-w-0 truncate">${escapeHtml(project.name)}</div>
                    <div class="flex items-center gap-2 shrink-0 text-right">
                        <span class="text-[11px] font-medium text-slate-500 whitespace-nowrap">${escapeHtml(phase.name || 'Fase')}</span>
                        ${index === 0 ? `
                            <input type="date"
                                id="anteprojeto-approve-phase-${phase.id}"
                                class="anteprojeto-approve-phase-delivery w-[9.5rem] px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                data-phase-id="${phase.id}"
                                required
                                value="${escapeHtml(toGestaoInputDate(phase.deliveryDate))}">
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');

    wrap.querySelectorAll('.anteprojeto-approve-phase-delivery').forEach(input => {
        input.addEventListener('change', () => syncAnteprojetoApprovePhaseDeliveryInputs(input));
        input.addEventListener('input', () => syncAnteprojetoApprovePhaseDeliveryInputs(input));
    });
}

function renderAnteprojetoApproveProjectsFields(projects = [], options = {}) {
    if (options.hasPhases) {
        renderAnteprojetoApproveProjectsFieldsPhased(projects, options.phases || []);
        return;
    }

    renderAnteprojetoApproveProjectsFieldsFlat(projects);
}

async function showPreliminaryDesignApproveDeliveryModal(conferenceId) {
    const normalizedId = Number(conferenceId);
    if (!normalizedId) return;

    let conference = anteprojetoConferencesCache.find(item => Number(item.id) === normalizedId);
    if (!conference && typeof fetchPreliminaryDesignConferenceById === 'function') {
        conference = await fetchPreliminaryDesignConferenceById(normalizedId);
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

    if (!canApproveAnteprojetoConference(conference)) {
        alertAppDialog('Somente o gestor comercial ou admin pode aprovar a conferência.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    activeOrderId = conference.orderId || activeOrderId;
    pendingAnteprojetoApproveConferenceId = normalizedId;

    const context = await fetchAnteprojetoApprovalDeliveryContext(conference);
    anteprojetoApproveDeliveryContext = context;

    const contextEl = document.getElementById('anteprojeto-approve-modal-context');
    if (contextEl) {
        contextEl.textContent = context.hasPhases
            ? `Pedido ${context.orderCode} — ${context.clientName}. Confirme a pasta da conferência e as datas de entrega de cada fase antes de aprovar.`
            : `Pedido ${context.orderCode} — ${context.clientName}. Confirme a data de entrega do pedido, o endereço da pasta e a data de entrega dos projetos antes de aprovar.`;
    }

    const orderDeliveryEl = document.getElementById('anteprojeto-approve-order-delivery');
    if (orderDeliveryEl) {
        orderDeliveryEl.value = toGestaoInputDate(context.clientDeliveryDate);
    }

    const pathEl = document.getElementById('anteprojeto-approve-conference-path');
    if (pathEl) {
        pathEl.value = conference.networkPath || '';
    }

    syncAnteprojetoApproveDeliveryUi(context.hasPhases);
    renderAnteprojetoApproveProjectsFields(context.projects, {
        hasPhases: context.hasPhases,
        phases: context.phases
    });
    syncAnteprojetoApproveProjectDeliveryConstraints();

    toggleModal('anteprojeto-approve-modal', true);
    (context.hasPhases ? pathEl : orderDeliveryEl)?.focus();
}

function collectAnteprojetoApproveDeliverySelections() {
    const conferencePath = document.getElementById('anteprojeto-approve-conference-path')?.value?.trim() || '';
    const hasPhases = anteprojetoApproveOrderHasPhases();
    const context = anteprojetoApproveDeliveryContext || { projects: [], phases: [] };

    if (hasPhases) {
        const phaseDeliveries = [...new Map(
            [...document.querySelectorAll('.anteprojeto-approve-phase-delivery')]
                .map(input => [Number(input.dataset.phaseId), {
                    phaseId: Number(input.dataset.phaseId),
                    deliveryDate: input.value || ''
                }])
                .filter(([, item]) => item.phaseId)
        ).values()];

        const phaseDateById = Object.fromEntries(
            phaseDeliveries.map(item => [item.phaseId, item.deliveryDate])
        );

        const projectDeliveries = (context.projects || []).map(project => {
            const phase = resolveAnteprojetoApproveProjectPhase(project, context.phases);
            const phaseDeliveryDate = phaseDateById[Number(phase?.id)] || '';
            return {
                projectId: Number(project.id),
                deliveryDate: resolveAnteprojetoApproveProjectDeliveryDate(project, phaseDeliveryDate),
                phaseId: Number(phase?.id) || null,
                phaseDeliveryDate
            };
        }).filter(item => item.projectId);

        const orderDeliveryDate = pickLatestIsoDate(...phaseDeliveries.map(item => item.deliveryDate));

        return {
            hasPhases: true,
            orderDeliveryDate,
            conferencePath,
            phaseDeliveries,
            projectDeliveries
        };
    }

    const orderDeliveryDate = document.getElementById('anteprojeto-approve-order-delivery')?.value || '';
    const projectDeliveries = [...document.querySelectorAll('.anteprojeto-approve-project-delivery')]
        .map(input => ({
            projectId: Number(input.dataset.projectId),
            deliveryDate: input.value || ''
        }))
        .filter(item => item.projectId);

    return {
        hasPhases: false,
        orderDeliveryDate,
        conferencePath,
        phaseDeliveries: [],
        projectDeliveries
    };
}

function validateAnteprojetoApproveDeliverySelections(selections) {
    if (!selections.conferencePath) {
        alertAppDialog('Informe a pasta / endereço da rede da conferência.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    if (!selections.projectDeliveries.length) {
        alertAppDialog('Nenhum projeto encontrado para aprovar.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    if (selections.hasPhases) {
        if (!selections.phaseDeliveries.length) {
            alertAppDialog('Informe a data de entrega de todas as fases da conferência.', { variant: 'warning', title: 'Aviso' });
            return false;
        }

        for (const phase of selections.phaseDeliveries) {
            if (!phase.deliveryDate) {
                alertAppDialog('Informe a data de entrega de todas as fases da conferência.', { variant: 'warning', title: 'Aviso' });
                return false;
            }
        }

        for (const project of selections.projectDeliveries) {
            if (!project.deliveryDate) {
                alertAppDialog('Não foi possível definir a data de entrega técnica de todos os projetos.', { variant: 'warning', title: 'Aviso' });
                return false;
            }

            if (!isProjectTechnicalDeliveryBeforeOrderDelivery(project.deliveryDate, project.phaseDeliveryDate)) {
                alertAppDialog('A data de entrega do projeto técnico deve ser anterior à data de entrega da fase.', { variant: 'warning', title: 'Aviso' });
                return false;
            }
        }

        return true;
    }

    if (!selections.orderDeliveryDate) {
        alertAppDialog('Informe a data de entrega do pedido.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    for (const project of selections.projectDeliveries) {
        if (!project.deliveryDate) {
            alertAppDialog('Informe a data de entrega de todos os projetos da conferência.', { variant: 'warning', title: 'Aviso' });
            return false;
        }

        if (!isProjectTechnicalDeliveryBeforeOrderDelivery(project.deliveryDate, selections.orderDeliveryDate)) {
            alertAppDialog('A data de entrega do projeto técnico deve ser anterior à data de entrega do pedido.', { variant: 'warning', title: 'Aviso' });
            return false;
        }
    }

    return true;
}

async function persistAnteprojetoApprovalPhaseDeliveryDates(orderId, phaseDeliveries = []) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId || !phaseDeliveries.length) return;

    const now = new Date().toISOString();

    await Promise.all(phaseDeliveries.map(async phase => {
        const { error } = await supabaseClient
            .from('OrderDeliveryPhase')
            .update({
                deliveryDate: phase.deliveryDate,
                updatedAt: now
            })
            .eq('id', phase.phaseId)
            .eq('orderId', normalizedOrderId);

        if (error) throw error;
    }));
}

async function saveAnteprojetoApprovalDeliveryDates(conference, selections) {
    const orderId = Number(conference.orderId);

    if (selections.hasPhases) {
        await persistAnteprojetoApprovalPhaseDeliveryDates(orderId, selections.phaseDeliveries);
    }

    if (selections.orderDeliveryDate) {
        await persistSalesOrderClientDeliveryDate(orderId, selections.orderDeliveryDate);
    }

    const now = new Date().toISOString();

    // Salvar o novo caminho da rede na nova coluna networkPath da AnteprojetoConference
    // sem alterar a coluna sketchUpPath original informada pelo conferente.
    let { error: conferencePathError } = await supabaseClient
        .from('PreliminaryDesignConference')
        .update({
            networkPath: selections.conferencePath,
            updatedAt: now,
            updatedById: currentUser.id
        })
        .eq('id', conference.id);

    if (conferencePathError?.message?.includes('networkPath')) {
        ({ error: conferencePathError } = await supabaseClient
            .from('PreliminaryDesignConference')
            .update({
                networkPath: selections.conferencePath
            })
            .eq('id', conference.id));
    }

    if (conferencePathError) {
        console.warn('Erro ao salvar networkPath na PreliminaryDesignConference (verifique se a migração SQL foi executada):', conferencePathError);
    }

    // Atualizar no objeto da conferência em memória
    conference.networkPath = selections.conferencePath;

    // Replicar o networkPath da conferência e deliveryDate nos projetos.
    await Promise.all(selections.projectDeliveries.map(async project => {
        let updatePayload = {
            deliveryDate: project.deliveryDate,
            conferenceNetworkPath: selections.conferencePath,
            updatedAt: now,
            updatedById: currentUser.id
        };

        let { error } = await supabaseClient
            .from('OrderProject')
            .update(updatePayload)
            .eq('id', project.projectId);

        if (error?.message?.includes('conferenceNetworkPath')) {
            updatePayload = {
                deliveryDate: project.deliveryDate,
                approvalNetworkPath: selections.conferencePath,
                updatedAt: now,
                updatedById: currentUser.id
            };
            ({ error } = await supabaseClient
                .from('OrderProject')
                .update(updatePayload)
                .eq('id', project.projectId));
        }

        if (error?.message?.includes('approvalNetworkPath')) {
            updatePayload = {
                deliveryDate: project.deliveryDate,
                updatedAt: now,
                updatedById: currentUser.id
            };
            ({ error } = await supabaseClient
                .from('OrderProject')
                .update(updatePayload)
                .eq('id', project.projectId));
        }

        if (error) throw error;
    }));

    if (selections.hasPhases && typeof fetchGestaoOrderPhases === 'function' && orderId) {
        const refreshedPhases = await fetchGestaoOrderPhases(orderId);
        if (typeof orderPhasesByOrderId !== 'undefined') {
            orderPhasesByOrderId[orderId] = refreshedPhases;
        }
    }
}

async function submitAnteprojetoApproveDeliveryModal() {
    const conferenceId = pendingAnteprojetoApproveConferenceId;
    if (!conferenceId) return;

    const conference = anteprojetoConferencesCache.find(item => Number(item.id) === Number(conferenceId));
    if (!conference) {
        alertAppDialog('Conferência não encontrada.');
        closePreliminaryDesignApproveDeliveryModal();
        return;
    }

    const selections = collectAnteprojetoApproveDeliverySelections();
    if (!validateAnteprojetoApproveDeliverySelections(selections)) return;

    try {
        setAnteprojetoApproveModalLoading(true, 'Salvando datas de entrega e pasta...');
        await saveAnteprojetoApprovalDeliveryDates(conference, selections);

        closePreliminaryDesignApproveDeliveryModal();
        await approvePreliminaryDesignConference(conferenceId);
    } catch (error) {
        setAnteprojetoApproveModalLoading(true, `Erro ao salvar dados: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setAnteprojetoApproveModalLoading(false);
    }
}

async function approvePreliminaryDesignConference(conferenceId) {
    const conference = anteprojetoConferencesCache.find(c => c.id === conferenceId);
    if (!conference) return;

    if (!canApproveAnteprojetoConference(conference)) {
        alertAppDialog('Somente o gestor comercial ou admin pode aprovar a conferência.', { variant: 'warning', title: 'Aviso' });
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
            .from('PreliminaryDesignConference')
            .update(updatePayload)
            .eq('id', conferenceId);

        if (conferenceError?.message?.includes('approvedAt') || conferenceError?.message?.includes('Aprovada')) {
            updatePayload = {
                status: 'Aprovada',
                updatedAt: now,
                updatedById: currentUser.id
            };
            ({ error: conferenceError } = await supabaseClient
                .from('PreliminaryDesignConference')
                .update(updatePayload)
                .eq('id', conferenceId));
        }

        if (conferenceError) throw conferenceError;

        if (typeof createConferenceOrderRequestsFromApproval === 'function') {
            setAnteprojetoConferenceActionLoading(true, 'Criando requisições da conferência...');
            await createConferenceOrderRequestsFromApproval(conference, currentUser.id);
        }

        let thirdPartyCreationResult = { created: [] };
        if (typeof createThirdPartyProjectsForConferenceApproval === 'function') {
            setAnteprojetoConferenceActionLoading(true, 'Criando projetos de terceiros...');
            try {
                thirdPartyCreationResult = await createThirdPartyProjectsForConferenceApproval(conference);
            } catch (creationError) {
                console.error('createThirdPartyProjectsForConferenceApproval:', creationError);
                alertAppDialog(
                    'Conferência aprovada, mas houve erro ao criar projetos de terceiros: ' + creationError.message,
                    { variant: 'warning', title: 'Aviso' }
                );
            }
        }

        if (typeof notifyConferenciaAprovadaEmail === 'function') {
            setAnteprojetoConferenceActionLoading(true, 'Enviando e-mail de notificação...');
            await notifyConferenciaAprovadaEmail({
                orderId: conference.orderId,
                orderProjectIds: getConferenceOrderProjectIds(conference),
                networkPath: conference?.networkPath || ''
            });
        }

        setAnteprojetoConferenceActionLoading(true, 'Atualizando telas...');
        await refreshViewsAfterAnteprojetoApproval();

        setAnteprojetoConferenceActionLoading(true, 'Conferência aprovada!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));

        if (thirdPartyCreationResult.created?.length
            && typeof showThirdPartyProjectsCreatedModal === 'function') {
            showThirdPartyProjectsCreatedModal(thirdPartyCreationResult.created);
        }

        if (isAnteprojetoModalVisible()) {
            closePreliminaryDesignModal();
        }

        setAnteprojetoConferenceActionLoading(false);
    } catch (error) {
        setAnteprojetoConferenceActionLoading(true, `Erro ao aprovar conferência: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setAnteprojetoConferenceActionLoading(false);
    }
}
