let marceneirosCache = [];

async function loadMarceneiros(activeOnly = true) {
    let query = supabaseClient
        .from('Marceneiro')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('loadMarceneiros:', error);
        marceneirosCache = [];
        return [];
    }

    marceneirosCache = data || [];
    return marceneirosCache;
}

function resetMarceneirosCache() {
    marceneirosCache = [];
}

function getMarceneiroOptionsHtml(selectedId = null) {
    if (!marceneirosCache.length) {
        return '<option value="">Nenhum marceneiro cadastrado</option>';
    }

    const options = ['<option value="">Selecione...</option>'];
    marceneirosCache.forEach(marceneiro => {
        const selected = Number(selectedId) === Number(marceneiro.id) ? ' selected' : '';
        options.push(`<option value="${marceneiro.id}"${selected}>${escapeHtml(marceneiro.name)}</option>`);
    });
    return options.join('');
}

function resolveMarceneiroRecord(project) {
    if (!project) return null;

    let marceneiro = project.marceneiro;
    if (Array.isArray(marceneiro)) {
        marceneiro = marceneiro.find(item => item?.name) || marceneiro[0] || null;
    }
    if (marceneiro?.name) return marceneiro;

    const marceneiroId = Number(project.marceneiroId);
    if (!marceneiroId) return null;

    return marceneirosCache.find(item => Number(item.id) === marceneiroId) || null;
}

function getMarceneiroNameFromProject(project) {
    return resolveMarceneiroRecord(project)?.name || '—';
}

async function enrichProjectMarceneiro(project) {
    if (!project) return project;

    const existing = resolveMarceneiroRecord(project);
    if (existing?.name) {
        return { ...project, marceneiro: existing };
    }

    const marceneiroId = Number(project.marceneiroId);
    if (!marceneiroId) return project;

    if (!marceneirosCache.length) {
        await loadMarceneiros(false);
        const fromCache = marceneirosCache.find(item => Number(item.id) === marceneiroId);
        if (fromCache?.name) {
            return { ...project, marceneiro: { id: fromCache.id, name: fromCache.name } };
        }
    }

    const { data, error } = await supabaseClient
        .from('Marceneiro')
        .select('id, name')
        .eq('id', marceneiroId)
        .maybeSingle();

    if (error || !data) {
        return project;
    }

    return { ...project, marceneiro: data };
}
