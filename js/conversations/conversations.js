let convOrderProjectsCache = [];

async function loadProjetistas() {
    const select = document.getElementById("conv-designer");
    select.disabled = false;
    select.classList.remove('bg-slate-100', 'cursor-not-allowed');

    if (currentUser?.role === 'Projetista') {
        select.innerHTML = `<option value="${currentUser.id}">${currentUser.name}</option>`;
        select.value = String(currentUser.id);
        select.disabled = true;
        select.classList.add('bg-slate-100', 'cursor-not-allowed');
        return;
    }

    const { data: projetistas, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .order('name', { ascending: true });

    select.innerHTML = '<option value="">Selecione...</option>';

    if (error || !projetistas || projetistas.length === 0) {
        select.innerHTML += '<option value="" disabled>Nenhum projetista cadastrado</option>';
        return;
    }

    projetistas.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
}

function resetConvResponseFields() {
    document.getElementById('conv-response-wrap').classList.add('hidden');
    document.getElementById('conv-designer-response-wrap').classList.add('hidden');
    document.getElementById('conv-response').value = '';
    document.getElementById('conv-designer-response').value = '';
    document.getElementById('conv-response-date-display').textContent = '—';
    document.getElementById('conv-designer-response-date-display').textContent = '—';
}

function setupConvResponseFields(conv) {
    resetConvResponseFields();
    if (!conv) return;

    if (isRequestWaitingConsultor(conv) && canRespondAsConsultor(conv)) {
        document.getElementById('conv-response-wrap').classList.remove('hidden');
        document.getElementById('conv-response').value = conv.commercialResponse || '';
        const responseDate = conv.commercialResponse ? getResponseDisplayDate(conv) : null;
        document.getElementById('conv-response-date-display').textContent =
            responseDate ? formatDate(responseDate) : '—';
    }

    if (isRequestWaitingProjetista(conv) && canEditProjetistaResponse(conv)) {
        document.getElementById('conv-designer-response-wrap').classList.remove('hidden');
        document.getElementById('conv-designer-response').value = conv.designerResponse || '';
        const responseDate = conv.designerResponse ? getResponseDisplayDate(conv) : null;
        document.getElementById('conv-designer-response-date-display').textContent =
            responseDate ? formatDate(responseDate) : '—';
    }
}

async function loadConvOrderProjects(selectedId) {
    const select = document.getElementById('conv-order-project');
    if (!select) return;

    const projects = activeOrderId ? await fetchOrderProjectsForOrder(activeOrderId) : [];
    convOrderProjectsCache = projects;

    select.innerHTML = '<option value="">Nenhum</option>';

    if (!projects.length) {
        select.innerHTML += '<option value="" disabled>Nenhum projeto cadastrado no pedido</option>';
        return;
    }

    [...projects]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
        .forEach(p => {
            const env = p.environmentType?.name ? ` (${p.environmentType.name})` : '';
            select.innerHTML += `<option value="${p.id}">${p.name}${env}</option>`;
        });

    if (selectedId) {
        select.value = String(selectedId);
    }
}

function getConvOrderProjectIdValue() {
    const value = document.getElementById('conv-order-project')?.value;
    return value ? Number(value) : null;
}

function getConvOrderProjectById(projectId) {
    if (!projectId) return null;
    return convOrderProjectsCache.find(project => Number(project.id) === Number(projectId)) || null;
}

function shouldLockConvDesignerFromProject() {
    if (editingConversationId) return false;
    if (currentUser?.role === 'Projetista') return false;
    if (currentUser?.role === 'Consultor') return true;
    if (currentUser?.role === 'Admin') {
        return document.getElementById('conv-profile')?.value === 'Consultor';
    }
    return false;
}

async function ensureDesignerInConvSelect(designerId) {
    const select = document.getElementById('conv-designer');
    if (!select || !designerId) return;

    const exists = [...select.options].some(option => Number(option.value) === Number(designerId));
    if (exists) return;

    const { data: user } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('id', designerId)
        .maybeSingle();

    if (user) {
        const option = document.createElement('option');
        option.value = String(user.id);
        option.textContent = user.name;
        select.appendChild(option);
    }
}

async function applyConvDesignerFromSelectedProject() {
    const designerSelect = document.getElementById('conv-designer');
    if (!designerSelect) return;

    if (!shouldLockConvDesignerFromProject()) {
        setConvFieldDisabled(designerSelect, false);
        return;
    }

    const project = getConvOrderProjectById(getConvOrderProjectIdValue());
    const projectDesignerId = project?.designerId ? Number(project.designerId) : null;

    if (!projectDesignerId) {
        setConvFieldDisabled(designerSelect, false);
        return;
    }

    await ensureDesignerInConvSelect(projectDesignerId);
    designerSelect.value = String(projectDesignerId);
    setConvFieldDisabled(designerSelect, true);
}

async function openConvModal() {
    editingConversationId = null;
    document.getElementById("conv-modal-title").textContent = "Nova Requisição";
    document.getElementById("conv-form-submit").textContent = "Criar Requisição";
    document.getElementById("conv-form").reset();
    resetConvResponseFields();
    resetConvActivities();
    setupConvProfileFields(false);
    updateRequestActivityModalControls(null);
    await Promise.all([
        loadProjetistas(),
        loadConvOrderProjects()
    ]);
    setupConvModalFieldLocks(null);
    toggleModal('conv-modal', true);
}

function closeConvModal() {
    editingConversationId = null;
    toggleModal('conv-modal', false);
}

function canEditConversation(conv) {
    if (isRequestClosed(conv)) return false;
    if (currentUser.role === 'Admin') return true;

    const requestProfile = conv.requestProfile || 'Projetista';

    if (currentUser.role === 'Projetista') {
        if (Number(conv.designerId) !== Number(currentUser.id)) return false;
        if (requestProfile === 'Projetista') return true;
        return isRequestWaitingProjetista(conv);
    }

    if (currentUser.role === 'Consultor') {
        if (!isOrderConsultorForRequest(conv)) return false;
        if (requestProfile === 'Consultor') return true;
        return isRequestWaitingConsultor(conv);
    }

    return false;
}

function canRespondAsConsultor(conv) {
    return isRequestWaitingConsultor(conv) && isOrderConsultorForRequest(conv);
}

function canRespondAsProjetista(conv) {
    return isRequestWaitingProjetista(conv) && canEditProjetistaResponse(conv);
}

function isConsultorRespondingToProjetistaRequest(conv) {
    if (!conv || currentUser?.role === 'Admin') return false;
    return (conv.requestProfile || 'Projetista') === 'Projetista'
        && isRequestWaitingConsultor(conv)
        && canRespondAsConsultor(conv);
}

function isProjetistaRespondingToConsultorRequest(conv) {
    if (!conv || currentUser?.role === 'Admin') return false;
    return (conv.requestProfile || 'Projetista') === 'Consultor'
        && isRequestWaitingProjetista(conv)
        && canEditProjetistaResponse(conv);
}

function isConvRespondOnlyMode(conv) {
    return isConsultorRespondingToProjetistaRequest(conv)
        || isProjetistaRespondingToConsultorRequest(conv);
}

function setConvFieldDisabled(el, disabled) {
    if (!el) return;
    el.disabled = disabled;
    el.classList.toggle('bg-slate-100', disabled);
    el.classList.toggle('cursor-not-allowed', disabled);
}

function setupConvModalFieldLocks(conv) {
    const isEdit = Boolean(conv);
    const respondOnly = isConvRespondOnlyMode(conv);

    setConvFieldDisabled(document.getElementById('conv-order-project'), isEdit);

    if (isEdit || currentUser?.role === 'Projetista') {
        setConvFieldDisabled(document.getElementById('conv-designer'), true);
    } else {
        applyConvDesignerFromSelectedProject();
    }

    setConvFieldDisabled(document.getElementById('conv-request'), respondOnly);

    const submitBtn = document.getElementById('conv-form-submit');
    if (submitBtn && isEdit) {
        submitBtn.textContent = respondOnly ? 'Salvar resposta' : 'Salvar Alterações';
    }
}

async function editConversation(id) {
    const conv = conversationsCache.find(c => c.id === id);
    if (!conv || !canEditConversation(conv)) return;

    editingConversationId = id;
    const respondOnly = isConvRespondOnlyMode(conv);
    document.getElementById("conv-modal-title").textContent = respondOnly
        ? 'Responder Requisição'
        : 'Editar Requisição';
    document.getElementById("conv-form-submit").textContent = respondOnly
        ? 'Salvar resposta'
        : 'Salvar Alterações';
    setupConvProfileFields(true, conv);
    setupConvResponseFields(conv);
    await Promise.all([
        loadProjetistas(),
        loadConvOrderProjects(conv.orderProjectId),
        loadRequestActivitiesForModal(id)
    ]);
    document.getElementById("conv-designer").value = String(conv.designerId);
    document.getElementById("conv-request").value = conv.designerRequest;
    updateRequestActivityModalControls(conv);
    updateConvModalActivitiesHint();
    setupConvModalFieldLocks(conv);
    toggleModal('conv-modal', true);
}

function buildRequestResponseSection(conv, activities = []) {
    const status = normalizeRequestStatus(conv);
    const hasActivities = activities.length > 0;
    const allComplete = allRequestActivitiesCompleted(activities);
    const replyBlocked = hasActivities && !allComplete;
    const replyHint = hasActivities
        ? `<p data-reply-hint="${conv.id}" class="${allComplete ? 'hidden' : ''} text-[10px] text-amber-700">Marque todas as atividades como realizadas para responder.</p>`
        : '';

    if (status === 'Encerrado') {
        const sections = [];
        if (conv.commercialResponse) {
            sections.push(`
                <div class="bg-emerald-50 p-3 rounded-lg text-xs">
                    <p class="font-bold text-emerald-600 uppercase text-[9px] mb-1">Resposta do Consultor:</p>
                    <p class="text-slate-800 font-medium">${conv.commercialResponse}</p>
                </div>
            `);
        }
        if (conv.designerResponse) {
            sections.push(`
                <div class="bg-sky-50 p-3 rounded-lg text-xs">
                    <p class="font-bold text-sky-600 uppercase text-[9px] mb-1">Resposta do Projetista:</p>
                    <p class="text-slate-800 font-medium">${conv.designerResponse}</p>
                </div>
            `);
        }
        const responseDate = getResponseDisplayDate(conv);
        if (responseDate) {
            sections.push(`<p class="text-[10px] text-slate-500">Respondido em: ${formatDate(responseDate)}</p>`);
        }
        return sections.join('') || '<p class="text-xs text-slate-400 italic">Requisição encerrada.</p>';
    }

    if (canRespondAsConsultor(conv)) {
        return `
            <div class="space-y-2">
                <label class="block text-xs font-semibold text-slate-500">Resposta do Consultor</label>
                <textarea id="reply-consultor-${conv.id}" rows="2"
                    class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
                    placeholder="Digite a resposta do consultor...">${escapeHtml(conv.commercialResponse || '')}</textarea>
                ${replyHint}
                <div class="flex flex-wrap gap-2">
                    <button type="button" data-save-request-activities="${conv.id}" onclick="saveRequestActivitiesFromCard(${conv.id})"
                        class="bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-slate-700">
                        Salvar
                    </button>
                    <button type="button" data-reply-btn="consultor-${conv.id}" onclick="replyConsultorConversation('${conv.id}')"
                        class="bg-amber-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-amber-700 ${replyBlocked ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${replyBlocked ? 'disabled' : ''}>
                        Responder e Encerrar
                    </button>
                </div>
            </div>
        `;
    }

    if (canRespondAsProjetista(conv)) {
        return `
            <div class="space-y-2">
                <label class="block text-xs font-semibold text-slate-500">Resposta do Projetista</label>
                <textarea id="reply-projetista-${conv.id}" rows="2"
                    class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    placeholder="Digite a resposta do projetista...">${escapeHtml(conv.designerResponse || '')}</textarea>
                ${replyHint}
                <div class="flex flex-wrap gap-2">
                    <button type="button" data-save-request-activities="${conv.id}" onclick="saveRequestActivitiesFromCard(${conv.id})"
                        class="bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-slate-700">
                        Salvar
                    </button>
                    <button type="button" data-reply-btn="projetista-${conv.id}" onclick="replyProjetistaConversation('${conv.id}')"
                        class="bg-sky-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-sky-800 ${replyBlocked ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${replyBlocked ? 'disabled' : ''}>
                        Responder e Encerrar
                    </button>
                </div>
            </div>
        `;
    }

    if (status === 'Aguardando Consultor') {
        return '<p class="text-xs text-slate-400 italic">Aguardando retorno do consultor...</p>';
    }

    return '<p class="text-xs text-slate-400 italic">Aguardando retorno do projetista...</p>';
}

window.openConvModal = openConvModal;
window.closeConvModal = closeConvModal;
window.editConversation = editConversation;

async function loadConversations(orderId) {
    await ensureSystemSettingsLoaded();

    try {
        let convsResult = await supabaseClient
            .from('OrderRequest')
            .select('*, orderProject:OrderProject(id, name, environmentType:EnvironmentType(name))')
            .eq('orderId', orderId)
            .order('createdAt', { ascending: true });

        if (convsResult.error?.message?.includes('orderProject')) {
            convsResult = await supabaseClient
                .from('OrderRequest')
                .select('*')
                .eq('orderId', orderId)
                .order('createdAt', { ascending: true });
        }

        const [{ data: convs, error }, { data: orderInfo }] = await Promise.all([
            Promise.resolve(convsResult),
            supabaseClient
                .from('salesOrders')
                .select('consultantName')
                .eq('id', orderId)
                .single()
        ]);

        const consultantName = orderInfo?.consultantName || getOrderConsultantName(orderId) || '-';

        const list = document.getElementById("conversations-list");

        if (error || !convs || convs.length === 0) {
            conversationsCache = [];
            list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 bg-white rounded-xl border border-slate-200 shadow-sm">Nenhuma requisição técnica para este pedido.</p>';
            updateOrderTabCounts(undefined, 0);
            return;
        }

        conversationsCache = convs;
        updateOrderTabCounts(undefined, countOpenOrderRequests(convs));

        const designerIds = [...new Set(convs.map(c => c.designerId).filter(Boolean))];
        let projetistaNames = {};

        if (designerIds.length) {
            const { data: users } = await supabaseClient
                .from('appUsers')
                .select('id, name')
                .in('id', designerIds);

            users?.forEach(u => {
                projetistaNames[u.id] = u.name;
            });
        }

        const requestIds = convs.map(c => c.id);
        const activitiesByRequest = await fetchRequestActivitiesByRequestIds(requestIds);

        list.innerHTML = "";

        sortOrderRequests(convs).forEach(c => {
            const status = normalizeRequestStatus(c);
            const canEdit = canEditConversation(c);
            const statusClass = getRequestStatusBadgeClass(status);
            const cardBgClass = getRequestHighlightBgClass(c);
            const div = document.createElement("div");
            div.className = `${cardBgClass} collapsible-list-card rounded-xl border shadow-sm overflow-hidden`;

            const requestTitle = c.requestProfile === 'Consultor'
                ? 'Solicitação do Consultor'
                : 'Solicitação do Projetista';

            const projectLabel = c.orderProject?.name
                ? `<div class="text-xs font-medium text-violet-700">🏠 Projeto: ${c.orderProject.name}${c.orderProject.environmentType?.name ? ` · ${c.orderProject.environmentType.name}` : ''}</div>`
                : '';

            div.innerHTML = `
                <div class="collapsible-list-header flex justify-between items-center gap-2 border-b border-slate-100 px-5 py-3 bg-white/40 cursor-pointer">
                    <div class="flex items-start gap-2 min-w-0 flex-1">
                        <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                            aria-label="Expandir">▶</button>
                        <div class="flex flex-col gap-0.5 min-w-0">
                            <div class="text-xs font-bold text-slate-700">👤 Projetista: ${projetistaNames[c.designerId] || '-'}</div>
                            <div class="text-xs font-bold text-slate-600">📋 Consultor: ${consultantName}</div>
                            ${projectLabel}
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        ${canEdit ? `<button type="button" onclick="editConversation(${c.id})"
                            class="text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 px-2.5 py-1 rounded-lg font-medium">Editar</button>` : ''}
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${status}</span>
                    </div>
                </div>
                <div class="collapsible-list-body hidden px-5 py-4 space-y-3">
                    <div class="bg-white/70 p-3 rounded-lg text-xs">
                        <p class="font-bold text-slate-400 uppercase text-[9px] mb-1">${requestTitle}:</p>
                        <p class="text-slate-800 font-medium">${c.designerRequest}</p>
                    </div>
                </div>
            `;

            const body = div.querySelector('.collapsible-list-body');
            appendRequestActivitiesToCard(body, c, activitiesByRequest[c.id] || []);
            body.insertAdjacentHTML('beforeend', buildRequestResponseSection(c, activitiesByRequest[c.id] || []));
            list.appendChild(div);
        });

        bindCollapsibleListCardToggles(list);
    } finally {
        if (typeof refreshOrdersListSummary === 'function') {
            await refreshOrdersListSummary();
        }
    }
}

async function replyConsultorConversation(id) {
    const input = document.getElementById(`reply-consultor-${id}`);
    if (!input || !input.value.trim()) return;

    const conv = conversationsCache.find(c => String(c.id) === String(id));
    const responseText = input.value.trim();
    const cardActivities = collectRequestActivitiesFromCard(id);

    if (!validateRequestActivitiesBeforeReply(cardActivities)) return;

    setRequestReplyLoading(id, 'consultor', true, 'Salvando resposta...');

    try {
        const now = new Date().toISOString();
        if (cardActivities.length) {
            await persistRequestActivities(id, cardActivities);
        }

        const { error } = await supabaseClient
            .from('OrderRequest')
            .update({
                commercialResponse: responseText,
                responseAt: now,
                status: 'Encerrado',
                updatedAt: now,
                updatedById: currentUser.id
            })
            .eq('id', id);

        if (error) {
            alertAppDialog('Erro ao responder requisição: ' + error.message);
            return;
        }

        if (conv) {
            setRequestReplyLoading(id, 'consultor', true, 'Enviando notificação por e-mail...');
            await notifyOrderRequestEmail('answered', {
                ...conv,
                commercialResponse: responseText,
                status: 'Encerrado',
                activities: cardActivities
            });
        }

        await loadConversations(activeOrderId);
        if (typeof loadPendenciasConsultorRequisicoes === 'function'
            && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
            await loadPendenciasConsultorRequisicoes();
        }
    } finally {
        setRequestReplyLoading(id, 'consultor', false);
    }
}

async function replyProjetistaConversation(id) {
    const input = document.getElementById(`reply-projetista-${id}`);
    if (!input || !input.value.trim()) return;

    const conv = conversationsCache.find(c => String(c.id) === String(id));
    const responseText = input.value.trim();
    const cardActivities = collectRequestActivitiesFromCard(id);

    if (!validateRequestActivitiesBeforeReply(cardActivities)) return;

    setRequestReplyLoading(id, 'projetista', true, 'Salvando resposta...');

    try {
        const now = new Date().toISOString();
        if (cardActivities.length) {
            await persistRequestActivities(id, cardActivities);
        }

        let payload = {
            designerResponse: responseText,
            responseAt: now,
            status: 'Encerrado',
            updatedAt: now,
            updatedById: currentUser.id
        };

        let usedDesignerResponseField = true;
        let { error } = await supabaseClient
            .from('OrderRequest')
            .update(payload)
            .eq('id', id);

        if (error && error.message?.includes('designerResponse')) {
            usedDesignerResponseField = false;
            ({ error } = await supabaseClient
                .from('OrderRequest')
                .update({
                    commercialResponse: responseText,
                    responseAt: now,
                    status: 'Encerrado',
                    updatedAt: now,
                    updatedById: currentUser.id
                })
                .eq('id', id));
        }

        if (error) {
            alertAppDialog('Erro ao responder requisição: ' + error.message);
            return;
        }

        if (conv) {
            setRequestReplyLoading(id, 'projetista', true, 'Enviando notificação por e-mail...');
            await notifyOrderRequestEmail('answered', {
                ...conv,
                designerResponse: usedDesignerResponseField ? responseText : null,
                commercialResponse: usedDesignerResponseField ? conv.commercialResponse : responseText,
                status: 'Encerrado',
                activities: cardActivities
            });
        }

        await loadConversations(activeOrderId);
    } finally {
        setRequestReplyLoading(id, 'projetista', false);
    }
}

window.replyConsultorConversation = replyConsultorConversation;
window.replyProjetistaConversation = replyProjetistaConversation;
window.replyConversation = replyConsultorConversation;

function setRequestReplyLoading(id, role, isLoading, message = 'Respondendo...') {
    const btn = document.querySelector(`[data-reply-btn="${role}-${id}"]`);
    const input = document.getElementById(`reply-${role}-${id}`);

    if (btn) {
        if (!btn.dataset.originalText) {
            btn.dataset.originalText = btn.textContent.trim();
        }
        btn.disabled = isLoading;
        btn.textContent = isLoading ? message : btn.dataset.originalText;
        btn.classList.toggle('opacity-60', isLoading);
        btn.classList.toggle('cursor-not-allowed', isLoading);
    }

    if (input) {
        input.disabled = isLoading;
        input.classList.toggle('opacity-60', isLoading);
    }
}

function setConvFormLoading(isLoading, message = 'Salvando requisição...') {
    const overlay = document.getElementById('conv-form-loading');
    const messageEl = document.getElementById('conv-form-loading-msg');
    const submitBtn = document.getElementById('conv-form-submit');
    const cancelBtn = document.querySelector('#conv-form button[type="button"]');
    const addActivityBtn = document.getElementById('btn-add-request-activity');
    const saveActivitiesBtn = document.getElementById('btn-save-conv-activities');
    const fields = document.querySelectorAll('#conv-form input, #conv-form select, #conv-form textarea');

    overlay?.classList.toggle('hidden', !isLoading);
    if (messageEl) messageEl.textContent = message;
    if (submitBtn) {
        submitBtn.disabled = isLoading;
        submitBtn.classList.toggle('opacity-60', isLoading);
        submitBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    if (cancelBtn) {
        cancelBtn.disabled = isLoading;
        cancelBtn.classList.toggle('opacity-60', isLoading);
        cancelBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    if (addActivityBtn) {
        addActivityBtn.disabled = isLoading;
        addActivityBtn.classList.toggle('opacity-60', isLoading);
        addActivityBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    if (saveActivitiesBtn) {
        saveActivitiesBtn.disabled = isLoading;
        saveActivitiesBtn.classList.toggle('opacity-60', isLoading);
        saveActivitiesBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    fields.forEach(field => { field.disabled = isLoading; });

    if (!isLoading && editingConversationId) {
        const conv = conversationsCache.find(c => c.id === editingConversationId);
        setupConvModalFieldLocks(conv);
    }
}

function bindConversationEvents() {
    document.getElementById('conv-order-project')?.addEventListener('change', async () => {
        applyConvDesignerFromSelectedProject();
    });

    document.getElementById("conv-form").addEventListener("submit", async function (e) {
        e.preventDefault();

        const designerId = document.getElementById("conv-designer").value;
        const designerRequest = document.getElementById("conv-request").value.trim();
        const orderProjectId = getConvOrderProjectIdValue();
        const requestActivities = collectRequestActivitiesFromDom().filter(a => a.description);

        const existing = editingConversationId
            ? conversationsCache.find(c => c.id === editingConversationId)
            : null;
        const respondOnly = existing && isConvRespondOnlyMode(existing);

        if (!respondOnly && !designerRequest) {
            alertAppDialog("Informe a solicitação.");
            return;
        }

        setConvFormLoading(true, 'Validando requisição...');

        try {
            const canProceed = await validateConsultorRequestAgainstOpenApproval(
                respondOnly ? (existing?.orderProjectId ?? null) : orderProjectId,
                existing
            );
            if (!canProceed) return;

            if (editingConversationId) {
                setConvFormLoading(true, 'Salvando requisição...');

                const updatePayload = {
                    designerId: existing.designerId,
                    designerRequest: respondOnly ? existing.designerRequest : designerRequest,
                    orderProjectId: existing.orderProjectId ?? null,
                    updatedAt: new Date().toISOString(),
                    updatedById: currentUser.id
                };

                if (existing && isRequestWaitingConsultor(existing) && canRespondAsConsultor(existing)) {
                    const commercialResponse = document.getElementById("conv-response").value.trim();
                    updatePayload.commercialResponse = commercialResponse || null;
                    if (commercialResponse) {
                        updatePayload.responseAt = existing.responseAt || new Date().toISOString();
                        updatePayload.status = 'Encerrado';
                    } else {
                        updatePayload.responseAt = null;
                        updatePayload.status = getInitialRequestStatus(existing.requestProfile);
                    }
                }

                if (existing && isRequestWaitingProjetista(existing) && canEditProjetistaResponse(existing)) {
                    const designerResponse = document.getElementById("conv-designer-response").value.trim();
                    updatePayload.designerResponse = designerResponse || null;
                    if (designerResponse) {
                        updatePayload.responseAt = existing.responseAt || new Date().toISOString();
                        updatePayload.status = 'Encerrado';
                    } else {
                        updatePayload.responseAt = null;
                        updatePayload.status = getInitialRequestStatus(existing.requestProfile);
                    }
                }

                if (updatePayload.status === 'Encerrado'
                    && !validateRequestActivitiesBeforeReply(requestActivities)) {
                    return;
                }

                let { error } = await supabaseClient
                    .from('OrderRequest')
                    .update(updatePayload)
                    .eq('id', editingConversationId);

                if (error?.message?.includes('orderProjectId')) {
                    const { orderProjectId: _omit, ...payloadWithoutProject } = updatePayload;
                    ({ error } = await supabaseClient
                        .from('OrderRequest')
                        .update(payloadWithoutProject)
                        .eq('id', editingConversationId));
                }

                if (error) {
                    alertAppDialog("Erro ao salvar requisição: " + error.message);
                    return;
                }

                await persistRequestActivities(editingConversationId, requestActivities);

                if (existing && updatePayload.status === 'Encerrado') {
                    setConvFormLoading(true, 'Enviando notificação por e-mail...');
                    await notifyOrderRequestEmail('answered', {
                        ...existing,
                        designerRequest: respondOnly ? existing.designerRequest : designerRequest,
                        orderProjectId: existing.orderProjectId ?? null,
                        commercialResponse: updatePayload.commercialResponse ?? existing.commercialResponse,
                        designerResponse: updatePayload.designerResponse ?? existing.designerResponse,
                        status: 'Encerrado',
                        activities: requestActivities
                    });
                }
            } else {
                const requestProfile = getRequestProfileForCreate();
                if (!requestProfile) {
                    alertAppDialog("Selecione o perfil da requisição (Projetista ou Consultor).");
                    document.getElementById("conv-profile")?.focus();
                    return;
                }

                setConvFormLoading(true, 'Criando requisição...');

                const payload = {
                    orderId: activeOrderId,
                    designerId,
                    designerRequest,
                    orderProjectId,
                    requestProfile,
                    status: getInitialRequestStatus(requestProfile),
                    createdById: currentUser.id,
                    updatedById: currentUser.id
                };

                let createdRequest = null;
                let { data, error } = await supabaseClient
                    .from('OrderRequest')
                    .insert([payload])
                    .select('*')
                    .single();

                if (error?.message?.includes('orderProjectId')) {
                    const { orderProjectId: _omit, ...payloadWithoutProject } = payload;
                    ({ data, error } = await supabaseClient
                        .from('OrderRequest')
                        .insert([payloadWithoutProject])
                        .select('*')
                        .single());
                }

                createdRequest = data;

                if (error) {
                    alertAppDialog("Erro ao criar requisição: " + error.message);
                    return;
                }

                if (createdRequest) {
                    await persistRequestActivities(createdRequest.id, requestActivities);
                    setConvFormLoading(true, 'Enviando notificação por e-mail...');
                    await notifyOrderRequestEmail('created', {
                        ...createdRequest,
                        activities: requestActivities
                    });
                }
            }

            closeConvModal();
            document.getElementById("conv-form").reset();
            if (!document.getElementById("conversations-query-view").classList.contains("hidden")) {
                searchConversations();
            } else if (activeOrderId) {
                loadConversations(activeOrderId);
            }
            if (typeof loadPendenciasConsultorRequisicoes === 'function'
                && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
                await loadPendenciasConsultorRequisicoes();
            }
        } finally {
            setConvFormLoading(false);
        }
    });
}
