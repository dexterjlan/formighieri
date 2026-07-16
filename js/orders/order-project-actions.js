let orderProjectAssociarPending = null;

function enrichApprovalForOrderProject(approval, orderId, project = null) {
    if (!approval) return null;
    const order = typeof ordersCache !== 'undefined'
        ? ordersCache.find(item => Number(item.id) === Number(orderId))
        : null;
    return {
        ...approval,
        orderId: approval.orderId || orderId,
        orderConsultantName: order?.consultantName || approval.orderConsultantName || null,
        designerId: approval.designerId || project?.designerId || null
    };
}

function isOrderConsultorViewerForApproval(approval) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Consultor') return false;
    return typeof isAdminOrOrderConsultorForApproval === 'function'
        && isAdminOrOrderConsultorForApproval(approval);
}

function isAssignedProjetistaForApproval(approval) {
    return currentUser?.role === 'Projetista'
        && approval?.designerId
        && Number(approval.designerId) === Number(currentUser.id);
}

function canShowOrderProjectVerRevisoesAction(approval) {
    if (!approval) return false;
    if (typeof canViewCommercialRevision !== 'function' || !canViewCommercialRevision(approval)) {
        return false;
    }
    return isOrderConsultorViewerForApproval(approval) || isAssignedProjetistaForApproval(approval);
}

function getOrderProjectActions(project, context = {}) {
    const {
        orderId,
        approval = null,
        revisions = [],
        implantacao = null,
        medicao = null,
        conferencia = null
    } = context;
    const statusName = getOrderProjectStatusName(project);
    const actions = [];

    if (!canActOnOrderProject(project)) {
        return actions;
    }

    const approvalCtx = enrichApprovalForOrderProject(approval, orderId, project);

    if (typeof canShowOrderProjectAlterarStatusAction === 'function'
        && canShowOrderProjectAlterarStatusAction(project)) {
        actions.push({
            id: 'alterar-status',
            label: 'Alterar Status',
            enabled: true,
            projectId: project.id
        });
    }

    if (statusName === 'Aguardando Medição'
        && typeof canCreateMedicao === 'function'
        && canCreateMedicao()) {
        actions.push({
            id: 'nova-medicao',
            label: '+ Nova Medição',
            enabled: true,
            projectId: project.id
        });
    }

    if (typeof canShowOrderProjectEditarMedicaoAction === 'function'
        && canShowOrderProjectEditarMedicaoAction(project, medicao)) {
        actions.push({
            id: 'editar-medicao',
            label: 'Editar Medição',
            enabled: true,
            projectId: project.id,
            medicaoId: medicao.id
        });
    }

    if (typeof canShowOrderProjectConferenciaAction === 'function'
        && canShowOrderProjectConferenciaAction(project, conferencia)) {
        actions.push({
            id: 'conferencia',
            label: 'Conferência',
            enabled: true,
            projectId: project.id
        });
    }

    if (typeof canShowOrderProjectVerConferenciaAction === 'function'
        && canShowOrderProjectVerConferenciaAction(project, orderId, conferencia)) {
        actions.push({
            id: 'ver-conferencia',
            label: 'Ver Conferência',
            enabled: true,
            projectId: project.id,
            conferenceId: conferencia.conferenceId
        });
    }

    if (statusName === 'Aguardando Aprovação' && approvalCtx) {
        const canApprove = typeof canApproveCommercialApproval === 'function'
            && canApproveCommercialApproval(approvalCtx);
        const canRevision = typeof canRequestNewRevision === 'function'
            && canRequestNewRevision(approvalCtx);

        actions.push({
            id: 'approve',
            label: 'Aprovar',
            enabled: canApprove,
            approvalId: approvalCtx.id
        });
        actions.push({
            id: 'revision',
            label: 'Solicitar Revisão',
            enabled: canRevision,
            approvalId: approvalCtx.id
        });
    }

    if (approvalCtx) {
        const canViewRevision = typeof canViewCommercialRevision === 'function'
            && canViewCommercialRevision(approvalCtx);
        const hasRevisions = revisions.length > 0;

        if (canViewRevision && hasRevisions && canShowOrderProjectVerRevisoesAction(approvalCtx)) {
            actions.push({
                id: 'view-revisions',
                label: 'Ver Revisões',
                enabled: true,
                approvalId: approvalCtx.id
            });
        }
    }

    if (statusName === 'Projeto Técnico') {
        const canSubmit = typeof canSubmitCommercialApprovalFromPendencias === 'function'
            && canSubmitCommercialApprovalFromPendencias(project, approval);
        actions.push({
            id: 'send-approval',
            label: 'Enviar para Aprovação',
            enabled: canSubmit,
            projectId: project.id
        });
    }

    if (statusName === 'Aguardando Projeto Técnico') {
        if (!project.designerId) {
            const enabled = currentUser?.role === 'Projetista' || isAdmin();
            actions.push({
                id: 'associar',
                label: 'Associar a mim',
                enabled,
                projectId: project.id,
                deliveryDate: project.deliveryDate || ''
            });
        } else {
            const enabled = isAdmin()
                || (currentUser?.role === 'Projetista'
                    && Number(project.designerId) === Number(currentUser.id));
            actions.push({
                id: 'iniciar-pt',
                label: 'Iniciar Projeto',
                enabled,
                projectId: project.id
            });
        }
    }

    if (statusName === 'Nomear') {
        const enabled = typeof canShowOrderProjectNomearAction === 'function'
            && canShowOrderProjectNomearAction(project);
        actions.push({
            id: 'nomear',
            label: 'Nomear Projeto',
            enabled,
            projectId: project.id,
            projectName: project.name || ''
        });
    }

    if (statusName === 'Aguardando PPCP') {
        const enabled = typeof canActOrderPpcp === 'function'
            && canActOrderPpcp()
            && canActOnOrderProject(project);
        actions.push({
            id: 'iniciar-implantacao',
            label: 'Iniciar Implantação',
            enabled,
            projectId: project.id,
            projectName: project.name || ''
        });
    }

    if (typeof canShowOrderProjectImplantacaoAction === 'function'
        && canShowOrderProjectImplantacaoAction(project, implantacao)) {
        actions.push({
            id: 'implantacao',
            label: 'Implantação',
            enabled: true,
            projectId: project.id,
            projectName: project.name || ''
        });
    }

    if (typeof canShowOrderProjectIniciarMontagemIntAction === 'function'
        && canShowOrderProjectIniciarMontagemIntAction(project)) {
        actions.push({
            id: 'iniciar-montagem-int',
            label: 'Iniciar Mont. Int.',
            enabled: true,
            projectId: project.id,
            projectName: project.name || ''
        });
    }

    if (typeof canShowOrderProjectFinalizarMontagemIntAction === 'function'
        && canShowOrderProjectFinalizarMontagemIntAction(project)) {
        actions.push({
            id: 'finalizar-montagem-int',
            label: 'Finalizar Mont. Int.',
            enabled: true,
            projectId: project.id,
            projectName: project.name || ''
        });
    }

    return actions;
}

