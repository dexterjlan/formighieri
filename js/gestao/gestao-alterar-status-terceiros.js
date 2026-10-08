let gestaoAlterarStatusTerceirosCache = [];

function getGestaoThirdPartyStatusOptions() {
    return [
        typeof THIRD_PARTY_PROJECT_STATUS_OPEN === 'string' ? THIRD_PARTY_PROJECT_STATUS_OPEN : 'Open',
        typeof THIRD_PARTY_PROJECT_STATUS_SENT === 'string' ? THIRD_PARTY_PROJECT_STATUS_SENT : 'Sent',
        typeof THIRD_PARTY_PROJECT_STATUS_IN_REVIEW === 'string' ? THIRD_PARTY_PROJECT_STATUS_IN_REVIEW : 'InReview',
        typeof THIRD_PARTY_PROJECT_STATUS_APPROVED === 'string' ? THIRD_PARTY_PROJECT_STATUS_APPROVED : 'Approved'
    ];
}

function getGestaoThirdPartyStatusLabel(status) {
    if (typeof getThirdPartyProjectStatusLabel === 'function') {
        return getThirdPartyProjectStatusLabel(status);
    }
    return status || '—';
}

function getGestaoThirdPartyStatusOptionsHtml(selectedStatus = '') {
    return getGestaoThirdPartyStatusOptions().map(status => `
        <option value="${escapeHtml(status)}" ${status === selectedStatus ? 'selected' : ''}>
            ${escapeHtml(getGestaoThirdPartyStatusLabel(status))}
        </option>
    `).join('');
}

function getGestaoAlterarStatusTerceiroName(project) {
    const subtype = project?.thirdPartySubtype?.name || '';
    const characteristic = project?.projectCharacteristic?.name || '';
    if (subtype && characteristic && subtype !== characteristic) {
        return `${subtype} · ${characteristic}`;
    }
    return subtype || characteristic || '—';
}

function setGestaoAlterarStatusTerceirosSaveButtonState(button, state = 'idle', pendingCount = 0) {
    if (!button) return;

    if (state === 'saving') {
        button.dataset.originalLabel = button.textContent;
        button.disabled = true;
        button.textContent = 'Salvando...';
        return;
    }

    button.disabled = pendingCount === 0;
    button.textContent = pendingCount > 0
        ? `Salvar alterações (${pendingCount})`
        : (button.dataset.originalLabel || 'Salvar alterações');
}

function collectGestaoAlterarStatusTerceirosPendingChanges() {
    const tbody = document.getElementById('gestao-alterar-status-terceiros-list');
    if (!tbody) return [];

    const changes = [];

    tbody.querySelectorAll('tr[data-third-party-project-id]').forEach(row => {
        const projectId = Number(row.dataset.thirdPartyProjectId);
        const select = row.querySelector('.gestao-alterar-status-terceiros-new');
        const newStatus = select?.value || '';
        const currentStatus = select?.dataset.currentStatus || '';

        if (!projectId || !newStatus || newStatus === currentStatus) return;

        const project = gestaoAlterarStatusTerceirosCache.find(item => Number(item.id) === projectId);
        if (!project) return;

        changes.push({
            projectId,
            project,
            row,
            select,
            currentStatus,
            newStatus,
            currentStatusName: getGestaoThirdPartyStatusLabel(currentStatus),
            newStatusName: getGestaoThirdPartyStatusLabel(newStatus)
        });
    });

    return changes;
}

function syncGestaoAlterarStatusTerceirosSaveButton() {
    const button = document.getElementById('gestao-alterar-status-terceiros-save-all');
    setGestaoAlterarStatusTerceirosSaveButtonState(
        button,
        'idle',
        collectGestaoAlterarStatusTerceirosPendingChanges().length
    );
}

