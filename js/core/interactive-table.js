const INTERACTIVE_TABLE_DEFAULT_SORT_VERSION = 3;
const INTERACTIVE_TABLE_DEFAULT_SORT_SPECS = [
    { keys: ['clientName', 'client'], labels: ['cliente', 'nome do cliente'] },
    { keys: ['orderCode', 'order'], labels: ['pedido', 'codigo do pedido'] },
    { keys: ['projectName', 'project'], labels: ['projeto', 'projetos', 'nome do projeto'] }
];
const interactiveTableStates = {};

function normalizeInteractiveTableSearch(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizeInteractiveTableSorts(defaultSort = null) {
    if (!defaultSort) return [];
    const items = Array.isArray(defaultSort) ? defaultSort : [defaultSort];
    return items
        .map(item => {
            const key = item?.key;
            if (!key) return null;
            return {
                key,
                direction: item.direction === 'desc' ? 'desc' : 'asc'
            };
        })
        .filter(Boolean);
}

function getInteractiveTableState(tableId, defaultSort = null, columns = []) {
    const resolvedDefault = resolveInteractiveTableDefaultSort(defaultSort, columns);

    if (!interactiveTableStates[tableId]) {
        interactiveTableStates[tableId] = {
            sorts: resolvedDefault,
            filters: {},
            defaultSortVersion: INTERACTIVE_TABLE_DEFAULT_SORT_VERSION
        };
    }

    const state = interactiveTableStates[tableId];
    if (!Array.isArray(state.sorts)) {
        state.sorts = state.sortKey
            ? [{ key: state.sortKey, direction: state.sortDirection === 'desc' ? 'desc' : 'asc' }]
            : resolvedDefault;
        delete state.sortKey;
        delete state.sortDirection;
    }

    if (state.defaultSortVersion !== INTERACTIVE_TABLE_DEFAULT_SORT_VERSION) {
        state.sorts = resolvedDefault;
        state.defaultSortVersion = INTERACTIVE_TABLE_DEFAULT_SORT_VERSION;
    }

    return state;
}

function getInteractiveTableSortEntry(state, columnKey) {
    const index = (state.sorts || []).findIndex(item => item.key === columnKey);
    if (index < 0) return null;
    return { ...state.sorts[index], index };
}

function cycleInteractiveTableSort(state, column) {
    const sorts = state.sorts || [];
    const index = sorts.findIndex(item => item.key === column.key);

    if (index < 0) {
        sorts.push({
            key: column.key,
            direction: column.defaultDirection || 'asc'
        });
        state.sorts = sorts;
        return;
    }

    if (sorts[index].direction === 'asc') {
        sorts[index].direction = 'desc';
        return;
    }

    sorts.splice(index, 1);
    state.sorts = sorts;
}

function isInteractiveTableColumnFilterable(column) {
    if (column.filterable === false) return false;
    if (column.filterable === true) return true;
    return column.type !== 'action';
}

function isInteractiveTableColumnSortable(column) {
    if (column.sortable === false) return false;
    if (column.sortable === true) return true;
    return column.type !== 'action';
}

function columnMatchesInteractiveTableSortSpec(column, spec) {
    const key = String(column?.key || '');
    const label = normalizeInteractiveTableSearch(column?.label);
    return spec.keys.includes(key) || spec.labels.includes(label);
}

function resolveInteractiveTableDefaultSort(defaultSort = null, columns = []) {
    const explicit = normalizeInteractiveTableSorts(defaultSort);
    if (explicit.length) return explicit;

    return INTERACTIVE_TABLE_DEFAULT_SORT_SPECS
        .map(spec => (columns || []).find(column => (
            isInteractiveTableColumnSortable(column)
            && columnMatchesInteractiveTableSortSpec(column, spec)
        )))
        .filter(Boolean)
        .map(column => ({ key: column.key, direction: 'asc' }));
}

function getInteractiveTableCellValue(row, column) {
    if (typeof column.getValue === 'function') return column.getValue(row);
    return row?.[column.key];
}

function getInteractiveTableSortValue(row, column) {
    if (typeof column.getSortValue === 'function') return column.getSortValue(row);
    if (column.sortKey) return row?.[column.sortKey];
    return getInteractiveTableCellValue(row, column);
}

function getInteractiveTableFilterValues(row, column) {
    const values = [getInteractiveTableCellValue(row, column)];
    if (column.sortKey) values.push(row?.[column.sortKey]);
    if (typeof column.getFilterValue === 'function') values.push(column.getFilterValue(row));
    if (typeof column.getSortValue === 'function') values.push(column.getSortValue(row));
    return values;
}

function toInteractiveTableTime(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = String(value);
    const dayMonthYear = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dayMonthYear) {
        return new Date(Number(dayMonthYear[3]), Number(dayMonthYear[2]) - 1, Number(dayMonthYear[1])).getTime();
    }
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
}

