const EXPEDICAO_SECTIONS = [
    { id: 'route', label: 'Rota', icon: 'route' },
    { id: 'boarding', label: 'Embarque', icon: 'boarding' },
    { id: 'unloading', label: 'Desembarque', icon: 'unloading' }
];

const EXPEDITION_ICON_PATHS = {
    route: '<path d="M4 19V5"/><path d="M4 19h16"/><circle cx="7" cy="9" r="2"/><circle cx="17" cy="15" r="2"/><path d="M9 9h5l3 6"/>',
    boarding: '<path d="M12 16V8"/><path d="m8 12 4-4 4 4"/><path d="M3 10h11v8H3z"/><path d="M14 10h5l2 3v5h-7z"/><circle cx="6.5" cy="18" r="1.25"/>',
    unloading: '<path d="M12 8v8"/><path d="m8 12 4 4 4-4"/><path d="M3 10h11v8H3z"/><path d="M14 10h5l2 3v5h-7z"/><circle cx="6.5" cy="18" r="1.25"/>',
    car: '<path d="M5 17h14l-1.5-5.5H6.5L5 17z"/><path d="M7 11.5V9h10v2.5"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
    driver: '<circle cx="12" cy="8.5" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    barcode: '<path d="M5 8v8M8 8v8M11 8v8M14 8v8M17 8v8M20 8v8"/>',
    maps: '<path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    check: '<path d="m7 12.5 3.5 3.5 7-7.5"/>',
    cross: '<path d="M8 8l8 8M16 8l-8 8"/>',
    pending: '<circle cx="7" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="17" cy="12" r="1.2" fill="currentColor" stroke="none"/>'
};

function renderExpeditionIcon(name, extraClass = 'expedition-icon') {
    const paths = EXPEDITION_ICON_PATHS[name];
    if (!paths) return '';
    const cls = escapeHtml(String(extraClass || 'expedition-icon'));
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">${paths}</svg>`;
}

function renderExpeditionMobileBtnLabel(iconName, text) {
    return `<span class="expedition-mobile-btn__inner">${renderExpeditionIcon(iconName, 'expedition-mobile-btn__icon')}<span>${escapeHtml(text)}</span></span>`;
}

function setExpeditionScanResultIconElement(el, state) {
    if (!el) return;
    const map = {
        pending: 'pending',
        success: 'check',
        error: 'cross'
    };
    const iconName = map[state] || 'cross';
    el.classList.remove('is-success-glyph', 'is-error-glyph', 'is-pending-glyph');
    if (state === 'success') el.classList.add('is-success-glyph');
    else if (state === 'error') el.classList.add('is-error-glyph');
    else if (state === 'pending') el.classList.add('is-pending-glyph');
    el.innerHTML = renderExpeditionIcon(iconName, 'expedition-scan-result-glyph');
}

let expeditionScanFeedbackAudioCtx = null;

function getExpeditionScanFeedbackAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!expeditionScanFeedbackAudioCtx) {
        expeditionScanFeedbackAudioCtx = new AudioCtx();
    }
    if (expeditionScanFeedbackAudioCtx.state === 'suspended') {
        void expeditionScanFeedbackAudioCtx.resume();
    }
    return expeditionScanFeedbackAudioCtx;
}

function primeExpeditionScanFeedbackAudio() {
    getExpeditionScanFeedbackAudioContext();
}

function playExpeditionScanTone(ctx, frequency, startAt, durationSec, volume = 0.2) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + durationSec + 0.02);
}

function playExpeditionScanFeedbackSound(variant) {
    if (variant !== 'success' && variant !== 'error') return;
    try {
        const ctx = getExpeditionScanFeedbackAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        if (variant === 'success') {
            playExpeditionScanTone(ctx, 880, now, 0.11, 0.22);
            playExpeditionScanTone(ctx, 1174.66, now + 0.13, 0.14, 0.2);
        } else {
            playExpeditionScanTone(ctx, 280, now, 0.08, 0.18);
            playExpeditionScanTone(ctx, 185, now + 0.1, 0.14, 0.2);
        }
    } catch (error) {
        console.warn('playExpeditionScanFeedbackSound:', error);
    }
}

function setExpeditionScanModalFeedbackActive(modalId, active) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.toggle('expedition-scan-modal--feedback', Boolean(active));
}

let expedicaoActiveSection = 'route';

function expeditionSqlHint() {
    return 'Execute supabase/feats/create-expedition-route.sql no Supabase SQL Editor (DEV). Ver PENDING-PROD-SQL.md.';
}

function isExpeditionTablesMissingError(error) {
    const message = String(error?.message || '');
    return /ExpeditionRoute|ExpeditionVolume|expeditionFactoryStreet|schema cache|does not exist/i.test(message);
}

