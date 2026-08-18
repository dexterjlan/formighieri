async function openGestaoCreateOrderForm() {
    if (!canAccessGestao()) return;

    editingGestaoOrderId = null;
    setGestaoOrderFormOrderId(null);
    document.getElementById('gestao-order-form')?.reset();
    if (document.getElementById('gestao-ord-client-id')) document.getElementById('gestao-ord-client-id').value = '';
    document.getElementById('gestao-order-form-title').textContent = 'Criar Pedido';
    document.getElementById('gestao-order-form-submit').textContent = 'Salvar Pedido';
    document.getElementById('gestao-ord-code').disabled = false;

    await loadGestaoFormOptions();
    await loadGestaoConsultants();
    clearGestaoOrderProjectsDraft();
    clearGestaoOrderPhasesDraft();
    syncGestaoOrderClientDeliveryField();
    showGestaoPedidoFormPanel();
}

async function openGestaoEditOrderForm(orderId) {
    if (!canAccessGestao()) return;

    const order = gestaoOrdersCache.find(item => Number(item.id) === Number(orderId));
    if (!order) return;

    editingGestaoOrderId = Number(orderId);
    setGestaoOrderFormOrderId(editingGestaoOrderId);
    document.getElementById('gestao-order-form-title').textContent = 'Editar Pedido';
    document.getElementById('gestao-order-form-submit').textContent = 'Atualizar Pedido';
    document.getElementById('gestao-ord-code').value = order.orderCode || '';
    document.getElementById('gestao-ord-code').disabled = true;
    document.getElementById('gestao-ord-client').value = getOrderClientName(order);
    if (document.getElementById('gestao-ord-client-id')) {
        document.getElementById('gestao-ord-client-id').value = order.clientId || order.client?.id || '';
    }
    document.getElementById('gestao-ord-client-delivery').value = toGestaoInputDate(order.clientDeliveryDate);

    await loadGestaoFormOptions();
    await loadGestaoConsultants({
        selectedUserId: order.consultantUserId || order.consultor?.id,
        selectedName: getOrderConsultantNameFromRecord(order)
    });

    setGestaoOrderProjectsDraft(order.projects || []);
    await loadGestaoOrderPhasesForOrder(orderId);
    if (typeof hasGestaoOrderMultiplePhases === 'function' && hasGestaoOrderMultiplePhases()) {
        const maxPhaseDeliveryDate = pickLatestIsoDate(
            ...(gestaoOrderPhasesDraft || []).map(phase => phase.deliveryDate)
        );
        if (maxPhaseDeliveryDate) {
            document.getElementById('gestao-ord-client-delivery').value = maxPhaseDeliveryDate;
        }
    }
    if (typeof ensureGestaoProjectsHavePhaseDefaults === 'function') {
        ensureGestaoProjectsHavePhaseDefaults();
    }
    syncGestaoOrderClientDeliveryField();
    renderGestaoProjectsSummaryList();
    showGestaoPedidoFormPanel();
}

window.openGestaoEditOrderForm = openGestaoEditOrderForm;

function resolveGestaoOrderIdForSave() {
    const fromForm = Number(document.getElementById('gestao-ord-id')?.value) || null;
    const fromState = Number(editingGestaoOrderId) || null;
    return fromForm || fromState || null;
}

function setGestaoOrderFormOrderId(orderId) {
    const input = document.getElementById('gestao-ord-id');
    if (!input) return;
    input.value = orderId ? String(orderId) : '';
}

function resolveGestaoOrderClientDeliveryDateForSave(phases = gestaoOrderPhasesDraft) {
    const inputDate = normalizeIsoDateValue(
        document.getElementById('gestao-ord-client-delivery')?.value || ''
    ) || null;

    if ((phases || []).length >= 2) {
        return pickLatestIsoDate(...phases.map(phase => phase.deliveryDate)) || inputDate;
    }

    return inputDate;
}

function groupGestaoProjectsByOrderId(projects) {
    const byOrderId = {};
    (projects || []).forEach(project => {
        const p = {
            ...project,
            parentProjectCode: project.parentProjectCode || project.parentProject?.projectCode || '',
            replacedByProjectCode: project.replacedByProjectCode || project.replacedBy?.projectCode || ''
        };
        const orderId = Number(p.orderId);
        if (!byOrderId[orderId]) byOrderId[orderId] = [];
        byOrderId[orderId].push(p);
    });
    return byOrderId;
}

