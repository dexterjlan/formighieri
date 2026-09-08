const COMMERCIAL_TEMPERATURE_LABELS = {
    hot: 'Quente',
    warm: 'Moderado',
    cold: 'Frio'
};

const COMMERCIAL_ACTIVITY_TYPE_LABELS = {
    call: 'Ligação',
    meeting: 'Reunião',
    task: 'Tarefa',
    deadline: 'Prazo'
};

const COMMERCIAL_DEAL_SELECT = [
    'id, title, wpsQuoteCode, clientId, ownerUserId, stageId, status, temperature, value, expectedCloseDate, lostReason, orderId, architectId, wonAt, lostAt, createdAt, updatedAt, client:Client(id, name), owner:appUsers!ownerUserId(id, name), stage:DealStage(id, name, sortOrder, outcome), architect:Architect(id, name), order:salesOrders(id, orderCode), activities:DealActivity(id, type, subject, dueDate, dueTime, isDone, doneAt, createdAt, updatedAt, ownerUserId, notes), dealNotes:DealNote(id, createdAt)',
    'id, title, wpsQuoteCode, clientId, ownerUserId, stageId, status, temperature, value, expectedCloseDate, lostReason, orderId, architectId, wonAt, lostAt, createdAt, updatedAt, client:Client(id, name), owner:appUsers!ownerUserId(id, name), stage:DealStage(id, name, sortOrder, outcome), architect:Architect(id, name), order:salesOrders(id, orderCode), activities:DealActivity(id, type, subject, dueDate, dueTime, isDone, doneAt, createdAt, updatedAt, ownerUserId, notes)',
    'id, title, wpsQuoteCode, clientId, ownerUserId, stageId, status, temperature, value, expectedCloseDate, lostReason, orderId, architectId, wonAt, lostAt, createdAt, updatedAt, client:Client(id, name), owner:appUsers!ownerUserId(id, name), stage:DealStage(id, name, sortOrder, outcome), order:salesOrders(id, orderCode), activities:DealActivity(id, type, subject, dueDate, dueTime, isDone, doneAt, ownerUserId, notes)',
    'id, title, wpsQuoteCode, clientId, ownerUserId, stageId, status, temperature, value, expectedCloseDate, lostReason, orderId, wonAt, lostAt, createdAt, updatedAt, client:Client(id, name), owner:appUsers!ownerUserId(id, name), stage:DealStage(id, name, sortOrder, outcome), order:salesOrders(id, orderCode), activities:DealActivity(id, type, subject, dueDate, isDone, dueTime)',
    'id, title, clientId, ownerUserId, stageId, status, temperature, value, expectedCloseDate, lostReason, orderId, wonAt, lostAt, createdAt, updatedAt, client:Client(id, name), owner:appUsers!ownerUserId(id, name), stage:DealStage(id, name, sortOrder, outcome)'
];

let comercialStagesCache = [];
let comercialDealsCache = [];
let comercialConsultantsCache = [];
let comercialActiveTab = 'board';
let comercialOwnerFilter = 'mine';

function comercialTodayIso() {
    if (typeof getLocalIsoDate === 'function') return getLocalIsoDate();
    return new Date().toISOString().slice(0, 10);
}

function formatComercialDate(dateStr) {
    if (!dateStr) return '—';
    const part = String(dateStr).split('T')[0];
    const [year, month, day] = part.split('-');
    if (!year || !month || !day) return '—';
    return `${day}/${month}/${year}`;
}

