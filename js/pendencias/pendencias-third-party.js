let pendenciasThirdPartyProjectsCache = [];
let pendenciasThirdPartySemProjetistaRowsCache = [];

function filterPendenciasThirdPartyForProjetista(projects = []) {
    return projects.filter(project =>
        project.status === THIRD_PARTY_PROJECT_STATUS_OPEN
        || project.status === THIRD_PARTY_PROJECT_STATUS_IN_REVIEW
    );
}

function mapPendenciasThirdPartyInteractiveRow(project, extras = {}) {
    return mapPendenciasInteractiveIdentity(project, {
        projectName: project.orderProject?.name || 'Projeto',
        characteristicName: project.projectCharacteristic?.name || '—',
        subtypeName: project.thirdPartySubtype?.name || '—',
        designerName: project.designer?.name || '—',
        project,
        ...extras
    });
}

function renderPendenciasThirdPartyDetailButton(project) {
    return `
        <button type="button"
            class="pendencias-third-party-detail-btn text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium"
            data-third-party-project-id="${project.id}">
            Detalhes
        </button>
    `;
}

function bindPendenciasThirdPartyDetailActions(content) {
    content.querySelectorAll('.pendencias-third-party-detail-btn').forEach(button => {
        button.addEventListener('click', () => {
            const projectId = Number(button.dataset.thirdPartyProjectId);
            const project = pendenciasThirdPartyProjectsCache.find(item => Number(item.id) === projectId);
            if (project && typeof openThirdPartyProjectDetailModal === 'function') {
                openThirdPartyProjectDetailModal(project);
            }
        });
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

function getPendenciasThirdPartySemProjetistaTableElement() {
    return document.querySelector('table[data-table-id="pendencias-third-party-sem-projetista"]');
}

function collectPendenciasThirdPartySemProjetistaSelectionsFromDom() {
    const table = getPendenciasThirdPartySemProjetistaTableElement();
    if (!table) return [];

    const selections = [];

    table.querySelectorAll('tbody tr').forEach(row => {
        const select = row.querySelector('.pendencias-third-party-designer-select');
        const designerId = Number(select?.value);
        if (!designerId) return;

        const thirdPartyProjectId = Number(select?.dataset.thirdPartyProjectId);
        if (!thirdPartyProjectId) return;

        const cached = pendenciasThirdPartySemProjetistaRowsCache.find(item => Number(item.thirdPartyProjectId) === thirdPartyProjectId);

        selections.push({
            thirdPartyProjectId,
            designerId,
            orderCode: cached?.orderCode || '—',
            projectName: cached?.projectName || '—',
            projetistaName: pendenciasProjetistasCache.find(item => Number(item.id) === designerId)?.name || '—'
        });
    });

    return selections;
}

function setPendenciasThirdPartySemProjetistaSaveButtonState(button, state = 'idle', pendingCount = 0) {
    if (!button) return;

    if (state === 'saving') {
        button.dataset.originalLabel = button.textContent;
        button.disabled = true;
        button.textContent = 'Associando...';
        return;
    }

    button.disabled = pendingCount === 0;
    button.textContent = pendingCount > 0
        ? `Associar selecionados (${pendingCount})`
        : (button.dataset.originalLabel || 'Associar selecionados');
}

function syncPendenciasThirdPartySemProjetistaSaveButton() {
    const button = document.getElementById('pendencias-third-party-sem-projetista-save-all');
    setPendenciasThirdPartySemProjetistaSaveButtonState(
        button,
        'idle',
        collectPendenciasThirdPartySemProjetistaSelectionsFromDom().length
    );
}

function ensurePendenciasThirdPartySemProjetistaScreenEventsBound(content) {
    if (!content || content.dataset.thirdPartySemProjetistaEventsBound === '1') return;
    content.dataset.thirdPartySemProjetistaEventsBound = '1';

    content.addEventListener('change', (event) => {
        const target = event.target;
        if (!target?.closest('table[data-table-id="pendencias-third-party-sem-projetista"]')) return;
        if (!target.matches('.pendencias-third-party-designer-select')) return;
        syncPendenciasThirdPartySemProjetistaSaveButton();
    });

    content.querySelector('#pendencias-third-party-sem-projetista-save-all')
        ?.addEventListener('click', () => savePendenciasThirdPartySemProjetistaAssociationsBatch());
}

async function savePendenciasThirdPartySemProjetistaAssociationsBatch() {
    if (!canAssignThirdPartyProjectDesigner()) {
        alertAppDialog('Somente Gestor de Projetos pode associar responsáveis.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const selections = collectPendenciasThirdPartySemProjetistaSelectionsFromDom();
    if (!selections.length) {
        alertAppDialog('Selecione ao menos um projetista.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    for (const item of selections) {
        if (!pendenciasProjetistasCache.find(user => Number(user.id) === Number(item.designerId))) {
            alertAppDialog(`Projetista inválido para o projeto ${item.projectName}.`);
            return;
        }
    }

    const summaryLines = selections.slice(0, 8).map(item => (
        `• ${item.orderCode} — ${item.projectName}: ${item.projetistaName}`
    ));
    const extraCount = selections.length - summaryLines.length;
    const extraLine = extraCount > 0 ? `\n... e mais ${extraCount} projeto(s).` : '';

    if (!(await confirmAppDialog(
        `Associar ${selections.length} projeto(s) de terceiros aos projetistas selecionados?\n\n${summaryLines.join('\n')}${extraLine}`
    ))) {
        return;
    }

    const saveButton = document.getElementById('pendencias-third-party-sem-projetista-save-all');
    const errors = [];

    try {
        setPendenciasThirdPartySemProjetistaSaveButtonState(saveButton, 'saving');
        setPendenciasActionLoading(true, `Associando ${selections.length} projeto(s)...`);

        for (const item of selections) {
            try {
                await assignThirdPartyProjectDesigner(item.thirdPartyProjectId, item.designerId);
            } catch (error) {
                errors.push(`${item.projectName}: ${error.message}`);
            }
        }

        if (errors.length) {
            alertAppDialog(
                `Algumas associações falharam:\n\n${errors.slice(0, 6).join('\n')}${errors.length > 6 ? `\n... e mais ${errors.length - 6}.` : ''}`,
                { variant: 'warning', title: 'Aviso' }
            );
        }

        await loadPendenciasThirdPartySemProjetista();
    } catch (error) {
        alertAppDialog('Erro ao associar projetistas: ' + error.message);
    } finally {
        setPendenciasActionLoading(false);
        syncPendenciasThirdPartySemProjetistaSaveButton();
    }
}

function renderPendenciasThirdPartyProjetistaActions(project) {
    const canAct = canActThirdPartyProjectAsProjetista(project);
    const isInReview = project.status === THIRD_PARTY_PROJECT_STATUS_IN_REVIEW;

    let actionButtons = '';
    if (canAct && isInReview) {
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
        <div class="flex flex-wrap gap-1.5">
            ${renderPendenciasThirdPartyDetailButton(project)}
            ${actionButtons}
        </div>
    `;
}

function renderPendenciasThirdPartyConsultorActions(project) {
    const canReview = typeof canReviewThirdPartyProjectAsConsultor === 'function'
        && canReviewThirdPartyProjectAsConsultor(project);
    const canApprove = typeof canApproveThirdPartyProject === 'function'
        && canApproveThirdPartyProject(project);

    return `
        <div class="flex flex-wrap gap-1.5">
            ${renderPendenciasThirdPartyDetailButton(project)}
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

function bindPendenciasThirdPartyProjetistaActions(content) {
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

    bindPendenciasThirdPartyDetailActions(content);
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

    bindPendenciasThirdPartyDetailActions(content);
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

    const rows = (projects || []).map(project => mapPendenciasThirdPartyInteractiveRow(project, {
        thirdPartyProjectId: project.id
    }));

    pendenciasThirdPartySemProjetistaRowsCache = rows;

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Projetos de Terceiros sem Projetista',
        subtitle: 'Selecione o projetista em cada linha; use o botão no topo para associar todos de uma vez.',
        headerActionsHtml: `<button type="button" id="pendencias-third-party-sem-projetista-save-all" disabled
            class="text-xs bg-violet-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-violet-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
            Associar selecionados
        </button>`,
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
            }
        ],
        onBind() {
            syncPendenciasThirdPartySemProjetistaSaveButton();
        }
    });

    ensurePendenciasThirdPartySemProjetistaScreenEventsBound(content);
    syncPendenciasThirdPartySemProjetistaSaveButton();
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
    const projects = filterPendenciasThirdPartyForProjetista(
        await fetchThirdPartyProjectsForProjetista(currentUser?.id, {
            includeAll: overviewMode
        })
    );

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
            ? 'Projetos de terceiros em aberto ou em revisão.'
            : 'Seus projetos de terceiros em aberto ou em revisão.',
        refreshButtonId: 'btn-pendencias-refresh-third-party-projetista',
        onRefresh: loadPendenciasThirdPartyProjetista,
        tableId: 'pendencias-third-party-projetista',
        rows,
        minWidth: overviewMode ? '860px' : '760px',
        emptyMessage: 'Nenhum projeto de terceiros pendente.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({ includeDesigner: overviewMode }),
            {
                key: 'subtypeName',
                label: 'Subtipo',
                sortable: true,
                filterable: true,
                cellClass: 'p-3 text-xs text-slate-600'
            },
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-56',
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
        designerName: project.designer?.name || 'Sem projetista'
    }));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Projetos de Terceiros Enviados',
        subtitle: overviewMode
            ? 'Projetos de terceiros enviados aguardando revisão ou aprovação.'
            : 'Projetos de terceiros enviados dos seus pedidos.',
        refreshButtonId: 'btn-pendencias-refresh-third-party-consultor',
        onRefresh: loadPendenciasThirdPartyConsultor,
        tableId: 'pendencias-third-party-consultor',
        rows,
        minWidth: '860px',
        emptyMessage: 'Nenhum projeto de terceiros enviado pendente.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({ includeDesigner: true }),
            {
                key: 'subtypeName',
                label: 'Subtipo',
                sortable: true,
                filterable: true,
                cellClass: 'p-3 text-xs text-slate-600'
            },
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-64',
                cellClass: 'p-3',
                render: (row) => renderPendenciasThirdPartyConsultorActions(row.project)
            })
        ],
        onBind(tbody) {
            bindPendenciasThirdPartyConsultorActions(tbody);
        }
    });
}
