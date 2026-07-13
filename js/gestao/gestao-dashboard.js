const GESTAO_DASHBOARD_STATUS_START = 'Medição Realizada';
const GESTAO_DASHBOARD_STATUS_PROJETOS_END = 'Projeto Técnico';
const GESTAO_DASHBOARD_STATUS_FABRICA_END = 'Montagem Interna';

const GESTAO_DASHBOARD_PROJECT_SELECT = `
    id, orderId, projectCode, name, deliveryDate, previsaoConclusaoProjetoTecnico, conclusaoProjetoTecnico,
    fimMontagemInterna, statusId, designerId, marceneiroId, deliveryPhaseId,
    isComplementar, parentProjectId, isSubstituido,
    order:salesOrders(id, orderCode, clientName, clientDeliveryDate),
    designer:appUsers!OrderProject_designerId_fkey(id, name),
    marceneiro:Marceneiro(id, name),
    projectStatus:OrderProjectStatus(id, name, sortOrder)
`;

const GESTAO_DASHBOARD_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, deliveryDate, previsaoConclusaoProjetoTecnico, statusId, designerId, deliveryPhaseId,
    isComplementar, parentProjectId, isSubstituido,
    order:salesOrders(id, orderCode, clientName, clientDeliveryDate),
    designer:appUsers!OrderProject_designerId_fkey(id, name),
    projectStatus:OrderProjectStatus(id, name, sortOrder)
