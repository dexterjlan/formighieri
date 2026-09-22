const THIRD_PARTY_PROJECT_STATUS_OPEN = 'Open';
const THIRD_PARTY_PROJECT_STATUS_SENT = 'Sent';
const THIRD_PARTY_PROJECT_STATUS_IN_REVIEW = 'InReview';
const THIRD_PARTY_PROJECT_STATUS_APPROVED = 'Approved';

const THIRD_PARTY_PROJECT_DESIGNER_EMBED = 'designer:appUsers!ThirdPartyProject_designerId_fkey(id, name)';
const THIRD_PARTY_PROJECT_STATUS_HISTORY_CHANGED_BY_EMBED =
    'changedBy:appUsers!ThirdPartyProjectStatusHistory_changedById_fkey(id, name)';

const THIRD_PARTY_PROJECT_STATUS_LABELS = {
    [THIRD_PARTY_PROJECT_STATUS_OPEN]: 'Aberto',
    [THIRD_PARTY_PROJECT_STATUS_SENT]: 'Enviado',
    [THIRD_PARTY_PROJECT_STATUS_IN_REVIEW]: 'Em Revisão',
    [THIRD_PARTY_PROJECT_STATUS_APPROVED]: 'Aprovado'
};

function getThirdPartyProjectStatusLabel(status) {
    if (!status) return '—';
    return THIRD_PARTY_PROJECT_STATUS_LABELS[status] || status;
}

function isThirdPartyProjectTableMissingError(error) {
    const message = String(error?.message || '').toLowerCase();
    return (message.includes('does not exist') || message.includes('schema cache'))
        && message.includes('thirdpartyproject');
}

function formatThirdPartyProjectMutationError(error) {
    if (isThirdPartyProjectTableMissingError(error)) {
        return 'Execute supabase/create-third-party-project.sql no Supabase.';
    }
    const message = String(error?.message || '').trim();
    const normalized = message.toLowerCase();
    if (normalized.includes('projectcharacteristicid')
        && normalized.includes('not-null')) {
        return 'Execute supabase/feats/third-party-project-nullable-characteristic.sql no SQL Editor do ambiente (DEV/produção).';
    }
    return message || 'Erro ao gravar projeto de terceiros.';
}

function isThirdPartyProjectOptionalColumnError(error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('thirdpartyproject') && !message.includes('column')) {
        return false;
    }
    return message.includes('designerid')
        || message.includes('createdbyid')
        || message.includes('updatedbyid');
}

function stripThirdPartyProjectInsertOptionalFields(rows = []) {
    return rows.map(row => {
        const next = { ...row };
        delete next.designerId;
        delete next.createdById;
        delete next.updatedById;
        return next;
    });
}

async function insertThirdPartyProjectRows(rowsToInsert = []) {
    if (!rowsToInsert.length) return [];

    const selectMinimal = `
        id,
        orderId,
        orderProjectId,
        projectCharacteristicId,
        thirdPartySubtypeId,
        status,
        filePath,
        thirdPartySubtype:ThirdPartySubtype(id, name),
        orderProject:OrderProject(id, name, projectCode)
    `;

    const attempts = [
        rowsToInsert,
        stripThirdPartyProjectInsertOptionalFields(rowsToInsert)
    ];

    let lastError = null;
    for (const rows of attempts) {
        const { data, error } = await supabaseClient
            .from('ThirdPartyProject')
            .insert(rows)
            .select(selectMinimal);

        if (!error) {
            return data || [];
        }

        lastError = error;
        if (isThirdPartyProjectTableMissingError(error)) {
            throw new Error(formatThirdPartyProjectMutationError(error));
        }
        if (!isThirdPartyProjectOptionalColumnError(error)) {
            throw new Error(formatThirdPartyProjectMutationError(error));
        }
    }

    throw new Error(formatThirdPartyProjectMutationError(lastError));
}

function getThirdPartyProjectMinimalSelect(options = {}) {
    const { includeOrder = false } = options;
    const relationEmbed = includeOrder
        ? `,
            orderProject:OrderProject(id, name, projectCode),
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()})`
        : '';

    return `
        id,
        orderId,
        orderProjectId,
        projectCharacteristicId,
        thirdPartySubtypeId,
        filePath,
        projectObservation,
        designerId,
        status,
        sentAt,
        approvedAt,
        createdAt,
        updatedAt,
        projectCharacteristic:ProjectCharacteristic(id, name),
        thirdPartySubtype:ThirdPartySubtype(id, name),
        ${THIRD_PARTY_PROJECT_DESIGNER_EMBED}${relationEmbed}`;
}

function getThirdPartyProjectSelectVariants(options = {}) {
    const { includeOrder = false } = options;
    const relationEmbed = includeOrder
        ? `,
            orderProject:OrderProject(id, name, projectCode),
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()})`
        : '';

    const baseFields = `
            id,
            orderId,
            orderProjectId,
            projectCharacteristicId,
            thirdPartySubtypeId,
            filePath,
            projectObservation,
            designerId,
            status,
            sentAt,
            approvedAt,
            createdAt,
            updatedAt,
            projectCharacteristic:ProjectCharacteristic(id, name, sortOrder, isActive),
            ${THIRD_PARTY_PROJECT_DESIGNER_EMBED}`;

    return [
        `${baseFields},
            thirdPartySubtype:ThirdPartySubtype(id, name, sortOrder, isActive, projectCharacteristicId)${relationEmbed}`,
        `${baseFields},
            thirdPartySubtype:ThirdPartySubtype(id, name, sortOrder, isActive)${relationEmbed}`,
        `${baseFields},
            thirdPartySubtype:ThirdPartySubtype(id, name)${relationEmbed}`,
        getThirdPartyProjectMinimalSelect(options)
    ];
}

