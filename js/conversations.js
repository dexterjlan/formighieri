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

function setConvResponseFieldVisible(show) {
    document.getElementById("conv-response-wrap").classList.toggle("hidden", !show);
    if (!show) {
        document.getElementById("conv-response").value = "";
        document.getElementById("conv-response-date-display").textContent = "—";
    }
}

async function openConvModal() {
    editingConversationId = null;
    document.getElementById("conv-modal-title").textContent = "Nova Requisição Técnica";
    document.getElementById("conv-form-submit").textContent = "Criar Requisição";
    document.getElementById("conv-form").reset();
    setConvResponseFieldVisible(false);
    setupConvProfileFields(false);
    await loadProjetistas();
    toggleModal('conv-modal', true);
}

function closeConvModal() {
    editingConversationId = null;
    toggleModal('conv-modal', false);
}

function canEditConversation(conv) {
    if (currentUser.role === 'Admin' || currentUser.role === 'Consultor') return true;
    if (conv.status !== 'Aberto') return false;
    if (currentUser.role === 'Projetista' && conv.designerId === currentUser.id) return true;
    return false;
}

async function editConversation(id) {
    const conv = conversationsCache.find(c => c.id === id);
    if (!conv || !canEditConversation(conv)) return;

    editingConversationId = id;
    document.getElementById("conv-modal-title").textContent = "Editar Requisição";
    document.getElementById("conv-form-submit").textContent = "Salvar Alterações";
    setConvResponseFieldVisible(canEditConsultorResponse());
    setupConvProfileFields(true, conv);
    await loadProjetistas();
    document.getElementById("conv-designer").value = String(conv.designerId);
    document.getElementById("conv-request").value = conv.designerRequest;
    document.getElementById("conv-response").value = conv.commercialResponse || "";
    const responseDate = getResponseDisplayDate(conv);
    document.getElementById("conv-response-date-display").textContent =
        responseDate ? formatDate(responseDate) : "—";
    toggleModal('conv-modal', true);
}

window.openConvModal = openConvModal;
window.closeConvModal = closeConvModal;
window.editConversation = editConversation;

async function loadConversations(orderId) {
    const { data: convs, error } = await supabaseClient
        .from('OrderRequest')
        .select('*')
        .eq('orderId', orderId)
        .order('createdAt', { ascending: true });

    const list = document.getElementById("conversations-list");

    if (error || !convs || convs.length === 0) {
        conversationsCache = [];
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 bg-white rounded-xl border border-slate-200 shadow-sm">Nenhuma requisição técnica para este pedido.</p>';
        return;
    }

    conversationsCache = convs;

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
        const isOpen = c.status === 'Aberto';
        const canEdit = canEditConversation(c);
        const profile = formatRequestProfile(c.requestProfile);
        const profileClass = getRequestProfileBadgeClass(c.requestProfile);
        const div = document.createElement("div");
        div.className = "bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3";

        let responseSection;
        const responseDate = getResponseDisplayDate(c);
        if (c.commercialResponse) {
            responseSection = `
                <div class="bg-emerald-50 p-3 rounded-lg text-xs">
                    <p class="font-bold text-emerald-600 uppercase text-[9px] mb-1">Resposta do Consultor:</p>
                    <p class="text-slate-800 font-medium">${c.commercialResponse}</p>
                    <p class="text-[10px] text-emerald-700 mt-2">Respondido em: ${formatDate(responseDate)}</p>
                </div>
            `;
        } else if (isOpen && currentUser.role === 'Consultor') {
            responseSection = `
                <div class="space-y-2">
                    <textarea id="reply-${c.id}" rows="2"
                        class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
                        placeholder="Digite a resposta do consultor..."></textarea>
                    <button type="button" onclick="replyConversation('${c.id}')"
                        class="bg-amber-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-amber-700">
                        Responder e Encerrar
                    </button>
                </div>
            `;
        } else {
            responseSection = '<p class="text-xs text-slate-400 italic">Aguardando retorno do consultor...</p>';
        }

        const requestTitle = c.requestProfile === 'Consultor'
            ? 'Solicitação do Consultor'
            : 'Solicitação Técnica';

        div.innerHTML = `
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <div class="flex flex-col gap-1">
                    <div class="text-xs font-bold text-slate-700">👤 Projetista: ${projetistaNames[c.designerId] || '-'}</div>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase w-fit ${profileClass}">Perfil: ${profile}</span>
                </div>
                <div class="flex items-center gap-2">
                    ${canEdit ? `<button type="button" onclick="editConversation(${c.id})"
                        class="text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 px-2.5 py-1 rounded-lg font-medium">Editar</button>` : ''}
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isOpen ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}">${c.status}</span>
                </div>
            </div>
            <div class="bg-slate-50 p-3 rounded-lg text-xs">
                <p class="font-bold text-slate-400 uppercase text-[9px] mb-1">${requestTitle}:</p>
                <p class="text-slate-800 font-medium">${c.designerRequest}</p>
            </div>
            ${responseSection}
        `;
        list.appendChild(div);
    });
}

async function replyConversation(id) {
    const input = document.getElementById(`reply-${id}`);
    if (!input || !input.value.trim()) return;

    const now = new Date().toISOString();
    await supabaseClient
        .from('OrderRequest')
        .update({
            commercialResponse: input.value.trim(),
            responseAt: now,
            status: 'Encerrado',
            updatedAt: now,
            updatedById: currentUser.id
        })
        .eq('id', id);

    loadConversations(activeOrderId);
}
window.replyConversation = replyConversation;

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
            const updatePayload = {
                designerId,
                designerRequest,
                updatedAt: new Date().toISOString(),
                updatedById: currentUser.id
            };

            if (canEditConsultorResponse()) {
                const commercialResponse = document.getElementById("conv-response").value.trim();
                updatePayload.commercialResponse = commercialResponse || null;
                if (commercialResponse) {
                    const existing = conversationsCache.find(c => c.id === editingConversationId);
                    if (existing?.responseAt) {
                        updatePayload.responseAt = existing.responseAt;
                    } else if (existing?.commercialResponse?.trim()) {
                        updatePayload.responseAt = getResponseDisplayDate(existing) || new Date().toISOString();
                    } else {
                        updatePayload.responseAt = new Date().toISOString();
                    }
                    updatePayload.status = 'Encerrado';
                } else {
                    updatePayload.responseAt = null;
                    updatePayload.status = 'Aberto';
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
                status: 'Aberto',
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
