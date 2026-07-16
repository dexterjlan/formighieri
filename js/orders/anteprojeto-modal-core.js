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

const ANTEPROJETO_RETURN_MODAL_OVERLAY = createModalOverlayConfig('anteprojeto-return-modal', {
    disableElementIds: [
        'btn-anteprojeto-return-modal-submit',
        'btn-anteprojeto-return-modal-cancel',
        'anteprojeto-return-modal-observation'
    ]
});

const ANTEPROJETO_TAB_ACTION_OVERLAY = createModalOverlayConfig('anteprojeto-tab-action');

function setAnteprojetoReturnModalLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(ANTEPROJETO_RETURN_MODAL_OVERLAY, active, message, status);
}

function isAnteprojetoTabVisible() {
    const panel = document.getElementById('order-tab-panel-anteprojeto');
    return Boolean(panel && !panel.classList.contains('hidden'));
}

function setAnteprojetoTabActionLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(ANTEPROJETO_TAB_ACTION_OVERLAY, active, message, status);
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

function scrollAnteprojetoModalToTop() {
    const scrollContainer = document.getElementById('anteprojeto-modal')?.querySelector(':scope > div');
    if (!scrollContainer) return;
    scrollContainer.scrollTop = 0;
}

const ANTEPROJETO_MODAL_OVERLAY = createModalOverlayConfig('anteprojeto-modal', {
    disableElementIds: [
        'anteprojeto-form-submit',
        'btn-add-anteprojeto-project',
        'btn-anteprojeto-modal-confirm',
        'btn-anteprojeto-modal-approve',
        'btn-anteprojeto-modal-return'
    ],
    reenableElementIdsOnHide: ['anteprojeto-form-submit'],
    closeButtonSelector: '#anteprojeto-modal button[onclick="closeAnteprojetoModal()"]',
    disableFormSelector: '#anteprojeto-modal input:not([disabled]), #anteprojeto-modal textarea:not([disabled]), #anteprojeto-modal select:not([disabled])',
    disableDatasetKey: 'anteprojetoLoadingDisabled',
    onShow: scrollAnteprojetoModalToTop
});

function setAnteprojetoModalLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(ANTEPROJETO_MODAL_OVERLAY, active, message, status);
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
    await showAnteprojetoApproveDeliveryModal(conferenceId);
}

window.confirmAnteprojetoConference = confirmAnteprojetoConference;
window.confirmAnteprojetoConferenceFromModal = confirmAnteprojetoConferenceFromModal;
window.confirmAnteprojetoConferenceFromPendencias = confirmAnteprojetoConferenceFromPendencias;
window.fetchAnteprojetoConferenceById = fetchAnteprojetoConferenceById;
