const MATRIX_BOT_MXID = '@formighieri.notificacoes:matrix.org';
const MATRIX_TEST_ROOM_ID = '!j9GOGi5unFpFX5e1oyXDOSqc_YxMKxOJgI0PSbk8m9A';
const MATRIX_SESSION_TOKEN_KEY = 'fgp-matrix-access-token';
const MATRIX_SESSION_HOMESERVER_KEY = 'fgp-matrix-homeserver-url';
const MATRIX_APPS_SCRIPT_TIMEOUT_MS = 30000;

const MATRIX_TEST_DM_USERS = [
    { userId: '@oseiasg:matrix.org', label: 'Oseias (@oseiasg)' },
    { userId: '@dexterjl:matrix.org', label: 'Dexter (@dexterjl)' }
];

let matrixBotWhoamiCache = null;

function isMatrixAppsScriptConfigured() {
    return typeof isGoogleDriveAppsScriptConfigured === 'function'
        ? isGoogleDriveAppsScriptConfigured()
        : Boolean(typeof GOOGLE_APPS_SCRIPT_URL === 'string' && GOOGLE_APPS_SCRIPT_URL
            && typeof NOTIFICATION_SCRIPT_SECRET === 'string' && NOTIFICATION_SCRIPT_SECRET);
}

/** Envio sempre via Apps Script (DEV e produção). Cliente direto só para código legado interno. */
function shouldUseMatrixDirectClient() {
    return false;
}

function getMatrixHomeserverUrl() {
    const fromSession = sessionStorage.getItem(MATRIX_SESSION_HOMESERVER_KEY);
    if (fromSession && String(fromSession).trim()) {
        return String(fromSession).trim().replace(/\/$/, '');
    }
    if (typeof MATRIX_HOMESERVER_URL === 'string' && MATRIX_HOMESERVER_URL.trim()) {
        return MATRIX_HOMESERVER_URL.trim().replace(/\/$/, '');
    }
    return 'https://matrix.org';
}

function getMatrixAccessToken() {
    const fromSession = sessionStorage.getItem(MATRIX_SESSION_TOKEN_KEY);
    if (fromSession && String(fromSession).trim()) {
        return String(fromSession).trim();
    }
    if (typeof MATRIX_ACCESS_TOKEN === 'string' && MATRIX_ACCESS_TOKEN.trim()) {
        return MATRIX_ACCESS_TOKEN.trim();
    }
    return '';
}

function persistMatrixSessionCredentials({ accessToken, homeserverUrl } = {}) {
    if (accessToken !== undefined) {
        const token = String(accessToken || '').trim();
        if (token) {
            sessionStorage.setItem(MATRIX_SESSION_TOKEN_KEY, token);
        } else {
            sessionStorage.removeItem(MATRIX_SESSION_TOKEN_KEY);
        }
        matrixBotWhoamiCache = null;
    }
    if (homeserverUrl !== undefined) {
        const url = String(homeserverUrl || '').trim().replace(/\/$/, '');
        if (url) {
            sessionStorage.setItem(MATRIX_SESSION_HOMESERVER_KEY, url);
        } else {
            sessionStorage.removeItem(MATRIX_SESSION_HOMESERVER_KEY);
        }
    }
}

function isMatrixMessagingConfigured() {
    return isMatrixAppsScriptConfigured();
}

function isMatrixProductionBackend() {
    return isMatrixAppsScriptConfigured();
}

function matrixEncodedUserId(userId) {
    return encodeURIComponent(String(userId || '').trim());
}

function parseMatrixClientError(data, status) {
    if (data && typeof data === 'object') {
        const err = data.error || data.errcode;
        if (err) return String(err);
    }
    return `Falha HTTP ${status} na API Matrix.`;
}

function isMatrixInactiveTokenError(errorOrMessage) {
    const text = String(errorOrMessage?.message || errorOrMessage || '').toLowerCase();
    return text.includes('token is not active')
        || text.includes('m_unknown_token')
        || text.includes('invalid access token');
}

function handleMatrixInactiveTokenError(errorOrMessage) {
    if (!isMatrixInactiveTokenError(errorOrMessage)) return;
    persistMatrixSessionCredentials({ accessToken: '' });
    console.warn(
        'Matrix: access token inválido ou expirado — removido da sessão do navegador. '
        + 'Renove o token do bot no Element ou na propriedade MATRIX_ACCESS_TOKEN do Apps Script.'
    );
}

