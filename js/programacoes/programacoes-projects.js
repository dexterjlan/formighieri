const PROGRAMACOES_THIRD_PARTY_MIN_ORDER_PROJECT_SORT = 13;

let programacoesThirdPartyProjectsCache = [];

const PROGRAMACOES_INLINE_LINK_ARROW_SVG = `<svg class="fm-inline-link-arrow w-3 h-3 shrink-0 opacity-80" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 10.5 10.5 5.5"/><path d="M6.5 5.5h4v4"/></svg>`;

function renderProgramacoesInlineLinkArrowIconHtml() {
    return PROGRAMACOES_INLINE_LINK_ARROW_SVG;
}

function renderProgramacoesOrderLinkWithArrowHtml(row, className = 'text-xs') {
    const orderId = Number(row.orderId);
    const orderCode = row.orderCode === null || row.orderCode === undefined ? '' : String(row.orderCode);
    const display = orderCode.trim() || '—';
    if (!orderId || display === '—') {
        return escapeHtml(display);
    }

    const canNavigate = typeof canAccessOrdersDashboard === 'function'
        ? canAccessOrdersDashboard()
        : true;
    if (!canNavigate) {
        return `<span class="inline-flex items-center gap-0.5 font-mono text-slate-600 ${escapeHtml(className)}">${escapeHtml(display)}</span>`;
    }

    return `<span class="inline-flex items-center gap-0.5">
        <button type="button"
            class="fm-order-code-link inline-flex items-center gap-0.5 font-mono text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded ${escapeHtml(className)}"
            data-order-id="${orderId}"
            title="Abrir pedido">
            <span>${escapeHtml(display)}</span>
            ${renderProgramacoesInlineLinkArrowIconHtml()}
        </button>
    </span>`;
}

function isMissingProjectProductionQueueError(error) {
    const message = String(error?.message || error || '');
    return /projectproductionqueue/i.test(message)
        && /could not find|does not exist|schema cache|não encontr/i.test(message);
}

function isProgramacoesThirdPartyStatusOpen(status) {
    if (typeof isThirdPartyProjectWorkflowClosed === 'function') {
        return !isThirdPartyProjectWorkflowClosed(status);
    }
    return status !== 'Approved' && status !== 'Canceled';
}

function isProgramacoesThirdPartyEligible(project, statusById = {}) {
    if (!project || !isProgramacoesThirdPartyStatusOpen(project.status)) return false;
    const orderProject = project.orderProject;
    if (!orderProject) return false;
    if (typeof getGestaoRelatorioStatusSortOrder !== 'function') return false;
    const sortOrder = getGestaoRelatorioStatusSortOrder(orderProject, statusById);
    return Number.isFinite(sortOrder)
        && sortOrder >= PROGRAMACOES_THIRD_PARTY_MIN_ORDER_PROJECT_SORT
        && sortOrder !== 9999;
}

async function fetchProgramacoesThirdPartyProjects() {
    const statuses = typeof loadOrderProjectStatusesCache === 'function'
        ? await loadOrderProjectStatusesCache()
        : (typeof loadGestaoProjectStatuses === 'function'
            ? await loadGestaoProjectStatuses(true)
            : []);
    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));

    const orderSalesEmbed = typeof getOrderSalesOrderEmbed === 'function'
        ? getOrderSalesOrderEmbed('clientDeliveryDate')
        : `order:salesOrders(id, orderCode, clientId, consultantUserId, clientDeliveryDate, client:Client(name), consultor:appUsers!consultantUserId(name))`;

    const selectWithSort = `
        id,
        orderId,
        orderProjectId,
        status,
        designerId,
        sentAt,
        updatedAt,
        projectCharacteristic:ProjectCharacteristic(id, name),
        thirdPartySubtype:ThirdPartySubtype(id, name),
        designer:appUsers!ThirdPartyProject_designerId_fkey(id, name),
        orderProject:OrderProject(
            id, orderId, name, projectCode, statusId, deliveryPhaseId, deliveryDate, productionMonth,
            projectStatus:OrderProjectStatus(id, name, sortOrder)
        ),
        ${orderSalesEmbed}
    `;

    const selectFallback = `
        id,
        orderId,
        orderProjectId,
        status,
        designerId,
        sentAt,
        updatedAt,
        projectCharacteristic:ProjectCharacteristic(id, name),
        thirdPartySubtype:ThirdPartySubtype(id, name),
        designer:appUsers!ThirdPartyProject_designerId_fkey(id, name),
        orderProject:OrderProject(
            id, orderId, name, projectCode, statusId, deliveryPhaseId, deliveryDate, productionMonth,
            projectStatus:OrderProjectStatus(id, name)
        ),
        ${orderSalesEmbed}
    `;

    const runQuery = async (select) => {
        let query = supabaseClient
            .from('ThirdPartyProject')
            .select(select)
            .neq('status', 'Approved')
            .neq('status', 'Canceled')
            .order('updatedAt', { ascending: true });
        return query;
    };

    let data = null;
    let lastError = null;
    for (const select of [selectWithSort, selectFallback]) {
        const result = await runQuery(select);
        if (!result.error) {
            data = result.data;
            break;
        }
        lastError = result.error;
        if (result.error?.message?.includes('ThirdPartyProject')) {
            return [];
        }
    }

    if (lastError && !data) {
        console.error('fetchProgramacoesThirdPartyProjects:', lastError);
        return [];
    }

    return (data || [])
        .filter(project => isProgramacoesThirdPartyEligible(project, statusById))
        .map(project => {
            const orderProject = project.orderProject;
            if (!orderProject?.projectStatus?.name && orderProject?.statusId) {
                const status = statusById[orderProject.statusId];
                if (status) {
                    orderProject.projectStatus = status;
                }
            }
            return project;
        });
}

