let expeditionPickerUsersCache = null;
let expeditionPickerUsersLoadedAt = 0;
const EXPEDITION_PICKER_USERS_CACHE_MS = 60 * 1000;

function expeditionResponsibleUserSqlHint() {
    return 'Execute `supabase/feats/expedition-route-responsible-picker.sql` no Supabase SQL Editor (DEV).';
}

function isExpeditionResponsibleUserSchemaError(error) {
    const message = String(error?.message || '');
    return /responsibleUserId|isPicker|schema cache|column/i.test(message);
}

function isExpeditionRouteNameSchemaError(error) {
    const message = String(error?.message || '');
    return /Could not find the 'name' column|'name' column of 'ExpeditionRoute'|ExpeditionRoute.*\bname\b/i.test(message);
}

const EXPEDITION_DEFAULT_ROUTE_NAME_PREFIX = 'Rota ';

function formatExpeditionRouteDisplayName(route) {
    if (!route) return '—';
    const custom = String(route.name ?? '').trim();
    if (custom) return custom;
    const id = Number(route.id);
    if (Number.isFinite(id) && id > 0) return `${EXPEDITION_DEFAULT_ROUTE_NAME_PREFIX}${id}`;
    return '—';
}

function resolveExpeditionRouteNameForPersist(routeId, rawName) {
    const trimmed = String(rawName ?? '').trim();
    if (trimmed) return trimmed;
    const id = Number(routeId);
    if (Number.isFinite(id) && id > 0) return `${EXPEDITION_DEFAULT_ROUTE_NAME_PREFIX}${id}`;
    return '';
}

function getExpeditionResponsibleLabel(route) {
    const embedded = route?.responsibleUser?.name;
    if (embedded) return String(embedded).trim() || '—';
    const fallback = route?.responsibleUserName;
    if (fallback) return String(fallback).trim() || '—';
    return '—';
}

async function fetchExpeditionPickerUsers({ forceReload = false } = {}) {
    const now = Date.now();
    if (!forceReload && expeditionPickerUsersCache
        && now - expeditionPickerUsersLoadedAt < EXPEDITION_PICKER_USERS_CACHE_MS) {
        return expeditionPickerUsersCache;
    }

    const selects = [
        'id, name, role, isActive, isPicker',
        'id, name, role, isActive'
    ];

    let users = [];
    let lastError = null;
    for (const select of selects) {
        const result = await supabaseClient
            .from('appUsers')
            .select(select)
            .eq('isActive', true)
            .order('name', { ascending: true });

        if (!result.error) {
            users = result.data || [];
            lastError = null;
            break;
        }
        lastError = result.error;
        if (!/isPicker|schema cache|column/i.test(result.error.message || '')) {
            throw result.error;
        }
    }

    if (lastError && !users.length) {
        console.warn('fetchExpeditionPickerUsers:', lastError);
        expeditionPickerUsersCache = [];
        expeditionPickerUsersLoadedAt = now;
        return [];
    }

    const hasPickerColumn = users.some(user => Object.prototype.hasOwnProperty.call(user, 'isPicker'));
    const filtered = hasPickerColumn
        ? users.filter(user => Boolean(user.isPicker))
        : users;

    expeditionPickerUsersCache = filtered;
    expeditionPickerUsersLoadedAt = now;
    return filtered;
}

