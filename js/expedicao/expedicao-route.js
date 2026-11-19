const EXPEDITION_ROUTE_LIST_SELECT = `
    id, routeDate, vehicleLabel, driverName, status, mapsUrl, createdAt, confirmedAt, responsibleUserId
`;

const EXPEDITION_ROUTE_STATUS_OPTIONS = [
    { value: 'Draft', label: 'Rascunho' },
    { value: 'Confirmed', label: 'Confirmado' },
    { value: 'Printed', label: 'Impresso' },
    { value: 'BoardingStarted', label: 'Embarque Iniciado' },
    { value: 'Boarded', label: 'Embarcado' },
    { value: 'UnloadingStarted', label: 'Desembarque Iniciado' },
    { value: 'UnloadingFinished', label: 'Desembarque Finalizado' },
    { value: 'Completed', label: 'Concluído' }
];

const EXPEDITION_ROUTE_WIZARD_STATUS_OPTIONS = [
    { value: 'Draft', label: 'Rascunho' },
    { value: 'Confirmed', label: 'Confirmado' }
];

const EXPEDITION_DEFAULT_ROUTE_TIME = '08:00';

function getExpeditionRouteTimeDefault() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function toExpeditionRouteDateInputValue(routeDate) {
    if (!routeDate) return '';
    const raw = String(routeDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (typeof toInputDate === 'function') return toInputDate(raw);
    return raw.slice(0, 10);
}

function toExpeditionRouteTimeInputValue(routeDate) {
    if (!routeDate) return EXPEDITION_DEFAULT_ROUTE_TIME;
    const raw = String(routeDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return EXPEDITION_DEFAULT_ROUTE_TIME;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return EXPEDITION_DEFAULT_ROUTE_TIME;
    return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}

function buildExpeditionRouteDateTimeIso(dateValue, timeValue) {
    const date = String(dateValue || '').trim();
    const time = String(timeValue || EXPEDITION_DEFAULT_ROUTE_TIME).trim() || EXPEDITION_DEFAULT_ROUTE_TIME;
    if (!date) return null;
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(part => Number(part) || 0);
    if (!year || !month || !day) return null;
    const local = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return local.toISOString();
}

function formatExpeditionRouteDateTimeLabel(routeDate) {
    if (!routeDate) return '—';
    if (typeof formatDate === 'function') return formatDate(routeDate);
    return String(routeDate);
}

/** Itens ficam vinculados a rotas fora de rascunho (não podem ir para outra rota confirmada). */
const EXPEDITION_ROUTE_LOCKED_ITEM_STATUSES = [
    'Confirmed',
    'Printed',
    'BoardingStarted',
    'Boarded',
    'UnloadingStarted',
    'UnloadingFinished',
    'Completed'
];

let expedicaoRoutesCache = [];

function formatExpeditionRouteStatus(status) {
    const match = EXPEDITION_ROUTE_STATUS_OPTIONS.find(item => item.value === status);
    return match?.label || 'Rascunho';
}

function normalizeExpeditionRouteStatus(status) {
    return EXPEDITION_ROUTE_STATUS_OPTIONS.some(item => item.value === status) ? status : 'Draft';
}

function normalizeExpeditionRouteWizardStatus(status) {
    return EXPEDITION_ROUTE_WIZARD_STATUS_OPTIONS.some(item => item.value === status) ? status : 'Draft';
}

function canEditExpeditionRoute(status) {
    return status === 'Draft';
}

function canPrintExpeditionRouteLabels(status) {
    const normalized = normalizeExpeditionRouteStatus(status);
    return EXPEDITION_ROUTE_LOCKED_ITEM_STATUSES.includes(normalized);
}

function getExpeditionRoutePrintActionLabel(status) {
    const normalized = normalizeExpeditionRouteStatus(status);
    return normalized === 'Confirmed' ? 'Imprimir etiquetas' : 'Imprimir novamente';
}

function expeditionRouteStatusBadgeClass(status) {
    switch (status) {
        case 'Draft':
            return 'bg-slate-100 text-slate-700';
        case 'Confirmed':
            return 'bg-emerald-100 text-emerald-800';
        case 'Printed':
            return 'bg-indigo-100 text-indigo-800';
        case 'BoardingStarted':
        case 'Boarded':
            return 'bg-amber-100 text-amber-900';
        case 'UnloadingStarted':
        case 'UnloadingFinished':
            return 'bg-sky-100 text-sky-900';
        case 'Completed':
            return 'bg-slate-200 text-slate-800';
        default:
            return 'bg-slate-100 text-slate-700';
    }
}

function collectExpeditionItemsFromStops(stops = []) {
    const items = [];
    (stops || []).forEach(stop => {
        (stop.items || []).forEach(item => {
            if (!item?.entityType || !item?.entityId) return;
            items.push(item);
        });
    });
    return items;
}

function validateExpeditionRouteItemsNotDuplicated(stops = []) {
    const seen = new Map();
    for (const item of collectExpeditionItemsFromStops(stops)) {
        const key = `${item.entityType}:${item.entityId}`;
        if (seen.has(key)) {
            const label = item.label || seen.get(key) || key;
            throw new Error(`O item "${label}" está repetido nesta rota. Remova a duplicata antes de salvar.`);
        }
        seen.set(key, item.label || key);
    }
}

function formatExpeditionStopItemInsertError(error, item) {
    const message = String(error?.message || '');
    if (error?.code === '23505' || /duplicate key|unique/i.test(message)) {
        const label = item?.label
            || (typeof getExpeditionEntityTypeLabel === 'function'
                ? getExpeditionEntityTypeLabel(item?.entityType)
                : item?.entityType);
        const sqlHint = /ExpeditionRouteStopItem_entity_unique_idx/i.test(message)
            ? ' Rode `supabase/feats/expedition-route-stop-item-unique-per-route.sql` no Supabase SQL Editor (DEV).'
            : '';
        return new Error(
            `O item "${label}" já está incluído nesta rota (ou em outra rota salva). Escolha outro item ou exclua a rota anterior.${sqlHint}`
        );
    }
    if (/ExpeditionRouteStopItem_entityType_check/i.test(message)) {
        return new Error(
            'Tipo de parada não permitido no banco. Execute `supabase/feats/expedition-route-pickup-project.sql` no Supabase SQL Editor (DEV).'
        );
    }
    if (/ExpeditionRouteStopItem_volumeCount_check/i.test(message)) {
        return new Error(
            'Quantidade de volumes inválida para este tipo de parada. Execute `supabase/feats/expedition-route-pickup-project.sql` no Supabase SQL Editor (DEV) (coleta usa 0 volumes).'
        );
    }
    return error;
}

async function assertExpeditionItemsNotInLockedRoutes(items, excludeRouteId = null) {
    if (!items?.length) return;

    for (const item of items) {
        let result = await supabaseClient
            .from('ExpeditionRouteStopItem')
            .select(`
                id,
                entityLabel,
                route:ExpeditionRoute(id, routeDate, status)
            `)
            .eq('entityType', item.entityType)
            .eq('entityId', item.entityId);

        if (result.error && /routeId|relationship|schema cache/i.test(result.error.message || '')) {
            result = await supabaseClient
                .from('ExpeditionRouteStopItem')
                .select(`
                    id,
                    entityLabel,
                    stop:ExpeditionRouteStop(
                        route:ExpeditionRoute(id, routeDate, status)
                    )
                `)
                .eq('entityType', item.entityType)
                .eq('entityId', item.entityId);
        }

        if (result.error) {
            console.warn('assertExpeditionItemsNotInLockedRoutes:', result.error);
            continue;
        }

        const rows = result.data || [];
        const blocking = rows.find(row => {
            const route = row.route || row.stop?.route;
            if (!route) return false;
            if (excludeRouteId && Number(route.id) === Number(excludeRouteId)) return false;
            return EXPEDITION_ROUTE_LOCKED_ITEM_STATUSES.includes(route.status);
        });
        if (!blocking) continue;

        const route = blocking.route || blocking.stop?.route;
        const dateLabel = route?.routeDate && typeof formatDate === 'function'
            ? formatDate(route.routeDate)
            : '';
        const statusLabel = formatExpeditionRouteStatus(route?.status);
        const label = item.label || blocking.entityLabel || item.entityType;
        throw new Error(
            `"${label}" já está na rota #${route?.id}${dateLabel ? ` (${dateLabel})` : ''} — ${statusLabel}. Remova da outra rota ou mantenha esta em rascunho.`
        );
    }
}

/** IDs de entidades já vinculadas a alguma rota (exceto excludeRouteId, ex.: rota em edição). */
async function fetchExpeditionEntityIdsAlreadyRouted(entityType, excludeRouteId = null) {
    const type = String(entityType || '').trim();
    if (!type) return [];

    const exclude = Number(excludeRouteId) || null;

    let result = await supabaseClient
        .from('ExpeditionRouteStopItem')
        .select('entityId, routeId')
        .eq('entityType', type);

    if (result.error && /routeId|relationship|embed|schema cache/i.test(result.error.message || '')) {
        result = await supabaseClient
            .from('ExpeditionRouteStopItem')
            .select('entityId, stop:ExpeditionRouteStop(routeId)')
            .eq('entityType', type);
    }

    if (result.error) {
        console.warn('fetchExpeditionEntityIdsAlreadyRouted:', result.error);
        return [];
    }

    const ids = new Set();
    (result.data || []).forEach(row => {
        const entityId = Number(row.entityId);
        const routeId = Number(row.routeId) || Number(row.stop?.routeId);
        if (!entityId) return;
        if (exclude && routeId === exclude) return;
        ids.add(entityId);
    });

    return [...ids];
}

async function deleteExpeditionRouteChildren(routeId) {
    const key = Number(routeId);
    if (!key) return;

    const { error: volError } = await supabaseClient
        .from('ExpeditionVolume')
        .delete()
        .eq('routeId', key);
    if (volError) throw volError;

    const { error: stopError } = await supabaseClient
        .from('ExpeditionRouteStop')
        .delete()
        .eq('routeId', key);
    if (stopError) throw stopError;
}

async function buildWizardStateFromRoute(routeId) {
    const key = Number(routeId);
    if (!key) throw new Error('Rota inválida.');

    const routeSelects = [
        `id, routeDate, vehicleLabel, driverName, responsibleUserId, status, mapsUrl, routeSummaryJson,
            stops:ExpeditionRouteStop(
                id, sortOrder, addrId, addrSnapshot,
                items:ExpeditionRouteStopItem(id, entityType, entityId, entityLabel, volumeCount, metadataJson, pickupUnloadedAt)
            )`,
        `id, routeDate, vehicleLabel, driverName, status, mapsUrl, routeSummaryJson,
            stops:ExpeditionRouteStop(
                id, sortOrder, addrId, addrSnapshot,
                items:ExpeditionRouteStopItem(id, entityType, entityId, entityLabel, volumeCount, metadataJson, pickupUnloadedAt)
            )`
    ];

    let route = null;
    let error = null;
    for (const select of routeSelects) {
        const result = await supabaseClient
            .from('ExpeditionRoute')
            .select(select)
            .eq('id', key)
            .maybeSingle();
        if (!result.error) {
            route = result.data;
            error = null;
            break;
        }
        error = result.error;
        if (!(typeof isExpeditionResponsibleUserSchemaError === 'function'
            && isExpeditionResponsibleUserSchemaError(result.error))) {
            break;
        }
    }

    if (error) throw error;
    if (!route) throw new Error('Rota não encontrada.');
    if (!canEditExpeditionRoute(route.status)) {
        throw new Error('Só é possível editar rota em status Rascunho.');
    }

    const volumes = await fetchExpeditionRouteVolumes(key);
    const volumesByStopItemId = new Map();
    (volumes || []).forEach(vol => {
        const stopItemId = Number(vol.stopItemId);
        if (!volumesByStopItemId.has(stopItemId)) volumesByStopItemId.set(stopItemId, []);
        volumesByStopItemId.get(stopItemId).push({
            volumeIndex: vol.volumeIndex,
            volumeCode: vol.volumeCode
        });
    });

    const sortedStops = (route.stops || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const stops = sortedStops.map(stop => ({
        localId: `stop-${stop.id}-${Math.random().toString(36).slice(2, 7)}`,
        addr: stop.addrSnapshot || {},
        items: (stop.items || []).map(item => {
            const savedVolumes = volumesByStopItemId.get(Number(item.id)) || [];
            const isPickup = String(item.entityType) === 'Pickup';
            const volumeCount = isPickup
                ? 0
                : (Number(item.volumeCount) || savedVolumes.length || 1);
            let itemVolumes = savedVolumes.slice().sort((a, b) => a.volumeIndex - b.volumeIndex);
            if (!isPickup && !itemVolumes.length && typeof buildExpeditionVolumesForItem === 'function') {
                itemVolumes = buildExpeditionVolumesForItem(volumeCount);
            }
            return {
                entityType: item.entityType,
                entityId: item.entityId,
                label: item.entityLabel || '',
                volumeCount,
                volumes: itemVolumes,
                metadata: item.metadataJson || {}
            };
        })
    }));

    const empty = typeof createEmptyExpedicaoWizardState === 'function'
        ? createEmptyExpedicaoWizardState()
        : { step: 'meta', stops: [], currentStop: null, pendingItem: null, maps: null };

    return {
        ...empty,
        editingRouteId: key,
        routeDate: toExpeditionRouteDateInputValue(route.routeDate) || empty.routeDate,
        routeTime: toExpeditionRouteTimeInputValue(route.routeDate) || empty.routeTime,
        vehicleLabel: route.vehicleLabel || '',
        driverName: route.driverName || '',
        responsibleUserId: route.responsibleUserId ? Number(route.responsibleUserId) : null,
        routeStatus: 'Draft',
        stops,
        maps: route.mapsUrl ? { url: route.mapsUrl, summary: route.routeSummaryJson || null } : null
    };
}

async function markExpeditionRoutePrinted(routeId) {
    const key = Number(routeId);
    if (!key) return;

    const { data: route, error: readError } = await supabaseClient
        .from('ExpeditionRoute')
        .select('status')
        .eq('id', key)
        .maybeSingle();

    if (readError || !route || route.status !== 'Confirmed') return;

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('ExpeditionRoute')
        .update({ status: 'Printed', updatedAt: now })
        .eq('id', key);

    if (error) {
        console.warn('markExpeditionRoutePrinted:', error);
        return;
    }

    const cached = expedicaoRoutesCache.find(item => Number(item.id) === key);
    if (cached) cached.status = 'Printed';
}

async function insertExpeditionRouteStopItem({ routeId, stopId, item }) {
    const volumeCount = Number(item.volumeCount);
    const base = {
        stopId,
        routeId,
        entityType: item.entityType,
        entityId: item.entityId,
        entityLabel: item.label || '',
        volumeCount: Number.isFinite(volumeCount) ? volumeCount : 1
    };

    const metadata = item.metadata || item.metadataJson;
    if (metadata && Object.keys(metadata).length) {
        base.metadataJson = metadata;
    }

    let result = await supabaseClient
        .from('ExpeditionRouteStopItem')
        .insert(base)
        .select('id')
        .single();

    if (result.error && /routeId|schema cache|does not exist/i.test(result.error.message || '')) {
        const legacy = { ...base };
        delete legacy.routeId;
        result = await supabaseClient
            .from('ExpeditionRouteStopItem')
            .insert(legacy)
            .select('id')
            .single();
    }

    if (result.error && base.metadataJson && /metadataJson|schema cache|column/i.test(result.error.message || '')) {
        const legacy = { ...base };
        delete legacy.metadataJson;
        result = await supabaseClient
            .from('ExpeditionRouteStopItem')
            .insert(legacy)
            .select('id')
            .single();
    }

    if (result.error) {
        throw formatExpeditionStopItemInsertError(result.error, item);
    }

    return result.data;
}

function closeExpedicaoRouteHistoryModal() {
    document.getElementById('expedition-route-history-modal')?.classList.add('hidden');
}

function setExpeditionRouteHistoryModalTitle(route) {
    const title = document.getElementById('expedition-route-history-title');
    if (!title) return;
    if (route?.id) {
        title.textContent = `Histórico · Rota #${Number(route.id)}`;
        return;
    }
    title.textContent = 'Histórico de embarque e desembarque';
}

function expeditionHistoryStatusBadgeClass(tone) {
    if (tone === 'done') return 'bg-emerald-100 text-emerald-800';
    if (tone === 'boarded') return 'bg-sky-100 text-sky-800';
    return 'bg-slate-100 text-slate-600';
}

function renderExpeditionVolumeHistoryMetaLine(label, at, user) {
    const pending = !at;
    if (pending) {
        return `<span class="text-slate-400"><span class="font-semibold text-slate-500">${escapeHtml(label)}:</span> Pendente</span>`;
    }
    const when = formatExpeditionVolumeHistoryMoment(at);
    const who = formatExpeditionVolumeHistoryUser(user);
    return `<span class="text-slate-600"><span class="font-semibold text-slate-700">${escapeHtml(label)}:</span> ${escapeHtml(when)} · ${escapeHtml(who)}</span>`;
}

function renderExpeditionRouteHistoryMetricChip(value, label, hint = '', extraClass = '') {
    return `
        <div class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-center min-w-0 ${extraClass}">
            <p class="text-lg font-bold text-slate-900 leading-none tabular-nums">${escapeHtml(String(value))}</p>
            <p class="text-[10px] font-semibold text-slate-600 mt-1">${escapeHtml(label)}</p>
            ${hint ? `<p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(hint)}</p>` : ''}
        </div>
    `;
}

function renderExpeditionRouteHistoryHero(route, metrics = {}) {
    const dateLabel = typeof formatExpeditionRouteDateTimeLabel === 'function'
        ? formatExpeditionRouteDateTimeLabel(route.routeDate)
        : (typeof formatDate === 'function' ? formatDate(route.routeDate) : '—');
    const statusLabel = typeof formatExpeditionRouteStatus === 'function'
        ? formatExpeditionRouteStatus(route.status)
        : (route.status || '—');

    const {
        total = 0,
        boarded = 0,
        unloaded = 0,
        pickupTotal = 0,
        pickupDone = 0,
        pendingBoard = 0,
        pendingUnload = 0,
        pickupPending = 0
    } = metrics;

    const boardHint = pendingBoard
        ? `${pendingBoard} pendente${pendingBoard === 1 ? '' : 's'}`
        : '';
    const unloadHint = pendingUnload
        ? `${pendingUnload} aguardando`
        : '';
    const pickupHint = pickupPending
        ? `${pickupPending} pendente${pickupPending === 1 ? '' : 's'}`
        : '';

    const metricsHtml = [
        renderExpeditionRouteHistoryMetricChip(total, 'Volumes'),
        renderExpeditionRouteHistoryMetricChip(boarded, 'Embarcados', boardHint, 'border-sky-100 bg-sky-50/60'),
        renderExpeditionRouteHistoryMetricChip(unloaded, 'Desembarcados', unloadHint, 'border-emerald-100 bg-emerald-50/60')
    ];
    if (pickupTotal > 0) {
        metricsHtml.push(renderExpeditionRouteHistoryMetricChip(
            pickupDone,
            'Coletas',
            pickupHint,
            'border-indigo-100 bg-indigo-50/60'
        ));
    }

    return `
        <motion></motion>
    `.replace('<motion></motion>', `
        <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-bold text-slate-900">Rota #${Number(route.id)} · ${escapeHtml(dateLabel)}</p>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">${escapeHtml(statusLabel)}</span>
            </div>
            ${typeof renderExpeditionRouteCrewMobile === 'function' ? renderExpeditionRouteCrewMobile(route) : ''}
            ${typeof renderExpeditionRouteCrewDesktopLine === 'function' ? renderExpeditionRouteCrewDesktopLine(route) : ''}
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                ${metricsHtml.join('')}
            </div>
        </div>
    `);
}

function formatExpeditionVolumeHistoryUser(user) {
    return String(user?.name || '').trim() || '—';
}

function formatExpeditionVolumeHistoryMoment(value) {
    if (!value) return '—';
    if (typeof formatDate === 'function') return formatDate(value);
    return String(value);
}

function expeditionVolumeHistoryStopNumber(vol) {
    const sortOrder = Number(vol?.stopItem?.stop?.sortOrder);
    return Number.isFinite(sortOrder) && sortOrder >= 0 ? sortOrder + 1 : null;
}

function expeditionVolumeHistoryStopAddress(vol) {
    return typeof formatExpeditionAddressOneLine === 'function'
        ? formatExpeditionAddressOneLine(vol?.stopItem?.stop?.addrSnapshot)
        : '';
}

function expeditionVolumeHistoryStatusMeta(vol) {
    if (vol?.unloadedAt) return { label: 'Desembarcado', tone: 'done' };
    if (vol?.boardedAt) return { label: 'Embarcado', tone: 'boarded' };
    return { label: 'Pendente', tone: 'pending' };
}

function expeditionVolumeHistoryTypeLabel(entityType) {
    if (typeof getExpeditionEntityTypeLabel === 'function') {
        return getExpeditionEntityTypeLabel(entityType);
    }
    return entityType || '—';
}

function groupExpeditionVolumesForHistory(volumes = []) {
    const sorted = typeof sortExpeditionVolumesForPrint === 'function'
        ? sortExpeditionVolumesForPrint(volumes)
        : volumes || [];

    const byKey = new Map();
    sorted.forEach(vol => {
        const stopItem = vol?.stopItem;
        const stopItemId = Number(stopItem?.id);
        const key = stopItemId
            ? `item:${stopItemId}`
            : `vol:${Number(vol.id) || Math.random()}`;

        if (!byKey.has(key)) {
            byKey.set(key, {
                sortOrder: Number(stopItem?.stop?.sortOrder),
                parada: expeditionVolumeHistoryStopNumber(vol),
                addr: expeditionVolumeHistoryStopAddress(vol),
                entityType: stopItem?.entityType,
                entityId: stopItem?.entityId,
                entityLabel: String(stopItem?.entityLabel || '').trim() || '—',
                volumes: []
            });
        }
        byKey.get(key).volumes.push(vol);
    });

    return [...byKey.values()].sort((a, b) => {
        const orderA = Number.isFinite(a.sortOrder) ? a.sortOrder : 9999;
        const orderB = Number.isFinite(b.sortOrder) ? b.sortOrder : 9999;
        if (orderA !== orderB) return orderA - orderB;
        const typeA = String(a.entityType || '');
        const typeB = String(b.entityType || '');
        if (typeA !== typeB) return typeA.localeCompare(typeB);
        return Number(a.entityId) - Number(b.entityId);
    });
}

function renderExpeditionVolumeHistoryRow(vol) {
    const volCode = vol.volumeCode
        ? String(vol.volumeCode)
        : `#${Number(vol.volumeIndex) || '—'}`;
    const volIndex = Number(vol.volumeIndex) || '—';
    const status = expeditionVolumeHistoryStatusMeta(vol);
    const rowClass = vol.unloadedAt
        ? 'border-emerald-200 bg-emerald-50/70'
        : (vol.boardedAt ? 'is-boarded' : '');

    return `
        <li class="expedicao-boarding-volume ${rowClass}">
            <div class="flex-1 min-w-0">
                <p class="text-[11px] font-semibold text-slate-800 font-mono tracking-tight">${escapeHtml(volCode)}</p>
                <p class="text-[10px] text-slate-500">Vol. ${escapeHtml(String(volIndex))}</p>
                <div class="text-[10px] leading-relaxed mt-1.5 space-y-0.5">
                    <div>${renderExpeditionVolumeHistoryMetaLine('Embarque', vol.boardedAt, vol.boardedBy)}</div>
                    <div>${renderExpeditionVolumeHistoryMetaLine('Desembarque', vol.unloadedAt, vol.unloadedBy)}</div>
                </div>
            </div>
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${expeditionHistoryStatusBadgeClass(status.tone)}">
                ${escapeHtml(status.label)}
            </span>
        </li>
    `;
}

async function prepareExpeditionRouteVolumeHistoryGroups(volumes) {
    const groups = groupExpeditionVolumesForHistory(volumes || []);
    const build = typeof buildExpeditionHistoryItemSummary === 'function'
        ? buildExpeditionHistoryItemSummary
        : null;

    await Promise.all(groups.map(async group => {
        if (build && group.entityType && group.entityId) {
            group.itemSummary = await build(group.entityType, group.entityId);
        } else {
            group.itemSummary = String(group.entityLabel || '—').trim() || '—';
        }
    }));

    return groups;
}

function expeditionPickupHistoryStatusMeta(pickupItem) {
    if (pickupItem?.pickupUnloadedAt) return { label: 'Registrada', tone: 'done' };
    return { label: 'Pendente', tone: 'pending' };
}

function renderExpeditionPickupHistoryPhotoHtml(driveFile) {
    if (!driveFile) {
        return '<p class="text-[10px] text-slate-400">Sem foto registrada.</p>';
    }

    const attrs = typeof driveFilePreviewImgAttrs === 'function'
        ? driveFilePreviewImgAttrs(driveFile)
        : (typeof resolveDriveFilePreviewUrl === 'function'
            ? `src="${escapeHtml(resolveDriveFilePreviewUrl(driveFile))}" referrerpolicy="no-referrer"`
            : '');

    return `
        <button type="button" class="expedition-route-history-pickup-photo" aria-label="Abrir foto da coleta">
            <img class="expedition-route-history-pickup-photo__img" alt="Foto da coleta" ${attrs}>
        </button>
    `;
}

function renderExpeditionPickupHistoryRow(group) {
    const pickupItem = group.pickupItem || {};
    const status = expeditionPickupHistoryStatusMeta(pickupItem);
    const unloadedBy = pickupItem.pickupUnloadedBy || null;

    return `
        <li class="rounded-lg border border-indigo-200 bg-white p-2.5 space-y-2">
            <div class="flex items-start justify-between gap-2">
                <p class="text-[11px] font-semibold text-indigo-950">Foto no desembarque</p>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${expeditionHistoryStatusBadgeClass(status.tone)}">
                    ${escapeHtml(status.label)}
                </span>
            </div>
            <p class="text-[10px] text-slate-500 leading-relaxed">
                ${renderExpeditionVolumeHistoryMetaLine('Registro', pickupItem.pickupUnloadedAt, unloadedBy)}
            </p>
            ${renderExpeditionPickupHistoryPhotoHtml(group.drivePhoto)}
        </li>
    `;
}

function sortExpeditionRouteHistoryGroups(groups = []) {
    return [...(groups || [])].sort((a, b) => {
        const orderA = Number.isFinite(a.sortOrder) ? a.sortOrder : 9999;
        const orderB = Number.isFinite(b.sortOrder) ? b.sortOrder : 9999;
        if (orderA !== orderB) return orderA - orderB;
        const typeA = String(a.entityType || '');
        const typeB = String(b.entityType || '');
        if (typeA !== typeB) return typeA.localeCompare(typeB);
        if (a.isPickup && !b.isPickup) return 1;
        if (!a.isPickup && b.isPickup) return -1;
        return Number(a.entityId || a.stopItemId) - Number(b.entityId || b.stopItemId);
    });
}

function renderExpeditionRouteHistoryList(groups) {
    if (!groups?.length) {
        return '<p class="text-xs text-slate-400 text-center py-8">Nenhum volume ou coleta nesta rota.</p>';
    }

    const sections = groups.map(group => {
        const typeLabel = expeditionVolumeHistoryTypeLabel(group.entityType);
        const paradaLabel = group.parada != null ? `Parada ${group.parada}` : 'Parada';
        const isPickup = Boolean(group.isPickup);
        const countLabel = isPickup
            ? 'Coleta'
            : `${group.volumes.length} vol.`;
        const typeBadgeClass = isPickup
            ? 'bg-indigo-50 text-indigo-800'
            : 'bg-slate-100 text-slate-700';

        return `
            <article class="border border-slate-200 rounded-xl p-3 ${isPickup ? 'bg-indigo-50/40 border-indigo-100' : 'bg-slate-50/60'}">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <h4 class="text-xs font-bold text-slate-900">${escapeHtml(paradaLabel)}</h4>
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeBadgeClass}">${escapeHtml(typeLabel)}</span>
                        <span class="text-[10px] font-medium text-slate-500">${escapeHtml(countLabel)}</span>
                    </div>
                </div>
                ${group.addr ? `<p class="text-[11px] text-slate-600 whitespace-pre-wrap mt-1">${escapeHtml(group.addr)}</p>` : ''}
                <p class="text-[11px] font-semibold text-slate-800 mt-2">${escapeHtml(group.itemSummary || group.entityLabel || '—')}</p>
                <ul class="mt-2 space-y-2 list-none m-0 p-0">
                    ${isPickup
            ? renderExpeditionPickupHistoryRow(group)
            : group.volumes.map(renderExpeditionVolumeHistoryRow).join('')}
                </ul>
            </article>
        `;
    }).join('');

    return `<div class="space-y-2">${sections}</div>`;
}

function bindExpeditionRouteHistoryPickupPhotoEvents(mount) {
    if (!mount) return;
    mount.querySelectorAll('.expedition-route-history-pickup-photo').forEach(btn => {
        btn.addEventListener('click', () => {
            const img = btn.querySelector('img');
            const url = img?.dataset?.attachmentDriveUrl || img?.currentSrc || img?.src;
            if (!url || typeof openImageAttachmentLightbox !== 'function') return;
            openImageAttachmentLightbox(url, img?.getAttribute('alt') || 'Foto da coleta');
        });
    });
}

async function fetchExpeditionRouteVolumesForHistory(routeId) {
    const key = Number(routeId);
    if (!key) return { volumes: [], missingColumn: false, error: null };

    const selects = [
        `id, volumeIndex, volumeCode, routeId, boardedAt, boardedById, unloadedAt, unloadedById,
            boardedBy:appUsers!boardedById(id, name),
            unloadedBy:appUsers!unloadedById(id, name),
            stopItem:ExpeditionRouteStopItem(
                id, entityType, entityId, entityLabel,
                stop:ExpeditionRouteStop(id, sortOrder, addrSnapshot)
            )`,
        `id, volumeIndex, volumeCode, routeId, boardedAt, boardedById, unloadedAt, unloadedById,
            stopItem:ExpeditionRouteStopItem(
                id, entityType, entityId, entityLabel,
                stop:ExpeditionRouteStop(id, sortOrder, addrSnapshot)
            )`
    ];

    let lastError = null;
    for (const select of selects) {
        const result = await supabaseClient
            .from('ExpeditionVolume')
            .select(select)
            .eq('routeId', key)
            .order('id', { ascending: true });

        if (!result.error) {
            return { volumes: result.data || [], missingColumn: false, error: null };
        }
        lastError = result.error;
        if (!/boardedAt|boardedBy|unloadedAt|unloadedBy|relationship|embed|schema cache/i.test(result.error.message || '')) {
            break;
        }
    }

    const missingColumn = /boardedAt|unloadedAt/i.test(lastError?.message || '');
    return { volumes: [], missingColumn, error: lastError };
}

async function openExpedicaoRouteBoardingHistoryModal(routeId) {
    const key = Number(routeId);
    if (!key) return;

    const modal = document.getElementById('expedition-route-history-modal');
    const mount = document.getElementById('expedition-route-history-mount');
    if (!modal || !mount) return;

    modal.classList.remove('hidden');
    mount.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando histórico...</p>';
    setExpeditionRouteHistoryModalTitle({ id: key });

    try {
        const route = typeof fetchExpeditionRouteById === 'function'
            ? await fetchExpeditionRouteById(key)
            : null;
        if (!route) {
            mount.innerHTML = '<p class="text-xs text-red-600 text-center py-6">Rota não encontrada.</p>';
            return;
        }

        setExpeditionRouteHistoryModalTitle(route);

        const { volumes, missingColumn, error } = await fetchExpeditionRouteVolumesForHistory(key);
        if (error) throw error;

        if (missingColumn) {
            mount.innerHTML = `
                <p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Colunas de embarque/desembarque não encontradas. ${escapeHtml(expeditionSqlHint())}
                </p>
            `;
            return;
        }

        const total = volumes.length;
        const boarded = volumes.filter(vol => vol.boardedAt).length;
        const unloaded = volumes.filter(vol => vol.unloadedAt).length;

        const pendingBoard = Math.max(total - boarded, 0);
        const pendingUnload = Math.max(boarded - unloaded, 0);

        const pickupItems = typeof fetchExpeditionRoutePickupStopItems === 'function'
            ? await fetchExpeditionRoutePickupStopItems(key)
            : [];
        const volumeHistoryGroups = await prepareExpeditionRouteVolumeHistoryGroups(volumes);
        const pickupHistoryGroups = typeof prepareExpeditionRoutePickupHistoryGroups === 'function'
            ? await prepareExpeditionRoutePickupHistoryGroups(pickupItems)
            : [];
        const historyGroups = sortExpeditionRouteHistoryGroups([
            ...volumeHistoryGroups,
            ...pickupHistoryGroups
        ]);

        const pickupTotal = pickupItems.length;
        const pickupDone = pickupItems.filter(item => item.pickupUnloadedAt).length;
        const pickupPending = Math.max(pickupTotal - pickupDone, 0);

        mount.innerHTML = `
            ${renderExpeditionRouteHistoryHero(route, {
            total,
            boarded,
            unloaded,
            pickupTotal,
            pickupDone,
            pendingBoard,
            pendingUnload,
            pickupPending
        })}
            ${renderExpeditionRouteHistoryList(historyGroups)}
        `;
        bindExpeditionRouteHistoryPickupPhotoEvents(mount);
    } catch (err) {
        console.error('openExpedicaoRouteBoardingHistoryModal:', err);
        mount.innerHTML = `<p class="text-xs text-red-600 text-center py-6">${escapeHtml(err.message || 'Erro ao carregar histórico.')}</p>`;
    }
}

async function loadExpedicaoRouteList() {
    const mount = document.getElementById('expedicao-content');
    if (!mount) return;

    setExpedicaoActionLoading(true, 'Carregando rotas...');

    try {
        let data = [];
        try {
            if (typeof fetchExpeditionRoutesForUi === 'function') {
                data = await fetchExpeditionRoutesForUi({ limit: 80 });
            } else {
                const result = await supabaseClient
                    .from('ExpeditionRoute')
                    .select(EXPEDITION_ROUTE_LIST_SELECT)
                    .order('routeDate', { ascending: false })
                    .order('id', { ascending: false })
                    .limit(80);
                if (result.error) throw result.error;
                data = result.data || [];
            }
        } catch (error) {
            if (isExpeditionTablesMissingError(error)) {
                mount.innerHTML = `
                    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
                        <p class="font-semibold mb-1">Tabelas de expedição não encontradas</p>
                        <p>${escapeHtml(expeditionSqlHint())}</p>
                    </div>
                `;
                return;
            }
            throw error;
        }

        expedicaoRoutesCache = data;
        renderExpedicaoRouteList(mount, expedicaoRoutesCache);
    } catch (error) {
        console.error('loadExpedicaoRouteList:', error);
        mount.innerHTML = `<p class="text-xs text-red-600 text-center py-8">Erro ao carregar rotas: ${escapeHtml(error.message)}</p>`;
    } finally {
        setExpedicaoActionLoading(false);
    }
}

function renderExpedicaoRouteList(mount, rows) {
    const tableRows = (rows || []).map(row => {
        const statusBadge = `<span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${expeditionRouteStatusBadgeClass(row.status)}">${formatExpeditionRouteStatus(row.status)}</span>`;
        const dateLabel = row.routeDate ? formatDate(row.routeDate) : '—';
        return `
            <tr class="hover:bg-slate-50/80">
                <td class="p-3 text-xs text-slate-800 whitespace-nowrap">${escapeHtml(dateLabel)}</td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(row.vehicleLabel || '—')}</td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(row.driverName || '—')}</td>
                <td class="p-3 text-xs text-slate-700">${typeof getExpeditionResponsibleLabel === 'function'
        ? escapeHtml(getExpeditionResponsibleLabel(row))
        : '—'}</td>
                <td class="p-3 text-xs">${statusBadge}</td>
                <td class="p-3 text-xs">
                    <div class="flex flex-wrap gap-1.5">
                        <button type="button"
                            class="expedicao-route-open-btn text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-medium hover:bg-slate-50"
                            data-route-id="${row.id}">Abrir</button>
                        <button type="button"
                            class="expedicao-route-history-btn text-xs bg-white border border-blue-200 text-blue-800 px-2.5 py-1 rounded-lg font-medium hover:bg-blue-50"
                            data-route-id="${row.id}">Histórico</button>
                        ${canEditExpeditionRoute(row.status)
        ? `<button type="button"
                            class="expedicao-route-edit-btn text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-medium hover:bg-slate-50"
                            data-route-id="${row.id}">Editar</button>`
        : ''}
                        ${canPrintExpeditionRouteLabels(row.status)
        ? `<button type="button"
                            class="expedicao-route-print-btn text-xs bg-slate-900 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-slate-800"
                            data-route-id="${row.id}">${escapeHtml(getExpeditionRoutePrintActionLabel(row.status))}</button>`
        : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    mount.innerHTML = `
        <div class="flex flex-col gap-4 min-h-[calc(100vh-140px)]">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 class="text-lg font-bold text-slate-900">Rota</h2>
                    <p class="text-xs text-slate-500 mt-1">Monte paradas, gere volumes e confirme a rota para liberar etiquetas.</p>
                </div>
                <button type="button" id="btn-expedicao-new-route"
                    class="text-xs bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold hover:bg-slate-800">
                    Nova rota
                </button>
            </div>
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table class="w-full text-left">
                    <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                            <th class="p-3 font-semibold">Dia</th>
                            <th class="p-3 font-semibold">Carro</th>
                            <th class="p-3 font-semibold">Motorista</th>
                            <th class="p-3 font-semibold">Responsável</th>
                            <th class="p-3 font-semibold">Status</th>
                            <th class="p-3 font-semibold">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${tableRows || `<tr><td colspan="6" class="p-8 text-center text-xs text-slate-400">Nenhuma rota cadastrada.</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    mount.querySelector('#btn-expedicao-new-route')?.addEventListener('click', () => {
        if (typeof openExpedicaoRouteWizard === 'function') openExpedicaoRouteWizard();
    });
    mount.querySelectorAll('.expedicao-route-open-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const routeId = Number(btn.dataset.routeId);
            if (typeof openExpedicaoRouteDetail === 'function') openExpedicaoRouteDetail(routeId);
        });
    });
    mount.querySelectorAll('.expedicao-route-history-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const routeId = Number(btn.dataset.routeId);
            void openExpedicaoRouteBoardingHistoryModal(routeId);
        });
    });
    mount.querySelectorAll('.expedicao-route-edit-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const routeId = Number(btn.dataset.routeId);
            if (typeof openExpedicaoRouteWizard === 'function') {
                await openExpedicaoRouteWizard(routeId);
            }
        });
    });
    mount.querySelectorAll('.expedicao-route-print-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const routeId = Number(btn.dataset.routeId);
            const printWindow = typeof openExpeditionLabelsPrintShell === 'function'
                ? openExpeditionLabelsPrintShell()
                : null;
            if (!printWindow) {
                alertAppDialog('Permita pop-ups para imprimir as etiquetas.');
                return;
            }
            void printExpedicaoRouteLabelsById(routeId, printWindow);
        });
    });
}

async function printExpedicaoRouteLabelsById(routeId, printWindow = null) {
    const key = Number(routeId);

    const { data: route, error } = await supabaseClient
        .from('ExpeditionRoute')
        .select('id, routeDate, vehicleLabel, driverName, status, routeSummaryJson, mapsUrl')
        .eq('id', key)
        .maybeSingle();

    if (error) {
        if (printWindow && !printWindow.closed) printWindow.close();
        alertAppDialog('Erro ao carregar rota: ' + error.message);
        return;
    }

    if (!route || !canPrintExpeditionRouteLabels(route.status)) {
        if (printWindow && !printWindow.closed) printWindow.close();
        alertAppDialog('Etiquetas só podem ser impressas após confirmar a rota (status Rascunho).');
        return;
    }

    const volumes = await fetchExpeditionRouteVolumes(key);
    printExpeditionVolumeLabels(route, volumes, {
        printWindow,
        onPrintDialog: () => markExpeditionRoutePrinted(key).then(() => loadExpedicaoRouteList())
    });
}

async function openExpedicaoRouteDetail(routeId) {
    const key = Number(routeId);
    if (!key) return;

    setExpedicaoActionLoading(true, 'Carregando rota...');
    try {
        const detailSelects = [
            `id, routeDate, vehicleLabel, driverName, responsibleUserId, status, mapsUrl, routeSummaryJson, confirmedAt,
                responsibleUser:appUsers!responsibleUserId(id, name),
                stops:ExpeditionRouteStop(
                    id, sortOrder, addrId, addrSnapshot,
                    items:ExpeditionRouteStopItem(id, entityType, entityId, entityLabel, volumeCount, metadataJson, pickupUnloadedAt)
                )`,
            `id, routeDate, vehicleLabel, driverName, status, mapsUrl, routeSummaryJson, confirmedAt,
                stops:ExpeditionRouteStop(
                    id, sortOrder, addrId, addrSnapshot,
                    items:ExpeditionRouteStopItem(id, entityType, entityId, entityLabel, volumeCount, metadataJson, pickupUnloadedAt)
                )`
        ];

        let route = null;
        let error = null;
        for (const select of detailSelects) {
            const result = await supabaseClient
                .from('ExpeditionRoute')
                .select(select)
                .eq('id', key)
                .maybeSingle();
            if (!result.error) {
                route = result.data;
                error = null;
                break;
            }
            error = result.error;
            if (!(typeof isExpeditionResponsibleUserSchemaError === 'function'
                && isExpeditionResponsibleUserSchemaError(result.error))) {
                break;
            }
        }

        if (error) throw error;
        if (!route) {
            alertAppDialog('Rota não encontrada.');
            return;
        }

        const sortedStops = (route.stops || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
        const stopLines = sortedStops.map((stop, index) => {
            const addr = formatExpeditionAddressOneLine(stop.addrSnapshot);
            const items = (stop.items || []).map(item => `
                <li class="text-[11px] text-slate-600">
                    ${escapeHtml(getExpeditionEntityTypeLabel(item.entityType))} — ${escapeHtml(item.entityLabel || '')}
                    <span class="text-slate-400">(${item.volumeCount} vol.)</span>
                </li>
            `).join('');
            return `
                <li class="border border-slate-200 rounded-lg p-3 bg-slate-50/40">
                    <p class="text-xs font-semibold text-slate-800">Parada ${index + 1}</p>
                    <p class="text-[11px] text-slate-600 whitespace-pre-wrap mt-1">${escapeHtml(addr || '—')}</p>
                    <ul class="mt-2 space-y-1 list-disc pl-4">${items || '<li class="text-[11px] text-slate-400">Sem itens</li>'}</ul>
                </li>
            `;
        }).join('');

        const distanceLabel = typeof formatExpeditionRouteDistanceSummary === 'function'
            ? formatExpeditionRouteDistanceSummary(route.routeSummaryJson)
            : '';
        const mapsLink = route.mapsUrl
            ? `<a href="${escapeHtml(route.mapsUrl)}" target="_blank" rel="noopener noreferrer"
                class="text-xs text-indigo-700 underline font-medium">Abrir no Google Maps</a>`
            : '<span class="text-xs text-slate-400">Sem rota calculada</span>';

        const detailMount = document.getElementById('expedition-route-detail-mount');
        const detailModal = document.getElementById('expedition-route-detail-modal');
        if (detailMount && detailModal) {
            detailMount.innerHTML = `
                <p class="text-sm font-bold text-slate-900">Rota ${escapeHtml(formatDate(route.routeDate))}</p>
                <p class="text-xs text-slate-600 mt-1">Status: ${escapeHtml(formatExpeditionRouteStatus(route.status))}</p>
                <p class="text-xs text-slate-600 mt-1">Carro: ${escapeHtml(route.vehicleLabel || '—')} · Motorista: ${escapeHtml(route.driverName || '—')}</p>
                <p class="text-xs text-slate-600 mt-1">Responsável: ${typeof getExpeditionResponsibleLabel === 'function'
        ? escapeHtml(getExpeditionResponsibleLabel(route))
        : '—'}</p>
                ${distanceLabel ? `<p class="text-xs text-slate-800 mt-1 font-semibold">Distância: ${escapeHtml(distanceLabel)}</p>` : ''}
                <p class="text-xs mt-2">${mapsLink}</p>
                <ol class="space-y-2 max-h-64 overflow-y-auto mt-3">${stopLines || '<li class="text-xs text-slate-400">Sem paradas</li>'}</ol>
            `;
            detailModal.classList.remove('hidden');
            const printBtn = document.getElementById('btn-expedition-route-detail-print');
            if (printBtn) {
                printBtn.classList.toggle('hidden', !canPrintExpeditionRouteLabels(route.status));
                printBtn.textContent = getExpeditionRoutePrintActionLabel(route.status);
                printBtn.onclick = () => {
                    const printWindow = typeof openExpeditionLabelsPrintShell === 'function'
                        ? openExpeditionLabelsPrintShell()
                        : null;
                    if (!printWindow) {
                        alertAppDialog('Permita pop-ups para imprimir as etiquetas.');
                        return;
                    }
                    void printExpedicaoRouteLabelsById(route.id, printWindow);
                };
            }
            const editBtn = document.getElementById('btn-expedition-route-detail-edit');
            if (editBtn) {
                editBtn.classList.toggle('hidden', !canEditExpeditionRoute(route.status));
                editBtn.onclick = async () => {
                    closeExpedicaoRouteDetailModal();
                    if (typeof openExpedicaoRouteWizard === 'function') {
                        await openExpedicaoRouteWizard(route.id);
                    }
                };
            }
            const historyBtn = document.getElementById('btn-expedition-route-detail-history');
            if (historyBtn) {
                historyBtn.onclick = () => void openExpedicaoRouteBoardingHistoryModal(route.id);
            }
        }
    } catch (error) {
        console.error('openExpedicaoRouteDetail:', error);
        alertAppDialog('Erro ao abrir rota: ' + error.message);
    } finally {
        setExpedicaoActionLoading(false);
    }
}

async function persistExpeditionRoute(wizardState) {
    const now = new Date().toISOString();
    const maps = wizardState.maps || {};
    const status = normalizeExpeditionRouteWizardStatus(wizardState.routeStatus);
    const isConfirmed = status === 'Confirmed';
    const editingRouteId = wizardState.editingRouteId ? Number(wizardState.editingRouteId) : null;

    if (isConfirmed && !maps.url) {
        throw new Error('Para status Confirmado, calcule a rota no Google Maps antes de salvar.');
    }

    if (!wizardState.stops?.length) {
        throw new Error('Inclua ao menos uma parada antes de salvar.');
    }

    const routeItems = collectExpeditionItemsFromStops(wizardState.stops);
    validateExpeditionRouteItemsNotDuplicated(wizardState.stops);
    if (isConfirmed) {
        await assertExpeditionItemsNotInLockedRoutes(routeItems, editingRouteId);
    }

    if (wizardState.stops?.length && typeof buildExpeditionRouteMapsUrl === 'function' && typeof getExpeditionFactoryAddressSnapshot === 'function') {
        try {
            const factory = await getExpeditionFactoryAddressSnapshot();
            if (factory.ok) {
                const base = buildExpeditionRouteMapsUrl(
                    wizardState.stops.map(stop => ({ addr: stop.addr })),
                    factory.snapshot
                );
                if (base.ok) {
                    const manual = maps.summary || {};
                    const merged = typeof mergeExpeditionRouteManualMetrics === 'function'
                        ? mergeExpeditionRouteManualMetrics(base.summary, {
                            totalDistanceKm: manual.totalDistanceKm,
                            totalDurationMinutes: manual.totalDurationMinutes
                        })
                        : { ...base.summary, ...manual };
                    if (!wizardState.maps) wizardState.maps = {};
                    wizardState.maps.summary = merged;
                    if (!wizardState.maps.url) {
                        wizardState.maps.url = base.url;
                    }
                }
            }
        } catch (rebuildError) {
            console.warn('persistExpeditionRoute: rebuild summary', rebuildError);
        }
    }

    const mapsPayload = wizardState.maps || maps;

    if (editingRouteId) {
        const { data: existing, error: existingError } = await supabaseClient
            .from('ExpeditionRoute')
            .select('status')
            .eq('id', editingRouteId)
            .maybeSingle();

        if (existingError) throw existingError;
        if (!existing) throw new Error('Rota não encontrada.');
        if (!canEditExpeditionRoute(existing.status)) {
            throw new Error('Só é possível editar rota em status Rascunho.');
        }
    }

    const routePayload = {
        routeDate: buildExpeditionRouteDateTimeIso(wizardState.routeDate, wizardState.routeTime),
        vehicleLabel: wizardState.vehicleLabel,
        driverName: wizardState.driverName,
        responsibleUserId: Number(wizardState.responsibleUserId) || null,
        status,
        mapsUrl: mapsPayload.url || null,
        routeSummaryJson: mapsPayload.summary || null,
        updatedAt: now,
        confirmedAt: isConfirmed ? now : null,
        confirmedById: isConfirmed ? (currentUser?.id || null) : null
    };

    let routeId;

    if (editingRouteId) {
        const { error: updateError } = await supabaseClient
            .from('ExpeditionRoute')
            .update(routePayload)
            .eq('id', editingRouteId);

        if (updateError) {
            if (isExpeditionTablesMissingError(updateError)) {
                throw new Error(expeditionSqlHint());
            }
            if (typeof isExpeditionResponsibleUserSchemaError === 'function'
                && isExpeditionResponsibleUserSchemaError(updateError)) {
                throw new Error(expeditionResponsibleUserSqlHint());
            }
            throw updateError;
        }

        await deleteExpeditionRouteChildren(editingRouteId);
        routeId = editingRouteId;
    } else {
        const insertPayload = {
            ...routePayload,
            createdById: currentUser?.id || null
        };

        const { data: routeRow, error: routeError } = await supabaseClient
            .from('ExpeditionRoute')
            .insert(insertPayload)
            .select('id')
            .single();

        if (routeError) {
            if (isExpeditionTablesMissingError(routeError)) {
                throw new Error(expeditionSqlHint());
            }
            if (typeof isExpeditionResponsibleUserSchemaError === 'function'
                && isExpeditionResponsibleUserSchemaError(routeError)) {
                throw new Error(expeditionResponsibleUserSqlHint());
            }
            throw routeError;
        }

        routeId = routeRow.id;
    }

    try {
        for (let stopIndex = 0; stopIndex < wizardState.stops.length; stopIndex += 1) {
            const stop = wizardState.stops[stopIndex];
            const { data: stopRow, error: stopError } = await supabaseClient
                .from('ExpeditionRouteStop')
                .insert({
                    routeId,
                    sortOrder: stopIndex,
                    addrId: stop.addr?.id || null,
                    addrSnapshot: stop.addr || {}
                })
                .select('id')
                .single();

            if (stopError) throw stopError;

            for (const item of stop.items || []) {
                const itemRow = await insertExpeditionRouteStopItem({
                    routeId,
                    stopId: stopRow.id,
                    item
                });

                const volumeRows = (item.volumes || []).map(vol => ({
                    routeId,
                    stopItemId: itemRow.id,
                    volumeIndex: vol.volumeIndex,
                    volumeCode: vol.volumeCode
                }));

                if (volumeRows.length && Number(item.volumeCount) !== 0) {
                    const { error: volError } = await supabaseClient
                        .from('ExpeditionVolume')
                        .insert(volumeRows);
                    if (volError) throw volError;
                }
            }
        }
    } catch (error) {
        if (!editingRouteId) {
            await supabaseClient.from('ExpeditionRoute').delete().eq('id', routeId);
        }
        throw error;
    }

    return routeId;
}

window.loadExpedicaoRouteList = loadExpedicaoRouteList;
window.openExpedicaoRouteBoardingHistoryModal = openExpedicaoRouteBoardingHistoryModal;
window.closeExpedicaoRouteHistoryModal = closeExpedicaoRouteHistoryModal;
window.persistExpeditionRoute = persistExpeditionRoute;
window.persistExpeditionRouteDraft = persistExpeditionRoute;
window.EXPEDITION_ROUTE_STATUS_OPTIONS = EXPEDITION_ROUTE_STATUS_OPTIONS;
window.EXPEDITION_ROUTE_WIZARD_STATUS_OPTIONS = EXPEDITION_ROUTE_WIZARD_STATUS_OPTIONS;
window.formatExpeditionRouteStatus = formatExpeditionRouteStatus;
window.normalizeExpeditionRouteStatus = normalizeExpeditionRouteStatus;
window.normalizeExpeditionRouteWizardStatus = normalizeExpeditionRouteWizardStatus;
window.canEditExpeditionRoute = canEditExpeditionRoute;
window.canPrintExpeditionRouteLabels = canPrintExpeditionRouteLabels;
window.getExpeditionRoutePrintActionLabel = getExpeditionRoutePrintActionLabel;
window.buildWizardStateFromRoute = buildWizardStateFromRoute;
window.openExpedicaoRouteDetail = openExpedicaoRouteDetail;
window.printExpedicaoRouteLabelsById = printExpedicaoRouteLabelsById;
window.fetchExpeditionEntityIdsAlreadyRouted = fetchExpeditionEntityIdsAlreadyRouted;
window.EXPEDITION_DEFAULT_ROUTE_TIME = EXPEDITION_DEFAULT_ROUTE_TIME;
window.getExpeditionRouteTimeDefault = getExpeditionRouteTimeDefault;
window.buildExpeditionRouteDateTimeIso = buildExpeditionRouteDateTimeIso;
window.formatExpeditionRouteDateTimeLabel = formatExpeditionRouteDateTimeLabel;