const MONTAGEM_PROG_WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTAGEM_PROG_MIN_LANES = 6;
const MONTAGEM_PROG_CREW_PALETTE = [
    { from: '#4f46e5', to: '#6366f1' },
    { from: '#0d9488', to: '#14b8a6' },
    { from: '#dc2626', to: '#ef4444' },
    { from: '#d97706', to: '#f59e0b' },
    { from: '#7c3aed', to: '#8b5cf6' },
    { from: '#db2777', to: '#ec4899' },
    { from: '#0891b2', to: '#06b6d4' },
    { from: '#65a30d', to: '#84cc16' },
    { from: '#c2410c', to: '#ea580c' },
    { from: '#4338ca', to: '#5b21b6' },
    { from: '#047857', to: '#10b981' },
    { from: '#be185d', to: '#e11d48' }
];

let montagemProgWeekAnchor = startOfWeekMonday(new Date());
let montagemProgCache = [];
let montagemProgMontadorFilterId = null;
let editingMontagemProgId = null;
let montagemProgResizeState = null;
let montagemProgDragMontadorId = null;

function startOfWeekMonday(date) {
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekday = normalized.getDay();
    const diff = weekday === 0 ? -6 : 1 - weekday;
    normalized.setDate(normalized.getDate() + diff);
    return normalized;
}

function montagemProgToDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function montagemProgParseDateKey(dateKey) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function montagemProgAddDays(date, days) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
}

