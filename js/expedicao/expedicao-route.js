const EXPEDITION_ROUTE_LIST_SELECT = `
    id, routeDate, vehicleLabel, driverName, status, mapsUrl, createdAt, confirmedAt
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

    const { data: route, error } = await supabaseClient
        .from('ExpeditionRoute')
        .select(`
            id, routeDate, vehicleLabel, driverName, status, mapsUrl, routeSummaryJson,
            stops:ExpeditionRouteStop(
                id, sortOrder, addrId, addrSnapshot,
                items:ExpeditionRouteStopItem(id, entityType, entityId, entityLabel, volumeCount)
            )
        `)
        .eq('id', key)
        .maybeSingle();

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
            const volumeCount = Number(item.volumeCount) || savedVolumes.length || 1;
            let itemVolumes = savedVolumes.slice().sort((a, b) => a.volumeIndex - b.volumeIndex);
            if (!itemVolumes.length && typeof buildExpeditionVolumesForItem === 'function') {
                itemVolumes = buildExpeditionVolumesForItem(volumeCount);
            }
            return {
                entityType: item.entityType,
                entityId: item.entityId,
                label: item.entityLabel || '',
                volumeCount,
                volumes: itemVolumes
            };
        })
    }));

    const empty = typeof createEmptyExpedicaoWizardState === 'function'
        ? createEmptyExpedicaoWizardState()
        : { step: 'meta', stops: [], currentStop: null, pendingItem: null, maps: null };

    return {
        ...empty,
        editingRouteId: key,
        routeDate: route.routeDate || empty.routeDate,
        vehicleLabel: route.vehicleLabel || '',
        driverName: route.driverName || '',
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
    const base = {
        stopId,
        routeId,
        entityType: item.entityType,
        entityId: item.entityId,
        entityLabel: item.label || '',
        volumeCount: item.volumeCount
    };

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

    if (result.error) {
        throw formatExpeditionStopItemInsertError(result.error, item);
    }

    return result.data;
}

async function loadExpedicaoRouteList() {
    const mount = document.getElementById('expedicao-content');
    if (!mount) return;

    setExpedicaoActionLoading(true, 'Carregando rotas...');

    try {
        const { data, error } = await supabaseClient
            .from('ExpeditionRoute')
            .select(EXPEDITION_ROUTE_LIST_SELECT)
            .order('routeDate', { ascending: false })
            .order('id', { ascending: false })
            .limit(80);

        if (error) {
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

        expedicaoRoutesCache = data || [];
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
                <td class="p-3 text-xs">${statusBadge}</td>
                <td class="p-3 text-xs">
                    <div class="flex flex-wrap gap-1.5">
                        <button type="button"
                            class="expedicao-route-open-btn text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-medium hover:bg-slate-50"
                            data-route-id="${row.id}">Abrir</button>
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
                            <th class="p-3 font-semibold">Status</th>
                            <th class="p-3 font-semibold">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${tableRows || `<tr><td colspan="5" class="p-8 text-center text-xs text-slate-400">Nenhuma rota cadastrada.</td></tr>`}
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
        const { data: route, error } = await supabaseClient
            .from('ExpeditionRoute')
            .select(`
                id, routeDate, vehicleLabel, driverName, status, mapsUrl, routeSummaryJson, confirmedAt,
                stops:ExpeditionRouteStop(
                    id, sortOrder, addrId, addrSnapshot,
                    items:ExpeditionRouteStopItem(id, entityType, entityId, entityLabel, volumeCount)
                )
            `)
            .eq('id', key)
            .maybeSingle();

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
        routeDate: wizardState.routeDate,
        vehicleLabel: wizardState.vehicleLabel,
        driverName: wizardState.driverName,
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

                if (volumeRows.length) {
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