function buildMatrixAppsScriptBody(payload = {}) {
    if (typeof buildGoogleAppsScriptRequestBody === 'function') {
        return buildGoogleAppsScriptRequestBody(payload);
    }
    return {
        secret: NOTIFICATION_SCRIPT_SECRET,
        environment: typeof FORMIGHIERI_APP_ENV === 'string' ? FORMIGHIERI_APP_ENV : 'prod',
        createdById: currentUser?.id ?? null,
        ...payload
    };
}

function matrixAppsScriptMisrouteMessage(detail) {
    const text = String(detail || '');
    if (!/to_email/i.test(text)) return null;
    return (
        'O Web App do Google ainda não trata ações matrix_* (a requisição caiu no envio de e-mail). '
        + 'No projeto Notificações: cole scripts/FormighieriMatrix.gs, atualize o doPost em '
        + 'FormighieriNotificacoes.gs (bloco matrix_*) e publique Implantação → Nova versão.'
    );
}

function throwMatrixAppsScriptError(detail) {
    const misroute = matrixAppsScriptMisrouteMessage(detail);
    throw new Error(misroute || String(detail || 'Falha no Apps Script Matrix.'));
}

async function postMatrixAppsScriptAction(payload = {}) {
    if (!isMatrixAppsScriptConfigured()) {
        throw new Error('Apps Script não configurado para Matrix (GOOGLE_APPS_SCRIPT_URL).');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MATRIX_APPS_SCRIPT_TIMEOUT_MS);

    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(buildMatrixAppsScriptBody(payload)),
            signal: controller.signal
        });

        const text = await response.text();
        let data = null;
        if (text && String(text).trim()) {
            try {
                data = JSON.parse(text);
            } catch {
                data = null;
            }
        }

        if (!response.ok) {
            throwMatrixAppsScriptError(
                (data && (data.error || data.message))
                || `Falha HTTP ${response.status} ao contactar o Apps Script.`
            );
        }

        if (data && typeof data === 'object' && data.ok === false) {
            throwMatrixAppsScriptError(data.error || data.message || 'Falha ao enviar mensagem Matrix.');
        }

        return { data: data || {} };
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('Tempo esgotado ao contactar o Apps Script para Matrix.');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function matrixClientFetch(path, { method = 'GET', body } = {}) {
    const token = getMatrixAccessToken();
    if (!token) {
        throw new Error('Informe o access token do bot na tela de teste (sessão do navegador).');
    }

    const homeserver = getMatrixHomeserverUrl();
    const url = `${homeserver}${path}`;

    let response;
    try {
        response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
    } catch (error) {
        if (error?.name === 'TypeError') {
            throw new Error(
                'Não foi possível contactar o homeserver Matrix (rede ou CORS). '
                + 'Confirme a URL do servidor e se o site está em HTTPS.'
            );
        }
        throw error;
    }

    const text = await response.text();
    let data = null;
    if (text && String(text).trim()) {
        try {
            data = JSON.parse(text);
        } catch {
            data = null;
        }
    }

    if (!response.ok) {
        const message = parseMatrixClientError(data, response.status);
        handleMatrixInactiveTokenError(message);
        throw new Error(message);
    }

    return data || {};
}

async function fetchMatrixBotWhoami() {
    if (matrixBotWhoamiCache) return matrixBotWhoamiCache;
    const whoami = await matrixClientFetch('/_matrix/client/v3/account/whoami', { method: 'GET' });
    matrixBotWhoamiCache = {
        userId: whoami.user_id || MATRIX_BOT_MXID,
        deviceId: whoami.device_id || null
    };
    return matrixBotWhoamiCache;
}

function normalizeMatrixRoomAliasInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('#')) return raw;
    if (raw.startsWith('%23')) {
        try {
            return decodeURIComponent(raw);
        } catch {
            return raw;
        }
    }
    return raw;
}

async function resolveMatrixRoomIdOrAlias(roomIdOrAlias) {
    const normalized = normalizeMatrixRoomAliasInput(roomIdOrAlias);
    if (!normalized) {
        throw new Error('Informe o Room ID ou o endereço da sala (#alias:servidor).');
    }
    if (normalized.startsWith('!')) {
        return normalized;
    }
    if (!normalized.startsWith('#') || !normalized.includes(':')) {
        throw new Error('Use um Room ID (!…) ou um alias (#nome:matrix.org).');
    }

    const path = `/_matrix/client/v3/directory/room/${encodeURIComponent(normalized)}`;
    const data = await matrixClientFetch(path, { method: 'GET' });
    const roomId = String(data.room_id || '').trim();
    if (!roomId) {
        throw new Error(`Alias não encontrado: ${normalized}`);
    }
    return roomId;
}

