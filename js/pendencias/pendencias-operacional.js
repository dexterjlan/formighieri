function canAccessPendenciasAguardandoMedicao() {
    return canSeePendenciasGestorComercialMenu();
}

function canEditPendenciasAguardandoMedicaoStatus() {
    return isGestorComercial();
}

async function fetchPendenciasAguardandoMeasurementProjects() {
    const statusIds = await getPendenciasStatusIdsByNames(PENDENCIAS_AGUARDANDO_MEDICAO_LIST_STATUSES);

    if (!statusIds.length) {
        return {
            error: new Error('Status "Vendido" ou "Aguardando Obra" não encontrados.'),
            projects: []
        };
    }

    const result = await queryPendenciasProjects({ statusIds });
    if (result.error) {
        return { error: result.error, projects: [] };
    }

    return {
        error: null,
        projects: sortPendenciasByDeliveryDate(result.data || [])
    };
}

let pendenciasAguardandoMeasurementProjectsCache = [];
let pendenciasAguardandoMedicaoEditGroup = null;
let pendenciasAguardandoMedicaoRefreshContext = null;

function canShowOrderProjectAlterarStatusAction(project) {
    if (!canEditPendenciasAguardandoMedicaoStatus()) return false;
    if (!canActOnOrderProject(project)) return false;

    const statusName = getOrderProjectStatusName(project);
    return PENDENCIAS_AGUARDANDO_MEDICAO_LIST_STATUSES.includes(statusName);
}

function enrichOrderProjectsForAguardandoMedicaoModal(orderId, projects) {
    const order = typeof ordersCache !== 'undefined'
        ? ordersCache.find(item => Number(item.id) === Number(orderId))
        : null;

    return (projects || []).map(project => ({
        ...project,
        order: {
            id: Number(orderId),
            orderCode: order?.orderCode || '—',
            clientName: getOrderClientName(order) || '—',
            consultantName: getOrderConsultantNameFromRecord(order) || '—'
        },
        projectStatus: project.projectStatus || {
            id: project.statusId,
            name: getOrderProjectStatusName(project)
        }
    }));
}

async function refreshAfterPendenciasAguardandoMedicaoChange() {
    const context = pendenciasAguardandoMedicaoRefreshContext;
    pendenciasAguardandoMedicaoRefreshContext = null;

    if (context?.source === 'order' && context.orderId) {
        if (typeof loadOrderProjects === 'function') {
            await loadOrderProjects(context.orderId);
        } else if (typeof refreshOrderProjectListAfterAction === 'function') {
            await refreshOrderProjectListAfterAction(context.orderId);
        }

        if (typeof refreshOrdersListSummary === 'function') {
            await refreshOrdersListSummary();
        }
        return;
    }

    if (typeof loadPendenciasAguardandoMedicao === 'function') {
        await loadPendenciasAguardandoMedicao();
    }
}

function groupPendenciasAguardandoMeasurementProjects(projects) {
    const groups = new Map();

    projects.forEach(project => {
        const orderId = Number(project.orderId);
        const statusName = getPendenciasProjectStatusName(project);
        const key = `${orderId}::${statusName}`;

        if (!groups.has(key)) {
            groups.set(key, {
                orderId,
                statusName,
                orderCode: project.order?.orderCode || '—',
                clientName: getOrderClientName(project.order) || '—',
                consultantName: getOrderConsultantNameFromRecord(project.order) || '—',
                projects: []
            });
        }

        groups.get(key).projects.push(project);
    });

    return [...groups.values()].sort((a, b) => {
        const orderCompare = String(a.orderCode).localeCompare(String(b.orderCode), 'pt-BR', { numeric: true });
        if (orderCompare !== 0) return orderCompare;
        return String(a.statusName).localeCompare(String(b.statusName), 'pt-BR');
    });
}

function getPendenciasAguardandoMedicaoGroupProjects(orderId, statusName) {
    const projects = pendenciasAguardandoMeasurementProjectsCache.filter(project => (
        Number(project.orderId) === Number(orderId)
        && getPendenciasProjectStatusName(project) === statusName
    ));

    return [...projects].sort((a, b) => (
        getPendenciasAguardandoMeasurementProjectLabel(a).localeCompare(
            getPendenciasAguardandoMeasurementProjectLabel(b),
            'pt-BR',
            { sensitivity: 'base' }
        )
    ));
}

const PENDENCIAS_AGUARDANDO_MEDICAO_MODAL_OVERLAY = createModalOverlayConfig('pendencias-aguardando-medicao-modal', {
    disableElementIds: [
        'btn-pendencias-am-obra',
        'btn-pendencias-am-medicao',
        'btn-pendencias-am-fechar',
        'pendencias-am-select-all-check'
    ],
    disableFormSelector: '#pendencias-am-modal-projects-list input, #pendencias-am-modal-projects-list textarea',
    disableDatasetKey: 'pendenciasAmLoadingDisabled'
});

function setPendenciasAguardandoMedicaoModalLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(PENDENCIAS_AGUARDANDO_MEDICAO_MODAL_OVERLAY, active, message, status);
}

function closePendenciasAguardandoMedicaoModal() {
    setPendenciasAguardandoMedicaoModalLoading(false);
    pendenciasAguardandoMedicaoEditGroup = null;
    pendenciasAguardandoMedicaoRefreshContext = null;
    toggleModal('pendencias-aguardando-medicao-modal', false);
}

function getPendenciasAguardandoMeasurementProjectLabel(project) {
    return typeof getPendenciasProjectDetailLabel === 'function'
        ? getPendenciasProjectDetailLabel(project)
        : (project?.name || 'Projeto');
}

function renderPendenciasAguardandoMedicaoModalProjectRow(project) {
    const label = getPendenciasAguardandoMeasurementProjectLabel(project);
    const observation = project.awaitingConstructionNote || '';

    return `
        <div class="border border-slate-200 rounded-lg p-3 bg-slate-50/40 flex items-start gap-3"
            data-project-id="${project.id}">
            <input type="checkbox"
                class="pendencias-am-project-check mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500">
            <span class="text-sm font-medium text-slate-800 min-w-[7rem] max-w-[40%] shrink-0 pt-0.5 leading-snug">${escapeHtml(label)}</span>
            <textarea rows="2"
                class="pendencias-am-project-obs flex-1 min-w-0 px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 resize-y"
                placeholder="Observação (Aguardando Obra)">${escapeHtml(observation)}</textarea>
        </div>
    `;
}

