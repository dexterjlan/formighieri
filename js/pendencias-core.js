const PENDENCIAS_STATUS_AGUARDANDO_PT = 'Aguardando Projeto Técnico';
const PENDENCIAS_STATUS_PROJETO_TECNICO = 'Projeto Técnico';
const PENDENCIAS_STATUS_EM_REVISAO = 'Em Revisão';
const PENDENCIAS_STATUS_VENDIDO = 'Vendido';
const PENDENCIAS_STATUS_AGUARDANDO_OBRA = 'Aguardando Obra';
const PENDENCIAS_STATUS_AGUARDANDO_MEDICAO = 'Aguardando Medição';
const PENDENCIAS_STATUS_CONFERENCIA_REALIZADA = 'Conferência Realizada';
const PENDENCIAS_STATUS_CONFERENCIA_ENVIADA = 'Conferência Enviada';
const PENDENCIAS_STATUS_AGUARDANDO_APROVACAO = 'Aguardando Aprovação';
const PENDENCIAS_STATUS_AGUARDANDO_PPCP = 'Aguardando PPCP';
const PENDENCIAS_STATUS_IMPLANTACAO = 'Implantação';
const PENDENCIAS_STATUS_EM_PRODUCAO = 'Em Produção';
const PENDENCIAS_STATUS_MONTAGEM_INTERNA = 'Montagem Interna';
const PENDENCIAS_STATUS_EXPEDICAO = 'Expedição';

const PENDENCIAS_FABRICA_PROJECT_SELECT = `
    id, orderId, projectCode, name, statusId, deliveryDate,
    marceneiroId, inicioMontagemInterna, fimMontagemInterna,
    order:salesOrders(id, orderCode, clientName),
    projectStatus:OrderProjectStatus(id, name),
    marceneiro:Marceneiro(id, name)
`;

const PENDENCIAS_FABRICA_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, statusId, deliveryDate,
    marceneiroId, inicioMontagemInterna, fimMontagemInterna,
    order:salesOrders(id, orderCode, clientName)
`;
const PENDENCIAS_AGUARDANDO_MEDICAO_LIST_STATUSES = [
    PENDENCIAS_STATUS_VENDIDO,
    PENDENCIAS_STATUS_AGUARDANDO_OBRA
];
const PENDENCIAS_MINE_EXTRA_STATUSES = [
    PENDENCIAS_STATUS_PROJETO_TECNICO,
    'Aguardando Aprovação',
    'Em Revisão',
    'Em revisão'
];

const PENDENCIAS_PROJECT_SELECT = `
    id, orderId, projectCode, name, designerId, statusId, deliveryDate,
    order:salesOrders(id, orderCode, clientName, consultantName),
    designer:appUsers!OrderProject_designerId_fkey(id, name),
    projectStatus:OrderProjectStatus(id, name)
`;

const PENDENCIAS_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, designerId, statusId, deliveryDate,
    order:salesOrders(id, orderCode, clientName, consultantName)
`;

const PENDENCIAS_GESTOR_PROJETISTA_WORKLOAD_STATUSES = [
    PENDENCIAS_STATUS_PROJETO_TECNICO,
    'Em Revisão',
    'Em revisão',
    'Aguardando Aprovação',
    'Aguardando PPCP'
];

const PENDENCIAS_GESTOR_WORKLOAD_COLUMNS = [
    PENDENCIAS_STATUS_PROJETO_TECNICO,
    'Em Revisão',
    'Aguardando Aprovação',
    'Aguardando PPCP'
];

let pendenciasProjetistasCache = [];
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

function canSeePendenciasProjetistaMenu() {
    return canSeeAllPendenciasMenus() || currentUser?.role === 'Projetista';
}

function canSeePendenciasGestorComercialMenu() {
    return canSeeAllPendenciasMenus() || isGestorComercial();
}

