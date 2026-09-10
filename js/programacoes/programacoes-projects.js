function isMissingProjectProductionQueueError(error) {
    const message = String(error?.message || error || '');
    return /projectproductionqueue/i.test(message)
        && /could not find|does not exist|schema cache|não encontr/i.test(message);
}

function getProgramacoesProjectsSelect() {
    const orderEmbed = typeof getOrderSalesOrderEmbed === 'function'
        ? getOrderSalesOrderEmbed('clientDeliveryDate')
        : 'order:salesOrders(id, orderCode, clientId, clientDeliveryDate, client:Client(name))';
    const base = typeof getPendenciasProjectSelect === 'function'
        ? getPendenciasProjectSelect({ orderExtraFields: 'clientDeliveryDate' })
        : `
        id, orderId, projectCode, name, designerId, statusId, deliveryDate, deliveryPhaseId,
        ${orderEmbed},
        designer:appUsers!OrderProject_designerId_fkey(id, name),
        projectStatus:OrderProjectStatus(id, name)
    `;

    return `${base}, isComplementary, isReplaced, productionMonth`;
}

function formatProgramacoesDateLabel(dateStr) {
    if (typeof formatPendenciasDeliveryDate === 'function') {
        return formatPendenciasDeliveryDate(dateStr);
    }
    if (!dateStr) return '—';
    const normalized = String(dateStr).slice(0, 10);
    const [year, month, day] = normalized.split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return String(dateStr);
}

function getProgramacoesClientDeliveryPhase(project, phasesByOrderId = {}) {
    const phases = phasesByOrderId[Number(project?.orderId)] || [];
    if (phases.length < 2) return null;
    const phaseId = Number(project?.deliveryPhaseId);
    return (phaseId
        ? phases.find(item => Number(item.id) === phaseId)
        : phases[0]) || null;
}

function getProgramacoesClientDeliveryDate(project, phasesByOrderId = {}) {
    const phase = getProgramacoesClientDeliveryPhase(project, phasesByOrderId);
    if (phase?.deliveryDate) return phase.deliveryDate;
    return project?.order?.clientDeliveryDate || null;
}

function getProgramacoesLockedDesigner(user = currentUser) {
    if (!user || user.role !== 'Projetista') return null;
    if (typeof isGestorProjetos === 'function' && isGestorProjetos(user)) return null;
    return user;
}

function filterProgramacoesQueueForViewer(queueRows = []) {
    const designer = getProgramacoesLockedDesigner();
    if (!designer?.id) return queueRows;
    return queueRows.filter(row => Number(row.orderProject?.designerId) === Number(designer.id));
}

function formatProgramacoesProductionMonthLabel(productionMonth) {
    if (typeof toProgramacaoProducaoMonthInputValue === 'function'
        && typeof formatProgramacaoProducaoMonthLabel === 'function') {
        return formatProgramacaoProducaoMonthLabel(toProgramacaoProducaoMonthInputValue(productionMonth));
    }

    if (!productionMonth) return '—';
    const part = String(productionMonth).split('T')[0];
    const [year, month] = part.split('-');
    if (!year || !month) return '—';
    const date = new Date(Number(year), Number(month) - 1, 1);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

async function fetchProgramacoesProjectsQueue() {
    const result = await supabaseClient
        .from('ProjectProductionQueue')
        .select(`
            id,
            sequence,
            orderProjectId,
            orderProject:OrderProject!orderProjectId(${getProgramacoesProjectsSelect()})
        `)
        .order('sequence', { ascending: true });

    if (result.error) return result;

    const rows = (result.data || [])
        .map(item => {
            const project = item.orderProject;
            if (!project || Array.isArray(project)) return null;
            return {
                ...item,
                orderProject: project
            };
        })
        .filter(Boolean);

    const projects = rows.map(row => row.orderProject);
    const activeProjects = typeof excludeInactivePendenciasProjects === 'function'
        ? excludeInactivePendenciasProjects(projects)
        : projects;
    const activeIds = new Set(activeProjects.map(project => Number(project.id)));

    return {
        ...result,
        data: rows.filter(row => activeIds.has(Number(row.orderProject.id)))
    };
}

function renderProgramacoesSequenceCell(row, options = {}) {
    const maxSequence = Number(options.maxSequence) || Number(row.sequence) || 1;
    if (!options.canReorder) {
        return escapeHtml(String(row.sequence || '—'));
    }

    return `<input type="number"
        class="programacoes-seq-input"
        min="1"
        max="${maxSequence}"
        step="1"
        value="${Number(row.sequence) || 1}"
        data-order-project-id="${Number(row.orderProjectId)}"
        data-current-sequence="${Number(row.sequence) || 1}"
        title="Posição na fila completa (não na lista filtrada). Enter confirma."
        aria-label="Sequência na fila">`;
}

function bindProgramacoesSequenceInputs(tbody) {
    tbody?.querySelectorAll('.programacoes-seq-input').forEach(input => {
        const restore = () => {
            input.value = input.dataset.currentSequence || '';
        };

        input.addEventListener('click', event => event.stopPropagation());
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                input.blur();
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                restore();
                input.blur();
            }
        });
        input.addEventListener('blur', () => {
            const orderProjectId = Number(input.dataset.orderProjectId);
            const current = Number(input.dataset.currentSequence);
            const raw = String(input.value || '').trim();
            if (!raw) {
                restore();
                return;
            }
            const next = Math.round(Number(raw));
            if (!orderProjectId || !Number.isFinite(next)) {
                restore();
                return;
            }
            if (next === current) return;
            moveProgramacoesProjectToPosition(orderProjectId, next);
        });
        input.addEventListener('wheel', event => {
            if (document.activeElement === input) event.preventDefault();
        }, { passive: false });
    });
}

