function generateExpeditionVolumeCode() {
    const token = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    return `VOL-${token}`;
}

function buildExpeditionVolumesForItem(volumeCount) {
    const count = Number(volumeCount);
    if (!Number.isInteger(count) || count < 1) return [];
    const volumes = [];
    for (let index = 1; index <= count; index += 1) {
        volumes.push({
            volumeIndex: index,
            volumeCode: generateExpeditionVolumeCode()
        });
    }
    return volumes;
}

async function fetchExpeditionRouteVolumes(routeId) {
    const key = Number(routeId);
    if (!key) return [];

    const { data, error } = await supabaseClient
        .from('ExpeditionVolume')
        .select(`
            id, volumeIndex, volumeCode, routeId, stopItemId, boardedAt, boardedById, unloadedAt, unloadedById,
            stopItem:ExpeditionRouteStopItem(
                id, entityType, entityId, entityLabel, volumeCount,
                stop:ExpeditionRouteStop(id, sortOrder, addrSnapshot)
            )
        `)
        .eq('routeId', key)
        .order('id', { ascending: true });

    if (error) {
        if (typeof isExpeditionTablesMissingError === 'function' && isExpeditionTablesMissingError(error)) {
            alertAppDialog(expeditionSqlHint());
            return [];
        }
        console.error('fetchExpeditionRouteVolumes:', error);
        alertAppDialog('Erro ao carregar volumes: ' + error.message);
        return [];
    }

    return data || [];
}

function sortExpeditionVolumesForPrint(volumes) {
    return (volumes || []).slice().sort((a, b) => {
        const stopA = Number(a.stopItem?.stop?.sortOrder);
        const stopB = Number(b.stopItem?.stop?.sortOrder);
        if (stopA !== stopB) return stopA - stopB;

        const itemA = Number(a.stopItem?.id) || 0;
        const itemB = Number(b.stopItem?.id) || 0;
        if (itemA !== itemB) return itemA - itemB;

        return (Number(a.volumeIndex) || 0) - (Number(b.volumeIndex) || 0);
    });
}

function buildExpeditionPrintDriverSummary(volumes, route) {
    const sortedVolumes = sortExpeditionVolumesForPrint(volumes);
    const stopsMap = new Map();

    sortedVolumes.forEach(vol => {
        const stop = vol.stopItem?.stop;
        const stopKey = Number(stop?.id) ?? Number(stop?.sortOrder);
        if (!stopsMap.has(stopKey)) {
            stopsMap.set(stopKey, {
                sortOrder: Number(stop?.sortOrder) || 0,
                addr: stop?.addrSnapshot || {},
                items: []
            });
        }

        const stopEntry = stopsMap.get(stopKey);
        const itemId = Number(vol.stopItem?.id);
        let itemEntry = stopEntry.items.find(item => item.stopItemId === itemId);
        if (!itemEntry) {
            itemEntry = {
                stopItemId: itemId,
                entityType: vol.stopItem?.entityType || '',
                entityLabel: vol.stopItem?.entityLabel || '',
                volumeCount: Number(vol.stopItem?.volumeCount) || 0
            };
            stopEntry.items.push(itemEntry);
        }
    });

    const stops = [...stopsMap.values()].sort((a, b) => a.sortOrder - b.sortOrder);

    return {
        sortedVolumes,
        stops,
        totalVolumes: sortedVolumes.length,
        totalStops: stops.length
    };
}

function escapeExpeditionPrintAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function renderExpeditionDriverSummaryHtml(route, summary) {
    const routeDate = route?.routeDate && typeof formatDate === 'function'
        ? formatDate(route.routeDate)
        : '';
    const vehicle = escapeHtml(route?.vehicleLabel || '—');
    const driver = escapeHtml(route?.driverName || '—');
    const routeTitle = typeof formatExpeditionRouteDisplayName === 'function'
        ? formatExpeditionRouteDisplayName(route)
        : (route?.id ? `Rota ${route.id}` : '');
    const distanceLabel = typeof formatExpeditionRouteDistanceSummary === 'function'
        ? formatExpeditionRouteDistanceSummary(route?.routeSummaryJson)
        : '';
    const metaRows = [
        `<tr><th>Rota</th><td>${escapeHtml(routeTitle || '—')}</td></tr>`,
        `<tr><th>Data / horário</th><td>${escapeHtml(routeDate || '—')}</td></tr>`,
        `<tr><th>Carro</th><td>${vehicle}</td></tr>`,
        `<tr><th>Motorista</th><td>${driver}</td></tr>`,
        `<tr><th>Paradas</th><td>${summary.totalStops}</td></tr>`,
        `<tr><th>Volumes</th><td>${summary.totalVolumes}</td></tr>`
    ];
    if (distanceLabel) {
        metaRows.push(`<tr><th>Trajeto</th><td>${escapeHtml(distanceLabel)}</td></tr>`);
    }

    const stopBlocks = summary.stops.map((stop, index) => {
        const addrText = escapeHtml(
            typeof formatExpeditionAddressOneLine === 'function'
                ? formatExpeditionAddressOneLine(stop.addr)
                : ''
        );
        const itemsHtml = (stop.items || []).map(item => {
            const typeLabel = typeof getExpeditionEntityTypeLabel === 'function'
                ? getExpeditionEntityTypeLabel(item.entityType)
                : item.entityType;
            return `<li>
                <span class="item-type">${escapeHtml(typeLabel)}</span> —
                ${escapeHtml(item.entityLabel || '')}
                <span class="item-vol">(${item.volumeCount} vol.)</span>
            </li>`;
        }).join('');

        return `
            <article class="stop-block">
                <h3>Parada ${index + 1}</h3>
                <p class="stop-addr">${addrText || '—'}</p>
                <ul class="stop-items">${itemsHtml || '<li>Sem itens</li>'}</ul>
            </article>
        `;
    }).join('');

    return `
        <section class="driver-sheet" aria-label="Resumo da rota para o motorista">
            <header class="driver-header">
                <h1>${escapeHtml(routeTitle || 'Rota de expedição')}</h1>
                <p class="driver-subtitle">Documento de conferência — fica com o motorista</p>
            </header>
            <table class="meta-table">
                <tbody>${metaRows.join('')}</tbody>
            </table>
            <h2 class="stops-title">Ordem das paradas</h2>
            <div class="stops-grid">${stopBlocks || '<p>Sem paradas.</p>'}</div>
        </section>
    `;
}

function renderExpeditionVolumeLabelHtml(vol) {
    const stopOrder = Number(vol.stopItem?.stop?.sortOrder) || 0;
    const entityLabel = escapeHtml(vol.stopItem?.entityLabel || '');
    const entityType = typeof getExpeditionEntityTypeLabel === 'function'
        ? escapeHtml(getExpeditionEntityTypeLabel(vol.stopItem?.entityType))
        : escapeHtml(vol.stopItem?.entityType || '');
    const addrText = escapeHtml(
        typeof formatExpeditionAddressOneLine === 'function'
            ? formatExpeditionAddressOneLine(vol.stopItem?.stop?.addrSnapshot)
            : ''
    );
    const volumeCode = String(vol.volumeCode || '').trim();
    const volNum = Number(vol.volumeIndex) || 0;
    const volTotal = Number(vol.stopItem?.volumeCount) || volNum;

    return `
        <section class="volume-label">
            <div class="volume-label__head">
                <span class="volume-label__stop">Parada ${stopOrder + 1}</span>
                <span class="volume-label__vol">Vol. ${volNum}/${volTotal}</span>
            </div>
            <p class="volume-label__type">${entityType}</p>
            <p class="volume-label__entity">${entityLabel}</p>
            <p class="volume-label__addr">${addrText || '—'}</p>
            <svg class="vol-barcode" data-barcode="${escapeExpeditionPrintAttr(volumeCode)}"></svg>
        </section>
    `;
}

function resolveExpeditionLabelsScriptBase() {
    const bootstrap = document.querySelector('script[src*="bootstrap.js"]');
    if (bootstrap?.src) {
        return bootstrap.src.replace(/\/js\/bootstrap\.js(\?.*)?$/, '');
    }
    const path = window.location.pathname.replace(/\/[^/]*$/, '');
    return `${window.location.origin}${path}`;
}

