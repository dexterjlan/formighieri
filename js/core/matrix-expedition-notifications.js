const expeditionRoutesMatrixRoomNotifier = new MatrixRoomNotifier(
    typeof getMatrixRoomAlias === 'function' ? getMatrixRoomAlias('routes') : ''
);

async function fetchMatrixExpeditionRouteContext(routeId) {
    const normalizedId = Number(routeId);
    if (!normalizedId || !supabaseClient) {
        return {
            routeId: normalizedId,
            routeLabel: '—',
            routeDateLabel: '—',
            vehicleLabel: '—',
            driverName: '—',
            responsibleName: '—'
        };
    }

    let result = await supabaseClient
        .from('ExpeditionRoute')
        .select(`
            id, name, routeDate, vehicleLabel, driverName, responsibleUserId,
            responsibleUser:appUsers!responsibleUserId(name)
        `)
        .eq('id', normalizedId)
        .maybeSingle();

    if (result.error?.message?.match(/name|responsibleUserId|relationship/i)) {
        result = await supabaseClient
            .from('ExpeditionRoute')
            .select('id, routeDate, vehicleLabel, driverName')
            .eq('id', normalizedId)
            .maybeSingle();
    }

    if (result.error) {
        console.warn('fetchMatrixExpeditionRouteContext:', result.error);
    }

    const route = result.data || { id: normalizedId };
    const routeLabel = typeof formatExpeditionRouteDisplayName === 'function'
        ? formatExpeditionRouteDisplayName(route)
        : `Rota ${normalizedId}`;
    const routeDateLabel = route.routeDate && typeof formatDate === 'function'
        ? formatDate(route.routeDate)
        : (route.routeDate || '—');
    const responsibleName = typeof getExpeditionResponsibleLabel === 'function'
        ? getExpeditionResponsibleLabel(route)
        : (route.responsibleUser?.name || '—');

    return {
        routeId: normalizedId,
        routeLabel,
        routeDateLabel,
        vehicleLabel: String(route.vehicleLabel || '').trim() || '—',
        driverName: String(route.driverName || '').trim() || '—',
        responsibleName: responsibleName || '—'
    };
}

function buildMatrixExpeditionRouteLines(headline, context = {}) {
    const actorName = currentUser?.name || 'Sistema';
    const lines = [
        headline,
        `${context.routeLabel} · ${context.routeDateLabel}`
    ];
    if (context.vehicleLabel && context.vehicleLabel !== '—') {
        lines.push(`Veículo: ${context.vehicleLabel}`);
    }
    if (context.driverName && context.driverName !== '—') {
        lines.push(`Motorista: ${context.driverName}`);
    }
    if (context.responsibleName && context.responsibleName !== '—') {
        lines.push(`Separador: ${context.responsibleName}`);
    }
    lines.push(`Por: ${actorName}`);
    return lines;
}

async function sendMatrixExpeditionRoutesRoomMessage(headline, routeId) {
    if (!NOTIFICATIONS_ENABLED) return null;
    if (!routeId) return null;

    try {
        const context = await fetchMatrixExpeditionRouteContext(routeId);
        const lines = buildMatrixExpeditionRouteLines(headline, context);
        return await expeditionRoutesMatrixRoomNotifier.send(lines);
    } catch (error) {
        console.warn('sendMatrixExpeditionRoutesRoomMessage:', headline, error);
        return null;
    }
}

function notifyMatrixExpeditionBoardingStarted(routeId) {
    sendMatrixExpeditionRoutesRoomMessage('🚛 Embarque iniciado', routeId).catch(error => {
        console.warn('notifyMatrixExpeditionBoardingStarted:', error);
    });
}

function notifyMatrixExpeditionBoardingFinished(routeId) {
    sendMatrixExpeditionRoutesRoomMessage('🚛 Embarque finalizado', routeId).catch(error => {
        console.warn('notifyMatrixExpeditionBoardingFinished:', error);
    });
}

function resolveMatrixExpeditionUnloadingStopNotifyEvents(pendingBeforeScan, totalAtStop) {
    const pending = Number(pendingBeforeScan);
    const total = Number(totalAtStop);
    if (!Number.isFinite(pending) || !Number.isFinite(total) || total < 1 || pending < 1) {
        return [];
    }

    const events = [];
    if (total === 1 && pending === 1) {
        events.push('finished');
        return events;
    }
    if (pending === total && total > 1) {
        events.push('started');
    }
    if (pending === 1) {
        events.push('finished');
    }
    return events;
}

function notifyMatrixExpeditionUnloadingStopScanEvents(routeId, stopIndex, pendingBeforeScan, totalAtStop) {
    if (!NOTIFICATIONS_ENABLED) return;

    const events = resolveMatrixExpeditionUnloadingStopNotifyEvents(pendingBeforeScan, totalAtStop);
    if (!events.length) return;

    const parada = Number(stopIndex);
    const paradaLabel = Number.isFinite(parada) && parada > 0 ? parada : '?';

    events.forEach(eventType => {
        const headline = eventType === 'started'
            ? `📦 Desembarque Parada ${paradaLabel} iniciado`
            : `📦 Desembarque Parada ${paradaLabel} finalizado`;
        sendMatrixExpeditionRoutesRoomMessage(headline, routeId).catch(error => {
            console.warn('notifyMatrixExpeditionUnloadingStopScanEvents:', eventType, error);
        });
    });
}

window.expeditionRoutesMatrixRoomNotifier = expeditionRoutesMatrixRoomNotifier;
window.notifyMatrixExpeditionBoardingStarted = notifyMatrixExpeditionBoardingStarted;
window.notifyMatrixExpeditionBoardingFinished = notifyMatrixExpeditionBoardingFinished;
window.notifyMatrixExpeditionUnloadingStopScanEvents = notifyMatrixExpeditionUnloadingStopScanEvents;
window.resolveMatrixExpeditionUnloadingStopNotifyEvents = resolveMatrixExpeditionUnloadingStopNotifyEvents;