function mapProgramacoesThirdPartyRow(project) {
    const order = project.order;
    const orderProject = project.orderProject;
    const orderId = Number(project.orderId || order?.id || orderProject?.orderId) || null;
    const orderCode = order?.orderCode || '—';
    const clientName = typeof getOrderClientName === 'function'
        ? (getOrderClientName(order) || '—')
        : (order?.client?.name || '—');
    const consultantName = typeof getOrderConsultantNameFromRecord === 'function'
        ? (getOrderConsultantNameFromRecord(order) || '—')
        : (order?.consultor?.name || '—');
    const thirdPartyStatusLabel = typeof getThirdPartyProjectStatusLabel === 'function'
        ? getThirdPartyProjectStatusLabel(project.status)
        : (project.status || '—');
    const orderProjectStatusName = typeof getPendenciasProjectStatusName === 'function' && orderProject
        ? getPendenciasProjectStatusName(orderProject)
        : (orderProject?.projectStatus?.name || '—');
    const productionMonth = orderProject?.productionMonth || null;
    const productionMonthLabel = formatProgramacoesProductionMonthLabel(productionMonth);
    const productionMonthSortKey = productionMonth
        ? String(productionMonth).slice(0, 7)
        : '';

    return {
        id: project.id,
        thirdPartyProjectId: Number(project.id),
        orderId,
        orderCode,
        clientName,
        projectName: orderProject?.name || '—',
        subtypeName: project.thirdPartySubtype?.name || '—',
        characteristicName: project.projectCharacteristic?.name || '—',
        thirdPartyStatusLabel,
        thirdPartyStatus: project.status,
        orderProjectStatusName,
        designerName: project.designer?.name || '—',
        consultantName,
        productionMonth,
        productionMonthLabel,
        productionMonthSortKey,
        thirdPartyProject: project
    };
}

function renderProgramacoesThirdPartyProjectNameLinkHtml(row) {
    const name = row.projectName || '—';
    const projectId = Number(row.thirdPartyProjectId);
    if (!projectId || typeof openThirdPartyProjectDetailModal !== 'function') {
        return escapeHtml(name);
    }

    return `<button type="button"
        class="programacoes-third-party-project-link inline-flex items-center gap-0.5 text-left font-medium text-slate-900 hover:text-black hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
        data-third-party-project-id="${projectId}"
        title="Abrir detalhe do projeto de terceiros">
        <span>${escapeHtml(name)}</span>
        ${renderProgramacoesInlineLinkArrowIconHtml()}
    </button>`;
}

function bindProgramacoesThirdPartyDetailLinks(root) {
    root?.querySelectorAll('.programacoes-third-party-project-link').forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const projectId = Number(button.dataset.thirdPartyProjectId);
            const project = programacoesThirdPartyProjectsCache.find(item => Number(item.id) === projectId);
            if (project && typeof openThirdPartyProjectDetailModal === 'function') {
                openThirdPartyProjectDetailModal(project);
            }
        });
    });
}

function programacoesThirdPartyRowMatchesMobileSearch(row, queryNorm) {
    if (!queryNorm) return true;
    const haystack = normalizeProgramacoesMobileSearchText([
        row.orderCode,
        row.clientName,
        row.projectName,
        row.subtypeName,
        row.characteristicName,
        row.thirdPartyStatusLabel,
        row.orderProjectStatusName,
        row.designerName,
        row.consultantName,
        row.productionMonthLabel
    ].join(' '));
    return haystack.includes(queryNorm);
}

function renderProgramacoesThirdPartyMobileCard(row) {
    const statusClass = typeof getThirdPartyProjectStatusBadgeClass === 'function'
        ? getThirdPartyProjectStatusBadgeClass(row.thirdPartyStatus)
        : 'bg-slate-100 text-slate-700';
    const orderStatusClass = typeof getPendenciasProjectStatusBadgeClass === 'function'
        ? getPendenciasProjectStatusBadgeClass(row.orderProjectStatusName)
        : 'bg-slate-100 text-slate-600';
    const orderCodeHtml = renderProgramacoesOrderLinkWithArrowHtml(row, 'text-sm');

    return `
        <article class="programacoes-projects-mobile__card programacoes-third-party-mobile__card" data-third-party-project-id="${Number(row.thirdPartyProjectId)}">
            <div class="programacoes-projects-mobile__headline">
                <p class="programacoes-projects-mobile__order flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    ${orderCodeHtml}
                    <span class="text-slate-300" aria-hidden="true">·</span>
                    <span class="inline-flex items-center min-w-0">${renderProgramacoesThirdPartyProjectNameLinkHtml(row)}</span>
                </p>
                <p class="programacoes-projects-mobile__client">${escapeHtml(String(row.clientName || '—'))}</p>
            </div>
            <div class="programacoes-projects-mobile__status flex flex-wrap items-center gap-1.5">
                <span class="inline-flex items-center text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(row.thirdPartyStatusLabel)}</span>
                <span class="inline-flex items-center text-[10px] px-2 py-1 rounded-full font-bold uppercase ${orderStatusClass}">${escapeHtml(row.orderProjectStatusName)}</span>
            </div>
            <div class="programacoes-projects-mobile__details">
                ${renderProgramacoesMobileInlineField('Subtipo', row.subtypeName)}
                ${renderProgramacoesMobileInlineField('Projetista', row.designerName)}
                ${renderProgramacoesMobileInlineField('Consultor', row.consultantName)}
                ${renderProgramacoesMobileInlineField('Mês prog. prod.', row.productionMonthLabel)}
            </div>
        </article>
    `;
}

