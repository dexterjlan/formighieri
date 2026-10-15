/** OrderProjectStatus.sortOrder — início e fim da janela de montagem externa por pedido. */
const PERFORMANCE_MONTAGEM_EXTERNA_START_SORT_ORDER = 21;
const PERFORMANCE_MONTAGEM_EXTERNA_END_SORT_ORDER = 22;
const PERFORMANCE_MONTAGEM_EXTERNA_DEFAULT_DAYS_BACK = 30;
const PERFORMANCE_MONTAGEM_EXTERNA_MAX_DAYS_BACK = 3650;
const PERFORMANCE_MONTAGEM_ASSEMBLY_SELECT_VARIANTS = [
    `
        *,
        order:salesOrders(orderCode, client:Client(name)),
        installers:AssemblyScheduleInstaller(id, installerId, installer:Installer(id, name)),
        cabinetMakers:AssemblyScheduleCabinetMaker(id, cabinetMakerId, cabinetMaker:CabinetMaker(id, name))
    `,
    `
        *,
        order:salesOrders(orderCode, client:Client(name)),
        installers:AssemblyScheduleInstaller(id, installerId, installer:Installer(id, name))
    `,
    `
        *,
        installers:AssemblyScheduleInstaller(id, installerId, installer:Installer(id, name)),
        cabinetMakers:AssemblyScheduleCabinetMaker(id, cabinetMakerId, cabinetMaker:CabinetMaker(id, name))
    `,
    '*'
];

const PERFORMANCE_MONTAGEM_ORDER_PROJECT_SELECT = [
    'id, orderId, statusId, deliveryDate, deliveryPhaseId, isComplementary, isReplaced, isReplacement, projectStatus:OrderProjectStatus(id, name, sortOrder)',
    'id, orderId, statusId, deliveryDate, deliveryPhaseId, isComplementary, isReplaced, projectStatus:OrderProjectStatus(id, name, sortOrder)',
    'id, orderId, statusId, deliveryDate, isComplementary, isReplaced, projectStatus:OrderProjectStatus(id, name, sortOrder)',
    'id, orderId, statusId, isComplementary, isReplaced, isReplacement, projectStatus:OrderProjectStatus(id, name, sortOrder)',
    'id, orderId, statusId, isComplementary, isReplaced, projectStatus:OrderProjectStatus(id, name, sortOrder)',
    'id, orderId, statusId, isComplementary, isReplaced, projectStatus:OrderProjectStatus(id, name)'
];

function getPerformanceMontagemCrewMembers(schedule) {
    if (typeof getMontagemProgCrewMembers === 'function') {
        return getMontagemProgCrewMembers(schedule);
    }

    const installers = (schedule?.installers || [])
        .map(row => ({
            type: 'montador',
            id: Number(row.installer?.id || row.installerId),
            name: row.installer?.name || 'Montador'
        }))
        .filter(member => member.id);

    const cabinetMakers = (schedule?.cabinetMakers || [])
        .map(row => ({
            type: 'marceneiro',
            id: Number(row.cabinetMaker?.id || row.cabinetMakerId),
            name: row.cabinetMaker?.name || 'Marceneiro'
        }))
        .filter(member => member.id);

    return [...installers, ...cabinetMakers];
}

function countPerformanceMontagemInclusiveDays(startDateKey, endDateKey) {
    const start = typeof parseDateKey === 'function' ? parseDateKey(startDateKey) : null;
    const end = typeof parseDateKey === 'function' ? parseDateKey(endDateKey) : null;
    if (!start || !end || end < start) return 0;
    return daysBetween(start, end) + 1;
}

function formatPerformanceMontagemDateLabel(dateKey) {
    if (!dateKey) return '—';
    if (typeof formatGestaoDate === 'function') {
        return formatGestaoDate(String(dateKey).split('T')[0]);
    }
    const date = typeof parseDateKey === 'function' ? parseDateKey(dateKey) : null;
    if (!date) return '—';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function getPerformanceMontagemProjectSortOrder(project, statusById = {}) {
    const fromEmbed = Number(project?.projectStatus?.sortOrder);
    if (Number.isFinite(fromEmbed)) return fromEmbed;
    const statusId = Number(project?.statusId);
    const fromMap = Number(statusById?.[statusId]?.sortOrder);
    return Number.isFinite(fromMap) ? fromMap : null;
}

function isPerformanceMontagemOrderProjectCountable(project) {
    if (!project?.id) return false;
    if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) return false;
    if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) return false;
    if (project.isComplementary === true || project.isReplaced === true) return false;
    return true;
}

