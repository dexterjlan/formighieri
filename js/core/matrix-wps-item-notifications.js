const wpsItemMatrixRoomNotifier = new MatrixRoomNotifier(
    typeof getMatrixRoomAlias === 'function' ? getMatrixRoomAlias('furniture') : ''
);

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

async function notifyMatrixWpsItemRegistrationSentToCompras(request = {}) {
    if (!NOTIFICATIONS_ENABLED || !request?.id) return null;

    try {
        const lines = buildWpsItemRegistrationMatrixLines(
            'Nova solicitação — Cadastro Item WPS',
            request,
            ['Status: Enviado para Compras']
        );

        if (typeof sendMatrixDirectMessageToComprasTeam === 'function') {
            return await sendMatrixDirectMessageToComprasTeam(lines);
        }

        return await wpsItemMatrixRoomNotifier.send(lines, { mentionTargets: [] });
    } catch (error) {
        console.warn('notifyMatrixWpsItemRegistrationSentToCompras:', error);
        return null;
    }
}

async function notifyMatrixWpsItemRegistrationRegistered(request = {}) {
    if (!NOTIFICATIONS_ENABLED || !request?.id) return null;

    try {
        const mentionTargets = await resolveWpsItemRegistrationCreatorMatrixTargets(request.createdById);
        const wpsCode = String(request.wpsCode || '').trim() || '—';

        const lines = buildWpsItemRegistrationMatrixLines(
            'Item cadastrado no WPS',
            request,
            [`Código WPS: ${wpsCode}`, 'Status: Cadastrado']
        );

        return await wpsItemMatrixRoomNotifier.send(lines, { mentionTargets });
    } catch (error) {
        console.warn('notifyMatrixWpsItemRegistrationRegistered:', error);
        return null;
    }
}

async function notifyMatrixWpsItemRegistrationInBudget(request = {}) {
    if (!NOTIFICATIONS_ENABLED || !request?.id) return null;

    try {
        const mentionTargets = await resolveWpsItemRegistrationCreatorMatrixTargets(request.createdById);

        const lines = buildWpsItemRegistrationMatrixLines(
            'Atualização — Cadastro Item WPS',
            request,
            ['Status: Em processo de orçamento']
        );

        return await wpsItemMatrixRoomNotifier.send(lines, { mentionTargets });
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
