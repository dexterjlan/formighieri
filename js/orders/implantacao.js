const IMPLANTACAO_STATUS_ABERTO = 'Aberto';
const IMPLANTACAO_STATUS_ENVIADO_PRODUCAO = 'Enviado para Produção';
const IMPLANTACAO_STATUS_ENCERRADO = 'Encerrado';
const IMPLANTACAO_PROJECT_STATUS_IMPLANTACAO = 'Implantação';
const IMPLANTACAO_PROJECT_STATUS_EM_PRODUCAO = 'Em Produção';

let activeImplantacaoOrderProjectId = null;
let activeImplantacaoRecord = null;
let activeImplantacaoProjectName = '';

function canAccessImplantacaoModal() {
    return canSeeOrderPpcpTab() || (typeof canSeePendenciasPpcpItems === 'function' && canSeePendenciasPpcpItems());
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
        comprasMateriaisChecked: Boolean(document.getElementById('implantacao-compras-checked')?.checked),
        comprasMateriaisEnviadoComercial: Boolean(activeImplantacaoRecord?.comprasMateriaisEnviadoComercial),
        comprasMateriaisEnviadoComercialAt: activeImplantacaoRecord?.comprasMateriaisEnviadoComercialAt || null,
        listaFerragensPath: document.getElementById('implantacao-ferragens-path')?.value?.trim() || '',
        listaFerragensChecked: Boolean(document.getElementById('implantacao-ferragens-checked')?.checked),
        listaFerragensEnviadoComercial: Boolean(activeImplantacaoRecord?.listaFerragensEnviadoComercial),
        listaFerragensEnviadoComercialAt: activeImplantacaoRecord?.listaFerragensEnviadoComercialAt || null,
        terceirosPath: document.getElementById('implantacao-terceiros-path')?.value?.trim() || '',
        terceirosChecked: Boolean(document.getElementById('implantacao-terceiros-checked')?.checked),
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
    document.getElementById('implantacao-terceiros-path').value = record?.terceirosPath || '';
    document.getElementById('implantacao-terceiros-checked').checked = Boolean(record?.terceirosChecked);
    document.getElementById('implantacao-compras-enviado-comercial').checked = Boolean(record?.comprasMateriaisEnviadoComercial);
    document.getElementById('implantacao-ferragens-enviado-comercial').checked = Boolean(record?.listaFerragensEnviadoComercial);
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
        'implantacao-terceiros-enviado-comercial'
    ].forEach(id => {
        const el = document.getElementById(id);
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
    [
        'implantacao-compras-path',
        'implantacao-compras-checked',
        'implantacao-ferragens-path',
        'implantacao-ferragens-checked',
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
        && Boolean(values.projetoPath);

    const canEnviarCompras = canAct
        && (
            (values.comprasMateriaisChecked
                && Boolean(values.comprasMateriaisPath)
                && !record?.comprasMateriaisEnviadoComercial)
            || (values.listaFerragensChecked
                && Boolean(values.listaFerragensPath)
                && !record?.listaFerragensEnviadoComercial)
            || (values.terceirosChecked
                && Boolean(values.terceirosPath)
                && !record?.terceirosEnviadoComercial)
        );

    const canEncerrar = canAct
        && values.projetoChecked
        && values.comprasMateriaisChecked
        && values.listaFerragensChecked
        && values.terceirosChecked;

    if (btnProducao) btnProducao.disabled = !canEnviarProducao;
    if (btnCompras) btnCompras.disabled = !canEnviarCompras;
    if (btnEncerrar) btnEncerrar.disabled = !canEncerrar;
    if (btnSalvar) btnSalvar.disabled = !canAct;

    setImplantacaoFormDisabled(!canAct);
    setImplantacaoProjetoFieldsDisabled(isEnviadoProducao || !canAct);
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

function buildImplantacaoUpdatePayload(formValues, extra = {}) {
    const now = new Date().toISOString();
    return {
        projetoPath: formValues.projetoPath || null,
        projetoChecked: formValues.projetoChecked,
        comprasMateriaisPath: formValues.comprasMateriaisPath || null,
        comprasMateriaisChecked: formValues.comprasMateriaisChecked,
        listaFerragensPath: formValues.listaFerragensPath || null,
        listaFerragensChecked: formValues.listaFerragensChecked,
        terceirosPath: formValues.terceirosPath || null,
        terceirosChecked: formValues.terceirosChecked,
        comprasMateriaisEnviadoComercial: formValues.comprasMateriaisEnviadoComercial,
        comprasMateriaisEnviadoComercialAt: formValues.comprasMateriaisEnviadoComercialAt,
        listaFerragensEnviadoComercial: formValues.listaFerragensEnviadoComercial,
        listaFerragensEnviadoComercialAt: formValues.listaFerragensEnviadoComercialAt,
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
            alert('Erro ao salvar implantação: ' + error.message);
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

    if (activeOrderId && typeof loadFabricaProjects === 'function' && canSeeOrderFabricaTab()) {
        await loadFabricaProjects(activeOrderId);
    }

    if (activeOrderId && typeof loadOrderProjects === 'function') {
        await loadOrderProjects(activeOrderId);
    }

    if (!activeOrderId && orderProjectId && typeof loadPendenciasImplantacao === 'function') {
        await loadPendenciasImplantacao();
    }
}

async function openImplantacaoModal(orderProjectId, projectName = '', options = {}) {
    const { requireExisting = false } = options;
    if (!orderProjectId) return;

    if (!canAccessImplantacaoModal()) {
        alert('Sem permissão para acessar a implantação.');
        return;
    }

    try {
        activeImplantacaoOrderProjectId = Number(orderProjectId);
        activeImplantacaoProjectName = projectName || 'Projeto';

        if (requireExisting) {
            activeImplantacaoRecord = await fetchImplantacaoByOrderProjectId(activeImplantacaoOrderProjectId);
            if (!activeImplantacaoRecord) {
                alert('Implantação ainda não iniciada para este projeto.');
                return;
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
            alert('Tabela Implantacao não encontrada. Execute supabase/create-implantacao.sql no Supabase.');
        } else {
            alert('Erro ao abrir implantação: ' + error.message);
        }
    }
}

function closeImplantacaoModal() {
    toggleModal('implantacao-modal', false);
    activeImplantacaoOrderProjectId = null;
    activeImplantacaoRecord = null;
    activeImplantacaoProjectName = '';
}
window.closeImplantacaoModal = closeImplantacaoModal;
window.openImplantacaoModal = openImplantacaoModal;

async function createImplantacaoForProject(orderProjectId) {
    await ensureImplantacaoRecord(orderProjectId);
}

async function handleImplantacaoSalvar() {
    if (!activeImplantacaoRecord?.id) return;

    const btn = document.getElementById('btn-implantacao-salvar');
    if (btn) btn.disabled = true;

    try {
        const data = await saveImplantacaoFormFields({ silent: false });
        populateImplantacaoForm(data);
        updateImplantacaoActionButtons(data);
        alert('Implantação salva.');
    } catch (error) {
        updateImplantacaoActionButtons();
    }
}

async function handleImplantacaoEnviarProducao() {
    if (!activeImplantacaoRecord?.id || !activeImplantacaoOrderProjectId) return;

    const formValues = readImplantacaoFormValues();
    if (!formValues.projetoChecked || !formValues.projetoPath) {
        alert('Marque o checklist de Projeto e informe o caminho da pasta.');
        return;
    }

    if (!confirm(`Enviar "${activeImplantacaoProjectName}" para produção?`)) return;

    const btn = document.getElementById('btn-implantacao-enviar-producao');
    if (btn) btn.disabled = true;

    try {
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

        await updateOrderProjectStatusForImplantacao(
            activeImplantacaoOrderProjectId,
            IMPLANTACAO_PROJECT_STATUS_EM_PRODUCAO
        );

        activeImplantacaoRecord = data;
        populateImplantacaoForm(data);
        updateImplantacaoActionButtons(data);
        await refreshImplantacaoRelatedViews(activeImplantacaoOrderProjectId);
    } catch (error) {
        alert('Erro ao enviar para produção: ' + error.message);
        updateImplantacaoActionButtons();
    }
}

async function handleImplantacaoEnviarCompras() {
    if (!activeImplantacaoRecord?.id) return;

    const formValues = readImplantacaoFormValues();
    const hasCompras = formValues.comprasMateriaisChecked && formValues.comprasMateriaisPath;
    const hasFerragens = formValues.listaFerragensChecked && formValues.listaFerragensPath;
    const hasTerceiros = formValues.terceirosChecked && formValues.terceirosPath;

    if (!hasCompras && !hasFerragens && !hasTerceiros) {
        alert('Marque e preencha o caminho de Lista de Material, Lista de Ferragens e/ou Terceiros.');
        return;
    }

    const btn = document.getElementById('btn-implantacao-enviar-compras');
    if (btn) btn.disabled = true;

    try {
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

        if (hasTerceiros && !activeImplantacaoRecord?.terceirosEnviadoComercial) {
            extra.terceirosEnviadoComercial = true;
            extra.terceirosEnviadoComercialAt = now;
        }

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
        updateImplantacaoActionButtons(data);
        alert('Envio para compras registrado.');
    } catch (error) {
        alert('Erro ao enviar para compras: ' + error.message);
        updateImplantacaoActionButtons();
    }
}

async function handleImplantacaoEncerrar() {
    if (!activeImplantacaoRecord?.id) return;

    const formValues = readImplantacaoFormValues();
    if (!formValues.projetoChecked || !formValues.comprasMateriaisChecked
        || !formValues.listaFerragensChecked || !formValues.terceirosChecked) {
        alert('Marque todos os checklists para encerrar a implantação.');
        return;
    }

    if (!confirm(`Encerrar a implantação de "${activeImplantacaoProjectName}"?`)) return;

    const btn = document.getElementById('btn-implantacao-encerrar');
    if (btn) btn.disabled = true;

    try {
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
        updateImplantacaoActionButtons(data);
        await refreshImplantacaoRelatedViews(activeImplantacaoOrderProjectId);
    } catch (error) {
        alert('Erro ao encerrar implantação: ' + error.message);
        updateImplantacaoActionButtons();
    }
}

function bindImplantacaoEvents() {
    [
        'implantacao-projeto-path',
        'implantacao-compras-path',
        'implantacao-ferragens-path',
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
        'implantacao-terceiros-checked'
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
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
