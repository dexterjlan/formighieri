const PART_REQUEST_STATUS_OPEN = 'Open';
const PART_REQUEST_STATUS_MANUFACTURING = 'Manufacturing';
const PART_REQUEST_STATUS_QUALITY = 'Quality';
const PART_REQUEST_STATUS_SHIPPING = 'Shipping';
const PART_REQUEST_STATUS_DELIVERED = 'Delivered';

const PART_REQUEST_STATUS_FLOW = [
    PART_REQUEST_STATUS_OPEN,
    PART_REQUEST_STATUS_MANUFACTURING,
    PART_REQUEST_STATUS_QUALITY,
    PART_REQUEST_STATUS_SHIPPING,
    PART_REQUEST_STATUS_DELIVERED
];

const PART_REQUEST_STATUSES = [
    { value: PART_REQUEST_STATUS_OPEN, label: 'Aberto' },
    { value: PART_REQUEST_STATUS_MANUFACTURING, label: 'Fabricando' },
    { value: PART_REQUEST_STATUS_QUALITY, label: 'Qualidade' },
    { value: PART_REQUEST_STATUS_SHIPPING, label: 'Expedição' },
    { value: PART_REQUEST_STATUS_DELIVERED, label: 'Entregue' },
    { value: 'Submitted', label: 'Fabricando' }
];

const PART_REQUEST_STATUS_BADGE = {
    Open: 'bg-slate-100 text-slate-700',
    Manufacturing: 'bg-amber-100 text-amber-800',
    Quality: 'bg-violet-100 text-violet-800',
    Shipping: 'bg-sky-100 text-sky-800',
    Delivered: 'bg-emerald-100 text-emerald-800',
    Submitted: 'bg-amber-100 text-amber-800'
};

const PART_REQUEST_STATUS_HISTORY_CHANGED_BY_EMBED =
    'changedBy:appUsers!PartRequestStatusHistory_changedById_fkey(id, name)';

const PART_REQUEST_SELECT = `
    id, pieceName, description, thicknessMm, material, drawingJson, status,
    factoryEmployeeId, montadorId, deliveryDueDate, orderProjectId,
    clientId, orderId, createdAt, updatedAt, createdById,
    client:Client(id, name),
    order:salesOrders(id, orderCode),
    orderProject:OrderProject(id, name, projectCode, cabinetMakerId, cabinetMaker:CabinetMaker(id, name)),
    factoryEmployee:FactoryEmployee(id, name, factoryRole:FactoryRole(id, name)),
    montador:Installer(id, name),
    createdBy:appUsers!PartRequest_createdById_fkey(id, name)
`;

const PART_REQUEST_SELECT_FALLBACK = `
    id, pieceName, description, thicknessMm, material, drawingJson, status,
    factoryEmployeeId, cabinetMakerId, montadorId, deliveryDueDate,
    clientId, orderId, createdAt, updatedAt, createdById,
    client:Client(id, name),
    order:salesOrders(id, orderCode),
    cabinetMaker:CabinetMaker(id, name)
`;

const REQUISICOES_PART_REQUEST_TABLE_ID = 'requisicoes-part-request';

let partRequestsCache = [];
let partRequestEditingId = null;
let partRequestEditingRecord = null;
let partRequestOrderProjectsCache = [];
let partRequestEventsBound = false;
let partRequestModalLayoutBound = false;
let partRequestListLayoutBound = false;
const partRequestModalOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('part-request-modal', {
        closeButtonSelector: '#btn-part-request-close'
    })
    : null;

function partRequestSqlHint() {
    return 'Execute os scripts de PartRequest em supabase/feats/ (ver PENDING-PROD-SQL.md) no Supabase SQL Editor (DEV).';
}

function getPartRequestProjectOptionLabel(project) {
    const name = String(project?.name || '').trim() || 'Projeto';
    const code = String(project?.projectCode || '').trim();
    return code ? `${code} — ${name}` : name;
}

function filterPartRequestSelectableOrderProjects(projects = []) {
    return (projects || []).filter(project => {
        if (typeof isOrderProjectGroupedChild === 'function' && isOrderProjectGroupedChild(project)) {
            return false;
        }
        if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) {
            return false;
        }
        return true;
    });
}

function getPartRequestProjectCabinetMakerName(project) {
    if (!project) return '';
    return String(project.cabinetMaker?.name || '').trim();
}

async function fetchPartRequestOrderProjects(orderId) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return [];

    let result = await supabaseClient
        .from('OrderProject')
        .select('id, name, projectCode, cabinetMakerId, parentProjectId, replacedByProjectId, cabinetMaker:CabinetMaker(id, name)')
        .eq('orderId', normalizedOrderId)
        .order('name', { ascending: true });

    if (result.error?.message?.match(/cabinetMaker|relationship|schema cache/i)) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, name, projectCode, cabinetMakerId, parentProjectId, replacedByProjectId')
            .eq('orderId', normalizedOrderId)
            .order('name', { ascending: true });
    }

    if (result.error) {
        console.error('fetchPartRequestOrderProjects:', result.error);
        return [];
    }

    const rows = result.data || [];
    if (typeof enrichOrderProjectsForList === 'function') {
        return filterPartRequestSelectableOrderProjects(await enrichOrderProjectsForList(rows));
    }
    return filterPartRequestSelectableOrderProjects(rows);
}

function clearPartRequestOrderProjectUi() {
    partRequestOrderProjectsCache = [];
    const wrap = document.getElementById('part-request-order-project-wrap');
    const select = document.getElementById('part-request-order-project-id');
    const makerWrap = document.getElementById('part-request-project-cabinet-maker-wrap');
    const makerName = document.getElementById('part-request-project-cabinet-maker-name');
    if (wrap) wrap.classList.add('hidden');
    if (select) {
        select.innerHTML = '<option value="">Selecione…</option>';
        select.value = '';
        select.disabled = false;
    }
    if (makerWrap) makerWrap.classList.add('hidden');
    if (makerName) makerName.textContent = '';
}

function syncPartRequestProjectCabinetMakerDisplay(project) {
    const makerWrap = document.getElementById('part-request-project-cabinet-maker-wrap');
    const makerName = document.getElementById('part-request-project-cabinet-maker-name');
    if (!makerWrap || !makerName) return;

    const label = getPartRequestProjectCabinetMakerName(project);
    if (!label) {
        makerWrap.classList.add('hidden');
        makerName.textContent = '';
        return;
    }
    makerName.textContent = label;
    makerWrap.classList.remove('hidden');
}

function syncPartRequestOrderProjectSelection(selectedProjectId = null) {
    const select = document.getElementById('part-request-order-project-id');
    if (!select) return;
    const normalized = selectedProjectId != null ? Number(selectedProjectId) : Number(select.value);
    if (normalized) {
        select.value = String(normalized);
    }
    const project = partRequestOrderProjectsCache.find(item => Number(item.id) === normalized) || null;
    syncPartRequestProjectCabinetMakerDisplay(project);
}

