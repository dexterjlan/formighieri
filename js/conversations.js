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

async function openConvModal() {
    editingConversationId = null;
    document.getElementById("conv-modal-title").textContent = "Nova Requisição Técnica";
    document.getElementById("conv-form-submit").textContent = "Criar Requisição";
    document.getElementById("conv-form").reset();
    resetConvResponseFields();
    setupConvProfileFields(false);
    await loadProjetistas();
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
        return requestProfile === 'Projetista' && conv.designerId === currentUser.id;
    }

    if (currentUser.role === 'Consultor') {
        return requestProfile === 'Consultor' && isOrderConsultorForRequest(conv);
    }

    return false;
}

function canRespondAsConsultor(conv) {
    return isRequestWaitingConsultor(conv) && isOrderConsultorForRequest(conv);
}

function canRespondAsProjetista(conv) {
    return isRequestWaitingProjetista(conv) && canEditProjetistaResponse(conv);
}

async function editConversation(id) {
    const conv = conversationsCache.find(c => c.id === id);
    if (!conv || !canEditConversation(conv)) return;

    editingConversationId = id;
    document.getElementById("conv-modal-title").textContent = "Editar Requisição";
    document.getElementById("conv-form-submit").textContent = "Salvar Alterações";
    setupConvProfileFields(true, conv);
    setupConvResponseFields(conv);
    await loadProjetistas();
    document.getElementById("conv-designer").value = String(conv.designerId);
    document.getElementById("conv-request").value = conv.designerRequest;
    toggleModal('conv-modal', true);
}

function buildRequestResponseSection(conv) {
    const status = normalizeRequestStatus(conv);

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
                <textarea id="reply-consultor-${conv.id}" rows="2"
                    class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
                    placeholder="Digite a resposta do consultor..."></textarea>
                <button type="button" onclick="replyConsultorConversation('${conv.id}')"
                    class="bg-amber-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-amber-700">
                    Responder e Encerrar
                </button>
            </div>
        `;
    }

    if (canRespondAsProjetista(conv)) {
        return `
            <div class="space-y-2">
                <textarea id="reply-projetista-${conv.id}" rows="2"
                    class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    placeholder="Digite a resposta do projetista..."></textarea>
                <button type="button" onclick="replyProjetistaConversation('${conv.id}')"
                    class="bg-sky-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-sky-800">
                    Responder e Encerrar
                </button>
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
    const [{ data: convs, error }, { data: orderInfo }] = await Promise.all([
        supabaseClient
            .from('OrderRequest')
            .select('*')
            .eq('orderId', orderId)
            .order('createdAt', { ascending: true }),
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

    list.innerHTML = "";

    convs.forEach(c => {
        const status = normalizeRequestStatus(c);
        const canEdit = canEditConversation(c);
        const statusClass = getRequestStatusBadgeClass(status);
        const div = document.createElement("div");
        div.className = "bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3";

        const requestTitle = c.requestProfile === 'Consultor'
            ? 'Solicitação do Consultor'
            : 'Solicitação do Projetista';

        div.innerHTML = `
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <div class="flex flex-col gap-0.5">
                    <div class="text-xs font-bold text-slate-700">👤 Projetista: ${projetistaNames[c.designerId] || '-'}</div>
                    <div class="text-xs font-bold text-slate-600">📋 Consultor: ${consultantName}</div>
                </div>
                <div class="flex items-center gap-2">
                    ${canEdit ? `<button type="button" onclick="editConversation(${c.id})"
                        class="text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 px-2.5 py-1 rounded-lg font-medium">Editar</button>` : ''}
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${status}</span>
                </div>
            </div>
            <div class="bg-slate-50 p-3 rounded-lg text-xs">
                <p class="font-bold text-slate-400 uppercase text-[9px] mb-1">${requestTitle}:</p>
                <p class="text-slate-800 font-medium">${c.designerRequest}</p>
            </div>
            ${buildRequestResponseSection(c)}
        `;
        list.appendChild(div);
    });
}

async function replyConsultorConversation(id) {
    const input = document.getElementById(`reply-consultor-${id}`);
    if (!input || !input.value.trim()) return;

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderRequest')
        .update({
            commercialResponse: input.value.trim(),
            responseAt: now,
            status: 'Encerrado',
            updatedAt: now,
            updatedById: currentUser.id
        })
        .eq('id', id);

    if (error) {
        alert('Erro ao responder requisição: ' + error.message);
        return;
    }

    loadConversations(activeOrderId);
}

async function replyProjetistaConversation(id) {
    const input = document.getElementById(`reply-projetista-${id}`);
    if (!input || !input.value.trim()) return;

    const now = new Date().toISOString();
    let payload = {
        designerResponse: input.value.trim(),
        responseAt: now,
        status: 'Encerrado',
        updatedAt: now,
        updatedById: currentUser.id
    };

    let { error } = await supabaseClient
        .from('OrderRequest')
        .update(payload)
        .eq('id', id);

    if (error && error.message?.includes('designerResponse')) {
        ({ error } = await supabaseClient
            .from('OrderRequest')
            .update({
                commercialResponse: input.value.trim(),
                responseAt: now,
                status: 'Encerrado',
                updatedAt: now,
                updatedById: currentUser.id
            })
            .eq('id', id));
    }

    if (error) {
        alert('Erro ao responder requisição: ' + error.message);
        return;
    }

    loadConversations(activeOrderId);
}

window.replyConsultorConversation = replyConsultorConversation;
window.replyProjetistaConversation = replyProjetistaConversation;
window.replyConversation = replyConsultorConversation;

function bindConversationEvents() {
    document.getElementById("conv-form").addEventListener("submit", async function (e) {
        e.preventDefault();

        const designerId = document.getElementById("conv-designer").value;
        const designerRequest = document.getElementById("conv-request").value.trim();

        if (!designerRequest) {
            alert("Informe a solicitação.");
            return;
        }

        if (editingConversationId) {
            const existing = conversationsCache.find(c => c.id === editingConversationId);
            const updatePayload = {
                designerId,
                designerRequest,
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

            const { error } = await supabaseClient
                .from('OrderRequest')
                .update(updatePayload)
                .eq('id', editingConversationId);

            if (error) {
                alert("Erro ao salvar requisição: " + error.message);
                return;
            }
        } else {
            const requestProfile = getRequestProfileForCreate();
            if (!requestProfile) {
                alert("Selecione o perfil da requisição (Projetista ou Consultor).");
                document.getElementById("conv-profile")?.focus();
                return;
            }

            const payload = {
                orderId: activeOrderId,
                designerId,
                designerRequest,
                requestProfile,
                status: getInitialRequestStatus(requestProfile),
                createdById: currentUser.id,
                updatedById: currentUser.id
            };

            const { error } = await supabaseClient.from('OrderRequest').insert([payload]);
            if (error) {
                alert("Erro ao criar requisição: " + error.message);
                return;
            }
        }

        closeConvModal();
        document.getElementById("conv-form").reset();
        if (!document.getElementById("conversations-query-view").classList.contains("hidden")) {
            searchConversations();
        } else if (activeOrderId) {
            loadConversations(activeOrderId);
        }
    });
}
