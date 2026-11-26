const EXPEDITION_UNLOADING_LIST_STATUSES = ['Boarded', 'UnloadingStarted'];
const EXPEDITION_UNLOADING_SESSION_STATUSES = [
    ...EXPEDITION_UNLOADING_LIST_STATUSES,
    'UnloadingFinished'
];

let expedicaoUnloadingView = 'list';
let expedicaoUnloadingRouteId = null;
let expedicaoUnloadingDetail = null;
let expedicaoUnloadingCurrentStopId = null;
let expedicaoUnloadingScanner = null;
let expedicaoUnloadingScannerRunning = false;
let expedicaoUnloadingScanLock = false;

function expeditionUnloadingSqlHint() {
    return 'Execute `supabase/feats/expedition-volume-unloading.sql` no Supabase SQL Editor (DEV).';
}

function isExpeditionUnloadingSchemaError(error) {
    const message = String(error?.message || '');
    return /unloadedAt|unloadedById|schema cache|column/i.test(message);
}

function resolveExpeditionUnloadingVendorUrl(fileName) {
    const bootstrap = document.querySelector('script[src*="bootstrap.js"]');
    const base = bootstrap?.src
        ? bootstrap.src.replace(/\/js\/bootstrap\.js(\?.*)?$/, '')
        : `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}`;
    const version = typeof APP_CACHE_VERSION !== 'undefined' ? APP_CACHE_VERSION : Date.now();
    return `${base}/js/vendor/${fileName}?v=${encodeURIComponent(version)}`;
}

async function loadExpeditionUnloadingHtml5Qrcode() {
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
        script.src = resolveExpeditionUnloadingVendorUrl('html5-qrcode.min.js');
        script.async = true;
        script.onload = () => resolve(window.Html5Qrcode);
        script.onerror = () => reject(new Error('Não foi possível carregar o leitor de código de barras.'));
        document.head.appendChild(script);
    });

    return window.__expeditionHtml5QrcodePromise;
}

function countExpeditionUnloadedVolumes(volumes = []) {
    return (volumes || []).filter(vol => vol?.unloadedAt).length;
}

