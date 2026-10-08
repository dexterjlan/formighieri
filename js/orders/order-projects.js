let environmentTypesCache = [];
let orderProjectsCache = [];
const orderProjectsAggregatorExpandedIds = new Set();

function syncOrderProjectAggregatorToggleButton(button, expanded) {
    if (!button) return;
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.title = expanded ? 'Recolher ambientes' : 'Expandir ambientes';
    const icon = button.querySelector('.order-project-aggregator-toggle__icon');
    if (icon) {
        icon.textContent = expanded ? '▼' : '▶';
    }
}

function setOrderProjectAggregatorChildrenExpanded(grid, aggregatorId, expanded) {
    const normalizedId = Number(aggregatorId);
    if (!normalizedId || !grid) return;

    const wrapper = grid.querySelector(
        `.order-projects-grid__children[data-aggregator-id="${normalizedId}"]`
    );
    const toggle = grid.querySelector(
        `.order-project-aggregator-toggle[data-aggregator-id="${normalizedId}"]`
    );

    if (expanded) {
        orderProjectsAggregatorExpandedIds.add(normalizedId);
        wrapper?.classList.remove('is-collapsed');
    } else {
        orderProjectsAggregatorExpandedIds.delete(normalizedId);
        wrapper?.classList.add('is-collapsed');
    }

    syncOrderProjectAggregatorToggleButton(toggle, expanded);
}

async function loadEnvironmentTypes() {
    if (environmentTypesCache.length) return environmentTypesCache;

    const { data, error } = await supabaseClient
        .from('EnvironmentType')
        .select('id, name')
        .order('name', { ascending: true });

    if (error) {
        console.error('loadEnvironmentTypes:', error);
        return [];
    }

    environmentTypesCache = data || [];
    return environmentTypesCache;
}

async function getVendidoProjectStatusId() {
    if (typeof getOrderProjectStatusIdByName === 'function') {
        const vendidoId = await getOrderProjectStatusIdByName('Vendido');
        if (vendidoId) return vendidoId;
    }

    if (typeof loadOrderProjectStatusesCache === 'function') {
        const cache = await loadOrderProjectStatusesCache();
        const firstActive = cache.find(status => status.isActive !== false);
        return firstActive?.id || cache[0]?.id || null;
    }

    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Vendido')
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .limit(1)
        .maybeSingle();

    return fallback?.id || null;
}

