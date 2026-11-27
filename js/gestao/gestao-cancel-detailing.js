let gestaoCancelDetailingRowsCache = [];

const gestaoCancelDetailingOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('gestao-cancel-detailing')
    : null;

const GESTAO_CANCEL_DETAILING_NOT_READY_STATUSES = [
    typeof DETALHAMENTO_STATUS_AGUARDANDO !== 'undefined' ? DETALHAMENTO_STATUS_AGUARDANDO : 'Aguardando Detalhamento',
    typeof DETALHAMENTO_STATUS_EM_ANDAMENTO !== 'undefined' ? DETALHAMENTO_STATUS_EM_ANDAMENTO : 'Detalhamento'
];

const GESTAO_CANCEL_DETAILING_STATUS_CANCELADO = typeof DETALHAMENTO_STATUS_CANCELADO !== 'undefined'
    ? DETALHAMENTO_STATUS_CANCELADO
    : 'Cancelado';

function getGestaoCancelDetailingSelect() {
    const orderSelect = typeof getSalesOrderMinimalEmbedSelect === 'function'
        ? getSalesOrderMinimalEmbedSelect()
        : 'id, orderCode, clientId, client:Client(name)';
    return `
        id, orderProjectId, detailingType, status, createdAt,
        orderProject:OrderProject(
            id, orderId, projectCode, name, statusId,
            order:salesOrders(${orderSelect}),
            projectStatus:OrderProjectStatus(id, name)
        )
    `;
}

function setGestaoCancelDetailingLoading(active, message = 'Processando...', status = 'loading') {
    gestaoCancelDetailingOverlay?.setLoading(active, message, status);
}

function getGestaoCancelDetailingFilters() {
    return {
        orderCode: typeof getOrderSearchFilterComboboxTerm === 'function'
            ? getOrderSearchFilterComboboxTerm('gestao-cancel-detailing', 'gestao-cancel-detailing-filter-order-search')
            : '',
        clientName: document.getElementById('gestao-cancel-detailing-filter-client')?.value.trim() || ''
    };
}

function initGestaoCancelDetailingOrderCombobox() {
    if (typeof initOrderSearchFilterCombobox !== 'function') return;
    initOrderSearchFilterCombobox('gestao-cancel-detailing', {
        wrap: document.getElementById('gestao-cancel-detailing-filter-order-wrap'),
        input: document.getElementById('gestao-cancel-detailing-filter-order-search'),
        list: document.getElementById('gestao-cancel-detailing-filter-order-list')
    });
}

function getGestaoCancelDetailingProjectStatusName(row) {
    const project = row?.orderProject;
    return project?.projectStatus?.name
        || (typeof gestaoProjectStatusesCache !== 'undefined'
            ? gestaoProjectStatusesCache.find(status => Number(status.id) === Number(project?.statusId))?.name
            : null)
        || '—';
}

function matchesGestaoCancelDetailingFilters(row, filters = {}) {
    const orderCode = String(filters.orderCode || '').trim().toLowerCase();
    const clientName = String(filters.clientName || '').trim().toLowerCase();
    const order = row?.orderProject?.order;

    if (orderCode) {
        const code = String(order?.orderCode || '').trim().toLowerCase();
        if (!code.includes(orderCode)) return false;
    }
    if (clientName) {
        const client = typeof getOrderClientName === 'function'
            ? String(getOrderClientName(order) || '').trim().toLowerCase()
            : String(order?.client?.name || '').trim().toLowerCase();
        if (!client.includes(clientName)) return false;
    }
    return true;
}

function isGestaoCancelDetailingRowEligible(row) {
    if (typeof isDetailingStatusCanceled === 'function' && isDetailingStatusCanceled(row?.status)) {
        return false;
    }
    return String(row?.status || '').trim() !== GESTAO_CANCEL_DETAILING_STATUS_CANCELADO;
}

