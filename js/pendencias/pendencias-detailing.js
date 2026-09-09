const DETALHAMENTO_PENDENCIAS_SELECT = `
    id, orderProjectId, status, projectFilePath, serverFolderPath, designerId, startedAt, completedAt,
    designer:appUsers!Detailing_designerId_fkey(id, name),
    orderProject:OrderProject(
        id, orderId, projectCode, name, statusId, deliveryDate,
        order:salesOrders(${getSalesOrderMinimalEmbedSelect()}),
        projectStatus:OrderProjectStatus(id, name)
    )
`;

async function fetchPendenciasDetalhamentosSemProjetista() {
    const { data, error } = await supabaseClient
        .from('Detailing')
        .select(DETALHAMENTO_PENDENCIAS_SELECT)
        .eq('status', DETALHAMENTO_STATUS_AGUARDANDO)
        .is('designerId', null)
        .order('createdAt', { ascending: true });

    if (error?.message?.includes('Detailing')) {
        return {
            error: new Error('Tabela Detailing não encontrada. Execute supabase/create-detailing.sql no Supabase.'),
            records: []
        };
    }

    if (error) {
        return { error, records: [] };
    }

    return { error: null, records: data || [] };
}

async function fetchPendenciasDetalhamentosForProjetista(designerId, options = {}) {
    const includeAll = options.includeAll === true;
    if (!includeAll && !designerId) {
        return { error: null, records: [] };
    }

    let query = supabaseClient
        .from('Detailing')
        .select(DETALHAMENTO_PENDENCIAS_SELECT)
        .in('status', [DETALHAMENTO_STATUS_AGUARDANDO, DETALHAMENTO_STATUS_EM_ANDAMENTO])
        .order('createdAt', { ascending: true });

    if (!includeAll) {
        query = query.eq('designerId', designerId);
    }

    const { data, error } = await query;

    if (error?.message?.includes('Detailing')) {
        return {
            error: new Error('Tabela Detailing não encontrada. Execute supabase/create-detailing.sql no Supabase.'),
            records: []
        };
    }

    if (error) {
        return { error, records: [] };
    }

    return { error: null, records: data || [] };
}

function mapPendenciasDetalhamentoRow(record) {
    const project = record.orderProject || {};
    return {
        detalhamentoId: record.id,
        detalhamentoStatus: record.status,
        projectFilePath: record.projectFilePath,
        designerName: record.designer?.name || '—',
        id: project.id,
        orderId: project.orderId,
        projectCode: project.projectCode,
        name: project.name,
        deliveryDate: project.deliveryDate,
        order: project.order,
        projectStatus: project.projectStatus
    };
}

async function loadPendenciasGestorDetalhamento() {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    if (!canActDetalhamentoGestor()) {
        content.innerHTML = '<p class="text-xs text-slate-500 p-4">Sem permissão para esta pendência.</p>';
        return;
    }

    content.innerHTML = '<p class="text-xs text-slate-400 p-4">Carregando...</p>';

    await fetchDetalhamentoProjetistas(true);
    const { error, records } = await fetchPendenciasDetalhamentosSemProjetista();

    if (error) {
        content.innerHTML = `<p class="text-xs text-red-500 p-4">${escapeHtml(error.message)}</p>`;
        return;
    }

    renderPendenciasGestorDetalhamentoList(records.map(mapPendenciasDetalhamentoRow));
}

