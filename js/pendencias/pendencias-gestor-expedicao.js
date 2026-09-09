async function loadPendenciasExpedicao() {
    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando projetos...</p>';
    }

    if (!canSeePendenciasGestorProjetosMenu()) {
        renderPendenciasPlaceholder('Expedição', 'Sem permissão para visualizar esta pendência.');
        return;
    }

    const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_EXPEDICAO);

    if (error) {
        renderPendenciasPlaceholder('Expedição', `Erro ao carregar: ${error.message}`);
        return;
    }

    const phasesByOrderId = await fetchPhasesByOrderIdForPendenciasProjects(projects);
    renderPendenciasExpedicaoList(projects, phasesByOrderId);
}

function renderPendenciasExpedicaoList(projects, phasesByOrderId = {}) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const canAct = canActPendenciasGestorProjetosMontagemExterna();
    const rows = (projects || []).map(project => mapPendenciasInteractiveIdentity(project, {
        deliveryLabel: formatPendenciasProjectDeliveryDate(project, phasesByOrderId),
        deliveryDate: typeof getPendenciasProjectEffectiveDeliveryDate === 'function'
            ? getPendenciasProjectEffectiveDeliveryDate(project, phasesByOrderId)
            : project.deliveryDate
    }));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Expedição',
        subtitle: 'Projetos em expedição aguardando início da montagem externa.',
        refreshButtonId: 'pendencias-expedicao-refresh-btn',
        onRefresh: loadPendenciasExpedicao,
        tableId: 'pendencias-expedicao',
        rows,
        emptyMessage: 'Nenhum projeto em expedição.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns(),
            getPendenciasInteractiveDateColumn({
                key: 'deliveryLabel',
                label: 'Entrega',
                sortKey: 'deliveryDate'
            }),
            getPendenciasInteractiveActionColumn({
                thClass: 'w-48',
                render: (row) => canAct
                    ? `<button type="button"
                        class="pendencias-expedicao-iniciar-montagem-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-violet-100 text-violet-800 hover:bg-violet-200 whitespace-nowrap"
                        data-project-id="${row.id}">
                        Iniciar Montagem Externa
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-expedicao-iniciar-montagem-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    await iniciarMontagemExternaForProject(Number(button.dataset.projectId), {
                        onSuccess: loadPendenciasExpedicao
                    });
                });
            });
        }
    });
}
