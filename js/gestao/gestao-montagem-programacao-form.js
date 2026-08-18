function populateMontagemProgCrewSelects(options = {}) {
    const {
        montadorIds = [],
        cabinetMakerIds = [],
        selectedMontadores = [],
        selectedMarceneiros = []
    } = options;

    const montadoresById = new Map();
    getMontagemProgSelectableMontadores().forEach(montador => {
        montadoresById.set(Number(montador.id), montador);
    });

    montadorIds.forEach(montadorId => {
        const normalizedId = Number(montadorId);
        if (!normalizedId || montadoresById.has(normalizedId)) return;

        const fromProg = selectedMontadores.find(item => Number(item.id) === normalizedId);
        montadoresById.set(normalizedId, fromProg || {
            id: normalizedId,
            name: getMontagemProgMontadorName(normalizedId),
            isActive: false
        });
    });

    const marceneirosById = new Map();
    getMontagemProgSelectableMarceneiros().forEach(marceneiro => {
        marceneirosById.set(Number(marceneiro.id), marceneiro);
    });

    cabinetMakerIds.forEach(cabinetMakerId => {
        const normalizedId = Number(cabinetMakerId);
        if (!normalizedId || marceneirosById.has(normalizedId)) return;

        const fromProg = selectedMarceneiros.find(item => Number(item.id) === normalizedId);
        marceneirosById.set(normalizedId, fromProg || {
            id: normalizedId,
            name: getMontagemProgMarceneiroName(normalizedId),
            isActive: false
        });
    });

    const montadores = [...montadoresById.values()]
        .sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR', { sensitivity: 'base' }));
    const marceneiros = [...marceneirosById.values()]
        .sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR', { sensitivity: 'base' }));

    const montadorOptions = montadores.map(montador => {
        const inactiveSuffix = montador.isActive === false ? ' (inativo)' : '';
        return `<option value="${montador.id}">${escapeHtml(`${montador.name || 'Montador'}${inactiveSuffix}`)}</option>`;
    }).join('');

    const marceneiroOptions = marceneiros.map(marceneiro => {
        const inactiveSuffix = marceneiro.isActive === false ? ' (inativo)' : '';
        return `<option value="${marceneiro.id}">${escapeHtml(`${marceneiro.name || 'Marceneiro'}${inactiveSuffix}`)}</option>`;
    }).join('');

    const selectMontador1 = document.getElementById('montagem-prog-montador-1');
    const selectMontador2 = document.getElementById('montagem-prog-montador-2');
    const selectMarceneiro1 = document.getElementById('montagem-prog-marceneiro-1');
    const selectMarceneiro2 = document.getElementById('montagem-prog-marceneiro-2');
    if (!selectMontador1 || !selectMontador2 || !selectMarceneiro1 || !selectMarceneiro2) return;

    selectMontador1.innerHTML = `<option value="">Selecione...</option>${montadorOptions}`;
    selectMontador2.innerHTML = `<option value="">Nenhum</option>${montadorOptions}`;
    selectMarceneiro1.innerHTML = `<option value="">Selecione...</option>${marceneiroOptions}`;
    selectMarceneiro2.innerHTML = `<option value="">Nenhum</option>${marceneiroOptions}`;

    selectMontador1.value = montadorIds[0] ? String(montadorIds[0]) : '';
    selectMontador2.value = montadorIds[1] ? String(montadorIds[1]) : '';
    selectMarceneiro1.value = cabinetMakerIds[0] ? String(cabinetMakerIds[0]) : '';
    selectMarceneiro2.value = cabinetMakerIds[1] ? String(cabinetMakerIds[1]) : '';
}

function syncMontagemProgClientRequired() {
    const orderCode = document.getElementById('montagem-prog-order-code')?.value.trim();
    const requiredMarker = document.getElementById('montagem-prog-client-required');
    const clientBtn = document.getElementById('btn-montagem-prog-client-picker');
    const hasOrder = Boolean(orderCode);

    requiredMarker?.classList.toggle('hidden', hasOrder);
    if (clientBtn) {
        clientBtn.disabled = hasOrder;
    }
}

