async function getExpeditionFactoryAddressSnapshot() {
    if (typeof ensureSystemSettingsLoaded === 'function') {
        await ensureSystemSettingsLoaded();
    }
    const settings = typeof systemSettingsCache !== 'undefined' ? systemSettingsCache : {};
    const hasStreet = Boolean(String(settings.expeditionFactoryStreet || '').trim());
    const hasCity = Boolean(String(settings.expeditionFactoryCity || '').trim());
    if (!hasStreet && !hasCity) {
        return { ok: false, message: 'Cadastre o endereço da fábrica em Configurações do sistema.' };
    }

    return {
        ok: true,
        snapshot: {
            street: settings.expeditionFactoryStreet || '',
            number: settings.expeditionFactoryNumber || '',
            complement: settings.expeditionFactoryComplement || '',
            neighborhood: settings.expeditionFactoryNeighborhood || '',
            city: settings.expeditionFactoryCity || '',
            state: settings.expeditionFactoryState || '',
            postalCode: settings.expeditionFactoryPostalCode || ''
        }
    };
}

function buildGoogleMapsDirectionsUrl(originParam, waypointParams, destinationParam) {
    const origin = encodeURIComponent(originParam || '');
    const destination = encodeURIComponent(destinationParam || '');
    const waypoints = (waypointParams || [])
        .map(item => encodeURIComponent(item))
        .filter(Boolean)
        .join('|');

    const parts = [
        'https://www.google.com/maps/dir/?api=1',
        `origin=${origin}`,
        `destination=${destination}`,
        'travelmode=driving'
    ];
    if (waypoints) parts.push(`waypoints=${waypoints}`);
    return parts.join('&');
}

function buildExpeditionRouteMapsUrl(stops, factorySnapshot) {
    const factoryParam = expeditionMapsAddressParam(factorySnapshot);
    if (!factoryParam) return { ok: false, message: 'Endereço da fábrica incompleto.' };

    const stopParams = (stops || [])
        .map(stop => expeditionMapsAddressParam(stop.addr))
        .filter(Boolean);

    if (!stopParams.length) {
        return { ok: false, message: 'Inclua ao menos uma parada com endereço.' };
    }

    if (stopParams.length > 25) {
        return { ok: false, message: 'O Google permite no máximo 25 paradas por rota.' };
    }

    const url = buildGoogleMapsDirectionsUrl(factoryParam, stopParams, factoryParam);
    const summary = {
        stopCount: stopParams.length,
        totalLegs: stopParams.length + 1,
        factory: factoryParam,
        stops: stopParams
    };

    return { ok: true, url, summary };
}

function mergeExpeditionRouteManualMetrics(summary, { totalDistanceKm, totalDurationMinutes }) {
    const next = { ...(summary || {}) };
    if (totalDistanceKm != null && Number.isFinite(totalDistanceKm)) {
        next.totalDistanceKm = totalDistanceKm;
    } else {
        delete next.totalDistanceKm;
    }
    if (totalDurationMinutes != null && Number.isFinite(totalDurationMinutes)) {
        next.totalDurationMinutes = Math.round(totalDurationMinutes);
    } else {
        delete next.totalDurationMinutes;
    }
    if (next.totalDistanceKm != null || next.totalDurationMinutes != null) {
        next.distanceSource = 'manual';
    }
    return next;
}

function formatExpeditionRouteDistanceSummary(summary) {
    if (!summary || summary.totalDistanceKm == null) return '';
    const kmLabel = String(summary.totalDistanceKm).replace('.', ',');
    const parts = [`${kmLabel} km`];
    if (summary.totalDurationMinutes) {
        parts.push(`~${summary.totalDurationMinutes} min`);
    }
    return parts.join(' · ');
}

function parseExpeditionManualDistanceKm(raw) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(',', '.');
    const value = Number(normalized);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 10) / 10;
}

const EXPEDITION_ROUTE_DURATION_STEP_MINUTES = 5;

function parseExpeditionManualDurationMinutes(raw) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return null;
    const value = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(value) || value < 0) return null;
    const step = EXPEDITION_ROUTE_DURATION_STEP_MINUTES;
    return Math.round(value / step) * step;
}

/** Monta o link, abre o Google Maps e devolve URL + resumo base (km/tempo vêm do preenchimento manual). */
function openExpeditionRouteMapsInGoogle(stops, factorySnapshot, manualMetrics = {}) {
    const base = buildExpeditionRouteMapsUrl(stops, factorySnapshot);
    if (!base.ok) return base;

    window.open(base.url, '_blank', 'noopener,noreferrer');

    return {
        ok: true,
        url: base.url,
        summary: mergeExpeditionRouteManualMetrics(base.summary, manualMetrics)
    };
}

window.getExpeditionFactoryAddressSnapshot = getExpeditionFactoryAddressSnapshot;
window.buildExpeditionRouteMapsUrl = buildExpeditionRouteMapsUrl;
window.buildGoogleMapsDirectionsUrl = buildGoogleMapsDirectionsUrl;
window.openExpeditionRouteMapsInGoogle = openExpeditionRouteMapsInGoogle;
window.mergeExpeditionRouteManualMetrics = mergeExpeditionRouteManualMetrics;
window.formatExpeditionRouteDistanceSummary = formatExpeditionRouteDistanceSummary;
window.parseExpeditionManualDistanceKm = parseExpeditionManualDistanceKm;
window.parseExpeditionManualDurationMinutes = parseExpeditionManualDurationMinutes;