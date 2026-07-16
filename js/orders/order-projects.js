let environmentTypesCache = [];
let orderProjectsCache = [];

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
            ? fetchCommercialApprovalsByProjectIds(projectIds)
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
    const approvalIds = Object.values(approvalsByProject || {})
        .map(approval => approval?.id)
        .filter(Boolean);

    if (approvalIds.length && typeof fetchCommercialRevisionsByApprovalIds === 'function') {
        const revisionsByApproval = await fetchCommercialRevisionsByApprovalIds(approvalIds);
        Object.entries(approvalsByProject || {}).forEach(([projectId, approval]) => {
            if (!approval?.id) return;
            revisionsByProject[projectId] = revisionsByApproval[approval.id] || [];
        });
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
        .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), designer:appUsers!OrderProject_designerId_fkey(id, name), deliveryPhaseId, parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), substituidoPor:substituidoPorProjectId(projectCode, order:salesOrders(orderCode)), substitui:substituiProjectId(projectCode, saleValue, order:salesOrders(orderCode))')
        .eq('orderId', orderId)
        .order('createdAt', { ascending: true });

    if (result.error?.message?.includes('deliveryPhaseId')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), designer:appUsers!OrderProject_designerId_fkey(id, name), parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), substituidoPor:substituidoPorProjectId(projectCode, order:salesOrders(orderCode)), substitui:substituiProjectId(projectCode, saleValue, order:salesOrders(orderCode))')
            .eq('orderId', orderId)
            .order('createdAt', { ascending: true });
    }

    if (result.error?.message?.includes('designer')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), substituidoPor:substituidoPorProjectId(projectCode, order:salesOrders(orderCode)), substitui:substituiProjectId(projectCode, saleValue, order:salesOrders(orderCode))')
            .eq('orderId', orderId)
            .order('createdAt', { ascending: true });
    }

    if (result.error?.message?.includes('parentProject') || result.error?.message?.includes('isComplementar')
        || result.error?.message?.includes('substituidoPor') || result.error?.message?.includes('substitui')
        || result.error?.message?.includes('isSubstituido') || result.error?.message?.includes('isSubstituicao')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)')
            .eq('orderId', orderId)
            .order('createdAt', { ascending: true });
    }

    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('OrderProjectStatus')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name)')
            .eq('orderId', orderId)
            .order('createdAt', { ascending: true });
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

    const { data: statuses, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name')
        .in('id', statusIds);

    if (error) {
        console.error('enrichOrderProjectsWithStatus:', error);
        return projects;
    }

    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
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
        if (project.substituidoPorProjectId) relatedIds.add(Number(project.substituidoPorProjectId));
        if (project.substituiProjectId) relatedIds.add(Number(project.substituiProjectId));
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

        if (project.substituidoPorProjectId && relatedById[project.substituidoPorProjectId]) {
            const related = relatedById[project.substituidoPorProjectId];
            const orderCode = related.order?.orderCode || orderCodeById[related.orderId] || '';
            enriched.substituidoPorProject = {
                ...(enriched.substituidoPorProject || {}),
                projectCode: related.projectCode,
                order: { orderCode }
            };
            enriched.substituidoPorProjectCode = related.projectCode || enriched.substituidoPorProjectCode;
            enriched.substituidoPorOrderCode = orderCode || enriched.substituidoPorOrderCode;
        }

        if (project.substituiProjectId && relatedById[project.substituiProjectId]) {
            const related = relatedById[project.substituiProjectId];
            const orderCode = related.order?.orderCode || orderCodeById[related.orderId] || '';
            enriched.substituiProject = {
                ...(enriched.substituiProject || {}),
                projectCode: related.projectCode,
                order: { orderCode }
            };
            enriched.substituiProjectCode = related.projectCode || enriched.substituiProjectCode;
            enriched.substituiOrderCode = orderCode || enriched.substituiOrderCode;
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

async function loadOrderProjects(orderId) {
    const list = document.getElementById('order-projects-list');

    if (typeof loadOrderPhasesForOrders === 'function') {
        const ordersForPhases = (typeof ordersCache !== 'undefined' && ordersCache.length)
            ? ordersCache
            : [{ id: orderId }];
        await loadOrderPhasesForOrders(ordersForPhases);
    }

    const projects = await fetchOrderProjectsForOrder(orderId);
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

    const header = document.createElement('div');
    header.className = 'order-projects-grid__header';
    header.innerHTML = `
        <span class="order-projects-grid__head order-projects-grid__head--project">Projeto</span>
        <span class="order-projects-grid__head">Projetista</span>
        <span class="order-projects-grid__head">${hasPhases ? 'Fase' : 'Entrega'}</span>
        <span class="order-projects-grid__head">Status</span>
        <span class="order-projects-grid__head order-projects-grid__head--actions">Ação</span>
    `;
    grid.appendChild(header);

    [...orderProjectsCache]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
        .forEach(p => {
            const statusName = getOrderProjectStatusName(p);
            const statusClass = getOrderProjectStatusBadgeClass(statusName);
            const phaseDisplay = typeof getOrderProjectPhaseDisplay === 'function'
                ? getOrderProjectPhaseDisplay(p, orderId)
                : null;
            const deliveryDate = typeof formatGestaoDate === 'function'
                ? formatGestaoDate(p.deliveryDate)
                : (p.deliveryDate || '—');
            const deliveryCell = phaseDisplay
                ? `<span class="block font-medium text-slate-700">${escapeHtml(phaseDisplay.name)}</span><span class="block text-[9px] text-slate-500">${escapeHtml(phaseDisplay.dateLabel)}</span>`
                : escapeHtml(deliveryDate);
            const deliveryTitle = phaseDisplay
                ? `${phaseDisplay.name} · ${phaseDisplay.dateLabel}`
                : `Entrega do projeto técnico: ${deliveryDate}`;
            const designerName = p.designer?.name || '—';
            const projectId = Number(p.id);
            const approval = actionContext.approvalsByProject?.[projectId] || null;
            const revisions = actionContext.revisionsByProject?.[projectId] || [];
            const implantacao = actionContext.implantacaoByProjectId?.[projectId] || null;
            const medicao = actionContext.medicaoByProject?.[projectId] || null;
            const conferencia = actionContext.conferenciaByProject?.[projectId] || null;
            const actions = typeof getOrderProjectActions === 'function'
                ? getOrderProjectActions(p, { orderId, approval, revisions, implantacao, medicao, conferencia })
                : [];
            const item = document.createElement('div');
            item.className = 'order-projects-grid__item';
            item.dataset.projectId = String(projectId);
            item.innerHTML = `
                <div class="order-projects-grid__row">
                    <div class="order-projects-grid__cell order-projects-grid__cell--project min-w-0">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="text-xs font-semibold text-slate-800 truncate" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
                            <button type="button"
                                class="order-project-details-btn text-[10px] bg-white border border-violet-200 text-violet-800 hover:bg-violet-50 px-2 py-0.5 rounded-md font-medium whitespace-nowrap"
                                data-project-id="${projectId}">
                                Detalhes
                            </button>
                            ${renderComplementarProjectNoticeHtml(p)}
                            ${renderSubstituidoProjectNoticeHtml(p)}
                            ${renderSubstituicaoProjectNoticeHtml(p)}
                        </div>
                    </div>
                    <span class="order-projects-grid__cell text-[10px] text-slate-600 truncate" title="Projetista: ${escapeHtml(designerName)}">${escapeHtml(designerName)}</span>
                    <span class="order-projects-grid__cell text-[10px] text-slate-600 whitespace-nowrap" title="${escapeHtml(deliveryTitle)}">${deliveryCell}</span>
                    <span class="order-projects-grid__cell order-projects-grid__cell--status text-[10px] px-1.5 py-0.5 rounded-full font-medium truncate ${statusClass}" title="${escapeHtml(statusName)}">${escapeHtml(statusName)}</span>
                    <div class="order-projects-grid__cell order-projects-grid__cell--actions">
                        ${typeof renderOrderProjectActionButtons === 'function'
                            ? renderOrderProjectActionButtons(actions)
                            : '<span class="text-xs text-slate-300">—</span>'}
                    </div>
                </div>
            `;
            grid.appendChild(item);
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
            alertAppDialog('Status "Vendido" não encontrado. Cadastre em Gestão → Status de Projeto.');
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

        const caminhoRedeAprovacao = document.getElementById('project-caminho-rede-aprovacao')?.value?.trim();
        if (caminhoRedeAprovacao) {
            payload.caminhoRedeAprovacao = caminhoRedeAprovacao;
        }

        let { error } = await supabaseClient.from('OrderProject').insert([payload]);

        if (error?.message?.includes('saleValue')) {
            delete payload.saleValue;
            ({ error } = await supabaseClient.from('OrderProject').insert([payload]));
        }

        if (error?.message?.includes('caminhoRedeAprovacao')) {
            delete payload.caminhoRedeAprovacao;
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
