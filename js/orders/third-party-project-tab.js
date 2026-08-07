let orderThirdPartyProjectsCache = [];

const THIRD_PARTY_TAB_ACTION_OVERLAY = createModalOverlayConfig('third-party-tab-action');

function isThirdPartyPendenciasViewVisible() {
    const view = document.getElementById('pendencias-view');
    return Boolean(view && !view.classList.contains('hidden'));
}

function isThirdPartyOrderTabVisible() {
    const panel = document.getElementById('order-tab-panel-third-party');
    return Boolean(panel && !panel.classList.contains('hidden'));
}

function setThirdPartyProjectActionLoading(active, message = 'Processando...', status = 'loading') {
    if (isThirdPartyPendenciasViewVisible() && typeof setPendenciasActionLoading === 'function') {
        setPendenciasActionLoading(active, message, status);
        return;
    }

    if (isThirdPartyOrderTabVisible()) {
        setModalOverlayLoading(THIRD_PARTY_TAB_ACTION_OVERLAY, active, message, status);
    }
}

function waitThirdPartyProjectActionStatus(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatThirdPartyProjectDateTime(value) {
    if (!value) return '—';
    if (typeof formatGestaoDateTime === 'function') {
        return formatGestaoDateTime(value);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function renderOrderThirdPartyProjectRow(project) {
    const statusLabel = getThirdPartyProjectStatusLabel(project.status);
    const statusClass = getThirdPartyProjectStatusBadgeClass(project.status);
    const projectName = project.orderProject?.name || 'Projeto';
    const subtypeName = project.thirdPartySubtype?.name || '—';
    const characteristicName = project.projectCharacteristic?.name || '—';
    const designerName = project.designer?.name || 'Sem projetista';

    const canReview = typeof canReviewThirdPartyProjectAsConsultor === 'function'
        && canReviewThirdPartyProjectAsConsultor(project);
    const canApprove = typeof canApproveThirdPartyProject === 'function'
        && canApproveThirdPartyProject(project);
    const canProjetistaRevision = typeof canResendThirdPartyProjectAsProjetista === 'function'
        && canResendThirdPartyProjectAsProjetista(project);

    const actionButtons = [
        `<button type="button"
            class="order-third-party-detail-btn text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium"
            data-third-party-project-id="${project.id}">
            Detalhe
        </button>`,
        `<button type="button"
            class="order-third-party-history-btn text-xs bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-2.5 py-1 rounded-lg font-medium"
            data-third-party-project-id="${project.id}">
            Histórico
        </button>`,
        `<button type="button"
            class="order-third-party-revisions-btn text-xs bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 px-2.5 py-1 rounded-lg font-medium"
            data-third-party-project-id="${project.id}">
            Revisões
        </button>`
    ];

    if (canReview) {
        actionButtons.push(`<button type="button"
            class="order-third-party-review-btn text-xs bg-violet-700 text-white hover:bg-violet-800 px-2.5 py-1 rounded-lg font-medium"
            data-third-party-project-id="${project.id}">
            Revisar
        </button>`);
    }
    if (canApprove) {
        actionButtons.push(`<button type="button"
            class="order-third-party-approve-btn text-xs bg-emerald-700 text-white hover:bg-emerald-800 px-2.5 py-1 rounded-lg font-medium"
            data-third-party-project-id="${project.id}">
            Aprovar
        </button>`);
    }
    if (canProjetistaRevision) {
        actionButtons.push(`<button type="button"
            class="order-third-party-review-btn text-xs bg-amber-700 text-white hover:bg-amber-800 px-2.5 py-1 rounded-lg font-medium"
            data-third-party-project-id="${project.id}">
            Revisar
        </button>`);
    }

    return `
        <tr data-third-party-project-id="${project.id}">
            <td class="p-3">
                <div class="font-medium text-slate-800">${escapeHtml(projectName)}</div>
                ${project.orderProject?.projectCode ? `<div class="text-[10px] text-slate-400">${escapeHtml(project.orderProject.projectCode)}</div>` : ''}
            </td>
            <td class="p-3 text-slate-700">${escapeHtml(subtypeName)}</td>
            <td class="p-3 text-slate-600">${escapeHtml(characteristicName)}</td>
            <td class="p-3">
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">
                    ${escapeHtml(statusLabel)}
                </span>
            </td>
            <td class="p-3 text-slate-600">${escapeHtml(designerName)}</td>
            <td class="p-3">
                <div class="flex flex-wrap gap-1.5">
                    ${actionButtons.join('')}
                </div>
            </td>
        </tr>
    `;
}

function renderOrderThirdPartyProjectsList(projects = []) {
    const container = document.getElementById('order-third-party-projects-list');
    if (!container) return;

    if (!projects.length) {
        container.innerHTML = `
            <p class="text-xs text-slate-400 text-center py-8">
                Nenhum projeto de terceiros para este pedido.
            </p>
        `;
        return;
    }

    container.innerHTML = `
        <div class="overflow-x-auto border border-slate-200 rounded-xl">
            <table class="w-full text-sm">
                <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th class="text-left p-3 font-semibold">Projeto</th>
                        <th class="text-left p-3 font-semibold">Subtipo</th>
                        <th class="text-left p-3 font-semibold">Característica</th>
                        <th class="text-left p-3 font-semibold">Status</th>
                        <th class="text-left p-3 font-semibold">Projetista</th>
                        <th class="text-left p-3 font-semibold w-56">Ações</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${projects.map(renderOrderThirdPartyProjectRow).join('')}
                </tbody>
            </table>
        </div>
    `;

    container.querySelectorAll('.order-third-party-detail-btn').forEach(button => {
        button.addEventListener('click', () => {
            const projectId = Number(button.dataset.thirdPartyProjectId);
            const project = orderThirdPartyProjectsCache.find(item => Number(item.id) === projectId);
            if (project) openThirdPartyProjectDetailModal(project);
        });
    });

    container.querySelectorAll('.order-third-party-history-btn').forEach(button => {
        button.addEventListener('click', () => {
            const projectId = Number(button.dataset.thirdPartyProjectId);
            const project = orderThirdPartyProjectsCache.find(item => Number(item.id) === projectId);
            if (project) openThirdPartyProjectStatusHistoryModal(project);
        });
    });

    container.querySelectorAll('.order-third-party-review-btn').forEach(button => {
        button.addEventListener('click', () => {
            openThirdPartyProjectRevisionModal(Number(button.dataset.thirdPartyProjectId));
        });
    });

    container.querySelectorAll('.order-third-party-approve-btn').forEach(button => {
        button.addEventListener('click', () => {
            approveThirdPartyProject(Number(button.dataset.thirdPartyProjectId));
        });
    });

    container.querySelectorAll('.order-third-party-revisions-btn').forEach(button => {
        button.addEventListener('click', () => {
            openThirdPartyRevisionsHistoryModal(Number(button.dataset.thirdPartyProjectId));
        });
    });
}

async function loadOrderThirdPartyProjectsTab(orderId = activeOrderId) {
    const container = document.getElementById('order-third-party-projects-list');
    const normalizedId = Number(orderId);

    if (!normalizedId) {
        orderThirdPartyProjectsCache = [];
        renderOrderThirdPartyProjectsList([]);
        return [];
    }

    if (container) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando projetos de terceiros...</p>';
    }

    try {
        orderThirdPartyProjectsCache = await fetchThirdPartyProjectsByOrderId(normalizedId);
        renderOrderThirdPartyProjectsList(orderThirdPartyProjectsCache);
    } catch (error) {
        console.error('loadOrderThirdPartyProjectsTab:', error);
        orderThirdPartyProjectsCache = [];
        if (container) {
            container.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar projetos de terceiros: ${escapeHtml(error.message)}</p>`;
        }
    }

    const countEl = document.getElementById('order-tab-third-party-count');
    if (countEl) {
        countEl.textContent = `(${orderThirdPartyProjectsCache.length})`;
    }

    return orderThirdPartyProjectsCache;
}

function openThirdPartyProjectDetailModal(project) {
    const modal = document.getElementById('third-party-project-detail-modal');
    if (!modal || !project) return;

    const statusLabel = getThirdPartyProjectStatusLabel(project.status);
    const statusClass = getThirdPartyProjectStatusBadgeClass(project.status);

    document.getElementById('third-party-project-detail-title').textContent = getThirdPartyProjectLabel(project);
    document.getElementById('third-party-project-detail-subtitle').textContent =
        `Pedido ${project.order?.orderCode || '—'} · ${getOrderClientName(project.order) || '—'}`;

    document.getElementById('third-party-project-detail-status').innerHTML =
        `<span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(statusLabel)}</span>`;

    document.getElementById('third-party-project-detail-project').textContent =
        project.orderProject?.name || '—';
    document.getElementById('third-party-project-detail-subtype').textContent =
        project.thirdPartySubtype?.name || '—';
    document.getElementById('third-party-project-detail-characteristic').textContent =
        project.projectCharacteristic?.name || '—';
    document.getElementById('third-party-project-detail-designer').textContent =
        project.designer?.name || 'Sem projetista';
    document.getElementById('third-party-project-detail-path').textContent =
        project.filePath || '—';
    document.getElementById('third-party-project-detail-sent-at').textContent =
        formatThirdPartyProjectDateTime(project.sentAt);
    document.getElementById('third-party-project-detail-approved-at').textContent =
        formatThirdPartyProjectDateTime(project.approvedAt);

    const historyBtn = document.getElementById('btn-third-party-project-detail-history');
    if (historyBtn) {
        historyBtn.dataset.thirdPartyProjectId = String(project.id);
    }

    toggleModal('third-party-project-detail-modal', true);
}

function showThirdPartyProjectsCreatedModal(createdProjects = []) {
    const listEl = document.getElementById('third-party-projects-created-list');
    if (!listEl) return;

    if (!createdProjects.length) return;

    listEl.innerHTML = createdProjects.map(project => {
        const projectName = project.orderProject?.name || 'Projeto';
        const subtypeName = project.thirdPartySubtype?.name || 'Terceiro';
        const characteristicName = project.projectCharacteristic?.name || '—';
        return `
            <li class="text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/60">
                <span class="font-semibold text-slate-900">${escapeHtml(projectName)}</span>
                · ${escapeHtml(subtypeName)}
                <span class="text-slate-500">(${escapeHtml(characteristicName)})</span>
            </li>
        `;
    }).join('');

    toggleModal('third-party-projects-created-modal', true);
}

function bindThirdPartyProjectTabEvents() {
    document.getElementById('btn-close-third-party-project-detail')?.addEventListener('click', () => {
        toggleModal('third-party-project-detail-modal', false);
    });
    document.getElementById('btn-close-third-party-project-detail-footer')?.addEventListener('click', () => {
        toggleModal('third-party-project-detail-modal', false);
    });
    document.getElementById('btn-third-party-project-detail-history')?.addEventListener('click', () => {
        const projectId = Number(document.getElementById('btn-third-party-project-detail-history')?.dataset.thirdPartyProjectId);
        const project = orderThirdPartyProjectsCache.find(item => Number(item.id) === projectId);
        if (project) openThirdPartyProjectStatusHistoryModal(project);
    });

    document.getElementById('btn-close-third-party-projects-created')?.addEventListener('click', () => {
        toggleModal('third-party-projects-created-modal', false);
    });
    document.getElementById('btn-close-third-party-projects-created-footer')?.addEventListener('click', () => {
        toggleModal('third-party-projects-created-modal', false);
    });
}
