const REQUISICOES_PURCHASE_TYPES = [
    { value: 'Material', label: 'Lista de Material' },
    { value: 'Ferragem', label: 'Lista de Ferragem' },
    { value: 'Tinta', label: 'Lista de Tinta' },
    { value: 'Terceiro', label: 'Terceiro' }
];

const REQUISICOES_PURCHASE_TYPE_IMPLEMENTATION = 'Implantação';
const PURCHASE_REQUEST_FILES_BUCKET = 'purchase-request-files';

let requisicoesPurchaseOrders = [];
let requisicoesPurchaseOrderHighlight = -1;
let requisicoesPurchaseOrderQuery = '';

function requisicoesPurchaseSqlHint() {
    return 'Execute supabase/feats/add-purchase-request-reasons.sql no Supabase SQL Editor.';
}

async function loadRequisicoesPurchaseReasons() {
    const { data, error } = await supabaseClient
        .from('PurchaseReason')
        .select('id, name, sortOrder, isActive')
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
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

async function uploadRequisicoesPurchaseFile(file, orderProjectId) {
    if (!file) return { path: null, fileName: null };
    const env = window.FORMIGHIERI_APP_ENV === 'prod' ? 'prod' : 'dev';
    const safeName = String(file.name || 'arquivo')
        .trim()
        .replace(/[^\w.\-() ]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 120);
    const path = `${env}/${orderProjectId || 'sem-projeto'}/${Date.now()}-${safeName}`;
    const { error } = await supabaseClient.storage
        .from(PURCHASE_REQUEST_FILES_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined });

    if (error) {
        throw new Error(`${error.message}. ${requisicoesPurchaseSqlHint()}`);
    }

    return { path, fileName: file.name };
}