function renderExpeditionWizardResponsibleSelect(users = [], selectedId = null) {
    const selected = Number(selectedId) || '';
    const list = users || [];
    const options = list.map(user => `
        <option value="${Number(user.id)}"${Number(user.id) === selected ? ' selected' : ''}>
            ${escapeHtml(user.name || `Usuário #${user.id}`)}
        </option>
    `).join('');

    const emptyHint = list.length
        ? 'Usuários com atributo Separador no cadastro.'
        : 'Nenhum usuário com atributo Separador. Marque Separador em Admin → Usuários.';

    return `
        <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1" for="expedition-wizard-responsible">Responsável</label>
            <select id="expedition-wizard-responsible"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                ${list.length ? '' : 'disabled'}>
                <option value="">${list.length ? 'Selecione...' : 'Cadastre um separador'}</option>
                ${options}
            </select>
            <p class="text-[10px] text-slate-400 mt-1">${escapeHtml(emptyHint)}</p>
        </div>
    `;
}

window.fetchExpeditionPickerUsers = fetchExpeditionPickerUsers;
window.getExpeditionResponsibleLabel = getExpeditionResponsibleLabel;
window.renderExpeditionWizardResponsibleSelect = renderExpeditionWizardResponsibleSelect;
window.expeditionResponsibleUserSqlHint = expeditionResponsibleUserSqlHint;
window.isExpeditionResponsibleUserSchemaError = isExpeditionResponsibleUserSchemaError;
window.isExpeditionRouteNameSchemaError = isExpeditionRouteNameSchemaError;
window.formatExpeditionRouteDisplayName = formatExpeditionRouteDisplayName;
window.resolveExpeditionRouteNameForPersist = resolveExpeditionRouteNameForPersist;

const EXPEDITION_ROUTE_UI_FIELDS = 'id, name, routeDate, vehicleLabel, driverName, status, mapsUrl, createdAt, confirmedAt, updatedAt';

function getExpeditionRoutesResponsibleFilterUserId(options = {}) {
    const boardingScope = options.filterByLoggedResponsibleUnlessAdmin === true;
    if (boardingScope) {
        if (typeof isAdmin === 'function' && isAdmin()) return null;
        const userId = Number(currentUser?.id);
        return Number.isFinite(userId) && userId > 0 ? userId : null;
    }

    if (typeof hasPickerOnlyExpeditionAccess === 'function' && hasPickerOnlyExpeditionAccess()) {
        const userId = Number(currentUser?.id);
        return Number.isFinite(userId) && userId > 0 ? userId : null;
    }
    return null;
}

function applyExpeditionResponsibleUserRouteFilter(query, options = {}) {
    const responsibleUserId = getExpeditionRoutesResponsibleFilterUserId(options);
    if (!responsibleUserId) return query;
    return query.eq('responsibleUserId', responsibleUserId);
}

function ensureCurrentUserCanAccessExpeditionRoute(route, options = {}) {
    const responsibleUserId = getExpeditionRoutesResponsibleFilterUserId(options);
    if (!responsibleUserId) return;
    if (Number(route?.responsibleUserId) !== responsibleUserId) {
        throw new Error('Esta rota não está atribuída a você como responsável.');
    }
}

async function fetchExpeditionRoutesForUi(options = {}) {
    const {
        limit = 80,
        extraQuery,
        orderRouteDateAsc = false,
        filterByLoggedResponsibleUnlessAdmin = false
    } = options;

    const selects = [
        `${EXPEDITION_ROUTE_UI_FIELDS}, responsibleUserId, responsibleUser:appUsers!responsibleUserId(id, name)`,
        `${EXPEDITION_ROUTE_UI_FIELDS}, responsibleUserId`,
        EXPEDITION_ROUTE_UI_FIELDS,
        'id, routeDate, vehicleLabel, driverName, status, mapsUrl, createdAt, confirmedAt, updatedAt, responsibleUserId'
    ];

    let lastError = null;
    for (const select of selects) {
        let query = supabaseClient
            .from('ExpeditionRoute')
            .select(select);

        if (typeof extraQuery === 'function') {
            query = extraQuery(query);
        }

        query = applyExpeditionResponsibleUserRouteFilter(query, {
            filterByLoggedResponsibleUnlessAdmin
        });

        query = query
            .order('routeDate', { ascending: orderRouteDateAsc })
            .order('id', { ascending: false });

        if (limit) query = query.limit(limit);

        const result = await query;
        if (!result.error) return result.data || [];
        lastError = result.error;
        if (!isExpeditionResponsibleUserSchemaError(result.error)
            && !isExpeditionRouteNameSchemaError(result.error)) {
            throw result.error;
        }
    }

    if (lastError) throw lastError;
    return [];
}

window.fetchExpeditionRoutesForUi = fetchExpeditionRoutesForUi;
window.getExpeditionRoutesResponsibleFilterUserId = getExpeditionRoutesResponsibleFilterUserId;
window.ensureCurrentUserCanAccessExpeditionRoute = ensureCurrentUserCanAccessExpeditionRoute;

async function fetchExpeditionRouteById(routeId, extraFieldList = '') {
    const key = Number(routeId);
    if (!key) return null;

    const suffix = extraFieldList ? `, ${extraFieldList}` : '';
    const base = `id, name, routeDate, vehicleLabel, driverName, status${suffix}`;
    const selects = [
        `${base}, responsibleUserId, responsibleUser:appUsers!responsibleUserId(id, name)`,
        `${base}, responsibleUserId`,
        base,
        `id, routeDate, vehicleLabel, driverName, status${suffix}`
    ];

    let lastError = null;
    for (const select of selects) {
        const result = await supabaseClient
            .from('ExpeditionRoute')
            .select(select)
            .eq('id', key)
            .maybeSingle();
        if (!result.error) return result.data || null;
        lastError = result.error;
        if (!isExpeditionResponsibleUserSchemaError(result.error)
            && !isExpeditionRouteNameSchemaError(result.error)) {
            throw lastError;
        }
    }

    if (lastError) throw lastError;
    return null;
}

window.fetchExpeditionRouteById = fetchExpeditionRouteById;