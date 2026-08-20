function getProjectStatusId(project) {
    return Number(project?.statusId || project?.projectStatus?.id || 0) || null;
}

function isGestaoKanbanComplementarProject(project) {
    return isComplementaryOrderProject(project) || Boolean(project?.parentProjectId);
}

function isGestaoKanbanHiddenProject(project) {
    return isGestaoKanbanComplementarProject(project) || isReplacedOrderProject(project);
}

function projectBelongsToGestaoKanbanPhase(project, phase, phases = []) {
    if (!phase) return true;

    const phaseId = Number(phase.id);
    const projectPhaseId = Number(project.deliveryPhaseId);
    const firstPhaseId = Number(phases[0]?.id);

    if (projectPhaseId) {
        return projectPhaseId === phaseId;
    }

    return phaseId === firstPhaseId;
}

function buildGestaoKanbanCardsForStatus(statusId, orders) {
    const normalizedStatusId = Number(statusId);
    const complementarByParentId = {};

    orders.forEach(order => {
        (order.projects || []).forEach(project => {
            if (getProjectStatusId(project) !== normalizedStatusId) return;
            if (!isGestaoKanbanComplementarProject(project)) return;

            const parentId = Number(project.parentProjectId);
            if (!parentId) return;

            if (!complementarByParentId[parentId]) {
                complementarByParentId[parentId] = [];
            }
            complementarByParentId[parentId].push(project);
        });
    });

    const cards = [];

    orders.forEach(order => {
        const phases = typeof orderHasGestaoDeliveryPhases === 'function' && orderHasGestaoDeliveryPhases(order)
            ? order.deliveryPhases
            : [null];

        phases.forEach(phase => {
            const parentProjects = (order.projects || []).filter(project =>
                getProjectStatusId(project) === normalizedStatusId
                && !isGestaoKanbanHiddenProject(project)
                && projectBelongsToGestaoKanbanPhase(project, phase, phases)
            );

            if (!parentProjects.length) return;

            const projectTree = parentProjects
                .map(project => ({
                    project,
                    children: (complementarByParentId[Number(project.id)] || [])
                        .slice()
                        .sort(compareGestaoKanbanProjectsByDaysInStatus)
                }))
                .sort(compareGestaoKanbanProjectsByDaysInStatus);

            cards.push({ order, phase, projectTree });
        });
    });

    cards.sort(compareGestaoKanbanCardsByDaysInStatus);

    return cards;
}

function renderGestaoKanbanProjectRow(project, options = {}) {
    const { nested = false, isComplementar = false, orderCode = '' } = options;

    let displayName = project.name || 'Projeto';
    if (isComplementar || nested || project.isComplementary) {
        const orderLabel = project.order?.orderCode || orderCode || '';
        const orderPart = orderLabel ? `${orderLabel} - ` : '';
        displayName = `Proj. Compl. ${orderPart}${project.name || 'Projeto'}`;
    }

    const daysInStatusLabel = formatGestaoKanbanDaysInCurrentStatus(project);
    const showHistoryBtn = !isComplementar && !nested && !project.isComplementary;

    return `
        <div class="flex items-start justify-between gap-2 ${nested ? 'ml-4 pl-2 border-l border-indigo-100' : ''}">
            <div class="flex items-baseline gap-1.5 min-w-0 flex-wrap">
                <span class="text-[11px] leading-snug ${nested ? 'text-slate-600' : 'text-slate-700'}">${escapeHtml(displayName)}</span>
                ${daysInStatusLabel
                    ? `<span class="text-[10px] text-slate-400 whitespace-nowrap" title="Dias no status atual">${escapeHtml(daysInStatusLabel)}</span>`
                    : ''}
            </div>
            ${showHistoryBtn ? `
            <button type="button"
                class="gestao-kanban-history-btn shrink-0 text-[10px] bg-white border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-md font-medium hover:bg-indigo-50"
                data-order-project-id="${project.id}">
                Histórico
            </button>
            ` : ''}
        </div>
    `;
}

function renderGestaoKanbanCard(order, projectTree, phase = null) {
    const card = document.createElement('div');
    card.className = 'bg-white border border-indigo-100 rounded-lg shadow-sm p-3 space-y-2';

    const projectsHtml = projectTree.map(({ project, children }) => {
        const childrenHtml = (children || [])
            .map(child => renderGestaoKanbanProjectRow(child, {
                nested: true,
                isComplementar: true,
                orderCode: child.order?.orderCode || order.orderCode || ''
            }))
            .join('');

        return `
            <li class="space-y-1.5 list-none">
                ${renderGestaoKanbanProjectRow(project, { orderCode: order.orderCode })}
                ${childrenHtml}
            </li>
        `;
    }).join('');

    const orderCodeLabel = phase
        ? `${order.orderCode || '—'} - ${phase.name || 'Fase'}`
        : (order.orderCode || '—');

    card.innerHTML = `
        <div class="space-y-0.5">
            <div class="font-mono text-xs font-bold text-indigo-800">${escapeHtml(orderCodeLabel)}</div>
            <div class="text-xs font-semibold text-slate-800">${escapeHtml(getOrderClientName(order) || '—')}</div>
            ${phase?.deliveryDate
                ? `<div class="text-[10px] text-slate-500">Entrega: ${escapeHtml(formatGestaoDate(phase.deliveryDate))}</div>`
                : ''}
        </div>
        <ul class="space-y-2 m-0 p-0 list-none">${projectsHtml}</ul>
    `;

    return card;
}

