function parseSaleValueInput(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;

    const normalized = trimmed.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const num = Number(normalized);
    if (!Number.isFinite(num) || num < 0) return NaN;

    return Math.round(num * 100) / 100;
}

function formatSaleValueForInput(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSaleValueAsCurrencyInput(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatSaleValueCurrencyMaskFromDigits(digits) {
    if (!digits) return '';
    const num = Number(digits) / 100;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function bindSaleValueCurrencyInput(input) {
    if (!input || input.dataset.saleValueCurrencyBound === '1') return;
    input.dataset.saleValueCurrencyBound = '1';

    input.addEventListener('input', () => {
        const digits = String(input.value).replace(/\D/g, '');
        input.value = formatSaleValueCurrencyMaskFromDigits(digits);
    });
}

function normalizeIsoDateValue(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).split('T')[0];
}

function getLocalIsoDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function pickLatestIsoDate(...dates) {
    let latest = '';

    for (const dateStr of dates) {
        const normalized = normalizeIsoDateValue(dateStr);
        if (!normalized) continue;
        if (!latest || normalized > latest) {
            latest = normalized;
        }
    }

    return latest || null;
}

function syncSalesOrderDeliveryDateCaches(orderId, clientDeliveryDate) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return;

    if (typeof ordersCache !== 'undefined') {
        const cacheIndex = ordersCache.findIndex(order => Number(order.id) === normalizedOrderId);
        if (cacheIndex >= 0) {
            ordersCache[cacheIndex] = {
                ...ordersCache[cacheIndex],
                clientDeliveryDate
            };
        }
    }

    if (typeof gestaoOrdersCache !== 'undefined') {
        const cacheIndex = gestaoOrdersCache.findIndex(order => Number(order.id) === normalizedOrderId);
        if (cacheIndex >= 0) {
            gestaoOrdersCache[cacheIndex] = {
                ...gestaoOrdersCache[cacheIndex],
                clientDeliveryDate
            };
        }
    }

    if (typeof activeOrderId !== 'undefined' && Number(activeOrderId) === normalizedOrderId) {
        const detDelivery = document.getElementById('det-delivery');
        if (detDelivery && typeof formatOrderDeliverySummary === 'function') {
            detDelivery.innerText = formatOrderDeliverySummary(normalizedOrderId, clientDeliveryDate);
        }
    }
}

function syncSalesOrderActualDeliveryDateCaches(orderId, actualDeliveryDate) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return;

    if (typeof ordersCache !== 'undefined') {
        const cacheIndex = ordersCache.findIndex(order => Number(order.id) === normalizedOrderId);
        if (cacheIndex >= 0) {
            ordersCache[cacheIndex] = {
                ...ordersCache[cacheIndex],
                actualDeliveryDate
            };
        }
    }

    if (typeof gestaoOrdersCache !== 'undefined') {
        const cacheIndex = gestaoOrdersCache.findIndex(order => Number(order.id) === normalizedOrderId);
        if (cacheIndex >= 0) {
            gestaoOrdersCache[cacheIndex] = {
                ...gestaoOrdersCache[cacheIndex],
                actualDeliveryDate
            };
        }
    }
}

async function resolveSalesOrderUpdateContext(orderId) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return {};

    const caches = [];
    if (typeof gestaoOrdersCache !== 'undefined') caches.push(...gestaoOrdersCache);
    if (typeof ordersCache !== 'undefined') caches.push(...ordersCache);

    const cached = caches.find(order => Number(order.id) === normalizedOrderId);
    if (cached) {
        return {
            clientId: cached.clientId || cached.client?.id || null,
            consultantUserId: cached.consultantUserId || cached.consultor?.id || null,
            orderCode: cached.orderCode || ''
        };
    }

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select('clientId, consultantUserId, orderCode, client:Client(id), consultor:appUsers!consultantUserId(id)')
        .eq('id', normalizedOrderId)
        .maybeSingle();

    if (error || !data) return {};
    return {
        clientId: data.clientId || data.client?.id || null,
        consultantUserId: data.consultantUserId || data.consultor?.id || null,
        orderCode: data.orderCode || ''
    };
}