function isPerformanceMontagemExternaEndSortOrder(sortOrder) {
    return sortOrder != null && sortOrder >= PERFORMANCE_MONTAGEM_EXTERNA_END_SORT_ORDER;
}

function getPerformanceMontagemHistoryNewSortOrder(row, statusById = {}) {
    const fromEmbed = Number(row?.newStatus?.sortOrder);
    if (Number.isFinite(fromEmbed)) return fromEmbed;
    const statusId = Number(row?.newStatusId);
    const fromMap = Number(statusById?.[statusId]?.sortOrder);
    return Number.isFinite(fromMap) ? fromMap : null;
}

function performanceMontagemChangedAtToDateKey(changedAt) {
    if (!changedAt) return '';
    const date = new Date(changedAt);
    if (Number.isNaN(date.getTime())) return String(changedAt).split('T')[0];
    const toLocalIso = window.gestaoPerformanceShared?.gestaoPerformanceDateToLocalIso;
    if (typeof toLocalIso === 'function') return toLocalIso(date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getPerformanceMontagemDaysBackFilter() {
    const input = document.getElementById('performance-montagem-externa-days-back');
    const raw = Number(input?.value);
    if (!Number.isFinite(raw) || raw < 1) return PERFORMANCE_MONTAGEM_EXTERNA_DEFAULT_DAYS_BACK;
    return Math.min(Math.floor(raw), PERFORMANCE_MONTAGEM_EXTERNA_MAX_DAYS_BACK);
}

function subtractPerformanceMontagemDaysFromDateKey(dateKey, days) {
    if (!dateKey || !days) return '';
    const base = typeof parseDateKey === 'function' ? parseDateKey(dateKey) : null;
    if (!base) return '';
    const shifted = typeof addDays === 'function' ? addDays(base, -days) : new Date(base.getTime() - days * 86400000);
    const toLocalIso = window.gestaoPerformanceShared?.gestaoPerformanceDateToLocalIso;
    if (typeof toLocalIso === 'function') return toLocalIso(shifted);
    const year = shifted.getFullYear();
    const month = String(shifted.getMonth() + 1).padStart(2, '0');
    const day = String(shifted.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function filterPerformanceMontagemRowsByEndDate(rows, daysBack) {
    const todayKey = getPerformanceMontagemTodayDateKey();
    const minEndKey = subtractPerformanceMontagemDaysFromDateKey(todayKey, daysBack);
    if (!minEndKey) return rows || [];

    return (rows || []).filter(row => {
        if (row.windowOpen) return true;
        const endKey = row.windowEndKey;
        if (!endKey) return false;
        return endKey >= minEndKey;
    });
}

function getPerformanceMontagemTodayDateKey() {
    const toLocalIso = window.gestaoPerformanceShared?.gestaoPerformanceDateToLocalIso;
    if (typeof toLocalIso === 'function') return toLocalIso(new Date());
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function countPerformanceMontagemIntersectedDays(blockStartKey, blockEndKey, windowStartKey, windowEndKey) {
    if (!blockStartKey || !windowStartKey || !windowEndKey) return 0;
    const endKey = blockEndKey || blockStartKey;
    const rangeStart = blockStartKey > windowStartKey ? blockStartKey : windowStartKey;
    const rangeEnd = endKey < windowEndKey ? endKey : windowEndKey;
    return countPerformanceMontagemInclusiveDays(rangeStart, rangeEnd);
}

function formatPerformanceMontagemDaysLabel(days) {
    const value = Math.round(days);
    return `${value} dia${value === 1 ? '' : 's'}`;
}

function getPerformanceMontagemOrderDeliveryDateKey(orderMeta) {
    const key = String(orderMeta?.clientDeliveryDate || '').split('T')[0];
    return key || null;
}

function resolvePerformanceMontagemProjectPhaseId(project, phases) {
    const phaseId = Number(project?.deliveryPhaseId);
    if (phaseId) return phaseId;
    if ((phases || []).length >= 2) {
        const first = Number(phases[0]?.id);
        return first || null;
    }
    return null;
}

function buildPerformanceMontagemSegmentLabel(segment) {
    if (segment.phaseLabel) return segment.phaseLabel;
    if (segment.deliveryDateKey) return formatPerformanceMontagemDateLabel(segment.deliveryDateKey);
    return '—';
}

/** Segmentos por fase de entrega do pedido (≥2) ou uma linha com a data de entrega do pedido. */
function buildPerformanceMontagemOrderSegments(orderId, countableProjects, phases = [], orderMeta = null) {
    const hasPhases = (phases || []).length >= 2;

    if (hasPhases) {
        return (phases || []).map(phase => {
            const phaseId = Number(phase.id);
            const projectIds = new Set();
            (countableProjects || []).forEach(project => {
                if (resolvePerformanceMontagemProjectPhaseId(project, phases) === phaseId) {
                    projectIds.add(Number(project.id));
                }
            });
            if (!projectIds.size) return null;

            const deliveryDateKey = String(phase.deliveryDate || '').split('T')[0] || null;
            const phaseLabel = typeof getGestaoOrderPhaseLabel === 'function'
                ? getGestaoOrderPhaseLabel(phase)
                : `${phase.name || 'Fase'} · ${formatPerformanceMontagemDateLabel(deliveryDateKey)}`;

            return {
                orderId,
                segmentKey: `phase:${phaseId}`,
                phaseId,
                deliveryDateKey,
                phaseLabel,
                projectIds
            };
        }).filter(Boolean);
    }

    const projectIds = new Set((countableProjects || []).map(project => Number(project.id)).filter(Boolean));
    if (!projectIds.size) return [];

    return [{
        orderId,
        segmentKey: 'order',
        deliveryDateKey: getPerformanceMontagemOrderDeliveryDateKey(orderMeta),
        phaseLabel: null,
        projectIds
    }];
}

function resolvePerformanceMontagemSegmentWindowEnd(
    segmentProjects,
    projectFirstEndAt,
    statusById,
    todayKey
) {
    const anyAtOrBelow21 = segmentProjects.some(project => {
        const sortOrder = getPerformanceMontagemProjectSortOrder(project, statusById);
        return sortOrder != null && sortOrder <= PERFORMANCE_MONTAGEM_EXTERNA_START_SORT_ORDER;
    });

    const allReachedEnd = segmentProjects.every(project => {
        const sortOrder = getPerformanceMontagemProjectSortOrder(project, statusById);
        return isPerformanceMontagemExternaEndSortOrder(sortOrder);
    });

    let last22At = null;
    if (allReachedEnd) {
        segmentProjects.forEach(project => {
            const at = projectFirstEndAt.get(Number(project.id));
            if (at && (!last22At || at > last22At)) last22At = at;
        });
    }

    if (anyAtOrBelow21) {
        return { windowEndKey: todayKey, last22At: null, windowOpen: true };
    }

    if (allReachedEnd && last22At) {
        return {
            windowEndKey: performanceMontagemChangedAtToDateKey(last22At),
            last22At,
            windowOpen: false
        };
    }

    return { windowEndKey: todayKey, last22At: null, windowOpen: true };
}

/**
 * Janela por segmento (fase ou data de entrega): primeira entrada em 21 entre os projetos do segmento
 * até 22 (último do segmento) ou até hoje se ainda houver projeto com status ≤ 21.
 */
function buildPerformanceMontagemSegmentWindows(historyRows, orderProjects, phasesByOrderId, ordersMetaById, statusById) {
    const projectsByOrderId = new Map();
    const orderIdByProjectId = new Map();

    (orderProjects || []).forEach(project => {
        const orderId = Number(project.orderId);
        const projectId = Number(project.id);
        if (!orderId || !projectId) return;
        orderIdByProjectId.set(projectId, orderId);
        if (!projectsByOrderId.has(orderId)) projectsByOrderId.set(orderId, []);
        projectsByOrderId.get(orderId).push(project);
    });

    const projectHistory = new Map();

    (historyRows || []).forEach(row => {
        const projectId = Number(row.orderProjectId);
        const orderId = orderIdByProjectId.get(projectId);
        if (!orderId) return;

        const sortOrder = getPerformanceMontagemHistoryNewSortOrder(row, statusById);
        const changedAt = row.changedAt;
        if (!changedAt || sortOrder == null) return;

        if (!projectHistory.has(projectId)) {
            projectHistory.set(projectId, { first21At: null, projectFirstEndAt: null });
        }
        const entry = projectHistory.get(projectId);

        if (sortOrder === PERFORMANCE_MONTAGEM_EXTERNA_START_SORT_ORDER) {
            if (!entry.first21At || changedAt < entry.first21At) entry.first21At = changedAt;
        }

        if (isPerformanceMontagemExternaEndSortOrder(sortOrder)) {
            if (!entry.projectFirstEndAt || changedAt < entry.projectFirstEndAt) {
                entry.projectFirstEndAt = changedAt;
            }
        }
    });

    const todayKey = getPerformanceMontagemTodayDateKey();
    const windows = new Map();

    projectsByOrderId.forEach((projects, orderId) => {
        const countable = projects.filter(isPerformanceMontagemOrderProjectCountable);
        if (!countable.length) return;

        const phases = phasesByOrderId.get(orderId) || [];
        const orderMeta = ordersMetaById.get(orderId) || null;
        const segments = buildPerformanceMontagemOrderSegments(orderId, countable, phases, orderMeta);
        if (!segments.length) return;

        segments.forEach(segment => {
            const segmentProjects = countable.filter(project => segment.projectIds.has(Number(project.id)));
            if (!segmentProjects.length) return;

            let first21At = null;
            const projectFirstEndAt = new Map();

            segmentProjects.forEach(project => {
                const history = projectHistory.get(Number(project.id));
                if (!history) return;
                if (history.first21At && (!first21At || history.first21At < first21At)) {
                    first21At = history.first21At;
                }
                if (history.projectFirstEndAt) {
                    projectFirstEndAt.set(Number(project.id), history.projectFirstEndAt);
                }
            });

            if (!first21At) return;

            const windowStartKey = performanceMontagemChangedAtToDateKey(first21At);
            if (!windowStartKey) return;

            const endResolved = resolvePerformanceMontagemSegmentWindowEnd(
                segmentProjects,
                projectFirstEndAt,
                statusById,
                todayKey
            );
            const windowEndKey = endResolved.windowEndKey;
            if (!windowEndKey || windowEndKey < windowStartKey) return;

            const statusCalendarDays = countPerformanceMontagemInclusiveDays(windowStartKey, windowEndKey);
            const mapKey = `${orderId}:${segment.segmentKey}`;

            windows.set(mapKey, {
                orderId,
                segmentKey: segment.segmentKey,
                segmentLabel: buildPerformanceMontagemSegmentLabel(segment),
                deliveryDateKey: segment.deliveryDateKey,
                windowStartKey,
                windowEndKey,
                first21At,
                last22At: endResolved.last22At,
                windowOpen: endResolved.windowOpen,
                statusCalendarDays
            });
        });
    });

    return windows;
}

function getPerformanceMontagemOrderClientName(schedule, orderMeta) {
    if (orderMeta?.clientName) return orderMeta.clientName;
    if (schedule?.order && typeof getOrderClientName === 'function') {
        return getOrderClientName(schedule.order) || '—';
    }
    return schedule?.client?.name || '—';
}

function getPerformanceMontagemOrderCode(schedule, orderMeta) {
    return orderMeta?.orderCode
        || schedule?.order?.orderCode
        || '—';
}

async function fetchPerformanceMontagemAssemblySchedules() {
    const pageSize = 1000;

    let lastError = null;

    for (const selectColumns of PERFORMANCE_MONTAGEM_ASSEMBLY_SELECT_VARIANTS) {
        const rows = [];
        let from = 0;
        let failed = false;

        while (true) {
            const { data, error } = await supabaseClient
                .from('AssemblySchedule')
                .select(selectColumns)
                .order('startDate', { ascending: true })
                .order('id', { ascending: true })
                .range(from, from + pageSize - 1);

            if (error) {
                lastError = error;
                if (error.message?.includes('AssemblySchedule')) {
                    return [];
                }
                failed = true;
                break;
            }

            rows.push(...(data || []));
            if (!data || data.length < pageSize) break;
            from += pageSize;
        }

        if (!failed) return rows;
        if (!/relationship|embed|schema cache|column/i.test(String(lastError?.message || ''))) {
            throw lastError;
        }
    }

    return [];
}

async function fetchPerformanceMontagemOrderProjects() {
    let lastError = null;

    for (const selectColumns of PERFORMANCE_MONTAGEM_ORDER_PROJECT_SELECT) {
        const rows = [];
        const pageSize = 1000;
        let from = 0;
        let failed = false;

        while (true) {
            const { data, error } = await supabaseClient
                .from('OrderProject')
                .select(selectColumns)
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

        if (!failed) return rows;
        if (!/relationship|embed|schema cache|column/i.test(String(lastError?.message || ''))) {
            throw lastError;
        }
    }

    return [];
}

async function fetchPerformanceMontagemDeliveryPhases(orderIds) {
    const normalizedIds = [...new Set((orderIds || []).map(id => Number(id)).filter(Boolean))];
    const phasesByOrderId = new Map();
    if (!normalizedIds.length) return phasesByOrderId;

    const chunkSize = 80;
    for (let offset = 0; offset < normalizedIds.length; offset += chunkSize) {
        const chunk = normalizedIds.slice(offset, offset + chunkSize);
        const { data, error } = await supabaseClient
            .from('OrderDeliveryPhase')
            .select('id, orderId, orderCode, name, deliveryDate, sortOrder')
            .in('orderId', chunk)
            .order('sortOrder', { ascending: true });

        if (error) {
            if (error.message?.includes('OrderDeliveryPhase')) return phasesByOrderId;
            throw error;
        }

        (data || []).forEach(phase => {
            const orderId = Number(phase.orderId);
            if (!orderId) return;
            if (!phasesByOrderId.has(orderId)) phasesByOrderId.set(orderId, []);
            phasesByOrderId.get(orderId).push(phase);
        });
    }

    return phasesByOrderId;
}

async function fetchPerformanceMontagemOrdersMeta(orderIds) {
    const normalizedIds = [...new Set((orderIds || []).map(id => Number(id)).filter(Boolean))];
    const ordersMetaById = new Map();
    if (!normalizedIds.length) return ordersMetaById;

    const selectVariants = [
        'id, orderCode, clientDeliveryDate, client:Client(name)',
        'id, orderCode, clientDeliveryDate',
        'id, orderCode, client:Client(name)',
        'id, orderCode'
    ];

    const chunkSize = 80;
    for (let offset = 0; offset < normalizedIds.length; offset += chunkSize) {
        const chunk = normalizedIds.slice(offset, offset + chunkSize);
        let chunkRows = null;
        let lastError = null;

        for (const selectColumns of selectVariants) {
            const { data, error } = await supabaseClient
                .from('salesOrders')
                .select(selectColumns)
                .in('id', chunk);

            if (!error) {
                chunkRows = data || [];
                break;
            }
            lastError = error;
            if (!/relationship|embed|schema cache|clientDeliveryDate/i.test(String(error.message || ''))) {
                throw error;
            }
        }

        if (!chunkRows && lastError) throw lastError;

        (chunkRows || []).forEach(order => {
            const orderId = Number(order.id);
            if (!orderId) return;
            const clientName = typeof getOrderClientName === 'function'
                ? getOrderClientName(order)
                : (order.client?.name || '—');
            ordersMetaById.set(orderId, {
                orderCode: order.orderCode || '—',
                clientName: clientName || '—',
                clientDeliveryDate: order.clientDeliveryDate || null
            });
        });
    }

    return ordersMetaById;
}

function mergePerformanceMontagemOrdersMeta(ordersMetaById, phasesByOrderId, schedules = []) {
    const merged = new Map(ordersMetaById);

    (schedules || []).forEach(schedule => {
        const orderId = Number(schedule.orderId);
        if (!orderId) return;
        const current = merged.get(orderId) || { orderCode: '—', clientName: '—', clientDeliveryDate: null };
        merged.set(orderId, {
            orderCode: getPerformanceMontagemOrderCode(schedule, current),
            clientName: getPerformanceMontagemOrderClientName(schedule, current),
            clientDeliveryDate: current.clientDeliveryDate || null
        });
    });

    phasesByOrderId.forEach((phases, orderId) => {
        const current = merged.get(orderId) || { orderCode: '—', clientName: '—', clientDeliveryDate: null };
        const phaseOrderCode = phases?.[0]?.orderCode;
        if (phaseOrderCode && (!current.orderCode || current.orderCode === '—')) {
            merged.set(orderId, { ...current, orderCode: phaseOrderCode });
        }
    });

    return merged;
}

function buildPerformanceMontagemOrdersReport(schedules, segmentWindows, ordersMetaById = new Map()) {
    const orderMetaById = mergePerformanceMontagemOrdersMeta(ordersMetaById, new Map(), schedules);

    const rowsByKey = new Map();

    segmentWindows.forEach((window, mapKey) => {
        const orderMeta = orderMetaById.get(window.orderId) || ordersMetaById.get(window.orderId);
        rowsByKey.set(mapKey, {
            rowKey: mapKey,
            orderId: window.orderId,
            orderCode: orderMeta?.orderCode || '—',
            clientName: orderMeta?.clientName || '—',
            segmentLabel: window.segmentLabel,
            deliveryDateKey: window.deliveryDateKey,
            window,
            workerDays: new Map(),
            scheduleDays: 0
        });
    });

    (schedules || []).forEach(schedule => {
        const orderId = Number(schedule.orderId);
        if (!orderId) return;

        const startKey = String(schedule.startDate || '').split('T')[0];
        const endKey = String(schedule.endDate || schedule.startDate || '').split('T')[0];
        if (!startKey) return;

        const crew = getPerformanceMontagemCrewMembers(schedule);
        const matchingKeys = [...segmentWindows.keys()].filter(key => key.startsWith(`${orderId}:`));
        if (!matchingKeys.length) return;

        matchingKeys.forEach(mapKey => {
            const window = segmentWindows.get(mapKey);
            if (!window) return;

            const dayCount = countPerformanceMontagemIntersectedDays(
                startKey,
                endKey,
                window.windowStartKey,
                window.windowEndKey
            );
            if (dayCount <= 0) return;

            const entry = rowsByKey.get(mapKey);
            if (!entry) return;

            entry.orderCode = getPerformanceMontagemOrderCode(schedule, entry);
            entry.clientName = getPerformanceMontagemOrderClientName(schedule, entry);
            entry.scheduleDays += dayCount * crew.length;

            if (!crew.length) return;

            crew.forEach(member => {
                const workerKey = `${member.type}:${member.id}`;
                const label = member.name || (member.type === 'marceneiro' ? 'Marceneiro' : 'Montador');
                const current = entry.workerDays.get(workerKey) || { label, days: 0 };
                current.days += dayCount;
                entry.workerDays.set(workerKey, current);
            });
        });
    });

    return [...rowsByKey.values()]
        .map(entry => {
            const workers = [...entry.workerDays.values()]
                .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR', { sensitivity: 'base' }));
            const scheduleDaysFromWorkers = workers.reduce((sum, worker) => sum + worker.days, 0);
            const scheduleDays = scheduleDaysFromWorkers || entry.scheduleDays;
            const { window } = entry;

            return {
                rowKey: entry.rowKey,
                orderId: entry.orderId,
                orderCode: entry.orderCode,
                clientName: entry.clientName,
                segmentLabel: entry.segmentLabel,
                deliveryDateKey: entry.deliveryDateKey,
                firstDateLabel: formatPerformanceMontagemDateLabel(window.windowStartKey),
                lastDateLabel: window.windowOpen
                    ? '—'
                    : formatPerformanceMontagemDateLabel(window.windowEndKey),
                windowOpen: window.windowOpen,
                windowEndKey: window.windowEndKey,
                statusCalendarDays: window.statusCalendarDays,
                scheduleDays,
                workers
            };
        })
        .filter(entry => entry.orderCode && entry.orderCode !== '—')
        .filter(entry => entry.statusCalendarDays > 0 || entry.scheduleDays > 0)
        .sort((left, right) => {
            const dateLeft = left.deliveryDateKey || '';
            const dateRight = right.deliveryDateKey || '';
            const dateCompare = dateLeft.localeCompare(dateRight);
            if (dateCompare !== 0) return dateCompare;

            const codeCompare = String(left.orderCode).localeCompare(String(right.orderCode), 'pt-BR', {
                numeric: true,
                sensitivity: 'base'
            });
            if (codeCompare !== 0) return codeCompare;

            return String(left.segmentLabel).localeCompare(String(right.segmentLabel), 'pt-BR', { sensitivity: 'base' });
        });
}

function renderPerformanceMontagemExternaRows(rows, daysBack = PERFORMANCE_MONTAGEM_EXTERNA_DEFAULT_DAYS_BACK) {
    if (!rows.length) {
        return `<p class="text-xs text-slate-400 text-center py-10">Nenhuma linha com fim nos últimos ${daysBack} dias (pedidos em andamento sempre aparecem).</p>`;
    }

    const items = rows.map(row => {
        const workerItems = row.workers.length
            ? row.workers.map(worker => `
            <li class="performance-montagem-table__worker">
                <span class="performance-montagem-table__worker-name">${escapeHtml(worker.label)}</span>
                <span class="performance-montagem-table__worker-days">${escapeHtml(formatPerformanceMontagemDaysLabel(worker.days))}</span>
            </li>
        `).join('')
            : '<li class="performance-montagem-table__worker performance-montagem-table__worker--empty">Sem dias no cronograma neste período.</li>';

        return `
            <details class="performance-montagem-table__order">
                <summary class="performance-montagem-table__summary">
                    <span class="performance-montagem-table__chevron" aria-hidden="true">▸</span>
                    <span class="performance-montagem-table__cell performance-montagem-table__cell--order" title="Pedido">${escapeHtml(row.orderCode)}</span>
                    <span class="performance-montagem-table__cell performance-montagem-table__cell--client" title="Cliente">${escapeHtml(row.clientName)}</span>
                    <span class="performance-montagem-table__cell performance-montagem-table__cell--segment" title="Entrega / fase">${escapeHtml(row.segmentLabel)}</span>
                    <span class="performance-montagem-table__cell performance-montagem-table__cell--date">${escapeHtml(row.firstDateLabel)}</span>
                    <span class="performance-montagem-table__cell performance-montagem-table__cell--date">${escapeHtml(row.lastDateLabel)}</span>
                    <span class="performance-montagem-table__cell performance-montagem-table__cell--metric">${escapeHtml(formatPerformanceMontagemDaysLabel(row.statusCalendarDays))}</span>
                    <span class="performance-montagem-table__cell performance-montagem-table__cell--metric performance-montagem-table__cell--total">${escapeHtml(formatPerformanceMontagemDaysLabel(row.scheduleDays))}</span>
                </summary>
                <div class="performance-montagem-table__workers">
                    <p class="performance-montagem-table__workers-title">Cronograma — montador / marceneiro</p>
                    <ul class="performance-montagem-table__worker-list">${workerItems}</ul>
                </div>
            </details>
        `;
    }).join('');

    return `
        <div class="performance-montagem-table-wrap">
        <div class="performance-montagem-table">
            <div class="performance-montagem-table__head" role="row">
                <span class="performance-montagem-table__head-spacer" aria-hidden="true"></span>
                <span class="performance-montagem-table__head-cell">Pedido</span>
                <span class="performance-montagem-table__head-cell">Cliente</span>
                <span class="performance-montagem-table__head-cell">Entrega</span>
                <span class="performance-montagem-table__head-cell">Início (21)</span>
                <span class="performance-montagem-table__head-cell">Fim</span>
                <span class="performance-montagem-table__head-cell performance-montagem-table__head-cell--metric">Dias status</span>
                <span class="performance-montagem-table__head-cell performance-montagem-table__head-cell--metric performance-montagem-table__head-cell--total">Dias trabalhando</span>
            </div>
            <div class="performance-montagem-table__body">${items}</div>
        </div>
        </div>
    `;
}

async function loadPerformanceMontagemExterna() {
    const content = document.getElementById('performance-montagem-externa-content');
    if (!content) return;

    if (!canAccessPerformance()) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Acesso restrito.</p>';
        return;
    }

    content.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando...</p>';

    try {
        const statuses = typeof loadGestaoProjectStatuses === 'function'
            ? await loadGestaoProjectStatuses(true)
            : [];
        const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));

        const fetchHistory = window.gestaoPerformanceShared?.fetchGestaoPerformanceHistoryRows;
        const [schedules, orderProjects, historyResult] = await Promise.all([
            fetchPerformanceMontagemAssemblySchedules(),
            fetchPerformanceMontagemOrderProjects(),
            typeof fetchHistory === 'function' ? fetchHistory() : Promise.resolve({ data: [], error: null })
        ]);

        if (historyResult?.error) throw historyResult.error;

        const orderIds = [...new Set((orderProjects || []).map(project => Number(project.orderId)).filter(Boolean))];
        const [phasesByOrderId, ordersMetaById] = await Promise.all([
            fetchPerformanceMontagemDeliveryPhases(orderIds),
            fetchPerformanceMontagemOrdersMeta(orderIds)
        ]);
        const ordersMeta = mergePerformanceMontagemOrdersMeta(ordersMetaById, phasesByOrderId, schedules);

        const segmentWindows = buildPerformanceMontagemSegmentWindows(
            historyResult?.data || [],
            orderProjects,
            phasesByOrderId,
            ordersMeta,
            statusById
        );
        const daysBack = getPerformanceMontagemDaysBackFilter();
        const allRows = buildPerformanceMontagemOrdersReport(schedules, segmentWindows, ordersMeta);
        const rows = filterPerformanceMontagemRowsByEndDate(allRows, daysBack);

        const startStatusName = (statuses || []).find(
            status => Number(status.sortOrder) === PERFORMANCE_MONTAGEM_EXTERNA_START_SORT_ORDER
        )?.name || 'Montagem Externa';
        const endStatusName = (statuses || []).find(
            status => Number(status.sortOrder) === PERFORMANCE_MONTAGEM_EXTERNA_END_SORT_ORDER
        )?.name || 'Aguardando Entrega Técnica';

        content.innerHTML = `
            <p class="performance-montagem-hint text-xs text-slate-500 leading-relaxed">
                Uma linha por pedido e <strong>fase de entrega do pedido</strong> (se houver); caso contrário, uma linha com a
                <strong>data de entrega do pedido</strong>. <strong>Dias status</strong>: calendário do primeiro projeto do grupo em
                <strong>${escapeHtml(startStatusName)}</strong> (21) até o último em <strong>${escapeHtml(endStatusName)}</strong> (22)
                (a coluna <strong>Fim</strong> só aparece quando o grupo encerrou; senão a contagem de dias status vai até hoje).
                <strong>Dias trabalhando</strong>: programação de montagem (dia programado × profissional) na mesma janela.
                Lista: fim nos últimos <strong>${daysBack}</strong> dias ou pedido <strong>em andamento</strong> (sem data de fim).
            </p>
            ${renderPerformanceMontagemExternaRows(rows, daysBack)}
        `;
    } catch (error) {
        content.innerHTML = `<p class="text-xs text-red-500 text-center py-10">Erro ao carregar: ${escapeHtml(error.message)}</p>`;
    }
}

function bindPerformanceMontagemExternaEvents() {
    document.getElementById('btn-performance-montagem-externa-refresh')?.addEventListener('click', () => {
        void loadPerformanceMontagemExterna();
    });
    document.getElementById('performance-montagem-externa-filter-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        void loadPerformanceMontagemExterna();
    });
    document.getElementById('performance-montagem-externa-days-back')?.addEventListener('change', () => {
        void loadPerformanceMontagemExterna();
    });
}

bindPerformanceMontagemExternaEvents();

window.loadPerformanceMontagemExterna = loadPerformanceMontagemExterna;
