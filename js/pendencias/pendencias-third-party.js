let pendenciasThirdPartyProjectsCache = [];

function mapPendenciasThirdPartyInteractiveRow(project, extras = {}) {
    return mapPendenciasInteractiveIdentity(project, {
        projectName: project.orderProject?.name || 'Projeto',
        characteristicName: project.projectCharacteristic?.name || '—',
        filePath: project.filePath || '',
        designerName: project.designer?.name || '—',
        project,
        ...extras
    });
}

function renderPendenciasThirdPartyGestorDesignerSelect(project, designers = []) {
    const options = designers.map(designer => `
        <option value="${designer.id}">${escapeHtml(designer.name)}</option>
    `).join('');

    return `
        <select class="pendencias-third-party-designer-select w-full min-w-[10rem] px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
            data-third-party-project-id="${project.id}">
            <option value="">Selecione...</option>
            ${options}
        </select>
    `;
}

function renderPendenciasThirdPartyGestorActionButton(project) {
    return `
        <button type="button"
            class="pendencias-third-party-associar-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-2.5 py-1 rounded-lg font-medium"
            data-third-party-project-id="${project.id}">
            Associar
        </button>
    `;
}

function renderPendenciasThirdPartyProjetistaPathInput(project) {
    const canAct = canActThirdPartyProjectAsProjetista(project);
    const isOpen = project.status === THIRD_PARTY_PROJECT_STATUS_OPEN;
    const pathDisabled = !canAct || !isOpen;

    return `
        <input type="text"
            class="pendencias-third-party-path-input w-full min-w-[12rem] px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-violet-600"
            value="${escapeHtml(project.filePath || '')}"
            placeholder="Caminho do arquivo"
            data-third-party-project-id="${project.id}"
            ${pathDisabled ? 'disabled' : ''}>
    `;
}

function renderPendenciasThirdPartyProjetistaActions(project) {
    const canAct = canActThirdPartyProjectAsProjetista(project);
    const isOpen = project.status === THIRD_PARTY_PROJECT_STATUS_OPEN;
    const isInReview = project.status === THIRD_PARTY_PROJECT_STATUS_IN_REVIEW;

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

    return `<div class="flex flex-wrap gap-1.5">${actionButtons}</div>`;
}

