const EXPEDITION_BOARDING_LIST_STATUSES = ['Printed', 'BoardingStarted'];
const EXPEDITION_BOARDING_SESSION_STATUSES = [
    ...EXPEDITION_BOARDING_LIST_STATUSES,
    'Boarded'
];

let expedicaoBoardingView = 'list';
let expedicaoBoardingRouteId = null;
let expedicaoBoardingDetail = null;
let expedicaoBoardingScanner = null;
let expedicaoBoardingScannerRunning = false;

function resolveExpeditionBoardingVendorUrl(fileName) {
    const bootstrap = document.querySelector('script[src*="bootstrap.js"]');
    const base = bootstrap?.src
        ? bootstrap.src.replace(/\/js\/bootstrap\.js(\?.*)?$/, '')
        : `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}`;
    const version = typeof APP_CACHE_VERSION !== 'undefined' ? APP_CACHE_VERSION : Date.now();
    return `${base}/js/vendor/${fileName}?v=${encodeURIComponent(version)}`;
}

function isExpeditionBoardingSchemaError(error) {
    const message = String(error?.message || '');
    return /boardedAt|boardedById|schema cache|column/i.test(message);
}

function expeditionBoardingSqlHint() {
    return 'Execute `supabase/feats/expedition-volume-boarding.sql` no Supabase SQL Editor (DEV).';
}

async function loadHtml5QrcodeLibrary() {
    if (typeof Html5Qrcode !== 'undefined') return Html5Qrcode;
    if (window.__expeditionHtml5QrcodePromise) return window.__expeditionHtml5QrcodePromise;

    window.__expeditionHtml5QrcodePromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-expedition-html5-qrcode]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.Html5Qrcode));
            existing.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.dataset.expeditionHtml5Qrcode = '1';
        script.src = resolveExpeditionBoardingVendorUrl('html5-qrcode.min.js');
        script.async = true;
        script.onload = () => resolve(window.Html5Qrcode);
        script.onerror = () => reject(new Error('Não foi possível carregar o leitor de código de barras.'));
        document.head.appendChild(script);
    });

    return window.__expeditionHtml5QrcodePromise;
}

function countExpeditionBoardedVolumes(volumes = []) {
    return (volumes || []).filter(vol => vol?.boardedAt).length;
}

function groupExpeditionBoardingStops(volumes = []) {
    const stopsMap = new Map();

    (volumes || []).forEach(vol => {
        const stop = vol.stopItem?.stop;
        const stopKey = Number(stop?.id) ?? Number(stop?.sortOrder);
        if (!stopsMap.has(stopKey)) {
            stopsMap.set(stopKey, {
                sortOrder: Number(stop?.sortOrder) || 0,
                addr: stop?.addrSnapshot || {},
                volumes: []
            });
        }
        stopsMap.get(stopKey).volumes.push(vol);
    });

    return [...stopsMap.values()]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(stop => ({
            ...stop,
            volumes: stop.volumes.slice().sort((a, b) => {
                const itemA = Number(a.stopItem?.id) || 0;
                const itemB = Number(b.stopItem?.id) || 0;
                if (itemA !== itemB) return itemA - itemB;
                return (Number(a.volumeIndex) || 0) - (Number(b.volumeIndex) || 0);
            })
        }));
}

async function fetchExpeditionBoardingRoutes() {
    const { data, error } = await supabaseClient
        .from('ExpeditionRoute')
        .select('id, routeDate, vehicleLabel, driverName, status, updatedAt')
        .in('status', EXPEDITION_BOARDING_LIST_STATUSES)
        .order('routeDate', { ascending: false })
        .order('id', { ascending: false })
        .limit(80);

    if (error) throw error;
    return data || [];
}

async function fetchExpeditionBoardingRouteDetail(routeId, options = {}) {
    const key = Number(routeId);
    if (!key) throw new Error('Rota inválida.');

    const { data: route, error: routeError } = await supabaseClient
        .from('ExpeditionRoute')
        .select('id, routeDate, vehicleLabel, driverName, status')
        .eq('id', key)
        .maybeSingle();

    if (routeError) throw routeError;
    if (!route) throw new Error('Rota não encontrada.');

    const inActiveSession = Number(key) === Number(expedicaoBoardingRouteId);
    const allowBoarded = options.includeBoardedStatus || inActiveSession;
    const allowedStatuses = allowBoarded
        ? EXPEDITION_BOARDING_SESSION_STATUSES
        : EXPEDITION_BOARDING_LIST_STATUSES;
    if (!allowedStatuses.includes(route.status)) {
        throw new Error('Esta rota não está disponível para embarque.');
    }

    const volumes = await fetchExpeditionRouteVolumes(key);
    if (!volumes.length) {
        throw new Error('Rota sem volumes cadastrados.');
    }

    return {
        route,
        volumes,
        stops: groupExpeditionBoardingStops(volumes),
        boardedCount: countExpeditionBoardedVolumes(volumes),
        totalCount: volumes.length
    };
}

