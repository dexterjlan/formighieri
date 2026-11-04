const detailingMatrixRoomNotifier = new MatrixRoomNotifier(
    typeof getMatrixRoomAlias === 'function' ? getMatrixRoomAlias('detailing') : ''
);

const MATRIX_DETAILING_EVENT_LABELS = {
    designer_assigned: 'Projetista associado ao detalhamento',
    designer_changed: 'Projetista alterado no detalhamento',
    started: 'Detalhamento iniciado',
    completed: 'Detalhamento finalizado'
};

async function fetchMatrixDetailingAppUserNameById(userId) {
    const normalizedId = Number(userId);
    if (!normalizedId || !supabaseClient) return null;

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('name')
        .eq('id', normalizedId)
        .maybeSingle();

    if (error) {
        console.warn('fetchMatrixDetailingAppUserNameById:', error);
        return null;
    }

    return data?.name || null;
}

async function resolveMatrixDetailingNotificationContext(options = {}) {
    const orderProjectId = Number(options.orderProjectId);
    let orderId = Number(options.orderId);
    const designerId = Number(options.designerId) || null;

    let projectName = String(options.projectName || '').trim();

    if (!orderId && orderProjectId && supabaseClient) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select('orderId, name')
            .eq('id', orderProjectId)
            .maybeSingle();

        if (error) {
            console.warn('resolveMatrixDetailingNotificationContext:', error);
        } else {
            orderId = Number(data?.orderId) || 0;
            if (!projectName && data?.name) {
                projectName = data.name;
            }
        }
    }

    const context = {
        orderCode: '—',
        clientName: '—',
        projectName: projectName || '—',
        designerName: String(options.designerName || '').trim() || '—',
        previousDesignerName: null
    };

    if (typeof fetchOrderRequestNotificationContext === 'function' && orderId) {
        const ctx = await fetchOrderRequestNotificationContext(orderId, orderProjectId, designerId);
        context.orderCode = ctx.orderCode || context.orderCode;
        context.clientName = ctx.clientName || context.clientName;
        context.projectName = ctx.projectName || context.projectName;
        if (ctx.projetistaName && ctx.projetistaName !== '-') {
            context.designerName = ctx.projetistaName;
        }
    }

    const previousDesignerId = Number(options.previousDesignerId);
    if (previousDesignerId > 0) {
        context.previousDesignerName = await fetchMatrixDetailingAppUserNameById(previousDesignerId);
    }

    return context;
}

function buildMatrixDetailingMessageLines(eventType, context = {}) {
    const eventLabel = MATRIX_DETAILING_EVENT_LABELS[eventType] || 'Detalhamento';
    const actorName = currentUser?.name || 'Sistema';

    const lines = [
        `📐 ${eventLabel}`,
        `Pedido ${context.orderCode} · ${context.clientName}`,
        `Projeto: ${context.projectName}`
    ];

    if (context.designerName && context.designerName !== '—') {
        lines.push(`Projetista: ${context.designerName}`);
    }

    if (eventType === 'designer_changed' && context.previousDesignerName) {
        lines.push(`Anterior: ${context.previousDesignerName}`);
    }

    lines.push(`Por: ${actorName}`);
    return lines;
}

async function notifyMatrixDetailingRoomEvent(eventType, options = {}) {
    if (!NOTIFICATIONS_ENABLED) return null;

    const orderProjectId = Number(options.orderProjectId);
    if (!orderProjectId) return null;

    try {
        const mentionDesignerId = Number(options.designerId) || Number(options.mentionDesignerId);
        const mentionTargets = mentionDesignerId > 0 && typeof fetchAppUsersMatrixMentionTargets === 'function'
            ? await fetchAppUsersMatrixMentionTargets([mentionDesignerId])
            : [];

        const context = await resolveMatrixDetailingNotificationContext(options);
        const lines = buildMatrixDetailingMessageLines(eventType, context);

        return await detailingMatrixRoomNotifier.send(lines, { mentionTargets });
    } catch (error) {
        console.warn('notifyMatrixDetailingRoomEvent:', eventType, error);
        if (typeof isMatrixInactiveTokenError === 'function' && isMatrixInactiveTokenError(error)) {
            console.warn(
                'Notificação Element (detalhamento) não enviada: token do bot inválido. '
                + 'Atualize MATRIX_ACCESS_TOKEN no Apps Script (Notificações).'
            );
        }
        return null;
    }
}

async function notifyMatrixDetailingDesignerAssigned(options = {}) {
    const previousId = Number(options.previousDesignerId);
    const newId = Number(options.designerId);
    const eventType = previousId > 0 && newId > 0 && previousId !== newId
        ? 'designer_changed'
        : 'designer_assigned';

    return notifyMatrixDetailingRoomEvent(eventType, options);
}

async function notifyMatrixDetailingStarted(options = {}) {
    return notifyMatrixDetailingRoomEvent('started', options);
}

async function notifyMatrixDetailingCompleted(options = {}) {
    return notifyMatrixDetailingRoomEvent('completed', options);
}

window.detailingMatrixRoomNotifier = detailingMatrixRoomNotifier;
window.notifyMatrixDetailingDesignerAssigned = notifyMatrixDetailingDesignerAssigned;
window.notifyMatrixDetailingStarted = notifyMatrixDetailingStarted;
window.notifyMatrixDetailingCompleted = notifyMatrixDetailingCompleted;
