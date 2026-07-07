async function fetchPendenciasAguardandoProjetoTecnico() {
    const aguardandoStatusId = await getPendenciasStatusIdByName(PENDENCIAS_STATUS_AGUARDANDO_PT);
    if (!aguardandoStatusId) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_AGUARDANDO_PT}" não encontrado.`),
            unassigned: [],
            mine: []
        };
    }

    const userId = Number(currentUser?.id);
    const mineStatusIds = await getPendenciasStatusIdsByNames([
        PENDENCIAS_STATUS_AGUARDANDO_PT,
        ...PENDENCIAS_MINE_EXTRA_STATUSES
    ]);

    const unassignedResult = await queryPendenciasProjects({
        statusId: aguardandoStatusId,
        unassignedOnly: true
    });

    if (unassignedResult.error) {
        return { error: unassignedResult.error, unassigned: [], mine: [] };
    }

    let mine = [];
    if (userId && mineStatusIds.length) {
        const mineResult = await queryPendenciasProjects({
            statusIds: mineStatusIds,
            designerId: userId
        });

        if (mineResult.error) {
            return { error: mineResult.error, unassigned: [], mine: [] };
        }

        mine = mineResult.data || [];
    }

    return {
        error: null,
        unassigned: sortPendenciasByDeliveryDate(unassignedResult.data || []),
        mine: sortPendenciasByDeliveryDate(mine)
    };
}

function sortPendenciasByDeliveryDate(projects) {
    return [...projects].sort((a, b) => {
        const aTime = a.deliveryDate ? new Date(a.deliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.deliveryDate ? new Date(b.deliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
    });
}

function formatPendenciasDeliveryDate(dateStr) {
    if (!dateStr) return '—';
    const normalized = String(dateStr).slice(0, 10);
    const [year, month, day] = normalized.split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return new Date(dateStr).toLocaleDateString('pt-BR');
}

function renderPendenciasAguardandoProjetoTecnicoList(unassigned, mine) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const renderRow = (project, mode) => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const projectLabel = project.projectCode
            ? `${project.projectCode} — ${project.name || 'Projeto'}`
            : (project.name || 'Projeto');
        const statusName = getPendenciasProjectStatusName(project);

        let actionCell = '';
        if (mode === 'unassigned') {
            actionCell = `<button type="button"
                class="pendencias-associar-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-3 py-1.5 rounded-lg font-medium"
                data-project-id="${project.id}">
                Associar a mim
            </button>`;
        } else if (statusName === PENDENCIAS_STATUS_AGUARDANDO_PT) {
            actionCell = `<button type="button"
                class="pendencias-iniciar-projeto-btn text-xs bg-emerald-700 text-white hover:bg-emerald-800 px-3 py-1.5 rounded-lg font-medium"
                data-project-id="${project.id}">
                Iniciar projeto
            </button>`;
        } else {
            const statusClass = getPendenciasProjectStatusBadgeClass(statusName);
            actionCell = `<span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(statusName || '—')}</span>`;
        }

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right">${actionCell}</td>
            </tr>
        `;
    };

    const renderTable = (title, rows, emptyMessage, lastColumnLabel = 'Ação') => `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">${escapeHtml(title)}</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${rows.length} projeto${rows.length === 1 ? '' : 's'}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-aguardando-pt"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${rows.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-40">${escapeHtml(lastColumnLabel)}</th>
                            </tr>
                        </thead>
                        <tbody>${rows.join('')}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.innerHTML = `
        <div class="space-y-4">
            ${renderTable(
                'Sem responsável',
                unassigned.map(project => renderRow(project, 'unassigned')),
                'Nenhum projeto aguardando projeto técnico sem responsável.'
            )}
            ${renderTable(
                'Associados a mim',
                mine.map(project => renderRow(project, 'mine')),
                'Nenhum projeto associado a você.',
                'Status'
            )}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-aguardando-pt')
        ?.addEventListener('click', () => loadPendenciasAguardandoProjetoTecnico());

    content.querySelectorAll('.pendencias-associar-btn').forEach(button => {
        button.addEventListener('click', () => associarPendenciaProjetoAMim(Number(button.dataset.projectId)));
    });

    content.querySelectorAll('.pendencias-iniciar-projeto-btn').forEach(button => {
        button.addEventListener('click', () => iniciarPendenciaProjetoTecnico(Number(button.dataset.projectId)));
    });
}

function normalizePendenciasWorkloadStatusName(statusName) {
    if (statusName === 'Em revisão') return 'Em Revisão';
    return statusName;
}

async function fetchPendenciasActiveProjetistas() {
    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .order('name', { ascending: true });

    if (error) {
        console.error('fetchPendenciasActiveProjetistas:', error);
        return [];
    }

    pendenciasProjetistasCache = data || [];
    return pendenciasProjetistasCache;
}

const PENDENCIAS_DETAIL_SEPARATOR = ' | ';

function getPendenciasProjectDetailLabel(project) {
    return project?.name || 'Projeto';
}

function getPendenciasProjectLabel(project) {
    if (project?.projectCode) {
        return `${project.projectCode} — ${project.name || 'Projeto'}`;
    }
    return project?.name || 'Projeto';
}

function buildPendenciasProjetistaWorkloadRows(projetistas, projects) {
    const workloadByDesigner = Object.fromEntries(
        projetistas.map(projetista => [
            projetista.id,
            {
                designerId: projetista.id,
                name: projetista.name,
                projects: []
            }
        ])
    );

    (projects || []).forEach(project => {
        if (!project.designerId) return;

        const statusName = normalizePendenciasWorkloadStatusName(
            getPendenciasProjectStatusName(project)
        );
        if (!PENDENCIAS_GESTOR_WORKLOAD_COLUMNS.includes(statusName)) return;

        if (!workloadByDesigner[project.designerId]) {
            workloadByDesigner[project.designerId] = {
                designerId: project.designerId,
                name: project.designer?.name || 'Projetista',
                projects: []
            };
        }

        workloadByDesigner[project.designerId].projects.push(project);
    });

    return Object.values(workloadByDesigner)
        .map(row => ({
            ...row,
            projects: sortPendenciasByDeliveryDate(row.projects)
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

async function fetchPendenciasProjetistaWorkload() {
    const projetistas = await fetchPendenciasActiveProjetistas();
    const statusIds = await getPendenciasStatusIdsByNames(PENDENCIAS_GESTOR_PROJETISTA_WORKLOAD_STATUSES);

    if (!statusIds.length) {
        return {
            error: new Error('Nenhum status de carga de projetistas encontrado.'),
            projetistas,
            workload: buildPendenciasProjetistaWorkloadRows(projetistas, [])
        };
    }

    const result = await queryPendenciasProjects({ statusIds });
    if (result.error) {
        return { error: result.error, projetistas, workload: [] };
    }

    return {
        error: null,
        projetistas,
        workload: buildPendenciasProjetistaWorkloadRows(projetistas, result.data || [])
    };
}

async function fetchPendenciasAguardandoPtSemProjetista() {
    const aguardandoStatusId = await getPendenciasStatusIdByName(PENDENCIAS_STATUS_AGUARDANDO_PT);
    if (!aguardandoStatusId) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_AGUARDANDO_PT}" não encontrado.`),
            projects: []
        };
    }

    const result = await queryPendenciasProjects({
        statusId: aguardandoStatusId,
        unassignedOnly: true
    });

    if (result.error) {
        return { error: result.error, projects: [] };
    }

    return {
        error: null,
        projects: sortPendenciasByDeliveryDate(result.data || [])
    };
}

