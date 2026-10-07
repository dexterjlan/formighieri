const PROGRAMACAO_PRODUCAO_END_STATUS = 'Montagem Interna';

const PROGRAMACAO_PRODUCAO_PROJECT_SELECT = `
    id, orderId, projectCode, name, saleValue, statusId, deliveryPhaseId, productionMonth, internalAssemblyEndDate,
    isComplementary, parentProjectId, isAggregator, aggregatorOrderProjectId,
    isReplaced, replacedByProjectId, isReplacement, replacesProjectId,
    parentProject:parentProjectId(id, deliveryPhaseId),
    replacedBy:replacedByProjectId(id, projectCode),
    order:salesOrders(${getSalesOrderMinimalEmbedSelect('clientDeliveryDate')}),
    projectStatus:OrderProjectStatus(id, name, sortOrder)
`;

const PROGRAMACAO_PRODUCAO_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, saleValue, statusId, deliveryPhaseId,
    isComplementary, parentProjectId, isAggregator, aggregatorOrderProjectId,
    isReplaced, replacedByProjectId, isReplacement, replacesProjectId,
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

function getProgramacaoProducaoEffectiveProductionMonth(project, projectsById) {
    if (!project) return null;

    const byId = projectsById || programacaoProducaoCache.projectsById || {};
    const allProjects = programacaoProducaoCache.projects || [];

    if (typeof isOrderProjectGroupedChild === 'function' && isOrderProjectGroupedChild(project)) {
        const aggregatorId = Number(project.aggregatorOrderProjectId);
        const aggregator = aggregatorId ? byId[aggregatorId] : null;
        return aggregator?.productionMonth || project.productionMonth || null;
    }

    if (isProgramacaoProducaoComplementarProject(project)) {
        const parentId = getProgramacaoProducaoParentProjectId(project);
        const parent = parentId ? byId[parentId] : null;
        return parent?.productionMonth || project.productionMonth || null;
    }

    if (project.productionMonth) return project.productionMonth;

    if (typeof isOrderProjectAggregator === 'function' && isOrderProjectAggregator(project)) {
        const children = allProjects.filter(
            item => Number(item.aggregatorOrderProjectId) === Number(project.id)
        );
        const childMonths = children.map(item => item.productionMonth).filter(Boolean);
        if (childMonths.length) return childMonths[0];
    }

    return null;
}

function getProgramacaoProducaoProjectProductionMonthKey(project, projectsById) {
    const month = getProgramacaoProducaoEffectiveProductionMonth(project, projectsById);
    return typeof getGestaoRelatorioMonthKey === 'function'
        ? getGestaoRelatorioMonthKey(month)
        : 'sem-data';
}

function getProgramacaoProducaoProjectInternalAssemblyEndMonthKey(project) {
    return typeof getGestaoRelatorioMonthKey === 'function'
        ? getGestaoRelatorioMonthKey(project?.internalAssemblyEndDate)
        : 'sem-data';
}

// Faixas de sortOrder do status do projeto (OrderProjectStatus.sortOrder).
const PROGRAMACAO_PRODUCAO_MONTH_STAGES = [
    { key: 'pendente', label: 'Pendente', min: 1, max: 7, color: '#94a3b8' },
    { key: 'projetando', label: 'Projetando', min: 8, max: 17, color: '#6366f1' },
    { key: 'liberado', label: 'Liberado', min: 18, max: 18, color: '#0ea5e9' },
    { key: 'produzindo', label: 'Produzindo', min: 19, max: 19, color: '#f59e0b' },
    { key: 'realizado', label: 'Realizado', min: 20, max: 23, color: '#22c55e' }
];

function getProgramacaoProducaoStatusById() {
    return Object.fromEntries((programacaoProducaoCache.statuses || []).map(status => [status.id, status]));
}

function getProgramacaoProducaoProjectStageKey(project, statusById) {
    const sortOrder = typeof getGestaoRelatorioStatusSortOrder === 'function'
        ? getGestaoRelatorioStatusSortOrder(project, statusById)
        : 9999;

    if (!Number.isFinite(sortOrder) || sortOrder === 9999) return null;

    const stage = PROGRAMACAO_PRODUCAO_MONTH_STAGES.find(item =>
        sortOrder >= item.min && sortOrder <= item.max
    );
    return stage?.key || null;
}

function isProgramacaoProducaoScheduleRootProject(project) {
    if (typeof isOrderProjectGroupedChild === 'function' && isOrderProjectGroupedChild(project)) {
        return false;
    }
    if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) {
        return false;
    }
    if (typeof isGestaoRelatorioPedidosPendentesComplementaryProject === 'function'
        && isGestaoRelatorioPedidosPendentesComplementaryProject(project)) {
        return false;
    }
    if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) {
        return false;
    }
    return true;
}

