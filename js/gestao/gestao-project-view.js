let orderProjectViewContext = null;
let orderProjectViewImplantacaoContext = null;
let orderProjectViewDetalhamentoContext = null;
let orderProjectViewRevisionsContext = null;
let orderProjectViewDesignerHistoryContext = null;

function formatProjectViewMontagemDate(dateStr) {
    if (typeof formatDisplayDate === 'function') {
        return formatDisplayDate(dateStr);
    }
    if (typeof formatGestaoDate === 'function') {
        return formatGestaoDate(dateStr);
    }
    return String(dateStr || '').split('T')[0] || '—';
}

function renderProjectViewComplementarChildrenList(children = []) {
    const listEl = document.getElementById('project-view-complementar-children-list');
    if (!listEl) return;

    if (!children.length) {
        listEl.innerHTML = '<p class="text-sm text-slate-500">Nenhum projeto complementar vinculado.</p>';
        return;
    }

    listEl.innerHTML = children
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
        .map(child => {
            const code = normalizeProjectCodeInput(child.projectCode || '');
            const name = child.name || '—';
            const statusName = getGestaoProjectStatusName(child);
            const statusClass = getOrderProjectStatusBadgeClass(statusName);

            return `
                <div class="project-view-related-item">
                    <span class="project-view-related-item__code">${escapeHtml(code)}</span>
                    <span class="project-view-related-item__name">${escapeHtml(name)}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusClass}">${escapeHtml(statusName)}</span>
                </div>
            `;
        })
        .join('');
}

function setProjectViewHeader(project = {}, statusName = '—') {
    const titleEl = document.getElementById('project-view-title');
    const codeEl = document.getElementById('project-view-header-code');
    const statusEl = document.getElementById('project-view-header-status');
    const code = normalizeProjectCodeInput(project.projectCode || '') || '—';
    const name = project.name || '—';

    if (titleEl) titleEl.textContent = name;
    if (codeEl) codeEl.textContent = code;
    if (statusEl) {
        statusEl.textContent = statusName;
        statusEl.className = `project-view-modal__status ${getOrderProjectStatusBadgeClass(statusName)}`;
    }
}

