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
    applyMontagemProgramacaoLayoutMode();
    renderMontagemProgWorkerFilter();
    if (!readOnly && !isMontagemProgTouchLayout()) {
        renderMontagemProgPalette();
    }
    renderMontagemProgWeekGrid();
    applyMontagemProgramacaoReadOnlyUi();
}

function applyMontagemProgramacaoLayoutMode() {
    const panel = document.getElementById('gestao-montagem-programacao-panel');
    const touch = isMontagemProgTouchLayout();
    const mobile = typeof isMobileViewport === 'function' && isMobileViewport();
    panel?.classList.toggle('montagem-prog--touch', touch);
    panel?.classList.toggle('montagem-prog--mobile', mobile);

    const grid = document.getElementById('montagem-prog-week-grid');
    const nextLayout = touch ? 'touch' : 'desktop';
    if (grid && grid.dataset.montagemProgLayout !== nextLayout) {
        grid.dataset.montagemProgLayout = nextLayout;
        grid.dataset.interactionsBound = '0';
    }
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
    const touch = isMontagemProgTouchLayout();
    if (subtitle) {
        if (readOnly) {
            subtitle.textContent = 'Visualização da escala semanal de montadores e marceneiros.';
        } else if (touch) {
            subtitle.textContent = 'Toque em um dia para agendar ou em uma montagem para editar. Use o filtro por responsável acima.';
        } else {
            subtitle.textContent = 'Arraste montadores ou marceneiros para a semana. Solte sobre outra barra para formar dupla (somente do mesmo tipo).';
        }
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
    applyMontagemProgramacaoLayoutMode();
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
        if (!isMontagemProgTouchLayout()) {
            renderMontagemProgPalette();
        }
        renderMontagemProgWeekGrid();
    });

    let montagemProgLayoutResizeTimer = null;
    const onMontagemProgLayoutResize = () => {
        const panel = document.getElementById('gestao-montagem-programacao-panel');
        if (!panel || panel.classList.contains('hidden')) return;
        window.clearTimeout(montagemProgLayoutResizeTimer);
        montagemProgLayoutResizeTimer = window.setTimeout(() => {
            loadMontagemProgramacaoView();
        }, 200);
    };
    window.addEventListener('resize', onMontagemProgLayoutResize);
    if (typeof MOBILE_LAYOUT_MEDIA !== 'undefined') {
        MOBILE_LAYOUT_MEDIA.addEventListener?.('change', onMontagemProgLayoutResize);
    }
    if (typeof TABLET_TOUCH_LAYOUT_MEDIA !== 'undefined') {
        TABLET_TOUCH_LAYOUT_MEDIA.addEventListener?.('change', onMontagemProgLayoutResize);
    }
    document.getElementById('montagem-prog-form')?.addEventListener('submit', saveMontagemProg);
    document.getElementById('btn-montagem-prog-delete')?.addEventListener('click', deleteMontagemProg);
    document.getElementById('btn-montagem-prog-close')?.addEventListener('click', () => {
        toggleModal('montagem-prog-modal', false);
    });

    ['montagem-prog-montador-1', 'montagem-prog-montador-2', 'montagem-prog-marceneiro-1', 'montagem-prog-marceneiro-2'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', syncMontagemProgCrewExclusivity);
    });

    const triggerMontagemProgClientPicker = () => {
        if (typeof montagemProgFormHasOrder === 'function' && montagemProgFormHasOrder()) return;
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

    document.getElementById('montagem-prog-order-search')?.addEventListener('blur', () => {
        void resolveMontagemProgOrderFromInput();
    });
}


window.openMontagemProgModal = openMontagemProgModal;
window.getMontagemProgFormClient = getMontagemProgFormClient;
window.setMontagemProgSelectedAddr = setMontagemProgSelectedAddr;
window.getMontagemProgSelectedAddrId = getMontagemProgSelectedAddrId;
window.syncMontagemProgClientRequired = syncMontagemProgClientRequired;
window.applyMontagemProgOrderAddress = applyMontagemProgOrderAddress;
