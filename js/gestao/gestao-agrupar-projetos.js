let gestaoAgruparProjetosOrderCache = null;
let gestaoAgruparProjetosPhases = [];
let gestaoAgruparProjetosEligibleCache = [];
let gestaoAgruparProjetosSelectedStatusId = null;
let gestaoAgruparProjetosSelectedDeliveryKey = null;
let gestaoAgruparProjetosSelectedDesignerKey = null;
const gestaoAgruparProjetosSelectedIds = new Set();
let gestaoAgruparProjetosOrders = [];
let gestaoAgruparProjetosSelectedOrderId = null;
let gestaoAgruparProjetosOrderHighlight = -1;
let gestaoAgruparProjetosOrderQuery = '';

const GESTAO_AGRUPAR_PROJETOS_EMPTY_ORDER_MESSAGE = 'Selecione um pedido para ver os ambientes.';

function normalizeGestaoAgruparProjetosSearch(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function gestaoAgruparProjetosOrderLabel(order) {
    const clientName = order?.client?.name || '';
    if (clientName && order.orderCode) return `${order.orderCode} — ${clientName}`;
    return order?.orderCode || clientName || `Pedido ${order?.id || ''}`;
}

function filterGestaoAgruparProjetosOrders(query) {
    const term = normalizeGestaoAgruparProjetosSearch(query);
    const matches = !term
        ? gestaoAgruparProjetosOrders
        : gestaoAgruparProjetosOrders.filter(order => {
            const clientName = normalizeGestaoAgruparProjetosSearch(order.client?.name);
            const code = normalizeGestaoAgruparProjetosSearch(order.orderCode);
            return clientName.includes(term) || code.includes(term);
        });
    return matches.slice(0, 40);
}

function setGestaoAgruparProjetosOrderListOpen(open) {
    const list = document.getElementById('gestao-agrupar-projetos-order-list');
    const input = document.getElementById('gestao-agrupar-projetos-order-search');
    if (!list || !input) return;
    list.classList.toggle('hidden', !open);
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) gestaoAgruparProjetosOrderHighlight = -1;
}

function renderGestaoAgruparProjetosOrderOptions() {
    const list = document.getElementById('gestao-agrupar-projetos-order-list');
    if (!list) return;

    const matches = filterGestaoAgruparProjetosOrders(gestaoAgruparProjetosOrderQuery);
    if (!matches.length) {
        gestaoAgruparProjetosOrderHighlight = -1;
        list.innerHTML = '<p class="px-3 py-2 text-xs text-slate-400">Nenhum pedido encontrado para esse cliente.</p>';
        return;
    }

    list.innerHTML = matches.map((order, index) => {
        const active = index === gestaoAgruparProjetosOrderHighlight ? ' bg-slate-100' : '';
        return `<button type="button" class="gestao-agrupar-projetos-order-option w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-slate-50${active}" data-order-id="${order.id}" data-option-index="${index}" role="option">${escapeHtml(gestaoAgruparProjetosOrderLabel(order))}</button>`;
    }).join('');
}

async function loadGestaoAgruparProjetosOrderOptions() {
    const input = document.getElementById('gestao-agrupar-projetos-order-search');
    if (!input) return;

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, client:Client(name)')
        .order('orderCode', { ascending: false })
        .limit(1000);

    if (error) throw error;

    gestaoAgruparProjetosOrders = data || [];
    const selected = gestaoAgruparProjetosOrders.find(
        order => Number(order.id) === Number(gestaoAgruparProjetosSelectedOrderId)
    );
    input.value = selected ? gestaoAgruparProjetosOrderLabel(selected) : '';
    gestaoAgruparProjetosOrderQuery = '';
    renderGestaoAgruparProjetosOrderOptions();
}

function getGestaoAgruparProjetosDesignerKey(project) {
    const designerId = Number(project?.designerId);
    return designerId > 0 ? String(designerId) : '';
}

function clearGestaoAgruparProjetosProjectSelection() {
    gestaoAgruparProjetosSelectedStatusId = null;
    gestaoAgruparProjetosSelectedDeliveryKey = null;
    gestaoAgruparProjetosSelectedDesignerKey = null;
    gestaoAgruparProjetosSelectedIds.clear();
}

