const GESTAO_GANTT_STATUS_NAMES = [
    'Aguardando Projeto Técnico',
    'Projeto Técnico'
];

const GESTAO_GANTT_PROJECT_SELECT = `
    id, orderId, projectCode, name, designerId, statusId, deliveryDate, previsaoConclusaoProjetoTecnico, conclusaoProjetoTecnico,
    isComplementar, parentProjectId, isSubstituido,
    order:salesOrders(id, orderCode, clientName),
    designer:appUsers!OrderProject_designerId_fkey(id, name),
    projectStatus:OrderProjectStatus(id, name)
`;

const GESTAO_GANTT_PROJECT_SELECT_FALLBACK = `
    id, orderId, projectCode, name, designerId, statusId, deliveryDate, previsaoConclusaoProjetoTecnico,
    order:salesOrders(id, orderCode, clientName),
    designer:appUsers!OrderProject_designerId_fkey(id, name),
    projectStatus:OrderProjectStatus(id, name)
`;

const GESTAO_GANTT_LABEL_WIDTH = '14rem';
const GESTAO_GANTT_TIMELINE_MIN_WIDTH = 720;

function parseGestaoGanttDate(dateStr) {
    if (!dateStr) return null;
    const normalized = String(dateStr).slice(0, 10);
    const [year, month, day] = normalized.split('-').map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
}

function startOfGestaoGanttDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function addGestaoGanttDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function getGestaoGanttStatusName(project) {
    return project?.projectStatus?.name || '';
}

function isGestaoGanttEligibleProject(project) {
    if (!project?.designerId) return false;
    if (typeof isComplementarOrderProject === 'function' && isComplementarOrderProject(project)) return false;
    if (typeof isSubstituidoOrderProject === 'function' && isSubstituidoOrderProject(project)) return false;

    const statusName = getGestaoGanttStatusName(project);
    return GESTAO_GANTT_STATUS_NAMES.includes(statusName);
}

function compareGestaoGanttProjects(a, b) {
    const statusA = getGestaoGanttStatusName(a);
    const statusB = getGestaoGanttStatusName(b);
    const activeA = statusA === 'Projeto Técnico' ? 0 : 1;
    const activeB = statusB === 'Projeto Técnico' ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;

    const previsaoA = a.previsaoConclusaoProjetoTecnico || '9999-12-31';
    const previsaoB = b.previsaoConclusaoProjetoTecnico || '9999-12-31';
    return String(previsaoA).localeCompare(String(previsaoB));
}

function buildGestaoGanttDesignerSchedule(projects) {
    const today = startOfGestaoGanttDay(new Date());
    const sorted = [...projects].sort(compareGestaoGanttProjects);
    let cursor = today;

    return sorted.map((project, index) => {
        const previsaoDate = parseGestaoGanttDate(project.previsaoConclusaoProjetoTecnico);
        let barStart = null;
        let barEnd = null;

        if (previsaoDate) {
            barStart = index === 0 ? today : startOfGestaoGanttDay(cursor);
            if (previsaoDate >= barStart) {
                barEnd = previsaoDate;
                cursor = previsaoDate;
            } else {
                barStart = null;
            }
        }

        return {
            project,
            barStart,
            barEnd,
            queueIndex: index + 1,
            isActive: getGestaoGanttStatusName(project) === 'Projeto Técnico'
        };
    });
}

function getGestaoGanttDesignerFilterValue() {
    const select = document.getElementById('gestao-gantt-designer-filter');
    const value = select?.value;
    return value ? Number(value) : null;
}

function startOfGestaoGanttWeekMonday(date) {
    const day = startOfGestaoGanttDay(date);
    const weekday = day.getDay();
    const diff = weekday === 0 ? -6 : 1 - weekday;
    return addGestaoGanttDays(day, diff);
}

/** Domingo da semana calendário seguinte à atual. */
function endOfGestaoGanttFollowingWeek(referenceDate = new Date()) {
    const monday = startOfGestaoGanttWeekMonday(referenceDate);
    return addGestaoGanttDays(monday, 13);
}

