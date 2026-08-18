const MONTAGEM_EM_PRODUCAO_STATUS = 'Em Produção';
const MONTAGEM_INTERNA_STATUS = 'Montagem Interna';
const MONTAGEM_EXPEDICAO_STATUS = 'Expedição';
const MONTAGEM_EXTERNA_STATUS = 'Montagem Externa';

async function getOrderProjectStatusIdByName(statusName) {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', statusName)
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', statusName)
        .maybeSingle();

    return fallback?.id || null;
}

async function getEmProducaoProjectStatusId() {
    return getOrderProjectStatusIdByName(MONTAGEM_EM_PRODUCAO_STATUS);
}

async function getMontagemInternaProjectStatusId() {
    return getOrderProjectStatusIdByName(MONTAGEM_INTERNA_STATUS);
}

async function getExpedicaoProjectStatusId() {
    return getOrderProjectStatusIdByName(MONTAGEM_EXPEDICAO_STATUS);
}

async function getMontagemExternaProjectStatusId() {
    return getOrderProjectStatusIdByName(MONTAGEM_EXTERNA_STATUS);
}

function canActIniciarMontagemExterna() {
    return isAdmin() || isGestorProjetos();
}

async function persistMontagemInicioProject(entry, montagemInternaStatusId) {
    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            cabinetMakerId: entry.cabinetMakerId,
            internalAssemblyStartDate: entry.internalAssemblyStartDate,
            statusId: montagemInternaStatusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', entry.projectId);

    if (error) {
        throw new Error(`"${entry.label}": ${error.message}`);
    }
}

async function persistMontagemFimProject(entry, expedicaoStatusId) {
    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            internalAssemblyEndDate: entry.internalAssemblyEndDate,
            statusId: expedicaoStatusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', entry.projectId);

    if (error) {
        throw new Error(`"${entry.label}": ${error.message}`);
    }
}

let orderProjectMontagemPending = null;

function isEmProducaoOrderProjectStatus(statusName) {
    return statusName === MONTAGEM_EM_PRODUCAO_STATUS || statusName === 'Em produção';
}

function canShowOrderProjectIniciarMontagemIntAction(project) {
    if (!project || !canActOnOrderProject(project)) return false;
    if (typeof canActOrderDetailTab !== 'function' || !canActOrderDetailTab('fabrica')) return false;
    return isEmProducaoOrderProjectStatus(getOrderProjectStatusName(project));
}

function canShowOrderProjectFinalizarMontagemIntAction(project) {
    if (!project || !canActOnOrderProject(project)) return false;
    if (typeof canActOrderDetailTab !== 'function' || !canActOrderDetailTab('fabrica')) return false;
    return getOrderProjectStatusName(project) === MONTAGEM_INTERNA_STATUS;
}

function canShowOrderProjectIniciarMontagemExtAction(project) {
    if (!project || !canActOnOrderProject(project)) return false;
    if (!canActIniciarMontagemExterna()) return false;
    return getOrderProjectStatusName(project) === MONTAGEM_EXPEDICAO_STATUS;
}

function canShowOrderProjectFinalizarMontagemExtAction(project) {
    if (!project || !canActOnOrderProject(project)) return false;
    if (!canActIniciarMontagemExterna()) return false;
    return getOrderProjectStatusName(project) === MONTAGEM_EXTERNA_STATUS;
}

function isOrderProjectsPanelVisibleForMontagem() {
    const content = document.getElementById('order-content');
    return Boolean(content && !content.classList.contains('hidden'));
}

function isPendenciasViewVisibleForMontagem() {
    const view = document.getElementById('pendencias-view');
    return Boolean(view && !view.classList.contains('hidden'));
}

function setOrderProjectMontagemActionLoading(active, message = 'Processando...', status = 'loading') {
    if (isPendenciasViewVisibleForMontagem() && typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(active, message, status);
        return;
    }

    if (isOrderProjectsPanelVisibleForMontagem()) {
        setOrderProjectsPanelActionLoading(active, message, status);
    }
}