async function promoteExpeditionRouteBoardingStarted(routeId) {
    const key = Number(routeId);
    const { data: route } = await supabaseClient
        .from('ExpeditionRoute')
        .select('status')
        .eq('id', key)
        .maybeSingle();

    if (!route || route.status !== 'Printed') return;

    const now = new Date().toISOString();
    await supabaseClient
        .from('ExpeditionRoute')
        .update({ status: 'BoardingStarted', updatedAt: now })
        .eq('id', key);
}

async function tryCompleteExpeditionRouteBoarding(routeId, volumes) {
    const total = volumes?.length || 0;
    const boarded = countExpeditionBoardedVolumes(volumes);
    if (!total || boarded < total) return false;

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('ExpeditionRoute')
        .update({ status: 'Boarded', updatedAt: now })
        .eq('id', Number(routeId));

    if (error) {
        console.warn('tryCompleteExpeditionRouteBoarding:', error);
        return false;
    }
    return true;
}

async function markExpeditionVolumeBoarded(volumeId) {
    const key = Number(volumeId);
    const now = new Date().toISOString();
    const payload = {
        boardedAt: now,
        boardedById: currentUser?.id || null
    };

    let result = await supabaseClient
        .from('ExpeditionVolume')
        .update(payload)
        .eq('id', key)
        .select('id, routeId, volumeCode, boardedAt')
        .single();

    if (result.error && isExpeditionBoardingSchemaError(result.error)) {
        throw new Error(expeditionBoardingSqlHint());
    }
    if (result.error) throw result.error;
    return result.data;
}

async function lookupExpeditionVolumeByCode(volumeCode) {
    const code = String(volumeCode || '').trim().toUpperCase();
    if (!code) return null;

    let result = await supabaseClient
        .from('ExpeditionVolume')
        .select('id, volumeCode, routeId, boardedAt, volumeIndex, stopItemId')
        .eq('volumeCode', code)
        .maybeSingle();

    if (result.error && /volumeCode/i.test(result.error.message || '')) {
        result = await supabaseClient
            .from('ExpeditionVolume')
            .select('id, volumeCode, routeId, boardedAt, volumeIndex, stopItemId')
            .ilike('volumeCode', code)
            .maybeSingle();
    }

    if (result.error) throw result.error;
    return result.data;
}

function renderExpedicaoBoardingList(mount, rows) {
    const cardsMobile = (rows || []).map(row => {
        const statusLabel = typeof formatExpeditionRouteStatus === 'function'
            ? formatExpeditionRouteStatus(row.status)
            : row.status;
        const dateLabel = row.routeDate && typeof formatDate === 'function'
            ? formatDate(row.routeDate)
            : '—';
        return `
            <article class="expedicao-boarding-card md:hidden border border-slate-200 rounded-xl p-3 bg-white shadow-sm">
                <p class="text-xs font-bold text-slate-900">${escapeHtml(dateLabel)} · ${escapeHtml(statusLabel)}</p>
                ${typeof renderExpeditionRouteCrewMobile === 'function' ? renderExpeditionRouteCrewMobile(row) : ''}
                <button type="button"
                    class="expedicao-boarding-open-btn mt-3 w-full text-xs bg-slate-900 text-white px-3 py-2.5 rounded-lg font-semibold touch-manipulation"
                    data-route-id="${row.id}">${typeof renderExpeditionMobileBtnLabel === 'function' ? renderExpeditionMobileBtnLabel('boarding', 'Embarcar') : 'Embarcar'}</button>
            </article>
        `;
    }).join('');

    const tableRows = (rows || []).map(row => {
        const statusLabel = typeof formatExpeditionRouteStatus === 'function'
            ? formatExpeditionRouteStatus(row.status)
            : row.status;
        const dateLabel = row.routeDate && typeof formatDate === 'function'
            ? formatDate(row.routeDate)
            : '—';
        return `
            <tr class="hover:bg-slate-50/80">
                <td class="p-3 text-xs whitespace-nowrap">${escapeHtml(dateLabel)}</td>
                <td class="p-3 text-xs">${escapeHtml(row.vehicleLabel || '—')}</td>
                <td class="p-3 text-xs">${escapeHtml(row.driverName || '—')}</td>
                <td class="p-3 text-xs">${escapeHtml(statusLabel)}</td>
                <td class="p-3 text-xs">
                    <button type="button"
                        class="expedicao-boarding-open-btn text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold"
                        data-route-id="${row.id}">Embarcar</button>
                </td>
            </tr>
        `;
    }).join('');

    mount.innerHTML = `
        <div class="expedicao-boarding-shell flex flex-col gap-4 min-h-[calc(100vh-140px)]">
            <motion></motion>
            <div>
                <h2 class="text-lg font-bold text-slate-900">Embarque</h2>
                <p class="text-xs text-slate-500 mt-1">Rotas impressas ou com embarque em andamento. Use a câmera para ler o código do volume.</p>
            </div>
            <div class="md:hidden flex flex-col gap-2">${cardsMobile || '<p class="text-xs text-slate-400 text-center py-8">Nenhuma rota disponível.</p>'}</div>
            <div class="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table class="w-full text-left">
                    <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                            <th class="p-3 font-semibold">Dia</th>
                            <th class="p-3 font-semibold">Carro</th>
                            <th class="p-3 font-semibold">Motorista</th>
                            <th class="p-3 font-semibold">Status</th>
                            <th class="p-3 font-semibold">Ação</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${tableRows || '<tr><td colspan="5" class="p-8 text-center text-xs text-slate-400">Nenhuma rota disponível.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `.replace('<motion></motion>', '');

    mount.querySelectorAll('.expedicao-boarding-open-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const routeId = Number(btn.dataset.routeId);
            void openExpedicaoBoardingRoute(routeId);
        });
    });
}

