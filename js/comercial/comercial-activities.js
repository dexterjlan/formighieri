function showComercialActivityForm(prefill = {}) {
    const form = document.getElementById('comercial-activity-form');
    if (!form) return;
    form.classList.remove('hidden');
    document.getElementById('comercial-activity-type').value = prefill.type || 'call';
    document.getElementById('comercial-activity-subject').value = prefill.subject || '';
    document.getElementById('comercial-activity-due-date').value = prefill.dueDate || comercialTodayIso();
    document.getElementById('comercial-activity-due-time').value = prefill.dueTime || '';
    document.getElementById('comercial-activity-subject')?.focus();
}

async function renderComercialDealActivities(dealId) {
    const box = document.getElementById('comercial-deal-activities');
    if (!box) return;
    const { data, error } = await supabaseClient
        .from('DealActivity')
        .select('id, type, subject, dueDate, dueTime, isDone, doneAt, ownerUserId')
        .eq('dealId', dealId)
        .order('isDone', { ascending: true })
        .order('dueDate', { ascending: true });
    if (error) {
        box.innerHTML = `<p class="text-[11px] text-slate-400">${escapeHtml(error.message)}</p>`;
        return;
    }
    if (!data?.length) {
        box.innerHTML = '<p class="text-[11px] text-red-700 font-medium">Sem próxima atividade. Agende a próxima ação.</p>';
        return;
    }
    box.innerHTML = '';
    data.forEach(activity => {
        const overdue = !activity.isDone && String(activity.dueDate).slice(0, 10) < comercialTodayIso();
        const row = document.createElement('div');
        row.className = `flex items-start justify-between gap-2 text-xs border rounded-lg px-2.5 py-2 ${activity.isDone ? 'border-slate-100 bg-slate-50 text-slate-400' : overdue ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`;
        row.innerHTML = `
            <label class="flex items-start gap-2 min-w-0">
                <input type="checkbox" class="comercial-activity-done mt-0.5" data-activity-id="${activity.id}" ${activity.isDone ? 'checked' : ''}>
                <span>
                    <span class="font-semibold">${escapeHtml(COMMERCIAL_ACTIVITY_TYPE_LABELS[activity.type] || activity.type)}</span>
                    · ${escapeHtml(activity.subject || '')}
                    <span class="block text-[10px] mt-0.5">${escapeHtml(formatComercialDate(activity.dueDate))}${activity.dueTime ? ` ${escapeHtml(String(activity.dueTime).slice(0, 5))}` : ''}</span>
                </span>
            </label>
        `;
        row.querySelector('.comercial-activity-done')?.addEventListener('change', event => {
            toggleComercialActivityDone(activity, event.target.checked);
        });
        box.appendChild(row);
    });
}

async function saveComercialActivity(event) {
    event.preventDefault();
    const dealId = Number(document.getElementById('comercial-deal-id')?.value);
    if (!dealId) {
        alertAppDialog('Salve o negócio antes de criar a atividade.');
        return;
    }
    const subject = document.getElementById('comercial-activity-subject')?.value.trim();
    const dueDate = document.getElementById('comercial-activity-due-date')?.value;
    const dueTime = document.getElementById('comercial-activity-due-time')?.value || null;
    const activityType = document.getElementById('comercial-activity-type')?.value || 'task';
    if (!subject || !dueDate) {
        alertAppDialog('Informe assunto e data da atividade.');
        return;
    }
    const now = new Date().toISOString();
    const { error } = await supabaseClient.from('DealActivity').insert({
        dealId,
        type: activityType,
        subject,
        dueDate,
        dueTime: dueTime || null,
        isDone: false,
        ownerUserId: currentUser.id,
        createdAt: now,
        updatedAt: now,
        createdById: currentUser.id,
        updatedById: currentUser.id
    });
    if (error) {
        alertAppDialog('Erro ao salvar a atividade: ' + error.message);
        return;
    }
    if (typeof touchComercialDealUpdatedAt === 'function') {
        await touchComercialDealUpdatedAt(dealId);
    }

    const addToCalendar = await confirmAppDialog('Adicionar esta atividade ao calendário?', {
        confirmLabel: 'Sim',
        cancelLabel: 'Não'
    });
    if (addToCalendar && typeof createCalendarEventFromDealActivity === 'function') {
        const deal = (typeof comercialDealsCache !== 'undefined' ? comercialDealsCache : [])
            .find(item => Number(item.id) === Number(dealId));
        const ownerUserId = Number(document.getElementById('comercial-deal-owner')?.value)
            || deal?.ownerUserId
            || currentUser?.id;
        const clientId = Number(document.getElementById('comercial-deal-client-id')?.value)
            || deal?.clientId
            || null;
        const typeLabel = (typeof COMMERCIAL_ACTIVITY_TYPE_LABELS !== 'undefined'
            && COMMERCIAL_ACTIVITY_TYPE_LABELS[activityType])
            || activityType;
        await createCalendarEventFromDealActivity({
            dueDate,
            dueTime,
            typeLabel,
            subject,
            ownerUserId,
            clientId
        });
    }

    document.getElementById('comercial-activity-form')?.classList.add('hidden');
    document.getElementById('comercial-activity-form')?.reset();
    await renderComercialDealActivities(dealId);
    await refreshComercialView();
}

async function toggleComercialActivityDone(activity, isDone) {
    const dealId = Number(document.getElementById('comercial-deal-id')?.value);
    const { error } = await supabaseClient.from('DealActivity').update({
        isDone,
        doneAt: isDone ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
        updatedById: currentUser.id
    }).eq('id', activity.id);
    if (error) {
        alertAppDialog('Não foi possível atualizar a atividade: ' + error.message);
        await renderComercialDealActivities(dealId);
        return;
    }
    if (typeof touchComercialDealUpdatedAt === 'function') {
        await touchComercialDealUpdatedAt(dealId);
    }
    await renderComercialDealActivities(dealId);
    await refreshComercialView();
    if (isDone) {
        const scheduleNext = await confirmAppDialog('Atividade concluída. Agendar a próxima ação deste negócio?', {
            confirmLabel: 'Agendar',
            cancelLabel: 'Agora não'
        });
        if (scheduleNext) showComercialActivityForm({ type: activity.type });
    }
}

function bindComercialActivityEvents() {
    document.getElementById('btn-comercial-activity-add')?.addEventListener('click', () => showComercialActivityForm());
    document.getElementById('btn-comercial-activity-cancel')?.addEventListener('click', () => {
        document.getElementById('comercial-activity-form')?.classList.add('hidden');
    });
    document.getElementById('comercial-activity-form')?.addEventListener('submit', saveComercialActivity);
}
