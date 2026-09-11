async function loadComercialBoard() {
    const board = document.getElementById('comercial-board');
    if (!board) return;
    board.innerHTML = '<p class="text-xs text-slate-400 p-4">Carregando funil...</p>';
    await loadComercialDeals('open');
    await fillComercialConsultantSelect();
    renderComercialBoard();
}

function renderComercialBoard() {
    const board = document.getElementById('comercial-board');
    if (!board) return;

    const openStages = (comercialStagesCache || []).filter(stage => stage.outcome === 'open' && stage.isActive !== false);
    if (!openStages.length) {
        board.innerHTML = '<p class="text-xs text-amber-700 p-4">Nenhum estágio ativo. Cadastre em Configurações → Estágios do funil ou execute o SQL do funil.</p>';
        return;
    }

    const deals = filterComercialBoardDeals(comercialDealsCache);
    board.innerHTML = '';

    openStages.forEach(stage => {
        const columnDeals = deals.filter(deal => Number(deal.stageId) === Number(stage.id));
        const columnTotal = sumComercialDealValues(columnDeals);
        const column = document.createElement('section');
        column.className = 'comercial-column';
        column.dataset.stageId = String(stage.id);
        column.innerHTML = `
            <div class="comercial-column__head">
                <p class="text-xs font-semibold text-slate-800">${escapeHtml(stage.name)}</p>
                <div class="flex items-baseline justify-between gap-2 mt-0.5">
                    <p class="text-[10px] text-slate-400">${columnDeals.length} negócio(s)</p>
                    <p class="text-[11px] font-semibold text-slate-700">${escapeHtml(formatComercialMoney(columnTotal) || 'R$ 0,00')}</p>
                </div>
            </div>
            <div class="comercial-column__cards" data-stage-drop="${stage.id}"></div>
        `;
        const cards = column.querySelector('.comercial-column__cards');
        if (!columnDeals.length) {
            cards.innerHTML = '<p class="text-[11px] text-slate-400 px-1 py-3 text-center">Vazio</p>';
        } else {
            columnDeals.forEach(deal => cards.appendChild(buildComercialDealCard(deal)));
        }
        bindComercialColumnDrop(cards, stage.id);
        board.appendChild(column);
    });
}

function renderComercialDealCardField(label, value, valueClass = '') {
    return `
        <p class="comercial-card__field">
            <span class="comercial-card__label">${escapeHtml(label)}</span>
            <span class="comercial-card__value ${valueClass}">${escapeHtml(value || '—')}</span>
        </p>
    `;
}

function buildComercialDealCardNextActivityLabel(deal, next, overdue) {
    if (!next) {
        return deal.status === 'open' ? 'Sem próxima atividade' : '—';
    }
    const type = COMMERCIAL_ACTIVITY_TYPE_LABELS[next.type] || next.type;
    const date = formatComercialDate(next.dueDate);
    const time = next.dueTime ? ` ${String(next.dueTime).slice(0, 5)}` : '';
    const subject = next.subject ? ` — ${next.subject}` : '';
    const prefix = overdue ? 'Atrasada: ' : '';
    return `${prefix}${type} · ${date}${time}${subject}`;
}