function renderExpedicaoBoardingVolumeRow(vol) {
    const boarded = Boolean(vol.boardedAt);
    const stopOrder = Number(vol.stopItem?.stop?.sortOrder) || 0;
    const volNum = Number(vol.volumeIndex) || 0;
    const volTotal = Number(vol.stopItem?.volumeCount) || volNum;
    const entityLabel = escapeHtml(vol.stopItem?.entityLabel || '');
    return `
        <li class="expedicao-boarding-volume ${boarded ? 'is-boarded' : ''}">
            <motion></motion>
            <div class="flex-1 min-w-0">
                <p class="text-[11px] font-semibold text-slate-800">${entityLabel}</p>
                <p class="text-[10px] text-slate-500">Vol. ${volNum}/${volTotal} · ${escapeHtml(vol.volumeCode || '')}</p>
            </div>
            <span class="expedicao-boarding-volume-badge text-[10px] font-semibold px-2 py-0.5 rounded-full">
                ${boarded ? 'Embarcado' : 'Pendente'}
            </span>
        </li>
    `.replace('<motion></motion>', `
            <span class="text-[10px] font-bold text-slate-400 w-12 shrink-0">P${stopOrder + 1}</span>
        `);
}

function renderExpedicaoBoardingDetail(mount, detail) {
    const { route, stops, boardedCount, totalCount } = detail;
    const allBoarded = boardedCount >= totalCount && totalCount > 0;
    const dateLabel = route.routeDate && typeof formatDate === 'function'
        ? formatDate(route.routeDate)
        : '—';
    const statusLabel = typeof formatExpeditionRouteStatus === 'function'
        ? formatExpeditionRouteStatus(route.status)
        : route.status;
    const progressPct = totalCount ? Math.round((boardedCount / totalCount) * 100) : 0;

    const stopsHtml = (stops || []).map((stop, index) => {
        const addr = typeof formatExpeditionAddressOneLine === 'function'
            ? formatExpeditionAddressOneLine(stop.addr)
            : '';
        const vols = (stop.volumes || []).map(renderExpedicaoBoardingVolumeRow).join('');
        return `
            <article class="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
                <h4 class="text-xs font-bold text-slate-900">Parada ${index + 1}</h4>
                <p class="text-[11px] text-slate-600 whitespace-pre-wrap mt-1">${escapeHtml(addr || '—')}</p>
                <ul class="mt-2 space-y-2">${vols}</ul>
            </article>
        `;
    }).join('');

    mount.innerHTML = `
        <div class="expedicao-boarding-detail expedicao-boarding-layout">
            <div class="expedicao-boarding-detail-main space-y-3">
                <button type="button" id="expedicao-boarding-back"
                    class="text-xs text-slate-500 hover:text-slate-800 font-medium">← Voltar à lista</button>
                <motion></motion>
                <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <p class="text-sm font-bold text-slate-900">Rota #${route.id} · ${escapeHtml(dateLabel)}</p>
                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">${escapeHtml(statusLabel)}</span>
                    </div>
                    ${typeof renderExpeditionRouteCrewMobile === 'function' ? renderExpeditionRouteCrewMobile(route) : ''}
                    ${typeof renderExpeditionRouteCrewDesktopLine === 'function' ? renderExpeditionRouteCrewDesktopLine(route) : ''}
                    <div class="mt-3">
                        <motion-progress></motion-progress>
                        <p class="text-[11px] text-slate-500 mt-1">${boardedCount} de ${totalCount} volumes embarcados</p>
                    </div>
                </div>
                <div class="space-y-2 max-h-[50vh] lg:max-h-none overflow-y-auto">${stopsHtml}</div>
            </div>
            <aside class="expedicao-boarding-detail-side">
                <motion-action></motion-action>
            </aside>
        </div>
    `
        .replace('<motion></motion>', allBoarded
            ? `<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 font-semibold">Todos os volumes desta rota já foram embarcados.</div>`
            : '')
        .replace('<motion-progress>', `
                        <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div class="h-full bg-emerald-500 transition-all" style="width:${progressPct}%"></div>
                        </div>`)
        .replace('<motion-action>', allBoarded
            ? `<button type="button" id="expedicao-boarding-close-detail"
                    class="w-full text-sm bg-slate-100 text-slate-700 px-4 py-3 rounded-xl font-semibold">Fechar</button>`
            : `<button type="button" id="expedicao-boarding-scan-btn"
                    class="w-full text-sm bg-slate-900 text-white px-4 py-3.5 rounded-xl font-bold shadow-sm hover:bg-slate-800 min-h-[48px] touch-manipulation">
                    ${typeof renderExpeditionMobileBtnLabel === 'function' ? renderExpeditionMobileBtnLabel('barcode', 'Embarcar volume') : 'Embarcar volume'}
                </button>
                <p class="text-[10px] text-slate-400 text-center mt-2">Aponte a câmera para o código de barras da etiqueta.</p>
                <motion-manual></motion-manual>`)
        .replace('<motion-manual>', `
                <div class="hidden lg:block mt-4 pt-4 border-t border-slate-200">
                    <label class="block text-[10px] font-semibold text-slate-500 mb-1" for="expedicao-boarding-manual-code">Código manual (desktop)</label>
                    <div class="flex gap-2">
                        <input type="text" id="expedicao-boarding-manual-code" placeholder="VOL-..."
                            class="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg uppercase">
                        <button type="button" id="expedition-boarding-manual-submit"
                            class="text-xs bg-white border border-slate-200 px-3 py-2 rounded-lg font-semibold">OK</button>
                    </div>
                    <p id="expedition-boarding-manual-feedback"
                        class="hidden expedition-boarding-manual-feedback mt-3 text-sm font-bold rounded-xl px-3 py-3" role="alert"></p>
                </div>`);
}

