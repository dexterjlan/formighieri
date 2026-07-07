const DEFAULT_SYSTEM_SETTINGS = {
    settingsKey: 'default',
    approvalCcEmails: '',
    requestCcEmails: '',
    approvalOverdueDays: SYSTEM_SETTINGS_DEFAULTS.approvalOverdueDays,
    requestOverdueDays: SYSTEM_SETTINGS_DEFAULTS.requestOverdueDays
};

function normalizeSystemSettings(record) {
    return {
        settingsKey: record?.settingsKey || 'default',
        approvalCcEmails: record?.approvalCcEmails || '',
        requestCcEmails: record?.requestCcEmails || '',
        approvalOverdueDays: Number(record?.approvalOverdueDays) || SYSTEM_SETTINGS_DEFAULTS.approvalOverdueDays,
        requestOverdueDays: Number(record?.requestOverdueDays) || SYSTEM_SETTINGS_DEFAULTS.requestOverdueDays,
        updatedAt: record?.updatedAt || null
    };
}

function parseEmailList(text) {
    if (!text) return [];
    return String(text)
        .split(/[,;]+/)
        .map(email => email.trim())
        .filter(Boolean);
}

function formatEmailListForInput(emails) {
    return parseEmailList(emails).join(', ');
}

function getApprovalCcEmailsRaw() {
    return systemSettingsCache?.approvalCcEmails || '';
}

function getRequestCcEmailsRaw() {
    return systemSettingsCache?.requestCcEmails || '';
}

function getApprovalCcEmailsList() {
    return parseEmailList(getApprovalCcEmailsRaw());
}

function getRequestCcEmailsList() {
    return parseEmailList(getRequestCcEmailsRaw());
}

function getApprovalCcEmailsPayload() {
    return getApprovalCcEmailsList().join(', ');
}

function getRequestCcEmailsPayload() {
    return getRequestCcEmailsList().join(', ');
}

async function ensureSystemSettingsLoaded() {
    if (!systemSettingsCache) {
        await loadSystemSettings();
    }
    return systemSettingsCache;
}

async function loadSystemSettings() {
    const { data, error } = await supabaseClient
        .from('SystemSettings')
        .select('settingsKey, approvalCcEmails, requestCcEmails, approvalOverdueDays, requestOverdueDays, updatedAt')
        .eq('settingsKey', 'default')
        .maybeSingle();

    if (error) {
        if (error.message?.includes('SystemSettings')) {
            systemSettingsCache = { ...DEFAULT_SYSTEM_SETTINGS };
            return systemSettingsCache;
        }
        console.warn('loadSystemSettings:', error);
        systemSettingsCache = { ...DEFAULT_SYSTEM_SETTINGS };
        return systemSettingsCache;
    }

    systemSettingsCache = normalizeSystemSettings(data || DEFAULT_SYSTEM_SETTINGS);
    return systemSettingsCache;
}

function fillSystemSettingsForm(settings = systemSettingsCache) {
    const data = normalizeSystemSettings(settings || DEFAULT_SYSTEM_SETTINGS);
    document.getElementById('settings-approval-cc-emails').value = data.approvalCcEmails || '';
    document.getElementById('settings-request-cc-emails').value = data.requestCcEmails || '';
    document.getElementById('settings-approval-overdue-days').value = String(data.approvalOverdueDays);
    document.getElementById('settings-request-overdue-days').value = String(data.requestOverdueDays);

    const updatedEl = document.getElementById('settings-updated-at');
    if (updatedEl) {
        updatedEl.textContent = data.updatedAt
            ? `Última atualização: ${formatDate(data.updatedAt)}`
            : 'Usando valores padrão do sistema.';
    }
}

async function showSystemSettings() {
    if (!isAdmin()) return;
    hideSubViews();
    document.getElementById('system-settings-view').classList.remove('hidden');
    updateMainNavActive('settings');
    updateAdminNav();
    await loadSystemSettings();
    fillSystemSettingsForm(systemSettingsCache);
}

function validateSystemSettingsInput(payload) {
    if (!Number.isInteger(payload.approvalOverdueDays) || payload.approvalOverdueDays < 1) {
        alertAppDialog('Informe ao menos 1 dia para aprovação em aberto considerada atrasada.');
        return false;
    }
    if (!Number.isInteger(payload.requestOverdueDays) || payload.requestOverdueDays < 1) {
        alertAppDialog('Informe ao menos 1 dia para requisição em aberto considerada atrasada.');
        return false;
    }

    const allEmails = [
        ...parseEmailList(payload.approvalCcEmails),
        ...parseEmailList(payload.requestCcEmails)
    ];
    const invalid = allEmails.find(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (invalid) {
        alertAppDialog(`E-mail inválido: ${invalid}`, { variant: 'error', title: 'Erro' });
        return false;
    }

    return true;
}

function collectSystemSettingsFromForm() {
    return {
        settingsKey: 'default',
        approvalCcEmails: document.getElementById('settings-approval-cc-emails').value.trim(),
        requestCcEmails: document.getElementById('settings-request-cc-emails').value.trim(),
        approvalOverdueDays: Number.parseInt(document.getElementById('settings-approval-overdue-days').value, 10),
        requestOverdueDays: Number.parseInt(document.getElementById('settings-request-overdue-days').value, 10),
        updatedAt: new Date().toISOString(),
        updatedById: currentUser?.id || null
    };
}

function setSystemSettingsFormLoading(isLoading) {
    const submitBtn = document.getElementById('settings-form-submit');
    const fields = document.querySelectorAll('#system-settings-form input, #system-settings-form textarea');

    if (submitBtn) {
        submitBtn.disabled = isLoading;
        submitBtn.classList.toggle('opacity-60', isLoading);
        submitBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    fields.forEach(field => { field.disabled = isLoading; });
}

async function saveSystemSettings() {
    if (!isAdmin()) return;

    const payload = collectSystemSettingsFromForm();
    if (!validateSystemSettingsInput(payload)) return;

    setSystemSettingsFormLoading(true);

    try {
        const { data: existing } = await supabaseClient
            .from('SystemSettings')
            .select('settingsKey')
            .eq('settingsKey', 'default')
            .maybeSingle();

        let error;
        if (existing) {
            ({ error } = await supabaseClient
                .from('SystemSettings')
                .update(payload)
                .eq('settingsKey', 'default'));
        } else {
            ({ error } = await supabaseClient
                .from('SystemSettings')
                .insert([payload]));
        }

        if (error) {
            alertAppDialog('Erro ao salvar configurações: ' + error.message);
            return;
        }

        await loadSystemSettings();
        fillSystemSettingsForm(systemSettingsCache);

        if (activeOrderId) {
            await Promise.all([
                loadConversations(activeOrderId),
                loadCommercialApprovals(activeOrderId)
            ]);
        }
        if (!document.getElementById('conversations-query-view').classList.contains('hidden')) {
            await searchConversations();
        }
        if (!document.getElementById('approvals-query-view').classList.contains('hidden')) {
            await searchCommercialApprovalsQuery();
        }

        alertAppDialog('Configurações salvas com sucesso.');
    } finally {
        setSystemSettingsFormLoading(false);
    }
}

function bindSystemSettingsEvents() {
    document.getElementById('btn-system-settings')?.addEventListener('click', showSystemSettings);
    document.getElementById('system-settings-form')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        saveSystemSettings();
    });
}
