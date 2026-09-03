const CONSULTANT_PENDING_UNASSIGNED_ID = 0;

const CONSULTANT_PENDING_TYPES = [
    { id: 'conference', label: 'Conferência' },
    { id: 'commercial-review', label: 'Em Revisão Comercial Cons.' },
    { id: 'awaiting-approval', label: 'Aguardando Aprovação' },
    { id: 'request', label: 'Requisição' },
    { id: 'third-party', label: 'Projetos de Terceiros' }
];

function canAccessPendenciasConsultantPending() {
    return typeof canSeePendenciasGestorComercialMenu === 'function'
        && canSeePendenciasGestorComercialMenu();
}

function getConsultantPendingTypeBadgeClass(typeId) {
    if (typeId === 'conference') {
        return getOrderProjectStatusBadgeClass(PENDENCIAS_STATUS_CONFERENCIA_ENVIADA);
    }
    if (typeId === 'commercial-review') {
        return getOrderProjectStatusBadgeClass(PENDENCIAS_STATUS_EM_REVISAO_COMERCIAL);
    }
    if (typeId === 'awaiting-approval') {
        return getOrderProjectStatusBadgeClass(PENDENCIAS_STATUS_AGUARDANDO_APROVACAO);
    }
    if (typeId === 'request') return 'bg-amber-100 text-amber-800';
    if (typeId === 'third-party') return 'bg-violet-100 text-violet-800';
    return 'bg-slate-100 text-slate-700';
}

function getConsultantPendingOwnerId(order) {
    return Number(order?.consultantUserId || order?.consultor?.id) || CONSULTANT_PENDING_UNASSIGNED_ID;
}

function getCalendarDaysPending(isoDate) {
    if (!isoDate) return null;
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return null;
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date();
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.max(0, Math.round((now.getTime() - start.getTime()) / 86400000));
}

function formatPendingDaysLabel(days) {
    if (days == null) return '—';
    if (days === 0) return 'hoje';
    if (days === 1) return '1 dia';
    return `${days} dias`;
}

function getPendingDaysClass(days) {
    if (days == null) return 'text-slate-400';
    if (days >= 15) return 'text-red-700 font-semibold';
    if (days >= 7) return 'text-amber-700 font-semibold';
    return 'text-slate-600';
}

function getConsultantPendingProjectLabel(project) {
    if (typeof getPendenciasProjectDetailLabel === 'function') {
        return getPendenciasProjectDetailLabel(project);
    }
    return project?.name || project?.projectCode || 'Projeto';
}

function buildConsultantPendingItem({ typeId, order, projectLabel, pendingAt, extraLabel = '' }) {
    const daysPending = getCalendarDaysPending(pendingAt);
    return {
        typeId,
        orderId: Number(order?.id) || 0,
        orderCode: order?.orderCode || '—',
        clientName: typeof getOrderClientName === 'function' ? (getOrderClientName(order) || '—') : '—',
        consultantUserId: getConsultantPendingOwnerId(order),
        consultantName: typeof getOrderConsultantNameFromRecord === 'function'
            ? (getOrderConsultantNameFromRecord(order) || '')
            : '',
        projectLabel: projectLabel || '—',
        pendingAt: pendingAt || null,
        daysPending,
        extraLabel
    };
}

async function fetchConsultantPendingStatusChangedAt(projectIds, statusNames) {
    if (!projectIds.length
        || !statusNames.length
        || typeof fetchTechnicalReviewerStatusChangedAtByProjectIds !== 'function') {
        return {};
    }

    const uniqueIds = [...new Set(projectIds.map(Number).filter(Boolean))];
    const map = {};
    const chunkSize = 200;

    for (let index = 0; index < uniqueIds.length; index += chunkSize) {
        const chunk = uniqueIds.slice(index, index + chunkSize);
        Object.assign(map, await fetchTechnicalReviewerStatusChangedAtByProjectIds(chunk, statusNames));
    }

    return map;
}