function applyLocalBoardedVolume(volumeId) {
    const key = Number(volumeId);
    if (!key || !expedicaoBoardingDetail?.volumes) return;
    const now = new Date().toISOString();
    expedicaoBoardingDetail.volumes.forEach(vol => {
        if (Number(vol.id) === key && !vol.boardedAt) vol.boardedAt = now;
    });
    const boarded = countExpeditionBoardedVolumes(expedicaoBoardingDetail.volumes);
    expedicaoBoardingDetail.boardedCount = boarded;
}

async function finishExpeditionBoardingRouteFeedback(volumes, options) {
    await tryCompleteExpeditionRouteBoarding(expedicaoBoardingRouteId, volumes);
    if (expedicaoBoardingDetail?.route) {
        expedicaoBoardingDetail.route.status = 'Boarded';
        expedicaoBoardingDetail.boardedCount = expedicaoBoardingDetail.totalCount || volumes.length;
    }
    feedbackExpedicaoBoardingCodeResult({
        success: true,
        message: buildExpeditionBoardingAllCompleteMessage(),
        allBoarded: true
    }, options);
}

async function refreshExpedicaoBoardingDetail() {
    if (!expedicaoBoardingRouteId) return;
    expedicaoBoardingDetail = await fetchExpeditionBoardingRouteDetail(expedicaoBoardingRouteId, {
        includeBoardedStatus: true
    });
    const mount = document.getElementById('expedicao-content');
    if (mount && expedicaoBoardingView === 'detail') {
        renderExpedicaoBoardingDetail(mount, expedicaoBoardingDetail);
        bindExpedicaoBoardingDetailEvents(mount);
    }
}

function bindExpedicaoBoardingDetailEvents(mount) {
    mount.querySelector('#expedicao-boarding-back')?.addEventListener('click', () => {
        expedicaoBoardingView = 'list';
        expedicaoBoardingRouteId = null;
        expedicaoBoardingDetail = null;
        void loadExpedicaoBoardingList();
    });

    mount.querySelector('#expedicao-boarding-close-detail')?.addEventListener('click', () => {
        expedicaoBoardingView = 'list';
        expedicaoBoardingRouteId = null;
        expedicaoBoardingDetail = null;
        void loadExpedicaoBoardingList();
    });

    mount.querySelector('#expedicao-boarding-scan-btn')?.addEventListener('click', () => {
        void openExpedicaoBoardingScanModal();
    });

    const manualSubmit = () => {
        const raw = mount.querySelector('#expedicao-boarding-manual-code')?.value;
        void processExpedicaoBoardingScanCode(raw, { fromScanner: false });
    };
    mount.querySelector('#expedicao-boarding-manual-submit')?.addEventListener('click', manualSubmit);
    mount.querySelector('#expedicao-boarding-manual-code')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') manualSubmit();
    });
}

