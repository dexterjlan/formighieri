async function attachModuleObservationsToConferences(conferences) {
    const moduleIds = conferences.flatMap(conference =>
        (conference.conferenceProjects || []).flatMap(project =>
            (project.modules || []).map(module => module.id).filter(Boolean)
        )
    );

    if (!moduleIds.length) return conferences;

    let result = await supabaseClient
        .from('AnteprojetoModuleObservation')
        .select(`
            *,
            observation:AnteprojetoObservation(id, text)
        `)
        .in('moduleId', moduleIds)
        .order('sortOrder', { ascending: true });

    if (result.error) {
        result = await supabaseClient
            .from('AnteprojetoModuleObservation')
            .select('*')
            .in('moduleId', moduleIds)
            .order('sortOrder', { ascending: true });
    }

    if (result.error) {
        console.error('attachModuleObservationsToConferences:', result.error);
        return conferences;
    }

    const observationIds = [...new Set((result.data || []).map(row => row.observationId).filter(Boolean))];
    let observationById = {};
    if (observationIds.length) {
        const { data: catalog } = await supabaseClient
            .from('AnteprojetoObservation')
            .select('id, text')
            .in('id', observationIds);
        catalog?.forEach(item => { observationById[item.id] = item; });
    }

    const byModuleId = {};
    (result.data || []).forEach(row => {
        if (!byModuleId[row.moduleId]) byModuleId[row.moduleId] = [];
        byModuleId[row.moduleId].push({
            ...row,
            observation: row.observation || observationById[row.observationId] || null
        });
    });

    return conferences.map(conference => ({
        ...conference,
        conferenceProjects: (conference.conferenceProjects || []).map(project => ({
            ...project,
            modules: (project.modules || []).map(module => ({
                ...module,
                observations: Object.prototype.hasOwnProperty.call(byModuleId, module.id)
                    ? byModuleId[module.id]
                    : (module.observations || [])
            }))
        }))
    }));
}

async function upsertModuleObservationRow(payload) {
    const attempt = async (data) => supabaseClient
        .from('AnteprojetoModuleObservation')
        .insert(data)
        .select('id')
        .single();

    let { data, error } = await attempt(payload);
    if (error?.message?.includes('consultorChecked') || error?.message?.includes('consultorResponse')) {
        const { consultorChecked: _c, consultorResponse: _r, ...fallback } = payload;
        ({ data, error } = await attempt(fallback));
    }
    if (error) throw error;
    return data;
}

async function updateModuleObservationRow(id, payload) {
    const attempt = async (data) => supabaseClient
        .from('AnteprojetoModuleObservation')
        .update(data)
        .eq('id', id);

    let { error } = await attempt(payload);
    if (error?.message?.includes('consultorChecked') || error?.message?.includes('consultorResponse')) {
        const { consultorChecked: _c, consultorResponse: _r, ...fallback } = payload;
        ({ error } = await attempt(fallback));
    }
    if (error) throw error;
}

async function persistModuleObservations(moduleId, observations, options = {}) {
    const { canEditStructure = true, canEditConsultor = false } = options;
    const rows = observations || [];

    if (canEditConsultor && !canEditStructure) {
        for (const obs of rows) {
            if (!obs.id) continue;
            await updateModuleObservationRow(obs.id, {
                consultorChecked: obs.consultorChecked,
                consultorResponse: obs.consultorResponse || null
            });
        }
        return;
    }

    if (!canEditStructure) return;

    const { data: current } = await supabaseClient
        .from('AnteprojetoModuleObservation')
        .select('id')
        .eq('moduleId', moduleId);

    const keepIds = rows.filter(obs => obs.id).map(obs => obs.id);
    const deleteIds = (current || [])
        .map(row => row.id)
        .filter(id => !keepIds.includes(id));

    if (deleteIds.length) {
        await supabaseClient
            .from('AnteprojetoModuleObservation')
            .delete()
            .in('id', deleteIds);
    }

    for (let index = 0; index < rows.length; index += 1) {
        const obs = rows[index];
        const observationId = await upsertAnteprojetoObservation(obs.text);
        if (!observationId) {
            throw new Error(`Não foi possível salvar a observação "${obs.text}".`);
        }

        const payload = {
            observationId,
            sortOrder: index,
            consultorChecked: obs.consultorChecked || false,
            consultorResponse: obs.consultorResponse || null
        };

        if (obs.id) {
            await updateModuleObservationRow(obs.id, payload);
            continue;
        }

        await upsertModuleObservationRow({
            moduleId,
            ...payload
        });
    }
}