async function refreshPartRequestOrderProjects(orderId, selectedProjectId = null) {
    const wrap = document.getElementById('part-request-order-project-wrap');
    const select = document.getElementById('part-request-order-project-id');
    if (!wrap || !select) return;

    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) {
        clearPartRequestOrderProjectUi();
        return;
    }

    partRequestOrderProjectsCache = await fetchPartRequestOrderProjects(normalizedOrderId);

    if (!partRequestOrderProjectsCache.length) {
        wrap.classList.remove('hidden');
        select.innerHTML = '<option value="">Nenhum projeto neste pedido</option>';
        select.value = '';
        select.disabled = true;
        syncPartRequestProjectCabinetMakerDisplay(null);
        return;
    }

    const options = partRequestOrderProjectsCache.map(project => {
        const selected = selectedProjectId != null && Number(project.id) === Number(selectedProjectId);
        return `<option value="${project.id}"${selected ? ' selected' : ''}>${escapeHtml(getPartRequestProjectOptionLabel(project))}</option>`;
    }).join('');

    select.innerHTML = `<option value="">Selecione…</option>${options}`;
    wrap.classList.remove('hidden');
    select.disabled = false;

    const normalizedSelected = selectedProjectId != null
        ? Number(selectedProjectId)
        : (Number(select.value) || null);
    if (normalizedSelected) {
        select.value = String(normalizedSelected);
    }
    syncPartRequestOrderProjectSelection(normalizedSelected);
}

function getPartRequestOrderProjectLabelFromRecord(record = partRequestEditingRecord) {
    if (!record?.orderProject) return '';
    return getPartRequestProjectOptionLabel(record.orderProject);
}

function getPartRequestProjectCabinetMakerNameFromRecord(record = partRequestEditingRecord) {
    if (!record) return '';
    if (record.orderProject) {
        const fromProject = getPartRequestProjectCabinetMakerName(record.orderProject);
        if (fromProject) return fromProject;
    }
    const selectedId = Number(document.getElementById('part-request-order-project-id')?.value);
    if (selectedId) {
        const project = partRequestOrderProjectsCache.find(item => Number(item.id) === selectedId);
        return getPartRequestProjectCabinetMakerName(project);
    }
    return '';
}