function getProgramacoesThirdPartyTableColumns() {
    return [
        {
            key: 'orderCode',
            label: 'Pedido',
            thClass: 'programacoes-col-order whitespace-nowrap',
            cellClass: 'programacoes-col-order px-2 py-2 text-xs whitespace-nowrap',
            render: (row) => renderProgramacoesOrderLinkWithArrowHtml(row, 'text-xs')
        },
        {
            key: 'clientName',
            label: 'Cliente',
            thClass: 'programacoes-col-client',
            cellClass: 'px-2 py-2 text-xs text-slate-600 programacoes-col-client',
            render: (row) => {
                const name = row.clientName || '—';
                return `<span class="programacoes-col-client-text" title="${escapeHtml(name)}">${escapeHtml(name)}</span>`;
            }
        },
        {
            key: 'projectName',
            label: 'Projeto',
            cellClass: 'p-3 text-xs font-medium text-slate-800',
            getFilterValue: row => [row.projectName, row.subtypeName, row.characteristicName].join(' '),
            render: (row) => {
                const subtype = row.subtypeName && row.subtypeName !== '—'
                    ? `<span class="block text-[10px] font-normal text-slate-400">${escapeHtml(row.subtypeName)}</span>`
                    : '';
                return `<span class="inline-flex flex-col items-start gap-0.5">${renderProgramacoesThirdPartyProjectNameLinkHtml(row)}${subtype}</span>`;
            }
        },
        {
            key: 'thirdPartyStatusLabel',
            label: 'Status terceiro',
            thClass: 'whitespace-nowrap',
            cellClass: 'p-3 whitespace-nowrap',
            getFilterValue: row => row.thirdPartyStatusLabel || '',
            render: (row) => {
                const statusClass = typeof getThirdPartyProjectStatusBadgeClass === 'function'
                    ? getThirdPartyProjectStatusBadgeClass(row.thirdPartyStatus)
                    : 'bg-slate-100 text-slate-700';
                return `<span class="inline-flex items-center whitespace-nowrap text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(row.thirdPartyStatusLabel || '—')}</span>`;
            }
        },
        {
            key: 'orderProjectStatusName',
            label: 'Status projeto',
            thClass: 'whitespace-nowrap',
            cellClass: 'p-3 whitespace-nowrap',
            render: (row) => {
                const statusName = row.orderProjectStatusName || '—';
                const statusClass = typeof getPendenciasProjectStatusBadgeClass === 'function'
                    ? getPendenciasProjectStatusBadgeClass(statusName)
                    : 'bg-slate-100 text-slate-600';
                return `<span class="inline-flex items-center whitespace-nowrap text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(statusName)}</span>`;
            }
        },
        {
            key: 'designerName',
            label: 'Projetista',
            cellClass: 'p-3 text-xs text-slate-700'
        },
        {
            key: 'consultantName',
            label: 'Consultor',
            cellClass: 'p-3 text-xs text-slate-600'
        },
        {
            key: 'productionMonthLabel',
            label: 'Mês Prog. Prod.',
            title: 'Mês Programação Produção',
            thClass: 'whitespace-nowrap',
            cellClass: 'p-3 text-xs text-slate-600 whitespace-nowrap',
            getFilterValue: row => [row.productionMonthLabel, row.productionMonth].filter(Boolean).join(' '),
            getSortValue: (row) => row.productionMonthSortKey || '9999-99'
        }
    ];
}

function mountProgramacoesThirdPartyTable(mountEl, rows, onBind) {
    if (!mountEl || typeof mountInteractiveTable !== 'function') {
        if (mountEl) {
            mountEl.innerHTML = '<p class="text-xs text-red-500 text-center py-6 px-4">Tabela indisponível.</p>';
        }
        return;
    }

    mountInteractiveTable(mountEl, {
        tableId: 'programacoes-third-party-projects',
        rows,
        columns: getProgramacoesThirdPartyTableColumns(),
        emptyMessage: 'Nenhum projeto de terceiros na programação.',
        filteredEmptyMessage: 'Nenhum projeto de terceiros encontrado com os filtros aplicados.',
        minWidth: '72rem',
        disableSort: false,
        defaultSort: { key: 'productionMonthLabel', direction: 'asc' },
        onBind(tbody) {
            if (typeof bindOrderCodeLinks === 'function') {
                bindOrderCodeLinks(tbody);
            }
            bindProgramacoesThirdPartyDetailLinks(tbody);
            if (onBind) onBind(tbody);
        }
    });
}

function renderProgramacoesThirdPartyDesktopSection(parentEl, thirdPartyRows) {
    if (!parentEl) return;

    const count = thirdPartyRows.length;
    const section = document.createElement('div');
    section.innerHTML = `
        <div class="collapsible-list-card border border-amber-200 rounded-xl overflow-hidden bg-amber-50/30 shadow-sm">
            <div class="collapsible-list-header px-4 py-3 bg-amber-50/80 border-b border-amber-100 cursor-pointer flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                    <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-amber-800 hover:text-amber-950 text-[10px]"
                        aria-label="Expandir">▼</button>
                    <div>
                        <h3 class="font-bold text-sm text-slate-900">Projetos de terceiros</h3>
                        <p class="text-xs text-slate-500 mt-0.5">Em aberto, com ambiente do pedido no status Implantação ou posterior (ordem ≥ ${PROGRAMACOES_THIRD_PARTY_MIN_ORDER_PROJECT_SORT}).</p>
                    </div>
                    <span class="text-[10px] text-slate-500 shrink-0">${count} registro${count === 1 ? '' : 's'}</span>
                </div>
            </div>
            <div class="collapsible-list-body bg-white p-2 sm:p-3">
                <div id="programacoes-third-party-mount"></div>
            </div>
        </div>
    `;
    parentEl.prepend(section.firstElementChild);

    const mountEl = parentEl.querySelector('#programacoes-third-party-mount');
    mountProgramacoesThirdPartyTable(mountEl, thirdPartyRows);

    if (typeof bindCollapsibleListCardToggles === 'function') {
        bindCollapsibleListCardToggles(parentEl, { defaultCollapsed: false });
    }
}

