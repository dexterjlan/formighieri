const PROGRAMACOES_SECTIONS = [
    { id: 'projects', label: 'Projetos' }
];

let programacoesActiveSection = 'projects';

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
}

window.showProgramacoes = showProgramacoes;
window.restoreProgramacoesView = restoreProgramacoesView;
window.updateProgramacoesNav = updateProgramacoesNav;
window.selectProgramacoesSection = selectProgramacoesSection;
