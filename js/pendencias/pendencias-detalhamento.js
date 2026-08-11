const DETALHAMENTO_PENDENCIAS_SELECT = `
    id, orderProjectId, status, projetoPath, serverFolderPath, designerId, startedAt, completedAt,
    designer:appUsers!Detailing_designerId_fkey(id, name),
    orderProject:OrderProject(
        id, orderId, projectCode, name, statusId, deliveryDate,
        order:salesOrders(${PENDENCIAS_ORDER_EMBED}),
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

async function fetchPendenciasDetalhamentosForProjetista(designerId) {
    if (!designerId) {
        return { error: null, records: [] };
    }

    const { data, error } = await supabaseClient
        .from('Detailing')
        .select(DETALHAMENTO_PENDENCIAS_SELECT)
        .eq('designerId', designerId)
        .in('status', [DETALHAMENTO_STATUS_AGUARDANDO, DETALHAMENTO_STATUS_EM_ANDAMENTO])
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

function mapPendenciasDetalhamentoRow(record) {
    const project = record.orderProject || {};
    return {
        detalhamentoId: record.id,
        detalhamentoStatus: record.status,
        projetoPath: record.projetoPath,
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

function renderPendenciasGestorDetalhamentoList(rows) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const tableRows = rows.map(row => {
        const orderCode = row.order?.orderCode || '—';
        const clientName = getOrderClientName(row.order) || '—';
        const projectLabel = getPendenciasProjectDetailLabel(row);
        const deliveryDate = formatPendenciasDeliveryDate(row.deliveryDate);
        const statusClass = getDetalhamentoStatusBadgeClass(row.detalhamentoStatus);

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-xs text-slate-600 max-w-[12rem] truncate" title="${escapeHtml(row.projetoPath || '')}">${escapeHtml(row.projetoPath || '—')}</td>
                <td class="p-3">
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusClass}">${escapeHtml(row.detalhamentoStatus)}</span>
                </td>
                <td class="p-3 min-w-[11rem]">
                    <select class="pendencias-detalhamento-designer-select w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-600"
                        data-detalhamento-id="${row.detalhamentoId}"
                        data-project-id="${row.id}">
                        <option value="">Selecione...</option>
                        ${getDetalhamentoProjetistaOptionsHtml()}
                    </select>
                </td>
                <td class="p-3 text-right">
                    <button type="button"
                        class="pendencias-detalhamento-associar-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
                        data-detalhamento-id="${row.detalhamentoId}"
                        data-project-id="${row.id}">
                        Associar
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="text-sm font-bold text-slate-800">Aguardando Detalhamento</h3>
                    <p class="text-xs text-slate-500 mt-0.5">Projetos em produção sem projetista de detalhamento.</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-gestor-detalhamento"
                    class="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
                    Atualizar
                </button>
            </div>
            ${rows.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse min-w-[56rem]">
                        <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
                            <tr>
                                <th class="p-3 font-semibold">Pedido</th>
                                <th class="p-3 font-semibold">Cliente</th>
                                <th class="p-3 font-semibold">Projeto</th>
                                <th class="p-3 font-semibold">Entrega Proj. Téc.</th>
                                <th class="p-3 font-semibold">Pasta (implantação)</th>
                                <th class="p-3 font-semibold">Status</th>
                                <th class="p-3 font-semibold">Projetista</th>
                                <th class="p-3 font-semibold text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-10">Nenhum projeto aguardando associação.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-gestor-detalhamento')
        ?.addEventListener('click', () => loadPendenciasGestorDetalhamento());

    content.querySelectorAll('.pendencias-detalhamento-associar-btn').forEach(button => {
        button.addEventListener('click', () => {
            const detalhamentoId = Number(button.dataset.detalhamentoId);
            const orderProjectId = Number(button.dataset.projectId);
            const row = button.closest('tr');
            const designerId = Number(row?.querySelector('.pendencias-detalhamento-designer-select')?.value || 0);
            associarPendenciaDetalhamentoProjetista(detalhamentoId, designerId, orderProjectId);
        });
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
            .select('orderProjectId, projetoPath')
            .maybeSingle();

        if (error) throw error;

        const resolvedOrderProjectId = orderProjectId || data?.orderProjectId;
        if (typeof notifyDetalhamentoProjetistaAssociadoEmail === 'function' && resolvedOrderProjectId) {
            await notifyDetalhamentoProjetistaAssociadoEmail({
                orderProjectId: resolvedOrderProjectId,
                designerId,
                projetoPath: data?.projetoPath || ''
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
    const { error, records } = await fetchPendenciasDetalhamentosForProjetista(userId);

    if (error) {
        content.innerHTML = `<p class="text-xs text-red-500 p-4">${escapeHtml(error.message)}</p>`;
        return;
    }

    renderPendenciasProjetistaDetalhamentoList(records.map(mapPendenciasDetalhamentoRow));
}

function renderPendenciasProjetistaDetalhamentoList(rows) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const tableRows = rows.map(row => {
        const orderCode = row.order?.orderCode || '—';
        const clientName = getOrderClientName(row.order) || '—';
        const projectLabel = getPendenciasProjectDetailLabel(row);
        const deliveryDate = formatPendenciasDeliveryDate(row.deliveryDate);
        const statusClass = getDetalhamentoStatusBadgeClass(row.detalhamentoStatus);
        const canStart = row.detalhamentoStatus === DETALHAMENTO_STATUS_AGUARDANDO;
        const canOpen = row.detalhamentoStatus === DETALHAMENTO_STATUS_EM_ANDAMENTO || canStart;

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-xs text-slate-600 max-w-[12rem] truncate" title="${escapeHtml(row.projetoPath || '')}">${escapeHtml(row.projetoPath || '—')}</td>
                <td class="p-3">
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusClass}">${escapeHtml(row.detalhamentoStatus)}</span>
                </td>
                <td class="p-3 text-right space-x-1">
                    ${canStart
                        ? `<button type="button"
                                class="pendencias-detalhamento-iniciar-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-violet-100 text-violet-800 hover:bg-violet-200"
                                data-project-id="${row.id}"
                                data-project-name="${escapeHtml(projectLabel)}">
                                Iniciar
                            </button>`
                        : ''}
                    ${canOpen
                        ? `<button type="button"
                                class="pendencias-detalhamento-open-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                                data-project-id="${row.id}"
                                data-project-name="${escapeHtml(projectLabel)}">
                                Abrir
                            </button>`
                        : ''}
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="text-sm font-bold text-slate-800">Detalhamento</h3>
                    <p class="text-xs text-slate-500 mt-0.5">Projetos atribuídos a você aguardando início ou em andamento.</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-projetista-detalhamento"
                    class="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
                    Atualizar
                </button>
            </div>
            ${rows.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse min-w-[48rem]">
                        <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
                            <tr>
                                <th class="p-3 font-semibold">Pedido</th>
                                <th class="p-3 font-semibold">Cliente</th>
                                <th class="p-3 font-semibold">Projeto</th>
                                <th class="p-3 font-semibold">Entrega Proj. Téc.</th>
                                <th class="p-3 font-semibold">Pasta (implantação)</th>
                                <th class="p-3 font-semibold">Status</th>
                                <th class="p-3 font-semibold text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-10">Nenhum detalhamento pendente.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-projetista-detalhamento')
        ?.addEventListener('click', () => loadPendenciasProjetistaDetalhamento());

    content.querySelectorAll('.pendencias-detalhamento-open-btn').forEach(button => {
        button.addEventListener('click', () => {
            const projectId = Number(button.dataset.projectId);
            const projectName = button.dataset.projectName || 'Projeto';
            if (projectId && typeof openDetalhamentoModal === 'function') {
                openDetalhamentoModal(projectId, projectName);
            }
        });
    });

    content.querySelectorAll('.pendencias-detalhamento-iniciar-btn').forEach(button => {
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
