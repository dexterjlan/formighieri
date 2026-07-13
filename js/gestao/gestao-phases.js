let gestaoOrderPhasesDraft = [];
let gestaoOrderPhasesTempCounter = 0;

function hasGestaoOrderMultiplePhases(phases = gestaoOrderPhasesDraft) {
    return (phases || []).length >= 2;
}

function clearGestaoOrderPhasesDraft() {
    gestaoOrderPhasesDraft = [];
}

function setGestaoOrderPhasesDraft(phases = []) {
    gestaoOrderPhasesDraft = (phases || []).map((phase, index) => ({
        id: phase.id,
        orderId: phase.orderId || null,
        orderCode: phase.orderCode || '',
        name: phase.name || '',
        deliveryDate: phase.deliveryDate || '',
        sortOrder: phase.sortOrder != null ? Number(phase.sortOrder) : index + 1
    }));
}

function getGestaoOrderPhasesDraft() {
    return gestaoOrderPhasesDraft;
}

function getGestaoOrderPhaseLabel(phase) {
    if (!phase) return '—';
    const dateLabel = typeof formatGestaoDate === 'function'
        ? formatGestaoDate(phase.deliveryDate)
        : (phase.deliveryDate || '—');
    return `${phase.name || 'Fase'} · ${dateLabel}`;
}

function getGestaoFirstOrderPhaseId(phases = gestaoOrderPhasesDraft) {
    return phases?.[0]?.id || null;
}

function resolveGestaoDeliveryPhaseIdFromForm(value) {
    if (value == null || value === '') return null;

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;

    return String(value);
}

function resolveGestaoDeliveryPhaseIdForPersist(rawId, phases = gestaoOrderPhasesDraft) {
    if (rawId == null || rawId === '') return null;

    const numeric = Number(rawId);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;

    const phase = (phases || []).find(item => String(item.id) === String(rawId));
    if (!phase) return null;

    const phaseNumeric = Number(phase.id);
    if (Number.isFinite(phaseNumeric) && phaseNumeric > 0) return phaseNumeric;

    return null;
}

async function applyGestaoProjectDeliveryPhaseUpdate(projectId, deliveryPhaseId, now = new Date().toISOString()) {
    const normalizedProjectId = Number(projectId);
    if (!normalizedProjectId) return;

    const resolvedPhaseId = resolveGestaoDeliveryPhaseIdForPersist(deliveryPhaseId);
    const payload = {
        deliveryPhaseId: resolvedPhaseId,
        updatedAt: now
    };

    if (typeof currentUser !== 'undefined' && currentUser?.id) {
        payload.updatedById = currentUser.id;
    }

    const { error } = await supabaseClient
        .from('OrderProject')
        .update(payload)
        .eq('id', normalizedProjectId);

    if (error?.message?.includes('deliveryPhaseId')
        && (error.message?.includes('column') || error.message?.includes('schema cache'))) {
        return;
    }

    if (error) {
        throw new Error(`Não foi possível salvar a fase de entrega do projeto: ${error.message}`);
    }
}

function normalizeGestaoPhasesForCompare(phases = []) {
    return (phases || [])
        .map((phase, index) => ({
            name: String(phase.name || '').trim(),
            deliveryDate: phase.deliveryDate || null,
            sortOrder: index + 1
        }))
        .filter(phase => phase.name && phase.deliveryDate);
}

function gestaoPhasesAreEqual(left = [], right = []) {
    const normalizedLeft = normalizeGestaoPhasesForCompare(left);
    const normalizedRight = normalizeGestaoPhasesForCompare(right);

    if (normalizedLeft.length !== normalizedRight.length) return false;

    return normalizedLeft.every((phase, index) => {
        const other = normalizedRight[index];
        return phase.name === other.name
            && phase.deliveryDate === other.deliveryDate
            && phase.sortOrder === other.sortOrder;
    });
}

function ensureGestaoProjectsHavePhaseDefaults() {
    if (!hasGestaoOrderMultiplePhases()) return;

    const firstPhaseId = getGestaoFirstOrderPhaseId();
    if (!firstPhaseId) return;

    gestaoOrderProjectsDraft = (gestaoOrderProjectsDraft || []).map(project => ({
        ...project,
        deliveryPhaseId: project.deliveryPhaseId || firstPhaseId
    }));
    renderGestaoProjectsSummaryList();
}

