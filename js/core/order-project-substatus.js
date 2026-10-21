const ORDER_PROJECT_SUBSTATUS_AWAITING_REQUEST = 'AwaitingRequest';
const ORDER_PROJECT_SUBSTATUS_AWAITING_REQUEST_LABEL = 'Aguardando Requisição';
const ORDER_PROJECT_SUBSTATUS_TECHNICAL_STATUS = 'Projeto Técnico';
const ORDER_PROJECT_SUBSTATUS_INTERNAL_ASSEMBLY_AWAITING = 'InternalAssemblyAwaiting';
const ORDER_PROJECT_SUBSTATUS_INTERNAL_ASSEMBLY_AWAITING_LABEL = 'Aguardando';
const ORDER_PROJECT_SUBSTATUS_MONTAGEM_INTERNA_STATUS = 'Montagem Interna';

const ORDER_PROJECT_INTERNAL_ASSEMBLY_SUBSTATUS_DEFINITIONS = [
    { kind: 'InternalAssemblyPainting', label: 'Pintura' },
    { kind: 'InternalAssemblyMetalwork', label: 'Serralheria' },
    { kind: 'InternalAssemblyUpholstery', label: 'Estofado' },
    { kind: 'InternalAssemblyGlass', label: 'Vidros' },
    { kind: 'InternalAssemblyAwaitingHardware', label: 'Aguardando Ferragens' }
];

const ORDER_PROJECT_INTERNAL_ASSEMBLY_SUBSTATUS_LEGACY = [
    { kind: ORDER_PROJECT_SUBSTATUS_INTERNAL_ASSEMBLY_AWAITING, label: ORDER_PROJECT_SUBSTATUS_INTERNAL_ASSEMBLY_AWAITING_LABEL }
];

function getOrderProjectInternalAssemblySubstatusKindList() {
    return [
        ...ORDER_PROJECT_INTERNAL_ASSEMBLY_SUBSTATUS_DEFINITIONS.map(item => item.kind),
        ...ORDER_PROJECT_INTERNAL_ASSEMBLY_SUBSTATUS_LEGACY.map(item => item.kind)
    ];
}

function getOrderProjectInternalAssemblySubstatusLabel(kind) {
    const all = [...ORDER_PROJECT_INTERNAL_ASSEMBLY_SUBSTATUS_DEFINITIONS, ...ORDER_PROJECT_INTERNAL_ASSEMBLY_SUBSTATUS_LEGACY];
    const match = all.find(item => item.kind === kind);
    return match?.label || kind || 'Substatus';
}

function isOrderProjectInternalAssemblySubstatusKind(kind) {
    return getOrderProjectInternalAssemblySubstatusKindList().includes(kind);
}

function isOrderProjectSubstatusTableMissingError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('orderprojectsubstatus')
        && (message.includes('does not exist')
            || message.includes('schema cache')
            || message.includes('could not find'));
}

function formatOrderProjectSubstatusError(error) {
    if (isOrderProjectSubstatusTableMissingError(error)) {
        return 'Execute supabase/feats/add-internal-assembly-awaiting-substatus.sql no Supabase SQL Editor.';
    }
    return error?.message || 'Não foi possível atualizar o substatus do projeto.';
}

function isOrderProjectSubstatusDuplicateOpenError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    const code = String(error?.code || '');
    return code === '23505'
        || message.includes('duplicate key')
        || message.includes('unique constraint')
        || message.includes('one_open')
        || message.includes('already exists');
}

function buildInternalAssemblySubstatusAlreadyOpenMessage(kind) {
    const label = getOrderProjectInternalAssemblySubstatusLabel(kind);
    return `Já existe um substatus "${label}" em aberto. Encerre o atual antes de iniciar outro do mesmo tipo.`;
}

async function assertNoOpenInternalAssemblySubstatusOfKind(projectId, kind) {
    const id = Number(projectId);
    if (!id || !kind) return;

    const grouped = await fetchOpenSubstatusRowsByProjectIds([id], kind);
    if ((grouped[id] || []).length > 0) {
        throw new Error(buildInternalAssemblySubstatusAlreadyOpenMessage(kind));
    }
}