function getGestaoAgruparProjetosDelivery(project) {
    const phases = gestaoAgruparProjetosPhases || [];
    if (phases.length) {
        const phaseId = Number(project?.deliveryPhaseId);
        const phase = phases.find(item => Number(item.id) === phaseId)
            || (phases.length === 1 ? phases[0] : null);
        return {
            date: phase?.deliveryDate || null,
            phase
        };
    }

    return {
        date: gestaoAgruparProjetosOrderCache?.clientDeliveryDate || null,
        phase: null
    };
}

function getGestaoAgruparProjetosDeliveryKey(project) {
    return normalizeOrderProjectDeliveryDateKey(getGestaoAgruparProjetosDelivery(project).date);
}

async function loadGestaoAgruparProjetosDeliveryContext(orderId) {
    const normalizedOrderId = Number(orderId);
    gestaoAgruparProjetosPhases = [];
    if (!normalizedOrderId) return;

    const [phases, orderResult] = await Promise.all([
        typeof fetchGestaoOrderPhases === 'function'
            ? fetchGestaoOrderPhases(normalizedOrderId)
            : Promise.resolve([]),
        supabaseClient
            .from('salesOrders')
            .select('id, clientDeliveryDate')
            .eq('id', normalizedOrderId)
            .maybeSingle()
    ]);

    gestaoAgruparProjetosPhases = phases || [];
    if (gestaoAgruparProjetosOrderCache && !orderResult.error && orderResult.data) {
        gestaoAgruparProjetosOrderCache.clientDeliveryDate = orderResult.data.clientDeliveryDate || null;
    }
}

function clearGestaoAgruparProjetosOrderSelection() {
    gestaoAgruparProjetosSelectedOrderId = null;
    gestaoAgruparProjetosOrderCache = null;
    gestaoAgruparProjetosPhases = [];
    gestaoAgruparProjetosEligibleCache = [];
    clearGestaoAgruparProjetosProjectSelection();
    const summaryEl = document.getElementById('gestao-agrupar-projetos-order-summary');
    if (summaryEl) summaryEl.textContent = '';
}

function syncGestaoAgruparProjetosSaveButton() {
    const button = document.getElementById('gestao-agrupar-projetos-save');
    const nameInput = document.getElementById('gestao-agrupar-projetos-name');
    const checked = gestaoAgruparProjetosSelectedIds.size;
    const hasName = Boolean(String(nameInput?.value || '').trim());
    const hasOrder = Boolean(gestaoAgruparProjetosOrderCache?.id);

    if (button) {
        button.disabled = !hasOrder || !hasName || checked < 2;
        button.textContent = checked >= 2
            ? `Criar agrupador (${checked} ambientes)`
            : 'Criar agrupador';
    }
}

function getGestaoAgruparProjetosIneligibleReason(project, eligibleStatusIds) {
    if (isOrderProjectAggregator(project)) return 'Já é agrupador';
    if (isOrderProjectGroupedChild(project)) return 'Já vinculado a um agrupador';
    if (isComplementaryOrderProject(project)) return 'Complementar não pode ser agrupado';
    if (isReplacedOrderProject(project)) return 'Projeto substituído';
    if (isReplacementOrderProject(project)) return 'Projeto de substituição';
    if (!isOrderProjectEligibleForAggregation(project, eligibleStatusIds)) {
        return `Fora do intervalo ${ORDER_PROJECT_AGGREGATOR_STATUS_START} até ${ORDER_PROJECT_AGGREGATOR_STATUS_END}`;
    }
    if (!getGestaoAgruparProjetosDeliveryKey(project)) {
        return gestaoAgruparProjetosPhases.length
            ? 'Sem data de entrega da fase'
            : 'Sem data de entrega do pedido';
    }
    return '';
}

