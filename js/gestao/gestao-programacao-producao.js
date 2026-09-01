const PROGRAMACAO_PRODUCAO_END_STATUS = 'Montagem Interna';

const PROGRAMACAO_PRODUCAO_PROJECT_SELECT = `
    id, orderId, projectCode, name, saleValue, statusId, deliveryPhaseId, productionMonth,
    isComplementary, parentProjectId,
    parentProject:parentProjectId(id, deliveryPhaseId),
    order:salesOrders(${getSalesOrderMinimalEmbedSelect('clientDeliveryDate')}),
    projectStatus:OrderProjectStatus(id, name, sortOrder)
`;

const PROGRAMACAO_PRODUCAO_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, saleValue, statusId, deliveryPhaseId,
    isComplementary, parentProjectId,
    order:salesOrders(${getSalesOrderMinimalEmbedSelect('clientDeliveryDate')}),
    projectStatus:OrderProjectStatus(id, name)
`;

let programacaoProducaoCache = {
    projects: [],
    statuses: [],
    phasesByOrderId: {},
    projectsById: {},
    fechamentoMonthGroups: []
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
    return typeof isGestaoRelatorioPedidosPendentesComplementaryProject === 'function'
        && isGestaoRelatorioPedidosPendentesComplementaryProject(project);
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
        || result.error?.message?.includes('isComplementary')
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

function getProgramacaoProducaoOrderDeliveryDates(projects, context) {
    const parentProjects = (projects || []).filter(project =>
        typeof isGestaoRelatorioPedidosPendentesComplementaryProject === 'function'
            ? !isGestaoRelatorioPedidosPendentesComplementaryProject(project)
            : !project.isComplementary
    );
    const resolveDelivery = typeof getGestaoRelatorioPedidosPendentesProjectDeliveryDate === 'function'
        ? getGestaoRelatorioPedidosPendentesProjectDeliveryDate
        : () => null;

    return parentProjects
        .map(project => resolveDelivery(project, context))
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b)));
}

function getProgramacaoProducaoOrderSortDeliveryDate(projects, context) {
    const dates = getProgramacaoProducaoOrderDeliveryDates(projects, context);
    return dates[0] || null;
}

function getProgramacaoProducaoOrderDeliveryDatesLabel(projects, context) {
    const uniqueDates = [...new Set(getProgramacaoProducaoOrderDeliveryDates(projects, context))];
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

function getProgramacaoProducaoOrderPhases(orderId, context) {
    const phasesByOrderId = context?.phasesByOrderId || {};
    return phasesByOrderId[orderId] || phasesByOrderId[Number(orderId)] || [];
}

function projectBelongsToProgramacaoProducaoPhase(project, phase, phases) {
    if (!phase) return true;

    const phaseId = Number(phase.id);
    const projectPhaseId = Number(project.deliveryPhaseId);
    const firstPhaseId = Number(phases[0]?.id);

    if (projectPhaseId) return projectPhaseId === phaseId;
    return phaseId === firstPhaseId;
}

function buildProgramacaoProducaoOrderSlice(orderGroup, context, options = {}) {
    const { phase = null, phases = [] } = options;
    const parentProjects = phase
        ? (orderGroup.projects || []).filter(project =>
            projectBelongsToProgramacaoProducaoPhase(project, phase, phases)
        )
        : (orderGroup.projects || []);

    if (!parentProjects.length) return null;

    const parentIds = new Set(parentProjects.map(project => Number(project.id)));
    const complementarProjects = (orderGroup.complementarProjects || []).filter(project => {
        const parentId = getProgramacaoProducaoParentProjectId(project);
        return parentId && parentIds.has(parentId);
    });

    const allProjects = [...parentProjects, ...complementarProjects];
    if (!allProjects.length) return null;

    const projectTree = typeof buildGestaoRelatorioPedidosPendentesProjectTree === 'function'
        ? buildGestaoRelatorioPedidosPendentesProjectTree(
            parentProjects,
            complementarProjects,
            context.projectsById,
            { sortByDeliveryDate: true, context }
        )
        : parentProjects.map(project => ({ project, children: [], parentPending: true }));

    const phaseLabel = phase && typeof getGestaoOrderPhaseLabel === 'function'
        ? getGestaoOrderPhaseLabel(phase)
        : null;

    return {
        orderId: orderGroup.orderId,
        phaseId: phase ? Number(phase.id) : null,
        order: orderGroup.order || {},
        projects: parentProjects,
        complementarProjects,
        orderCode: orderGroup.order?.orderCode || '—',
        clientName: getOrderClientName(orderGroup.order) || '—',
        phaseLabel,
        sortDeliveryDate: phase?.deliveryDate
            || getProgramacaoProducaoOrderSortDeliveryDate(allProjects, context),
        deliveryDatesLabel: phaseLabel
            || getProgramacaoProducaoOrderDeliveryDatesLabel(allProjects, context),
        monthInputValue: getProgramacaoProducaoOrderMonthInputValue(allProjects),
        projectTree,
        allProjectIds: allProjects.map(project => Number(project.id)).filter(Boolean)
    };
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

        if (typeof isGestaoRelatorioPedidosPendentesComplementaryProject === 'function'
            && isGestaoRelatorioPedidosPendentesComplementaryProject(project)) {
            ordersById[orderId].complementarProjects.push(project);
            return;
        }

        ordersById[orderId].projects.push(project);
    });

    const slices = [];

    Object.values(ordersById).forEach(orderGroup => {
        if (!orderGroup.projects?.length) return;

        const phases = getProgramacaoProducaoOrderPhases(orderGroup.orderId, context);

        if (phases.length >= 2) {
            phases.forEach(phase => {
                const slice = buildProgramacaoProducaoOrderSlice(orderGroup, context, { phase, phases });
                if (slice) slices.push(slice);
            });
            return;
        }

        const slice = buildProgramacaoProducaoOrderSlice(orderGroup, context);
        if (slice) slices.push(slice);
    });

    return slices.sort((a, b) => {
        if (!a.sortDeliveryDate && !b.sortDeliveryDate) {
            const codeCompare = String(a.orderCode).localeCompare(String(b.orderCode), 'pt-BR', { numeric: true });
            if (codeCompare !== 0) return codeCompare;
            return Number(a.phaseId || 0) - Number(b.phaseId || 0);
        }
        if (!a.sortDeliveryDate) return 1;
        if (!b.sortDeliveryDate) return -1;
        const dateCompare = String(a.sortDeliveryDate).localeCompare(String(b.sortDeliveryDate));
        if (dateCompare !== 0) return dateCompare;
        const codeCompare = String(a.orderCode).localeCompare(String(b.orderCode), 'pt-BR', { numeric: true });
        if (codeCompare !== 0) return codeCompare;
        return Number(a.phaseId || 0) - Number(b.phaseId || 0);
    });
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
            const name = String(order.clientName || getOrderClientName(order.order) || '')
                .toLocaleLowerCase('pt-BR');
            if (!name.includes(clientTerm)) return false;
        }
        return true;
    });
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
    const listKey = orderGroup.phaseId
        ? `${orderGroup.orderId}-${orderGroup.phaseId}`
        : String(orderGroup.orderId);

    return `
        <div class="collapsible-list-card border border-slate-200 rounded-lg overflow-hidden bg-white" data-order-id="${orderGroup.orderId}" data-list-key="${escapeHtml(listKey)}">
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

