const PENDENCIAS_STATUS_AGUARDANDO_PT = 'Aguardando Projeto Técnico';
const PENDENCIAS_STATUS_PROJETO_TECNICO = 'Projeto Técnico';
const PENDENCIAS_STATUS_EM_REVISAO_COMERCIAL = ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS;
const PENDENCIAS_STATUS_EM_REVISAO_TECNICA = ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ;
const PENDENCIAS_STATUS_EM_REVISAO = 'Em Revisão';
const PENDENCIAS_STATUS_VENDIDO = 'Vendido';
const PENDENCIAS_STATUS_AGUARDANDO_OBRA = 'Aguardando Obra';
const PENDENCIAS_STATUS_AGUARDANDO_MEDICAO = 'Aguardando Medição';
const PENDENCIAS_STATUS_PLANTA_LEVANTADA = 'Planta Levantada';
const PENDENCIAS_STATUS_CONFERENCIA_REALIZADA = 'Conferência Realizada';
const PENDENCIAS_STATUS_CONFERENCIA_ENVIADA = 'Conferência Enviada';
const PENDENCIAS_STATUS_AGUARDANDO_APROVACAO = 'Aguardando Aprovação';
const PENDENCIAS_STATUS_NOMEAR = 'Nomear';
const PENDENCIAS_STATUS_AGUARDANDO_PPCP = 'Aguardando PPCP';
const PENDENCIAS_STATUS_IMPLANTACAO = 'Implantação';
const PENDENCIAS_STATUS_EM_PRODUCAO = 'Em Produção';
const PENDENCIAS_STATUS_MONTAGEM_INTERNA = 'Montagem Interna';
const PENDENCIAS_STATUS_MONTAGEM_EXTERNA = 'Montagem Externa';
const PENDENCIAS_STATUS_AGUARDANDO_ENTREGA_TECNICA = 'Aguardando Entrega Técnica';
const PENDENCIAS_STATUS_ENTREGUE = 'Entregue';
const PENDENCIAS_STATUS_EXPEDICAO = 'Expedição';

const PENDENCIAS_FABRICA_PROJECT_SELECT = `
    ${getPendenciasFabricaProjectSelect()}
`;

const PENDENCIAS_FABRICA_PROJECT_SELECT_FALLBACK = `
    ${getPendenciasFabricaProjectSelect({ includeStatus: false, includeCabinetMaker: false })}
`;
const PENDENCIAS_AGUARDANDO_MEDICAO_LIST_STATUSES = [
    PENDENCIAS_STATUS_VENDIDO,
    PENDENCIAS_STATUS_AGUARDANDO_OBRA
];
const PENDENCIAS_MINE_EXTRA_STATUSES = [
    PENDENCIAS_STATUS_PROJETO_TECNICO,
    PENDENCIAS_STATUS_EM_REVISAO_COMERCIAL,
    PENDENCIAS_STATUS_EM_REVISAO_TECNICA,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ,
    'Aguardando Aprovação',
    PENDENCIAS_STATUS_EM_REVISAO,
    'Em revisão'
];

const PENDENCIAS_PROJECT_SELECT = `
    ${getPendenciasProjectSelect()}
`;

const PENDENCIAS_PROJECT_SELECT_FALLBACK = `
    ${getPendenciasProjectSelect({ includeStatus: false, includeDesigner: false, includeAwaitingConstructionNote: false })}
`;

const PENDENCIAS_GESTOR_PROJETISTA_WORKLOAD_STATUSES = [
    PENDENCIAS_STATUS_AGUARDANDO_PT,
    PENDENCIAS_STATUS_PROJETO_TECNICO,
    PENDENCIAS_STATUS_EM_REVISAO_COMERCIAL,
    PENDENCIAS_STATUS_EM_REVISAO_TECNICA,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ,
    'Aguardando Aprovação',
    'Aguardando PPCP',
    PENDENCIAS_STATUS_IMPLANTACAO
];

const PENDENCIAS_GESTOR_WORKLOAD_COLUMNS = [
    PENDENCIAS_STATUS_AGUARDANDO_PT,
    PENDENCIAS_STATUS_PROJETO_TECNICO,
    PENDENCIAS_STATUS_EM_REVISAO_COMERCIAL,
    PENDENCIAS_STATUS_EM_REVISAO_TECNICA,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR,
    ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ,
    'Aguardando Aprovação',
    'Aguardando PPCP',
    PENDENCIAS_STATUS_IMPLANTACAO
];

