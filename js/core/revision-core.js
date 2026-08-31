const REVISION_TYPE_COMMERCIAL_TECHNICAL = 'commercial_technical';
const REVISION_TYPE_COMMERCIAL_COMMERCIAL = 'commercial_commercial';
const REVISION_TYPE_THIRD_PARTY = 'third_party';
const REVISION_TYPE_TECHNICAL_REVISOR = 'technical_reviewer';

const REVISION_STATUS_OPEN = 'open';
const REVISION_STATUS_CLOSED = 'closed';

const COMMERCIAL_REVISION_DB_TYPES = [
    REVISION_TYPE_COMMERCIAL_TECHNICAL,
    REVISION_TYPE_COMMERCIAL_COMMERCIAL
];

const ORDER_PROJECT_REVISION_DB_TYPES = [
    ...COMMERCIAL_REVISION_DB_TYPES,
    REVISION_TYPE_TECHNICAL_REVISOR
];

function mapLegacyRevisionTypeToDb(legacyType) {
    return legacyType === 'comercial'
        ? REVISION_TYPE_COMMERCIAL_COMMERCIAL
        : REVISION_TYPE_COMMERCIAL_TECHNICAL;
}

function mapDbRevisionTypeToLegacy(revisionType) {
    if (revisionType === REVISION_TYPE_COMMERCIAL_COMMERCIAL) return 'comercial';
    if (revisionType === REVISION_TYPE_COMMERCIAL_TECHNICAL) return 'tecnica';
    if (revisionType === REVISION_TYPE_TECHNICAL_REVISOR) return 'technical_reviewer';
    return revisionType;
}

function normalizeRevisionRecord(revision, commercialApprovalId = null) {
    if (!revision) return revision;

    return {
        ...revision,
        type: revision.type || mapDbRevisionTypeToLegacy(revision.revisionType),
        commercialApprovalId: commercialApprovalId ?? revision.commercialApprovalId ?? null
    };
}

function groupRevisionsByApprovalId(revisions, approvalIdByOrderProjectId) {
    const byApproval = {};

    (revisions || []).forEach(revision => {
        const approvalId = approvalIdByOrderProjectId[Number(revision.orderProjectId)];
        if (!approvalId) return;

        if (!byApproval[approvalId]) {
            byApproval[approvalId] = [];
        }

        byApproval[approvalId].push(normalizeRevisionRecord(revision, approvalId));
    });

    return byApproval;
}

async function resolveApprovalIdByOrderProjectIds(orderProjectIds) {
    const map = {};
    [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))].forEach(id => {
        map[id] = id;
    });
    return map;
}

async function fetchRevisionsByOrderProjectIds(orderProjectIds, revisionTypes = COMMERCIAL_REVISION_DB_TYPES) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return [];

    const { data, error } = await supabaseClient
        .from('Revision')
        .select('id, orderProjectId, revisionType, status, createdAt, revisionStartedAt, revisionCompletedAt, updatedAt')
        .in('orderProjectId', uniqueIds)
        .in('revisionType', revisionTypes)
        .order('createdAt', { ascending: false })
        .order('id', { ascending: false });

    if (error) {
        console.error('fetchRevisionsByOrderProjectIds:', error);
        return [];
    }

    return data || [];
}