function findComplementarChildrenInCaches(parentProjectId) {
    const normalizedId = Number(parentProjectId);
    if (!normalizedId) return [];

    const matches = [];
    const seen = new Set();

    const addMatch = (project) => {
        if (!isComplementaryOrderProject(project)) return;
        if (Number(project.parentProjectId) !== normalizedId) return;

        const key = Number(project.id) || `${project.projectCode || ''}-${project.name || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        matches.push(project);
    };

    if (Array.isArray(orderProjectsCache)) {
        orderProjectsCache.forEach(addMatch);
    }

    if (Array.isArray(gestaoOrderProjectsDraft)) {
        gestaoOrderProjectsDraft.forEach(addMatch);
    }

    return matches;
}

async function fetchComplementarChildrenForProject(parentProjectId) {
    const cached = findComplementarChildrenInCaches(parentProjectId);
    if (cached.length) return cached;

    const normalizedId = Number(parentProjectId);
    if (!normalizedId) return [];

    const selectVariants = [
        'id, projectCode, name, deliveryDate, statusId, isComplementary, parentProjectId, projectStatus:OrderProjectStatus(id, name)',
        'id, projectCode, name, isComplementary, parentProjectId'
    ];

    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .eq('parentProjectId', normalizedId)
            .eq('isComplementary', true);

        if (!error && Array.isArray(data)) {
            return data.map(item => {
                if (item.statusId && !item.projectStatus && gestaoProjectStatusesCache.length) {
                    item.projectStatus = gestaoProjectStatusesCache.find(status => status.id === item.statusId) || null;
                }
                return item;
            });
        }

        if (error?.message?.includes('isComplementary') || error?.message?.includes('parentProjectId')) {
            break;
        }
    }

    return [];
}

function fillProjectViewModal(project = {}, complementarChildren = []) {
    const statusName = getGestaoProjectStatusName(project);
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value || '—';
    };

    setProjectViewHeader(project, statusName);
    setText('project-view-code', normalizeProjectCodeInput(project.projectCode || ''));
    setText('project-view-name', project.name || '—');
    setText('project-view-environment', project.environmentType?.name || '—');
    setText('project-view-delivery', typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.deliveryDate)
        : (project.deliveryDate || '—'));
    setText('project-view-previsao-inicio', typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.technicalProjectForecastStartDate)
        : (project.technicalProjectForecastStartDate || '—'));
    setText('project-view-previsao-conclusao', typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.technicalProjectForecastEndDate)
        : (project.technicalProjectForecastEndDate || '—'));
    setText('project-view-conclusao-projeto-tecnico', typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.technicalProjectCompletedDate)
        : (project.technicalProjectCompletedDate || '—'));
    setText('project-view-status', statusName);
    setText('project-view-designer', project.designer?.name || '—');
    document.getElementById('btn-project-view-designer-history')
        ?.classList.toggle('hidden', !Number(project.id));
    setText('project-view-marceneiro', getMarceneiroNameFromProject(project));
    setText('project-view-montagem-inicio', formatProjectViewMontagemDate(project.internalAssemblyStartDate));
    setText('project-view-montagem-fim', formatProjectViewMontagemDate(project.internalAssemblyEndDate));

    const conferenceNetworkPathEl = document.getElementById('project-view-caminho-rede-conferencia');
    const conferenceNetworkPath = project.conferenceNetworkPath || '—';
    if (conferenceNetworkPathEl) {
        conferenceNetworkPathEl.textContent = conferenceNetworkPath;
        conferenceNetworkPathEl.classList.toggle('project-view-path--empty', conferenceNetworkPath === '—');
    }

    const approvalNetworkPathEl = document.getElementById('project-view-caminho-rede-aprovacao');
    const approvalNetworkPath = project.approvalNetworkPath || '—';
    if (approvalNetworkPathEl) {
        approvalNetworkPathEl.textContent = approvalNetworkPath;
        approvalNetworkPathEl.classList.toggle('project-view-path--empty', approvalNetworkPath === '—');
    }

    const childWrap = document.getElementById('project-view-complementar-child-wrap');
    const parentWrap = document.getElementById('project-view-complementar-parent-wrap');
    const isComplementar = isComplementaryOrderProject(project);

    childWrap?.classList.toggle('hidden', !isComplementar);
    parentWrap?.classList.toggle('hidden', isComplementar || !complementarChildren.length);

    if (isComplementar) {
        setText(
            'project-view-parent-code',
            project.parentProject?.projectCode || project.parentProjectCode || '—'
        );
        setText(
            'project-view-parent-order',
            project.parentProject?.order?.orderCode || getComplementarParentOrderCode(project) || '—'
        );
    } else {
        renderProjectViewComplementarChildrenList(complementarChildren);
    }

    const substituidoWrap = document.getElementById('project-view-substituido-wrap');
    const substituicaoWrap = document.getElementById('project-view-substituicao-wrap');
    const isReplaced = isReplacedOrderProject(project);
    const isReplacement = isReplacementOrderProject(project);

    substituidoWrap?.classList.toggle('hidden', !isReplaced);
    substituicaoWrap?.classList.toggle('hidden', !isReplacement);

    if (isReplaced) {
        setText(
            'project-view-substituido-por-code',
            getReplacedByProjectCode(project) || '—'
        );
        setText(
            'project-view-substituido-por-order',
            getReplacedByOrderCode(project) || '—'
        );
    }

    if (isReplacement) {
        setText(
            'project-view-substitui-code',
            getReplacesProjectCode(project) || '—'
        );
        setText(
            'project-view-substitui-order',
            getReplacesOrderCode(project) || '—'
        );
    }
}

async function fetchProjectDetailsForView(projectId) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return null;

    const selectVariants = [
        'id, orderId, projectCode, name, saleValue, deliveryDate, technicalProjectForecastStartDate, technicalProjectForecastEndDate, technicalProjectCompletedDate, statusId, designerId, approvalNetworkPath, conferenceNetworkPath, cabinetMakerId, internalAssemblyStartDate, internalAssemblyEndDate, isComplementary, parentProjectId, isReplaced, replacedByProjectId, isReplacement, replacesProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), designer:appUsers!OrderProject_designerId_fkey(id, name), cabinetMaker:CabinetMaker(id, name), order:salesOrders(orderCode, clientId, consultantUserId, client:Client(name), consultor:appUsers!consultantUserId(name)), parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), replacedBy:replacedByProjectId(projectCode, order:salesOrders(orderCode)), replaces:replacesProjectId(projectCode, saleValue, order:salesOrders(orderCode))',
        'id, orderId, projectCode, name, saleValue, deliveryDate, technicalProjectForecastEndDate, technicalProjectCompletedDate, statusId, designerId, approvalNetworkPath, conferenceNetworkPath, cabinetMakerId, internalAssemblyStartDate, internalAssemblyEndDate, isComplementary, parentProjectId, isReplaced, replacedByProjectId, isReplacement, replacesProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), designer:appUsers!OrderProject_designerId_fkey(id, name), order:salesOrders(orderCode, clientId, consultantUserId, client:Client(name), consultor:appUsers!consultantUserId(name)), parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), replacedBy:replacedByProjectId(projectCode, order:salesOrders(orderCode)), replaces:replacesProjectId(projectCode, saleValue, order:salesOrders(orderCode))',
        'id, orderId, projectCode, name, saleValue, deliveryDate, statusId, designerId, approvalNetworkPath, conferenceNetworkPath, cabinetMakerId, internalAssemblyStartDate, internalAssemblyEndDate, isComplementary, parentProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
        'id, orderId, projectCode, name, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)'
    ];

    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .eq('id', normalizedId)
            .maybeSingle();

        if (!error && data) {
            if (data.statusId && !data.projectStatus && gestaoProjectStatusesCache.length) {
                data.projectStatus = gestaoProjectStatusesCache.find(item => item.id === data.statusId) || null;
            }
            return await enrichProjectMarceneiro(data);
        }

        if (error?.message?.includes('cabinetMaker') || error?.message?.includes('CabinetMaker')) {
            continue;
        }
    }

    return null;
}

async function openProjectViewModal(projectOrId) {
    let project = typeof projectOrId === 'object' ? projectOrId : null;
    const projectId = typeof projectOrId === 'object'
        ? Number(projectOrId?.id)
        : Number(projectOrId);

    if (projectId) {
        const fetched = await fetchProjectDetailsForView(projectId);
        if (fetched) {
            project = fetched;
        } else if (!project && (typeof projectOrId === 'number' || typeof projectOrId === 'string')) {
            const cached = Array.isArray(orderProjectsCache)
                ? orderProjectsCache.find(item => Number(item.id) === projectId)
                : null;
            project = cached || null;
        }
    }

    if (!project) {
        alertAppDialog('Projeto não encontrado.');
        return;
    }

    project = await enrichProjectMarceneiro(project);

    let implantacaoRecord = null;
    if (typeof fetchImplantacaoByOrderProjectId === 'function') {
        implantacaoRecord = await fetchImplantacaoByOrderProjectId(project.id);
    }

    let detalhamentoRecord = null;
    if (typeof fetchDetalhamentoByOrderProjectId === 'function') {
        detalhamentoRecord = await fetchDetalhamentoByOrderProjectId(project.id);
    }

    const complementarChildren = isComplementaryOrderProject(project)
        ? []
        : await fetchComplementarChildrenForProject(project.id);

    fillProjectViewModal(project, complementarChildren);
    if (typeof renderProjectViewCharacteristics === 'function') {
        await renderProjectViewCharacteristics(project.id);
    }
    orderProjectViewContext = typeof buildProjectStatusHistoryContext === 'function'
        ? buildProjectStatusHistoryContext(project)
        : null;
    orderProjectViewImplantacaoContext = implantacaoRecord
        ? { projectId: project.id, projectName: project.name || 'Projeto' }
        : null;
    orderProjectViewDetalhamentoContext = detalhamentoRecord
        ? { projectId: project.id, projectName: project.name || 'Projeto' }
        : null;
    orderProjectViewRevisionsContext = typeof fetchOrderProjectRevisionsHistoryContext === 'function'
        ? await fetchOrderProjectRevisionsHistoryContext(project, project.orderId)
        : null;
    orderProjectViewDesignerHistoryContext = Number(project.id)
        ? {
            orderProjectId: Number(project.id),
            projectLabel: `${project.projectCode ? `${project.projectCode} — ` : ''}${project.name || 'Projeto'}`
        }
        : null;
    document.getElementById('btn-project-view-implantacao')
        ?.classList.toggle('hidden', !orderProjectViewImplantacaoContext);
    if (typeof renderProjectViewDetailingSection === 'function') {
        renderProjectViewDetailingSection(detalhamentoRecord);
    } else {
        document.getElementById('project-view-detalhamento-wrap')?.classList.add('hidden');
    }
    document.getElementById('btn-project-view-revisions')
        ?.classList.toggle('hidden', !orderProjectViewRevisionsContext);
    toggleModal('order-project-view-modal', true);
}

function getProjectDesignerHistoryName(user) {
    return user?.name || 'Sem projetista';
}

async function enrichProjectDesignerHistoryEntries(entries) {
    if (!entries.length) return entries;

    const needsEnrich = entries.some(entry =>
        (entry.previousDesignerId && !entry.previousDesigner?.name)
        || (entry.newDesignerId && !entry.newDesigner?.name)
        || (entry.changedById && !entry.changedBy?.name)
    );

    if (!needsEnrich) return entries;

    const userIds = [...new Set(entries.flatMap(entry => [
        entry.previousDesignerId,
        entry.newDesignerId,
        entry.changedById
    ].filter(Boolean)))];

    const { data: users } = userIds.length
        ? await supabaseClient.from('appUsers').select('id, name').in('id', userIds)
        : { data: [] };

    const userById = Object.fromEntries((users || []).map(user => [user.id, user]));

    return entries.map(entry => ({
        ...entry,
        previousDesigner: entry.previousDesigner || userById[entry.previousDesignerId] || null,
        newDesigner: entry.newDesigner || userById[entry.newDesignerId] || null,
        changedBy: entry.changedBy || userById[entry.changedById] || null
    }));
}

async function fetchOrderProjectDesignerHistory(orderProjectId) {
    const normalizedId = Number(orderProjectId);
    if (!normalizedId) return [];

    let result = await supabaseClient
        .from('OrderProjectDesignerHistory')
        .select(`
            id,
            orderProjectId,
            previousDesignerId,
            newDesignerId,
            changedAt,
            changedById,
            previousDesignerDurationSeconds,
            previousDesigner:appUsers!OrderProjectDesignerHistory_previousDesignerId_fkey(id, name),
            newDesigner:appUsers!OrderProjectDesignerHistory_newDesignerId_fkey(id, name),
            changedBy:appUsers!OrderProjectDesignerHistory_changedById_fkey(id, name)
        `)
        .eq('orderProjectId', normalizedId)
        .order('changedAt', { ascending: true });

    if (result.error?.message?.includes('OrderProjectDesignerHistory')) {
        throw new Error('Execute supabase/feats/create-order-project-designer-history.sql no Supabase.');
    }

    if (result.error) {
        result = await supabaseClient
            .from('OrderProjectDesignerHistory')
            .select('*')
            .eq('orderProjectId', normalizedId)
            .order('changedAt', { ascending: true });

        if (result.error) throw result.error;
    }

    return enrichProjectDesignerHistoryEntries(result.data || []);
}

function renderProjectDesignerHistoryList(entries) {
    if (!entries.length) {
        return '<p class="text-xs text-slate-400 text-center py-12">Nenhuma alteração de projetista registrada.</p>';
    }

    return `
        <ol class="space-y-3">
            ${entries.map((entry, index) => {
                const isInitial = !entry.previousDesignerId && index === 0;
                const previousName = getProjectDesignerHistoryName(entry.previousDesigner);
                const newName = getProjectDesignerHistoryName(entry.newDesigner);
                const changedAt = typeof formatGestaoDateTime === 'function'
                    ? formatGestaoDateTime(entry.changedAt)
                    : (entry.changedAt || '—');
                const changedBy = entry.changedBy?.name || '—';
                const durationLabel = typeof formatStatusDurationSeconds === 'function'
                    ? formatStatusDurationSeconds(entry.previousDesignerDurationSeconds)
                    : null;
                const changeLabel = isInitial
                    ? `Projetista inicial: ${newName}`
                    : `${previousName} → ${newName}`;

                return `
                    <li class="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div class="text-sm font-semibold text-slate-800">${escapeHtml(changeLabel)}</div>
                        <div class="text-[11px] text-slate-500 mt-1">${escapeHtml(changedAt)} · ${escapeHtml(changedBy)}</div>
                        ${durationLabel
                            ? `<div class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(durationLabel)} no projetista anterior</div>`
                            : ''}
                    </li>
                `;
            }).join('')}
        </ol>
    `;
}

async function openProjectDesignerHistoryModal(context = {}) {
    const orderProjectId = Number(context.orderProjectId);
    if (!orderProjectId) return;

    const subtitle = document.getElementById('project-designer-history-subtitle');
    const list = document.getElementById('project-designer-history-list');

    if (subtitle) {
        subtitle.textContent = context.projectLabel || 'Projeto';
    }

    if (list) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando histórico...</p>';
    }

    toggleModal('order-project-designer-history-modal', true);

    try {
        const entries = await fetchOrderProjectDesignerHistory(orderProjectId);
        if (list) {
            list.innerHTML = renderProjectDesignerHistoryList(entries);
        }
    } catch (error) {
        if (list) {
            list.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar histórico: ${escapeHtml(error.message)}</p>`;
        }
    }
}