function renderPendenciasGestorDetalhamentoList(records) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (records || []).map(record => mapPendenciasInteractiveIdentity(record, {
        detalhamentoId: record.detalhamentoId,
        projectFilePath: record.projectFilePath || '',
        statusName: record.detalhamentoStatus,
        statusClass: typeof getDetalhamentoStatusBadgeClass === 'function'
            ? getDetalhamentoStatusBadgeClass(record.detalhamentoStatus)
            : 'bg-slate-100 text-slate-600',
        deliveryLabel: formatPendenciasDeliveryDate(record.deliveryDate),
        deliveryDate: record.deliveryDate
    }));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Aguardando Detalhamento',
        subtitle: 'Projetos em produção sem projetista de detalhamento.',
        refreshButtonId: 'btn-pendencias-refresh-gestor-detalhamento',
        refreshButtonClass: 'text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700',
        onRefresh: loadPendenciasGestorDetalhamento,
        tableId: 'pendencias-gestor-detalhamento',
        rows,
        minWidth: '56rem',
        emptyMessage: 'Nenhum projeto aguardando associação.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns(),
            getPendenciasInteractiveDateColumn({
                key: 'deliveryLabel',
                label: 'Entrega Proj. Téc.',
                sortKey: 'deliveryDate'
            }),
            {
                key: 'projectFilePath',
                label: 'Pasta (implantação)',
                cellClass: 'p-3 text-xs text-slate-600 max-w-[12rem] truncate',
                render: (row) => `<span title="${escapeHtml(row.projectFilePath || '')}">${escapeHtml(row.projectFilePath || '—')}</span>`
            },
            getPendenciasInteractiveStatusColumn(),
            {
                key: 'designerSelect',
                label: 'Projetista',
                type: 'action',
                thClass: 'min-w-[11rem]',
                cellClass: 'p-3 min-w-[11rem]',
                render: (row) => `<select class="pendencias-detalhamento-designer-select w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
                    data-detalhamento-id="${row.detalhamentoId}"
                    data-project-id="${row.id}">
                    <option value="">Selecione...</option>
                    ${getDetalhamentoProjetistaOptionsHtml()}
                </select>`
            },
            getPendenciasInteractiveActionColumn({
                render: (row) => `<button type="button"
                    class="pendencias-detalhamento-associar-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
                    data-detalhamento-id="${row.detalhamentoId}"
                    data-project-id="${row.id}">
                    Associar
                </button>`
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-detalhamento-associar-btn').forEach(button => {
                button.addEventListener('click', () => {
                    const detalhamentoId = Number(button.dataset.detalhamentoId);
                    const orderProjectId = Number(button.dataset.projectId);
                    const row = button.closest('tr');
                    const designerId = Number(row?.querySelector('.pendencias-detalhamento-designer-select')?.value || 0);
                    associarPendenciaDetalhamentoProjetista(detalhamentoId, designerId, orderProjectId);
                });
            });
        }
    });
}

async function associarPendenciaDetalhamentoProjetista(detalhamentoId, designerId, orderProjectId = null) {
    if (!detalhamentoId || !designerId) {
        alertAppDialog('Selecione o projetista de detalhamento.');
        return;
    }

    const projetista = detalhamentoProjetistasCache.find(item => Number(item.id) === designerId);
    if (!projetista) {
        alertAppDialog('Projetista inválido ou sem permissão de detalhamento.');
        return;
    }

    try {
        if (typeof setPendenciasActionLoading === 'function') {
            setPendenciasActionLoading(true, 'Associando projetista...');
        }

        const now = new Date().toISOString();
        const { data, error } = await supabaseClient
            .from('Detailing')
            .update({
                designerId,
                updatedById: currentUser?.id || null,
                updatedAt: now
            })
            .eq('id', detalhamentoId)
            .select('orderProjectId, projectFilePath')
            .maybeSingle();

        if (error) throw error;

        const resolvedOrderProjectId = orderProjectId || data?.orderProjectId;
        if (typeof notifyDetalhamentoProjetistaAssociadoEmail === 'function' && resolvedOrderProjectId) {
            await notifyDetalhamentoProjetistaAssociadoEmail({
                orderProjectId: resolvedOrderProjectId,
                designerId,
                projectFilePath: data?.projectFilePath || ''
            });
        }

        await loadPendenciasGestorDetalhamento();
    } catch (error) {
        alertAppDialog(`Erro ao associar: ${error.message}`);
    } finally {
        if (typeof setPendenciasActionLoading === 'function') {
            setPendenciasActionLoading(false);
        }
    }
}

async function loadPendenciasProjetistaDetalhamento() {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    if (!canSeePendenciasDetalhamentoProjetistaItems()) {
        content.innerHTML = '<p class="text-xs text-slate-500 p-4">Sem permissão para esta pendência.</p>';
        return;
    }

    content.innerHTML = '<p class="text-xs text-slate-400 p-4">Carregando...</p>';

    const userId = Number(currentUser?.id);
    const overviewMode = typeof isPendenciasProjetistaOverviewMode === 'function'
        && isPendenciasProjetistaOverviewMode();
    const { error, records } = await fetchPendenciasDetalhamentosForProjetista(userId, {
        includeAll: overviewMode
    });

    if (error) {
        content.innerHTML = `<p class="text-xs text-red-500 p-4">${escapeHtml(error.message)}</p>`;
        return;
    }

    renderPendenciasProjetistaDetalhamentoList(records.map(mapPendenciasDetalhamentoRow), overviewMode);
}

