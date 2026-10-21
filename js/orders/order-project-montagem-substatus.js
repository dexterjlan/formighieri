let montagemSubstatusModalProjectId = null;
let montagemSubstatusModalOrderId = null;
let orderProjectMontagemSubstatusEventsBound = false;

const orderProjectMontagemSubstatusOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('order-project-montagem-substatus-modal', {
        closeButtonSelector: '#order-project-montagem-substatus-close',
        disableFormSelector: '#order-project-montagem-substatus-panel button, #order-project-montagem-substatus-panel select, #order-project-montagem-substatus-panel textarea'
    })
    : null;

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

function renderMontagemSubstatusNoteBlockHtml(note, options = {}) {
    const { substatusId, editable = false, readOnlyBox = false } = options;
    const value = String(note || '');
    if (!editable) {
        if (!value.trim()) return '';
        if (readOnlyBox) {
            return `
                <div class="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p class="text-[10px] font-medium text-slate-500 mb-1">Observação</p>
                    <p class="text-[10px] text-slate-600 whitespace-pre-wrap">${escapeHtml(value)}</p>
                </div>
            `;
        }
        return `<p class="text-[10px] text-slate-600 mt-1 whitespace-pre-wrap">${escapeHtml(value)}</p>`;
    }

    return `
        <div class="mt-2 space-y-1">
            <label class="text-[10px] font-medium text-slate-500">Observação</label>
            <textarea
                class="montagem-substatus-note-input w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600 resize-y min-h-[2.5rem]"
                rows="2"
                maxlength="2000"
                data-substatus-id="${Number(substatusId)}">${escapeHtml(value)}</textarea>
            <button type="button"
                class="montagem-substatus-save-note-btn text-[10px] text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-2 py-1 rounded-lg font-medium"
                data-substatus-id="${Number(substatusId)}">
                Salvar observação
            </button>
        </div>
    `;
}

async function fetchInternalAssemblySubstatusForProject(projectId) {
    const id = Number(projectId);
    if (!id) return { open: [], closed: [] };

    const kinds = typeof getOrderProjectInternalAssemblySubstatusKindList === 'function'
        ? getOrderProjectInternalAssemblySubstatusKindList()
        : (window.ORDER_PROJECT_INTERNAL_ASSEMBLY_SUBSTATUS_DEFINITIONS || []).map(item => item.kind);

    const { data, error } = await supabaseClient
        .from('OrderProjectSubstatus')
        .select('id, orderProjectId, kind, startedAt, endedAt, startedById, endedById, note')
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
                <li class="py-2 border-b border-slate-100 last:border-0">
                    <p class="text-xs font-medium text-amber-800">${escapeHtml(label)}</p>
                    <p class="text-[10px] text-slate-500 mb-2">Início: ${escapeHtml(formatMontagemSubstatusDateTime(row.startedAt))}</p>
                    ${renderMontagemSubstatusNoteBlockHtml(row.note, {
                        substatusId: row.id,
                        editable: true
                    })}
                    <div class="flex flex-wrap justify-end gap-2 mt-2">
                        <button type="button"
                            class="montagem-substatus-end-btn text-xs bg-emerald-700 text-white hover:bg-emerald-800 px-2.5 py-1 rounded-lg font-medium"
                            data-substatus-id="${Number(row.id)}">
                            Encerrar
                        </button>
                    </div>
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
                    ${renderMontagemSubstatusNoteBlockHtml(row.note, {
                        substatusId: row.id,
                        editable: false,
                        readOnlyBox: true
                    })}
                </li>
            `;
            }).join('')
            : '';
    }
    emptyClosed?.classList.toggle('hidden', closedRows.length > 0);
}

function clearMontagemSubstatusStartNoteField() {
    const field = document.getElementById('order-project-montagem-substatus-start-note');
    if (field) field.value = '';
}

async function refreshMontagemSubstatusModalContent() {
    if (!montagemSubstatusModalProjectId) return;
    const { open, closed } = await fetchInternalAssemblySubstatusForProject(montagemSubstatusModalProjectId);
    renderMontagemSubstatusModalLists(open, closed);
}

async function refreshMontagemSubstatusRelatedSurfaces() {
    if (montagemSubstatusModalOrderId && typeof loadOrderProjects === 'function') {
        await loadOrderProjects(montagemSubstatusModalOrderId);
        return;
    }
    if (typeof refreshSurfacesAfterOrderProjectSubstatusChange === 'function') {
        await refreshSurfacesAfterOrderProjectSubstatusChange();
    }
}

async function runMontagemSubstatusOverlayAction(options) {
    if (orderProjectMontagemSubstatusOverlay) {
        return orderProjectMontagemSubstatusOverlay.runAction(options);
    }

    try {
        const result = await options.task();
        if (typeof options.onSuccess === 'function') {
            await options.onSuccess(result);
        }
        return result;
    } catch (error) {
        alertAppDialog(
            typeof options.formatError === 'function'
                ? options.formatError(error)
                : (error?.message || 'Não foi possível concluir a ação.')
        );
        return null;
    }
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
    montagemSubstatusModalOrderId = Number(project.orderId || project.order?.id)
        || (typeof activeOrderId !== 'undefined' ? Number(activeOrderId) : null)
        || null;
    const context = document.getElementById('order-project-montagem-substatus-context');
    if (context) {
        context.textContent = projectLabel || project.name || `Projeto #${id}`;
    }

    const kindSelect = document.getElementById('order-project-montagem-substatus-kind');
    if (kindSelect) {
        kindSelect.innerHTML = getMontagemSubstatusKindOptionsHtml();
    }
    clearMontagemSubstatusStartNoteField();
    orderProjectMontagemSubstatusOverlay?.setLoading(false);

    await refreshMontagemSubstatusModalContent();
    toggleModal('order-project-montagem-substatus-modal', true);
}

