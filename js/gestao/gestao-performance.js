const GESTAO_PERFORMANCE_DEFAULT_DAYS = 30;

const GESTAO_PERFORMANCE_SUMMARY_METRICS = [
    {
        id: 'desenvolvimento',
        label: 'Desenvolvimento de projeto',
        description: 'Tempo médio desde Medição Realizada até o primeiro Aguardando Aprovação de cada projeto.',
        startStatuses: ['Medição Realizada'],
        endStatuses: ['Aguardando Aprovação']
    },
    {
        id: 'fabricacao',
        label: 'Fabricação',
        description: 'Tempo médio desde Em Produção até Expedição de cada projeto.',
        startStatuses: ['Em Produção', 'Em produção'],
        endStatuses: ['Expedição']
    }
];

const GESTAO_PERFORMANCE_AREA_METRICS = [
    {
        id: 'anteprojeto',
        label: 'Anteprojeto',
        description: 'Tempo médio desde Medição Realizada até Aguardando Projeto Técnico.',
        startStatuses: ['Medição Realizada'],
        endStatuses: ['Aguardando Projeto Técnico']
    },
    {
        id: 'projeto-tecnico',
        label: 'Projeto Técnico',
        description: 'Tempo médio desde Projeto Técnico até Aguardando Aprovação.',
        startStatuses: ['Projeto Técnico'],
        endStatuses: ['Aguardando Aprovação']
    },
    {
        id: 'aprovacao-comercial',
        label: 'Aprovação comercial',
        description: 'Tempo médio desde Aguardando Aprovação até o primeiro Em Revisão ou Aguardando PPCP.',
        startStatuses: ['Aguardando Aprovação'],
        endStatuses: [
            ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS,
            ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ,
            ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_COMERCIAL,
            ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_TECNICA,
            ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR,
            ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ,
            'Em Revisão',
            'Em revisão',
            'Nomear',
            'Aguardando PPCP'
        ]
    },
    {
        id: 'conferencia-comercial',
        label: 'Conferência comercial',
        description: 'Tempo médio desde Conferência Enviada até Aguardando Projeto Técnico.',
        startStatuses: ['Conferência Enviada'],
        endStatuses: ['Aguardando Projeto Técnico']
    }
];

const GESTAO_PERFORMANCE_BAR_COLORS = ['#6366f1', '#8b5cf6', '#0891b2', '#059669', '#d97706', '#e11d48'];

let gestaoPerformanceProjectsById = {};

const GESTAO_PERFORMANCE_STATUS_EXIT_METRICS = [
    {
        id: 'left-projeto-tecnico',
        label: 'Projeto Técnico',
        statusNames: ['Projeto Técnico'],
        description: 'Projetos que deixaram o status Projeto Técnico. A data considerada é a entrada no status seguinte.'
    },
    {
        id: 'left-aguardando-aprovacao',
        label: 'Aprovação',
        statusNames: ['Aguardando Aprovação'],
        description: 'Projetos que deixaram o status Aguardando Aprovação. A data considerada é a entrada no status seguinte.'
    },
    {
        id: 'left-implantacao',
        label: 'Implantação',
        statusNames: ['Implantação'],
        description: 'Projetos que deixaram o status Implantação. A data considerada é a entrada no status seguinte.'
    }
];

const GESTAO_PERFORMANCE_PRODUCTION_METRICS = [
    {
        id: 'aguardando-pt',
        label: 'Aguardando Projeto Técnico',
        minSort: 8,
        maxSort: 9
    },
    {
        id: 'em-aprovacao',
        label: 'Em Aprovação',
        minSort: 10,
        maxSort: 12
    },
    {
        id: 'em-implantacao',
        label: 'Em Implantação',
        minSort: 13,
        maxSort: 17
    },
    {
        id: 'em-producao',
        label: 'Em Produção',
        minSort: 18,
        maxSort: 19
    }
];

function getGestaoPerformanceDaysInput() {
    const input = document.getElementById('gestao-performance-days');
    const value = Number(input?.value);
    if (!Number.isFinite(value) || value < 1) return GESTAO_PERFORMANCE_DEFAULT_DAYS;
    return Math.min(Math.floor(value), 365);
}

function getGestaoPerformanceCutoffDate(lookbackDays) {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    return cutoff;
}