async function readSalesOrderClientDeliveryDate(orderId, orderCode = '') {
    const normalizedOrderId = Number(orderId);
    let query = supabaseClient.from('salesOrders').select('clientDeliveryDate');

    if (orderCode) {
        query = query.eq('orderCode', String(orderCode).trim());
    } else if (normalizedOrderId) {
        query = query.eq('id', normalizedOrderId);
    } else {
        return null;
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return normalizeIsoDateValue(data.clientDeliveryDate) || null;
}

async function persistSalesOrderClientDeliveryDate(orderId, clientDeliveryDate, contextOverride = null) {
    const normalizedOrderId = Number(orderId);
    const normalizedDate = normalizeIsoDateValue(clientDeliveryDate);
    if (!normalizedOrderId || !normalizedDate) {
        throw new Error('Informe a data de entrega do pedido.');
    }

    const context = {
        ...(await resolveSalesOrderUpdateContext(normalizedOrderId)),
        ...(contextOverride || {})
    };
    const orderCode = context.orderCode || '';
    const now = new Date().toISOString();
    const userId = currentUser?.id || null;

    const { data: rpcUpdated, error: rpcError } = await supabaseClient.rpc(
        'set_sales_order_client_delivery_date',
        {
            p_order_id: normalizedOrderId,
            p_client_delivery_date: normalizedDate
        }
    );

    if (!rpcError && rpcUpdated === true) {
        syncSalesOrderDeliveryDateCaches(normalizedOrderId, normalizedDate);
        return normalizedDate;
    }

    const attempts = [
        { clientDeliveryDate: normalizedDate, updatedAt: now, updatedById: userId },
        { clientDeliveryDate: normalizedDate, updatedAt: now },
        { clientDeliveryDate: normalizedDate }
    ];

    let lastError = rpcError || null;

    for (const attempt of attempts) {
        const cleanPayload = Object.fromEntries(
            Object.entries(attempt).filter(([, value]) => value !== undefined && value !== null && value !== '')
        );
        if (!cleanPayload.clientDeliveryDate) continue;

        let query = supabaseClient.from('salesOrders').update(cleanPayload);
        query = orderCode
            ? query.eq('orderCode', String(orderCode).trim())
            : query.eq('id', normalizedOrderId);

        const { error } = await query;
        if (error) {
            lastError = error;
            if (error.message?.includes('clientDeliveryDate') && Object.keys(cleanPayload).length === 1) {
                break;
            }
            continue;
        }

        const verified = await readSalesOrderClientDeliveryDate(normalizedOrderId, orderCode);
        if (verified === normalizedDate) {
            syncSalesOrderDeliveryDateCaches(normalizedOrderId, normalizedDate);
            return normalizedDate;
        }
    }

    const verified = await readSalesOrderClientDeliveryDate(normalizedOrderId, orderCode);
    if (verified === normalizedDate) {
        syncSalesOrderDeliveryDateCaches(normalizedOrderId, normalizedDate);
        return normalizedDate;
    }

    throw lastError || new Error(
        verified
            ? `A data de entrega não foi gravada (valor atual no banco: ${verified}).`
            : 'Não foi possível salvar a data de entrega do pedido. Execute supabase/create-gestao-order-fields.sql no Supabase.'
    );
}

function syncSalesOrderSaleDateCaches(orderId, saleDate) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return;

    if (typeof ordersCache !== 'undefined') {
        const cacheIndex = ordersCache.findIndex(order => Number(order.id) === normalizedOrderId);
        if (cacheIndex >= 0) {
            ordersCache[cacheIndex] = {
                ...ordersCache[cacheIndex],
                saleDate
            };
        }
    }

    if (typeof gestaoOrdersCache !== 'undefined') {
        const cacheIndex = gestaoOrdersCache.findIndex(order => Number(order.id) === normalizedOrderId);
        if (cacheIndex >= 0) {
            gestaoOrdersCache[cacheIndex] = {
                ...gestaoOrdersCache[cacheIndex],
                saleDate
            };
        }
    }

    if (typeof activeOrderId !== 'undefined' && Number(activeOrderId) === normalizedOrderId) {
        const detSaleDate = document.getElementById('det-sale-date');
        if (detSaleDate) {
            const formatted = typeof formatGestaoDate === 'function'
                ? formatGestaoDate(saleDate)
                : (saleDate || '—');
            detSaleDate.innerText = `Data de venda: ${formatted}`;
        }
    }
}

async function persistSalesOrderSaleDate(orderId, saleDate, contextOverride = null) {
    const normalizedOrderId = Number(orderId);
    const normalizedDate = normalizeIsoDateValue(saleDate);
    if (!normalizedOrderId || !normalizedDate) {
        throw new Error('Informe a data de venda do pedido.');
    }

    const context = {
        ...(await resolveSalesOrderUpdateContext(normalizedOrderId)),
        ...(contextOverride || {})
    };
    const orderCode = context.orderCode || '';
    const now = new Date().toISOString();
    const userId = currentUser?.id || null;

    const attempts = [
        { saleDate: normalizedDate, updatedAt: now, updatedById: userId },
        { saleDate: normalizedDate, updatedAt: now },
        { saleDate: normalizedDate }
    ];

    let lastError = null;

    for (const attempt of attempts) {
        const cleanPayload = Object.fromEntries(
            Object.entries(attempt).filter(([, value]) => value !== undefined && value !== null && value !== '')
        );
        if (!cleanPayload.saleDate) continue;

        let query = supabaseClient.from('salesOrders').update(cleanPayload);
        query = orderCode
            ? query.eq('orderCode', String(orderCode).trim())
            : query.eq('id', normalizedOrderId);

        const { error } = await query;
        if (error) {
            lastError = error;
            if (error.message?.includes('saleDate')) {
                throw new Error('Execute supabase/feats/add-sales-order-sale-date.sql no Supabase.');
            }
            continue;
        }

        syncSalesOrderSaleDateCaches(normalizedOrderId, normalizedDate);
        return normalizedDate;
    }

    throw lastError || new Error('Não foi possível salvar a data de venda do pedido.');
}

