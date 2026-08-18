function formatOrderExportDate(value) {
    if (!value) return '—';
    if (typeof formatGestaoDate === 'function') return formatGestaoDate(value);
    if (typeof formatDate === 'function') return formatDate(value);
    return String(value);
}

function formatOrderExportDateTime(value) {
    if (!value) return '—';
    if (typeof formatGestaoDateTime === 'function') return formatGestaoDateTime(value);
    if (typeof formatDate === 'function') return formatDate(value);
    return String(value);
}

function formatOrderExportDuration(seconds) {
    if (!seconds && seconds !== 0) return '—';
    if (typeof formatStatusDurationSeconds === 'function') {
        return formatStatusDurationSeconds(seconds) || '—';
    }
    return '—';
}

function orderExportField(label, value) {
    const display = value == null || value === '' ? '—' : String(value);
    return `
        <div class="order-export-field">
            <div class="order-export-field__label">${escapeHtml(label)}</div>
            <div class="order-export-field__value">${escapeHtml(display)}</div>
        </div>
    `;
}

function orderExportSection(title, bodyHtml, options = {}) {
    const extraClass = options.pageBreakBefore ? ' order-export-section--page-break' : '';
    return `
        <section class="order-export-section${extraClass}">
            <h2 class="order-export-section__title">${escapeHtml(title)}</h2>
            ${bodyHtml}
        </section>
    `;
}

function orderExportEmpty(message) {
    return `<p class="order-export-empty">${escapeHtml(message)}</p>`;
}

function orderExportSubheading(title) {
    return `<h3 class="order-export-subheading">${escapeHtml(title)}</h3>`;
}

async function fetchOrderExportOrder(orderId) {
    const primary = await supabaseClient
        .from('salesOrders')
        .select(`*, creator:appUsers!salesOrders_createdById_fkey(name), ${SALES_ORDER_RELATIONS_SELECT}`)
        .eq('id', orderId)
        .single();

    if (!primary.error && primary.data) return primary.data;

    if (primary.error?.message?.includes('Client') || primary.error?.message?.includes('consultor')) {
        const fallback = await supabaseClient
            .from('salesOrders')
            .select('*, creator:appUsers!salesOrders_createdById_fkey(name)')
            .eq('id', orderId)
            .single();
        if (!fallback.error && fallback.data) return fallback.data;
    }

    throw primary.error || new Error('Pedido não encontrado.');
}

async function fetchOrderExportProjects(orderId) {
    const selectVariants = [
        `id, orderId, projectCode, name, deliveryDate, deliveryPhaseId,
        technicalProjectForecastStartDate, technicalProjectForecastEndDate, technicalProjectCompletedDate,
        statusId, designerId, approvalNetworkPath, cabinetMakerId,
        internalAssemblyStartDate, internalAssemblyEndDate, productionMonth,
        isComplementary, parentProjectId, isReplaced, replacedByProjectId, isReplacement, replacesProjectId,
        environmentType:EnvironmentType(name),
        projectStatus:OrderProjectStatus(id, name),
        designer:appUsers!OrderProject_designerId_fkey(id, name),
        cabinetMaker:CabinetMaker(id, name),
        parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)),
        replacedBy:replacedByProjectId(projectCode, order:salesOrders(orderCode)),
        replaces:replacesProjectId(projectCode, order:salesOrders(orderCode))`,
        `id, orderId, projectCode, name, deliveryDate, deliveryPhaseId,
        technicalProjectForecastStartDate, technicalProjectForecastEndDate, technicalProjectCompletedDate,
        statusId, designerId, approvalNetworkPath, cabinetMakerId,
        internalAssemblyStartDate, internalAssemblyEndDate, productionMonth,
        environmentType:EnvironmentType(name),
        projectStatus:OrderProjectStatus(id, name),
        designer:appUsers!OrderProject_designerId_fkey(id, name)`,
        `id, orderId, projectCode, name, deliveryDate, statusId, designerId,
        cabinetMakerId, internalAssemblyStartDate, internalAssemblyEndDate,
        environmentType:EnvironmentType(name),
        projectStatus:OrderProjectStatus(id, name)`
    ];

    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .eq('orderId', orderId)
            .order('createdAt', { ascending: true });

        if (!error && Array.isArray(data)) {
            let projects = data;
            if (typeof enrichOrderProjectsWithStatus === 'function') {
                projects = await enrichOrderProjectsWithStatus(projects);
            }
            if (typeof enrichOrderProjectsWithDesigner === 'function') {
                projects = await enrichOrderProjectsWithDesigner(projects);
            }
            if (typeof enrichProjectMarceneiro === 'function') {
                projects = await Promise.all(projects.map(project => enrichProjectMarceneiro(project)));
            }
            return projects;
        }

        if (error?.message?.includes('cabinetMaker') || error?.message?.includes('CabinetMaker')
            || error?.message?.includes('parentProject') || error?.message?.includes('technicalProject')) {
            continue;
        }
    }

    if (typeof fetchOrderProjectsForOrder === 'function') {
        return fetchOrderProjectsForOrder(orderId);
    }

    return [];
}

