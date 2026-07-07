const GESTAO_PERFORMANCE_DEFAULT_DAYS = 30;

const GESTAO_PERFORMANCE_SUMMARY_METRICS = [
    {
        id: 'desenvolvimento',
        label: 'Desenvolvimento de projeto',
        description: 'Tempo médio desde Medição Realizada até o primeiro Aguardando Aprovação de cada projeto.',
        startStatuses: ['Medição Realizada'],
        endStatuses: ['Aguardando Aprovação']
    },
    {
        id: 'fabricacao',
        label: 'Fabricação',
        description: 'Tempo médio desde Em Produção até Expedição de cada projeto.',
        startStatuses: ['Em Produção', 'Em produção'],
        endStatuses: ['Expedição']
    }
];

const GESTAO_PERFORMANCE_AREA_METRICS = [
    {
        id: 'anteprojeto',
        label: 'Anteprojeto',
        description: 'Tempo médio desde Medição Realizada até Aguardando Projeto Técnico.',
        startStatuses: ['Medição Realizada'],
        endStatuses: ['Aguardando Projeto Técnico']
    },
    {
        id: 'projeto-tecnico',
        label: 'Projeto Técnico',
        description: 'Tempo médio desde Projeto Técnico até Aguardando Aprovação.',
        startStatuses: ['Projeto Técnico'],
        endStatuses: ['Aguardando Aprovação']
    },
    {
        id: 'aprovacao-comercial',
        label: 'Aprovação comercial',
        description: 'Tempo médio desde Aguardando Aprovação até o primeiro Em Revisão ou Aguardando PPCP.',
        startStatuses: ['Aguardando Aprovação'],
        endStatuses: ['Em Revisão', 'Em revisão', 'Aguardando PPCP']
    },
    {
        id: 'conferencia-comercial',
        label: 'Conferência comercial',
        description: 'Tempo médio desde Conferência Enviada até Aguardando Projeto Técnico.',
        startStatuses: ['Conferência Enviada'],
        endStatuses: ['Aguardando Projeto Técnico']
    }
];

const GESTAO_PERFORMANCE_BAR_COLORS = ['#6366f1', '#8b5cf6', '#0891b2', '#059669', '#d97706', '#e11d48'];

function getGestaoPerformanceDaysInput() {
    const input = document.getElementById('gestao-performance-days');
    const value = Number(input?.value);
    if (!Number.isFinite(value) || value < 1) return GESTAO_PERFORMANCE_DEFAULT_DAYS;
    return Math.min(Math.floor(value), 365);
}

function getGestaoPerformanceCutoffDate(lookbackDays) {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    return cutoff;
}