function resolveExpeditionJsBarcodeScriptUrl() {
    const base = resolveExpeditionLabelsScriptBase();
    const version = typeof APP_CACHE_VERSION !== 'undefined' ? APP_CACHE_VERSION : Date.now();
    return `${base}/js/vendor/JsBarcode.all.min.js?v=${encodeURIComponent(version)}`;
}

function openExpeditionLabelsPrintShell() {
    const printWindow = window.open('about:blank', '_blank', 'width=960,height=720');
    if (!printWindow) return null;

    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <title>Etiquetas — carregando</title>
    <style>
        body { font-family: system-ui, sans-serif; margin: 0; padding: 32px; text-align: center; color: #475569; }
    </style>
</head>
<body><p>Carregando etiquetas…</p></body>
</html>`);
    printWindow.document.close();
    return printWindow;
}

function printExpeditionVolumeLabels(route, volumes, options = {}) {
    const printWindow = options.printWindow || null;

    if (!volumes?.length) {
        alertAppDialog('Nenhum volume para imprimir.');
        if (printWindow && !printWindow.closed) printWindow.close();
        return;
    }

    const summary = buildExpeditionPrintDriverSummary(volumes, route);
    const routeDate = route?.routeDate && typeof formatDate === 'function'
        ? formatDate(route.routeDate)
        : '';
    const routeDocTitle = typeof formatExpeditionRouteDisplayName === 'function'
        ? formatExpeditionRouteDisplayName(route)
        : `Rota ${route?.id || ''}`;
    const driverSheet = renderExpeditionDriverSummaryHtml(route, summary);
    const volumeCards = summary.sortedVolumes
        .map(vol => renderExpeditionVolumeLabelHtml(vol))
        .join('');
    const volumeGrid = `
        <section class="volume-labels-sheet" aria-label="Etiquetas de volume">
            <h2 class="volume-labels-title">Etiquetas de volume</h2>
            <p class="volume-labels-hint">Impressão em A4 — recorte e cole nos volumes (etiqueta adesiva em versão futura).</p>
            <div class="volume-labels-grid">${volumeCards}</div>
        </section>
    `;

    const jsBarcodeUrl = resolveExpeditionJsBarcodeScriptUrl();

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <title>Expedição — ${escapeHtml(routeDocTitle)}</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, sans-serif; margin: 0; color: #0f172a; }
        .driver-sheet {
            padding: 14px 18px 20px;
            max-width: 210mm;
            margin: 0 auto;
        }
        .driver-header h1 { font-size: 20px; margin: 0 0 4px; }
        .driver-subtitle { font-size: 11px; color: #64748b; margin: 0 0 16px; }
        .meta-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 18px; }
        .meta-table th {
            text-align: left; width: 110px; padding: 6px 8px 6px 0;
            color: #475569; font-weight: 600; vertical-align: top;
        }
        .meta-table td { padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
        .stops-title { font-size: 14px; margin: 0 0 10px; }
        .stops-grid { display: flex; flex-direction: column; gap: 10px; }
        .stop-block {
            border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; page-break-inside: avoid;
        }
        .stop-block h3 { font-size: 12px; margin: 0 0 6px; }
        .stop-addr { font-size: 11px; margin: 0 0 8px; white-space: pre-wrap; color: #334155; }
        .stop-items { margin: 0; padding-left: 18px; font-size: 11px; color: #1e293b; }
        .stop-items li { margin: 2px 0; }
        .item-type { font-weight: 600; }
        .item-vol { color: #64748b; }
        .volume-labels-sheet {
            padding: 12px 14px 16px;
            max-width: 210mm;
            margin: 0 auto;
        }
        .volume-labels-title { font-size: 14px; margin: 0 0 4px; }
        .volume-labels-hint {
            font-size: 10px; color: #64748b; margin: 0 0 12px;
        }
        .volume-labels-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }
        .volume-label {
            border: 1px dashed #334155;
            border-radius: 4px;
            padding: 6px 8px 4px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .volume-label__head {
            display: flex; justify-content: space-between; align-items: center;
            font-size: 11px; font-weight: 700; margin-bottom: 4px;
        }
        .volume-label__vol { color: #334155; }
        .volume-label__type { font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin: 0 0 2px; }
        .volume-label__entity { font-size: 11px; font-weight: 600; margin: 0 0 4px; line-height: 1.25; }
        .volume-label__addr { font-size: 9px; margin: 0 0 4px; white-space: pre-wrap; line-height: 1.25; color: #334155; }
        .vol-barcode { width: 100%; height: auto; display: block; margin: 0 auto; }
        .vol-barcode-fallback { font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-align: center; margin: 4px 0 0; }
        .print-toolbar {
            position: sticky; top: 0; z-index: 10;
            display: flex; gap: 8px; justify-content: center; align-items: center;
            padding: 10px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1;
        }
        .print-toolbar button {
            font: inherit; font-size: 13px; font-weight: 600;
            padding: 8px 14px; border-radius: 8px; border: 0;
            background: #0f172a; color: #fff; cursor: pointer;
        }
        .print-toolbar button.secondary { background: #fff; color: #334155; border: 1px solid #cbd5e1; }
        @media print {
            body { padding: 0; }
            .print-toolbar { display: none !important; }
            .volume-labels-hint { display: none; }
            .driver-sheet { page-break-after: always; }
        }
        @page { size: A4; margin: 10mm; }
    </style>
</head>
<body>
    <div class="print-toolbar no-print">
        <button type="button" id="expedition-labels-print-btn">Imprimir</button>
        <button type="button" class="secondary" id="expedition-labels-close-btn">Fechar</button>
    </div>
    ${driverSheet}
    ${volumeGrid}
    <script src="${escapeExpeditionPrintAttr(jsBarcodeUrl)}"><\/script>
    <script>
        (function () {
            function renderBarcodes() {
                document.querySelectorAll('.vol-barcode').forEach(function (node) {
                    var code = node.getAttribute('data-barcode');
                    if (!code) return;
                    if (typeof JsBarcode !== 'undefined') {
                        try {
                            JsBarcode(node, code, {
                                format: 'CODE128',
                                width: 1.35,
                                height: 34,
                                margin: 1,
                                displayValue: true,
                                fontSize: 9,
                                textMargin: 1
                            });
                            return;
                        } catch (err) {
                            console.error(err);
                        }
                    }
                    var fallback = document.createElement('p');
                    fallback.className = 'vol-barcode-fallback';
                    fallback.textContent = code;
                    node.replaceWith(fallback);
                });
            }

            function doPrint() {
                renderBarcodes();
                window.focus();
                window.print();
            }

            document.getElementById('expedition-labels-print-btn')?.addEventListener('click', doPrint);
            document.getElementById('expedition-labels-close-btn')?.addEventListener('click', function () {
                window.close();
            });

            window.addEventListener('load', function () {
                renderBarcodes();
                if (window.opener) {
                    try { window.opener.postMessage({ type: 'expedition-labels-ready' }, '*'); } catch (e) { /* ignore */ }
                }
                setTimeout(function () {
                    try { doPrint(); } catch (e) { console.warn(e); }
                }, 250);
            });
        })();
    <\/script>
</body>
</html>`;

    let targetWindow = printWindow;
    if (!targetWindow || targetWindow.closed) {
        targetWindow = openExpeditionLabelsPrintShell();
    }
    if (!targetWindow) {
        alertAppDialog('Permita pop-ups para imprimir as etiquetas.');
        return;
    }

    targetWindow.document.open();
    targetWindow.document.write(html);
    targetWindow.document.close();
    targetWindow.focus();

    if (typeof options.onPrintDialog === 'function') {
        const onReady = (event) => {
            if (event.source !== targetWindow) return;
            if (event.data?.type !== 'expedition-labels-ready') return;
            window.removeEventListener('message', onReady);
            options.onPrintDialog();
        };
        window.addEventListener('message', onReady);
    }
}

window.generateExpeditionVolumeCode = generateExpeditionVolumeCode;
window.buildExpeditionVolumesForItem = buildExpeditionVolumesForItem;
window.fetchExpeditionRouteVolumes = fetchExpeditionRouteVolumes;
window.openExpeditionLabelsPrintShell = openExpeditionLabelsPrintShell;
window.printExpeditionVolumeLabels = printExpeditionVolumeLabels;