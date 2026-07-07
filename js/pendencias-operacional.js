function canAccessPendenciasAguardandoMedicao() {
    return canSeePendenciasGestorComercialMenu();
}

function canEditPendenciasAguardandoMedicaoStatus() {
    return isGestorComercial();
}

async function fetchPendenciasAguardandoMedicaoProjects() {
    const statusIds = await getPendenciasStatusIdsByNames(PENDENCIAS_AGUARDANDO_MEDICAO_LIST_STATUSES);

    if (!statusIds.length) {
        return {
            error: new Error('Status "Vendido" ou "Aguardando Obra" não encontrados.'),
            projects: []
        };
    }

    const result = await queryPendenciasProjects({ statusIds });
    if (result.error) {
        return { error: result.error, projects: [] };
    }

    return {
        error: null,
        projects: sortPendenciasByDeliveryDate(result.data || [])
    };
}

function renderPendenciasAguardandoMedicaoActionButtons(project, canEdit) {
    const statusName = getPendenciasProjectStatusName(project);
    const obraDisabled = !canEdit || statusName === PENDENCIAS_STATUS_AGUARDANDO_OBRA;
    const medicaoDisabled = !canEdit;
    const disabledClass = 'opacity-50 cursor-not-allowed';

    return `
        <div class="flex flex-wrap justify-end gap-1.5">
            <button type="button"
                class="pendencias-status-obra-btn text-xs bg-orange-50 text-orange-800 border border-orange-200 px-2.5 py-1 rounded-lg font-medium ${obraDisabled ? disabledClass : 'hover:bg-orange-100'}"
                data-project-id="${project.id}"
                data-target-status="${escapeHtml(PENDENCIAS_STATUS_AGUARDANDO_OBRA)}"
                ${obraDisabled ? 'disabled' : ''}>
                Aguardando Obra
            </button>
            <button type="button"
                class="pendencias-status-medicao-btn text-xs bg-cyan-50 text-cyan-800 border border-cyan-200 px-2.5 py-1 rounded-lg font-medium ${medicaoDisabled ? disabledClass : 'hover:bg-cyan-100'}"
                data-project-id="${project.id}"
                data-target-status="${escapeHtml(PENDENCIAS_STATUS_AGUARDANDO_MEDICAO)}"
                ${medicaoDisabled ? 'disabled' : ''}>
                Aguardando Medição
            </button>
        </div>
    `;
}

function renderPendenciasAguardandoMedicaoList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canEdit = canEditPendenciasAguardandoMedicaoStatus();
    const subtitle = canEdit
        ? 'Projetos vendidos ou aguardando obra. Altere o status conforme o andamento.'
        : 'Visualização dos projetos vendidos ou aguardando obra.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const statusName = getPendenciasProjectStatusName(project);
        const statusClass = getPendenciasProjectStatusBadgeClass(statusName);

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(statusName || '—')}
                    </span>
                </td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">
                    ${renderPendenciasAguardandoMedicaoActionButtons(project, canEdit)}
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aguardando Medição</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-aguardando-medicao"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[920px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Status</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-56">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto vendido ou aguardando obra.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-aguardando-medicao')
        ?.addEventListener('click', () => loadPendenciasAguardandoMedicao());

    content.querySelectorAll('.pendencias-status-obra-btn:not([disabled]), .pendencias-status-medicao-btn')
        .forEach(button => {
            button.addEventListener('click', () => {
                updatePendenciasAguardandoMedicaoStatus(
                    Number(button.dataset.projectId),
                    button.dataset.targetStatus
                );
            });
        });
}

