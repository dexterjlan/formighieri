function getCurrentEditingRequest() {
    if (!editingConversationId) return null;
    return conversationsCache.find(c => c.id === editingConversationId) || null;
}

function allRequestActivitiesCompleted(activities) {
    if (!activities?.length) return true;
    return activities.every(a => a.completed);
}

function updateRequestReplyControls(requestId) {
    const activities = collectRequestActivitiesFromCard(requestId);
    const hasActivities = activities.length > 0;
    const allComplete = allRequestActivitiesCompleted(activities);

    ['consultor', 'projetista'].forEach(role => {
        const btn = document.querySelector(`[data-reply-btn="${role}-${requestId}"]`);
        if (!btn) return;

        const blocked = hasActivities && !allComplete;
        btn.disabled = blocked;
        btn.classList.toggle('opacity-50', blocked);
        btn.classList.toggle('cursor-not-allowed', blocked);
    });

    const hint = document.querySelector(`[data-reply-hint="${requestId}"]`);
    if (hint) {
        hint.classList.toggle('hidden', !hasActivities || allComplete);
    }
}

function setRequestActivitiesSaveLoading(requestId, isLoading, message = 'Salvando...') {
    const btn = document.querySelector(`[data-save-request-activities="${requestId}"]`);
    if (!btn) return;

    if (!btn.dataset.originalText) {
        btn.dataset.originalText = btn.textContent.trim();
    }
    btn.disabled = isLoading;
    btn.textContent = isLoading ? message : btn.dataset.originalText;
    btn.classList.toggle('opacity-60', isLoading);
    btn.classList.toggle('cursor-not-allowed', isLoading);
}

function getRequestDraftResponseFromCard(requestId, conv) {
    if (canRespondAsConsultor(conv)) {
        return document.getElementById(`reply-consultor-${requestId}`)?.value.trim() || '';
    }
    if (canRespondAsProjetista(conv)) {
        return document.getElementById(`reply-projetista-${requestId}`)?.value.trim() || '';
    }
    return '';
}

async function persistRequestDraftResponse(requestId, conv, responseText) {
    if (!conv || responseText === undefined) return { error: null };

    const now = new Date().toISOString();
    let payload = {
        updatedAt: now,
        updatedById: currentUser.id
    };

    if (canRespondAsConsultor(conv)) {
        payload.commercialResponse = responseText || null;
    } else if (canRespondAsProjetista(conv)) {
        payload.designerResponse = responseText || null;
    } else {
        return { error: null };
    }

    let { error } = await supabaseClient
        .from('OrderRequest')
        .update(payload)
        .eq('id', requestId);

    if (error && payload.designerResponse !== undefined) {
        ({ error } = await supabaseClient
            .from('OrderRequest')
            .update({
                commercialResponse: responseText || null,
                updatedAt: now,
                updatedById: currentUser.id
            })
            .eq('id', requestId));
    }

    return { error };
}

async function saveRequestActivitiesFromCard(requestId) {
    const conv = conversationsCache.find(c => String(c.id) === String(requestId));
    const canSave = conv && (
        canEditRequestActivityCompletion(conv)
        || canRespondAsConsultor(conv)
        || canRespondAsProjetista(conv)
    );
    if (!canSave) return;

    const activities = collectRequestActivitiesFromCard(requestId);
    const responseText = getRequestDraftResponseFromCard(requestId, conv);

    if (!activities.length && !responseText) {
        alertAppDialog('Nada para salvar.');
        return;
    }

    setRequestActivitiesSaveLoading(requestId, true, 'Salvando...');

    try {
        if (activities.length) {
            await persistRequestActivities(requestId, activities);
        }

        if (responseText) {
            const { error } = await persistRequestDraftResponse(requestId, conv, responseText);
            if (error) {
                alertAppDialog('Erro ao salvar resposta: ' + error.message);
                setRequestActivitiesSaveLoading(requestId, false);
                return;
            }
            if (canRespondAsConsultor(conv)) {
                conv.commercialResponse = responseText;
            } else if (canRespondAsProjetista(conv)) {
                conv.designerResponse = responseText;
            }
        }

        setRequestActivitiesSaveLoading(requestId, true, 'Salvo!');
        updateRequestReplyControls(requestId);
        setTimeout(() => setRequestActivitiesSaveLoading(requestId, false), 1200);
    } catch (err) {
        alertAppDialog('Erro ao salvar: ' + (err.message || err));
        setRequestActivitiesSaveLoading(requestId, false);
    }
}

