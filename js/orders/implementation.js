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
        comercialId: 'implantacao-compras-enviar-comercial',
        comercialDateId: 'implantacao-compras-enviar-comercial-date',
        notApplicableId: 'implantacao-compras-nao-possui',
        uploadSectionId: 'implantacao-compras-upload-section',
        uploadHintId: 'implantacao-compras-upload-hint',
        drivePathId: 'implantacao-compras-drive-path',
        fileInputId: 'implantacao-compras-file-input',
        fileDisplayId: 'implantacao-compras-file-display',
        selectFileBtnId: 'btn-implantacao-compras-select-file',
        uploadBtnId: 'btn-implantacao-compras-upload',
        currentEmptyId: 'implantacao-compras-current-empty',
        currentFileId: 'implantacao-compras-current-file',
        currentNameId: 'implantacao-compras-current-name',
        currentMetaId: 'implantacao-compras-current-meta',
        downloadBtnId: 'btn-implantacao-compras-download'
    },
    {
        purchaseType: IMPLANTACAO_PURCHASE_TYPE_FERRAGEM,
        label: 'Lista de Ferragens',
        comercialId: 'implantacao-ferragens-enviar-comercial',
        comercialDateId: 'implantacao-ferragens-enviar-comercial-date',
        notApplicableId: 'implantacao-ferragens-nao-possui',
        uploadSectionId: 'implantacao-ferragens-upload-section',
        uploadHintId: 'implantacao-ferragens-upload-hint',
        drivePathId: 'implantacao-ferragens-drive-path',
        fileInputId: 'implantacao-ferragens-file-input',
        fileDisplayId: 'implantacao-ferragens-file-display',
        selectFileBtnId: 'btn-implantacao-ferragens-select-file',
        uploadBtnId: 'btn-implantacao-ferragens-upload',
        currentEmptyId: 'implantacao-ferragens-current-empty',
        currentFileId: 'implantacao-ferragens-current-file',
        currentNameId: 'implantacao-ferragens-current-name',
        currentMetaId: 'implantacao-ferragens-current-meta',
        downloadBtnId: 'btn-implantacao-ferragens-download'
    },
    {
        purchaseType: IMPLANTACAO_PURCHASE_TYPE_TINTA,
        label: 'Lista de Tintas',
        comercialId: 'implantacao-tintas-enviar-comercial',
        comercialDateId: 'implantacao-tintas-enviar-comercial-date',
        notApplicableId: 'implantacao-tintas-nao-possui',
        uploadSectionId: 'implantacao-tintas-upload-section',
        uploadHintId: 'implantacao-tintas-upload-hint',
        drivePathId: 'implantacao-tintas-drive-path',
        fileInputId: 'implantacao-tintas-file-input',
        fileDisplayId: 'implantacao-tintas-file-display',
        selectFileBtnId: 'btn-implantacao-tintas-select-file',
        uploadBtnId: 'btn-implantacao-tintas-upload',
        currentEmptyId: 'implantacao-tintas-current-empty',
        currentFileId: 'implantacao-tintas-current-file',
        currentNameId: 'implantacao-tintas-current-name',
        currentMetaId: 'implantacao-tintas-current-meta',
        downloadBtnId: 'btn-implantacao-tintas-download'
    }
];

let activeImplantacaoOrderProjectId = null;
let activeImplantacaoRecord = null;
let activeImplantacaoProjectName = '';
let activeImplementationPurchaseItems = [];
let activeImplantacaoCompraLinkedPurchaseItemIds = new Set();
let activeImplantacaoCompraLockedStandardPurchaseTypes = new Set();
let activeImplantacaoThirdPartyProjects = [];
let implantacaoThirdPartySubtypesCache = [];

const IMPLANTACAO_STANDARD_PURCHASE_TYPES = new Set([
    IMPLANTACAO_PURCHASE_TYPE_MATERIAL,
    IMPLANTACAO_PURCHASE_TYPE_FERRAGEM,
    IMPLANTACAO_PURCHASE_TYPE_TINTA
]);

function registerImplantacaoCompraPurchaseRow(row, linkedIds, lockedStandardTypes) {
    const purchaseItemId = Number(row?.implementationPurchaseItemId || 0);
    if (purchaseItemId > 0) {
        linkedIds.add(purchaseItemId);
        return;
    }

    const purchaseType = String(row?.purchaseType || '').trim();
    if (IMPLANTACAO_STANDARD_PURCHASE_TYPES.has(purchaseType)) {
        lockedStandardTypes.add(purchaseType);
    }
}

function isImplementationPurchaseItemSentToCompras(item) {
    if (!item) return false;
    if (item.sentToCommercial === true) return true;

    const itemId = Number(item.id || 0);
    if (itemId > 0 && activeImplantacaoCompraLinkedPurchaseItemIds.has(itemId)) {
        return true;
    }

    const purchaseType = String(item.purchaseType || '').trim();
    if (IMPLANTACAO_STANDARD_PURCHASE_TYPES.has(purchaseType)
        && activeImplantacaoCompraLockedStandardPurchaseTypes.has(purchaseType)) {
        return true;
    }

    return false;
}