function groupExpeditionUnloadingStops(volumes = []) {
    const stopsMap = new Map();

    (volumes || []).forEach(vol => {
        const stop = vol.stopItem?.stop;
        const stopKey = Number(stop?.id);
        if (!stopKey) return;
        if (!stopsMap.has(stopKey)) {
            stopsMap.set(stopKey, {
                stopId: stopKey,
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

function countBoardedVolumes(volumes = []) {
    return (volumes || []).filter(vol => vol?.boardedAt).length;
}

function stopUnloadingPending(stop) {
    const vols = stop?.volumes || [];
    return vols.filter(vol => vol.boardedAt && !vol.unloadedAt);
}

function findNextUnloadingStop(stops = []) {
    if (typeof findNextExpeditionUnloadingStop === 'function') {
        return findNextExpeditionUnloadingStop(stops);
    }
    return (stops || []).find(stop => stopUnloadingPending(stop).length > 0) || null;
}

function getExpeditionUnloadingCurrentStop() {
    const stops = expedicaoUnloadingDetail?.stops || [];
    if (!expedicaoUnloadingCurrentStopId) return null;
    return stops.find(stop => Number(stop.stopId) === Number(expedicaoUnloadingCurrentStopId)) || null;
}

function buildExpeditionUnloadingNextStopSummary(volumes = [], pickupItems = []) {
    const groupFn = typeof groupExpeditionUnloadingStopsFromVolumesAndPickups === 'function'
        ? groupExpeditionUnloadingStopsFromVolumesAndPickups
        : groupExpeditionUnloadingStops;
    const stops = groupFn(volumes, pickupItems);
    const next = findNextUnloadingStop(stops);
    if (!next) {
        return {
            stopIndex: null,
            totalStops: stops.length,
            address: '',
            completed: stops.length > 0
        };
    }
    const stopIndex = stops.findIndex(stop => Number(stop.stopId) === Number(next.stopId)) + 1;
    const address = typeof formatExpeditionAddressOneLine === 'function'
        ? formatExpeditionAddressOneLine(next.addr)
        : '';
    return {
        stopIndex,
        totalStops: stops.length,
        address: address || '',
        completed: false
    };
}

function formatExpeditionUnloadingNextStopListLabel(summary) {
    if (!summary) return '—';
    if (summary.completed || !summary.stopIndex) {
        return summary.totalStops ? 'Concluído' : '—';
    }
    const address = String(summary.address || '').trim();
    const head = `Parada ${summary.stopIndex} de ${summary.totalStops}`;
    return address ? `${head} · ${address}` : head;
}

async function fetchExpeditionPickupStopItemsForRoutes(routeIds = []) {
    const keys = [...new Set((routeIds || []).map(id => Number(id)).filter(Boolean))];
    if (!keys.length) return [];

    const stopEmbedInner = 'stop:ExpeditionRouteStop!inner(id, routeId, sortOrder, addrSnapshot)';
    const selects = [
        `id, entityType, pickupUnloadedAt, stopId, routeId, ${stopEmbedInner}`,
        `id, entityType, pickupUnloadedAt, stopId, ${stopEmbedInner}`
    ];

    let lastError = null;
    for (const select of selects) {
        const result = await supabaseClient
            .from('ExpeditionRouteStopItem')
            .select(select)
            .eq('entityType', 'Pickup')
            .in('stop.routeId', keys);
        if (!result.error) return result.data || [];
        lastError = result.error;
        if (!/relationship|routeId|schema cache|pickupUnloaded/i.test(result.error.message || '')) {
            throw result.error;
        }
    }

    if (lastError && typeof isExpeditionPickupSchemaError === 'function' && isExpeditionPickupSchemaError(lastError)) {
        return [];
    }
    if (lastError) console.warn('fetchExpeditionPickupStopItemsForRoutes:', lastError);
    return [];
}

async function fetchExpeditionVolumesForRoutes(routeIds = []) {
    const keys = [...new Set((routeIds || []).map(id => Number(id)).filter(Boolean))];
    if (!keys.length) return [];

    const select = `
        id, routeId, boardedAt, unloadedAt,
        stopItem:ExpeditionRouteStopItem(
            id,
            stop:ExpeditionRouteStop(id, sortOrder, addrSnapshot)
        )
    `;

    const { data, error } = await supabaseClient
        .from('ExpeditionVolume')
        .select(select)
        .in('routeId', keys);

    if (error) {
        if (typeof isExpeditionTablesMissingError === 'function' && isExpeditionTablesMissingError(error)) {
            return [];
        }
        throw error;
    }
    return data || [];
}

async function enrichExpeditionUnloadingRoutesWithNextStop(rows = []) {
    const routeIds = (rows || []).map(row => Number(row.id)).filter(Boolean);
    if (!routeIds.length) return rows || [];

    const [volumes, pickupItems] = await Promise.all([
        fetchExpeditionVolumesForRoutes(routeIds),
        fetchExpeditionPickupStopItemsForRoutes(routeIds)
    ]);

    const volumesByRoute = new Map();
    (volumes || []).forEach(vol => {
        const key = Number(vol.routeId);
        if (!volumesByRoute.has(key)) volumesByRoute.set(key, []);
        volumesByRoute.get(key).push(vol);
    });

    const pickupsByRoute = new Map();
    (pickupItems || []).forEach(item => {
        const key = Number(item.routeId || item.stop?.routeId);
        if (!key) return;
        if (!pickupsByRoute.has(key)) pickupsByRoute.set(key, []);
        pickupsByRoute.get(key).push(item);
    });

    return (rows || []).map(row => ({
        ...row,
        nextStopSummary: buildExpeditionUnloadingNextStopSummary(
            volumesByRoute.get(Number(row.id)) || [],
            pickupsByRoute.get(Number(row.id)) || []
        )
    }));
}

async function fetchExpeditionUnloadingRoutes() {
    if (typeof fetchExpeditionRoutesForUi === 'function') {
        return fetchExpeditionRoutesForUi({
            limit: 80,
            filterByLoggedResponsibleUnlessAdmin: true,
            extraQuery: query => query.in('status', EXPEDITION_UNLOADING_LIST_STATUSES)
        });
    }

    let query = supabaseClient
        .from('ExpeditionRoute')
        .select('id, routeDate, vehicleLabel, driverName, status, mapsUrl, updatedAt')
        .in('status', EXPEDITION_UNLOADING_LIST_STATUSES);
    const responsibleUserId = typeof getExpeditionRoutesResponsibleFilterUserId === 'function'
        ? getExpeditionRoutesResponsibleFilterUserId({ filterByLoggedResponsibleUnlessAdmin: true })
        : null;
    if (responsibleUserId) {
        query = query.eq('responsibleUserId', responsibleUserId);
    }
    const { data, error } = await query
        .order('routeDate', { ascending: false })
        .order('id', { ascending: false })
        .limit(80);

    if (error) throw error;
    return data || [];
}

async function fetchExpeditionUnloadingRouteDetail(routeId, options = {}) {
    const key = Number(routeId);
    if (!key) throw new Error('Rota inválida.');

    const route = typeof fetchExpeditionRouteById === 'function'
        ? await fetchExpeditionRouteById(key, 'mapsUrl')
        : null;
    if (!route) throw new Error('Rota não encontrada.');
    if (typeof ensureCurrentUserCanAccessExpeditionRoute === 'function') {
        ensureCurrentUserCanAccessExpeditionRoute(route, { filterByLoggedResponsibleUnlessAdmin: true });
    }

    const inActiveSession = Number(key) === Number(expedicaoUnloadingRouteId);
    const allowFinished = options.includeFinishedStatus || inActiveSession;
    const allowedStatuses = allowFinished
        ? EXPEDITION_UNLOADING_SESSION_STATUSES
        : EXPEDITION_UNLOADING_LIST_STATUSES;
    if (!allowedStatuses.includes(route.status)) {
        throw new Error('Esta rota não está disponível para desembarque.');
    }

    const volumes = await fetchExpeditionRouteVolumes(key);
    const pickupItems = typeof fetchExpeditionRoutePickupStopItems === 'function'
        ? await fetchExpeditionRoutePickupStopItems(key)
        : [];

    if (!volumes.length && !pickupItems.length) throw new Error('Rota sem paradas.');

    if (volumes.length) {
        const boarded = countBoardedVolumes(volumes);
        if (boarded < volumes.length) {
            throw new Error('Conclua o embarque de todos os volumes antes do desembarque.');
        }
    }

    const stops = typeof groupExpeditionUnloadingStopsFromVolumesAndPickups === 'function'
        ? groupExpeditionUnloadingStopsFromVolumesAndPickups(volumes, pickupItems)
        : groupExpeditionUnloadingStops(volumes);

    const pickupDone = pickupItems.filter(item => item.pickupUnloadedAt).length;

    return {
        route,
        volumes,
        pickupItems,
        stops,
        unloadedCount: countExpeditionUnloadedVolumes(volumes) + pickupDone,
        totalCount: volumes.length + pickupItems.length
    };
}

async function promoteExpeditionRouteUnloadingStarted(routeId) {
    const key = Number(routeId);
    const { data: route } = await supabaseClient
        .from('ExpeditionRoute')
        .select('status')
        .eq('id', key)
        .maybeSingle();

    if (!route || route.status !== 'Boarded') return;

    const now = new Date().toISOString();
    await supabaseClient
        .from('ExpeditionRoute')
        .update({ status: 'UnloadingStarted', updatedAt: now })
        .eq('id', key);
}

async function tryCompleteExpeditionRouteUnloading(routeId, volumes) {
    const pickups = expedicaoUnloadingDetail?.pickupItems || [];
    const pickupPending = pickups.filter(item => !item.pickupUnloadedAt).length;
    const total = volumes?.length || 0;
    const unloaded = countExpeditionUnloadedVolumes(volumes);
    if (pickupPending > 0) return false;
    if (total && unloaded < total) return false;
    if (!total && !pickups.length) return false;

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('ExpeditionRoute')
        .update({ status: 'UnloadingFinished', updatedAt: now })
        .eq('id', Number(routeId));

    if (error) {
        console.warn('tryCompleteExpeditionRouteUnloading:', error);
        return false;
    }
    return true;
}

async function markExpeditionVolumeUnloaded(volumeId) {
    const key = Number(volumeId);
    const now = new Date().toISOString();
    const payload = {
        unloadedAt: now,
        unloadedById: currentUser?.id || null
    };

    let result = await supabaseClient
        .from('ExpeditionVolume')
        .update(payload)
        .eq('id', key)
        .select('id, routeId, volumeCode, unloadedAt, stopItemId')
        .single();

    if (result.error && isExpeditionUnloadingSchemaError(result.error)) {
        throw new Error(expeditionUnloadingSqlHint());
    }
    if (result.error) throw result.error;
    return result.data;
}

async function lookupExpeditionVolumeForUnloading(volumeCode) {
    const code = String(volumeCode || '').trim().toUpperCase();
    if (!code) return null;

    const select = `
        id, volumeCode, routeId, boardedAt, unloadedAt, volumeIndex, stopItemId,
        stopItem:ExpeditionRouteStopItem(
            id,
            stop:ExpeditionRouteStop(id, sortOrder, addrSnapshot)
        )
    `;

    let result = await supabaseClient
        .from('ExpeditionVolume')
        .select(select)
        .eq('volumeCode', code)
        .maybeSingle();

    if (result.error && /volumeCode/i.test(result.error.message || '')) {
        result = await supabaseClient
            .from('ExpeditionVolume')
            .select(select)
            .ilike('volumeCode', code)
            .maybeSingle();
    }

    if (result.error && isExpeditionUnloadingSchemaError(result.error)) {
        throw new Error(expeditionUnloadingSqlHint());
    }
    if (result.error) throw result.error;
    return result.data;
}

function renderExpeditionUnloadingNextStopHtml(summary) {
    const label = formatExpeditionUnloadingNextStopListLabel(summary);
    if (!summary || label === '—') {
        return '<span class="text-slate-400">—</span>';
    }
    if (summary.completed || !summary.stopIndex) {
        return `<span class="text-emerald-700 font-semibold">${escapeHtml(label)}</span>`;
    }
    const parts = label.split(' · ');
    const head = parts.shift() || label;
    const addr = parts.join(' · ');
    return `<span class="font-semibold text-indigo-900">${escapeHtml(head)}</span>${
        addr ? `<span class="text-slate-600"> · ${escapeHtml(addr)}</span>` : ''
    }`;
}

function renderExpeditionUnloadingList(mount, rows) {
    const renderActions = (row, mobile = false) => {
        const mapsBtn = row.mapsUrl
            ? `<a href="${escapeHtml(row.mapsUrl)}" target="_blank" rel="noopener noreferrer"
                class="text-xs font-semibold px-3 py-${mobile ? '2.5' : '1.5'} rounded-lg bg-white border border-slate-200 text-indigo-700 hover:bg-slate-50 text-center touch-manipulation">
                ${mobile && typeof renderExpeditionMobileBtnLabel === 'function' ? renderExpeditionMobileBtnLabel('maps', 'Google Maps') : 'Google Maps'}
            </a>`
            : `<span class="text-[10px] text-slate-400${mobile ? ' block text-center' : ''}">Sem rota Maps</span>`;
        const unloadBtnClass = mobile
            ? 'w-full text-xs bg-slate-900 text-white px-3 py-2.5 rounded-lg font-semibold'
            : 'text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold';
        return `
            <div class="${mobile ? 'flex flex-col gap-2 mt-3' : 'flex flex-wrap gap-1.5 items-center'}">
                <button type="button" class="expedicao-unloading-open-btn ${unloadBtnClass} touch-manipulation"
                    data-route-id="${row.id}">${mobile && typeof renderExpeditionMobileBtnLabel === 'function' ? renderExpeditionMobileBtnLabel('unloading', 'Desembarcar') : 'Desembarcar'}</button>
                ${mapsBtn}
            </div>
        `;
    };

    const cardsMobile = (rows || []).map(row => {
        const statusLabel = typeof formatExpeditionRouteStatus === 'function'
            ? formatExpeditionRouteStatus(row.status)
            : row.status;
        const dateLabel = row.routeDate && typeof formatDate === 'function'
            ? formatDate(row.routeDate)
            : '—';
        const routeLabel = typeof formatExpeditionRouteDisplayName === 'function'
            ? formatExpeditionRouteDisplayName(row)
            : (row.name || `Rota ${row.id}`);
        const nextStopHtml = renderExpeditionUnloadingNextStopHtml(row.nextStopSummary);
        return `
            <article class="md:hidden border border-slate-200 rounded-xl p-3 bg-white shadow-sm">
                <p class="text-xs font-bold text-slate-900">${escapeHtml(routeLabel)}</p>
                <p class="text-[11px] mt-1 leading-snug">Próxima parada: ${nextStopHtml}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(dateLabel)} · ${escapeHtml(statusLabel)}</p>
                ${typeof renderExpeditionRouteCrewMobile === 'function' ? renderExpeditionRouteCrewMobile(row) : ''}
                ${renderActions(row, true)}
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
        const routeLabel = typeof formatExpeditionRouteDisplayName === 'function'
            ? formatExpeditionRouteDisplayName(row)
            : (row.name || `Rota ${row.id}`);
        const nextStopHtml = renderExpeditionUnloadingNextStopHtml(row.nextStopSummary);
        return `
            <tr class="hover:bg-slate-50/80">
                <td class="p-3 text-xs whitespace-nowrap">${escapeHtml(dateLabel)}</td>
                <td class="p-3 text-xs">
                    <p class="font-semibold text-slate-800">${escapeHtml(routeLabel)}</p>
                    <p class="text-[10px] text-slate-500 mt-0.5"><span class="font-medium text-slate-600">Próxima:</span> ${nextStopHtml}</p>
                </td>
                <td class="p-3 text-xs">${escapeHtml(row.vehicleLabel || '—')}</td>
                <td class="p-3 text-xs">${escapeHtml(row.driverName || '—')}</td>
                <td class="p-3 text-xs">${typeof getExpeditionResponsibleLabel === 'function'
        ? escapeHtml(getExpeditionResponsibleLabel(row))
        : '—'}</td>
                <td class="p-3 text-xs">${escapeHtml(statusLabel)}</td>
                <td class="p-3 text-xs">${renderActions(row, false)}</td>
            </tr>
        `;
    }).join('');

    mount.innerHTML = `
        <div class="flex flex-col gap-4 min-h-[calc(100vh-140px)]">
            <div>
                <h2 class="text-lg font-bold text-slate-900">Desembarque</h2>
                <p class="text-xs text-slate-500 mt-1">Rotas totalmente embarcadas. Desembarque parada a parada na ordem da rota.</p>
            </div>
            <div class="md:hidden flex flex-col gap-2">${cardsMobile || '<p class="text-xs text-slate-400 text-center py-8">Nenhuma rota disponível.</p>'}</div>
            <div class="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                            <th class="p-3 font-semibold">Dia</th>
                            <th class="p-3 font-semibold">Nome</th>
                            <th class="p-3 font-semibold">Carro</th>
                            <th class="p-3 font-semibold">Motorista</th>
                            <th class="p-3 font-semibold">Responsável</th>
                            <th class="p-3 font-semibold">Status</th>
                            <th class="p-3 font-semibold">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${tableRows || '<tr><td colspan="7" class="p-8 text-center text-xs text-slate-400">Nenhuma rota disponível.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    mount.querySelectorAll('.expedicao-unloading-open-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            void openExpedicaoUnloadingRoute(Number(btn.dataset.routeId));
        });
    });
}

function renderExpeditionUnloadingStopView(mount, detail) {
    const { route, stops } = detail;
    const current = getExpeditionUnloadingCurrentStop();
    const totalStops = stops?.length || 0;
    const stopIndex = current
        ? (stops || []).findIndex(s => Number(s.stopId) === Number(current.stopId)) + 1
        : 0;

    if (!current) {
        mount.innerHTML = `
            <motion/>
        `.replace('<motion/>', `
            <div class="space-y-4 text-center py-10">
                <p class="text-sm font-semibold text-emerald-800">Desembarque desta rota já foi concluído.</p>
                <button type="button" id="expedicao-unloading-back"
                    class="text-xs bg-slate-900 text-white px-4 py-2.5 rounded-lg font-semibold">Voltar à lista</button>
            </div>
        `);
        mount.querySelector('#expedicao-unloading-back')?.addEventListener('click', () => void loadExpedicaoUnloadingList());
        return;
    }

    const pending = stopUnloadingPending(current);
    const pickupItems = current.pickupItems || [];
    const pendingPickups = pickupItems.filter(item => !item.pickupUnloadedAt);
    const doneAtStop = (current.volumes || []).length - pending.length;
    const totalAtStop = (current.volumes || []).length;
    const pickupDoneAtStop = pickupItems.length - pendingPickups.length;
    const addr = typeof formatExpeditionAddressOneLine === 'function'
        ? formatExpeditionAddressOneLine(current.addr)
        : '';
    const dateLabel = route.routeDate && typeof formatDate === 'function'
        ? formatDate(route.routeDate)
        : '—';
    const statusLabel = typeof formatExpeditionRouteStatus === 'function'
        ? formatExpeditionRouteStatus(route.status)
        : route.status;

    const volsHtml = (current.volumes || []).map(vol => {
        const unloaded = Boolean(vol.unloadedAt);
        return `
            <li class="flex justify-between gap-2 text-[11px] py-1.5 border-b border-slate-100 last:border-0">
                <span class="text-slate-700 truncate">${escapeHtml(vol.stopItem?.entityLabel || vol.volumeCode)} · ${escapeHtml(vol.volumeCode || '')}</span>
                <span class="font-semibold shrink-0 ${unloaded ? 'text-emerald-700' : 'text-amber-700'}">${unloaded ? 'Desembarcado' : 'Pendente'}</span>
            </li>
        `;
    }).join('');

    const pickupHtml = pickupItems.map(item => {
        const meta = item.metadataJson || {};
        const category = typeof formatExpeditionPickupCategoryLabel === 'function'
            ? formatExpeditionPickupCategoryLabel(meta.pickupCategory)
            : meta.pickupCategory;
        const done = Boolean(item.pickupUnloadedAt);
        return `
            <li class="text-[11px] py-2 border-b border-slate-100 last:border-0">
                <p class="font-semibold text-indigo-900">Coleta · ${escapeHtml(category || '—')}</p>
                <p class="text-slate-600 mt-0.5">Pedido ${escapeHtml(meta.orderCode || '—')} — ${escapeHtml(meta.description || '')}</p>
                <p class="font-semibold mt-1 ${done ? 'text-emerald-700' : 'text-amber-700'}">${done ? 'Foto registrada' : 'Aguardando foto no desembarque'}</p>
            </li>
        `;
    }).join('');

    const showVolumeScanner = pending.length > 0;
    const showPickupCapture = pendingPickups.length > 0;

    mount.innerHTML = `
        <div class="space-y-3 max-w-lg mx-auto w-full">
            <button type="button" id="expedicao-unloading-back"
                class="text-xs text-slate-500 hover:text-slate-800 font-medium">← Voltar à lista</button>
            <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="text-sm font-bold text-slate-900">${escapeHtml(typeof formatExpeditionRouteDisplayName === 'function'
            ? formatExpeditionRouteDisplayName(route)
            : `Rota ${route.id}`)} · ${escapeHtml(dateLabel)}</p>
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold md:hidden">${escapeHtml(statusLabel)}</span>
                </div>
                ${typeof renderExpeditionRouteCrewMobile === 'function' ? renderExpeditionRouteCrewMobile(route) : ''}
                ${typeof renderExpeditionRouteCrewDesktopLine === 'function' ? renderExpeditionRouteCrewDesktopLine(route) : ''}
                <p class="hidden md:block text-[10px] mt-1 text-slate-500">Status: ${escapeHtml(statusLabel)}</p>
            </div>
            <p class="text-xs font-bold text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                Parada ${stopIndex} de ${totalStops}
            </p>
            <motion/>
            ${totalAtStop ? `<p class="text-xs font-semibold text-slate-700">${doneAtStop} de ${totalAtStop} volumes desembarcados nesta parada</p>` : ''}
            ${totalAtStop ? `<ul class="bg-white border border-slate-200 rounded-xl p-2 max-h-40 overflow-y-auto">${volsHtml}</ul>` : ''}
            ${pickupItems.length ? `
                <div class="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
                    <p class="text-xs font-bold text-indigo-900 mb-1">Coleta nesta parada (${pickupDoneAtStop}/${pickupItems.length})</p>
                    <ul>${pickupHtml}</ul>
                </div>
            ` : ''}
            ${showPickupCapture ? `
                <div class="rounded-xl border border-indigo-300 bg-white p-3 space-y-2">
                    <p class="text-xs font-semibold text-indigo-900">Registre uma foto da coleta (obrigatório)</p>
                    <input type="file" id="expedition-unloading-pickup-photo" accept="image/*" capture="environment"
                        class="hidden">
                    <button type="button" id="expedition-unloading-pickup-take-photo"
                        class="w-full text-sm bg-white border border-indigo-300 text-indigo-900 px-4 py-3 rounded-xl font-bold min-h-[48px] touch-manipulation">
                        Tirar foto
                    </button>
                    <p id="expedition-unloading-pickup-photo-label" class="text-[10px] text-slate-500 text-center hidden"></p>
                    <button type="button" id="expedition-unloading-pickup-submit"
                        class="w-full text-sm bg-indigo-700 text-white px-4 py-3 rounded-xl font-bold min-h-[48px] touch-manipulation">
                        Enviar foto e concluir coleta
                    </button>
                </div>
            ` : ''}
            ${showVolumeScanner ? `
                <button type="button" id="expedicao-unloading-scan-btn"
                    class="w-full text-sm bg-slate-900 text-white px-4 py-3.5 rounded-xl font-bold min-h-[48px] touch-manipulation">
                    ${typeof renderExpeditionMobileBtnLabel === 'function' ? renderExpeditionMobileBtnLabel('barcode', 'Ler volume') : 'Ler volume'}
                </button>
            ` : ''}
        </div>
    `.replace('<motion/>', `
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Endereço da parada</p>
            <p class="text-xs text-slate-800 whitespace-pre-wrap mt-1">${escapeHtml(addr || '—')}</p>
        </div>
    `);
}

function bindExpeditionUnloadingStopEvents(mount) {
    mount.querySelector('#expedicao-unloading-back')?.addEventListener('click', () => {
        expedicaoUnloadingView = 'list';
        expedicaoUnloadingRouteId = null;
        expedicaoUnloadingDetail = null;
        expedicaoUnloadingCurrentStopId = null;
        void loadExpedicaoUnloadingList();
    });
    mount.querySelector('#expedicao-unloading-scan-btn')?.addEventListener('click', () => {
        void openExpedicaoUnloadingScanModal();
    });
    mount.querySelector('#expedition-unloading-pickup-take-photo')?.addEventListener('click', () => {
        document.getElementById('expedition-unloading-pickup-photo')?.click();
    });
    mount.querySelector('#expedition-unloading-pickup-photo')?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        const label = document.getElementById('expedition-unloading-pickup-photo-label');
        if (!label) return;
        if (!file) {
            label.textContent = '';
            label.classList.add('hidden');
            return;
        }
        label.textContent = file.name ? `Foto selecionada: ${file.name}` : 'Foto selecionada';
        label.classList.remove('hidden');
    });
    mount.querySelector('#expedition-unloading-pickup-submit')?.addEventListener('click', () => {
        void submitExpeditionUnloadingPickupPhoto();
    });
}

async function submitExpeditionUnloadingPickupPhoto() {
    const current = getExpeditionUnloadingCurrentStop();
    const pendingPickups = (current?.pickupItems || []).filter(item => !item.pickupUnloadedAt);
    if (!pendingPickups.length) {
        alertAppDialog('Não há coleta pendente nesta parada.');
        return;
    }

    const fileInput = document.getElementById('expedition-unloading-pickup-photo');
    const file = fileInput?.files?.[0];
    if (!file) {
        alertAppDialog('Selecione ou tire uma foto.');
        return;
    }

    const pickup = pendingPickups[0];
    const meta = pickup.metadataJson || {};
    const routeId = Number(expedicaoUnloadingRouteId);
    const stopId = Number(current?.stopId);

    setExpedicaoActionLoading(true, 'Enviando foto...');
    try {
        if (typeof primeGoogleDriveAppsScript === 'function') primeGoogleDriveAppsScript();
        if (typeof ensureGoogleDriveAppsScriptReady === 'function') {
            await ensureGoogleDriveAppsScriptReady();
        }
        await uploadExpeditionPickupPhoto(file, {
            stopItemId: pickup.id,
            orderId: meta.orderId,
            orderCode: meta.orderCode,
            routeId,
            stopId
        });
        await markExpeditionPickupUnloaded(pickup.id);
        pickup.pickupUnloadedAt = new Date().toISOString();

        await reloadExpeditionUnloadingDetail(false);
        const allDone = !(expedicaoUnloadingDetail?.stops || []).some(stop =>
            typeof expeditionStopHasUnloadingPending === 'function'
                ? expeditionStopHasUnloadingPending(stop)
                : stopUnloadingPending(stop).length > 0
        );

        if (allDone) {
            await finishExpeditionUnloadingRouteFeedback(expedicaoUnloadingDetail?.volumes || [], {});
            await refreshExpeditionUnloadingStopView(false);
            return;
        }

        const pendingAtStop = typeof expeditionStopHasUnloadingPending === 'function'
            ? expeditionStopHasUnloadingPending(getExpeditionUnloadingCurrentStop())
            : stopUnloadingPending(getExpeditionUnloadingCurrentStop()).length > 0;

        if (!pendingAtStop) {
            await refreshExpeditionUnloadingStopView(true);
            alertAppDialog('Coleta registrada. Avance para a próxima parada.', { variant: 'success' });
            return;
        }

        await refreshExpeditionUnloadingStopView(false);
        alertAppDialog('Foto da coleta enviada.', { variant: 'success' });
    } catch (error) {
        console.error('submitExpeditionUnloadingPickupPhoto:', error);
        alertAppDialog(error.message || 'Erro ao enviar foto da coleta.');
    } finally {
        setExpedicaoActionLoading(false);
    }
}

function applyLocalUnloadedVolume(volumeId) {
    const key = Number(volumeId);
    if (!key || !expedicaoUnloadingDetail?.volumes) return;
    const now = new Date().toISOString();
    expedicaoUnloadingDetail.volumes.forEach(vol => {
        if (Number(vol.id) === key && !vol.unloadedAt) vol.unloadedAt = now;
    });
    (expedicaoUnloadingDetail.stops || []).forEach(stop => {
        (stop.volumes || []).forEach(vol => {
            if (Number(vol.id) === key && !vol.unloadedAt) vol.unloadedAt = now;
        });
    });
}

async function finishExpeditionUnloadingRouteFeedback(routeVolumes, options) {
    await tryCompleteExpeditionRouteUnloading(expedicaoUnloadingRouteId, routeVolumes);
    if (expedicaoUnloadingDetail?.route) {
        expedicaoUnloadingDetail.route.status = 'UnloadingFinished';
    }
    expedicaoUnloadingCurrentStopId = null;
    feedbackExpedicaoUnloadingCodeResult({
        success: true,
        message: buildExpeditionUnloadingRouteCompleteMessage(),
        routeComplete: true
    }, options);
}

async function reloadExpeditionUnloadingDetail(advanceStop = true) {
    if (!expedicaoUnloadingRouteId) return;
    expedicaoUnloadingDetail = await fetchExpeditionUnloadingRouteDetail(expedicaoUnloadingRouteId, {
        includeFinishedStatus: true
    });
    if (advanceStop) {
        const next = findNextUnloadingStop(expedicaoUnloadingDetail.stops);
        expedicaoUnloadingCurrentStopId = next ? next.stopId : null;
    }
}

async function refreshExpeditionUnloadingStopView(advanceStop = true) {
    await reloadExpeditionUnloadingDetail(advanceStop);
    const mount = document.getElementById('expedicao-content');
    if (mount && expedicaoUnloadingView === 'stop') {
        renderExpeditionUnloadingStopView(mount, expedicaoUnloadingDetail);
        bindExpeditionUnloadingStopEvents(mount);
    }
}

async function openExpedicaoUnloadingRoute(routeId) {
    const key = Number(routeId);
    if (!key) return;

    setExpedicaoActionLoading(true, 'Carregando rota...');
    try {
        expedicaoUnloadingDetail = await fetchExpeditionUnloadingRouteDetail(key);
        const next = findNextUnloadingStop(expedicaoUnloadingDetail.stops);
        if (!next) {
            alertAppDialog('Não há paradas pendentes de desembarque nesta rota.', { variant: 'warning' });
            return;
        }

        expedicaoUnloadingRouteId = key;
        expedicaoUnloadingCurrentStopId = next.stopId;
        expedicaoUnloadingView = 'stop';

        await promoteExpeditionRouteUnloadingStarted(key);
        if (expedicaoUnloadingDetail.route.status === 'Boarded') {
            expedicaoUnloadingDetail.route.status = 'UnloadingStarted';
        }

        const mount = document.getElementById('expedicao-content');
        if (!mount) return;
        renderExpeditionUnloadingStopView(mount, expedicaoUnloadingDetail);
        bindExpeditionUnloadingStopEvents(mount);
    } catch (error) {
        console.error('openExpedicaoUnloadingRoute:', error);
        alertAppDialog(error.message || 'Erro ao abrir desembarque.');
    } finally {
        setExpedicaoActionLoading(false);
    }
}

async function loadExpedicaoUnloadingList() {
    const mount = document.getElementById('expedicao-content');
    if (!mount) return;

    expedicaoUnloadingView = 'list';
    expedicaoUnloadingRouteId = null;
    expedicaoUnloadingDetail = null;
    expedicaoUnloadingCurrentStopId = null;

    setExpedicaoActionLoading(true, 'Carregando desembarque...');
    try {
        const rows = await enrichExpeditionUnloadingRoutesWithNextStop(
            await fetchExpeditionUnloadingRoutes()
        );
        renderExpeditionUnloadingList(mount, rows);
    } catch (error) {
        console.error('loadExpedicaoUnloadingList:', error);
        if (typeof isExpeditionTablesMissingError === 'function' && isExpeditionTablesMissingError(error)) {
            mount.innerHTML = `<p class="text-xs text-amber-700 text-center py-8">${escapeHtml(expeditionSqlHint())}</p>`;
            return;
        }
        mount.innerHTML = `<p class="text-xs text-red-600 text-center py-8">${escapeHtml(error.message)}</p>`;
    } finally {
        setExpedicaoActionLoading(false);
    }
}

function isExpeditionUnloadingScanModalOpen() {
    const modal = document.getElementById('expedition-unloading-scan-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

function hideExpedicaoUnloadingScanResult() {
    clearExpeditionUnloadingScanAutoResumeTimer();
    const panel = document.getElementById('expedition-unloading-scan-result');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.classList.remove('is-success', 'is-error', 'is-pending', 'is-all-boarded', 'is-stop-done');
    setExpeditionScanModalFeedbackActive('expedition-unloading-scan-modal', false);
    if (isExpeditionUnloadingScanModalOpen()) {
        setExpeditionUnloadingScanCameraLayerHidden(false);
    }
}

function clearExpeditionUnloadingScanAutoResumeTimer() {
    if (window.__expeditionUnloadingScanAutoResumeTimer) {
        clearTimeout(window.__expeditionUnloadingScanAutoResumeTimer);
        window.__expeditionUnloadingScanAutoResumeTimer = null;
    }
}

function scheduleExpeditionUnloadingScanResume(delayMs = 1800) {
    clearExpeditionUnloadingScanAutoResumeTimer();
    if (!isExpeditionUnloadingScanModalOpen()) return;
    window.__expeditionUnloadingScanAutoResumeTimer = setTimeout(() => {
        window.__expeditionUnloadingScanAutoResumeTimer = null;
        hideExpedicaoUnloadingScanResult();
        void restartExpedicaoUnloadingScanner();
    }, delayMs);
}

function setExpeditionUnloadingScanCameraLayerHidden(hidden) {
    const wrap = document.getElementById('expedition-unloading-scan-camera-wrap');
    const footer = document.getElementById('expedition-unloading-scan-footer');
    if (wrap) wrap.classList.toggle('hidden', hidden);
    if (footer) footer.classList.toggle('hidden', hidden);
}

function ensureExpeditionUnloadingReaderElement() {
    const wrap = document.getElementById('expedition-unloading-scan-camera-wrap');
    if (!wrap) return null;

    let reader = document.getElementById('expedition-unloading-reader');
    if (!reader) {
        reader = document.createElement('div');
        reader.id = 'expedition-unloading-reader';
        reader.className = 'w-full max-w-md expedition-boarding-reader';
        wrap.insertBefore(reader, wrap.firstChild);
    }
    reader.innerHTML = '';
    reader.classList.remove('hidden');
    return reader;
}

function clearExpeditionUnloadingReaderDom() {
    const reader = ensureExpeditionUnloadingReaderElement();
    if (reader) reader.innerHTML = '';
}

function waitExpeditionUnloadingScanLayout() {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

async function loadExpeditionUnloadingHtml5QrcodeLibrary() {
    if (typeof loadExpeditionHtml5QrcodeLibrary === 'function') {
        return loadExpeditionHtml5QrcodeLibrary();
    }
    return loadExpeditionUnloadingHtml5Qrcode();
}

function setExpeditionUnloadingScanHintActive(active) {
    const hint = document.getElementById('expedition-unloading-scan-hint');
    if (hint) hint.classList.toggle('hidden', !active);
}

function showExpedicaoUnloadingScanResult(options = {}) {
    const {
        success,
        message,
        pending = false,
        stopComplete = false,
        routeComplete = false
    } = options;

    const panel = document.getElementById('expedition-unloading-scan-result');
    const icon = document.getElementById('expedition-unloading-scan-result-icon');
    const title = document.getElementById('expedition-unloading-scan-result-title');
    const msg = document.getElementById('expedition-unloading-scan-result-msg');
    const actions = document.getElementById('expedition-unloading-scan-result-actions');
    if (!panel || !msg || !actions) return;

    setExpeditionUnloadingScanCameraLayerHidden(true);
    clearExpeditionUnloadingReaderDom();
    setExpeditionScanModalFeedbackActive('expedition-unloading-scan-modal', true);

    panel.classList.remove('hidden', 'is-success', 'is-error', 'is-pending', 'is-all-boarded', 'is-stop-done');
    if (pending) panel.classList.add('is-pending');
    else panel.classList.add(success ? 'is-success' : 'is-error');
    if (routeComplete) panel.classList.add('is-all-boarded');
    if (stopComplete) panel.classList.add('is-stop-done');

    if (icon && typeof setExpeditionScanResultIconElement === 'function') {
        setExpeditionScanResultIconElement(icon, pending ? 'pending' : (success ? 'success' : 'error'));
    } else if (icon) {
        icon.textContent = pending ? '…' : (success ? '✓' : '✕');
    }
    if (title) {
        if (pending) title.textContent = 'Aguarde';
        else if (routeComplete) title.textContent = 'Desembarque concluído';
        else if (stopComplete) title.textContent = 'Parada finalizada';
        else if (success) title.textContent = 'Desembarcado';
        else title.textContent = 'Erro';
    }
    msg.textContent = message || '';

    const btnPrimary = 'expedition-boarding-scan-result-btn expedition-boarding-scan-result-btn--primary';
    const btnSecondary = 'expedition-boarding-scan-result-btn expedition-boarding-scan-result-btn--secondary';

    if (pending) {
        actions.innerHTML = '';
        return;
    }

    if (typeof playExpeditionScanFeedbackSound === 'function') {
        playExpeditionScanFeedbackSound(success ? 'success' : 'error');
    }

    if (routeComplete) {
        actions.innerHTML = `
            <button type="button" id="expedition-unloading-scan-finish-route"
                class="${btnPrimary} w-full">Fechar</button>
        `;
        actions.querySelector('#expedition-unloading-scan-finish-route')?.addEventListener('click', () => {
            void closeExpedicaoUnloadingScanModalAfterRouteComplete();
        });
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([100, 60, 100, 60, 120]);
        }
        return;
    }

    if (stopComplete) {
        actions.innerHTML = `
            <button type="button" id="expedition-unloading-scan-next-stop"
                class="${btnPrimary} w-full">Próxima parada</button>
        `;
        actions.querySelector('#expedition-unloading-scan-next-stop')?.addEventListener('click', () => {
            clearExpeditionUnloadingScanAutoResumeTimer();
            void closeExpedicaoUnloadingScanModal(false);
            void refreshExpeditionUnloadingStopView();
        });
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([80, 40, 80]);
        }
        return;
    }

    actions.innerHTML = `
        <button type="button" id="expedition-unloading-scan-next"
            class="${btnPrimary} w-full">${success ? 'Próximo volume' : 'Tentar de novo'}</button>
        <button type="button" id="expedition-unloading-scan-dismiss"
            class="${btnSecondary} w-full">Fechar leitura</button>
    `;

    actions.querySelector('#expedition-unloading-scan-next')?.addEventListener('click', () => {
        clearExpeditionUnloadingScanAutoResumeTimer();
        void restartExpedicaoUnloadingScanner();
    });
    actions.querySelector('#expedition-unloading-scan-dismiss')?.addEventListener('click', () => {
        void closeExpedicaoUnloadingScanModal(true);
    });

    scheduleExpeditionUnloadingScanResume(success ? 5000 : 6000);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(success ? [80, 40, 80] : [200, 80, 200]);
    }
}

function normalizeExpeditionUnloadingScanText(raw) {
    return String(raw || '').trim().replace(/\u0000/g, '').replace(/\s+/g, '').toUpperCase();
}

function feedbackExpedicaoUnloadingCodeResult(options, scanOptions = {}) {
    const useScanOverlay = scanOptions.fromScanner || isExpeditionUnloadingScanModalOpen();
    if (useScanOverlay) {
        showExpedicaoUnloadingScanResult(options);
        return;
    }
    alertAppDialog(options.message || '', {
        variant: options.success ? 'success' : 'warning',
        title: options.success ? 'Desembarque' : 'Atenção'
    });
}

function buildExpeditionUnloadingStopCompleteMessage() {
    const current = getExpeditionUnloadingCurrentStop();
    const stops = expedicaoUnloadingDetail?.stops || [];
    const stopIndex = current
        ? stops.findIndex(s => Number(s.stopId) === Number(current.stopId)) + 1
        : 0;
    return `Todos os volumes da parada ${stopIndex} foram desembarcados.`;
}

function buildExpeditionUnloadingRouteCompleteMessage() {
    return 'Desembarque concluído. Todos os volumes de todas as paradas foram desembarcados.';
}

async function processExpedicaoUnloadingScanCode(rawCode, options = {}) {
    const code = normalizeExpeditionUnloadingScanText(rawCode);
    const useScanOverlay = options.fromScanner || isExpeditionUnloadingScanModalOpen();

    if (!code) {
        feedbackExpedicaoUnloadingCodeResult({
            success: false,
            message: 'Informe ou leia um código de volume.'
        }, options);
        return;
    }

    if (!expedicaoUnloadingRouteId || !expedicaoUnloadingCurrentStopId) {
        feedbackExpedicaoUnloadingCodeResult({
            success: false,
            message: 'Nenhuma parada de desembarque ativa.'
        }, options);
        return;
    }

    if (!useScanOverlay) setExpedicaoActionLoading(true, 'Conferindo volume...');

    try {
        const volume = await lookupExpeditionVolumeForUnloading(code);

        if (!volume) {
            feedbackExpedicaoUnloadingCodeResult({
                success: false,
                message: `Código "${code}" não encontrado.`
            }, options);
            return;
        }

        if (Number(volume.routeId) !== Number(expedicaoUnloadingRouteId)) {
            feedbackExpedicaoUnloadingCodeResult({
                success: false,
                message: 'Volume de outra rota.'
            }, options);
            return;
        }

        const volumeStopId = Number(volume.stopItem?.stop?.id);
        if (volumeStopId !== Number(expedicaoUnloadingCurrentStopId)) {
            const stops = expedicaoUnloadingDetail?.stops || [];
            const currentIdx = stops.findIndex(s => Number(s.stopId) === Number(expedicaoUnloadingCurrentStopId)) + 1;
            const volIdx = stops.findIndex(s => Number(s.stopId) === volumeStopId) + 1;
            feedbackExpedicaoUnloadingCodeResult({
                success: false,
                message: `Este volume é da parada ${volIdx || '?'}. Desembarque agora a parada ${currentIdx || '?'}.`
            }, options);
            return;
        }

        if (!volume.boardedAt) {
            feedbackExpedicaoUnloadingCodeResult({
                success: false,
                message: 'Volume ainda não foi embarcado.'
            }, options);
            return;
        }

        if (volume.unloadedAt) {
            feedbackExpedicaoUnloadingCodeResult({
                success: false,
                message: `Volume ${volume.volumeCode} já foi desembarcado.`
            }, options);
            return;
        }

        const stopIndexBefore = (expedicaoUnloadingDetail?.stops || [])
            .findIndex(s => Number(s.stopId) === Number(expedicaoUnloadingCurrentStopId)) + 1;
        const currentStopBefore = getExpeditionUnloadingCurrentStop();
        const pendingBeforeScan = currentStopBefore ? stopUnloadingPending(currentStopBefore).length : 0;
        const totalAtStop = (currentStopBefore?.volumes || []).filter(vol => vol.boardedAt).length;

        await markExpeditionVolumeUnloaded(volume.id);

        if (typeof notifyMatrixExpeditionUnloadingStopScanEvents === 'function') {
            notifyMatrixExpeditionUnloadingStopScanEvents(
                expedicaoUnloadingRouteId,
                stopIndexBefore,
                pendingBeforeScan,
                totalAtStop
            );
        }
        await promoteExpeditionRouteUnloadingStarted(expedicaoUnloadingRouteId);
        applyLocalUnloadedVolume(volume.id);

        try {
            await reloadExpeditionUnloadingDetail(false);
        } catch (reloadError) {
            console.warn('reloadExpeditionUnloadingDetail após leitura:', reloadError);
        }

        const current = getExpeditionUnloadingCurrentStop();
        const pendingAtStop = current && typeof expeditionStopHasUnloadingPending === 'function'
            ? expeditionStopHasUnloadingPending(current)
            : (current ? stopUnloadingPending(current).length > 0 : false);
        const routeVolumes = expedicaoUnloadingDetail?.volumes || [];
        const routeDone = !(expedicaoUnloadingDetail?.stops || []).some(stop =>
            typeof expeditionStopHasUnloadingPending === 'function'
                ? expeditionStopHasUnloadingPending(stop)
                : stopUnloadingPending(stop).length > 0
        );
        const nextStop = findNextUnloadingStop(expedicaoUnloadingDetail?.stops || []);

        if (routeDone) {
            await finishExpeditionUnloadingRouteFeedback(routeVolumes, options);
            return;
        }

        if (!pendingAtStop) {
            const stopMsg = stopIndexBefore > 0
                ? `Todos os volumes da parada ${stopIndexBefore} foram desembarcados.`
                : buildExpeditionUnloadingStopCompleteMessage();
            try {
                await refreshExpeditionUnloadingStopView(true);
            } catch (refreshError) {
                console.warn('refreshExpeditionUnloadingStopView:', refreshError);
            }
            feedbackExpedicaoUnloadingCodeResult({
                success: true,
                message: stopMsg,
                stopComplete: true
            }, options);
            return;
        }

        try {
            await refreshExpeditionUnloadingStopView(false);
        } catch (refreshError) {
            console.warn('refreshExpeditionUnloadingStopView:', refreshError);
        }
        feedbackExpedicaoUnloadingCodeResult({
            success: true,
            message: `Volume ${volume.volumeCode} desembarcado.`
        }, options);
    } catch (error) {
        console.error('processExpedicaoUnloadingScanCode:', error);
        feedbackExpedicaoUnloadingCodeResult({
            success: false,
            message: error.message || 'Erro ao desembarcar volume.'
        }, options);
    } finally {
        if (!useScanOverlay) setExpedicaoActionLoading(false);
    }
}

function buildExpeditionUnloadingScannerConfig() {
    const config = {
        fps: 15,
        disableFlip: true,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        videoConstraints: {
            facingMode: { ideal: 'environment' },
            width: { min: 640, ideal: 1280 },
            height: { min: 360, ideal: 720 }
        },
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            const width = Math.floor(Math.min(viewfinderWidth * 0.94, 480));
            const height = Math.floor(Math.min(Math.max(viewfinderHeight * 0.3, 76), 150));
            return { width: Math.max(width, 220), height: Math.max(height, 72) };
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

async function stopExpedicaoUnloadingScanner(options = {}) {
    if (!expedicaoUnloadingScanner) return;
    if (expedicaoUnloadingScannerRunning) {
        try {
            await expedicaoUnloadingScanner.stop();
        } catch (error) {
            console.warn('stopExpedicaoUnloadingScanner:', error);
        }
        expedicaoUnloadingScannerRunning = false;
    }
    if (options.clearReader) {
        try {
            expedicaoUnloadingScanner.clear();
        } catch (error) {
            console.warn('clearExpedicaoUnloadingScanner:', error);
        }
        clearExpeditionUnloadingReaderDom();
        expedicaoUnloadingScanner = null;
    }
    setExpeditionUnloadingScanHintActive(false);
}

async function restartExpedicaoUnloadingScanner() {
    if (!isExpeditionUnloadingScanModalOpen()) return;

    expedicaoUnloadingScanLock = false;
    await stopExpedicaoUnloadingScanner({ clearReader: true });
    expedicaoUnloadingScanner = null;

    hideExpedicaoUnloadingScanResult();
    setExpeditionUnloadingScanCameraLayerHidden(false);
    await waitExpeditionUnloadingScanLayout();

    if (!ensureExpeditionUnloadingReaderElement()) {
        console.warn('restartExpedicaoUnloadingScanner: reader ausente');
        return;
    }

    try {
        await loadExpeditionUnloadingHtml5QrcodeLibrary();
        expedicaoUnloadingScanner = new Html5Qrcode('expedition-unloading-reader');
        await resumeExpedicaoUnloadingScanner();
    } catch (error) {
        console.error('restartExpedicaoUnloadingScanner:', error);
        alertAppDialog('Não foi possível reabrir a câmera. Feche e toque em Ler volume novamente.');
    }
}

async function resumeExpedicaoUnloadingScanner() {
    if (!expedicaoUnloadingScanner || expedicaoUnloadingScannerRunning) return;
    const config = buildExpeditionUnloadingScannerConfig();
    const onDecode = text => { void handleExpedicaoUnloadingScanDecoded(text); };
    try {
        await expedicaoUnloadingScanner.start(
            { facingMode: { ideal: 'environment' } },
            config,
            onDecode,
            () => {}
        );
    } catch (firstError) {
        console.warn('resumeExpedicaoUnloadingScanner (config completa):', firstError);
        const fallbackConfig = { ...config };
        delete fallbackConfig.videoConstraints;
        try {
            await expedicaoUnloadingScanner.start(
                { facingMode: 'environment' },
                fallbackConfig,
                onDecode,
                () => {}
            );
        } catch (secondError) {
            console.error('resumeExpedicaoUnloadingScanner:', secondError);
            alertAppDialog('Não foi possível usar a câmera. Use “Ou digite o código” abaixo.');
            return;
        }
    }
    expedicaoUnloadingScannerRunning = true;
    setExpeditionUnloadingScanHintActive(true);
}

async function handleExpedicaoUnloadingScanDecoded(decodedText) {
    if (expedicaoUnloadingScanLock) return;
    expedicaoUnloadingScanLock = true;
    await stopExpedicaoUnloadingScanner({ clearReader: true });
    showExpedicaoUnloadingScanResult({
        success: true,
        pending: true,
        message: 'Conferindo volume...'
    });
    await processExpedicaoUnloadingScanCode(decodedText, { fromScanner: true });
    expedicaoUnloadingScanLock = false;
}

async function openExpedicaoUnloadingScanModal() {
    const modal = document.getElementById('expedition-unloading-scan-modal');
    if (!modal) {
        alertAppDialog('Tela de leitura não carregada. Atualize a página (hard refresh).');
        return;
    }
    if (!getExpeditionUnloadingCurrentStop()) {
        alertAppDialog('Não há volumes pendentes nesta parada.', { variant: 'success' });
        return;
    }

    if (typeof releaseExpeditionBarcodeCameraFromBoarding === 'function') {
        await releaseExpeditionBarcodeCameraFromBoarding();
    }

    hideExpedicaoUnloadingScanResult();
    modal.classList.remove('hidden');
    if (typeof primeExpeditionScanFeedbackAudio === 'function') {
        primeExpeditionScanFeedbackAudio();
    }

    try {
        await restartExpedicaoUnloadingScanner();
    } catch (error) {
        console.error('openExpedicaoUnloadingScanModal:', error);
        alertAppDialog(error.message || 'Erro ao abrir câmera.');
    }
}

async function closeExpedicaoUnloadingScanModalAfterRouteComplete() {
    hideExpedicaoUnloadingScanResult();
    await stopExpedicaoUnloadingScanner({ clearReader: true });
    document.getElementById('expedition-unloading-scan-modal')?.classList.add('hidden');
    expedicaoUnloadingView = 'list';
    expedicaoUnloadingRouteId = null;
    expedicaoUnloadingDetail = null;
    expedicaoUnloadingCurrentStopId = null;
    await loadExpedicaoUnloadingList();
}

async function closeExpedicaoUnloadingScanModal(refreshStop = false) {
    hideExpedicaoUnloadingScanResult();
    await stopExpedicaoUnloadingScanner({ clearReader: true });
    setExpeditionUnloadingScanCameraLayerHidden(false);
    document.getElementById('expedition-unloading-scan-modal')?.classList.add('hidden');
    if (refreshStop) await refreshExpeditionUnloadingStopView();
}

function bindExpedicaoUnloadingEvents() {
    const closeScan = () => void closeExpedicaoUnloadingScanModal(true);
    document.getElementById('btn-expedition-unloading-scan-close')?.addEventListener('click', closeScan);
    document.getElementById('btn-expedition-unloading-scan-close-top')?.addEventListener('click', closeScan);

    const submitManual = () => {
        const value = document.getElementById('expedition-unloading-scan-manual')?.value;
        void processExpedicaoUnloadingScanCode(value, { fromScanner: true });
    };
    document.getElementById('expedition-unloading-scan-manual-btn')?.addEventListener('click', submitManual);
    document.getElementById('expedition-unloading-scan-manual')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') submitManual();
    });
}

window.loadExpedicaoUnloadingList = loadExpedicaoUnloadingList;
window.openExpedicaoUnloadingRoute = openExpedicaoUnloadingRoute;
window.bindExpedicaoUnloadingEvents = bindExpedicaoUnloadingEvents;