function renderProgramacoesThirdPartyMobileSection(parentEl, thirdPartyRows) {
    if (!parentEl) return;

    const mountId = 'programacoes-third-party-mobile-list';
    const searchId = 'programacoes-third-party-mobile-search';
    const countId = 'programacoes-third-party-mobile-count';

    const section = document.createElement('div');
    section.innerHTML = `
        <div class="collapsible-list-card border border-amber-200 rounded-xl overflow-hidden bg-white shadow-sm mb-4">
            <div class="collapsible-list-header px-4 py-3 bg-amber-50/80 border-b border-amber-100 cursor-pointer flex flex-wrap items-center gap-2">
                <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-amber-800 text-[10px]"
                    aria-label="Expandir">▼</button>
                <div class="min-w-0 flex-1">
                    <h3 class="font-bold text-sm text-slate-900">Projetos de terceiros</h3>
                    <p class="text-[11px] text-slate-500 mt-0.5">Abertos · ambiente com status ≥ ${PROGRAMACOES_THIRD_PARTY_MIN_ORDER_PROJECT_SORT}</p>
                </div>
                <span id="${countId}" class="text-[10px] text-slate-500 shrink-0" aria-live="polite">${thirdPartyRows.length} registro${thirdPartyRows.length === 1 ? '' : 's'}</span>
            </div>
            <div class="collapsible-list-body p-3 space-y-3">
                <label class="programacoes-projects-mobile__search-wrap block">
                    <input type="search" id="${searchId}" class="programacoes-projects-mobile__search w-full"
                        placeholder="Buscar terceiros…" autocomplete="off">
                </label>
                <div id="${mountId}" class="programacoes-projects-mobile__list space-y-2"></div>
            </div>
        </div>
    `;
    parentEl.prepend(section.firstElementChild);

    const listEl = parentEl.querySelector(`#${mountId}`);
    const searchEl = parentEl.querySelector(`#${searchId}`);
    const countEl = parentEl.querySelector(`#${countId}`);

    const renderList = () => {
        const queryNorm = normalizeProgramacoesMobileSearchText(searchEl?.value || '');
        const visible = thirdPartyRows.filter(row => programacoesThirdPartyRowMatchesMobileSearch(row, queryNorm));
        if (countEl) {
            countEl.textContent = queryNorm
                ? `${visible.length} de ${thirdPartyRows.length}`
                : `${thirdPartyRows.length} registro${thirdPartyRows.length === 1 ? '' : 's'}`;
        }
        if (!listEl) return;
        if (!visible.length) {
            listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">${queryNorm ? 'Nenhum resultado na busca.' : 'Nenhum projeto de terceiros.'}</p>`;
            return;
        }
        listEl.innerHTML = visible.map(row => renderProgramacoesThirdPartyMobileCard(row)).join('');
        if (typeof bindOrderCodeLinks === 'function') {
            bindOrderCodeLinks(listEl);
        }
        bindProgramacoesThirdPartyDetailLinks(listEl);
    };

    searchEl?.addEventListener('input', renderList);
    renderList();

    if (typeof bindCollapsibleListCardToggles === 'function') {
        bindCollapsibleListCardToggles(parentEl, { defaultCollapsed: false });
    }
}

function getProgramacoesProjectsSelect() {
    const orderEmbed = typeof getOrderSalesOrderEmbed === 'function'
        ? getOrderSalesOrderEmbed('clientDeliveryDate')
        : 'order:salesOrders(id, orderCode, clientId, clientDeliveryDate, client:Client(name))';
    const base = typeof getPendenciasProjectSelect === 'function'
        ? getPendenciasProjectSelect({ orderExtraFields: 'clientDeliveryDate' })
        : `
        id, orderId, projectCode, name, designerId, statusId, deliveryDate, deliveryPhaseId,
        ${orderEmbed},
        designer:appUsers!OrderProject_designerId_fkey(id, name),
        projectStatus:OrderProjectStatus(id, name)
    `;

    return `${base}, isComplementary, isReplaced, productionMonth, saleValue`;
}

function formatProgramacoesDateLabel(dateStr) {
    if (typeof formatPendenciasDeliveryDate === 'function') {
        return formatPendenciasDeliveryDate(dateStr);
    }
    if (!dateStr) return '—';
    const normalized = String(dateStr).slice(0, 10);
    const [year, month, day] = normalized.split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return String(dateStr);
}

function getProgramacoesClientDeliveryPhase(project, phasesByOrderId = {}) {
    const phases = phasesByOrderId[Number(project?.orderId)] || [];
    if (phases.length < 2) return null;
    const phaseId = Number(project?.deliveryPhaseId);
    return (phaseId
        ? phases.find(item => Number(item.id) === phaseId)
        : phases[0]) || null;
}

function getProgramacoesClientDeliveryDate(project, phasesByOrderId = {}) {
    const phase = getProgramacoesClientDeliveryPhase(project, phasesByOrderId);
    if (phase?.deliveryDate) return phase.deliveryDate;
    return project?.order?.clientDeliveryDate || null;
}

function getProgramacoesLockedDesigner(user = currentUser) {
    if (!user || user.role !== 'Projetista') return null;
    if (typeof isGestorProjetos === 'function' && isGestorProjetos(user)) return null;
    return user;
}

