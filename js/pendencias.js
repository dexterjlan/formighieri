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

function renderPendenciasSidebar() {
    const nav = document.getElementById('pendencias-sidebar-nav');
    if (!nav) return;

    const sections = [
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
                { id: 'projetos-sem-projetistas', label: 'Projetos Sem Projetistas' },
                { id: 'em-revisao', label: 'Em Revisão' },
                { id: 'requisicao', label: 'Requisição' }
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

    if (!sections.length) {
        nav.innerHTML = '<p class="text-xs text-slate-400 px-2">Nenhum menu disponível.</p>';
        return;
    }

    if (!pendenciasActiveSection || !sections.some(section => section.id === pendenciasActiveSection)) {
        pendenciasActiveSection = getDefaultPendenciasSection();
    }

    const activeSection = sections.find(section => section.id === pendenciasActiveSection) || sections[0];
    const activeItems = activeSection.items || [];

    if (!pendenciasActiveItem || !activeItems.some(item => item.id === pendenciasActiveItem)) {
        pendenciasActiveItem = activeItems[0]?.id || null;
    }

    nav.innerHTML = sections.map(section => `
        <div class="space-y-1">
            <button type="button"
                class="pendencias-section-btn w-full text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide ${section.id === pendenciasActiveSection ? 'bg-violet-100 text-violet-900 border border-violet-200' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}"
                data-pendencias-section="${section.id}">
                ${escapeHtml(section.label)}
            </button>
            ${section.id === pendenciasActiveSection && section.items.length
                ? `<div class="pl-2 space-y-1">${section.items.map(item => `
                    <button type="button"
                        class="pendencias-item-btn w-full text-left px-3 py-2 rounded-lg text-xs font-medium ${item.id === pendenciasActiveItem ? 'bg-white text-violet-800 border border-violet-200 shadow-sm' : 'text-slate-600 hover:bg-white border border-transparent'}"
                        data-pendencias-item="${item.id}">
                        ${escapeHtml(item.label)}
                    </button>
                `).join('')}</div>`
                : ''}
        </div>
    `).join('');

    nav.querySelectorAll('.pendencias-section-btn').forEach(button => {
        button.addEventListener('click', () => {
            pendenciasActiveSection = button.dataset.pendenciasSection;
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
        button.addEventListener('click', () => {
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
        alert('Somente Gestor de Projetos pode associar responsáveis.');
        return;
    }

    if (!projectId || !designerId) {
        alert('Selecione um projetista.');
        return;
    }

    const projetista = pendenciasProjetistasCache.find(item => Number(item.id) === Number(designerId));
    if (!projetista) {
        alert('Projetista inválido.');
        return;
    }

    if (!confirm(`Associar este projeto a ${projetista.name}?`)) return;

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
        alert('Erro ao associar projetista: ' + error.message);
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
        alert('Somente Projetista pode associar projetos.');
        return;
    }

    if (!confirm('Associar este projeto a você como responsável?')) return;

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
        alert('Erro ao associar projeto: ' + error.message);
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
            alert('Requisição não encontrada.');
            return;
        }

        request = result.data;
    }

    if (!isRequestWaitingProjetista(request) || !canEditProjetistaResponse(request)) {
        alert('Sem permissão para visualizar esta requisição.');
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

function canAccessPendenciasAguardandoMedicao() {
    return canSeePendenciasGestorComercialMenu();
}

function canEditPendenciasAguardandoMedicaoStatus() {
    return isGestorComercial();
}

async function fetchPendenciasAguardandoMedicaoProjects() {
    const statusIds = await getPendenciasStatusIdsByNames(PENDENCIAS_AGUARDANDO_MEDICAO_LIST_STATUSES);

    if (!statusIds.length) {
        return {
            error: new Error('Status "Vendido" ou "Aguardando Obra" não encontrados.'),
            projects: []
        };
    }

    const result = await queryPendenciasProjects({ statusIds });
    if (result.error) {
        return { error: result.error, projects: [] };
    }

    return {
        error: null,
        projects: sortPendenciasByDeliveryDate(result.data || [])
    };
}

function renderPendenciasAguardandoMedicaoActionButtons(project, canEdit) {
    const statusName = getPendenciasProjectStatusName(project);
    const obraDisabled = !canEdit || statusName === PENDENCIAS_STATUS_AGUARDANDO_OBRA;
    const medicaoDisabled = !canEdit;
    const disabledClass = 'opacity-50 cursor-not-allowed';

    return `
        <div class="flex flex-wrap justify-end gap-1.5">
            <button type="button"
                class="pendencias-status-obra-btn text-xs bg-orange-50 text-orange-800 border border-orange-200 px-2.5 py-1 rounded-lg font-medium ${obraDisabled ? disabledClass : 'hover:bg-orange-100'}"
                data-project-id="${project.id}"
                data-target-status="${escapeHtml(PENDENCIAS_STATUS_AGUARDANDO_OBRA)}"
                ${obraDisabled ? 'disabled' : ''}>
                Aguardando Obra
            </button>
            <button type="button"
                class="pendencias-status-medicao-btn text-xs bg-cyan-50 text-cyan-800 border border-cyan-200 px-2.5 py-1 rounded-lg font-medium ${medicaoDisabled ? disabledClass : 'hover:bg-cyan-100'}"
                data-project-id="${project.id}"
                data-target-status="${escapeHtml(PENDENCIAS_STATUS_AGUARDANDO_MEDICAO)}"
                ${medicaoDisabled ? 'disabled' : ''}>
                Aguardando Medição
            </button>
        </div>
    `;
}

function renderPendenciasAguardandoMedicaoList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canEdit = canEditPendenciasAguardandoMedicaoStatus();
    const subtitle = canEdit
        ? 'Projetos vendidos ou aguardando obra. Altere o status conforme o andamento.'
        : 'Visualização dos projetos vendidos ou aguardando obra.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const statusName = getPendenciasProjectStatusName(project);
        const statusClass = getPendenciasProjectStatusBadgeClass(statusName);

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(statusName || '—')}
                    </span>
                </td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">
                    ${renderPendenciasAguardandoMedicaoActionButtons(project, canEdit)}
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aguardando Medição</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-aguardando-medicao"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[920px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Status</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-56">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto vendido ou aguardando obra.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-aguardando-medicao')
        ?.addEventListener('click', () => loadPendenciasAguardandoMedicao());

    content.querySelectorAll('.pendencias-status-obra-btn:not([disabled]), .pendencias-status-medicao-btn')
        .forEach(button => {
            button.addEventListener('click', () => {
                updatePendenciasAguardandoMedicaoStatus(
                    Number(button.dataset.projectId),
                    button.dataset.targetStatus
                );
            });
        });
}

async function updatePendenciasAguardandoMedicaoStatus(projectId, targetStatusName) {
    if (!canEditPendenciasAguardandoMedicaoStatus()) {
        alert('Sem permissão para alterar status.');
        return;
    }

    if (!projectId || !targetStatusName) return;

    const allowedTargets = [PENDENCIAS_STATUS_AGUARDANDO_OBRA, PENDENCIAS_STATUS_AGUARDANDO_MEDICAO];
    if (!allowedTargets.includes(targetStatusName)) return;

    const { data: rawProject, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, statusId, projectStatus:OrderProjectStatus(id, name)')
        .eq('id', projectId)
        .maybeSingle();

    let project = rawProject;

    if (readError?.message?.includes('projectStatus')) {
        const fallback = await supabaseClient
            .from('OrderProject')
            .select('id, statusId')
            .eq('id', projectId)
            .maybeSingle();

        if (fallback.error || !fallback.data) {
            alert('Projeto não encontrado.');
            return;
        }

        project = (await enrichPendenciasProjectsWithStatus([fallback.data]))[0];
    } else if (readError || !project) {
        alert('Projeto não encontrado.');
        return;
    }

    const currentStatusName = getPendenciasProjectStatusName(project);
    if (!PENDENCIAS_AGUARDANDO_MEDICAO_LIST_STATUSES.includes(currentStatusName)) {
        alert('O status do projeto foi alterado. Atualize a lista.');
        await loadPendenciasAguardandoMedicao();
        return;
    }

    if (targetStatusName === PENDENCIAS_STATUS_AGUARDANDO_OBRA
        && currentStatusName === PENDENCIAS_STATUS_AGUARDANDO_OBRA) {
        return;
    }

    if (currentStatusName === targetStatusName) {
        await loadPendenciasAguardandoMedicao();
        return;
    }

    if (!confirm(`Alterar status do projeto para "${targetStatusName}"?`)) return;

    const statusId = await getPendenciasStatusIdByName(targetStatusName);
    if (!statusId) {
        alert(`Status "${targetStatusName}" não encontrado.`);
        return;
    }

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
        alert('Erro ao alterar status: ' + error.message);
        return;
    }

    await loadPendenciasAguardandoMedicao();
}

async function fetchPendenciasProjectsByStatusName(statusName) {
    const statusId = await getPendenciasStatusIdByName(statusName);

    if (!statusId) {
        return {
            error: new Error(`Status "${statusName}" não encontrado.`),
            projects: []
        };
    }

    const result = await queryPendenciasProjects({ statusId });
    if (result.error) {
        return { error: result.error, projects: [] };
    }

    return {
        error: null,
        projects: sortPendenciasByDeliveryDate(result.data || [])
    };
}

function renderPendenciasPpcpProjectList(config) {
    const {
        title,
        subtitle,
        projects,
        emptyMessage,
        refreshButtonId,
        refreshHandler,
        expectedStatusName,
        targetStatusName,
        actionLabel,
        actionButtonClass,
        confirmMessage
    } = config;

    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasPpcpStatus();
    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const statusName = getPendenciasProjectStatusName(project);
        const statusClass = getPendenciasProjectStatusBadgeClass(statusName);
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-ppcp-action-btn text-xs px-2.5 py-1 rounded-lg font-medium ${actionButtonClass}"
                data-project-id="${project.id}"
                data-expected-status="${escapeHtml(expectedStatusName)}"
                data-target-status="${escapeHtml(targetStatusName)}"
                data-confirm-message="${escapeHtml(confirmMessage)}">
                ${escapeHtml(actionLabel)}
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(statusName || '—')}
                    </span>
                </td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
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
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[920px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Status</th>
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

    content.querySelector(`#${refreshButtonId}`)
        ?.addEventListener('click', refreshHandler);

    content.querySelectorAll('.pendencias-ppcp-action-btn').forEach(button => {
        button.addEventListener('click', () => {
            updatePendenciasPpcpProjectStatus(
                Number(button.dataset.projectId),
                button.dataset.expectedStatus,
                button.dataset.targetStatus,
                button.dataset.confirmMessage
            );
        });
    });
}

async function updatePendenciasPpcpProjectStatus(projectId, expectedStatusName, targetStatusName, confirmMessage) {
    if (!canActPendenciasPpcpStatus()) {
        alert('Sem permissão para alterar status.');
        return;
    }

    if (!projectId || !expectedStatusName || !targetStatusName) return;

    const { data: rawProject, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, statusId, projectStatus:OrderProjectStatus(id, name)')
        .eq('id', projectId)
        .maybeSingle();

    let project = rawProject;

    if (readError?.message?.includes('projectStatus')) {
        const fallback = await supabaseClient
            .from('OrderProject')
            .select('id, statusId')
            .eq('id', projectId)
            .maybeSingle();

        if (fallback.error || !fallback.data) {
            alert('Projeto não encontrado.');
            return;
        }

        project = (await enrichPendenciasProjectsWithStatus([fallback.data]))[0];
    } else if (readError || !project) {
        alert('Projeto não encontrado.');
        return;
    }

    const currentStatusName = getPendenciasProjectStatusName(project);
    if (currentStatusName !== expectedStatusName) {
        alert('O status do projeto foi alterado. Atualize a lista.');
        await reloadActivePendenciasPpcpList();
        return;
    }

    if (!confirm(confirmMessage || `Alterar status do projeto para "${targetStatusName}"?`)) return;

    const statusId = await getPendenciasStatusIdByName(targetStatusName);
    if (!statusId) {
        alert(`Status "${targetStatusName}" não encontrado.`);
        return;
    }

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
        alert('Erro ao alterar status: ' + error.message);
        return;
    }

    await reloadActivePendenciasPpcpList();
}

async function reloadActivePendenciasPpcpList() {
    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'aguardando-ppcp') {
        await loadPendenciasAguardandoPpcp();
        return;
    }

    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'implantacao') {
        await loadPendenciasImplantacao();
    }
}

async function loadPendenciasAguardandoPpcp() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasPpcpItems()) {
        renderPendenciasPlaceholder('Aguardando PPCP', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_AGUARDANDO_PPCP);

    if (error) {
        renderPendenciasPlaceholder('Aguardando PPCP', `Erro ao carregar: ${error.message}`);
        return;
    }

    const subtitle = canActPendenciasPpcpStatus()
        ? 'Projetos aguardando PPCP. Clique em Implantar para enviar à implantação.'
        : 'Visualização dos projetos aguardando PPCP.';

    renderPendenciasPpcpProjectList({
        title: 'Aguardando PPCP',
        subtitle,
        projects,
        emptyMessage: 'Nenhum projeto aguardando PPCP.',
        refreshButtonId: 'btn-pendencias-refresh-aguardando-ppcp',
        refreshHandler: () => loadPendenciasAguardandoPpcp(),
        expectedStatusName: PENDENCIAS_STATUS_AGUARDANDO_PPCP,
        targetStatusName: PENDENCIAS_STATUS_IMPLANTACAO,
        actionLabel: 'Implantar',
        actionButtonClass: 'bg-violet-100 text-violet-800 hover:bg-violet-200',
        confirmMessage: 'Enviar este projeto para implantação?'
    });
}

