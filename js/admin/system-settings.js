const DEFAULT_SYSTEM_SETTINGS = {
    settingsKey: 'default',
    approvalCcEmails: '',
    requestCcEmails: '',
    approvalOverdueDays: SYSTEM_SETTINGS_DEFAULTS.approvalOverdueDays,
    requestOverdueDays: SYSTEM_SETTINGS_DEFAULTS.requestOverdueDays,
    expeditionFactoryStreet: '',
    expeditionFactoryNumber: '',
    expeditionFactoryComplement: '',
    expeditionFactoryNeighborhood: '',
    expeditionFactoryCity: '',
    expeditionFactoryState: '',
    expeditionFactoryPostalCode: ''
};

function normalizeSystemSettings(record) {
    return {
        settingsKey: record?.settingsKey || 'default',
        approvalCcEmails: record?.approvalCcEmails || '',
        requestCcEmails: record?.requestCcEmails || '',
        approvalOverdueDays: Number(record?.approvalOverdueDays) || SYSTEM_SETTINGS_DEFAULTS.approvalOverdueDays,
        requestOverdueDays: Number(record?.requestOverdueDays) || SYSTEM_SETTINGS_DEFAULTS.requestOverdueDays,
        expeditionFactoryStreet: record?.expeditionFactoryStreet || '',
        expeditionFactoryNumber: record?.expeditionFactoryNumber || '',
        expeditionFactoryComplement: record?.expeditionFactoryComplement || '',
        expeditionFactoryNeighborhood: record?.expeditionFactoryNeighborhood || '',
        expeditionFactoryCity: record?.expeditionFactoryCity || '',
        expeditionFactoryState: record?.expeditionFactoryState || '',
        expeditionFactoryPostalCode: record?.expeditionFactoryPostalCode || '',
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
    const selectWithExpedition = 'settingsKey, approvalCcEmails, requestCcEmails, approvalOverdueDays, requestOverdueDays, expeditionFactoryStreet, expeditionFactoryNumber, expeditionFactoryComplement, expeditionFactoryNeighborhood, expeditionFactoryCity, expeditionFactoryState, expeditionFactoryPostalCode, updatedAt';
    const selectLegacy = 'settingsKey, approvalCcEmails, requestCcEmails, approvalOverdueDays, requestOverdueDays, updatedAt';

    let result = await supabaseClient
        .from('SystemSettings')
        .select(selectWithExpedition)
        .eq('settingsKey', 'default')
        .maybeSingle();

    if (result.error && /expeditionFactory|schema cache|does not exist/i.test(result.error.message || '')) {
        result = await supabaseClient
            .from('SystemSettings')
            .select(selectLegacy)
            .eq('settingsKey', 'default')
            .maybeSingle();
    }

    const { data, error } = result;

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
    const expeditionFactoryFields = [
        ['settings-expedition-factory-street', data.expeditionFactoryStreet],
        ['settings-expedition-factory-number', data.expeditionFactoryNumber],
        ['settings-expedition-factory-complement', data.expeditionFactoryComplement],
        ['settings-expedition-factory-neighborhood', data.expeditionFactoryNeighborhood],
        ['settings-expedition-factory-city', data.expeditionFactoryCity],
        ['settings-expedition-factory-state', data.expeditionFactoryState]
    ];
    expeditionFactoryFields.forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = value || '';
    });
    const postalInput = document.getElementById('settings-expedition-factory-postal-code');
    if (postalInput) {
        const formatted = typeof formatPostalCodeDisplay === 'function'
            ? formatPostalCodeDisplay(data.expeditionFactoryPostalCode)
            : (data.expeditionFactoryPostalCode || '');
        postalInput.value = formatted;
    }
    bindExpeditionFactoryAddressFields();

    const updatedEl = document.getElementById('settings-updated-at');
    if (updatedEl) {
        updatedEl.textContent = data.updatedAt
            ? `Última atualização: ${formatDate(data.updatedAt)}`
            : 'Usando valores padrão do sistema.';
    }
}