const PENDENCIAS_CONFERENTE_MENU_ITEM_IDS = [
    'aguardando-medicao',
    'aguardando-planta',
    'conferencias'
];

function isPendenciasAguardandoProjetoTecnicoView() {
    return pendenciasActiveSection === 'projetista'
        && pendenciasActiveItem === 'aguardando-projeto-tecnico';
}

function shouldHidePendenciasGestorAndConferenteNav() {
    return isPendenciasAguardandoProjetoTecnicoView();
}
let pendenciasRequisicaoCache = [];
let pendenciasAguardandoAprovacaoCache = [];
let pendenciasConsultorRequisicaoCache = [];
let pendenciasActiveSection = null;
let pendenciasActiveItem = null;
let pendenciasCollapsedSections = new Set();

function isPendenciasSectionExpanded(sectionId) {
    return pendenciasActiveSection === sectionId && !pendenciasCollapsedSections.has(sectionId);
}

function togglePendenciasSectionCollapsed(sectionId) {
    if (pendenciasCollapsedSections.has(sectionId)) {
        pendenciasCollapsedSections.delete(sectionId);
    } else {
        pendenciasCollapsedSections.add(sectionId);
    }
}

function selectPendenciasSection(sectionId, options = {}) {
    const { expand = true, resetItem = true } = options;
    const isSameSection = pendenciasActiveSection === sectionId;

    pendenciasActiveSection = sectionId;

    if (resetItem) {
        pendenciasActiveItem = null;
    }

    if (expand) {
        pendenciasCollapsedSections.delete(sectionId);
    }

    persistPendenciasNavState();

    return isSameSection;
}

function canSeeAllPendenciasMenus() {
    return isAdmin();
}

function canSeePendenciasConsultorMenu() {
    return canSeeAllPendenciasMenus()
        || currentUser?.role === 'Consultor'
        || isGestorComercial();
}

function canSeePendenciasProjetistaMedicaoConferenciaMenus() {
    return canSeeAllPendenciasMenus() || isConferente() || isGestorComercial();
}

function canSeePendenciasProjetistaMenu() {
    return canSeeAllPendenciasMenus()
        || currentUser?.role === 'Projetista'
        || canSeePendenciasProjetistaMedicaoConferenciaMenus();
}

function canSeePendenciasGestorComercialMenu() {
    return canSeeAllPendenciasMenus() || isGestorComercial();
}

function canSeePendenciasGestorProjetosMenu() {
    return canSeeAllPendenciasMenus() || isGestorProjetos();
}

function canSeePendenciasDetalhamentoProjetistaItems() {
    return canSeeAllPendenciasMenus() || isDetalhamento();
}

function canSeePendenciasPpcpItems() {
    return canSeeAllPendenciasMenus()
        || isGestorProjetos()
        || isPpcp();
}

function canActPendenciasPpcpStatus() {
    return canSeeAllPendenciasMenus() || isPpcp();
}

function getPendenciasProjetistaMenuItems() {
    const items = [];
    const showProjetistaWork = canSeeAllPendenciasMenus() || currentUser?.role === 'Projetista';

    if (showProjetistaWork) {
        items.push(
            { id: 'aguardando-projeto-tecnico', label: 'Aguardando Projeto Técnico' },
            { id: 'projeto-tecnico', label: 'Projeto Técnico' },
            { id: 'projetos-terceiros', label: 'Projetos de Terceiros' },
            { id: 'em-revisao', label: 'Em Revisão Comercial Proj.' },
            { id: 'em-revisao-tecnica-proj', label: 'Em Revisão Técnica Proj.' },
            { id: 'requisicao', label: 'Requisição' },
            { id: 'nomear', label: 'Nomear' }
        );

        if (canSeePendenciasReviewerItems()) {
            items.splice(4, 0, { id: 'em-revisao-tecnica-revisor', label: 'Em Revisão Técnica Revisor' });
        }

        if (canSeePendenciasPpcpItems()) {
            items.push(
                { id: 'aguardando-ppcp', label: 'Aguardando PPCP' },
                { id: 'implantacao', label: 'Implantação' }
            );
        }

        if (canSeePendenciasDetalhamentoProjetistaItems()) {
            items.push({ id: 'detalhamento', label: 'Detalhamento' });
        }
    }

    if (canSeePendenciasProjetistaMedicaoConferenciaMenus()
        && !shouldHidePendenciasGestorAndConferenteNav()) {
        items.push(
            { id: 'aguardando-medicao', label: 'Aguardando Medição' },
            { id: 'aguardando-planta', label: 'Aguardando Planta' },
            { id: 'conferencias', label: 'Conferências' }
        );
    }

    return items;
}

