const PENDENCIAS_STATUS_AGUARDANDO_PT = 'Aguardando Projeto Técnico';
const PENDENCIAS_STATUS_PROJETO_TECNICO = 'Projeto Técnico';
const PENDENCIAS_MINE_EXTRA_STATUSES = [
    PENDENCIAS_STATUS_PROJETO_TECNICO,
    'Aguardando Aprovação',
    'Em Revisão',
    'Em revisão'
];

const PENDENCIAS_PROJECT_SELECT = `
    id, orderId, projectCode, name, designerId, statusId, deliveryDate,
    order:salesOrders(id, orderCode, clientName),
    designer:appUsers!OrderProject_designerId_fkey(id, name),
    projectStatus:OrderProjectStatus(id, name)
`;

const PENDENCIAS_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, designerId, statusId, deliveryDate,
    order:salesOrders(id, orderCode, clientName)
`;

let pendenciasActiveSection = null;
let pendenciasActiveItem = null;

function canSeePendenciasConsultorMenu() {
    return isAdmin() || currentUser?.role === 'Consultor';
}

function canSeePendenciasProjetistaMenu() {
    return isAdmin() || currentUser?.role === 'Projetista';
}

function canSeePendenciasGestorComercialMenu() {
    return isAdmin() || isGestorComercial();
}

function canSeePendenciasGestorProjetosMenu() {
    return isAdmin() || isGestorProjetos();
}

function canAccessPendencias() {
    return canSeePendenciasConsultorMenu()
        || canSeePendenciasProjetistaMenu()
        || canSeePendenciasGestorComercialMenu()
        || canSeePendenciasGestorProjetosMenu();
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
    if (canSeePendenciasConsultorMenu()) return 'consultor';
    if (canSeePendenciasProjetistaMenu()) return 'projetista';
    if (canSeePendenciasGestorComercialMenu()) return 'gestor-comercial';
    if (canSeePendenciasGestorProjetosMenu()) return 'gestor-projetos';
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
            items: []
        },
        {
            id: 'projetista',
            label: 'Projetista',
            visible: canSeePendenciasProjetistaMenu(),
            items: [
                { id: 'aguardando-projeto-tecnico', label: 'Aguardando Projeto Técnico' }
            ]
        },
        {
            id: 'gestor-comercial',
            label: 'Gestor Comercial',
            visible: canSeePendenciasGestorComercialMenu(),
            items: []
        },
        {
            id: 'gestor-projetos',
            label: 'Gestor de Projetos',
            visible: canSeePendenciasGestorProjetosMenu(),
            items: []
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
    if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'aguardando-projeto-tecnico') {
        loadPendenciasAguardandoProjetoTecnico();
        return;
    }

    const titles = {
        consultor: 'Consultor',
        'gestor-comercial': 'Gestor Comercial',
        'gestor-projetos': 'Gestor de Projetos',
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
