let expedicaoWizardState = null;

function normalizeExpeditionAddressPostalCode(postalCode) {
    return String(postalCode || '').replace(/\D/g, '');
}

function normalizeExpeditionAddressNumber(number) {
    return String(number || '').trim().toLowerCase();
}

function getExpeditionAddressKey(addr) {
    if (!addr) return '';
    const addrId = Number(addr.id);
    if (addrId) return `id:${addrId}`;
    const line = typeof expeditionMapsAddressParam === 'function'
        ? expeditionMapsAddressParam(addr)
        : (typeof formatExpeditionAddressOneLine === 'function' ? formatExpeditionAddressOneLine(addr) : '');
    return line.trim().toLowerCase();
}

/** Mesma parada quando CEP + número coincidem (endereços diferentes no cadastro). */
function getExpeditionAddressStopMatchKey(addr) {
    if (!addr) return '';
    const postal = normalizeExpeditionAddressPostalCode(addr.postalCode);
    const number = normalizeExpeditionAddressNumber(addr.number);
    if (postal && number) return `cep:${postal}|num:${number}`;
    return getExpeditionAddressKey(addr);
}

function findExpeditionWizardStopByAddressMatch(addr) {
    const matchKey = getExpeditionAddressStopMatchKey(addr);
    if (!matchKey) return null;
    return (expedicaoWizardState?.stops || []).find(stop =>
        getExpeditionAddressStopMatchKey(stop.addr) === matchKey
    ) || null;
}

function expeditionWizardEntityAlreadyInRoute(entityType, entityId) {
    const type = String(entityType || '');
    const key = Number(entityId);
    if (!type || !key) return false;
    return (expedicaoWizardState?.stops || []).some(stop =>
        (stop.items || []).some(item =>
            item.entityType === type && Number(item.entityId) === key
        )
    );
}

function expedicaoWizardPrepareStopForPendingAddress(pendingAddr) {
    const pendingKey = getExpeditionAddressStopMatchKey(pendingAddr);
    const current = getWizardCurrentStop();
    if (!current?.items?.length) return;

    const currentKey = getExpeditionAddressStopMatchKey(current.addr);
    if (currentKey && pendingKey && currentKey !== pendingKey) {
        expedicaoWizardState.currentStop = null;
    }
}

const expedicaoRouteWizardOverlay = typeof createAppOverlayHelper === 'function'
    ? createAppOverlayHelper('expedition-route-wizard', {
        closeButtonSelector: '#btn-expedition-route-wizard-close'
    })
    : null;

function createEmptyExpedicaoWizardState() {
    return {
        step: 'meta',
        routeDate: typeof getTodayInputDate === 'function'
            ? getTodayInputDate()
            : new Date().toISOString().slice(0, 10),
        routeTime: typeof getExpeditionRouteTimeDefault === 'function'
            ? getExpeditionRouteTimeDefault()
            : '08:00',
        routeName: '',
        vehicleLabel: '',
        driverName: '',
        responsibleUserId: null,
        pickerUsers: null,
        routeStatus: 'Draft',
        editingRouteId: null,
        stops: [],
        currentStop: null,
        pendingItem: null,
        maps: null
    };
}

function renderExpeditionWizardStatusSelect(selected = 'Draft') {
    const options = (typeof EXPEDITION_ROUTE_WIZARD_STATUS_OPTIONS !== 'undefined' && EXPEDITION_ROUTE_WIZARD_STATUS_OPTIONS.length)
        ? EXPEDITION_ROUTE_WIZARD_STATUS_OPTIONS
        : [
            { value: 'Draft', label: 'Rascunho' },
            { value: 'Confirmed', label: 'Confirmado' }
        ];
    const value = typeof normalizeExpeditionRouteWizardStatus === 'function'
        ? normalizeExpeditionRouteWizardStatus(selected)
        : (typeof normalizeExpeditionRouteStatus === 'function'
            ? normalizeExpeditionRouteStatus(selected)
            : selected);
    return `
        <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Status</label>
            <select id="expedition-wizard-route-status"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                ${options.map(opt => `
                    <option value="${opt.value}"${opt.value === value ? ' selected' : ''}>${escapeHtml(opt.label)}</option>
                `).join('')}
            </select>
            <p class="text-[10px] text-slate-400 mt-1">Confirmado exige rota calculada e libera etiquetas.</p>
        </div>
    `;
}

function readExpeditionWizardRouteStatusFromDom() {
    const raw = document.getElementById('expedition-wizard-route-status')?.value || 'Draft';
    return typeof normalizeExpeditionRouteWizardStatus === 'function'
        ? normalizeExpeditionRouteWizardStatus(raw)
        : raw;
}

function syncExpeditionWizardMetaFromDom() {
    if (!expedicaoWizardState) return false;

    const routeDate = document.getElementById('expedition-wizard-route-date')?.value;
    const routeTime = document.getElementById('expedition-wizard-route-time')?.value;
    const routeName = document.getElementById('expedition-wizard-route-name')?.value?.trim() || '';
    const vehicle = document.getElementById('expedition-wizard-vehicle')?.value?.trim() || '';
    const driver = document.getElementById('expedition-wizard-driver')?.value?.trim() || '';
    const responsibleRaw = document.getElementById('expedition-wizard-responsible')?.value;
    const statusEl = document.getElementById('expedition-wizard-route-status');
    if (statusEl) {
        expedicaoWizardState.routeStatus = readExpeditionWizardRouteStatusFromDom();
    }

    if (routeDate !== undefined && routeDate !== null && routeDate !== '') {
        if (!routeDate) {
            alertAppDialog('Informe a data da rota.');
            return false;
        }
        expedicaoWizardState.routeDate = routeDate;
    }
    if (routeTime !== undefined && routeTime !== null && routeTime !== '') {
        if (!routeTime) {
            alertAppDialog('Informe o horário da rota.');
            return false;
        }
        expedicaoWizardState.routeTime = typeof normalizeExpeditionRouteTimeValue === 'function'
            ? normalizeExpeditionRouteTimeValue(routeTime)
            : routeTime;
    }
    if (document.getElementById('expedition-wizard-route-name')) {
        expedicaoWizardState.routeName = routeName;
    }
    if (document.getElementById('expedition-wizard-vehicle')) {
        if (!vehicle) {
            alertAppDialog('Informe o carro.');
            return false;
        }
        expedicaoWizardState.vehicleLabel = vehicle;
    }
    if (document.getElementById('expedition-wizard-driver')) {
        if (!driver) {
            alertAppDialog('Informe o motorista.');
            return false;
        }
        expedicaoWizardState.driverName = driver;
    }
    if (document.getElementById('expedition-wizard-responsible')) {
        const responsibleUserId = Number(responsibleRaw);
        if (!responsibleUserId) {
            alertAppDialog('Selecione o responsável pelo embarque e desembarque.');
            return false;
        }
        expedicaoWizardState.responsibleUserId = responsibleUserId;
    }

    if (!expedicaoWizardState.routeDate) {
        alertAppDialog('Informe a data da rota.');
        return false;
    }
    if (!expedicaoWizardState.routeTime) {
        alertAppDialog('Informe o horário da rota.');
        return false;
    }
    if (!expedicaoWizardState.vehicleLabel) {
        alertAppDialog('Informe o carro.');
        return false;
    }
    if (!expedicaoWizardState.driverName) {
        alertAppDialog('Informe o motorista.');
        return false;
    }
    if (!expedicaoWizardState.responsibleUserId) {
        alertAppDialog('Selecione o responsável pelo embarque e desembarque.');
        return false;
    }
    return true;
}