async function fetchThirdPartyProjectsWithFallback(buildQuery, options = {}) {
    const variants = getThirdPartyProjectSelectVariants(options);
    let lastError = null;

    for (const select of variants) {
        const { data, error } = await buildQuery(select);
        if (!error) {
            return data || [];
        }

        lastError = error;
        if (isThirdPartyProjectTableMissingError(error)) {
            return [];
        }
    }

    if (lastError) {
        throw lastError;
    }

    return [];
}

async function fetchOrderProjectIdsForOrder(orderId) {
    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return [];

    if (Number(activeOrderId) === normalizedOrderId && Array.isArray(orderProjectsCache) && orderProjectsCache.length) {
        return orderProjectsCache.map(project => Number(project.id)).filter(Boolean);
    }

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('id')
        .eq('orderId', normalizedOrderId);

    if (error) throw error;
    return (data || []).map(project => Number(project.id)).filter(Boolean);
}

function enrichThirdPartyProjectsForOrder(projects = [], orderId) {
    const normalizedOrderId = Number(orderId);
    const order = ordersCache.find(item => Number(item.id) === normalizedOrderId);
    const orderProjectsById = new Map(
        (Number(activeOrderId) === normalizedOrderId ? (orderProjectsCache || []) : [])
            .map(project => [Number(project.id), project])
    );

    return projects.map(project => {
        const orderProject = project.orderProject
            || orderProjectsById.get(Number(project.orderProjectId))
            || null;

        return {
            ...project,
            orderProject: orderProject
                ? {
                    id: orderProject.id,
                    name: orderProject.name,
                    projectCode: orderProject.projectCode
                }
                : project.orderProject,
            order: project.order || (order
                ? {
                    id: order.id,
                    orderCode: order.orderCode,
                    clientName: getOrderClientName(order)
                }
                : null)
        };
    });
}

async function fetchThirdPartyProjectsByOrderProjectIds(orderProjectIds = [], options = {}) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return [];

    return fetchThirdPartyProjectsWithFallback(
        select => supabaseClient
            .from('ThirdPartyProject')
            .select(select)
            .in('orderProjectId', uniqueIds)
            .order('orderProjectId', { ascending: true })
            .order('id', { ascending: true }),
        options
    );
}

async function fetchThirdPartyProjectsByOrderProjectId(orderProjectId) {
    const normalizedId = Number(orderProjectId);
    if (!normalizedId) return [];

    return fetchThirdPartyProjectsWithFallback(select => supabaseClient
        .from('ThirdPartyProject')
        .select(select)
        .eq('orderProjectId', normalizedId)
        .order('id', { ascending: true }));
}

async function fetchThirdPartyProjectsByOrderId(orderId) {
    const normalizedId = Number(orderId);
    if (!normalizedId) return [];

    const queryOptions = { includeOrder: true };

    let projects = await fetchThirdPartyProjectsWithFallback(
        select => supabaseClient
            .from('ThirdPartyProject')
            .select(select)
            .eq('orderId', normalizedId)
            .order('orderProjectId', { ascending: true })
            .order('id', { ascending: true }),
        queryOptions
    );

    if (!projects.length) {
        const orderProjectIds = await fetchOrderProjectIdsForOrder(normalizedId);
        if (orderProjectIds.length) {
            projects = await fetchThirdPartyProjectsByOrderProjectIds(orderProjectIds, queryOptions);
        }
    }

    return enrichThirdPartyProjectsForOrder(projects, normalizedId);
}

async function fetchThirdPartySubtypesWithCharacteristic(activeOnly = true) {
    let query = supabaseClient
        .from('ThirdPartySubtype')
        .select('id, name, sortOrder, isActive, projectCharacteristicId, projectCharacteristic:ProjectCharacteristic(id, name, sortOrder, isActive)')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
        if (error.message?.includes('projectCharacteristicId')) {
            return [];
        }
        throw error;
    }

    return (data || []).filter(subtype => Number(subtype.projectCharacteristicId));
}