function renderGestaoAgruparProjetosList() {
    const tbody = document.getElementById('gestao-agrupar-projetos-list');
    const countEl = document.getElementById('gestao-agrupar-projetos-count');
    const hintEl = document.getElementById('gestao-agrupar-projetos-status-hint');
    if (!tbody) return;

    const projects = gestaoAgruparProjetosEligibleCache;
    const eligibleStatusIds = orderProjectAggregatorEligibleStatusIdsCache?.statusIds || [];

    if (countEl) {
        countEl.textContent = gestaoAgruparProjetosOrderCache
            ? `${projects.length} projeto(s) no pedido`
            : 'Nenhum pedido carregado';
    }

    if (hintEl) {
        if (!gestaoAgruparProjetosSelectedStatusId) {
            hintEl.textContent = 'Selecione ao menos dois projetos com o mesmo projetista, o mesmo status e a mesma data de entrega do pedido ou da fase.';
        } else {
            const statusName = orderProjectAggregatorEligibleStatusIdsCache?.statusById?.[gestaoAgruparProjetosSelectedStatusId]?.name
                || '—';
            const deliveryLabel = gestaoAgruparProjetosSelectedDeliveryKey
                ? (typeof formatGestaoDate === 'function'
                    ? formatGestaoDate(gestaoAgruparProjetosSelectedDeliveryKey)
                    : gestaoAgruparProjetosSelectedDeliveryKey)
                : '—';
            const selectedProject = projects.find(project => gestaoAgruparProjetosSelectedIds.has(Number(project.id)));
            const designerName = selectedProject?.designer?.name || 'sem projetista';
            hintEl.textContent = `Somente projetos de ${designerName}, em "${statusName}", com entrega em ${deliveryLabel} podem ser selecionados.`;
        }
    }

    if (!gestaoAgruparProjetosOrderCache) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-6 text-center text-xs text-slate-500">
                    ${escapeHtml(GESTAO_AGRUPAR_PROJETOS_EMPTY_ORDER_MESSAGE)}
                </td>
            </tr>
        `;
        syncGestaoAgruparProjetosSaveButton();
        return;
    }

    if (!projects.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-6 text-center text-xs text-slate-500">
                    Nenhum projeto encontrado neste pedido.
                </td>
            </tr>
        `;
        syncGestaoAgruparProjetosSaveButton();
        return;
    }

    tbody.innerHTML = projects.map(project => {
        const reason = getGestaoAgruparProjetosIneligibleReason(project, eligibleStatusIds);
        const statusName = getOrderProjectStatusName(project);
        const statusId = Number(project.statusId || project.projectStatus?.id);
        const delivery = getGestaoAgruparProjetosDelivery(project);
        const deliveryKey = normalizeOrderProjectDeliveryDateKey(delivery.date);
        const deliveryLabel = typeof formatGestaoDate === 'function'
            ? formatGestaoDate(delivery.date)
            : (deliveryKey || '—');
        const phaseLabel = delivery.phase?.name || '';
        const designerKey = getGestaoAgruparProjetosDesignerKey(project);
        const statusMismatch = gestaoAgruparProjetosSelectedStatusId
            && statusId !== gestaoAgruparProjetosSelectedStatusId;
        const deliveryMismatch = gestaoAgruparProjetosSelectedDeliveryKey
            && deliveryKey !== gestaoAgruparProjetosSelectedDeliveryKey;
        const designerMismatch = gestaoAgruparProjetosSelectedDesignerKey !== null
            && designerKey !== gestaoAgruparProjetosSelectedDesignerKey;
        const disabled = Boolean(reason) || statusMismatch || deliveryMismatch || designerMismatch;
        const checked = !disabled && gestaoAgruparProjetosSelectedIds.has(Number(project.id));

        return `
            <tr data-project-id="${project.id}" class="${disabled ? 'opacity-50' : ''}">
                <td class="p-3 text-center">
                    <input type="checkbox"
                        class="gestao-agrupar-projetos-checkbox rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        data-project-id="${project.id}"
                        data-status-id="${statusId}"
                        data-delivery-key="${escapeHtml(deliveryKey)}"
                        data-designer-key="${escapeHtml(designerKey)}"
                        ${disabled ? 'disabled' : ''}
                        ${checked ? 'checked' : ''}>
                </td>
                <td class="p-3 text-xs text-slate-800">${escapeHtml(project.name || '—')}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(project.designer?.name || '—')}</td>
                <td class="p-3 font-mono text-xs text-slate-600">${escapeHtml(project.projectCode || '—')}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">
                    ${escapeHtml(deliveryLabel)}
                    ${phaseLabel ? `<div class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(phaseLabel)}</div>` : ''}
                </td>
                <td class="p-3 text-xs text-slate-600">
                    ${escapeHtml(statusName)}
                    ${reason ? `<div class="text-[10px] text-amber-700 mt-0.5">${escapeHtml(reason)}</div>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.gestao-agrupar-projetos-checkbox').forEach(input => {
        input.addEventListener('change', () => {
            const projectId = Number(input.dataset.projectId);
            const statusId = Number(input.dataset.statusId);
            const deliveryKey = String(input.dataset.deliveryKey || '').trim();
            const designerKey = input.dataset.designerKey || '';

            if (input.checked) {
                if (!gestaoAgruparProjetosSelectedStatusId) {
                    gestaoAgruparProjetosSelectedStatusId = statusId;
                }
                if (gestaoAgruparProjetosSelectedDeliveryKey === null && deliveryKey) {
                    gestaoAgruparProjetosSelectedDeliveryKey = deliveryKey;
                }
                if (gestaoAgruparProjetosSelectedDesignerKey === null) {
                    gestaoAgruparProjetosSelectedDesignerKey = designerKey;
                }
                gestaoAgruparProjetosSelectedIds.add(projectId);
            } else {
                gestaoAgruparProjetosSelectedIds.delete(projectId);
                if (!gestaoAgruparProjetosSelectedIds.size) {
                    gestaoAgruparProjetosSelectedStatusId = null;
                    gestaoAgruparProjetosSelectedDeliveryKey = null;
                    gestaoAgruparProjetosSelectedDesignerKey = null;
                }
            }

            renderGestaoAgruparProjetosList();
            syncGestaoAgruparProjetosSaveButton();
        });
    });

    syncGestaoAgruparProjetosSaveButton();
}