function getPendenciasProjetistaOptionsHtml(selectedId = null) {
    return pendenciasProjetistasCache.map(projetista => {
        const selected = Number(selectedId) === Number(projetista.id) ? 'selected' : '';
        return `<option value="${projetista.id}" ${selected}>${escapeHtml(projetista.name)}</option>`;
    }).join('');
}

function groupPendenciasProjectsByStatus(projects) {
    const grouped = Object.fromEntries(
        PENDENCIAS_GESTOR_WORKLOAD_COLUMNS.map(status => [status, []])
    );

    (projects || []).forEach(project => {
        const statusName = normalizePendenciasWorkloadStatusName(
            getPendenciasProjectStatusName(project)
        );
        if (!grouped[statusName]) return;
        grouped[statusName].push(project);
    });

    PENDENCIAS_GESTOR_WORKLOAD_COLUMNS.forEach(status => {
        grouped[status] = sortPendenciasByDeliveryDate(grouped[status]);
    });

    return grouped;
}

function renderPendenciasWorkloadStatusSections(projects) {
    const grouped = groupPendenciasProjectsByStatus(projects);

    return PENDENCIAS_GESTOR_WORKLOAD_COLUMNS.map(statusName => {
        const statusProjects = grouped[statusName] || [];
        const statusClass = getPendenciasProjectStatusBadgeClass(statusName);
        const projectsHtml = statusProjects.length
            ? statusProjects.map(project => {
                const orderCode = project.order?.orderCode || '—';
                const projectLabel = getPendenciasProjectLabel(project);

                return `
                    <li class="py-2 border-b border-slate-100 last:border-0">
                        <p class="text-[11px] font-mono text-slate-500">${escapeHtml(orderCode)}</p>
                        <p class="text-xs font-medium text-slate-800 mt-0.5">${escapeHtml(projectLabel)}</p>
                    </li>
                `;
            }).join('')
            : '<li class="text-xs text-slate-400 py-2">Nenhum projeto neste status.</li>';

        return `
            <div class="collapsible-list-card border border-slate-200 rounded-lg overflow-hidden bg-white">
                <div class="collapsible-list-header px-2 py-1.5 bg-slate-50/80 border-b border-slate-100 cursor-pointer">
                    <div class="flex items-center gap-2 min-w-0">
                        <button type="button"
                            class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                            aria-label="Expandir">▶</button>
                        <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase truncate ${statusClass}">
                            ${escapeHtml(statusName)}
                        </span>
                        <span class="text-[10px] text-slate-500 shrink-0">${statusProjects.length}</span>
                    </div>
                </div>
                <div class="collapsible-list-body hidden">
                    <ul class="px-2 py-1">${projectsHtml}</ul>
                </div>
            </div>
        `;
    }).join('');
}

