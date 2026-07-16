const IMPLANTACAO_STATUS_ABERTO = 'Aberto';
const IMPLANTACAO_STATUS_ENVIADO_PRODUCAO = 'Enviado para Produção';
const IMPLANTACAO_STATUS_ENCERRADO = 'Encerrado';
const IMPLANTACAO_PROJECT_STATUS_IMPLANTACAO = 'Implantação';
const IMPLANTACAO_PROJECT_STATUS_EM_PRODUCAO = 'Em Produção';

let activeImplantacaoOrderProjectId = null;
let activeImplantacaoRecord = null;
let activeImplantacaoProjectName = '';

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

function readImplantacaoFormValues() {
    return {
        projetoPath: document.getElementById('implantacao-projeto-path')?.value?.trim() || '',
        projetoChecked: Boolean(document.getElementById('implantacao-projeto-checked')?.checked),
        comprasMateriaisPath: document.getElementById('implantacao-compras-path')?.value?.trim() || '',
        comprasMateriaisChecked: readImplantacaoListaChecked(
            'implantacao-compras-checked', 'comprasMateriaisChecked', 'comprasMateriaisEnviadoComercial'
        ),
        comprasMateriaisEnviadoComercial: Boolean(activeImplantacaoRecord?.comprasMateriaisEnviadoComercial),
        comprasMateriaisEnviadoComercialAt: activeImplantacaoRecord?.comprasMateriaisEnviadoComercialAt || null,
        listaFerragensPath: document.getElementById('implantacao-ferragens-path')?.value?.trim() || '',
        listaFerragensChecked: readImplantacaoListaChecked(
            'implantacao-ferragens-checked', 'listaFerragensChecked', 'listaFerragensEnviadoComercial'
        ),
        listaFerragensEnviadoComercial: Boolean(activeImplantacaoRecord?.listaFerragensEnviadoComercial),
        listaFerragensEnviadoComercialAt: activeImplantacaoRecord?.listaFerragensEnviadoComercialAt || null,
        listaTintasPath: document.getElementById('implantacao-tintas-path')?.value?.trim() || '',
        listaTintasChecked: readImplantacaoListaChecked(
            'implantacao-tintas-checked', 'listaTintasChecked', 'listaTintasEnviadoComercial'
        ),
        listaTintasEnviadoComercial: Boolean(activeImplantacaoRecord?.listaTintasEnviadoComercial),
        listaTintasEnviadoComercialAt: activeImplantacaoRecord?.listaTintasEnviadoComercialAt || null,
        terceirosPath: document.getElementById('implantacao-terceiros-path')?.value?.trim() || '',
        terceirosChecked: readImplantacaoListaChecked(
            'implantacao-terceiros-checked', 'terceirosChecked', 'terceirosEnviadoComercial'
        ),
        terceirosEnviadoComercial: Boolean(activeImplantacaoRecord?.terceirosEnviadoComercial),
        terceirosEnviadoComercialAt: activeImplantacaoRecord?.terceirosEnviadoComercialAt || null,
        wpsOpCode: document.getElementById('implantacao-wps-op-code')?.value?.trim() || ''
    };
}

