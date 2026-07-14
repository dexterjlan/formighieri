async function loadPendenciasAguardandoMedicao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasAguardandoMedicao()) {
        renderPendenciasPlaceholder('Aguardando Medição', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects } = await fetchPendenciasAguardandoMedicaoProjects();

    if (error) {
        renderPendenciasPlaceholder('Aguardando Medição', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasAguardandoMedicaoList(projects);
}

function canAccessPendenciasAprovarConferencia() {
    return canSeePendenciasGestorComercialMenu();
}

async function fetchPendenciasConferenceByProjectIds(projectIds, conferenceStatus = 'Confirmada') {
    if (!projectIds.length) return {};

    let result = await supabaseClient
        .from('AnteprojetoConferenceProject')
        .select(`
            orderProjectId,
            conference:AnteprojetoConference(id, orderId, status, createdAt)
        `)
        .in('orderProjectId', projectIds);

    if (result.error?.message?.includes('AnteprojetoConference')) {
        result = await supabaseClient
            .from('AnteprojetoConferenceProject')
            .select('orderProjectId, conferenceId')
            .in('orderProjectId', projectIds);
    }

    if (result.error) {
        console.error('fetchPendenciasConferenceByProjectIds:', result.error);
        return {};
    }

    const conferenceIds = [...new Set(
        (result.data || [])
            .map(row => row.conference?.id || row.conferenceId)
            .filter(Boolean)
    )];

    let conferenceById = {};
    if (conferenceIds.length) {
        const { data: conferences, error } = await supabaseClient
            .from('AnteprojetoConference')
            .select('id, orderId, status, createdAt')
            .in('id', conferenceIds);

        if (error) {
            console.error('fetchPendenciasConferenceByProjectIds conferences:', error);
            return {};
        }

        conferenceById = Object.fromEntries((conferences || []).map(item => [item.id, item]));
    }

    const map = {};
    (result.data || []).forEach(row => {
        const projectId = Number(row.orderProjectId);
        const conference = row.conference
            || conferenceById[row.conferenceId]
            || null;

        if (!conference || conference.status !== conferenceStatus) return;

        const existing = map[projectId];
        const conferenceTime = conference.createdAt ? new Date(conference.createdAt).getTime() : 0;
        const existingTime = existing?.createdAt ? new Date(existing.createdAt).getTime() : 0;
        if (!existing || conferenceTime >= existingTime) {
            map[projectId] = conference;
        }
    });

    return map;
}

async function fetchPendenciasAprovarConferenciaProjects() {
    const statusIds = await getPendenciasStatusIdsByNames([PENDENCIAS_STATUS_CONFERENCIA_REALIZADA]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_CONFERENCIA_REALIZADA}" não encontrado.`),
            projects: [],
            conferenceByProjectId: {}
        };
    }

    const result = await queryPendenciasProjects({ statusIds });
    if (result.error) {
        return { error: result.error, projects: [], conferenceByProjectId: {} };
    }

    const projects = sortPendenciasByDeliveryDate(result.data || []);
    const conferenceByProjectId = await fetchPendenciasConferenceByProjectIds(
        projects.map(project => project.id),
        'Confirmada'
    );
    const conferenceIds = [...new Set(
        Object.values(conferenceByProjectId).map(conference => conference?.id).filter(Boolean)
    )];
    const conferenceDetailsById = await fetchPendenciasConferenceDetailsByIds(conferenceIds);

    return { error: null, projects, conferenceByProjectId, conferenceDetailsById };
}

