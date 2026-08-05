let pendenciasThirdPartyProjectsCache = [];

function renderPendenciasThirdPartyProjectMeta(project) {
    const orderCode = project.order?.orderCode || '—';
    const clientName = project.order?.clientName || '—';
    const projectName = project.orderProject?.name || 'Projeto';
    const subtypeName = project.thirdPartySubtype?.name || '—';
    const statusLabel = getThirdPartyProjectStatusLabel(project.status);
    const statusClass = getThirdPartyProjectStatusBadgeClass(project.status);

    return `
        <div class="min-w-0">
            <p class="text-[10px] text-slate-500 truncate">${escapeHtml(orderCode)} · ${escapeHtml(clientName)}</p>
            <p class="text-xs font-medium text-slate-800 truncate">${escapeHtml(projectName)} · ${escapeHtml(subtypeName)}</p>
            <span class="inline-flex mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">
                ${escapeHtml(statusLabel)}
            </span>
        </div>
    `;
}

function renderPendenciasThirdPartyGestorRow(project, projetistas = []) {
    const options = projetistas.map(projetista => `
        <option value="${projetista.id}">${escapeHtml(projetista.name)}</option>
    `).join('');

    return `
        <tr data-third-party-project-id="${project.id}">
            <td class="p-3">${renderPendenciasThirdPartyProjectMeta(project)}</td>
            <td class="p-3 text-slate-600">${escapeHtml(project.projectCharacteristic?.name || '—')}</td>
            <td class="p-3">
                <select class="pendencias-third-party-designer-select w-full min-w-[10rem] px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
                    data-third-party-project-id="${project.id}">
                    <option value="">Selecione...</option>
                    ${options}
                </select>
            </td>
            <td class="p-3">
                <button type="button"
                    class="pendencias-third-party-associar-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-2.5 py-1 rounded-lg font-medium"
                    data-third-party-project-id="${project.id}">
                    Associar
                </button>
            </td>
        </tr>
    `;
}

function renderPendenciasThirdPartyProjetistaRow(project) {
    const canAct = canActThirdPartyProjectAsProjetista(project);
    const isOpen = project.status === THIRD_PARTY_PROJECT_STATUS_OPEN;
    const isInReview = project.status === THIRD_PARTY_PROJECT_STATUS_IN_REVIEW;
    const pathDisabled = !canAct || !isOpen;

    let actionButtons = '';
    if (canAct && isOpen) {
        actionButtons = `
            <button type="button"
                class="pendencias-third-party-save-path-btn text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium"
                data-third-party-project-id="${project.id}">
                Salvar caminho
            </button>
            <button type="button"
                class="pendencias-third-party-send-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-2.5 py-1 rounded-lg font-medium"
                data-third-party-project-id="${project.id}">
                Enviar
            </button>
        `;
    } else if (canAct && isInReview) {
        actionButtons = `
            <button type="button"
                class="pendencias-third-party-revision-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-2.5 py-1 rounded-lg font-medium"
                data-third-party-project-id="${project.id}">
                Revisar
            </button>
        `;
    } else {
        actionButtons = `
            <button type="button"
                class="pendencias-third-party-history-btn text-xs bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-2.5 py-1 rounded-lg font-medium"
                data-third-party-project-id="${project.id}">
                Histórico
            </button>
        `;
    }

    return `
        <tr data-third-party-project-id="${project.id}">
            <td class="p-3">${renderPendenciasThirdPartyProjectMeta(project)}</td>
            <td class="p-3">
                <input type="text"
                    class="pendencias-third-party-path-input w-full min-w-[12rem] px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-violet-600"
                    value="${escapeHtml(project.filePath || '')}"
                    placeholder="Caminho do arquivo"
                    data-third-party-project-id="${project.id}"
                    ${pathDisabled ? 'disabled' : ''}>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    ${actionButtons}
                </div>
            </td>
        </tr>
    `;
}