function getGestaoGanttScheduleMaxDate(schedule) {
    let maxDate = null;

    (schedule || []).forEach(item => {
        [
            item.barStart,
            item.barEnd,
            parseGestaoGanttDate(item.project?.previsaoConclusaoProjetoTecnico),
            parseGestaoGanttDate(item.project?.deliveryDate)
        ].forEach(date => {
            if (!date) return;
            const day = startOfGestaoGanttDay(date);
            if (!maxDate || day > maxDate) maxDate = day;
        });
    });

    return maxDate;
}

function buildGestaoGanttTimelineRangeForDesigner(schedule) {
    const today = startOfGestaoGanttDay(new Date());
    const endOfFollowingWeek = endOfGestaoGanttFollowingWeek(today);
    const projectMaxDate = getGestaoGanttScheduleMaxDate(schedule);

    let maxDate = projectMaxDate && projectMaxDate > endOfFollowingWeek
        ? projectMaxDate
        : endOfFollowingWeek;

    let minDate = addGestaoGanttDays(today, -7);

    (schedule || []).forEach(item => {
        [item.barStart, item.barEnd, parseGestaoGanttDate(item.project?.deliveryDate)].forEach(date => {
            if (!date) return;
            const day = startOfGestaoGanttDay(date);
            if (day < minDate) minDate = day;
        });
    });

    if (today < minDate) minDate = addGestaoGanttDays(today, -7);
    if (today > maxDate) maxDate = today;

    maxDate = addGestaoGanttDays(maxDate, 1);

    return { start: minDate, end: maxDate, today };
}

function getGestaoGanttTimelinePercent(date, rangeStart, rangeEnd) {
    if (!date || !rangeStart || !rangeEnd) return null;
    const totalMs = rangeEnd.getTime() - rangeStart.getTime();
    if (totalMs <= 0) return 0;
    const offsetMs = date.getTime() - rangeStart.getTime();
    return Math.max(0, Math.min(100, (offsetMs / totalMs) * 100));
}

function buildGestaoGanttWeekMarkers(rangeStart, rangeEnd) {
    const markers = [];
    let cursor = startOfGestaoGanttDay(rangeStart);

    while (cursor.getDay() !== 1) {
        cursor = addGestaoGanttDays(cursor, 1);
        if (cursor > rangeEnd) break;
    }

    while (cursor <= rangeEnd) {
        markers.push(new Date(cursor));
        cursor = addGestaoGanttDays(cursor, 7);
    }

    if (!markers.length) {
        markers.push(startOfGestaoGanttDay(rangeStart));
    }

    return markers;
}

function renderGestaoGanttTimelineHeader(rangeStart, rangeEnd) {
    const markers = buildGestaoGanttWeekMarkers(rangeStart, rangeEnd);
    const todayPercent = getGestaoGanttTimelinePercent(startOfGestaoGanttDay(new Date()), rangeStart, rangeEnd);

    const labelsHtml = markers.map(marker => {
        const left = getGestaoGanttTimelinePercent(marker, rangeStart, rangeEnd);
        const label = marker.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        return `
            <div class="gestao-gantt-timeline-marker" style="left:${left}%">
                <span>${escapeHtml(label)}</span>
            </div>
        `;
    }).join('');

    const todayHtml = todayPercent == null ? '' : `
        <div class="gestao-gantt-today-line" style="left:${todayPercent}%"
            title="Hoje — ${escapeHtml(formatGestaoDate(new Date().toISOString()))}"></div>
    `;

    return `
        <div class="gestao-gantt-timeline-header flex-1 shrink-0 border-b border-slate-200 bg-slate-50/80"
            style="min-width:${GESTAO_GANTT_TIMELINE_MIN_WIDTH}px">
            <div class="gestao-gantt-timeline-header-track relative h-10">
                ${labelsHtml}
                ${todayHtml}
            </div>
        </div>
    `;
}