function renderPendenciasAprovarConferenciaList(projects, conferenceByProjectId, conferenceDetailsById) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const conferenceGroups = groupPendenciasConsultorConferenciaByConference(projects, conferenceByProjectId);
    const subtitle = isGestorComercial()
        ? 'Conferências confirmadas aguardando aprovação comercial.'
        : 'Visualização das conferências confirmadas aguardando aprovação.';

    const rows = conferenceGroups.map(group => {
        const orderCode = group.order?.orderCode || '—';
        const clientName = group.order?.clientName || '—';
        const projectSummary = getPendenciasConsultorConferenciaProjectSummary(group.projects);
        const deliveryDates = group.projects
            .map(project => project.deliveryDate)
            .filter(Boolean)
            .sort();
        const deliveryDate = formatPendenciasDeliveryDate(deliveryDates[0]);
        const conference = group.conference;
        const canView = Boolean(conference?.id);
        const fullConference = conference?.id ? conferenceDetailsById?.[conference.id] || null : null;
        const canApprove = fullConference
            && typeof canApproveAnteprojetoConference === 'function'
            && canApproveAnteprojetoConference(fullConference);
        const canReturn = fullConference
            && typeof canReturnAnteprojetoConferenceToConsultor === 'function'
            && canReturnAnteprojetoConferenceToConsultor(fullConference);
        const actionButtons = [];

        if (canView) {
            actionButtons.push(`<button type="button" onclick="openAnteprojetoConferenceFromPendencias(${conference.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Conferência</button>`);
        }
        if (canReturn) {
            actionButtons.push(`<button type="button" onclick="showAnteprojetoReturnObservationForm(${conference.id})"
                class="text-xs bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-200 px-2.5 py-1 rounded-lg font-medium">Voltar p/ Consultor</button>`);
        }
        if (canApprove) {
            actionButtons.push(`<button type="button" onclick="approveAnteprojetoConferenceFromPendencias(${conference.id})"
                class="text-xs bg-indigo-100 text-indigo-800 hover:bg-indigo-200 px-2.5 py-1 rounded-lg font-medium">Aprovar</button>`);
        }

        const actionCell = actionButtons.length
            ? `<div class="flex flex-wrap justify-end gap-1">${actionButtons.join('')}</div>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs text-slate-500">${escapeHtml(projectSummary)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aprovar Conferência</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-aprovar-conferencia"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${conferenceGroups.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[820px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projetos</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-72">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhuma conferência confirmada aguardando aprovação.</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-aprovar-conferencia')
        ?.addEventListener('click', () => loadPendenciasAprovarConferencia());
}

async function loadPendenciasAprovarConferencia() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasAprovarConferencia()) {
        renderPendenciasPlaceholder('Aprovar Conferência', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects, conferenceByProjectId, conferenceDetailsById } =
        await fetchPendenciasAprovarConferenciaProjects();

    if (error) {
        renderPendenciasPlaceholder('Aprovar Conferência', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasAprovarConferenciaList(projects, conferenceByProjectId, conferenceDetailsById);
}

function isPendenciasConsultorConferenciaOverviewMode() {
    return isAdmin() || isGestorComercial();
}

function canAccessPendenciasConsultorConferencia() {
    return canSeePendenciasConsultorMenu();
}

async function fetchPendenciasConsultorConferenciaProjects() {
    const overviewMode = isPendenciasConsultorConferenciaOverviewMode();
    const statusIds = await getPendenciasStatusIdsByNames([PENDENCIAS_STATUS_CONFERENCIA_ENVIADA]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_CONFERENCIA_ENVIADA}" não encontrado.`),
            overviewMode,
            projects: [],
            conferenceByProjectId: {}
        };
    }

    const result = await queryPendenciasProjects({ statusIds });
    if (result.error) {
        return { error: result.error, overviewMode, projects: [], conferenceByProjectId: {} };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);

    if (!overviewMode) {
        projects = projects.filter(project => {
            const consultantName = project.order?.consultantName;
            return Boolean(consultantName && currentUser?.name === consultantName);
        });
    }

    const conferenceByProjectId = await fetchPendenciasConferenceByProjectIds(
        projects.map(project => project.id),
        'Em andamento'
    );
    const conferenceIds = [...new Set(
        Object.values(conferenceByProjectId).map(conference => conference?.id).filter(Boolean)
    )];
    const conferenceDetailsById = await fetchPendenciasConferenceDetailsByIds(conferenceIds);

    return { error: null, overviewMode, projects, conferenceByProjectId, conferenceDetailsById };
}