async function populateEnvironmentTypeSelect() {
    const select = document.getElementById('project-environment-type');
    const types = [...(await loadEnvironmentTypes())].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    );

    select.innerHTML = '<option value="">Selecione...</option>';

    if (!types.length) {
        select.innerHTML += '<option value="" disabled>Nenhum tipo cadastrado</option>';
        return;
    }

    types.forEach(t => {
        select.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
}

async function openOrderProjectModal() {
    if (!activeOrderId) {
        alertAppDialog('Selecione um pedido primeiro.');
        return;
    }

    document.getElementById('order-project-form').reset();
    await populateEnvironmentTypeSelect();
    toggleModal('order-project-modal', true);
}

function closeOrderProjectModal() {
    toggleModal('order-project-modal', false);
}

window.openOrderProjectModal = openOrderProjectModal;
window.closeOrderProjectModal = closeOrderProjectModal;

function updateProjectsListHeader(count) {
    const countEl = document.getElementById('order-projects-count');
    if (countEl) {
        countEl.textContent = `(${count})`;
    }
}

async function fetchOrderProjectActionContext(orderId, projectIds, projects = null) {
    const [approvalsByProject, implantacaoByProjectId, medicaoByProject, conferenciaByProject] = await Promise.all([
        typeof fetchCommercialApprovalsByProjectIds === 'function'
            ? fetchCommercialApprovalsByProjectIds(projectIds, projects)
            : Promise.resolve({}),
        typeof fetchImplantacoesMapForProjectIds === 'function'
            ? fetchImplantacoesMapForProjectIds(projectIds)
            : Promise.resolve({}),
        typeof fetchMedicaoContextByProjectIds === 'function'
            ? fetchMedicaoContextByProjectIds(projectIds, orderId)
            : Promise.resolve({}),
        typeof fetchAnteprojetoConferenceContextByProjectIds === 'function'
            ? fetchAnteprojetoConferenceContextByProjectIds(projectIds, orderId)
            : Promise.resolve({})
    ]);

    let revisionsByProject = {};

    if (projectIds.length && typeof fetchCommercialRevisionsByApprovalIds === 'function') {
        revisionsByProject = await fetchCommercialRevisionsByApprovalIds(projectIds);
    }

    let implantacaoMap = implantacaoByProjectId || {};
    const projectsForSync = projects || orderProjectsCache;
    if (typeof syncImplantacaoRecordsMapForProjects === 'function' && projectsForSync.length) {
        implantacaoMap = await syncImplantacaoRecordsMapForProjects(projectsForSync, implantacaoMap);
    }

    return {
        orderId,
        approvalsByProject,
        revisionsByProject,
        implantacaoByProjectId: implantacaoMap,
        medicaoByProject,
        conferenciaByProject
    };
}

async function fetchOrderProjectsForOrder(orderId) {
    let result = await supabaseClient
        .from('OrderProject')
        .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name, sortOrder), designer:appUsers!OrderProject_designerId_fkey(id, name), deliveryPhaseId, parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), replacedBy:replacedByProjectId(projectCode, order:salesOrders(orderCode)), replaces:replacesProjectId(projectCode, saleValue, order:salesOrders(orderCode))')
        .eq('orderId', orderId)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('deliveryPhaseId')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name, sortOrder), designer:appUsers!OrderProject_designerId_fkey(id, name), parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), replacedBy:replacedByProjectId(projectCode, order:salesOrders(orderCode)), replaces:replacesProjectId(projectCode, saleValue, order:salesOrders(orderCode))')
            .eq('orderId', orderId)
            .order('name', { ascending: true });
    }

    if (result.error?.message?.includes('designer')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), replacedBy:replacedByProjectId(projectCode, order:salesOrders(orderCode)), replaces:replacesProjectId(projectCode, saleValue, order:salesOrders(orderCode))')
            .eq('orderId', orderId)
            .order('name', { ascending: true });
    }

    if (result.error?.message?.includes('parentProject') || result.error?.message?.includes('isComplementary')
        || result.error?.message?.includes('substituidoPor') || result.error?.message?.includes('substitui')
        || result.error?.message?.includes('isReplaced') || result.error?.message?.includes('isReplacement')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)')
            .eq('orderId', orderId)
            .order('name', { ascending: true });
    }

    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('OrderProjectStatus')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name)')
            .eq('orderId', orderId)
            .order('name', { ascending: true });
    }

    if (result.error) {
        console.error('fetchOrderProjectsForOrder:', result.error);
        return [];
    }

    return enrichOrderProjectsForList(result.data || []);
}

async function enrichOrderProjectsWithStatus(projects) {
    if (!projects.length) return projects;

    const needsEnrich = projects.some(project => project.statusId && !project.projectStatus);
    if (!needsEnrich) return projects;

    const statusIds = [...new Set(projects.map(project => project.statusId).filter(Boolean))];
    if (!statusIds.length) return projects;

    let statuses = [];
    if (typeof ensureOrderProjectStatusesForIds === 'function') {
        statuses = await ensureOrderProjectStatusesForIds(statusIds);
    } else {
        const { data, error } = await supabaseClient
            .from('OrderProjectStatus')
            .select('id, name, sortOrder')
            .in('id', statusIds);

        if (error) {
            console.error('enrichOrderProjectsWithStatus:', error);
            return projects;
        }

        statuses = data || [];
    }

    const statusById = Object.fromEntries(statuses.map(status => [status.id, status]));
    return projects.map(project => ({
        ...project,
        projectStatus: project.projectStatus || statusById[project.statusId] || null
    }));
}