function renderPendenciasThirdPartyConsultorActions(project) {
    const canReview = typeof canReviewThirdPartyProjectAsConsultor === 'function'
        && canReviewThirdPartyProjectAsConsultor(project);
    const canApprove = typeof canApproveThirdPartyProject === 'function'
        && canApproveThirdPartyProject(project);

    return `
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

    const [projects, designers] = await Promise.all([
        fetchThirdPartyProjectsWithoutDesigner(),
        typeof fetchPendenciasActiveProjetistas === 'function'
            ? fetchPendenciasActiveProjetistas()
            : Promise.resolve([])
    ]);

    pendenciasThirdPartyProjectsCache = projects;

    if (!content) return;

    renderPendenciasThirdPartySemProjetistaList(projects, designers);
}

function renderPendenciasThirdPartySemProjetistaList(projects, designers = []) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (projects || []).map(project => mapPendenciasThirdPartyInteractiveRow(project));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Projetos de Terceiros sem Projetista',
        subtitle: 'Associe um projetista responsável por cada projeto de terceiros em aberto.',
        refreshButtonId: 'btn-pendencias-refresh-third-party-sem-projetista',
        onRefresh: loadPendenciasThirdPartySemProjetista,
        tableId: 'pendencias-third-party-sem-projetista',
        rows,
        emptyMessage: 'Nenhum projeto de terceiros aguardando projetista.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns(),
            {
                key: 'characteristicName',
                label: 'Característica',
                cellClass: 'p-3 text-slate-600'
            },
            {
                key: 'designerSelect',
                label: 'Projetista',
                type: 'action',
                thClass: 'min-w-[12rem]',
                cellClass: 'p-3',
                render: (row) => renderPendenciasThirdPartyGestorDesignerSelect(row.project, designers)
            },
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-28',
                cellClass: 'p-3',
                render: (row) => renderPendenciasThirdPartyGestorActionButton(row.project)
            })
        ],
        onBind(tbody) {
            bindPendenciasThirdPartyGestorActions(tbody);
        }
    });
}

async function loadPendenciasThirdPartyProjetista() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos de terceiros...</p>';
    }

    const overviewMode = typeof isPendenciasProjetistaOverviewMode === 'function'
        ? isPendenciasProjetistaOverviewMode()
        : (isAdmin() || (typeof canSeePendenciasGestorProjetosMenu === 'function'
            && canSeePendenciasGestorProjetosMenu()));
    const projects = await fetchThirdPartyProjectsForProjetista(currentUser?.id, {
        includeAll: overviewMode
    });

    pendenciasThirdPartyProjectsCache = projects;

    if (!content) return;

    renderPendenciasThirdPartyProjetistaList(projects, overviewMode);
}

function renderPendenciasThirdPartyProjetistaList(projects, overviewMode = false) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (projects || []).map(project => mapPendenciasThirdPartyInteractiveRow(project));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Projetos de Terceiros',
        subtitle: overviewMode
            ? 'Visão geral dos projetos de terceiros não aprovados.'
            : 'Projetos de terceiros atribuídos a você que ainda não foram aprovados.',
        refreshButtonId: 'btn-pendencias-refresh-third-party-projetista',
        onRefresh: loadPendenciasThirdPartyProjetista,
        tableId: 'pendencias-third-party-projetista',
        rows,
        minWidth: overviewMode ? '860px' : '760px',
        emptyMessage: 'Nenhum projeto de terceiros pendente.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({ includeDesigner: overviewMode }),
            {
                key: 'filePath',
                label: 'Caminho do arquivo',
                type: 'action',
                sortable: true,
                filterable: true,
                thClass: 'min-w-[12rem]',
                cellClass: 'p-3',
                getSortValue: (row) => row.filePath || '',
                getFilterValue: (row) => row.filePath || '',
                render: (row) => renderPendenciasThirdPartyProjetistaPathInput(row.project)
            },
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-44',
                cellClass: 'p-3',
                render: (row) => renderPendenciasThirdPartyProjetistaActions(row.project)
            })
        ],
        onBind(tbody) {
            bindPendenciasThirdPartyProjetistaActions(tbody);
        }
    });
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

    renderPendenciasThirdPartyConsultorList(projects, overviewMode);
}

function renderPendenciasThirdPartyConsultorList(projects, overviewMode = false) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (projects || []).map(project => mapPendenciasThirdPartyInteractiveRow(project, {
        designerName: project.designer?.name || 'Sem projetista',
        filePath: project.filePath || '—'
    }));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Projetos de Terceiros Enviados',
        subtitle: overviewMode
            ? 'Todos os projetos de terceiros enviados aguardando revisão ou aprovação.'
            : 'Projetos de terceiros dos seus pedidos aguardando revisão ou aprovação.',
        refreshButtonId: 'btn-pendencias-refresh-third-party-consultor',
        onRefresh: loadPendenciasThirdPartyConsultor,
        tableId: 'pendencias-third-party-consultor',
        rows,
        minWidth: '860px',
        emptyMessage: 'Nenhum projeto de terceiros enviado pendente.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({ includeDesigner: true }),
            {
                key: 'filePath',
                label: 'Caminho',
                cellClass: 'p-3 text-xs font-mono text-slate-600 break-all'
            },
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-52',
                cellClass: 'p-3',
                render: (row) => renderPendenciasThirdPartyConsultorActions(row.project)
            })
        ],
        onBind(tbody) {
            bindPendenciasThirdPartyConsultorActions(tbody);
        }
    });
}