async function fetchOrderExportMedicoes(orderId) {
    let result = await supabaseClient
        .from('Measurement')
        .select(`
            *,
            measurementProjects:MeasurementProject(
                *,
                orderProject:OrderProject(id, name, environmentType:EnvironmentType(name))
            )
        `)
        .eq('orderId', orderId)
        .order('createdAt', { ascending: false });

    if (result.error?.message?.includes('MeasurementProject')) {
        result = await supabaseClient
            .from('Measurement')
            .select('*')
            .eq('orderId', orderId)
            .order('createdAt', { ascending: false });
    }

    if (result.error) return [];

    let medicoes = result.data || [];
    if (typeof enrichMedicoes === 'function') {
        medicoes = await enrichMedicoes(medicoes, orderId);
    }
    return medicoes;
}

async function fetchOrderExportConferences(orderId) {
    let result = await supabaseClient
        .from('PreliminaryDesignConference')
        .select(`
            *,
            conferenceProjects:PreliminaryDesignConferenceProject(
                *,
                orderProject:OrderProject(id, name, statusId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)),
                modules:PreliminaryDesignModule(
                    *,
                    observations:PreliminaryDesignModuleObservation(
                        *,
                        observation:PreliminaryDesignObservation(id, text)
                    )
                )
            )
        `)
        .eq('orderId', orderId)
        .order('createdAt', { ascending: false });

    if (result.error?.message?.includes('PreliminaryDesignConferenceProject')) {
        result = await supabaseClient
            .from('PreliminaryDesignConference')
            .select(`
                *,
                conferenceProjects:PreliminaryDesignConferenceProject(
                    *,
                    modules:PreliminaryDesignModule(*)
                )
            `)
            .eq('orderId', orderId)
            .order('createdAt', { ascending: false });
    }

    if (result.error) return [];

    let conferences = result.data || [];
    if (typeof attachModuleObservationsToConferences === 'function') {
        conferences = await attachModuleObservationsToConferences(conferences);
    }
    if (typeof enrichAnteprojetoConferences === 'function') {
        conferences = await enrichAnteprojetoConferences(conferences, orderId);
    }
    return conferences;
}

async function fetchOrderExportRequests(orderId) {
    let convsResult = await supabaseClient
        .from('OrderRequest')
        .select('*, orderProject:OrderProject(id, name, environmentType:EnvironmentType(name))')
        .eq('orderId', orderId)
        .order('createdAt', { ascending: true });

    if (convsResult.error?.message?.includes('orderProject')) {
        convsResult = await supabaseClient
            .from('OrderRequest')
            .select('*')
            .eq('orderId', orderId)
            .order('createdAt', { ascending: true });
    }

    if (convsResult.error) return { requests: [], activitiesByRequest: {}, designerNames: {} };

    const requests = convsResult.data || [];
    const designerIds = [...new Set(requests.map(item => item.designerId).filter(Boolean))];
    const designerNames = {};

    if (designerIds.length) {
        const { data: users } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', designerIds);
        users?.forEach(user => { designerNames[user.id] = user.name; });
    }

    const requestIds = requests.map(item => item.id);
    const activitiesByRequest = requestIds.length && typeof fetchRequestActivitiesByRequestIds === 'function'
        ? await fetchRequestActivitiesByRequestIds(requestIds)
        : {};

    return { requests, activitiesByRequest, designerNames };
}

