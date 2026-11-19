const PENDENCIAS_STATUS_EM_REVISAO_TECNICA_REVISOR = ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR;
const PENDENCIAS_STATUS_EM_REVISAO_TECNICA_PROJ = ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ;

function canSeePendenciasReviewerItems() {
    return canSeeAllPendenciasMenus() || isReviewer();
}

function isPendenciasTechnicalReviewerOverviewMode() {
    return isPendenciasProjetistaOverviewMode() || isGestorProjetos();
}

function canAccessPendenciasEmRevisaoTecnicaRevisor() {
    return canSeePendenciasReviewerItems();
}

function canAccessPendenciasEmRevisaoTecnicaProj() {
    return canSeeAllPendenciasMenus()
        || isGestorProjetos()
        || currentUser?.role === 'Projetista';
}

async function fetchTechnicalReviewerStatusChangedAtByProjectIds(projectIds, statusNames) {
    if (!projectIds.length || !statusNames.length) return {};

    const statusIds = await getPendenciasStatusIdsByNames(statusNames);
    if (!statusIds.length) return {};

    const { data, error } = await supabaseClient
        .from('OrderProjectStatusHistory')
        .select('orderProjectId, changedAt, newStatusId')
        .in('orderProjectId', projectIds)
        .in('newStatusId', statusIds)
        .order('changedAt', { ascending: false });

    if (error) {
        console.error('fetchTechnicalReviewerStatusChangedAtByProjectIds:', error);
        return {};
    }

    const byProject = {};
    (data || []).forEach(entry => {
        if (!byProject[entry.orderProjectId]) {
            byProject[entry.orderProjectId] = entry.changedAt;
        }
    });
    return byProject;
}

async function fetchPendenciasEmRevisaoTecnicaRevisorProjects() {
    const overviewMode = isPendenciasTechnicalReviewerOverviewMode();

    const statusIds = await getPendenciasStatusIdsByNames([
        PENDENCIAS_STATUS_EM_REVISAO_TECNICA_REVISOR,
        ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_LIDER_LEGACY
    ]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_EM_REVISAO_TECNICA_REVISOR}" não encontrado.`),
            overviewMode,
            projects: [],
            statusChangedAtByProject: {}
        };
    }

    const userId = Number(currentUser?.id);
    const queryFilters = { statusIds };
    if (!overviewMode && userId) {
        queryFilters.reviewerId = userId;
    }

    const result = await queryPendenciasProjects(queryFilters);
    if (result.error) {
        return {
            error: result.error,
            overviewMode,
            projects: [],
            statusChangedAtByProject: {}
        };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);
    projects = await enrichPendenciasProjectsWithDesigner(projects);

    const projectIds = projects.map(project => project.id);
    const statusChangedAtByProject = await fetchTechnicalReviewerStatusChangedAtByProjectIds(
        projectIds,
        [PENDENCIAS_STATUS_EM_REVISAO_TECNICA_REVISOR, ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_LIDER_LEGACY]
    );

    return {
        error: null,
        overviewMode,
        projects,
        statusChangedAtByProject
    };
}