function mergeProgramacaoProducaoSummaryMonthGroups(pendingGroups, fechamentoMonthGroups) {
    const byMonthKey = {};

    (pendingGroups || []).forEach(monthGroup => {
        byMonthKey[monthGroup.monthKey] = {
            ...monthGroup,
            fechamento: null
        };
    });

    (fechamentoMonthGroups || []).forEach(monthGroup => {
        if (!byMonthKey[monthGroup.monthKey]) {
            byMonthKey[monthGroup.monthKey] = {
                monthKey: monthGroup.monthKey,
                clients: [],
                projectCount: 0,
                totalSaleValue: 0,
                fechamento: monthGroup
            };
            return;
        }
        byMonthKey[monthGroup.monthKey].fechamento = monthGroup;
    });

    return Object.values(byMonthKey).sort((a, b) => {
        if (a.monthKey === 'sem-data') return 1;
        if (b.monthKey === 'sem-data') return -1;
        return a.monthKey.localeCompare(b.monthKey);
    });
}

function getProgramacaoProducaoCurrentMonthKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
}

function filterProgramacaoProducaoSummaryMonthGroups(groups) {
    const currentMonthKey = getProgramacaoProducaoCurrentMonthKey();

    return (groups || []).filter(monthGroup => {
        const monthKey = monthGroup.monthKey;
        if (!monthKey || monthKey === 'sem-data') {
            return Boolean(monthGroup.projectCount);
        }
        if (monthKey >= currentMonthKey) return true;
        return Boolean(monthGroup.projectCount);
    });
}