function openPendenciasAguardandoMedicaoEditModal(orderId, statusName) {
    if (!canEditPendenciasAguardandoMedicaoStatus()) return;

    const groupProjects = getPendenciasAguardandoMedicaoGroupProjects(orderId, statusName);
    if (!groupProjects.length) {
        alertAppDialog('Nenhum projeto encontrado neste grupo. Atualize a lista.');
        return;
    }

    if (!pendenciasAguardandoMedicaoRefreshContext) {
        pendenciasAguardandoMedicaoRefreshContext = { source: 'pendencias' };
    }

    const sample = groupProjects[0];
    pendenciasAguardandoMedicaoEditGroup = {
        orderId: Number(orderId),
        statusName,
        orderCode: sample.order?.orderCode || '—',
        clientName: getOrderClientName(sample.order) || '—',
        consultantName: getOrderConsultantNameFromRecord(sample.order) || '—'
    };

    document.getElementById('pendencias-am-modal-order-line').textContent =
        `${pendenciasAguardandoMedicaoEditGroup.orderCode} - ${pendenciasAguardandoMedicaoEditGroup.clientName}`;
    document.getElementById('pendencias-am-modal-consultant-name').textContent =
        pendenciasAguardandoMedicaoEditGroup.consultantName || '—';

    const listEl = document.getElementById('pendencias-am-modal-projects-list');
    if (listEl) {
        listEl.innerHTML = groupProjects.map(renderPendenciasAguardandoMedicaoModalProjectRow).join('');
    }

    const selectAllEl = document.getElementById('pendencias-am-select-all-check');
    if (selectAllEl) {
        selectAllEl.checked = false;
        selectAllEl.indeterminate = false;
    }

    toggleModal('pendencias-aguardando-medicao-modal', true);
}

