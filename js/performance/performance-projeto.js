const PERFORMANCE_PROJETO_DEFAULT_WEEKS = 8;

let performanceProjetoProjectsById = {};

const PERFORMANCE_PROJETO_EXIT_METRICS = [
    {
        id: 'entrega-projetos',
        label: 'Entrega de Projetos',
        statusNames: ['Projeto Técnico'],
        countMode: 'projects',
        description: 'Projetos que saíram de Projeto Técnico (primeira saída do status). O projeto agrupador não entra; ambientes vinculados e projetos avulsos sim.'
    },
    {
        id: 'revisoes',
        label: 'Revisões',
        statusNames: [ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ],
        countMode: 'revision-activities',
        description: 'Cada saída de Em Revisão Comercial Proj. conta uma revisão (o mesmo projeto pode aparecer em semanas diferentes). Ambientes vinculados a um agrupador não entram; a métrica usa o projeto agrupador. Entre parênteses na tabela, soma das atividades; na lista, o número da revisão técnica comercial.'
    },
    {
        id: 'lancamentos',
        label: 'Lançamentos',
        statusNames: ['Implantação'],
        countMode: 'projects',
        description: 'Projetos que saíram de Implantação (primeira saída do status). O projeto agrupador não entra; ambientes vinculados e projetos avulsos sim.'
    }
];

function getPerformanceProjetoShared() {
    return window.gestaoPerformanceShared || null;
}

function isPerformanceProjetoComplementaryProject(project) {
    if (!project) return false;
    if (typeof isComplementaryOrderProject === 'function') {
        return isComplementaryOrderProject(project);
    }
    return project.isComplementary === true;
}

function isPerformanceProjetoGroupedChildProject(project) {
    return typeof isOrderProjectGroupedChild === 'function' && isOrderProjectGroupedChild(project);
}

function isPerformanceProjetoAggregatorProject(project) {
    return typeof isOrderProjectAggregator === 'function' && isOrderProjectAggregator(project);
}

/** Projetos para lookup (inclui agrupador; exclui complementares). */
function buildPerformanceProjetoProjectsById(rawProjects, statusById) {
    return Object.fromEntries(
        (rawProjects || [])
            .filter(project => !isPerformanceProjetoComplementaryProject(project))
            .map(project => {
                const id = Number(project.id);
                if (!id) return null;
                return [id, {
                    ...project,
                    projectStatus: project.projectStatus || statusById?.[project.statusId] || null
                }];
            })
            .filter(Boolean)
    );
}

/** Métricas de entrega/lançamento: mesma visibilidade da gestão (sem agrupador). */
function filterPerformanceProjetoStandardMetricProjects(projectsById) {
    return Object.values(projectsById || {}).filter(
        project => !isPerformanceProjetoAggregatorProject(project)
    );
}

/** IDs de OrderProject onde buscar Revision (agrupador + ambientes vinculados). */
function collectPerformanceProjetoRevisionOrderProjectIds(referenceProjectId, projectsById = {}) {
    const normalizedId = Number(referenceProjectId);
    if (!normalizedId) return [];

    const ids = new Set([normalizedId]);
    Object.values(projectsById || {}).forEach(project => {
        if (Number(project?.aggregatorOrderProjectId) === normalizedId) {
            ids.add(Number(project.id));
        }
    });
    return [...ids].filter(Boolean);
}

function getPerformanceProjetoWeeksInput() {
    const input = document.getElementById('performance-projeto-weeks');
    const value = Number(input?.value);
    if (!Number.isFinite(value) || value < 1) return PERFORMANCE_PROJETO_DEFAULT_WEEKS;
    return Math.min(Math.floor(value), 52);
}

function startOfPerformanceWeek(date) {
    const cursor = new Date(date);
    cursor.setHours(0, 0, 0, 0);
    const weekday = cursor.getDay();
    const diff = weekday === 0 ? -6 : 1 - weekday;
    cursor.setDate(cursor.getDate() + diff);
    return cursor;
}

