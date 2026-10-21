let montagemSubstatusModalProjectId = null;

function hasOrderProjectInternalAssemblySubstatusManageRole() {
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    if (typeof isGestorFabrica === 'function' && isGestorFabrica()) return true;
    if (typeof isFactoryAdministrative === 'function' && isFactoryAdministrative()) return true;
    return false;
}

function canManageOrderProjectInternalAssemblySubstatus(project) {
    if (!project?.id) return false;
    if (!hasOrderProjectInternalAssemblySubstatusManageRole()) return false;

    const statusName = typeof getOrderProjectStatusName === 'function'
        ? getOrderProjectStatusName(project)
        : (project.projectStatus?.name || project.statusName || '');
    const normalizedStatus = String(statusName || '').trim();
    // Pendências / modal sem projeto no cache do pedido: só id + nome (status "—").
    if (!normalizedStatus || normalizedStatus === '—') {
        return true;
    }
    return normalizedStatus === ORDER_PROJECT_SUBSTATUS_MONTAGEM_INTERNA_STATUS;
}

function canManageOrderProjectInternalAssemblyAwaiting(project) {
    return canManageOrderProjectInternalAssemblySubstatus(project);
}

function formatMontagemSubstatusDateTime(value) {
    if (!value) return '—';
    return typeof formatDateTime === 'function' ? formatDateTime(value) : String(value);
}

function getMontagemSubstatusKindOptionsHtml() {
    const definitions = window.ORDER_PROJECT_INTERNAL_ASSEMBLY_SUBSTATUS_DEFINITIONS || [];
    return definitions.map(item => `
        <option value="${escapeHtml(item.kind)}">${escapeHtml(item.label)}</option>
    `).join('');
}

async function fetchInternalAssemblySubstatusForProject(projectId) {
    const id = Number(projectId);
    if (!id) return { open: [], closed: [] };

    const kinds = typeof getOrderProjectInternalAssemblySubstatusKindList === 'function'
        ? getOrderProjectInternalAssemblySubstatusKindList()
        : (window.ORDER_PROJECT_INTERNAL_ASSEMBLY_SUBSTATUS_DEFINITIONS || []).map(item => item.kind);

    const { data, error } = await supabaseClient
        .from('OrderProjectSubstatus')
        .select('id, orderProjectId, kind, startedAt, endedAt, startedById, endedById')
        .eq('orderProjectId', id)
        .in('kind', kinds)
        .order('startedAt', { ascending: false })
        .order('id', { ascending: false });

    if (error) {
        throw new Error(formatOrderProjectSubstatusError(error));
    }

    const rows = data || [];
    return {
        open: rows.filter(row => !row.endedAt),
        closed: rows.filter(row => row.endedAt).slice(0, 30)
    };
}

function renderMontagemSubstatusModalLists(openRows, closedRows) {
    const openEl = document.getElementById('order-project-montagem-substatus-open-list');
    const closedEl = document.getElementById('order-project-montagem-substatus-closed-list');
    const emptyOpen = document.getElementById('order-project-montagem-substatus-open-empty');
    const emptyClosed = document.getElementById('order-project-montagem-substatus-closed-empty');

    if (openEl) {
        openEl.innerHTML = openRows.length
            ? openRows.map(row => {
                const label = typeof getOrderProjectInternalAssemblySubstatusLabel === 'function'
                    ? getOrderProjectInternalAssemblySubstatusLabel(row.kind)
                    : row.kind;
                return `
                <li class="flex items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
                    <div class="min-w-0">
                        <p class="text-xs font-medium text-amber-800">${escapeHtml(label)}</p>
                        <p class="text-[10px] text-slate-500">Início: ${escapeHtml(formatMontagemSubstatusDateTime(row.startedAt))}</p>
                    </div>
                    <button type="button"
                        class="montagem-substatus-end-btn text-xs bg-emerald-700 text-white hover:bg-emerald-800 px-2.5 py-1 rounded-lg font-medium shrink-0"
                        data-substatus-id="${Number(row.id)}">
                        Encerrar
                    </button>
                </li>
            `;
            }).join('')
            : '';
    }
    emptyOpen?.classList.toggle('hidden', openRows.length > 0);

    if (closedEl) {
        closedEl.innerHTML = closedRows.length
            ? closedRows.map(row => {
                const label = typeof getOrderProjectInternalAssemblySubstatusLabel === 'function'
                    ? getOrderProjectInternalAssemblySubstatusLabel(row.kind)
                    : row.kind;
                return `
                <li class="py-2 border-b border-slate-100 last:border-0">
                    <p class="text-xs text-slate-700">${escapeHtml(label)} — encerrado</p>
                    <p class="text-[10px] text-slate-500">
                        ${escapeHtml(formatMontagemSubstatusDateTime(row.startedAt))}
                        → ${escapeHtml(formatMontagemSubstatusDateTime(row.endedAt))}
                    </p>
                </li>
            `;
            }).join('')
            : '';
    }
    emptyClosed?.classList.toggle('hidden', closedRows.length > 0);
}