async function loadPendenciasImplantacao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasPpcpItems()) {
        renderPendenciasPlaceholder('Implantação', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_IMPLANTACAO);

    if (error) {
        renderPendenciasPlaceholder('Implantação', `Erro ao carregar: ${error.message}`);
        return;
    }

    const subtitle = canActPendenciasPpcpStatus()
        ? 'Projetos em implantação. Finalize a implantação e inicie a produção.'
        : 'Visualização dos projetos em implantação.';

    renderPendenciasPpcpProjectList({
        title: 'Implantação',
        subtitle,
        projects,
        emptyMessage: 'Nenhum projeto em implantação.',
        refreshButtonId: 'btn-pendencias-refresh-implantacao',
        refreshHandler: () => loadPendenciasImplantacao(),
        expectedStatusName: PENDENCIAS_STATUS_IMPLANTACAO,
        targetStatusName: PENDENCIAS_STATUS_EM_PRODUCAO,
        actionLabel: 'Iniciar produção',
        actionButtonClass: 'bg-teal-100 text-teal-800 hover:bg-teal-200',
        confirmMessage: 'Finalizar implantação e iniciar produção deste projeto?'
    });
}

async function queryPendenciasFabricaProjects(statusId) {
    const buildQuery = (selectColumns) => supabaseClient
        .from('OrderProject')
        .select(selectColumns)
        .eq('statusId', statusId);

    let result = await buildQuery(PENDENCIAS_FABRICA_PROJECT_SELECT);

    if (result.error?.message?.includes('marceneiro')
        || result.error?.message?.includes('MontagemInterna')
        || result.error?.message?.includes('projectStatus')) {
        result = await buildQuery(PENDENCIAS_FABRICA_PROJECT_SELECT_FALLBACK);
    }

    if (result.error) return result;

    const projects = await enrichPendenciasProjectsWithStatus(result.data || []);
    return { ...result, data: projects };
}

