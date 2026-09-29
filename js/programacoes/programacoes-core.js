const PROGRAMACOES_SECTIONS = [
    { id: 'projects', label: 'Projetos' },
    { id: 'deliveries', label: 'Entregas' }
];

let programacoesActiveSection = 'projects';
let programacoesFullscreen = false;
let programacoesLinkedNav = null;

const PROGRAMACOES_FULLSCREEN_BUTTON_HTML = `
    <button type="button" id="btn-programacoes-fullscreen"
        class="order-tab-action-btn text-xs bg-white border border-indigo-200 text-indigo-800 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-50"
        aria-pressed="false">
        <svg class="order-tab-action-btn__icon" data-fullscreen-icon="enter" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0V2A1.5 1.5 0 0 1 1.5.5h4a.5.5 0 0 1 0 1H1.5zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0V1.5a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1H1.5A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"/></svg>
        <svg class="order-tab-action-btn__icon hidden" data-fullscreen-icon="exit" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.5 0a.5.5 0 0 0 0 1h4A1.5 1.5 0 0 1 11 2.5v4a.5.5 0 0 0 1 0v-4A2.5 2.5 0 0 0 9.5 0h-4zM1 5.5a.5.5 0 0 0-1 0v4A2.5 2.5 0 0 0 2.5 12h4a.5.5 0 0 0 0-1h-4A1.5 1.5 0 0 1 1 9.5v-4zM14.5 11a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 1 0v-4a1.5 1.5 0 0 0-1.5-1.5h-4a.5.5 0 0 0 0 1h4a.5.5 0 0 0 .5-.5zM10 1.5a.5.5 0 0 0-1 0v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 0 0 1h4A2.5 2.5 0 0 0 10 6.5v-4z"/></svg>
        <span data-programacoes-fullscreen-label>Tela cheia</span>
    </button>
`;

function syncProgramacoesFullscreenButton() {
    const button = document.getElementById('btn-programacoes-fullscreen');
    if (!button) return;
    const label = button.querySelector('[data-programacoes-fullscreen-label]');
    if (label) label.textContent = programacoesFullscreen ? 'Sair da tela cheia' : 'Tela cheia';
    button.querySelector('[data-fullscreen-icon="enter"]')?.classList.toggle('hidden', programacoesFullscreen);
    button.querySelector('[data-fullscreen-icon="exit"]')?.classList.toggle('hidden', !programacoesFullscreen);
    button.setAttribute('aria-pressed', programacoesFullscreen ? 'true' : 'false');
}

function setProgramacoesFullscreen(enabled) {
    programacoesFullscreen = Boolean(enabled);
    document.getElementById('programacoes-view')?.classList.toggle('programacoes-view--fullscreen', programacoesFullscreen);
    document.body.classList.toggle('programacoes-fullscreen-active', programacoesFullscreen);
    syncProgramacoesFullscreenButton();
}

function toggleProgramacoesFullscreen() {
    setProgramacoesFullscreen(!programacoesFullscreen);
}

function setProgramacoesLinkedNav(key) {
    programacoesLinkedNav = key || null;
}

function renderProgramacoesSidebar() {
    const nav = document.getElementById('programacoes-sidebar-nav');
    if (!nav) return;

    const markSelection = !document.getElementById('programacoes-view')?.classList.contains('hidden');
    const gestaoView = document.getElementById('gestao-view');
    const linkedActive = !markSelection
        && document.querySelector('#btn-programacoes > summary')?.classList.contains('is-active')
        && gestaoView
        && !gestaoView.classList.contains('hidden');
    const montagemActive = linkedActive && programacoesLinkedNav === 'montagem';
    const producaoActive = linkedActive && programacoesLinkedNav === 'producao';
    const showMontagem = typeof canViewProgramacaoMontagem !== 'function' || canViewProgramacaoMontagem();
    const showProducao = typeof canViewProgramacaoProducao === 'function' && canViewProgramacaoProducao();
    const montagemButton = showMontagem
        ? `<button type="button" id="btn-programacao-montagem" class="app-nav-item app-nav-item--nested${montagemActive ? ' is-active' : ''}">Montagem</button>`
        : '';
    const producaoButton = showProducao
        ? `<button type="button" id="btn-programacao-producao" class="app-nav-item app-nav-item--nested${producaoActive ? ' is-active' : ''}">Produção</button>`
        : '';
    nav.innerHTML = montagemButton + producaoButton + PROGRAMACOES_SECTIONS.map(section => `
        <button type="button"
            class="app-nav-item app-nav-item--nested programacoes-nav-btn ${
                markSelection && programacoesActiveSection === section.id ? 'is-active' : ''
            }"
            data-programacoes-section="${section.id}">
            ${escapeHtml(section.label)}
        </button>
    `).join('');
}

function persistProgramacoesNavState() {
    if (typeof saveAppNavState !== 'function') return;
    saveAppNavState({
        view: 'programacoes',
        programacoesSection: programacoesActiveSection
    });
}

