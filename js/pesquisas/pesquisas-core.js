let pesquisasActiveSection = 'revisions';

const PESQUISAS_SECTIONS = [
    { id: 'revisions', label: 'Revisões' },
    { id: 'requests', label: 'Requisições' },
    { id: 'purchases', label: 'Compras' },
    { id: 'detailing', label: 'Detalhamento' }
];

function canAccessPesquisas() {
    return Boolean(currentUser?.id);
}

function renderPesquisasSidebar() {
    const nav = document.getElementById('pesquisas-sidebar-nav');
    if (!nav) return;

    nav.innerHTML = PESQUISAS_SECTIONS.map(section => `
        <button type="button"
            class="pesquisas-nav-btn w-full text-left text-xs px-3 py-2 rounded-lg font-medium mb-1 ${
                pesquisasActiveSection === section.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
            }"
            data-pesquisas-section="${section.id}">
            ${escapeHtml(section.label)}
        </button>
    `).join('');
}

function persistPesquisasNavState() {
    if (typeof saveAppNavState !== 'function') return;
    saveAppNavState({
        view: 'pesquisas',
        pesquisasSection: pesquisasActiveSection
    });
}

async function loadPesquisasContent() {
    const content = document.getElementById('pesquisas-content');
    if (!content) return;

    if (pesquisasActiveSection === 'revisions') {
        if (typeof loadPesquisasRevisionsQuery === 'function') {
            await loadPesquisasRevisionsQuery();
        }
        return;
    }

    if (pesquisasActiveSection === 'requests') {
        if (typeof loadPesquisasRequestsQuery === 'function') {
            await loadPesquisasRequestsQuery();
        }
        return;
    }

    if (pesquisasActiveSection === 'purchases') {
        if (typeof loadPesquisasPurchasesQuery === 'function') {
            await loadPesquisasPurchasesQuery();
        }
        return;
    }

    if (pesquisasActiveSection === 'detailing') {
        if (typeof loadPesquisasDetailingQuery === 'function') {
            await loadPesquisasDetailingQuery();
        }
    }
}

function selectPesquisasSection(sectionId) {
    if (!PESQUISAS_SECTIONS.some(section => section.id === sectionId)) return;
    pesquisasActiveSection = sectionId;
    renderPesquisasSidebar();
    loadPesquisasContent();
    persistPesquisasNavState();
}

function showPesquisas() {
    if (!canAccessPesquisas()) {
        alertAppDialog('Você não tem acesso à tela de pesquisas.');
        return;
    }

    hideSubViews();
    document.getElementById('pesquisas-view')?.classList.remove('hidden');
    updateMainNavActive('pesquisas');
    updateAdminNav();
    updatePesquisasNav();
    renderPesquisasSidebar();
    loadPesquisasContent();
    persistPesquisasNavState();
}

function updatePesquisasNav() {
    const btn = document.getElementById('btn-pesquisas');
    if (btn) {
        btn.classList.toggle('hidden', !canAccessPesquisas());
    }
}

