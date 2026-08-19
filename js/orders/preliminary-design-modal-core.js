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
        .select('id, name, isConferenceReviewer')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .eq('isConferenceReviewer', true)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('isConferenceReviewer')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .eq('role', 'Projetista')
            .eq('isActive', true)
            .order('name', { ascending: true });
    }

    let designers = (result.data || []).filter(user => user.isConferenceReviewer !== false);

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
        submitBtn.textContent = conference && !isAnteprojetoConferenceDraft(conference)
            ? 'Salvar Conferência'
            : 'Salvar';
    }

    updateAnteprojetoModalSendControls(conference);
}

function areAllAnteprojetoModalObservationsReady() {
    const items = document.querySelectorAll('#anteprojeto-projects-structure .module-observation-item');
    if (!items.length) return false;

    const observations = Array.from(items).map(item => {
        const disposition = item.querySelector('.anteprojeto-observation-disposition:checked')?.value || null;
        return {
            consultantDisposition: disposition,
            consultantChecked: disposition === ANTEPROJETO_DISPOSITION_OK,
            consultantResponse: item.querySelector('.anteprojeto-observation-response')?.value.trim() || ''
        };
    });

    return validateConsultorObservationDispositions(observations).valid;
}

function refreshPreliminaryDesignModalConfirmButton() {
    const btn = document.getElementById('btn-anteprojeto-modal-confirm');
    if (!btn) return;

    const allReady = areAllAnteprojetoModalObservationsReady();
    btn.disabled = !allReady;
    btn.classList.toggle('bg-emerald-700', allReady);
    btn.classList.toggle('text-white', allReady);
    btn.classList.toggle('hover:bg-emerald-800', allReady);
    btn.classList.toggle('bg-slate-200', !allReady);
    btn.classList.toggle('text-slate-500', !allReady);
    btn.classList.toggle('cursor-not-allowed', !allReady);
}

function updateAnteprojetoModalSendControls(conference) {
    const sendBtn = document.getElementById('btn-anteprojeto-modal-send');
    if (!sendBtn) return;
    const show = canSendAnteprojetoConference(conference);
    sendBtn.classList.toggle('hidden', !show);
    sendBtn.disabled = !show;
}

