const PPCP_AGUARDANDO_STATUS = 'Aguardando PPCP';
const PPCP_IMPLANTACAO_STATUS = 'Implantação';

const PPCP_STATUS_PIPELINE = [
    PPCP_AGUARDANDO_STATUS,
    PPCP_IMPLANTACAO_STATUS,
    'Em Produção',
    'Montagem Interna',
    'Expedição'
];

async function getOrderProjectStatusIdByNamePpcp(statusName) {
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

async function getAguardandoPpcpProjectStatusId() {
    return getOrderProjectStatusIdByNamePpcp(PPCP_AGUARDANDO_STATUS);
}

async function getPpcpImplantacaoProjectStatusId() {
    return getOrderProjectStatusIdByNamePpcp(PPCP_IMPLANTACAO_STATUS);
}

function canActOrderPpcp(user = currentUser) {
    return isAdmin(user) || isPpcp(user);
}

function hasOpenOrderProjectImplantacao(implantacao) {
    const statusEncerrado = typeof IMPLANTACAO_STATUS_ENCERRADO === 'string'
        ? IMPLANTACAO_STATUS_ENCERRADO
        : 'Encerrado';
    return Boolean(implantacao && implantacao.status !== statusEncerrado);
}

function canShowOrderProjectImplantacaoAction(project, implantacao) {
    if (!project || !canActOnOrderProject(project)) return false;
    if (typeof isPpcp !== 'function' || !isPpcp()) return false;
    if (hasOpenOrderProjectImplantacao(implantacao)) return true;
    return getPpcpProjectStatusName(project) === PPCP_IMPLANTACAO_STATUS;
}

function getPpcpProjectStatusName(project) {
    return project?.projectStatus?.name || '';
}

function isPpcpStatusAtOrAfter(statusName, referenceStatus) {
    const statusIndex = PPCP_STATUS_PIPELINE.indexOf(statusName);
    const referenceIndex = PPCP_STATUS_PIPELINE.indexOf(referenceStatus);
    if (statusIndex === -1 || referenceIndex === -1) return false;
    return statusIndex >= referenceIndex;
}

async function fetchImplantacoesMapForProjectIds(projectIds) {
    if (!projectIds.length) return {};

    const { data, error } = await supabaseClient
        .from('Implantacao')
        .select('id, status, orderProjectId')
        .in('orderProjectId', projectIds);

    if (error) {
        console.error('fetchImplantacoesMapForProjectIds:', error);
        return {};
    }

    return Object.fromEntries((data || []).map(item => [item.orderProjectId, item]));
}

function renderPpcpProjectCard(project, implantacao) {
    const card = document.createElement('div');
    card.className = 'flex flex-wrap items-center justify-between gap-3 p-4 border border-slate-200 rounded-xl bg-white';
    card.dataset.projectId = String(project.id);

    const statusName = getPpcpProjectStatusName(project);
    const projectStatusClass = getOrderProjectStatusBadgeClass(statusName);
    const canAct = canActOrderPpcp() && canActOnOrderProject(project);
    const isAguardandoPpcp = statusName === PPCP_AGUARDANDO_STATUS;
    const isImplantacaoStatus = statusName === PPCP_IMPLANTACAO_STATUS;
    const hasImplantacao = Boolean(implantacao);

    let statusBadgeHtml = `
        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${projectStatusClass}">
            ${escapeHtml(statusName || '—')}
        </span>
    `;

    if (implantacao?.status) {
        const implantacaoClass = typeof getImplantacaoStatusBadgeClass === 'function'
            ? getImplantacaoStatusBadgeClass(implantacao.status)
            : 'bg-teal-100 text-teal-800';
        statusBadgeHtml = `
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${implantacaoClass}">
                ${escapeHtml(implantacao.status)}
            </span>
        `;
    }

    const buttons = [];

    if (isAguardandoPpcp) {
        const iniciarDisabled = !canAct;
        buttons.push(`
            <button type="button"
                class="ppcp-implantar-btn bg-violet-700 text-white text-xs px-4 py-2 rounded-lg font-medium hover:bg-violet-800 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                ${iniciarDisabled ? 'disabled' : ''}>
                Iniciar Implantação
            </button>
        `);
    }

    if (hasImplantacao || isImplantacaoStatus) {
        buttons.push(`
            <button type="button"
                class="ppcp-implantacao-btn bg-teal-700 text-white text-xs px-4 py-2 rounded-lg font-medium hover:bg-teal-800 whitespace-nowrap">
                Implantação
            </button>
        `);
    }

    card.innerHTML = `
        <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-slate-900">${escapeHtml(project.name)}</p>
                ${renderComplementarProjectNoticeHtml(project)}
                ${renderSubstituidoProjectNoticeHtml(project)}
                ${renderSubstituicaoProjectNoticeHtml(project)}
                ${statusBadgeHtml}
            </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
            ${buttons.join('')}
        </div>
    `;

    return card;
}

async function refreshPpcpRelatedViews(orderId) {
    await loadPpcpProjects(orderId);
    if (typeof loadFabricaProjects === 'function') {
        await loadFabricaProjects(orderId);
    }
    if (typeof loadOrderProjects === 'function') {
        await loadOrderProjects(orderId);
    }
    if (typeof loadPendenciasImplantacao === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
        await loadPendenciasImplantacao();
    }
}

function countPpcpTabProjects(projects, implantacaoByProjectId) {
    return projects.filter(project => {
        const statusName = getPpcpProjectStatusName(project);
        const implantacao = implantacaoByProjectId[project.id];
        return statusName === PPCP_AGUARDANDO_STATUS
            || Boolean(implantacao && implantacao.status !== IMPLANTACAO_STATUS_ENCERRADO)
            || isPpcpStatusAtOrAfter(statusName, PPCP_IMPLANTACAO_STATUS);
    }).length;
}

async function loadPpcpProjects(orderId) {
    const list = document.getElementById('ppcp-projects-list');
    if (!list) return;

    let result = await supabaseClient
        .from('OrderProject')
        .select('id, name, statusId, isComplementar, parentProjectId, parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), projectStatus:OrderProjectStatus(id, name)')
        .eq('orderId', orderId)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('parentProject') || result.error?.message?.includes('isComplementar')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, name, statusId, projectStatus:OrderProjectStatus(id, name)')
            .eq('orderId', orderId)
            .order('name', { ascending: true });
    }

    const { data: projects, error } = result;

    if (error) {
        console.error('loadPpcpProjects:', error);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-6">Erro ao carregar projetos: ${escapeHtml(error.message)}</p>`;
        return;
    }

    const items = projects || [];
    let implantacaoByProjectId = await fetchImplantacoesMapForProjectIds(items.map(project => project.id));

    if (typeof syncImplantacaoRecordsMapForProjects === 'function') {
        implantacaoByProjectId = await syncImplantacaoRecordsMapForProjects(items, implantacaoByProjectId);
    }

    list.innerHTML = '';

    if (!items.length) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 bg-white rounded-xl border border-slate-100">Nenhum projeto neste pedido.</p>';
        return;
    }

    items.forEach(project => {
        list.appendChild(renderPpcpProjectCard(project, implantacaoByProjectId[project.id]));
    });
}