function createGestaoOrderPhaseTempId() {
    gestaoOrderPhasesTempCounter += 1;
    return `tmp-phase-${gestaoOrderPhasesTempCounter}`;
}

function assignGestaoFirstPhaseToAllProjects() {
    const firstPhaseId = getGestaoFirstOrderPhaseId();
    if (!firstPhaseId || !hasGestaoOrderMultiplePhases()) return;

    gestaoOrderProjectsDraft = (gestaoOrderProjectsDraft || []).map(project => ({
        ...project,
        deliveryPhaseId: firstPhaseId
    }));
    renderGestaoProjectsSummaryList();
}

function clearGestaoPhaseFromAllProjects() {
    gestaoOrderProjectsDraft = (gestaoOrderProjectsDraft || []).map(project => ({
        ...project,
        deliveryPhaseId: null
    }));
    renderGestaoProjectsSummaryList();
}

function mapGestaoProjectPhaseIds(projects, phases, previousPhases = []) {
    if (!hasGestaoOrderMultiplePhases(phases)) {
        return (projects || []).map(project => ({ ...project, deliveryPhaseId: null }));
    }

    const idMap = {};
    phases.forEach((phase, index) => {
        const previousId = previousPhases[index]?.id;
        if (previousId != null && phase.id != null) {
            idMap[String(previousId)] = phase.id;
        }
    });

    const firstPhaseId = phases[0]?.id || null;

    return (projects || []).map(project => {
        let deliveryPhaseId = project.deliveryPhaseId || null;
        const mappedId = deliveryPhaseId != null ? idMap[String(deliveryPhaseId)] : null;
        if (mappedId != null) {
            deliveryPhaseId = mappedId;
        } else if (deliveryPhaseId == null && firstPhaseId != null) {
            deliveryPhaseId = firstPhaseId;
        }
        return {
            ...project,
            deliveryPhaseId: resolveGestaoDeliveryPhaseIdForPersist(deliveryPhaseId, phases)
        };
    });
}

async function fetchGestaoOrderPhases(orderId) {
    const normalizedId = Number(orderId);
    if (!normalizedId) return [];

    const result = await supabaseClient
        .from('OrderDeliveryPhase')
        .select('id, orderId, orderCode, name, deliveryDate, sortOrder')
        .eq('orderId', normalizedId)
        .order('sortOrder', { ascending: true });

    if (result.error?.message?.includes('OrderDeliveryPhase')) {
        return [];
    }

    if (result.error) {
        console.error('fetchGestaoOrderPhases:', result.error);
        return [];
    }

    return result.data || [];
}

async function loadGestaoOrderPhasesForOrder(orderId) {
    const phases = await fetchGestaoOrderPhases(orderId);
    setGestaoOrderPhasesDraft(phases);
    return phases;
}

async function persistGestaoOrderPhases(orderId, orderCode, phases = gestaoOrderPhasesDraft) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return [];

    const previousPhases = await fetchGestaoOrderPhases(normalizedOrderId);
    const normalizedPhases = normalizeGestaoPhasesForCompare(phases);

    if (normalizedPhases.length < 2) {
        const { error: deleteError } = await supabaseClient
            .from('OrderDeliveryPhase')
            .delete()
            .eq('orderId', normalizedOrderId);

        if (deleteError && !deleteError.message?.includes('OrderDeliveryPhase')) {
            throw deleteError;
        }

        await supabaseClient
            .from('OrderProject')
            .update({ deliveryPhaseId: null })
            .eq('orderId', normalizedOrderId);

        clearGestaoOrderPhasesDraft();
        return [];
    }

    if (gestaoPhasesAreEqual(normalizedPhases, previousPhases)) {
        setGestaoOrderPhasesDraft(previousPhases);
        return previousPhases;
    }

    const { error: deleteExistingError } = await supabaseClient
        .from('OrderDeliveryPhase')
        .delete()
        .eq('orderId', normalizedOrderId);

    if (deleteExistingError) {
        if (deleteExistingError.message?.includes('OrderDeliveryPhase')) {
            throw new Error('Execute supabase/create-order-delivery-phases.sql no Supabase.');
        }
        throw deleteExistingError;
    }

    const now = new Date().toISOString();
    const rows = normalizedPhases.map(phase => ({
        orderId: normalizedOrderId,
        orderCode: String(orderCode || '').trim(),
        name: phase.name,
        deliveryDate: phase.deliveryDate,
        sortOrder: phase.sortOrder,
        updatedAt: now
    }));

    const { data: inserted, error: insertError } = await supabaseClient
        .from('OrderDeliveryPhase')
        .insert(rows)
        .select('id, orderId, orderCode, name, deliveryDate, sortOrder');

    if (insertError) {
        if (insertError.message?.includes('OrderDeliveryPhase')) {
            throw new Error('Execute supabase/create-order-delivery-phases.sql no Supabase.');
        }
        throw insertError;
    }

    setGestaoOrderPhasesDraft(inserted || []);
    return inserted || [];
}