`;

const GESTAO_DASHBOARD_TAB_CONFIG = {
    projetos: {
        id: 'projetos',
        label: 'Projetos',
        deliveryLabel: 'Entrega projeto',
        responsibleLabel: 'Projetista',
        showPrevisao: true,
        showClientDeliveryInHeader: false,
        showDeliveryInCard: true,
        showFimMontagem: false,
        description: 'Projetos não finalizados (Medição Realizada até Projeto Técnico) com entrega do projeto até o mês corrente, mais os finalizados pelo projetista no mês.'
    },
    fabrica: {
        id: 'fabrica',
        label: 'Fábrica',
        deliveryLabel: 'Entrega pedido',
        responsibleLabel: 'Marceneiro',
        showPrevisao: false,
        showClientDeliveryInHeader: true,
        showDeliveryInCard: false,
        showFimMontagem: true,
        description: 'Projetos sem fim de montagem (Medição Realizada até Montagem Interna) com entrega do pedido até o mês corrente, mais os com fim de montagem no mês.'
    }
};

const GESTAO_DASHBOARD_STATUS_DOT_COLORS = {
    'Vendido': '#10b981',
    'Aguardando Obra': '#f97316',
    'Aguardando Medição': '#06b6d4',
    'Medição Realizada': '#14b8a6',
    'Planta Levantada': '#84cc16',
    'Conferência Enviada': '#0ea5e9',
    'Conferência Realizada': '#14b8a6',
    'Aguardando Projeto Técnico': '#6366f1',
    'Projeto Técnico': '#8b5cf6',
    'Aguardando Aprovação': '#f59e0b',
    'Em Revisão': '#0ea5e9',
    'Em revisão': '#0ea5e9',
    'Nomear': '#a855f7',
    'Aguardando PPCP': '#d946ef',
    'Implantação': '#14b8a6',
    'Em Produção': '#f97316',
    'Montagem Interna': '#f59e0b',
    'Expedição': '#64748b'
};

function getGestaoDashboardStatusDotColor(statusName) {
    return GESTAO_DASHBOARD_STATUS_DOT_COLORS[statusName] || '#94a3b8';
}

function getGestaoDashboardLegendStatuses(tabId, statuses, projects) {
    const endName = tabId === 'fabrica'
        ? GESTAO_DASHBOARD_STATUS_FABRICA_END
        : GESTAO_DASHBOARD_STATUS_PROJETOS_END;
    const { minSort, maxSort } = getGestaoDashboardRangeBounds(statuses, endName);
    const usedNames = new Set(
        (projects || []).map(project => project?.projectStatus?.name).filter(Boolean)
    );

    return (statuses || [])
        .filter(status => {
            const sortOrder = Number(status.sortOrder);
            const inRange = minSort != null && maxSort != null
                && sortOrder >= minSort
                && sortOrder <= maxSort;
            return inRange || usedNames.has(status.name);
        })
        .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
}

function renderGestaoDashboardStatusLegend(tabId, statuses, projects) {
    const legendStatuses = getGestaoDashboardLegendStatuses(tabId, statuses, projects);
    if (!legendStatuses.length) return '';

    const items = legendStatuses.map(status => `
        <span class="gestao-dashboard-legend__item" title="${escapeHtml(status.name)}">
            <span class="gestao-dashboard-status-dot"
                style="background-color:${getGestaoDashboardStatusDotColor(status.name)}"></span>
            <span class="gestao-dashboard-legend__label">${escapeHtml(status.name)}</span>
        </span>
    `).join('');

    return `
        <div class="gestao-dashboard-legend">
            <span class="gestao-dashboard-legend__title">Status</span>
            <div class="gestao-dashboard-legend__items">${items}</div>
        </div>
    `;
}

let gestaoDashboardActiveTab = 'projetos';
let gestaoDashboardFullscreen = false;
let gestaoDashboardCache = {
    projects: [],
    statuses: [],
    phasesByOrderId: {}
};

function getGestaoDashboardOrderPhases(orderId, phasesByOrderId = gestaoDashboardCache.phasesByOrderId) {
    return phasesByOrderId[Number(orderId)] || [];
}

function orderHasGestaoDashboardDeliveryPhases(orderId, phasesByOrderId = gestaoDashboardCache.phasesByOrderId) {
    return getGestaoDashboardOrderPhases(orderId, phasesByOrderId).length >= 2;
}

function projectBelongsToGestaoDashboardPhase(project, phase, phases = []) {
    if (!phase) return true;

    const phaseId = Number(phase.id);
    const projectPhaseId = Number(project.deliveryPhaseId);
    const firstPhaseId = Number(phases[0]?.id);

    if (projectPhaseId) {
        return projectPhaseId === phaseId;
    }

    return phaseId === firstPhaseId;
}

function getGestaoDashboardFabricaDeliveryDate(project, phasesByOrderId = gestaoDashboardCache.phasesByOrderId) {
    const orderId = Number(project.orderId);
    const phases = getGestaoDashboardOrderPhases(orderId, phasesByOrderId);

    if (phases.length >= 2) {
        const projectPhaseId = Number(project.deliveryPhaseId);
        const phase = projectPhaseId
            ? phases.find(item => Number(item.id) === projectPhaseId)
            : phases[0];
        if (phase?.deliveryDate) return phase.deliveryDate;
    }

    return project.order?.clientDeliveryDate || '';
}

function getGestaoDashboardCurrentMonthBounds(referenceDate = new Date()) {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const label = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return {
        start,
        end,
        label: label.charAt(0).toUpperCase() + label.slice(1)
    };
}

function normalizeGestaoDashboardDate(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).slice(0, 10);
}

function isGestaoDashboardDateOnOrBefore(dateStr, endDate) {
    const normalized = normalizeGestaoDashboardDate(dateStr);
    return Boolean(normalized && normalized <= endDate);
}

function isGestaoDashboardDateInMonth(dateStr, monthStart, monthEnd) {
    const normalized = normalizeGestaoDashboardDate(dateStr);
    return Boolean(normalized && normalized >= monthStart && normalized <= monthEnd);
}

function getGestaoDashboardStatusSortOrder(project, statusById = {}) {
    const fromJoin = project?.projectStatus?.sortOrder;
    if (fromJoin != null) return Number(fromJoin);
    const status = statusById[project?.statusId];
    return status?.sortOrder != null ? Number(status.sortOrder) : 9999;
}

function getGestaoDashboardRangeBounds(statuses, endStatusName) {
    const startStatus = statuses.find(status => status.name === GESTAO_DASHBOARD_STATUS_START);
    const endStatus = statuses.find(status => status.name === endStatusName);
    return {
        minSort: startStatus?.sortOrder ?? null,
        maxSort: endStatus?.sortOrder ?? null
    };
}

function isGestaoDashboardStatusInRange(project, minSort, maxSort, statusById) {
    if (minSort == null || maxSort == null) return false;
    const sortOrder = getGestaoDashboardStatusSortOrder(project, statusById);
    return sortOrder >= minSort && sortOrder <= maxSort;
}

function isGestaoDashboardActiveProject(project) {
    if (typeof isComplementarOrderProject === 'function' && isComplementarOrderProject(project)) return false;
    if (typeof isSubstituidoOrderProject === 'function' && isSubstituidoOrderProject(project)) return false;
    return true;
}

function filterGestaoDashboardProjetosTab(projects, statuses, monthBounds) {
    const { minSort, maxSort } = getGestaoDashboardRangeBounds(statuses, GESTAO_DASHBOARD_STATUS_PROJETOS_END);
    const statusById = Object.fromEntries(statuses.map(status => [status.id, status]));

    return (projects || []).filter(project => {
        if (!isGestaoDashboardActiveProject(project)) return false;

        const finalizedThisMonth = isGestaoDashboardDateInMonth(
            project.conclusaoProjetoTecnico,
            monthBounds.start,
            monthBounds.end
        );
        if (finalizedThisMonth) return true;

        const notFinalized = !project.conclusaoProjetoTecnico;
        const inStatusRange = isGestaoDashboardStatusInRange(project, minSort, maxSort, statusById);
        const deliveryUntilMonth = isGestaoDashboardDateOnOrBefore(project.deliveryDate, monthBounds.end);

        return notFinalized && inStatusRange && deliveryUntilMonth;
    });
}

function filterGestaoDashboardFabricaTab(projects, statuses, monthBounds, phasesByOrderId = {}) {
    const { minSort, maxSort } = getGestaoDashboardRangeBounds(statuses, GESTAO_DASHBOARD_STATUS_FABRICA_END);
    const statusById = Object.fromEntries(statuses.map(status => [status.id, status]));

    return (projects || []).filter(project => {
        if (!isGestaoDashboardActiveProject(project)) return false;

        const finishedThisMonth = isGestaoDashboardDateInMonth(
            project.fimMontagemInterna,
            monthBounds.start,
            monthBounds.end
        );
        if (finishedThisMonth) return true;

        const withoutFinishDate = !project.fimMontagemInterna;
        const inStatusRange = isGestaoDashboardStatusInRange(project, minSort, maxSort, statusById);
        const orderDeliveryUntilMonth = isGestaoDashboardDateOnOrBefore(
            getGestaoDashboardFabricaDeliveryDate(project, phasesByOrderId),
            monthBounds.end
        );

        return withoutFinishDate && inStatusRange && orderDeliveryUntilMonth;
    });
}

function getGestaoDashboardDeliveryDate(project, tabId, phasesByOrderId = gestaoDashboardCache.phasesByOrderId) {
    if (tabId === 'fabrica') {
        return getGestaoDashboardFabricaDeliveryDate(project, phasesByOrderId);
    }
    return project.deliveryDate || '';
}

function getGestaoDashboardResponsibleName(project, tabId) {
    if (tabId === 'fabrica') {
        return project.marceneiro?.name || '—';
    }
    return project.designer?.name || '—';
}

function getGestaoDashboardProjectSortDate(project, tabId, phasesByOrderId = gestaoDashboardCache.phasesByOrderId) {
    return normalizeGestaoDashboardDate(getGestaoDashboardDeliveryDate(project, tabId, phasesByOrderId)) || '9999-12-31';
}

function groupGestaoDashboardByClient(projects, tabId, phasesByOrderId = {}) {
    const groups = new Map();

    (projects || []).forEach(project => {
        const baseClientName = project.order?.clientName?.trim() || 'Sem cliente';
        const orderId = Number(project.orderId);
        const phases = getGestaoDashboardOrderPhases(orderId, phasesByOrderId);

        if (tabId === 'fabrica' && phases.length >= 2) {
            const phase = phases.find(item => projectBelongsToGestaoDashboardPhase(project, item, phases));
            if (!phase) return;

            const groupKey = `${baseClientName}||${phase.id}`;
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    clientName: `${baseClientName} - ${phase.name || 'Fase'}`,
                    sortClientName: baseClientName,
                    phase,
                    projects: []
                });
            }
            groups.get(groupKey).projects.push(project);
            return;
        }

        if (!groups.has(baseClientName)) {
            groups.set(baseClientName, {
                clientName: baseClientName,
                sortClientName: baseClientName,
                phase: null,
                projects: []
            });
        }
        groups.get(baseClientName).projects.push(project);
    });

    return [...groups.values()]
        .sort((a, b) => {
            const nameCompare = a.sortClientName.localeCompare(b.sortClientName, 'pt-BR', { sensitivity: 'base' });
            if (nameCompare !== 0) return nameCompare;
            return (a.phase?.sortOrder || 0) - (b.phase?.sortOrder || 0);
        })
        .map(group => ({
            ...group,
            projects: group.projects.sort((a, b) =>
                getGestaoDashboardProjectSortDate(a, tabId, phasesByOrderId).localeCompare(
                    getGestaoDashboardProjectSortDate(b, tabId, phasesByOrderId)
                )
            )
        }));
}

function getGestaoDashboardGroupClientDeliveryDate(group, tabId, phasesByOrderId = gestaoDashboardCache.phasesByOrderId) {
    if (tabId !== 'fabrica') return '';

    if (group.phase?.deliveryDate) {
        return formatGestaoDate(group.phase.deliveryDate);
    }

    const dates = group.projects
        .map(project => normalizeGestaoDashboardDate(
            getGestaoDashboardFabricaDeliveryDate(project, phasesByOrderId)
        ))
        .filter(Boolean)
        .sort();

    if (!dates.length) return '—';
    return formatGestaoDate(dates[0]);
}

function isGestaoDashboardProjectFinalizedInMonth(project, tabId, monthBounds) {
    if (tabId === 'fabrica') {
        return isGestaoDashboardDateInMonth(project.fimMontagemInterna, monthBounds.start, monthBounds.end);
    }
    return isGestaoDashboardDateInMonth(project.conclusaoProjetoTecnico, monthBounds.start, monthBounds.end);
}

function renderGestaoDashboardProjectRow(project, tabConfig, monthBounds) {
    const statusName = project?.projectStatus?.name || '—';
    const statusDotColor = getGestaoDashboardStatusDotColor(statusName);
    const deliveryDate = formatGestaoDate(getGestaoDashboardDeliveryDate(project, tabConfig.id));
    const responsible = getGestaoDashboardResponsibleName(project, tabConfig.id);
    const previsaoDate = formatGestaoDate(project.previsaoConclusaoProjetoTecnico);
    const fimMontagemDate = formatGestaoDate(project.fimMontagemInterna);
    const finalizedInMonth = isGestaoDashboardProjectFinalizedInMonth(project, tabConfig.id, monthBounds);
    const projectLabel = project.name || 'Projeto';

    const fields = [];
    if (tabConfig.showDeliveryInCard) {
        fields.push(`
            <span class="gestao-dashboard-project-row__field" title="${escapeHtml(tabConfig.deliveryLabel)}">
                <span class="gestao-dashboard-project-row__field-label">Ent.</span>${escapeHtml(deliveryDate)}
            </span>
        `);
    }
    fields.push(`
        <span class="gestao-dashboard-project-row__field" title="${escapeHtml(tabConfig.responsibleLabel)}">
            <span class="gestao-dashboard-project-row__field-label">${escapeHtml(tabConfig.id === 'fabrica' ? 'Marc.' : 'Proj.')}</span>${escapeHtml(responsible)}
        </span>
    `);
    if (tabConfig.showPrevisao) {
        fields.push(`
            <span class="gestao-dashboard-project-row__field" title="Previsão">
                <span class="gestao-dashboard-project-row__field-label">Prev.</span>${escapeHtml(previsaoDate)}
            </span>
        `);
    }
    if (tabConfig.showFimMontagem) {
        fields.push(`
            <span class="gestao-dashboard-project-row__field" title="Fim montagem interna">
                <span class="gestao-dashboard-project-row__field-label">Fim</span>${escapeHtml(fimMontagemDate)}
            </span>
        `);
    }

    return `
        <article class="gestao-dashboard-project-row ${finalizedInMonth ? 'gestao-dashboard-project-row--done' : ''}"
            title="${escapeHtml(projectLabel)} · ${escapeHtml(statusName)}">
            <div class="gestao-dashboard-project-row__title">
                <span class="gestao-dashboard-status-dot shrink-0"
                    style="background-color:${statusDotColor}"
                    title="${escapeHtml(statusName)}"></span>
                <span class="gestao-dashboard-project-row__name">${escapeHtml(projectLabel)}</span>
            </div>
            <div class="gestao-dashboard-project-row__details">
                ${fields.join('')}
            </div>
        </article>
    `;
}

function isGestaoDashboardClientGroupAllFinalizedInMonth(group, tabId, monthBounds) {
    const projects = group?.projects || [];
    if (!projects.length) return false;
    return projects.every(project =>
        isGestaoDashboardProjectFinalizedInMonth(project, tabId, monthBounds)
    );
}

function renderGestaoDashboardClientGroup(group, tabConfig, monthBounds) {
    const projectCount = group.projects.length;
    const allFinalizedInMonth = isGestaoDashboardClientGroupAllFinalizedInMonth(
        group,
        tabConfig.id,
        monthBounds
    );
    const clientDeliveryDate = tabConfig.showClientDeliveryInHeader
        ? getGestaoDashboardGroupClientDeliveryDate(group, tabConfig.id, gestaoDashboardCache.phasesByOrderId)
        : '';

    return `
        <section class="gestao-dashboard-client-section ${allFinalizedInMonth ? 'gestao-dashboard-client-section--done' : ''}">
            <div class="gestao-dashboard-client-header">
                <div class="gestao-dashboard-client-header__title min-w-0">
                    <h4 class="gestao-dashboard-client-header__name">${escapeHtml(group.clientName)}</h4>
                    ${clientDeliveryDate
                        ? `<span class="gestao-dashboard-client-header__date">${escapeHtml(clientDeliveryDate)}</span>`
                        : ''}
                </div>
                <span class="gestao-dashboard-client-header__count">${projectCount}</span>
            </div>
            <div class="gestao-dashboard-projects-list">
                ${group.projects.map(project => renderGestaoDashboardProjectRow(project, tabConfig, monthBounds)).join('')}
            </div>
        </section>
    `;
}

function setGestaoDashboardActiveTab(tabId) {
    gestaoDashboardActiveTab = tabId;

    document.querySelectorAll('[data-gestao-dashboard-tab]').forEach(button => {
        const isActive = button.dataset.gestaoDashboardTab === tabId;
        button.classList.toggle('is-active', isActive);
    });
}

function renderGestaoDashboardContent() {
    const content = document.getElementById('gestao-dashboard-content');
    if (!content) return;

    const tabConfig = GESTAO_DASHBOARD_TAB_CONFIG[gestaoDashboardActiveTab];
    const monthBounds = getGestaoDashboardCurrentMonthBounds();
    const statuses = gestaoDashboardCache.statuses || [];
    const allProjects = gestaoDashboardCache.projects || [];
    const phasesByOrderId = gestaoDashboardCache.phasesByOrderId || {};

    const filteredProjects = gestaoDashboardActiveTab === 'fabrica'
        ? filterGestaoDashboardFabricaTab(allProjects, statuses, monthBounds, phasesByOrderId)
        : filterGestaoDashboardProjetosTab(allProjects, statuses, monthBounds);

    const groups = groupGestaoDashboardByClient(filteredProjects, gestaoDashboardActiveTab, phasesByOrderId);

    const subtitle = document.getElementById('gestao-dashboard-subtitle');
    if (subtitle) {
        subtitle.textContent = `${tabConfig.description} Referência: ${monthBounds.label}.`;
    }

    if (!groups.length) {
        content.innerHTML = `
            <p class="text-xs text-slate-400 text-center py-10">
                Nenhum projeto encontrado para ${escapeHtml(tabConfig.label)} em ${escapeHtml(monthBounds.label)}.
            </p>
        `;
        return;
    }

    content.innerHTML = `
        <div class="space-y-2">
            ${renderGestaoDashboardStatusLegend(gestaoDashboardActiveTab, statuses, filteredProjects)}
            <p class="gestao-dashboard-summary text-[10px] text-slate-500">
                ${filteredProjects.length} projeto${filteredProjects.length === 1 ? '' : 's'} · ${groups.length} cliente${groups.length === 1 ? '' : 's'}
                <span class="inline-flex items-center gap-1 ml-1.5">
                    <span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                    Finalizado no mês
                </span>
            </p>
            <div id="gestao-dashboard-groups" class="gestao-dashboard-clients-grid">
                ${groups.map(group => renderGestaoDashboardClientGroup(group, tabConfig, monthBounds)).join('')}
            </div>
        </div>
    `;
}

async function fetchGestaoDashboardProjects() {
    let result = await supabaseClient
        .from('OrderProject')
        .select(GESTAO_DASHBOARD_PROJECT_SELECT)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('conclusaoProjetoTecnico')
        || result.error?.message?.includes('fimMontagemInterna')
        || result.error?.message?.includes('marceneiro')
        || result.error?.message?.includes('clientDeliveryDate')
        || result.error?.message?.includes('previsaoConclusaoProjetoTecnico')
        || result.error?.message?.includes('isComplementar')
        || result.error?.message?.includes('isSubstituido')
        || result.error?.message?.includes('deliveryPhaseId')
        || result.error?.message?.includes('projectStatus')
        || result.error?.message?.includes('designer')) {
        result = await supabaseClient
            .from('OrderProject')
            .select(GESTAO_DASHBOARD_PROJECT_SELECT_FALLBACK)
            .order('name', { ascending: true });
    }

    if (result.error) return result;

    let projects = result.data || [];
    const needsEnrich = projects.some(project => project.statusId && !project.projectStatus);

    if (needsEnrich) {
        const statuses = gestaoDashboardCache.statuses.length
            ? gestaoDashboardCache.statuses
            : (await loadGestaoProjectStatuses(true));
        const statusById = Object.fromEntries(statuses.map(status => [status.id, status]));
        projects = projects.map(project => ({
            ...project,
            projectStatus: project.projectStatus || statusById[project.statusId] || null
        }));
    }

    return { data: projects, error: null };
}

async function loadGestaoDashboard() {
    const content = document.getElementById('gestao-dashboard-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando dashboard...</p>';
    }

    const statuses = typeof loadGestaoProjectStatuses === 'function'
        ? await loadGestaoProjectStatuses(true)
        : [];

    const projectsResult = await fetchGestaoDashboardProjects();
    if (projectsResult.error) {
        if (content) {
            content.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar dashboard: ${escapeHtml(projectsResult.error.message)}</p>`;
        }
        return;
    }

    const projects = projectsResult.data || [];
    const orderIds = [...new Set(projects.map(project => Number(project.orderId)).filter(Boolean))];
    let phasesByOrderId = {};

    if (typeof fetchGestaoOrderPhasesByOrderIds === 'function' && orderIds.length) {
        phasesByOrderId = await fetchGestaoOrderPhasesByOrderIds(orderIds);
    }

    gestaoDashboardCache = {
        projects,
        statuses,
        phasesByOrderId
    };

    renderGestaoDashboardContent();
}

