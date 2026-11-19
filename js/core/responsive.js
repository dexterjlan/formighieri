/** Portrait (≤767px) ou celular deitado (altura baixa + touch). Manter alinhado ao CSS mobile. */
const FM_MOBILE_LAYOUT_MEDIA_QUERY = '(max-width: 767px), (max-height: 520px) and (max-width: 1024px) and ((hover: none) or (pointer: coarse))';
const MOBILE_LAYOUT_MEDIA = window.matchMedia(FM_MOBILE_LAYOUT_MEDIA_QUERY);
/** iPad / tablet touch — alinhar ao CSS de `.part-request-modal` em fm-components.css */
const FM_TABLET_TOUCH_MEDIA_QUERY = '(min-width: 768px) and (max-width: 1366px) and ((hover: none) or (pointer: coarse))';
const TABLET_TOUCH_LAYOUT_MEDIA = window.matchMedia(FM_TABLET_TOUCH_MEDIA_QUERY);

function isMobileViewport() {
    return MOBILE_LAYOUT_MEDIA.matches;
}

function isTabletTouchViewport() {
    return TABLET_TOUCH_LAYOUT_MEDIA.matches && !isMobileViewport();
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

    if (mobile && open && typeof openMobileMenuGrid === 'function') {
        openMobileMenuGrid();
    }

    if (typeof syncMobileTopbarContentActions === 'function') {
        syncMobileTopbarContentActions();
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
    if (typeof resetMobileMenuStack === 'function') resetMobileMenuStack();
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
    if (typeof syncMobileTopbarContentActions === 'function') {
        syncMobileTopbarContentActions();
    }
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
        document.querySelectorAll('details.app-nav-group[open]').forEach(details => {
            details.open = false;
        });
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

    if (typeof syncMobileMenuVisibility === 'function') {
        syncMobileMenuVisibility();
    }
    if (typeof syncMobileTopbarContentActions === 'function') {
        syncMobileTopbarContentActions();
    }
    if (typeof renderExpedicaoMobileSectionBar === 'function') {
        renderExpedicaoMobileSectionBar();
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
    if (typeof syncMobileMenuVisibility === 'function') syncMobileMenuVisibility();
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
    if (typeof bindMobileMenu === 'function') bindMobileMenu();

    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && isMobileViewport()) {
            closeMobileMenu();
        }
    });

    window.addEventListener('resize', syncMobileLayoutState, { passive: true });
    window.addEventListener('orientationchange', () => {
        window.setTimeout(syncMobileLayoutState, 100);
    });

    bindEaiModalMobileKeyboardLayout();
}

function isEaiModalTextEntryField(element) {
    if (!element || !(element instanceof HTMLElement)) return false;
    const tag = element.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'SELECT') return true;
    if (tag === 'INPUT') {
        const type = String(element.type || 'text').toLowerCase();
        return !['checkbox', 'radio', 'file', 'hidden', 'button', 'submit', 'reset'].includes(type);
    }
    return false;
}

function getOpenFmModalWithKeyboard() {
    return document.querySelector('.eai-modal.eai-modal--keyboard-open:not(.hidden)')
        || document.querySelector('.montagem-prog-modal.montagem-prog-modal--keyboard-open:not(.hidden)');
}

function getFmModalForTextField(field) {
    if (!field || !(field instanceof HTMLElement)) return null;
    return field.closest('.eai-modal:not(.hidden)') || field.closest('.montagem-prog-modal:not(.hidden)');
}

function setFmModalKeyboardOpenClass(modal, open) {
    if (!modal) return;
    if (modal.classList.contains('eai-modal')) {
        modal.classList.toggle('eai-modal--keyboard-open', open);
    }
    if (modal.classList.contains('montagem-prog-modal')) {
        modal.classList.toggle('montagem-prog-modal--keyboard-open', open);
    }
}

function isFmVisualViewportKeyboardLikelyOpen() {
    if (!window.visualViewport) return false;
    const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!layoutHeight) return false;
    return layoutHeight - window.visualViewport.height > 80;
}

function syncFmModalVisualViewport() {
    const openModal = getOpenFmModalWithKeyboard();
    if (!openModal || !window.visualViewport) {
        document.documentElement.style.removeProperty('--eai-visual-vh');
        document.documentElement.style.removeProperty('--eai-visual-offset-top');
        return;
    }

    const viewport = window.visualViewport;
    document.documentElement.style.setProperty('--eai-visual-vh', `${Math.round(viewport.height)}px`);
    document.documentElement.style.setProperty('--eai-visual-offset-top', `${Math.round(viewport.offsetTop)}px`);
}

function reconcileFmModalKeyboardLayoutFromViewport() {
    if (!isMobileViewport() && !isTabletTouchViewport()) return;

    const bodyKb = document.body.classList.contains('eai-modal-keyboard-open');
    const keyboardLikelyOpen = isFmVisualViewportKeyboardLikelyOpen();
    const active = document.activeElement;
    const modalFromFocus = active && isEaiModalTextEntryField(active)
        ? getFmModalForTextField(active)
        : null;

    if (bodyKb && !keyboardLikelyOpen) {
        clearEaiModalKeyboardLayout();
        return;
    }

    if (keyboardLikelyOpen && modalFromFocus) {
        if (!bodyKb) {
            document.body.classList.add('eai-modal-keyboard-open');
            document.querySelectorAll('.eai-modal--keyboard-open, .montagem-prog-modal--keyboard-open').forEach(node => {
                if (node !== modalFromFocus) setFmModalKeyboardOpenClass(node, false);
            });
            setFmModalKeyboardOpenClass(modalFromFocus, true);
        }
        syncFmModalVisualViewport();
    }
}

