/** Tempo máximo com a mesma carga do FGP (login + bundles) antes de novo login e reload. */
const FGP_MAX_APP_SESSION_MS = 12 * 60 * 60 * 1000;
const FGP_APP_SESSION_GRANT_STORAGE_KEY = 'fgp_app_session_grant';
const FGP_APP_VERSION_POLL_MS = 5 * 60 * 1000;

let fgpAppSessionPolicyWatchStarted = false;
let fgpAppSessionForceRefreshInProgress = false;
let fgpAppVersionUpdateNoticeQueued = false;
let fgpAppVersionUpdateDeployedVersion = null;
let fgpAppVersionUpdateBannerBound = false;

function parseAppSessionGrant() {
    try {
        const raw = localStorage.getItem(FGP_APP_SESSION_GRANT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch (_error) {
        return null;
    }
}

function normalizeAppBundleVersion(version) {
    return String(version || '').trim();
}

function recordAppSessionGrant() {
    const bundledVersion = typeof APP_CACHE_VERSION !== 'undefined'
        ? normalizeAppBundleVersion(APP_CACHE_VERSION)
        : '';
    localStorage.setItem(FGP_APP_SESSION_GRANT_STORAGE_KEY, JSON.stringify({
        grantedAt: Date.now(),
        version: bundledVersion
    }));
}

function clearAppSessionGrant() {
    localStorage.removeItem(FGP_APP_SESSION_GRANT_STORAGE_KEY);
}

function getAppSessionGrantRemainingMs() {
    const grant = parseAppSessionGrant();
    const grantedAt = Number(grant?.grantedAt);
    if (!Number.isFinite(grantedAt) || grantedAt <= 0) return 0;
    return Math.max(0, FGP_MAX_APP_SESSION_MS - (Date.now() - grantedAt));
}

function isAppSessionGrantExpired() {
    const grant = parseAppSessionGrant();
    const grantedAt = Number(grant?.grantedAt);
    if (!Number.isFinite(grantedAt) || grantedAt <= 0) return true;
    return Date.now() - grantedAt >= FGP_MAX_APP_SESSION_MS;
}

async function fetchDeployedAppVersion() {
    try {
        const response = await fetch(`VERSION?${Date.now()}`);
        if (!response.ok) return null;
        const text = normalizeAppBundleVersion(await response.text());
        return text || null;
    } catch (error) {
        console.warn('fetchDeployedAppVersion:', error);
        return null;
    }
}

async function isRunningStaleAppBundle() {
    const deployed = await fetchDeployedAppVersion();
    if (!deployed) return false;
    const bundled = typeof APP_CACHE_VERSION !== 'undefined'
        ? normalizeAppBundleVersion(APP_CACHE_VERSION)
        : '';
    if (!bundled) return false;
    return deployed !== bundled;
}

function bindAppVersionUpdateBannerActions() {
    if (fgpAppVersionUpdateBannerBound) return;
    const button = document.getElementById('btn-app-version-update-now');
    if (!button) return;
    fgpAppVersionUpdateBannerBound = true;
    button.addEventListener('click', () => {
        void forceAppSessionRefresh('version-user');
    });
}

function tryShowAppVersionUpdateBanner() {
    if (!fgpAppVersionUpdateNoticeQueued) return false;
    const banner = document.getElementById('app-version-update-banner');
    if (!banner) return false;

    const bundled = typeof APP_CACHE_VERSION !== 'undefined'
        ? normalizeAppBundleVersion(APP_CACHE_VERSION)
        : '';
    const deployed = fgpAppVersionUpdateDeployedVersion;
    const versionEl = document.getElementById('app-version-update-banner-version');
    if (versionEl) {
        versionEl.textContent = bundled && deployed && bundled !== deployed
            ? ` (${bundled} → ${deployed})`
            : '';
    }

    banner.classList.remove('hidden');
    bindAppVersionUpdateBannerActions();
    return true;
}

async function notifyAppVersionUpdateAvailable() {
    if (!fgpAppVersionUpdateDeployedVersion) {
        fgpAppVersionUpdateDeployedVersion = await fetchDeployedAppVersion();
    }
    if (!fgpAppVersionUpdateDeployedVersion) return;

    fgpAppVersionUpdateNoticeQueued = true;
    tryShowAppVersionUpdateBanner();
}

async function checkAndNotifyStaleAppBundle() {
    if (!(await isRunningStaleAppBundle())) return;
    await notifyAppVersionUpdateAvailable();
}

function scrubFgpRefreshFromBrowserUrl() {
    try {
        const url = new URL(window.location.href);
        const hadRefresh = url.searchParams.has('fgp_refresh');
        url.searchParams.delete('fgp_refresh');
        if (!hadRefresh) return;
        const next = `${url.pathname}${url.search}${url.hash}`;
        history.replaceState(null, '', next || url.pathname);
    } catch (_error) {
        // ignora
    }
}

function buildAppSessionRefreshUrl() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('fgp_refresh');
        url.hash = '';
        url.searchParams.delete('code');
        url.searchParams.delete('type');
        const query = url.search;
        return `${url.origin}${url.pathname}${query}`;
    } catch (_error) {
        return `${window.location.origin}${window.location.pathname}`;
    }
}