function renderPendenciasProjetosSemProjetistas(workload, projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const workloadCards = workload.map(row => `
        <article class="flex-[1_1_16rem] min-w-[16rem] max-w-full border border-violet-200 rounded-xl bg-violet-50/20 shadow-sm overflow-hidden">
            <div class="px-3 py-2.5 border-b border-violet-100 bg-violet-50/70">
                <h4 class="font-bold text-sm text-slate-900">${escapeHtml(row.name)}</h4>
                <p class="text-[10px] text-slate-500 mt-0.5">${row.projects.length} projeto${row.projects.length === 1 ? '' : 's'}</p>
            </div>
            <div class="p-2 space-y-2 max-h-80 overflow-y-auto">
                ${renderPendenciasWorkloadStatusSections(row.projects)}
            </div>
        </article>
    `).join('');

    const projectRows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const projectLabel = getPendenciasProjectLabel(project);

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3">
                    <div class="flex flex-wrap items-center justify-end gap-2">
                        <select class="pendencias-gestor-designer-select px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
                            data-project-id="${project.id}">
                            <option value="">Selecione...</option>
                            ${getPendenciasProjetistaOptionsHtml()}
                        </select>
                        <button type="button"
                            class="pendencias-gestor-associar-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
                            data-project-id="${project.id}">
                            Associar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="space-y-4">
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                    <div>
                        <h3 class="font-bold text-sm text-slate-900">Carga por projetista</h3>
                        <p class="text-xs text-slate-400 mt-0.5">Projeto Técnico, Em Revisão, Aguardando Aprovação e Aguardando PPCP.</p>
                    </div>
                    <button type="button" id="btn-pendencias-refresh-sem-projetistas"
                        class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                        Atualizar
                    </button>
                </div>
                ${workload.length
                    ? `<div id="pendencias-workload-cards" class="p-4 flex flex-wrap gap-3 items-start">${workloadCards}</div>`
                    : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projetista cadastrado.</p>'}
            </div>

            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 class="font-bold text-sm text-slate-900">Aguardando Projeto Técnico sem responsável</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${projects.length} projeto${projects.length === 1 ? '' : 's'}</p>
                </div>
                ${projects.length
                    ? `<div class="overflow-x-auto">
                        <table class="w-full text-sm min-w-[920px]">
                            <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                                <tr>
                                    <th class="text-left p-3 font-semibold">Pedido</th>
                                    <th class="text-left p-3 font-semibold">Cliente</th>
                                    <th class="text-left p-3 font-semibold">Projeto</th>
                                    <th class="text-left p-3 font-semibold">Entrega</th>
                                    <th class="text-right p-3 font-semibold w-72">Associar projetista</th>
                                </tr>
                            </thead>
                            <tbody>${projectRows}</tbody>
                        </table>
                    </div>`
                    : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto aguardando projeto técnico sem responsável.</p>'}
            </div>
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-sem-projetistas')
        ?.addEventListener('click', () => loadPendenciasProjetosSemProjetistas());

    const workloadCardsRoot = content.querySelector('#pendencias-workload-cards');
    if (workloadCardsRoot) {
        bindCollapsibleListCardToggles(workloadCardsRoot, { defaultCollapsed: true });
    }

    content.querySelectorAll('.pendencias-gestor-associar-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const projectId = Number(button.dataset.projectId);
            const select = content.querySelector(
                `.pendencias-gestor-designer-select[data-project-id="${projectId}"]`
            );
            associarPendenciaProjetoAProjetista(projectId, Number(select?.value));
        });
    });
}

async function loadPendenciasProjetosSemProjetistas() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    const [workloadResult, projectsResult] = await Promise.all([
        fetchPendenciasProjetistaWorkload(),
        fetchPendenciasAguardandoPtSemProjetista()
    ]);

    const error = workloadResult.error || projectsResult.error;
    if (error) {
        renderPendenciasPlaceholder(
            'Projetos Sem Projetistas',
            `Erro ao carregar: ${error.message}`
        );
        return;
    }

    renderPendenciasProjetosSemProjetistas(workloadResult.workload, projectsResult.projects);
}

async function associarPendenciaProjetoAProjetista(projectId, designerId) {
    if (!canSeePendenciasGestorProjetosMenu()) {
        alertAppDialog('Somente Gestor de Projetos pode associar responsáveis.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!projectId || !designerId) {
        alertAppDialog('Selecione um projetista.');
        return;
    }

    const projetista = pendenciasProjetistasCache.find(item => Number(item.id) === Number(designerId));
    if (!projetista) {
        alertAppDialog('Projetista inválido.');
        return;
    }

    if (!(await confirmAppDialog(`Associar este projeto a ${projetista.name}?`))) return;

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            designerId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', projectId);

    if (error) {
        alertAppDialog('Erro ao associar projetista: ' + error.message);
        return;
    }

    await loadPendenciasProjetosSemProjetistas();
}

async function loadPendenciasAguardandoProjetoTecnico() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    const { error, unassigned, mine } = await fetchPendenciasAguardandoProjetoTecnico();
    if (error) {
        renderPendenciasPlaceholder(
            'Aguardando Projeto Técnico',
            `Erro ao carregar: ${error.message}`
        );
        return;
    }

    renderPendenciasAguardandoProjetoTecnicoList(unassigned, mine);
}

