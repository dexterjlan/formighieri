const PROGRAMACAO_PRODUCAO_END_STATUS = 'Montagem Interna';

const PROGRAMACAO_PRODUCAO_PROJECT_SELECT = `
    id, orderId, projectCode, name, saleValue, statusId, deliveryPhaseId, productionMonth,
    isComplementar, parentProjectId,
    parentProject:parentProjectId(id, deliveryPhaseId),
    order:salesOrders(id, orderCode, clientName, clientDeliveryDate),
    projectStatus:OrderProjectStatus(id, name, sortOrder)
`;

const PROGRAMACAO_PRODUCAO_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, saleValue, statusId, deliveryPhaseId,
    isComplementar, parentProjectId,
    order:salesOrders(id, orderCode, clientName, clientDeliveryDate),
    projectStatus:OrderProjectStatus(id, name)
`;

let programacaoProducaoCache = {
    projects: [],
    statuses: [],
    phasesByOrderId: {},
    projectsById: {}
};

let programacaoProducaoClientFilterTimer = null;

function toProgramacaoProducaoMonthInputValue(dateStr) {
    if (!dateStr) return '';
    const part = String(dateStr).split('T')[0];
    const [year, month] = part.split('-');
    if (!year || !month) return '';
    return `${year}-${month}`;
}

function toProgramacaoProducaoMonthDbValue(monthInput) {
    const normalized = String(monthInput || '').trim().slice(0, 7);
    if (!normalized || !/^\d{4}-\d{2}$/.test(normalized)) return null;
    return `${normalized}-01`;
}

function getProgramacaoProducaoContext() {
    return {
        phasesByOrderId: programacaoProducaoCache.phasesByOrderId || {},
        projectsById: programacaoProducaoCache.projectsById || {}
    };
}

function isProgramacaoProducaoComplementarProject(project) {
    return typeof isGestaoRelatorioPedidosPendentesComplementarProject === 'function'
        && isGestaoRelatorioPedidosPendentesComplementarProject(project);
}

function getProgramacaoProducaoParentProjectId(project) {
    return Number(project?.parentProjectId || project?.parentProject?.id) || null;
}

function getProgramacaoProducaoComplementarChildren(parentProjectId) {
    const parentId = Number(parentProjectId);
    if (!parentId) return [];

    return (programacaoProducaoCache.projects || []).filter(project =>
        isProgramacaoProducaoComplementarProject(project)
        && getProgramacaoProducaoParentProjectId(project) === parentId
    );
}

function getProgramacaoProducaoEffectiveProductionMonth(project) {
    if (!project) return null;

    if (isProgramacaoProducaoComplementarProject(project)) {
        const parentId = getProgramacaoProducaoParentProjectId(project);
        const parent = parentId ? programacaoProducaoCache.projectsById[parentId] : null;
        return parent?.productionMonth || project.productionMonth || null;
    }

    return project.productionMonth || null;
}

function getProgramacaoProducaoProjectReferenceDate(project) {
    return getProgramacaoProducaoEffectiveProductionMonth(project);
}

async function fetchProgramacaoProducaoProjects() {
    let result = await supabaseClient
        .from('OrderProject')
        .select(PROGRAMACAO_PRODUCAO_PROJECT_SELECT)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('productionMonth')
        || result.error?.message?.includes('deliveryPhaseId')
        || result.error?.message?.includes('isComplementar')
        || result.error?.message?.includes('parentProject')
        || result.error?.message?.includes('clientDeliveryDate')
        || result.error?.message?.includes('projectStatus')
        || result.error?.message?.includes('sortOrder')) {
        result = await supabaseClient
            .from('OrderProject')
            .select(PROGRAMACAO_PRODUCAO_PROJECT_SELECT_FALLBACK)
            .order('name', { ascending: true });
    }

    if (result.error) return result;

    const projects = result.data || [];
    const needsEnrich = projects.some(project => project.statusId && !project.projectStatus);

    if (!needsEnrich) return { data: projects, error: null };

    const { data: statuses } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name, sortOrder');

    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));

    return {
        data: projects.map(project => ({
            ...project,
            projectStatus: project.projectStatus || statusById[project.statusId] || null
        })),
        error: null
    };
}

function getProgramacaoProducaoFilteredProjects() {
    if (typeof filterGestaoRelatorioPedidosPendentesProjects !== 'function') {
        return programacaoProducaoCache.projects || [];
    }

    return filterGestaoRelatorioPedidosPendentesProjects(
        programacaoProducaoCache.projects || [],
        programacaoProducaoCache.statuses || []
    );
}

function getProgramacaoProducaoOrderDeliveryDatesLabel(projects, context) {
    const parentProjects = (projects || []).filter(project =>
        typeof isGestaoRelatorioPedidosPendentesComplementarProject === 'function'
            ? !isGestaoRelatorioPedidosPendentesComplementarProject(project)
            : !project.isComplementar
    );
    const resolveDelivery = typeof getGestaoRelatorioPedidosPendentesProjectDeliveryDate === 'function'
        ? getGestaoRelatorioPedidosPendentesProjectDeliveryDate
        : () => null;

    const dates = parentProjects
        .map(project => resolveDelivery(project, context))
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b)));

    const uniqueDates = [...new Set(dates)];
    return uniqueDates
        .map(date => (typeof formatGestaoDate === 'function' ? formatGestaoDate(date) : date))
        .join(' · ');
}

function getProgramacaoProducaoOrderMonthInputValue(projects) {
    const parentProjects = (projects || []).filter(project => !isProgramacaoProducaoComplementarProject(project));
    const values = [...new Set(parentProjects
        .map(project => toProgramacaoProducaoMonthInputValue(getProgramacaoProducaoEffectiveProductionMonth(project)))
        .filter(Boolean))];

    return values.length === 1 ? values[0] : '';
}

function buildProgramacaoProducaoOrders() {
    const context = getProgramacaoProducaoContext();
    const filteredProjects = getProgramacaoProducaoFilteredProjects();
    const ordersById = {};

    filteredProjects.forEach(project => {
        const orderId = Number(project.orderId);
        if (!orderId) return;

        if (!ordersById[orderId]) {
            ordersById[orderId] = {
                orderId,
                order: project.order || {},
                projects: [],
                complementarProjects: []
            };
        }

        if (typeof isGestaoRelatorioPedidosPendentesComplementarProject === 'function'
            && isGestaoRelatorioPedidosPendentesComplementarProject(project)) {
            ordersById[orderId].complementarProjects.push(project);
            return;
        }

        ordersById[orderId].projects.push(project);
    });

    return Object.values(ordersById)
        .map(orderGroup => {
            const allProjects = [
                ...orderGroup.projects,
                ...orderGroup.complementarProjects
            ];
            const projectTree = typeof buildGestaoRelatorioPedidosPendentesProjectTree === 'function'
                ? buildGestaoRelatorioPedidosPendentesProjectTree(
                    orderGroup.projects,
                    orderGroup.complementarProjects,
                    context.projectsById
                )
                : orderGroup.projects.map(project => ({ project, children: [], parentPending: true }));

            return {
                ...orderGroup,
                orderCode: orderGroup.order?.orderCode || '—',
                clientName: orderGroup.order?.clientName || '—',
                deliveryDatesLabel: getProgramacaoProducaoOrderDeliveryDatesLabel(allProjects, context),
                monthInputValue: getProgramacaoProducaoOrderMonthInputValue(allProjects),
                projectTree,
                allProjectIds: allProjects.map(project => Number(project.id)).filter(Boolean)
            };
        })
        .sort((a, b) => String(a.orderCode).localeCompare(String(b.orderCode), 'pt-BR', { numeric: true }));
}

function getProgramacaoProducaoClientFilter() {
    return document.getElementById('programacao-producao-filter-client')?.value.trim() || '';
}

function getProgramacaoProducaoHideWithMonth() {
    return Boolean(document.getElementById('programacao-producao-filter-hide-with-month')?.checked);
}

function orderProgramacaoProducaoHasMonthDefined(orderGroup) {
    const parentProjects = orderGroup.projects || [];
    if (!parentProjects.length) return false;
    return parentProjects.every(project => Boolean(getProgramacaoProducaoEffectiveProductionMonth(project)));
}

function applyProgramacaoProducaoOrderFilters(orders) {
    const clientTerm = getProgramacaoProducaoClientFilter().toLocaleLowerCase('pt-BR');
    const hideWithMonth = getProgramacaoProducaoHideWithMonth();

    return (orders || []).filter(order => {
        if (hideWithMonth && orderProgramacaoProducaoHasMonthDefined(order)) return false;
        if (clientTerm) {
            const name = String(order.clientName || '').toLocaleLowerCase('pt-BR');
            if (!name.includes(clientTerm)) return false;
        }
        return true;
    });
}

function getProgramacaoProducaoProjectsFromOrders(orders) {
    const seen = new Set();
    const projects = [];

    (orders || []).forEach(order => {
        [...(order.projects || []), ...(order.complementarProjects || [])].forEach(project => {
            const id = Number(project.id);
            if (!id || seen.has(id)) return;
            seen.add(id);
            projects.push(project);
        });
    });

    return projects;
}

function scheduleProgramacaoProducaoFilterRender() {
    clearTimeout(programacaoProducaoClientFilterTimer);
    programacaoProducaoClientFilterTimer = setTimeout(() => {
        renderProgramacaoProducaoPanel();
    }, 250);
}

function clearProgramacaoProducaoFilters() {
    const clientInput = document.getElementById('programacao-producao-filter-client');
    const hideCheckbox = document.getElementById('programacao-producao-filter-hide-with-month');
    if (clientInput) clientInput.value = '';
    if (hideCheckbox) hideCheckbox.checked = false;
    renderProgramacaoProducaoPanel();
}

function formatProgramacaoProducaoMonthLabel(monthInputValue) {
    if (!monthInputValue) return '—';
    const [year, month] = String(monthInputValue).split('-');
    if (!year || !month) return '—';
    const date = new Date(Number(year), Number(month) - 1, 1);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

function renderProgramacaoProducaoProjectMonthInput(project, options = {}) {
    const projectId = Number(project.id);
    const value = toProgramacaoProducaoMonthInputValue(getProgramacaoProducaoEffectiveProductionMonth(project));
    const nestedClass = options.nested ? 'ml-4' : '';

    return `
        <input type="month"
            class="programacao-producao-project-month ${nestedClass} px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-600"
            data-project-id="${projectId}"
            value="${escapeHtml(value)}"
            aria-label="Mês de produção do projeto">
    `;
}

function renderProgramacaoProducaoComplementarMonthDisplay(project) {
    const monthValue = toProgramacaoProducaoMonthInputValue(getProgramacaoProducaoEffectiveProductionMonth(project));
    if (!monthValue) {
        return '<span class="text-[10px] text-slate-400 shrink-0">Mesmo do pai</span>';
    }

    return `<span class="text-[10px] text-slate-500 shrink-0" title="Mesmo mês do projeto pai">${escapeHtml(formatProgramacaoProducaoMonthLabel(monthValue))}</span>`;
}

function renderProgramacaoProducaoProjectTreeRows(projectTree) {
    return (projectTree || []).map(({ project, children, parentPending }) => {
        const statusName = typeof getGestaoRelatorioStatusName === 'function'
            ? getGestaoRelatorioStatusName(project)
            : (project?.projectStatus?.name || '');
        const statusClass = typeof getOrderProjectStatusBadgeClass === 'function'
            ? getOrderProjectStatusBadgeClass(statusName)
            : 'bg-slate-100 text-slate-700';
        const label = typeof getGestaoRelatorioProjectLabel === 'function'
            ? getGestaoRelatorioProjectLabel(project)
            : (project?.name || '—');

        const parentRow = `
            <div class="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-xs ${parentPending ? 'font-medium text-slate-800' : 'text-slate-500'} truncate">${escapeHtml(label)}</span>
                    ${parentPending ? `
                        <span class="inline-flex text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">
                            ${escapeHtml(statusName || '—')}
                        </span>
                    ` : ''}
                </div>
                ${parentPending
                    ? renderProgramacaoProducaoProjectMonthInput(project)
                    : '<span class="text-[10px] text-slate-400">—</span>'}
            </div>
        `;

        const childRows = (children || []).map(child => `
            <div class="flex flex-wrap items-center justify-between gap-2 py-2 pl-4 border-b border-slate-50 last:border-0 bg-slate-50/30">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-xs text-slate-600 truncate">↳ ${escapeHtml(typeof getGestaoRelatorioProjectLabel === 'function' ? getGestaoRelatorioProjectLabel(child) : (child.name || '—'))}</span>
                    <span class="text-[10px] text-slate-400 shrink-0">Complementar</span>
                </div>
                ${renderProgramacaoProducaoComplementarMonthDisplay(child)}
            </div>
        `).join('');

        return `${parentRow}${childRows}`;
    }).join('');
}

function renderProgramacaoProducaoOrderCard(orderGroup) {
    return `
        <div class="collapsible-list-card border border-slate-200 rounded-lg overflow-hidden bg-white" data-order-id="${orderGroup.orderId}">
            <div class="collapsible-list-header px-3 py-2.5 bg-white border-b border-slate-100 cursor-pointer flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                    <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                        aria-label="Expandir">▶</button>
                    <span class="text-xs font-mono font-bold text-slate-800">${escapeHtml(orderGroup.orderCode)}</span>
                    <span class="text-xs text-slate-700 truncate">${escapeHtml(orderGroup.clientName)}</span>
                    ${orderGroup.deliveryDatesLabel ? `<span class="text-[10px] text-slate-500 shrink-0 whitespace-nowrap">Entrega: ${escapeHtml(orderGroup.deliveryDatesLabel)}</span>` : ''}
                </div>
                <div class="flex items-center gap-2 shrink-0" onclick="event.stopPropagation()">
                    <label class="text-[10px] font-semibold uppercase text-slate-400">Mês produção</label>
                    <input type="month"
                        class="programacao-producao-order-month px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-600"
                        data-order-id="${orderGroup.orderId}"
                        data-project-ids="${orderGroup.allProjectIds.join(',')}"
                        value="${escapeHtml(orderGroup.monthInputValue)}"
                        aria-label="Mês de produção do pedido">
                </div>
            </div>
            <div class="collapsible-list-body hidden p-3 bg-slate-50/40">
                ${renderProgramacaoProducaoProjectTreeRows(orderGroup.projectTree)}
            </div>
        </div>
    `;
}

function renderProgramacaoProducaoSummary(projects) {
    const filteredProjects = projects || getProgramacaoProducaoFilteredProjects();
    const context = getProgramacaoProducaoContext();

    if (typeof groupGestaoRelatorioPedidosPendentesByMonthAndClient !== 'function'
        || typeof renderGestaoRelatorioPedidosPendentesGroups !== 'function') {
        return '<p class="text-xs text-slate-400 text-center py-4">Resumo indisponível.</p>';
    }

    const groups = groupGestaoRelatorioPedidosPendentesByMonthAndClient(filteredProjects, context, {
        getProjectReferenceDate: getProgramacaoProducaoProjectReferenceDate
    });

    return renderGestaoRelatorioPedidosPendentesGroups(groups, {
        emptyMonthLabel: 'Sem mês de produção'
    });
}

function renderProgramacaoProducaoOrdersList(orders, options = {}) {
    if (!orders.length) {
        const hasFilters = options.hasFilters;
        if (hasFilters) {
            return '<p class="text-xs text-slate-400 text-center py-6">Nenhum pedido encontrado com os filtros aplicados.</p>';
        }
        return '<p class="text-xs text-slate-400 text-center py-6">Nenhum pedido com projetos até Montagem Interna.</p>';
    }

    return orders.map(renderProgramacaoProducaoOrderCard).join('');
}

function renderProgramacaoProducaoPanel() {
    const summary = document.getElementById('programacao-producao-summary');
    const list = document.getElementById('programacao-producao-orders-list');
    if (!summary || !list) return;

    const orders = buildProgramacaoProducaoOrders();
    const filteredOrders = applyProgramacaoProducaoOrderFilters(orders);
    const hasFilters = Boolean(getProgramacaoProducaoClientFilter() || getProgramacaoProducaoHideWithMonth());
    const filteredProjects = hasFilters
        ? getProgramacaoProducaoProjectsFromOrders(filteredOrders)
        : null;

    summary.innerHTML = renderProgramacaoProducaoSummary(filteredProjects);
    list.innerHTML = renderProgramacaoProducaoOrdersList(filteredOrders, { hasFilters });

    bindCollapsibleListCardToggles(summary, { defaultCollapsed: true });
    bindCollapsibleListCardToggles(list, { defaultCollapsed: true });
}

function updateProgramacaoProducaoCacheProject(projectId, productionMonth) {
    const normalizedId = Number(projectId);
    const project = programacaoProducaoCache.projectsById[normalizedId];
    if (project) {
        project.productionMonth = productionMonth;
    }

    programacaoProducaoCache.projects = (programacaoProducaoCache.projects || []).map(item =>
        Number(item.id) === normalizedId ? { ...item, productionMonth } : item
    );
    programacaoProducaoCache.projectsById = typeof buildGestaoRelatorioProjectsById === 'function'
        ? buildGestaoRelatorioProjectsById(programacaoProducaoCache.projects)
        : programacaoProducaoCache.projectsById;
}

async function persistProgramacaoProducaoProjectsMonth(projectIds, monthInputValue) {
    const normalizedIds = [...new Set(projectIds.map(id => Number(id)).filter(Boolean))];
    if (!normalizedIds.length) return;

    const productionMonth = toProgramacaoProducaoMonthDbValue(monthInputValue);
    const payload = {
        productionMonth,
        updatedAt: new Date().toISOString()
    };

    if (typeof currentUser !== 'undefined' && currentUser?.id) {
        payload.updatedById = currentUser.id;
    }

    const { error } = await supabaseClient
        .from('OrderProject')
        .update(payload)
        .in('id', normalizedIds);

    if (error?.message?.includes('productionMonth')
        && (error.message?.includes('column') || error.message?.includes('schema cache'))) {
        throw new Error('Execute supabase/create-order-project-production-month.sql no Supabase.');
    }

    if (error) throw error;

    normalizedIds.forEach(projectId => updateProgramacaoProducaoCacheProject(projectId, productionMonth));
}

async function persistProgramacaoProducaoProjectMonth(projectId, monthInputValue) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return;

    const complementarIds = getProgramacaoProducaoComplementarChildren(normalizedId)
        .map(project => Number(project.id))
        .filter(Boolean);

    await persistProgramacaoProducaoProjectsMonth([normalizedId, ...complementarIds], monthInputValue);
}

async function persistProgramacaoProducaoOrderMonth(orderId, monthInputValue, projectIds = []) {
    await persistProgramacaoProducaoProjectsMonth(projectIds, monthInputValue);
}

async function loadProgramacaoProducao() {
    const summary = document.getElementById('programacao-producao-summary');
    const list = document.getElementById('programacao-producao-orders-list');
    if (!summary || !list) return;

    if (!canAccessGestao()) {
        summary.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Sem permissão.</p>';
        list.innerHTML = '';
        return;
    }

    summary.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Carregando resumo...</p>';
    list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Carregando pedidos...</p>';

    const statuses = typeof loadGestaoProjectStatuses === 'function'
        ? await loadGestaoProjectStatuses(true)
        : [];

    const { data: projects, error } = await fetchProgramacaoProducaoProjects();
    if (error) {
        const message = `<p class="text-xs text-red-500 text-center py-4">Erro ao carregar: ${escapeHtml(error.message)}</p>`;
        summary.innerHTML = message;
        list.innerHTML = message;
        return;
    }

    const orderIds = [...new Set((projects || []).map(project => Number(project.orderId)).filter(Boolean))];
    let phasesByOrderId = {};

    if (typeof fetchGestaoOrderPhasesByOrderIds === 'function' && orderIds.length) {
        phasesByOrderId = await fetchGestaoOrderPhasesByOrderIds(orderIds);
    }

    programacaoProducaoCache = {
        projects: projects || [],
        statuses: statuses || [],
        phasesByOrderId,
        projectsById: typeof buildGestaoRelatorioProjectsById === 'function'
            ? buildGestaoRelatorioProjectsById(projects || [])
            : {}
    };

    renderProgramacaoProducaoPanel();
}

function showGestaoProgramacaoProducaoPanel() {
    if (!canAccessGestao()) {
        alertAppDialog('Sem permissão para acessar a programação de produção.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    hideAllGestaoPanels();
    document.getElementById('gestao-programacao-producao-panel')?.classList.remove('hidden');
    setGestaoNavActive('programacao-producao');
    loadProgramacaoProducao();
}

function bindProgramacaoProducaoEvents() {
    document.getElementById('gestao-nav-programacao-producao')?.addEventListener('click', () => {
        showGestaoProgramacaoProducaoPanel();
    });

    document.getElementById('btn-programacao-producao-refresh')?.addEventListener('click', loadProgramacaoProducao);

    document.getElementById('programacao-producao-filter-client')?.addEventListener('input', scheduleProgramacaoProducaoFilterRender);
    document.getElementById('programacao-producao-filter-hide-with-month')?.addEventListener('change', renderProgramacaoProducaoPanel);
    document.getElementById('btn-programacao-producao-filter-clear')?.addEventListener('click', clearProgramacaoProducaoFilters);

    document.getElementById('gestao-programacao-producao-panel')?.addEventListener('change', async (event) => {
        if (event.target.id === 'programacao-producao-filter-hide-with-month') return;

        const orderInput = event.target.closest('.programacao-producao-order-month');
        const projectInput = event.target.closest('.programacao-producao-project-month');
        if (!orderInput && !projectInput) return;

        const input = orderInput || projectInput;

        try {
            input.disabled = true;
            if (orderInput) {
                const projectIds = String(orderInput.dataset.projectIds || '')
                    .split(',')
                    .map(id => Number(id))
                    .filter(Boolean);
                await persistProgramacaoProducaoOrderMonth(
                    Number(orderInput.dataset.orderId),
                    orderInput.value,
                    projectIds
                );
            } else {
                await persistProgramacaoProducaoProjectMonth(
                    Number(projectInput.dataset.projectId),
                    projectInput.value
                );
            }
            renderProgramacaoProducaoPanel();
        } catch (error) {
            console.error('programacao-producao save:', error);
            alertAppDialog(`Erro ao salvar mês de produção: ${error.message}`);
        } finally {
            input.disabled = false;
        }
    });
}