async function updatePendenciasAguardandoMedicaoStatus(projectId, targetStatusName) {
    if (!canEditPendenciasAguardandoMedicaoStatus()) {
        alert('Sem permissão para alterar status.');
        return;
    }

    if (!projectId || !targetStatusName) return;

    const allowedTargets = [PENDENCIAS_STATUS_AGUARDANDO_OBRA, PENDENCIAS_STATUS_AGUARDANDO_MEDICAO];
    if (!allowedTargets.includes(targetStatusName)) return;

    const { data: rawProject, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, statusId, projectStatus:OrderProjectStatus(id, name)')
        .eq('id', projectId)
        .maybeSingle();

    let project = rawProject;

    if (readError?.message?.includes('projectStatus')) {
        const fallback = await supabaseClient
            .from('OrderProject')
            .select('id, statusId')
            .eq('id', projectId)
            .maybeSingle();

        if (fallback.error || !fallback.data) {
            alert('Projeto não encontrado.');
            return;
        }

        project = (await enrichPendenciasProjectsWithStatus([fallback.data]))[0];
    } else if (readError || !project) {
        alert('Projeto não encontrado.');
        return;
    }

    const currentStatusName = getPendenciasProjectStatusName(project);
    if (!PENDENCIAS_AGUARDANDO_MEDICAO_LIST_STATUSES.includes(currentStatusName)) {
        alert('O status do projeto foi alterado. Atualize a lista.');
        await loadPendenciasAguardandoMedicao();
        return;
    }

    if (targetStatusName === PENDENCIAS_STATUS_AGUARDANDO_OBRA
        && currentStatusName === PENDENCIAS_STATUS_AGUARDANDO_OBRA) {
        return;
    }

    if (currentStatusName === targetStatusName) {
        await loadPendenciasAguardandoMedicao();
        return;
    }

    if (!confirm(`Alterar status do projeto para "${targetStatusName}"?`)) return;

    const statusId = await getPendenciasStatusIdByName(targetStatusName);
    if (!statusId) {
        alert(`Status "${targetStatusName}" não encontrado.`);
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', projectId);

    if (error) {
        alert('Erro ao alterar status: ' + error.message);
        return;
    }

    await loadPendenciasAguardandoMedicao();
}

async function fetchPendenciasProjectsByStatusName(statusName) {
    const statusId = await getPendenciasStatusIdByName(statusName);

    if (!statusId) {
        return {
            error: new Error(`Status "${statusName}" não encontrado.`),
            projects: []
        };
    }

    const result = await queryPendenciasProjects({ statusId });
    if (result.error) {
        return { error: result.error, projects: [] };
    }

    return {
        error: null,
        projects: sortPendenciasByDeliveryDate(result.data || [])
    };
}

function renderPendenciasPpcpProjectList(config) {
    const {
        title,
        subtitle,
        projects,
        emptyMessage,
        refreshButtonId,
        refreshHandler,
        expectedStatusName,
        targetStatusName,
        actionLabel,
        actionButtonClass,
        confirmMessage
    } = config;

    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasPpcpStatus();
    const labelFn = config.projectLabelFn || getPendenciasProjectLabel;
    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = labelFn(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const statusName = getPendenciasProjectStatusName(project);
        const statusClass = getPendenciasProjectStatusBadgeClass(statusName);
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-ppcp-action-btn text-xs px-2.5 py-1 rounded-lg font-medium ${actionButtonClass}"
                data-project-id="${project.id}"
                data-expected-status="${escapeHtml(expectedStatusName)}"
                data-target-status="${escapeHtml(targetStatusName)}"
                data-confirm-message="${escapeHtml(confirmMessage)}">
                ${escapeHtml(actionLabel)}
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(statusName || '—')}
                    </span>
                </td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">${escapeHtml(title)}</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="${refreshButtonId}"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[920px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Status</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-44">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector(`#${refreshButtonId}`)
        ?.addEventListener('click', refreshHandler);

    content.querySelectorAll('.pendencias-ppcp-action-btn').forEach(button => {
        button.addEventListener('click', () => {
            updatePendenciasPpcpProjectStatus(
                Number(button.dataset.projectId),
                button.dataset.expectedStatus,
                button.dataset.targetStatus,
                button.dataset.confirmMessage
            );
        });
    });
}

async function updatePendenciasPpcpProjectStatus(projectId, expectedStatusName, targetStatusName, confirmMessage) {
    if (!canActPendenciasPpcpStatus()) {
        alert('Sem permissão para alterar status.');
        return;
    }

    if (!projectId || !expectedStatusName || !targetStatusName) return;

    const { data: rawProject, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, statusId, projectStatus:OrderProjectStatus(id, name)')
        .eq('id', projectId)
        .maybeSingle();

    let project = rawProject;

    if (readError?.message?.includes('projectStatus')) {
        const fallback = await supabaseClient
            .from('OrderProject')
            .select('id, statusId')
            .eq('id', projectId)
            .maybeSingle();

        if (fallback.error || !fallback.data) {
            alert('Projeto não encontrado.');
            return;
        }

        project = (await enrichPendenciasProjectsWithStatus([fallback.data]))[0];
    } else if (readError || !project) {
        alert('Projeto não encontrado.');
        return;
    }

    const currentStatusName = getPendenciasProjectStatusName(project);
    if (currentStatusName !== expectedStatusName) {
        alert('O status do projeto foi alterado. Atualize a lista.');
        await reloadActivePendenciasPpcpList();
        return;
    }

    if (!confirm(confirmMessage || `Alterar status do projeto para "${targetStatusName}"?`)) return;

    const statusId = await getPendenciasStatusIdByName(targetStatusName);
    if (!statusId) {
        alert(`Status "${targetStatusName}" não encontrado.`);
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', projectId);

    if (error) {
        alert('Erro ao alterar status: ' + error.message);
        return;
    }

    await reloadActivePendenciasPpcpList();
}

async function reloadActivePendenciasPpcpList() {
    if (!pendenciasActiveItem) {
        await loadPendenciasSectionOverview();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'aguardando-ppcp') {
        await loadPendenciasAguardandoPpcp();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'implantacao') {
        await loadPendenciasImplantacao();
    }
}

async function loadPendenciasAguardandoPpcp() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasPpcpItems()) {
        renderPendenciasPlaceholder('Aguardando PPCP', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_AGUARDANDO_PPCP);

    if (error) {
        renderPendenciasPlaceholder('Aguardando PPCP', `Erro ao carregar: ${error.message}`);
        return;
    }

    const subtitle = canActPendenciasPpcpStatus()
        ? 'Projetos aguardando PPCP. Clique em Implantar para enviar à implantação.'
        : 'Visualização dos projetos aguardando PPCP.';

    renderPendenciasPpcpProjectList({
        title: 'Aguardando PPCP',
        subtitle,
        projects,
        emptyMessage: 'Nenhum projeto aguardando PPCP.',
        refreshButtonId: 'btn-pendencias-refresh-aguardando-ppcp',
        refreshHandler: () => loadPendenciasAguardandoPpcp(),
        expectedStatusName: PENDENCIAS_STATUS_AGUARDANDO_PPCP,
        targetStatusName: PENDENCIAS_STATUS_IMPLANTACAO,
        actionLabel: 'Implantar',
        actionButtonClass: 'bg-violet-100 text-violet-800 hover:bg-violet-200',
        confirmMessage: 'Enviar este projeto para implantação?',
        projectLabelFn: project => typeof getPendenciasProjectDetailLabel === 'function'
            ? getPendenciasProjectDetailLabel(project)
            : (project?.name || 'Projeto')
    });
}

async function loadPendenciasImplantacao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasPpcpItems()) {
        renderPendenciasPlaceholder('Implantação', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_IMPLANTACAO);

    if (error) {
        renderPendenciasPlaceholder('Implantação', `Erro ao carregar: ${error.message}`);
        return;
    }

    const subtitle = canActPendenciasPpcpStatus()
        ? 'Projetos em implantação. Finalize a implantação e inicie a produção.'
        : 'Visualização dos projetos em implantação.';

    renderPendenciasPpcpProjectList({
        title: 'Implantação',
        subtitle,
        projects,
        emptyMessage: 'Nenhum projeto em implantação.',
        refreshButtonId: 'btn-pendencias-refresh-implantacao',
        refreshHandler: () => loadPendenciasImplantacao(),
        expectedStatusName: PENDENCIAS_STATUS_IMPLANTACAO,
        targetStatusName: PENDENCIAS_STATUS_EM_PRODUCAO,
        actionLabel: 'Iniciar produção',
        actionButtonClass: 'bg-teal-100 text-teal-800 hover:bg-teal-200',
        confirmMessage: 'Finalizar implantação e iniciar produção deste projeto?',
        projectLabelFn: project => typeof getPendenciasProjectDetailLabel === 'function'
            ? getPendenciasProjectDetailLabel(project)
            : (project?.name || 'Projeto')
    });
}

async function queryPendenciasFabricaProjects(statusId) {
    const buildQuery = (selectColumns) => supabaseClient
        .from('OrderProject')
        .select(selectColumns)
        .eq('statusId', statusId);

    let result = await buildQuery(PENDENCIAS_FABRICA_PROJECT_SELECT);

    if (result.error?.message?.includes('marceneiro')
        || result.error?.message?.includes('MontagemInterna')
        || result.error?.message?.includes('projectStatus')) {
        result = await buildQuery(PENDENCIAS_FABRICA_PROJECT_SELECT_FALLBACK);
    }

    if (result.error) return result;

    const projects = await enrichPendenciasProjectsWithStatus(result.data || []);
    return { ...result, data: projects };
}

async function fetchPendenciasFabricaProjectsByStatusName(statusName) {
    const statusId = await getPendenciasStatusIdByName(statusName);

    if (!statusId) {
        return {
            error: new Error(`Status "${statusName}" não encontrado.`),
            projects: []
        };
    }

    const result = await queryPendenciasFabricaProjects(statusId);
    if (result.error) {
        return { error: result.error, projects: [] };
    }

    return {
        error: null,
        projects: sortPendenciasByDeliveryDate(result.data || [])
    };
}

function getPendenciasFabricaTodayInputDate() {
    if (typeof getTodayInputDate === 'function') {
        return getTodayInputDate();
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getPendenciasFabricaMarceneiroOptionsHtml(selectedId = null) {
    if (typeof getFabricaMarceneiroOptionsHtml === 'function') {
        return getFabricaMarceneiroOptionsHtml(selectedId);
    }

    return '<option value="">Nenhum marceneiro cadastrado</option>';
}

function formatPendenciasFabricaDisplayDate(dateStr) {
    if (typeof formatFabricaDisplayDate === 'function') {
        return formatFabricaDisplayDate(dateStr);
    }

    if (!dateStr) return '—';
    const value = String(dateStr).split('T')[0];
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return '—';
    return `${day}/${month}/${year}`;
}

function getPendenciasFabricaMarceneiroName(project) {
    if (typeof getFabricaMarceneiroName === 'function') {
        return getFabricaMarceneiroName(project);
    }

    return project.marceneiro?.name || '—';
}

function getPendenciasFabricaProjectLabel(project) {
    return typeof getPendenciasProjectDetailLabel === 'function'
        ? getPendenciasProjectDetailLabel(project)
        : (project?.name || 'Projeto');
}

function renderPendenciasAguardandoMontagemInternaList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasGestorFabrica();
    const todayMax = getPendenciasFabricaTodayInputDate();
    const subtitle = canAct
        ? 'Projetos em produção. Registre marceneiro e início da montagem interna.'
        : 'Visualização dos projetos aguardando início da montagem interna.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasFabricaProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const inicioValue = project.inicioMontagemInterna
            ? String(project.inicioMontagemInterna).split('T')[0]
            : '';
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-fabrica-inicio-btn text-xs bg-orange-100 text-orange-800 hover:bg-orange-200 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
                data-project-id="${project.id}">
                Iniciar montagem
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0" data-pendencias-fabrica-project-id="${project.id}">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3">
                    <select class="pendencias-fabrica-marceneiro w-full min-w-[140px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-600"
                        ${canAct ? '' : 'disabled'}>
                        ${getPendenciasFabricaMarceneiroOptionsHtml(project.marceneiroId)}
                    </select>
                </td>
                <td class="p-3">
                    <input type="date" class="pendencias-fabrica-inicio w-full min-w-[130px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-600"
                        max="${todayMax}" value="${escapeHtml(inicioValue)}" ${canAct ? '' : 'disabled'}>
                </td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aguar. Mont. Int.</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-aguardando-montagem-interna"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[980px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-left p-3 font-semibold">Marceneiro</th>
                                <th class="text-left p-3 font-semibold">Início</th>
                                <th class="text-right p-3 font-semibold w-40">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto em produção aguardando montagem interna.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-aguardando-montagem-interna')
        ?.addEventListener('click', () => loadPendenciasAguardandoMontagemInterna());

    content.querySelectorAll('.pendencias-fabrica-inicio-btn').forEach(button => {
        button.addEventListener('click', () => {
            savePendenciasFabricaInicioMontagem(Number(button.dataset.projectId));
        });
    });
}

function renderPendenciasEmMontagemList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasGestorFabrica();
    const todayMax = getPendenciasFabricaTodayInputDate();
    const subtitle = canAct
        ? 'Projetos em montagem interna. Registre a data de fim para enviar à expedição.'
        : 'Visualização dos projetos em montagem interna.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasFabricaProjectLabel(project);
        const marceneiroName = getPendenciasFabricaMarceneiroName(project);
        const inicioDisplay = formatPendenciasFabricaDisplayDate(project.inicioMontagemInterna);
        const fimValue = project.fimMontagemInterna
            ? String(project.fimMontagemInterna).split('T')[0]
            : '';
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-fabrica-fim-btn text-xs bg-amber-100 text-amber-800 hover:bg-amber-200 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
                data-project-id="${project.id}">
                Finalizar montagem
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0" data-pendencias-fabrica-project-id="${project.id}">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(marceneiroName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(inicioDisplay)}</td>
                <td class="p-3">
                    <input type="date" class="pendencias-fabrica-fim w-full min-w-[130px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600"
                        max="${todayMax}" value="${escapeHtml(fimValue)}" ${canAct ? '' : 'disabled'}>
                </td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Em Montagem</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-em-montagem"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[980px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Marceneiro</th>
                                <th class="text-left p-3 font-semibold">Início</th>
                                <th class="text-left p-3 font-semibold">Fim</th>
                                <th class="text-right p-3 font-semibold w-40">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto em montagem interna.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-em-montagem')
        ?.addEventListener('click', () => loadPendenciasEmMontagem());

    content.querySelectorAll('.pendencias-fabrica-fim-btn').forEach(button => {
        button.addEventListener('click', () => {
            savePendenciasFabricaFimMontagem(Number(button.dataset.projectId));
        });
    });
}

async function savePendenciasFabricaInicioMontagem(projectId) {
    if (!canActPendenciasGestorFabrica()) {
        alert('Sem permissão para registrar montagem.');
        return;
    }

    const row = document.querySelector(`tr[data-pendencias-fabrica-project-id="${projectId}"]`);
    if (!row) return;

    const marceneiroId = row.querySelector('.pendencias-fabrica-marceneiro')?.value;
    const inicioMontagemInterna = row.querySelector('.pendencias-fabrica-inicio')?.value;
    const projectLabel = row.querySelector('td:nth-child(3)')?.textContent?.trim() || 'Projeto';

    if (!marceneiroId) {
        alert(`"${projectLabel}": selecione o marceneiro responsável.`);
        return;
    }
    if (!inicioMontagemInterna) {
        alert(`"${projectLabel}": informe a data de início da montagem interna.`);
        return;
    }
    if (typeof isFabricaDateInFuture === 'function' && isFabricaDateInFuture(inicioMontagemInterna)) {
        alert(`"${projectLabel}": a data de início não pode ser no futuro.`);
        return;
    }

    if (!confirm(`Registrar início da montagem interna de "${projectLabel}"?`)) return;

    const montagemInternaStatusId = typeof getMontagemInternaProjectStatusId === 'function'
        ? await getMontagemInternaProjectStatusId()
        : await getPendenciasStatusIdByName(PENDENCIAS_STATUS_MONTAGEM_INTERNA);

    if (!montagemInternaStatusId) {
        alert(`Status "${PENDENCIAS_STATUS_MONTAGEM_INTERNA}" não encontrado.`);
        return;
    }

    try {
        if (typeof persistFabricaInicioProject === 'function') {
            await persistFabricaInicioProject({
                projectId,
                marceneiroId: Number(marceneiroId),
                inicioMontagemInterna,
                label: projectLabel
            }, montagemInternaStatusId);
        } else {
            const now = new Date().toISOString();
            const { error } = await supabaseClient
                .from('OrderProject')
                .update({
                    marceneiroId: Number(marceneiroId),
                    inicioMontagemInterna,
                    statusId: montagemInternaStatusId,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', projectId);

            if (error) throw new Error(error.message);
        }

        await reloadActivePendenciasGestorFabricaList();
        if (activeOrderId && typeof loadFabricaProjects === 'function') {
            await loadFabricaProjects(activeOrderId);
        }
    } catch (error) {
        const sqlHint = error.message?.includes('marceneiroId') || error.message?.includes('MontagemInterna')
            ? '\n\nExecute supabase/add-order-project-montagem-fields.sql no Supabase.'
            : '';
        alert('Erro ao salvar: ' + error.message + sqlHint);
    }
}

async function savePendenciasFabricaFimMontagem(projectId) {
    if (!canActPendenciasGestorFabrica()) {
        alert('Sem permissão para registrar montagem.');
        return;
    }

    const row = document.querySelector(`tr[data-pendencias-fabrica-project-id="${projectId}"]`);
    if (!row) return;

    const fimMontagemInterna = row.querySelector('.pendencias-fabrica-fim')?.value;
    const projectLabel = row.querySelector('td:nth-child(3)')?.textContent?.trim() || 'Projeto';

    if (!fimMontagemInterna) {
        alert(`"${projectLabel}": informe a data de fim da montagem interna.`);
        return;
    }
    if (typeof isFabricaDateInFuture === 'function' && isFabricaDateInFuture(fimMontagemInterna)) {
        alert(`"${projectLabel}": a data de fim não pode ser no futuro.`);
        return;
    }

    if (!confirm(`Finalizar montagem interna de "${projectLabel}" e enviar à expedição?`)) return;

    const expedicaoStatusId = typeof getExpedicaoProjectStatusId === 'function'
        ? await getExpedicaoProjectStatusId()
        : await getPendenciasStatusIdByName(PENDENCIAS_STATUS_EXPEDICAO);

    if (!expedicaoStatusId) {
        alert(`Status "${PENDENCIAS_STATUS_EXPEDICAO}" não encontrado.`);
        return;
    }

    try {
        if (typeof persistFabricaFimProject === 'function') {
            await persistFabricaFimProject({
                projectId,
                fimMontagemInterna,
                label: projectLabel
            }, expedicaoStatusId);
        } else {
            const now = new Date().toISOString();
            const { error } = await supabaseClient
                .from('OrderProject')
                .update({
                    fimMontagemInterna,
                    statusId: expedicaoStatusId,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', projectId);

            if (error) throw new Error(error.message);
        }

        await reloadActivePendenciasGestorFabricaList();
        if (activeOrderId && typeof loadFabricaProjects === 'function') {
            await loadFabricaProjects(activeOrderId);
        }
    } catch (error) {
        const sqlHint = error.message?.includes('fimMontagemInterna')
            ? '\n\nExecute supabase/add-order-project-montagem-fields.sql no Supabase.'
            : '';
        alert('Erro ao salvar: ' + error.message + sqlHint);
    }
}

async function reloadActivePendenciasGestorFabricaList() {
    if (!pendenciasActiveItem) {
        await loadPendenciasSectionOverview();
        return;
    }

    if (pendenciasActiveSection === 'gestor-fabrica' && pendenciasActiveItem === 'aguardando-montagem-interna') {
        await loadPendenciasAguardandoMontagemInterna();
        return;
    }

    if (pendenciasActiveSection === 'gestor-fabrica' && pendenciasActiveItem === 'em-montagem') {
        await loadPendenciasEmMontagem();
    }
}

async function loadPendenciasAguardandoMontagemInterna() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasGestorFabricaMenu()) {
        renderPendenciasPlaceholder('Aguar. Mont. Int.', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    if (typeof loadFabricaMarceneiros === 'function') {
        await loadFabricaMarceneiros();
    }

    const { error, projects } = await fetchPendenciasFabricaProjectsByStatusName(PENDENCIAS_STATUS_EM_PRODUCAO);

    if (error) {
        renderPendenciasPlaceholder('Aguar. Mont. Int.', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasAguardandoMontagemInternaList(projects);
}

async function loadPendenciasEmMontagem() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasGestorFabricaMenu()) {
        renderPendenciasPlaceholder('Em Montagem', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    if (typeof loadFabricaMarceneiros === 'function') {
        await loadFabricaMarceneiros();
    }

    const { error, projects } = await fetchPendenciasFabricaProjectsByStatusName(PENDENCIAS_STATUS_MONTAGEM_INTERNA);

    if (error) {
        renderPendenciasPlaceholder('Em Montagem', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEmMontagemList(projects);
}