async function associarPendenciaProjetoAMim(projectId) {
    if (!projectId || currentUser?.role !== 'Projetista' && !isAdmin()) {
        alertAppDialog('Somente Projetista pode associar projetos.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!(await confirmAppDialog('Associar este projeto a você como responsável?'))) return;

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            designerId: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', projectId);

    if (error) {
        alertAppDialog('Erro ao associar projeto: ' + error.message);
        return;
    }

    await loadPendenciasAguardandoProjetoTecnico();
}

async function fetchEmRevisaoStatusChangedAtByProjectIds(projectIds) {
    if (!projectIds.length) return {};

    const statusIds = await getPendenciasStatusIdsByNames([
        PENDENCIAS_STATUS_EM_REVISAO,
        'Em revisão'
    ]);
    if (!statusIds.length) return {};

    const { data, error } = await supabaseClient
        .from('OrderProjectStatusHistory')
        .select('orderProjectId, changedAt, newStatusId')
        .in('orderProjectId', projectIds)
        .in('newStatusId', statusIds)
        .order('changedAt', { ascending: false });

    if (error) {
        console.error('fetchEmRevisaoStatusChangedAtByProjectIds:', error);
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

async function fetchCommercialApprovalsByProjectIds(projectIds) {
    if (!projectIds.length) return {};

    const columnSets = [
        'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt, status',
        'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt',
        'id, orderId, projectName, designerId, approved, approvedAt, status',
        'id, orderId, projectName, designerId, approved, approvedAt'
    ];

    let lastError = null;

    for (const columns of columnSets) {
        const result = await supabaseClient
            .from('CommercialApproval')
            .select(columns)
            .in('orderProjectId', projectIds);

        if (!result.error) {
            const byProject = {};
            (result.data || []).forEach(approval => {
                if (approval.orderProjectId) {
                    byProject[approval.orderProjectId] = normalizeCommercialApproval(approval);
                }
            });
            return byProject;
        }
        lastError = result.error;
    }

    console.error('fetchCommercialApprovalsByProjectIds:', lastError);
    return {};
}

function isPendenciasEmRevisaoOverviewMode() {
    return isAdmin() || isGestorProjetos();
}

function canAccessPendenciasEmRevisao() {
    return currentUser?.role === 'Projetista' || isAdmin() || isGestorProjetos();
}

async function enrichPendenciasProjectsWithDesigner(projects) {
    if (!projects.length) return projects;
    if (projects.every(project => project.designer?.name || !project.designerId)) return projects;

    const designerIds = [...new Set(projects.map(project => project.designerId).filter(Boolean))];
    if (!designerIds.length) return projects;

    const { data: designers, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .in('id', designerIds);

    if (error) {
        console.error('enrichPendenciasProjectsWithDesigner:', error);
        return projects;
    }

    const designerById = Object.fromEntries((designers || []).map(user => [user.id, user]));
    return projects.map(project => ({
        ...project,
        designer: project.designer || designerById[project.designerId] || null
    }));
}

async function fetchPendenciasEmRevisaoProjects() {
    const overviewMode = isPendenciasEmRevisaoOverviewMode();
    const userId = Number(currentUser?.id);

    if (!overviewMode && !userId) {
        return {
            error: null,
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            approvalsByProject: {}
        };
    }

    const statusIds = await getPendenciasStatusIdsByNames([
        PENDENCIAS_STATUS_EM_REVISAO,
        'Em revisão'
    ]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_EM_REVISAO}" não encontrado.`),
            overviewMode,
            projects: [],
            statusChangedAtByProject: {},
            approvalsByProject: {}
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
            approvalsByProject: {}
        };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);
    if (overviewMode) {
        projects = await enrichPendenciasProjectsWithDesigner(projects);
    }

    const projectIds = projects.map(project => project.id);
    const [statusChangedAtByProject, approvalsByProject] = await Promise.all([
        fetchEmRevisaoStatusChangedAtByProjectIds(projectIds),
        fetchCommercialApprovalsByProjectIds(projectIds)
    ]);

    return {
        error: null,
        overviewMode,
        projects,
        statusChangedAtByProject,
        approvalsByProject
    };
}

function renderPendenciasEmRevisaoList(projects, statusChangedAtByProject, approvalsByProject, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const statusChangedAt = statusChangedAtByProject[project.id];
        const designerName = project.designer?.name || '—';
        const approval = approvalsByProject[project.id];
        const canViewRevision = !overviewMode
            && approval
            && typeof canViewCommercialRevision === 'function'
            && canViewCommercialRevision(approval);
        const actionCell = canViewRevision
            ? `<button type="button" onclick="openCommercialRevisionView(${approval.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Revisão</button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                ${overviewMode
                    ? `<td class="p-3 text-xs text-slate-700">${escapeHtml(designerName)}</td>`
                    : ''}
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${statusChangedAt ? formatDate(statusChangedAt) : '—'}</td>
                ${overviewMode ? '' : `<td class="p-3 text-right whitespace-nowrap">${actionCell}</td>`}
            </tr>
        `;
    }).join('');

    const subtitle = overviewMode
        ? 'Todos os projetos em revisão.'
        : 'Projetos associados a você neste status.';
    const emptyMessage = overviewMode
        ? 'Nenhum projeto em revisão.'
        : 'Nenhum projeto em revisão associado a você.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Em Revisão</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-em-revisao"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[${overviewMode ? '920' : '820'}px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                ${overviewMode ? '<th class="text-left p-3 font-semibold">Projetista</th>' : ''}
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Data Em Revisão</th>
                                ${overviewMode ? '' : '<th class="text-right p-3 font-semibold w-32">Ações</th>'}
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-em-revisao')
        ?.addEventListener('click', () => loadPendenciasEmRevisao());
}

async function loadPendenciasEmRevisao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasEmRevisao()) {
        renderPendenciasPlaceholder('Em Revisão', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, statusChangedAtByProject, approvalsByProject } =
        await fetchPendenciasEmRevisaoProjects();

    if (error) {
        renderPendenciasPlaceholder('Em Revisão', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEmRevisaoList(
        projects,
        statusChangedAtByProject,
        approvalsByProject,
        overviewMode
    );
}

function isPendenciasProjetoTecnicoOverviewMode() {
    return isAdmin() || isGestorProjetos();
}

function canAccessPendenciasProjetoTecnico() {
    return currentUser?.role === 'Projetista' || isAdmin() || isGestorProjetos();
}

function canSubmitCommercialApprovalFromPendencias(project, approval) {
    if (!project || isPendenciasProjetoTecnicoOverviewMode()) return false;
    if (approval && !isCommercialApprovalApproved(approval)) return false;
    if (currentUser?.role === 'Admin') return true;
    return currentUser?.role === 'Projetista'
        && Number(project.designerId) === Number(currentUser.id);
}

async function fetchPendenciasProjetoTecnicoProjects() {
    const overviewMode = isPendenciasProjetoTecnicoOverviewMode();
    const userId = Number(currentUser?.id);

    if (!overviewMode && !userId) {
        return {
            error: null,
            overviewMode,
            projects: [],
            approvalsByProject: {}
        };
    }

    const statusIds = await getPendenciasStatusIdsByNames([PENDENCIAS_STATUS_PROJETO_TECNICO]);
    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_PROJETO_TECNICO}" não encontrado.`),
            overviewMode,
            projects: [],
            approvalsByProject: {}
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
            approvalsByProject: {}
        };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);
    if (overviewMode) {
        projects = await enrichPendenciasProjectsWithDesigner(projects);
    }

    const approvalsByProject = await fetchCommercialApprovalsByProjectIds(
        projects.map(project => project.id)
    );

    return {
        error: null,
        overviewMode,
        projects,
        approvalsByProject
    };
}

