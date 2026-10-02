let activityLogAdminUsersCache = [];
let activityLogAdminState = {
    page: 0,
    total: 0,
    loading: false
};

async function loadActivityLogAdminUsers() {
    if (activityLogAdminUsersCache.length) return activityLogAdminUsersCache;

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .eq('isActive', true)
        .order('name', { ascending: true });

    if (error) {
        console.warn('loadActivityLogAdminUsers:', error);
        activityLogAdminUsersCache = [];
        return activityLogAdminUsersCache;
    }

    activityLogAdminUsersCache = data || [];
    return activityLogAdminUsersCache;
}

function fillActivityLogAdminUserFilter() {
    const select = document.getElementById('activity-log-filter-user');
    if (!select) return;

    const current = select.value;
    select.innerHTML = `
        <option value="">Todos os usuários</option>
        ${activityLogAdminUsersCache.map(user => `
            <option value="${Number(user.id)}">${escapeHtml(user.name || `Usuário #${user.id}`)}</option>
        `).join('')}
    `;
    if (current) select.value = current;
}

function fillActivityLogAdminActionFilter() {
    const select = document.getElementById('activity-log-filter-action');
    if (!select || select.dataset.filled === '1') return;

    const actions = typeof ACTIVITY_LOG_ACTIONS === 'object' ? ACTIVITY_LOG_ACTIONS : {};
    select.innerHTML = `
        <option value="">Todas as ações</option>
        ${Object.entries(actions).map(([value, label]) => `
            <option value="${escapeHtml(value)}">${escapeHtml(label)}</option>
        `).join('')}
    `;
    select.dataset.filled = '1';
}

function getActivityLogAdminFilters() {
    return {
        changedById: document.getElementById('activity-log-filter-user')?.value || '',
        action: document.getElementById('activity-log-filter-action')?.value || '',
        orderCode: document.getElementById('activity-log-filter-order')?.value?.trim() || '',
        dateFrom: document.getElementById('activity-log-filter-from')?.value || '',
        dateTo: document.getElementById('activity-log-filter-to')?.value || ''
    };
}

function formatActivityLogAdminDateTime(iso) {
    if (!iso) return '—';
    if (typeof formatGestaoDateTime === 'function') return formatGestaoDateTime(iso);
    if (typeof formatDate === 'function') return formatDate(iso);
    return String(iso).slice(0, 16).replace('T', ' ');
}