function bindGestaoProjectViewEvents() {
    document.getElementById('btn-close-order-project-view')?.addEventListener('click', () => {
        toggleModal('order-project-view-modal', false);
        orderProjectViewContext = null;
        orderProjectViewImplantacaoContext = null;
        orderProjectViewDetalhamentoContext = null;
        orderProjectViewRevisionsContext = null;
        orderProjectViewDesignerHistoryContext = null;
    });
    document.getElementById('btn-close-order-project-view-footer')?.addEventListener('click', () => {
        toggleModal('order-project-view-modal', false);
        orderProjectViewContext = null;
        orderProjectViewImplantacaoContext = null;
        orderProjectViewDetalhamentoContext = null;
        orderProjectViewRevisionsContext = null;
        orderProjectViewDesignerHistoryContext = null;
    });
    document.getElementById('btn-project-view-implantacao')?.addEventListener('click', async () => {
        if (!orderProjectViewImplantacaoContext) return;
        const { projectId, projectName } = orderProjectViewImplantacaoContext;
        if (typeof openPpcpImplantacaoModal === 'function') {
            await openPpcpImplantacaoModal(projectId, projectName);
        } else if (typeof openImplantacaoModal === 'function') {
            await openImplantacaoModal(projectId, projectName, { requireExisting: true });
        }
    });
    document.getElementById('project-view-detalhamento-open')?.addEventListener('click', async () => {
        if (!orderProjectViewDetalhamentoContext) return;
        const { projectId, projectName } = orderProjectViewDetalhamentoContext;
        if (typeof openDetalhamentoModal === 'function') {
            await openDetalhamentoModal(projectId, projectName);
        }
    });
    document.getElementById('btn-project-view-revisions')?.addEventListener('click', async () => {
        if (!orderProjectViewRevisionsContext?.approvalId) return;
        if (typeof openCommercialRevisionsHistoryView === 'function') {
            await openCommercialRevisionsHistoryView(
                orderProjectViewRevisionsContext.approvalId,
                orderProjectViewRevisionsContext,
                { readOnly: true }
            );
        }
    });
    document.getElementById('btn-order-project-status-history')?.addEventListener('click', () => {
        if (!orderProjectViewContext) return;
        if (typeof openProjectStatusHistoryModal === 'function') {
            openProjectStatusHistoryModal(orderProjectViewContext);
        }
    });
    document.getElementById('btn-project-view-designer-history')?.addEventListener('click', () => {
        if (!orderProjectViewDesignerHistoryContext) return;
        openProjectDesignerHistoryModal(orderProjectViewDesignerHistoryContext);
    });
    document.getElementById('btn-close-project-status-history')?.addEventListener('click', () => {
        toggleModal('order-project-status-history-modal', false);
    });
    document.getElementById('btn-close-project-status-history-footer')?.addEventListener('click', () => {
        toggleModal('order-project-status-history-modal', false);
    });
    document.getElementById('btn-close-project-designer-history')?.addEventListener('click', () => {
        toggleModal('order-project-designer-history-modal', false);
    });
    document.getElementById('btn-close-project-designer-history-footer')?.addEventListener('click', () => {
        toggleModal('order-project-designer-history-modal', false);
    });
}

window.openProjectViewModal = openProjectViewModal;
window.openProjectDesignerHistoryModal = openProjectDesignerHistoryModal;