async function enrichProjectStatusHistoryEntries(entries) {
    if (!entries.length) return entries;

    const needsEnrich = entries.some(entry =>
        (entry.previousStatusId && !entry.previousStatus?.name)
        || (entry.newStatusId && !entry.newStatus?.name)
        || (entry.changedById && !entry.changedBy?.name)
    );

    if (!needsEnrich) {
        return entries.map(entry => ({
            ...entry,
            observation: String(entry.observation || '').trim()
        }));
    }

    const statusIds = [...new Set(entries.flatMap(entry => [
        entry.previousStatusId,
        entry.newStatusId
    ].filter(Boolean)))];
    const userIds = [...new Set(entries.map(entry => entry.changedById).filter(Boolean))];

    const [statusesResult, usersResult] = await Promise.all([
        statusIds.length
            ? supabaseClient.from('OrderProjectStatus').select('id, name').in('id', statusIds)
            : Promise.resolve({ data: [] }),
        userIds.length
            ? supabaseClient.from('appUsers').select('id, name').in('id', userIds)
            : Promise.resolve({ data: [] })
    ]);

    const statusById = Object.fromEntries((statusesResult.data || []).map(status => [status.id, status]));
    const userById = Object.fromEntries((usersResult.data || []).map(user => [user.id, user]));

    return entries.map(entry => ({
        ...entry,
        observation: String(entry.observation || '').trim(),
        previousStatus: entry.previousStatus || statusById[entry.previousStatusId] || null,
        newStatus: entry.newStatus || statusById[entry.newStatusId] || null,
        changedBy: entry.changedBy || userById[entry.changedById] || null
    }));
}

async function fetchOrderProjectStatusHistory(orderProjectId) {
    const normalizedId = Number(orderProjectId);
    if (!normalizedId) return [];

    let result = await supabaseClient
        .from('OrderProjectStatusHistory')
        .select(`
            id,
            orderProjectId,
            previousStatusId,
            newStatusId,
            changedAt,
            changedById,
            previousStatusDurationSeconds,
            observation,
            previousStatus:OrderProjectStatus!previousStatusId(id, name),
            newStatus:OrderProjectStatus!newStatusId(id, name),
            changedBy:appUsers(id, name)
        `)
        .eq('orderProjectId', normalizedId)
        .order('changedAt', { ascending: true });

    if (result.error?.message?.includes('OrderProjectStatusHistory')) {
        throw new Error('Execute supabase/create-order-project-status-history.sql no Supabase.');
    }

    if (result.error) {
        result = await supabaseClient
            .from('OrderProjectStatusHistory')
            .select('*')
            .eq('orderProjectId', normalizedId)
            .order('changedAt', { ascending: true });

        if (result.error) throw result.error;
    }

    return enrichProjectStatusHistoryEntries(result.data || []);
}

const PROJECT_STATUS_HISTORY_BAR_COLORS = {
    'Vendido': '#10b981',
    'Aguardando Obra': '#f97316',
    'Aguardando Medição': '#06b6d4',
    'Medição Realizada': '#14b8a6',
    'Planta Levantada': '#84cc16',
    'Conferência Enviada': '#0ea5e9',
    'Conferência Realizada': '#14b8a6',
    'Aguardando Projeto Técnico': '#6366f1',
    'Projeto Técnico': '#8b5cf6',
    'Em Revisão Comercial Cons.': '#0ea5e9',
    'Em Revisão Comercial Proj.': '#0284c7',
    'Em Revisão Comercial': '#0ea5e9',
    'Em Revisão Técnica': '#0284c7',
    'Em Revisão Técnica Revisor': '#0d9488',
    'Em Revisão Técnica Proj.': '#0891b2',
    'Aguardando Aprovação': '#f59e0b',
    'Em Revisão': '#0ea5e9',
    'Em revisão': '#0ea5e9',
    'Nomear': '#a855f7',
    'Aguardando PPCP': '#d946ef',
    'Implantação': '#14b8a6',
    'Em Produção': '#f97316',
    'Montagem Interna': '#f59e0b',
    'Expedição': '#64748b'
};

let projectStatusHistoryState = {
    entries: [],
    viewMode: 'flow',
    detailingRecord: null
};

function getProjectStatusHistoryBarColor(statusName) {
    return PROJECT_STATUS_HISTORY_BAR_COLORS[statusName] || '#94a3b8';
}

function formatProjectStatusHistoryAxisDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '—';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
}

function buildProjectStatusHistorySegments(entries) {
    return (entries || []).map((entry, index) => {
        const statusName = entry.newStatus?.name || 'Status';
        const startAt = entry.changedAt;
        const isLast = index === entries.length - 1;
        const durationSeconds = isLast
            ? Math.max(0, Math.floor((Date.now() - new Date(startAt).getTime()) / 1000))
            : Number(entries[index + 1].previousStatusDurationSeconds) || 0;

        return {
            statusName,
            startAt,
            endAt: isLast ? null : entries[index + 1].changedAt,
            durationSeconds,
            changedBy: entry.changedBy?.name || '—',
            observation: String(entry.observation || '').trim(),
            isCurrent: isLast
        };
    });
}

function getOrderProjectStatusHistoryObservation(entry) {
    return String(entry?.observation || '').trim();
}

function renderProjectStatusHistoryObservationHtml(observation) {
    const text = String(observation || '').trim();
    if (!text) return '';

    return `
        <div class="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-left">
            <div class="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Observação</div>
            <div class="text-[11px] text-slate-700 mt-0.5 whitespace-pre-wrap">${escapeHtml(text)}</div>
        </div>
    `;
}