async function collectConsultantPendingItems() {
    const items = [];
    const errors = [];

    const [
        conferenceResult,
        commercialReviewResult,
        awaitingApprovalResult,
        requestResult
    ] = await Promise.all([
        typeof fetchPendenciasConsultorConferenciaProjects === 'function'
            ? fetchPendenciasConsultorConferenciaProjects()
            : Promise.resolve({ error: null, projects: [], conferenceByProjectId: {} }),
        typeof fetchPendenciasConsultorAguardandoAprovacaoProjects === 'function'
            ? fetchPendenciasConsultorAguardandoAprovacaoProjects(PENDENCIAS_STATUS_EM_REVISAO_COMERCIAL)
            : Promise.resolve({ error: null, projects: [] }),
        typeof fetchPendenciasConsultorAguardandoAprovacaoProjects === 'function'
            ? fetchPendenciasConsultorAguardandoAprovacaoProjects(PENDENCIAS_STATUS_AGUARDANDO_APROVACAO)
            : Promise.resolve({ error: null, projects: [] }),
        typeof fetchPendenciasConsultorRequisicaoRequests === 'function'
            ? fetchPendenciasConsultorRequisicaoRequests()
            : Promise.resolve({ error: null, requests: [] })
    ]);

    let thirdPartyProjects = [];
    try {
        if (typeof fetchThirdPartyProjectsSentForConsultor === 'function') {
            thirdPartyProjects = await fetchThirdPartyProjectsSentForConsultor({ overviewMode: true });
        }
    } catch (error) {
        errors.push(error);
    }

    if (conferenceResult.error) errors.push(conferenceResult.error);
    if (commercialReviewResult.error) errors.push(commercialReviewResult.error);
    if (awaitingApprovalResult.error) errors.push(awaitingApprovalResult.error);
    if (requestResult.error) errors.push(requestResult.error);

    const conferenceProjects = conferenceResult.projects || [];
    const commercialReviewProjects = commercialReviewResult.projects || [];
    const awaitingApprovalProjects = awaitingApprovalResult.projects || [];
    const conferenceByProjectId = conferenceResult.conferenceByProjectId || {};

    const [conferenceChangedAt, commercialReviewChangedAt, awaitingApprovalChangedAt] = await Promise.all([
        fetchConsultantPendingStatusChangedAt(
            conferenceProjects.map(project => project.id),
            [PENDENCIAS_STATUS_CONFERENCIA_ENVIADA]
        ),
        fetchConsultantPendingStatusChangedAt(
            commercialReviewProjects.map(project => project.id),
            [PENDENCIAS_STATUS_EM_REVISAO_COMERCIAL]
        ),
        fetchConsultantPendingStatusChangedAt(
            awaitingApprovalProjects.map(project => project.id),
            [PENDENCIAS_STATUS_AGUARDANDO_APROVACAO]
        )
    ]);

    const [enrichedConference, enrichedCommercialReview, enrichedAwaitingApproval, enrichedRequests, enrichedThirdParty] =
        await Promise.all([
            enrichItemsWithOrderConsultantUserId(conferenceProjects),
            enrichItemsWithOrderConsultantUserId(commercialReviewProjects),
            enrichItemsWithOrderConsultantUserId(awaitingApprovalProjects),
            enrichItemsWithOrderConsultantUserId(requestResult.requests || []),
            enrichItemsWithOrderConsultantUserId(thirdPartyProjects)
        ]);

    enrichedConference.forEach(project => {
        const conference = conferenceByProjectId[project.id];
        items.push(buildConsultantPendingItem({
            typeId: 'conference',
            order: project.order,
            projectLabel: getConsultantPendingProjectLabel(project),
            pendingAt: conference?.createdAt || conferenceChangedAt[project.id] || null
        }));
    });

    enrichedCommercialReview.forEach(project => {
        items.push(buildConsultantPendingItem({
            typeId: 'commercial-review',
            order: project.order,
            projectLabel: getConsultantPendingProjectLabel(project),
            pendingAt: commercialReviewChangedAt[project.id] || null
        }));
    });

    enrichedAwaitingApproval.forEach(project => {
        items.push(buildConsultantPendingItem({
            typeId: 'awaiting-approval',
            order: project.order,
            projectLabel: getConsultantPendingProjectLabel(project),
            pendingAt: awaitingApprovalChangedAt[project.id] || null
        }));
    });

    enrichedRequests.forEach(request => {
        const projectLabel = typeof getPendenciasRequestProjectLabel === 'function'
            ? getPendenciasRequestProjectLabel(request)
            : (request.orderProject?.name || '—');
        const extraLabel = typeof formatRequestType === 'function'
            ? formatRequestType(getRequestType(request))
            : '';
        items.push(buildConsultantPendingItem({
            typeId: 'request',
            order: request.order,
            projectLabel,
            pendingAt: request.createdAt || null,
            extraLabel
        }));
    });

    enrichedThirdParty.forEach(project => {
        items.push(buildConsultantPendingItem({
            typeId: 'third-party',
            order: project.order,
            projectLabel: project.orderProject?.name || project.projectCharacteristic?.name || 'Projeto de terceiros',
            pendingAt: project.sentAt || project.createdAt || null
        }));
    });

    return { error: errors[0] || null, items };
}

