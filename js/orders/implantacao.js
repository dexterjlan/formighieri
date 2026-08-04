const IMPLANTACAO_STATUS_ABERTO = 'Aberto';
const IMPLANTACAO_STATUS_ENVIADO_PRODUCAO = 'Enviado para Produção';
const IMPLANTACAO_STATUS_ENCERRADO = 'Encerrado';
const IMPLANTACAO_PROJECT_STATUS_IMPLANTACAO = 'Implantação';
const IMPLANTACAO_PROJECT_STATUS_EM_PRODUCAO = 'Em Produção';

const IMPLANTACAO_PURCHASE_TYPE_MATERIAL = 'Material';
const IMPLANTACAO_PURCHASE_TYPE_FERRAGEM = 'Ferragem';
const IMPLANTACAO_PURCHASE_TYPE_TINTA = 'Tinta';
const IMPLANTACAO_PURCHASE_TYPE_TERCEIRO = 'Terceiro';

const IMPLANTACAO_STANDARD_PURCHASE_UI = [
    {
        purchaseType: IMPLANTACAO_PURCHASE_TYPE_MATERIAL,
        label: 'Lista de Material',
        checkedId: 'implantacao-compras-checked',
        pathId: 'implantacao-compras-path',
        comercialId: 'implantacao-compras-enviado-comercial',
        comercialDateId: 'implantacao-compras-enviado-comercial-date'
    },
    {
        purchaseType: IMPLANTACAO_PURCHASE_TYPE_FERRAGEM,
        label: 'Lista de Ferragens',
        checkedId: 'implantacao-ferragens-checked',
        pathId: 'implantacao-ferragens-path',
        comercialId: 'implantacao-ferragens-enviado-comercial',
        comercialDateId: 'implantacao-ferragens-enviado-comercial-date'
    },
    {
        purchaseType: IMPLANTACAO_PURCHASE_TYPE_TINTA,
        label: 'Lista de Tintas',
        checkedId: 'implantacao-tintas-checked',
        pathId: 'implantacao-tintas-path',
        comercialId: 'implantacao-tintas-enviado-comercial',
        comercialDateId: 'implantacao-tintas-enviado-comercial-date'
    }
];

let activeImplantacaoOrderProjectId = null;
let activeImplantacaoRecord = null;
let activeImplantacaoProjectName = '';
let activeImplantacaoPurchaseItems = [];
let implantacaoThirdPartySubtypesCache = [];

function canAccessImplantacaoModal() {
    return Boolean(activeOrderId)
        || (typeof canSeePendenciasPpcpItems === 'function' && canSeePendenciasPpcpItems())
        || (typeof canSeePendenciasComprasMenu === 'function' && canSeePendenciasComprasMenu());
}

function canActImplantacao() {
    return canActPendenciasPpcpStatus();
}

function getImplantacaoStatusBadgeClass(status) {
    if (status === IMPLANTACAO_STATUS_ENVIADO_PRODUCAO) return 'bg-violet-100 text-violet-800';
    if (status === IMPLANTACAO_STATUS_ENCERRADO) return 'bg-slate-200 text-slate-700';
    return 'bg-teal-100 text-teal-800';
}

function formatImplantacaoComercialDate(dateStr) {
    if (!dateStr) return '';
    return typeof formatDate === 'function' ? formatDate(dateStr) : dateStr;
}

function updateImplantacaoComercialDateLabel(checkboxId, dateLabelId, dateValue) {
    const checkbox = document.getElementById(checkboxId);
    const dateLabel = document.getElementById(dateLabelId);
    if (!dateLabel) return;

    const formatted = formatImplantacaoComercialDate(dateValue);
    dateLabel.textContent = formatted ? `· ${formatted}` : '';
    if (checkbox) {
        dateLabel.classList.toggle('text-slate-500', Boolean(formatted));
        dateLabel.classList.toggle('text-slate-400', !formatted);
    }
}

function getImplantacaoPurchaseItemsByType(purchaseType) {
    return (activeImplantacaoPurchaseItems || []).filter(item => item.purchaseType === purchaseType);
}

function getImplantacaoStandardPurchaseItem(purchaseType) {
    return getImplantacaoPurchaseItemsByType(purchaseType)[0] || null;
}

function getImplantacaoTerceiroPurchaseItems() {
    return getImplantacaoPurchaseItemsByType(IMPLANTACAO_PURCHASE_TYPE_TERCEIRO);
}

function readImplantacaoStandardChecked(checkboxId, item) {
    if (Boolean(item?.sentToCommercial)) {
        return Boolean(item?.isChecked);
    }
    return Boolean(document.getElementById(checkboxId)?.checked);
}

function readImplantacaoPurchaseItemsFromForm() {
    const items = [];

    IMPLANTACAO_STANDARD_PURCHASE_UI.forEach(config => {
        const existing = getImplantacaoStandardPurchaseItem(config.purchaseType);
        items.push({
            ...(existing || {}),
            purchaseType: config.purchaseType,
            folderPath: document.getElementById(config.pathId)?.value?.trim() || '',
            isChecked: readImplantacaoStandardChecked(config.checkedId, existing),
            sentToCommercial: Boolean(existing?.sentToCommercial),
            sentToCommercialAt: existing?.sentToCommercialAt || null,
            thirdPartySubtypeId: null
        });
    });

    document.querySelectorAll('.implantacao-terceiro-item').forEach(row => {
        const itemId = Number(row.dataset.itemId);
        const existing = activeImplantacaoPurchaseItems.find(item => Number(item.id) === itemId) || {};
        const sentToCommercial = Boolean(existing.sentToCommercial);
        const checkedInput = row.querySelector('.implantacao-terceiro-checked');
        const pathInput = row.querySelector('.implantacao-terceiro-path');

        items.push({
            ...existing,
            id: itemId || existing.id || null,
            purchaseType: IMPLANTACAO_PURCHASE_TYPE_TERCEIRO,
            thirdPartySubtypeId: Number(row.dataset.subtypeId) || existing.thirdPartySubtypeId || null,
            thirdPartySubtype: existing.thirdPartySubtype || null,
            folderPath: pathInput?.value?.trim() || '',
            isChecked: sentToCommercial ? Boolean(existing.isChecked) : Boolean(checkedInput?.checked),
            sentToCommercial,
            sentToCommercialAt: existing.sentToCommercialAt || null
        });
    });

    return items;
}

