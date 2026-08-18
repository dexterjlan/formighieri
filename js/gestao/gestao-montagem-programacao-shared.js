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

const montagemProgToDateKey = toDateKey;
const montagemProgParseDateKey = parseDateKey;
const montagemProgAddDays = addDays;
const montagemProgDaysBetween = daysBetween;
const formatMontagemProgWeekLabel = formatAppWeekRangeLabel;
const formatMontagemProgDayHeader = formatAppDayMonth;
const formatMontagemProgMonthLabel = dateKey => {
    const date = parseDateKey(dateKey);
    return date ? formatAppMonthLabel(date) : '—';
};

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
    return (prog?.installers || [])
        .map(row => row.installer || { id: row.installerId, name: 'Montador' })
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
    return (prog?.cabinetMakers || [])
        .map(row => row.cabinetMaker || { id: row.cabinetMakerId, name: 'Marceneiro' })
        .filter(marceneiro => marceneiro?.id);
}

function getMontagemProgMarceneiroIds(prog) {
    return getMontagemProgMarceneiros(prog).map(marceneiro => Number(marceneiro.id));
}

function getMontagemProgMarceneiroName(cabinetMakerId) {
    const fromCache = (cabinetMakersCache || []).find(item => Number(item.id) === Number(cabinetMakerId));
    if (fromCache?.name) return fromCache.name;

    for (const prog of montagemProgCache) {
        const marceneiro = getMontagemProgMarceneiros(prog).find(item => Number(item.id) === Number(cabinetMakerId));
        if (marceneiro?.name) return marceneiro.name;
    }

    return 'Marceneiro';
}

function getMontagemProgSelectableMarceneiros() {
    return (cabinetMakersCache || []).filter(cabinetMaker => cabinetMaker.isActive !== false);
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
    if (prog?.order) return getOrderClientName(prog.order) || '';
    return prog?.client?.name || '';
}

function getMontagemProgOrderLabel(prog) {
    return prog?.order?.orderCode || '';
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