function montagemProgDaysBetween(startDate, endDate) {
    const ms = endDate.getTime() - startDate.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatMontagemProgWeekLabel(weekStart) {
    const weekEnd = montagemProgAddDays(weekStart, 6);
    const startLabel = weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const endLabel = weekEnd.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
    return `${startLabel} – ${endLabel}`;
}

function formatMontagemProgDayHeader(dateKey) {
    const date = montagemProgParseDateKey(dateKey);
    if (!date) return '—';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatMontagemProgMonthLabel(dateKey) {
    const date = montagemProgParseDateKey(dateKey);
    if (!date) return '—';
    const label = date.toLocaleDateString('pt-BR', { month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function getMontagemProgMonthKey(dateKey) {
    const date = montagemProgParseDateKey(dateKey);
    if (!date) return '';
    return `${date.getFullYear()}-${date.getMonth()}`;
}

function buildMontagemProgMonthGroups(weekDateKeys) {
    const groups = [];

    weekDateKeys.forEach((dateKey, index) => {
        const monthKey = getMontagemProgMonthKey(dateKey);
        const last = groups[groups.length - 1];

        if (last && last.monthKey === monthKey) {
            last.span += 1;
            last.endIndex = index;
            return;
        }

        groups.push({
            monthKey,
            monthLabel: formatMontagemProgMonthLabel(dateKey),
            startCol: index + 1,
            span: 1,
            startIndex: index,
            endIndex: index
        });
    });

    return groups.map(group => ({
        ...group,
        isWeekendGroup: group.startIndex >= 5
    }));
}

function getMontagemProgWeekStartKey() {
    return montagemProgToDateKey(montagemProgWeekAnchor);
}

function getMontagemProgWeekDateKeys() {
    const keys = [];
    for (let index = 0; index < 7; index += 1) {
        keys.push(montagemProgToDateKey(montagemProgAddDays(montagemProgWeekAnchor, index)));
    }
    return keys;
}

function getMontagemProgMontadores(prog) {
    return (prog?.montadores || [])
        .map(row => row.montador || { id: row.montadorId, name: 'Montador' })
        .filter(montador => montador?.id);
}

function getMontagemProgMontadorName(montadorId) {
    const fromCache = (gestaoMontadoresCache || []).find(item => Number(item.id) === Number(montadorId));
    if (fromCache?.name) return fromCache.name;

    for (const prog of montagemProgCache) {
        const montador = getMontagemProgMontadores(prog).find(item => Number(item.id) === Number(montadorId));
        if (montador?.name) return montador.name;
    }

    return 'Montador';
}

function getMontagemProgSelectableMontadores() {
    if (typeof getGestaoActiveMontadores === 'function') {
        return getGestaoActiveMontadores();
    }
    return (gestaoMontadoresCache || []).filter(montador => montador.isActive !== false);
}

function getMontagemProgMontadorIds(prog) {
    return getMontagemProgMontadores(prog).map(montador => Number(montador.id));
}

function getMontagemProgVisibleProgramacoes() {
    if (!montagemProgMontadorFilterId) return montagemProgCache;
    return montagemProgCache.filter(prog =>
        getMontagemProgMontadorIds(prog).includes(Number(montagemProgMontadorFilterId))
    );
}

function shiftMontagemProgDateKey(dateKey, days) {
    const date = montagemProgParseDateKey(dateKey);
    if (!date) return dateKey;
    return montagemProgToDateKey(montagemProgAddDays(date, days));
}

function getMontagemProgMontadorNames(prog) {
    return getMontagemProgMontadores(prog).map(montador => montador.name).join(' + ');
}

function getMontagemProgClientLabel(prog) {
    return prog?.order?.clientName || prog?.clientName || '';
}

function getMontagemProgOrderLabel(prog) {
    return prog?.orderCode || prog?.order?.orderCode || '';
}

function getMontagemProgPrimaryMontadorLabel(prog) {
    const montadores = getMontagemProgMontadores(prog);
    if (!montadores.length) return 'Montagem';
    if (montadores.length === 1) return montadores[0].name;
    return `${montadores[0].name} + ${montadores[1].name}`;
}

function getMontagemProgBarClientLabel(prog) {
    const clientLabel = getMontagemProgClientLabel(prog);
    return clientLabel ? `Cliente: ${clientLabel}` : 'Cliente: —';
}

function getMontagemProgBarSummary(prog) {
    const parts = [getMontagemProgPrimaryMontadorLabel(prog), getMontagemProgBarClientLabel(prog)];
    const orderLabel = getMontagemProgOrderLabel(prog);
    if (orderLabel) parts.push(orderLabel);
    if (prog?.observation) parts.push(prog.observation);
    return parts.join(' · ');
}

function getMontagemProgTooltipRows(prog) {
    const rows = [['Montador', getMontagemProgPrimaryMontadorLabel(prog)]];
    const clientLabel = getMontagemProgClientLabel(prog);
    const orderLabel = getMontagemProgOrderLabel(prog);

    if (clientLabel) rows.push(['Cliente', clientLabel]);
    if (orderLabel) rows.push(['Pedido', orderLabel]);
    if (prog?.startDate && prog?.endDate) {
        const periodLabel = prog.startDate === prog.endDate
            ? formatMontagemProgDayHeader(prog.startDate)
            : `${formatMontagemProgDayHeader(prog.startDate)} – ${formatMontagemProgDayHeader(prog.endDate)}`;
        rows.push(['Período', periodLabel]);
    }
    if (prog?.observation) rows.push(['Observação', prog.observation]);

    return rows;
}

function renderMontagemProgTooltipHtml(prog) {
    const rows = getMontagemProgTooltipRows(prog);

    return `
        <div class="calendar-event-tooltip calendar-event-tooltip--montagem">
            <div class="calendar-event-tooltip__badge">Montagem</div>
            <dl class="calendar-event-tooltip__rows">
                ${rows.map(([label, value]) => `
                    <div class="calendar-event-tooltip__row">
                        <dt>${escapeHtml(label)}</dt>
                        <dd>${escapeHtml(value)}</dd>
                    </div>
                `).join('')}
            </dl>
        </div>
    `;
}

let montagemProgFloatingTooltipEl = null;

function ensureMontagemProgFloatingTooltip() {
    if (montagemProgFloatingTooltipEl) return montagemProgFloatingTooltipEl;

    montagemProgFloatingTooltipEl = document.createElement('div');
    montagemProgFloatingTooltipEl.id = 'montagem-prog-floating-tooltip';
    montagemProgFloatingTooltipEl.className = 'calendar-event-floating-tooltip hidden';
    montagemProgFloatingTooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(montagemProgFloatingTooltipEl);
    return montagemProgFloatingTooltipEl;
}

function positionMontagemProgFloatingTooltip(anchorEl) {
    const tooltip = ensureMontagemProgFloatingTooltip();
    if (!anchorEl) return;

    const margin = 10;
    const rect = anchorEl.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = rect.bottom + margin;
    let left = rect.left;

    if (top + tooltipRect.height > window.innerHeight - margin) {
        top = rect.top - tooltipRect.height - margin;
    }

    if (left + tooltipRect.width > window.innerWidth - margin) {
        left = window.innerWidth - tooltipRect.width - margin;
    }

    left = Math.max(margin, left);
    top = Math.max(margin, top);

    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
}

function showMontagemProgFloatingTooltip(programacaoId, anchorEl) {
    const prog = montagemProgCache.find(item => Number(item.id) === Number(programacaoId));
    if (!prog || !anchorEl) return;

    const tooltip = ensureMontagemProgFloatingTooltip();
    tooltip.innerHTML = renderMontagemProgTooltipHtml(prog);
    tooltip.classList.remove('hidden');

    requestAnimationFrame(() => {
        positionMontagemProgFloatingTooltip(anchorEl);
    });
}

function hideMontagemProgFloatingTooltip() {
    montagemProgFloatingTooltipEl?.classList.add('hidden');
}

function bindMontagemProgTooltipEvents() {
    const panel = document.getElementById('gestao-montagem-programacao-panel');
    if (!panel || panel.dataset.tooltipBound === '1') return;

    panel.dataset.tooltipBound = '1';

    panel.addEventListener('mouseover', event => {
        const target = event.target.closest('.montagem-prog-bar[data-programacao-id]');
        if (!target?.dataset.programacaoId) return;
        showMontagemProgFloatingTooltip(target.dataset.programacaoId, target);
    });

    panel.addEventListener('mouseout', event => {
        const target = event.target.closest('.montagem-prog-bar[data-programacao-id]');
        if (!target) return;

        const related = event.relatedTarget;
        if (related && target.contains(related)) return;
        if (related?.closest?.('#montagem-prog-floating-tooltip')) return;

        const nextTarget = related?.closest?.('.montagem-prog-bar[data-programacao-id]');
        if (nextTarget?.dataset.programacaoId) {
            showMontagemProgFloatingTooltip(nextTarget.dataset.programacaoId, nextTarget);
            return;
        }

        hideMontagemProgFloatingTooltip();
    });

    panel.querySelector('.montagem-prog-calendar')?.addEventListener('scroll', hideMontagemProgFloatingTooltip);
    panel.addEventListener('scroll', hideMontagemProgFloatingTooltip, true);
    window.addEventListener('resize', hideMontagemProgFloatingTooltip);
}

function getMontagemProgPlacement(prog, weekStartKey) {
    const weekStart = montagemProgParseDateKey(weekStartKey);
    const weekEnd = montagemProgAddDays(weekStart, 6);
    const progStart = montagemProgParseDateKey(prog.startDate);
    const progEnd = montagemProgParseDateKey(prog.endDate);
    if (!weekStart || !weekEnd || !progStart || !progEnd) return null;

    if (progEnd < weekStart || progStart > weekEnd) return null;

    const visibleStart = progStart < weekStart ? weekStart : progStart;
    const visibleEnd = progEnd > weekEnd ? weekEnd : progEnd;
    const startCol = montagemProgDaysBetween(weekStart, visibleStart) + 1;
    const span = montagemProgDaysBetween(visibleStart, visibleEnd) + 1;

    return { startCol, span, visibleStartKey: montagemProgToDateKey(visibleStart), visibleEndKey: montagemProgToDateKey(visibleEnd) };
}

function montagemProgPlacementsOverlap(a, b) {
    if (!a || !b) return false;
    const aEnd = a.startCol + a.span;
    const bEnd = b.startCol + b.span;
    return a.startCol < bEnd && b.startCol < aEnd;
}

function getMontagemProgCrewKey(prog) {
    const ids = getMontagemProgMontadorIds(prog).sort((left, right) => left - right);
    if (!ids.length) return 'none';
    return ids.join('+');
}

function getMontagemProgCrewColorIndex(crewKey) {
    let hash = 0;
    for (let index = 0; index < crewKey.length; index += 1) {
        hash = ((hash << 5) - hash) + crewKey.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash) % MONTAGEM_PROG_CREW_PALETTE.length;
}

function getMontagemProgCrewColors(crewKey) {
    return MONTAGEM_PROG_CREW_PALETTE[getMontagemProgCrewColorIndex(crewKey)];
}

function getMontagemProgCrewBarStyle(crewKey) {
    const colors = getMontagemProgCrewColors(crewKey);
    return `--montagem-prog-bar-from: ${colors.from}; --montagem-prog-bar-to: ${colors.to};`;
}

function getMontagemProgSoloCrewKey(montadorId) {
    return String(Number(montadorId));
}

function getMontagemProgOccupiedColumns(laneItems) {
    const occupied = new Set();

    laneItems.forEach(({ placement }) => {
        for (let column = placement.startCol; column < placement.startCol + placement.span; column += 1) {
            occupied.add(column);
        }
    });

    return occupied;
}

function montagemProgLaneHasPlacementOverlap(lane, placement) {
    return lane.some(item => montagemProgPlacementsOverlap(item.placement, placement));
}

function assignMontagemProgLanes(programacoes, weekStartKey) {
    const sorted = [...programacoes].sort((left, right) =>
        String(left.startDate).localeCompare(String(right.startDate))
        || Number(left.id) - Number(right.id)
    );

    const lanes = [];

    sorted.forEach(prog => {
        const placement = getMontagemProgPlacement(prog, weekStartKey);
        if (!placement) return;

        const crewKey = getMontagemProgCrewKey(prog);

        let targetLane = lanes.find(lane =>
            lane.some(item => getMontagemProgCrewKey(item.prog) === crewKey)
            && !montagemProgLaneHasPlacementOverlap(lane, placement)
        );

        if (!targetLane) {
            targetLane = [];
            lanes.push(targetLane);
        }

        targetLane.push({ prog, placement });
    });

    lanes.sort((left, right) => {
        const leftKey = left.length ? getMontagemProgCrewKey(left[0].prog) : 'zzz';
        const rightKey = right.length ? getMontagemProgCrewKey(right[0].prog) : 'zzz';
        if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);

        const leftStart = left[0]?.placement?.startCol || 0;
        const rightStart = right[0]?.placement?.startCol || 0;
        return leftStart - rightStart;
    });

    while (lanes.length < MONTAGEM_PROG_MIN_LANES) {
        lanes.push([]);
    }

    return lanes;
}

function buildMontagemProgConflictMap(programacoes) {
    const conflictsByProgId = new Map();
    const assignmentsByDateMontador = new Map();

    programacoes.forEach(prog => {
        const start = montagemProgParseDateKey(prog.startDate);
        const end = montagemProgParseDateKey(prog.endDate);
        if (!start || !end) return;

        const montadorIds = getMontagemProgMontadorIds(prog);
        for (let cursor = new Date(start); cursor <= end; cursor = montagemProgAddDays(cursor, 1)) {
            const dateKey = montagemProgToDateKey(cursor);
            montadorIds.forEach(montadorId => {
                const key = `${dateKey}:${montadorId}`;
                if (!assignmentsByDateMontador.has(key)) assignmentsByDateMontador.set(key, []);
                assignmentsByDateMontador.get(key).push(prog.id);
            });
        }
    });

    assignmentsByDateMontador.forEach(ids => {
        if (ids.length < 2) return;
        ids.forEach(id => {
            if (!conflictsByProgId.has(id)) conflictsByProgId.set(id, new Set());
            ids.forEach(otherId => {
                if (otherId !== id) conflictsByProgId.get(id).add(otherId);
            });
        });
    });

    return conflictsByProgId;
}

function buildMontagemProgConflictDetails(programacoes) {
    const assignmentsByDateMontador = new Map();

    programacoes.forEach(prog => {
        const start = montagemProgParseDateKey(prog.startDate);
        const end = montagemProgParseDateKey(prog.endDate);
        if (!start || !end) return;

        const montadorIds = getMontagemProgMontadorIds(prog);
        for (let cursor = new Date(start); cursor <= end; cursor = montagemProgAddDays(cursor, 1)) {
            const dateKey = montagemProgToDateKey(cursor);
            montadorIds.forEach(montadorId => {
                const key = `${dateKey}:${montadorId}`;
                if (!assignmentsByDateMontador.has(key)) assignmentsByDateMontador.set(key, new Set());
                assignmentsByDateMontador.get(key).add(prog.id);
            });
        }
    });

    const details = [];

    assignmentsByDateMontador.forEach((progIds, key) => {
        if (progIds.size < 2) return;

        const [dateKey, montadorId] = key.split(':');
        const date = montagemProgParseDateKey(dateKey);
        const dateLabel = date
            ? date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
            : dateKey;
        const montadorName = getMontagemProgMontadorName(montadorId);
        const summaries = [...progIds]
            .map(id => {
                const prog = programacoes.find(item => Number(item.id) === Number(id));
                return prog ? getMontagemProgBarSummary(prog) : `Montagem #${id}`;
            })
            .join(' · ');

        details.push({
            sortKey: `${dateKey}:${montadorName}`,
            text: `${montadorName} em ${dateLabel}: ${summaries}`
        });
    });

    return details
        .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
        .map(item => item.text);
}

async function lookupMontagemProgOrderByCode(orderCode) {
    const trimmed = String(orderCode || '').trim();
    if (!trimmed) return null;

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select('id, orderCode, clientName')
        .eq('orderCode', trimmed)
        .maybeSingle();

    if (error) {
        console.error('lookupMontagemProgOrderByCode:', error);
        return null;
    }

    return data;
}

async function loadMontagemProgramacoesForWeek(weekStartKey = getMontagemProgWeekStartKey(), updateCache = true) {
    const weekEndKey = montagemProgToDateKey(montagemProgAddDays(montagemProgParseDateKey(weekStartKey), 6));

    const selectVariants = [
        `
            *,
            order:salesOrders(id, orderCode, clientName),
            montadores:MontagemProgramacaoMontador(
                id, montadorId,
                montador:Montador(id, name)
            )
        `,
        `
            *,
            montadores:MontagemProgramacaoMontador(id, montadorId, montador:Montador(id, name))
        `,
        `
            *,
            montadores:MontagemProgramacaoMontador(id, montadorId)
        `,
        '*'
    ];

    let result = { data: [], error: null };

    for (const selectColumns of selectVariants) {
        result = await supabaseClient
            .from('MontagemProgramacao')
            .select(selectColumns)
            .lte('startDate', weekEndKey)
            .gte('endDate', weekStartKey)
            .order('startDate', { ascending: true })
            .order('id', { ascending: true });

        if (!result.error) break;

        if (result.error.message?.includes('MontagemProgramacao')) {
            if (updateCache) montagemProgCache = [];
            return [];
        }
    }

    if (result.error) {
        console.error('loadMontagemProgramacoesForWeek:', result.error);
        if (updateCache) montagemProgCache = [];
        return [];
    }

    let programacoes = result.data || [];

    if (programacoes.some(prog => !prog.montadores)) {
        const ids = programacoes.map(prog => prog.id).filter(Boolean);
        if (ids.length) {
            const { data: montadorRows } = await supabaseClient
                .from('MontagemProgramacaoMontador')
                .select('id, programacaoId, montadorId, montador:Montador(id, name)')
                .in('programacaoId', ids);

            const byProgId = {};
            (montadorRows || []).forEach(row => {
                const progId = Number(row.programacaoId);
                if (!byProgId[progId]) byProgId[progId] = [];
                byProgId[progId].push(row);
            });

            programacoes = programacoes.map(prog => ({
                ...prog,
                montadores: prog.montadores || byProgId[Number(prog.id)] || []
            }));
        }
    }

    if (updateCache) montagemProgCache = programacoes;
    return programacoes;
}

function renderMontagemProgMontadorFilter() {
    const select = document.getElementById('montagem-prog-montador-filter');
    if (!select) return;

    const montadores = getMontagemProgSelectableMontadores();
    const currentValue = montagemProgMontadorFilterId ? String(montagemProgMontadorFilterId) : '';

    select.innerHTML = `
        <option value="">Todos</option>
        ${montadores.map(montador => `
            <option value="${montador.id}">${escapeHtml(montador.name)}</option>
        `).join('')}
    `;

    select.value = montadores.some(montador => String(montador.id) === currentValue) ? currentValue : '';
    if (!select.value) montagemProgMontadorFilterId = null;
}

function renderMontagemProgPalette() {
    const palette = document.getElementById('montagem-prog-palette');
    if (!palette) return;

    const montadores = getMontagemProgSelectableMontadores();

    if (!montadores.length) {
        palette.innerHTML = '<p class="text-[11px] text-amber-700">Cadastre montadores ativos em Gestão → Montadores.</p>';
        return;
    }

    palette.innerHTML = montadores.map(montador => {
        const isFiltered = montagemProgMontadorFilterId && Number(montador.id) === Number(montagemProgMontadorFilterId);
        const crewStyle = getMontagemProgCrewBarStyle(getMontagemProgSoloCrewKey(montador.id));
        return `
        <div class="montagem-prog-palette-item ${isFiltered ? 'montagem-prog-palette-item--filtered' : ''}"
            draggable="true"
            data-montador-id="${montador.id}"
            title="Arraste para a semana">
            <span class="montagem-prog-palette-item__color" style="${crewStyle}" aria-hidden="true"></span>
            <span class="montagem-prog-palette-item__grip" aria-hidden="true">⠿</span>
            <span>${escapeHtml(montador.name)}</span>
        </div>
    `;
    }).join('');

    palette.querySelectorAll('.montagem-prog-palette-item').forEach(item => {
        item.addEventListener('dragstart', event => {
            montagemProgDragMontadorId = Number(item.dataset.montadorId);
            event.dataTransfer?.setData('text/plain', String(montagemProgDragMontadorId));
            event.dataTransfer.effectAllowed = 'copy';
            item.classList.add('is-dragging');
        });
        item.addEventListener('dragend', () => {
            montagemProgDragMontadorId = null;
            item.classList.remove('is-dragging');
        });
        item.addEventListener('dblclick', () => {
            openMontagemProgModal(null, getMontagemProgWeekStartKey(), Number(item.dataset.montadorId));
        });
    });
}

function renderMontagemProgConflicts(conflictMap) {
    const banner = document.getElementById('montagem-prog-conflicts');
    if (!banner) return;

    if (!conflictMap.size) {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        return;
    }

    const details = buildMontagemProgConflictDetails(montagemProgCache);
    const visibleDetails = details.slice(0, 4);
    const remaining = details.length - visibleDetails.length;

    banner.classList.remove('hidden');
    banner.innerHTML = `
        <p class="font-semibold">Atenção: ${conflictMap.size} montagem(ns) com possível conflito de agenda.</p>
        <ul class="montagem-prog-conflicts-list">
            ${visibleDetails.map(line => `<li>${escapeHtml(line)}</li>`).join('')}
            ${remaining > 0 ? `<li>+ ${remaining} outro(s) conflito(s)</li>` : ''}
        </ul>
    `;
}

function renderMontagemProgWeekGrid() {
    hideMontagemProgFloatingTooltip();

    const grid = document.getElementById('montagem-prog-week-grid');
    if (!grid) return;

    const weekStartKey = getMontagemProgWeekStartKey();
    const weekDateKeys = getMontagemProgWeekDateKeys();
    const visibleProgramacoes = getMontagemProgVisibleProgramacoes();
    const conflictMap = buildMontagemProgConflictMap(montagemProgCache);
    const lanes = assignMontagemProgLanes(visibleProgramacoes, weekStartKey);

    renderMontagemProgConflicts(conflictMap);

    const monthGroups = buildMontagemProgMonthGroups(weekDateKeys);
    const monthHeadersHtml = monthGroups.map(group => `
        <div class="montagem-prog-month-header montagem-prog-month-header--grouped ${group.isWeekendGroup ? 'montagem-prog-month-header--weekend' : ''}"
            style="grid-column: ${group.startCol} / span ${group.span};">
            ${escapeHtml(group.monthLabel)}
        </div>
    `).join('');

    const headersHtml = weekDateKeys.map((dateKey, index) => {
        const isWeekend = index >= 5;
        return `
            <div class="montagem-prog-day-header ${isWeekend ? 'montagem-prog-day-header--weekend' : ''}">
                <span class="montagem-prog-day-header__weekday">${MONTAGEM_PROG_WEEKDAYS[index]}</span>
                <span class="montagem-prog-day-header__date">${formatMontagemProgDayHeader(dateKey)}</span>
            </div>
        `;
    }).join('');

    const lanesHtml = lanes.map((laneItems, laneIndex) => {
        const occupiedColumns = getMontagemProgOccupiedColumns(laneItems);
        const slotsHtml = weekDateKeys.map((dateKey, index) => {
            const column = index + 1;
            if (occupiedColumns.has(column)) return '';

            return `
            <div class="montagem-prog-day-slot ${index >= 5 ? 'montagem-prog-day-slot--weekend' : ''}"
                style="grid-column: ${column};"
                data-date="${dateKey}"
                data-lane="${laneIndex}"></div>
        `;
        }).join('');

        const barsHtml = laneItems.map(({ prog, placement }) => {
            const crewKey = getMontagemProgCrewKey(prog);
            const hasConflict = conflictMap.has(prog.id);
            const barClass = [
                'montagem-prog-bar',
                'montagem-prog-bar--crew',
                hasConflict ? 'montagem-prog-bar--conflict' : ''
            ].filter(Boolean).join(' ');

            return `
                <div class="${barClass}"
                    data-programacao-id="${prog.id}"
                    style="${getMontagemProgCrewBarStyle(crewKey)} grid-row: 1; grid-column: ${placement.startCol} / span ${placement.span};">
                    <button type="button" class="montagem-prog-bar-resize montagem-prog-bar-resize--start"
                        data-programacao-id="${prog.id}"
                        data-edge="start"
                        aria-label="Ajustar início"></button>
                    <button type="button" class="montagem-prog-bar-body" data-programacao-id="${prog.id}">
                        <span class="montagem-prog-bar-montadores">${escapeHtml(getMontagemProgPrimaryMontadorLabel(prog))}</span>
                        <span class="montagem-prog-bar-meta">${escapeHtml(getMontagemProgBarClientLabel(prog))}</span>
                    </button>
                    <button type="button" class="montagem-prog-bar-resize montagem-prog-bar-resize--end"
                        data-programacao-id="${prog.id}"
                        data-edge="end"
                        aria-label="Ajustar fim"></button>
                </div>
            `;
        }).join('');

        return `
            <div class="montagem-prog-lane" data-lane="${laneIndex}">
                ${slotsHtml}
                ${barsHtml}
            </div>
        `;
    }).join('');

    grid.innerHTML = `
        <div class="montagem-prog-month-headers">${monthHeadersHtml}</div>
        <div class="montagem-prog-day-headers">${headersHtml}</div>
        <div class="montagem-prog-lanes">${lanesHtml}</div>
    `;

    const emptyState = document.getElementById('montagem-prog-empty-filter');
    if (montagemProgMontadorFilterId && !visibleProgramacoes.length) {
        if (!emptyState) {
            const message = document.createElement('p');
            message.id = 'montagem-prog-empty-filter';
            message.className = 'montagem-prog-empty-filter text-xs text-slate-400 text-center py-4';
            message.textContent = 'Nenhuma montagem para o montador selecionado nesta semana.';
            grid.insertAdjacentElement('afterend', message);
        }
    } else {
        emptyState?.remove();
    }

    bindMontagemProgWeekInteractions(grid);
}

function bindMontagemProgWeekInteractions(grid) {
    const lanesContainer = grid.querySelector('.montagem-prog-lanes');
    const allowDrop = event => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const clearDropTargets = () => {
        grid.querySelectorAll('.montagem-prog-day-slot.is-drop-target, .montagem-prog-bar.is-drop-target')
            .forEach(element => element.classList.remove('is-drop-target'));
    };

    const updateDropTargetHighlight = event => {
        clearDropTargets();

        const bar = event.target.closest('.montagem-prog-bar');
        if (bar) {
            bar.classList.add('is-drop-target');
            return;
        }

        const slot = getMontagemProgDropTargetSlot(event.clientX, event.clientY, grid);
        slot?.classList.add('is-drop-target');
    };

    grid.addEventListener('dragover', event => {
        allowDrop(event);
        updateDropTargetHighlight(event);
    });

    lanesContainer?.addEventListener('drop', async event => {
        event.preventDefault();
        event.stopPropagation();
        clearDropTargets();

        const montadorId = Number(event.dataTransfer?.getData('text/plain') || montagemProgDragMontadorId);
        if (!montadorId) return;

        const bar = event.target.closest('.montagem-prog-bar');
        if (bar) {
            await createMontagemProgFromDrop(montadorId, null, Number(bar.dataset.programacaoId));
            return;
        }

        const dateKey = getMontagemProgDateKeyFromPointer(event.clientX, grid);
        if (!dateKey) return;

        await createMontagemProgFromDrop(montadorId, dateKey);
    });

    grid.querySelectorAll('.montagem-prog-day-slot').forEach(slot => {
        slot.addEventListener('click', () => {
            openMontagemProgModal(null, slot.dataset.date);
        });
    });

    grid.querySelectorAll('.montagem-prog-bar').forEach(bar => {
        bar.addEventListener('dragover', allowDrop);
    });

    grid.querySelectorAll('.montagem-prog-bar-body').forEach(button => {
        button.addEventListener('click', event => {
            event.stopPropagation();
            const prog = montagemProgCache.find(item => Number(item.id) === Number(button.dataset.programacaoId));
            if (prog) openMontagemProgModal(prog);
        });
    });

    grid.querySelectorAll('.montagem-prog-bar-resize').forEach(handle => {
        handle.addEventListener('pointerdown', event => {
            event.preventDefault();
            event.stopPropagation();
            startMontagemProgResize(handle, event);
        });
    });
}

function getMontagemProgDateKeyFromPointer(clientX, grid) {
    const weekDateKeys = getMontagemProgWeekDateKeys();
    const headers = grid?.querySelectorAll('.montagem-prog-day-header') || [];
    if (!headers.length) return null;

    for (let index = 0; index < headers.length; index += 1) {
        const rect = headers[index].getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right) {
            return weekDateKeys[index] || null;
        }
    }

    let closestIndex = 0;
    let closestDistance = Infinity;

    headers.forEach((header, index) => {
        const rect = header.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const distance = Math.abs(clientX - center);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });

    return weekDateKeys[closestIndex] || null;
}

function getMontagemProgDateFromPointer(clientX, grid) {
    return getMontagemProgDateKeyFromPointer(clientX, grid);
}

function getMontagemProgDropTargetSlot(clientX, clientY, grid) {
    const slots = grid?.querySelectorAll('.montagem-prog-day-slot') || [];
    let targetSlot = null;

    slots.forEach(slot => {
        const rect = slot.getBoundingClientRect();
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
        if (!targetSlot || rect.top >= targetSlot.getBoundingClientRect().top) {
            targetSlot = slot;
        }
    });

    return targetSlot;
}

function startMontagemProgResize(handle, event) {
    const programacaoId = Number(handle.dataset.programacaoId);
    const edge = handle.dataset.edge;
    const prog = montagemProgCache.find(item => Number(item.id) === programacaoId);
    if (!prog) return;

    montagemProgResizeState = {
        programacaoId,
        edge,
        originalStartDate: prog.startDate,
        originalEndDate: prog.endDate,
        previewDate: edge === 'start' ? prog.startDate : prog.endDate
    };

    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('montagem-prog-resizing');

    const onPointerMove = moveEvent => {
        const grid = document.getElementById('montagem-prog-week-grid');
        const dateKey = getMontagemProgDateFromPointer(moveEvent.clientX, grid);
        if (!dateKey || !montagemProgResizeState) return;
        montagemProgResizeState.previewDate = dateKey;
        updateMontagemProgResizePreview();
    };

    const onPointerUp = async upEvent => {
        handle.releasePointerCapture(upEvent.pointerId);
        document.body.classList.remove('montagem-prog-resizing');
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);

        if (!montagemProgResizeState) return;

        const { programacaoId: id, edge: resizeEdge, originalStartDate, originalEndDate, previewDate } = montagemProgResizeState;
        montagemProgResizeState = null;

        let nextStartDate = originalStartDate;
        let nextEndDate = originalEndDate;

        if (resizeEdge === 'start') nextStartDate = previewDate;
        if (resizeEdge === 'end') nextEndDate = previewDate;

        if (nextStartDate > nextEndDate) {
            if (resizeEdge === 'start') nextEndDate = nextStartDate;
            else nextStartDate = nextEndDate;
        }

        if (nextStartDate === originalStartDate && nextEndDate === originalEndDate) {
            await loadMontagemProgramacaoView();
            return;
        }

        await updateMontagemProgDates(id, nextStartDate, nextEndDate);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
}

function updateMontagemProgResizePreview() {
    if (!montagemProgResizeState) return;

    const prog = montagemProgCache.find(item => Number(item.id) === montagemProgResizeState.programacaoId);
    if (!prog) return;

    const previewProg = {
        ...prog,
        startDate: montagemProgResizeState.edge === 'start'
            ? montagemProgResizeState.previewDate
            : prog.startDate,
        endDate: montagemProgResizeState.edge === 'end'
            ? montagemProgResizeState.previewDate
            : prog.endDate
    };

    if (previewProg.startDate > previewProg.endDate) {
        if (montagemProgResizeState.edge === 'start') previewProg.endDate = previewProg.startDate;
        else previewProg.startDate = previewProg.endDate;
    }

    const index = montagemProgCache.findIndex(item => Number(item.id) === Number(prog.id));
    if (index >= 0) {
        montagemProgCache[index] = previewProg;
        renderMontagemProgWeekGrid();
    }
}

async function updateMontagemProgDates(programacaoId, startDate, endDate) {
    if (!canAccessMontagemProgramacao()) return;

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('MontagemProgramacao')
        .update({
            startDate,
            endDate,
            updatedAt: now,
            updatedById: currentUser.id
        })
        .eq('id', programacaoId);

    if (error) {
        alertAppDialog('Erro ao ajustar datas: ' + error.message);
        await loadMontagemProgramacaoView();
        return;
    }

    await loadMontagemProgramacaoView();
    warnMontagemProgConflictsIfNeeded();
}

async function persistMontagemProgMontadores(programacaoId, montadorIds) {
    const uniqueIds = [...new Set(montadorIds.map(id => Number(id)).filter(Boolean))].slice(0, 2);

    const { data: current } = await supabaseClient
        .from('MontagemProgramacaoMontador')
        .select('id, montadorId')
        .eq('programacaoId', programacaoId);

    const keepIds = new Set(uniqueIds);
    const deleteIds = (current || [])
        .filter(row => !keepIds.has(Number(row.montadorId)))
        .map(row => row.id);

    if (deleteIds.length) {
        const { error } = await supabaseClient
            .from('MontagemProgramacaoMontador')
            .delete()
            .in('id', deleteIds);
        if (error) throw error;
    }

    for (const montadorId of uniqueIds) {
        const exists = (current || []).some(row => Number(row.montadorId) === montadorId);
        if (exists) continue;

        const { error } = await supabaseClient
            .from('MontagemProgramacaoMontador')
            .insert({ programacaoId, montadorId });
        if (error) throw error;
    }
}

async function createMontagemProgFromDrop(montadorId, dateKey, targetProgramacaoId = null) {
    if (!canAccessMontagemProgramacao()) return;

    try {
        if (targetProgramacaoId) {
            const prog = montagemProgCache.find(item => Number(item.id) === Number(targetProgramacaoId));
            if (!prog) return;

            const montadorIds = getMontagemProgMontadorIds(prog);
            if (montadorIds.includes(Number(montadorId))) return;
            if (montadorIds.length >= 2) {
                alertAppDialog('Esta montagem já possui dupla.', { variant: 'warning', title: 'Aviso' });
                return;
            }

            await persistMontagemProgMontadores(targetProgramacaoId, [...montadorIds, Number(montadorId)]);
            await loadMontagemProgramacaoView();
            warnMontagemProgConflictsIfNeeded();
            return;
        }

        if (!dateKey) return;

        const now = new Date().toISOString();
        const { data: created, error } = await supabaseClient
            .from('MontagemProgramacao')
            .insert({
                startDate: dateKey,
                endDate: dateKey,
                observation: '',
                createdById: currentUser.id,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .select('id')
            .single();

        if (error) throw error;

        await persistMontagemProgMontadores(created.id, [Number(montadorId)]);
        await loadMontagemProgramacaoView();

        const createdProg = montagemProgCache.find(item => Number(item.id) === Number(created.id));
        openMontagemProgModal(createdProg || { id: created.id, startDate: dateKey, endDate: dateKey, montadores: [] });
        warnMontagemProgConflictsIfNeeded();
    } catch (error) {
        console.error('createMontagemProgFromDrop:', error);
        const sqlHint = error.message?.includes('MontagemProgramacao')
            ? '\n\nExecute supabase/create-montagem-programacao.sql no Supabase.'
            : '';
        alertAppDialog('Erro ao criar montagem: ' + error.message + sqlHint);
    }
}

function populateMontagemProgMontadorSelects(selectedIds = [], selectedMontadores = []) {
    const montadoresById = new Map();
    getMontagemProgSelectableMontadores().forEach(montador => {
        montadoresById.set(Number(montador.id), montador);
    });

    selectedIds.forEach(montadorId => {
        const normalizedId = Number(montadorId);
        if (!normalizedId || montadoresById.has(normalizedId)) return;

        const fromProg = selectedMontadores.find(item => Number(item.id) === normalizedId);
        montadoresById.set(normalizedId, fromProg || {
            id: normalizedId,
            name: getMontagemProgMontadorName(normalizedId),
            isActive: false
        });
    });

    const montadores = [...montadoresById.values()]
        .sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR', { sensitivity: 'base' }));

    const options = montadores.map(montador => {
        const inactiveSuffix = montador.isActive === false ? ' (inativo)' : '';
        return `<option value="${montador.id}">${escapeHtml(`${montador.name || 'Montador'}${inactiveSuffix}`)}</option>`;
    }).join('');

    const select1 = document.getElementById('montagem-prog-montador-1');
    const select2 = document.getElementById('montagem-prog-montador-2');
    if (!select1 || !select2) return;

    select1.innerHTML = `<option value="">Selecione...</option>${options}`;
    select2.innerHTML = `<option value="">Nenhum</option>${options}`;

    select1.value = selectedIds[0] ? String(selectedIds[0]) : '';
    select2.value = selectedIds[1] ? String(selectedIds[1]) : '';
}

function syncMontagemProgClientRequired() {
    const orderCode = document.getElementById('montagem-prog-order-code')?.value.trim();
    const requiredMarker = document.getElementById('montagem-prog-client-required');
    requiredMarker?.classList.toggle('hidden', Boolean(orderCode));
}

async function openMontagemProgModal(prog = null, presetDate = null, presetMontadorId = null) {
    if (!canAccessMontagemProgramacao()) return;

    hideMontagemProgFloatingTooltip();

    if (typeof loadGestaoMontadores === 'function') {
        await loadGestaoMontadores(true);
    }

    editingMontagemProgId = prog?.id || null;

    const titleEl = document.getElementById('montagem-prog-modal-title');
    const deleteBtn = document.getElementById('btn-montagem-prog-delete');
    if (titleEl) {
        titleEl.textContent = editingMontagemProgId ? 'Editar montagem' : 'Nova montagem';
    }
    deleteBtn?.classList.toggle('hidden', !editingMontagemProgId);

    const montadorIds = prog ? getMontagemProgMontadorIds(prog) : [];
    if (presetMontadorId && !montadorIds.length) montadorIds.push(Number(presetMontadorId));

    populateMontagemProgMontadorSelects(montadorIds, prog ? getMontagemProgMontadores(prog) : []);

    const defaultDate = presetDate || getMontagemProgWeekStartKey();
    document.getElementById('montagem-prog-start-date').value = prog?.startDate || defaultDate;
    document.getElementById('montagem-prog-end-date').value = prog?.endDate || defaultDate;
    document.getElementById('montagem-prog-order-code').value = getMontagemProgOrderLabel(prog);
    document.getElementById('montagem-prog-client-name').value = getMontagemProgClientLabel(prog);
    document.getElementById('montagem-prog-observation').value = prog?.observation || '';

    syncMontagemProgClientRequired();
    toggleModal('montagem-prog-modal', true);
}

async function saveMontagemProg(event) {
    event.preventDefault();
    if (!canAccessMontagemProgramacao()) return;

    const startDate = document.getElementById('montagem-prog-start-date')?.value;
    const endDate = document.getElementById('montagem-prog-end-date')?.value;
    const montador1 = Number(document.getElementById('montagem-prog-montador-1')?.value);
    const montador2 = Number(document.getElementById('montagem-prog-montador-2')?.value);
    const orderCode = document.getElementById('montagem-prog-order-code')?.value.trim();
    let clientName = document.getElementById('montagem-prog-client-name')?.value.trim();
    const observation = document.getElementById('montagem-prog-observation')?.value.trim() || '';

    if (!startDate || !endDate) {
        alertAppDialog('Informe as datas de início e fim.');
        return;
    }

    if (startDate > endDate) {
        alertAppDialog('A data de início não pode ser posterior à data de fim.');
        return;
    }

    if (!montador1) {
        alertAppDialog('Selecione ao menos um montador.');
        return;
    }

    if (montador2 && montador2 === montador1) {
        alertAppDialog('Selecione montadores diferentes para formar a dupla.');
        return;
    }

    let orderId = null;
    if (orderCode) {
        const order = await lookupMontagemProgOrderByCode(orderCode);
        if (!order) {
            alertAppDialog('Pedido não encontrado para o código informado.');
            return;
        }
        orderId = order.id;
        clientName = order.clientName || clientName;
    } else if (!clientName) {
        alertAppDialog('Informe o nome do cliente quando não houver código de pedido.');
        return;
    }

    const montadorIds = [montador1, montador2].filter(Boolean);
    const now = new Date().toISOString();
    const payload = {
        startDate,
        endDate,
        orderCode: orderCode || null,
        orderId,
        clientName: clientName || null,
        observation,
        updatedAt: now,
        updatedById: currentUser.id
    };

    try {
        let programacaoId = editingMontagemProgId;

        if (editingMontagemProgId) {
            const { error } = await supabaseClient
                .from('MontagemProgramacao')
                .update(payload)
                .eq('id', editingMontagemProgId);
            if (error) throw error;
        } else {
            const { data: created, error } = await supabaseClient
                .from('MontagemProgramacao')
                .insert({
                    ...payload,
                    createdById: currentUser.id
                })
                .select('id')
                .single();
            if (error) throw error;
            programacaoId = created.id;
        }

        await persistMontagemProgMontadores(programacaoId, montadorIds);
        editingMontagemProgId = null;
        toggleModal('montagem-prog-modal', false);
        await loadMontagemProgramacaoView();
        warnMontagemProgConflictsIfNeeded();
    } catch (error) {
        console.error('saveMontagemProg:', error);
        const sqlHint = error.message?.includes('MontagemProgramacao')
            ? '\n\nExecute supabase/create-montagem-programacao.sql no Supabase.'
            : '';
        alertAppDialog('Erro ao salvar montagem: ' + error.message + sqlHint);
    }
}

async function deleteMontagemProg() {
    if (!editingMontagemProgId || !canAccessMontagemProgramacao()) return;
    if (!(await confirmAppDialog('Excluir esta programação de montagem?'))) return;

    const { error } = await supabaseClient
        .from('MontagemProgramacao')
        .delete()
        .eq('id', editingMontagemProgId);

    if (error) {
        alertAppDialog('Erro ao excluir montagem: ' + error.message);
        return;
    }

    editingMontagemProgId = null;
    toggleModal('montagem-prog-modal', false);
    await loadMontagemProgramacaoView();
}

function warnMontagemProgConflictsIfNeeded() {
    const conflictMap = buildMontagemProgConflictMap(montagemProgCache);
    if (!conflictMap.size) return;

    alertAppDialog(
        'Existem montadores programados em mais de uma obra no mesmo dia. Revise as barras destacadas em amarelo.',
        { variant: 'warning', title: 'Conflito de agenda' }
    );
}

async function copyMontagemProgPreviousWeek() {
    if (!canAccessMontagemProgramacao()) return;

    const prevWeekStartKey = montagemProgToDateKey(montagemProgAddDays(montagemProgWeekAnchor, -7));
    const prevProgramacoes = await loadMontagemProgramacoesForWeek(prevWeekStartKey, false);

    if (!prevProgramacoes.length) {
        alertAppDialog('A semana anterior não possui montagens para copiar.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (montagemProgCache.length) {
        const confirmed = await confirmAppDialog(
            'A semana atual já possui montagens. Deseja copiar também as da semana anterior?'
        );
        if (!confirmed) return;
    }

    const now = new Date().toISOString();

    try {
        for (const prog of prevProgramacoes) {
            const { data: created, error } = await supabaseClient
                .from('MontagemProgramacao')
                .insert({
                    startDate: shiftMontagemProgDateKey(prog.startDate, 7),
                    endDate: shiftMontagemProgDateKey(prog.endDate, 7),
                    orderCode: prog.orderCode || null,
                    orderId: prog.orderId || null,
                    clientName: prog.clientName || null,
                    observation: prog.observation || '',
                    createdById: currentUser.id,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .select('id')
                .single();

            if (error) throw error;

            const montadorIds = getMontagemProgMontadorIds(prog);
            if (montadorIds.length) {
                await persistMontagemProgMontadores(created.id, montadorIds);
            }
        }

        await loadMontagemProgramacaoView();
        alertAppDialog(
            `${prevProgramacoes.length} montagem(ns) copiada(s) da semana anterior.`,
            { variant: 'success', title: 'Semana copiada' }
        );
        warnMontagemProgConflictsIfNeeded();
    } catch (error) {
        console.error('copyMontagemProgPreviousWeek:', error);
        const sqlHint = error.message?.includes('MontagemProgramacao')
            ? '\n\nExecute supabase/create-montagem-programacao.sql no Supabase.'
            : '';
        alertAppDialog('Erro ao copiar semana anterior: ' + error.message + sqlHint);
        await loadMontagemProgramacaoView();
    }
}

function printMontagemProgWeek() {
    const weekLabel = document.getElementById('montagem-prog-week-label')?.textContent || '';
    const printLabel = document.getElementById('montagem-prog-print-week-label');
    if (printLabel) printLabel.textContent = weekLabel;

    const filterSelect = document.getElementById('montagem-prog-montador-filter');
    const previousFilter = montagemProgMontadorFilterId;
    if (previousFilter) {
        montagemProgMontadorFilterId = null;
        if (filterSelect) filterSelect.value = '';
        renderMontagemProgWeekGrid();
    }

    document.body.classList.add('montagem-prog-printing');
    window.print();
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('montagem-prog-printing');
        if (previousFilter) {
            montagemProgMontadorFilterId = previousFilter;
            if (filterSelect) filterSelect.value = String(previousFilter);
            renderMontagemProgPalette();
            renderMontagemProgWeekGrid();
        }
    }, { once: true });
}

async function loadMontagemProgramacaoView() {
    const weekLabel = document.getElementById('montagem-prog-week-label');
    if (weekLabel) {
        weekLabel.textContent = formatMontagemProgWeekLabel(montagemProgWeekAnchor);
    }

    if (typeof loadGestaoMontadores === 'function') {
        await loadGestaoMontadores(true);
    }

    await loadMontagemProgramacoesForWeek();
    renderMontagemProgMontadorFilter();
    renderMontagemProgPalette();
    renderMontagemProgWeekGrid();
}

function showGestaoMontagemProgramacaoPanel() {
    if (!canAccessMontagemProgramacao()) {
        alertAppDialog('Somente administradores e gestores de projetos podem acessar a programação de montagem.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    hideAllGestaoPanels();
    document.getElementById('gestao-montagem-programacao-panel')?.classList.remove('hidden');
    setGestaoNavActive('montagem-programacao');
    loadMontagemProgramacaoView();
}

function updateMontagemProgramacaoNavVisibility() {
    const button = document.getElementById('gestao-nav-montagem-programacao');
    if (button) {
        button.classList.toggle('hidden', !canAccessMontagemProgramacao());
    }
}

function bindMontagemProgramacaoEvents() {
    bindMontagemProgTooltipEvents();

    document.getElementById('gestao-nav-montagem-programacao')?.addEventListener('click', () => {
        showGestaoMontagemProgramacaoPanel();
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
        montagemProgMontadorFilterId = value ? Number(value) : null;
        renderMontagemProgPalette();
        renderMontagemProgWeekGrid();
    });
    document.getElementById('montagem-prog-form')?.addEventListener('submit', saveMontagemProg);
    document.getElementById('btn-montagem-prog-delete')?.addEventListener('click', deleteMontagemProg);

    document.getElementById('montagem-prog-order-code')?.addEventListener('input', syncMontagemProgClientRequired);
    document.getElementById('montagem-prog-order-code')?.addEventListener('blur', async () => {
        const orderCode = document.getElementById('montagem-prog-order-code')?.value.trim();
        if (!orderCode) {
            syncMontagemProgClientRequired();
            return;
        }

        const order = await lookupMontagemProgOrderByCode(orderCode);
        if (order?.clientName) {
            document.getElementById('montagem-prog-client-name').value = order.clientName;
        }
        syncMontagemProgClientRequired();
    });
}

window.openMontagemProgModal = openMontagemProgModal;