function readImplantacaoFormValues() {
    const purchaseItems = readImplantacaoPurchaseItemsFromForm();

    return {
        projetoPath: document.getElementById('implantacao-projeto-path')?.value?.trim() || '',
        projetoChecked: Boolean(document.getElementById('implantacao-projeto-checked')?.checked),
        wpsOpCode: document.getElementById('implantacao-wps-op-code')?.value?.trim() || '',
        purchaseItems
    };
}

function populateImplantacaoStandardPurchaseFields() {
    IMPLANTACAO_STANDARD_PURCHASE_UI.forEach(config => {
        const item = getImplantacaoStandardPurchaseItem(config.purchaseType);
        const pathInput = document.getElementById(config.pathId);
        const checkedInput = document.getElementById(config.checkedId);
        const comercialInput = document.getElementById(config.comercialId);

        if (pathInput) {
            pathInput.value = item?.folderPath || '';
            if (Boolean(item?.sentToCommercial)) pathInput.disabled = true;
        }
        if (checkedInput) {
            checkedInput.checked = Boolean(item?.isChecked);
            if (Boolean(item?.sentToCommercial)) checkedInput.disabled = true;
        }
        if (comercialInput) comercialInput.checked = Boolean(item?.sentToCommercial);

        updateImplantacaoComercialDateLabel(
            config.comercialId,
            config.comercialDateId,
            item?.sentToCommercial ? item?.sentToCommercialAt : null
        );
    });
}

function getImplantacaoTerceiroDisplayName(item) {
    return item?.thirdPartySubtype?.name || 'Terceiros';
}

function renderImplantacaoTerceiroPurchaseItems() {
    const container = document.getElementById('implantacao-terceiros-items');
    if (!container) return;

    const items = getImplantacaoTerceiroPurchaseItems();
    if (!items.length) {
        container.innerHTML = '<p class="text-xs text-slate-400">Nenhum subtipo adicionado.</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        const sentToCommercial = Boolean(item.sentToCommercial);
        const subtypeId = item.thirdPartySubtypeId || item.thirdPartySubtype?.id || '';
        const label = escapeHtml(getImplantacaoTerceiroDisplayName(item));
        const removeButton = sentToCommercial
            ? ''
            : `<button type="button"
                class="implantacao-terceiro-remove text-[10px] text-red-600 hover:text-red-800 font-medium shrink-0"
                data-item-id="${item.id}">Remover</button>`;

        return `
            <div class="implantacao-terceiro-item flex items-start gap-3" data-item-id="${item.id}" data-subtype-id="${subtypeId}">
                <input type="checkbox" class="implantacao-terceiro-checked mt-1 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                    ${item.isChecked ? 'checked' : ''} ${sentToCommercial ? 'disabled' : ''}>
                <div class="flex-1 space-y-1 min-w-0">
                    <div class="flex items-center justify-between gap-3">
                        <span class="text-xs font-semibold text-slate-700">${label}</span>
                        <div class="flex items-center gap-2 shrink-0">
                            <label class="inline-flex items-center gap-2 text-xs text-slate-600 cursor-default">
                                <input type="checkbox" class="implantacao-terceiro-enviado-comercial rounded border-slate-300 text-amber-600 cursor-not-allowed" disabled
                                    ${sentToCommercial ? 'checked' : ''}>
                                <span>Enviado para comercial</span>
                                <span class="implantacao-terceiro-enviado-date text-slate-400">${sentToCommercial && item.sentToCommercialAt ? `· ${escapeHtml(formatImplantacaoComercialDate(item.sentToCommercialAt))}` : ''}</span>
                            </label>
                            ${removeButton}
                        </div>
                    </div>
                    <input type="text" class="implantacao-terceiro-path w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
                        placeholder="Caminho da pasta" value="${escapeHtml(item.folderPath || '')}" ${sentToCommercial ? 'disabled' : ''}>
                </div>
            </div>
        `;
    }).join('');
}

async function loadImplantacaoThirdPartySubtypes(activeOnly = true) {
    if (typeof loadGestaoThirdPartySubtypes === 'function') {
        implantacaoThirdPartySubtypesCache = await loadGestaoThirdPartySubtypes(activeOnly);
        return implantacaoThirdPartySubtypesCache;
    }

    let query = supabaseClient
        .from('ThirdPartySubtype')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;
    if (error) {
        console.error('loadImplantacaoThirdPartySubtypes:', error);
        implantacaoThirdPartySubtypesCache = [];
        return [];
    }

    implantacaoThirdPartySubtypesCache = data || [];
    return implantacaoThirdPartySubtypesCache;
}

