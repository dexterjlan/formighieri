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
let montagemProgWorkerFilter = null;
let editingMontagemProgId = null;
let montagemProgResizeState = null;
let montagemProgDragWorker = null;

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

function getMontagemProgMarceneiros(prog) {
    return (prog?.marceneiros || [])
        .map(row => row.marceneiro || { id: row.marceneiroId, name: 'Marceneiro' })
        .filter(marceneiro => marceneiro?.id);
}

function getMontagemProgMarceneiroIds(prog) {
    return getMontagemProgMarceneiros(prog).map(marceneiro => Number(marceneiro.id));
}

function getMontagemProgMarceneiroName(marceneiroId) {
    const fromCache = (marceneirosCache || []).find(item => Number(item.id) === Number(marceneiroId));
    if (fromCache?.name) return fromCache.name;

    for (const prog of montagemProgCache) {
        const marceneiro = getMontagemProgMarceneiros(prog).find(item => Number(item.id) === Number(marceneiroId));
        if (marceneiro?.name) return marceneiro.name;
    }

    return 'Marceneiro';
}

function getMontagemProgSelectableMarceneiros() {
    return (marceneirosCache || []).filter(marceneiro => marceneiro.isActive !== false);
}

function getMontagemProgCrewMembers(prog) {
    return [
        ...getMontagemProgMontadores(prog).map(montador => ({
            type: 'montador',
            id: Number(montador.id),
            name: montador.name
        })),
        ...getMontagemProgMarceneiros(prog).map(marceneiro => ({
            type: 'marceneiro',
            id: Number(marceneiro.id),
            name: marceneiro.name
        }))
    ].filter(member => member.id);
}

function formatMontagemProgCrewMemberLabel(member) {
    return member?.name || (member?.type === 'marceneiro' ? 'Marceneiro' : 'Montador');
}

function formatMontagemProgCrewLabel(members) {
    if (!members.length) return 'Montagem';
    if (members.length === 1) return formatMontagemProgCrewMemberLabel(members[0]);
    return `${formatMontagemProgCrewMemberLabel(members[0])} + ${formatMontagemProgCrewMemberLabel(members[1])}`;
}

function getMontagemProgPrimaryCrewLabel(prog) {
    return formatMontagemProgCrewLabel(getMontagemProgCrewMembers(prog));
}

function getMontagemProgWorkerFilterKey(worker) {
    return worker?.type && worker?.id ? `${worker.type}:${worker.id}` : '';
}

function parseMontagemProgWorkerFilterKey(key) {
    if (!key) return null;
    const [type, idPart] = String(key).split(':');
    const id = Number(idPart);
    if ((type !== 'montador' && type !== 'marceneiro') || !id) return null;
    return { type, id };
}

function montagemProgWorkerMatchesFilter(prog, filter) {
    if (!filter) return true;
    return getMontagemProgCrewMembers(prog).some(member =>
        member.type === filter.type && member.id === filter.id
    );
}

function getMontagemProgVisibleProgramacoes() {
    if (!montagemProgWorkerFilter) return montagemProgCache;
    return montagemProgCache.filter(prog => montagemProgWorkerMatchesFilter(prog, montagemProgWorkerFilter));
}

function shiftMontagemProgDateKey(dateKey, days) {
    const date = montagemProgParseDateKey(dateKey);
    if (!date) return dateKey;
    return montagemProgToDateKey(montagemProgAddDays(date, days));
}

function getMontagemProgClientLabel(prog) {
    return getOrderClientName(prog?.order) || prog?.clientName || '';
}

function getMontagemProgOrderLabel(prog) {
    return prog?.orderCode || prog?.order?.orderCode || '';
}

function getMontagemProgBarClientLabel(prog) {
    const clientLabel = getMontagemProgClientLabel(prog);
    return clientLabel ? `Cliente: ${clientLabel}` : 'Cliente: —';
}

function getMontagemProgBarSummary(prog) {
    const parts = [getMontagemProgPrimaryCrewLabel(prog), getMontagemProgBarClientLabel(prog)];
    const orderLabel = getMontagemProgOrderLabel(prog);
    if (orderLabel) parts.push(orderLabel);
    if (prog?.observation) parts.push(prog.observation);
    return parts.join(' · ');
}

