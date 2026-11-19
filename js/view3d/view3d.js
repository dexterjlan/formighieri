let view3dSearchRows = [];
let view3dResultsOnlyWithModel = false;
let view3dOrdersCache = [];
let view3dSelectedOrderId = null;
let view3dOrderHighlight = -1;
let view3dOrderQuery = '';
let view3dThreeViewer = null;
let view3dCurrentBlobUrl = null;
let view3dThreeModulePromise = null;

function setView3dThreeOverlay(active) {
    document.getElementById('view3d-three-overlay')?.classList.toggle('hidden', !active);
}

function scheduleView3dViewerResize() {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            view3dThreeViewer?.handleResize();
        });
    });
}

function setView3dMobileBodyScrollLock(locked) {
    if (window.matchMedia('(min-width: 768px)').matches) return;
    document.body.classList.toggle('view3d-viewer-modal-open', Boolean(locked));
}

function bindView3dVisualViewportResize() {
    if (bindView3dVisualViewportResize.bound) return;
    bindView3dVisualViewportResize.bound = true;
    window.visualViewport?.addEventListener('resize', scheduleView3dViewerResize);
    window.visualViewport?.addEventListener('scroll', scheduleView3dViewerResize);
}

function disposeView3dThreeSession() {
    if (view3dThreeViewer) {
        view3dThreeViewer.dispose();
        view3dThreeViewer = null;
    }
    if (view3dCurrentBlobUrl) {
        try {
            URL.revokeObjectURL(view3dCurrentBlobUrl);
        } catch (_) { /* ignore */ }
        view3dCurrentBlobUrl = null;
    }
}

async function ensureView3dThreeModule() {
    if (window.View3dThreeViewer) return;
    if (!document.querySelector('script[type="importmap"]')) {
        throw new Error(
            'Three.js não configurado (import map). Use a página principal com servidor local (ex.: npx serve).'
        );
    }
    if (!view3dThreeModulePromise) {
        view3dThreeModulePromise = new Promise((resolve, reject) => {
            const version = typeof APP_CACHE_VERSION !== 'undefined' ? APP_CACHE_VERSION : '';
            const script = document.createElement('script');
            script.type = 'module';
            script.src = `js/view3d/view3d-three-viewer.js?v=${version}`;
            script.addEventListener('error', () => {
                view3dThreeModulePromise = null;
                reject(new Error('Não foi possível carregar o visualizador Three.js (rede ou CDN).'));
            }, { once: true });
            window.addEventListener('error', event => {
                if (event.filename && String(event.filename).includes('view3d-three-viewer.js')) {
                    view3dThreeModulePromise = null;
                    const detail = event.error?.message || event.message || '';
                    reject(new Error(
                        detail
                            ? `Visualizador 3D: ${detail}`
                            : 'Não foi possível carregar o visualizador Three.js.'
                    ));
                }
            }, { once: true });
            script.onload = () => {
                if (window.View3dThreeViewer) {
                    resolve();
                    return;
                }
                view3dThreeModulePromise = null;
                reject(new Error('Visualizador Three.js indisponível.'));
            };
            document.head.appendChild(script);
        });
    }
    try {
        await view3dThreeModulePromise;
    } catch (error) {
        view3dThreeModulePromise = null;
        throw error;
    }
    if (!window.View3dThreeViewer) {
        throw new Error('Visualizador Three.js indisponível.');
    }
}

function canAccessView3d(user = currentUser) {
    if (!user) return false;
    if (typeof hasInstallerOnlyAccess === 'function' && hasInstallerOnlyAccess(user)) return true;
    return typeof canAccessOrdersDashboard === 'function'
        ? canAccessOrdersDashboard(user)
        : Boolean(user);
}

function updateView3dNav() {
    const btn = document.getElementById('btn-view3d');
    if (!btn) return;
    if (typeof hasInstallerOnlyAccess === 'function' && hasInstallerOnlyAccess()) {
        btn.classList.remove('hidden');
        return;
    }
    btn.classList.toggle('hidden', !canAccessView3d());
}

const view3dPanelOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('view3d')
    : null;

function setView3dLoading(active, message = 'Carregando...', status = 'loading') {
    if (active) {
        setView3dOrderListOpen(false);
    }
    view3dPanelOverlay?.setLoading(active, message, status);
}

function buildView3dDriveContext(orderProject, order) {
    const orderProjectId = Number(orderProject?.id);
    const orderId = Number(orderProject?.orderId || order?.id);
    const orderCode = order?.orderCode || '';
    const projectName = orderProject?.name || 'Projeto';
    if (!orderProjectId || !orderId || !orderCode) return null;

    return {
        entityType: DRIVE_FILE_ENTITY_TYPE.ORDER_PROJECT,
        entityId: orderProjectId,
        orderId,
        orderProjectId,
        orderCode,
        projectName,
        folderKind: DRIVE_FILE_FOLDER_KIND.MODEL_3D,
        folderPath: buildDriveFolderPath(orderCode, projectName, DRIVE_FILE_FOLDER_KIND.MODEL_3D),
        replaceByEntity: true
    };
}

function view3dOrderLabel(order) {
    const clientName = typeof getOrderClientName === 'function'
        ? (getOrderClientName(order) || '')
        : (order?.client?.name || '');
    if (clientName && order?.orderCode) return `${order.orderCode} — ${clientName}`;
    return order?.orderCode || clientName || `Pedido ${order?.id || ''}`;
}

function getView3dClientSearchTerm() {
    return document.getElementById('view3d-filter-client')?.value.trim() || '';
}

function orderMatchesView3dClientFilter(order, clientTerm) {
    const term = typeof normalizeSearchText === 'function'
        ? normalizeSearchText(clientTerm)
        : String(clientTerm || '').trim().toLowerCase();
    if (!term) return true;
    const clientName = typeof getOrderClientName === 'function'
        ? getOrderClientName(order)
        : (order.client?.name || '');
    const clientNorm = typeof normalizeSearchText === 'function'
        ? normalizeSearchText(clientName)
        : String(clientName).toLowerCase();
    return clientNorm.includes(term);
}