function renderProjectStatusHistoryToolbar(viewMode) {
    return `
        <div class="project-status-history-toolbar">
            <span class="project-status-history-toolbar__label">Visualização</span>
            <div class="project-status-history-toolbar__buttons">
                <button type="button"
                    class="project-status-history-view-btn ${viewMode === 'flow' ? 'is-active' : ''}"
                    data-project-status-history-view="flow">
                    Fluxo
                </button>
                <button type="button"
                    class="project-status-history-view-btn ${viewMode === 'timeline' ? 'is-active' : ''}"
                    data-project-status-history-view="timeline">
                    Linha do tempo
                </button>
            </div>
        </div>
    `;
}

function renderProjectStatusHistoryTimeline(entries) {
    if (!entries.length) {
        return '<p class="text-xs text-slate-400 text-center py-12">Nenhum registro de histórico para este projeto.</p>';
    }

    const segments = buildProjectStatusHistorySegments(entries);
    const totalDuration = segments.reduce((sum, segment) => sum + Math.max(segment.durationSeconds, 1), 0);
    let cumulative = 0;

    const barSegments = segments.map(segment => {
        const weight = Math.max(segment.durationSeconds, 1);
        const color = getProjectStatusHistoryBarColor(segment.statusName);
        const durationLabel = formatStatusDurationSeconds(segment.durationSeconds) || '—';
        const startLabel = formatProjectStatusHistoryAxisDate(segment.startAt);
        const endLabel = segment.isCurrent
            ? 'Em andamento'
            : formatProjectStatusHistoryAxisDate(segment.endAt);
        const tooltipParts = [
            segment.statusName,
            `${startLabel} → ${endLabel}`,
            `${durationLabel} · ${segment.changedBy}`
        ];
        if (segment.observation) tooltipParts.push(segment.observation);
        const tooltip = tooltipParts.join('\n');

        return `
            <div class="project-status-history-timeline__segment"
                style="flex-grow:${weight};background-color:${color}"
                title="${escapeHtml(tooltip)}">
                <span class="project-status-history-timeline__segment-label">${escapeHtml(segment.statusName)}</span>
            </div>
        `;
    }).join('');

    const dateMarkers = [];
    dateMarkers.push({
        left: 0,
        label: formatProjectStatusHistoryAxisDate(segments[0].startAt)
    });

    segments.forEach((segment, index) => {
        cumulative += Math.max(segment.durationSeconds, 1);
        const left = Math.min(100, (cumulative / totalDuration) * 100);
        if (index < segments.length - 1) {
            dateMarkers.push({
                left,
                label: formatProjectStatusHistoryAxisDate(segments[index + 1].startAt)
            });
        } else {
            dateMarkers.push({
                left: 100,
                label: segment.isCurrent ? 'Agora' : formatProjectStatusHistoryAxisDate(segment.endAt)
            });
        }
    });

    const markersHtml = dateMarkers.map((marker, index) => `
        <span class="project-status-history-timeline__date-marker ${index === 0 ? 'is-start' : ''} ${index === dateMarkers.length - 1 ? 'is-end' : ''}"
            style="left:${marker.left}%">
            ${escapeHtml(marker.label)}
        </span>
    `).join('');

    const legendItems = segments.map(segment => {
        const color = getProjectStatusHistoryBarColor(segment.statusName);
        const durationLabel = formatStatusDurationSeconds(segment.durationSeconds) || '—';
        const periodLabel = segment.isCurrent
            ? `${formatGestaoDateTime(segment.startAt)} → agora`
            : `${formatGestaoDateTime(segment.startAt)} → ${formatGestaoDateTime(segment.endAt)}`;

        return `
            <li class="project-status-history-timeline__legend-item">
                <span class="project-status-history-timeline__legend-swatch" style="background-color:${color}"></span>
                <div class="project-status-history-timeline__legend-content min-w-0">
                    <div class="project-status-history-timeline__legend-title">${escapeHtml(segment.statusName)}</div>
                    <div class="project-status-history-timeline__legend-meta">${escapeHtml(periodLabel)} · ${escapeHtml(durationLabel)} · ${escapeHtml(segment.changedBy)}</div>
                    ${renderProjectStatusHistoryObservationHtml(segment.observation)}
                </div>
            </li>
        `;
    }).join('');

    return `
        <div class="project-status-history-timeline">
            <div class="project-status-history-timeline__bar">${barSegments}</div>
            <div class="project-status-history-timeline__dates">${markersHtml}</div>
            <ul class="project-status-history-timeline__legend">${legendItems}</ul>
        </div>
    `;
}

function renderProjectStatusHistoryView(entries, viewMode = 'flow', detailingRecord = null) {
    const content = viewMode === 'timeline'
        ? renderProjectStatusHistoryTimeline(entries)
        : renderProjectStatusHistoryFlow(entries, detailingRecord);

    return `
        ${renderProjectStatusHistoryToolbar(viewMode)}
        <div class="project-status-history-view-content">
            ${content}
        </div>
    `;
}

function setProjectStatusHistoryContent(containerId, entries, viewMode = 'flow', detailingRecord = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    projectStatusHistoryState = {
        entries: entries || [],
        viewMode,
        detailingRecord: detailingRecord || null
    };

    container.dataset.projectStatusHistoryContainer = 'true';
    container.innerHTML = renderProjectStatusHistoryView(
        projectStatusHistoryState.entries,
        viewMode,
        projectStatusHistoryState.detailingRecord
    );
}