function syncGestaoOrderClientDeliveryField() {
    const input = document.getElementById('gestao-ord-client-delivery');
    if (!input) return;

    const disabled = hasGestaoOrderMultiplePhases();
    input.disabled = disabled;
    input.classList.toggle('bg-slate-100', disabled);
    input.classList.toggle('text-slate-600', disabled);
    input.classList.toggle('cursor-not-allowed', disabled);
}

function syncGestaoProjectPhaseFieldVisibility() {
    const wrap = document.getElementById('gestao-project-phase-wrap');
    const select = document.getElementById('gestao-project-phase');
    if (!wrap || !select) return;

    const visible = hasGestaoOrderMultiplePhases();
    wrap.classList.toggle('hidden', !visible);
    select.required = visible;
    syncGestaoOrderClientDeliveryField();
    if (!visible) {
        select.innerHTML = '<option value="">—</option>';
        select.value = '';
        return;
    }

    populateGestaoProjectPhaseSelect(select.value || '');
}

async function fetchGestaoOrderPhasesByOrderIds(orderIds) {
    const normalizedIds = [...new Set(orderIds.map(id => Number(id)).filter(Boolean))];
    if (!normalizedIds.length) return {};

    const result = await supabaseClient
        .from('OrderDeliveryPhase')
        .select('id, orderId, orderCode, name, deliveryDate, sortOrder')
        .in('orderId', normalizedIds)
        .order('sortOrder', { ascending: true });

    if (result.error?.message?.includes('OrderDeliveryPhase')) {
        return {};
    }

    if (result.error) {
        console.error('fetchGestaoOrderPhasesByOrderIds:', result.error);
        return {};
    }

    const byOrderId = {};
    (result.data || []).forEach(phase => {
        const orderId = Number(phase.orderId);
        if (!byOrderId[orderId]) byOrderId[orderId] = [];
        byOrderId[orderId].push(phase);
    });
    return byOrderId;
}

function orderHasGestaoDeliveryPhases(order) {
    return (order?.deliveryPhases || []).length >= 2;
}

function populateGestaoProjectPhaseSelect(selectedId = '') {
    const select = document.getElementById('gestao-project-phase');
    if (!select) return;

    if (!hasGestaoOrderMultiplePhases()) {
        select.innerHTML = '<option value="">—</option>';
        select.value = '';
        return;
    }

    const selectedValue = selectedId != null && selectedId !== '' ? String(selectedId) : '';
    select.innerHTML = gestaoOrderPhasesDraft.map(phase => `
        <option value="${escapeHtml(String(phase.id))}">
            ${escapeHtml(getGestaoOrderPhaseLabel(phase))}
        </option>
    `).join('');

    const matchingPhase = gestaoOrderPhasesDraft.find(phase => String(phase.id) === selectedValue);
    if (matchingPhase) {
        select.value = String(matchingPhase.id);
    } else if (gestaoOrderPhasesDraft.length) {
        select.value = String(gestaoOrderPhasesDraft[0].id);
    }
}

