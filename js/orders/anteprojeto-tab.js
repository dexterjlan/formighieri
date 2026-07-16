function bindAnteprojetoTreeToggles(root) {
    root.querySelectorAll('.anteprojeto-tree-node').forEach(node => {
        const row = node.querySelector(':scope > .anteprojeto-tree-row');
        const children = node.querySelector(':scope > .anteprojeto-tree-children');
        const btn = row?.querySelector('.anteprojeto-tree-toggle');
        if (!row || !children || !btn) return;

        btn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const collapsed = children.classList.toggle('hidden');
            btn.textContent = collapsed ? '▶' : '▼';
            btn.setAttribute('aria-label', collapsed ? 'Expandir' : 'Recolher');
        });
    });
}

function renderAnteprojetoObservationTableHeader() {
    return `
        <div class="anteprojeto-obs-table-header grid grid-cols-[1fr_5rem_1fr] gap-2 px-2 py-1.5 bg-slate-50 text-[10px] uppercase text-slate-500 font-semibold border-b border-slate-200">
            <span>Observação</span>
            <span class="text-center">Conferido</span>
            <span>Resposta</span>
        </div>
    `;
}

function renderAnteprojetoObservationLeaf(obs) {
    return `
        <div class="anteprojeto-tree-leaf grid grid-cols-[1fr_5rem_1fr] gap-2 items-start px-2 py-1.5 text-xs border-b border-slate-100 last:border-0">
            <span class="text-slate-700 whitespace-pre-wrap text-left">${escapeHtml(obs.text)}</span>
            <div class="flex justify-center pt-0.5">
                <input type="checkbox" class="h-3.5 w-3.5 rounded border-slate-300 text-sky-600" disabled
                    ${obs.consultorChecked ? 'checked' : ''}>
            </div>
            <span class="text-slate-500 whitespace-pre-wrap text-left">${escapeHtml(obs.consultorResponse || '—')}</span>
        </div>
    `;
}

