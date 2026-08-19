async function lookupMontagemProgOrderByCode(orderCode) {
    const trimmed = String(orderCode || '').trim();
    if (!trimmed) return null;

    const { data, error } = await supabaseClient
        .from('salesOrders')
        .select(getSalesOrderMinimalEmbedSelect())
        .eq('orderCode', trimmed)
        .maybeSingle();

    if (error) {
        console.error('lookupMontagemProgOrderByCode:', error);
        return null;
    }

    return data;
}

async function loadMontagemProgramacoesForWeek(weekStartKey = getMontagemProgWeekStartKey(), updateCache = true) {
    const weekEndKey = montagemProgToDateKey(montagemProgAddDays(montagemProgParseDateKey(weekStartKey), 6));

    const selectVariants = [
        `
            *,
            order:salesOrders(${getSalesOrderMinimalEmbedSelect()}),
            client:Client(id, name),
            installers:AssemblyScheduleInstaller(
                id, installerId,
                installer:Installer(id, name)
            ),
            cabinetMakers:AssemblyScheduleCabinetMaker(
                id, cabinetMakerId,
                cabinetMaker:CabinetMaker(id, name)
            )
        `,
        `
            *,
            installers:AssemblyScheduleInstaller(id, installerId, installer:Installer(id, name)),
            cabinetMakers:AssemblyScheduleCabinetMaker(id, cabinetMakerId, cabinetMaker:CabinetMaker(id, name))
        `,
        `
            *,
            installers:AssemblyScheduleInstaller(id, installerId),
            cabinetMakers:AssemblyScheduleCabinetMaker(id, cabinetMakerId)
        `,
        `
            *,
            installers:AssemblyScheduleInstaller(
                id, installerId,
                installer:Installer(id, name)
            )
        `,
        `
            *,
            installers:AssemblyScheduleInstaller(id, installerId, installer:Installer(id, name))
        `,
        `
            *,
            installers:AssemblyScheduleInstaller(id, installerId)
        `,
        '*'
    ];

    let result = { data: [], error: null };

    for (const selectColumns of selectVariants) {
        result = await supabaseClient
            .from('AssemblySchedule')
            .select(selectColumns)
            .lte('startDate', weekEndKey)
            .gte('endDate', weekStartKey)
            .order('startDate', { ascending: true })
            .order('id', { ascending: true });

        if (!result.error) break;

        if (result.error.message?.includes('AssemblySchedule')) {
            if (updateCache) montagemProgCache = [];
            return [];
        }
    }

    if (result.error) {
        console.error('loadMontagemProgramacoesForWeek:', result.error);
        if (updateCache) montagemProgCache = [];
        return [];
    }

    let programacoes = result.data || [];

    if (programacoes.some(prog => !prog.installers)) {
        const ids = programacoes.map(prog => prog.id).filter(Boolean);
        if (ids.length) {
            const { data: montadorRows } = await supabaseClient
                .from('AssemblyScheduleInstaller')
                .select('id, assemblyScheduleId, installerId, installer:Installer(id, name)')
                .in('assemblyScheduleId', ids);

            const byProgId = {};
            (montadorRows || []).forEach(row => {
                const progId = Number(row.assemblyScheduleId);
                if (!byProgId[progId]) byProgId[progId] = [];
                byProgId[progId].push(row);
            });

            programacoes = programacoes.map(prog => ({
                ...prog,
                installers: prog.installers || byProgId[Number(prog.id)] || []
            }));
        }
    }

    if (programacoes.some(prog => prog.cabinetMakers === undefined)) {
        const ids = programacoes.map(prog => prog.id).filter(Boolean);
        if (ids.length) {
            const { data: marceneiroRows, error: marceneiroError } = await supabaseClient
                .from('AssemblyScheduleCabinetMaker')
                .select('id, assemblyScheduleId, cabinetMakerId, cabinetMaker:CabinetMaker(id, name)')
                .in('assemblyScheduleId', ids);

            if (!marceneiroError) {
                const byProgId = {};
                (marceneiroRows || []).forEach(row => {
                    const progId = Number(row.assemblyScheduleId);
                    if (!byProgId[progId]) byProgId[progId] = [];
                    byProgId[progId].push(row);
                });

                programacoes = programacoes.map(prog => ({
                    ...prog,
                    cabinetMakers: prog.cabinetMakers || byProgId[Number(prog.id)] || []
                }));
            } else if (!marceneiroError.message?.includes('AssemblyScheduleCabinetMaker')) {
                console.warn('loadMontagemProgramacoesForWeek cabinetMakers:', marceneiroError);
            } else {
                programacoes = programacoes.map(prog => ({
                    ...prog,
                    cabinetMakers: prog.cabinetMakers || []
                }));
            }
        }
    }

    if (updateCache) montagemProgCache = programacoes;
    return programacoes;
}

async function updateMontagemProgDates(programacaoId, startDate, endDate) {
    if (!canEditProgramacaoMontagem()) return;

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('AssemblySchedule')
        .update({
            startDate,
            endDate,
            updatedAt: now,
            updatedById: currentUser.id
        })
        .eq('id', programacaoId);

    if (error) {
        alertAppDialog('Erro ao ajustar datas: ' + error.message);
        await loadMontagemProgramacaoView();
        return;
    }

    await loadMontagemProgramacaoView();
    warnMontagemProgConflictsIfNeeded();
}

