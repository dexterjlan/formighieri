async function openGestaoCreateOrderForm() {
    if (!canAccessGestao()) return;

    editingGestaoOrderId = null;
    document.getElementById('gestao-order-form')?.reset();
    document.getElementById('gestao-order-form-title').textContent = 'Criar Pedido';
    document.getElementById('gestao-order-form-submit').textContent = 'Salvar Pedido';
    document.getElementById('gestao-ord-code').disabled = false;

    await loadGestaoFormOptions();
    await loadGestaoConsultants();
    clearGestaoProjectRows();
    addGestaoProjectRow();
    showGestaoPedidoFormPanel();
}

async function openGestaoEditOrderForm(orderId) {
    if (!canAccessGestao()) return;

    const order = gestaoOrdersCache.find(item => item.id === orderId);
    if (!order) return;

    editingGestaoOrderId = orderId;
    document.getElementById('gestao-order-form-title').textContent = 'Editar Pedido';
    document.getElementById('gestao-order-form-submit').textContent = 'Atualizar Pedido';
    document.getElementById('gestao-ord-code').value = order.orderCode || '';
    document.getElementById('gestao-ord-code').disabled = true;
    document.getElementById('gestao-ord-client').value = order.clientName || '';
    document.getElementById('gestao-ord-client-delivery').value = toGestaoInputDate(order.clientDeliveryDate);

    await loadGestaoFormOptions();
    await loadGestaoConsultants(order.consultantName || '');

    clearGestaoProjectRows();
    const projects = order.projects || [];
    if (projects.length) {
        projects.forEach(project => addGestaoProjectRow(project));
    } else {
        addGestaoProjectRow();
    }

    showGestaoPedidoFormPanel();
}

window.openGestaoEditOrderForm = openGestaoEditOrderForm;

function groupGestaoProjectsByOrderId(projects) {
    const byOrderId = {};
    (projects || []).forEach(project => {
        const orderId = Number(project.orderId);
        if (!byOrderId[orderId]) byOrderId[orderId] = [];
        byOrderId[orderId].push(project);
    });
    return byOrderId;
}

async function fetchGestaoProjectsByOrderIds(orderIds) {
    const normalizedIds = [...new Set(orderIds.map(id => Number(id)).filter(Boolean))];
    if (!normalizedIds.length) return {};

    const selectVariants = [
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name)',
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name)',
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId',
        'id, orderId, name, environmentTypeId, environmentType:EnvironmentType(name)',
        'id, orderId, name, environmentTypeId'
    ];

    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .in('orderId', normalizedIds)
            .order('name', { ascending: true });

        if (!error) {
            return groupGestaoProjectsByOrderId(data || []);
        }
    }

    return {};
}

async function enrichGestaoOrdersWithProjectStatuses(orders) {
    const allProjects = orders.flatMap(order => order.projects || []);
    const needsStatus = allProjects.some(project => project.statusId && !project.projectStatus);
    if (!needsStatus) return orders;

    const { data: statuses } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name');

    const statusById = Object.fromEntries((statuses || []).map(item => [item.id, item]));

    return orders.map(order => ({
        ...order,
        projects: (order.projects || []).map(project => ({
            ...project,
            projectStatus: project.projectStatus || statusById[project.statusId] || null
        }))
    }));
}

async function fetchGestaoOrders() {
    const orderSelectVariants = [
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId)',
        '*'
    ];

    let result = null;
    let lastError = null;

    for (const selectCols of orderSelectVariants) {
        const attempt = await supabaseClient
            .from('salesOrders')
            .select(selectCols)
            .order('createdAt', { ascending: false });

        if (!attempt.error) {
            result = attempt;
            break;
        }
        lastError = attempt.error;
    }

    if (!result) {
        return { data: null, error: lastError };
    }

    let orders = result.data || [];
    const needsProjectsFetch = orders.some(order => !Array.isArray(order.projects));

    if (needsProjectsFetch && orders.length) {
        const projectsByOrderId = await fetchGestaoProjectsByOrderIds(orders.map(order => order.id));
        orders = orders.map(order => ({
            ...order,
            projects: Array.isArray(order.projects) ? order.projects : (projectsByOrderId[order.id] || [])
        }));
    }

    orders = await enrichGestaoOrdersWithProjectStatuses(orders);

    return { data: orders, error: null };
}

