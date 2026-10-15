const PROGRAMACOES_MOBILE_LAYOUT_MQ = '(max-width: 767px), (max-height: 520px) and (max-width: 1024px) and ((hover: none) or (pointer: coarse))';

function normalizeProgramacoesMobileSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function renderProgramacoesMobileStatusHtml(row) {
    const statusName = row.statusName || '—';
    const statusClass = row.statusClass
        || (typeof getPendenciasProjectStatusBadgeClass === 'function'
            ? getPendenciasProjectStatusBadgeClass(statusName)
            : 'bg-slate-100 text-slate-600');
    const flag = typeof isOrderProjectAwaitingRequest === 'function'
        && row.project
        && isOrderProjectAwaitingRequest(row.project)
        && typeof renderOrderProjectAwaitingRequestFlagHtml === 'function'
        ? renderOrderProjectAwaitingRequestFlagHtml()
        : '';
    return `<span class="programacoes-projects-mobile__status">
        <span class="inline-flex items-center text-[10px] px-2 py-1 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(statusName)}</span>
        ${flag ? `<span class="programacoes-projects-mobile__status-flag">${flag}</span>` : ''}
    </span>`;
}

function renderProgramacoesMobileInlineField(label, value) {
    const text = value === null || value === undefined ? '' : String(value).trim();
    if (!text || text === '—') return '';
    return `
        <p class="programacoes-projects-mobile__detail-line">
            <span class="programacoes-projects-mobile__detail-label">${escapeHtml(label)}</span>
            <span class="programacoes-projects-mobile__detail-value">${escapeHtml(text)}</span>
        </p>
    `;
}

function renderProgramacoesMobileHeadlineHtml(row) {
    return `
        <p class="programacoes-projects-mobile__order">
            <span class="font-mono text-slate-500">${escapeHtml(String(row.orderCode || '—'))}</span>
            <span class="text-slate-300" aria-hidden="true">·</span>
            <span class="font-semibold text-slate-900">${escapeHtml(String(row.projectName || '—'))}</span>
        </p>
        <p class="programacoes-projects-mobile__client">${escapeHtml(String(row.clientName || '—'))}</p>
    `;
}

function renderProgramacoesMobileListScreen(content, config = {}) {
    const {
        screenId,
        title,
        subtitle = '',
        refreshButtonId,
        headerActionsHtml = '',
        onRefresh,
        rows = [],
        emptyMessage = 'Nenhum registro.',
        filteredEmptyMessage = 'Nenhum registro encontrado com a busca.',
        searchPlaceholder = 'Buscar pedido, cliente, projeto, status…',
        rowMatchesSearch,
        renderCard,
        onScreenReady,
        onListRendered
    } = config;

    if (!screenId || !content) return;

    const mountId = `${screenId}-mobile-mount`;
    const searchId = `${screenId}-mobile-search`;
    const countId = `${screenId}-mobile-count`;

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden programacoes-projects-mobile">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3">
                <div class="flex flex-wrap justify-between items-start gap-2">
                    <div class="min-w-0">
                        <h3 class="font-bold text-sm text-slate-900">${escapeHtml(title)}</h3>
                        ${subtitle ? `<p class="text-xs text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>` : ''}
                        <p class="programacoes-projects-mobile__preview-hint text-[11px] text-indigo-700/90 mt-1.5 font-medium">
                            Visualização em cartões no celular. No computador continua a tabela.
                        </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        ${headerActionsHtml}
                        ${refreshButtonId ? `<button type="button" id="${escapeHtml(refreshButtonId)}"
                            class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50 flex-1 sm:flex-none justify-center">
                            ${typeof renderRefreshButtonInnerHtml === 'function' ? renderRefreshButtonInnerHtml() : 'Atualizar'}
                        </button>` : ''}
                    </div>
                </div>
                <label class="programacoes-projects-mobile__search-wrap">
                    <span class="sr-only">Buscar na lista</span>
                    <input type="search"
                        id="${escapeHtml(searchId)}"
                        class="programacoes-projects-mobile__search"
                        placeholder="${escapeHtml(searchPlaceholder)}"
                        autocomplete="off"
                        enterkeyhint="search">
                </label>
                <p id="${escapeHtml(countId)}" class="programacoes-projects-mobile__count" aria-live="polite"></p>
            </div>
            <div id="${escapeHtml(mountId)}" class="programacoes-projects-mobile__list"></div>
        </div>
    `;

    if (refreshButtonId && onRefresh) {
        content.querySelector(`#${refreshButtonId}`)?.addEventListener('click', onRefresh);
    }
    if (typeof syncProgramacoesFullscreenButton === 'function') {
        syncProgramacoesFullscreenButton();
    }
    if (typeof onScreenReady === 'function') {
        onScreenReady(content);
    }

    const mountEl = document.getElementById(mountId);
    const searchInput = document.getElementById(searchId);
    const countEl = document.getElementById(countId);
    const matchRow = typeof rowMatchesSearch === 'function'
        ? rowMatchesSearch
        : () => true;
    const renderRowCard = typeof renderCard === 'function' ? renderCard : () => '';

    function renderList() {
        if (!mountEl) return;
        const queryNorm = normalizeProgramacoesMobileSearchText(searchInput?.value || '');
        const visible = rows.filter(row => matchRow(row, queryNorm));

        if (!rows.length) {
            mountEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-10 px-4">${escapeHtml(emptyMessage)}</p>`;
            if (countEl) countEl.textContent = '';
            return;
        }

        if (!visible.length) {
            mountEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-10 px-4">${escapeHtml(filteredEmptyMessage)}</p>`;
        } else {
            mountEl.innerHTML = visible.map(row => renderRowCard(row)).join('');
            if (typeof onListRendered === 'function') {
                onListRendered(mountEl, visible);
            }
        }

        if (countEl) {
            const total = rows.length;
            const shown = visible.length;
            countEl.textContent = shown === total
                ? `${total} registro${total === 1 ? '' : 's'}`
                : `${shown} de ${total} registros`;
        }
    }

    searchInput?.addEventListener('input', renderList);
    renderList();
}

