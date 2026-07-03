let medicoesCache = [];
let editingMedicaoId = null;

function isAdminOrOrderConsultorForMedicao(orderId) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Consultor') return false;
    const consultantName = getOrderConsultantName(orderId);
    return Boolean(consultantName && currentUser.name === consultantName);
}

function canCreateMedicao() {
    if (!activeOrderId) return false;
    return canCreateAsAdminOrConferente();
}

function canEditMedicao(medicao) {
    if (!medicao) return canCreateMedicao();
    if (currentUser?.role === 'Admin') return true;
    if (isAdminOrOrderConsultorForMedicao(medicao.orderId || activeOrderId)) return true;
    return medicao.createdById === currentUser?.id;
}

function canDeleteMedicao(medicao) {
    if (!medicao) return false;
    if (currentUser?.role === 'Admin') return true;
    return isAdminOrOrderConsultorForMedicao(medicao.orderId || activeOrderId);
}

function formatDateOnly(dateStr) {
    if (!dateStr) return '—';
    const part = String(dateStr).split('T')[0];
    const [year, month, day] = part.split('-');
    if (!year || !month || !day) return '—';
    return `${day}/${month}/${year}`;
}

function toInputDateValue(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).split('T')[0];
}

function getMedicaoProjects(medicao) {
    return medicao?.medicaoProjects || [];
}

function getMedicaoPrimaryDate(medicao) {
    const projects = getMedicaoProjects(medicao);
    if (!projects.length) return null;
    const dates = projects.map(item => item.measurementDate).filter(Boolean).sort();
    return dates[0] || null;
}

async function resolveOrderProjectsForMedicao(orderId) {
    const normalizedId = Number(orderId);
    if (!normalizedId) return [];

    if (typeof orderProjectsCache !== 'undefined') {
        const cached = orderProjectsCache.filter(project => Number(project.orderId) === normalizedId);
        if (cached.length) return cached;
    }

    if (typeof loadOrderProjects === 'function' && normalizedId === Number(activeOrderId)) {
        await loadOrderProjects(normalizedId);
        const refreshed = orderProjectsCache.filter(project => Number(project.orderId) === normalizedId);
        if (refreshed.length) return refreshed;
    }

    if (typeof fetchOrderProjectsForOrder === 'function') {
        return fetchOrderProjectsForOrder(normalizedId);
    }

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('*, environmentType:EnvironmentType(name)')
        .eq('orderId', normalizedId)
        .order('name', { ascending: true });

    if (error) {
        console.error('resolveOrderProjectsForMedicao:', error);
        return [];
    }

    return data || [];
}

function renderMedicaoProjectPickerRow(project, selected = null, defaultDate = '') {
    const env = project.environmentType?.name ? ` (${project.environmentType.name})` : '';
    const checked = Boolean(selected);
    const dateValue = selected?.measurementDate
        ? toInputDateValue(selected.measurementDate)
        : defaultDate;
    const plantaChecked = Boolean(selected?.plantaLevantada);
    const plantaDateValue = toInputDateValue(selected?.plantaLevantadaDate);

    const row = document.createElement('div');
    row.className = 'medicao-project-row space-y-2 py-2 border-b border-slate-100 last:border-0';
    row.dataset.orderProjectId = String(project.id);
    row.innerHTML = `
        <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2 flex-1 min-w-[180px] text-xs text-slate-700">
                <input type="checkbox" class="medicao-project-check h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    ${checked ? 'checked' : ''}>
                <span class="font-medium">${escapeHtml(project.name)}${escapeHtml(env)}</span>
            </label>
            <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-[10px] text-slate-500">Data medição:</span>
                <input type="date" class="medicao-project-date px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600 disabled:bg-slate-50"
                    value="${escapeHtml(dateValue)}" ${checked ? '' : 'disabled'}>
            </div>
        </div>
        <div class="medicao-project-planta-wrap flex flex-wrap items-center gap-3 pl-6 ${checked ? '' : 'hidden'}">
            <label class="flex items-center gap-2 text-[11px] text-slate-600">
                <input type="checkbox" class="medicao-project-planta-check h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    ${plantaChecked ? 'checked' : ''} ${checked ? '' : 'disabled'}>
                Planta levantada
            </label>
            <div class="flex items-center gap-1.5">
                <span class="text-[10px] text-slate-500">Data planta:</span>
                <input type="date" class="medicao-project-planta-date px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600 disabled:bg-slate-50"
                    value="${escapeHtml(plantaDateValue)}" ${plantaChecked && checked ? '' : 'disabled'}>
            </div>
        </div>
    `;

    const checkbox = row.querySelector('.medicao-project-check');
    const dateInput = row.querySelector('.medicao-project-date');
    const plantaWrap = row.querySelector('.medicao-project-planta-wrap');
    const plantaCheckbox = row.querySelector('.medicao-project-planta-check');
    const plantaDateInput = row.querySelector('.medicao-project-planta-date');

    const syncProjectRowState = () => {
        const enabled = checkbox.checked;
        dateInput.disabled = !enabled;
        plantaWrap.classList.toggle('hidden', !enabled);
        plantaCheckbox.disabled = !enabled;

        if (enabled && !dateInput.value) {
            dateInput.value = document.getElementById('medicao-default-date')?.value || '';
        }

        if (!enabled) {
            plantaCheckbox.checked = false;
            plantaDateInput.value = '';
            plantaDateInput.disabled = true;
            return;
        }

        plantaDateInput.disabled = !plantaCheckbox.checked;
        if (!plantaCheckbox.checked) {
            plantaDateInput.value = '';
        }
    };

    checkbox.addEventListener('change', syncProjectRowState);
    plantaCheckbox.addEventListener('change', syncProjectRowState);

    return row;
}