function renderProgramacaoProducaoSummaryMonthGroup(monthGroup, emptyMonthLabel) {
    const pendingTotalLabel = typeof formatSaleValue === 'function'
        ? formatSaleValue(monthGroup.totalSaleValue || 0)
        : (monthGroup.totalSaleValue || 0);
    const fechamento = monthGroup.fechamento;
    const fechamentoTotalLabel = typeof formatSaleValue === 'function'
        ? formatSaleValue(fechamento?.totalSaleValue || 0)
        : (fechamento?.totalSaleValue || 0);
    const monthLabel = typeof formatGestaoRelatorioMonthLabel === 'function'
        ? formatGestaoRelatorioMonthLabel(monthGroup.monthKey, emptyMonthLabel)
        : monthGroup.monthKey;

    const pendingBody = (monthGroup.clients || []).length
        ? (monthGroup.clients || []).map(clientGroup =>
            typeof renderGestaoRelatorioPedidosPendentesClientGroup === 'function'
                ? renderGestaoRelatorioPedidosPendentesClientGroup(clientGroup, { includeProjectCode: false })
                : ''
        ).join('')
        : '';

    const fechamentoBody = fechamento?.clients?.length
        ? `
            <div class="space-y-2 ${pendingBody ? 'mt-2 pt-2 border-t border-emerald-100' : ''}">
                <p class="text-[10px] font-semibold uppercase text-emerald-700 px-1">Já produzidos</p>
                ${fechamento.clients.map(clientGroup =>
                    typeof renderGestaoRelatorioFechamentoProducaoClientGroup === 'function'
                        ? renderGestaoRelatorioFechamentoProducaoClientGroup(clientGroup, { includeProjectCode: false })
                        : ''
                ).join('')}
            </div>
        `
        : '';

    if (!pendingBody && !fechamentoBody) {
        return '';
    }

    return `
        <div class="collapsible-list-card border border-indigo-100 rounded-lg overflow-hidden bg-indigo-50/20">
            <div class="collapsible-list-header px-3 py-2.5 bg-indigo-50/80 border-b border-indigo-100 cursor-pointer flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2 min-w-0">
                    <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-indigo-700 hover:text-indigo-900 text-[10px]"
                        aria-label="Expandir">▶</button>
                    <span class="text-xs font-semibold text-slate-900">${escapeHtml(monthLabel)}</span>
                    ${monthGroup.projectCount ? `
                        <span class="text-[10px] text-slate-500 shrink-0">${monthGroup.projectCount} programado${monthGroup.projectCount === 1 ? '' : 's'}</span>
                    ` : ''}
                    ${fechamento?.projectCount ? `
                        <span class="text-[10px] text-emerald-700 shrink-0">${fechamento.projectCount} produzido${fechamento.projectCount === 1 ? '' : 's'}</span>
                    ` : ''}
                </div>
                <div class="flex flex-wrap items-center gap-2 shrink-0">
                    ${monthGroup.projectCount ? `<span class="text-xs font-bold text-indigo-700">${escapeHtml(pendingTotalLabel)}</span>` : ''}
                    ${fechamento?.projectCount ? `<span class="text-xs font-bold text-emerald-700">${escapeHtml(fechamentoTotalLabel)}</span>` : ''}
                    <button type="button"
                        class="programacao-producao-month-export text-[10px] bg-white border border-indigo-200 text-indigo-800 px-2 py-1 rounded-lg font-medium hover:bg-indigo-50"
                        data-month-key="${escapeHtml(monthGroup.monthKey || '')}"
                        aria-label="Exportar Excel deste mês">
                        Excel
                    </button>
                </div>
            </div>
            <div class="collapsible-list-body hidden p-2 space-y-2">
                ${pendingBody}
                ${fechamentoBody}
            </div>
        </div>
    `;
}