async function fetchPendenciasFabricaProjectsByStatusName(statusName) {
    const statusId = await getPendenciasStatusIdByName(statusName);

    if (!statusId) {
        return {
            error: new Error(`Status "${statusName}" não encontrado.`),
            projects: []
        };
    }

    const result = await queryPendenciasFabricaProjects(statusId);
    if (result.error) {
        return { error: result.error, projects: [] };
    }

    return {
        error: null,
        projects: sortPendenciasByDeliveryDate(result.data || [])
    };
}

function getPendenciasFabricaTodayInputDate() {
    if (typeof getTodayInputDate === 'function') {
        return getTodayInputDate();
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getPendenciasFabricaMarceneiroOptionsHtml(selectedId = null) {
    if (typeof getFabricaMarceneiroOptionsHtml === 'function') {
        return getFabricaMarceneiroOptionsHtml(selectedId);
    }

    return '<option value="">Nenhum marceneiro cadastrado</option>';
}

function formatPendenciasFabricaDisplayDate(dateStr) {
    if (typeof formatFabricaDisplayDate === 'function') {
        return formatFabricaDisplayDate(dateStr);
    }

    if (!dateStr) return '—';
    const value = String(dateStr).split('T')[0];
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return '—';
    return `${day}/${month}/${year}`;
}

function getPendenciasFabricaMarceneiroName(project) {
    if (typeof getFabricaMarceneiroName === 'function') {
        return getFabricaMarceneiroName(project);
    }

    return project.marceneiro?.name || '—';
}

function renderPendenciasAguardandoMontagemInternaList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasGestorFabrica();
    const todayMax = getPendenciasFabricaTodayInputDate();
    const subtitle = canAct
        ? 'Projetos em produção. Registre marceneiro e início da montagem interna.'
        : 'Visualização dos projetos aguardando início da montagem interna.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const inicioValue = project.inicioMontagemInterna
            ? String(project.inicioMontagemInterna).split('T')[0]
            : '';
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-fabrica-inicio-btn text-xs bg-orange-100 text-orange-800 hover:bg-orange-200 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
                data-project-id="${project.id}">
                Iniciar montagem
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0" data-pendencias-fabrica-project-id="${project.id}">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3">
                    <select class="pendencias-fabrica-marceneiro w-full min-w-[140px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-600"
                        ${canAct ? '' : 'disabled'}>
                        ${getPendenciasFabricaMarceneiroOptionsHtml(project.marceneiroId)}
                    </select>
                </td>
                <td class="p-3">
                    <input type="date" class="pendencias-fabrica-inicio w-full min-w-[130px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-600"
                        max="${todayMax}" value="${escapeHtml(inicioValue)}" ${canAct ? '' : 'disabled'}>
                </td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aguar. Mont. Int.</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-aguardando-montagem-interna"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[980px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-left p-3 font-semibold">Marceneiro</th>
                                <th class="text-left p-3 font-semibold">Início</th>
                                <th class="text-right p-3 font-semibold w-40">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto em produção aguardando montagem interna.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-aguardando-montagem-interna')
        ?.addEventListener('click', () => loadPendenciasAguardandoMontagemInterna());

    content.querySelectorAll('.pendencias-fabrica-inicio-btn').forEach(button => {
        button.addEventListener('click', () => {
            savePendenciasFabricaInicioMontagem(Number(button.dataset.projectId));
        });
    });
}

function renderPendenciasEmMontagemList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasGestorFabrica();
    const todayMax = getPendenciasFabricaTodayInputDate();
    const subtitle = canAct
        ? 'Projetos em montagem interna. Registre a data de fim para enviar à expedição.'
        : 'Visualização dos projetos em montagem interna.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const marceneiroName = getPendenciasFabricaMarceneiroName(project);
        const inicioDisplay = formatPendenciasFabricaDisplayDate(project.inicioMontagemInterna);
        const fimValue = project.fimMontagemInterna
            ? String(project.fimMontagemInterna).split('T')[0]
            : '';
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-fabrica-fim-btn text-xs bg-amber-100 text-amber-800 hover:bg-amber-200 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
                data-project-id="${project.id}">
                Finalizar montagem
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0" data-pendencias-fabrica-project-id="${project.id}">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(marceneiroName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(inicioDisplay)}</td>
                <td class="p-3">
                    <input type="date" class="pendencias-fabrica-fim w-full min-w-[130px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600"
                        max="${todayMax}" value="${escapeHtml(fimValue)}" ${canAct ? '' : 'disabled'}>
                </td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Em Montagem</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-em-montagem"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[980px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Marceneiro</th>
                                <th class="text-left p-3 font-semibold">Início</th>
                                <th class="text-left p-3 font-semibold">Fim</th>
                                <th class="text-right p-3 font-semibold w-40">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto em montagem interna.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-em-montagem')
        ?.addEventListener('click', () => loadPendenciasEmMontagem());

    content.querySelectorAll('.pendencias-fabrica-fim-btn').forEach(button => {
        button.addEventListener('click', () => {
            savePendenciasFabricaFimMontagem(Number(button.dataset.projectId));
        });
    });
}

