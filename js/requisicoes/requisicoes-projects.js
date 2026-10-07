let requisicoesProjectsOrderId = null;
let requisicoesOrderProjectsCache = [];
let requisicoesOrderAddrId = null;
let requisicoesProjectsOrders = [];
let requisicoesProjectsOrderHighlight = -1;
let requisicoesProjectsOrderQuery = '';

function normalizeRequisicoesSearch(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function requisicoesProjectOrderLabel(order) {
    const clientName = order?.client?.name || '';
    if (clientName && order.orderCode) return `${order.orderCode} — ${clientName}`;
    return order?.orderCode || clientName || `Pedido ${order?.id || ''}`;
}

function filterRequisicoesProjectOrders(query) {
    const term = normalizeRequisicoesSearch(query);
    const matches = !term
        ? requisicoesProjectsOrders
        : requisicoesProjectsOrders.filter(order => {
            const clientName = normalizeRequisicoesSearch(order.client?.name);
            const code = normalizeRequisicoesSearch(order.orderCode);
            return clientName.includes(term) || code.includes(term);
        });
    return matches.slice(0, 40);
}

function setRequisicoesOrderListOpen(open) {
    const list = document.getElementById('requisicoes-projects-order-list');
    const input = document.getElementById('requisicoes-projects-order-search');
    if (!list || !input) return;
    list.classList.toggle('hidden', !open);
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) requisicoesProjectsOrderHighlight = -1;
}

function renderRequisicoesOrderOptions() {
    const list = document.getElementById('requisicoes-projects-order-list');
    if (!list) return;
    const matches = filterRequisicoesProjectOrders(requisicoesProjectsOrderQuery);
    if (!matches.length) {
        requisicoesProjectsOrderHighlight = -1;
        list.innerHTML = '<p class="px-3 py-2 text-xs text-slate-400">Nenhum pedido encontrado para esse cliente.</p>';
        return;
    }

    list.innerHTML = matches.map((order, index) => {
        const active = index === requisicoesProjectsOrderHighlight ? ' bg-slate-100' : '';
        return `<button type="button" class="requisicoes-order-option w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-slate-50${active}" data-order-id="${order.id}" data-option-index="${index}" role="option">${escapeHtml(requisicoesProjectOrderLabel(order))}</button>`;
    }).join('');
}

async function loadRequisicoesOrderOptions() {
    const input = document.getElementById('requisicoes-projects-order-search');
    if (!input) return;

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, client:Client(name)')
        .order('orderCode', { ascending: false })
        .limit(1000);

    if (error) throw error;
    requisicoesProjectsOrders = data || [];

    const selected = requisicoesProjectsOrders.find(order => Number(order.id) === Number(requisicoesProjectsOrderId));
    input.value = selected ? requisicoesProjectOrderLabel(selected) : '';
    requisicoesProjectsOrderQuery = '';
    renderRequisicoesOrderOptions();
}

function clearRequisicoesOrderDetail() {
    requisicoesOrderProjectsCache = [];
    requisicoesOrderAddrId = null;
    const detail = document.getElementById('requisicoes-order-detail');
    if (detail) {
        detail.innerHTML = '<p class="text-xs text-slate-400">Selecione um pedido para ver os projetos.</p>';
    }
}

async function requisicoesOrderArchitectLabel(order) {
    let name = typeof getOrderArchitectName === 'function'
        ? getOrderArchitectName(order)
        : (order?.architect?.name || '');
    const architectId = Number(order?.architectId || order?.architect?.id);
    if (!name && architectId) {
        const { data, error } = await supabaseClient
            .from('Architect')
            .select('name')
            .eq('id', architectId)
            .maybeSingle();
        if (!error && data?.name) name = data.name;
    }
    return name || '—';
}

