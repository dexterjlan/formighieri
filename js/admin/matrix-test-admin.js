function fillMatrixTestUserSelect() {
    const select = document.getElementById('matrix-test-user-id');
    if (!select || select.dataset.filled === '1') return;

    const users = window.MATRIX_TEST_DM_USERS || [];
    select.innerHTML = users.map(item => `
        <option value="${escapeHtml(item.userId)}">${escapeHtml(item.label)}</option>
    `).join('');
    select.dataset.filled = '1';
}

function syncMatrixTestCredentialsFromUi() {
    const token = document.getElementById('matrix-test-access-token')?.value || '';
    const homeserver = document.getElementById('matrix-test-homeserver')?.value || '';
    if (typeof persistMatrixSessionCredentials === 'function') {
        persistMatrixSessionCredentials({
            accessToken: token,
            homeserverUrl: homeserver
        });
    }
}

function loadMatrixTestCredentialsIntoUi() {
    const homeserverInput = document.getElementById('matrix-test-homeserver');
    const tokenInput = document.getElementById('matrix-test-access-token');

    if (homeserverInput && typeof getMatrixHomeserverUrl === 'function') {
        homeserverInput.value = getMatrixHomeserverUrl();
    }
    if (tokenInput && typeof getMatrixAccessToken === 'function') {
        const token = getMatrixAccessToken();
        if (token) tokenInput.value = token;
    }
}

function setMatrixTestStatus(message, variant = 'info') {
    const el = document.getElementById('matrix-test-status');
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('text-red-700', 'text-emerald-700', 'text-amber-700', 'text-slate-500');
    if (variant === 'error') el.classList.add('text-red-700');
    else if (variant === 'success') el.classList.add('text-emerald-700');
    else if (variant === 'warning') el.classList.add('text-amber-700');
    else el.classList.add('text-slate-500');
}

function setMatrixTestBusy(isBusy) {
    document.querySelectorAll('[data-matrix-test-action]').forEach(button => {
        button.disabled = isBusy;
        button.classList.toggle('opacity-60', isBusy);
        button.classList.toggle('cursor-not-allowed', isBusy);
    });
    const messageField = document.getElementById('matrix-test-message');
    if (messageField) messageField.disabled = isBusy;
}

function refreshMatrixTestBackendUi() {
    const directBlock = document.getElementById('matrix-test-direct-credentials');
    const prodNote = document.getElementById('matrix-test-prod-note');
    const useProd = typeof isMatrixProductionBackend === 'function' && isMatrixProductionBackend();

    directBlock?.classList.toggle('hidden', useProd);
    prodNote?.classList.toggle('hidden', !useProd);
}

async function initMatrixTestAdminPanel() {
    if (!isAdmin() || isThirdParty()) return;

    refreshMatrixTestBackendUi();
    fillMatrixTestUserSelect();
    loadMatrixTestCredentialsIntoUi();

    const roomInput = document.getElementById('matrix-test-room-id');
    if (roomInput && !roomInput.value.trim()) {
        roomInput.value = window.MATRIX_TEST_ROOM_ALIAS || window.MATRIX_TEST_ROOM_ID || '';
    }

    const botLabel = document.getElementById('matrix-test-bot-mxid');
    if (botLabel) {
        botLabel.textContent = window.MATRIX_BOT_MXID || '@formighieri.notificacoes:matrix.org';
    }

    if (!isMatrixMessagingConfigured()) {
        const hint = typeof isMatrixProductionBackend === 'function' && isMatrixProductionBackend()
            ? 'Configure MATRIX_ACCESS_TOKEN no Apps Script (Notificações) e republicar o Web App.'
            : 'Cole o access token do bot (Element → Avançado) ou configure o Apps Script.';
        setMatrixTestStatus(hint, 'warning');
        return;
    }

    if (typeof isMatrixProductionBackend === 'function' && isMatrixProductionBackend()) {
        setMatrixTestStatus(
            'Produção: envio via Apps Script (token no servidor). Texto simples, rápido.'
        );
        return;
    }

    setMatrixTestStatus(
        'DEV: envio direto com token na sessão. Produção usa Apps Script automaticamente.'
    );
}