function renderExpeditionRouteCrewMobile(route) {
    const vehicle = escapeHtml(route?.vehicleLabel || '—');
    const driver = escapeHtml(route?.driverName || '—');
    const responsible = typeof getExpeditionResponsibleLabel === 'function'
        ? escapeHtml(getExpeditionResponsibleLabel(route))
        : '—';
    return `
        <div class="expedicao-route-crew-mobile" role="group" aria-label="Carro, motorista e responsável">
            <div class="expedicao-route-crew-mobile__item">
                <span class="expedicao-route-crew-mobile__label">${renderExpeditionIcon('car', 'expedicao-route-crew-mobile__glyph')}<span>Carro</span></span>
                <span class="expedicao-route-crew-mobile__value">${vehicle}</span>
            </div>
            <div class="expedicao-route-crew-mobile__item">
                <span class="expedicao-route-crew-mobile__label">${renderExpeditionIcon('driver', 'expedicao-route-crew-mobile__glyph')}<span>Motorista</span></span>
                <span class="expedicao-route-crew-mobile__value expedicao-route-crew-mobile__value--driver">${driver}</span>
            </div>
            <div class="expedicao-route-crew-mobile__item expedicao-route-crew-mobile__item--responsible">
                <span class="expedicao-route-crew-mobile__label">${renderExpeditionIcon('driver', 'expedicao-route-crew-mobile__glyph')}<span>Responsável</span></span>
                <span class="expedicao-route-crew-mobile__value expedicao-route-crew-mobile__value--responsible">${responsible}</span>
            </div>
        </div>
    `;
}

function renderExpeditionRouteCrewDesktopLine(route) {
    const vehicle = escapeHtml(route?.vehicleLabel || '—');
    const driver = escapeHtml(route?.driverName || '—');
    const responsible = typeof getExpeditionResponsibleLabel === 'function'
        ? escapeHtml(getExpeditionResponsibleLabel(route))
        : '—';
    return `<p class="hidden md:block text-xs text-slate-600 mt-1">${vehicle} · ${driver} · Resp.: ${responsible}</p>`;
}

function renderExpedicaoMobileSectionBar() {
    const nav = document.getElementById('expedicao-mobile-sections');
    const view = document.getElementById('expedicao-view');
    if (!nav || !view) return;

    const visible = !view.classList.contains('hidden')
        && typeof isMobileViewport === 'function'
        && isMobileViewport();
    nav.hidden = !visible;
    if (!visible) return;

    nav.innerHTML = EXPEDICAO_SECTIONS.map(section => `
        <button type="button"
            class="expedicao-mobile-sections__btn${expedicaoActiveSection === section.id ? ' is-active' : ''}"
            data-expedicao-section="${section.id}">
            ${renderExpeditionIcon(section.icon, 'expedicao-mobile-sections__icon')}
            <span>${escapeHtml(section.label)}</span>
        </button>
    `).join('');
}

function renderExpedicaoSidebar() {
    const nav = document.getElementById('expedicao-sidebar-nav');
    if (!nav) return;

    const markSelection = !document.getElementById('expedicao-view')?.classList.contains('hidden');
    nav.innerHTML = EXPEDICAO_SECTIONS.map(section => `
        <button type="button"
            class="app-nav-item app-nav-item--nested ${markSelection && expedicaoActiveSection === section.id ? 'is-active' : ''}"
            data-expedicao-section="${section.id}">
            ${renderExpeditionIcon(section.icon, 'app-nav-icon')}
            <span>${escapeHtml(section.label)}</span>
        </button>
    `).join('');

    renderExpedicaoMobileSectionBar();
    if (typeof refreshMobileMenuIfOpen === 'function') refreshMobileMenuIfOpen();
}

function persistExpedicaoNavState() {
    if (typeof saveAppNavState !== 'function') return;
    saveAppNavState({
        view: 'expedicao',
        expedicaoSection: expedicaoActiveSection
    });
}

async function loadExpedicaoContent() {
    if (expedicaoActiveSection === 'route') {
        if (typeof loadExpedicaoRouteList === 'function') await loadExpedicaoRouteList();
        return;
    }

    if (expedicaoActiveSection === 'boarding') {
        if (typeof loadExpedicaoBoardingList === 'function') await loadExpedicaoBoardingList();
        return;
    }

    if (expedicaoActiveSection === 'unloading') {
        if (typeof loadExpedicaoUnloadingList === 'function') await loadExpedicaoUnloadingList();
        return;
    }

    const content = document.getElementById('expedicao-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Selecione um item no menu.</p>';
    }
}

function ensureExpedicaoViewVisible() {
    const view = document.getElementById('expedicao-view');
    if (!view?.classList.contains('hidden')) return;
    if (typeof hideSubViews === 'function') hideSubViews();
    view.classList.remove('hidden');
    if (typeof updateMainNavActive === 'function') updateMainNavActive('expedicao');
}