function formatProgramacoesProductionMonthLabel(productionMonth) {
    if (typeof toProgramacaoProducaoMonthInputValue === 'function'
        && typeof formatProgramacaoProducaoMonthLabel === 'function') {
        return formatProgramacaoProducaoMonthLabel(toProgramacaoProducaoMonthInputValue(productionMonth));
    }

    if (!productionMonth) return '—';
    const part = String(productionMonth).split('T')[0];
    const [year, month] = part.split('-');
    if (!year || !month) return '—';
    const date = new Date(Number(year), Number(month) - 1, 1);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

async function fetchProgramacoesProjectsQueue() {
    const result = await supabaseClient
        .from('ProjectProductionQueue')
        .select(`
            id,
            sequence,
            orderProjectId,
            orderProject:OrderProject!orderProjectId(${getProgramacoesProjectsSelect()})
        `)
        .order('sequence', { ascending: true });

    if (result.error) return result;

    const rows = (result.data || [])
        .map(item => {
            const project = item.orderProject;
            if (!project || Array.isArray(project)) return null;
            return {
                ...item,
                orderProject: project
            };
        })
        .filter(Boolean);

    const projects = rows.map(row => row.orderProject);
    const activeProjects = typeof prepareProgramacoesVisibleOrderProjects === 'function'
        ? prepareProgramacoesVisibleOrderProjects(projects)
        : (typeof excludeInactivePendenciasProjects === 'function'
            ? excludeInactivePendenciasProjects(projects)
            : projects);
    const activeIds = new Set(activeProjects.map(project => Number(project.id)));

    return {
        ...result,
        data: rows.filter(row => activeIds.has(Number(row.orderProject.id)))
    };
}

function renderProgramacoesSequenceCell(row, options = {}) {
    const maxSequence = Number(options.maxSequence) || Number(row.sequence) || 1;
    if (!options.canReorder) {
        return escapeHtml(String(row.sequence || '—'));
    }

    return `<input type="number"
        class="programacoes-seq-input"
        min="1"
        max="${maxSequence}"
        step="1"
        value="${Number(row.sequence) || 1}"
        data-order-project-id="${Number(row.orderProjectId)}"
        data-current-sequence="${Number(row.sequence) || 1}"
        title="Posição na fila completa (não na lista filtrada). Enter confirma."
        aria-label="Sequência na fila">`;
}

function bindProgramacoesSequenceInputs(tbody) {
    tbody?.querySelectorAll('.programacoes-seq-input').forEach(input => {
        const restore = () => {
            input.value = input.dataset.currentSequence || '';
        };

        input.addEventListener('click', event => event.stopPropagation());
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                input.blur();
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                restore();
                input.blur();
            }
        });
        input.addEventListener('blur', () => {
            const orderProjectId = Number(input.dataset.orderProjectId);
            const current = Number(input.dataset.currentSequence);
            const raw = String(input.value || '').trim();
            if (!raw) {
                restore();
                return;
            }
            const next = Math.round(Number(raw));
            if (!orderProjectId || !Number.isFinite(next)) {
                restore();
                return;
            }
            if (next === current) return;
            moveProgramacoesProjectToPosition(orderProjectId, next);
        });
        input.addEventListener('wheel', event => {
            if (document.activeElement === input) event.preventDefault();
        }, { passive: false });
    });
}

async function fetchProgramacoesRevisionInProgressIds(projects) {
    if (!projects?.length) return new Set();
    const workloadShape = [{ projects }];
    const commercialReviewProjIds = typeof collectPendenciasWorkloadProjectIdsByStatus === 'function'
        ? collectPendenciasWorkloadProjectIdsByStatus(workloadShape, PENDENCIAS_STATUS_EM_REVISAO_TECNICA)
        : [];
    const technicalReviewProjIds = typeof collectPendenciasWorkloadProjectIdsByStatus === 'function'
        ? collectPendenciasWorkloadProjectIdsByStatus(workloadShape, ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ)
        : [];
    const [commercialInProgressIds, technicalInProgressIds] = await Promise.all([
        typeof fetchRevisionInProgressByOrderProjectIds === 'function'
            ? fetchRevisionInProgressByOrderProjectIds(commercialReviewProjIds)
            : Promise.resolve(new Set()),
        typeof fetchTechnicalReviewerRevisionInProgressByOrderProjectIds === 'function'
            ? fetchTechnicalReviewerRevisionInProgressByOrderProjectIds(technicalReviewProjIds)
            : Promise.resolve(new Set())
    ]);
    return new Set([...commercialInProgressIds, ...technicalInProgressIds]);
}

function programacoesProjectRowMatchesMobileSearch(row, queryNorm) {
    if (!queryNorm) return true;
    const haystack = normalizeProgramacoesMobileSearchText([
        row.orderCode,
        row.clientName,
        row.projectName,
        row.consultantName,
        row.statusName,
        row.revisionInProgress ? 'em andamento revisao' : '',
        ...(typeof getOrderProjectOpenSubstatusFilterLabels === 'function' && row.project
            ? getOrderProjectOpenSubstatusFilterLabels(row.project)
            : []),
        row.designerName,
        row.clientDeliveryLabel,
        row.clientDeliveryPhaseName,
        row.productionMonthLabel,
        row.characteristicFilterText
    ].join(' '));
    return haystack.includes(queryNorm);
}