function bindProjectStatusHistoryViewToggle() {
    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-project-status-history-view]');
        if (!button) return;

        const container = button.closest('[data-project-status-history-container]');
        if (!container || !projectStatusHistoryState.entries.length) return;

        const viewMode = button.dataset.projectStatusHistoryView;
        if (!viewMode || viewMode === projectStatusHistoryState.viewMode) return;

        setProjectStatusHistoryContent(
            container.id,
            projectStatusHistoryState.entries,
            viewMode,
            projectStatusHistoryState.detailingRecord
        );
    });
}

bindProjectStatusHistoryViewToggle();

function renderProjectStatusHistoryConnector(durationSeconds) {
    const durationLabel = formatStatusDurationSeconds(durationSeconds);
    const durationHtml = durationLabel
        ? `<span class="text-[10px] text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200 shadow-sm">${escapeHtml(durationLabel)}</span>`
        : '';

    return `
        <div class="flex flex-col items-center py-1">
            <div class="w-0.5 h-5 bg-indigo-300"></div>
            ${durationHtml}
            <div class="w-0.5 h-5 bg-indigo-300"></div>
            <div class="text-indigo-400 text-xs leading-none">▼</div>
        </div>
    `;
}

function renderProjectStatusHistoryStep(entry, index) {
    const statusName = entry.newStatus?.name || 'Status';
    const changedAt = formatGestaoDateTime(entry.changedAt);
    const changedBy = entry.changedBy?.name || '—';
    const isInitial = !entry.previousStatusId && index === 0;

    return `
        <div class="rounded-xl border-2 border-indigo-200 bg-white px-4 py-3 shadow-sm text-center max-w-md w-full mx-auto">
            <div class="text-sm font-bold text-indigo-900">${escapeHtml(statusName)}</div>
            <div class="text-[10px] text-slate-500 mt-1">${escapeHtml(changedAt)} · ${escapeHtml(changedBy)}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">${isInitial ? 'Status inicial do projeto' : `Alterado de ${escapeHtml(entry.previousStatus?.name || '—')}`}</div>
            ${renderProjectStatusHistoryObservationHtml(getOrderProjectStatusHistoryObservation(entry))}
        </div>
    `;
}

function renderProjectStatusHistoryFlow(entries, detailingRecord = null) {
    if (!entries.length) {
        return '<p class="text-xs text-slate-400 text-center py-12">Nenhum registro de histórico para este projeto.</p>';
    }

    const lastEmProducaoIndex = typeof findLastEmProducaoHistoryIndex === 'function'
        ? findLastEmProducaoHistoryIndex(entries)
        : -1;

    const parts = [];
    entries.forEach((entry, index) => {
        if (index > 0) {
            parts.push(renderProjectStatusHistoryConnector(entry.previousStatusDurationSeconds));
        }
        parts.push(renderProjectStatusHistoryStep(entry, index));

        if (detailingRecord && index === lastEmProducaoIndex
            && typeof renderProjectStatusHistoryDetailingBranch === 'function') {
            parts.push(renderProjectStatusHistoryDetailingBranch(detailingRecord));
        }
    });

    return `
        <div class="max-w-xl mx-auto flex flex-col items-stretch py-2">
            ${parts.join('')}
        </div>
    `;
}