async function fetchGestaoAgruparProjetosProjectsForOrder(orderId) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) {
        return [];
    }

    const selectVariants = [
        'id, orderId, projectCode, name, statusId, deliveryDate, deliveryPhaseId, environmentTypeId, designerId, isComplementary, parentProjectId, isReplaced, replacedByProjectId, isReplacement, replacesProjectId, isAggregator, aggregatorOrderProjectId, designer:appUsers!OrderProject_designerId_fkey(id, name), projectStatus:OrderProjectStatus(id, name, sortOrder)',
        'id, orderId, projectCode, name, statusId, deliveryDate, deliveryPhaseId, environmentTypeId, designerId, isComplementary, parentProjectId, isReplaced, replacedByProjectId, isReplacement, replacesProjectId, isAggregator, aggregatorOrderProjectId, projectStatus:OrderProjectStatus(id, name, sortOrder)',
        'id, orderId, projectCode, name, statusId, deliveryDate, environmentTypeId, designerId, isComplementary, parentProjectId, isReplaced, isReplacement, projectStatus:OrderProjectStatus(id, name, sortOrder)',
        'id, orderId, projectCode, name, statusId, deliveryDate, environmentTypeId, designerId, isComplementary, parentProjectId, projectStatus:OrderProjectStatus(id, name, sortOrder)'
    ];

    let projects = [];
    let lastError = null;

    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .eq('orderId', normalizedOrderId)
            .order('name', { ascending: true });

        if (!error) {
            projects = data || [];
            lastError = null;
            break;
        }
        lastError = error;
    }

    if (lastError) {
        throw new Error(lastError.message);
    }

    return enrichGestaoAgruparProjetosDesigners(projects);
}

async function enrichGestaoAgruparProjetosDesigners(projects = []) {
    const missingIds = [...new Set(projects
        .filter(project => project.designerId && !project.designer?.name)
        .map(project => Number(project.designerId))
        .filter(Boolean))];

    if (!missingIds.length) return projects;

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name')
        .in('id', missingIds);

    if (error) {
        console.warn('enrichGestaoAgruparProjetosDesigners:', error);
        return projects;
    }

    const designerById = Object.fromEntries((data || []).map(designer => [Number(designer.id), designer]));
    return projects.map(project => ({
        ...project,
        designer: project.designer?.name
            ? project.designer
            : (designerById[Number(project.designerId)] || null)
    }));
}

