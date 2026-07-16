const ORDER_PT_STATUS_AGUARDANDO = 'Aguardando Projeto Técnico';
const ORDER_PT_STATUS_PROJETO_TECNICO = 'Projeto Técnico';

const ORDER_PROJETO_TECNICO_PROJECT_SELECT = `
    id, orderId, projectCode, name, designerId, statusId, deliveryDate, previsaoConclusaoProjetoTecnico,
    projectStatus:OrderProjectStatus(id, name),
    designer:appUsers!OrderProject_designerId_fkey(id, name)
`;

const ORDER_PROJETO_TECNICO_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, designerId, statusId, deliveryDate, previsaoConclusaoProjetoTecnico
`;

function formatOrderProjetoTecnicoDate(dateStr) {
    if (!dateStr) return '—';
    const normalized = String(dateStr).slice(0, 10);
    const [year, month, day] = normalized.split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return new Date(dateStr).toLocaleDateString('pt-BR');
}

function getOrderProjetoTecnicoPrevisaoInputMaxDate(deliveryDate) {
    if (!deliveryDate) return '';
    return String(deliveryDate).slice(0, 10);
}

function getOrderProjetoTecnicoPrevisaoInputValue(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).slice(0, 10);
}

function validateOrderProjetoTecnicoPrevisao(previsaoDate, deliveryDate) {
    if (!previsaoDate) {
        alertAppDialog('Informe a previsão de conclusão do projeto técnico.');
        return false;
    }
    if (!isPrevisaoConclusaoProjetoTecnicoValid(previsaoDate, deliveryDate)) {
        alertAppDialog(
            'A previsão de conclusão deve ser anterior ou igual à data de entrega do projeto técnico.',
            { variant: 'warning', title: 'Aviso' }
        );
        return false;
    }
    return true;
}

function getOrderProjetoTecnicoStatusName(project) {
    return project?.projectStatus?.name || getOrderProjectStatusName(project) || '—';
}

function isProjetoTecnicoOrderTabVisible() {
    const panel = document.getElementById('order-tab-panel-projeto-tecnico');
    return Boolean(panel && !panel.classList.contains('hidden'));
}

function isPendenciasViewVisibleForProjetoTecnico() {
    const view = document.getElementById('pendencias-view');
    return Boolean(view && !view.classList.contains('hidden'));
}

function waitProjetoTecnicoStatus(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function setProjetoTecnicoTabActionLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('projeto-tecnico-tab-action-loading');
    const messageEl = document.getElementById('projeto-tecnico-tab-action-loading-msg');
    const spinner = document.getElementById('projeto-tecnico-tab-action-loading-spinner');
    const successIcon = document.getElementById('projeto-tecnico-tab-action-loading-success');
    const errorIcon = document.getElementById('projeto-tecnico-tab-action-loading-error');
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

function setProjetoTecnicoTableButtonsDisabled(disabled) {
    const root = document.getElementById('projeto-tecnico-projects-list');
    root?.querySelectorAll('.order-pt-iniciar-btn, .order-pt-associar-btn').forEach(button => {
        button.disabled = disabled;
        button.classList.toggle('opacity-60', disabled);
        button.classList.toggle('cursor-not-allowed', disabled);
    });
}

function isOrderProjectsPanelVisible() {
    const content = document.getElementById('order-content');
    return Boolean(content && !content.classList.contains('hidden'));
}

function setOrderProjectsActionLoading(active, message = 'Processando...', status = 'loading') {
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

function setProjetoTecnicoActionLoading(active, message = 'Processando...', status = 'loading') {
    if (isPendenciasViewVisibleForProjetoTecnico() && typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(active, message, status);
        return;
    }

    if (isProjetoTecnicoOrderTabVisible()) {
        setProjetoTecnicoTabActionLoading(active, message, status);
        return;
    }

    if (isOrderProjectsPanelVisible()) {
        setOrderProjectsActionLoading(active, message, status);
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

    if (result.error?.message?.includes('previsaoConclusaoProjetoTecnico')
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

function canAssociarOrderProjetoTecnicoAMim(project) {
    if (!canActOrderDetailTab('projeto-tecnico')) return false;
    if (!project) return false;
    if (getOrderProjetoTecnicoStatusName(project) !== ORDER_PT_STATUS_AGUARDANDO) return false;
    if (project.designerId) return false;
    return currentUser?.role === 'Projetista' || isAdmin();
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

function renderOrderProjetoTecnicoPrevisaoInput(project) {
    const maxDate = getOrderProjetoTecnicoPrevisaoInputMaxDate(project.deliveryDate);
    return `<input type="date"
        class="order-pt-previsao-input w-full min-w-[9rem] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-600"
        data-project-id="${project.id}"
        ${maxDate ? `max="${escapeHtml(maxDate)}"` : ''}
        title="Previsão de conclusão do projeto técnico">`;
}

function renderOrderProjetoTecnicoActionCell(project) {
    if (canAssociarOrderProjetoTecnicoAMim(project)) {
        return `<button type="button"
            class="order-pt-associar-btn text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
            data-project-id="${project.id}"
            data-delivery-date="${escapeHtml(getOrderProjetoTecnicoPrevisaoInputMaxDate(project.deliveryDate))}">
            Associar a mim
        </button>`;
    }

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
    if (canAssociarOrderProjetoTecnicoAMim(project)) {
        return renderOrderProjetoTecnicoPrevisaoInput(project);
    }

    return `<span class="text-xs text-slate-600 whitespace-nowrap">${escapeHtml(formatOrderProjetoTecnicoDate(project.previsaoConclusaoProjetoTecnico))}</span>`;
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
                        <th class="text-left p-3 font-semibold min-w-[9.5rem]">Previsão</th>
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

    root.querySelectorAll('.order-pt-associar-btn').forEach(button => {
        button.addEventListener('click', () => {
            const row = button.closest('tr');
            const previsaoDate = row?.querySelector('.order-pt-previsao-input')?.value || '';
            associarProjetoTecnicoAMim(
                Number(button.dataset.projectId),
                previsaoDate,
                button.dataset.deliveryDate || ''
            );
        });
    });

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
        .select('id, name, projectCode, order:salesOrders(orderCode, clientName)')
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
    const clientName = project.order?.clientName || '—';
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

async function associarProjetoTecnicoAMim(projectId, previsaoDate, deliveryDate = '') {
    if (!projectId || (currentUser?.role !== 'Projetista' && !isAdmin())) {
        alertAppDialog('Somente Projetista pode associar projetos.', { variant: 'warning', title: 'Aviso' });
        return false;
    }

    if (!validateOrderProjetoTecnicoPrevisao(previsaoDate, deliveryDate)) {
        return false;
    }

    if (!(await confirmAppDialog('Associar este projeto a você como responsável?'))) {
        return false;
    }

    const now = new Date().toISOString();
    const payload = {
        designerId: currentUser.id,
        previsaoConclusaoProjetoTecnico: previsaoDate,
        updatedById: currentUser.id,
        updatedAt: now
    };

    try {
        let { error } = await supabaseClient
            .from('OrderProject')
            .update(payload)
            .eq('id', projectId);

        if (error?.message?.includes('previsaoConclusaoProjetoTecnico')) {
            ({ error } = await supabaseClient
                .from('OrderProject')
                .update({
                    designerId: currentUser.id,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', projectId));
            if (!error) {
                alertAppDialog(
                    'Projeto associado, mas o campo de previsão ainda não existe no banco. Execute supabase/create-order-project-previsao-conclusao.sql no Supabase.',
                    { variant: 'warning', title: 'Aviso' }
                );
            }
        }

        if (error) {
            alertAppDialog('Erro ao associar projeto: ' + error.message);
            return false;
        }

        const { data: projectMeta } = await supabaseClient
            .from('OrderProject')
            .select('orderId')
            .eq('id', projectId)
            .maybeSingle();

        await refreshOrderProjetoTecnicoRelatedViews(projectMeta?.orderId || activeOrderId);
        return true;
    } catch (err) {
        alertAppDialog('Erro ao associar projeto: ' + err.message);
        return false;
    }
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
        .select('id, orderId, designerId, name, projectCode, deliveryDate, previsaoConclusaoProjetoTecnico, projectStatus:OrderProjectStatus(name)')
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
                previsaoConclusaoProjetoTecnico: project.previsaoConclusaoProjetoTecnico
            });
        }

        setProjetoTecnicoActionLoading(true, 'Atualizando telas...');
        await refreshOrderProjetoTecnicoRelatedViews(project.orderId);

        setProjetoTecnicoActionLoading(true, 'Projeto técnico iniciado!', 'success');
        await waitProjetoTecnicoStatus(900);
        return true;
    } catch (error) {
        setProjetoTecnicoActionLoading(true, `Erro ao iniciar projeto: ${error.message}`, 'error');
        await waitProjetoTecnicoStatus(2200);
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

window.associarProjetoTecnicoAMim = associarProjetoTecnicoAMim;
window.iniciarProjetoTecnico = iniciarProjetoTecnico;
window.loadOrderProjetoTecnicoProjects = loadOrderProjetoTecnicoProjects;