function syncMontagemProgCrewExclusivity() {
    const m1 = document.getElementById('montagem-prog-montador-1');
    const m2 = document.getElementById('montagem-prog-montador-2');
    const c1 = document.getElementById('montagem-prog-marceneiro-1');
    const c2 = document.getElementById('montagem-prog-marceneiro-2');

    if (!m1 || !m2 || !c1 || !c2) return;

    const hasMontador = Boolean(m1.value || m2.value);
    const hasMarceneiro = Boolean(c1.value || c2.value);

    if (hasMontador) {
        c1.value = '';
        c2.value = '';
        c1.disabled = true;
        c2.disabled = true;
        m1.disabled = false;
        m2.disabled = false;
    } else if (hasMarceneiro) {
        m1.value = '';
        m2.value = '';
        m1.disabled = true;
        m2.disabled = true;
        c1.disabled = false;
        c2.disabled = false;
    } else {
        m1.disabled = false;
        m2.disabled = false;
        c1.disabled = false;
        c2.disabled = false;
    }
}

async function openMontagemProgModal(prog = null, presetDate = null, presetWorker = null) {
    if (!canEditProgramacaoMontagem()) return;

    hideMontagemProgFloatingTooltip();

    if (typeof loadGestaoMontadores === 'function') {
        await loadGestaoMontadores(true);
    }
    if (typeof loadMarceneiros === 'function') {
        await loadMarceneiros(true);
    }

    editingMontagemProgId = prog?.id || null;

    const titleEl = document.getElementById('montagem-prog-modal-title');
    const deleteBtn = document.getElementById('btn-montagem-prog-delete');
    if (titleEl) {
        titleEl.textContent = editingMontagemProgId ? 'Editar montagem' : 'Nova montagem';
    }
    deleteBtn?.classList.toggle('hidden', !editingMontagemProgId);

    const montadorIds = prog ? getMontagemProgMontadorIds(prog) : [];
    const cabinetMakerIds = prog ? getMontagemProgMarceneiroIds(prog) : [];

    if (presetWorker?.type === 'montador' && !montadorIds.length && !cabinetMakerIds.length) {
        montadorIds.push(Number(presetWorker.id));
    }
    if (presetWorker?.type === 'marceneiro' && !montadorIds.length && !cabinetMakerIds.length) {
        cabinetMakerIds.push(Number(presetWorker.id));
    }

    populateMontagemProgCrewSelects({
        montadorIds,
        cabinetMakerIds,
        selectedMontadores: prog ? getMontagemProgMontadores(prog) : [],
        selectedMarceneiros: prog ? getMontagemProgMarceneiros(prog) : []
    });

    syncMontagemProgCrewExclusivity();

    const defaultDate = presetDate || getMontagemProgWeekStartKey();
    document.getElementById('montagem-prog-start-date').value = prog?.startDate || defaultDate;
    document.getElementById('montagem-prog-end-date').value = prog?.endDate || defaultDate;
    document.getElementById('montagem-prog-order-code').value = getMontagemProgOrderLabel(prog);
    document.getElementById('montagem-prog-client-name').value = getMontagemProgClientLabel(prog);
    const clientIdInput = document.getElementById('montagem-prog-client-id');
    if (clientIdInput) {
        clientIdInput.value = prog?.clientId
            ? String(prog.clientId)
            : (prog?.order?.clientId ? String(prog.order.clientId) : (prog?.client?.id ? String(prog.client.id) : ''));
    }
    document.getElementById('montagem-prog-observation').value = prog?.observation || '';

    syncMontagemProgClientRequired();
    toggleModal('montagem-prog-modal', true);
}