async function loadProgramacoesContent() {
    if (programacoesActiveSection === 'projects') {
        if (typeof loadProgramacoesProjects === 'function') {
            await loadProgramacoesProjects();
        }
        return;
    }

    if (programacoesActiveSection === 'deliveries') {
        if (typeof loadProgramacoesDeliveries === 'function') {
            await loadProgramacoesDeliveries();
        }
        return;
    }

    const content = document.getElementById('programacoes-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Selecione um item no menu.</p>';
    }
}

function ensureProgramacoesViewVisible() {
    const view = document.getElementById('programacoes-view');
    if (!view?.classList.contains('hidden')) return;
    if (typeof hideSubViews === 'function') hideSubViews();
    view.classList.remove('hidden');
    if (typeof updateMainNavActive === 'function') updateMainNavActive('programacoes');
}

function selectProgramacoesSection(sectionId) {
    if (!PROGRAMACOES_SECTIONS.some(section => section.id === sectionId)) return;
    programacoesLinkedNav = null;
    ensureProgramacoesViewVisible();
    programacoesActiveSection = sectionId;
    renderProgramacoesSidebar();
    loadProgramacoesContent();
    persistProgramacoesNavState();
}

function showProgramacoes() {
    if (!canAccessProgramacoes()) {
        alertAppDialog('Você não tem acesso à tela de programações.');
        return;
    }

    if (!PROGRAMACOES_SECTIONS.some(section => section.id === programacoesActiveSection)) {
        programacoesActiveSection = 'projects';
    }

    programacoesLinkedNav = null;
    hideSubViews();
    document.getElementById('programacoes-view')?.classList.remove('hidden');
    updateMainNavActive('programacoes');
    updateAdminNav();
    updateProgramacoesNav();
    renderProgramacoesSidebar();
    loadProgramacoesContent();
    persistProgramacoesNavState();
}

async function restoreProgramacoesView(state = {}) {
    if (!canAccessProgramacoes()) {
        if (typeof showWelcome === 'function') showWelcome();
        return;
    }

    programacoesLinkedNav = null;
    const savedSection = state.programacoesSection || 'projects';
    programacoesActiveSection = PROGRAMACOES_SECTIONS.some(section => section.id === savedSection)
        ? savedSection
        : 'projects';

    hideSubViews();
    document.getElementById('programacoes-view')?.classList.remove('hidden');
    updateMainNavActive('programacoes');
    updateAdminNav();
    updateProgramacoesNav();
    renderProgramacoesSidebar();
    await loadProgramacoesContent();
    persistProgramacoesNavState();
}

function updateProgramacoesNav() {
    const btn = document.getElementById('btn-programacoes');
    if (!btn) return;
    if (typeof hasInstallerOnlyAccess === 'function' && hasInstallerOnlyAccess()) {
        btn.classList.add('hidden');
        return;
    }
    const canAccess = canAccessProgramacoes();
    const canMontagem = typeof canViewProgramacaoMontagem === 'function' && canViewProgramacaoMontagem();
    btn.classList.toggle('hidden', !canAccess && !canMontagem);
    if (canAccess) renderProgramacoesSidebar();
}

const PROGRAMACOES_ACTION_OVERLAY = typeof createModalOverlayConfig === 'function'
    ? createModalOverlayConfig('programacoes-action')
    : null;

function setProgramacoesActionLoading(active, message = 'Processando...', status = 'loading') {
    if (!PROGRAMACOES_ACTION_OVERLAY || typeof setModalOverlayLoading !== 'function') return;
    setModalOverlayLoading(PROGRAMACOES_ACTION_OVERLAY, active, message, status);
}

function bindProgramacoesEvents() {
    document.getElementById('btn-programacoes')?.addEventListener('click', event => {
        const details = event.currentTarget;
        if (event.target.closest('#programacoes-sidebar-nav, #btn-programacao-montagem, #btn-programacao-producao')) return;
        if (!event.target.closest('summary')) return;
        event.preventDefault();
        if (details.open) {
            details.open = false;
            return;
        }
        details.open = true;
        showProgramacoes();
    });
    document.getElementById('programacoes-sidebar-nav')?.addEventListener('click', event => {
        if (event.target.closest('#btn-programacao-montagem')) {
            if (typeof showProgramacaoMontagemView === 'function') showProgramacaoMontagemView();
            return;
        }
        if (event.target.closest('#btn-programacao-producao')) {
            if (typeof showProgramacaoProducaoView === 'function') showProgramacaoProducaoView();
            return;
        }
        const btn = event.target.closest('[data-programacoes-section]');
        if (!btn) return;
        selectProgramacoesSection(btn.dataset.programacoesSection);
    });
    document.getElementById('programacoes-content')?.addEventListener('click', event => {
        const button = event.target.closest('#btn-programacoes-fullscreen');
        if (!button) return;
        toggleProgramacoesFullscreen();
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !programacoesFullscreen) return;
        if (event.target.closest('.programacoes-seq-input')) return;
        setProgramacoesFullscreen(false);
    });
}

window.setProgramacoesLinkedNav = setProgramacoesLinkedNav;
window.showProgramacoes = showProgramacoes;
window.restoreProgramacoesView = restoreProgramacoesView;
window.updateProgramacoesNav = updateProgramacoesNav;
window.selectProgramacoesSection = selectProgramacoesSection;
window.setProgramacoesFullscreen = setProgramacoesFullscreen;
