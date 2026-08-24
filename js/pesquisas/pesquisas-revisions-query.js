const PESQUISAS_REVISIONS_STATUS_OPTIONS = ['Aberta', 'Iniciado', 'Encerrada'];
const PESQUISAS_REVISIONS_DEFAULT_CHECKED_STATUSES = ['Aberta', 'Iniciado'];
const PESQUISAS_REVISIONS_TYPE_OPTIONS = ['Comercial', 'Técnica', 'Revisor', 'Terceiro'];
const PESQUISAS_REVISIONS_TABLE_COLSPAN = 12;
let pesquisasRevisionsCache = [];

function getRevisionSearchTypeLabel(revisionType) {
    const legacyType = typeof mapDbRevisionTypeToLegacy === 'function'
        ? mapDbRevisionTypeToLegacy(revisionType)
        : revisionType;

    if (legacyType === 'comercial') return 'Comercial';
    if (legacyType === 'technical_reviewer') return 'Revisor';
    if (legacyType === 'third_party') return 'Terceiro';
    return 'Técnica';
}

function getRevisionSearchStatusLabel(revision) {
    if (revision?.status === REVISION_STATUS_CLOSED || revision?.revisionCompletedAt) {
        return 'Encerrada';
    }
    if (revision?.revisionStartedAt) return 'Iniciado';
    return 'Aberta';
}