async function loadImplantacaoCompraLinkedPurchaseItemIds(
    implementationId,
    purchaseItems = [],
    orderProjectId = activeImplantacaoOrderProjectId
) {
    const linkedIds = new Set();
    const lockedStandardTypes = new Set();
    const implementationKey = Number(implementationId || 0);
    const orderProjectKey = Number(orderProjectId || 0);
    const purchaseItemIds = (purchaseItems || [])
        .map(row => Number(row.id || 0))
        .filter(id => id > 0);

    const mergePurchaseRows = (rows) => {
        (rows || []).forEach(row => registerImplantacaoCompraPurchaseRow(row, linkedIds, lockedStandardTypes));
    };

    if (implementationKey) {
        const { data, error } = await supabaseClient
            .from('Purchase')
            .select('implementationPurchaseItemId, purchaseType')
            .eq('implementationId', implementationKey);

        if (error && !error.message?.includes('Purchase')) {
            console.warn('loadImplantacaoCompraLinkedPurchaseItemIds:', error.message);
        } else {
            mergePurchaseRows(data);
        }
    }

    if (orderProjectKey && implementationKey) {
        let query = supabaseClient
            .from('Purchase')
            .select('implementationPurchaseItemId, purchaseType, implementationId')
            .eq('orderProjectId', orderProjectKey)
            .eq('implementationId', implementationKey);

        const { data, error } = await query;

        if (error && !error.message?.includes('Purchase')) {
            console.warn('loadImplantacaoCompraLinkedPurchaseItemIds by project:', error.message);
        } else {
            mergePurchaseRows(data);
        }
    }

    if (purchaseItemIds.length) {
        const { data, error } = await supabaseClient
            .from('Purchase')
            .select('implementationPurchaseItemId, purchaseType')
            .in('implementationPurchaseItemId', purchaseItemIds);

        if (error && !error.message?.includes('Purchase')) {
            console.warn('loadImplantacaoCompraLinkedPurchaseItemIds by item:', error.message);
        } else {
            mergePurchaseRows(data);
        }
    }

    activeImplantacaoCompraLinkedPurchaseItemIds = linkedIds;
    activeImplantacaoCompraLockedStandardPurchaseTypes = lockedStandardTypes;
    return linkedIds;
}

function canAccessImplantacaoModal() {
    return Boolean(activeOrderId)
        || (typeof canSeePendenciasPpcpItems === 'function' && canSeePendenciasPpcpItems())
        || (typeof canSeePendenciasComprasMenu === 'function' && canSeePendenciasComprasMenu());
}

function canActImplantacao(record = activeImplantacaoRecord) {
    if (typeof canActPendenciasPpcpStatus !== 'function' || !canActPendenciasPpcpStatus()) {
        return false;
    }
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    if (typeof isPpcp !== 'function' || !isPpcp()) return false;

    const designerId = Number(record?.designerId || 0);
    if (!designerId) return false;
    return designerId === Number(currentUser?.id);
}

