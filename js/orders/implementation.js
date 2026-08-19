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
let activeImplementationPurchaseItems = [];
let activeImplantacaoThirdPartyProjects = [];
let implantacaoThirdPartySubtypesCache = [];

function canAccessImplantacaoModal() {
    return Boolean(activeOrderId)
        || (typeof canSeePendenciasPpcpItems === 'function' && canSeePendenciasPpcpItems())
        || (typeof canSeePendenciasComprasMenu === 'function' && canSeePendenciasComprasMenu());
}

function canActImplantacao() {
    return canActPendenciasPpcpStatus();
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

function getImplementationPurchaseItemsByType(purchaseType) {
    return (activeImplementationPurchaseItems || []).filter(item => item.purchaseType === purchaseType);
}

function getImplantacaoStandardPurchaseItem(purchaseType) {
    return getImplementationPurchaseItemsByType(purchaseType)[0] || null;
}

function getImplantacaoTerceiroPurchaseItems() {
    return getImplementationPurchaseItemsByType(IMPLANTACAO_PURCHASE_TYPE_TERCEIRO);
}

function getImplantacaoTerceirosSharedPath() {
    return document.getElementById('implantacao-terceiros-path')?.value?.trim() || '';
}

function getImplantacaoThirdPartyProjectForSubtype(subtypeId) {
    return (activeImplantacaoThirdPartyProjects || []).find(
        project => Number(project.thirdPartySubtypeId) === Number(subtypeId)
    ) || null;
}

function isImplantacaoTerceiroSubtypeRequired(subtypeId) {
    return Boolean(getImplantacaoThirdPartyProjectForSubtype(subtypeId));
}

function getImplantacaoTerceiroSubtypeThirdPartyStatusLabel(project) {
    if (!project) return '';
    if (typeof getThirdPartyProjectStatusLabel === 'function') {
        return getThirdPartyProjectStatusLabel(project.status);
    }
    return project.status || '';
}

function readImplantacaoStandardChecked(checkboxId, item) {
    if (Boolean(item?.sentToCommercial)) {
        return Boolean(item?.isChecked);
    }
    return Boolean(document.getElementById(checkboxId)?.checked);
}

function readImplantacaoTerceiroSubtypeRowsFromForm() {
    const sharedPath = getImplantacaoTerceirosSharedPath();

    return (implantacaoThirdPartySubtypesCache || []).map(subtype => {
        const subtypeId = Number(subtype.id);
        const existing = activeImplementationPurchaseItems.find(item => (
            item.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO
            && Number(item.thirdPartySubtypeId) === subtypeId
        )) || {};
        const row = document.querySelector(`.implantacao-terceiro-item[data-subtype-id="${subtypeId}"]`);
        const sentToCommercial = Boolean(existing.sentToCommercial);
        const checkedInput = row?.querySelector('.implantacao-terceiro-checked');

        return {
            ...existing,
            id: existing.id || null,
            purchaseType: IMPLANTACAO_PURCHASE_TYPE_TERCEIRO,
            thirdPartySubtypeId: subtypeId,
            thirdPartySubtype: existing.thirdPartySubtype || subtype,
            folderPath: sharedPath || existing.folderPath || '',
            isChecked: sentToCommercial ? Boolean(existing.isChecked) : Boolean(checkedInput?.checked),
            sentToCommercial,
            sentToCommercialAt: existing.sentToCommercialAt || null
        };
    });
}

function readImplementationPurchaseItemsFromForm() {
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

    items.push(...readImplantacaoTerceiroSubtypeRowsFromForm());
    return items;
}

function getImplementationPurchaseItemsForSave() {
    const sharedPath = getImplantacaoTerceirosSharedPath();

    return readImplementationPurchaseItemsFromForm()
        .filter(item => item.purchaseType !== IMPLANTACAO_PURCHASE_TYPE_TERCEIRO || item.id)
        .map(item => (
            item.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO
                ? { ...item, folderPath: sharedPath || item.folderPath || '' }
                : item
        ));
}

function readImplantacaoFormValues() {
    const purchaseItems = readImplementationPurchaseItemsFromForm();

    return {
        projectFilePath: document.getElementById('implantacao-projeto-path')?.value?.trim() || '',
        isProjectChecked: Boolean(document.getElementById('implantacao-projeto-checked')?.checked),
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

    const subtypes = implantacaoThirdPartySubtypesCache || [];
    if (!subtypes.length) {
        container.innerHTML = '<p class="text-xs text-slate-400">Nenhum subtipo de terceiro cadastrado.</p>';
        return;
    }

    container.innerHTML = subtypes.map(subtype => {
        const subtypeId = Number(subtype.id);
        const existing = getImplantacaoTerceiroPurchaseItems().find(
            item => Number(item.thirdPartySubtypeId) === subtypeId
        ) || {};
        const sentToCommercial = Boolean(existing.sentToCommercial);
        const thirdPartyProject = getImplantacaoThirdPartyProjectForSubtype(subtypeId);
        const isRequired = Boolean(thirdPartyProject);
        const isApproved = !thirdPartyProject
            || thirdPartyProject.status === THIRD_PARTY_PROJECT_STATUS_APPROVED;
        const label = escapeHtml(subtype.name || 'Terceiros');
        const requiredMarker = isRequired
            ? '<span class="project-characteristic-third-party-marker" title="Projeto de terceiros vinculado — obrigatório para enviar às compras após aprovação do consultor">*</span>'
            : '';
        const statusLabel = thirdPartyProject && !isApproved
            ? `<span class="text-[10px] text-amber-700 font-medium">${escapeHtml(getImplantacaoTerceiroSubtypeThirdPartyStatusLabel(thirdPartyProject))}</span>`
            : '';
        const approvedLabel = thirdPartyProject && isApproved
            ? '<span class="text-[10px] text-emerald-700 font-medium">Aprovado</span>'
            : '';

        return `
            <div class="implantacao-terceiro-item flex items-start gap-3" data-subtype-id="${subtypeId}" data-item-id="${existing.id || ''}">
                <input type="checkbox" class="implantacao-terceiro-checked mt-1 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                    ${existing.isChecked ? 'checked' : ''} ${sentToCommercial ? 'disabled' : ''}>
                <div class="flex-1 space-y-1 min-w-0">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="text-xs font-semibold text-slate-700">${label}${requiredMarker}</span>
                        <div class="flex items-center gap-2 shrink-0">
                            ${statusLabel}
                            ${approvedLabel}
                            <label class="inline-flex items-center gap-2 text-xs text-slate-600 cursor-default">
                                <input type="checkbox" class="implantacao-terceiro-enviado-comercial rounded border-slate-300 text-amber-600 cursor-not-allowed" disabled
                                    ${sentToCommercial ? 'checked' : ''}>
                                <span>Enviado para comercial</span>
                                <span class="implantacao-terceiro-enviado-date text-slate-400">${sentToCommercial && existing.sentToCommercialAt ? `· ${escapeHtml(formatImplantacaoComercialDate(existing.sentToCommercialAt))}` : ''}</span>
                            </label>
                        </div>
                    </div>
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

function populateImplantacaoForm(record) {
    document.getElementById('implantacao-projeto-path').value = record?.projectFilePath || '';
    document.getElementById('implantacao-projeto-checked').checked = Boolean(record?.isProjectChecked);
    document.getElementById('implantacao-wps-op-code').value = record?.wpsOpCode || '';

    const terceiroItems = getImplantacaoTerceiroPurchaseItems();
    const sharedTerceiroPath = terceiroItems.find(item => item.folderPath)?.folderPath || '';
    const terceirosPathInput = document.getElementById('implantacao-terceiros-path');
    if (terceirosPathInput) {
        terceirosPathInput.value = sharedTerceiroPath;
    }

    populateImplantacaoStandardPurchaseFields();
    renderImplantacaoTerceiroPurchaseItems();

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

    const terceiroSent = getImplantacaoTerceiroPurchaseItems().some(item => item.sentToCommercial);
    document.getElementById('implantacao-terceiros-path')?.toggleAttribute('disabled', disabled || terceiroSent);

    document.querySelectorAll('.implantacao-terceiro-item').forEach(row => {
        const subtypeId = Number(row.dataset.subtypeId);
        const existing = getImplantacaoTerceiroPurchaseItems().find(
            item => Number(item.thirdPartySubtypeId) === subtypeId
        );
        const sentToCommercial = Boolean(existing?.sentToCommercial);
        const locked = disabled || sentToCommercial;

        const checkedEl = row.querySelector('.implantacao-terceiro-checked');
        if (checkedEl) checkedEl.disabled = locked;
    });

    setImplantacaoComercialFieldsDisabled();
}

function canSendImplantacaoTerceiroItem(item) {
    const sharedPath = getImplantacaoTerceirosSharedPath() || item?.folderPath || '';
    if (!item?.isChecked || !sharedPath || item?.sentToCommercial) return false;

    const thirdPartyProject = getImplantacaoThirdPartyProjectForSubtype(item.thirdPartySubtypeId);
    if (thirdPartyProject && thirdPartyProject.status !== THIRD_PARTY_PROJECT_STATUS_APPROVED) {
        return false;
    }

    return true;
}

function canSendImplementationPurchaseItem(item) {
    if (item?.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO) {
        return canSendImplantacaoTerceiroItem(item);
    }

    return Boolean(item?.isChecked)
        && Boolean(item?.folderPath)
        && !item?.sentToCommercial;
}

function allImplantacaoThirdPartyProjectsApprovedAndSent() {
    const projects = activeImplantacaoThirdPartyProjects || [];
    if (!projects.length) return true;

    return projects.every(project => {
        if (project.status !== THIRD_PARTY_PROJECT_STATUS_APPROVED) return false;

        const purchaseItem = getImplantacaoTerceiroPurchaseItems().find(
            item => Number(item.thirdPartySubtypeId) === Number(project.thirdPartySubtypeId)
        );

        return Boolean(purchaseItem?.sentToCommercial);
    });
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
        && values.isProjectChecked
        && Boolean(values.projectFilePath)
        && Boolean(values.wpsOpCode);

    const canEnviarCompras = canAct
        && (values.purchaseItems || []).some(canSendImplementationPurchaseItem);

    const standardItems = IMPLANTACAO_STANDARD_PURCHASE_UI.map(config => (
        values.purchaseItems.find(item => item.purchaseType === config.purchaseType)
    ));
    const allStandardChecked = standardItems.every(item => Boolean(item?.isChecked));

    const canEncerrar = canAct
        && values.isProjectChecked
        && allStandardChecked
        && allImplantacaoThirdPartyProjectsApprovedAndSent();

    if (btnProducao) btnProducao.disabled = !canEnviarProducao;
    if (btnCompras) btnCompras.disabled = !canEnviarCompras;
    if (btnEncerrar) btnEncerrar.disabled = !canEncerrar;
    if (btnSalvar) btnSalvar.disabled = !canAct;

    setImplantacaoFormDisabled(!canAct);
    setImplantacaoProjetoFieldsDisabled(isEnviadoProducao || !canAct);
}

async function fetchImplementationPurchaseItems(implementationId) {
    const { data, error } = await supabaseClient
        .from('ImplementationPurchaseItem')
        .select('*, thirdPartySubtype:ThirdPartySubtype(id, name, isActive)')
        .eq('implementationId', implementationId)
        .order('purchaseType', { ascending: true })
        .order('id', { ascending: true });

    if (error) throw error;
    return data || [];
}

async function ensureStandardImplementationPurchaseItems(implementationId) {
    const existing = await fetchImplementationPurchaseItems(implementationId);
    const missingTypes = [IMPLANTACAO_PURCHASE_TYPE_MATERIAL, IMPLANTACAO_PURCHASE_TYPE_FERRAGEM, IMPLANTACAO_PURCHASE_TYPE_TINTA]
        .filter(type => !existing.some(item => item.purchaseType === type));

    if (missingTypes.length) {
        const now = new Date().toISOString();
        const rows = missingTypes.map(purchaseType => ({
            implementationId,
            purchaseType,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null,
            updatedAt: now
        }));

        const { error } = await supabaseClient
            .from('ImplementationPurchaseItem')
            .insert(rows);

        if (error) throw error;
        return fetchImplementationPurchaseItems(implementationId);
    }

    return existing;
}

async function loadActiveImplementationPurchaseItems(implementationId) {
    activeImplementationPurchaseItems = await ensureStandardImplementationPurchaseItems(implementationId);
    return activeImplementationPurchaseItems;
}

async function fetchImplementationByOrderProjectId(orderProjectId) {
    const { data, error } = await supabaseClient
        .from('Implementation')
        .select('*')
        .eq('orderProjectId', orderProjectId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

window.fetchImplementationByOrderProjectId = fetchImplementationByOrderProjectId;
window.fetchImplantacaoByOrderProjectId = fetchImplementationByOrderProjectId;

async function createImplantacaoRecord(orderProjectId) {
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('Implementation')
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

    await ensureStandardImplementationPurchaseItems(data.id);
    return data;
}

async function ensureImplantacaoRecord(orderProjectId) {
    const existing = await fetchImplementationByOrderProjectId(orderProjectId);
    if (existing) {
        await ensureStandardImplementationPurchaseItems(existing.id);
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

async function fetchOrderProjectsInImplementationStatus() {
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
        console.error('fetchOrderProjectsInImplementationStatus:', result.error);
        return [];
    }

    return result.data || [];
}

async function ensureImplementationRecordsForProjects(projects = []) {
    const recordsByProjectId = {};

    for (const project of projects) {
        const projectId = Number(project?.id || project);
        if (!projectId) continue;

        try {
            const record = await ensureImplantacaoRecord(projectId);
            if (record) recordsByProjectId[projectId] = record;
        } catch (error) {
            console.warn('ensureImplementationRecordsForProjects:', projectId, error);
        }
    }

    return recordsByProjectId;
}

async function syncImplementationRecordsMapForProjects(projects = [], implantacaoByProjectId = {}) {
    const syncedMap = { ...implantacaoByProjectId };
    const missingProjects = (projects || []).filter(project => {
        const statusName = project?.projectStatus?.name || '';
        return statusName === IMPLANTACAO_PROJECT_STATUS_IMPLANTACAO && !syncedMap[project.id];
    });

    if (!missingProjects.length) return syncedMap;

    const createdMap = await ensureImplementationRecordsForProjects(missingProjects);
    return { ...syncedMap, ...createdMap };
}

function buildImplantacaoUpdatePayload(formValues, extra = {}) {
    const now = new Date().toISOString();
    return {
        projectFilePath: formValues.projectFilePath || null,
        isProjectChecked: formValues.isProjectChecked,
        wpsOpCode: formValues.wpsOpCode || null,
        updatedById: currentUser?.id || null,
        updatedAt: now,
        ...extra
    };
}

function buildImplementationPurchaseItemPayload(item, implementationId) {
    const now = new Date().toISOString();
    return {
        implementationId,
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

async function saveImplementationPurchaseItems(purchaseItems = [], implementationId = activeImplantacaoRecord?.id) {
    if (!implementationId || !purchaseItems.length) return activeImplementationPurchaseItems;

    const now = new Date().toISOString();
    const savedItems = [];

    for (const item of purchaseItems) {
        const payload = buildImplementationPurchaseItemPayload(item, implementationId);

        if (item.id) {
            const { data, error } = await supabaseClient
                .from('ImplementationPurchaseItem')
                .update(payload)
                .eq('id', item.id)
                .select('*, thirdPartySubtype:ThirdPartySubtype(id, name, isActive)')
                .single();

            if (error) throw error;
            savedItems.push(data);
            continue;
        }

        const { data, error } = await supabaseClient
            .from('ImplementationPurchaseItem')
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

    const refreshed = await fetchImplementationPurchaseItems(implementationId);
    activeImplementationPurchaseItems = refreshed;
    return refreshed;
}

async function saveImplantacaoFormFields(options = {}) {
    const { silent = true } = options;

    if (!activeImplantacaoRecord?.id) return null;

    const formValues = readImplantacaoFormValues();
    const payload = buildImplantacaoUpdatePayload(formValues);

    const { data, error } = await supabaseClient
        .from('Implementation')
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
    await saveImplementationPurchaseItems(getImplementationPurchaseItemsForSave(), data.id);
    return data;
}

async function getImplementationPurchaseItemsForComprasSend(formValues) {
    const itemsToSend = (formValues.purchaseItems || []).filter(canSendImplementationPurchaseItem);
    const itemsToPersist = (formValues.purchaseItems || []).filter(item => {
        if (item.purchaseType !== IMPLANTACAO_PURCHASE_TYPE_TERCEIRO) return true;
        if (item.id) return true;
        return itemsToSend.some(
            row => Number(row.thirdPartySubtypeId) === Number(item.thirdPartySubtypeId)
        );
    });

    await saveImplementationPurchaseItems(itemsToPersist, activeImplantacaoRecord.id);

    return activeImplementationPurchaseItems.filter(item => (
        itemsToSend.some(row => (
            (row.id && Number(row.id) === Number(item.id))
            || (
                item.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO
                && Number(item.thirdPartySubtypeId) === Number(row.thirdPartySubtypeId)
            )
        ))
    )).filter(canSendImplementationPurchaseItem);
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

async function openImplementationModal(orderProjectId, projectName = '', options = {}) {
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
            activeImplantacaoRecord = await fetchImplementationByOrderProjectId(activeImplantacaoOrderProjectId);
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

        await loadActiveImplementationPurchaseItems(activeImplantacaoRecord.id);

        if (typeof fetchThirdPartyProjectsByOrderProjectId === 'function') {
            activeImplantacaoThirdPartyProjects = await fetchThirdPartyProjectsByOrderProjectId(
                activeImplantacaoOrderProjectId
            );
        } else {
            activeImplantacaoThirdPartyProjects = [];
        }

        document.getElementById('implantacao-modal-project-name').textContent = activeImplantacaoProjectName;
        populateImplantacaoForm(activeImplantacaoRecord);
        updateImplantacaoActionButtons(activeImplantacaoRecord);
        toggleModal('implantacao-modal', true);
    } catch (error) {
        if (error.message?.includes('ImplementationPurchaseItem') || error.message?.includes('ThirdPartySubtype')) {
            alertAppDialog('Execute supabase/feats/add-third-party-subtype-and-implementation-purchase-item.sql no Supabase SQL Editor de produção.');
        } else if (error.message?.includes('Implementation') || error.message?.includes('does not exist')) {
            alertAppDialog('Tabela Implementation não encontrada. Consulte PENDING-PROD-SQL.md ou supabase/schema/.');
        } else {
            alertAppDialog('Erro ao abrir implantação: ' + error.message);
        }
    }
}

function closeImplementationModal() {
    setImplantacaoModalLoading(false);
    toggleModal('implantacao-modal', false);
    activeImplantacaoOrderProjectId = null;
    activeImplantacaoRecord = null;
    activeImplantacaoProjectName = '';
    activeImplementationPurchaseItems = [];
    activeImplantacaoThirdPartyProjects = [];
}
window.closeImplementationModal = closeImplementationModal;
window.openImplementationModal = openImplementationModal;
window.ensureImplementationRecordsForProjects = ensureImplementationRecordsForProjects;
window.fetchOrderProjectsInImplementationStatus = fetchOrderProjectsInImplementationStatus;
window.syncImplementationRecordsMapForProjects = syncImplementationRecordsMapForProjects;
window.closeImplantacaoModal = closeImplementationModal;
window.openImplantacaoModal = openImplementationModal;
window.ensureImplantacaoRecordsForProjects = ensureImplementationRecordsForProjects;
window.fetchOrderProjectsInImplantacaoStatus = fetchOrderProjectsInImplementationStatus;
window.syncImplantacaoRecordsMapForProjects = syncImplementationRecordsMapForProjects;

const fetchImplantacaoByOrderProjectId = fetchImplementationByOrderProjectId;
const openImplantacaoModal = openImplementationModal;
const closeImplantacaoModal = closeImplementationModal;
const ensureImplantacaoRecordsForProjects = ensureImplementationRecordsForProjects;
const fetchOrderProjectsInImplantacaoStatus = fetchOrderProjectsInImplementationStatus;
const syncImplantacaoRecordsMapForProjects = syncImplementationRecordsMapForProjects;

const IMPLANTACAO_MODAL_OVERLAY = createModalOverlayConfig('implantacao-modal', {
    disableElementIds: [
        'btn-implantacao-enviar-producao',
        'btn-implantacao-enviar-compras',
        'btn-implantacao-encerrar',
        'btn-implantacao-salvar'
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
    if (!formValues.isProjectChecked || !formValues.projectFilePath || !formValues.wpsOpCode) {
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
        await saveImplementationPurchaseItems(getImplementationPurchaseItemsForSave(), activeImplantacaoRecord.id);

        const payload = buildImplantacaoUpdatePayload(formValues, {
            status: IMPLANTACAO_STATUS_ENVIADO_PRODUCAO
        });

        const { data, error } = await supabaseClient
            .from('Implementation')
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

        if (typeof createDetalhamentoForProject === 'function') {
            await createDetalhamentoForProject(activeImplantacaoOrderProjectId);
        }

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
                projectFilePath: formValues.projectFilePath
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
    const itemsToSend = (formValues.purchaseItems || []).filter(canSendImplementationPurchaseItem);

    if (!itemsToSend.length) {
        const pendingApproval = (formValues.purchaseItems || []).filter(item => {
            if (item.purchaseType !== IMPLANTACAO_PURCHASE_TYPE_TERCEIRO || !item.isChecked) return false;
            const thirdPartyProject = getImplantacaoThirdPartyProjectForSubtype(item.thirdPartySubtypeId);
            return thirdPartyProject && thirdPartyProject.status !== THIRD_PARTY_PROJECT_STATUS_APPROVED;
        });

        if (pendingApproval.length) {
            alertAppDialog('Subtipos com projeto de terceiros vinculado só podem ser enviados após aprovação do consultor.');
            return;
        }

        alertAppDialog('Marque e preencha o caminho de pelo menos um item para enviar às compras.');
        return;
    }

    const blockedItems = itemsToSend.filter(item => {
        if (item.purchaseType !== IMPLANTACAO_PURCHASE_TYPE_TERCEIRO) return false;
        const thirdPartyProject = getImplantacaoThirdPartyProjectForSubtype(item.thirdPartySubtypeId);
        return thirdPartyProject && thirdPartyProject.status !== THIRD_PARTY_PROJECT_STATUS_APPROVED;
    });

    if (blockedItems.length) {
        alertAppDialog('Subtipos com projeto de terceiros vinculado só podem ser enviados após aprovação do consultor.');
        return;
    }

    try {
        setImplantacaoModalLoading(true, 'Registrando solicitações de compra...');
        const now = new Date().toISOString();

        const purchaseItemsForCompras = await getImplementationPurchaseItemsForComprasSend(formValues);

        await createComprasRecordsFromImplantacaoSend({
            implementationId: activeImplantacaoRecord.id,
            orderProjectId: activeImplantacaoOrderProjectId,
            purchaseItems: purchaseItemsForCompras
        });

        const updatedPurchaseItems = activeImplementationPurchaseItems.map(item => {
            if (!purchaseItemsForCompras.some(row => Number(row.id) === Number(item.id))) {
                return item;
            }
            return {
                ...item,
                sentToCommercial: true,
                sentToCommercialAt: now
            };
        });

        await saveImplementationPurchaseItems(updatedPurchaseItems, activeImplantacaoRecord.id);

        setImplantacaoModalLoading(true, 'Salvando implantação...');
        const payload = buildImplantacaoUpdatePayload(formValues, {
            purchasesSentAt: now
        });

        const { data, error } = await supabaseClient
            .from('Implementation')
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

    if (!formValues.isProjectChecked || !standardItems.every(item => item?.isChecked)) {
        alertAppDialog('Marque todos os checklists para encerrar a implantação.');
        return;
    }

    if (!allImplantacaoThirdPartyProjectsApprovedAndSent()) {
        alertAppDialog('Todos os projetos de terceiros vinculados precisam estar aprovados pelo consultor e enviados para compras.');
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
        await saveImplementationPurchaseItems(getImplementationPurchaseItemsForSave(), activeImplantacaoRecord.id);

        const payload = buildImplantacaoUpdatePayload(formValues, {
            status: IMPLANTACAO_STATUS_ENCERRADO
        });

        const { data, error } = await supabaseClient
            .from('Implementation')
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

function bindImplementationEvents() {
    [
        'implantacao-projeto-path',
        'implantacao-compras-path',
        'implantacao-ferragens-path',
        'implantacao-tintas-path',
        'implantacao-terceiros-path',
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

    document.getElementById('implantacao-terceiros-items')?.addEventListener('change', (event) => {
        if (event.target.closest('.implantacao-terceiro-checked')) {
            updateImplantacaoActionButtons();
        }
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

const bindImplantacaoEvents = bindImplementationEvents;
