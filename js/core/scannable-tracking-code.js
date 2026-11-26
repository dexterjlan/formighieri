const SCANNABLE_TRACKING_PREFIX = {
    VOLUME: 'VOL',
    PART_REQUEST: 'RPP',
    PURCHASE: 'RPC'
};

function generateScannableTrackingToken() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

function generateScannableTrackingCode(prefix) {
    const normalized = String(prefix || SCANNABLE_TRACKING_PREFIX.VOLUME).trim().toUpperCase();
    return `${normalized}-${generateScannableTrackingToken()}`;
}

function generateExpeditionVolumeCode() {
    return generateScannableTrackingCode(SCANNABLE_TRACKING_PREFIX.VOLUME);
}

function generatePartRequestTrackingCode() {
    return generateScannableTrackingCode(SCANNABLE_TRACKING_PREFIX.PART_REQUEST);
}

function generatePurchaseTrackingCode() {
    return generateScannableTrackingCode(SCANNABLE_TRACKING_PREFIX.PURCHASE);
}

function normalizeScannableTrackingCode(value) {
    return String(value || '').trim().toUpperCase();
}

function isExpeditionRequisitionEntityType(entityType) {
    const type = String(entityType || '').trim();
    return type === 'PartRequest' || type === 'Purchase';
}

function buildExpeditionVolumesForStopItem(options = {}) {
    const entityType = options.entityType;
    const trackingCode = normalizeScannableTrackingCode(options.trackingCode);
    if (isExpeditionRequisitionEntityType(entityType) && trackingCode) {
        return [{ volumeIndex: 1, volumeCode: trackingCode }];
    }
    const volumeCount = Number(options.volumeCount);
    if (typeof buildExpeditionVolumesForItem === 'function') {
        return buildExpeditionVolumesForItem(volumeCount);
    }
    return [];
}

window.SCANNABLE_TRACKING_PREFIX = SCANNABLE_TRACKING_PREFIX;
window.generateScannableTrackingCode = generateScannableTrackingCode;
window.generateExpeditionVolumeCode = generateExpeditionVolumeCode;
window.generatePartRequestTrackingCode = generatePartRequestTrackingCode;
window.generatePurchaseTrackingCode = generatePurchaseTrackingCode;
window.normalizeScannableTrackingCode = normalizeScannableTrackingCode;
window.isExpeditionRequisitionEntityType = isExpeditionRequisitionEntityType;
window.buildExpeditionVolumesForStopItem = buildExpeditionVolumesForStopItem;