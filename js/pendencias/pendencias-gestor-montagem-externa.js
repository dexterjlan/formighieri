async function loadPendenciasMontagemExterna() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasGestorProjetosMenu()) {
        renderPendenciasPlaceholder('Montagem Externa', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_MONTAGEM_EXTERNA);

    if (error) {
        renderPendenciasPlaceholder('Montagem Externa', `Erro ao carregar: ${error.message}`);
        return;
    }

    renderPendenciasMontagemExternaList(projects);
}

function renderPendenciasMontagemExternaList(projects) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canSeePendenciasGestorProjetosMenu();
    const rows = projects.map(project => {
        const orderCode = project.order?.orderCode || '—';
        const clientName = getOrderClientName(project.order) || '—';
        const projectName = project.name || getPendenciasProjectLabel(project);
        const statusName = getPendenciasProjectStatusName(project);
        const statusClass = getPendenciasProjectStatusBadgeClass(statusName);
        const actionCell = canAct
            ? `<button type="button"
                class="pendencias-montagem-externa-finalizar-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                data-project-id="${project.id}">
                Finalizar
            </button>`
            : '<span class="text-xs text-slate-300">—</span>';

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(orderCode)}</td>
                <td class="p-3 text-xs text-slate-600">${escapeHtml(clientName)}</td>
                <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(projectName)}</td>
                <td class="p-3">
                    <span class="inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">
                        ${escapeHtml(statusName || '—')}
                    </span>
                </td>
                <td class="p-3 text-right whitespace-nowrap">${actionCell}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">Montagem Externa</h3>
                    <p class="text-xs text-slate-400 mt-0.5">Projetos em montagem externa aguardando finalização.</p>
                </div>
                <button type="button" id="pendencias-montagem-externa-refresh-btn"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            ${projects.length
                ? `<div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[760px]">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="text-left p-3 font-semibold">Código do Pedido</th>
                                <th class="text-left p-3 font-semibold">Cliente</th>
                                <th class="text-left p-3 font-semibold">Nome do projeto</th>
                                <th class="text-left p-3 font-semibold">Status</th>
                                <th class="text-right p-3 font-semibold w-36">Ação</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : '<p class="text-xs text-slate-400 text-center py-8 px-4">Nenhum projeto em montagem externa.</p>'}
        </div>
    `;

    content.querySelector('#pendencias-montagem-externa-refresh-btn')
        ?.addEventListener('click', loadPendenciasMontagemExterna);

    content.querySelectorAll('.pendencias-montagem-externa-finalizar-btn').forEach(button => {
        button.addEventListener('click', async () => {
            await finalizePendenciasMontagemExterna(Number(button.dataset.projectId));
        });
    });
}

async function finalizePendenciasMontagemExterna(projectId) {
    if (!canSeePendenciasGestorProjetosMenu()) {
        alertAppDialog('Sem permissão para finalizar montagem externa.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!projectId) return;

    const { data: rawProject, error: readError } = await supabaseClient
        .from('OrderProject')
        .select('id, orderId, name, statusId, projectStatus:OrderProjectStatus(id, name)')
        .eq('id', projectId)
        .maybeSingle();

    let project = rawProject;

    if (readError?.message?.includes('projectStatus')) {
        const fallback = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, name, statusId')
            .eq('id', projectId)
            .maybeSingle();

        if (fallback.error || !fallback.data) {
            alertAppDialog('Projeto não encontrado.');
            return;
        }

        project = (await enrichPendenciasProjectsWithStatus([fallback.data]))[0];
    } else if (readError || !project) {
        alertAppDialog('Projeto não encontrado.');
        return;
    }

    const currentStatusName = getPendenciasProjectStatusName(project);
    if (currentStatusName !== PENDENCIAS_STATUS_MONTAGEM_EXTERNA) {
        alertAppDialog('O status do projeto foi alterado. Atualize a lista.');
        await loadPendenciasMontagemExterna();
        return;
    }

    const projectLabel = project.name || getPendenciasProjectLabel(project);
    const confirmMessage = `Finalizar montagem externa de "${projectLabel}" e enviar para aguardando entrega técnica?`;

    if (!(await confirmAppDialog(confirmMessage))) return;

    const targetStatusId = await getPendenciasStatusIdByName(PENDENCIAS_STATUS_AGUARDANDO_ENTREGA_TECNICA);
    if (!targetStatusId) {
        alertAppDialog(`Status "${PENDENCIAS_STATUS_AGUARDANDO_ENTREGA_TECNICA}" não encontrado.`);
        return;
    }

    try {
        setPendenciasActionLoading(true, 'Finalizando montagem externa...');

        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from('OrderProject')
            .update({
                statusId: targetStatusId,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .eq('id', projectId);

        if (error) {
            alertAppDialog('Erro ao alterar status: ' + error.message);
            return;
        }

        if (typeof notifyMontagemExternaFinalizadaEmail === 'function') {
            await notifyMontagemExternaFinalizadaEmail({
                orderId: project.orderId,
                orderProjectId: projectId
            });
        }

        await loadPendenciasMontagemExterna();
    } finally {
        setPendenciasActionLoading(false);
    }
}