function renderProgramacoesProjectsMobileCard(row, options = {}) {
    const { canReorder, maxSequence } = options;
    const seqHtml = canReorder
        ? renderProgramacoesSequenceCell(row, { canReorder, maxSequence })
        : `<span class="programacoes-projects-mobile__seq">${escapeHtml(String(row.sequence || '—'))}</span>`;
    const phaseName = String(row.clientDeliveryPhaseName || '').trim();
    const deliveryValue = phaseName
        ? `${phaseName}: ${row.clientDeliveryLabel || '—'}`
        : (row.clientDeliveryLabel || '—');

    const characteristicsBlock = row.characteristicHtml && row.characteristicHtml !== '—'
        ? `<div class="programacoes-projects-mobile__chips">${row.characteristicHtml}</div>`
        : '';

    const detailFields = [
        renderProgramacoesMobileInlineField('Consultor', row.consultantName),
        renderProgramacoesMobileInlineField('Dt entrg. cli.', deliveryValue),
        renderProgramacoesMobileInlineField('Projetista', row.designerName),
        renderProgramacoesMobileInlineField('Mês prog. prod.', row.productionMonthLabel)
    ].join('');

    return `
        <article class="programacoes-projects-mobile__card" data-order-project-id="${Number(row.orderProjectId)}">
            <div class="programacoes-projects-mobile__card-top">
                <div class="programacoes-projects-mobile__seq-wrap">${seqHtml}</div>
                <div class="programacoes-projects-mobile__headline">
                    ${renderProgramacoesMobileHeadlineHtml(row)}
                </div>
            </div>
            ${renderProgramacoesMobileStatusHtml(row)}
            <div class="programacoes-projects-mobile__details">
                ${detailFields}
            </div>
            ${characteristicsBlock}
        </article>
    `;
}

function bindProgramacoesProjectsMobileList(root, options = {}) {
    if (typeof bindOrderCodeLinks === 'function') {
        bindOrderCodeLinks(root);
    }
    if (options.canReorder) {
        bindProgramacoesSequenceInputs(root);
    }
}

function renderProgramacoesProjectsMobileScreen(content, config = {}) {
    const { rows = [], canReorder = false, maxSequence = 1, onRefresh } = config;
    renderProgramacoesMobileListScreen(content, {
        screenId: 'programacoes-projects',
        title: 'Projetos',
        subtitle: 'Prioridade do time de projetos para entregar à produção. Quanto mais acima, maior a prioridade.',
        refreshButtonId: 'btn-programacoes-refresh-projects',
        headerActionsHtml: typeof PROGRAMACOES_FULLSCREEN_BUTTON_HTML === 'string'
            ? PROGRAMACOES_FULLSCREEN_BUTTON_HTML
            : '',
        onRefresh,
        rows,
        emptyMessage: 'Nenhum projeto na fila de programação.',
        rowMatchesSearch: programacoesProjectRowMatchesMobileSearch,
        renderCard: (row) => renderProgramacoesProjectsMobileCard(row, { canReorder, maxSequence }),
        onListRendered(mountEl) {
            bindProgramacoesProjectsMobileList(mountEl, { canReorder });
        }
    });
}