function renderGestaoGanttPrevisaoInput(project) {
    const maxDate = toGestaoInputDate(project.deliveryDate);
    const value = toGestaoInputDate(project.previsaoConclusaoProjetoTecnico);

    return `<input type="date"
        class="gestao-gantt-previsao-input w-full px-2 py-1 text-[11px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-600"
        data-project-id="${project.id}"
        data-delivery-date="${escapeHtml(maxDate)}"
        ${value ? `value="${escapeHtml(value)}"` : ''}
        ${maxDate ? `max="${escapeHtml(maxDate)}"` : ''}
        title="Previsão de conclusão do projeto técnico">`;
}

function renderGestaoGanttProjectRow(scheduleItem, rangeStart, rangeEnd) {
    const { project, barStart, barEnd, queueIndex, isActive } = scheduleItem;
    const deliveryDate = parseGestaoGanttDate(project.deliveryDate);
    const statusName = getGestaoGanttStatusName(project);
    const statusClass = typeof getPendenciasProjectStatusBadgeClass === 'function'
        ? getPendenciasProjectStatusBadgeClass(statusName)
        : 'bg-slate-100 text-slate-700';
    const today = startOfGestaoGanttDay(new Date());

    let barHtml = '';
    if (barStart && barEnd) {
        const left = getGestaoGanttTimelinePercent(barStart, rangeStart, rangeEnd);
        const right = getGestaoGanttTimelinePercent(barEnd, rangeStart, rangeEnd);
        const width = Math.max(0.5, (right ?? 0) - (left ?? 0));
        const overdue = barEnd < today;

        if (left != null && width > 0) {
            const startLabel = formatGestaoDate(barStart.toISOString().slice(0, 10));
            const endLabel = formatGestaoDate(barEnd.toISOString().slice(0, 10));
            barHtml = `
                <div class="gestao-gantt-bar ${overdue ? 'gestao-gantt-bar--overdue' : ''} ${isActive ? 'gestao-gantt-bar--active' : ''}"
                    style="left:${left}%;width:${width}%"
                    title="${escapeHtml(startLabel)} → ${escapeHtml(endLabel)}"></div>
            `;
        }
    }

    const deliveryHtml = deliveryDate
        ? (() => {
            const left = getGestaoGanttTimelinePercent(deliveryDate, rangeStart, rangeEnd);
            if (left == null) return '';
            return `
                <div class="gestao-gantt-milestone"
                    style="left:${left}%"
                    title="Entrega projeto técnico: ${escapeHtml(formatGestaoDate(project.deliveryDate))}"></div>
            `;
        })()
        : '';

    const orderCode = project.order?.orderCode || '—';
    const queueLabel = isActive ? 'Em execução' : `Fila #${queueIndex}`;

    return `
        <div class="gestao-gantt-row flex border-b border-slate-100 last:border-0">
            <div class="gestao-gantt-row-label shrink-0 p-2 border-r border-slate-100 bg-white"
                style="width:${GESTAO_GANTT_LABEL_WIDTH}">
                <p class="text-xs font-medium text-slate-800 truncate" title="${escapeHtml(project.name || 'Projeto')}">
                    ${escapeHtml(project.name || 'Projeto')}
                </p>
                <p class="text-[10px] text-slate-500 mt-0.5 truncate">${escapeHtml(orderCode)} · ${escapeHtml(queueLabel)}</p>
                <span class="inline-flex mt-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${statusClass}">
                    ${escapeHtml(statusName || '—')}
                </span>
                <label class="block text-[10px] text-slate-500 mt-2">Previsão</label>
                ${renderGestaoGanttPrevisaoInput(project)}
            </div>
            <div class="gestao-gantt-row-track flex-1 relative min-h-[4.5rem] bg-slate-50/40"
                style="min-width:${GESTAO_GANTT_TIMELINE_MIN_WIDTH}px">
                <div class="gestao-gantt-track absolute inset-x-2 top-1/2 -translate-y-1/2">
                    ${barHtml}
                    ${deliveryHtml}
                </div>
            </div>
        </div>
    `;
}