function canSeePendenciasGestorProjetosMenu() {
    return canSeeAllPendenciasMenus() || isGestorProjetos();
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
    const items = [
        { id: 'aguardando-projeto-tecnico', label: 'Aguardando Projeto Técnico' },
        { id: 'em-revisao', label: 'Em Revisão' },
        { id: 'requisicao', label: 'Requisição' }
    ];

    if (canSeePendenciasPpcpItems()) {
        items.push(
            { id: 'aguardando-ppcp', label: 'Aguardando PPCP' },
            { id: 'implantacao', label: 'Implantação' }
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
        || canSeePendenciasGestorFabricaMenu();
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

function getDefaultPendenciasSection() {
    if (canSeeAllPendenciasMenus()) return 'gestor-projetos';
    if (canSeePendenciasConsultorMenu()) return 'consultor';
    if (canSeePendenciasProjetistaMenu()) return 'projetista';
    if (canSeePendenciasGestorComercialMenu()) return 'gestor-comercial';
    if (canSeePendenciasGestorProjetosMenu()) return 'gestor-projetos';
    if (canSeePendenciasGestorFabricaMenu()) return 'gestor-fabrica';
    return null;
}

function getPendenciasSidebarSections() {
    return [
        {
            id: 'consultor',
            label: 'Consultor',
            visible: canSeePendenciasConsultorMenu(),
            items: [
                { id: 'conferencia', label: 'Conferência' },
                { id: 'aguardando-aprovacao', label: 'Aguardando Aprovação' },
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
                { id: 'aprovar-conferencia', label: 'Aprovar Conferência' }
            ]
        },
        {
            id: 'gestor-projetos',
            label: 'Gestor de Projetos',
            visible: canSeePendenciasGestorProjetosMenu(),
            items: [
                { id: 'projetos-sem-projetistas', label: 'Projetos Sem Projetistas' }
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
        button.addEventListener('click', () => {
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
        button.addEventListener('click', () => {
            pendenciasActiveItem = null;
            renderPendenciasSidebar();
            loadPendenciasContent();
        });
    });

    nav.querySelectorAll('.pendencias-item-btn').forEach(button => {
        button.addEventListener('click', () => {
            pendenciasActiveItem = button.dataset.pendenciasItem;
            renderPendenciasSidebar();
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

async function getPendenciasStatusIdsByNames(names) {
    const uniqueNames = [...new Set(names.filter(Boolean))];
    const ids = [];

    for (const name of uniqueNames) {
        const id = await getPendenciasStatusIdByName(name);
        if (id && !ids.includes(id)) ids.push(id);
    }

    return ids;
}

async function queryPendenciasProjects(filters = {}) {
    const { statusId, statusIds, designerId, unassignedOnly = false } = filters;

    const buildQuery = (selectColumns) => {
        let query = supabaseClient.from('OrderProject').select(selectColumns);
        if (statusId) query = query.eq('statusId', statusId);
        if (statusIds?.length) query = query.in('statusId', statusIds);
        if (designerId) query = query.eq('designerId', designerId);
        if (unassignedOnly) query = query.is('designerId', null);
        return query;
    };

    let result = await buildQuery(PENDENCIAS_PROJECT_SELECT);

    if (result.error?.message?.includes('projectStatus') || result.error?.message?.includes('designer')) {
        result = await buildQuery(PENDENCIAS_PROJECT_SELECT_FALLBACK);
    }

    if (result.error) return result;

    const projects = await enrichPendenciasProjectsWithStatus(result.data || []);
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

function getPendenciasProjectStatusName(project) {
    return project?.projectStatus?.name || '';
}

function getPendenciasProjectStatusBadgeClass(statusName) {
    if (statusName === 'Aguardando Aprovação') return 'bg-amber-100 text-amber-800';
    if (statusName === 'Em Revisão' || statusName === 'Em revisão') return 'bg-sky-100 text-sky-800';
    if (statusName === PENDENCIAS_STATUS_PROJETO_TECNICO) return 'bg-violet-100 text-violet-800';
    if (statusName === PENDENCIAS_STATUS_AGUARDANDO_PT) return 'bg-indigo-100 text-indigo-800';
    if (statusName === PENDENCIAS_STATUS_VENDIDO) return 'bg-emerald-100 text-emerald-800';
    if (statusName === PENDENCIAS_STATUS_AGUARDANDO_OBRA) return 'bg-orange-100 text-orange-800';
    if (statusName === PENDENCIAS_STATUS_AGUARDANDO_MEDICAO) return 'bg-cyan-100 text-cyan-800';
    if (statusName === PENDENCIAS_STATUS_CONFERENCIA_REALIZADA) return 'bg-teal-100 text-teal-800';
    if (statusName === PENDENCIAS_STATUS_CONFERENCIA_ENVIADA) return 'bg-sky-100 text-sky-800';
    if (statusName === PENDENCIAS_STATUS_AGUARDANDO_PPCP) return 'bg-fuchsia-100 text-fuchsia-800';
    if (statusName === PENDENCIAS_STATUS_IMPLANTACAO) return 'bg-teal-100 text-teal-800';
    if (statusName === PENDENCIAS_STATUS_EM_PRODUCAO) return 'bg-orange-100 text-orange-800';
    if (statusName === PENDENCIAS_STATUS_MONTAGEM_INTERNA) return 'bg-amber-100 text-amber-800';
    return 'bg-slate-100 text-slate-700';
}

function loadPendenciasContent() {
    if (!pendenciasActiveItem) {
        loadPendenciasSectionOverview();
        return;
    }

    if (pendenciasActiveSection === 'consultor' && pendenciasActiveItem === 'conferencia') {
        loadPendenciasConsultorConferencia();
        return;
    }

    if (pendenciasActiveSection === 'consultor' && pendenciasActiveItem === 'aguardando-aprovacao') {
        loadPendenciasConsultorAguardandoAprovacao();
        return;
    }

    if (pendenciasActiveSection === 'consultor' && pendenciasActiveItem === 'requisicoes') {
        loadPendenciasConsultorRequisicoes();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'aguardando-projeto-tecnico') {
        loadPendenciasAguardandoProjetoTecnico();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'em-revisao') {
        loadPendenciasEmRevisao();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'requisicao') {
        loadPendenciasRequisicao();
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

    if (pendenciasActiveSection === 'gestor-projetos' && pendenciasActiveItem === 'projetos-sem-projetistas') {
        loadPendenciasProjetosSemProjetistas();
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

    if (pendenciasActiveSection === 'gestor-fabrica' && pendenciasActiveItem === 'aguardando-montagem-interna') {
        loadPendenciasAguardandoMontagemInterna();
        return;
    }

    if (pendenciasActiveSection === 'gestor-fabrica' && pendenciasActiveItem === 'em-montagem') {
        loadPendenciasEmMontagem();
        return;
    }

    const titles = {
        consultor: 'Consultor',
        'gestor-comercial': 'Gestor Comercial',
        'gestor-projetos': 'Gestor de Projetos',
        'gestor-fabrica': 'Gestor de Fábrica',
        projetista: 'Projetista'
    };

    renderPendenciasPlaceholder(
        titles[pendenciasActiveSection] || 'Pendências',
        'Nenhuma pendência configurada neste menu.'
    );
}

function showPendencias() {
    if (!canAccessPendencias()) {
        alert('Você não tem acesso à tela de pendências.');
        return;
    }

    hideSubViews();
    document.getElementById('pendencias-view')?.classList.remove('hidden');
    updateMainNavActive('pendencias');
    updateAdminNav();
    updatePendenciasNav();
    renderPendenciasSidebar();
    loadPendenciasContent();
}

function updatePendenciasNav() {
    const btn = document.getElementById('btn-pendencias');
    if (btn) {
        btn.classList.toggle('hidden', !canAccessPendencias());
    }
}

function bindPendenciasEvents() {
    document.getElementById('btn-pendencias')?.addEventListener('click', showPendencias);
}