function renderProgramacoesProjectsTable(
    queueRows = [],
    phasesByOrderId = {},
    characteristicsMap = new Map(),
    revisionInProgressIds = new Set(),
    thirdPartyRows = []
) {
    const content = document.getElementById('programacoes-content');
    if (!content) return;

    const canReorder = typeof canReorderProgramacoesProjects === 'function'
        && canReorderProgramacoesProjects();
    const maxSequence = queueRows.reduce((max, row) => Math.max(max, Number(row.sequence) || 0), 0);

    const rows = queueRows.map(item => {
        const project = item.orderProject;
        const statusName = typeof getPendenciasProjectStatusName === 'function'
            ? getPendenciasProjectStatusName(project)
            : (project?.projectStatus?.name || '—');
        const clientDeliveryPhase = getProgramacoesClientDeliveryPhase(project, phasesByOrderId);
        const clientDeliveryDate = getProgramacoesClientDeliveryDate(project, phasesByOrderId);
        const clientDeliveryLabel = formatProgramacoesDateLabel(clientDeliveryDate);
        const productionMonth = project?.productionMonth || null;
        const productionMonthLabel = formatProgramacoesProductionMonthLabel(productionMonth);
        const characteristicRows = characteristicsMap.get(Number(project.id)) || [];
        const characteristicHtml = typeof renderProgramacoesProjectCharacteristicsCell === 'function'
            ? renderProgramacoesProjectCharacteristicsCell(characteristicRows)
            : '—';
        const characteristicFilterText = characteristicRows
            .map(row => row.characteristic?.name)
            .filter(Boolean)
            .join(' ');
        const revisionInProgress = revisionInProgressIds.has(Number(project.id));
        const consultantName = typeof getOrderConsultantNameFromRecord === 'function'
            ? (getOrderConsultantNameFromRecord(project?.order) || '—')
            : (project?.order?.consultor?.name || '—');

        return (typeof mapPendenciasInteractiveIdentity === 'function'
            ? mapPendenciasInteractiveIdentity(project, {
                id: project.id,
                orderProjectId: Number(item.orderProjectId || project.id),
                sequence: Number(item.sequence) || 0,
                statusName,
                revisionInProgress,
                clientDeliveryLabel,
                clientDeliveryDate,
                clientDeliveryPhaseName: clientDeliveryPhase?.name || '',
                characteristicRows,
                characteristicHtml,
                characteristicFilterText,
                productionMonth,
                productionMonthLabel,
                consultantName,
                designerName: project?.designer?.name || '—',
                orderId: Number(project?.orderId || project?.order?.id) || null
            })
            : {
                id: project.id,
                orderProjectId: Number(item.orderProjectId || project.id),
                sequence: Number(item.sequence) || 0,
                orderId: Number(project?.orderId || project?.order?.id) || null,
                orderCode: project?.order?.orderCode || '—',
                clientName: project?.order?.client?.name || '—',
                projectName: project?.name || '—',
                statusName,
                revisionInProgress,
                consultantName,
                designerName: project?.designer?.name || '—',
                clientDeliveryLabel,
                clientDeliveryDate,
                clientDeliveryPhaseName: clientDeliveryPhase?.name || '',
                characteristicRows,
                characteristicHtml,
                characteristicFilterText,
                productionMonth,
                productionMonthLabel
            });
    });

    content.innerHTML = '<div id="programacoes-projects-screen" class="space-y-4"></div>';
    const screen = document.getElementById('programacoes-projects-screen');
    if (!screen) return;

    const mainMount = document.createElement('div');
    screen.appendChild(mainMount);

    if (typeof isMobileViewport === 'function' && isMobileViewport()) {
        renderProgramacoesThirdPartyMobileSection(screen, thirdPartyRows);
        renderProgramacoesProjectsMobileScreen(mainMount, {
            rows,
            canReorder,
            maxSequence,
            onRefresh: loadProgramacoesProjects
        });
        return;
    }

    renderProgramacoesThirdPartyDesktopSection(screen, thirdPartyRows);

    const columns = [
        {
            key: 'sequence',
            label: 'Seq.',
            title: 'Sequência',
            type: 'number',
            thClass: 'programacoes-col-seq whitespace-nowrap',
            cellClass: 'programacoes-col-seq px-1 py-2 text-xs font-semibold text-slate-700 tabular-nums text-center whitespace-nowrap',
            filterInputClass: 'interactive-table-filter-input--compact',
            getFilterValue: row => String(row.sequence || ''),
            render: (row) => renderProgramacoesSequenceCell(row, { canReorder, maxSequence })
        },
        {
            key: 'orderCode',
            label: 'Pedido',
            thClass: 'programacoes-col-order whitespace-nowrap',
            cellClass: 'programacoes-col-order px-2 py-2 text-xs whitespace-nowrap',
            filterInputClass: 'interactive-table-filter-input--compact',
            render: (row) => renderProgramacoesOrderLinkWithArrowHtml(row, 'text-xs')
        },
        {
            key: 'clientName',
            label: 'Cliente',
            thClass: 'programacoes-col-client',
            cellClass: 'px-2 py-2 text-xs text-slate-600 programacoes-col-client',
            render: (row) => {
                const name = row.clientName || '—';
                return `<span class="programacoes-col-client-text" title="${escapeHtml(name)}">${escapeHtml(name)}</span>`;
            }
        },
        {
            key: 'projectName',
            label: 'Projeto',
            cellClass: 'p-3 text-xs font-medium text-slate-800',
            getFilterValue: row => [
                row.projectName,
                row.revisionInProgress ? 'Em andamento' : ''
            ].filter(Boolean).join(' '),
            render: (row) => {
                const name = row.projectName || '—';
                const badge = row.revisionInProgress
                    && typeof renderProgramacoesRevisionInProgressBadgeHtml === 'function'
                    ? renderProgramacoesRevisionInProgressBadgeHtml()
                    : '';
                return `<span class="inline-flex items-center gap-1.5 flex-wrap"><span>${escapeHtml(name)}</span>${badge}</span>`;
            }
        },
        {
            key: 'consultantName',
            label: 'Consultor',
            cellClass: 'p-3 text-xs text-slate-600'
        },
        {
            key: 'statusName',
            label: 'Status',
            thClass: 'whitespace-nowrap',
            cellClass: 'p-3 whitespace-nowrap',
            getFilterValue: row => [
                row.statusName,
                row.revisionInProgress ? 'Em andamento' : '',
                ...(typeof getOrderProjectOpenSubstatusFilterLabels === 'function' && row.project
                    ? getOrderProjectOpenSubstatusFilterLabels(row.project)
                    : [])
            ].filter(Boolean).join(' '),
            render: (row) => {
                const statusName = row.statusName || '—';
                const statusClass = row.statusClass
                    || (typeof getPendenciasProjectStatusBadgeClass === 'function'
                        ? getPendenciasProjectStatusBadgeClass(statusName)
                        : 'bg-slate-100 text-slate-600');
                const revisionBadge = row.revisionInProgress
                    && typeof renderProgramacoesRevisionInProgressBadgeHtml === 'function'
                    ? renderProgramacoesRevisionInProgressBadgeHtml()
                    : '';
                const flag = row.project && typeof renderOrderProjectOpenSubstatusFlagsHtml === 'function'
                    ? renderOrderProjectOpenSubstatusFlagsHtml(row.project)
                    : '';
                return `<span class="inline-flex flex-col items-start gap-1"><span class="inline-flex flex-wrap items-center gap-1.5"><span class="inline-flex items-center whitespace-nowrap text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(statusName)}</span>${revisionBadge}</span>${flag ? `<span class="mt-0.5">${flag}</span>` : ''}</span>`;
            }
        },
        {
            key: 'designerName',
            label: 'Projetista',
            cellClass: 'p-3 text-xs text-slate-700'
        },
        {
            key: 'clientDeliveryLabel',
            label: 'Dt Entrg. Cli.',
            title: 'Data de entrega no cliente (fase do projeto, se houver)',
            thClass: 'whitespace-nowrap',
            cellClass: 'p-3 text-xs text-slate-600 whitespace-nowrap',
            getFilterValue: row => [
                row.clientDeliveryLabel,
                row.clientDeliveryDate,
                row.clientDeliveryPhaseName
            ].filter(Boolean).join(' '),
            render: (row) => {
                const label = row.clientDeliveryLabel || '—';
                const phaseName = String(row.clientDeliveryPhaseName || '').trim();
                const title = phaseName
                    ? `${phaseName}: ${label}`
                    : 'Data de entrega no cliente';
                const phaseHtml = phaseName
                    ? `<span class="block text-[10px] leading-tight text-slate-400 font-medium">${escapeHtml(phaseName)}</span>`
                    : '';
                return `<span title="${escapeHtml(title)}">${escapeHtml(label)}${phaseHtml}</span>`;
            }
        },
        {
            key: 'characteristicFilterText',
            label: 'Características',
            title: 'Características do projeto',
            thClass: 'programacoes-col-characteristics whitespace-nowrap',
            cellClass: 'p-2 programacoes-col-characteristics',
            getFilterValue: row => row.characteristicFilterText || '',
            render: (row) => row.characteristicHtml || '—'
        },
        {
            key: 'productionMonthLabel',
            label: 'Mês Prog. Prod.',
            title: 'Mês Programação Produção',
            thClass: 'whitespace-nowrap',
            cellClass: 'p-3 text-xs text-slate-600 whitespace-nowrap',
            getFilterValue: row => [row.productionMonthLabel, row.productionMonth].filter(Boolean).join(' ')
        }
    ];

    if (typeof renderPendenciasInteractiveTableScreen !== 'function') {
        content.innerHTML = '<p class="text-xs text-red-500 text-center py-8 px-4">Componente de tabela indisponível.</p>';
        return;
    }

    renderPendenciasInteractiveTableScreen(mainMount, {
        title: 'Projetos',
        subtitle: 'Prioridade do time de projetos para entregar à produção. Quanto mais acima, maior a prioridade.',
        refreshButtonId: 'btn-programacoes-refresh-projects',
        headerActionsHtml: typeof PROGRAMACOES_FULLSCREEN_BUTTON_HTML === 'string'
            ? PROGRAMACOES_FULLSCREEN_BUTTON_HTML
            : '',
        onRefresh: loadProgramacoesProjects,
        tableId: 'programacoes-projects',
        rows,
        columns,
        disableSort: true,
        minWidth: '84rem',
        emptyMessage: 'Nenhum projeto na fila de programação.',
        onBind(tbody) {
            if (typeof syncProgramacoesFullscreenButton === 'function') {
                syncProgramacoesFullscreenButton();
            }
            if (typeof bindOrderCodeLinks === 'function') {
                bindOrderCodeLinks(tbody);
            }
            if (canReorder) {
                bindProgramacoesSequenceInputs(tbody);
            }
        }
    });
    if (typeof syncProgramacoesFullscreenButton === 'function') {
        syncProgramacoesFullscreenButton();
    }
}