async function persistMontagemProgMontadores(assemblyScheduleId, montadorIds) {
    const uniqueIds = [...new Set(montadorIds.map(id => Number(id)).filter(Boolean))].slice(0, 2);

    const { data: current } = await supabaseClient
        .from('AssemblyScheduleInstaller')
        .select('id, installerId')
        .eq('assemblyScheduleId', assemblyScheduleId);

    const keepIds = new Set(uniqueIds);
    const deleteIds = (current || [])
        .filter(row => !keepIds.has(Number(row.installerId)))
        .map(row => row.id);

    if (deleteIds.length) {
        const { error } = await supabaseClient
            .from('AssemblyScheduleInstaller')
            .delete()
            .in('id', deleteIds);
        if (error) throw error;
    }

    for (const installerId of uniqueIds) {
        const exists = (current || []).some(row => Number(row.installerId) === installerId);
        if (exists) continue;

        const { error } = await supabaseClient
            .from('AssemblyScheduleInstaller')
            .insert({ assemblyScheduleId, installerId });
        if (error) throw error;
    }
}

async function persistMontagemProgMarceneiros(assemblyScheduleId, cabinetMakerIds) {
    const uniqueIds = [...new Set(cabinetMakerIds.map(id => Number(id)).filter(Boolean))].slice(0, 2);

    const { data: current, error: readError } = await supabaseClient
        .from('AssemblyScheduleCabinetMaker')
        .select('id, cabinetMakerId')
        .eq('assemblyScheduleId', assemblyScheduleId);

    if (readError?.message?.includes('AssemblyScheduleCabinetMaker')) return;
    if (readError) throw readError;

    const keepIds = new Set(uniqueIds);
    const deleteIds = (current || [])
        .filter(row => !keepIds.has(Number(row.cabinetMakerId)))
        .map(row => row.id);

    if (deleteIds.length) {
        const { error } = await supabaseClient
            .from('AssemblyScheduleCabinetMaker')
            .delete()
            .in('id', deleteIds);
        if (error) throw error;
    }

    for (const cabinetMakerId of uniqueIds) {
        const exists = (current || []).some(row => Number(row.cabinetMakerId) === cabinetMakerId);
        if (exists) continue;

        const { error } = await supabaseClient
            .from('AssemblyScheduleCabinetMaker')
            .insert({ assemblyScheduleId, cabinetMakerId });
        if (error) throw error;
    }
}

async function persistMontagemProgCrew(assemblyScheduleId, montadorIds, cabinetMakerIds) {
    const normalizedMontadorIds = [...new Set(montadorIds.map(id => Number(id)).filter(Boolean))].slice(0, 2);
    const normalizedMarceneiroIds = [...new Set(cabinetMakerIds.map(id => Number(id)).filter(Boolean))].slice(0, 2);

    if (normalizedMontadorIds.length && normalizedMarceneiroIds.length) {
        throw new Error('Marceneiro e montador não podem ser agendados juntos na mesma montagem.');
    }

    await persistMontagemProgMontadores(assemblyScheduleId, normalizedMontadorIds);
    await persistMontagemProgMarceneiros(assemblyScheduleId, normalizedMarceneiroIds);
}

async function createMontagemProgFromDrop(worker, dateKey, targetProgramacaoId = null) {
    if (!canEditProgramacaoMontagem() || !worker?.type || !worker?.id) return;

    try {
        if (targetProgramacaoId) {
            const prog = montagemProgCache.find(item => Number(item.id) === Number(targetProgramacaoId));
            if (!prog) return;

            const crewMembers = getMontagemProgCrewMembers(prog);
            if (crewMembers.some(member => member.type === worker.type && member.id === worker.id)) return;

            if (crewMembers.length >= 2) {
                alertAppDialog('Esta montagem já possui dupla.', { variant: 'warning', title: 'Aviso' });
                return;
            }

            if (crewMembers.length === 1 && crewMembers[0].type !== worker.type) {
                alertAppDialog('Marceneiro e montador não podem formar dupla.', { variant: 'warning', title: 'Aviso' });
                return;
            }

            const montadorIds = getMontagemProgMontadorIds(prog);
            const cabinetMakerIds = getMontagemProgMarceneiroIds(prog);

            if (worker.type === 'montador') {
                await persistMontagemProgCrew(targetProgramacaoId, [...montadorIds, worker.id], cabinetMakerIds);
            } else {
                await persistMontagemProgCrew(targetProgramacaoId, montadorIds, [...cabinetMakerIds, worker.id]);
            }

            await loadMontagemProgramacaoView();
            warnMontagemProgConflictsIfNeeded();
            return;
        }

        if (!dateKey) return;

        const now = new Date().toISOString();
        const { data: created, error } = await supabaseClient
            .from('AssemblySchedule')
            .insert({
                startDate: dateKey,
                endDate: dateKey,
                observation: '',
                createdById: currentUser.id,
                updatedById: currentUser.id,
                updatedAt: now
            })
            .select('id')
            .single();

        if (error) throw error;

        if (worker.type === 'montador') {
            await persistMontagemProgCrew(created.id, [worker.id], []);
        } else {
            await persistMontagemProgCrew(created.id, [], [worker.id]);
        }

        await loadMontagemProgramacaoView();

        const createdProg = montagemProgCache.find(item => Number(item.id) === Number(created.id));
        openMontagemProgModal(createdProg || {
            id: created.id,
            startDate: dateKey,
            endDate: dateKey,
            installers: [],
            cabinetMakers: []
        }, null, worker);
        warnMontagemProgConflictsIfNeeded();
    } catch (error) {
        console.error('createMontagemProgFromDrop:', error);
        const sqlHint = error.message?.includes('AssemblyScheduleCabinetMaker')
            ? '\n\nConsulte PENDING-PROD-SQL.md ou supabase/schema/.'
            : (error.message?.includes('AssemblySchedule')
                ? '\n\nConsulte PENDING-PROD-SQL.md ou supabase/schema/.'
                : '');
        alertAppDialog('Erro ao criar montagem: ' + error.message + sqlHint);
    }
}