async function selectGestaoAgruparProjetosOrder(orderId) {
    if (!canManageOrderProjectAggregator()) {
        alertAppDialog('Sem permissão para agrupar projetos.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const order = gestaoAgruparProjetosOrders.find(item => Number(item.id) === Number(orderId));
    const input = document.getElementById('gestao-agrupar-projetos-order-search');
    const summaryEl = document.getElementById('gestao-agrupar-projetos-order-summary');
    const tbody = document.getElementById('gestao-agrupar-projetos-list');

    gestaoAgruparProjetosSelectedOrderId = order ? Number(order.id) : null;
    if (input) input.value = order ? gestaoAgruparProjetosOrderLabel(order) : '';
    setGestaoAgruparProjetosOrderListOpen(false);
    clearGestaoAgruparProjetosProjectSelection();

    if (!order) {
        clearGestaoAgruparProjetosOrderSelection();
        renderGestaoAgruparProjetosList();
        syncGestaoAgruparProjetosSaveButton();
        return;
    }

    gestaoAgruparProjetosOrderCache = order;
    await loadGestaoAgruparProjetosDeliveryContext(order.id);
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-6 text-center text-xs text-slate-400">Carregando projetos...</td>
            </tr>
        `;
    }

    try {
        await getOrderProjectAggregatorEligibleStatusRange();
        gestaoAgruparProjetosEligibleCache = await fetchGestaoAgruparProjetosProjectsForOrder(order.id);

        if (summaryEl) {
            summaryEl.textContent = `${order.orderCode || '—'} · ${getOrderClientName(order) || '—'}`;
        }

        renderGestaoAgruparProjetosList();
    } catch (error) {
        console.error('selectGestaoAgruparProjetosOrder:', error);
        gestaoAgruparProjetosEligibleCache = [];
        alertAppDialog(`Erro ao carregar projetos: ${error.message}`, { variant: 'error', title: 'Erro' });
        renderGestaoAgruparProjetosList();
    }
}

async function reloadGestaoAgruparProjetosProjectsForSelectedOrder() {
    if (!gestaoAgruparProjetosSelectedOrderId) {
        renderGestaoAgruparProjetosList();
        return;
    }
    await selectGestaoAgruparProjetosOrder(gestaoAgruparProjetosSelectedOrderId);
}

async function initGestaoAgruparProjetosPanel() {
    const nameInput = document.getElementById('gestao-agrupar-projetos-name');
    const searchInput = document.getElementById('gestao-agrupar-projetos-order-search');
    if (nameInput) nameInput.value = '';
    if (searchInput) searchInput.value = '';
    gestaoAgruparProjetosOrderQuery = '';
    gestaoAgruparProjetosOrderHighlight = -1;
    setGestaoAgruparProjetosOrderListOpen(false);
    clearGestaoAgruparProjetosOrderSelection();
    renderGestaoAgruparProjetosList();
    syncGestaoAgruparProjetosSaveButton();

    try {
        await loadGestaoAgruparProjetosOrderOptions();
    } catch (error) {
        console.error('initGestaoAgruparProjetosPanel:', error);
        alertAppDialog(`Erro ao carregar pedidos: ${error.message}`, { variant: 'error', title: 'Erro' });
    }
}

async function saveGestaoAgruparProjetos() {
    if (!canManageOrderProjectAggregator()) {
        alertAppDialog('Sem permissão para agrupar projetos.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const order = gestaoAgruparProjetosOrderCache;
    const aggregatorName = String(document.getElementById('gestao-agrupar-projetos-name')?.value || '').trim();
    const selectedIds = [...gestaoAgruparProjetosSelectedIds];

    if (!order?.id) {
        alertAppDialog('Selecione um pedido antes de salvar.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!aggregatorName) {
        alertAppDialog('Informe o nome do agrupador.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (selectedIds.length < 2) {
        alertAppDialog('Selecione pelo menos dois projetos com o mesmo projetista, o mesmo status e a mesma data de entrega do pedido ou da fase.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const eligibleStatusIds = orderProjectAggregatorEligibleStatusIdsCache?.statusIds || [];
    const selectedProjects = gestaoAgruparProjetosEligibleCache.filter(
        project => selectedIds.includes(Number(project.id))
    );

    const statusIds = [...new Set(selectedProjects.map(project => Number(project.statusId || project.projectStatus?.id)))];
    if (statusIds.length !== 1) {
        alertAppDialog('Todos os projetos selecionados devem estar no mesmo status.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const deliveryKeys = [...new Set(
        selectedProjects.map(project => getGestaoAgruparProjetosDeliveryKey(project))
    )];
    if (deliveryKeys.length !== 1 || !deliveryKeys[0]) {
        alertAppDialog('Todos os projetos selecionados devem ter a mesma data de entrega do pedido ou da fase.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const designerKeys = [...new Set(selectedProjects.map(project => getGestaoAgruparProjetosDesignerKey(project)))];
    if (designerKeys.length !== 1) {
        alertAppDialog('Todos os projetos selecionados devem ter o mesmo projetista.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const invalid = selectedProjects.find(
        project => !isOrderProjectEligibleForAggregation(project, eligibleStatusIds)
    );
    if (invalid) {
        alertAppDialog('Um ou mais projetos selecionados não podem ser agrupados.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const statusId = statusIds[0];
    const deliveryDate = deliveryKeys[0];
    const environmentTypeId = selectedProjects[0]?.environmentTypeId;
    if (!environmentTypeId) {
        alertAppDialog('Não foi possível determinar o tipo de ambiente do agrupador.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const designerResolution = typeof resolveSharedOrderProjectDesignerIdForAggregation === 'function'
        ? resolveSharedOrderProjectDesignerIdForAggregation(selectedProjects)
        : { designerId: null, error: null };
    if (designerResolution.error) {
        alertAppDialog(designerResolution.error, { variant: 'warning', title: 'Aviso' });
        return;
    }
    const sharedDesignerId = designerResolution.designerId;

    const now = new Date().toISOString();
    const panel = document.getElementById('gestao-agrupar-projetos-panel');

    await withGestaoCadastroSaveOverlay(panel, async () => {
        const projectCode = typeof allocateAggregatorOrderProjectCode === 'function'
            ? await allocateAggregatorOrderProjectCode()
            : null;

        if (!projectCode) {
            throw new Error('Não foi possível gerar o código do projeto agrupador.');
        }

        const insertPayload = {
            orderId: order.id,
            projectCode,
            name: aggregatorName,
            environmentTypeId,
            statusId,
            deliveryDate,
            isAggregator: true,
            saleValue: null,
            createdById: currentUser.id,
            updatedById: currentUser.id,
            updatedAt: now
        };
        if (sharedDesignerId) {
            insertPayload.designerId = sharedDesignerId;
        }
        if (gestaoAgruparProjetosPhases.length) {
            const phaseIds = [...new Set(selectedProjects
                .map(project => Number(getGestaoAgruparProjetosDelivery(project).phase?.id) || 0)
                .filter(Boolean))];
            if (phaseIds.length === 1) {
                insertPayload.deliveryPhaseId = phaseIds[0];
            }
        }

        let insertResult = await supabaseClient
            .from('OrderProject')
            .insert(insertPayload)
            .select('id')
            .single();

        if (insertResult.error?.message?.includes('isAggregator')) {
            throw new Error('Execute supabase/feats/create-order-project-aggregator.sql no Supabase.');
        }

        if (insertResult.error) {
            throw new Error(insertResult.error.message);
        }

        const aggregatorId = Number(insertResult.data?.id);
        if (!aggregatorId) {
            throw new Error('Não foi possível criar o agrupador.');
        }

        const { error: linkError } = await supabaseClient
            .from('OrderProject')
            .update({
                aggregatorOrderProjectId: aggregatorId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .in('id', selectedIds);

        if (linkError) {
            await supabaseClient.from('OrderProject').delete().eq('id', aggregatorId);
            if (linkError.message?.includes('aggregatorOrderProjectId')) {
                throw new Error('Execute supabase/feats/create-order-project-aggregator.sql no Supabase.');
            }
            throw new Error(linkError.message);
        }

        if (sharedDesignerId && typeof applyOrderProjectDesignerAssignmentToAggregatorChildren === 'function') {
            await applyOrderProjectDesignerAssignmentToAggregatorChildren(
                aggregatorId,
                sharedDesignerId,
                { updatedById: currentUser.id, updatedAt: now },
                { isAggregator: true }
            );
        }

        if (typeof applyMergedOrderProjectCharacteristicsToAggregator === 'function') {
            await applyMergedOrderProjectCharacteristicsToAggregator(aggregatorId, selectedIds, {
                orderId: order.id,
                designerId: sharedDesignerId || null
            });
        }

        alertAppDialog('Agrupador criado com sucesso.', { variant: 'success', title: 'Sucesso' });

        const nameInput = document.getElementById('gestao-agrupar-projetos-name');
        if (nameInput) nameInput.value = '';
        gestaoAgruparProjetosSelectedStatusId = null;
        gestaoAgruparProjetosSelectedDeliveryKey = null;
        gestaoAgruparProjetosSelectedDesignerKey = null;
        gestaoAgruparProjetosSelectedIds.clear();
        await reloadGestaoAgruparProjetosProjectsForSelectedOrder();
    });
}

function bindGestaoAgruparProjetosEvents() {
    const orderInput = document.getElementById('gestao-agrupar-projetos-order-search');
    const orderList = document.getElementById('gestao-agrupar-projetos-order-list');

    orderInput?.addEventListener('focus', () => {
        const selected = gestaoAgruparProjetosOrders.find(
            order => Number(order.id) === Number(gestaoAgruparProjetosSelectedOrderId)
        );
        const selectedLabel = selected ? gestaoAgruparProjetosOrderLabel(selected) : '';
        gestaoAgruparProjetosOrderHighlight = -1;
        gestaoAgruparProjetosOrderQuery = orderInput.value === selectedLabel ? '' : orderInput.value;
        renderGestaoAgruparProjetosOrderOptions();
        setGestaoAgruparProjetosOrderListOpen(true);
    });

    orderInput?.addEventListener('input', () => {
        gestaoAgruparProjetosOrderQuery = orderInput.value;
        const selected = gestaoAgruparProjetosOrders.find(
            order => Number(order.id) === Number(gestaoAgruparProjetosSelectedOrderId)
        );
        const selectedLabel = selected ? gestaoAgruparProjetosOrderLabel(selected) : '';
        if (orderInput.value.trim() !== selectedLabel) {
            gestaoAgruparProjetosSelectedOrderId = null;
            gestaoAgruparProjetosOrderCache = null;
            gestaoAgruparProjetosEligibleCache = [];
            clearGestaoAgruparProjetosProjectSelection();
            const summaryEl = document.getElementById('gestao-agrupar-projetos-order-summary');
            if (summaryEl) summaryEl.textContent = '';
            renderGestaoAgruparProjetosList();
            syncGestaoAgruparProjetosSaveButton();
        }
        gestaoAgruparProjetosOrderHighlight = -1;
        renderGestaoAgruparProjetosOrderOptions();
        setGestaoAgruparProjetosOrderListOpen(true);
    });

    orderInput?.addEventListener('keydown', async event => {
        const optionCount = orderList?.querySelectorAll('.gestao-agrupar-projetos-order-option').length || 0;
        if (event.key === 'Escape') {
            setGestaoAgruparProjetosOrderListOpen(false);
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!optionCount) return;
            setGestaoAgruparProjetosOrderListOpen(true);
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            gestaoAgruparProjetosOrderHighlight = (gestaoAgruparProjetosOrderHighlight + delta + optionCount) % optionCount;
            renderGestaoAgruparProjetosOrderOptions();
            orderList?.querySelector(`[data-option-index="${gestaoAgruparProjetosOrderHighlight}"]`)?.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (event.key === 'Enter') {
            const options = [...(orderList?.querySelectorAll('.gestao-agrupar-projetos-order-option') || [])];
            const highlighted = options[gestaoAgruparProjetosOrderHighlight] || (options.length === 1 ? options[0] : null);
            if (!highlighted) return;
            event.preventDefault();
            try {
                await selectGestaoAgruparProjetosOrder(highlighted.dataset.orderId);
            } catch (error) {
                alertAppDialog(error.message || 'Erro ao carregar projetos.');
            }
        }
    });

    orderList?.addEventListener('mousedown', event => {
        event.preventDefault();
    });

    orderList?.addEventListener('click', async event => {
        const button = event.target.closest('[data-order-id]');
        if (!button) return;
        try {
            await selectGestaoAgruparProjetosOrder(button.dataset.orderId);
        } catch (error) {
            alertAppDialog(error.message || 'Erro ao carregar projetos.');
        }
    });

    if (!window.__gestaoAgruparProjetosOrderOutsideBound) {
        window.__gestaoAgruparProjetosOrderOutsideBound = true;
        document.addEventListener('mousedown', event => {
            const wrap = document.getElementById('gestao-agrupar-projetos-order-wrap');
            if (!wrap || wrap.contains(event.target)) return;
            setGestaoAgruparProjetosOrderListOpen(false);
        });
    }

    document.getElementById('gestao-agrupar-projetos-name')?.addEventListener('input', syncGestaoAgruparProjetosSaveButton);

    document.getElementById('gestao-agrupar-projetos-save')?.addEventListener('click', () => {
        saveGestaoAgruparProjetos();
    });
}

bindGestaoAgruparProjetosEvents();
