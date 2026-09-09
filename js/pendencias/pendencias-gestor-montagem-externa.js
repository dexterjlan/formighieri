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

    const canAct = canActPendenciasGestorProjetosMontagemExterna();
    const rows = (projects || []).map(project => mapPendenciasInteractiveIdentity(project, {
        statusName: getPendenciasProjectStatusName(project)
    }));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Montagem Externa',
        subtitle: 'Projetos em montagem externa aguardando finalização.',
        refreshButtonId: 'pendencias-montagem-externa-refresh-btn',
        onRefresh: loadPendenciasMontagemExterna,
        tableId: 'pendencias-montagem-externa',
        rows,
        emptyMessage: 'Nenhum projeto em montagem externa.',
        columns: [
            ...getPendenciasInteractiveIdentityColumns(),
            getPendenciasInteractiveStatusColumn(),
            getPendenciasInteractiveActionColumn({
                render: (row) => canAct
                    ? `<button type="button"
                        class="pendencias-montagem-externa-finalizar-btn text-xs px-2.5 py-1 rounded-lg font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        data-project-id="${row.id}">
                        Finalizar
                    </button>`
                    : '<span class="text-xs text-slate-300">—</span>'
            })
        ],
        onBind(tbody) {
            tbody?.querySelectorAll('.pendencias-montagem-externa-finalizar-btn').forEach(button => {
                button.addEventListener('click', async () => {
                    await finalizePendenciasMontagemExterna(Number(button.dataset.projectId));
                });
            });
        }
    });
}

async function finalizePendenciasMontagemExterna(projectId) {
    if (typeof finalizeMontagemExternaForProject !== 'function') return;

    await finalizeMontagemExternaForProject(projectId, {
        onSuccess: loadPendenciasMontagemExterna
    });
}
