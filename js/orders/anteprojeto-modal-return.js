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

