let medicoesCache = [];
let editingMedicaoId = null;
let medicaoPickerPreselectProjectId = null;

const MEDICAO_NEW_PICKER_STATUS_NAME = 'Aguardando Medição';

function getProjectStatusName(project) {
    return project?.projectStatus?.name || '';
}

function isProjectEligibleForNewMedicaoPicker(project) {
    return getProjectStatusName(project) === MEDICAO_NEW_PICKER_STATUS_NAME;
}

function filterProjectsForMedicaoPicker(projects) {
    return projects.filter(isProjectEligibleForNewMedicaoPicker);
}

async function getMedicaoRealizadaStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Medição Realizada')
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Medição Realizada')
        .maybeSingle();

    return fallback?.id || null;
}

async function getPlantaLevantadaStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Planta Levantada')
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Planta Levantada')
        .maybeSingle();

    return fallback?.id || null;
}

async function enrichProjectsWithStatus(projects) {
    if (!projects.length) return projects;

    const needsEnrich = projects.some(project => project.statusId && !project.projectStatus);
    if (!needsEnrich) return projects;

    const statusIds = [...new Set(projects.map(project => project.statusId).filter(Boolean))];
    if (!statusIds.length) return projects;

    const { data: statuses, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id, name')
        .in('id', statusIds);

    if (error) {
        console.error('enrichProjectsWithStatus:', error);
        return projects;
    }

    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
    return projects.map(project => ({
        ...project,
        projectStatus: project.projectStatus || statusById[project.statusId] || null
    }));
}

async function fetchOrderProjectsWithStatusForMedicao(orderId) {
    const normalizedId = Number(orderId);
    if (!normalizedId) return [];

    let result = await supabaseClient
        .from('OrderProject')
        .select('*, environmentType:EnvironmentType(name), projectStatus:OrderProjectStatus(id, name)')
        .eq('orderId', normalizedId)
        .order('name', { ascending: true });

    if (result.error?.message?.includes('OrderProjectStatus') || result.error?.message?.includes('statusId')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*, environmentType:EnvironmentType(name)')
            .eq('orderId', normalizedId)
            .order('name', { ascending: true });
    }

    if (result.error) {
        console.error('fetchOrderProjectsWithStatusForMedicao:', result.error);
        return [];
    }

    return enrichProjectsWithStatus(result.data || []);
}

async function applyMedicaoRealizadaStatusToProjects(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getMedicaoRealizadaStatusId();
    if (!statusId) {
        throw new Error('Status "Medição Realizada" não encontrado. Cadastre em Gestão → Status de Projeto.');
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;
}

async function applyPlantaLevantadaStatusToProjects(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getPlantaLevantadaStatusId();
    if (!statusId) {
        throw new Error('Status "Planta Levantada" não encontrado. Cadastre em Gestão → Status de Projeto.');
    }

    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('OrderProject')
        .update({
            statusId,
            updatedById: currentUser.id,
            updatedAt: now
        })
        .in('id', uniqueIds);

    if (error) throw error;
}

async function syncPlantaLevantadaToOtherMedicoes(projects, currentMedicaoId) {
    const plantaByProjectId = new Map(
        projects
            .filter(project => project.plantaLevantada)
            .map(project => [Number(project.orderProjectId), project])
    );

    const orderProjectIds = [...plantaByProjectId.keys()];
    if (!orderProjectIds.length) return;

    const { data: siblings, error } = await supabaseClient
        .from('MedicaoProject')
        .select('id, orderProjectId, medicaoId, plantaLevantada')
        .in('orderProjectId', orderProjectIds)
        .eq('plantaLevantada', false);

    if (error?.message?.includes('plantaLevantada')) return;
    if (error) throw error;

    const rowsToUpdate = (siblings || []).filter(row =>
        Number(row.medicaoId) !== Number(currentMedicaoId)
    );

    for (const row of rowsToUpdate) {
        const source = plantaByProjectId.get(Number(row.orderProjectId));
        if (!source) continue;

        const payload = {
            plantaLevantada: true,
            plantaLevantadaDate: source.plantaLevantadaDate || null
        };

        let { error: updateError } = await supabaseClient
            .from('MedicaoProject')
            .update(payload)
            .eq('id', row.id);

        if (updateError?.message?.includes('plantaLevantada')) continue;
        if (updateError) throw updateError;
    }
}

function isMedicaoPlantaLevantadaChecked(row) {
    const input = row.querySelector('.medicao-project-planta-check');
    if (!input) return false;
    if (input.type === 'checkbox') return input.checked;
    return input.value === '1';
}

function getMedicaoPlantaLevantadaDate(row) {
    const input = row.querySelector('.medicao-project-planta-date');
    if (!input) return null;
    return input.value || null;
}

function isMedicaoPlantaLocked(row) {
    return row.querySelector('.medicao-project-planta-locked')?.value === '1';
}

function canCreateMedicao() {
    if (!activeOrderId) return false;
    return canCreateAsAdminOrConferente();
}

function getMedicaoProjectStatusName(medicaoProject) {
    return getProjectStatusName(medicaoProject?.orderProject)
        || medicaoProject?.orderProject?.projectStatus?.name
        || '';
}

function medicaoHasProjectsInMedicaoRealizadaStatus(medicao) {
    const projects = getMedicaoProjects(medicao);
    if (!projects.length) return false;

    return projects.every(item => getMedicaoProjectStatusName(item) === 'Medição Realizada');
}

function canEditMedicao(medicao) {
    if (!medicao) return canCreateMedicao();
    if (!medicaoHasProjectsInMedicaoRealizadaStatus(medicao)) return false;
    if (currentUser?.role === 'Admin') return true;
    return isConferente();
}

function canShowOrderProjectEditarMedicaoAction(project, medicaoInfo) {
    if (!medicaoInfo?.id) return false;
    if (getOrderProjectStatusName(project) !== 'Medição Realizada') return false;
    if (currentUser?.role === 'Admin') return true;
    return isConferente();
}

async function fetchMedicaoContextByProjectIds(projectIds, orderId) {
    const normalizedProjectIds = [...new Set(projectIds.map(id => Number(id)).filter(Boolean))];
    const normalizedOrderId = Number(orderId);
    if (!normalizedProjectIds.length || !normalizedOrderId) return {};

    let result = await supabaseClient
        .from('MedicaoProject')
        .select('orderProjectId, medicaoId, medicao:Medicao(id, orderId, createdById, createdAt)')
        .in('orderProjectId', normalizedProjectIds);

    if (result.error?.message?.includes('Medicao')) {
        result = await supabaseClient
            .from('MedicaoProject')
            .select('orderProjectId, medicaoId')
            .in('orderProjectId', normalizedProjectIds);
    }

    if (result.error) {
        console.error('fetchMedicaoContextByProjectIds:', result.error);
        return {};
    }

    let rows = result.data || [];
    const medicaoIds = [...new Set(rows.map(row => Number(row.medicaoId)).filter(Boolean))];
    const medicaoById = {};

    if (medicaoIds.length && rows.some(row => !row.medicao)) {
        const { data: medicoes, error } = await supabaseClient
            .from('Medicao')
            .select('id, orderId, createdById, createdAt')
            .in('id', medicaoIds);

        if (error) {
            console.error('fetchMedicaoContextByProjectIds:', error);
            return {};
        }

        (medicoes || []).forEach(medicao => {
            medicaoById[Number(medicao.id)] = medicao;
        });
    }

    const byProjectId = {};

    rows.forEach(row => {
        const projectId = Number(row.orderProjectId);
        const medicao = row.medicao || medicaoById[Number(row.medicaoId)];
        if (!medicao || Number(medicao.orderId) !== normalizedOrderId) return;

        const existing = byProjectId[projectId];
        const createdAt = medicao.createdAt ? new Date(medicao.createdAt).getTime() : 0;
        const existingCreatedAt = existing?.createdAt ? new Date(existing.createdAt).getTime() : 0;

        if (!existing || createdAt >= existingCreatedAt) {
            byProjectId[projectId] = {
                id: medicao.id,
                orderId: medicao.orderId,
                createdById: medicao.createdById,
                createdAt: medicao.createdAt || null
            };
        }
    });

    return byProjectId;
}

async function openOrderProjectEditarMedicao(medicaoId, orderId = activeOrderId) {
    if (!canCreateAsAdminOrConferente()) {
        alertAppDialog('Sem permissão para editar medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const normalizedOrderId = Number(orderId);
    const normalizedMedicaoId = Number(medicaoId);
    if (!normalizedOrderId || !normalizedMedicaoId) return;

    activeOrderId = normalizedOrderId;

    if (typeof loadMedicoes === 'function') {
        await loadMedicoes(normalizedOrderId);
    }

    const medicao = medicoesCache.find(item => Number(item.id) === normalizedMedicaoId);
    if (!medicao) {
        alertAppDialog('Medição não encontrada. Atualize a lista.');
        return;
    }

    if (!canEditMedicao(medicao)) {
        alertAppDialog('Sem permissão para editar esta medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    await openMedicaoModal(normalizedMedicaoId);
}

function canDeleteMedicao(medicao) {
    if (!medicao) return false;
    return currentUser?.role === 'Admin';
}

function formatDateOnly(dateStr) {
    return formatDisplayDate(dateStr);
}

function toInputDateValue(dateStr) {
    return toInputDate(dateStr);
}

function isFutureInputDate(dateStr) {
    return isInputDateInFuture(dateStr);
}

function setMedicaoDateInputMax(input) {
    if (!input || input.type !== 'date') return;
    input.max = getTodayInputDate();
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
    return fetchOrderProjectsWithStatusForMedicao(orderId);
}

function renderMedicaoProjectEditRow(project, medicaoProject) {
    const env = project.environmentType?.name ? ` (${project.environmentType.name})` : '';
    const measurementDate = toInputDateValue(medicaoProject.measurementDate);
    const plantaLocked = Boolean(medicaoProject.plantaLevantada);
    const plantaDateValue = toInputDateValue(medicaoProject.plantaLevantadaDate);

    const plantaSectionHtml = plantaLocked
        ? `
        <div class="medicao-project-planta-wrap flex flex-wrap items-center gap-2">
            <span class="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                Planta levantada · ${formatDateOnly(medicaoProject.plantaLevantadaDate)}
            </span>
            <input type="hidden" class="medicao-project-planta-locked" value="1">
            <input type="hidden" class="medicao-project-planta-check" value="1">
            <input type="hidden" class="medicao-project-planta-date" value="${escapeHtml(plantaDateValue)}">
        </div>`
        : `
        <div class="medicao-project-planta-wrap flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 text-[11px] text-slate-600">
                <input type="checkbox" class="medicao-project-planta-check h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500">
                Planta levantada
            </label>
            <div class="flex items-center gap-1.5">
                <span class="text-[10px] text-slate-500">Data planta:</span>
                <input type="date" class="medicao-project-planta-date px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600 disabled:bg-slate-50" disabled>
            </div>
        </div>`;

    const row = document.createElement('div');
    row.className = 'medicao-project-row medicao-project-edit-row space-y-2 py-2 border-b border-slate-100 last:border-0';
    row.dataset.orderProjectId = String(project.id);
    row.dataset.measured = 'true';
    row.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2 min-w-0">
                <span class="font-medium text-xs text-slate-700">${escapeHtml(project.name || 'Projeto')}${escapeHtml(env)}</span>
                ${renderComplementarProjectNoticeHtml(project)}
                ${renderSubstituidoProjectNoticeHtml(project)}
                ${renderSubstituicaoProjectNoticeHtml(project)}
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-[10px] text-slate-500">Data medição:</span>
                <span class="text-xs font-semibold text-teal-800">${formatDateOnly(medicaoProject.measurementDate)}</span>
            </div>
        </div>
        <input type="hidden" class="medicao-project-date" value="${escapeHtml(measurementDate)}">
        ${plantaSectionHtml}
    `;

    if (plantaLocked) {
        applyOrderProjectReadOnlyToElement(row, project);
        return row;
    }

    const plantaCheckbox = row.querySelector('.medicao-project-planta-check');
    const plantaDateInput = row.querySelector('.medicao-project-planta-date');

    const syncPlantaState = () => {
        plantaDateInput.disabled = !plantaCheckbox.checked;
        if (!plantaCheckbox.checked) {
            plantaDateInput.value = '';
            return;
        }
        if (!plantaDateInput.value) {
            plantaDateInput.value = getTodayInputDate();
        }
    };

    plantaCheckbox.addEventListener('change', syncPlantaState);
    setMedicaoDateInputMax(plantaDateInput);

    return row;
}

function renderMedicaoProjectPickerRow(project, selected = null, defaultDate = '', allowPlantaLevantada = false) {
    const env = project.environmentType?.name ? ` (${project.environmentType.name})` : '';
    const checked = Boolean(selected);
    const dateValue = selected?.measurementDate
        ? toInputDateValue(selected.measurementDate)
        : defaultDate;
    const plantaChecked = Boolean(selected?.plantaLevantada);
    const plantaDateValue = toInputDateValue(selected?.plantaLevantadaDate);

    const plantaSectionHtml = allowPlantaLevantada
        ? `
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
        </div>`
        : '';

    const row = document.createElement('div');
    row.className = 'medicao-project-row space-y-2 py-2 border-b border-slate-100 last:border-0';
    row.dataset.orderProjectId = String(project.id);
    row.innerHTML = `
        <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2 flex-1 min-w-[180px] text-xs text-slate-700">
                <input type="checkbox" class="medicao-project-check h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    ${checked ? 'checked' : ''} ${!canActOnOrderProject(project) ? 'disabled' : ''}>
                <span class="font-medium">${escapeHtml(project.name)}${escapeHtml(env)}</span>
                ${renderComplementarProjectNoticeHtml(project)}
                ${renderSubstituidoProjectNoticeHtml(project)}
                ${renderSubstituicaoProjectNoticeHtml(project)}
            </label>
            <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-[10px] text-slate-500">Data medição:</span>
                <input type="date" class="medicao-project-date px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600 disabled:bg-slate-50"
                    value="${escapeHtml(dateValue)}" ${checked ? '' : 'disabled'}>
            </div>
        </div>
        ${plantaSectionHtml}
    `;

    const checkbox = row.querySelector('.medicao-project-check');
    const dateInput = row.querySelector('.medicao-project-date');
    const plantaWrap = row.querySelector('.medicao-project-planta-wrap');
    const plantaCheckbox = row.querySelector('.medicao-project-planta-check');
    const plantaDateInput = row.querySelector('.medicao-project-planta-date');

    const syncProjectRowState = () => {
        const enabled = checkbox.checked;
        dateInput.disabled = !enabled;

        if (enabled && !dateInput.value) {
            dateInput.value = document.getElementById('medicao-default-date')?.value || '';
        }

        if (!allowPlantaLevantada || !plantaWrap) return;

        plantaWrap.classList.toggle('hidden', !enabled);
        plantaCheckbox.disabled = !enabled;

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
    if (allowPlantaLevantada && plantaCheckbox) {
        plantaCheckbox.addEventListener('change', syncProjectRowState);
    }

    setMedicaoDateInputMax(dateInput);
    setMedicaoDateInputMax(plantaDateInput);

    applyOrderProjectReadOnlyToElement(row, project);

    return row;
}

async function populateMedicaoProjectsPicker(medicao = null) {
    const picker = document.getElementById('medicao-projects-picker');
    const emptyMsg = document.getElementById('medicao-projects-empty-msg');
    if (!picker) return;

    picker.innerHTML = '';

    if (medicao) {
        const measuredProjects = getMedicaoProjects(medicao);

        if (!measuredProjects.length) {
            emptyMsg?.classList.remove('hidden');
            if (emptyMsg) {
                emptyMsg.textContent = 'Nenhum projeto vinculado a esta medição.';
            }
            return;
        }

        emptyMsg?.classList.add('hidden');

        const orderProjects = await resolveOrderProjectsForMedicao(activeOrderId);
        const orderProjectById = Object.fromEntries(
            orderProjects.map(project => [Number(project.id), project])
        );

        measuredProjects
            .slice()
            .sort((a, b) => String(a.orderProject?.name || orderProjectById[Number(a.orderProjectId)]?.name || '')
                .localeCompare(String(b.orderProject?.name || orderProjectById[Number(b.orderProjectId)]?.name || ''), 'pt-BR'))
            .forEach(medicaoProject => {
                const project = orderProjectById[Number(medicaoProject.orderProjectId)]
                    || medicaoProject.orderProject
                    || { id: medicaoProject.orderProjectId, name: 'Projeto' };

                picker.appendChild(renderMedicaoProjectEditRow(project, medicaoProject));
            });

        return;
    }

    const projects = filterProjectsForMedicaoPicker(
        await resolveOrderProjectsForMedicao(activeOrderId)
    );

    const defaultDate = document.getElementById('medicao-default-date')?.value
        || getTodayInputDate();
    const selectedByProjectId = {};

    if (medicaoPickerPreselectProjectId) {
        selectedByProjectId[medicaoPickerPreselectProjectId] = { measurementDate: defaultDate };
    }

    if (!projects.length) {
        emptyMsg?.classList.remove('hidden');
        if (emptyMsg) {
            emptyMsg.textContent = 'Nenhum projeto com status Aguardando Medição neste pedido.';
        }
        return;
    }

    if (emptyMsg) {
        emptyMsg.textContent = 'Nenhum projeto cadastrado neste pedido.';
    }

    emptyMsg?.classList.add('hidden');
    projects.forEach(project => {
        picker.appendChild(renderMedicaoProjectPickerRow(
            project,
            selectedByProjectId[Number(project.id)],
            defaultDate,
            false
        ));
    });
}

function syncMedicaoProjectDatesFromDefault() {
    if (editingMedicaoId) return;

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
    const isEdit = Boolean(editingMedicaoId);

    document.querySelectorAll('.medicao-project-row').forEach(row => {
        if (isEdit) {
            if (row.dataset.measured !== 'true') return;
        } else {
            const checkbox = row.querySelector('.medicao-project-check');
            if (!checkbox?.checked) return;
        }

        const orderProjectId = Number(row.dataset.orderProjectId);
        const measurementDate = row.querySelector('.medicao-project-date')?.value || '';
        const plantaLevantada = isMedicaoPlantaLevantadaChecked(row);
        const plantaLevantadaDate = plantaLevantada
            ? getMedicaoPlantaLevantadaDate(row)
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

async function openMedicaoModal(medicaoId = null, options = {}) {
    if (!activeOrderId) {
        alertAppDialog('Selecione um pedido primeiro.');
        return;
    }

    if (!medicaoId && !canCreateMedicao()) {
        alertAppDialog('Somente Admin ou usuários marcados como Conferente podem criar medições.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    editingMedicaoId = medicaoId;
    const medicao = medicaoId
        ? medicoesCache.find(item => item.id === medicaoId)
        : null;

    if (medicao && !canEditMedicao(medicao)) {
        alertAppDialog('Você não tem permissão para editar esta medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    document.getElementById('medicao-form').reset();

    const defaultDateWrap = document.getElementById('medicao-default-date-wrap');
    const defaultDateEl = document.getElementById('medicao-default-date');
    const isEdit = Boolean(medicao);

    defaultDateWrap?.classList.toggle('hidden', isEdit);
    if (defaultDateEl) {
        defaultDateEl.required = !isEdit;
        defaultDateEl.value = isEdit ? '' : getTodayInputDate();
        setMedicaoDateInputMax(defaultDateEl);
    }

    document.getElementById('medicao-observation').value = medicao?.observation || '';

    medicaoPickerPreselectProjectId = !isEdit && options?.preselectProjectId
        ? Number(options.preselectProjectId)
        : null;
    await populateMedicaoProjectsPicker(medicao);
    medicaoPickerPreselectProjectId = null;

    const title = document.getElementById('medicao-modal-title');
    const submitBtn = document.getElementById('medicao-form-submit');
    const hintEl = document.getElementById('medicao-projects-hint');
    title.textContent = medicao ? 'Editar Medição' : 'Nova Medição';
    submitBtn.textContent = medicao ? 'Salvar Medição' : 'Criar Medição';
    if (hintEl) {
        hintEl.textContent = medicao
            ? 'Altere a observação e marque planta levantada nos projetos já medidos nesta medição.'
            : 'Marque os projetos com status Aguardando Medição e informe a data da medição de cada um.';
    }

    toggleModal('medicao-modal', true);
}

window.openMedicaoModal = openMedicaoModal;

function closeMedicaoModal() {
    setMedicaoModalLoading(false);
    editingMedicaoId = null;
    toggleModal('medicao-modal', false);
}

window.closeMedicaoModal = closeMedicaoModal;

function setMedicaoModalLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('medicao-modal-loading');
    const messageEl = document.getElementById('medicao-modal-loading-msg');
    const spinner = document.getElementById('medicao-modal-loading-spinner');
    const successIcon = document.getElementById('medicao-modal-loading-success');
    const errorIcon = document.getElementById('medicao-modal-loading-error');
    const show = Boolean(active);

    overlay?.classList.toggle('hidden', !show);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.toggle('text-red-600', status === 'error');
        messageEl.classList.toggle('text-emerald-700', status === 'success');
        messageEl.classList.toggle('text-slate-700', status === 'loading');
    }

    spinner?.classList.toggle('hidden', status !== 'loading');
    successIcon?.classList.toggle('hidden', status !== 'success');
    errorIcon?.classList.toggle('hidden', status !== 'error');

    const submitBtn = document.getElementById('medicao-form-submit');
    if (submitBtn && show) submitBtn.disabled = true;

    const closeBtn = document.querySelector('#medicao-modal button[onclick="closeMedicaoModal()"]');
    if (closeBtn) closeBtn.disabled = show;

    document.querySelectorAll('#medicao-modal input:not([disabled]), #medicao-modal textarea:not([disabled])')
        .forEach(el => {
            if (show) {
                el.dataset.medicaoLoadingDisabled = '1';
                el.disabled = true;
            } else if (el.dataset.medicaoLoadingDisabled === '1') {
                delete el.dataset.medicaoLoadingDisabled;
                el.disabled = false;
            }
        });

    if (!show && submitBtn) submitBtn.disabled = false;
}

async function refreshMedicaoRelatedViews() {
    if (typeof loadPendenciasContent !== 'function') return;

    const pendenciasView = document.getElementById('pendencias-view');
    if (pendenciasView?.classList.contains('hidden')) return;

    await loadPendenciasContent();
}

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
        alertAppDialog('Você não tem permissão para salvar esta medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const defaultDate = document.getElementById('medicao-default-date')?.value;
    const observation = document.getElementById('medicao-observation')?.value.trim() || null;
    const projects = collectMedicaoProjectsFromDom();

    if (!editingMedicaoId && !defaultDate) {
        alertAppDialog('Informe a data da medição.');
        document.getElementById('medicao-default-date')?.focus();
        return;
    }

    if (!editingMedicaoId && isFutureInputDate(defaultDate)) {
        alertAppDialog('A data da medição não pode ser no futuro.', { variant: 'warning', title: 'Aviso' });
        document.getElementById('medicao-default-date')?.focus();
        return;
    }

    if (!projects.length) {
        alertAppDialog(editingMedicaoId
            ? 'Nenhum projeto medido encontrado nesta medição.'
            : 'Selecione ao menos um projeto medido.');
        return;
    }

    for (const project of projects) {
        if (!editingMedicaoId && !project.measurementDate) {
            alertAppDialog('Informe a data de medição para todos os projetos selecionados.');
            return;
        }
        if (!editingMedicaoId && isFutureInputDate(project.measurementDate)) {
            alertAppDialog('A data de medição não pode ser no futuro.', { variant: 'warning', title: 'Aviso' });
            return;
        }
        if (editingMedicaoId && project.plantaLevantada && !project.plantaLevantadaDate) {
            const row = document.querySelector(`.medicao-project-row[data-order-project-id="${project.orderProjectId}"]`);
            const projectName = row?.querySelector('.font-medium')?.textContent?.trim() || 'um projeto';
            alertAppDialog(`Informe a data da planta para o projeto "${projectName}".`);
            return;
        }
        if (editingMedicaoId && project.plantaLevantada && isFutureInputDate(project.plantaLevantadaDate)) {
            const row = document.querySelector(`.medicao-project-row[data-order-project-id="${project.orderProjectId}"]`);
            const projectName = row?.querySelector('.font-medium')?.textContent?.trim() || 'um projeto';
            alertAppDialog(`A data da planta do projeto "${projectName}" não pode ser no futuro.`, { variant: 'warning', title: 'Aviso' });
            return;
        }
    }

    const now = new Date().toISOString();
    let previousPlantaProjectIds = new Set();

    if (medicao?.id) {
        const { data: previousRows } = await supabaseClient
            .from('MedicaoProject')
            .select('orderProjectId, plantaLevantada')
            .eq('medicaoId', medicao.id);

        previousPlantaProjectIds = new Set(
            (previousRows || [])
                .filter(row => row.plantaLevantada)
                .map(row => Number(row.orderProjectId))
        );
    }

    const newlyPlantaProjects = projects.filter(project => (
        project.plantaLevantada
        && !previousPlantaProjectIds.has(Number(project.orderProjectId))
    ));
    const willSendEmail = !medicao || newlyPlantaProjects.length > 0;

    try {
        setMedicaoModalLoading(true, medicao ? 'Salvando medição...' : 'Registrando medição...');
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

        setMedicaoModalLoading(true, 'Salvando projetos medidos...');
        await persistMedicaoProjects(medicaoId, projects);
        if (!medicao) {
            setMedicaoModalLoading(true, 'Atualizando status dos projetos...');
            await applyMedicaoRealizadaStatusToProjects(projects.map(project => project.orderProjectId));
            if (typeof notifyMedicaoRealizadaEmail === 'function') {
                setMedicaoModalLoading(true, 'Enviando e-mail de notificação...');
                await notifyMedicaoRealizadaEmail({
                    orderId: activeOrderId,
                    projects
                });
            }
        } else {
            const plantaProjects = projects.filter(project => project.plantaLevantada);
            if (plantaProjects.length) {
                setMedicaoModalLoading(true, 'Sincronizando planta levantada...');
                await syncPlantaLevantadaToOtherMedicoes(plantaProjects, medicaoId);
            }
            const plantaProjectIds = plantaProjects.map(project => project.orderProjectId);
            if (plantaProjectIds.length) {
                setMedicaoModalLoading(true, 'Atualizando status dos projetos...');
                await applyPlantaLevantadaStatusToProjects(plantaProjectIds);
            }
            if (newlyPlantaProjects.length && typeof notifyPlantaLevantadaEmail === 'function') {
                setMedicaoModalLoading(true, 'Enviando e-mail de notificação...');
                await notifyPlantaLevantadaEmail({
                    orderId: activeOrderId,
                    projects: newlyPlantaProjects
                });
            }
        }

        setMedicaoModalLoading(true, 'Atualizando telas...');
        await loadMedicoes(activeOrderId);
        if (typeof loadOrderProjects === 'function' && activeOrderId) {
            await loadOrderProjects(activeOrderId);
        }
        await refreshMedicaoRelatedViews();

        setMedicaoModalLoading(
            true,
            willSendEmail ? 'Medição salva e notificação enviada!' : 'Medição salva com sucesso!',
            'success'
        );
        await new Promise(resolve => setTimeout(resolve, 900));
        closeMedicaoModal();
    } catch (error) {
        setMedicaoModalLoading(true, `Erro ao salvar medição: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
        setMedicaoModalLoading(false);
    }
}

async function deleteMedicao(medicaoId) {
    const medicao = medicoesCache.find(item => item.id === medicaoId);
    if (!medicao || !canDeleteMedicao(medicao)) {
        alertAppDialog('Você não tem permissão para excluir esta medição.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    if (!(await confirmAppDialog('Excluir esta medição e os projetos vinculados?'))) return;

    const { error } = await supabaseClient
        .from('Medicao')
        .delete()
        .eq('id', medicaoId);

    if (error) {
        alertAppDialog('Erro ao excluir medição: ' + error.message);
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
            const plantaBadge = item.plantaLevantada
                ? `<span class="text-[10px] text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">Planta: sim · ${formatDateOnly(item.plantaLevantadaDate)}</span>`
                : `<span class="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">Planta: não</span>`;
            return `
                <li class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-white border border-teal-200/80 rounded-lg shadow-sm">
                    <div class="flex flex-wrap items-center gap-2 min-w-0">
                        <span class="text-xs font-semibold text-slate-800">${escapeHtml(item.orderProject?.name || 'Projeto')}</span>
                        <span class="text-[10px] text-teal-900 bg-teal-100 border border-teal-200 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">${formatDateOnly(item.measurementDate)}</span>
                    </div>
                    ${plantaBadge}
                </li>
            `;
        }).join('')
        : '<li class="text-xs text-slate-400 py-2 px-3 bg-white border border-dashed border-slate-200 rounded-lg">Nenhum projeto vinculado.</li>';

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
            <div class="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
                <div class="text-[10px] font-semibold text-teal-800 uppercase mb-2">Projetos medidos</div>
                <ul class="space-y-2 list-none m-0 p-0">${projectsHtml}</ul>
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
        updateOrderTabCounts(undefined, undefined, 0);
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

    updateOrderTabCounts(undefined, undefined, medicoes.length);

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