function formatComercialMoney(value) {
    if (value == null || value === '') return '';
    if (typeof formatSaleValue === 'function') return formatSaleValue(value);
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function sumComercialDealValues(deals) {
    return (deals || []).reduce((total, deal) => {
        const number = Number(deal?.value);
        return total + (Number.isFinite(number) ? number : 0);
    }, 0);
}

function canEditComercialDeal(deal) {
    if (!canAccessComercial()) return false;
    if (canSeeAllDeals()) return true;
    return Number(deal?.ownerUserId) === Number(currentUser?.id);
}

function getDealActivities(deal) {
    const list = deal?.activities || deal?.DealActivity || [];
    return Array.isArray(list) ? list : [];
}

function getDealNotes(deal) {
    const list = deal?.dealNotes || deal?.DealNote || [];
    return Array.isArray(list) ? list : [];
}

function toComercialTimestamp(value) {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

function getDealLastChangeAt(deal) {
    const stamps = [deal?.updatedAt, deal?.createdAt, deal?.wonAt, deal?.lostAt];
    getDealActivities(deal).forEach(item => {
        stamps.push(item.updatedAt, item.createdAt, item.doneAt);
    });
    getDealNotes(deal).forEach(item => {
        stamps.push(item.createdAt);
    });
    let latest = 0;
    stamps.forEach(value => {
        latest = Math.max(latest, toComercialTimestamp(value));
    });
    return latest || 0;
}

function daysSinceDealChange(deal) {
    const lastAt = getDealLastChangeAt(deal);
    if (!lastAt) return null;
    const date = new Date(lastAt);
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((today - start) / 86400000));
}

function formatDealIdleDaysLabel(deal) {
    const days = daysSinceDealChange(deal);
    if (days == null) return '';
    if (days === 0) return 'hoje';
    if (days === 1) return 'há 1 dia';
    return `há ${days} dias`;
}

async function touchComercialDealUpdatedAt(dealId) {
    if (!dealId) return;
    await supabaseClient.from('Deal').update({
        updatedAt: new Date().toISOString(),
        updatedById: currentUser?.id || null
    }).eq('id', dealId);
}

function getDealNextActivity(deal) {
    const open = getDealActivities(deal)
        .filter(item => !item.isDone && item.dueDate)
        .slice()
        .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    return open[0] || null;
}

function isDealNextOverdue(deal) {
    const next = getDealNextActivity(deal);
    if (!next?.dueDate) return false;
    return String(next.dueDate).slice(0, 10) < comercialTodayIso();
}

function dealHasOpenActivity(deal) {
    return Boolean(getDealNextActivity(deal));
}

function applyComercialOwnerScope(query) {
    if (canSeeAllDeals() && comercialOwnerFilter === 'all') return query;
    return query.eq('ownerUserId', currentUser.id);
}

async function loadComercialStages(activeOnly = true) {
    let query = supabaseClient
        .from('DealStage')
        .select('id, name, sortOrder, outcome, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });
    if (activeOnly) query = query.eq('isActive', true);
    const { data, error } = await query;
    if (error) {
        console.error('loadComercialStages:', error);
        comercialStagesCache = [];
        return [];
    }
    comercialStagesCache = data || [];
    return comercialStagesCache;
}

async function loadComercialConsultants() {
    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name, role')
        .in('role', ['Consultor', 'Admin'])
        .eq('isActive', true)
        .order('name', { ascending: true });
    if (error) {
        comercialConsultantsCache = [];
        return [];
    }
    comercialConsultantsCache = data || [];
    return comercialConsultantsCache;
}

async function loadComercialDeals(status = 'open') {
    let lastError = null;
    for (const select of COMMERCIAL_DEAL_SELECT) {
        let query = supabaseClient
            .from('Deal')
            .select(select)
            .eq('status', status)
            .order('updatedAt', { ascending: false });
        query = applyComercialOwnerScope(query);
        const { data, error } = await query;
        if (!error) {
            comercialDealsCache = data || [];
            return comercialDealsCache;
        }
        lastError = error;
        if (!/relationship|embed|schema cache|column/i.test(error.message || '')) break;
    }
    console.error('loadComercialDeals:', lastError);
    comercialDealsCache = [];
    if (lastError?.message?.includes('Deal')) {
        alertAppDialog('Execute supabase/feats/create-commercial-funnel.sql no Supabase SQL Editor (DEV).');
    }
    return [];
}

function filterComercialBoardDeals(deals) {
    const temperature = document.getElementById('comercial-filter-temperature')?.value || '';
    const missingNext = Boolean(document.getElementById('comercial-filter-no-next')?.checked);
    return (deals || []).filter(deal => {
        if (temperature && deal.temperature !== temperature) return false;
        if (missingNext && dealHasOpenActivity(deal)) return false;
        return true;
    });
}

async function showComercial(tab = comercialActiveTab) {
    if (!canAccessComercial()) {
        if (typeof showWelcome === 'function') showWelcome();
        return;
    }

    hideSubViews();
    document.getElementById('comercial-view')?.classList.remove('hidden');
    if (typeof updateMainNavActive === 'function') updateMainNavActive('comercial');
    if (typeof updateAdminNav === 'function') updateAdminNav();
    if (typeof saveAppNavState === 'function') saveAppNavState({ view: 'comercial', comercialTab: tab });

    const ownerWrap = document.getElementById('comercial-filter-owner-wrap');
    ownerWrap?.classList.toggle('hidden', !canSeeAllDeals());
    if (canSeeAllDeals() && document.getElementById('comercial-filter-owner')) {
        document.getElementById('comercial-filter-owner').value = comercialOwnerFilter;
    }

    await loadComercialStages(true);
    await loadComercialConsultants();
    setComercialTab(tab, { skipLoad: false });
}

function setComercialTab(tab, options = {}) {
    comercialActiveTab = tab || 'board';
    const panelWrap = document.getElementById('comercial-panel-wrap');
    const boardWrap = document.getElementById('comercial-board-wrap');
    const todayWrap = document.getElementById('comercial-today-wrap');
    const statusWrap = document.getElementById('comercial-status-wrap');
    panelWrap?.classList.toggle('hidden', comercialActiveTab !== 'panel');
    boardWrap?.classList.toggle('hidden', comercialActiveTab !== 'board');
    todayWrap?.classList.toggle('hidden', comercialActiveTab !== 'today');
    statusWrap?.classList.toggle('hidden', comercialActiveTab !== 'won' && comercialActiveTab !== 'lost');
    document.getElementById('comercial-filters')?.classList.toggle('comercial-filters--panel', comercialActiveTab === 'panel');

    ['panel', 'board', 'today', 'won', 'lost'].forEach(key => {
        document.getElementById(`comercial-tab-${key}`)?.classList.toggle('is-active', comercialActiveTab === key);
    });

    if (typeof saveAppNavState === 'function') {
        saveAppNavState({ view: 'comercial', comercialTab: comercialActiveTab });
    }

    if (options.skipLoad) return;
    if (comercialActiveTab === 'panel' && typeof loadComercialPanel === 'function') loadComercialPanel();
    else if (comercialActiveTab === 'board') loadComercialBoard();
    else if (comercialActiveTab === 'today') loadComercialToday();
    else loadComercialStatusList(comercialActiveTab);
}

async function refreshComercialView() {
    if (document.getElementById('comercial-view')?.classList.contains('hidden')) return;
    if (comercialActiveTab === 'panel' && typeof loadComercialPanel === 'function') await loadComercialPanel();
    else if (comercialActiveTab === 'board') await loadComercialBoard();
    else if (comercialActiveTab === 'today') await loadComercialToday();
    else await loadComercialStatusList(comercialActiveTab);
}

async function persistDealOrderLink(orderId, dealId, options = {}) {
    if (!orderId) return;
    if (!dealId) {
        await supabaseClient.from('Deal').update({ orderId: null, updatedAt: new Date().toISOString() }).eq('orderId', orderId);
        return;
    }
    const now = new Date().toISOString();
    await supabaseClient.from('Deal').update({ orderId: null, updatedAt: now }).eq('orderId', orderId);
    const { error } = await supabaseClient
        .from('Deal')
        .update({ orderId, updatedAt: now, updatedById: currentUser?.id || null })
        .eq('id', dealId);
    if (error) throw error;
    await syncArchitectBetweenDealAndOrder(orderId, dealId, { fillOrder: options.fillOrder !== false, fillDeal: options.fillDeal !== false });
}

async function syncArchitectBetweenDealAndOrder(orderId, dealId, options = {}) {
    if (!orderId || !dealId) return;

    let dealArchitectId = null;
    let orderArchitectId = null;

    const dealResult = await supabaseClient.from('Deal').select('architectId').eq('id', dealId).maybeSingle();
    if (!dealResult.error) dealArchitectId = dealResult.data?.architectId || null;

    const orderResult = await supabaseClient.from('salesOrders').select('architectId').eq('id', orderId).maybeSingle();
    if (!orderResult.error) orderArchitectId = orderResult.data?.architectId || null;

    if (options.fillOrder !== false && dealArchitectId && !orderArchitectId && typeof persistSalesOrderArchitectId === 'function') {
        await persistSalesOrderArchitectId(orderId, dealArchitectId);
        return;
    }

    if (options.fillDeal !== false && orderArchitectId && !dealArchitectId) {
        const { error } = await supabaseClient
            .from('Deal')
            .update({
                architectId: orderArchitectId,
                updatedAt: new Date().toISOString(),
                updatedById: currentUser?.id || null
            })
            .eq('id', dealId);
        if (error && !/architectId/i.test(error.message || '')) {
            console.warn('syncArchitectBetweenDealAndOrder:', error);
        }
    }
}

async function tryLinkUniqueWonDealForClient(orderId, clientId) {
    if (!orderId || !clientId) return;
    const { data, error } = await supabaseClient
        .from('Deal')
        .select('id')
        .eq('status', 'won')
        .eq('clientId', clientId)
        .is('orderId', null);
    if (error || !data || data.length !== 1) return;
    try {
        await persistDealOrderLink(orderId, data[0].id);
    } catch (linkError) {
        console.warn('tryLinkUniqueWonDealForClient:', linkError);
    }
}

async function loadWonDealsForOrderForm(clientId, currentOrderId = null) {
    const select = document.getElementById('gestao-ord-deal');
    if (!select) return;
    select.innerHTML = '<option value="">Sem vínculo</option>';
    if (!clientId) return;

    let query = supabaseClient
        .from('Deal')
        .select('id, title, orderId, order:salesOrders(orderCode)')
        .eq('status', 'won')
        .eq('clientId', clientId)
        .order('wonAt', { ascending: false });
    const { data, error } = await query;
    if (error) return;

    (data || []).forEach(deal => {
        const linkedHere = currentOrderId && Number(deal.orderId) === Number(currentOrderId);
        if (deal.orderId && !linkedHere) return;
        const option = document.createElement('option');
        option.value = String(deal.id);
        option.textContent = deal.title || `Negócio #${deal.id}`;
        if (linkedHere) option.selected = true;
        select.appendChild(option);
    });
}

function bindComercialEvents() {
    document.getElementById('btn-comercial')?.addEventListener('click', () => showComercial('board'));
    document.getElementById('comercial-tab-board')?.addEventListener('click', () => setComercialTab('board'));
    document.getElementById('comercial-tab-today')?.addEventListener('click', () => setComercialTab('today'));
    document.getElementById('comercial-tab-won')?.addEventListener('click', () => setComercialTab('won'));
    document.getElementById('comercial-tab-lost')?.addEventListener('click', () => setComercialTab('lost'));
    if (typeof bindComercialPanelEvents === 'function') bindComercialPanelEvents();
    document.getElementById('btn-comercial-new-deal')?.addEventListener('click', () => openComercialDealPanel(null));
    document.getElementById('comercial-filter-owner')?.addEventListener('change', event => {
        comercialOwnerFilter = event.target.value === 'all' ? 'all' : 'mine';
        refreshComercialView();
    });
    document.getElementById('comercial-filter-temperature')?.addEventListener('change', () => {
        if (comercialActiveTab === 'board') renderComercialBoard();
        else refreshComercialView();
    });
    document.getElementById('comercial-filter-no-next')?.addEventListener('change', () => {
        if (comercialActiveTab === 'board') renderComercialBoard();
        else if (comercialActiveTab === 'today') loadComercialToday();
    });
    bindComercialDealPanelEvents();
    bindComercialActivityEvents();
}
