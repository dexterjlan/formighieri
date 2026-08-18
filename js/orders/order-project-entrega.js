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
    toggleModal('order-project-entrega-modal', false);
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
    if (contextEl) {
        const label = projectName?.trim() || 'este projeto';
        contextEl.textContent = `Projeto: ${label}`;
    }

    orderProjectEntregaPending = {
        projectId: Number(projectId),
        projectName: projectName?.trim() || '',
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
    if (!pending?.projectId) return;

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

    await finalizeEntregaTecnicaForProject(pending.projectId, {
        actualDeliveryDate,
        onSuccess
    });
}

async function finalizeEntregaTecnicaForProject(projectId, options = {}) {
    const { actualDeliveryDate: providedDate, onSuccess } = options;

    if (!canActFinalizarEntregaTecnica()) {
        alertAppDialog('Somente o Gestor Comercial ou Admin pode finalizar a entrega.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return false;
    }

    if (!projectId) return false;

    if (!providedDate) {
        await openOrderProjectEntregaModal(projectId, options.projectName || '', { onSuccess });
        return false;
    }

    const { data: rawProject, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, orderId, name, statusId, projectStatus:OrderProjectStatus(id, name)')
        .eq('id', projectId)
        .maybeSingle();

    let project = rawProject;

    if (readError?.message?.includes('projectStatus')) {
        const fallback = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, name, statusId')
            .eq('id', projectId)
            .maybeSingle();

        if (fallback.error || !fallback.data) {
            alertAppDialog('Projeto não encontrado.');
            return false;
        }

        const statusResult = await supabaseClient
            .from('OrderProjectStatus')
            .select('id, name')
            .eq('id', fallback.data.statusId)
            .maybeSingle();

        project = {
            ...fallback.data,
            projectStatus: statusResult.data || null
        };
    } else if (readError || !project) {
        alertAppDialog('Projeto não encontrado.');
        return false;
    }

    const currentStatusName = getOrderProjectStatusName(project);
    if (currentStatusName !== ENTREGA_TECNICA_STATUS) {
        alertAppDialog('O status do projeto foi alterado. Atualize a lista.');
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

    setOrderProjectEntregaActionLoading(true, 'Finalizando entrega...');

    try {
        let existingActualDeliveryDate = null;
        const { data: orderRow } = await supabaseClient
            .from('salesOrders')
            .select('actualDeliveryDate')
            .eq('id', project.orderId)
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
            .eq('id', projectId);

        if (projectError) {
            alertAppDialog('Erro ao alterar status: ' + projectError.message);
            return false;
        }

        let savedActualDeliveryDate = providedDate;
        if (typeof persistSalesOrderActualDeliveryDate === 'function') {
            savedActualDeliveryDate = await persistSalesOrderActualDeliveryDate(
                project.orderId,
                providedDate,
                { existingDate: existingActualDeliveryDate }
            );
        }

        if (typeof notifyOrderDeliveredEmail === 'function') {
            await notifyOrderDeliveredEmail({
                orderId: project.orderId,
                orderProjectId: projectId,
                actualDeliveryDate: savedActualDeliveryDate
            });
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
window.finalizeEntregaTecnicaForProject = finalizeEntregaTecnicaForProject;
window.canActFinalizarEntregaTecnica = canActFinalizarEntregaTecnica;
