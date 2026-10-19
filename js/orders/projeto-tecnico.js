const ORDER_PT_STATUS_AGUARDANDO = 'Aguardando Projeto Técnico';
const ORDER_PT_STATUS_PROJETO_TECNICO = 'Projeto Técnico';

const ORDER_PROJETO_TECNICO_PROJECT_SELECT = `
    id, orderId, projectCode, name, designerId, statusId, deliveryDate, technicalProjectForecastStartDate, technicalProjectForecastEndDate,
    projectStatus:OrderProjectStatus(id, name),
    designer:appUsers!OrderProject_designerId_fkey(id, name)
`;

const ORDER_PROJETO_TECNICO_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, designerId, statusId, deliveryDate, technicalProjectForecastEndDate
`;

function formatOrderProjetoTecnicoDate(dateStr) {
    if (!dateStr) return '—';
    const normalized = String(dateStr).slice(0, 10);
    const [year, month, day] = normalized.split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return new Date(dateStr).toLocaleDateString('pt-BR');
}

function getOrderProjetoTecnicoStatusName(project) {
    return project?.projectStatus?.name || getOrderProjectStatusName(project) || '—';
}

function isPendenciasViewVisibleForProjetoTecnico() {
    const view = document.getElementById('pendencias-view');
    return Boolean(view && !view.classList.contains('hidden'));
}

function setProjetoTecnicoTableButtonsDisabled(disabled) {
    const root = document.getElementById('projeto-tecnico-projects-list');
    root?.querySelectorAll('.order-pt-iniciar-btn').forEach(button => {
        button.disabled = disabled;
        button.classList.toggle('opacity-60', disabled);
        button.classList.toggle('cursor-not-allowed', disabled);
    });
}

function isOrderProjectsPanelVisible() {
    const content = document.getElementById('order-content');
    return Boolean(content && !content.classList.contains('hidden'));
}

function setProjetoTecnicoActionLoading(active, message = 'Processando...', status = 'loading') {
    if (isPendenciasViewVisibleForProjetoTecnico() && typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(active, message, status);
        return;
    }

    if (isOrderProjectsPanelVisible() && typeof setOrderProjectsPanelActionLoading === 'function') {
        setOrderProjectsPanelActionLoading(active, message, status);
        return;
    }

    if (typeof getAppGlobalOverlayConfig === 'function') {
        setModalOverlayLoading(getAppGlobalOverlayConfig(), active, message, status);
    }
}

async function getOrderProjetoTecnicoStatusIdByName(statusName) {
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

async function queryOrderProjetoTecnicoProjects(orderId) {
    let result = await supabaseClient
        .from('OrderProject')
        .select(ORDER_PROJETO_TECNICO_PROJECT_SELECT)
        .eq('orderId', orderId)
        .order('deliveryDate', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });

    if (result.error?.message?.includes('technicalProjectForecastEndDate')
        || result.error?.message?.includes('technicalProjectForecastStartDate')
        || result.error?.message?.includes('projectStatus')
        || result.error?.message?.includes('designer')) {
        result = await supabaseClient
            .from('OrderProject')
            .select(ORDER_PROJETO_TECNICO_PROJECT_SELECT_FALLBACK)
            .eq('orderId', orderId)
            .order('deliveryDate', { ascending: true, nullsFirst: false })
            .order('name', { ascending: true });
    }

    return result;
}

function canIniciarOrderProjetoTecnico(project) {
    if (!canActOrderDetailTab('projeto-tecnico')) return false;
    if (!project) return false;
    if (getOrderProjetoTecnicoStatusName(project) !== ORDER_PT_STATUS_AGUARDANDO) return false;
    if (!project.designerId) return false;
    if (isAdmin()) return true;
    return currentUser?.role === 'Projetista'
        && Number(project.designerId) === Number(currentUser.id);
}

function renderOrderProjetoTecnicoActionCell(project) {
    if (canIniciarOrderProjetoTecnico(project)) {
        return `<button type="button"
            class="order-pt-iniciar-btn text-xs bg-emerald-700 text-white hover:bg-emerald-800 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
            data-project-id="${project.id}">
            Iniciar Projeto
        </button>`;
    }

    return '<span class="text-xs text-slate-300">—</span>';
}

function renderOrderProjetoTecnicoPrevisaoCell(project) {
    return `<span class="text-xs text-slate-600 whitespace-nowrap">${escapeHtml(formatTechnicalProjectForecastRange(project.technicalProjectForecastStartDate, project.technicalProjectForecastEndDate))}</span>`;
}

function renderOrderProjetoTecnicoProjectsTable(projects) {
    const rows = (projects || []).map(project => {
        const statusName = getOrderProjetoTecnicoStatusName(project);
        const statusClass = getOrderProjectStatusBadgeClass(statusName);
        const projectLabel = project.projectCode
            ? `${project.projectCode} — ${project.name || 'Projeto'}`
            : (project.name || 'Projeto');

        return `
            <tr class="border-b border-slate-100 last:border-0" data-project-id="${project.id}">
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(formatOrderProjetoTecnicoDate(project.deliveryDate))}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(project.designer?.name || '—')}</td>
                <td class="p-3 order-pt-previsao-cell">${renderOrderProjetoTecnicoPrevisaoCell(project)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(statusName)}
                    </span>
                </td>
                <td class="p-3 text-right whitespace-nowrap">${renderOrderProjetoTecnicoActionCell(project)}</td>
            </tr>
        `;
    }).join('');

    if (!rows) {
        return '<p class="text-xs text-slate-400 text-center py-8">Nenhum projeto neste pedido.</p>';
    }

    return `
        <div class="overflow-x-auto">
            <table class="w-full text-sm min-w-[56rem]">
                <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th class="text-left p-3 font-semibold">Projeto</th>
                        <th class="text-left p-3 font-semibold">Entrega</th>
                        <th class="text-left p-3 font-semibold">Projetista</th>
                        <th class="text-left p-3 font-semibold min-w-[11rem]">Previsão</th>
                        <th class="text-left p-3 font-semibold">Status</th>
                        <th class="text-right p-3 font-semibold w-36">Ação</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function bindOrderProjetoTecnicoTableEvents(root) {
    if (!root) return;

    root.querySelectorAll('.order-pt-iniciar-btn').forEach(button => {
        button.addEventListener('click', () => {
            iniciarProjetoTecnico(Number(button.dataset.projectId));
        });
    });
}