function renderPendenciasThirdPartyConsultorRow(project) {
    const canReview = typeof canReviewThirdPartyProjectAsConsultor === 'function'
        && canReviewThirdPartyProjectAsConsultor(project);
    const canApprove = typeof canApproveThirdPartyProject === 'function'
        && canApproveThirdPartyProject(project);

    return `
        <tr data-third-party-project-id="${project.id}">
            <td class="p-3">${renderPendenciasThirdPartyProjectMeta(project)}</td>
            <td class="p-3 text-slate-600">${escapeHtml(project.designer?.name || 'Sem projetista')}</td>
            <td class="p-3 text-xs font-mono text-slate-600 break-all">${escapeHtml(project.filePath || '—')}</td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    ${canReview ? `
                        <button type="button"
                            class="pendencias-third-party-consultor-review-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-2.5 py-1 rounded-lg font-medium"
                            data-third-party-project-id="${project.id}">
                            Revisar
                        </button>
                    ` : ''}
                    ${canApprove ? `
                        <button type="button"
                            class="pendencias-third-party-approve-btn text-xs bg-emerald-700 text-white hover:bg-emerald-800 px-2.5 py-1 rounded-lg font-medium"
                            data-third-party-project-id="${project.id}">
                            Aprovar
                        </button>
                    ` : ''}
                    <button type="button"
                        class="pendencias-third-party-revisions-history-btn text-xs bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-2.5 py-1 rounded-lg font-medium"
                        data-third-party-project-id="${project.id}">
                        Revisões
                    </button>
                    <button type="button"
                        class="pendencias-third-party-history-btn text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium"
                        data-third-party-project-id="${project.id}">
                        Histórico
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function bindPendenciasThirdPartyGestorActions(content) {
    content.querySelectorAll('.pendencias-third-party-associar-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const projectId = Number(button.dataset.thirdPartyProjectId);
            const row = button.closest('tr');
            const designerId = Number(row?.querySelector('.pendencias-third-party-designer-select')?.value);
            await associarPendenciaThirdPartyProjectProjetista(projectId, designerId);
        });
    });
}

function bindPendenciasThirdPartyProjetistaActions(content) {
    content.querySelectorAll('.pendencias-third-party-save-path-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const projectId = Number(button.dataset.thirdPartyProjectId);
            const row = button.closest('tr');
            const filePath = row?.querySelector('.pendencias-third-party-path-input')?.value || '';
            await salvarPendenciaThirdPartyProjectPath(projectId, filePath);
        });
    });

    content.querySelectorAll('.pendencias-third-party-send-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const projectId = Number(button.dataset.thirdPartyProjectId);
            const row = button.closest('tr');
            const filePath = row?.querySelector('.pendencias-third-party-path-input')?.value || '';
            await enviarPendenciaThirdPartyProject(projectId, filePath);
        });
    });

    content.querySelectorAll('.pendencias-third-party-history-btn').forEach(button => {
        button.addEventListener('click', () => {
            const projectId = Number(button.dataset.thirdPartyProjectId);
            const project = pendenciasThirdPartyProjectsCache.find(item => Number(item.id) === projectId);
            if (project) openThirdPartyProjectStatusHistoryModal(project);
        });
    });

    content.querySelectorAll('.pendencias-third-party-revision-btn').forEach(button => {
        button.addEventListener('click', () => {
            openThirdPartyProjectRevisionModal(Number(button.dataset.thirdPartyProjectId));
        });
    });
}

function bindPendenciasThirdPartyConsultorActions(content) {
    content.querySelectorAll('.pendencias-third-party-consultor-review-btn').forEach(button => {
        button.addEventListener('click', () => {
            openThirdPartyProjectRevisionModal(Number(button.dataset.thirdPartyProjectId));
        });
    });

    content.querySelectorAll('.pendencias-third-party-approve-btn').forEach(button => {
        button.addEventListener('click', () => {
            approveThirdPartyProject(Number(button.dataset.thirdPartyProjectId));
        });
    });

    content.querySelectorAll('.pendencias-third-party-revisions-history-btn').forEach(button => {
        button.addEventListener('click', () => {
            openThirdPartyRevisionsHistoryModal(Number(button.dataset.thirdPartyProjectId));
        });
    });

    content.querySelectorAll('.pendencias-third-party-history-btn').forEach(button => {
        button.addEventListener('click', () => {
            const projectId = Number(button.dataset.thirdPartyProjectId);
            const project = pendenciasThirdPartyProjectsCache.find(item => Number(item.id) === projectId);
            if (project) openThirdPartyProjectStatusHistoryModal(project);
        });
    });
}

async function associarPendenciaThirdPartyProjectProjetista(thirdPartyProjectId, designerId) {
    if (!canAssignThirdPartyProjectDesigner()) {
        alertAppDialog('Somente Gestor de Projetos pode associar responsáveis.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!thirdPartyProjectId || !designerId) {
        alertAppDialog('Selecione um projetista.');
        return;
    }

    const projetista = pendenciasProjetistasCache.find(item => Number(item.id) === Number(designerId));
    if (!projetista) {
        alertAppDialog('Projetista inválido.');
        return;
    }

    if (!(await confirmAppDialog(`Associar este projeto de terceiros a ${projetista.name}?`))) return;

    try {
        setPendenciasActionLoading(true, 'Associando projetista...');
        await assignThirdPartyProjectDesigner(thirdPartyProjectId, designerId);
        await loadPendenciasThirdPartySemProjetista();
    } catch (error) {
        alertAppDialog('Erro ao associar projetista: ' + error.message);
    } finally {
        setPendenciasActionLoading(false);
    }
}

async function salvarPendenciaThirdPartyProjectPath(thirdPartyProjectId, filePath) {
    const project = pendenciasThirdPartyProjectsCache.find(item => Number(item.id) === Number(thirdPartyProjectId));
    if (!canActThirdPartyProjectAsProjetista(project)) {
        alertAppDialog('Você não tem permissão para editar este projeto.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    try {
        setPendenciasActionLoading(true, 'Salvando caminho...');
        await saveThirdPartyProjectFilePath(thirdPartyProjectId, filePath);
        await loadPendenciasThirdPartyProjetista();
    } catch (error) {
        alertAppDialog('Erro ao salvar caminho: ' + error.message);
    } finally {
        setPendenciasActionLoading(false);
    }
}

async function enviarPendenciaThirdPartyProject(thirdPartyProjectId, filePath) {
    const project = pendenciasThirdPartyProjectsCache.find(item => Number(item.id) === Number(thirdPartyProjectId));
    if (!canActThirdPartyProjectAsProjetista(project)) {
        alertAppDialog('Você não tem permissão para enviar este projeto.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!(await confirmAppDialog('Enviar este projeto de terceiros para revisão do consultor?'))) return;

    try {
        setPendenciasActionLoading(true, 'Enviando projeto...');
        if (filePath && filePath !== project.filePath) {
            await saveThirdPartyProjectFilePath(thirdPartyProjectId, filePath);
        }
        await sendThirdPartyProject(thirdPartyProjectId);
        await loadPendenciasThirdPartyProjetista();
    } catch (error) {
        alertAppDialog('Erro ao enviar projeto: ' + error.message);
    } finally {
        setPendenciasActionLoading(false);
    }
}

async function loadPendenciasThirdPartySemProjetista() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos de terceiros...</p>';
    }

    const [projects, projetistas] = await Promise.all([
        fetchThirdPartyProjectsWithoutDesigner(),
        typeof fetchPendenciasActiveProjetistas === 'function'
            ? fetchPendenciasActiveProjetistas()
            : Promise.resolve([])
    ]);

    pendenciasThirdPartyProjectsCache = projects;

    if (!content) return;

    const rows = projects.map(project => renderPendenciasThirdPartyGestorRow(project, projetistas)).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Projetos de Terceiros sem Projetista</h3>
                    <p class="text-xs text-slate-400 mt-0.5">Associe um projetista responsável por cada projeto de terceiros em aberto.</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-third-party-sem-projetista"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${typeof renderRefreshButtonInnerHtml === 'function' ? renderRefreshButtonInnerHtml() : 'Atualizar'}
                </button>
            </div>
            ${projects.length ? `
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Característica</th>
                                <th class="text-left p-3 font-semibold min-w-[12rem]">Projetista</th>
                                <th class="text-left p-3 font-semibold w-28">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">${rows}</tbody>
                    </table>
                </div>
            ` : '<p class="text-xs text-slate-400 text-center py-10 px-4">Nenhum projeto de terceiros aguardando projetista.</p>'}
        </div>
    `;

    bindPendenciasThirdPartyGestorActions(content);
    document.getElementById('btn-pendencias-refresh-third-party-sem-projetista')
        ?.addEventListener('click', loadPendenciasThirdPartySemProjetista);
}