function toPartRequestDateInputValue(dateStr) {
    if (!dateStr) return '';
    const raw = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

function fromPartRequestDateInputValue(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    return trimmed;
}

function formatPartRequestDeliveryDueLabel(deliveryDueDate) {
    const raw = fromPartRequestDateInputValue(toPartRequestDateInputValue(deliveryDueDate));
    if (!raw) return '—';
    if (typeof formatDate === 'function') {
        return formatDate(`${raw}T12:00:00`);
    }
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
}

function getPartRequestStatusLabel(status) {
    const normalized = status === 'Submitted' ? PART_REQUEST_STATUS_MANUFACTURING : status;
    return PART_REQUEST_STATUSES.find(row => row.value === normalized || row.value === status)?.label || status || '—';
}

function canActPartRequestWorkflow(user = currentUser) {
    return typeof canAccessRequisicoesPartRequest === 'function' && canAccessRequisicoesPartRequest(user);
}

function normalizePartRequestStatus(status) {
    if (status === 'Submitted') return PART_REQUEST_STATUS_MANUFACTURING;
    return status || PART_REQUEST_STATUS_OPEN;
}

function getPartRequestForwardStatus(status) {
    const normalized = normalizePartRequestStatus(status);
    const index = PART_REQUEST_STATUS_FLOW.indexOf(normalized);
    if (index < 0 || index >= PART_REQUEST_STATUS_FLOW.length - 1) return null;
    return PART_REQUEST_STATUS_FLOW[index + 1];
}

function getPartRequestBackwardStatus(status) {
    const normalized = normalizePartRequestStatus(status);
    if (normalized === PART_REQUEST_STATUS_QUALITY) return PART_REQUEST_STATUS_MANUFACTURING;
    return null;
}

function isPartRequestModalOpenFor(record) {
    if (!record?.id) return false;
    const modalEl = document.getElementById('part-request-modal');
    if (!modalEl || modalEl.classList.contains('hidden')) return false;
    return Number(partRequestEditingId) === Number(record.id);
}

function getPartRequestFactoryEmployeeId(record = partRequestEditingRecord) {
    if (isPartRequestModalOpenFor(record)) {
        const raw = document.getElementById('part-request-executor-id')?.value?.trim() || '';
        if (raw) return Number(raw);
    }
    const persisted = record?.factoryEmployeeId ?? record?.factoryEmployee?.id;
    return persisted ? Number(persisted) : null;
}

function getPartRequestExecutorDisplayName(record = partRequestEditingRecord) {
    if (typeof getFactoryEmployeeNameFromRecord === 'function') {
        return getFactoryEmployeeNameFromRecord(record);
    }
    return record?.factoryEmployee?.name || record?.cabinetMaker?.name || '—';
}

function getPartRequestMontadorId(record = partRequestEditingRecord) {
    if (isPartRequestModalOpenFor(record)) {
        const raw = document.getElementById('part-request-montador-id')?.value?.trim() || '';
        if (raw) return Number(raw);
    }
    const persisted = record?.montadorId ?? record?.montador?.id;
    return persisted ? Number(persisted) : null;
}

function partRequestNeedsExecutorForTransition(record, targetStatus) {
    return targetStatus === PART_REQUEST_STATUS_MANUFACTURING
        && normalizePartRequestStatus(record?.status) === PART_REQUEST_STATUS_OPEN;
}

function canTransitionPartRequestToStatus(record, targetStatus) {
    if (partRequestNeedsExecutorForTransition(record, targetStatus)) {
        return Boolean(getPartRequestFactoryEmployeeId(record));
    }
    return true;
}

function canEditPartRequestExecutor(record = partRequestEditingRecord) {
    if (!canActPartRequestWorkflow()) return false;
    const status = normalizePartRequestStatus(record?.status);
    return status !== PART_REQUEST_STATUS_DELIVERED;
}

function canEditPartRequestMetadata(record = partRequestEditingRecord) {
    if (!record?.id) return true;
    return canEditPartRequestDrawing(record);
}

function renderPartRequestStatusBadge(status) {
    const label = getPartRequestStatusLabel(status);
    const normalized = status === 'Submitted' ? PART_REQUEST_STATUS_MANUFACTURING : status;
    const badgeClass = PART_REQUEST_STATUS_BADGE[normalized] || PART_REQUEST_STATUS_BADGE[status] || 'bg-slate-100 text-slate-700';
    return `<span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${badgeClass}">${escapeHtml(label)}</span>`;
}

function renderPartRequestStatusTransitionButton(record, targetStatus, { back = false } = {}) {
    if (!record?.id || !targetStatus) return '';
    const label = back
        ? `Voltar para ${getPartRequestStatusLabel(targetStatus)}`
        : getPartRequestStatusLabel(targetStatus);
    const blocked = !canTransitionPartRequestToStatus(record, targetStatus);
    const className = back
        ? 'part-request-status-back-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
        : 'part-request-status-forward-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-indigo-100 text-indigo-800 hover:bg-indigo-200';
    const stateClass = blocked ? ' opacity-50 cursor-not-allowed' : '';
    const titleAttr = blocked && partRequestNeedsExecutorForTransition(record, targetStatus)
        ? ' title="Selecione um executor"'
        : '';
    return `<button type="button" class="${className}${stateClass}"${titleAttr}${blocked ? ' disabled' : ''} data-part-request-id="${record.id}" data-part-request-target-status="${escapeHtml(targetStatus)}">${escapeHtml(label)}</button>`;
}

function renderPartRequestListStatusButtons(record) {
    if (!canActPartRequestWorkflow() || !record?.id) return '';
    const forward = getPartRequestForwardStatus(record.status);
    const back = getPartRequestBackwardStatus(record.status);
    const parts = [];
    if (forward) parts.push(renderPartRequestStatusTransitionButton(record, forward));
    if (back) parts.push(renderPartRequestStatusTransitionButton(record, back, { back: true }));
    return parts.join('');
}

function renderPartRequestModalStatusActions(record = partRequestEditingRecord) {
    const host = document.getElementById('part-request-status-actions');
    if (!host) return;
    if (!record?.id || !canActPartRequestWorkflow()) {
        host.innerHTML = '';
        return;
    }
    host.innerHTML = renderPartRequestListStatusButtons(record);
}

async function ensurePartRequestExecutorOptions(selectedId = null) {
    const select = document.getElementById('part-request-executor-id');
    if (!select) return;
    const normalizedSelected = selectedId ?? getPartRequestFactoryEmployeeId(partRequestEditingRecord);
    const canEdit = canEditPartRequestExecutor(partRequestEditingRecord);
    // Lista completa de funcionários da fábrica (todas as funções), não só marceneiros.
    await loadFactoryEmployees(false);
    select.innerHTML = typeof getFactoryEmployeeOptionsHtml === 'function'
        ? getFactoryEmployeeOptionsHtml(normalizedSelected, {
            activeOnly: canEdit,
            includeInactiveSelected: true
        })
        : '<option value="">Selecione…</option>';
    if (normalizedSelected) select.value = String(normalizedSelected);
    select.disabled = !canEditPartRequestExecutor(partRequestEditingRecord);
}

async function ensurePartRequestMontadorOptions(selectedId = null) {
    const select = document.getElementById('part-request-montador-id');
    if (!select) return;
    const montadores = typeof loadGestaoMontadores === 'function'
        ? await loadGestaoMontadores(true)
        : (typeof getGestaoActiveMontadores === 'function' ? getGestaoActiveMontadores() : []);
    const rows = (montadores || []).filter(item => item.isActive !== false);
    const options = rows.map(item => (
        `<option value="${item.id}">${escapeHtml(item.name || '')}</option>`
    )).join('');
    select.innerHTML = `<option value="">Selecione…</option>${options}`;
    const normalizedId = selectedId ?? getPartRequestMontadorId(partRequestEditingRecord);
    select.value = normalizedId ? String(normalizedId) : '';
    select.disabled = !canEditPartRequestMontador(partRequestEditingRecord);
}

function canEditPartRequestMontador(record = partRequestEditingRecord) {
    if (!canActPartRequestWorkflow()) return canEditPartRequestMetadata(record);
    const status = normalizePartRequestStatus(record?.status);
    if (status === PART_REQUEST_STATUS_OPEN && canEditPartRequestMetadata(record)) return true;
    return canEditPartRequestExecutor(record);
}

function syncPartRequestExecutorField(record = partRequestEditingRecord) {
    const select = document.getElementById('part-request-executor-id');
    if (!select) return;
    const selectedId = record?.factoryEmployeeId || record?.factoryEmployee?.id || '';
    select.value = selectedId ? String(selectedId) : '';
    select.disabled = !canEditPartRequestExecutor(record);
}

function syncPartRequestMontadorField(record = partRequestEditingRecord) {
    const select = document.getElementById('part-request-montador-id');
    if (!select) return;
    const selectedId = record?.montadorId || record?.montador?.id || '';
    select.value = selectedId ? String(selectedId) : '';
    select.disabled = !canEditPartRequestMontador(record);
}

function syncPartRequestDeliveryDueField(record = partRequestEditingRecord) {
    const input = document.getElementById('part-request-delivery-due-date');
    if (!input) return;
    input.value = toPartRequestDateInputValue(record?.deliveryDueDate);
    const editable = !record || canEditPartRequestMetadata(record);
    input.disabled = !editable;
    input.readOnly = !editable;
}

function syncPartRequestModalChrome(record = partRequestEditingRecord) {
    const status = record?.status || PART_REQUEST_STATUS_OPEN;
    document.getElementById('part-request-status-label').innerHTML = renderPartRequestStatusBadge(status);
    renderPartRequestModalStatusActions(record);
    const historyBtn = document.getElementById('btn-part-request-status-history');
    if (historyBtn) {
        historyBtn.classList.toggle('hidden', !record?.id);
    }
    const saveBtn = document.getElementById('btn-part-request-save');
    const canFullEdit = canEditPartRequestMetadata(record);
    const canExecutor = canEditPartRequestExecutor(record);
    const canMontador = canEditPartRequestMontador(record);
    if (saveBtn) {
        saveBtn.classList.toggle('hidden', !canFullEdit && !canExecutor && !canMontador);
        saveBtn.textContent = canFullEdit ? 'Salvar' : 'Salvar atribuições';
    }
    syncPartRequestExecutorField(record);
    syncPartRequestMontadorField(record);
    syncPartRequestDeliveryDueField(record);
}

async function fetchPartRequestStatusHistory(partRequestId) {
    const normalizedId = Number(partRequestId);
    if (!normalizedId) return [];

    const { data, error } = await supabaseClient
        .from('PartRequestStatusHistory')
        .select(`
            id,
            partRequestId,
            previousStatus,
            newStatus,
            changedAt,
            changedById,
            previousStatusDurationSeconds,
            observation,
            ${PART_REQUEST_STATUS_HISTORY_CHANGED_BY_EMBED}
        `)
        .eq('partRequestId', normalizedId)
        .order('changedAt', { ascending: true });

    if (error) {
        if (error.message?.includes('PartRequestStatusHistory')) {
            throw new Error('Execute supabase/feats/part-request-workflow-status-history.sql no Supabase SQL Editor.');
        }
        throw error;
    }

    return data || [];
}

function adaptPartRequestStatusHistoryEntries(entries = []) {
    return entries.map(entry => ({
        ...entry,
        previousStatusId: entry.previousStatus ? 1 : null,
        newStatus: { name: getPartRequestStatusLabel(entry.newStatus) },
        previousStatus: entry.previousStatus
            ? { name: getPartRequestStatusLabel(entry.previousStatus) }
            : null
    }));
}

function resolvePartRequestPrintId(record = null) {
    const raw = record?.id ?? partRequestEditingId ?? partRequestEditingRecord?.id;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function buildPartRequestStatusHistorySubtitle(record = partRequestEditingRecord) {
    const requestId = Number(record?.id || partRequestEditingId);
    const pieceName = String(record?.pieceName || '').trim() || '—';
    const orderCode = record?.order?.orderCode || '';
    const orderPart = orderCode ? ` · Pedido ${orderCode}` : '';
    return `Peça #${requestId || '—'} · ${pieceName}${orderPart}`;
}

function raiseProjectStatusHistoryModalAboveOpenModals() {
    const historyModal = document.getElementById('order-project-status-history-modal');
    if (!historyModal) return;
    let maxZ = 50;
    document.querySelectorAll('body .fixed.inset-0').forEach(el => {
        if (el === historyModal || el.classList.contains('hidden')) return;
        const z = Number.parseInt(window.getComputedStyle(el).zIndex, 10);
        if (Number.isFinite(z) && z > maxZ) maxZ = z;
    });
    historyModal.style.zIndex = String(maxZ + 1);
}

function resetProjectStatusHistoryModalZIndex() {
    const historyModal = document.getElementById('order-project-status-history-modal');
    if (historyModal) historyModal.style.zIndex = '';
}

async function openPartRequestStatusHistoryModal(record = partRequestEditingRecord) {
    const partRequestId = Number(record?.id);
    if (!partRequestId) return;

    const subtitle = document.getElementById('project-status-history-subtitle');
    const flow = document.getElementById('project-status-history-flow');
    if (subtitle) subtitle.textContent = buildPartRequestStatusHistorySubtitle(record);
    if (flow) flow.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando histórico...</p>';

    raiseProjectStatusHistoryModalAboveOpenModals();
    toggleModal('order-project-status-history-modal', true);
    if (flow) flow.innerHTML = '';

    try {
        const entries = adaptPartRequestStatusHistoryEntries(
            await fetchPartRequestStatusHistory(partRequestId)
        );
        if (typeof setProjectStatusHistoryContent === 'function') {
            setProjectStatusHistoryContent('project-status-history-flow', entries, 'flow');
        } else if (flow) {
            flow.innerHTML = '<p class="text-xs text-slate-500">Histórico indisponível.</p>';
        }
    } catch (error) {
        if (flow) {
            flow.innerHTML = `<p class="text-xs text-rose-700">${escapeHtml(error.message || 'Erro ao carregar histórico.')}</p>`;
        }
    }
}

async function updatePartRequestStatus(id, status, extraFields = {}) {
    const normalizedId = Number(id);
    if (!normalizedId) return;
    const now = new Date().toISOString();
    const payload = {
        status,
        updatedAt: now,
        updatedById: currentUser?.id || null,
        ...extraFields
    };
    const { error } = await supabaseClient
        .from('PartRequest')
        .update(payload)
        .eq('id', normalizedId);
    if (error) throw error;
}

async function transitionPartRequestStatus(record, targetStatus) {
    if (!record?.id || !targetStatus) return;
    if (!canActPartRequestWorkflow()) {
        alertAppDialog('Você não pode alterar o status desta peça.');
        return;
    }
    const current = normalizePartRequestStatus(record.status);
    const forward = getPartRequestForwardStatus(current);
    const back = getPartRequestBackwardStatus(current);
    const allowed = targetStatus === forward || targetStatus === back;
    if (!allowed) {
        alertAppDialog('Transição de status não permitida.');
        return;
    }
    if (!canTransitionPartRequestToStatus(record, targetStatus)) {
        alertAppDialog('Selecione um executor antes de marcar como Fabricando.');
        return;
    }
    const confirmMessage = targetStatus === back
        ? `Voltar esta peça para ${getPartRequestStatusLabel(targetStatus)}?`
        : `Marcar como ${getPartRequestStatusLabel(targetStatus)}?`;
    if (!(await confirmAppDialog(confirmMessage, { title: 'Status da peça' }))) return;

    const modalEl = document.getElementById('part-request-modal');
    const modalOpen = modalEl && !modalEl.classList.contains('hidden');

    const extraFields = {};
    const factoryEmployeeId = getPartRequestFactoryEmployeeId(record);
    if (factoryEmployeeId && (!record.factoryEmployeeId || Number(record.factoryEmployeeId) !== factoryEmployeeId)) {
        extraFields.factoryEmployeeId = factoryEmployeeId;
    }

    try {
        if (modalOpen) setPartRequestModalLoading(true, 'Atualizando status...');
        await updatePartRequestStatus(record.id, targetStatus, extraFields);
        if (modalOpen) {
            setPartRequestModalLoading(true, 'Atualizado!', 'success');
            await new Promise(resolve => setTimeout(resolve, 400));
            setPartRequestModalLoading(false);
            if (typeof partRequestDrawioDispose === 'function') partRequestDrawioDispose();
            toggleModal('part-request-modal', false);
        }
        await loadPartRequests({ silent: true });
    } catch (error) {
        if (modalOpen) setPartRequestModalLoading(false);
        const missing = /PartRequestStatusHistory|PartRequest_status_check|schema cache/i.test(error.message || '');
        alertAppDialog(missing ? `${error.message}. ${partRequestSqlHint()}` : `Erro ao atualizar status: ${error.message}`);
    }
}

function isPartRequestOwner(record = partRequestEditingRecord) {
    if (!record?.id) return true;
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    const ownerId = Number(record.createdById ?? record.createdBy?.id);
    const userId = Number(currentUser?.id);
    if (!ownerId || !userId) return false;
    return ownerId === userId;
}

function canEditPartRequestDrawing(record = partRequestEditingRecord) {
    const status = record?.status || PART_REQUEST_STATUS_OPEN;
    if (status !== PART_REQUEST_STATUS_OPEN) return false;
    return isPartRequestOwner(record);
}

function setPartRequestModalLoading(active, message = 'Processando...', status = 'loading') {
    partRequestModalOverlay?.setLoading(active, message, status);
}

function bumpPartRequestModalLayout() {
    const modal = document.getElementById('part-request-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    window.dispatchEvent(new Event('resize'));
}

function bindPartRequestModalLayoutWatch() {
    if (partRequestModalLayoutBound) return;
    partRequestModalLayoutBound = true;
    window.addEventListener('orientationchange', () => {
        window.setTimeout(bumpPartRequestModalLayout, 120);
    });
}

function mapPartRequestInteractiveRow(record) {
    return {
        id: record?.id,
        record,
        pieceName: String(record?.pieceName || '').trim() || '—',
        description: String(record?.description || '').trim(),
        thicknessLabel: record?.thicknessMm != null ? `${record.thicknessMm} mm` : '—',
        material: String(record?.material || '').trim() || '—',
        orderCode: record?.order?.orderCode || '—',
        clientName: record?.client?.name || '—',
        executorName: getPartRequestExecutorDisplayName(record),
        montadorName: record?.montador?.name || '—',
        deliveryDueLabel: formatPartRequestDeliveryDueLabel(record?.deliveryDueDate),
        status: record?.status || '',
        statusLabel: getPartRequestStatusLabel(record?.status),
        createdAt: record?.createdAt || null,
        createdLabel: typeof formatDateTime === 'function'
            ? formatDateTime(record?.createdAt)
            : (typeof formatDate === 'function' ? formatDate(record?.createdAt) : '—')
    };
}

function getRequisicoesPartRequestColumns() {
    const actionColumn = typeof getPendenciasInteractiveActionColumn === 'function'
        ? getPendenciasInteractiveActionColumn
        : (options) => ({
            key: 'action',
            label: options.label || 'Ação',
            type: 'action',
            align: options.align || 'right',
            render: options.render
        });

    return [
        { key: 'pieceName', label: 'Peça', cellClass: 'p-3 text-xs font-medium text-slate-900' },
        {
            key: 'orderCode',
            label: 'Pedido',
            thClass: 'w-[4.75rem] max-w-[4.75rem]',
            cellClass: 'p-3 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap w-[4.75rem] max-w-[4.75rem]'
        },
        { key: 'clientName', label: 'Cliente', cellClass: 'p-3 text-xs text-slate-700' },
        {
            key: 'deliveryDueLabel',
            label: 'Prazo entrega',
            sortKey: 'deliveryDueDate',
            cellClass: 'p-3 text-xs text-slate-600 whitespace-nowrap'
        },
        { key: 'montadorName', label: 'Montador', cellClass: 'p-3 text-xs text-slate-600' },
        { key: 'executorName', label: 'Executor', cellClass: 'p-3 text-xs text-slate-600' },
        {
            key: 'statusLabel',
            label: 'Status',
            sortKey: 'status',
            cellClass: 'p-3',
            render: row => renderPartRequestStatusBadge(row.status)
        },
        {
            key: 'createdLabel',
            label: 'Criado',
            sortKey: 'createdAt',
            cellClass: 'p-3 text-xs text-slate-600 whitespace-nowrap'
        },
        actionColumn({
            label: 'Ações',
            align: 'left',
            render: row => {
                return `<div class="flex flex-wrap gap-1.5 items-center">
                    <button type="button" class="part-request-edit-btn text-[11px] font-medium text-indigo-700 hover:text-indigo-900" data-part-request-id="${row.id}">Abrir</button>
                    <button type="button" class="part-request-print-list-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200" data-part-request-id="${row.id}">Imprimir</button>
                </div>`;
            }
        })
    ];
}

function shouldUseRequisicoesPartRequestMobileLayout() {
    if (typeof isMobileViewport === 'function' && isMobileViewport()) return true;
    if (typeof isTabletTouchViewport === 'function' && isTabletTouchViewport()) return true;
    return false;
}

function partRequestRowMatchesMobileSearch(row, queryNorm) {
    if (!queryNorm) return true;
    const haystack = typeof normalizeProgramacoesMobileSearchText === 'function'
        ? normalizeProgramacoesMobileSearchText([
            row.pieceName,
            row.orderCode,
            row.clientName,
            row.executorName,
            row.montadorName,
            row.material,
            row.thicknessLabel,
            row.deliveryDueLabel,
            row.statusLabel,
            row.id
        ].join(' '))
        : String([
            row.pieceName,
            row.orderCode,
            row.clientName,
            row.statusLabel,
            row.id
        ].join(' ')).toLowerCase();
    return haystack.includes(queryNorm);
}

function renderRequisicoesPartRequestMobileCard(row) {
    const detailFields = [
        typeof renderProgramacoesMobileInlineField === 'function'
            ? renderProgramacoesMobileInlineField('Pedido', row.orderCode)
            : '',
        typeof renderProgramacoesMobileInlineField === 'function'
            ? renderProgramacoesMobileInlineField('Cliente', row.clientName)
            : '',
        typeof renderProgramacoesMobileInlineField === 'function'
            ? renderProgramacoesMobileInlineField('Prazo', row.deliveryDueLabel)
            : '',
        typeof renderProgramacoesMobileInlineField === 'function'
            ? renderProgramacoesMobileInlineField('Executor', row.executorName)
            : '',
        typeof renderProgramacoesMobileInlineField === 'function'
            ? renderProgramacoesMobileInlineField('Montador', row.montadorName)
            : '',
        typeof renderProgramacoesMobileInlineField === 'function'
            ? renderProgramacoesMobileInlineField('Material', row.material)
            : '',
        typeof renderProgramacoesMobileInlineField === 'function'
            ? renderProgramacoesMobileInlineField('Espessura', row.thicknessLabel)
            : ''
    ].join('');

    const createdLine = row.createdLabel && row.createdLabel !== '—'
        ? `<p class="requisicoes-part-request-mobile__created text-[11px] text-slate-400 mt-1">${escapeHtml(row.createdLabel)}</p>`
        : '';

    const actionsHtml = `
        <div class="requisicoes-part-request-mobile__actions">
            <button type="button"
                class="part-request-edit-btn requisicoes-part-request-mobile__btn requisicoes-part-request-mobile__btn--primary"
                data-part-request-id="${Number(row.id)}">Abrir</button>
            <button type="button"
                class="part-request-print-list-btn requisicoes-part-request-mobile__btn"
                data-part-request-id="${Number(row.id)}">Imprimir</button>
        </div>
    `;

    return `
        <article class="programacoes-projects-mobile__card requisicoes-part-request-mobile__card" data-part-request-id="${Number(row.id)}">
            <div class="programacoes-projects-mobile__headline requisicoes-part-request-mobile__headline">
                <p class="programacoes-projects-mobile__order">
                    <span class="font-semibold text-slate-900">${escapeHtml(String(row.pieceName || '—'))}</span>
                    <span class="text-slate-300" aria-hidden="true">·</span>
                    <span class="font-mono text-slate-500">Nº ${escapeHtml(String(row.id || '—'))}</span>
                </p>
                <p class="programacoes-projects-mobile__client">
                    <span class="font-mono">${escapeHtml(String(row.orderCode || '—'))}</span>
                    <span class="text-slate-300" aria-hidden="true"> · </span>
                    ${escapeHtml(String(row.clientName || '—'))}
                </p>
                ${createdLine}
            </div>
            <div class="programacoes-projects-mobile__status">${renderPartRequestStatusBadge(row.status)}</div>
            <div class="programacoes-projects-mobile__details">${detailFields}</div>
            ${actionsHtml}
        </article>
    `;
}

function renderRequisicoesPartRequestMobileScreen(content, options = {}) {
    const rows = (partRequestsCache || []).map(mapPartRequestInteractiveRow);
    const headerActionsHtml = `
        <button type="button" id="btn-part-request-new"
            class="text-xs bg-slate-900 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-slate-800 w-full sm:w-auto justify-center min-h-[2.75rem]">
            Nova solicitação
        </button>
    `;

    if (typeof renderProgramacoesMobileListScreen !== 'function') {
        renderPartRequestScreenDesktop(content, options);
        return;
    }

    renderProgramacoesMobileListScreen(content, {
        screenId: 'requisicoes-peca',
        title: 'Peça',
        subtitle: 'Solicitações de fabricação com desenho draw.io, material e vínculo ao pedido.',
        headerActionsHtml,
        rows,
        emptyMessage: 'Nenhuma solicitação de fabricação de peça.',
        searchPlaceholder: 'Buscar peça, pedido, cliente, executor, status…',
        rowMatchesSearch: partRequestRowMatchesMobileSearch,
        renderCard: renderRequisicoesPartRequestMobileCard,
        onScreenReady(screenContent) {
            screenContent.querySelector('.programacoes-projects-mobile__preview-hint')?.remove();
            if (!options.sqlError) return;
            const shell = screenContent.querySelector('.programacoes-projects-mobile');
            const header = shell?.querySelector('.p-4.border-b');
            if (!header) return;
            const hint = document.createElement('div');
            hint.id = 'part-request-sql-hint';
            hint.className = 'text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2';
            hint.textContent = options.sqlError;
            header.appendChild(hint);
        }
    });
}

function renderPartRequestScreenDesktop(content, options = {}) {
    if (!content) content = document.getElementById('requisicoes-content');
    if (!content) return;

    content.innerHTML = `
        <section class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 class="font-bold text-sm text-slate-900">Peça</h2>
                    <p class="text-xs text-slate-400 mt-0.5">Solicite a fabricação de uma peça avulsa: desenho (draw.io), espessura, material e vínculo ao pedido quando houver.</p>
                </div>
                <button type="button" id="btn-part-request-new" class="text-xs bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800">Nova solicitação</button>
            </div>
            <div id="part-request-sql-hint" class="${options.sqlError ? '' : 'hidden'} text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ${escapeHtml(options.sqlError || '')}
            </div>
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div id="part-request-table-mount" class="p-0"></div>
            </div>
        </section>
    `;

    mountRequisicoesPartRequestTable(document.getElementById('part-request-table-mount'));
}

function mountRequisicoesPartRequestTable(container) {
    if (!container || typeof mountInteractiveTable !== 'function') return;
    mountInteractiveTable(container, {
        tableId: REQUISICOES_PART_REQUEST_TABLE_ID,
        rows: (partRequestsCache || []).map(mapPartRequestInteractiveRow),
        columns: getRequisicoesPartRequestColumns(),
        defaultSort: [],
        emptyMessage: 'Nenhuma solicitação de fabricação de peça.',
        filteredEmptyMessage: 'Nenhum registro com os filtros aplicados.',
        minWidth: '1040px'
    });
}

function renderPartRequestScreen(options = {}) {
    const content = document.getElementById('requisicoes-content');
    if (!content) return;

    if (shouldUseRequisicoesPartRequestMobileLayout()) {
        renderRequisicoesPartRequestMobileScreen(content, options);
        return;
    }

    renderPartRequestScreenDesktop(content, options);
}

function isRequisicoesPartRequestSectionActive() {
    const section = typeof requisicoesActiveSection !== 'undefined'
        ? requisicoesActiveSection
        : '';
    return section === 'parts' || section === 'part';
}

function bindPartRequestListLayoutWatch() {
    if (partRequestListLayoutBound) return;
    partRequestListLayoutBound = true;
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            if (!isRequisicoesPartRequestSectionActive()) return;
            if (typeof renderPartRequestScreen === 'function') {
                renderPartRequestScreen();
            }
        }, 200);
    });
}