function formatGestaoPerformanceDuration(seconds) {
    if (seconds == null || !Number.isFinite(seconds)) return '—';

    const days = seconds / 86400;
    if (days >= 1) {
        const formatted = days.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        return `${formatted} dia${days >= 1.05 ? 's' : ''}`;
    }

    const hours = seconds / 3600;
    if (hours >= 1) {
        return `${hours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
    }

    const minutes = Math.max(1, Math.round(seconds / 60));
    return `${minutes} min`;
}

function formatGestaoPerformanceDaysValue(seconds) {
    if (seconds == null || !Number.isFinite(seconds)) return null;
    return seconds / 86400;
}

function buildGestaoPerformanceTimeline(historyRows, statusById) {
    const byProjectId = {};

    (historyRows || []).forEach(row => {
        const projectId = Number(row.orderProjectId);
        if (!projectId) return;

        const statusName = row.newStatus?.name || statusById[row.newStatusId]?.name;
        const changedAt = new Date(row.changedAt);
        if (!statusName || Number.isNaN(changedAt.getTime())) return;

        if (!byProjectId[projectId]) byProjectId[projectId] = [];
        byProjectId[projectId].push({ statusName, changedAt });
    });

    Object.values(byProjectId).forEach(timeline => {
        timeline.sort((a, b) => a.changedAt - b.changedAt);
    });

    return byProjectId;
}

function measureGestaoPerformanceSpan(timeline, metric) {
    if (!timeline?.length) return null;

    const startSet = new Set(metric.startStatuses);
    const endSet = new Set(metric.endStatuses);
    let startAt = null;

    for (const entry of timeline) {
        if (!startAt) {
            if (startSet.has(entry.statusName)) startAt = entry.changedAt;
            continue;
        }

        if (endSet.has(entry.statusName)) {
            const seconds = (entry.changedAt.getTime() - startAt.getTime()) / 1000;
            if (seconds < 0) return null;
            return { seconds, endAt: entry.changedAt };
        }
    }

    return null;
}

function computeGestaoPerformanceMetric(timelineByProjectId, metric, cutoffDate) {
    const samples = [];

    Object.values(timelineByProjectId).forEach(timeline => {
        const span = measureGestaoPerformanceSpan(timeline, metric);
        if (!span || span.endAt < cutoffDate) return;
        samples.push(span.seconds);
    });

    if (!samples.length) {
        return {
            ...metric,
            averageSeconds: null,
            sampleCount: 0
        };
    }

    const averageSeconds = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return {
        ...metric,
        averageSeconds,
        sampleCount: samples.length
    };
}

async function fetchGestaoPerformanceHistoryRows() {
    let result = await supabaseClient
        .from('OrderProjectStatusHistory')
        .select(`
            id, orderProjectId, newStatusId, changedAt,
            newStatus:OrderProjectStatus!newStatusId(id, name)
        `)
        .order('orderProjectId', { ascending: true })
        .order('changedAt', { ascending: true });

    if (result.error?.message?.includes('OrderProjectStatusHistory')
        || result.error?.message?.includes('newStatus')) {
        result = await supabaseClient
            .from('OrderProjectStatusHistory')
            .select('id, orderProjectId, newStatusId, changedAt')
            .order('orderProjectId', { ascending: true })
            .order('changedAt', { ascending: true });
    }

    if (result.error) return result;

    const rows = result.data || [];
    const needsEnrich = rows.some(row => row.newStatusId && !row.newStatus);

    if (!needsEnrich) return { data: rows, error: null };

    const statuses = typeof loadGestaoProjectStatuses === 'function'
        ? await loadGestaoProjectStatuses(true)
        : [];
    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));

    return {
        data: rows.map(row => ({
            ...row,
            newStatus: row.newStatus || statusById[row.newStatusId] || null
        })),
        error: null
    };
}

function renderGestaoPerformanceMetricLabel(metric) {
    const description = metric.description || `Tempo médio entre ${metric.startStatuses.join(' / ')} e ${metric.endStatuses.join(' ou ')}.`;

    return `
        <span class="gestao-performance-bar-label-text">${escapeHtml(metric.label)}</span>
        <span class="gestao-performance-help" tabindex="0" role="button" aria-label="Saiba mais sobre ${escapeHtml(metric.label)}">
            <span class="gestao-performance-help-icon" aria-hidden="true">?</span>
            <span class="gestao-performance-help-tooltip" role="tooltip">${escapeHtml(description)}</span>
        </span>
    `;
}

function renderGestaoPerformanceBarChart(metrics, emptyMessage) {
    const validMetrics = metrics.filter(metric => metric.averageSeconds != null);
    const maxDays = validMetrics.length
        ? Math.max(...validMetrics.map(metric => formatGestaoPerformanceDaysValue(metric.averageSeconds)))
        : 0;

    if (!validMetrics.length) {
        return `<p class="text-xs text-slate-400 text-center py-8">${escapeHtml(emptyMessage)}</p>`;
    }

    const rows = metrics.map((metric, index) => {
        const days = formatGestaoPerformanceDaysValue(metric.averageSeconds);
        const widthPct = days != null && maxDays > 0
            ? Math.max(6, (days / maxDays) * 100)
            : 0;
        const color = GESTAO_PERFORMANCE_BAR_COLORS[index % GESTAO_PERFORMANCE_BAR_COLORS.length];
        const valueLabel = metric.averageSeconds != null
            ? formatGestaoPerformanceDuration(metric.averageSeconds)
            : 'Sem dados';
        const sampleLabel = metric.sampleCount
            ? `${metric.sampleCount} projeto${metric.sampleCount === 1 ? '' : 's'}`
            : '0 projetos';

        return `
            <div class="gestao-performance-bar-row">
                <div class="gestao-performance-bar-meta">
                    <p class="gestao-performance-bar-label">${renderGestaoPerformanceMetricLabel(metric)}</p>
                    <p class="gestao-performance-bar-sample">${escapeHtml(sampleLabel)}</p>
                </div>
                <div class="gestao-performance-bar-track" aria-hidden="true">
                    <div class="gestao-performance-bar-fill"
                        style="width:${widthPct.toFixed(2)}%; background:${color};"></div>
                </div>
                <p class="gestao-performance-bar-value">${escapeHtml(valueLabel)}</p>
            </div>
        `;
    }).join('');

    return `<div class="gestao-performance-bar-chart space-y-4">${rows}</div>`;
}

function renderGestaoPerformancePanel(summaryMetrics, areaMetrics, lookbackDays) {
    const content = document.getElementById('gestao-performance-content');
    if (!content) return;

    content.innerHTML = `
        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h4 class="text-sm font-bold text-slate-900">Indicadores gerais</h4>
                <p class="text-xs text-slate-400 mt-0.5">Tempo médio considerando transições concluídas nos últimos ${lookbackDays} dias.</p>
            </div>
            <div class="p-4">
                ${renderGestaoPerformanceBarChart(
                    summaryMetrics,
                    'Nenhum projeto concluiu estas etapas no período selecionado.'
                )}
            </div>
        </section>

        <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h4 class="text-sm font-bold text-slate-900">Performance por área</h4>
                <p class="text-xs text-slate-400 mt-0.5">Média por etapa do fluxo comercial e técnico no mesmo período.</p>
            </div>
            <div class="p-4">
                ${renderGestaoPerformanceBarChart(
                    areaMetrics,
                    'Nenhum projeto concluiu estas etapas no período selecionado.'
                )}
            </div>
        </section>
    `;
}

async function loadGestaoPerformance() {
    const content = document.getElementById('gestao-performance-content');
    if (!content) return;

    if (!canAccessGestao()) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Sem permissão para visualizar performance.</p>';
        return;
    }

    const lookbackDays = getGestaoPerformanceDaysInput();
    content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando performance...</p>';

    const { data: historyRows, error } = await fetchGestaoPerformanceHistoryRows();

    if (error) {
        content.innerHTML = `<p class="text-xs text-red-500 text-center py-10">Erro ao carregar performance: ${escapeHtml(error.message)}</p>`;
        return;
    }

    const statuses = typeof loadGestaoProjectStatuses === 'function'
        ? await loadGestaoProjectStatuses(true)
        : [];
    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
    const cutoffDate = getGestaoPerformanceCutoffDate(lookbackDays);
    const timelineByProjectId = buildGestaoPerformanceTimeline(historyRows, statusById);

    const summaryMetrics = GESTAO_PERFORMANCE_SUMMARY_METRICS.map(metric =>
        computeGestaoPerformanceMetric(timelineByProjectId, metric, cutoffDate)
    );
    const areaMetrics = GESTAO_PERFORMANCE_AREA_METRICS.map(metric =>
        computeGestaoPerformanceMetric(timelineByProjectId, metric, cutoffDate)
    );

    renderGestaoPerformancePanel(summaryMetrics, areaMetrics, lookbackDays);
}

function bindGestaoPerformanceEvents() {
    document.getElementById('btn-gestao-performance-refresh')?.addEventListener('click', loadGestaoPerformance);
    document.getElementById('gestao-performance-days')?.addEventListener('change', loadGestaoPerformance);
    document.getElementById('gestao-performance-filter-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        loadGestaoPerformance();
    });
}