function populateImplantacaoForm(record) {
    document.getElementById('implantacao-projeto-path').value = record?.projetoPath || '';
    document.getElementById('implantacao-projeto-checked').checked = Boolean(record?.projetoChecked);
    document.getElementById('implantacao-compras-path').value = record?.comprasMateriaisPath || '';
    document.getElementById('implantacao-compras-checked').checked = Boolean(record?.comprasMateriaisChecked);
    document.getElementById('implantacao-ferragens-path').value = record?.listaFerragensPath || '';
    document.getElementById('implantacao-ferragens-checked').checked = Boolean(record?.listaFerragensChecked);
    document.getElementById('implantacao-tintas-path').value = record?.listaTintasPath || '';
    document.getElementById('implantacao-tintas-checked').checked = Boolean(record?.listaTintasChecked);
    document.getElementById('implantacao-terceiros-path').value = record?.terceirosPath || '';
    document.getElementById('implantacao-terceiros-checked').checked = Boolean(record?.terceirosChecked);
    document.getElementById('implantacao-compras-enviado-comercial').checked = Boolean(record?.comprasMateriaisEnviadoComercial);
    document.getElementById('implantacao-ferragens-enviado-comercial').checked = Boolean(record?.listaFerragensEnviadoComercial);
    document.getElementById('implantacao-tintas-enviado-comercial').checked = Boolean(record?.listaTintasEnviadoComercial);
    document.getElementById('implantacao-terceiros-enviado-comercial').checked = Boolean(record?.terceirosEnviadoComercial);
    document.getElementById('implantacao-wps-op-code').value = record?.wpsOpCode || '';

    updateImplantacaoComercialDateLabel(
        'implantacao-compras-enviado-comercial',
        'implantacao-compras-enviado-comercial-date',
        record?.comprasMateriaisEnviadoComercial ? record?.comprasMateriaisEnviadoComercialAt : null
    );
    updateImplantacaoComercialDateLabel(
        'implantacao-ferragens-enviado-comercial',
        'implantacao-ferragens-enviado-comercial-date',
        record?.listaFerragensEnviadoComercial ? record?.listaFerragensEnviadoComercialAt : null
    );
    updateImplantacaoComercialDateLabel(
        'implantacao-tintas-enviado-comercial',
        'implantacao-tintas-enviado-comercial-date',
        record?.listaTintasEnviadoComercial ? record?.listaTintasEnviadoComercialAt : null
    );
    updateImplantacaoComercialDateLabel(
        'implantacao-terceiros-enviado-comercial',
        'implantacao-terceiros-enviado-comercial-date',
        record?.terceirosEnviadoComercial ? record?.terceirosEnviadoComercialAt : null
    );

    const badge = document.getElementById('implantacao-modal-status-badge');
    const status = record?.status || IMPLANTACAO_STATUS_ABERTO;
    if (badge) {
        badge.textContent = status;
        badge.className = `text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${getImplantacaoStatusBadgeClass(status)}`;
    }
}

function setImplantacaoComercialFieldsDisabled() {
    [
        'implantacao-compras-enviado-comercial',
        'implantacao-ferragens-enviado-comercial',
        'implantacao-tintas-enviado-comercial',
        'implantacao-terceiros-enviado-comercial'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });
}

const IMPLANTACAO_LISTA_CHECKBOX_LOCKS = [
    { checkboxId: 'implantacao-compras-checked', sentKey: 'comprasMateriaisEnviadoComercial', checkedKey: 'comprasMateriaisChecked' },
    { checkboxId: 'implantacao-ferragens-checked', sentKey: 'listaFerragensEnviadoComercial', checkedKey: 'listaFerragensChecked' },
    { checkboxId: 'implantacao-tintas-checked', sentKey: 'listaTintasEnviadoComercial', checkedKey: 'listaTintasChecked' },
    { checkboxId: 'implantacao-terceiros-checked', sentKey: 'terceirosEnviadoComercial', checkedKey: 'terceirosChecked' }
];

function setImplantacaoListaCheckboxesLockedByComercial(record = activeImplantacaoRecord) {
    IMPLANTACAO_LISTA_CHECKBOX_LOCKS.forEach(({ checkboxId, sentKey }) => {
        const el = document.getElementById(checkboxId);
        if (!el || el.disabled) return;
        if (Boolean(record?.[sentKey])) el.disabled = true;
    });
}