async function forceAppSessionRefresh(reason = 'policy') {
    if (fgpAppSessionForceRefreshInProgress) return;
    fgpAppSessionForceRefreshInProgress = true;

    clearAppSessionGrant();
    if (typeof clearUserImpersonationState === 'function') clearUserImpersonationState();
    if (typeof clearAppNavState === 'function') clearAppNavState();

    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth) {
            await supabaseClient.auth.signOut();
        }
    } catch (error) {
        console.warn('forceAppSessionRefresh signOut:', error);
    }

    window.location.replace(buildAppSessionRefreshUrl());
}

async function assertAppSessionPolicyForEnterApp(options = {}) {
    const { freshLogin = false } = options;
    if (freshLogin) return true;

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.user) {
        clearAppSessionGrant();
        throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (isAppSessionGrantExpired()) {
        await forceAppSessionRefresh('expired');
        throw new Error('Sessão expirada. Faça login novamente.');
    }

    await checkAndNotifyStaleAppBundle();

    return true;
}

async function enforceAppSessionPolicyOnBootstrap(session) {
    if (!session?.user) {
        clearAppSessionGrant();
        return true;
    }

    if (typeof passwordRecoveryPending !== 'undefined' && passwordRecoveryPending) {
        return true;
    }
    if (typeof isPasswordRecoveryRedirect === 'function' && isPasswordRecoveryRedirect()) {
        return true;
    }

    if (isAppSessionGrantExpired()) {
        await forceAppSessionRefresh('expired');
        return false;
    }

    await checkAndNotifyStaleAppBundle();

    return true;
}

async function runAppSessionPolicyPeriodicCheck() {
    if (fgpAppSessionForceRefreshInProgress) return;
    const hasActiveApp = Boolean(
        (typeof currentUser !== 'undefined' && currentUser)
        || (typeof appShellReady !== 'undefined' && appShellReady)
    );
    if (!hasActiveApp) return;

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.user) return;

    if (isAppSessionGrantExpired()) {
        await forceAppSessionRefresh('expired');
        return;
    }

    await checkAndNotifyStaleAppBundle();
}

function startAppSessionPolicyWatcher() {
    if (fgpAppSessionPolicyWatchStarted) return;
    fgpAppSessionPolicyWatchStarted = true;

    window.setInterval(() => {
        void runAppSessionPolicyPeriodicCheck();
    }, FGP_APP_VERSION_POLL_MS);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            void runAppSessionPolicyPeriodicCheck();
        }
    });
}

window.clearAppSessionGrant = clearAppSessionGrant;
window.recordAppSessionGrant = recordAppSessionGrant;
window.isAppSessionGrantExpired = isAppSessionGrantExpired;
window.forceAppSessionRefresh = forceAppSessionRefresh;
window.enforceAppSessionPolicyOnBootstrap = enforceAppSessionPolicyOnBootstrap;
window.assertAppSessionPolicyForEnterApp = assertAppSessionPolicyForEnterApp;
window.startAppSessionPolicyWatcher = startAppSessionPolicyWatcher;
window.scrubFgpRefreshFromBrowserUrl = scrubFgpRefreshFromBrowserUrl;
window.tryShowAppVersionUpdateBanner = tryShowAppVersionUpdateBanner;

scrubFgpRefreshFromBrowserUrl();