async function refreshMontagemSubstatusModalContent() {
    if (!montagemSubstatusModalProjectId) return;
    const { open, closed } = await fetchInternalAssemblySubstatusForProject(montagemSubstatusModalProjectId);
    renderMontagemSubstatusModalLists(open, closed);
}

async function openOrderProjectMontagemSubstatusModal(projectId, projectLabel = '', projectHint = null) {
    const id = Number(projectId);
    if (!id) return;

    const fromOrderCache = (typeof orderProjectsCache !== 'undefined' ? orderProjectsCache : [])
        .find(item => Number(item.id) === id);
    const project = fromOrderCache || projectHint || { id, name: projectLabel };

    if (!canManageOrderProjectInternalAssemblySubstatus(project)) {
        alertAppDialog('Sem permissão para gerenciar substatus de montagem interna.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    montagemSubstatusModalProjectId = id;
    const context = document.getElementById('order-project-montagem-substatus-context');
    if (context) {
        context.textContent = projectLabel || project.name || `Projeto #${id}`;
    }

    const kindSelect = document.getElementById('order-project-montagem-substatus-kind');
    if (kindSelect) {
        kindSelect.innerHTML = getMontagemSubstatusKindOptionsHtml();
    }

    await refreshMontagemSubstatusModalContent();
    toggleModal('order-project-montagem-substatus-modal', true);
}

function closeOrderProjectMontagemSubstatusModal() {
    montagemSubstatusModalProjectId = null;
    toggleModal('order-project-montagem-substatus-modal', false);
}

async function startMontagemSubstatusFromModal() {
    if (!montagemSubstatusModalProjectId) return;
    const kindSelect = document.getElementById('order-project-montagem-substatus-kind');
    const kind = kindSelect?.value;
    if (!kind) {
        alertAppDialog('Selecione o tipo de substatus.');
        return;
    }

    try {
        await startOrderProjectInternalAssemblySubstatus(montagemSubstatusModalProjectId, kind);
        await refreshMontagemSubstatusModalContent();
        await refreshSurfacesAfterOrderProjectSubstatusChange();
    } catch (error) {
        alertAppDialog(error.message || 'Não foi possível iniciar o substatus.');
    }
}

async function endMontagemSubstatusFromModal(substatusId) {
    if (!montagemSubstatusModalProjectId || !substatusId) return;
    const confirmed = await confirmAppDialog(
        'Encerrar este substatus? O status do projeto não muda.',
        { title: 'Encerrar substatus', confirmLabel: 'Encerrar' }
    );
    if (!confirmed) return;

    try {
        await endOrderProjectInternalAssemblySubstatusById(substatusId, montagemSubstatusModalProjectId);
        await refreshMontagemSubstatusModalContent();
        await refreshSurfacesAfterOrderProjectSubstatusChange();
    } catch (error) {
        alertAppDialog(error.message || 'Não foi possível encerrar o substatus.');
    }
}

function bindOrderProjectMontagemSubstatusEvents() {
    document.getElementById('order-project-montagem-substatus-close')
        ?.addEventListener('click', closeOrderProjectMontagemSubstatusModal);
    document.getElementById('order-project-montagem-substatus-start')
        ?.addEventListener('click', startMontagemSubstatusFromModal);

    document.getElementById('order-project-montagem-substatus-modal')?.addEventListener('click', event => {
        const endBtn = event.target.closest('.montagem-substatus-end-btn');
        if (!endBtn) return;
        endMontagemSubstatusFromModal(Number(endBtn.dataset.substatusId));
    });
}

window.openOrderProjectMontagemSubstatusModal = openOrderProjectMontagemSubstatusModal;
window.canManageOrderProjectInternalAssemblySubstatus = canManageOrderProjectInternalAssemblySubstatus;
window.canManageOrderProjectInternalAssemblyAwaiting = canManageOrderProjectInternalAssemblyAwaiting;