function canSeePendenciasGestorFabricaMenu() {
    return canSeeAllPendenciasMenus() || isGestorFabrica();
}

function canActPendenciasGestorFabrica() {
    return canSeeAllPendenciasMenus() || isGestorFabrica();
}

function canAccessPendencias() {
    return canSeeAllPendenciasMenus()
        || canSeePendenciasConsultorMenu()
        || canSeePendenciasProjetistaMenu()
        || canSeePendenciasGestorComercialMenu()
        || canSeePendenciasGestorProjetosMenu()
        || canSeePendenciasGestorFabricaMenu()
        || canSeePendenciasComprasMenu();
}

async function getPendenciasStatusIdByName(name) {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', name)
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', name)
        .maybeSingle();

    return fallback?.id || null;
}

function getPrimaryGestorPendenciasSection() {
    if (isGestorProjetos()) return 'gestor-projetos';
    if (isGestorComercial()) return 'gestor-comercial';
    if (isGestorFabrica()) return 'gestor-fabrica';
    return null;
}

function getDefaultPendenciasSection() {
    if (canSeeAllPendenciasMenus()) return 'gestor-projetos';
    const gestorSection = getPrimaryGestorPendenciasSection();
    if (gestorSection) return gestorSection;
    if (canSeePendenciasConsultorMenu()) return 'consultor';
    if (canSeePendenciasProjetistaMenu()) return 'projetista';
    if (canSeePendenciasComprasMenu()) return 'compras';
    return null;
}

function getPendenciasSidebarSections() {
    const hideGestorAndConferente = shouldHidePendenciasGestorAndConferenteNav();

    return [
        {
            id: 'consultor',
            label: 'Consultor',
            visible: canSeePendenciasConsultorMenu(),
            items: [
                { id: 'conferencia', label: 'Conferência' },
                { id: 'em-revisao-comercial', label: 'Em Revisão Comercial Cons.' },
                { id: 'aguardando-aprovacao', label: 'Aguardando Aprovação' },
                { id: 'projetos-terceiros', label: 'Projetos de Terceiros' },
                { id: 'requisicoes', label: 'Requisições' }
            ]
        },
        {
            id: 'projetista',
            label: 'Projetista',
            visible: canSeePendenciasProjetistaMenu(),
            items: getPendenciasProjetistaMenuItems()
        },
        {
            id: 'gestor-comercial',
            label: 'Gestor Comercial',
            visible: canSeePendenciasGestorComercialMenu(),
            items: [
                { id: 'aguardando-medicao', label: 'Aguardando Medição' },
                { id: 'aprovar-conferencia', label: 'Aprovar Conferência' },
                { id: 'aguardando-entrega-tecnica', label: 'Aguardando Entrega Técnica' }
            ]
        },
        {
            id: 'gestor-projetos',
            label: 'Gestor de Projetos',
            visible: canSeePendenciasGestorProjetosMenu() && !hideGestorAndConferente,
            items: [
                { id: 'projetos-sem-projetistas', label: 'Projetos Sem Projetistas' },
                { id: 'terceiros-sem-projetistas', label: 'Terceiros Sem Projetistas' },
                { id: 'aguardando-detalhamento', label: 'Aguardando Detalhamento' },
                { id: 'expedicao', label: 'Expedição' },
                { id: 'montagem-externa', label: 'Montagem Externa' }
            ]
        },
        {
            id: 'gestor-fabrica',
            label: 'Gestor de Fábrica',
            visible: canSeePendenciasGestorFabricaMenu(),
            items: [
                { id: 'aguardando-montagem-interna', label: 'Aguar. Mont. Int.' },
                { id: 'em-montagem', label: 'Em Montagem' }
            ]
        },
        {
            id: 'compras',
            label: 'Compras',
            visible: canSeePendenciasComprasMenu(),
            items: [
                { id: 'enviados-compras', label: 'Enviados para Compras' }
            ]
        }
    ].filter(section => section.visible);
}