function buildComercialDealCard(deal) {
    const next = getDealNextActivity(deal);
    const overdue = isDealNextOverdue(deal);
    const noNext = deal.status === 'open' && !next;
    const card = document.createElement('article');
    card.className = `comercial-card${overdue ? ' comercial-card--overdue' : ''}${noNext ? ' comercial-card--no-next' : ''}`;
    card.draggable = deal.status === 'open' && canEditComercialDeal(deal);
    card.dataset.dealId = String(deal.id);
    const temp = deal.temperature
        ? `<span class="comercial-temp comercial-temp--${escapeHtml(deal.temperature)}">${escapeHtml(COMMERCIAL_TEMPERATURE_LABELS[deal.temperature] || deal.temperature)}</span>`
        : '';
    const waitingOrder = deal.status === 'won' && !deal.orderId
        ? '<p class="text-[10px] text-amber-700 font-semibold mt-1">Aguardando pedido</p>'
        : '';
    const nextActivityLabel = buildComercialDealCardNextActivityLabel(deal, next, overdue);
    const nextValueClass = overdue || noNext ? 'comercial-card__value--alert' : '';
    card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
            <p class="text-xs font-semibold text-slate-800 leading-snug min-w-0">${escapeHtml(deal.title || 'Sem título')}</p>
            ${temp}
        </div>
        <div class="comercial-card__fields">
            ${renderComercialDealCardField('Cliente:', deal.client?.name || 'Sem cliente')}
            ${renderComercialDealCardField('Arquiteto:', deal.architect?.name)}
            ${renderComercialDealCardField('Consultor:', deal.owner?.name)}
            ${renderComercialDealCardField('Valor:', formatComercialMoney(deal.value) || '—')}
            ${renderComercialDealCardField('Próx. atividade:', nextActivityLabel, nextValueClass)}
        </div>
        ${deal.wpsQuoteCode ? `<p class="text-[10px] text-slate-400 mt-1 font-mono">WPS ${escapeHtml(deal.wpsQuoteCode)}</p>` : ''}
        ${waitingOrder}
    `;
    card.addEventListener('click', () => openComercialDealPanel(deal.id));
    card.addEventListener('dragstart', event => {
        event.dataTransfer.setData('text/plain', String(deal.id));
        card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
    return card;
}

function bindComercialColumnDrop(cardsEl, stageId) {
    cardsEl.addEventListener('dragover', event => {
        event.preventDefault();
        cardsEl.classList.add('ring-1', 'ring-amber-300');
    });
    cardsEl.addEventListener('dragleave', () => {
        cardsEl.classList.remove('ring-1', 'ring-amber-300');
    });
    cardsEl.addEventListener('drop', async event => {
        event.preventDefault();
        cardsEl.classList.remove('ring-1', 'ring-amber-300');
        const dealId = Number(event.dataTransfer.getData('text/plain'));
        if (!dealId) return;
        const deal = comercialDealsCache.find(item => Number(item.id) === dealId);
        if (!deal || !canEditComercialDeal(deal)) return;
        if (Number(deal.stageId) === Number(stageId)) return;
        const { error } = await supabaseClient
            .from('Deal')
            .update({
                stageId: Number(stageId),
                updatedAt: new Date().toISOString(),
                updatedById: currentUser?.id || null
            })
            .eq('id', dealId);
        if (error) {
            alertAppDialog('Não foi possível mover o negócio: ' + error.message);
            return;
        }
        await loadComercialBoard();
    });
}

async function loadComercialStatusList(status) {
    const list = document.getElementById('comercial-status-list');
    if (!list) return;
    list.innerHTML = '<p class="text-xs text-slate-400">Carregando...</p>';
    await loadComercialDeals(status);
    await fillComercialConsultantSelect();
    const deals = filterComercialBoardDeals(comercialDealsCache);
    if (!deals.length) {
        list.innerHTML = `<p class="text-xs text-slate-400">${status === 'won' ? 'Nenhum negócio ganho.' : 'Nenhum negócio perdido.'}</p>`;
        return;
    }
    list.innerHTML = '';
    deals.forEach(deal => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'w-full text-left bg-white border border-slate-200 rounded-xl px-3 py-3 hover:border-amber-300';
        const extra = status === 'won' && !deal.orderId
            ? '<span class="text-[10px] font-semibold text-amber-700">Aguardando pedido</span>'
            : (status === 'lost' && deal.lostReason
                ? `<span class="text-[10px] text-red-700">${escapeHtml(deal.lostReason)}</span>`
                : (deal.order?.orderCode ? `<span class="text-[10px] text-slate-400">Pedido ${escapeHtml(deal.order.orderCode)}</span>` : ''));
        const temp = deal.temperature
            ? `<span class="comercial-temp comercial-temp--${escapeHtml(deal.temperature)}">${escapeHtml(COMMERCIAL_TEMPERATURE_LABELS[deal.temperature] || deal.temperature)}</span>`
            : '';
        row.innerHTML = `
            <div class="flex flex-wrap justify-between gap-2">
                <p class="text-sm font-semibold text-slate-800">${escapeHtml(deal.title || '')}</p>
                <div class="flex items-center gap-2">
                    ${temp}
                    <p class="text-xs text-slate-500">${escapeHtml(formatComercialMoney(deal.value) || '—')}</p>
                </div>
            </div>
            <p class="text-xs text-slate-500 mt-1">${escapeHtml(deal.client?.name || 'Sem cliente')} · ${escapeHtml(deal.owner?.name || '—')}</p>
            ${deal.wpsQuoteCode ? `<p class="text-[10px] text-slate-400 font-mono mt-0.5">WPS ${escapeHtml(deal.wpsQuoteCode)}</p>` : ''}
            ${formatDealIdleDaysLabel(deal) ? `<p class="text-[10px] mt-1 text-slate-400">Última alteração ${escapeHtml(formatDealIdleDaysLabel(deal))}</p>` : ''}
            ${extra}
        `;
        row.addEventListener('click', () => openComercialDealPanel(deal.id));
        list.appendChild(row);
    });
}
