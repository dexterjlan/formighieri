const ENTREGA_TECNICA_STATUS = 'Aguardando Entrega Técnica';
const ENTREGUE_STATUS = 'Entregue';

let orderProjectEntregaPending = null;

function canActFinalizarEntregaTecnica() {
    return isAdmin() || isGestorComercial();
}

function canShowOrderProjectFinalizarEntregaTecnicaAction(project) {
    if (!project || !canActOnOrderProject(project)) return false;
    if (!canActFinalizarEntregaTecnica()) return false;
    return getOrderProjectStatusName(project) === ENTREGA_TECNICA_STATUS;
}

function isPendenciasViewVisibleForEntrega() {
    const view = document.getElementById('pendencias-view');
    return Boolean(view && !view.classList.contains('hidden'));
}

function isOrderProjectsPanelVisibleForEntrega() {
    const content = document.getElementById('order-content');
    return Boolean(content && !content.classList.contains('hidden'));
}

function setOrderProjectEntregaActionLoading(active, message = 'Processando...', status = 'loading') {
    if (isPendenciasViewVisibleForEntrega() && typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(active, message, status);
        return;
    }

    if (isOrderProjectsPanelVisibleForEntrega() && typeof setOrderProjectsPanelActionLoading === 'function') {
        setOrderProjectsPanelActionLoading(active, message, status);
    }
}

function closeOrderProjectEntregaModal() {
    orderProjectEntregaPending = null;
    document.getElementById('order-project-entrega-batch-section')?.classList.add('hidden');
    document.getElementById('order-project-entrega-context')?.classList.remove('hidden');
    toggleModal('order-project-entrega-modal', false);
}

function setOrderProjectEntregaModalMode(mode = 'single') {
    const isBatch = mode === 'batch';
    document.getElementById('order-project-entrega-batch-section')?.classList.toggle('hidden', !isBatch);
    document.getElementById('order-project-entrega-context')?.classList.toggle('hidden', isBatch);
}