async function fetchGestaoParentProjectsByCodes(projectCodes) {
    const codes = [...new Set((projectCodes || []).map(code => normalizeProjectCodeInput(code)).filter(Boolean))];
    if (!codes.length) return {};

    const selectVariants = [
        'id, projectCode, statusId, saleValue, isComplementary, isReplaced, isReplacement, projectStatus:OrderProjectStatus(id, name, sortOrder), order:salesOrders(orderCode)',
        'id, projectCode, statusId, saleValue, isComplementary, isReplaced, isReplacement, projectStatus:OrderProjectStatus(id, name, sortOrder)',
        'id, projectCode, statusId, isComplementary, isReplaced, isReplacement, projectStatus:OrderProjectStatus(id, name, sortOrder), order:salesOrders(orderCode)',
        'id, projectCode, statusId, isComplementary, isReplaced, isReplacement, projectStatus:OrderProjectStatus(id, name, sortOrder)',
        'id, projectCode, statusId, isComplementary, isReplaced, isReplacement',
        'id, projectCode, statusId, isComplementary',
        'id, projectCode, statusId'
    ];

    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .in('projectCode', codes);

        if (!error) {
            return Object.fromEntries((data || []).map(project => [project.projectCode, project]));
        }
    }

    return {};
}

async function validateAndResolveGestaoComplementarProjects(projects) {
    const deferred = [];
    const byCode = new Map();

    (projects || []).forEach(project => {
        if (!project.parentProjectCode && project.parentProject?.projectCode) {
            project.parentProjectCode = project.parentProject.projectCode;
        }
        if (project.projectCode) {
            byCode.set(project.projectCode, project);
        }
    });

    const missingParentIdSet = new Set();
    for (const project of projects || []) {
        if (project.isComplementary && !project.parentProjectCode && project.parentProjectId) {
            missingParentIdSet.add(project.parentProjectId);
        }
    }

    if (missingParentIdSet.size > 0) {
        const { data: parentsById } = await supabaseClient
            .from('OrderProject')
            .select('id, projectCode, name, order:salesOrders(orderCode)')
            .in('id', [...missingParentIdSet]);

        if (parentsById?.length) {
            const parentMap = Object.fromEntries(parentsById.map(p => [p.id, p]));
            for (const project of projects || []) {
                if (project.isComplementary && !project.parentProjectCode && project.parentProjectId) {
                    const parentObj = parentMap[project.parentProjectId];
                    if (parentObj) {
                        project.parentProjectCode = parentObj.projectCode;
                        project.parentProject = parentObj;
                        if (parentObj.projectCode) {
                            byCode.set(parentObj.projectCode, parentObj);
                        }
                    }
                }
            }
        }
    }

    const dbLookupCodes = new Set();
    for (const project of projects) {
        if (!project.isComplementary) {
            project.parentProjectId = null;
            continue;
        }

        if (!project.parentProjectCode) {
            throw new Error(`Projeto "${project.name}": informe o código do projeto pai.`);
        }

        if (project.parentProjectCode === project.projectCode) {
            throw new Error(`Projeto "${project.name}": o código do projeto pai não pode ser o próprio projeto.`);
        }

        const batchParent = byCode.get(project.parentProjectCode);
        if (!batchParent || batchParent.id) {
            dbLookupCodes.add(project.parentProjectCode);
        }
    }

    const dbParentsByCode = await fetchGestaoParentProjectsByCodes([...dbLookupCodes]);

    for (const project of projects) {
        if (!project.isComplementary) continue;

        let parent = dbParentsByCode[project.parentProjectCode] || byCode.get(project.parentProjectCode);

        if (!parent) {
            throw new Error(`Projeto "${project.name}": projeto pai "${project.parentProjectCode}" não encontrado.`);
        }

        if (parent.isComplementary) {
            throw new Error(`Projeto "${project.name}": o projeto pai não pode ser complementar.`);
        }

        const statusName = parent.projectStatus?.name || '';
        const sortOrder = parent.projectStatus?.sortOrder ?? null;
        if (!isComplementaryParentStatusAllowed(statusName, sortOrder)) {
            throw new Error(
                `Projeto "${project.name}": o projeto pai não pode estar em "${statusName || 'Aguardando Aprovação'}" ou status posterior.`
            );
        }

        if (!parent.statusId) {
            throw new Error(`Projeto "${project.name}": o projeto pai não possui status válido.`);
        }

        project.statusId = parent.statusId;

        if (parent.id) {
            project.parentProjectId = parent.id;
            delete project._pendingParentCode;
        } else {
            project.parentProjectId = null;
            project._pendingParentCode = project.parentProjectCode;
            deferred.push({
                project,
                parentProjectCode: project.parentProjectCode
            });
        }
    }

    return { projects, deferred };
}

