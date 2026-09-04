const DEFAULT_GOOGLE_CALENDAR_SYNC_CALENDAR_NAME = 'FGP - Comercial';

function getGoogleCalendarSyncCalendarName() {
    return FORMIGHIERI_ENV_CONFIG?.GOOGLE_CALENDAR_SYNC_CALENDAR_NAME
        || DEFAULT_GOOGLE_CALENDAR_SYNC_CALENDAR_NAME;
}

function getCalendarGoogleSyncSelect(options = {}) {
    const {
        includeGoogleId = true,
        includeAddrId = true,
        includeResponsibleEmbed = true
    } = options;

    const orderSelect = includeAddrId
        ? 'order:salesOrders(orderCode, clientId, consultantUserId, addrId, client:Client(name), consultor:appUsers!consultantUserId(name))'
        : 'order:salesOrders(orderCode, clientId, consultantUserId, client:Client(name), consultor:appUsers!consultantUserId(name))';

    return [
        'id',
        'eventDate',
        'eventTime',
        'description',
        'orderId',
        'clientId',
        'responsibleId',
        includeGoogleId ? 'googleCalendarEventId' : null,
        includeAddrId ? 'addrId' : null,
        'eventType:CalendarEventType(id, name)',
        'client:Client(id, name)',
        orderSelect,
        includeResponsibleEmbed ? 'responsible:appUsers!responsibleId(id, name)' : null
    ].filter(Boolean).join(',\n    ');
}

function formatCalendarAddrGoogleLocation(record) {
    if (!record) return '';

    const postal = typeof formatPostalCodeDisplay === 'function'
        ? formatPostalCodeDisplay(record.postalCode)
        : record.postalCode;
    const streetLine = [record.street, record.number].filter(Boolean).join(', ');
    const cityLine = [record.city, record.state].filter(Boolean).join(' - ');
    const country = String(record.country || '').trim().toUpperCase() === 'BR'
        ? 'Brasil'
        : (record.country || 'Brasil');

    return [streetLine, record.complement, record.neighborhood, cityLine, postal, country]
        .map(part => String(part || '').trim())
        .filter(part => part && part !== '—')
        .join(', ');
}

async function attachCalendarEventGoogleLocation(event) {
    if (!event) return event;

    const addrId = Number(event.addrId) || Number(event.order?.addrId) || null;
    event.googleLocation = '';
    if (!addrId || typeof fetchGestaoClientAddrs !== 'function') return event;

    const record = await fetchGestaoClientAddrs(null, { addrId });
    event.addr = record || null;
    event.googleLocation = formatCalendarAddrGoogleLocation(record);
    return event;
}

function isGoogleCalendarSyncEnabled() {
    return Boolean(GOOGLE_APPS_SCRIPT_URL && NOTIFICATION_SCRIPT_SECRET)
        && FORMIGHIERI_ENV_CONFIG?.GOOGLE_CALENDAR_SYNC_ENABLED === true;
}

function buildCalendarGoogleSyncPayload(event) {
    if (!event?.id) return null;

    const typeName = event.eventType?.name || getCalendarEventTypeName?.(event) || 'Evento';
    const responsibleName = event.responsible?.name || getCalendarEventResponsibleLabel?.(event) || '—';
    const clientLabel = getCalendarEventClientLabel?.(event) || '';
    const orderLabel = getCalendarEventOrderLabel?.(event) || '';

    const clientPart = clientLabel || (orderLabel ? `Pedido ${orderLabel}` : '');

    const summaryParts = [responsibleName, typeName];
    if (clientPart) summaryParts.push(clientPart);

    const descriptionLines = [
        `Responsável: ${responsibleName}`
    ];
    if (clientLabel) descriptionLines.push(`Cliente: ${clientLabel}`);
    if (orderLabel) descriptionLines.push(`Pedido: ${orderLabel}`);
    if (event.description) descriptionLines.push(`Observação: ${event.description}`);
    descriptionLines.push(`FGP ID: ${event.id}`);

    return {
        calendarName: getGoogleCalendarSyncCalendarName(),
        fgpEventId: event.id,
        googleCalendarEventId: event.googleCalendarEventId || '',
        eventDate: event.eventDate,
        eventTime: String(event.eventTime || '09:00:00').slice(0, 8),
        summary: summaryParts.join(' - '),
        description: descriptionLines.join('\n'),
        location: event.googleLocation || '',
        durationMinutes: 60,
        colorHex: getCalendarResponsibleColorHex(event),
        googleEventColor: getGoogleCalendarEventColorId(event)
    };
}

async function fetchCalendarEventForGoogleSync(eventId) {
    const normalizedId = Number(eventId);
    if (!normalizedId) return null;

    if (typeof loadCalendarUsers === 'function') {
        await loadCalendarUsers();
    }

    let includeGoogleId = true;
    let includeAddrId = true;
    let includeResponsibleEmbed = true;

    const runQuery = () => supabaseClient
        .from('CalendarEvent')
        .select(getCalendarGoogleSyncSelect({
            includeGoogleId,
            includeAddrId,
            includeResponsibleEmbed
        }))
        .eq('id', normalizedId)
        .maybeSingle();

    let result = await runQuery();

    if (result.error?.message?.includes('googleCalendarEventId')) {
        includeGoogleId = false;
        result = await runQuery();
    }
    if (result.error?.message?.includes('addrId')) {
        includeAddrId = false;
        result = await runQuery();
    }
    if (result.error?.message?.includes('responsibleId') || result.error?.message?.includes('appUsers')) {
        includeResponsibleEmbed = false;
        result = await runQuery();
    }

    if (result.error || !result.data) {
        console.error('fetchCalendarEventForGoogleSync:', result.error);
        return null;
    }

    const event = result.data;
    if (event.responsibleId && calendarUsersCache?.length) {
        const cached = calendarUsersCache.find(user => Number(user.id) === Number(event.responsibleId));
        if (cached) {
            event.responsible = { ...cached, ...(event.responsible || {}) };
        }
    }

    await attachCalendarEventGoogleLocation(event);
    return event;
}

