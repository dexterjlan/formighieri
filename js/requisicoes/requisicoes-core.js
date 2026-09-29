const REQUISICOES_SECTIONS = [
    { id: 'projects', label: 'Projetos' },
    { id: 'purchases', label: 'Compras' },
    { id: 'parts', label: 'Peça' },
    { id: 'assistance', label: 'Assistência' }
];

let requisicoesActiveSection = 'projects';
let requisicoesPurchaseDraft = null;

function canAccessRequisicoes() {
    if (typeof hasInstallerOnlyAccess === 'function' && hasInstallerOnlyAccess()) return false;
    return Boolean(currentUser?.id) && !(typeof isThirdParty === 'function' && isThirdParty());
}

function renderRequisicoesSidebar() {
    const nav = document.getElementById('requisicoes-sidebar-nav');
    if (!nav) return;

    const markSelection = !document.getElementById('requisicoes-view')?.classList.contains('hidden');
    nav.innerHTML = REQUISICOES_SECTIONS.map(section => `
        <button type="button"
            class="app-nav-item app-nav-item--nested ${markSelection && requisicoesActiveSection === section.id ? 'is-active' : ''}"
            data-requisicoes-section="${section.id}">
            ${escapeHtml(section.label)}
        </button>
    `).join('');
}

function persistRequisicoesNavState() {
    if (typeof saveAppNavState !== 'function') return;
    saveAppNavState({
        view: 'requisicoes',
        requisicoesSection: requisicoesActiveSection
    });
}

async function loadRequisicoesContent() {
    if (requisicoesActiveSection === 'projects') {
        if (typeof loadRequisicoesProjects === 'function') await loadRequisicoesProjects();
        return;
    }
    if (requisicoesActiveSection === 'purchases') {
        if (typeof loadRequisicoesPurchases === 'function') await loadRequisicoesPurchases();
        return;
    }
    if (typeof renderRequisicoesConstruction === 'function') {
        renderRequisicoesConstruction(requisicoesActiveSection);
    }
}

function ensureRequisicoesViewVisible() {
    const view = document.getElementById('requisicoes-view');
    if (!view?.classList.contains('hidden')) return;
    if (typeof hideSubViews === 'function') hideSubViews();
    view.classList.remove('hidden');
    if (typeof updateMainNavActive === 'function') updateMainNavActive('requisicoes');
}

function selectRequisicoesSection(sectionId) {
    if (!REQUISICOES_SECTIONS.some(section => section.id === sectionId)) return;
    ensureRequisicoesViewVisible();
    requisicoesActiveSection = sectionId;
    renderRequisicoesSidebar();
    loadRequisicoesContent();
    persistRequisicoesNavState();
}

function showRequisicoes(sectionId = requisicoesActiveSection) {
    if (!canAccessRequisicoes()) {
        alertAppDialog('Você não tem acesso às requisições.');
        return;
    }
    if (!REQUISICOES_SECTIONS.some(section => section.id === sectionId)) {
        sectionId = 'projects';
    }
    hideSubViews();
    document.getElementById('requisicoes-view')?.classList.remove('hidden');
    updateMainNavActive('requisicoes');
    updateAdminNav();
    requisicoesActiveSection = sectionId;
    renderRequisicoesSidebar();
    loadRequisicoesContent();
    persistRequisicoesNavState();
}

async function restoreRequisicoesView(state = {}) {
    if (!canAccessRequisicoes()) {
        if (typeof showWelcome === 'function') showWelcome();
        return;
    }
    const savedSection = state.requisicoesSection || 'projects';
    showRequisicoes(REQUISICOES_SECTIONS.some(section => section.id === savedSection) ? savedSection : 'projects');
}

function updateRequisicoesNav() {
    const btn = document.getElementById('btn-requisicoes');
    if (!btn) return;
    btn.classList.toggle('hidden', !canAccessRequisicoes());
    if (canAccessRequisicoes()) renderRequisicoesSidebar();
}

function openRequisicoesPurchaseFromImplementation(draft) {
    requisicoesPurchaseDraft = {
        origin: 'implementation',
        implementationId: draft?.implementationId || null,
        orderId: draft?.orderId || null,
        orderProjectId: draft?.orderProjectId || null,
        purchaseItems: draft?.purchaseItems || [],
        allPurchaseItems: draft?.allPurchaseItems || [],
        formValues: draft?.formValues || null
    };
    showRequisicoes('purchases');
}

function takeRequisicoesPurchaseDraft() {
    return requisicoesPurchaseDraft;
}

function clearRequisicoesPurchaseDraft() {
    requisicoesPurchaseDraft = null;
}

function bindRequisicoesEvents() {
    document.getElementById('btn-requisicoes')?.addEventListener('click', event => {
        const details = event.currentTarget;
        if (event.target.closest('#requisicoes-sidebar-nav')) return;
        if (!event.target.closest('summary')) return;
        event.preventDefault();
        if (details.open) {
            details.open = false;
            return;
        }
        details.open = true;
        showRequisicoes('projects');
    });

    document.getElementById('requisicoes-sidebar-nav')?.addEventListener('click', event => {
        const button = event.target.closest('[data-requisicoes-section]');
        if (!button) return;
        if (button.dataset.requisicoesSection === 'purchases') clearRequisicoesPurchaseDraft();
        selectRequisicoesSection(button.dataset.requisicoesSection);
    });
}

window.showRequisicoes = showRequisicoes;
window.restoreRequisicoesView = restoreRequisicoesView;
window.updateRequisicoesNav = updateRequisicoesNav;
window.openRequisicoesPurchaseFromImplementation = openRequisicoesPurchaseFromImplementation;
window.bindRequisicoesEvents = bindRequisicoesEvents;
