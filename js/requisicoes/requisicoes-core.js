const REQUISICOES_SECTIONS = [
    { id: 'projects', label: 'Projetos' },
    { id: 'purchases', label: 'Compras' },
    { id: 'wps-item', label: 'Cadastro Item WPS' },
    { id: 'parts', label: 'Peça' },
    { id: 'assistance', label: 'Assistência' }
];

let requisicoesActiveSection = 'projects';
let requisicoesPurchaseDraft = null;

function canAccessRequisicoes() {
    if (typeof hasInstallerOnlyAccess === 'function' && hasInstallerOnlyAccess()) return false;
    return Boolean(currentUser?.id) && !(typeof isThirdParty === 'function' && isThirdParty());
}

function canSeeRequisicoesPartRequestSection() {
    return typeof canAccessRequisicoesPartRequest === 'function' && canAccessRequisicoesPartRequest();
}

function getVisibleRequisicoesSections() {
    return REQUISICOES_SECTIONS.filter(section => {
        if (section.id === 'parts') return canSeeRequisicoesPartRequestSection();
        return true;
    });
}

function normalizeRequisicoesSectionId(sectionId) {
    const visible = getVisibleRequisicoesSections();
    if (visible.some(section => section.id === sectionId)) return sectionId;
    return visible[0]?.id || 'projects';
}

function renderRequisicoesSidebar() {
    const nav = document.getElementById('requisicoes-sidebar-nav');
    if (!nav) return;

    const markSelection = !document.getElementById('requisicoes-view')?.classList.contains('hidden');
    nav.innerHTML = getVisibleRequisicoesSections().map(section => `
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
    if (requisicoesActiveSection === 'wps-item') {
        if (typeof loadWpsItemRegistrationRequisicoes === 'function') await loadWpsItemRegistrationRequisicoes();
        return;
    }
    if (requisicoesActiveSection === 'assistance') {
        if (typeof loadAssistanceRequests === 'function') await loadAssistanceRequests();
        return;
    }
    if (requisicoesActiveSection === 'parts') {
        if (!canSeeRequisicoesPartRequestSection()) {
            alertAppDialog('Você não tem acesso à solicitação de peça.');
            selectRequisicoesSection('projects');
            return;
        }
        if (typeof loadPartRequests === 'function') await loadPartRequests();
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
    sectionId = normalizeRequisicoesSectionId(sectionId);
    if (!getVisibleRequisicoesSections().some(section => section.id === sectionId)) return;
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
    sectionId = normalizeRequisicoesSectionId(sectionId);
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
    showRequisicoes(normalizeRequisicoesSectionId(savedSection));
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

    if (typeof bindAssistanceEvents === 'function') bindAssistanceEvents();
    if (typeof bindWpsItemRegistrationEvents === 'function') bindWpsItemRegistrationEvents();
    if (typeof bindPartRequestEvents === 'function') bindPartRequestEvents();
}

window.showRequisicoes = showRequisicoes;
window.restoreRequisicoesView = restoreRequisicoesView;
window.updateRequisicoesNav = updateRequisicoesNav;
window.openRequisicoesPurchaseFromImplementation = openRequisicoesPurchaseFromImplementation;
window.bindRequisicoesEvents = bindRequisicoesEvents;