async function loadPendenciasThirdPartyProjetista() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos de terceiros...</p>';
    }

    const overviewMode = isAdmin() || (typeof canSeePendenciasGestorProjetosMenu === 'function'
        && canSeePendenciasGestorProjetosMenu());
    const projects = await fetchThirdPartyProjectsForProjetista(currentUser?.id, {
        includeAll: overviewMode
    });

    pendenciasThirdPartyProjectsCache = projects;

    if (!content) return;

    const rows = projects.map(renderPendenciasThirdPartyProjetistaRow).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Projetos de Terceiros</h3>
                    <p class="text-xs text-slate-400 mt-0.5">
                        ${overviewMode
                            ? 'Visão geral dos projetos de terceiros não aprovados.'
                            : 'Projetos de terceiros atribuídos a você que ainda não foram aprovados.'}
                    </p>
                </div>
                <button type="button" id="btn-pendencias-refresh-third-party-projetista"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${typeof renderRefreshButtonInnerHtml === 'function' ? renderRefreshButtonInnerHtml() : 'Atualizar'}
                </button>
            </div>
            ${projects.length ? `
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold min-w-[12rem]">Caminho do arquivo</th>
                                <th class="text-left p-3 font-semibold w-44">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">${rows}</tbody>
                    </table>
                </div>
            ` : '<p class="text-xs text-slate-400 text-center py-10 px-4">Nenhum projeto de terceiros pendente.</p>'}
        </div>
    `;

    bindPendenciasThirdPartyProjetistaActions(content);
    document.getElementById('btn-pendencias-refresh-third-party-projetista')
        ?.addEventListener('click', loadPendenciasThirdPartyProjetista);
}

async function loadPendenciasThirdPartyConsultor() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos de terceiros...</p>';
    }

    const overviewMode = typeof isPendenciasConsultorConferenciaOverviewMode === 'function'
        ? isPendenciasConsultorConferenciaOverviewMode()
        : isAdmin();
    const projects = await fetchThirdPartyProjectsSentForConsultor({ overviewMode });
    pendenciasThirdPartyProjectsCache = projects;

    if (!content) return;

    const rows = projects.map(renderPendenciasThirdPartyConsultorRow).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Projetos de Terceiros Enviados</h3>
                    <p class="text-xs text-slate-400 mt-0.5">
                        ${overviewMode
                            ? 'Todos os projetos de terceiros enviados aguardando revisão ou aprovação.'
                            : 'Projetos de terceiros dos seus pedidos aguardando revisão ou aprovação.'}
                    </p>
                </div>
                <button type="button" id="btn-pendencias-refresh-third-party-consultor"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${typeof renderRefreshButtonInnerHtml === 'function' ? renderRefreshButtonInnerHtml() : 'Atualizar'}
                </button>
            </div>
            ${projects.length ? `
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Projetista</th>
                                <th class="text-left p-3 font-semibold min-w-[12rem]">Caminho</th>
                                <th class="text-left p-3 font-semibold w-52">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">${rows}</tbody>
                    </table>
                </div>
            ` : '<p class="text-xs text-slate-400 text-center py-10 px-4">Nenhum projeto de terceiros enviado pendente.</p>'}
        </div>
    `;

    bindPendenciasThirdPartyConsultorActions(content);
    document.getElementById('btn-pendencias-refresh-third-party-consultor')
        ?.addEventListener('click', loadPendenciasThirdPartyConsultor);
}