async function runMatrixTestPing() {
    if (!isAdmin() || isThirdParty()) return;

    syncMatrixTestCredentialsFromUi();

    setMatrixTestBusy(true);
    setMatrixTestStatus('Testando conexão com Matrix...');
    try {
        const data = await pingMatrixBot();
        const deviceHint = data.deviceId ? ` Dispositivo: ${data.deviceId}.` : '';
        setMatrixTestStatus(
            `Conexão OK. Conta: ${data.userId || window.MATRIX_BOT_MXID}.${deviceHint}`,
            'success'
        );
    } catch (error) {
        console.error('runMatrixTestPing:', error);
        setMatrixTestStatus(error.message || 'Falha no teste de conexão.', 'error');
    } finally {
        setMatrixTestBusy(false);
    }
}

async function runMatrixTestSend(targetType) {
    if (!isAdmin() || isThirdParty()) return;

    syncMatrixTestCredentialsFromUi();

    const message = document.getElementById('matrix-test-message')?.value?.trim();
    if (!message) {
        alertAppDialog('Digite a mensagem de teste.');
        return;
    }

    let userId = '';
    let roomId = '';
    if (targetType === 'user') {
        userId = document.getElementById('matrix-test-user-id')?.value?.trim() || '';
        if (!userId) {
            alertAppDialog('Selecione o usuário Matrix.');
            return;
        }
    } else {
        roomId = document.getElementById('matrix-test-room-id')?.value?.trim() || '';
        if (!roomId) {
            alertAppDialog('Informe o ID da sala.');
            return;
        }
    }

    setMatrixTestBusy(true);
    setMatrixTestStatus(
        targetType === 'user'
            ? `Enviando mensagem direta para ${userId}...`
            : `Enviando mensagem na sala ${roomId}...`
    );

    try {
        const data = await sendMatrixMessage({
            targetType,
            userId,
            roomId,
            message
        });
        const roomHint = data.roomAlias
            ? ` ${data.roomAlias} → ${data.roomId}`
            : (data.roomId ? ` Sala: ${data.roomId}` : '');
        setMatrixTestStatus(`Mensagem enviada com sucesso.${roomHint}`, 'success');
    } catch (error) {
        console.error('runMatrixTestSend:', error);
        setMatrixTestStatus(error.message || 'Erro ao enviar mensagem.', 'error');
    } finally {
        setMatrixTestBusy(false);
    }
}

async function showMatrixTestAdmin() {
    if (!isAdmin() || isThirdParty()) return;

    if (typeof showSystemSettings === 'function') {
        await showSystemSettings('matrix-test');
        return;
    }

    hideSubViews?.();
    document.getElementById('system-settings-view')?.classList.remove('hidden');
    setSettingsNavActive?.('matrix-test');
    await initMatrixTestAdminPanel();
}

function bindMatrixTestAdminEvents() {
    document.getElementById('settings-nav-matrix-test')?.addEventListener('click', () => {
        if (typeof editingGestaoOrderId !== 'undefined') editingGestaoOrderId = null;
        showMatrixTestAdmin();
    });

    document.getElementById('matrix-test-access-token')?.addEventListener('change', syncMatrixTestCredentialsFromUi);
    document.getElementById('matrix-test-homeserver')?.addEventListener('change', syncMatrixTestCredentialsFromUi);

    document.getElementById('matrix-test-ping')?.addEventListener('click', () => {
        runMatrixTestPing();
    });

    document.getElementById('matrix-test-send-dm')?.addEventListener('click', () => {
        runMatrixTestSend('user');
    });

    document.getElementById('matrix-test-send-room')?.addEventListener('click', () => {
        runMatrixTestSend('room');
    });
}

bindMatrixTestAdminEvents();

window.showMatrixTestAdmin = showMatrixTestAdmin;
window.initMatrixTestAdminPanel = initMatrixTestAdminPanel;