function compareInteractiveTableValues(left, right, column, direction) {
    const type = column.type || 'text';
    const dir = direction === 'desc' ? -1 : 1;
    const leftEmpty = left == null || left === '';
    const rightEmpty = right == null || right === '';

    if (leftEmpty && rightEmpty) return 0;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;

    if (type === 'date' || type === 'number') {
        const leftNum = type === 'date' ? toInteractiveTableTime(left) : Number(left);
        const rightNum = type === 'date' ? toInteractiveTableTime(right) : Number(right);
        const leftInvalid = leftNum == null || Number.isNaN(leftNum);
        const rightInvalid = rightNum == null || Number.isNaN(rightNum);
        if (leftInvalid && rightInvalid) return 0;
        if (leftInvalid) return 1;
        if (rightInvalid) return -1;
        if (leftNum === rightNum) return 0;
        return leftNum < rightNum ? -dir : dir;
    }

    return dir * String(left).localeCompare(String(right), 'pt-BR', {
        sensitivity: 'base',
        numeric: true
    });
}

function filterInteractiveTableRows(rows, columns, filters = {}) {
    return (rows || []).filter(row => columns.every(column => {
        if (!isInteractiveTableColumnFilterable(column)) return true;
        const query = normalizeInteractiveTableSearch(filters[column.key]);
        if (!query) return true;
        return getInteractiveTableFilterValues(row, column).some(value => (
            normalizeInteractiveTableSearch(value).includes(query)
        ));
    }));
}

function sortInteractiveTableRows(rows, columns, sorts = []) {
    const activeSorts = (sorts || [])
        .map(sort => {
            const column = columns.find(item => item.key === sort.key);
            if (!column || !isInteractiveTableColumnSortable(column)) return null;
            return { column, direction: sort.direction };
        })
        .filter(Boolean);

    if (!activeSorts.length) return [...rows];

    return [...rows].sort((left, right) => {
        for (const { column, direction } of activeSorts) {
            const result = compareInteractiveTableValues(
                getInteractiveTableSortValue(left, column),
                getInteractiveTableSortValue(right, column),
                column,
                direction
            );
            if (result) return result;
        }
        return 0;
    });
}

function getInteractiveTableVisibleRows(rows, columns, state) {
    const filtered = filterInteractiveTableRows(rows, columns, state.filters);
    return sortInteractiveTableRows(filtered, columns, state.sorts);
}

function hasInteractiveTableFilters(filters = {}) {
    return Object.values(filters).some(value => String(value || '').trim());
}

function formatInteractiveTableCount(visibleCount, totalCount) {
    if (visibleCount === totalCount) {
        return `${totalCount} ${totalCount === 1 ? 'registro' : 'registros'}`;
    }
    return `${visibleCount} de ${totalCount} ${totalCount === 1 ? 'registro' : 'registros'}`;
}

function getInteractiveTableSortTitle(column, state) {
    const label = column.label || 'coluna';
    const entry = getInteractiveTableSortEntry(state, column.key);
    if (!entry) return `Adicionar ordenação por ${label}`;
    if (entry.direction === 'asc') {
        return `${label}: crescente (${entry.index + 1}ª). Clique para decrescente`;
    }
    return `${label}: decrescente (${entry.index + 1}ª). Clique para remover a ordenação`;
}

