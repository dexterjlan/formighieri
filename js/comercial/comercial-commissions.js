let comercialCommissionsLoadToken = 0;

function filterCommercialFinanceEntriesForCurrentUser(entries = []) {
    const userId = Number(currentUser?.id);
    if (!userId) return [];
    return (entries || []).filter(entry => Number(entry.consultantUserId) === userId);
}

function formatCommercialFinanceReadOnlyTierBound(value) {
    if (value == null || value === '') return '—';
    if (typeof formatSaleValue === 'function') return formatSaleValue(value);
    return String(value);
}

function formatCommercialFinanceReadOnlyTierMax(maxAmount) {
    if (maxAmount == null || maxAmount === '') return 'Sem limite';
    return formatCommercialFinanceReadOnlyTierBound(maxAmount);
}

function formatCommercialFinanceReadOnlyRatePercent(ratePercent) {
    if (ratePercent == null || ratePercent === '') return '—';
    const text = String(ratePercent).replace('.', ',');
    return `${text}%`;
}

function renderComercialCommissionsTierTable(tiers = [], caption = 'Faixas de alíquota') {
    const rows = (tiers || []).length
        ? tiers
        : (typeof getCommercialFinanceDefaultMetaTiers === 'function'
            ? getCommercialFinanceDefaultMetaTiers()
            : []);

    if (!rows.length) {
        return `<p class="text-xs text-slate-400">Nenhuma faixa cadastrada para este mês.</p>`;
    }

    const body = rows.map(tier => `
        <tr class="border-b border-slate-100 last:border-0">
            <td class="p-2 text-slate-800">${escapeHtml(formatCommercialFinanceReadOnlyTierBound(tier.minAmount))}</td>
            <td class="p-2 text-slate-800">${escapeHtml(formatCommercialFinanceReadOnlyTierMax(tier.maxAmount))}</td>
            <td class="p-2 text-slate-800 font-medium">${escapeHtml(formatCommercialFinanceReadOnlyRatePercent(tier.ratePercent))}</td>
        </tr>
    `).join('');

    return `
        <div class="space-y-2">
            <h5 class="text-xs font-bold text-slate-800">${escapeHtml(caption)}</h5>
            <div class="gestao-commercial-finance-table-wrap overflow-x-auto border border-slate-200 rounded-lg">
                <table class="gestao-commercial-finance-table w-full text-xs">
                    <thead>
                        <tr class="bg-slate-50 text-slate-500">
                            <th class="p-2 text-left font-semibold">De (R$)</th>
                            <th class="p-2 text-left font-semibold">Até (R$)</th>
                            <th class="p-2 text-left font-semibold">Alíquota</th>
                        </tr>
                    </thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        </div>
    `;
}

