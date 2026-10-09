const MOBILE_LAYOUT_MEDIA = window.matchMedia('(max-width: 767px)');

function isMobileViewport() {
    return MOBILE_LAYOUT_MEDIA.matches;
}

const APP_SUBNAV_COLLAPSED_KEY = 'fgp-subnav-collapsed';

function isAppSubnavCollapsed() {
    return document.body.classList.contains('app-subnav-collapsed');
}

function updateMobileMenuButtonState(open) {
    const mobile = isMobileViewport();
    document.body.classList.toggle('is-mobile-menu-open', mobile && open);

    const mobileBtn = document.getElementById('btn-mobile-menu');
    if (mobileBtn) {
        mobileBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        mobileBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    }

    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) {
        sidebar.setAttribute('aria-hidden', mobile && !open ? 'true' : 'false');
    }

    updateDesktopSidebarToggleState();
}

function updateDesktopSidebarToggleState() {
    const btn = document.getElementById('btn-desktop-sidebar-toggle');
    if (!btn) return;

    const mobile = isMobileViewport();
    if (mobile) {
        btn.hidden = true;
        return;
    }

    const subnavHidden = isAppSubnavCollapsed();
    const shown = !subnavHidden;
    btn.hidden = false;
    btn.setAttribute('aria-expanded', shown ? 'true' : 'false');
    btn.setAttribute('aria-label', shown ? 'Ocultar submenu' : 'Mostrar submenu');
    btn.classList.toggle('is-collapsed', !shown);
}

function applyAppSubnavCollapsed(collapsed) {
    if (isMobileViewport()) return;
    document.body.classList.toggle('app-subnav-collapsed', Boolean(collapsed));
    try {
        localStorage.setItem(APP_SUBNAV_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (error) {
        console.warn('applyAppSubnavCollapsed:', error);
    }
    updateDesktopSidebarToggleState();
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
    setMobileMenuBackdropVisible(false);
    updateMobileMenuButtonState(false);
}

function toggleMobileMenu() {
    if (!isMobileViewport()) return;
    const open = !document.body.classList.contains('is-mobile-menu-open');
    setMobileMenuBackdropVisible(open);
    updateMobileMenuButtonState(open);
}

function toggleDesktopSidebarSubnav() {
    if (isMobileViewport()) return;
    applyAppSubnavCollapsed(!isAppSubnavCollapsed());
}

function setAppMobileTopbarTitle(title) {
    const el = document.getElementById('app-mobile-topbar-title');
    if (!el) return;
    const next = String(title || '').trim();
    el.textContent = next || 'FGP';
}

function bindMobileNavAccordion() {
    const nav = document.getElementById('app-header-nav');
    if (!nav || nav.dataset.mobileAccordionBound === '1') return;
    nav.dataset.mobileAccordionBound = '1';

    nav.addEventListener('toggle', event => {
        const group = event.target;
        if (!isMobileViewport() || !group?.matches?.('.app-nav-group') || !group.open) return;
        nav.querySelectorAll('.app-nav-group[open]').forEach(other => {
            if (other !== group) other.open = false;
        });
    }, true);
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
    document.body.classList.toggle('app-mobile-nav-mode', mobile);

    if (mobile) {
        document.body.classList.remove('is-rail-expanded', 'app-subnav-collapsed');
    } else {
        closeMobileMenu();
        document.getElementById('dashboard-view')?.classList.remove('fm-dashboard--mobile-detail');
        try {
            if (localStorage.getItem(APP_SUBNAV_COLLAPSED_KEY) === '1') {
                document.body.classList.add('app-subnav-collapsed');
            }
        } catch (error) {
            console.warn('syncMobileLayoutState:', error);
        }
    }

    updateDesktopSidebarToggleState();
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
    syncMobileLayoutState();
    updateMobileMenuButtonState(false);

    if (typeof MOBILE_LAYOUT_MEDIA.addEventListener === 'function') {
        MOBILE_LAYOUT_MEDIA.addEventListener('change', syncMobileLayoutState);
    } else if (typeof MOBILE_LAYOUT_MEDIA.addListener === 'function') {
        MOBILE_LAYOUT_MEDIA.addListener(syncMobileLayoutState);
    }

    document.getElementById('btn-mobile-menu')?.addEventListener('click', toggleMobileMenu);
    document.getElementById('btn-desktop-sidebar-toggle')?.addEventListener('click', toggleDesktopSidebarSubnav);
    document.getElementById('app-mobile-menu-backdrop')?.addEventListener('click', closeMobileMenu);
    document.getElementById('btn-dashboard-mobile-back-list')?.addEventListener('click', showDashboardMobileOrderList);
    bindSidebarRailHover();

    document.getElementById('app-header-nav')?.addEventListener('click', event => {
        if (event.target.closest('summary')) {
            showAppSubnav();
            return;
        }
        const navButton = event.target.closest('button');
        if (!navButton || navButton.id === 'btn-logout') return;
        if (navButton.classList.contains('pendencias-section-btn')
            || navButton.classList.contains('gestao-nav-cadastros-toggle')
            || navButton.classList.contains('gestao-nav-comercial-financeiro-toggle')
            || navButton.id === 'settings-nav-cadastros-toggle') {
            return;
        }
        if (isMobileViewport()) {
            closeMobileMenu();
        }
    });

    bindMobileNavAccordion();

    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && isMobileViewport()) {
            closeMobileMenu();
        }
    });

    window.addEventListener('resize', syncMobileLayoutState, { passive: true });
}

window.setAppMobileTopbarTitle = setAppMobileTopbarTitle;

window.isMobileViewport = isMobileViewport;
window.closeMobileMenu = closeMobileMenu;
window.bindResponsiveLayout = bindResponsiveLayout;
window.syncDashboardMobileDetailState = syncDashboardMobileDetailState;
window.showDashboardMobileOrderList = showDashboardMobileOrderList;