async function persistAnteprojetoConferenceData(conferenceId, selectedProjects, modules, options = {}) {
    const {
        canEditStructure = true,
        canExtendStructure = false,
        canEditConsultor = false
    } = options;
    const now = new Date().toISOString();
    const projectIdByOrderProject = {};

    if (canExtendStructure && canEditStructure) {
        const { data: currentProjects } = await supabaseClient
            .from('AnteprojetoConferenceProject')
            .select('id, orderProjectId')
            .eq('conferenceId', conferenceId);

        const keepOrderProjectIds = selectedProjects.map(project => project.orderProjectId);
        const deleteProjectIds = (currentProjects || [])
            .filter(project => !keepOrderProjectIds.includes(Number(project.orderProjectId)))
            .map(project => project.id);

        if (deleteProjectIds.length) {
            await supabaseClient
                .from('AnteprojetoConferenceProject')
                .delete()
                .in('id', deleteProjectIds);
        }

        for (const project of selectedProjects) {
            const existing = (currentProjects || []).find(
                row => Number(row.orderProjectId) === Number(project.orderProjectId)
            );

            if (existing) {
                const { error } = await supabaseClient
                    .from('AnteprojetoConferenceProject')
                    .update({ sortOrder: project.sortOrder })
                    .eq('id', existing.id);
                if (error) throw error;
                projectIdByOrderProject[project.orderProjectId] = existing.id;
                continue;
            }

            const { data: inserted, error } = await supabaseClient
                .from('AnteprojetoConferenceProject')
                .insert({
                    conferenceId,
                    orderProjectId: project.orderProjectId,
                    sortOrder: project.sortOrder
                })
                .select('id')
                .single();
            if (error) throw error;
            projectIdByOrderProject[project.orderProjectId] = inserted.id;
        }
    } else {
        const { data: currentProjects } = await supabaseClient
            .from('AnteprojetoConferenceProject')
            .select('id, orderProjectId')
            .eq('conferenceId', conferenceId);
        (currentProjects || []).forEach(project => {
            projectIdByOrderProject[project.orderProjectId] = project.id;
        });
    }

    const existingModuleIds = modules.filter(module => module.id).map(module => module.id);
    if (canExtendStructure && canEditStructure) {
        const conferenceProjectIds = Object.values(projectIdByOrderProject);
        let moduleRows = [];
        if (conferenceProjectIds.length) {
            const { data: currentModules } = await supabaseClient
                .from('AnteprojetoModule')
                .select('id')
                .in('conferenceProjectId', conferenceProjectIds);
            moduleRows = currentModules || [];
        }

        const deleteModuleIds = moduleRows
            .map(module => module.id)
            .filter(id => !existingModuleIds.includes(id));

        if (deleteModuleIds.length) {
            await supabaseClient.from('AnteprojetoModule').delete().in('id', deleteModuleIds);
        }
    }

    for (const module of modules) {
        const conferenceProjectId = projectIdByOrderProject[module.orderProjectId];
        if (!conferenceProjectId && canEditStructure) {
            throw new Error('Projeto do módulo não encontrado na conferência.');
        }

        if (module.id) {
            const updatePayload = { updatedAt: now };
            if (canExtendStructure && canEditStructure) {
                updatePayload.conferenceProjectId = conferenceProjectId;
                updatePayload.name = module.name;
                updatePayload.sortOrder = module.sortOrder;
            }

            const { error } = await supabaseClient
                .from('AnteprojetoModule')
                .update(updatePayload)
                .eq('id', module.id);
            if (error) throw error;

            if (canEditStructure) {
                await persistModuleObservations(module.id, module.observations || [], {
                    canEditStructure,
                    canEditConsultor
                });
            } else if (canEditConsultor && module.observations?.length) {
                await persistModuleObservations(module.id, module.observations, {
                    canEditStructure: false,
                    canEditConsultor: true
                });
            }
            continue;
        }

        if (!canExtendStructure || !canEditStructure) continue;

        const { data: insertedModule, error } = await supabaseClient
            .from('AnteprojetoModule')
            .insert({
                conferenceProjectId,
                name: module.name,
                sortOrder: module.sortOrder
            })
            .select('id')
            .single();
        if (error) throw error;

        await persistModuleObservations(insertedModule.id, module.observations || [], {
            canEditStructure: true,
            canEditConsultor: false
        });
    }
}