const SETTINGS_CADASTRO_PANELS = {
    'calendar-event-types': 'gestao-calendar-event-types-panel',
    'deal-stages': 'gestao-deal-stages-panel',
    'lost-reasons': 'gestao-lost-reasons-panel',
    'project-status': 'gestao-project-status-panel',
    'create-detailing': 'gestao-create-detailing-panel',
    'compra-status': 'gestao-compra-status-panel',
    usuarios: 'gestao-usuarios-panel'
};

let settingsCadastroPanelsRelocated = false;

function relocateSettingsCadastroPanels() {
    if (settingsCadastroPanelsRelocated) return;
    const host = document.querySelector('#system-settings-view .settings-content');
    if (!host) return;

    Object.values(SETTINGS_CADASTRO_PANELS).forEach((panelId) => {
        const panel = document.getElementById(panelId);
        if (panel && panel.parentElement !== host) {
            host.appendChild(panel);
        }
    });
    settingsCadastroPanelsRelocated = true;
}

async function loadSettingsCadastroPanel(panelKey) {
    if (panelKey === 'calendar-event-types' && typeof loadGestaoCalendarEventTypesList === 'function') {
        await loadGestaoCalendarEventTypesList();
        return;
    }
    if (panelKey === 'deal-stages' && typeof loadGestaoDealStagesList === 'function') {
        await loadGestaoDealStagesList();
        return;
    }
    if (panelKey === 'lost-reasons' && typeof loadGestaoLostReasonsList === 'function') {
        await loadGestaoLostReasonsList();
        return;
    }
    if (panelKey === 'project-status' && typeof loadGestaoProjectStatusList === 'function') {
        await loadGestaoProjectStatusList();
        return;
    }
    if (panelKey === 'compra-status' && typeof loadGestaoCompraStatusList === 'function') {
        await loadGestaoCompraStatusList();
        return;
    }
    if (panelKey === 'usuarios' && typeof loadUsersAdminList === 'function') {
        await loadUsersAdminList();
    }
}

async function showSystemSettings(panelKey = 'geral') {
    if (!isAdmin() || isThirdParty()) return;
    relocateSettingsCadastroPanels();
    hideSubViews();
    document.getElementById('system-settings-view').classList.remove('hidden');
    updateMainNavActive('settings');
    updateAdminNav();
    if (typeof hideAllGestaoPanels === 'function') hideAllGestaoPanels();
    setSettingsNavActive(panelKey);

    if (panelKey === 'geral') {
        await loadSystemSettings();
        fillSystemSettingsForm(systemSettingsCache);
        return;
    }
    if (panelKey === 'activity-log' && typeof initActivityLogAdminPanel === 'function') {
        await initActivityLogAdminPanel();
        return;
    }
    if (panelKey === 'matrix-test' && typeof initMatrixTestAdminPanel === 'function') {
        await initMatrixTestAdminPanel();
        return;
    }
    if (panelKey === 'import-pedido' && typeof loadImportPedidoSettings === 'function') {
        await loadImportPedidoSettings();
        return;
    }
    if (panelKey === 'addr-label' && typeof loadAddrLabelSettings === 'function') {
        await loadAddrLabelSettings();
        return;
    }
    if (SETTINGS_CADASTRO_PANELS[panelKey]) {
        await loadSettingsCadastroPanel(panelKey);
    }
}

const SETTINGS_EXPEDITION_FACTORY_ADDR_PREFIX = 'settings-expedition-factory';

function bindExpeditionFactoryAddressFields() {
    if (typeof bindAddrPostalCodeFields === 'function') {
        bindAddrPostalCodeFields(SETTINGS_EXPEDITION_FACTORY_ADDR_PREFIX);
    }
}

function validateExpeditionFactoryAddress(payload) {
    const cep = String(payload.expeditionFactoryPostalCode || '').replace(/\D/g, '');
    const hasAnyFactoryField = Boolean(
        cep
            || payload.expeditionFactoryStreet
            || payload.expeditionFactoryNumber
            || payload.expeditionFactoryCity
    );
    if (!hasAnyFactoryField) return true;

    if (cep && cep.length !== 8) {
        alertAppDialog('CEP da fábrica inválido. Informe 8 dígitos.');
        return false;
    }
    if (cep && (!payload.expeditionFactoryStreet || !payload.expeditionFactoryCity || !payload.expeditionFactoryState)) {
        alertAppDialog('Consulte o CEP para preencher o endereço da fábrica antes de salvar.');
        return false;
    }
    if (cep && !payload.expeditionFactoryNumber) {
        alertAppDialog('Informe o número do endereço da fábrica.');
        return false;
    }
    return true;
}