function setConvActivitiesSaveLoading(isLoading, message = 'Salvando...') {
    const btn = document.getElementById('btn-save-conv-activities');
    if (!btn) return;

    if (!btn.dataset.originalText) {
        btn.dataset.originalText = btn.textContent.trim();
    }
    btn.disabled = isLoading;
    btn.textContent = isLoading ? message : btn.dataset.originalText;
    btn.classList.toggle('opacity-60', isLoading);
    btn.classList.toggle('cursor-not-allowed', isLoading);
}

function updateConvModalActivitiesHint() {
    const conv = getCurrentEditingRequest();
    const hint = document.getElementById('conv-activities-reply-hint');
    if (!hint) return;

    const activities = collectRequestActivitiesFromDom().filter(a => a.description);
    const hasActivities = activities.length > 0;
    const allComplete = allRequestActivitiesCompleted(activities);
    const hasResponse = Boolean(
        document.getElementById('conv-response')?.value.trim()
        || document.getElementById('conv-designer-response')?.value.trim()
    );

    hint.classList.toggle('hidden', !hasActivities || allComplete || !hasResponse);
}

async function saveRequestActivitiesFromModal() {
    if (!editingConversationId) return;

    const conv = getCurrentEditingRequest();
    if (!conv || isRequestClosed(conv)) return;

    const canSave = canEditRequestActivityCompletion(conv)
        || canRespondAsConsultor(conv)
        || canRespondAsProjetista(conv);
    if (!canSave) return;

    const activities = collectRequestActivitiesFromDom().filter(a => a.description);
    const commercialResponse = document.getElementById('conv-response')?.value.trim() || '';
    const designerResponse = document.getElementById('conv-designer-response')?.value.trim() || '';
    const responseText = canRespondAsConsultor(conv)
        ? commercialResponse
        : (canRespondAsProjetista(conv) ? designerResponse : '');

    if (!activities.length && !responseText) {
        alertAppDialog('Nada para salvar.');
        return;
    }

    setConvActivitiesSaveLoading(true, 'Salvando...');

    try {
        if (activities.length) {
            await persistRequestActivities(editingConversationId, activities);
        }

        if (responseText && (canRespondAsConsultor(conv) || canRespondAsProjetista(conv))) {
            const { error } = await persistRequestDraftResponse(editingConversationId, conv, responseText);
            if (error) {
                alertAppDialog('Erro ao salvar resposta: ' + error.message);
                setConvActivitiesSaveLoading(false);
                return;
            }
            if (canRespondAsConsultor(conv)) {
                conv.commercialResponse = responseText;
            } else if (canRespondAsProjetista(conv)) {
                conv.designerResponse = responseText;
            }
        }

        setConvActivitiesSaveLoading(true, 'Salvo!');
        updateConvModalActivitiesHint();
        setTimeout(() => setConvActivitiesSaveLoading(false), 1200);
    } catch (err) {
        alertAppDialog('Erro ao salvar: ' + (err.message || err));
        setConvActivitiesSaveLoading(false);
    }
}

function validateRequestActivitiesBeforeReply(activities) {
    if (!activities.length) return true;
    if (allRequestActivitiesCompleted(activities)) return true;
    alertAppDialog('Marque todas as atividades como realizadas antes de responder.');
    return false;
}

function canEditRequestActivityDescriptions(conv) {
    if (conv && isRequestClosed(conv)) return false;
    if (isConvRespondOnlyMode(conv)) return false;
    if (currentUser?.role === 'Admin') return true;

    if (!conv) {
        const profile = getRequestProfileForCreate();
        if (profile === 'Projetista') return currentUser?.role === 'Projetista';
        if (profile === 'Consultor') return currentUser?.role === 'Consultor';
        return false;
    }

    const profile = conv.requestProfile || 'Projetista';
    if (profile === 'Projetista') {
        return currentUser?.role === 'Projetista' && conv.designerId === currentUser.id;
    }
    return currentUser?.role === 'Consultor' && isOrderConsultorForRequest(conv);
}

function canEditRequestActivityCompletion(conv) {
    if (!conv || isRequestClosed(conv)) return false;
    if (currentUser?.role === 'Admin') return true;

    if (isRequestWaitingConsultor(conv)) {
        return currentUser?.role === 'Consultor' && isOrderConsultorForRequest(conv);
    }
    if (isRequestWaitingProjetista(conv)) {
        return currentUser?.role === 'Projetista' && conv.designerId === currentUser.id;
    }
    return false;
}

