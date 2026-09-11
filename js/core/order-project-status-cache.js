let orderProjectStatusesCache = [];
let orderProjectStatusesLoadPromise = null;

function syncGestaoProjectStatusesCacheFromShared(list) {
    if (typeof gestaoProjectStatusesCache === 'undefined') return;
    gestaoProjectStatusesCache = list || orderProjectStatusesCache;
}

function invalidateOrderProjectStatusesCache() {
    orderProjectStatusesCache = [];
    orderProjectStatusesLoadPromise = null;
    syncGestaoProjectStatusesCacheFromShared([]);
}

async function loadOrderProjectStatusesCache({ forceRefresh = false } = {}) {
    if (!forceRefresh && orderProjectStatusesCache.length) {
        return orderProjectStatusesCache;
    }

    if (orderProjectStatusesLoadPromise && !forceRefresh) {
        return orderProjectStatusesLoadPromise;
    }

    orderProjectStatusesLoadPromise = (async () => {
        const { data, error } = await supabaseClient
            .from('OrderProjectStatus')
            .select('id, name, sortOrder, isActive')
            .order('sortOrder', { ascending: true })
            .order('name', { ascending: true });

        if (error) {
            console.error('loadOrderProjectStatusesCache:', error);
            orderProjectStatusesCache = [];
            syncGestaoProjectStatusesCacheFromShared([]);
            return [];
        }

        orderProjectStatusesCache = data || [];
        syncGestaoProjectStatusesCacheFromShared(orderProjectStatusesCache);
        return orderProjectStatusesCache;
    })();

    try {
        return await orderProjectStatusesLoadPromise;
    } finally {
        orderProjectStatusesLoadPromise = null;
    }
}

function findOrderProjectStatusIdByName(name) {
    const normalized = String(name || '').trim();
    if (!normalized || !orderProjectStatusesCache.length) return null;

    const active = orderProjectStatusesCache.find(
        status => status.name === normalized && status.isActive !== false
    );
    if (active?.id) return active.id;

    const match = orderProjectStatusesCache.find(status => status.name === normalized);
    return match?.id || null;
}

async function getOrderProjectStatusIdByName(name) {
    await loadOrderProjectStatusesCache();
    return findOrderProjectStatusIdByName(name);
}

async function getOrderProjectStatusIdsByNames(names) {
    const uniqueNames = [...new Set(
        (names || []).map(item => String(item || '').trim()).filter(Boolean)
    )];
    if (!uniqueNames.length) return [];

    await loadOrderProjectStatusesCache();

    const ids = [];
    uniqueNames.forEach(name => {
        const id = findOrderProjectStatusIdByName(name);
        if (id && !ids.includes(id)) ids.push(id);
    });
    return ids;
}

function getOrderProjectStatusesByIds(ids) {
    const uniqueIds = [...new Set((ids || []).map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return [];

    return uniqueIds
        .map(id => orderProjectStatusesCache.find(status => Number(status.id) === id))
        .filter(Boolean);
}

async function ensureOrderProjectStatusesForIds(statusIds) {
    const uniqueIds = [...new Set((statusIds || []).map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return [];

    await loadOrderProjectStatusesCache();

    const missingIds = uniqueIds.filter(
        id => !orderProjectStatusesCache.some(status => Number(status.id) === id)
    );

    if (missingIds.length) {
        const { data, error } = await supabaseClient
            .from('OrderProjectStatus')
            .select('id, name, sortOrder, isActive')
            .in('id', missingIds);

        if (error) {
            console.error('ensureOrderProjectStatusesForIds:', error);
        } else {
            (data || []).forEach(status => {
                if (!orderProjectStatusesCache.some(item => Number(item.id) === Number(status.id))) {
                    orderProjectStatusesCache.push(status);
                }
            });
            syncGestaoProjectStatusesCacheFromShared(orderProjectStatusesCache);
        }
    }

    return getOrderProjectStatusesByIds(uniqueIds);
}