async function enrichOrderProjectsWithDesigner(projects) {
    if (!projects.length) return projects;

    const needsEnrich = projects.some(project => project.designerId && !project.designer?.name);
    if (!needsEnrich) return projects;

    const designerIds = [...new Set(projects.map(project => project.designerId).filter(Boolean))];
    if (!designerIds.length) return projects;

    const { data: designers, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .in('id', designerIds);

    if (error) {
        console.error('enrichOrderProjectsWithDesigner:', error);
        return projects;
    }

    const designerById = Object.fromEntries((designers || []).map(designer => [designer.id, designer]));
    return projects.map(project => ({
        ...project,
        designer: project.designer || designerById[project.designerId] || null
    }));
}

async function enrichOrderProjectsWithSubstitutionRelations(projects) {
    if (!projects.length) return projects;

    const relatedIds = new Set();
    projects.forEach(project => {
        if (project.replacedByProjectId) relatedIds.add(Number(project.replacedByProjectId));
        if (project.replacesProjectId) relatedIds.add(Number(project.replacesProjectId));
        if (project.parentProjectId) relatedIds.add(Number(project.parentProjectId));
    });

    if (!relatedIds.size) return projects;

    let result = await supabaseClient
        .from('OrderProject')
        .select('id, projectCode, orderId, order:salesOrders(orderCode)')
        .in('id', [...relatedIds]);

    if (result.error?.message?.includes('order')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, projectCode, orderId')
            .in('id', [...relatedIds]);
    }

    if (result.error) {
        console.error('enrichOrderProjectsWithSubstitutionRelations:', result.error);
        return projects;
    }

    const relatedById = Object.fromEntries((result.data || []).map(item => [item.id, item]));
    const missingOrderIds = [...new Set(
        (result.data || [])
            .filter(item => item.orderId && !item.order?.orderCode)
            .map(item => item.orderId)
    )];

    let orderCodeById = {};
    if (missingOrderIds.length) {
        const ordersResult = await supabaseClient
            .from('salesOrders')
            .select('id, orderCode')
            .in('id', missingOrderIds);

        if (!ordersResult.error) {
            orderCodeById = Object.fromEntries(
                (ordersResult.data || []).map(order => [order.id, order.orderCode])
            );
        }
    }

    return projects.map(project => {
        const enriched = { ...project };

        if (project.replacedByProjectId && relatedById[project.replacedByProjectId]) {
            const related = relatedById[project.replacedByProjectId];
            const orderCode = related.order?.orderCode || orderCodeById[related.orderId] || '';
            enriched.replacedByProject = {
                ...(enriched.replacedByProject || {}),
                projectCode: related.projectCode,
                order: { orderCode }
            };
            enriched.replacedByProjectCode = related.projectCode || enriched.replacedByProjectCode;
            enriched.replacedByOrderCode = orderCode || enriched.replacedByOrderCode;
        }

        if (project.replacesProjectId && relatedById[project.replacesProjectId]) {
            const related = relatedById[project.replacesProjectId];
            const orderCode = related.order?.orderCode || orderCodeById[related.orderId] || '';
            enriched.replacesProject = {
                ...(enriched.replacesProject || {}),
                projectCode: related.projectCode,
                order: { orderCode }
            };
            enriched.replacesProjectCode = related.projectCode || enriched.replacesProjectCode;
            enriched.replacesOrderCode = orderCode || enriched.replacesOrderCode;
        }

        if (project.parentProjectId && relatedById[project.parentProjectId]) {
            const related = relatedById[project.parentProjectId];
            const orderCode = related.order?.orderCode || orderCodeById[related.orderId] || '';
            enriched.parentProject = {
                ...(enriched.parentProject || {}),
                projectCode: related.projectCode,
                order: { orderCode }
            };
            enriched.parentProjectCode = related.projectCode || enriched.parentProjectCode;
            enriched.parentOrderCode = orderCode || enriched.parentOrderCode;
        }

        return enriched;
    });
}

async function enrichOrderProjectsForList(projects) {
    let enriched = await enrichOrderProjectsWithStatus(projects);
    enriched = await enrichOrderProjectsWithDesigner(enriched);
    enriched = await enrichOrderProjectsWithSubstitutionRelations(enriched);
    return enriched;
}

function getOrderProjectsListTopLevel(projects = orderProjectsCache) {
    return (projects || []).filter(
        project => !(typeof isOrderProjectGroupedChild === 'function' && isOrderProjectGroupedChild(project))
    );
}

function appendOrderProjectGridItem(container, project, orderId, actionContext, options = {}) {
    const {
        nested = false,
        hideActions = false,
        aggregatorChildCount = 0,
        aggregatorExpanded = false
    } = options;
    const hasPhases = typeof orderHasDeliveryPhases === 'function'
        && orderHasDeliveryPhases(orderId);
    const statusName = getOrderProjectStatusName(project);
    const statusClass = getOrderProjectStatusBadgeClass(statusName);
    const phaseDisplay = typeof getOrderProjectPhaseDisplay === 'function'
        ? getOrderProjectPhaseDisplay(project, orderId)
        : null;
    const phaseCellHtml = hasPhases
        ? (phaseDisplay
            ? `<span class="order-projects-grid__cell text-[10px] text-slate-600 whitespace-nowrap" title="${escapeHtml(`${phaseDisplay.name} · ${phaseDisplay.dateLabel}`)}"><span class="block font-medium text-slate-700">${escapeHtml(phaseDisplay.name)}</span><span class="block text-[9px] text-slate-500">${escapeHtml(phaseDisplay.dateLabel)}</span></span>`
            : '<span class="order-projects-grid__cell"></span>')
        : '';
    const designerName = project.designer?.name || '—';
    const projectId = Number(project.id);
    const approval = actionContext.approvalsByProject?.[projectId] || null;
    const revisions = actionContext.revisionsByProject?.[projectId] || [];
    const implantacao = actionContext.implantacaoByProjectId?.[projectId] || null;
    const medicao = actionContext.medicaoByProject?.[projectId] || null;
    const conferencia = actionContext.conferenciaByProject?.[projectId] || null;
    const actions = hideActions || (typeof canActOnOrderProject === 'function' && !canActOnOrderProject(project))
        ? []
        : (typeof getOrderProjectActions === 'function'
            ? getOrderProjectActions(project, { orderId, approval, revisions, implantacao, medicao, conferencia })
            : []);
    const aggregatorBadge = !nested && typeof renderAggregatorProjectNoticeHtml === 'function'
        ? renderAggregatorProjectNoticeHtml(project)
        : '';
    const detailsButtonHtml = hideActions
        ? ''
        : `<button type="button"
                class="order-project-details-btn text-[10px] bg-white border border-violet-200 text-violet-800 hover:bg-violet-50 px-2 py-0.5 rounded-md font-medium whitespace-nowrap"
                data-project-id="${projectId}">
                Detalhes
            </button>`;
    const aggregatorToggleHtml = !nested && aggregatorChildCount > 0
        ? `<button type="button"
                class="order-project-aggregator-toggle inline-flex items-center gap-0.5 shrink-0 text-[10px] font-semibold text-violet-800 bg-violet-50 border border-violet-200 hover:bg-violet-100 px-1.5 py-0.5 rounded-md"
                data-aggregator-id="${projectId}"
                aria-expanded="${aggregatorExpanded ? 'true' : 'false'}"
                title="${aggregatorExpanded ? 'Recolher ambientes' : 'Expandir ambientes'}">
                <span class="order-project-aggregator-toggle__icon leading-none">${aggregatorExpanded ? '▼' : '▶'}</span>
                <span class="leading-none">${aggregatorChildCount}</span>
            </button>`
        : '';
    const item = document.createElement('div');
    item.className = nested
        ? 'order-projects-grid__item order-projects-grid__item--nested'
        : 'order-projects-grid__item';
    item.dataset.projectId = String(projectId);
    item.innerHTML = `
        <div class="order-projects-grid__row${nested ? ' order-projects-grid__row--nested' : ''}">
            <div class="order-projects-grid__cell order-projects-grid__cell--project min-w-0${nested ? ' order-projects-grid__cell--project-nested' : ''}">
                <div class="flex flex-wrap items-center gap-1.5">
                    ${aggregatorToggleHtml}
                    <span class="text-xs ${nested ? 'font-medium text-slate-600' : 'font-semibold text-slate-800'} truncate" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</span>
                    ${detailsButtonHtml}
                    ${aggregatorBadge}
                    ${renderComplementarProjectNoticeHtml(project)}
                    ${renderReplacedProjectNoticeHtml(project)}
                    ${renderReplacementProjectNoticeHtml(project)}
                </div>
            </div>
            <span class="order-projects-grid__cell text-[10px] text-slate-600 truncate" title="Projetista: ${escapeHtml(designerName)}">${escapeHtml(designerName)}</span>
            ${phaseCellHtml}
            <span class="order-projects-grid__cell order-projects-grid__cell--status text-[10px] px-1.5 py-0.5 rounded-full font-medium truncate ${statusClass}" title="${escapeHtml(statusName)}">${escapeHtml(statusName)}</span>
            <div class="order-projects-grid__cell order-projects-grid__cell--actions">
                ${hideActions
        ? '<span class="text-xs text-slate-300">—</span>'
        : (typeof renderOrderProjectActionButtons === 'function'
            ? renderOrderProjectActionButtons(actions)
            : '<span class="text-xs text-slate-300">—</span>')}
            </div>
        </div>
    `;
    container.appendChild(item);
}

async function loadOrderProjects(orderId) {
    const list = document.getElementById('order-projects-list');

    if (typeof loadOrderPhasesForOrders === 'function') {
        await loadOrderPhasesForOrders([{ id: Number(orderId) }]);
    }

    let projects = await fetchOrderProjectsForOrder(orderId);
    projects = [...projects].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' })
    );
    if (typeof attachOpenOrderProjectSubstatuses === 'function') {
        await attachOpenOrderProjectSubstatuses(projects);
    }
    const hasPhases = typeof orderHasDeliveryPhases === 'function'
        && orderHasDeliveryPhases(orderId);
    orderProjectsCache = projects;
    updateOrderTabCounts(orderProjectsCache.length);
    updateProjectsListHeader(orderProjectsCache.length);

    const projectIds = orderProjectsCache.map(project => Number(project.id)).filter(Boolean);
    const actionContext = await fetchOrderProjectActionContext(orderId, projectIds, orderProjectsCache);

    if (!list) return;

    if (!orderProjectsCache.length) {
        list.innerHTML = '';
        if (typeof refreshOrdersListSummary === 'function') {
            await refreshOrdersListSummary();
        }
        return;
    }

    list.innerHTML = '<div class="order-projects-grid"></div>';
    const grid = list.querySelector('.order-projects-grid');
    if (hasPhases) {
        grid.classList.add('order-projects-grid--with-phases');
    }

    const header = document.createElement('div');
    header.className = 'order-projects-grid__header';
    header.innerHTML = `
        <span class="order-projects-grid__head order-projects-grid__head--project">Projeto</span>
        <span class="order-projects-grid__head">Projetista</span>
        ${hasPhases ? '<span class="order-projects-grid__head">Fase</span>' : ''}
        <span class="order-projects-grid__head">Status</span>
        <span class="order-projects-grid__head order-projects-grid__head--actions">Ação</span>
    `;
    grid.appendChild(header);

    const orderProjectsForList = { projects: orderProjectsCache };

    getOrderProjectsListTopLevel(orderProjectsCache).forEach(project => {
        const aggregatorId = Number(project.id);
        const children = typeof isOrderProjectAggregator === 'function' && isOrderProjectAggregator(project)
            && typeof getOrderProjectAggregatorChildProjects === 'function'
            ? getOrderProjectAggregatorChildProjects(orderProjectsForList, project.id)
            : [];
        const aggregatorExpanded = orderProjectsAggregatorExpandedIds.has(aggregatorId);

        appendOrderProjectGridItem(grid, project, orderId, actionContext, {
            aggregatorChildCount: children.length,
            aggregatorExpanded
        });

        if (!children.length) return;

        const childrenWrapper = document.createElement('div');
        childrenWrapper.className = `order-projects-grid__children${aggregatorExpanded ? '' : ' is-collapsed'}`;
        childrenWrapper.dataset.aggregatorId = String(aggregatorId);

        children.forEach(child => {
            appendOrderProjectGridItem(childrenWrapper, child, orderId, actionContext, {
                nested: true,
                hideActions: true
            });
        });

        grid.appendChild(childrenWrapper);
    });

    if (typeof refreshOrdersListSummary === 'function') {
        await refreshOrdersListSummary();
    }
}

