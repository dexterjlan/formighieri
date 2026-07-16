function canAccessPendenciasAguardandoMedicao() {
    return canSeePendenciasGestorComercialMenu();
}

function canEditPendenciasAguardandoMedicaoStatus() {
    return isGestorComercial();
}

async function fetchPendenciasAguardandoMedicaoProjects() {
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

let pendenciasAguardandoMedicaoProjectsCache = [];
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
            clientName: order?.clientName || '—',
            consultantName: order?.consultantName || '—'
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

function groupPendenciasAguardandoMedicaoProjects(projects) {
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
                clientName: project.order?.clientName || '—',
                consultantName: project.order?.consultantName || '—',
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
    const projects = pendenciasAguardandoMedicaoProjectsCache.filter(project => (
        Number(project.orderId) === Number(orderId)
        && getPendenciasProjectStatusName(project) === statusName
    ));

    return [...projects].sort((a, b) => (
        getPendenciasAguardandoMedicaoProjectLabel(a).localeCompare(
            getPendenciasAguardandoMedicaoProjectLabel(b),
            'pt-BR',
            { sensitivity: 'base' }
        )
    ));
}

function setPendenciasAguardandoMedicaoModalLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('pendencias-aguardando-medicao-modal-loading');
    const messageEl = document.getElementById('pendencias-aguardando-medicao-modal-loading-msg');
    const spinner = document.getElementById('pendencias-aguardando-medicao-modal-loading-spinner');
    const successIcon = document.getElementById('pendencias-aguardando-medicao-modal-loading-success');
    const errorIcon = document.getElementById('pendencias-aguardando-medicao-modal-loading-error');
    const show = Boolean(active);

    overlay?.classList.toggle('hidden', !show);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.toggle('text-red-600', status === 'error');
        messageEl.classList.toggle('text-emerald-700', status === 'success');
        messageEl.classList.toggle('text-slate-700', status === 'loading');
    }

    spinner?.classList.toggle('hidden', status !== 'loading');
    successIcon?.classList.toggle('hidden', status !== 'success');
    errorIcon?.classList.toggle('hidden', status !== 'error');

    [
        'btn-pendencias-am-obra',
        'btn-pendencias-am-medicao',
        'btn-pendencias-am-fechar',
        'pendencias-am-select-all-check'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = show;
    });

    document.querySelectorAll('#pendencias-am-modal-projects-list input, #pendencias-am-modal-projects-list textarea')
        .forEach(el => {
            if (show) {
                el.dataset.pendenciasAmLoadingDisabled = '1';
                el.disabled = true;
            } else if (el.dataset.pendenciasAmLoadingDisabled === '1') {
                delete el.dataset.pendenciasAmLoadingDisabled;
                el.disabled = false;
            }
        });
}

function closePendenciasAguardandoMedicaoModal() {
    setPendenciasAguardandoMedicaoModalLoading(false);
    pendenciasAguardandoMedicaoEditGroup = null;
    pendenciasAguardandoMedicaoRefreshContext = null;
    toggleModal('pendencias-aguardando-medicao-modal', false);
}

function getPendenciasAguardandoMedicaoProjectLabel(project) {
    return typeof getPendenciasProjectDetailLabel === 'function'
        ? getPendenciasProjectDetailLabel(project)
        : (project?.name || 'Projeto');
}