async function fetchOrderExportBundle(orderId) {
    const order = await fetchOrderExportOrder(orderId);

    if (typeof loadOrderPhasesForOrders === 'function') {
        await loadOrderPhasesForOrders([order]);
    }

    const phases = typeof getOrderPhasesForOrder === 'function'
        ? getOrderPhasesForOrder(orderId)
        : [];

    const projects = await fetchOrderExportProjects(orderId);
    const projectIds = projects.map(project => project.id).filter(Boolean);

    const [
        medicoes,
        conferences,
        requestBundle,
        actionContext
    ] = await Promise.all([
        fetchOrderExportMedicoes(orderId),
        fetchOrderExportConferences(orderId),
        fetchOrderExportRequests(orderId),
        projectIds.length && typeof fetchOrderProjectActionContext === 'function'
            ? fetchOrderProjectActionContext(orderId, projectIds, projects)
            : Promise.resolve({ approvalsByProject: {}, revisionsByProject: {}, implantacaoByProjectId: {} })
    ]);

    const implantacaoDetails = {};
    const detalhamentoByProject = {};
    const statusHistoryByProject = {};

    const conferenceDesignerIds = [...new Set(conferences.map(item => item.designerId).filter(Boolean))];
    const conferenceDesignerNames = {};
    if (conferenceDesignerIds.length) {
        const { data: conferenceDesigners } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', conferenceDesignerIds);
        conferenceDesigners?.forEach(user => { conferenceDesignerNames[user.id] = user.name; });
    }

    await Promise.all(projectIds.map(async (projectId) => {
        const [implantacao, detalhamento, history] = await Promise.all([
            typeof fetchImplantacaoByOrderProjectId === 'function'
                ? fetchImplantacaoByOrderProjectId(projectId).catch(() => null)
                : Promise.resolve(null),
            typeof fetchDetalhamentoByOrderProjectId === 'function'
                ? fetchDetalhamentoByOrderProjectId(projectId).catch(() => null)
                : Promise.resolve(null),
            typeof fetchOrderProjectStatusHistory === 'function'
                ? fetchOrderProjectStatusHistory(projectId).catch(() => [])
                : Promise.resolve([])
        ]);

        if (implantacao?.id) {
            let purchaseItems = [];
            if (typeof fetchImplementationPurchaseItems === 'function') {
                try {
                    purchaseItems = await fetchImplementationPurchaseItems(implantacao.id);
                } catch (error) {
                    console.warn('fetchOrderExportBundle purchaseItems:', error);
                }
            }
            implantacaoDetails[projectId] = { implantacao, purchaseItems };
        } else if (implantacao) {
            implantacaoDetails[projectId] = { implantacao, purchaseItems: [] };
        }

        if (detalhamento) detalhamentoByProject[projectId] = detalhamento;
        statusHistoryByProject[projectId] = history || [];
    }));

    return {
        order,
        phases,
        projects,
        medicoes,
        conferences,
        conferenceDesignerNames,
        requests: requestBundle.requests,
        activitiesByRequest: requestBundle.activitiesByRequest,
        designerNames: requestBundle.designerNames,
        approvalsByProject: actionContext.approvalsByProject || {},
        revisionsByProject: actionContext.revisionsByProject || {},
        implantacaoDetails,
        detalhamentoByProject,
        statusHistoryByProject
    };
}

function getOrderExportProjectLabel(project) {
    const code = typeof normalizeProjectCodeInput === 'function'
        ? normalizeProjectCodeInput(project.projectCode || '')
        : (project.projectCode || '');
    const name = project.name || 'Projeto';
    return code ? `${code} — ${name}` : name;
}

