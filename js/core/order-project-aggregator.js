const ORDER_PROJECT_AGGREGATOR_STATUS_START = 'Aguardando Projeto Técnico';
const ORDER_PROJECT_AGGREGATOR_STATUS_END = 'Aguardando Aprovação';

let orderProjectAggregatorEligibleStatusIdsCache = null;

function isOrderProjectAggregator(project) {
    return project?.isAggregator === true;
}

function isOrderProjectGroupedChild(project) {
    return Number(project?.aggregatorOrderProjectId) > 0;
}

function canManageOrderProjectAggregator(user = currentUser) {
    return (typeof isAdmin === 'function' && isAdmin(user))
        || (typeof isGestorProjetos === 'function' && isGestorProjetos(user));
}

async function getOrderProjectAggregatorEligibleStatusRange() {
    if (orderProjectAggregatorEligibleStatusIdsCache) {
        return orderProjectAggregatorEligibleStatusIdsCache;
    }

    const { data: statuses, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name, sortOrder')
        .order('sortOrder', { ascending: true });

    if (error) {
        console.error('getOrderProjectAggregatorEligibleStatusRange:', error);
        return { statusIds: [], statusById: {}, minSort: null, maxSort: null };
    }

    const startStatus = (statuses || []).find(
        status => status.name === ORDER_PROJECT_AGGREGATOR_STATUS_START
    );
    const endStatus = (statuses || []).find(
        status => status.name === ORDER_PROJECT_AGGREGATOR_STATUS_END
    );

    if (startStatus?.sortOrder == null || endStatus?.sortOrder == null) {
        return { statusIds: [], statusById: {}, minSort: null, maxSort: null };
    }

    const minSort = Number(startStatus.sortOrder);
    const maxSort = Number(endStatus.sortOrder);

    const inRange = (statuses || []).filter(status => {
        const sortOrder = Number(status.sortOrder);
        return sortOrder >= minSort && sortOrder <= maxSort;
    });

    orderProjectAggregatorEligibleStatusIdsCache = {
        statusIds: inRange.map(status => status.id),
        statusById: Object.fromEntries(inRange.map(status => [status.id, status])),
        minSort,
        maxSort
    };

    return orderProjectAggregatorEligibleStatusIdsCache;
}

function isOrderProjectStatusInAggregatorEligibleRange(project, statusById = {}) {
    const statusId = Number(project?.statusId || project?.projectStatus?.id);
    if (!statusId) return false;

    if (statusById[statusId]) return true;

    const sortOrder = getOrderProjectStatusSortOrder(project);
    if (sortOrder == null) return false;

    const cache = orderProjectAggregatorEligibleStatusIdsCache;
    if (cache?.minSort != null && cache?.maxSort != null) {
        return sortOrder >= cache.minSort && sortOrder <= cache.maxSort;
    }

    return false;
}

function isOrderProjectEligibleForAggregation(project, eligibleStatusIds = []) {
    if (!project?.id) return false;
    if (isOrderProjectAggregator(project)) return false;
    if (isOrderProjectGroupedChild(project)) return false;
    if (typeof isComplementaryOrderProject === 'function' && isComplementaryOrderProject(project)) return false;
    if (typeof isReplacedOrderProject === 'function' && isReplacedOrderProject(project)) return false;
    if (typeof isReplacementOrderProject === 'function' && isReplacementOrderProject(project)) return false;

    const statusId = Number(project.statusId || project.projectStatus?.id);
    if (!statusId) return false;

    if (eligibleStatusIds.length) {
        return eligibleStatusIds.includes(statusId);
    }

    return isOrderProjectStatusInAggregatorEligibleRange(project);
}

function excludeGroupedChildPendenciasProjects(projects) {
    return (projects || []).filter(project => !isOrderProjectGroupedChild(project));
}

function getOrderProjectAggregatorChildProjects(order, aggregatorId) {
    const normalizedId = Number(aggregatorId);
    if (!normalizedId) return [];

    return (order?.projects || []).filter(
        project => Number(project.aggregatorOrderProjectId) === normalizedId
    );
}

function getOrderProjectAggregatorChildNames(order, aggregatorId) {
    return getOrderProjectAggregatorChildProjects(order, aggregatorId)
        .map(project => project.name || project.projectCode || 'Projeto')
        .filter(Boolean);
}

function renderAggregatorProjectNoticeHtml(project) {
    if (!isOrderProjectAggregator(project)) return '';

    return `<span class="inline-flex items-center text-[10px] font-semibold text-violet-800 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full shrink-0" title="Projeto agrupador de ambientes">Agrupador</span>`;
}

function normalizeOrderProjectDeliveryDateKey(dateValue) {
    if (!dateValue) return '';
    return String(dateValue).split('T')[0];
}

function renderGroupedChildProjectNoticeHtml(project) {
    if (!isOrderProjectGroupedChild(project)) return '';

    return `<span class="inline-flex items-center text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full shrink-0" title="Ambiente vinculado a um agrupador; ações nas pendências usam o agrupador">Vinculado ao agrupador</span>`;
}

function isPendenciasAggregatorColumnQueryError(message) {
    const normalized = String(message || '');
    return normalized.includes('aggregatorOrderProjectId') || normalized.includes('isAggregator');
}

function applyPendenciasExcludedOrderProjectQueryFilters(query, options = {}) {
    const { includeComplementarFilter = true, includeGroupedChildFilter = true } = options;

    if (includeComplementarFilter) {
        query = query.eq('isComplementary', false).eq('isReplaced', false);
    }
    if (includeGroupedChildFilter) {
        query = query.is('aggregatorOrderProjectId', null);
    }

    return query;
}

function getOrderProjectAggregatorChildProjectsFromList(projects = [], aggregatorId) {
    const normalizedId = Number(aggregatorId);
    if (!normalizedId) return [];

    return (projects || []).filter(
        project => Number(project.aggregatorOrderProjectId) === normalizedId
    );
}

/** Quantidade de “projetos” para métricas quando o pai é agrupador (soma dos filhos; mínimo 1). */
function getOrderProjectScheduleUnitCount(project, projects = []) {
    if (!isOrderProjectAggregator(project)) return 1;

    const childCount = getOrderProjectAggregatorChildProjectsFromList(projects, project.id).length;
    return childCount > 0 ? childCount : 1;
}

function getOrderProjectAggregatorChildrenSaleValueSum(aggregatorId, projects = []) {
    const normalizedId = Number(aggregatorId);
    if (!normalizedId) return 0;

    return (projects || [])
        .filter(project => Number(project.aggregatorOrderProjectId) === normalizedId)
        .reduce((sum, child) => {
            const value = typeof getProjectEffectiveSaleValue === 'function'
                ? getProjectEffectiveSaleValue(child)
                : Number(child.saleValue);
            return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
}

function enrichOrderProjectsWithAggregatorChildrenSaleValue(projects = []) {
    const list = projects || [];

    return list.map(project => {
        if (!isOrderProjectAggregator(project)) return project;

        const sum = getOrderProjectAggregatorChildrenSaleValueSum(project.id, list);
        return {
            ...project,
            saleValue: sum
        };
    });
}

function prepareProgramacoesVisibleOrderProjects(projects = []) {
    const list = projects || [];
    const withAggregatorSaleValues = enrichOrderProjectsWithAggregatorChildrenSaleValue(list);

    if (typeof excludeInactivePendenciasProjects === 'function') {
        return excludeInactivePendenciasProjects(withAggregatorSaleValues);
    }

    return withAggregatorSaleValues.filter(project => !isOrderProjectGroupedChild(project));
}

/** Lista visível em relatórios sem ambientes vinculados ao agrupador (o agrupador permanece). */
function filterGestaoRelatorioOrderProjects(projects = []) {
    return (projects || []).filter(project => !isOrderProjectGroupedChild(project));
}

async function fetchOrderProjectAggregatorChildIds(aggregatorProjectId) {
    const normalizedId = Number(aggregatorProjectId);
    if (!normalizedId) return [];

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('id')
        .eq('aggregatorOrderProjectId', normalizedId);

    if (error?.message?.includes('aggregatorOrderProjectId')) return [];
    if (error) {
        console.error('fetchOrderProjectAggregatorChildIds:', error);
        return [];
    }

    return (data || []).map(row => Number(row.id)).filter(Boolean);
}

async function isOrderProjectAggregatorById(projectId) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return false;

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('isAggregator')
        .eq('id', normalizedId)
        .maybeSingle();

    if (error?.message?.includes('isAggregator')) return false;
    if (error) {
        console.error('isOrderProjectAggregatorById:', error);
        return false;
    }

    return data?.isAggregator === true;
}

/**
 * Projetista comum entre ambientes selecionados ao criar agrupador.
 * Se algum já tem projetista, todos precisam ter o mesmo; caso contrário, null.
 * @returns {{ designerId: number|null, error: string|null }}
 */
function resolveSharedOrderProjectDesignerIdForAggregation(projects) {
    const designerIds = (projects || []).map(project => {
        const id = Number(project?.designerId);
        return id > 0 ? id : null;
    });

    const withDesigner = designerIds.filter(id => id != null);
    if (!withDesigner.length) {
        return { designerId: null, error: null };
    }

    const sharedId = withDesigner[0];
    const allMatch = designerIds.every(id => id === sharedId);
    if (!allMatch) {
        return {
            designerId: null,
            error: 'Todos os projetos selecionados devem ter o mesmo projetista (ou nenhum com projetista definido).'
        };
    }

    return { designerId: sharedId, error: null };
}

/**
 * União das características dos ambientes agrupados (cada característica uma vez).
 * @returns {Promise<number[]>}
 */
async function mergeOrderProjectCharacteristicIdsForAggregation(childProjectIds = []) {
    const projectIds = [...new Set((childProjectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!projectIds.length || typeof fetchOrderProjectCharacteristicsMap !== 'function') {
        return [];
    }

    const characteristicsMap = await fetchOrderProjectCharacteristicsMap(projectIds);
    const byCharacteristicId = new Map();

    projectIds.forEach(projectId => {
        (characteristicsMap.get(projectId) || []).forEach(row => {
            const characteristicId = Number(row.characteristicId || row.characteristic?.id);
            if (!characteristicId || byCharacteristicId.has(characteristicId)) return;
            byCharacteristicId.set(characteristicId, row);
        });
    });

    return [...byCharacteristicId.values()]
        .sort((a, b) => {
            const sortA = Number(a.characteristic?.sortOrder ?? 0);
            const sortB = Number(b.characteristic?.sortOrder ?? 0);
            if (sortA !== sortB) return sortA - sortB;
            return String(a.characteristic?.name || '').localeCompare(
                String(b.characteristic?.name || ''),
                'pt-BR',
                { sensitivity: 'base' }
            );
        })
        .map(row => Number(row.characteristicId || row.characteristic?.id))
        .filter(Boolean);
}

const THIRD_PARTY_PROJECT_AGGREGATOR_STATUS_RANK = {
    Approved: 4,
    InReview: 3,
    Sent: 2,
    Open: 1
};

function getThirdPartyProjectAggregatorKeepScore(thirdPartyProject) {
    const status = String(thirdPartyProject?.status || '');
    const rank = THIRD_PARTY_PROJECT_AGGREGATOR_STATUS_RANK[status] || 0;
    const hasFile = Boolean(String(thirdPartyProject?.filePath || '').trim());
    return {
        rank,
        hasFile,
        id: Number(thirdPartyProject?.id) || 0
    };
}

function getThirdPartyProjectAggregatorMergeKey(thirdPartyProject) {
    const subtypeId = Number(thirdPartyProject?.thirdPartySubtypeId);
    if (subtypeId > 0) return `subtype:${subtypeId}`;
    const characteristicId = Number(thirdPartyProject?.projectCharacteristicId);
    if (characteristicId > 0) return `char:${characteristicId}`;
    return `id:${Number(thirdPartyProject?.id) || 0}`;
}

/**
 * Move projetos de terceiros dos ambientes agrupados para o agrupador.
 * Mesmo subtipo/característica: mantém o mais avançado (com arquivo, se houver) e exclui duplicados.
 */
async function moveMergedThirdPartyProjectsToAggregatorFromChildren(
    aggregatorId,
    childProjectIds = [],
    options = {}
) {
    const normalizedAggregatorId = Number(aggregatorId);
    const projectIds = [...new Set((childProjectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!normalizedAggregatorId || !projectIds.length) {
        return { movedIds: [], deletedIds: [] };
    }

    if (typeof fetchThirdPartyProjectsByOrderProjectIds !== 'function') {
        return { movedIds: [], deletedIds: [] };
    }

    const thirdPartyProjects = await fetchThirdPartyProjectsByOrderProjectIds(projectIds);
    if (!thirdPartyProjects.length) {
        return { movedIds: [], deletedIds: [] };
    }

    const groups = new Map();
    thirdPartyProjects.forEach(project => {
        const key = getThirdPartyProjectAggregatorMergeKey(project);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(project);
    });

    const now = new Date().toISOString();
    const designerId = Number(options.designerId) || null;
    const movedIds = [];
    const deletedIds = [];

    for (const group of groups.values()) {
        const sorted = [...group].sort((a, b) => {
            const scoreA = getThirdPartyProjectAggregatorKeepScore(a);
            const scoreB = getThirdPartyProjectAggregatorKeepScore(b);
            if (scoreB.rank !== scoreA.rank) return scoreB.rank - scoreA.rank;
            if (scoreB.hasFile !== scoreA.hasFile) return scoreB.hasFile ? 1 : -1;
            return scoreA.id - scoreB.id;
        });

        const keeper = sorted[0];
        const duplicates = sorted.slice(1);
        const keeperId = Number(keeper?.id);
        if (!keeperId) continue;

        const updatePayload = {
            orderProjectId: normalizedAggregatorId,
            updatedAt: now,
            updatedById: currentUser?.id || null
        };
        if (designerId && !Number(keeper.designerId)) {
            updatePayload.designerId = designerId;
        }

        const { error: updateError } = await supabaseClient
            .from('ThirdPartyProject')
            .update(updatePayload)
            .eq('id', keeperId);

        if (updateError) {
            throw new Error(formatThirdPartyProjectMutationError?.(updateError) || updateError.message);
        }

        movedIds.push(keeperId);

        const duplicateIds = duplicates.map(row => Number(row.id)).filter(Boolean);
        if (duplicateIds.length) {
            const { error: deleteError } = await supabaseClient
                .from('ThirdPartyProject')
                .delete()
                .in('id', duplicateIds);

            if (deleteError) {
                throw new Error(formatThirdPartyProjectMutationError?.(deleteError) || deleteError.message);
            }

            deletedIds.push(...duplicateIds);
        }
    }

    return { movedIds, deletedIds };
}

/**
 * Grava no agrupador o merge das características dos filhos (e projetos de terceiros vinculados, se aplicável).
 * @returns {Promise<number[]>} ids de características aplicados
 */
async function applyMergedOrderProjectCharacteristicsToAggregator(
    aggregatorId,
    childProjectIds = [],
    options = {}
) {
    const normalizedAggregatorId = Number(aggregatorId);
    const projectIds = [...new Set((childProjectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!normalizedAggregatorId || !projectIds.length) return [];

    await moveMergedThirdPartyProjectsToAggregatorFromChildren(
        normalizedAggregatorId,
        projectIds,
        options
    );

    const characteristicIds = await mergeOrderProjectCharacteristicIdsForAggregation(projectIds);
    if (characteristicIds.length && typeof replaceOrderProjectCharacteristics === 'function') {
        await replaceOrderProjectCharacteristics(normalizedAggregatorId, characteristicIds);
    }

    const orderId = Number(options.orderId);
    if (orderId && characteristicIds.length && typeof createThirdPartyProjectsForOrderProjectCharacteristics === 'function') {
        await createThirdPartyProjectsForOrderProjectCharacteristics({
            orderProjectId: normalizedAggregatorId,
            orderId,
            characteristicIds,
            designerId: options.designerId || null
        });
    }

    return characteristicIds;
}

/** IDs de projetos para o e-mail de associação do projetista (só o agrupador, não os filhos). */
function resolveDesignerAssignmentNotificationProjectIds(projectId, project = null) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return [];

    if (project && isOrderProjectGroupedChild(project)) {
        return [];
    }

    if (project && isOrderProjectAggregator(project)) {
        return [normalizedId];
    }

    return [normalizedId];
}

/**
 * Replica designerId do agrupador para os filhos vinculados (sem e-mail).
 * Retorna os ids dos filhos atualizados.
 */
async function allocateAggregatorOrderProjectCode() {
    const { data, error } = await supabaseClient.rpc('allocate_aggregator_order_project_code');

    if (error) {
        if (error.message?.includes('allocate_aggregator_order_project_code')) {
            throw new Error('Execute supabase/feats/order-project-aggregator-project-code-and-sync.sql no Supabase SQL Editor.');
        }
        throw error;
    }

    const code = String(data || '').trim();
    if (!code) {
        throw new Error('Não foi possível gerar o código do projeto agrupador.');
    }

    return code;
}

async function replicateOrderProjectAggregatorChildFields(projectId, fieldValues = {}, meta = {}, project = null) {
    const normalizedId = Number(projectId);
    if (!normalizedId) return [];

    const isAggregator = project
        ? isOrderProjectAggregator(project)
        : await isOrderProjectAggregatorById(normalizedId);

    if (!isAggregator) return [];

    const childIds = await fetchOrderProjectAggregatorChildIds(normalizedId);
    if (!childIds.length) return [];

    const allowedKeys = [
        'statusId',
        'designerId',
        'cabinetMakerId',
        'internalAssemblyStartDate',
        'internalAssemblyEndDate',
        'productionMonth'
    ];
    const payload = {};
    allowedKeys.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(fieldValues, key)) {
            payload[key] = fieldValues[key];
        }
    });

    if (!Object.keys(payload).length) return childIds;

    if (meta.updatedById) payload.updatedById = meta.updatedById;
    if (meta.updatedAt) payload.updatedAt = meta.updatedAt;

    const { error } = await supabaseClient
        .from('OrderProject')
        .update(payload)
        .in('id', childIds);

    if (error) {
        console.error('replicateOrderProjectAggregatorChildFields:', error);
        throw error;
    }

    return childIds;
}

async function applyOrderProjectDesignerAssignmentToAggregatorChildren(
    projectId,
    designerId,
    meta = {},
    project = null
) {
    return replicateOrderProjectAggregatorChildFields(
        projectId,
        { designerId: Number(designerId) || null },
        meta,
        project
    );
}

function renderPendenciasProjectNameHtml(project, nameOverride = null) {
    const name = escapeHtml(
        nameOverride
        || project?.name
        || project?.orderProject?.name
        || '—'
    );
    const badge = typeof renderAggregatorProjectNoticeHtml === 'function'
        ? renderAggregatorProjectNoticeHtml(project)
        : '';

    return `<span class="inline-flex flex-wrap items-center gap-1.5">${name}${badge}</span>`;
}