async function fetchThirdPartySubtypesByIds(subtypeIds = []) {
    const uniqueIds = [...new Set(subtypeIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return [];

    const { data, error } = await supabaseClient
        .from('ThirdPartySubtype')
        .select('id, name, sortOrder, isActive, projectCharacteristicId')
        .in('id', uniqueIds);

    if (error) throw error;
    return data || [];
}

async function fetchThirdPartyProjectStatusHistory(thirdPartyProjectId) {
    const normalizedId = Number(thirdPartyProjectId);
    if (!normalizedId) return [];

    const { data, error } = await supabaseClient
        .from('ThirdPartyProjectStatusHistory')
        .select(`
            id,
            thirdPartyProjectId,
            previousStatus,
            newStatus,
            changedAt,
            changedById,
            previousStatusDurationSeconds,
            ${THIRD_PARTY_PROJECT_STATUS_HISTORY_CHANGED_BY_EMBED}
        `)
        .eq('thirdPartyProjectId', normalizedId)
        .order('changedAt', { ascending: true });

    if (error) {
        if (error.message?.includes('ThirdPartyProjectStatusHistory')) {
            throw new Error('Execute supabase/create-third-party-project.sql no Supabase.');
        }
        throw error;
    }

    return (data || []).map(entry => ({
        ...entry,
        previousStatusLabel: getThirdPartyProjectStatusLabel(entry.previousStatus),
        newStatusLabel: getThirdPartyProjectStatusLabel(entry.newStatus)
    }));
}

async function fetchOrderProjectDesignerIdsByProjectIds(orderProjectIds = []) {
    const ids = [...new Set((orderProjectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!ids.length) return {};

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('id, designerId')
        .in('id', ids);

    if (error) {
        console.warn('fetchOrderProjectDesignerIdsByProjectIds:', error);
        return {};
    }

    return Object.fromEntries(
        (data || []).map(row => [Number(row.id), Number(row.designerId) || null])
    );
}

function buildThirdPartyProjectInsertRow(baseRow, designerId = null) {
    const normalizedDesignerId = Number(designerId) || null;
    if (!normalizedDesignerId) return baseRow;
    return { ...baseRow, designerId: normalizedDesignerId };
}

async function fetchThirdPartySubtypesForCharacteristics(characteristicIds = []) {
    const uniqueIds = [...new Set(characteristicIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return [];

    const { data, error } = await supabaseClient
        .from('ThirdPartySubtype')
        .select('id, name, sortOrder, isActive, projectCharacteristicId')
        .in('projectCharacteristicId', uniqueIds)
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        if (error.message?.includes('projectCharacteristicId')) {
            return [];
        }
        throw error;
    }

    return data || [];
}

function isThirdPartySubtypeCommercialApprovalRequired(subtype) {
    if (!subtype) return false;
    const characteristicId = Number(subtype.projectCharacteristicId);
    return Boolean(characteristicId);
}

function isThirdPartyProjectCommercialApprovalRequired(project) {
    if (!project) return false;
    if (Number(project.projectCharacteristicId)) return true;
    return isThirdPartySubtypeCommercialApprovalRequired(project.thirdPartySubtype);
}

async function fetchThirdPartySubtypesWithoutCharacteristic(activeOnly = true) {
    let query = supabaseClient
        .from('ThirdPartySubtype')
        .select('id, name, sortOrder, isActive, projectCharacteristicId')
        .is('projectCharacteristicId', null)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
        if (error.message?.includes('projectCharacteristicId')) {
            return [];
        }
        throw error;
    }

    return data || [];
}

async function createThirdPartyProjectsForProcurementSubtypes(options = {}) {
    const normalizedOrderId = Number(options.orderId);
    const normalizedProjectId = Number(options.orderProjectId);
    if (!normalizedOrderId || !normalizedProjectId) {
        return { created: [], existing: [] };
    }

    let designerId = Number(options.designerId) || null;
    if (!designerId) {
        const designerIdsByProjectId = await fetchOrderProjectDesignerIdsByProjectIds([normalizedProjectId]);
        designerId = designerIdsByProjectId[normalizedProjectId] || null;
    }

    const existingProjects = await fetchThirdPartyProjectsByOrderProjectId(normalizedProjectId);
    const explicitSubtypeIds = options.thirdPartySubtypeIds;
    const createAllActive = options.createAllActiveProcurementSubtypes === true;

    let subtypes = await fetchThirdPartySubtypesWithoutCharacteristic(true);

    if (Array.isArray(explicitSubtypeIds)) {
        const idSet = new Set(explicitSubtypeIds.map(id => Number(id)).filter(Boolean));
        if (!idSet.size) {
            return { created: [], existing: existingProjects };
        }
        subtypes = subtypes.filter(subtype => idSet.has(Number(subtype.id)));
    } else if (!createAllActive) {
        return { created: [], existing: existingProjects };
    }

    if (!subtypes.length) {
        return { created: [], existing: existingProjects };
    }

    const existingKeys = new Set(
        existingProjects.map(project => `${project.orderProjectId}-${project.thirdPartySubtypeId}`)
    );

    const now = new Date().toISOString();
    const rowsToInsert = [];

    subtypes.forEach(subtype => {
        const key = `${normalizedProjectId}-${subtype.id}`;
        if (existingKeys.has(key)) return;

        rowsToInsert.push(buildThirdPartyProjectInsertRow({
            orderId: normalizedOrderId,
            orderProjectId: normalizedProjectId,
            projectCharacteristicId: null,
            thirdPartySubtypeId: subtype.id,
            status: THIRD_PARTY_PROJECT_STATUS_OPEN,
            createdAt: now,
            createdById: currentUser?.id || null,
            updatedAt: now,
            updatedById: currentUser?.id || null
        }, designerId));
        existingKeys.add(key);
    });

    if (!rowsToInsert.length) {
        return { created: [], existing: existingProjects };
    }

    const created = await insertThirdPartyProjectRows(rowsToInsert);
    for (const project of created) {
        await notifyThirdPartyProjectStatusChange(project, null);
    }

    return { created, existing: existingProjects };
}

async function createThirdPartyProjectsForSelectedSubtypes(options = {}) {
    const normalizedOrderId = Number(options.orderId);
    const normalizedProjectId = Number(options.orderProjectId);
    const selectedSubtypeIds = [...new Set(
        (options.thirdPartySubtypeIds || []).map(id => Number(id)).filter(Boolean)
    )];
    const reportProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

    if (!normalizedOrderId || !normalizedProjectId || !selectedSubtypeIds.length) {
        return { created: [], existing: [] };
    }

    reportProgress('Preparando criação dos projetos...');

    let designerId = Number(options.designerId) || null;
    if (!designerId) {
        reportProgress('Buscando responsável do ambiente...');
        const designerIdsByProjectId = await fetchOrderProjectDesignerIdsByProjectIds([normalizedProjectId]);
        designerId = designerIdsByProjectId[normalizedProjectId] || null;
    }

    reportProgress('Carregando subtipos selecionados...');
    const subtypes = await fetchThirdPartySubtypesByIds(selectedSubtypeIds);
    const subtypeById = new Map(subtypes.map(subtype => [Number(subtype.id), subtype]));

    const procurementSubtypeIds = [];
    const characteristicIds = [];

    selectedSubtypeIds.forEach(subtypeId => {
        const subtype = subtypeById.get(subtypeId);
        if (!subtype) return;
        const characteristicId = Number(subtype.projectCharacteristicId);
        if (characteristicId) {
            characteristicIds.push(characteristicId);
            return;
        }
        if (isThirdPartySubtypeCommercialApprovalRequired(subtype)) {
            throw new Error(
                `O subtipo "${subtype.name || 'Terceiro'}" está sem característica vinculada no cadastro.`
            );
        }
        procurementSubtypeIds.push(subtypeId);
    });

    const created = [];
    let existing = [];

    if (procurementSubtypeIds.length) {
        reportProgress('Criando projetos de compras (sem conferência)...');
        const procurementResult = await createThirdPartyProjectsForProcurementSubtypes({
            orderId: normalizedOrderId,
            orderProjectId: normalizedProjectId,
            designerId,
            thirdPartySubtypeIds: procurementSubtypeIds
        });
        created.push(...(procurementResult.created || []));
        existing = procurementResult.existing || existing;
    }

    const uniqueCharacteristicIds = [...new Set(characteristicIds)];
    if (uniqueCharacteristicIds.length) {
        reportProgress('Criando projetos com característica (consultor comercial)...');
        const characteristicResult = await createThirdPartyProjectsForOrderProjectCharacteristics({
            orderId: normalizedOrderId,
            orderProjectId: normalizedProjectId,
            designerId,
            characteristicIds: uniqueCharacteristicIds,
            thirdPartySubtypeIds: selectedSubtypeIds
        });
        created.push(...(characteristicResult.created || []));
        if (!existing.length) {
            existing = characteristicResult.existing || [];
        }
    }

    return { created, existing };
}

async function ensureThirdPartyProjectsForProcurementSubtypes(options = {}) {
    return createThirdPartyProjectsForProcurementSubtypes({
        ...options,
        createAllActiveProcurementSubtypes: true
    });
}

function mergeThirdPartySubtypesForApprovalModal(procurementSubtypes = [], existingProjects = []) {
    const subtypeById = new Map();

    (procurementSubtypes || []).forEach(subtype => {
        const id = Number(subtype.id);
        if (id) subtypeById.set(id, subtype);
    });

    (existingProjects || []).forEach(project => {
        const subtype = project.thirdPartySubtype;
        const id = Number(subtype?.id || project.thirdPartySubtypeId);
        if (!id) return;
        subtypeById.set(id, {
            ...subtypeById.get(id),
            ...subtype,
            id
        });
    });

    return [...subtypeById.values()].sort((a, b) => {
        const sortDiff = Number(a.sortOrder) - Number(b.sortOrder);
        if (sortDiff !== 0) return sortDiff;
        return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });
}

async function fetchThirdPartyProcurementSubtypeSelection(orderProjectId) {
    const normalizedProjectId = Number(orderProjectId);
    if (!normalizedProjectId) {
        return { subtypes: [], existingProjects: [], existingSubtypeIds: new Set() };
    }

    const [procurementSubtypes, characteristicSubtypes, existingProjects] = await Promise.all([
        fetchThirdPartySubtypesWithoutCharacteristic(true),
        fetchThirdPartySubtypesWithCharacteristic(true),
        fetchThirdPartyProjectsByOrderProjectId(normalizedProjectId)
    ]);

    const existingSubtypeIds = new Set(
        (existingProjects || []).map(project => Number(project.thirdPartySubtypeId)).filter(Boolean)
    );

    let subtypes = mergeThirdPartySubtypesForApprovalModal(
        [...(procurementSubtypes || []), ...(characteristicSubtypes || [])],
        existingProjects
    );

    const coveredSubtypeIds = new Set(subtypes.map(subtype => Number(subtype.id)).filter(Boolean));
    const missingSubtypeIds = [...existingSubtypeIds].filter(id => !coveredSubtypeIds.has(id));
    if (missingSubtypeIds.length) {
        const fetchedSubtypes = await fetchThirdPartySubtypesByIds(missingSubtypeIds);
        subtypes = mergeThirdPartySubtypesForApprovalModal(
            subtypes,
            fetchedSubtypes.map(subtype => ({ thirdPartySubtype: subtype }))
        );
    }

    return {
        subtypes,
        existingProjects: existingProjects || [],
        existingSubtypeIds
    };
}

async function thirdPartyProjectHasDeliverableFile(thirdPartyProjectId) {
    const projectId = Number(thirdPartyProjectId);
    if (!projectId) return false;

    if (typeof findDriveFileForEntity === 'function'
        && typeof DRIVE_FILE_ENTITY_TYPE !== 'undefined'
        && typeof DRIVE_FILE_FOLDER_KIND !== 'undefined') {
        try {
            const driveFile = await findDriveFileForEntity({
                entityType: DRIVE_FILE_ENTITY_TYPE.THIRD_PARTY_PROJECT,
                entityId: projectId,
                folderKind: DRIVE_FILE_FOLDER_KIND.THIRD_PARTY
            });
            if (driveFile?.driveFileId) return true;
        } catch (error) {
            console.warn('thirdPartyProjectHasDeliverableFile:', error);
        }
    }

    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .select('filePath')
        .eq('id', projectId)
        .maybeSingle();

    if (error) return false;
    return Boolean(String(data?.filePath || '').trim());
}

async function markThirdPartyProjectApprovedAfterProcurementUpload(thirdPartyProjectId) {
    const projectId = Number(thirdPartyProjectId);
    if (!projectId) return null;

    const { data: current, error: fetchError } = await supabaseClient
        .from('ThirdPartyProject')
        .select(`
            id,
            orderId,
            orderProjectId,
            status,
            projectCharacteristicId,
            thirdPartySubtype:ThirdPartySubtype(id, name, projectCharacteristicId)
        `)
        .eq('id', projectId)
        .maybeSingle();

    if (fetchError || !current) {
        throw fetchError || new Error('Projeto não encontrado.');
    }

    if (isThirdPartyProjectCommercialApprovalRequired(current)) {
        return current;
    }

    if (current.status === THIRD_PARTY_PROJECT_STATUS_APPROVED) {
        return current;
    }

    const hasFile = await thirdPartyProjectHasDeliverableFile(projectId);
    if (!hasFile) {
        throw new Error('Envie o arquivo antes de concluir.');
    }

    const now = new Date().toISOString();
    const previousStatus = current.status;
    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .update({
            status: THIRD_PARTY_PROJECT_STATUS_APPROVED,
            approvedAt: now,
            updatedAt: now,
            updatedById: currentUser?.id || null
        })
        .eq('id', projectId)
        .select(`
            id,
            orderId,
            orderProjectId,
            status,
            approvedAt,
            thirdPartySubtype:ThirdPartySubtype(id, name),
            orderProject:OrderProject(id, name, projectCode),
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
        `)
        .single();

    if (error) throw error;

    await notifyThirdPartyProjectStatusChange(data, previousStatus);
    return data;
}

async function createThirdPartyProjectsForConferenceApproval(conference, orderProjectIdsOverride = null) {
    const orderId = Number(conference?.orderId);
    const orderProjectIds = orderProjectIdsOverride?.length
        ? [...new Set(orderProjectIdsOverride.map(id => Number(id)).filter(Boolean))]
        : getConferenceOrderProjectIds(conference);
    if (!orderId || !orderProjectIds.length) {
        return { created: [], existing: [] };
    }

    const characteristicsMap = typeof fetchOrderProjectCharacteristicsMap === 'function'
        ? await fetchOrderProjectCharacteristicsMap(orderProjectIds)
        : new Map();

    const characteristicIds = [];
    orderProjectIds.forEach(projectId => {
        (characteristicsMap.get(projectId) || []).forEach(row => {
            const characteristicId = Number(row.characteristicId || row.characteristic?.id);
            if (characteristicId) characteristicIds.push(characteristicId);
        });
    });

    const subtypes = await fetchThirdPartySubtypesForCharacteristics(characteristicIds);
    if (!subtypes.length) {
        return { created: [], existing: [] };
    }

    const subtypeByCharacteristicId = new Map(
        subtypes.map(subtype => [Number(subtype.projectCharacteristicId), subtype])
    );

    const existingProjects = await fetchThirdPartyProjectsByOrderId(orderId);
    const existingKeys = new Set(
        existingProjects.map(project => `${project.orderProjectId}-${project.thirdPartySubtypeId}`)
    );

    const designerIdsByProjectId = await fetchOrderProjectDesignerIdsByProjectIds(orderProjectIds);
    const now = new Date().toISOString();
    const rowsToInsert = [];

    orderProjectIds.forEach(orderProjectId => {
        const designerId = designerIdsByProjectId[Number(orderProjectId)] || null;
        (characteristicsMap.get(orderProjectId) || []).forEach(row => {
            const characteristicId = Number(row.characteristicId || row.characteristic?.id);
            const subtype = subtypeByCharacteristicId.get(characteristicId);
            if (!subtype) return;

            const key = `${orderProjectId}-${subtype.id}`;
            if (existingKeys.has(key)) return;

            rowsToInsert.push(buildThirdPartyProjectInsertRow({
                orderId,
                orderProjectId,
                projectCharacteristicId: characteristicId,
                thirdPartySubtypeId: subtype.id,
                status: THIRD_PARTY_PROJECT_STATUS_OPEN,
                createdAt: now,
                createdById: currentUser?.id || null,
                updatedAt: now,
                updatedById: currentUser?.id || null
            }, designerId));
            existingKeys.add(key);
        });
    });

    if (!rowsToInsert.length) {
        return { created: [], existing: existingProjects };
    }

    const created = await insertThirdPartyProjectRows(rowsToInsert);
    for (const project of created) {
        await notifyThirdPartyProjectStatusChange(project, null);
    }

    return { created, existing: existingProjects };
}

async function createThirdPartyProjectsForOrderProjectCharacteristics(options = {}) {
    const {
        orderProjectId,
        orderId,
        characteristicIds = [],
        thirdPartySubtypeIds = null,
        designerId: designerIdOption = null
    } = options;

    const normalizedProjectId = Number(orderProjectId);
    const normalizedOrderId = Number(orderId);
    const uniqueCharacteristicIds = [...new Set(characteristicIds.map(id => Number(id)).filter(Boolean))];

    if (!normalizedProjectId || !normalizedOrderId || !uniqueCharacteristicIds.length) {
        return { created: [], existing: [] };
    }

    let designerId = Number(designerIdOption) || null;
    if (!designerId) {
        const designerIdsByProjectId = await fetchOrderProjectDesignerIdsByProjectIds([normalizedProjectId]);
        designerId = designerIdsByProjectId[normalizedProjectId] || null;
    }

    const subtypes = await fetchThirdPartySubtypesForCharacteristics(uniqueCharacteristicIds);
    if (!subtypes.length) {
        return { created: [], existing: [] };
    }

    const subtypeByCharacteristicId = new Map(
        subtypes.map(subtype => [Number(subtype.projectCharacteristicId), subtype])
    );

    const allowedSubtypeIds = Array.isArray(thirdPartySubtypeIds) && thirdPartySubtypeIds.length
        ? new Set(thirdPartySubtypeIds.map(id => Number(id)).filter(Boolean))
        : null;

    const existingProjects = await fetchThirdPartyProjectsByOrderProjectId(normalizedProjectId);
    const existingKeys = new Set(
        existingProjects.map(project => `${project.orderProjectId}-${project.thirdPartySubtypeId}`)
    );

    const now = new Date().toISOString();
    const rowsToInsert = [];

    uniqueCharacteristicIds.forEach(characteristicId => {
        const subtype = subtypeByCharacteristicId.get(characteristicId);
        if (!subtype) return;
        if (allowedSubtypeIds && !allowedSubtypeIds.has(Number(subtype.id))) return;

        const key = `${normalizedProjectId}-${subtype.id}`;
        if (existingKeys.has(key)) return;

        rowsToInsert.push(buildThirdPartyProjectInsertRow({
            orderId: normalizedOrderId,
            orderProjectId: normalizedProjectId,
            projectCharacteristicId: characteristicId,
            thirdPartySubtypeId: subtype.id,
            status: THIRD_PARTY_PROJECT_STATUS_OPEN,
            createdAt: now,
            createdById: currentUser?.id || null,
            updatedAt: now,
            updatedById: currentUser?.id || null
        }, designerId));
        existingKeys.add(key);
    });

    if (!rowsToInsert.length) {
        return { created: [], existing: existingProjects };
    }

    const created = await insertThirdPartyProjectRows(rowsToInsert);
    for (const project of created) {
        await notifyThirdPartyProjectStatusChange(project, null);
    }

    return { created, existing: existingProjects };
}

async function deleteThirdPartyProjectsForOrderProjectCharacteristics(orderProjectId, characteristicIds = []) {
    const normalizedProjectId = Number(orderProjectId);
    const uniqueCharacteristicIds = [...new Set(characteristicIds.map(id => Number(id)).filter(Boolean))];

    if (!normalizedProjectId || !uniqueCharacteristicIds.length) return [];

    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .delete()
        .eq('orderProjectId', normalizedProjectId)
        .in('projectCharacteristicId', uniqueCharacteristicIds)
        .select(`
            id,
            projectCharacteristicId,
            thirdPartySubtype:ThirdPartySubtype(id, name),
            projectCharacteristic:ProjectCharacteristic(id, name)
        `);

    if (error) {
        if (error.message?.includes('ThirdPartyProject')) {
            throw new Error('Execute supabase/create-third-party-project.sql no Supabase.');
        }
        throw error;
    }

    return data || [];
}

async function fetchThirdPartyProjectsWithoutDesigner() {
    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .select(`
            id,
            orderId,
            orderProjectId,
            projectCharacteristicId,
            thirdPartySubtypeId,
            filePath,
            designerId,
            status,
            sentAt,
            approvedAt,
            createdAt,
            updatedAt,
            projectCharacteristic:ProjectCharacteristic(id, name),
            thirdPartySubtype:ThirdPartySubtype(id, name),
            orderProject:OrderProject(id, name, projectCode, deliveryDate),
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
        `)
        .is('designerId', null)
        .neq('status', THIRD_PARTY_PROJECT_STATUS_APPROVED)
        .order('createdAt', { ascending: true });

    if (error) {
        if (error.message?.includes('ThirdPartyProject')) return [];
        throw error;
    }

    return data || [];
}

async function fetchThirdPartyProjectsForProjetista(designerId, options = {}) {
    const { includeAll = false } = options;
    const normalizedDesignerId = Number(designerId);
    if (!includeAll && !normalizedDesignerId) return [];

    let query = supabaseClient
        .from('ThirdPartyProject')
        .select(`
            id,
            orderId,
            orderProjectId,
            projectCharacteristicId,
            thirdPartySubtypeId,
            filePath,
            designerId,
            status,
            sentAt,
            approvedAt,
            createdAt,
            updatedAt,
            projectCharacteristic:ProjectCharacteristic(id, name),
            thirdPartySubtype:ThirdPartySubtype(id, name),
            ${THIRD_PARTY_PROJECT_DESIGNER_EMBED},
            orderProject:OrderProject(id, name, projectCode, deliveryDate),
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
        `)
        .neq('status', THIRD_PARTY_PROJECT_STATUS_APPROVED)
        .order('updatedAt', { ascending: false });

    if (!includeAll) {
        query = query.eq('designerId', normalizedDesignerId);
    }

    const { data, error } = await query;

    if (error) {
        if (error.message?.includes('ThirdPartyProject')) return [];
        throw error;
    }

    return data || [];
}

async function assignThirdPartyProjectDesigner(thirdPartyProjectId, designerId) {
    const projectId = Number(thirdPartyProjectId);
    const normalizedDesignerId = Number(designerId);
    if (!projectId || !normalizedDesignerId) {
        throw new Error('Projeto ou projetista inválido.');
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .update({
            designerId: normalizedDesignerId,
            updatedAt: now,
            updatedById: currentUser?.id || null
        })
        .eq('id', projectId)
        .select(`
            id,
            orderId,
            orderProjectId,
            projectCharacteristicId,
            designerId,
            status,
            thirdPartySubtype:ThirdPartySubtype(id, name),
            projectCharacteristic:ProjectCharacteristic(id, name),
            ${THIRD_PARTY_PROJECT_DESIGNER_EMBED},
            orderProject:OrderProject(id, name, projectCode),
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
        `)
        .single();

    if (error) throw error;

    if (typeof notifyThirdPartyDesignerAssignedEmail === 'function') {
        try {
            await notifyThirdPartyDesignerAssignedEmail({
                orderId: data.orderId,
                orderProjectId: data.orderProjectId,
                designerId: normalizedDesignerId,
                subtypeName: data.thirdPartySubtype?.name || '',
                characteristicName: data.projectCharacteristic?.name || ''
            });
        } catch (emailError) {
            console.warn('notifyThirdPartyDesignerAssignedEmail:', emailError);
        }
    }

    return data;
}

async function saveThirdPartyProjectFilePath(thirdPartyProjectId, filePath) {
    const projectId = Number(thirdPartyProjectId);
    const normalizedPath = String(filePath || '').trim();
    if (!projectId) throw new Error('Projeto inválido.');
    if (!normalizedPath) throw new Error('Informe o caminho do arquivo ou envie o arquivo pelo Drive.');

    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .update({
            filePath: normalizedPath,
            updatedAt: now,
            updatedById: currentUser?.id || null
        })
        .eq('id', projectId)
        .select('id, filePath, status, designerId')
        .single();

    if (error) throw error;
    return data;
}

async function notifyThirdPartyProjectStatusChange(project, previousStatus, options = {}) {
    if (typeof notifyThirdPartyProjectStatusEmail !== 'function' || !project) return;

    const orderId = Number(project.orderId);
    const orderProjectId = Number(project.orderProjectId);
    if (!orderId || !orderProjectId) return;

    await notifyThirdPartyProjectStatusEmail({
        orderId,
        orderProjectId,
        designerId: project.designerId,
        statusLabel: getThirdPartyProjectStatusLabel(project.status),
        previousStatusLabel: getThirdPartyProjectStatusLabel(previousStatus),
        subtypeName: project.thirdPartySubtype?.name,
        filePath: project.filePath,
        activities: options.activities || null
    });
}

async function sendThirdPartyProject(thirdPartyProjectId) {
    const projectId = Number(thirdPartyProjectId);
    if (!projectId) throw new Error('Projeto inválido.');

    const { data: current, error: fetchError } = await supabaseClient
        .from('ThirdPartyProject')
        .select(`
            id,
            orderId,
            orderProjectId,
            status,
            filePath,
            designerId,
            projectCharacteristicId,
            thirdPartySubtype:ThirdPartySubtype(id, name, projectCharacteristicId)
        `)
        .eq('id', projectId)
        .single();

    if (fetchError) throw fetchError;

    if (current.status !== THIRD_PARTY_PROJECT_STATUS_OPEN) {
        throw new Error('Somente projetos com status Aberto podem ser enviados.');
    }

    const hasFile = await thirdPartyProjectHasDeliverableFile(projectId);
    if (!hasFile) {
        throw new Error('Envie o arquivo no detalhe do projeto antes de enviar ao consultor.');
    }

    if (!isAdmin() && Number(current.designerId) !== Number(currentUser?.id)) {
        throw new Error('Somente o projetista responsável pode enviar este projeto.');
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .update({
            status: THIRD_PARTY_PROJECT_STATUS_SENT,
            sentAt: now,
            updatedAt: now,
            updatedById: currentUser?.id || null
        })
        .eq('id', projectId)
        .select(`
            id,
            orderId,
            orderProjectId,
            status,
            sentAt,
            filePath,
            designerId,
            thirdPartySubtype:ThirdPartySubtype(id, name),
            orderProject:OrderProject(id, name, projectCode),
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()})
        `)
        .single();

    if (error) throw error;

    await notifyThirdPartyProjectStatusChange(data, THIRD_PARTY_PROJECT_STATUS_OPEN);
    return data;
}

function adaptThirdPartyProjectStatusHistoryEntries(entries = []) {
    return entries.map(entry => ({
        ...entry,
        previousStatusId: entry.previousStatus ? 1 : null,
        newStatus: { name: getThirdPartyProjectStatusLabel(entry.newStatus) },
        previousStatus: entry.previousStatus
            ? { name: getThirdPartyProjectStatusLabel(entry.previousStatus) }
            : null
    }));
}

function getThirdPartyProjectLabel(project) {
    const projectName = project?.orderProject?.name || 'Projeto';
    const subtypeName = project?.thirdPartySubtype?.name || 'Terceiro';
    return `${projectName} · ${subtypeName}`;
}

async function openThirdPartyProjectStatusHistoryModal(project) {
    const projectId = Number(project?.id);
    if (!projectId) return;

    const subtitle = document.getElementById('project-status-history-subtitle');
    const flow = document.getElementById('project-status-history-flow');
    const orderCode = project?.order?.orderCode || '—';
    const clientName = getOrderClientName(project?.order) || '—';
    const label = getThirdPartyProjectLabel(project);

    if (subtitle) {
        subtitle.textContent = `Pedido ${orderCode} · ${clientName} · ${label}`;
    }

    toggleModal('order-project-status-history-modal', true);

    if (flow) {
        flow.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Carregando histórico...</p>';
    }

    try {
        const entries = adaptThirdPartyProjectStatusHistoryEntries(
            await fetchThirdPartyProjectStatusHistory(projectId)
        );
        if (typeof setProjectStatusHistoryContent === 'function') {
            setProjectStatusHistoryContent('project-status-history-flow', entries, 'flow');
        } else if (flow) {
            flow.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Histórico indisponível.</p>';
        }
    } catch (error) {
        if (flow) {
            flow.innerHTML = `<p class="text-xs text-red-500 text-center py-8">Erro ao carregar histórico: ${escapeHtml(error.message)}</p>`;
        }
    }
}

function canActThirdPartyProjectAsProjetista(project) {
    if (!project) return false;
    if (isAdmin()) return true;
    return currentUser?.role === 'Projetista'
        && Number(project.designerId) === Number(currentUser.id);
}

function canAssignThirdPartyProjectDesigner() {
    return isAdmin() || (typeof canSeePendenciasGestorProjetosMenu === 'function'
        && canSeePendenciasGestorProjetosMenu());
}

function isThirdPartyProjectObservationColumnError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('projectobservation')
        || (message.includes('column') && message.includes('thirdpartyproject'));
}

function buildThirdPartyProjectCompraLookupKey(orderProjectId, thirdPartySubtypeId) {
    const projectId = Number(orderProjectId);
    const subtypeId = Number(thirdPartySubtypeId);
    if (!projectId || !subtypeId) return '';
    return `${projectId}:${subtypeId}`;
}

function formatThirdPartyProjectObservationPreview(text, maxLength = 120) {
    const normalized = String(text || '').trim();
    if (!normalized) return '—';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1)}…`;
}

async function fetchThirdPartyProjectsByOrderProjectIds(orderProjectIds = []) {
    const ids = [...new Set((orderProjectIds || []).map(id => Number(id)).filter(Boolean))];
    if (!ids.length) return [];

    return fetchThirdPartyProjectsWithFallback(
        select => supabaseClient
            .from('ThirdPartyProject')
            .select(select)
            .in('orderProjectId', ids),
        {}
    );
}

async function buildThirdPartyProjectObservationLookupByOrderProjectIds(orderProjectIds = []) {
    try {
        const projects = await fetchThirdPartyProjectsByOrderProjectIds(orderProjectIds);
        const lookup = {};
        projects.forEach(project => {
            const key = buildThirdPartyProjectCompraLookupKey(
                project.orderProjectId,
                project.thirdPartySubtypeId
            );
            if (key) lookup[key] = project;
        });
        return lookup;
    } catch (error) {
        if (isThirdPartyProjectObservationColumnError(error)) {
            console.warn('buildThirdPartyProjectObservationLookupByOrderProjectIds:', error);
            return {};
        }
        throw error;
    }
}

function resolveThirdPartyProjectObservationForCompra(compra, purchaseItem, lookup = {}) {
    const subtypeId = purchaseItem?.thirdPartySubtype?.id || purchaseItem?.thirdPartySubtypeId;
    const key = buildThirdPartyProjectCompraLookupKey(compra?.orderProjectId, subtypeId);
    if (!key) return '';
    return lookup[key]?.projectObservation || '';
}

async function saveThirdPartyProjectObservation(thirdPartyProjectId, projectObservation) {
    if (!currentUser) {
        throw new Error('Faça login para salvar a observação.');
    }

    const projectId = Number(thirdPartyProjectId);
    if (!projectId) throw new Error('Projeto inválido.');

    const normalized = String(projectObservation || '').trim();
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .update({
            projectObservation: normalized || null,
            updatedAt: now,
            updatedById: currentUser?.id || null
        })
        .eq('id', projectId)
        .select('id, projectObservation, orderProjectId, thirdPartySubtypeId')
        .single();

    if (error) {
        if (isThirdPartyProjectObservationColumnError(error)) {
            throw new Error('Execute supabase/feats/third-party-project-observation.sql no SQL Editor do ambiente.');
        }
        throw error;
    }

    return data;
}