function isOrderProjectAwaitingRequest(project) {
    return Boolean(project?.awaitingRequestStartedAt) && !project?.awaitingRequestEndedAt;
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

const ORDER_PROJECT_SUBSTATUS_TAG_CLASS = 'inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold border border-amber-300/80 bg-amber-50 text-amber-900 shrink-0';

function renderOrderProjectSubstatusTagHtml(label, title = 'Substatus em aberto') {
    return `<span class="${ORDER_PROJECT_SUBSTATUS_TAG_CLASS}" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

function renderOrderProjectAwaitingRequestFlagHtml() {
    return renderOrderProjectSubstatusTagHtml(
        'Aguardando requisição',
        'Substatus em aberto desde o início registrado'
    );
}

function renderOrderProjectInternalAssemblySubstatusFlagsHtml(openRows = []) {
    const rows = Array.isArray(openRows) ? openRows : [];
    if (!rows.length) return '';

    const countByKind = {};
    rows.forEach(row => {
        const kind = row?.kind;
        if (!kind) return;
        countByKind[kind] = (countByKind[kind] || 0) + 1;
    });

    return Object.entries(countByKind).map(([kind, count]) => {
        const baseLabel = getOrderProjectInternalAssemblySubstatusLabel(kind);
        const label = count > 1 ? `${baseLabel} (${count})` : baseLabel;
        return renderOrderProjectSubstatusTagHtml(label, 'Substatus em montagem interna');
    }).join('');
}

function renderOrderProjectInternalAssemblyAwaitingFlagHtml(openCount = 1) {
    const count = Number(openCount) || 0;
    if (!count) return '—';
    const label = count > 1 ? `Substatus (${count})` : 'Substatus';
    return renderOrderProjectSubstatusTagHtml(label, 'Substatus em montagem interna');
}

function resolveOrderProjectForSubstatusDisplay(project, options = {}) {
    const id = Number(project?.id);
    if (!id) return project;

    const byId = options.projectsById;
    if (byId && byId[id]) return byId[id];

    if (typeof programacaoProducaoCache !== 'undefined' && programacaoProducaoCache.projectsById?.[id]) {
        return programacaoProducaoCache.projectsById[id];
    }

    if (typeof orderProjectsCache !== 'undefined' && Array.isArray(orderProjectsCache)) {
        const fromOrder = orderProjectsCache.find(item => Number(item.id) === id);
        if (fromOrder) return fromOrder;
    }

    return project;
}

function isOrderProjectInternalAssemblySubstatusOpen(project) {
    return Number(project?.internalAssemblySubstatusOpenCount) > 0;
}

function getOrderProjectOpenSubstatusFilterLabels(project) {
    if (!project) return [];
    const labels = [];
    if (isOrderProjectAwaitingRequest(project)) {
        labels.push(ORDER_PROJECT_SUBSTATUS_AWAITING_REQUEST_LABEL);
    }
    (project.internalAssemblySubstatusOpen || []).forEach(row => {
        labels.push(getOrderProjectInternalAssemblySubstatusLabel(row.kind));
    });
    return labels;
}

function renderOrderProjectOpenSubstatusFlagsHtml(project, options = {}) {
    const resolved = resolveOrderProjectForSubstatusDisplay(project, options);
    if (!resolved) return '';
    const parts = [];
    if (isOrderProjectAwaitingRequest(resolved)) {
        parts.push(renderOrderProjectAwaitingRequestFlagHtml());
    }
    if (isOrderProjectInternalAssemblySubstatusOpen(resolved)) {
        const montagemHtml = renderOrderProjectInternalAssemblySubstatusFlagsHtml(
            resolved.internalAssemblySubstatusOpen
        );
        if (montagemHtml) parts.push(montagemHtml);
    }
    if (!parts.length) return '';
    return `<span class="order-project-substatus-flags inline-flex flex-wrap items-center gap-1">${parts.join('')}</span>`;
}

function isOrderProjectInternalAssemblyAwaitingOpen(project) {
    return isOrderProjectInternalAssemblySubstatusOpen(project);
}

async function fetchOpenSubstatusRowsByProjectIds(projectIds = [], kind) {
    const ids = [...new Set((projectIds || []).map(Number).filter(Boolean))];
    if (!ids.length || !kind) return {};

    const { data, error } = await supabaseClient
        .from('OrderProjectSubstatus')
        .select('id, orderProjectId, kind, startedAt, endedAt')
        .in('orderProjectId', ids)
        .eq('kind', kind)
        .is('endedAt', null)
        .order('startedAt', { ascending: true });

    if (error) {
        if (isOrderProjectSubstatusTableMissingError(error)) {
            console.warn('fetchOpenSubstatusRowsByProjectIds:', formatOrderProjectSubstatusError(error));
            return {};
        }
        throw error;
    }

    const grouped = {};
    (data || []).forEach(row => {
        const projectId = Number(row.orderProjectId);
        if (!grouped[projectId]) grouped[projectId] = [];
        grouped[projectId].push(row);
    });
    return grouped;
}

async function fetchOpenInternalAssemblySubstatusByProjectIds(projectIds = []) {
    const ids = [...new Set((projectIds || []).map(Number).filter(Boolean))];
    const kinds = getOrderProjectInternalAssemblySubstatusKindList();
    if (!ids.length || !kinds.length) return {};

    const { data, error } = await supabaseClient
        .from('OrderProjectSubstatus')
        .select('id, orderProjectId, kind, startedAt, endedAt')
        .in('orderProjectId', ids)
        .in('kind', kinds)
        .is('endedAt', null)
        .order('startedAt', { ascending: true });

    if (error) {
        if (isOrderProjectSubstatusTableMissingError(error)) {
            console.warn('fetchOpenInternalAssemblySubstatusByProjectIds:', formatOrderProjectSubstatusError(error));
            return {};
        }
        throw error;
    }

    const grouped = {};
    (data || []).forEach(row => {
        const projectId = Number(row.orderProjectId);
        if (!grouped[projectId]) grouped[projectId] = [];
        grouped[projectId].push(row);
    });
    return grouped;
}

async function fetchOpenAwaitingRequestByProjectIds(projectIds = []) {
    const grouped = await fetchOpenSubstatusRowsByProjectIds(projectIds, ORDER_PROJECT_SUBSTATUS_AWAITING_REQUEST);
    return Object.fromEntries(
        Object.entries(grouped).map(([projectId, rows]) => [Number(projectId), rows[0] || null])
    );
}

async function attachOpenOrderProjectSubstatuses(projects = []) {
    const list = projects || [];
    if (!list.length) return list;

    const projectIds = list.map(project => project.id);
    const [awaitingByProject, montagemByProject] = await Promise.all([
        fetchOpenAwaitingRequestByProjectIds(projectIds),
        fetchOpenInternalAssemblySubstatusByProjectIds(projectIds)
    ]);

    list.forEach(project => {
        const openAwaiting = awaitingByProject[Number(project.id)];
        project.awaitingRequestSubstatusId = openAwaiting?.id || null;
        project.awaitingRequestStartedAt = openAwaiting?.startedAt || null;
        project.awaitingRequestEndedAt = openAwaiting?.endedAt || null;

        const openMontagem = montagemByProject[Number(project.id)] || [];
        project.internalAssemblySubstatusOpen = openMontagem;
        project.internalAssemblySubstatusOpenCount = openMontagem.length;
        project.internalAssemblyAwaitingOpen = openMontagem;
        project.internalAssemblyAwaitingOpenCount = openMontagem.length;
        project.internalAssemblyAwaitingOpenIds = openMontagem.map(row => row.id);
    });
    return list;
}

async function startOrderProjectInternalAssemblySubstatus(projectId, kind) {
    const id = Number(projectId);
    if (!id) throw new Error('Projeto inválido.');
    if (!isOrderProjectInternalAssemblySubstatusKind(kind)) {
        throw new Error('Tipo de substatus inválido.');
    }

    await assertNoOpenInternalAssemblySubstatusOfKind(id, kind);

    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('OrderProjectSubstatus')
        .insert({
            orderProjectId: id,
            kind,
            startedAt: now,
            startedById: currentUser?.id || null,
            createdAt: now,
            updatedAt: now
        })
        .select('id, orderProjectId, kind, startedAt')
        .single();

    if (error) {
        if (isOrderProjectSubstatusDuplicateOpenError(error)) {
            throw new Error(buildInternalAssemblySubstatusAlreadyOpenMessage(kind));
        }
        throw new Error(formatOrderProjectSubstatusError(error));
    }

    return data;
}

async function startOrderProjectInternalAssemblyAwaiting(projectId) {
    return startOrderProjectInternalAssemblySubstatus(projectId, ORDER_PROJECT_SUBSTATUS_INTERNAL_ASSEMBLY_AWAITING);
}

async function endOrderProjectInternalAssemblySubstatusById(substatusId, projectId = null) {
    const id = Number(substatusId);
    if (!id) throw new Error('Substatus inválido.');

    const kinds = getOrderProjectInternalAssemblySubstatusKindList();
    const now = new Date().toISOString();
    let query = supabaseClient
        .from('OrderProjectSubstatus')
        .update({
            endedAt: now,
            endedById: currentUser?.id || null,
            updatedAt: now
        })
        .eq('id', id)
        .in('kind', kinds)
        .is('endedAt', null);

    if (projectId) {
        query = query.eq('orderProjectId', Number(projectId));
    }

    const { data, error } = await query.select('id, kind, endedAt').maybeSingle();
    if (error) throw new Error(formatOrderProjectSubstatusError(error));
    if (!data) throw new Error('Não há substatus em aberto para encerrar.');
    return data;
}

async function endOrderProjectInternalAssemblyAwaitingById(substatusId, projectId = null) {
    return endOrderProjectInternalAssemblySubstatusById(substatusId, projectId);
}

async function assertNoOpenInternalAssemblySubstatusForExpedicao(projectId) {
    const id = Number(projectId);
    if (!id) return;

    const grouped = await fetchOpenInternalAssemblySubstatusByProjectIds([id]);
    const openRows = grouped[id] || [];
    const openCount = openRows.length;
    if (openCount > 0) {
        const labels = [...new Set(openRows.map(row => getOrderProjectInternalAssemblySubstatusLabel(row.kind)))];
        const detail = labels.length ? ` (${labels.join(', ')})` : '';
        throw new Error(
            openCount === 1
                ? `Encerre o substatus em aberto${detail} antes de enviar à expedição.`
                : `Encerre os ${openCount} substatus em aberto${detail} antes de enviar à expedição.`
        );
    }
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
    if (pendenciasVisible && typeof loadPendenciasProjetoTecnico === 'function'
        && typeof pendenciasActiveItem !== 'undefined' && pendenciasActiveItem === 'projeto-tecnico') {
        await loadPendenciasProjetoTecnico();
    }
    if (pendenciasVisible && typeof loadPendenciasEmMontagem === 'function'
        && typeof pendenciasActiveItem !== 'undefined' && pendenciasActiveItem === 'em-montagem') {
        await loadPendenciasEmMontagem();
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
window.ORDER_PROJECT_SUBSTATUS_INTERNAL_ASSEMBLY_AWAITING = ORDER_PROJECT_SUBSTATUS_INTERNAL_ASSEMBLY_AWAITING;
window.ORDER_PROJECT_SUBSTATUS_MONTAGEM_INTERNA_STATUS = ORDER_PROJECT_SUBSTATUS_MONTAGEM_INTERNA_STATUS;
window.ORDER_PROJECT_INTERNAL_ASSEMBLY_SUBSTATUS_DEFINITIONS = ORDER_PROJECT_INTERNAL_ASSEMBLY_SUBSTATUS_DEFINITIONS;
window.getOrderProjectInternalAssemblySubstatusKindList = getOrderProjectInternalAssemblySubstatusKindList;
window.getOrderProjectInternalAssemblySubstatusLabel = getOrderProjectInternalAssemblySubstatusLabel;
window.isOrderProjectAwaitingRequest = isOrderProjectAwaitingRequest;
window.isOrderProjectInternalAssemblySubstatusOpen = isOrderProjectInternalAssemblySubstatusOpen;
window.isOrderProjectInternalAssemblyAwaitingOpen = isOrderProjectInternalAssemblyAwaitingOpen;
window.canManageOrderProjectAwaitingRequest = canManageOrderProjectAwaitingRequest;
window.renderOrderProjectAwaitingRequestFlagHtml = renderOrderProjectAwaitingRequestFlagHtml;
window.renderOrderProjectInternalAssemblySubstatusFlagsHtml = renderOrderProjectInternalAssemblySubstatusFlagsHtml;
window.getOrderProjectOpenSubstatusFilterLabels = getOrderProjectOpenSubstatusFilterLabels;
window.resolveOrderProjectForSubstatusDisplay = resolveOrderProjectForSubstatusDisplay;
window.renderOrderProjectOpenSubstatusFlagsHtml = renderOrderProjectOpenSubstatusFlagsHtml;
window.renderOrderProjectInternalAssemblyAwaitingFlagHtml = renderOrderProjectInternalAssemblyAwaitingFlagHtml;
window.attachOpenOrderProjectSubstatuses = attachOpenOrderProjectSubstatuses;
window.startOrderProjectInternalAssemblySubstatus = startOrderProjectInternalAssemblySubstatus;
window.startOrderProjectInternalAssemblyAwaiting = startOrderProjectInternalAssemblyAwaiting;
window.endOrderProjectInternalAssemblySubstatusById = endOrderProjectInternalAssemblySubstatusById;
window.endOrderProjectInternalAssemblyAwaitingById = endOrderProjectInternalAssemblyAwaitingById;
window.assertNoOpenInternalAssemblySubstatusForExpedicao = assertNoOpenInternalAssemblySubstatusForExpedicao;
window.promptStartOrderProjectAwaitingRequest = promptStartOrderProjectAwaitingRequest;
window.promptEndOrderProjectAwaitingRequest = promptEndOrderProjectAwaitingRequest;