function groupConsultantPendingOrderItems(items) {
    const byOrder = new Map();

    items.forEach(item => {
        const key = item.orderId || `code-${item.orderCode}`;
        if (!byOrder.has(key)) {
            byOrder.set(key, {
                orderId: item.orderId,
                orderCode: item.orderCode,
                clientName: item.clientName,
                items: []
            });
        }
        byOrder.get(key).items.push(item);
    });

    return [...byOrder.values()]
        .map(orderGroup => {
            const daysList = orderGroup.items
                .map(item => item.daysPending)
                .filter(days => days != null);
            return {
                ...orderGroup,
                items: [...orderGroup.items].sort((a, b) => (b.daysPending ?? -1) - (a.daysPending ?? -1)),
                daysPending: daysList.length ? Math.max(...daysList) : null
            };
        })
        .sort((a, b) => (b.daysPending ?? -1) - (a.daysPending ?? -1)
            || String(a.orderCode).localeCompare(String(b.orderCode), 'pt-BR', { numeric: true }));
}

function groupConsultantPendingTypes(items) {
    return CONSULTANT_PENDING_TYPES
        .map(type => {
            const typeItems = items.filter(item => item.typeId === type.id);
            const daysList = typeItems
                .map(item => item.daysPending)
                .filter(days => days != null);
            return {
                ...type,
                items: typeItems,
                orderGroups: groupConsultantPendingOrderItems(typeItems),
                daysPending: daysList.length ? Math.max(...daysList) : null
            };
        })
        .filter(type => type.items.length);
}

function buildConsultantPendingBoard(consultants, items) {
    const itemsByConsultant = new Map();
    items.forEach(item => {
        const consultantId = Number(item.consultantUserId) || CONSULTANT_PENDING_UNASSIGNED_ID;
        if (!itemsByConsultant.has(consultantId)) {
            itemsByConsultant.set(consultantId, []);
        }
        itemsByConsultant.get(consultantId).push(item);
    });

    const rows = (consultants || []).map(consultant => {
        const consultantItems = itemsByConsultant.get(Number(consultant.id)) || [];
        itemsByConsultant.delete(Number(consultant.id));
        return {
            consultantId: Number(consultant.id),
            name: consultant.name || 'Consultor',
            unassigned: false,
            items: consultantItems,
            types: groupConsultantPendingTypes(consultantItems),
            total: consultantItems.length
        };
    });

    const leftoverUnassigned = itemsByConsultant.get(CONSULTANT_PENDING_UNASSIGNED_ID) || [];

    [...itemsByConsultant.entries()].forEach(([consultantId, leftoverItems]) => {
        if (Number(consultantId) === CONSULTANT_PENDING_UNASSIGNED_ID) return;
        const name = leftoverItems.find(item => item.consultantName)?.consultantName
            || `Consultor #${consultantId}`;
        rows.push({
            consultantId: Number(consultantId),
            name,
            unassigned: false,
            items: leftoverItems,
            types: groupConsultantPendingTypes(leftoverItems),
            total: leftoverItems.length
        });
    });

    if (leftoverUnassigned.length) {
        rows.push({
            consultantId: CONSULTANT_PENDING_UNASSIGNED_ID,
            name: 'Sem consultor',
            unassigned: true,
            items: leftoverUnassigned,
            types: groupConsultantPendingTypes(leftoverUnassigned),
            total: leftoverUnassigned.length
        });
    }

    return rows.sort((a, b) => {
        if (a.unassigned !== b.unassigned) return a.unassigned ? 1 : -1;
        if (b.total !== a.total) return b.total - a.total;
        return String(a.name).localeCompare(String(b.name), 'pt-BR', { sensitivity: 'base' });
    });
}

async function fetchPendenciasConsultantPendingBoard() {
    const [consultants, collected] = await Promise.all([
        typeof loadConsultantUsersCache === 'function'
            ? loadConsultantUsersCache(true)
            : Promise.resolve([]),
        collectConsultantPendingItems()
    ]);

    if (collected.error && !collected.items.length) {
        return { error: collected.error, consultants: [] };
    }

    return {
        error: collected.error,
        consultants: buildConsultantPendingBoard(consultants, collected.items)
    };
}

function renderConsultantPendingDays(days) {
    return `<span class="text-[11px] tabular-nums whitespace-nowrap ${getPendingDaysClass(days)}">${escapeHtml(formatPendingDaysLabel(days))}</span>`;
}

function renderConsultantPendingProjectRows(items) {
    return items.map(item => `
        <li class="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
            <div class="min-w-0">
                <p class="text-xs text-slate-800">${escapeHtml(item.projectLabel)}</p>
                ${item.extraLabel
                    ? `<p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(item.extraLabel)}</p>`
                    : ''}
            </div>
            ${renderConsultantPendingDays(item.daysPending)}
        </li>
    `).join('');
}