function populateImplantacaoTerceiroSubtypeSelect() {
    const select = document.getElementById('implantacao-terceiros-subtype-select');
    if (!select) return;

    const usedSubtypeIds = new Set(
        getImplantacaoTerceiroPurchaseItems()
            .map(item => Number(item.thirdPartySubtypeId))
            .filter(Boolean)
    );

    const options = (implantacaoThirdPartySubtypesCache || [])
        .filter(subtype => subtype.isActive !== false && !usedSubtypeIds.has(Number(subtype.id)))
        .map(subtype => `<option value="${subtype.id}">${escapeHtml(subtype.name)}</option>`)
        .join('');

    select.innerHTML = `<option value="">Selecione...</option>${options}`;
    select.disabled = !options;
}

function populateImplantacaoForm(record) {
    document.getElementById('implantacao-projeto-path').value = record?.projetoPath || '';
    document.getElementById('implantacao-projeto-checked').checked = Boolean(record?.projetoChecked);
    document.getElementById('implantacao-wps-op-code').value = record?.wpsOpCode || '';

    populateImplantacaoStandardPurchaseFields();
    renderImplantacaoTerceiroPurchaseItems();
    populateImplantacaoTerceiroSubtypeSelect();

    const badge = document.getElementById('implantacao-modal-status-badge');
    const status = record?.status || IMPLANTACAO_STATUS_ABERTO;
    if (badge) {
        badge.textContent = status;
        badge.className = `text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${getImplantacaoStatusBadgeClass(status)}`;
    }
}

function setImplantacaoComercialFieldsDisabled() {
    IMPLANTACAO_STANDARD_PURCHASE_UI.forEach(config => {
        const el = document.getElementById(config.comercialId);
        if (el) el.disabled = true;
    });
}

function setImplantacaoProjetoFieldsDisabled(disabled) {
    [
        'implantacao-projeto-path',
        'implantacao-projeto-checked'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    });
}

function setImplantacaoFormDisabled(disabled) {
    IMPLANTACAO_STANDARD_PURCHASE_UI.forEach(config => {
        const item = getImplantacaoStandardPurchaseItem(config.purchaseType);
        const sentToCommercial = Boolean(item?.sentToCommercial);
        const pathEl = document.getElementById(config.pathId);
        const checkedEl = document.getElementById(config.checkedId);
        if (pathEl) pathEl.disabled = disabled || sentToCommercial;
        if (checkedEl) checkedEl.disabled = disabled || sentToCommercial;
    });

    document.getElementById('implantacao-wps-op-code')?.toggleAttribute('disabled', disabled);
    document.getElementById('implantacao-terceiros-subtype-select')?.toggleAttribute('disabled', disabled || !implantacaoThirdPartySubtypesCache.length);
    document.getElementById('btn-implantacao-add-terceiro')?.toggleAttribute('disabled', disabled);

    document.querySelectorAll('.implantacao-terceiro-item').forEach(row => {
        const sentToCommercial = Boolean(
            activeImplantacaoPurchaseItems.find(item => Number(item.id) === Number(row.dataset.itemId))?.sentToCommercial
        );
        const locked = disabled || sentToCommercial;

        const checkedEl = row.querySelector('.implantacao-terceiro-checked');
        const pathEl = row.querySelector('.implantacao-terceiro-path');
        const removeEl = row.querySelector('.implantacao-terceiro-remove');
        if (checkedEl) checkedEl.disabled = locked;
        if (pathEl) pathEl.disabled = locked;
        if (removeEl) removeEl.disabled = locked;
    });

    setImplantacaoComercialFieldsDisabled();
}

function canSendImplantacaoPurchaseItem(item) {
    return Boolean(item?.isChecked)
        && Boolean(item?.folderPath)
        && !item?.sentToCommercial;
}

function updateImplantacaoActionButtons(record = activeImplantacaoRecord) {
    const canAct = canActImplantacao();
    const values = readImplantacaoFormValues();
    const status = record?.status || IMPLANTACAO_STATUS_ABERTO;
    const isEncerrado = status === IMPLANTACAO_STATUS_ENCERRADO;
    const isEnviadoProducao = status === IMPLANTACAO_STATUS_ENVIADO_PRODUCAO
        || status === IMPLANTACAO_STATUS_ENCERRADO;

    const btnProducao = document.getElementById('btn-implantacao-enviar-producao');
    const btnCompras = document.getElementById('btn-implantacao-enviar-compras');
    const btnEncerrar = document.getElementById('btn-implantacao-encerrar');
    const btnSalvar = document.getElementById('btn-implantacao-salvar');

    if (isEncerrado) {
        if (btnProducao) btnProducao.disabled = true;
        if (btnCompras) btnCompras.disabled = true;
        if (btnEncerrar) btnEncerrar.disabled = true;
        if (btnSalvar) btnSalvar.disabled = true;
        setImplantacaoFormDisabled(true);
        setImplantacaoProjetoFieldsDisabled(true);
        return;
    }

    const canEnviarProducao = canAct
        && !isEnviadoProducao
        && values.projetoChecked
        && Boolean(values.projetoPath)
        && Boolean(values.wpsOpCode);

    const canEnviarCompras = canAct
        && (values.purchaseItems || []).some(canSendImplantacaoPurchaseItem);

    const standardItems = IMPLANTACAO_STANDARD_PURCHASE_UI.map(config => (
        values.purchaseItems.find(item => item.purchaseType === config.purchaseType)
    ));
    const terceiroItems = values.purchaseItems.filter(item => item.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO);
    const allStandardChecked = standardItems.every(item => Boolean(item?.isChecked));
    const allTerceirosChecked = !terceiroItems.length || terceiroItems.every(item => Boolean(item?.isChecked));

    const canEncerrar = canAct
        && values.projetoChecked
        && allStandardChecked
        && allTerceirosChecked;

    if (btnProducao) btnProducao.disabled = !canEnviarProducao;
    if (btnCompras) btnCompras.disabled = !canEnviarCompras;
    if (btnEncerrar) btnEncerrar.disabled = !canEncerrar;
    if (btnSalvar) btnSalvar.disabled = !canAct;

    setImplantacaoFormDisabled(!canAct);
    setImplantacaoProjetoFieldsDisabled(isEnviadoProducao || !canAct);
    populateImplantacaoTerceiroSubtypeSelect();
}