function updateAnteprojetoModalConfirmControls(conference) {
    const wrap = document.getElementById('anteprojeto-modal-confirm-wrap');
    if (!wrap) return;

    const show = Boolean(conference && canConfirmAnteprojetoConference(conference));
    wrap.classList.toggle('hidden', !show);
    if (show) {
        refreshPreliminaryDesignModalConfirmButton();
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
    conferenceProjects:PreliminaryDesignConferenceProject(
        *,
        orderProject:OrderProject(id, name, statusId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)),
        modules:PreliminaryDesignModule(
            *,
            observations:PreliminaryDesignModuleObservation(
                *,
                observation:PreliminaryDesignObservation(id, text)
            )
        )
    )
`;

const ANTEPROJETO_CONFERENCE_SELECT_FALLBACK = `
    *,
    conferenceProjects:PreliminaryDesignConferenceProject(
        *,
        modules:PreliminaryDesignModule(*)
    )
`;

async function fetchPreliminaryDesignConferenceById(conferenceId) {
    const normalizedId = Number(conferenceId);
    if (!normalizedId) return null;

    let result = await supabaseClient
        .from('PreliminaryDesignConference')
        .select(ANTEPROJETO_CONFERENCE_SELECT)
        .eq('id', normalizedId)
        .maybeSingle();

    if (result.error?.message?.includes('PreliminaryDesignConferenceProject')) {
        result = await supabaseClient
            .from('PreliminaryDesignConference')
            .select(ANTEPROJETO_CONFERENCE_SELECT_FALLBACK)
            .eq('id', normalizedId)
            .maybeSingle();
    }

    if (result.error || !result.data) {
        console.error('fetchPreliminaryDesignConferenceById:', result.error);
        return null;
    }

    let conferences = await attachModuleObservationsToConferences([result.data]);
    conferences = await enrichAnteprojetoConferences(conferences, result.data.orderId);
    return conferences[0] || null;
}

async function openPreliminaryDesignConferenceFromPendencias(conferenceId) {
    const conference = await fetchPreliminaryDesignConferenceById(conferenceId);
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

    await openPreliminaryDesignModal(conference.id);
    updateAnteprojetoModalConfirmControls(conference);
    updateAnteprojetoModalApproveControls(conference);
}

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
            clientName = getOrderClientName(cached) || '—';
            consultantName = getOrderConsultantNameFromRecord(cached) || '—';
        } else {
            const { data, error } = await supabaseClient
                .from('salesOrders')
                .select(`orderCode, ${SALES_ORDER_RELATIONS_SELECT}`)
                .eq('id', orderId)
                .maybeSingle();

            if (!error && data) {
                orderCode = data.orderCode || '—';
                clientName = getOrderClientName(data) || '—';
                consultantName = getOrderConsultantNameFromRecord(data) || '—';
            }
        }
    }

    orderLineEl.textContent = orderCode !== '—' || clientName !== '—'
        ? `${orderCode} - ${clientName}`
        : '—';
    consultantEl.textContent = consultantName;
}

async function openPreliminaryDesignModal(conferenceId = null) {
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
        ? anteprojetoConferencesCache.find(c => Number(c.id) === Number(conferenceId))
        : null;

    if (conference && !canViewAnteprojetoConference(conference)) {
        alertAppDialog('Esta conferência ainda não foi enviada.', { variant: 'warning', title: 'Aviso' });
        return;
    }

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

    const managerObservationWrap = document.getElementById('anteprojeto-gestor-observation-wrap');
    const managerObservationEl = document.getElementById('anteprojeto-gestor-observation');
    const btnViewHistory = document.getElementById('btn-anteprojeto-view-history');
    if (btnViewHistory) {
        btnViewHistory.onclick = () => {
            if (conference?.id && typeof openPreliminaryDesignHistoryModal === 'function') {
                openPreliminaryDesignHistoryModal(conference.id);
            }
        };
    }
    if (managerObservationWrap && managerObservationEl) {
        if (conference?.managerObservation) {
            managerObservationEl.value = conference.managerObservation;
            managerObservationWrap.classList.remove('hidden');
        } else {
            managerObservationEl.value = '';
            managerObservationWrap.classList.add('hidden');
        }
    }

    const title = document.getElementById('anteprojeto-modal-title');

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
    updateAnteprojetoModalConfirmControls(conference);
    updateAnteprojetoModalApproveControls(conference);
    await updateAnteprojetoModalOrderContext(conference?.orderId || activeOrderId);
    toggleModal('anteprojeto-modal', true);
}

function closePreliminaryDesignModal() {
    setAnteprojetoModalLoading(false);
    editingAnteprojetoConferenceId = null;
    updateAnteprojetoModalConfirmControls(null);
    updateAnteprojetoModalApproveControls(null);
    toggleModal('anteprojeto-modal', false);
}

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
    if (typeof loadPreliminaryDesignConferences === 'function' && activeOrderId) {
        await loadPreliminaryDesignConferences(activeOrderId);
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
    if (typeof loadOrders === 'function') {
        await loadOrders();
    }
    if (typeof loadPreliminaryDesignConferences === 'function' && activeOrderId) {
        await loadPreliminaryDesignConferences(activeOrderId);
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
    if (typeof loadPreliminaryDesignConferences === 'function' && activeOrderId) {
        await loadPreliminaryDesignConferences(activeOrderId);
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
        'btn-anteprojeto-modal-send',
        'btn-add-anteprojeto-project',
        'btn-anteprojeto-modal-confirm',
        'btn-anteprojeto-modal-approve',
        'btn-anteprojeto-modal-return'
    ],
    reenableElementIdsOnHide: [
        'anteprojeto-form-submit',
        'btn-anteprojeto-modal-send',
        'btn-add-anteprojeto-project',
        'btn-anteprojeto-modal-confirm',
        'btn-anteprojeto-modal-approve',
        'btn-anteprojeto-modal-return'
    ],
    closeButtonSelector: '#anteprojeto-modal button[onclick="closePreliminaryDesignModal()"]',
    disableFormSelector: '#anteprojeto-modal input:not([disabled]), #anteprojeto-modal textarea:not([disabled]), #anteprojeto-modal select:not([disabled])',
    disableDatasetKey: 'anteprojetoLoadingDisabled',
    onShow: scrollAnteprojetoModalToTop
});

function setAnteprojetoModalLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(ANTEPROJETO_MODAL_OVERLAY, active, message, status);
}

async function confirmPreliminaryDesignConference(conferenceId, options = {}) {
    const conference = anteprojetoConferencesCache.find(c => c.id === conferenceId);
    if (!conference) return;

    if (!canConfirmAnteprojetoConference(conference)) {
        alertAppDialog('Somente o consultor do pedido ou Admin podem confirmar a conferência.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const moduleObservations = getConferenceModuleObservations(conference);
    const validation = validateConsultorObservationDispositions(moduleObservations);
    if (!validation.valid) {
        alertAppDialog(validation.message, { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!options.skipCharacteristicsCheck && typeof openProjectCharacteristicsModalForConference === 'function') {
        await openProjectCharacteristicsModalForConference(conference, () =>
            confirmPreliminaryDesignConference(conferenceId, { skipCharacteristicsCheck: true })
        );
        return;
    }

    const now = new Date().toISOString();

    try {
        setAnteprojetoConferenceActionLoading(true, 'Registrando confirmação da conferência...');

        const { error } = await supabaseClient
            .from('PreliminaryDesignConference')
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
        await applyConferenciaRealizadaStatusToProjects(getConferenceOrderProjectIds(conference), {
            conference,
            orderId: conference.orderId
        });

        setAnteprojetoConferenceActionLoading(true, 'Atualizando telas...');
        await refreshViewsAfterAnteprojetoConfirmation();

        setAnteprojetoConferenceActionLoading(true, 'Conferência confirmada!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));

        if (isAnteprojetoModalVisible()) {
            closePreliminaryDesignModal();
        }

        setAnteprojetoConferenceActionLoading(false);
    } catch (error) {
        setAnteprojetoConferenceActionLoading(true, `Erro ao confirmar conferência: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setAnteprojetoConferenceActionLoading(false);
    }
}

