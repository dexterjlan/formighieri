let pendenciasEntregaTecnicaProjectsCache = [];

function getPendenciasEntregaTecnicaProjectLabel(project) {
    return typeof getPendenciasProjectDetailLabel === 'function'
        ? getPendenciasProjectDetailLabel(project)
        : (project?.name || 'Projeto');
}

function getPendenciasEntregaTecnicaCheckedProjects() {
    const selectedIds = [...document.querySelectorAll('.pendencias-entrega-tecnica-check:checked')]
        .map(checkbox => Number(checkbox.dataset.projectId))
        .filter(Boolean);

    return pendenciasEntregaTecnicaProjectsCache.filter(project => selectedIds.includes(Number(project.id)));
}

function syncPendenciasEntregaTecnicaCheckboxStates() {
    const checkedProjects = getPendenciasEntregaTecnicaCheckedProjects();
    const selectedOrderId = checkedProjects.length
        ? Number(checkedProjects[0]?.orderId)
        : null;

    document.querySelectorAll('.pendencias-entrega-tecnica-check').forEach(checkbox => {
        const orderId = Number(checkbox.dataset.orderId);
        const isChecked = checkbox.checked;
        const isOtherOrder = selectedOrderId && orderId !== selectedOrderId;
        checkbox.disabled = Boolean(isOtherOrder && !isChecked);
        checkbox.closest('tr')?.classList.toggle('opacity-50', Boolean(isOtherOrder && !isChecked));
    });

    const batchButton = document.getElementById('pendencias-entrega-tecnica-batch-btn');
    if (batchButton) {
        batchButton.disabled = checkedProjects.length === 0;
    }
}

function validatePendenciasEntregaTecnicaBatchSelection(selectedProjects = []) {
    if (!selectedProjects.length) {
        return { ok: false, message: 'Selecione ao menos um projeto.' };
    }

    const orderIds = [...new Set(selectedProjects.map(project => Number(project.orderId)).filter(Boolean))];
    if (orderIds.length !== 1) {
        return {
            ok: false,
            message: 'Selecione apenas projetos do mesmo pedido para finalizar em lote.'
        };
    }

    return { ok: true, orderId: orderIds[0] };
}

async function openPendenciasEntregaTecnicaBatchModal() {
    const selectedProjects = getPendenciasEntregaTecnicaCheckedProjects();
    const validation = validatePendenciasEntregaTecnicaBatchSelection(selectedProjects);
    if (!validation.ok) {
        alertAppDialog(validation.message, { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (typeof openOrderProjectEntregaBatchModal !== 'function') return;

    await openOrderProjectEntregaBatchModal(selectedProjects, {
        onSuccess: loadPendenciasAguardandoEntregaTecnica
    });
}

async function loadPendenciasAguardandoEntregaTecnica() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasGestorComercialMenu()) {
        renderPendenciasPlaceholder('Aguardando Entrega Técnica', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_AGUARDANDO_ENTREGA_TECNICA);

    if (error) {
        renderPendenciasPlaceholder('Aguardando Entrega Técnica', `Erro ao carregar: ${error.message}`);
        return;
    }

    pendenciasEntregaTecnicaProjectsCache = projects || [];
    const phasesByOrderId = await fetchPhasesByOrderIdForPendenciasProjects(pendenciasEntregaTecnicaProjectsCache);
    renderPendenciasAguardandoEntregaTecnicaList(pendenciasEntregaTecnicaProjectsCache, phasesByOrderId);
}

function renderPendenciasAguardandoEntregaTecnicaList(projects, phasesByOrderId = {}) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActFinalizarEntregaTecnica();
    const rows = (projects || []).map(project => mapPendenciasInteractiveIdentity(project, {
        orderId: Number(project.orderId) || 0,
        deliveryLabel: formatPendenciasProjectDeliveryDate(project, phasesByOrderId),
        deliveryDate: typeof getPendenciasProjectEffectiveDeliveryDate === 'function'
            ? getPendenciasProjectEffectiveDeliveryDate(project, phasesByOrderId)
            : project.deliveryDate,
        projectNameRaw: project.name || '',
        projectDetailLabel: getPendenciasEntregaTecnicaProjectLabel(project)
    }));

    const columns = [];
    if (canAct) {
        columns.push({
            key: 'select',
            label: '',
            type: 'action',
            sortable: false,
            filterable: false,
            thClass: 'w-10',
            cellClass: 'p-3 text-center',
            render: (row) => `
                <input type="checkbox"
                    class="pendencias-entrega-tecnica-check h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    data-project-id="${Number(row.id)}"
                    data-order-id="${Number(row.orderId)}"
                    aria-label="Selecionar ${escapeHtml(row.projectDetailLabel || row.projectName)}">
            `
        });
    }

    columns.push(
        ...getPendenciasInteractiveIdentityColumns(),
        getPendenciasInteractiveDateColumn({
            key: 'deliveryLabel',
            label: 'Entrega',
            sortKey: 'deliveryDate'
        }),
        getPendenciasInteractiveActionColumn({
            render: (row) => canAct
                ? `<button type="button"
                    class="pendencias-entrega-tecnica-finalizar-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                    data-project-id="${row.id}"
                    data-project-name="${escapeHtml(row.projectNameRaw)}">
                    Finalizar
                </button>`
                : '<span class="text-xs text-slate-300">—</span>'
        })
    );

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Aguardando Entrega Técnica',
        subtitle: canAct
            ? 'Selecione projetos do mesmo pedido para finalizar em lote, ou finalize individualmente.'
            : 'Projetos aguardando confirmação de entrega pelo gestor comercial.',
        headerActionsHtml: canAct
            ? `<button type="button" id="pendencias-entrega-tecnica-batch-btn"
                class="order-tab-action-btn text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled>
                Finalizar selecionados
            </button>`
            : '',
        refreshButtonId: 'pendencias-entrega-tecnica-refresh-btn',
        onRefresh: loadPendenciasAguardandoEntregaTecnica,
        tableId: 'pendencias-aguardando-entrega-tecnica',
        rows,
        emptyMessage: 'Nenhum projeto aguardando entrega técnica.',
        columns,
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-entrega-tecnica-check').forEach(checkbox => {
                checkbox.addEventListener('change', syncPendenciasEntregaTecnicaCheckboxStates);
            });

            document.getElementById('pendencias-entrega-tecnica-batch-btn')
                ?.addEventListener('click', openPendenciasEntregaTecnicaBatchModal);

            tbody?.querySelectorAll('.pendencias-entrega-tecnica-finalizar-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    if (typeof openOrderProjectEntregaModal !== 'function') return;
                    await openOrderProjectEntregaModal(
                        Number(button.dataset.projectId),
                        button.dataset.projectName || '',
                        { onSuccess: loadPendenciasAguardandoEntregaTecnica }
                    );
                });
            });

            syncPendenciasEntregaTecnicaCheckboxStates();
        }
    });
}