async function openExpedicaoBoardingRoute(routeId) {
    const key = Number(routeId);
    if (!key) return;

    setExpedicaoActionLoading(true, 'Carregando rota...');
    try {
        expedicaoBoardingDetail = await fetchExpeditionBoardingRouteDetail(key);
        expedicaoBoardingRouteId = key;
        expedicaoBoardingView = 'detail';
        await promoteExpeditionRouteBoardingStarted(key);
        expedicaoBoardingDetail.route.status = expedicaoBoardingDetail.route.status === 'Printed'
            ? 'BoardingStarted'
            : expedicaoBoardingDetail.route.status;

        const mount = document.getElementById('expedicao-content');
        if (!mount) return;
        renderExpedicaoBoardingDetail(mount, expedicaoBoardingDetail);
        bindExpedicaoBoardingDetailEvents(mount);
    } catch (error) {
        console.error('openExpedicaoBoardingRoute:', error);
        alertAppDialog(error.message || 'Erro ao abrir embarque.');
    } finally {
        setExpedicaoActionLoading(false);
    }
}

async function loadExpedicaoBoardingList() {
    const mount = document.getElementById('expedicao-content');
    if (!mount) return;

    expedicaoBoardingView = 'list';
    expedicaoBoardingRouteId = null;
    expedicaoBoardingDetail = null;

    setExpedicaoActionLoading(true, 'Carregando embarque...');
    try {
        const rows = await fetchExpeditionBoardingRoutes();
        renderExpedicaoBoardingList(mount, rows);
    } catch (error) {
        console.error('loadExpedicaoBoardingList:', error);
        if (isExpeditionTablesMissingError(error)) {
            mount.innerHTML = `<p class="text-xs text-amber-700 text-center py-8">${escapeHtml(expeditionSqlHint())}</p>`;
            return;
        }
        mount.innerHTML = `<p class="text-xs text-red-600 text-center py-8">${escapeHtml(error.message)}</p>`;
    } finally {
        setExpedicaoActionLoading(false);
    }
}