function buildRevisionSequentialMaps(revisions = []) {
    const groups = {};

    revisions.forEach(revision => {
        const scopeId = revision.orderProjectId || revision.thirdPartyProjectId || 'unknown';
        const key = `${scopeId}:${revision.revisionType}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(revision);
    });

    const techMap = new Map();
    const reviewerMap = new Map();
    const commercialMap = new Map();
    const thirdPartyMap = new Map();

    Object.values(groups).forEach(group => {
        const sorted = [...group].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        sorted.forEach((item, index) => {
            if (item.revisionType === REVISION_TYPE_COMMERCIAL_COMMERCIAL) {
                commercialMap.set(item.id, index + 1);
            } else if (item.revisionType === REVISION_TYPE_TECHNICAL_REVISOR) {
                reviewerMap.set(item.id, index + 1);
            } else if (item.revisionType === REVISION_TYPE_THIRD_PARTY) {
                thirdPartyMap.set(item.id, index + 1);
            } else {
                techMap.set(item.id, index + 1);
            }
        });
    });

    return { techMap, reviewerMap, commercialMap, thirdPartyMap };
}

function getRevisionSearchSequential(revision, maps) {
    if (revision.revisionType === REVISION_TYPE_COMMERCIAL_COMMERCIAL) {
        return maps.commercialMap.get(revision.id) || 1;
    }
    if (revision.revisionType === REVISION_TYPE_TECHNICAL_REVISOR) {
        return maps.reviewerMap.get(revision.id) || 1;
    }
    if (revision.revisionType === REVISION_TYPE_THIRD_PARTY) {
        return maps.thirdPartyMap.get(revision.id) || 1;
    }
    return maps.techMap.get(revision.id) || 1;
}

function getRevisionSearchContext(revision) {
    const thirdPartyProject = revision.thirdPartyProject || null;
    const orderProject = revision.orderProject || thirdPartyProject?.orderProject || null;
    const order = orderProject?.order || thirdPartyProject?.order || null;
    const designer = thirdPartyProject?.designer || orderProject?.designer || null;
    const designerId = Number(
        thirdPartyProject?.designerId
        || orderProject?.designerId
        || designer?.id
        || 0
    ) || null;

    let projectName = orderProject?.name || '—';
    if (thirdPartyProject) {
        projectName = typeof getThirdPartyProjectLabel === 'function'
            ? getThirdPartyProjectLabel(thirdPartyProject)
            : (thirdPartyProject.orderProject?.name
                || thirdPartyProject.thirdPartySubtype?.name
                || projectName);
    }

    return {
        orderCode: order?.orderCode || '—',
        clientName: getOrderClientName(order) || '—',
        consultantName: getOrderConsultantNameFromRecord(order) || '—',
        designerName: designer?.name || '—',
        designerId,
        projectName,
        orderProjectId: revision.orderProjectId || orderProject?.id || null,
        thirdPartyProjectId: revision.thirdPartyProjectId || null
    };
}

async function fetchPesquisasRevisions() {
    const designerEmbed = typeof ORDER_PROJECT_DESIGNER_EMBED === 'string'
        ? ORDER_PROJECT_DESIGNER_EMBED
        : 'designer:appUsers!OrderProject_designerId_fkey(id, name)';
    const thirdPartyDesignerEmbed = typeof THIRD_PARTY_PROJECT_DESIGNER_EMBED === 'string'
        ? THIRD_PARTY_PROJECT_DESIGNER_EMBED
        : 'designer:appUsers!ThirdPartyProject_designerId_fkey(id, name)';
    const orderProjectEmbed = `
        id, name, projectCode, orderId, designerId,
        ${designerEmbed},
        order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
    `;
    const thirdPartyEmbed = `
        id, orderId, orderProjectId, status, designerId,
        ${thirdPartyDesignerEmbed},
        thirdPartySubtype:ThirdPartySubtype(id, name),
        orderProject:OrderProject(id, name, projectCode, designerId, ${designerEmbed}),
        order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
    `;

    let result = await supabaseClient
        .from('Revision')
        .select(`
            id, orderProjectId, thirdPartyProjectId, revisionType, status,
            revisionStartedAt, revisionCompletedAt, createdAt,
            orderProject:OrderProject(${orderProjectEmbed}),
            thirdPartyProject:ThirdPartyProject(${thirdPartyEmbed})
        `)
        .order('createdAt', { ascending: false });

    if (result.error && /thirdpartyproject/i.test(result.error.message || '')) {
        result = await supabaseClient
            .from('Revision')
            .select(`
                id, orderProjectId, thirdPartyProjectId, revisionType, status,
                revisionStartedAt, revisionCompletedAt, createdAt,
                orderProject:OrderProject(${orderProjectEmbed})
            `)
            .order('createdAt', { ascending: false });
    }

    if (result.error) {
        throw result.error;
    }

    const revisions = result.data || [];
    return enrichPesquisasRevisionsWithThirdPartyProjects(revisions);
}

async function enrichPesquisasRevisionsWithThirdPartyProjects(revisions = []) {
    const missingThirdPartyIds = [...new Set(
        revisions
            .filter(revision => revision.thirdPartyProjectId && !revision.thirdPartyProject)
            .map(revision => Number(revision.thirdPartyProjectId))
            .filter(Boolean)
    )];

    if (!missingThirdPartyIds.length) {
        return revisions;
    }

    let thirdPartyById = {};
    if (typeof fetchThirdPartyProjectById === 'function') {
        const projects = await Promise.all(
            missingThirdPartyIds.map(id => fetchThirdPartyProjectById(id).catch(() => null))
        );
        thirdPartyById = Object.fromEntries(
            projects.filter(Boolean).map(project => [project.id, project])
        );
    } else {
        const { data, error } = await supabaseClient
            .from('ThirdPartyProject')
            .select(`
                id, orderId, orderProjectId, status, designerId,
                designer:appUsers!ThirdPartyProject_designerId_fkey(id, name),
                thirdPartySubtype:ThirdPartySubtype(id, name),
                orderProject:OrderProject(id, name, projectCode, designerId, designer:appUsers!OrderProject_designerId_fkey(id, name)),
                order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
            `)
            .in('id', missingThirdPartyIds);

        if (!error) {
            thirdPartyById = Object.fromEntries((data || []).map(project => [project.id, project]));
        }
    }

    return revisions.map(revision => {
        if (!revision.thirdPartyProjectId || revision.thirdPartyProject) {
            return revision;
        }
        return {
            ...revision,
            thirdPartyProject: thirdPartyById[revision.thirdPartyProjectId] || null
        };
    });
}

async function openPesquisasRevisionDetail(revisionId) {
    const revision = pesquisasRevisionsCache.find(item => Number(item.id) === Number(revisionId));
    if (!revision) {
        alertAppDialog('Revisão não encontrada.');
        return;
    }

    if (revision.revisionType === REVISION_TYPE_TECHNICAL_REVISOR) {
        if (typeof openTechnicalReviewerRevisionForRevision === 'function' && revision.orderProjectId) {
            await openTechnicalReviewerRevisionForRevision(revision.orderProjectId, revision.id, true);
        }
        return;
    }

    if (revision.revisionType === REVISION_TYPE_THIRD_PARTY) {
        if (typeof openThirdPartyRevisionsHistoryModal === 'function' && revision.thirdPartyProjectId) {
            await openThirdPartyRevisionsHistoryModal(revision.thirdPartyProjectId);
        }
        return;
    }

    const approvalId = revision.orderProjectId;
    if (!approvalId) {
        alertAppDialog('Projeto da revisão não encontrado.');
        return;
    }

    if (typeof openCommercialRevisionForRevision === 'function') {
        await openCommercialRevisionForRevision(approvalId, revision.id, true);
    }
}

window.openPesquisasRevisionDetail = openPesquisasRevisionDetail;

async function searchPesquisasRevisions() {
    const tbody = document.getElementById('pesquisas-revisions-list');
    const countEl = document.getElementById('pesquisas-revisions-count');
    if (!tbody || !countEl) return;

    tbody.innerHTML = `<tr><td colspan="${PESQUISAS_REVISIONS_TABLE_COLSPAN}" class="p-4 text-xs text-slate-400 text-center">Carregando...</td></tr>`;

    try {
        if (!pesquisasRevisionsCache.length) {
            pesquisasRevisionsCache = await fetchPesquisasRevisions();
        }

        const filters = getPesquisasTextFilters('revisions');
        const consultantFilter = document.getElementById('pesquisas-revisions-consultor')?.value || '';
        const designerFilter = document.getElementById('pesquisas-revisions-projetista')?.value || '';
        const typeFilters = getCheckboxFilterValues(
            'pesquisas-revisions-tipo',
            [...PESQUISAS_REVISIONS_TYPE_OPTIONS]
        );
        const sequentialMaps = buildRevisionSequentialMaps(pesquisasRevisionsCache);

        const rows = pesquisasRevisionsCache.filter(revision => {
            const context = getRevisionSearchContext(revision);
            if (!matchesPesquisasTextFilters(revision, filters, {
                orderCode: () => context.orderCode,
                clientName: () => context.clientName,
                status: () => getRevisionSearchStatusLabel(revision)
            })) {
                return false;
            }
            if (consultantFilter && context.consultantName !== consultantFilter) return false;
            if (designerFilter && String(context.designerId || '') !== String(designerFilter)) return false;
            if (typeFilters.length && !typeFilters.includes(getRevisionSearchTypeLabel(revision.revisionType))) {
                return false;
            }
            return true;
        });

        countEl.textContent = `${rows.length} registro${rows.length === 1 ? '' : 's'}`;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="${PESQUISAS_REVISIONS_TABLE_COLSPAN}" class="p-6 text-center text-xs text-slate-400">Nenhuma revisão encontrada.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(revision => {
            const context = getRevisionSearchContext(revision);
            const statusLabel = getRevisionSearchStatusLabel(revision);
            const statusClass = statusLabel === 'Encerrada'
                ? 'bg-emerald-100 text-emerald-800'
                : statusLabel === 'Iniciado'
                    ? 'bg-sky-100 text-sky-800'
                    : 'bg-amber-100 text-amber-800';

            return `
                <tr class="border-b border-slate-100 last:border-0">
                    <td class="p-3 text-xs font-mono text-slate-600">${escapeHtml(context.orderCode)}</td>
                    <td class="p-3 text-xs text-slate-700">${escapeHtml(context.clientName)}</td>
                    <td class="p-3 text-xs text-slate-600">${escapeHtml(context.consultantName)}</td>
                    <td class="p-3 text-xs text-slate-600">${escapeHtml(context.designerName)}</td>
                    <td class="p-3 text-xs font-medium text-slate-800">${escapeHtml(context.projectName)}</td>
                    <td class="p-3 text-xs text-slate-600">${escapeHtml(getRevisionSearchTypeLabel(revision.revisionType))}</td>
                    <td class="p-3 text-xs text-slate-600 text-center">${getRevisionSearchSequential(revision, sequentialMaps)}</td>
                    <td class="p-3 text-xs">
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(statusLabel)}</span>
                    </td>
                    <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${revision.createdAt ? formatDate(revision.createdAt) : '—'}</td>
                    <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${revision.revisionStartedAt ? formatDate(revision.revisionStartedAt) : '—'}</td>
                    <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${revision.revisionCompletedAt ? formatDate(revision.revisionCompletedAt) : '—'}</td>
                    <td class="p-3 whitespace-nowrap">
                        <button type="button"
                            onclick="openPesquisasRevisionDetail(${revision.id})"
                            class="text-xs bg-indigo-100 text-indigo-800 hover:bg-indigo-200 px-2.5 py-1 rounded-lg font-medium">Detalhe</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('searchPesquisasRevisions:', error);
        tbody.innerHTML = `<tr><td colspan="${PESQUISAS_REVISIONS_TABLE_COLSPAN}" class="p-4 text-xs text-red-500 text-center">Erro ao carregar revisões: ${escapeHtml(error.message || 'Erro desconhecido')}</td></tr>`;
        countEl.textContent = '0 registros';
    }
}

