const MONTAGEM_EM_PRODUCAO_STATUS = 'Em Produção';
const MONTAGEM_INTERNA_STATUS = 'Montagem Interna';
const MONTAGEM_EXPEDICAO_STATUS = 'Expedição';

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

async function persistMontagemInicioProject(entry, montagemInternaStatusId) {
    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            marceneiroId: entry.marceneiroId,
            inicioMontagemInterna: entry.inicioMontagemInterna,
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
            fimMontagemInterna: entry.fimMontagemInterna,
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

async function submitOrderProjectMontagemInicioModal() {
    const pending = orderProjectMontagemPending;
    if (!pending || pending.mode !== 'inicio' || !pending.projectId) return;

    const marceneiroId = document.getElementById('order-project-montagem-inicio-marceneiro')?.value;
    const inicioMontagemInterna = document.getElementById('order-project-montagem-inicio-data')?.value;
    const label = pending.projectName || 'Projeto';

    if (!marceneiroId) {
        alertAppDialog('Selecione o marceneiro responsável.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (!inicioMontagemInterna) {
        alertAppDialog('Informe a data de início da montagem interna.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (isInputDateInFuture(inicioMontagemInterna)) {
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
            marceneiroId: Number(marceneiroId),
            inicioMontagemInterna,
            label
        }, montagemInternaStatusId);

        setOrderProjectMontagemActionLoading(true, 'Atualizando telas...');
        await refreshOrderProjectMontagemViews();

        setOrderProjectMontagemActionLoading(true, 'Montagem interna iniciada!', 'success');
        await waitOrderProjectMontagemActionStatus(900);
    } catch (error) {
        const sqlHint = error.message?.includes('marceneiroId') || error.message?.includes('MontagemInterna')
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

    const fimMontagemInterna = document.getElementById('order-project-montagem-fim-data')?.value;
    const label = pending.projectName || 'Projeto';

    if (!fimMontagemInterna) {
        alertAppDialog('Informe a data de fim da montagem interna.', { variant: 'warning', title: 'Aviso' });
        return;
    }
    if (isInputDateInFuture(fimMontagemInterna)) {
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
            fimMontagemInterna,
            label
        }, expedicaoStatusId);

        setOrderProjectMontagemActionLoading(true, 'Atualizando telas...');
        await refreshOrderProjectMontagemViews();

        setOrderProjectMontagemActionLoading(true, 'Montagem interna finalizada!', 'success');
        await waitOrderProjectMontagemActionStatus(900);
    } catch (error) {
        const sqlHint = error.message?.includes('fimMontagemInterna')
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
window.persistFabricaInicioProject = persistMontagemInicioProject;
window.persistFabricaFimProject = persistMontagemFimProject;
