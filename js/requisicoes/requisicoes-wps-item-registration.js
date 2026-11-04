const WPS_ITEM_REGISTRATION_STATUS_OPEN = 'Open';
const WPS_ITEM_REGISTRATION_STATUS_SENT = 'Sent';
const WPS_ITEM_REGISTRATION_STATUS_IN_BUDGET = 'InBudget';
const WPS_ITEM_REGISTRATION_STATUS_REGISTERED = 'Registered';

const WPS_ITEM_REGISTRATION_STATUSES = [
    { value: WPS_ITEM_REGISTRATION_STATUS_OPEN, label: 'Aberto' },
    { value: WPS_ITEM_REGISTRATION_STATUS_SENT, label: 'Enviado' },
    { value: WPS_ITEM_REGISTRATION_STATUS_IN_BUDGET, label: 'Em processo de orçamento' },
    { value: WPS_ITEM_REGISTRATION_STATUS_REGISTERED, label: 'Cadastrado' }
];

const WPS_ITEM_REGISTRATION_STATUS_BADGE = {
    Open: 'bg-slate-100 text-slate-700',
    Sent: 'bg-amber-100 text-amber-800',
    InBudget: 'bg-sky-100 text-sky-800',
    Registered: 'bg-emerald-100 text-emerald-800'
};

const WPS_ITEM_REGISTRATION_BUYER_WORK_STATUSES = new Set([
    WPS_ITEM_REGISTRATION_STATUS_SENT,
    WPS_ITEM_REGISTRATION_STATUS_IN_BUDGET
]);

const WPS_ITEM_REGISTRATION_REQUEST_SELECT = `
    id, wpsItemTypeId, description, status, wpsCode,
    createdAt, updatedAt, sentAt, registeredAt, budgetInProgressAt,
    createdById, updatedById, sentById, registeredById, budgetInProgressById,
    wpsItemType:WpsItemType(id, name),
    createdBy:appUsers!WpsItemRegistrationRequest_createdById_fkey(id, name),
    updatedBy:appUsers!WpsItemRegistrationRequest_updatedById_fkey(id, name),
    sentBy:appUsers!WpsItemRegistrationRequest_sentById_fkey(id, name),
    registeredBy:appUsers!WpsItemRegistrationRequest_registeredById_fkey(id, name),
    budgetInProgressBy:appUsers!WpsItemRegistrationRequest_budgetInProgressById_fkey(id, name)
`;

const WPS_ITEM_REGISTRATION_REQUEST_SELECT_FALLBACK = `
    id, wpsItemTypeId, description, status, wpsCode,
    createdAt, updatedAt, sentAt, registeredAt, budgetInProgressAt,
    createdById, updatedById, sentById, registeredById, budgetInProgressById,
    wpsItemType:WpsItemType(id, name)
`;

const REQUISICOES_WPS_ITEM_TABLE_ID = 'requisicoes-wps-item-registration';

const WPS_ITEM_REGISTRATION_NOTIFY_LOADING_MSG = 'Enviando notificação...';

let wpsItemRegistrationRequestsCache = [];
let wpsItemTypesCache = [];
let wpsItemRegistrationEditingId = null;
let wpsItemRegistrationEditingRecord = null;
let wpsItemRegistrationFormMode = 'requisicoes';
let wpsItemRegistrationEventsBound = false;

const wpsItemRegistrationModalOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('wps-item-registration-modal', {
        closeButtonSelector: '#btn-wps-item-registration-close'
    })
    : null;

function setWpsItemRegistrationModalLoading(active, message = 'Processando...', status = 'loading') {
    wpsItemRegistrationModalOverlay?.setLoading(active, message, status);
}