function renderAnteprojetoConferenceCard(conference, projetistaNames = {}) {
    const confirmed = isAnteprojetoConferenceConfirmed(conference);
    const approved = isAnteprojetoConferenceApproved(conference);
    const moduleObservations = getConferenceModuleObservations(conference);
    const checkedCount = moduleObservations.filter(obs => obs.consultorChecked).length;
    const canEdit = canEditAnteprojetoConference(conference) || canEditAnteprojetoConsultorFields(conference);
    const canConfirm = canConfirmAnteprojetoConference(conference);
    const canOpen = confirmed || canEdit;
    const allChecked = moduleObservations.length > 0
        && moduleObservations.every(obs => obs.consultorChecked);
    const projetistaName = projetistaNames[conference.designerId] || '-';
    const statusClass = approved
        ? 'bg-indigo-100 text-indigo-800'
        : confirmed
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-sky-100 text-sky-800';
    const sketchUpPath = getConferenceSketchUpPath(conference);
    const conferenceObservation = conference.conferenceObservation || '';
    const projectCount = (conference.conferenceProjects || []).length;
    const moduleCount = getConferenceModules(conference).length;

    const card = document.createElement('div');
    card.className = `${approved ? 'bg-indigo-50/60 border-indigo-200' : confirmed ? 'bg-emerald-50/60 border-emerald-200' : 'bg-sky-50/50 border-sky-200'} rounded-xl border shadow-sm overflow-hidden`;

    const header = document.createElement('div');
    header.className = 'px-4 py-3 bg-white/60 space-y-2 border-b border-slate-100';
    header.innerHTML = `
        <div class="flex items-start gap-2">
            <div class="flex-1 min-w-0 space-y-0.5">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs font-bold text-slate-800">👤 ${escapeHtml(projetistaName)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusClass}">${escapeHtml(conference.status)}</span>
                </div>
                <div class="text-[10px] text-slate-500">
                    Conferidas: ${checkedCount}/${moduleObservations.length}
                    · ${projectCount} projeto${projectCount === 1 ? '' : 's'}
                    · ${moduleCount} módulo${moduleCount === 1 ? '' : 's'}
                </div>
            </div>
            ${canOpen
                ? `<button type="button" class="text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium shrink-0"
                    onclick="openAnteprojetoModal(${conference.id})">${confirmed ? 'Visualizar' : 'Editar'}</button>`
                : ''}
        </div>
        <div class="text-left border border-slate-200 rounded-lg px-3 py-2 bg-white/80">
            <div class="text-[10px] font-semibold text-slate-500 uppercase mb-1">Observação da conferência</div>
            <div class="text-xs text-slate-700 whitespace-pre-wrap">${escapeHtml(conferenceObservation || '—')}</div>
        </div>
        <div class="text-xs text-slate-600 text-left">
            <span class="font-semibold text-slate-500">SketchUp:</span> ${escapeHtml(sketchUpPath || '—')}
        </div>
    `;

    const body = document.createElement('div');
    body.className = 'px-4 py-3 space-y-2';

    const projectsWrap = document.createElement('div');
    projectsWrap.className = 'space-y-1';

    (conference.conferenceProjects || []).forEach(project => {
        const projectName = project.orderProject?.name || 'Projeto';
        const modules = project.modules || [];

        const projectNode = document.createElement('div');
        projectNode.className = 'anteprojeto-tree-node';

        const projectRow = document.createElement('div');
        projectRow.className = 'anteprojeto-tree-row flex items-center gap-2 py-1.5';
        projectRow.innerHTML = `
            <button type="button" class="anteprojeto-tree-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                aria-label="Expandir">▶</button>
            <span class="text-xs font-semibold text-slate-800">🏠 ${escapeHtml(projectName)}</span>
            <span class="text-[10px] text-slate-400">${modules.length} módulo${modules.length === 1 ? '' : 's'}</span>
        `;

        const projectChildren = document.createElement('div');
        projectChildren.className = 'anteprojeto-tree-children hidden ml-4 border-l border-slate-200 pl-3 space-y-1';

        modules.forEach(module => {
            const observations = normalizeModuleObservations(module.observations)
                .sort((a, b) => a.sortOrder - b.sortOrder);

            const moduleNode = document.createElement('div');
            moduleNode.className = 'anteprojeto-tree-node';

            const moduleRow = document.createElement('div');
            moduleRow.className = 'anteprojeto-tree-row flex items-center gap-2 py-1';
            moduleRow.innerHTML = `
                <button type="button" class="anteprojeto-tree-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px]"
                    aria-label="Expandir">▶</button>
                <span class="text-xs font-medium text-slate-700">${escapeHtml(module.name || 'Módulo')}</span>
                <span class="text-[10px] text-slate-400">${observations.length} obs.</span>
            `;

            const moduleChildren = document.createElement('div');
            moduleChildren.className = 'anteprojeto-tree-children hidden ml-4 border-l border-slate-200 pl-2';

            if (!observations.length) {
                moduleChildren.innerHTML = '<p class="text-[10px] text-slate-400 py-1">Nenhuma observação.</p>';
            } else {
                const table = document.createElement('div');
                table.className = 'anteprojeto-obs-table border border-slate-200 rounded-lg overflow-hidden bg-white/80';
                table.innerHTML = renderAnteprojetoObservationTableHeader();
                observations.forEach(obs => {
                    const leaf = document.createElement('div');
                    leaf.innerHTML = renderAnteprojetoObservationLeaf(obs);
                    table.appendChild(leaf.firstElementChild);
                });
                moduleChildren.appendChild(table);
            }

            moduleNode.appendChild(moduleRow);
            moduleNode.appendChild(moduleChildren);
            projectChildren.appendChild(moduleNode);
        });

        if (!modules.length) {
            projectChildren.innerHTML = '<p class="text-[10px] text-slate-400 py-1">Nenhum módulo.</p>';
        }

        projectNode.appendChild(projectRow);
        projectNode.appendChild(projectChildren);
        projectsWrap.appendChild(projectNode);
    });

    if (!projectCount) {
        projectsWrap.innerHTML = '<p class="text-xs text-slate-400 py-2">Sem projetos cadastrados.</p>';
    }

    body.appendChild(projectsWrap);

    if (canConfirm) {
        const confirmWrap = document.createElement('div');
        confirmWrap.className = 'flex justify-end gap-2 pt-2 border-t border-slate-100';
        confirmWrap.innerHTML = `
            <button type="button" onclick="confirmAnteprojetoConference(${conference.id})"
                class="text-xs px-3 py-1.5 rounded-lg font-medium ${allChecked ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}"
                ${allChecked ? '' : 'disabled'}>
                Confirmar Conferência
            </button>
        `;
        body.appendChild(confirmWrap);
    }

    card.appendChild(header);
    card.appendChild(body);
    bindAnteprojetoTreeToggles(body);

    return card;
}

