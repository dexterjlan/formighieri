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

async function fetchGestaoAlterarStatusProjects(filters = {}) {
    const orderCode = String(filters.orderCode || '').trim();
    const clientName = String(filters.clientName || '').trim();

    if (!orderCode && !clientName) {
        return { projects: [], requiresFilter: true };
    }

    let orderQuery = supabaseClient
        .from('salesOrders')
        .select('id, orderCode, clientName')
        .order('orderCode', { ascending: true })
        .limit(200);

    if (orderCode) {
        orderQuery = orderQuery.ilike('orderCode', `%${orderCode}%`);
    }
    if (clientName) {
        orderQuery = orderQuery.ilike('clientName', `%${clientName}%`);
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
                <td colspan="6" class="p-6 text-center text-xs text-slate-500">
                    Nenhum projeto encontrado para os filtros informados.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = projects.map(project => {
        const currentStatusId = project.statusId || project.projectStatus?.id || '';
        const currentStatusName = getGestaoAlterarStatusProjectStatusName(project);
        const projectName = project.name || '—';

        return `
            <tr data-project-id="${project.id}">
                <td class="p-3 font-mono text-xs text-indigo-800 whitespace-nowrap">${escapeHtml(project.order?.orderCode || '—')}</td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(project.order?.clientName || '—')}</td>
                <td class="p-3 text-xs text-slate-800">${escapeHtml(projectName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(currentStatusName)}</td>
                <td class="p-3">
                    <select class="gestao-alterar-status-new w-full min-w-[160px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                        data-current-status-id="${escapeHtml(String(currentStatusId))}">
                        ${getGestaoAllProjectStatusOptionsHtml(currentStatusId)}
                    </select>
                </td>
                <td class="p-3 whitespace-nowrap">
                    <button type="button"
                        class="gestao-alterar-status-submit text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1.5 rounded-lg font-medium">
                        Alterar Status
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.gestao-alterar-status-submit').forEach(button => {
        button.addEventListener('click', () => {
            const row = button.closest('tr');
            applyGestaoAlterarStatusProjectRow(row, button);
        });
    });
}

async function applyGestaoAlterarStatusProjectRow(row, button = null) {
    if (!row || !canAccessGestao()) return;

    const projectId = Number(row.dataset.projectId);
    const select = row.querySelector('.gestao-alterar-status-new');
    const newStatusId = Number(select?.value);
    const currentStatusId = Number(select?.dataset.currentStatusId);

    if (!projectId || !newStatusId) {
        alertAppDialog('Selecione o novo status.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (newStatusId === currentStatusId) {
        alertAppDialog('O novo status deve ser diferente do status atual.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const project = gestaoAlterarStatusProjectsCache.find(item => Number(item.id) === projectId);
    if (!project) {
        alertAppDialog('Projeto não encontrado. Atualize a busca.');
        return;
    }

    const currentStatusName = getGestaoAlterarStatusProjectStatusName(project);
    const newStatusName = gestaoProjectStatusesCache.find(status => Number(status.id) === newStatusId)?.name || 'novo status';
    const projectName = project.name || '—';

    const confirmed = await confirmAppDialog(
        `Confirmar alteração de status do projeto "${projectName}" (pedido ${project.order?.orderCode || '—'}) de "${currentStatusName}" para "${newStatusName}"?`
    );
    if (!confirmed) return;

    const originalLabel = button?.textContent || 'Alterar Status';
    if (button) {
        button.disabled = true;
        button.textContent = 'Salvando...';
    }

    try {
        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId: newStatusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .eq('id', projectId);

        if (error) {
            throw error;
        }

        project.statusId = newStatusId;
        project.projectStatus = gestaoProjectStatusesCache.find(status => Number(status.id) === newStatusId) || {
            id: newStatusId,
            name: newStatusName
        };

        if (select) {
            select.dataset.currentStatusId = String(newStatusId);
        }

        const statusCell = row.querySelector('td:nth-child(4)');
        if (statusCell) {
            statusCell.textContent = newStatusName;
        }

        alertAppDialog('Status alterado com sucesso.', { variant: 'success', title: 'Sucesso' });
    } catch (error) {
        alertAppDialog(`Erro ao alterar status: ${error.message}`);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }
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
                <td colspan="6" class="p-6 text-center text-xs text-slate-500">
                    Informe o código do pedido e/ou o nome do cliente para buscar projetos.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="p-6 text-center text-xs text-slate-500">Carregando projetos...</td>
        </tr>
    `;

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
                <td colspan="6" class="p-6 text-center text-xs text-red-600">
                    Erro ao carregar projetos: ${escapeHtml(error.message)}
                </td>
            </tr>
        `;
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
}

bindGestaoAlterarStatusProjetoEvents();