function renderProgramacoesMoveButtons(row, options = {}) {
    const { isFirst, isLast } = options;
    return `
        <div class="programacoes-priority-actions">
            <button type="button"
                class="programacoes-move-btn"
                data-direction="up"
                data-order-project-id="${Number(row.orderProjectId)}"
                ${isFirst ? 'disabled' : ''}
                title="Subir prioridade"
                aria-label="Subir prioridade">
                ▲
            </button>
            <button type="button"
                class="programacoes-move-btn"
                data-direction="down"
                data-order-project-id="${Number(row.orderProjectId)}"
                ${isLast ? 'disabled' : ''}
                title="Descer prioridade"
                aria-label="Descer prioridade">
                ▼
            </button>
        </div>
    `;
}

function renderProgramacoesProjectsTable(queueRows = [], phasesByOrderId = {}) {
    const content = document.getElementById('programacoes-content');
    if (!content) return;

    const canReorder = typeof canReorderProgramacoesProjects === 'function'
        && canReorderProgramacoesProjects();
    const lockedDesigner = getProgramacoesLockedDesigner();
    const maxSequence = queueRows.reduce((max, row) => Math.max(max, Number(row.sequence) || 0), 0);

    const rows = queueRows.map(item => {
        const project = item.orderProject;
        const statusName = typeof getPendenciasProjectStatusName === 'function'
            ? getPendenciasProjectStatusName(project)
            : (project?.projectStatus?.name || '—');
        const clientDeliveryPhase = getProgramacoesClientDeliveryPhase(project, phasesByOrderId);
        const clientDeliveryDate = getProgramacoesClientDeliveryDate(project, phasesByOrderId);
        const clientDeliveryLabel = formatProgramacoesDateLabel(clientDeliveryDate);
        const projectDeliveryDate = project?.deliveryDate || null;
        const projectDeliveryLabel = formatProgramacoesDateLabel(projectDeliveryDate);
        const productionMonth = project?.productionMonth || null;
        const productionMonthLabel = formatProgramacoesProductionMonthLabel(productionMonth);

        return (typeof mapPendenciasInteractiveIdentity === 'function'
            ? mapPendenciasInteractiveIdentity(project, {
                id: project.id,
                orderProjectId: Number(item.orderProjectId || project.id),
                sequence: Number(item.sequence) || 0,
                statusName,
                clientDeliveryLabel,
                clientDeliveryDate,
                clientDeliveryPhaseName: clientDeliveryPhase?.name || '',
                projectDeliveryLabel,
                projectDeliveryDate,
                productionMonth,
                productionMonthLabel,
                designerName: project?.designer?.name || '—'
            })
            : {
                id: project.id,
                orderProjectId: Number(item.orderProjectId || project.id),
                sequence: Number(item.sequence) || 0,
                orderCode: project?.order?.orderCode || '—',
                clientName: project?.order?.client?.name || '—',
                projectName: project?.name || '—',
                statusName,
                designerName: project?.designer?.name || '—',
                clientDeliveryLabel,
                clientDeliveryDate,
                clientDeliveryPhaseName: clientDeliveryPhase?.name || '',
                projectDeliveryLabel,
                projectDeliveryDate,
                productionMonth,
                productionMonthLabel
            });
    });

    const columns = [
        {
            key: 'sequence',
            label: 'Seq.',
            title: 'Sequência',
            type: 'number',
            thClass: 'programacoes-col-seq whitespace-nowrap',
            cellClass: 'programacoes-col-seq px-1 py-2 text-xs font-semibold text-slate-700 tabular-nums text-center whitespace-nowrap',
            filterInputClass: 'interactive-table-filter-input--compact',
            getFilterValue: row => String(row.sequence || ''),
            render: (row) => renderProgramacoesSequenceCell(row, { canReorder, maxSequence })
        },
        {
            key: 'orderCode',
            label: 'Pedido',
            thClass: 'programacoes-col-order whitespace-nowrap',
            cellClass: 'programacoes-col-order px-2 py-2 text-xs font-mono text-slate-600 whitespace-nowrap',
            filterInputClass: 'interactive-table-filter-input--compact'
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
            key: 'designerName',
            label: 'Projetista',
            cellClass: 'p-3 text-xs text-slate-700',
            ...(lockedDesigner ? {
                filterLocked: true,
                lockedFilterValue: lockedDesigner.name || ''
            } : {})
        },
        {
            key: 'clientDeliveryLabel',
            label: 'Dt Entrg. Cli.',
            title: 'Data de entrega no cliente (fase do projeto, se houver)',
            thClass: 'whitespace-nowrap',
            cellClass: 'p-3 text-xs text-slate-600 whitespace-nowrap',
            getFilterValue: row => [
                row.clientDeliveryLabel,
                row.clientDeliveryDate,
                row.clientDeliveryPhaseName
            ].filter(Boolean).join(' '),
            render: (row) => {
                const label = row.clientDeliveryLabel || '—';
                const phaseName = String(row.clientDeliveryPhaseName || '').trim();
                const title = phaseName
                    ? `${phaseName}: ${label}`
                    : 'Data de entrega no cliente';
                const phaseHtml = phaseName
                    ? `<span class="block text-[10px] leading-tight text-slate-400 font-medium">${escapeHtml(phaseName)}</span>`
                    : '';
                return `<span title="${escapeHtml(title)}">${escapeHtml(label)}${phaseHtml}</span>`;
            }
        },
        {
            key: 'projectDeliveryLabel',
            label: 'Dt Proj.',
            title: 'Data de entrega do projeto',
            thClass: 'whitespace-nowrap',
            cellClass: 'p-3 text-xs text-slate-600 whitespace-nowrap',
            getFilterValue: row => [row.projectDeliveryLabel, row.projectDeliveryDate].filter(Boolean).join(' ')
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

    if (canReorder) {
        columns.push({
            key: 'priority',
            label: 'Prioridade',
            type: 'action',
            align: 'right',
            thClass: 'w-24',
            cellClass: 'p-3 text-right whitespace-nowrap',
            render: (row) => renderProgramacoesMoveButtons(row, {
                isFirst: Number(row.sequence) <= 1,
                isLast: Number(row.sequence) >= maxSequence
            })
        });
    }

    if (typeof renderPendenciasInteractiveTableScreen !== 'function') {
        content.innerHTML = '<p class="text-xs text-red-500 text-center py-8 px-4">Componente de tabela indisponível.</p>';
        return;
    }

    renderPendenciasInteractiveTableScreen(content, {
        title: 'Projetos',
        subtitle: lockedDesigner
            ? 'Seus projetos na fila para produção. Quanto mais acima, maior a prioridade.'
            : 'Prioridade do time de projetos para entregar à produção. Quanto mais acima, maior a prioridade.',
        refreshButtonId: 'btn-programacoes-refresh-projects',
        headerActionsHtml: typeof PROGRAMACOES_FULLSCREEN_BUTTON_HTML === 'string'
            ? PROGRAMACOES_FULLSCREEN_BUTTON_HTML
            : '',
        onRefresh: loadProgramacoesProjects,
        tableId: 'programacoes-projects',
        rows,
        columns,
        disableSort: true,
        minWidth: '76rem',
        emptyMessage: lockedDesigner
            ? 'Nenhum projeto seu na fila de programação.'
            : 'Nenhum projeto na fila de programação.',
        onBind(tbody) {
            if (typeof syncProgramacoesFullscreenButton === 'function') {
                syncProgramacoesFullscreenButton();
            }
            if (!canReorder) return;
            bindProgramacoesSequenceInputs(tbody);
            tbody?.querySelectorAll('.programacoes-move-btn').forEach(button => {
                button.addEventListener('click', () => {
                    const orderProjectId = Number(button.dataset.orderProjectId);
                    const direction = button.dataset.direction;
                    if (!orderProjectId || !direction) return;
                    moveProgramacoesProject(orderProjectId, direction);
                });
            });
        }
    });
    if (typeof syncProgramacoesFullscreenButton === 'function') {
        syncProgramacoesFullscreenButton();
    }
}

async function moveProgramacoesProject(orderProjectId, direction) {
    if (typeof canReorderProgramacoesProjects === 'function' && !canReorderProgramacoesProjects()) {
        return;
    }

    if (typeof setProgramacoesActionLoading === 'function') {
        setProgramacoesActionLoading(true, 'Atualizando prioridade...');
    }

    try {
        const { error } = await supabaseClient.rpc('reorder_project_production_queue', {
            p_order_project_id: Number(orderProjectId),
            p_direction: direction
        });
        if (error) throw error;
        await loadProgramacoesProjects({ silent: true });
    } catch (error) {
        console.error('moveProgramacoesProject:', error);
        const message = isMissingProjectProductionQueueError(error)
            || /could not find the function/i.test(String(error?.message || ''))
            ? 'Execute o SQL pendente da fila de programações no SQL Editor do DEV.'
            : (error?.message || 'Não foi possível reordenar o projeto.');
        alertAppDialog(message);
    } finally {
        if (typeof setProgramacoesActionLoading === 'function') {
            setProgramacoesActionLoading(false);
        }
    }
}

async function moveProgramacoesProjectToPosition(orderProjectId, sequence) {
    if (typeof canReorderProgramacoesProjects === 'function' && !canReorderProgramacoesProjects()) {
        return;
    }

    if (typeof setProgramacoesActionLoading === 'function') {
        setProgramacoesActionLoading(true, 'Atualizando prioridade...');
    }

    try {
        const { error } = await supabaseClient.rpc('move_project_production_queue_to_position', {
            p_order_project_id: Number(orderProjectId),
            p_sequence: Number(sequence)
        });
        if (error) throw error;
        await loadProgramacoesProjects({ silent: true });
    } catch (error) {
        console.error('moveProgramacoesProjectToPosition:', error);
        const message = isMissingProjectProductionQueueError(error)
            || /could not find the function/i.test(String(error?.message || ''))
            ? 'Execute supabase/feats/move-project-production-queue-to-position.sql no SQL Editor do DEV.'
            : (error?.message || 'Não foi possível alterar a sequência.');
        alertAppDialog(message);
        await loadProgramacoesProjects({ silent: true });
    } finally {
        if (typeof setProgramacoesActionLoading === 'function') {
            setProgramacoesActionLoading(false);
        }
    }
}

async function loadProgramacoesProjects(options = {}) {
    const content = document.getElementById('programacoes-content');
    if (!content) return;

    if (!options.silent) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando programações...</p>';
    }

    const result = await fetchProgramacoesProjectsQueue();
    if (result.error) {
        console.error('loadProgramacoesProjects:', result.error);
        const message = isMissingProjectProductionQueueError(result.error)
            ? 'Execute supabase/feats/create-project-production-queue.sql no SQL Editor do DEV.'
            : `Erro ao carregar: ${result.error.message}`;
        content.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 class="font-bold text-sm text-slate-900">Projetos</h3>
                </div>
                <p class="text-xs text-red-500 text-center py-10 px-4">${escapeHtml(message)}</p>
            </div>
        `;
        return;
    }

    const queueRows = filterProgramacoesQueueForViewer(result.data || []);
    const projects = queueRows.map(row => row.orderProject);
    const phasesByOrderId = typeof fetchPhasesByOrderIdForPendenciasProjects === 'function'
        ? await fetchPhasesByOrderIdForPendenciasProjects(projects)
        : {};

    renderProgramacoesProjectsTable(queueRows, phasesByOrderId);
}

window.loadProgramacoesProjects = loadProgramacoesProjects;
