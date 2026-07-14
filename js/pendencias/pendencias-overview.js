const PENDENCIAS_OVERVIEW_DESCRIPTIONS = {
    consultor: {
        conferencia: 'Conferências enviadas aguardando retorno do consultor.',
        'aguardando-aprovacao': 'Projetos aguardando aprovação comercial.',
        requisicoes: 'Requisições aguardando resposta do consultor.'
    },
    projetista: {
        'aguardando-projeto-tecnico': 'Projetos aguardando projeto técnico (sem responsável ou associados a você).',
        'projeto-tecnico': 'Projetos em projeto técnico associados a você.',
        'em-revisao': 'Projetos em revisão sob sua responsabilidade.',
        requisicao: 'Requisições aguardando sua resposta.',
        nomear: 'Projetos aguardando nomeação pelo projetista responsável.',
        'aguardando-ppcp': 'Projetos aguardando implantação PPCP.',
        implantacao: 'Implantações em aberto (não encerradas).',
        'aguardando-medicao': 'Pedidos com projetos aguardando medição.',
        'aguardando-planta': 'Medições com projetos aguardando planta levantada.',
        conferencias: 'Pedidos com projetos em planta levantada aguardando conferência.'
    },
    'gestor-comercial': {
        'aguardando-medicao': 'Projetos vendidos ou aguardando obra.',
        'aprovar-conferencia': 'Conferências confirmadas aguardando aprovação comercial.'
    },
    'gestor-projetos': {
        'projetos-sem-projetistas': 'Projetos aguardando projeto técnico sem responsável.'
    },
    'gestor-fabrica': {
        'aguardando-montagem-interna': 'Projetos em produção aguardando início da montagem interna.',
        'em-montagem': 'Projetos em montagem interna aguardando finalização.'
    },
    compras: {
        'enviados-compras': 'Solicitações de compra em aberto geradas pela implantação.'
    }
};

async function fetchPendenciasOverviewItemCount(sectionId, itemId) {
    try {
        switch (`${sectionId}:${itemId}`) {
            case 'consultor:conferencia': {
                const { error, projects, conferenceByProjectId } = await fetchPendenciasConsultorConferenciaProjects();
                if (error) return null;
                return groupPendenciasConsultorConferenciaByConference(projects, conferenceByProjectId).length;
            }
            case 'consultor:aguardando-aprovacao': {
                const { error, projects } = await fetchPendenciasConsultorAguardandoAprovacaoProjects();
                return error ? null : projects.length;
            }
            case 'consultor:requisicoes': {
                const { error, requests } = await fetchPendenciasConsultorRequisicaoRequests();
                return error ? null : requests.length;
            }
            case 'projetista:aguardando-projeto-tecnico': {
                const { error, unassigned, mine } = await fetchPendenciasAguardandoProjetoTecnico();
                return error ? null : (unassigned.length + mine.length);
            }
            case 'projetista:projeto-tecnico': {
                const { error, projects } = await fetchPendenciasProjetoTecnicoProjects();
                return error ? null : projects.length;
            }
            case 'projetista:em-revisao': {
                const { error, projects } = await fetchPendenciasEmRevisaoProjects();
                return error ? null : projects.length;
            }
            case 'projetista:requisicao': {
                const { error, requests } = await fetchPendenciasRequisicaoRequests();
                return error ? null : requests.length;
            }
            case 'projetista:nomear': {
                const { error, projects } = await fetchPendenciasNomearProjects();
                return error ? null : projects.length;
            }
            case 'projetista:aguardando-ppcp': {
                const { error, projects } = await fetchPendenciasProjectsByStatusName(PENDENCIAS_STATUS_AGUARDANDO_PPCP);
                return error ? null : projects.length;
            }
            case 'projetista:implantacao': {
                const { error, projects } = await fetchPendenciasImplantacoesAbertas();
                return error ? null : projects.length;
            }
            case 'projetista:aguardando-medicao': {
                const { error, orders } = await fetchPendenciasProjetistaAguardandoMedicaoOrders();
                return error ? null : orders.length;
            }
            case 'projetista:aguardando-planta': {
                const { error, medicoes } = await fetchPendenciasAguardandoPlantaMedicoes();
                return error ? null : medicoes.length;
            }
            case 'projetista:conferencias': {
                const { error, orders } = await fetchPendenciasProjetistaConferenciasOrders();
                return error ? null : orders.length;
            }
            case 'gestor-comercial:aguardando-medicao': {
                const { error, projects } = await fetchPendenciasAguardandoMedicaoProjects();
                return error ? null : projects.length;
            }
            case 'gestor-comercial:aprovar-conferencia': {
                const { error, projects, conferenceByProjectId } = await fetchPendenciasAprovarConferenciaProjects();
                if (error) return null;
                return groupPendenciasConsultorConferenciaByConference(projects, conferenceByProjectId).length;
            }
            case 'gestor-projetos:projetos-sem-projetistas': {
                const { error, projects } = await fetchPendenciasAguardandoPtSemProjetista();
                return error ? null : projects.length;
            }
            case 'gestor-fabrica:aguardando-montagem-interna': {
                const { error, projects } = await fetchPendenciasFabricaProjectsByStatusName(PENDENCIAS_STATUS_EM_PRODUCAO);
                return error ? null : projects.length;
            }
            case 'gestor-fabrica:em-montagem': {
                const { error, projects } = await fetchPendenciasFabricaProjectsByStatusName(PENDENCIAS_STATUS_MONTAGEM_INTERNA);
                return error ? null : projects.length;
            }
            case 'compras:enviados-compras': {
                const { error, items } = await fetchPendenciasEnviadosCompras();
                return error ? null : items.length;
            }
            default:
                return null;
        }
    } catch (error) {
        console.error('fetchPendenciasOverviewItemCount:', sectionId, itemId, error);
        return null;
    }
}

