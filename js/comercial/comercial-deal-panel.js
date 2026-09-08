function closeComercialDealPanel() {
    const overlay = document.getElementById('comercial-deal-overlay');
    overlay?.classList.add('hidden');
    overlay?.setAttribute('aria-hidden', 'true');
}

function fillComercialDealOwnerSelect(selectedId) {
    const select = document.getElementById('comercial-deal-owner');
    if (!select) return;
    const ownerId = selectedId || currentUser?.id;
    select.innerHTML = (comercialConsultantsCache || []).map(user => (
        `<option value="${user.id}" ${Number(user.id) === Number(ownerId) ? 'selected' : ''}>${escapeHtml(user.name)}</option>`
    )).join('');
    if (!select.value && currentUser?.id) {
        const option = document.createElement('option');
        option.value = String(currentUser.id);
        option.selected = true;
        option.textContent = currentUser.name || 'Eu';
        select.appendChild(option);
    }
}

function fillComercialDealStageSelect(selectedId) {
    const select = document.getElementById('comercial-deal-stage');
    if (!select) return;
    const openStages = (comercialStagesCache || []).filter(stage => stage.outcome === 'open' && stage.isActive !== false);
    select.innerHTML = openStages.map(stage => (
        `<option value="${stage.id}" ${Number(stage.id) === Number(selectedId) ? 'selected' : ''}>${escapeHtml(stage.name)}</option>`
    )).join('');
}

function setComercialDealClient(client) {
    const nameEl = document.getElementById('comercial-deal-client');
    const idEl = document.getElementById('comercial-deal-client-id');
    if (nameEl) nameEl.value = client?.name || '';
    if (idEl) idEl.value = client?.id || '';
}

async function loadClientIntoDealForm(clientId) {
    if (!clientId) {
        setComercialDealClient(null);
        return;
    }
    const { data } = await supabaseClient
        .from('Client')
        .select('id, name')
        .eq('id', clientId)
        .maybeSingle();
    setComercialDealClient(data || { id: clientId, name: '' });
}

async function openComercialDealPanel(dealId) {
    const overlay = document.getElementById('comercial-deal-overlay');
    if (!overlay) return;
    await loadComercialStages(true);
    await loadComercialConsultants();
    document.getElementById('comercial-deal-form')?.reset();
    document.getElementById('comercial-deal-id').value = dealId || '';
    document.getElementById('comercial-activity-form')?.classList.add('hidden');
    document.getElementById('comercial-deal-lost-banner')?.classList.add('hidden');
    fillComercialDealOwnerSelect(currentUser?.id);
    fillComercialDealStageSelect(comercialStagesCache[0]?.id);
    if (typeof fillArchitectPickerField === 'function') {
        await fillArchitectPickerField('comercial-deal-architect', null);
    }
    document.getElementById('comercial-deal-owner-wrap')?.classList.toggle('hidden', !canSeeAllDeals());
    const extras = document.getElementById('comercial-deal-extras');
    extras?.classList.toggle('hidden', !dealId);

    if (dealId) {
        const cached = comercialDealsCache.find(item => Number(item.id) === Number(dealId));
        let deal = cached || null;
        if (!deal) {
            for (const select of COMMERCIAL_DEAL_SELECT) {
                const { data, error } = await supabaseClient.from('Deal').select(select).eq('id', dealId).maybeSingle();
                if (!error && data) {
                    deal = data;
                    break;
                }
                if (error && !/relationship|embed|schema cache|column/i.test(error.message || '')) break;
            }
        }
        if (!deal) {
            alertAppDialog('Negócio não encontrado.');
            return;
        }
        document.getElementById('comercial-deal-title-label').textContent = deal.title || 'Negócio';
        document.getElementById('comercial-deal-title').value = deal.title || '';
        fillComercialDealStageSelect(deal.stageId);
        fillComercialDealOwnerSelect(deal.ownerUserId);
        if (typeof fillArchitectPickerField === 'function') {
            await fillArchitectPickerField(
                'comercial-deal-architect',
                deal.architectId || deal.architect?.id || null,
                deal.architect?.name || ''
            );
        }
        document.getElementById('comercial-deal-temperature').value = deal.temperature || '';
        document.getElementById('comercial-deal-value').value = deal.value != null
            ? (typeof formatSaleValueAsCurrencyInput === 'function' ? formatSaleValueAsCurrencyInput(deal.value) : String(deal.value))
            : '';
        document.getElementById('comercial-deal-expected-close').value = deal.expectedCloseDate || '';
        document.getElementById('comercial-deal-wps-quote-code').value = deal.wpsQuoteCode || '';
        if (deal.client) setComercialDealClient(deal.client);
        else await loadClientIntoDealForm(deal.clientId);
        const canEdit = canEditComercialDeal(deal);
        extras?.classList.remove('hidden');
        document.getElementById('comercial-deal-win')?.classList.toggle('hidden', deal.status !== 'open' || !canEdit);
        document.getElementById('comercial-deal-lose')?.classList.toggle('hidden', deal.status !== 'open' || !canEdit);
        const lostBanner = document.getElementById('comercial-deal-lost-banner');
        if (lostBanner) {
            const showLost = deal.status === 'lost' && deal.lostReason;
            lostBanner.classList.toggle('hidden', !showLost);
            lostBanner.textContent = showLost ? `Motivo da perda: ${deal.lostReason}` : '';
        }
        await renderComercialDealNotes(dealId);
        await renderComercialDealActivities(dealId);
    } else {
        document.getElementById('comercial-deal-title-label').textContent = 'Novo negócio';
        setComercialDealClient(null);
        document.getElementById('comercial-deal-win')?.classList.add('hidden');
        document.getElementById('comercial-deal-lose')?.classList.add('hidden');
    }

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
}

