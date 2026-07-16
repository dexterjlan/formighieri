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

function syncAnteprojetoApproveProjectDeliveryConstraints() {
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

const ANTEPROJETO_APPROVE_MODAL_OVERLAY = createModalOverlayConfig('anteprojeto-approve-modal', {
    disableElementIds: [
        'btn-anteprojeto-approve-modal-cancel',
        'btn-anteprojeto-approve-modal-submit',
        'anteprojeto-approve-order-delivery'
    ],
    disableFormSelector: '.anteprojeto-approve-project-delivery',
    disableDatasetKey: 'approveModalLoadingDisabled'
});

function setAnteprojetoApproveModalLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(ANTEPROJETO_APPROVE_MODAL_OVERLAY, active, message, status);
}

function closeAnteprojetoApproveDeliveryModal() {
    setAnteprojetoApproveModalLoading(false);
    pendingAnteprojetoApproveConferenceId = null;
    const orderDeliveryEl = document.getElementById('anteprojeto-approve-order-delivery');
    const projectsWrap = document.getElementById('anteprojeto-approve-projects-wrap');
    if (orderDeliveryEl) orderDeliveryEl.value = '';
    if (projectsWrap) projectsWrap.innerHTML = '';
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
        clientName = cachedOrder.clientName || '—';
        clientDeliveryDate = cachedOrder.clientDeliveryDate || '';
    } else if (conference.orderId) {
        const { data } = await supabaseClient
            .from('salesOrders')
            .select('orderCode, clientName, clientDeliveryDate')
            .eq('id', conference.orderId)
            .maybeSingle();

        if (data) {
            orderCode = data.orderCode || '—';
            clientName = data.clientName || '—';
            clientDeliveryDate = data.clientDeliveryDate || '';
        }
    }

    let projects = (conference.conferenceProjects || [])
        .map(entry => ({
            id: Number(entry.orderProjectId),
            name: entry.orderProject?.name || 'Projeto',
            deliveryDate: entry.orderProject?.deliveryDate || null
        }))
        .filter(project => project.id);

    const missingDeliveryIds = projects
        .filter(project => !project.deliveryDate)
        .map(project => project.id);

    if (missingDeliveryIds.length) {
        const { data: projectRows, error } = await supabaseClient
            .from('OrderProject')
            .select('id, name, deliveryDate')
            .in('id', missingDeliveryIds);

        if (!error && projectRows?.length) {
            const projectById = Object.fromEntries(projectRows.map(row => [Number(row.id), row]));
            projects = projects.map(project => ({
                ...project,
                name: projectById[project.id]?.name || project.name,
                deliveryDate: project.deliveryDate || projectById[project.id]?.deliveryDate || null
            }));
        }
    }

    projects.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

    return {
        orderCode,
        clientName,
        clientDeliveryDate,
        projects
    };
}