function selectExpedicaoSection(sectionId) {
    if (!EXPEDICAO_SECTIONS.some(section => section.id === sectionId)) return;
    showExpedicao(sectionId);
}

function showExpedicao(sectionId) {
    if (typeof canAccessExpedicao === 'function' && !canAccessExpedicao()) {
        alertAppDialog('Você não tem acesso à expedição.');
        return;
    }

    const view = document.getElementById('expedicao-view');
    if (!view) {
        alertAppDialog('Tela de expedição não carregada. Atualize a página (hard refresh).');
        return;
    }

    if (sectionId) {
        expedicaoActiveSection = EXPEDICAO_SECTIONS.some(section => section.id === sectionId)
            ? sectionId
            : 'route';
    } else if (!EXPEDICAO_SECTIONS.some(section => section.id === expedicaoActiveSection)) {
        expedicaoActiveSection = 'route';
    }

    const details = document.getElementById('btn-expedicao');
    if (details?.tagName === 'DETAILS') {
        details.open = true;
    }

    hideSubViews();
    view.classList.remove('hidden');
    updateMainNavActive('expedicao');
    updateAdminNav();
    updateExpedicaoNav();
    renderExpedicaoSidebar();
    void loadExpedicaoContent();
    persistExpedicaoNavState();
    if (typeof closeMobileMenu === 'function') {
        closeMobileMenu();
    }
}

async function restoreExpedicaoView(state = {}) {
    if (typeof canAccessExpedicao === 'function' && !canAccessExpedicao()) {
        if (typeof showWelcome === 'function') showWelcome();
        return;
    }

    const savedSection = state.expedicaoSection || 'route';
    expedicaoActiveSection = EXPEDICAO_SECTIONS.some(section => section.id === savedSection)
        ? savedSection
        : 'route';

    hideSubViews();
    document.getElementById('expedicao-view')?.classList.remove('hidden');
    updateMainNavActive('expedicao');
    updateAdminNav();
    updateExpedicaoNav();
    renderExpedicaoSidebar();
    await loadExpedicaoContent();
    persistExpedicaoNavState();
}

function updateExpedicaoNav() {
    const btn = document.getElementById('btn-expedicao');
    if (!btn) return;
    if (typeof hasInstallerOnlyAccess === 'function' && hasInstallerOnlyAccess()) {
        btn.classList.add('hidden');
        return;
    }
    const canAccess = typeof canAccessExpedicao === 'function' && canAccessExpedicao();
    btn.classList.toggle('hidden', !canAccess);
    if (canAccess) renderExpedicaoSidebar();
}

const expedicaoActionOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('expedicao-action')
    : null;

function setExpedicaoActionLoading(active, message = 'Processando...', status = 'loading') {
    expedicaoActionOverlay?.setLoading(active, message, status);
}

function bindExpedicaoEvents() {
    document.getElementById('btn-expedicao')?.addEventListener('click', event => {
        if (event.target.closest('#expedicao-sidebar-nav')) return;
        if (!event.target.closest('summary')) return;
        event.preventDefault();
        const details = event.currentTarget;
        details.open = true;
        showExpedicao('route');
    });

    const onExpedicaoSectionClick = event => {
        const btn = event.target.closest('[data-expedicao-section]');
        if (!btn) return;
        event.preventDefault();
        selectExpedicaoSection(btn.dataset.expedicaoSection);
    };

    document.getElementById('app-header-nav')?.addEventListener('click', onExpedicaoSectionClick);
    document.getElementById('expedicao-mobile-sections')?.addEventListener('click', onExpedicaoSectionClick);
}

window.showExpedicao = showExpedicao;
window.restoreExpedicaoView = restoreExpedicaoView;
window.updateExpedicaoNav = updateExpedicaoNav;
window.selectExpedicaoSection = selectExpedicaoSection;
window.bindExpedicaoEvents = bindExpedicaoEvents;
window.expeditionSqlHint = expeditionSqlHint;
window.isExpeditionTablesMissingError = isExpeditionTablesMissingError;
window.renderExpeditionRouteCrewMobile = renderExpeditionRouteCrewMobile;
window.renderExpeditionRouteCrewDesktopLine = renderExpeditionRouteCrewDesktopLine;
window.renderExpeditionIcon = renderExpeditionIcon;
window.renderExpeditionMobileBtnLabel = renderExpeditionMobileBtnLabel;
window.setExpeditionScanResultIconElement = setExpeditionScanResultIconElement;
window.primeExpeditionScanFeedbackAudio = primeExpeditionScanFeedbackAudio;
window.playExpeditionScanFeedbackSound = playExpeditionScanFeedbackSound;
window.setExpeditionScanModalFeedbackActive = setExpeditionScanModalFeedbackActive;
window.renderExpedicaoMobileSectionBar = renderExpedicaoMobileSectionBar;