async function openOrderProjectEntregaModal(projectId, projectName = '', options = {}) {
    if (!canActFinalizarEntregaTecnica()) {
        alertAppDialog('Somente o Gestor Comercial ou Admin pode finalizar a entrega.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return;
    }

    const dateInput = document.getElementById('order-project-entrega-data');
    const contextEl = document.getElementById('order-project-entrega-context');

    if (dateInput) {
        dateInput.value = getTodayInputDate();
        dateInput.max = getTodayInputDate();
    }
    setOrderProjectEntregaModalMode('single');

    if (contextEl) {
        const label = projectName?.trim() || 'este projeto';
        contextEl.textContent = `Projeto: ${label}`;
    }

    orderProjectEntregaPending = {
        projectIds: [Number(projectId)],
        projectName: projectName?.trim() || '',
        onSuccess: typeof options.onSuccess === 'function' ? options.onSuccess : null
    };

    toggleModal('order-project-entrega-modal', true);
}

async function openOrderProjectEntregaBatchModal(projects = [], options = {}) {
    if (!canActFinalizarEntregaTecnica()) {
        alertAppDialog('Somente o Gestor Comercial ou Admin pode finalizar a entrega.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return;
    }

    const selectedProjects = (projects || []).filter(project => Number(project?.id));
    const orderIds = [...new Set(selectedProjects.map(project => Number(project.orderId)).filter(Boolean))];
    if (!selectedProjects.length) {
        alertAppDialog('Selecione ao menos um projeto.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (orderIds.length !== 1) {
        alertAppDialog(
            'Selecione apenas projetos do mesmo pedido para finalizar em lote.',
            { variant: 'warning', title: 'Aviso' }
        );
        return;
    }

    const sample = selectedProjects[0];
    const orderCode = sample?.order?.orderCode || '—';
    const clientName = typeof getOrderClientName === 'function'
        ? getOrderClientName(sample.order)
        : '—';

    const dateInput = document.getElementById('order-project-entrega-data');
    if (dateInput) {
        dateInput.value = getTodayInputDate();
        dateInput.max = getTodayInputDate();
    }

    setOrderProjectEntregaModalMode('batch');

    const orderLineEl = document.getElementById('order-project-entrega-order-line');
    if (orderLineEl) {
        orderLineEl.textContent = `${orderCode} — ${clientName}`;
    }

    const countEl = document.getElementById('order-project-entrega-project-count');
    if (countEl) {
        countEl.textContent = String(selectedProjects.length);
    }

    const listEl = document.getElementById('order-project-entrega-projects-list');
    if (listEl) {
        listEl.innerHTML = selectedProjects.map(project => {
            const label = typeof getPendenciasProjectDetailLabel === 'function'
                ? getPendenciasProjectDetailLabel(project)
                : (project?.name || 'Projeto');
            return `<li>${escapeHtml(label)}</li>`;
        }).join('');
    }

    orderProjectEntregaPending = {
        projectIds: selectedProjects.map(project => Number(project.id)),
        onSuccess: typeof options.onSuccess === 'function' ? options.onSuccess : null
    };

    toggleModal('order-project-entrega-modal', true);
}

async function refreshOrderProjectEntregaViews() {
    if (activeOrderId && typeof loadOrderProjects === 'function') {
        await loadOrderProjects(activeOrderId);
    }
    if (typeof refreshOrdersListSummary === 'function') {
        await refreshOrdersListSummary();
    }
}

async function submitOrderProjectEntregaModal() {
    const pending = orderProjectEntregaPending;
    const projectIds = (pending?.projectIds || []).map(id => Number(id)).filter(Boolean);
    if (!projectIds.length) return;

    const actualDeliveryDate = document.getElementById('order-project-entrega-data')?.value;
    if (!actualDeliveryDate) {
        alertAppDialog('Informe a data de entrega do pedido.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (isInputDateInFuture(actualDeliveryDate)) {
        alertAppDialog('A data de entrega não pode ser no futuro.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const onSuccess = pending.onSuccess;
    closeOrderProjectEntregaModal();

    await finalizeEntregaTecnicaForProjects(projectIds, {
        actualDeliveryDate,
        onSuccess,
        projectName: pending.projectName || ''
    });
}

async function fetchOrderProjectForEntrega(projectId) {
    const { data: rawProject, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, orderId, name, statusId, projectStatus:OrderProjectStatus(id, name)')
        .eq('id', projectId)
        .maybeSingle();

    if (readError?.message?.includes('projectStatus')) {
        const fallback = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, name, statusId')
            .eq('id', projectId)
            .maybeSingle();

        if (fallback.error || !fallback.data) {
            return null;
        }

        const statusResult = await supabaseClient
            .from('OrderProjectStatus')
            .select('id, name')
            .eq('id', fallback.data.statusId)
            .maybeSingle();

        return {
            ...fallback.data,
            projectStatus: statusResult.data || null
        };
    }

    if (readError || !rawProject) {
        return null;
    }

    return rawProject;
}

async function finalizeEntregaTecnicaForProject(projectId, options = {}) {
    const projectIds = [Number(projectId)].filter(Boolean);
    if (!projectIds.length) return false;

    if (!options.actualDeliveryDate) {
        await openOrderProjectEntregaModal(projectId, options.projectName || '', {
            onSuccess: options.onSuccess
        });
        return false;
    }

    return finalizeEntregaTecnicaForProjects(projectIds, options);
}

async function finalizeEntregaTecnicaForProjects(projectIds = [], options = {}) {
    const { actualDeliveryDate: providedDate, onSuccess } = options;
    const normalizedProjectIds = [...new Set((projectIds || []).map(id => Number(id)).filter(Boolean))];

    if (!canActFinalizarEntregaTecnica()) {
        alertAppDialog('Somente o Gestor Comercial ou Admin pode finalizar a entrega.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return false;
    }

    if (!normalizedProjectIds.length || !providedDate) {
        return false;
    }

    const projects = [];
    for (const projectId of normalizedProjectIds) {
        const project = await fetchOrderProjectForEntrega(projectId);
        if (!project) {
            alertAppDialog('Projeto não encontrado.');
            return false;
        }
        projects.push(project);
    }

    const orderIds = [...new Set(projects.map(project => Number(project.orderId)).filter(Boolean))];
    if (orderIds.length !== 1) {
        alertAppDialog(
            'Selecione apenas projetos do mesmo pedido para finalizar em lote.',
            { variant: 'warning', title: 'Aviso' }
        );
        return false;
    }

    const invalidStatusProject = projects.find(project => getOrderProjectStatusName(project) !== ENTREGA_TECNICA_STATUS);
    if (invalidStatusProject) {
        alertAppDialog('Um ou mais projetos tiveram o status alterado. Atualize a lista.');
        if (typeof onSuccess === 'function') {
            await onSuccess();
        }
        return false;
    }

    const targetStatusId = typeof getPendenciasStatusIdByName === 'function'
        ? await getPendenciasStatusIdByName(ENTREGUE_STATUS)
        : await getOrderProjectStatusIdByName(ENTREGUE_STATUS);

    if (!targetStatusId) {
        alertAppDialog(`Status "${ENTREGUE_STATUS}" não encontrado.`);
        return false;
    }

    const loadingMessage = normalizedProjectIds.length > 1
        ? `Finalizando ${normalizedProjectIds.length} projeto(s)...`
        : 'Finalizando entrega...';
    setOrderProjectEntregaActionLoading(true, loadingMessage);

    try {
        const orderId = orderIds[0];
        let existingActualDeliveryDate = null;
        const { data: orderRow } = await supabaseClient
            .from('salesOrders')
            .select('actualDeliveryDate')
            .eq('id', orderId)
            .maybeSingle();

        if (orderRow?.actualDeliveryDate) {
            existingActualDeliveryDate = orderRow.actualDeliveryDate;
        }

        const now = new Date().toISOString();
        const { error: projectError } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId: targetStatusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .in('id', normalizedProjectIds);

        if (projectError) {
            alertAppDialog('Erro ao alterar status: ' + projectError.message);
            return false;
        }

        let savedActualDeliveryDate = providedDate;
        if (typeof persistSalesOrderActualDeliveryDate === 'function') {
            savedActualDeliveryDate = await persistSalesOrderActualDeliveryDate(
                orderId,
                providedDate,
                { existingDate: existingActualDeliveryDate }
            );
        }

        if (typeof notifyOrderDeliveredEmail === 'function') {
            await notifyOrderDeliveredEmail({
                orderId,
                orderProjectId: normalizedProjectIds[0],
                orderProjectIds: normalizedProjectIds,
                actualDeliveryDate: savedActualDeliveryDate
            });
        }

        if (typeof processManagerDeliveryBonusAfterEntrega === 'function') {
            try {
                await processManagerDeliveryBonusAfterEntrega(orderId, normalizedProjectIds);
            } catch (bonusError) {
                console.warn('processManagerDeliveryBonusAfterEntrega:', bonusError);
            }
        }

        await refreshOrderProjectEntregaViews();

        if (typeof onSuccess === 'function') {
            await onSuccess();
        }

        return true;
    } catch (error) {
        alertAppDialog(error.message || 'Erro ao finalizar entrega.');
        return false;
    } finally {
        setOrderProjectEntregaActionLoading(false);
    }
}

function bindOrderProjectEntregaEvents() {
    document.getElementById('order-project-entrega-cancel')
        ?.addEventListener('click', closeOrderProjectEntregaModal);
    document.getElementById('order-project-entrega-submit')
        ?.addEventListener('click', submitOrderProjectEntregaModal);
}

window.openOrderProjectEntregaModal = openOrderProjectEntregaModal;
window.openOrderProjectEntregaBatchModal = openOrderProjectEntregaBatchModal;
window.finalizeEntregaTecnicaForProject = finalizeEntregaTecnicaForProject;
window.finalizeEntregaTecnicaForProjects = finalizeEntregaTecnicaForProjects;
window.canActFinalizarEntregaTecnica = canActFinalizarEntregaTecnica;