function renderProgramacaoProducaoSummaryMonthGroups(groups, emptyMonthLabel) {
    const rendered = (groups || [])
        .map(monthGroup => renderProgramacaoProducaoSummaryMonthGroup(monthGroup, emptyMonthLabel))
        .filter(Boolean);

    if (!rendered.length) {
        return '<p class="text-xs text-slate-400 text-center py-4">Nenhum projeto programado ou produzido encontrado.</p>';
    }

    return rendered.join('');
}

function getProgramacaoProducaoVisibleSummaryMonthGroups(projects) {
    const filteredProjects = projects || getProgramacaoProducaoFilteredProjects();
    const context = getProgramacaoProducaoContext();

    if (typeof groupGestaoRelatorioPedidosPendentesByMonthAndClient !== 'function') {
        return [];
    }

    const pendingGroups = groupGestaoRelatorioPedidosPendentesByMonthAndClient(filteredProjects, context, {
        getProjectReferenceDate: getProgramacaoProducaoProjectReferenceDate,
        getOrderDisplayDeliveryDate: (project, groupContext) =>
            typeof getGestaoRelatorioPedidosPendentesProjectDeliveryDate === 'function'
                ? getGestaoRelatorioPedidosPendentesProjectDeliveryDate(project, groupContext)
                : null,
        sortByDeliveryDate: true
    });
    const mergedGroups = mergeProgramacaoProducaoSummaryMonthGroups(
        pendingGroups,
        programacaoProducaoCache.fechamentoMonthGroups || []
    );

    return filterProgramacaoProducaoSummaryMonthGroups(mergedGroups);
}

