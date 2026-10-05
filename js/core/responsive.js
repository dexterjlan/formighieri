const MOBILE_LAYOUT_MEDIA = window.matchMedia('(max-width: 767px)');

function isMobileViewport() {
    return MOBILE_LAYOUT_MEDIA.matches;
}

const APP_SUBNAV_COLLAPSED_KEY = 'fgp-subnav-collapsed';

function isAppSubnavCollapsed() {
    return document.body.classList.contains('app-subnav-collapsed');
}

function updateMobileMenuButtonState(open) {
    const btn = document.getElementById('btn-mobile-menu');
    if (!btn) return;

    const subnavHidden = !isMobileViewport() && isAppSubnavCollapsed();
    const shown = isMobileViewport() ? open : !subnavHidden;
    btn.setAttribute('aria-expanded', shown ? 'true' : 'false');
    btn.setAttribute('aria-label', isMobileViewport()
        ? (shown ? 'Ocultar menu' : 'Abrir menu')
        : (shown ? 'Ocultar submenu' : 'Mostrar submenu'));
    btn.classList.toggle('is-collapsed', !shown);
}

function applyAppSubnavCollapsed(collapsed) {
    document.body.classList.toggle('app-subnav-collapsed', Boolean(collapsed));
    try {
        localStorage.setItem(APP_SUBNAV_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (error) {
        console.warn('applyAppSubnavCollapsed:', error);
    }
    updateMobileMenuButtonState(document.body.classList.contains('is-mobile-menu-open'));
}

function showAppSubnav() {
    if (!isAppSubnavCollapsed()) return;
    applyAppSubnavCollapsed(false);
}

function setMobileMenuBackdropVisible(visible) {
    const backdrop = document.getElementById('app-mobile-menu-backdrop');
    if (!backdrop) return;
    backdrop.hidden = !visible;
    backdrop.classList.toggle('hidden', !visible);
    backdrop.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function closeMobileMenu() {
    document.body.classList.remove('is-mobile-menu-open');
    setMobileMenuBackdropVisible(false);
    updateMobileMenuButtonState(false);
}

function toggleMobileMenu() {
    if (isMobileViewport()) {
        const open = !document.body.classList.contains('is-mobile-menu-open');
        document.body.classList.toggle('is-mobile-menu-open', open);
        setMobileMenuBackdropVisible(open);
        updateMobileMenuButtonState(open);
        return;
    }
    applyAppSubnavCollapsed(!isAppSubnavCollapsed());
}

function syncDashboardMobileDetailState(showDetail) {
    const dashboard = document.getElementById('dashboard-view');
    if (!dashboard) return;
    if (!isMobileViewport()) {
        dashboard.classList.remove('fm-dashboard--mobile-detail');
        return;
    }
    dashboard.classList.toggle('fm-dashboard--mobile-detail', Boolean(showDetail));
}

function showDashboardMobileOrderList() {
    syncDashboardMobileDetailState(false);
}

function syncMobileLayoutState() {
    const mobile = isMobileViewport();
    document.body.classList.toggle('is-mobile', mobile);

    if (!mobile) {
        closeMobileMenu();
        document.getElementById('dashboard-view')?.classList.remove('fm-dashboard--mobile-detail');
    }
}

function bindSidebarRailHover() {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar || sidebar.dataset.railBound === '1') return;
    sidebar.dataset.railBound = '1';

    let collapseTimer = 0;

    const canExpand = () => !isMobileViewport();

    const expandRail = () => {
        if (!canExpand()) return;
        window.clearTimeout(collapseTimer);
        document.body.classList.add('is-rail-expanded');
    };

    const collapseRail = () => {
        window.clearTimeout(collapseTimer);
        collapseTimer = window.setTimeout(() => {
            document.body.classList.remove('is-rail-expanded');
        }, 90);
    };

    sidebar.addEventListener('mouseover', event => {
        if (event.target.closest('.app-subnav')) {
            collapseRail();
            return;
        }
        expandRail();
    });

    sidebar.addEventListener('mouseleave', collapseRail);

    sidebar.addEventListener('focusin', event => {
        if (event.target.closest('.app-subnav')) {
            collapseRail();
            return;
        }
        expandRail();
    });

    sidebar.addEventListener('focusout', event => {
        if (sidebar.contains(event.relatedTarget)) return;
        collapseRail();
    });
}

function bindResponsiveLayout() {
    try {
        if (localStorage.getItem(APP_SUBNAV_COLLAPSED_KEY) === '1') {
            document.body.classList.add('app-subnav-collapsed');
        }
    } catch (error) {
        console.warn('bindResponsiveLayout sidebar:', error);
    }
    syncMobileLayoutState();
    updateMobileMenuButtonState(false);

    if (typeof MOBILE_LAYOUT_MEDIA.addEventListener === 'function') {
        MOBILE_LAYOUT_MEDIA.addEventListener('change', syncMobileLayoutState);
    } else if (typeof MOBILE_LAYOUT_MEDIA.addListener === 'function') {
        MOBILE_LAYOUT_MEDIA.addListener(syncMobileLayoutState);
    }

    document.getElementById('btn-mobile-menu')?.addEventListener('click', toggleMobileMenu);
    document.getElementById('app-mobile-menu-backdrop')?.addEventListener('click', closeMobileMenu);
    document.getElementById('btn-dashboard-mobile-back-list')?.addEventListener('click', showDashboardMobileOrderList);
    bindSidebarRailHover();

    document.getElementById('app-header-nav')?.addEventListener('click', event => {
        if (event.target.closest('summary')) {
            showAppSubnav();
        }
        if (event.target.closest('button')) {
            closeMobileMenu();
        }
    });

    window.addEventListener('resize', syncMobileLayoutState, { passive: true });
}

window.isMobileViewport = isMobileViewport;
window.closeMobileMenu = closeMobileMenu;
window.bindResponsiveLayout = bindResponsiveLayout;
window.syncDashboardMobileDetailState = syncDashboardMobileDetailState;
window.showDashboardMobileOrderList = showDashboardMobileOrderList;