async function fetchGestaoAlterarStatusTerceiros(filters = {}) {
    const orderCode = String(filters.orderCode || '').trim();
    const clientName = String(filters.clientName || '').trim();

    if (!orderCode && !clientName) {
        return { projects: [], requiresFilter: true };
    }

    const orderSelect = clientName
        ? 'id, orderCode, clientId, consultantUserId, client:Client!inner(name), consultor:appUsers!consultantUserId(name)'
        : getSalesOrderMinimalEmbedSelect();

    let orderQuery = supabaseClient
        .from('salesOrders')
        .select(orderSelect)
        .order('orderCode', { ascending: true })
        .limit(200);

    if (orderCode) {
        orderQuery = orderQuery.ilike('orderCode', `%${orderCode}%`);
    }
    if (clientName) {
        orderQuery = orderQuery.ilike('client.name', `%${clientName}%`);
    }

    const { data: orders, error: ordersError } = await orderQuery;
    if (ordersError) throw new Error(ordersError.message);
    if (!orders?.length) return { projects: [], requiresFilter: false };

    const orderById = Object.fromEntries(orders.map(order => [Number(order.id), order]));
    const orderIds = orders.map(order => order.id);

    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .select(`
            id, orderId, orderProjectId, status,
            thirdPartySubtype:ThirdPartySubtype(id, name),
            projectCharacteristic:ProjectCharacteristic(id, name),
            orderProject:OrderProject(id, name)
        `)
        .in('orderId', orderIds)
        .order('orderId', { ascending: true });

    if (error) {
        throw new Error(
            typeof formatThirdPartyProjectMutationError === 'function'
                ? formatThirdPartyProjectMutationError(error)
                : error.message
        );
    }

    const projects = (data || []).map(project => ({
        ...project,
        order: orderById[Number(project.orderId)] || null
    })).sort((a, b) => {
        const orderCompare = String(a.order?.orderCode || '').localeCompare(
            String(b.order?.orderCode || ''),
            'pt-BR',
            { numeric: true }
        );
        if (orderCompare !== 0) return orderCompare;
        const projectCompare = String(a.orderProject?.name || '').localeCompare(
            String(b.orderProject?.name || ''),
            'pt-BR'
        );
        if (projectCompare !== 0) return projectCompare;
        return getGestaoAlterarStatusTerceiroName(a).localeCompare(
            getGestaoAlterarStatusTerceiroName(b),
            'pt-BR'
        );
    });

    return { projects, requiresFilter: false };
}

function renderGestaoAlterarStatusTerceirosList(projects = gestaoAlterarStatusTerceirosCache) {
    const tbody = document.getElementById('gestao-alterar-status-terceiros-list');
    const countEl = document.getElementById('gestao-alterar-status-terceiros-count');
    if (!tbody) return;

    if (countEl) {
        countEl.textContent = `${projects.length} projeto(s)`;
    }

    if (!projects.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-6 text-center text-xs text-slate-500">
                    Nenhum projeto de terceiros encontrado para os filtros informados.
                </td>
            </tr>
        `;
        syncGestaoAlterarStatusTerceirosSaveButton();
        return;
    }

    tbody.innerHTML = projects.map(project => {
        const currentStatus = project.status || '';
        return `
            <tr data-third-party-project-id="${project.id}">
                <td class="p-3 font-mono text-xs text-indigo-800 whitespace-nowrap">${escapeHtml(project.order?.orderCode || '—')}</td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(getOrderClientName(project.order) || '—')}</td>
                <td class="p-3 text-xs text-slate-800">${escapeHtml(project.orderProject?.name || '—')}</td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(getGestaoAlterarStatusTerceiroName(project))}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(getGestaoThirdPartyStatusLabel(currentStatus))}</td>
                <td class="p-3">
                    <select class="gestao-alterar-status-terceiros-new w-full min-w-[140px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                        data-current-status="${escapeHtml(currentStatus)}">
                        ${getGestaoThirdPartyStatusOptionsHtml(currentStatus)}
                    </select>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.gestao-alterar-status-terceiros-new').forEach(select => {
        select.addEventListener('change', syncGestaoAlterarStatusTerceirosSaveButton);
    });

    syncGestaoAlterarStatusTerceirosSaveButton();
}