async function fetchImplantacaoPurchaseItems(implantacaoId) {
    const { data, error } = await supabaseClient
        .from('ImplantacaoPurchaseItem')
        .select('*, thirdPartySubtype:ThirdPartySubtype(id, name, isActive)')
        .eq('implantacaoId', implantacaoId)
        .order('purchaseType', { ascending: true })
        .order('id', { ascending: true });

    if (error) throw error;
    return data || [];
}

async function ensureStandardImplantacaoPurchaseItems(implantacaoId) {
    const existing = await fetchImplantacaoPurchaseItems(implantacaoId);
    const missingTypes = [IMPLANTACAO_PURCHASE_TYPE_MATERIAL, IMPLANTACAO_PURCHASE_TYPE_FERRAGEM, IMPLANTACAO_PURCHASE_TYPE_TINTA]
        .filter(type => !existing.some(item => item.purchaseType === type));

    if (missingTypes.length) {
        const now = new Date().toISOString();
        const rows = missingTypes.map(purchaseType => ({
            implantacaoId,
            purchaseType,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null,
            updatedAt: now
        }));

        const { error } = await supabaseClient
            .from('ImplantacaoPurchaseItem')
            .insert(rows);

        if (error) throw error;
        return fetchImplantacaoPurchaseItems(implantacaoId);
    }

    return existing;
}

async function loadActiveImplantacaoPurchaseItems(implantacaoId) {
    activeImplantacaoPurchaseItems = await ensureStandardImplantacaoPurchaseItems(implantacaoId);
    return activeImplantacaoPurchaseItems;
}