function renderOrderProjectActionButtons(actions) {
    if (!actions.length) {
        return '<span class="text-xs text-slate-300">—</span>';
    }

    return `<div class="flex flex-wrap justify-end gap-1">${actions.map(action => {
        const disabled = !action.enabled;
        const attrs = [`data-action="${escapeHtml(action.id)}"`];
        if (action.approvalId) attrs.push(`data-approval-id="${action.approvalId}"`);
        if (action.projectId) attrs.push(`data-project-id="${action.projectId}"`);
        if (action.medicaoId) attrs.push(`data-medicao-id="${action.medicaoId}"`);
        if (action.conferenceId) attrs.push(`data-conference-id="${action.conferenceId}"`);
        if (action.projectName) attrs.push(`data-project-name="${escapeHtml(action.projectName)}"`);
        if (action.deliveryDate) attrs.push(`data-delivery-date="${escapeHtml(String(action.deliveryDate).slice(0, 10))}"`);

        return `<button type="button"
            class="order-project-action-btn text-[10px] px-2 py-0.5 rounded-md font-medium whitespace-nowrap ${disabled
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'bg-violet-700 text-white hover:bg-violet-800'}"
            ${attrs.join(' ')}
            ${disabled ? 'disabled' : ''}>
            ${escapeHtml(action.label)}
        </button>`;
    }).join('')}</div>`;
}

function closeOrderProjectAssociarModal() {
    orderProjectAssociarPending = null;
    toggleModal('order-project-associar-modal', false);
    const input = document.getElementById('order-project-associar-previsao');
    if (input) input.value = '';
}

function openOrderProjectAssociarModal(projectId, deliveryDate = '') {
    orderProjectAssociarPending = {
        projectId: Number(projectId),
        deliveryDate: deliveryDate || ''
    };

    const input = document.getElementById('order-project-associar-previsao');
    const maxDate = String(deliveryDate || '').slice(0, 10);

    if (input) {
        input.value = '';
        if (maxDate) {
            input.max = maxDate;
        } else {
            input.removeAttribute('max');
        }
    }

    toggleModal('order-project-associar-modal', true);
}

async function refreshOrderProjectListAfterAction(orderId = activeOrderId) {
    if (orderId && typeof loadOrderProjects === 'function') {
        await loadOrderProjects(orderId);
    }
    if (typeof refreshOrdersListSummary === 'function') {
        await refreshOrdersListSummary();
    }
}

