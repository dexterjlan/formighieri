let gestaoAlterarStatusProjectsCache = [];

function getGestaoAllProjectStatusOptionsHtml(selectedId = '') {
    const statuses = gestaoProjectStatusesCache || [];

    if (!statuses.length) {
        return '<option value="">Cadastre status em Gestão → Status de Projeto</option>';
    }

    return statuses.map(status => {
        const inactiveSuffix = status.isActive === false ? ' (inativo)' : '';
        return `
            <option value="${status.id}" ${String(status.id) === String(selectedId) ? 'selected' : ''}>
                ${escapeHtml(status.name)}${inactiveSuffix}
            </option>
        `;
    }).join('');
}

function getGestaoAlterarStatusProjectStatusName(project) {
    return project?.projectStatus?.name
        || gestaoProjectStatusesCache.find(status => Number(status.id) === Number(project?.statusId))?.name
        || '—';
}

function setGestaoAlterarStatusSaveButtonState(button, state = 'idle', pendingCount = 0) {
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

function collectGestaoAlterarStatusPendingChanges() {
    const tbody = document.getElementById('gestao-alterar-status-list');
    if (!tbody) return [];

    const changes = [];

    tbody.querySelectorAll('tr[data-project-id]').forEach(row => {
        const projectId = Number(row.dataset.projectId);
        const select = row.querySelector('.gestao-alterar-status-new');
        const newStatusId = Number(select?.value);
        const currentStatusId = Number(select?.dataset.currentStatusId);

        if (!projectId || !newStatusId || newStatusId === currentStatusId) {
            return;
        }

        const project = gestaoAlterarStatusProjectsCache.find(item => Number(item.id) === projectId);
        if (!project) return;

        const currentStatusName = getGestaoAlterarStatusProjectStatusName(project);
        const newStatusName = gestaoProjectStatusesCache.find(status => Number(status.id) === newStatusId)?.name || '—';

        changes.push({
            projectId,
            project,
            row,
            select,
            currentStatusId,
            newStatusId,
            currentStatusName,
            newStatusName
        });
    });

    return changes;
}

function syncGestaoAlterarStatusSaveButton() {
    const button = document.getElementById('gestao-alterar-status-save-all');
    setGestaoAlterarStatusSaveButtonState(
        button,
        'idle',
        collectGestaoAlterarStatusPendingChanges().length
    );
}

async function fetchGestaoAlterarStatusProjects(filters = {}) {
    const orderCode = String(filters.orderCode || '').trim();
    const clientName = String(filters.clientName || '').trim();

    if (!orderCode && !clientName) {
        return { projects: [], requiresFilter: true };
    }

    const orderSelect = clientName
        ? `id, orderCode, clientId, consultantUserId, client:Client!inner(name), consultor:appUsers!consultantUserId(name)`
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
    if (ordersError) {
        throw new Error(ordersError.message);
    }

    if (!orders?.length) {
        return { projects: [], requiresFilter: false };
    }

    const orderById = Object.fromEntries(orders.map(order => [Number(order.id), order]));
    const orderIds = orders.map(order => order.id);

    let projectResult = await supabaseClient
        .from('OrderProject')
        .select(`
            id, orderId, projectCode, name, statusId,
            projectStatus:OrderProjectStatus(id, name)
        `)
        .in('orderId', orderIds)
        .order('orderId', { ascending: true })
        .order('name', { ascending: true });

    if (projectResult.error?.message?.includes('projectStatus')) {
        projectResult = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, projectCode, name, statusId')
            .in('orderId', orderIds)
            .order('orderId', { ascending: true })
            .order('name', { ascending: true });
    }

    if (projectResult.error) {
        throw new Error(projectResult.error.message);
    }

    const projects = (projectResult.data || []).map(project => ({
        ...project,
        order: orderById[Number(project.orderId)] || null
    }));

    return { projects, requiresFilter: false };
}

function renderGestaoAlterarStatusProjectsList(projects = gestaoAlterarStatusProjectsCache) {
    const tbody = document.getElementById('gestao-alterar-status-list');
    const countEl = document.getElementById('gestao-alterar-status-count');
    if (!tbody) return;

    if (countEl) {
        countEl.textContent = `${projects.length} projeto(s)`;
    }

    if (!projects.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-6 text-center text-xs text-slate-500">
                    Nenhum projeto encontrado para os filtros informados.
                </td>
            </tr>
        `;
        syncGestaoAlterarStatusSaveButton();
        return;
    }

    tbody.innerHTML = projects.map(project => {
        const currentStatusId = project.statusId || project.projectStatus?.id || '';
        const currentStatusName = getGestaoAlterarStatusProjectStatusName(project);
        const projectName = project.name || '—';

        return `
            <tr data-project-id="${project.id}">
                <td class="p-3 font-mono text-xs text-indigo-800 whitespace-nowrap">${escapeHtml(project.order?.orderCode || '—')}</td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(getOrderClientName(project.order) || '—')}</td>
                <td class="p-3 text-xs text-slate-800">${escapeHtml(projectName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(currentStatusName)}</td>
                <td class="p-3">
                    <select class="gestao-alterar-status-new w-full min-w-[160px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                        data-current-status-id="${escapeHtml(String(currentStatusId))}">
                        ${getGestaoAllProjectStatusOptionsHtml(currentStatusId)}
                    </select>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.gestao-alterar-status-new').forEach(select => {
        select.addEventListener('change', syncGestaoAlterarStatusSaveButton);
    });

    syncGestaoAlterarStatusSaveButton();
}