async function fetchPendenciasEmRevisaoTecnicaProjProjects() {
    const overviewMode = isPendenciasTechnicalReviewerOverviewMode();
    const userId = Number(currentUser?.id);

    if (!overviewMode && !userId) {
        return {
            error: null,
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            revisionsByProject: {}
        };
    }

    const statusIds = await getPendenciasStatusIdsByNames([PENDENCIAS_STATUS_EM_REVISAO_TECNICA_PROJ]);
    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_EM_REVISAO_TECNICA_PROJ}" não encontrado.`),
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            revisionsByProject: {}
        };
    }

    const result = await queryPendenciasProjects(
        overviewMode
            ? { statusIds }
            : { statusIds, designerId: userId }
    );

    if (result.error) {
        return {
            error: result.error,
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            revisionsByProject: {}
        };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);
    if (overviewMode) {
        projects = await enrichPendenciasProjectsWithDesigner(projects);
    }

    const projectIds = projects.map(project => project.id);
    const statusChangedAtByProject = await fetchTechnicalReviewerStatusChangedAtByProjectIds(
        projectIds,
        [PENDENCIAS_STATUS_EM_REVISAO_TECNICA_PROJ]
    );

    const revisions = await fetchRevisionsByOrderProjectIds(projectIds, [REVISION_TYPE_TECHNICAL_REVISOR]);
    const openRevisions = revisions.filter(revision => revision.status === REVISION_STATUS_OPEN);
    const revisionIds = openRevisions.map(revision => revision.id);
    const activities = await fetchRevisionActivitiesByRevisionIds(revisionIds);

    const activitiesByRevision = {};
    activities.forEach(activity => {
        if (!activitiesByRevision[activity.revisionId]) {
            activitiesByRevision[activity.revisionId] = [];
        }
        activitiesByRevision[activity.revisionId].push(activity);
    });

    const revisionsByProject = {};
    openRevisions.forEach(revision => {
        revisionsByProject[revision.orderProjectId] = {
            ...revision,
            activities: activitiesByRevision[revision.id] || []
        };
    });

    return {
        error: null,
        overviewMode,
        projects,
        statusChangedAtByProject,
        revisionsByProject
    };
}

function getTechnicalReviewerRevisionProgressLabel(revision) {
    if (!revision) return 'Sem revisão';
    if (revision.revisionCompletedAt) return 'Concluída';
    if (revision.revisionStartedAt) {
        const total = revision.activities?.length || 0;
        const done = revision.activities?.filter(activity => activity.completed).length || 0;
        if (total && done < total) return `${done}/${total} atividades`;
        return 'Em andamento';
    }
    if (!revision.activities?.length) return 'Sem atividades';
    return 'Aguardando início';
}

function getTechnicalReviewerRevisionProgressClass(revision) {
    if (!revision) return 'bg-slate-100 text-slate-600';
    if (revision.revisionCompletedAt) return 'bg-emerald-100 text-emerald-800';
    if (revision.revisionStartedAt) return 'bg-sky-100 text-sky-800';
    if (!revision.activities?.length) return 'bg-slate-100 text-slate-600';
    return 'bg-amber-100 text-amber-800';
}

function renderPendenciasEmRevisaoTecnicaRevisorList(projects, statusChangedAtByProject, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (projects || []).map(project => {
        const statusChangedAt = statusChangedAtByProject[project.id];
        return mapPendenciasInteractiveIdentity(project, {
            statusChangedAtLabel: statusChangedAt ? formatDate(statusChangedAt) : '—',
            statusChangedAt,
            canAct: canReviewerActOnProject(project),
            canStartReview: typeof canReviewerStartTechnicalReviewOnProject === 'function'
                && canReviewerStartTechnicalReviewOnProject(project),
            reviewStarted: typeof isTechnicalReviewerReviewStartedOnProject === 'function'
                && isTechnicalReviewerReviewStartedOnProject(project)
        });
    });

    const columns = [
        ...getPendenciasInteractiveIdentityColumns(),
        {
            key: 'designerName',
            label: 'Projetista',
            sortable: true,
            filterable: true,
            cellClass: 'p-3 text-xs text-slate-700'
        },
        getPendenciasInteractiveDateColumn({
            key: 'statusChangedAtLabel',
            label: 'Desde',
            sortKey: 'statusChangedAt',
            cellClass: 'p-3 text-xs text-slate-500 whitespace-nowrap'
        })
    ];

    if (!overviewMode) {
        columns.push(
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-40',
                render: (row) => {
                    if (row.canStartReview) {
                        return `<button type="button" onclick="handleStartTechnicalReviewerReviewFromPendencias(${row.id})"
                            class="text-xs bg-amber-100 text-amber-900 hover:bg-amber-200 px-2.5 py-1 rounded-lg font-medium">Iniciar Revisão</button>`;
                    }
                    if (row.canAct && row.reviewStarted) {
                        return `<div class="flex flex-wrap justify-end gap-1.5">
                            <button type="button" onclick="approveTechnicalReviewerProjectToNomear(${row.id})"
                                class="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1 rounded-lg font-medium">Aprovar</button>
                            <button type="button" onclick="openTechnicalReviewerRevisionModal(${row.id})"
                                class="text-xs bg-teal-100 text-teal-800 hover:bg-teal-200 px-2.5 py-1 rounded-lg font-medium">Revisão</button>
                        </div>`;
                    }
                    return '<span class="text-xs text-slate-300">—</span>';
                }
            })
        );
    }

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Em Revisão Técnica Revisor',
        subtitle: overviewMode
            ? 'Todos os projetos aguardando revisão do revisor.'
            : 'Projetos em revisão técnica atribuídos a você como revisor.',
        refreshButtonId: 'btn-pendencias-refresh-em-revisao-tecnica-revisor',
        refreshButtonClass: 'order-tab-action-btn text-xs bg-white border border-teal-200 text-teal-800 px-3 py-1.5 rounded-lg font-medium hover:bg-teal-50',
        onRefresh: loadPendenciasEmRevisaoTecnicaRevisor,
        tableId: 'pendencias-em-revisao-tecnica-revisor',
        rows,
        columns,
        emptyMessage: overviewMode
            ? 'Nenhum projeto em revisão técnica do revisor.'
            : 'Nenhum projeto aguardando revisão do revisor.',
        minWidth: overviewMode ? '960px' : '820px'
    });
}