function resetConvActivities() {
    requestActivityRowCounter = 0;
    const tbody = document.getElementById('conv-activities-list');
    if (tbody) tbody.innerHTML = '';
    const emptyMsg = document.getElementById('conv-activities-empty-msg');
    if (emptyMsg) emptyMsg.classList.remove('hidden');
}

function updateRequestActivityModalControls(conv) {
    const addBtn = document.getElementById('btn-add-request-activity');
    const saveWrap = document.getElementById('conv-activities-save-wrap');
    const canEditDescriptions = canEditRequestActivityDescriptions(conv);
    const canEditCompletion = canEditRequestActivityCompletion(conv);
    const canSaveProgress = conv && !isRequestClosed(conv) && (
        canEditCompletion
        || canRespondAsConsultor(conv)
        || canRespondAsProjetista(conv)
    );
    if (addBtn) {
        addBtn.classList.toggle('hidden', !canEditDescriptions);
    }
    if (saveWrap) {
        saveWrap.classList.toggle('hidden', !canSaveProgress);
    }
    const emptyMsg = document.getElementById('conv-activities-empty-msg');
    const hasRows = document.querySelectorAll('#conv-activities-list tr').length > 0;
    if (emptyMsg) {
        emptyMsg.classList.toggle('hidden', hasRows);
    }
}

function renderRequestActivityRow(activity, conv) {
    const canEditDescriptions = canEditRequestActivityDescriptions(conv);
    const canEditCompletion = canEditRequestActivityCompletion(conv);
    const rowId = activity.id || activity.tempId;

    const tr = document.createElement('tr');
    tr.dataset.rowId = rowId;
    if (activity.completedAt) {
        tr.dataset.completedAt = activity.completedAt;
    }

    tr.innerHTML = `
        <td class="p-3 align-top">
            <textarea rows="2" class="request-activity-description revision-resizable-input px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 disabled:bg-slate-50"
                placeholder="Descreva a atividade..."
                ${canEditDescriptions ? '' : 'disabled'}>${escapeHtml(activity.description || '')}</textarea>
        </td>
        <td class="p-3 align-middle text-center">
            <input type="checkbox" class="request-activity-completed h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                ${activity.completed ? 'checked' : ''}
                ${canEditCompletion ? '' : 'disabled'}>
        </td>
        <td class="p-3 align-top">
            <textarea rows="2" class="request-activity-observation revision-resizable-input px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 disabled:bg-slate-50"
                placeholder="Observação..."
                ${canEditCompletion ? '' : 'disabled'}>${escapeHtml(activity.observation || '')}</textarea>
        </td>
        <td class="p-3 align-middle">
            <p class="request-activity-completed-at px-2 py-1.5 text-xs border border-slate-100 rounded-lg bg-slate-50 text-slate-600 whitespace-nowrap">
                ${activity.completedAt ? formatDate(activity.completedAt) : '—'}
            </p>
        </td>
    `;

    const checkbox = tr.querySelector('.request-activity-completed');
    const completedAtEl = tr.querySelector('.request-activity-completed-at');
    checkbox?.addEventListener('change', async function () {
        if (this.checked) {
            const now = new Date().toISOString();
            tr.dataset.completedAt = now;
            completedAtEl.textContent = formatDate(now);
        } else {
            delete tr.dataset.completedAt;
            completedAtEl.textContent = '—';
        }
        updateConvModalActivitiesHint();
    });

    return tr;
}

function addRequestActivityRow(activity = {}, conv = null) {
    const request = conv || getCurrentEditingRequest();
    if (!activity.tempId && !activity.id) {
        requestActivityRowCounter += 1;
        activity.tempId = `temp-${requestActivityRowCounter}`;
    }

    document.getElementById('conv-activities-list').appendChild(renderRequestActivityRow(activity, request));
    document.getElementById('conv-activities-empty-msg').classList.add('hidden');
    updateRequestActivityModalControls(request);
}

function collectRequestActivitiesFromDom() {
    const rows = document.querySelectorAll('#conv-activities-list tr');
    return Array.from(rows).map((tr, index) => {
        const rowId = tr.dataset.rowId;
        const isPersisted = rowId && !String(rowId).startsWith('temp-');
        const completed = tr.querySelector('.request-activity-completed')?.checked || false;

        return {
            id: isPersisted ? Number(rowId) : null,
            description: tr.querySelector('.request-activity-description')?.value.trim() || '',
            completed,
            observation: tr.querySelector('.request-activity-observation')?.value.trim() || '',
            completedAt: completed ? (tr.dataset.completedAt || new Date().toISOString()) : null,
            sortOrder: index
        };
    });
}