async function loadMatrixDirectAccountData() {
    const path = `/_matrix/client/v3/user/${matrixEncodedUserId(MATRIX_BOT_MXID)}/account_data/m.direct`;
    try {
        return await matrixClientFetch(path, { method: 'GET' });
    } catch (error) {
        const message = String(error?.message || '');
        if (message.includes('M_NOT_FOUND') || message.includes('404')) {
            return {};
        }
        throw error;
    }
}

async function saveMatrixDirectAccountData(directMap) {
    const path = `/_matrix/client/v3/user/${matrixEncodedUserId(MATRIX_BOT_MXID)}/account_data/m.direct`;
    await matrixClientFetch(path, { method: 'PUT', body: directMap || {} });
}

async function resolveMatrixDirectRoom(targetUserId) {
    const direct = await loadMatrixDirectAccountData();
    const rooms = direct[targetUserId];
    if (Array.isArray(rooms) && rooms.length) {
        return String(rooms[0]);
    }

    const created = await matrixClientFetch('/_matrix/client/v3/createRoom', {
        method: 'POST',
        body: {
            preset: 'trusted_private_chat',
            is_direct: true,
            invite: [targetUserId]
        }
    });

    const roomId = String(created.room_id || '').trim();
    if (!roomId) {
        throw new Error('Matrix não devolveu room_id ao criar conversa direta.');
    }

    if (!direct[targetUserId]) {
        direct[targetUserId] = [];
    }
    if (!direct[targetUserId].includes(roomId)) {
        direct[targetUserId].push(roomId);
    }
    await saveMatrixDirectAccountData(direct);
    return roomId;
}

function normalizeMatrixMentionUserIds(mentionUserIds = []) {
    return [...new Set(
        (mentionUserIds || [])
            .map(id => String(id || '').trim())
            .filter(id => id.startsWith('@') && id.includes(':'))
    )];
}