function isExpeditionBoardingScanModalOpen() {
    const modal = document.getElementById('expedition-boarding-scan-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

function hideExpedicaoBoardingScanResult() {
    clearExpeditionBoardingScanAutoResumeTimer();
    const panel = document.getElementById('expedition-boarding-scan-result');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.classList.remove('is-success', 'is-error', 'is-pending');
    setExpeditionScanModalFeedbackActive('expedition-boarding-scan-modal', false);
    if (isExpeditionBoardingScanModalOpen()) {
        setExpedicaoBoardingScanCameraLayerHidden(false);
    }
}

function setExpedicaoBoardingManualFeedback(message, success) {
    const box = document.getElementById('expedicao-boarding-manual-feedback');
    if (!box) return;
    if (!message) {
        box.textContent = '';
        box.classList.add('hidden');
        box.classList.remove('is-success', 'is-error');
        return;
    }
    const prefix = success ? '✓ ' : '✕ ';
    box.textContent = `${prefix}${message}`;
    box.classList.remove('hidden', 'is-success', 'is-error');
    box.classList.add(success ? 'is-success' : 'is-error');
}

function buildExpeditionBoardingAllCompleteMessage() {
    const total = expedicaoBoardingDetail?.totalCount || 0;
    if (total > 0) {
        return `Embarque finalizado. Todos os ${total} volumes desta rota foram embarcados.`;
    }
    return 'Embarque finalizado. Todos os volumes desta rota foram embarcados.';
}

function openExpedicaoBoardingCompleteScreen(message) {
    const modal = document.getElementById('expedition-boarding-scan-modal');
    if (modal) modal.classList.remove('hidden');
    setExpedicaoBoardingScanCameraLayerHidden(true);
    showExpedicaoBoardingScanResult({
        success: true,
        message: message || buildExpeditionBoardingAllCompleteMessage(),
        allBoarded: true
    });
}

function feedbackExpedicaoBoardingCodeResult({ success, message, allBoarded = false }, options = {}) {
    const useScanOverlay = options.fromScanner || isExpeditionBoardingScanModalOpen();

    if (success && allBoarded) {
        openExpedicaoBoardingCompleteScreen(message);
        setExpedicaoBoardingManualFeedback('', false);
        return;
    }

    if (useScanOverlay) {
        showExpedicaoBoardingScanResult({ success, message, allBoarded: false });
        setExpedicaoBoardingManualFeedback('', false);
        return;
    }

    setExpedicaoBoardingManualFeedback(message, success);

    if (success) {
        const manualInput = document.getElementById('expedition-boarding-manual-code');
        if (manualInput) manualInput.value = '';
    }
}

function setExpedicaoBoardingScanCameraLayerHidden(hidden) {
    const wrap = document.getElementById('expedition-boarding-scan-camera-wrap');
    const footer = document.getElementById('expedition-boarding-scan-footer');
    if (wrap) wrap.classList.toggle('hidden', hidden);
    if (footer) footer.classList.toggle('hidden', hidden);
}

function clearExpedicaoBoardingReaderDom() {
    const reader = document.getElementById('expedition-boarding-reader');
    if (!reader) return;
    reader.innerHTML = '';
    reader.classList.remove('hidden');
}

function showExpedicaoBoardingScanResult({ success, message, allBoarded = false, pending = false }) {
    const panel = document.getElementById('expedition-boarding-scan-result');
    const icon = document.getElementById('expedition-boarding-scan-result-icon');
    const title = document.getElementById('expedition-boarding-scan-result-title');
    const msg = document.getElementById('expedition-boarding-scan-result-msg');
    const actions = document.getElementById('expedition-boarding-scan-result-actions');
    if (!panel || !msg || !actions) return;

    setExpedicaoBoardingScanCameraLayerHidden(true);
    clearExpedicaoBoardingReaderDom();
    setExpeditionScanModalFeedbackActive('expedition-boarding-scan-modal', true);

    panel.classList.remove('hidden', 'is-success', 'is-error', 'is-pending', 'is-all-boarded');
    if (pending) {
        panel.classList.add('is-pending');
    } else {
        panel.classList.add(success ? 'is-success' : 'is-error');
        if (allBoarded) panel.classList.add('is-all-boarded');
    }

    if (icon && typeof setExpeditionScanResultIconElement === 'function') {
        setExpeditionScanResultIconElement(icon, pending ? 'pending' : (success ? 'success' : 'error'));
    } else if (icon) {
        icon.textContent = pending ? '…' : (success ? '✓' : '✕');
    }
    if (title) {
        if (pending) title.textContent = 'Aguarde';
        else if (success && allBoarded) title.textContent = 'Embarque finalizado';
        else if (success) title.textContent = 'Embarcado';
        else title.textContent = 'Erro';
    }
    msg.textContent = message || '';

    const actionBtnPrimary = 'expedition-boarding-scan-result-btn expedition-boarding-scan-result-btn--primary';
    const actionBtnSecondary = 'expedition-boarding-scan-result-btn expedition-boarding-scan-result-btn--secondary';

    if (pending) {
        actions.innerHTML = '';
        return;
    }

    if (typeof playExpeditionScanFeedbackSound === 'function') {
        playExpeditionScanFeedbackSound(success ? 'success' : 'error');
    }

    if (allBoarded) {
        actions.innerHTML = `
            <button type="button" id="expedition-boarding-scan-close-all"
                class="${actionBtnPrimary} w-full">Fechar</button>
        `;
        actions.querySelector('#expedition-boarding-scan-close-all')?.addEventListener('click', () => {
            void closeExpedicaoBoardingScanModalAfterComplete();
        });
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([100, 60, 100, 60, 120]);
        }
        return;
    }

    actions.innerHTML = `
        <button type="button" id="expedition-boarding-scan-next"
            class="${actionBtnPrimary} w-full">${success ? 'Próximo volume' : 'Tentar de novo'}</button>
        <button type="button" id="expedition-boarding-scan-dismiss"
            class="${actionBtnSecondary} w-full">Fechar leitura</button>
    `;

    actions.querySelector('#expedition-boarding-scan-next')?.addEventListener('click', () => {
        clearExpeditionBoardingScanAutoResumeTimer();
        hideExpedicaoBoardingScanResult();
        void resumeExpedicaoBoardingScanner();
    });
    actions.querySelector('#expedition-boarding-scan-dismiss')?.addEventListener('click', () => {
        void closeExpedicaoBoardingScanModal(true);
    });

    if (!allBoarded) {
        scheduleExpedicaoBoardingScanResume(success ? 5000 : 6000);
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(success ? [80, 40, 80] : [200, 80, 200]);
    }
}

function normalizeExpeditionVolumeScanText(raw) {
    return String(raw || '')
        .trim()
        .replace(/\u0000/g, '')
        .replace(/\s+/g, '')
        .toUpperCase();
}

function clearExpeditionBoardingScanAutoResumeTimer() {
    if (window.__expeditionBoardingScanAutoResumeTimer) {
        clearTimeout(window.__expeditionBoardingScanAutoResumeTimer);
        window.__expeditionBoardingScanAutoResumeTimer = null;
    }
}

function scheduleExpedicaoBoardingScanResume(delayMs = 1800) {
    clearExpeditionBoardingScanAutoResumeTimer();
    if (!isExpeditionBoardingScanModalOpen()) return;
    window.__expeditionBoardingScanAutoResumeTimer = setTimeout(() => {
        window.__expeditionBoardingScanAutoResumeTimer = null;
        hideExpedicaoBoardingScanResult();
        void resumeExpedicaoBoardingScanner();
    }, delayMs);
}

function setExpedicaoBoardingScanHintActive(active) {
    const hint = document.getElementById('expedition-boarding-scan-hint');
    if (hint) hint.classList.toggle('hidden', !active);
}

function buildExpeditionBoardingScannerConfig() {
    const config = {
        fps: 15,
        disableFlip: true,
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
        },
        videoConstraints: {
            facingMode: { ideal: 'environment' },
            width: { min: 640, ideal: 1280 },
            height: { min: 360, ideal: 720 }
        },
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            const width = Math.floor(Math.min(viewfinderWidth * 0.94, 480));
            const height = Math.floor(Math.min(Math.max(viewfinderHeight * 0.3, 76), 150));
            return {
                width: Math.max(width, 220),
                height: Math.max(height, 72)
            };
        }
    };

    if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
        config.formatsToSupport = [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39
        ];
    }

    return config;
}