async function populateMedicaoProjectsPicker(medicao = null) {
    const picker = document.getElementById('medicao-projects-picker');
    const emptyMsg = document.getElementById('medicao-projects-empty-msg');
    if (!picker) return;

    const projects = await resolveOrderProjectsForMedicao(activeOrderId);
    const selectedByProjectId = {};
    getMedicaoProjects(medicao).forEach(item => {
        selectedByProjectId[Number(item.orderProjectId)] = item;
    });

    const defaultDate = document.getElementById('medicao-default-date')?.value
        || toInputDateValue(getMedicaoPrimaryDate(medicao))
        || toInputDateValue(new Date().toISOString());

    picker.innerHTML = '';
    if (!projects.length) {
        emptyMsg?.classList.remove('hidden');
        return;
    }

    emptyMsg?.classList.add('hidden');
    projects.forEach(project => {
        picker.appendChild(renderMedicaoProjectPickerRow(
            project,
            selectedByProjectId[Number(project.id)],
            defaultDate
        ));
    });
}

function syncMedicaoProjectDatesFromDefault() {
    const defaultDate = document.getElementById('medicao-default-date')?.value;
    if (!defaultDate) return;

    document.querySelectorAll('.medicao-project-row').forEach(row => {
        const checkbox = row.querySelector('.medicao-project-check');
        const dateInput = row.querySelector('.medicao-project-date');
        if (checkbox?.checked && dateInput && !dateInput.value) {
            dateInput.value = defaultDate;
        }
    });
}

function collectMedicaoProjectsFromDom() {
    const projects = [];

    document.querySelectorAll('.medicao-project-row').forEach(row => {
        const checkbox = row.querySelector('.medicao-project-check');
        if (!checkbox?.checked) return;

        const orderProjectId = Number(row.dataset.orderProjectId);
        const measurementDate = row.querySelector('.medicao-project-date')?.value || '';
        const plantaLevantada = Boolean(row.querySelector('.medicao-project-planta-check')?.checked);
        const plantaLevantadaDate = plantaLevantada
            ? row.querySelector('.medicao-project-planta-date')?.value || ''
            : null;

        if (!measurementDate) return;

        projects.push({
            orderProjectId,
            measurementDate,
            plantaLevantada,
            plantaLevantadaDate
        });
    });

    return projects;
}

async function openMedicaoModal(medicaoId = null) {
    if (!activeOrderId) {
        alert('Selecione um pedido primeiro.');
        return;
    }

    if (!medicaoId && !canCreateMedicao()) {
        alert('Somente Admin ou usuários marcados como Conferente podem criar medições.');
        return;
    }

    editingMedicaoId = medicaoId;
    const medicao = medicaoId
        ? medicoesCache.find(item => item.id === medicaoId)
        : null;

    if (medicao && !canEditMedicao(medicao)) {
        alert('Você não tem permissão para editar esta medição.');
        return;
    }

    document.getElementById('medicao-form').reset();

    const defaultDateEl = document.getElementById('medicao-default-date');
    if (defaultDateEl) {
        defaultDateEl.value = toInputDateValue(getMedicaoPrimaryDate(medicao))
            || toInputDateValue(new Date().toISOString());
    }

    document.getElementById('medicao-observation').value = medicao?.observation || '';

    await populateMedicaoProjectsPicker(medicao);

    const title = document.getElementById('medicao-modal-title');
    const submitBtn = document.getElementById('medicao-form-submit');
    title.textContent = medicao ? 'Editar Medição' : 'Nova Medição';
    submitBtn.textContent = medicao ? 'Salvar Medição' : 'Criar Medição';

    toggleModal('medicao-modal', true);
}