function prependExpeditionWizardSaveFooterButton(buttons = []) {
    const rest = (buttons || []).filter(btn => btn.id !== 'expedition-wizard-save-route');
    return [{ id: 'expedition-wizard-save-route', label: 'Salvar' }, ...rest];
}

async function saveExpeditionRouteFromWizard(options = {}) {
    if (!expedicaoWizardState) return false;

    const keepOpen = options.keepOpen !== false;
    const notify = options.notify !== false;

    const statusEl = document.getElementById('expedition-wizard-route-status');
    if (statusEl) {
        expedicaoWizardState.routeStatus = readExpeditionWizardRouteStatusFromDom();
    }
    if (!syncExpeditionWizardMetaFromDom()) return false;
    syncExpeditionWizardRouteMetricsIntoState();

    const savedRouteStatus = expedicaoWizardState.routeStatus || 'Draft';
    const allowEmptyStops = savedRouteStatus === 'Draft';

    captureExpeditionWizardDraftFieldsFromDom();

    expedicaoRouteWizardOverlay?.setLoading(true, 'Salvando rota...');
    try {
        const routeId = await persistExpeditionRoute(expedicaoWizardState, { allowEmptyStops });
        expedicaoWizardState.editingRouteId = routeId;
        if (typeof loadExpedicaoRouteList === 'function') {
            await loadExpedicaoRouteList();
        }

        const titleEl = document.querySelector('#expedition-route-wizard-modal h3');
        if (titleEl) titleEl.textContent = 'Editar rota de expedição';

        if (notify) {
            const statusLabel = typeof formatExpeditionRouteStatus === 'function'
                ? formatExpeditionRouteStatus(savedRouteStatus)
                : savedRouteStatus;
            const labelsHint = savedRouteStatus === 'Confirmed'
                ? ' Você já pode imprimir as etiquetas.'
                : '';
            const savedName = typeof resolveExpeditionRouteNameForPersist === 'function'
                ? resolveExpeditionRouteNameForPersist(routeId, expedicaoWizardState?.routeName)
                : `Rota ${routeId}`;

            if (keepOpen) {
                alertAppDialog(
                    `${savedName} salva (${statusLabel}). Você pode continuar montando a rota e salvar de novo quando quiser.${labelsHint}`,
                    { variant: 'success' }
                );
            } else {
                closeExpedicaoRouteWizard();
                alertAppDialog(`${savedName} salva — ${statusLabel}.${labelsHint}`, { variant: 'success' });
            }
        } else if (!keepOpen) {
            closeExpedicaoRouteWizard();
        }

        return true;
    } catch (error) {
        console.error('saveExpeditionRouteFromWizard:', error);
        alertAppDialog(error.message || 'Erro ao salvar rota.');
        return false;
    } finally {
        expedicaoRouteWizardOverlay?.setLoading(false);
    }
}

async function openExpedicaoRouteWizard(routeId) {
    if (typeof canAccessExpedicaoRouteSection === 'function' && !canAccessExpedicaoRouteSection()) {
        alertAppDialog('Você não tem permissão para montar ou editar rotas.');
        return;
    }
    const key = routeId ? Number(routeId) : null;
    const titleEl = document.querySelector('#expedition-route-wizard-modal h3');

    if (key) {
        expedicaoRouteWizardOverlay?.setLoading(true, 'Carregando rota...');
        try {
            if (typeof buildWizardStateFromRoute !== 'function') {
                throw new Error('Não foi possível carregar a rota para edição.');
            }
            expedicaoWizardState = await buildWizardStateFromRoute(key);
        } catch (error) {
            console.error('openExpedicaoRouteWizard:', error);
            alertAppDialog(error.message || 'Erro ao abrir rota.');
            expedicaoRouteWizardOverlay?.setLoading(false);
            return;
        } finally {
            expedicaoRouteWizardOverlay?.setLoading(false);
        }
        if (titleEl) titleEl.textContent = 'Editar rota de expedição';
    } else {
        expedicaoWizardState = createEmptyExpedicaoWizardState();
        if (titleEl) titleEl.textContent = 'Nova rota de expedição';
    }

    if (typeof fetchExpeditionPickerUsers === 'function') {
        try {
            const pickers = await fetchExpeditionPickerUsers();
            if (expedicaoWizardState) expedicaoWizardState.pickerUsers = pickers;
        } catch (pickerError) {
            console.warn('openExpedicaoRouteWizard: pickers', pickerError);
            if (expedicaoWizardState) expedicaoWizardState.pickerUsers = [];
        }
    }

    document.getElementById('expedition-route-wizard-modal')?.classList.remove('hidden');
    syncExpedicaoWizardModalAuxChrome(true);
    renderExpedicaoRouteWizard();
}

function closeExpedicaoRouteWizard() {
    document.getElementById('expedition-route-wizard-modal')?.classList.add('hidden');
    syncExpedicaoWizardModalAuxChrome(true);
    expedicaoWizardState = null;
}

function isExpedicaoWizardPickupEntityType(entityType) {
    return String(entityType || '') === 'Pickup';
}

function isExpedicaoWizardFuelingEntityType(entityType) {
    return String(entityType || '') === 'Fueling';
}

function isExpedicaoWizardCustomStopEntityType(entityType) {
    return isExpedicaoWizardPickupEntityType(entityType) || isExpedicaoWizardFuelingEntityType(entityType);
}

function syncExpedicaoWizardModalAuxChrome(show = false) {
    const auxBar = document.getElementById('expedition-route-wizard-aux-bar');
    if (!auxBar) return;
    auxBar.classList.toggle('hidden', !show);
}