function renderPendenciasSidebar() {
    const nav = document.getElementById('pendencias-sidebar-nav');
    if (!nav) return;

    const sections = getPendenciasSidebarSections();

    if (!sections.length) {
        nav.innerHTML = '<p class="text-xs text-slate-400 px-2">Nenhum menu disponível.</p>';
        return;
    }

    if (!pendenciasActiveSection || !sections.some(section => section.id === pendenciasActiveSection)) {
        pendenciasActiveSection = getDefaultPendenciasSection();
    }

    const activeSection = sections.find(section => section.id === pendenciasActiveSection) || sections[0];
    const activeItems = activeSection.items || [];

    if (pendenciasActiveItem && !activeItems.some(item => item.id === pendenciasActiveItem)) {
        pendenciasActiveItem = null;
    }

    nav.innerHTML = sections.map(section => {
        const isActive = section.id === pendenciasActiveSection;
        const isExpanded = isPendenciasSectionExpanded(section.id);
        const sectionClass = [
            'pendencias-sidebar-section',
            isActive ? 'is-active' : '',
            isExpanded ? 'is-expanded' : 'is-collapsed'
        ].filter(Boolean).join(' ');

        const itemsHtml = section.items.length
            ? `<div class="pendencias-section-items">
                    <button type="button"
                        class="pendencias-overview-btn pendencias-subitem-btn ${!pendenciasActiveItem && isActive ? 'is-selected' : ''}">
                        Resumo
                    </button>
                    ${section.items.map(item => `
                    <button type="button"
                        class="pendencias-item-btn pendencias-subitem-btn ${item.id === pendenciasActiveItem ? 'is-selected' : ''}"
                        data-pendencias-item="${item.id}">
                        ${escapeHtml(item.label)}
                    </button>
                `).join('')}
                </div>`
            : '';

        return `
        <div class="${sectionClass}" data-pendencias-section="${section.id}">
            <button type="button"
                class="pendencias-section-btn"
                data-pendencias-section="${section.id}"
                aria-expanded="${isExpanded ? 'true' : 'false'}">
                <span class="pendencias-section-chevron" aria-hidden="true">▶</span>
                <span class="pendencias-section-label">${escapeHtml(section.label)}</span>
            </button>
            ${itemsHtml}
        </div>
    `;
    }).join('');

    nav.querySelectorAll('.pendencias-section-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const sectionId = button.dataset.pendenciasSection;
            const isSameSection = pendenciasActiveSection === sectionId;

            if (isSameSection) {
                if (isPendenciasSectionExpanded(sectionId)) {
                    togglePendenciasSectionCollapsed(sectionId);
                } else {
                    pendenciasCollapsedSections.delete(sectionId);
                }
                renderPendenciasSidebar();
                return;
            }

            selectPendenciasSection(sectionId);
            renderPendenciasSidebar();
            loadPendenciasContent();
        });
    });

    nav.querySelectorAll('.pendencias-overview-btn').forEach(button => {
        button.addEventListener('click', async () => {
            pendenciasActiveItem = null;
            renderPendenciasSidebar();
            persistPendenciasNavState();
            loadPendenciasContent();
        });
    });

    nav.querySelectorAll('.pendencias-item-btn').forEach(button => {
        button.addEventListener('click', async () => {
            pendenciasActiveItem = button.dataset.pendenciasItem;
            renderPendenciasSidebar();
            persistPendenciasNavState();
            loadPendenciasContent();
        });
    });
}