function readImplantacaoListaChecked(checkboxId, checkedKey, sentKey) {
    if (Boolean(activeImplantacaoRecord?.[sentKey])) {
        return Boolean(activeImplantacaoRecord?.[checkedKey]);
    }
    return Boolean(document.getElementById(checkboxId)?.checked);
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
    [
        'implantacao-compras-path',
        'implantacao-compras-checked',
        'implantacao-ferragens-path',
        'implantacao-ferragens-checked',
        'implantacao-tintas-path',
        'implantacao-tintas-checked',
        'implantacao-terceiros-path',
        'implantacao-terceiros-checked',
        'implantacao-wps-op-code'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    });

    setImplantacaoComercialFieldsDisabled();
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
        && (
            (values.comprasMateriaisChecked
                && Boolean(values.comprasMateriaisPath)
                && !record?.comprasMateriaisEnviadoComercial)
            || (values.listaFerragensChecked
                && Boolean(values.listaFerragensPath)
                && !record?.listaFerragensEnviadoComercial)
            || (values.listaTintasChecked
                && Boolean(values.listaTintasPath)
                && !record?.listaTintasEnviadoComercial)
            || (values.terceirosChecked
                && Boolean(values.terceirosPath)
                && !record?.terceirosEnviadoComercial)
        );

    const canEncerrar = canAct
        && values.projetoChecked
        && values.comprasMateriaisChecked
        && values.listaFerragensChecked
        && values.listaTintasChecked
        && values.terceirosChecked;

    if (btnProducao) btnProducao.disabled = !canEnviarProducao;
    if (btnCompras) btnCompras.disabled = !canEnviarCompras;
    if (btnEncerrar) btnEncerrar.disabled = !canEncerrar;
    if (btnSalvar) btnSalvar.disabled = !canAct;

    setImplantacaoFormDisabled(!canAct);
    setImplantacaoProjetoFieldsDisabled(isEnviadoProducao || !canAct);
    setImplantacaoListaCheckboxesLockedByComercial(record);
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
    return data;
}