function groupGestaoGanttProjectsByDesigner(projects) {
    const grouped = new Map();

    (projects || []).forEach(project => {
        const designerId = Number(project.designerId);
        if (!designerId) return;

        if (!grouped.has(designerId)) {
            grouped.set(designerId, {
                designerId,
                name: project.designer?.name || 'Projetista',
                projects: []
            });
        }

        grouped.get(designerId).projects.push(project);
    });

    return [...grouped.values()]
        .map(group => ({
            ...group,
            schedule: buildGestaoGanttDesignerSchedule(group.projects)
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

function renderGestaoGanttDesignerFilterOptions(projetistas, selectedId = null) {
    const options = (projetistas || []).map(projetista => {
        const selected = Number(selectedId) === Number(projetista.id) ? 'selected' : '';
        return `<option value="${projetista.id}" ${selected}>${escapeHtml(projetista.name)}</option>`;
    }).join('');

    return `<option value="">Todos os projetistas</option>${options}`;
}

function renderGestaoGanttContent(projects, projetistas) {
    const content = document.getElementById('gestao-gantt-content');
    if (!content) return;

    const selectedDesignerId = getGestaoGanttDesignerFilterValue();
    const filteredProjects = selectedDesignerId
        ? projects.filter(project => Number(project.designerId) === selectedDesignerId)
        : projects;

    if (!filteredProjects.length) {
        content.innerHTML = `
            <p class="text-xs text-slate-400 text-center py-10">
                Nenhum projeto com projetista em Aguardando Projeto Técnico ou Projeto Técnico.
            </p>
        `;
        return;
    }

    const groups = groupGestaoGanttProjectsByDesigner(filteredProjects);

    const groupsHtml = groups.map(group => {
        const range = buildGestaoGanttTimelineRangeForDesigner(group.schedule);
        const timelineHeader = renderGestaoGanttTimelineHeader(range.start, range.end);
        const rowsHtml = group.schedule
            .map(item => renderGestaoGanttProjectRow(item, range.start, range.end))
            .join('');

        return `
            <section class="gestao-gantt-group border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div class="px-3 py-2 border-b border-slate-100 bg-indigo-50/50 flex items-center justify-between gap-2">
                    <h4 class="text-xs font-bold text-slate-900">${escapeHtml(group.name)}</h4>
                    <span class="text-[10px] text-slate-500">${group.schedule.length} projeto${group.schedule.length === 1 ? '' : 's'} · 1 por vez</span>
                </div>
                <div class="gestao-gantt-group-body overflow-x-auto">
                    <div class="gestao-gantt-grid min-w-full">
                        <div class="gestao-gantt-grid-header flex border-b border-slate-200 bg-slate-50/80">
                            <div class="shrink-0 px-2 py-2 text-[10px] font-semibold uppercase text-slate-500 border-r border-slate-200"
                                style="width:${GESTAO_GANTT_LABEL_WIDTH}">
                                Projeto
                            </div>
                            ${timelineHeader}
                        </div>
                        ${rowsHtml}
                    </div>
                </div>
            </section>
        `;
    }).join('');

    content.innerHTML = `
        <div class="space-y-4">
            <p class="text-[11px] text-slate-500">
                Cada projetista executa um projeto por vez. O próximo inicia na previsão de conclusão do anterior (ordem pela data mais próxima).
            </p>
            <div class="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                <span class="inline-flex items-center gap-1.5">
                    <span class="inline-block w-8 h-2 rounded bg-indigo-500"></span>
                    Planejamento sequencial
                </span>
                <span class="inline-flex items-center gap-1.5">
                    <span class="inline-block w-8 h-2 rounded bg-violet-600"></span>
                    Em execução
                </span>
                <span class="inline-flex items-center gap-1.5">
                    <span class="gestao-gantt-legend-milestone"></span>
                    Entrega projeto técnico
                </span>
                <span class="inline-flex items-center gap-1.5">
                    <span class="inline-block w-px h-4 bg-rose-400"></span>
                    Hoje
                </span>
            </div>
            ${groupsHtml}
        </div>
    `;

    bindGestaoGanttPrevisaoInputs(content);
}

async function fetchGestaoGanttProjects() {
    let result = await supabaseClient
        .from('OrderProject')
        .select(GESTAO_GANTT_PROJECT_SELECT)
        .not('designerId', 'is', null)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('conclusaoProjetoTecnico')
        || result.error?.message?.includes('previsaoConclusaoProjetoTecnico')
        || result.error?.message?.includes('isComplementar')
        || result.error?.message?.includes('isSubstituido')
        || result.error?.message?.includes('projectStatus')
        || result.error?.message?.includes('designer')) {
        result = await supabaseClient
            .from('OrderProject')
            .select(GESTAO_GANTT_PROJECT_SELECT_FALLBACK)
            .not('designerId', 'is', null)
            .order('name', { ascending: true });
    }

    if (result.error) return result;

    let projects = (result.data || []).filter(isGestaoGanttEligibleProject);
    const needsStatus = projects.some(project => project.statusId && !project.projectStatus);

    if (needsStatus) {
        const { data: statuses } = await supabaseClient
            .from('OrderProjectStatus')
            .select('id, name');

        const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
        projects = projects.map(project => ({
            ...project,
            projectStatus: project.projectStatus || statusById[project.statusId] || null
        })).filter(isGestaoGanttEligibleProject);
    }

    return { data: projects, error: null };
}

async function salvarGestaoGanttPrevisao(projectId, previsaoDate, deliveryDate = '') {
    if (!previsaoDate) {
        alertAppDialog('Informe a previsão de conclusão do projeto técnico.');
        return;
    }

    if (typeof isPrevisaoConclusaoProjetoTecnicoValid === 'function'
        && !isPrevisaoConclusaoProjetoTecnicoValid(previsaoDate, deliveryDate)) {
        alertAppDialog(
            'A previsão de conclusão deve ser anterior ou igual à data de entrega do projeto técnico.',
            { variant: 'warning', title: 'Aviso' }
        );
        await loadGestaoGantt();
        return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            previsaoConclusaoProjetoTecnico: previsaoDate,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .eq('id', projectId);

    if (error?.message?.includes('previsaoConclusaoProjetoTecnico')) {
        alertAppDialog(
            'O campo de previsão ainda não existe no banco. Execute supabase/create-order-project-previsao-conclusao.sql no Supabase.',
            { variant: 'warning', title: 'Aviso' }
        );
        return;
    }

    if (error) {
        alertAppDialog('Erro ao salvar previsão: ' + error.message);
        return;
    }

    await loadGestaoGantt();
}

function bindGestaoGanttPrevisaoInputs(root) {
    root.querySelectorAll('.gestao-gantt-previsao-input').forEach(input => {
        input.addEventListener('change', () => {
            salvarGestaoGanttPrevisao(
                Number(input.dataset.projectId),
                input.value,
                input.dataset.deliveryDate || ''
            );
        });
    });
}

async function loadGestaoGantt() {
    const content = document.getElementById('gestao-gantt-content');
    if (!content) return;

    content.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando Gantt...</p>';

    const selectedDesignerId = getGestaoGanttDesignerFilterValue();
    const [projectsResult, projetistas] = await Promise.all([
        fetchGestaoGanttProjects(),
        typeof loadGestaoFormOptions === 'function'
            ? loadGestaoFormOptions().then(() => gestaoProjetistasCache || [])
            : Promise.resolve(gestaoProjetistasCache || [])
    ]);

    if (projectsResult.error) {
        content.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar Gantt: ${escapeHtml(projectsResult.error.message)}</p>`;
        return;
    }

    const filter = document.getElementById('gestao-gantt-designer-filter');
    if (filter) {
        filter.innerHTML = renderGestaoGanttDesignerFilterOptions(projetistas, selectedDesignerId);
    }

    renderGestaoGanttContent(projectsResult.data || [], projetistas);
}

function bindGestaoGanttEvents() {
    document.getElementById('btn-gestao-gantt-refresh')?.addEventListener('click', loadGestaoGantt);
    document.getElementById('gestao-gantt-designer-filter')?.addEventListener('change', loadGestaoGantt);
}
