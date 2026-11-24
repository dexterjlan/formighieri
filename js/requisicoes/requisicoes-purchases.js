const REQUISICOES_PURCHASE_TYPES = [
    { value: 'Material', label: 'Lista de Material' },
    { value: 'Ferragem', label: 'Lista de Ferragem' },
    { value: 'Tinta', label: 'Lista de Tinta' },
    { value: 'Terceiro', label: 'Terceiro' }
];

const PURCHASE_REQUEST_FILES_BUCKET = 'purchase-request-files';

let requisicoesPurchaseOrders = [];
let requisicoesPurchaseOrderCombobox = null;

function requisicoesPurchaseSqlHint() {
    return 'Execute supabase/feats/add-purchase-request-reasons.sql no Supabase SQL Editor.';
}

function normalizeRequisicoesPurchaseReasonName(name) {
    return String(name || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function isRequisicoesPurchaseVistoriaReason(reason) {
    return normalizeRequisicoesPurchaseReasonName(reason?.name) === 'vistoria';
}

async function resolveRequisicoesVistoriaPurchaseReasonId() {
    const pickVistoria = (rows) => (rows || []).find(isRequisicoesPurchaseVistoriaReason);

    let result = await supabaseClient
        .from('PurchaseReason')
        .select('id, name, isActive, isSystem');

    if (result.error?.message?.includes('isSystem')) {
        result = await supabaseClient
            .from('PurchaseReason')
            .select('id, name, isActive');
    }

    if (!result.error) {
        const match = pickVistoria(result.data);
        if (match?.id) return Number(match.id);
    } else {
        console.warn('resolveRequisicoesVistoriaPurchaseReasonId:', result.error.message);
    }

    const byName = await supabaseClient
        .from('PurchaseReason')
        .select('id, name, isActive')
        .ilike('name', 'vistoria');

    if (!byName.error && byName.data?.length) {
        const match = pickVistoria(byName.data) || byName.data[0];
        if (match?.id) return Number(match.id);
    }

    return null;
}

window.resolveRequisicoesVistoriaPurchaseReasonId = resolveRequisicoesVistoriaPurchaseReasonId;

function isRequisicoesPurchaseAssistenciaReason(reason) {
    const normalized = normalizeRequisicoesPurchaseReasonName(reason?.name);
    return normalized === 'assistencia' || normalized === 'assistência';
}

async function resolveRequisicoesAssistenciaPurchaseReasonId() {
    const pickAssistencia = (rows) => (rows || []).find(isRequisicoesPurchaseAssistenciaReason);

    let result = await supabaseClient
        .from('PurchaseReason')
        .select('id, name, isActive, isSystem');

    if (result.error?.message?.includes('isSystem')) {
        result = await supabaseClient
            .from('PurchaseReason')
            .select('id, name, isActive');
    }

    if (!result.error) {
        const match = pickAssistencia(result.data);
        if (match?.id) return Number(match.id);
    } else {
        console.warn('resolveRequisicoesAssistenciaPurchaseReasonId:', result.error.message);
    }

    const byName = await supabaseClient
        .from('PurchaseReason')
        .select('id, name, isActive')
        .or('name.ilike.assistência,name.ilike.assistencia');

    if (!byName.error && byName.data?.length) {
        const match = pickAssistencia(byName.data) || byName.data[0];
        if (match?.id) return Number(match.id);
    }

    return null;
}

window.resolveRequisicoesAssistenciaPurchaseReasonId = resolveRequisicoesAssistenciaPurchaseReasonId;

async function loadRequisicoesPurchaseReasons() {
    let result = await supabaseClient
        .from('PurchaseReason')
        .select('id, name, sortOrder, isActive, isSystem')
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (result.error?.message?.includes('isSystem')) {
        result = await supabaseClient
            .from('PurchaseReason')
            .select('id, name, sortOrder, isActive')
            .eq('isActive', true)
            .order('sortOrder', { ascending: true })
            .order('name', { ascending: true });
    }

    if (result.error) throw result.error;
    return result.data || [];
}

/** Motivos para requisição manual (exclui motivos marcados como Sistema). */
function filterRequisicoesPurchaseReasonsForComprasScreen(reasons = []) {
    if (typeof filterPurchaseReasonsForManualRequest === 'function') {
        return filterPurchaseReasonsForManualRequest(reasons);
    }
    return reasons || [];
}

async function resolveRequisicoesImplantacaoPurchaseReasonId() {
    const reasons = await loadRequisicoesPurchaseReasons();
    const match = typeof findSystemPurchaseReason === 'function'
        ? findSystemPurchaseReason(reasons)
        : null;
    return match?.id ? Number(match.id) : null;
}

async function loadRequisicoesPurchaseSubtypes() {
    const { data, error } = await supabaseClient
        .from('ThirdPartySubtype')
        .select('id, name')
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
}

async function uploadRequisicoesPurchaseFile(file, orderProjectId, options = {}) {
    if (!file) return { path: null, fileName: null };
    const env = window.FORMIGHIERI_APP_ENV === 'prod' ? 'prod' : 'dev';
    const safeName = String(file.name || 'arquivo')
        .trim()
        .replace(/[^\w.\-() ]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 120);
    const storageFolder = orderProjectId
        || (options.assistanceRequestId ? `assistencia-${options.assistanceRequestId}` : 'sem-projeto');
    const path = `${env}/${storageFolder}/${Date.now()}-${safeName}`;
    const { error } = await supabaseClient.storage
        .from(PURCHASE_REQUEST_FILES_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined });

    if (error) {
        throw new Error(`${error.message}. ${requisicoesPurchaseSqlHint()}`);
    }

    return { path, fileName: file.name };
}

function formatRequisicoesImplementationPurchaseItemLabel(item) {
    const match = REQUISICOES_PURCHASE_TYPES.find(type => type.value === item?.purchaseType);
    const base = match?.label || item?.purchaseType || '—';
    const subtypeName = item?.thirdPartySubtype?.name || '';
    if (item?.purchaseType === 'Terceiro' && subtypeName) {
        return `${base} — ${subtypeName}`;
    }
    return base;
}

function renderRequisicoesImplementationPurchaseItemsSummary(items = []) {
    if (!items.length) {
        return '<p class="text-xs text-amber-700">Nenhuma lista marcada para envio na implantação.</p>';
    }
    const rows = items.map(item => (
        `<li>${escapeHtml(formatRequisicoesImplementationPurchaseItemLabel(item))}</li>`
    )).join('');
    return `<ul class="text-xs text-slate-700 list-disc pl-4 space-y-0.5">${rows}</ul>`;
}

function renderRequisicoesPurchaseForm(draft) {
    const lockedImplementation = draft?.origin === 'implementation';
    const lockedEai = draft?.origin === 'externalAssemblyInspection';
    const lockedAssistance = draft?.origin === 'assistance';
    const lockedOrder = lockedImplementation || lockedEai || lockedAssistance;
    const lockedProject = lockedImplementation || lockedEai || lockedAssistance;
    const lockedSystemReason = lockedEai || lockedAssistance;
    const systemReasonLabel = lockedEai ? 'Vistoria' : (lockedAssistance ? 'Assistência' : '');
    const typeOptions = REQUISICOES_PURCHASE_TYPES.map(type => (
        `<option value="${type.value}">${escapeHtml(type.label)}</option>`
    )).join('');

    return `
        <form id="requisicoes-purchase-form" class="relative bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 space-y-4">
            <div>
                <h2 class="font-bold text-sm text-slate-900">Enviar para compras</h2>
                <p class="text-xs text-slate-400 mt-1">${lockedImplementation
                    ? 'Confirme pedido e projeto, escolha o motivo e envie. Cada lista da implantação gerará uma compra com o tipo correto (material, ferragem, tinta ou terceiro).'
                    : lockedEai
                        ? 'Pedido, projeto e motivo Vistoria estão fixos para esta vistoria de montagem externa. Informe o tipo da lista e o anexo.'
                        : lockedAssistance
                            ? 'Motivo Assistência fixo. Pedido e projeto são opcionais e travados (o pedido só aparece se estiver na assistência). Informe o tipo da lista e o anexo.'
                            : 'Escolha o pedido, o projeto e o tipo da lista. Se for terceiro, informe o subtipo.'}</p>
            </div>
            <div id="requisicoes-purchase-sql-hint" class="hidden text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="relative" id="requisicoes-purchase-order-wrap">
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-order-search">Pedido${lockedAssistance ? ' <span class="font-normal text-slate-400">(opcional)</span>' : ''}</label>
                    <input id="requisicoes-purchase-order-search" type="text" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="requisicoes-purchase-order-list" aria-autocomplete="list" placeholder="${lockedAssistance ? 'Sem pedido na assistência' : 'Digite o código ou nome do cliente'}" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg ${lockedAssistance ? 'bg-slate-50 text-slate-700' : 'bg-white'}" ${lockedOrder ? 'disabled' : ''}>
                    <input type="hidden" id="requisicoes-purchase-order" value="">
                    <div id="requisicoes-purchase-order-list" class="hidden absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg" role="listbox"></div>
                </div>
                <div id="requisicoes-purchase-project-wrap">
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="${lockedEai || lockedAssistance ? 'requisicoes-purchase-project-locked' : 'requisicoes-purchase-project'}">Projeto${lockedAssistance ? ' <span class="font-normal text-slate-400">(opcional)</span>' : ''}</label>
                    ${lockedEai
                        ? `<input type="text" id="requisicoes-purchase-project-locked" disabled
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700"
                            value="${escapeHtml(draft?.projectLabel || 'Projeto')}">
                           <input type="hidden" id="requisicoes-purchase-project" value="${Number(draft?.orderProjectId) || ''}">`
                        : lockedAssistance
                            ? `<input type="text" id="requisicoes-purchase-project-locked" disabled
                                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-400"
                                value="—">
                               <input type="hidden" id="requisicoes-purchase-project" value="">`
                        : `<select id="requisicoes-purchase-project" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" ${lockedProject ? 'disabled' : ''}></select>`
                    }
                </div>
                <div id="requisicoes-purchase-type-wrap" class="${lockedImplementation ? 'hidden' : ''}">
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-type">Tipo</label>
                    <select id="requisicoes-purchase-type" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                        <option value="">Selecione</option>${typeOptions}
                    </select>
                </div>
                <div id="requisicoes-purchase-implementation-items-wrap" class="${lockedImplementation ? '' : 'hidden'} md:col-span-2">
                    <div class="text-xs font-semibold text-slate-500 mb-1">Listas a enviar</div>
                    <div id="requisicoes-purchase-implementation-items" class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        ${renderRequisicoesImplementationPurchaseItemsSummary(draft?.purchaseItems)}
                    </div>
                </div>
                <div id="requisicoes-purchase-subtype-wrap" class="hidden">
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-subtype">Subtipo de terceiro</label>
                    <select id="requisicoes-purchase-subtype" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"></select>
                </div>
                <div class="${lockedSystemReason ? '' : 'hidden'}">
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-reason-locked">Motivo</label>
                    <input type="text" id="requisicoes-purchase-reason-locked" value="${escapeHtml(systemReasonLabel)}" disabled
                        class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700">
                    <input type="hidden" id="requisicoes-purchase-reason" value="${draft?.purchaseReasonId ? String(draft.purchaseReasonId) : ''}">
                </div>
                <div class="${lockedImplementation || lockedSystemReason ? 'hidden' : ''}">
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-reason-select">Motivo</label>
                    <select id="requisicoes-purchase-reason-select" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"></select>
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-file">Arquivo</label>
                    <input id="requisicoes-purchase-file" type="file" class="w-full text-xs">
                </div>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-observation">Observação</label>
                <textarea id="requisicoes-purchase-observation" rows="3" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"></textarea>
            </div>
            <div class="flex justify-end">
                <button type="submit" class="text-sm bg-slate-900 text-white px-4 py-2 rounded-lg font-medium">Enviar para Compras</button>
            </div>
        </form>
    `;
}

function requisicoesPurchaseOrderLabel(order) {
    return typeof formatOrderSearchComboboxLabel === 'function'
        ? formatOrderSearchComboboxLabel(order)
        : (order?.orderCode || '');
}

async function ensureRequisicoesPurchaseOrderInPicker(orderId) {
    const normalizedId = Number(orderId);
    if (!normalizedId) return;

    if (requisicoesPurchaseOrders.some(order => Number(order.id) === normalizedId)) return;

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, client:Client(name)')
        .eq('id', normalizedId)
        .maybeSingle();

    if (error || !data) return;
    requisicoesPurchaseOrders.push(data);
    if (typeof appendOrderSearchComboboxOrder === 'function') {
        appendOrderSearchComboboxOrder(data);
    }
}

function initRequisicoesPurchaseOrderCombobox(selectedOrderId) {
    const wrap = document.getElementById('requisicoes-purchase-order-wrap');
    const input = document.getElementById('requisicoes-purchase-order-search');
    const list = document.getElementById('requisicoes-purchase-order-list');
    const hidden = document.getElementById('requisicoes-purchase-order');
    if (!wrap || !input || !list || input.disabled) return;

    if (requisicoesPurchaseOrderCombobox?.destroy) {
        requisicoesPurchaseOrderCombobox.destroy();
        requisicoesPurchaseOrderCombobox = null;
    }

    if (typeof mountOrderSearchCombobox !== 'function') return;

    requisicoesPurchaseOrderCombobox = mountOrderSearchCombobox({
        wrap,
        input,
        list,
        selectedOrderId: selectedOrderId || (hidden?.value ? Number(hidden.value) : null),
        onSelect: order => {
            if (hidden) hidden.value = order ? String(order.id) : '';
            void fillRequisicoesPurchaseProjects(order?.id);
        },
        onClear: () => {
            if (hidden) hidden.value = '';
            fillRequisicoesPurchaseProjects(null);
        }
    });
}

async function fillRequisicoesPurchaseOrders(selectedOrderId) {
    const input = document.getElementById('requisicoes-purchase-order-search');
    const hidden = document.getElementById('requisicoes-purchase-order');
    if (!input || !hidden) return;
    if (typeof fetchOrderSearchComboboxOrders !== 'function') {
        throw new Error('Cache de pedidos indisponível.');
    }
    requisicoesPurchaseOrders = await fetchOrderSearchComboboxOrders();
    if (selectedOrderId) {
        await ensureRequisicoesPurchaseOrderInPicker(selectedOrderId);
    }
    const selected = requisicoesPurchaseOrders.find(order => Number(order.id) === Number(selectedOrderId));
    hidden.value = selected ? String(selected.id) : '';
    initRequisicoesPurchaseOrderCombobox(selectedOrderId);
}

async function fillRequisicoesPurchaseProjects(orderId, selectedProjectId) {
    const select = document.getElementById('requisicoes-purchase-project');
    if (!select) return;
    if (!orderId) {
        select.innerHTML = '<option value="">Selecione o projeto</option>';
        return;
    }
    let result = await supabaseClient
        .from('OrderProject')
        .select('id, name, projectCode, aggregatorOrderProjectId')
        .eq('orderId', orderId)
        .order('projectCode', { ascending: true });

    if (result.error?.message?.includes('aggregatorOrderProjectId')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, name, projectCode')
            .eq('orderId', orderId)
            .order('projectCode', { ascending: true });
    }

    const { data, error } = result;
    if (error) throw error;

    let projects = typeof excludeGroupedChildPendenciasProjects === 'function'
        ? excludeGroupedChildPendenciasProjects(data || [])
        : (data || []).filter(project => !Number(project?.aggregatorOrderProjectId));

    const selectedKey = Number(selectedProjectId);
    if (selectedKey && !projects.some(project => Number(project.id) === selectedKey)) {
        let extraResult = await supabaseClient
            .from('OrderProject')
            .select('id, name, projectCode, aggregatorOrderProjectId')
            .eq('id', selectedKey)
            .maybeSingle();

        if (extraResult.error?.message?.includes('aggregatorOrderProjectId')) {
            extraResult = await supabaseClient
                .from('OrderProject')
                .select('id, name, projectCode')
                .eq('id', selectedKey)
                .maybeSingle();
        }

        if (!extraResult.error && extraResult.data) {
            projects = [extraResult.data, ...projects];
        }
    }

    const selected = selectedProjectId ? String(selectedProjectId) : '';
    select.innerHTML = '<option value="">Selecione o projeto</option>' + projects.map(project => {
        const isSelected = String(project.id) === selected ? ' selected' : '';
        const code = project.projectCode ? `${project.projectCode} — ` : '';
        return `<option value="${project.id}"${isSelected}>${escapeHtml(`${code}${project.name || 'Projeto'}`)}</option>`;
    }).join('');
    if (selected) select.value = selected;
}

function syncRequisicoesPurchaseSubtypeVisibility() {
    const type = document.getElementById('requisicoes-purchase-type')?.value;
    document.getElementById('requisicoes-purchase-subtype-wrap')?.classList.toggle('hidden', type !== 'Terceiro');
}

async function setupRequisicoesPurchaseForm(draft, submitOptions = {}) {
    const hint = document.getElementById('requisicoes-purchase-sql-hint');
    try {
        if (draft?.origin === 'assistance') {
            if (draft?.orderId) {
                await fillRequisicoesPurchaseOrders(draft.orderId);
            } else {
                const input = document.getElementById('requisicoes-purchase-order-search');
                const hidden = document.getElementById('requisicoes-purchase-order');
                if (input) {
                    input.value = '—';
                    input.disabled = true;
                }
                if (hidden) hidden.value = '';
            }
        } else {
            await fillRequisicoesPurchaseOrders(draft?.orderId);
        }
        if (draft?.origin === 'assistance') {
            // Pedido e projeto travados no HTML; projeto sem valor.
        } else if (draft?.origin !== 'externalAssemblyInspection') {
            await fillRequisicoesPurchaseProjects(draft?.orderId, draft?.orderProjectId);
        } else {
            const hiddenOrder = document.getElementById('requisicoes-purchase-order');
            const hiddenProject = document.getElementById('requisicoes-purchase-project');
            if (hiddenOrder && draft?.orderId) hiddenOrder.value = String(draft.orderId);
            if (hiddenProject && draft?.orderProjectId) hiddenProject.value = String(draft.orderProjectId);
            const lockedProjectLabel = document.getElementById('requisicoes-purchase-project-locked');
            if (lockedProjectLabel && draft?.projectLabel) {
                lockedProjectLabel.value = draft.projectLabel;
            }
        }
        const subtypes = await loadRequisicoesPurchaseSubtypes();
        const subtypeSelect = document.getElementById('requisicoes-purchase-subtype');
        if (subtypeSelect) {
            subtypeSelect.innerHTML = '<option value="">Selecione o subtipo</option>' + subtypes.map(item => (
                `<option value="${item.id}">${escapeHtml(item.name)}</option>`
            )).join('');
        }
        const reasons = await loadRequisicoesPurchaseReasons();
        const reasonSelect = document.getElementById('requisicoes-purchase-reason-select');
        if (reasonSelect && draft?.origin !== 'implementation' && draft?.origin !== 'externalAssemblyInspection' && draft?.origin !== 'assistance') {
            const reasonsForSelect = filterRequisicoesPurchaseReasonsForComprasScreen(reasons);
            reasonSelect.innerHTML = '<option value="">Selecione o motivo</option>' + reasonsForSelect.map(item => (
                `<option value="${item.id}">${escapeHtml(item.name)}</option>`
            )).join('');
        }
        if (draft?.origin === 'externalAssemblyInspection') {
            let reasonId = Number(draft.purchaseReasonId) || null;
            if (!reasonId) {
                reasonId = await resolveRequisicoesVistoriaPurchaseReasonId();
            }
            const hiddenReason = document.getElementById('requisicoes-purchase-reason');
            if (hiddenReason && reasonId) hiddenReason.value = String(reasonId);
            draft.purchaseReasonId = reasonId;
            if (!reasonId && hint) {
                hint.textContent = 'Motivo "Vistoria" não encontrado em Gestão → Motivos de Compra (nome exato ou execute supabase/feats/add-purchase-external-assembly-inspection-id.sql).';
                hint.classList.remove('hidden');
            }
        }
        if (draft?.origin === 'assistance') {
            let reasonId = Number(draft.purchaseReasonId) || null;
            if (!reasonId) {
                reasonId = await resolveRequisicoesAssistenciaPurchaseReasonId();
            }
            const hiddenReason = document.getElementById('requisicoes-purchase-reason');
            if (hiddenReason && reasonId) hiddenReason.value = String(reasonId);
            draft.purchaseReasonId = reasonId;
            if (!reasonId && hint) {
                hint.textContent = 'Motivo "Assistência" não encontrado. Execute supabase/feats/add-purchase-assistance-request-id.sql no Supabase SQL Editor.';
                hint.classList.remove('hidden');
            }
        }
    } catch (error) {
        if (hint) {
            hint.textContent = `${error.message || 'Não foi possível carregar os cadastros.'} ${requisicoesPurchaseSqlHint()}`;
            hint.classList.remove('hidden');
        }
    }

    syncRequisicoesPurchaseSubtypeVisibility();
    document.getElementById('requisicoes-purchase-type')?.addEventListener('change', syncRequisicoesPurchaseSubtypeVisibility);
    document.getElementById('requisicoes-purchase-form')?.addEventListener('submit', event => {
        event.preventDefault();
        void submitRequisicoesPurchase(draft, submitOptions);
    });
}

async function mountRequisicoesPurchaseForm(container, draft, submitOptions = {}) {
    if (!container || !draft) return;
    container.innerHTML = renderRequisicoesPurchaseForm(draft);
    await setupRequisicoesPurchaseForm(draft, submitOptions);
}

async function loadRequisicoesPurchases() {
    const content = document.getElementById('requisicoes-content');
    if (!content) return;
    const draft = typeof takeRequisicoesPurchaseDraft === 'function' ? takeRequisicoesPurchaseDraft() : null;
    content.innerHTML = renderRequisicoesPurchaseForm(draft);
    await setupRequisicoesPurchaseForm(draft);
}

async function submitRequisicoesPurchase(draft, submitOptions = {}) {
    const orderId = Number(document.getElementById('requisicoes-purchase-order')?.value) || null;
    const orderProjectId = Number(document.getElementById('requisicoes-purchase-project')?.value) || null;
    const purchaseType = document.getElementById('requisicoes-purchase-type')?.value;
    const subtypeId = Number(document.getElementById('requisicoes-purchase-subtype')?.value) || null;
    const observation = document.getElementById('requisicoes-purchase-observation')?.value?.trim() || '';
    const file = document.getElementById('requisicoes-purchase-file')?.files?.[0] || null;
    const lockedImplementation = draft?.origin === 'implementation';
    const lockedEai = draft?.origin === 'externalAssemblyInspection';
    const lockedAssistance = draft?.origin === 'assistance';
    const lockedManual = !lockedImplementation && !lockedEai && !lockedAssistance;

    if (!lockedAssistance && (!orderId || !orderProjectId)) {
        alertAppDialog('Informe pedido e projeto.');
        return;
    }
    if (lockedImplementation && !(draft?.purchaseItems || []).length) {
        alertAppDialog('Nenhuma lista da implantação está marcada para envio.');
        return;
    }
    if ((lockedManual || lockedEai || lockedAssistance) && !purchaseType) {
        alertAppDialog('Informe pedido, projeto e tipo.');
        return;
    }
    if ((lockedManual || lockedEai || lockedAssistance) && purchaseType === 'Terceiro' && !subtypeId) {
        alertAppDialog('Selecione o subtipo de terceiro.');
        return;
    }
    const form = document.getElementById('requisicoes-purchase-form');
    const send = async () => {
        let reasonId = null;
        if (lockedImplementation) {
            reasonId = await resolveRequisicoesImplantacaoPurchaseReasonId();
            if (!reasonId) {
                throw new Error(`Motivo "Implantação" não encontrado no cadastro. ${requisicoesPurchaseSqlHint()}`);
            }
        } else if (lockedEai) {
            reasonId = Number(document.getElementById('requisicoes-purchase-reason')?.value)
                || Number(draft?.purchaseReasonId)
                || await resolveRequisicoesVistoriaPurchaseReasonId();
            if (!reasonId) {
                throw new Error('Motivo "Vistoria" não encontrado. Execute supabase/feats/add-purchase-external-assembly-inspection-id.sql no Supabase SQL Editor.');
            }
        } else if (lockedAssistance) {
            reasonId = Number(document.getElementById('requisicoes-purchase-reason')?.value)
                || Number(draft?.purchaseReasonId)
                || await resolveRequisicoesAssistenciaPurchaseReasonId();
            if (!reasonId) {
                throw new Error('Motivo "Assistência" não encontrado. Execute supabase/feats/add-purchase-assistance-request-id.sql no Supabase SQL Editor.');
            }
        } else {
            reasonId = Number(document.getElementById('requisicoes-purchase-reason-select')?.value) || null;
            if (!reasonId) {
                throw new Error(`Selecione o motivo. ${requisicoesPurchaseSqlHint()}`);
            }
            const reasons = await loadRequisicoesPurchaseReasons();
            const selected = reasons.find(item => Number(item.id) === reasonId);
            if (typeof isPurchaseReasonSystemType === 'function' && isPurchaseReasonSystemType(selected)) {
                throw new Error('Este motivo é exclusivo de fluxos automáticos do sistema.');
            }
        }

        const uploaded = await uploadRequisicoesPurchaseFile(file, orderProjectId, {
            assistanceRequestId: lockedAssistance ? Number(draft?.assistanceRequestId) : null
        });
        const extras = {
            purchaseReasonId: reasonId,
            observation,
            attachmentPath: uploaded.path,
            attachmentFileName: uploaded.fileName,
            thirdPartySubtypeId: subtypeId
        };

        if (lockedImplementation) {
            if (typeof continueImplantacaoPurchaseRequest !== 'function') {
                throw new Error('Envio da implantação indisponível.');
            }
            await continueImplantacaoPurchaseRequest(draft, extras);
        } else if (typeof createManualPurchaseRequest === 'function') {
            const requestOrigin = lockedEai
                ? 'externalAssemblyInspection'
                : (lockedAssistance ? 'assistance' : 'manual');
            await createManualPurchaseRequest({
                orderProjectId: orderProjectId || null,
                purchaseType,
                requestOrigin,
                externalAssemblyInspectionId: lockedEai ? Number(draft?.externalAssemblyInspectionId) : null,
                assistanceRequestId: lockedAssistance ? Number(draft?.assistanceRequestId) : null,
                ...extras
            });
        } else {
            throw new Error('Não foi possível registrar a compra.');
        }

        const notifyCompras = (lockedManual || lockedEai || lockedAssistance) && typeof notifyRequisicoesPurchaseEmail === 'function';
        if (notifyCompras) {
            if (submitOptions.appOverlay?.setLoading) {
                submitOptions.appOverlay.setLoading(true, 'Enviando e-mail e notificação...', 'loading');
            } else if (typeof setGestaoCadastroSaveOverlayLoading === 'function') {
                setGestaoCadastroSaveOverlayLoading(true, 'Enviando e-mail e notificação...', 'loading');
            }
            await notifyRequisicoesPurchaseEmail({
                orderProjectId: orderProjectId || null,
                assistanceRequestId: lockedAssistance ? Number(draft?.assistanceRequestId) : null,
                orderCode: draft?.orderCode || '',
                clientName: draft?.clientName || '',
                purchaseType,
                projectName: lockedAssistance ? '' : resolveRequisicoesPurchaseProjectName(lockedEai),
                reasonName: resolveRequisicoesPurchaseReasonName(lockedEai, lockedAssistance),
                subtypeName: purchaseType === 'Terceiro'
                    ? selectedRequisicoesPurchaseLabel('requisicoes-purchase-subtype')
                    : '',
                observation,
                attachmentFileName: uploaded.fileName
            });
        }

        if (!submitOptions.keepDraft && typeof clearRequisicoesPurchaseDraft === 'function') {
            clearRequisicoesPurchaseDraft();
        }
        if (typeof submitOptions.onSuccess === 'function') {
            await submitOptions.onSuccess();
        } else {
            alertAppDialog('Enviado para compras.', {
                title: 'Compras',
                confirmClass: 'fm-btn fm-btn--secondary fm-btn--block'
            });
            form?.reset();
            syncRequisicoesPurchaseSubtypeVisibility();
        }
    };

    const overlayRunner = submitOptions.appOverlay?.runAction;
    if (typeof overlayRunner === 'function') {
        await overlayRunner({
            loadingMessage: 'Enviando para compras...',
            successMessage: 'Enviado para compras!',
            formatError: (error) => error?.message || 'Erro ao enviar para compras.',
            task: send
        });
        return;
    }

    try {
        if (typeof withGestaoCadastroSaveOverlay === 'function') {
            await withGestaoCadastroSaveOverlay(form, send, 'Enviando para compras...');
            return;
        }
        await send();
    } catch (error) {
        alertAppDialog(error.message || 'Erro ao enviar para compras.');
    }
}

function selectedRequisicoesPurchaseLabel(selectId) {
    const field = document.getElementById(selectId);
    if (!field) return '';
    if (field.tagName === 'INPUT') {
        const text = String(field.value || '').trim();
        return text && !/^selecione/i.test(text) ? text : '';
    }
    const text = field.selectedOptions?.[0]?.textContent?.trim() || '';
    if (!field.value || /^selecione/i.test(text)) return '';
    return text;
}

function resolveRequisicoesPurchaseProjectName(lockedEai) {
    if (lockedEai) {
        const locked = document.getElementById('requisicoes-purchase-project-locked');
        const label = String(locked?.value || '').trim();
        if (label) return label;
    }
    return selectedRequisicoesPurchaseLabel('requisicoes-purchase-project');
}

function resolveRequisicoesPurchaseReasonName(lockedEai, lockedAssistance = false) {
    if (lockedAssistance) return 'Assistência';
    if (lockedEai) return 'Vistoria';
    const lockedLabel = String(document.getElementById('requisicoes-purchase-reason-locked')?.value || '').trim();
    if (lockedLabel) return lockedLabel;
    return selectedRequisicoesPurchaseLabel('requisicoes-purchase-reason-select');
}

window.loadRequisicoesPurchases = loadRequisicoesPurchases;
window.mountRequisicoesPurchaseForm = mountRequisicoesPurchaseForm;
window.submitRequisicoesPurchase = submitRequisicoesPurchase;