async function refreshOrderProjetoTecnicoRelatedViews(orderId) {
    if (orderId && typeof loadOrderProjetoTecnicoProjects === 'function') {
        await loadOrderProjetoTecnicoProjects(orderId);
    }
    if (orderId && typeof loadOrderProjects === 'function') {
        await loadOrderProjects(orderId);
    }
    if (typeof loadPendenciasAguardandoProjetoTecnico === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')
        && pendenciasActiveSection === 'projetista'
        && pendenciasActiveItem === 'aguardando-projeto-tecnico') {
        await loadPendenciasAguardandoProjetoTecnico();
    }
    if (typeof loadPendenciasProjetoTecnico === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')
        && pendenciasActiveSection === 'projetista'
        && pendenciasActiveItem === 'projeto-tecnico') {
        await loadPendenciasProjetoTecnico();
    }
}

async function fetchDesignerProjetoTecnicoEmExecucao(designerId, excludeProjectId, statusId) {
    const normalizedDesignerId = Number(designerId);
    const normalizedExcludeId = Number(excludeProjectId);
    if (!normalizedDesignerId || !statusId) return [];

    let result = await supabaseClient
        .from('OrderProject')
        .select('id, name, projectCode, order:salesOrders(orderCode, clientId, consultantUserId, client:Client(name), consultor:appUsers!consultantUserId(name))')
        .eq('designerId', normalizedDesignerId)
        .eq('statusId', statusId);

    if (result.error?.message?.includes('salesOrders')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, name, projectCode')
            .eq('designerId', normalizedDesignerId)
            .eq('statusId', statusId);
    }

    if (result.error) {
        console.error('fetchDesignerProjetoTecnicoEmExecucao:', result.error);
        return [];
    }

    return (result.data || []).filter(project => Number(project.id) !== normalizedExcludeId);
}

function formatProjetoTecnicoEmExecucaoLabel(project) {
    const clientName = getOrderClientName(project.order) || '—';
    const projectName = project.name || 'Projeto';
    const orderCode = project.order?.orderCode;
    const orderSuffix = orderCode ? ` · Pedido ${orderCode}` : '';
    return `${clientName} — ${projectName}${orderSuffix}`;
}

function getIniciarProjetoTecnicoConfirmLabel(project) {
    if (project.projectCode) {
        return `${project.projectCode} — ${project.name || 'Projeto'}`;
    }
    return project.name || 'Projeto';
}