async function openGestaoProjectStatusHistory(context = {}) {
    if (!canAccessGestao()) return;

    const orderProjectId = Number(context.orderProjectId);
    if (!orderProjectId) return;

    const subtitle = document.getElementById('gestao-project-history-subtitle');
    const flow = document.getElementById('gestao-project-history-flow');

    const projectLabel = context.projectLabel || 'Projeto';
    const orderCode = context.orderCode || '—';
    const clientName = context.clientName || '—';

    if (subtitle) {
        subtitle.textContent = `Pedido ${orderCode} · ${clientName} · ${projectLabel}`;
    }

    showGestaoProjectHistoryPanel();

    if (flow) {
        flow.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando histórico...</p>';
    }

    try {
        const [entries, detailingRecord] = await Promise.all([
            fetchOrderProjectStatusHistory(orderProjectId),
            typeof fetchDetalhamentoByOrderProjectId === 'function'
                ? fetchDetalhamentoByOrderProjectId(orderProjectId)
                : Promise.resolve(null)
        ]);
        setProjectStatusHistoryContent('gestao-project-history-flow', entries, 'flow', detailingRecord);
    } catch (error) {
        if (flow) {
            flow.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar histórico: ${escapeHtml(error.message)}</p>`;
        }
    }
}

window.openGestaoProjectStatusHistory = openGestaoProjectStatusHistory;
window.fetchOrderProjectStatusHistory = fetchOrderProjectStatusHistory;

function getGestaoProjectHistoryContext(orderProjectId) {
    const normalizedId = Number(orderProjectId);

    for (const order of gestaoOrdersCache) {
        const project = (order.projects || []).find(item => Number(item.id) === normalizedId);
        if (!project) continue;

        const projectLabel = `${project.projectCode ? `${project.projectCode} — ` : ''}${project.name || 'Projeto'}`;
        return {
            orderProjectId: normalizedId,
            projectLabel,
            orderCode: order.orderCode || '—',
            clientName: getOrderClientName(order) || '—'
        };
    }

    return {
        orderProjectId: normalizedId,
        projectLabel: 'Projeto',
        orderCode: '—',
        clientName: '—'
    };
}

function buildProjectStatusHistoryContext(project = {}) {
    const normalizedId = Number(project.id);
    if (!normalizedId) return null;

    const projectCode = typeof normalizeProjectCodeInput === 'function'
        ? normalizeProjectCodeInput(project.projectCode || '')
        : (project.projectCode || '');
    const projectLabel = `${projectCode ? `${projectCode} — ` : ''}${project.name || 'Projeto'}`;

    const fromKanban = getGestaoProjectHistoryContext(normalizedId);
    if (fromKanban.orderCode !== '—' || fromKanban.clientName !== '—') {
        return {
            ...fromKanban,
            projectLabel: fromKanban.projectLabel !== 'Projeto' ? fromKanban.projectLabel : projectLabel
        };
    }

    let orderCode = project.order?.orderCode || '—';
    let clientName = getOrderClientName(project.order) || '—';

    if (project.orderId && (orderCode === '—' || clientName === '—')) {
        const gestaoOrder = Array.isArray(gestaoOrdersCache)
            ? gestaoOrdersCache.find(order => Number(order.id) === Number(project.orderId))
            : null;
        if (gestaoOrder) {
            orderCode = gestaoOrder.orderCode || orderCode;
            clientName = getOrderClientName(gestaoOrder) || clientName;
        }

        const ordersOrder = typeof ordersCache !== 'undefined' && Array.isArray(ordersCache)
            ? ordersCache.find(order => Number(order.id) === Number(project.orderId))
            : null;
        if (ordersOrder) {
            orderCode = ordersOrder.orderCode || orderCode;
            clientName = getOrderClientName(ordersOrder) || clientName;
        }
    }

    if (project.orderId && (orderCode === '—' || clientName === '—')
        && typeof activeOrderId !== 'undefined'
        && Number(activeOrderId) === Number(project.orderId)) {
        orderCode = document.getElementById('det-code')?.textContent?.trim() || orderCode;
        clientName = document.getElementById('det-client')?.textContent?.trim() || clientName;
    }

    return {
        orderProjectId: normalizedId,
        projectLabel,
        orderCode,
        clientName
    };
}

async function openProjectStatusHistoryModal(context = {}) {
    const orderProjectId = Number(context.orderProjectId);
    if (!orderProjectId) return;

    const subtitle = document.getElementById('project-status-history-subtitle');
    const flow = document.getElementById('project-status-history-flow');
    const projectLabel = context.projectLabel || 'Projeto';
    const orderCode = context.orderCode || '—';
    const clientName = context.clientName || '—';

    if (subtitle) {
        subtitle.textContent = `Pedido ${orderCode} · ${clientName} · ${projectLabel}`;
    }

    toggleModal('order-project-status-history-modal', true);

    if (flow) {
        flow.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando histórico...</p>';
    }

    try {
        const [entries, detailingRecord] = await Promise.all([
            fetchOrderProjectStatusHistory(orderProjectId),
            typeof fetchDetalhamentoByOrderProjectId === 'function'
                ? fetchDetalhamentoByOrderProjectId(orderProjectId)
                : Promise.resolve(null)
        ]);
        setProjectStatusHistoryContent('project-status-history-flow', entries, 'flow', detailingRecord);
    } catch (error) {
        if (flow) {
            flow.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar histórico: ${escapeHtml(error.message)}</p>`;
        }
    }
}

window.buildProjectStatusHistoryContext = buildProjectStatusHistoryContext;
window.openProjectStatusHistoryModal = openProjectStatusHistoryModal;

function renderGestaoKanbanColumn(status, orders) {
    const cards = buildGestaoKanbanCardsForStatus(status.id, orders);
    const projectCount = cards.reduce((total, card) => (
        total + card.projectTree.reduce((sum, entry) => sum + 1 + (entry.children?.length || 0), 0)
    ), 0);

    const column = document.createElement('div');
    column.className = 'gestao-kanban-column w-72 shrink-0 flex flex-col max-h-[calc(100vh-240px)]';
    column.innerHTML = `
        <div class="rounded-t-xl border border-slate-200 bg-slate-100 px-3 py-2.5">
            <div class="text-xs font-bold text-slate-800">${escapeHtml(status.name)}</div>
            <div class="text-[10px] text-slate-500">${cards.length} pedido${cards.length === 1 ? '' : 's'} · ${projectCount} projeto${projectCount === 1 ? '' : 's'}</div>
        </div>
        <div class="gestao-kanban-column-body flex-1 overflow-y-auto space-y-2 p-2 border border-t-0 border-slate-200 rounded-b-xl bg-slate-50/60"></div>
    `;

    const body = column.querySelector('.gestao-kanban-column-body');

    if (!cards.length) {
        body.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-6">Nenhum projeto neste status.</p>';
        return column;
    }

    cards.forEach(({ order, phase, projectTree }) => {
        body.appendChild(renderGestaoKanbanCard(order, projectTree, phase));
    });

    return column;
}

let gestaoKanbanFullscreen = false;
let gestaoKanbanStatusesCache = [];
let gestaoKanbanStatusSinceByProjectId = {};
let gestaoKanbanClientFilterTimer = null;

function getGestaoKanbanDaysInCurrentStatus(changedAt) {
    if (!changedAt) return null;

    const start = new Date(changedAt);
    if (Number.isNaN(start.getTime())) return null;

    const now = new Date();
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.floor((today.getTime() - startDay.getTime()) / 86400000));
}

function formatGestaoKanbanDaysInCurrentStatus(project) {
    const days = getGestaoKanbanProjectDaysInCurrentStatus(project);
    if (days === null) return '';
    if (days === 0) return 'hoje';
    return days === 1 ? '1 dia' : `${days} dias`;
}