async function saveGestaoAlterarStatusTerceirosPendingChanges() {
    if (!canAccessGestao()) return;

    const changes = collectGestaoAlterarStatusTerceirosPendingChanges();
    if (!changes.length) {
        alertAppDialog('Nenhuma alteração de status para salvar.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const summaryLines = changes.slice(0, 8).map(change => {
        const orderCode = change.project.order?.orderCode || '—';
        const projectName = change.project.orderProject?.name || '—';
        const thirdPartyName = getGestaoAlterarStatusTerceiroName(change.project);
        return `• ${orderCode} — ${projectName} (${thirdPartyName}): ${change.currentStatusName} → ${change.newStatusName}`;
    });
    const extraCount = changes.length - summaryLines.length;
    const extraLine = extraCount > 0 ? `\n... e mais ${extraCount} projeto(s).` : '';

    const confirmed = await confirmAppDialog(
        `Confirmar alteração de status de ${changes.length} projeto(s) de terceiros?\n\n${summaryLines.join('\n')}${extraLine}`
    );
    if (!confirmed) return;

    await withGestaoCadastroSaveOverlay(document.getElementById('gestao-alterar-status-terceiros-panel'), async () => {
        const button = document.getElementById('gestao-alterar-status-terceiros-save-all');
        setGestaoAlterarStatusTerceirosSaveButtonState(button, 'saving');

        const errors = [];

        for (const change of changes) {
            try {
                if (typeof updateThirdPartyProjectStatus !== 'function') {
                    throw new Error('Não foi possível atualizar o status do projeto de terceiros.');
                }

                await updateThirdPartyProjectStatus(change.projectId, change.newStatus, change.currentStatus, {
                    skipNotify: true
                });

                change.project.status = change.newStatus;
                if (change.select) {
                    change.select.dataset.currentStatus = change.newStatus;
                }

                const statusCell = change.row?.querySelector('td:nth-child(5)');
                if (statusCell) statusCell.textContent = change.newStatusName;
            } catch (error) {
                errors.push(`${getGestaoAlterarStatusTerceiroName(change.project)}: ${error.message}`);
            }
        }

        syncGestaoAlterarStatusTerceirosSaveButton();

        if (errors.length) {
            alertAppDialog(
                `${changes.length - errors.length} projeto(s) atualizado(s). Falhas:\n${errors.join('\n')}`,
                { variant: 'warning', title: 'Aviso' }
            );
            return;
        }

        alertAppDialog(`${changes.length} projeto(s) atualizado(s) com sucesso.`, { variant: 'success', title: 'Sucesso' });
    });
}

async function loadGestaoAlterarStatusTerceirosList() {
    const tbody = document.getElementById('gestao-alterar-status-terceiros-list');
    const countEl = document.getElementById('gestao-alterar-status-terceiros-count');
    if (!tbody || !canAccessGestao()) return;

    const orderCode = document.getElementById('gestao-alterar-status-terceiros-filter-order')?.value.trim() || '';
    const clientName = document.getElementById('gestao-alterar-status-terceiros-filter-client')?.value.trim() || '';

    if (!orderCode && !clientName) {
        gestaoAlterarStatusTerceirosCache = [];
        if (countEl) countEl.textContent = '0 projetos';
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-6 text-center text-xs text-slate-500">
                    Informe o código do pedido e/ou o nome do cliente para buscar projetos de terceiros.
                </td>
            </tr>
        `;
        syncGestaoAlterarStatusTerceirosSaveButton();
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="p-6 text-center text-xs text-slate-500">Carregando projetos...</td>
        </tr>
    `;
    syncGestaoAlterarStatusTerceirosSaveButton();

    try {
        const result = await fetchGestaoAlterarStatusTerceiros({ orderCode, clientName });
        gestaoAlterarStatusTerceirosCache = result.projects || [];
        renderGestaoAlterarStatusTerceirosList(gestaoAlterarStatusTerceirosCache);
    } catch (error) {
        console.error('loadGestaoAlterarStatusTerceirosList:', error);
        gestaoAlterarStatusTerceirosCache = [];
        if (countEl) countEl.textContent = '0 projetos';
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-6 text-center text-xs text-red-600">
                    Erro ao carregar projetos: ${escapeHtml(error.message)}
                </td>
            </tr>
        `;
        syncGestaoAlterarStatusTerceirosSaveButton();
    }
}

function resetGestaoAlterarStatusTerceirosFilters() {
    const orderInput = document.getElementById('gestao-alterar-status-terceiros-filter-order');
    const clientInput = document.getElementById('gestao-alterar-status-terceiros-filter-client');
    if (orderInput) orderInput.value = '';
    if (clientInput) clientInput.value = '';
    loadGestaoAlterarStatusTerceirosList();
}

function bindGestaoAlterarStatusTerceirosEvents() {
    document.getElementById('gestao-alterar-status-terceiros-filter-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await loadGestaoAlterarStatusTerceirosList();
    });

    document.getElementById('gestao-alterar-status-terceiros-filter-clear')?.addEventListener('click', () => {
        resetGestaoAlterarStatusTerceirosFilters();
    });

    document.getElementById('gestao-alterar-status-terceiros-save-all')?.addEventListener('click', () => {
        saveGestaoAlterarStatusTerceirosPendingChanges();
    });
}

bindGestaoAlterarStatusTerceirosEvents();