function renderGestaoOrderPhasesModalRows(phases = []) {
    const list = document.getElementById('gestao-order-phases-list');
    if (!list) return;

    const rows = phases.length ? phases : [{
        id: createGestaoOrderPhaseTempId(),
        name: 'Fase 1',
        deliveryDate: document.getElementById('gestao-ord-client-delivery')?.value || ''
    }];

    list.innerHTML = rows.map((phase, index) => `
        <div class="gestao-order-phase-row grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-end border border-slate-200 rounded-lg p-3 bg-white"
            data-phase-row-id="${escapeHtml(String(phase.id))}">
            <div>
                <label class="block text-[10px] font-semibold text-slate-500 mb-1">Nome da fase <span class="text-red-500">*</span></label>
                <input type="text"
                    class="gestao-order-phase-name w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600"
                    value="${escapeHtml(phase.name || `Fase ${index + 1}`)}"
                    placeholder="Ex.: Fase 1">
            </div>
            <div>
                <label class="block text-[10px] font-semibold text-slate-500 mb-1">Data de entrega <span class="text-red-500">*</span></label>
                <input type="date"
                    class="gestao-order-phase-date w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600"
                    value="${escapeHtml(typeof toGestaoInputDate === 'function' ? toGestaoInputDate(phase.deliveryDate) : (phase.deliveryDate || ''))}">
            </div>
            <button type="button"
                class="gestao-order-phase-remove text-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg font-medium ${rows.length <= 1 ? 'opacity-40 cursor-not-allowed' : ''}"
                ${rows.length <= 1 ? 'disabled' : ''}>
                Remover
            </button>
        </div>
    `).join('');
}

function collectGestaoOrderPhasesModalRows() {
    const rows = [...document.querySelectorAll('#gestao-order-phases-list .gestao-order-phase-row')];
    return rows.map((row, index) => ({
        id: row.dataset.phaseRowId || createGestaoOrderPhaseTempId(),
        name: row.querySelector('.gestao-order-phase-name')?.value.trim() || '',
        deliveryDate: row.querySelector('.gestao-order-phase-date')?.value || '',
        sortOrder: index + 1
    }));
}

function openGestaoOrderPhasesModal() {
    const orderCode = document.getElementById('gestao-ord-code')?.value?.trim() || '';
    const subtitle = document.getElementById('gestao-order-phases-subtitle');
    if (subtitle) {
        subtitle.textContent = orderCode
            ? `Pedido ${orderCode} · cadastre 2 ou mais fases para dividir a entrega.`
            : 'Cadastre 2 ou mais fases para dividir a entrega do pedido.';
    }

    const initialRows = gestaoOrderPhasesDraft.length
        ? gestaoOrderPhasesDraft
        : [{
            id: createGestaoOrderPhaseTempId(),
            name: 'Fase 1',
            deliveryDate: document.getElementById('gestao-ord-client-delivery')?.value || ''
        }];

    renderGestaoOrderPhasesModalRows(initialRows);
    toggleModal('gestao-order-phases-modal', true);
}

async function saveGestaoOrderPhasesFromModal() {
    const rows = collectGestaoOrderPhasesModalRows();
    const validRows = rows.filter(row => row.name && row.deliveryDate);

    if (!validRows.length) {
        alertAppDialog('Informe ao menos uma fase com nome e data de entrega.');
        return;
    }

    for (const row of validRows) {
        if (!row.name) {
            alertAppDialog('Informe o nome de todas as fases.');
            return;
        }
        if (!row.deliveryDate) {
            alertAppDialog('Informe a data de entrega de todas as fases.');
            return;
        }
    }

    if (validRows.length < 2) {
        setGestaoOrderPhasesDraft([]);
        clearGestaoPhaseFromAllProjects();

        if (editingGestaoOrderId) {
            try {
                await persistGestaoOrderPhases(editingGestaoOrderId, document.getElementById('gestao-ord-code')?.value?.trim() || '', []);
            } catch (error) {
                alertAppDialog(`Erro ao remover fases: ${error.message}`);
                return;
            }
        }

        toggleModal('gestao-order-phases-modal', false);
        syncGestaoProjectPhaseFieldVisibility();
        return;
    }

    const orderCode = document.getElementById('gestao-ord-code')?.value?.trim() || '';
    setGestaoOrderPhasesDraft(validRows.map(row => ({
        ...row,
        orderCode
    })));

    assignGestaoFirstPhaseToAllProjects();

    if (editingGestaoOrderId) {
        try {
            const previousPhases = await fetchGestaoOrderPhases(editingGestaoOrderId);
            const persisted = await persistGestaoOrderPhases(
                editingGestaoOrderId,
                orderCode,
                gestaoOrderPhasesDraft
            );
            gestaoOrderProjectsDraft = mapGestaoProjectPhaseIds(
                gestaoOrderProjectsDraft,
                persisted,
                previousPhases
            );
            ensureGestaoProjectsHavePhaseDefaults();
            renderGestaoProjectsSummaryList();
        } catch (error) {
            alertAppDialog(`Erro ao salvar fases: ${error.message}`);
            return;
        }
    }

    toggleModal('gestao-order-phases-modal', false);
    syncGestaoProjectPhaseFieldVisibility();
}