function groupPendenciasConsultorConferenciaByConference(projects, conferenceByProjectId) {
    const groupsByKey = new Map();

    (projects || []).forEach(project => {
        const conference = conferenceByProjectId[project.id];
        const groupKey = conference?.id ? `conference-${conference.id}` : `project-${project.id}`;

        if (!groupsByKey.has(groupKey)) {
            groupsByKey.set(groupKey, {
                conference: conference || null,
                order: project.order || {},
                projects: []
            });
        }

        groupsByKey.get(groupKey).projects.push(project);
    });

    return [...groupsByKey.values()]
        .map(group => ({
            ...group,
            projects: sortPendenciasByDeliveryDate(group.projects)
        }))
        .sort((a, b) => {
            const orderA = a.order?.orderCode || '';
            const orderB = b.order?.orderCode || '';
            const orderCompare = String(orderA).localeCompare(String(orderB), 'pt-BR', { numeric: true });
            if (orderCompare !== 0) return orderCompare;

            const dateA = a.conference?.createdAt ? new Date(a.conference.createdAt).getTime() : 0;
            const dateB = b.conference?.createdAt ? new Date(b.conference.createdAt).getTime() : 0;
            return dateB - dateA;
        });
}

function getPendenciasConsultorConferenciaProjectSummary(projects) {
    const labelFn = typeof getPendenciasProjectDetailLabel === 'function'
        ? getPendenciasProjectDetailLabel
        : project => project?.name || 'Projeto';
    const separator = typeof PENDENCIAS_DETAIL_SEPARATOR === 'string'
        ? PENDENCIAS_DETAIL_SEPARATOR
        : ' | ';

    return (projects || []).map(labelFn).join(separator);
}

function isPendenciasConferenceAllConsultorChecked(conference) {
    if (!conference || typeof getConferenceModuleObservations !== 'function') return false;
    const moduleObservations = getConferenceModuleObservations(conference);
    return moduleObservations.length > 0
        && moduleObservations.every(obs => obs.consultorChecked);
}

async function fetchPendenciasConferenceDetailsByIds(conferenceIds) {
    const detailsById = {};
    if (!conferenceIds.length || typeof fetchAnteprojetoConferenceById !== 'function') {
        return detailsById;
    }

    const uniqueIds = [...new Set(conferenceIds.filter(Boolean))];
    await Promise.all(uniqueIds.map(async conferenceId => {
        const conference = await fetchAnteprojetoConferenceById(conferenceId);
        if (conference) {
            detailsById[conferenceId] = conference;
        }
    }));

    return detailsById;
}