function openOrderProjectAlterarStatusModal(orderId, projectId) {
    if (!canEditPendenciasAguardandoMedicaoStatus()) {
        alertAppDialog('Sem permissão para alterar status.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const sourceProjects = typeof orderProjectsCache !== 'undefined' ? orderProjectsCache : [];
    const project = sourceProjects.find(item => Number(item.id) === Number(projectId));
    if (!project) {
        alertAppDialog('Projeto não encontrado. Atualize a lista.');
        return;
    }

    const statusName = getOrderProjectStatusName(project);
    if (!PENDENCIAS_AGUARDANDO_MEDICAO_LIST_STATUSES.includes(statusName)) {
        alertAppDialog('Este projeto não está elegível para alteração de status.');
        return;
    }

    const groupProjects = sourceProjects.filter(item => (
        canActOnOrderProject(item)
        && getOrderProjectStatusName(item) === statusName
    ));

    if (!groupProjects.length) {
        alertAppDialog('Nenhum projeto elegível encontrado neste pedido.');
        return;
    }

    pendenciasAguardandoMeasurementProjectsCache = enrichOrderProjectsForAguardandoMedicaoModal(orderId, groupProjects);
    pendenciasAguardandoMedicaoRefreshContext = {
        source: 'order',
        orderId: Number(orderId)
    };

    openPendenciasAguardandoMedicaoEditModal(orderId, statusName);

    const projectCheckbox = document.querySelector(
        `#pendencias-am-modal-projects-list [data-project-id="${CSS.escape(String(projectId))}"] .pendencias-am-project-check`
    );
    if (projectCheckbox) {
        projectCheckbox.checked = true;
        syncPendenciasAguardandoMedicaoSelectAllCheckbox();
    }
}

function syncPendenciasAguardandoMedicaoSelectAllCheckbox() {
    const selectAllEl = document.getElementById('pendencias-am-select-all-check');
    const projectChecks = document.querySelectorAll('#pendencias-am-modal-projects-list .pendencias-am-project-check');

    if (!selectAllEl || !projectChecks.length) return;

    const checkedCount = [...projectChecks].filter(checkbox => checkbox.checked).length;
    selectAllEl.checked = checkedCount === projectChecks.length;
    selectAllEl.indeterminate = checkedCount > 0 && checkedCount < projectChecks.length;
}

function setPendenciasAguardandoMedicaoSelectAllChecked(checked) {
    document.querySelectorAll('#pendencias-am-modal-projects-list .pendencias-am-project-check')
        .forEach(checkbox => {
            checkbox.checked = checked;
        });

    const selectAllEl = document.getElementById('pendencias-am-select-all-check');
    if (selectAllEl) {
        selectAllEl.checked = checked;
        selectAllEl.indeterminate = false;
    }
}

function collectPendenciasAguardandoMedicaoModalSelections() {
    const rows = document.querySelectorAll('#pendencias-am-modal-projects-list [data-project-id]');
    const selections = [];

    rows.forEach(row => {
        const checkbox = row.querySelector('.pendencias-am-project-check');
        if (!checkbox?.checked) return;

        const projectId = Number(row.dataset.projectId);
        const project = pendenciasAguardandoMeasurementProjectsCache.find(item => Number(item.id) === projectId);
        if (!project) return;

        selections.push({
            project,
            observation: row.querySelector('.pendencias-am-project-obs')?.value.trim() || ''
        });
    });

    return selections;
}

async function updateOrderProjectStatusWithObservation(projectId, statusId, observation = null) {
    const now = new Date().toISOString();
    let payload = {
        statusId,
        updatedById: currentUser.id,
        updatedAt: now
    };

    if (observation !== null) {
        payload.awaitingConstructionNote = observation || null;
    }

    let { error } = await supabaseClient
        .from('OrderProject')
        .update(payload)
        .eq('id', projectId);

    if (error?.message?.includes('awaitingConstructionNote')) {
        ({ error } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .eq('id', projectId));
    }

    return error;
}

async function applyPendenciasAguardandoObraToSelections(selections) {
    if (!selections.length) {
        alertAppDialog('Selecione ao menos um projeto.');
        return false;
    }

    const statusId = await getPendenciasStatusIdByName(PENDENCIAS_STATUS_AGUARDANDO_OBRA);
    if (!statusId) {
        alertAppDialog(`Status "${PENDENCIAS_STATUS_AGUARDANDO_OBRA}" não encontrado.`);
        return false;
    }

    if (!(await confirmAppDialog(
        `Marcar ${selections.length} projeto(s) como Aguardando Obra?`,
        { confirmLabel: 'Confirmar', variant: 'warning' }
    ))) {
        return false;
    }

    setPendenciasAguardandoMedicaoModalLoading(true, 'Salvando observações e status...');

    try {
        for (const item of selections) {
            const error = await updateOrderProjectStatusWithObservation(
                item.project.id,
                statusId,
                item.observation
            );
            if (error) throw error;
        }

        setPendenciasAguardandoMedicaoModalLoading(true, 'Atualizando telas...');
        await refreshAfterPendenciasAguardandoMedicaoChange();

        setPendenciasAguardandoMedicaoModalLoading(true, 'Projetos marcados como Aguardando Obra!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));

        closePendenciasAguardandoMedicaoModal();
        return true;
    } catch (error) {
        setPendenciasAguardandoMedicaoModalLoading(true, `Erro ao alterar status: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setPendenciasAguardandoMedicaoModalLoading(false);
        return false;
    }
}

async function applyPendenciasAguardandoMedicaoToSelections(selections) {
    if (!selections.length) {
        alertAppDialog('Selecione ao menos um projeto.');
        return false;
    }

    const statusId = await getPendenciasStatusIdByName(PENDENCIAS_STATUS_AGUARDANDO_MEDICAO);
    if (!statusId) {
        alertAppDialog(`Status "${PENDENCIAS_STATUS_AGUARDANDO_MEDICAO}" não encontrado.`);
        return false;
    }

    if (!(await confirmAppDialog(
        `Liberar ${selections.length} projeto(s) para medição?`,
        { confirmLabel: 'Liberar para medição', variant: 'confirm' }
    ))) {
        return false;
    }

    setPendenciasAguardandoMedicaoModalLoading(true, 'Atualizando status dos projetos...');

    try {
        const updatedProjects = [];

        for (const item of selections) {
            const currentStatusName = getPendenciasProjectStatusName(item.project);
            if (!PENDENCIAS_AGUARDANDO_MEDICAO_LIST_STATUSES.includes(currentStatusName)) {
                continue;
            }

            const error = await updateOrderProjectStatusWithObservation(item.project.id, statusId);
            if (error) throw error;

            updatedProjects.push({
                id: item.project.id,
                name: getPendenciasAguardandoMeasurementProjectLabel(item.project)
            });
        }

        if (!updatedProjects.length) {
            alertAppDialog('Nenhum projeto elegível para liberar. Atualize a lista.');
            setPendenciasAguardandoMedicaoModalLoading(false);
            return false;
        }

        if (typeof notifyLiberacaoMedicaoEmail === 'function' && pendenciasAguardandoMedicaoEditGroup) {
            setPendenciasAguardandoMedicaoModalLoading(true, 'Enviando e-mail de notificação...');
            await notifyLiberacaoMedicaoEmail({
                orderId: pendenciasAguardandoMedicaoEditGroup.orderId,
                projects: updatedProjects
            });
        }

        setPendenciasAguardandoMedicaoModalLoading(true, 'Atualizando telas...');
        await refreshAfterPendenciasAguardandoMedicaoChange();

        setPendenciasAguardandoMedicaoModalLoading(true, 'Projetos liberados para medição!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));

        closePendenciasAguardandoMedicaoModal();
        return true;
    } catch (error) {
        setPendenciasAguardandoMedicaoModalLoading(true, `Erro ao alterar status: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setPendenciasAguardandoMedicaoModalLoading(false);
        return false;
    }
}

function bindPendenciasAguardandoMedicaoModalEvents() {
    document.getElementById('btn-pendencias-am-fechar')
        ?.addEventListener('click', closePendenciasAguardandoMedicaoModal);

    document.getElementById('pendencias-am-select-all-check')
        ?.addEventListener('change', (event) => {
            setPendenciasAguardandoMedicaoSelectAllChecked(event.target.checked);
        });

    document.getElementById('pendencias-am-modal-projects-list')
        ?.addEventListener('change', (event) => {
            if (!event.target.classList.contains('pendencias-am-project-check')) return;
            syncPendenciasAguardandoMedicaoSelectAllCheckbox();
        });

    document.getElementById('btn-pendencias-am-obra')
        ?.addEventListener('click', async () => {
            const selections = collectPendenciasAguardandoMedicaoModalSelections();
            await applyPendenciasAguardandoObraToSelections(selections);
        });

    document.getElementById('btn-pendencias-am-medicao')
        ?.addEventListener('click', async () => {
            const selections = collectPendenciasAguardandoMedicaoModalSelections();
            await applyPendenciasAguardandoMedicaoToSelections(selections);
        });
}

function renderPendenciasAguardandoMedicaoList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    pendenciasAguardandoMeasurementProjectsCache = projects;
    const canEdit = canEditPendenciasAguardandoMedicaoStatus();
    const subtitle = canEdit
        ? 'Projetos agrupados por pedido e status. Use Editar para alterar status e observações.'
        : 'Visualização dos projetos vendidos ou aguardando obra.';

    const groups = groupPendenciasAguardandoMeasurementProjects(projects);
    const rows = groups.map(group => {
        const projectNames = group.projects
            .map(project => getPendenciasAguardandoMeasurementProjectLabel(project))
            .join(' | ');

        return mapPendenciasInteractiveIdentity(group, {
            id: `${group.orderId}::${group.statusName}`,
            projectName: projectNames,
            statusName: group.statusName,
            statusClass: getPendenciasProjectStatusBadgeClass(group.statusName),
            orderId: group.orderId
        });
    });

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Aguardando Medição',
        subtitle,
        refreshButtonId: 'btn-pendencias-refresh-aguardando-medicao',
        onRefresh: loadPendenciasAguardandoMedicao,
        tableId: 'pendencias-aguardando-medicao',
        rows,
        emptyMessage: 'Nenhum projeto vendido ou aguardando obra.',
        minWidth: '820px',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({ projectLabel: 'Projetos' }),
            getPendenciasInteractiveStatusColumn(),
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-28',
                render: (row) => canEdit
                    ? `<button type="button"
                        class="pendencias-am-edit-btn text-xs bg-violet-50 text-violet-800 border border-violet-200 px-2.5 py-1 rounded-lg font-medium hover:bg-violet-100"
                        data-order-id="${row.orderId}"
                        data-status-name="${escapeHtml(row.statusName)}">
                        Editar
                    </button>`
                    : '<span class="text-xs text-slate-400">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-am-edit-btn').forEach(button => {
                button.addEventListener('click', () => {
                    openPendenciasAguardandoMedicaoEditModal(
                        Number(button.dataset.orderId),
                        button.dataset.statusName
                    );
                });
            });
        }
    });
}

async function fetchPendenciasProjectsByStatusName(statusName) {
    const statusId = await getPendenciasStatusIdByName(statusName);

    if (!statusId) {
        return {
            error: new Error(`Status "${statusName}" não encontrado.`),
            projects: []
        };
    }

    const result = await queryPendenciasProjects({ statusId });
    if (result.error) {
        return { error: result.error, projects: [] };
    }

    return {
        error: null,
        projects: sortPendenciasByDeliveryDate(result.data || [])
    };
}