async function confirmPreliminaryDesignConferenceFromModal() {
    const conferenceId = editingAnteprojetoConferenceId;
    if (!conferenceId) return;

    const conference = anteprojetoConferencesCache.find(c => Number(c.id) === Number(conferenceId));
    if (!conference || !canConfirmAnteprojetoConference(conference)) return;

    if (!areAllAnteprojetoModalObservationsReady()) {
        alertAppDialog('Classifique todas as observações (Req. Proj., Req. Cons. ou OK) e preencha as respostas obrigatórias antes de confirmar.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (typeof openProjectCharacteristicsModalForConference === 'function') {
        const opened = await openProjectCharacteristicsModalForConference(conference, async () => {
            await executeAnteprojetoConferenceConfirmationFromModal(conferenceId);
        });
        if (opened) return;
    }

    await executeAnteprojetoConferenceConfirmationFromModal(conferenceId);
}

async function executeAnteprojetoConferenceConfirmationFromModal(conferenceId) {
    const conference = anteprojetoConferencesCache.find(c => Number(c.id) === Number(conferenceId));
    if (!conference) return;

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

        const refreshed = await fetchPreliminaryDesignConferenceById(conferenceId);
        if (refreshed) {
            const cacheIndex = anteprojetoConferencesCache.findIndex(item => Number(item.id) === Number(conferenceId));
            if (cacheIndex >= 0) {
                anteprojetoConferencesCache[cacheIndex] = refreshed;
            } else {
                anteprojetoConferencesCache.push(refreshed);
            }
        }

        await confirmPreliminaryDesignConference(conferenceId, { skipCharacteristicsCheck: true });
    } catch (error) {
        setAnteprojetoConferenceActionLoading(true, `Erro ao confirmar conferência: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setAnteprojetoConferenceActionLoading(false);
    }
}

async function confirmPreliminaryDesignConferenceFromPendencias(conferenceId) {
    const conference = await fetchPreliminaryDesignConferenceById(conferenceId);
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

    await confirmPreliminaryDesignConference(conferenceId);
}

async function approvePreliminaryDesignConferenceFromPendencias(conferenceId) {
    await showPreliminaryDesignApproveDeliveryModal(conferenceId);
}
