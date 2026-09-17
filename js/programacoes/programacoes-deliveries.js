const PROGRAMACOES_DELIVERIES_STATUS_START = 'Aguardando Projeto Técnico';
const PROGRAMACOES_DELIVERIES_STATUS_END = 'Expedição';

async function getProgramacoesDeliveriesStatusRange() {
    const { data: statuses, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name, sortOrder')
        .order('sortOrder', { ascending: true });

    if (error) {
        console.error('getProgramacoesDeliveriesStatusRange:', error);
        return { statusIds: [], statusById: {} };
    }

    const startStatus = (statuses || []).find(
        status => status.name === PROGRAMACOES_DELIVERIES_STATUS_START
    );
    const endStatus = (statuses || []).find(
        status => status.name === PROGRAMACOES_DELIVERIES_STATUS_END
    );

    if (startStatus?.sortOrder == null || endStatus?.sortOrder == null) {
        return { statusIds: [], statusById: {} };
    }

    const minSort = Number(startStatus.sortOrder);
    const maxSort = Number(endStatus.sortOrder);

    const inRange = (statuses || []).filter(status => {
        const sortOrder = Number(status.sortOrder);
        return sortOrder >= minSort && sortOrder <= maxSort;
    });

    return {
        statusIds: inRange.map(status => status.id),
        statusById: Object.fromEntries(inRange.map(status => [status.id, status]))
    };
}

function filterProgramacoesDeliveriesForViewer(projects = []) {
    const designer = typeof getProgramacoesLockedDesigner === 'function'
        ? getProgramacoesLockedDesigner()
        : null;
    if (!designer?.id) return projects;
    return projects.filter(project => Number(project.designerId) === Number(designer.id));
}

function formatProgramacoesDeliveriesDeliveryLabel(project, phasesByOrderId = {}) {
    const phases = phasesByOrderId[Number(project?.orderId)] || [];
    const dateStr = typeof getProgramacoesClientDeliveryDate === 'function'
        ? getProgramacoesClientDeliveryDate(project, phasesByOrderId)
        : (project?.order?.clientDeliveryDate || null);
    const dateLabel = typeof formatProgramacoesDateLabel === 'function'
        ? formatProgramacoesDateLabel(dateStr)
        : (dateStr || '—');

    if (!phases.length) return dateLabel;

    let phase = null;
    if (phases.length >= 2 && typeof getProgramacoesClientDeliveryPhase === 'function') {
        phase = getProgramacoesClientDeliveryPhase(project, phasesByOrderId);
    } else if (phases.length === 1) {
        phase = phases[0];
    }

    const phaseName = String(phase?.name || '').trim();
    if (!phaseName) return dateLabel;
    return `${phaseName}: ${dateLabel}`;
}

async function fetchProgramacoesDeliveriesProjects() {
    const { statusIds } = await getProgramacoesDeliveriesStatusRange();
    if (!statusIds.length) {
        return {
            data: [],
            error: new Error(
                `Status "${PROGRAMACOES_DELIVERIES_STATUS_START}" ou "${PROGRAMACOES_DELIVERIES_STATUS_END}" não encontrado.`
            )
        };
    }

    const select = typeof getProgramacoesProjectsSelect === 'function'
        ? getProgramacoesProjectsSelect()
        : getPendenciasProjectSelect({ orderExtraFields: 'clientDeliveryDate' });

    let result = await supabaseClient
        .from('OrderProject')
        .select(select)
        .in('statusId', statusIds);

    if (result.error?.message && typeof isOrderProjectTechnicalForecastColumnError === 'function'
        && isOrderProjectTechnicalForecastColumnError(result.error.message)) {
        result = await supabaseClient
            .from('OrderProject')
            .select(getPendenciasProjectSelect({
                includeStatus: true,
                includeDesigner: true,
                includeAwaitingConstructionNote: false,
                orderExtraFields: 'clientDeliveryDate'
            }) + ', isComplementary, isReplaced, productionMonth')
            .in('statusId', statusIds);
    }

    if (result.error) return result;

    let projects = result.data || [];

    if (typeof enrichPendenciasProjectsWithStatus === 'function') {
        projects = await enrichPendenciasProjectsWithStatus(projects);
    }
    if (typeof enrichPendenciasProjectsWithConsultantUserId === 'function') {
        projects = await enrichPendenciasProjectsWithConsultantUserId(projects);
    }
    if (typeof excludeInactivePendenciasProjects === 'function') {
        projects = excludeInactivePendenciasProjects(projects);
    }

    projects = filterProgramacoesDeliveriesForViewer(projects);

    return { ...result, data: projects };
}

function renderProgramacoesDeliveriesTable(projects = [], phasesByOrderId = {}) {
    const content = document.getElementById('programacoes-content');
    if (!content) return;

    const lockedDesigner = typeof getProgramacoesLockedDesigner === 'function'
        ? getProgramacoesLockedDesigner()
        : null;

    const rows = projects.map(project => {
        const statusName = typeof getPendenciasProjectStatusName === 'function'
            ? getPendenciasProjectStatusName(project)
            : (project?.projectStatus?.name || '—');
        const clientDeliveryDate = typeof getProgramacoesClientDeliveryDate === 'function'
            ? getProgramacoesClientDeliveryDate(project, phasesByOrderId)
            : (project?.order?.clientDeliveryDate || null);
        const deliveryLabel = formatProgramacoesDeliveriesDeliveryLabel(project, phasesByOrderId);
        const clientDeliveryPhase = typeof getProgramacoesClientDeliveryPhase === 'function'
            ? getProgramacoesClientDeliveryPhase(project, phasesByOrderId)
            : null;
        const clientDeliveryPhaseName = clientDeliveryPhase?.name
            || (phasesByOrderId[Number(project?.orderId)]?.length === 1
                ? phasesByOrderId[Number(project.orderId)][0]?.name
                : '');
        const productionMonth = project?.productionMonth || null;
        const productionMonthLabel = typeof formatProgramacoesProductionMonthLabel === 'function'
            ? formatProgramacoesProductionMonthLabel(productionMonth)
            : '—';
        const consultantName = typeof getOrderConsultantNameFromRecord === 'function'
            ? (getOrderConsultantNameFromRecord(project?.order) || '—')
            : (project?.order?.consultor?.name || '—');

        const base = {
            id: project.id,
            orderCode: project?.order?.orderCode || '—',
            clientName: project?.order?.client?.name || '—',
            projectName: project?.name || '—',
            statusName,
            deliveryLabel,
            deliveryDate: clientDeliveryDate,
            clientDeliveryPhaseName: String(clientDeliveryPhaseName || '').trim(),
            consultantName,
            designerName: project?.designer?.name || '—',
            productionMonth,
            productionMonthLabel
        };

        return typeof mapPendenciasInteractiveIdentity === 'function'
            ? mapPendenciasInteractiveIdentity(project, base)
            : base;
    });

    const columns = [
        {
            key: 'orderCode',
            label: 'Pedido',
            thClass: 'whitespace-nowrap',
            cellClass: 'px-2 py-2 text-xs font-mono text-slate-600 whitespace-nowrap'
        },
        {
            key: 'clientName',
            label: 'Cliente',
            cellClass: 'p-3 text-xs text-slate-600'
        },
        {
            key: 'projectName',
            label: 'Projeto',
            cellClass: 'p-3 text-xs font-medium text-slate-800'
        },
        typeof getPendenciasInteractiveStatusColumn === 'function'
            ? getPendenciasInteractiveStatusColumn({
                thClass: 'whitespace-nowrap',
                cellClass: 'p-3 whitespace-nowrap',
                render: (row) => {
                    const statusName = row.statusName || '—';
                    const statusClass = row.statusClass
                        || (typeof getPendenciasProjectStatusBadgeClass === 'function'
                            ? getPendenciasProjectStatusBadgeClass(statusName)
                            : 'bg-slate-100 text-slate-600');
                    return `<span class="inline-flex items-center whitespace-nowrap text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(statusName)}</span>`;
                }
            })
            : { key: 'statusName', label: 'Status', cellClass: 'p-3 whitespace-nowrap' },
        {
            key: 'deliveryLabel',
            label: 'Data Entrega',
            title: 'Data de entrega no cliente (fase do projeto, se houver)',
            thClass: 'whitespace-nowrap',
            cellClass: 'p-3 text-xs text-slate-600 whitespace-nowrap',
            type: 'date',
            sortKey: 'deliveryDate',
            getSortValue: row => row.deliveryDate,
            getFilterValue: row => [
                row.deliveryLabel,
                row.deliveryDate,
                row.clientDeliveryPhaseName
            ].filter(Boolean).join(' '),
            render: (row) => {
                const label = row.deliveryLabel || '—';
                return `<span title="Data de entrega no cliente">${escapeHtml(label)}</span>`;
            }
        },
        {
            key: 'consultantName',
            label: 'Consultor',
            cellClass: 'p-3 text-xs text-slate-700'
        },
        {
            key: 'designerName',
            label: 'Projetista',
            cellClass: 'p-3 text-xs text-slate-700',
            ...(lockedDesigner ? {
                filterLocked: true,
                lockedFilterValue: lockedDesigner.name || ''
            } : {})
        },
        {
            key: 'productionMonthLabel',
            label: 'Mês Prog. Prod.',
            title: 'Mês Programação Produção',
            thClass: 'whitespace-nowrap',
            cellClass: 'p-3 text-xs text-slate-600 whitespace-nowrap',
            getFilterValue: row => [row.productionMonthLabel, row.productionMonth].filter(Boolean).join(' ')
        }
    ];

    if (typeof renderPendenciasInteractiveTableScreen !== 'function') {
        content.innerHTML = '<p class="text-xs text-red-500 text-center py-8 px-4">Componente de tabela indisponível.</p>';
        return;
    }

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Entregas',
        subtitle: lockedDesigner
            ? 'Projetos em andamento (do aguardando projeto técnico até expedição) sob sua responsabilidade.'
            : 'Projetos entre Aguardando Projeto Técnico e Expedição.',
        refreshButtonId: 'btn-programacoes-refresh-deliveries',
        headerActionsHtml: typeof PROGRAMACOES_FULLSCREEN_BUTTON_HTML === 'string'
            ? PROGRAMACOES_FULLSCREEN_BUTTON_HTML
            : '',
        onRefresh: loadProgramacoesDeliveries,
        tableId: 'programacoes-entregas',
        rows,
        columns,
        defaultSort: [
            { key: 'deliveryLabel', direction: 'asc' },
            { key: 'clientName', direction: 'asc' },
            { key: 'orderCode', direction: 'asc' },
            { key: 'projectName', direction: 'asc' }
        ],
        minWidth: '72rem',
        emptyMessage: lockedDesigner
            ? 'Nenhum projeto seu nesta faixa de status.'
            : 'Nenhum projeto entre Aguardando Projeto Técnico e Expedição.',
        onBind() {
            if (typeof syncProgramacoesFullscreenButton === 'function') {
                syncProgramacoesFullscreenButton();
            }
        }
    });
}

async function loadProgramacoesDeliveries(options = {}) {
    const content = document.getElementById('programacoes-content');
    if (!content) return;

    if (!options.silent) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando entregas...</p>';
    }

    const result = await fetchProgramacoesDeliveriesProjects();
    if (result.error) {
        console.error('loadProgramacoesDeliveries:', result.error);
        content.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 class="font-bold text-sm text-slate-900">Entregas</h3>
                </div>
                <p class="text-xs text-red-500 text-center py-10 px-4">${escapeHtml(result.error.message || 'Erro ao carregar.')}</p>
            </div>
        `;
        return;
    }

    const projects = result.data || [];
    const phasesByOrderId = typeof fetchPhasesByOrderIdForPendenciasProjects === 'function'
        ? await fetchPhasesByOrderIdForPendenciasProjects(projects)
        : {};

    renderProgramacoesDeliveriesTable(projects, phasesByOrderId);
}

window.loadProgramacoesDeliveries = loadProgramacoesDeliveries;