async function loadGestaoOrdersList() {
    const tbody = document.getElementById('gestao-orders-list');
    if (!tbody) return;

    const result = await fetchGestaoOrders();

    if (result.error) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-xs text-red-500">Erro ao carregar pedidos: ${escapeHtml(result.error.message)}</td></tr>`;
        return;
    }

    gestaoOrdersCache = result.data || [];

    if (!gestaoOrdersCache.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-xs text-slate-400">Nenhum pedido cadastrado.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    gestaoOrdersCache.forEach(order => {
        const projectCount = (order.projects || []).length;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-3 font-mono text-xs font-bold text-slate-700">${escapeHtml(order.orderCode || '—')}</td>
            <td class="p-3 text-slate-800">${escapeHtml(order.clientName || '—')}</td>
            <td class="p-3 text-slate-500">${escapeHtml(order.consultantName || '—')}</td>
            <td class="p-3 text-slate-600 whitespace-nowrap">${formatGestaoDate(order.clientDeliveryDate)}</td>
            <td class="p-3 text-slate-600">${projectCount}</td>
            <td class="p-3">
                <button type="button" onclick="openGestaoEditOrderForm(${order.id})"
                    class="text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium">
                    Editar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function insertGestaoProject(orderId, project, now) {
    const statusId = project.statusId || getDefaultProjectStatusId();
    const payloadVariants = [
        {
            orderId,
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            saleValue: project.saleValue,
            deliveryDate: project.deliveryDate,
            statusId,
            designerId: project.designerId,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            orderId,
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            deliveryDate: project.deliveryDate,
            statusId,
            designerId: project.designerId,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            orderId,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            statusId,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            orderId,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        }
    ];

    let lastError = null;
    const seen = new Set();

    for (const payload of payloadVariants) {
        const cleanPayload = Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined && value !== '')
        );
        const key = JSON.stringify(cleanPayload);
        if (seen.has(key)) continue;
        seen.add(key);

        const { error } = await supabaseClient.from('OrderProject').insert(cleanPayload);
        if (!error) return;
        lastError = error;
    }

    throw lastError;
}

async function updateGestaoProject(project, now) {
    const statusId = project.statusId || getDefaultProjectStatusId();
    const payloadVariants = [
        {
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            saleValue: project.saleValue,
            deliveryDate: project.deliveryDate,
            statusId,
            designerId: project.designerId,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            deliveryDate: project.deliveryDate,
            statusId,
            designerId: project.designerId,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            updatedById: currentUser.id,
            updatedAt: now
        }
    ];

    let lastError = null;
    const seen = new Set();

    for (const payload of payloadVariants) {
        const cleanPayload = Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined && value !== '')
        );
        const key = JSON.stringify(cleanPayload);
        if (seen.has(key)) continue;
        seen.add(key);

        const { error } = await supabaseClient
            .from('OrderProject')
            .update(cleanPayload)
            .eq('id', project.id);

        if (!error) return;
        lastError = error;
    }

    throw lastError;
}

async function persistGestaoProjects(orderId, projects) {
    const now = new Date().toISOString();
    const { data: current } = await supabaseClient
        .from('OrderProject')
        .select('id')
        .eq('orderId', orderId);

    const keepIds = projects.filter(project => project.id).map(project => project.id);
    const deleteIds = (current || [])
        .map(row => row.id)
        .filter(id => !keepIds.includes(id));

    if (deleteIds.length) {
        const { error } = await supabaseClient
            .from('OrderProject')
            .delete()
            .in('id', deleteIds);
        if (error) throw error;
    }

    for (const project of projects) {
        if (project.id) {
            await updateGestaoProject(project, now);
            continue;
        }
        await insertGestaoProject(orderId, project, now);
    }
}

