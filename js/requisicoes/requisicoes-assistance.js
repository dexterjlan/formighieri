const ASSISTANCE_STATUS_OPEN = 'Open';
const ASSISTANCE_STATUS_QUOTE = 'Quote';
const ASSISTANCE_STATUS_APPROVAL = 'Approval';
const ASSISTANCE_STATUS_SEPARATION = 'Separation';
const ASSISTANCE_STATUS_AWAITING_SCHEDULING = 'AwaitingScheduling';
const ASSISTANCE_STATUS_SCHEDULED = 'Scheduled';
const ASSISTANCE_STATUS_EXECUTION = 'Execution';
const ASSISTANCE_STATUS_FINISHED = 'Finished';
const ASSISTANCE_STATUS_CANCELLED = 'Cancelled';

const ASSISTANCE_STATUSES = [
    { value: 'Open', label: 'Aberto' },
    { value: 'Quote', label: 'Orçamento' },
    { value: 'Approval', label: 'Aprovação' },
    { value: 'Separation', label: 'Separação' },
    { value: 'AwaitingScheduling', label: 'Aguardando agendamento' },
    { value: 'Scheduled', label: 'Agendado' },
    { value: 'Execution', label: 'Execução' },
    { value: 'Finished', label: 'Finalizado' },
    { value: 'Cancelled', label: 'Cancelado' }
];

const ASSISTANCE_STATUS_BADGE = {
    Open: 'bg-slate-100 text-slate-700',
    Quote: 'bg-amber-100 text-amber-800',
    Approval: 'bg-orange-100 text-orange-800',
    Separation: 'bg-sky-100 text-sky-800',
    AwaitingScheduling: 'bg-indigo-50 text-indigo-800',
    Scheduled: 'bg-indigo-100 text-indigo-800',
    Execution: 'bg-violet-100 text-violet-800',
    Finished: 'bg-emerald-100 text-emerald-800',
    Cancelled: 'bg-rose-100 text-rose-800'
};

const ASSISTANCE_TERMINAL_STATUSES = new Set([
    ASSISTANCE_STATUS_FINISHED,
    ASSISTANCE_STATUS_CANCELLED
]);

/** Temporariamente oculto na UI; reativar quando o fluxo “Enviar para orçamento” voltar. */
const ASSISTANCE_UI_SHOW_SEND_TO_QUOTE_ACTION = false;

const ASSISTANCE_POST_QUOTE_STATUSES = new Set([
    ASSISTANCE_STATUS_QUOTE,
    ASSISTANCE_STATUS_APPROVAL,
    ASSISTANCE_STATUS_SEPARATION,
    ASSISTANCE_STATUS_AWAITING_SCHEDULING,
    'Scheduled',
    'Execution',
    'Finished'
]);

const ASSISTANCE_SCHEDULING_VISIBLE_STATUSES = new Set([
    ASSISTANCE_STATUS_AWAITING_SCHEDULING,
    'Scheduled',
    'Execution',
    'Finished'
]);

/** Data agendada e montador/marceneiro editáveis no modal (não em Execução/Finalizado). */
const ASSISTANCE_SCHEDULING_FIELDS_EDITABLE_STATUSES = new Set([
    ASSISTANCE_STATUS_AWAITING_SCHEDULING,
    ASSISTANCE_STATUS_SCHEDULED
]);

function assistanceHasQuoteData(record) {
    if (!record) return false;
    return record.totalValue != null
        || Boolean(String(record.quoteFileName || '').trim())
        || Boolean(String(record.quoteFilePath || '').trim());
}

function assistanceShouldShowQuoteSection(record, status = record?.status || assistanceEditingStatus) {
    if (status === ASSISTANCE_STATUS_OPEN) return false;
    if (status === ASSISTANCE_STATUS_QUOTE) {
        return canEditAssistanceQuote() || assistanceHasQuoteData(record);
    }
    if (!ASSISTANCE_POST_QUOTE_STATUSES.has(status)) return false;
    return assistanceHasQuoteData(record);
}

function formatAssistanceAssigneeLabel(record) {
    if (!record) return '—';
    const montadorName = record.montador?.name || record.installer?.name;
    const marceneiroName = record.cabinetMaker?.name;
    if (montadorName) return `Montador: ${montadorName}`;
    if (marceneiroName) return `Marceneiro: ${marceneiroName}`;
    return '—';
}

function formatAssistanceDateColumnLabel(value) {
    if (!value) return '—';
    if (typeof formatDate === 'function') return formatDate(value);
    return toAssistanceDateInputValue(value) || '—';
}

function formatAssistanceScheduledDateLabel(scheduledAt) {
    return formatAssistanceDateColumnLabel(scheduledAt);
}

function formatAssistanceFinishedDateLabel(finishedAt) {
    return formatAssistanceDateColumnLabel(finishedAt);
}

let assistanceRequestsCache = [];
let assistanceEditingId = null;
let assistanceEditingRecord = null;
let assistanceEditingStatus = ASSISTANCE_STATUS_OPEN;
let assistanceFormReturnTo = 'requisicoes';
let assistanceOrderId = null;
let assistanceOrderLocksAddress = false;
let assistanceEventsBound = false;
let assistanceQuoteDriveFile = null;

const REQUISICOES_ASSISTANCE_TABLE_ID = 'requisicoes-assistencia';

function mapAssistanceInteractiveRow(record) {
    const description = String(record?.description || '').trim();
    const status = record?.status || '';
    return {
        id: record?.id,
        record,
        clientName: record?.client?.name || '—',
        orderCode: record?.order?.orderCode || '—',
        isWarrantyLabel: record?.isWarranty ? 'Sim' : 'Não',
        scheduledAt: record?.scheduledAt || null,
        scheduledLabel: formatAssistanceScheduledDateLabel(record?.scheduledAt),
        finishedAt: record?.finishedAt || null,
        finishedLabel: formatAssistanceFinishedDateLabel(record?.finishedAt),
        description,
        status,
        statusLabel: getAssistanceStatusLabel(status)
    };
}

function getRequisicoesAssistanceInteractiveColumns() {
    const dateColumn = typeof getPendenciasInteractiveDateColumn === 'function'
        ? getPendenciasInteractiveDateColumn
        : (options) => ({
            key: options.key,
            label: options.label,
            type: 'date',
            sortKey: options.sortKey || options.key,
            cellClass: options.cellClass || 'p-3 text-xs text-slate-600 whitespace-nowrap'
        });
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
            key: 'clientName',
            label: 'Cliente',
            cellClass: 'p-3 text-xs text-slate-800'
        },
        {
            key: 'orderCode',
            label: 'Pedido',
            cellClass: 'p-3 text-xs font-mono text-slate-600'
        },
        {
            key: 'isWarrantyLabel',
            label: 'Garantia',
            cellClass: 'p-3 text-xs text-slate-700'
        },
        dateColumn({
            key: 'scheduledLabel',
            label: 'Data agendamento',
            sortKey: 'scheduledAt'
        }),
        dateColumn({
            key: 'finishedLabel',
            label: 'Data finalização',
            sortKey: 'finishedAt'
        }),
        {
            key: 'description',
            label: 'Descrição',
            cellClass: 'p-3 text-xs text-slate-600 max-w-[220px]',
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
            render: row => renderAssistanceStatusBadge(row.status)
        },
        actionColumn({
            label: 'Abrir',
            align: 'left',
            thClass: 'w-20',
            cellClass: 'p-3 text-left',
            render: row => renderAssistanceListActionButtons(row.record)
        }),
        {
            key: 'history',
            label: 'Histórico',
            type: 'action',
            sortable: false,
            filterable: false,
            align: 'left',
            thClass: 'w-28',
            cellClass: 'p-3 text-left',
            render: row => `<button type="button" class="assistance-history-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50" data-assistance-id="${row.id}">Histórico</button>`
        }
    ];
}

function mountRequisicoesAssistanceInteractiveTable(container) {
    if (!container || typeof mountInteractiveTable !== 'function') return;
    const rows = (assistanceRequestsCache || []).map(mapAssistanceInteractiveRow);
    mountInteractiveTable(container, {
        tableId: REQUISICOES_ASSISTANCE_TABLE_ID,
        rows,
        columns: getRequisicoesAssistanceInteractiveColumns(),
        defaultSort: [],
        emptyMessage: 'Nenhuma assistência cadastrada.',
        filteredEmptyMessage: 'Nenhuma assistência encontrada com os filtros aplicados.',
        minWidth: '1040px'
    });
}

function requisicoesAssistanceRowMatchesMobileSearch(row, queryNorm) {
    if (!queryNorm) return true;
    const haystack = normalizeProgramacoesMobileSearchText([
        row.clientName,
        row.orderCode,
        row.isWarrantyLabel,
        row.scheduledLabel,
        row.finishedLabel,
        row.description,
        row.statusLabel
    ].join(' '));
    return haystack.includes(queryNorm);
}

function renderRequisicoesAssistanceMobileCard(row) {
    const description = row.description || '—';
    const detailFields = [
        renderProgramacoesMobileInlineField('Garantia', row.isWarrantyLabel),
        renderProgramacoesMobileInlineField('Data agendamento', row.scheduledLabel),
        renderProgramacoesMobileInlineField('Data finalização', row.finishedLabel)
    ].join('');

    const actionsHtml = `
        <div class="requisicoes-assistance-mobile__actions flex flex-wrap gap-1.5 items-center">
            ${renderAssistanceListActionButtons(row.record)}
            <button type="button"
                class="assistance-history-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50"
                data-assistance-id="${Number(row.id)}">Histórico</button>
        </div>
    `;

    return `
        <article class="programacoes-projects-mobile__card requisicoes-assistance-mobile__card" data-assistance-id="${Number(row.id)}">
            <div class="programacoes-projects-mobile__headline requisicoes-assistance-mobile__headline">
                <p class="programacoes-projects-mobile__order">
                    <span class="font-mono text-slate-500">${escapeHtml(String(row.orderCode || '—'))}</span>
                    <span class="text-slate-300" aria-hidden="true">·</span>
                    <span class="font-semibold text-slate-900">${escapeHtml(String(row.clientName || '—'))}</span>
                </p>
                <p class="programacoes-projects-mobile__client requisicoes-assistance-mobile__description">${escapeHtml(description)}</p>
            </div>
            <div class="programacoes-projects-mobile__status">${renderAssistanceStatusBadge(row.status)}</div>
            <div class="programacoes-projects-mobile__details">${detailFields}</div>
            ${actionsHtml}
        </article>
    `;
}