function filterView3dOrders(query) {
    const term = typeof normalizeSearchText === 'function'
        ? normalizeSearchText(query)
        : String(query || '').trim().toLowerCase();
    let source = view3dOrdersCache || [];
    const clientTerm = getView3dClientSearchTerm();
    if (clientTerm) {
        source = source.filter(order => orderMatchesView3dClientFilter(order, clientTerm));
    }
    const matches = !term
        ? source
        : source.filter(order => {
            const clientName = typeof getOrderClientName === 'function'
                ? getOrderClientName(order)
                : (order.client?.name || '');
            const clientNorm = typeof normalizeSearchText === 'function'
                ? normalizeSearchText(clientName)
                : String(clientName).toLowerCase();
            const codeNorm = typeof normalizeSearchText === 'function'
                ? normalizeSearchText(order.orderCode)
                : String(order.orderCode || '').toLowerCase();
            return codeNorm.includes(term) || clientNorm.includes(term);
        });
    return matches.slice(0, 40);
}

function setView3dOrderListOpen(open) {
    const list = document.getElementById('view3d-order-list');
    const input = document.getElementById('view3d-order-search');
    if (!list || !input) return;
    list.classList.toggle('hidden', !open);
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) view3dOrderHighlight = -1;
}

function renderView3dOrderOptions() {
    const list = document.getElementById('view3d-order-list');
    if (!list) return;

    const matches = filterView3dOrders(view3dOrderQuery);
    if (!matches.length) {
        view3dOrderHighlight = -1;
        list.innerHTML = '<p class="px-3 py-2 text-xs text-slate-400">Nenhum pedido encontrado.</p>';
        return;
    }

    list.innerHTML = matches.map((order, index) => {
        const active = index === view3dOrderHighlight ? ' bg-slate-100' : '';
        return `<button type="button" class="view3d-order-option w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-slate-50${active}" data-order-id="${order.id}" data-option-index="${index}" role="option">${escapeHtml(view3dOrderLabel(order))}</button>`;
    }).join('');
}

async function loadView3dOrderOptions() {
    const input = document.getElementById('view3d-order-search');
    if (!input) return;
    if (view3dOrdersCache.length) {
        const selected = view3dOrdersCache.find(order => Number(order.id) === Number(view3dSelectedOrderId));
        input.value = selected ? view3dOrderLabel(selected) : input.value;
        renderView3dOrderOptions();
        return;
    }

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, client:Client(name)')
        .order('orderCode', { ascending: false })
        .limit(1000);

    if (error) throw error;
    view3dOrdersCache = data || [];

    const selected = view3dOrdersCache.find(order => Number(order.id) === Number(view3dSelectedOrderId));
    input.value = selected ? view3dOrderLabel(selected) : '';
    view3dOrderQuery = '';
    renderView3dOrderOptions();
}

function selectView3dOrder(orderId) {
    const order = view3dOrdersCache.find(item => Number(item.id) === Number(orderId));
    const input = document.getElementById('view3d-order-search');
    const clientInput = document.getElementById('view3d-filter-client');
    view3dSelectedOrderId = order ? Number(order.id) : null;
    if (input) input.value = order ? view3dOrderLabel(order) : '';
    if (clientInput && order) {
        const clientName = typeof getOrderClientName === 'function'
            ? (getOrderClientName(order) || '')
            : (order.client?.name || '');
        if (clientName) clientInput.value = clientName;
    }
    view3dOrderQuery = '';
    setView3dOrderListOpen(false);
}

function resolveView3dSearch() {
    const clientFilter = getView3dClientSearchTerm();
    const clientNorm = typeof normalizeSearchText === 'function'
        ? normalizeSearchText(clientFilter)
        : clientFilter.toLowerCase();

    const selected = view3dOrdersCache.find(order => Number(order.id) === Number(view3dSelectedOrderId));
    if (selected?.orderCode) {
        return {
            mode: 'code',
            orderCode: String(selected.orderCode).trim(),
            exact: true,
            clientFilter
        };
    }

    const pedidoInput = document.getElementById('view3d-order-search');
    const query = pedidoInput?.value.trim() || '';
    const selectedLabel = selected ? view3dOrderLabel(selected) : '';

    if (query && query !== selectedLabel) {
        const term = typeof normalizeSearchText === 'function' ? normalizeSearchText(query) : query.toLowerCase();
        const matches = filterView3dOrders(query);
        if (matches.length === 1) {
            return {
                mode: 'code',
                orderCode: String(matches[0].orderCode || '').trim(),
                exact: true,
                clientFilter
            };
        }
        const exactCode = matches.find(
            order => (typeof normalizeSearchText === 'function'
                ? normalizeSearchText(order.orderCode)
                : String(order.orderCode || '').toLowerCase()) === term
        );
        if (exactCode) {
            return {
                mode: 'code',
                orderCode: String(exactCode.orderCode).trim(),
                exact: true,
                clientFilter
            };
        }
        if (matches.length > 1) {
            return { error: new Error('Selecione um pedido na lista (vários resultados para esse filtro).') };
        }
        return {
            mode: 'code',
            orderCode: query,
            exact: false,
            clientFilter
        };
    }

    if (clientNorm) {
        return { mode: 'client', clientFilter };
    }

    return { error: new Error('Informe o cliente e/ou selecione um pedido para buscar.') };
}

async function fetchView3dOrdersByCode(orderCode, exact = false) {
    const code = String(orderCode || '').trim();
    if (!code) {
        return { error: new Error('Informe o código do pedido para buscar.') };
    }

    let query = supabaseClient
        .from('salesOrders')
        .select(`id, orderCode, client:Client(name)`)
        .order('orderCode', { ascending: true })
        .limit(80);

    query = exact ? query.eq('orderCode', code) : query.ilike('orderCode', `%${code}%`);

    const { data, error } = await query;
    if (error) return { error, orders: [] };

    return { error: null, orders: data || [] };
}

