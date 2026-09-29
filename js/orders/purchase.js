const COMPRA_STATUS_ABERTO = 'Aberto';
const COMPRA_STATUS_FECHADO = 'Fechado';

const COMPRA_TIPO_MATERIAL = 'Material';
const COMPRA_TIPO_FERRAGEM = 'Ferragem';
const COMPRA_TIPO_TINTA = 'Tinta';
const COMPRA_TIPO_TERCEIRO = 'Terceiro';

let activeCompraRecord = null;
let activeCompraThirdPartyDriveFile = null;
let compraStatusesCache = [];
let compraStatusesActiveOnlyCache = true;

async function loadPurchaseStatuses(activeOnly = true, forceReload = false) {
    if (!forceReload && compraStatusesCache.length && activeOnly === compraStatusesActiveOnlyCache) {
        return compraStatusesCache;
    }

    let query = supabaseClient
        .from('PurchaseStatus')
        .select('id, name, sortOrder, isActive, isClosed')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('loadPurchaseStatuses:', error);
        compraStatusesCache = getFallbackCompraStatuses();
        return compraStatusesCache;
    }

    compraStatusesCache = data?.length ? data : getFallbackCompraStatuses();
    compraStatusesActiveOnlyCache = activeOnly;
    return compraStatusesCache;
}

function getFallbackCompraStatuses() {
    return [
        { id: null, name: 'Aberto', sortOrder: 1, isActive: true, isClosed: false },
        { id: null, name: 'Orçado', sortOrder: 2, isActive: true, isClosed: false },
        { id: null, name: 'Aguardando Entrega', sortOrder: 3, isActive: true, isClosed: false },
        { id: null, name: 'Ag. Lib. de Medição - Obra', sortOrder: 4, isActive: true, isClosed: false },
        { id: null, name: 'Ag. Lib. de Medição - Fábrica', sortOrder: 5, isActive: true, isClosed: false },
        { id: null, name: 'Fechado', sortOrder: 6, isActive: true, isClosed: true }
    ];
}

function getDefaultCompraStatusName() {
    const statuses = compraStatusesCache.length
        ? compraStatusesCache
        : getFallbackCompraStatuses();

    const aberto = statuses.find(status => status.name === COMPRA_STATUS_ABERTO && status.isActive !== false);
    if (aberto) return aberto.name;

    const firstActive = statuses.find(status => status.isActive !== false);
    return firstActive?.name || COMPRA_STATUS_ABERTO;
}

function getCompraClosedStatusNames() {
    const statuses = compraStatusesCache.length
        ? compraStatusesCache
        : getFallbackCompraStatuses();

    const closed = statuses
        .filter(status => status.isClosed === true)
        .map(status => status.name);

    return closed.length ? closed : [COMPRA_STATUS_FECHADO];
}

function populateCompraStatusSelect(selectedStatus = '') {
    const select = document.getElementById('compra-modal-status');
    if (!select) return;

    const statuses = compraStatusesCache.length
        ? compraStatusesCache.filter(status => status.isActive !== false)
        : getFallbackCompraStatuses();

    const selected = selectedStatus || getDefaultCompraStatusName();
    select.innerHTML = statuses.map(status => {
        const isSelected = status.name === selected ? 'selected' : '';
        return `<option value="${escapeHtml(status.name)}" ${isSelected}>${escapeHtml(status.name)}</option>`;
    }).join('');

    if (!statuses.some(status => status.name === selected) && selected) {
        select.innerHTML += `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`;
    }
}

async function ensureCompraStatusesLoaded(activeOnly = true) {
    return loadPurchaseStatuses(activeOnly);
}

window.loadPurchaseStatuses = loadPurchaseStatuses;
window.loadCompraStatuses = loadPurchaseStatuses;