async function confirmIniciarProjetoTecnico(project, outrosProjetos = []) {
    const projectLabel = getIniciarProjetoTecnicoConfirmLabel(project);

    if (!outrosProjetos.length) {
        return confirmAppDialog(`Iniciar projeto técnico de "${projectLabel}"?`);
    }

    const outrosLabels = outrosProjetos
        .map(formatProjetoTecnicoEmExecucaoLabel)
        .join('\n');
    const message = outrosProjetos.length === 1
        ? `Já existe outro projeto em execução:\n${outrosLabels}\n\nDeseja realmente iniciar "${projectLabel}" também?`
        : `Já existem ${outrosProjetos.length} outros projetos em execução:\n${outrosLabels}\n\nDeseja realmente iniciar "${projectLabel}" também?`;

    return confirmAppDialog(message, {
        title: 'Projeto em execução',
        confirmLabel: 'Continuar mesmo assim',
        variant: 'warning'
    });
}

async function iniciarProjetoTecnico(projectId) {
    if (!projectId) return false;

    const statusId = await getOrderProjetoTecnicoStatusIdByName(ORDER_PT_STATUS_PROJETO_TECNICO);
    if (!statusId) {
        alertAppDialog(`Status "${ORDER_PT_STATUS_PROJETO_TECNICO}" não encontrado.`);
        return false;
    }

    const { data: project, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, orderId, designerId, name, projectCode, deliveryDate, technicalProjectForecastStartDate, technicalProjectForecastEndDate, projectStatus:OrderProjectStatus(name)')
        .eq('id', projectId)
        .maybeSingle();

    if (readError || !project) {
        alertAppDialog('Projeto não encontrado.');
        return false;
    }

    const statusName = project.projectStatus?.name || '—';
    if (statusName !== ORDER_PT_STATUS_AGUARDANDO) {
        alertAppDialog('Este projeto não está mais aguardando projeto técnico.');
        return false;
    }

    if (Number(project.designerId) !== Number(currentUser?.id) && !isAdmin()) {
        alertAppDialog('Somente o responsável do projeto pode iniciá-lo.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    const outrosProjetosEmExecucao = await fetchDesignerProjetoTecnicoEmExecucao(
        project.designerId,
        project.id,
        statusId
    );

    if (!(await confirmIniciarProjetoTecnico(project, outrosProjetosEmExecucao))) {
        return false;
    }

    try {
        setProjetoTecnicoActionLoading(true, 'Iniciando projeto técnico...');
        setProjetoTecnicoTableButtonsDisabled(true);

        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .eq('id', projectId);

        if (error) throw error;

        if (typeof notifyProjetoTecnicoIniciadoEmail === 'function') {
            setProjetoTecnicoActionLoading(true, 'Enviando e-mail de notificação...');
            await notifyProjetoTecnicoIniciadoEmail({
                orderId: project.orderId,
                orderProjectId: project.id,
                designerId: project.designerId,
                technicalProjectForecastStartDate: project.technicalProjectForecastStartDate,
                technicalProjectForecastEndDate: project.technicalProjectForecastEndDate
            });
        }

        setProjetoTecnicoActionLoading(true, 'Atualizando telas...');
        await refreshOrderProjetoTecnicoRelatedViews(project.orderId);

        setProjetoTecnicoActionLoading(true, 'Projeto técnico iniciado!', 'success');
        await waitAppOverlay(APP_OVERLAY_SUCCESS_MS);
        return true;
    } catch (error) {
        setProjetoTecnicoActionLoading(true, `Erro ao iniciar projeto: ${error.message}`, 'error');
        await waitAppOverlay(APP_OVERLAY_ERROR_MS);
        return false;
    } finally {
        setProjetoTecnicoTableButtonsDisabled(false);
        setProjetoTecnicoActionLoading(false);
    }
}

async function loadOrderProjetoTecnicoProjects(orderId) {
    const list = document.getElementById('projeto-tecnico-projects-list');
    if (!list) return;

    const { data: projects, error } = await queryOrderProjetoTecnicoProjects(orderId);

    if (error) {
        console.error('loadOrderProjetoTecnicoProjects:', error);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-6">Erro ao carregar projetos: ${escapeHtml(error.message)}</p>`;
        return;
    }

    const items = projects || [];

    list.innerHTML = renderOrderProjetoTecnicoProjectsTable(items);
    bindOrderProjetoTecnicoTableEvents(list);
}

window.iniciarProjetoTecnico = iniciarProjetoTecnico;
window.loadOrderProjetoTecnicoProjects = loadOrderProjetoTecnicoProjects;