function renderConsultantPendingOrderGroups(orderGroups) {
    return orderGroups.map(orderGroup => `
        <div class="collapsible-list-card border border-slate-100 rounded-lg overflow-hidden bg-white">
            <div class="collapsible-list-header px-2 py-1.5 bg-slate-50/80 cursor-pointer">
                <div class="flex items-center gap-2 min-w-0">
                    <button type="button"
                        class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                        aria-label="Expandir">▶</button>
                    <span class="text-xs font-mono font-semibold text-slate-700 shrink-0">${escapeHtml(orderGroup.orderCode)}</span>
                    <span class="text-xs text-slate-600 truncate">${escapeHtml(orderGroup.clientName)}</span>
                    <span class="text-[10px] text-slate-400 shrink-0">${orderGroup.items.length}</span>
                    <span class="ml-auto">${renderConsultantPendingDays(orderGroup.daysPending)}</span>
                </div>
            </div>
            <div class="collapsible-list-body hidden">
                <ul class="px-2 py-1">${renderConsultantPendingProjectRows(orderGroup.items)}</ul>
            </div>
        </div>
    `).join('');
}

function renderConsultantPendingTypeSections(types) {
    if (!types.length) {
        return '<p class="text-xs text-slate-400 px-1 py-2">Nenhuma pendência.</p>';
    }

    return types.map(type => `
        <div class="collapsible-list-card border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div class="collapsible-list-header px-2 py-1.5 bg-slate-50/80 border-b border-slate-100 cursor-pointer">
                <div class="flex items-center gap-2 min-w-0">
                    <button type="button"
                        class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                        aria-label="Expandir">▶</button>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase truncate ${getConsultantPendingTypeBadgeClass(type.id)}">
                        ${escapeHtml(type.label)}
                    </span>
                    <span class="text-[10px] text-slate-500 shrink-0">${type.items.length}</span>
                    <span class="ml-auto">${renderConsultantPendingDays(type.daysPending)}</span>
                </div>
            </div>
            <div class="collapsible-list-body hidden">
                <div class="p-2 space-y-1.5">${renderConsultantPendingOrderGroups(type.orderGroups)}</div>
            </div>
        </div>
    `).join('');
}

function renderPendenciasConsultantPendingBoard(consultants) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const total = consultants.reduce((sum, row) => sum + row.total, 0);
    const cardsHtml = consultants.map(row => `
        <article class="flex-[1_1_18rem] min-w-[18rem] max-w-full border rounded-xl shadow-sm overflow-hidden ${row.total
            ? 'border-violet-200 bg-violet-50/20'
            : 'border-slate-200 bg-white'}">
            <div class="px-3 py-2.5 border-b ${row.total ? 'border-violet-100 bg-violet-50/70' : 'border-slate-100 bg-slate-50/80'}">
                <h4 class="font-bold text-sm text-slate-900">${escapeHtml(row.name)}</h4>
                <p class="text-[10px] text-slate-500 mt-0.5">${row.total} pendência${row.total === 1 ? '' : 's'}</p>
            </div>
            <div class="p-2 space-y-2">
                ${renderConsultantPendingTypeSections(row.types)}
            </div>
        </article>
    `).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Pendência por Consultor</h3>
                    <p class="text-xs text-slate-400 mt-0.5">Consultores ativos, com pendências agrupadas por tipo. Expanda para ver pedido, projeto e há quantos dias está pendente.</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-consultant-pending"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            <div class="px-4 pt-3 text-[11px] text-slate-400">${total} pendência${total === 1 ? '' : 's'} no total</div>
            ${consultants.length
                ? `<div id="pendencias-consultant-pending-cards" class="p-4 flex flex-wrap gap-3 items-start">${cardsHtml}</div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum consultor ativo cadastrado.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-consultant-pending')
        ?.addEventListener('click', () => loadPendenciasConsultantPending());

    const cardsRoot = content.querySelector('#pendencias-consultant-pending-cards');
    if (cardsRoot && typeof bindCollapsibleListCardToggles === 'function') {
        bindCollapsibleListCardToggles(cardsRoot, { defaultCollapsed: true });
    }
}

async function loadPendenciasConsultantPending() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando pendências por consultor...</p>';
    }

    if (!canAccessPendenciasConsultantPending()) {
        renderPendenciasPlaceholder('Pendência por Consultor', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, consultants } = await fetchPendenciasConsultantPendingBoard();

    if (error && !consultants.length) {
        renderPendenciasPlaceholder('Pendência por Consultor', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasConsultantPendingBoard(consultants);
}

window.loadPendenciasConsultantPending = loadPendenciasConsultantPending;
window.fetchPendenciasConsultantPendingBoard = fetchPendenciasConsultantPendingBoard;
