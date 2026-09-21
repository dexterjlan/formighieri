const GESTAO_SALE_VALUES_VISIBLE_STORAGE_KEY = 'fgp-gestao-sale-values-visible';
const GESTAO_SALE_VALUE_MASK_LABEL = '••••••';

function areGestaoSaleValuesVisible() {
    try {
        const stored = localStorage.getItem(GESTAO_SALE_VALUES_VISIBLE_STORAGE_KEY);
        if (stored === null) return true;
        return stored === '1';
    } catch (_error) {
        return true;
    }
}

function setGestaoSaleValuesVisible(visible) {
    try {
        localStorage.setItem(GESTAO_SALE_VALUES_VISIBLE_STORAGE_KEY, visible ? '1' : '0');
    } catch (_error) {
        // ignore
    }
    syncGestaoSaleValueVisibilityUi();
    refreshGestaoSaleValueVisibilityViews();
}

function toggleGestaoSaleValuesVisible() {
    setGestaoSaleValuesVisible(!areGestaoSaleValuesVisible());
}

function formatGestaoDisplaySaleValue(value) {
    if (!areGestaoSaleValuesVisible()) return GESTAO_SALE_VALUE_MASK_LABEL;
    if (value == null || value === '') return '—';
    if (typeof formatSaleValue === 'function') return formatSaleValue(value);
    return String(value);
}

function gestaoSaleValuesToggleIconSvg(visible) {
    if (visible) {
        return '<svg class="order-tab-action-btn__icon gestao-sale-values-toggle__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
    return '<svg class="order-tab-action-btn__icon gestao-sale-values-toggle__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
}

function gestaoSaleValuesToggleLabel(visible) {
    return visible ? 'Ocultar valores' : 'Mostrar valores';
}

function renderGestaoSaleValuesToggleButtonHtml() {
    const visible = areGestaoSaleValuesVisible();
    return `
        <button type="button"
            class="gestao-sale-values-toggle order-tab-action-btn text-xs bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium hover:bg-slate-50"
            title="${gestaoSaleValuesToggleLabel(visible)}"
            aria-pressed="${visible ? 'true' : 'false'}"
            aria-label="${gestaoSaleValuesToggleLabel(visible)}">
            ${gestaoSaleValuesToggleIconSvg(visible)}
            <span class="gestao-sale-values-toggle__label">${gestaoSaleValuesToggleLabel(visible)}</span>
        </button>
    `;
}

function syncGestaoSaleValueVisibilityUi() {
    const visible = areGestaoSaleValuesVisible();
    const label = gestaoSaleValuesToggleLabel(visible);
    document.querySelectorAll('.gestao-sale-values-toggle').forEach(button => {
        button.setAttribute('aria-pressed', visible ? 'true' : 'false');
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = `${gestaoSaleValuesToggleIconSvg(visible)}<span class="gestao-sale-values-toggle__label">${label}</span>`;
    });
}

function mountGestaoSaleValueToggleSlots() {
    if (typeof renderGestaoSaleValuesToggleButtonHtml !== 'function') return;
    const html = renderGestaoSaleValuesToggleButtonHtml();
    [
        'gestao-pedidos-sale-values-toggle-slot',
        'gestao-order-form-sale-values-toggle-slot',
        'gestao-relatorios-sale-values-toggle-slot',
        'gestao-programacao-producao-sale-values-toggle-slot'
    ].forEach(slotId => {
        const slot = document.getElementById(slotId);
        if (slot) slot.innerHTML = html;
    });
}

function refreshGestaoSaleValueVisibilityViews() {
    if (typeof renderGestaoProjectsSummaryList === 'function'
        && document.getElementById('gestao-projects-rows')) {
        renderGestaoProjectsSummaryList();
    }

    const relatoriosPanel = document.getElementById('gestao-relatorios-panel');
    if (relatoriosPanel && !relatoriosPanel.classList.contains('hidden')
        && typeof loadGestaoRelatorios === 'function') {
        void loadGestaoRelatorios();
    }

    const programacaoPanel = document.getElementById('gestao-programacao-producao-panel');
    if (programacaoPanel && !programacaoPanel.classList.contains('hidden')
        && typeof renderProgramacaoProducaoPanel === 'function') {
        renderProgramacaoProducaoPanel();
    }
}

let gestaoSaleValueVisibilityEventsBound = false;

function bindGestaoSaleValueVisibilityToggles() {
    mountGestaoSaleValueToggleSlots();
    if (!gestaoSaleValueVisibilityEventsBound) {
        document.getElementById('gestao-view')?.addEventListener('click', event => {
            const button = event.target.closest('.gestao-sale-values-toggle');
            if (!button) return;
            event.preventDefault();
            toggleGestaoSaleValuesVisible();
        });
        gestaoSaleValueVisibilityEventsBound = true;
    }
    syncGestaoSaleValueVisibilityUi();
}

window.areGestaoSaleValuesVisible = areGestaoSaleValuesVisible;
window.formatGestaoDisplaySaleValue = formatGestaoDisplaySaleValue;
window.renderGestaoSaleValuesToggleButtonHtml = renderGestaoSaleValuesToggleButtonHtml;
window.bindGestaoSaleValueVisibilityToggles = bindGestaoSaleValueVisibilityToggles;
window.mountGestaoSaleValueToggleSlots = mountGestaoSaleValueToggleSlots;
window.syncGestaoSaleValueVisibilityUi = syncGestaoSaleValueVisibilityUi;