async function enrichAnteprojetoConferences(conferences, orderId) {
    const orderProjects = await resolveOrderProjectsForOrder(orderId);
    const orderProjectById = Object.fromEntries(orderProjects.map(project => [Number(project.id), project]));

    const observationIds = [
        ...new Set(
            conferences.flatMap(conference =>
                (conference.conferenceProjects || []).flatMap(project =>
                    (project.modules || []).flatMap(module => {
                        const raw = module.observations;
                        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
                        return list.map(obs => obs.observationId).filter(Boolean);
                    })
                )
            )
        )
    ];

    let observationById = {};
    if (observationIds.length) {
        const { data: observations } = await supabaseClient
            .from('AnteprojetoObservation')
            .select('id, text')
            .in('id', observationIds);
        observations?.forEach(observation => {
            observationById[observation.id] = observation;
        });
    }

    return conferences.map(conference => ({
        ...conference,
        conferenceProjects: (conference.conferenceProjects || [])
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map(project => ({
            ...project,
            orderProject: orderProjectById[Number(project.orderProjectId)] || project.orderProject || null,
            modules: (project.modules || [])
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.id - b.id))
                .map(module => {
                    const rawObservations = Array.isArray(module.observations)
                        ? module.observations
                        : module.observations
                            ? [module.observations]
                            : [];
                    return {
                        ...module,
                        observations: rawObservations
                            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                            .map(obs => ({
                                ...obs,
                                observation: obs.observation || observationById[obs.observationId] || null
                            }))
                    };
                })
        }))
    }));
}

async function loadAnteprojetoConferences(orderId) {
    const list = document.getElementById('anteprojeto-list');
    if (!list) return;

    let result = await supabaseClient
        .from('AnteprojetoConference')
        .select(`
            *,
            conferenceProjects:AnteprojetoConferenceProject(
                *,
                orderProject:OrderProject(id, name, statusId, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)),
                modules:AnteprojetoModule(
                    *,
                    observations:AnteprojetoModuleObservation(
                        *,
                        observation:AnteprojetoObservation(id, text)
                    )
                )
            )
        `)
        .eq('orderId', orderId)
        .order('createdAt', { ascending: false });

    if (result.error?.message?.includes('AnteprojetoConferenceProject')) {
        result = await supabaseClient
            .from('AnteprojetoConference')
            .select(`
                *,
                conferenceProjects:AnteprojetoConferenceProject(
                    *,
                    modules:AnteprojetoModule(*)
                )
            `)
            .eq('orderId', orderId)
            .order('createdAt', { ascending: false });
    }

    if (result.error?.message?.includes('Anteprojeto')) {
        list.innerHTML = '<p class="text-xs text-amber-700 text-center py-6 bg-amber-50 rounded-xl border border-amber-100">Execute o SQL <code>supabase/create-anteprojeto.sql</code> no Supabase.</p>';
        updateOrderTabCounts(undefined, 0);
        return;
    }

    if (result.error) {
        console.error('loadAnteprojetoConferences:', result.error);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-4">Erro ao carregar conferências: ${escapeHtml(result.error.message)}</p>`;
        return;
    }

    let conferences = result.data || [];
    conferences = await attachModuleObservationsToConferences(conferences);
    conferences = await enrichAnteprojetoConferences(conferences, orderId);
    anteprojetoConferencesCache = conferences;

    const openCount = conferences.filter(conference => conference.status === 'Em andamento').length;
    updateOrderTabCounts(undefined, openCount);

    const designerIds = [...new Set(conferences.map(conference => conference.designerId).filter(Boolean))];
    const projetistaNames = {};
    if (designerIds.length) {
        const { data: users } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', designerIds);
        users?.forEach(user => { projetistaNames[user.id] = user.name; });
    }

    list.innerHTML = '';
    if (!conferences.length) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 bg-white rounded-xl border border-sky-100">Nenhuma conferência de anteprojeto para este pedido.</p>';
        updateAnteprojetoActionButtons();
        return;
    }

    conferences.forEach(conference => {
        list.appendChild(renderAnteprojetoConferenceCard(conference, projetistaNames));
    });

    updateAnteprojetoActionButtons();
}

function updateAnteprojetoActionButtons() {
    const panel = document.getElementById('order-tab-panel-anteprojeto');
    const onTab = panel && !panel.classList.contains('hidden');
    const newBtn = document.getElementById('btn-new-anteprojeto');
    if (newBtn) {
        newBtn.classList.toggle('hidden', !onTab || !canCreateAnteprojetoConference());
    }
}
