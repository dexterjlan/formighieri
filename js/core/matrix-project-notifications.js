const projectsMatrixRoomNotifier = new MatrixRoomNotifier(
    getMatrixRoomAlias('projects')
);

async function fetchAppUserDisplayNameById(userId) {
    const normalizedId = Number(userId);
    if (!normalizedId || !supabaseClient) return null;

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('name')
        .eq('id', normalizedId)
        .maybeSingle();

    if (error) {
        console.warn('fetchAppUserDisplayNameById:', error);
        return null;
    }

    return data?.name || null;
}

async function buildMatrixDesignerAssignmentContext(options = {}) {
    const { orderId, orderProjectIds = [], designerId = null } = options;
    let orderCode = '';
    let clientName = '';
    const projectNames = [];

    if (typeof fetchOrderRequestNotificationContext === 'function') {
        for (const projectId of orderProjectIds) {
            const ctx = await fetchOrderRequestNotificationContext(orderId, projectId, designerId);
            orderCode = orderCode || ctx.orderCode || '';
            clientName = clientName || ctx.clientName || '';
            if (ctx.projectName) {
                projectNames.push(ctx.projectName);
            }
        }
    }

    return {
        orderCode: orderCode || '—',
        clientName: clientName || '—',
        projectNames
    };
}

function buildMatrixDesignerAssignmentMessageLines(options = {}, context = {}) {
    const { designerId = null, previousDesignerId = null } = options;
    const previousId = Number(previousDesignerId);
    const newId = Number(designerId);
    const isChange = previousId > 0 && newId > 0 && previousId !== newId;
    const eventLabel = isChange ? 'Projetista alterado' : 'Projetista associado';
    const actorName = currentUser?.name || 'Sistema';

    const projectLabel = context.projectNames?.length > 1
        ? `Projetos: ${context.projectNames.join(', ')}`
        : `Projeto: ${context.projectNames?.[0] || '—'}`;

    const lines = [
        `📐 ${eventLabel}`,
        `Pedido ${context.orderCode} · ${context.clientName}`,
        projectLabel,
        `Por: ${actorName}`
    ];

    if (isChange && context.previousDesignerName) {
        lines.push(`Anterior: ${context.previousDesignerName}`);
    }

    return lines;
}

async function notifyMatrixDesignerAssignedToProject(options = {}) {
    const { orderId, orderProjectIds = [], designerId = null } = options;
    if (!NOTIFICATIONS_ENABLED || !orderId || !orderProjectIds.length || !designerId) {
        return null;
    }

    try {
        const mentionTargets = await fetchAppUsersMatrixMentionTargets([designerId]);
        const context = await buildMatrixDesignerAssignmentContext(options);

        const previousId = Number(options.previousDesignerId);
        const newId = Number(designerId);
        if (previousId > 0 && newId > 0 && previousId !== newId) {
            context.previousDesignerName = await fetchAppUserDisplayNameById(previousId);
        }

        const lines = buildMatrixDesignerAssignmentMessageLines(options, context);
        return await projectsMatrixRoomNotifier.send(lines, { mentionTargets });
    } catch (error) {
        console.warn('notifyMatrixDesignerAssignedToProject:', error);
        if (typeof isMatrixInactiveTokenError === 'function' && isMatrixInactiveTokenError(error)) {
            console.warn(
                'Notificação Element (projetos) não enviada: token do bot inválido. '
                + 'Atualize MATRIX_ACCESS_TOKEN no Apps Script (Notificações).'
            );
        }
        return null;
    }
}

window.projectsMatrixRoomNotifier = projectsMatrixRoomNotifier;
window.notifyMatrixDesignerAssignedToProject = notifyMatrixDesignerAssignedToProject;