async function savePendenciasFabricaInicioMontagem(projectId) {
    if (!canActPendenciasGestorFabrica()) {
        alert('Sem permissão para registrar montagem.');
        return;
    }

    const row = document.querySelector(`tr[data-pendencias-fabrica-project-id="${projectId}"]`);
    if (!row) return;

    const marceneiroId = row.querySelector('.pendencias-fabrica-marceneiro')?.value;
    const inicioMontagemInterna = row.querySelector('.pendencias-fabrica-inicio')?.value;
    const projectLabel = row.querySelector('td:nth-child(3)')?.textContent?.trim() || 'Projeto';

    if (!marceneiroId) {
        alert(`"${projectLabel}": selecione o marceneiro responsável.`);
        return;
    }
    if (!inicioMontagemInterna) {
        alert(`"${projectLabel}": informe a data de início da montagem interna.`);
        return;
    }
    if (typeof isFabricaDateInFuture === 'function' && isFabricaDateInFuture(inicioMontagemInterna)) {
        alert(`"${projectLabel}": a data de início não pode ser no futuro.`);
        return;
    }

    if (!confirm(`Registrar início da montagem interna de "${projectLabel}"?`)) return;

    const montagemInternaStatusId = typeof getMontagemInternaProjectStatusId === 'function'
        ? await getMontagemInternaProjectStatusId()
        : await getPendenciasStatusIdByName(PENDENCIAS_STATUS_MONTAGEM_INTERNA);

    if (!montagemInternaStatusId) {
        alert(`Status "${PENDENCIAS_STATUS_MONTAGEM_INTERNA}" não encontrado.`);
        return;
    }

    try {
        if (typeof persistFabricaInicioProject === 'function') {
            await persistFabricaInicioProject({
                projectId,
                marceneiroId: Number(marceneiroId),
                inicioMontagemInterna,
                label: projectLabel
            }, montagemInternaStatusId);
        } else {
            const now = new Date().toISOString();
            const { error } = await supabaseClient
                .from('OrderProject')
                .update({
                    marceneiroId: Number(marceneiroId),
                    inicioMontagemInterna,
                    statusId: montagemInternaStatusId,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', projectId);

            if (error) throw new Error(error.message);
        }

        await reloadActivePendenciasGestorFabricaList();
        if (activeOrderId && typeof loadFabricaProjects === 'function') {
            await loadFabricaProjects(activeOrderId);
        }
    } catch (error) {
        const sqlHint = error.message?.includes('marceneiroId') || error.message?.includes('MontagemInterna')
            ? '\n\nExecute supabase/add-order-project-montagem-fields.sql no Supabase.'
            : '';
        alert('Erro ao salvar: ' + error.message + sqlHint);
    }
}

async function savePendenciasFabricaFimMontagem(projectId) {
    if (!canActPendenciasGestorFabrica()) {
        alert('Sem permissão para registrar montagem.');
        return;
    }

    const row = document.querySelector(`tr[data-pendencias-fabrica-project-id="${projectId}"]`);
    if (!row) return;

    const fimMontagemInterna = row.querySelector('.pendencias-fabrica-fim')?.value;
    const projectLabel = row.querySelector('td:nth-child(3)')?.textContent?.trim() || 'Projeto';

    if (!fimMontagemInterna) {
        alert(`"${projectLabel}": informe a data de fim da montagem interna.`);
        return;
    }
    if (typeof isFabricaDateInFuture === 'function' && isFabricaDateInFuture(fimMontagemInterna)) {
        alert(`"${projectLabel}": a data de fim não pode ser no futuro.`);
        return;
    }

    if (!confirm(`Finalizar montagem interna de "${projectLabel}" e enviar à expedição?`)) return;

    const expedicaoStatusId = typeof getExpedicaoProjectStatusId === 'function'
        ? await getExpedicaoProjectStatusId()
        : await getPendenciasStatusIdByName(PENDENCIAS_STATUS_EXPEDICAO);

    if (!expedicaoStatusId) {
        alert(`Status "${PENDENCIAS_STATUS_EXPEDICAO}" não encontrado.`);
        return;
    }

    try {
        if (typeof persistFabricaFimProject === 'function') {
            await persistFabricaFimProject({
                projectId,
                fimMontagemInterna,
                label: projectLabel
            }, expedicaoStatusId);
        } else {
            const now = new Date().toISOString();
            const { error } = await supabaseClient
                .from('OrderProject')
                .update({
                    fimMontagemInterna,
                    statusId: expedicaoStatusId,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', projectId);

            if (error) throw new Error(error.message);
        }

        await reloadActivePendenciasGestorFabricaList();
        if (activeOrderId && typeof loadFabricaProjects === 'function') {
            await loadFabricaProjects(activeOrderId);
        }
    } catch (error) {
        const sqlHint = error.message?.includes('fimMontagemInterna')
            ? '\n\nExecute supabase/add-order-project-montagem-fields.sql no Supabase.'
            : '';
        alert('Erro ao salvar: ' + error.message + sqlHint);
    }
}

async function reloadActivePendenciasGestorFabricaList() {
    if (pendenciasActiveSection === 'gestor-fabrica' && pendenciasActiveItem === 'aguardando-montagem-interna') {
        await loadPendenciasAguardandoMontagemInterna();
        return;
    }

    if (pendenciasActiveSection === 'gestor-fabrica' && pendenciasActiveItem === 'em-montagem') {
        await loadPendenciasEmMontagem();
    }
}

async function loadPendenciasAguardandoMontagemInterna() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasGestorFabricaMenu()) {
        renderPendenciasPlaceholder('Aguar. Mont. Int.', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    if (typeof loadFabricaMarceneiros === 'function') {
        await loadFabricaMarceneiros();
    }

    const { error, projects } = await fetchPendenciasFabricaProjectsByStatusName(PENDENCIAS_STATUS_EM_PRODUCAO);

    if (error) {
        renderPendenciasPlaceholder('Aguar. Mont. Int.', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasAguardandoMontagemInternaList(projects);
}

async function loadPendenciasEmMontagem() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasGestorFabricaMenu()) {
        renderPendenciasPlaceholder('Em Montagem', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    if (typeof loadFabricaMarceneiros === 'function') {
        await loadFabricaMarceneiros();
    }

    const { error, projects } = await fetchPendenciasFabricaProjectsByStatusName(PENDENCIAS_STATUS_MONTAGEM_INTERNA);

    if (error) {
        renderPendenciasPlaceholder('Em Montagem', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEmMontagemList(projects);
}

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

    return { error: null, projects, conferenceByProjectId };
}

function renderPendenciasAprovarConferenciaList(projects, conferenceByProjectId) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const subtitle = isGestorComercial()
        ? 'Projetos com conferência realizada aguardando aprovação comercial.'
        : 'Visualização dos projetos com conferência realizada aguardando aprovação.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const conference = conferenceByProjectId[project.id];
        const canView = Boolean(conference);

        const actionCell = canView
            ? `<button type="button" onclick="openAnteprojetoConferenceFromPendencias(${conference.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Conferência</button>`
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

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aprovar Conferência</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-aprovar-conferencia"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
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
                                <th class="text-right p-3 font-semibold w-36">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : `<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto com conferência realizada aguardando aprovação.</p>`}
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

    const { error, projects, conferenceByProjectId } = await fetchPendenciasAprovarConferenciaProjects();

    if (error) {
        renderPendenciasPlaceholder('Aprovar Conferência', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasAprovarConferenciaList(projects, conferenceByProjectId);
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

    return { error: null, overviewMode, projects, conferenceByProjectId };
}

function renderPendenciasConsultorConferenciaList(projects, conferenceByProjectId, overviewMode) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const subtitle = overviewMode
        ? 'Todos os projetos com conferência enviada aguardando retorno do consultor.'
        : 'Projetos dos seus pedidos com conferência enviada.';

    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = project.order?.clientName || '—';
        const projectLabel = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasDeliveryDate(project.deliveryDate);
        const conference = conferenceByProjectId[project.id];
        const canView = Boolean(conference);

        const actionCell = canView
            ? `<button type="button" onclick="openAnteprojetoConferenceFromPendencias(${conference.id})"
                class="text-xs bg-sky-100 text-sky-800 hover:bg-sky-200 px-2.5 py-1 rounded-lg font-medium">Ver Conferência</button>`
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
        ? 'Nenhum projeto com conferência enviada.'
        : 'Nenhum projeto com conferência enviada nos seus pedidos.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Conferência</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-consultor-conferencia"
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
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
                                <th class="text-right p-3 font-semibold w-36">Ações</th>
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

    const { error, overviewMode, projects, conferenceByProjectId } =
        await fetchPendenciasConsultorConferenciaProjects();

    if (error) {
        renderPendenciasPlaceholder('Conferência', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasConsultorConferenciaList(projects, conferenceByProjectId, overviewMode);
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
        const projectLabel = getPendenciasProjectLabel(project);
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
                    class="text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    Atualizar
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
        alert('Solicitação comercial não encontrada.');
        return;
    }

    if (!canApproveCommercialApproval(approval)) {
        alert('Sem permissão para aprovar esta solicitação.');
        return;
    }

    await approveCommercialApproval(approval.id);
}

async function openCommercialRevisionFromPendencias(approvalId) {
    const approval = await ensureCommercialApprovalInPendenciasContext(approvalId);

    if (!approval) {
        alert('Solicitação comercial não encontrada.');
        return;
    }

    if (typeof openCommercialRevisionModal !== 'function') {
        alert('Recurso de revisão indisponível.');
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
            alert('Requisição não encontrada.');
            return;
        }

        request = result.data;
    }

    if (!isRequestWaitingConsultor(request)) {
        alert('Esta requisição não está aguardando resposta do consultor.');
        return;
    }

    const canOpen = currentUser?.role === 'Admin'
        || canRespondAsConsultor(request)
        || canEditConversation(request);

    if (!canOpen) {
        alert('Sem permissão para visualizar esta requisição.');
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
        alert(`Status "${PENDENCIAS_STATUS_PROJETO_TECNICO}" não encontrado.`);
        return;
    }

    const { data: project, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, designerId')
        .eq('id', projectId)
        .maybeSingle();

    if (readError || !project) {
        alert('Projeto não encontrado.');
        return;
    }

    if (Number(project.designerId) !== Number(currentUser?.id) && !isAdmin()) {
        alert('Somente o responsável do projeto pode iniciá-lo.');
        return;
    }

    if (!confirm('Iniciar projeto técnico deste projeto?')) return;

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
        alert('Erro ao iniciar projeto: ' + error.message);
        return;
    }

    await loadPendenciasAguardandoProjetoTecnico();
}

function loadPendenciasContent() {
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

    if (pendenciasActiveSection === 'gestor-projetos' && pendenciasActiveItem === 'em-revisao') {
        loadPendenciasEmRevisao();
        return;
    }

    if (pendenciasActiveSection === 'gestor-projetos' && pendenciasActiveItem === 'requisicao') {
        loadPendenciasRequisicao();
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