function renderPendenciasPpcpProjectList(config) {
    const {
        title,
        subtitle,
        projects,
        emptyMessage,
        refreshButtonId,
        refreshHandler,
        expectedStatusName,
        targetStatusName,
        actionLabel,
        actionButtonClass,
        confirmMessage,
        tableId
    } = config;

    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasPpcpStatus();
    const showDesigner = typeof isPendenciasProjetistaOverviewMode === 'function'
        && isPendenciasProjetistaOverviewMode();
    const labelFn = config.projectLabelFn || getPendenciasProjectLabel;
    const rows = (projects || []).map(project => mapPendenciasInteractiveIdentity(project, {
        projectName: labelFn(project),
        statusName: getPendenciasProjectStatusName(project),
        deliveryDate: formatPendenciasDeliveryDate(project.deliveryDate)
    }));

    renderPendenciasInteractiveTableScreen(content, {
        title,
        subtitle,
        refreshButtonId,
        onRefresh: refreshHandler,
        tableId: tableId || 'pendencias-ppcp-project',
        rows,
        emptyMessage,
        minWidth: '920px',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({ includeDesigner: showDesigner }),
            getPendenciasInteractiveStatusColumn(),
            getPendenciasInteractiveDateColumn({ key: 'deliveryDate', label: 'Entrega' }),
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-44',
                render: (row) => canAct
                    ? `<button type="button"
                        class="pendencias-ppcp-action-btn text-xs px-2.5 py-1 rounded-lg font-medium ${actionButtonClass}"
                        data-project-id="${row.id}"
                        data-expected-status="${escapeHtml(expectedStatusName)}"
                        data-target-status="${escapeHtml(targetStatusName)}"
                        data-confirm-message="${escapeHtml(confirmMessage)}">
                        ${escapeHtml(actionLabel)}
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-ppcp-action-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    updatePendenciasPpcpProjectStatus(
                        Number(button.dataset.projectId),
                        button.dataset.expectedStatus,
                        button.dataset.targetStatus,
                        button.dataset.confirmMessage
                    );
                });
            });
        }
    });
}

async function updatePendenciasPpcpProjectStatus(projectId, expectedStatusName, targetStatusName, confirmMessage) {
    if (!canActPendenciasPpcpStatus()) {
        alertAppDialog('Sem permissão para alterar status.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!projectId || !expectedStatusName || !targetStatusName) return;

    const { data: rawProject, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, statusId, projectStatus:OrderProjectStatus(id, name)')
        .eq('id', projectId)
        .maybeSingle();

    let project = rawProject;

    if (readError?.message?.includes('projectStatus')) {
        const fallback = await supabaseClient
            .from('OrderProject')
            .select('id, statusId')
            .eq('id', projectId)
            .maybeSingle();

        if (fallback.error || !fallback.data) {
            alertAppDialog('Projeto não encontrado.');
            return;
        }

        project = (await enrichPendenciasProjectsWithStatus([fallback.data]))[0];
    } else if (readError || !project) {
        alertAppDialog('Projeto não encontrado.');
        return;
    }

    const currentStatusName = getPendenciasProjectStatusName(project);
    if (currentStatusName !== expectedStatusName) {
        alertAppDialog('O status do projeto foi alterado. Atualize a lista.');
        await reloadActivePendenciasPpcpList();
        return;
    }

    if (!(await confirmAppDialog(confirmMessage || `Alterar status do projeto para "${targetStatusName}"?`))) return;

    const statusId = await getPendenciasStatusIdByName(targetStatusName);
    if (!statusId) {
        alertAppDialog(`Status "${targetStatusName}" não encontrado.`);
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', projectId);

    if (error) {
        alertAppDialog('Erro ao alterar status: ' + error.message);
        return;
    }

    if (targetStatusName === PENDENCIAS_STATUS_IMPLANTACAO
        && typeof createImplantacaoForProject === 'function') {
        await createImplantacaoForProject(projectId);
    }

    if (targetStatusName === PENDENCIAS_STATUS_IMPLANTACAO
        && typeof notifyOrderProjectStatusChangeForProjects === 'function') {
        await notifyOrderProjectStatusChangeForProjects([projectId], PENDENCIAS_STATUS_IMPLANTACAO);
    }

    await reloadActivePendenciasPpcpList();
}

async function reloadActivePendenciasPpcpList() {
    if (!pendenciasActiveItem) {
        await loadPendenciasSectionOverview();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'nomear') {
        await loadPendenciasNomear();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'aguardando-ppcp') {
        await loadPendenciasAguardandoPpcp();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'implantacao') {
        await loadPendenciasImplantacao();
    }
}

function canActPendenciasNomear(project) {
    return canActOrderProjectNomear(project);
}

async function fetchPendenciasNomearProjects() {
    const statusId = await getPendenciasStatusIdByName(PENDENCIAS_STATUS_NOMEAR);

    if (!statusId) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_NOMEAR}" não encontrado.`),
            projects: []
        };
    }

    const userId = Number(currentUser?.id);
    const overviewMode = typeof isPendenciasProjetistaOverviewMode === 'function'
        ? isPendenciasProjetistaOverviewMode()
        : (isAdmin() || isGestorProjetos());
    const result = await queryPendenciasProjects(
        overviewMode
            ? { statusId }
            : { statusId, designerId: userId }
    );

    if (result.error) {
        return { error: result.error, projects: [], overviewMode };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);
    if (overviewMode && typeof enrichPendenciasProjectsWithDesigner === 'function') {
        projects = await enrichPendenciasProjectsWithDesigner(projects);
    }

    return {
        error: null,
        overviewMode,
        projects
    };
}

