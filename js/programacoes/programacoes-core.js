const PROGRAMACOES_SECTIONS = [
    { id: 'projects', label: 'Projetos' }
];

let programacoesActiveSection = 'projects';
let programacoesFullscreen = false;

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

function renderProgramacoesSidebar() {
    const nav = document.getElementById('programacoes-sidebar-nav');
    if (!nav) return;

    nav.innerHTML = PROGRAMACOES_SECTIONS.map(section => `
        <button type="button"
            class="programacoes-nav-btn w-full text-left text-xs px-3 py-2 rounded-lg font-medium mb-1 ${
                programacoesActiveSection === section.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
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

    const content = document.getElementById('programacoes-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Selecione um item no menu.</p>';
    }
}

function selectProgramacoesSection(sectionId) {
    if (!PROGRAMACOES_SECTIONS.some(section => section.id === sectionId)) return;
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
    if (btn) {
        btn.classList.toggle('hidden', !canAccessProgramacoes());
    }
}

const PROGRAMACOES_ACTION_OVERLAY = typeof createModalOverlayConfig === 'function'
    ? createModalOverlayConfig('programacoes-action')
    : null;

function setProgramacoesActionLoading(active, message = 'Processando...', status = 'loading') {
    if (!PROGRAMACOES_ACTION_OVERLAY || typeof setModalOverlayLoading !== 'function') return;
    setModalOverlayLoading(PROGRAMACOES_ACTION_OVERLAY, active, message, status);
}

function bindProgramacoesEvents() {
    document.getElementById('btn-programacoes')?.addEventListener('click', showProgramacoes);
    document.getElementById('programacoes-sidebar-nav')?.addEventListener('click', event => {
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

window.showProgramacoes = showProgramacoes;
window.restoreProgramacoesView = restoreProgramacoesView;
window.updateProgramacoesNav = updateProgramacoesNav;
window.selectProgramacoesSection = selectProgramacoesSection;
window.setProgramacoesFullscreen = setProgramacoesFullscreen;