function collectRequestActivitiesFromCard(requestId) {
    const card = document.querySelector(`[data-request-activities-card="${requestId}"]`);
    if (!card) return [];

    return Array.from(card.querySelectorAll('tr[data-row-id]')).map((tr, index) => {
        const rowId = tr.dataset.rowId;
        const completed = tr.querySelector('.request-activity-completed')?.checked || false;

        return {
            id: rowId ? Number(rowId) : null,
            description: tr.querySelector('.request-activity-description')?.value.trim()
                || tr.querySelector('td:first-child')?.textContent.trim()
                || '',
            completed,
            observation: tr.querySelector('.request-activity-observation')?.value.trim() || '',
            completedAt: completed ? (tr.dataset.completedAt || new Date().toISOString()) : null,
            sortOrder: index
        };
    }).filter(a => a.description);
}

async function loadRequestActivitiesForModal(requestId) {
    const tbody = document.getElementById('conv-activities-list');
    tbody.innerHTML = '';

    const { data: activities, error } = await supabaseClient
        .from('OrderRequestActivity')
        .select('*')
        .eq('orderRequestId', requestId)
        .order('sortOrder', { ascending: true })
        .order('id', { ascending: true });

    if (error) {
        if (error.message?.includes('OrderRequestActivity')) {
            updateRequestActivityModalControls(getCurrentEditingRequest());
            return;
        }
        alertAppDialog('Erro ao carregar atividades da requisição: ' + error.message);
        return;
    }

    const conv = getCurrentEditingRequest();
    if (!activities?.length) {
        updateRequestActivityModalControls(conv);
        return;
    }

    activities.forEach(activity => addRequestActivityRow(activity, conv));
}

async function fetchRequestActivitiesByRequestIds(requestIds) {
    if (!requestIds.length) return {};

    const { data: activities, error } = await supabaseClient
        .from('OrderRequestActivity')
        .select('id, orderRequestId, description, completed, observation, completedAt, sortOrder')
        .in('orderRequestId', requestIds)
        .order('sortOrder', { ascending: true })
        .order('id', { ascending: true });

    if (error) {
        if (error.message?.includes('OrderRequestActivity')) return {};
        console.error('fetchRequestActivitiesByRequestIds:', error);
        return {};
    }

    const byRequest = {};
    activities?.forEach(activity => {
        if (!byRequest[activity.orderRequestId]) {
            byRequest[activity.orderRequestId] = [];
        }
        byRequest[activity.orderRequestId].push(activity);
    });
    return byRequest;
}

async function persistRequestActivities(requestId, activities) {
    if (!requestId || !activities) return;

    const filtered = activities.filter(a => a.description);
    const now = new Date().toISOString();

    for (const activity of filtered) {
        const payload = {
            description: activity.description,
            completed: activity.completed,
            observation: activity.observation || null,
            completedAt: activity.completed ? activity.completedAt : null,
            sortOrder: activity.sortOrder,
            updatedAt: now
        };

        if (activity.id) {
            const { error } = await supabaseClient
                .from('OrderRequestActivity')
                .update(payload)
                .eq('id', activity.id);
            if (error) {
                console.warn('persistRequestActivities update:', error);
            }
        } else {
            const { error } = await supabaseClient
                .from('OrderRequestActivity')
                .insert([{ ...payload, orderRequestId: requestId }]);
            if (error) {
                console.warn('persistRequestActivities insert:', error);
            }
        }
    }
}

function renderRequestActivityReadonlyRow(activity) {
    return `
        <tr class="border-t border-slate-100">
            <td class="py-2 pr-2 align-top">${renderRevisionResizableText(activity.description)}</td>
            <td class="py-2 px-2 text-center text-xs align-middle">
                ${activity.completed
                    ? '<span class="text-emerald-700 font-semibold">Sim</span>'
                    : '<span class="text-slate-400">Não</span>'}
            </td>
            <td class="py-2 px-2 align-top">${renderRevisionResizableText(activity.observation, 'muted')}</td>
            <td class="py-2 pl-2 text-xs text-slate-500 whitespace-nowrap align-middle">${activity.completedAt ? formatDate(activity.completedAt) : '—'}</td>
        </tr>
    `;
}

