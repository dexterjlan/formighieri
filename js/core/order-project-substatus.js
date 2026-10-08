const ORDER_PROJECT_SUBSTATUS_AWAITING_REQUEST = 'AwaitingRequest';
const ORDER_PROJECT_SUBSTATUS_AWAITING_REQUEST_LABEL = 'Aguardando Requisição';
const ORDER_PROJECT_SUBSTATUS_TECHNICAL_STATUS = 'Projeto Técnico';

function isOrderProjectSubstatusTableMissingError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('orderprojectsubstatus')
        && (message.includes('does not exist')
            || message.includes('schema cache')
            || message.includes('could not find'));
}

function formatOrderProjectSubstatusError(error) {
    if (isOrderProjectSubstatusTableMissingError(error)) {
        return 'Execute supabase/feats/create-order-project-substatus.sql no Supabase SQL Editor.';
    }
    return error?.message || 'Não foi possível atualizar o substatus do projeto.';
}

function isOrderProjectAwaitingRequest(project) {
    return Boolean(project?.awaitingRequestStartedAt);
}

function canManageOrderProjectAwaitingRequest(project) {
    if (!project?.id) return false;
    const statusName = typeof getOrderProjectStatusName === 'function'
        ? getOrderProjectStatusName(project)
        : (project.projectStatus?.name || '');
    if (statusName !== ORDER_PROJECT_SUBSTATUS_TECHNICAL_STATUS) return false;
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    if (typeof isGestorProjetos === 'function' && isGestorProjetos()) return true;
    return currentUser?.role === 'Projetista'
        && Number(project.designerId) === Number(currentUser?.id);
}

function renderOrderProjectAwaitingRequestFlagHtml() {
    return `<span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 shrink-0" title="Substatus em aberto desde o início registrado">Aguardando requisição</span>`;
}

async function fetchOpenAwaitingRequestByProjectIds(projectIds = []) {
    const ids = [...new Set((projectIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return {};

    const { data, error } = await supabaseClient
        .from('OrderProjectSubstatus')
        .select('id, orderProjectId, kind, startedAt')
        .in('orderProjectId', ids)
        .eq('kind', ORDER_PROJECT_SUBSTATUS_AWAITING_REQUEST)
        .is('endedAt', null);

    if (error) {
        if (isOrderProjectSubstatusTableMissingError(error)) {
            console.warn('fetchOpenAwaitingRequestByProjectIds:', formatOrderProjectSubstatusError(error));
            return {};
        }
        throw error;
    }

    return Object.fromEntries((data || []).map(row => [Number(row.orderProjectId), row]));
}

async function attachOpenOrderProjectSubstatuses(projects = []) {
    const list = projects || [];
    if (!list.length) return list;

    const byProjectId = await fetchOpenAwaitingRequestByProjectIds(list.map(project => project.id));
    list.forEach(project => {
        const open = byProjectId[Number(project.id)];
        project.awaitingRequestSubstatusId = open?.id || null;
        project.awaitingRequestStartedAt = open?.startedAt || null;
    });
    return list;
}

async function startOrderProjectAwaitingRequest(projectId) {
    const id = Number(projectId);
    if (!id) throw new Error('Projeto inválido.');

    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('OrderProjectSubstatus')
        .insert({
            orderProjectId: id,
            kind: ORDER_PROJECT_SUBSTATUS_AWAITING_REQUEST,
            startedAt: now,
            startedById: currentUser?.id || null,
            createdAt: now,
            updatedAt: now
        })
        .select('id, orderProjectId, startedAt')
        .single();

    if (error) {
        const message = String(error.message || '').toLowerCase();
        if (message.includes('one_open') || message.includes('duplicate') || message.includes('unique')) {
            throw new Error('Este projeto já está aguardando requisição.');
        }
        throw new Error(formatOrderProjectSubstatusError(error));
    }

    return data;
}

async function endOrderProjectAwaitingRequest(project) {
    const substatusId = Number(project?.awaitingRequestSubstatusId);
    const projectId = Number(project?.id);
    if (!projectId) throw new Error('Projeto inválido.');

    const now = new Date().toISOString();
    let query = supabaseClient
        .from('OrderProjectSubstatus')
        .update({
            endedAt: now,
            endedById: currentUser?.id || null,
            updatedAt: now
        })
        .eq('kind', ORDER_PROJECT_SUBSTATUS_AWAITING_REQUEST)
        .is('endedAt', null);

    query = substatusId
        ? query.eq('id', substatusId)
        : query.eq('orderProjectId', projectId);

    const { data, error } = await query.select('id, endedAt').maybeSingle();
    if (error) throw new Error(formatOrderProjectSubstatusError(error));
    if (!data) throw new Error('Não há substatus em aberto para reiniciar este projeto.');
    return data;
}

async function refreshSurfacesAfterOrderProjectSubstatusChange() {
    const pendenciasView = document.getElementById('pendencias-view');
    const pendenciasVisible = pendenciasView && !pendenciasView.classList.contains('hidden');
    if (pendenciasVisible && typeof loadPendenciasProjetoTecnico === 'function') {
        await loadPendenciasProjetoTecnico();
    }

    const ordersView = document.getElementById('orders-view') || document.getElementById('dashboard-view');
    const ordersVisible = !ordersView || !ordersView.classList.contains('hidden');
    if (ordersVisible && typeof refreshOrderProjectListAfterAction === 'function' && typeof activeOrderId !== 'undefined' && activeOrderId) {
        await refreshOrderProjectListAfterAction();
    }
}

async function promptStartOrderProjectAwaitingRequest(projectId) {
    const confirmed = await confirmAppDialog(
        'Registrar que este projeto está aguardando requisição? O status do projeto não muda.'
    );
    if (!confirmed) return;

    try {
        await startOrderProjectAwaitingRequest(projectId);
        await refreshSurfacesAfterOrderProjectSubstatusChange();
    } catch (error) {
        alertAppDialog(error.message || 'Não foi possível registrar o substatus.');
    }
}

async function promptEndOrderProjectAwaitingRequest(project) {
    const confirmed = await confirmAppDialog(
        'Reiniciar o projeto? A data de fim do substatus Aguardando Requisição será registrada. O status do projeto não muda.'
    );
    if (!confirmed) return;

    try {
        await endOrderProjectAwaitingRequest(project);
        await refreshSurfacesAfterOrderProjectSubstatusChange();
    } catch (error) {
        alertAppDialog(error.message || 'Não foi possível reiniciar o projeto.');
    }
}

window.ORDER_PROJECT_SUBSTATUS_AWAITING_REQUEST = ORDER_PROJECT_SUBSTATUS_AWAITING_REQUEST;
window.isOrderProjectAwaitingRequest = isOrderProjectAwaitingRequest;
window.canManageOrderProjectAwaitingRequest = canManageOrderProjectAwaitingRequest;
window.renderOrderProjectAwaitingRequestFlagHtml = renderOrderProjectAwaitingRequestFlagHtml;
window.attachOpenOrderProjectSubstatuses = attachOpenOrderProjectSubstatuses;
window.promptStartOrderProjectAwaitingRequest = promptStartOrderProjectAwaitingRequest;
window.promptEndOrderProjectAwaitingRequest = promptEndOrderProjectAwaitingRequest;