function getPerformanceWeekKey(date) {
    const shared = getPerformanceProjetoShared();
    const start = startOfPerformanceWeek(date);
    if (shared?.gestaoPerformanceDateToLocalIso) {
        return shared.gestaoPerformanceDateToLocalIso(start);
    }
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, '0');
    const day = String(start.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parsePerformanceWeekKey(weekKey) {
    const [year, month, day] = String(weekKey || '').split('-').map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
}

function buildPerformanceWeekKeysBetween(startWeekKey, endWeekKey) {
    const start = parsePerformanceWeekKey(startWeekKey);
    const end = parsePerformanceWeekKey(endWeekKey);
    if (!start || !end || start > end) return [];

    const keys = [];
    const cursor = new Date(start);
    while (cursor <= end) {
        keys.push(getPerformanceWeekKey(cursor));
        cursor.setDate(cursor.getDate() + 7);
    }
    return keys;
}

function buildPerformanceWeekKeysLookback(weeksBack) {
    const end = startOfPerformanceWeek(new Date());
    const start = new Date(end);
    start.setDate(start.getDate() - (Math.max(1, weeksBack) - 1) * 7);
    return buildPerformanceWeekKeysBetween(getPerformanceWeekKey(start), getPerformanceWeekKey(end));
}

function formatPerformanceWeekLabel(weekKey) {
    const start = parsePerformanceWeekKey(weekKey);
    if (!start) return weekKey || '—';
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}`;
    };
    return `${fmt(start)}–${fmt(end)}`;
}

async function fetchCommercialRevisionActivityContext() {
    const revisionsByProjectId = {};
    const countByRevisionId = {};

    const pageSize = 1000;
    let from = 0;
    let revisions = [];

    while (true) {
        const { data, error } = await supabaseClient
            .from('Revision')
            .select('id, orderProjectId, revisionStartedAt, revisionCompletedAt, createdAt')
            .eq('revisionType', REVISION_TYPE_COMMERCIAL_TECHNICAL)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        revisions.push(...(data || []));
        if (!data || data.length < pageSize) break;
        from += pageSize;
    }

    revisions.forEach(revision => {
        const projectId = Number(revision.orderProjectId);
        if (!projectId) return;
        if (!revisionsByProjectId[projectId]) revisionsByProjectId[projectId] = [];
        revisionsByProjectId[projectId].push(revision);
    });

    Object.values(revisionsByProjectId).forEach(list => {
        list.sort((left, right) => {
            const leftTime = new Date(left.revisionStartedAt || 0).getTime();
            const rightTime = new Date(right.revisionStartedAt || 0).getTime();
            return rightTime - leftTime;
        });
    });

    const revisionIds = revisions.map(row => row.id).filter(Boolean);

    for (let offset = 0; offset < revisionIds.length; offset += pageSize) {
        const batch = revisionIds.slice(offset, offset + pageSize);
        if (!batch.length) break;

        const { data, error } = await supabaseClient
            .from('RevisionActivity')
            .select('id, revisionId')
            .in('revisionId', batch);

        if (error) throw error;
        (data || []).forEach(row => {
            const revisionId = row.revisionId;
            countByRevisionId[revisionId] = (countByRevisionId[revisionId] || 0) + 1;
        });
    }

    const revisionNumberById = buildCommercialRevisionNumberById(revisionsByProjectId);

    return { revisionsByProjectId, countByRevisionId, revisionNumberById };
}

function buildCommercialRevisionNumberById(revisionsByProjectId) {
    const revisionNumberById = {};

    Object.values(revisionsByProjectId || {}).forEach(list => {
        const sorted = [...list].sort((left, right) => {
            const leftTime = new Date(left.createdAt || left.revisionStartedAt || 0).getTime();
            const rightTime = new Date(right.createdAt || right.revisionStartedAt || 0).getTime();
            if (leftTime !== rightTime) return leftTime - rightTime;
            return Number(left.id || 0) - Number(right.id || 0);
        });

        sorted.forEach((revision, index) => {
            revisionNumberById[revision.id] = index + 1;
        });
    });

    return revisionNumberById;
}

/** Numeração 1..n por agrupador (união das revisões do pai e dos filhos). */
function buildPerformanceProjetoRevisionNumberById(revisionsByProjectId, projectsById) {
    const revisionNumberById = buildCommercialRevisionNumberById(revisionsByProjectId);

    Object.values(projectsById || {}).forEach(project => {
        if (!isPerformanceProjetoAggregatorProject(project)) return;

        const lookupIds = collectPerformanceProjetoRevisionOrderProjectIds(project.id, projectsById);
        const merged = [];
        const seenRevisionIds = new Set();

        lookupIds.forEach(projectId => {
            (revisionsByProjectId[projectId] || []).forEach(revision => {
                if (!revision?.id || seenRevisionIds.has(revision.id)) return;
                seenRevisionIds.add(revision.id);
                merged.push(revision);
            });
        });

        merged.sort((left, right) => {
            const leftTime = new Date(left.createdAt || left.revisionStartedAt || 0).getTime();
            const rightTime = new Date(right.createdAt || right.revisionStartedAt || 0).getTime();
            if (leftTime !== rightTime) return leftTime - rightTime;
            return Number(left.id || 0) - Number(right.id || 0);
        });

        merged.forEach((revision, index) => {
            revisionNumberById[revision.id] = index + 1;
        });
    });

    return revisionNumberById;
}

function collapsePerformanceProjetoRevisionAssignments(assigned) {
    const byRevisionId = new Map();

    (assigned || []).forEach(entry => {
        const revisionId = entry.revision?.id;
        if (!revisionId) return;

        if (!byRevisionId.has(revisionId)) {
            byRevisionId.set(revisionId, entry);
            return;
        }

        const existing = byRevisionId.get(revisionId);
        const existingActivities = existing.activityCount || 0;
        const nextActivities = entry.activityCount || 0;

        if (nextActivities > existingActivities) {
            byRevisionId.set(revisionId, entry);
            return;
        }

        if (
            nextActivities === existingActivities
            && entry.exitAt instanceof Date
            && existing.exitAt instanceof Date
            && entry.exitAt.getTime() < existing.exitAt.getTime()
        ) {
            byRevisionId.set(revisionId, entry);
        }
    });

    return [...byRevisionId.values()].sort((left, right) => {
        const leftTime = left.exitAt instanceof Date ? left.exitAt.getTime() : 0;
        const rightTime = right.exitAt instanceof Date ? right.exitAt.getTime() : 0;
        return leftTime - rightTime;
    });
}

function findAllPerformanceStatusExitsAt(timeline, statusNames, shared) {
    if (!timeline?.length || !shared) return [];

    const { isGestaoPerformanceStatusNameMatch } = shared;
    const exits = [];

    for (let index = 0; index < timeline.length; index += 1) {
        if (!isGestaoPerformanceStatusNameMatch(timeline[index].statusName, statusNames)) continue;

        const nextEntry = timeline[index + 1];
        const exitAt = nextEntry?.changedAt;
        if (exitAt instanceof Date && !Number.isNaN(exitAt.getTime())) {
            exits.push(exitAt);
        }
    }

    return exits;
}

function pickCommercialRevisionForProjectExit(
    revisionsByProjectId,
    projectId,
    exitAt,
    usedRevisionIds,
    projectsById = null
) {
    const exitTime = exitAt instanceof Date ? exitAt.getTime() : NaN;
    if (!Number.isFinite(exitTime)) return null;

    const lookupProjectIds = projectsById
        ? collectPerformanceProjetoRevisionOrderProjectIds(projectId, projectsById)
        : [Number(projectId)];

    const seenRevisionIds = new Set();
    const mergedRevisions = [];
    lookupProjectIds.forEach(lookupId => {
        (revisionsByProjectId[lookupId] || []).forEach(revision => {
            if (!revision?.id || seenRevisionIds.has(revision.id)) return;
            seenRevisionIds.add(revision.id);
            mergedRevisions.push(revision);
        });
    });

    const candidates = mergedRevisions
        .filter(revision => {
            if (usedRevisionIds.has(revision.id)) return false;
            const startedAt = revision.revisionStartedAt
                ? new Date(revision.revisionStartedAt).getTime()
                : NaN;
            return Number.isFinite(startedAt) && startedAt <= exitTime;
        })
        .sort((left, right) => {
            const leftStarted = new Date(left.revisionStartedAt).getTime();
            const rightStarted = new Date(right.revisionStartedAt).getTime();
            return rightStarted - leftStarted;
        });

    if (!candidates.length) return null;

    const completedBeforeExit = candidates.find(revision => {
        if (!revision.revisionCompletedAt) return true;
        return new Date(revision.revisionCompletedAt).getTime() <= exitTime + 60_000;
    });

    return completedBeforeExit || candidates[0];
}

function assignCommercialRevisionsToExits(revisionExits, revisionContext, projectsById = null) {
    const { revisionsByProjectId, countByRevisionId, revisionNumberById } = revisionContext || {};
    const exitsByProjectId = new Map();

    (revisionExits || []).forEach(exit => {
        const projectId = Number(exit.referenceId);
        if (!projectId) return;
        if (!exitsByProjectId.has(projectId)) exitsByProjectId.set(projectId, []);
        exitsByProjectId.get(projectId).push(exit);
    });

    const assigned = [];

    exitsByProjectId.forEach((exits, projectId) => {
        const usedRevisionIds = new Set();
        const sortedExits = [...exits].sort(
            (left, right) => left.exitAt.getTime() - right.exitAt.getTime()
        );

        sortedExits.forEach(exit => {
            const revision = pickCommercialRevisionForProjectExit(
                revisionsByProjectId,
                projectId,
                exit.exitAt,
                usedRevisionIds,
                projectsById
            );
            if (revision?.id) usedRevisionIds.add(revision.id);

            assigned.push({
                referenceId: projectId,
                exitAt: exit.exitAt,
                revision,
                revisionNumber: revision ? (revisionNumberById?.[revision.id] || null) : null,
                activityCount: revision ? (countByRevisionId?.[revision.id] || 0) : 0
            });
        });
    });

    return assigned;
}

function computePerformanceProjetoExitsByWeek(
    historyRows,
    timelineByProjectId,
    projectsById,
    statusById,
    revisionContext,
    weekKeys
) {
    const shared = getPerformanceProjetoShared();
    if (!shared) {
        return { weekKeys: [], metrics: [], maxCount: 0 };
    }

    const {
        getGestaoPerformanceHistoryStatusName,
        isGestaoPerformanceStatusNameMatch,
        findGestaoPerformanceStatusExitAt
    } = shared;

    const standardMetricProjects = filterPerformanceProjetoStandardMetricProjects(projectsById);
    const firstExitByKey = new Map();
    const revisionExits = [];
    const revisoesMetric = PERFORMANCE_PROJETO_EXIT_METRICS.find(metric => metric.id === 'revisoes');
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

        firstExitByKey.set(exitKey, { referenceId, metric, exitAt });
    };

    if (hasPreviousStatus) {
        sortedRows.forEach(row => {
            const projectId = Number(row.orderProjectId);
            if (!projectId) return;

            const project = projectsById[projectId];
            if (project && isPerformanceProjetoComplementaryProject(project)) return;

            const referenceId = projectId;

            const previousStatusName = getGestaoPerformanceHistoryStatusName(
                row,
                'previousStatus',
                statusById
            );
            if (!previousStatusName) return;

            const changedAt = new Date(row.changedAt);
            if (Number.isNaN(changedAt.getTime())) return;

            if (revisoesMetric
                && isGestaoPerformanceStatusNameMatch(previousStatusName, revisoesMetric.statusNames)) {
                if (isPerformanceProjetoGroupedChildProject(project)) return;
                revisionExits.push({ referenceId, exitAt: changedAt });
            }

            PERFORMANCE_PROJETO_EXIT_METRICS.forEach(metric => {
                if (metric.id === 'revisoes') return;
                if (isPerformanceProjetoAggregatorProject(project)) return;
                if (!isGestaoPerformanceStatusNameMatch(previousStatusName, metric.statusNames)) return;
                registerStatusExit(referenceId, metric, changedAt);
            });
        });
    } else {
        const seenRevisionReferenceIds = new Set();
        const seenStandardReferenceIds = new Set();

        Object.values(projectsById || {}).forEach(project => {
            if (isPerformanceProjetoComplementaryProject(project)) return;

            const referenceId = Number(project.id);
            if (!referenceId) return;

            const timeline = timelineByProjectId[referenceId] || [];

            if (revisoesMetric && !isPerformanceProjetoGroupedChildProject(project)) {
                if (seenRevisionReferenceIds.has(referenceId)) return;
                seenRevisionReferenceIds.add(referenceId);
                findAllPerformanceStatusExitsAt(timeline, revisoesMetric.statusNames, shared)
                    .forEach(exitAt => revisionExits.push({ referenceId, exitAt }));
            }
        });

        standardMetricProjects.forEach(project => {
            const referenceId = Number(project.id);
            if (!referenceId || seenStandardReferenceIds.has(referenceId)) return;

            seenStandardReferenceIds.add(referenceId);
            const timeline = timelineByProjectId[referenceId] || [];

            PERFORMANCE_PROJETO_EXIT_METRICS.forEach(metric => {
                if (metric.id === 'revisoes') return;
                const exitAt = findGestaoPerformanceStatusExitAt(timeline, metric.statusNames);
                registerStatusExit(referenceId, metric, exitAt);
            });
        });
    }

    const allowedWeekKeys = new Set(weekKeys || []);
    const countsByMetric = Object.fromEntries(
        PERFORMANCE_PROJETO_EXIT_METRICS.map(metric => [
            metric.id,
            Object.fromEntries((weekKeys || []).map(weekKey => [weekKey, 0]))
        ])
    );
    const revisionActivitiesByWeek = Object.fromEntries(
        (weekKeys || []).map(weekKey => [weekKey, 0])
    );
    const projectsByMetricAndWeek = Object.fromEntries(
        PERFORMANCE_PROJETO_EXIT_METRICS.map(metric => [
            metric.id,
            Object.fromEntries((weekKeys || []).map(weekKey => [weekKey, []]))
        ])
    );

    const assignedRevisionExits = collapsePerformanceProjetoRevisionAssignments(
        assignCommercialRevisionsToExits(
            revisionExits,
            revisionContext,
            projectsById
        )
    );

    assignedRevisionExits.forEach(entry => {
        const weekKey = getPerformanceWeekKey(entry.exitAt);
        if (!weekKey || !allowedWeekKeys.has(weekKey)) return;

        const metricId = 'revisoes';
        countsByMetric[metricId][weekKey] += 1;
        revisionActivitiesByWeek[weekKey] += entry.activityCount || 0;

        const project = projectsById[entry.referenceId];
        if (!project) return;

        projectsByMetricAndWeek[metricId][weekKey].push({
            project,
            exitAt: entry.exitAt,
            activityCount: entry.activityCount || 0,
            revisionNumber: entry.revisionNumber,
            revisionId: entry.revision?.id || null
        });
    });

    firstExitByKey.forEach(entry => {
        const weekKey = getPerformanceWeekKey(entry.exitAt);
        if (!weekKey || !allowedWeekKeys.has(weekKey)) return;

        const metric = entry.metric;
        if (!metric || metric.id === 'revisoes' || !countsByMetric[metric.id]) return;

        const project = projectsById[entry.referenceId];
        countsByMetric[metric.id][weekKey] += 1;
        if (project) {
            projectsByMetricAndWeek[metric.id][weekKey].push({
                project,
                exitAt: entry.exitAt
            });
        }
    });

    const colors = shared.GESTAO_PERFORMANCE_BAR_COLORS || ['#6366f1', '#8b5cf6', '#0891b2'];
    const maxCount = Math.max(
        0,
        ...PERFORMANCE_PROJETO_EXIT_METRICS.flatMap(metric =>
            (weekKeys || []).map(weekKey => countsByMetric[metric.id][weekKey] || 0)
        )
    );

    const metrics = PERFORMANCE_PROJETO_EXIT_METRICS.map((metric, index) => ({
        ...metric,
        color: colors[index % colors.length],
        countsByWeek: countsByMetric[metric.id],
        revisionActivitiesByWeek: metric.id === 'revisoes' ? revisionActivitiesByWeek : null,
        projectsByWeek: Object.fromEntries(
            (weekKeys || []).map(weekKey => [
                weekKey,
                sortPerformanceProjetoProjectEntries(
                    projectsByMetricAndWeek[metric.id]?.[weekKey] || [],
                    metric.id
                )
            ])
        )
    }));

    return {
        weekKeys: weekKeys || [],
        metrics,
        maxCount
    };
}

function formatPerformanceProjetoMetricCell(metric, weekKey) {
    const revisionCount = metric.countsByWeek?.[weekKey] || 0;
    if (metric.id === 'revisoes') {
        const activityCount = metric.revisionActivitiesByWeek?.[weekKey] || 0;
        if (revisionCount <= 0 && activityCount <= 0) return '—';
        return `${revisionCount} (${activityCount})`;
    }
    return revisionCount > 0 ? String(revisionCount) : '—';
}

function formatPerformanceProjetoMetricTooltip(metric, weekKey) {
    if (metric.id === 'revisoes') {
        const revisionCount = metric.countsByWeek?.[weekKey] || 0;
        const activityCount = metric.revisionActivitiesByWeek?.[weekKey] || 0;
        return `${metric.label}: ${revisionCount} revisão${revisionCount === 1 ? '' : 'ões'} (${activityCount} atividade${activityCount === 1 ? '' : 's'})`;
    }
    const count = metric.countsByWeek?.[weekKey] || 0;
    return `${metric.label}: ${count}`;
}

function getPerformanceProjetoProjectListSortKey(project) {
    const orderCode = project?.order?.orderCode || '—';
    const clientName = typeof getOrderClientName === 'function'
        ? getOrderClientName(project.order)
        : (project?.order?.client?.name || '—');
    const projectName = project?.name || '—';
    return `${orderCode} - ${clientName} - ${projectName}`;
}

function sortPerformanceProjetoProjectEntries(entries, metricId) {
    return [...(entries || [])].sort((left, right) => {
        const projectCompare = getPerformanceProjetoProjectListSortKey(left.project).localeCompare(
            getPerformanceProjetoProjectListSortKey(right.project),
            'pt-BR',
            { sensitivity: 'base' }
        );
        if (projectCompare !== 0) return projectCompare;
        if (metricId === 'revisoes') {
            return (left.revisionNumber || 0) - (right.revisionNumber || 0);
        }
        return 0;
    });
}

function formatPerformanceProjetoExitDate(exitAt) {
    if (!(exitAt instanceof Date) || Number.isNaN(exitAt.getTime())) return '—';
    const shared = getPerformanceProjetoShared();
    const isoDate = shared?.gestaoPerformanceDateToLocalIso?.(exitAt) || '';
    if (typeof formatGestaoDate === 'function' && isoDate) return formatGestaoDate(isoDate);
    return isoDate || '—';
}

function weekHasPerformanceProjetoData(weekKey, metrics) {
    return (metrics || []).some(metric => metricHasPerformanceProjetoWeekData(metric, weekKey));
}

function renderPerformanceProjetoProjectListItem(projectEntry, metric) {
    const project = projectEntry?.project;
    const orderCode = project?.order?.orderCode || '—';
    const clientName = typeof getOrderClientName === 'function'
        ? getOrderClientName(project.order)
        : (project?.order?.client?.name || '—');
    const projectName = project?.name || '—';
    const exitDateLabel = formatPerformanceProjetoExitDate(projectEntry?.exitAt);
    const projectId = Number(project?.id);
    const revisionLabel = metric.id === 'revisoes' && projectEntry.revisionNumber
        ? `Revisão ${projectEntry.revisionNumber} — `
        : metric.id === 'revisoes'
            ? 'Revisão — '
            : '';
    const activitySuffix = metric.id === 'revisoes'
        ? ` (${projectEntry.activityCount || 0} atividade${projectEntry.activityCount === 1 ? '' : 's'})`
        : '';

    return `
        <li class="gestao-performance-project-list__item">
            <span class="gestao-performance-project-list__text">
                ${escapeHtml(revisionLabel)}${escapeHtml(orderCode)} - ${escapeHtml(clientName)} - ${escapeHtml(projectName)} - ${escapeHtml(exitDateLabel)}${escapeHtml(activitySuffix)}
            </span>
            <button type="button"
                class="gestao-performance-history-btn shrink-0 text-[10px] bg-white border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-md font-medium hover:bg-indigo-50"
                data-order-project-id="${projectId}">
                Histórico
            </button>
        </li>
    `;
}

function renderPerformanceProjetoWeekDetail(weekKey, metrics) {
    const statusBlocks = (metrics || []).map(metric => {
        const projects = metric.projectsByWeek?.[weekKey] || [];
        if (!projects.length) return '';

        const items = projects
            .map(projectEntry => renderPerformanceProjetoProjectListItem(projectEntry, metric))
            .join('');

        const summaryCount = metric.id === 'revisoes'
            ? formatPerformanceProjetoMetricCell(metric, weekKey)
            : String(projects.length);

        return `
            <details class="gestao-performance-project-list gestao-performance-exit-project-list" open>
                <summary class="gestao-performance-project-list__summary">
                    <span class="gestao-performance-exit-table__swatch" style="background:${metric.color};"></span>
                    ${escapeHtml(metric.label)} (${escapeHtml(summaryCount)})
                </summary>
                <ul class="gestao-performance-project-list__items">${items}</ul>
            </details>
        `;
    }).filter(Boolean).join('');

    if (!statusBlocks) {
        return '<p class="text-xs text-slate-400 py-2">Nenhum projeto nesta semana.</p>';
    }

    return `<div class="gestao-performance-exit-month-group__statuses">${statusBlocks}</div>`;
}

function metricHasPerformanceProjetoWeekData(metric, weekKey) {
    if (metric.id === 'revisoes') {
        return (metric.countsByWeek?.[weekKey] || 0) > 0
            || (metric.revisionActivitiesByWeek?.[weekKey] || 0) > 0;
    }
    return (metric.countsByWeek?.[weekKey] || 0) > 0;
}

function renderPerformanceProjetoWeeklyChart(statusExitByWeek, emptyMessage) {
    const { weekKeys, metrics, maxCount } = statusExitByWeek || {};

    if (!weekKeys?.length || !metrics?.length) {
        return `<p class="text-xs text-slate-400 text-center py-8">${escapeHtml(emptyMessage)}</p>`;
    }

    const hasData = metrics.some(metric =>
        weekKeys.some(weekKey => metricHasPerformanceProjetoWeekData(metric, weekKey))
    );

    if (!hasData) {
        return `<p class="text-xs text-slate-400 text-center py-8">${escapeHtml(emptyMessage)}</p>`;
    }

    const columns = weekKeys.map(weekKey => {
        const bars = metrics.map(metric => {
            const count = metric.countsByWeek?.[weekKey] || 0;
            const heightPct = maxCount > 0 && count > 0
                ? Math.max(8, (count / maxCount) * 100)
                : 0;

            return `
                <div class="gestao-performance-exit-bar"
                    style="height:${heightPct.toFixed(2)}%; background:${metric.color};"
                    title="${escapeHtml(formatPerformanceProjetoMetricTooltip(metric, weekKey))}">
                </div>
            `;
        }).join('');

        return `
            <div class="gestao-performance-exit-month">
                <div class="gestao-performance-exit-month-bars">${bars}</div>
                <p class="gestao-performance-exit-month-label">${escapeHtml(formatPerformanceWeekLabel(weekKey))}</p>
            </div>
        `;
    }).join('');

    const colSpan = 1 + metrics.length;
    const tableRows = weekKeys.map(weekKey => {
        const cells = metrics.map(metric => {
            const display = formatPerformanceProjetoMetricCell(metric, weekKey);
            return `<td class="gestao-performance-exit-table__value" data-metric-label="${escapeHtml(metric.label)}">${escapeHtml(display)}</td>`;
        }).join('');

        const hasWeekData = weekHasPerformanceProjetoData(weekKey, metrics);
        const weekLabel = formatPerformanceWeekLabel(weekKey);
        const weekHeader = hasWeekData
            ? `<button type="button" class="performance-projeto-week-toggle" data-week-key="${escapeHtml(weekKey)}" aria-expanded="false">
                    <span class="performance-projeto-week-toggle__chevron" aria-hidden="true">▸</span>
                    <span>${escapeHtml(weekLabel)}</span>
               </button>`
            : `<span class="text-slate-500">${escapeHtml(weekLabel)}</span>`;

        const detailRow = hasWeekData
            ? `
            <tr class="performance-projeto-week-detail hidden" data-week-key="${escapeHtml(weekKey)}">
                <td colspan="${colSpan}" class="performance-projeto-week-detail__cell">
                    ${renderPerformanceProjetoWeekDetail(weekKey, metrics)}
                </td>
            </tr>`
            : '';

        return `
            <tr class="performance-projeto-week-row">
                <th scope="row" class="gestao-performance-exit-table__month">${weekHeader}</th>
                ${cells}
            </tr>
            ${detailRow}
        `;
    }).join('');

    const tableHeaders = metrics.map(metric => `
        <th scope="col" class="gestao-performance-exit-table__metric">
            <span class="gestao-performance-exit-table__swatch" style="background:${metric.color};"></span>
            ${escapeHtml(metric.label)}
        </th>
    `).join('');

    const legend = metrics.map(metric => {
        const legendLabel = metric.id === 'revisoes'
            ? `${metric.label} (revisões e atividades)`
            : metric.label;
        return `
        <li>
            <span class="gestao-performance-exit-legend__swatch" style="background:${metric.color};"></span>
            <span>${escapeHtml(legendLabel)}</span>
        </li>
    `;
    }).join('');

    return `
        <div class="gestao-performance-exit-chart-wrap">
            <div class="gestao-performance-exit-chart" style="--gestao-performance-exit-month-count:${weekKeys.length};">
                ${columns}
            </div>
            <ul class="gestao-performance-exit-legend">${legend}</ul>
            <div class="gestao-performance-exit-table-wrap">
                <table class="gestao-performance-exit-table">
                    <thead>
                        <tr>
                            <th scope="col">Semana</th>
                            ${tableHeaders}
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
                <p class="text-[10px] text-slate-400 mt-2">Clique na semana na tabela para expandir e ver os projetos.</p>
            </div>
        </div>
    `;
}

async function loadPerformanceProjeto() {
    const content = document.getElementById('performance-projeto-content');
    if (!content) return;

    if (!canAccessPerformance()) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Acesso restrito.</p>';
        return;
    }

    const shared = getPerformanceProjetoShared();
    if (!shared) {
        content.innerHTML = '<p class="text-xs text-red-500 text-center py-8">Módulo de performance da gestão não carregado.</p>';
        return;
    }

    const weeksBack = getPerformanceProjetoWeeksInput();
    const weekKeys = buildPerformanceWeekKeysLookback(weeksBack);

    content.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando...</p>';

    try {
        const [{ data: historyRows, error }, { data: projects, error: projectsError }, revisionContext] = await Promise.all([
            shared.fetchGestaoPerformanceHistoryRows(),
            shared.fetchGestaoPerformanceProjects(),
            fetchCommercialRevisionActivityContext()
        ]);

        if (error) {
            content.innerHTML = `<p class="text-xs text-red-500 text-center py-10">Erro ao carregar histórico: ${escapeHtml(error.message)}</p>`;
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
        const timelineByProjectId = shared.buildGestaoPerformanceTimeline(historyRows, statusById);
        const projectsById = buildPerformanceProjetoProjectsById(projects, statusById);
        performanceProjetoProjectsById = { ...projectsById };

        revisionContext.revisionNumberById = buildPerformanceProjetoRevisionNumberById(
            revisionContext.revisionsByProjectId,
            projectsById
        );

        const statusExitByWeek = computePerformanceProjetoExitsByWeek(
            historyRows,
            timelineByProjectId,
            projectsById,
            statusById,
            revisionContext,
            weekKeys
        );

        const chartHtml = renderPerformanceProjetoWeeklyChart(
            statusExitByWeek,
            'Nenhuma saída de status no período selecionado.'
        );

        const descriptions = PERFORMANCE_PROJETO_EXIT_METRICS.map(metric => `
            <li class="text-xs text-slate-500"><strong class="text-slate-700">${escapeHtml(metric.label)}:</strong> ${escapeHtml(metric.description)}</li>
        `).join('');

        content.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
                <p class="text-xs text-slate-500">Período: últimas <strong>${weeksBack}</strong> semanas (semana iniciando na segunda-feira). Projetos complementares não entram na contagem.</p>
                ${chartHtml}
                <ul class="space-y-1 border-t border-slate-100 pt-3">${descriptions}</ul>
            </div>
        `;
    } catch (loadError) {
        content.innerHTML = `<p class="text-xs text-red-500 text-center py-10">Erro ao carregar: ${escapeHtml(loadError.message)}</p>`;
    }
}