function renderRequisicoesAssistanceMobileScreen(content, options = {}) {
    const rows = (assistanceRequestsCache || []).map(mapAssistanceInteractiveRow);
    const headerActionsHtml = `
        <button type="button" id="btn-assistance-new"
            class="text-xs bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 w-full sm:w-auto justify-center">
            Nova assistência
        </button>
    `;

    renderProgramacoesMobileListScreen(content, {
        screenId: 'requisicoes-assistencia',
        title: 'Assistência',
        subtitle: 'Cadastre o cliente, o pedido quando houver, o endereço, se é garantia e a descrição.',
        headerActionsHtml,
        rows,
        emptyMessage: 'Nenhuma assistência cadastrada.',
        searchPlaceholder: 'Buscar cliente, pedido, descrição, status…',
        rowMatchesSearch: requisicoesAssistanceRowMatchesMobileSearch,
        renderCard: renderRequisicoesAssistanceMobileCard,
        onScreenReady(screenContent) {
            if (!options.sqlError) return;
            const shell = screenContent.querySelector('.programacoes-projects-mobile');
            const header = shell?.querySelector('.p-4.border-b');
            if (!header) return;
            const hint = document.createElement('div');
            hint.id = 'assistance-sql-hint';
            hint.className = 'text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2';
            hint.textContent = options.sqlError;
            header.appendChild(hint);
        }
    });
}

function assistanceSqlHint() {
    return 'Execute os scripts de assistência em supabase/feats/ (create, quote, status-history, scheduling) no Supabase SQL Editor.';
}

function canApproveAssistance(user = currentUser) {
    return (typeof isAdmin === 'function' && isAdmin(user))
        || (typeof isGestorComercial === 'function' && isGestorComercial(user))
        || (typeof isGestorProjetos === 'function' && isGestorProjetos(user))
        || (typeof isGestorFabrica === 'function' && isGestorFabrica(user));
}

function canEditAssistanceScheduling(user = currentUser) {
    // Compras orça a assistência; agendamento (data/montador) fica com gestão e Fábrica administrativo.
    return canApproveAssistance(user)
        || (typeof isFactoryAdministrative === 'function' && isFactoryAdministrative(user));
}

function isAssistanceTerminalStatus(status = assistanceEditingStatus) {
    return ASSISTANCE_TERMINAL_STATUSES.has(status);
}

function canCancelAssistance(record = assistanceEditingRecord, user = currentUser) {
    if (!record?.id) return false;
    const status = record.status || assistanceEditingStatus;
    if (isAssistanceTerminalStatus(status)) return false;
    return canApproveAssistance(user) || canEditAssistanceScheduling(user);
}

function syncAssistanceCancelReasonSection(record = assistanceEditingRecord) {
    const section = document.getElementById('assistance-cancel-reason-section');
    const text = document.getElementById('assistance-cancel-reason-text');
    if (!section || !text) return;
    const cancelled = (record?.status || assistanceEditingStatus) === ASSISTANCE_STATUS_CANCELLED;
    section.classList.toggle('hidden', !cancelled);
    text.textContent = String(record?.cancelReason || '').trim() || '—';
}

function syncAssistanceCancelRequestButton(record = assistanceEditingRecord) {
    const button = document.getElementById('btn-assistance-cancel-request');
    if (!button) return;
    const show = canCancelAssistance(record);
    button.classList.toggle('hidden', !show);
}

function syncAssistanceFormReadOnlyState(record = assistanceEditingRecord) {
    const status = record?.status || assistanceEditingStatus;
    const readOnly = status === ASSISTANCE_STATUS_CANCELLED;
    const ids = [
        'assistance-description',
        'assistance-warranty',
        'btn-assistance-client-picker',
        'btn-assistance-order-picker',
        'btn-assistance-order-clear',
        'btn-assistance-addr-picker',
        'btn-assistance-send-awaiting-scheduling'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'BUTTON') {
            el.disabled = readOnly;
        } else {
            el.readOnly = readOnly;
            el.disabled = readOnly;
        }
    });
    const saveButton = document.getElementById('btn-assistance-save');
    if (saveButton) {
        saveButton.classList.toggle('hidden', readOnly);
    }
}

function toAssistanceDateInputValue(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

function fromAssistanceDateInputValue(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    return new Date(`${trimmed}T12:00:00`).toISOString();
}

function buildAssistanceAssigneeSelectValue(record) {
    if (!record) return '';
    if (record.montadorId) return `installer:${Number(record.montadorId)}`;
    if (record.cabinetMakerId) return `cabinetMaker:${Number(record.cabinetMakerId)}`;
    return '';
}

function parseAssistanceAssigneeSelectValue(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return { montadorId: null, cabinetMakerId: null };
    }
    const [kind, idPart] = raw.split(':');
    const id = Number(idPart);
    if (!id) return { montadorId: null, cabinetMakerId: null };
    if (kind === 'installer') return { montadorId: id, cabinetMakerId: null };
    if (kind === 'cabinetMaker') return { montadorId: null, cabinetMakerId: id };
    return { montadorId: null, cabinetMakerId: null };
}

async function ensureAssistanceAssigneeOptions() {
    const select = document.getElementById('assistance-assignee');
    if (!select) return;

    const [montadores, marceneiros] = await Promise.all([
        typeof loadGestaoMontadores === 'function' ? loadGestaoMontadores(true) : [],
        typeof loadMarceneiros === 'function' ? loadMarceneiros(true) : []
    ]);

    const montadorRows = (montadores || []).filter(item => item.isActive !== false);
    const marceneiroRows = marceneiros || [];

    const montadorOptions = montadorRows.map(item => (
        `<option value="installer:${item.id}">${escapeHtml(item.name || '')}</option>`
    )).join('');
    const marceneiroOptions = marceneiroRows.map(item => (
        `<option value="cabinetMaker:${item.id}">${escapeHtml(item.name || '')}</option>`
    )).join('');

    select.innerHTML = `
        <option value="">Selecione...</option>
        ${montadorOptions ? `<optgroup label="Montadores">${montadorOptions}</optgroup>` : ''}
        ${marceneiroOptions ? `<optgroup label="Marceneiros">${marceneiroOptions}</optgroup>` : ''}
    `;
}

function assistanceShouldShowSchedulingSection(record, status = record?.status || assistanceEditingStatus) {
    if (ASSISTANCE_SCHEDULING_VISIBLE_STATUSES.has(status)) return true;
    return Boolean(record?.scheduledAt || record?.montadorId || record?.cabinetMakerId);
}

function syncAssistanceSchedulingSection(record = null) {
    const section = document.getElementById('assistance-scheduling-section');
    const dateInput = document.getElementById('assistance-scheduled-at');
    const dateReadonly = document.getElementById('assistance-scheduled-at-readonly');
    const assigneeSelect = document.getElementById('assistance-assignee');
    const assigneeReadonly = document.getElementById('assistance-assignee-readonly');
    const status = record?.status || assistanceEditingStatus;
    const visible = assistanceShouldShowSchedulingSection(record, status);
    const editable = canEditAssistanceScheduling()
        && ASSISTANCE_SCHEDULING_FIELDS_EDITABLE_STATUSES.has(status);

    section?.classList.toggle('hidden', !visible);
    if (!visible) return;

    if (dateInput) {
        dateInput.value = toAssistanceDateInputValue(record?.scheduledAt);
        dateInput.classList.toggle('hidden', !editable);
        dateInput.disabled = !editable;
    }
    if (dateReadonly) {
        dateReadonly.textContent = formatAssistanceScheduledDateLabel(record?.scheduledAt);
        dateReadonly.classList.toggle('hidden', editable);
    }

    if (assigneeSelect) {
        assigneeSelect.value = buildAssistanceAssigneeSelectValue(record);
        assigneeSelect.classList.toggle('hidden', !editable);
        assigneeSelect.disabled = !editable;
    }
    if (assigneeReadonly) {
        assigneeReadonly.textContent = formatAssistanceAssigneeLabel(record);
        assigneeReadonly.classList.toggle('hidden', editable);
    }
}

function renderAssistanceListActionButtons(record) {
    return `<button type="button" class="assistance-edit-btn text-[11px] font-medium text-indigo-700 hover:text-indigo-900" data-assistance-id="${record.id}">Abrir</button>`;
}

const ASSISTANCE_STATUS_HISTORY_CHANGED_BY_EMBED =
    'changedBy:appUsers!AssistanceRequestStatusHistory_changedById_fkey(id, name)';

const assistanceModalOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('assistance-modal', {
        closeButtonSelector: '#btn-assistance-close'
    })
    : null;

const assistancePurchaseRequestModalOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('assistance-purchase-request', {
        closeButtonSelector: '#btn-assistance-purchase-request-close',
        disableFormSelector: '#assistance-purchase-request-modal button, #assistance-purchase-request-form-mount button, #assistance-purchase-request-form-mount input, #assistance-purchase-request-form-mount textarea, #assistance-purchase-request-form-mount select'
    })
    : null;

function formatAssistancePurchaseTypeLabel(purchaseType) {
    const map = {
        Material: 'Lista de Material',
        Ferragem: 'Lista de Ferragem',
        Tinta: 'Lista de Tinta',
        Terceiro: 'Terceiro'
    };
    return map[String(purchaseType || '').trim()] || purchaseType || '—';
}

function syncAssistancePurchaseRequestsButton(record = assistanceEditingRecord) {
    const button = document.getElementById('btn-assistance-purchase-requests');
    if (!button) return;
    const hasId = Boolean(Number(record?.id || assistanceEditingId));
    button.classList.toggle('hidden', !hasId);
}

function closeAssistancePurchaseRequestsModal() {
    toggleModal('assistance-purchase-requests-modal', false);
}