async function implantarPpcpProject(projectId, button, projectName) {
    if (!activeOrderId || !canActOrderPpcp()) return;

    const label = projectName || 'este projeto';
    if (!(await confirmAppDialog(`Iniciar implantação de "${label}"?`))) return;

    const implantacaoStatusId = await getPpcpImplantacaoProjectStatusId();
    if (!implantacaoStatusId) {
        alertAppDialog(`Status "${PPCP_IMPLANTACAO_STATUS}" não encontrado. Execute supabase/create-order-project-status.sql no Supabase.`);
        return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Salvando...';
    button.classList.add('opacity-60', 'cursor-not-allowed');

    try {
        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId: implantacaoStatusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .eq('id', projectId);

        if (error) {
            alertAppDialog('Erro ao iniciar implantação: ' + error.message);
            return;
        }

        if (typeof createImplantacaoForProject === 'function') {
            await createImplantacaoForProject(projectId);
        }

        await refreshPpcpRelatedViews(activeOrderId);
    } finally {
        button.disabled = false;
        button.textContent = originalText;
        button.classList.remove('opacity-60', 'cursor-not-allowed');
    }
}

async function openPpcpImplantacaoModal(projectId, projectName) {
    if (!activeOrderId) return;

    if (typeof openImplantacaoModal === 'function') {
        await openImplantacaoModal(projectId, projectName, { requireExisting: true });
    }
}

window.implantarPpcpProject = implantarPpcpProject;
window.openPpcpImplantacaoModal = openPpcpImplantacaoModal;

function bindPpcpEvents() {
    document.getElementById('ppcp-projects-list')?.addEventListener('click', async (event) => {
        const implantarBtn = event.target.closest('.ppcp-implantar-btn');
        if (implantarBtn) {
            if (implantarBtn.disabled) return;
            const card = implantarBtn.closest('[data-project-id]');
            const projectId = Number(card?.dataset.projectId);
            if (!projectId) return;
            const projectName = card.querySelector('.text-sm.font-semibold')?.textContent?.trim() || '';
            implantarPpcpProject(projectId, implantarBtn, projectName);
            return;
        }

        const implantacaoBtn = event.target.closest('.ppcp-implantacao-btn');
        if (!implantacaoBtn || implantacaoBtn.disabled) return;

        const card = implantacaoBtn.closest('[data-project-id]');
        const projectId = Number(card?.dataset.projectId);
        if (!projectId) return;
        const projectName = card.querySelector('.text-sm.font-semibold')?.textContent?.trim() || '';
        openPpcpImplantacaoModal(projectId, projectName);
    });
}
