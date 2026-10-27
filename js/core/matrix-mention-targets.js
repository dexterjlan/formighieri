async function fetchAppUsersMatrixMentionTargets(appUserIds = []) {
    const ids = [...new Set((appUserIds || []).map(id => Number(id)).filter(Boolean))];
    if (!ids.length || !supabaseClient) return [];

    let { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name, matrixUserId')
        .in('id', ids);

    if (error?.message?.includes('matrixUserId')) {
        ({ data, error } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', ids));
    }

    if (error) {
        console.warn('fetchAppUsersMatrixMentionTargets:', error);
        return [];
    }

    return (data || [])
        .map(user => ({
            appUserId: user.id,
            name: user.name,
            matrixUserId: user.matrixUserId ? String(user.matrixUserId).trim() : null
        }))
        .filter(user => user.matrixUserId);
}

async function fetchActiveReviewerMatrixMentionTargets() {
    if (!supabaseClient) return [];

    let { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name, matrixUserId, isReviewer, isProjectLeader, role, isActive')
        .eq('role', 'Projetista')
        .eq('isActive', true);

    if (error?.message?.includes('matrixUserId') || error?.message?.includes('isProjectLeader')) {
        ({ data, error } = await supabaseClient
            .from('appUsers')
            .select('id, name, isReviewer, isProjectLeader, role, isActive')
            .eq('isActive', true));
    }

    if (error) {
        console.warn('fetchActiveReviewerMatrixMentionTargets:', error);
        return [];
    }

    return (data || [])
        .filter(user => user.role === 'Projetista' && (user.isReviewer || user.isProjectLeader))
        .map(user => ({
            appUserId: user.id,
            name: user.name,
            matrixUserId: user.matrixUserId ? String(user.matrixUserId).trim() : null
        }))
        .filter(user => user.matrixUserId);
}

function normalizeMatrixMentionTargets(mentionTargets = [], mentionUserIds = []) {
    const fromTargets = (mentionTargets || [])
        .map(target => ({
            matrixUserId: String(target?.matrixUserId || '').trim(),
            name: String(target?.name || '').trim()
        }))
        .filter(target => target.matrixUserId.startsWith('@') && target.matrixUserId.includes(':'));

    if (fromTargets.length) {
        const seen = new Set();
        return fromTargets.filter(target => {
            if (seen.has(target.matrixUserId)) return false;
            seen.add(target.matrixUserId);
            return true;
        }).map(target => ({
            matrixUserId: target.matrixUserId,
            name: target.name || target.matrixUserId
        }));
    }

    const ids = typeof normalizeMatrixMentionUserIds === 'function'
        ? normalizeMatrixMentionUserIds(mentionUserIds)
        : [];

    return ids.map(matrixUserId => ({ matrixUserId, name: matrixUserId }));
}

window.fetchAppUsersMatrixMentionTargets = fetchAppUsersMatrixMentionTargets;
window.fetchActiveReviewerMatrixMentionTargets = fetchActiveReviewerMatrixMentionTargets;
window.normalizeMatrixMentionTargets = normalizeMatrixMentionTargets;