function renderPendenciasNomearList(projects, overviewMode = false) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const labelFn = typeof getPendenciasProjectDetailLabel === 'function'
        ? getPendenciasProjectDetailLabel
        : (project => project?.name || 'Projeto');

    const rows = (projects || []).map(project => mapPendenciasInteractiveIdentity(project, {
        projectName: labelFn(project),
        statusName: getPendenciasProjectStatusName(project),
        deliveryDate: formatPendenciasDeliveryDate(project.deliveryDate),
        canAct: canActPendenciasNomear(project)
    }));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Nomear',
        subtitle: overviewMode
            ? 'Todos os projetos aguardando nomeação pelo projetista responsável.'
            : 'Projetos aguardando nomeação pelo projetista responsável.',
        refreshButtonId: 'btn-pendencias-refresh-nomear',
        refreshButtonClass: 'order-tab-action-btn text-xs bg-white border border-purple-200 text-purple-800 px-3 py-1.5 rounded-lg font-medium hover:bg-purple-50',
        onRefresh: loadPendenciasNomear,
        tableId: 'pendencias-nomear',
        rows,
        emptyMessage: 'Nenhum projeto aguardando nomeação.',
        minWidth: '920px',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({ includeDesigner: overviewMode }),
            getPendenciasInteractiveStatusColumn(),
            getPendenciasInteractiveDateColumn({ key: 'deliveryDate', label: 'Entrega' }),
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-44',
                render: (row) => row.canAct
                    ? `<button type="button"
                        class="pendencias-nomear-action-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-purple-100 text-purple-800 hover:bg-purple-200"
                        data-project-id="${row.id}">
                        Nomeado
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-nomear-action-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    const projectId = Number(button.dataset.projectId);
                    if (!projectId) return;

                    await markOrderProjectAsNomeado(projectId, {
                        onSuccess: () => loadPendenciasNomear()
                    });
                });
            });
        }
    });
}

async function loadPendenciasNomear() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasProjetistaMenu()) {
        renderPendenciasPlaceholder('Nomear', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects, overviewMode } = await fetchPendenciasNomearProjects();

    if (error) {
        renderPendenciasPlaceholder('Nomear', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasNomearList(projects, overviewMode);
}

async function loadPendenciasAguardandoPpcp() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasPpcpItems()) {
        renderPendenciasPlaceholder('Aguardando PPCP', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_AGUARDANDO_PPCP);

    if (error) {
        renderPendenciasPlaceholder('Aguardando PPCP', `Erro ao carregar: ${error.message}`);
        return;
    }

    const subtitle = canActPendenciasPpcpStatus()
        ? 'Projetos aguardando PPCP. Clique em Iniciar Implantação para enviar à implantação.'
        : 'Visualização dos projetos aguardando PPCP.';

    renderPendenciasPpcpProjectList({
        title: 'Aguardando PPCP',
        subtitle,
        projects,
        emptyMessage: 'Nenhum projeto aguardando PPCP.',
        tableId: 'pendencias-aguardando-ppcp',
        refreshButtonId: 'btn-pendencias-refresh-aguardando-ppcp',
        refreshHandler: () => loadPendenciasAguardandoPpcp(),
        expectedStatusName: PENDENCIAS_STATUS_AGUARDANDO_PPCP,
        targetStatusName: PENDENCIAS_STATUS_IMPLANTACAO,
        actionLabel: 'Iniciar Implantação',
        actionButtonClass: 'bg-violet-100 text-violet-800 hover:bg-violet-200',
        confirmMessage: 'Enviar este projeto para implantação?',
        projectLabelFn: project => typeof getPendenciasProjectDetailLabel === 'function'
            ? getPendenciasProjectDetailLabel(project)
            : (project?.name || 'Projeto')
    });
}

async function fetchPendenciasImplantacoesAbertas() {
    const statusEncerrado = typeof IMPLANTACAO_STATUS_ENCERRADO === 'string'
        ? IMPLANTACAO_STATUS_ENCERRADO
        : 'Encerrado';
    const overviewMode = typeof isImplantacaoPendenciasOverviewMode === 'function'
        && isImplantacaoPendenciasOverviewMode();

    if (typeof fetchOrderProjectsInImplantacaoStatus === 'function'
        && typeof ensureImplantacaoRecordsForProjects === 'function') {
        const orphanProjects = await fetchOrderProjectsInImplantacaoStatus();
        if (orphanProjects.length) {
            await ensureImplantacaoRecordsForProjects(orphanProjects);
        }
    }

    const implementationSelect = 'id, status, orderProjectId, designerId, updatedAt, designer:appUsers!Implementation_designerId_fkey(id, name)';
    let query = supabaseClient
        .from('Implementation')
        .select(implementationSelect)
        .neq('status', statusEncerrado)
        .order('updatedAt', { ascending: false });

    if (!overviewMode) {
        const userId = Number(currentUser?.id);
        if (!userId) {
            return { error: null, projects: [] };
        }
        query = query.eq('designerId', userId);
    }

    let { data: implantacoes, error } = await query;

    if (error?.message?.includes('designerId') && error.message.includes('does not exist')) {
        return {
            error: new Error('Execute supabase/feats/add-implementation-designer.sql no Supabase SQL Editor.'),
            projects: []
        };
    }

    if (error?.message?.includes('designer')) {
        let retryQuery = supabaseClient
            .from('Implementation')
            .select('id, status, orderProjectId, designerId, updatedAt')
            .neq('status', statusEncerrado)
            .order('updatedAt', { ascending: false });
        if (!overviewMode) {
            retryQuery = retryQuery.eq('designerId', Number(currentUser?.id));
        }
        const fallback = await retryQuery;
        implantacoes = fallback.data;
        error = fallback.error;
    }

    if (error?.message?.includes('Implementation')) {
        return {
            error: new Error('Tabela Implementation não encontrada. Consulte PENDING-PROD-SQL.md ou supabase/schema/.'),
            projects: []
        };
    }

    if (error) {
        return { error, projects: [] };
    }

    if (!implantacoes?.length) {
        return { error: null, projects: [] };
    }

    const projectIds = [...new Set(implantacoes.map(item => item.orderProjectId).filter(Boolean))];
    let projectResult = await supabaseClient
        .from('OrderProject')
        .select(PENDENCIAS_PROJECT_SELECT)
        .in('id', projectIds);

    if (projectResult.error?.message?.includes('projectStatus') || projectResult.error?.message?.includes('designer')) {
        projectResult = await supabaseClient
            .from('OrderProject')
            .select(PENDENCIAS_PROJECT_SELECT_FALLBACK)
            .in('id', projectIds);
    }

    if (projectResult.error) {
        return { error: projectResult.error, projects: [] };
    }

    const projectsById = Object.fromEntries(
        (await enrichPendenciasProjectsWithStatus(projectResult.data || []))
            .map(project => [project.id, project])
    );

    const projects = implantacoes.map(implantacao => {
        const project = projectsById[implantacao.orderProjectId];
        const base = project || {
            id: implantacao.orderProjectId,
            name: `Projeto #${implantacao.orderProjectId}`,
            order: null,
            deliveryDate: null
        };

        return {
            ...base,
            implementationId: implantacao.id,
            implantacaoStatus: implantacao.status,
            implementationDesignerId: implantacao.designerId || null,
            implementationDesignerName: implantacao.designer?.name || '—'
        };
    });

    return {
        error: null,
        overviewMode,
        projects: sortPendenciasByDeliveryDate(projects)
    };
}

