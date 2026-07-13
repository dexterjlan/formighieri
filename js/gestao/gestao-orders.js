async function openGestaoCreateOrderForm() {
    if (!canAccessGestao()) return;

    editingGestaoOrderId = null;
    document.getElementById('gestao-order-form')?.reset();
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

    setGestaoOrderProjectsDraft(order.projects || []);
    await loadGestaoOrderPhasesForOrder(orderId);
    if (typeof ensureGestaoProjectsHavePhaseDefaults === 'function') {
        ensureGestaoProjectsHavePhaseDefaults();
    }
    syncGestaoOrderClientDeliveryField();
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

async function fetchGestaoParentProjectsByCodes(projectCodes) {
    const codes = [...new Set((projectCodes || []).map(code => normalizeProjectCodeInput(code)).filter(Boolean))];
    if (!codes.length) return {};

    const selectVariants = [
        'id, projectCode, statusId, saleValue, isComplementar, isSubstituido, isSubstituicao, projectStatus:OrderProjectStatus(id, name, sortOrder), order:salesOrders(orderCode)',
        'id, projectCode, statusId, saleValue, isComplementar, isSubstituido, isSubstituicao, projectStatus:OrderProjectStatus(id, name, sortOrder)',
        'id, projectCode, statusId, isComplementar, isSubstituido, isSubstituicao, projectStatus:OrderProjectStatus(id, name, sortOrder), order:salesOrders(orderCode)',
        'id, projectCode, statusId, isComplementar, isSubstituido, isSubstituicao, projectStatus:OrderProjectStatus(id, name, sortOrder)',
        'id, projectCode, statusId, isComplementar, isSubstituido, isSubstituicao',
        'id, projectCode, statusId, isComplementar',
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
        if (project.projectCode) {
            byCode.set(project.projectCode, project);
        }
    });

    const dbLookupCodes = new Set();
    for (const project of projects) {
        if (!project.isComplementar) {
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
        if (!project.isComplementar) continue;

        let parent = dbParentsByCode[project.parentProjectCode] || byCode.get(project.parentProjectCode);

        if (!parent) {
            throw new Error(`Projeto "${project.name}": projeto pai "${project.parentProjectCode}" não encontrado.`);
        }

        if (parent.isComplementar) {
            throw new Error(`Projeto "${project.name}": o projeto pai não pode ser complementar.`);
        }

        const statusName = parent.projectStatus?.name || '';
        const sortOrder = parent.projectStatus?.sortOrder ?? null;
        if (!isComplementarParentStatusAllowed(statusName, sortOrder)) {
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
    const dbLookupCodes = new Set();

    for (const project of projects) {
        if (project.isComplementar && project.isSubstituido) {
            throw new Error(`Projeto "${project.name}": não pode ser complementar e substituído ao mesmo tempo.`);
        }

        if (!project.isSubstituido) {
            project.substituidoPorProjectId = null;
        }

        if (!project.isSubstituicao) {
            project.substituiProjectId = null;
        }

        if (project.isSubstituido) {
            if (!project.substituidoPorProjectCode) {
                throw new Error(`Projeto "${project.name}": informe o código do projeto substituto.`);
            }

            if (project.substituidoPorProjectCode === project.projectCode) {
                throw new Error(`Projeto "${project.name}": o código do projeto substituto não pode ser o próprio projeto.`);
            }

            if (!isSubstituidoEligibleStatus(project)) {
                throw new Error(
                    `Projeto "${project.name}": só pode ser marcado como substituído até "Aguardando Projeto Técnico".`
                );
            }

            dbLookupCodes.add(project.substituidoPorProjectCode);
        }
    }

    const linkedByCode = await fetchGestaoParentProjectsByCodes([...dbLookupCodes]);
    const substituidoStatusId = getSubstituidoStatusId();

    if (!substituidoStatusId) {
        const needsSubstituidoStatus = projects.some(project => project.isSubstituido);
        if (needsSubstituidoStatus) {
            throw new Error('Status "Projeto Substituído" não encontrado. Execute supabase/create-order-project-substituido.sql no Supabase.');
        }
    }

    for (const project of projects) {
        if (project.isSubstituido) {
            const replacement = linkedByCode[project.substituidoPorProjectCode];
            if (!replacement) {
                throw new Error(`Projeto "${project.name}": projeto substituto "${project.substituidoPorProjectCode}" não encontrado.`);
            }

            if (replacement.isComplementar) {
                throw new Error(`Projeto "${project.name}": o projeto substituto não pode ser complementar.`);
            }

            if (replacement.isSubstituido) {
                throw new Error(`Projeto "${project.name}": o projeto substituto já está marcado como substituído.`);
            }

            project.substituidoPorProjectId = replacement.id;
            project.substituidoPorProject = {
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
    const persistedSubstituicao = (projects || []).filter(project => project.id && project.isSubstituicao);
    if (!persistedSubstituicao.length) return projects;

    const selectVariants = [
        'id, isSubstituicao, substituiProjectId, substitui:substituiProjectId(projectCode)',
        'id, isSubstituicao, substituiProjectId'
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
        if (!original?.isSubstituicao) return project;

        const originalCode = normalizeProjectCodeInput(original.substitui?.projectCode || '');
        const incomingCode = normalizeProjectCodeInput(project.substituiProjectCode || '');

        if (!project.isSubstituicao) {
            throw new Error(`Projeto "${project.name}": a flag de substituição não pode ser removida.`);
        }

        if (incomingCode && originalCode && incomingCode !== originalCode) {
            throw new Error(`Projeto "${project.name}": o código do projeto original não pode ser alterado.`);
        }

        return {
            ...project,
            isSubstituicao: true,
            substituiProjectId: original.substituiProjectId || project.substituiProjectId || null,
            substituiProjectCode: originalCode || incomingCode,
            substituiProject: original.substitui || project.substituiProject || null
        };
    });
}

async function syncGestaoSubstituidoCrossLinks(projects, now) {
    for (const project of projects) {
        if (!project.isSubstituido || !project.substituidoPorProjectId) continue;

        const payload = {
            isSubstituicao: true,
            substituiProjectId: project.id,
            updatedById: currentUser.id,
            updatedAt: now
        };

        let { error } = await supabaseClient
            .from('OrderProject')
            .update(payload)
            .eq('id', project.substituidoPorProjectId);

        if (error?.message?.includes('isSubstituicao') || error?.message?.includes('substituiProjectId')) {
            delete payload.isSubstituicao;
            delete payload.substituiProjectId;
            ({ error } = await supabaseClient
                .from('OrderProject')
                .update(payload)
                .eq('id', project.substituidoPorProjectId));
        }

        if (error) throw error;
    }
}

async function fetchGestaoProjectsByOrderIds(orderIds) {
    const normalizedIds = [...new Set(orderIds.map(id => Number(id)).filter(Boolean))];
    if (!normalizedIds.length) return {};

    const selectVariants = [
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, previsaoConclusaoProjetoTecnico, statusId, designerId, deliveryPhaseId, caminhoRedeAprovacao, isComplementar, parentProjectId, isSubstituido, substituidoPorProjectId, isSubstituicao, substituiProjectId, parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), substituidoPor:substituidoPorProjectId(projectCode, order:salesOrders(orderCode)), substitui:substituiProjectId(projectCode, saleValue, order:salesOrders(orderCode)), environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, deliveryPhaseId, caminhoRedeAprovacao, isComplementar, parentProjectId, isSubstituido, substituidoPorProjectId, isSubstituicao, substituiProjectId, parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), substituidoPor:substituidoPorProjectId(projectCode, order:salesOrders(orderCode)), substitui:substituiProjectId(projectCode, saleValue, order:salesOrders(orderCode)), environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, caminhoRedeAprovacao, isComplementar, parentProjectId, isSubstituido, substituidoPorProjectId, isSubstituicao, substituiProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, caminhoRedeAprovacao, isComplementar, parentProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, caminhoRedeAprovacao, environmentType:EnvironmentType(name)',
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, caminhoRedeAprovacao, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, caminhoRedeAprovacao, environmentType:EnvironmentType(name)',
        'id, orderId, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, caminhoRedeAprovacao',
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
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, previsaoConclusaoProjetoTecnico, statusId, designerId, deliveryPhaseId, caminhoRedeAprovacao, isComplementar, parentProjectId, isSubstituido, substituidoPorProjectId, isSubstituicao, substituiProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, deliveryPhaseId, caminhoRedeAprovacao, isComplementar, parentProjectId, isSubstituido, substituidoPorProjectId, isSubstituicao, substituiProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, caminhoRedeAprovacao, isComplementar, parentProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, saleValue, deliveryDate, statusId, designerId, caminhoRedeAprovacao, environmentType:EnvironmentType(name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, caminhoRedeAprovacao, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, caminhoRedeAprovacao, environmentType:EnvironmentType(name))',
        '*, projects:OrderProject(id, projectCode, name, environmentTypeId, deliveryDate, statusId, designerId, caminhoRedeAprovacao)',
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
    const deliveryPhaseId = typeof resolveGestaoDeliveryPhaseIdForPersist === 'function'
        ? resolveGestaoDeliveryPhaseIdForPersist(project.deliveryPhaseId)
        : (project.deliveryPhaseId || null);
    const complementarFields = {
        isComplementar: Boolean(project.isComplementar),
        parentProjectId: project.parentProjectId || null
    };
    const substituidoFields = {
        isSubstituido: Boolean(project.isSubstituido),
        substituidoPorProjectId: project.isSubstituido ? (project.substituidoPorProjectId || null) : null,
        isSubstituicao: Boolean(project.isSubstituicao),
        substituiProjectId: project.isSubstituicao ? (project.substituiProjectId || null) : null
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
            previsaoConclusaoProjetoTecnico: project.previsaoConclusaoProjetoTecnico,
            statusId,
            designerId: project.designerId,
            caminhoRedeAprovacao: project.caminhoRedeAprovacao,
            ...complementarFields,
            ...substituidoFields,
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
            previsaoConclusaoProjetoTecnico: project.previsaoConclusaoProjetoTecnico,
            statusId,
            designerId: project.designerId,
            caminhoRedeAprovacao: project.caminhoRedeAprovacao,
            ...complementarFields,
            ...substituidoFields,
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

        if (insertResult.error.message?.includes('isComplementar') || insertResult.error.message?.includes('parentProjectId')) {
            delete cleanPayload.isComplementar;
            delete cleanPayload.parentProjectId;
            const retry = await supabaseClient.from('OrderProject').insert(cleanPayload).select('id').single();
            if (!retry.error) return finishGestaoProjectInsert(retry.data?.id || null);
            lastError = retry.error;
            continue;
        }

        if (insertResult.error.message?.includes('isSubstituido')
            || insertResult.error.message?.includes('substituidoPorProjectId')
            || insertResult.error.message?.includes('isSubstituicao')
            || insertResult.error.message?.includes('substituiProjectId')) {
            delete cleanPayload.isSubstituido;
            delete cleanPayload.substituidoPorProjectId;
            delete cleanPayload.isSubstituicao;
            delete cleanPayload.substituiProjectId;
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
    const complementarFields = {
        isComplementar: Boolean(project.isComplementar),
        parentProjectId: project.isComplementar ? (project.parentProjectId || null) : null
    };
    const substituidoFields = {
        isSubstituido: Boolean(project.isSubstituido),
        substituidoPorProjectId: project.isSubstituido ? (project.substituidoPorProjectId || null) : null,
        isSubstituicao: Boolean(project.isSubstituicao),
        substituiProjectId: project.isSubstituicao ? (project.substituiProjectId || null) : null
    };
    const payloadVariants = [
        {
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            saleValue: project.saleValue,
            deliveryDate: project.deliveryDate,
            deliveryPhaseId,
            previsaoConclusaoProjetoTecnico: project.previsaoConclusaoProjetoTecnico,
            statusId,
            designerId: project.designerId,
            caminhoRedeAprovacao: project.caminhoRedeAprovacao,
            ...complementarFields,
            ...substituidoFields,
            updatedById: currentUser.id,
            updatedAt: now
        },
        {
            projectCode: project.projectCode,
            name: project.name,
            environmentTypeId: project.environmentTypeId,
            deliveryDate: project.deliveryDate,
            deliveryPhaseId,
            previsaoConclusaoProjetoTecnico: project.previsaoConclusaoProjetoTecnico,
            statusId,
            designerId: project.designerId,
            caminhoRedeAprovacao: project.caminhoRedeAprovacao,
            ...complementarFields,
            ...substituidoFields,
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

        if (error.message?.includes('isComplementar') || error.message?.includes('parentProjectId')) {
            delete cleanPayload.isComplementar;
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

        if (error.message?.includes('isSubstituido')
            || error.message?.includes('substituidoPorProjectId')
            || error.message?.includes('isSubstituicao')
            || error.message?.includes('substituiProjectId')) {
            delete cleanPayload.isSubstituido;
            delete cleanPayload.substituidoPorProjectId;
            delete cleanPayload.isSubstituicao;
            delete cleanPayload.substituiProjectId;
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
            continue;
        }

        const insertedId = await insertGestaoProject(orderId, project, now);
        if (project.projectCode && insertedId) {
            idByCode[project.projectCode] = insertedId;
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
            continue;
        }

        const insertedId = await insertGestaoProject(orderId, item.project, now);
        if (item.project.projectCode && insertedId) {
            idByCode[item.project.projectCode] = insertedId;
        }
    }

    await syncGestaoSubstituidoCrossLinks(resolvedProjects, now);
}

async function saveGestaoOrder(event) {
    event.preventDefault();
    if (!canAccessGestao()) return;

    const orderCode = document.getElementById('gestao-ord-code')?.value.trim();
    const clientName = document.getElementById('gestao-ord-client')?.value.trim();
    const consultantName = document.getElementById('gestao-ord-consultant')?.value.trim();
    const clientDeliveryDate = document.getElementById('gestao-ord-client-delivery')?.value || null;
    const projects = gestaoOrderProjectsDraft || [];

    if (!orderCode) {
        alertAppDialog('Informe o código do pedido.');
        return;
    }
    if (!clientName) {
        alertAppDialog('Informe o nome do cliente.');
        return;
    }
    if (!consultantName) {
        alertAppDialog('Selecione o consultor.');
        return;
    }
    if (!projects.length) {
        alertAppDialog('Adicione ao menos um projeto.');
        return;
    }

    for (const project of projects) {
        if (!project.projectCode || !project.name || !project.environmentTypeId || !project.statusId) {
            alertAppDialog('Preencha código, nome, ambiente e status de todos os projetos.');
            return;
        }
        if (project.isComplementar && !project.parentProjectCode) {
            alertAppDialog(`Projeto "${project.name}": informe o código do projeto pai.`);
            return;
        }
        if (project.isSubstituido && !project.substituidoPorProjectCode) {
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
        if (project.deliveryDate && clientDeliveryDate
            && !isProjectTechnicalDeliveryBeforeOrderDelivery(project.deliveryDate, clientDeliveryDate)) {
            alertAppDialog(`Projeto "${project.name}": a data de entrega do projeto técnico deve ser anterior à data de entrega do pedido.`, { variant: 'warning', title: 'Aviso' });
            return;
        }
        if (hasGestaoOrderMultiplePhases() && !project.deliveryPhaseId) {
            alertAppDialog(`Projeto "${project.name}": selecione a fase de entrega.`);
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
                alertAppDialog('Já existe um pedido com este código.');
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

        const previousPhases = editingGestaoOrderId
            ? await fetchGestaoOrderPhases(orderId)
            : [...getGestaoOrderPhasesDraft()];

        let persistedPhases = [];
        if (typeof persistGestaoOrderPhases === 'function') {
            persistedPhases = await persistGestaoOrderPhases(orderId, orderCode, gestaoOrderPhasesDraft);
        }

        let projectsToPersist = typeof mapGestaoProjectPhaseIds === 'function'
            ? mapGestaoProjectPhaseIds(projects, persistedPhases, previousPhases)
            : projects;

        if (!hasGestaoOrderMultiplePhases(persistedPhases)) {
            projectsToPersist = projectsToPersist.map(project => ({
                ...project,
                deliveryPhaseId: null
            }));
        }

        await persistGestaoProjects(orderId, projectsToPersist);

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
            || error.message?.includes('isComplementar')
            || error.message?.includes('parentProjectId')
            || error.message?.includes('OrderDeliveryPhase')
            || error.message?.includes('deliveryPhaseId')
            ? '\n\nExecute os SQL supabase/create-gestao-order-fields.sql, supabase/create-order-project-status.sql, supabase/create-order-project-complementar.sql, supabase/create-order-project-substituido.sql e supabase/create-order-delivery-phases.sql no Supabase.'
            : '';
        alertAppDialog('Erro ao salvar pedido: ' + error.message + sqlHint);
    }
}
