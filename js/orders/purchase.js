const COMPRA_STATUS_ABERTO = 'Aberto';
const COMPRA_STATUS_FECHADO = 'Fechado';

const COMPRA_TIPO_MATERIAL = 'Material';
const COMPRA_TIPO_FERRAGEM = 'Ferragem';
const COMPRA_TIPO_TINTA = 'Tinta';
const COMPRA_TIPO_TERCEIRO = 'Terceiro';

let activeCompraRecord = null;
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

function formatCompraTipoLabel(purchaseType, subtypeName = '') {
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
    return (purchaseItems || []).filter(item => (
        Boolean(item?.isChecked)
        && Boolean(item?.folderPath)
        && !item?.sentToCommercial
    ));
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
        projectName: result.data?.name || ''
    };
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
                projectName: context.projectName
            };
        } catch (error) {
            console.warn('enrichCompraRecord:', error);
        }
    }

    if (record.implementationPurchaseItemId) {
        try {
            const purchaseItem = await fetchImplementationPurchaseItemForCompra(record.implementationPurchaseItemId);
            enriched.listaPath = purchaseItem?.folderPath || '';
            enriched.subtypeName = purchaseItem?.thirdPartySubtype?.name || '';
        } catch (error) {
            console.warn('enrichCompraRecord purchase item:', error);
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
        status: getDefaultCompraStatusName(),
        createdById: currentUser?.id || null,
        updatedById: currentUser?.id || null,
        updatedAt: now
    }));

    const { data, error } = await supabaseClient
        .from('Purchase')
        .insert(rows)
        .select('*');

    if (error) {
        if (error.message?.includes('Purchase') || error.message?.includes('does not exist')) {
            throw new Error('Tabela Purchase não encontrada. Consulte PENDING-PROD-SQL.md ou supabase/schema/.');
        }
        throw error;
    }

    return data || [];
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
            tipoLabel: formatCompraTipoLabel(compra.purchaseType, subtypeName)
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

function populateCompraForm(record) {
    const tipoLabel = formatCompraTipoLabel(record?.purchaseType, record?.subtypeName);
    document.getElementById('compra-modal-order-code').textContent = record?.orderCode || '—';
    document.getElementById('compra-modal-client-name').textContent = ` ${record?.clientName || '—'}`;
    document.getElementById('compra-modal-project-name').textContent = ` ${record?.projectName || '—'}`;
    document.getElementById('compra-modal-tipo').textContent = ` ${tipoLabel}`;
    document.getElementById('compra-modal-lista-path').textContent = ` ${record?.listaPath || '—'}`;
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
            listaPath: activeCompraRecord?.listaPath,
            subtypeName: activeCompraRecord?.subtypeName
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