async function loadPendenciasImplantacao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasPpcpItems()) {
        renderPendenciasPlaceholder('Implantação', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects, overviewMode } = await fetchPendenciasImplantacoesAbertas();

    if (error) {
        renderPendenciasPlaceholder('Implantação', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasImplantacaoList(projects, overviewMode);
}

function renderPendenciasImplantacaoList(projects, overviewMode = false) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasPpcpStatus();
    const showPpcp = Boolean(overviewMode);
    const labelFn = typeof getPendenciasProjectDetailLabel === 'function'
        ? getPendenciasProjectDetailLabel
        : (project => project?.name || 'Projeto');

    const rows = (projects || []).map(project => {
        const projectLabel = labelFn(project);
        const statusName = project.implantacaoStatus || getPendenciasProjectStatusName(project);
        const statusClass = typeof getImplantacaoStatusBadgeClass === 'function' && project.implantacaoStatus
            ? getImplantacaoStatusBadgeClass(project.implantacaoStatus)
            : getPendenciasProjectStatusBadgeClass(getPendenciasProjectStatusName(project));

        return mapPendenciasInteractiveIdentity(project, {
            projectName: projectLabel,
            designerName: project.implementationDesignerName || '—',
            statusName,
            statusClass,
            deliveryDate: formatPendenciasDeliveryDate(project.deliveryDate)
        });
    });

    const subtitle = overviewMode
        ? 'Todas as implantações em aberto, com o PPCP responsável.'
        : (canAct
            ? 'Suas implantações em aberto. Abra o checklist para enviar à produção ou compras.'
            : 'Visualização das suas implantações em aberto.');

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Implantação',
        subtitle,
        refreshButtonId: 'btn-pendencias-refresh-implantacao',
        refreshButtonClass: 'order-tab-action-btn text-xs bg-white border border-teal-200 text-teal-800 px-3 py-1.5 rounded-lg font-medium hover:bg-teal-50',
        onRefresh: loadPendenciasImplantacao,
        tableId: 'pendencias-implantacao',
        rows,
        emptyMessage: overviewMode
            ? 'Nenhuma implantação em aberto.'
            : 'Nenhuma implantação associada a você.',
        minWidth: '920px',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({
                includeDesigner: showPpcp,
                designerLabel: 'PPCP'
            }),
            getPendenciasInteractiveStatusColumn(),
            getPendenciasInteractiveDateColumn({ key: 'deliveryDate', label: 'Entrega' }),
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-44',
                render: (row) => canAct
                    ? `<button type="button"
                        class="pendencias-implantacao-open-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-teal-100 text-teal-800 hover:bg-teal-200"
                        data-project-id="${row.id}"
                        data-project-name="${escapeHtml(row.projectName)}">
                        Implantação
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-implantacao-open-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    const projectId = Number(button.dataset.projectId);
                    const projectName = button.dataset.projectName || '';
                    if (!projectId || typeof openImplantacaoModal !== 'function') return;
                    openImplantacaoModal(projectId, projectName, { requireExisting: true });
                });
            });
        }
    });
}

async function queryPendenciasFabricaProjects(statusId) {
    const buildQuery = (selectColumns, withInactiveFilter = true) => {
        let query = supabaseClient
            .from('OrderProject')
            .select(selectColumns)
            .eq('statusId', statusId);
        if (withInactiveFilter) {
            query = query.eq('isComplementary', false).eq('isReplaced', false);
        }
        return query;
    };

    let result = await buildQuery(PENDENCIAS_FABRICA_PROJECT_SELECT);

    if (result.error?.message?.includes('isComplementary') || result.error?.message?.includes('isReplaced')) {
        result = await buildQuery(PENDENCIAS_FABRICA_PROJECT_SELECT, false);
    }

    if (result.error?.message?.includes('marceneiro')
        || result.error?.message?.includes('MontagemInterna')
        || result.error?.message?.includes('projectStatus')) {
        result = await buildQuery(PENDENCIAS_FABRICA_PROJECT_SELECT_FALLBACK, false);
    }

    if (result.error) return result;

    const projects = await enrichPendenciasProjectsWithStatus(result.data || []);
    return {
        ...result,
        data: excludeInactivePendenciasProjects(projects)
    };
}

async function fetchPendenciasFabricaProjectsByStatusName(statusName) {
    const statusId = await getPendenciasStatusIdByName(statusName);

    if (!statusId) {
        return {
            error: new Error(`Status "${statusName}" não encontrado.`),
            projects: []
        };
    }

    const result = await queryPendenciasFabricaProjects(statusId);
    if (result.error) {
        return { error: result.error, projects: [] };
    }

    return {
        error: null,
        projects: sortPendenciasByDeliveryDate(result.data || [])
    };
}

function getPendenciasFabricaMarceneiroOptionsHtml(selectedId = null) {
    return getMarceneiroOptionsHtml(selectedId);
}

function formatPendenciasFabricaDisplayDate(dateStr) {
    return formatDisplayDate(dateStr);
}

function getPendenciasFabricaMarceneiroName(project) {
    return getMarceneiroNameFromProject(project);
}

function getPendenciasFabricaProjectLabel(project) {
    return typeof getPendenciasProjectDetailLabel === 'function'
        ? getPendenciasProjectDetailLabel(project)
        : (project?.name || 'Projeto');
}

function renderPendenciasAguardandoMontagemInternaList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasGestorFabrica();
    const todayMax = getTodayInputDate();
    const subtitle = canAct
        ? 'Projetos em produção. Registre marceneiro e início da montagem interna.'
        : 'Visualização dos projetos aguardando início da montagem interna.';

    const rows = (projects || []).map(project => {
        const inicioValue = project.internalAssemblyStartDate
            ? String(project.internalAssemblyStartDate).split('T')[0]
            : '';

        return mapPendenciasInteractiveIdentity(project, {
            projectName: getPendenciasFabricaProjectLabel(project),
            deliveryDate: formatPendenciasDeliveryDate(project.deliveryDate),
            cabinetMakerName: getPendenciasFabricaMarceneiroName(project) || '—',
            cabinetMakerId: project.cabinetMakerId,
            internalAssemblyStartDate: inicioValue
        });
    });

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Aguar. Mont. Int.',
        subtitle,
        refreshButtonId: 'btn-pendencias-refresh-aguardando-montagem-interna',
        onRefresh: loadPendenciasAguardandoMontagemInterna,
        tableId: 'pendencias-aguardando-montagem-interna',
        rows,
        emptyMessage: 'Nenhum projeto em produção aguardando montagem interna.',
        minWidth: '980px',
        getRowAttrs: (row) => `data-pendencias-fabrica-project-id="${row.id}"`,
        columns: [
            ...getPendenciasInteractiveIdentityColumns(),
            getPendenciasInteractiveDateColumn({ key: 'deliveryDate', label: 'Entrega' }),
            {
                key: 'cabinetMakerName',
                label: 'Marceneiro',
                cellClass: 'p-3',
                render: (row) => `
                    <div class="flex items-center gap-1.5 min-w-[210px]">
                        <select class="pendencias-fabrica-marceneiro flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-600"
                            data-project-id="${row.id}" ${canAct ? '' : 'disabled'}>
                            ${getPendenciasFabricaMarceneiroOptionsHtml(row.cabinetMakerId)}
                        </select>
                        ${canAct ? `<button type="button"
                            class="pendencias-trocar-marceneiro-btn text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 hover:border-slate-300 px-2 py-1.5 rounded-lg font-medium border border-slate-200 transition shrink-0"
                            data-project-id="${row.id}">
                            Trocar
                        </button>` : ''}
                    </div>
                `
            },
            {
                key: 'internalAssemblyStartDate',
                label: 'Início',
                type: 'date',
                cellClass: 'p-3',
                render: (row) => `
                    <input type="date" class="pendencias-fabrica-inicio w-full min-w-[130px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-600"
                        max="${todayMax}" value="${escapeHtml(row.internalAssemblyStartDate)}" ${canAct ? '' : 'disabled'}>
                `
            },
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-40',
                render: (row) => canAct
                    ? `<button type="button"
                        class="pendencias-fabrica-inicio-btn text-xs bg-orange-100 text-orange-800 hover:bg-orange-200 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
                        data-project-id="${row.id}">
                        Iniciar montagem
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-trocar-marceneiro-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    changePendenciasProjectMarceneiro(Number(button.dataset.projectId));
                });
            });

            tbody?.querySelectorAll('.pendencias-fabrica-inicio-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    savePendenciasFabricaInicioMontagem(Number(button.dataset.projectId));
                });
            });
        }
    });
}

