async function loadMontagemProgramacaoView() {
    const weekLabel = document.getElementById('montagem-prog-week-label');
    if (weekLabel) {
        weekLabel.textContent = formatMontagemProgWeekLabel(montagemProgWeekAnchor);
    }

    const readOnly = isMontagemProgramacaoReadOnly();

    if (typeof loadGestaoMontadores === 'function') {
        await loadGestaoMontadores(true);
    }
    if (typeof loadMarceneiros === 'function') {
        await loadMarceneiros(true);
    }

    await loadMontagemProgramacoesForWeek();
    renderMontagemProgWorkerFilter();
    if (!readOnly) {
        renderMontagemProgPalette();
    }
    renderMontagemProgWeekGrid();
    applyMontagemProgramacaoReadOnlyUi();
}

function isMontagemProgramacaoReadOnly() {
    return typeof canEditProgramacaoMontagem === 'function'
        ? !canEditProgramacaoMontagem()
        : !canAccessMontagemProgramacao();
}

function applyMontagemProgramacaoReadOnlyUi() {
    const panel = document.getElementById('gestao-montagem-programacao-panel');
    const readOnly = isMontagemProgramacaoReadOnly();
    panel?.classList.toggle('montagem-prog-readonly', readOnly);
    document.getElementById('montagem-prog-readonly-notice')?.classList.toggle('hidden', !readOnly);
    document.getElementById('btn-montagem-prog-copy-prev-week')?.classList.toggle('hidden', readOnly);
    const subtitle = document.getElementById('montagem-prog-panel-subtitle');
    if (subtitle) {
        subtitle.textContent = readOnly
            ? 'Visualização da escala semanal de montadores e marceneiros.'
            : 'Arraste montadores ou marceneiros para a semana. Solte sobre outra barra para formar dupla (somente do mesmo tipo).';
    }
}