async function persistSalesOrderActualDeliveryDate(orderId, actualDeliveryDate, options = {}) {
    const normalizedOrderId = Number(orderId);
    const normalizedDate = normalizeIsoDateValue(actualDeliveryDate);
    if (!normalizedOrderId || !normalizedDate) {
        throw new Error('Informe a data de entrega do pedido.');
    }

    const existingDate = options.existingDate != null
        ? normalizeIsoDateValue(options.existingDate)
        : null;
    const resolvedDate = pickLatestIsoDate(existingDate, normalizedDate) || normalizedDate;
    const now = new Date().toISOString();
    const userId = currentUser?.id || null;

    const attempts = [
        { actualDeliveryDate: resolvedDate, updatedAt: now, updatedById: userId },
        { actualDeliveryDate: resolvedDate, updatedAt: now },
        { actualDeliveryDate: resolvedDate }
    ];

    let lastError = null;

    for (const attempt of attempts) {
        const cleanPayload = Object.fromEntries(
            Object.entries(attempt).filter(([, value]) => value !== undefined && value !== null && value !== '')
        );
        if (!cleanPayload.actualDeliveryDate) continue;

        const { error } = await supabaseClient
            .from('salesOrders')
            .update(cleanPayload)
            .eq('id', normalizedOrderId);

        if (error) {
            lastError = error;
            if (error.message?.includes('actualDeliveryDate')) {
                throw new Error(
                    'Coluna actualDeliveryDate não encontrada. Consulte PENDING-PROD-SQL.md ou supabase/schema/.'
                );
            }
            continue;
        }

        syncSalesOrderActualDeliveryDateCaches(normalizedOrderId, resolvedDate);
        return resolvedDate;
    }

    throw lastError || new Error('Não foi possível salvar a data real de entrega do pedido.');
}

async function updateSalesOrderRecord(orderId, payload = {}, options = {}) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) {
        throw new Error('Pedido inválido.');
    }

    const basePayload = Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
    );
    if (!Object.keys(basePayload).length) return;

        const attemptPayloads = [
        basePayload,
        (() => {
            const next = { ...basePayload };
            delete next.updatedById;
            delete next.updatedAt;
            return next;
        })(),
        (() => {
            const next = { ...basePayload };
            delete next.clientName;
            delete next.consultantName;
            delete next.updatedById;
            delete next.updatedAt;
            return next;
        })()
    ];

    const seen = new Set();
    let lastError = null;

    for (const attempt of attemptPayloads) {
        const cleanPayload = Object.fromEntries(
            Object.entries(attempt).filter(([, value]) => value !== undefined)
        );
        if (!Object.keys(cleanPayload).length) continue;

        if (options.requireClientDeliveryDate && !cleanPayload.clientDeliveryDate) {
            continue;
        }
        if (basePayload.clientDeliveryDate && !cleanPayload.clientDeliveryDate) {
            continue;
        }

        const key = JSON.stringify(cleanPayload);
        if (seen.has(key)) continue;
        seen.add(key);

        const { error } = await supabaseClient
            .from('salesOrders')
            .update(cleanPayload)
            .eq('id', normalizedOrderId);

        if (error) {
            lastError = error;
            continue;
        }

        return;
    }

    throw lastError || new Error('Não foi possível atualizar o pedido.');
}

function isProjectTechnicalDeliveryBeforeOrderDelivery(projectDeliveryDate, orderDeliveryDate) {
    if (!projectDeliveryDate || !orderDeliveryDate) return true;
    return String(projectDeliveryDate) < String(orderDeliveryDate);
}

function isTechnicalProjectForecastEndValid(previsaoDate, projectDeliveryDate) {
    if (!previsaoDate) return false;
    return true;
}

function isTechnicalProjectForecastRangeValid(inicioDate, previsaoDate, projectDeliveryDate) {
    if (!inicioDate || !previsaoDate) return false;
    return String(inicioDate) <= String(previsaoDate);
}

function formatTechnicalProjectForecastRange(inicioDate, previsaoDate) {
    const formatPart = (dateStr) => {
        if (!dateStr) return '';
        const normalized = String(dateStr).slice(0, 10);
        const [year, month, day] = normalized.split('-');
        if (year && month && day) return `${day}/${month}/${year}`;
        return new Date(dateStr).toLocaleDateString('pt-BR');
    };

    const inicioLabel = formatPart(inicioDate);
    const fimLabel = formatPart(previsaoDate);

    if (inicioLabel && fimLabel) return `${inicioLabel} → ${fimLabel}`;
    if (fimLabel) return fimLabel;
    if (inicioLabel) return inicioLabel;
    return '—';
}

function buildOrderProjectTechnicalForecastPayload(inicioDate, previsaoDate) {
    return {
        technicalProjectForecastStartDate: inicioDate || null,
        technicalProjectForecastEndDate: previsaoDate || null
    };
}

function isOrderProjectTechnicalForecastColumnError(message = '') {
    const normalized = String(message);
    return normalized.includes('technicalProjectForecastEndDate')
        || normalized.includes('technicalProjectForecastStartDate');
}

function formatSaleValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
