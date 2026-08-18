let gestaoCalendarEventTypesCache = [];

async function loadGestaoCalendarEventTypes(activeOnly = false) {
    let query = supabaseClient
        .from('CalendarEventType')
        .select('id, name, isActive, clientRequired, orderRequired, sortOrder')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('loadGestaoCalendarEventTypes:', error);
        gestaoCalendarEventTypesCache = [];
        return [];
    }

    gestaoCalendarEventTypesCache = data || [];
    return gestaoCalendarEventTypesCache;
}

async function loadGestaoCalendarEventTypesList() {
    const tbody = document.getElementById('gestao-calendar-event-types-list');
    if (!tbody) return;

    const types = await loadGestaoCalendarEventTypes(false);

    if (!types.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-6 text-center text-xs text-amber-700">
                    Nenhum tipo cadastrado. Execute <code>supabase/create-calendar-event-type.sql</code> no Supabase.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    types.forEach(eventType => {
        const tr = document.createElement('tr');
        tr.dataset.eventTypeId = String(eventType.id);
        tr.innerHTML = `
            <td class="p-3">
                <input type="number" class="gestao-calendar-event-type-sort w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${Number(eventType.sortOrder) || 0}" min="0" step="1">
            </td>
            <td class="p-3">
                <input type="text" class="gestao-calendar-event-type-name w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                    value="${escapeHtml(eventType.name)}" required>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-calendar-event-type-client-required h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${eventType.clientRequired ? 'checked' : ''}>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-calendar-event-type-order-required h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${eventType.orderRequired ? 'checked' : ''}>
            </td>
            <td class="p-3 text-center">
                <input type="checkbox" class="gestao-calendar-event-type-active h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ${eventType.isActive !== false ? 'checked' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="gestao-save-calendar-event-type text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium">
                        Salvar
                    </button>
                    <button type="button" class="gestao-delete-calendar-event-type text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                        Excluir
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function addGestaoCalendarEventType(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const name = document.getElementById('gestao-new-calendar-event-type-name')?.value.trim();
    const sortOrder = Number(document.getElementById('gestao-new-calendar-event-type-sort')?.value) || 0;
    const clientRequired = Boolean(document.getElementById('gestao-new-calendar-event-type-client-required')?.checked);
    const orderRequired = Boolean(document.getElementById('gestao-new-calendar-event-type-order-required')?.checked);

    if (!name) {
        alertAppDialog('Informe o nome do tipo de evento.');
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('CalendarEventType')
        .insert({
            name,
            sortOrder,
            clientRequired,
            orderRequired,
            isActive: true,
            updatedAt: now
        });

    if (error) {
        const isDuplicate = error.code === '23505'
            || /unique/i.test(error.message || '')
            || /duplicate/i.test(error.message || '');
        alertAppDialog(
            isDuplicate
                ? `Já existe um tipo com o nome "${name}".`
                : 'Erro ao adicionar tipo: ' + error.message
        );
        return;
    }

    document.getElementById('gestao-new-calendar-event-type-form')?.reset();
    document.getElementById('gestao-new-calendar-event-type-sort').value = '0';
    await loadGestaoCalendarEventTypesList();
}

async function saveGestaoCalendarEventTypeRow(tr, button) {
    if (!tr || !canAccessGestao()) return;

    const eventTypeId = Number(tr.dataset.eventTypeId);
    const name = tr.querySelector('.gestao-calendar-event-type-name')?.value.trim();
    const sortOrder = Number(tr.querySelector('.gestao-calendar-event-type-sort')?.value) || 0;
    const clientRequired = Boolean(tr.querySelector('.gestao-calendar-event-type-client-required')?.checked);
    const orderRequired = Boolean(tr.querySelector('.gestao-calendar-event-type-order-required')?.checked);
    const isActive = Boolean(tr.querySelector('.gestao-calendar-event-type-active')?.checked);

    if (!name) {
        alertAppDialog('Informe o nome do tipo de evento.');
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = 'Salvando...';
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('CalendarEventType')
        .update({
            name,
            sortOrder,
            clientRequired,
            orderRequired,
            isActive,
            updatedAt: now
        })
        .eq('id', eventTypeId);

    if (button) {
        button.disabled = false;
        button.textContent = 'Salvar';
    }

    if (error) {
        const isDuplicate = error.code === '23505'
            || /unique/i.test(error.message || '')
            || /duplicate/i.test(error.message || '');
        alertAppDialog(
            isDuplicate
                ? `Já existe um tipo com o nome "${name}".`
                : 'Erro ao salvar tipo: ' + error.message
        );
        return;
    }

    await loadGestaoCalendarEventTypesList();
}

async function deleteGestaoCalendarEventTypeRow(tr) {
    if (!tr || !canAccessGestao()) return;

    const eventTypeId = Number(tr.dataset.eventTypeId);
    const name = tr.querySelector('.gestao-calendar-event-type-name')?.value.trim() || 'o tipo';

    const { count, error: countError } = await supabaseClient
        .from('CalendarEvent')
        .select('id', { count: 'exact', head: true })
        .eq('eventTypeId', eventTypeId);

    if (countError) {
        alertAppDialog('Erro ao verificar uso do tipo: ' + countError.message);
        return;
    }

    if (count > 0) {
        alertAppDialog(`O tipo "${name}" possui ${count} evento(s) vinculado(s). Desative-o em vez de excluir.`);
        return;
    }

    if (!(await confirmAppDialog(`Excluir o tipo "${name}"?`))) return;

    const { error } = await supabaseClient
        .from('CalendarEventType')
        .delete()
        .eq('id', eventTypeId);

    if (error) {
        alertAppDialog('Erro ao excluir tipo: ' + error.message);
        return;
    }

    await loadGestaoCalendarEventTypesList();
}
