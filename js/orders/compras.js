const COMPRA_STATUS_ABERTO = 'Aberto';
const COMPRA_STATUS_ORCADO = 'Orçado';
const COMPRA_STATUS_AGUARDANDO_ENTREGA = 'Aguardando Entrega';
const COMPRA_STATUS_FECHADO = 'Fechado';

const COMPRA_TIPO_MATERIAL = 'Material';
const COMPRA_TIPO_FERRAGEM = 'Ferragem';
const COMPRA_TIPO_TINTA = 'Tinta';
const COMPRA_TIPO_TERCEIRO = 'Terceiro';

const IMPLANTACAO_COMPRA_SEND_ITEMS = [
    {
        key: 'comprasMateriais',
        tipoCompra: COMPRA_TIPO_MATERIAL,
        checkedKey: 'comprasMateriaisChecked',
        pathKey: 'comprasMateriaisPath',
        sentKey: 'comprasMateriaisEnviadoComercial'
    },
    {
        key: 'listaFerragens',
        tipoCompra: COMPRA_TIPO_FERRAGEM,
        checkedKey: 'listaFerragensChecked',
        pathKey: 'listaFerragensPath',
        sentKey: 'listaFerragensEnviadoComercial'
    },
    {
        key: 'listaTintas',
        tipoCompra: COMPRA_TIPO_TINTA,
        checkedKey: 'listaTintasChecked',
        pathKey: 'listaTintasPath',
        sentKey: 'listaTintasEnviadoComercial'
    },
    {
        key: 'terceiros',
        tipoCompra: COMPRA_TIPO_TERCEIRO,
        checkedKey: 'terceirosChecked',
        pathKey: 'terceirosPath',
        sentKey: 'terceirosEnviadoComercial'
    }
];

let activeCompraRecord = null;

function formatCompraTipoLabel(tipoCompra) {
    if (tipoCompra === 'Lista de Material') return COMPRA_TIPO_MATERIAL;
    return tipoCompra || '—';
}

function getCompraImplantacaoPathKey(tipoCompra) {
    const tipo = formatCompraTipoLabel(tipoCompra);
    if (tipo === COMPRA_TIPO_MATERIAL) return 'comprasMateriaisPath';
    if (tipo === COMPRA_TIPO_FERRAGEM) return 'listaFerragensPath';
    if (tipo === COMPRA_TIPO_TINTA) return 'listaTintasPath';
    if (tipo === COMPRA_TIPO_TERCEIRO) return 'terceirosPath';
    return null;
}

function getCompraListaPathFromImplantacao(tipoCompra, implantacao) {
    const pathKey = getCompraImplantacaoPathKey(tipoCompra);
    if (!pathKey || !implantacao) return '';
    return implantacao[pathKey] || '';
}