async function stopExpedicaoBoardingScanner(options = {}) {
    if (!expedicaoBoardingScanner) return;

    if (expedicaoBoardingScannerRunning) {
        try {
            await expedicaoBoardingScanner.stop();
        } catch (error) {
            console.warn('stopExpedicaoBoardingScanner:', error);
        }
        expedicaoBoardingScannerRunning = false;
    }

    if (options.clearReader) {
        try {
            expedicaoBoardingScanner.clear();
        } catch (error) {
            console.warn('clearExpedicaoBoardingScanner:', error);
        }
        clearExpedicaoBoardingReaderDom();
    }

    setExpedicaoBoardingScanHintActive(false);
}

async function resumeExpedicaoBoardingScanner() {
    if (!expedicaoBoardingScanner || expedicaoBoardingScannerRunning) return;

    const config = buildExpeditionBoardingScannerConfig();
    const onDecode = decodedText => { void handleExpedicaoBoardingScanDecoded(decodedText); };
    const onDecodeError = () => {};

    try {
        await expedicaoBoardingScanner.start(
            { facingMode: { ideal: 'environment' } },
            config,
            onDecode,
            onDecodeError
        );
    } catch (firstError) {
        console.warn('resumeExpedicaoBoardingScanner (config completa):', firstError);
        const fallbackConfig = { ...config };
        delete fallbackConfig.videoConstraints;
        try {
            await expedicaoBoardingScanner.start(
                { facingMode: 'environment' },
                fallbackConfig,
                onDecode,
                onDecodeError
            );
        } catch (secondError) {
            console.error('resumeExpedicaoBoardingScanner:', secondError);
            alertAppDialog(
                'Não foi possível usar a câmera. Use “Ou digite o código” abaixo. '
                + 'No celular, prefira HTTPS ou localhost para a câmera funcionar.'
            );
            return;
        }
    }

    expedicaoBoardingScannerRunning = true;
    setExpedicaoBoardingScanHintActive(true);
}

let expedicaoBoardingScanLock = false;

async function handleExpedicaoBoardingScanDecoded(decodedText) {
    if (expedicaoBoardingScanLock) return;
    expedicaoBoardingScanLock = true;
    await stopExpedicaoBoardingScanner({ clearReader: true });
    showExpedicaoBoardingScanResult({
        success: true,
        pending: true,
        message: 'Conferindo volume...'
    });
    await processExpedicaoBoardingScanCode(decodedText, { fromScanner: true });
    expedicaoBoardingScanLock = false;
}

async function processExpedicaoBoardingScanCode(rawCode, options = {}) {
    const code = normalizeExpeditionVolumeScanText(rawCode);
    if (!code) {
        feedbackExpedicaoBoardingCodeResult({
            success: false,
            message: 'Informe ou leia um código de volume.'
        }, options);
        return;
    }

    if (!expedicaoBoardingRouteId) {
        feedbackExpedicaoBoardingCodeResult({
            success: false,
            message: 'Nenhuma rota de embarque ativa.'
        }, options);
        return;
    }

    const useScanOverlay = options.fromScanner || isExpeditionBoardingScanModalOpen();
    if (!useScanOverlay) {
        setExpedicaoActionLoading(true, 'Conferindo volume...');
    }
    try {
        const volume = await lookupExpeditionVolumeByCode(code);

        if (!volume) {
            feedbackExpedicaoBoardingCodeResult({
                success: false,
                message: `Código "${code}" não encontrado.`
            }, options);
            return;
        }

        if (Number(volume.routeId) !== Number(expedicaoBoardingRouteId)) {
            feedbackExpedicaoBoardingCodeResult({
                success: false,
                message: `Volume de outra rota (#${volume.routeId}). Este embarque é da rota #${expedicaoBoardingRouteId}.`
            }, options);
            return;
        }

        if (volume.boardedAt) {
            feedbackExpedicaoBoardingCodeResult({
                success: false,
                message: `Volume ${volume.volumeCode} já foi embarcado.`
            }, options);
            return;
        }

        await markExpeditionVolumeBoarded(volume.id);
        await promoteExpeditionRouteBoardingStarted(expedicaoBoardingRouteId);
        applyLocalBoardedVolume(volume.id);

        try {
            await refreshExpedicaoBoardingDetail();
        } catch (refreshError) {
            console.warn('refreshExpedicaoBoardingDetail após leitura:', refreshError);
        }

        const routeVolumes = expedicaoBoardingDetail?.volumes || [];
        const boardedNow = expedicaoBoardingDetail?.boardedCount
            ?? countExpeditionBoardedVolumes(routeVolumes);
        const total = expedicaoBoardingDetail?.totalCount || routeVolumes.length;
        const allBoarded = total > 0 && boardedNow >= total;

        if (allBoarded) {
            await finishExpeditionBoardingRouteFeedback(routeVolumes, options);
            return;
        }

        feedbackExpedicaoBoardingCodeResult({
            success: true,
            message: `Volume ${volume.volumeCode} embarcado com sucesso.`
        }, options);
    } catch (error) {
        console.error('processExpedicaoBoardingScanCode:', error);
        feedbackExpedicaoBoardingCodeResult({
            success: false,
            message: error.message || 'Erro ao embarcar volume.'
        }, options);
    } finally {
        if (!useScanOverlay) {
            setExpedicaoActionLoading(false);
        }
    }
}