async function validateAndResolveGestaoSubstituidoProjects(projects) {
    (projects || []).forEach(project => {
        if (!project.replacedByProjectCode && project.replacedByProject?.projectCode) {
            project.replacedByProjectCode = project.replacedByProject.projectCode;
        }
    });

    const missingReplacementIdSet = new Set();
    for (const project of projects || []) {
        if (project.isReplaced && !project.replacedByProjectCode && project.replacedByProjectId) {
            missingReplacementIdSet.add(project.replacedByProjectId);
        }
    }

    if (missingReplacementIdSet.size > 0) {
        const { data: replacementsById } = await supabaseClient
            .from('OrderProject')
            .select('id, projectCode, name, order:salesOrders(orderCode)')
            .in('id', [...missingReplacementIdSet]);

        if (replacementsById?.length) {
            const replacementMap = Object.fromEntries(replacementsById.map(p => [p.id, p]));
            for (const project of projects || []) {
                if (project.isReplaced && !project.replacedByProjectCode && project.replacedByProjectId) {
                    const replacementObj = replacementMap[project.replacedByProjectId];
                    if (replacementObj) {
                        project.replacedByProjectCode = replacementObj.projectCode;
                        project.replacedByProject = replacementObj;
                    }
                }
            }
        }
    }

    const dbLookupCodes = new Set();

    for (const project of projects) {
        if (project.isComplementary && project.isReplaced) {
            throw new Error(`Projeto "${project.name}": não pode ser complementar e substituído ao mesmo tempo.`);
        }

        if (!project.isReplaced) {
            project.replacedByProjectId = null;
        }

        if (!project.isReplacement) {
            project.replacesProjectId = null;
        }

        if (project.isReplaced) {
            if (!project.replacedByProjectCode) {
                throw new Error(`Projeto "${project.name}": informe o código do projeto substituto.`);
            }

            if (project.replacedByProjectCode === project.projectCode) {
                throw new Error(`Projeto "${project.name}": o código do projeto substituto não pode ser o próprio projeto.`);
            }

            if (!isReplacedEligibleStatus(project)) {
                throw new Error(
                    `Projeto "${project.name}": só pode ser marcado como substituído até "Aguardando Projeto Técnico".`
                );
            }

            dbLookupCodes.add(project.replacedByProjectCode);
        }
    }

    const linkedByCode = await fetchGestaoParentProjectsByCodes([...dbLookupCodes]);
    const substituidoStatusId = getReplacedStatusId();

    if (!substituidoStatusId) {
        const needsSubstituidoStatus = projects.some(project => project.isReplaced);
        if (needsSubstituidoStatus) {
            throw new Error('Status "Projeto Substituído" não encontrado. Execute supabase/create-order-project-substituido.sql no Supabase.');
        }
    }

    for (const project of projects) {
        if (project.isReplaced) {
            const replacement = linkedByCode[project.replacedByProjectCode];
            if (!replacement) {
                throw new Error(`Projeto "${project.name}": projeto substituto "${project.replacedByProjectCode}" não encontrado.`);
            }

            if (replacement.isComplementary) {
                throw new Error(`Projeto "${project.name}": o projeto substituto não pode ser complementar.`);
            }

            if (replacement.isReplaced) {
                throw new Error(`Projeto "${project.name}": o projeto substituto já está marcado como substituído.`);
            }

            project.replacedByProjectId = replacement.id;
            project.replacedByProject = {
                projectCode: replacement.projectCode,
                order: replacement.order || null
            };
            project.statusId = substituidoStatusId;
            project.projectStatus = gestaoProjectStatusesCache.find(status => status.id === substituidoStatusId) || {
                id: substituidoStatusId,
                name: SUBSTITUIDO_STATUS_NAME
            };
        }
    }

    return { projects };
}

async function protectGestaoSubstituicaoFields(projects) {
    const persistedSubstituicao = (projects || []).filter(project => project.id && project.isReplacement);
    if (!persistedSubstituicao.length) return projects;

    const selectVariants = [
        'id, isReplacement, replacesProjectId, replaces:replacesProjectId(projectCode)',
        'id, isReplacement, replacesProjectId'
    ];

    let rows = [];
    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .in('id', persistedSubstituicao.map(project => project.id));

        if (!error) {
            rows = data || [];
            break;
        }
    }

    const byId = Object.fromEntries(rows.map(row => [Number(row.id), row]));

    return (projects || []).map(project => {
        const original = byId[Number(project.id)];
        if (!original?.isReplacement) return project;

        const originalCode = normalizeProjectCodeInput(original.replaces?.projectCode || '');
        const incomingCode = normalizeProjectCodeInput(project.replacesProjectCode || '');

        if (!project.isReplacement) {
            throw new Error(`Projeto "${project.name}": a flag de substituição não pode ser removida.`);
        }

        if (incomingCode && originalCode && incomingCode !== originalCode) {
            throw new Error(`Projeto "${project.name}": o código do projeto original não pode ser alterado.`);
        }

        return {
            ...project,
            isReplacement: true,
            replacesProjectId: original.replacesProjectId || project.replacesProjectId || null,
            replacesProjectCode: originalCode || incomingCode,
            replacesProject: original.replaces || project.replacesProject || null
        };
    });
}