async function saveAnteprojetoConference() {
    const conference = editingAnteprojetoConferenceId
        ? anteprojetoConferencesCache.find(c => c.id === editingAnteprojetoConferenceId)
        : null;

    const canEditStructure = canEditAnteprojetoConference(conference);
    const canExtendStructure = canExtendAnteprojetoConferenceStructure(conference);
    const canEditConsultor = canEditAnteprojetoConsultorFields(conference);

    if (!canEditStructure && !canEditConsultor) {
        alertAppDialog('Você não tem permissão para salvar esta conferência.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const designerId = Number(document.getElementById('anteprojeto-designer')?.value);
    const sketchUpPath = document.getElementById('anteprojeto-sketchup-path')?.value.trim() || null;
    const conferenceObservation = document.getElementById('anteprojeto-conference-observation')?.value.trim() || null;
    const selectedProjects = collectSelectedProjectsFromDom();
    const modules = collectAnteprojetoModulesFromDom();

    if (canEditStructure) {
        if (!selectedProjects.length) {
            alertAppDialog('Adicione ao menos um projeto.');
            return;
        }
        if (!designerId) {
            alertAppDialog('Selecione o projetista.');
            return;
        }
        if (!modules.length) {
            alertAppDialog('Adicione ao menos um módulo.');
            return;
        }

        const modulesByProject = {};
        modules.forEach(module => {
            if (!modulesByProject[module.orderProjectId]) {
                modulesByProject[module.orderProjectId] = [];
            }
            modulesByProject[module.orderProjectId].push(module);
        });
        for (const project of selectedProjects) {
            const projectModules = modulesByProject[project.orderProjectId] || [];
            if (!projectModules.length) {
                const section = document.querySelector(
                    `.anteprojeto-project-section[data-order-project-id="${project.orderProjectId}"]`
                );
                const label = section?.dataset.projectLabel || 'um projeto';
                alertAppDialog(`Adicione ao menos um módulo em ${label}.`);
                return;
            }
        }

        for (const module of modules) {
            if (!module.name) {
                alertAppDialog('Informe o nome de todos os módulos.');
                return;
            }
            if (!module.observations.length) {
                alertAppDialog(`Adicione ao menos uma observação no módulo "${module.name}".`);
                return;
            }
        }
    }

    const now = new Date().toISOString();
    const isNewConference = !conference;

    try {
        setAnteprojetoModalLoading(true, isNewConference ? 'Registrando conferência...' : 'Salvando conferência...');
        let conferenceId = conference?.id;

        if (conference) {
            if (canEditStructure) {
                const { error } = await supabaseClient
                    .from('AnteprojetoConference')
                    .update({
                        designerId,
                        sketchUpPath,
                        conferenceObservation,
                        updatedAt: now,
                        updatedById: currentUser.id
                    })
                    .eq('id', conference.id);
                if (error) throw error;
            }
        } else {
            const { data: created, error } = await supabaseClient
                .from('AnteprojetoConference')
                .insert({
                    orderId: activeOrderId,
                    designerId,
                    sketchUpPath,
                    conferenceObservation,
                    status: 'Em andamento',
                    createdById: currentUser.id,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .select('id')
                .single();
            if (error) throw error;
            conferenceId = created.id;
        }

        setAnteprojetoModalLoading(true, 'Salvando projetos e módulos...');
        await persistAnteprojetoConferenceData(
            conferenceId,
            selectedProjects,
            modules,
            { canEditStructure, canExtendStructure, canEditConsultor }
        );

        if (isNewConference) {
            setAnteprojetoModalLoading(true, 'Atualizando status dos projetos...');
            await applyConferenciaEnviadaStatusToProjects(
                selectedProjects.map(project => project.orderProjectId)
            );
            if (typeof notifyConferenciaEnviadaEmail === 'function') {
                setAnteprojetoModalLoading(true, 'Enviando e-mail de notificação...');
                await notifyConferenciaEnviadaEmail({
                    orderId: activeOrderId,
                    orderProjectIds: selectedProjects.map(project => project.orderProjectId),
                    designerId,
                    sketchUpPath,
                    conferenceObservation
                });
            }
        }

        setAnteprojetoModalLoading(true, 'Atualizando telas...');
        await loadAnteprojetoObservations();
        refreshAnteprojetoObservationDatalist();
        await loadAnteprojetoConferences(activeOrderId);
        if (typeof loadOrderProjects === 'function' && activeOrderId) {
            await loadOrderProjects(activeOrderId);
        }
        await refreshAnteprojetoRelatedViews();

        setAnteprojetoModalLoading(
            true,
            isNewConference ? 'Conferência criada e notificação enviada!' : 'Conferência salva com sucesso!',
            'success'
        );
        await new Promise(resolve => setTimeout(resolve, 900));
        closeAnteprojetoModal();
    } catch (error) {
        setAnteprojetoModalLoading(true, `Erro ao salvar conferência: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setAnteprojetoModalLoading(false);
    }
}