function getInteractiveTableSortMeta(column, state) {
    if (!isInteractiveTableColumnSortable(column)) return '';
    const entry = getInteractiveTableSortEntry(state, column.key);
    const icon = entry ? (entry.direction === 'desc' ? '↓' : '↑') : '↕';
    const iconClass = entry
        ? 'interactive-table-sort-icon is-active'
        : 'interactive-table-sort-icon';
    const indexHtml = entry
        ? `<span class="interactive-table-sort-index">${entry.index + 1}</span>`
        : '';
    return `<span class="interactive-table-sort-meta" aria-hidden="true">
        <span class="${iconClass}">${icon}</span>
        ${indexHtml}
    </span>`;
}

function getInteractiveTableAriaSort(column, state) {
    const entry = getInteractiveTableSortEntry(state, column.key);
    if (!entry) return 'none';
    return entry.direction === 'desc' ? 'descending' : 'ascending';
}

function renderInteractiveTableCell(row, column) {
    const alignClass = column.align === 'right' ? 'text-right' : 'text-left';
    const className = column.cellClass || `p-3 text-xs text-slate-600 ${alignClass}`;
    const html = typeof column.render === 'function'
        ? column.render(row)
        : escapeHtml(getInteractiveTableCellValue(row, column) || '—');
    return `<td class="${className}">${html}</td>`;
}

function renderInteractiveTableBody(rows, columns, options = {}) {
    if (!rows.length) {
        return `<tr>
            <td colspan="${columns.length}" class="p-8 text-center text-xs text-slate-400">
                ${escapeHtml(options.filteredEmptyMessage || 'Nenhum registro encontrado com os filtros aplicados.')}
            </td>
        </tr>`;
    }

    return rows.map(row => {
        const rowClass = typeof options.getRowClass === 'function'
            ? options.getRowClass(row)
            : 'border-b border-slate-100 last:border-0';
        const rowAttrs = typeof options.getRowAttrs === 'function'
            ? ` ${options.getRowAttrs(row)}`
            : '';
        return `<tr class="${rowClass}"${rowAttrs}>${columns.map(column => renderInteractiveTableCell(row, column)).join('')}</tr>`;
    }).join('');
}

function renderInteractiveTableHead(columns, state) {
    const sortRow = columns.map(column => {
        const alignClass = column.align === 'right' ? 'text-right' : 'text-left';
        const thClass = column.thClass || '';
        const label = escapeHtml(column.label || '');

        if (!isInteractiveTableColumnSortable(column)) {
            return `<th class="${alignClass} p-3 font-semibold ${thClass}" scope="col">${label}</th>`;
        }

        return `<th class="${alignClass} p-3 font-semibold ${thClass}" scope="col" aria-sort="${getInteractiveTableAriaSort(column, state)}">
            <button type="button"
                class="interactive-table-sort-btn"
                data-sort-key="${escapeHtml(column.key)}"
                title="${escapeHtml(getInteractiveTableSortTitle(column, state))}">
                <span>${label}</span>
                ${getInteractiveTableSortMeta(column, state)}
            </button>
        </th>`;
    }).join('');

    const filterRow = columns.map(column => {
        const alignClass = column.align === 'right' ? 'text-right' : 'text-left';
        if (!isInteractiveTableColumnFilterable(column)) {
            return `<th class="${alignClass}"></th>`;
        }
        const value = escapeHtml(state.filters[column.key] || '');
        const label = escapeHtml(column.label || '');
        return `<th class="${alignClass}">
            <input type="search"
                class="interactive-table-filter-input"
                data-filter-key="${escapeHtml(column.key)}"
                value="${value}"
                placeholder="Filtrar"
                aria-label="Filtrar ${label}"
                autocomplete="off">
        </th>`;
    }).join('');

    return `
        <tr class="interactive-table-sort-row">${sortRow}</tr>
        <tr class="interactive-table-filter-row">${filterRow}</tr>
    `;
}