async function fetchView3dOrdersForSearch(resolved) {
    if (resolved.mode === 'client') {
        if (!view3dOrdersCache.length) {
            try {
                await loadView3dOrderOptions();
            } catch (error) {
                return { error, orders: [] };
            }
        }
        const orders = view3dOrdersCache.filter(order => orderMatchesView3dClientFilter(order, resolved.clientFilter));
        return { error: null, orders: orders.slice(0, 80) };
    }

    const { error, orders } = await fetchView3dOrdersByCode(resolved.orderCode, resolved.exact);
    if (error) return { error, orders: [] };

    const clientFilter = resolved.clientFilter;
    if (!clientFilter) {
        return { error: null, orders };
    }

    const filtered = orders.filter(order => orderMatchesView3dClientFilter(order, clientFilter));
    return { error: null, orders: filtered };
}

function filterView3dEligibleProjects(projects) {
    return (projects || []).filter(project => {
        if (typeof isOrderProjectGroupedChild === 'function' && isOrderProjectGroupedChild(project)) {
            return false;
        }
        if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) return false;
        if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) {
            return false;
        }
        return true;
    });
}

async function fetchView3dProjectsForOrders(orders) {
    const orderIds = [...new Set((orders || []).map(order => Number(order.id)).filter(Boolean))];
    if (!orderIds.length) return [];

    let result = await supabaseClient
        .from('OrderProject')
        .select('id, name, projectCode, orderId, parentProjectId, isComplementary, isReplaced, aggregatorOrderProjectId')
        .in('orderId', orderIds)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('aggregatorOrderProjectId')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, name, projectCode, orderId, parentProjectId, isComplementary, isReplaced')
            .in('orderId', orderIds)
            .order('name', { ascending: true });
    }

    if (result.error) throw result.error;

    return filterView3dEligibleProjects(result.data);
}