function isWpsItemRegistrationModalVisible() {
    const modal = document.getElementById('wps-item-registration-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

function setWpsItemRegistrationActionContext({ mode, record } = {}) {
    if (mode) wpsItemRegistrationFormMode = mode;
    if (record) {
        wpsItemRegistrationEditingId = Number(record.id);
        wpsItemRegistrationEditingRecord = record;
    }
}

function isPendenciasScreenVisible() {
    const view = document.getElementById('pendencias-view');
    return Boolean(view && !view.classList.contains('hidden'));
}

/** Modal aberta → overlay da modal; pendências → overlay do painel; senão overlay global. */
function setWpsItemRegistrationActionLoading(active, message = 'Processando...', status = 'loading') {
    if (isWpsItemRegistrationModalVisible()) {
        setWpsItemRegistrationModalLoading(active, message, status);
        return;
    }
    if (
        (wpsItemRegistrationFormMode === 'pendencias' || isPendenciasScreenVisible())
        && typeof setPendenciasActionLoading === 'function'
    ) {
        setPendenciasActionLoading(active, message, status);
        return;
    }
    if (typeof getAppGlobalOverlayConfig === 'function') {
        setModalOverlayLoading(getAppGlobalOverlayConfig(), active, message, status);
        return;
    }
    setWpsItemRegistrationModalLoading(active, message, status);
}

async function runWpsItemRegistrationNotificationPhase(refreshed, notifyFn) {
    if (!NOTIFICATIONS_ENABLED || typeof notifyFn !== 'function' || !refreshed?.id) {
        return;
    }
    setWpsItemRegistrationActionLoading(true, WPS_ITEM_REGISTRATION_NOTIFY_LOADING_MSG);
    await notifyFn(refreshed);
}

function getWpsItemRegistrationStatusLabel(status) {
    return WPS_ITEM_REGISTRATION_STATUSES.find(row => row.value === status)?.label || status || '—';
}

function renderWpsItemRegistrationStatusBadge(status) {
    const label = getWpsItemRegistrationStatusLabel(status);
    const badgeClass = WPS_ITEM_REGISTRATION_STATUS_BADGE[status] || 'bg-slate-100 text-slate-700';
    return `<span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${badgeClass}">${escapeHtml(label)}</span>`;
}

function canActWpsItemRegistrationBuyer(user = currentUser) {
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    return typeof isCompras === 'function' && isCompras(user);
}

function isWpsItemRegistrationBuyerFormMode(record = wpsItemRegistrationEditingRecord) {
    if (!canActWpsItemRegistrationBuyer()) return false;
    const status = record?.status || '';
    if (!WPS_ITEM_REGISTRATION_BUYER_WORK_STATUSES.has(status)) return false;
    return wpsItemRegistrationFormMode === 'pendencias' || wpsItemRegistrationFormMode === 'requisicoes';
}

function isWpsItemRegistrationRequestOwner(record = wpsItemRegistrationEditingRecord) {
    if (!record?.id) return true;
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    const ownerId = Number(record.createdById ?? record.createdBy?.id);
    const userId = Number(currentUser?.id);
    if (!ownerId || !userId) return false;
    return ownerId === userId;
}

function canEditWpsItemRegistrationCoreFields(record = wpsItemRegistrationEditingRecord) {
    const status = record?.status || WPS_ITEM_REGISTRATION_STATUS_OPEN;
    if (status === WPS_ITEM_REGISTRATION_STATUS_REGISTERED) return false;
    if (WPS_ITEM_REGISTRATION_BUYER_WORK_STATUSES.has(status)) return false;
    if (wpsItemRegistrationFormMode === 'requisicoes' && !isWpsItemRegistrationRequestOwner(record)) {
        return false;
    }
    return true;
}

function canSaveWpsItemRegistrationRequest(record = wpsItemRegistrationEditingRecord) {
    const status = record?.status || WPS_ITEM_REGISTRATION_STATUS_OPEN;
    if (status === WPS_ITEM_REGISTRATION_STATUS_REGISTERED) return false;
    if (WPS_ITEM_REGISTRATION_BUYER_WORK_STATUSES.has(status)) {
        return isWpsItemRegistrationBuyerFormMode(record);
    }
    if (wpsItemRegistrationFormMode === 'requisicoes' && !isWpsItemRegistrationRequestOwner(record)) {
        return false;
    }
    return true;
}

function canSendWpsItemRegistrationRequest(record = wpsItemRegistrationEditingRecord) {
    return (record?.status || WPS_ITEM_REGISTRATION_STATUS_OPEN) === WPS_ITEM_REGISTRATION_STATUS_OPEN
        && wpsItemRegistrationFormMode === 'requisicoes'
        && isWpsItemRegistrationRequestOwner(record);
}

function canRegisterWpsItemRegistrationRequest(record = wpsItemRegistrationEditingRecord) {
    const status = record?.status || '';
    return WPS_ITEM_REGISTRATION_BUYER_WORK_STATUSES.has(status)
        && isWpsItemRegistrationBuyerFormMode(record);
}

function canMarkWpsItemRegistrationInBudget(record = wpsItemRegistrationEditingRecord) {
    return (record?.status || '') === WPS_ITEM_REGISTRATION_STATUS_SENT
        && isWpsItemRegistrationBuyerFormMode(record);
}

async function loadWpsItemTypes(activeOnly = true) {
    let query = supabaseClient
        .from('WpsItemType')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) query = query.eq('isActive', true);

    const { data, error } = await query;
    if (error) {
        console.warn('loadWpsItemTypes:', error);
        wpsItemTypesCache = [];
        return { data: [], error };
    }

    wpsItemTypesCache = data || [];
    return { data: wpsItemTypesCache, error: null };
}

async function fetchWpsItemRegistrationRequests(filters = {}) {
    function buildQuery(selectColumns) {
        let query = supabaseClient
            .from('WpsItemRegistrationRequest')
            .select(selectColumns)
            .order('createdAt', { ascending: false });
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.statusIn?.length) query = query.in('status', filters.statusIn);
        return query;
    }

    let { data, error } = await buildQuery(WPS_ITEM_REGISTRATION_REQUEST_SELECT);
    if (error && /relationship|embed|schema cache|appUsers/i.test(error.message || '')) {
        ({ data, error } = await buildQuery(WPS_ITEM_REGISTRATION_REQUEST_SELECT_FALLBACK));
    }

    return { data: data || [], error };
}

