const revisionMatrixRoomNotifier = new MatrixRoomNotifier(
    getMatrixRoomAlias('revisions')
);

const MATRIX_REVISION_EVENT_LABELS = {
    revision_created: 'Revisão criada',
    revision_updated: 'Revisão atualizada',
    revision_started: 'Revisão iniciada',
    sent_back_to_approval: 'Enviado para aprovação comercial',
    revision_sent_to_designer: 'Revisão enviada ao projetista',
    technical_reviewer_revision_started: 'Revisão técnica (revisor) iniciada'
};

async function fetchConsultantUserIdForOrder(orderId) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId || !supabaseClient) return null;

    if (typeof ordersCache !== 'undefined') {
        const cached = ordersCache.find(order => Number(order.id) === normalizedOrderId);
        if (cached?.consultantUserId) return Number(cached.consultantUserId);
    }

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select('consultantUserId')
        .eq('id', normalizedOrderId)
        .maybeSingle();

    if (error) {
        console.warn('fetchConsultantUserIdForOrder:', error);
        return null;
    }

    return Number(data?.consultantUserId) || null;
}

function getMatrixRevisionTypeLabel(revisionType) {
    const map = {
        commercial_commercial: 'Comercial (consultor)',
        commercial_technical: 'Comercial (projetista)',
        technical_reviewer: 'Técnica (revisor)',
        third_party: 'Terceiro'
    };
    if (typeof mapDbRevisionTypeToLegacy === 'function' && revisionType) {
        const legacy = mapDbRevisionTypeToLegacy(revisionType);
        if (legacy === 'comercial') return map.commercial_commercial;
        if (legacy === 'tecnica') return map.commercial_technical;
    }
    return map[revisionType] || revisionType || 'Revisão';
}

async function resolveMatrixRevisionMentionTargets(eventType, context = {}) {
    const designerId = Number(context.designerId);
    const consultantUserId = Number(context.consultantUserId)
        || await fetchConsultantUserIdForOrder(context.orderId);

    if (eventType === 'revision_created'
        || eventType === 'revision_updated'
        || eventType === 'revision_sent_to_designer') {
        return fetchAppUsersMatrixMentionTargets([designerId]);
    }

    if (eventType === 'revision_started' || eventType === 'sent_back_to_approval') {
        return fetchAppUsersMatrixMentionTargets([consultantUserId]);
    }

    if (eventType === 'technical_reviewer_revision_started') {
        const reviewers = await fetchActiveReviewerMatrixMentionTargets();
        if (reviewers.length) return reviewers;
        return fetchAppUsersMatrixMentionTargets([designerId]);
    }

    return fetchAppUsersMatrixMentionTargets([designerId, consultantUserId]);
}

function buildMatrixRevisionMessageLines(eventType, context = {}) {
    const eventLabel = MATRIX_REVISION_EVENT_LABELS[eventType] || 'Revisão';
    const orderCode = context.orderCode || '—';
    const clientName = context.clientName || '—';
    const projectName = context.projectName || '—';
    const revisionLabel = getMatrixRevisionTypeLabel(context.revisionType);
    const actorName = currentUser?.name || 'Sistema';

    return [
        `📋 ${eventLabel}`,
        `Pedido ${orderCode} · ${clientName}`,
        `Projeto: ${projectName}`,
        `Tipo: ${revisionLabel}`,
        `Por: ${actorName}`
    ];
}

async function notifyMatrixRevisionRoomEventAsync(eventType, context = {}) {
    if (!NOTIFICATIONS_ENABLED) return null;

    try {
        const mentionTargets = await resolveMatrixRevisionMentionTargets(eventType, context);
        const lines = buildMatrixRevisionMessageLines(eventType, context);

        return await revisionMatrixRoomNotifier.send(lines, { mentionTargets });
    } catch (error) {
        console.warn('notifyMatrixRevisionRoomEventAsync:', error);
        if (typeof isMatrixInactiveTokenError === 'function' && isMatrixInactiveTokenError(error)) {
            console.warn(
                'Notificação Element não enviada: token do bot inválido. '
                + 'Atualize MATRIX_ACCESS_TOKEN no Apps Script (Notificações).'
            );
        }
        return null;
    }
}

function notifyMatrixRevisionRoomEvent(eventType, context = {}) {
    notifyMatrixRevisionRoomEventAsync(eventType, context).catch(error => {
        console.warn('notifyMatrixRevisionRoomEvent:', error);
    });
}

async function notifyMatrixCommercialRevisionFromApproval(eventType, approval, extra = {}) {
    if (!approval) return null;

    let orderCode = extra.orderCode;
    let clientName = extra.clientName;
    let projectName = extra.projectName;

    if (typeof fetchApprovalNotificationContext === 'function') {
        const ctx = await fetchApprovalNotificationContext(approval);
        orderCode = orderCode || ctx.orderCode;
        clientName = clientName || ctx.clientName;
        projectName = projectName || ctx.projectName;
    }

    return notifyMatrixRevisionRoomEventAsync(eventType, {
        orderId: approval.orderId,
        orderCode,
        clientName,
        projectName,
        designerId: approval.designerId,
        revisionType: extra.revisionType || null
    });
}

async function notifyMatrixTechnicalReviewerRevisionEvent(eventType, project, extra = {}) {
    if (!project) return null;

    let orderCode = extra.orderCode || project.order?.orderCode || '';
    let clientName = extra.clientName || '';

    if ((!orderCode || !clientName) && project.orderId && typeof fetchOrderRequestNotificationContext === 'function') {
        const ctx = await fetchOrderRequestNotificationContext(
            project.orderId,
            project.id,
            project.designerId
        );
        orderCode = orderCode || ctx.orderCode;
        clientName = clientName || ctx.clientName;
    }

    return notifyMatrixRevisionRoomEventAsync(eventType, {
        orderId: project.orderId,
        orderCode,
        clientName,
        projectName: project.name || extra.projectName,
        designerId: project.designerId,
        revisionType: typeof REVISION_TYPE_TECHNICAL_REVISOR !== 'undefined'
            ? REVISION_TYPE_TECHNICAL_REVISOR
            : 'technical_reviewer'
    });
}

window.revisionMatrixRoomNotifier = revisionMatrixRoomNotifier;
window.notifyMatrixRevisionRoomEvent = notifyMatrixRevisionRoomEvent;
window.notifyMatrixCommercialRevisionFromApproval = notifyMatrixCommercialRevisionFromApproval;
window.notifyMatrixTechnicalReviewerRevisionEvent = notifyMatrixTechnicalReviewerRevisionEvent;