function renderComercialCommissionsMetaSection(target, yearMonth) {
    const label = typeof formatCommercialFinanceYearMonthLabel === 'function'
        ? formatCommercialFinanceYearMonthLabel(yearMonth)
        : yearMonth;
    const targetAmount = target?.targetAmount;
    const targetLabel = targetAmount != null && typeof formatSaleValue === 'function'
        ? formatSaleValue(targetAmount)
        : (targetAmount != null ? String(targetAmount) : '—');
    const tiers = target?.tiers?.length
        ? target.tiers
        : (typeof getCommercialFinanceDefaultMetaTiers === 'function'
            ? getCommercialFinanceDefaultMetaTiers()
            : []);
    const showManagerBlock = typeof isGestorComercial === 'function' && isGestorComercial();
    const managerTiers = target?.managerTiers?.length
        ? target.managerTiers
        : (typeof getCommercialFinanceDefaultManagerMetaTiers === 'function'
            ? getCommercialFinanceDefaultManagerMetaTiers()
            : []);

    let managerHtml = '';
    if (showManagerBlock) {
        const teamPercent = typeof formatCommercialFinancePercentForInput === 'function'
            ? formatCommercialFinancePercentForInput(target?.managerTeamSalePercent)
            : (target?.managerTeamSalePercent ?? '—');
        const bonusPercent = typeof formatCommercialFinancePercentForInput === 'function'
            ? formatCommercialFinancePercentForInput(target?.managerTargetBonusPercent)
            : (target?.managerTargetBonusPercent ?? '—');
        managerHtml = `
            <div class="border-t border-slate-100 pt-4 space-y-3">
                <p class="text-[11px] text-slate-500">Parâmetros do gestor comercial (somente leitura).</p>
                <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                        <dt class="text-[10px] font-semibold uppercase text-slate-400">% sobre vendas da equipe</dt>
                        <dd class="mt-0.5 font-medium text-slate-800">${escapeHtml(teamPercent ? `${teamPercent}%` : '—')}</dd>
                    </div>
                    <div>
                        <dt class="text-[10px] font-semibold uppercase text-slate-400">% bônus meta atingida</dt>
                        <dd class="mt-0.5 font-medium text-slate-800">${escapeHtml(bonusPercent ? `${bonusPercent}%` : '—')}</dd>
                    </div>
                </dl>
                ${renderComercialCommissionsTierTable(managerTiers, 'Faixas do gestor (vendas próprias)')}
            </div>
        `;
    }

    const noSavedMeta = !target?.id;

    return `
        <section class="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div>
                <h3 class="text-sm font-bold text-slate-900">Meta de ${escapeHtml(label)}</h3>
                <p class="text-xs text-slate-500 mt-0.5">Meta do time e faixas de comissão para vendas neste mês (consulta).</p>
            </div>
            ${noSavedMeta ? `
                <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Ainda não há meta salva para este mês. As faixas abaixo são a sugestão padrão até a equipe publicar a meta em Gestão.
                </p>
            ` : ''}
            <dl class="text-xs">
                <dt class="text-[10px] font-semibold uppercase text-slate-400">Meta do time (R$)</dt>
                <dd class="mt-0.5 text-lg font-bold text-indigo-900">${escapeHtml(targetLabel)}</dd>
            </dl>
            ${renderComercialCommissionsTierTable(tiers)}
            ${managerHtml}
        </section>
    `;
}

function renderComercialCommissionsYearTable(summary, year, userName) {
    const { monthKeys, consultants, yearTotal } = summary;
    const consultant = consultants[0];
    const displayName = userName || consultant?.consultantName || 'Você';

    if (!consultant) {
        return `
            <section class="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <h3 class="text-sm font-bold text-slate-900">Suas comissões em ${escapeHtml(String(year))}</h3>
                <p class="text-xs text-slate-500">Valores por mês de pagamento da comissão (após fechamento em Gestão).</p>
                <p class="text-xs text-slate-400 py-6 text-center">Nenhuma comissão registrada para você neste ano.</p>
            </section>
        `;
    }

    const headerCells = monthKeys.map(monthKey => `
        <th class="p-2 text-right font-semibold whitespace-nowrap">${escapeHtml(
            typeof formatCommercialFinanceMonthShortName === 'function'
                ? formatCommercialFinanceMonthShortName(monthKey.split('-')[1])
                : monthKey.split('-')[1]
        )}</th>
    `).join('');

    const bodyCells = monthKeys.map(monthKey => {
        const value = consultant.totalsByMonth[monthKey] || 0;
        return `<td class="p-2 text-right ${value ? 'text-slate-800 font-medium' : 'text-slate-300'}">${value ? escapeHtml(formatSaleValue(value)) : '—'}</td>`;
    }).join('');

    return `
        <section class="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div>
                <h3 class="text-sm font-bold text-slate-900">Suas comissões em ${escapeHtml(String(year))}</h3>
                <p class="text-xs text-slate-500 mt-0.5">Soma do valor de comissão por mês de pagamento (referência), apenas seus lançamentos.</p>
            </div>
            <div class="gestao-commercial-finance-table-wrap overflow-x-auto border border-slate-200 rounded-lg">
                <table class="gestao-commercial-finance-table gestao-commercial-finance-summary-matrix w-full text-xs">
                    <thead>
                        <tr class="bg-slate-50 text-slate-500">
                            <th class="p-2 text-left font-semibold sticky left-0 bg-slate-50 z-10">Consultor</th>
                            ${headerCells}
                            <th class="p-2 text-right font-semibold">Total ${escapeHtml(String(year))}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="p-2 font-semibold text-slate-800 whitespace-nowrap">${escapeHtml(displayName)}</td>
                            ${bodyCells}
                            <td class="p-2 text-right font-semibold text-indigo-800">${escapeHtml(formatSaleValue(consultant.yearTotal || yearTotal || 0))}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    `;
}