function renderPendenciasEmMontagemList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasGestorFabrica();
    const todayMax = getTodayInputDate();
    const subtitle = canAct
        ? 'Projetos em montagem interna. Registre a data de fim para enviar à expedição.'
        : 'Visualização dos projetos em montagem interna.';

    const rows = (projects || []).map(project => {
        const fimValue = project.internalAssemblyEndDate
            ? String(project.internalAssemblyEndDate).split('T')[0]
            : '';

        return mapPendenciasInteractiveIdentity(project, {
            projectName: getPendenciasFabricaProjectLabel(project),
            cabinetMakerName: getPendenciasFabricaMarceneiroName(project) || '—',
            cabinetMakerId: project.cabinetMakerId,
            internalAssemblyStartLabel: formatPendenciasFabricaDisplayDate(project.internalAssemblyStartDate),
            internalAssemblyStartDate: project.internalAssemblyStartDate,
            internalAssemblyEndDate: fimValue
        });
    });

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Em Montagem',
        subtitle,
        refreshButtonId: 'btn-pendencias-refresh-em-montagem',
        onRefresh: loadPendenciasEmMontagem,
        tableId: 'pendencias-em-montagem',
        rows,
        emptyMessage: 'Nenhum projeto em montagem interna.',
        minWidth: '1020px',
        getRowAttrs: (row) => `data-pendencias-fabrica-project-id="${row.id}"`,
        columns: [
            ...getPendenciasInteractiveIdentityColumns(),
            {
                key: 'cabinetMakerName',
                label: 'Marceneiro',
                cellClass: 'p-3',
                render: (row) => `
                    <div class="flex items-center gap-1.5 min-w-[210px]">
                        <select class="pendencias-fabrica-marceneiro flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600"
                            data-project-id="${row.id}" ${canAct ? '' : 'disabled'}>
                            ${getPendenciasFabricaMarceneiroOptionsHtml(row.cabinetMakerId)}
                        </select>
                        ${canAct ? `<button type="button"
                            class="pendencias-trocar-marceneiro-btn text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 hover:border-slate-300 px-2 py-1.5 rounded-lg font-medium border border-slate-200 transition shrink-0"
                            data-project-id="${row.id}">
                            Trocar
                        </button>` : ''}
                    </div>
                `
            },
            getPendenciasInteractiveDateColumn({
                key: 'internalAssemblyStartLabel',
                label: 'Início',
                sortKey: 'internalAssemblyStartDate'
            }),
            {
                key: 'internalAssemblyEndDate',
                label: 'Fim',
                type: 'date',
                cellClass: 'p-3',
                render: (row) => `
                    <input type="date" class="pendencias-fabrica-fim w-full min-w-[130px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600"
                        max="${todayMax}" value="${escapeHtml(row.internalAssemblyEndDate)}" ${canAct ? '' : 'disabled'}>
                `
            },
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-40',
                render: (row) => canAct
                    ? `<button type="button"
                        class="pendencias-fabrica-fim-btn text-xs bg-amber-100 text-amber-800 hover:bg-amber-200 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
                        data-project-id="${row.id}">
                        Finalizar montagem
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-trocar-marceneiro-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    changePendenciasProjectMarceneiro(Number(button.dataset.projectId));
                });
            });

            tbody?.querySelectorAll('.pendencias-fabrica-fim-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    savePendenciasFabricaFimMontagem(Number(button.dataset.projectId));
                });
            });
        }
    });
}

async function changePendenciasProjectMarceneiro(projectId) {
    if (!projectId) return;

    if (!canActPendenciasGestorFabrica()) {
        alertAppDialog('Sem permissão para alterar marceneiro.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const row = document.querySelector(`tr[data-pendencias-fabrica-project-id="${projectId}"]`);
    const select = row?.querySelector('.pendencias-fabrica-marceneiro');
    if (!select) return;

    const newMarceneiroId = select.value ? Number(select.value) : null;

    try {
        setPendenciasActionLoading(true, 'Atualizando marceneiro do projeto...');
        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                cabinetMakerId: newMarceneiroId,
                updatedAt: new Date().toISOString(),
                updatedById: currentUser?.id || null
            })
            .eq('id', projectId);

        if (error) throw error;

        if (typeof gestaoOrdersCache !== 'undefined') {
            const cachedProject = gestaoOrdersCache.flatMap(o => o.projects || []).find(p => Number(p.id) === Number(projectId));
            if (cachedProject) {
                cachedProject.cabinetMakerId = newMarceneiroId;
            }
        }

        setPendenciasActionLoading(true, 'Marceneiro atualizado com sucesso!', 'success');
        await new Promise(resolve => setTimeout(resolve, 800));
        setPendenciasActionLoading(false);

        if (typeof loadPendenciasEmMontagem === 'function' && pendenciasActiveItem === 'em-montagem') {
            await loadPendenciasEmMontagem();
        } else if (typeof loadPendenciasAguardandoMontagemInterna === 'function' && pendenciasActiveItem === 'aguardando-montagem-interna') {
            await loadPendenciasAguardandoMontagemInterna();
        }
    } catch (err) {
        console.error('changePendenciasProjectMarceneiro:', err);
        setPendenciasActionLoading(true, `Erro ao atualizar marceneiro: ${err.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2000));
        setPendenciasActionLoading(false);
    }
}