function renderActivityLogAdminRows(rows) {
    const tbody = document.getElementById('activity-log-table-body');
    const emptyEl = document.getElementById('activity-log-empty');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        return;
    }

    emptyEl?.classList.add('hidden');
    tbody.innerHTML = rows.map(row => {
        const userName = escapeHtml(row.changedBy?.name || '—');
        const actionLabel = escapeHtml(
            (typeof getActivityLogActionLabel === 'function' ? getActivityLogActionLabel(row.action) : row.action)
            + (typeof formatActivityLogRevisionMeta === 'function' ? formatActivityLogRevisionMeta(row) : '')
        );
        const change = escapeHtml(
            typeof formatActivityLogChangeSummary === 'function'
                ? formatActivityLogChangeSummary(row)
                : '—'
        );
        const orderCode = escapeHtml(row.order?.orderCode || (row.orderId ? `#${row.orderId}` : '—'));
        const projectRef = row.orderProjectId
            ? escapeHtml(`Projeto #${row.orderProjectId}`)
            : '—';
        const entity = escapeHtml(`${row.entityType || '—'} #${row.entityId || '—'}`);

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/60">
                <td class="p-2.5 text-xs text-slate-600 whitespace-nowrap">${formatActivityLogAdminDateTime(row.changedAt)}</td>
                <td class="p-2.5 text-xs text-slate-800">${userName}</td>
                <td class="p-2.5 text-xs text-slate-800">${actionLabel}</td>
                <td class="p-2.5 text-xs text-slate-500">${orderCode}</td>
                <td class="p-2.5 text-xs text-slate-500">${projectRef}</td>
                <td class="p-2.5 text-xs text-slate-500 font-mono text-[10px]">${entity}</td>
                <td class="p-2.5 text-xs text-slate-700">${change}</td>
            </tr>
        `;
    }).join('');
}

function updateActivityLogAdminPagination() {
    const pageSize = typeof ACTIVITY_LOG_PAGE_SIZE_DEFAULT === 'number'
        ? ACTIVITY_LOG_PAGE_SIZE_DEFAULT
        : 50;
    const page = activityLogAdminState.page;
    const total = activityLogAdminState.total;
    const from = total ? page * pageSize + 1 : 0;
    const to = Math.min(total, (page + 1) * pageSize);
    const maxPage = total ? Math.ceil(total / pageSize) - 1 : 0;

    const summary = document.getElementById('activity-log-pagination-summary');
    if (summary) {
        summary.textContent = total
            ? `Exibindo ${from}–${to} de ${total}`
            : 'Nenhum registro';
    }

    const prevBtn = document.getElementById('activity-log-prev-page');
    const nextBtn = document.getElementById('activity-log-next-page');
    if (prevBtn) prevBtn.disabled = page <= 0 || activityLogAdminState.loading;
    if (nextBtn) nextBtn.disabled = page >= maxPage || activityLogAdminState.loading;
}

async function loadActivityLogAdminList(resetPage = true) {
    if (!isAdmin() || typeof fetchActivityLogPage !== 'function') return;

    if (resetPage) activityLogAdminState.page = 0;

    const statusEl = document.getElementById('activity-log-status');
    activityLogAdminState.loading = true;
    if (statusEl) statusEl.textContent = 'Carregando...';

    try {
        const filters = getActivityLogAdminFilters();
        const result = await fetchActivityLogPage({
            ...filters,
            page: activityLogAdminState.page
        });

        if (result.missingTable) {
            if (statusEl) {
                statusEl.textContent = 'Tabela ActivityLog não encontrada. Execute supabase/feats/create-activity-log.sql no Supabase.';
            }
            renderActivityLogAdminRows([]);
            activityLogAdminState.total = 0;
            updateActivityLogAdminPagination();
            return;
        }

        activityLogAdminState.total = result.total;
        renderActivityLogAdminRows(result.rows);
        updateActivityLogAdminPagination();
        if (statusEl) statusEl.textContent = '';
    } catch (error) {
        console.error('loadActivityLogAdminList:', error);
        if (statusEl) statusEl.textContent = error.message || 'Erro ao carregar auditoria.';
        renderActivityLogAdminRows([]);
    } finally {
        activityLogAdminState.loading = false;
        updateActivityLogAdminPagination();
    }
}

async function showActivityLogAdmin() {
    if (!isAdmin() || isThirdParty()) return;

    if (typeof showSystemSettings === 'function') {
        await showSystemSettings('activity-log');
        return;
    }

    hideSubViews?.();
    document.getElementById('system-settings-view')?.classList.remove('hidden');
    setSettingsNavActive?.('activity-log');
    await initActivityLogAdminPanel();
}

async function initActivityLogAdminPanel() {
    fillActivityLogAdminActionFilter();
    await loadActivityLogAdminUsers();
    fillActivityLogAdminUserFilter();
    await loadActivityLogAdminList(true);
}

function bindActivityLogAdminEvents() {
    document.getElementById('settings-nav-activity-log')?.addEventListener('click', () => {
        if (typeof editingGestaoOrderId !== 'undefined') editingGestaoOrderId = null;
        showActivityLogAdmin();
    });

    document.getElementById('activity-log-apply-filters')?.addEventListener('click', () => {
        loadActivityLogAdminList(true);
    });

    document.getElementById('activity-log-refresh')?.addEventListener('click', () => {
        loadActivityLogAdminList(false);
    });

    document.getElementById('activity-log-prev-page')?.addEventListener('click', () => {
        if (activityLogAdminState.page <= 0) return;
        activityLogAdminState.page -= 1;
        loadActivityLogAdminList(false);
    });

    document.getElementById('activity-log-next-page')?.addEventListener('click', () => {
        activityLogAdminState.page += 1;
        loadActivityLogAdminList(false);
    });
}

bindActivityLogAdminEvents();

window.showActivityLogAdmin = showActivityLogAdmin;
window.loadActivityLogAdminList = loadActivityLogAdminList;
window.initActivityLogAdminPanel = initActivityLogAdminPanel;