function bindOrderProjectEvents() {
    document.getElementById('order-projects-list')?.addEventListener('click', async (event) => {
        const actionBtn = event.target.closest('.order-project-action-btn');
        if (actionBtn) {
            event.stopPropagation();
            if (typeof handleOrderProjectAction === 'function') {
                await handleOrderProjectAction(actionBtn);
            }
            return;
        }

        const aggregatorToggle = event.target.closest('.order-project-aggregator-toggle');
        if (aggregatorToggle) {
            event.stopPropagation();
            const grid = document.querySelector('#order-projects-list .order-projects-grid');
            const aggregatorId = Number(aggregatorToggle.dataset.aggregatorId);
            const expanded = aggregatorToggle.getAttribute('aria-expanded') !== 'true';
            setOrderProjectAggregatorChildrenExpanded(grid, aggregatorId, expanded);
            return;
        }

        const button = event.target.closest('.order-project-details-btn');
        if (!button) return;

        event.stopPropagation();
        const projectId = Number(button.dataset.projectId);
        if (!projectId) return;

        const project = orderProjectsCache.find(item => Number(item.id) === projectId);
        if (typeof openProjectViewModal === 'function') {
            await openProjectViewModal(project || projectId);
        }
    });

    document.getElementById('order-project-form').addEventListener('submit', async function (e) {
        e.preventDefault();

        if (!activeOrderId) {
            alertAppDialog('Selecione um pedido primeiro.');
            return;
        }

        const name = document.getElementById('project-name').value.trim();
        const environmentTypeId = document.getElementById('project-environment-type').value;

        if (!name) {
            alertAppDialog('Informe o nome do projeto.');
            document.getElementById('project-name').focus();
            return;
        }

        if (!environmentTypeId) {
            alertAppDialog('Selecione o tipo de ambiente.');
            document.getElementById('project-environment-type').focus();
            return;
        }

        const saleValue = parseSaleValueInput(document.getElementById('project-sale-value')?.value);
        if (Number.isNaN(saleValue)) {
            alertAppDialog('Informe um valor de venda válido.');
            document.getElementById('project-sale-value')?.focus();
            return;
        }

        const statusId = await getVendidoProjectStatusId();
        if (!statusId) {
            alertAppDialog('Status "Vendido" não encontrado. Cadastre em Configurações → Status de Projeto.');
            return;
        }

        const now = new Date().toISOString();
        const payload = {
            orderId: activeOrderId,
            name,
            environmentTypeId: Number(environmentTypeId),
            statusId,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        };

        if (saleValue !== null) {
            payload.saleValue = saleValue;
        }

        const approvalNetworkPath = document.getElementById('project-caminho-rede-aprovacao')?.value?.trim();
        if (approvalNetworkPath) {
            payload.approvalNetworkPath = approvalNetworkPath;
        }

        let { error } = await supabaseClient.from('OrderProject').insert([payload]);

        if (error?.message?.includes('saleValue')) {
            delete payload.saleValue;
            ({ error } = await supabaseClient.from('OrderProject').insert([payload]));
        }

        if (error?.message?.includes('approvalNetworkPath')) {
            delete payload.approvalNetworkPath;
            ({ error } = await supabaseClient.from('OrderProject').insert([payload]));
        }

        if (error) {
            alertAppDialog('Erro ao salvar projeto: ' + error.message);
            return;
        }

        closeOrderProjectModal();
        document.getElementById('order-project-form').reset();
        loadOrderProjects(activeOrderId);
    });
}
