const WELCOME_FLOW_LANE_META = {
    'gestor-comercial': { label: 'Gestor Comercial', legendClass: 'welcome-legend--gestor-comercial' },
    'projetista-conferente': { label: 'Projetista (Conferente)', legendClass: 'welcome-legend--projetista-conferente' },
    consultor: { label: 'Consultor', legendClass: 'welcome-legend--consultor' },
    projetista: { label: 'Projetista', legendClass: 'welcome-legend--projetista' },
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
    { status: 'Aguardando Aprovação', lane: 'projetista' },
    { status: 'Em Revisão', lane: 'consultor' },
    { status: 'Nomear', lane: 'consultor' },
    { status: 'Aguardando PPCP', lane: 'projetista' },
    { status: 'Implantação', lane: 'projetista-ppcp' },
    { status: 'Em Produção', lane: 'projetista-ppcp' },
    { status: 'Montagem Interna', lane: 'gestor-fabrica' },
    { status: 'Expedição', lane: 'gestor-fabrica' }
];

function renderWelcomeFlowLegend() {
    const legend = document.getElementById('welcome-flow-legend');
    if (!legend) return;

    const seen = new Set();
    const items = [];

    WELCOME_FLOW_STEPS.forEach(step => {
        if (seen.has(step.lane)) return;
        seen.add(step.lane);
        const meta = WELCOME_FLOW_LANE_META[step.lane];
        items.push(`<span class="welcome-legend ${meta.legendClass}">${escapeHtml(meta.label)}</span>`);
    });

    legend.innerHTML = items.join('');
}

function renderWelcomeFlowStep(step, index) {
    const meta = WELCOME_FLOW_LANE_META[step.lane];
    const connector = index < WELCOME_FLOW_STEPS.length - 1
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

function renderWelcomeFlowchart() {
    const container = document.getElementById('welcome-flowchart');
    if (!container) return;

    container.className = 'welcome-flow-timeline';
    container.innerHTML = WELCOME_FLOW_STEPS
        .map((step, index) => renderWelcomeFlowStep(step, index))
        .join('');
}

function showWelcome() {
    hideSubViews();
    document.getElementById('welcome-view')?.classList.remove('hidden');
    updateMainNavActive('home');
    updateAdminNav();
    updateWelcomeActions();
    renderWelcomeFlowLegend();
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
