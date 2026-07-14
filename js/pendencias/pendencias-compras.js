async function fetchPendenciasEnviadosCompras() {
    const { error, compras } = await fetchComprasAbertas();

    if (error) {
        return { error, items: [] };
    }

    if (!compras.length) {
        return { error: null, items: [] };
    }

    const projectIds = [...new Set(compras.map(item => item.orderProjectId).filter(Boolean))];
    let projectResult = { data: [] };

    if (projectIds.length) {
        projectResult = await supabaseClient
            .from('OrderProject')
            .select(PENDENCIAS_PROJECT_SELECT)
            .in('id', projectIds);

        if (projectResult.error?.message?.includes('projectStatus') || projectResult.error?.message?.includes('designer')) {
            projectResult = await supabaseClient
                .from('OrderProject')
                .select(PENDENCIAS_PROJECT_SELECT_FALLBACK)
                .in('id', projectIds);
        }

        if (projectResult.error) {
            return { error: projectResult.error, items: [] };
        }
    }

    const projectsById = Object.fromEntries(
        excludeInactivePendenciasProjects(await enrichPendenciasProjectsWithStatus(projectResult.data || []))
            .map(project => [project.id, project])
    );

    const items = compras
        .map(compra => {
            const project = projectsById[compra.orderProjectId];
            return {
                ...compra,
                project,
                clientName: project?.order?.clientName || '',
                projectName: project?.name || ''
            };
        })
        .filter(item => item.project);

    return { error: null, items };
}

async function loadPendenciasEnviadosCompras() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando compras...</p>';
    }

    if (!canSeePendenciasComprasMenu()) {
        renderPendenciasPlaceholder('Enviados para Compras', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, items } = await fetchPendenciasEnviadosCompras();

    if (error) {
        renderPendenciasPlaceholder('Enviados para Compras', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasEnviadosComprasList(items);
}

function renderPendenciasEnviadosComprasList(items) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canView = canSeeCompraModal();

    const rows = items.map(item => {
        const orderCode = item.orderCode || item.project?.order?.orderCode || '—';
        const clientName = item.clientName || item.project?.order?.clientName || '—';
        const projectName = item.projectName || item.project?.name || '—';
        const tipoLabel = typeof formatCompraTipoLabel === 'function'
            ? formatCompraTipoLabel(item.tipoCompra)
            : (item.tipoCompra || '—');
        const statusClass = typeof getCompraStatusBadgeClass === 'function'
            ? getCompraStatusBadgeClass(item.status)
            : 'bg-amber-100 text-amber-800';
        const actionCell = canView && item.id
            ? `<button type="button"
                class="pendencias-compras-open-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"
                data-compra-id="${item.id}">
                Ver Compras
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectName)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(tipoLabel)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(item.status || '—')}
                    </span>
                </td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    const subtitle = canActCompraModal()
        ? 'Solicitações de compra geradas pela implantação.'
        : 'Visualização das solicitações de compra em aberto.';

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Enviados para Compras</h3>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>
                </div>
                <button type="button" id="btn-pendencias-refresh-enviados-compras"
                    class="order-tab-action-btn text-xs bg-white border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg font-medium hover:bg-amber-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${items.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[860px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Código do Pedido</th>
                                <th class="text-left p-3 font-semibold">Nome do Cliente</th>
                                <th class="text-left p-3 font-semibold">Nome do Projeto</th>
                                <th class="text-left p-3 font-semibold">Tipo</th>
                                <th class="text-left p-3 font-semibold">Status</th>
                                <th class="text-right p-3 font-semibold w-36">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhuma solicitação de compra em aberto.</p>'}
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-enviados-compras')
        ?.addEventListener('click', () => loadPendenciasEnviadosCompras());

    content.querySelectorAll('.pendencias-compras-open-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const compraId = Number(button.dataset.compraId);
            if (!compraId || typeof openCompraModal !== 'function') return;
            openCompraModal(compraId);
        });
    });
}