function getGestaoKanbanProjectDaysInCurrentStatus(project) {
    const projectId = Number(project?.id);
    const changedAt = gestaoKanbanStatusSinceByProjectId[projectId]
        || project?.updatedAt
        || null;
    return getGestaoKanbanDaysInCurrentStatus(changedAt);
}

function compareGestaoKanbanProjectsByDaysInStatus(a, b) {
    const projectA = a?.project || a;
    const projectB = b?.project || b;
    const daysA = getGestaoKanbanProjectDaysInCurrentStatus(projectA);
    const daysB = getGestaoKanbanProjectDaysInCurrentStatus(projectB);
    const normalizedDaysA = daysA === null ? -1 : daysA;
    const normalizedDaysB = daysB === null ? -1 : daysB;

    if (normalizedDaysA !== normalizedDaysB) {
        return normalizedDaysB - normalizedDaysA;
    }

    return String(projectA?.name || '').localeCompare(String(projectB?.name || ''), 'pt-BR');
}

function getGestaoKanbanCardMaxDaysInStatus(projectTree) {
    let maxDays = -1;

    (projectTree || []).forEach(({ project, children }) => {
        const parentDays = getGestaoKanbanProjectDaysInCurrentStatus(project);
        if (parentDays !== null) maxDays = Math.max(maxDays, parentDays);

        (children || []).forEach(child => {
            const childDays = getGestaoKanbanProjectDaysInCurrentStatus(child);
            if (childDays !== null) maxDays = Math.max(childDays, maxDays);
        });
    });

    return maxDays;
}

function compareGestaoKanbanCardsByDaysInStatus(a, b) {
    const daysA = getGestaoKanbanCardMaxDaysInStatus(a.projectTree);
    const daysB = getGestaoKanbanCardMaxDaysInStatus(b.projectTree);

    if (daysA !== daysB) return daysB - daysA;

    const codeCompare = String(a.order.orderCode || '').localeCompare(
        String(b.order.orderCode || ''),
        'pt-BR',
        { numeric: true }
    );
    if (codeCompare !== 0) return codeCompare;

    return (a.phase?.sortOrder || 0) - (b.phase?.sortOrder || 0);
}

function collectGestaoKanbanVisibleProjects(orders = []) {
    const projects = [];
    const seen = new Set();

    (orders || []).forEach(order => {
        (order.projects || []).forEach(project => {
            if (isReplacedOrderProject(project)) return;

            const projectId = Number(project?.id);
            if (!projectId || seen.has(projectId)) return;

            seen.add(projectId);
            projects.push(project);
        });
    });

    return projects;
}

async function fetchGestaoKanbanCurrentStatusChangedAtByProjects(projects = []) {
    const statusIdByProjectId = {};
    const projectIds = [];

    projects.forEach(project => {
        const projectId = Number(project?.id);
        const statusId = getProjectStatusId(project);
        if (!projectId || !statusId) return;
        statusIdByProjectId[projectId] = statusId;
        projectIds.push(projectId);
    });

    if (!projectIds.length) return {};

    let result = await supabaseClient
        .from('OrderProjectStatusHistory')
        .select('orderProjectId, newStatusId, changedAt')
        .in('orderProjectId', projectIds)
        .order('changedAt', { ascending: false });

    if (result.error?.message?.includes('OrderProjectStatusHistory')) {
        return {};
    }

    if (result.error) {
        console.warn('fetchGestaoKanbanCurrentStatusChangedAtByProjects:', result.error);
        return {};
    }

    const byProjectId = {};
    (result.data || []).forEach(entry => {
        const projectId = Number(entry.orderProjectId);
        if (!projectId || byProjectId[projectId]) return;

        const expectedStatusId = statusIdByProjectId[projectId];
        if (Number(entry.newStatusId) !== Number(expectedStatusId)) return;

        byProjectId[projectId] = entry.changedAt;
    });

    return byProjectId;
}

async function loadGestaoKanbanStatusSinceMap(orders = []) {
    const projects = collectGestaoKanbanVisibleProjects(orders);
    gestaoKanbanStatusSinceByProjectId = await fetchGestaoKanbanCurrentStatusChangedAtByProjects(projects);
}

function getGestaoKanbanClientFilter() {
    return document.getElementById('gestao-kanban-filter-client')?.value.trim() || '';
}

function filterGestaoKanbanOrdersByClient(orders, clientName = getGestaoKanbanClientFilter()) {
    const term = String(clientName || '').trim();
    if (!term) return orders || [];

    const normalized = term.toLocaleLowerCase('pt-BR');
    return (orders || []).filter(order => {
        const name = getOrderClientName(order).toLocaleLowerCase('pt-BR');
        return name.includes(normalized);
    });
}

function getGestaoKanbanFilteredOrders() {
    return filterGestaoKanbanOrdersByClient(gestaoOrdersCache || []);
}

function renderGestaoKanbanBoard(orders = getGestaoKanbanFilteredOrders()) {
    const board = document.getElementById('gestao-kanban-board');
    if (!board) return;

    const visibleStatuses = gestaoKanbanStatusesCache || [];
    if (!visibleStatuses.length) return;

    const boardInner = document.createElement('div');
    boardInner.className = 'flex gap-3 min-w-max items-start';

    visibleStatuses.forEach(status => {
        boardInner.appendChild(renderGestaoKanbanColumn(status, orders));
    });

    board.innerHTML = '';
    board.appendChild(boardInner);
}