function validateSystemSettingsInput(payload) {
    if (!validateExpeditionFactoryAddress(payload)) return false;
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
        expeditionFactoryStreet: document.getElementById('settings-expedition-factory-street')?.value?.trim() || '',
        expeditionFactoryNumber: document.getElementById('settings-expedition-factory-number')?.value?.trim() || '',
        expeditionFactoryComplement: document.getElementById('settings-expedition-factory-complement')?.value?.trim() || '',
        expeditionFactoryNeighborhood: document.getElementById('settings-expedition-factory-neighborhood')?.value?.trim() || '',
        expeditionFactoryCity: document.getElementById('settings-expedition-factory-city')?.value?.trim() || '',
        expeditionFactoryState: document.getElementById('settings-expedition-factory-state')?.value?.trim() || '',
        expeditionFactoryPostalCode: typeof digitsOnlyPostalCode === 'function'
            ? digitsOnlyPostalCode(document.getElementById('settings-expedition-factory-postal-code')?.value)
            : (document.getElementById('settings-expedition-factory-postal-code')?.value?.trim() || ''),
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

        if (error && /expeditionFactory|schema cache|does not exist/i.test(error.message || '')) {
            const legacyPayload = { ...payload };
            delete legacyPayload.expeditionFactoryStreet;
            delete legacyPayload.expeditionFactoryNumber;
            delete legacyPayload.expeditionFactoryComplement;
            delete legacyPayload.expeditionFactoryNeighborhood;
            delete legacyPayload.expeditionFactoryCity;
            delete legacyPayload.expeditionFactoryState;
            delete legacyPayload.expeditionFactoryPostalCode;
            if (existing) {
                ({ error } = await supabaseClient
                    .from('SystemSettings')
                    .update(legacyPayload)
                    .eq('settingsKey', 'default'));
            } else {
                ({ error } = await supabaseClient
                    .from('SystemSettings')
                    .insert([legacyPayload]));
            }
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

function bindSettingsCadastroNavEvents() {
    const navLoaders = {
        'calendar-event-types': () => showSystemSettings('calendar-event-types'),
        'deal-stages': () => showSystemSettings('deal-stages'),
        'lost-reasons': () => showSystemSettings('lost-reasons'),
        'project-status': () => showSystemSettings('project-status'),
        'compra-status': () => showSystemSettings('compra-status'),
        usuarios: () => showSystemSettings('usuarios')
    };

    Object.entries(navLoaders).forEach(([key, handler]) => {
        document.getElementById(`settings-nav-${key}`)?.addEventListener('click', () => {
            if (typeof editingGestaoOrderId !== 'undefined') editingGestaoOrderId = null;
            handler();
        });
    });
}

function bindSystemSettingsEvents() {
    document.getElementById('btn-system-settings')?.addEventListener('click', event => {
        const details = event.currentTarget;
        if (event.target.closest('#settings-sidebar-nav')) return;
        if (details?.tagName === 'DETAILS' && details.open && event.target.closest('summary')) return;
        if (event.target.closest('summary')) event.preventDefault();
        showSystemSettings();
    });
    document.getElementById('settings-nav-cadastros-toggle')?.addEventListener('click', () => {
        document.getElementById('settings-nav-cadastros-items')?.classList.toggle('hidden');
    });
    document.getElementById('system-settings-form')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        saveSystemSettings();
    });
    bindSettingsCadastroNavEvents();
    if (typeof bindImportPedidoSettingsEvents === 'function') {
        bindImportPedidoSettingsEvents();
    }
    if (typeof bindAddrLabelSettingsEvents === 'function') {
        bindAddrLabelSettingsEvents();
    }
    bindExpeditionFactoryAddressFields();
}