async function fetchGestaoCancelDetailingRows(filters = {}) {
    let { data, error } = await supabaseClient
        .from('Detailing')
        .select(getGestaoCancelDetailingSelect())
        .in('status', GESTAO_CANCEL_DETAILING_NOT_READY_STATUSES)
        .order('createdAt', { ascending: false })
        .limit(400);

    if (error?.message?.includes('projectStatus')) {
        ({ data, error } = await supabaseClient
            .from('Detailing')
            .select(`
                id, orderProjectId, detailingType, status, createdAt,
                orderProject:OrderProject(
                    id, orderId, projectCode, name, statusId,
                    order:salesOrders(id, orderCode, clientId, client:Client(name))
                )
            `)
            .in('status', GESTAO_CANCEL_DETAILING_NOT_READY_STATUSES)
            .order('createdAt', { ascending: false })
            .limit(400));
    }

    if (error?.message?.includes('detailingType')) {
        ({ data, error } = await supabaseClient
            .from('Detailing')
            .select(`
                id, orderProjectId, status, createdAt,
                orderProject:OrderProject(
                    id, orderId, projectCode, name, statusId,
                    order:salesOrders(id, orderCode, clientId, client:Client(name))
                )
            `)
            .in('status', GESTAO_CANCEL_DETAILING_NOT_READY_STATUSES)
            .order('createdAt', { ascending: false })
            .limit(400));
    }

    if (error?.message?.includes('Detailing')) {
        throw new Error('Tabela Detailing não encontrada.');
    }
    if (error) throw new Error(error.message);

    return (data || [])
        .filter(row => isGestaoCancelDetailingRowEligible(row))
        .filter(row => matchesGestaoCancelDetailingFilters(row, filters))
        .filter(row => !(typeof isOrderProjectGroupedChild === 'function'
            && isOrderProjectGroupedChild(row.orderProject)));
}

function renderGestaoCancelDetailingEmptyRow(message) {
    return `
        <tr>
            <td colspan="7" class="p-6 text-center text-xs text-slate-500">${escapeHtml(message)}</td>
        </tr>
    `;
}