function renderOrderExportOrderSection(bundle) {
    const { order, phases } = bundle;
    const deliverySummary = typeof formatOrderDeliverySummary === 'function'
        ? formatOrderDeliverySummary(order.id, order.clientDeliveryDate)
        : formatOrderExportDate(order.clientDeliveryDate);

    let phasesHtml = '';
    if (phases.length >= 2) {
        phasesHtml = `
            <table class="order-export-table">
                <thead>
                    <tr>
                        <th>Fase</th>
                        <th>Data de entrega</th>
                    </tr>
                </thead>
                <tbody>
                    ${phases.map(phase => `
                        <tr>
                            <td>${escapeHtml(phase.name || '—')}</td>
                            <td>${escapeHtml(formatOrderExportDate(phase.deliveryDate))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    const fields = [
        orderExportField('Código do pedido', order.orderCode),
        orderExportField('Cliente', typeof getOrderClientName === 'function' ? getOrderClientName(order) : ''),
        orderExportField('Consultor', typeof getOrderConsultantNameFromRecord === 'function'
            ? getOrderConsultantNameFromRecord(order) : ''),
        orderExportField('Criado por', order.creator?.name || 'Sistema'),
        orderExportField('Data de criação', formatOrderExportDateTime(order.createdAt)),
        orderExportField('Entrega', deliverySummary)
    ].join('');

    return orderExportSection('Dados do pedido', `
        <div class="order-export-fields">${fields}</div>
        ${phasesHtml}
    `);
}

function renderOrderExportProjectsSection(bundle) {
    const { projects } = bundle;
    if (!projects.length) {
        return orderExportSection('Dados do projeto', orderExportEmpty('Nenhum projeto cadastrado para este pedido.'));
    }

    const blocks = projects.map(project => {
        const statusName = typeof getGestaoProjectStatusName === 'function'
            ? getGestaoProjectStatusName(project)
            : (project.projectStatus?.name || '—');
        const phaseDisplay = typeof getOrderProjectPhaseDisplay === 'function'
            ? getOrderProjectPhaseDisplay(project, project.orderId)
            : null;

        const fields = [
            orderExportField('Código', typeof normalizeProjectCodeInput === 'function'
                ? normalizeProjectCodeInput(project.projectCode || '') : project.projectCode),
            orderExportField('Nome', project.name),
            orderExportField('Ambiente', project.environmentType?.name),
            orderExportField('Status', statusName),
            orderExportField('Projetista', project.designer?.name),
            orderExportField('Entrega do projeto', formatOrderExportDate(project.deliveryDate)),
            orderExportField('Fase de entrega', phaseDisplay ? `${phaseDisplay.name} (${phaseDisplay.dateLabel})` : null),
            orderExportField('Previsão início PT', formatOrderExportDate(project.technicalProjectForecastStartDate)),
            orderExportField('Previsão conclusão PT', formatOrderExportDate(project.technicalProjectForecastEndDate)),
            orderExportField('Conclusão PT', formatOrderExportDate(project.technicalProjectCompletedDate)),
            orderExportField('Mês de produção', project.productionMonth),
            orderExportField('Caminho rede aprovação', project.approvalNetworkPath)
        ].join('');

        return `
            <div class="order-export-card">
                ${orderExportSubheading(getOrderExportProjectLabel(project))}
                <div class="order-export-fields order-export-fields--grid">${fields}</div>
            </div>
        `;
    }).join('');

    return orderExportSection('Dados do projeto', blocks);
}

function renderOrderExportMedicoesSection(bundle) {
    const { medicoes } = bundle;
    if (!medicoes.length) {
        return orderExportSection('Dados das medições', orderExportEmpty('Nenhuma medição cadastrada.'));
    }

    const blocks = medicoes.map(medicao => {
        const projects = typeof getMeasurementProjects === 'function'
            ? getMeasurementProjects(medicao)
            : (medicao.measurementProjects || []);
        const primaryDate = typeof getMedicaoPrimaryDate === 'function'
            ? getMedicaoPrimaryDate(medicao)
            : (projects[0]?.measurementDate || medicao.createdAt);

        const rows = projects.length
            ? projects.map(item => `
                <tr>
                    <td>${escapeHtml(item.orderProject?.name || 'Projeto')}</td>
                    <td>${escapeHtml(formatOrderExportDate(item.measurementDate))}</td>
                    <td>${item.isFloorPlanRaised ? 'Sim' : 'Não'}</td>
                    <td>${escapeHtml(formatOrderExportDate(item.floorPlanRaisedDate))}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="4">${orderExportEmpty('Nenhum projeto vinculado.')}</td></tr>`;

        return `
            <div class="order-export-card">
                ${orderExportSubheading(`Medição — ${formatOrderExportDate(primaryDate)}`)}
                ${medicao.observation ? `<p class="order-export-note"><strong>Observação:</strong> ${escapeHtml(medicao.observation)}</p>` : ''}
                <table class="order-export-table">
                    <thead>
                        <tr>
                            <th>Projeto</th>
                            <th>Data medição</th>
                            <th>Planta levantada</th>
                            <th>Data planta</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }).join('');

    return orderExportSection('Dados das medições', blocks);
}

function renderOrderExportConferencesSection(bundle) {
    const { conferences, conferenceDesignerNames = {} } = bundle;
    if (!conferences.length) {
        return orderExportSection('Dados das conferências', orderExportEmpty('Nenhuma conferência de anteprojeto.'));
    }

    const blocks = conferences.map(conference => {
        const projetistaName = conferenceDesignerNames[conference.designerId] || '—';
        const sketchUpPath = typeof getConferenceSketchUpPath === 'function'
            ? getConferenceSketchUpPath(conference)
            : (conference.sketchUpPath || '—');
        const moduleObservations = typeof getConferenceModuleObservations === 'function'
            ? getConferenceModuleObservations(conference)
            : [];
        const projects = (conference.conferenceProjects || []).map(cp => cp.orderProject?.name || 'Projeto').join(', ') || '—';

        const obsRows = moduleObservations.length
            ? moduleObservations.map(obs => `
                <tr>
                    <td>${escapeHtml(obs.moduleName || obs.module?.name || '—')}</td>
                    <td>${escapeHtml(obs.observationText || obs.observation?.text || '—')}</td>
                    <td>${obs.consultantChecked ? 'Sim' : 'Não'}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="3">${orderExportEmpty('Nenhum módulo registrado.')}</td></tr>`;

        return `
            <div class="order-export-card">
                ${orderExportSubheading(`Conferência — ${projetistaName}`)}
                <div class="order-export-fields order-export-fields--grid">
                    ${orderExportField('Status', conference.status)}
                    ${orderExportField('Projetos', projects)}
                    ${orderExportField('SketchUp', sketchUpPath)}
                </div>
                ${conference.conferenceObservation
                    ? `<p class="order-export-note"><strong>Observação:</strong> ${escapeHtml(conference.conferenceObservation)}</p>`
                    : ''}
                ${conference.managerObservation
                    ? `<p class="order-export-note"><strong>Observação do gestor:</strong> ${escapeHtml(conference.managerObservation)}</p>`
                    : ''}
                <table class="order-export-table">
                    <thead>
                        <tr>
                            <th>Módulo</th>
                            <th>Observação</th>
                            <th>Conferida</th>
                        </tr>
                    </thead>
                    <tbody>${obsRows}</tbody>
                </table>
            </div>
        `;
    }).join('');

    return orderExportSection('Dados das conferências', blocks);
}

function renderOrderExportRequestsSection(bundle) {
    const { requests, activitiesByRequest, designerNames, order } = bundle;
    if (!requests.length) {
        return orderExportSection('Dados das requisições', orderExportEmpty('Nenhuma requisição técnica.'));
    }

    const consultantName = typeof getOrderConsultantNameFromRecord === 'function'
        ? getOrderConsultantNameFromRecord(order)
        : '—';

    const sorted = typeof sortOrderRequests === 'function'
        ? sortOrderRequests(requests)
        : requests;

    const blocks = sorted.map(request => {
        const status = typeof normalizeRequestStatus === 'function'
            ? normalizeRequestStatus(request)
            : (request.status || '—');
        const activities = activitiesByRequest[request.id] || [];
        const requestTitle = request.requestProfile === 'Consultor'
            ? 'Solicitação do Consultor'
            : 'Solicitação do Projetista';
        const projectLabel = request.orderProject?.name
            ? `${request.orderProject.name}${request.orderProject.environmentType?.name ? ` · ${request.orderProject.environmentType.name}` : ''}`
            : '—';

        const activityRows = activities.length
            ? activities.map(activity => `
                <tr>
                    <td>${escapeHtml(activity.description || '—')}</td>
                    <td>${activity.completed ? 'Sim' : 'Não'}</td>
                    <td>${escapeHtml(activity.observation || '—')}</td>
                    <td>${escapeHtml(formatOrderExportDate(activity.completedAt))}</td>
                </tr>
            `).join('')
            : '';

        return `
            <div class="order-export-card">
                ${orderExportSubheading(`Requisição #${request.id}`)}
                <div class="order-export-fields order-export-fields--grid">
                    ${orderExportField('Status', status)}
                    ${orderExportField('Projetista', designerNames[request.designerId] || '—')}
                    ${orderExportField('Consultor', consultantName)}
                    ${orderExportField('Projeto', projectLabel)}
                    ${orderExportField('Perfil', requestTitle)}
                </div>
                <p class="order-export-note"><strong>Solicitação:</strong> ${escapeHtml(request.designerRequest || '—')}</p>
                ${request.commercialResponse
                    ? `<p class="order-export-note"><strong>Resposta do consultor:</strong> ${escapeHtml(request.commercialResponse)}</p>`
                    : ''}
                ${request.designerResponse
                    ? `<p class="order-export-note"><strong>Resposta do projetista:</strong> ${escapeHtml(request.designerResponse)}</p>`
                    : ''}
                ${activityRows ? `
                    <table class="order-export-table">
                        <thead>
                            <tr>
                                <th>Atividade</th>
                                <th>Realizada</th>
                                <th>Observação</th>
                                <th>Data</th>
                            </tr>
                        </thead>
                        <tbody>${activityRows}</tbody>
                    </table>
                ` : ''}
            </div>
        `;
    }).join('');

    return orderExportSection('Dados das requisições', blocks);
}

function renderOrderExportRevisionBlock(revision, titleText) {
    const activityRows = (revision.activities || []).length
        ? revision.activities.map(activity => `
            <tr>
                <td>${escapeHtml(activity.description || '—')}</td>
                <td>${activity.completed ? 'Sim' : 'Não'}</td>
                <td>${escapeHtml(activity.observation || '—')}</td>
                <td>${escapeHtml(formatOrderExportDate(activity.completedAt))}</td>
            </tr>
        `).join('')
        : `<tr><td colspan="4">${orderExportEmpty('Nenhuma atividade registrada.')}</td></tr>`;

    const workPeriod = revision.type !== 'comercial' && (revision.revisionStartedAt || revision.revisionCompletedAt)
        ? revision.revisionCompletedAt
            ? `Trabalho: ${formatOrderExportDate(revision.revisionStartedAt)} → ${formatOrderExportDate(revision.revisionCompletedAt)}`
            : revision.revisionStartedAt
                ? `Em andamento desde ${formatOrderExportDate(revision.revisionStartedAt)}`
                : 'Aguardando início'
        : '';

    return `
        <div class="order-export-card order-export-card--nested">
            ${orderExportSubheading(titleText)}
            <p class="order-export-meta">
                Criada em ${escapeHtml(formatOrderExportDate(revision.createdAt))}
                ${workPeriod ? ` · ${escapeHtml(workPeriod)}` : ''}
            </p>
            <table class="order-export-table">
                <thead>
                    <tr>
                        <th>Atividade</th>
                        <th>Realizada</th>
                        <th>Observação</th>
                        <th>Data</th>
                    </tr>
                </thead>
                <tbody>${activityRows}</tbody>
            </table>
        </div>
    `;
}

function renderOrderExportRevisionsSection(bundle) {
    const { projects, approvalsByProject, revisionsByProject } = bundle;
    const projectsWithRevisions = projects.filter(project => {
        const approval = approvalsByProject[project.id];
        const revisions = revisionsByProject[project.id] || [];
        return approval || revisions.length;
    });

    if (!projectsWithRevisions.length) {
        return orderExportSection('Dados das revisões', orderExportEmpty('Nenhuma revisão comercial registrada.'));
    }

    const blocks = projectsWithRevisions.map(project => {
        const approval = approvalsByProject[project.id];
        const revisions = revisionsByProject[project.id] || [];
        const sortedRevisions = typeof sortCommercialRevisionsDescending === 'function'
            ? sortCommercialRevisionsDescending(revisions)
            : revisions;

        const chronologicalTechnical = typeof sortCommercialRevisionsChronologically === 'function'
            ? sortCommercialRevisionsChronologically(revisions.filter(item => item.type !== 'comercial'))
            : revisions.filter(item => item.type !== 'comercial');
        const techNumberMap = new Map();
        chronologicalTechnical.forEach((revision, index) => techNumberMap.set(revision.id, index + 1));

        const revisionBlocks = sortedRevisions.map(revision => {
            const isComercial = revision.type === 'comercial';
            const title = isComercial
                ? 'Revisão Comercial'
                : `Revisão Técnica ${techNumberMap.get(revision.id) || 1}`;
            return renderOrderExportRevisionBlock(revision, title);
        }).join('');

        return `
            <div class="order-export-card">
                ${orderExportSubheading(getOrderExportProjectLabel(project))}
                ${approval ? `
                    <div class="order-export-fields order-export-fields--grid">
                        ${orderExportField('Status aprovação', approval.status || (approval.approved ? 'Aprovado' : '—'))}
                        ${orderExportField('Aprovado em', formatOrderExportDate(approval.approvedAt))}
                        ${orderExportField('Criado em', formatOrderExportDate(approval.createdAt))}
                    </div>
                ` : ''}
                ${revisionBlocks || orderExportEmpty('Nenhuma revisão registrada.')}
            </div>
        `;
    }).join('');

    return orderExportSection('Dados das revisões', blocks);
}

function renderOrderExportImplantacaoSection(bundle) {
    const { projects, implantacaoDetails } = bundle;
    const projectsWithImplantacao = projects.filter(project => implantacaoDetails[project.id]?.implantacao);

    if (!projectsWithImplantacao.length) {
        return orderExportSection('Dados da implantação', orderExportEmpty('Nenhum registro de implantação.'));
    }

    const blocks = projectsWithImplantacao.map(project => {
        const { implantacao, purchaseItems } = implantacaoDetails[project.id];
        const itemRows = (purchaseItems || []).length
            ? purchaseItems.map(item => `
                <tr>
                    <td>${escapeHtml(item.purchaseType || '—')}${item.thirdPartySubtype?.name ? ` (${escapeHtml(item.thirdPartySubtype.name)})` : ''}</td>
                    <td>${escapeHtml(item.folderPath || '—')}</td>
                    <td>${item.isChecked ? 'Sim' : 'Não'}</td>
                    <td>${item.sentToCommercial ? `Sim (${formatOrderExportDate(item.sentToCommercialAt)})` : 'Não'}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="4">${orderExportEmpty('Nenhum item de compra.')}</td></tr>`;

        return `
            <div class="order-export-card">
                ${orderExportSubheading(getOrderExportProjectLabel(project))}
                <div class="order-export-fields order-export-fields--grid">
                    ${orderExportField('Status', implantacao.status)}
                    ${orderExportField('Caminho do projeto', implantacao.projectFilePath)}
                    ${orderExportField('Projeto conferido', implantacao.isProjectChecked ? 'Sim' : 'Não')}
                    ${orderExportField('Código OP WPS', implantacao.wpsOpCode)}
                    ${orderExportField('Atualizado em', formatOrderExportDateTime(implantacao.updatedAt))}
                </div>
                <table class="order-export-table">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Caminho</th>
                            <th>Conferido</th>
                            <th>Enviado comercial</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                </table>
            </div>
        `;
    }).join('');

    return orderExportSection('Dados da implantação', blocks);
}

function renderOrderExportDetalhamentoSection(bundle) {
    const { projects, detalhamentoByProject } = bundle;
    const projectsWithDetalhamento = projects.filter(project => detalhamentoByProject[project.id]);

    if (!projectsWithDetalhamento.length) {
        return orderExportSection('Dados do detalhamento', orderExportEmpty('Nenhum registro de detalhamento.'));
    }

    const blocks = projectsWithDetalhamento.map(project => {
        const record = detalhamentoByProject[project.id];
        const steps = typeof getDetailingHistoryStepStates === 'function'
            ? getDetailingHistoryStepStates(record)
            : [];

        const stepRows = steps.length
            ? steps.map(step => `
                <tr>
                    <td>${escapeHtml(step.status)}</td>
                    <td>${escapeHtml(step.dateLabel)}</td>
                </tr>
            `).join('')
            : '';

        return `
            <div class="order-export-card">
                ${orderExportSubheading(getOrderExportProjectLabel(project))}
                <div class="order-export-fields order-export-fields--grid">
                    ${orderExportField('Status', record.status)}
                    ${orderExportField('Projetista', record.designer?.name)}
                    ${orderExportField('Início', formatOrderExportDate(record.startedAt))}
                    ${orderExportField('Fim', formatOrderExportDate(record.completedAt))}
                    ${orderExportField('Caminho projeto', record.projectFilePath)}
                    ${orderExportField('Pasta servidor', record.serverFolderPath)}
                </div>
                ${stepRows ? `
                    <table class="order-export-table">
                        <thead>
                            <tr><th>Etapa</th><th>Data</th></tr>
                        </thead>
                        <tbody>${stepRows}</tbody>
                    </table>
                ` : ''}
            </div>
        `;
    }).join('');

    return orderExportSection('Dados do detalhamento', blocks);
}

function renderOrderExportMontagemSection(bundle) {
    const { projects } = bundle;
    const projectsWithMontagem = projects.filter(project =>
        project.cabinetMakerId
        || project.internalAssemblyStartDate
        || project.internalAssemblyEndDate
        || project.cabinetMaker?.name
    );

    if (!projectsWithMontagem.length) {
        return orderExportSection('Dados da montagem interna', orderExportEmpty('Nenhum dado de montagem interna.'));
    }

    const blocks = projectsWithMontagem.map(project => {
        const marceneiroName = typeof getMarceneiroNameFromProject === 'function'
            ? getMarceneiroNameFromProject(project)
            : (project.cabinetMaker?.name || '—');

        return `
            <div class="order-export-card">
                ${orderExportSubheading(getOrderExportProjectLabel(project))}
                <div class="order-export-fields order-export-fields--grid">
                    ${orderExportField('Marceneiro', marceneiroName)}
                    ${orderExportField('Início montagem', formatOrderExportDate(project.internalAssemblyStartDate))}
                    ${orderExportField('Fim montagem', formatOrderExportDate(project.internalAssemblyEndDate))}
                </div>
            </div>
        `;
    }).join('');

    return orderExportSection('Dados da montagem interna', blocks);
}

function renderOrderExportStatusHistorySection(bundle) {
    const { projects, statusHistoryByProject } = bundle;
    const projectsWithHistory = projects.filter(project => (statusHistoryByProject[project.id] || []).length);

    if (!projectsWithHistory.length) {
        return orderExportSection('Histórico de status', orderExportEmpty('Nenhum histórico de status registrado.'), { pageBreakBefore: true });
    }

    const blocks = projectsWithHistory.map(project => {
        const entries = statusHistoryByProject[project.id] || [];
        const rows = entries.map((entry, index) => {
            const isLast = index === entries.length - 1;
            const durationSeconds = isLast
                ? null
                : Number(entries[index + 1]?.previousStatusDurationSeconds);
            const durationLabel = isLast
                ? 'Em andamento'
                : formatOrderExportDuration(durationSeconds);

            return `
                <tr>
                    <td>${escapeHtml(entry.newStatus?.name || '—')}</td>
                    <td>${escapeHtml(formatOrderExportDateTime(entry.changedAt))}</td>
                    <td>${escapeHtml(entry.changedBy?.name || '—')}</td>
                    <td>${escapeHtml(durationLabel)}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="order-export-card">
                ${orderExportSubheading(getOrderExportProjectLabel(project))}
                <table class="order-export-table">
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Data</th>
                            <th>Alterado por</th>
                            <th>Duração</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }).join('');

    return orderExportSection('Histórico de status', blocks, { pageBreakBefore: true });
}

function renderOrderExportPrintHtml(bundle) {
    const { order } = bundle;
    const clientName = typeof getOrderClientName === 'function' ? getOrderClientName(order) : '';
    const generatedAt = typeof formatGestaoDateTime === 'function'
        ? formatGestaoDateTime(new Date().toISOString())
        : new Date().toLocaleString('pt-BR');

    return `
        <div class="order-export-document">
            <header class="order-export-header">
                <h1 class="order-export-header__title">Relatório do Pedido</h1>
                <p class="order-export-header__meta">
                    ${escapeHtml(order.orderCode || '')} · ${escapeHtml(clientName || '')}
                </p>
                <p class="order-export-header__meta order-export-header__meta--muted">
                    Gerado em ${escapeHtml(generatedAt)}
                </p>
            </header>
            ${renderOrderExportOrderSection(bundle)}
            ${renderOrderExportProjectsSection(bundle)}
            ${renderOrderExportMedicoesSection(bundle)}
            ${renderOrderExportConferencesSection(bundle)}
            ${renderOrderExportRequestsSection(bundle)}
            ${renderOrderExportRevisionsSection(bundle)}
            ${renderOrderExportImplantacaoSection(bundle)}
            ${renderOrderExportDetalhamentoSection(bundle)}
            ${renderOrderExportMontagemSection(bundle)}
            ${renderOrderExportStatusHistorySection(bundle)}
        </div>
    `;
}

async function exportOrderPrint(orderId = activeOrderId) {
    const normalizedId = Number(orderId);
    if (!normalizedId) {
        alertAppDialog('Selecione um pedido para exportar.');
        return;
    }

    const button = document.getElementById('btn-export-order-pdf');
    const originalLabel = button?.textContent;
    if (button) {
        button.disabled = true;
        button.textContent = 'Gerando...';
    }

    try {
        const bundle = await fetchOrderExportBundle(normalizedId);
        const root = document.getElementById('order-export-print-root');
        if (!root) throw new Error('Container de impressão não encontrado.');

        root.innerHTML = renderOrderExportPrintHtml(bundle);
        document.body.classList.add('order-export-printing');
        window.print();
        window.addEventListener('afterprint', () => {
            document.body.classList.remove('order-export-printing');
            root.innerHTML = '';
        }, { once: true });
    } catch (error) {
        console.error('exportOrderPrint:', error);
        alertAppDialog('Erro ao gerar relatório: ' + (error.message || error));
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalLabel || 'Exportar PDF';
        }
    }
}

function bindOrderExportEvents() {
    document.getElementById('btn-export-order-pdf')?.addEventListener('click', () => {
        exportOrderPrint(activeOrderId);
    });
}

window.exportOrderPrint = exportOrderPrint;
window.fetchOrderExportBundle = fetchOrderExportBundle;