function renderProgramacaoProducaoSummary(projects) {
    if (typeof groupGestaoRelatorioPedidosPendentesByMonthAndClient !== 'function') {
        return '<p class="text-xs text-slate-400 text-center py-4">Resumo indisponível.</p>';
    }

    const visibleGroups = getProgramacaoProducaoVisibleSummaryMonthGroups(projects);
    return renderProgramacaoProducaoSummaryMonthGroups(visibleGroups, 'Sem mês de produção');
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

    summary.innerHTML = renderProgramacaoProducaoSummary();
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

    let fechamentoMonthGroups = [];
    if (typeof loadGestaoRelatorioFechamentoProducaoMonthGroups === 'function') {
        try {
            fechamentoMonthGroups = await loadGestaoRelatorioFechamentoProducaoMonthGroups({
                getMonthKey: typeof getGestaoRelatorioFechamentoProducaoProjectMonthKey === 'function'
                    ? getGestaoRelatorioFechamentoProducaoProjectMonthKey
                    : undefined,
                sortDescending: false,
                sortByDeliveryDate: true,
                phasesByOrderId,
                projectsById: typeof buildGestaoRelatorioProjectsById === 'function'
                    ? buildGestaoRelatorioProjectsById(projects || [])
                    : {}
            });
        } catch (fechamentoError) {
            console.error('programacao-producao fechamento month groups:', fechamentoError);
        }
    }

    programacaoProducaoCache = {
        projects: projects || [],
        statuses: statuses || [],
        phasesByOrderId,
        projectsById: typeof buildGestaoRelatorioProjectsById === 'function'
            ? buildGestaoRelatorioProjectsById(projects || [])
            : {},
        fechamentoMonthGroups
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

const PROGRAMACAO_PRODUCAO_AWAITING_CLIENT_APPROVAL_STATUS = 'Aguardando Aprovação';
const PROGRAMACAO_PRODUCAO_EXPORT_ID_CHUNK_SIZE = 200;
const PROGRAMACAO_PRODUCAO_EXPORT_HEADERS = [
    'Pedido',
    'Cliente',
    'Projeto',
    'Código',
    'Status',
    'Situação',
    'Mês produção',
    'Valor',
    'Data entrega',
    'Data medição',
    'Data aprovação conferência',
    'Data aprovação cliente'
];

function collectProgramacaoProducaoMonthGroupExportProjects(monthGroup) {
    const rows = [];
    const seenIds = new Set();

    const addProject = (project, situation) => {
        const projectId = Number(project?.id);
        if (!projectId || seenIds.has(projectId)) return;
        seenIds.add(projectId);
        rows.push({ project, situation });
    };

    (monthGroup?.clients || []).forEach(clientGroup => {
        (clientGroup.orders || []).forEach(orderGroup => {
            (orderGroup.projectTree || []).forEach(({ project, children, parentPending }) => {
                if (parentPending) addProject(project, 'Programado');
                (children || []).forEach(child => addProject(child, 'Programado'));
            });
            (orderGroup.projects || []).forEach(project => addProject(project, 'Programado'));
            (orderGroup.complementarProjects || []).forEach(project => addProject(project, 'Programado'));
        });
    });

    (monthGroup?.fechamento?.clients || []).forEach(clientGroup => {
        (clientGroup.projects || []).forEach(project => addProject(project, 'Produzido'));
    });

    return rows;
}

async function fetchProgramacaoProducaoRowsByProjectIds(table, select, projectIds) {
    const ids = [...new Set((projectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!ids.length) return [];

    const rows = [];
    for (let index = 0; index < ids.length; index += PROGRAMACAO_PRODUCAO_EXPORT_ID_CHUNK_SIZE) {
        const chunk = ids.slice(index, index + PROGRAMACAO_PRODUCAO_EXPORT_ID_CHUNK_SIZE);
        const { data, error } = await supabaseClient
            .from(table)
            .select(select)
            .in('orderProjectId', chunk);

        if (error) throw error;
        rows.push(...(data || []));
    }

    return rows;
}

async function fetchProgramacaoProducaoConferenceApprovalDates(projectIds) {
    const latestByProjectId = {};

    const rememberApproved = (projectId, dateValue) => {
        if (!projectId || !dateValue) return;
        const current = latestByProjectId[projectId];
        if (!current || String(dateValue) > String(current)) {
            latestByProjectId[projectId] = dateValue;
        }
    };

    try {
        let rows;
        try {
            rows = await fetchProgramacaoProducaoRowsByProjectIds(
                'PreliminaryDesignConferenceProject',
                'orderProjectId, conference:PreliminaryDesignConference(id, status, approvedAt, updatedAt)',
                projectIds
            );
        } catch (error) {
            if (!String(error?.message || '').includes('approvedAt')) throw error;
            rows = await fetchProgramacaoProducaoRowsByProjectIds(
                'PreliminaryDesignConferenceProject',
                'orderProjectId, conference:PreliminaryDesignConference(id, status, updatedAt)',
                projectIds
            );
        }

        (rows || []).forEach(row => {
            const conference = Array.isArray(row.conference) ? row.conference[0] : row.conference;
            if (!conference || conference.status !== 'Aprovada') return;
            rememberApproved(Number(row.orderProjectId), conference.approvedAt || conference.updatedAt);
        });
    } catch (error) {
        console.error('fetchProgramacaoProducaoConferenceApprovalDates:', error);
    }

    return latestByProjectId;
}

function getProgramacaoProducaoStatusHistoryName(entry, field) {
    const embedded = entry?.[field];
    const fromEmbed = Array.isArray(embedded) ? embedded[0]?.name : embedded?.name;
    if (fromEmbed) return fromEmbed;

    const idField = field === 'previousStatus' ? 'previousStatusId' : 'newStatusId';
    const statusId = Number(entry?.[idField]);
    if (!statusId) return '';

    const fromCache = (programacaoProducaoCache.statuses || []).find(status => Number(status.id) === statusId);
    return fromCache?.name || '';
}

async function fetchProgramacaoProducaoClientApprovalDates(projectIds) {
    const firstLeaveByProjectId = {};

    try {
        let rows;
        try {
            rows = await fetchProgramacaoProducaoRowsByProjectIds(
                'OrderProjectStatusHistory',
                'orderProjectId, previousStatusId, newStatusId, changedAt, previousStatus:OrderProjectStatus!previousStatusId(id, name)',
                projectIds
            );
        } catch (error) {
            if (!String(error?.message || '').includes('previousStatus')) throw error;
            rows = await fetchProgramacaoProducaoRowsByProjectIds(
                'OrderProjectStatusHistory',
                'orderProjectId, previousStatusId, newStatusId, changedAt',
                projectIds
            );
        }

        (rows || [])
            .slice()
            .sort((a, b) => String(a.changedAt || '').localeCompare(String(b.changedAt || '')))
            .forEach(entry => {
                const projectId = Number(entry.orderProjectId);
                if (!projectId || firstLeaveByProjectId[projectId]) return;
                if (getProgramacaoProducaoStatusHistoryName(entry, 'previousStatus') !== PROGRAMACAO_PRODUCAO_AWAITING_CLIENT_APPROVAL_STATUS) {
                    return;
                }
                firstLeaveByProjectId[projectId] = entry.changedAt || null;
            });
    } catch (error) {
        console.error('fetchProgramacaoProducaoClientApprovalDates:', error);
    }

    return firstLeaveByProjectId;
}

function parseProgramacaoProducaoExportExcelDate(dateStr) {
    if (typeof parseGestaoKanbanExportExcelDate === 'function') {
        return parseGestaoKanbanExportExcelDate(dateStr);
    }
    if (!dateStr) return null;
    const part = String(dateStr).split('T')[0];
    const [year, month, day] = part.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function toProgramacaoProducaoExportExcelSerial(date) {
    if (typeof toGestaoKanbanExportExcelSerial === 'function') {
        return toGestaoKanbanExportExcelSerial(date);
    }
    const epoch = Date.UTC(1899, 11, 30);
    return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - epoch) / 86400000;
}

function applyProgramacaoProducaoExportSheetFormats(sheet, dataRowCount, XLSX) {
    const dateColumns = [8, 9, 10, 11];
    const valueColumn = 7;

    for (let row = 1; row <= dataRowCount; row++) {
        dateColumns.forEach(col => {
            const ref = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = sheet[ref];
            if (!cell?.v || !(cell.v instanceof Date)) return;
            cell.t = 'n';
            cell.v = toProgramacaoProducaoExportExcelSerial(cell.v);
            cell.z = 'dd/mm/yyyy';
        });

        const valueRef = XLSX.utils.encode_cell({ r: row, c: valueColumn });
        const valueCell = sheet[valueRef];
        if (valueCell && typeof valueCell.v === 'number' && Number.isFinite(valueCell.v)) {
            valueCell.t = 'n';
            valueCell.z = '#,##0.00';
        }
    }
}

function getProgramacaoProducaoExportSheetName(monthKey) {
    const label = typeof formatGestaoRelatorioMonthLabel === 'function'
        ? formatGestaoRelatorioMonthLabel(monthKey, 'Sem mes')
        : (monthKey || 'Mes');
    return String(label)
        .replace(/[:\\/?*\[\]]/g, ' ')
        .trim()
        .slice(0, 31) || 'Mes';
}

function getProgramacaoProducaoExportFilename(monthKey) {
    const suffix = !monthKey || monthKey === 'sem-data' ? 'sem-mes' : monthKey;
    return `fgp-programacao-producao-${suffix}.xlsx`;
}

function buildProgramacaoProducaoExportRow(entry, monthKey, extraDates) {
    const { project, situation } = entry;
    const context = getProgramacaoProducaoContext();
    const projectId = Number(project.id);
    const statusName = typeof getGestaoRelatorioStatusName === 'function'
        ? getGestaoRelatorioStatusName(project)
        : (project?.projectStatus?.name || '');
    const projectLabel = typeof getGestaoRelatorioProjectLabel === 'function'
        ? getGestaoRelatorioProjectLabel(project, { includeProjectCode: false })
        : (project?.name || '');
    const saleValue = typeof getProjectEffectiveSaleValue === 'function'
        ? getProjectEffectiveSaleValue(project)
        : Number(project?.saleValue);
    const deliveryDate = typeof getGestaoRelatorioPedidosPendentesProjectDeliveryDate === 'function'
        ? getGestaoRelatorioPedidosPendentesProjectDeliveryDate(project, context)
        : (project?.order?.clientDeliveryDate || project?.deliveryDate || null);
    const monthLabel = typeof formatGestaoRelatorioMonthLabel === 'function'
        ? formatGestaoRelatorioMonthLabel(monthKey, 'Sem mês de produção')
        : monthKey;

    return [
        project.order?.orderCode || '',
        typeof getOrderClientName === 'function' ? (getOrderClientName(project.order) || '') : '',
        projectLabel,
        project.projectCode || '',
        statusName,
        situation,
        monthLabel,
        Number.isFinite(saleValue) ? saleValue : 0,
        parseProgramacaoProducaoExportExcelDate(deliveryDate),
        parseProgramacaoProducaoExportExcelDate(extraDates.measurementByProjectId[projectId]),
        parseProgramacaoProducaoExportExcelDate(extraDates.conferenceByProjectId[projectId]),
        parseProgramacaoProducaoExportExcelDate(extraDates.clientApprovalByProjectId[projectId])
    ];
}

async function exportProgramacaoProducaoMonthToExcel(monthKey, button) {
    if (!canAccessGestao()) return;

    const originalLabel = button?.textContent || 'Excel';
    if (button) {
        button.disabled = true;
        button.textContent = '...';
    }

    try {
        if (typeof loadSheetJsLibrary !== 'function') {
            throw new Error('Módulo de Excel não carregado.');
        }

        const monthGroup = getProgramacaoProducaoVisibleSummaryMonthGroups()
            .find(group => String(group.monthKey) === String(monthKey));

        if (!monthGroup) {
            alertAppDialog('Mês não encontrado na visão atual.', { variant: 'warning', title: 'Aviso' });
            return;
        }

        const exportProjects = collectProgramacaoProducaoMonthGroupExportProjects(monthGroup);
        if (!exportProjects.length) {
            alertAppDialog('Nenhum projeto neste mês para exportar.', { variant: 'warning', title: 'Aviso' });
            return;
        }

        const projectIds = exportProjects.map(entry => Number(entry.project.id)).filter(Boolean);
        const [measurementByProjectId, conferenceByProjectId, clientApprovalByProjectId] = await Promise.all([
            typeof fetchGestaoRelatorioMeasurementDates === 'function'
                ? fetchGestaoRelatorioMeasurementDates(projectIds)
                : {},
            fetchProgramacaoProducaoConferenceApprovalDates(projectIds),
            fetchProgramacaoProducaoClientApprovalDates(projectIds)
        ]);

        const extraDates = { measurementByProjectId, conferenceByProjectId, clientApprovalByProjectId };
        const dataRows = exportProjects.map(entry =>
            buildProgramacaoProducaoExportRow(entry, monthGroup.monthKey, extraDates)
        );

        const XLSX = await loadSheetJsLibrary();
        const sheet = XLSX.utils.aoa_to_sheet([PROGRAMACAO_PRODUCAO_EXPORT_HEADERS, ...dataRows]);
        applyProgramacaoProducaoExportSheetFormats(sheet, dataRows.length, XLSX);
        sheet['!cols'] = [
            { wch: 12 },
            { wch: 28 },
            { wch: 28 },
            { wch: 14 },
            { wch: 24 },
            { wch: 12 },
            { wch: 18 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 24 },
            { wch: 22 }
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, getProgramacaoProducaoExportSheetName(monthGroup.monthKey));
        XLSX.writeFile(workbook, getProgramacaoProducaoExportFilename(monthGroup.monthKey));
    } catch (error) {
        console.error('exportProgramacaoProducaoMonthToExcel:', error);
        alertAppDialog(`Erro ao exportar Excel: ${error.message}`);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }
}

function bindProgramacaoProducaoEvents() {
    document.getElementById('gestao-nav-programacao-producao')?.addEventListener('click', () => {
        showGestaoProgramacaoProducaoPanel();
    });

    document.getElementById('btn-programacao-producao-refresh')?.addEventListener('click', loadProgramacaoProducao);

    document.getElementById('gestao-programacao-producao-panel')?.addEventListener('click', async (event) => {
        const button = event.target.closest('.programacao-producao-month-export');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        await exportProgramacaoProducaoMonthToExcel(button.dataset.monthKey, button);
    });

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
