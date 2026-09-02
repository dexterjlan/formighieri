async function savePendenciasTechnicalProjectForecast(projectId, inicioDate, previsaoDate, userId = undefined) {
    const statusId = typeof getOrderProjectTechnicalStatusId === 'function'
        ? await getOrderProjectTechnicalStatusId()
        : null;

    if (!statusId || typeof saveOrderProjectStatusForecast !== 'function') {
        return { error: null };
    }

    const payload = {
        orderProjectId: projectId,
        statusId,
        forecastStartDate: inicioDate,
        forecastEndDate: previsaoDate,
        updatedById: currentUser.id
    };

    if (userId !== undefined) {
        payload.userId = userId || null;
        payload.cabinetMakerId = null;
    }

    return saveOrderProjectStatusForecast(payload);
}

async function enrichPendenciasProjectsWithTechnicalForecast(projects) {
    const statusId = typeof getOrderProjectTechnicalStatusId === 'function'
        ? await getOrderProjectTechnicalStatusId()
        : null;

    if (!statusId || typeof enrichOrderProjectsWithStatusForecast !== 'function') {
        return projects;
    }

    return enrichOrderProjectsWithStatusForecast(projects, statusId);
}

async function fetchPendenciasAguardandoProjetoTecnico() {
    const aguardandoStatusId = await getPendenciasStatusIdByName(PENDENCIAS_STATUS_AGUARDANDO_PT);
    if (!aguardandoStatusId) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_AGUARDANDO_PT}" não encontrado.`),
            mine: []
        };
    }

    const overviewMode = typeof isPendenciasProjetistaOverviewMode === 'function'
        && isPendenciasProjetistaOverviewMode();
    const userId = Number(currentUser?.id);

    if (!overviewMode && !userId) {
        return { error: null, overviewMode, mine: [] };
    }

    const mineResult = await queryPendenciasProjects(
        overviewMode
            ? { statusId: aguardandoStatusId, assignedOnly: true }
            : { statusId: aguardandoStatusId, designerId: userId }
    );

    if (mineResult.error) {
        return { error: mineResult.error, mine: [], overviewMode };
    }

    let mine = mineResult.data || [];
    if (overviewMode && typeof enrichPendenciasProjectsWithDesigner === 'function') {
        mine = await enrichPendenciasProjectsWithDesigner(mine);
    }

    return {
        error: null,
        overviewMode,
        mine: sortPendenciasByForecastStartThenDelivery(mine)
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

function sortPendenciasByForecastStartThenDelivery(projects) {
    return [...projects].sort((a, b) => {
        const aHasForecast = Boolean(a.technicalProjectForecastStartDate);
        const bHasForecast = Boolean(b.technicalProjectForecastStartDate);

        if (aHasForecast !== bHasForecast) {
            return aHasForecast ? -1 : 1;
        }

        if (aHasForecast && bHasForecast) {
            const aTime = new Date(a.technicalProjectForecastStartDate).getTime();
            const bTime = new Date(b.technicalProjectForecastStartDate).getTime();
            if (aTime !== bTime) return aTime - bTime;
        } else {
            const aTime = a.deliveryDate ? new Date(a.deliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.deliveryDate ? new Date(b.deliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
            if (aTime !== bTime) return aTime - bTime;
        }

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

function validatePendenciasAssociacaoPrevisao(inicioDate, previsaoDate, deliveryDate) {
    if (!inicioDate) {
        alertAppDialog('Informe o início previsto do projeto técnico.');
        return false;
    }
    if (!previsaoDate) {
        alertAppDialog('Informe a previsão de conclusão do projeto técnico.');
        return false;
    }
    if (!isTechnicalProjectForecastRangeValid(inicioDate, previsaoDate, deliveryDate)) {
        alertAppDialog('O início deve ser anterior ou igual à previsão de conclusão.', { variant: 'warning', title: 'Aviso' });
        return false;
    }
    return true;
}

function getPendenciasPrevisaoValuesFromContainer(container) {
    return {
        inicioDate: container?.querySelector('.pendencias-previsao-inicio-input')?.value || '',
        previsaoDate: container?.querySelector('.pendencias-previsao-fim-input')?.value || ''
    };
}

function getPendenciasPrevisaoInputValue(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).slice(0, 10);
}

function renderPendenciasAssociacaoPrevisaoInputs(project) {
    const inicioValue = getPendenciasPrevisaoInputValue(project.technicalProjectForecastStartDate);
    const fimValue = getPendenciasPrevisaoInputValue(project.technicalProjectForecastEndDate);

    return `
        <div class="space-y-1.5">
            <label class="block text-[10px] text-slate-500">Início</label>
            <input type="date"
                class="pendencias-previsao-inicio-input w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
                data-project-id="${project.id}"
                ${inicioValue ? `value="${escapeHtml(inicioValue)}"` : ''}
                ${fimValue ? `max="${escapeHtml(fimValue)}"` : ''}
                title="Início previsto do projeto técnico">
            <label class="block text-[10px] text-slate-500 mt-1.5">Fim</label>
            <input type="date"
                class="pendencias-previsao-fim-input w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
                data-project-id="${project.id}"
                ${fimValue ? `value="${escapeHtml(fimValue)}"` : ''}
                title="Previsão de conclusão do projeto técnico">
        </div>
    `;
}

function renderPendenciasSemResponsavelProjectRow(project, characteristicsMap = new Map(), options = {}) {
    const mode = options.mode === 'projetista' ? 'projetista' : 'gestor';
    const showPrevisao = options.showPrevisao !== false;
    const showAction = options.showAction !== false;
    const orderCode = project.order?.orderCode || '—';
    const clientName = getOrderClientName(project.order) || '—';
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

    const previsaoCell = showPrevisao
        ? `<td class="p-3 pendencias-sem-projetista-previsao">
                ${renderPendenciasAssociacaoPrevisaoInputs(project)}
            </td>`
        : '';

    const actionCell = showAction && mode === 'gestor'
        ? `<button type="button"
                class="pendencias-gestor-associar-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
                data-project-id="${project.id}"
                data-delivery-date="${escapeHtml(getPendenciasPrevisaoInputMaxDate(project.deliveryDate))}">
                Associar
            </button>`
        : '';

    return `
        <tr class="border-b border-slate-100 last:border-0">
            <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
            <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
            <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
            <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
            <td class="p-3 text-xs text-slate-600 pendencias-sem-projetista-characteristics">${characteristicsCell}</td>
            ${previsaoCell}
            ${designerCell}
            ${showAction ? `<td class="p-3 text-right pendencias-sem-projetista-action">${actionCell}</td>` : ''}
        </tr>
    `;
}

function renderPendenciasSemResponsavelTableHead(showDesigner = true, options = {}) {
    const showPrevisao = options.showPrevisao !== false;
    const showAction = options.showAction !== false;

    return `
        <tr>
            <th class="text-left p-3 font-semibold">Pedido</th>
            <th class="text-left p-3 font-semibold">Cliente</th>
            <th class="text-left p-3 font-semibold">Projeto</th>
            <th class="text-left p-3 font-semibold">Entrega Proj. Téc.</th>
            <th class="text-left p-3 font-semibold min-w-[10rem]">Características</th>
            ${showPrevisao ? '<th class="text-left p-3 font-semibold min-w-[11rem]">Previsão</th>' : ''}
            ${showDesigner
                ? '<th class="text-left p-3 font-semibold min-w-[11rem]">Projetista</th>'
                : ''}
            ${showAction ? '<th class="text-right p-3 font-semibold w-28">Ação</th>' : ''}
        </tr>
    `;
}

function renderPendenciasWorkloadPrevisaoInputs(project) {
    const inicioValue = getPendenciasPrevisaoInputValue(project.technicalProjectForecastStartDate);
    const fimValue = getPendenciasPrevisaoInputValue(project.technicalProjectForecastEndDate);

    return `
        <div class="space-y-1.5">
            <label class="block text-[10px] text-slate-500">Início previsto</label>
            <input type="date"
                class="pendencias-workload-previsao-inicio-input w-full px-2 py-1 text-[11px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
                data-project-id="${project.id}"
                data-delivery-date="${escapeHtml(getPendenciasPrevisaoInputMaxDate(project.deliveryDate))}"
                ${inicioValue ? `value="${escapeHtml(inicioValue)}"` : ''}
                ${fimValue ? `max="${escapeHtml(fimValue)}"` : ''}
                title="Início previsto do projeto técnico">
            <label class="block text-[10px] text-slate-500 mt-1.5">Previsão conclusão</label>
            <input type="date"
                class="pendencias-workload-previsao-fim-input w-full px-2 py-1 text-[11px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
                data-project-id="${project.id}"
                data-delivery-date="${escapeHtml(getPendenciasPrevisaoInputMaxDate(project.deliveryDate))}"
                ${fimValue ? `value="${escapeHtml(fimValue)}"` : ''}
                title="Previsão de conclusão do projeto técnico">
        </div>
    `;
}

function renderPendenciasAguardandoProjetoTecnicoList(mine, overviewMode = false) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const renderRow = (project, mode, options = {}) => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = getOrderClientName(project.order) || '—';
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const projectLabel = getPendenciasProjectDetailLabel(project);
        const statusName = getPendenciasProjectStatusName(project);
        const showDesignerColumn = Boolean(options.showDesignerColumn);
        const showPrevisaoColumn = Boolean(options.showPrevisaoColumn);
        const showPrevisaoStartColumn = Boolean(options.showPrevisaoStartColumn);
        const showPrevisaoEndColumn = Boolean(options.showPrevisaoEndColumn);
        const showActionColumn = options.showActionColumn !== false;

        let actionCell = '';
        if (showActionColumn) {
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
        }

        const statusCell = !showActionColumn
            ? `<td class="p-3 text-xs text-slate-600 whitespace-nowrap">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${getPendenciasProjectStatusBadgeClass(statusName)}">${escapeHtml(statusName || '—')}</span>
                </td>`
            : '';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                ${showDesignerColumn
                    ? `<td class="p-3 text-xs text-slate-700">${escapeHtml(project.designer?.name || '—')}</td>`
                    : ''}
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                ${showPrevisaoStartColumn
                    ? `<td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(formatPendenciasDeliveryDate(project.technicalProjectForecastStartDate))}</td>`
                    : ''}
                ${showPrevisaoEndColumn
                    ? `<td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(formatPendenciasDeliveryDate(project.technicalProjectForecastEndDate))}</td>`
                    : ''}
                ${showPrevisaoColumn
                    ? `<td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(formatTechnicalProjectForecastRange(project.technicalProjectForecastStartDate, project.technicalProjectForecastEndDate))}</td>`
                    : ''}
                ${statusCell}
                ${showActionColumn ? `<td class="p-3 text-right">${actionCell}</td>` : ''}
            </tr>
        `;
    };

    const renderTable = (title, rows, emptyMessage, options = {}) => {
        const lastColumnLabel = options.lastColumnLabel || 'Ação';
        const showDesignerColumn = Boolean(options.showDesignerColumn);
        const showPrevisaoColumn = Boolean(options.showPrevisaoColumn);
        const showPrevisaoStartColumn = Boolean(options.showPrevisaoStartColumn);
        const showPrevisaoEndColumn = Boolean(options.showPrevisaoEndColumn);
        const showActionColumn = options.showActionColumn !== false;
        const showStatusColumn = !showActionColumn;

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
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                ${showDesignerColumn ? '<th class="text-left p-3 font-semibold">Projetista</th>' : ''}
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                ${showPrevisaoStartColumn
                                    ? '<th class="text-left p-3 font-semibold whitespace-nowrap">Início prev.</th>'
                                    : ''}
                                ${showPrevisaoEndColumn
                                    ? '<th class="text-left p-3 font-semibold whitespace-nowrap">Fim prev.</th>'
                                    : ''}
                                ${showPrevisaoColumn
                                    ? '<th class="text-left p-3 font-semibold">Previsão</th>'
                                    : ''}
                                ${showStatusColumn
                                    ? '<th class="text-left p-3 font-semibold">Status</th>'
                                    : ''}
                                ${showActionColumn
                                    ? `<th class="text-right p-3 font-semibold min-w-[18rem]">${escapeHtml(lastColumnLabel)}</th>`
                                    : ''}
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
            <div class="flex justify-end">
                <button type="button" id="btn-pendencias-refresh-aguardando-pt"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${renderTable(
                overviewMode ? 'Associados a projetistas' : 'Associados a mim',
                mine.map(project => renderRow(project, 'mine', {
                    showDesignerColumn: overviewMode,
                    showPrevisaoStartColumn: true,
                    showPrevisaoEndColumn: true,
                    showActionColumn: true
                })),
                overviewMode
                    ? 'Nenhum projeto associado a projetistas.'
                    : 'Nenhum projeto associado a você.',
                {
                    showDesignerColumn: overviewMode,
                    showPrevisaoStartColumn: true,
                    showPrevisaoEndColumn: true,
                    showActionColumn: true
                }
            )}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-aguardando-pt')
        ?.addEventListener('click', () => loadPendenciasAguardandoProjetoTecnico());

    content.querySelectorAll('.pendencias-iniciar-projeto-btn').forEach(button => {
        button.addEventListener('click', () => iniciarPendenciaProjetoTecnico(Number(button.dataset.projectId)));
    });
}

function normalizePendenciasWorkloadStatusName(statusName) {
    return typeof normalizeOrderProjectWorkloadStatusName === 'function'
        ? normalizeOrderProjectWorkloadStatusName(statusName)
        : statusName;
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
    return getPendenciasProjectDetailLabel(project);
}

function getPendenciasWorkloadAssigneeId(project, implementationDesignerByProjectId = {}) {
    const statusName = normalizePendenciasWorkloadStatusName(
        getPendenciasProjectStatusName(project)
    );
    if (statusName === PENDENCIAS_STATUS_IMPLANTACAO) {
        return Number(implementationDesignerByProjectId[Number(project.id)]?.designerId) || null;
    }
    return Number(project.designerId) || null;
}

function getPendenciasWorkloadAssigneeName(project, designerId, implementationDesignerByProjectId = {}) {
    const statusName = normalizePendenciasWorkloadStatusName(
        getPendenciasProjectStatusName(project)
    );
    if (statusName === PENDENCIAS_STATUS_IMPLANTACAO) {
        return implementationDesignerByProjectId[Number(project.id)]?.name || null;
    }
    if (Number(project.designerId) === Number(designerId)) {
        return project.designer?.name || null;
    }
    return null;
}

async function fetchPendenciasImplementationDesignerByProjectIds(projectIds) {
    const ids = [...new Set((projectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!ids.length) return {};

    let result = await supabaseClient
        .from('Implementation')
        .select('orderProjectId, designerId, createdById, designer:appUsers!Implementation_designerId_fkey(id, name), createdBy:appUsers!createdById(id, name)')
        .in('orderProjectId', ids);

    if (result.error?.message?.includes('designerId')) {
        result = await supabaseClient
            .from('Implementation')
            .select('orderProjectId, createdById, createdBy:appUsers!createdById(id, name)')
            .in('orderProjectId', ids);
    } else if (result.error?.message?.includes('designer') || result.error?.message?.includes('createdBy')) {
        result = await supabaseClient
            .from('Implementation')
            .select('orderProjectId, designerId, createdById')
            .in('orderProjectId', ids);
    }

    if (result.error) {
        console.warn('fetchPendenciasImplementationDesignerByProjectIds:', result.error);
        return {};
    }

    const byProjectId = {};
    (result.data || []).forEach(row => {
        const projectId = Number(row.orderProjectId);
        if (!projectId) return;

        const explicitDesignerId = Number(row.designerId) || null;
        const fallbackId = Number(row.createdById) || null;
        const designerId = explicitDesignerId || fallbackId;
        if (!designerId) return;

        if (byProjectId[projectId] && !explicitDesignerId) return;

        const designerEmbed = Array.isArray(row.designer) ? row.designer[0] : row.designer;
        const createdByEmbed = Array.isArray(row.createdBy) ? row.createdBy[0] : row.createdBy;
        byProjectId[projectId] = {
            designerId,
            name: (explicitDesignerId ? designerEmbed?.name : null) || createdByEmbed?.name || null
        };
    });

    return byProjectId;
}

function buildPendenciasProjetistaWorkloadRows(projetistas, projects, implementationDesignerByProjectId = {}) {
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
        const statusName = normalizePendenciasWorkloadStatusName(
            getPendenciasProjectStatusName(project)
        );
        if (!PENDENCIAS_GESTOR_WORKLOAD_COLUMNS.includes(statusName)) return;

        const designerId = getPendenciasWorkloadAssigneeId(project, implementationDesignerByProjectId);
        if (!designerId) return;

        if (!workloadByDesigner[designerId]) {
            workloadByDesigner[designerId] = {
                designerId,
                name: getPendenciasWorkloadAssigneeName(project, designerId, implementationDesignerByProjectId)
                    || 'Projetista',
                projects: []
            };
        }

        workloadByDesigner[designerId].projects.push({
            ...project,
            workloadAssigneeId: designerId
        });
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

    const projects = result.data || [];
    const implantacaoProjectIds = projects
        .filter(project => normalizePendenciasWorkloadStatusName(
            getPendenciasProjectStatusName(project)
        ) === PENDENCIAS_STATUS_IMPLANTACAO)
        .map(project => Number(project.id))
        .filter(Boolean);
    const implementationDesignerByProjectId = await fetchPendenciasImplementationDesignerByProjectIds(
        implantacaoProjectIds
    );

    return {
        error: null,
        projetistas,
        workload: buildPendenciasProjetistaWorkloadRows(
            projetistas,
            projects,
            implementationDesignerByProjectId
        )
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

async function fetchRevisionInProgressByOrderProjectIds(projectIds) {
    const uniqueIds = [...new Set((projectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return new Set();

    if (typeof fetchCommercialApprovalsByProjectIds !== 'function'
        || typeof fetchCommercialRevisionsByApprovalIds !== 'function'
        || typeof getLatestTechnicalRevisionByApproval !== 'function') {
        return new Set();
    }

    const approvalsByProject = await fetchCommercialApprovalsByProjectIds(uniqueIds);
    const approvalIds = [...new Set(
        Object.values(approvalsByProject).map(approval => approval?.id).filter(Boolean)
    )];
    if (!approvalIds.length) return new Set();

    const revisionsByApproval = await fetchCommercialRevisionsByApprovalIds(approvalIds);
    const inProgressProjectIds = new Set();

    Object.entries(approvalsByProject).forEach(([projectId, approval]) => {
        const revisions = revisionsByApproval[approval.id] || [];
        const latestRevision = getLatestTechnicalRevisionByApproval(revisions);
        if (latestRevision?.revisionStartedAt && !latestRevision?.revisionCompletedAt) {
            inProgressProjectIds.add(Number(projectId));
        }
    });

    return inProgressProjectIds;
}

async function fetchPendenciasWorkloadDetalhamentoByDesigner() {
    const { data, error } = await supabaseClient
        .from('Detailing')
        .select(`
            id, designerId, status, orderProjectId,
            orderProject:OrderProject(
                id, name, projectCode,
                order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
            )
        `)
        .not('designerId', 'is', null)
        .in('status', [
            typeof DETALHAMENTO_STATUS_AGUARDANDO !== 'undefined'
                ? DETALHAMENTO_STATUS_AGUARDANDO
                : 'Aguardando Detalhamento',
            typeof DETALHAMENTO_STATUS_EM_ANDAMENTO !== 'undefined'
                ? DETALHAMENTO_STATUS_EM_ANDAMENTO
                : 'Detalhamento'
        ]);

    if (error?.message?.includes('Detailing')) {
        return {};
    }

    if (error) {
        console.warn('fetchPendenciasWorkloadDetalhamentoByDesigner:', error);
        return {};
    }

    const byDesigner = {};
    (data || []).forEach(record => {
        const designerId = Number(record.designerId);
        if (!designerId) return;

        if (!byDesigner[designerId]) {
            byDesigner[designerId] = { records: [], inProgressCount: 0 };
        }

        byDesigner[designerId].records.push(record);
        const emAndamento = typeof DETALHAMENTO_STATUS_EM_ANDAMENTO !== 'undefined'
            ? DETALHAMENTO_STATUS_EM_ANDAMENTO
            : 'Detalhamento';
        if (record.status === emAndamento) {
            byDesigner[designerId].inProgressCount += 1;
        }
    });

    Object.values(byDesigner).forEach(entry => {
        entry.records.sort((a, b) => {
            const nameA = a.orderProject?.name || '';
            const nameB = b.orderProject?.name || '';
            return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
        });
    });

    return byDesigner;
}

function renderPendenciasWorkloadDetalhamentoSection(detalhamentoEntry = null) {
    const records = detalhamentoEntry?.records || [];
    const inProgressCount = detalhamentoEntry?.inProgressCount || 0;
    const statusClass = getPendenciasProjectStatusBadgeClass('Detalhamento');

    const projectsHtml = records.length
        ? records.map(record => {
            const project = record.orderProject || {};
            const clientName = getOrderClientName(project.order) || '—';
            const projectName = project.name || 'Projeto';
            const itemTitle = `${clientName} · ${projectName}`;
            const isInProgress = record.status === (
                typeof DETALHAMENTO_STATUS_EM_ANDAMENTO !== 'undefined'
                    ? DETALHAMENTO_STATUS_EM_ANDAMENTO
                    : 'Detalhamento'
            );

            return `
                <li class="border-b border-slate-100 last:border-0 py-1.5" data-detalhamento-id="${record.id}">
                    <div class="flex items-start gap-1.5 min-w-0">
                        <div class="min-w-0 flex-1">
                            <p class="text-[10px] text-slate-500 truncate" title="${escapeHtml(clientName)}">
                                ${escapeHtml(clientName)}
                            </p>
                            <p class="text-xs font-medium text-slate-800 truncate" title="${escapeHtml(itemTitle)}">
                                ${escapeHtml(projectName)}
                            </p>
                        </div>
                        ${isInProgress
                            ? '<span class="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 shrink-0">Em andamento</span>'
                            : '<span class="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600 shrink-0">Aguardando</span>'}
                    </div>
                </li>
            `;
        }).join('')
        : '<li class="text-xs text-slate-400 py-2">Nenhum detalhamento associado.</li>';

    return `
        <div class="collapsible-list-card border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div class="collapsible-list-header px-2 py-1.5 bg-slate-50/80 border-b border-slate-100 cursor-pointer">
                <div class="flex items-center gap-2 min-w-0">
                    <button type="button"
                        class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                        aria-label="Expandir">▶</button>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase truncate ${statusClass}">
                        Detalhamento
                    </span>
                    <span class="text-[10px] text-slate-500 shrink-0">${records.length}</span>
                    ${inProgressCount > 0
                        ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 shrink-0"
                            title="Detalhamento em andamento">${inProgressCount} em andamento</span>`
                        : ''}
                </div>
            </div>
            <div class="collapsible-list-body hidden">
                <ul class="px-2 py-1">${projectsHtml}</ul>
            </div>
        </div>
    `;
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

function renderPendenciasWorkloadStatusSections(projects, revisionInProgressIds = new Set()) {
    const grouped = groupPendenciasProjectsByStatus(projects);

    return PENDENCIAS_GESTOR_WORKLOAD_COLUMNS.map(statusName => {
        const statusProjects = grouped[statusName] || [];
        const statusClass = getPendenciasProjectStatusBadgeClass(statusName);
        const revisionInProgressCount = statusName === PENDENCIAS_STATUS_EM_REVISAO_TECNICA
            ? statusProjects.filter(project => revisionInProgressIds.has(Number(project.id))).length
            : 0;
        const projectsHtml = statusProjects.length
            ? statusProjects.map(project => {
                const clientName = getOrderClientName(project.order) || '—';
                const projectName = project.name || 'Projeto';
                const itemTitle = `${clientName} · ${projectName}`;
                const assigneeId = Number(project.workloadAssigneeId || project.designerId) || '';

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
                            <label class="block text-[10px] text-slate-500 mt-0.5">Previsão</label>
                            ${renderPendenciasWorkloadPrevisaoInputs(project)}
                            <label class="block text-[10px] text-slate-500 mt-2">Projetista</label>
                            <div class="flex items-center gap-1.5 mt-1">
                                <select class="pendencias-workload-designer-select flex-1 min-w-0 px-2 py-1 text-[11px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
                                    data-project-id="${project.id}"
                                    data-current-designer-id="${assigneeId}">
                                    <option value="">Selecione...</option>
                                    ${getPendenciasWorkloadProjetistaOptionsHtml(assigneeId)}
                                </select>
                                <button type="button"
                                    class="pendencias-workload-atualizar-btn shrink-0 text-[10px] bg-violet-700 text-white hover:bg-violet-800 px-2 py-1 rounded-lg font-medium whitespace-nowrap"
                                    data-project-id="${project.id}"
                                    data-current-designer-id="${assigneeId}"
                                    data-status-name="${escapeHtml(statusName)}"
                                    data-delivery-date="${escapeHtml(getPendenciasPrevisaoInputMaxDate(project.deliveryDate))}">
                                    Atualizar
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
                        ${revisionInProgressCount > 0
                            ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 shrink-0"
                                title="Revisão técnica em andamento">${revisionInProgressCount} em andamento</span>`
                            : ''}
                    </div>
                </div>
                <div class="collapsible-list-body hidden">
                    <ul class="px-2 py-1">${projectsHtml}</ul>
                </div>
            </div>
        `;
    }).join('');
}

function renderPendenciasProjetosSemProjetistas(
    workload,
    projects,
    characteristicsMap = new Map(),
    revisionInProgressIds = new Set(),
    detalhamentoByDesigner = {}
) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const workloadCards = workload.map(row => `
        <article class="flex-[1_1_16rem] min-w-[16rem] max-w-full border border-violet-200 rounded-xl bg-violet-50/20 shadow-sm overflow-hidden">
            <div class="px-3 py-2.5 border-b border-violet-100 bg-violet-50/70">
                <h4 class="font-bold text-sm text-slate-900">${escapeHtml(row.name)}</h4>
                <p class="text-[10px] text-slate-500 mt-0.5">${row.projects.length} projeto${row.projects.length === 1 ? '' : 's'}</p>
            </div>
            <div class="p-2 space-y-2">
                ${renderPendenciasWorkloadStatusSections(row.projects, revisionInProgressIds)}
                ${renderPendenciasWorkloadDetalhamentoSection(detalhamentoByDesigner[Number(row.designerId)] || null)}
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
                        <p class="text-xs text-slate-400 mt-0.5">Aguardando Projeto Técnico, Projeto Técnico, Em Revisão Comercial Cons., Em Revisão Comercial Proj., Aguardando Aprovação, Aguardando PPCP, Implantação e Detalhamento. Implantação conta para quem iniciou a implantação.</p>
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
        workloadCardsRoot.querySelectorAll('.pendencias-workload-atualizar-btn').forEach(button => {
            button.addEventListener('click', () => {
                const projectId = Number(button.dataset.projectId);
                const item = button.closest('li');
                const select = item?.querySelector('.pendencias-workload-designer-select');
                const inicioDate = item?.querySelector('.pendencias-workload-previsao-inicio-input')?.value || '';
                const previsaoDate = item?.querySelector('.pendencias-workload-previsao-fim-input')?.value || '';
                atualizarPendenciaProjetoWorkload(
                    projectId,
                    Number(select?.value) || null,
                    Number(button.dataset.currentDesignerId) || null,
                    inicioDate,
                    previsaoDate,
                    button.dataset.deliveryDate || '',
                    button.dataset.statusName || ''
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
            const previsaoValues = getPendenciasPrevisaoValuesFromContainer(row);
            associarPendenciaProjetoAProjetista(
                projectId,
                Number(select?.value),
                previsaoValues.inicioDate,
                previsaoValues.previsaoDate,
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
    const workloadProjects = (workloadResult.workload || []).flatMap(row => row.projects || []);
    await enrichPendenciasProjectsWithTechnicalForecast([
        ...(projectsResult.projects || []),
        ...workloadProjects
    ]);

    const characteristicsMap = typeof fetchOrderProjectCharacteristicsMap === 'function'
        ? await fetchOrderProjectCharacteristicsMap(projectIds)
        : new Map();

    const emRevisaoTecnicaProjectIds = (workloadResult.workload || []).flatMap(row => row.projects
        .filter(project => normalizePendenciasWorkloadStatusName(
            getPendenciasProjectStatusName(project)
        ) === PENDENCIAS_STATUS_EM_REVISAO_TECNICA)
        .map(project => Number(project.id))
    );
    const revisionInProgressIds = await fetchRevisionInProgressByOrderProjectIds(emRevisaoTecnicaProjectIds);
    const detalhamentoByDesigner = await fetchPendenciasWorkloadDetalhamentoByDesigner();

    renderPendenciasProjetosSemProjetistas(
        workloadResult.workload,
        projectsResult.projects,
        characteristicsMap,
        revisionInProgressIds,
        detalhamentoByDesigner
    );
}

async function atualizarPendenciaProjetoWorkload(projectId, newDesignerId, currentDesignerId, inicioDate, previsaoDate, deliveryDate = '', statusName = '') {
    if (!canSeePendenciasGestorProjetosMenu()) {
        alertAppDialog('Somente Gestor de Projetos pode atualizar projetos.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!projectId) return;

    if (!validatePendenciasAssociacaoPrevisao(inicioDate, previsaoDate, deliveryDate)) {
        return;
    }

    const isImplantacao = normalizePendenciasWorkloadStatusName(statusName) === PENDENCIAS_STATUS_IMPLANTACAO;
    const shouldChangeDesigner = Boolean(newDesignerId) && Number(newDesignerId) !== Number(currentDesignerId);
    let projetista = null;

    if (shouldChangeDesigner) {
        projetista = pendenciasProjetistasCache.find(item => Number(item.id) === Number(newDesignerId));
        if (!projetista) {
            alertAppDialog('Projetista inválido.');
            return;
        }

        const confirmMessage = isImplantacao
            ? `Transferir esta implantação para ${projetista.name}?`
            : `Transferir este projeto para ${projetista.name}?`;
        if (!(await confirmAppDialog(confirmMessage))) return;
    }

    const now = new Date().toISOString();
    const loadingMessage = shouldChangeDesigner ? 'Atualizando projeto...' : 'Salvando previsão...';

    try {
        setPendenciasActionLoading(true, loadingMessage);

        if (shouldChangeDesigner) {
            if (isImplantacao) {
                const { error } = await supabaseClient
                    .from('Implementation')
                    .update({
                        designerId: newDesignerId,
                        updatedById: currentUser.id,
                        updatedAt: now
                    })
                    .eq('orderProjectId', projectId);

                if (error?.message?.includes('designerId')) {
                    alertAppDialog('Execute supabase/feats/add-implementation-designer.sql no Supabase SQL Editor.', {
                        variant: 'warning',
                        title: 'Aviso'
                    });
                    return;
                }

                if (error) {
                    alertAppDialog('Erro ao atualizar implantação: ' + error.message);
                    return;
                }
            } else {
                const { error } = await supabaseClient
                    .from('OrderProject')
                    .update({
                        designerId: newDesignerId,
                        updatedById: currentUser.id,
                        updatedAt: now
                    })
                    .eq('id', projectId);

                if (error) {
                    alertAppDialog('Erro ao atualizar projeto: ' + error.message);
                    return;
                }

                if (typeof notifyDesignerAssignedToProjectEmail === 'function') {
                    const { data: projectMeta } = await supabaseClient
                        .from('OrderProject')
                        .select('orderId')
                        .eq('id', projectId)
                        .maybeSingle();

                    if (projectMeta?.orderId) {
                        await notifyDesignerAssignedToProjectEmail({
                            orderId: projectMeta.orderId,
                            orderProjectIds: [projectId],
                            designerId: newDesignerId
                        });
                    }
                }
            }
        }

        const forecastUserId = shouldChangeDesigner && !isImplantacao ? newDesignerId : undefined;
        const { error: forecastError } = await savePendenciasTechnicalProjectForecast(
            projectId,
            inicioDate,
            previsaoDate,
            forecastUserId
        );
        if (forecastError) {
            if (isOrderProjectStatusForecastTableError(forecastError.message)) {
                alertAppDialog('Execute supabase/feats/add-order-project-status-forecast.sql no Supabase para habilitar previsões por status.', { variant: 'warning', title: 'Aviso' });
            } else {
                alertAppDialog('Erro ao salvar previsão: ' + forecastError.message);
            }
            return;
        }

        await loadPendenciasProjetosSemProjetistas();
    } finally {
        setPendenciasActionLoading(false);
    }
}

async function associarPendenciaProjetoAProjetista(projectId, designerId, inicioDate, previsaoDate, deliveryDate = '') {
    if (!canSeePendenciasGestorProjetosMenu()) {
        alertAppDialog('Somente Gestor de Projetos pode associar responsáveis.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!projectId || !designerId) {
        alertAppDialog('Selecione um projetista.');
        return;
    }

    if (!validatePendenciasAssociacaoPrevisao(inicioDate, previsaoDate, deliveryDate)) {
        return;
    }

    const projetista = pendenciasProjetistasCache.find(item => Number(item.id) === Number(designerId));
    if (!projetista) {
        alertAppDialog('Projetista inválido.');
        return;
    }

    if (!(await confirmAppDialog(`Associar este projeto a ${projetista.name}?`))) return;

    const now = new Date().toISOString();

    try {
        setPendenciasActionLoading(true, 'Associando projetista...');

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

        const { error: forecastError } = await savePendenciasTechnicalProjectForecast(
            projectId,
            inicioDate,
            previsaoDate,
            designerId
        );
        if (forecastError) {
            if (isOrderProjectStatusForecastTableError(forecastError.message)) {
                alertAppDialog('Projetista associado, mas a tabela de previsão ainda não existe. Execute supabase/feats/add-order-project-status-forecast.sql no Supabase.', { variant: 'warning', title: 'Aviso' });
            } else {
                alertAppDialog('Erro ao salvar previsão: ' + forecastError.message);
                return;
            }
        }

        const { data: projectMeta } = await supabaseClient
            .from('OrderProject')
            .select('orderId')
            .eq('id', projectId)
            .maybeSingle();

        if (typeof notifyDesignerAssignedToProjectEmail === 'function' && projectMeta?.orderId) {
            await notifyDesignerAssignedToProjectEmail({
                orderId: projectMeta.orderId,
                orderProjectIds: [projectId],
                designerId
            });
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

    const { error, mine, overviewMode } = await fetchPendenciasAguardandoProjetoTecnico();
    if (error) {
        renderPendenciasPlaceholder(
            'Aguardando Projeto Técnico',
            `Erro ao carregar: ${error.message}`
        );
        return;
    }

    renderPendenciasAguardandoProjetoTecnicoList(mine || [], overviewMode);
}