async function fetchImplantacaoByOrderProjectId(orderProjectId) {
    const { data, error } = await supabaseClient
        .from('Implantacao')
        .select('*')
        .eq('orderProjectId', orderProjectId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

window.fetchImplantacaoByOrderProjectId = fetchImplantacaoByOrderProjectId;

async function createImplantacaoRecord(orderProjectId) {
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('Implantacao')
        .insert({
            orderProjectId,
            status: IMPLANTACAO_STATUS_ABERTO,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null,
            updatedAt: now
        })
        .select('*')
        .single();

    if (error) throw error;

    await ensureStandardImplantacaoPurchaseItems(data.id);
    return data;
}

async function ensureImplantacaoRecord(orderProjectId) {
    const existing = await fetchImplantacaoByOrderProjectId(orderProjectId);
    if (existing) {
        await ensureStandardImplantacaoPurchaseItems(existing.id);
        return existing;
    }
    return createImplantacaoRecord(orderProjectId);
}

async function isOrderProjectInImplantacaoStatus(orderProjectId) {
    const statusId = await getOrderProjectStatusIdForImplantacao(IMPLANTACAO_PROJECT_STATUS_IMPLANTACAO);
    if (!statusId) return false;

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('id, statusId, projectStatus:OrderProjectStatus(name)')
        .eq('id', orderProjectId)
        .maybeSingle();

    if (error) throw error;

    return Number(data?.statusId) === Number(statusId)
        || data?.projectStatus?.name === IMPLANTACAO_PROJECT_STATUS_IMPLANTACAO;
}

async function fetchOrderProjectsInImplantacaoStatus() {
    const statusId = await getOrderProjectStatusIdForImplantacao(IMPLANTACAO_PROJECT_STATUS_IMPLANTACAO);
    if (!statusId) return [];

    let result = await supabaseClient
        .from('OrderProject')
        .select('id, name, orderId, statusId, deliveryDate, projectStatus:OrderProjectStatus(id, name)')
        .eq('statusId', statusId)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('projectStatus')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('id, name, orderId, statusId, deliveryDate')
            .eq('statusId', statusId)
            .order('name', { ascending: true });
    }

    if (result.error) {
        console.error('fetchOrderProjectsInImplantacaoStatus:', result.error);
        return [];
    }

    return result.data || [];
}

async function ensureImplantacaoRecordsForProjects(projects = []) {
    const recordsByProjectId = {};

    for (const project of projects) {
        const projectId = Number(project?.id || project);
        if (!projectId) continue;

        try {
            const record = await ensureImplantacaoRecord(projectId);
            if (record) recordsByProjectId[projectId] = record;
        } catch (error) {
            console.warn('ensureImplantacaoRecordsForProjects:', projectId, error);
        }
    }

    return recordsByProjectId;
}

async function syncImplantacaoRecordsMapForProjects(projects = [], implantacaoByProjectId = {}) {
    const syncedMap = { ...implantacaoByProjectId };
    const missingProjects = (projects || []).filter(project => {
        const statusName = project?.projectStatus?.name || '';
        return statusName === IMPLANTACAO_PROJECT_STATUS_IMPLANTACAO && !syncedMap[project.id];
    });

    if (!missingProjects.length) return syncedMap;

    const createdMap = await ensureImplantacaoRecordsForProjects(missingProjects);
    return { ...syncedMap, ...createdMap };
}

function buildImplantacaoUpdatePayload(formValues, extra = {}) {
    const now = new Date().toISOString();
    return {
        projetoPath: formValues.projetoPath || null,
        projetoChecked: formValues.projetoChecked,
        wpsOpCode: formValues.wpsOpCode || null,
        updatedById: currentUser?.id || null,
        updatedAt: now,
        ...extra
    };
}

function buildImplantacaoPurchaseItemPayload(item, implantacaoId) {
    const now = new Date().toISOString();
    return {
        implantacaoId,
        purchaseType: item.purchaseType,
        thirdPartySubtypeId: item.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO
            ? (item.thirdPartySubtypeId || null)
            : null,
        folderPath: item.folderPath || null,
        isChecked: Boolean(item.isChecked),
        sentToCommercial: Boolean(item.sentToCommercial),
        sentToCommercialAt: item.sentToCommercialAt || null,
        updatedById: currentUser?.id || null,
        updatedAt: now
    };
}

async function saveImplantacaoPurchaseItems(purchaseItems = [], implantacaoId = activeImplantacaoRecord?.id) {
    if (!implantacaoId || !purchaseItems.length) return activeImplantacaoPurchaseItems;

    const now = new Date().toISOString();
    const savedItems = [];

    for (const item of purchaseItems) {
        const payload = buildImplantacaoPurchaseItemPayload(item, implantacaoId);

        if (item.id) {
            const { data, error } = await supabaseClient
                .from('ImplantacaoPurchaseItem')
                .update(payload)
                .eq('id', item.id)
                .select('*, thirdPartySubtype:ThirdPartySubtype(id, name, isActive)')
                .single();

            if (error) throw error;
            savedItems.push(data);
            continue;
        }

        const { data, error } = await supabaseClient
            .from('ImplantacaoPurchaseItem')
            .insert({
                ...payload,
                createdById: currentUser?.id || null,
                createdAt: now
            })
            .select('*, thirdPartySubtype:ThirdPartySubtype(id, name, isActive)')
            .single();

        if (error) throw error;
        savedItems.push(data);
    }

    const refreshed = await fetchImplantacaoPurchaseItems(implantacaoId);
    activeImplantacaoPurchaseItems = refreshed;
    return refreshed;
}

async function saveImplantacaoFormFields(options = {}) {
    const { silent = true } = options;

    if (!activeImplantacaoRecord?.id) return null;

    const formValues = readImplantacaoFormValues();
    const payload = buildImplantacaoUpdatePayload(formValues);

    const { data, error } = await supabaseClient
        .from('Implantacao')
        .update(payload)
        .eq('id', activeImplantacaoRecord.id)
        .select('*')
        .single();

    if (error) {
        if (!silent) {
            alertAppDialog('Erro ao salvar implantação: ' + error.message);
        }
        throw error;
    }

    activeImplantacaoRecord = data;
    await saveImplantacaoPurchaseItems(formValues.purchaseItems, data.id);
    return data;
}

async function addImplantacaoTerceiroPurchaseItem() {
    if (!activeImplantacaoRecord?.id || !canActImplantacao()) return;

    const select = document.getElementById('implantacao-terceiros-subtype-select');
    const subtypeId = Number(select?.value);
    if (!subtypeId) {
        alertAppDialog('Selecione um subtipo de terceiro.');
        return;
    }

    if (getImplantacaoTerceiroPurchaseItems().some(item => Number(item.thirdPartySubtypeId) === subtypeId)) {
        alertAppDialog('Este subtipo já foi adicionado.');
        return;
    }

    const subtype = implantacaoThirdPartySubtypesCache.find(item => Number(item.id) === subtypeId);
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('ImplantacaoPurchaseItem')
        .insert({
            implantacaoId: activeImplantacaoRecord.id,
            purchaseType: IMPLANTACAO_PURCHASE_TYPE_TERCEIRO,
            thirdPartySubtypeId: subtypeId,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null,
            createdAt: now,
            updatedAt: now
        })
        .select('*, thirdPartySubtype:ThirdPartySubtype(id, name, isActive)')
        .single();

    if (error) {
        alertAppDialog('Erro ao adicionar subtipo: ' + error.message);
        return;
    }

    activeImplantacaoPurchaseItems = [...activeImplantacaoPurchaseItems, data];
    if (subtype && !data.thirdPartySubtype) {
        data.thirdPartySubtype = subtype;
    }

    renderImplantacaoTerceiroPurchaseItems();
    populateImplantacaoTerceiroSubtypeSelect();
    updateImplantacaoActionButtons();
}

async function removeImplantacaoTerceiroPurchaseItem(itemId) {
    if (!itemId || !canActImplantacao()) return;

    const item = activeImplantacaoPurchaseItems.find(row => Number(row.id) === Number(itemId));
    if (!item || item.purchaseType !== IMPLANTACAO_PURCHASE_TYPE_TERCEIRO) return;
    if (item.sentToCommercial) {
        alertAppDialog('Não é possível remover um subtipo já enviado para o comercial.');
        return;
    }

    const confirmed = await confirmAppDialog(`Remover "${getImplantacaoTerceiroDisplayName(item)}" da implantação?`);
    if (!confirmed) return;

    const { error } = await supabaseClient
        .from('ImplantacaoPurchaseItem')
        .delete()
        .eq('id', itemId);

    if (error) {
        alertAppDialog('Erro ao remover subtipo: ' + error.message);
        return;
    }

    activeImplantacaoPurchaseItems = activeImplantacaoPurchaseItems.filter(row => Number(row.id) !== Number(itemId));
    renderImplantacaoTerceiroPurchaseItems();
    populateImplantacaoTerceiroSubtypeSelect();
    updateImplantacaoActionButtons();
}

async function getOrderProjectStatusIdForImplantacao(statusName) {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', statusName)
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', statusName)
        .maybeSingle();

    return fallback?.id || null;
}

async function updateOrderProjectStatusForImplantacao(orderProjectId, statusName) {
    const statusId = await getOrderProjectStatusIdForImplantacao(statusName);
    if (!statusId) {
        throw new Error(`Status "${statusName}" não encontrado.`);
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser?.id || null,
            updatedAt: now
        })
        .eq('id', orderProjectId);

    if (error) throw error;
}