async function saveMontagemProg(event) {
    event.preventDefault();
    if (!canEditProgramacaoMontagem()) return;

    const startDate = document.getElementById('montagem-prog-start-date')?.value;
    const endDate = document.getElementById('montagem-prog-end-date')?.value;
    const montador1 = Number(document.getElementById('montagem-prog-montador-1')?.value);
    const montador2 = Number(document.getElementById('montagem-prog-montador-2')?.value);
    const marceneiro1 = Number(document.getElementById('montagem-prog-marceneiro-1')?.value);
    const marceneiro2 = Number(document.getElementById('montagem-prog-marceneiro-2')?.value);
    const orderCode = document.getElementById('montagem-prog-order-code')?.value.trim();
    const clientId = Number(document.getElementById('montagem-prog-client-id')?.value) || null;
    const observation = document.getElementById('montagem-prog-observation')?.value.trim() || '';

    if (!startDate || !endDate) {
        alertAppDialog('Informe as datas de início e fim.');
        return;
    }

    if (startDate > endDate) {
        alertAppDialog('A data de início não pode ser posterior à data de fim.');
        return;
    }

    const montadorIds = [montador1, montador2].filter(Boolean);
    const cabinetMakerIds = [marceneiro1, marceneiro2].filter(Boolean);

    if (!montadorIds.length && !cabinetMakerIds.length) {
        alertAppDialog('Selecione ao menos um montador ou marceneiro.');
        return;
    }

    if (montadorIds.length && cabinetMakerIds.length) {
        alertAppDialog('Ou é marceneiro ou é montador na montagem. Não é permitido misturar os dois.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (montador2 && montador2 === montador1) {
        alertAppDialog('Selecione montadores diferentes para formar a dupla.');
        return;
    }

    if (marceneiro2 && marceneiro2 === marceneiro1) {
        alertAppDialog('Selecione marceneiros diferentes para formar a dupla.');
        return;
    }

    let orderId = null;
    let resolvedClientId = clientId;
    if (orderCode) {
        const order = await lookupMontagemProgOrderByCode(orderCode);
        if (!order) {
            alertAppDialog('Pedido não encontrado para o código informado.');
            return;
        }
        orderId = order.id;
        resolvedClientId = order.clientId || resolvedClientId;
    } else if (!resolvedClientId) {
        alertAppDialog('Selecione o cliente no cadastro quando não houver código de pedido.');
        return;
    }

    const now = new Date().toISOString();
    const payload = {
        startDate,
        endDate,
        orderId,
        clientId: resolvedClientId,
        observation,
        updatedAt: now,
        updatedById: currentUser.id
    };

    try {
        let assemblyScheduleId = editingMontagemProgId;

        if (editingMontagemProgId) {
            const { error } = await supabaseClient
                .from('AssemblySchedule')
                .update(payload)
                .eq('id', editingMontagemProgId);
            if (error) throw error;
        } else {
            const { data: created, error } = await supabaseClient
                .from('AssemblySchedule')
                .insert({
                    ...payload,
                    createdById: currentUser.id
                })
                .select('id')
                .single();
            if (error) throw error;
            assemblyScheduleId = created.id;
        }

        await persistMontagemProgCrew(assemblyScheduleId, montadorIds, cabinetMakerIds);
        editingMontagemProgId = null;
        toggleModal('montagem-prog-modal', false);
        await loadMontagemProgramacaoView();
        warnMontagemProgConflictsIfNeeded();
    } catch (error) {
        console.error('saveMontagemProg:', error);
        const sqlHint = error.message?.includes('AssemblyScheduleCabinetMaker')
            ? '\n\nExecute supabase/rename/phase-05-assembly-schedule.sql no Supabase.'
            : (error.message?.includes('AssemblySchedule')
                ? '\n\nExecute supabase/rename/phase-05-assembly-schedule.sql no Supabase.'
                : '');
        alertAppDialog('Erro ao salvar montagem: ' + error.message + sqlHint);
    }
}

async function deleteMontagemProg() {
    if (!editingMontagemProgId || !canEditProgramacaoMontagem()) return;
    if (!(await confirmAppDialog('Excluir esta programação de montagem?'))) return;

    const { error } = await supabaseClient
        .from('AssemblySchedule')
        .delete()
        .eq('id', editingMontagemProgId);

    if (error) {
        alertAppDialog('Erro ao excluir montagem: ' + error.message);
        return;
    }

    editingMontagemProgId = null;
    toggleModal('montagem-prog-modal', false);
    await loadMontagemProgramacaoView();
}

function warnMontagemProgConflictsIfNeeded() {
    const conflictMap = buildMontagemProgConflictMap(montagemProgCache);
    if (!conflictMap.size) return;

    alertAppDialog(
        'Existem montadores ou marceneiros programados em mais de uma obra no mesmo dia. Revise as barras destacadas em amarelo.',
        { variant: 'warning', title: 'Conflito de agenda' }
    );
}

async function copyMontagemProgPreviousWeek() {
    if (!canEditProgramacaoMontagem()) return;

    const prevWeekStartKey = montagemProgToDateKey(montagemProgAddDays(montagemProgWeekAnchor, -7));
    const prevProgramacoes = await loadMontagemProgramacoesForWeek(prevWeekStartKey, false);

    if (!prevProgramacoes.length) {
        alertAppDialog('A semana anterior não possui montagens para copiar.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (montagemProgCache.length) {
        const confirmed = await confirmAppDialog(
            'A semana atual já possui montagens. Deseja copiar também as da semana anterior?'
        );
        if (!confirmed) return;
    }

    const now = new Date().toISOString();

    try {
        for (const prog of prevProgramacoes) {
            const { data: created, error } = await supabaseClient
                .from('AssemblySchedule')
                .insert({
                    startDate: shiftMontagemProgDateKey(prog.startDate, 7),
                    endDate: shiftMontagemProgDateKey(prog.endDate, 7),
                    orderId: prog.orderId || null,
                    clientId: prog.clientId || prog.order?.clientId || prog.client?.id || null,
                    observation: prog.observation || '',
                    createdById: currentUser.id,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .select('id')
                .single();

            if (error) throw error;

            const montadorIds = getMontagemProgMontadorIds(prog);
            const cabinetMakerIds = getMontagemProgMarceneiroIds(prog);
            if (montadorIds.length || cabinetMakerIds.length) {
                await persistMontagemProgCrew(created.id, montadorIds, cabinetMakerIds);
            }
        }

        await loadMontagemProgramacaoView();
        alertAppDialog(
            `${prevProgramacoes.length} montagem(ns) copiada(s) da semana anterior.`,
            { variant: 'success', title: 'Semana copiada' }
        );
        warnMontagemProgConflictsIfNeeded();
    } catch (error) {
        console.error('copyMontagemProgPreviousWeek:', error);
        const sqlHint = error.message?.includes('AssemblySchedule')
            ? '\n\nExecute supabase/rename/phase-05-assembly-schedule.sql no Supabase.'
            : '';
        alertAppDialog('Erro ao copiar semana anterior: ' + error.message + sqlHint);
        await loadMontagemProgramacaoView();
    }
}

function printMontagemProgWeek() {
    const weekLabel = document.getElementById('montagem-prog-week-label')?.textContent || '';
    const printLabel = document.getElementById('montagem-prog-print-week-label');
    if (printLabel) printLabel.textContent = weekLabel;

    const filterSelect = document.getElementById('montagem-prog-montador-filter');
    const previousFilter = montagemProgWorkerFilter;
    if (previousFilter) {
        montagemProgWorkerFilter = null;
        if (filterSelect) filterSelect.value = '';
        renderMontagemProgWeekGrid();
    }

    document.body.classList.add('montagem-prog-printing');
    window.print();
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('montagem-prog-printing');
        if (previousFilter) {
            montagemProgWorkerFilter = previousFilter;
            if (filterSelect) filterSelect.value = getMontagemProgWorkerFilterKey(previousFilter);
            renderMontagemProgPalette();
            renderMontagemProgWeekGrid();
        }
    }, { once: true });
}