function parseComercialDealValue() {
    const raw = document.getElementById('comercial-deal-value')?.value;
    if (typeof parseSaleValueInput === 'function') {
        const parsed = parseSaleValueInput(raw);
        return Number.isNaN(parsed) ? null : parsed;
    }
    const normalized = String(raw || '').replace(/\./g, '').replace(',', '.').trim();
    if (!normalized) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

async function saveComercialDeal(event) {
    event?.preventDefault();
    if (!canAccessComercial()) return;

    const title = document.getElementById('comercial-deal-title')?.value.trim();
    if (!title) {
        alertAppDialog('Informe o título do negócio.');
        return;
    }

    const stageId = Number(document.getElementById('comercial-deal-stage')?.value);
    if (!stageId) {
        alertAppDialog('Cadastre um estágio do funil em Gestão antes de criar o negócio.');
        return;
    }

    let clientId = Number(document.getElementById('comercial-deal-client-id')?.value) || null;
    const clientName = document.getElementById('comercial-deal-client')?.value.trim();
    if (!clientId && clientName && typeof resolveOrCreateClienteId === 'function') {
        clientId = await resolveOrCreateClienteId(clientName);
    }

    const dealId = Number(document.getElementById('comercial-deal-id')?.value) || null;
    const ownerUserId = canSeeAllDeals()
        ? (Number(document.getElementById('comercial-deal-owner')?.value) || currentUser.id)
        : (dealId
            ? (comercialDealsCache.find(item => Number(item.id) === dealId)?.ownerUserId || currentUser.id)
            : currentUser.id);

    const now = new Date().toISOString();
    const payload = {
        title,
        clientId,
        ownerUserId,
        stageId,
        architectId: Number(document.getElementById('comercial-deal-architect-id')?.value) || null,
        temperature: document.getElementById('comercial-deal-temperature')?.value || null,
        value: parseComercialDealValue(),
        expectedCloseDate: document.getElementById('comercial-deal-expected-close')?.value || null,
        wpsQuoteCode: document.getElementById('comercial-deal-wps-quote-code')?.value.trim() || null,
        updatedAt: now,
        updatedById: currentUser.id
    };

    async function persistDealPayload(fullPayload, isInsert) {
        const optionalColumns = ['architectId', 'wpsQuoteCode'];
        let payload = isInsert
            ? { ...fullPayload, status: 'open', createdAt: now, createdById: currentUser.id }
            : { ...fullPayload };

        for (let attempt = 0; attempt <= optionalColumns.length; attempt++) {
            if (isInsert) {
                const { data, error } = await supabaseClient.from('Deal').insert(payload).select('id').single();
                if (!error) return { data, error };
                const missing = optionalColumns.find(column => payload[column] !== undefined
                    && new RegExp(column, 'i').test(error.message || ''));
                if (!missing) return { data, error };
                const { [missing]: _dropped, ...rest } = payload;
                payload = rest;
                continue;
            }
            const { error } = await supabaseClient.from('Deal').update(payload).eq('id', dealId);
            if (!error) return { error };
            const missing = optionalColumns.find(column => payload[column] !== undefined
                && new RegExp(column, 'i').test(error.message || ''));
            if (!missing) return { error };
            const { [missing]: _dropped, ...rest } = payload;
            payload = rest;
        }
        return { error: { message: 'Não foi possível salvar o negócio.' } };
    }

    let savedId = dealId;
    if (dealId) {
        const { error } = await persistDealPayload(payload, false);
        if (error) {
            alertAppDialog('Erro ao salvar o negócio: ' + error.message);
            return;
        }
    } else {
        const { data, error } = await persistDealPayload(payload, true);
        if (error) {
            alertAppDialog('Erro ao criar o negócio: ' + error.message);
            return;
        }
        savedId = data.id;
        document.getElementById('comercial-deal-id').value = String(savedId);
        document.getElementById('comercial-deal-extras')?.classList.remove('hidden');
        document.getElementById('comercial-deal-win')?.classList.remove('hidden');
        document.getElementById('comercial-deal-lose')?.classList.remove('hidden');
    }

    await refreshComercialView();
    if (savedId) await openComercialDealPanel(savedId);
}

async function winComercialDeal() {
    const dealId = Number(document.getElementById('comercial-deal-id')?.value);
    if (!dealId) {
        alertAppDialog('Salve o negócio antes de ganhar.');
        return;
    }
    const clientId = Number(document.getElementById('comercial-deal-client-id')?.value);
    if (!clientId) {
        alertAppDialog('Informe o cliente para marcar o negócio como ganho.');
        return;
    }
    if (!(await confirmAppDialog('Marcar este negócio como ganho? O pedido continua sendo criado depois na Gestão.'))) return;
    const { error } = await supabaseClient.from('Deal').update({
        status: 'won',
        wonAt: new Date().toISOString(),
        clientId,
        updatedAt: new Date().toISOString(),
        updatedById: currentUser.id
    }).eq('id', dealId);
    if (error) {
        alertAppDialog('Não foi possível ganhar o negócio: ' + error.message);
        return;
    }
    closeComercialDealPanel();
    await refreshComercialView();
}

async function loseComercialDeal() {
    const dealId = Number(document.getElementById('comercial-deal-id')?.value);
    if (!dealId) {
        alertAppDialog('Salve o negócio antes de perder.');
        return;
    }
    if (typeof openDealLostReasonModal === 'function') {
        await openDealLostReasonModal(dealId);
        return;
    }
    alertAppDialog('Não foi possível abrir os motivos de perda.');
}

async function confirmLostComercialDeal() {
    const dealId = Number(document.getElementById('comercial-deal-id')?.value)
        || (typeof pendingLoseDealId !== 'undefined' ? pendingLoseDealId : null);
    if (!dealId) {
        alertAppDialog('Salve o negócio antes de perder.');
        return;
    }
    const lostReason = typeof getSelectedDealLostReasonName === 'function'
        ? getSelectedDealLostReasonName()
        : '';
    if (!lostReason) {
        alertAppDialog('Selecione ou cadastre o motivo da perda.');
        return;
    }
    await persistLostComercialDeal(dealId, lostReason);
}

async function persistLostComercialDeal(dealId, lostReason) {
    const { error } = await supabaseClient.from('Deal').update({
        status: 'lost',
        lostAt: new Date().toISOString(),
        lostReason,
        updatedAt: new Date().toISOString(),
        updatedById: currentUser.id
    }).eq('id', dealId);
    if (error) {
        alertAppDialog('Não foi possível perder o negócio: ' + error.message);
        return;
    }
    toggleModal('deal-lost-reason-modal', false);
    closeComercialDealPanel();
    await refreshComercialView();
}

async function renderComercialDealNotes(dealId) {
    const box = document.getElementById('comercial-deal-notes');
    if (!box) return;
    const { data, error } = await supabaseClient
        .from('DealNote')
        .select('id, body, createdAt, createdById')
        .eq('dealId', dealId)
        .order('createdAt', { ascending: false });
    if (error) {
        box.innerHTML = `<p class="text-[11px] text-slate-400">${escapeHtml(error.message)}</p>`;
        return;
    }
    if (!data?.length) {
        box.innerHTML = '<p class="text-[11px] text-slate-400">Nenhuma nota ainda.</p>';
        return;
    }
    box.innerHTML = data.map(note => `
        <div class="text-xs bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">
            <p class="text-slate-700 whitespace-pre-wrap">${escapeHtml(note.body)}</p>
            <p class="text-[10px] text-slate-400 mt-1">${escapeHtml(formatComercialDate(note.createdAt))}</p>
        </div>
    `).join('');
}

async function saveComercialNote(event) {
    event.preventDefault();
    const dealId = Number(document.getElementById('comercial-deal-id')?.value);
    const body = document.getElementById('comercial-note-body')?.value.trim();
    if (!dealId || !body) return;
    const { error } = await supabaseClient.from('DealNote').insert({
        dealId,
        body,
        createdById: currentUser.id
    });
    if (error) {
        alertAppDialog('Erro ao salvar a nota: ' + error.message);
        return;
    }
    if (typeof touchComercialDealUpdatedAt === 'function') {
        await touchComercialDealUpdatedAt(dealId);
    }
    document.getElementById('comercial-note-body').value = '';
    await renderComercialDealNotes(dealId);
    if (typeof refreshComercialView === 'function') await refreshComercialView();
}

function bindComercialDealPanelEvents() {
    document.getElementById('btn-comercial-deal-close')?.addEventListener('click', closeComercialDealPanel);
    document.getElementById('comercial-deal-overlay')?.addEventListener('click', event => {
        if (event.target.id === 'comercial-deal-overlay') closeComercialDealPanel();
    });
    document.getElementById('comercial-deal-form')?.addEventListener('submit', saveComercialDeal);
    document.getElementById('comercial-deal-win')?.addEventListener('click', winComercialDeal);
    document.getElementById('comercial-deal-lose')?.addEventListener('click', loseComercialDeal);
    document.getElementById('deal-lost-reason-confirm')?.addEventListener('click', confirmLostComercialDeal);
    document.getElementById('comercial-note-form')?.addEventListener('submit', saveComercialNote);
    const openClientPicker = () => {
        if (typeof openClientePickerModal !== 'function') return;
        openClientePickerModal(cliente => {
            setComercialDealClient(cliente);
        });
    };
    document.getElementById('comercial-deal-client-picker')?.addEventListener('click', openClientPicker);
    document.getElementById('comercial-deal-client')?.addEventListener('click', openClientPicker);
    document.getElementById('comercial-deal-client-view')?.addEventListener('click', () => {
        if (typeof openClientDetailsModal !== 'function') return;
        openClientDetailsModal(document.getElementById('comercial-deal-client-id')?.value);
    });
    const openArchitectPicker = () => {
        if (typeof openArchitectPickerModal !== 'function') return;
        openArchitectPickerModal(architect => {
            document.getElementById('comercial-deal-architect').value = architect?.name || '';
            document.getElementById('comercial-deal-architect-id').value = architect?.id || '';
        });
    };
    document.getElementById('comercial-deal-architect-picker')?.addEventListener('click', openArchitectPicker);
    document.getElementById('comercial-deal-architect')?.addEventListener('click', openArchitectPicker);
    document.getElementById('comercial-deal-architect-view')?.addEventListener('click', () => {
        if (typeof openArchitectDetailsModal !== 'function') return;
        openArchitectDetailsModal(document.getElementById('comercial-deal-architect-id')?.value);
    });
    if (typeof bindSaleValueCurrencyInput === 'function') {
        bindSaleValueCurrencyInput(document.getElementById('comercial-deal-value'));
    }
}
