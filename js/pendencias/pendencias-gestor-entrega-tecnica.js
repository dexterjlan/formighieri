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

    const phasesByOrderId = await fetchPhasesByOrderIdForPendenciasProjects(projects);
    renderPendenciasAguardandoEntregaTecnicaList(projects, phasesByOrderId);
}

function renderPendenciasAguardandoEntregaTecnicaList(projects, phasesByOrderId = {}) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActFinalizarEntregaTecnica();
    const sortedProjects = sortPendenciasByEffectiveDeliveryDate(projects, phasesByOrderId);
    const rows = sortedProjects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = getOrderClientName(project.order) || '—';
        const projectName = getPendenciasProjectLabel(project);
        const deliveryDate = formatPendenciasProjectDeliveryDate(project, phasesByOrderId);
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-entrega-tecnica-finalizar-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                data-project-id="${project.id}"
                data-project-name="${escapeHtml(project.name || '')}">
                Finalizar
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectName)}</td>
                <td class="p-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(deliveryDate)}</td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Aguardando Entrega Técnica</h3>
                    <p class="text-xs text-slate-400 mt-0.5">Projetos aguardando confirmação de entrega pelo gestor comercial.</p>
                </div>
                <button type="button" id="pendencias-entrega-tecnica-refresh-btn"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${sortedProjects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[760px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Projeto</th>
                                <th class="text-left p-3 font-semibold">Entrega</th>
                                <th class="text-right p-3 font-semibold w-36">Ação</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto aguardando entrega técnica.</p>'}
        </div>
    `;

    content.querySelector('#pendencias-entrega-tecnica-refresh-btn')
        ?.addEventListener('click', loadPendenciasAguardandoEntregaTecnica);

    content.querySelectorAll('.pendencias-entrega-tecnica-finalizar-btn').forEach(button => {
        button.addEventListener('click', async () => {
            if (typeof openOrderProjectEntregaModal !== 'function') return;
            await openOrderProjectEntregaModal(
                Number(button.dataset.projectId),
                button.dataset.projectName || '',
                { onSuccess: loadPendenciasAguardandoEntregaTecnica }
            );
        });
    });
}
