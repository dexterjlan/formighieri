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

function getPendenciasPrevisaoInputMaxDate(deliveryDate) {
    if (!deliveryDate) return '';
    return String(deliveryDate).slice(0, 10);
}

function validatePendenciasAssociacaoPrevisao(previsaoDate, deliveryDate) {
    if (!previsaoDate) {
        alertAppDialog('Informe a previsão de conclusão do projeto técnico.');
        return false;
    }
    if (!isPrevisaoConclusaoProjetoTecnicoValid(previsaoDate, deliveryDate)) {
        alertAppDialog('A previsão de conclusão deve ser anterior ou igual à data de entrega do projeto técnico.', { variant: 'warning', title: 'Aviso' });
        return false;
    }
    return true;
}

function getPendenciasPrevisaoInputValue(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).slice(0, 10);
}

function renderPendenciasAssociacaoPrevisaoInput(project) {
    const maxDate = getPendenciasPrevisaoInputMaxDate(project.deliveryDate);
    return `<input type="date"
        class="pendencias-previsao-input w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
        data-project-id="${project.id}"
        ${maxDate ? `max="${escapeHtml(maxDate)}"` : ''}
        title="Previsão de conclusão do projeto técnico">`;
}

function renderPendenciasSemResponsavelProjectRow(project, characteristicsMap = new Map(), options = {}) {
    const mode = options.mode === 'projetista' ? 'projetista' : 'gestor';
    const orderCode = project.order?.orderCode || '—';
    const clientName = project.order?.clientName || '—';
    const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
    const projectLabel = getPendenciasProjectDetailLabel(project);
    const characteristicRows = characteristicsMap.get(Number(project.id)) || [];
    const characteristicsCell = typeof renderPendenciasProjectCharacteristicsCell === 'function'
        ? renderPendenciasProjectCharacteristicsCell(characteristicRows)
        : 'Nenhuma';

    const designerCell = mode === 'gestor'
        ? `<td class="p-3 pendencias-sem-projetista-designer">
                <select class="pendencias-gestor-designer-select w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
                    data-project-id="${project.id}">
                    <option value="">Selecione...</option>
                    ${getPendenciasProjetistaOptionsHtml()}
                </select>
            </td>`
        : '';

    const actionCell = mode === 'gestor'
        ? `<button type="button"
                class="pendencias-gestor-associar-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
                data-project-id="${project.id}"
                data-delivery-date="${escapeHtml(getPendenciasPrevisaoInputMaxDate(project.deliveryDate))}">
                Associar
            </button>`
        : `<button type="button"
                class="pendencias-associar-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
                data-project-id="${project.id}"
                data-delivery-date="${escapeHtml(getPendenciasPrevisaoInputMaxDate(project.deliveryDate))}">
                Associar a mim
            </button>`;

    return `
        <tr class="border-b border-slate-100 last:border-0">
            <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
            <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
            <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
            <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
            <td class="p-3 text-xs text-slate-600 pendencias-sem-projetista-characteristics">${characteristicsCell}</td>
            <td class="p-3 pendencias-sem-projetista-previsao">
                ${renderPendenciasAssociacaoPrevisaoInput(project)}
            </td>
            ${designerCell}
            <td class="p-3 text-right pendencias-sem-projetista-action">${actionCell}</td>
        </tr>
    `;
}

function renderPendenciasSemResponsavelTableHead(showDesigner = true) {
    return `
        <tr>
            <th class="text-left p-3 font-semibold">Pedido</th>
            <th class="text-left p-3 font-semibold">Cliente</th>
            <th class="text-left p-3 font-semibold">Projeto</th>
            <th class="text-left p-3 font-semibold">Entrega Proj. Téc.</th>
            <th class="text-left p-3 font-semibold min-w-[10rem]">Características</th>
            <th class="text-left p-3 font-semibold min-w-[9.5rem]">Previsão</th>
            ${showDesigner
                ? '<th class="text-left p-3 font-semibold min-w-[11rem]">Projetista</th>'
                : ''}
            <th class="text-right p-3 font-semibold w-28">Ação</th>
        </tr>
    `;
}