function canUsePartRequestScreen() {
    return typeof canAccessRequisicoesPartRequest === 'function' && canAccessRequisicoesPartRequest();
}

async function loadPartRequests(options = {}) {
    if (!canUsePartRequestScreen()) {
        alertAppDialog('Você não tem acesso à solicitação de peça.');
        if (typeof selectRequisicoesSection === 'function') selectRequisicoesSection('projects');
        return;
    }
    const content = document.getElementById('requisicoes-content');
    if (content && !options.silent) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando peças...</p>';
    }

    let result = await supabaseClient
        .from('PartRequest')
        .select(PART_REQUEST_SELECT)
        .order('id', { ascending: false });

    if (result.error && /relationship|embed|appUsers|FactoryEmployee|FactoryRole|CabinetMaker|Installer|OrderProject|factoryEmployeeId|orderProjectId|deliveryDueDate|montadorId|schema cache/i.test(result.error.message || '')) {
        result = await supabaseClient
            .from('PartRequest')
            .select(PART_REQUEST_SELECT_FALLBACK)
            .order('id', { ascending: false });
    }

    if (result.error) {
        partRequestsCache = [];
        const missing = /PartRequest|schema cache|does not exist/i.test(result.error.message || '');
        renderPartRequestScreen({
            sqlError: missing ? `${partRequestSqlHint()} ${result.error.message}` : `Erro: ${result.error.message}`
        });
        return;
    }

    partRequestsCache = result.data || [];
    renderPartRequestScreen();
}