async function saveGestaoAlterarStatusPendingChanges() {
    if (!canAccessGestao()) return;

    const changes = collectGestaoAlterarStatusPendingChanges();
    if (!changes.length) {
        alertAppDialog('Nenhuma alteração de status para salvar.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const summaryLines = changes.slice(0, 8).map(change => {
        const projectName = change.project.name || '—';
        const orderCode = change.project.order?.orderCode || '—';
        return `• ${orderCode} — ${projectName}: ${change.currentStatusName} → ${change.newStatusName}`;
    });
    const extraCount = changes.length - summaryLines.length;
    const extraLine = extraCount > 0 ? `\n... e mais ${extraCount} projeto(s).` : '';

    const confirmed = await confirmAppDialog(
        `Confirmar alteração de status de ${changes.length} projeto(s)?\n\n${summaryLines.join('\n')}${extraLine}`
    );
    if (!confirmed) return;

    const button = document.getElementById('gestao-alterar-status-save-all');
    setGestaoAlterarStatusSaveButtonState(button, 'saving');

    const now = new Date().toISOString();
    const errors = [];

    for (const change of changes) {
        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId: change.newStatusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .eq('id', change.projectId);

        if (error) {
            errors.push(`${change.project.name || change.projectId}: ${error.message}`);
            continue;
        }

        change.project.statusId = change.newStatusId;
        change.project.projectStatus = gestaoProjectStatusesCache.find(status => Number(status.id) === change.newStatusId) || {
            id: change.newStatusId,
            name: change.newStatusName
        };

        if (change.select) {
            change.select.dataset.currentStatusId = String(change.newStatusId);
        }

        if (change.newStatusName === 'Em Produção' && typeof createDetalhamentoForProject === 'function') {
            await createDetalhamentoForProject(change.projectId);
        }

        const statusCell = change.row?.querySelector('td:nth-child(4)');
        if (statusCell) {
            statusCell.textContent = change.newStatusName;
        }
    }

    syncGestaoAlterarStatusSaveButton();

    if (errors.length) {
        alertAppDialog(
            `${changes.length - errors.length} projeto(s) atualizado(s). Falhas:\n${errors.join('\n')}`,
            { variant: 'warning', title: 'Aviso' }
        );
        return;
    }

    alertAppDialog(`${changes.length} projeto(s) atualizado(s) com sucesso.`, { variant: 'success', title: 'Sucesso' });
}

async function loadGestaoAlterarStatusProjectsList() {
    const tbody = document.getElementById('gestao-alterar-status-list');
    const countEl = document.getElementById('gestao-alterar-status-count');
    if (!tbody || !canAccessGestao()) return;

    const orderCode = document.getElementById('gestao-alterar-status-filter-order')?.value.trim() || '';
    const clientName = document.getElementById('gestao-alterar-status-filter-client')?.value.trim() || '';

    if (!orderCode && !clientName) {
        gestaoAlterarStatusProjectsCache = [];
        if (countEl) countEl.textContent = '0 projetos';
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-6 text-center text-xs text-slate-500">
                    Informe o código do pedido e/ou o nome do cliente para buscar projetos.
                </td>
            </tr>
        `;
        syncGestaoAlterarStatusSaveButton();
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="p-6 text-center text-xs text-slate-500">Carregando projetos...</td>
        </tr>
    `;
    syncGestaoAlterarStatusSaveButton();

    try {
        await loadGestaoProjectStatuses(false);

        const result = await fetchGestaoAlterarStatusProjects({ orderCode, clientName });
        gestaoAlterarStatusProjectsCache = result.projects || [];
        renderGestaoAlterarStatusProjectsList(gestaoAlterarStatusProjectsCache);
    } catch (error) {
        console.error('loadGestaoAlterarStatusProjectsList:', error);
        gestaoAlterarStatusProjectsCache = [];
        if (countEl) countEl.textContent = '0 projetos';
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-6 text-center text-xs text-red-600">
                    Erro ao carregar projetos: ${escapeHtml(error.message)}
                </td>
            </tr>
        `;
        syncGestaoAlterarStatusSaveButton();
    }
}

function resetGestaoAlterarStatusFilters() {
    const orderInput = document.getElementById('gestao-alterar-status-filter-order');
    const clientInput = document.getElementById('gestao-alterar-status-filter-client');
    if (orderInput) orderInput.value = '';
    if (clientInput) clientInput.value = '';
    loadGestaoAlterarStatusProjectsList();
}

function bindGestaoAlterarStatusProjetoEvents() {
    document.getElementById('gestao-alterar-status-filter-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await loadGestaoAlterarStatusProjectsList();
    });

    document.getElementById('gestao-alterar-status-filter-clear')?.addEventListener('click', () => {
        resetGestaoAlterarStatusFilters();
    });

    document.getElementById('gestao-alterar-status-save-all')?.addEventListener('click', () => {
        saveGestaoAlterarStatusPendingChanges();
    });
}

bindGestaoAlterarStatusProjetoEvents();