function renderRequisicoesPurchaseForm(draft) {
    const locked = draft?.origin === 'implementation';
    const typeOptions = REQUISICOES_PURCHASE_TYPES.map(type => (
        `<option value="${type.value}">${escapeHtml(type.label)}</option>`
    )).join('');

    return `
        <form id="requisicoes-purchase-form" class="relative bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 space-y-4">
            <div>
                <h2 class="font-bold text-sm text-slate-900">Enviar para compras</h2>
                <p class="text-xs text-slate-400 mt-1">${locked
                    ? 'Esta compra veio da implantação. O tipo fica fixo em Implantação.'
                    : 'Escolha o pedido, o projeto e o tipo da lista. Se for terceiro, informe o subtipo.'}</p>
            </div>
            <div id="requisicoes-purchase-sql-hint" class="hidden text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="relative" id="requisicoes-purchase-order-wrap">
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-order-search">Pedido</label>
                    <input id="requisicoes-purchase-order-search" type="text" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="requisicoes-purchase-order-list" aria-autocomplete="list" placeholder="Digite o nome do cliente" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" ${locked ? 'disabled' : ''}>
                    <input type="hidden" id="requisicoes-purchase-order" value="">
                    <div id="requisicoes-purchase-order-list" class="hidden absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg" role="listbox"></div>
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-project">Projeto</label>
                    <select id="requisicoes-purchase-project" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" ${locked ? 'disabled' : ''}></select>
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-type">Tipo</label>
                    <select id="requisicoes-purchase-type" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" ${locked ? 'disabled' : ''}>
                        ${locked
                            ? `<option value="${REQUISICOES_PURCHASE_TYPE_IMPLEMENTATION}">Implantação</option>`
                            : `<option value="">Selecione</option>${typeOptions}`}
                    </select>
                </div>
                <div id="requisicoes-purchase-subtype-wrap" class="hidden">
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-subtype">Subtipo de terceiro</label>
                    <select id="requisicoes-purchase-subtype" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"></select>
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-purchase-reason">Motivo</label>
                    <select id="requisicoes-purchase-reason" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"></select>
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
    if (typeof requisicoesProjectOrderLabel === 'function') return requisicoesProjectOrderLabel(order);
    const clientName = order?.client?.name || '';
    if (clientName && order.orderCode) return `${order.orderCode} — ${clientName}`;
    return order?.orderCode || clientName || `Pedido ${order?.id || ''}`;
}

function filterRequisicoesPurchaseOrders(query) {
    const normalize = typeof normalizeRequisicoesSearch === 'function'
        ? normalizeRequisicoesSearch
        : value => String(value || '').toLowerCase().trim();
    const term = normalize(query);
    const matches = !term
        ? requisicoesPurchaseOrders
        : requisicoesPurchaseOrders.filter(order => {
            const clientName = normalize(order.client?.name);
            const code = normalize(order.orderCode);
            return clientName.includes(term) || code.includes(term);
        });
    return matches.slice(0, 40);
}

function setRequisicoesPurchaseOrderListOpen(open) {
    const list = document.getElementById('requisicoes-purchase-order-list');
    const input = document.getElementById('requisicoes-purchase-order-search');
    if (!list || !input || input.disabled) return;
    list.classList.toggle('hidden', !open);
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) requisicoesPurchaseOrderHighlight = -1;
}

function renderRequisicoesPurchaseOrderOptions() {
    const list = document.getElementById('requisicoes-purchase-order-list');
    if (!list) return;
    const matches = filterRequisicoesPurchaseOrders(requisicoesPurchaseOrderQuery);
    if (!matches.length) {
        requisicoesPurchaseOrderHighlight = -1;
        list.innerHTML = '<p class="px-3 py-2 text-xs text-slate-400">Nenhum pedido encontrado para esse cliente.</p>';
        return;
    }
    list.innerHTML = matches.map((order, index) => {
        const active = index === requisicoesPurchaseOrderHighlight ? ' bg-slate-100' : '';
        return `<button type="button" class="requisicoes-purchase-order-option w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-slate-50${active}" data-order-id="${order.id}" data-option-index="${index}" role="option">${escapeHtml(requisicoesPurchaseOrderLabel(order))}</button>`;
    }).join('');
}

function setRequisicoesPurchaseOrder(orderId) {
    const hidden = document.getElementById('requisicoes-purchase-order');
    const input = document.getElementById('requisicoes-purchase-order-search');
    const order = requisicoesPurchaseOrders.find(item => Number(item.id) === Number(orderId));
    if (hidden) hidden.value = order ? String(order.id) : '';
    if (input && order) input.value = requisicoesPurchaseOrderLabel(order);
    requisicoesPurchaseOrderQuery = '';
    setRequisicoesPurchaseOrderListOpen(false);
}

async function fillRequisicoesPurchaseOrders(selectedOrderId) {
    const input = document.getElementById('requisicoes-purchase-order-search');
    const hidden = document.getElementById('requisicoes-purchase-order');
    if (!input || !hidden) return;
    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, client:Client(name)')
        .order('orderCode', { ascending: false })
        .limit(1000);
    if (error) throw error;
    requisicoesPurchaseOrders = data || [];
    const selected = requisicoesPurchaseOrders.find(order => Number(order.id) === Number(selectedOrderId));
    hidden.value = selected ? String(selected.id) : '';
    input.value = selected ? requisicoesPurchaseOrderLabel(selected) : '';
    requisicoesPurchaseOrderQuery = '';
    renderRequisicoesPurchaseOrderOptions();
}

function bindRequisicoesPurchaseOrderPicker() {
    const input = document.getElementById('requisicoes-purchase-order-search');
    const list = document.getElementById('requisicoes-purchase-order-list');
    if (!input || input.disabled) return;

    input.addEventListener('focus', () => {
        const hidden = document.getElementById('requisicoes-purchase-order');
        const selected = requisicoesPurchaseOrders.find(order => String(order.id) === hidden?.value);
        const selectedLabel = selected ? requisicoesPurchaseOrderLabel(selected) : '';
        requisicoesPurchaseOrderHighlight = -1;
        requisicoesPurchaseOrderQuery = input.value === selectedLabel ? '' : input.value;
        renderRequisicoesPurchaseOrderOptions();
        setRequisicoesPurchaseOrderListOpen(true);
    });

    input.addEventListener('input', () => {
        requisicoesPurchaseOrderQuery = input.value;
        const hidden = document.getElementById('requisicoes-purchase-order');
        const selected = requisicoesPurchaseOrders.find(order => String(order.id) === hidden?.value);
        const selectedLabel = selected ? requisicoesPurchaseOrderLabel(selected) : '';
        if (input.value.trim() !== selectedLabel) {
            if (hidden) hidden.value = '';
            fillRequisicoesPurchaseProjects(null);
        }
        requisicoesPurchaseOrderHighlight = -1;
        renderRequisicoesPurchaseOrderOptions();
        setRequisicoesPurchaseOrderListOpen(true);
    });

    input.addEventListener('keydown', async event => {
        const optionCount = list?.querySelectorAll('.requisicoes-purchase-order-option').length || 0;
        if (event.key === 'Escape') {
            setRequisicoesPurchaseOrderListOpen(false);
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!optionCount) return;
            setRequisicoesPurchaseOrderListOpen(true);
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            requisicoesPurchaseOrderHighlight = (requisicoesPurchaseOrderHighlight + delta + optionCount) % optionCount;
            renderRequisicoesPurchaseOrderOptions();
            list?.querySelector(`[data-option-index="${requisicoesPurchaseOrderHighlight}"]`)?.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (event.key === 'Enter' && list && !list.classList.contains('hidden')) {
            event.preventDefault();
            const options = [...list.querySelectorAll('.requisicoes-purchase-order-option')];
            const highlighted = options[requisicoesPurchaseOrderHighlight] || (options.length === 1 ? options[0] : null);
            if (!highlighted) return;
            setRequisicoesPurchaseOrder(highlighted.dataset.orderId);
            await fillRequisicoesPurchaseProjects(highlighted.dataset.orderId);
        }
    });

    list?.addEventListener('mousedown', event => {
        event.preventDefault();
    });

    list?.addEventListener('click', async event => {
        const button = event.target.closest('[data-order-id]');
        if (!button) return;
        setRequisicoesPurchaseOrder(button.dataset.orderId);
        await fillRequisicoesPurchaseProjects(button.dataset.orderId);
    });

    if (!window.__requisicoesPurchaseOrderOutsideBound) {
        window.__requisicoesPurchaseOrderOutsideBound = true;
        document.addEventListener('mousedown', event => {
            const wrap = document.getElementById('requisicoes-purchase-order-wrap');
            if (!wrap || wrap.contains(event.target)) return;
            setRequisicoesPurchaseOrderListOpen(false);
        });
    }
}

async function fillRequisicoesPurchaseProjects(orderId, selectedProjectId) {
    const select = document.getElementById('requisicoes-purchase-project');
    if (!select) return;
    if (!orderId) {
        select.innerHTML = '<option value="">Selecione o projeto</option>';
        return;
    }
    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('id, name, projectCode')
        .eq('orderId', orderId)
        .order('projectCode', { ascending: true });
    if (error) throw error;
    const selected = selectedProjectId ? String(selectedProjectId) : '';
    select.innerHTML = '<option value="">Selecione o projeto</option>' + (data || []).map(project => {
        const isSelected = String(project.id) === selected ? ' selected' : '';
        return `<option value="${project.id}"${isSelected}>${escapeHtml(project.name || 'Projeto')}</option>`;
    }).join('');
}

function syncRequisicoesPurchaseSubtypeVisibility() {
    const type = document.getElementById('requisicoes-purchase-type')?.value;
    document.getElementById('requisicoes-purchase-subtype-wrap')?.classList.toggle('hidden', type !== 'Terceiro');
}

async function loadRequisicoesPurchases() {
    const content = document.getElementById('requisicoes-content');
    if (!content) return;
    const draft = typeof takeRequisicoesPurchaseDraft === 'function' ? takeRequisicoesPurchaseDraft() : null;
    content.innerHTML = renderRequisicoesPurchaseForm(draft);

    const hint = document.getElementById('requisicoes-purchase-sql-hint');
    try {
        await fillRequisicoesPurchaseOrders(draft?.orderId);
        await fillRequisicoesPurchaseProjects(draft?.orderId, draft?.orderProjectId);
        const subtypes = await loadRequisicoesPurchaseSubtypes();
        const subtypeSelect = document.getElementById('requisicoes-purchase-subtype');
        if (subtypeSelect) {
            subtypeSelect.innerHTML = '<option value="">Selecione o subtipo</option>' + subtypes.map(item => (
                `<option value="${item.id}">${escapeHtml(item.name)}</option>`
            )).join('');
        }
        const reasons = await loadRequisicoesPurchaseReasons();
        const reasonSelect = document.getElementById('requisicoes-purchase-reason');
        if (reasonSelect) {
            reasonSelect.innerHTML = '<option value="">Selecione o motivo</option>' + reasons.map(item => (
                `<option value="${item.id}">${escapeHtml(item.name)}</option>`
            )).join('');
        }
    } catch (error) {
        if (hint) {
            hint.textContent = `${error.message || 'Não foi possível carregar os cadastros.'} ${requisicoesPurchaseSqlHint()}`;
            hint.classList.remove('hidden');
        }
    }

    syncRequisicoesPurchaseSubtypeVisibility();
    bindRequisicoesPurchaseOrderPicker();
    document.getElementById('requisicoes-purchase-type')?.addEventListener('change', syncRequisicoesPurchaseSubtypeVisibility);
    document.getElementById('requisicoes-purchase-form')?.addEventListener('submit', event => {
        event.preventDefault();
        submitRequisicoesPurchase(draft);
    });
}

async function submitRequisicoesPurchase(draft) {
    const orderId = Number(document.getElementById('requisicoes-purchase-order')?.value);
    const orderProjectId = Number(document.getElementById('requisicoes-purchase-project')?.value);
    const purchaseType = document.getElementById('requisicoes-purchase-type')?.value;
    const subtypeId = Number(document.getElementById('requisicoes-purchase-subtype')?.value) || null;
    const reasonId = Number(document.getElementById('requisicoes-purchase-reason')?.value) || null;
    const observation = document.getElementById('requisicoes-purchase-observation')?.value?.trim() || '';
    const file = document.getElementById('requisicoes-purchase-file')?.files?.[0] || null;
    const locked = draft?.origin === 'implementation';

    if (!orderId || !orderProjectId || !purchaseType) {
        alertAppDialog('Informe pedido, projeto e tipo.');
        return;
    }
    if (purchaseType === 'Terceiro' && !subtypeId) {
        alertAppDialog('Selecione o subtipo de terceiro.');
        return;
    }
    if (!reasonId) {
        alertAppDialog(`Selecione o motivo. ${requisicoesPurchaseSqlHint()}`);
        return;
    }

    const form = document.getElementById('requisicoes-purchase-form');
    const send = async () => {
        const uploaded = await uploadRequisicoesPurchaseFile(file, orderProjectId);
        const extras = {
            purchaseReasonId: reasonId,
            observation,
            attachmentPath: uploaded.path,
            attachmentFileName: uploaded.fileName,
            thirdPartySubtypeId: subtypeId
        };

        if (locked) {
            if (typeof continueImplantacaoPurchaseRequest !== 'function') {
                throw new Error('Envio da implantação indisponível.');
            }
            await continueImplantacaoPurchaseRequest(draft, extras);
        } else if (typeof createManualPurchaseRequest === 'function') {
            await createManualPurchaseRequest({
                orderProjectId,
                purchaseType,
                ...extras
            });
        } else {
            throw new Error('Não foi possível registrar a compra.');
        }

        const overlayMessage = form?.querySelector('.gestao-cadastro-save-overlay__msg');
        if (overlayMessage) overlayMessage.textContent = 'Enviando e-mail...';
        if (!locked && typeof notifyRequisicoesPurchaseEmail === 'function') {
            await notifyRequisicoesPurchaseEmail({
                orderProjectId,
                purchaseType,
                projectName: selectedRequisicoesPurchaseLabel('requisicoes-purchase-project'),
                reasonName: selectedRequisicoesPurchaseLabel('requisicoes-purchase-reason'),
                subtypeName: purchaseType === 'Terceiro'
                    ? selectedRequisicoesPurchaseLabel('requisicoes-purchase-subtype')
                    : '',
                observation,
                attachmentFileName: uploaded.fileName
            });
        }

        if (typeof clearRequisicoesPurchaseDraft === 'function') clearRequisicoesPurchaseDraft();
        alertAppDialog('Enviado para compras.', {
            title: 'Compras',
            confirmClass: 'fm-btn fm-btn--secondary fm-btn--block'
        });
        form?.reset();
        syncRequisicoesPurchaseSubtypeVisibility();
    };

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
    const select = document.getElementById(selectId);
    const text = select?.selectedOptions?.[0]?.textContent?.trim() || '';
    if (!select?.value || /^selecione/i.test(text)) return '';
    return text;
}

window.loadRequisicoesPurchases = loadRequisicoesPurchases;