function mountInteractiveTable(container, config = {}) {
    if (!container) return null;

    const tableId = config.tableId || 'interactive-table';
    const columns = config.columns || [];
    const rows = config.rows || [];
    const state = getInteractiveTableState(tableId, config.defaultSort, columns);
    const minWidth = config.minWidth || '760px';

    if (!rows.length) {
        container.innerHTML = `<p class="text-xs text-slate-400 text-center py-8 px-4">${escapeHtml(config.emptyMessage || 'Nenhum registro.')}</p>`;
        return state;
    }

    container.innerHTML = `
        <div class="interactive-table-toolbar">
            <span class="interactive-table-count" data-role="count"></span>
            <div class="interactive-table-toolbar-actions">
                <button type="button" class="interactive-table-clear hidden" data-role="clear-sorts">Limpar ordenação</button>
                <button type="button" class="interactive-table-clear hidden" data-role="clear-filters">Limpar filtros</button>
            </div>
        </div>
        <div class="overflow-x-auto">
            <table class="interactive-table w-full text-sm" style="min-width: ${escapeHtml(minWidth)};" data-table-id="${escapeHtml(tableId)}">
                <thead class="bg-slate-50 text-xs uppercase text-slate-500">${renderInteractiveTableHead(columns, state)}</thead>
                <tbody data-role="body"></tbody>
            </table>
        </div>
    `;

    const countEl = container.querySelector('[data-role="count"]');
    const clearFiltersBtn = container.querySelector('[data-role="clear-filters"]');
    const clearSortsBtn = container.querySelector('[data-role="clear-sorts"]');
    const tbody = container.querySelector('[data-role="body"]');
    const thead = container.querySelector('thead');

    function refreshBody() {
        const visibleRows = getInteractiveTableVisibleRows(rows, columns, state);
        if (tbody) {
            tbody.innerHTML = renderInteractiveTableBody(visibleRows, columns, config);
        }
        if (countEl) {
            countEl.textContent = formatInteractiveTableCount(visibleRows.length, rows.length);
        }
        clearFiltersBtn?.classList.toggle('hidden', !hasInteractiveTableFilters(state.filters));
        clearSortsBtn?.classList.toggle('hidden', !(state.sorts || []).length);
        if (typeof config.onBind === 'function') {
            config.onBind(tbody, visibleRows);
        }
    }

    function refreshSortIndicators() {
        thead?.querySelectorAll('.interactive-table-sort-row th').forEach((th, index) => {
            const column = columns[index];
            if (!column || !isInteractiveTableColumnSortable(column)) return;
            th.setAttribute('aria-sort', getInteractiveTableAriaSort(column, state));
            const button = th.querySelector('[data-sort-key]');
            if (button) {
                button.title = getInteractiveTableSortTitle(column, state);
            }
            const meta = th.querySelector('.interactive-table-sort-meta');
            if (meta) {
                meta.outerHTML = getInteractiveTableSortMeta(column, state);
            }
        });
    }

    thead?.addEventListener('click', event => {
        const button = event.target.closest('[data-sort-key]');
        if (!button) return;
        const column = columns.find(item => item.key === button.dataset.sortKey);
        if (!column || !isInteractiveTableColumnSortable(column)) return;
        cycleInteractiveTableSort(state, column);
        refreshSortIndicators();
        refreshBody();
    });

    thead?.addEventListener('input', event => {
        const input = event.target.closest('[data-filter-key]');
        if (!input) return;
        state.filters[input.dataset.filterKey] = input.value;
        refreshBody();
    });

    clearFiltersBtn?.addEventListener('click', () => {
        state.filters = {};
        thead?.querySelectorAll('[data-filter-key]').forEach(input => {
            input.value = '';
        });
        refreshBody();
    });

    clearSortsBtn?.addEventListener('click', () => {
        state.sorts = [];
        refreshSortIndicators();
        refreshBody();
    });

    refreshBody();
    return state;
}

window.normalizeInteractiveTableSearch = normalizeInteractiveTableSearch;
window.mountInteractiveTable = mountInteractiveTable;
window.getInteractiveTableState = getInteractiveTableState;