async function openExpedicaoBoardingScanModal() {
    const modal = document.getElementById('expedition-boarding-scan-modal');
    if (!modal) {
        alertAppDialog('Tela de leitura não carregada. Atualize a página.');
        return;
    }

    if (expedicaoBoardingDetail?.boardedCount >= expedicaoBoardingDetail?.totalCount) {
        alertAppDialog('Todos os volumes desta rota já foram embarcados.', { variant: 'success' });
        return;
    }

    hideExpedicaoBoardingScanResult();
    setExpedicaoBoardingScanCameraLayerHidden(false);
    modal.classList.remove('hidden');
    if (typeof primeExpeditionScanFeedbackAudio === 'function') {
        primeExpeditionScanFeedbackAudio();
    }

    try {
        await loadHtml5QrcodeLibrary();
        const readerId = 'expedition-boarding-reader';
        if (expedicaoBoardingScanner) {
            await stopExpedicaoBoardingScanner({ clearReader: true });
        }
        expedicaoBoardingScanner = new Html5Qrcode(readerId);
        await resumeExpedicaoBoardingScanner();
    } catch (error) {
        console.error('openExpedicaoBoardingScanModal:', error);
        alertAppDialog(error.message || 'Erro ao abrir câmera.');
    }
}

async function closeExpedicaoBoardingScanModalAfterComplete() {
    hideExpedicaoBoardingScanResult();
    await stopExpedicaoBoardingScanner({ clearReader: true });
    setExpedicaoBoardingScanCameraLayerHidden(false);
    document.getElementById('expedition-boarding-scan-modal')?.classList.add('hidden');
    expedicaoBoardingView = 'list';
    expedicaoBoardingRouteId = null;
    expedicaoBoardingDetail = null;
    await loadExpedicaoBoardingList();
}

async function closeExpedicaoBoardingScanModal(refreshList = false) {
    hideExpedicaoBoardingScanResult();
    await stopExpedicaoBoardingScanner({ clearReader: true });
    setExpedicaoBoardingScanCameraLayerHidden(false);
    document.getElementById('expedition-boarding-scan-modal')?.classList.add('hidden');

    if (refreshList) {
        try {
            await refreshExpedicaoBoardingDetail();
        } catch (refreshError) {
            console.warn('closeExpedicaoBoardingScanModal refresh:', refreshError);
        }
        if (expedicaoBoardingDetail?.boardedCount >= expedicaoBoardingDetail?.totalCount) {
            await closeExpedicaoBoardingScanModalAfterComplete();
            return;
        }
    }
}

function bindExpedicaoBoardingEvents() {
    const closeScan = () => void closeExpedicaoBoardingScanModal(true);

    document.getElementById('btn-expedition-boarding-scan-close')?.addEventListener('click', closeScan);
    document.getElementById('btn-expedition-boarding-scan-close-top')?.addEventListener('click', closeScan);

    const submitManualScan = () => {
        const value = document.getElementById('expedition-boarding-scan-manual')?.value;
        void processExpedicaoBoardingScanCode(value, { fromScanner: true });
    };
    document.getElementById('expedition-boarding-scan-manual-btn')?.addEventListener('click', submitManualScan);
    document.getElementById('expedition-boarding-scan-manual')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') submitManualScan();
    });
}

window.loadExpeditionHtml5QrcodeLibrary = loadHtml5QrcodeLibrary;

async function releaseExpeditionBarcodeCameraFromBoarding() {
    await stopExpedicaoBoardingScanner({ clearReader: true });
    hideExpedicaoBoardingScanResult();
    setExpedicaoBoardingScanCameraLayerHidden(false);
    document.getElementById('expedition-boarding-scan-modal')?.classList.add('hidden');
    expedicaoBoardingScanner = null;
}

window.releaseExpeditionBarcodeCameraFromBoarding = releaseExpeditionBarcodeCameraFromBoarding;
window.loadExpedicaoBoardingList = loadExpedicaoBoardingList;
window.openExpedicaoBoardingRoute = openExpedicaoBoardingRoute;
window.bindExpedicaoBoardingEvents = bindExpedicaoBoardingEvents;