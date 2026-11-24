function buildWpsItemRegistrationMatrixLines(eventTitle, request = {}, extraLines = []) {
    const typeName = request?.wpsItemType?.name || '—';
    const description = String(request?.description || '').trim() || '—';
    const requestId = request?.id ? `#${request.id}` : '—';
    const createdByName = request?.createdBy?.name || '—';
    const actorName = currentUser?.name || 'Sistema';

    return [
        `📦 ${eventTitle}`,
        `Solicitação ${requestId}`,
        `Tipo: ${typeName}`,
        `Descritivo: ${description}`,
        `Solicitante: ${createdByName}`,
        ...extraLines,
        `Por: ${actorName}`
    ].filter(Boolean);
}

async function resolveWpsItemRegistrationCreatorMatrixTargets(createdById) {
    if (typeof NOTIFICATION_TEST_MODE !== 'undefined' && NOTIFICATION_TEST_MODE) {
        return typeof getMatrixNotificationTestMentionTargets === 'function'
            ? getMatrixNotificationTestMentionTargets()
            : [{ matrixUserId: '@dexterjl:matrix.org', name: 'Dexter (@dexterjl)' }];
    }

    if (typeof fetchAppUsersMatrixMentionTargets === 'function') {
        return fetchAppUsersMatrixMentionTargets([createdById]);
    }

    return [];
}

function formatMatrixDirectMessageLines(linesOrText) {
    return (Array.isArray(linesOrText) ? linesOrText : [String(linesOrText || '')])
        .map(line => String(line || '').trim())
        .filter(Boolean)
        .join('\n');
}

async function sendMatrixDirectMessageToAppUser(appUserId, linesOrText, options = {}) {
    if (!NOTIFICATIONS_ENABLED) return null;

    if (typeof isMatrixMessagingConfigured === 'function' && !isMatrixMessagingConfigured()) {
        console.info('sendMatrixDirectMessageToAppUser: Matrix não configurado — mensagem não enviada.');
        return null;
    }

    if (typeof sendMatrixMessage !== 'function') {
        console.warn('sendMatrixDirectMessageToAppUser: sendMatrixMessage indisponível.');
        return null;
    }

    const body = formatMatrixDirectMessageLines(linesOrText);
    if (!body) return null;

    const targets = await resolveWpsItemRegistrationCreatorMatrixTargets(appUserId);
    const productionUserId = String(targets[0]?.matrixUserId || '').trim();
    if (!productionUserId) {
        console.warn('sendMatrixDirectMessageToAppUser: usuário sem MXID no cadastro.');
        return null;
    }

    let userId = productionUserId;
    let message = body;
    if (typeof NOTIFICATION_TEST_MODE !== 'undefined' && NOTIFICATION_TEST_MODE) {
        const testUserId = typeof getMatrixNotificationTestUserId === 'function'
            ? getMatrixNotificationTestUserId()
            : productionUserId;
        userId = String(testUserId || productionUserId).trim();
        const intendedLabel = options.intendedLabel || `DM ${productionUserId}`;
        message = `[TESTE DEV — em produção: ${intendedLabel}]\n\n${message}`;
    }

    return sendMatrixMessage({
        targetType: 'user',
        userId,
        message
    });
}

async function notifyMatrixWpsItemRegistrationSentToCompras(request = {}) {
    if (!NOTIFICATIONS_ENABLED || !request?.id) return null;

    try {
        const lines = buildWpsItemRegistrationMatrixLines(
            'Nova solicitação — Cadastro Item WPS',
            request,
            ['Status: Enviado para Compras']
        );

        if (typeof sendMatrixDirectMessageToComprasTeam !== 'function') {
            console.warn('notifyMatrixWpsItemRegistrationSentToCompras: DM Compras indisponível.');
            return null;
        }

        return await sendMatrixDirectMessageToComprasTeam(lines);
    } catch (error) {
        console.warn('notifyMatrixWpsItemRegistrationSentToCompras:', error);
        return null;
    }
}

async function notifyMatrixWpsItemRegistrationRegistered(request = {}) {
    if (!NOTIFICATIONS_ENABLED || !request?.id) return null;

    try {
        const creatorId = Number(request.createdById ?? request.createdBy?.id);
        const wpsCode = String(request.wpsCode || '').trim() || '—';

        const lines = buildWpsItemRegistrationMatrixLines(
            'Item cadastrado no WPS',
            request,
            [`Código WPS: ${wpsCode}`, 'Status: Cadastrado']
        );

        return await sendMatrixDirectMessageToAppUser(creatorId, lines, {
            intendedLabel: 'solicitante do cadastro WPS'
        });
    } catch (error) {
        console.warn('notifyMatrixWpsItemRegistrationRegistered:', error);
        return null;
    }
}

async function notifyMatrixWpsItemRegistrationInBudget(request = {}) {
    if (!NOTIFICATIONS_ENABLED || !request?.id) return null;

    try {
        const creatorId = Number(request.createdById ?? request.createdBy?.id);

        const lines = buildWpsItemRegistrationMatrixLines(
            'Atualização — Cadastro Item WPS',
            request,
            ['Status: Em processo de orçamento']
        );

        return await sendMatrixDirectMessageToAppUser(creatorId, lines, {
            intendedLabel: 'solicitante do cadastro WPS'
        });
    } catch (error) {
        console.warn('notifyMatrixWpsItemRegistrationInBudget:', error);
        return null;
    }
}

function notifyMatrixWpsItemRegistrationSentToComprasFireAndForget(request) {
    notifyMatrixWpsItemRegistrationSentToCompras(request).catch(error => {
        console.warn('notifyMatrixWpsItemRegistrationSentToCompras:', error);
    });
}

function notifyMatrixWpsItemRegistrationRegisteredFireAndForget(request) {
    notifyMatrixWpsItemRegistrationRegistered(request).catch(error => {
        console.warn('notifyMatrixWpsItemRegistrationRegistered:', error);
    });
}

function notifyMatrixWpsItemRegistrationInBudgetFireAndForget(request) {
    notifyMatrixWpsItemRegistrationInBudget(request).catch(error => {
        console.warn('notifyMatrixWpsItemRegistrationInBudget:', error);
    });
}

window.notifyMatrixWpsItemRegistrationSentToCompras = notifyMatrixWpsItemRegistrationSentToCompras;
window.notifyMatrixWpsItemRegistrationRegistered = notifyMatrixWpsItemRegistrationRegistered;
window.notifyMatrixWpsItemRegistrationInBudget = notifyMatrixWpsItemRegistrationInBudget;
window.notifyMatrixWpsItemRegistrationSentToComprasFireAndForget = notifyMatrixWpsItemRegistrationSentToComprasFireAndForget;
window.notifyMatrixWpsItemRegistrationRegisteredFireAndForget = notifyMatrixWpsItemRegistrationRegisteredFireAndForget;
window.notifyMatrixWpsItemRegistrationInBudgetFireAndForget = notifyMatrixWpsItemRegistrationInBudgetFireAndForget;