function bindGestaoPhasesEvents() {
    document.getElementById('btn-gestao-order-phases')?.addEventListener('click', openGestaoOrderPhasesModal);
    document.getElementById('btn-gestao-order-phases-save')?.addEventListener('click', saveGestaoOrderPhasesFromModal);
    document.getElementById('btn-gestao-order-phases-cancel')?.addEventListener('click', () => {
        toggleModal('gestao-order-phases-modal', false);
    });
    document.getElementById('btn-close-gestao-order-phases')?.addEventListener('click', () => {
        toggleModal('gestao-order-phases-modal', false);
    });

    document.getElementById('btn-gestao-order-phase-add')?.addEventListener('click', () => {
        const rows = collectGestaoOrderPhasesModalRows();
        rows.push({
            id: createGestaoOrderPhaseTempId(),
            name: `Fase ${rows.length + 1}`,
            deliveryDate: ''
        });
        renderGestaoOrderPhasesModalRows(rows);
    });

    document.getElementById('gestao-order-phases-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('.gestao-order-phase-remove');
        if (!button || button.disabled) return;

        const row = button.closest('.gestao-order-phase-row');
        if (!row) return;

        const rows = collectGestaoOrderPhasesModalRows()
            .filter(item => String(item.id) !== String(row.dataset.phaseRowId));

        renderGestaoOrderPhasesModalRows(rows.length ? rows : [{
            id: createGestaoOrderPhaseTempId(),
            name: 'Fase 1',
            deliveryDate: document.getElementById('gestao-ord-client-delivery')?.value || ''
        }]);
    });
}

window.hasGestaoOrderMultiplePhases = hasGestaoOrderMultiplePhases;
window.clearGestaoOrderPhasesDraft = clearGestaoOrderPhasesDraft;
window.loadGestaoOrderPhasesForOrder = loadGestaoOrderPhasesForOrder;
window.persistGestaoOrderPhases = persistGestaoOrderPhases;
window.mapGestaoProjectPhaseIds = mapGestaoProjectPhaseIds;
window.populateGestaoProjectPhaseSelect = populateGestaoProjectPhaseSelect;
window.resolveGestaoDeliveryPhaseIdFromForm = resolveGestaoDeliveryPhaseIdFromForm;
window.resolveGestaoDeliveryPhaseIdForPersist = resolveGestaoDeliveryPhaseIdForPersist;
window.ensureGestaoProjectsHavePhaseDefaults = ensureGestaoProjectsHavePhaseDefaults;
window.applyGestaoProjectDeliveryPhaseUpdate = applyGestaoProjectDeliveryPhaseUpdate;
window.syncGestaoProjectPhaseFieldVisibility = syncGestaoProjectPhaseFieldVisibility;
window.syncGestaoOrderClientDeliveryField = syncGestaoOrderClientDeliveryField;
window.fetchGestaoOrderPhasesByOrderIds = fetchGestaoOrderPhasesByOrderIds;
window.orderHasGestaoDeliveryPhases = orderHasGestaoDeliveryPhases;
window.getGestaoOrderPhaseLabel = getGestaoOrderPhaseLabel;