function clearEaiModalKeyboardLayout() {
    document.body.classList.remove('eai-modal-keyboard-open');
    document.querySelectorAll('.eai-modal--keyboard-open').forEach(modal => {
        modal.classList.remove('eai-modal--keyboard-open');
    });
    document.querySelectorAll('.montagem-prog-modal--keyboard-open').forEach(modal => {
        modal.classList.remove('montagem-prog-modal--keyboard-open');
    });
    document.documentElement.style.removeProperty('--eai-visual-vh');
    document.documentElement.style.removeProperty('--eai-visual-offset-top');
}

function scrollFmModalFieldIntoView(field) {
    if (!field) return;
    const scrollHost = field.closest('.eai-modal__body')
        || field.closest('.eai-modal__form')
        || field.closest('.montagem-prog-modal__scroll')
        || field.closest('.montagem-prog-modal__form');
    if (!scrollHost) {
        field.scrollIntoView({ block: 'center', inline: 'nearest' });
        return;
    }
    const hostRect = scrollHost.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    const padding = 16;
    const visibleHeight = scrollHost.clientHeight;
    const targetCenter = hostRect.top + visibleHeight / 2;
    const fieldCenter = fieldRect.top + fieldRect.height / 2;
    const delta = fieldCenter - targetCenter;
    scrollHost.scrollTop += delta;
}

function bindEaiModalMobileKeyboardLayout() {
    if (bindEaiModalMobileKeyboardLayout.initialized) return;
    bindEaiModalMobileKeyboardLayout.initialized = true;

    let blurClearTimer = null;

    const onVisualViewportChange = () => {
        reconcileFmModalKeyboardLayoutFromViewport();
        if (getOpenFmModalWithKeyboard()) {
            syncFmModalVisualViewport();
        }
    };

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onVisualViewportChange);
        window.visualViewport.addEventListener('scroll', onVisualViewportChange);
    }

    const isFmMobileKeyboardLayout = () => isMobileViewport() || isTabletTouchViewport();

    document.addEventListener('focusin', event => {
        if (!isFmMobileKeyboardLayout()) return;
        const field = event.target;
        if (!isEaiModalTextEntryField(field)) return;
        const modal = getFmModalForTextField(field);
        if (!modal) return;

        if (blurClearTimer) {
            clearTimeout(blurClearTimer);
            blurClearTimer = null;
        }

        document.body.classList.add('eai-modal-keyboard-open');
        document.querySelectorAll('.eai-modal--keyboard-open, .montagem-prog-modal--keyboard-open').forEach(node => {
            if (node !== modal) {
                setFmModalKeyboardOpenClass(node, false);
            }
        });
        setFmModalKeyboardOpenClass(modal, true);
        syncFmModalVisualViewport();

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                scrollFmModalFieldIntoView(field);
            });
        });
    });

    document.addEventListener('focusout', () => {
        if (!document.body.classList.contains('eai-modal-keyboard-open')) return;
        blurClearTimer = window.setTimeout(() => {
            reconcileFmModalKeyboardLayoutFromViewport();
            if (!document.body.classList.contains('eai-modal-keyboard-open')) return;
            if (isFmVisualViewportKeyboardLikelyOpen()) return;
            const active = document.activeElement;
            if (active && isEaiModalTextEntryField(active) && getFmModalForTextField(active)) {
                clearEaiModalKeyboardLayout();
                return;
            }
            clearEaiModalKeyboardLayout();
        }, 280);
    });

    document.addEventListener(
        'pointerdown',
        event => {
            if (!isFmMobileKeyboardLayout()) return;
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (isEaiModalTextEntryField(target)) return;

            const scrollHit = target.closest('.montagem-prog-modal__scroll, .eai-modal__body, .eai-modal__form');
            if (!scrollHit) return;

            const active = document.activeElement;
            if (!(active instanceof HTMLElement) || !isEaiModalTextEntryField(active)) return;
            if (!getFmModalForTextField(active)) return;

            active.blur();
        },
        true
    );
}

window.bindEaiModalMobileKeyboardLayout = bindEaiModalMobileKeyboardLayout;
window.clearEaiModalKeyboardLayout = clearEaiModalKeyboardLayout;

window.setAppMobileTopbarTitle = setAppMobileTopbarTitle;

window.isMobileViewport = isMobileViewport;
window.isTabletTouchViewport = isTabletTouchViewport;
window.closeMobileMenu = closeMobileMenu;
window.bindResponsiveLayout = bindResponsiveLayout;
window.syncDashboardMobileDetailState = syncDashboardMobileDetailState;
window.showDashboardMobileOrderList = showDashboardMobileOrderList;
