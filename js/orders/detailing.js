const DETALHAMENTO_STATUS_AGUARDANDO = 'Aguardando Detalhamento';
const DETALHAMENTO_STATUS_EM_ANDAMENTO = 'Detalhamento';
const DETALHAMENTO_STATUS_PRONTO = 'Pronto';
const DETALHAMENTO_PROJECT_STATUS_EM_PRODUCAO = 'Em Produção';

let activeDetalhamentoOrderProjectId = null;
let activeDetalhamentoRecord = null;
let activeDetalhamentoProjectName = '';
let detalhamentoProjetistasCache = [];

function canActDetalhamentoGestor() {
    return isAdmin() || isGestorProjetos();
}

function canActDetalhamentoProjetista(record = activeDetalhamentoRecord) {
    if (!record || !isDetalhamento()) return false;
    return Number(record.designerId) === Number(currentUser?.id);
}

function canAccessDetalhamentoModal() {
    return Boolean(activeDetalhamentoRecord?.id);
}

async function fetchDetailingByOrderProjectId(orderProjectId) {
    const { data, error } = await supabaseClient
        .from('Detailing')
        .select('*, designer:appUsers!Detailing_designerId_fkey(id, name)')
        .eq('orderProjectId', orderProjectId)
        .maybeSingle();

    if (error?.message?.includes('Detailing')) return null;
    if (error) throw error;
    return data;
}

window.fetchDetailingByOrderProjectId = fetchDetailingByOrderProjectId;
window.fetchDetalhamentoByOrderProjectId = fetchDetailingByOrderProjectId;

async function fetchDetalhamentoProjetoPathFromImplantacao(orderProjectId) {
    if (typeof fetchImplantacaoByOrderProjectId !== 'function') return '';
    const implantacao = await fetchImplantacaoByOrderProjectId(orderProjectId);
    return implantacao?.projectFilePath?.trim() || '';
}

async function createDetalhamentoRecord(orderProjectId) {
    const projectFilePath = await fetchDetalhamentoProjetoPathFromImplantacao(orderProjectId);
    const now = new Date().toISOString();

    const { data, error } = await supabaseClient
        .from('Detailing')
        .insert({
            orderProjectId,
            status: DETALHAMENTO_STATUS_AGUARDANDO,
            projectFilePath: projectFilePath || null,
            createdById: currentUser?.id || null,
            updatedById: currentUser?.id || null,
            updatedAt: now
        })
        .select('*, designer:appUsers!Detailing_designerId_fkey(id, name)')
        .single();

    if (error) throw error;
    return data;
}

async function ensureDetalhamentoRecord(orderProjectId) {
    const existing = await fetchDetailingByOrderProjectId(orderProjectId);
    if (existing) return existing;
    return createDetalhamentoRecord(orderProjectId);
}

async function createDetailingForProject(orderProjectId) {
    try {
        const existing = await fetchDetailingByOrderProjectId(orderProjectId);
        if (existing) return existing;

        const record = await createDetalhamentoRecord(orderProjectId);

        if (record && typeof notifyAguardandoDetalhamentoEmail === 'function') {
            await notifyAguardandoDetalhamentoEmail({
                orderProjectId,
                projectFilePath: record.projectFilePath || ''
            });
        }

        return record;
    } catch (error) {
        console.warn('createDetailingForProject:', orderProjectId, error);
        return null;
    }
}

window.createDetailingForProject = createDetailingForProject;
window.createDetalhamentoForProject = createDetailingForProject;

async function fetchDetalhamentoProjetistas(force = false) {
    if (!force && detalhamentoProjetistasCache.length) {
        return detalhamentoProjetistasCache;
    }

    let result = await supabaseClient
        .from('appUsers')
        .select('id, name, isDetailing')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .eq('isDetailing', true)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('isDetailing')) {
        detalhamentoProjetistasCache = [];
        return detalhamentoProjetistasCache;
    }

    if (result.error) {
        console.error('fetchDetalhamentoProjetistas:', result.error);
        detalhamentoProjetistasCache = [];
        return detalhamentoProjetistasCache;
    }

    detalhamentoProjetistasCache = result.data || [];
    return detalhamentoProjetistasCache;
}