async function syncGestaoSubstituidoCrossLinks(projects, now) {
    for (const project of projects) {
        if (!project.isReplaced || !project.replacedByProjectId) continue;

        const payload = {
            isReplacement: true,
            replacesProjectId: project.id,
            updatedById: currentUser.id,
            updatedAt: now
        };

        let { error } = await supabaseClient
            .from('OrderProject')
            .update(payload)
            .eq('id', project.replacedByProjectId);

        if (error?.message?.includes('isReplacement') || error?.message?.includes('replacesProjectId')) {
            delete payload.isReplacement;
            delete payload.replacesProjectId;
            ({ error } = await supabaseClient
                .from('OrderProject')
                .update(payload)
                .eq('id', project.replacedByProjectId));
        }

        if (error) throw error;
    }
}

async function fetchGestaoProjectsByOrderIds(orderIds) {
    const normalizedIds = [...new Set(orderIds.map(id => Number(id)).filter(Boolean))];
    if (!normalizedIds.length) return {};

    const selectVariants = [
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, technicalProjectForecastStartDate, technicalProjectForecastEndDate, statusId, designerId, deliveryPhaseId, approvalNetworkPath, isComplementary, parentProjectId, isReplaced, replacedByProjectId, isReplacement, replacesProjectId, parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), replacedBy:replacedByProjectId(projectCode, order:salesOrders(orderCode)), replaces:replacesProjectId(projectCode, saleValue, order:salesOrders(orderCode)), environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, deliveryPhaseId, approvalNetworkPath, isComplementary, parentProjectId, isReplaced, replacedByProjectId, isReplacement, replacesProjectId, parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), replacedBy:replacedByProjectId(projectCode, order:salesOrders(orderCode)), replaces:replacesProjectId(projectCode, saleValue, order:salesOrders(orderCode)), environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, approvalNetworkPath, isComplementary, parentProjectId, isReplaced, replacedByProjectId, isReplacement, replacesProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, approvalNetworkPath, isComplementary, parentProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, approvalNetworkPath, environmentType:EnvironmentType(name)',
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, approvalNetworkPath, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, approvalNetworkPath, environmentType:EnvironmentType(name)',
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, approvalNetworkPath',
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

async function fetchGestaoOrders(filters = {}) {
    const orderCode = String(filters.orderCode || '').trim();
    const clientName = String(filters.clientName || '').trim();
    const orderRelations = `client:Client(id, name, isActive), consultor:appUsers!consultantUserId(id, name)`;
    const orderSelectVariants = [
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, technicalProjectForecastStartDate, technicalProjectForecastEndDate, statusId, designerId, deliveryPhaseId, approvalNetworkPath, isComplementary, parentProjectId, isReplaced, replacedByProjectId, isReplacement, replacesProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))`,
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, deliveryPhaseId, approvalNetworkPath, isComplementary, parentProjectId, isReplaced, replacedByProjectId, isReplacement, replacesProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))`,
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, approvalNetworkPath, isComplementary, parentProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))`,
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, approvalNetworkPath, environmentType:EnvironmentType(name))`,
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, approvalNetworkPath, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))`,
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, approvalNetworkPath, environmentType:EnvironmentType(name))`,
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, approvalNetworkPath)`,
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))`,
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name))`,
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))`,
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, environmentType:EnvironmentType(name))`,
        `*, ${orderRelations}, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId)`,
        `*, ${orderRelations}`,
        '*'
    ];

    let result = null;
    let lastError = null;

    for (const selectCols of orderSelectVariants) {
        let query = supabaseClient
            .from('salesOrders')
            .select(selectCols)
            .order('createdAt', { ascending: false });

        if (orderCode) {
            query = query.ilike('orderCode', `%${orderCode}%`);
        }

        const attempt = await query;

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

    if (clientName) {
        const term = clientName.toLocaleLowerCase('pt-BR');
        orders = orders.filter(order =>
            getOrderClientName(order).toLocaleLowerCase('pt-BR').includes(term)
        );
    }

    return { data: orders, error: null };
}

function getGestaoOrdersListFilters() {
    return {
        orderCode: document.getElementById('gestao-orders-filter-order')?.value.trim() || '',
        clientName: document.getElementById('gestao-orders-filter-client')?.value.trim() || ''
    };
}

function renderGestaoOrdersListRows(orders) {
    const tbody = document.getElementById('gestao-orders-list');
    if (!tbody) return;

    if (!orders.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-xs text-slate-400">Nenhum pedido encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    orders.forEach(order => {
        const projectCount = (order.projects || []).length;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-3 font-mono text-xs font-bold text-slate-700">${escapeHtml(order.orderCode || '—')}</td>
            <td class="p-3 text-slate-800">${escapeHtml(getOrderClientName(order) || '—')}</td>
            <td class="p-3 text-slate-500">${escapeHtml(getOrderConsultantNameFromRecord(order) || '—')}</td>
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

async function loadGestaoOrdersList() {
    const tbody = document.getElementById('gestao-orders-list');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-xs text-slate-400">Carregando pedidos...</td></tr>';

    const result = await fetchGestaoOrders(getGestaoOrdersListFilters());

    if (result.error) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-xs text-red-500">Erro ao carregar pedidos: ${escapeHtml(result.error.message)}</td></tr>`;
        return;
    }

    gestaoOrdersCache = result.data || [];
    renderGestaoOrdersListRows(gestaoOrdersCache);
}

