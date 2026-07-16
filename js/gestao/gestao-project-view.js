let orderProjectViewContext = null;
let orderProjectViewImplantacaoContext = null;

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
        if (!isComplementarOrderProject(project)) return;
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
        'id, projectCode, name, deliveryDate, statusId, isComplementar, parentProjectId, projectStatus:OrderProjectStatus(id, name)',
        'id, projectCode, name, isComplementar, parentProjectId'
    ];

    for (const selectCols of selectVariants) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select(selectCols)
            .eq('parentProjectId', normalizedId)
            .eq('isComplementar', true);

        if (!error && Array.isArray(data)) {
            return data.map(item => {
                if (item.statusId && !item.projectStatus && gestaoProjectStatusesCache.length) {
                    item.projectStatus = gestaoProjectStatusesCache.find(status => status.id === item.statusId) || null;
                }
                return item;
            });
        }

        if (error?.message?.includes('isComplementar') || error?.message?.includes('parentProjectId')) {
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
    setText('project-view-previsao-conclusao', typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.previsaoConclusaoProjetoTecnico)
        : (project.previsaoConclusaoProjetoTecnico || '—'));
    setText('project-view-conclusao-projeto-tecnico', typeof formatGestaoDate === 'function'
        ? formatGestaoDate(project.conclusaoProjetoTecnico)
        : (project.conclusaoProjetoTecnico || '—'));
    setText('project-view-status', statusName);
    setText('project-view-designer', project.designer?.name || '—');
    setText('project-view-marceneiro', getMarceneiroNameFromProject(project));
    setText('project-view-montagem-inicio', formatProjectViewMontagemDate(project.inicioMontagemInterna));
    setText('project-view-montagem-fim', formatProjectViewMontagemDate(project.fimMontagemInterna));

    const caminhoRedeEl = document.getElementById('project-view-caminho-rede');
    const caminhoRede = project.caminhoRedeAprovacao || '—';
    if (caminhoRedeEl) {
        caminhoRedeEl.textContent = caminhoRede;
        caminhoRedeEl.classList.toggle('project-view-path--empty', caminhoRede === '—');
    }

    const childWrap = document.getElementById('project-view-complementar-child-wrap');
    const parentWrap = document.getElementById('project-view-complementar-parent-wrap');
    const isComplementar = isComplementarOrderProject(project);

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
    const isSubstituido = isSubstituidoOrderProject(project);
    const isSubstituicao = isSubstituicaoOrderProject(project);

    substituidoWrap?.classList.toggle('hidden', !isSubstituido);
    substituicaoWrap?.classList.toggle('hidden', !isSubstituicao);

    if (isSubstituido) {
        setText(
            'project-view-substituido-por-code',
            getSubstituidoPorProjectCode(project) || '—'
        );
        setText(
            'project-view-substituido-por-order',
            getSubstituidoPorOrderCode(project) || '—'
        );
    }

    if (isSubstituicao) {
        setText(
            'project-view-substitui-code',
            getSubstituiProjectCode(project) || '—'
        );
        setText(
            'project-view-substitui-order',
            getSubstituiOrderCode(project) || '—'
        );
    }
}

async function fetchProjectDetailsForView(projectId) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return null;

    const selectVariants = [
        'id, orderId, projectCode, name, saleValue, deliveryDate, previsaoConclusaoProjetoTecnico, conclusaoProjetoTecnico, statusId, designerId, caminhoRedeAprovacao, marceneiroId, inicioMontagemInterna, fimMontagemInterna, isComplementar, parentProjectId, isSubstituido, substituidoPorProjectId, isSubstituicao, substituiProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), designer:appUsers!OrderProject_designerId_fkey(id, name), marceneiro:Marceneiro(id, name), order:salesOrders(orderCode, clientName), parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), substituidoPor:substituidoPorProjectId(projectCode, order:salesOrders(orderCode)), substitui:substituiProjectId(projectCode, saleValue, order:salesOrders(orderCode))',
        'id, orderId, projectCode, name, saleValue, deliveryDate, previsaoConclusaoProjetoTecnico, conclusaoProjetoTecnico, statusId, designerId, caminhoRedeAprovacao, marceneiroId, inicioMontagemInterna, fimMontagemInterna, isComplementar, parentProjectId, isSubstituido, substituidoPorProjectId, isSubstituicao, substituiProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name), designer:appUsers!OrderProject_designerId_fkey(id, name), order:salesOrders(orderCode, clientName), parentProject:parentProjectId(projectCode, order:salesOrders(orderCode)), substituidoPor:substituidoPorProjectId(projectCode, order:salesOrders(orderCode)), substitui:substituiProjectId(projectCode, saleValue, order:salesOrders(orderCode))',
        'id, orderId, projectCode, name, saleValue, deliveryDate, statusId, designerId, caminhoRedeAprovacao, marceneiroId, inicioMontagemInterna, fimMontagemInterna, isComplementar, parentProjectId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)',
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

        if (error?.message?.includes('marceneiro') || error?.message?.includes('Marceneiro')) {
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

    const complementarChildren = isComplementarOrderProject(project)
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
    document.getElementById('btn-project-view-implantacao')
        ?.classList.toggle('hidden', !orderProjectViewImplantacaoContext);
    toggleModal('order-project-view-modal', true);
}

function bindGestaoProjectViewEvents() {
    document.getElementById('btn-close-order-project-view')?.addEventListener('click', () => {
        toggleModal('order-project-view-modal', false);
        orderProjectViewContext = null;
        orderProjectViewImplantacaoContext = null;
    });
    document.getElementById('btn-close-order-project-view-footer')?.addEventListener('click', () => {
        toggleModal('order-project-view-modal', false);
        orderProjectViewContext = null;
        orderProjectViewImplantacaoContext = null;
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
    document.getElementById('btn-order-project-status-history')?.addEventListener('click', () => {
        if (!orderProjectViewContext) return;
        if (typeof openProjectStatusHistoryModal === 'function') {
            openProjectStatusHistoryModal(orderProjectViewContext);
        }
    });
    document.getElementById('btn-close-project-status-history')?.addEventListener('click', () => {
        toggleModal('order-project-status-history-modal', false);
    });
    document.getElementById('btn-close-project-status-history-footer')?.addEventListener('click', () => {
        toggleModal('order-project-status-history-modal', false);
    });
}

window.openProjectViewModal = openProjectViewModal;