async function fetchImplantacaoPathsForCompra(implantacaoId) {
    if (!implantacaoId) return null;

    const { data, error } = await supabaseClient
        .from('Implantacao')
        .select('comprasMateriaisPath, listaFerragensPath, listaTintasPath, terceirosPath')
        .eq('id', implantacaoId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

function getCompraStatusBadgeClass(status) {
    if (status === COMPRA_STATUS_ORCADO) return 'bg-sky-100 text-sky-800';
    if (status === COMPRA_STATUS_AGUARDANDO_ENTREGA) return 'bg-violet-100 text-violet-800';
    if (status === COMPRA_STATUS_FECHADO) return 'bg-slate-200 text-slate-700';
    return 'bg-amber-100 text-amber-800';
}

function getImplantacaoCompraSendItems(formValues, record = null) {
    return IMPLANTACAO_COMPRA_SEND_ITEMS.filter(item => {
        const isChecked = Boolean(formValues?.[item.checkedKey]);
        const hasPath = Boolean(formValues?.[item.pathKey]);
        const alreadySent = Boolean(record?.[item.sentKey]);
        return isChecked && hasPath && !alreadySent;
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
        .select('id, projectCode, name, order:salesOrders(orderCode, clientName)')
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
                .select('orderCode, clientName')
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
        clientName: result.data?.order?.clientName || '',
        projectName: result.data?.name || ''
    };
}

async function enrichCompraRecord(record) {
    if (!record) return record;

    let enriched = { ...record };

    if (record.orderProjectId) {
        try {
            const context = await fetchOrderProjectCodesForCompra(record.orderProjectId);
            enriched = {
                ...enriched,
                clientName: context.clientName,
                projectName: context.projectName
            };
        } catch (error) {
            console.warn('enrichCompraRecord:', error);
        }
    }

    if (record.implantacaoId) {
        try {
            const implantacao = await fetchImplantacaoPathsForCompra(record.implantacaoId);
            enriched.listaPath = getCompraListaPathFromImplantacao(record.tipoCompra, implantacao);
        } catch (error) {
            console.warn('enrichCompraRecord implantacao:', error);
        }
    }

    return enriched;
}

async function createComprasRecordsFromImplantacaoSend(options = {}) {
    const {
        implantacaoId,
        orderProjectId,
        formValues,
        record = null
    } = options;

    const items = getImplantacaoCompraSendItems(formValues, record);
    if (!items.length) return [];

    const codes = await fetchOrderProjectCodesForCompra(orderProjectId);
    const now = new Date().toISOString();
    const rows = items.map(item => ({
        orderCode: codes.orderCode,
        projectCode: codes.projectCode,
        implantacaoId,
        orderProjectId,
        tipoCompra: item.tipoCompra,
        status: COMPRA_STATUS_ABERTO,
        createdById: currentUser?.id || null,
        updatedById: currentUser?.id || null,
        updatedAt: now
    }));

    const { data, error } = await supabaseClient
        .from('Compras')
        .insert(rows)
        .select('*');

    if (error) {
        if (error.message?.includes('Compras') || error.message?.includes('does not exist')) {
            throw new Error('Tabela Compras não encontrada. Execute supabase/create-compras.sql no Supabase.');
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
    const { data: order, error: orderError } = await supabaseClient
        .from('salesOrders')
        .select('orderCode')
        .eq('id', orderId)
        .maybeSingle();

    if (orderError) throw orderError;
    if (!order?.orderCode) return [];

    const { data, error } = await supabaseClient
        .from('Compras')
        .select('*')
        .eq('orderCode', order.orderCode)
        .order('createdAt', { ascending: false });

    if (error?.message?.includes('Compras') || error?.message?.includes('does not exist')) {
        throw new Error('Tabela Compras não encontrada. Execute supabase/create-compras.sql no Supabase.');
    }

    if (error) throw error;
    return data || [];
}

async function fetchOrderComprasItems(orderId) {
    const compras = await fetchComprasByOrderId(orderId);
    if (!compras.length) return [];

    const projectIds = [...new Set(compras.map(item => item.orderProjectId).filter(Boolean))];
    let projectsById = {};

    if (projectIds.length) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select('id, name')
            .in('id', projectIds);

        if (error) throw error;
        projectsById = Object.fromEntries((data || []).map(project => [project.id, project]));
    }

    return compras.map(compra => ({
        ...compra,
        projectName: projectsById[compra.orderProjectId]?.name || ''
    }));
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
        const tipoLabel = formatCompraTipoLabel(item.tipoCompra);
        const statusClass = getCompraStatusBadgeClass(item.status);
        const previsaoLabel = formatCompraDisplayDate(item.previsaoEntrega);
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

async function loadOrderCompras(orderId) {
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
    if (!activeOrderId || typeof loadOrderCompras !== 'function') return;
    if (document.getElementById('order-tab-panel-compras')?.classList.contains('hidden')) return;
    await loadOrderCompras(activeOrderId);
}

async function fetchComprasAbertas() {
    const { data, error } = await supabaseClient
        .from('Compras')
        .select('*')
        .neq('status', COMPRA_STATUS_FECHADO)
        .order('createdAt', { ascending: false });

    if (error?.message?.includes('Compras') || error?.message?.includes('does not exist')) {
        return {
            error: new Error('Tabela Compras não encontrada. Execute supabase/create-compras.sql no Supabase.'),
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
        .from('Compras')
        .select('*')
        .eq('id', compraId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

function readCompraFormValues() {
    return {
        status: document.getElementById('compra-modal-status')?.value || COMPRA_STATUS_ABERTO,
        previsaoEntrega: fromCompraDateInputValue(document.getElementById('compra-modal-previsao-entrega')?.value),
        observacao: document.getElementById('compra-modal-observacao')?.value?.trim() || '',
        orcamentoPath: document.getElementById('compra-modal-orcamento-path')?.value?.trim() || ''
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

function setCompraModalLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('compra-modal-loading');
    const messageEl = document.getElementById('compra-modal-loading-msg');
    const spinner = document.getElementById('compra-modal-loading-spinner');
    const successIcon = document.getElementById('compra-modal-loading-success');
    const errorIcon = document.getElementById('compra-modal-loading-error');
    const show = Boolean(active);

    overlay?.classList.toggle('hidden', !show);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.toggle('text-red-600', status === 'error');
        messageEl.classList.toggle('text-emerald-700', status === 'success');
        messageEl.classList.toggle('text-slate-700', status === 'loading');
    }

    spinner?.classList.toggle('hidden', status !== 'loading');
    successIcon?.classList.toggle('hidden', status !== 'success');
    errorIcon?.classList.toggle('hidden', status !== 'error');

    setCompraFormDisabled(show);
    const closeBtn = document.querySelector('#compra-modal button[onclick="closeCompraModal()"]');
    if (closeBtn) closeBtn.disabled = show;
}

function populateCompraForm(record) {
    const tipoLabel = formatCompraTipoLabel(record?.tipoCompra);
    document.getElementById('compra-modal-order-code').textContent = record?.orderCode || '—';
    document.getElementById('compra-modal-client-name').textContent = ` ${record?.clientName || '—'}`;
    document.getElementById('compra-modal-project-name').textContent = ` ${record?.projectName || '—'}`;
    document.getElementById('compra-modal-tipo').textContent = ` ${tipoLabel}`;
    document.getElementById('compra-modal-lista-path').textContent = ` ${record?.listaPath || '—'}`;
    document.getElementById('compra-modal-status').value = record?.status || COMPRA_STATUS_ABERTO;
    document.getElementById('compra-modal-previsao-entrega').value = toCompraDateInputValue(record?.previsaoEntrega);
    document.getElementById('compra-modal-observacao').value = record?.observacao || '';
    document.getElementById('compra-modal-orcamento-path').value = record?.orcamentoPath || '';

    const badge = document.getElementById('compra-modal-status-badge');
    const status = record?.status || COMPRA_STATUS_ABERTO;
    if (badge) {
        badge.textContent = status;
        badge.className = `text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${getCompraStatusBadgeClass(status)}`;
    }
}

async function openCompraModal(compraId) {
    if (!compraId) return;

    try {
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
        if (error.message?.includes('Compras') || error.message?.includes('does not exist')) {
            alertAppDialog('Tabela Compras não encontrada. Execute supabase/create-compras.sql no Supabase.');
        } else {
            alertAppDialog('Erro ao abrir compra: ' + error.message);
        }
    }
}

function closeCompraModal() {
    setCompraModalLoading(false);
    toggleModal('compra-modal', false);
    activeCompraRecord = null;
}
window.closeCompraModal = closeCompraModal;
window.openCompraModal = openCompraModal;

async function handleCompraSalvar() {
    if (!activeCompraRecord?.id || !canActCompraModal()) return;

    try {
        setCompraModalLoading(true, 'Salvando compra...');

        const formValues = readCompraFormValues();
        const now = new Date().toISOString();
        const { data, error } = await supabaseClient
            .from('Compras')
            .update({
                status: formValues.status,
                previsaoEntrega: formValues.previsaoEntrega,
                observacao: formValues.observacao || null,
                orcamentoPath: formValues.orcamentoPath || null,
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
            listaPath: activeCompraRecord?.listaPath
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

        closeCompraModal();
    } catch (error) {
        setCompraModalLoading(true, `Erro ao salvar compra: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setCompraModalLoading(false);
        setCompraFormDisabled(!canActCompraModal());
    }
}

function bindCompraEvents() {
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
        openCompraModal(compraId);
    });
}