function closeOrderProjectMontagemSubstatusModal() {
    montagemSubstatusModalProjectId = null;
    montagemSubstatusModalOrderId = null;
    clearMontagemSubstatusStartNoteField();
    orderProjectMontagemSubstatusOverlay?.setLoading(false);
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

    const noteField = document.getElementById('order-project-montagem-substatus-start-note');
    const note = noteField?.value ?? '';

    await runMontagemSubstatusOverlayAction({
        loadingMessage: 'Iniciando substatus...',
        successMessage: 'Substatus iniciado!',
        formatError: (error) => error.message || 'Não foi possível iniciar o substatus.',
        task: async () => {
            await startOrderProjectInternalAssemblySubstatus(montagemSubstatusModalProjectId, kind, note);
            clearMontagemSubstatusStartNoteField();
            await refreshMontagemSubstatusModalContent();
            await refreshMontagemSubstatusRelatedSurfaces();
        }
    });
}

async function saveMontagemSubstatusNoteFromModal(substatusId) {
    if (!montagemSubstatusModalProjectId || !substatusId) return;
    const input = document.querySelector(
        `.montagem-substatus-note-input[data-substatus-id="${Number(substatusId)}"]`
    );
    const note = input?.value ?? '';

    await runMontagemSubstatusOverlayAction({
        loadingMessage: 'Salvando observação...',
        successMessage: 'Observação salva!',
        formatError: (error) => error.message || 'Não foi possível salvar a observação.',
        task: async () => {
            await updateOrderProjectInternalAssemblySubstatusNote(
                substatusId,
                note,
                montagemSubstatusModalProjectId
            );
            await refreshMontagemSubstatusModalContent();
            await refreshMontagemSubstatusRelatedSurfaces();
        }
    });
}

async function endMontagemSubstatusFromModal(substatusId) {
    if (!montagemSubstatusModalProjectId || !substatusId) return;
    const confirmed = await confirmAppDialog(
        'Encerrar este substatus? O status do projeto não muda.',
        { title: 'Encerrar substatus', confirmLabel: 'Encerrar' }
    );
    if (!confirmed) return;

    await runMontagemSubstatusOverlayAction({
        loadingMessage: 'Encerrando substatus...',
        successMessage: 'Substatus encerrado!',
        formatError: (error) => error.message || 'Não foi possível encerrar o substatus.',
        task: async () => {
            await endOrderProjectInternalAssemblySubstatusById(substatusId, montagemSubstatusModalProjectId);
            await refreshMontagemSubstatusModalContent();
            await refreshMontagemSubstatusRelatedSurfaces();
        }
    });
}

function bindOrderProjectMontagemSubstatusEvents() {
    if (orderProjectMontagemSubstatusEventsBound) return;
    orderProjectMontagemSubstatusEventsBound = true;

    document.getElementById('order-project-montagem-substatus-close')
        ?.addEventListener('click', closeOrderProjectMontagemSubstatusModal);
    document.getElementById('order-project-montagem-substatus-start')
        ?.addEventListener('click', startMontagemSubstatusFromModal);

    const handleMontagemSubstatusModalActionClick = (event) => {
        const endBtn = event.target.closest('.montagem-substatus-end-btn');
        if (endBtn) {
            event.preventDefault();
            endMontagemSubstatusFromModal(Number(endBtn.dataset.substatusId));
            return;
        }
        const saveBtn = event.target.closest('.montagem-substatus-save-note-btn');
        if (!saveBtn) return;
        event.preventDefault();
        saveMontagemSubstatusNoteFromModal(Number(saveBtn.dataset.substatusId));
    };

    const montagemSubstatusModalMount = document.getElementById('order-project-montagem-substatus-panel')
        || document.getElementById('order-project-montagem-substatus-modal');
    montagemSubstatusModalMount?.addEventListener('click', handleMontagemSubstatusModalActionClick);
}

window.openOrderProjectMontagemSubstatusModal = openOrderProjectMontagemSubstatusModal;
window.canManageOrderProjectInternalAssemblySubstatus = canManageOrderProjectInternalAssemblySubstatus;
window.canManageOrderProjectInternalAssemblyAwaiting = canManageOrderProjectInternalAssemblyAwaiting;