function renderGestaoCancelDetailingList(rows = gestaoCancelDetailingRowsCache) {
    const tbody = document.getElementById('gestao-cancel-detailing-list');
    const countEl = document.getElementById('gestao-cancel-detailing-count');
    if (!tbody) return;

    if (countEl) {
        countEl.textContent = `${rows.length} projeto${rows.length === 1 ? '' : 's'}`;
    }

    if (!rows.length) {
        tbody.innerHTML = renderGestaoCancelDetailingEmptyRow(
            'Nenhum projeto com detalhamento não finalizado para os filtros informados.'
        );
        return;
    }

    tbody.innerHTML = rows.map(row => {
        const project = row.orderProject || {};
        const projectName = project.name || '—';
        const projectStatus = getGestaoCancelDetailingProjectStatusName(row);
        const projectStatusClass = typeof getOrderProjectStatusBadgeClass === 'function'
            ? getOrderProjectStatusBadgeClass(projectStatus)
            : 'bg-slate-100 text-slate-700';
        const detailingStatus = row.status || '—';
        const detailingStatusClass = typeof getDetalhamentoStatusBadgeClass === 'function'
            ? getDetalhamentoStatusBadgeClass(detailingStatus)
            : 'bg-slate-100 text-slate-700';
        const typeLabel = typeof formatDetailingTypeLabel === 'function'
            ? formatDetailingTypeLabel(row.detailingType)
            : 'Montagem';

        return `
            <tr data-detailing-id="${row.id}" data-project-id="${project.id}">
                <td class="p-3 font-mono text-xs text-indigo-800 whitespace-nowrap">${escapeHtml(project.order?.orderCode || '—')}</td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(typeof getOrderClientName === 'function' ? (getOrderClientName(project.order) || '—') : '—')}</td>
                <td class="p-3 text-xs text-slate-800">${escapeHtml(projectName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(typeLabel)}</td>
                <td class="p-3 whitespace-nowrap">
                    <span class="inline-flex text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${detailingStatusClass}">
                        ${escapeHtml(detailingStatus)}
                    </span>
                </td>
                <td class="p-3 whitespace-nowrap">
                    <span class="inline-flex text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${projectStatusClass}">
                        ${escapeHtml(projectStatus)}
                    </span>
                </td>
                <td class="p-3 text-right">
                    <button type="button"
                        class="gestao-cancel-detailing-cancel text-[10px] bg-rose-700 text-white hover:bg-rose-800 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
                        data-detailing-id="${row.id}"
                        data-project-id="${Number(project.id)}"
                        data-project-name="${escapeHtml(projectName)}"
                        data-order-code="${escapeHtml(project.order?.orderCode || '')}"
                        data-detailing-type-label="${escapeHtml(typeLabel)}">
                        Cancelar
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadGestaoCancelDetailingList() {
    const tbody = document.getElementById('gestao-cancel-detailing-list');
    const countEl = document.getElementById('gestao-cancel-detailing-count');
    if (!tbody || !isAdmin()) return;

    tbody.innerHTML = renderGestaoCancelDetailingEmptyRow('Carregando...');
    if (countEl) countEl.textContent = '…';

    try {
        if (typeof loadGestaoProjectStatuses === 'function' && !(gestaoProjectStatusesCache || []).length) {
            await loadGestaoProjectStatuses();
        }

        const filters = getGestaoCancelDetailingFilters();
        gestaoCancelDetailingRowsCache = await fetchGestaoCancelDetailingRows(filters);
        renderGestaoCancelDetailingList(gestaoCancelDetailingRowsCache);
    } catch (error) {
        console.error('loadGestaoCancelDetailingList:', error);
        gestaoCancelDetailingRowsCache = [];
        if (countEl) countEl.textContent = '0 projetos';
        tbody.innerHTML = renderGestaoCancelDetailingEmptyRow(`Erro ao buscar: ${error.message}`);
    }
}

function resetGestaoCancelDetailingFilters() {
    if (typeof clearOrderSearchFilterCombobox === 'function') {
        clearOrderSearchFilterCombobox('gestao-cancel-detailing');
    }
    const clientInput = document.getElementById('gestao-cancel-detailing-filter-client');
    if (clientInput) clientInput.value = '';
}

async function cancelGestaoDetailingRecord(detailingId, projectName, orderCode, detailingTypeLabel) {
    if (!isAdmin()) {
        alertAppDialog('Somente administradores podem cancelar detalhamento por esta tela.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const key = Number(detailingId);
    if (!key) {
        alertAppDialog('Detalhamento inválido.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const label = [orderCode, projectName].filter(Boolean).join(' — ') || projectName || 'projeto';
    const typePart = detailingTypeLabel ? ` (${detailingTypeLabel})` : '';
    const confirmed = await confirmAppDialog(
        `Cancelar o detalhamento${typePart} de "${label}"? O status do detalhamento passará para Cancelado. O projeto não será alterado.`,
        { title: 'Cancelar detalhamento', confirmLabel: 'Cancelar detalhamento', variant: 'danger' }
    );
    if (!confirmed) return;

    try {
        setGestaoCancelDetailingLoading(true, 'Cancelando detalhamento...');

        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('Detailing')
            .update({
                status: GESTAO_CANCEL_DETAILING_STATUS_CANCELADO,
                updatedAt: now,
                updatedById: currentUser?.id || null
            })
            .eq('id', key);

        if (error) {
            if (/Detailing_status_check|check constraint|violates check/i.test(error.message || '')) {
                throw new Error(
                    'Status Cancelado ainda não existe no banco. Execute supabase/feats/add-detailing-status-cancelado.sql no Supabase SQL Editor.'
                );
            }
            throw error;
        }

        setGestaoCancelDetailingLoading(true, 'Atualizando lista...', 'loading');
        await loadGestaoCancelDetailingList();
        setGestaoCancelDetailingLoading(true, 'Detalhamento cancelado.', 'success');
        await waitAppOverlay(APP_OVERLAY_SUCCESS_MS);
        setGestaoCancelDetailingLoading(false);
    } catch (error) {
        console.error('cancelGestaoDetailingRecord:', error);
        setGestaoCancelDetailingLoading(true, `Erro ao cancelar: ${error.message}`, 'error');
        await waitAppOverlay(APP_OVERLAY_ERROR_MS);
        setGestaoCancelDetailingLoading(false);
    }
}

function showGestaoCancelDetailingPanel() {
    if (!isAdmin()) {
        alertAppDialog('Somente administradores podem acessar Cancelar Detalhamento.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (typeof showSystemSettings === 'function') {
        void showSystemSettings('cancel-detailing');
    }
}

function bindGestaoCancelDetailingEvents() {
    document.getElementById('settings-nav-cancel-detailing')?.addEventListener('click', () => {
        showGestaoCancelDetailingPanel();
    });

    document.getElementById('gestao-cancel-detailing-filter-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await loadGestaoCancelDetailingList();
    });

    document.getElementById('gestao-cancel-detailing-filter-clear')?.addEventListener('click', async () => {
        resetGestaoCancelDetailingFilters();
        await loadGestaoCancelDetailingList();
    });

    document.getElementById('gestao-cancel-detailing-list')?.addEventListener('click', async (event) => {
        const button = event.target.closest('.gestao-cancel-detailing-cancel');
        if (!button) return;
        await cancelGestaoDetailingRecord(
            Number(button.dataset.detailingId),
            button.dataset.projectName || '',
            button.dataset.orderCode || '',
            button.dataset.detailingTypeLabel || ''
        );
    });
}

bindGestaoCancelDetailingEvents();
initGestaoCancelDetailingOrderCombobox();

window.loadGestaoCancelDetailingList = loadGestaoCancelDetailingList;