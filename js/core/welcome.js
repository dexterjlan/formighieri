const WELCOME_FLOW_LANE_META = {
    'gestor-comercial': { label: 'Gestor Comercial', legendClass: 'welcome-legend--gestor-comercial' },
    'projetista-conferente': { label: 'Projetista (Conferente)', legendClass: 'welcome-legend--projetista-conferente' },
    consultor: { label: 'Consultor', legendClass: 'welcome-legend--consultor' },
    projetista: { label: 'Projetista', legendClass: 'welcome-legend--projetista' },
    revisor: { label: 'Revisor', legendClass: 'welcome-legend--revisor' },
    'projetista-ppcp': { label: 'Projetista (PPCP)', legendClass: 'welcome-legend--projetista-ppcp' },
    'gestor-fabrica': { label: 'Gestor Fábrica', legendClass: 'welcome-legend--gestor-fabrica' }
};

const WELCOME_FLOW_STEPS = [
    { status: 'Vendido', lane: 'gestor-comercial' },
    { status: 'Aguardando Obra', lane: 'gestor-comercial' },
    { status: 'Aguardando Medição', lane: 'gestor-comercial' },
    { status: 'Medição Realizada', lane: 'projetista-conferente' },
    { status: 'Planta Levantada', lane: 'projetista-conferente' },
    { status: 'Conferência Enviada', lane: 'projetista-conferente' },
    { status: 'Conferência Realizada', lane: 'consultor' },
    { status: 'Aguardando Projeto Técnico', lane: 'gestor-comercial' },
    { status: 'Projeto Técnico', lane: 'projetista' },
    { status: ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS, lane: 'consultor' },
    { status: ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ, lane: 'projetista' },
    { status: 'Aguardando Aprovação', lane: 'consultor' },
    { status: ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR, lane: 'revisor' },
    { status: ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ, lane: 'projetista' },
    { status: 'Nomear', lane: 'consultor' },
    { status: 'Aguardando PPCP', lane: 'projetista' },
    { status: 'Implantação', lane: 'projetista-ppcp' },
    { status: 'Em Produção', lane: 'projetista-ppcp' },
    { status: 'Montagem Interna', lane: 'gestor-fabrica' },
    { status: 'Expedição', lane: 'gestor-fabrica' }
];

function renderWelcomeFlowLegend(steps = WELCOME_FLOW_STEPS) {
    const legend = document.getElementById('welcome-flow-legend');
    if (!legend) return;

    const seen = new Set();
    const items = [];

    steps.forEach(step => {
        if (seen.has(step.lane)) return;
        seen.add(step.lane);
        const meta = WELCOME_FLOW_LANE_META[step.lane] || WELCOME_FLOW_LANE_META['gestor-comercial'];
        items.push(`<span class="welcome-legend ${meta.legendClass}">${escapeHtml(meta.label)}</span>`);
    });

    legend.innerHTML = items.join('');
}

function renderWelcomeFlowStep(step, index, totalSteps = WELCOME_FLOW_STEPS.length) {
    const meta = WELCOME_FLOW_LANE_META[step.lane] || WELCOME_FLOW_LANE_META['gestor-comercial'];
    const connector = index < totalSteps - 1
        ? '<div class="welcome-flow-timeline-connector" aria-hidden="true"><span class="welcome-flow-timeline-line"></span></div>'
        : '';

    return `
        <div class="welcome-flow-timeline-item">
            <div class="welcome-flow-timeline-marker welcome-flow-timeline-marker--${step.lane}">
                <span class="welcome-flow-timeline-order">${index + 1}</span>
            </div>
            <div class="welcome-flow-timeline-card welcome-pipeline-node welcome-pipeline-node--${step.lane}">
                <span class="welcome-pipeline-node-label">${escapeHtml(step.status)}</span>
                <span class="welcome-flow-timeline-owner ${meta.legendClass}">${escapeHtml(meta.label)}</span>
            </div>
        </div>
        ${connector}
    `;
}

async function renderWelcomeFlowchart() {
    const container = document.getElementById('welcome-flowchart');
    if (!container) return;

    container.className = 'welcome-flow-timeline';

    const statusLaneMap = {
        'Vendido': 'gestor-comercial',
        'Aguardando Obra': 'gestor-comercial',
        'Aguardando Medição': 'gestor-comercial',
        'Medição Realizada': 'projetista-conferente',
        'Planta Levantada': 'projetista-conferente',
        'Conferência Enviada': 'projetista-conferente',
        'Conferência Realizada': 'consultor',
        'Aguardando Projeto Técnico': 'gestor-comercial',
        'Projeto Técnico': 'projetista',
        [ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_CONS]: 'consultor',
        [ORDER_PROJECT_STATUS_EM_REVISAO_COMERCIAL_PROJ]: 'projetista',
        [ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_COMERCIAL]: 'consultor',
        [ORDER_PROJECT_STATUS_LEGACY_EM_REVISAO_TECNICA]: 'projetista',
        [ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_REVISOR]: 'revisor',
        [ORDER_PROJECT_STATUS_EM_REVISAO_TECNICA_PROJ]: 'projetista',
        'Em Revisão': 'consultor',
        'Em revisão': 'consultor',
        'Aguardando Aprovação': 'consultor',
        'Nomear': 'consultor',
        'Aguardando PPCP': 'projetista',
        'Implantação': 'projetista-ppcp',
        'Em Produção': 'projetista-ppcp',
        'Montagem Interna': 'gestor-fabrica',
        'Expedição': 'gestor-fabrica'
    };

    let steps = WELCOME_FLOW_STEPS;

    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { data: dbStatuses } = await supabaseClient
                .from('OrderProjectStatus')
                .select('name, sortOrder')
                .order('sortOrder', { ascending: true });

            if (dbStatuses && dbStatuses.length > 0) {
                steps = dbStatuses
                    .filter(s => s.name && s.name !== 'Projeto Substituído')
                    .map(s => ({
                        status: s.name,
                        lane: statusLaneMap[s.name] || 'gestor-comercial'
                    }));
            }
        }
    } catch (err) {
        console.warn('Erro ao carregar OrderProjectStatus para o fluxograma:', err);
    }

    renderWelcomeFlowLegend(steps);
    container.innerHTML = steps
        .map((step, index) => renderWelcomeFlowStep(step, index, steps.length))
        .join('');
}

function showWelcome() {
    hideSubViews();
    document.getElementById('welcome-view')?.classList.remove('hidden');
    updateMainNavActive('home');
    updateAdminNav();
    updateWelcomeActions();
    renderWelcomeFlowchart();
    if (typeof saveAppNavState === 'function') {
        saveAppNavState({
            view: 'home',
            activeOrderId: null,
            orderDetailTab: null
        });
    }
}

function updateWelcomeActions() {
    const pendenciasBtn = document.getElementById('btn-welcome-go-pendencias');
    if (pendenciasBtn) {
        pendenciasBtn.classList.toggle('hidden', !canAccessPendencias());
    }
}

function bindWelcomeEvents() {
    document.getElementById('btn-welcome-go-orders')?.addEventListener('click', showDashboard);
    document.getElementById('btn-welcome-go-pendencias')?.addEventListener('click', async () => {
        if (typeof showPendencias === 'function') showPendencias();
    });
}