async function loadPesquisasRevisionsQuery() {
    const content = document.getElementById('pesquisas-content');
    if (!content) return;

    const statusOptions = [...PESQUISAS_REVISIONS_STATUS_OPTIONS];
    const defaultCheckedStatuses = [...PESQUISAS_REVISIONS_DEFAULT_CHECKED_STATUSES];

    const tableHeadHtml = `
        <th class="text-left p-3 font-semibold">Pedido</th>
        <th class="text-left p-3 font-semibold">Cliente</th>
        <th class="text-left p-3 font-semibold">Consultor</th>
        <th class="text-left p-3 font-semibold">Projetista</th>
        <th class="text-left p-3 font-semibold">Projeto</th>
        <th class="text-left p-3 font-semibold">Tipo Requisição</th>
        <th class="text-center p-3 font-semibold">Sequencial</th>
        <th class="text-left p-3 font-semibold">Status</th>
        <th class="text-left p-3 font-semibold">Data Abertura</th>
        <th class="text-left p-3 font-semibold">Data Início</th>
        <th class="text-left p-3 font-semibold">Data Fim</th>
        <th class="text-left p-3 font-semibold w-24">Ação</th>
    `;

    const extraFiltersHtml = `
        <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Consultor</label>
            <select id="pesquisas-revisions-consultor"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-600">
                <option value="">Todos</option>
            </select>
        </div>
        <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Projetista</label>
            <select id="pesquisas-revisions-projetista"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-600">
                <option value="">Todos</option>
            </select>
        </div>
        <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Tipo Requisição</label>
            <div id="pesquisas-revisions-tipo"
                class="fm-checkbox-filter flex flex-col gap-1.5 max-h-32 overflow-y-auto border border-slate-200 rounded-lg px-3 py-2 bg-white">
                ${renderCheckboxFilterGroup('pesquisas-revisions-tipo', PESQUISAS_REVISIONS_TYPE_OPTIONS, {
                    defaultCheckedValues: PESQUISAS_REVISIONS_TYPE_OPTIONS,
                    inputName: 'revisions-tipo'
                })}
            </div>
        </div>
    `;

    content.innerHTML = renderPesquisasQueryShell(
        'revisions',
        'Revisões',
        'Consulte revisões comerciais, técnicas, do revisor e de terceiros.',
        statusOptions,
        tableHeadHtml,
        'pesquisas-revisions-list',
        defaultCheckedStatuses,
        extraFiltersHtml
    );

    bindPesquisasQueryForm('revisions', searchPesquisasRevisions, defaultCheckedStatuses, {
        selectIds: ['pesquisas-revisions-consultor', 'pesquisas-revisions-projetista'],
        checkboxFilters: [{
            containerId: 'pesquisas-revisions-tipo',
            defaultValues: [...PESQUISAS_REVISIONS_TYPE_OPTIONS]
        }]
    });

    if (typeof loadConsultantAndDesignerFilterOptions === 'function') {
        try {
            await loadConsultantAndDesignerFilterOptions({
                consultantSelectId: 'pesquisas-revisions-consultor',
                designerSelectId: 'pesquisas-revisions-projetista'
            });
        } catch (error) {
            console.warn('loadPesquisasRevisionsQuery filters:', error);
        }
    }

    await searchPesquisasRevisions();
}

window.loadPesquisasRevisionsQuery = loadPesquisasRevisionsQuery;