function getProgramacaoProducaoComplementarSaleValueForParent(parentProjectId, monthKey) {
    const parentId = Number(parentProjectId);
    if (!parentId) return 0;

    return (programacaoProducaoCache.projects || []).reduce((sum, project) => {
        if (!isProgramacaoProducaoComplementarProject(project)) return sum;
        if (getProgramacaoProducaoParentProjectId(project) !== parentId) return sum;
        if (getProgramacaoProducaoProjectProductionMonthKey(project) !== monthKey) return sum;

        const value = typeof getProjectEffectiveSaleValue === 'function'
            ? getProjectEffectiveSaleValue(project)
            : Number(project.saleValue);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
}

function getProgramacaoProducaoSubstitutedSaleValueForParent(parentProjectId) {
    const parentId = Number(parentProjectId);
    if (!parentId) return 0;

    return (programacaoProducaoCache.projects || []).reduce((sum, project) => {
        if (typeof isReplacedOrderProject !== 'function' || !isReplacedOrderProject(project)) return sum;

        const replacementParentId = typeof getGestaoRelatorioReplacedProjectParentId === 'function'
            ? getGestaoRelatorioReplacedProjectParentId(project)
            : Number(project.replacedByProjectId);
        if (replacementParentId !== parentId) return sum;

        const value = typeof getProjectEffectiveSaleValue === 'function'
            ? getProjectEffectiveSaleValue(project)
            : Number(project.saleValue);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
}

function getProgramacaoProducaoScheduleRootSaleValue(project, monthKey) {
    const baseValue = typeof getProjectEffectiveSaleValue === 'function'
        ? getProjectEffectiveSaleValue(project)
        : Number(project.saleValue);
    const safeBase = Number.isFinite(baseValue) ? baseValue : 0;

    return safeBase
        + getProgramacaoProducaoComplementarSaleValueForParent(project.id, monthKey)
        + getProgramacaoProducaoSubstitutedSaleValueForParent(project.id);
}

function getProgramacaoProducaoProgramadoRootProjects(monthKey) {
    const statusById = getProgramacaoProducaoStatusById();

    return (programacaoProducaoCache.projects || []).filter(project => {
        if (!isProgramacaoProducaoScheduleRootProject(project)) return false;
        if (getProgramacaoProducaoProjectProductionMonthKey(project) !== monthKey) return false;

        const stageKey = getProgramacaoProducaoProjectStageKey(project, statusById);
        return Boolean(stageKey && stageKey !== 'realizado');
    });
}

function getProgramacaoProducaoRealizadoRootProjects(monthKey) {
    const statusById = getProgramacaoProducaoStatusById();

    return (programacaoProducaoCache.projects || []).filter(project => {
        if (!isProgramacaoProducaoScheduleRootProject(project)) return false;
        if (getProgramacaoProducaoProjectStageKey(project, statusById) !== 'realizado') return false;
        return getProgramacaoProducaoProjectProductionMonthKey(project) === monthKey;
    });
}

function isProgramacaoProducaoRealizadoAssemblyEndMonthMismatch(project) {
    const productionMonthKey = getProgramacaoProducaoProjectProductionMonthKey(project);
    const assemblyEndMonthKey = getProgramacaoProducaoProjectInternalAssemblyEndMonthKey(project);

    if (!productionMonthKey || productionMonthKey === 'sem-data') return false;
    if (!assemblyEndMonthKey || assemblyEndMonthKey === 'sem-data') return false;

    return productionMonthKey !== assemblyEndMonthKey;
}

function getProgramacaoProducaoRealizadoClientGroupRenderOptions() {
    return {
        includeProjectCode: false,
        projectsById: programacaoProducaoCache.projectsById || {},
        includeOrderProjectAggregators: true,
        getRealizadoAssemblyMonthMismatch: isProgramacaoProducaoRealizadoAssemblyEndMonthMismatch
    };
}

function getProgramacaoProducaoRealizadoGroupingMonthKey(project, projectsById, fechamentoRootIds) {
    const anchor = typeof resolveGestaoRelatorioFechamentoProducaoGroupingAnchor === 'function'
        ? resolveGestaoRelatorioFechamentoProducaoGroupingAnchor(project, projectsById, fechamentoRootIds)
        : project;

    return getProgramacaoProducaoProjectProductionMonthKey(anchor, projectsById);
}

function getProgramacaoProducaoScheduleRootUnitCount(project) {
    if (typeof getOrderProjectScheduleUnitCount === 'function') {
        return getOrderProjectScheduleUnitCount(project, programacaoProducaoCache.projects || []);
    }
    return 1;
}

function sumProgramacaoProducaoRootProjectsUnitCount(projects) {
    return (projects || []).reduce(
        (sum, project) => sum + getProgramacaoProducaoScheduleRootUnitCount(project),
        0
    );
}

function computeProgramacaoProducaoMonthStageSummary(monthKey) {
    const statusById = getProgramacaoProducaoStatusById();
    const stageCounts = Object.fromEntries(PROGRAMACAO_PRODUCAO_MONTH_STAGES.map(stage => [stage.key, 0]));
    const stageValues = Object.fromEntries(PROGRAMACAO_PRODUCAO_MONTH_STAGES.map(stage => [stage.key, 0]));
    let programadoCount = 0;
    let programadoValue = 0;
    let realizadoCount = 0;
    let realizadoValue = 0;

    getProgramacaoProducaoProgramadoRootProjects(monthKey).forEach(project => {
        const stageKey = getProgramacaoProducaoProjectStageKey(project, statusById);
        if (!stageKey || stageKey === 'realizado') return;

        const safeValue = getProgramacaoProducaoScheduleRootSaleValue(project, monthKey);
        const unitCount = getProgramacaoProducaoScheduleRootUnitCount(project);

        stageCounts[stageKey] += unitCount;
        stageValues[stageKey] += safeValue;
        programadoCount += unitCount;
        programadoValue += safeValue;
    });

    getProgramacaoProducaoRealizadoRootProjects(monthKey).forEach(project => {
        const safeValue = getProgramacaoProducaoScheduleRootSaleValue(project, monthKey);
        const unitCount = getProgramacaoProducaoScheduleRootUnitCount(project);

        stageCounts.realizado += unitCount;
        stageValues.realizado += safeValue;
        realizadoCount += unitCount;
        realizadoValue += safeValue;
    });

    const total = PROGRAMACAO_PRODUCAO_MONTH_STAGES.reduce(
        (sum, stage) => sum + (stageCounts[stage.key] || 0),
        0
    );

    return {
        stageCounts,
        stageValues,
        total,
        programadoCount,
        programadoValue,
        realizadoCount,
        realizadoValue
    };
}

function collectProgramacaoProducaoProjectsWithScheduleChildren(rootProjects) {
    const rootIds = new Set((rootProjects || []).map(project => Number(project.id)).filter(Boolean));
    const included = new Map();

    (rootProjects || []).forEach(project => {
        const projectId = Number(project.id);
        if (projectId) included.set(projectId, project);
    });

    (programacaoProducaoCache.projects || []).forEach(project => {
        const projectId = Number(project.id);
        if (!projectId || included.has(projectId)) return;

        if (isProgramacaoProducaoComplementarProject(project)) {
            const parentId = getProgramacaoProducaoParentProjectId(project);
            if (parentId && rootIds.has(parentId)) included.set(projectId, project);
            return;
        }

        if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) {
            const parentId = typeof getGestaoRelatorioReplacedProjectParentId === 'function'
                ? getGestaoRelatorioReplacedProjectParentId(project)
                : Number(project.replacedByProjectId);
            if (parentId && rootIds.has(parentId)) included.set(projectId, project);
        }
    });

    return [...included.values()];
}

function sumProgramacaoProducaoRootProjectsSaleValue(projects, monthKey) {
    return (projects || []).reduce(
        (sum, project) => sum + getProgramacaoProducaoScheduleRootSaleValue(project, monthKey),
        0
    );
}

function getProgramacaoProducaoSummaryMonthGroupOptions(context, scheduleRootProjects = []) {
    const scheduleRootProjectIds = new Set(
        (scheduleRootProjects || []).map(project => Number(project.id)).filter(Boolean)
    );

    return {
        getProjectReferenceDate: getProgramacaoProducaoProjectReferenceDate,
        getOrderDisplayDeliveryDate: (project, groupContext) =>
            typeof getGestaoRelatorioPedidosPendentesProjectDeliveryDate === 'function'
                ? getGestaoRelatorioPedidosPendentesProjectDeliveryDate(project, groupContext)
                : null,
        sortByDeliveryDate: true,
        attachReplacedUnderReplacementOrder: true,
        scheduleRootProjectIds,
        includeOrderProjectAggregators: true,
        countAggregatorScheduleUnits: true,
        projectsForUnitCount: programacaoProducaoCache.projects || [],
        context
    };
}

function buildProgramacaoProducaoSummaryMonthProgramadoClients(monthKey, context) {
    const roots = getProgramacaoProducaoProgramadoRootProjects(monthKey);
    if (!roots.length) return [];

    const projects = collectProgramacaoProducaoProjectsWithScheduleChildren(roots);
    const groups = typeof groupGestaoRelatorioPedidosPendentesByMonthAndClient === 'function'
        ? groupGestaoRelatorioPedidosPendentesByMonthAndClient(
            projects,
            context,
            getProgramacaoProducaoSummaryMonthGroupOptions(context, roots)
        )
        : [];

    const clients = (groups.find(group => group.monthKey === monthKey) || {}).clients || [];

    return clients
        .map(clientGroup => {
            const orders = (clientGroup.orders || []).filter(orderGroup => orderGroup.projectCount > 0);
            if (!orders.length) return null;

            return {
                ...clientGroup,
                orders,
                orderCount: orders.length,
                projectCount: orders.reduce((sum, orderGroup) => sum + (orderGroup.projectCount || 0), 0),
                totalSaleValue: orders.reduce((sum, orderGroup) => sum + (orderGroup.totalSaleValue || 0), 0)
            };
        })
        .filter(Boolean);
}

function buildProgramacaoProducaoSummaryMonthRealizadoClients(monthKey, context) {
    const roots = getProgramacaoProducaoRealizadoRootProjects(monthKey);
    if (!roots.length) return [];

    const projects = collectProgramacaoProducaoProjectsWithScheduleChildren(roots);
    const rootIds = new Set(roots.map(project => Number(project.id)).filter(Boolean));
    const projectsById = programacaoProducaoCache.projectsById || {};
    const groups = typeof groupGestaoRelatorioFechamentoProducaoByMonthAndClient === 'function'
        ? groupGestaoRelatorioFechamentoProducaoByMonthAndClient(projects, {
            getMonthKey: (project) => getProgramacaoProducaoRealizadoGroupingMonthKey(
                project,
                projectsById,
                rootIds
            ),
            projectsById,
            fechamentoRoots: roots,
            fechamentoRootIds: rootIds,
            sortDescending: false,
            sortByDeliveryDate: false
        })
        : [];

    const clients = (groups.find(group => group.monthKey === monthKey) || {}).clients || [];

    return clients.map(clientGroup => {
        const projectTree = typeof buildGestaoRelatorioFechamentoProducaoProjectTree === 'function'
            ? buildGestaoRelatorioFechamentoProducaoProjectTree(
                clientGroup.projects,
                projectsById,
                { includeOrderProjectAggregators: true }
            )
            : [];

        const scheduleProjectCount = (clientGroup.projects || []).reduce(
            (sum, project) => sum + getProgramacaoProducaoScheduleRootUnitCount(project),
            0
        );

        return {
            ...clientGroup,
            scheduleProjectCount,
            totalSaleValue: typeof sumGestaoRelatorioPedidosPendentesProjectTreeSaleValues === 'function'
                ? sumGestaoRelatorioPedidosPendentesProjectTreeSaleValues(projectTree)
                : clientGroup.totalSaleValue
        };
    });
}

function collectProgramacaoProducaoSummaryMonthKeysFromCache() {
    const statusById = getProgramacaoProducaoStatusById();
    const keys = new Set();

    (programacaoProducaoCache.projects || []).forEach(project => {
        if (!isProgramacaoProducaoScheduleRootProject(project)) return;

        const stageKey = getProgramacaoProducaoProjectStageKey(project, statusById);
        if (!stageKey) return;

        keys.add(getProgramacaoProducaoProjectProductionMonthKey(project));
    });

    return keys;
}

function renderProgramacaoProducaoMonthProgressBar(stageSummary) {
    if (!stageSummary?.total) return '';

    const segments = PROGRAMACAO_PRODUCAO_MONTH_STAGES
        .map(stage => {
            const count = stageSummary.stageCounts[stage.key] || 0;
            const pct = Math.round((count / stageSummary.total) * 100);
            const widthPct = (count / stageSummary.total) * 100;
            return { ...stage, count, pct, widthPct };
        })
        .filter(segment => segment.count > 0);

    const barHtml = segments.map(segment => `
        <div class="h-full shrink-0"
            style="width: ${segment.widthPct}%; background-color: ${segment.color};"
            title="${escapeHtml(segment.label)}: ${segment.count} (${segment.pct}%)"></div>
    `).join('');

    const legendHtml = segments.map(segment => `
        <span class="inline-flex items-center gap-1 text-[10px] text-slate-600 whitespace-nowrap">
            <span class="w-2 h-2 rounded-sm shrink-0" style="background-color: ${segment.color};"></span>
            <span class="font-medium text-slate-700">${escapeHtml(segment.label)}</span>
            <span>${segment.count}</span>
            <span class="text-slate-400">(${segment.pct}%)</span>
        </span>
    `).join('');

    return `
        <div class="programacao-producao-month-progress flex-1 min-w-[10rem] basis-full sm:basis-auto">
            <div class="flex h-2.5 w-full rounded-full overflow-hidden border border-slate-200 bg-slate-100" role="img"
                aria-label="Distribuição por etapa de produção">
                ${barHtml}
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">${legendHtml}</div>
        </div>
    `;
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
        || result.error?.message?.includes('internalAssemblyEndDate')
        || result.error?.message?.includes('deliveryPhaseId')
        || result.error?.message?.includes('isComplementary')
        || result.error?.message?.includes('parentProject')
        || result.error?.message?.includes('replacedBy')
        || result.error?.message?.includes('isReplaced')
        || result.error?.message?.includes('replacesProjectId')
        || result.error?.message?.includes('isReplacement')
        || result.error?.message?.includes('clientDeliveryDate')
        || result.error?.message?.includes('projectStatus')
        || result.error?.message?.includes('sortOrder')
        || result.error?.message?.includes('isAggregator')
        || result.error?.message?.includes('aggregatorOrderProjectId')) {
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
    const parentProjects = (projects || []).filter(project => {
        if (typeof isOrderProjectGroupedChild === 'function' && isOrderProjectGroupedChild(project)) {
            return false;
        }
        return typeof isGestaoRelatorioPedidosPendentesComplementaryProject === 'function'
            ? !isGestaoRelatorioPedidosPendentesComplementaryProject(project)
            : !project.isComplementary;
    });
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
    const parentProjects = (projects || []).filter(project =>
        !isProgramacaoProducaoComplementarProject(project)
        && !(typeof isOrderProjectGroupedChild === 'function' && isOrderProjectGroupedChild(project))
    );
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
    const replacedProjects = (orderGroup.replacedProjects || []).filter(project => {
        const parentId = typeof getGestaoRelatorioReplacedProjectParentId === 'function'
            ? getGestaoRelatorioReplacedProjectParentId(project)
            : Number(project?.replacedByProjectId);
        return parentId && parentIds.has(parentId);
    });

    const scheduleProjects = [...parentProjects, ...complementarProjects];
    if (!scheduleProjects.length && !replacedProjects.length) return null;

    const projectTree = typeof buildGestaoRelatorioPedidosPendentesProjectTree === 'function'
        ? buildGestaoRelatorioPedidosPendentesProjectTree(
            parentProjects,
            complementarProjects,
            context.projectsById,
            {
                sortByDeliveryDate: true,
                context,
                replacedProjects
            }
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
            || getProgramacaoProducaoOrderSortDeliveryDate(scheduleProjects, context),
        deliveryDatesLabel: phaseLabel
            || getProgramacaoProducaoOrderDeliveryDatesLabel(scheduleProjects, context),
        monthInputValue: getProgramacaoProducaoOrderMonthInputValue(scheduleProjects),
        projectTree,
        allProjectIds: scheduleProjects.map(project => Number(project.id)).filter(Boolean)
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
                complementarProjects: [],
                replacedProjects: []
            };
        }

        if (typeof isOrderProjectGroupedChild === 'function' && isOrderProjectGroupedChild(project)) {
            return;
        }

        if (typeof isGestaoRelatorioPedidosPendentesComplementaryProject === 'function'
            && isGestaoRelatorioPedidosPendentesComplementaryProject(project)) {
            ordersById[orderId].complementarProjects.push(project);
            return;
        }

        if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) {
            ordersById[orderId].replacedProjects.push(project);
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
    const searchTerm = getProgramacaoProducaoClientFilter().toLocaleLowerCase('pt-BR');
    const hideWithMonth = getProgramacaoProducaoHideWithMonth();

    return (orders || []).filter(order => {
        if (hideWithMonth && orderProgramacaoProducaoHasMonthDefined(order)) return false;
        if (searchTerm) {
            const name = String(order.clientName || getOrderClientName(order.order) || '')
                .toLocaleLowerCase('pt-BR');
            const orderCode = String(order.orderCode || order.order?.orderCode || '')
                .toLocaleLowerCase('pt-BR');
            if (!name.includes(searchTerm) && !orderCode.includes(searchTerm)) return false;
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

function renderProgramacaoProducaoChildProjectMonthDisplay(project) {
    const monthValue = toProgramacaoProducaoMonthInputValue(getProgramacaoProducaoEffectiveProductionMonth(project));
    if (!monthValue) {
        return '<span class="text-[10px] text-slate-400 shrink-0">Mesmo do pai</span>';
    }

    return `<span class="text-[10px] text-slate-500 shrink-0" title="Mesmo mês do projeto pai">${escapeHtml(formatProgramacaoProducaoMonthLabel(monthValue))}</span>`;
}

function getProgramacaoProducaoChildProjectNameLabel(project) {
    return typeof getGestaoRelatorioProjectLabel === 'function'
        ? getGestaoRelatorioProjectLabel(project, { includeProjectCode: false })
        : (project?.name || '—');
}

function renderProgramacaoProducaoChildProjectLabelHtml(project) {
    const orderCode = String(project?.order?.orderCode || '').trim();
    const nameLabel = escapeHtml(getProgramacaoProducaoChildProjectNameLabel(project));

    if (!orderCode) {
        return nameLabel;
    }

    return `<span class="font-mono text-[11px] text-slate-500">${escapeHtml(orderCode)}</span> · ${nameLabel}`;
}

function getProgramacaoProducaoNestedProjectKindLabel(project) {
    if (typeof getGestaoRelatorioPedidosPendentesNestedProjectKindLabel === 'function') {
        return getGestaoRelatorioPedidosPendentesNestedProjectKindLabel(project);
    }
    if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) {
        return 'Substituído';
    }
    return 'Complementar';
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
            ? getGestaoRelatorioProjectLabel(project, { includeProjectCode: false })
            : (project?.name || '—');
        const labelHtml = parentPending && typeof renderAggregatorProjectNoticeHtml === 'function'
            ? `<span class="inline-flex flex-wrap items-center gap-1.5 min-w-0"><span class="truncate">${escapeHtml(label)}</span>${renderAggregatorProjectNoticeHtml(project)}</span>`
            : escapeHtml(label);

        const parentRow = `
            <div class="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-xs ${parentPending ? 'font-medium text-slate-800' : 'text-slate-500'} truncate">${labelHtml}</span>
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

        const childRows = (children || []).map(child => {
            const childKindLabel = getProgramacaoProducaoNestedProjectKindLabel(child);
            const childStatusName = typeof getGestaoRelatorioStatusName === 'function'
                ? getGestaoRelatorioStatusName(child)
                : (child?.projectStatus?.name || '');
            const childStatusClass = typeof getOrderProjectStatusBadgeClass === 'function'
                ? getOrderProjectStatusBadgeClass(childStatusName)
                : 'bg-slate-100 text-slate-700';

            return `
            <div class="flex flex-wrap items-center justify-between gap-2 py-2 pl-4 border-b border-slate-50 last:border-0 bg-slate-50/30">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-xs text-slate-600 truncate">↳ ${renderProgramacaoProducaoChildProjectLabelHtml(child)}</span>
                    <span class="text-[10px] text-slate-400 shrink-0">${escapeHtml(childKindLabel)}</span>
                    ${childKindLabel === 'Substituído' && childStatusName ? `
                        <span class="inline-flex text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${childStatusClass}">
                            ${escapeHtml(childStatusName)}
                        </span>
                    ` : ''}
                </div>
                ${renderProgramacaoProducaoChildProjectMonthDisplay(child)}
            </div>
        `;
        }).join('');

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

function getProgramacaoProducaoPreviousMonthKey(monthKey) {
    const [year, month] = String(monthKey || '').split('-').map(Number);
    if (!year || !month) return '';
    const date = new Date(year, month - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function programacaoProducaoMonthGroupHasContent(monthGroup) {
    const monthKey = monthGroup?.monthKey;
    if (!monthKey) return false;

    const stageSummary = computeProgramacaoProducaoMonthStageSummary(monthKey);
    if (stageSummary.total) return true;

    return Boolean(
        getProgramacaoProducaoProgramadoRootProjects(monthKey).length
        || getProgramacaoProducaoRealizadoRootProjects(monthKey).length
    );
}

function filterProgramacaoProducaoSummaryMonthGroups(groups) {
    const currentMonthKey = getProgramacaoProducaoCurrentMonthKey();
    const previousMonthKey = getProgramacaoProducaoPreviousMonthKey(currentMonthKey);

    return (groups || []).filter(monthGroup => {
        const monthKey = monthGroup.monthKey;
        if (!monthKey || monthKey === 'sem-data') {
            return Boolean(monthGroup.projectCount);
        }
        if (monthKey >= currentMonthKey) return true;
        if (monthKey === previousMonthKey) return programacaoProducaoMonthGroupHasContent(monthGroup);
        return Boolean(monthGroup.projectCount);
    });
}

function renderProgramacaoProducaoSummaryMonthGroup(monthGroup, emptyMonthLabel) {
    const monthKey = monthGroup.monthKey;
    const context = getProgramacaoProducaoContext();
    const programadoRoots = getProgramacaoProducaoProgramadoRootProjects(monthKey);
    const realizadoRoots = getProgramacaoProducaoRealizadoRootProjects(monthKey);
    const stageSummary = computeProgramacaoProducaoMonthStageSummary(monthKey);
    const programadoCount = stageSummary.total
        ? stageSummary.programadoCount
        : sumProgramacaoProducaoRootProjectsUnitCount(programadoRoots);
    const realizadoCount = stageSummary.total
        ? stageSummary.realizadoCount
        : sumProgramacaoProducaoRootProjectsUnitCount(realizadoRoots);
    const programadoSaleValue = stageSummary.total
        ? stageSummary.programadoValue
        : sumProgramacaoProducaoRootProjectsSaleValue(programadoRoots, monthKey);
    const realizadoSaleValue = stageSummary.total
        ? stageSummary.realizadoValue
        : sumProgramacaoProducaoRootProjectsSaleValue(realizadoRoots, monthKey);
    const formatValue = (value) => typeof formatGestaoDisplaySaleValue === 'function'
        ? formatGestaoDisplaySaleValue(value || 0)
        : (typeof formatSaleValue === 'function'
            ? formatSaleValue(value || 0)
            : (value || 0));
    const pendingTotalLabel = formatValue(programadoSaleValue);
    const fechamentoTotalLabel = formatValue(realizadoSaleValue);
    const progressBarHtml = renderProgramacaoProducaoMonthProgressBar(stageSummary);
    const monthLabel = typeof formatGestaoRelatorioMonthLabel === 'function'
        ? formatGestaoRelatorioMonthLabel(monthKey, emptyMonthLabel)
        : monthKey;

    const programadoClients = buildProgramacaoProducaoSummaryMonthProgramadoClients(monthKey, context);
    const realizadoClients = buildProgramacaoProducaoSummaryMonthRealizadoClients(monthKey, context);

    const pendingBody = programadoClients.length
        ? programadoClients.map(clientGroup =>
            typeof renderGestaoRelatorioPedidosPendentesClientGroup === 'function'
                ? renderGestaoRelatorioPedidosPendentesClientGroup(clientGroup, { includeProjectCode: false })
                : ''
        ).join('')
        : '';

    const realizadoRenderOptions = getProgramacaoProducaoRealizadoClientGroupRenderOptions();
    const fechamentoBody = realizadoClients.length
        ? `
            <div class="space-y-2 ${pendingBody ? 'mt-2 pt-2 border-t border-emerald-100' : ''}">
                <p class="text-[10px] font-semibold uppercase text-emerald-700 px-1">Realizados</p>
                <p class="text-[10px] text-slate-400 px-1">Agrupados pelo mês programado; a coluna Fim mont. interna mostra quando a produção terminou. * quando o mês da data difere do programado.</p>
                ${realizadoClients.map(clientGroup =>
                    typeof renderGestaoRelatorioFechamentoProducaoClientGroup === 'function'
                        ? renderGestaoRelatorioFechamentoProducaoClientGroup(clientGroup, realizadoRenderOptions)
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
                <div class="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                    <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-indigo-700 hover:text-indigo-900 text-[10px]"
                        aria-label="Expandir">▶</button>
                    <span class="text-xs font-semibold text-slate-900">${escapeHtml(monthLabel)}</span>
                    ${programadoCount ? `
                        <span class="text-[10px] text-slate-500 shrink-0">${programadoCount} programado${programadoCount === 1 ? '' : 's'}</span>
                    ` : ''}
                    ${realizadoCount ? `
                        <span class="text-[10px] text-emerald-700 shrink-0">${realizadoCount} realizado${realizadoCount === 1 ? '' : 's'}</span>
                    ` : ''}
                    ${progressBarHtml}
                </div>
                <div class="flex flex-wrap items-center gap-2 shrink-0">
                    ${programadoCount ? `<span class="text-xs font-bold text-indigo-700">${escapeHtml(pendingTotalLabel)}</span>` : ''}
                    ${realizadoCount ? `<span class="text-xs font-bold text-emerald-700">${escapeHtml(fechamentoTotalLabel)}</span>` : ''}
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
        sortByDeliveryDate: true,
        includeOrderProjectAggregators: true,
        countAggregatorScheduleUnits: true,
        projectsForUnitCount: programacaoProducaoCache.projects || []
    });
    const mergedGroups = mergeProgramacaoProducaoSummaryMonthGroups(
        pendingGroups,
        programacaoProducaoCache.fechamentoMonthGroups || []
    );
    const mergedByMonthKey = Object.fromEntries(mergedGroups.map(group => [group.monthKey, group]));

    collectProgramacaoProducaoSummaryMonthKeysFromCache().forEach(monthKey => {
        if (!mergedByMonthKey[monthKey]) {
            mergedGroups.push({
                monthKey,
                clients: [],
                projectCount: 0,
                totalSaleValue: 0,
                fechamento: null
            });
        }
    });

    mergedGroups.sort((a, b) => {
        if (a.monthKey === 'sem-data') return 1;
        if (b.monthKey === 'sem-data') return -1;
        return a.monthKey.localeCompare(b.monthKey);
    });

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

    const project = programacaoProducaoCache.projectsById[normalizedId];
    const complementarIds = getProgramacaoProducaoComplementarChildren(normalizedId)
        .map(item => Number(item.id))
        .filter(Boolean);
    const aggregatorChildIds = typeof isOrderProjectAggregator === 'function'
        && isOrderProjectAggregator(project)
        && typeof getOrderProjectAggregatorChildProjects === 'function'
        ? getOrderProjectAggregatorChildProjects(
            { projects: programacaoProducaoCache.projects || [] },
            normalizedId
        ).map(item => Number(item.id)).filter(Boolean)
        : [];

    await persistProgramacaoProducaoProjectsMonth(
        [normalizedId, ...complementarIds, ...aggregatorChildIds],
        monthInputValue
    );
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

    let { data: projects, error } = await fetchProgramacaoProducaoProjects();
    if (!error && projects?.length && typeof enrichOrderProjectsWithSubstitutionRelations === 'function') {
        projects = await enrichOrderProjectsWithSubstitutionRelations(projects);
    }
    if (!error && projects?.length && typeof enrichOrderProjectsWithAggregatorChildrenSaleValue === 'function') {
        projects = enrichOrderProjectsWithAggregatorChildrenSaleValue(projects);
    }
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
            const projectsByIdForMonth = typeof buildGestaoRelatorioProjectsById === 'function'
                ? buildGestaoRelatorioProjectsById(projects || [])
                : {};
            fechamentoMonthGroups = await loadGestaoRelatorioFechamentoProducaoMonthGroups({
                getMonthKey: (project) => getProgramacaoProducaoProjectProductionMonthKey(
                    project,
                    projectsByIdForMonth
                ),
                sortDescending: false,
                sortByDeliveryDate: false,
                phasesByOrderId,
                projectsById: projectsByIdForMonth
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
    if (typeof canViewProgramacaoProducao === 'function' ? !canViewProgramacaoProducao() : !canAccessGestao()) {
        alertAppDialog('Sem permissão para acessar a programação de produção.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    hideAllGestaoPanels();
    document.getElementById('gestao-programacao-producao-panel')?.classList.remove('hidden');
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
    const monthKey = monthGroup.monthKey;
    const context = getProgramacaoProducaoContext();

    const addProject = (project, situation) => {
        const projectId = Number(project?.id);
        if (!projectId || seenIds.has(projectId)) return;
        seenIds.add(projectId);
        rows.push({ project, situation });
    };

    const programadoClients = buildProgramacaoProducaoSummaryMonthProgramadoClients(monthKey, context);
    programadoClients.forEach(clientGroup => {
        (clientGroup.orders || []).forEach(orderGroup => {
            (orderGroup.projectTree || []).forEach(({ project, children, parentPending }) => {
                if (parentPending) addProject(project, 'Programado');
                (children || []).forEach(child => addProject(child, 'Programado'));
            });
        });
    });

    const realizadoClients = buildProgramacaoProducaoSummaryMonthRealizadoClients(monthKey, context);
    const projectsById = programacaoProducaoCache.projectsById || {};
    realizadoClients.forEach(clientGroup => {
        const fechamentoTree = typeof buildGestaoRelatorioFechamentoProducaoProjectTree === 'function'
            ? buildGestaoRelatorioFechamentoProducaoProjectTree(clientGroup.projects, projectsById)
            : (clientGroup.projects || []).map(project => ({ project, children: [], parentPending: true }));

        fechamentoTree.forEach(({ project, children, parentPending }) => {
            if (parentPending) addProject(project, 'Realizado');
            (children || []).forEach(child => addProject(child, 'Realizado'));
        });
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
        if (typeof showProgramacaoProducaoView === 'function') showProgramacaoProducaoView();
        else showGestaoProgramacaoProducaoPanel();
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
