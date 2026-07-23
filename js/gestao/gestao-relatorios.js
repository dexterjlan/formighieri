const GESTAO_RELATORIO_RANGE_START = 'Medição Realizada';
const GESTAO_RELATORIO_RANGE_END_STATUSES = ['Aguardando Aprovação', 'Em Revisão', 'Em revisão'];
const GESTAO_RELATORIO_EXPEDICAO_STATUS = 'Expedição';

const GESTAO_RELATORIO_PROJECT_SELECT = `
    id, orderId, projectCode, name, saleValue, deliveryDate, fimMontagemInterna, statusId,
    isSubstituicao, substituiProjectId,
    substitui:substituiProjectId(projectCode, saleValue, order:salesOrders(orderCode)),
    order:salesOrders(id, orderCode, clientName, clientDeliveryDate),
    projectStatus:OrderProjectStatus(id, name, sortOrder)
`;

const GESTAO_RELATORIO_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, saleValue, deliveryDate, statusId,
    isSubstituicao, substituiProjectId,
    order:salesOrders(id, orderCode, clientName),
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
        || result.error?.message?.includes('fimMontagemInterna')
        || result.error?.message?.includes('clientDeliveryDate')
        || result.error?.message?.includes('substitui')
        || result.error?.message?.includes('isSubstituicao')
        || result.error?.message?.includes('substituiProjectId')) {
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
        .from('MedicaoProject')
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
        if (!Number(project.substituiProjectId)) return false;
        if (project.substituiProject?.saleValue != null && project.substituiProject.saleValue !== '') return false;
        if (project.substituiOriginalSaleValue != null && project.substituiOriginalSaleValue !== '') return false;
        return true;
    });

    if (!needsEnrich.length) {
        return list.map(project => (
            project.substituiProjectId && !isSubstituicaoOrderProject(project)
                ? { ...project, isSubstituicao: true }
                : project
        ));
    }

    const originalIds = [...new Set(needsEnrich.map(project => Number(project.substituiProjectId)).filter(Boolean))];
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
        const originalId = Number(project.substituiProjectId);
        if (!originalId) return project;

        const original = originalById[originalId];
        const hasOriginalValue = original?.saleValue != null && original.saleValue !== '';
        const alreadyHasValue = project.substituiProject?.saleValue != null && project.substituiProject.saleValue !== ''
            || project.substituiOriginalSaleValue != null && project.substituiOriginalSaleValue !== '';

        if (!hasOriginalValue && !alreadyHasValue) {
            return { ...project, isSubstituicao: true };
        }

        if (alreadyHasValue) {
            return { ...project, isSubstituicao: true };
        }

        return {
            ...project,
            isSubstituicao: true,
            substituiOriginalSaleValue: original.saleValue,
            substituiProject: {
                ...(project.substituiProject || {}),
                id: originalId,
                projectCode: original.projectCode || project.substituiProject?.projectCode || null,
                saleValue: original.saleValue,
                order: original.order || project.substituiProject?.order || null
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

function getGestaoRelatorioRangeBounds(statuses) {
    const startStatus = statuses.find(status => status.name === GESTAO_RELATORIO_RANGE_START);
    const endStatuses = statuses.filter(status => GESTAO_RELATORIO_RANGE_END_STATUSES.includes(status.name));

    const minSort = startStatus?.sortOrder ?? null;
    const maxSort = endStatuses.length
        ? Math.max(...endStatuses.map(status => Number(status.sortOrder) || 0))
        : null;

    return { minSort, maxSort };
}

function filterGestaoRelatorioRangeProjects(projects, statuses) {
    const { minSort, maxSort } = getGestaoRelatorioRangeBounds(statuses);
    if (minSort == null || maxSort == null) return [];

    const statusById = Object.fromEntries(statuses.map(status => [status.id, status]));

    return projects.filter(project => {
        const sortOrder = getGestaoRelatorioStatusSortOrder(project, statusById);
        return sortOrder >= minSort && sortOrder <= maxSort;
    });
}

function getGestaoRelatorioNextMonthKey(referenceDate = new Date()) {
    const nextMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
    const year = nextMonth.getFullYear();
    const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function formatGestaoRelatorioNextMonthLabel(referenceDate = new Date()) {
    return formatGestaoRelatorioMonthLabel(
        getGestaoRelatorioNextMonthKey(referenceDate),
        'Sem data de entrega do pedido'
    );
}

function isGestaoRelatorioPedidosPendentesDeliveryMonth(monthKey, referenceDate = new Date()) {
    if (monthKey === 'sem-data') return true;
    return monthKey <= getGestaoRelatorioNextMonthKey(referenceDate);
}

function filterGestaoRelatorioPedidosPendentesProjects(projects, statuses) {
    const rangeProjects = filterGestaoRelatorioRangeProjects(projects, statuses);

    return rangeProjects.filter(project =>
        isGestaoRelatorioPedidosPendentesDeliveryMonth(
            getGestaoRelatorioMonthKey(project.order?.clientDeliveryDate)
        )
    );
}

function buildGestaoRelatorioOrderProjectCounts(projects) {
    const counts = {};

    (projects || []).forEach(project => {
        const orderId = Number(project.orderId);
        if (!orderId) return;
        counts[orderId] = (counts[orderId] || 0) + 1;
    });

    return counts;
}

function groupGestaoRelatorioPedidosPendentes(projects, allProjects = projects) {
    const orderProjectCounts = buildGestaoRelatorioOrderProjectCounts(allProjects);
    const monthGroups = {};

    projects.forEach(project => {
        const monthKey = getGestaoRelatorioMonthKey(project.order?.clientDeliveryDate);
        const orderId = Number(project.orderId);

        if (!monthGroups[monthKey]) {
            monthGroups[monthKey] = { monthKey, ordersById: {} };
        }

        if (!monthGroups[monthKey].ordersById[orderId]) {
            monthGroups[monthKey].ordersById[orderId] = {
                orderId,
                order: project.order || {},
                clientDeliveryDate: project.order?.clientDeliveryDate || null,
                totalProjectCount: orderProjectCounts[orderId] || 0,
                projects: []
            };
        }

        monthGroups[monthKey].ordersById[orderId].projects.push(project);
    });

    return Object.values(monthGroups)
        .sort((a, b) => {
            if (a.monthKey === 'sem-data') return 1;
            if (b.monthKey === 'sem-data') return -1;
            return a.monthKey.localeCompare(b.monthKey);
        })
        .map(monthGroup => {
            const orders = Object.values(monthGroup.ordersById)
                .sort((a, b) => String(a.order?.orderCode || '').localeCompare(
                    String(b.order?.orderCode || ''),
                    'pt-BR',
                    { numeric: true }
                ))
                .map(orderGroup => ({
                    ...orderGroup,
                    projects: [...orderGroup.projects].sort((a, b) =>
                        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
                    )
                }));

            return {
                monthKey: monthGroup.monthKey,
                orders,
                projectCount: orders.reduce((sum, order) => sum + order.projects.length, 0)
            };
        });
}

function renderGestaoRelatorioPedidosPendentesProjectRow(project) {
    const statusName = getGestaoRelatorioStatusName(project);
    const statusClass = typeof getOrderProjectStatusBadgeClass === 'function'
        ? getOrderProjectStatusBadgeClass(statusName)
        : 'bg-slate-100 text-slate-700';
    const measurementDate = typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.measurementDate)
        : (project.measurementDate || '—');
    const projectDeliveryDate = typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.deliveryDate)
        : (project.deliveryDate || '—');
    const saleValue = typeof formatSaleValue === 'function'
        ? formatSaleValue(getProjectEffectiveSaleValue(project))
        : (getProjectEffectiveSaleValue(project) ?? '—');

    return `
        <tr class="border-b border-slate-100 last:border-0">
            <td class="p-2.5 text-xs font-medium text-slate-800">${escapeHtml(getGestaoRelatorioProjectLabel(project))}</td>
            <td class="p-2.5">
                <span class="inline-flex text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">
                    ${escapeHtml(statusName || '—')}
                </span>
            </td>
            <td class="p-2.5 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(measurementDate)}</td>
            <td class="p-2.5 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(projectDeliveryDate)}</td>
            <td class="p-2.5 text-xs text-slate-700 whitespace-nowrap text-right font-medium">${escapeHtml(saleValue)}</td>
        </tr>
    `;
}

function renderGestaoRelatorioPedidosPendentesOrderGroup(orderGroup) {
    const orderCode = orderGroup.order?.orderCode || '—';
    const clientName = orderGroup.order?.clientName || '—';
    const projectCount = orderGroup.totalProjectCount || orderGroup.projects.length;
    const orderDeliveryDate = typeof formatGestaoDate === 'function'
        ? formatGestaoDate(orderGroup.clientDeliveryDate)
        : (orderGroup.clientDeliveryDate || '—');

    return `
        <div class="collapsible-list-card border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div class="collapsible-list-header px-3 py-2 bg-white border-b border-slate-100 cursor-pointer flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                        aria-label="Expandir">▶</button>
                    <span class="text-xs font-mono font-bold text-slate-700">${escapeHtml(orderCode)}</span>
                    <span class="text-xs text-slate-700 truncate">${escapeHtml(clientName)}</span>
                    <span class="text-[10px] text-slate-500 shrink-0">${projectCount} projeto${projectCount === 1 ? '' : 's'}</span>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-[10px] text-slate-400 uppercase tracking-wide">Entrega pedido</p>
                    <p class="text-xs font-semibold text-slate-700">${escapeHtml(orderDeliveryDate)}</p>
                </div>
            </div>
            <div class="collapsible-list-body hidden p-2">
                <div class="overflow-x-auto">
                    <table class="gestao-relatorios-table w-full text-xs min-w-[36rem]">
                        <thead class="bg-slate-50 text-[10px] uppercase text-slate-400">
                            <tr>
                                <th class="text-left p-2.5 font-semibold">Projeto</th>
                                <th class="text-left p-2.5 font-semibold">Status</th>
                                <th class="text-left p-2.5 font-semibold">Data medição</th>
                                <th class="text-left p-2.5 font-semibold">Entrega projeto</th>
                                <th class="text-right p-2.5 font-semibold">Valor de venda</th>
                            </tr>
                        </thead>
                        <tbody>${orderGroup.projects.map(renderGestaoRelatorioPedidosPendentesProjectRow).join('')}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderGestaoRelatorioPedidosPendentesGroups(groups) {
    if (!groups.length) {
        return `<p class="text-xs text-slate-400 text-center py-4">Nenhum pedido pendente com entrega até ${escapeHtml(formatGestaoRelatorioNextMonthLabel())}.</p>`;
    }

    return groups.map(monthGroup => `
        <div class="collapsible-list-card border border-indigo-100 rounded-lg overflow-hidden bg-indigo-50/20">
            <div class="collapsible-list-header px-3 py-2.5 bg-indigo-50/80 border-b border-indigo-100 cursor-pointer flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-indigo-700 hover:text-indigo-900 text-[10px]"
                        aria-label="Expandir">▶</button>
                    <span class="text-xs font-semibold text-slate-900">${escapeHtml(formatGestaoRelatorioMonthLabel(monthGroup.monthKey, 'Sem data de entrega do pedido'))}</span>
                    <span class="text-[10px] text-slate-500 shrink-0">${monthGroup.orders.length} pedido${monthGroup.orders.length === 1 ? '' : 's'}</span>
                </div>
                <span class="text-[10px] text-slate-500 shrink-0">${monthGroup.projectCount} projeto${monthGroup.projectCount === 1 ? '' : 's'}</span>
            </div>
            <div class="collapsible-list-body hidden p-2 space-y-2">
                ${monthGroup.orders.map(renderGestaoRelatorioPedidosPendentesOrderGroup).join('')}
            </div>
        </div>
    `).join('');
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

function groupGestaoRelatorioFechamentoProducaoByMonth(projects) {
    const groups = {};

    projects.forEach(project => {
        const monthKey = getGestaoRelatorioMonthKey(project.fimMontagemInterna);
        if (!groups[monthKey]) {
            groups[monthKey] = { monthKey, projects: [] };
        }
        groups[monthKey].projects.push(project);
    });

    return Object.values(groups)
        .sort((a, b) => {
            if (a.monthKey === 'sem-data') return 1;
            if (b.monthKey === 'sem-data') return -1;
            return b.monthKey.localeCompare(a.monthKey);
        })
        .map(group => ({
            ...group,
            totalSaleValue: sumGestaoRelatorioSaleValues(group.projects),
            projects: [...group.projects].sort((a, b) => {
                const orderA = a.order?.orderCode || '';
                const orderB = b.order?.orderCode || '';
                return String(orderA).localeCompare(String(orderB), 'pt-BR', { numeric: true })
                    || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
            })
        }));
}

function renderGestaoRelatorioFechamentoProducaoProjectRow(project) {
    const orderCode = project.order?.orderCode || '—';
    const clientName = project.order?.clientName || '—';
    const fimMontagem = typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.fimMontagemInterna)
        : (project.fimMontagemInterna || '—');
    const saleValue = typeof formatSaleValue === 'function'
        ? formatSaleValue(getProjectEffectiveSaleValue(project))
        : (getProjectEffectiveSaleValue(project) ?? '—');

    return `
        <tr class="border-b border-slate-100 last:border-0">
            <td class="p-2.5 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
            <td class="p-2.5 text-xs text-slate-600">${escapeHtml(clientName)}</td>
            <td class="p-2.5 text-xs font-medium text-slate-800">${escapeHtml(getGestaoRelatorioProjectLabel(project))}</td>
            <td class="p-2.5 text-xs text-slate-500 whitespace-nowrap">${escapeHtml(fimMontagem)}</td>
            <td class="p-2.5 text-xs text-slate-700 whitespace-nowrap text-right font-medium">${escapeHtml(saleValue)}</td>
        </tr>
    `;
}

function renderGestaoRelatorioFechamentoProducaoGroups(groups) {
    if (!groups.length) {
        return '<p class="text-xs text-slate-400 text-center py-4">Nenhum projeto em expedição para fechamento.</p>';
    }

    return groups.map(group => {
        const totalLabel = typeof formatSaleValue === 'function'
            ? formatSaleValue(group.totalSaleValue)
            : group.totalSaleValue;

        return `
            <div class="collapsible-list-card border border-slate-200 rounded-lg overflow-hidden bg-white">
                <div class="collapsible-list-header px-3 py-2.5 bg-slate-50/80 border-b border-slate-100 cursor-pointer flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                            aria-label="Expandir">▶</button>
                        <span class="text-xs font-semibold text-slate-800 truncate">${escapeHtml(formatGestaoRelatorioMonthLabel(group.monthKey))}</span>
                        <span class="text-[10px] text-slate-500 shrink-0">${group.projects.length} projeto${group.projects.length === 1 ? '' : 's'}</span>
                    </div>
                    <span class="text-xs font-bold text-emerald-700 shrink-0">${escapeHtml(totalLabel)}</span>
                </div>
                <div class="collapsible-list-body hidden">
                    <div class="overflow-x-auto">
                        <table class="gestao-relatorios-table w-full text-xs min-w-[40rem]">
                            <thead class="bg-white text-[10px] uppercase text-slate-400">
                                <tr>
                                    <th class="text-left p-2.5 font-semibold">Pedido</th>
                                    <th class="text-left p-2.5 font-semibold">Cliente</th>
                                    <th class="text-left p-2.5 font-semibold">Projeto</th>
                                    <th class="text-left p-2.5 font-semibold">Fim mont. interna</th>
                                    <th class="text-right p-2.5 font-semibold">Valor</th>
                                </tr>
                            </thead>
                            <tbody>${group.projects.map(renderGestaoRelatorioFechamentoProducaoProjectRow).join('')}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderGestaoRelatoriosPanel(projects, statuses) {
    const content = document.getElementById('gestao-relatorios-content');
    if (!content) return;

    const statusCounts = buildGestaoRelatorioStatusCounts(projects, statuses);
    const pedidosPendentesProjects = filterGestaoRelatorioPedidosPendentesProjects(projects, statuses);
    const pedidosPendentesGroups = groupGestaoRelatorioPedidosPendentes(pedidosPendentesProjects, projects);
    const nextMonthLabel = formatGestaoRelatorioNextMonthLabel();
    const fechamentoProjects = projects.filter(project =>
        getGestaoRelatorioStatusName(project) === GESTAO_RELATORIO_EXPEDICAO_STATUS
    );
    const fechamentoGroups = groupGestaoRelatorioFechamentoProducaoByMonth(fechamentoProjects);
    const fechamentoGrandTotal = sumGestaoRelatorioSaleValues(fechamentoProjects);
    const fechamentoGrandTotalLabel = typeof formatSaleValue === 'function'
        ? formatSaleValue(fechamentoGrandTotal)
        : fechamentoGrandTotal;

    content.innerHTML = `
        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h4 class="text-sm font-bold text-slate-900">Projetos por status</h4>
                <p class="text-xs text-slate-400 mt-0.5">Distribuição atual de todos os projetos.</p>
            </div>
            <div class="p-4">${renderGestaoRelatorioPieChart(statusCounts)}</div>
        </section>

        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h4 class="text-sm font-bold text-slate-900">Pedidos Pendentes com entrega próximo mês</h4>
                <p class="text-xs text-slate-400 mt-0.5">Projetos entre ${escapeHtml(GESTAO_RELATORIO_RANGE_START)} e ${escapeHtml(GESTAO_RELATORIO_RANGE_END_STATUSES.slice(0, 2).join(' / '))}, com entrega do pedido até ${escapeHtml(nextMonthLabel)} (inclusive).</p>
            </div>
            <div id="gestao-relatorio-pedidos-pendentes-groups" class="p-3 space-y-2">
                ${renderGestaoRelatorioPedidosPendentesGroups(pedidosPendentesGroups)}
            </div>
        </section>

        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h4 class="text-sm font-bold text-slate-900">Fechamento Produção</h4>
                    <p class="text-xs text-slate-400 mt-0.5">Projetos em ${escapeHtml(GESTAO_RELATORIO_EXPEDICAO_STATUS)} agrupados pelo mês do fim da montagem interna.</p>
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

    renderGestaoRelatoriosPanel(projectsWithSubstituicaoValues, statuses || []);
}

function bindGestaoRelatoriosEvents() {
    document.getElementById('btn-gestao-relatorios-refresh')?.addEventListener('click', loadGestaoRelatorios);
}