function resetGestaoOrdersListFilters() {
    const orderInput = document.getElementById('gestao-orders-filter-order');
    const clientInput = document.getElementById('gestao-orders-filter-client');
    if (orderInput) orderInput.value = '';
    if (clientInput) clientInput.value = '';
    loadGestaoOrdersList();
}

function bindGestaoOrdersListFilterEvents() {
    document.getElementById('gestao-orders-filter-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await loadGestaoOrdersList();
    });

    document.getElementById('gestao-orders-filter-clear')?.addEventListener('click', () => {
        resetGestaoOrdersListFilters();
    });
}

bindGestaoOrdersListFilterEvents();

async function insertGestaoProject(orderId, project, now) {
    const statusId = project.statusId || getDefaultProjectStatusId();
    const deliveryPhaseId = typeof resolveGestaoDeliveryPhaseIdForPersist === 'function'
        ? resolveGestaoDeliveryPhaseIdForPersist(project.deliveryPhaseId)
        : (project.deliveryPhaseId || null);
    const complementaryFields = {
        isComplementary: Boolean(project.isComplementary),
        parentProjectId: project.parentProjectId || null
    };
    const replacedFields = {
        isReplaced: Boolean(project.isReplaced),
        replacedByProjectId: project.isReplaced ? (project.replacedByProjectId || null) : null,
        isReplacement: Boolean(project.isReplacement),
        replacesProjectId: project.isReplacement ? (project.replacesProjectId || null) : null
    };
    const payloadVariants = [
        {
            orderId,
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            saleValue: project.saleValue,
            deliveryDate: project.deliveryDate,
            deliveryPhaseId,
            technicalProjectForecastEndDate: project.technicalProjectForecastEndDate,
            technicalProjectForecastStartDate: project.technicalProjectForecastStartDate,
            statusId,
            designerId: project.designerId,
            approvalNetworkPath: project.approvalNetworkPath,
            ...complementaryFields,
            ...replacedFields,
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
            deliveryPhaseId,
            technicalProjectForecastEndDate: project.technicalProjectForecastEndDate,
            technicalProjectForecastStartDate: project.technicalProjectForecastStartDate,
            statusId,
            designerId: project.designerId,
            approvalNetworkPath: project.approvalNetworkPath,
            ...complementaryFields,
            ...replacedFields,
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

    async function finishGestaoProjectInsert(insertedId) {
        if (insertedId
            && typeof applyGestaoProjectDeliveryPhaseUpdate === 'function'
            && typeof hasGestaoOrderMultiplePhases === 'function'
            && hasGestaoOrderMultiplePhases()
            && project.deliveryPhaseId) {
            await applyGestaoProjectDeliveryPhaseUpdate(insertedId, project.deliveryPhaseId, now);
        }
        return insertedId;
    }

    for (const payload of payloadVariants) {
        const cleanPayload = Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined && value !== '')
        );
        const key = JSON.stringify(cleanPayload);
        if (seen.has(key)) continue;
        seen.add(key);

        const insertResult = await supabaseClient.from('OrderProject').insert(cleanPayload).select('id').single();
        if (!insertResult.error) {
            return finishGestaoProjectInsert(insertResult.data?.id || null);
        }

        if (insertResult.error.message?.includes('isComplementary') || insertResult.error.message?.includes('parentProjectId')) {
            delete cleanPayload.isComplementary;
            delete cleanPayload.parentProjectId;
            const retry = await supabaseClient.from('OrderProject').insert(cleanPayload).select('id').single();
            if (!retry.error) return finishGestaoProjectInsert(retry.data?.id || null);
            lastError = retry.error;
            continue;
        }

        if (insertResult.error.message?.includes('isReplaced')
            || insertResult.error.message?.includes('replacedByProjectId')
            || insertResult.error.message?.includes('isReplacement')
            || insertResult.error.message?.includes('replacesProjectId')) {
            delete cleanPayload.isReplaced;
            delete cleanPayload.replacedByProjectId;
            delete cleanPayload.isReplacement;
            delete cleanPayload.replacesProjectId;
            const retry = await supabaseClient.from('OrderProject').insert(cleanPayload).select('id').single();
            if (!retry.error) return finishGestaoProjectInsert(retry.data?.id || null);
            lastError = retry.error;
            continue;
        }

        if (insertResult.error.message?.includes('deliveryPhaseId')) {
            if (insertResult.error.message?.includes('column')
                || insertResult.error.message?.includes('schema cache')) {
                delete cleanPayload.deliveryPhaseId;
                const retry = await supabaseClient.from('OrderProject').insert(cleanPayload).select('id').single();
                if (!retry.error) return finishGestaoProjectInsert(retry.data?.id || null);
                lastError = retry.error;
                continue;
            }
            throw new Error('Não foi possível salvar a fase de entrega do projeto. Salve as fases do pedido e tente novamente.');
        }

        lastError = insertResult.error;
    }

    throw lastError;
}