function openPerformanceProjetoProjectHistory(orderProjectId) {
    const project = performanceProjetoProjectsById[Number(orderProjectId)];
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

    if (typeof openGestaoPerformanceProjectStatusHistory === 'function') {
        openGestaoPerformanceProjectStatusHistory(orderProjectId);
    }
}

function bindPerformanceProjetoEvents() {
    document.getElementById('btn-performance-projeto-refresh')?.addEventListener('click', () => {
        void loadPerformanceProjeto();
    });
    document.getElementById('performance-projeto-weeks')?.addEventListener('change', () => {
        void loadPerformanceProjeto();
    });
    document.getElementById('performance-projeto-filter-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        void loadPerformanceProjeto();
    });

    document.getElementById('performance-projeto-content')?.addEventListener('click', (event) => {
        const toggle = event.target.closest('.performance-projeto-week-toggle');
        if (toggle) {
            event.preventDefault();
            const weekKey = toggle.dataset.weekKey;
            const root = document.getElementById('performance-projeto-content');
            const detailRow = root?.querySelector(
                `tr.performance-projeto-week-detail[data-week-key="${weekKey}"]`
            );
            if (!detailRow) return;

            const isHidden = detailRow.classList.contains('hidden');
            detailRow.classList.toggle('hidden', !isHidden);
            toggle.classList.toggle('is-open', isHidden);
            toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
            const chevron = toggle.querySelector('.performance-projeto-week-toggle__chevron');
            if (chevron) chevron.textContent = isHidden ? '▾' : '▸';
            return;
        }

        const historyBtn = event.target.closest('.gestao-performance-history-btn');
        if (!historyBtn) return;
        event.preventDefault();
        event.stopPropagation();
        openPerformanceProjetoProjectHistory(historyBtn.dataset.orderProjectId);
    });
}

bindPerformanceProjetoEvents();

window.loadPerformanceProjeto = loadPerformanceProjeto;