async function saveGestaoOrder(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const orderCode = document.getElementById('gestao-ord-code')?.value.trim();
    const clientName = document.getElementById('gestao-ord-client')?.value.trim();
    const consultantName = document.getElementById('gestao-ord-consultant')?.value.trim();
    const clientDeliveryDate = document.getElementById('gestao-ord-client-delivery')?.value || null;
    const projects = collectGestaoProjectsFromDom();

    if (!orderCode) {
        alert('Informe o código do pedido.');
        return;
    }
    if (!clientName) {
        alert('Informe o nome do cliente.');
        return;
    }
    if (!consultantName) {
        alert('Selecione o consultor.');
        return;
    }
    if (!projects.length) {
        alert('Adicione ao menos um projeto.');
        return;
    }

    for (const project of projects) {
        if (!project.projectCode || !project.name || !project.environmentTypeId || !project.statusId) {
            alert('Preencha código, nome, ambiente e status de todos os projetos.');
            return;
        }
        if (!isNumericProjectCode(project.projectCode)) {
            alert(`O código do projeto "${project.name}" deve conter somente números.`);
            return;
        }
        if (Number.isNaN(project.saleValue)) {
            alert(`Informe um valor de venda válido para o projeto "${project.name}".`);
            return;
        }
    }

    const now = new Date().toISOString();

    try {
        let orderId = editingGestaoOrderId;

        if (editingGestaoOrderId) {
            let { error } = await supabaseClient
                .from('salesOrders')
                .update({
                    clientName,
                    consultantName,
                    clientDeliveryDate,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .eq('id', editingGestaoOrderId);

            if (error?.message?.includes('clientDeliveryDate')) {
                ({ error } = await supabaseClient
                    .from('salesOrders')
                    .update({
                        clientName,
                        consultantName,
                        updatedById: currentUser.id
                    })
                    .eq('id', editingGestaoOrderId));
            }

            if (error) throw error;
        } else {
            const { data: existing } = await supabaseClient
                .from('salesOrders')
                .select('id')
                .eq('orderCode', orderCode)
                .maybeSingle();

            if (existing) {
                alert('Já existe um pedido com este código.');
                return;
            }

            const orderPayload = {
                orderCode,
                clientName,
                consultantName,
                clientDeliveryDate,
                createdById: currentUser.id,
                updatedById: currentUser.id,
                updatedAt: now
            };

            let { data: created, error } = await supabaseClient
                .from('salesOrders')
                .insert(orderPayload)
                .select('id')
                .single();

            if (error?.message?.includes('clientDeliveryDate')) {
                const { clientDeliveryDate: _d, updatedAt: _u, ...fallback } = orderPayload;
                ({ data: created, error } = await supabaseClient
                    .from('salesOrders')
                    .insert(fallback)
                    .select('id')
                    .single());
            }

            if (error) throw error;
            orderId = created.id;
        }

        await persistGestaoProjects(orderId, projects);

        editingGestaoOrderId = null;
        showGestaoPedidoListPanel();
        await loadGestaoOrdersList();

        if (typeof loadOrders === 'function') {
            await loadOrders();
        }
        if (typeof loadOrderProjects === 'function' && activeOrderId === orderId) {
            await loadOrderProjects(orderId);
        }
    } catch (error) {
        const sqlHint = error.message?.includes('clientDeliveryDate')
            || error.message?.includes('projectCode')
            || error.message?.includes('statusId')
            || error.message?.includes('OrderProjectStatus')
            || error.message?.includes('saleValue')
            ? '\n\nExecute os SQL supabase/create-gestao-order-fields.sql, supabase/add-order-project-sale-value.sql e supabase/create-order-project-status.sql no Supabase.'
            : '';
        alert('Erro ao salvar pedido: ' + error.message + sqlHint);
    }
}
