const GESTAO_RELATORIO_PEDIDOS_PENDENTES_END = 'Montagem Interna';
const GESTAO_RELATORIO_EXPEDICAO_STATUS = 'Expedição';

const GESTAO_RELATORIO_PROJECT_SELECT = `
    id, orderId, projectCode, name, saleValue, deliveryDate, internalAssemblyEndDate, productionMonth, statusId,
    deliveryPhaseId, isComplementary, parentProjectId,
    isReplacement, replacesProjectId,
    replaces:replacesProjectId(projectCode, saleValue, order:salesOrders(orderCode)),
    parentProject:parentProjectId(id, deliveryPhaseId),
    order:salesOrders(${getSalesOrderMinimalEmbedSelect('clientDeliveryDate')}),
    projectStatus:OrderProjectStatus(id, name, sortOrder)
`;

const GESTAO_RELATORIO_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, saleValue, deliveryDate, statusId,
    deliveryPhaseId, isComplementary, parentProjectId,
    isReplacement, replacesProjectId,
    order:salesOrders(${getSalesOrderMinimalEmbedSelect('clientDeliveryDate')}),
    projectStatus:OrderProjectStatus(id, name)
`;

const GESTAO_PIE_PALETTE = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6', '#64748b', '#f59e0b', '#10b981',
    '#84cc16', '#0ea5e9', '#7c3aed'
];

function getGestaoRelatorioProjectLabel(project) {
    const code = project.projectCode ? `${project.projectCode} · ` : '';
    const env = project.environmentType?.name ? ` (${project.environmentType.name})` : '';
    return `${code}${project.name || '—'}${env}`;
}

function getGestaoRelatorioStatusName(project) {
    return project?.projectStatus?.name || '';
}

function getGestaoRelatorioStatusSortOrder(project, statusById = {}) {
    const fromJoin = project?.projectStatus?.sortOrder;
    if (fromJoin != null) return Number(fromJoin);
    const status = statusById[project?.statusId];
    return status?.sortOrder != null ? Number(status.sortOrder) : 9999;
}

async function fetchGestaoRelatorioProjects() {
    let result = await supabaseClient
        .from('OrderProject')
        .select(GESTAO_RELATORIO_PROJECT_SELECT)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('projectStatus')
        || result.error?.message?.includes('sortOrder')
        || result.error?.message?.includes('internalAssemblyEndDate')
        || result.error?.message?.includes('productionMonth')
        || result.error?.message?.includes('clientDeliveryDate')
        || result.error?.message?.includes('deliveryPhaseId')
        || result.error?.message?.includes('isComplementary')
        || result.error?.message?.includes('parentProjectId')
        || result.error?.message?.includes('parentProject')
        || result.error?.message?.includes('substitui')
        || result.error?.message?.includes('isReplacement')
        || result.error?.message?.includes('replacesProjectId')) {
        result = await supabaseClient
            .from('OrderProject')
            .select(GESTAO_RELATORIO_PROJECT_SELECT_FALLBACK)
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

async function fetchGestaoRelatorioMeasurementDates(projectIds) {
    const normalizedIds = [...new Set(projectIds.map(id => Number(id)).filter(Boolean))];
    if (!normalizedIds.length) return {};

    const { data, error } = await supabaseClient
        .from('MeasurementProject')
        .select('orderProjectId, measurementDate')
        .in('orderProjectId', normalizedIds);

    if (error) {
        console.error('fetchGestaoRelatorioMeasurementDates:', error);
        return {};
    }

    const latestByProjectId = {};
    (data || []).forEach(row => {
        const projectId = Number(row.orderProjectId);
        const measurementDate = row.measurementDate;
        if (!projectId || !measurementDate) return;

        const current = latestByProjectId[projectId];
        if (!current || String(measurementDate) > String(current)) {
            latestByProjectId[projectId] = measurementDate;
        }
    });

    return latestByProjectId;
}

function enrichGestaoRelatorioProjectsWithMeasurementDates(projects, measurementByProjectId) {
    return (projects || []).map(project => ({
        ...project,
        measurementDate: measurementByProjectId[Number(project.id)] || null
    }));
}

async function enrichGestaoRelatorioProjectsWithSubstituicaoValues(projects) {
    const list = projects || [];
    const needsEnrich = list.filter(project => {
        if (!Number(project.replacesProjectId)) return false;
        if (project.replacesProject?.saleValue != null && project.replacesProject.saleValue !== '') return false;
        if (project.replacesOriginalSaleValue != null && project.replacesOriginalSaleValue !== '') return false;
        return true;
    });

    if (!needsEnrich.length) {
        return list.map(project => (
            project.replacesProjectId && !isReplacementOrderProject(project)
                ? { ...project, isReplacement: true }
                : project
        ));
    }

    const originalIds = [...new Set(needsEnrich.map(project => Number(project.replacesProjectId)).filter(Boolean))];
    const selectVariants = [
        'id, projectCode, saleValue, order:salesOrders(orderCode)',
        'id, projectCode, saleValue',
        'id, saleValue'
    ];

    let originals = [];
    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .in('id', originalIds);

        if (!error) {
            originals = data || [];
            break;
        }
    }

    const originalById = Object.fromEntries(originals.map(item => [Number(item.id), item]));

    return list.map(project => {
        const originalId = Number(project.replacesProjectId);
        if (!originalId) return project;

        const original = originalById[originalId];
        const hasOriginalValue = original?.saleValue != null && original.saleValue !== '';
        const alreadyHasValue = project.replacesProject?.saleValue != null && project.replacesProject.saleValue !== ''
            || project.replacesOriginalSaleValue != null && project.replacesOriginalSaleValue !== '';

        if (!hasOriginalValue && !alreadyHasValue) {
            return { ...project, isReplacement: true };
        }

        if (alreadyHasValue) {
            return { ...project, isReplacement: true };
        }

        return {
            ...project,
            isReplacement: true,
            replacesOriginalSaleValue: original.saleValue,
            replacesProject: {
                ...(project.replacesProject || {}),
                id: originalId,
                projectCode: original.projectCode || project.replacesProject?.projectCode || null,
                saleValue: original.saleValue,
                order: original.order || project.replacesProject?.order || null
            }
        };
    });
}

function buildGestaoRelatorioStatusCounts(projects, statuses) {
    const activeStatuses = (statuses || [])
        .filter(status => status.isActive !== false && status.name !== GESTAO_RELATORIO_EXPEDICAO_STATUS)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'pt-BR'));

    const countByStatusId = {};
    (projects || []).forEach(project => {
        if (getGestaoRelatorioStatusName(project) === GESTAO_RELATORIO_EXPEDICAO_STATUS) return;

        const statusId = project.statusId;
        if (!statusId) return;
        countByStatusId[statusId] = (countByStatusId[statusId] || 0) + 1;
    });

    const knownIds = new Set(activeStatuses.map(status => status.id));
    const extras = {};

    (projects || []).forEach(project => {
        if (getGestaoRelatorioStatusName(project) === GESTAO_RELATORIO_EXPEDICAO_STATUS) return;
        if (!project.statusId || knownIds.has(project.statusId)) return;
        const name = getGestaoRelatorioStatusName(project) || 'Sem status';
        extras[name] = (extras[name] || 0) + 1;
    });

    const items = activeStatuses
        .map(status => ({
            statusId: status.id,
            name: status.name,
            sortOrder: status.sortOrder ?? 0,
            count: countByStatusId[status.id] || 0
        }))
        .filter(item => item.count > 0);

    Object.entries(extras).forEach(([name, count]) => {
        items.push({ statusId: null, name, sortOrder: 9999, count });
    });

    return items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
}

function renderGestaoRelatorioPieChart(statusCounts) {
    const total = statusCounts.reduce((sum, item) => sum + item.count, 0);

    if (!total) {
        return '<p class="text-xs text-slate-400 text-center py-6">Nenhum projeto cadastrado.</p>';
    }

    let cumulative = 0;
    const segments = statusCounts.map((item, index) => {
        const pct = (item.count / total) * 100;
        const start = cumulative;
        cumulative += pct;
        const color = GESTAO_PIE_PALETTE[index % GESTAO_PIE_PALETTE.length];
        item.color = color;
        return `${color} ${start.toFixed(2)}% ${cumulative.toFixed(2)}%`;
    });

    const legend = statusCounts.map(item => {
        const pct = ((item.count / total) * 100).toFixed(1);
        const badgeClass = typeof getOrderProjectStatusBadgeClass === 'function'
            ? getOrderProjectStatusBadgeClass(item.name)
            : 'bg-slate-100 text-slate-700';

        return `
            <li class="flex items-center justify-between gap-3 text-xs">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${item.color}"></span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase truncate ${badgeClass}">
                        ${escapeHtml(item.name)}
                    </span>
                </div>
                <span class="text-slate-600 whitespace-nowrap font-medium">${item.count} <span class="text-slate-400">(${pct}%)</span></span>
            </li>
        `;
    }).join('');

    return `
        <div class="flex flex-col md:flex-row md:items-start gap-6 w-full">
            <div class="relative w-44 h-44 shrink-0 mx-auto md:mx-0">
                <div class="w-full h-full rounded-full border border-slate-200 shadow-inner"
                    style="background: conic-gradient(${segments.join(', ')});"></div>
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div class="w-20 h-20 rounded-full bg-white border border-slate-100 flex flex-col items-center justify-center text-center px-2">
                        <span class="text-lg font-bold text-slate-800 leading-none">${total}</span>
                        <span class="text-[9px] uppercase tracking-wide text-slate-400 mt-0.5">projetos</span>
                    </div>
                </div>
            </div>
            <ul class="flex-1 w-full space-y-2 max-h-64 overflow-y-auto pr-1">${legend}</ul>
        </div>
    `;
}

function getGestaoRelatorioPedidosPendentesMaxSort(statuses) {
    const endStatus = statuses.find(status => status.name === GESTAO_RELATORIO_PEDIDOS_PENDENTES_END);
    return endStatus?.sortOrder != null ? Number(endStatus.sortOrder) : null;
}

function filterGestaoRelatorioPedidosPendentesProjects(projects, statuses) {
    const maxSort = getGestaoRelatorioPedidosPendentesMaxSort(statuses);
    if (maxSort == null) return [];

    const statusById = Object.fromEntries(statuses.map(status => [status.id, status]));

    return projects.filter(project => {
        const sortOrder = getGestaoRelatorioStatusSortOrder(project, statusById);
        return sortOrder <= maxSort;
    });
}

function buildGestaoRelatorioProjectsById(projects) {
    return Object.fromEntries((projects || []).map(project => [Number(project.id), project]));
}

function getGestaoRelatorioOrderPhases(orderId, phasesByOrderId = {}) {
    return phasesByOrderId[Number(orderId)] || [];
}

function getGestaoRelatorioPedidosPendentesSourceProject(project, projectsById = {}) {
    if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) {
        const parentId = Number(project.parentProjectId || project.parentProject?.id);
        if (parentId && projectsById[parentId]) {
            return projectsById[parentId];
        }
    }
    return project;
}

function getGestaoRelatorioPedidosPendentesProjectDeliveryDate(project, context = {}) {
    const phasesByOrderId = context.phasesByOrderId || {};
    const projectsById = context.projectsById || {};
    const sourceProject = getGestaoRelatorioPedidosPendentesSourceProject(project, projectsById);
    const phases = getGestaoRelatorioOrderPhases(sourceProject.orderId, phasesByOrderId);

    if (phases.length >= 2) {
        const projectPhaseId = Number(sourceProject.deliveryPhaseId);
        const phase = projectPhaseId
            ? phases.find(item => Number(item.id) === projectPhaseId)
            : phases[0];
        if (phase?.deliveryDate) return phase.deliveryDate;
    }

    return sourceProject.order?.clientDeliveryDate
        || project.order?.clientDeliveryDate
        || sourceProject.deliveryDate
        || project.deliveryDate
        || null;
}

function compareGestaoRelatorioProjectsByDeliveryDate(a, b, context = {}) {
    const dateA = getGestaoRelatorioPedidosPendentesProjectDeliveryDate(a, context) || '';
    const dateB = getGestaoRelatorioPedidosPendentesProjectDeliveryDate(b, context) || '';
    const dateCompare = String(dateA).localeCompare(String(dateB));
    if (dateCompare !== 0) return dateCompare;

    const codeCompare = String(a.order?.orderCode || '').localeCompare(
        String(b.order?.orderCode || ''),
        'pt-BR',
        { numeric: true }
    );
    if (codeCompare !== 0) return codeCompare;

    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
}

function sortGestaoRelatorioProjectsByDeliveryDate(projects, context = {}) {
    return [...(projects || [])].sort((a, b) => compareGestaoRelatorioProjectsByDeliveryDate(a, b, context));
}

function isGestaoRelatorioPedidosPendentesComplementaryProject(project) {
    return typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project);
}

function getGestaoRelatorioPedidosPendentesOrderGroupKeys(project, context = {}, options = {}) {
    const resolveReferenceDate = typeof options.getProjectReferenceDate === 'function'
        ? options.getProjectReferenceDate
        : getGestaoRelatorioPedidosPendentesProjectDeliveryDate;
    const resolveOrderDeliveryDate = typeof options.getOrderDisplayDeliveryDate === 'function'
        ? options.getOrderDisplayDeliveryDate
        : getGestaoRelatorioPedidosPendentesProjectDeliveryDate;
    const referenceDate = resolveReferenceDate(project, context);
    const deliveryDate = resolveOrderDeliveryDate(project, context);
    const clientName = getOrderClientName(project.order)?.trim() || 'Sem cliente';
    const orderId = Number(project.orderId);

    return {
        monthKey: getGestaoRelatorioMonthKey(referenceDate),
        clientKey: clientName.toLocaleLowerCase('pt-BR'),
        clientName,
        orderId,
        orderKey: `${orderId}::${deliveryDate || 'sem-data'}`,
        deliveryDate
    };
}

function getGestaoRelatorioPedidosPendentesOrderGroup(
    monthGroups,
    { monthKey, clientKey, clientName, orderId, orderKey, deliveryDate },
    project
) {
    if (!monthGroups[monthKey]) {
        monthGroups[monthKey] = { monthKey, clientsByKey: {} };
    }

    if (!monthGroups[monthKey].clientsByKey[clientKey]) {
        monthGroups[monthKey].clientsByKey[clientKey] = {
            clientName,
            ordersById: {}
        };
    }

    if (!monthGroups[monthKey].clientsByKey[clientKey].ordersById[orderKey]) {
        monthGroups[monthKey].clientsByKey[clientKey].ordersById[orderKey] = {
            orderId,
            order: project.order || {},
            clientDeliveryDate: deliveryDate,
            projects: [],
            complementarProjects: []
        };
    }

    return monthGroups[monthKey].clientsByKey[clientKey].ordersById[orderKey];
}

function buildGestaoRelatorioPedidosPendentesProjectTree(parentProjects, complementarProjects, projectsById = {}, options = {}) {
    const context = options.context || { projectsById };
    const sortParents = options.sortByDeliveryDate
        ? (a, b) => compareGestaoRelatorioProjectsByDeliveryDate(a, b, context)
        : (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');

    const complementarByParentId = {};
    const parentIdsInList = new Set(parentProjects.map(project => Number(project.id)));

    (complementarProjects || []).forEach(project => {
        const parentId = Number(project.parentProjectId || project.parentProject?.id);
        if (!parentId) return;
        if (!complementarByParentId[parentId]) complementarByParentId[parentId] = [];
        complementarByParentId[parentId].push(project);
    });

    Object.values(complementarByParentId).forEach(children => {
        children.sort((a, b) => {
            if (options.sortByDeliveryDate) {
                return compareGestaoRelatorioProjectsByDeliveryDate(a, b, context);
            }
            return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
        });
    });

    const extraParentIds = Object.keys(complementarByParentId)
        .map(Number)
        .filter(parentId => parentId && !parentIdsInList.has(parentId) && projectsById[parentId]);

    const allParents = [...parentProjects, ...extraParentIds.map(parentId => projectsById[parentId])]
        .sort(sortParents);

    return allParents.map(project => ({
        project,
        children: complementarByParentId[Number(project.id)] || [],
        parentPending: parentIdsInList.has(Number(project.id))
    }));
}

function countGestaoRelatorioPedidosPendentesOrderProjects(projectTree) {
    return (projectTree || []).filter(entry => entry.parentPending || (entry.children || []).length > 0).length;
}

function groupGestaoRelatorioPedidosPendentesByMonthAndClient(projects, context = {}, options = {}) {
    const monthGroups = {};
    const parentProjects = [];
    const complementarProjects = [];

    (projects || []).forEach(project => {
        if (isGestaoRelatorioPedidosPendentesComplementaryProject(project)) {
            complementarProjects.push(project);
            return;
        }
        parentProjects.push(project);
    });

    parentProjects.forEach(project => {
        const keys = getGestaoRelatorioPedidosPendentesOrderGroupKeys(project, context, options);
        if (!keys.orderId) return;

        const orderGroup = getGestaoRelatorioPedidosPendentesOrderGroup(monthGroups, keys, project);
        orderGroup.projects.push(project);
    });

    complementarProjects.forEach(project => {
        const keys = getGestaoRelatorioPedidosPendentesOrderGroupKeys(project, context, options);
        if (!keys.orderId) return;

        const orderGroup = getGestaoRelatorioPedidosPendentesOrderGroup(monthGroups, keys, project);
        orderGroup.complementarProjects.push(project);
    });

    return Object.values(monthGroups)
        .sort((a, b) => {
            if (a.monthKey === 'sem-data') return 1;
            if (b.monthKey === 'sem-data') return -1;
            return a.monthKey.localeCompare(b.monthKey);
        })
        .map(monthGroup => {
            const clients = Object.values(monthGroup.clientsByKey)
                .map(clientGroup => {
                    const orders = Object.values(clientGroup.ordersById)
                        .map(orderGroup => {
                            const projectTree = buildGestaoRelatorioPedidosPendentesProjectTree(
                                orderGroup.projects,
                                orderGroup.complementarProjects,
                                context.projectsById || {},
                                {
                                    sortByDeliveryDate: options.sortByDeliveryDate,
                                    context
                                }
                            );
                            const valueProjects = [
                                ...orderGroup.projects,
                                ...(orderGroup.complementarProjects || [])
                            ];

                            return {
                                ...orderGroup,
                                projectTree,
                                projectCount: countGestaoRelatorioPedidosPendentesOrderProjects(projectTree),
                                totalSaleValue: sumGestaoRelatorioSaleValues(valueProjects)
                            };
                        })
                        .sort((a, b) => {
                            if (options.sortByDeliveryDate) {
                                const dateCompare = String(a.clientDeliveryDate || '').localeCompare(String(b.clientDeliveryDate || ''));
                                if (dateCompare !== 0) return dateCompare;
                            }
                            return String(a.order?.orderCode || '').localeCompare(
                                String(b.order?.orderCode || ''),
                                'pt-BR',
                                { numeric: true }
                            );
                        });

                    return {
                        clientName: clientGroup.clientName,
                        orders,
                        orderCount: orders.length,
                        projectCount: orders.reduce((sum, order) => sum + order.projectCount, 0),
                        totalSaleValue: orders.reduce((sum, order) => sum + order.totalSaleValue, 0)
                    };
                })
                .sort((a, b) => a.clientName.localeCompare(b.clientName, 'pt-BR'));

            const orders = clients.flatMap(client => client.orders);

            return {
                monthKey: monthGroup.monthKey,
                clients,
                orderCount: orders.length,
                projectCount: orders.reduce((sum, order) => sum + order.projectCount, 0),
                totalSaleValue: orders.reduce((sum, order) => sum + order.totalSaleValue, 0)
            };
        });
}

function renderGestaoRelatorioPedidosPendentesProjectRow(project, options = {}) {
    const { nested = false, parentOnly = false } = options;
    const statusName = getGestaoRelatorioStatusName(project);
    const statusClass = typeof getOrderProjectStatusBadgeClass === 'function'
        ? getOrderProjectStatusBadgeClass(statusName)
        : 'bg-slate-100 text-slate-700';
    const saleValue = typeof formatSaleValue === 'function'
        ? formatSaleValue(getProjectEffectiveSaleValue(project))
        : (getProjectEffectiveSaleValue(project) ?? '—');
    const labelPrefix = nested ? '↳ ' : '';
    const cellPadding = nested ? 'p-2 pl-8' : 'p-2 pl-6';
    const rowClass = nested
        ? 'border-b border-slate-50 last:border-0 bg-slate-50/20'
        : 'border-b border-slate-50 last:border-0 bg-slate-50/40';

    return `
        <tr class="${rowClass}">
            <td class="${cellPadding} text-xs ${nested ? 'text-slate-600' : 'text-slate-700'}">${escapeHtml(`${labelPrefix}${getGestaoRelatorioProjectLabel(project)}`)}</td>
            <td class="p-2">
                ${parentOnly ? '<span class="text-[10px] text-slate-400">—</span>' : `
                <span class="inline-flex text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">
                    ${escapeHtml(statusName || '—')}
                </span>`}
            </td>
            <td class="p-2 text-xs text-slate-600 text-right">${parentOnly ? '<span class="text-slate-400">—</span>' : escapeHtml(saleValue)}</td>
        </tr>
    `;
}

function renderGestaoRelatorioPedidosPendentesProjectTreeRows(projectTree) {
    return (projectTree || []).map(({ project, children, parentPending }) => {
        const parentRow = parentPending
            ? renderGestaoRelatorioPedidosPendentesProjectRow(project)
            : renderGestaoRelatorioPedidosPendentesProjectRow(project, { parentOnly: true });
        const childRows = (children || [])
            .map(child => renderGestaoRelatorioPedidosPendentesProjectRow(child, { nested: true }))
            .join('');

        return `${parentRow}${childRows}`;
    }).join('');
}

function renderGestaoRelatorioPedidosPendentesOrderRow(orderGroup) {
    const orderCode = orderGroup.order?.orderCode || '—';
    const deliveryDate = typeof formatGestaoDate === 'function'
        ? formatGestaoDate(orderGroup.clientDeliveryDate)
        : (orderGroup.clientDeliveryDate || '—');
    const totalLabel = typeof formatSaleValue === 'function'
        ? formatSaleValue(orderGroup.totalSaleValue)
        : orderGroup.totalSaleValue;
    const projectCount = orderGroup.projectCount ?? (orderGroup.projects || []).length;
    const projectRows = renderGestaoRelatorioPedidosPendentesProjectTreeRows(orderGroup.projectTree);

    return `
        <tbody class="border-b border-slate-100 last:border-0">
            <tr class="bg-white">
                <td class="p-2.5 text-xs font-mono font-bold text-slate-800">${escapeHtml(orderCode)}</td>
                <td class="p-2.5 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-2.5 text-xs text-slate-500">${projectCount} projeto${projectCount === 1 ? '' : 's'}</td>
                <td class="p-2.5 text-xs text-slate-800 text-right font-semibold">${escapeHtml(totalLabel)}</td>
            </tr>
            ${projectRows}
        </tbody>
    `;
}

function getGestaoRelatorioPedidosPendentesClientDeliveryDatesLabel(clientGroup) {
    const dates = (clientGroup.orders || [])
        .map(orderGroup => orderGroup.clientDeliveryDate)
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b)));

    const uniqueDates = [...new Set(dates)];
    if (!uniqueDates.length) return '';

    return uniqueDates
        .map(date => (typeof formatGestaoDate === 'function' ? formatGestaoDate(date) : date))
        .join(' · ');
}

function renderGestaoRelatorioPedidosPendentesClientGroup(clientGroup) {
    const totalLabel = typeof formatSaleValue === 'function'
        ? formatSaleValue(clientGroup.totalSaleValue)
        : clientGroup.totalSaleValue;
    const orderDatesLabel = getGestaoRelatorioPedidosPendentesClientDeliveryDatesLabel(clientGroup);

    return `
        <div class="collapsible-list-card border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div class="collapsible-list-header px-3 py-2 bg-white border-b border-slate-100 cursor-pointer flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                        aria-label="Expandir">▶</button>
                    <span class="text-xs font-medium text-slate-800 truncate">${escapeHtml(clientGroup.clientName)}</span>
                    ${orderDatesLabel ? `<span class="text-[10px] text-slate-500 shrink-0 whitespace-nowrap">${escapeHtml(orderDatesLabel)}</span>` : ''}
                    <span class="text-[10px] text-slate-500 shrink-0">${clientGroup.orderCount} pedido${clientGroup.orderCount === 1 ? '' : 's'}</span>
                    <span class="text-[10px] text-slate-500 shrink-0">${clientGroup.projectCount} projeto${clientGroup.projectCount === 1 ? '' : 's'}</span>
                </div>
                <span class="text-xs font-semibold text-indigo-700 shrink-0">${escapeHtml(totalLabel)}</span>
            </div>
            <div class="collapsible-list-body hidden p-2">
                <div class="overflow-x-auto">
                    <table class="gestao-relatorios-table w-full text-xs min-w-[32rem]">
                        <thead class="bg-slate-50 text-[10px] uppercase text-slate-400">
                            <tr>
                                <th class="text-left p-2.5 font-semibold">Pedido</th>
                                <th class="text-left p-2.5 font-semibold">Entrega</th>
                                <th class="text-left p-2.5 font-semibold">Projetos</th>
                                <th class="text-right p-2.5 font-semibold">Valor pedido</th>
                            </tr>
                        </thead>
                        ${clientGroup.orders.map(renderGestaoRelatorioPedidosPendentesOrderRow).join('')}
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderGestaoRelatorioPedidosPendentesGroups(groups, options = {}) {
    const emptyMonthLabel = options.emptyMonthLabel || 'Sem data de entrega do pedido';
    if (!groups.length) {
        return '<p class="text-xs text-slate-400 text-center py-4">Nenhum pedido pendente encontrado.</p>';
    }

    return groups.map(monthGroup => {
        const totalLabel = typeof formatSaleValue === 'function'
            ? formatSaleValue(monthGroup.totalSaleValue)
            : monthGroup.totalSaleValue;

        return `
            <div class="collapsible-list-card border border-indigo-100 rounded-lg overflow-hidden bg-indigo-50/20">
                <div class="collapsible-list-header px-3 py-2.5 bg-indigo-50/80 border-b border-indigo-100 cursor-pointer flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-indigo-700 hover:text-indigo-900 text-[10px]"
                            aria-label="Expandir">▶</button>
                        <span class="text-xs font-semibold text-slate-900">${escapeHtml(formatGestaoRelatorioMonthLabel(monthGroup.monthKey, emptyMonthLabel))}</span>
                        <span class="text-[10px] text-slate-500 shrink-0">${monthGroup.clients.length} cliente${monthGroup.clients.length === 1 ? '' : 's'}</span>
                        <span class="text-[10px] text-slate-500 shrink-0">${monthGroup.orderCount} pedido${monthGroup.orderCount === 1 ? '' : 's'}</span>
                        <span class="text-[10px] text-slate-500 shrink-0">${monthGroup.projectCount} projeto${monthGroup.projectCount === 1 ? '' : 's'}</span>
                    </div>
                    <span class="text-xs font-bold text-indigo-700 shrink-0">${escapeHtml(totalLabel)}</span>
                </div>
                <div class="collapsible-list-body hidden p-2 space-y-2">
                    ${monthGroup.clients.map(renderGestaoRelatorioPedidosPendentesClientGroup).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function getGestaoRelatorioMonthKey(dateStr) {
    if (!dateStr) return 'sem-data';
    const part = String(dateStr).split('T')[0];
    const [year, month] = part.split('-');
    if (!year || !month) return 'sem-data';
    return `${year}-${month}`;
}

function formatGestaoRelatorioMonthLabel(monthKey, emptyLabel = 'Sem fim de montagem interna') {
    if (monthKey === 'sem-data') return emptyLabel;

    const [year, month] = monthKey.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function sumGestaoRelatorioSaleValues(projects) {
    return projects.reduce((sum, project) => {
        const value = typeof getProjectEffectiveSaleValue === 'function'
            ? getProjectEffectiveSaleValue(project)
            : Number(project.saleValue);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
}

// Já produzido: prioriza a data fim da montagem interna; senão, o mês programado.
function getGestaoRelatorioFechamentoProducaoProjectMonthKey(project) {
    return getGestaoRelatorioMonthKey(project?.internalAssemblyEndDate || project?.productionMonth);
}

function getGestaoRelatorioFechamentoProducaoTotals(projects) {
    const fechamentoProjects = (projects || []).filter(project =>
        getGestaoRelatorioStatusName(project) === GESTAO_RELATORIO_EXPEDICAO_STATUS
    );

    return {
        projectCount: fechamentoProjects.length,
        totalSaleValue: sumGestaoRelatorioSaleValues(fechamentoProjects)
    };
}

function renderGestaoRelatorioFechamentoProducaoTotalsLine(totals = {}) {
    const projectCount = Number(totals.projectCount) || 0;
    const totalLabel = typeof formatSaleValue === 'function'
        ? formatSaleValue(totals.totalSaleValue || 0)
        : (totals.totalSaleValue || 0);

    return `
        <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 mb-2 rounded-lg border border-emerald-100 bg-emerald-50/60">
            <div class="min-w-0">
                <span class="text-xs font-semibold text-slate-800">Já produzidos</span>
                <p class="text-[10px] text-slate-400 mt-0.5">Mesmo total do relatório Fechamento Produção (projetos em ${escapeHtml(GESTAO_RELATORIO_EXPEDICAO_STATUS)}).</p>
            </div>
            <div class="flex items-center gap-3 shrink-0">
                <span class="text-[10px] text-slate-500">${projectCount} projeto${projectCount === 1 ? '' : 's'}</span>
                <span class="text-xs font-bold text-emerald-700">${escapeHtml(totalLabel)}</span>
            </div>
        </div>
    `;
}

async function loadGestaoRelatorioFechamentoProducaoProjects() {
    const { data: projects, error } = await fetchGestaoRelatorioProjects();
    if (error) throw error;

    let enrichedProjects = projects || [];
    if (typeof enrichGestaoRelatorioProjectsWithSubstituicaoValues === 'function') {
        enrichedProjects = await enrichGestaoRelatorioProjectsWithSubstituicaoValues(enrichedProjects);
    }

    return enrichedProjects.filter(project =>
        getGestaoRelatorioStatusName(project) === GESTAO_RELATORIO_EXPEDICAO_STATUS
    );
}

async function loadGestaoRelatorioFechamentoProducaoTotals() {
    const fechamentoProjects = await loadGestaoRelatorioFechamentoProducaoProjects();
    return getGestaoRelatorioFechamentoProducaoTotals(fechamentoProjects);
}

async function loadGestaoRelatorioFechamentoProducaoMonthGroups(options = {}) {
    const fechamentoProjects = await loadGestaoRelatorioFechamentoProducaoProjects();
    return groupGestaoRelatorioFechamentoProducaoByMonthAndClient(fechamentoProjects, options);
}

function sortGestaoRelatorioFechamentoProducaoProjects(projects) {
    return [...projects].sort((a, b) => {
        const fimA = a.internalAssemblyEndDate || '';
        const fimB = b.internalAssemblyEndDate || '';
        return String(fimB).localeCompare(String(fimA))
            || String(a.order?.orderCode || '').localeCompare(String(b.order?.orderCode || ''), 'pt-BR', { numeric: true })
            || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });
}

function groupGestaoRelatorioFechamentoProducaoByMonthAndClient(projects, options = {}) {
    const getMonthKey = typeof options.getMonthKey === 'function'
        ? options.getMonthKey
        : (project) => getGestaoRelatorioMonthKey(project.internalAssemblyEndDate);
    const sortDescending = options.sortDescending !== false;
    const context = {
        phasesByOrderId: options.phasesByOrderId || {},
        projectsById: options.projectsById || buildGestaoRelatorioProjectsById(projects)
    };
    const monthGroups = {};

    projects.forEach(project => {
        const monthKey = getMonthKey(project);
        const clientName = getOrderClientName(project.order)?.trim() || 'Sem cliente';
        const clientKey = clientName.toLocaleLowerCase('pt-BR');

        if (!monthGroups[monthKey]) {
            monthGroups[monthKey] = { monthKey, clientsByKey: {} };
        }

        if (!monthGroups[monthKey].clientsByKey[clientKey]) {
            monthGroups[monthKey].clientsByKey[clientKey] = { clientName, projects: [] };
        }

        monthGroups[monthKey].clientsByKey[clientKey].projects.push(project);
    });

    return Object.values(monthGroups)
        .sort((a, b) => {
            if (a.monthKey === 'sem-data') return 1;
            if (b.monthKey === 'sem-data') return -1;
            if (sortDescending) return b.monthKey.localeCompare(a.monthKey);
            return a.monthKey.localeCompare(b.monthKey);
        })
        .map(monthGroup => {
            const clients = Object.values(monthGroup.clientsByKey)
                .sort((a, b) => a.clientName.localeCompare(b.clientName, 'pt-BR'))
                .map(clientGroup => ({
                    ...clientGroup,
                    projects: options.sortByDeliveryDate
                        ? sortGestaoRelatorioProjectsByDeliveryDate(clientGroup.projects, context)
                        : sortGestaoRelatorioFechamentoProducaoProjects(clientGroup.projects),
                    totalSaleValue: sumGestaoRelatorioSaleValues(clientGroup.projects)
                }));

            const projects = clients.flatMap(client => client.projects);

            return {
                monthKey: monthGroup.monthKey,
                clients,
                projectCount: projects.length,
                totalSaleValue: sumGestaoRelatorioSaleValues(projects)
            };
        });
}

function renderGestaoRelatorioFechamentoProducaoProjectRow(project) {
    const orderCode = project.order?.orderCode || '—';
    const fimMontagem = typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.internalAssemblyEndDate)
        : (project.internalAssemblyEndDate || '—');
    const saleValue = typeof formatSaleValue === 'function'
        ? formatSaleValue(getProjectEffectiveSaleValue(project))
        : (getProjectEffectiveSaleValue(project) ?? '—');

    return `
        <tr class="border-b border-slate-100 last:border-0">
            <td class="p-2.5 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
            <td class="p-2.5 text-xs font-medium text-slate-800">${escapeHtml(getGestaoRelatorioProjectLabel(project))}</td>
            <td class="p-2.5 text-xs text-slate-500 whitespace-nowrap">${escapeHtml(fimMontagem)}</td>
            <td class="p-2.5 text-xs text-slate-700 whitespace-nowrap text-right font-medium">${escapeHtml(saleValue)}</td>
        </tr>
    `;
}

function renderGestaoRelatorioFechamentoProducaoClientGroup(clientGroup) {
    const totalLabel = typeof formatSaleValue === 'function'
        ? formatSaleValue(clientGroup.totalSaleValue)
        : clientGroup.totalSaleValue;

    return `
        <div class="collapsible-list-card border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div class="collapsible-list-header px-3 py-2 bg-white border-b border-slate-100 cursor-pointer flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                        aria-label="Expandir">▶</button>
                    <span class="text-xs font-medium text-slate-800 truncate">${escapeHtml(clientGroup.clientName)}</span>
                    <span class="text-[10px] text-slate-500 shrink-0">${clientGroup.projects.length} projeto${clientGroup.projects.length === 1 ? '' : 's'}</span>
                </div>
                <span class="text-xs font-semibold text-emerald-700 shrink-0">${escapeHtml(totalLabel)}</span>
            </div>
            <div class="collapsible-list-body hidden p-2">
                <div class="overflow-x-auto">
                    <table class="gestao-relatorios-table w-full text-xs min-w-[32rem]">
                        <thead class="bg-slate-50 text-[10px] uppercase text-slate-400">
                            <tr>
                                <th class="text-left p-2.5 font-semibold">Pedido</th>
                                <th class="text-left p-2.5 font-semibold">Projeto</th>
                                <th class="text-left p-2.5 font-semibold">Fim mont. interna</th>
                                <th class="text-right p-2.5 font-semibold">Valor</th>
                            </tr>
                        </thead>
                        <tbody>${clientGroup.projects.map(renderGestaoRelatorioFechamentoProducaoProjectRow).join('')}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderGestaoRelatorioFechamentoProducaoGroups(groups) {
    if (!groups.length) {
        return '<p class="text-xs text-slate-400 text-center py-4">Nenhum projeto em expedição para fechamento.</p>';
    }

    return groups.map(monthGroup => {
        const totalLabel = typeof formatSaleValue === 'function'
            ? formatSaleValue(monthGroup.totalSaleValue)
            : monthGroup.totalSaleValue;

        return `
            <div class="collapsible-list-card border border-emerald-100 rounded-lg overflow-hidden bg-emerald-50/20">
                <div class="collapsible-list-header px-3 py-2.5 bg-emerald-50/80 border-b border-emerald-100 cursor-pointer flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-emerald-700 hover:text-emerald-900 text-[10px]"
                            aria-label="Expandir">▶</button>
                        <span class="text-xs font-semibold text-slate-900">${escapeHtml(formatGestaoRelatorioMonthLabel(monthGroup.monthKey))}</span>
                        <span class="text-[10px] text-slate-500 shrink-0">${monthGroup.clients.length} cliente${monthGroup.clients.length === 1 ? '' : 's'}</span>
                        <span class="text-[10px] text-slate-500 shrink-0">${monthGroup.projectCount} projeto${monthGroup.projectCount === 1 ? '' : 's'}</span>
                    </div>
                    <span class="text-xs font-bold text-emerald-700 shrink-0">${escapeHtml(totalLabel)}</span>
                </div>
                <div class="collapsible-list-body hidden p-2 space-y-2">
                    ${monthGroup.clients.map(renderGestaoRelatorioFechamentoProducaoClientGroup).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function renderGestaoRelatoriosPanel(projects, statuses, pedidosPendentesContext = {}) {
    const content = document.getElementById('gestao-relatorios-content');
    if (!content) return;

    const statusCounts = buildGestaoRelatorioStatusCounts(projects, statuses);
    const pedidosPendentesProjects = filterGestaoRelatorioPedidosPendentesProjects(projects, statuses);
    const pedidosPendentesGroups = groupGestaoRelatorioPedidosPendentesByMonthAndClient(
        pedidosPendentesProjects,
        pedidosPendentesContext
    );
    const pedidosPendentesGrandTotal = pedidosPendentesGroups.reduce((sum, group) => sum + group.totalSaleValue, 0);
    const pedidosPendentesGrandTotalLabel = typeof formatSaleValue === 'function'
        ? formatSaleValue(pedidosPendentesGrandTotal)
        : pedidosPendentesGrandTotal;
    const fechamentoProjects = projects.filter(project =>
        getGestaoRelatorioStatusName(project) === GESTAO_RELATORIO_EXPEDICAO_STATUS
    );
    const fechamentoGroups = groupGestaoRelatorioFechamentoProducaoByMonthAndClient(fechamentoProjects);
    const fechamentoTotals = getGestaoRelatorioFechamentoProducaoTotals(projects);
    const fechamentoGrandTotalLabel = typeof formatSaleValue === 'function'
        ? formatSaleValue(fechamentoTotals.totalSaleValue)
        : fechamentoTotals.totalSaleValue;

    content.innerHTML = `
        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h4 class="text-sm font-bold text-slate-900">Projetos por status</h4>
                <p class="text-xs text-slate-400 mt-0.5">Distribuição atual de todos os projetos.</p>
            </div>
            <div class="p-4">${renderGestaoRelatorioPieChart(statusCounts)}</div>
        </section>

        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h4 class="text-sm font-bold text-slate-900">Pedidos Pendentes</h4>
                    <p class="text-xs text-slate-400 mt-0.5">Projetos em todos os status até ${escapeHtml(GESTAO_RELATORIO_PEDIDOS_PENDENTES_END)}, agrupados pelo mês de entrega (fase do pedido ou data do cliente) e, dentro de cada mês, por cliente. Projetos complementares aparecem como filhos do pai e não entram na contagem, mas seu valor compõe o total.</p>
                </div>
                <span class="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">
                    Total: ${escapeHtml(pedidosPendentesGrandTotalLabel)}
                </span>
            </div>
            <div id="gestao-relatorio-pedidos-pendentes-groups" class="p-3 space-y-2">
                ${renderGestaoRelatorioPedidosPendentesGroups(pedidosPendentesGroups)}
            </div>
        </section>

        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h4 class="text-sm font-bold text-slate-900">Fechamento Produção</h4>
                    <p class="text-xs text-slate-400 mt-0.5">Projetos em ${escapeHtml(GESTAO_RELATORIO_EXPEDICAO_STATUS)} agrupados pelo mês do fim da montagem interna e, dentro de cada mês, por cliente.</p>
                </div>
                <span class="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                    Total: ${escapeHtml(fechamentoGrandTotalLabel)}
                </span>
            </div>
            <div id="gestao-relatorio-fechamento-groups" class="p-3 space-y-2">
                ${renderGestaoRelatorioFechamentoProducaoGroups(fechamentoGroups)}
            </div>
        </section>
    `;

    bindCollapsibleListCardToggles(document.getElementById('gestao-relatorio-pedidos-pendentes-groups'), { defaultCollapsed: true });
    bindCollapsibleListCardToggles(document.getElementById('gestao-relatorio-fechamento-groups'), { defaultCollapsed: true });
}

async function loadGestaoRelatorios() {
    const content = document.getElementById('gestao-relatorios-content');
    if (!content) return;

    if (!canAccessGestao()) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Sem permissão para visualizar relatórios.</p>';
        return;
    }

    content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando relatórios...</p>';

    const statuses = typeof loadGestaoProjectStatuses === 'function'
        ? await loadGestaoProjectStatuses(true)
        : [];

    const { data: projects, error } = await fetchGestaoRelatorioProjects();

    if (error) {
        content.innerHTML = `<p class="text-xs text-red-500 text-center py-10">Erro ao carregar relatórios: ${escapeHtml(error.message)}</p>`;
        return;
    }

    const projectList = projects || [];
    const measurementByProjectId = await fetchGestaoRelatorioMeasurementDates(
        projectList.map(project => project.id)
    );
    const enrichedProjects = enrichGestaoRelatorioProjectsWithMeasurementDates(
        projectList,
        measurementByProjectId
    );
    const projectsWithSubstituicaoValues = await enrichGestaoRelatorioProjectsWithSubstituicaoValues(
        enrichedProjects
    );
    const orderIds = [...new Set(
        projectsWithSubstituicaoValues.map(project => Number(project.orderId)).filter(Boolean)
    )];
    let phasesByOrderId = {};

    if (typeof fetchGestaoOrderPhasesByOrderIds === 'function' && orderIds.length) {
        phasesByOrderId = await fetchGestaoOrderPhasesByOrderIds(orderIds);
    }

    const pedidosPendentesContext = {
        phasesByOrderId,
        projectsById: buildGestaoRelatorioProjectsById(projectsWithSubstituicaoValues)
    };

    renderGestaoRelatoriosPanel(projectsWithSubstituicaoValues, statuses || [], pedidosPendentesContext);
}

function bindGestaoRelatoriosEvents() {
    document.getElementById('btn-gestao-relatorios-refresh')?.addEventListener('click', loadGestaoRelatorios);
}

window.filterGestaoRelatorioPedidosPendentesProjects = filterGestaoRelatorioPedidosPendentesProjects;
window.buildGestaoRelatorioProjectsById = buildGestaoRelatorioProjectsById;
window.groupGestaoRelatorioPedidosPendentesByMonthAndClient = groupGestaoRelatorioPedidosPendentesByMonthAndClient;
window.renderGestaoRelatorioPedidosPendentesGroups = renderGestaoRelatorioPedidosPendentesGroups;
window.buildGestaoRelatorioPedidosPendentesProjectTree = buildGestaoRelatorioPedidosPendentesProjectTree;
window.getGestaoRelatorioPedidosPendentesProjectDeliveryDate = getGestaoRelatorioPedidosPendentesProjectDeliveryDate;
window.isGestaoRelatorioPedidosPendentesComplementaryProject = isGestaoRelatorioPedidosPendentesComplementaryProject;
window.getGestaoRelatorioProjectLabel = getGestaoRelatorioProjectLabel;
window.getGestaoRelatorioStatusName = getGestaoRelatorioStatusName;
window.getGestaoRelatorioFechamentoProducaoTotals = getGestaoRelatorioFechamentoProducaoTotals;
window.getGestaoRelatorioFechamentoProducaoProjectMonthKey = getGestaoRelatorioFechamentoProducaoProjectMonthKey;
window.groupGestaoRelatorioFechamentoProducaoByMonthAndClient = groupGestaoRelatorioFechamentoProducaoByMonthAndClient;
window.renderGestaoRelatorioFechamentoProducaoClientGroup = renderGestaoRelatorioFechamentoProducaoClientGroup;
window.formatGestaoRelatorioMonthLabel = formatGestaoRelatorioMonthLabel;
window.loadGestaoRelatorioFechamentoProducaoProjects = loadGestaoRelatorioFechamentoProducaoProjects;
window.loadGestaoRelatorioFechamentoProducaoMonthGroups = loadGestaoRelatorioFechamentoProducaoMonthGroups;
window.renderGestaoRelatorioFechamentoProducaoTotalsLine = renderGestaoRelatorioFechamentoProducaoTotalsLine;
window.loadGestaoRelatorioFechamentoProducaoTotals = loadGestaoRelatorioFechamentoProducaoTotals;