async function openAssistancePurchaseRequestsModal() {
    const assistanceId = Number(assistanceEditingId || assistanceEditingRecord?.id);
    if (!assistanceId) return;

    const mount = document.getElementById('assistance-purchase-requests-mount');
    const subtitle = document.getElementById('assistance-purchase-requests-subtitle');
    if (subtitle) {
        subtitle.textContent = `Assistência #${assistanceId}`;
    }
    if (mount) {
        mount.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando requisições...</p>';
    }
    toggleModal('assistance-purchase-requests-modal', true);

    if (typeof fetchPurchasesByAssistanceRequestId !== 'function') {
        if (mount) {
            mount.innerHTML = '<p class="text-xs text-red-600 text-center py-8">Módulo de compras indisponível.</p>';
        }
        return;
    }

    const { rows, missingColumn, error } = await fetchPurchasesByAssistanceRequestId(assistanceId);

    if (missingColumn) {
        if (mount) {
            mount.innerHTML = '<p class="text-xs text-amber-700 text-center py-8">Execute <code>supabase/feats/add-purchase-assistance-request-id.sql</code> no Supabase SQL Editor.</p>';
        }
        return;
    }
    if (error) {
        if (mount) {
            mount.innerHTML = `<p class="text-xs text-red-600 text-center py-8">${escapeHtml(error.message)}</p>`;
        }
        return;
    }

    if (!rows.length) {
        if (mount) {
            mount.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Nenhuma requisição de compra vinculada a esta assistência.</p>';
        }
        return;
    }

    if (mount) {
        mount.innerHTML = `
            <table class="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead class="bg-slate-50 text-slate-500 uppercase text-[10px]">
                    <tr>
                        <th class="text-left px-3 py-2">#</th>
                        <th class="text-left px-3 py-2">Tipo</th>
                        <th class="text-left px-3 py-2">Motivo</th>
                        <th class="text-left px-3 py-2">Status</th>
                        <th class="text-left px-3 py-2">Criada em</th>
                        <th class="text-right px-3 py-2 w-24">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr class="border-t border-slate-100">
                            <td class="px-3 py-2 font-mono">${row.id}</td>
                            <td class="px-3 py-2">${escapeHtml(formatAssistancePurchaseTypeLabel(row.purchaseType))}</td>
                            <td class="px-3 py-2">${escapeHtml(row.purchaseReason?.name || 'Assistência')}</td>
                            <td class="px-3 py-2">${escapeHtml(row.status || '—')}</td>
                            <td class="px-3 py-2">${typeof formatDisplayDate === 'function' ? formatDisplayDate(row.createdAt) : (row.createdAt || '—')}</td>
                            <td class="px-3 py-2 text-right">
                                <button type="button" class="assistance-purchase-request-view text-xs font-medium text-indigo-700 hover:text-indigo-900"
                                    data-purchase-id="${row.id}">Ver</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
}

function closeAssistancePurchaseRequestFormModal() {
    assistancePurchaseRequestModalOverlay?.setLoading(false);
    toggleModal('assistance-purchase-request-modal', false);
}

function handleAssistancePurchaseRequestViewClick(event) {
    const button = event.target?.closest?.('.assistance-purchase-request-view');
    if (!button) return;
    const purchaseId = Number(button.dataset.purchaseId);
    if (!purchaseId) return;
    if (typeof openPurchaseModal !== 'function') {
        alertAppDialog('Módulo de compras indisponível.');
        return;
    }
    void openPurchaseModal(purchaseId, { readOnly: true });
}

async function openAssistancePurchaseRequestFormModal(draftInput = {}) {
    const assistanceId = Number(draftInput.assistanceRequestId || assistanceEditingId || assistanceEditingRecord?.id);
    if (!assistanceId) {
        alertAppDialog('Salve a assistência antes de criar requisição de compra.');
        return;
    }

    const record = assistanceEditingRecord
        || assistanceRequestsCache.find(item => Number(item.id) === assistanceId)
        || {};
    const orderId = Number(draftInput.orderId || record.orderId || assistanceOrderId) || null;

    let purchaseReasonId = Number(draftInput.purchaseReasonId) || null;
    if (!purchaseReasonId && typeof resolveRequisicoesAssistenciaPurchaseReasonId === 'function') {
        try {
            purchaseReasonId = await resolveRequisicoesAssistenciaPurchaseReasonId();
        } catch (error) {
            console.warn('openAssistancePurchaseRequestFormModal:', error);
        }
    }

    const draft = {
        origin: 'assistance',
        assistanceRequestId: assistanceId,
        orderId: orderId || null,
        orderCode: record.order?.orderCode || '',
        clientName: record.client?.name || '',
        purchaseReasonId
    };

    const mount = document.getElementById('assistance-purchase-request-form-mount');
    toggleModal('assistance-purchase-requests-modal', false);
    toggleModal('assistance-purchase-request-modal', true);
    assistancePurchaseRequestModalOverlay?.setLoading(false);

    if (typeof mountRequisicoesPurchaseForm !== 'function') {
        if (mount) {
            mount.innerHTML = '<p class="text-xs text-red-600">Formulário de compras indisponível.</p>';
        }
        return;
    }

    await mountRequisicoesPurchaseForm(mount, draft, {
        keepDraft: true,
        appOverlay: assistancePurchaseRequestModalOverlay,
        onSuccess: async () => {
            closeAssistancePurchaseRequestFormModal();
            await openAssistancePurchaseRequestsModal();
        }
    });
}

async function handleAssistanceCreatePurchaseRequest() {
    const assistanceId = Number(assistanceEditingId || assistanceEditingRecord?.id);
    if (!assistanceId) {
        alertAppDialog('Salve a assistência antes de criar requisição de compra.');
        return;
    }
    if (typeof canAccessRequisicoes === 'function' && !canAccessRequisicoes()) {
        alertAppDialog('Sem permissão para requisições de compra.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    await openAssistancePurchaseRequestFormModal({ assistanceRequestId: assistanceId });
}

const ASSISTANCE_MODAL_LOCK_DATASET_KEY = 'assistanceModalLocked';

function restoreAssistanceModalQuoteControls() {
    const editable = canEditAssistanceQuote() && assistanceEditingStatus === ASSISTANCE_STATUS_QUOTE;
    const selectButton = document.getElementById('btn-assistance-quote-select');
    if (selectButton) selectButton.disabled = !editable;

    syncAssistanceQuoteUploadButton();
    updateAssistanceQuoteViewButton(assistanceEditingRecord);

    const saveButton = document.getElementById('btn-assistance-save');
    if (saveButton) saveButton.disabled = false;
}

function setAssistanceModalFormLocked(locked) {
    const ids = [
        'btn-assistance-save',
        'btn-assistance-quote-upload',
        'btn-assistance-quote-select',
        'btn-assistance-quote-view'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (locked) {
            el.dataset[ASSISTANCE_MODAL_LOCK_DATASET_KEY] = '1';
            el.disabled = true;
            return;
        }
        if (el.dataset[ASSISTANCE_MODAL_LOCK_DATASET_KEY] === '1') {
            delete el.dataset[ASSISTANCE_MODAL_LOCK_DATASET_KEY];
        }
    });

    if (!locked) {
        restoreAssistanceModalQuoteControls();
    }
}

function setAssistanceModalLoading(active, message = 'Processando...', status = 'loading') {
    assistanceModalOverlay?.setLoading(active, message, status);

    const lockForm = Boolean(active) && status === 'loading';
    setAssistanceModalFormLocked(lockForm);

    const closeButton = document.getElementById('btn-assistance-close');
    if (closeButton) closeButton.disabled = Boolean(active);
    const cancelRequestButton = document.getElementById('btn-assistance-cancel-request');
    if (cancelRequestButton) cancelRequestButton.disabled = Boolean(active);

    if (!active) {
        restoreAssistanceModalQuoteControls();
    }
}

function canEditAssistanceQuote(user = currentUser) {
    return (typeof isAdmin === 'function' && isAdmin(user))
        || (typeof isCompras === 'function' && isCompras(user));
}

function getAssistanceStatusLabel(status) {
    return ASSISTANCE_STATUSES.find(item => item.value === status)?.label || status || '—';
}

function renderAssistanceStatusBadge(status) {
    const label = getAssistanceStatusLabel(status);
    const badgeClass = ASSISTANCE_STATUS_BADGE[status] || 'bg-slate-100 text-slate-700';
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeClass}">${escapeHtml(label)}</span>`;
}

function getAssistanceFormClient() {
    return {
        id: Number(document.getElementById('assistance-client-id')?.value) || null,
        name: document.getElementById('assistance-client-name')?.value.trim() || ''
    };
}

function assistanceAddressIsLocked() {
    return assistanceOrderLocksAddress;
}

function formatAssistanceAddressLabel(record) {
    if (!record) return '';
    if (typeof formatGestaoAddrPickerLabel === 'function') {
        return formatGestaoAddrPickerLabel(record);
    }
    return [record.street, record.number, record.neighborhood, record.city, record.state]
        .filter(Boolean)
        .join(', ');
}

function setAssistanceSelectedAddr(record) {
    const nameInput = document.getElementById('assistance-addr');
    const idInput = document.getElementById('assistance-addr-id');
    if (idInput) idInput.value = record?.id ? String(record.id) : '';
    if (nameInput) {
        nameInput.value = formatAssistanceAddressLabel(record);
        nameInput.title = nameInput.value || '';
    }
}

function syncAssistanceAddressField() {
    const clientId = getAssistanceFormClient().id;
    const canPick = Boolean(clientId) && !assistanceOrderLocksAddress;
    const button = document.getElementById('btn-assistance-addr-picker');
    const input = document.getElementById('assistance-addr');
    if (button) button.disabled = !canPick;
    if (!input) return;

    if (assistanceOrderLocksAddress) {
        input.placeholder = 'Endereço do pedido';
    } else if (!clientId) {
        input.placeholder = 'Selecione o cliente para buscar o endereço';
    } else if (assistanceOrderId) {
        input.placeholder = 'Pedido sem endereço. Selecione um endereço do cliente';
    } else {
        input.placeholder = 'Clique em ... para buscar o endereço do cliente';
    }
}

function setAssistanceClient(client) {
    const nameInput = document.getElementById('assistance-client-name');
    const idInput = document.getElementById('assistance-client-id');
    const previousId = Number(idInput?.value) || null;
    const nextId = Number(client?.id) || null;
    if (nameInput) nameInput.value = client?.name || '';
    if (idInput) idInput.value = nextId ? String(nextId) : '';
    if (previousId && nextId && previousId !== nextId) {
        clearAssistanceOrder(false);
        setAssistanceSelectedAddr(null);
    }
    syncAssistanceAddressField();
}

function clearAssistanceOrder(clearAddress = true) {
    assistanceOrderId = null;
    assistanceOrderLocksAddress = false;
    const orderInput = document.getElementById('assistance-order-code');
    if (orderInput) orderInput.value = '';
    if (clearAddress) setAssistanceSelectedAddr(null);
    syncAssistanceAddressField();
}

async function fetchAssistanceOrderById(orderId) {
    const normalizedId = Number(orderId);
    if (!normalizedId) return null;

    let result = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, clientId, addrId, client:Client(id, name)')
        .eq('id', normalizedId)
        .maybeSingle();

    if (result.error && /addrId/i.test(result.error.message || '')) {
        result = await supabaseClient
            .from('salesOrders')
            .select('id, orderCode, clientId, client:Client(id, name)')
            .eq('id', normalizedId)
            .maybeSingle();
    }

    if (result.error) {
        console.error('fetchAssistanceOrderById:', result.error);
        return null;
    }
    return result.data;
}

async function applyAssistanceOrder(order) {
    const fullOrder = await fetchAssistanceOrderById(order?.id);
    if (!fullOrder) {
        alertAppDialog('Não foi possível carregar o pedido.');
        return;
    }

    assistanceOrderId = Number(fullOrder.id);
    const orderInput = document.getElementById('assistance-order-code');
    if (orderInput) orderInput.value = fullOrder.orderCode || '';

    const client = fullOrder.client || {};
    const nameInput = document.getElementById('assistance-client-name');
    const idInput = document.getElementById('assistance-client-id');
    if (nameInput) nameInput.value = client.name || getOrderClientName(fullOrder) || '';
    if (idInput) idInput.value = fullOrder.clientId || client.id || '';

    const addrId = Number(fullOrder.addrId) || null;
    if (addrId && typeof fetchGestaoClientAddrs === 'function') {
        const record = await fetchGestaoClientAddrs(null, { addrId });
        setAssistanceSelectedAddr(record);
        assistanceOrderLocksAddress = Boolean(record);
    } else {
        setAssistanceSelectedAddr(null);
        assistanceOrderLocksAddress = false;
    }
    syncAssistanceAddressField();
}

function resetAssistanceForm() {
    assistanceEditingId = null;
    assistanceEditingRecord = null;
    assistanceEditingStatus = ASSISTANCE_STATUS_OPEN;
    assistanceFormReturnTo = 'requisicoes';
    assistanceOrderId = null;
    assistanceOrderLocksAddress = false;
    document.getElementById('assistance-form')?.reset();
    const clientId = document.getElementById('assistance-client-id');
    const addrId = document.getElementById('assistance-addr-id');
    if (clientId) clientId.value = '';
    if (addrId) addrId.value = '';
    const fileName = document.getElementById('assistance-quote-file-name');
    const fileDisplay = document.getElementById('assistance-quote-file-display');
    const drivePath = document.getElementById('assistance-quote-drive-path');
    const uploadButton = document.getElementById('btn-assistance-quote-upload');
    assistanceQuoteDriveFile = null;
    if (fileName) fileName.textContent = 'Nenhum PDF enviado.';
    if (fileDisplay) fileDisplay.value = '';
    if (drivePath) drivePath.textContent = '';
    if (uploadButton) uploadButton.disabled = true;
    updateAssistanceQuoteViewButton(null);
    renderAssistanceStatusLabel(ASSISTANCE_STATUS_OPEN);
    syncAssistanceAddressField();
    syncAssistanceModalStatusActions(null);
    syncAssistanceCancelReasonSection(null);
    syncAssistanceCancelRequestButton(null);
    syncAssistanceFormReadOnlyState(null);
    syncAssistancePurchaseRequestsButton(null);
}

const ASSISTANCE_MODAL_STATUS_ACTION_TONES = {
    amber: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
    indigo: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
    emerald: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
    sky: 'bg-sky-100 text-sky-800 hover:bg-sky-200',
    violet: 'bg-violet-100 text-violet-800 hover:bg-violet-200'
};

function assistanceModalStatusActionButton(action, label, tone = 'indigo') {
    const toneClass = ASSISTANCE_MODAL_STATUS_ACTION_TONES[tone] || ASSISTANCE_MODAL_STATUS_ACTION_TONES.indigo;
    return `<button type="button" class="assistance-modal-status-action text-xs font-medium px-4 py-2 rounded-lg ${toneClass}" data-assistance-modal-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

function renderAssistanceModalStatusActionsHtml(record) {
    if (!record?.id) return '';
    const status = record.status || assistanceEditingStatus;
    const parts = [];

    if (status === ASSISTANCE_STATUS_OPEN) {
        if (ASSISTANCE_UI_SHOW_SEND_TO_QUOTE_ACTION) {
            parts.push(assistanceModalStatusActionButton('quote', 'Enviar para Compras Orçar', 'amber'));
        }
        parts.push(assistanceModalStatusActionButton(
            'awaiting-scheduling',
            'Ir para Aguardando agendamento',
            'indigo'
        ));
    }
    if (status === ASSISTANCE_STATUS_QUOTE && canEditAssistanceQuote()) {
        parts.push(assistanceModalStatusActionButton('approval', 'Enviar para aprovação', 'amber'));
    }
    if (status === ASSISTANCE_STATUS_APPROVAL && canApproveAssistance()) {
        parts.push(assistanceModalStatusActionButton('approve', 'Aprovar', 'emerald'));
    }
    if (status === ASSISTANCE_STATUS_SEPARATION && canEditAssistanceQuote()) {
        parts.push(assistanceModalStatusActionButton('separated', 'Separado', 'sky'));
    }
    if (status === ASSISTANCE_STATUS_AWAITING_SCHEDULING && canEditAssistanceScheduling()) {
        parts.push(assistanceModalStatusActionButton('scheduled', 'Agendado', 'indigo'));
    }
    if (status === ASSISTANCE_STATUS_SCHEDULED && canEditAssistanceScheduling()) {
        parts.push(assistanceModalStatusActionButton('execution', 'Execução', 'violet'));
    }
    if (status === ASSISTANCE_STATUS_EXECUTION && canEditAssistanceScheduling()) {
        parts.push(assistanceModalStatusActionButton('finished', 'Finalizado', 'emerald'));
    }

    return parts.join('');
}

function syncAssistanceModalStatusActions(record = assistanceEditingRecord) {
    const wrap = document.getElementById('assistance-modal-status-actions');
    if (!wrap) return;
    const resolved = record?.id
        ? { ...record, id: Number(record.id), status: record.status || assistanceEditingStatus }
        : (assistanceEditingId
            ? { id: assistanceEditingId, status: assistanceEditingStatus }
            : null);
    const html = resolved ? renderAssistanceModalStatusActionsHtml(resolved) : '';
    wrap.innerHTML = html;
    wrap.classList.toggle('hidden', !html);
}

function renderAssistanceStatusLabel(status) {
    const label = document.getElementById('assistance-status-label');
    if (!label) return;
    label.innerHTML = renderAssistanceStatusBadge(status || ASSISTANCE_STATUS_OPEN);
}

function syncAssistanceQuoteSection(record = null) {
    const section = document.getElementById('assistance-quote-section');
    const totalInput = document.getElementById('assistance-total-value');
    const fileInput = document.getElementById('assistance-quote-file');
    const fileDisplay = document.getElementById('assistance-quote-file-display');
    const drivePath = document.getElementById('assistance-quote-drive-path');
    const editControls = document.getElementById('assistance-quote-edit-controls');
    const selectButton = document.getElementById('btn-assistance-quote-select');
    const uploadButton = document.getElementById('btn-assistance-quote-upload');
    const status = record?.status || assistanceEditingStatus;
    const visible = assistanceShouldShowQuoteSection(record, status);
    const editable = canEditAssistanceQuote() && status === ASSISTANCE_STATUS_QUOTE;

    section?.classList.toggle('hidden', !visible);
    editControls?.classList.toggle('hidden', !editable);

    if (totalInput) {
        const readOnly = visible && !editable;
        totalInput.disabled = !editable;
        totalInput.classList.toggle('bg-slate-50', readOnly);
        totalInput.classList.toggle('bg-white', editable);
        let displayValue = '';
        if (record?.totalValue != null && typeof formatSaleValueForInput === 'function') {
            displayValue = formatSaleValueForInput(record.totalValue);
        } else if (record?.totalValue != null && typeof formatSaleValueAsCurrencyInput === 'function') {
            displayValue = formatSaleValueAsCurrencyInput(record.totalValue);
        }
        totalInput.value = displayValue;
        if (editable && typeof bindSaleValueCurrencyInput === 'function') {
            bindSaleValueCurrencyInput(totalInput);
            if (record?.totalValue != null && typeof formatSaleValueCurrencyMaskFromDigits === 'function') {
                const cents = String(Math.round(Number(record.totalValue) * 100));
                totalInput.value = formatSaleValueCurrencyMaskFromDigits(cents);
            }
        }
    }
    if (fileInput) {
        fileInput.disabled = !editable;
        if (!editable) fileInput.value = '';
    }
    if (fileDisplay) fileDisplay.value = '';
    if (selectButton) selectButton.disabled = !editable;
    if (uploadButton) uploadButton.disabled = true;

    renderAssistanceQuoteFileLabel(record);
    if (drivePath) {
        drivePath.textContent = visible && record?.id
            ? buildAssistanceQuoteDriveFolderPath(record.id)
            : '';
    }
}

function buildAssistanceQuoteFileViewContext(record, driveFile = assistanceQuoteDriveFile) {
    if (driveFile?.id && (driveFile.driveFileId || String(driveFile.url || '').trim())) {
        return driveFile;
    }
    const path = String(record?.quoteFilePath || '').trim();
    if (!path && !record?.quoteFileName) return null;
    const driveFileId = typeof extractGoogleDriveFileId === 'function'
        ? extractGoogleDriveFileId(path)
        : '';
    return {
        fileName: record?.quoteFileName || 'Orçamento.pdf',
        url: path,
        driveFileId
    };
}

function assistanceQuoteFileCanOpen(record, driveFile = assistanceQuoteDriveFile) {
    const context = buildAssistanceQuoteFileViewContext(record, driveFile);
    if (!context) return false;
    if (typeof resolveDriveFilePdfBrowserOpenUrl === 'function') {
        return Boolean(String(resolveDriveFilePdfBrowserOpenUrl(context) || '').trim());
    }
    return Boolean(context.driveFileId || String(context.url || '').trim());
}

function renderAssistanceQuoteFileLabel(record) {
    const fileName = document.getElementById('assistance-quote-file-name');
    if (!fileName) return;
    const label = record?.quoteFileName
        || assistanceQuoteDriveFile?.fileName
        || '';
    fileName.textContent = label || 'Nenhum PDF enviado.';
    fileName.title = label || '';
    updateAssistanceQuoteViewButton(record);
}

function updateAssistanceQuoteViewButton(record = assistanceEditingRecord) {
    const button = document.getElementById('btn-assistance-quote-view');
    if (!button) return;
    const canOpen = assistanceQuoteFileCanOpen(record);
    button.disabled = !canOpen;
}

async function loadAssistanceQuoteDriveFile(assistanceId) {
    assistanceQuoteDriveFile = null;
    const id = Number(assistanceId);
    if (!id || typeof findDriveFileForEntity !== 'function' || typeof DRIVE_FILE_FOLDER_KIND === 'undefined') {
        updateAssistanceQuoteViewButton(assistanceEditingRecord);
        return null;
    }
    try {
        assistanceQuoteDriveFile = await findDriveFileForEntity({
            entityType: DRIVE_FILE_ENTITY_TYPE.ASSISTANCE_REQUEST,
            entityId: id,
            folderKind: DRIVE_FILE_FOLDER_KIND.ASSISTANCE_QUOTE
        });
    } catch (error) {
        console.warn('loadAssistanceQuoteDriveFile:', error);
        assistanceQuoteDriveFile = null;
    }
    renderAssistanceQuoteFileLabel(assistanceEditingRecord);
    return assistanceQuoteDriveFile;
}

async function fetchAssistanceRequestStatusHistory(assistanceRequestId) {
    const normalizedId = Number(assistanceRequestId);
    if (!normalizedId) return [];

    const { data, error } = await supabaseClient
        .from('AssistanceRequestStatusHistory')
        .select(`
            id,
            assistanceRequestId,
            previousStatus,
            newStatus,
            changedAt,
            changedById,
            previousStatusDurationSeconds,
            observation,
            ${ASSISTANCE_STATUS_HISTORY_CHANGED_BY_EMBED}
        `)
        .eq('assistanceRequestId', normalizedId)
        .order('changedAt', { ascending: true });

    if (error) {
        if (error.message?.includes('AssistanceRequestStatusHistory')) {
            throw new Error('Execute supabase/feats/assistance-request-status-history.sql no Supabase SQL Editor.');
        }
        throw error;
    }

    return data || [];
}

function adaptAssistanceRequestStatusHistoryEntries(entries = []) {
    return entries.map(entry => ({
        ...entry,
        previousStatusId: entry.previousStatus ? 1 : null,
        newStatus: { name: getAssistanceStatusLabel(entry.newStatus) },
        previousStatus: entry.previousStatus
            ? { name: getAssistanceStatusLabel(entry.previousStatus) }
            : null
    }));
}

function buildAssistanceStatusHistorySubtitle(record = assistanceEditingRecord) {
    const assistanceId = Number(record?.id || assistanceEditingId);
    const clientName = record?.client?.name
        || getAssistanceFormClient().name
        || '—';
    const orderCode = record?.order?.orderCode
        || document.getElementById('assistance-order-code')?.value?.trim()
        || '';
    const orderPart = orderCode ? ` · Pedido ${orderCode}` : '';
    return `Assistência #${assistanceId || '—'} · ${clientName}${orderPart}`;
}

async function openAssistanceStatusHistoryModal(record = assistanceEditingRecord) {
    const assistanceId = Number(record?.id || assistanceEditingId);
    if (!assistanceId) return;

    const subtitle = document.getElementById('project-status-history-subtitle');
    const flow = document.getElementById('project-status-history-flow');

    if (subtitle) {
        subtitle.textContent = buildAssistanceStatusHistorySubtitle(record);
    }

    toggleModal('order-project-status-history-modal', true);

    if (flow) {
        flow.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando histórico...</p>';
    }

    try {
        const entries = adaptAssistanceRequestStatusHistoryEntries(
            await fetchAssistanceRequestStatusHistory(assistanceId)
        );
        if (typeof setProjectStatusHistoryContent === 'function') {
            setProjectStatusHistoryContent('project-status-history-flow', entries, 'flow');
        } else if (flow) {
            flow.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Histórico indisponível.</p>';
        }
    } catch (error) {
        if (flow) {
            flow.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar histórico: ${escapeHtml(error.message)}</p>`;
        }
    }
}

async function openAssistanceQuotePdfInBrowser() {
    const context = buildAssistanceQuoteFileViewContext(assistanceEditingRecord, assistanceQuoteDriveFile);
    if (!context) {
        alertAppDialog('Não foi possível abrir o PDF.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const url = typeof resolveDriveFilePdfBrowserOpenUrl === 'function'
        ? resolveDriveFilePdfBrowserOpenUrl(context)
        : String(context?.url || '').trim();
    if (!url) {
        alertAppDialog('Não foi possível abrir o PDF.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function openAssistanceForm(record = null, options = {}) {
    resetAssistanceForm();
    assistanceFormReturnTo = options.returnTo || 'requisicoes';
    assistanceEditingStatus = record?.status || ASSISTANCE_STATUS_OPEN;
    renderAssistanceStatusLabel(assistanceEditingStatus);
    const title = document.getElementById('assistance-modal-title');
    if (title) title.textContent = record ? 'Editar assistência' : 'Nova assistência';

    if (record) {
        assistanceEditingId = Number(record.id);
        assistanceEditingRecord = await enrichAssistanceRecordCancelReason(record);
        record = assistanceEditingRecord;
        setAssistanceClient({ id: record.clientId || record.client?.id, name: record.client?.name || '' });
        const description = document.getElementById('assistance-description');
        const warranty = document.getElementById('assistance-warranty');
        if (description) description.value = record.description || '';
        if (warranty) warranty.value = record.isWarranty ? 'true' : 'false';
        if (record.orderId) {
            await applyAssistanceOrder({ id: record.orderId });
        }
        if (!assistanceOrderLocksAddress && record.addrId && typeof fetchGestaoClientAddrs === 'function') {
            const address = record.address || await fetchGestaoClientAddrs(null, { addrId: record.addrId });
            setAssistanceSelectedAddr(address);
        }
    }

    syncAssistanceAddressField();
    await ensureAssistanceAssigneeOptions();
    if (record?.id) {
        await loadAssistanceQuoteDriveFile(record.id);
    }
    syncAssistanceQuoteSection(assistanceEditingRecord);
    syncAssistanceSchedulingSection(assistanceEditingRecord);
    syncAssistanceModalStatusActions(assistanceEditingRecord);
    syncAssistanceCancelReasonSection(assistanceEditingRecord);
    syncAssistanceCancelRequestButton(assistanceEditingRecord);
    syncAssistanceFormReadOnlyState(assistanceEditingRecord);
    syncAssistancePurchaseRequestsButton(assistanceEditingRecord);
    if (
        typeof primeGoogleDriveAppsScript === 'function'
        && assistanceShouldShowQuoteSection(assistanceEditingRecord, assistanceEditingStatus)
        && canEditAssistanceQuote()
    ) {
        primeGoogleDriveAppsScript();
    }
    toggleModal('assistance-modal', true);
}

function renderAssistanceScreen(options = {}) {
    const content = document.getElementById('requisicoes-content');
    if (!content) return;

    if (typeof isMobileViewport === 'function' && isMobileViewport()) {
        renderRequisicoesAssistanceMobileScreen(content, options);
        return;
    }

    content.innerHTML = `
        <section class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 class="font-bold text-sm text-slate-900">Assistência</h2>
                    <p class="text-xs text-slate-400 mt-0.5">Cadastre o cliente, o pedido quando houver, o endereço, se é garantia e a descrição.</p>
                </div>
                <button type="button" id="btn-assistance-new" class="text-xs bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800">
                    Nova assistência
                </button>
            </div>
            <div id="assistance-sql-hint" class="${options.sqlError ? '' : 'hidden'} text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ${escapeHtml(options.sqlError || '')}
            </div>
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div id="assistance-table-mount" class="p-0"></div>
            </div>
        </section>
    `;

    mountRequisicoesAssistanceInteractiveTable(document.getElementById('assistance-table-mount'));
}

const ASSISTANCE_REQUEST_LIST_SELECT = 'id, clientId, orderId, addrId, isWarranty, description, status, totalValue, quoteFilePath, quoteFileName, scheduledAt, finishedAt, montadorId, cabinetMakerId, createdAt, client:Client(id, name), order:salesOrders(id, orderCode), address:addr(id, nickname, street, number, complement, neighborhood, city, state, isPrimary), montador:Installer(id, name), cabinetMaker:CabinetMaker(id, name)';

async function enrichAssistanceRecordCancelReason(record) {
    if (!record?.id) return record;
    if (record.status !== ASSISTANCE_STATUS_CANCELLED) return record;
    if (String(record.cancelReason || '').trim()) return record;

    const { data, error } = await supabaseClient
        .from('AssistanceRequest')
        .select('cancelReason')
        .eq('id', Number(record.id))
        .maybeSingle();

    if (error || !data) return record;
    return { ...record, cancelReason: data.cancelReason };
}

async function loadAssistanceRequests(options = {}) {
    const content = document.getElementById('requisicoes-content');
    if (content && !options.silent) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando assistências...</p>';
    }

    let result = await supabaseClient
        .from('AssistanceRequest')
        .select(`${ASSISTANCE_REQUEST_LIST_SELECT}, cancelReason`)
        .order('id', { ascending: false });

    if (result.error && /cancelReason/i.test(result.error.message || '')) {
        result = await supabaseClient
            .from('AssistanceRequest')
            .select(ASSISTANCE_REQUEST_LIST_SELECT)
            .order('id', { ascending: false });
    }

    if (result.error && /totalValue|quoteFilePath|quoteFileName|scheduledAt|finishedAt|montadorId|cabinetMakerId|Installer|CabinetMaker/i.test(result.error.message || '')) {
        result = await supabaseClient
            .from('AssistanceRequest')
            .select('id, clientId, orderId, addrId, isWarranty, description, status, totalValue, quoteFilePath, quoteFileName, createdAt, client:Client(id, name), order:salesOrders(id, orderCode), address:addr(id, nickname, street, number, complement, neighborhood, city, state, isPrimary)')
            .order('id', { ascending: false });
    }

    if (result.error && /addr|address|relationship/i.test(result.error.message || '')) {
        result = await supabaseClient
            .from('AssistanceRequest')
            .select('id, clientId, orderId, addrId, isWarranty, description, status, createdAt, client:Client(id, name), order:salesOrders(id, orderCode)')
            .order('id', { ascending: false });
    }

    if (result.error) {
        assistanceRequestsCache = [];
        const missingTable = /AssistanceRequest|schema cache|does not exist/i.test(result.error.message || '');
        renderAssistanceScreen({
            sqlError: missingTable
                ? `${assistanceSqlHint()} ${result.error.message}`
                : `Erro ao carregar: ${result.error.message}`
        });
        return;
    }

    assistanceRequestsCache = result.data || [];
    renderAssistanceScreen();
}

function collectAssistanceForm() {
    const client = getAssistanceFormClient();
    const warrantyValue = document.getElementById('assistance-warranty')?.value || '';
    const description = document.getElementById('assistance-description')?.value.trim() || '';
    const addrId = Number(document.getElementById('assistance-addr-id')?.value) || null;

    if (!client.id) {
        alertAppDialog('Selecione o cliente.');
        return null;
    }
    if (warrantyValue !== 'true' && warrantyValue !== 'false') {
        alertAppDialog('Informe se a assistência é garantia.');
        return null;
    }
    if (!description) {
        alertAppDialog('Descreva a assistência.');
        return null;
    }
    if (!addrId) {
        alertAppDialog(assistanceOrderId
            ? 'Este pedido não tem endereço. Selecione um endereço do cliente.'
            : 'Selecione o endereço.');
        return null;
    }

    const payload = {
        clientId: client.id,
        orderId: assistanceOrderId,
        addrId,
        isWarranty: warrantyValue === 'true',
        description
    };

    if (canEditAssistanceQuote() && assistanceEditingStatus === ASSISTANCE_STATUS_QUOTE) {
        const totalRaw = document.getElementById('assistance-total-value')?.value || '';
        const totalValue = typeof parseSaleValueInput === 'function'
            ? parseSaleValueInput(totalRaw)
            : (totalRaw.trim() ? Number(totalRaw) : null);
        if (Number.isNaN(totalValue)) {
            alertAppDialog('Informe um valor total válido.');
            return null;
        }
        const quoteFile = document.getElementById('assistance-quote-file')?.files?.[0];
        if (quoteFile && !isAssistancePdfFile(quoteFile)) {
            alertAppDialog('O arquivo da assistência precisa ser um PDF.');
            return null;
        }
        payload.totalValue = totalValue;
    }

    if (canEditAssistanceScheduling()
        && ASSISTANCE_SCHEDULING_FIELDS_EDITABLE_STATUSES.has(assistanceEditingStatus)) {
        payload.scheduledAt = fromAssistanceDateInputValue(
            document.getElementById('assistance-scheduled-at')?.value
        );
        const assignee = parseAssistanceAssigneeSelectValue(
            document.getElementById('assistance-assignee')?.value
        );
        payload.montadorId = assignee.montadorId;
        payload.cabinetMakerId = assignee.cabinetMakerId;
    }

    return payload;
}

function isAssistancePdfFile(file) {
    if (!file) return false;
    const name = String(file.name || '').trim().toLowerCase();
    const type = String(file.type || '').trim().toLowerCase();
    return name.endsWith('.pdf') && (!type || type === 'application/pdf');
}

function buildAssistanceQuoteDriveFolderPath(assistanceId) {
    if (typeof buildDriveFolderPath === 'function' && typeof DRIVE_FILE_FOLDER_KIND !== 'undefined') {
        return buildDriveFolderPath('assistencias', String(Number(assistanceId)), DRIVE_FILE_FOLDER_KIND.ASSISTANCE_QUOTE);
    }
    const root = window.FORMIGHIERI_APP_ENV === 'dev' ? 'FGP-DEV' : 'FGP';
    return `${root} / assistencias / ${Number(assistanceId)} / orcamento`;
}

async function uploadAssistanceQuoteFile(file, assistanceId) {
    if (!file) return null;
    if (!isAssistancePdfFile(file)) {
        throw new Error('O arquivo da assistência precisa ser um PDF.');
    }
    if (typeof saveDriveFileUpload !== 'function' || typeof DRIVE_FILE_FOLDER_KIND === 'undefined') {
        throw new Error('Envio para o Google Drive indisponível.');
    }

    const folderKind = DRIVE_FILE_FOLDER_KIND.ASSISTANCE_QUOTE;
    const validation = typeof validateDriveUploadFiles === 'function'
        ? validateDriveUploadFiles([file], folderKind)
        : '';
    if (validation) throw new Error(validation);

    const folderPath = buildAssistanceQuoteDriveFolderPath(assistanceId);
    const uploaded = await saveDriveFileUpload(file, {
        folderKind,
        entityType: DRIVE_FILE_ENTITY_TYPE.ASSISTANCE_REQUEST,
        entityId: Number(assistanceId),
        orderCode: 'assistencias',
        projectName: String(Number(assistanceId)),
        folderLeafName: 'orcamento',
        folderPath,
        replaceByEntity: true
    });

    return {
        path: uploaded?.url || uploaded?.driveFileId || folderPath,
        fileName: uploaded?.fileName || file.name
    };
}

async function updateAssistanceStatus(id, status, extraFields = {}) {
    const now = new Date().toISOString();
    const payload = {
        status,
        updatedAt: now,
        updatedById: currentUser?.id || null,
        ...extraFields
    };
    if (status === ASSISTANCE_STATUS_FINISHED && payload.finishedAt === undefined) {
        payload.finishedAt = now;
    }
    const { error } = await supabaseClient
        .from('AssistanceRequest')
        .update(payload)
        .eq('id', id);
    if (error) throw error;
}

async function cancelAssistanceRequest(record = assistanceEditingRecord) {
    const assistanceId = Number(record?.id || assistanceEditingId);
    if (!assistanceId || !canCancelAssistance(record)) {
        alertAppDialog('Você não pode cancelar esta assistência.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const reason = await promptAppDialog('Informe o motivo do cancelamento:', {
        title: 'Cancelar assistência',
        confirmLabel: 'Cancelar assistência',
        variant: 'danger',
        placeholder: 'Descreva o motivo...'
    });
    if (reason === null) return;

    const cancelReason = String(reason).trim();
    if (!cancelReason) {
        alertAppDialog('Informe o motivo do cancelamento.');
        return;
    }

    if (!(await confirmAppDialog(
        'Confirma o cancelamento desta assistência? O status passará para Cancelado.',
        { title: 'Cancelar assistência', confirmLabel: 'Confirmar cancelamento', variant: 'danger' }
    ))) return;

    try {
        setAssistanceModalLoading(true, 'Cancelando assistência...');
        await updateAssistanceStatus(assistanceId, ASSISTANCE_STATUS_CANCELLED, { cancelReason });
        assistanceEditingStatus = ASSISTANCE_STATUS_CANCELLED;
        assistanceEditingRecord = {
            ...(assistanceEditingRecord || record || {}),
            id: assistanceId,
            status: ASSISTANCE_STATUS_CANCELLED,
            cancelReason
        };
        renderAssistanceStatusLabel(ASSISTANCE_STATUS_CANCELLED);
        syncAssistanceCancelReasonSection(assistanceEditingRecord);
        syncAssistanceCancelRequestButton(assistanceEditingRecord);
        syncAssistanceFormReadOnlyState(assistanceEditingRecord);
        syncAssistanceModalStatusActions(assistanceEditingRecord);
        setAssistanceModalLoading(true, 'Cancelada!', 'success');
        await new Promise(resolve => setTimeout(resolve, 500));
        setAssistanceModalLoading(false);
        await refreshAssistanceSurfaces();
    } catch (error) {
        setAssistanceModalLoading(false);
        const missing = /cancelReason|AssistanceRequest_status_check|schema cache/i.test(error.message || '');
        alertAppDialog(missing
            ? `${error.message}. Execute supabase/feats/assistance-request-cancel-status.sql no Supabase SQL Editor.`
            : `Erro ao cancelar: ${error.message}`);
    }
}

async function refreshAssistanceSurfaces() {
    if (assistanceFormReturnTo === 'pendencias' && typeof loadPendenciasAssistencias === 'function') {
        await loadPendenciasAssistencias();
        return;
    }
    if (document.getElementById('requisicoes-view') && !document.getElementById('requisicoes-view').classList.contains('hidden')) {
        await loadAssistanceRequests();
    }
}

async function sendAssistanceToQuote(id) {
    const record = assistanceRequestsCache.find(item => Number(item.id) === Number(id));
    if (record && record.status !== ASSISTANCE_STATUS_OPEN) return;
    if (!(await confirmAppDialog('Enviar esta assistência para Compras orçar?'))) return;
    try {
        await updateAssistanceStatus(id, ASSISTANCE_STATUS_QUOTE);
        await loadAssistanceRequests();
    } catch (error) {
        alertAppDialog(`Erro ao enviar para orçamento: ${error.message}. ${assistanceSqlHint()}`);
    }
}

async function sendAssistanceToAwaitingScheduling(id) {
    const normalizedId = Number(id);
    if (!normalizedId) return;
    const record = assistanceRequestsCache.find(item => Number(item.id) === normalizedId);
    if (record && record.status !== ASSISTANCE_STATUS_OPEN) return;
    if (!(await confirmAppDialog(
        'Ir direto para Aguardando agendamento? O fluxo de orçamento na Compras será ignorado.',
        { title: 'Assistência', confirmLabel: 'Ir para agendamento' }
    ))) return;
    try {
        await updateAssistanceStatus(normalizedId, ASSISTANCE_STATUS_AWAITING_SCHEDULING);
        await refreshAssistanceSurfaces();
    } catch (error) {
        alertAppDialog(`Erro ao atualizar status: ${error.message}. ${assistanceSqlHint()}`);
    }
}

async function saveAssistancePayloadFromModalWithStatus(targetStatus) {
    const id = Number(assistanceEditingId);
    if (!id) {
        alertAppDialog('Salve a assistência antes de alterar o status.');
        return false;
    }
    const payload = collectAssistanceForm();
    if (!payload) return false;

    const now = new Date().toISOString();
    const userId = currentUser?.id || null;
    try {
        setAssistanceModalLoading(true, 'Atualizando status...');
        const statusPayload = {
            ...payload,
            status: targetStatus,
            updatedAt: now,
            updatedById: userId
        };
        if (targetStatus === ASSISTANCE_STATUS_FINISHED && statusPayload.finishedAt === undefined) {
            statusPayload.finishedAt = now;
        }
        const { error } = await supabaseClient
            .from('AssistanceRequest')
            .update(statusPayload)
            .eq('id', id);
        if (error) throw error;
        setAssistanceModalLoading(true, 'Status atualizado!', 'success');
        await new Promise(resolve => setTimeout(resolve, 700));
        setAssistanceModalLoading(false);
        toggleModal('assistance-modal', false);
        await refreshAssistanceSurfaces();
        if (typeof loadPendenciasAssistencias === 'function'
            && [ASSISTANCE_STATUS_QUOTE, ASSISTANCE_STATUS_APPROVAL, ASSISTANCE_STATUS_AWAITING_SCHEDULING]
                .includes(targetStatus)) {
            await loadPendenciasAssistencias();
        }
        return true;
    } catch (error) {
        setAssistanceModalLoading(false);
        const missingTable = /AssistanceRequest|schema cache|does not exist/i.test(error.message || '');
        alertAppDialog(missingTable ? `${error.message}. ${assistanceSqlHint()}` : `Erro ao atualizar: ${error.message}`);
        return false;
    }
}

async function sendAssistanceToQuoteFromModal() {
    if (!(await confirmAppDialog('Enviar esta assistência para Compras orçar?'))) return;
    await saveAssistancePayloadFromModalWithStatus(ASSISTANCE_STATUS_QUOTE);
}

async function sendAssistanceToAwaitingSchedulingFromModal() {
    if (!(await confirmAppDialog(
        'Ir direto para Aguardando agendamento? O fluxo de orçamento na Compras será ignorado.',
        { title: 'Assistência', confirmLabel: 'Ir para agendamento' }
    ))) return;
    await saveAssistancePayloadFromModalWithStatus(ASSISTANCE_STATUS_AWAITING_SCHEDULING);
}

async function sendAssistanceToApprovalFromModal() {
    if (assistanceEditingStatus !== ASSISTANCE_STATUS_QUOTE) return;
    if (!canEditAssistanceQuote()) {
        alertAppDialog('Somente usuários com permissão de Comprador podem enviar para aprovação.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    const pendingFile = document.getElementById('assistance-quote-file')?.files?.[0];
    if (pendingFile) {
        alertAppDialog('Envie o PDF antes de enviar para aprovação.');
        return;
    }
    const payload = collectAssistanceForm();
    if (!payload) return;
    const merged = { ...assistanceEditingRecord, ...payload };
    if (!assistanceQuoteIsReady(merged)) {
        alertAppDialog('Informe o valor total e anexe o PDF antes de enviar para aprovação.');
        return;
    }
    if (!(await confirmAppDialog('Enviar esta assistência para aprovação?'))) return;
    await saveAssistancePayloadFromModalWithStatus(ASSISTANCE_STATUS_APPROVAL);
}

async function approveAssistanceFromModal() {
    if (assistanceEditingStatus !== ASSISTANCE_STATUS_APPROVAL) return;
    if (!canApproveAssistance()) {
        alertAppDialog('Somente Admin ou gestores podem aprovar.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!(await confirmAppDialog('Aprovar esta assistência e enviar para separação?'))) return;
    await saveAssistancePayloadFromModalWithStatus(ASSISTANCE_STATUS_SEPARATION);
}

async function markAssistanceSeparatedFromModal() {
    if (assistanceEditingStatus !== ASSISTANCE_STATUS_SEPARATION) return;
    if (!canEditAssistanceQuote()) {
        alertAppDialog('Somente usuários com permissão de Comprador podem marcar como separado.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!(await confirmAppDialog('Marcar esta assistência como separada e enviar para aguardando agendamento?'))) return;
    await saveAssistancePayloadFromModalWithStatus(ASSISTANCE_STATUS_AWAITING_SCHEDULING);
}

async function markAssistanceScheduledFromModal() {
    if (assistanceEditingStatus !== ASSISTANCE_STATUS_AWAITING_SCHEDULING) return;
    if (!canEditAssistanceScheduling()) {
        alertAppDialog('Sem permissão para marcar como agendado.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    const payload = collectAssistanceForm();
    if (!payload) return;
    const merged = { ...assistanceEditingRecord, ...payload };
    if (!assistanceSchedulingIsReady(merged)) {
        alertAppDialog('Informe a data agendada e o montador ou marceneiro antes de marcar como agendado.');
        return;
    }
    if (!(await confirmAppDialog('Confirmar agendamento desta assistência?'))) return;
    await saveAssistancePayloadFromModalWithStatus(ASSISTANCE_STATUS_SCHEDULED);
}

async function markAssistanceExecutionFromModal() {
    if (assistanceEditingStatus !== ASSISTANCE_STATUS_SCHEDULED) return;
    if (!canEditAssistanceScheduling()) {
        alertAppDialog('Sem permissão para iniciar execução.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!(await confirmAppDialog('Marcar esta assistência como em execução?'))) return;
    await saveAssistancePayloadFromModalWithStatus(ASSISTANCE_STATUS_EXECUTION);
}

async function markAssistanceFinishedFromModal() {
    if (assistanceEditingStatus !== ASSISTANCE_STATUS_EXECUTION) return;
    if (!canEditAssistanceScheduling()) {
        alertAppDialog('Sem permissão para finalizar.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!(await confirmAppDialog('Marcar esta assistência como finalizada?'))) return;
    await saveAssistancePayloadFromModalWithStatus(ASSISTANCE_STATUS_FINISHED);
}

function assistanceQuoteIsReady(record) {
    const total = Number(record?.totalValue);
    return Number.isFinite(total) && total >= 0 && record.totalValue != null && Boolean(record.quoteFilePath);
}

function assistanceSchedulingIsReady(record) {
    if (!record) return false;
    const hasDate = Boolean(String(record.scheduledAt || '').trim());
    const hasAssignee = Boolean(Number(record.montadorId) || Number(record.cabinetMakerId));
    return hasDate && hasAssignee;
}

async function fetchAssistanceRequestSchedulingRow(assistanceId) {
    const normalizedId = Number(assistanceId);
    if (!normalizedId) return null;

    let result = await supabaseClient
        .from('AssistanceRequest')
        .select('id, status, scheduledAt, montadorId, cabinetMakerId')
        .eq('id', normalizedId)
        .maybeSingle();

    if (result.error && /scheduledAt|montadorId|cabinetMakerId/i.test(result.error.message || '')) {
        return null;
    }
    if (result.error) throw result.error;
    return result.data;
}

async function approveAssistanceRequest(id) {
    const record = assistanceRequestsCache.find(item => Number(item.id) === Number(id));
    if (!record || record.status !== ASSISTANCE_STATUS_APPROVAL) return;
    if (!canApproveAssistance()) {
        alertAppDialog('Somente Admin ou gestores podem aprovar.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!(await confirmAppDialog('Aprovar esta assistência e enviar para separação?'))) return;
    try {
        await updateAssistanceStatus(id, ASSISTANCE_STATUS_SEPARATION);
        await refreshAssistanceSurfaces();
    } catch (error) {
        alertAppDialog(`Erro ao aprovar: ${error.message}. ${assistanceSqlHint()}`);
    }
}

async function markAssistanceScheduled(id) {
    const normalizedId = Number(id);
    if (!normalizedId) return;
    if (!canEditAssistanceScheduling()) {
        alertAppDialog('Sem permissão para marcar como agendado.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    let record = assistanceRequestsCache.find(item => Number(item.id) === normalizedId) || null;
    try {
        const fresh = await fetchAssistanceRequestSchedulingRow(normalizedId);
        if (fresh) record = { ...record, ...fresh };
    } catch (error) {
        alertAppDialog(`Erro ao carregar assistência: ${error.message}`);
        return;
    }

    if (!record || record.status !== ASSISTANCE_STATUS_AWAITING_SCHEDULING) {
        alertAppDialog('Esta assistência não está aguardando agendamento.');
        return;
    }
    if (!assistanceSchedulingIsReady(record)) {
        alertAppDialog('Informe a data agendada e o montador ou marceneiro na edição antes de marcar como agendado.');
        return;
    }
    if (!(await confirmAppDialog('Confirmar agendamento desta assistência?'))) return;

    try {
        await updateAssistanceStatus(normalizedId, ASSISTANCE_STATUS_SCHEDULED);
        await refreshAssistanceSurfaces();
    } catch (error) {
        alertAppDialog(`Erro ao atualizar status: ${error.message}. ${assistanceSqlHint()}`);
    }
}

async function markAssistanceExecution(id) {
    const normalizedId = Number(id);
    if (!normalizedId) return;
    const record = assistanceRequestsCache.find(item => Number(item.id) === normalizedId);
    if (!record || record.status !== ASSISTANCE_STATUS_SCHEDULED) return;
    if (!canEditAssistanceScheduling()) {
        alertAppDialog('Sem permissão para iniciar execução.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!(await confirmAppDialog('Marcar esta assistência como em execução?'))) return;
    try {
        await updateAssistanceStatus(normalizedId, ASSISTANCE_STATUS_EXECUTION);
        await refreshAssistanceSurfaces();
    } catch (error) {
        alertAppDialog(`Erro ao atualizar status: ${error.message}. ${assistanceSqlHint()}`);
    }
}

async function markAssistanceFinished(id) {
    const normalizedId = Number(id);
    if (!normalizedId) return;
    const record = assistanceRequestsCache.find(item => Number(item.id) === normalizedId);
    if (!record || record.status !== ASSISTANCE_STATUS_EXECUTION) return;
    if (!canEditAssistanceScheduling()) {
        alertAppDialog('Sem permissão para finalizar.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!(await confirmAppDialog('Marcar esta assistência como finalizada?'))) return;
    try {
        await updateAssistanceStatus(normalizedId, ASSISTANCE_STATUS_FINISHED);
        await refreshAssistanceSurfaces();
    } catch (error) {
        alertAppDialog(`Erro ao atualizar status: ${error.message}. ${assistanceSqlHint()}`);
    }
}

async function markAssistanceSeparated(id) {
    const normalizedId = Number(id);
    if (!normalizedId) return;
    const record = assistanceRequestsCache.find(item => Number(item.id) === normalizedId)
        || null;
    if (record && record.status !== ASSISTANCE_STATUS_SEPARATION) return;
    if (!canEditAssistanceQuote()) {
        alertAppDialog('Somente usuários com permissão de Comprador podem marcar como separado.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!(await confirmAppDialog('Marcar esta assistência como separada e enviar para aguardando agendamento?'))) return;
    try {
        await updateAssistanceStatus(normalizedId, ASSISTANCE_STATUS_AWAITING_SCHEDULING);
        if (typeof loadPendenciasAssistencias === 'function') await loadPendenciasAssistencias();
        await refreshAssistanceSurfaces();
    } catch (error) {
        alertAppDialog(`Erro ao atualizar status: ${error.message}. ${assistanceSqlHint()}`);
    }
}

async function sendAssistanceToApproval(record) {
    if (!record?.id || record.status !== ASSISTANCE_STATUS_QUOTE) return;
    if (!canEditAssistanceQuote()) {
        alertAppDialog('Somente usuários com permissão de Comprador podem enviar para aprovação.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!assistanceQuoteIsReady(record)) {
        alertAppDialog('Informe o valor total e anexe o PDF antes de enviar para aprovação.');
        return;
    }
    if (!(await confirmAppDialog('Enviar esta assistência para aprovação?'))) return;
    try {
        await updateAssistanceStatus(record.id, ASSISTANCE_STATUS_APPROVAL);
        if (typeof loadPendenciasAssistencias === 'function') await loadPendenciasAssistencias();
    } catch (error) {
        alertAppDialog(`Erro ao enviar para aprovação: ${error.message}. ${assistanceSqlHint()}`);
    }
}

async function saveAssistanceRequest(event) {
    event.preventDefault();
    if (assistanceEditingStatus === ASSISTANCE_STATUS_CANCELLED) {
        alertAppDialog('Assistência cancelada não pode ser alterada.');
        return;
    }
    const payload = collectAssistanceForm();
    if (!payload) return;

    const now = new Date().toISOString();
    const userId = currentUser?.id || null;
    try {
        const quoteFile = canEditAssistanceQuote() && assistanceEditingStatus === ASSISTANCE_STATUS_QUOTE
            ? document.getElementById('assistance-quote-file')?.files?.[0]
            : null;
        if (quoteFile) {
            setAssistanceModalLoading(true, 'Enviando PDF para o Google Drive...');
        }
        let savedId = assistanceEditingId;

        if (assistanceEditingId) {
            const { error } = await supabaseClient
                .from('AssistanceRequest')
                .update({
                    ...payload,
                    updatedAt: now,
                    updatedById: userId
                })
                .eq('id', assistanceEditingId);
            if (error) throw error;
        } else {
            const { data: created, error } = await supabaseClient
                .from('AssistanceRequest')
                .insert({
                    ...payload,
                    status: ASSISTANCE_STATUS_OPEN,
                    createdAt: now,
                    updatedAt: now,
                    createdById: userId,
                    updatedById: userId
                })
                .select('id')
                .single();
            if (error) throw error;
            savedId = created.id;
        }

        if (quoteFile && savedId) {
            const uploaded = await uploadAssistanceQuoteFile(quoteFile, savedId);
            const { error: fileError } = await supabaseClient
                .from('AssistanceRequest')
                .update({
                    quoteFilePath: uploaded.path,
                    quoteFileName: uploaded.fileName,
                    updatedAt: now,
                    updatedById: userId
                })
                .eq('id', savedId);
            if (fileError) throw fileError;
            await loadAssistanceQuoteDriveFile(savedId);
        }

        setAssistanceModalLoading(false);
        toggleModal('assistance-modal', false);
        await refreshAssistanceSurfaces();
    } catch (error) {
        setAssistanceModalLoading(false);
        const missingTable = /AssistanceRequest|schema cache|does not exist/i.test(error.message || '');
        alertAppDialog(missingTable ? `${error.message}. ${assistanceSqlHint()}` : `Erro ao salvar: ${error.message}`);
    }
}

function syncAssistanceQuoteUploadButton() {
    const file = document.getElementById('assistance-quote-file')?.files?.[0];
    const button = document.getElementById('btn-assistance-quote-upload');
    const display = document.getElementById('assistance-quote-file-display');
    if (display) display.value = file?.name || '';
    if (button) button.disabled = !file || !assistanceEditingId;
}

async function uploadAssistanceQuoteFromForm() {
    const file = document.getElementById('assistance-quote-file')?.files?.[0];
    if (!assistanceEditingId) {
        alertAppDialog('Salve a assistência antes de enviar o PDF.');
        return;
    }
    if (!file) {
        alertAppDialog('Escolha um PDF.');
        return;
    }
    if (!isAssistancePdfFile(file)) {
        alertAppDialog('O arquivo da assistência precisa ser um PDF.');
        return;
    }

    try {
        setAssistanceModalLoading(true, 'Enviando PDF para o Google Drive...');
        const uploaded = await uploadAssistanceQuoteFile(file, assistanceEditingId);
        const { error } = await supabaseClient
            .from('AssistanceRequest')
            .update({
                quoteFilePath: uploaded.path,
                quoteFileName: uploaded.fileName,
                updatedAt: new Date().toISOString(),
                updatedById: currentUser?.id || null
            })
            .eq('id', assistanceEditingId);
        if (error) throw error;

        if (assistanceEditingRecord) {
            assistanceEditingRecord.quoteFilePath = uploaded.path;
            assistanceEditingRecord.quoteFileName = uploaded.fileName;
        }
        await loadAssistanceQuoteDriveFile(assistanceEditingId);
        const fileInput = document.getElementById('assistance-quote-file');
        if (fileInput) fileInput.value = '';
        syncAssistanceQuoteUploadButton();
        syncAssistanceModalStatusActions(assistanceEditingRecord);
        setAssistanceModalLoading(true, 'PDF enviado com sucesso!', 'success');
        await new Promise(resolve => setTimeout(resolve, 700));
        setAssistanceModalLoading(false);
    } catch (error) {
        setAssistanceModalLoading(true, 'Falha ao enviar o PDF.', 'error');
        await new Promise(resolve => setTimeout(resolve, 900));
        setAssistanceModalLoading(false);
        syncAssistanceQuoteUploadButton();
        alertAppDialog(`Erro ao enviar o PDF: ${error.message}`);
    }
}

function bindAssistanceEvents() {
    if (assistanceEventsBound) return;
    assistanceEventsBound = true;

    document.getElementById('requisicoes-content')?.addEventListener('click', event => {
        if (event.target.closest('#btn-assistance-new')) {
            openAssistanceForm();
            return;
        }
        const editButton = event.target.closest('.assistance-edit-btn');
        if (editButton) {
            const record = assistanceRequestsCache.find(item => Number(item.id) === Number(editButton.dataset.assistanceId));
            if (record) openAssistanceForm(record);
            return;
        }
        const historyButton = event.target.closest('.assistance-history-btn');
        if (historyButton) {
            const record = assistanceRequestsCache.find(item => Number(item.id) === Number(historyButton.dataset.assistanceId));
            if (record) openAssistanceStatusHistoryModal(record);
        }
    });

    document.getElementById('assistance-modal-status-actions')?.addEventListener('click', event => {
        const button = event.target.closest('[data-assistance-modal-action]');
        if (!button) return;
        const action = button.dataset.assistanceModalAction;
        switch (action) {
            case 'quote':
                void sendAssistanceToQuoteFromModal();
                break;
            case 'awaiting-scheduling':
                void sendAssistanceToAwaitingSchedulingFromModal();
                break;
            case 'approval':
                void sendAssistanceToApprovalFromModal();
                break;
            case 'approve':
                void approveAssistanceFromModal();
                break;
            case 'separated':
                void markAssistanceSeparatedFromModal();
                break;
            case 'scheduled':
                void markAssistanceScheduledFromModal();
                break;
            case 'execution':
                void markAssistanceExecutionFromModal();
                break;
            case 'finished':
                void markAssistanceFinishedFromModal();
                break;
            default:
                break;
        }
    });

    document.getElementById('btn-assistance-client-picker')?.addEventListener('click', () => {
        if (typeof openClientePickerModal !== 'function') return;
        openClientePickerModal(client => setAssistanceClient(client));
    });
    document.getElementById('assistance-client-name')?.addEventListener('click', () => {
        document.getElementById('btn-assistance-client-picker')?.click();
    });

    document.getElementById('btn-assistance-order-picker')?.addEventListener('click', () => {
        if (typeof openOrderCodePicker !== 'function') return;
        openOrderCodePicker({
            clientInputId: 'assistance-client-name',
            onSelect: order => applyAssistanceOrder(order)
        });
    });
    document.getElementById('btn-assistance-order-clear')?.addEventListener('click', () => {
        clearAssistanceOrder(false);
    });

    const openAddressPicker = () => {
        const button = document.getElementById('btn-assistance-addr-picker');
        if (button?.disabled) return;
        if (typeof openAssistanceAddrPicker === 'function') openAssistanceAddrPicker();
    };
    document.getElementById('btn-assistance-addr-picker')?.addEventListener('click', openAddressPicker);
    document.getElementById('assistance-addr')?.addEventListener('click', openAddressPicker);
    document.getElementById('btn-assistance-quote-select')?.addEventListener('click', () => {
        document.getElementById('assistance-quote-file')?.click();
    });
    document.getElementById('assistance-quote-file')?.addEventListener('change', syncAssistanceQuoteUploadButton);
    document.getElementById('btn-assistance-quote-upload')?.addEventListener('click', uploadAssistanceQuoteFromForm);
    document.getElementById('btn-assistance-quote-view')?.addEventListener('click', openAssistanceQuotePdfInBrowser);

    document.getElementById('btn-assistance-purchase-requests')?.addEventListener('click', () => {
        void openAssistancePurchaseRequestsModal();
    });
    document.getElementById('btn-assistance-purchase-requests-close')?.addEventListener('click', closeAssistancePurchaseRequestsModal);
    document.getElementById('btn-assistance-purchase-requests-close-footer')?.addEventListener('click', closeAssistancePurchaseRequestsModal);
    document.getElementById('btn-assistance-purchase-requests-create')?.addEventListener('click', () => {
        void handleAssistanceCreatePurchaseRequest();
    });
    document.getElementById('assistance-purchase-requests-mount')?.addEventListener('click', handleAssistancePurchaseRequestViewClick);
    document.getElementById('btn-assistance-purchase-request-close')?.addEventListener('click', closeAssistancePurchaseRequestFormModal);
    document.getElementById('btn-assistance-close')?.addEventListener('click', () => {
        toggleModal('assistance-modal', false);
    });
    document.getElementById('btn-assistance-cancel-request')?.addEventListener('click', () => {
        void cancelAssistanceRequest(assistanceEditingRecord);
    });
    document.getElementById('assistance-form')?.addEventListener('submit', saveAssistanceRequest);
}

window.getAssistanceFormClient = getAssistanceFormClient;
window.setAssistanceSelectedAddr = setAssistanceSelectedAddr;
window.assistanceAddressIsLocked = assistanceAddressIsLocked;
window.loadAssistanceRequests = loadAssistanceRequests;
window.openAssistanceForm = openAssistanceForm;
window.openAssistanceStatusHistoryModal = openAssistanceStatusHistoryModal;
window.sendAssistanceToApproval = sendAssistanceToApproval;
window.approveAssistanceRequest = approveAssistanceRequest;
window.sendAssistanceToAwaitingScheduling = sendAssistanceToAwaitingScheduling;
window.markAssistanceSeparated = markAssistanceSeparated;
window.markAssistanceScheduled = markAssistanceScheduled;
window.markAssistanceExecution = markAssistanceExecution;
window.markAssistanceFinished = markAssistanceFinished;
window.cancelAssistanceRequest = cancelAssistanceRequest;
window.bindAssistanceEvents = bindAssistanceEvents;
window.openAssistancePurchaseRequestsModal = openAssistancePurchaseRequestsModal;
window.openAssistancePurchaseRequestFormModal = openAssistancePurchaseRequestFormModal;
