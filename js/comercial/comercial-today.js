async function loadComercialToday() {
    const list = document.getElementById('comercial-today-list');
    if (!list) return;
    list.innerHTML = '<p class="text-xs text-slate-400">Carregando atividades...</p>';

    const today = comercialTodayIso();
    let query = supabaseClient
        .from('DealActivity')
        .select('id, dealId, type, subject, dueDate, dueTime, isDone, ownerUserId, deal:Deal(id, title, status, ownerUserId, client:Client(name))')
        .eq('isDone', false)
        .lte('dueDate', today)
        .order('dueDate', { ascending: true });

    if (!(canSeeAllDeals() && comercialOwnerFilter === 'all')) {
        query = query.eq('ownerUserId', currentUser.id);
    }

    const { data, error } = await query;
    if (error) {
        list.innerHTML = `<p class="text-xs text-amber-700">${escapeHtml(error.message)}</p>`;
        return;
    }

    if (typeof fillComercialConsultantSelect === 'function') {
        await fillComercialConsultantSelect();
    }

    const consultantUserId = typeof getComercialConsultantFilterUserId === 'function'
        ? getComercialConsultantFilterUserId()
        : null;
    const rows = (data || []).filter(item => {
        if (!item.deal || item.deal.status !== 'open') return false;
        if (consultantUserId && Number(item.deal.ownerUserId) !== consultantUserId) return false;
        return true;
    });
    if (!rows.length) {
        list.innerHTML = '<p class="text-xs text-slate-400">Nenhuma atividade para hoje ou atrasada. Bom sinal — ou o funil está vazio.</p>';
        return;
    }

    list.innerHTML = '';
    rows.forEach(activity => {
        const overdue = String(activity.dueDate).slice(0, 10) < today;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `w-full text-left border rounded-xl px-3 py-3 ${overdue ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white hover:border-amber-300'}`;
        button.innerHTML = `
            <div class="flex flex-wrap justify-between gap-2">
                <p class="text-sm font-semibold text-slate-800">${escapeHtml(COMMERCIAL_ACTIVITY_TYPE_LABELS[activity.type] || activity.type)} · ${escapeHtml(activity.subject || '')}</p>
                <p class="text-[11px] ${overdue ? 'text-red-700 font-semibold' : 'text-slate-500'}">${overdue ? 'Atrasada · ' : ''}${escapeHtml(formatComercialDate(activity.dueDate))}</p>
            </div>
            <p class="text-xs text-slate-500 mt-1">${escapeHtml(activity.deal?.title || '')} · ${escapeHtml(activity.deal?.client?.name || 'Sem cliente')}</p>
        `;
        button.addEventListener('click', () => openComercialDealPanel(activity.dealId));
        list.appendChild(button);
    });
}