function isRequisicoesProjectRequestAllowed(project, statuses) {
    if (typeof isOrderProjectGroupedChild === 'function' && isOrderProjectGroupedChild(project)) {
        return false;
    }
    if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) {
        return false;
    }
    if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) {
        return false;
    }
    if (typeof getConvProjectStatusSortOrder !== 'function') return true;

    const endStatusName = typeof CONV_PROJECT_STATUS_END === 'string'
        ? CONV_PROJECT_STATUS_END
        : 'Em Produção';
    const endStatus = (statuses || []).find(status => status.name === endStatusName);
    const maxSortOrder = endStatus?.sortOrder != null ? Number(endStatus.sortOrder) : null;
    if (maxSortOrder == null) return true;

    const sortOrder = getConvProjectStatusSortOrder(project, statuses);
    return sortOrder != null && sortOrder <= maxSortOrder;
}

function renderRequisicoesOrderProjectRows(orderId, projects, statuses = []) {
    const hasPhases = typeof orderHasDeliveryPhases === 'function' && orderHasDeliveryPhases(orderId);
    const rows = [...projects]
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' }))
        .map(project => {
            const statusName = typeof getOrderProjectStatusName === 'function'
                ? getOrderProjectStatusName(project)
                : (project.projectStatus?.name || '—');
            const statusClass = typeof getOrderProjectStatusBadgeClass === 'function'
                ? getOrderProjectStatusBadgeClass(statusName)
                : '';
            const phaseDisplay = typeof getOrderProjectPhaseDisplay === 'function'
                ? getOrderProjectPhaseDisplay(project, orderId)
                : null;
            const deliveryDate = typeof formatGestaoDate === 'function'
                ? formatGestaoDate(project.deliveryDate)
                : (project.deliveryDate || '—');
            const deliveryCell = phaseDisplay
                ? `<span class="block font-medium text-slate-700">${escapeHtml(phaseDisplay.name)}</span><span class="block text-[9px] text-slate-500">${escapeHtml(phaseDisplay.dateLabel)}</span>`
                : escapeHtml(deliveryDate);
            const deliveryTitle = phaseDisplay
                ? `${phaseDisplay.name} · ${phaseDisplay.dateLabel}`
                : `Entrega do projeto técnico: ${deliveryDate}`;
            const designerName = project.designer?.name || '—';
            const projectId = Number(project.id);
            const canCreateRequest = isRequisicoesProjectRequestAllowed(project, statuses);
            const notices = [
                typeof renderComplementarProjectNoticeHtml === 'function' ? renderComplementarProjectNoticeHtml(project) : '',
                typeof renderReplacedProjectNoticeHtml === 'function' ? renderReplacedProjectNoticeHtml(project) : '',
                typeof renderReplacementProjectNoticeHtml === 'function' ? renderReplacementProjectNoticeHtml(project) : ''
            ].join('');

            return `
                <div class="order-projects-grid__item" data-project-id="${projectId}">
                    <div class="order-projects-grid__row">
                        <div class="order-projects-grid__cell order-projects-grid__cell--project min-w-0">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="text-xs font-semibold text-slate-800 truncate" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</span>
                                <button type="button"
                                    class="requisicoes-project-details-btn text-[10px] bg-white border border-violet-200 text-violet-800 hover:bg-violet-50 px-2 py-0.5 rounded-md font-medium whitespace-nowrap"
                                    data-project-id="${projectId}">
                                    Detalhes
                                </button>
                                ${notices}
                            </div>
                        </div>
                        <span class="order-projects-grid__cell text-[10px] text-slate-600 truncate" title="Projetista: ${escapeHtml(designerName)}">${escapeHtml(designerName)}</span>
                        <span class="order-projects-grid__cell text-[10px] text-slate-600 whitespace-nowrap" title="${escapeHtml(deliveryTitle)}">${deliveryCell}</span>
                        <span class="order-projects-grid__cell order-projects-grid__cell--status text-[10px] px-1.5 py-0.5 rounded-full font-medium truncate ${statusClass}" title="${escapeHtml(statusName)}">${escapeHtml(statusName)}</span>
                        <div class="order-projects-grid__cell order-projects-grid__cell--actions">
                            <div class="flex flex-wrap justify-end gap-1">
                                ${canCreateRequest
                                    ? `<button type="button"
                                        class="requisicoes-create-request-btn text-[10px] px-2 py-0.5 rounded-md font-medium whitespace-nowrap bg-violet-700 text-white hover:bg-violet-800"
                                        data-project-id="${projectId}">
                                        Criar Requisição
                                    </button>`
                                    : '<span class="text-[10px] text-slate-400">—</span>'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    return `
        <div class="order-projects-grid">
            <div class="order-projects-grid__header">
                <span class="order-projects-grid__head order-projects-grid__head--project">Projeto</span>
                <span class="order-projects-grid__head">Projetista</span>
                <span class="order-projects-grid__head">${hasPhases ? 'Fase' : 'Entrega'}</span>
                <span class="order-projects-grid__head">Status</span>
                <span class="order-projects-grid__head order-projects-grid__head--actions">Ação</span>
            </div>
            ${rows || '<p class="px-3 py-4 text-xs text-slate-400">Este pedido não tem projetos.</p>'}
        </div>
    `;
}

async function renderRequisicoesOrderDetail(orderId) {
    const detail = document.getElementById('requisicoes-order-detail');
    if (!detail) return;
    if (!orderId) {
        clearRequisicoesOrderDetail();
        return;
    }

    detail.innerHTML = '<p class="text-xs text-slate-400">Carregando pedido...</p>';
    activeOrderId = Number(orderId);

    if (typeof loadOrderPhasesForOrders === 'function') {
        await loadOrderPhasesForOrders([{ id: Number(orderId) }]);
    }

    const order = typeof fetchOrderDetailRecord === 'function'
        ? await fetchOrderDetailRecord(orderId)
        : null;
    if (!order) throw new Error('Pedido não encontrado.');

    requisicoesOrderAddrId = Number(order.addrId) || null;
    activeOrderAddrId = requisicoesOrderAddrId;

    const projects = typeof fetchOrderProjectsForOrder === 'function'
        ? await fetchOrderProjectsForOrder(orderId)
        : [];
    let enrichedProjects = typeof enrichOrderProjectsForList === 'function'
        ? await enrichOrderProjectsForList(projects)
        : projects;
    requisicoesOrderProjectsCache = typeof excludeGroupedChildPendenciasProjects === 'function'
        ? excludeGroupedChildPendenciasProjects(enrichedProjects)
        : enrichedProjects.filter(project => !Number(project?.aggregatorOrderProjectId));
    const projectStatuses = typeof loadConvProjectStatusesForFilter === 'function'
        ? await loadConvProjectStatusesForFilter()
        : [];

    const clientName = typeof getOrderClientName === 'function' ? (getOrderClientName(order) || 'Cliente') : 'Cliente';
    const consultantName = typeof getOrderConsultantNameFromRecord === 'function'
        ? (getOrderConsultantNameFromRecord(order) || '—')
        : '—';
    const creatorName = order.creator?.name || 'Sistema';
    const architectName = await requisicoesOrderArchitectLabel(order);
    const saleDateLabel = typeof formatGestaoDate === 'function'
        ? formatGestaoDate(order.saleDate)
        : (order.saleDate || '—');
    const deliveryLabel = typeof formatOrderDeliverySummary === 'function'
        ? formatOrderDeliverySummary(order.id, order.clientDeliveryDate)
        : 'Entrega pedido: —';

    detail.innerHTML = `
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="p-5 border-b border-slate-100">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-sm font-bold bg-slate-900 text-amber-500 px-2.5 py-1 rounded font-mono">${escapeHtml(order.orderCode || '')}</span>
                        <h3 class="text-lg font-bold text-slate-900 truncate">${escapeHtml(clientName)}</h3>
                    </div>
                    <button type="button" id="requisicoes-export-order-pdf"
                        class="shrink-0 text-xs bg-slate-900 text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap">
                        Exportar PDF
                    </button>
                </div>
                <p class="text-xs text-slate-400 mt-1">📋 Consultor: ${escapeHtml(consultantName)} | Criado por: ${escapeHtml(creatorName)}</p>
                <p class="text-xs text-slate-400 mt-1">🏛️ Arquiteto: ${escapeHtml(architectName)}</p>
                <p class="text-xs text-slate-500 mt-1">Data de venda: ${escapeHtml(saleDateLabel || '—')}</p>
                <p class="text-xs text-slate-500 mt-1">${escapeHtml(deliveryLabel)}</p>
                <button type="button" id="requisicoes-order-addr"
                    class="mt-2 text-xs bg-slate-900 text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg font-semibold">
                    Endereço
                </button>
            </div>
            <div class="fm-order-projects-header px-5 py-2.5 border-b border-slate-100 bg-violet-50/50 text-xs font-semibold text-violet-800 uppercase">
                Projetos <span class="font-normal opacity-80">(${requisicoesOrderProjectsCache.length})</span>
            </div>
            <div class="px-3 py-2">
                ${renderRequisicoesOrderProjectRows(orderId, requisicoesOrderProjectsCache, projectStatuses)}
            </div>
        </div>
    `;
}

async function openRequisicoesProjectRequest(project) {
    if (!project || !requisicoesProjectsOrderId) return;
    if (typeof isOrderProjectGroupedChild === 'function' && isOrderProjectGroupedChild(project)) {
        alertAppDialog('Ambiente vinculado a um agrupador não recebe requisição. Use o projeto agrupador.');
        return;
    }
    if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) {
        alertAppDialog('Projeto complementar não recebe requisição.');
        return;
    }
    if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) {
        alertAppDialog('Projeto substituído não recebe requisição.');
        return;
    }
    const projectStatuses = typeof loadConvProjectStatusesForFilter === 'function'
        ? await loadConvProjectStatusesForFilter()
        : [];
    if (!isRequisicoesProjectRequestAllowed(project, projectStatuses)) {
        alertAppDialog('Requisição de projeto só pode ser criada até o status Em Produção.');
        return;
    }
    if (typeof openConvModal !== 'function') {
        alertAppDialog('Não foi possível abrir a requisição.');
        return;
    }

    const order = requisicoesProjectsOrders.find(item => Number(item.id) === Number(requisicoesProjectsOrderId));
    activeOrderId = Number(requisicoesProjectsOrderId);
    await openConvModal({
        orderId: activeOrderId,
        lockOrderProjectId: Number(project.id),
        lockOrderProjectLabel: project.name || 'Projeto',
        orderLabel: order ? requisicoesProjectOrderLabel(order) : ''
    });
}

async function selectRequisicoesProjectOrder(orderId) {
    const order = requisicoesProjectsOrders.find(item => Number(item.id) === Number(orderId));
    const input = document.getElementById('requisicoes-projects-order-search');
    requisicoesProjectsOrderId = order ? Number(order.id) : null;
    activeOrderId = requisicoesProjectsOrderId;
    if (input) input.value = order ? requisicoesProjectOrderLabel(order) : '';
    setRequisicoesOrderListOpen(false);
    await renderRequisicoesOrderDetail(requisicoesProjectsOrderId);
}

async function loadRequisicoesProjects() {
    const content = document.getElementById('requisicoes-content');
    if (!content) return;

    content.innerHTML = `
        <div class="space-y-4">
            <div class="relative z-30 max-w-xl" id="requisicoes-projects-order-wrap">
                <label class="block text-xs font-semibold text-slate-500 mb-1" for="requisicoes-projects-order-search">Pedido</label>
                <input id="requisicoes-projects-order-search" type="text" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="requisicoes-projects-order-list" aria-autocomplete="list" placeholder="Digite o nome do cliente" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <div id="requisicoes-projects-order-list" class="hidden absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg" role="listbox"></div>
            </div>
            <div id="requisicoes-order-detail"></div>
        </div>
    `;

    try {
        await loadRequisicoesOrderOptions();
        await renderRequisicoesOrderDetail(requisicoesProjectsOrderId);
    } catch (error) {
        content.insertAdjacentHTML('beforeend', `<p class="text-xs text-red-700 mt-3">${escapeHtml(error.message || 'Erro ao carregar pedidos.')}</p>`);
    }

    const orderInput = document.getElementById('requisicoes-projects-order-search');
    const orderList = document.getElementById('requisicoes-projects-order-list');

    orderInput?.addEventListener('focus', () => {
        const selected = requisicoesProjectsOrders.find(order => Number(order.id) === Number(requisicoesProjectsOrderId));
        const selectedLabel = selected ? requisicoesProjectOrderLabel(selected) : '';
        requisicoesProjectsOrderHighlight = -1;
        requisicoesProjectsOrderQuery = orderInput.value === selectedLabel ? '' : orderInput.value;
        renderRequisicoesOrderOptions();
        setRequisicoesOrderListOpen(true);
    });

    orderInput?.addEventListener('input', () => {
        requisicoesProjectsOrderQuery = orderInput.value;
        const selected = requisicoesProjectsOrders.find(order => Number(order.id) === Number(requisicoesProjectsOrderId));
        const selectedLabel = selected ? requisicoesProjectOrderLabel(selected) : '';
        if (orderInput.value.trim() !== selectedLabel) {
            requisicoesProjectsOrderId = null;
            activeOrderId = null;
            clearRequisicoesOrderDetail();
        }
        requisicoesProjectsOrderHighlight = -1;
        renderRequisicoesOrderOptions();
        setRequisicoesOrderListOpen(true);
    });

    orderInput?.addEventListener('keydown', async event => {
        const optionCount = orderList?.querySelectorAll('.requisicoes-order-option').length || 0;
        if (event.key === 'Escape') {
            setRequisicoesOrderListOpen(false);
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!optionCount) return;
            setRequisicoesOrderListOpen(true);
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            requisicoesProjectsOrderHighlight = (requisicoesProjectsOrderHighlight + delta + optionCount) % optionCount;
            renderRequisicoesOrderOptions();
            orderList?.querySelector(`[data-option-index="${requisicoesProjectsOrderHighlight}"]`)?.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (event.key === 'Enter') {
            const options = [...(orderList?.querySelectorAll('.requisicoes-order-option') || [])];
            const highlighted = options[requisicoesProjectsOrderHighlight] || (options.length === 1 ? options[0] : null);
            if (!highlighted) return;
            event.preventDefault();
            try {
                await selectRequisicoesProjectOrder(highlighted.dataset.orderId);
            } catch (error) {
                alertAppDialog(error.message || 'Erro ao carregar projetos.');
            }
        }
    });

    orderList?.addEventListener('mousedown', event => {
        event.preventDefault();
    });

    orderList?.addEventListener('click', async event => {
        const button = event.target.closest('[data-order-id]');
        if (!button) return;
        try {
            await selectRequisicoesProjectOrder(button.dataset.orderId);
        } catch (error) {
            alertAppDialog(error.message || 'Erro ao carregar projetos.');
        }
    });

    if (!window.__requisicoesProjectsOrderOutsideBound) {
        window.__requisicoesProjectsOrderOutsideBound = true;
        document.addEventListener('mousedown', event => {
            const wrap = document.getElementById('requisicoes-projects-order-wrap');
            if (!wrap || wrap.contains(event.target)) return;
            setRequisicoesOrderListOpen(false);
        });
    }

    document.getElementById('requisicoes-order-detail')?.addEventListener('click', async event => {
        const createButton = event.target.closest('.requisicoes-create-request-btn');
        if (createButton) {
            const project = requisicoesOrderProjectsCache.find(item => Number(item.id) === Number(createButton.dataset.projectId));
            try {
                await openRequisicoesProjectRequest(project);
            } catch (error) {
                alertAppDialog(error.message || 'Erro ao abrir a requisição.');
            }
            return;
        }

        const detailsButton = event.target.closest('.requisicoes-project-details-btn');
        if (detailsButton) {
            const project = requisicoesOrderProjectsCache.find(item => Number(item.id) === Number(detailsButton.dataset.projectId));
            if (project && typeof openProjectViewModal === 'function') {
                await openProjectViewModal(project);
            }
            return;
        }

        if (event.target.closest('#requisicoes-export-order-pdf')) {
            if (typeof exportOrderPrint === 'function') {
                await exportOrderPrint(requisicoesProjectsOrderId);
            }
            return;
        }

        if (event.target.closest('#requisicoes-order-addr')) {
            activeOrderId = Number(requisicoesProjectsOrderId);
            activeOrderAddrId = requisicoesOrderAddrId;
            if (typeof openOrderAddrModal === 'function') {
                await openOrderAddrModal();
            }
        }
    });
}

window.loadRequisicoesProjects = loadRequisicoesProjects;
