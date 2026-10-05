function canAccessPerformance() {
    if (typeof isThirdParty === 'function' && isThirdParty()) return false;
    return typeof isAdmin === 'function' && isAdmin();
}

function showPerformanceProjeto() {
    if (!canAccessPerformance()) {
        alertAppDialog('Você não tem acesso à tela de performance.');
        return;
    }

    hideSubViews();
    document.getElementById('performance-view')?.classList.remove('hidden');
    updateMainNavActive('performance');
    updateAdminNav();

    document.getElementById('performance-nav-projeto')?.classList.add('is-active');

    saveAppNavState({
        view: 'performance',
        performanceSection: 'projeto'
    });

    if (typeof loadPerformanceProjeto === 'function') {
        void loadPerformanceProjeto();
    }
}

function bindPerformanceNavEvents() {
    document.getElementById('performance-nav-projeto')?.addEventListener('click', () => {
        showPerformanceProjeto();
    });
}

bindPerformanceNavEvents();

window.showPerformanceProjeto = showPerformanceProjeto;
window.canAccessPerformance = canAccessPerformance;
