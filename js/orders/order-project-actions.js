function enrichApprovalForOrderProject(approval, orderId, project = null) {
    if (!approval) return null;
    const order = typeof ordersCache !== 'undefined'
        ? ordersCache.find(item => Number(item.id) === Number(orderId))
        : null;
    return {
        ...approval,
        orderId: approval.orderId || orderId,
        orderConsultantName: getOrderConsultantNameFromRecord(order) || approval.orderConsultantName || null,
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

function canShowOrderProjectVerRevisoesByStatus(statusName) {
    const normalized = String(statusName || '').trim();
    return isOrderProjectEmRevisaoComercialConsStatus(normalized)
        || isOrderProjectEmRevisaoComercialProjStatus(normalized)
        || normalized === 'Aguardando Aprovação'
        || (typeof isOrderProjectEmRevisaoTecnicaRevisorStatus === 'function'
            && isOrderProjectEmRevisaoTecnicaRevisorStatus(normalized))
        || (typeof isOrderProjectEmRevisaoTecnicaProjStatus === 'function'
            && isOrderProjectEmRevisaoTecnicaProjStatus(normalized));
}

function canShowOrderProjectRevisionsReadOnly(project, revisions = []) {
    if (!currentUser?.id || !project?.id) return false;
    return Array.isArray(revisions) && revisions.length > 0;
}

function buildOrderProjectRevisionsFallbackApproval(project, orderId = null) {
    const orderProjectId = Number(project.id);
    return {
        id: orderProjectId,
        orderProjectId,
        orderId: project.orderId || orderId || null,
        designerId: project.designerId || null,
        projectStatus: project.projectStatus || null,
        orderProject: {
            id: orderProjectId,
            name: project.name || '',
            projectCode: project.projectCode || null
        }
    };
}

function canShowOrderProjectRevisoesAction(project, approval) {
    const statusName = getOrderProjectStatusName(project);

    if (typeof isOrderProjectEmRevisaoTecnicaRevisorStatus === 'function'
        && isOrderProjectEmRevisaoTecnicaRevisorStatus(statusName)) {
        return isAdmin()
            || isGestorProjetos()
            || (typeof canReviewerActOnProject === 'function' && canReviewerActOnProject(project));
    }

    if (typeof isOrderProjectEmRevisaoTecnicaProjStatus === 'function'
        && isOrderProjectEmRevisaoTecnicaProjStatus(statusName)) {
        return isAdmin()
            || isGestorProjetos()
            || (typeof canDesignerActOnTechnicalReviewerProject === 'function'
                && canDesignerActOnTechnicalReviewerProject(project))
            || (typeof canReviewerActOnProject === 'function' && canReviewerActOnProject(project));
    }

    return canShowOrderProjectVerRevisoesAction(approval);
}

function canShowOrderProjectVerRevisoesAction(approval) {
    if (!approval) return false;
    if (typeof canViewCommercialRevision !== 'function' || !canViewCommercialRevision(approval)) {
        return false;
    }
    return isOrderConsultorViewerForApproval(approval) || isAssignedProjetistaForApproval(approval);
}

async function fetchOrderProjectCommercialRevisionsContext(project, orderId) {
    if (!project?.id) return null;

    let revisions = [];
    if (typeof fetchCommercialRevisionsByApprovalIds === 'function') {
        const revisionsByProject = await fetchCommercialRevisionsByApprovalIds([project.id]);
        revisions = revisionsByProject[project.id] || [];
    }

    if (!revisions.length) return null;

    let approval = null;
    if (typeof fetchCommercialApprovalsByProjectIds === 'function') {
        const approvalsByProject = await fetchCommercialApprovalsByProjectIds([project.id]);
        approval = approvalsByProject[project.id] || null;
    }

    if (!approval && typeof buildProjectWorkflowContext === 'function') {
        approval = buildProjectWorkflowContext(project);
    }

    if (!approval) {
        approval = buildOrderProjectRevisionsFallbackApproval(project, orderId);
    }

    const approvalCtx = enrichApprovalForOrderProject(approval, orderId, project);

    return {
        approvalId: approvalCtx.id,
        approval: approvalCtx,
        revisions
    };
}

async function fetchOrderProjectVerRevisoesActionContext(project, orderId) {
    const context = await fetchOrderProjectCommercialRevisionsContext(project, orderId);
    if (!context) return null;

    if (canShowOrderProjectRevisionsReadOnly(project, context.revisions)) {
        return context;
    }

    if (!canShowOrderProjectRevisoesAction(project, context.approval)) {
        return null;
    }

    return context;
}

async function fetchOrderProjectRevisionsHistoryContext(project, orderId) {
    const context = await fetchOrderProjectCommercialRevisionsContext(project, orderId);
    if (!context || !canShowOrderProjectRevisionsReadOnly(project, context.revisions)) {
        return null;
    }
    return context;
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
            measurementId: medicao.id
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

    if (isOrderProjectEmRevisaoComercialConsStatus(statusName) && approvalCtx) {
        const canApprove = typeof canApproveCommercialApproval === 'function'
            && canApproveCommercialApproval(approvalCtx);
        const canRevision = typeof canRequestNewRevision === 'function'
            && canRequestNewRevision(approvalCtx, statusName);
        const canCommercialRev = typeof canAccessCommercialRevision === 'function'
            && canAccessCommercialRevision(approvalCtx);

        actions.push({
            id: 'approve',
            label: 'Aprovar',
            enabled: canApprove,
            approvalId: approvalCtx.id
        });
        actions.push({
            id: 'revision',
            label: 'Solicitar Revisão Técnica',
            enabled: canRevision,
            approvalId: approvalCtx.id
        });
        if (canCommercialRev) {
            actions.push({
                id: 'commercial-revision',
                label: 'Revisão Comercial',
                enabled: true,
                approvalId: approvalCtx.id
            });
        }
    } else if (statusName === 'Aguardando Aprovação' && approvalCtx) {
        const canApprove = typeof canApproveCommercialApproval === 'function'
            && canApproveCommercialApproval(approvalCtx);
        const canCommercialRev = typeof canAccessCommercialRevision === 'function'
            && canAccessCommercialRevision(approvalCtx);

        actions.push({
            id: 'approve',
            label: 'Aprovar',
            enabled: canApprove,
            approvalId: approvalCtx.id
        });
        if (canCommercialRev) {
            actions.push({
                id: 'commercial-revision',
                label: 'Revisão Comercial',
                enabled: true,
                approvalId: approvalCtx.id
            });
        }
    }

    if (revisions.length
        && canShowOrderProjectRevisionsReadOnly(project, revisions)
        && typeof isOrderProjectStatusInOrderRevisionsListRange === 'function'
        && isOrderProjectStatusInOrderRevisionsListRange(project)) {
        actions.push({
            id: 'view-revisions',
            label: 'Revisões',
            enabled: true,
            approvalId: approvalCtx?.id || project.id,
            readOnly: true
        });
    }

    if (statusName === 'Projeto Técnico' || isOrderProjectEmRevisaoComercialProjStatus(statusName)) {
        const canSubmit = typeof canSubmitCommercialApprovalFromPendencias === 'function'
            && canSubmitCommercialApprovalFromPendencias(project, approval);
        actions.push({
            id: 'send-approval',
            label: 'Enviar para Aprovação',
            enabled: canSubmit,
            projectId: project.id
        });
    }

    if (statusName === 'Aguardando Projeto Técnico' && project.designerId) {
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

    if (typeof isOrderProjectEmRevisaoTecnicaRevisorStatus === 'function'
        && isOrderProjectEmRevisaoTecnicaRevisorStatus(statusName)
        && typeof canReviewerActOnProject === 'function'
        && canReviewerActOnProject(project)) {
        actions.push({
            id: 'tr-approve-nomear',
            label: 'Aprovar',
            enabled: true,
            projectId: project.id
        });
        actions.push({
            id: 'tr-revision',
            label: 'Revisão Técnica',
            enabled: true,
            projectId: project.id
        });
    }

    if (typeof isOrderProjectEmRevisaoTecnicaProjStatus === 'function'
        && isOrderProjectEmRevisaoTecnicaProjStatus(statusName)
        && typeof canDesignerActOnTechnicalReviewerProject === 'function'
        && canDesignerActOnTechnicalReviewerProject(project)) {
        actions.push({
            id: 'tr-revision',
            label: 'Executar Revisão',
            enabled: true,
            projectId: project.id
        });
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
        const enabled = typeof canActOrderPpcp === 'function'
            && canActOrderPpcp()
            && canActOnOrderProject(project);
        actions.push({
            id: 'implantacao',
            label: 'Implantação',
            enabled,
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

    if (typeof canShowOrderProjectIniciarMontagemExtAction === 'function'
        && canShowOrderProjectIniciarMontagemExtAction(project)) {
        actions.push({
            id: 'iniciar-montagem-ext',
            label: 'Iniciar Montagem Externa',
            enabled: true,
            projectId: project.id,
            projectName: project.name || ''
        });
    }

    if (typeof canShowOrderProjectFinalizarMontagemExtAction === 'function'
        && canShowOrderProjectFinalizarMontagemExtAction(project)) {
        actions.push({
            id: 'finalizar-montagem-ext',
            label: 'Finalizar',
            enabled: true,
            projectId: project.id,
            projectName: project.name || ''
        });
    }

    if (typeof canShowOrderProjectFinalizarEntregaTecnicaAction === 'function'
        && canShowOrderProjectFinalizarEntregaTecnicaAction(project)) {
        actions.push({
            id: 'finalizar-entrega-tecnica',
            label: 'Finalizar',
            enabled: true,
            projectId: project.id,
            projectName: project.name || ''
        });
    }

    return actions;
}

function renderOrderProjectActionButtons(actions) {
    const enabledActions = (actions || []).filter(action => action.enabled);
    if (!enabledActions.length) {
        return '<span class="text-xs text-slate-300">—</span>';
    }

    return `<div class="flex flex-wrap justify-end gap-1">${enabledActions.map(action => {
        const attrs = [`data-action="${escapeHtml(action.id)}"`];
        if (action.approvalId) attrs.push(`data-approval-id="${action.approvalId}"`);
        if (action.projectId) attrs.push(`data-project-id="${action.projectId}"`);
        if (action.measurementId) attrs.push(`data-medicao-id="${action.measurementId}"`);
        if (action.conferenceId) attrs.push(`data-conference-id="${action.conferenceId}"`);
        if (action.projectName) attrs.push(`data-project-name="${escapeHtml(action.projectName)}"`);
        if (action.deliveryDate) attrs.push(`data-delivery-date="${escapeHtml(String(action.deliveryDate).slice(0, 10))}"`);
        if (action.readOnly) attrs.push('data-read-only="1"');

        return `<button type="button"
            class="order-project-action-btn text-[10px] px-2 py-0.5 rounded-md font-medium whitespace-nowrap bg-violet-700 text-white hover:bg-violet-800"
            ${attrs.join(' ')}>
            ${escapeHtml(action.label)}
        </button>`;
    }).join('')}</div>`;
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
                await openCommercialRevisionModal(approvalId, 'tecnica', { forceNew: true });
            }
            break;
        case 'commercial-revision':
            if (typeof openCommercialRevisionModal === 'function' && approvalId) {
                await openCommercialRevisionModal(approvalId, 'comercial');
            }
            break;
        case 'view-revision':
            if (typeof openCommercialRevisionView === 'function' && approvalId) {
                await openCommercialRevisionView(approvalId);
            }
            break;
        case 'view-revisions': {
            if (typeof openCommercialRevisionsHistoryView !== 'function' || !approvalId) break;
            const readOnly = button.dataset.readOnly === '1';
            await openCommercialRevisionsHistoryView(approvalId, null, { readOnly });
            break;
        }
        case 'send-approval':
            if (typeof submitCommercialApprovalFromPendencias === 'function' && projectId) {
                await submitCommercialApprovalFromPendencias(projectId);
                await refreshOrderProjectListAfterAction();
            }
            break;
        case 'iniciar-pt':
            if (typeof iniciarProjetoTecnico === 'function' && projectId) {
                await iniciarProjetoTecnico(projectId);
            }
            break;
        case 'tr-approve-nomear':
            if (typeof approveTechnicalReviewerProjectToNomear === 'function' && projectId) {
                await approveTechnicalReviewerProjectToNomear(projectId);
                await refreshOrderProjectListAfterAction();
            }
            break;
        case 'tr-revision':
            if (typeof openTechnicalReviewerRevisionModal === 'function' && projectId) {
                await openTechnicalReviewerRevisionModal(projectId);
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
        case 'iniciar-montagem-ext':
            if (typeof iniciarMontagemExternaForProject === 'function' && projectId) {
                await iniciarMontagemExternaForProject(projectId, {
                    onSuccess: () => refreshOrderProjectListAfterAction()
                });
            }
            break;
        case 'finalizar-montagem-ext':
            if (typeof finalizeMontagemExternaForProject === 'function' && projectId) {
                await finalizeMontagemExternaForProject(projectId, {
                    onSuccess: () => refreshOrderProjectListAfterAction()
                });
            }
            break;
        case 'finalizar-entrega-tecnica':
            if (typeof openOrderProjectEntregaModal === 'function' && projectId) {
                await openOrderProjectEntregaModal(projectId, projectName, {
                    onSuccess: () => refreshOrderProjectListAfterAction()
                });
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
                const measurementId = Number(button.dataset.medicaoId);
                await openOrderProjectEditarMedicao(measurementId, activeOrderId);
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