window.openMedicaoModal = openMedicaoModal;

function closeMedicaoModal() {
    editingMedicaoId = null;
    toggleModal('medicao-modal', false);
}

window.closeMedicaoModal = closeMedicaoModal;

async function persistMedicaoProjects(medicaoId, projects) {
    const { data: current } = await supabaseClient
        .from('MedicaoProject')
        .select('id, orderProjectId')
        .eq('medicaoId', medicaoId);

    const keepOrderProjectIds = projects.map(project => Number(project.orderProjectId));
    const deleteIds = (current || [])
        .filter(row => !keepOrderProjectIds.includes(Number(row.orderProjectId)))
        .map(row => row.id);

    if (deleteIds.length) {
        const { error } = await supabaseClient
            .from('MedicaoProject')
            .delete()
            .in('id', deleteIds);
        if (error) throw error;
    }

    for (const project of projects) {
        const existing = (current || []).find(row => Number(row.orderProjectId) === Number(project.orderProjectId));
        const payload = {
            measurementDate: project.measurementDate,
            plantaLevantada: project.plantaLevantada || false,
            plantaLevantadaDate: project.plantaLevantada ? project.plantaLevantadaDate : null
        };

        if (existing) {
            let { error } = await supabaseClient
                .from('MedicaoProject')
                .update(payload)
                .eq('id', existing.id);

            if (error?.message?.includes('plantaLevantada')) {
                ({ error } = await supabaseClient
                    .from('MedicaoProject')
                    .update({ measurementDate: project.measurementDate })
                    .eq('id', existing.id));
            }

            if (error) throw error;
            continue;
        }

        let { error } = await supabaseClient
            .from('MedicaoProject')
            .insert({
                medicaoId,
                orderProjectId: project.orderProjectId,
                ...payload
            });

        if (error?.message?.includes('plantaLevantada')) {
            ({ error } = await supabaseClient
                .from('MedicaoProject')
                .insert({
                    medicaoId,
                    orderProjectId: project.orderProjectId,
                    measurementDate: project.measurementDate
                }));
        }

        if (error) throw error;
    }
}

async function saveMedicao() {
    if (!activeOrderId) return;

    const medicao = editingMedicaoId
        ? medicoesCache.find(item => item.id === editingMedicaoId)
        : null;

    if (!canEditMedicao(medicao)) {
        alert('Você não tem permissão para salvar esta medição.');
        return;
    }

    const defaultDate = document.getElementById('medicao-default-date')?.value;
    const observation = document.getElementById('medicao-observation')?.value.trim() || null;
    const projects = collectMedicaoProjectsFromDom();

    if (!defaultDate) {
        alert('Informe a data da medição.');
        document.getElementById('medicao-default-date')?.focus();
        return;
    }

    if (!projects.length) {
        alert('Selecione ao menos um projeto medido.');
        return;
    }

    for (const project of projects) {
        if (!project.measurementDate) {
            alert('Informe a data de medição para todos os projetos selecionados.');
            return;
        }
        if (project.plantaLevantada && !project.plantaLevantadaDate) {
            const row = document.querySelector(`.medicao-project-row[data-order-project-id="${project.orderProjectId}"]`);
            const projectName = row?.querySelector('.font-medium')?.textContent?.trim() || 'um projeto';
            alert(`Informe a data da planta para o projeto "${projectName}".`);
            return;
        }
    }

    const now = new Date().toISOString();

    try {
        let medicaoId = medicao?.id;

        if (medicao) {
            const { error } = await supabaseClient
                .from('Medicao')
                .update({
                    observation,
                    updatedAt: now,
                    updatedById: currentUser.id
                })
                .eq('id', medicao.id);
            if (error) throw error;
        } else {
            const { data: created, error } = await supabaseClient
                .from('Medicao')
                .insert({
                    orderId: activeOrderId,
                    observation,
                    createdById: currentUser.id,
                    updatedById: currentUser.id,
                    updatedAt: now
                })
                .select('id')
                .single();
            if (error) throw error;
            medicaoId = created.id;
        }

        await persistMedicaoProjects(medicaoId, projects);
        closeMedicaoModal();
        await loadMedicoes(activeOrderId);
    } catch (error) {
        alert('Erro ao salvar medição: ' + error.message);
    }
}