function renderPendenciasEmRevisaoTecnicaProjList(projects, statusChangedAtByProject, revisionsByProject, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (projects || []).map(project => {
        const statusChangedAt = statusChangedAtByProject[project.id];
        const revision = revisionsByProject[project.id];
        return mapPendenciasInteractiveIdentity(project, {
            revisionProgressLabel: getTechnicalReviewerRevisionProgressLabel(revision),
            revisionProgressClass: getTechnicalReviewerRevisionProgressClass(revision),
            statusChangedAtLabel: statusChangedAt ? formatDate(statusChangedAt) : '—',
            statusChangedAt,
            canAct: canDesignerActOnTechnicalReviewerProject(project)
        });
    });

    const columns = [
        ...getPendenciasInteractiveIdentityColumns({ includeDesigner: overviewMode }),
        getPendenciasInteractiveStatusColumn({
            key: 'revisionProgressLabel',
            label: 'Revisão',
            render: (row) => `<span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${row.revisionProgressClass}">${escapeHtml(row.revisionProgressLabel || '—')}</span>`
        }),
        getPendenciasInteractiveDateColumn({
            key: 'statusChangedAtLabel',
            label: 'Desde',
            sortKey: 'statusChangedAt',
            cellClass: 'p-3 text-xs text-slate-500 whitespace-nowrap'
        })
    ];

    if (!overviewMode) {
        columns.push(
            getPendenciasInteractiveActionColumn({
                label: 'Ações',
                thClass: 'w-36',
                render: (row) => row.canAct
                    ? `<button type="button" onclick="openTechnicalReviewerRevisionModal(${row.id})"
                        class="text-xs bg-teal-100 text-teal-800 hover:bg-teal-200 px-2.5 py-1 rounded-lg font-medium">Executar Revisão</button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        );
    }

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Em Revisão Técnica Proj.',
        subtitle: overviewMode
            ? 'Todos os projetos em revisão técnica do projetista.'
            : 'Projetos em revisão técnica sob sua responsabilidade.',
        refreshButtonId: 'btn-pendencias-refresh-em-revisao-tecnica-proj',
        refreshButtonClass: 'order-tab-action-btn text-xs bg-white border border-teal-200 text-teal-800 px-3 py-1.5 rounded-lg font-medium hover:bg-teal-50',
        onRefresh: loadPendenciasEmRevisaoTecnicaProj,
        tableId: 'pendencias-em-revisao-tecnica-proj',
        rows,
        columns,
        emptyMessage: overviewMode
            ? 'Nenhum projeto em revisão técnica do projetista.'
            : 'Nenhum projeto em revisão técnica associado a você.',
        minWidth: overviewMode ? '960px' : '820px'
    });
}

async function loadPendenciasEmRevisaoTecnicaRevisor() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasEmRevisaoTecnicaRevisor()) {
        renderPendenciasPlaceholder('Em Revisão Técnica Revisor', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, statusChangedAtByProject } =
        await fetchPendenciasEmRevisaoTecnicaRevisorProjects();

    if (error) {
        renderPendenciasPlaceholder('Em Revisão Técnica Revisor', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEmRevisaoTecnicaRevisorList(
        projects,
        statusChangedAtByProject,
        overviewMode
    );
}

async function loadPendenciasEmRevisaoTecnicaProj() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasEmRevisaoTecnicaProj()) {
        renderPendenciasPlaceholder('Em Revisão Técnica Proj.', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, statusChangedAtByProject, revisionsByProject } =
        await fetchPendenciasEmRevisaoTecnicaProjProjects();

    if (error) {
        renderPendenciasPlaceholder('Em Revisão Técnica Proj.', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEmRevisaoTecnicaProjList(
        projects,
        statusChangedAtByProject,
        revisionsByProject,
        overviewMode
    );
}

async function handleStartTechnicalReviewerReviewFromPendencias(orderProjectId) {
    const projectId = Number(orderProjectId);
    if (!projectId) return;

    if (!(await confirmAppDialog(
        'Confirma o início da revisão técnica neste projeto?',
        { title: 'Iniciar revisão', confirmLabel: 'Iniciar' }
    ))) {
        return;
    }

    try {
        if (typeof setPendenciasActionLoading === 'function') {
            setPendenciasActionLoading(true, 'Iniciando revisão...');
        }
        const result = typeof startTechnicalReviewerReviewOnProject === 'function'
            ? await startTechnicalReviewerReviewOnProject(projectId)
            : { ok: false, error: new Error('Função indisponível.') };
        if (!result.ok) {
            alertAppDialog(result.error?.message || 'Não foi possível iniciar a revisão.');
            return;
        }
        await loadPendenciasEmRevisaoTecnicaRevisor();
        if (typeof loadPendenciasCargaPorProjetista === 'function'
            && pendenciasActiveSection === 'gestor-projetos'
            && pendenciasActiveItem === 'carga-por-projetista') {
            await loadPendenciasCargaPorProjetista();
        }
    } finally {
        if (typeof setPendenciasActionLoading === 'function') {
            setPendenciasActionLoading(false);
        }
    }
}

let pendenciasRevisoresCache = [];
let pendenciasGestorRevisorRowsCache = [];

function uniquePendenciasReviewersById(users = []) {
    const byId = new Map();
    users.forEach(user => {
        if (!user?.id) return;
        if (!byId.has(user.id)) byId.set(user.id, user);
    });
    return [...byId.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', {
        sensitivity: 'base'
    }));
}

async function fetchPendenciasActiveReviewers() {
    let result = await supabaseClient
        .from('appUsers')
        .select('id, name, role, isReviewer, isProjectLeader, isActive')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('isProjectLeader')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name, role, isReviewer, isActive')
            .eq('role', 'Projetista')
            .eq('isActive', true)
            .order('name', { ascending: true });
    }

    if (result.error?.message?.includes('isReviewer')) {
        result = await supabaseClient
            .from('appUsers')
            .select('id, name, role, isProjectLeader, isActive')
            .eq('role', 'Projetista')
            .eq('isActive', true)
            .order('name', { ascending: true });
    }

    if (result.error) {
        console.error('fetchPendenciasActiveReviewers:', result.error);
        pendenciasRevisoresCache = [];
        return pendenciasRevisoresCache;
    }

    const isReviewerUser = typeof isReviewer === 'function'
        ? (user) => isReviewer(user)
        : (user) => user?.role === 'Projetista' && Boolean(user?.isReviewer ?? user?.isProjectLeader);

    const merged = (result.data || []).filter(isReviewerUser);
    pendenciasRevisoresCache = uniquePendenciasReviewersById(merged);
    return pendenciasRevisoresCache;
}

function getPendenciasRevisorOptionsHtml(selectedId = null) {
  return (pendenciasRevisoresCache || []).map(reviewer => {
    const selected = Number(selectedId) === Number(reviewer.id) ? 'selected' : '';
    return `<option value="${reviewer.id}" ${selected}>${escapeHtml(reviewer.name)}</option>`;
  }).join('');
}

async function fetchPendenciasGestorRevisaoTecnicaRevisorProjects() {
  const statusIds = await getPendenciasStatusIdsByNames([
    PENDENCIAS_STATUS_EM_REVISAO_TECNICA_REVISOR,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_LIDER_LEGACY
  ]);

  if (!statusIds.length) {
    return {
      error: new Error(`Status "${PENDENCIAS_STATUS_EM_REVISAO_TECNICA_REVISOR}" não encontrado.`),
      projects: [],
      statusChangedAtByProject: {}
    };
  }

  const result = await queryPendenciasProjects({ statusIds, unassignedReviewerOnly: true });
  if (result.error) {
    return { error: result.error, projects: [], statusChangedAtByProject: {} };
  }

  let projects = sortPendenciasByDeliveryDate(result.data || []);
  projects = await enrichPendenciasProjectsWithDesigner(projects);

  const projectIds = projects.map(project => project.id);
  const statusChangedAtByProject = await fetchTechnicalReviewerStatusChangedAtByProjectIds(
    projectIds,
    [PENDENCIAS_STATUS_EM_REVISAO_TECNICA_REVISOR, ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_LIDER_LEGACY]
  );

  return { error: null, projects, statusChangedAtByProject };
}

function getPendenciasGestorRevisorAssocTable() {
  return document.querySelector('table[data-table-id="pendencias-revisao-tecnica-revisor-gestor"]');
}

function collectPendenciasGestorRevisorSelectionsFromDom() {
  const table = getPendenciasGestorRevisorAssocTable();
  if (!table) return [];

  const selections = [];

  table.querySelectorAll('tbody tr').forEach(row => {
    const select = row.querySelector('.pendencias-gestor-revisor-select');
    const reviewerId = Number(select?.value);
    if (!reviewerId) return;

    const projectId = Number(select?.dataset?.projectId);
    if (!projectId) return;

    const reviewer = pendenciasRevisoresCache.find(item => Number(item.id) === reviewerId);
    const cached = pendenciasGestorRevisorRowsCache.find(item => Number(item.id) === projectId);
    const projectLabel = cached && typeof getPendenciasProjectLabel === 'function'
      ? getPendenciasProjectLabel(cached)
      : (cached?.name || row.dataset.projectName || 'Projeto');

    selections.push({
      projectId,
      reviewerId,
      reviewerName: reviewer?.name || 'Revisor',
      orderCode: cached?.order?.orderCode || row.dataset.orderCode || '—',
      projectName: projectLabel,
      orderId: Number(cached?.orderId || cached?.order?.id) || null,
      designerId: Number(cached?.designerId) || null
    });
  });

  return selections;
}

function setPendenciasGestorRevisorSaveButtonState(button, state = 'idle', pendingCount = 0) {
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

function syncPendenciasGestorRevisorSaveButton() {
  const button = document.getElementById('pendencias-revisor-gestor-save-all');
  setPendenciasGestorRevisorSaveButtonState(
    button,
    'idle',
    collectPendenciasGestorRevisorSelectionsFromDom().length
  );
}

function ensurePendenciasGestorRevisorScreenEventsBound(content) {
  if (!content || content.dataset.revisorGestorEventsBound === '1') return;
  content.dataset.revisorGestorEventsBound = '1';

  content.addEventListener('change', (event) => {
    const target = event.target;
    if (!target?.closest('table[data-table-id="pendencias-revisao-tecnica-revisor-gestor"]')) return;
    if (!target.matches('.pendencias-gestor-revisor-select')) return;
    syncPendenciasGestorRevisorSaveButton();
  });

  content.addEventListener('click', (event) => {
    const button = event.target.closest('#pendencias-revisor-gestor-save-all');
    if (!button || button.disabled) return;
    savePendenciasGestorRevisorAssociationsBatch();
  });
}

async function savePendenciasGestorRevisorAssociationsBatch() {
  if (!canSeePendenciasGestorProjetosMenu()) {
    alertAppDialog('Somente Gestor de Projetos pode associar revisores.', { variant: 'warning', title: 'Aviso' });
    return;
  }

  const selections = collectPendenciasGestorRevisorSelectionsFromDom();
  if (!selections.length) {
    alertAppDialog('Selecione ao menos um revisor.', { variant: 'warning', title: 'Aviso' });
    return;
  }

  const summaryLines = selections.slice(0, 8).map(item => (
    `• ${item.orderCode} — ${item.projectName}: ${item.reviewerName}`
  ));
  const extraCount = selections.length - summaryLines.length;
  const extraLine = extraCount > 0 ? `\n... e mais ${extraCount} projeto(s).` : '';

  if (!(await confirmAppDialog(
    `Associar ${selections.length} projeto(s) aos revisores selecionados?\n\n${summaryLines.join('\n')}${extraLine}`
  ))) {
    return;
  }

  const saveButton = document.getElementById('pendencias-revisor-gestor-save-all');
  const errors = [];
  const successful = [];

  try {
    setPendenciasGestorRevisorSaveButtonState(saveButton, 'saving');
    if (typeof setPendenciasActionLoading === 'function') {
      setPendenciasActionLoading(true, `Associando ${selections.length} projeto(s)...`);
    }

  for (let index = 0; index < selections.length; index += 1) {
      const item = selections[index];
      if (typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(
          true,
          `Associando revisor (${index + 1}/${selections.length}): ${item.orderCode} — ${item.projectName}...`
        );
      }

      const result = typeof assignOrderProjectTechnicalReviewer === 'function'
        ? await assignOrderProjectTechnicalReviewer(item.projectId, item.reviewerId)
        : { ok: false, error: new Error('Função indisponível.') };
      if (!result.ok) {
        errors.push(`${item.orderCode}: ${result.error?.message || 'Erro'}`);
      } else {
        successful.push(item);
      }
    }

    if (successful.length && typeof notifyTechnicalReviewerAssignedToDesignerEmail === 'function') {
      if (typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(true, 'Enviando notificações (e-mail e Element)...');
      }

      for (let index = 0; index < successful.length; index += 1) {
        const item = successful[index];
        if (!item.orderId) continue;

        if (typeof setPendenciasActionLoading === 'function') {
          setPendenciasActionLoading(
            true,
            `Notificando (${index + 1}/${successful.length}): ${item.orderCode} — ${item.projectName}...`
          );
        }

        await notifyTechnicalReviewerAssignedToDesignerEmail({
          orderId: item.orderId,
          orderProjectIds: [item.projectId],
          designerId: item.designerId,
          reviewerId: item.reviewerId,
          reviewerName: item.reviewerName
        });
      }
    }

    if (errors.length) {
      alertAppDialog(`Algumas associações falharam:\n${errors.slice(0, 5).join('\n')}`);
    }

    if (typeof setPendenciasActionLoading === 'function') {
      setPendenciasActionLoading(true, 'Atualizando lista...');
    }
    await loadPendenciasGestorRevisaoTecnicaRevisor();

    if (!errors.length && successful.length && typeof setPendenciasActionLoading === 'function') {
      setPendenciasActionLoading(true, 'Revisores associados com sucesso!', 'success');
      const waitMs = typeof APP_OVERLAY_SUCCESS_MS === 'number' ? APP_OVERLAY_SUCCESS_MS : 800;
      if (typeof waitPendenciasStatus === 'function') {
        await waitPendenciasStatus(waitMs);
      } else {
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  } finally {
    if (typeof setPendenciasActionLoading === 'function') {
      setPendenciasActionLoading(false);
    }
    if (saveButton) syncPendenciasGestorRevisorSaveButton();
  }
}

function renderPendenciasGestorRevisaoTecnicaRevisorList(projects, statusChangedAtByProject) {
  const content = document.getElementById('pendencias-content');
  if (!content) return;

  pendenciasGestorRevisorRowsCache = projects || [];

  const rows = (projects || []).map(project => {
    const statusChangedAt = statusChangedAtByProject[project.id];
    return mapPendenciasInteractiveIdentity(project, {
      reviewerName: project.reviewer?.name || '—',
      reviewerId: project.reviewerId || null,
      statusChangedAtLabel: statusChangedAt ? formatDate(statusChangedAt) : '—',
      statusChangedAt
    });
  });

  renderPendenciasInteractiveTableScreen(content, {
    title: 'Revisão Técnica sem revisor',
    subtitle: 'Selecione o revisor em cada linha; use o botão no topo para associar todos de uma vez.',
    headerActionsHtml: `<button type="button" id="pendencias-revisor-gestor-save-all" disabled
        class="text-xs bg-violet-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-violet-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
        Associar selecionados
    </button>`,
    refreshButtonId: 'btn-pendencias-refresh-revisao-tecnica-revisor-gestor',
    onRefresh: loadPendenciasGestorRevisaoTecnicaRevisor,
    tableId: 'pendencias-revisao-tecnica-revisor-gestor',
    rows,
    emptyMessage: 'Nenhum projeto em revisão técnica do revisor sem revisor associado.',
    minWidth: '980px',
    columns: [
      ...getPendenciasInteractiveIdentityColumns(),
      {
        key: 'designerName',
        label: 'Projetista',
        sortable: true,
        filterable: true,
        cellClass: 'p-3 text-xs text-slate-700'
      },
      getPendenciasInteractiveDateColumn({
        key: 'statusChangedAtLabel',
        label: 'Desde',
        sortKey: 'statusChangedAt',
        cellClass: 'p-3 text-xs text-slate-500 whitespace-nowrap'
      }),
      {
        key: 'reviewerSelect',
        label: 'Revisor',
        type: 'action',
        thClass: 'min-w-[12rem]',
        cellClass: 'p-3',
        render: (row) => `<select class="pendencias-gestor-revisor-select w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
            data-project-id="${row.id}">
            <option value="">Selecione...</option>
            ${getPendenciasRevisorOptionsHtml(row.reviewerId)}
        </select>`
      }
    ],
    onBind() {
      syncPendenciasGestorRevisorSaveButton();
    }
  });

  ensurePendenciasGestorRevisorScreenEventsBound(content);
  syncPendenciasGestorRevisorSaveButton();
}

async function loadPendenciasGestorRevisaoTecnicaRevisor() {
  const content = document.getElementById('pendencias-content');
  if (content) {
    content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
  }

  if (!canSeePendenciasGestorProjetosMenu()) {
    renderPendenciasPlaceholder('Revisão Técnica sem revisor', 'Sem permissão para visualizar esta pendência.');
    return;
  }

  await fetchPendenciasActiveReviewers();

  const { error, projects, statusChangedAtByProject } = await fetchPendenciasGestorRevisaoTecnicaRevisorProjects();
  if (error) {
    renderPendenciasPlaceholder('Revisão Técnica sem revisor', `Erro ao carregar: ${error.message}`);
    return;
  }

  renderPendenciasGestorRevisaoTecnicaRevisorList(projects, statusChangedAtByProject);
}

window.loadPendenciasEmRevisaoTecnicaRevisor = loadPendenciasEmRevisaoTecnicaRevisor;
window.loadPendenciasEmRevisaoTecnicaProj = loadPendenciasEmRevisaoTecnicaProj;
window.loadPendenciasGestorRevisaoTecnicaRevisor = loadPendenciasGestorRevisaoTecnicaRevisor;
window.handleStartTechnicalReviewerReviewFromPendencias = handleStartTechnicalReviewerReviewFromPendencias;