function resolveImplementationDesignerId(options = {}) {
    const fromOptions = Number(options.designerId || 0);
    if (fromOptions) return fromOptions;
    return Number(currentUser?.id || 0) || null;
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

function getImplantacaoThirdPartyProjectForSubtype(subtypeId) {
    return (activeImplantacaoThirdPartyProjects || []).find(
        project => Number(project.thirdPartySubtypeId) === Number(subtypeId)
    ) || null;
}

function isImplantacaoTerceiroSubtypeRequired(subtypeId) {
    if (getImplantacaoThirdPartyProjectForSubtype(subtypeId)) {
        return true;
    }
    const subtype = (implantacaoThirdPartySubtypesCache || []).find(
        item => Number(item.id) === Number(subtypeId)
    );
    return Boolean(subtype && !Number(subtype.projectCharacteristicId));
}

function getImplantacaoTerceiroSubtypeThirdPartyStatusLabel(project) {
    if (!project) return '';
    if (typeof getThirdPartyProjectStatusLabel === 'function') {
        return getThirdPartyProjectStatusLabel(project.status);
    }
    return project.status || '';
}

function readImplantacaoStandardPurchaseRowFromForm(config) {
    const existing = getImplantacaoStandardPurchaseItem(config.purchaseType);
    const sentToCommercial = isImplementationPurchaseItemSentToCompras(existing);
    const notApplicableInput = document.getElementById(config.notApplicableId);
    const comercialInput = document.getElementById(config.comercialId);
    const isNotApplicable = sentToCommercial
        ? Boolean(existing?.isNotApplicable)
        : Boolean(notApplicableInput?.checked);
    const folderPath = isNotApplicable
        ? ''
        : (existing?.folderPath || '');
    const hasUploadedFile = typeof hasImplantacaoListDriveFileUploaded === 'function'
        ? hasImplantacaoListDriveFileUploaded(config.purchaseType, {
            ...existing,
            folderPath,
            isNotApplicable
        })
        : Boolean(String(folderPath || '').trim());
    const pendingSendToCommercial = sentToCommercial
        ? Boolean(existing?.sentToCommercial)
        : (hasUploadedFile && Boolean(comercialInput?.checked));

    return {
        ...(existing || {}),
        purchaseType: config.purchaseType,
        folderPath,
        isNotApplicable,
        pendingSendToCommercial,
        isChecked: isNotApplicable || hasUploadedFile,
        sentToCommercial,
        sentToCommercialAt: existing?.sentToCommercialAt || null,
        thirdPartySubtypeId: null
    };
}

function readImplantacaoTerceiroSubtypeRowsFromForm() {
    return getImplantacaoThirdPartyProjectsForDisplay().map(thirdPartyProject => {
        const subtypeId = Number(thirdPartyProject.thirdPartySubtypeId);
        const subtype = thirdPartyProject.thirdPartySubtype || {};
        const existing = activeImplementationPurchaseItems.find(item => (
            item.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO
            && Number(item.thirdPartySubtypeId) === subtypeId
        )) || {};
        const row = document.querySelector(`.implantacao-terceiro-item[data-subtype-id="${subtypeId}"]`);
        const sentToCommercial = isImplementationPurchaseItemSentToCompras(existing);
        const checkedInput = row?.querySelector('.implantacao-terceiro-checked');
        const isApproved = thirdPartyProject.status === THIRD_PARTY_PROJECT_STATUS_APPROVED;

        return {
            ...existing,
            id: existing.id || null,
            purchaseType: IMPLANTACAO_PURCHASE_TYPE_TERCEIRO,
            thirdPartySubtypeId: subtypeId,
            thirdPartySubtype: existing.thirdPartySubtype || subtype,
            folderPath: existing.folderPath || '',
            isChecked: sentToCommercial
                ? Boolean(existing.isChecked)
                : (isApproved && Boolean(checkedInput?.checked)),
            sentToCommercial,
            sentToCommercialAt: existing.sentToCommercialAt || null
        };
    });
}

function readImplementationPurchaseItemsFromForm() {
    const items = [];

    IMPLANTACAO_STANDARD_PURCHASE_UI.forEach(config => {
        items.push(readImplantacaoStandardPurchaseRowFromForm(config));
    });

    items.push(...readImplantacaoTerceiroSubtypeRowsFromForm());
    return items;
}

function getImplementationPurchaseItemsForSave() {
    return readImplementationPurchaseItemsFromForm()
        .filter(item => item.purchaseType !== IMPLANTACAO_PURCHASE_TYPE_TERCEIRO || item.id);
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
    if (typeof refreshImplantacaoListUploadSections === 'function') {
        refreshImplantacaoListUploadSections(activeImplantacaoRecord);
    }
}

function getImplantacaoTerceiroDisplayName(item) {
    return item?.thirdPartySubtype?.name || 'Terceiros';
}

function getImplantacaoThirdPartySubtypesWithoutProject() {
    return (implantacaoThirdPartySubtypesCache || []).filter(subtype => (
        !getImplantacaoThirdPartyProjectForSubtype(subtype.id)
    ));
}

function getImplantacaoThirdPartyProjectsForDisplay() {
    return [...(activeImplantacaoThirdPartyProjects || [])].sort((a, b) => {
        const sortDiff = Number(a.thirdPartySubtype?.sortOrder) - Number(b.thirdPartySubtype?.sortOrder);
        if (sortDiff !== 0) return sortDiff;
        const nameA = a.thirdPartySubtype?.name || '';
        const nameB = b.thirdPartySubtype?.name || '';
        return nameA.localeCompare(nameB, 'pt-BR');
    });
}

function renderImplantacaoTerceiroCreateControls() {
    const wrap = document.getElementById('implantacao-terceiros-create-wrap');
    const select = document.getElementById('implantacao-terceiro-create-subtype');
    if (!wrap || !select) return;

    const missingSubtypes = getImplantacaoThirdPartySubtypesWithoutProject();
    if (!missingSubtypes.length) {
        wrap.classList.add('hidden');
        select.innerHTML = '';
        return;
    }

    wrap.classList.remove('hidden');
    select.innerHTML = missingSubtypes.map(subtype => (
        `<option value="${Number(subtype.id)}">${escapeHtml(subtype.name || 'Terceiros')}</option>`
    )).join('');
}

function renderImplantacaoTerceiroPurchaseItems() {
    const container = document.getElementById('implantacao-terceiros-items');
    if (!container) return;

    renderImplantacaoTerceiroCreateControls();

    const projects = getImplantacaoThirdPartyProjectsForDisplay();
    if (!projects.length) {
        container.innerHTML = '<p class="text-xs text-slate-400">Nenhum projeto de terceiros neste ambiente.</p>';
        return;
    }

    container.innerHTML = projects.map(thirdPartyProject => {
        const subtypeId = Number(thirdPartyProject.thirdPartySubtypeId);
        const subtype = thirdPartyProject.thirdPartySubtype || {};
        const existing = getImplantacaoTerceiroPurchaseItems().find(
            item => Number(item.thirdPartySubtypeId) === subtypeId
        ) || {};
        const sentToCommercial = isImplementationPurchaseItemSentToCompras(existing);
        const isRequired = isImplantacaoTerceiroSubtypeRequired(subtypeId);
        const isApproved = thirdPartyProject.status === THIRD_PARTY_PROJECT_STATUS_APPROVED;
        const label = escapeHtml(subtype.name || 'Terceiros');
        const requiredMarker = isRequired
            ? '<span class="project-characteristic-third-party-marker" title="Projeto de terceiros vinculado — obrigatório para enviar às compras após aprovação do consultor">*</span>'
            : '';
        const statusClass = isApproved ? 'text-emerald-700' : 'text-amber-700';
        const statusHtml = `<span class="text-[10px] font-medium ${statusClass}">${escapeHtml(getImplantacaoTerceiroSubtypeThirdPartyStatusLabel(thirdPartyProject))}</span>`;
        const canMarkForComprasSend = isApproved && !sentToCommercial;
        const checkboxDisabled = !canMarkForComprasSend;
        const checkboxChecked = sentToCommercial
            ? Boolean(existing.isChecked)
            : (canMarkForComprasSend && Boolean(existing.isChecked));
        const checkboxTitle = sentToCommercial
            ? ''
            : (isApproved
                ? 'Marcar para enviar às compras'
                : 'Disponível após aprovação do consultor');
        const thirdPartyProjectId = Number(thirdPartyProject.id);
        const detailLinkHtml = thirdPartyProjectId
            ? `<button type="button"
                    class="implantacao-terceiro-detail-link inline-flex items-center justify-center w-7 h-7 shrink-0 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-teal-700 hover:border-teal-200"
                    title="Ver detalhe do projeto de terceiros"
                    aria-label="Ver detalhe do projeto de terceiros"
                    data-third-party-project-id="${thirdPartyProjectId}">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M5 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
                        <path d="M7 8h8"/>
                        <path d="M7 12h8"/>
                        <circle cx="15.5" cy="16" r="3.25"/>
                        <path d="m17.9 18.4 3.1 3.1"/>
                    </svg>
                </button>`
            : '';

        return `
            <div class="implantacao-terceiro-item flex items-start gap-3" data-subtype-id="${subtypeId}" data-item-id="${existing.id || ''}">
                <input type="checkbox" class="implantacao-terceiro-checked mt-1 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                    title="${escapeHtml(checkboxTitle)}"
                    ${checkboxChecked ? 'checked' : ''} ${checkboxDisabled ? 'disabled' : ''}>
                <div class="flex-1 space-y-1 min-w-0">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex flex-wrap items-center gap-2 min-w-0">
                            <span class="text-xs font-semibold text-slate-700">${label}${requiredMarker}</span>
                            ${detailLinkHtml}
                        </div>
                        <div class="flex flex-wrap items-center gap-2 shrink-0 text-xs text-slate-600">
                            ${statusHtml}
                            <label class="inline-flex items-center gap-2 cursor-default">
                                <input type="checkbox" class="implantacao-terceiro-enviado-comercial rounded border-slate-300 text-amber-600 cursor-not-allowed" disabled
                                    ${sentToCommercial ? 'checked' : ''}>
                                <span>Enviado compras</span>
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
        const item = getImplantacaoStandardPurchaseItem(config.purchaseType);
        const el = document.getElementById(config.comercialId);
        if (el && isImplementationPurchaseItemSentToCompras(item)) el.disabled = true;
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
        const sentToCommercial = isImplementationPurchaseItemSentToCompras(item);
        const locked = disabled || sentToCommercial;
        const notApplicableEl = document.getElementById(config.notApplicableId);
        const comercialEl = document.getElementById(config.comercialId);
        if (notApplicableEl) notApplicableEl.disabled = locked;
        if (comercialEl && !sentToCommercial) {
            const hasFile = typeof hasImplantacaoListDriveFileUploaded === 'function'
                ? hasImplantacaoListDriveFileUploaded(config.purchaseType, item)
                : Boolean(String(item?.folderPath || '').trim());
            comercialEl.disabled = disabled || !hasFile;
        }
        [config.selectFileBtnId, config.uploadBtnId].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = locked;
        });
        if (typeof updateImplantacaoListUploadButtons === 'function') {
            updateImplantacaoListUploadButtons(config.purchaseType);
        }
    });

    document.getElementById('implantacao-wps-op-code')?.toggleAttribute('disabled', disabled);

    document.querySelectorAll('.implantacao-terceiro-item').forEach(row => {
        const subtypeId = Number(row.dataset.subtypeId);
        const existing = getImplantacaoTerceiroPurchaseItems().find(
            item => Number(item.thirdPartySubtypeId) === subtypeId
        );
        const sentToCommercial = isImplementationPurchaseItemSentToCompras(existing);
        const thirdPartyProject = getImplantacaoThirdPartyProjectForSubtype(subtypeId);
        const isApproved = thirdPartyProject?.status === THIRD_PARTY_PROJECT_STATUS_APPROVED;
        const locked = disabled || sentToCommercial || !isApproved;

        const checkedEl = row.querySelector('.implantacao-terceiro-checked');
        if (checkedEl) {
            checkedEl.disabled = locked;
            if (!isApproved && !sentToCommercial) checkedEl.checked = false;
        }
    });

    const createSelect = document.getElementById('implantacao-terceiro-create-subtype');
    const createBtn = document.getElementById('btn-implantacao-terceiro-create');
    if (createSelect) createSelect.disabled = disabled;
    if (createBtn) createBtn.disabled = disabled || !getImplantacaoThirdPartySubtypesWithoutProject().length;

    setImplantacaoComercialFieldsDisabled();
}

function canSendImplantacaoTerceiroItem(item) {
    if (!item?.isChecked || isImplementationPurchaseItemSentToCompras(item)) return false;

    const thirdPartyProject = getImplantacaoThirdPartyProjectForSubtype(item.thirdPartySubtypeId);
    if (!thirdPartyProject) return false;
    if (thirdPartyProject.status !== THIRD_PARTY_PROJECT_STATUS_APPROVED) {
        return false;
    }

    return true;
}

function canSendImplementationPurchaseItem(item) {
    if (item?.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO) {
        return canSendImplantacaoTerceiroItem(item);
    }

    const hasUploadedFile = typeof hasImplantacaoListDriveFileUploaded === 'function'
        ? hasImplantacaoListDriveFileUploaded(item.purchaseType, item)
        : Boolean(String(item?.folderPath || '').trim());

    return hasUploadedFile
        && Boolean(item?.pendingSendToCommercial)
        && !isImplementationPurchaseItemSentToCompras(item);
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
    const canAct = canActImplantacao(record);
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
    const allStandardChecked = standardItems.every(item => (
        typeof isImplantacaoStandardPurchaseItemFulfilled === 'function'
            ? isImplantacaoStandardPurchaseItemFulfilled(item)
            : Boolean(item?.isChecked)
    ));

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

async function createImplantacaoRecord(orderProjectId, options = {}) {
    const now = new Date().toISOString();
    const designerId = Object.prototype.hasOwnProperty.call(options, 'designerId')
        ? (Number(options.designerId) || null)
        : resolveImplementationDesignerId(options);
    const { data, error } = await supabaseClient
        .from('Implementation')
        .insert({
            orderProjectId,
            status: IMPLANTACAO_STATUS_ABERTO,
            designerId,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null,
            updatedAt: now
        })
        .select('*')
        .single();

    if (error) {
        if (error.message?.includes('designerId')) {
            throw new Error('Execute supabase/feats/add-implementation-designer.sql no Supabase SQL Editor.');
        }
        throw error;
    }

    await ensureStandardImplementationPurchaseItems(data.id);
    return data;
}

async function ensureImplantacaoRecord(orderProjectId, options = {}) {
    const existing = await fetchImplementationByOrderProjectId(orderProjectId);
    if (existing) {
        await ensureStandardImplementationPurchaseItems(existing.id);
        const designerId = Number(options.designerId || 0);
        if (designerId && !existing.designerId) {
            const now = new Date().toISOString();
            const { data, error } = await supabaseClient
                .from('Implementation')
                .update({
                    designerId,
                    updatedById: currentUser?.id || null,
                    updatedAt: now
                })
                .eq('id', existing.id)
                .select('*')
                .single();
            if (error) throw error;
            return data || existing;
        }
        return existing;
    }
    return createImplantacaoRecord(orderProjectId, options);
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
            const record = await ensureImplantacaoRecord(projectId, { designerId: null });
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
        isNotApplicable: Boolean(item.isNotApplicable),
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
        const existingRow = activeImplementationPurchaseItems.find(row => (
            (item.id && Number(row.id) === Number(item.id))
            || (
                item.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO
                && Number(row.thirdPartySubtypeId) === Number(item.thirdPartySubtypeId)
            )
            || (
                item.purchaseType !== IMPLANTACAO_PURCHASE_TYPE_TERCEIRO
                && row.purchaseType === item.purchaseType
            )
        ));

        if (isImplementationPurchaseItemSentToCompras(existingRow)) {
            if (existingRow) savedItems.push(existingRow);
            continue;
        }

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
        !isImplementationPurchaseItemSentToCompras(item)
        && itemsToSend.some(row => (
            (row.id && Number(row.id) === Number(item.id))
            || (
                item.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO
                && Number(item.thirdPartySubtypeId) === Number(row.thirdPartySubtypeId)
            )
        ))
    ));
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

function isImplantacaoModalOpen() {
    const modal = document.getElementById('implantacao-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

async function refreshImplantacaoModalThirdPartyState() {
    if (!isImplantacaoModalOpen() || !activeImplantacaoOrderProjectId) {
        return;
    }

    if (typeof fetchThirdPartyProjectsByOrderProjectId === 'function') {
        activeImplantacaoThirdPartyProjects = await fetchThirdPartyProjectsByOrderProjectId(
            activeImplantacaoOrderProjectId
        );
    }

    if (activeImplantacaoRecord?.id) {
        await loadActiveImplementationPurchaseItems(activeImplantacaoRecord.id);
        await loadImplantacaoCompraLinkedPurchaseItemIds(
            activeImplantacaoRecord.id,
            activeImplementationPurchaseItems,
            activeImplantacaoOrderProjectId
        );
    }

    populateImplantacaoForm(activeImplantacaoRecord);
    updateImplantacaoActionButtons(activeImplantacaoRecord);
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

    if (!activeOrderId
        && orderProjectId
        && typeof loadPendenciasImplantacao === 'function'
        && !isImplantacaoModalOpen()) {
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

async function openImplantacaoThirdPartyProjectDetail(thirdPartyProjectId) {
    const projectId = Number(thirdPartyProjectId);
    if (!projectId) return;

    if (typeof openThirdPartyProjectDetailModal !== 'function') {
        alertAppDialog('Detalhe do projeto indisponível.');
        return;
    }

    setImplantacaoModalLoading(true, 'Carregando detalhe do terceiro...');
    try {
        let project = null;
        if (typeof fetchThirdPartyProjectById === 'function') {
            project = await fetchThirdPartyProjectById(projectId);
        }
        if (!project) {
            project = (activeImplantacaoThirdPartyProjects || []).find(
                item => Number(item.id) === projectId
            );
        }
        if (!project) {
            alertAppDialog('Projeto de terceiros não encontrado.');
            return;
        }
        await openThirdPartyProjectDetailModal(project);
    } catch (error) {
        alertAppDialog(error.message || 'Não foi possível abrir o detalhe.');
    } finally {
        setImplantacaoModalLoading(false);
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
        await loadImplantacaoCompraLinkedPurchaseItemIds(
            activeImplantacaoRecord.id,
            activeImplementationPurchaseItems,
            activeImplantacaoOrderProjectId
        );

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
        if (typeof refreshImplantacaoDetalhamentoUploadSection === 'function') {
            await refreshImplantacaoDetalhamentoUploadSection(activeImplantacaoRecord);
        }
        toggleModal('implantacao-modal', true);
    } catch (error) {
        if (error.message?.includes('isNotApplicable')) {
            alertAppDialog('Execute supabase/feats/add-implementation-purchase-item-is-not-applicable.sql no Supabase SQL Editor (DEV e produção).');
        } else if (error.message?.includes('ImplementationPurchaseItem') || error.message?.includes('ThirdPartySubtype')) {
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
    if (typeof resetImplantacaoDetalhamentoUploadSection === 'function') {
        resetImplantacaoDetalhamentoUploadSection();
    }
    if (typeof resetImplantacaoListUploadSections === 'function') {
        resetImplantacaoListUploadSections();
    }
    toggleModal('implantacao-modal', false);
    activeImplantacaoOrderProjectId = null;
    activeImplantacaoRecord = null;
    activeImplantacaoProjectName = '';
    activeImplementationPurchaseItems = [];
    activeImplantacaoCompraLinkedPurchaseItemIds = new Set();
    activeImplantacaoCompraLockedStandardPurchaseTypes = new Set();
    activeImplantacaoThirdPartyProjects = [];
}
window.closeImplementationModal = closeImplementationModal;
window.openImplementationModal = openImplementationModal;
window.ensureImplementationRecordsForProjects = ensureImplementationRecordsForProjects;
window.fetchOrderProjectsInImplementationStatus = fetchOrderProjectsInImplementationStatus;
window.syncImplementationRecordsMapForProjects = syncImplementationRecordsMapForProjects;
window.closeImplantacaoModal = closeImplementationModal;
window.isImplantacaoModalOpen = isImplantacaoModalOpen;
window.refreshImplantacaoModalThirdPartyState = refreshImplantacaoModalThirdPartyState;
window.openImplantacaoModal = openImplementationModal;
window.isImplementationPurchaseItemSentToCompras = isImplementationPurchaseItemSentToCompras;
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
        'btn-implantacao-salvar',
        'btn-implantacao-detalhamento-select-file',
        'btn-implantacao-detalhamento-upload'
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
    await ensureImplantacaoRecord(orderProjectId, {
        designerId: currentUser?.id || null
    });
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
        if (typeof refreshImplantacaoDetalhamentoUploadSection === 'function') {
            await refreshImplantacaoDetalhamentoUploadSection(data);
        }

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

async function createImplantacaoThirdPartyProjectForSubtype(subtypeId) {
    const normalizedSubtypeId = Number(subtypeId);
    if (!normalizedSubtypeId || !activeImplantacaoOrderProjectId) return;

    if (!canActImplantacao(activeImplantacaoRecord)) {
        alertAppDialog('Sem permissão para criar projeto de terceiros.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (getImplantacaoThirdPartyProjectForSubtype(normalizedSubtypeId)) {
        renderImplantacaoTerceiroPurchaseItems();
        return;
    }

    try {
        setImplantacaoModalLoading(true, 'Criando projeto de terceiros...');

        const { data: orderProject, error: orderProjectError } = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, designerId')
            .eq('id', activeImplantacaoOrderProjectId)
            .maybeSingle();

        if (orderProjectError || !orderProject) {
            throw new Error('Ambiente do pedido não encontrado.');
        }

        if (typeof createThirdPartyProjectsForSelectedSubtypes !== 'function') {
            throw new Error('Criação de projetos de terceiros indisponível.');
        }

        const result = await createThirdPartyProjectsForSelectedSubtypes({
            orderId: orderProject.orderId,
            orderProjectId: orderProject.id,
            designerId: orderProject.designerId,
            thirdPartySubtypeIds: [normalizedSubtypeId]
        });

        if (typeof fetchThirdPartyProjectsByOrderProjectId === 'function') {
            activeImplantacaoThirdPartyProjects = await fetchThirdPartyProjectsByOrderProjectId(
                activeImplantacaoOrderProjectId
            );
        }

        renderImplantacaoTerceiroPurchaseItems();
        updateImplantacaoActionButtons(activeImplantacaoRecord);

        const createdCount = result?.created?.length || 0;
        setImplantacaoModalLoading(
            true,
            createdCount ? 'Projeto de terceiros criado.' : 'Projeto de terceiros já existia.',
            'success'
        );
        await waitImplantacaoStatus(900);
    } catch (error) {
        setImplantacaoModalLoading(true, error.message || 'Erro ao criar projeto.', 'error');
        await waitImplantacaoStatus(2200);
    } finally {
        setImplantacaoModalLoading(false);
    }
}

function formatImplantacaoPurchaseItemForComprasConfirm(item) {
    if (!item) return 'Item';
    if (item.purchaseType === IMPLANTACAO_PURCHASE_TYPE_TERCEIRO) {
        return `Terceiros — ${getImplantacaoTerceiroDisplayName(item)}`;
    }

    const config = IMPLANTACAO_STANDARD_PURCHASE_UI.find(row => row.purchaseType === item.purchaseType);
    const label = config?.label || item.purchaseType || 'Lista';
    if (item.isNotApplicable) return `${label} (não possui)`;
    return `${label} (PDF)`;
}

function buildImplantacaoEnviarComprasConfirmMessage(items = []) {
    const lines = items.map(item => `• ${formatImplantacaoPurchaseItemForComprasConfirm(item)}`);
    return `Os itens abaixo serão enviados às compras:\n\n${lines.join('\n')}`;
}

async function resolveImplementationPurchaseReasonId() {
    const { data, error } = await supabaseClient
        .from('PurchaseReason')
        .select('id, name')
        .eq('isActive', true);

    if (error) {
        console.warn('resolveImplementationPurchaseReasonId:', error.message);
        return null;
    }

    const match = (data || []).find(reason => {
        const name = String(reason.name || '').trim().toLocaleLowerCase('pt-BR');
        return name === 'implantação' || name === 'implantacao';
    });
    return match?.id ? Number(match.id) : null;
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

        alertAppDialog('Marque "Enviar para Compras" em ao menos uma lista com PDF já enviado, ou um terceiro com projeto aprovado.');
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

    const confirmed = await confirmAppDialog(
        buildImplantacaoEnviarComprasConfirmMessage(itemsToSend),
        {
            title: `Enviar para compras — ${activeImplantacaoProjectName || 'Projeto'}?`,
            confirmLabel: 'Enviar para compras',
            cancelLabel: 'Cancelar'
        }
    );
    if (!confirmed) return;

    try {
        setImplantacaoModalLoading(true, 'Registrando solicitações de compra...');
        const now = new Date().toISOString();

        const freshFormValues = readImplantacaoFormValues();
        const purchaseItemsForCompras = await getImplementationPurchaseItemsForComprasSend(freshFormValues);
        if (!purchaseItemsForCompras.length) {
            throw new Error('Nenhum item pôde ser enviado às compras. Verifique os checkboxes e tente novamente.');
        }

        const purchaseReasonId = await resolveImplementationPurchaseReasonId();

        const createdPurchases = await createComprasRecordsFromImplantacaoSend({
            implementationId: activeImplantacaoRecord.id,
            orderProjectId: activeImplantacaoOrderProjectId,
            purchaseItems: purchaseItemsForCompras,
            requestOrigin: 'implementation',
            purchaseReasonId,
            purchaseItemsAlreadyValidated: true
        });

        if (!createdPurchases.length) {
            throw new Error('Não foi possível gerar a solicitação de compra. Tente salvar e enviar novamente.');
        }

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
        await loadImplantacaoCompraLinkedPurchaseItemIds(
            activeImplantacaoRecord.id,
            activeImplementationPurchaseItems,
            activeImplantacaoOrderProjectId
        );

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

async function continueImplantacaoPurchaseRequest(draft, extras = {}) {
    if (!draft?.implementationId || !draft?.orderProjectId) {
        throw new Error('Implantação não encontrada para enviar às compras.');
    }

    const now = new Date().toISOString();
    const purchaseItemsForCompras = draft.purchaseItems || [];
    const createdPurchases = await createComprasRecordsFromImplantacaoSend({
        implementationId: draft.implementationId,
        orderProjectId: draft.orderProjectId,
        purchaseItems: purchaseItemsForCompras,
        requestOrigin: 'implementation',
        purchaseReasonId: extras.purchaseReasonId || null,
        observation: extras.observation || null,
        attachmentPath: extras.attachmentPath || null,
        attachmentFileName: extras.attachmentFileName || null,
        thirdPartySubtypeId: extras.thirdPartySubtypeId || null,
        purchaseItemsAlreadyValidated: true
    });

    if (!createdPurchases.length && purchaseItemsForCompras.length) {
        throw new Error('Não foi possível gerar a solicitação de compra.');
    }

    const sentIds = new Set(purchaseItemsForCompras.map(item => Number(item.id)));
    const updatedPurchaseItems = (draft.allPurchaseItems || []).map(item => {
        if (!sentIds.has(Number(item.id))) return item;
        return { ...item, sentToCommercial: true, sentToCommercialAt: now };
    });
    await saveImplementationPurchaseItems(updatedPurchaseItems, draft.implementationId);

    const payload = buildImplantacaoUpdatePayload(draft.formValues || {}, { purchasesSentAt: now });
    const { error } = await supabaseClient
        .from('Implementation')
        .update(payload)
        .eq('id', draft.implementationId);
    if (error) throw error;

    if (typeof refreshImplantacaoRelatedViews === 'function') {
        await refreshImplantacaoRelatedViews(draft.orderProjectId);
    }
    if (purchaseItemsForCompras.length && typeof notifyCompraLiberacaoEmails === 'function') {
        await notifyCompraLiberacaoEmails({
            items: purchaseItemsForCompras,
            orderProjectId: draft.orderProjectId
        });
    }
}

async function handleImplantacaoEncerrar() {
    if (!activeImplantacaoRecord?.id) return;

    const formValues = readImplantacaoFormValues();
    const standardItems = IMPLANTACAO_STANDARD_PURCHASE_UI.map(config => (
        formValues.purchaseItems.find(item => item.purchaseType === config.purchaseType)
    ));

    const allListsFulfilled = standardItems.every(item => (
        typeof isImplantacaoStandardPurchaseItemFulfilled === 'function'
            ? isImplantacaoStandardPurchaseItemFulfilled(item)
            : Boolean(item?.isChecked)
    ));
    if (!formValues.isProjectChecked || !allListsFulfilled) {
        alertAppDialog('Envie todas as listas (PDF) ou marque "Não possui" antes de encerrar a implantação.');
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
        'implantacao-wps-op-code'
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            updateImplantacaoActionButtons();
        });
    });

    document.getElementById('implantacao-projeto-checked')?.addEventListener('change', () => {
        updateImplantacaoActionButtons();
    });

    document.getElementById('implantacao-terceiros-items')?.addEventListener('change', (event) => {
        const checkbox = event.target.closest('.implantacao-terceiro-checked');
        if (!checkbox) return;
        const row = checkbox.closest('.implantacao-terceiro-item');
        const subtypeId = Number(row?.dataset.subtypeId);
        const thirdPartyProject = getImplantacaoThirdPartyProjectForSubtype(subtypeId);
        const existing = getImplantacaoTerceiroPurchaseItems().find(
            item => Number(item.thirdPartySubtypeId) === subtypeId
        );
        if (isImplementationPurchaseItemSentToCompras(existing)
            || thirdPartyProject?.status !== THIRD_PARTY_PROJECT_STATUS_APPROVED) {
            checkbox.checked = false;
            return;
        }
        updateImplantacaoActionButtons();
    });

    document.getElementById('implantacao-terceiros-items')?.addEventListener('click', (event) => {
        const detailButton = event.target.closest('.implantacao-terceiro-detail-link');
        if (!detailButton) return;
        event.preventDefault();
        openImplantacaoThirdPartyProjectDetail(Number(detailButton.dataset.thirdPartyProjectId));
    });

    document.getElementById('btn-implantacao-terceiro-create')?.addEventListener('click', () => {
        const select = document.getElementById('implantacao-terceiro-create-subtype');
        const subtypeId = Number(select?.value);
        if (!subtypeId) {
            alertAppDialog('Selecione um subtipo para criar o projeto.');
            return;
        }
        createImplantacaoThirdPartyProjectForSubtype(subtypeId);
    });

    document.getElementById('btn-implantacao-enviar-producao')
        ?.addEventListener('click', handleImplantacaoEnviarProducao);
    document.getElementById('btn-implantacao-enviar-compras')
        ?.addEventListener('click', handleImplantacaoEnviarCompras);
    document.getElementById('btn-implantacao-encerrar')
        ?.addEventListener('click', handleImplantacaoEncerrar);
    document.getElementById('btn-implantacao-salvar')
        ?.addEventListener('click', handleImplantacaoSalvar);

    if (typeof bindImplantacaoDetalhamentoUploadEvents === 'function') {
        bindImplantacaoDetalhamentoUploadEvents();
    }
    if (typeof bindImplantacaoListUploadEvents === 'function') {
        bindImplantacaoListUploadEvents();
    }
}

const bindImplantacaoEvents = bindImplementationEvents;