function showGestaoMontagemProgramacaoPanel() {
    if (!canViewProgramacaoMontagem()) {
        alertAppDialog('Faça login para acessar a programação de montagem.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    hideAllGestaoPanels();
    document.getElementById('gestao-montagem-programacao-panel')?.classList.remove('hidden');
    setGestaoNavActive('montagem-programacao');
    applyMontagemProgramacaoReadOnlyUi();
    loadMontagemProgramacaoView();
}

function updateMontagemProgramacaoNavVisibility() {
    const button = document.getElementById('gestao-nav-montagem-programacao');
    if (button) {
        button.classList.toggle('hidden', !canViewProgramacaoMontagem());
    }
}

function bindMontagemProgramacaoEvents() {
    bindMontagemProgTooltipEvents();

    document.getElementById('gestao-nav-montagem-programacao')?.addEventListener('click', () => {
        if (typeof showProgramacaoMontagemView === 'function') {
            showProgramacaoMontagemView({ fromGestao: true });
        } else {
            showGestaoMontagemProgramacaoPanel();
        }
    });

    document.getElementById('btn-montagem-prog-prev-week')?.addEventListener('click', async () => {
        montagemProgWeekAnchor = montagemProgAddDays(montagemProgWeekAnchor, -7);
        await loadMontagemProgramacaoView();
    });

    document.getElementById('btn-montagem-prog-next-week')?.addEventListener('click', async () => {
        montagemProgWeekAnchor = montagemProgAddDays(montagemProgWeekAnchor, 7);
        await loadMontagemProgramacaoView();
    });

    document.getElementById('btn-montagem-prog-today')?.addEventListener('click', async () => {
        montagemProgWeekAnchor = startOfWeekMonday(new Date());
        await loadMontagemProgramacaoView();
    });

    document.getElementById('btn-montagem-prog-refresh')?.addEventListener('click', loadMontagemProgramacaoView);
    document.getElementById('btn-montagem-prog-copy-prev-week')?.addEventListener('click', copyMontagemProgPreviousWeek);
    document.getElementById('btn-montagem-prog-print')?.addEventListener('click', printMontagemProgWeek);
    document.getElementById('montagem-prog-montador-filter')?.addEventListener('change', event => {
        const value = event.target.value;
        montagemProgWorkerFilter = parseMontagemProgWorkerFilterKey(value);
        renderMontagemProgPalette();
        renderMontagemProgWeekGrid();
    });
    document.getElementById('montagem-prog-form')?.addEventListener('submit', saveMontagemProg);
    document.getElementById('btn-montagem-prog-delete')?.addEventListener('click', deleteMontagemProg);

    ['montagem-prog-montador-1', 'montagem-prog-montador-2', 'montagem-prog-marceneiro-1', 'montagem-prog-marceneiro-2'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', syncMontagemProgCrewExclusivity);
    });

    const triggerMontagemProgClientPicker = () => {
        const orderCode = document.getElementById('montagem-prog-order-code')?.value.trim();
        if (orderCode) return;
        if (typeof openClientePickerModal === 'function') {
            openClientePickerModal(cliente => {
                const input = document.getElementById('montagem-prog-client-name');
                const idInput = document.getElementById('montagem-prog-client-id');
                const previousClientId = Number(idInput?.value) || null;
                if (input) input.value = cliente.name;
                if (idInput) idInput.value = cliente.id;
                if (previousClientId !== Number(cliente.id) && typeof setMontagemProgSelectedAddr === 'function') {
                    setMontagemProgSelectedAddr(null);
                }
                if (typeof syncMontagemProgClientRequired === 'function') {
                    syncMontagemProgClientRequired();
                }
            });
        }
    };
    document.getElementById('btn-montagem-prog-client-picker')?.addEventListener('click', triggerMontagemProgClientPicker);
    document.getElementById('montagem-prog-client-name')?.addEventListener('click', triggerMontagemProgClientPicker);

    const triggerMontagemProgAddrPicker = () => {
        const btn = document.getElementById('btn-montagem-prog-addr-picker');
        if (btn?.disabled) return;
        if (typeof openMontagemProgAddrPicker === 'function') {
            openMontagemProgAddrPicker();
        }
    };
    document.getElementById('btn-montagem-prog-addr-picker')?.addEventListener('click', triggerMontagemProgAddrPicker);
    document.getElementById('montagem-prog-addr')?.addEventListener('click', triggerMontagemProgAddrPicker);

    document.getElementById('montagem-prog-order-code')?.addEventListener('input', async function () {
        syncMontagemProgClientRequired();
        const orderCode = this.value.trim();
        if (orderCode) {
            const order = await lookupMontagemProgOrderByCode(orderCode);
            const orderClientName = getOrderClientName(order);
            if (orderClientName) {
                document.getElementById('montagem-prog-client-name').value = orderClientName;
            }
            const clientIdInput = document.getElementById('montagem-prog-client-id');
            if (clientIdInput) {
                clientIdInput.value = order?.clientId ? String(order.clientId) : '';
            }
            if (typeof applyMontagemProgOrderAddress === 'function') {
                await applyMontagemProgOrderAddress(order);
            }
            return;
        }
        if (typeof setMontagemProgSelectedAddr === 'function') {
            setMontagemProgSelectedAddr(null);
        }
        syncMontagemProgClientRequired();
    });
    document.getElementById('montagem-prog-order-code')?.addEventListener('blur', async () => {
        const orderCode = document.getElementById('montagem-prog-order-code')?.value.trim();
        if (orderCode) {
            const order = await lookupMontagemProgOrderByCode(orderCode);
            const orderClientName = getOrderClientName(order);
            if (orderClientName) {
                document.getElementById('montagem-prog-client-name').value = orderClientName;
            }
            const clientIdInput = document.getElementById('montagem-prog-client-id');
            if (clientIdInput) {
                clientIdInput.value = order?.clientId ? String(order.clientId) : '';
            }
            if (typeof applyMontagemProgOrderAddress === 'function') {
                await applyMontagemProgOrderAddress(order);
            }
        } else if (typeof setMontagemProgSelectedAddr === 'function') {
            setMontagemProgSelectedAddr(null);
        }
        syncMontagemProgClientRequired();
    });
}

window.openMontagemProgModal = openMontagemProgModal;
window.getMontagemProgFormClient = getMontagemProgFormClient;
window.setMontagemProgSelectedAddr = setMontagemProgSelectedAddr;
window.getMontagemProgSelectedAddrId = getMontagemProgSelectedAddrId;
window.syncMontagemProgClientRequired = syncMontagemProgClientRequired;
window.applyMontagemProgOrderAddress = applyMontagemProgOrderAddress;