async function waitOrderProjectMontagemActionStatus(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

function closeOrderProjectMontagemInicioModal() {
    orderProjectMontagemPending = null;
    toggleModal('order-project-montagem-inicio-modal', false);
}

function closeOrderProjectMontagemFimModal() {
    orderProjectMontagemPending = null;
    toggleModal('order-project-montagem-fim-modal', false);
}

async function openOrderProjectMontagemInicioModal(projectId, projectName = '') {
    if (!canActOrderDetailTab('fabrica')) {
        alertAppDialog('Somente o Gestor de Fábrica ou Admin pode registrar montagem.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    resetMarceneirosCache();
    await loadMarceneiros(true);

    const select = document.getElementById('order-project-montagem-inicio-marceneiro');
    const dateInput = document.getElementById('order-project-montagem-inicio-data');
    const contextEl = document.getElementById('order-project-montagem-inicio-context');

    if (select) {
        select.innerHTML = getMarceneiroOptionsHtml();
    }
    if (dateInput) {
        dateInput.value = getTodayInputDate();
        dateInput.max = getTodayInputDate();
    }
    if (contextEl) {
        const label = projectName?.trim() || 'este projeto';
        contextEl.textContent = `Projeto: ${label}`;
    }

    orderProjectMontagemPending = {
        mode: 'inicio',
        projectId: Number(projectId),
        projectName: projectName?.trim() || ''
    };

    toggleModal('order-project-montagem-inicio-modal', true);
}

async function openOrderProjectMontagemFimModal(projectId, projectName = '') {
    if (!canActOrderDetailTab('fabrica')) {
        alertAppDialog('Somente o Gestor de Fábrica ou Admin pode registrar montagem.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const dateInput = document.getElementById('order-project-montagem-fim-data');
    const contextEl = document.getElementById('order-project-montagem-fim-context');

    if (dateInput) {
        dateInput.value = getTodayInputDate();
        dateInput.max = getTodayInputDate();
    }
    if (contextEl) {
        const label = projectName?.trim() || 'este projeto';
        contextEl.textContent = `Projeto: ${label}`;
    }

    orderProjectMontagemPending = {
        mode: 'fim',
        projectId: Number(projectId),
        projectName: projectName?.trim() || ''
    };

    toggleModal('order-project-montagem-fim-modal', true);
}

async function refreshOrderProjectMontagemViews() {
    if (activeOrderId && typeof loadOrderProjects === 'function') {
        await loadOrderProjects(activeOrderId);
    }
    if (typeof refreshOrdersListSummary === 'function') {
        await refreshOrdersListSummary();
    }
}

async function iniciarMontagemExternaForProject(projectId, options = {}) {
    const { onSuccess } = options;

    if (!canActIniciarMontagemExterna()) {
        alertAppDialog('Somente o Gestor de Projetos ou Admin pode iniciar montagem externa.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return false;
    }

    if (!projectId) return false;

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
    if (currentStatusName !== MONTAGEM_EXPEDICAO_STATUS) {
        alertAppDialog('O status do projeto foi alterado. Atualize a lista.');
        if (typeof onSuccess === 'function') {
            await onSuccess();
        }
        return false;
    }

    const projectLabel = project.name || 'este projeto';
    const confirmMessage = `Iniciar montagem externa de "${projectLabel}"?`;

    if (!(await confirmAppDialog(confirmMessage))) return false;

    const targetStatusId = await getMontagemExternaProjectStatusId();
    if (!targetStatusId) {
        alertAppDialog(`Status "${MONTAGEM_EXTERNA_STATUS}" não encontrado.`);
        return false;
    }

    const loadingMessage = 'Iniciando montagem externa...';
    if (isPendenciasViewVisibleForMontagem()) {
        setPendenciasActionLoading(true, loadingMessage);
    } else if (isOrderProjectsPanelVisibleForMontagem()) {
        setOrderProjectsPanelActionLoading(true, loadingMessage);
    }

    try {
        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId: targetStatusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .eq('id', projectId);

        if (error) {
            alertAppDialog('Erro ao alterar status: ' + error.message);
            return false;
        }

        if (typeof notifyOrderProjectStatusChangeForProjects === 'function') {
            await notifyOrderProjectStatusChangeForProjects(
                [projectId],
                MONTAGEM_EXTERNA_STATUS,
                { orderId: project.orderId }
            );
        }

        await refreshOrderProjectMontagemViews();

        if (typeof onSuccess === 'function') {
            await onSuccess();
        }

        return true;
    } finally {
        if (isPendenciasViewVisibleForMontagem()) {
            setPendenciasActionLoading(false);
        } else         if (isOrderProjectsPanelVisibleForMontagem()) {
            setOrderProjectsPanelActionLoading(false);
        }
    }
}

async function finalizeMontagemExternaForProject(projectId, options = {}) {
    const { onSuccess } = options;

    if (!canActIniciarMontagemExterna()) {
        alertAppDialog('Somente o Gestor de Projetos ou Admin pode finalizar montagem externa.', {
            variant: 'warning',
            title: 'Aviso'
        });
        return false;
    }

    if (!projectId) return false;

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
    if (currentStatusName !== MONTAGEM_EXTERNA_STATUS) {
        alertAppDialog('O status do projeto foi alterado. Atualize a lista.');
        if (typeof onSuccess === 'function') {
            await onSuccess();
        }
        return false;
    }

    const projectLabel = project.name || 'este projeto';
    const confirmMessage = `Finalizar montagem externa de "${projectLabel}" e enviar para aguardando entrega técnica?`;

    if (!(await confirmAppDialog(confirmMessage))) return false;

    const targetStatusId = typeof getPendenciasStatusIdByName === 'function'
        ? await getPendenciasStatusIdByName('Aguardando Entrega Técnica')
        : await getOrderProjectStatusIdByName('Aguardando Entrega Técnica');

    if (!targetStatusId) {
        alertAppDialog('Status "Aguardando Entrega Técnica" não encontrado.');
        return false;
    }

    const loadingMessage = 'Finalizando montagem externa...';
    if (isPendenciasViewVisibleForMontagem()) {
        setPendenciasActionLoading(true, loadingMessage);
    } else if (isOrderProjectsPanelVisibleForMontagem()) {
        setOrderProjectsPanelActionLoading(true, loadingMessage);
    }

    try {
        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId: targetStatusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .eq('id', projectId);

        if (error) {
            alertAppDialog('Erro ao alterar status: ' + error.message);
            return false;
        }

        if (typeof notifyMontagemExternaFinalizadaEmail === 'function') {
            await notifyMontagemExternaFinalizadaEmail({
                orderId: project.orderId,
                orderProjectId: projectId
            });
        }

        await refreshOrderProjectMontagemViews();

        if (typeof onSuccess === 'function') {
            await onSuccess();
        }

        return true;
    } finally {
        if (isPendenciasViewVisibleForMontagem()) {
            setPendenciasActionLoading(false);
        } else if (isOrderProjectsPanelVisibleForMontagem()) {
            setOrderProjectsPanelActionLoading(false);
        }
    }
}

async function submitOrderProjectMontagemInicioModal() {
    const pending = orderProjectMontagemPending;
    if (!pending || pending.mode !== 'inicio' || !pending.projectId) return;

    const cabinetMakerId = document.getElementById('order-project-montagem-inicio-marceneiro')?.value;
    const internalAssemblyStartDate = document.getElementById('order-project-montagem-inicio-data')?.value;
    const label = pending.projectName || 'Projeto';

    if (!cabinetMakerId) {
        alertAppDialog('Selecione o marceneiro responsável.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!internalAssemblyStartDate) {
        alertAppDialog('Informe a data de início da montagem interna.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (isInputDateInFuture(internalAssemblyStartDate)) {
        alertAppDialog('A data de início não pode ser no futuro.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    closeOrderProjectMontagemInicioModal();
    setOrderProjectMontagemActionLoading(true, 'Registrando início da montagem...');

    try {
        const montagemInternaStatusId = await getMontagemInternaProjectStatusId();
        if (!montagemInternaStatusId) {
            setOrderProjectMontagemActionLoading(true, `Status "${MONTAGEM_INTERNA_STATUS}" não encontrado.`, 'error');
            await waitOrderProjectMontagemActionStatus(2200);
            return;
        }

        await persistMontagemInicioProject({
            projectId: pending.projectId,
            cabinetMakerId: Number(cabinetMakerId),
            internalAssemblyStartDate,
            label
        }, montagemInternaStatusId);

        setOrderProjectMontagemActionLoading(true, 'Atualizando telas...');
        await refreshOrderProjectMontagemViews();

        setOrderProjectMontagemActionLoading(true, 'Montagem interna iniciada!', 'success');
        await waitOrderProjectMontagemActionStatus(900);
    } catch (error) {
        const sqlHint = error.message?.includes('cabinetMakerId') || error.message?.includes('MontagemInterna')
            ? ' Execute supabase/create-gestao-order-fields.sql e supabase/create-marceneiro.sql no Supabase.'
            : '';
        setOrderProjectMontagemActionLoading(true, `Erro ao salvar: ${error.message}${sqlHint}`, 'error');
        await waitOrderProjectMontagemActionStatus(2200);
    } finally {
        setOrderProjectMontagemActionLoading(false);
    }
}

async function submitOrderProjectMontagemFimModal() {
    const pending = orderProjectMontagemPending;
    if (!pending || pending.mode !== 'fim' || !pending.projectId) return;

    const internalAssemblyEndDate = document.getElementById('order-project-montagem-fim-data')?.value;
    const label = pending.projectName || 'Projeto';

    if (!internalAssemblyEndDate) {
        alertAppDialog('Informe a data de fim da montagem interna.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (isInputDateInFuture(internalAssemblyEndDate)) {
        alertAppDialog('A data de fim não pode ser no futuro.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    closeOrderProjectMontagemFimModal();
    setOrderProjectMontagemActionLoading(true, 'Finalizando montagem interna...');

    try {
        const expedicaoStatusId = await getExpedicaoProjectStatusId();
        if (!expedicaoStatusId) {
            setOrderProjectMontagemActionLoading(true, `Status "${MONTAGEM_EXPEDICAO_STATUS}" não encontrado.`, 'error');
            await waitOrderProjectMontagemActionStatus(2200);
            return;
        }

        await persistMontagemFimProject({
            projectId: pending.projectId,
            internalAssemblyEndDate,
            label
        }, expedicaoStatusId);

        setOrderProjectMontagemActionLoading(true, 'Atualizando telas...');
        await refreshOrderProjectMontagemViews();

        setOrderProjectMontagemActionLoading(true, 'Montagem interna finalizada!', 'success');
        await waitOrderProjectMontagemActionStatus(900);
    } catch (error) {
        const sqlHint = error.message?.includes('internalAssemblyEndDate')
            ? ' Execute supabase/create-gestao-order-fields.sql no Supabase.'
            : '';
        setOrderProjectMontagemActionLoading(true, `Erro ao salvar: ${error.message}${sqlHint}`, 'error');
        await waitOrderProjectMontagemActionStatus(2200);
    } finally {
        setOrderProjectMontagemActionLoading(false);
    }
}

function bindOrderProjectMontagemEvents() {
    document.getElementById('order-project-montagem-inicio-cancel')
        ?.addEventListener('click', closeOrderProjectMontagemInicioModal);
    document.getElementById('order-project-montagem-inicio-submit')
        ?.addEventListener('click', submitOrderProjectMontagemInicioModal);

    document.getElementById('order-project-montagem-fim-cancel')
        ?.addEventListener('click', closeOrderProjectMontagemFimModal);
    document.getElementById('order-project-montagem-fim-submit')
        ?.addEventListener('click', submitOrderProjectMontagemFimModal);
}

window.openOrderProjectMontagemInicioModal = openOrderProjectMontagemInicioModal;
window.openOrderProjectMontagemFimModal = openOrderProjectMontagemFimModal;
window.iniciarMontagemExternaForProject = iniciarMontagemExternaForProject;
window.finalizeMontagemExternaForProject = finalizeMontagemExternaForProject;
window.persistFabricaInicioProject = persistMontagemInicioProject;
window.persistFabricaFimProject = persistMontagemFimProject;