function setComercialCommissionsLoading(active) {
    const root = document.getElementById('comercial-commissions-content');
    if (!root) return;
    if (active) {
        root.innerHTML = '<p class="text-xs text-slate-400 text-center py-16">Carregando comissões...</p>';
    }
}

async function loadComercialCommissionsView() {
    if (!canAccessComercial()) return;

    const root = document.getElementById('comercial-commissions-content');
    if (!root) return;

    const loadToken = ++comercialCommissionsLoadToken;
    setComercialCommissionsLoading(true);

    const yearMonth = typeof getCommercialFinanceCurrentYearMonth === 'function'
        ? getCommercialFinanceCurrentYearMonth()
        : new Date().toISOString().slice(0, 7);
    const year = Number(String(yearMonth).split('-')[0]) || new Date().getFullYear();

    try {
        const targetPromise = typeof fetchCommercialFinanceMonthlyTarget === 'function'
            ? fetchCommercialFinanceMonthlyTarget(yearMonth)
            : Promise.resolve({ data: null, error: null });
        const entriesPromise = typeof fetchCommercialFinanceCommissionEntries === 'function'
            ? fetchCommercialFinanceCommissionEntries({ year })
            : Promise.resolve({ data: [], error: new Error('Módulo de comissões indisponível.') });

        const [targetResult, entriesResult] = await Promise.all([targetPromise, entriesPromise]);

        if (loadToken !== comercialCommissionsLoadToken) return;

        if (targetResult.error) {
            root.innerHTML = `<p class="text-xs text-red-600 text-center py-10">Não foi possível carregar a meta: ${escapeHtml(targetResult.error.message || 'erro')}</p>`;
            return;
        }
        if (entriesResult.error) {
            root.innerHTML = `
                <p class="text-xs text-red-600 text-center py-6">Não foi possível carregar suas comissões: ${escapeHtml(entriesResult.error.message || 'erro')}</p>
                <p class="text-[11px] text-slate-500 text-center px-4">Se o erro for de permissão, execute <code>supabase/feats/commercial-commissions-read-rls.sql</code> no Supabase SQL Editor.</p>
            `;
            return;
        }

        const userEntries = filterCommercialFinanceEntriesForCurrentUser(entriesResult.data || []);
        const summary = typeof buildCommercialFinanceAnnualConsultantSummary === 'function'
            ? buildCommercialFinanceAnnualConsultantSummary(userEntries, year)
            : { monthKeys: [], consultants: [], yearTotal: 0 };

        root.innerHTML = `
            <div class="space-y-4 p-3 md:p-4 bg-slate-50/40">
                ${renderComercialCommissionsMetaSection(targetResult.data, yearMonth)}
                ${renderComercialCommissionsYearTable(summary, year, currentUser?.name)}
            </div>
        `;
    } catch (error) {
        console.error('loadComercialCommissionsView:', error);
        if (loadToken !== comercialCommissionsLoadToken) return;
        root.innerHTML = `<p class="text-xs text-red-600 text-center py-10">Erro ao carregar: ${escapeHtml(error.message || 'erro inesperado')}</p>`;
    }
}

function bindComercialCommissionsEvents() {
    document.getElementById('comercial-section-commissions')?.addEventListener('click', () => {
        if (typeof setComercialSection === 'function') setComercialSection('commissions');
    });
}
