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
    const rows = (projects || []).map(project => mapPendenciasInteractiveIdentity(project, {
        deliveryLabel: formatPendenciasProjectDeliveryDate(project, phasesByOrderId),
        deliveryDate: typeof getPendenciasProjectEffectiveDeliveryDate === 'function'
            ? getPendenciasProjectEffectiveDeliveryDate(project, phasesByOrderId)
            : project.deliveryDate,
        projectNameRaw: project.name || ''
    }));

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Aguardando Entrega Técnica',
        subtitle: 'Projetos aguardando confirmação de entrega pelo gestor comercial.',
        refreshButtonId: 'pendencias-entrega-tecnica-refresh-btn',
        onRefresh: loadPendenciasAguardandoEntregaTecnica,
        tableId: 'pendencias-aguardando-entrega-tecnica',
        rows,
        emptyMessage: 'Nenhum projeto aguardando entrega técnica.',
        columns: [
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
        ],
        onBind(tbody) {
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
        }
    });
}