async function updateGestaoProject(project, now) {
    const statusId = project.statusId || getDefaultProjectStatusId();
    const deliveryPhaseId = typeof resolveGestaoDeliveryPhaseIdForPersist === 'function'
        ? resolveGestaoDeliveryPhaseIdForPersist(project.deliveryPhaseId)
        : (project.deliveryPhaseId || null);
    const complementaryFields = {
        isComplementary: Boolean(project.isComplementary),
        parentProjectId: project.isComplementary ? (project.parentProjectId || null) : null
    };
    const replacedFields = {
        isReplaced: Boolean(project.isReplaced),
        replacedByProjectId: project.isReplaced ? (project.replacedByProjectId || null) : null,
        isReplacement: Boolean(project.isReplacement),
        replacesProjectId: project.isReplacement ? (project.replacesProjectId || null) : null
    };
    const payloadVariants = [
        {
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            saleValue: project.saleValue,
            deliveryDate: project.deliveryDate,
            deliveryPhaseId,
            technicalProjectForecastEndDate: project.technicalProjectForecastEndDate,
            technicalProjectForecastStartDate: project.technicalProjectForecastStartDate,
            statusId,
            designerId: project.designerId,
            approvalNetworkPath: project.approvalNetworkPath,
            ...complementaryFields,
            ...replacedFields,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            deliveryDate: project.deliveryDate,
            deliveryPhaseId,
            technicalProjectForecastEndDate: project.technicalProjectForecastEndDate,
            technicalProjectForecastStartDate: project.technicalProjectForecastStartDate,
            statusId,
            designerId: project.designerId,
            approvalNetworkPath: project.approvalNetworkPath,
            ...complementaryFields,
            ...replacedFields,
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
    let updated = false;

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

        if (!error) {
            updated = true;
            break;
        }

        if (error.message?.includes('isComplementary') || error.message?.includes('parentProjectId')) {
            delete cleanPayload.isComplementary;
            delete cleanPayload.parentProjectId;
            const retry = await supabaseClient
                .from('OrderProject')
                .update(cleanPayload)
                .eq('id', project.id);
            if (!retry.error) {
                updated = true;
                break;
            }
            lastError = retry.error;
            continue;
        }

        if (error.message?.includes('isReplaced')
            || error.message?.includes('replacedByProjectId')
            || error.message?.includes('isReplacement')
            || error.message?.includes('replacesProjectId')) {
            delete cleanPayload.isReplaced;
            delete cleanPayload.replacedByProjectId;
            delete cleanPayload.isReplacement;
            delete cleanPayload.replacesProjectId;
            const retry = await supabaseClient
                .from('OrderProject')
                .update(cleanPayload)
                .eq('id', project.id);
            if (!retry.error) {
                updated = true;
                break;
            }
            lastError = retry.error;
            continue;
        }

        if (error.message?.includes('deliveryPhaseId')) {
            if (error.message?.includes('column')
                || error.message?.includes('schema cache')) {
                delete cleanPayload.deliveryPhaseId;
                const retry = await supabaseClient
                    .from('OrderProject')
                    .update(cleanPayload)
                    .eq('id', project.id);
                if (!retry.error) {
                    updated = true;
                    break;
                }
                lastError = retry.error;
                continue;
            }
            throw new Error('Não foi possível salvar a fase de entrega do projeto. Salve as fases do pedido e tente novamente.');
        }

        lastError = error;
    }

    if (!updated) {
        throw lastError;
    }

    if (typeof applyGestaoProjectDeliveryPhaseUpdate === 'function'
        && typeof hasGestaoOrderMultiplePhases === 'function'
        && hasGestaoOrderMultiplePhases()) {
        await applyGestaoProjectDeliveryPhaseUpdate(project.id, project.deliveryPhaseId, now);
    }
}

async function persistGestaoProjects(orderId, projects) {
    const now = new Date().toISOString();
    const { projects: complementarResolved, deferred } = await validateAndResolveGestaoComplementarProjects(projects);
    const { projects: substituidoResolved } = await validateAndResolveGestaoSubstituidoProjects(complementarResolved);
    const resolvedProjects = await protectGestaoSubstituicaoFields(substituidoResolved);
    const { data: current } = await supabaseClient
        .from('OrderProject')
        .select('id')
        .eq('orderId', orderId);

    const keepIds = resolvedProjects.filter(project => project.id).map(project => project.id);
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

    const idByCode = {};

    for (const project of resolvedProjects) {
        if (project._pendingParentCode) continue;

        if (project.id) {
            await updateGestaoProject(project, now);
            if (project.projectCode) idByCode[project.projectCode] = project.id;
            if (Array.isArray(project.characteristicIds) && typeof replaceOrderProjectCharacteristics === 'function') {
                await replaceOrderProjectCharacteristics(project.id, project.characteristicIds);
            }
            continue;
        }

        const insertedId = await insertGestaoProject(orderId, project, now);
        if (project.projectCode && insertedId) {
            idByCode[project.projectCode] = insertedId;
        }
        if (insertedId
            && Array.isArray(project.characteristicIds)
            && typeof replaceOrderProjectCharacteristics === 'function') {
            await replaceOrderProjectCharacteristics(insertedId, project.characteristicIds);
        }
    }

    for (const item of deferred) {
        const parentId = idByCode[item.parentProjectCode];
        if (!parentId) {
            throw new Error(`Projeto "${item.project.name}": não foi possível vincular ao projeto pai "${item.parentProjectCode}". Salve o projeto pai antes do complementar.`);
        }

        const batchParent = resolvedProjects.find(project => project.projectCode === item.parentProjectCode);
        item.project.parentProjectId = parentId;
        if (batchParent?.statusId) {
            item.project.statusId = batchParent.statusId;
        }

        if (item.project.id) {
            await updateGestaoProject(item.project, now);
            if (item.project.projectCode) {
                idByCode[item.project.projectCode] = item.project.id;
            }
            if (Array.isArray(item.project.characteristicIds) && typeof replaceOrderProjectCharacteristics === 'function') {
                await replaceOrderProjectCharacteristics(item.project.id, item.project.characteristicIds);
            }
            continue;
        }

        const insertedId = await insertGestaoProject(orderId, item.project, now);
        if (item.project.projectCode && insertedId) {
            idByCode[item.project.projectCode] = insertedId;
        }
        if (insertedId
            && Array.isArray(item.project.characteristicIds)
            && typeof replaceOrderProjectCharacteristics === 'function') {
            await replaceOrderProjectCharacteristics(insertedId, item.project.characteristicIds);
        }
    }

    await syncGestaoSubstituidoCrossLinks(resolvedProjects, now);
}

async function saveGestaoOrder(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const orderCode = document.getElementById('gestao-ord-code')?.value.trim();
    const clientName = document.getElementById('gestao-ord-client')?.value.trim();
    const consultantUserId = Number(document.getElementById('gestao-ord-consultant')?.value) || null;
    const consultantName = document.getElementById('gestao-ord-consultant')?.selectedOptions?.[0]?.textContent?.trim()
        || await resolveConsultantNameById(consultantUserId);

    if (!orderCode) {
        alertAppDialog('Informe o código do pedido.');
        return;
    }
    if (!clientName) {
        alertAppDialog('Informe o nome do cliente.');
        return;
    }
    if (!consultantUserId) {
        alertAppDialog('Selecione o consultor.');
        return;
    }

    const projects = gestaoOrderProjectsDraft || [];
    const isEditingOrder = Boolean(resolveGestaoOrderIdForSave());

    if (!isEditingOrder) {
        if (!projects.length) {
            alertAppDialog('Adicione ao menos um projeto.');
            return;
        }

        for (const project of projects) {
            if (!project.projectCode || !project.name || !project.environmentTypeId || !project.statusId) {
                alertAppDialog('Preencha código, nome, ambiente e status de todos os projetos.');
                return;
            }
            if (project.isComplementary && !project.parentProjectCode) {
                alertAppDialog(`Projeto "${project.name}": informe o código do projeto pai.`);
                return;
            }
            if (project.isReplaced && !project.replacedByProjectCode) {
                alertAppDialog(`Projeto "${project.name}": informe o código do projeto substituto.`);
                return;
            }
            if (!isNumericProjectCode(project.projectCode)) {
                alertAppDialog(`O código do projeto "${project.name}" deve conter somente números.`, { variant: 'warning', title: 'Aviso' });
                return;
            }
            if (Number.isNaN(project.saleValue)) {
                alertAppDialog(`Informe um valor de venda válido para o projeto "${project.name}".`);
                return;
            }
            if (project.deliveryDate) {
                const clientDeliveryDate = resolveGestaoOrderClientDeliveryDateForSave();
                if (clientDeliveryDate
                    && !isProjectTechnicalDeliveryBeforeOrderDelivery(project.deliveryDate, clientDeliveryDate)) {
                    alertAppDialog(`Projeto "${project.name}": a data de entrega do projeto técnico deve ser anterior à data de entrega do pedido.`, { variant: 'warning', title: 'Aviso' });
                    return;
                }
            }
            if (hasGestaoOrderMultiplePhases() && !project.deliveryPhaseId) {
                alertAppDialog(`Projeto "${project.name}": selecione a fase de entrega.`);
                return;
            }
        }
    }

    const now = new Date().toISOString();

    try {
        let orderId = resolveGestaoOrderIdForSave();
        if (isEditingOrder && !orderId) {
            throw new Error('Pedido inválido para edição.');
        }
        const clientIdInput = document.getElementById('gestao-ord-client-id')?.value;
        let clientId = clientIdInput ? Number(clientIdInput) : null;
        if (!clientId && clientName && typeof resolveOrCreateClienteId === 'function') {
            clientId = await resolveOrCreateClienteId(clientName);
        }

        if (!clientId) {
            alertAppDialog('Selecione um cliente válido no cadastro.');
            return;
        }

        if (!isEditingOrder) {
            const { data: existing } = await supabaseClient
                .from('salesOrders')
                .select('id')
                .eq('orderCode', orderCode)
                .maybeSingle();

            if (existing) {
                alertAppDialog('Já existe um pedido com este código.');
                return;
            }

            const orderPayload = {
                orderCode,
                clientId,
                consultantUserId,
                createdById: currentUser.id,
                updatedById: currentUser.id,
                updatedAt: now
            };

            let { data: created, error } = await supabaseClient
                .from('salesOrders')
                .insert(orderPayload)
                .select('id')
                .single();

            if (error?.message?.includes('updatedAt')) {
                const { updatedAt: _u, ...fallback } = orderPayload;
                ({ data: created, error } = await supabaseClient
                    .from('salesOrders')
                    .insert(fallback)
                    .select('id')
                    .single());
            }

            if (error) throw error;
            orderId = Number(created.id);
            setGestaoOrderFormOrderId(orderId);
        }

        orderId = Number(orderId);
        if (!orderId) {
            throw new Error('Pedido inválido.');
        }

        const previousPhasesForProjects = !isEditingOrder
            ? [...getGestaoOrderPhasesDraft()]
            : [];

        let persistedPhases = [];
        if (typeof persistGestaoOrderPhases === 'function') {
            persistedPhases = await persistGestaoOrderPhases(orderId, orderCode, gestaoOrderPhasesDraft);
        }

        if (!isEditingOrder) {
            let projectsToPersist = typeof mapGestaoProjectPhaseIds === 'function'
                ? mapGestaoProjectPhaseIds(projects, persistedPhases, previousPhasesForProjects)
                : projects;

            if (!hasGestaoOrderMultiplePhases(persistedPhases)) {
                projectsToPersist = projectsToPersist.map(project => ({
                    ...project,
                    deliveryPhaseId: null
                }));
            }

            await persistGestaoProjects(orderId, projectsToPersist);
        }

        const deliveryDateToSave = resolveGestaoOrderClientDeliveryDateForSave(persistedPhases);
        const rawDeliveryInput = normalizeIsoDateValue(
            document.getElementById('gestao-ord-client-delivery')?.value || ''
        );

        if (rawDeliveryInput && !deliveryDateToSave) {
            alertAppDialog('Não foi possível determinar a data de entrega. Verifique as fases do pedido.');
            return;
        }

        const previousConsultantName = isEditingOrder
            ? getOrderConsultantNameFromRecord(gestaoOrdersCache.find(item => Number(item.id) === Number(orderId)))
            : '';

        await updateSalesOrderRecord(orderId, {
            clientId,
            consultantUserId,
            updatedById: currentUser?.id || null,
            updatedAt: now
        });

        if (typeof syncSalesOrdersConsultantName === 'function') {
            await syncSalesOrdersConsultantName(previousConsultantName, consultantName, consultantUserId);
        }

        if (deliveryDateToSave) {
            await persistSalesOrderClientDeliveryDate(orderId, deliveryDateToSave, {
                orderCode
            });
        }

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
            || error.message?.includes('isComplementary')
            || error.message?.includes('parentProjectId')
            || error.message?.includes('OrderDeliveryPhase')
            || error.message?.includes('deliveryPhaseId')
            ? '\n\nExecute os SQL supabase/create-gestao-order-fields.sql, supabase/create-order-project-status.sql, supabase/create-order-project-complementar.sql, supabase/create-order-project-substituido.sql e supabase/create-order-delivery-phases.sql no Supabase.'
            : '';
        alertAppDialog('Erro ao salvar pedido: ' + error.message + sqlHint);
    }
}
