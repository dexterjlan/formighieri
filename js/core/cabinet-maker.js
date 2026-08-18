let cabinetMakersCache = [];

async function loadCabinetMakers(activeOnly = true) {
    let query = supabaseClient
        .from('CabinetMaker')
        .select('id, name, sortOrder, isActive')
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('loadCabinetMakers:', error);
        cabinetMakersCache = [];
        return [];
    }

    cabinetMakersCache = data || [];
    return cabinetMakersCache;
}

function resetCabinetMakersCache() {
    cabinetMakersCache = [];
}

function getCabinetMakerOptionsHtml(selectedId = null) {
    if (!cabinetMakersCache.length) {
        return '<option value="">Nenhum marceneiro cadastrado</option>';
    }

    const options = ['<option value="">Selecione...</option>'];
    cabinetMakersCache.forEach(cabinetMaker => {
        const selected = Number(selectedId) === Number(cabinetMaker.id) ? ' selected' : '';
        options.push(`<option value="${cabinetMaker.id}"${selected}>${escapeHtml(cabinetMaker.name)}</option>`);
    });
    return options.join('');
}

function resolveCabinetMakerRecord(project) {
    if (!project) return null;

    let cabinetMaker = project.cabinetMaker;
    if (Array.isArray(cabinetMaker)) {
        cabinetMaker = cabinetMaker.find(item => item?.name) || cabinetMaker[0] || null;
    }
    if (cabinetMaker?.name) return cabinetMaker;

    const cabinetMakerId = Number(project.cabinetMakerId);
    if (!cabinetMakerId) return null;

    return cabinetMakersCache.find(item => Number(item.id) === cabinetMakerId) || null;
}

function getCabinetMakerNameFromProject(project) {
    return resolveCabinetMakerRecord(project)?.name || '—';
}

async function enrichProjectCabinetMaker(project) {
    if (!project) return project;

    const existing = resolveCabinetMakerRecord(project);
    if (existing?.name) {
        return { ...project, cabinetMaker: existing };
    }

    const cabinetMakerId = Number(project.cabinetMakerId);
    if (!cabinetMakerId) return project;

    if (!cabinetMakersCache.length) {
        await loadCabinetMakers(false);
        const fromCache = cabinetMakersCache.find(item => Number(item.id) === cabinetMakerId);
        if (fromCache?.name) {
            return { ...project, cabinetMaker: { id: fromCache.id, name: fromCache.name } };
        }
    }

    const { data, error } = await supabaseClient
        .from('CabinetMaker')
        .select('id, name')
        .eq('id', cabinetMakerId)
        .maybeSingle();

    if (error || !data) {
        return project;
    }

    return { ...project, cabinetMaker: data };
}

// Aliases legados (português)
const loadMarceneiros = loadCabinetMakers;
const resetMarceneirosCache = resetCabinetMakersCache;
const getMarceneiroOptionsHtml = getCabinetMakerOptionsHtml;
const resolveMarceneiroRecord = resolveCabinetMakerRecord;
const getMarceneiroNameFromProject = getCabinetMakerNameFromProject;
const enrichProjectMarceneiro = enrichProjectCabinetMaker;
