let view3dSearchRows = [];
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
    if (!view3dThreeModulePromise) {
        view3dThreeModulePromise = new Promise((resolve, reject) => {
            const version = typeof APP_CACHE_VERSION !== 'undefined' ? APP_CACHE_VERSION : '';
            const script = document.createElement('script');
            script.type = 'module';
            script.src = `js/view3d/view3d-three-viewer.js?v=${version}`;
            script.addEventListener('error', () => {
                reject(new Error('Não foi possível carregar o visualizador Three.js.'));
            }, { once: true });
            window.addEventListener('error', event => {
                if (event.filename && String(event.filename).includes('view3d-three-viewer.js')) {
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
                reject(new Error('Visualizador Three.js indisponível.'));
            };
            document.head.appendChild(script);
        });
    }
    await view3dThreeModulePromise;
    if (!window.View3dThreeViewer) {
        throw new Error('Visualizador Three.js indisponível.');
    }
}

function canAccessView3d(user = currentUser) {
    return typeof canAccessOrdersDashboard === 'function'
        ? canAccessOrdersDashboard(user)
        : Boolean(user);
}

function updateView3dNav() {
    const btn = document.getElementById('btn-view3d');
    if (!btn) return;
    btn.classList.toggle('hidden', !canAccessView3d());
}

function setView3dLoading(active, message = 'Carregando...') {
    const overlay = document.getElementById('view3d-loading');
    const msg = document.getElementById('view3d-loading-msg');
    overlay?.classList.toggle('hidden', !active);
    if (msg) msg.textContent = message;
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

function isAllowedView3dUploadFile(file) {
    if (!file) return false;
    return isAllowedDriveUploadFileName(file.name, DRIVE_FILE_FOLDER_KIND.MODEL_3D);
}

async function fetchView3dOrders(orderCodeFilter, clientFilter) {
    const orderCode = String(orderCodeFilter || '').trim();
    const clientNeedle = String(clientFilter || '').trim().toLowerCase();
    if (!orderCode && !clientNeedle) {
        return { error: new Error('Informe o pedido ou o cliente para buscar.') };
    }

    let query = supabaseClient
        .from('salesOrders')
        .select(`id, orderCode, client:Client(name)`)
        .order('orderCode', { ascending: true })
        .limit(80);

    if (orderCode) {
        query = query.ilike('orderCode', `%${orderCode}%`);
    }

    const { data, error } = await query;
    if (error) return { error, orders: [] };

    let orders = data || [];
    if (clientNeedle) {
        orders = orders.filter(order => {
            const clientName = typeof getOrderClientName === 'function'
                ? (getOrderClientName(order) || '')
                : (order.client?.name || '');
            return clientName.toLowerCase().includes(clientNeedle);
        });
    }

    return { error: null, orders };
}

async function fetchView3dProjectsForOrders(orders) {
    const orderIds = [...new Set((orders || []).map(order => Number(order.id)).filter(Boolean))];
    if (!orderIds.length) return [];

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('id, name, projectCode, orderId, parentProjectId, isComplementary, isReplaced')
        .in('orderId', orderIds)
        .order('name', { ascending: true });

    if (error) throw error;

    return (data || []).filter(project => {
        if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) return false;
        if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) {
            return false;
        }
        return true;
    });
}

async function searchView3dProjects() {
    const orderFilter = document.getElementById('view3d-filter-order')?.value || '';
    const clientFilter = document.getElementById('view3d-filter-client')?.value || '';

    setView3dLoading(true, 'Buscando projetos...');
    try {
        const { error, orders } = await fetchView3dOrders(orderFilter, clientFilter);
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

        view3dSearchRows = projects.map(project => {
            const order = orderById[Number(project.orderId)] || {};
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
        });
        renderView3dResults();
    } catch (searchError) {
        console.error('searchView3dProjects:', searchError);
        alertAppDialog('Erro ao buscar: ' + searchError.message);
    } finally {
        setView3dLoading(false);
    }
}

