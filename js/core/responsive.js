const MOBILE_LAYOUT_MEDIA = window.matchMedia('(max-width: 767px)');

function isMobileViewport() {
    return MOBILE_LAYOUT_MEDIA.matches;
}

function updateMobileMenuButtonState(open) {
    const btn = document.getElementById('btn-mobile-menu');
    if (!btn) return;

    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
    btn.textContent = open ? 'Fechar' : 'Menu';
}

function closeMobileMenu() {
    document.body.classList.remove('is-mobile-menu-open');
    updateMobileMenuButtonState(false);
}

function toggleMobileMenu() {
    if (!isMobileViewport()) return;

    const open = !document.body.classList.contains('is-mobile-menu-open');
    document.body.classList.toggle('is-mobile-menu-open', open);
    updateMobileMenuButtonState(open);
}

function syncMobileLayoutState() {
    const mobile = isMobileViewport();
    document.body.classList.toggle('is-mobile', mobile);

    if (!mobile) {
        closeMobileMenu();
    }
}

function bindResponsiveLayout() {
    syncMobileLayoutState();

    if (typeof MOBILE_LAYOUT_MEDIA.addEventListener === 'function') {
        MOBILE_LAYOUT_MEDIA.addEventListener('change', syncMobileLayoutState);
    } else if (typeof MOBILE_LAYOUT_MEDIA.addListener === 'function') {
        MOBILE_LAYOUT_MEDIA.addListener(syncMobileLayoutState);
    }

    document.getElementById('btn-mobile-menu')?.addEventListener('click', toggleMobileMenu);

    document.getElementById('app-header-nav')?.addEventListener('click', event => {
        if (event.target.closest('button')) {
            closeMobileMenu();
        }
    });

    window.addEventListener('resize', syncMobileLayoutState, { passive: true });
}

window.isMobileViewport = isMobileViewport;
window.closeMobileMenu = closeMobileMenu;
window.bindResponsiveLayout = bindResponsiveLayout;