function renderPendenciasProjetoTecnicoList(projects, approvalsByProject, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const designerName = project.designer?.name || '—';
        const approval = approvalsByProject[project.id];
        const canSubmit = canSubmitCommercialApprovalFromPendencias(project, approval);
        const actionCell = canSubmit
            ? `<button type="button" onclick="submitCommercialApprovalFromPendencias(${project.id})"
                class="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1 rounded-lg font-medium">Enviar para Aprovação</button>`
            : overviewMode
                ? '<span class="text-xs text-slate-300">—</span>'
                : approval && !isCommercialApprovalApproved(approval)
                    ? `<span class="text-xs text-amber-700">Aprovação em aberto</span>`
                    : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                ${overviewMode
                    ? `<td class="p-3 text-xs text-slate-700">${escapeHtml(designerName)}</td>`
                    : ''}
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                ${overviewMode ? '' : `<td class="p-3 text-right whitespace-nowrap">${actionCell}</td>`}
            </tr>
        `;
    }).join('');

    const subtitle = overviewMode
        ? 'Todos os projetos em projeto técnico.'
        : 'Projetos associados a você neste status.';
    const emptyMessage = overviewMode
        ? 'Nenhum projeto em projeto técnico.'
        : 'Nenhum projeto em projeto técnico associado a você.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Projeto Técnico</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-projeto-tecnico"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[${overviewMode ? '920' : '820'}px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                ${overviewMode ? '<th class="text-left p-3 font-semibold">Projetista</th>' : ''}
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                ${overviewMode ? '' : '<th class="text-right p-3 font-semibold w-44">Ações</th>'}
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-projeto-tecnico')
        ?.addEventListener('click', () => loadPendenciasProjetoTecnico());
}

async function loadPendenciasProjetoTecnico() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasProjetoTecnico()) {
        renderPendenciasPlaceholder('Projeto Técnico', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, approvalsByProject } =
        await fetchPendenciasProjetoTecnicoProjects();

    if (error) {
        renderPendenciasPlaceholder('Projeto Técnico', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasProjetoTecnicoList(projects, approvalsByProject, overviewMode);
}

function isPendenciasRequisicaoOverviewMode() {
    return isAdmin() || isGestorProjetos();
}

function canAccessPendenciasRequisicao() {
    return currentUser?.role === 'Projetista' || isAdmin() || isGestorProjetos();
}

function getPendenciasRequestProjectLabel(request) {
    const project = request?.orderProject;
    if (!project) return '—';
    const name = project.name || project.projectCode || '—';
    const env = project.environmentType?.name ? ` (${project.environmentType.name})` : '';
    return `${name}${env}`;
}

async function enrichPendenciasRequestsWithDesigner(requests) {
    if (!requests.length) return requests;
    if (requests.every(request => request.designerName || !request.designerId)) return requests;

    const designerIds = [...new Set(requests.map(request => request.designerId).filter(Boolean))];
    if (!designerIds.length) return requests;

    const { data: designers, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .in('id', designerIds);

    if (error) {
        console.error('enrichPendenciasRequestsWithDesigner:', error);
        return requests;
    }

    const designerById = Object.fromEntries((designers || []).map(user => [user.id, user.name]));
    return requests.map(request => ({
        ...request,
        designerName: request.designerName || designerById[request.designerId] || '—'
    }));
}

async function fetchPendenciasRequisicaoRequests() {
    const overviewMode = isPendenciasRequisicaoOverviewMode();
    const userId = Number(currentUser?.id);

    if (!overviewMode && !userId) {
        return { error: null, overviewMode, requests: [] };
    }

    const selectWithProject = `
        *,
        order:salesOrders(id, orderCode, clientName),
        orderProject:OrderProject(id, name, projectCode, environmentType:EnvironmentType(name))
    `;
    const selectFallback = `
        *,
        order:salesOrders(id, orderCode, clientName)
    `;

    let result = await supabaseClient
        .from('OrderRequest')
        .select(selectWithProject)
        .order('createdAt', { ascending: false });

    if (result.error?.message?.includes('orderProject')) {
        result = await supabaseClient
            .from('OrderRequest')
            .select(selectFallback)
            .order('createdAt', { ascending: false });
    }

    if (result.error) {
        return { error: result.error, overviewMode, requests: [] };
    }

    let requests = (result.data || []).filter(request => isRequestWaitingProjetista(request));

    if (!overviewMode) {
        requests = requests.filter(request => Number(request.designerId) === userId);
    }

    requests = sortOrderRequests(requests);

    if (overviewMode) {
        requests = await enrichPendenciasRequestsWithDesigner(requests);
    }

    pendenciasRequisicaoCache = requests;
    return { error: null, overviewMode, requests };
}

function renderPendenciasRequisicaoList(requests, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = requests.map(request => {
        const orderCode = request.order?.orderCode || '—';
        const clientName = request.order?.clientName || '—';
        const projectLabel = getPendenciasRequestProjectLabel(request);
        const designerName = request.designerName || '—';
        const canViewRequest = !overviewMode
            && isRequestWaitingProjetista(request)
            && canEditProjetistaResponse(request);
        const actionCell = canViewRequest
            ? `<button type="button" onclick="openRequestFromPendencias(${request.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Requisição</button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                ${overviewMode
                    ? `<td class="p-3 text-xs text-slate-700">${escapeHtml(designerName)}</td>`
                    : ''}
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${request.createdAt ? formatDate(request.createdAt) : '—'}</td>
                ${overviewMode ? '' : `<td class="p-3 text-right whitespace-nowrap">${actionCell}</td>`}
            </tr>
        `;
    }).join('');

    const subtitle = overviewMode
        ? 'Requisições em aberto aguardando resposta do projetista.'
        : 'Requisições aguardando sua resposta.';
    const emptyMessage = overviewMode
        ? 'Nenhuma requisição aguardando projetista.'
        : 'Nenhuma requisição aguardando sua resposta.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Requisição</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-requisicao"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${requests.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[${overviewMode ? '920' : '820'}px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                ${overviewMode ? '<th class="text-left p-3 font-semibold">Projetista</th>' : ''}
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Data Abertura</th>
                                ${overviewMode ? '' : '<th class="text-right p-3 font-semibold w-36">Ações</th>'}
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-requisicao')
        ?.addEventListener('click', () => loadPendenciasRequisicao());
}

async function loadPendenciasRequisicao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando requisições...</p>';
    }

    if (!canAccessPendenciasRequisicao()) {
        renderPendenciasPlaceholder('Requisição', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, requests } = await fetchPendenciasRequisicaoRequests();

    if (error) {
        renderPendenciasPlaceholder('Requisição', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasRequisicaoList(requests, overviewMode);
}

async function openRequestFromPendencias(requestId) {
    const id = Number(requestId);
    if (!id) return;

    let request = pendenciasRequisicaoCache.find(item => Number(item.id) === id);

    if (!request) {
        const selectWithProject = `
            *,
            order:salesOrders(id, orderCode, clientName),
            orderProject:OrderProject(id, name, projectCode, environmentType:EnvironmentType(name))
        `;
        let result = await supabaseClient
            .from('OrderRequest')
            .select(selectWithProject)
            .eq('id', id)
            .maybeSingle();

        if (result.error?.message?.includes('orderProject')) {
            result = await supabaseClient
                .from('OrderRequest')
                .select('*, order:salesOrders(id, orderCode, clientName)')
                .eq('id', id)
                .maybeSingle();
        }

        if (result.error || !result.data) {
            alertAppDialog('Requisição não encontrada.');
            return;
        }

        request = result.data;
    }

    if (!isRequestWaitingProjetista(request) || !canEditProjetistaResponse(request)) {
        alertAppDialog('Sem permissão para visualizar esta requisição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const cacheIndex = conversationsCache.findIndex(item => Number(item.id) === id);
    if (cacheIndex >= 0) {
        conversationsCache[cacheIndex] = { ...conversationsCache[cacheIndex], ...request };
    } else {
        conversationsCache = [...conversationsCache, request];
    }

    activeOrderId = request.orderId;
    await editConversation(id);
}

window.openRequestFromPendencias = openRequestFromPendencias;

function groupPendenciasProjectsByOrder(projects) {
    const byOrderId = {};

    (projects || []).forEach(project => {
        const orderId = Number(project.orderId);
        if (!orderId) return;

        if (!byOrderId[orderId]) {
            byOrderId[orderId] = {
                orderId,
                order: project.order || {},
                projects: []
            };
        }

        byOrderId[orderId].projects.push(project);
    });

    return Object.values(byOrderId)
        .map(orderGroup => ({
            ...orderGroup,
            projects: sortPendenciasByDeliveryDate(orderGroup.projects)
        }))
        .sort((a, b) => String(a.order?.orderCode || '').localeCompare(
            String(b.order?.orderCode || ''),
            'pt-BR',
            { numeric: true }
        ));
}

async function fetchPendenciasProjetistaAguardandoMedicaoOrders() {
    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_AGUARDANDO_MEDICAO);
    if (error) {
        if (error.message?.includes('não encontrado')) {
            return { error: null, orders: [] };
        }
        return { error, orders: [] };
    }

    return {
        error: null,
        orders: groupPendenciasProjectsByOrder(projects)
    };
}

async function fetchPendenciasProjetistaConferenciasOrders() {
    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_PLANTA_LEVANTADA);
    if (error) {
        if (error.message?.includes('não encontrado')) {
            return { error: null, orders: [] };
        }
        return { error, orders: [] };
    }

    return {
        error: null,
        orders: groupPendenciasProjectsByOrder(projects)
    };
}

function renderPendenciasProjetistaOrdersList(config) {
    const {
        title,
        subtitle,
        orders,
        emptyMessage,
        refreshButtonId,
        refreshHandler,
        actionLabel,
        actionButtonClass,
        actionButtonSelector
    } = config;

    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canCreateAsAdminOrConferente();
    const detailLabelFn = config.detailLabelFn || getPendenciasProjectDetailLabel;
    const rows = orders.map(orderGroup => {
        const orderCode = orderGroup.order?.orderCode || '—';
        const clientName = orderGroup.order?.clientName || '—';
        const projectCount = orderGroup.projects.length;
        const projectSummary = orderGroup.projects
            .map(project => detailLabelFn(project))
            .join(PENDENCIAS_DETAIL_SEPARATOR);
        const actionCell = canAct
            ? `<button type="button"
                class="${actionButtonSelector} text-xs px-2.5 py-1 rounded-lg font-medium ${actionButtonClass}"
                data-order-id="${orderGroup.orderId}">
                ${escapeHtml(actionLabel)}
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${projectCount} projeto${projectCount === 1 ? '' : 's'}</td>
                <td class="p-3 text-xs text-slate-500">${escapeHtml(projectSummary)}</td>
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
            ${orders.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[820px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projetos</th>
                                <th class="text-left p-3 font-semibold">Detalhe</th>
                                <th class="text-right p-3 font-semibold w-40">Ações</th>
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

    content.querySelectorAll(`.${actionButtonSelector}`).forEach(button => {
        button.addEventListener('click', async () => {
            config.onAction(Number(button.dataset.orderId));
        });
    });
}

function isPendenciasMedicaoTableMissingError(error) {
    const message = String(error?.message || '');
    return /relation.*"Medicao".*does not exist/i.test(message)
        || /relation.*Medicao.*does not exist/i.test(message);
}

async function fetchPendenciasAguardandoPlantaMedicoes() {
    const selectVariants = [
        `
            id, orderId, observation, createdAt, createdById,
            order:salesOrders(id, orderCode, clientName),
            medicaoProjects:MedicaoProject(
                id, orderProjectId, measurementDate, plantaLevantada, plantaLevantadaDate,
                orderProject:OrderProject(id, name, projectCode)
            )
        `,
        `
            id, orderId, observation, createdAt, createdById,
            order:salesOrders(id, orderCode, clientName),
            medicaoProjects:MedicaoProject(id, orderProjectId, measurementDate, plantaLevantada, plantaLevantadaDate)
        `,
        `
            id, orderId, observation, createdAt, createdById,
            medicaoProjects:MedicaoProject(id, orderProjectId, measurementDate, plantaLevantada, plantaLevantadaDate)
        `,
        'id, orderId, observation, createdAt, createdById'
    ];

    let result = { data: [], error: null };

    for (const selectColumns of selectVariants) {
        result = await supabaseClient
            .from('Medicao')
            .select(selectColumns)
            .order('createdAt', { ascending: false });

        if (!result.error) break;

        if (isPendenciasMedicaoTableMissingError(result.error)) {
            return { error: null, medicoes: [] };
        }
    }

    if (result.error) {
        console.error('fetchPendenciasAguardandoPlantaMedicoes:', result.error);
        return { error: result.error, medicoes: [] };
    }

    let medicoes = result.data || [];

    const orderIds = [...new Set(medicoes.map(medicao => Number(medicao.orderId)).filter(Boolean))];
    const projectIds = [...new Set(
        medicoes.flatMap(medicao =>
            (medicao.medicaoProjects || [])
                .map(project => Number(project.orderProjectId))
                .filter(Boolean)
        )
    )];

    let orderById = {};
    if (orderIds.length && medicoes.some(medicao => !medicao.order)) {
        const { data: orders } = await supabaseClient
            .from('salesOrders')
            .select('id, orderCode, clientName')
            .in('id', orderIds);

        orderById = Object.fromEntries((orders || []).map(order => [Number(order.id), order]));
    }

    let projectById = {};
    if (projectIds.length && medicoes.some(medicao =>
        (medicao.medicaoProjects || []).some(project => project.orderProjectId && !project.orderProject)
    )) {
        const { data: projects } = await supabaseClient
            .from('OrderProject')
            .select('id, name, projectCode')
            .in('id', projectIds);

        projectById = Object.fromEntries((projects || []).map(project => [Number(project.id), project]));
    }

    if (medicoes.some(medicao => !medicao.medicaoProjects)) {
        const medicaoIds = medicoes.map(medicao => medicao.id).filter(Boolean);
        if (medicaoIds.length) {
            const { data: medicaoProjects } = await supabaseClient
                .from('MedicaoProject')
                .select('id, medicaoId, orderProjectId, measurementDate, plantaLevantada, plantaLevantadaDate')
                .in('medicaoId', medicaoIds);

            const projectsByMedicaoId = {};
            (medicaoProjects || []).forEach(project => {
                const medicaoId = Number(project.medicaoId);
                if (!projectsByMedicaoId[medicaoId]) projectsByMedicaoId[medicaoId] = [];
                projectsByMedicaoId[medicaoId].push(project);
            });

            medicoes = medicoes.map(medicao => ({
                ...medicao,
                medicaoProjects: medicao.medicaoProjects || projectsByMedicaoId[Number(medicao.id)] || []
            }));
        }
    }

    medicoes = medicoes.map(medicao => ({
        ...medicao,
        order: medicao.order || orderById[Number(medicao.orderId)] || null,
        medicaoProjects: (medicao.medicaoProjects || []).map(project => ({
            ...project,
            orderProject: project.orderProject || projectById[Number(project.orderProjectId)] || null
        }))
    }));

    const openMedicoes = medicoes.filter(medicao => {
        const projects = medicao.medicaoProjects || [];
        return projects.length > 0 && projects.some(project => !project.plantaLevantada);
    });

    return { error: null, medicoes: openMedicoes };
}

function getPendenciasMedicaoProjectLabel(medicaoProject) {
    return medicaoProject?.orderProject?.name || 'Projeto';
}

function getPendenciasMedicaoPrimaryDate(medicao) {
    const dates = (medicao?.medicaoProjects || [])
        .map(project => project.measurementDate)
        .filter(Boolean)
        .sort();

    return dates[0] || null;
}

function renderPendenciasAguardandoPlantaList(medicoes) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canCreateAsAdminOrConferente();
    const rows = medicoes.map(medicao => {
        const orderCode = medicao.order?.orderCode || '—';
        const clientName = medicao.order?.clientName || '—';
        const measurementDate = formatPendenciasDeliveryDate(getPendenciasMedicaoPrimaryDate(medicao));
        const projectSummary = (medicao.medicaoProjects || [])
            .map(project => getPendenciasMedicaoProjectLabel(project))
            .join(PENDENCIAS_DETAIL_SEPARATOR);
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-projetista-editar-medicao-btn text-xs bg-teal-100 text-teal-800 hover:bg-teal-200 px-2.5 py-1 rounded-lg font-medium"
                data-medicao-id="${medicao.id}"
                data-order-id="${medicao.orderId}">
                Editar
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(measurementDate)}</td>
                <td class="p-3 text-xs text-slate-500">${escapeHtml(projectSummary)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aguardando Planta</h3>
                    <p class="text-xs text-slate-400 mt-0.5">Medições em aberto com projetos aguardando planta levantada.</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-projetista-aguardando-planta"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${medicoes.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[820px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Data medição</th>
                                <th class="text-left p-3 font-semibold">Projetos</th>
                                <th class="text-right p-3 font-semibold w-28">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhuma medição em aberto aguardando planta.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-projetista-aguardando-planta')
        ?.addEventListener('click', () => loadPendenciasProjetistaAguardandoPlanta());

    content.querySelectorAll('.pendencias-projetista-editar-medicao-btn').forEach(button => {
        button.addEventListener('click', async () => {
            openPendenciasEditarMedicao(
                Number(button.dataset.medicaoId),
                Number(button.dataset.orderId)
            );
        });
    });
}

async function openPendenciasEditarMedicao(medicaoId, orderId) {
    if (!canSeePendenciasProjetistaMedicaoConferenciaMenus()) {
        alertAppDialog('Sem permissão para editar medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    activeOrderId = Number(orderId);
    if (!activeOrderId || !medicaoId) return;

    if (typeof loadMedicoes === 'function') {
        await loadMedicoes(activeOrderId);
    }

    const medicao = medicoesCache.find(item => Number(item.id) === Number(medicaoId));
    if (medicao && typeof canEditMedicao === 'function' && !canEditMedicao(medicao)) {
        alertAppDialog('Sem permissão para editar esta medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (typeof openMedicaoModal === 'function') {
        await openMedicaoModal(medicaoId);
    }
}

window.openPendenciasEditarMedicao = openPendenciasEditarMedicao;

async function loadPendenciasProjetistaAguardandoPlanta() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando medições...</p>';
    }

    if (!canSeePendenciasProjetistaMedicaoConferenciaMenus()) {
        renderPendenciasPlaceholder('Aguardando Planta', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, medicoes } = await fetchPendenciasAguardandoPlantaMedicoes();

    if (error) {
        renderPendenciasPlaceholder('Aguardando Planta', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasAguardandoPlantaList(medicoes);
}

async function openPendenciasNovaMedicao(orderId) {
    if (!canSeePendenciasProjetistaMedicaoConferenciaMenus()) {
        alertAppDialog('Sem permissão para criar medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    activeOrderId = Number(orderId);
    if (!activeOrderId) return;

    if (typeof loadMedicoes === 'function') {
        await loadMedicoes(activeOrderId);
    }

    if (typeof openMedicaoModal === 'function') {
        await openMedicaoModal();
    }
}

async function openPendenciasNovaConferencia(orderId) {
    if (!canSeePendenciasProjetistaMedicaoConferenciaMenus()) {
        alertAppDialog('Sem permissão para criar conferência.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    activeOrderId = Number(orderId);
    if (!activeOrderId) return;

    if (typeof loadAnteprojetoConferences === 'function') {
        await loadAnteprojetoConferences(activeOrderId);
    }

    if (typeof openAnteprojetoModal === 'function') {
        await openAnteprojetoModal();
    }
}

window.openPendenciasNovaMedicao = openPendenciasNovaMedicao;
window.openPendenciasNovaConferencia = openPendenciasNovaConferencia;

async function loadPendenciasProjetistaAguardandoMedicao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando pedidos...</p>';
    }

    if (!canSeePendenciasProjetistaMedicaoConferenciaMenus()) {
        renderPendenciasPlaceholder('Aguardando Medição', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, orders } = await fetchPendenciasProjetistaAguardandoMedicaoOrders();

    if (error) {
        renderPendenciasPlaceholder('Aguardando Medição', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasProjetistaOrdersList({
        title: 'Aguardando Medição',
        subtitle: 'Pedidos com pelo menos um projeto aguardando medição.',
        orders,
        emptyMessage: 'Nenhum pedido com projeto aguardando medição.',
        refreshButtonId: 'btn-pendencias-refresh-projetista-aguardando-medicao',
        refreshHandler: () => loadPendenciasProjetistaAguardandoMedicao(),
        actionLabel: 'Nova Medição',
        actionButtonClass: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200',
        actionButtonSelector: 'pendencias-projetista-nova-medicao-btn',
        onAction: openPendenciasNovaMedicao
    });
}

async function loadPendenciasProjetistaConferencias() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando pedidos...</p>';
    }

    if (!canSeePendenciasProjetistaMedicaoConferenciaMenus()) {
        renderPendenciasPlaceholder('Conferências', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, orders } = await fetchPendenciasProjetistaConferenciasOrders();

    if (error) {
        renderPendenciasPlaceholder('Conferências', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasProjetistaOrdersList({
        title: 'Conferências',
        subtitle: 'Pedidos com pelo menos um projeto em planta levantada.',
        orders,
        emptyMessage: 'Nenhum pedido com projeto em planta levantada.',
        refreshButtonId: 'btn-pendencias-refresh-projetista-conferencias',
        refreshHandler: () => loadPendenciasProjetistaConferencias(),
        actionLabel: 'Nova Conferência',
        actionButtonClass: 'bg-lime-100 text-lime-800 hover:bg-lime-200',
        actionButtonSelector: 'pendencias-projetista-nova-conferencia-btn',
        onAction: openPendenciasNovaConferencia
    });
}