function renderPendenciasWorkloadPrevisaoInput(project) {
    const maxDate = getPendenciasPrevisaoInputMaxDate(project.deliveryDate);
    const value = getPendenciasPrevisaoInputValue(project.previsaoConclusaoProjetoTecnico);
    return `<input type="date"
        class="pendencias-workload-previsao-input w-full mt-1.5 px-2 py-1 text-[11px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
        data-project-id="${project.id}"
        data-delivery-date="${escapeHtml(getPendenciasPrevisaoInputMaxDate(project.deliveryDate))}"
        ${value ? `value="${escapeHtml(value)}"` : ''}
        ${maxDate ? `max="${escapeHtml(maxDate)}"` : ''}
        title="Previsão de conclusão do projeto técnico">`;
}

function renderPendenciasAguardandoProjetoTecnicoList(unassigned, mine, characteristicsMap = new Map()) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const renderUnassignedTable = () => {
        const rows = unassigned.map(project => renderPendenciasSemResponsavelProjectRow(
            project,
            characteristicsMap,
            { mode: 'projetista' }
        ));

        return `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Sem responsável</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${unassigned.length} projeto${unassigned.length === 1 ? '' : 's'}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-aguardando-pt"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${unassigned.length
                ? `<div class="overflow-x-auto">
                    <table class="pendencias-sem-projetista-table w-full text-sm min-w-[60rem]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            ${renderPendenciasSemResponsavelTableHead(false)}
                        </thead>
                        <tbody>${rows.join('')}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto aguardando projeto técnico sem responsável.</p>'}
        </div>
    `;
    };

    const renderRow = (project, mode, options = {}) => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const previsaoConclusao = formatPendenciasDeliveryDate(project.previsaoConclusaoProjetoTecnico);
        const projectLabel = project.projectCode
            ? `${project.projectCode} — ${project.name || 'Projeto'}`
            : (project.name || 'Projeto');
        const statusName = getPendenciasProjectStatusName(project);
        const showPrevisaoColumn = Boolean(options.showPrevisaoColumn);

        let actionCell = '';
        if (statusName === PENDENCIAS_STATUS_AGUARDANDO_PT) {
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
                ${showPrevisaoColumn
                    ? `<td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(previsaoConclusao)}</td>`
                    : ''}
                <td class="p-3 text-right">${actionCell}</td>
            </tr>
        `;
    };

    const renderTable = (title, rows, emptyMessage, options = {}) => {
        const lastColumnLabel = options.lastColumnLabel || 'Ação';
        const showPrevisaoColumn = Boolean(options.showPrevisaoColumn);

        return `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">${escapeHtml(title)}</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${rows.length} projeto${rows.length === 1 ? '' : 's'}</p>
                </div>
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
                                ${showPrevisaoColumn
                                    ? '<th class="text-left p-3 font-semibold">Previsão conclusão</th>'
                                    : ''}
                                <th class="text-right p-3 font-semibold min-w-[18rem]">${escapeHtml(lastColumnLabel)}</th>
                            </tr>
                        </thead>
                        <tbody>${rows.join('')}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;
    };

    content.innerHTML = `
        <div class="space-y-4">
            ${renderUnassignedTable()}
            ${renderTable(
                'Associados a mim',
                mine.map(project => renderRow(project, 'mine', { showPrevisaoColumn: true })),
                'Nenhum projeto associado a você.',
                { lastColumnLabel: 'Status', showPrevisaoColumn: true }
            )}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-aguardando-pt')
        ?.addEventListener('click', () => loadPendenciasAguardandoProjetoTecnico());

    content.querySelectorAll('.pendencias-associar-btn').forEach(button => {
        button.addEventListener('click', () => {
            const row = button.closest('tr');
            const previsaoDate = row?.querySelector('.pendencias-previsao-input')?.value || '';
            associarPendenciaProjetoAMim(
                Number(button.dataset.projectId),
                previsaoDate,
                button.dataset.deliveryDate || ''
            );
        });
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

function getPendenciasWorkloadProjetistaOptionsHtml(currentDesignerId = null) {
    return pendenciasProjetistasCache
        .filter(projetista => Number(projetista.id) !== Number(currentDesignerId))
        .map(projetista => `<option value="${projetista.id}">${escapeHtml(projetista.name)}</option>`)
        .join('');
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
                const clientName = project.order?.clientName || '—';
                const projectName = project.name || 'Projeto';
                const itemTitle = `${clientName} · ${projectName}`;

                return `
                    <li class="collapsible-list-card border-b border-slate-100 last:border-0" data-project-id="${project.id}">
                        <div class="collapsible-list-header py-1.5 cursor-pointer">
                            <div class="flex items-center gap-1.5 min-w-0">
                                <button type="button"
                                    class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                                    aria-label="Expandir">▶</button>
                                <div class="min-w-0">
                                    <p class="text-[10px] text-slate-500 truncate" title="${escapeHtml(clientName)}">
                                        ${escapeHtml(clientName)}
                                    </p>
                                    <p class="text-xs font-medium text-slate-800 truncate" title="${escapeHtml(itemTitle)}">
                                        ${escapeHtml(projectName)}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div class="collapsible-list-body hidden pl-6 pr-1 pb-2">
                            <label class="block text-[10px] text-slate-500 mt-0.5">Previsão conclusão</label>
                            ${renderPendenciasWorkloadPrevisaoInput(project)}
                            <label class="block text-[10px] text-slate-500 mt-2">Trocar projetista</label>
                            <div class="flex items-center gap-1.5 mt-1">
                                <select class="pendencias-workload-designer-select flex-1 min-w-0 px-2 py-1 text-[11px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
                                    data-project-id="${project.id}"
                                    data-current-designer-id="${project.designerId || ''}">
                                    <option value="">Selecione...</option>
                                    ${getPendenciasWorkloadProjetistaOptionsHtml(project.designerId)}
                                </select>
                                <button type="button"
                                    class="pendencias-workload-trocar-projetista-btn shrink-0 text-[10px] bg-violet-700 text-white hover:bg-violet-800 px-2 py-1 rounded-lg font-medium whitespace-nowrap"
                                    data-project-id="${project.id}"
                                    data-current-designer-id="${project.designerId || ''}"
                                    data-delivery-date="${escapeHtml(getPendenciasPrevisaoInputMaxDate(project.deliveryDate))}">
                                    Trocar
                                </button>
                            </div>
                        </div>
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

function renderPendenciasProjetosSemProjetistas(workload, projects, characteristicsMap = new Map()) {
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

    const projectRows = projects.map(project => renderPendenciasSemResponsavelProjectRow(
        project,
        characteristicsMap,
        { mode: 'gestor' }
    )).join('');

    content.innerHTML = `
        <div class="space-y-4">
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                    <div>
                        <h3 class="font-bold text-sm text-slate-900">Carga por projetista</h3>
                        <p class="text-xs text-slate-400 mt-0.5">Aguardando Projeto Técnico, Projeto Técnico, Em Revisão, Aguardando Aprovação e Aguardando PPCP.</p>
                    </div>
                    <button type="button" id="btn-pendencias-refresh-sem-projetistas"
                        class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                        ${renderRefreshButtonInnerHtml()}
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
                        <table class="pendencias-sem-projetista-table w-full text-sm min-w-[72rem]">
                            <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                                ${renderPendenciasSemResponsavelTableHead(true)}
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
        workloadCardsRoot.querySelectorAll('.pendencias-workload-previsao-input').forEach(input => {
            input.addEventListener('change', () => {
                salvarPendenciasWorkloadPrevisaoConclusao(
                    Number(input.dataset.projectId),
                    input.value,
                    input.dataset.deliveryDate || ''
                );
            });
        });
        workloadCardsRoot.querySelectorAll('.pendencias-workload-trocar-projetista-btn').forEach(button => {
            button.addEventListener('click', () => {
                const projectId = Number(button.dataset.projectId);
                const item = button.closest('li');
                const select = item?.querySelector('.pendencias-workload-designer-select');
                const previsaoDate = item?.querySelector('.pendencias-workload-previsao-input')?.value || '';
                trocarPendenciaProjetoProjetista(
                    projectId,
                    Number(select?.value),
                    Number(button.dataset.currentDesignerId),
                    previsaoDate,
                    button.dataset.deliveryDate || ''
                );
            });
        });
    }

    content.querySelectorAll('.pendencias-gestor-associar-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const projectId = Number(button.dataset.projectId);
            const row = button.closest('tr');
            const select = row?.querySelector('.pendencias-gestor-designer-select')
                || content.querySelector(`.pendencias-gestor-designer-select[data-project-id="${projectId}"]`);
            const previsaoDate = row?.querySelector('.pendencias-previsao-input')?.value || '';
            associarPendenciaProjetoAProjetista(
                projectId,
                Number(select?.value),
                previsaoDate,
                button.dataset.deliveryDate || ''
            );
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

    const projectIds = (projectsResult.projects || []).map(project => Number(project.id)).filter(Boolean);
    const characteristicsMap = typeof fetchOrderProjectCharacteristicsMap === 'function'
        ? await fetchOrderProjectCharacteristicsMap(projectIds)
        : new Map();

    renderPendenciasProjetosSemProjetistas(workloadResult.workload, projectsResult.projects, characteristicsMap);
}

async function salvarPendenciasWorkloadPrevisaoConclusao(projectId, previsaoDate, deliveryDate = '') {
    if (!canSeePendenciasGestorProjetosMenu()) {
        alertAppDialog('Somente Gestor de Projetos pode alterar a previsão.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!projectId) return;

    if (!validatePendenciasAssociacaoPrevisao(previsaoDate, deliveryDate)) {
        await loadPendenciasProjetosSemProjetistas();
        return;
    }

    const now = new Date().toISOString();
    const payload = {
        previsaoConclusaoProjetoTecnico: previsaoDate,
        updatedById: currentUser.id,
        updatedAt: now
    };

    try {
        setPendenciasActionLoading(true, 'Salvando previsão...');

        const { error } = await supabaseClient
            .from('OrderProject')
            .update(payload)
            .eq('id', projectId);

        if (error?.message?.includes('previsaoConclusaoProjetoTecnico')) {
            alertAppDialog('O campo de previsão ainda não existe no banco. Execute supabase/create-order-project-previsao-conclusao.sql no Supabase.', { variant: 'warning', title: 'Aviso' });
            return;
        }

        if (error) {
            alertAppDialog('Erro ao salvar previsão: ' + error.message);
            return;
        }

        await loadPendenciasProjetosSemProjetistas();
    } finally {
        setPendenciasActionLoading(false);
    }
}

async function trocarPendenciaProjetoProjetista(projectId, newDesignerId, currentDesignerId, previsaoDate, deliveryDate = '') {
    if (!canSeePendenciasGestorProjetosMenu()) {
        alertAppDialog('Somente Gestor de Projetos pode trocar responsáveis.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!projectId || !newDesignerId) {
        alertAppDialog('Selecione o novo projetista.');
        return;
    }

    if (Number(newDesignerId) === Number(currentDesignerId)) {
        alertAppDialog('Selecione um projetista diferente do responsável atual.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!validatePendenciasAssociacaoPrevisao(previsaoDate, deliveryDate)) {
        return;
    }

    const projetista = pendenciasProjetistasCache.find(item => Number(item.id) === Number(newDesignerId));
    if (!projetista) {
        alertAppDialog('Projetista inválido.');
        return;
    }

    if (!(await confirmAppDialog(`Transferir este projeto para ${projetista.name}?`))) return;

    const now = new Date().toISOString();
    const payload = {
        designerId: newDesignerId,
        previsaoConclusaoProjetoTecnico: previsaoDate,
        updatedById: currentUser.id,
        updatedAt: now
    };

    try {
        setPendenciasActionLoading(true, 'Trocando projetista...');

        let { error } = await supabaseClient
            .from('OrderProject')
            .update(payload)
            .eq('id', projectId);

        if (error?.message?.includes('previsaoConclusaoProjetoTecnico')) {
            ({ error } = await supabaseClient
                .from('OrderProject')
                .update({
                    designerId: newDesignerId,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', projectId));
            if (!error) {
                alertAppDialog('Projetista alterado, mas o campo de previsão ainda não existe no banco. Execute supabase/create-order-project-previsao-conclusao.sql no Supabase.', { variant: 'warning', title: 'Aviso' });
            }
        }

        if (error) {
            alertAppDialog('Erro ao trocar projetista: ' + error.message);
            return;
        }

        await loadPendenciasProjetosSemProjetistas();
    } finally {
        setPendenciasActionLoading(false);
    }
}

async function associarPendenciaProjetoAProjetista(projectId, designerId, previsaoDate, deliveryDate = '') {
    if (!canSeePendenciasGestorProjetosMenu()) {
        alertAppDialog('Somente Gestor de Projetos pode associar responsáveis.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!projectId || !designerId) {
        alertAppDialog('Selecione um projetista.');
        return;
    }

    if (!validatePendenciasAssociacaoPrevisao(previsaoDate, deliveryDate)) {
        return;
    }

    const projetista = pendenciasProjetistasCache.find(item => Number(item.id) === Number(designerId));
    if (!projetista) {
        alertAppDialog('Projetista inválido.');
        return;
    }

    if (!(await confirmAppDialog(`Associar este projeto a ${projetista.name}?`))) return;

    const now = new Date().toISOString();
    const payload = {
        designerId,
        previsaoConclusaoProjetoTecnico: previsaoDate,
        updatedById: currentUser.id,
        updatedAt: now
    };

    try {
        setPendenciasActionLoading(true, 'Associando projetista...');

        let { error } = await supabaseClient
            .from('OrderProject')
            .update(payload)
            .eq('id', projectId);

        if (error?.message?.includes('previsaoConclusaoProjetoTecnico')) {
            ({ error } = await supabaseClient
                .from('OrderProject')
                .update({
                    designerId,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', projectId));
            if (!error) {
                alertAppDialog('Projetista associado, mas o campo de previsão ainda não existe no banco. Execute supabase/create-order-project-previsao-conclusao.sql no Supabase.', { variant: 'warning', title: 'Aviso' });
            }
        }

        if (error) {
            alertAppDialog('Erro ao associar projetista: ' + error.message);
            return;
        }

        await loadPendenciasProjetosSemProjetistas();
    } finally {
        setPendenciasActionLoading(false);
    }
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

    const unassignedIds = (unassigned || []).map(project => Number(project.id)).filter(Boolean);
    const characteristicsMap = typeof fetchOrderProjectCharacteristicsMap === 'function'
        ? await fetchOrderProjectCharacteristicsMap(unassignedIds)
        : new Map();

    renderPendenciasAguardandoProjetoTecnicoList(unassigned, mine, characteristicsMap);
}

async function associarPendenciaProjetoAMim(projectId, previsaoDate, deliveryDate = '') {
    if (typeof associarProjetoTecnicoAMim !== 'function') {
        alertAppDialog('Módulo de projeto técnico não carregado.');
        return;
    }

    try {
        setPendenciasActionLoading(true, 'Associando projeto...');
        await associarProjetoTecnicoAMim(projectId, previsaoDate, deliveryDate);
    } finally {
        setPendenciasActionLoading(false);
    }
}