function renderPendenciasAguardandoMedicaoModalProjectRow(project) {
    const label = getPendenciasAguardandoMedicaoProjectLabel(project);
    const observation = project.observacaoAguardandoObra || '';

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
        clientName: sample.order?.clientName || '—',
        consultantName: sample.order?.consultantName || '—'
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

    pendenciasAguardandoMedicaoProjectsCache = enrichOrderProjectsForAguardandoMedicaoModal(orderId, groupProjects);
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
        const project = pendenciasAguardandoMedicaoProjectsCache.find(item => Number(item.id) === projectId);
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
        payload.observacaoAguardandoObra = observation || null;
    }

    let { error } = await supabaseClient
        .from('OrderProject')
        .update(payload)
        .eq('id', projectId);

    if (error?.message?.includes('observacaoAguardandoObra')) {
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
                name: getPendenciasAguardandoMedicaoProjectLabel(item.project)
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

    pendenciasAguardandoMedicaoProjectsCache = projects;
    const canEdit = canEditPendenciasAguardandoMedicaoStatus();
    const subtitle = canEdit
        ? 'Projetos agrupados por pedido e status. Use Editar para alterar status e observações.'
        : 'Visualização dos projetos vendidos ou aguardando obra.';

    const groups = groupPendenciasAguardandoMedicaoProjects(projects);
    const rows = groups.map(group => {
        const statusClass = getPendenciasProjectStatusBadgeClass(group.statusName);
        const projectNames = group.projects
            .map(project => getPendenciasAguardandoMedicaoProjectLabel(project))
            .join(' | ');

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(group.orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(group.clientName)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(group.statusName || '—')}
                    </span>
                </td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(projectNames)}</td>
                <td class="p-3 text-right whitespace-nowrap">
                    ${canEdit
                        ? `<button type="button"
                            class="pendencias-am-edit-btn text-xs bg-violet-50 text-violet-800 border border-violet-200 px-2.5 py-1 rounded-lg font-medium hover:bg-violet-100"
                            data-order-id="${group.orderId}"
                            data-status-name="${escapeHtml(group.statusName)}">
                            Editar
                        </button>`
                        : '<span class="text-xs text-slate-400">—</span>'}
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aguardando Medição</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-aguardando-medicao"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${groups.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[820px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Status</th>
                                <th class="text-left p-3 font-semibold">Projetos</th>
                                <th class="text-right p-3 font-semibold w-28">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto vendido ou aguardando obra.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-aguardando-medicao')
        ?.addEventListener('click', () => loadPendenciasAguardandoMedicao());

    content.querySelectorAll('.pendencias-am-edit-btn').forEach(button => {
        button.addEventListener('click', () => {
            openPendenciasAguardandoMedicaoEditModal(
                Number(button.dataset.orderId),
                button.dataset.statusName
            );
        });
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
        confirmMessage
    } = config;

    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasPpcpStatus();
    const labelFn = config.projectLabelFn || getPendenciasProjectLabel;
    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = labelFn(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const statusName = getPendenciasProjectStatusName(project);
        const statusClass = getPendenciasProjectStatusBadgeClass(statusName);
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-ppcp-action-btn text-xs px-2.5 py-1 rounded-lg font-medium ${actionButtonClass}"
                data-project-id="${project.id}"
                data-expected-status="${escapeHtml(expectedStatusName)}"
                data-target-status="${escapeHtml(targetStatusName)}"
                data-confirm-message="${escapeHtml(confirmMessage)}">
                ${escapeHtml(actionLabel)}
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(statusName || '—')}
                    </span>
                </td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">${escapeHtml(title)}</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="${refreshButtonId}"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[920px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Status</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-44">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector(`#${refreshButtonId}`)
        ?.addEventListener('click', refreshHandler);

    content.querySelectorAll('.pendencias-ppcp-action-btn').forEach(button => {
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
    const overviewMode = isAdmin() || isGestorProjetos();
    const result = await queryPendenciasProjects(
        overviewMode
            ? { statusId }
            : { statusId, designerId: userId }
    );

    if (result.error) {
        return { error: result.error, projects: [] };
    }

    return {
        error: null,
        projects: sortPendenciasByDeliveryDate(result.data || [])
    };
}

function renderPendenciasNomearList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const labelFn = typeof getPendenciasProjectDetailLabel === 'function'
        ? getPendenciasProjectDetailLabel
        : (project => project?.name || 'Projeto');

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = labelFn(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const statusName = getPendenciasProjectStatusName(project);
        const statusClass = getPendenciasProjectStatusBadgeClass(statusName);
        const canAct = canActPendenciasNomear(project);
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-nomear-action-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-purple-100 text-purple-800 hover:bg-purple-200"
                data-project-id="${project.id}">
                Nomeado
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(statusName || '—')}
                    </span>
                </td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Nomear</h3>
                    <p class="text-xs text-slate-400 mt-0.5">Projetos aguardando nomeação pelo projetista responsável.</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-nomear"
                    class="order-tab-action-btn text-xs bg-white border border-purple-200 text-purple-800 px-3 py-1.5 rounded-lg font-medium hover:bg-purple-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[920px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Status</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-44">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto aguardando nomeação.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-nomear')
        ?.addEventListener('click', () => loadPendenciasNomear());

    content.querySelectorAll('.pendencias-nomear-action-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const projectId = Number(button.dataset.projectId);
            if (!projectId) return;

            await markOrderProjectAsNomeado(projectId, {
                onSuccess: () => loadPendenciasNomear()
            });
        });
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

    const { error, projects } = await fetchPendenciasNomearProjects();

    if (error) {
        renderPendenciasPlaceholder('Nomear', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasNomearList(projects);
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

    if (typeof fetchOrderProjectsInImplantacaoStatus === 'function'
        && typeof ensureImplantacaoRecordsForProjects === 'function') {
        const orphanProjects = await fetchOrderProjectsInImplantacaoStatus();
        if (orphanProjects.length) {
            await ensureImplantacaoRecordsForProjects(orphanProjects);
        }
    }

    const { data: implantacoes, error } = await supabaseClient
        .from('Implantacao')
        .select('id, status, orderProjectId, updatedAt')
        .neq('status', statusEncerrado)
        .order('updatedAt', { ascending: false });

    if (error?.message?.includes('Implantacao')) {
        return {
            error: new Error('Tabela Implantacao não encontrada. Execute supabase/create-implantacao.sql no Supabase.'),
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
            implantacaoId: implantacao.id,
            implantacaoStatus: implantacao.status
        };
    });

    return {
        error: null,
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

    const { error, projects } = await fetchPendenciasImplantacoesAbertas();

    if (error) {
        renderPendenciasPlaceholder('Implantação', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasImplantacaoList(projects);
}

function renderPendenciasImplantacaoList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasPpcpStatus();
    const labelFn = typeof getPendenciasProjectDetailLabel === 'function'
        ? getPendenciasProjectDetailLabel
        : (project => project?.name || 'Projeto');

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = labelFn(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const statusLabel = project.implantacaoStatus || getPendenciasProjectStatusName(project);
        const statusClass = typeof getImplantacaoStatusBadgeClass === 'function' && project.implantacaoStatus
            ? getImplantacaoStatusBadgeClass(project.implantacaoStatus)
            : getPendenciasProjectStatusBadgeClass(getPendenciasProjectStatusName(project));
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-implantacao-open-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-teal-100 text-teal-800 hover:bg-teal-200"
                data-project-id="${project.id}"
                data-project-name="${escapeHtml(projectLabel)}">
                Implantação
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(statusLabel || '—')}
                    </span>
                </td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    const subtitle = canAct
        ? 'Implantações em aberto. Abra o checklist para enviar à produção ou compras.'
        : 'Visualização das implantações em aberto.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Implantação</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-implantacao"
                    class="order-tab-action-btn text-xs bg-white border border-teal-200 text-teal-800 px-3 py-1.5 rounded-lg font-medium hover:bg-teal-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[920px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Status</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-44">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhuma implantação em aberto.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-implantacao')
        ?.addEventListener('click', () => loadPendenciasImplantacao());

    content.querySelectorAll('.pendencias-implantacao-open-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const projectId = Number(button.dataset.projectId);
            const projectName = button.dataset.projectName || '';
            if (!projectId || typeof openImplantacaoModal !== 'function') return;
            openImplantacaoModal(projectId, projectName, { requireExisting: true });
        });
    });
}

async function queryPendenciasFabricaProjects(statusId) {
    const buildQuery = (selectColumns, withInactiveFilter = true) => {
        let query = supabaseClient
            .from('OrderProject')
            .select(selectColumns)
            .eq('statusId', statusId);
        if (withInactiveFilter) {
            query = query.eq('isComplementar', false).eq('isSubstituido', false);
        }
        return query;
    };

    let result = await buildQuery(PENDENCIAS_FABRICA_PROJECT_SELECT);

    if (result.error?.message?.includes('isComplementar') || result.error?.message?.includes('isSubstituido')) {
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

function getPendenciasFabricaTodayInputDate() {
    if (typeof getTodayInputDate === 'function') {
        return getTodayInputDate();
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getPendenciasFabricaMarceneiroOptionsHtml(selectedId = null) {
    if (typeof getFabricaMarceneiroOptionsHtml === 'function') {
        return getFabricaMarceneiroOptionsHtml(selectedId);
    }

    return '<option value="">Nenhum marceneiro cadastrado</option>';
}

function formatPendenciasFabricaDisplayDate(dateStr) {
    if (typeof formatFabricaDisplayDate === 'function') {
        return formatFabricaDisplayDate(dateStr);
    }

    if (!dateStr) return '—';
    const value = String(dateStr).split('T')[0];
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return '—';
    return `${day}/${month}/${year}`;
}

function getPendenciasFabricaMarceneiroName(project) {
    if (typeof getFabricaMarceneiroName === 'function') {
        return getFabricaMarceneiroName(project);
    }

    return project.marceneiro?.name || '—';
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
    const todayMax = getPendenciasFabricaTodayInputDate();
    const subtitle = canAct
        ? 'Projetos em produção. Registre marceneiro e início da montagem interna.'
        : 'Visualização dos projetos aguardando início da montagem interna.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasFabricaProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const inicioValue = project.inicioMontagemInterna
            ? String(project.inicioMontagemInterna).split('T')[0]
            : '';
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-fabrica-inicio-btn text-xs bg-orange-100 text-orange-800 hover:bg-orange-200 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
                data-project-id="${project.id}">
                Iniciar montagem
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0" data-pendencias-fabrica-project-id="${project.id}">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3">
                    <select class="pendencias-fabrica-marceneiro w-full min-w-[140px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-600"
                        ${canAct ? '' : 'disabled'}>
                        ${getPendenciasFabricaMarceneiroOptionsHtml(project.marceneiroId)}
                    </select>
                </td>
                <td class="p-3">
                    <input type="date" class="pendencias-fabrica-inicio w-full min-w-[130px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-600"
                        max="${todayMax}" value="${escapeHtml(inicioValue)}" ${canAct ? '' : 'disabled'}>
                </td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aguar. Mont. Int.</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-aguardando-montagem-interna"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[980px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-left p-3 font-semibold">Marceneiro</th>
                                <th class="text-left p-3 font-semibold">Início</th>
                                <th class="text-right p-3 font-semibold w-40">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto em produção aguardando montagem interna.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-aguardando-montagem-interna')
        ?.addEventListener('click', () => loadPendenciasAguardandoMontagemInterna());

    content.querySelectorAll('.pendencias-fabrica-inicio-btn').forEach(button => {
        button.addEventListener('click', async () => {
            savePendenciasFabricaInicioMontagem(Number(button.dataset.projectId));
        });
    });
}

function renderPendenciasEmMontagemList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasGestorFabrica();
    const todayMax = getPendenciasFabricaTodayInputDate();
    const subtitle = canAct
        ? 'Projetos em montagem interna. Registre a data de fim para enviar à expedição.'
        : 'Visualização dos projetos em montagem interna.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasFabricaProjectLabel(project);
        const marceneiroName = getPendenciasFabricaMarceneiroName(project);
        const inicioDisplay = formatPendenciasFabricaDisplayDate(project.inicioMontagemInterna);
        const fimValue = project.fimMontagemInterna
            ? String(project.fimMontagemInterna).split('T')[0]
            : '';
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-fabrica-fim-btn text-xs bg-amber-100 text-amber-800 hover:bg-amber-200 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
                data-project-id="${project.id}">
                Finalizar montagem
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0" data-pendencias-fabrica-project-id="${project.id}">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(marceneiroName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(inicioDisplay)}</td>
                <td class="p-3">
                    <input type="date" class="pendencias-fabrica-fim w-full min-w-[130px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600"
                        max="${todayMax}" value="${escapeHtml(fimValue)}" ${canAct ? '' : 'disabled'}>
                </td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Em Montagem</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-em-montagem"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[980px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Marceneiro</th>
                                <th class="text-left p-3 font-semibold">Início</th>
                                <th class="text-left p-3 font-semibold">Fim</th>
                                <th class="text-right p-3 font-semibold w-40">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto em montagem interna.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-em-montagem')
        ?.addEventListener('click', () => loadPendenciasEmMontagem());

    content.querySelectorAll('.pendencias-fabrica-fim-btn').forEach(button => {
        button.addEventListener('click', async () => {
            savePendenciasFabricaFimMontagem(Number(button.dataset.projectId));
        });
    });
}

async function savePendenciasFabricaInicioMontagem(projectId) {
    if (!canActPendenciasGestorFabrica()) {
        alertAppDialog('Sem permissão para registrar montagem.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const row = document.querySelector(`tr[data-pendencias-fabrica-project-id="${projectId}"]`);
    if (!row) return;

    const marceneiroId = row.querySelector('.pendencias-fabrica-marceneiro')?.value;
    const inicioMontagemInterna = row.querySelector('.pendencias-fabrica-inicio')?.value;
    const projectLabel = row.querySelector('td:nth-child(3)')?.textContent?.trim() || 'Projeto';

    if (!marceneiroId) {
        alertAppDialog(`"${projectLabel}": selecione o marceneiro responsável.`);
        return;
    }
    if (!inicioMontagemInterna) {
        alertAppDialog(`"${projectLabel}": informe a data de início da montagem interna.`);
        return;
    }
    if (typeof isFabricaDateInFuture === 'function' && isFabricaDateInFuture(inicioMontagemInterna)) {
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
                marceneiroId: Number(marceneiroId),
                inicioMontagemInterna,
                label: projectLabel
            }, montagemInternaStatusId);
        } else {
            const now = new Date().toISOString();
            const { error } = await supabaseClient
                .from('OrderProject')
                .update({
                    marceneiroId: Number(marceneiroId),
                    inicioMontagemInterna,
                    statusId: montagemInternaStatusId,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', projectId);

            if (error) throw new Error(error.message);
        }

        await reloadActivePendenciasGestorFabricaList();
        if (activeOrderId && typeof loadFabricaProjects === 'function') {
            await loadFabricaProjects(activeOrderId);
        }
    } catch (error) {
        const sqlHint = error.message?.includes('marceneiroId') || error.message?.includes('MontagemInterna')
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

    const fimMontagemInterna = row.querySelector('.pendencias-fabrica-fim')?.value;
    const projectLabel = row.querySelector('td:nth-child(3)')?.textContent?.trim() || 'Projeto';

    if (!fimMontagemInterna) {
        alertAppDialog(`"${projectLabel}": informe a data de fim da montagem interna.`);
        return;
    }
    if (typeof isFabricaDateInFuture === 'function' && isFabricaDateInFuture(fimMontagemInterna)) {
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
                fimMontagemInterna,
                label: projectLabel
            }, expedicaoStatusId);
        } else {
            const now = new Date().toISOString();
            const { error } = await supabaseClient
                .from('OrderProject')
                .update({
                    fimMontagemInterna,
                    statusId: expedicaoStatusId,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', projectId);

            if (error) throw new Error(error.message);
        }

        await reloadActivePendenciasGestorFabricaList();
        if (activeOrderId && typeof loadFabricaProjects === 'function') {
            await loadFabricaProjects(activeOrderId);
        }
    } catch (error) {
        const sqlHint = error.message?.includes('fimMontagemInterna')
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

    if (typeof loadFabricaMarceneiros === 'function') {
        await loadFabricaMarceneiros();
    }

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

    if (typeof loadFabricaMarceneiros === 'function') {
        await loadFabricaMarceneiros();
    }

    const { error, projects } = await fetchPendenciasFabricaProjectsByStatusName(PENDENCIAS_STATUS_MONTAGEM_INTERNA);

    if (error) {
        renderPendenciasPlaceholder('Em Montagem', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEmMontagemList(projects);
}