function renderPendenciasConsultorConferenciaList(projects, conferenceByProjectId, conferenceDetailsById, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const conferenceGroups = groupPendenciasConsultorConferenciaByConference(projects, conferenceByProjectId);
    const subtitle = overviewMode
        ? 'Conferências enviadas aguardando retorno do consultor.'
        : 'Conferências dos seus pedidos aguardando retorno.';

    const rows = conferenceGroups.map(group => {
        const orderCode = group.order?.orderCode || '—';
        const clientName = group.order?.clientName || '—';
        const projectSummary = getPendenciasConsultorConferenciaProjectSummary(group.projects);
        const deliveryDates = group.projects
            .map(project => project.deliveryDate)
            .filter(Boolean)
            .sort();
        const deliveryDate = formatPendenciasDeliveryDate(deliveryDates[0]);
        const conference = group.conference;
        const canView = Boolean(conference?.id);
        const fullConference = conference?.id ? conferenceDetailsById?.[conference.id] || null : null;
        const canConfirm = fullConference
            && typeof canConfirmAnteprojetoConference === 'function'
            && canConfirmAnteprojetoConference(fullConference);
        const allChecked = isPendenciasConferenceAllConsultorChecked(fullConference);
        const actionButtons = [];

        if (canView) {
            actionButtons.push(`<button type="button" onclick="openAnteprojetoConferenceFromPendencias(${conference.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Conferência</button>`);
        }
        if (canConfirm) {
            actionButtons.push(`<button type="button" onclick="confirmAnteprojetoConferenceFromPendencias(${conference.id})"
                class="text-xs px-2.5 py-1 rounded-lg font-medium ${allChecked ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}"
                ${allChecked ? '' : 'disabled'}>Confirmar Conferência</button>`);
        }

        const actionCell = actionButtons.length
            ? `<div class="flex flex-wrap justify-end gap-1">${actionButtons.join('')}</div>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs text-slate-500">${escapeHtml(projectSummary)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    const emptyMessage = overviewMode
        ? 'Nenhuma conferência enviada aguardando retorno.'
        : 'Nenhuma conferência enviada nos seus pedidos.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Conferência</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-consultor-conferencia"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${conferenceGroups.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[820px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projetos</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-56">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-consultor-conferencia')
        ?.addEventListener('click', () => loadPendenciasConsultorConferencia());
}

async function loadPendenciasConsultorConferencia() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canAccessPendenciasConsultorConferencia()) {
        renderPendenciasPlaceholder('Conferência', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, conferenceByProjectId, conferenceDetailsById } =
        await fetchPendenciasConsultorConferenciaProjects();

    if (error) {
        renderPendenciasPlaceholder('Conferência', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasConsultorConferenciaList(projects, conferenceByProjectId, conferenceDetailsById, overviewMode);
}

function enrichPendenciasApprovalWithProject(approval, project) {
    if (!approval) return null;
    return {
        ...approval,
        orderId: approval.orderId || project?.orderId,
        orderConsultantName: project?.order?.consultantName || approval.orderConsultantName
    };
}

async function fetchPendenciasConsultorAguardandoAprovacaoProjects() {
    const overviewMode = isPendenciasConsultorConferenciaOverviewMode();
    const statusIds = await getPendenciasStatusIdsByNames([PENDENCIAS_STATUS_AGUARDANDO_APROVACAO]);

    if (!statusIds.length) {
        return {
            error: new Error(`Status "${PENDENCIAS_STATUS_AGUARDANDO_APROVACAO}" não encontrado.`),
            overviewMode,
            projects: [],
            approvalsByProject: {}
        };
    }

    const result = await queryPendenciasProjects({ statusIds });
    if (result.error) {
        return { error: result.error, overviewMode, projects: [], approvalsByProject: {} };
    }

    let projects = sortPendenciasByDeliveryDate(result.data || []);

    if (!overviewMode) {
        projects = projects.filter(project => {
            const consultantName = project.order?.consultantName;
            return Boolean(consultantName && currentUser?.name === consultantName);
        });
    }

    const approvalsByProjectRaw = await fetchCommercialApprovalsByProjectIds(
        projects.map(project => project.id)
    );

    const approvalsByProject = {};
    projects = projects.filter(project => {
        const approval = enrichPendenciasApprovalWithProject(
            approvalsByProjectRaw[project.id],
            project
        );
        if (!approval || approval.status !== PENDENCIAS_STATUS_AGUARDANDO_APROVACAO) {
            return false;
        }
        approvalsByProject[project.id] = approval;
        return true;
    });

    pendenciasAguardandoAprovacaoCache = Object.values(approvalsByProject);

    return { error: null, overviewMode, projects, approvalsByProject };
}

function renderPendenciasConsultorAguardandoAprovacaoList(projects, approvalsByProject, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const subtitle = overviewMode
        ? 'Todos os projetos aguardando aprovação comercial.'
        : 'Projetos dos seus pedidos aguardando aprovação comercial.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = typeof getPendenciasProjectDetailLabel === 'function'
            ? getPendenciasProjectDetailLabel(project)
            : (project?.name || 'Projeto');
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const approval = approvalsByProject[project.id];
        const canApprove = approval
            && typeof canApproveCommercialApproval === 'function'
            && canApproveCommercialApproval(approval);
        const showRequestRevision = approval
            && typeof canRequestNewRevision === 'function'
            && canRequestNewRevision(approval);
        const actionButtons = [];

        if (canApprove) {
            actionButtons.push(`<button type="button" onclick="approveCommercialApprovalFromPendencias(${approval.id})"
                class="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1 rounded-lg font-medium">Aprovar</button>`);
        }
        if (showRequestRevision) {
            actionButtons.push(`<button type="button" onclick="openCommercialRevisionFromPendencias(${approval.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Solicitar Revisão</button>`);
        }

        const actionCell = actionButtons.length
            ? `<div class="flex flex-wrap justify-end gap-1">${actionButtons.join('')}</div>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    const emptyMessage = overviewMode
        ? 'Nenhum projeto aguardando aprovação.'
        : 'Nenhum projeto aguardando aprovação nos seus pedidos.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aguardando Aprovação</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-consultor-aprovacao"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[820px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
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

    content.querySelector('#btn-pendencias-refresh-consultor-aprovacao')
        ?.addEventListener('click', () => loadPendenciasConsultorAguardandoAprovacao());
}

async function loadPendenciasConsultorAguardandoAprovacao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasConsultorMenu()) {
        renderPendenciasPlaceholder('Aguardando Aprovação', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, projects, approvalsByProject } =
        await fetchPendenciasConsultorAguardandoAprovacaoProjects();

    if (error) {
        renderPendenciasPlaceholder('Aguardando Aprovação', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasConsultorAguardandoAprovacaoList(projects, approvalsByProject, overviewMode);
}

async function ensureCommercialApprovalInPendenciasContext(approvalId) {
    const id = Number(approvalId);
    if (!id) return null;

    let approval = pendenciasAguardandoAprovacaoCache.find(item => Number(item.id) === id);

    if (!approval) {
        const columnSets = [
            'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt, status',
            'id, orderId, orderProjectId, projectName, designerId, approved, approvedAt'
        ];

        for (const columns of columnSets) {
            const { data, error } = await supabaseClient
                .from('CommercialApproval')
                .select(columns)
                .eq('id', id)
                .maybeSingle();

            if (!error && data) {
                approval = normalizeCommercialApproval(data);
                break;
            }
        }
    }

    if (!approval) return null;

    if (!approval.orderConsultantName && approval.orderId) {
        const { data: orderInfo } = await supabaseClient
            .from('salesOrders')
            .select('consultantName')
            .eq('id', approval.orderId)
            .maybeSingle();
        approval = {
            ...approval,
            orderConsultantName: orderInfo?.consultantName || approval.orderConsultantName
        };
    }

    activeOrderId = approval.orderId;
    const cacheIndex = commercialApprovalsCache.findIndex(item => Number(item.id) === id);
    if (cacheIndex >= 0) {
        commercialApprovalsCache[cacheIndex] = { ...commercialApprovalsCache[cacheIndex], ...approval };
    } else {
        commercialApprovalsCache = [...commercialApprovalsCache, approval];
    }

    return approval;
}

async function approveCommercialApprovalFromPendencias(approvalId) {
    const approval = await ensureCommercialApprovalInPendenciasContext(approvalId);

    if (!approval) {
        alertAppDialog('Solicitação comercial não encontrada.');
        return;
    }

    if (!canApproveCommercialApproval(approval)) {
        alertAppDialog('Sem permissão para aprovar esta solicitação.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    await approveCommercialApproval(approval.id);
}

async function openCommercialRevisionFromPendencias(approvalId) {
    const approval = await ensureCommercialApprovalInPendenciasContext(approvalId);

    if (!approval) {
        alertAppDialog('Solicitação comercial não encontrada.');
        return;
    }

    if (typeof openCommercialRevisionModal !== 'function') {
        alertAppDialog('Recurso de revisão indisponível.');
        return;
    }

    await openCommercialRevisionModal(approval.id);
}

window.approveCommercialApprovalFromPendencias = approveCommercialApprovalFromPendencias;
window.openCommercialRevisionFromPendencias = openCommercialRevisionFromPendencias;

async function fetchPendenciasConsultorRequisicaoRequests() {
    const overviewMode = isPendenciasConsultorConferenciaOverviewMode();

    const selectWithProject = `
        *,
        order:salesOrders(id, orderCode, clientName, consultantName),
        orderProject:OrderProject(id, name, projectCode, environmentType:EnvironmentType(name))
    `;
    const selectFallback = `
        *,
        order:salesOrders(id, orderCode, clientName, consultantName)
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

    let requests = (result.data || []).filter(request => isRequestWaitingConsultor(request));

    if (!overviewMode) {
        requests = requests.filter(request => {
            const consultantName = request.order?.consultantName;
            return Boolean(consultantName && currentUser?.name === consultantName);
        });
    }

    requests = sortOrderRequests(requests);

    if (overviewMode) {
        requests = await enrichPendenciasRequestsWithDesigner(requests);
    }

    pendenciasConsultorRequisicaoCache = requests;
    return { error: null, overviewMode, requests };
}

function renderPendenciasConsultorRequisicaoList(requests, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const subtitle = overviewMode
        ? 'Requisições em aberto aguardando resposta do consultor.'
        : 'Requisições dos seus pedidos aguardando sua resposta.';

    const rows = requests.map(request => {
        const orderCode = request.order?.orderCode || '—';
        const clientName = request.order?.clientName || '—';
        const projectLabel = getPendenciasRequestProjectLabel(request);
        const designerName = request.designerName || '—';
        const canShowRequest = overviewMode
            ? currentUser?.role === 'Admin'
            : isRequestWaitingConsultor(request) && canRespondAsConsultor(request);
        const actionCell = canShowRequest
            ? `<button type="button" onclick="openConsultorRequestFromPendencias(${request.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Mostrar Requisição</button>`
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
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    const emptyMessage = overviewMode
        ? 'Nenhuma requisição aguardando consultor.'
        : 'Nenhuma requisição aguardando sua resposta.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Requisições</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-consultor-requisicoes"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
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
                                <th class="text-right p-3 font-semibold w-40">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(emptyMessage)}</p>`}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-consultor-requisicoes')
        ?.addEventListener('click', () => loadPendenciasConsultorRequisicoes());
}

async function loadPendenciasConsultorRequisicoes() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando requisições...</p>';
    }

    if (!canSeePendenciasConsultorMenu()) {
        renderPendenciasPlaceholder('Requisições', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, overviewMode, requests } = await fetchPendenciasConsultorRequisicaoRequests();

    if (error) {
        renderPendenciasPlaceholder('Requisições', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasConsultorRequisicaoList(requests, overviewMode);
}

async function openConsultorRequestFromPendencias(requestId) {
    const id = Number(requestId);
    if (!id) return;

    let request = pendenciasConsultorRequisicaoCache.find(item => Number(item.id) === id);

    if (!request) {
        const selectWithProject = `
            *,
            order:salesOrders(id, orderCode, clientName, consultantName),
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
                .select('*, order:salesOrders(id, orderCode, clientName, consultantName)')
                .eq('id', id)
                .maybeSingle();
        }

        if (result.error || !result.data) {
            alertAppDialog('Requisição não encontrada.');
            return;
        }

        request = result.data;
    }

    if (!isRequestWaitingConsultor(request)) {
        alertAppDialog('Esta requisição não está aguardando resposta do consultor.');
        return;
    }

    const canOpen = currentUser?.role === 'Admin'
        || canRespondAsConsultor(request)
        || canEditConversation(request);

    if (!canOpen) {
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

window.openConsultorRequestFromPendencias = openConsultorRequestFromPendencias;

async function iniciarPendenciaProjetoTecnico(projectId) {
    if (!projectId) return;

    const statusId = await getPendenciasStatusIdByName(PENDENCIAS_STATUS_PROJETO_TECNICO);
    if (!statusId) {
        alertAppDialog(`Status "${PENDENCIAS_STATUS_PROJETO_TECNICO}" não encontrado.`);
        return;
    }

    const { data: project, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, designerId')
        .eq('id', projectId)
        .maybeSingle();

    if (readError || !project) {
        alertAppDialog('Projeto não encontrado.');
        return;
    }

    if (Number(project.designerId) !== Number(currentUser?.id) && !isAdmin()) {
        alertAppDialog('Somente o responsável do projeto pode iniciá-lo.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!(await confirmAppDialog('Iniciar projeto técnico deste projeto?'))) return;

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
        alertAppDialog('Erro ao iniciar projeto: ' + error.message);
        return;
    }

    await loadPendenciasAguardandoProjetoTecnico();
}