function resetPartRequestForm() {
    partRequestEditingId = null;
    partRequestEditingRecord = null;
    document.getElementById('part-request-form')?.reset();
    const clientId = document.getElementById('part-request-client-id');
    const orderId = document.getElementById('part-request-order-id');
    const orderCode = document.getElementById('part-request-order-code');
    if (clientId) clientId.value = '';
    if (orderId) orderId.value = '';
    if (orderCode) orderCode.value = '';
    document.getElementById('part-request-status-label').innerHTML =
        renderPartRequestStatusBadge(PART_REQUEST_STATUS_OPEN);
    const executorSelect = document.getElementById('part-request-executor-id');
    if (executorSelect) executorSelect.value = '';
    const montadorSelect = document.getElementById('part-request-montador-id');
    if (montadorSelect) montadorSelect.value = '';
    const deliveryInput = document.getElementById('part-request-delivery-due-date');
    if (deliveryInput) deliveryInput.value = '';
    const statusActions = document.getElementById('part-request-status-actions');
    if (statusActions) statusActions.innerHTML = '';
    document.getElementById('btn-part-request-status-history')?.classList.add('hidden');
    clearPartRequestOrderProjectUi();
    syncPartRequestFormReadOnly(false);
}

function syncPartRequestFormReadOnly(readOnly) {
    const ids = [
        'part-request-piece-name',
        'part-request-description',
        'part-request-thickness-mm',
        'part-request-material',
        'btn-part-request-client-picker',
        'btn-part-request-order-picker',
        'btn-part-request-save',
        'btn-part-request-print',
        'part-request-executor-id',
        'part-request-montador-id',
        'part-request-delivery-due-date',
        'part-request-order-project-id'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'BUTTON') {
            el.disabled = readOnly && id !== 'btn-part-request-print';
        } else {
            el.readOnly = readOnly;
            el.disabled = readOnly;
        }
    });
    const drawHost = document.getElementById('part-request-drawio-host');
    if (drawHost) {
        drawHost.classList.toggle('part-request-drawio-host--readonly', readOnly);
    }
    const executorSelect = document.getElementById('part-request-executor-id');
    if (executorSelect && partRequestEditingRecord) {
        executorSelect.disabled = readOnly && !canEditPartRequestExecutor(partRequestEditingRecord);
    }
    const montadorSelect = document.getElementById('part-request-montador-id');
    if (montadorSelect && partRequestEditingRecord) {
        montadorSelect.disabled = readOnly && !canEditPartRequestMontador(partRequestEditingRecord);
    }
    const deliveryInput = document.getElementById('part-request-delivery-due-date');
    if (deliveryInput && partRequestEditingRecord) {
        const metaEditable = canEditPartRequestMetadata(partRequestEditingRecord);
        deliveryInput.disabled = readOnly || !metaEditable;
        deliveryInput.readOnly = readOnly || !metaEditable;
    }
    syncPartRequestModalChrome(partRequestEditingRecord);
}

