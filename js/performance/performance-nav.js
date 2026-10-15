function canAccessPerformance() {
    if (typeof isThirdParty === 'function' && isThirdParty()) return false;
    return typeof isAdmin === 'function' && isAdmin();
}

function setPerformanceActiveSection(section) {
    const isProjeto = section === 'projeto';
    const isMontagem = section === 'montagem-externa';

    document.getElementById('performance-projeto-panel')?.classList.toggle('hidden', !isProjeto);
    document.getElementById('performance-montagem-externa-panel')?.classList.toggle('hidden', !isMontagem);

    document.getElementById('performance-nav-projeto')?.classList.toggle('is-active', isProjeto);
    document.getElementById('performance-nav-montagem-externa')?.classList.toggle('is-active', isMontagem);
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
    setPerformanceActiveSection('projeto');

    saveAppNavState({
        view: 'performance',
        performanceSection: 'projeto'
    });

    if (typeof loadPerformanceProjeto === 'function') {
        void loadPerformanceProjeto();
    }
}

function showPerformanceMontagemExterna() {
    if (!canAccessPerformance()) {
        alertAppDialog('Você não tem acesso à tela de performance.');
        return;
    }

    hideSubViews();
    document.getElementById('performance-view')?.classList.remove('hidden');
    updateMainNavActive('performance');
    updateAdminNav();
    setPerformanceActiveSection('montagem-externa');

    saveAppNavState({
        view: 'performance',
        performanceSection: 'montagem-externa'
    });

    if (typeof loadPerformanceMontagemExterna === 'function') {
        void loadPerformanceMontagemExterna();
    }
}

function bindPerformanceNavEvents() {
    document.getElementById('performance-nav-projeto')?.addEventListener('click', () => {
        showPerformanceProjeto();
    });
    document.getElementById('performance-nav-montagem-externa')?.addEventListener('click', () => {
        showPerformanceMontagemExterna();
    });
}

bindPerformanceNavEvents();

window.showPerformanceProjeto = showPerformanceProjeto;
window.showPerformanceMontagemExterna = showPerformanceMontagemExterna;
window.canAccessPerformance = canAccessPerformance;