async function refreshImplantacaoRelatedViews(orderProjectId) {
    if (activeOrderId && typeof refreshPpcpRelatedViews === 'function') {
        await refreshPpcpRelatedViews(activeOrderId);
    } else if (activeOrderId && typeof loadPpcpProjects === 'function') {
        await loadPpcpProjects(activeOrderId);
    }

    if (typeof loadPendenciasContent === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')
        && pendenciasActiveSection === 'projetista'
        && pendenciasActiveItem === 'implantacao') {
        await loadPendenciasImplantacao();
    }

    if (activeOrderId && typeof loadOrderProjects === 'function') {
        await loadOrderProjects(activeOrderId);
    }

    if (!activeOrderId && orderProjectId && typeof loadPendenciasImplantacao === 'function') {
        await loadPendenciasImplantacao();
    }

    if (typeof loadPendenciasContent === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')
        && pendenciasActiveSection === 'compras'
        && pendenciasActiveItem === 'enviados-compras') {
        await loadPendenciasEnviadosCompras();
    }

    if (typeof refreshActiveOrderComprasTab === 'function') {
        await refreshActiveOrderComprasTab();
    }
}

async function openImplantacaoModal(orderProjectId, projectName = '', options = {}) {
    const { requireExisting = false } = options;
    if (!orderProjectId) return;

    if (!canAccessImplantacaoModal()) {
        alertAppDialog('Sem permissão para acessar a implantação.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    try {
        activeImplantacaoOrderProjectId = Number(orderProjectId);
        activeImplantacaoProjectName = projectName || 'Projeto';
        await loadImplantacaoThirdPartySubtypes(true);

        if (requireExisting) {
            activeImplantacaoRecord = await fetchImplantacaoByOrderProjectId(activeImplantacaoOrderProjectId);
            if (!activeImplantacaoRecord) {
                const inImplantacaoStatus = await isOrderProjectInImplantacaoStatus(activeImplantacaoOrderProjectId);
                if (inImplantacaoStatus && canActImplantacao()) {
                    activeImplantacaoRecord = await ensureImplantacaoRecord(activeImplantacaoOrderProjectId);
                } else {
                    alertAppDialog('Implantação ainda não iniciada para este projeto.');
                    return;
                }
            }
        } else {
            activeImplantacaoRecord = await ensureImplantacaoRecord(activeImplantacaoOrderProjectId);
        }

        await loadActiveImplantacaoPurchaseItems(activeImplantacaoRecord.id);

        document.getElementById('implantacao-modal-project-name').textContent = activeImplantacaoProjectName;
        populateImplantacaoForm(activeImplantacaoRecord);
        updateImplantacaoActionButtons(activeImplantacaoRecord);
        toggleModal('implantacao-modal', true);
    } catch (error) {
        if (error.message?.includes('ImplantacaoPurchaseItem') || error.message?.includes('ThirdPartySubtype')) {
            alertAppDialog('Execute supabase/create-third-party-subtype.sql e supabase/create-implantacao-purchase-item.sql no Supabase.');
        } else if (error.message?.includes('Implantacao') || error.message?.includes('does not exist')) {
            alertAppDialog('Tabela Implantacao não encontrada. Execute supabase/create-implantacao.sql no Supabase.');
        } else {
            alertAppDialog('Erro ao abrir implantação: ' + error.message);
        }
    }
}

function closeImplantacaoModal() {
    setImplantacaoModalLoading(false);
    toggleModal('implantacao-modal', false);
    activeImplantacaoOrderProjectId = null;
    activeImplantacaoRecord = null;
    activeImplantacaoProjectName = '';
    activeImplantacaoPurchaseItems = [];
}
window.closeImplantacaoModal = closeImplantacaoModal;
window.openImplantacaoModal = openImplantacaoModal;
window.ensureImplantacaoRecordsForProjects = ensureImplantacaoRecordsForProjects;
window.fetchOrderProjectsInImplantacaoStatus = fetchOrderProjectsInImplantacaoStatus;
window.syncImplantacaoRecordsMapForProjects = syncImplantacaoRecordsMapForProjects;

const IMPLANTACAO_MODAL_OVERLAY = createModalOverlayConfig('implantacao-modal', {
    disableElementIds: [
        'btn-implantacao-enviar-producao',
        'btn-implantacao-enviar-compras',
        'btn-implantacao-encerrar',
        'btn-implantacao-salvar',
        'btn-implantacao-add-terceiro'
    ],
    reenableElementIdsOnHide: [],
    closeButtonSelector: '#implantacao-modal button[onclick="closeImplantacaoModal()"]',
    disableFormSelector: '#implantacao-modal input:not([disabled]), #implantacao-modal textarea:not([disabled]), #implantacao-modal select:not([disabled])',
    disableDatasetKey: 'implantacaoLoadingDisabled'
});

function setImplantacaoModalLoading(active, message = 'Processando...', status = 'loading') {
    setModalOverlayLoading(IMPLANTACAO_MODAL_OVERLAY, active, message, status);
    if (!active) {
        updateImplantacaoActionButtons(activeImplantacaoRecord);
    }
}

function waitImplantacaoStatus(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function createImplantacaoForProject(orderProjectId) {
    await ensureImplantacaoRecord(orderProjectId);
}

async function handleImplantacaoSalvar() {
    if (!activeImplantacaoRecord?.id) return;

    try {
        setImplantacaoModalLoading(true, 'Salvando implantação...');
        const data = await saveImplantacaoFormFields({ silent: false });
        populateImplantacaoForm(data);
        updateImplantacaoActionButtons(data);
        setImplantacaoModalLoading(true, 'Implantação salva com sucesso!', 'success');
        await waitImplantacaoStatus(1500);
        setImplantacaoModalLoading(false);
    } catch (error) {
        setImplantacaoModalLoading(true, `Erro ao salvar: ${error.message}`, 'error');
        await waitImplantacaoStatus(2500);
        setImplantacaoModalLoading(false);
    }
}

async function handleImplantacaoEnviarProducao() {
    if (!activeImplantacaoRecord?.id || !activeImplantacaoOrderProjectId) return;

    const formValues = readImplantacaoFormValues();
    if (!formValues.projetoChecked || !formValues.projetoPath || !formValues.wpsOpCode) {
        alertAppDialog('Marque o checklist de Projeto, informe o caminho da pasta e o código da OP no WPS.');
        return;
    }

    const confirmed = await confirmAppDialog(
        'O status do projeto será alterado para enviado à produção.',
        {
            title: `Enviar "${activeImplantacaoProjectName}" para produção?`,
            confirmLabel: 'Enviar para produção'
        }
    );
    if (!confirmed) return;

    try {
        setImplantacaoModalLoading(true, 'Salvando e enviando para produção...');
        await saveImplantacaoPurchaseItems(formValues.purchaseItems, activeImplantacaoRecord.id);

        const payload = buildImplantacaoUpdatePayload(formValues, {
            status: IMPLANTACAO_STATUS_ENVIADO_PRODUCAO
        });

        const { data, error } = await supabaseClient
            .from('Implantacao')
            .update(payload)
            .eq('id', activeImplantacaoRecord.id)
            .select('*')
            .single();

        if (error) throw error;

        setImplantacaoModalLoading(true, 'Atualizando status do projeto...');
        await updateOrderProjectStatusForImplantacao(
            activeImplantacaoOrderProjectId,
            IMPLANTACAO_PROJECT_STATUS_EM_PRODUCAO
        );

        activeImplantacaoRecord = data;
        populateImplantacaoForm(data);

        if (typeof notifyImplantacaoEnviarProducaoEmail === 'function') {
            let orderId = activeOrderId;
            let designerId = null;

            const { data: projectMeta } = await supabaseClient
                .from('OrderProject')
                .select('orderId, designerId')
                .eq('id', activeImplantacaoOrderProjectId)
                .maybeSingle();

            orderId = orderId || projectMeta?.orderId || null;
            designerId = projectMeta?.designerId || null;

            await notifyImplantacaoEnviarProducaoEmail({
                orderId,
                orderProjectId: activeImplantacaoOrderProjectId,
                designerId,
                wpsOpCode: formValues.wpsOpCode,
                projetoPath: formValues.projetoPath
            });
        }

        setImplantacaoModalLoading(true, 'Atualizando telas...');
        await refreshImplantacaoRelatedViews(activeImplantacaoOrderProjectId);

        updateImplantacaoActionButtons(data);
        setImplantacaoModalLoading(true, 'Envio para produção concluído!', 'success');
        await waitImplantacaoStatus(1800);
        setImplantacaoModalLoading(false);
    } catch (error) {
        setImplantacaoModalLoading(true, `Erro ao enviar: ${error.message}`, 'error');
        await waitImplantacaoStatus(2500);
        setImplantacaoModalLoading(false);
    }
}

async function handleImplantacaoEnviarCompras() {
    if (!activeImplantacaoRecord?.id) return;

    const formValues = readImplantacaoFormValues();
    const itemsToSend = (formValues.purchaseItems || []).filter(canSendImplantacaoPurchaseItem);

    if (!itemsToSend.length) {
        alertAppDialog('Marque e preencha o caminho de pelo menos um item para enviar às compras.');
        return;
    }

    try {
        setImplantacaoModalLoading(true, 'Registrando solicitações de compra...');
        const now = new Date().toISOString();

        await saveImplantacaoPurchaseItems(formValues.purchaseItems, activeImplantacaoRecord.id);

        const purchaseItemsForCompras = activeImplantacaoPurchaseItems.filter(canSendImplantacaoPurchaseItem);

        await createComprasRecordsFromImplantacaoSend({
            implantacaoId: activeImplantacaoRecord.id,
            orderProjectId: activeImplantacaoOrderProjectId,
            purchaseItems: purchaseItemsForCompras
        });

        const updatedPurchaseItems = activeImplantacaoPurchaseItems.map(item => {
            if (!purchaseItemsForCompras.some(row => Number(row.id) === Number(item.id))) {
                return item;
            }
            return {
                ...item,
                sentToCommercial: true,
                sentToCommercialAt: now
            };
        });

        await saveImplantacaoPurchaseItems(updatedPurchaseItems, activeImplantacaoRecord.id);

        setImplantacaoModalLoading(true, 'Salvando implantação...');
        const payload = buildImplantacaoUpdatePayload(formValues, {
            comprasEnviadoAt: now
        });

        const { data, error } = await supabaseClient
            .from('Implantacao')
            .update(payload)
            .eq('id', activeImplantacaoRecord.id)
            .select('*')
            .single();

        if (error) throw error;

        activeImplantacaoRecord = data;
        populateImplantacaoForm(data);

        setImplantacaoModalLoading(true, 'Atualizando telas...');
        await refreshImplantacaoRelatedViews(activeImplantacaoOrderProjectId);

        if (purchaseItemsForCompras.length && typeof notifyCompraLiberacaoEmails === 'function') {
            setImplantacaoModalLoading(true, 'Enviando e-mail de liberação...');
            await notifyCompraLiberacaoEmails({
                items: purchaseItemsForCompras,
                orderProjectId: activeImplantacaoOrderProjectId
            });
        }

        setImplantacaoModalLoading(true, 'Envio para compras concluído!', 'success');
        await waitImplantacaoStatus(1800);
        setImplantacaoModalLoading(false);
    } catch (error) {
        setImplantacaoModalLoading(true, `Erro ao enviar: ${error.message}`, 'error');
        await waitImplantacaoStatus(2500);
        setImplantacaoModalLoading(false);
    }
}

async function handleImplantacaoEncerrar() {
    if (!activeImplantacaoRecord?.id) return;

    const formValues = readImplantacaoFormValues();
    const standardItems = IMPLANTACAO_STANDARD_PURCHASE_UI.map(config => (
        formValues.purchaseItems.find(item => item.purchaseType === config.purchaseType)
    ));
    const terceiroItems = formValues.purchaseItems.filter(item => item.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO);

    if (!formValues.projetoChecked
        || !standardItems.every(item => item?.isChecked)
        || (terceiroItems.length && !terceiroItems.every(item => item.isChecked))) {
        alertAppDialog('Marque todos os checklists para encerrar a implantação.');
        return;
    }

    const confirmed = await confirmAppDialog(
        'Todos os checklists estão marcados. Esta ação encerra a implantação do projeto.',
        {
            title: `Encerrar implantação de "${activeImplantacaoProjectName}"?`,
            confirmLabel: 'Encerrar implantação',
            variant: 'danger'
        }
    );
    if (!confirmed) return;

    try {
        setImplantacaoModalLoading(true, 'Encerrando implantação...');
        await saveImplantacaoPurchaseItems(formValues.purchaseItems, activeImplantacaoRecord.id);

        const payload = buildImplantacaoUpdatePayload(formValues, {
            status: IMPLANTACAO_STATUS_ENCERRADO
        });

        const { data, error } = await supabaseClient
            .from('Implantacao')
            .update(payload)
            .eq('id', activeImplantacaoRecord.id)
            .select('*')
            .single();

        if (error) throw error;

        activeImplantacaoRecord = data;
        populateImplantacaoForm(data);

        setImplantacaoModalLoading(true, 'Atualizando telas...');
        await refreshImplantacaoRelatedViews(activeImplantacaoOrderProjectId);

        updateImplantacaoActionButtons(data);
        setImplantacaoModalLoading(true, 'Implantação encerrada com sucesso!', 'success');
        await waitImplantacaoStatus(1800);
        setImplantacaoModalLoading(false);
    } catch (error) {
        setImplantacaoModalLoading(true, `Erro ao encerrar: ${error.message}`, 'error');
        await waitImplantacaoStatus(2500);
        setImplantacaoModalLoading(false);
    }
}

function bindImplantacaoEvents() {
    [
        'implantacao-projeto-path',
        'implantacao-compras-path',
        'implantacao-ferragens-path',
        'implantacao-tintas-path',
        'implantacao-wps-op-code'
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            updateImplantacaoActionButtons();
        });
    });

    [
        'implantacao-projeto-checked',
        'implantacao-compras-checked',
        'implantacao-ferragens-checked',
        'implantacao-tintas-checked'
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            updateImplantacaoActionButtons();
        });
    });

    document.getElementById('btn-implantacao-add-terceiro')
        ?.addEventListener('click', addImplantacaoTerceiroPurchaseItem);

    document.getElementById('implantacao-terceiros-items')?.addEventListener('input', (event) => {
        if (event.target.closest('.implantacao-terceiro-path')) {
            updateImplantacaoActionButtons();
        }
    });

    document.getElementById('implantacao-terceiros-items')?.addEventListener('change', (event) => {
        if (event.target.closest('.implantacao-terceiro-checked')) {
            updateImplantacaoActionButtons();
        }
    });

    document.getElementById('implantacao-terceiros-items')?.addEventListener('click', (event) => {
        const button = event.target.closest('.implantacao-terceiro-remove');
        if (!button) return;
        removeImplantacaoTerceiroPurchaseItem(Number(button.dataset.itemId));
    });

    document.getElementById('btn-implantacao-enviar-producao')
        ?.addEventListener('click', handleImplantacaoEnviarProducao);
    document.getElementById('btn-implantacao-enviar-compras')
        ?.addEventListener('click', handleImplantacaoEnviarCompras);
    document.getElementById('btn-implantacao-encerrar')
        ?.addEventListener('click', handleImplantacaoEncerrar);
    document.getElementById('btn-implantacao-salvar')
        ?.addEventListener('click', handleImplantacaoSalvar);
}