async function collectPartRequestFormMeta() {
    const pieceName = document.getElementById('part-request-piece-name')?.value.trim() || '';
    const description = document.getElementById('part-request-description')?.value.trim() || '';
    const thicknessRaw = document.getElementById('part-request-thickness-mm')?.value.trim() || '';
    const material = document.getElementById('part-request-material')?.value.trim() || '';
    const clientId = Number(document.getElementById('part-request-client-id')?.value) || null;
    const orderId = Number(document.getElementById('part-request-order-id')?.value) || null;
    const orderProjectRaw = document.getElementById('part-request-order-project-id')?.value || '';
    const orderProjectId = orderProjectRaw ? Number(orderProjectRaw) : null;
    const factoryEmployeeRaw = document.getElementById('part-request-executor-id')?.value || '';
    const factoryEmployeeId = factoryEmployeeRaw ? Number(factoryEmployeeRaw) : null;
    const montadorRaw = document.getElementById('part-request-montador-id')?.value || '';
    const montadorId = montadorRaw ? Number(montadorRaw) : null;
    const deliveryDueDate = fromPartRequestDateInputValue(
        document.getElementById('part-request-delivery-due-date')?.value
    );

    const metadataEditable = !partRequestEditingRecord || canEditPartRequestMetadata(partRequestEditingRecord);
    if (metadataEditable && !pieceName) {
        alertAppDialog('Informe o nome da peça.');
        return null;
    }

    let thicknessMm = null;
    if (metadataEditable && thicknessRaw) {
        thicknessMm = Number(thicknessRaw.replace(',', '.'));
        if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) {
            alertAppDialog('Espessura inválida (use mm).');
            return null;
        }
    }

    const base = {
        pieceName,
        description,
        thicknessMm,
        material: material || null,
        clientId,
        orderId,
        orderProjectId: orderId && Number.isFinite(orderProjectId) ? orderProjectId : null,
        factoryEmployeeId: Number.isFinite(factoryEmployeeId) ? factoryEmployeeId : null,
        montadorId: Number.isFinite(montadorId) ? montadorId : null,
        deliveryDueDate
    };

    if (partRequestEditingRecord && !canEditPartRequestMetadata(partRequestEditingRecord)) {
        return {
            factoryEmployeeId: base.factoryEmployeeId,
            montadorId: base.montadorId
        };
    }

    let drawingJson = null;
    try {
        if (typeof partRequestDrawioGetDocumentPayload !== 'function') {
            throw new Error('Editor draw.io indisponível.');
        }
        drawingJson = await partRequestDrawioGetDocumentPayload();
    } catch (error) {
        alertAppDialog(`Não foi possível exportar o desenho: ${error.message}`);
        return null;
    }

    return { ...base, drawingJson };
}