function renderPendenciasPlaceholder(title, message) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50">
                <h3 class="font-bold text-sm text-slate-900">${escapeHtml(title)}</h3>
            </div>
            <p class="text-xs text-slate-400 text-center py-10 px-4">${escapeHtml(message)}</p>
        </div>
    `;
}

const PENDENCIAS_ACTION_OVERLAY = createModalOverlayConfig('pendencias-action');

function setPendenciasActionLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(PENDENCIAS_ACTION_OVERLAY, active, message, status);
}

function waitPendenciasStatus(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getPendenciasStatusIdsByNames(names) {
    const uniqueNames = [...new Set(names.filter(Boolean))];
    const ids = [];

    for (const name of uniqueNames) {
        const id = await getPendenciasStatusIdByName(name);
        if (id && !ids.includes(id)) ids.push(id);
    }

    return ids;
}

function canActPendenciasGestorProjetosMontagemExterna() {
    return isAdmin() || isGestorProjetos();
}

async function fetchPhasesByOrderIdForPendenciasProjects(projects = []) {
    const orderIds = [...new Set((projects || []).map(project => Number(project.orderId)).filter(Boolean))];
    if (!orderIds.length || typeof fetchGestaoOrderPhasesByOrderIds !== 'function') {
        return {};
    }

    return fetchGestaoOrderPhasesByOrderIds(orderIds);
}

function getPendenciasProjectEffectiveDeliveryDate(project, phasesByOrderId = {}) {
    const phases = phasesByOrderId[Number(project?.orderId)] || [];
    if (phases.length >= 2) {
        const phaseId = Number(project?.deliveryPhaseId);
        const phase = phaseId
            ? phases.find(item => Number(item.id) === phaseId)
            : phases[0];
        return phase?.deliveryDate || project?.deliveryDate || null;
    }

    return project?.deliveryDate || null;
}

function formatPendenciasProjectDeliveryDate(project, phasesByOrderId = {}) {
    const phases = phasesByOrderId[Number(project?.orderId)] || [];
    if (phases.length >= 2) {
        const phaseId = Number(project?.deliveryPhaseId);
        const phase = phaseId
            ? phases.find(item => Number(item.id) === phaseId)
            : phases[0];
        if (!phase) return '—';

        const dateLabel = typeof formatPendenciasDeliveryDate === 'function'
            ? formatPendenciasDeliveryDate(phase.deliveryDate)
            : (phase.deliveryDate || '—');
        const phaseName = phase.name || 'Fase';
        return `${phaseName}: ${dateLabel}`;
    }

    return typeof formatPendenciasDeliveryDate === 'function'
        ? formatPendenciasDeliveryDate(project?.deliveryDate)
        : (project?.deliveryDate || '—');
}

function sortPendenciasByEffectiveDeliveryDate(projects, phasesByOrderId = {}) {
    return [...projects].sort((a, b) => {
        const aDate = getPendenciasProjectEffectiveDeliveryDate(a, phasesByOrderId);
        const bDate = getPendenciasProjectEffectiveDeliveryDate(b, phasesByOrderId);
        const aTime = aDate ? new Date(aDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = bDate ? new Date(bDate).getTime() : Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
    });
}

async function queryPendenciasProjects(filters = {}) {
    const { statusId, statusIds, designerId, unassignedOnly = false } = filters;

    const buildQuery = (selectColumns, withInactiveFilter = true) => {
        let query = supabaseClient.from('OrderProject').select(selectColumns);
        if (statusId) query = query.eq('statusId', statusId);
        if (statusIds?.length) query = query.in('statusId', statusIds);
        if (designerId) query = query.eq('designerId', designerId);
        if (unassignedOnly) query = query.is('designerId', null);
        if (withInactiveFilter) {
            query = query.eq('isComplementary', false).eq('isReplaced', false);
        }
        return query;
    };

    let result = await buildQuery(PENDENCIAS_PROJECT_SELECT);

    if (result.error?.message && isOrderProjectTechnicalForecastColumnError(result.error.message)) {
        result = await buildQuery(`
            id, orderId, projectCode, name, designerId, statusId, deliveryDate, awaitingConstructionNote,
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()}),
            designer:appUsers!OrderProject_designerId_fkey(id, name),
            projectStatus:OrderProjectStatus(id, name)
        `, true);
        if (result.error?.message?.includes('isComplementary') || result.error?.message?.includes('isReplaced')) {
            result = await buildQuery(`
                id, orderId, projectCode, name, designerId, statusId, deliveryDate, awaitingConstructionNote,
                order:salesOrders(${getSalesOrderMinimalEmbedSelect()}),
                designer:appUsers!OrderProject_designerId_fkey(id, name),
                projectStatus:OrderProjectStatus(id, name)
            `, false);
        }
    }

    if (result.error?.message?.includes('isComplementary') || result.error?.message?.includes('isReplaced')) {
        result = await buildQuery(PENDENCIAS_PROJECT_SELECT, false);
    }

    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('designer')) {
        result = await buildQuery(PENDENCIAS_PROJECT_SELECT_FALLBACK, false);
    }

    if (result.error?.message?.includes('awaitingConstructionNote')
        || isOrderProjectTechnicalForecastColumnError(result.error?.message)) {
        result = await buildQuery(`
            ${getPendenciasProjectSelect({ includeStatus: false, includeDesigner: false, includeAwaitingConstructionNote: false })}
        `, false);
    }

    if (result.error) return result;

    let projects = await enrichPendenciasProjectsWithStatus(result.data || []);
    projects = await enrichPendenciasProjectsWithConsultantUserId(projects);
    projects = excludeInactivePendenciasProjects(projects);
    return { ...result, data: projects };
}

async function enrichPendenciasProjectsWithStatus(projects) {
    if (!projects.length) return projects;

    const needsEnrich = projects.some(project => project.statusId && !project.projectStatus);
    if (!needsEnrich) return projects;

    const statusIds = [...new Set(projects.map(project => project.statusId).filter(Boolean))];
    if (!statusIds.length) return projects;

    const { data: statuses, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name')
        .in('id', statusIds);

    if (error) {
        console.error('enrichPendenciasProjectsWithStatus:', error);
        return projects;
    }

    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
    return projects.map(project => ({
        ...project,
        projectStatus: project.projectStatus || statusById[project.statusId] || null
    }));
}

async function enrichPendenciasProjectsWithConsultantUserId(projects) {
    return enrichItemsWithOrderConsultantUserId(projects, project => project?.order);
}

function getPendenciasProjectStatusName(project) {
    return project?.projectStatus?.name || '';
}

function loadPendenciasContent() {
    setPendenciasActionLoading(false);

    if (!pendenciasActiveItem) {
        loadPendenciasSectionOverview();
        return;
    }

    if (pendenciasActiveSection === 'consultor' && pendenciasActiveItem === 'conferencia') {
        loadPendenciasConsultorConferencia();
        return;
    }

    if (pendenciasActiveSection === 'consultor' && (pendenciasActiveItem === 'em-revisao-comercial' || pendenciasActiveItem === 'aguardando-aprovacao')) {
        loadPendenciasConsultorAguardandoAprovacao();
        return;
    }

    if (pendenciasActiveSection === 'consultor' && pendenciasActiveItem === 'requisicoes') {
        loadPendenciasConsultorRequisicoes();
        return;
    }

    if (pendenciasActiveSection === 'consultor' && pendenciasActiveItem === 'projetos-terceiros') {
        if (typeof loadPendenciasThirdPartyConsultor === 'function') {
            loadPendenciasThirdPartyConsultor();
        }
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'aguardando-projeto-tecnico') {
        loadPendenciasAguardandoProjetoTecnico();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'projeto-tecnico') {
        loadPendenciasProjetoTecnico();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'projetos-terceiros') {
        if (typeof loadPendenciasThirdPartyProjetista === 'function') {
            loadPendenciasThirdPartyProjetista();
        }
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'em-revisao') {
        loadPendenciasEmRevisao();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'em-revisao-tecnica-revisor') {
        loadPendenciasEmRevisaoTecnicaRevisor();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'em-revisao-tecnica-proj') {
        loadPendenciasEmRevisaoTecnicaProj();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'requisicao') {
        loadPendenciasRequisicao();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'nomear') {
        loadPendenciasNomear();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'aguardando-ppcp') {
        loadPendenciasAguardandoPpcp();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'implantacao') {
        loadPendenciasImplantacao();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'detalhamento') {
        loadPendenciasProjetistaDetalhamento();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'aguardando-medicao') {
        loadPendenciasProjetistaAguardandoMedicao();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'aguardando-planta') {
        loadPendenciasProjetistaAguardandoPlanta();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'conferencias') {
        loadPendenciasProjetistaConferencias();
        return;
    }

    if (pendenciasActiveSection === 'gestor-projetos' && pendenciasActiveItem === 'projetos-sem-projetistas') {
        loadPendenciasProjetosSemProjetistas();
        return;
    }

    if (pendenciasActiveSection === 'gestor-projetos' && pendenciasActiveItem === 'terceiros-sem-projetistas') {
        if (typeof loadPendenciasThirdPartySemProjetista === 'function') {
            loadPendenciasThirdPartySemProjetista();
        }
        return;
    }

    if (pendenciasActiveSection === 'gestor-projetos' && pendenciasActiveItem === 'aguardando-detalhamento') {
        loadPendenciasGestorDetalhamento();
        return;
    }

    if (pendenciasActiveSection === 'gestor-projetos' && pendenciasActiveItem === 'expedicao') {
        loadPendenciasExpedicao();
        return;
    }

    if (pendenciasActiveSection === 'gestor-projetos' && pendenciasActiveItem === 'montagem-externa') {
        loadPendenciasMontagemExterna();
        return;
    }

    if (pendenciasActiveSection === 'gestor-comercial' && pendenciasActiveItem === 'aguardando-medicao') {
        loadPendenciasAguardandoMedicao();
        return;
    }

    if (pendenciasActiveSection === 'gestor-comercial' && pendenciasActiveItem === 'aprovar-conferencia') {
        loadPendenciasAprovarConferencia();
        return;
    }

    if (pendenciasActiveSection === 'gestor-comercial' && pendenciasActiveItem === 'aguardando-entrega-tecnica') {
        loadPendenciasAguardandoEntregaTecnica();
        return;
    }

    if (pendenciasActiveSection === 'gestor-fabrica' && pendenciasActiveItem === 'aguardando-montagem-interna') {
        loadPendenciasAguardandoMontagemInterna();
        return;
    }

    if (pendenciasActiveSection === 'gestor-fabrica' && pendenciasActiveItem === 'em-montagem') {
        loadPendenciasEmMontagem();
        return;
    }

    if (pendenciasActiveSection === 'compras' && pendenciasActiveItem === 'enviados-compras') {
        loadPendenciasEnviadosCompras();
        return;
    }

    const titles = {
        consultor: 'Consultor',
        'gestor-comercial': 'Gestor Comercial',
        'gestor-projetos': 'Gestor de Projetos',
        'gestor-fabrica': 'Gestor de Fábrica',
        compras: 'Compras',
        projetista: 'Projetista'
    };

    renderPendenciasPlaceholder(
        titles[pendenciasActiveSection] || 'Pendências',
        'Nenhuma pendência configurada neste menu.'
    );
}

function showPendencias() {
    if (!canAccessPendencias()) {
        alertAppDialog('Você não tem acesso à tela de pendências.');
        return;
    }

    const gestorSection = getPrimaryGestorPendenciasSection();
    if (gestorSection) {
        pendenciasActiveSection = gestorSection;
        pendenciasActiveItem = null;
    } else if (!pendenciasActiveSection) {
        pendenciasActiveSection = getDefaultPendenciasSection();
    }

    hideSubViews();
    document.getElementById('pendencias-view')?.classList.remove('hidden');
    updateMainNavActive('pendencias');
    updateAdminNav();
    updatePendenciasNav();
    renderPendenciasSidebar();
    loadPendenciasContent();
    persistPendenciasNavState();
}

function persistPendenciasNavState() {
    if (typeof saveAppNavState !== 'function') return;
    saveAppNavState({
        view: 'pendencias',
        pendenciasSection: pendenciasActiveSection,
        pendenciasItem: pendenciasActiveItem
    });
}

function updatePendenciasNav() {
    const btn = document.getElementById('btn-pendencias');
    if (btn) {
        btn.classList.toggle('hidden', !canAccessPendencias());
    }
}

function bindPendenciasEvents() {
    document.getElementById('btn-pendencias')?.addEventListener('click', showPendencias);
    if (typeof bindPendenciasAguardandoMedicaoModalEvents === 'function') {
        bindPendenciasAguardandoMedicaoModalEvents();
    }
}