async function deleteMedicao(medicaoId) {
    const medicao = medicoesCache.find(item => item.id === medicaoId);
    if (!medicao || !canDeleteMedicao(medicao)) {
        alert('Você não tem permissão para excluir esta medição.');
        return;
    }

    if (!confirm('Excluir esta medição e os projetos vinculados?')) return;

    const { error } = await supabaseClient
        .from('Medicao')
        .delete()
        .eq('id', medicaoId);

    if (error) {
        alert('Erro ao excluir medição: ' + error.message);
        return;
    }

    await loadMedicoes(activeOrderId);
}

window.deleteMedicao = deleteMedicao;

function renderMedicaoCard(medicao, creatorNames = {}) {
    const projects = getMedicaoProjects(medicao)
        .slice()
        .sort((a, b) => String(a.measurementDate).localeCompare(String(b.measurementDate))
            || String(a.orderProject?.name || '').localeCompare(String(b.orderProject?.name || ''), 'pt-BR'));

    const primaryDate = getMedicaoPrimaryDate(medicao);
    const canEdit = canEditMedicao(medicao);
    const canDelete = canDeleteMedicao(medicao);
    const creatorName = creatorNames[medicao.createdById] || '—';

    const card = document.createElement('div');
    card.className = 'bg-teal-50/50 collapsible-list-card border border-teal-200 rounded-xl shadow-sm overflow-hidden';

    const projectsHtml = projects.length
        ? projects.map(item => {
            const env = item.orderProject?.environmentType?.name
                ? ` (${item.orderProject.environmentType.name})`
                : '';
            const plantaInfo = item.plantaLevantada
                ? `Planta: sim (${formatDateOnly(item.plantaLevantadaDate)})`
                : 'Planta: não';
            return `
                <li class="py-2 border-b border-teal-100 last:border-0 space-y-1">
                    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
                        <span class="font-medium">${escapeHtml(item.orderProject?.name || 'Projeto')}${escapeHtml(env)}</span>
                        <span class="text-[10px] text-teal-800 bg-teal-100 px-2 py-0.5 rounded-full font-semibold">${formatDateOnly(item.measurementDate)}</span>
                    </div>
                    <div class="text-[10px] text-slate-500">${escapeHtml(plantaInfo)}</div>
                </li>
            `;
        }).join('')
        : '<li class="text-xs text-slate-400 py-1">Nenhum projeto vinculado.</li>';

    card.innerHTML = `
        <div class="collapsible-list-header px-4 py-3 bg-white/70 border-b border-teal-100 cursor-pointer">
            <div class="flex items-start justify-between gap-2">
                <div class="flex items-start gap-2 min-w-0 flex-1">
                    <button type="button" class="list-card-toggle shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 text-[10px] mt-0.5"
                        aria-label="Expandir">▶</button>
                    <div class="space-y-1 min-w-0">
                        <div class="text-xs font-bold text-slate-800">📏 Medição — ${formatDateOnly(primaryDate)}</div>
                        <div class="text-[10px] text-slate-500">
                            ${projects.length} projeto${projects.length === 1 ? '' : 's'}
                            · Cadastrado por ${escapeHtml(creatorName)}
                        </div>
                    </div>
                </div>
                <div class="flex gap-1.5 shrink-0">
                    ${canEdit
                        ? `<button type="button" class="text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-lg font-medium"
                            onclick="openMedicaoModal(${medicao.id})">Editar</button>`
                        : ''}
                    ${canDelete
                        ? `<button type="button" class="text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium"
                            onclick="deleteMedicao(${medicao.id})">Excluir</button>`
                        : ''}
                </div>
            </div>
        </div>
        <div class="collapsible-list-body hidden px-4 py-3 space-y-3 text-left">
            <div class="border border-slate-200 rounded-lg px-3 py-2 bg-white/80">
                <div class="text-[10px] font-semibold text-slate-500 uppercase mb-1">Observação</div>
                <div class="text-xs text-slate-700 whitespace-pre-wrap">${escapeHtml(medicao.observation || '—')}</div>
            </div>
            <div>
                <div class="text-[10px] font-semibold text-slate-500 uppercase mb-1">Projetos medidos</div>
                <ul class="border border-slate-200 rounded-lg px-3 py-1 bg-white/80 list-none m-0">${projectsHtml}</ul>
            </div>
        </div>
    `;

    return card;
}

