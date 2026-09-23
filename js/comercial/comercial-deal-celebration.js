/** Celebração ao ganhar negócio no funil (Lottie + título). */

let lottieLoadPromise = null;
let activeLottieAnimation = null;
let celebrationAutoCloseTimer = null;
let celebrationEventsBound = false;

const CELEBRATION_AUTO_CLOSE_MS = 6500;
const CELEBRATION_REDUCED_MOTION_MS = 3200;

function prefersReducedCelebrationMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function loadLottieWeb() {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (lottieLoadPromise) return lottieLoadPromise;
    lottieLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const version = typeof APP_CACHE_VERSION !== 'undefined' ? APP_CACHE_VERSION : '';
        script.src = `https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js${version ? `?v=${version}` : ''}`;
        script.async = true;
        script.onload = () => resolve(window.lottie);
        script.onerror = () => reject(new Error('Não foi possível carregar o player Lottie.'));
        document.head.appendChild(script);
    });
    return lottieLoadPromise;
}

function getDealWonCelebrationElements() {
    return {
        root: document.getElementById('deal-won-celebration'),
        lottieHost: document.getElementById('deal-won-celebration-lottie'),
        titleEl: document.getElementById('deal-won-celebration-title'),
        closeBtn: document.getElementById('deal-won-celebration-close'),
        backdrop: document.getElementById('deal-won-celebration-backdrop')
    };
}

function bindDealWonCelebrationEvents() {
    if (celebrationEventsBound) return;
    celebrationEventsBound = true;
    const { closeBtn, backdrop } = getDealWonCelebrationElements();
    closeBtn?.addEventListener('click', closeDealWonCelebration);
    backdrop?.addEventListener('click', closeDealWonCelebration);
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const { root } = getDealWonCelebrationElements();
        if (root?.classList.contains('hidden')) return;
        closeDealWonCelebration();
    });
}

function scheduleDealWonCelebrationClose(delayMs) {
    if (celebrationAutoCloseTimer) clearTimeout(celebrationAutoCloseTimer);
    celebrationAutoCloseTimer = setTimeout(() => {
        celebrationAutoCloseTimer = null;
        closeDealWonCelebration();
    }, delayMs);
}

function destroyActiveLottieAnimation() {
    if (!activeLottieAnimation) return;
    try {
        activeLottieAnimation.destroy();
    } catch (_) { /* ignore */ }
    activeLottieAnimation = null;
}

function closeDealWonCelebration() {
    const { root, lottieHost } = getDealWonCelebrationElements();
    if (!root || root.classList.contains('hidden')) return;
    if (celebrationAutoCloseTimer) {
        clearTimeout(celebrationAutoCloseTimer);
        celebrationAutoCloseTimer = null;
    }
    destroyActiveLottieAnimation();
    if (lottieHost) {
        lottieHost.innerHTML = '';
        lottieHost.classList.remove('hidden');
    }
    root.classList.add('hidden');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('deal-won-celebration-open');
}

async function playDealWonCelebration({ title = '' } = {}) {
    bindDealWonCelebrationEvents();
    const { root, lottieHost, titleEl } = getDealWonCelebrationElements();
    if (!root || !titleEl) return;

    const displayTitle = String(title || '').trim() || 'Negócio';
    titleEl.textContent = displayTitle;

    closeDealWonCelebration();

    root.classList.remove('hidden');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('deal-won-celebration-open');

    const reducedMotion = prefersReducedCelebrationMotion();
    if (reducedMotion) {
        lottieHost?.classList.add('hidden');
        scheduleDealWonCelebrationClose(CELEBRATION_REDUCED_MOTION_MS);
        return;
    }

    lottieHost?.classList.remove('hidden');
    try {
        const lottie = await loadLottieWeb();
        if (lottieHost) lottieHost.innerHTML = '';
        const version = typeof APP_CACHE_VERSION !== 'undefined' ? APP_CACHE_VERSION : '';
        activeLottieAnimation = lottie.loadAnimation({
            container: lottieHost,
            renderer: 'svg',
            loop: false,
            autoplay: true,
            path: `assets/lottie/deal-won.json${version ? `?v=${version}` : ''}`
        });
    } catch (error) {
        console.warn('Celebração de negócio ganho (Lottie):', error);
        lottieHost?.classList.add('hidden');
    }

    scheduleDealWonCelebrationClose(CELEBRATION_AUTO_CLOSE_MS);
}