function escapeMatrixHtmlText(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function matrixToUserHref(matrixUserId) {
    return `https://matrix.to/#/${encodeURIComponent(String(matrixUserId || '').trim())}`;
}

function buildMatrixFormattedBody(bodyText, mentionTargets = []) {
    const targets = typeof normalizeMatrixMentionTargets === 'function'
        ? normalizeMatrixMentionTargets(mentionTargets)
        : [];

    if (!targets.length) {
        return null;
    }

    let html = escapeMatrixHtmlText(bodyText).replace(/\n/g, '<br/>');
    targets.forEach(target => {
        const mxid = target.matrixUserId;
        const label = escapeMatrixHtmlText(target.name || mxid);
        const needle = escapeMatrixHtmlText(mxid);
        const anchor = `<a href="${matrixToUserHref(mxid)}">${label}</a>`;
        html = html.split(needle).join(anchor);
    });
    return html;
}

function buildMatrixTextMessageContent(bodyText, mentionTargets = [], mentionUserIds = []) {
    const content = {
        msgtype: 'm.text',
        body: bodyText
    };
    const targets = typeof normalizeMatrixMentionTargets === 'function'
        ? normalizeMatrixMentionTargets(mentionTargets, mentionUserIds)
        : [];
    const userIds = targets.map(target => target.matrixUserId);

    if (userIds.length) {
        content['m.mentions'] = { user_ids: userIds };
        const formattedBody = buildMatrixFormattedBody(bodyText, targets);
        if (formattedBody) {
            content.format = 'org.matrix.custom.html';
            content.formatted_body = formattedBody;
        }
    }
    return content;
}

function serializeMatrixMentionTargetsForAppsScript(mentionTargets = []) {
    if (typeof normalizeMatrixMentionTargets !== 'function') {
        return normalizeMatrixMentionUserIds(
            (mentionTargets || []).map(target => target?.matrixUserId)
        ).map(matrixUserId => ({ matrixUserId, name: matrixUserId }));
    }
    return normalizeMatrixMentionTargets(mentionTargets).map(target => ({
        matrixUserId: target.matrixUserId,
        name: target.name || target.matrixUserId
    }));
}

async function sendMatrixPlainTextToRoom(roomId, message, mentionTargets = [], mentionUserIds = []) {
    const normalizedRoomId = String(roomId || '').trim();
    const txnId = `fgp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const path = `/_matrix/client/v3/rooms/${encodeURIComponent(normalizedRoomId)}/send/m.room.message/${txnId}`;
    const result = await matrixClientFetch(path, {
        method: 'PUT',
        body: buildMatrixTextMessageContent(message, mentionTargets, mentionUserIds)
    });
    return result.event_id || null;
}

async function pingMatrixBot() {
    if (!shouldUseMatrixDirectClient()) {
        const { data } = await postMatrixAppsScriptAction({ action: 'matrix_ping' });
        return {
            userId: data.userId || MATRIX_BOT_MXID,
            deviceId: null,
            viaAppsScript: true
        };
    }
    const whoami = await fetchMatrixBotWhoami();
    return { ...whoami, viaAppsScript: false };
}

async function sendMatrixMessageDirect({ targetType, userId, roomId, message, mentionTargets, mentionUserIds }) {
    let resolvedRoomId;
    let roomAlias = null;
    if (String(targetType).toLowerCase() === 'user') {
        const mxid = String(userId || '').trim();
        if (!mxid) {
            throw new Error('userId (MXID) obrigatório.');
        }
        resolvedRoomId = await resolveMatrixDirectRoom(mxid);
    } else {
        const aliasInput = normalizeMatrixRoomAliasInput(roomId);
        if (aliasInput.startsWith('#')) roomAlias = aliasInput;
        resolvedRoomId = await resolveMatrixRoomIdOrAlias(roomId);
    }

    const eventId = await sendMatrixPlainTextToRoom(
        resolvedRoomId,
        message,
        mentionTargets,
        mentionUserIds
    );
    return { roomId: resolvedRoomId, eventId, roomAlias, viaAppsScript: false };
}

async function sendMatrixMessageViaAppsScript({
    targetType,
    userId,
    roomId,
    message,
    mentionTargets,
    mentionUserIds
}) {
    const serializedMentionTargets = serializeMatrixMentionTargetsForAppsScript(
        mentionTargets?.length ? mentionTargets : (mentionUserIds || []).map(id => ({ matrixUserId: id }))
    );
    const { data } = await postMatrixAppsScriptAction({
        action: 'matrix_send',
        targetType,
        userId: userId || '',
        roomId: roomId || '',
        message,
        mentionUserIds: serializedMentionTargets.map(target => target.matrixUserId),
        mentionTargets: serializedMentionTargets
    });

    const aliasInput = normalizeMatrixRoomAliasInput(roomId);
    return {
        roomId: data.roomId,
        eventId: data.eventId,
        roomAlias: aliasInput.startsWith('#') ? aliasInput : null,
        viaAppsScript: true
    };
}

async function sendMatrixMessage({
    targetType,
    userId,
    roomId,
    message,
    mentionTargets,
    mentionUserIds
}) {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        throw new Error('Digite uma mensagem.');
    }

    if (!isMatrixAppsScriptConfigured()) {
        throw new Error(
            'Matrix usa o Apps Script. Configure MATRIX_ACCESS_TOKEN nas propriedades do projeto Notificações.'
        );
    }
    return sendMatrixMessageViaAppsScript({
        targetType,
        userId,
        roomId,
        message: trimmed,
        mentionTargets,
        mentionUserIds
    });
}

async function sendMatrixProjectsRoomMessage(message, options = {}) {
    return sendMatrixMessageToProductionRoom(getMatrixRoomAlias('projects'), message, options);
}

async function sendMatrixRevisionsRoomMessage(message, options = {}) {
    return sendMatrixMessageToProductionRoom(getMatrixRoomAlias('revisions'), message, options);
}

function formatMatrixNotificationIntendedRoomLabel(roomIdOrAlias) {
    const value = String(roomIdOrAlias || '').trim();
    if (!value) return '—';
    const definitions = typeof MATRIX_ROOM_DEFINITIONS !== 'undefined'
        ? MATRIX_ROOM_DEFINITIONS
        : (typeof window !== 'undefined' ? window.MATRIX_ROOM_DEFINITIONS : null);
    if (Array.isArray(definitions)) {
        const match = definitions.find(def => def.roomAlias === value);
        if (match) {
            return `${match.label} (${match.roomAlias})`;
        }
    }
    return value;
}

const MATRIX_NOTIFICATION_TEST_USER_ID = '@dexterjl:matrix.org';

function getMatrixNotificationTestUserId() {
    if (typeof getMatrixNotificationTestMentionTargets === 'function') {
        const mxid = getMatrixNotificationTestMentionTargets()?.[0]?.matrixUserId;
        if (mxid) return String(mxid).trim();
    }
    return MATRIX_NOTIFICATION_TEST_USER_ID;
}

/**
 * Em NOTIFICATION_TEST_MODE, não posta em salas oficiais — envia DM ao usuário de teste.
 */
function getMatrixNotificationDeliveryRoom(productionRoomIdOrAlias) {
    const intendedRoom = String(productionRoomIdOrAlias || '').trim();
    const intendedRoomLabel = formatMatrixNotificationIntendedRoomLabel(intendedRoom);

    if (typeof NOTIFICATION_TEST_MODE !== 'undefined' && NOTIFICATION_TEST_MODE) {
        const userId = getMatrixNotificationTestUserId();
        if (userId) {
            return {
                targetType: 'user',
                userId,
                roomId: '',
                testRedirect: true,
                intendedRoom,
                intendedRoomLabel
            };
        }
    }

    return {
        targetType: 'room',
        userId: '',
        roomId: intendedRoom,
        testRedirect: false,
        intendedRoom,
        intendedRoomLabel
    };
}

function applyMatrixNotificationTestRoomPrefix(message, delivery) {
    const body = String(message || '').trim();
    if (!body || !delivery?.testRedirect || !delivery.intendedRoomLabel) {
        return body;
    }
    return `[TESTE DEV — em produção: ${delivery.intendedRoomLabel}]\n\n${body}`;
}

async function sendMatrixMessageToProductionRoom(productionRoomIdOrAlias, message, options = {}) {
    const delivery = getMatrixNotificationDeliveryRoom(productionRoomIdOrAlias);
    const trimmed = applyMatrixNotificationTestRoomPrefix(message, delivery);

    if (delivery.targetType === 'user' && delivery.userId) {
        return sendMatrixMessage({
            targetType: 'user',
            userId: delivery.userId,
            message: trimmed,
            mentionTargets: options.mentionTargets,
            mentionUserIds: options.mentionUserIds
        });
    }

    return sendMatrixMessage({
        targetType: 'room',
        roomId: delivery.roomId,
        message: trimmed,
        mentionTargets: options.mentionTargets,
        mentionUserIds: options.mentionUserIds
    });
}

window.MATRIX_BOT_MXID = MATRIX_BOT_MXID;
window.MATRIX_TEST_ROOM_ALIAS = getMatrixRoomAlias('projects');
window.MATRIX_TEST_ROOM_ID = MATRIX_TEST_ROOM_ID;
window.MATRIX_TEST_DM_USERS = MATRIX_TEST_DM_USERS;
window.getMatrixHomeserverUrl = getMatrixHomeserverUrl;
window.getMatrixAccessToken = getMatrixAccessToken;
window.persistMatrixSessionCredentials = persistMatrixSessionCredentials;
window.isMatrixMessagingConfigured = isMatrixMessagingConfigured;
window.isMatrixProductionBackend = isMatrixProductionBackend;
window.shouldUseMatrixDirectClient = shouldUseMatrixDirectClient;
window.resolveMatrixRoomIdOrAlias = resolveMatrixRoomIdOrAlias;
window.pingMatrixBot = pingMatrixBot;
window.sendMatrixMessage = sendMatrixMessage;
window.MATRIX_NOTIFICATION_TEST_USER_ID = MATRIX_NOTIFICATION_TEST_USER_ID;
window.getMatrixNotificationTestUserId = getMatrixNotificationTestUserId;
window.getMatrixNotificationDeliveryRoom = getMatrixNotificationDeliveryRoom;
window.applyMatrixNotificationTestRoomPrefix = applyMatrixNotificationTestRoomPrefix;
window.sendMatrixMessageToProductionRoom = sendMatrixMessageToProductionRoom;
window.sendMatrixProjectsRoomMessage = sendMatrixProjectsRoomMessage;
window.sendMatrixRevisionsRoomMessage = sendMatrixRevisionsRoomMessage;