async function savePendenciasFabricaInicioMontagem(projectId) {
    if (!canActPendenciasGestorFabrica()) {
        alertAppDialog('Sem permissão para registrar montagem.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const row = document.querySelector(`tr[data-pendencias-fabrica-project-id="${projectId}"]`);
    if (!row) return;

    const cabinetMakerId = row.querySelector('.pendencias-fabrica-marceneiro')?.value;
    const internalAssemblyStartDate = row.querySelector('.pendencias-fabrica-inicio')?.value;
    const projectLabel = row.querySelector('td:nth-child(3)')?.textContent?.trim() || 'Projeto';

    if (!cabinetMakerId) {
        alertAppDialog(`"${projectLabel}": selecione o marceneiro responsável.`);
        return;
    }
    if (!internalAssemblyStartDate) {
        alertAppDialog(`"${projectLabel}": informe a data de início da montagem interna.`);
        return;
    }
    if (isInputDateInFuture(internalAssemblyStartDate)) {
        alertAppDialog(`"${projectLabel}": a data de início não pode ser no futuro.`, { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!(await confirmAppDialog(`Registrar início da montagem interna de "${projectLabel}"?`))) return;

    const montagemInternaStatusId = typeof getMontagemInternaProjectStatusId === 'function'
        ? await getMontagemInternaProjectStatusId()
        : await getPendenciasStatusIdByName(PENDENCIAS_STATUS_MONTAGEM_INTERNA);

    if (!montagemInternaStatusId) {
        alertAppDialog(`Status "${PENDENCIAS_STATUS_MONTAGEM_INTERNA}" não encontrado.`);
        return;
    }

    try {
        if (typeof persistFabricaInicioProject === 'function') {
            await persistFabricaInicioProject({
                projectId,
                cabinetMakerId: Number(cabinetMakerId),
                internalAssemblyStartDate,
                label: projectLabel
            }, montagemInternaStatusId);
        } else {
            const now = new Date().toISOString();
            const { error } = await supabaseClient
                .from('OrderProject')
                .update({
                    cabinetMakerId: Number(cabinetMakerId),
                    internalAssemblyStartDate,
                    statusId: montagemInternaStatusId,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', projectId);

            if (error) throw new Error(error.message);
        }

        await reloadActivePendenciasGestorFabricaList();
    } catch (error) {
        const sqlHint = error.message?.includes('cabinetMakerId') || error.message?.includes('MontagemInterna')
            ? '\n\nExecute supabase/create-gestao-order-fields.sql e supabase/create-marceneiro.sql no Supabase.'
            : '';
        alertAppDialog('Erro ao salvar: ' + error.message + sqlHint);
    }
}

async function savePendenciasFabricaFimMontagem(projectId) {
    if (!canActPendenciasGestorFabrica()) {
        alertAppDialog('Sem permissão para registrar montagem.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const row = document.querySelector(`tr[data-pendencias-fabrica-project-id="${projectId}"]`);
    if (!row) return;

    const internalAssemblyEndDate = row.querySelector('.pendencias-fabrica-fim')?.value;
    const projectLabel = row.querySelector('td:nth-child(3)')?.textContent?.trim() || 'Projeto';

    if (!internalAssemblyEndDate) {
        alertAppDialog(`"${projectLabel}": informe a data de fim da montagem interna.`);
        return;
    }
    if (isInputDateInFuture(internalAssemblyEndDate)) {
        alertAppDialog(`"${projectLabel}": a data de fim não pode ser no futuro.`, { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!(await confirmAppDialog(`Finalizar montagem interna de "${projectLabel}" e enviar à expedição?`))) return;

    const expedicaoStatusId = typeof getExpedicaoProjectStatusId === 'function'
        ? await getExpedicaoProjectStatusId()
        : await getPendenciasStatusIdByName(PENDENCIAS_STATUS_EXPEDICAO);

    if (!expedicaoStatusId) {
        alertAppDialog(`Status "${PENDENCIAS_STATUS_EXPEDICAO}" não encontrado.`);
        return;
    }

    try {
        if (typeof persistFabricaFimProject === 'function') {
            await persistFabricaFimProject({
                projectId,
                internalAssemblyEndDate,
                label: projectLabel
            }, expedicaoStatusId);
        } else {
            const now = new Date().toISOString();
            const { error } = await supabaseClient
                .from('OrderProject')
                .update({
                    internalAssemblyEndDate,
                    statusId: expedicaoStatusId,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', projectId);

            if (error) throw new Error(error.message);
        }

        await reloadActivePendenciasGestorFabricaList();
    } catch (error) {
        const sqlHint = error.message?.includes('internalAssemblyEndDate')
            ? '\n\nExecute supabase/create-gestao-order-fields.sql e supabase/create-marceneiro.sql no Supabase.'
            : '';
        alertAppDialog('Erro ao salvar: ' + error.message + sqlHint);
    }
}

async function reloadActivePendenciasGestorFabricaList() {
    if (!pendenciasActiveItem) {
        await loadPendenciasSectionOverview();
        return;
    }

    if (pendenciasActiveSection === 'gestor-fabrica' && pendenciasActiveItem === 'aguardando-montagem-interna') {
        await loadPendenciasAguardandoMontagemInterna();
        return;
    }

    if (pendenciasActiveSection === 'gestor-fabrica' && pendenciasActiveItem === 'em-montagem') {
        await loadPendenciasEmMontagem();
    }
}

async function loadPendenciasAguardandoMontagemInterna() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasGestorFabricaMenu()) {
        renderPendenciasPlaceholder('Aguar. Mont. Int.', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    await loadMarceneiros(true);

    const { error, projects } = await fetchPendenciasFabricaProjectsByStatusName(PENDENCIAS_STATUS_EM_PRODUCAO);

    if (error) {
        renderPendenciasPlaceholder('Aguar. Mont. Int.', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasAguardandoMontagemInternaList(projects);
}

async function loadPendenciasEmMontagem() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasGestorFabricaMenu()) {
        renderPendenciasPlaceholder('Em Montagem', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    await loadMarceneiros(true);

    const { error, projects } = await fetchPendenciasFabricaProjectsByStatusName(PENDENCIAS_STATUS_MONTAGEM_INTERNA);

    if (error) {
        renderPendenciasPlaceholder('Em Montagem', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEmMontagemList(projects);
}