function getDetalhamentoProjetistaOptionsHtml(selectedId = null) {
    return detalhamentoProjetistasCache.map(projetista => {
        const selected = Number(selectedId) === Number(projetista.id) ? 'selected' : '';
        return `<option value="${projetista.id}" ${selected}>${escapeHtml(projetista.name)}</option>`;
    }).join('');
}

async function countDetalhamentosEmAndamentoForDesigner(designerId) {
    if (!designerId) return 0;

    const { count, error } = await supabaseClient
        .from('Detailing')
        .select('id', { count: 'exact', head: true })
        .eq('designerId', designerId)
        .eq('status', DETALHAMENTO_STATUS_EM_ANDAMENTO);

    if (error) {
        console.warn('countDetalhamentosEmAndamentoForDesigner:', error);
        return 0;
    }

    return count || 0;
}

const DETALHAMENTO_MODAL_OVERLAY = createModalOverlayConfig('detalhamento-modal');

function setDetalhamentoModalLoading(visible, message = 'Processando...', variant = 'loading') {
    setModalOverlayLoading(DETALHAMENTO_MODAL_OVERLAY, visible, message, variant);
}

function waitDetalhamentoStatus(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function populateDetalhamentoForm(record) {
    const badge = document.getElementById('detalhamento-modal-status-badge');
    const projectFilePath = document.getElementById('detalhamento-projeto-path');
    const serverFolderPath = document.getElementById('detalhamento-server-folder-path');
    const designerSelect = document.getElementById('detalhamento-designer-select');
    const designerReadonly = document.getElementById('detalhamento-designer-readonly');
    const startedAt = document.getElementById('detalhamento-started-at');
    const completedAt = document.getElementById('detalhamento-completed-at');

    if (badge) {
        badge.textContent = record?.status || DETALHAMENTO_STATUS_AGUARDANDO;
        badge.className = `text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${getDetalhamentoStatusBadgeClass(record?.status)}`;
    }

    if (projectFilePath) projectFilePath.value = record?.projectFilePath || '';
    if (serverFolderPath) serverFolderPath.value = record?.serverFolderPath || '';
    if (designerSelect) designerSelect.value = record?.designerId ? String(record.designerId) : '';
    if (designerReadonly) {
        designerReadonly.textContent = record?.designer?.name || '—';
    }
    if (startedAt) {
        startedAt.textContent = record?.startedAt && typeof formatDate === 'function'
            ? formatDate(record.startedAt)
            : (record?.startedAt ? record.startedAt : '—');
    }
    if (completedAt) {
        completedAt.textContent = record?.completedAt && typeof formatDate === 'function'
            ? formatDate(record.completedAt)
            : (record?.completedAt ? record.completedAt : '—');
    }

    updateDetalhamentoActionButtons(record);
}

function updateDetalhamentoActionButtons(record = activeDetalhamentoRecord) {
    const gestorSection = document.getElementById('detalhamento-gestor-section');
    const projetistaActions = document.getElementById('detalhamento-projetista-actions');
    const btnAssociar = document.getElementById('btn-detalhamento-associar');
    const btnIniciar = document.getElementById('btn-detalhamento-iniciar');
    const btnEncerrar = document.getElementById('btn-detalhamento-encerrar');
    const serverFolderField = document.getElementById('detalhamento-server-folder-field');
    const designerSelect = document.getElementById('detalhamento-designer-select');
    const designerReadonlyWrap = document.getElementById('detalhamento-designer-readonly-wrap');
    const isPronto = record?.status === DETALHAMENTO_STATUS_PRONTO;
    const canGestor = canActDetalhamentoGestor() && !isPronto;
    const canProjetista = canActDetalhamentoProjetista(record) && !isPronto;
    const isAguardando = record?.status === DETALHAMENTO_STATUS_AGUARDANDO;
    const isEmAndamento = record?.status === DETALHAMENTO_STATUS_EM_ANDAMENTO;

    gestorSection?.classList.toggle('hidden', !canGestor);
    projetistaActions?.classList.toggle('hidden', !canProjetista);
    designerSelect?.classList.toggle('hidden', !canGestor);
    designerReadonlyWrap?.classList.toggle('hidden', canGestor);

    if (btnAssociar) {
        btnAssociar.classList.toggle('hidden', !canGestor);
        btnAssociar.disabled = !canGestor;
    }
    if (btnIniciar) {
        btnIniciar.classList.toggle('hidden', !(canProjetista && isAguardando));
        btnIniciar.disabled = !(canProjetista && isAguardando);
    }
    if (btnEncerrar) {
        btnEncerrar.classList.toggle('hidden', !(canProjetista && isEmAndamento));
        btnEncerrar.disabled = !(canProjetista && isEmAndamento);
    }

    const serverEditable = canProjetista && isEmAndamento;
    if (serverFolderField) {
        serverFolderField.classList.toggle('hidden', isPronto ? false : !serverEditable && !record?.serverFolderPath);
    }
    const serverInput = document.getElementById('detalhamento-server-folder-path');
    if (serverInput) {
        serverInput.readOnly = !serverEditable;
        serverInput.classList.toggle('bg-slate-50', !serverEditable);
    }
}

async function refreshDetalhamentoRelatedViews(orderProjectId) {
    if (typeof loadPendenciasContent === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
        if (pendenciasActiveSection === 'gestor-projetos' && pendenciasActiveItem === 'aguardando-detalhamento') {
            await loadPendenciasGestorDetalhamento();
        }
        if (pendenciasActiveSection === 'projetista' && pendenciasActiveItem === 'detalhamento') {
            await loadPendenciasProjetistaDetalhamento();
        }
    }

    if (activeOrderId && typeof loadOrderProjects === 'function') {
        await loadOrderProjects(activeOrderId);
    }

    if (!activeOrderId && orderProjectId && typeof loadPendenciasGestorDetalhamento === 'function') {
        await loadPendenciasGestorDetalhamento();
    }
}

async function openDetailingModal(orderProjectId, projectName = '') {
    if (!orderProjectId) return;

    activeDetalhamentoOrderProjectId = Number(orderProjectId);
    activeDetalhamentoProjectName = projectName || 'Projeto';

    try {
        activeDetalhamentoRecord = await fetchDetailingByOrderProjectId(activeDetalhamentoOrderProjectId);
        if (!activeDetalhamentoRecord) {
            alertAppDialog('Detalhamento não encontrado para este projeto.', { variant: 'warning', title: 'Aviso' });
            return;
        }

        await fetchDetalhamentoProjetistas(true);

        const designerSelect = document.getElementById('detalhamento-designer-select');
        if (designerSelect) {
            designerSelect.innerHTML = `<option value="">Selecione...</option>${getDetalhamentoProjetistaOptionsHtml(activeDetalhamentoRecord.designerId)}`;
        }

        document.getElementById('detalhamento-modal-project-name').textContent = activeDetalhamentoProjectName;
        populateDetalhamentoForm(activeDetalhamentoRecord);
        toggleModal('detalhamento-modal', true);
    } catch (error) {
        alertAppDialog(`Erro ao abrir detalhamento: ${error.message}`);
    }
}

window.openDetailingModal = openDetailingModal;
window.openDetalhamentoModal = openDetailingModal;

function closeDetailingModal() {
    toggleModal('detalhamento-modal', false);
    activeDetalhamentoOrderProjectId = null;
    activeDetalhamentoRecord = null;
    activeDetalhamentoProjectName = '';
    setDetalhamentoModalLoading(false);
}

async function handleDetalhamentoAssociar() {
    if (!activeDetalhamentoRecord?.id || !canActDetalhamentoGestor()) return;

    const designerId = Number(document.getElementById('detalhamento-designer-select')?.value || 0);
    if (!designerId) {
        alertAppDialog('Selecione o projetista de detalhamento.');
        return;
    }

    const projetista = detalhamentoProjetistasCache.find(item => Number(item.id) === designerId);
    if (!projetista) {
        alertAppDialog('Projetista inválido ou sem permissão de detalhamento.');
        return;
    }

    try {
        setDetalhamentoModalLoading(true, 'Associando projetista...');
        const now = new Date().toISOString();
        const { data, error } = await supabaseClient
            .from('Detailing')
            .update({
                designerId,
                updatedById: currentUser?.id || null,
                updatedAt: now
            })
            .eq('id', activeDetalhamentoRecord.id)
            .select('*, designer:appUsers!Detailing_designerId_fkey(id, name)')
            .single();

        if (error) throw error;

        if (typeof notifyDetalhamentoProjetistaAssociadoEmail === 'function') {
            await notifyDetalhamentoProjetistaAssociadoEmail({
                orderProjectId: activeDetalhamentoOrderProjectId,
                designerId,
                projectFilePath: data?.projectFilePath || activeDetalhamentoRecord?.projectFilePath || ''
            });
        }

        activeDetalhamentoRecord = data;
        populateDetalhamentoForm(data);
        setDetalhamentoModalLoading(true, 'Projetista associado!', 'success');
        await waitDetalhamentoStatus(1200);
        setDetalhamentoModalLoading(false);
        await refreshDetalhamentoRelatedViews(activeDetalhamentoOrderProjectId);
    } catch (error) {
        setDetalhamentoModalLoading(true, `Erro: ${error.message}`, 'error');
        await waitDetalhamentoStatus(2500);
        setDetalhamentoModalLoading(false);
    }
}

async function handleDetalhamentoIniciar() {
    if (!activeDetalhamentoRecord?.id || !canActDetalhamentoProjetista()) return;

    if (activeDetalhamentoRecord.status !== DETALHAMENTO_STATUS_AGUARDANDO) {
        alertAppDialog('Este detalhamento já foi iniciado ou encerrado.');
        return;
    }

    const openCount = await countDetalhamentosEmAndamentoForDesigner(currentUser.id);
    if (openCount > 0) {
        const proceed = await confirmAppDialog(
            `Você já tem ${openCount} detalhamento(s) em andamento. Deseja iniciar outro mesmo assim?`,
            { title: 'Detalhamento em aberto', confirmLabel: 'Iniciar mesmo assim' }
        );
        if (!proceed) return;
    }

    const confirmed = await confirmAppDialog(
        'O status será alterado para Detalhamento.',
        { title: `Iniciar detalhamento de "${activeDetalhamentoProjectName}"?`, confirmLabel: 'Iniciar' }
    );
    if (!confirmed) return;

    try {
        setDetalhamentoModalLoading(true, 'Iniciando detalhamento...');
        const now = new Date().toISOString();
        const { data, error } = await supabaseClient
            .from('Detailing')
            .update({
                status: DETALHAMENTO_STATUS_EM_ANDAMENTO,
                startedAt: now,
                updatedById: currentUser?.id || null,
                updatedAt: now
            })
            .eq('id', activeDetalhamentoRecord.id)
            .select('*, designer:appUsers!Detailing_designerId_fkey(id, name)')
            .single();

        if (error) throw error;

        activeDetalhamentoRecord = data;
        populateDetalhamentoForm(data);
        setDetalhamentoModalLoading(true, 'Detalhamento iniciado!', 'success');
        await waitDetalhamentoStatus(1200);
        setDetalhamentoModalLoading(false);
        await refreshDetalhamentoRelatedViews(activeDetalhamentoOrderProjectId);
    } catch (error) {
        setDetalhamentoModalLoading(true, `Erro: ${error.message}`, 'error');
        await waitDetalhamentoStatus(2500);
        setDetalhamentoModalLoading(false);
    }
}

async function handleDetalhamentoEncerrar() {
    if (!activeDetalhamentoRecord?.id || !canActDetalhamentoProjetista()) return;

    if (activeDetalhamentoRecord.status !== DETALHAMENTO_STATUS_EM_ANDAMENTO) {
        alertAppDialog('Somente detalhamentos em andamento podem ser encerrados.');
        return;
    }

    const serverFolderPath = document.getElementById('detalhamento-server-folder-path')?.value?.trim() || '';
    if (!serverFolderPath) {
        alertAppDialog('Informe a pasta no servidor do projeto para encerrar o detalhamento.');
        return;
    }

    const confirmed = await confirmAppDialog(
        'O detalhamento será marcado como Pronto.',
        { title: `Encerrar detalhamento de "${activeDetalhamentoProjectName}"?`, confirmLabel: 'Encerrar' }
    );
    if (!confirmed) return;

    try {
        setDetalhamentoModalLoading(true, 'Encerrando detalhamento...');
        const now = new Date().toISOString();
        const { data, error } = await supabaseClient
            .from('Detailing')
            .update({
                status: DETALHAMENTO_STATUS_PRONTO,
                serverFolderPath,
                completedAt: now,
                updatedById: currentUser?.id || null,
                updatedAt: now
            })
            .eq('id', activeDetalhamentoRecord.id)
            .select('*, designer:appUsers!Detailing_designerId_fkey(id, name)')
            .single();

        if (error) throw error;

        activeDetalhamentoRecord = data;
        populateDetalhamentoForm(data);
        setDetalhamentoModalLoading(true, 'Detalhamento encerrado!', 'success');
        await waitDetalhamentoStatus(1200);
        setDetalhamentoModalLoading(false);
        await refreshDetalhamentoRelatedViews(activeDetalhamentoOrderProjectId);
    } catch (error) {
        setDetalhamentoModalLoading(true, `Erro: ${error.message}`, 'error');
        await waitDetalhamentoStatus(2500);
        setDetalhamentoModalLoading(false);
    }
}

const DETALHAMENTO_HISTORY_STEP_ORDER = [
    DETALHAMENTO_STATUS_AGUARDANDO,
    DETALHAMENTO_STATUS_EM_ANDAMENTO,
    DETALHAMENTO_STATUS_PRONTO
];

function formatDetalhamentoViewDate(dateStr) {
    if (!dateStr) return '—';
    if (typeof formatGestaoDateTime === 'function') return formatGestaoDateTime(dateStr);
    if (typeof formatDate === 'function') return formatDate(dateStr);
    return String(dateStr).slice(0, 10);
}

function getDetailingHistoryStepStates(record) {
    const currentStatus = record?.status || DETALHAMENTO_STATUS_AGUARDANDO;
    const currentIndex = DETALHAMENTO_HISTORY_STEP_ORDER.indexOf(currentStatus);

    return DETALHAMENTO_HISTORY_STEP_ORDER.map((status, index) => {
        let state = 'pending';
        if (currentIndex === -1) {
            state = index === 0 ? 'current' : 'pending';
        } else if (index < currentIndex) {
            state = 'done';
        } else if (index === currentIndex) {
            state = 'current';
        }

        let dateLabel = '—';
        if (status === DETALHAMENTO_STATUS_AGUARDANDO) {
            dateLabel = formatDetalhamentoViewDate(record?.createdAt);
        } else if (status === DETALHAMENTO_STATUS_EM_ANDAMENTO) {
            dateLabel = formatDetalhamentoViewDate(record?.startedAt);
        } else if (status === DETALHAMENTO_STATUS_PRONTO) {
            dateLabel = formatDetalhamentoViewDate(record?.completedAt);
        }

        return { status, state, dateLabel };
    });
}

function renderProjectStatusHistoryDetailingBranch(record) {
    if (!record) return '';

    const steps = getDetailingHistoryStepStates(record);
    const designerName = record.designer?.name || '—';

    const stepsHtml = steps.map((step, index) => {
        const meta = step.status === DETALHAMENTO_STATUS_AGUARDANDO && record.designer?.name
            ? `${escapeHtml(step.dateLabel)}<br>${escapeHtml(designerName)}`
            : escapeHtml(step.dateLabel);

        const stepHtml = `
            <div class="project-status-history-detailing-step is-${step.state}">
                <div class="project-status-history-detailing-step__title">${escapeHtml(step.status)}</div>
                <div class="project-status-history-detailing-step__meta">${meta}</div>
            </div>
        `;

        if (index === steps.length - 1) return stepHtml;

        return `${stepHtml}<div class="project-status-history-detailing-arrow" aria-hidden="true">→</div>`;
    }).join('');

    return `
        <div class="project-status-history-detailing-branch">
            <div class="project-status-history-detailing-branch__connector" aria-hidden="true">
                <div class="project-status-history-detailing-branch__connector-line"></div>
                <div class="text-indigo-400 text-xs leading-none">▼</div>
            </div>
            <div class="project-status-history-detailing-branch__row">
                ${stepsHtml}
            </div>
        </div>
    `;
}

window.renderProjectStatusHistoryDetailingBranch = renderProjectStatusHistoryDetailingBranch;

function findLastEmProducaoHistoryIndex(entries = []) {
    let lastIndex = -1;
    entries.forEach((entry, index) => {
        if (entry.newStatus?.name === DETALHAMENTO_PROJECT_STATUS_EM_PRODUCAO) {
            lastIndex = index;
        }
    });
    return lastIndex;
}

window.findLastEmProducaoHistoryIndex = findLastEmProducaoHistoryIndex;

function renderProjectViewDetailingSection(record) {
    const wrap = document.getElementById('project-view-detalhamento-wrap');
    if (!wrap) return;

    if (!record) {
        wrap.classList.add('hidden');
        return;
    }

    wrap.classList.remove('hidden');

    const statusEl = document.getElementById('project-view-detalhamento-status');
    if (statusEl) {
        statusEl.textContent = record.status || DETALHAMENTO_STATUS_AGUARDANDO;
        statusEl.className = `text-[10px] px-2 py-0.5 rounded-full font-semibold ${getDetalhamentoStatusBadgeClass(record.status)}`;
    }

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value || '—';
    };

    setText('project-view-detalhamento-designer', record.designer?.name || '—');
    setText('project-view-detalhamento-started-at', formatDetalhamentoViewDate(record.startedAt));
    setText('project-view-detalhamento-completed-at', formatDetalhamentoViewDate(record.completedAt));

    const projectFilePathEl = document.getElementById('project-view-detalhamento-projeto-path');
    const projectFilePath = record.projectFilePath || '—';
    if (projectFilePathEl) {
        projectFilePathEl.textContent = projectFilePath;
        projectFilePathEl.classList.toggle('project-view-path--empty', projectFilePath === '—');
    }

    const serverPathEl = document.getElementById('project-view-detalhamento-server-path');
    const serverPath = record.serverFolderPath || '—';
    if (serverPathEl) {
        serverPathEl.textContent = serverPath;
        serverPathEl.classList.toggle('project-view-path--empty', serverPath === '—');
    }
}

window.renderProjectViewDetailingSection = renderProjectViewDetailingSection;

function bindDetailingEvents() {
    document.getElementById('btn-close-detalhamento-modal')?.addEventListener('click', closeDetailingModal);
    document.getElementById('btn-close-detalhamento-modal-footer')?.addEventListener('click', closeDetailingModal);
    document.getElementById('btn-detalhamento-associar')?.addEventListener('click', handleDetalhamentoAssociar);
    document.getElementById('btn-detalhamento-iniciar')?.addEventListener('click', handleDetalhamentoIniciar);
    document.getElementById('btn-detalhamento-encerrar')?.addEventListener('click', handleDetalhamentoEncerrar);
}

const bindDetalhamentoEvents = bindDetailingEvents;

const fetchDetalhamentoByOrderProjectId = fetchDetailingByOrderProjectId;
const createDetalhamentoForProject = createDetailingForProject;
const openDetalhamentoModal = openDetailingModal;
const closeDetalhamentoModal = closeDetailingModal;
window.closeDetailingModal = closeDetailingModal;
window.closeDetalhamentoModal = closeDetailingModal;