function getMontagemProgTooltipRows(prog) {
    const members = getMontagemProgCrewMembers(prog);
    const crewLabel = members.length && members.every(member => member.type === 'marceneiro')
        ? 'Marceneiro'
        : (members.length && members.every(member => member.type === 'montador') ? 'Montador' : 'Equipe');
    const rows = [[crewLabel, getMontagemProgPrimaryCrewLabel(prog)]];
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
    const keys = getMontagemProgCrewMembers(prog)
        .map(member => `${member.type}:${member.id}`)
        .sort((left, right) => left.localeCompare(right, 'pt-BR'));
    if (!keys.length) return 'none';
    return keys.join('+');
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

function getMontagemProgSoloCrewKey(workerType, workerId) {
    return `${workerType}:${Number(workerId)}`;
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
            targetLane = lanes.find(lane => !montagemProgLaneHasPlacementOverlap(lane, placement));
        }

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
    const assignmentsByDateWorker = new Map();

    programacoes.forEach(prog => {
        const start = montagemProgParseDateKey(prog.startDate);
        const end = montagemProgParseDateKey(prog.endDate);
        if (!start || !end) return;

        const crewMembers = getMontagemProgCrewMembers(prog);
        for (let cursor = new Date(start); cursor <= end; cursor = montagemProgAddDays(cursor, 1)) {
            const dateKey = montagemProgToDateKey(cursor);
            crewMembers.forEach(member => {
                const key = `${dateKey}:${member.type}:${member.id}`;
                if (!assignmentsByDateWorker.has(key)) assignmentsByDateWorker.set(key, []);
                assignmentsByDateWorker.get(key).push(prog.id);
            });
        }
    });

    assignmentsByDateWorker.forEach(ids => {
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
    const assignmentsByDateWorker = new Map();

    programacoes.forEach(prog => {
        const start = montagemProgParseDateKey(prog.startDate);
        const end = montagemProgParseDateKey(prog.endDate);
        if (!start || !end) return;

        const crewMembers = getMontagemProgCrewMembers(prog);
        for (let cursor = new Date(start); cursor <= end; cursor = montagemProgAddDays(cursor, 1)) {
            const dateKey = montagemProgToDateKey(cursor);
            crewMembers.forEach(member => {
                const key = `${dateKey}:${member.type}:${member.id}`;
                if (!assignmentsByDateWorker.has(key)) assignmentsByDateWorker.set(key, new Set());
                assignmentsByDateWorker.get(key).add(prog.id);
            });
        }
    });

    const details = [];

    assignmentsByDateWorker.forEach((progIds, key) => {
        if (progIds.size < 2) return;

        const [dateKey, workerType, workerId] = key.split(':');
        const date = montagemProgParseDateKey(dateKey);
        const dateLabel = date
            ? date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
            : dateKey;
        const workerName = workerType === 'marceneiro'
            ? getMontagemProgMarceneiroName(workerId)
            : getMontagemProgMontadorName(workerId);
        const summaries = [...progIds]
            .map(id => {
                const prog = programacoes.find(item => Number(item.id) === Number(id));
                return prog ? getMontagemProgBarSummary(prog) : `Montagem #${id}`;
            })
            .join(' · ');

        details.push({
            sortKey: `${dateKey}:${workerName}`,
            text: `${workerName} em ${dateLabel}: ${summaries}`
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
        .select(getSalesOrderMinimalEmbedSelect())
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
            order:salesOrders(id, orderCode, clientId, consultantUserId, cliente:Cliente(nome), consultor:appUsers!consultantUserId(name)),
            montadores:MontagemProgramacaoMontador(
                id, montadorId,
                montador:Montador(id, name)
            ),
            marceneiros:MontagemProgramacaoMarceneiro(
                id, marceneiroId,
                marceneiro:Marceneiro(id, name)
            )
        `,
        `
            *,
            montadores:MontagemProgramacaoMontador(id, montadorId, montador:Montador(id, name)),
            marceneiros:MontagemProgramacaoMarceneiro(id, marceneiroId, marceneiro:Marceneiro(id, name))
        `,
        `
            *,
            montadores:MontagemProgramacaoMontador(id, montadorId),
            marceneiros:MontagemProgramacaoMarceneiro(id, marceneiroId)
        `,
        `
            *,
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

    if (programacoes.some(prog => prog.marceneiros === undefined)) {
        const ids = programacoes.map(prog => prog.id).filter(Boolean);
        if (ids.length) {
            const { data: marceneiroRows, error: marceneiroError } = await supabaseClient
                .from('MontagemProgramacaoMarceneiro')
                .select('id, programacaoId, marceneiroId, marceneiro:Marceneiro(id, name)')
                .in('programacaoId', ids);

            if (!marceneiroError) {
                const byProgId = {};
                (marceneiroRows || []).forEach(row => {
                    const progId = Number(row.programacaoId);
                    if (!byProgId[progId]) byProgId[progId] = [];
                    byProgId[progId].push(row);
                });

                programacoes = programacoes.map(prog => ({
                    ...prog,
                    marceneiros: prog.marceneiros || byProgId[Number(prog.id)] || []
                }));
            } else if (!marceneiroError.message?.includes('MontagemProgramacaoMarceneiro')) {
                console.warn('loadMontagemProgramacoesForWeek marceneiros:', marceneiroError);
            } else {
                programacoes = programacoes.map(prog => ({
                    ...prog,
                    marceneiros: prog.marceneiros || []
                }));
            }
        }
    }

    if (updateCache) montagemProgCache = programacoes;
    return programacoes;
}

function renderMontagemProgWorkerFilter() {
    const select = document.getElementById('montagem-prog-montador-filter');
    if (!select) return;

    const montadores = getMontagemProgSelectableMontadores();
    const marceneiros = getMontagemProgSelectableMarceneiros();
    const currentValue = getMontagemProgWorkerFilterKey(montagemProgWorkerFilter);

    select.innerHTML = `
        <option value="">Todos</option>
        ${montadores.length ? `
            <optgroup label="Montadores">
                ${montadores.map(montador => `
                    <option value="montador:${montador.id}">${escapeHtml(montador.name)}</option>
                `).join('')}
            </optgroup>
        ` : ''}
        ${marceneiros.length ? `
            <optgroup label="Marceneiros">
                ${marceneiros.map(marceneiro => `
                    <option value="marceneiro:${marceneiro.id}">${escapeHtml(marceneiro.name)}</option>
                `).join('')}
            </optgroup>
        ` : ''}
    `;

    select.value = currentValue;
    if (!select.value) montagemProgWorkerFilter = null;
}

function renderMontagemProgPaletteItem(workerType, worker) {
    const filterKey = getMontagemProgWorkerFilterKey(montagemProgWorkerFilter);
    const workerKey = getMontagemProgWorkerFilterKey({ type: workerType, id: worker.id });
    const isFiltered = filterKey && workerKey === filterKey;
    const crewStyle = getMontagemProgCrewBarStyle(getMontagemProgSoloCrewKey(workerType, worker.id));
    const itemClass = workerType === 'marceneiro'
        ? 'montagem-prog-palette-item montagem-prog-palette-item--marceneiro'
        : 'montagem-prog-palette-item';

    return `
        <div class="${itemClass} ${isFiltered ? 'montagem-prog-palette-item--filtered' : ''}"
            draggable="true"
            data-worker-type="${workerType}"
            data-worker-id="${worker.id}"
            title="Arraste para a semana">
            <span class="montagem-prog-palette-item__color" style="${crewStyle}" aria-hidden="true"></span>
            <span class="montagem-prog-palette-item__grip" aria-hidden="true">⠿</span>
            <span>${escapeHtml(worker.name)}</span>
        </div>
    `;
}

function bindMontagemProgPaletteItems(palette) {
    palette.querySelectorAll('.montagem-prog-palette-item').forEach(item => {
        item.addEventListener('dragstart', event => {
            montagemProgDragWorker = {
                type: item.dataset.workerType,
                id: Number(item.dataset.workerId)
            };
            if (event.dataTransfer) {
                event.dataTransfer.setData('text/plain', getMontagemProgWorkerFilterKey(montagemProgDragWorker));
                event.dataTransfer.setData('application/x-montagem-worker-type', montagemProgDragWorker.type);
                event.dataTransfer.setData('application/x-montagem-worker-id', String(montagemProgDragWorker.id));
                event.dataTransfer.effectAllowed = 'copy';
            }
            item.classList.add('is-dragging');
            document.body.classList.add('montagem-prog-dragging');
        });
        item.addEventListener('dragend', () => {
            montagemProgDragWorker = null;
            item.classList.remove('is-dragging');
            document.body.classList.remove('montagem-prog-dragging');
            document.querySelectorAll('.montagem-prog-day-slot.is-drop-target, .montagem-prog-bar.is-drop-target, .montagem-prog-lane.is-drop-target')
                .forEach(element => element.classList.remove('is-drop-target'));
        });
        item.addEventListener('dblclick', () => {
            openMontagemProgModal(null, getMontagemProgWeekStartKey(), {
                type: item.dataset.workerType,
                id: Number(item.dataset.workerId)
            });
        });
    });
}

function renderMontagemProgPalette() {
    const palette = document.getElementById('montagem-prog-palette');
    if (!palette) return;

    const montadores = getMontagemProgSelectableMontadores();
    const marceneiros = getMontagemProgSelectableMarceneiros();

    if (!montadores.length && !marceneiros.length) {
        palette.innerHTML = '<p class="text-[11px] text-amber-700">Cadastre montadores ou marceneiros ativos em Gestão.</p>';
        return;
    }

    const sections = [];

    if (montadores.length) {
        sections.push(`
            <p class="montagem-prog-palette-section-label">Montadores</p>
            <div class="space-y-1.5">
                ${montadores.map(montador => renderMontagemProgPaletteItem('montador', montador)).join('')}
            </div>
        `);
    }

    if (marceneiros.length) {
        sections.push(`
            <p class="montagem-prog-palette-section-label ${montadores.length ? 'mt-3' : ''}">Marceneiros</p>
            <div class="space-y-1.5">
                ${marceneiros.map(marceneiro => renderMontagemProgPaletteItem('marceneiro', marceneiro)).join('')}
            </div>
        `);
    }

    palette.innerHTML = sections.join('');
    bindMontagemProgPaletteItems(palette);
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
        const slotsHtml = weekDateKeys.map((dateKey, index) => {
            const column = index + 1;
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
                        <span class="montagem-prog-bar-montadores">${escapeHtml(getMontagemProgPrimaryCrewLabel(prog))}</span>
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
    if (montagemProgWorkerFilter && !visibleProgramacoes.length) {
        if (!emptyState) {
            const message = document.createElement('p');
            message.id = 'montagem-prog-empty-filter';
            message.className = 'montagem-prog-empty-filter text-xs text-slate-400 text-center py-4';
            message.textContent = 'Nenhuma montagem para o responsável selecionado nesta semana.';
            grid.insertAdjacentElement('afterend', message);
        }
    } else {
        emptyState?.remove();
    }

    bindMontagemProgWeekInteractions(grid);
}

function getMontagemProgDragWorkerFromEvent(event) {
    const type = event.dataTransfer?.getData('application/x-montagem-worker-type')
        || montagemProgDragWorker?.type;
    const id = Number(
        event.dataTransfer?.getData('application/x-montagem-worker-id')
        || montagemProgDragWorker?.id
    );

    if (type && id && (type === 'montador' || type === 'marceneiro')) {
        return { type, id };
    }

    const legacyMontadorId = Number(
        event.dataTransfer?.getData('application/x-montagem-montador-id')
        || event.dataTransfer?.getData('text/plain')
    );
    if (legacyMontadorId) {
        return { type: 'montador', id: legacyMontadorId };
    }

    return null;
}

function clearMontagemProgDropTargets(grid) {
    grid?.querySelectorAll('.montagem-prog-day-slot.is-drop-target, .montagem-prog-bar.is-drop-target, .montagem-prog-lane.is-drop-target')
        .forEach(element => element.classList.remove('is-drop-target'));
}

function updateMontagemProgDropTargetHighlight(event, grid) {
    clearMontagemProgDropTargets(grid);

    const bar = event.target.closest('.montagem-prog-bar');
    if (bar) {
        bar.classList.add('is-drop-target');
        return;
    }

    const slot = getMontagemProgDropTargetSlot(event.clientX, event.clientY, grid);
    if (slot) {
        slot.classList.add('is-drop-target');
        return;
    }

    const lane = getMontagemProgLaneFromPointer(event.clientY, grid);
    lane?.classList.add('is-drop-target');
}

async function handleMontagemProgCalendarDrop(event, grid) {
    event.preventDefault();
    event.stopPropagation();
    clearMontagemProgDropTargets(grid);

    const worker = getMontagemProgDragWorkerFromEvent(event);
    if (!worker) return;

    const bar = event.target.closest('.montagem-prog-bar');
    if (bar) {
        await createMontagemProgFromDrop(worker, null, Number(bar.dataset.programacaoId));
        return;
    }

    const slot = getMontagemProgDropTargetSlot(event.clientX, event.clientY, grid);
    const dateKey = slot?.dataset.date || getMontagemProgDateKeyFromPointer(event.clientX, grid);
    if (!dateKey) return;

    await createMontagemProgFromDrop(worker, dateKey);
}

function bindMontagemProgWeekInteractions(grid) {
    if (grid.dataset.interactionsBound === '1') return;
    grid.dataset.interactionsBound = '1';

    const allowDrop = event => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    grid.addEventListener('dragover', event => {
        if (!montagemProgDragWorker && !event.dataTransfer?.types?.length) return;
        allowDrop(event);
        updateMontagemProgDropTargetHighlight(event, grid);
    });

    grid.addEventListener('dragleave', event => {
        const related = event.relatedTarget;
        if (related && grid.contains(related)) return;
        clearMontagemProgDropTargets(grid);
    });

    grid.addEventListener('drop', event => {
        handleMontagemProgCalendarDrop(event, grid);
    });

    grid.addEventListener('click', event => {
        const slot = event.target.closest('.montagem-prog-day-slot');
        if (slot?.dataset.date) {
            openMontagemProgModal(null, slot.dataset.date);
            return;
        }
    });

    grid.addEventListener('pointerdown', event => {
        const handle = event.target.closest('.montagem-prog-bar-resize');
        if (handle) {
            event.preventDefault();
            event.stopPropagation();
            startMontagemProgResize(handle, event);
            return;
        }

        const barBody = event.target.closest('.montagem-prog-bar-body');
        if (barBody) {
            event.preventDefault();
            event.stopPropagation();
            startMontagemProgMoveBar(barBody, event);
            return;
        }
    });

    document.getElementById('montagem-prog-week-grid')?.closest('.montagem-prog-calendar')?.addEventListener('dragover', event => {
        if (!montagemProgDragWorker && !event.dataTransfer?.types?.length) return;
        allowDrop(event);
    });

    document.getElementById('montagem-prog-week-grid')?.closest('.montagem-prog-calendar')?.addEventListener('drop', event => {
        const gridEl = document.getElementById('montagem-prog-week-grid');
        if (!gridEl || gridEl.contains(event.target)) return;
        handleMontagemProgCalendarDrop(event, gridEl);
    });
}

function getMontagemProgDateKeyFromPointer(clientX, grid) {
    const weekDateKeys = getMontagemProgWeekDateKeys();
    const slot = getMontagemProgDropTargetSlot(clientX, Number.NaN, grid);
    if (slot?.dataset.date) return slot.dataset.date;

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
        if (clientX < rect.left || clientX > rect.right) return;
        if (Number.isFinite(clientY) && (clientY < rect.top || clientY > rect.bottom)) return;
        if (!targetSlot || rect.top >= targetSlot.getBoundingClientRect().top) {
            targetSlot = slot;
        }
    });

    return targetSlot;
}

function getMontagemProgLaneFromPointer(clientY, grid) {
    const lanes = grid?.querySelectorAll('.montagem-prog-lane') || [];
    if (!lanes.length || !Number.isFinite(clientY)) return null;

    for (let index = 0; index < lanes.length; index += 1) {
        const rect = lanes[index].getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
            return lanes[index];
        }
    }

    let closestLane = lanes[0];
    let closestDistance = Infinity;

    lanes.forEach(lane => {
        const rect = lane.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(clientY - center);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestLane = lane;
        }
    });

    return closestLane;
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

let montagemProgMoveState = null;

function startMontagemProgMoveBar(button, event) {
    const programacaoId = Number(button.dataset.programacaoId);
    const prog = montagemProgCache.find(item => Number(item.id) === programacaoId);
    if (!prog) return;

    const startDt = new Date(prog.startDate + 'T00:00:00');
    const endDt = new Date(prog.endDate + 'T00:00:00');
    const durationDays = Math.max(1, Math.round((endDt - startDt) / (1000 * 60 * 60 * 24)) + 1);

    const startX = event.clientX;
    const startY = event.clientY;
    let isDragging = false;

    montagemProgMoveState = {
        programacaoId,
        durationDays,
        originalStartDate: prog.startDate,
        originalEndDate: prog.endDate,
        previewStartDate: prog.startDate,
        previewEndDate: prog.endDate
    };

    try {
        button.setPointerCapture(event.pointerId);
    } catch (_) {}

    const onPointerMove = moveEvent => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const deltaY = Math.abs(moveEvent.clientY - startY);

        if (!isDragging && (deltaX > 4 || deltaY > 4)) {
            isDragging = true;
            document.body.classList.add('montagem-prog-resizing');
        }

        if (!isDragging || !montagemProgMoveState) return;

        const grid = document.getElementById('montagem-prog-week-grid');
        const targetDateKey = getMontagemProgDateFromPointer(moveEvent.clientX, grid);
        if (!targetDateKey) return;

        const newStart = new Date(targetDateKey + 'T00:00:00');
        const newEnd = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + (durationDays - 1));

        const previewStartStr = toDateKey(newStart);
        const previewEndStr = toDateKey(newEnd);

        if (montagemProgMoveState.previewStartDate !== previewStartStr) {
            montagemProgMoveState.previewStartDate = previewStartStr;
            montagemProgMoveState.previewEndDate = previewEndStr;
            updateMontagemProgMovePreview();
        }
    };

    const onPointerUp = async upEvent => {
        try {
            button.releasePointerCapture(upEvent.pointerId);
        } catch (_) {}

        document.body.classList.remove('montagem-prog-resizing');
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);

        if (!isDragging) {
            openMontagemProgModal(prog);
            montagemProgMoveState = null;
            return;
        }

        if (!montagemProgMoveState) return;

        const { programacaoId: id, originalStartDate, originalEndDate, previewStartDate, previewEndDate } = montagemProgMoveState;
        montagemProgMoveState = null;

        if (previewStartDate === originalStartDate && previewEndDate === originalEndDate) {
            await loadMontagemProgramacaoView();
            return;
        }

        await updateMontagemProgDates(id, previewStartDate, previewEndDate);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
}

function updateMontagemProgMovePreview() {
    if (!montagemProgMoveState) return;

    const prog = montagemProgCache.find(item => Number(item.id) === montagemProgMoveState.programacaoId);
    if (!prog) return;

    const previewProg = {
        ...prog,
        startDate: montagemProgMoveState.previewStartDate,
        endDate: montagemProgMoveState.previewEndDate
    };

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

async function persistMontagemProgMarceneiros(programacaoId, marceneiroIds) {
    const uniqueIds = [...new Set(marceneiroIds.map(id => Number(id)).filter(Boolean))].slice(0, 2);

    const { data: current, error: readError } = await supabaseClient
        .from('MontagemProgramacaoMarceneiro')
        .select('id, marceneiroId')
        .eq('programacaoId', programacaoId);

    if (readError?.message?.includes('MontagemProgramacaoMarceneiro')) return;
    if (readError) throw readError;

    const keepIds = new Set(uniqueIds);
    const deleteIds = (current || [])
        .filter(row => !keepIds.has(Number(row.marceneiroId)))
        .map(row => row.id);

    if (deleteIds.length) {
        const { error } = await supabaseClient
            .from('MontagemProgramacaoMarceneiro')
            .delete()
            .in('id', deleteIds);
        if (error) throw error;
    }

    for (const marceneiroId of uniqueIds) {
        const exists = (current || []).some(row => Number(row.marceneiroId) === marceneiroId);
        if (exists) continue;

        const { error } = await supabaseClient
            .from('MontagemProgramacaoMarceneiro')
            .insert({ programacaoId, marceneiroId });
        if (error) throw error;
    }
}

async function persistMontagemProgCrew(programacaoId, montadorIds, marceneiroIds) {
    const normalizedMontadorIds = [...new Set(montadorIds.map(id => Number(id)).filter(Boolean))].slice(0, 2);
    const normalizedMarceneiroIds = [...new Set(marceneiroIds.map(id => Number(id)).filter(Boolean))].slice(0, 2);

    if (normalizedMontadorIds.length && normalizedMarceneiroIds.length) {
        throw new Error('Marceneiro e montador não podem ser agendados juntos na mesma montagem.');
    }

    await persistMontagemProgMontadores(programacaoId, normalizedMontadorIds);
    await persistMontagemProgMarceneiros(programacaoId, normalizedMarceneiroIds);
}

async function createMontagemProgFromDrop(worker, dateKey, targetProgramacaoId = null) {
    if (!canAccessMontagemProgramacao() || !worker?.type || !worker?.id) return;

    try {
        if (targetProgramacaoId) {
            const prog = montagemProgCache.find(item => Number(item.id) === Number(targetProgramacaoId));
            if (!prog) return;

            const crewMembers = getMontagemProgCrewMembers(prog);
            if (crewMembers.some(member => member.type === worker.type && member.id === worker.id)) return;

            if (crewMembers.length >= 2) {
                alertAppDialog('Esta montagem já possui dupla.', { variant: 'warning', title: 'Aviso' });
                return;
            }

            if (crewMembers.length === 1 && crewMembers[0].type !== worker.type) {
                alertAppDialog('Marceneiro e montador não podem formar dupla.', { variant: 'warning', title: 'Aviso' });
                return;
            }

            const montadorIds = getMontagemProgMontadorIds(prog);
            const marceneiroIds = getMontagemProgMarceneiroIds(prog);

            if (worker.type === 'montador') {
                await persistMontagemProgCrew(targetProgramacaoId, [...montadorIds, worker.id], marceneiroIds);
            } else {
                await persistMontagemProgCrew(targetProgramacaoId, montadorIds, [...marceneiroIds, worker.id]);
            }

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

        if (worker.type === 'montador') {
            await persistMontagemProgCrew(created.id, [worker.id], []);
        } else {
            await persistMontagemProgCrew(created.id, [], [worker.id]);
        }

        await loadMontagemProgramacaoView();

        const createdProg = montagemProgCache.find(item => Number(item.id) === Number(created.id));
        openMontagemProgModal(createdProg || {
            id: created.id,
            startDate: dateKey,
            endDate: dateKey,
            montadores: [],
            marceneiros: []
        }, null, worker);
        warnMontagemProgConflictsIfNeeded();
    } catch (error) {
        console.error('createMontagemProgFromDrop:', error);
        const sqlHint = error.message?.includes('MontagemProgramacaoMarceneiro')
            ? '\n\nExecute supabase/create-montagem-programacao-marceneiro.sql no Supabase.'
            : (error.message?.includes('MontagemProgramacao')
                ? '\n\nExecute supabase/create-montagem-programacao.sql no Supabase.'
                : '');
        alertAppDialog('Erro ao criar montagem: ' + error.message + sqlHint);
    }
}

function populateMontagemProgCrewSelects(options = {}) {
    const {
        montadorIds = [],
        marceneiroIds = [],
        selectedMontadores = [],
        selectedMarceneiros = []
    } = options;

    const montadoresById = new Map();
    getMontagemProgSelectableMontadores().forEach(montador => {
        montadoresById.set(Number(montador.id), montador);
    });

    montadorIds.forEach(montadorId => {
        const normalizedId = Number(montadorId);
        if (!normalizedId || montadoresById.has(normalizedId)) return;

        const fromProg = selectedMontadores.find(item => Number(item.id) === normalizedId);
        montadoresById.set(normalizedId, fromProg || {
            id: normalizedId,
            name: getMontagemProgMontadorName(normalizedId),
            isActive: false
        });
    });

    const marceneirosById = new Map();
    getMontagemProgSelectableMarceneiros().forEach(marceneiro => {
        marceneirosById.set(Number(marceneiro.id), marceneiro);
    });

    marceneiroIds.forEach(marceneiroId => {
        const normalizedId = Number(marceneiroId);
        if (!normalizedId || marceneirosById.has(normalizedId)) return;

        const fromProg = selectedMarceneiros.find(item => Number(item.id) === normalizedId);
        marceneirosById.set(normalizedId, fromProg || {
            id: normalizedId,
            name: getMontagemProgMarceneiroName(normalizedId),
            isActive: false
        });
    });

    const montadores = [...montadoresById.values()]
        .sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR', { sensitivity: 'base' }));
    const marceneiros = [...marceneirosById.values()]
        .sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR', { sensitivity: 'base' }));

    const montadorOptions = montadores.map(montador => {
        const inactiveSuffix = montador.isActive === false ? ' (inativo)' : '';
        return `<option value="${montador.id}">${escapeHtml(`${montador.name || 'Montador'}${inactiveSuffix}`)}</option>`;
    }).join('');

    const marceneiroOptions = marceneiros.map(marceneiro => {
        const inactiveSuffix = marceneiro.isActive === false ? ' (inativo)' : '';
        return `<option value="${marceneiro.id}">${escapeHtml(`${marceneiro.name || 'Marceneiro'}${inactiveSuffix}`)}</option>`;
    }).join('');

    const selectMontador1 = document.getElementById('montagem-prog-montador-1');
    const selectMontador2 = document.getElementById('montagem-prog-montador-2');
    const selectMarceneiro1 = document.getElementById('montagem-prog-marceneiro-1');
    const selectMarceneiro2 = document.getElementById('montagem-prog-marceneiro-2');
    if (!selectMontador1 || !selectMontador2 || !selectMarceneiro1 || !selectMarceneiro2) return;

    selectMontador1.innerHTML = `<option value="">Selecione...</option>${montadorOptions}`;
    selectMontador2.innerHTML = `<option value="">Nenhum</option>${montadorOptions}`;
    selectMarceneiro1.innerHTML = `<option value="">Selecione...</option>${marceneiroOptions}`;
    selectMarceneiro2.innerHTML = `<option value="">Nenhum</option>${marceneiroOptions}`;

    selectMontador1.value = montadorIds[0] ? String(montadorIds[0]) : '';
    selectMontador2.value = montadorIds[1] ? String(montadorIds[1]) : '';
    selectMarceneiro1.value = marceneiroIds[0] ? String(marceneiroIds[0]) : '';
    selectMarceneiro2.value = marceneiroIds[1] ? String(marceneiroIds[1]) : '';
}

function syncMontagemProgClientRequired() {
    const orderCode = document.getElementById('montagem-prog-order-code')?.value.trim();
    const requiredMarker = document.getElementById('montagem-prog-client-required');
    const clientBtn = document.getElementById('btn-montagem-prog-client-picker');
    const hasOrder = Boolean(orderCode);

    requiredMarker?.classList.toggle('hidden', hasOrder);
    if (clientBtn) {
        clientBtn.disabled = hasOrder;
    }
}

function syncMontagemProgCrewExclusivity() {
    const m1 = document.getElementById('montagem-prog-montador-1');
    const m2 = document.getElementById('montagem-prog-montador-2');
    const c1 = document.getElementById('montagem-prog-marceneiro-1');
    const c2 = document.getElementById('montagem-prog-marceneiro-2');

    if (!m1 || !m2 || !c1 || !c2) return;

    const hasMontador = Boolean(m1.value || m2.value);
    const hasMarceneiro = Boolean(c1.value || c2.value);

    if (hasMontador) {
        c1.value = '';
        c2.value = '';
        c1.disabled = true;
        c2.disabled = true;
        m1.disabled = false;
        m2.disabled = false;
    } else if (hasMarceneiro) {
        m1.value = '';
        m2.value = '';
        m1.disabled = true;
        m2.disabled = true;
        c1.disabled = false;
        c2.disabled = false;
    } else {
        m1.disabled = false;
        m2.disabled = false;
        c1.disabled = false;
        c2.disabled = false;
    }
}

async function openMontagemProgModal(prog = null, presetDate = null, presetWorker = null) {
    if (!canAccessMontagemProgramacao()) return;

    hideMontagemProgFloatingTooltip();

    if (typeof loadGestaoMontadores === 'function') {
        await loadGestaoMontadores(true);
    }
    if (typeof loadMarceneiros === 'function') {
        await loadMarceneiros(true);
    }

    editingMontagemProgId = prog?.id || null;

    const titleEl = document.getElementById('montagem-prog-modal-title');
    const deleteBtn = document.getElementById('btn-montagem-prog-delete');
    if (titleEl) {
        titleEl.textContent = editingMontagemProgId ? 'Editar montagem' : 'Nova montagem';
    }
    deleteBtn?.classList.toggle('hidden', !editingMontagemProgId);

    const montadorIds = prog ? getMontagemProgMontadorIds(prog) : [];
    const marceneiroIds = prog ? getMontagemProgMarceneiroIds(prog) : [];

    if (presetWorker?.type === 'montador' && !montadorIds.length && !marceneiroIds.length) {
        montadorIds.push(Number(presetWorker.id));
    }
    if (presetWorker?.type === 'marceneiro' && !montadorIds.length && !marceneiroIds.length) {
        marceneiroIds.push(Number(presetWorker.id));
    }

    populateMontagemProgCrewSelects({
        montadorIds,
        marceneiroIds,
        selectedMontadores: prog ? getMontagemProgMontadores(prog) : [],
        selectedMarceneiros: prog ? getMontagemProgMarceneiros(prog) : []
    });

    syncMontagemProgCrewExclusivity();

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
    const marceneiro1 = Number(document.getElementById('montagem-prog-marceneiro-1')?.value);
    const marceneiro2 = Number(document.getElementById('montagem-prog-marceneiro-2')?.value);
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

    const montadorIds = [montador1, montador2].filter(Boolean);
    const marceneiroIds = [marceneiro1, marceneiro2].filter(Boolean);

    if (!montadorIds.length && !marceneiroIds.length) {
        alertAppDialog('Selecione ao menos um montador ou marceneiro.');
        return;
    }

    if (montadorIds.length && marceneiroIds.length) {
        alertAppDialog('Ou é marceneiro ou é montador na montagem. Não é permitido misturar os dois.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (montador2 && montador2 === montador1) {
        alertAppDialog('Selecione montadores diferentes para formar a dupla.');
        return;
    }

    if (marceneiro2 && marceneiro2 === marceneiro1) {
        alertAppDialog('Selecione marceneiros diferentes para formar a dupla.');
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
        clientName = getOrderClientName(order) || clientName;
    } else if (!clientName) {
        alertAppDialog('Informe o nome do cliente quando não houver código de pedido.');
        return;
    }

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

        await persistMontagemProgCrew(programacaoId, montadorIds, marceneiroIds);
        editingMontagemProgId = null;
        toggleModal('montagem-prog-modal', false);
        await loadMontagemProgramacaoView();
        warnMontagemProgConflictsIfNeeded();
    } catch (error) {
        console.error('saveMontagemProg:', error);
        const sqlHint = error.message?.includes('MontagemProgramacaoMarceneiro')
            ? '\n\nExecute supabase/create-montagem-programacao-marceneiro.sql no Supabase.'
            : (error.message?.includes('MontagemProgramacao')
                ? '\n\nExecute supabase/create-montagem-programacao.sql no Supabase.'
                : '');
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
        'Existem montadores ou marceneiros programados em mais de uma obra no mesmo dia. Revise as barras destacadas em amarelo.',
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
            const marceneiroIds = getMontagemProgMarceneiroIds(prog);
            if (montadorIds.length || marceneiroIds.length) {
                await persistMontagemProgCrew(created.id, montadorIds, marceneiroIds);
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
    const previousFilter = montagemProgWorkerFilter;
    if (previousFilter) {
        montagemProgWorkerFilter = null;
        if (filterSelect) filterSelect.value = '';
        renderMontagemProgWeekGrid();
    }

    document.body.classList.add('montagem-prog-printing');
    window.print();
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('montagem-prog-printing');
        if (previousFilter) {
            montagemProgWorkerFilter = previousFilter;
            if (filterSelect) filterSelect.value = getMontagemProgWorkerFilterKey(previousFilter);
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
    if (typeof loadMarceneiros === 'function') {
        await loadMarceneiros(true);
    }

    await loadMontagemProgramacoesForWeek();
    renderMontagemProgWorkerFilter();
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
                if (input) input.value = cliente.nome;
                if (idInput) idInput.value = cliente.id;
            });
        }
    };
    document.getElementById('btn-montagem-prog-client-picker')?.addEventListener('click', triggerMontagemProgClientPicker);
    document.getElementById('montagem-prog-client-name')?.addEventListener('click', triggerMontagemProgClientPicker);

    document.getElementById('montagem-prog-order-code')?.addEventListener('input', async function () {
        syncMontagemProgClientRequired();
        const orderCode = this.value.trim();
        if (orderCode) {
            const order = await lookupMontagemProgOrderByCode(orderCode);
            const orderClientName = getOrderClientName(order);
            if (orderClientName) {
                document.getElementById('montagem-prog-client-name').value = orderClientName;
            }
        }
    });
    document.getElementById('montagem-prog-order-code')?.addEventListener('blur', async () => {
        const orderCode = document.getElementById('montagem-prog-order-code')?.value.trim();
        if (orderCode) {
            const order = await lookupMontagemProgOrderByCode(orderCode);
            const orderClientName = getOrderClientName(order);
            if (orderClientName) {
                document.getElementById('montagem-prog-client-name').value = orderClientName;
            }
        }
        syncMontagemProgClientRequired();
    });
}

window.openMontagemProgModal = openMontagemProgModal;