async function ensureImplantacaoRecord(orderProjectId) {
    const existing = await fetchImplantacaoByOrderProjectId(orderProjectId);
    if (existing) return existing;
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
        comprasMateriaisPath: formValues.comprasMateriaisPath || null,
        comprasMateriaisChecked: formValues.comprasMateriaisChecked,
        listaFerragensPath: formValues.listaFerragensPath || null,
        listaFerragensChecked: formValues.listaFerragensChecked,
        listaTintasPath: formValues.listaTintasPath || null,
        listaTintasChecked: formValues.listaTintasChecked,
        terceirosPath: formValues.terceirosPath || null,
        terceirosChecked: formValues.terceirosChecked,
        comprasMateriaisEnviadoComercial: formValues.comprasMateriaisEnviadoComercial,
        comprasMateriaisEnviadoComercialAt: formValues.comprasMateriaisEnviadoComercialAt,
        listaFerragensEnviadoComercial: formValues.listaFerragensEnviadoComercial,
        listaFerragensEnviadoComercialAt: formValues.listaFerragensEnviadoComercialAt,
        listaTintasEnviadoComercial: formValues.listaTintasEnviadoComercial,
        listaTintasEnviadoComercialAt: formValues.listaTintasEnviadoComercialAt,
        terceirosEnviadoComercial: formValues.terceirosEnviadoComercial,
        terceirosEnviadoComercialAt: formValues.terceirosEnviadoComercialAt,
        wpsOpCode: formValues.wpsOpCode || null,
        updatedById: currentUser?.id || null,
        updatedAt: now,
        ...extra
    };
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
    return data;
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

        document.getElementById('implantacao-modal-project-name').textContent = activeImplantacaoProjectName;
        populateImplantacaoForm(activeImplantacaoRecord);
        updateImplantacaoActionButtons(activeImplantacaoRecord);
        toggleModal('implantacao-modal', true);
    } catch (error) {
        if (error.message?.includes('Implantacao') || error.message?.includes('does not exist')) {
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
}
window.closeImplantacaoModal = closeImplantacaoModal;
window.openImplantacaoModal = openImplantacaoModal;
window.ensureImplantacaoRecordsForProjects = ensureImplantacaoRecordsForProjects;
window.fetchOrderProjectsInImplantacaoStatus = fetchOrderProjectsInImplantacaoStatus;
window.syncImplantacaoRecordsMapForProjects = syncImplantacaoRecordsMapForProjects;

function setImplantacaoModalLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('implantacao-modal-loading');
    const messageEl = document.getElementById('implantacao-modal-loading-msg');
    const spinner = document.getElementById('implantacao-modal-loading-spinner');
    const successIcon = document.getElementById('implantacao-modal-loading-success');
    const errorIcon = document.getElementById('implantacao-modal-loading-error');
    const show = Boolean(active);

    overlay?.classList.toggle('hidden', !show);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.toggle('text-red-600', status === 'error');
        messageEl.classList.toggle('text-emerald-700', status === 'success');
        messageEl.classList.toggle('text-slate-700', status === 'loading');
    }

    spinner?.classList.toggle('hidden', status !== 'loading');
    successIcon?.classList.toggle('hidden', status !== 'success');
    errorIcon?.classList.toggle('hidden', status !== 'error');

    [
        'btn-implantacao-enviar-producao',
        'btn-implantacao-enviar-compras',
        'btn-implantacao-encerrar',
        'btn-implantacao-salvar'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el && show) el.disabled = true;
    });

    const closeBtn = document.querySelector('#implantacao-modal button[onclick="closeImplantacaoModal()"]');
    if (closeBtn) closeBtn.disabled = show;

    document.querySelectorAll('#implantacao-modal input:not([disabled]), #implantacao-modal textarea:not([disabled])')
        .forEach(el => {
            if (show) {
                el.dataset.implantacaoLoadingDisabled = '1';
                el.disabled = true;
            } else if (el.dataset.implantacaoLoadingDisabled === '1') {
                delete el.dataset.implantacaoLoadingDisabled;
                el.disabled = false;
            }
        });

    if (!show) {
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
    const hasCompras = formValues.comprasMateriaisChecked && formValues.comprasMateriaisPath;
    const hasFerragens = formValues.listaFerragensChecked && formValues.listaFerragensPath;
    const hasTintas = formValues.listaTintasChecked && formValues.listaTintasPath;
    const hasTerceiros = formValues.terceirosChecked && formValues.terceirosPath;

    if (!hasCompras && !hasFerragens && !hasTintas && !hasTerceiros) {
        alertAppDialog('Marque e preencha o caminho de Lista de Material, Lista de Ferragens, Lista de Tintas e/ou Terceiros.');
        return;
    }

    const itemsToSend = typeof getImplantacaoCompraSendItems === 'function'
        ? getImplantacaoCompraSendItems(formValues, activeImplantacaoRecord)
        : [];

    try {
        setImplantacaoModalLoading(true, 'Registrando solicitações de compra...');
        const now = new Date().toISOString();
        const extra = {
            comprasEnviadoAt: now
        };

        if (hasCompras && !activeImplantacaoRecord?.comprasMateriaisEnviadoComercial) {
            extra.comprasMateriaisEnviadoComercial = true;
            extra.comprasMateriaisEnviadoComercialAt = now;
        }

        if (hasFerragens && !activeImplantacaoRecord?.listaFerragensEnviadoComercial) {
            extra.listaFerragensEnviadoComercial = true;
            extra.listaFerragensEnviadoComercialAt = now;
        }

        if (hasTintas && !activeImplantacaoRecord?.listaTintasEnviadoComercial) {
            extra.listaTintasEnviadoComercial = true;
            extra.listaTintasEnviadoComercialAt = now;
        }

        if (hasTerceiros && !activeImplantacaoRecord?.terceirosEnviadoComercial) {
            extra.terceirosEnviadoComercial = true;
            extra.terceirosEnviadoComercialAt = now;
        }

        await createComprasRecordsFromImplantacaoSend({
            implantacaoId: activeImplantacaoRecord.id,
            orderProjectId: activeImplantacaoOrderProjectId,
            formValues,
            record: activeImplantacaoRecord
        });

        setImplantacaoModalLoading(true, 'Salvando implantação...');
        const payload = buildImplantacaoUpdatePayload(formValues, extra);

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

        if (itemsToSend.length && typeof notifyCompraLiberacaoEmails === 'function') {
            setImplantacaoModalLoading(true, 'Enviando e-mail de liberação...');
            await notifyCompraLiberacaoEmails({
                items: itemsToSend,
                formValues,
                orderProjectId: activeImplantacaoOrderProjectId
            });
        }

        updateImplantacaoActionButtons(data);
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
    if (!formValues.projetoChecked || !formValues.comprasMateriaisChecked
        || !formValues.listaFerragensChecked || !formValues.listaTintasChecked
        || !formValues.terceirosChecked) {
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
        'implantacao-terceiros-path',
        'implantacao-wps-op-code'
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('input', async () => {
            updateImplantacaoActionButtons();
        });
    });

    [
        'implantacao-projeto-checked',
        'implantacao-compras-checked',
        'implantacao-ferragens-checked',
        'implantacao-tintas-checked',
        'implantacao-terceiros-checked'
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('change', async () => {
            updateImplantacaoActionButtons();
        });
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
