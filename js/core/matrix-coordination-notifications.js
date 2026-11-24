function formatMatrixCoordenacaoDirectMessageBody(linesOrText) {
    return (Array.isArray(linesOrText) ? linesOrText : [String(linesOrText || '')])
        .map(line => String(line || '').trim())
        .filter(Boolean)
        .join('\n');
}

function resolveMatrixCoordenacaoDirectMessageTarget(intendedLabel = 'Coordenação') {
    if (typeof NOTIFICATION_TEST_MODE !== 'undefined' && NOTIFICATION_TEST_MODE) {
        const testUserId = typeof getMatrixNotificationTestUserId === 'function'
            ? getMatrixNotificationTestUserId()
            : (typeof getMatrixNotificationTestMentionTargets === 'function'
                ? getMatrixNotificationTestMentionTargets()?.[0]?.matrixUserId
                : '');
        return {
            userId: String(testUserId || '').trim(),
            testRedirect: true,
            intendedLabel: `DM ${intendedLabel}`
        };
    }

    return {
        userId: '',
        testRedirect: false,
        intendedLabel
    };
}

async function fetchActiveCoordenacaoAppUserIds() {
    if (!supabaseClient) return [];

    let { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, role, isProjectsManager, isCoordination, isActive')
        .eq('isActive', true);

    if (error?.message?.includes('isCoordination') || error?.message?.includes('isProjectsManager')) {
        return [];
    }

    if (error) {
        console.warn('fetchActiveCoordenacaoAppUserIds:', error);
        return [];
    }

    return (data || [])
        .filter(user => typeof isActiveAppUserProjectCoordination === 'function'
            && isActiveAppUserProjectCoordination(user))
        .map(user => Number(user.id))
        .filter(Boolean);
}

async function fetchActiveCoordenacaoMatrixMentionTargets() {
    if (typeof NOTIFICATION_TEST_MODE !== 'undefined' && NOTIFICATION_TEST_MODE) {
        return typeof getMatrixNotificationTestMentionTargets === 'function'
            ? getMatrixNotificationTestMentionTargets()
            : [];
    }

    const appUserIds = await fetchActiveCoordenacaoAppUserIds();
    if (!appUserIds.length || typeof fetchAppUsersMatrixMentionTargets !== 'function') {
        return [];
    }

    return fetchAppUsersMatrixMentionTargets(appUserIds);
}

async function sendMatrixDirectMessageToCoordenacaoTeam(linesOrText) {
    if (!NOTIFICATIONS_ENABLED) return null;

    if (typeof isMatrixMessagingConfigured === 'function' && !isMatrixMessagingConfigured()) {
        console.info('sendMatrixDirectMessageToCoordenacaoTeam: Matrix não configurado — mensagem não enviada.');
        return null;
    }

    if (typeof sendMatrixMessage !== 'function') {
        console.warn('sendMatrixDirectMessageToCoordenacaoTeam: sendMatrixMessage indisponível.');
        return null;
    }

    const body = formatMatrixCoordenacaoDirectMessageBody(linesOrText);
    if (!body) return null;

    if (typeof NOTIFICATION_TEST_MODE !== 'undefined' && NOTIFICATION_TEST_MODE) {
        const { userId, testRedirect, intendedLabel } = resolveMatrixCoordenacaoDirectMessageTarget('Coordenação');
        if (!userId) {
            console.warn('sendMatrixDirectMessageToCoordenacaoTeam: MXID de teste não configurado.');
            return null;
        }

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

    const targets = await fetchActiveCoordenacaoMatrixMentionTargets();
    if (!targets.length) {
        console.warn('sendMatrixDirectMessageToCoordenacaoTeam: nenhum usuário de coordenação com MXID.');
        return null;
    }

    const seen = new Set();
    let lastResult = null;

    for (const target of targets) {
        const userId = String(target?.matrixUserId || '').trim();
        if (!userId.startsWith('@') || !userId.includes(':') || seen.has(userId)) {
            continue;
        }
        seen.add(userId);

        lastResult = await sendMatrixMessage({
            targetType: 'user',
            userId,
            message: body
        });
    }

    return lastResult;
}

function buildMatrixCompraMedicaoActorLine() {
    return `Por: ${currentUser?.name || 'Sistema'}`;
}

function formatMatrixCompraPurchaseContextLines(details = {}) {
    const tipoLabel = typeof formatCompraTipoLabel === 'function'
        ? formatCompraTipoLabel(details.purchaseType, details.subtypeName)
        : (details.purchaseType || '—');

    return {
        tipoLabel,
        lines: [
            `Pedido ${details.orderCode || '—'} · ${details.clientName || '—'}`,
            `Projeto: ${details.projectName || '—'}`,
            `Tipo: ${tipoLabel}`,
            details.reasonName ? `Motivo: ${details.reasonName}` : null,
            details.status ? `Status: ${details.status}` : null
        ].filter(Boolean)
    };
}

async function notifyMatrixCompraAguardandoLibMedicaoToCoordenacao(details = {}) {
    const purchaseId = details.purchaseId || details.id;
    if (!NOTIFICATIONS_ENABLED || !purchaseId) return null;

    try {
        const { lines: contextLines } = formatMatrixCompraPurchaseContextLines(details);
        const messageLines = [
            '📐 Compra aguardando liberação de medição',
            ...contextLines,
            buildMatrixCompraMedicaoActorLine()
        ];

        return await sendMatrixDirectMessageToCoordenacaoTeam(messageLines);
    } catch (error) {
        console.warn('notifyMatrixCompraAguardandoLibMedicaoToCoordenacao:', error);
        return null;
    }
}

async function notifyMatrixCompraMedicaoLiberadaToCompras(details = {}) {
    const purchaseId = details.purchaseId || details.id;
    if (!NOTIFICATIONS_ENABLED || !purchaseId) return null;

    try {
        const { lines: contextLines } = formatMatrixCompraPurchaseContextLines(details);
        const messageLines = [
            '✅ Medição liberada (compra)',
            ...contextLines,
            buildMatrixCompraMedicaoActorLine()
        ];

        if (typeof sendMatrixDirectMessageToComprasTeam === 'function') {
            return await sendMatrixDirectMessageToComprasTeam(messageLines);
        }

        return null;
    } catch (error) {
        console.warn('notifyMatrixCompraMedicaoLiberadaToCompras:', error);
        return null;
    }
}

window.sendMatrixDirectMessageToCoordenacaoTeam = sendMatrixDirectMessageToCoordenacaoTeam;
window.notifyMatrixCompraAguardandoLibMedicaoToCoordenacao = notifyMatrixCompraAguardandoLibMedicaoToCoordenacao;
window.notifyMatrixCompraMedicaoLiberadaToCompras = notifyMatrixCompraMedicaoLiberadaToCompras;