function renderAnteprojetoApproveProjectsFields(projects = []) {
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

async function showAnteprojetoApproveDeliveryModal(conferenceId) {
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

    if (!canApproveAnteprojetoConference(conference)) {
        alertAppDialog('Somente o gestor comercial pode aprovar a conferência.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    activeOrderId = conference.orderId || activeOrderId;
    pendingAnteprojetoApproveConferenceId = normalizedId;

    const context = await fetchAnteprojetoApprovalDeliveryContext(conference);
    const contextEl = document.getElementById('anteprojeto-approve-modal-context');
    if (contextEl) {
        contextEl.textContent = `Pedido ${context.orderCode} — ${context.clientName}. Confirme a data de entrega do pedido e dos projetos antes de aprovar.`;
    }

    const orderDeliveryEl = document.getElementById('anteprojeto-approve-order-delivery');
    if (orderDeliveryEl) {
        orderDeliveryEl.value = toGestaoInputDate(context.clientDeliveryDate);
    }

    renderAnteprojetoApproveProjectsFields(context.projects);
    syncAnteprojetoApproveProjectDeliveryConstraints();

    toggleModal('anteprojeto-approve-modal', true);
    orderDeliveryEl?.focus();
}

function collectAnteprojetoApproveDeliverySelections() {
    const orderDeliveryDate = document.getElementById('anteprojeto-approve-order-delivery')?.value || '';
    const projectDeliveries = [...document.querySelectorAll('.anteprojeto-approve-project-delivery')]
        .map(input => ({
            projectId: Number(input.dataset.projectId),
            deliveryDate: input.value || ''
        }))
        .filter(item => item.projectId);

    return { orderDeliveryDate, projectDeliveries };
}

function validateAnteprojetoApproveDeliverySelections(selections) {
    if (!selections.orderDeliveryDate) {
        alertAppDialog('Informe a data de entrega do pedido.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    if (!selections.projectDeliveries.length) {
        alertAppDialog('Nenhum projeto encontrado para aprovar.', { variant: 'warning', title: 'Aviso' });
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

async function saveAnteprojetoApprovalDeliveryDates(conference, selections) {
    const now = new Date().toISOString();
    const orderId = Number(conference.orderId);

    let orderPayload = {
        clientDeliveryDate: selections.orderDeliveryDate,
        updatedAt: now,
        updatedById: currentUser.id
    };

    let { error: orderError } = await supabaseClient
        .from('salesOrders')
        .update(orderPayload)
        .eq('id', orderId);

    if (orderError?.message?.includes('clientDeliveryDate')) {
        orderPayload = {
            clientDeliveryDate: selections.orderDeliveryDate
        };
        ({ error: orderError } = await supabaseClient
            .from('salesOrders')
            .update(orderPayload)
            .eq('id', orderId));
    }

    if (orderError) throw orderError;

    if (typeof ordersCache !== 'undefined') {
        const cacheIndex = ordersCache.findIndex(order => Number(order.id) === orderId);
        if (cacheIndex >= 0) {
            ordersCache[cacheIndex] = {
                ...ordersCache[cacheIndex],
                clientDeliveryDate: selections.orderDeliveryDate
            };
        }
    }

    if (typeof activeOrderId !== 'undefined' && Number(activeOrderId) === orderId) {
        const detDelivery = document.getElementById('det-delivery');
        if (detDelivery && typeof formatOrderDeliverySummary === 'function') {
            detDelivery.innerText = formatOrderDeliverySummary(orderId, selections.orderDeliveryDate);
        }
    }

    await Promise.all(selections.projectDeliveries.map(async project => {
        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                deliveryDate: project.deliveryDate,
                updatedAt: now,
                updatedById: currentUser.id
            })
            .eq('id', project.projectId);

        if (error) throw error;
    }));
}

async function submitAnteprojetoApproveDeliveryModal() {
    const conferenceId = pendingAnteprojetoApproveConferenceId;
    if (!conferenceId) return;

    const conference = anteprojetoConferencesCache.find(item => Number(item.id) === Number(conferenceId));
    if (!conference) {
        alertAppDialog('Conferência não encontrada.');
        closeAnteprojetoApproveDeliveryModal();
        return;
    }

    const selections = collectAnteprojetoApproveDeliverySelections();
    if (!validateAnteprojetoApproveDeliverySelections(selections)) return;

    try {
        setAnteprojetoApproveModalLoading(true, 'Salvando datas de entrega...');
        await saveAnteprojetoApprovalDeliveryDates(conference, selections);

        closeAnteprojetoApproveDeliveryModal();
        await approveAnteprojetoConference(conferenceId);
    } catch (error) {
        setAnteprojetoApproveModalLoading(true, `Erro ao salvar datas: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setAnteprojetoApproveModalLoading(false);
    }
}

async function approveAnteprojetoConference(conferenceId) {
    const conference = anteprojetoConferencesCache.find(c => c.id === conferenceId);
    if (!conference) return;

    if (!canApproveAnteprojetoConference(conference)) {
        alertAppDialog('Somente Admin com flag Gestor comercial pode aprovar a conferência.', { variant: 'warning', title: 'Aviso' });
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