function renderPesquisasQueryShell(sectionId, title, description, statusOptions, tableHeadHtml, tableBodyId, defaultCheckedStatuses = null, extraFiltersHtml = '') {
    const statusContainerId = `pesquisas-${sectionId}-status`;
    const checkedStatuses = defaultCheckedStatuses ?? statusOptions;
    const statusOptionsHtml = renderCheckboxFilterGroup(statusContainerId, statusOptions, {
        defaultCheckedValues: checkedStatuses,
        inputName: `${sectionId}-status`
    });

    return `
        <div class="space-y-4">
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
                <h2 class="font-bold text-sm text-slate-900">${escapeHtml(title)}</h2>
                <p class="text-xs text-slate-400 mt-1">${escapeHtml(description)}</p>
                <form id="pesquisas-${sectionId}-form" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Pedido</label>
                        <input type="text" id="pesquisas-${sectionId}-pedido" placeholder="Ex: PV-4050"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Cliente</label>
                        <input type="text" id="pesquisas-${sectionId}-cliente" placeholder="Nome do cliente"
                            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600">
                    </div>
                    ${extraFiltersHtml}
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Status</label>
                        <div id="${statusContainerId}"
                            class="fm-checkbox-filter flex flex-col gap-1.5 max-h-32 overflow-y-auto border border-slate-200 rounded-lg px-3 py-2 bg-white">
                            ${statusOptionsHtml}
                        </div>
                    </div>
                    <div class="flex items-end gap-2">
                        <button type="submit"
                            class="flex-1 bg-slate-900 text-white text-xs py-2 rounded-lg font-semibold hover:bg-slate-800">Buscar</button>
                        <button type="button" id="pesquisas-${sectionId}-clear"
                            class="flex-1 bg-slate-100 text-slate-600 text-xs py-2 rounded-lg font-medium hover:bg-slate-200">Limpar</button>
                    </div>
                </form>
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="p-3 border-b border-slate-100 bg-slate-50/50">
                    <span class="text-xs text-slate-500" id="pesquisas-${sectionId}-count">0 registros</span>
                </div>
                <div class="overflow-x-auto max-h-[calc(100vh-340px)] overflow-y-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500 sticky top-0">
                            <tr>${tableHeadHtml}</tr>
                        </thead>
                        <tbody id="${tableBodyId}" class="divide-y divide-slate-100"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function getPesquisasTextFilters(sectionId) {
    return {
        pedido: document.getElementById(`pesquisas-${sectionId}-pedido`)?.value.trim().toLowerCase() || '',
        cliente: document.getElementById(`pesquisas-${sectionId}-cliente`)?.value.trim().toLowerCase() || '',
        statuses: getCheckboxFilterValues(`pesquisas-${sectionId}-status`, [])
    };
}

function matchesPesquisasTextFilters(row, filters, getters = {}) {
    const orderCode = (getters.orderCode?.(row) || '').toLowerCase();
    const clientName = (getters.clientName?.(row) || '').toLowerCase();
    const status = getters.status?.(row) || '';

    if (filters.pedido && !orderCode.includes(filters.pedido)) return false;
    if (filters.cliente && !clientName.includes(filters.cliente)) return false;
    if (filters.statuses.length && !filters.statuses.includes(status)) return false;
    return true;
}

function bindPesquisasQueryForm(sectionId, onSearch, defaultStatuses = [], extra = {}) {
    document.getElementById(`pesquisas-${sectionId}-form`)?.addEventListener('submit', event => {
        event.preventDefault();
        onSearch();
    });

    document.getElementById(`pesquisas-${sectionId}-clear`)?.addEventListener('click', () => {
        const pedidoInput = document.getElementById(`pesquisas-${sectionId}-pedido`);
        const clienteInput = document.getElementById(`pesquisas-${sectionId}-cliente`);
        if (pedidoInput) pedidoInput.value = '';
        if (clienteInput) clienteInput.value = '';
        resetCheckboxFilter(`pesquisas-${sectionId}-status`, defaultStatuses);
        (extra.selectIds || []).forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) select.value = '';
        });
        (extra.textIds || []).forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) input.value = '';
        });
        (extra.checkboxFilters || []).forEach(filter => {
            resetCheckboxFilter(filter.containerId, filter.defaultValues || []);
        });
        onSearch();
    });
}

function bindPesquisasEvents() {
    document.getElementById('btn-pesquisas')?.addEventListener('click', showPesquisas);
    document.getElementById('pesquisas-sidebar-nav')?.addEventListener('click', event => {
        const btn = event.target.closest('[data-pesquisas-section]');
        if (!btn) return;
        selectPesquisasSection(btn.dataset.pesquisasSection);
    });
}

window.canAccessPesquisas = canAccessPesquisas;
window.showPesquisas = showPesquisas;
window.updatePesquisasNav = updatePesquisasNav;