function setPartRequestClient(client) {
    const nameInput = document.getElementById('part-request-client-name');
    const idInput = document.getElementById('part-request-client-id');
    if (nameInput) nameInput.value = client?.name || '';
    if (idInput) idInput.value = client?.id ? String(client.id) : '';
}

async function applyPartRequestOrder(order, selectedProjectId = null) {
    if (!order) return;
    const orderInput = document.getElementById('part-request-order-code');
    const orderIdInput = document.getElementById('part-request-order-id');
    const previousOrderId = Number(orderIdInput?.value) || null;
    const nextOrderId = order.id ? Number(order.id) : null;
    if (orderInput) orderInput.value = order.orderCode || '';
    if (orderIdInput) orderIdInput.value = nextOrderId ? String(nextOrderId) : '';
    if (order.clientId || order.client) {
        setPartRequestClient({
            id: order.clientId || order.client?.id,
            name: order.client?.name || (typeof getOrderClientName === 'function' ? getOrderClientName(order) : '')
        });
    }
    if (!nextOrderId) {
        clearPartRequestOrderProjectUi();
        return;
    }
    const explicitProjectId = selectedProjectId != null ? Number(selectedProjectId) : null;
    const keepProjectId = explicitProjectId
        ? explicitProjectId
        : (previousOrderId === nextOrderId
            ? Number(document.getElementById('part-request-order-project-id')?.value) || null
            : null);
    await refreshPartRequestOrderProjects(nextOrderId, keepProjectId);
}

async function openPartRequestForm(record = null) {
    if (!canUsePartRequestScreen()) {
        alertAppDialog('Você não tem acesso à solicitação de peça.');
        return;
    }
    resetPartRequestForm();
    const title = document.getElementById('part-request-modal-title');
    if (title) title.textContent = record
        ? 'Editar solicitação de fabricação'
        : 'Solicitação de fabricação — peça com defeito';

    const readOnly = record && !canEditPartRequestDrawing(record);
    await Promise.all([
        ensurePartRequestExecutorOptions(record?.factoryEmployeeId || record?.factoryEmployee?.id),
        ensurePartRequestMontadorOptions(record?.montadorId || record?.montador?.id)
    ]);
    if (record) {
        partRequestEditingId = Number(record.id);
        partRequestEditingRecord = record;
        document.getElementById('part-request-piece-name').value = record.pieceName || '';
        document.getElementById('part-request-description').value = record.description || '';
        if (record.thicknessMm != null) {
            document.getElementById('part-request-thickness-mm').value = String(record.thicknessMm);
        }
        document.getElementById('part-request-material').value = record.material || '';
        syncPartRequestExecutorField(record);
        syncPartRequestMontadorField(record);
        syncPartRequestDeliveryDueField(record);
        if (record.clientId) {
            setPartRequestClient({ id: record.clientId, name: record.client?.name || '' });
        }
        if (record.orderId) {
            await applyPartRequestOrder({
                id: record.orderId,
                orderCode: record.order?.orderCode,
                clientId: record.clientId,
                client: record.client
            }, record.orderProjectId || record.orderProject?.id);
        } else {
            clearPartRequestOrderProjectUi();
        }
    }

    toggleModal('part-request-modal', true);
    syncPartRequestModalChrome(record);

    const xml = typeof partRequestDrawioExtractXmlFromRecord === 'function'
        ? partRequestDrawioExtractXmlFromRecord(record)
        : null;
    const legacyFabric = record?.drawingJson
        && (record.drawingJson.fabric || record.drawingJson.engine === 'fabric');
    if (legacyFabric) {
        alertAppDialog('Desenho antigo (Fabric). Abra em branco ou redesenhe no draw.io.', {
            variant: 'warning',
            title: 'Aviso'
        });
    }

    requestAnimationFrame(() => {
        const ok = typeof partRequestDrawioInit === 'function' && partRequestDrawioInit({
            xml,
            readOnly
        });
        if (!ok) {
            alertAppDialog('Editor draw.io indisponível.', { variant: 'warning', title: 'Aviso' });
            return;
        }
        syncPartRequestFormReadOnly(readOnly);
        bumpPartRequestModalLayout();
        window.setTimeout(bumpPartRequestModalLayout, 200);
    });
}