function formatWpsItemRegistrationDateTime(value) {
    if (!value) return '—';
    if (typeof formatDateTime === 'function') return formatDateTime(value);
    if (typeof formatDate === 'function') return formatDate(value);
    return String(value);
}

function formatWpsItemRegistrationAuditLine(label, at, userName) {
    const when = formatWpsItemRegistrationDateTime(at);
    const who = String(userName || '').trim() || '—';
    return `${label}: ${when} · ${who}`;
}

function mapWpsItemRegistrationInteractiveRow(record) {
    const description = String(record?.description || '').trim();
    return {
        id: record?.id,
        record,
        typeName: record?.wpsItemType?.name || '—',
        description,
        status: record?.status || '',
        statusLabel: getWpsItemRegistrationStatusLabel(record?.status),
        wpsCode: String(record?.wpsCode || '').trim() || '—',
        createdAt: record?.createdAt || null,
        createdLabel: formatWpsItemRegistrationDateTime(record?.createdAt),
        createdByName: record?.createdBy?.name || '—'
    };
}

function getRequisicoesWpsItemRegistrationColumns() {
    const actionColumn = typeof getPendenciasInteractiveActionColumn === 'function'
        ? getPendenciasInteractiveActionColumn
        : (options) => ({
            key: 'action',
            label: options.label || 'Ação',
            type: 'action',
            align: options.align || 'right',
            thClass: options.thClass || '',
            cellClass: options.cellClass || 'p-3 text-right whitespace-nowrap',
            render: options.render
        });

    return [
        {
            key: 'typeName',
            label: 'Tipo',
            cellClass: 'p-3 text-xs text-slate-800'
        },
        {
            key: 'description',
            label: 'Descritivo',
            cellClass: 'p-3 text-xs text-slate-600 max-w-[260px]',
            render: row => {
                const text = row.description || '—';
                return `<span class="block truncate" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
            }
        },
        {
            key: 'statusLabel',
            label: 'Status',
            sortKey: 'status',
            cellClass: 'p-3',
            getFilterValue: row => row.statusLabel,
            render: row => renderWpsItemRegistrationStatusBadge(row.status)
        },
        {
            key: 'wpsCode',
            label: 'Código WPS',
            cellClass: 'p-3 text-xs font-mono text-slate-600'
        },
        {
            key: 'createdLabel',
            label: 'Criado em',
            sortKey: 'createdAt',
            cellClass: 'p-3 text-xs text-slate-600 whitespace-nowrap'
        },
        {
            key: 'createdByName',
            label: 'Criado por',
            cellClass: 'p-3 text-xs text-slate-600'
        },
        actionColumn({
            label: 'Ações',
            align: 'left',
            thClass: 'min-w-[6rem]',
            cellClass: 'p-3 text-left',
            render: row => {
                const canEdit = isWpsItemRegistrationRequestOwner(row.record)
                    && row.status === WPS_ITEM_REGISTRATION_STATUS_OPEN;
                const label = canEdit ? 'Editar' : 'Visualizar';
                const parts = [`<button type="button"
                class="wps-item-registration-edit-btn text-[11px] font-medium text-indigo-700 hover:text-indigo-900"
                data-wps-item-registration-id="${row.id}">${escapeHtml(label)}</button>`];
                if (
                    typeof canActWpsItemRegistrationBuyer === 'function'
                    && canActWpsItemRegistrationBuyer()
                    && row.status === WPS_ITEM_REGISTRATION_STATUS_SENT
                ) {
                    parts.push(`<button type="button"
                        class="wps-item-registration-in-budget-list-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-sky-100 text-sky-800 hover:bg-sky-200 ml-1.5"
                        data-wps-item-registration-id="${row.id}">Em orçamento</button>`);
                }
                return parts.join('');
            }
        })
    ];
}

function bindWpsItemRegistrationTableActions(records, root = document) {
    const byId = Object.fromEntries((records || []).map(record => [Number(record.id), record]));
    root.querySelectorAll('.wps-item-registration-edit-btn').forEach(button => {
        button.addEventListener('click', () => {
            const record = byId[Number(button.dataset.wpsItemRegistrationId)];
            if (record) openWpsItemRegistrationForm(record, { mode: wpsItemRegistrationFormMode });
        });
    });
    root.querySelectorAll('.wps-item-registration-in-budget-list-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const record = byId[Number(button.dataset.wpsItemRegistrationId)];
            if (!record) return;
            setWpsItemRegistrationActionContext({
                mode: wpsItemRegistrationFormMode || 'requisicoes',
                record
            });
            await markWpsItemRegistrationInBudget(record.id, { record });
        });
    });
}

async function populateWpsItemRegistrationTypeSelect(selectedId = null) {
    const select = document.getElementById('wps-item-registration-type');
    if (!select) return;

    await loadWpsItemTypes(true);
    if (!wpsItemTypesCache.length) {
        select.innerHTML = '<option value="">Cadastre tipos em Gestão → Cadastros</option>';
        select.disabled = true;
        return;
    }

    select.disabled = !canEditWpsItemRegistrationCoreFields();
    select.innerHTML = `
        <option value="">Selecione...</option>
        ${wpsItemTypesCache.map(type => `
            <option value="${type.id}" ${Number(selectedId) === Number(type.id) ? 'selected' : ''}>
                ${escapeHtml(type.name)}
            </option>
        `).join('')}
    `;
}

function syncWpsItemRegistrationFormControls(record = wpsItemRegistrationEditingRecord) {
    const status = record?.status || WPS_ITEM_REGISTRATION_STATUS_OPEN;
    const statusEl = document.getElementById('wps-item-registration-status');
    if (statusEl) statusEl.textContent = getWpsItemRegistrationStatusLabel(status);

    const typeSelect = document.getElementById('wps-item-registration-type');
    const description = document.getElementById('wps-item-registration-description');
    const wpsCodeInput = document.getElementById('wps-item-registration-wps-code');
    const coreEditable = canEditWpsItemRegistrationCoreFields(record);
    const buyerMode = isWpsItemRegistrationBuyerFormMode(record);
    const wpsCodeEditable = buyerMode && WPS_ITEM_REGISTRATION_BUYER_WORK_STATUSES.has(status);

    if (typeSelect) typeSelect.disabled = !coreEditable;
    if (description) description.disabled = !coreEditable;
    if (wpsCodeInput) {
        wpsCodeInput.disabled = !wpsCodeEditable;
        wpsCodeInput.value = record?.wpsCode || wpsCodeInput.value || '';
    }

    const saveBtn = document.getElementById('btn-wps-item-registration-save');
    const sendBtn = document.getElementById('btn-wps-item-registration-send');
    const inBudgetBtn = document.getElementById('btn-wps-item-registration-in-budget');
    const registerBtn = document.getElementById('btn-wps-item-registration-register');

    if (saveBtn) {
        saveBtn.classList.toggle('hidden', !canSaveWpsItemRegistrationRequest(record));
        saveBtn.disabled = !canSaveWpsItemRegistrationRequest(record);
    }
    if (sendBtn) {
        const showSend = canSendWpsItemRegistrationRequest(record);
        sendBtn.classList.toggle('hidden', !showSend);
        sendBtn.disabled = !showSend;
    }
    if (inBudgetBtn) {
        const showInBudget = canMarkWpsItemRegistrationInBudget(record);
        inBudgetBtn.classList.toggle('hidden', !showInBudget);
        inBudgetBtn.disabled = !showInBudget;
    }
    if (registerBtn) {
        const showRegister = canRegisterWpsItemRegistrationRequest(record);
        registerBtn.classList.toggle('hidden', !showRegister);
        registerBtn.disabled = !showRegister;
    }

    const metaEl = document.getElementById('wps-item-registration-audit-meta');
    if (metaEl) {
        if (!record?.id) {
            metaEl.textContent = '—';
        } else {
            const lines = [
                formatWpsItemRegistrationAuditLine('Criado', record.createdAt, record.createdBy?.name),
                formatWpsItemRegistrationAuditLine('Atualizado', record.updatedAt, record.updatedBy?.name)
            ];
            if (record.sentAt) {
                lines.push(formatWpsItemRegistrationAuditLine('Enviado', record.sentAt, record.sentBy?.name));
            }
            if (record.budgetInProgressAt) {
                lines.push(formatWpsItemRegistrationAuditLine(
                    'Em processo de orçamento',
                    record.budgetInProgressAt,
                    record.budgetInProgressBy?.name
                ));
            }
            if (record.registeredAt) {
                lines.push(formatWpsItemRegistrationAuditLine('Cadastrado', record.registeredAt, record.registeredBy?.name));
            }
            metaEl.textContent = lines.join('\n');
        }
    }

    const wpsCodeWrap = document.getElementById('wps-item-registration-wps-code-wrap');
    if (wpsCodeWrap) {
        const showCode = status !== WPS_ITEM_REGISTRATION_STATUS_OPEN
            || buyerMode
            || Boolean(String(record?.wpsCode || '').trim());
        wpsCodeWrap.classList.toggle('hidden', !showCode);
    }
}

function resetWpsItemRegistrationForm() {
    wpsItemRegistrationEditingId = null;
    wpsItemRegistrationEditingRecord = null;
    const description = document.getElementById('wps-item-registration-description');
    const wpsCodeInput = document.getElementById('wps-item-registration-wps-code');
    if (description) description.value = '';
    if (wpsCodeInput) wpsCodeInput.value = '';
}

async function openWpsItemRegistrationForm(record = null, options = {}) {
    wpsItemRegistrationFormMode = options.mode || 'requisicoes';
    resetWpsItemRegistrationForm();

    const title = document.getElementById('wps-item-registration-modal-title');
    if (title) {
        title.textContent = record
            ? (isWpsItemRegistrationBuyerFormMode(record) ? 'Tratar solicitação — Cadastro Item WPS' : 'Editar solicitação')
            : 'Nova solicitação — Cadastro Item WPS';
    }

    if (record) {
        wpsItemRegistrationEditingId = Number(record.id);
        wpsItemRegistrationEditingRecord = record;
        await populateWpsItemRegistrationTypeSelect(record.wpsItemTypeId);
        const description = document.getElementById('wps-item-registration-description');
        if (description) description.value = record.description || '';
        const wpsCodeInput = document.getElementById('wps-item-registration-wps-code');
        if (wpsCodeInput) wpsCodeInput.value = record.wpsCode || '';
    } else {
        await populateWpsItemRegistrationTypeSelect();
    }

    syncWpsItemRegistrationFormControls(record || { status: WPS_ITEM_REGISTRATION_STATUS_OPEN });
    toggleModal('wps-item-registration-modal', true);
}

function readWpsItemRegistrationFormValues() {
    return {
        wpsItemTypeId: Number(document.getElementById('wps-item-registration-type')?.value) || null,
        description: document.getElementById('wps-item-registration-description')?.value?.trim() || '',
        wpsCode: document.getElementById('wps-item-registration-wps-code')?.value?.trim() || ''
    };
}

function validateWpsItemRegistrationCorePayload(payload) {
    if (!payload.wpsItemTypeId) {
        alertAppDialog('Selecione o tipo do item.', { variant: 'warning', title: 'Aviso' });
        return false;
    }
    if (!payload.description) {
        alertAppDialog('Informe o descritivo do item.', { variant: 'warning', title: 'Aviso' });
        return false;
    }
    return true;
}

async function reloadWpsItemRegistrationEditingRecord(id) {
    const normalizedId = Number(id);
    if (!normalizedId) return null;

    const { data, error } = await supabaseClient
        .from('WpsItemRegistrationRequest')
        .select(WPS_ITEM_REGISTRATION_REQUEST_SELECT)
        .eq('id', normalizedId)
        .maybeSingle();

    if (error || !data) {
        const fallback = await supabaseClient
            .from('WpsItemRegistrationRequest')
            .select(WPS_ITEM_REGISTRATION_REQUEST_SELECT_FALLBACK)
            .eq('id', normalizedId)
            .maybeSingle();
        if (fallback.error || !fallback.data) return null;
        wpsItemRegistrationEditingRecord = fallback.data;
        wpsItemRegistrationEditingId = normalizedId;
        return fallback.data;
    }

    wpsItemRegistrationEditingRecord = data;
    wpsItemRegistrationEditingId = normalizedId;
    return data;
}

async function persistWpsItemRegistrationRequest(extraPatch = {}) {
    const values = readWpsItemRegistrationFormValues();
    const status = wpsItemRegistrationEditingRecord?.status || WPS_ITEM_REGISTRATION_STATUS_OPEN;
    const buyerMode = isWpsItemRegistrationBuyerFormMode(wpsItemRegistrationEditingRecord);

    if (
        wpsItemRegistrationEditingId
        && status === WPS_ITEM_REGISTRATION_STATUS_OPEN
        && wpsItemRegistrationFormMode === 'requisicoes'
        && !isWpsItemRegistrationRequestOwner(wpsItemRegistrationEditingRecord)
    ) {
        alertAppDialog('Somente quem cadastrou pode editar esta requisição.', { variant: 'warning', title: 'Aviso' });
        return null;
    }

    if (status === WPS_ITEM_REGISTRATION_STATUS_OPEN) {
        if (!validateWpsItemRegistrationCorePayload(values)) return null;
    } else if (WPS_ITEM_REGISTRATION_BUYER_WORK_STATUSES.has(status) && buyerMode) {
        // Compras pode salvar código WPS parcial antes de cadastrar.
    } else if (status !== WPS_ITEM_REGISTRATION_STATUS_OPEN) {
        return wpsItemRegistrationEditingRecord;
    }

    const now = new Date().toISOString();
    const userId = currentUser?.id || null;
    const payload = {
        updatedAt: now,
        updatedById: userId,
        ...extraPatch
    };

    if (status === WPS_ITEM_REGISTRATION_STATUS_OPEN) {
        payload.wpsItemTypeId = values.wpsItemTypeId;
        payload.description = values.description;
    }
    if (buyerMode && WPS_ITEM_REGISTRATION_BUYER_WORK_STATUSES.has(status)) {
        payload.wpsCode = values.wpsCode || null;
    }

    try {
        setWpsItemRegistrationModalLoading(true, 'Salvando...');

        if (wpsItemRegistrationEditingId) {
            const { error } = await supabaseClient
                .from('WpsItemRegistrationRequest')
                .update(payload)
                .eq('id', wpsItemRegistrationEditingId);
            if (error) throw error;
        } else {
            const insertPayload = {
                wpsItemTypeId: values.wpsItemTypeId,
                description: values.description,
                status: WPS_ITEM_REGISTRATION_STATUS_OPEN,
                createdById: userId,
                updatedById: userId,
                createdAt: now,
                updatedAt: now
            };
            const { data, error } = await supabaseClient
                .from('WpsItemRegistrationRequest')
                .insert([insertPayload])
                .select('id')
                .single();
            if (error) throw error;
            wpsItemRegistrationEditingId = Number(data.id);
        }

        const refreshed = await reloadWpsItemRegistrationEditingRecord(wpsItemRegistrationEditingId);
        syncWpsItemRegistrationFormControls(refreshed);
        setWpsItemRegistrationModalLoading(true, 'Salvo com sucesso!', 'success');
        await waitAppOverlay(APP_OVERLAY_SUCCESS_MS);
        return refreshed;
    } catch (error) {
        console.error('persistWpsItemRegistrationRequest:', error);
        const message = /WpsItemRegistrationRequest|WpsItemType|schema cache/i.test(error.message || '')
            ? `${error.message} Execute supabase/feats/create-wps-item-registration.sql no Supabase SQL Editor.`
            : (error.message || 'Não foi possível salvar.');
        setWpsItemRegistrationModalLoading(true, message, 'error');
        await waitAppOverlay(APP_OVERLAY_ERROR_MS);
        return null;
    } finally {
        setWpsItemRegistrationModalLoading(false);
    }
}

async function sendWpsItemRegistrationRequest() {
    if (!canSendWpsItemRegistrationRequest()) {
        if (!isWpsItemRegistrationRequestOwner(wpsItemRegistrationEditingRecord)) {
            alertAppDialog('Somente quem cadastrou pode enviar esta requisição.', { variant: 'warning', title: 'Aviso' });
        }
        return;
    }
    const saved = await persistWpsItemRegistrationRequest();
    if (!saved?.id) return;
    if (!isWpsItemRegistrationRequestOwner(saved)) {
        alertAppDialog('Somente quem cadastrou pode enviar esta requisição.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!(await confirmAppDialog('Enviar esta solicitação para o setor de Compras cadastrar no WPS?'))) return;

    const now = new Date().toISOString();
    const userId = currentUser?.id || null;

    try {
        setWpsItemRegistrationModalLoading(true, 'Enviando...');
        const { error } = await supabaseClient
            .from('WpsItemRegistrationRequest')
            .update({
                status: WPS_ITEM_REGISTRATION_STATUS_SENT,
                sentAt: now,
                sentById: userId,
                updatedAt: now,
                updatedById: userId
            })
            .eq('id', saved.id);
        if (error) throw error;

        const refreshed = await reloadWpsItemRegistrationEditingRecord(saved.id);
        syncWpsItemRegistrationFormControls(refreshed);
        await runWpsItemRegistrationNotificationPhase(
            refreshed,
            typeof notifyWpsItemRegistrationSentToCompras === 'function'
                ? notifyWpsItemRegistrationSentToCompras
                : null
        );
        setWpsItemRegistrationModalLoading(true, 'Enviado para Compras!', 'success');
        await waitAppOverlay(APP_OVERLAY_SUCCESS_MS);
        await refreshWpsItemRegistrationLists();
    } catch (error) {
        console.error('sendWpsItemRegistrationRequest:', error);
        setWpsItemRegistrationModalLoading(true, error.message || 'Não foi possível enviar.', 'error');
        await waitAppOverlay(APP_OVERLAY_ERROR_MS);
    } finally {
        setWpsItemRegistrationModalLoading(false);
    }
}

async function markWpsItemRegistrationInBudget(requestId = wpsItemRegistrationEditingId, options = {}) {
    const normalizedId = Number(requestId || wpsItemRegistrationEditingId);
    if (!normalizedId) return;

    const record = options.record || wpsItemRegistrationEditingRecord;

    if (!canMarkWpsItemRegistrationInBudget(record)) {
        alertAppDialog('Sem permissão para alterar este status.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!(await confirmAppDialog('Marcar esta solicitação como Em processo de orçamento?'))) return;

    const now = new Date().toISOString();
    const userId = currentUser?.id || null;

    try {
        setWpsItemRegistrationActionLoading(true, 'Atualizando status...');
        const { error } = await supabaseClient
            .from('WpsItemRegistrationRequest')
            .update({
                status: WPS_ITEM_REGISTRATION_STATUS_IN_BUDGET,
                budgetInProgressAt: now,
                budgetInProgressById: userId,
                updatedAt: now,
                updatedById: userId
            })
            .eq('id', normalizedId);
        if (error) throw error;

        const refreshed = await reloadWpsItemRegistrationEditingRecord(normalizedId);
        syncWpsItemRegistrationFormControls(refreshed);
        await runWpsItemRegistrationNotificationPhase(
            refreshed,
            typeof notifyWpsItemRegistrationInBudget === 'function'
                ? notifyWpsItemRegistrationInBudget
                : null
        );
        setWpsItemRegistrationActionLoading(true, 'Status atualizado!', 'success');
        await waitAppOverlay(APP_OVERLAY_SUCCESS_MS);
        await refreshWpsItemRegistrationLists();
    } catch (error) {
        console.error('markWpsItemRegistrationInBudget:', error);
        setWpsItemRegistrationActionLoading(true, error.message || 'Não foi possível atualizar.', 'error');
        await waitAppOverlay(APP_OVERLAY_ERROR_MS);
    } finally {
        setWpsItemRegistrationActionLoading(false);
    }
}

async function registerWpsItemRegistrationRequest() {
    if (!canRegisterWpsItemRegistrationRequest()) return;
    const values = readWpsItemRegistrationFormValues();
    if (!values.wpsCode) {
        alertAppDialog('Informe o código no WPS para marcar como Cadastrado.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!(await confirmAppDialog('Confirmar que o item foi cadastrado no WPS?'))) return;

    const now = new Date().toISOString();
    const userId = currentUser?.id || null;

    try {
        setWpsItemRegistrationModalLoading(true, 'Registrando...');
        const { error } = await supabaseClient
            .from('WpsItemRegistrationRequest')
            .update({
                wpsCode: values.wpsCode,
                status: WPS_ITEM_REGISTRATION_STATUS_REGISTERED,
                registeredAt: now,
                registeredById: userId,
                updatedAt: now,
                updatedById: userId
            })
            .eq('id', wpsItemRegistrationEditingId);
        if (error) throw error;

        const refreshed = await reloadWpsItemRegistrationEditingRecord(wpsItemRegistrationEditingId);
        syncWpsItemRegistrationFormControls(refreshed);
        await runWpsItemRegistrationNotificationPhase(
            refreshed,
            typeof notifyWpsItemRegistrationRegistered === 'function'
                ? notifyWpsItemRegistrationRegistered
                : null
        );
        setWpsItemRegistrationModalLoading(true, 'Item cadastrado no WPS!', 'success');
        await waitAppOverlay(APP_OVERLAY_SUCCESS_MS);
        await refreshWpsItemRegistrationLists();
        toggleModal('wps-item-registration-modal', false);
    } catch (error) {
        console.error('registerWpsItemRegistrationRequest:', error);
        setWpsItemRegistrationModalLoading(true, error.message || 'Não foi possível concluir.', 'error');
        await waitAppOverlay(APP_OVERLAY_ERROR_MS);
    } finally {
        setWpsItemRegistrationModalLoading(false);
    }
}

async function refreshWpsItemRegistrationLists() {
    if (wpsItemRegistrationFormMode === 'pendencias') {
        if (typeof loadPendenciasWpsItemRegistration === 'function') {
            await loadPendenciasWpsItemRegistration();
        }
        return;
    }
    if (typeof loadWpsItemRegistrationRequests === 'function') {
        await loadWpsItemRegistrationRequests();
    }
}

function mountRequisicoesWpsItemRegistrationTable(records) {
    const mount = document.getElementById('wps-item-registration-table-mount');
    if (!mount || typeof mountInteractiveTable !== 'function') return;

    mountInteractiveTable(mount, {
        tableId: REQUISICOES_WPS_ITEM_TABLE_ID,
        columns: getRequisicoesWpsItemRegistrationColumns(),
        rows: (records || []).map(mapWpsItemRegistrationInteractiveRow),
        emptyMessage: 'Nenhuma solicitação cadastrada.',
        defaultSort: [{ key: 'createdAt', direction: 'desc' }]
    });

    bindWpsItemRegistrationTableActions(records, mount);
}

async function loadWpsItemRegistrationRequests() {
    wpsItemRegistrationFormMode = 'requisicoes';
    const mount = document.getElementById('wps-item-registration-table-mount');
    if (mount) {
        mount.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando...</p>';
    }

    const { data, error } = await fetchWpsItemRegistrationRequests();
    wpsItemRegistrationRequestsCache = data;

    const hint = document.getElementById('wps-item-registration-sql-hint');
    if (error) {
        if (hint) {
            hint.textContent = `${error.message} Execute supabase/feats/create-wps-item-registration.sql no Supabase SQL Editor.`;
            hint.classList.remove('hidden');
        }
        if (mount) mount.innerHTML = '';
        return;
    }
    hint?.classList.add('hidden');
    mountRequisicoesWpsItemRegistrationTable(wpsItemRegistrationRequestsCache);
}

function renderWpsItemRegistrationScreen() {
    const content = document.getElementById('requisicoes-content');
    if (!content) return;

    content.innerHTML = `
        <section class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 class="font-bold text-sm text-slate-900">Cadastro Item WPS</h2>
                    <p class="text-xs text-slate-400 mt-0.5">Solicite o cadastro de itens novos (MDF, ferragens, etc.) para o setor de Compras registrar no WPS.</p>
                </div>
                <button type="button" id="btn-wps-item-registration-new"
                    class="text-xs bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800">
                    Nova solicitação
                </button>
            </div>
            <div id="wps-item-registration-sql-hint" class="hidden text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"></div>
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div id="wps-item-registration-table-mount" class="p-0"></div>
            </div>
        </section>
    `;

    document.getElementById('btn-wps-item-registration-new')?.addEventListener('click', () => {
        openWpsItemRegistrationForm(null, { mode: 'requisicoes' });
    });

    void loadWpsItemRegistrationRequests();
}

async function loadWpsItemRegistrationRequisicoes() {
    renderWpsItemRegistrationScreen();
}

function bindWpsItemRegistrationEvents() {
    if (wpsItemRegistrationEventsBound) return;
    wpsItemRegistrationEventsBound = true;

    document.getElementById('btn-wps-item-registration-close')?.addEventListener('click', () => {
        toggleModal('wps-item-registration-modal', false);
    });
    document.getElementById('btn-wps-item-registration-save')?.addEventListener('click', async () => {
        const saved = await persistWpsItemRegistrationRequest();
        if (saved) await refreshWpsItemRegistrationLists();
    });
    document.getElementById('btn-wps-item-registration-send')?.addEventListener('click', () => {
        void sendWpsItemRegistrationRequest();
    });
    document.getElementById('btn-wps-item-registration-in-budget')?.addEventListener('click', () => {
        void markWpsItemRegistrationInBudget();
    });
    document.getElementById('btn-wps-item-registration-register')?.addEventListener('click', () => {
        void registerWpsItemRegistrationRequest();
    });
    document.getElementById('wps-item-registration-form')?.addEventListener('submit', event => {
        event.preventDefault();
        void (async () => {
            const saved = await persistWpsItemRegistrationRequest();
            if (saved) await refreshWpsItemRegistrationLists();
        })();
    });
}

window.loadWpsItemRegistrationRequisicoes = loadWpsItemRegistrationRequisicoes;
window.openWpsItemRegistrationForm = openWpsItemRegistrationForm;
window.fetchWpsItemRegistrationRequests = fetchWpsItemRegistrationRequests;
window.getRequisicoesWpsItemRegistrationColumns = getRequisicoesWpsItemRegistrationColumns;
window.mapWpsItemRegistrationInteractiveRow = mapWpsItemRegistrationInteractiveRow;
window.bindWpsItemRegistrationTableActions = bindWpsItemRegistrationTableActions;
window.bindWpsItemRegistrationEvents = bindWpsItemRegistrationEvents;
window.canActWpsItemRegistrationBuyer = canActWpsItemRegistrationBuyer;
window.isWpsItemRegistrationRequestOwner = isWpsItemRegistrationRequestOwner;
window.renderWpsItemRegistrationStatusBadge = renderWpsItemRegistrationStatusBadge;
window.getWpsItemRegistrationStatusLabel = getWpsItemRegistrationStatusLabel;
window.WPS_ITEM_REGISTRATION_STATUS_SENT = WPS_ITEM_REGISTRATION_STATUS_SENT;
window.WPS_ITEM_REGISTRATION_STATUS_IN_BUDGET = WPS_ITEM_REGISTRATION_STATUS_IN_BUDGET;
window.setWpsItemRegistrationActionContext = setWpsItemRegistrationActionContext;
window.markWpsItemRegistrationInBudget = markWpsItemRegistrationInBudget;
