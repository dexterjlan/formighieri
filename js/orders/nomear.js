const ORDER_NOMEAR_STATUS = 'Nomear';
const ORDER_AGUARDANDO_PPCP_STATUS = 'Aguardando PPCP';

const ORDER_NOMEAR_PROJECT_SELECT = 'id, orderId, name, projectCode, statusId, designerId, nomeado, isComplementar, parentProjectId, parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), designer:appUsers!OrderProject_designerId_fkey(id, name)';
const ORDER_NOMEAR_PROJECT_SELECT_FALLBACK = 'id, orderId, name, projectCode, statusId, designerId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), designer:appUsers!OrderProject_designerId_fkey(id, name)';

let orderProjectNomeadoColumnAvailable = true;
const orderNomeadoProjectIdsCache = new Set();

function resetOrderNomeadoProjectIdsCache(projectIds = []) {
    orderNomeadoProjectIdsCache.clear();
    projectIds.forEach(id => {
        if (id) orderNomeadoProjectIdsCache.add(Number(id));
    });
}

function rememberOrderProjectAsNomeado(projectId) {
    if (projectId) orderNomeadoProjectIdsCache.add(Number(projectId));
}

async function getOrderProjectStatusIdByNameNomear(statusName) {
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

async function getNomearProjectStatusIdForOrder() {
    return getOrderProjectStatusIdByNameNomear(ORDER_NOMEAR_STATUS);
}

async function getAguardandoPpcpProjectStatusIdForNomear() {
    return getOrderProjectStatusIdByNameNomear(ORDER_AGUARDANDO_PPCP_STATUS);
}

function isOrderProjectNomeado(project) {
    if (!project) return false;
    if (orderNomeadoProjectIdsCache.has(Number(project.id))) return true;
    if (project.nomeado === true) return true;
    if (project.nomeado === false) return false;

    if (!orderProjectNomeadoColumnAvailable
        && getOrderProjectStatusName(project) === ORDER_AGUARDANDO_PPCP_STATUS) {
        return true;
    }

    return false;
}

function isOrderProjectInNomearStatus(project) {
    return getOrderProjectStatusName(project) === ORDER_NOMEAR_STATUS;
}

function canShowOrderProjectNomearAction(project) {
    return isOrderProjectInNomearStatus(project)
        && !isOrderProjectNomeado(project)
        && canActOrderProjectNomear(project)
        && canActOnOrderProject(project);
}

function getNomearProjectDesignerHtml(project) {
    const designerName = project.designer?.name;
    if (!designerName) {
        return '<span class="text-xs text-slate-400">—</span>';
    }

    return `<span class="text-xs text-slate-500">👤 Projetista: <span class="font-medium text-slate-700">${escapeHtml(designerName)}</span></span>`;
}

async function queryOrderNomearProjects(orderId) {
    let result = await supabaseClient
        .from('OrderProject')
        .select(ORDER_NOMEAR_PROJECT_SELECT)
        .eq('orderId', orderId)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('nomeado')) {
        orderProjectNomeadoColumnAvailable = false;
        result = await supabaseClient
            .from('OrderProject')
            .select(ORDER_NOMEAR_PROJECT_SELECT_FALLBACK)
            .eq('orderId', orderId)
            .order('name', { ascending: true });
    } else if (result.error?.message?.includes('parentProject') || result.error?.message?.includes('isComplementar')) {
        result = await supabaseClient
            .from('OrderProject')
            .select(ORDER_NOMEAR_PROJECT_SELECT_FALLBACK)
            .eq('orderId', orderId)
            .order('name', { ascending: true });
    } else {
        orderProjectNomeadoColumnAvailable = true;
    }

    if (!result.error) {
        resetOrderNomeadoProjectIdsCache(
            (result.data || [])
                .filter(project => project.nomeado === true)
                .map(project => project.id)
        );
    }

    return result;
}

function isPendenciasViewVisibleForNomear() {
    const view = document.getElementById('pendencias-view');
    return Boolean(view && !view.classList.contains('hidden'));
}

function isOrderProjectsPanelVisibleForNomear() {
    const content = document.getElementById('order-content');
    return Boolean(content && !content.classList.contains('hidden'));
}

function setNomearOrderProjectsActionLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('order-projects-action-loading');
    const messageEl = document.getElementById('order-projects-action-loading-msg');
    const spinner = document.getElementById('order-projects-action-loading-spinner');
    const successIcon = document.getElementById('order-projects-action-loading-success');
    const errorIcon = document.getElementById('order-projects-action-loading-error');
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
}

function setNomearActionLoading(active, message = 'Processando...', status = 'loading') {
    if (isPendenciasViewVisibleForNomear() && typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(active, message, status);
        return;
    }

    if (isOrderProjectsPanelVisibleForNomear()) {
        setNomearOrderProjectsActionLoading(active, message, status);
    }
}

async function waitNomearActionStatus(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function markOrderProjectAsNomeado(projectId, options = {}) {
    const {
        confirmMessage,
        onSuccess
    } = options;

    if (!projectId) return false;

    const [nomearStatusId, aguardandoPpcpStatusId] = await Promise.all([
        getNomearProjectStatusIdForOrder(),
        getAguardandoPpcpProjectStatusIdForNomear()
    ]);

    if (!nomearStatusId || !aguardandoPpcpStatusId) {
        alertAppDialog('Status de projeto não encontrados. Execute supabase/create-order-project-status.sql no Supabase.');
        return false;
    }

    let result = await supabaseClient
        .from('OrderProject')
        .select(ORDER_NOMEAR_PROJECT_SELECT)
        .eq('id', projectId)
        .maybeSingle();

    if (result.error?.message?.includes('nomeado')) {
        result = await supabaseClient
            .from('OrderProject')
            .select(ORDER_NOMEAR_PROJECT_SELECT_FALLBACK)
            .eq('id', projectId)
            .maybeSingle();
    }

    if (result.error || !result.data) {
        alertAppDialog('Projeto não encontrado.');
        return false;
    }

    const project = result.data;

    if (!canActOrderProjectNomear(project)) {
        alertAppDialog('Somente o projetista responsável pode confirmar o projeto como nomeado.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    if (Number(project.statusId) !== Number(nomearStatusId)
        && getOrderProjectStatusName(project) !== ORDER_NOMEAR_STATUS) {
        alertAppDialog('O status do projeto foi alterado. Atualize a lista.');
        return false;
    }

    if (isOrderProjectNomeado(project)) {
        alertAppDialog('Este projeto já está marcado como nomeado.');
        return false;
    }

    const projectLabel = project.name?.trim() || 'este projeto';
    const resolvedConfirmMessage = confirmMessage
        || `Confirmar "${projectLabel}" como nomeado e enviar para Aguardando PPCP?`;

    if (!(await confirmAppDialog(resolvedConfirmMessage))) return false;

    setNomearActionLoading(true, 'Confirmando nomeação...');

    try {
        const now = new Date().toISOString();
        const updatePayload = {
            statusId: aguardandoPpcpStatusId,
            nomeado: true,
            updatedById: currentUser.id,
            updatedAt: now
        };

        const { data: updatedProject, error } = await supabaseClient
            .from('OrderProject')
            .update(updatePayload)
            .eq('id', projectId)
            .select('id, nomeado, statusId')
            .maybeSingle();

        if (error) {
            const message = error.message?.includes('nomeado')
                ? 'Coluna nomeado não encontrada. Execute supabase/create-gestao-order-fields.sql no Supabase.'
                : `Erro ao confirmar projeto como nomeado: ${error.message}`;
            setNomearActionLoading(true, message, 'error');
            await waitNomearActionStatus(2200);
            return false;
        }

        if (updatedProject?.nomeado !== true) {
            setNomearActionLoading(true, 'Não foi possível marcar o projeto como nomeado. Verifique a coluna nomeado no Supabase.', 'error');
            await waitNomearActionStatus(2200);
            return false;
        }

        rememberOrderProjectAsNomeado(projectId);

        if (typeof notifyProjetoNomeadoEmail === 'function') {
            setNomearActionLoading(true, 'Enviando notificação por e-mail...');
            await notifyProjetoNomeadoEmail({
                orderId: project.orderId,
                orderProjectIds: [projectId],
                designerId: project.designerId
            });
        }

        setNomearActionLoading(true, 'Atualizando telas...');
        if (typeof onSuccess === 'function') {
            await onSuccess();
        }

        setNomearActionLoading(true, 'Projeto nomeado!', 'success');
        await waitNomearActionStatus(900);
        return true;
    } catch (error) {
        setNomearActionLoading(true, `Erro ao nomear projeto: ${error.message}`, 'error');
        await waitNomearActionStatus(2200);
        return false;
    } finally {
        setNomearActionLoading(false);
    }
}

function renderOrderNomearProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'flex flex-wrap items-center justify-between gap-3 p-4 border border-purple-100 rounded-xl bg-purple-50/30';
    card.dataset.projectId = String(project.id);

    const statusName = getOrderProjectStatusName(project);
    const statusClass = getOrderProjectStatusBadgeClass(statusName);
    const isNomeado = isOrderProjectNomeado(project);
    const canAct = canShowOrderProjectNomearAction(project);

    let actionHtml = '';
    if (isNomeado) {
        actionHtml = `
            <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <span aria-hidden="true">✓</span>
                Nomeado
            </span>
        `;
    } else if (canAct) {
        actionHtml = `
            <button type="button" class="nomear-confirm-btn bg-purple-700 text-white text-xs px-4 py-2 rounded-lg font-medium hover:bg-purple-800 whitespace-nowrap">
                Nomear Projeto
            </button>
        `;
    }

    card.innerHTML = `
        <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
                <p class="text-sm font-semibold text-slate-900">${escapeHtml(project.name)}</p>
                ${renderComplementarProjectNoticeHtml(project)}
                ${renderSubstituidoProjectNoticeHtml(project)}
                ${renderSubstituicaoProjectNoticeHtml(project)}
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">
                    ${escapeHtml(statusName)}
                </span>
            </div>
            <p class="mt-0.5">${getNomearProjectDesignerHtml(project)}</p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
            ${actionHtml}
        </div>
    `;

    return card;
}

async function refreshNomearRelatedViews(orderId) {
    await loadNomearProjects(orderId);
    if (typeof loadOrderProjects === 'function') {
        await loadOrderProjects(orderId);
    }
    if (typeof loadPpcpProjects === 'function') {
        await loadPpcpProjects(orderId);
    }
    if (typeof loadPendenciasContent === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')
        && pendenciasActiveSection === 'projetista'
        && pendenciasActiveItem === 'nomear') {
        await loadPendenciasNomear();
    }
}

async function loadNomearProjects(orderId) {
    const list = document.getElementById('nomear-projects-list');
    if (!list) return;

    const nomearStatusId = await getNomearProjectStatusIdForOrder();
    const { data: projects, error } = await queryOrderNomearProjects(orderId);

    if (error) {
        console.error('loadNomearProjects:', error);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-6">Erro ao carregar projetos: ${escapeHtml(error.message)}</p>`;
        return;
    }

    const items = projects || [];
    const nomearCount = nomearStatusId
        ? items.filter(project =>
            (Number(project.statusId) === Number(nomearStatusId)
                || getOrderProjectStatusName(project) === ORDER_NOMEAR_STATUS)
            && !isOrderProjectNomeado(project)
        ).length
        : 0;

    list.innerHTML = '';

    if (!orderProjectNomeadoColumnAvailable) {
        list.innerHTML = `
            <p class="text-xs text-amber-700 text-center py-4 mb-3 bg-amber-50 rounded-xl border border-amber-100">
                Coluna <code>nomeado</code> não encontrada. Execute <code>supabase/create-gestao-order-fields.sql</code> no Supabase.
            </p>
        `;
    }

    if (!items.length) {
        list.innerHTML += '<p class="text-xs text-slate-400 text-center py-6 bg-white rounded-xl border border-slate-100">Nenhum projeto neste pedido.</p>';
        return;
    }

    items.forEach(project => {
        list.appendChild(renderOrderNomearProjectCard(project));
    });
}

async function confirmOrderProjectNomeado(projectId) {
    if (!activeOrderId || !canActOrderProjectNomear({ id: projectId })) return;

    await markOrderProjectAsNomeado(projectId, {
        onSuccess: () => refreshNomearRelatedViews(activeOrderId)
    });
}

function bindNomearEvents() {
    document.getElementById('nomear-projects-list')?.addEventListener('click', async (event) => {
        const button = event.target.closest('.nomear-confirm-btn');
        if (!button || button.disabled) return;

        const card = button.closest('[data-project-id]');
        const projectId = Number(card?.dataset.projectId);
        if (!projectId) return;

        confirmOrderProjectNomeado(projectId);
    });
}