async function moveProgramacoesProjectToPosition(orderProjectId, sequence) {
    if (typeof canReorderProgramacoesProjects === 'function' && !canReorderProgramacoesProjects()) {
        return;
    }

    if (typeof setProgramacoesActionLoading === 'function') {
        setProgramacoesActionLoading(true, 'Atualizando prioridade...');
    }

    try {
        const { error } = await supabaseClient.rpc('move_project_production_queue_to_position', {
            p_order_project_id: Number(orderProjectId),
            p_sequence: Number(sequence)
        });
        if (error) throw error;
        await loadProgramacoesProjects({ silent: true });
    } catch (error) {
        console.error('moveProgramacoesProjectToPosition:', error);
        const message = isMissingProjectProductionQueueError(error)
            || /could not find the function/i.test(String(error?.message || ''))
            ? 'Execute supabase/feats/move-project-production-queue-to-position.sql no SQL Editor do DEV.'
            : (error?.message || 'Não foi possível alterar a sequência.');
        alertAppDialog(message);
        await loadProgramacoesProjects({ silent: true });
    } finally {
        if (typeof setProgramacoesActionLoading === 'function') {
            setProgramacoesActionLoading(false);
        }
    }
}

async function loadProgramacoesProjects(options = {}) {
    const content = document.getElementById('programacoes-content');
    if (!content) return;

    if (!options.silent) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando programações...</p>';
    }

    const [result, thirdPartyProjects] = await Promise.all([
        fetchProgramacoesProjectsQueue(),
        fetchProgramacoesThirdPartyProjects()
    ]);

    if (result.error) {
        console.error('loadProgramacoesProjects:', result.error);
        const message = isMissingProjectProductionQueueError(result.error)
            ? 'Execute supabase/feats/create-project-production-queue.sql no SQL Editor do DEV.'
            : `Erro ao carregar: ${result.error.message}`;
        content.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 class="font-bold text-sm text-slate-900">Projetos</h3>
                </div>
                <p class="text-xs text-red-500 text-center py-10 px-4">${escapeHtml(message)}</p>
            </div>
        `;
        return;
    }

    const queueRows = result.data || [];
    const projects = queueRows.map(row => row.orderProject).filter(Boolean);
    if (typeof attachOpenOrderProjectSubstatuses === 'function') {
        await attachOpenOrderProjectSubstatuses(projects);
    }
    const phasesByOrderId = typeof fetchPhasesByOrderIdForPendenciasProjects === 'function'
        ? await fetchPhasesByOrderIdForPendenciasProjects(projects)
        : {};
    const projectIds = projects.map(project => project.id).filter(Boolean);
    const characteristicsMap = typeof fetchOrderProjectCharacteristicsMap === 'function'
        ? await fetchOrderProjectCharacteristicsMap(projectIds)
        : new Map();
    const revisionInProgressIds = await fetchProgramacoesRevisionInProgressIds(projects);

    programacoesThirdPartyProjectsCache = thirdPartyProjects;
    const thirdPartyRows = thirdPartyProjects
        .map(project => mapProgramacoesThirdPartyRow(project));

    renderProgramacoesProjectsTable(
        queueRows,
        phasesByOrderId,
        characteristicsMap,
        revisionInProgressIds,
        thirdPartyRows
    );
}

window.loadProgramacoesProjects = loadProgramacoesProjects;