async function savePartRequest(event) {
    event.preventDefault();
    const canFullEdit = !partRequestEditingRecord || canEditPartRequestMetadata(partRequestEditingRecord);
    const canExecutor = partRequestEditingRecord && canEditPartRequestExecutor(partRequestEditingRecord);
    const canMontador = partRequestEditingRecord && canEditPartRequestMontador(partRequestEditingRecord);
    if (partRequestEditingRecord && !canFullEdit && !canExecutor && !canMontador) {
        alertAppDialog('Esta requisição não pode ser alterada.');
        return;
    }

    const payload = await collectPartRequestFormMeta();
    if (!payload) return;

    const now = new Date().toISOString();
    const userId = currentUser?.id || null;

    try {
        setPartRequestModalLoading(true, 'Salvando...');
        let savedId = partRequestEditingId;

        if (partRequestEditingId) {
            const updatePayload = canFullEdit
                ? { ...payload, updatedAt: now, updatedById: userId }
                : {
                    factoryEmployeeId: payload.factoryEmployeeId,
                    montadorId: payload.montadorId,
                    updatedAt: now,
                    updatedById: userId
                };
            const { error } = await supabaseClient
                .from('PartRequest')
                .update(updatePayload)
                .eq('id', partRequestEditingId);
            if (error) throw error;
        } else {
            const { data: created, error } = await supabaseClient
                .from('PartRequest')
                .insert({
                    ...payload,
                    status: PART_REQUEST_STATUS_OPEN,
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

        setPartRequestModalLoading(true, 'Salvo!', 'success');
        await new Promise(resolve => setTimeout(resolve, 600));
        setPartRequestModalLoading(false);
        if (typeof partRequestDrawioDispose === 'function') partRequestDrawioDispose();
        toggleModal('part-request-modal', false);
        await loadPartRequests({ silent: true });
    } catch (error) {
        setPartRequestModalLoading(false);
        const missing = /PartRequest|factoryEmployeeId|orderProjectId|deliveryDueDate|montadorId|schema cache|does not exist/i.test(error.message || '');
        alertAppDialog(missing ? `${error.message}. ${partRequestSqlHint()}` : `Erro ao salvar: ${error.message}`);
    }
}

function buildPartRequestPrintMeta(record = null) {
    const fromRecord = Boolean(record?.id);
    const meta = {
        requestId: resolvePartRequestPrintId(record),
        pieceName: fromRecord
            ? record.pieceName
            : (document.getElementById('part-request-piece-name')?.value.trim() || ''),
        statusLabel: fromRecord
            ? getPartRequestStatusLabel(record.status)
            : getPartRequestStatusLabel(partRequestEditingRecord?.status || PART_REQUEST_STATUS_OPEN),
        clientName: fromRecord
            ? (record.client?.name || '')
            : (document.getElementById('part-request-client-name')?.value.trim() || ''),
        orderCode: fromRecord
            ? (record.order?.orderCode || '')
            : (document.getElementById('part-request-order-code')?.value.trim() || ''),
        thicknessMm: fromRecord
            ? record.thicknessMm
            : document.getElementById('part-request-thickness-mm')?.value.trim(),
        material: fromRecord
            ? record.material
            : document.getElementById('part-request-material')?.value.trim(),
        description: fromRecord
            ? record.description
            : document.getElementById('part-request-description')?.value.trim(),
        createdLabel: fromRecord && record.createdAt && typeof formatDateTime === 'function'
            ? formatDateTime(record.createdAt)
            : (fromRecord && record.createdAt && typeof formatDate === 'function'
                ? formatDate(record.createdAt)
                : '—'),
        createdByName: fromRecord
            ? (record.createdBy?.name || '—')
            : (currentUser?.name || '—'),
        executorName: fromRecord
            ? getPartRequestExecutorDisplayName(record)
            : '',
        montadorName: fromRecord ? (record.montador?.name || '') : '',
        deliveryDueLabel: fromRecord
            ? formatPartRequestDeliveryDueLabel(record.deliveryDueDate)
            : formatPartRequestDeliveryDueLabel(
                fromPartRequestDateInputValue(document.getElementById('part-request-delivery-due-date')?.value)
            ),
        projectLabel: fromRecord
            ? getPartRequestOrderProjectLabelFromRecord(record)
            : '',
        projectCabinetMakerName: fromRecord
            ? getPartRequestProjectCabinetMakerNameFromRecord(record)
            : ''
    };
    const executorSelect = document.getElementById('part-request-executor-id');
    const executorOption = executorSelect?.selectedOptions?.[0];
    if (!meta.executorName && executorOption?.value) {
        meta.executorName = executorOption.textContent?.trim() || '';
    }
    const montadorSelect = document.getElementById('part-request-montador-id');
    const montadorOption = montadorSelect?.selectedOptions?.[0];
    const projectSelect = document.getElementById('part-request-order-project-id');
    const projectOption = projectSelect?.selectedOptions?.[0];
    if (!meta.projectLabel && projectOption?.value) {
        meta.projectLabel = projectOption.textContent?.trim() || '';
    }
    if (!meta.projectCabinetMakerName) {
        meta.projectCabinetMakerName = getPartRequestProjectCabinetMakerNameFromRecord() || '';
    }
    if (!meta.montadorName && montadorOption?.value) {
        meta.montadorName = montadorOption.textContent?.trim() || '';
    }
    if (!meta.requestId) {
        meta.requestId = resolvePartRequestPrintId(record);
    }
    return meta;
}

async function printPartRequestFromRecord(record) {
    const xml = typeof partRequestDrawioExtractXmlFromRecord === 'function'
        ? partRequestDrawioExtractXmlFromRecord(record)
        : null;
    if (!xml) {
        alertAppDialog('Requisição sem desenho draw.io (ou formato antigo).');
        return;
    }
    await partRequestDrawioPrintWithXml(xml, buildPartRequestPrintMeta(record));
}

async function printPartRequestFromForm() {
    const printRecord = partRequestEditingRecord
        || (partRequestEditingId ? { id: partRequestEditingId } : null);
    const meta = buildPartRequestPrintMeta(printRecord);
    try {
        setPartRequestModalLoading(true, 'Gerando impressão...');
        const png = await partRequestDrawioExportPng();
        printPartRequestDrawingPage(meta, png);
    } catch (error) {
        alertAppDialog(`Erro ao imprimir: ${error.message}`);
    } finally {
        setPartRequestModalLoading(false);
    }
}

function bindPartRequestEvents() {
    if (partRequestEventsBound) return;
    partRequestEventsBound = true;
    bindPartRequestModalLayoutWatch();
    bindPartRequestListLayoutWatch();

    document.getElementById('requisicoes-content')?.addEventListener('click', event => {
        if (event.target.closest('#btn-part-request-new')) {
            openPartRequestForm();
            return;
        }
        const editBtn = event.target.closest('.part-request-edit-btn');
        if (editBtn) {
            const record = partRequestsCache.find(item => Number(item.id) === Number(editBtn.dataset.partRequestId));
            if (record) openPartRequestForm(record);
            return;
        }
        const printBtn = event.target.closest('.part-request-print-list-btn');
        if (printBtn) {
            const record = partRequestsCache.find(item => Number(item.id) === Number(printBtn.dataset.partRequestId));
            if (record) void printPartRequestFromRecord(record);
        }
    });

    document.getElementById('part-request-form')?.addEventListener('submit', savePartRequest);
    document.getElementById('part-request-status-actions')?.addEventListener('click', event => {
        const statusBtn = event.target.closest('.part-request-status-forward-btn, .part-request-status-back-btn');
        if (!statusBtn || !partRequestEditingRecord) return;
        const targetStatus = statusBtn.dataset.partRequestTargetStatus;
        if (targetStatus) void transitionPartRequestStatus(partRequestEditingRecord, targetStatus);
    });
    document.getElementById('btn-part-request-close')?.addEventListener('click', () => {
        if (typeof partRequestDrawioDispose === 'function') partRequestDrawioDispose();
        toggleModal('part-request-modal', false);
    });
    document.getElementById('btn-part-request-print')?.addEventListener('click', () => {
        void printPartRequestFromForm();
    });
    document.getElementById('btn-part-request-status-history')?.addEventListener('click', () => {
        if (partRequestEditingRecord) void openPartRequestStatusHistoryModal(partRequestEditingRecord);
    });
    ['btn-close-project-status-history', 'btn-close-project-status-history-footer'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', resetProjectStatusHistoryModalZIndex);
    });
    document.getElementById('part-request-order-project-id')?.addEventListener('change', () => {
        syncPartRequestOrderProjectSelection();
    });
    document.getElementById('part-request-executor-id')?.addEventListener('change', () => {
        if (partRequestEditingRecord) renderPartRequestModalStatusActions(partRequestEditingRecord);
    });
    document.getElementById('part-request-montador-id')?.addEventListener('change', () => {
        if (partRequestEditingRecord) renderPartRequestModalStatusActions(partRequestEditingRecord);
    });
    document.getElementById('btn-part-request-client-picker')?.addEventListener('click', () => {
        if (typeof openClientePickerModal !== 'function') return;
        openClientePickerModal(client => setPartRequestClient(client));
    });
    document.getElementById('btn-part-request-order-picker')?.addEventListener('click', () => {
        if (typeof openOrderCodePicker !== 'function') return;
        openOrderCodePicker({
            clientInputId: 'part-request-client-name',
            onSelect: order => applyPartRequestOrder(order)
        });
    });

}

window.loadPartRequests = loadPartRequests;
window.openPartRequestForm = openPartRequestForm;
window.bindPartRequestEvents = bindPartRequestEvents;
window.openPartRequestStatusHistoryModal = openPartRequestStatusHistoryModal;