function scheduleGestaoKanbanClientFilterRender() {
    clearTimeout(gestaoKanbanClientFilterTimer);
    gestaoKanbanClientFilterTimer = setTimeout(() => {
        renderGestaoKanbanBoard();
    }, 250);
}

function clearGestaoKanbanClientFilter() {
    const input = document.getElementById('gestao-kanban-filter-client');
    if (input) input.value = '';
    renderGestaoKanbanBoard();
}

async function loadGestaoKanban() {
    const board = document.getElementById('gestao-kanban-board');
    if (!board) return;

    board.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando kanban...</p>';

    const [statuses, ordersResult] = await Promise.all([
        loadGestaoProjectStatuses(true),
        fetchGestaoOrders()
    ]);

    if (ordersResult.error) {
        board.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar kanban: ${escapeHtml(ordersResult.error.message)}</p>`;
        return;
    }

    let orders = ordersResult.data || [];
    const needsRelationFields = orders.some(order =>
        (order.projects || []).some(project =>
            project.isComplementary === undefined && project.parentProjectId === undefined
            || project.isReplaced === undefined && project.replacedByProjectId === undefined
            || project.isReplacement === undefined && project.replacesProjectId === undefined
        )
    );

    if (needsRelationFields && orders.length) {
        const projectsByOrderId = await fetchGestaoProjectsByOrderIds(orders.map(order => order.id));
        orders = orders.map(order => ({
            ...order,
            projects: projectsByOrderId[order.id] || order.projects || []
        }));
    }

    if (typeof fetchGestaoOrderPhasesByOrderIds === 'function' && orders.length) {
        const phasesByOrderId = await fetchGestaoOrderPhasesByOrderIds(orders.map(order => order.id));
        orders = orders.map(order => ({
            ...order,
            deliveryPhases: phasesByOrderId[order.id] || []
        }));
    }

    gestaoOrdersCache = orders;

    const visibleStatuses = statuses.filter(status => !isReplacedStatusName(status.name));

    if (!visibleStatuses.length) {
        board.innerHTML = `
            <p class="text-xs text-amber-700 text-center py-8 bg-amber-50 rounded-xl border border-amber-100">
                Nenhum status cadastrado. Execute <code>supabase/create-order-project-status.sql</code> no Supabase.
            </p>
        `;
        return;
    }

    gestaoKanbanStatusesCache = visibleStatuses;

    await loadGestaoKanbanStatusSinceMap(orders);
    renderGestaoKanbanBoard();
}

function parseGestaoKanbanExportExcelDate(dateStr) {
    if (!dateStr) return null;
    const part = String(dateStr).split('T')[0];
    const [year, month, day] = part.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function toGestaoKanbanExportExcelSerial(date) {
    const epoch = Date.UTC(1899, 11, 30);
    return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - epoch) / 86400000;
}

function getGestaoKanbanExportProjectSaleValue(project) {
    if (typeof getProjectEffectiveSaleValue === 'function') {
        return getProjectEffectiveSaleValue(project);
    }
    const value = Number(project?.saleValue);
    return Number.isFinite(value) ? value : 0;
}

async function ensureGestaoProjetistasCacheForExport() {
    if ((gestaoProjetistasCache || []).length) return;

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .order('name', { ascending: true });

    if (error) {
        console.warn('ensureGestaoProjetistasCacheForExport:', error);
        return;
    }

    gestaoProjetistasCache = data || [];
}

function getGestaoKanbanExportDesignerName(project) {
    if (project?.designer?.name) return project.designer.name;

    const designerId = Number(project?.designerId);
    if (!designerId) return '';

    const fromCache = (gestaoProjetistasCache || []).find(item => Number(item.id) === designerId);
    return fromCache?.name || '';
}

function buildGestaoKanbanExportRow(statusName, order, phase, project, isComplementar = false) {
    const orderDeliveryDate = phase?.deliveryDate || order.clientDeliveryDate || '';
    const projectDeliveryDate = project.deliveryDate || '';
    const designerName = getGestaoKanbanExportDesignerName(project);
    const saleValue = getGestaoKanbanExportProjectSaleValue(project);

    return [
        statusName,
        order.orderCode || '',
        getOrderClientName(order) || '',
        getOrderConsultantNameFromRecord(order) || '',
        phase?.name || '',
        parseGestaoKanbanExportExcelDate(orderDeliveryDate),
        parseGestaoKanbanExportExcelDate(projectDeliveryDate),
        project.name || '',
        project.projectCode || '',
        saleValue,
        isComplementar ? 'Complementar' : 'Principal',
        designerName
    ];
}

function applyGestaoKanbanExportSheetFormats(sheet, dataRowCount, XLSX) {
    const dateColumns = [5, 6];
    const valueColumn = 9;

    for (let row = 1; row <= dataRowCount; row++) {
        dateColumns.forEach(col => {
            const ref = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = sheet[ref];
            if (!cell?.v || !(cell.v instanceof Date)) return;

            cell.t = 'n';
            cell.v = toGestaoKanbanExportExcelSerial(cell.v);
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

function buildGestaoKanbanExportRows(orders, statuses) {
    const rows = [];

    statuses.forEach(status => {
        const cards = buildGestaoKanbanCardsForStatus(status.id, orders);
        cards.forEach(({ order, phase, projectTree }) => {
            projectTree.forEach(({ project, children }) => {
                rows.push(buildGestaoKanbanExportRow(status.name, order, phase, project, false));
                (children || []).forEach(child => {
                    rows.push(buildGestaoKanbanExportRow(status.name, order, phase, child, true));
                });
            });
        });
    });

    return rows;
}

function getGestaoKanbanExportFilename() {
    const today = typeof getTodayInputDate === 'function'
        ? getTodayInputDate()
        : new Date().toISOString().slice(0, 10);
    return `fgp-kanban-${today}.xlsx`;
}

async function resolveGestaoKanbanExportData() {
    let orders = gestaoOrdersCache || [];
    let statuses = (gestaoKanbanStatusesCache || []).filter(status => !isReplacedStatusName(status.name));

    if (!orders.length || !statuses.length) {
        const [loadedStatuses, ordersResult] = await Promise.all([
            loadGestaoProjectStatuses(true),
            fetchGestaoOrders()
        ]);

        if (ordersResult.error) {
            throw ordersResult.error;
        }

        orders = ordersResult.data || [];
        statuses = (loadedStatuses || []).filter(status => !isReplacedStatusName(status.name));

        if (orders.length && typeof fetchGestaoOrderPhasesByOrderIds === 'function') {
            const phasesByOrderId = await fetchGestaoOrderPhasesByOrderIds(orders.map(order => order.id));
            orders = orders.map(order => ({
                ...order,
                deliveryPhases: phasesByOrderId[order.id] || order.deliveryPhases || []
            }));
        }
    }

    return {
        orders: filterGestaoKanbanOrdersByClient(orders, getGestaoKanbanClientFilter()),
        statuses
    };
}

async function exportGestaoKanbanToExcel() {
    if (!canAccessGestao()) return;

    const button = document.getElementById('btn-gestao-kanban-export');
    const originalLabel = button?.querySelector('span')?.textContent || 'Exportar Excel';

    if (button) {
        button.disabled = true;
        const label = button.querySelector('span');
        if (label) label.textContent = 'Exportando...';
    }

    try {
        if (typeof loadSheetJsLibrary !== 'function') {
            throw new Error('Módulo de importação não carregado.');
        }

        const { orders, statuses } = await resolveGestaoKanbanExportData();
        await ensureGestaoProjetistasCacheForExport();
        if (!statuses.length) {
            alertAppDialog('Nenhum status disponível para exportação.', { variant: 'warning', title: 'Aviso' });
            return;
        }

        const dataRows = buildGestaoKanbanExportRows(orders, statuses);
        if (!dataRows.length) {
            alertAppDialog('Nenhum projeto no kanban para exportar.', { variant: 'warning', title: 'Aviso' });
            return;
        }

        const headers = [
            'Status',
            'Pedido',
            'Cliente',
            'Consultor',
            'Fase',
            'Data Entrega',
            'Data Entrega Projeto',
            'Projeto',
            'Código Projeto',
            'Valor Projeto',
            'Tipo',
            'Projetista'
        ];

        const XLSX = await loadSheetJsLibrary();
        const sheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
        applyGestaoKanbanExportSheetFormats(sheet, dataRows.length, XLSX);
        sheet['!cols'] = [
            { wch: 24 },
            { wch: 12 },
            { wch: 28 },
            { wch: 22 },
            { wch: 16 },
            { wch: 14 },
            { wch: 20 },
            { wch: 28 },
            { wch: 14 },
            { wch: 16 },
            { wch: 14 },
            { wch: 22 }
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'Kanban');
        XLSX.writeFile(workbook, getGestaoKanbanExportFilename());
    } catch (error) {
        console.error('exportGestaoKanbanToExcel:', error);
        alertAppDialog(`Erro ao exportar kanban: ${error.message}`);
    } finally {
        if (button) {
            button.disabled = false;
            const label = button.querySelector('span');
            if (label) label.textContent = originalLabel;
        }
    }
}

function setGestaoKanbanFullscreen(enabled) {
    gestaoKanbanFullscreen = Boolean(enabled);
    const panel = document.getElementById('gestao-kanban-panel');
    const button = document.getElementById('btn-gestao-kanban-fullscreen');

    panel?.classList.toggle('gestao-kanban-panel--fullscreen', gestaoKanbanFullscreen);
    document.body.classList.toggle('gestao-kanban-fullscreen-active', gestaoKanbanFullscreen);

    if (button) {
        const label = button.querySelector('[data-gestao-kanban-fullscreen-label]');
        if (label) label.textContent = gestaoKanbanFullscreen ? 'Sair da tela cheia' : 'Tela cheia';
        button.querySelector('[data-fullscreen-icon="enter"]')?.classList.toggle('hidden', gestaoKanbanFullscreen);
        button.querySelector('[data-fullscreen-icon="exit"]')?.classList.toggle('hidden', !gestaoKanbanFullscreen);
        button.setAttribute('aria-pressed', gestaoKanbanFullscreen ? 'true' : 'false');
    }
}

function toggleGestaoKanbanFullscreen() {
    setGestaoKanbanFullscreen(!gestaoKanbanFullscreen);
}

window.setGestaoKanbanFullscreen = setGestaoKanbanFullscreen;

function bindGestaoKanbanEvents() {
    document.getElementById('btn-gestao-kanban-fullscreen')?.addEventListener('click', toggleGestaoKanbanFullscreen);
    document.getElementById('btn-gestao-kanban-export')?.addEventListener('click', exportGestaoKanbanToExcel);
    document.getElementById('gestao-kanban-filter-client')?.addEventListener('input', scheduleGestaoKanbanClientFilterRender);
    document.getElementById('btn-gestao-kanban-filter-clear')?.addEventListener('click', clearGestaoKanbanClientFilter);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && gestaoKanbanFullscreen) {
            setGestaoKanbanFullscreen(false);
        }
    });
}