async function fetchView3dOrderProjectsByIds(projectIds) {
    const ids = [...new Set((projectIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return [];

    const chunkSize = 80;
    const merged = [];

    for (let offset = 0; offset < ids.length; offset += chunkSize) {
        const chunk = ids.slice(offset, offset + chunkSize);
        let result = await supabaseClient
            .from('OrderProject')
            .select('id, name, projectCode, orderId, parentProjectId, isComplementary, isReplaced, aggregatorOrderProjectId, order:salesOrders(id, orderCode, client:Client(name))')
            .in('id', chunk)
            .order('name', { ascending: true });

        if (result.error?.message?.includes('aggregatorOrderProjectId')) {
            result = await supabaseClient
                .from('OrderProject')
                .select('id, name, projectCode, orderId, parentProjectId, isComplementary, isReplaced, order:salesOrders(id, orderCode, client:Client(name))')
                .in('id', chunk)
                .order('name', { ascending: true });
        }

        if (result.error) throw result.error;
        merged.push(...(result.data || []));
    }

    return filterView3dEligibleProjects(merged);
}

async function fetchView3dAllModelDriveFilesByProjectId() {
    const { data, error } = await supabaseClient
        .from('DriveFile')
        .select(DRIVE_FILE_SELECT)
        .eq('entityType', DRIVE_FILE_ENTITY_TYPE.ORDER_PROJECT)
        .eq('folderKind', DRIVE_FILE_FOLDER_KIND.MODEL_3D)
        .not('driveFileId', 'is', null)
        .order('id', { ascending: true })
        .limit(3000);

    if (error) {
        if (typeof driveFileMissingSetupMessage === 'function') {
            throw new Error(driveFileMissingSetupMessage(error));
        }
        throw error;
    }

    const byProjectId = {};
    (data || []).forEach(file => {
        const key = String(file.entityId);
        if (!key || key === 'null') return;
        byProjectId[key] = file;
    });
    return byProjectId;
}

function mapView3dSearchRows(projects, driveByProjectId = {}, orderById = null) {
    return sortView3dSearchRows((projects || []).map(project => {
        const order = orderById
            ? (orderById[Number(project.orderId)] || project.order || {})
            : (project.order || {});
        const driveFile = driveByProjectId[String(project.id)] || null;
        return {
            project,
            order,
            orderCode: order.orderCode || '—',
            clientName: typeof getOrderClientName === 'function'
                ? (getOrderClientName(order) || '—')
                : (order.client?.name || '—'),
            projectLabel: project.name || project.projectCode || 'Projeto',
            driveFile
        };
    }));
}

function view3dRowHasModelFile(row) {
    return Boolean(row?.driveFile?.driveFileId || row?.driveFile?.url);
}

function sortView3dSearchRows(rows) {
    return [...(rows || [])].sort((a, b) => {
        const clientCmp = String(a.clientName || '').localeCompare(String(b.clientName || ''), 'pt-BR', {
            sensitivity: 'base'
        });
        if (clientCmp !== 0) return clientCmp;

        const orderCmp = String(a.orderCode || '').localeCompare(String(b.orderCode || ''), 'pt-BR', {
            numeric: true,
            sensitivity: 'base'
        });
        if (orderCmp !== 0) return orderCmp;

        const fileCmp = Number(view3dRowHasModelFile(b)) - Number(view3dRowHasModelFile(a));
        if (fileCmp !== 0) return fileCmp;

        return String(a.projectLabel || '').localeCompare(String(b.projectLabel || ''), 'pt-BR', {
            sensitivity: 'base'
        });
    });
}

async function searchView3dProjects() {
    view3dResultsOnlyWithModel = false;
    const resolved = resolveView3dSearch();
    if (resolved.error) {
        alertAppDialog(resolved.error.message, { variant: 'warning', title: 'Aviso' });
        return;
    }

    setView3dLoading(true, 'Buscando projetos...');
    try {
        const { error, orders } = await fetchView3dOrdersForSearch(resolved);
        if (error) {
            alertAppDialog(error.message, { variant: 'warning', title: 'Aviso' });
            view3dSearchRows = [];
            renderView3dResults();
            return;
        }

        if (!orders.length) {
            view3dSearchRows = [];
            renderView3dResults();
            return;
        }

        const projects = await fetchView3dProjectsForOrders(orders);
        const orderById = Object.fromEntries(orders.map(order => [Number(order.id), order]));
        const projectIds = projects.map(project => Number(project.id)).filter(Boolean);

        let driveByProjectId = {};
        if (projectIds.length && typeof fetchDriveFilesByEntityIds === 'function') {
            driveByProjectId = await fetchDriveFilesByEntityIds({
                entityType: DRIVE_FILE_ENTITY_TYPE.ORDER_PROJECT,
                entityIds: projectIds,
                folderKind: DRIVE_FILE_FOLDER_KIND.MODEL_3D
            });
        }

        const mobileSearch = document.getElementById('view3d-mobile-search');
        if (mobileSearch) mobileSearch.value = '';

        view3dSearchRows = mapView3dSearchRows(projects, driveByProjectId, orderById);
        renderView3dResults();
    } catch (searchError) {
        console.error('searchView3dProjects:', searchError);
        alertAppDialog('Erro ao buscar: ' + searchError.message);
    } finally {
        setView3dLoading(false);
    }
}

async function searchView3dAllProjectsWithModel() {
    view3dResultsOnlyWithModel = true;
    setView3dLoading(true, 'Buscando todos os projetos com modelo 3D...');
    try {
        const driveByProjectId = await fetchView3dAllModelDriveFilesByProjectId();
        const projectIds = Object.keys(driveByProjectId).map(Number).filter(Boolean);

        const mobileSearch = document.getElementById('view3d-mobile-search');
        if (mobileSearch) mobileSearch.value = '';

        if (!projectIds.length) {
            view3dSearchRows = [];
            renderView3dResults();
            return;
        }

        const projects = await fetchView3dOrderProjectsByIds(projectIds);
        view3dSearchRows = mapView3dSearchRows(projects, driveByProjectId).filter(view3dRowHasModelFile);
        renderView3dResults();
    } catch (searchError) {
        console.error('searchView3dAllProjectsWithModel:', searchError);
        alertAppDialog('Erro ao buscar: ' + searchError.message);
    } finally {
        setView3dLoading(false);
    }
}

function view3dRowMatchesMobileSearch(row, queryNorm) {
    if (!queryNorm) return true;
    const haystack = normalizeProgramacoesMobileSearchText([
        row.orderCode,
        row.clientName,
        row.projectLabel
    ].join(' '));
    return haystack.includes(queryNorm);
}

function renderView3dRowActionsHtml(row, options = {}) {
    const { showAdminUpload = false, alignEnd = false } = options;
    const projectId = Number(row.project.id);
    const hasModel = Boolean(row.driveFile?.driveFileId || row.driveFile?.url);

    const openBtn = hasModel
        ? `<button type="button" class="view3d-open-btn text-xs bg-indigo-700 text-white hover:bg-indigo-800 px-2.5 py-1 rounded-lg font-medium"
            data-order-project-id="${projectId}">
            Abrir 3D
        </button>`
        : '<span class="text-xs text-slate-300">—</span>';

    const uploadBtn = showAdminUpload
        ? `<button type="button" class="view3d-upload-btn text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium"
            data-order-project-id="${projectId}">
            ${hasModel ? 'Substituir' : 'Upload'}
        </button>`
        : '';

    const deleteBtn = showAdminUpload && hasModel
        ? `<button type="button" class="view3d-delete-btn text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium"
            data-order-project-id="${projectId}">
            Excluir
        </button>`
        : '';

    const wrapClass = alignEnd
        ? 'flex flex-wrap justify-end gap-1'
        : 'view3d-mobile__actions flex flex-wrap gap-1.5';

    return `<div class="${wrapClass}">${openBtn}${uploadBtn}${deleteBtn}</div>`;
}

function renderView3dMobileCard(row, options = {}) {
    return `
        <article class="programacoes-projects-mobile__card view3d-mobile__card" data-order-project-id="${Number(row.project.id)}">
            <div class="programacoes-projects-mobile__headline view3d-mobile__headline">
                <p class="programacoes-projects-mobile__order">
                    <span class="font-mono text-slate-500">${escapeHtml(String(row.orderCode || '—'))}</span>
                    <span class="text-slate-300" aria-hidden="true">·</span>
                    <span class="font-semibold text-slate-900">${escapeHtml(String(row.projectLabel || '—'))}</span>
                </p>
                <p class="programacoes-projects-mobile__client">${escapeHtml(String(row.clientName || '—'))}</p>
            </div>
            ${renderView3dRowActionsHtml(row, options)}
        </article>
    `;
}

let view3dMobileSearchBound = false;

function bindView3dMobileSearchInput() {
    if (view3dMobileSearchBound) return;
    const input = document.getElementById('view3d-mobile-search');
    if (!input) return;
    view3dMobileSearchBound = true;
    input.addEventListener('input', () => renderView3dMobileResultsList());
}

function getView3dResultsTableColumns(showAdminUpload) {
    return [
        {
            key: 'orderCode',
            label: 'Pedido',
            sortable: true,
            filterable: true,
            cellClass: 'p-3 text-xs font-mono text-slate-800'
        },
        {
            key: 'clientName',
            label: 'Cliente',
            sortable: true,
            filterable: true,
            cellClass: 'p-3 text-xs text-slate-700'
        },
        {
            key: 'projectLabel',
            label: 'Projeto',
            sortable: true,
            filterable: true,
            cellClass: 'p-3 text-xs text-slate-800 font-medium'
        },
        {
            key: 'actions',
            label: 'Ações',
            type: 'action',
            align: 'right',
            sortable: false,
            filterable: false,
            thClass: 'min-w-[11rem]',
            cellClass: 'p-3 text-right',
            render: row => renderView3dRowActionsHtml(row, { showAdminUpload, alignEnd: true })
        }
    ];
}

function renderView3dDesktopResultsTable(showAdminUpload) {
    const mount = document.getElementById('view3d-results-table-mount');
    if (!mount) return;

    if (!view3dSearchRows.length) {
        mount.innerHTML = '';
        return;
    }

    if (typeof mountInteractiveTable !== 'function') {
        mount.innerHTML = '<p class="text-xs text-red-500 text-center py-8">Tabela interativa indisponível.</p>';
        return;
    }

    mountInteractiveTable(mount, {
        tableId: 'view3d-results',
        rows: view3dSearchRows,
        columns: getView3dResultsTableColumns(showAdminUpload),
        minWidth: '640px',
        emptyMessage: 'Nenhum projeto na lista.',
        filteredEmptyMessage: 'Nenhum projeto encontrado com os filtros aplicados.',
        defaultSort: [
            { key: 'clientName', direction: 'asc' },
            { key: 'orderCode', direction: 'asc' }
        ]
    });
}

function renderView3dMobileResultsList() {
    const listEl = document.getElementById('view3d-results-mobile-list');
    const countEl = document.getElementById('view3d-mobile-count');
    if (!listEl) return;

    const showAdminUpload = isAdmin();
    const queryNorm = normalizeProgramacoesMobileSearchText(
        document.getElementById('view3d-mobile-search')?.value || ''
    );
    const visible = view3dSearchRows.filter(row => view3dRowMatchesMobileSearch(row, queryNorm));

    if (!visible.length) {
        listEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-10 px-4">Nenhum projeto encontrado com o filtro.</p>';
    } else {
        listEl.innerHTML = visible.map(row => renderView3dMobileCard(row, { showAdminUpload })).join('');
    }

    if (countEl) {
        const total = view3dSearchRows.length;
        const shown = visible.length;
        countEl.textContent = shown === total
            ? `${total} registro${total === 1 ? '' : 's'}`
            : `${shown} de ${total} registros`;
    }
}

function renderView3dResults() {
    const emptyEl = document.getElementById('view3d-results-empty');
    const tableWrap = document.getElementById('view3d-results-table-wrap');
    const tableMount = document.getElementById('view3d-results-table-mount');
    const mobileShell = document.getElementById('view3d-results-mobile-shell');
    const mobile = typeof isMobileViewport === 'function' && isMobileViewport();
    if (!emptyEl && !tableMount) return;

    const showAdminUpload = isAdmin();
    document.getElementById('view3d-upload-hint')?.classList.toggle('hidden', !showAdminUpload);

    if (!view3dSearchRows.length) {
        if (tableMount) tableMount.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        tableWrap?.classList.add('hidden');
        mobileShell?.classList.add('hidden');
        return;
    }

    emptyEl?.classList.add('hidden');

    if (mobile) {
        tableWrap?.classList.add('hidden');
        mobileShell?.classList.remove('hidden');
        bindView3dMobileSearchInput();
        renderView3dMobileResultsList();
        return;
    }

    mobileShell?.classList.add('hidden');
    tableWrap?.classList.remove('hidden');
    renderView3dDesktopResultsTable(showAdminUpload);
}

function findView3dRowByProjectId(orderProjectId) {
    const id = Number(orderProjectId);
    return view3dSearchRows.find(row => Number(row.project.id) === id) || null;
}

async function fetchView3dModelBlobUrl(file) {
    if (typeof fetchView3dModelBlobFromDriveFile === 'function') {
        return fetchView3dModelBlobFromDriveFile(file);
    }
    throw new Error('Visualizador 3D não configurado.');
}

async function openView3dViewerModal(file, title = 'Modelo 3D') {
    const modal = document.getElementById('view3d-viewer-modal');
    const host = document.getElementById('view3d-three-canvas-host');
    const titleEl = document.getElementById('view3d-viewer-title');
    const hintEl = document.getElementById('view3d-viewer-hint');
    if (!modal || !host) return;

    if (titleEl) titleEl.textContent = title;
    if (hintEl) hintEl.textContent = 'Carregando modelo...';

    disposeView3dThreeSession();
    toggleModal('view3d-viewer-modal', true);
    setView3dMobileBodyScrollLock(true);
    setView3dThreeOverlay(true);

    try {
        await ensureView3dThreeModule();
        const modelSrc = await fetchView3dModelBlobUrl(file);
        if (modelSrc.startsWith('blob:')) {
            view3dCurrentBlobUrl = modelSrc;
        }

        view3dThreeViewer = new window.View3dThreeViewer(host);
        scheduleView3dViewerResize();
        await view3dThreeViewer.loadFromUrl(modelSrc);
        scheduleView3dViewerResize();

        setView3dNavigationToolbar('orbit');
        toggleView3dToolbarActive(document.getElementById('btn-view3d-toggle-edges'), view3dThreeViewer?.edgesEnabled);
        if (hintEl) {
            const narrow = typeof isMobileViewport === 'function'
                ? isMobileViewport()
                : window.matchMedia('(max-width: 767px)').matches;
            if (narrow) {
                hintEl.textContent = file?.fileName
                    ? `${file.fileName} · pinça ou ícones à direita`
                    : 'Pinça ou ícones à direita';
            } else {
                hintEl.textContent = file?.fileName
                    ? `Arquivo: ${file.fileName} — Ícones à direita; scroll ou pinça para zoom`
                    : 'Use os ícones à direita; scroll ou pinça para zoom';
            }
        }
    } catch (loadError) {
        console.error('openView3dViewerModal:', loadError);
        closeView3dViewerModal();
        alertAppDialog('Erro ao abrir modelo 3D: ' + loadError.message);
    } finally {
        setView3dThreeOverlay(false);
    }
}

function closeView3dViewerModal() {
    disposeView3dThreeSession();
    setView3dThreeOverlay(false);
    ['btn-view3d-toggle-xray', 'btn-view3d-toggle-edges', 'btn-view3d-toggle-section-cut'].forEach(id => {
        toggleView3dToolbarActive(document.getElementById(id), false);
    });
    resetView3dSectionCutPanel();
    setView3dNavigationToolbar('orbit');
    setView3dMobileBodyScrollLock(false);
    toggleModal('view3d-viewer-modal', false);
}

async function handleView3dOpenClick(orderProjectId) {
    const row = findView3dRowByProjectId(orderProjectId);
    if (!row?.driveFile) {
        alertAppDialog('Este projeto ainda não possui modelo 3D.');
        return;
    }
    openView3dViewerModal(row.driveFile, `${row.projectLabel} — ${row.orderCode}`);
}

async function handleView3dDeleteClick(orderProjectId) {
    if (!isAdmin()) {
        alertAppDialog('Somente administradores podem excluir modelos 3D.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const row = findView3dRowByProjectId(orderProjectId);
    if (!row?.driveFile?.id) {
        alertAppDialog('Este projeto não possui modelo 3D cadastrado.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (typeof deleteDriveFileRecord !== 'function') {
        alertAppDialog('Exclusão de arquivos indisponível neste ambiente.');
        return;
    }

    const fileName = row.driveFile.fileName || 'modelo 3D';
    const confirmed = await confirmAppDialog(
        `Excluir o modelo "${fileName}" do projeto ${row.projectLabel} (${row.orderCode})?\n\nO arquivo será removido do Google Drive, do Supabase Storage e do cadastro.`,
        { title: 'Excluir modelo 3D', confirmLabel: 'Excluir' }
    );
    if (!confirmed) return;

    try {
        setView3dLoading(true, 'Excluindo modelo (Drive, Storage e banco)...');
        const file = {
            ...row.driveFile,
            folderKind: row.driveFile.folderKind || DRIVE_FILE_FOLDER_KIND.MODEL_3D,
            entityType: row.driveFile.entityType || DRIVE_FILE_ENTITY_TYPE.ORDER_PROJECT,
            entityId: row.driveFile.entityId || orderProjectId
        };
        await deleteDriveFileRecord(file);

        if (view3dResultsOnlyWithModel) {
            view3dSearchRows = view3dSearchRows.filter(
                item => Number(item.project.id) !== Number(orderProjectId)
            );
        } else {
            const index = view3dSearchRows.findIndex(item => Number(item.project.id) === Number(orderProjectId));
            if (index >= 0) {
                view3dSearchRows[index] = { ...view3dSearchRows[index], driveFile: null };
            }
        }

        renderView3dResults();
        setView3dLoading(true, 'Modelo excluído.', 'success');
        const waitMs = typeof APP_OVERLAY_SUCCESS_MS === 'number' ? APP_OVERLAY_SUCCESS_MS : 800;
        if (typeof waitAppOverlay === 'function') {
            await waitAppOverlay(waitMs);
        } else {
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    } catch (error) {
        console.error('handleView3dDeleteClick:', error);
        setView3dLoading(true, error.message || 'Não foi possível excluir o modelo.', 'error');
        const waitMs = typeof APP_OVERLAY_ERROR_MS === 'number' ? APP_OVERLAY_ERROR_MS : 2000;
        if (typeof waitAppOverlay === 'function') {
            await waitAppOverlay(waitMs);
        } else {
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    } finally {
        setView3dLoading(false);
    }
}

async function handleView3dUploadClick(orderProjectId) {
    if (!isAdmin()) {
        alertAppDialog('Somente administradores podem enviar modelos 3D.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const row = findView3dRowByProjectId(orderProjectId);
    if (!row) return;

    const input = document.getElementById('view3d-upload-input');
    if (!input) return;

    input.value = '';
    input.onchange = async () => {
        const file = input.files?.[0];
        input.onchange = null;
        if (!file) return;

        const validationError = typeof validateDriveUploadFiles === 'function'
            ? validateDriveUploadFiles([file], DRIVE_FILE_FOLDER_KIND.MODEL_3D)
            : '';
        if (validationError) {
            alertAppDialog(validationError, { variant: 'warning', title: 'Aviso' });
            return;
        }

        const context = buildView3dDriveContext(row.project, row.order);
        if (!context) {
            alertAppDialog('Não foi possível montar o contexto do upload.');
            return;
        }

        if (!isGoogleDriveAppsScriptConfigured()) {
            alertAppDialog('Upload ao Drive não configurado neste ambiente.');
            return;
        }

        setView3dLoading(true, 'Enviando modelo 3D...');
        try {
            const saved = await saveDriveFileUpload(file, context);
            row.driveFile = saved;
            view3dSearchRows = sortView3dSearchRows(view3dSearchRows);
            renderView3dResults();
            alertAppDialog('Modelo 3D enviado com sucesso.', { variant: 'success', title: 'OK' });
        } catch (uploadError) {
            console.error('handleView3dUploadClick:', uploadError);
            alertAppDialog('Erro no upload: ' + uploadError.message);
        } finally {
            setView3dLoading(false);
        }
    };
    input.click();
}

function persistView3dNavState() {
    if (typeof saveAppNavState === 'function') {
        saveAppNavState({ view: 'view3d' });
    }
}

function showView3d() {
    if (!canAccessView3d()) {
        alertAppDialog('Você não tem acesso à tela 3D.');
        return;
    }

    hideSubViews();
    document.getElementById('view3d-view')?.classList.remove('hidden');
    updateMainNavActive('view3d');
    updateAdminNav();
    updateView3dNav();
    renderView3dResults();
    persistView3dNavState();
    loadView3dOrderOptions().catch(error => {
        console.error('loadView3dOrderOptions:', error);
    });
}

async function restoreView3dView() {
    if (!canAccessView3d()) {
        showWelcome();
        return;
    }
    showView3d();
}

function bindView3dEvents() {
    bindView3dVisualViewportResize();
    window.addEventListener('resize', () => {
        const modal = document.getElementById('view3d-viewer-modal');
        if (modal && !modal.classList.contains('hidden')) {
            scheduleView3dViewerResize();
        }
    });
    document.getElementById('btn-view3d')?.addEventListener('click', showView3d);
    document.getElementById('btn-view3d-search')?.addEventListener('click', searchView3dProjects);
    document.getElementById('btn-view3d-all-with-model')?.addEventListener('click', searchView3dAllProjectsWithModel);
    document.getElementById('view3d-filter-form')?.addEventListener('submit', event => {
        event.preventDefault();
        searchView3dProjects();
    });

    const view3dClientInput = document.getElementById('view3d-filter-client');
    const view3dOrderInput = document.getElementById('view3d-order-search');
    const view3dOrderList = document.getElementById('view3d-order-list');

    view3dClientInput?.addEventListener('input', () => {
        const selected = view3dOrdersCache.find(order => Number(order.id) === Number(view3dSelectedOrderId));
        if (selected && !orderMatchesView3dClientFilter(selected, view3dClientInput.value)) {
            view3dSelectedOrderId = null;
            if (view3dOrderInput) view3dOrderInput.value = '';
        }
        if (view3dOrderList && !view3dOrderList.classList.contains('hidden')) {
            view3dOrderQuery = view3dOrderInput?.value || '';
            renderView3dOrderOptions();
        }
    });

    view3dOrderInput?.addEventListener('focus', async () => {
        try {
            await loadView3dOrderOptions();
        } catch (error) {
            alertAppDialog(error.message || 'Erro ao carregar pedidos.');
            return;
        }
        const selected = view3dOrdersCache.find(order => Number(order.id) === Number(view3dSelectedOrderId));
        const selectedLabel = selected ? view3dOrderLabel(selected) : '';
        view3dOrderHighlight = -1;
        view3dOrderQuery = view3dOrderInput.value === selectedLabel ? '' : view3dOrderInput.value;
        renderView3dOrderOptions();
        setView3dOrderListOpen(true);
    });

    view3dOrderInput?.addEventListener('input', () => {
        view3dOrderQuery = view3dOrderInput.value;
        const selected = view3dOrdersCache.find(order => Number(order.id) === Number(view3dSelectedOrderId));
        const selectedLabel = selected ? view3dOrderLabel(selected) : '';
        if (view3dOrderInput.value.trim() !== selectedLabel) {
            view3dSelectedOrderId = null;
        }
        view3dOrderHighlight = -1;
        renderView3dOrderOptions();
        setView3dOrderListOpen(true);
    });

    view3dOrderInput?.addEventListener('keydown', event => {
        const optionCount = view3dOrderList?.querySelectorAll('.view3d-order-option').length || 0;
        if (event.key === 'Escape') {
            setView3dOrderListOpen(false);
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!optionCount) return;
            setView3dOrderListOpen(true);
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            view3dOrderHighlight = (view3dOrderHighlight + delta + optionCount) % optionCount;
            renderView3dOrderOptions();
            view3dOrderList?.querySelector(`[data-option-index="${view3dOrderHighlight}"]`)
                ?.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (event.key === 'Enter') {
            const options = [...(view3dOrderList?.querySelectorAll('.view3d-order-option') || [])];
            const highlighted = options[view3dOrderHighlight] || (options.length === 1 ? options[0] : null);
            if (!highlighted) return;
            event.preventDefault();
            selectView3dOrder(highlighted.dataset.orderId);
        }
    });

    view3dOrderList?.addEventListener('mousedown', event => {
        event.preventDefault();
    });

    view3dOrderList?.addEventListener('click', event => {
        const button = event.target.closest('[data-order-id]');
        if (!button) return;
        selectView3dOrder(button.dataset.orderId);
    });

    if (!window.__view3dOrderOutsideBound) {
        window.__view3dOrderOutsideBound = true;
        document.addEventListener('mousedown', event => {
            const wrap = document.getElementById('view3d-order-wrap');
            if (!wrap || wrap.contains(event.target)) return;
            setView3dOrderListOpen(false);
        });
    }
    document.getElementById('view3d-view')?.addEventListener('click', event => {
        const openBtn = event.target.closest('.view3d-open-btn');
        if (openBtn) {
            handleView3dOpenClick(Number(openBtn.dataset.orderProjectId));
            return;
        }
        const uploadBtn = event.target.closest('.view3d-upload-btn');
        if (uploadBtn) {
            handleView3dUploadClick(Number(uploadBtn.dataset.orderProjectId));
            return;
        }
        const deleteBtn = event.target.closest('.view3d-delete-btn');
        if (deleteBtn) {
            handleView3dDeleteClick(Number(deleteBtn.dataset.orderProjectId));
        }
    });
    document.getElementById('btn-view3d-viewer-close')?.addEventListener('click', closeView3dViewerModal);
    document.getElementById('btn-view3d-nav-orbit')?.addEventListener('click', () => {
        view3dThreeViewer?.setNavigationMode('orbit');
        setView3dNavigationToolbar('orbit');
    });
    document.getElementById('btn-view3d-nav-pan')?.addEventListener('click', () => {
        view3dThreeViewer?.setNavigationMode('pan');
        setView3dNavigationToolbar('pan');
    });
    document.getElementById('btn-view3d-zoom-in')?.addEventListener('click', () => {
        view3dThreeViewer?.zoomIn();
    });
    document.getElementById('btn-view3d-zoom-out')?.addEventListener('click', () => {
        view3dThreeViewer?.zoomOut();
    });
    document.getElementById('btn-view3d-screenshot')?.addEventListener('click', () => {
        const title = document.getElementById('view3d-viewer-title')?.textContent?.trim() || 'Modelo 3D';
        try {
            view3dThreeViewer?.downloadScreenshot(title);
        } catch (error) {
            alertAppDialog(error.message || 'Não foi possível capturar a tela.', {
                variant: 'warning',
                title: 'Captura'
            });
        }
    });
    document.getElementById('btn-view3d-toggle-edges')?.addEventListener('click', event => {
        const enabled = view3dThreeViewer?.toggleEdges();
        toggleView3dToolbarActive(event.currentTarget, enabled);
    });
    document.getElementById('btn-view3d-toggle-xray')?.addEventListener('click', event => {
        const enabled = view3dThreeViewer?.toggleXray();
        toggleView3dToolbarActive(event.currentTarget, enabled);
    });
    document.getElementById('btn-view3d-toggle-section-cut')?.addEventListener('click', event => {
        const viewer = view3dThreeViewer;
        if (!viewer) return;
        if (!viewer.sectionCutEnabled) {
            const slider = document.getElementById('view3d-section-cut-slider');
            const activeAxisBtn = document.querySelector('[data-view3d-section-axis].bg-indigo-700');
            viewer.setSectionCutAxis(activeAxisBtn?.dataset.view3dSectionAxis || 'y');
            viewer.setSectionCutPosition(Number(slider?.value ?? 55) / 100);
            viewer.setSectionCutInvert(
                document.getElementById('btn-view3d-section-cut-invert')?.classList.contains('bg-indigo-700')
            );
        }
        const enabled = viewer.toggleSectionCut();
        toggleView3dToolbarActive(event.currentTarget, enabled);
        syncView3dSectionCutPanelVisibility(enabled);
        if (enabled) {
            setView3dSectionCutPanelCollapsed(false);
        }
    });
    document.getElementById('btn-view3d-section-cut-panel-toggle')?.addEventListener('click', event => {
        event.stopPropagation();
        const panel = document.getElementById('view3d-section-cut-panel');
        const collapsed = panel?.classList.contains('view3d-section-cut-panel--collapsed');
        setView3dSectionCutPanelCollapsed(!collapsed);
    });
    document.getElementById('view3d-section-cut-panel')?.addEventListener('click', event => {
        const axisBtn = event.target.closest('[data-view3d-section-axis]');
        if (axisBtn) {
            const axis = axisBtn.dataset.view3dSectionAxis;
            view3dThreeViewer?.setSectionCutAxis(axis);
            setView3dSectionCutAxisUi(axis);
            return;
        }
        if (event.target.closest('#btn-view3d-section-cut-invert')) {
            const inverted = view3dThreeViewer?.toggleSectionCutInvert();
            setView3dSectionCutInvertUi(inverted);
        }
    });
    document.getElementById('view3d-section-cut-slider')?.addEventListener('input', event => {
        view3dThreeViewer?.setSectionCutPosition(Number(event.target.value) / 100);
    });
}

function syncView3dSectionCutPanelVisibility(enabled) {
    const panel = document.getElementById('view3d-section-cut-panel');
    panel?.classList.toggle('hidden', !enabled);
}

function resetView3dSectionCutPanel() {
    syncView3dSectionCutPanelVisibility(false);
    setView3dSectionCutPanelCollapsed(false);
    const slider = document.getElementById('view3d-section-cut-slider');
    if (slider) slider.value = '55';
    setView3dSectionCutAxisUi('y');
    setView3dSectionCutInvertUi(false);
}

function setView3dSectionCutPanelCollapsed(collapsed) {
    const panel = document.getElementById('view3d-section-cut-panel');
    const toggle = document.getElementById('btn-view3d-section-cut-panel-toggle');
    if (!panel) return;
    const isCollapsed = Boolean(collapsed);
    panel.classList.toggle('view3d-section-cut-panel--collapsed', isCollapsed);
    if (toggle) {
        toggle.setAttribute('aria-expanded', String(!isCollapsed));
        toggle.title = isCollapsed ? 'Expandir painel' : 'Recolher painel';
        toggle.setAttribute('aria-label', toggle.title);
    }
}

function setView3dSectionCutInvertUi(inverted) {
    const button = document.getElementById('btn-view3d-section-cut-invert');
    if (!button) return;
    const active = Boolean(inverted);
    button.classList.toggle('border-indigo-500', active);
    button.classList.toggle('bg-indigo-700', active);
    button.classList.toggle('text-white', active);
    button.classList.toggle('border-slate-600', !active);
    button.classList.toggle('bg-slate-800', !active);
    button.classList.toggle('hover:bg-slate-700', !active);
}

function setView3dSectionCutAxisUi(axis) {
    document.querySelectorAll('[data-view3d-section-axis]').forEach(button => {
        const active = button.dataset.view3dSectionAxis === axis;
        button.classList.toggle('border-indigo-500', active);
        button.classList.toggle('bg-indigo-700', active);
        button.classList.toggle('text-white', active);
        button.classList.toggle('border-slate-600', !active);
        button.classList.toggle('bg-slate-800', !active);
        button.classList.toggle('hover:bg-slate-700', !active);
    });
}

function toggleView3dToolbarActive(button, active) {
    if (!button) return;
    button.classList.toggle('bg-indigo-700', Boolean(active));
    button.classList.toggle('border-indigo-500', Boolean(active));
    button.classList.toggle('text-white', Boolean(active));
    button.classList.toggle('bg-slate-800', !active);
    button.classList.toggle('border-slate-600', !active);
    button.classList.toggle('text-slate-100', !active);
}

function setView3dNavigationToolbar(mode) {
    const orbitBtn = document.getElementById('btn-view3d-nav-orbit');
    const panBtn = document.getElementById('btn-view3d-nav-pan');
    toggleView3dToolbarActive(orbitBtn, mode === 'orbit');
    toggleView3dToolbarActive(panBtn, mode === 'pan');
}

window.canAccessView3d = canAccessView3d;
window.renderView3dResults = renderView3dResults;
window.showView3d = showView3d;
window.updateView3dNav = updateView3dNav;
window.restoreView3dView = restoreView3dView;
window.closeView3dViewerModal = closeView3dViewerModal;
