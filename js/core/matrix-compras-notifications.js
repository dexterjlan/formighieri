function getMatrixComprasProductionDirectMessageUserId() {
    if (typeof MATRIX_COMPRAS_TEAM_MXID === 'string' && MATRIX_COMPRAS_TEAM_MXID.trim()) {
        return MATRIX_COMPRAS_TEAM_MXID.trim();
    }
    return '@comprasformighieri:matrix.org';
}

function resolveMatrixComprasDirectMessageTarget() {
    const productionUserId = getMatrixComprasProductionDirectMessageUserId();

    if (typeof NOTIFICATION_TEST_MODE !== 'undefined' && NOTIFICATION_TEST_MODE) {
        const testUserId = typeof getMatrixNotificationTestUserId === 'function'
            ? getMatrixNotificationTestUserId()
            : (typeof getMatrixNotificationTestMentionTargets === 'function'
                ? getMatrixNotificationTestMentionTargets()?.[0]?.matrixUserId
                : '');
        return {
            userId: String(testUserId || productionUserId).trim(),
            testRedirect: true,
            intendedLabel: `DM ${productionUserId}`
        };
    }

    return {
        userId: productionUserId,
        testRedirect: false,
        intendedLabel: productionUserId
    };
}

async function sendMatrixDirectMessageToComprasTeam(linesOrText) {
    if (!NOTIFICATIONS_ENABLED) return null;

    if (typeof isMatrixMessagingConfigured === 'function' && !isMatrixMessagingConfigured()) {
        console.info('sendMatrixDirectMessageToComprasTeam: Matrix não configurado — mensagem não enviada.');
        return null;
    }

    if (typeof sendMatrixMessage !== 'function') {
        console.warn('sendMatrixDirectMessageToComprasTeam: sendMatrixMessage indisponível.');
        return null;
    }

    const body = (Array.isArray(linesOrText) ? linesOrText : [String(linesOrText || '')])
        .map(line => String(line || '').trim())
        .filter(Boolean)
        .join('\n');

    if (!body) return null;

    const { userId, testRedirect, intendedLabel } = resolveMatrixComprasDirectMessageTarget();
    let message = body;
    if (testRedirect && intendedLabel) {
        message = `[TESTE DEV — em produção: ${intendedLabel}]\n\n${message}`;
    }

    return sendMatrixMessage({
        targetType: 'user',
        userId,
        message
    });
}

function formatMatrixComprasPurchaseTypeLabel(item = {}, details = {}) {
    const subtypeName = item.thirdPartySubtype?.name || item.subtypeName || details.subtypeName || '';
    const purchaseType = item.purchaseType || details.purchaseType || '—';
    if (typeof formatCompraTipoLabel === 'function') {
        return formatCompraTipoLabel(purchaseType, subtypeName);
    }
    return purchaseType;
}

function buildMatrixComprasActorLine() {
    return `Por: ${currentUser?.name || 'Sistema'}`;
}

async function notifyMatrixRequisicoesPurchaseToCompras(details = {}) {
    if (!NOTIFICATIONS_ENABLED || !details.orderProjectId) return null;

    try {
        const context = typeof fetchCompraLiberacaoNotificationContext === 'function'
            ? await fetchCompraLiberacaoNotificationContext(details.orderProjectId)
            : {};

        const tipoLabel = formatMatrixComprasPurchaseTypeLabel({}, details);
        const lines = [
            '🛒 Requisição de Compra',
            `Pedido ${context.orderCode || '—'} · ${context.clientName || '—'}`,
            `Projeto: ${details.projectName || context.projectName || '—'}`,
            `Tipo: ${tipoLabel}`,
            details.reasonName ? `Motivo: ${details.reasonName}` : null,
            details.observation ? `Obs.: ${String(details.observation).trim().slice(0, 200)}` : null,
            buildMatrixComprasActorLine()
        ].filter(Boolean);

        return await sendMatrixDirectMessageToComprasTeam(lines);
    } catch (error) {
        console.warn('notifyMatrixRequisicoesPurchaseToCompras:', error);
        return null;
    }
}

async function notifyMatrixCompraLiberacaoToCompras(options = {}) {
    const { items = [], orderProjectId } = options;
    if (!NOTIFICATIONS_ENABLED || !items.length || !orderProjectId) return null;

    try {
        const context = typeof fetchCompraLiberacaoNotificationContext === 'function'
            ? await fetchCompraLiberacaoNotificationContext(orderProjectId)
            : {};

        const projectName = context.projectName
            || (typeof activeImplantacaoProjectName !== 'undefined' ? activeImplantacaoProjectName : '')
            || '—';

        if (items.length === 1) {
            const item = items[0];
            const tipoLabel = formatMatrixComprasPurchaseTypeLabel(item);
            const filePath = item.folderPath || item.path || '';
            const lines = [
                '🛒 Liberação de Compra (implantação)',
                `Pedido ${context.orderCode || '—'} · ${context.clientName || '—'}`,
                `Projeto: ${projectName}`,
                `Tipo: ${tipoLabel}`,
                filePath ? `Pasta: ${filePath}` : null,
                buildMatrixComprasActorLine()
            ].filter(Boolean);

            return await sendMatrixDirectMessageToComprasTeam(lines);
        }

        const itemLines = items.slice(0, 8).map(item => {
            const tipoLabel = formatMatrixComprasPurchaseTypeLabel(item);
            return `• ${tipoLabel}`;
        });
        const extra = items.length > 8 ? `... e mais ${items.length - 8} item(ns).` : '';

        const lines = [
            '🛒 Liberação de Compra (implantação)',
            `Pedido ${context.orderCode || '—'} · ${context.clientName || '—'}`,
            `Projeto: ${projectName}`,
            `${items.length} item(ns) enviado(s) às Compras:`,
            ...itemLines,
            extra || null,
            buildMatrixComprasActorLine()
        ].filter(Boolean);

        return await sendMatrixDirectMessageToComprasTeam(lines);
    } catch (error) {
        console.warn('notifyMatrixCompraLiberacaoToCompras:', error);
        return null;
    }
}

window.sendMatrixDirectMessageToComprasTeam = sendMatrixDirectMessageToComprasTeam;
window.notifyMatrixRequisicoesPurchaseToCompras = notifyMatrixRequisicoesPurchaseToCompras;
window.notifyMatrixCompraLiberacaoToCompras = notifyMatrixCompraLiberacaoToCompras;