function renderRequestActivityCardRow(activity, conv, canComplete) {
    const rowId = activity.id;
    const completedAt = activity.completedAt || '';
    return `
        <tr data-row-id="${rowId}" ${completedAt ? `data-completed-at="${completedAt}"` : ''}>
            <td class="py-2 pr-2 align-top text-xs text-slate-800">${escapeHtml(activity.description || '—')}</td>
            <td class="py-2 px-2 text-center align-middle">
                <input type="checkbox" class="request-activity-completed h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    ${activity.completed ? 'checked' : ''}
                    ${canComplete ? '' : 'disabled'}>
            </td>
            <td class="py-2 px-2 align-top">
                <textarea rows="2" class="request-activity-description hidden" disabled>${escapeHtml(activity.description || '')}</textarea>
                <textarea rows="2" class="request-activity-observation revision-resizable-input px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 disabled:bg-slate-50 w-full"
                    placeholder="Observação..."
                    ${canComplete ? '' : 'disabled'}>${escapeHtml(activity.observation || '')}</textarea>
            </td>
            <td class="py-2 pl-2 align-middle">
                <p class="request-activity-completed-at text-xs text-slate-500 whitespace-nowrap">${activity.completedAt ? formatDate(activity.completedAt) : '—'}</p>
            </td>
        </tr>
    `;
}

function bindRequestActivityCardEvents(container, conv) {
    const canComplete = canEditRequestActivityCompletion(conv);
    if (!canComplete) return;

    container.querySelectorAll('tr[data-row-id]').forEach(tr => {
        const checkbox = tr.querySelector('.request-activity-completed');
        const completedAtEl = tr.querySelector('.request-activity-completed-at');
        checkbox?.addEventListener('change', async function () {
            if (this.checked) {
                const now = new Date().toISOString();
                tr.dataset.completedAt = now;
                completedAtEl.textContent = formatDate(now);
            } else {
                delete tr.dataset.completedAt;
                completedAtEl.textContent = '—';
            }
            updateRequestReplyControls(conv.id);
        });
    });
}

function appendRequestActivitiesToCard(container, conv, activities) {
    if (!activities?.length) return;

    const canComplete = canEditRequestActivityCompletion(conv);
    const isClosed = isRequestClosed(conv);
    const rowsHtml = isClosed || !canComplete
        ? activities.map(renderRequestActivityReadonlyRow).join('')
        : activities.map(a => renderRequestActivityCardRow(a, conv, canComplete)).join('');

    const section = document.createElement('div');
    section.className = 'bg-violet-50/60 border border-violet-100 rounded-xl overflow-hidden';
    section.dataset.requestActivitiesCard = conv.id;
    section.innerHTML = `
        <div class="px-3 py-2 border-b border-violet-100 bg-violet-50">
            <p class="text-[10px] font-bold text-violet-700 uppercase">Atividades</p>
        </div>
        <div class="overflow-x-auto bg-white/60 p-2">
            <table class="revision-history-table min-w-[480px] w-full text-xs">
                <colgroup>
                    <col style="width:36%">
                    <col style="width:72px">
                    <col style="width:36%">
                    <col style="width:112px">
                </colgroup>
                <thead class="text-[9px] uppercase text-slate-500">
                    <tr>
                        <th class="px-2 py-1 font-semibold text-left">Atividade</th>
                        <th class="px-2 py-1 font-semibold text-center">Realizado</th>
                        <th class="px-2 py-1 font-semibold text-left">Observação</th>
                        <th class="px-2 py-1 font-semibold text-left">Data</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
    container.appendChild(section);
    bindRequestActivityCardEvents(section, conv);
    if (canComplete) {
        updateRequestReplyControls(conv.id);
    }
}

function bindRequestActivityEvents() {
    document.getElementById('btn-add-request-activity')?.addEventListener('click', async function () {
        const conv = getCurrentEditingRequest();
        if (!canEditRequestActivityDescriptions(conv)) return;
        addRequestActivityRow({}, conv);
    });

    document.getElementById('conv-profile')?.addEventListener('change', async function () {
        updateRequestActivityModalControls(getCurrentEditingRequest());
    });

    document.getElementById('btn-save-conv-activities')?.addEventListener('click', saveRequestActivitiesFromModal);

    ['conv-response', 'conv-designer-response'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateConvModalActivitiesHint);
    });
}

window.saveRequestActivitiesFromCard = saveRequestActivitiesFromCard;