function setGestaoDashboardFullscreen(enabled) {
    gestaoDashboardFullscreen = Boolean(enabled);
    const panel = document.getElementById('gestao-dashboard-panel');
    const button = document.getElementById('btn-gestao-dashboard-fullscreen');

    panel?.classList.toggle('gestao-dashboard-panel--fullscreen', gestaoDashboardFullscreen);
    document.body.classList.toggle('gestao-dashboard-fullscreen-active', gestaoDashboardFullscreen);

    if (button) {
        button.textContent = gestaoDashboardFullscreen ? 'Sair da tela cheia' : 'Tela cheia';
        button.setAttribute('aria-pressed', gestaoDashboardFullscreen ? 'true' : 'false');
    }
}

function toggleGestaoDashboardFullscreen() {
    setGestaoDashboardFullscreen(!gestaoDashboardFullscreen);
}

window.setGestaoDashboardFullscreen = setGestaoDashboardFullscreen;

function bindGestaoDashboardEvents() {
    document.getElementById('btn-gestao-dashboard-refresh')?.addEventListener('click', loadGestaoDashboard);
    document.getElementById('btn-gestao-dashboard-fullscreen')?.addEventListener('click', toggleGestaoDashboardFullscreen);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && gestaoDashboardFullscreen) {
            setGestaoDashboardFullscreen(false);
        }
    });

    document.querySelectorAll('[data-gestao-dashboard-tab]').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.gestaoDashboardTab;
            if (!tabId || tabId === gestaoDashboardActiveTab) return;
            setGestaoDashboardActiveTab(tabId);
            renderGestaoDashboardContent();
        });
    });
}