function getPendenciasOverviewItemDescription(sectionId, itemId) {
    return PENDENCIAS_OVERVIEW_DESCRIPTIONS[sectionId]?.[itemId] || '';
}

function formatPendenciasOverviewCount(count) {
    if (count === null || count === undefined) return '—';
    return String(count);
}

function getPendenciasOverviewCardAccentClass(count) {
    if (count === null || count === undefined) return 'border-slate-200 bg-white';
    if (count === 0) return 'border-slate-200 bg-slate-50/80';
    return 'border-violet-200 bg-violet-50/40 hover:border-violet-300 hover:bg-violet-50/70';
}

function getPendenciasOverviewCountClass(count) {
    if (count === null || count === undefined) return 'text-slate-400';
    if (count === 0) return 'text-slate-400';
    return 'text-violet-900';
}

function renderPendenciasSectionOverview(section, cards) {
    const content = document.getElementById('pendencias-content');
    if (!content) return;

    const totalCount = cards.reduce((sum, card) => (
        typeof card.count === 'number' ? sum + card.count : sum
    ), 0);
    const hasError = cards.some(card => card.count === null);

    const cardsHtml = cards.map(card => {
        const accentClass = getPendenciasOverviewCardAccentClass(card.count);
        const countClass = getPendenciasOverviewCountClass(card.count);
        const countLabel = card.count === 1 ? 'pendência' : 'pendências';

        return `
            <button type="button"
                class="pendencias-overview-card group text-left rounded-xl border p-4 shadow-sm transition-colors ${accentClass}"
                data-pendencias-overview-item="${escapeHtml(card.id)}">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 group-hover:text-violet-800">
                    ${escapeHtml(card.label)}
                </p>
                <p class="pendencias-overview-count mt-2 text-3xl font-bold tabular-nums ${countClass}">
                    ${escapeHtml(formatPendenciasOverviewCount(card.count))}
                </p>
                <p class="text-[11px] text-slate-400 mt-1">${escapeHtml(countLabel)}</p>
                ${card.description
                    ? `<p class="text-xs text-slate-500 mt-3 leading-relaxed">${escapeHtml(card.description)}</p>`
                    : ''}
            </button>
        `;
    }).join('');

    content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">${escapeHtml(section.label)}</h3>
                    <p class="text-xs text-slate-400 mt-0.5">
                        Resumo das pendências${hasError ? '' : ` — ${totalCount} no total`}.
                    </p>
                </div>
                <button type="button" id="btn-pendencias-refresh-overview"
                    class="order-tab-action-btn text-xs bg-white border border-violet-200 text-violet-800 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-50">
                    ${renderRefreshButtonInnerHtml()}
                </button>
            </div>
            <div class="p-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    ${cardsHtml}
                </div>
                ${hasError
                    ? '<p class="text-xs text-amber-600 mt-4">Alguns totais não puderam ser carregados. Tente atualizar.</p>'
                    : ''}
            </div>
        </div>
    `;

    content.querySelector('#btn-pendencias-refresh-overview')
        ?.addEventListener('click', () => loadPendenciasSectionOverview());

    content.querySelectorAll('.pendencias-overview-card').forEach(button => {
        button.addEventListener('click', async () => {
            pendenciasActiveItem = button.dataset.pendenciasOverviewItem;
            renderPendenciasSidebar();
            if (typeof persistPendenciasNavState === 'function') persistPendenciasNavState();
            loadPendenciasContent();
        });
    });
}

async function loadPendenciasSectionOverview() {
    setPendenciasActionLoading(false);

    const content = document.getElementById('pendencias-content');
    if (content) {
        content.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Carregando resumo...</p>';
    }

    const sections = getPendenciasSidebarSections();
    const section = sections.find(item => item.id === pendenciasActiveSection);

    if (!section) {
        renderPendenciasPlaceholder('Pendências', 'Nenhum menu disponível.');
        return;
    }

    const countResults = await Promise.all(
        section.items.map(async item => {
            const count = await fetchPendenciasOverviewItemCount(section.id, item.id);
            return {
                id: item.id,
                label: item.label,
                count,
                description: getPendenciasOverviewItemDescription(section.id, item.id)
            };
        })
    );

    renderPendenciasSectionOverview(section, countResults);
}