let programacoesMobileLayoutWasMobile = typeof isMobileViewport === 'function' && isMobileViewport();

function refreshMobileDataListScreensIfVisible() {
    const programacoesView = document.getElementById('programacoes-view');
    if (programacoesView && !programacoesView.classList.contains('hidden')) {
        const section = typeof programacoesActiveSection !== 'undefined' ? programacoesActiveSection : '';
        if (section === 'projects' && typeof loadProgramacoesProjects === 'function') {
            loadProgramacoesProjects({ silent: true });
            return;
        }
        if (section === 'deliveries' && typeof loadProgramacoesDeliveries === 'function') {
            loadProgramacoesDeliveries({ silent: true });
            return;
        }
    }

    const requisicoesView = document.getElementById('requisicoes-view');
    if (requisicoesView && !requisicoesView.classList.contains('hidden')) {
        const section = typeof requisicoesActiveSection !== 'undefined' ? requisicoesActiveSection : '';
        if (section === 'assistance' && typeof loadAssistanceRequests === 'function') {
            loadAssistanceRequests({ silent: true });
            return;
        }
    }

    const view3dView = document.getElementById('view3d-view');
    if (view3dView && !view3dView.classList.contains('hidden') && typeof renderView3dResults === 'function') {
        renderView3dResults();
    }
}

function bindProgramacoesMobileLayoutModeRefresh() {
    if (window._programacoesMobileLayoutRefreshBound) return;
    window._programacoesMobileLayoutRefreshBound = true;

    const layoutMq = window.matchMedia(PROGRAMACOES_MOBILE_LAYOUT_MQ);
    const onLayoutModeChange = () => {
        const nowMobile = typeof isMobileViewport === 'function' && isMobileViewport();
        if (nowMobile === programacoesMobileLayoutWasMobile) return;
        programacoesMobileLayoutWasMobile = nowMobile;
        refreshMobileDataListScreensIfVisible();
    };

    if (typeof layoutMq.addEventListener === 'function') {
        layoutMq.addEventListener('change', onLayoutModeChange);
    } else if (typeof layoutMq.addListener === 'function') {
        layoutMq.addListener(onLayoutModeChange);
    }
    window.addEventListener('orientationchange', () => {
        window.setTimeout(onLayoutModeChange, 150);
    });
}

bindProgramacoesMobileLayoutModeRefresh();
