function getOrderClientName(order) {
    if (order?.client?.name) return order.client.name;
    if (order?.id && typeof ordersCache !== 'undefined') {
        const cached = ordersCache.find(item => Number(item.id) === Number(order.id));
        if (cached?.client?.name) return cached.client.name;
    }
    return '';
}

function getOrderConsultantNameFromRecord(order) {
    if (order?.consultor?.name) return order.consultor.name;

    const consultantUserId = Number(order?.consultantUserId || order?.consultor?.id);
    if (consultantUserId) {
        const cachedConsultant = (consultantUsersCache || []).find(
            consultant => Number(consultant.id) === consultantUserId
        );
        if (cachedConsultant?.name) return cachedConsultant.name;
    }

    if (order?.id && typeof ordersCache !== 'undefined') {
        const cached = ordersCache.find(item => Number(item.id) === Number(order.id));
        if (cached && cached !== order) {
            return getOrderConsultantNameFromRecord(cached);
        }
    }

    return '';
}

function getOrderConsultantName(orderId) {
    if (!orderId || typeof ordersCache === 'undefined') return null;
    const order = ordersCache.find(o => o.id === orderId);
    if (!order) return null;
    return getOrderConsultantNameFromRecord(order) || null;
}

function getOrderConsultantUserId(orderId) {
    if (!orderId || typeof ordersCache === 'undefined') return null;
    const userId = ordersCache.find(o => o.id === orderId)?.consultantUserId;
    return userId == null ? null : Number(userId);
}

function normalizeConsultantNameKey(name) {
    return String(name || '').trim().toLocaleLowerCase('pt-BR');
}

function isCurrentUserOrderConsultor(consultantNameOnOrder, consultantUserId = null, user = currentUser) {
    if (!user || user.role !== 'Consultor') return false;

    const currentUserId = Number(user.id);
    const orderUserId = Number(consultantUserId);
    if (currentUserId && orderUserId && currentUserId === orderUserId) return true;

    if (!consultantNameOnOrder) return false;
    return normalizeConsultantNameKey(user.name) === normalizeConsultantNameKey(consultantNameOnOrder);
}

let consultantUsersCache = [];

async function loadConsultantUsersCache(force = false) {
    if (consultantUsersCache.length && !force) return consultantUsersCache;

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('role', 'Consultor')
        .eq('isActive', true)
        .order('name', { ascending: true });

    if (error) {
        console.error('loadConsultantUsersCache:', error);
        return consultantUsersCache;
    }

    consultantUsersCache = data || [];
    return consultantUsersCache;
}

function resolveConsultantUserIdByName(consultantName, consultants = consultantUsersCache) {
    const key = normalizeConsultantNameKey(consultantName);
    if (!key) return null;

    const match = (consultants || []).find(consultant => normalizeConsultantNameKey(consultant.name) === key);
    return match?.id || null;
}

async function resolveConsultantUserIdByNameAsync(consultantName) {
    await loadConsultantUsersCache();
    return resolveConsultantUserIdByName(consultantName);
}

async function fetchConsultantUserById(consultantUserId) {
    const normalizedId = Number(consultantUserId);
    if (!normalizedId) return null;

    const cached = (consultantUsersCache || []).find(consultant => Number(consultant.id) === normalizedId);
    if (cached) return cached;

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name, role, isActive')
        .eq('id', normalizedId)
        .maybeSingle();

    if (error || !data) return null;
    return data;
}

async function resolveConsultantNameById(consultantUserId) {
    const consultant = await fetchConsultantUserById(consultantUserId);
    return consultant?.name || '';
}

async function syncSalesOrdersConsultantName(oldName, newName, consultantUserId = null) {
    const from = String(oldName || '').trim();
    const to = String(newName || '').trim();
    const resolvedUserId = Number(consultantUserId);
    if (!to && !resolvedUserId) return;

    const updateCacheConsultor = order => {
        const matchesUser = resolvedUserId && Number(order.consultantUserId) === resolvedUserId;
        const matchesName = from
            && normalizeConsultantNameKey(getOrderConsultantNameFromRecord(order)) === normalizeConsultantNameKey(from);
        if (!matchesUser && !matchesName) return;
        if (order.consultor) {
            order.consultor = { ...order.consultor, name: to };
        } else if (to) {
            order.consultor = { id: resolvedUserId || order.consultor?.id, name: to };
        }
        if (resolvedUserId) order.consultantUserId = resolvedUserId;
    };

    if (typeof ordersCache !== 'undefined' && Array.isArray(ordersCache)) {
        ordersCache.forEach(updateCacheConsultor);
    }

    if (typeof gestaoOrdersCache !== 'undefined' && Array.isArray(gestaoOrdersCache)) {
        gestaoOrdersCache.forEach(updateCacheConsultor);
    }
}

async function enrichItemsWithOrderConsultantUserId(items, getOrder = item => item?.order) {
    if (!items?.length) return items || [];

    await loadConsultantUsersCache();

    return items.map(item => {
        const order = getOrder(item);
        if (!order || order.consultantUserId) return item;

        const consultantUserId = order.consultor?.id
            || resolveConsultantUserIdByName(getOrderConsultantNameFromRecord(order));
        if (!consultantUserId) return item;

        return { ...item, order: { ...order, consultantUserId } };
    });
}