async function fetchRevisionsByThirdPartyProjectIds(thirdPartyProjectIds) {
    const uniqueIds = [...new Set(thirdPartyProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return [];

    const { data, error } = await supabaseClient
        .from('Revision')
        .select('id, thirdPartyProjectId, revisionType, status, createdAt, updatedAt, createdById, updatedById')
        .in('thirdPartyProjectId', uniqueIds)
        .eq('revisionType', REVISION_TYPE_THIRD_PARTY)
        .order('createdAt', { ascending: false })
        .order('id', { ascending: false });

    if (error) {
        console.error('fetchRevisionsByThirdPartyProjectIds:', error);
        return [];
    }

    return data || [];
}

async function fetchRevisionById(revisionId) {
    const normalizedId = Number(revisionId);
    if (!normalizedId) return null;

    const { data, error } = await supabaseClient
        .from('Revision')
        .select('id, orderProjectId, thirdPartyProjectId, revisionType, status, revisionStartedAt, revisionCompletedAt, createdAt, updatedAt')
        .eq('id', normalizedId)
        .maybeSingle();

    if (error) {
        console.error('fetchRevisionById:', error);
        return null;
    }

    return data;
}

async function fetchLatestRevisionForOrderProject(orderProjectId, legacyRevisionType = 'tecnica') {
    const normalizedId = Number(orderProjectId);
    if (!normalizedId) return null;

    const revisionType = mapLegacyRevisionTypeToDb(legacyRevisionType);
    const { data, error } = await supabaseClient
        .from('Revision')
        .select('id, revisionType, status, createdAt, revisionStartedAt, revisionCompletedAt, updatedAt')
        .eq('orderProjectId', normalizedId)
        .eq('revisionType', revisionType)
        .order('createdAt', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('fetchLatestRevisionForOrderProject:', error);
        return null;
    }

    return data ? normalizeRevisionRecord(data) : null;
}

async function fetchLatestRevisionForOrderProjectByType(orderProjectId, revisionType) {
    const normalizedId = Number(orderProjectId);
    if (!normalizedId || !revisionType) return null;

    const { data, error } = await supabaseClient
        .from('Revision')
        .select('id, revisionType, status, createdAt, revisionStartedAt, revisionCompletedAt, updatedAt')
        .eq('orderProjectId', normalizedId)
        .eq('revisionType', revisionType)
        .order('createdAt', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('fetchLatestRevisionForOrderProjectByType:', error);
        return null;
    }

    return data ? normalizeRevisionRecord(data) : null;
}

async function fetchOpenTechnicalReviewerRevision(orderProjectId) {
    const normalizedId = Number(orderProjectId);
    if (!normalizedId) return null;

    const { data, error } = await supabaseClient
        .from('Revision')
        .select('id, revisionType, status, createdAt, revisionStartedAt, revisionCompletedAt')
        .eq('orderProjectId', normalizedId)
        .eq('revisionType', REVISION_TYPE_TECHNICAL_REVISOR)
        .eq('status', REVISION_STATUS_OPEN)
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('fetchOpenTechnicalReviewerRevision:', error);
        return null;
    }

    return data;
}

async function fetchRevisionActivities(revisionId) {
    const normalizedId = Number(revisionId);
    if (!normalizedId) return [];

    const { data, error } = await supabaseClient
        .from('RevisionActivity')
        .select('id, revisionId, description, completed, observation, completedAt, sortOrder, createdAt, updatedAt')
        .eq('revisionId', normalizedId)
        .order('sortOrder', { ascending: true })
        .order('id', { ascending: true });

    if (error) {
        console.error('fetchRevisionActivities:', error);
        return [];
    }

    return data || [];
}

async function fetchRevisionActivitiesByRevisionIds(revisionIds) {
    const uniqueIds = [...new Set(revisionIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return [];

    const { data, error } = await supabaseClient
        .from('RevisionActivity')
        .select('id, revisionId, description, completed, observation, completedAt, sortOrder')
        .in('revisionId', uniqueIds)
        .order('sortOrder', { ascending: true })
        .order('id', { ascending: true });

    if (error) {
        console.error('fetchRevisionActivitiesByRevisionIds:', error);
        return [];
    }

    return data || [];
}

async function fetchRevisionActivityAttachmentsByActivityIds(activityIds = []) {
    const uniqueIds = [...new Set(activityIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return {};

    const { data, error } = await supabaseClient
        .from('RevisionActivityAttachment')
        .select('id, revisionActivityId, storagePath, fileName, mimeType, fileSizeBytes, sortOrder, createdAt')
        .in('revisionActivityId', uniqueIds)
        .order('sortOrder', { ascending: true })
        .order('createdAt', { ascending: true });

    if (error) {
        console.error('fetchRevisionActivityAttachmentsByActivityIds:', error);
    }

    const byActivity = {};
    (data || []).forEach(item => {
        const key = String(item.revisionActivityId);
        if (!byActivity[key]) {
            byActivity[key] = item;
        }
    });

    if (typeof fetchDriveFilesByEntityIds === 'function'
        && typeof DRIVE_FILE_ENTITY_TYPE !== 'undefined'
        && typeof DRIVE_FILE_FOLDER_KIND !== 'undefined') {
        try {
            const driveByActivity = await fetchDriveFilesByEntityIds({
                entityType: DRIVE_FILE_ENTITY_TYPE.REVISION_ACTIVITY,
                entityIds: uniqueIds,
                folderKind: DRIVE_FILE_FOLDER_KIND.REVISION
            });
            Object.entries(driveByActivity || {}).forEach(([activityId, item]) => {
                byActivity[activityId] = {
                    ...item,
                    revisionActivityId: Number(activityId)
                };
            });
        } catch (driveError) {
            console.warn('fetchRevisionActivityAttachmentsByActivityIds drive:', driveError);
        }
    }

    return byActivity;
}

async function createRevisionRecord({
    orderProjectId = null,
    thirdPartyProjectId = null,
    revisionType,
    status = REVISION_STATUS_OPEN
}) {
    const payload = {
        revisionType,
        status,
        updatedAt: new Date().toISOString()
    };

    if (orderProjectId) payload.orderProjectId = Number(orderProjectId);
    if (thirdPartyProjectId) payload.thirdPartyProjectId = Number(thirdPartyProjectId);
    if (currentUser?.id) payload.createdById = currentUser.id;

    const { data, error } = await supabaseClient
        .from('Revision')
        .insert([payload])
        .select('id, revisionType, status, orderProjectId, thirdPartyProjectId')
        .single();

    if (error) {
        return { data: null, error };
    }

    return { data, error: null };
}

async function updateRevisionRecord(revisionId, payload) {
    const normalizedId = Number(revisionId);
    if (!normalizedId) return { error: new Error('revisionId inválido') };

    const { error } = await supabaseClient
        .from('Revision')
        .update({
            ...payload,
            updatedAt: new Date().toISOString(),
            ...(currentUser?.id ? { updatedById: currentUser.id } : {})
        })
        .eq('id', normalizedId);

    return { error };
}

async function completeRevisionRecord(revisionId, completedAt = new Date().toISOString()) {
    return updateRevisionRecord(revisionId, {
        status: REVISION_STATUS_CLOSED,
        revisionCompletedAt: completedAt
    });
}

async function insertRevisionActivity(revisionId, payload) {
    const { data, error } = await supabaseClient
        .from('RevisionActivity')
        .insert([{ ...payload, revisionId: Number(revisionId) }])
        .select('id')
        .single();

    return { data, error };
}

async function updateRevisionActivity(activityId, payload) {
    const { error } = await supabaseClient
        .from('RevisionActivity')
        .update(payload)
        .eq('id', Number(activityId));

    return { error };
}

async function fetchCommercialRevisionsByApprovalIds(approvalIds) {
    const orderProjectIds = [...new Set(approvalIds.map(id => Number(id)).filter(Boolean))];
    if (!orderProjectIds.length) return {};

    const revisions = await fetchRevisionsByOrderProjectIds(orderProjectIds, ORDER_PROJECT_REVISION_DB_TYPES);
    if (!revisions.length) return {};

    const revisionIds = revisions.map(revision => revision.id);
    const activities = await fetchRevisionActivitiesByRevisionIds(revisionIds);

    const activitiesByRevision = {};
    const activityIds = [];
    activities.forEach(activity => {
        activityIds.push(activity.id);
        if (!activitiesByRevision[activity.revisionId]) {
            activitiesByRevision[activity.revisionId] = [];
        }
        activitiesByRevision[activity.revisionId].push(activity);
    });

    const attachmentsByActivity = await fetchRevisionActivityAttachmentsByActivityIds(activityIds);
    const byApproval = {};
    const seenRevisionIds = new Set();

    revisions.forEach(revision => {
        if (!revision.id || seenRevisionIds.has(revision.id)) return;
        seenRevisionIds.add(revision.id);

        const approvalId = Number(revision.orderProjectId);
        if (!approvalId) return;

        if (!byApproval[approvalId]) {
            byApproval[approvalId] = [];
        }

        byApproval[approvalId].push({
            ...normalizeRevisionRecord(revision, approvalId),
            activities: (activitiesByRevision[revision.id] || []).map(activity => ({
                ...activity,
                attachment: attachmentsByActivity[String(activity.id)] || null
            }))
        });
    });

    return byApproval;
}

window.fetchCommercialRevisionsByApprovalIds = fetchCommercialRevisionsByApprovalIds;
window.ORDER_PROJECT_REVISION_DB_TYPES = ORDER_PROJECT_REVISION_DB_TYPES;
window.fetchRevisionActivityAttachmentsByActivityIds = fetchRevisionActivityAttachmentsByActivityIds;