function renderPendenciasProjetistaDetalhamentoList(records, overviewMode = false) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const rows = (records || []).map(record => mapPendenciasInteractiveIdentity(record, {
        detalhamentoId: record.detalhamentoId,
        projectFilePath: record.projectFilePath || '',
        designerName: record.designerName || '—',
        statusName: record.detalhamentoStatus,
        statusClass: typeof getDetalhamentoStatusBadgeClass === 'function'
            ? getDetalhamentoStatusBadgeClass(record.detalhamentoStatus)
            : 'bg-slate-100 text-slate-600',
        deliveryLabel: formatPendenciasDeliveryDate(record.deliveryDate),
        deliveryDate: record.deliveryDate,
        canStart: record.detalhamentoStatus === DETALHAMENTO_STATUS_AGUARDANDO,
        canOpen: record.detalhamentoStatus === DETALHAMENTO_STATUS_EM_ANDAMENTO
            || record.detalhamentoStatus === DETALHAMENTO_STATUS_AGUARDANDO
    }));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Detalhamento',
        subtitle: overviewMode
            ? 'Todos os detalhamentos aguardando início ou em andamento.'
            : 'Projetos atribuídos a você aguardando início ou em andamento.',
        refreshButtonId: 'btn-pendencias-refresh-projetista-detalhamento',
        refreshButtonClass: 'text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700',
        onRefresh: loadPendenciasProjetistaDetalhamento,
        tableId: 'pendencias-projetista-detalhamento',
        rows,
        minWidth: overviewMode ? '52rem' : '48rem',
        emptyMessage: 'Nenhum detalhamento pendente.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns({ includeDesigner: overviewMode }),
            getPendenciasInteractiveDateColumn({
                key: 'deliveryLabel',
                label: 'Entrega Proj. Téc.',
                sortKey: 'deliveryDate'
            }),
            {
                key: 'projectFilePath',
                label: 'Pasta (implantação)',
                cellClass: 'p-3 text-xs text-slate-600 max-w-[12rem] truncate',
                render: (row) => `<span title="${escapeHtml(row.projectFilePath || '')}">${escapeHtml(row.projectFilePath || '—')}</span>`
            },
            getPendenciasInteractiveStatusColumn(),
            getPendenciasInteractiveActionColumn({
                cellClass: 'p-3 text-right whitespace-nowrap space-x-1',
                render: (row) => {
                    const projectName = escapeHtml(row.projectName || 'Projeto');
                    return `
                        ${row.canStart
                            ? `<button type="button"
                                class="pendencias-detalhamento-iniciar-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-violet-100 text-violet-800 hover:bg-violet-200"
                                data-project-id="${row.id}"
                                data-project-name="${projectName}">
                                Iniciar
                            </button>`
                            : ''}
                        ${row.canOpen
                            ? `<button type="button"
                                class="pendencias-detalhamento-open-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                                data-project-id="${row.id}"
                                data-project-name="${projectName}">
                                Abrir
                            </button>`
                            : ''}
                    `;
                }
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-detalhamento-open-btn').forEach(button => {
                button.addEventListener('click', () => {
                    const projectId = Number(button.dataset.projectId);
                    const projectName = button.dataset.projectName || 'Projeto';
                    if (projectId && typeof openDetalhamentoModal === 'function') {
                        openDetalhamentoModal(projectId, projectName);
                    }
                });
            });

            tbody?.querySelectorAll('.pendencias-detalhamento-iniciar-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    const projectId = Number(button.dataset.projectId);
                    const projectName = button.dataset.projectName || 'Projeto';
                    if (!projectId || typeof openDetalhamentoModal !== 'function') return;

                    await openDetalhamentoModal(projectId, projectName);
                    if (typeof handleDetalhamentoIniciar === 'function') {
                        await handleDetalhamentoIniciar();
                    }
                });
            });
        }
    });
}