async function handleOrderProjectAction(button) {
    if (!button || button.disabled) return;

    const action = button.dataset.action;
    const projectId = Number(button.dataset.projectId);
    const approvalId = Number(button.dataset.approvalId);
    const projectName = button.dataset.projectName || '';

    switch (action) {
        case 'approve':
            if (typeof approveCommercialApproval === 'function' && approvalId) {
                await approveCommercialApproval(approvalId);
                await refreshOrderProjectListAfterAction();
            }
            break;
        case 'revision':
            if (typeof openCommercialRevisionModal === 'function' && approvalId) {
                await openCommercialRevisionModal(approvalId);
            }
            break;
        case 'view-revision':
            if (typeof openCommercialRevisionView === 'function' && approvalId) {
                await openCommercialRevisionView(approvalId);
            }
            break;
        case 'view-revisions':
            if (typeof openCommercialRevisionsHistoryView === 'function' && approvalId) {
                await openCommercialRevisionsHistoryView(approvalId);
            }
            break;
        case 'send-approval':
            if (typeof submitCommercialApprovalFromPendencias === 'function' && projectId) {
                await submitCommercialApprovalFromPendencias(projectId);
                await refreshOrderProjectListAfterAction();
            }
            break;
        case 'associar':
            openOrderProjectAssociarModal(projectId, button.dataset.deliveryDate || '');
            break;
        case 'iniciar-pt':
            if (typeof iniciarProjetoTecnico === 'function' && projectId) {
                await iniciarProjetoTecnico(projectId);
            }
            break;
        case 'nomear':
            if (typeof markOrderProjectAsNomeado === 'function' && projectId) {
                await markOrderProjectAsNomeado(projectId, {
                    onSuccess: () => refreshOrderProjectListAfterAction()
                });
            }
            break;
        case 'iniciar-implantacao':
            if (typeof implantarPpcpProject === 'function' && projectId) {
                await implantarPpcpProject(projectId, button, projectName);
                await refreshOrderProjectListAfterAction();
            }
            break;
        case 'implantacao':
            if (typeof openPpcpImplantacaoModal === 'function' && projectId) {
                await openPpcpImplantacaoModal(projectId, projectName);
            }
            break;
        case 'iniciar-montagem-int':
            if (typeof openOrderProjectMontagemInicioModal === 'function' && projectId) {
                await openOrderProjectMontagemInicioModal(projectId, projectName);
            }
            break;
        case 'finalizar-montagem-int':
            if (typeof openOrderProjectMontagemFimModal === 'function' && projectId) {
                await openOrderProjectMontagemFimModal(projectId, projectName);
            }
            break;
        case 'alterar-status':
            if (typeof openOrderProjectAlterarStatusModal === 'function' && projectId) {
                openOrderProjectAlterarStatusModal(activeOrderId, projectId);
            }
            break;
        case 'nova-medicao':
            if (typeof openMedicaoModal === 'function' && projectId) {
                await openMedicaoModal(null, { preselectProjectId: projectId });
            }
            break;
        case 'editar-medicao':
            if (typeof openOrderProjectEditarMedicao === 'function') {
                const medicaoId = Number(button.dataset.medicaoId);
                await openOrderProjectEditarMedicao(medicaoId, activeOrderId);
            }
            break;
        case 'conferencia':
            if (typeof openOrderProjectConferenciaModal === 'function' && projectId) {
                await openOrderProjectConferenciaModal(projectId, activeOrderId);
            }
            break;
        case 'ver-conferencia':
            if (typeof openAnteprojetoConferenceFromPendencias === 'function') {
                const conferenceId = Number(button.dataset.conferenceId);
                if (conferenceId) {
                    await openAnteprojetoConferenceFromPendencias(conferenceId);
                }
            }
            break;
        default:
            break;
    }
}

function bindOrderProjectAssociarModalEvents() {
    document.getElementById('order-project-associar-modal-cancel')
        ?.addEventListener('click', closeOrderProjectAssociarModal);

    document.getElementById('order-project-associar-modal-submit')
        ?.addEventListener('click', async () => {
            if (!orderProjectAssociarPending?.projectId) return;

            const previsaoDate = document.getElementById('order-project-associar-previsao')?.value || '';
            const { projectId, deliveryDate } = orderProjectAssociarPending;

            if (typeof associarProjetoTecnicoAMim === 'function') {
                const ok = await associarProjetoTecnicoAMim(projectId, previsaoDate, deliveryDate);
                if (ok) {
                    closeOrderProjectAssociarModal();
                    await refreshOrderProjectListAfterAction();
                }
            }
        });
}

bindOrderProjectAssociarModalEvents();