function formatGestaoPerformanceDuration(seconds) {
    if (seconds == null || !Number.isFinite(seconds)) return '—';

    const days = seconds / 86400;
    if (days >= 1) {
        const formatted = days.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        return `${formatted} dia${days >= 1.05 ? 's' : ''}`;
    }

    const hours = seconds / 3600;
    if (hours >= 1) {
        return `${hours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
    }

    const minutes = Math.max(1, Math.round(seconds / 60));
    return `${minutes} min`;
}

function formatGestaoPerformanceDaysValue(seconds) {
    if (seconds == null || !Number.isFinite(seconds)) return null;
    return seconds / 86400;
}

function getGestaoPerformanceCurrentMonthBounds() {
    if (typeof getGestaoDashboardCurrentMonthBounds === 'function') {
        return getGestaoDashboardCurrentMonthBounds();
    }

    const referenceDate = new Date();
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const label = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return {
        start,
        end,
        label: label.charAt(0).toUpperCase() + label.slice(1)
    };
}

function normalizeGestaoPerformanceStatusName(value) {
    return String(value || '').trim().toLowerCase();
}

function getGestaoPerformanceProjectStatusName(project, statusById = {}) {
    return project?.projectStatus?.name || statusById[project?.statusId]?.name || '';
}

function getGestaoPerformanceStatusSortOrder(statusName, statusById, statuses) {
    const normalized = normalizeGestaoPerformanceStatusName(statusName);
    const fromList = (statuses || []).find(status => normalizeGestaoPerformanceStatusName(status.name) === normalized);
    if (fromList?.sortOrder != null) return Number(fromList.sortOrder);

    const fromMap = Object.values(statusById || {}).find(
        status => normalizeGestaoPerformanceStatusName(status.name) === normalized
    );
    if (fromMap?.sortOrder != null) return Number(fromMap.sortOrder);

    return null;
}

function getGestaoPerformanceProjectStatusSortOrder(project, statusById, statuses) {
    const statusName = getGestaoPerformanceProjectStatusName(project, statusById);
    return getGestaoPerformanceStatusSortOrder(statusName, statusById, statuses);
}

function isGestaoPerformanceStatusSortInRange(sortOrder, minSort, maxSort) {
    if (sortOrder == null || !Number.isFinite(sortOrder)) return false;
    return sortOrder >= minSort && sortOrder <= maxSort;
}

function hasGestaoPerformanceProjectInStatusSortRange(
    project,
    minSort,
    maxSort,
    statusById,
    statuses,
    projectsById = {}
) {
    const referenceProject = getGestaoPerformanceReferenceProject(project, projectsById);
    const currentSort = getGestaoPerformanceProjectStatusSortOrder(referenceProject, statusById, statuses);
    return isGestaoPerformanceStatusSortInRange(currentSort, minSort, maxSort);
}

function isGestaoPerformanceStatusNameMatch(statusName, statusNames) {
    const normalized = normalizeGestaoPerformanceStatusName(statusName);
    return (statusNames || []).some(
        name => normalizeGestaoPerformanceStatusName(name) === normalized
    );
}

function findGestaoPerformanceStatusExitAt(timeline, statusNames) {
    if (!timeline?.length) return null;

    for (let index = 0; index < timeline.length; index += 1) {
        if (!isGestaoPerformanceStatusNameMatch(timeline[index].statusName, statusNames)) continue;

        const nextEntry = timeline[index + 1];
        return nextEntry?.changedAt || null;
    }

    return null;
}

function getGestaoPerformanceMonthKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${month}`;
}

function buildGestaoPerformanceMonthKeys(cutoffDate) {
    const keys = [];
    const cursor = new Date(cutoffDate.getFullYear(), cutoffDate.getMonth(), 1);
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(1);

    while (cursor <= end) {
        keys.push(getGestaoPerformanceMonthKey(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return keys;
}

function buildGestaoPerformanceMonthKeysBetween(startMonthKey, endMonthKey) {
    const [startYear, startMonth] = String(startMonthKey || '').split('-').map(Number);
    const [endYear, endMonth] = String(endMonthKey || '').split('-').map(Number);
    if (!startYear || !startMonth || !endYear || !endMonth) return [];

    const keys = [];
    const cursor = new Date(startYear, startMonth - 1, 1);
    const end = new Date(endYear, endMonth - 1, 1);

    while (cursor <= end) {
        keys.push(getGestaoPerformanceMonthKey(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return keys;
}

function getGestaoPerformanceHistoryStatusName(row, field, statusById = {}) {
    const embedded = row?.[field];
    const fromEmbed = Array.isArray(embedded) ? embedded[0]?.name : embedded?.name;
    if (fromEmbed) return fromEmbed;

    const idField = field === 'previousStatus' ? 'previousStatusId' : 'newStatusId';
    const statusId = Number(row?.[idField]);
    if (!statusId) return '';

    return statusById[statusId]?.name || '';
}

function formatGestaoPerformanceMonthLabel(monthKey) {
    if (typeof formatGestaoRelatorioMonthLabel === 'function') {
        return formatGestaoRelatorioMonthLabel(monthKey, '—');
    }

    const [year, month] = String(monthKey || '').split('-');
    if (!year || !month) return '—';

    const date = new Date(Number(year), Number(month) - 1, 1);
    const label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function findGestaoPerformanceStatusRangeEntryAt(timeline, minSort, maxSort, statusById, statuses) {
    for (const entry of timeline || []) {
        const sortOrder = getGestaoPerformanceStatusSortOrder(entry.statusName, statusById, statuses);
        if (isGestaoPerformanceStatusSortInRange(sortOrder, minSort, maxSort)) {
            return entry.changedAt;
        }
    }

    return null;
}

function isGestaoPerformanceComplementaryProject(project) {
    return typeof isComplementaryOrderProject === 'function'
        ? isComplementaryOrderProject(project)
        : project?.isComplementary === true;
}

function getGestaoPerformanceReferenceProject(project, projectsById = {}) {
    if (!isGestaoPerformanceComplementaryProject(project)) return project;

    const parentId = Number(project.parentProjectId);
    if (!parentId) return project;

    return projectsById[parentId] || project;
}

function getGestaoPerformanceProjectTimeline(project, timelineByProjectId, projectsById = {}) {
    const referenceProject = getGestaoPerformanceReferenceProject(project, projectsById);
    const referenceId = Number(referenceProject.id);
    const projectId = Number(project.id);

    return timelineByProjectId[referenceId] || timelineByProjectId[projectId] || [];
}

function matchesGestaoPerformanceProductionMetric(
    project,
    metric,
    statusById,
    statuses,
    projectsById = {}
) {
    return hasGestaoPerformanceProjectInStatusSortRange(
        project,
        metric.minSort,
        metric.maxSort,
        statusById,
        statuses,
        projectsById
    );
}

function buildGestaoPerformanceProductionMetricDescription(metric) {
    const relationHint = ' Complementares usam o status e as datas do projeto pai; valores de complementares e substituições são somados ao projeto principal.';
    return `Projetos com status atual entre ${metric.minSort} e ${metric.maxSort}.${relationHint}`;
}

function buildGestaoPerformanceTimeline(historyRows, statusById) {
    const byProjectId = {};

    (historyRows || []).forEach(row => {
        const projectId = Number(row.orderProjectId);
        if (!projectId) return;

        const statusName = row.newStatus?.name || statusById[row.newStatusId]?.name;
        const changedAt = new Date(row.changedAt);
        if (!statusName || Number.isNaN(changedAt.getTime())) return;

        if (!byProjectId[projectId]) byProjectId[projectId] = [];
        byProjectId[projectId].push({ statusName, changedAt });
    });

    Object.values(byProjectId).forEach(timeline => {
        timeline.sort((a, b) => a.changedAt - b.changedAt);
    });

    return byProjectId;
}

function measureGestaoPerformanceSpan(timeline, metric) {
    if (!timeline?.length) return null;

    const startSet = new Set(metric.startStatuses);
    const endSet = new Set(metric.endStatuses);
    let startAt = null;

    for (const entry of timeline) {
        if (!startAt) {
            if (startSet.has(entry.statusName)) startAt = entry.changedAt;
            continue;
        }

        if (endSet.has(entry.statusName)) {
            const seconds = (entry.changedAt.getTime() - startAt.getTime()) / 1000;
            if (seconds < 0) return null;
            return { seconds, endAt: entry.changedAt };
        }
    }

    return null;
}

function computeGestaoPerformanceMetric(timelineByProjectId, metric, cutoffDate) {
    const samples = [];

    Object.values(timelineByProjectId).forEach(timeline => {
        const span = measureGestaoPerformanceSpan(timeline, metric);
        if (!span || span.endAt < cutoffDate) return;
        samples.push(span.seconds);
    });

    if (!samples.length) {
        return {
            ...metric,
            averageSeconds: null,
            sampleCount: 0
        };
    }

    const averageSeconds = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return {
        ...metric,
        averageSeconds,
        sampleCount: samples.length
    };
}

const GESTAO_PERFORMANCE_PROJECT_SELECT = [
    'id, orderId, name, saleValue, statusId, internalAssemblyEndDate, isComplementary, parentProjectId, isReplaced, isReplacement, replacesProjectId, replaces:replacesProjectId(saleValue), order:salesOrders(orderCode, client:Client(name)), projectStatus:OrderProjectStatus(id, name)',
    'id, orderId, name, saleValue, statusId, internalAssemblyEndDate, isComplementary, parentProjectId, isReplaced, isReplacement, replacesProjectId, order:salesOrders(orderCode, client:Client(name)), projectStatus:OrderProjectStatus(id, name)',
    'id, orderId, name, saleValue, statusId, internalAssemblyEndDate, isComplementary, parentProjectId, isReplaced, isReplacement, replacesProjectId, order:salesOrders(orderCode, client:Client(name))',
    'id, orderId, name, saleValue, statusId, internalAssemblyEndDate, isComplementary, parentProjectId, projectStatus:OrderProjectStatus(id, name)',
    'id, orderId, name, saleValue, statusId, internalAssemblyEndDate, isComplementary, parentProjectId',
    'id, orderId, name, saleValue, statusId, internalAssemblyEndDate, order:salesOrders(orderCode, client:Client(name)), projectStatus:OrderProjectStatus(id, name)',
    'id, orderId, name, saleValue, statusId, internalAssemblyEndDate, order:salesOrders(orderCode, client:Client(name))',
    'id, orderId, name, saleValue, statusId, internalAssemblyEndDate, projectStatus:OrderProjectStatus(id, name)',
    'id, orderId, name, saleValue, statusId, internalAssemblyEndDate',
    'id, orderId, name, statusId, internalAssemblyEndDate, order:salesOrders(orderCode, client:Client(name)), projectStatus:OrderProjectStatus(id, name)',
    'id, orderId, name, statusId, internalAssemblyEndDate'
];

function enrichGestaoPerformanceProjects(projects, statusById) {
    return (projects || []).map(project => ({
        ...project,
        projectStatus: project.projectStatus || statusById[project.statusId] || null
    }));
}

function gestaoPerformanceDateToLocalIso(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatGestaoPerformanceEntryDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';

    const isoDate = gestaoPerformanceDateToLocalIso(date);
    if (typeof formatGestaoDate === 'function') return formatGestaoDate(isoDate);
    return isoDate;
}

function formatGestaoPerformanceStatusRangeEntryDate(timeline, metric, statusById, statuses) {
    const entryAt = findGestaoPerformanceStatusRangeEntryAt(
        timeline,
        metric.minSort,
        metric.maxSort,
        statusById,
        statuses
    );
    return formatGestaoPerformanceEntryDate(entryAt);
}

function getGestaoPerformanceProjectListSortKey(project) {
    const orderCode = project?.order?.orderCode || '—';
    const clientName = typeof getOrderClientName === 'function'
        ? getOrderClientName(project.order)
        : (project?.order?.client?.name || '—');
    const projectName = project?.name || '—';
    return `${orderCode} - ${clientName} - ${projectName}`;
}

function getGestaoPerformanceProjectSortKey(project, statusById = {}) {
    const currentStatus = getGestaoPerformanceProjectStatusName(project, statusById) || '—';
    return `${getGestaoPerformanceProjectListSortKey(project)} - ${currentStatus}`;
}

function sortGestaoPerformanceStatusExitProjectEntries(entries) {
    return [...(entries || [])].sort((left, right) =>
        getGestaoPerformanceProjectListSortKey(left.project).localeCompare(
            getGestaoPerformanceProjectListSortKey(right.project),
            'pt-BR',
            { sensitivity: 'base' }
        )
    );
}

function sortGestaoPerformanceProjectsForList(projects, statusById = {}) {
    return [...(projects || [])].sort((left, right) =>
        getGestaoPerformanceProjectSortKey(left, statusById).localeCompare(
            getGestaoPerformanceProjectSortKey(right, statusById),
            'pt-BR',
            { sensitivity: 'base' }
        )
    );
}

function getGestaoPerformanceComplementaryChildren(parentProjectId, projectsById = {}) {
    const parentId = Number(parentProjectId);
    if (!parentId) return [];

    return Object.values(projectsById).filter(project =>
        isGestaoPerformanceComplementaryProject(project)
        && Number(project.parentProjectId) === parentId
    );
}

function getGestaoPerformanceBaseProjectSaleValue(project) {
    if (typeof getProjectEffectiveSaleValue === 'function') {
        return getProjectEffectiveSaleValue(project);
    }

    const value = Number(project?.saleValue);
    return Number.isFinite(value) ? value : 0;
}

function getGestaoPerformanceProjectSaleValue(project, projectsById = {}) {
    const baseValue = getGestaoPerformanceBaseProjectSaleValue(project);
    if (isGestaoPerformanceComplementaryProject(project)) return baseValue;

    const childrenValue = getGestaoPerformanceComplementaryChildren(project?.id, projectsById)
        .reduce((total, child) => {
            const value = Number(child?.saleValue);
            return total + (Number.isFinite(value) ? value : 0);
        }, 0);

    return baseValue + childrenValue;
}

function shouldCountGestaoPerformanceProductionProject(project) {
    if (isGestaoPerformanceComplementaryProject(project)) return false;
    if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) return false;
    return true;
}

function formatGestaoPerformanceSaleValue(value) {
    if (typeof formatSaleValue === 'function') {
        return formatSaleValue(value);
    }

    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatGestaoPerformanceProjectSaleValue(project, projectsById = {}) {
    return formatGestaoPerformanceSaleValue(getGestaoPerformanceProjectSaleValue(project, projectsById));
}

function sumGestaoPerformanceProjectsSaleValue(projects, projectsById = {}) {
    return (projects || []).reduce(
        (total, project) => total + getGestaoPerformanceProjectSaleValue(project, projectsById),
        0
    );
}

function renderGestaoPerformanceProjectListItem(
    project,
    metric,
    statusById,
    statuses,
    timelineByProjectId,
    projectsById = {}
) {
    const orderCode = project?.order?.orderCode || '—';
    const clientName = typeof getOrderClientName === 'function'
        ? getOrderClientName(project.order)
        : (project?.order?.client?.name || '—');
    const projectName = project?.name || '—';
    const timeline = getGestaoPerformanceProjectTimeline(project, timelineByProjectId, projectsById);
    const rangeEntryDate = formatGestaoPerformanceStatusRangeEntryDate(timeline, metric, statusById, statuses);
    const currentStatus = getGestaoPerformanceProjectStatusName(project, statusById) || '—';
    const saleValueLabel = formatGestaoPerformanceProjectSaleValue(project, projectsById);
    const projectId = Number(project.id);

    return `
        <li class="gestao-performance-project-list__item">
            <span class="gestao-performance-project-list__text">
                ${escapeHtml(orderCode)} - ${escapeHtml(clientName)} - ${escapeHtml(projectName)} - ${escapeHtml(rangeEntryDate)} - ${escapeHtml(currentStatus)} - ${escapeHtml(saleValueLabel)}
            </span>
            <button type="button"
                class="gestao-performance-history-btn shrink-0 text-[10px] bg-white border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-md font-medium hover:bg-indigo-50"
                data-order-project-id="${projectId}">
                Histórico
            </button>
        </li>
    `;
}

async function fetchGestaoPerformanceProjects() {
    const pageSize = 1000;
    let selectIndex = 0;
    let lastError = null;

    while (selectIndex < GESTAO_PERFORMANCE_PROJECT_SELECT.length) {
        const projects = [];
        let from = 0;
        let failed = false;

        while (true) {
            const { data, error } = await supabaseClient
                .from('OrderProject')
                .select(GESTAO_PERFORMANCE_PROJECT_SELECT[selectIndex])
                .order('id', { ascending: true })
                .range(from, from + pageSize - 1);

            if (error) {
                lastError = error;
                failed = true;
                break;
            }

            projects.push(...(data || []));
            if (!data || data.length < pageSize) break;
            from += pageSize;
        }

        if (!failed) {
            return { data: projects, error: null };
        }

        if (!/relationship|embed|schema cache|column/i.test(lastError?.message || '')) {
            return { data: [], error: lastError };
        }

        selectIndex += 1;
    }

    return { data: [], error: lastError };
}

function computeGestaoPerformanceStatusExitByMonth(
    historyRows,
    timelineByProjectId,
    projects,
    statusById
) {
    const projectsById = Object.fromEntries(
        (projects || [])
            .map(project => [Number(project.id), project])
            .filter(([projectId]) => projectId)
    );
    const firstExitByKey = new Map();
    const hasPreviousStatus = (historyRows || []).some(
        row => row.previousStatusId || row.previousStatus
    );

    const sortedRows = [...(historyRows || [])].sort((left, right) => {
        const leftTime = new Date(left.changedAt).getTime();
        const rightTime = new Date(right.changedAt).getTime();
        if (leftTime !== rightTime) return leftTime - rightTime;
        return Number(left.id || 0) - Number(right.id || 0);
    });

    const registerStatusExit = (referenceId, metric, exitAt) => {
        if (!referenceId || !(exitAt instanceof Date) || Number.isNaN(exitAt.getTime())) return;

        const exitKey = `${referenceId}\0${metric.id}`;
        if (firstExitByKey.has(exitKey)) return;

        firstExitByKey.set(exitKey, { referenceId, exitAt });
    };

    if (hasPreviousStatus) {
        sortedRows.forEach(row => {
            const projectId = Number(row.orderProjectId);
            if (!projectId) return;

            const project = projectsById[projectId];
            const referenceProject = project
                ? getGestaoPerformanceReferenceProject(project, projectsById)
                : { id: projectId };
            const referenceId = Number(referenceProject.id);
            if (!referenceId) return;

            const previousStatusName = getGestaoPerformanceHistoryStatusName(
                row,
                'previousStatus',
                statusById
            );
            if (!previousStatusName) return;

            const changedAt = new Date(row.changedAt);
            if (Number.isNaN(changedAt.getTime())) return;

            GESTAO_PERFORMANCE_STATUS_EXIT_METRICS.forEach(metric => {
                if (!isGestaoPerformanceStatusNameMatch(previousStatusName, metric.statusNames)) return;
                registerStatusExit(referenceId, metric, changedAt);
            });
        });
    } else {
        const seenReferenceIds = new Set();

        (projects || []).forEach(project => {
            const referenceProject = getGestaoPerformanceReferenceProject(project, projectsById);
            const referenceId = Number(referenceProject.id);
            if (!referenceId || seenReferenceIds.has(referenceId)) return;

            seenReferenceIds.add(referenceId);
            const timeline = getGestaoPerformanceProjectTimeline(
                referenceProject,
                timelineByProjectId,
                projectsById
            );

            GESTAO_PERFORMANCE_STATUS_EXIT_METRICS.forEach(metric => {
                const exitAt = findGestaoPerformanceStatusExitAt(timeline, metric.statusNames);
                registerStatusExit(referenceId, metric, exitAt);
            });
        });
    }

    const monthKeySet = new Set();
    firstExitByKey.forEach(entry => {
        const monthKey = getGestaoPerformanceMonthKey(entry.exitAt);
        if (monthKey) monthKeySet.add(monthKey);
    });

    const sortedMonthKeys = [...monthKeySet].sort();
    const monthKeys = sortedMonthKeys.length
        ? buildGestaoPerformanceMonthKeysBetween(
            sortedMonthKeys[0],
            sortedMonthKeys[sortedMonthKeys.length - 1]
        )
        : [];
    const countsByMetric = Object.fromEntries(
        GESTAO_PERFORMANCE_STATUS_EXIT_METRICS.map(metric => [
            metric.id,
            Object.fromEntries(monthKeys.map(monthKey => [monthKey, 0]))
        ])
    );

    const projectsByMetricAndMonth = Object.fromEntries(
        GESTAO_PERFORMANCE_STATUS_EXIT_METRICS.map(metric => [
            metric.id,
            Object.fromEntries(monthKeys.map(monthKey => [monthKey, []]))
        ])
    );

    firstExitByKey.forEach((entry, exitKey) => {
        const metricId = exitKey.split('\0')[1];
        const monthKey = getGestaoPerformanceMonthKey(entry.exitAt);
        if (!metricId || !monthKey || !countsByMetric[metricId]) return;

        countsByMetric[metricId][monthKey] += 1;

        const project = projectsById[entry.referenceId];
        if (!project || !projectsByMetricAndMonth[metricId]?.[monthKey]) return;

        projectsByMetricAndMonth[metricId][monthKey].push({
            project,
            exitAt: entry.exitAt
        });
    });

    const maxCount = Math.max(
        0,
        ...GESTAO_PERFORMANCE_STATUS_EXIT_METRICS.flatMap(metric =>
            monthKeys.map(monthKey => countsByMetric[metric.id][monthKey] || 0)
        )
    );

    const metrics = GESTAO_PERFORMANCE_STATUS_EXIT_METRICS.map((metric, index) => ({
        ...metric,
        color: GESTAO_PERFORMANCE_BAR_COLORS[index % GESTAO_PERFORMANCE_BAR_COLORS.length],
        countsByMonth: countsByMetric[metric.id],
        projectsByMonth: Object.fromEntries(
            monthKeys.map(monthKey => [
                monthKey,
                sortGestaoPerformanceStatusExitProjectEntries(
                    projectsByMetricAndMonth[metric.id]?.[monthKey] || []
                )
            ])
        )
    }));

    return {
        monthKeys,
        metrics,
        maxCount
    };
}

function computeGestaoPerformanceProductionMetrics(
    timelineByProjectId,
    projects,
    statusById,
    statuses
) {
    const counts = Object.fromEntries(
        GESTAO_PERFORMANCE_PRODUCTION_METRICS.map(metric => [metric.id, 0])
    );
    const projectsByMetric = Object.fromEntries(
        GESTAO_PERFORMANCE_PRODUCTION_METRICS.map(metric => [metric.id, []])
    );
    const projectsById = Object.fromEntries(
        (projects || [])
            .map(project => [Number(project.id), project])
            .filter(([projectId]) => projectId)
    );

    (projects || []).forEach(project => {
        const projectId = Number(project.id);
        if (!projectId || !shouldCountGestaoPerformanceProductionProject(project)) return;

        GESTAO_PERFORMANCE_PRODUCTION_METRICS.forEach(metric => {
            if (!matchesGestaoPerformanceProductionMetric(
                project,
                metric,
                statusById,
                statuses,
                projectsById
            )) {
                return;
            }

            counts[metric.id] += 1;
            projectsByMetric[metric.id].push(project);
        });
    });

    return GESTAO_PERFORMANCE_PRODUCTION_METRICS.map(metric => ({
        ...metric,
        count: counts[metric.id] || 0,
        projects: sortGestaoPerformanceProjectsForList(projectsByMetric[metric.id], statusById),
        description: buildGestaoPerformanceProductionMetricDescription(metric)
    }));
}

async function fetchGestaoPerformanceHistoryRows() {
    const pageSize = 1000;
    const selectVariants = [
        `
            id, orderProjectId, previousStatusId, newStatusId, changedAt,
            newStatus:OrderProjectStatus!newStatusId(id, name),
            previousStatus:OrderProjectStatus!previousStatusId(id, name)
        `,
        'id, orderProjectId, previousStatusId, newStatusId, changedAt',
        `
            id, orderProjectId, newStatusId, changedAt,
            newStatus:OrderProjectStatus!newStatusId(id, name)
        `,
        'id, orderProjectId, newStatusId, changedAt'
    ];
    let lastError = null;

    for (const selectQuery of selectVariants) {
        const rows = [];
        let from = 0;
        let failed = false;

        while (true) {
            const { data, error } = await supabaseClient
                .from('OrderProjectStatusHistory')
                .select(selectQuery)
                .order('changedAt', { ascending: true })
                .order('id', { ascending: true })
                .range(from, from + pageSize - 1);

            if (error) {
                lastError = error;
                failed = true;
                break;
            }

            rows.push(...(data || []));
            if (!data || data.length < pageSize) break;
            from += pageSize;
        }

        if (failed) {
            if (!/relationship|embed|schema cache|previousStatus/i.test(lastError?.message || '')) {
                return { data: [], error: lastError };
            }
            continue;
        }

        const needsEnrich = rows.some(row =>
            (row.newStatusId && !row.newStatus)
            || (row.previousStatusId && !row.previousStatus)
        );

        if (!needsEnrich) return { data: rows, error: null };

        const statuses = typeof loadGestaoProjectStatuses === 'function'
            ? await loadGestaoProjectStatuses(true)
            : [];
        const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));

        return {
            data: rows.map(row => ({
                ...row,
                newStatus: row.newStatus || statusById[row.newStatusId] || null,
                previousStatus: row.previousStatus || statusById[row.previousStatusId] || null
            })),
            error: null
        };
    }

    return { data: [], error: lastError };
}

function renderGestaoPerformanceMetricLabel(metric) {
    const description = metric.description || `Tempo médio entre ${metric.startStatuses.join(' / ')} e ${metric.endStatuses.join(' ou ')}.`;

    return `
        <span class="gestao-performance-bar-label-text">${escapeHtml(metric.label)}</span>
        <span class="gestao-performance-help" tabindex="0" role="button" aria-label="Saiba mais sobre ${escapeHtml(metric.label)}">
            <span class="gestao-performance-help-icon" aria-hidden="true">?</span>
            <span class="gestao-performance-help-tooltip" role="tooltip">${escapeHtml(description)}</span>
        </span>
    `;
}

function renderGestaoPerformanceProjectList(
    metric,
    statusById = {},
    statuses = [],
    timelineByProjectId = {},
    projectsById = {}
) {
    const projects = metric.projects || [];
    if (!projects.length) return '';

    const items = projects.map(project =>
        renderGestaoPerformanceProjectListItem(
            project,
            metric,
            statusById,
            statuses,
            timelineByProjectId,
            projectsById
        )
    ).join('');
    const totalLabel = formatGestaoPerformanceSaleValue(
        sumGestaoPerformanceProjectsSaleValue(projects, projectsById)
    );

    return `
        <details class="gestao-performance-project-list">
            <summary class="gestao-performance-project-list__summary">
                Ver projetos (${projects.length})
            </summary>
            <ul class="gestao-performance-project-list__items">${items}</ul>
            <p class="gestao-performance-project-list__total">Total: ${escapeHtml(totalLabel)}</p>
        </details>
    `;
}

function renderGestaoPerformanceStatusExitProjectListItem(projectEntry) {
    const project = projectEntry?.project;
    const orderCode = project?.order?.orderCode || '—';
    const clientName = typeof getOrderClientName === 'function'
        ? getOrderClientName(project.order)
        : (project?.order?.client?.name || '—');
    const projectName = project?.name || '—';
    const exitDateLabel = formatGestaoPerformanceEntryDate(projectEntry?.exitAt);
    const projectId = Number(project?.id);

    return `
        <li class="gestao-performance-project-list__item">
            <span class="gestao-performance-project-list__text">
                ${escapeHtml(orderCode)} - ${escapeHtml(clientName)} - ${escapeHtml(projectName)} - ${escapeHtml(exitDateLabel)}
            </span>
            <button type="button"
                class="gestao-performance-history-btn shrink-0 text-[10px] bg-white border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-md font-medium hover:bg-indigo-50"
                data-order-project-id="${projectId}">
                Histórico
            </button>
        </li>
    `;
}

function renderGestaoPerformanceStatusExitProjectLists(monthKeys, metrics) {
    const monthBlocks = [...(monthKeys || [])].reverse().map(monthKey => {
        const statusBlocks = (metrics || []).map(metric => {
            const projects = metric.projectsByMonth?.[monthKey] || [];
            if (!projects.length) return '';

            const items = projects
                .map(projectEntry => renderGestaoPerformanceStatusExitProjectListItem(projectEntry))
                .join('');

            return `
                <details class="gestao-performance-project-list gestao-performance-exit-project-list">
                    <summary class="gestao-performance-project-list__summary">
                        <span class="gestao-performance-exit-table__swatch" style="background:${metric.color};"></span>
                        ${escapeHtml(metric.label)} (${projects.length})
                    </summary>
                    <ul class="gestao-performance-project-list__items">${items}</ul>
                </details>
            `;
        }).filter(Boolean).join('');

        if (!statusBlocks) return '';

        return `
            <details class="gestao-performance-exit-month-group">
                <summary class="gestao-performance-exit-month-group__summary">
                    ${escapeHtml(formatGestaoPerformanceMonthLabel(monthKey))}
                </summary>
                <div class="gestao-performance-exit-month-group__statuses">
                    ${statusBlocks}
                </div>
            </details>
        `;
    }).filter(Boolean).join('');

    if (!monthBlocks) return '';

    return `
        <div class="gestao-performance-exit-project-lists">
            ${monthBlocks}
        </div>
    `;
}

function renderGestaoPerformanceStatusExitMonthlyChart(statusExitByMonth, emptyMessage) {
    const { monthKeys, metrics, maxCount } = statusExitByMonth || {};

    if (!monthKeys?.length || !metrics?.length) {
        return `<p class="text-xs text-slate-400 text-center py-8">${escapeHtml(emptyMessage)}</p>`;
    }

    const hasData = metrics.some(metric =>
        monthKeys.some(monthKey => (metric.countsByMonth?.[monthKey] || 0) > 0)
    );

    if (!hasData) {
        return `<p class="text-xs text-slate-400 text-center py-8">${escapeHtml(emptyMessage)}</p>`;
    }

    const columns = monthKeys.map(monthKey => {
        const bars = metrics.map(metric => {
            const count = metric.countsByMonth?.[monthKey] || 0;
            const heightPct = maxCount > 0 && count > 0
                ? Math.max(8, (count / maxCount) * 100)
                : 0;

            return `
                <div class="gestao-performance-exit-bar"
                    style="height:${heightPct.toFixed(2)}%; background:${metric.color};"
                    title="${escapeHtml(metric.label)}: ${count}">
                </div>
            `;
        }).join('');

        return `
            <div class="gestao-performance-exit-month">
                <div class="gestao-performance-exit-month-bars">${bars}</div>
                <p class="gestao-performance-exit-month-label">${escapeHtml(formatGestaoPerformanceMonthLabel(monthKey))}</p>
            </div>
        `;
    }).join('');

    const tableRows = monthKeys.map(monthKey => {
        const cells = metrics.map(metric => {
            const count = metric.countsByMonth?.[monthKey] || 0;
            return `<td class="gestao-performance-exit-table__value">${count > 0 ? escapeHtml(String(count)) : '—'}</td>`;
        }).join('');

        return `
            <tr>
                <th scope="row" class="gestao-performance-exit-table__month">${escapeHtml(formatGestaoPerformanceMonthLabel(monthKey))}</th>
                ${cells}
            </tr>
        `;
    }).join('');

    const tableHeaders = metrics.map(metric => `
        <th scope="col" class="gestao-performance-exit-table__metric">
            <span class="gestao-performance-exit-table__swatch" style="background:${metric.color};"></span>
            ${escapeHtml(metric.label)}
        </th>
    `).join('');

    const legend = metrics.map(metric => `
        <li>
            <span class="gestao-performance-exit-legend__swatch" style="background:${metric.color};"></span>
            <span>${renderGestaoPerformanceMetricLabel(metric)}</span>
        </li>
    `).join('');

    return `
        <div class="gestao-performance-exit-chart-wrap">
            <div class="gestao-performance-exit-chart" style="--gestao-performance-exit-month-count:${monthKeys.length};">
                ${columns}
            </div>
            <ul class="gestao-performance-exit-legend">${legend}</ul>
            <div class="gestao-performance-exit-table-wrap">
                <table class="gestao-performance-exit-table">
                    <thead>
                        <tr>
                            <th scope="col">Mês</th>
                            ${tableHeaders}
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
            ${renderGestaoPerformanceStatusExitProjectLists(monthKeys, metrics)}
        </div>
    `;
}

function renderGestaoPerformanceCountBarChart(
    metrics,
    emptyMessage,
    statusById = {},
    statuses = [],
    timelineByProjectId = {},
    projectsById = {}
) {
    const maxCount = Math.max(...metrics.map(metric => metric.count || 0), 0);

    if (!maxCount) {
        return `<p class="text-xs text-slate-400 text-center py-8">${escapeHtml(emptyMessage)}</p>`;
    }

    const rows = metrics.map((metric, index) => {
        const count = metric.count || 0;
        const widthPct = maxCount > 0 && count > 0
            ? Math.max(6, (count / maxCount) * 100)
            : 0;
        const color = GESTAO_PERFORMANCE_BAR_COLORS[index % GESTAO_PERFORMANCE_BAR_COLORS.length];

        return `
            <div class="gestao-performance-count-block">
                <div class="gestao-performance-bar-row">
                    <div class="gestao-performance-bar-meta">
                        <p class="gestao-performance-bar-label">${renderGestaoPerformanceMetricLabel(metric)}</p>
                    </div>
                    <div class="gestao-performance-bar-track" aria-hidden="true">
                        <div class="gestao-performance-bar-fill"
                            style="width:${widthPct.toFixed(2)}%; background:${color};"></div>
                    </div>
                    <p class="gestao-performance-bar-value">${escapeHtml(String(count))}</p>
                </div>
                ${renderGestaoPerformanceProjectList(metric, statusById, statuses, timelineByProjectId, projectsById)}
            </div>
        `;
    }).join('');

    return `<div class="gestao-performance-bar-chart space-y-4">${rows}</div>`;
}

function renderGestaoPerformanceBarChart(metrics, emptyMessage) {
    const validMetrics = metrics.filter(metric => metric.averageSeconds != null);
    const maxDays = validMetrics.length
        ? Math.max(...validMetrics.map(metric => formatGestaoPerformanceDaysValue(metric.averageSeconds)))
        : 0;

    if (!validMetrics.length) {
        return `<p class="text-xs text-slate-400 text-center py-8">${escapeHtml(emptyMessage)}</p>`;
    }

    const rows = metrics.map((metric, index) => {
        const days = formatGestaoPerformanceDaysValue(metric.averageSeconds);
        const widthPct = days != null && maxDays > 0
            ? Math.max(6, (days / maxDays) * 100)
            : 0;
        const color = GESTAO_PERFORMANCE_BAR_COLORS[index % GESTAO_PERFORMANCE_BAR_COLORS.length];
        const valueLabel = metric.averageSeconds != null
            ? formatGestaoPerformanceDuration(metric.averageSeconds)
            : 'Sem dados';
        const sampleLabel = metric.sampleCount
            ? `${metric.sampleCount} projeto${metric.sampleCount === 1 ? '' : 's'}`
            : '0 projetos';

        return `
            <div class="gestao-performance-bar-row">
                <div class="gestao-performance-bar-meta">
                    <p class="gestao-performance-bar-label">${renderGestaoPerformanceMetricLabel(metric)}</p>
                    <p class="gestao-performance-bar-sample">${escapeHtml(sampleLabel)}</p>
                </div>
                <div class="gestao-performance-bar-track" aria-hidden="true">
                    <div class="gestao-performance-bar-fill"
                        style="width:${widthPct.toFixed(2)}%; background:${color};"></div>
                </div>
                <p class="gestao-performance-bar-value">${escapeHtml(valueLabel)}</p>
            </div>
        `;
    }).join('');

    return `<div class="gestao-performance-bar-chart space-y-4">${rows}</div>`;
}

function renderGestaoPerformancePanel(
    summaryMetrics,
    areaMetrics,
    productionMetrics,
    statusExitByMonth,
    lookbackDays,
    monthBounds,
    statusById = {},
    statuses = [],
    timelineByProjectId = {},
    projectsById = {}
) {
    const content = document.getElementById('gestao-performance-content');
    if (!content) return;

    content.innerHTML = `
        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h4 class="text-sm font-bold text-slate-900">Indicadores gerais</h4>
                <p class="text-xs text-slate-400 mt-0.5">Tempo médio considerando transições concluídas nos últimos ${lookbackDays} dias.</p>
            </div>
            <div class="p-4">
                ${renderGestaoPerformanceBarChart(
                    summaryMetrics,
                    'Nenhum projeto concluiu estas etapas no período selecionado.'
                )}
            </div>
        </section>

        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h4 class="text-sm font-bold text-slate-900">Performance por área</h4>
                <p class="text-xs text-slate-400 mt-0.5">Média por etapa do fluxo comercial e técnico no mesmo período.</p>
            </div>
            <div class="p-4">
                ${renderGestaoPerformanceBarChart(
                    areaMetrics,
                    'Nenhum projeto concluiu estas etapas no período selecionado.'
                )}
            </div>
        </section>

        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h4 class="text-sm font-bold text-slate-900">Saídas por status</h4>
                <p class="text-xs text-slate-400 mt-0.5">Quantidade de projetos que saíram de cada etapa por mês, com base em todo o histórico de status. Complementares usam o histórico do projeto pai.</p>
            </div>
            <div class="p-4">
                ${renderGestaoPerformanceStatusExitMonthlyChart(
                    statusExitByMonth,
                    'Nenhuma saída de status encontrada no período selecionado.'
                )}
            </div>
        </section>

        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h4 class="text-sm font-bold text-slate-900">Caminho até a produção</h4>
                <p class="text-xs text-slate-400 mt-0.5">Quantidade de projetos por etapa conforme o status atual (sortOrder). Complementares usam o status e as datas do projeto pai; valores de complementares e substituições são somados ao projeto principal.</p>
            </div>
            <div class="p-4">
                ${renderGestaoPerformanceCountBarChart(
                    productionMetrics,
                    'Nenhum projeto encontrado para estes critérios no mês corrente.',
                    statusById,
                    statuses,
                    timelineByProjectId,
                    projectsById
                )}
            </div>
        </section>
    `;
}

async function loadGestaoPerformance() {
    const content = document.getElementById('gestao-performance-content');
    if (!content) return;

    if (!canAccessGestao()) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Sem permissão para visualizar performance.</p>';
        return;
    }

    const lookbackDays = getGestaoPerformanceDaysInput();
    content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando performance...</p>';

    const [{ data: historyRows, error }, { data: projects, error: projectsError }] = await Promise.all([
        fetchGestaoPerformanceHistoryRows(),
        fetchGestaoPerformanceProjects()
    ]);

    if (error) {
        content.innerHTML = `<p class="text-xs text-red-500 text-center py-10">Erro ao carregar performance: ${escapeHtml(error.message)}</p>`;
        return;
    }

    if (projectsError) {
        content.innerHTML = `<p class="text-xs text-red-500 text-center py-10">Erro ao carregar projetos: ${escapeHtml(projectsError.message)}</p>`;
        return;
    }

    const statuses = typeof loadGestaoProjectStatuses === 'function'
        ? await loadGestaoProjectStatuses(true)
        : [];
    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
    const cutoffDate = getGestaoPerformanceCutoffDate(lookbackDays);
    const monthBounds = getGestaoPerformanceCurrentMonthBounds();
    const timelineByProjectId = buildGestaoPerformanceTimeline(historyRows, statusById);

    const summaryMetrics = GESTAO_PERFORMANCE_SUMMARY_METRICS.map(metric =>
        computeGestaoPerformanceMetric(timelineByProjectId, metric, cutoffDate)
    );
    const areaMetrics = GESTAO_PERFORMANCE_AREA_METRICS.map(metric =>
        computeGestaoPerformanceMetric(timelineByProjectId, metric, cutoffDate)
    );
    let enrichedProjects = enrichGestaoPerformanceProjects(projects, statusById);
    if (typeof enrichGestaoRelatorioProjectsWithSubstituicaoValues === 'function') {
        enrichedProjects = await enrichGestaoRelatorioProjectsWithSubstituicaoValues(enrichedProjects);
    }
    gestaoPerformanceProjectsById = Object.fromEntries(
        enrichedProjects
            .map(project => [Number(project.id), project])
            .filter(([projectId]) => projectId)
    );
    const productionMetrics = computeGestaoPerformanceProductionMetrics(
        timelineByProjectId,
        enrichedProjects,
        statusById,
        statuses
    );
    const statusExitByMonth = computeGestaoPerformanceStatusExitByMonth(
        historyRows,
        timelineByProjectId,
        enrichedProjects,
        statusById
    );

    renderGestaoPerformancePanel(
        summaryMetrics,
        areaMetrics,
        productionMetrics,
        statusExitByMonth,
        lookbackDays,
        monthBounds,
        statusById,
        statuses,
        timelineByProjectId,
        gestaoPerformanceProjectsById
    );
}

function openGestaoPerformanceProjectStatusHistory(orderProjectId) {
    const project = gestaoPerformanceProjectsById[Number(orderProjectId)];
    const context = typeof buildProjectStatusHistoryContext === 'function' && project
        ? buildProjectStatusHistoryContext(project)
        : {
            orderProjectId: Number(orderProjectId),
            projectLabel: project?.name || 'Projeto',
            orderCode: project?.order?.orderCode || '—',
            clientName: typeof getOrderClientName === 'function'
                ? getOrderClientName(project?.order)
                : (project?.order?.client?.name || '—')
        };

    if (!context?.orderProjectId) return;

    if (typeof openProjectStatusHistoryModal === 'function') {
        openProjectStatusHistoryModal(context);
        return;
    }

    if (typeof openGestaoProjectStatusHistory === 'function') {
        openGestaoProjectStatusHistory(context);
    }
}

function bindGestaoPerformanceEvents() {
    document.getElementById('btn-gestao-performance-refresh')?.addEventListener('click', loadGestaoPerformance);
    document.getElementById('gestao-performance-days')?.addEventListener('change', loadGestaoPerformance);
    document.getElementById('gestao-performance-filter-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        loadGestaoPerformance();
    });
    document.getElementById('gestao-performance-content')?.addEventListener('click', (event) => {
        const button = event.target.closest('.gestao-performance-history-btn');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        openGestaoPerformanceProjectStatusHistory(button.dataset.orderProjectId);
    });
}