function normalizeCompraMotivoLabel(value) {
    return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

function isCompraImplantacaoMotivo(record) {
    const reason = normalizeCompraMotivoLabel(record?.reasonName);
    const type = normalizeCompraMotivoLabel(record?.purchaseType);
    const origin = String(record?.requestOrigin || '').trim();
    return reason === 'implantação'
        || reason === 'implantacao'
        || type === 'implantação'
        || type === 'implantacao'
        || origin === 'implementation';
}

function formatCompraModalTipoLabel(record) {
    const purchaseType = record?.purchaseType;
    if (purchaseType === 'Lista de Material') return COMPRA_TIPO_MATERIAL;
    return purchaseType || '—';
}

function formatCompraTipoLabel(purchaseType, subtypeName = '', sourceType = '') {
    if (purchaseType === 'Implantação') {
        const detail = sourceType && sourceType !== 'Implantação'
            ? formatCompraTipoLabel(sourceType, subtypeName)
            : '';
        return detail && detail !== '—' ? `Implantação — ${detail}` : 'Implantação';
    }
    if (purchaseType === 'Lista de Material') return COMPRA_TIPO_MATERIAL;
    if (purchaseType === COMPRA_TIPO_TERCEIRO && subtypeName) {
        return `Terceiro — ${subtypeName}`;
    }
    return purchaseType || '—';
}

function getCompraPurchaseItemLabel(purchaseItem) {
    if (!purchaseItem) return '—';
    const subtypeName = purchaseItem.thirdPartySubtype?.name || purchaseItem.subtypeName || '';
    return formatCompraTipoLabel(purchaseItem.purchaseType, subtypeName);
}

function getImplantacaoCompraSendItems(purchaseItems = []) {
    return (purchaseItems || []).filter(item => {
        if (!item || item.sentToCommercial) return false;
        if (typeof canSendImplementationPurchaseItem === 'function') {
            return canSendImplementationPurchaseItem(item);
        }
        if (!item.isChecked) return false;
        if (item.purchaseType === COMPRA_TIPO_TERCEIRO) {
            return true;
        }
        return Boolean(item.folderPath);
    });
}

function toCompraDateInputValue(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

function fromCompraDateInputValue(value) {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return new Date(`${trimmed}T12:00:00`).toISOString();
}

async function fetchOrderProjectCodesForCompra(orderProjectId) {
    let result = await supabaseClient
        .from('OrderProject')
        .select('id, projectCode, name, order:salesOrders(orderCode, clientId, consultantUserId, client:Client(name), consultor:appUsers!consultantUserId(name))')
        .eq('id', orderProjectId)
        .maybeSingle();

    if (result.error?.message?.includes('salesOrders')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, projectCode, name, orderId')
            .eq('id', orderProjectId)
            .maybeSingle();

        if (!result.error && result.data?.orderId) {
            const orderResult = await supabaseClient
                .from('salesOrders')
                .select(`orderCode, ${SALES_ORDER_RELATIONS_SELECT}`)
                .eq('id', result.data.orderId)
                .maybeSingle();

            if (!orderResult.error && orderResult.data) {
                result.data.order = orderResult.data;
            }
        }
    }

    if (result.error) throw result.error;

    const orderCode = result.data?.order?.orderCode || '';
    const projectCode = result.data?.projectCode || '';

    if (!orderCode || !projectCode) {
        throw new Error('Não foi possível obter o código do pedido e do projeto.');
    }

    return {
        orderCode,
        projectCode,
        clientName: getOrderClientName(result.data?.order) || '',
        projectName: result.data?.name || '',
        designerName: ''
    };
}

async function fetchOrderProjectDesignerName(orderProjectId) {
    if (!orderProjectId) return '';

    const result = await supabaseClient
        .from('OrderProject')
        .select('designerId, designer:appUsers!OrderProject_designerId_fkey(id, name)')
        .eq('id', orderProjectId)
        .maybeSingle();

    if (result.error) return '';
    return String(unwrapAppUserEmbed(result.data?.designer)?.name || '').trim();
}

async function fetchCompraLookupName(table, id) {
    const normalizedId = Number(id);
    if (!normalizedId) return '';

    const { data, error } = await supabaseClient
        .from(table)
        .select('id, name')
        .eq('id', normalizedId)
        .maybeSingle();

    if (error) return '';
    return String(data?.name || '').trim();
}

async function fetchImplementationPurchaseItemForCompra(implementationPurchaseItemId) {
    if (!implementationPurchaseItemId) return null;

    const { data, error } = await supabaseClient
        .from('ImplementationPurchaseItem')
        .select('id, purchaseType, folderPath, thirdPartySubtype:ThirdPartySubtype(id, name)')
        .eq('id', implementationPurchaseItemId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

function unwrapAppUserEmbed(embed) {
    if (!embed) return null;
    return Array.isArray(embed) ? embed[0] : embed;
}

function resolveImplementationPpcpDisplayName(implementation) {
    if (!implementation) return '';
    const createdBy = unwrapAppUserEmbed(implementation.createdBy);
    const designer = unwrapAppUserEmbed(implementation.designer);
    return String(createdBy?.name || designer?.name || '').trim();
}

function resolveThirdPartyProjectDesignerDisplayName(thirdPartyProject) {
    const designer = unwrapAppUserEmbed(thirdPartyProject?.designer);
    return String(designer?.name || '').trim();
}

async function fetchImplementationForCompraContext({ implementationId, orderProjectId } = {}) {
    const normalizedImplementationId = Number(implementationId);
    const normalizedOrderProjectId = Number(orderProjectId);
    if (!normalizedImplementationId && !normalizedOrderProjectId) return null;

    const selectWithUsers = 'id, orderProjectId, designerId, createdById, designer:appUsers!Implementation_designerId_fkey(id, name), createdBy:appUsers!createdById(id, name)';
    const selectCreatedByOnly = 'id, orderProjectId, createdById, createdBy:appUsers!createdById(id, name)';
    const selectBare = 'id, orderProjectId, designerId, createdById';

    const runQuery = async (select) => {
        let query = supabaseClient.from('Implementation').select(select);
        if (normalizedImplementationId) {
            query = query.eq('id', normalizedImplementationId);
        } else {
            query = query.eq('orderProjectId', normalizedOrderProjectId);
        }
        return query.maybeSingle();
    };

    let result = await runQuery(selectWithUsers);
    if (result.error?.message?.includes('designerId')) {
        result = await runQuery(selectCreatedByOnly);
    } else if (result.error?.message?.includes('designer') || result.error?.message?.includes('createdBy')) {
        result = await runQuery(selectBare);
    }

    if (result.error) {
        console.warn('fetchImplementationForCompraContext:', result.error);
        return null;
    }
    return result.data;
}

async function enrichCompraRecord(record) {
    if (!record) return record;

    let enriched = { ...record };

    if (record.orderProjectId) {
        try {
            const context = await fetchOrderProjectCodesForCompra(record.orderProjectId);
            enriched = {
                ...enriched,
                orderCode: context.orderCode,
                clientName: context.clientName,
                projectName: context.projectName,
                designerName: await fetchOrderProjectDesignerName(record.orderProjectId)
            };
        } catch (error) {
            console.warn('enrichCompraRecord:', error);
        }
    }

    if (record.purchaseReasonId) {
        enriched.reasonName = await fetchCompraLookupName('PurchaseReason', record.purchaseReasonId);
    }

    if (record.createdById) {
        enriched.requesterName = await fetchCompraLookupName('appUsers', record.createdById);
    }

    if (!enriched.subtypeName && record.thirdPartySubtypeId) {
        enriched.subtypeName = await fetchCompraLookupName('ThirdPartySubtype', record.thirdPartySubtypeId);
    }

    if (record.implementationId || record.orderProjectId) {
        try {
            const implementation = await fetchImplementationForCompraContext({
                implementationId: record.implementationId,
                orderProjectId: record.orderProjectId
            });
            enriched.ppcpName = resolveImplementationPpcpDisplayName(implementation);
        } catch (error) {
            console.warn('enrichCompraRecord implementation:', error);
        }
    }

    if (record.implementationPurchaseItemId) {
        try {
            const purchaseItem = await fetchImplementationPurchaseItemForCompra(record.implementationPurchaseItemId);
            enriched.listaPath = purchaseItem?.folderPath || '';
            enriched.subtypeName = purchaseItem?.thirdPartySubtype?.name || '';
            enriched.purchaseItem = purchaseItem;

            if (record.orderProjectId && typeof buildThirdPartyProjectObservationLookupByOrderProjectIds === 'function') {
                const lookup = await buildThirdPartyProjectObservationLookupByOrderProjectIds([record.orderProjectId]);
                enriched.projectObservation = typeof resolveThirdPartyProjectObservationForCompra === 'function'
                    ? resolveThirdPartyProjectObservationForCompra(record, purchaseItem, lookup)
                    : '';
                const lookupKey = typeof buildThirdPartyProjectCompraLookupKey === 'function'
                    ? buildThirdPartyProjectCompraLookupKey(
                        record.orderProjectId,
                        purchaseItem?.thirdPartySubtype?.id
                    )
                    : '';
                const thirdPartyProject = lookupKey ? lookup[lookupKey] : null;
                enriched.thirdPartyProjectId = thirdPartyProject?.id || null;
                enriched.thirdPartyDesignerName = resolveThirdPartyProjectDesignerDisplayName(thirdPartyProject);
            }
        } catch (error) {
            console.warn('enrichCompraRecord purchase item:', error);
        }
    }

    if (enriched.thirdPartyProjectId
        && typeof fetchThirdPartyProjectDriveFileForCompra === 'function') {
        try {
            enriched.thirdPartyDriveFile = await fetchThirdPartyProjectDriveFileForCompra(
                enriched.thirdPartyProjectId
            );
        } catch (error) {
            console.warn('enrichCompraRecord thirdPartyDriveFile:', error);
        }
    }

    return enriched;
}

async function createComprasRecordsFromImplantacaoSend(options = {}) {
    const {
        implementationId,
        orderProjectId,
        purchaseItems = []
    } = options;

    const items = getImplantacaoCompraSendItems(purchaseItems);
    if (!items.length) return [];

    await fetchOrderProjectCodesForCompra(orderProjectId);
    const now = new Date().toISOString();
    const rows = items.map(item => ({
        implementationId,
        implementationPurchaseItemId: item.id,
        orderProjectId,
        purchaseType: item.purchaseType,
        fallbackPurchaseType: item.purchaseType,
        status: getDefaultCompraStatusName(),
        createdById: currentUser?.id || null,
        updatedById: currentUser?.id || null,
        updatedAt: now,
        requestOrigin: options.requestOrigin || null,
        purchaseReasonId: options.purchaseReasonId || null,
        thirdPartySubtypeId: item.thirdPartySubtypeId || options.thirdPartySubtypeId || null,
        requestObservation: options.observation || null,
        attachmentPath: options.attachmentPath || null,
        attachmentFileName: options.attachmentFileName || null
    }));

    return insertPurchaseRows(rows);
}

const PURCHASE_OPTIONAL_INSERT_COLUMNS = [
    'requestOrigin',
    'purchaseReasonId',
    'thirdPartySubtypeId',
    'requestObservation',
    'attachmentPath',
    'attachmentFileName',
    'fallbackPurchaseType'
];

async function insertPurchaseRows(rows) {
    const fallbackTypes = rows.map(row => row.fallbackPurchaseType || row.purchaseType);
    let pending = rows.map(row => {
        const copy = { ...row };
        delete copy.fallbackPurchaseType;
        return copy;
    });
    let result = await supabaseClient.from('Purchase').insert(pending).select('*');

    if (result.error?.message?.includes('Purchase_purchaseType_check')) {
        pending = pending.map((row, index) => ({
            ...row,
            purchaseType: fallbackTypes[index] || row.purchaseType
        }));
        result = await supabaseClient.from('Purchase').insert(stripPurchaseOptionalColumns(pending)).select('*');
        if (result.error) {
            throw new Error(`${result.error.message} Execute supabase/feats/add-purchase-request-reasons.sql no Supabase SQL Editor.`);
        }
        return result.data || [];
    }

    if (result.error && PURCHASE_OPTIONAL_INSERT_COLUMNS.some(column => result.error.message?.includes(column))) {
        result = await supabaseClient.from('Purchase').insert(stripPurchaseOptionalColumns(pending)).select('*');
    }

    if (result.error) {
        if (result.error.message?.includes('implementationId')) {
            throw new Error('A compra manual ainda exige a implantação no banco. Execute supabase/feats/add-purchase-request-reasons.sql no Supabase SQL Editor.');
        }
        if (result.error.message?.includes('Purchase') || result.error.message?.includes('does not exist')) {
            throw new Error('Tabela Purchase não encontrada. Consulte PENDING-PROD-SQL.md ou supabase/schema/.');
        }
        throw result.error;
    }

    return result.data || [];
}

function stripPurchaseOptionalColumns(rows) {
    return rows.map(row => {
        const copy = { ...row };
        PURCHASE_OPTIONAL_INSERT_COLUMNS.forEach(column => delete copy[column]);
        return copy;
    });
}

async function createManualPurchaseRequest(payload) {
    await ensureCompraStatusesLoaded();
    const now = new Date().toISOString();
    return insertPurchaseRows([{
        implementationId: null,
        orderProjectId: payload.orderProjectId,
        purchaseType: payload.purchaseType,
        fallbackPurchaseType: payload.purchaseType,
        status: getDefaultCompraStatusName(),
        createdById: currentUser?.id || null,
        updatedById: currentUser?.id || null,
        updatedAt: now,
        requestOrigin: 'manual',
        purchaseReasonId: payload.purchaseReasonId || null,
        thirdPartySubtypeId: payload.thirdPartySubtypeId || null,
        requestObservation: payload.observation || null,
        attachmentPath: payload.attachmentPath || null,
        attachmentFileName: payload.attachmentFileName || null
    }]);
}

function formatCompraDisplayDate(dateStr) {
    const value = toCompraDateInputValue(dateStr);
    if (!value) return '—';
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return '—';
    return `${day}/${month}/${year}`;
}

async function fetchComprasByOrderId(orderId) {
    const { data: projects, error: projectsError } = await supabaseClient
        .from('OrderProject')
        .select('id')
        .eq('orderId', orderId);

    if (projectsError) throw projectsError;

    const projectIds = (projects || []).map(project => project.id).filter(Boolean);
    if (!projectIds.length) return [];

    const { data, error } = await supabaseClient
        .from('Purchase')
        .select('*')
        .in('orderProjectId', projectIds)
        .order('createdAt', { ascending: false });

    if (error?.message?.includes('Purchase') || error?.message?.includes('does not exist')) {
        throw new Error('Tabela Purchase não encontrada. Consulte PENDING-PROD-SQL.md ou supabase/schema/.');
    }

    if (error) throw error;
    return data || [];
}

async function fetchOrderComprasItems(orderId) {
    const compras = await fetchComprasByOrderId(orderId);
    if (!compras.length) return [];

    const projectIds = [...new Set(compras.map(item => item.orderProjectId).filter(Boolean))];
    const purchaseItemIds = [...new Set(compras.map(item => item.implementationPurchaseItemId).filter(Boolean))];
    let projectsById = {};
    let purchaseItemsById = {};

    if (projectIds.length) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select('id, name')
            .in('id', projectIds);

        if (error) throw error;
        projectsById = Object.fromEntries((data || []).map(project => [project.id, project]));
    }

    if (purchaseItemIds.length) {
        const { data, error } = await supabaseClient
            .from('ImplementationPurchaseItem')
            .select('id, purchaseType, thirdPartySubtype:ThirdPartySubtype(id, name)')
            .in('id', purchaseItemIds);

        if (!error && data) {
            purchaseItemsById = Object.fromEntries(data.map(item => [item.id, item]));
        }
    }

    return compras.map(compra => {
        const purchaseItem = purchaseItemsById[compra.implementationPurchaseItemId] || null;
        const subtypeName = purchaseItem?.thirdPartySubtype?.name || '';
        return {
            ...compra,
            projectName: projectsById[compra.orderProjectId]?.name || '',
            subtypeName,
            tipoLabel: formatCompraTipoLabel(compra.purchaseType, subtypeName, purchaseItem?.purchaseType)
        };
    });
}

function renderOrderComprasList(items) {
    const list = document.getElementById('order-compras-list');
    if (!list) return;

    if (!items.length) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Nenhuma solicitação de compra para este pedido.</p>';
        return;
    }

    const rows = items.map(item => {
        const projectName = item.projectName || '—';
        const tipoLabel = item.tipoLabel || formatCompraTipoLabel(item.purchaseType, item.subtypeName);
        const statusClass = getCompraStatusBadgeClass(item.status);
        const previsaoLabel = formatCompraDisplayDate(item.expectedDeliveryAt);
        const actionCell = item.id
            ? `<button type="button"
                class="order-compras-open-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"
                data-compra-id="${item.id}">
                Ver Compras
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectName)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(tipoLabel)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(item.status || '—')}
                    </span>
                </td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(previsaoLabel)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    list.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[720px]">
                    <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            <th class="text-left p-3 font-semibold">Nome do Projeto</th>
                            <th class="text-left p-3 font-semibold">Tipo</th>
                            <th class="text-left p-3 font-semibold">Status</th>
                            <th class="text-left p-3 font-semibold">Data previsão de entrega</th>
                            <th class="text-right p-3 font-semibold w-36">Ações</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

async function loadOrderPurchases(orderId) {
    const list = document.getElementById('order-compras-list');
    if (!orderId || !list) return;

    list.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando compras...</p>';

    try {
        const items = await fetchOrderComprasItems(orderId);
        renderOrderComprasList(items);
        if (typeof updateOrderTabCounts === 'function') {
            updateOrderTabCounts(undefined, undefined, undefined, undefined, items.length);
        }
    } catch (error) {
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar compras: ${escapeHtml(error.message)}</p>`;
    }
}

async function refreshActiveOrderComprasTab() {
    if (!activeOrderId || typeof loadOrderPurchases !== 'function') return;
    if (document.getElementById('order-tab-panel-compras')?.classList.contains('hidden')) return;
    await loadOrderPurchases(activeOrderId);
}

async function fetchComprasAbertas() {
    await ensureCompraStatusesLoaded(true);
    const closedStatusNames = getCompraClosedStatusNames();

    let query = supabaseClient
        .from('Purchase')
        .select('*')
        .order('createdAt', { ascending: false });

    closedStatusNames.forEach(statusName => {
        query = query.neq('status', statusName);
    });

    const { data, error } = await query;

    if (error?.message?.includes('Purchase') || error?.message?.includes('does not exist')) {
        return {
            error: new Error('Tabela Purchase não encontrada. Consulte PENDING-PROD-SQL.md ou supabase/schema/.'),
            compras: []
        };
    }

    if (error) {
        return { error, compras: [] };
    }

    return { error: null, compras: data || [] };
}

async function fetchCompraById(compraId) {
    const { data, error } = await supabaseClient
        .from('Purchase')
        .select('*')
        .eq('id', compraId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

function readCompraFormValues() {
    return {
        status: document.getElementById('compra-modal-status')?.value || getDefaultCompraStatusName(),
        expectedDeliveryAt: fromCompraDateInputValue(document.getElementById('compra-modal-previsao-entrega')?.value),
        note: document.getElementById('compra-modal-observacao')?.value?.trim() || '',
        quoteFilePath: document.getElementById('compra-modal-orcamento-path')?.value?.trim() || ''
    };
}

function setCompraFormDisabled(disabled) {
    [
        'compra-modal-status',
        'compra-modal-previsao-entrega',
        'compra-modal-observacao',
        'compra-modal-orcamento-path',
        'btn-compra-salvar'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    });
}

const COMPRA_MODAL_OVERLAY = createModalOverlayConfig('compra-modal', {
    closeButtonSelector: '#compra-modal button[onclick="closePurchaseModal()"]'
});

function setCompraModalLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(COMPRA_MODAL_OVERLAY, active, message, status);
    setCompraFormDisabled(active ? true : !canActCompraModal());
}

function setCompraSummaryText(elementId, value, fallback = '—') {
    const element = document.getElementById(elementId);
    if (!element) return;
    const text = String(value || '').trim();
    element.textContent = ` ${text || fallback}`;
}

function setCompraSummaryRowVisible(wrapId, visible) {
    document.getElementById(wrapId)?.classList.toggle('hidden', !visible);
}

function populateCompraForm(record) {
    activeCompraThirdPartyDriveFile = record?.thirdPartyDriveFile || null;
    const fromImplementation = isCompraImplantacaoMotivo(record);
    const designerName = String(record?.designerName || record?.thirdPartyDesignerName || '').trim();
    const subtypeName = String(record?.subtypeName || '').trim();
    const path = String(record?.listaPath || '').trim();
    const attachmentName = String(record?.attachmentFileName || '').trim();
    const attachmentPath = String(record?.attachmentPath || '').trim();
    const reasonLabel = String(record?.reasonName || '').trim()
        || (fromImplementation ? 'Implantação' : '');
    const requestObservation = String(record?.requestObservation || '').trim();

    const titleEl = document.getElementById('compra-modal-title');
    if (titleEl) {
        titleEl.textContent = reasonLabel ? `Compra - ${reasonLabel}` : 'Compra';
    }

    document.getElementById('compra-modal-order-code').textContent = record?.orderCode || '—';
    setCompraSummaryText('compra-modal-client-name', record?.clientName);
    setCompraSummaryText('compra-modal-project-name', record?.projectName);
    setCompraSummaryText('compra-modal-designer-name', designerName);
    setCompraSummaryRowVisible('compra-modal-designer-wrap', Boolean(designerName));
    setCompraSummaryText('compra-modal-tipo', formatCompraModalTipoLabel(record), '');
    setCompraSummaryText('compra-modal-subtype', subtypeName);
    setCompraSummaryRowVisible('compra-modal-subtype-wrap', Boolean(subtypeName));
    setCompraSummaryText('compra-modal-ppcp-name', record?.ppcpName);
    setCompraSummaryRowVisible('compra-modal-ppcp-wrap', fromImplementation);
    setCompraSummaryText('compra-modal-requester-name', record?.requesterName);
    setCompraSummaryRowVisible('compra-modal-requester-wrap', !fromImplementation);
    setCompraSummaryText('compra-modal-lista-path', path);
    setCompraSummaryRowVisible('compra-modal-path-wrap', Boolean(path));
    setCompraSummaryText('compra-modal-attachment-name', attachmentName);
    setCompraSummaryRowVisible('compra-modal-attachment-wrap', Boolean(attachmentPath || attachmentName));
    const canOpenAttachment = Boolean(attachmentPath);
    document.getElementById('btn-compra-attachment-open')?.toggleAttribute('disabled', !canOpenAttachment);
    document.getElementById('btn-compra-attachment-download')?.toggleAttribute('disabled', !canOpenAttachment);

    const isTerceiro = record?.purchaseType === COMPRA_TIPO_TERCEIRO
        || record?.purchaseItem?.purchaseType === COMPRA_TIPO_TERCEIRO;

    const requestObservationEl = document.getElementById('compra-modal-request-observation');
    const requestObservationWrap = document.getElementById('compra-modal-request-observation-wrap');
    if (requestObservationWrap) {
        requestObservationWrap.classList.toggle('hidden', fromImplementation);
    }
    if (requestObservationEl) {
        requestObservationEl.textContent = requestObservation || '—';
        requestObservationEl.classList.toggle('text-slate-400', !requestObservation);
        requestObservationEl.classList.toggle('text-slate-700', Boolean(requestObservation));
    }

    const projectObservationEl = document.getElementById('compra-modal-project-observation');
    if (projectObservationEl) {
        const projectObservation = String(record?.projectObservation || '').trim();
        projectObservationEl.textContent = projectObservation || '—';
        projectObservationEl.classList.toggle('text-slate-400', !projectObservation);
        projectObservationEl.classList.toggle('text-slate-700', Boolean(projectObservation));
    }

    populateCompraStatusSelect(record?.status || getDefaultCompraStatusName());
    document.getElementById('compra-modal-previsao-entrega').value = toCompraDateInputValue(record?.expectedDeliveryAt);
    document.getElementById('compra-modal-observacao').value = record?.note || '';
    document.getElementById('compra-modal-orcamento-path').value = record?.quoteFilePath || '';

    const badge = document.getElementById('compra-modal-status-badge');
    const status = record?.status || getDefaultCompraStatusName();
    if (badge) {
        badge.textContent = status;
        badge.className = `text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${getCompraStatusBadgeClass(status)}`;
    }

    const fileWrap = document.getElementById('compra-modal-third-party-file-wrap');
    const fileNameEl = document.getElementById('compra-modal-third-party-file-name');
    const openBtn = document.getElementById('btn-compra-third-party-open');
    const downloadBtn = document.getElementById('btn-compra-third-party-download');
    const driveFile = record?.thirdPartyDriveFile;
    const hasThirdPartyDriveFile = Boolean(
        driveFile?.driveFileId || String(driveFile?.url || '').trim()
    );

    if (fileWrap) {
        fileWrap.classList.toggle('hidden', !isTerceiro || !hasThirdPartyDriveFile);
    }
    if (fileNameEl) {
        fileNameEl.textContent = driveFile?.fileName || 'Nenhum arquivo no Drive';
    }
    if (openBtn) {
        openBtn.disabled = !hasThirdPartyDriveFile;
    }
    if (downloadBtn) {
        downloadBtn.disabled = !hasThirdPartyDriveFile;
    }
}

const COMPRA_REQUEST_FILES_BUCKET = 'purchase-request-files';
const COMPRA_REQUEST_FILE_URL_TTL = 60 * 60;

async function createCompraRequestFileSignedUrl(download) {
    const path = String(activeCompraRecord?.attachmentPath || '').trim();
    if (!path) {
        alertAppDialog('Esta compra não tem arquivo.');
        return '';
    }

    const options = download
        ? { download: activeCompraRecord?.attachmentFileName || true }
        : undefined;
    const { data, error } = await supabaseClient.storage
        .from(COMPRA_REQUEST_FILES_BUCKET)
        .createSignedUrl(path, COMPRA_REQUEST_FILE_URL_TTL, options);

    if (error || !data?.signedUrl) {
        alertAppDialog(error?.message || 'Não foi possível abrir o arquivo.');
        return '';
    }

    return data.signedUrl;
}

async function openCompraRequestFile() {
    const url = await createCompraRequestFileSignedUrl(false);
    if (!url) return;
    openCompraThirdPartyDriveUrlInNewTab(url);
}

async function downloadCompraRequestFile() {
    const url = await createCompraRequestFileSignedUrl(true);
    if (!url) return;
    openCompraThirdPartyDriveUrlInNewTab(url);
}

function resolveCompraThirdPartyPdfDriveFileId(file) {
    if (typeof extractGoogleDriveFileId === 'function') {
        return extractGoogleDriveFileId(file);
    }
    const driveFileId = String(file?.driveFileId || '').trim();
    if (driveFileId) return driveFileId;
    const stored = String(file?.url || '').trim();
    const match = stored.match(/[?&]id=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
}

function resolveCompraThirdPartyPdfDownloadUrl(file) {
    const driveFileId = resolveCompraThirdPartyPdfDriveFileId(file);
    if (driveFileId) {
        return `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(driveFileId)}`;
    }
    const stored = String(file?.url || '').trim();
    if (stored) return stored;
    return typeof resolveDriveFileDownloadUrl === 'function'
        ? resolveDriveFileDownloadUrl(file)
        : '';
}

/** Visualizar no navegador (navegação — não usa fetch; Drive API exige Bearer no XHR). */
function resolveCompraThirdPartyPdfInlineOpenUrl(file) {
    if (typeof resolveDriveFilePdfBrowserOpenUrl === 'function') {
        return resolveDriveFilePdfBrowserOpenUrl(file);
    }
    const driveFileId = resolveCompraThirdPartyPdfDriveFileId(file);
    if (driveFileId) {
        return `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`;
    }
    return String(file?.url || '').trim();
}

function openCompraThirdPartyDriveUrlInNewTab(url) {
    const href = String(url || '').trim();
    if (!href) return false;
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
}

function openCompraThirdPartyDriveFileInNewTab() {
    const inlineOpenUrl = resolveCompraThirdPartyPdfInlineOpenUrl(activeCompraThirdPartyDriveFile);
    if (!openCompraThirdPartyDriveUrlInNewTab(inlineOpenUrl)) {
        alertAppDialog('Não foi possível abrir o PDF.', { variant: 'warning', title: 'Aviso' });
    }
}

function downloadCompraThirdPartyDriveFile() {
    const url = resolveCompraThirdPartyPdfDownloadUrl(activeCompraThirdPartyDriveFile);
    if (!openCompraThirdPartyDriveUrlInNewTab(url)) {
        alertAppDialog('Não foi possível gerar o link de download.', { variant: 'warning', title: 'Aviso' });
    }
}

async function openPurchaseModal(compraId) {
    if (!compraId) return;

    try {
        await ensureCompraStatusesLoaded(true);

        const record = await fetchCompraById(compraId);
        if (!record) {
            alertAppDialog('Compra não encontrada.');
            return;
        }

        activeCompraRecord = await enrichCompraRecord(record);
        populateCompraForm(activeCompraRecord);
        setCompraFormDisabled(!canActCompraModal());
        toggleModal('compra-modal', true);
    } catch (error) {
        if (error.message?.includes('Purchase') || error.message?.includes('does not exist')) {
            alertAppDialog('Tabela Purchase não encontrada. Consulte PENDING-PROD-SQL.md ou supabase/schema/.');
        } else {
            alertAppDialog('Erro ao abrir compra: ' + error.message);
        }
    }
}

function closePurchaseModal() {
    setCompraModalLoading(false);
    toggleModal('compra-modal', false);
    activeCompraRecord = null;
    activeCompraThirdPartyDriveFile = null;
}
window.closePurchaseModal = closePurchaseModal;
window.openPurchaseModal = openPurchaseModal;
window.closeCompraModal = closePurchaseModal;
window.openCompraModal = openPurchaseModal;

async function handleCompraSalvar() {
    if (!activeCompraRecord?.id || !canActCompraModal()) return;

    try {
        setCompraModalLoading(true, 'Salvando compra...');

        const formValues = readCompraFormValues();
        const now = new Date().toISOString();
        const { data, error } = await supabaseClient
            .from('Purchase')
            .update({
                status: formValues.status,
                expectedDeliveryAt: formValues.expectedDeliveryAt,
                note: formValues.note || null,
                quoteFilePath: formValues.quoteFilePath || null,
                updatedById: currentUser?.id || null,
                updatedAt: now
            })
            .eq('id', activeCompraRecord.id)
            .select('*')
            .single();

        if (error) throw error;

        activeCompraRecord = {
            ...data,
            clientName: activeCompraRecord?.clientName,
            projectName: activeCompraRecord?.projectName,
            designerName: activeCompraRecord?.designerName,
            reasonName: activeCompraRecord?.reasonName,
            requesterName: activeCompraRecord?.requesterName,
            ppcpName: activeCompraRecord?.ppcpName,
            listaPath: activeCompraRecord?.listaPath,
            subtypeName: activeCompraRecord?.subtypeName,
            thirdPartyDesignerName: activeCompraRecord?.thirdPartyDesignerName,
            thirdPartyDriveFile: activeCompraRecord?.thirdPartyDriveFile,
            purchaseItem: activeCompraRecord?.purchaseItem,
            projectObservation: activeCompraRecord?.projectObservation,
            requestOrigin: activeCompraRecord?.requestOrigin,
            requestObservation: data.requestObservation ?? activeCompraRecord?.requestObservation,
            attachmentPath: data.attachmentPath ?? activeCompraRecord?.attachmentPath,
            attachmentFileName: data.attachmentFileName ?? activeCompraRecord?.attachmentFileName
        };
        populateCompraForm(activeCompraRecord);

        setCompraModalLoading(true, 'Atualizando telas...');
        if (typeof loadPendenciasEnviadosCompras === 'function'
            && !document.getElementById('pendencias-view')?.classList.contains('hidden')
            && pendenciasActiveSection === 'compras'
            && pendenciasActiveItem === 'enviados-compras') {
            await loadPendenciasEnviadosCompras();
        }

        await refreshActiveOrderComprasTab();

        setCompraModalLoading(true, 'Compra salva com sucesso!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));

        closePurchaseModal();
    } catch (error) {
        setCompraModalLoading(true, `Erro ao salvar compra: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setCompraModalLoading(false);
        setCompraFormDisabled(!canActCompraModal());
    }
}

function bindPurchaseEvents() {
    ensureCompraStatusesLoaded(true).then(() => {
        populateCompraStatusSelect();
    });

    document.getElementById('compra-modal-status')?.addEventListener('change', async (event) => {
        const badge = document.getElementById('compra-modal-status-badge');
        if (!badge) return;
        badge.textContent = event.target.value;
        badge.className = `text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${getCompraStatusBadgeClass(event.target.value)}`;
    });

    document.getElementById('btn-compra-salvar')?.addEventListener('click', handleCompraSalvar);

    document.getElementById('btn-compra-third-party-open')?.addEventListener('click', openCompraThirdPartyDriveFileInNewTab);
    document.getElementById('btn-compra-third-party-download')?.addEventListener('click', downloadCompraThirdPartyDriveFile);
    document.getElementById('btn-compra-attachment-open')?.addEventListener('click', openCompraRequestFile);
    document.getElementById('btn-compra-attachment-download')?.addEventListener('click', downloadCompraRequestFile);

    document.getElementById('order-compras-list')?.addEventListener('click', async (event) => {
        const button = event.target.closest('.order-compras-open-btn');
        if (!button) return;
        const compraId = Number(button.dataset.compraId);
        if (!compraId) return;
        openPurchaseModal(compraId);
    });
}

const loadCompraStatuses = loadPurchaseStatuses;
const loadOrderCompras = loadOrderPurchases;
const openCompraModal = openPurchaseModal;
const closeCompraModal = closePurchaseModal;

const bindCompraEvents = bindPurchaseEvents;