async function enrichMedicoes(medicoes, orderId) {
    const orderProjects = await resolveOrderProjectsForMedicao(orderId);
    const orderProjectById = Object.fromEntries(orderProjects.map(project => [Number(project.id), project]));

    return medicoes.map(medicao => ({
        ...medicao,
        medicaoProjects: (medicao.medicaoProjects || []).map(item => ({
            ...item,
            orderProject: item.orderProject || orderProjectById[Number(item.orderProjectId)] || null
        }))
    }));
}

async function loadMedicoes(orderId) {
    const list = document.getElementById('medicao-list');
    if (!list) return;

    let result = await supabaseClient
        .from('Medicao')
        .select(`
            *,
            medicaoProjects:MedicaoProject(
                *,
                orderProject:OrderProject(id, name, environmentType:EnvironmentType(name))
            )
        `)
        .eq('orderId', orderId)
        .order('createdAt', { ascending: false });

    if (result.error?.message?.includes('MedicaoProject')) {
        result = await supabaseClient
            .from('Medicao')
            .select('*')
            .eq('orderId', orderId)
            .order('createdAt', { ascending: false });
    }

    if (result.error?.message?.includes('Medicao')) {
        list.innerHTML = '<p class="text-xs text-amber-700 text-center py-6 bg-amber-50 rounded-xl border border-amber-100">Execute o SQL <code>supabase/create-mediciao.sql</code> no Supabase.</p>';
        updateOrderTabCounts(undefined, undefined, undefined, undefined, 0);
        return;
    }

    if (result.error) {
        console.error('loadMedicoes:', result.error);
        list.innerHTML = `<p class="text-xs text-red-500 text-center py-4">Erro ao carregar medições: ${escapeHtml(result.error.message)}</p>`;
        return;
    }

    let medicoes = result.data || [];

    const moduleIdsMissingProjects = medicoes.some(medicao => !medicao.medicaoProjects);
    if (moduleIdsMissingProjects) {
        const medicaoIds = medicoes.map(item => item.id).filter(Boolean);
        if (medicaoIds.length) {
            const { data: projectRows } = await supabaseClient
                .from('MedicaoProject')
                .select('*')
                .in('medicaoId', medicaoIds)
                .order('measurementDate', { ascending: true });

            const byMedicaoId = {};
            (projectRows || []).forEach(row => {
                if (!byMedicaoId[row.medicaoId]) byMedicaoId[row.medicaoId] = [];
                byMedicaoId[row.medicaoId].push(row);
            });

            medicoes = medicoes.map(medicao => ({
                ...medicao,
                medicaoProjects: medicao.medicaoProjects || byMedicaoId[medicao.id] || []
            }));
        }
    }

    medicoes = await enrichMedicoes(medicoes, orderId);
    medicoesCache = medicoes;

    updateOrderTabCounts(undefined, undefined, undefined, undefined, medicoes.length);

    const creatorIds = [...new Set(medicoes.map(item => item.createdById).filter(Boolean))];
    const creatorNames = {};
    if (creatorIds.length) {
        const { data: users } = await supabaseClient
            .from('appUsers')
            .select('id, name')
            .in('id', creatorIds);
        users?.forEach(user => { creatorNames[user.id] = user.name; });
    }

    list.innerHTML = '';
    if (!medicoes.length) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 bg-white rounded-xl border border-teal-100">Nenhuma medição cadastrada para este pedido.</p>';
        updateMedicaoActionButtons();
        return;
    }

    list.className = 'space-y-3';

    medicoes.forEach(medicao => {
        list.appendChild(renderMedicaoCard(medicao, creatorNames));
    });

    bindCollapsibleListCardToggles(list);

    updateMedicaoActionButtons();
}

function updateMedicaoActionButtons() {
    const panel = document.getElementById('order-tab-panel-medicao');
    const onTab = panel && !panel.classList.contains('hidden');
    const newBtn = document.getElementById('btn-new-medicao');
    if (newBtn) {
        newBtn.classList.toggle('hidden', !onTab || !canCreateMedicao());
    }
}

function bindMedicaoEvents() {
    document.getElementById('btn-new-medicao')?.addEventListener('click', () => openMedicaoModal());
    document.getElementById('medicao-form')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        await saveMedicao();
    });
    document.getElementById('medicao-default-date')?.addEventListener('change', syncMedicaoProjectDatesFromDefault);
}