function renderView3dResults() {
    const tbody = document.getElementById('view3d-results-body');
    const emptyEl = document.getElementById('view3d-results-empty');
    const tableWrap = document.getElementById('view3d-results-table-wrap');
    if (!tbody) return;

    const showAdminUpload = isAdmin();
    document.getElementById('view3d-upload-hint')?.classList.toggle('hidden', !showAdminUpload);

    if (!view3dSearchRows.length) {
        tbody.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        tableWrap?.classList.add('hidden');
        return;
    }

    emptyEl?.classList.add('hidden');
    tableWrap?.classList.remove('hidden');

    tbody.innerHTML = view3dSearchRows.map(row => {
        const projectId = Number(row.project.id);
        const hasModel = Boolean(row.driveFile?.driveFileId || row.driveFile?.url);
        const fileLabel = hasModel
            ? escapeHtml(row.driveFile.fileName || 'modelo.glb')
            : '<span class="text-slate-400">—</span>';

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

        return `
            <tr class="border-b border-slate-100 last:border-0">
                <td class="p-3 text-xs font-mono text-slate-800">${escapeHtml(row.orderCode)}</td>
                <td class="p-3 text-xs text-slate-700">${escapeHtml(row.clientName)}</td>
                <td class="p-3 text-xs text-slate-800 font-medium">${escapeHtml(row.projectLabel)}</td>
                <td class="p-3 text-xs text-slate-600">${fileLabel}</td>
                <td class="p-3 text-right">
                    <div class="flex flex-wrap justify-end gap-1">
                        ${openBtn}
                        ${uploadBtn}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
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
        if (hintEl) {
            const narrow = window.matchMedia('(max-width: 767px)').matches;
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
    ['btn-view3d-toggle-xray', 'btn-view3d-toggle-measure'].forEach(id => {
        toggleView3dToolbarActive(document.getElementById(id), false);
    });
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

        context.fileName = file.name;

        setView3dLoading(true, 'Enviando modelo 3D...');
        try {
            const saved = await saveDriveFileUpload(file, context);
            row.driveFile = saved;
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
    document.getElementById('view3d-filter-form')?.addEventListener('submit', event => {
        event.preventDefault();
        searchView3dProjects();
    });
    document.getElementById('view3d-results-body')?.addEventListener('click', event => {
        const openBtn = event.target.closest('.view3d-open-btn');
        if (openBtn) {
            handleView3dOpenClick(Number(openBtn.dataset.orderProjectId));
            return;
        }
        const uploadBtn = event.target.closest('.view3d-upload-btn');
        if (uploadBtn) {
            handleView3dUploadClick(Number(uploadBtn.dataset.orderProjectId));
        }
    });
    document.getElementById('btn-view3d-viewer-close')?.addEventListener('click', closeView3dViewerModal);
    document.getElementById('btn-view3d-nav-orbit')?.addEventListener('click', () => {
        exitView3dMeasureModeForNavigation();
        view3dThreeViewer?.setNavigationMode('orbit');
        setView3dNavigationToolbar('orbit');
    });
    document.getElementById('btn-view3d-nav-pan')?.addEventListener('click', () => {
        exitView3dMeasureModeForNavigation();
        view3dThreeViewer?.setNavigationMode('pan');
        setView3dNavigationToolbar('pan');
    });
    document.getElementById('btn-view3d-zoom-in')?.addEventListener('click', () => {
        exitView3dMeasureModeForNavigation();
        view3dThreeViewer?.zoomIn();
    });
    document.getElementById('btn-view3d-zoom-out')?.addEventListener('click', () => {
        exitView3dMeasureModeForNavigation();
        view3dThreeViewer?.zoomOut();
    });
    document.getElementById('btn-view3d-reset-camera')?.addEventListener('click', () => {
        view3dThreeViewer?.resetCamera();
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
    document.getElementById('btn-view3d-toggle-xray')?.addEventListener('click', event => {
        const enabled = view3dThreeViewer?.toggleXray();
        toggleView3dToolbarActive(event.currentTarget, enabled);
    });
    document.getElementById('btn-view3d-toggle-measure')?.addEventListener('click', event => {
        const enabled = view3dThreeViewer?.toggleMeasureMode();
        toggleView3dToolbarActive(event.currentTarget, enabled);
        const hintEl = document.getElementById('view3d-viewer-hint');
        if (hintEl && enabled) {
            hintEl.textContent = 'Medição: clique no 1º ponto e depois no 2º (orbitar desligado até desativar Medir)';
        }
    });
    document.getElementById('btn-view3d-clear-measures')?.addEventListener('click', () => {
        view3dThreeViewer?.clearMeasurements();
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

function exitView3dMeasureModeForNavigation() {
    if (!view3dThreeViewer?.measureEnabled) return;
    view3dThreeViewer.setMeasureMode(false);
    toggleView3dToolbarActive(document.getElementById('btn-view3d-toggle-measure'), false);
}

window.canAccessView3d = canAccessView3d;
window.showView3d = showView3d;
window.updateView3dNav = updateView3dNav;
window.restoreView3dView = restoreView3dView;
window.closeView3dViewerModal = closeView3dViewerModal;