async function fetchGoogleCalendarEventId(eventId) {
    const normalizedId = Number(eventId);
    if (!normalizedId) return '';

    const { data, error } = await supabaseClient
        .from('CalendarEvent')
        .select('googleCalendarEventId')
        .eq('id', normalizedId)
        .maybeSingle();

    if (error?.message?.includes('googleCalendarEventId')) {
        return '';
    }

    if (error) {
        console.warn('fetchGoogleCalendarEventId:', error);
        return '';
    }

    return data?.googleCalendarEventId || '';
}

async function sendCalendarGoogleSyncRequest(action, calendarPayload) {
    if (!isGoogleCalendarSyncEnabled()) {
        console.info('sendCalendarGoogleSyncRequest: sincronização com Google Calendar desabilitada ou Apps Script não configurado.');
        return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const requestBody = {
            secret: NOTIFICATION_SCRIPT_SECRET,
            action,
            environment: FORMIGHIERI_APP_ENV,
            calendar: calendarPayload
        };
        console.info(
            'sendCalendarGoogleSyncRequest:',
            action,
            'env=', FORMIGHIERI_APP_ENV,
            'fgpEventId=', calendarPayload?.fgpEventId,
            'googleCalendarEventId=', calendarPayload?.googleCalendarEventId || '(vazio)',
            'calendar=', calendarPayload?.calendarName
        );
        await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
    } catch (error) {
        console.warn('sendCalendarGoogleSyncRequest:', error);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function syncCalendarEventToGoogle(eventId) {
    const event = await fetchCalendarEventForGoogleSync(eventId);
    if (!event) return;

    const payload = buildCalendarGoogleSyncPayload(event);
    if (!payload) return;

    await sendCalendarGoogleSyncRequest('calendar_upsert', payload);
}

async function deleteCalendarEventFromGoogle(event) {
    if (!event?.id) return;
    if (!isGoogleCalendarSyncEnabled()) return;

    const googleCalendarEventId = event.googleCalendarEventId
        || await fetchGoogleCalendarEventId(event.id);

    if (!googleCalendarEventId) {
        console.info('deleteCalendarEventFromGoogle: evento', event.id, 'sem googleCalendarEventId — nada a remover no Google.');
        return;
    }

    await sendCalendarGoogleSyncRequest('calendar_delete', {
        calendarName: getGoogleCalendarSyncCalendarName(),
        fgpEventId: event.id,
        googleCalendarEventId
    });
}

async function syncAllCalendarEventsToGoogle() {
    if (currentUser?.role !== 'Admin') {
        alertAppDialog('Somente Admin pode executar a sincronização completa.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!isGoogleCalendarSyncEnabled()) {
        alertAppDialog('Google Apps Script não configurado para sincronização do calendário.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const calendarName = getGoogleCalendarSyncCalendarName();
    const confirmed = await confirmAppDialog(
        `Enviar todos os eventos do FGP para o Google Calendar "${calendarName}"? Isso pode levar alguns minutos.`,
        { title: 'Sincronizar calendário', confirmLabel: 'Sincronizar', variant: 'warning' }
    );
    if (!confirmed) return;

    const syncBtn = document.getElementById('btn-calendar-sync-google');
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Sincronizando...';
    }

    try {
        const { data, error } = await supabaseClient
            .from('CalendarEvent')
            .select('id')
            .order('eventDate', { ascending: true })
            .order('eventTime', { ascending: true });

        if (error) throw error;

        const rows = data || [];
        for (const row of rows) {
            await syncCalendarEventToGoogle(row.id);
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        alertAppDialog(
            `${rows.length} evento(s) enviados para sincronização com o Google Calendar "${calendarName}".\n\nO Apps Script atualiza o vínculo em segundo plano; recarregue o calendário em alguns instantes.`,
            { variant: 'success', title: 'Sincronização iniciada' }
        );
    } catch (error) {
        alertAppDialog(`Erro ao sincronizar calendário: ${error.message}`);
    } finally {
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.textContent = 'Sincronizar Google';
        }
    }
}

function updateCalendarGoogleSyncControls() {
    const syncBtn = document.getElementById('btn-calendar-sync-google');
    if (!syncBtn) return;

    const show = typeof isAdmin === 'function' && isAdmin() && isGoogleCalendarSyncEnabled();
    syncBtn.classList.toggle('hidden', !show);
    if (show) {
        const calendarName = getGoogleCalendarSyncCalendarName();
        syncBtn.title = `Envia todos os eventos do FGP para o Google Calendar "${calendarName}"`;
    }
}

window.syncAllCalendarEventsToGoogle = syncAllCalendarEventsToGoogle;
window.syncCalendarEventToGoogle = syncCalendarEventToGoogle;
window.deleteCalendarEventFromGoogle = deleteCalendarEventFromGoogle;
window.fetchGoogleCalendarEventId = fetchGoogleCalendarEventId;
window.updateCalendarGoogleSyncControls = updateCalendarGoogleSyncControls;