function renderExpedicaoWizardPickupFormHtml() {
    const categories = typeof EXPEDITION_PICKUP_CATEGORIES !== 'undefined'
        ? EXPEDITION_PICKUP_CATEGORIES
        : [];
    const draft = expedicaoWizardState?.pickupDraft || {};
    return `
        <div id="expedition-wizard-pickup-form" class="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
            <p class="text-xs font-semibold text-indigo-900">Dados da coleta</p>
            <div class="grid grid-cols-1 gap-3">
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="expedition-wizard-pickup-category">Tipo de coleta</label>
                    <select id="expedition-wizard-pickup-category" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                        <option value="">Selecione...</option>
                        ${categories.map(opt => `
                            <option value="${opt.value}"${opt.value === draft.pickupCategory ? ' selected' : ''}>${escapeHtml(opt.label)}</option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="expedition-wizard-pickup-order-code">Código do pedido</label>
                    <div class="order-code-field">
                        <input type="text" id="expedition-wizard-pickup-order-code" inputmode="numeric" pattern="[0-9]*"
                            value="${escapeHtml(draft.orderCode || '')}"
                            class="order-code-field__input w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600"
                            placeholder="Pedido da retirada">
                        <button type="button" id="btn-expedition-wizard-pickup-order-picker"
                            class="order-code-field__picker-btn order-code-field__picker-btn--indigo"
                            aria-label="Buscar pedido por código ou cliente">…</button>
                    </div>
                </div>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1" for="expedition-wizard-pickup-description">Descrição</label>
                <textarea id="expedition-wizard-pickup-description" rows="2"
                    class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y min-h-[3rem]"
                    placeholder="O que será coletado">${escapeHtml(draft.description || '')}</textarea>
            </div>
            <p class="text-[10px] text-slate-500 leading-snug">Coleta não gera volume no embarque. No desembarque será necessário registrar uma foto.</p>
        </div>
    `;
}

function readExpedicaoWizardPickupDraftFromDom() {
    return {
        pickupCategory: document.getElementById('expedition-wizard-pickup-category')?.value || '',
        orderCode: document.getElementById('expedition-wizard-pickup-order-code')?.value?.trim() || '',
        description: document.getElementById('expedition-wizard-pickup-description')?.value?.trim() || ''
    };
}

function getWizardCurrentStop() {
    if (!expedicaoWizardState?.currentStop) return null;
    return expedicaoWizardState.stops.find(stop => stop.localId === expedicaoWizardState.currentStop.localId)
        || expedicaoWizardState.currentStop;
}

function ensureExpeditionWizardMapsState() {
    if (!expedicaoWizardState) return;
    if (!expedicaoWizardState.maps) {
        expedicaoWizardState.maps = { url: null, summary: {} };
    } else if (!expedicaoWizardState.maps.summary) {
        expedicaoWizardState.maps.summary = {};
    }
}

function readExpeditionWizardManualMetricsFromDom() {
    const kmEl = document.getElementById('expedition-wizard-route-distance-km');
    const minEl = document.getElementById('expedition-wizard-route-duration-min');
    const parseKm = typeof parseExpeditionManualDistanceKm === 'function'
        ? parseExpeditionManualDistanceKm
        : (raw) => Number(raw);
    const parseMin = typeof parseExpeditionManualDurationMinutes === 'function'
        ? parseExpeditionManualDurationMinutes
        : (raw) => Number.parseInt(raw, 10);
    return {
        totalDistanceKm: parseKm(kmEl?.value),
        totalDurationMinutes: parseMin(minEl?.value)
    };
}

function syncExpeditionWizardRouteMetricsIntoState() {
    if (!expedicaoWizardState) return;
    ensureExpeditionWizardMapsState();
    const metrics = readExpeditionWizardManualMetricsFromDom();
    const merge = typeof mergeExpeditionRouteManualMetrics === 'function'
        ? mergeExpeditionRouteManualMetrics
        : (summary, m) => ({ ...summary, ...m });
    expedicaoWizardState.maps.summary = merge(expedicaoWizardState.maps.summary, metrics);
}

function captureExpeditionWizardDraftFieldsFromDom() {
    if (!expedicaoWizardState) return;

    const routeDate = document.getElementById('expedition-wizard-route-date')?.value;
    const routeTime = document.getElementById('expedition-wizard-route-time')?.value;
    const vehicle = document.getElementById('expedition-wizard-vehicle')?.value?.trim();
    const driver = document.getElementById('expedition-wizard-driver')?.value?.trim();
    const statusEl = document.getElementById('expedition-wizard-route-status');

    if (routeDate) expedicaoWizardState.routeDate = routeDate;
    if (routeTime) {
        expedicaoWizardState.routeTime = typeof normalizeExpeditionRouteTimeValue === 'function'
            ? normalizeExpeditionRouteTimeValue(routeTime)
            : routeTime;
    }
    if (document.getElementById('expedition-wizard-route-name')) {
        expedicaoWizardState.routeName = document.getElementById('expedition-wizard-route-name')?.value?.trim() || '';
    }
    if (vehicle !== undefined && vehicle !== null) expedicaoWizardState.vehicleLabel = vehicle;
    if (driver !== undefined && driver !== null) expedicaoWizardState.driverName = driver;
    if (statusEl) {
        expedicaoWizardState.routeStatus = readExpeditionWizardRouteStatusFromDom();
    }
    syncExpeditionWizardRouteMetricsIntoState();
}

function moveExpedicaoWizardStop(localId, direction) {
    const stops = expedicaoWizardState?.stops;
    if (!stops?.length || !localId) return;

    const index = stops.findIndex(stop => stop.localId === localId);
    if (index < 0) return;

    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= stops.length) return;

    const reordered = stops.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, moved);
    expedicaoWizardState.stops = reordered;

    if (expedicaoWizardState.maps?.url) {
        expedicaoWizardState.maps.url = null;
    }
}

function canRemoveExpeditionWizardStops() {
    const status = expedicaoWizardState?.routeStatus || 'Draft';
    return status === 'Draft';
}

function removeExpeditionWizardStop(localId) {
    if (!canRemoveExpeditionWizardStops()) return;
    const stops = expedicaoWizardState?.stops;
    if (!stops?.length || !localId) return;

    if (!stops.some(stop => stop.localId === localId)) return;

    expedicaoWizardState.stops = stops.filter(stop => stop.localId !== localId);

    if (expedicaoWizardState.currentStop?.localId === localId) {
        expedicaoWizardState.currentStop = null;
        expedicaoWizardState.pendingItem = null;
        if (expedicaoWizardState.step !== 'meta') {
            expedicaoWizardState.step = 'meta';
        }
    }

    if (expedicaoWizardState.maps?.url) {
        expedicaoWizardState.maps.url = null;
    }
}

function bindExpedicaoWizardMetaStepInteractions(mount) {
    if (!mount) return;

    mount.querySelectorAll('.expedition-wizard-stop-move').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            captureExpeditionWizardDraftFieldsFromDom();
            const localId = btn.dataset.stopLocalId;
            const direction = Number(btn.dataset.dir);
            if (!localId || !direction) return;
            moveExpedicaoWizardStop(localId, direction);
            renderExpedicaoRouteWizard();
        });
    });

    mount.querySelectorAll('.expedition-wizard-stop-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            void (async () => {
                const localId = btn.dataset.stopLocalId;
                if (!localId || !canRemoveExpeditionWizardStops()) return;
                const stopIndex = (expedicaoWizardState?.stops || []).findIndex(
                    stop => stop.localId === localId
                );
                const stopLabel = stopIndex >= 0 ? `parada ${stopIndex + 1}` : 'esta parada';
                const confirmed = typeof confirmAppDialog === 'function'
                    ? await confirmAppDialog(`Excluir ${stopLabel} e todos os itens/volumes dela?`)
                    : window.confirm(`Excluir ${stopLabel} e todos os itens/volumes dela?`);
                if (!confirmed) return;
                captureExpeditionWizardDraftFieldsFromDom();
                removeExpeditionWizardStop(localId);
                renderExpedicaoRouteWizard();
            })();
        });
    });
}

function renderExpeditionWizardMapsSection() {
    const maps = expedicaoWizardState?.maps || {};
    const summary = maps.summary || {};
    const kmValue = summary.totalDistanceKm != null ? String(summary.totalDistanceKm) : '';
    const minValue = summary.totalDurationMinutes != null ? String(summary.totalDurationMinutes) : '';

    const linkBlock = maps.url
        ? `<a href="${escapeHtml(maps.url)}" target="_blank" rel="noopener noreferrer"
                class="inline-flex text-xs font-semibold text-indigo-700 underline">
                Abrir rota no Google Maps novamente
            </a>`
        : `<p class="text-[11px] text-slate-500">Use <strong class="font-semibold text-slate-600">Abrir rota no Maps</strong> após definir a ordem das paradas (obrigatório para status Confirmado).</p>`;

    return `
        <div class="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
            ${linkBlock}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="expedition-wizard-route-distance-km">Distância total (km)</label>
                    <input type="number" id="expedition-wizard-route-distance-km" min="0" step="0.1"
                        value="${escapeHtml(kmValue)}"
                        class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        placeholder="Ex: 142.5">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1" for="expedition-wizard-route-duration-min">Tempo total (min)</label>
                    <input type="number" id="expedition-wizard-route-duration-min" min="0" step="5"
                        value="${escapeHtml(minValue)}"
                        class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        placeholder="Ex: 195">
                </div>
            </div>
            <p class="text-[10px] text-slate-400">Preencha com os totais exibidos no Google Maps (ex.: 3 h 15 min → 195 min).</p>
        </div>
    `;
}

function renderExpedicaoWizardStopsSummary(options = {}) {
    const { editableOrder = false, maxHeightClass = 'max-h-40', allowDelete = false } = options;
    const stops = expedicaoWizardState?.stops || [];
    if (!stops.length) {
        return '<p class="text-xs text-slate-400">Nenhuma parada adicionada ainda.</p>';
    }

    let orderHint = '';
    if (editableOrder) {
        orderHint = '<p class="text-[10px] text-slate-400 mb-2">Use as setas para alterar a ordem das paradas.';
        if (allowDelete) {
            orderHint += ' Para remover, use <strong class="font-semibold text-slate-600">Excluir</strong>.';
        }
        orderHint += '</p>';
    }

    return `
        ${orderHint}
        <ol class="space-y-2 ${maxHeightClass} overflow-y-auto">
            ${stops.map((stop, index) => {
        const reorderControls = editableOrder
            ? `<div class="flex flex-col gap-0.5 shrink-0">
                    <button type="button" class="expedition-wizard-stop-move text-[10px] w-7 h-7 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        data-stop-local-id="${escapeHtml(stop.localId)}" data-dir="-1"${index === 0 ? ' disabled' : ''} aria-label="Subir parada">↑</button>
                    <button type="button" class="expedition-wizard-stop-move text-[10px] w-7 h-7 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        data-stop-local-id="${escapeHtml(stop.localId)}" data-dir="1"${index === stops.length - 1 ? ' disabled' : ''} aria-label="Descer parada">↓</button>
                </div>`
            : '';
        const deleteControl = allowDelete
            ? `<button type="button"
                    class="expedition-wizard-stop-delete shrink-0 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-100"
                    data-stop-local-id="${escapeHtml(stop.localId)}"
                    aria-label="Excluir parada ${index + 1}">Excluir</button>`
            : '';
        return `
                <li class="text-[11px] border border-slate-200 rounded-lg p-2 bg-slate-50">
                    <div class="flex items-start gap-2">
                        ${reorderControls}
                        <div class="flex-1 min-w-0">
                            <p class="font-semibold text-slate-800">Parada ${index + 1}</p>
                            <p class="text-slate-600 whitespace-pre-wrap">${escapeHtml(formatExpeditionAddressOneLine(stop.addr))}</p>
                            <ul class="mt-1 list-disc pl-4 text-slate-500">
                                ${(stop.items || []).map(item => `
                                    <li>${escapeHtml(item.label)} — ${
                                        item.entityType === 'Pickup' ? 'Coleta'
                                            : item.entityType === 'Fueling' ? 'Abastecimento'
                                                : `${item.volumeCount} vol.`}</li>
                                `).join('')}
                            </ul>
                        </div>
                        ${deleteControl}
                    </div>
                </li>
            `;
    }).join('')}
        </ol>
    `;
}

async function renderExpedicaoRouteWizard() {
    const mount = document.getElementById('expedition-route-wizard-mount');
    if (!mount || !expedicaoWizardState) return;

    const step = expedicaoWizardState.step;
    const allowDeleteStops = canRemoveExpeditionWizardStops();
    const stopsSummary = step === 'meta'
        ? renderExpedicaoWizardStopsSummary({
            editableOrder: true,
            maxHeightClass: 'max-h-56',
            allowDelete: allowDeleteStops
        })
        : renderExpedicaoWizardStopsSummary();

    if (step === 'meta') {
        mount.innerHTML = `
            <div class="space-y-4">
                <p class="text-xs text-slate-500">Informe os dados da rota, use <strong class="font-semibold text-slate-600">Salvar</strong> para gravar o rascunho a qualquer momento e depois inclua as paradas.</p>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div class="md:col-span-2">
                        <label class="block text-xs font-semibold text-slate-500 mb-1" for="expedition-wizard-route-name">Nome da rota</label>
                        <input type="text" id="expedition-wizard-route-name"
                            value="${escapeHtml(expedicaoWizardState.routeName || '')}"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                            placeholder="${escapeHtml(
        expedicaoWizardState.editingRouteId
            ? (typeof resolveExpeditionRouteNameForPersist === 'function'
                ? resolveExpeditionRouteNameForPersist(expedicaoWizardState.editingRouteId, '')
                : `Rota ${expedicaoWizardState.editingRouteId}`)
            : 'Padrão ao salvar: Rota {número}'
    )}">
                        <p class="text-[10px] text-slate-400 mt-1">Se vazio, usa <strong class="font-semibold text-slate-500">Rota</strong> + número.</p>
                    </div>
                    <div class="md:col-span-2 lg:col-span-4">
                        <label class="block text-xs font-semibold text-slate-500 mb-1">Data e horário da rota</label>
                        <div class="expedition-route-wizard-datetime flex gap-2 flex-wrap items-stretch">
                            <input type="date" id="expedition-wizard-route-date" value="${escapeHtml(expedicaoWizardState.routeDate)}"
                                class="expedition-route-wizard-datetime__date px-3 py-2 text-sm border border-slate-200 rounded-lg">
                            <input type="time" id="expedition-wizard-route-time"
                                step="300"
                                value="${escapeHtml(expedicaoWizardState.routeTime || (typeof EXPEDITION_DEFAULT_ROUTE_TIME !== 'undefined' ? EXPEDITION_DEFAULT_ROUTE_TIME : '08:00'))}"
                                class="expedition-route-wizard-datetime__time px-2 py-2 text-sm border border-slate-200 rounded-lg">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 mb-1">Carro</label>
                        <input type="text" id="expedition-wizard-vehicle" value="${escapeHtml(expedicaoWizardState.vehicleLabel)}"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="Ex: Sprinter 01">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 mb-1">Motorista</label>
                        <input type="text" id="expedition-wizard-driver" value="${escapeHtml(expedicaoWizardState.driverName)}"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="Nome do motorista">
                    </div>
                    ${typeof renderExpeditionWizardResponsibleSelect === 'function'
        ? renderExpeditionWizardResponsibleSelect(
            expedicaoWizardState.pickerUsers || [],
            expedicaoWizardState.responsibleUserId
        )
        : ''}
                    ${renderExpeditionWizardStatusSelect(expedicaoWizardState.routeStatus)}
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-600 mb-1">Paradas</p>
                    ${stopsSummary}
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-600 mb-1">Trajeto</p>
                    ${renderExpeditionWizardMapsSection()}
                </div>
            </div>
        `;
        const hasStops = Boolean(expedicaoWizardState.stops?.length);
        const metaFooter = prependExpeditionWizardSaveFooterButton([
            ...(hasStops ? [{ id: 'expedition-wizard-calc-route', label: 'Abrir rota no Maps' }] : []),
            {
                id: 'expedition-wizard-start-stop',
                label: 'Adicionar parada',
                primary: !hasStops
            },
            { id: 'expedition-wizard-close', label: 'Fechar' }
        ]);
        metaFooter[0].primary = hasStops || Boolean(expedicaoWizardState.editingRouteId);
        syncExpedicaoWizardFooter(metaFooter);
        syncExpedicaoWizardModalAuxChrome(true);
        bindExpedicaoWizardMetaStepInteractions(mount);
        return;
    }

    if (step === 'pick-item') {
        const pickupSelected = isExpedicaoWizardPickupEntityType(
            expedicaoWizardState?.pickEntityType || EXPEDITION_ENTITY_TYPES[0]?.value
        );
        const fuelingSelected = isExpedicaoWizardFuelingEntityType(
            expedicaoWizardState?.pickEntityType || ''
        );
        const searchHidden = pickupSelected;
        mount.innerHTML = `
            <div class="space-y-4">
                <p class="text-xs text-slate-500">Escolha o tipo e o item. Cada parada tem um endereço; itens no mesmo endereço podem ficar na mesma parada. Endereço diferente vira nova parada automaticamente.</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 mb-1">Tipo</label>
                        <select id="expedition-wizard-entity-type" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                            ${EXPEDITION_ENTITY_TYPES.map(opt => `
                                <option value="${opt.value}"${opt.value === (expedicaoWizardState.pickEntityType || '') ? ' selected' : ''}>${escapeHtml(opt.label)}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div id="expedition-wizard-search-field-wrap" class="${searchHidden ? 'hidden' : ''}">
                        <label class="block text-xs font-semibold text-slate-500 mb-1">${fuelingSelected ? 'Busca (nome do posto)' : 'Busca (código, nome)'}</label>
                        <input type="text" id="expedition-wizard-entity-query"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="${fuelingSelected ? 'Nome do posto' : 'Digite para buscar'}">
                    </div>
                </div>
                <div id="expedition-wizard-pickup-panel" class="${pickupSelected ? '' : 'hidden'}">
                    ${renderExpedicaoWizardPickupFormHtml()}
                </div>
                <div id="expedition-wizard-search-panel" class="${searchHidden ? 'hidden' : ''}">
                    ${fuelingSelected ? '<p class="text-xs font-semibold text-slate-600 mb-1">Postos cadastrados</p>' : ''}
                    <div id="expedition-wizard-search-results" class="border border-slate-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                        <p class="text-xs text-slate-400 p-3 text-center">${fuelingSelected ? 'Carregando postos...' : 'Digite para buscar.'}</p>
                    </div>
                </div>
                <div id="expedition-wizard-fueling-panel" class="${fuelingSelected && typeof renderExpedicaoWizardFuelingRegisterFormHtml === 'function' ? '' : 'hidden'}">
                    ${fuelingSelected && typeof renderExpedicaoWizardFuelingRegisterFormHtml === 'function'
            ? renderExpedicaoWizardFuelingRegisterFormHtml()
            : ''}
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-600 mb-1">Paradas da rota</p>
                    ${stopsSummary}
                </div>
            </div>
        `;
        if (!expedicaoWizardState.pickEntityType) {
            expedicaoWizardState.pickEntityType = document.getElementById('expedition-wizard-entity-type')?.value
                || EXPEDITION_ENTITY_TYPES[0]?.value
                || '';
        }
        bindExpedicaoWizardEntitySearch();
        if (fuelingSelected && typeof bindExpedicaoWizardFuelingRegisterForm === 'function') {
            bindExpedicaoWizardFuelingRegisterForm();
        }
        syncExpedicaoWizardModalAuxChrome(false);
        const footerButtons = [
            { id: 'expedition-wizard-back-meta', label: 'Voltar' },
            ...(pickupSelected ? [{ id: 'expedition-wizard-add-pickup-stop', label: 'Adicionar parada', primary: true }] : []),
            ...(fuelingSelected ? [{ id: 'expedition-wizard-add-fueling-stop', label: 'Adicionar parada', primary: true }] : [])
        ];
        syncExpedicaoWizardFooter(footerButtons);
        return;
    }

    if (step === 'confirm-item') {
        const pending = expedicaoWizardState.pendingItem;
        const addrDisplay = typeof formatAddrFullDisplay === 'function'
            ? formatAddrFullDisplay(pending?.addr)
            : formatExpeditionAddressOneLine(pending?.addr);
        const isRequisition = typeof isExpeditionRequisitionEntityType === 'function'
            && isExpeditionRequisitionEntityType(pending?.entityType);
        const trackingCode = typeof normalizeScannableTrackingCode === 'function'
            ? normalizeScannableTrackingCode(pending?.meta?.trackingCode)
            : String(pending?.meta?.trackingCode || '').trim();
        mount.innerHTML = `
            <div class="space-y-4">
                <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p class="text-xs font-semibold text-slate-800">${escapeHtml(pending?.label || '')}</p>
                    <p class="text-[11px] text-slate-600 whitespace-pre-wrap mt-2">${escapeHtml(addrDisplay || '')}</p>
                </div>
                ${isRequisition
                    ? `<p class="text-xs text-slate-600">
                        Esta requisição usa <strong>1 volume</strong> com o código da ficha impressa
                        ${trackingCode ? `( <span class="font-mono">${escapeHtml(trackingCode)}</span> )` : ''}.
                      </p>
                      <p class="text-[11px] text-slate-500">O código deve estar na impressão (RPP/RPC). Imprima a requisição se ainda não tiver código.</p>
                      <input type="hidden" id="expedition-wizard-volume-count" value="1">`
                    : `<p class="text-xs text-slate-500">Confira o endereço e informe a quantidade de volumes.</p>
                        <div class="max-w-xs">
                            <label class="block text-xs font-semibold text-slate-500 mb-1">Volumes</label>
                            <input type="number" id="expedition-wizard-volume-count" min="1" step="1" value="1"
                                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                        </div>`}
            </div>
        `;
        syncExpedicaoWizardFooter([
            { id: 'expedition-wizard-back-pick', label: 'Voltar' },
            { id: 'expedition-wizard-confirm-item', label: 'Confirmar item', primary: true }
        ]);
        syncExpedicaoWizardModalAuxChrome(false);
        return;
    }

    if (step === 'stop-actions') {
        const currentStop = getWizardCurrentStop();
        mount.innerHTML = `
            <div class="space-y-4">
                <p class="text-xs text-slate-500">Parada atual:</p>
                <div class="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                    <p class="text-[11px] text-slate-700 whitespace-pre-wrap">${escapeHtml(formatExpeditionAddressOneLine(currentStop?.addr))}</p>
                    <ul class="mt-2 list-disc pl-4 text-[11px] text-slate-600">
                        ${(currentStop?.items || []).map(item => `
                            <li>${escapeHtml(item.label)} — ${item.volumeCount} vol.
                                <span class="text-slate-400">(${item.volumes?.map(v => v.volumeCode).join(', ')})</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                <p class="text-xs text-slate-600 font-semibold">Deseja incluir outro item neste mesmo endereço?</p>
                <div>
                    <p class="text-xs font-semibold text-slate-600 mb-1">Paradas concluídas</p>
                    ${stopsSummary}
                </div>
            </div>
        `;
        syncExpedicaoWizardFooter([
            { id: 'expedition-wizard-add-item-same-stop', label: 'Sim, outro item', primary: true },
            { id: 'expedition-wizard-finish-stop', label: 'Concluir parada' }
        ]);
        syncExpedicaoWizardModalAuxChrome(false);
        return;
    }

}

function syncExpedicaoWizardFooter(buttons) {
    const footer = document.getElementById('expedition-route-wizard-footer');
    if (!footer) return;
    footer.innerHTML = buttons.map(btn => `
        <button type="button" id="${btn.id}"
            class="text-xs px-4 py-2 rounded-lg font-semibold ${
    btn.primary
        ? 'bg-slate-900 text-white hover:bg-slate-800'
        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
}">
            ${escapeHtml(btn.label)}
        </button>
    `).join('');

    buttons.forEach(btn => {
        document.getElementById(btn.id)?.addEventListener('click', () => handleExpedicaoWizardAction(btn.id));
    });
}

function bindExpedicaoWizardEntitySearch() {
    const queryInput = document.getElementById('expedition-wizard-entity-query');
    const typeSelect = document.getElementById('expedition-wizard-entity-type');
    const wizardMount = document.getElementById('expedition-route-wizard-mount');
    let timer = null;

    const syncPickupLayout = () => {
        const entityType = typeSelect?.value || '';
        expedicaoWizardState.pickEntityType = entityType;
        const pickup = isExpedicaoWizardPickupEntityType(entityType);
        const fueling = isExpedicaoWizardFuelingEntityType(entityType);
        const hideSearch = pickup;
        document.getElementById('expedition-wizard-pickup-panel')?.classList.toggle('hidden', !pickup);
        document.getElementById('expedition-wizard-fueling-panel')?.classList.toggle('hidden', !fueling);
        document.getElementById('expedition-wizard-search-panel')?.classList.toggle('hidden', hideSearch);
        document.getElementById('expedition-wizard-search-field-wrap')?.classList.toggle('hidden', hideSearch);
        const footerButtons = [
            { id: 'expedition-wizard-back-meta', label: 'Voltar' },
            ...(pickup ? [{ id: 'expedition-wizard-add-pickup-stop', label: 'Adicionar parada', primary: true }] : []),
            ...(fueling ? [{ id: 'expedition-wizard-add-fueling-stop', label: 'Adicionar parada', primary: true }] : [])
        ];
        syncExpedicaoWizardFooter(footerButtons);
        if (fueling) {
            if (expedicaoWizardState.fuelingRegisterOpen == null) {
                expedicaoWizardState.fuelingRegisterOpen = false;
            }
            if (typeof bindExpedicaoWizardFuelingRegisterForm === 'function') {
                bindExpedicaoWizardFuelingRegisterForm();
            }
        }
        if (wizardMount && !wizardMount.dataset.expeditionPickupPickerBound) {
            wizardMount.dataset.expeditionPickupPickerBound = '1';
            wizardMount.addEventListener('click', event => {
                if (!event.target.closest('#btn-expedition-wizard-pickup-order-picker')) return;
                if (typeof openExpedicaoPickupOrderPicker === 'function') {
                    openExpedicaoPickupOrderPicker();
                }
            });
        }
        if (!pickup) runSearch();
    };

    const runSearch = async () => {
        const entityType = typeSelect?.value;
        if (isExpedicaoWizardPickupEntityType(entityType)) return;
        const query = queryInput?.value || '';
        const isFueling = isExpedicaoWizardFuelingEntityType(entityType);
        const mount = document.getElementById('expedition-wizard-search-results');
        if (!mount || !entityType) return;

        mount.innerHTML = '<p class="text-xs text-slate-400 p-3 text-center">Buscando...</p>';
        try {
            const rawRows = await searchExpeditionEntities(entityType, query, 30);
            const excludeRouteId = expedicaoWizardState?.editingRouteId ?? null;
            const pickTargets = (rawRows || []).map(row => (
                typeof getExpeditionPickTarget === 'function'
                    ? getExpeditionPickTarget(row, entityType)
                    : { entityType, entityId: Number(row.id) }
            ));
            const routedTypes = [...new Set(pickTargets.map(pick => pick.entityType).filter(Boolean))]
                .filter(typeKey => typeKey !== 'Fueling');
            const routedByType = {};
            await Promise.all(routedTypes.map(async typeKey => {
                if (typeof fetchExpeditionEntityIdsAlreadyRouted !== 'function') {
                    routedByType[typeKey] = new Set();
                    return;
                }
                const ids = await fetchExpeditionEntityIdsAlreadyRouted(typeKey, excludeRouteId);
                routedByType[typeKey] = new Set((ids || []).map(id => Number(id)));
            }));
            const rows = (rawRows || []).filter((row, index) => {
                const pick = pickTargets[index];
                const routeEntityType = pick?.entityType;
                const entityId = Number(pick?.entityId);
                if (!routeEntityType || !entityId) return false;
                if (routeEntityType === 'Fueling') {
                    return !expeditionWizardEntityAlreadyInRoute('Fueling', entityId);
                }
                if (routedByType[routeEntityType]?.has(entityId)) return false;
                return !expeditionWizardEntityAlreadyInRoute(routeEntityType, entityId);
            }).slice(0, 20);

            if (!rawRows?.length) {
                if (isFueling) {
                    if (!expedicaoWizardState.fuelingRegisterOpen) {
                        expedicaoWizardState.fuelingRegisterOpen = true;
                        renderExpedicaoRouteWizard();
                        return;
                    }
                    mount.innerHTML = `
                        <p class="text-xs text-slate-500 p-3 text-center leading-relaxed">
                            Nenhum posto na lista.<br>
                            Preencha o <strong>cadastro abaixo</strong> e toque em <strong>Salvar posto</strong>.
                        </p>
                    `;
                } else {
                    mount.innerHTML = '<p class="text-xs text-slate-400 p-3 text-center">Nenhum resultado.</p>';
                }
                return;
            }
            if (!rows.length) {
                mount.innerHTML = '<p class="text-xs text-slate-400 p-3 text-center">Nenhum item disponível. Os encontrados já estão em outra rota ou nesta parada.</p>';
                return;
            }
            const header = typeof renderExpeditionEntitySearchHeaderHtml === 'function'
                ? renderExpeditionEntitySearchHeaderHtml(entityType)
                : '';
            const listRows = rows.map(row => {
                const pick = typeof getExpeditionPickTarget === 'function'
                    ? getExpeditionPickTarget(row, entityType)
                    : { entityType, entityId: Number(row.id) };
                const body = typeof renderExpeditionEntitySearchRowHtml === 'function'
                    ? renderExpeditionEntitySearchRowHtml(row, entityType)
                    : `<p class="text-xs text-slate-700 px-1">${escapeHtml(formatExpeditionEntitySearchRowLabel(row, entityType))}</p>`;
                const selected = isFueling && Number(expedicaoWizardState?.fuelingStationId) === Number(pick.entityId);
                return `
                    <button type="button"
                        class="expedition-wizard-pick-entity w-full text-left px-3 py-2.5 hover:bg-slate-50 active:bg-slate-100 ${selected ? 'bg-amber-50 ring-1 ring-amber-300' : ''}"
                        data-pick-entity-type="${escapeHtml(pick.entityType)}"
                        data-pick-entity-id="${Number(pick.entityId)}">
                        ${body}
                    </button>
                `;
            }).join('');
            mount.innerHTML = `
                <div class="expedition-entity-pick-list">
                    ${header}
                    ${listRows}
                </div>
            `;

            mount.querySelectorAll('.expedition-wizard-pick-entity').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const entityTypeValue = typeSelect.value;
                    const resolveEntityType = String(btn.dataset.pickEntityType || entityTypeValue || '').trim();
                    const entityId = Number(btn.dataset.pickEntityId);
                    if (isExpedicaoWizardFuelingEntityType(resolveEntityType)) {
                        expedicaoWizardState.fuelingStationId = entityId;
                        renderExpedicaoRouteWizard();
                        return;
                    }
                    const routeEntityType = resolveEntityType;
                    expedicaoRouteWizardOverlay?.setLoading(true, 'Carregando endereço...');
                    try {
                        const ctx = await resolveExpeditionEntityContext(resolveEntityType, entityId);
                        if (!ctx.ok) {
                            alertAppDialog(ctx.message || 'Item sem endereço.');
                            return;
                        }
                        if (expeditionWizardEntityAlreadyInRoute(routeEntityType, entityId)) {
                            alertAppDialog('Este item já foi incluído nesta rota.');
                            return;
                        }
                        if (typeof isExpeditionRequisitionEntityType === 'function'
                            && isExpeditionRequisitionEntityType(resolveEntityType)
                            && ctx.meta) {
                            try {
                                if (resolveEntityType === 'PartRequest' && typeof ensurePartRequestTrackingCode === 'function') {
                                    await ensurePartRequestTrackingCode(ctx.meta);
                                } else if (resolveEntityType === 'Purchase' && typeof ensurePurchaseTrackingCode === 'function') {
                                    await ensurePurchaseTrackingCode(ctx.meta);
                                }
                            } catch (trackingError) {
                                console.warn('expedition wizard trackingCode:', trackingError);
                            }
                        }
                        expedicaoWizardPrepareStopForPendingAddress(ctx.addr);
                        expedicaoWizardState.pendingItem = ctx;
                        expedicaoWizardState.step = 'confirm-item';
                        renderExpedicaoRouteWizard();
                    } finally {
                        expedicaoRouteWizardOverlay?.setLoading(false);
                    }
                });
            });
        } catch (error) {
            console.error('bindExpedicaoWizardEntitySearch:', error);
            const eaiHint = entityType === 'ExternalAssemblyInspection'
                && /ExternalAssemblyInspection|permission|row-level security/i.test(error.message || '')
                ? ' Verifique se as tabelas de vistoria existem e se seu usuário tem permissão de leitura.'
                : '';
            mount.innerHTML = `<p class="text-xs text-red-600 p-3 text-center">${escapeHtml(error.message)}${escapeHtml(eaiHint)}</p>`;
        }
    };

    queryInput?.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(runSearch, 300);
    });
    typeSelect?.addEventListener('change', syncPickupLayout);
    syncPickupLayout();
}

function notifyExpeditionWizardMergedIntoExistingStop(stop) {
    if (!stop?.items?.length) return;
    const stops = expedicaoWizardState?.stops || [];
    const idx = stops.findIndex(s => s.localId === stop.localId);
    const paradaLabel = idx >= 0 ? `parada ${idx + 1}` : 'parada existente';
    const addrLine = typeof formatExpeditionAddressOneLine === 'function'
        ? formatExpeditionAddressOneLine(stop.addr)
        : '';
    const addrHint = addrLine ? `\n\n${addrLine}` : '';
    alertAppDialog(
        `Este endereço (mesmo CEP e número) já está na rota. O item será adicionado à ${paradaLabel}.${addrHint}`
    );
}

/** @returns {boolean} true se o item entrou em parada já existente (não é “outro item” na parada atual). */
function ensureWizardCurrentStopFromPendingItem(pendingItem) {
    const pendingKey = getExpeditionAddressStopMatchKey(pendingItem?.addr);
    let current = getWizardCurrentStop();

    if (current?.items?.length) {
        const currentKey = getExpeditionAddressStopMatchKey(current.addr);
        if (pendingKey && currentKey && currentKey !== pendingKey) {
            expedicaoWizardState.currentStop = null;
            current = null;
        }
    }

    if (!expedicaoWizardState.currentStop) {
        const existingStop = findExpeditionWizardStopByAddressMatch(pendingItem?.addr);
        if (existingStop) {
            expedicaoWizardState.currentStop = existingStop;
            return (existingStop.items?.length || 0) > 0;
        }

        const localId = `stop-${Date.now()}`;
        expedicaoWizardState.currentStop = {
            localId,
            addr: pendingItem.addr,
            items: []
        };
        expedicaoWizardState.stops.push(expedicaoWizardState.currentStop);
        return false;
    }

    current = getWizardCurrentStop();
    if (current && !current.items?.length) {
        current.addr = pendingItem.addr;
    }
    return false;
}

async function handleExpedicaoWizardAction(actionId) {
    if (!expedicaoWizardState) return;

    if (actionId === 'expedition-wizard-start-stop') {
        if (!syncExpeditionWizardMetaFromDom()) return;
        expedicaoWizardState.currentStop = null;
        expedicaoWizardState.pendingItem = null;
        expedicaoWizardState.step = 'pick-item';
        renderExpedicaoRouteWizard();
        return;
    }

    if (actionId === 'expedition-wizard-save-route') {
        await saveExpeditionRouteFromWizard({ keepOpen: true });
        return;
    }

    if (actionId === 'expedition-wizard-close') {
        closeExpedicaoRouteWizard();
        return;
    }

    if (actionId === 'expedition-wizard-back-meta') {
        expedicaoWizardState.step = 'meta';
        renderExpedicaoRouteWizard();
        return;
    }

    if (actionId === 'expedition-wizard-add-fueling-stop') {
        const stationId = Number(expedicaoWizardState?.fuelingStationId);
        if (!stationId) {
            alertAppDialog('Selecione um posto na lista ou cadastre um novo.');
            return;
        }
        expedicaoRouteWizardOverlay?.setLoading(true, 'Validando posto...');
        try {
            const ctx = typeof resolveExpeditionFuelingContextById === 'function'
                ? await resolveExpeditionFuelingContextById(stationId)
                : { ok: false, message: 'Módulo de abastecimento indisponível.' };
            if (!ctx.ok) {
                alertAppDialog(ctx.message || 'Não foi possível incluir o abastecimento.');
                return;
            }
            if (expeditionWizardEntityAlreadyInRoute('Fueling', stationId)) {
                alertAppDialog('Este posto já está nesta rota.');
                return;
            }
            const mergedIntoExisting = ensureWizardCurrentStopFromPendingItem(ctx);
            const currentStop = getWizardCurrentStop();
            if (mergedIntoExisting) {
                notifyExpeditionWizardMergedIntoExistingStop(currentStop);
            }
            currentStop.items.push({
                entityType: ctx.entityType,
                entityId: ctx.entityId,
                label: ctx.label,
                volumeCount: 0,
                volumes: [],
                metadata: ctx.metadata || {}
            });
            expedicaoWizardState.currentStop = null;
            expedicaoWizardState.fuelingStationId = null;
            expedicaoWizardState.step = 'meta';
            renderExpedicaoRouteWizard();
        } finally {
            expedicaoRouteWizardOverlay?.setLoading(false);
        }
        return;
    }

    if (actionId === 'expedition-wizard-add-pickup-stop') {
        const draft = readExpedicaoWizardPickupDraftFromDom();
        expedicaoWizardState.pickupDraft = draft;
        expedicaoRouteWizardOverlay?.setLoading(true, 'Validando coleta...');
        try {
            const ctx = typeof resolveExpeditionPickupContext === 'function'
                ? await resolveExpeditionPickupContext(draft)
                : { ok: false, message: 'Módulo de coleta indisponível.' };
            if (!ctx.ok) {
                alertAppDialog(ctx.message || 'Não foi possível incluir a coleta.');
                return;
            }
            const mergedIntoExisting = ensureWizardCurrentStopFromPendingItem(ctx);
            const currentStop = getWizardCurrentStop();
            if (mergedIntoExisting) {
                notifyExpeditionWizardMergedIntoExistingStop(currentStop);
            }
            currentStop.items.push({
                entityType: ctx.entityType,
                entityId: ctx.entityId,
                label: ctx.label,
                volumeCount: 0,
                volumes: [],
                metadata: ctx.metadata || {}
            });
            expedicaoWizardState.currentStop = null;
            expedicaoWizardState.pickupDraft = null;
            expedicaoWizardState.step = 'meta';
            renderExpedicaoRouteWizard();
        } finally {
            expedicaoRouteWizardOverlay?.setLoading(false);
        }
        return;
    }

    if (actionId === 'expedition-wizard-back-pick') {
        expedicaoWizardState.pendingItem = null;
        expedicaoWizardState.step = 'pick-item';
        renderExpedicaoRouteWizard();
        return;
    }

    if (actionId === 'expedition-wizard-confirm-item') {
        const pending = expedicaoWizardState.pendingItem;
        if (!pending?.entityId) {
            alertAppDialog('Selecione um item válido.');
            return;
        }
        const isRequisition = typeof isExpeditionRequisitionEntityType === 'function'
            && isExpeditionRequisitionEntityType(pending.entityType);
        const trackingCode = typeof normalizeScannableTrackingCode === 'function'
            ? normalizeScannableTrackingCode(pending?.meta?.trackingCode)
            : String(pending?.meta?.trackingCode || '').trim();
        let volumeCount = Number(document.getElementById('expedition-wizard-volume-count')?.value);
        if (isRequisition) {
            volumeCount = 1;
            if (!trackingCode) {
                alertAppDialog('Requisição sem código de expedição. Execute o SQL de trackingCode, salve ou imprima a ficha.');
                return;
            }
        } else if (!Number.isInteger(volumeCount) || volumeCount < 1) {
            alertAppDialog('Informe ao menos 1 volume.');
            return;
        }

        const mergedIntoExisting = ensureWizardCurrentStopFromPendingItem(pending);
        const volumes = typeof buildExpeditionVolumesForStopItem === 'function'
            ? buildExpeditionVolumesForStopItem({
                entityType: pending.entityType,
                volumeCount,
                trackingCode
            })
            : buildExpeditionVolumesForItem(volumeCount);
        const currentStop = getWizardCurrentStop();
        if (mergedIntoExisting) {
            notifyExpeditionWizardMergedIntoExistingStop(currentStop);
        }
        currentStop.items.push({
            entityType: pending.entityType,
            entityId: pending.entityId,
            label: pending.label,
            volumeCount,
            volumes,
            trackingCode: isRequisition ? trackingCode : '',
            metadata: pending.metadata || {}
        });

        expedicaoWizardState.pendingItem = null;
        expedicaoWizardState.step = 'stop-actions';
        renderExpedicaoRouteWizard();
        return;
    }

    if (actionId === 'expedition-wizard-add-item-same-stop') {
        expedicaoWizardState.step = 'pick-item';
        renderExpedicaoRouteWizard();
        return;
    }

    if (actionId === 'expedition-wizard-finish-stop') {
        const currentStop = getWizardCurrentStop();
        if (!currentStop?.items?.length) {
            alertAppDialog('Inclua ao menos um item na parada.');
            return;
        }
        expedicaoWizardState.currentStop = null;
        const saved = await saveExpeditionRouteFromWizard({ keepOpen: true, notify: false });
        if (!saved) {
            expedicaoWizardState.currentStop = currentStop;
            return;
        }
        expedicaoWizardState.step = 'meta';
        renderExpedicaoRouteWizard();
        return;
    }

    if (actionId === 'expedition-wizard-calc-route') {
        if (!syncExpeditionWizardMetaFromDom()) return;

        if (!expedicaoWizardState.stops.length) {
            alertAppDialog('Adicione ao menos uma parada.');
            return;
        }

        captureExpeditionWizardDraftFieldsFromDom();

        expedicaoRouteWizardOverlay?.setLoading(true, 'Abrindo Google Maps...');
        try {
            const factory = await getExpeditionFactoryAddressSnapshot();
            if (!factory.ok) {
                alertAppDialog(factory.message);
                return;
            }

            const metrics = readExpeditionWizardManualMetricsFromDom();
            const openMaps = typeof openExpeditionRouteMapsInGoogle === 'function'
                ? openExpeditionRouteMapsInGoogle
                : null;
            if (!openMaps) {
                alertAppDialog('Módulo de rotas não carregado.');
                return;
            }

            const maps = openMaps(
                expedicaoWizardState.stops.map(stop => ({ addr: stop.addr })),
                factory.snapshot,
                metrics
            );
            if (!maps.ok) {
                alertAppDialog(maps.message);
                return;
            }

            expedicaoWizardState.maps = maps;
            expedicaoWizardState.step = 'meta';
            renderExpedicaoRouteWizard();
        } finally {
            expedicaoRouteWizardOverlay?.setLoading(false);
        }
        return;
    }

}

function closeExpedicaoRouteDetailModal() {
    const modal = document.getElementById('expedition-route-detail-modal');
    modal?.classList.add('hidden');
    const titleEl = modal?.querySelector('h3');
    if (titleEl) titleEl.textContent = 'Detalhe da rota';
    if (typeof setExpeditionRouteDetailModalActionsVisibility === 'function') {
        setExpeditionRouteDetailModalActionsVisibility();
    } else {
        document.getElementById('btn-expedition-route-detail-history')?.classList.remove('hidden');
    }
}
window.closeExpedicaoRouteDetailModal = closeExpedicaoRouteDetailModal;

function bindExpedicaoRouteWizardEvents() {
    document.getElementById('btn-expedition-route-wizard-close')?.addEventListener('click', closeExpedicaoRouteWizard);
    document.getElementById('btn-expedition-route-detail-close')?.addEventListener('click', closeExpedicaoRouteDetailModal);
    document.getElementById('btn-expedition-route-detail-close-footer')?.addEventListener('click', closeExpedicaoRouteDetailModal);
    const closeHistory = typeof closeExpedicaoRouteHistoryModal === 'function'
        ? closeExpedicaoRouteHistoryModal
        : () => document.getElementById('expedition-route-history-modal')?.classList.add('hidden');
    document.getElementById('btn-expedition-route-history-close')?.addEventListener('click', closeHistory);
    document.getElementById('btn-expedition-route-history-close-top')?.addEventListener('click', closeHistory);
}

window.openExpedicaoRouteWizard = openExpedicaoRouteWizard;
window.bindExpedicaoRouteWizardEvents = bindExpedicaoRouteWizardEvents;