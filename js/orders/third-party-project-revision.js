let currentThirdPartyRevisionProject = null;
let editingThirdPartyRevisionId = null;
let thirdPartyRevisionModalViewOnly = false;
let thirdPartyRevisionActivityRowCounter = 0;

function getCurrentThirdPartyRevisionProject() {
    return currentThirdPartyRevisionProject;
}

function canApproveThirdPartyProject(project) {
    if (!project || project.status !== THIRD_PARTY_PROJECT_STATUS_SENT) return false;
    if (isAdmin()) return true;
    return typeof isAdminOrOrderConsultorForOrder === 'function'
        && isAdminOrOrderConsultorForOrder(project.orderId);
}

function canReviewThirdPartyProjectAsConsultor(project) {
    if (!project || project.status !== THIRD_PARTY_PROJECT_STATUS_SENT) return false;
    return canApproveThirdPartyProject(project);
}

function canResendThirdPartyProjectAsProjetista(project) {
    if (!project || project.status !== THIRD_PARTY_PROJECT_STATUS_IN_REVIEW) return false;
    if (isAdmin()) return true;
    return currentUser?.role === 'Projetista'
        && Number(project.designerId) === Number(currentUser?.id);
}

function canViewThirdPartyProjectRevision(project) {
    if (!project) return false;
    if (isAdmin()) return true;
    if (canApproveThirdPartyProject(project)) return true;
    if (canResendThirdPartyProjectAsProjetista(project)) return true;
    return typeof isAdminOrOrderConsultorForOrder === 'function'
        && isAdminOrOrderConsultorForOrder(project.orderId);
}

function canEditThirdPartyRevisionActivityFields() {
    if (thirdPartyRevisionModalViewOnly) return false;
    const project = getCurrentThirdPartyRevisionProject();
    if (!project) return false;
    if (project.status === THIRD_PARTY_PROJECT_STATUS_SENT) {
        return canReviewThirdPartyProjectAsConsultor(project);
    }
    if (project.status === THIRD_PARTY_PROJECT_STATUS_IN_REVIEW) {
        return canResendThirdPartyProjectAsProjetista(project);
    }
    return false;
}

function canConsultorEditThirdPartyRevisionDescriptions() {
    const project = getCurrentThirdPartyRevisionProject();
    return project?.status === THIRD_PARTY_PROJECT_STATUS_SENT
        && canReviewThirdPartyProjectAsConsultor(project)
        && !thirdPartyRevisionModalViewOnly;
}

function canProjetistaEditThirdPartyRevisionCompletion() {
    const project = getCurrentThirdPartyRevisionProject();
    return project?.status === THIRD_PARTY_PROJECT_STATUS_IN_REVIEW
        && canResendThirdPartyProjectAsProjetista(project)
        && !thirdPartyRevisionModalViewOnly;
}

function collectThirdPartyRevisionActivitiesFromDom() {
    const rows = document.querySelectorAll('#third-party-revision-activities-list tr');
    return Array.from(rows).map((tr, index) => {
        const rowId = tr.dataset.rowId;
        const isPersisted = rowId && !String(rowId).startsWith('temp-');
        const completed = tr.querySelector('.tp-revision-activity-completed')?.checked || false;

        return {
            rowId,
            id: isPersisted ? Number(rowId) : null,
            description: tr.querySelector('.tp-revision-activity-description')?.value.trim() || '',
            completed,
            observation: tr.querySelector('.tp-revision-activity-observation')?.value.trim() || '',
            completedAt: completed ? (tr.dataset.completedAt || new Date().toISOString()) : null,
            sortOrder: index
        };
    });
}

function allThirdPartyRevisionActivitiesCompleted() {
    const activities = collectThirdPartyRevisionActivitiesFromDom().filter(activity => activity.description);
    if (!activities.length) return false;
    return activities.every(activity => activity.completed);
}

function renderThirdPartyRevisionActivityRow(activity = {}) {
    const project = getCurrentThirdPartyRevisionProject();
    const consultorCanEdit = canConsultorEditThirdPartyRevisionDescriptions();
    const projetistaCanEdit = canProjetistaEditThirdPartyRevisionCompletion();
    const rowId = activity.id || activity.tempId;

    const tr = document.createElement('tr');
    tr.dataset.rowId = rowId;
    if (activity.completedAt) {
        tr.dataset.completedAt = activity.completedAt;
    }

    tr.innerHTML = `
        <td class="p-3 align-top">
            <textarea rows="2" class="tp-revision-activity-description revision-resizable-input px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-violet-600 disabled:bg-slate-50 w-full"
                placeholder="Descreva a atividade..."
                ${consultorCanEdit ? '' : 'disabled'}>${escapeHtml(activity.description || '')}</textarea>
            ${typeof renderThirdPartyRevisionAttachmentsHtml === 'function'
                ? renderThirdPartyRevisionAttachmentsHtml(rowId, consultorCanEdit)
                : ''}
        </td>
        <td class="p-3 align-top text-center">
            <input type="checkbox" class="tp-revision-activity-completed h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                ${activity.completed ? 'checked' : ''}
                ${projetistaCanEdit ? '' : 'disabled'}>
        </td>
        <td class="p-3 align-top">
            <textarea rows="2" class="tp-revision-activity-observation revision-resizable-input px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-violet-600 disabled:bg-slate-50 w-full"
                placeholder="Observação do projetista..."
                ${projetistaCanEdit ? '' : 'disabled'}>${escapeHtml(activity.observation || '')}</textarea>
        </td>
        <td class="p-3 align-top">
            <p class="tp-revision-activity-completed-at px-2 py-1.5 text-xs border border-slate-100 rounded-lg bg-slate-50 text-slate-600 whitespace-nowrap">
                ${activity.completedAt ? formatDate(activity.completedAt) : '—'}
            </p>
        </td>
    `;

    const checkbox = tr.querySelector('.tp-revision-activity-completed');
    const completedAtEl = tr.querySelector('.tp-revision-activity-completed-at');
    checkbox?.addEventListener('change', function () {
        if (this.checked) {
            const now = new Date().toISOString();
            tr.dataset.completedAt = now;
            completedAtEl.textContent = formatDate(now);
        } else {
            delete tr.dataset.completedAt;
            completedAtEl.textContent = '—';
        }
        updateThirdPartyRevisionModalControls(project);
    });

    if (typeof hydrateThirdPartyRevisionAttachmentPreviews === 'function') {
        hydrateThirdPartyRevisionAttachmentPreviews(tr);
    }

    return tr;
}

function addThirdPartyRevisionActivityRow(activity = {}) {
    if (!activity.tempId && !activity.id) {
        thirdPartyRevisionActivityRowCounter += 1;
        activity.tempId = `temp-${thirdPartyRevisionActivityRowCounter}`;
    }

    document.getElementById('third-party-revision-activities-list')
        ?.appendChild(renderThirdPartyRevisionActivityRow(activity));
    document.getElementById('third-party-revision-empty-msg')?.classList.add('hidden');
    updateThirdPartyRevisionModalControls(getCurrentThirdPartyRevisionProject());
}

function updateThirdPartyRevisionModalControls(project) {
    const addBtn = document.getElementById('btn-add-third-party-revision-activity');
    const saveBtn = document.getElementById('btn-save-third-party-revision');
    const resendBtn = document.getElementById('btn-resend-third-party-project');

    if (thirdPartyRevisionModalViewOnly || !project) {
        addBtn?.classList.add('hidden');
        saveBtn?.classList.add('hidden');
        resendBtn?.classList.add('hidden');
        return;
    }

    const consultorMode = project.status === THIRD_PARTY_PROJECT_STATUS_SENT;
    const projetistaMode = project.status === THIRD_PARTY_PROJECT_STATUS_IN_REVIEW;

    if (consultorMode && canReviewThirdPartyProjectAsConsultor(project)) {
        addBtn?.classList.remove('hidden');
        saveBtn?.classList.remove('hidden');
        resendBtn?.classList.add('hidden');
        if (saveBtn) saveBtn.textContent = 'Salvar Revisão';
        return;
    }

    if (projetistaMode && canResendThirdPartyProjectAsProjetista(project)) {
        addBtn?.classList.add('hidden');
        saveBtn?.classList.remove('hidden');
        resendBtn?.classList.remove('hidden');
        const allComplete = allThirdPartyRevisionActivitiesCompleted();
        if (saveBtn) saveBtn.textContent = 'Salvar';
        if (resendBtn) {
            resendBtn.disabled = !allComplete;
            resendBtn.classList.toggle('opacity-50', !allComplete);
            resendBtn.classList.toggle('cursor-not-allowed', !allComplete);
        }
        return;
    }

    addBtn?.classList.add('hidden');
    saveBtn?.classList.add('hidden');
    resendBtn?.classList.add('hidden');
}

function setupThirdPartyRevisionModalHeader(project) {
    const info = document.getElementById('third-party-revision-project-info');
    const badge = document.getElementById('third-party-revision-status-badge');
    const label = getThirdPartyProjectLabel(project);
    const orderCode = project.order?.orderCode || '—';
    const clientName = getOrderClientName(project.order) || '—';

    if (info) {
        info.textContent = `${label} · Pedido ${orderCode} · ${clientName}`;
    }

    if (badge) {
        const statusLabel = getThirdPartyProjectStatusLabel(project.status);
        badge.textContent = statusLabel;
        badge.className = `text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${getThirdPartyProjectStatusBadgeClass(project.status)}`;
    }
}

async function loadThirdPartyRevisionActivities(revisionId) {
    const tbody = document.getElementById('third-party-revision-activities-list');
    if (!tbody) return;

    const { data: activities, error } = await supabaseClient
        .from('ThirdPartyProjectRevisionActivity')
        .select('*')
        .eq('revisionId', revisionId)
        .order('sortOrder', { ascending: true })
        .order('id', { ascending: true });

    tbody.innerHTML = '';

    if (error) {
        if (error.message?.includes('ThirdPartyProjectRevisionActivity')) {
            alertAppDialog('Execute supabase/create-third-party-project-revision.sql no Supabase.');
            return;
        }
        alertAppDialog('Erro ao carregar atividades: ' + error.message);
        return;
    }

    if (!activities?.length) {
        document.getElementById('third-party-revision-empty-msg')?.classList.remove('hidden');
        updateThirdPartyRevisionModalControls(getCurrentThirdPartyRevisionProject());
        return;
    }

    document.getElementById('third-party-revision-empty-msg')?.classList.add('hidden');
    activities.forEach(activity => addThirdPartyRevisionActivityRow(activity));

    if (typeof loadThirdPartyRevisionAttachmentsForActivities === 'function') {
        await loadThirdPartyRevisionAttachmentsForActivities(activities);
    }

    updateThirdPartyRevisionModalControls(getCurrentThirdPartyRevisionProject());
}

async function fetchThirdPartyProjectById(thirdPartyProjectId) {
    const projectId = Number(thirdPartyProjectId);
    if (!projectId) return null;

    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .select(`
            id,
            orderId,
            orderProjectId,
            projectCharacteristicId,
            thirdPartySubtypeId,
            filePath,
            designerId,
            status,
            sentAt,
            approvedAt,
            createdAt,
            updatedAt,
            projectCharacteristic:ProjectCharacteristic(id, name),
            thirdPartySubtype:ThirdPartySubtype(id, name),
            ${THIRD_PARTY_PROJECT_DESIGNER_EMBED},
            orderProject:OrderProject(id, name, projectCode),
            order:salesOrders(id, orderCode, clientId, consultantUserId, cliente:Cliente(nome), consultor:appUsers!consultantUserId(name))
        `)
        .eq('id', projectId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function fetchLatestThirdPartyProjectRevision(thirdPartyProjectId) {
    const { data, error } = await supabaseClient
        .from('ThirdPartyProjectRevision')
        .select('id, thirdPartyProjectId, createdAt, createdById')
        .eq('thirdPartyProjectId', Number(thirdPartyProjectId))
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error?.message?.includes('ThirdPartyProjectRevision')) return null;
    if (error) throw error;
    return data;
}

async function fetchThirdPartyProjectRevisions(thirdPartyProjectId) {
    const { data, error } = await supabaseClient
        .from('ThirdPartyProjectRevision')
        .select(`
            id,
            thirdPartyProjectId,
            createdAt,
            createdById,
            createdBy:appUsers!ThirdPartyProjectRevision_createdById_fkey(id, name),
            activities:ThirdPartyProjectRevisionActivity(
                id,
                description,
                completed,
                observation,
                completedAt,
                sortOrder
            )
        `)
        .eq('thirdPartyProjectId', Number(thirdPartyProjectId))
        .order('createdAt', { ascending: false });

    if (error?.message?.includes('ThirdPartyProjectRevision')) return [];
    if (error) throw error;
    return data || [];
}

async function fetchThirdPartyProjectsSentForConsultor(options = {}) {
    const overviewMode = Boolean(options.overviewMode);

    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .select(`
            id,
            orderId,
            orderProjectId,
            projectCharacteristicId,
            thirdPartySubtypeId,
            filePath,
            designerId,
            status,
            sentAt,
            approvedAt,
            createdAt,
            updatedAt,
            projectCharacteristic:ProjectCharacteristic(id, name),
            thirdPartySubtype:ThirdPartySubtype(id, name),
            ${THIRD_PARTY_PROJECT_DESIGNER_EMBED},
            orderProject:OrderProject(id, name, projectCode, deliveryDate),
            order:salesOrders(id, orderCode, clientId, consultantUserId, cliente:Cliente(nome), consultor:appUsers!consultantUserId(name))
        `)
        .eq('status', THIRD_PARTY_PROJECT_STATUS_SENT)
        .order('sentAt', { ascending: true });

    if (error?.message?.includes('ThirdPartyProject')) return [];
    if (error) throw error;

    let projects = data || [];
    if (!overviewMode) {
        projects = projects.filter(project => typeof isCurrentUserOrderConsultor === 'function'
            && isCurrentUserOrderConsultor(getOrderConsultantNameFromRecord(project.order), project.order?.consultantUserId));
    }

    return projects;
}

async function openThirdPartyProjectRevisionModal(thirdPartyProjectId, options = {}) {
    const project = await fetchThirdPartyProjectById(thirdPartyProjectId);
    if (!project || !canViewThirdPartyProjectRevision(project)) return;

    thirdPartyRevisionModalViewOnly = Boolean(options.viewOnly);
    currentThirdPartyRevisionProject = project;
    editingThirdPartyRevisionId = null;
    thirdPartyRevisionActivityRowCounter = 0;

    if (typeof resetThirdPartyRevisionAttachments === 'function') {
        resetThirdPartyRevisionAttachments();
    }

    const tbody = document.getElementById('third-party-revision-activities-list');
    if (tbody) tbody.innerHTML = '';
    document.getElementById('third-party-revision-empty-msg')?.classList.add('hidden');

    setupThirdPartyRevisionModalHeader(project);

    if (options.revisionId) {
        editingThirdPartyRevisionId = Number(options.revisionId);
        await loadThirdPartyRevisionActivities(editingThirdPartyRevisionId);
    } else if (project.status === THIRD_PARTY_PROJECT_STATUS_IN_REVIEW) {
        const latest = await fetchLatestThirdPartyProjectRevision(project.id);
        if (latest?.id) {
            editingThirdPartyRevisionId = latest.id;
            await loadThirdPartyRevisionActivities(latest.id);
        } else {
            alertAppDialog('Nenhuma revisão encontrada para este projeto.');
            return;
        }
    } else if (project.status === THIRD_PARTY_PROJECT_STATUS_SENT && !thirdPartyRevisionModalViewOnly) {
        addThirdPartyRevisionActivityRow();
    } else if (project.status === THIRD_PARTY_PROJECT_STATUS_SENT) {
        const latest = await fetchLatestThirdPartyProjectRevision(project.id);
        if (latest?.id) {
            editingThirdPartyRevisionId = latest.id;
            await loadThirdPartyRevisionActivities(latest.id);
        }
    }

    updateThirdPartyRevisionModalControls(project);
    toggleModal('third-party-revision-modal', true);
}

function closeThirdPartyProjectRevisionModal() {
    setThirdPartyRevisionModalLoading(false);
    thirdPartyRevisionModalViewOnly = false;
    editingThirdPartyRevisionId = null;
    currentThirdPartyRevisionProject = null;
    if (typeof resetThirdPartyRevisionAttachments === 'function') {
        resetThirdPartyRevisionAttachments();
    }
    toggleModal('third-party-revision-modal', false);
}

async function openThirdPartyRevisionsHistoryModal(thirdPartyProjectId) {
    const project = await fetchThirdPartyProjectById(thirdPartyProjectId);
    if (!project) return;

    const revisions = await fetchThirdPartyProjectRevisions(project.id);
    const contextEl = document.getElementById('third-party-revisions-history-context');
    const contentEl = document.getElementById('third-party-revisions-history-content');

    if (contextEl) {
        contextEl.textContent = `${getThirdPartyProjectLabel(project)} · ${revisions.length} revisão${revisions.length === 1 ? '' : 'ões'}`;
    }

    if (!revisions.length) {
        if (contentEl) {
            contentEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Nenhuma revisão registrada.</p>';
        }
        toggleModal('third-party-revisions-history-modal', true);
        return;
    }

    if (contentEl) {
        contentEl.innerHTML = revisions.map((revision, index) => {
            const activities = (revision.activities || []).sort((a, b) => a.sortOrder - b.sortOrder);
            const createdAt = revision.createdAt ? formatDate(revision.createdAt) : '—';
            const createdBy = revision.createdBy?.name || '—';
            const activityRows = activities.map(activity => `
                <tr>
                    <td class="p-2 align-top text-slate-800">${escapeHtml(activity.description || '—')}</td>
                    <td class="p-2 align-top text-center">${activity.completed ? '✓' : '—'}</td>
                    <td class="p-2 align-top text-slate-600">${escapeHtml(activity.observation || '—')}</td>
                    <td class="p-2 align-top text-slate-500 whitespace-nowrap">${activity.completedAt ? formatDate(activity.completedAt) : '—'}</td>
                </tr>
            `).join('');

            return `
                <div class="border border-slate-200 rounded-xl overflow-hidden ${index ? 'mt-4' : ''}">
                    <div class="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between gap-3 items-center">
                        <div>
                            <p class="text-xs font-semibold text-slate-800">Revisão #${revisions.length - index}</p>
                            <p class="text-[10px] text-slate-500">${createdAt} · ${escapeHtml(createdBy)}</p>
                        </div>
                        <button type="button"
                            class="third-party-revision-history-open-btn text-xs bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 px-2.5 py-1 rounded-lg font-medium"
                            data-third-party-project-id="${project.id}"
                            data-third-party-revision-id="${revision.id}">
                            Abrir
                        </button>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-xs">
                            <thead class="bg-white text-slate-500 uppercase">
                                <tr>
                                    <th class="text-left p-2 font-semibold">Atividade</th>
                                    <th class="text-center p-2 font-semibold w-20">Realizado</th>
                                    <th class="text-left p-2 font-semibold">Observação</th>
                                    <th class="text-left p-2 font-semibold w-28">Data</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">${activityRows || '<tr><td colspan="4" class="p-3 text-slate-400 text-center">Sem atividades</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');

        contentEl.querySelectorAll('.third-party-revision-history-open-btn').forEach(button => {
            button.addEventListener('click', () => {
                closeThirdPartyRevisionsHistoryModal();
                openThirdPartyProjectRevisionModal(
                    Number(button.dataset.thirdPartyProjectId),
                    { revisionId: Number(button.dataset.thirdPartyRevisionId), viewOnly: true }
                );
            });
        });
    }

    toggleModal('third-party-revisions-history-modal', true);
}

function closeThirdPartyRevisionsHistoryModal() {
    toggleModal('third-party-revisions-history-modal', false);
}

function setThirdPartyRevisionModalLoading(active, message = 'Processando...', status = 'loading') {
    const overlay = document.getElementById('third-party-revision-loading');
    const messageEl = document.getElementById('third-party-revision-loading-msg');
    const spinner = document.getElementById('third-party-revision-loading-spinner');
    const successIcon = document.getElementById('third-party-revision-loading-success');
    const errorIcon = document.getElementById('third-party-revision-loading-error');
    const buttons = [
        document.getElementById('btn-save-third-party-revision'),
        document.getElementById('btn-resend-third-party-project'),
        document.getElementById('btn-add-third-party-revision-activity'),
        document.getElementById('btn-close-third-party-revision')
    ];
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
    buttons.forEach(btn => {
        if (!btn) return;
        btn.disabled = show;
        btn.classList.toggle('opacity-60', show);
        btn.classList.toggle('cursor-not-allowed', show);
    });
}

async function persistThirdPartyRevision() {
    const project = getCurrentThirdPartyRevisionProject();
    if (!project) return { ok: false };

    const activities = collectThirdPartyRevisionActivitiesFromDom().filter(activity => activity.description);
    if (!activities.length) {
        alertAppDialog('Adicione ao menos uma atividade.');
        return { ok: false };
    }

    const now = new Date().toISOString();
    let revisionId = editingThirdPartyRevisionId;
    const createdRevision = !revisionId;

    if (!revisionId) {
        const { data: revision, error: revisionError } = await supabaseClient
            .from('ThirdPartyProjectRevision')
            .insert([{
                thirdPartyProjectId: project.id,
                createdAt: now,
                createdById: currentUser?.id || null,
                updatedAt: now,
                updatedById: currentUser?.id || null
            }])
            .select('id')
            .single();

        if (revisionError) {
            alertAppDialog('Erro ao criar revisão: ' + revisionError.message);
            return { ok: false };
        }

        revisionId = revision.id;
        editingThirdPartyRevisionId = revisionId;
    }

    const activityIdByRowId = {};

    for (const activity of activities) {
        const payload = {
            description: activity.description,
            completed: activity.completed,
            observation: activity.observation || null,
            completedAt: activity.completed ? activity.completedAt : null,
            sortOrder: activity.sortOrder,
            updatedAt: now
        };

        if (activity.id) {
            const { error } = await supabaseClient
                .from('ThirdPartyProjectRevisionActivity')
                .update(payload)
                .eq('id', activity.id);
            if (error) {
                alertAppDialog('Erro ao salvar atividade: ' + error.message);
                return { ok: false };
            }
            activityIdByRowId[activity.rowId] = activity.id;
        } else {
            const { data: inserted, error } = await supabaseClient
                .from('ThirdPartyProjectRevisionActivity')
                .insert([{ ...payload, revisionId }])
                .select('id')
                .single();
            if (error || !inserted?.id) {
                alertAppDialog('Erro ao salvar atividade: ' + (error?.message || 'Erro desconhecido'));
                return { ok: false };
            }
            if (typeof migrateThirdPartyRevisionAttachmentDrafts === 'function') {
                migrateThirdPartyRevisionAttachmentDrafts(activity.rowId, inserted.id);
            }
            activityIdByRowId[activity.rowId] = inserted.id;
            activityIdByRowId[String(inserted.id)] = inserted.id;
        }
    }

    if (typeof persistThirdPartyRevisionAttachments === 'function') {
        try {
            await persistThirdPartyRevisionAttachments(revisionId, activityIdByRowId);
        } catch (error) {
            alertAppDialog('Erro ao salvar imagens: ' + error.message);
            return { ok: false };
        }
    }

    await supabaseClient
        .from('ThirdPartyProjectRevision')
        .update({ updatedAt: now, updatedById: currentUser?.id || null })
        .eq('id', revisionId);

    return { ok: true, createdRevision, activities, revisionId };
}

async function updateThirdPartyProjectStatus(thirdPartyProjectId, newStatus, previousStatus, options = {}) {
    const now = new Date().toISOString();
    const updatePayload = {
        status: newStatus,
        updatedAt: now,
        updatedById: currentUser?.id || null
    };

    if (newStatus === THIRD_PARTY_PROJECT_STATUS_SENT) {
        updatePayload.sentAt = now;
    }
    if (newStatus === THIRD_PARTY_PROJECT_STATUS_APPROVED) {
        updatePayload.approvedAt = now;
    }

    const { data, error } = await supabaseClient
        .from('ThirdPartyProject')
        .update(updatePayload)
        .eq('id', Number(thirdPartyProjectId))
        .select(`
            id,
            orderId,
            orderProjectId,
            status,
            sentAt,
            approvedAt,
            filePath,
            designerId,
            thirdPartySubtype:ThirdPartySubtype(id, name),
            orderProject:OrderProject(id, name, projectCode),
            order:salesOrders(id, orderCode, clientId, consultantUserId, cliente:Cliente(nome), consultor:appUsers!consultantUserId(name))
        `)
        .single();

    if (error) throw error;

    if (!options.skipNotify) {
        await notifyThirdPartyProjectStatusChange(data, previousStatus, options);
    }

    return data;
}

async function saveThirdPartyProjectRevision() {
    const project = getCurrentThirdPartyRevisionProject();
    if (!project) return;

    if (project.status === THIRD_PARTY_PROJECT_STATUS_SENT && !canReviewThirdPartyProjectAsConsultor(project)) {
        return;
    }
    if (project.status === THIRD_PARTY_PROJECT_STATUS_IN_REVIEW && !canResendThirdPartyProjectAsProjetista(project)) {
        return;
    }

    setThirdPartyRevisionModalLoading(true, 'Salvando revisão...');

    try {
        const result = await persistThirdPartyRevision();
        if (!result.ok) return;

        if (project.status === THIRD_PARTY_PROJECT_STATUS_SENT && result.createdRevision) {
            setThirdPartyRevisionModalLoading(true, 'Atualizando status...');
            await updateThirdPartyProjectStatus(
                project.id,
                THIRD_PARTY_PROJECT_STATUS_IN_REVIEW,
                THIRD_PARTY_PROJECT_STATUS_SENT,
                { activities: result.activities }
            );
        }

        await refreshThirdPartyProjectViews();
        setThirdPartyRevisionModalLoading(true, 'Revisão salva com sucesso!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));
        closeThirdPartyProjectRevisionModal();
    } catch (error) {
        setThirdPartyRevisionModalLoading(true, `Erro: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
    } finally {
        setThirdPartyRevisionModalLoading(false);
    }
}

async function resendThirdPartyProjectAfterRevision() {
    const project = getCurrentThirdPartyRevisionProject();
    if (!project || !canResendThirdPartyProjectAsProjetista(project)) return;

    if (!allThirdPartyRevisionActivitiesCompleted()) {
        alertAppDialog('Marque todas as atividades como realizadas antes de reenviar.');
        return;
    }

    const confirmed = await confirmAppDialog(
        'O projeto será reenviado para análise do consultor.',
        { title: 'Reenviar projeto de terceiros?', confirmLabel: 'Reenviar' }
    );
    if (!confirmed) return;

    setThirdPartyRevisionModalLoading(true, 'Salvando revisão...');

    try {
        const result = await persistThirdPartyRevision();
        if (!result.ok) return;

        setThirdPartyRevisionModalLoading(true, 'Reenviando projeto...');
        await updateThirdPartyProjectStatus(
            project.id,
            THIRD_PARTY_PROJECT_STATUS_SENT,
            THIRD_PARTY_PROJECT_STATUS_IN_REVIEW,
            { activities: result.activities }
        );

        await refreshThirdPartyProjectViews();
        setThirdPartyRevisionModalLoading(true, 'Projeto reenviado com sucesso!', 'success');
        await new Promise(resolve => setTimeout(resolve, 900));
        closeThirdPartyProjectRevisionModal();
    } catch (error) {
        setThirdPartyRevisionModalLoading(true, `Erro: ${error.message}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 2200));
    } finally {
        setThirdPartyRevisionModalLoading(false);
    }
}

async function approveThirdPartyProject(thirdPartyProjectId) {
    const project = await fetchThirdPartyProjectById(thirdPartyProjectId);
    if (!project || !canApproveThirdPartyProject(project)) {
        alertAppDialog('Você não tem permissão para aprovar este projeto.');
        return;
    }

    const confirmed = await confirmAppDialog(
        'O projeto de terceiros será marcado como aprovado.',
        { title: 'Aprovar projeto de terceiros?', confirmLabel: 'Aprovar', variant: 'success' }
    );
    if (!confirmed) return;

    const previousStatus = project.status;

    setThirdPartyProjectActionLoading(true, 'Aprovando projeto...');

    try {
        const updatedProject = await updateThirdPartyProjectStatus(
            project.id,
            THIRD_PARTY_PROJECT_STATUS_APPROVED,
            previousStatus,
            { skipNotify: true }
        );

        setThirdPartyProjectActionLoading(true, 'Enviando notificação por e-mail...');
        await notifyThirdPartyProjectStatusChange(updatedProject, previousStatus);

        setThirdPartyProjectActionLoading(true, 'Atualizando telas...');
        await refreshThirdPartyProjectViews();

        setThirdPartyProjectActionLoading(true, 'Projeto aprovado com sucesso!', 'success');
        await waitThirdPartyProjectActionStatus(900);
    } catch (error) {
        setThirdPartyProjectActionLoading(true, `Erro ao aprovar: ${error.message}`, 'error');
        await waitThirdPartyProjectActionStatus(2200);
    } finally {
        setThirdPartyProjectActionLoading(false);
    }
}

async function refreshThirdPartyProjectViews() {
    if (activeOrderId && typeof loadOrderThirdPartyProjectsTab === 'function') {
        await loadOrderThirdPartyProjectsTab(activeOrderId);
    }
    if (typeof loadPendenciasThirdPartyConsultor === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
        await loadPendenciasThirdPartyConsultor();
    }
    if (typeof loadPendenciasThirdPartyProjetista === 'function'
        && !document.getElementById('pendencias-view')?.classList.contains('hidden')) {
        await loadPendenciasThirdPartyProjetista();
    }
    if (typeof refreshPendenciasOverviewCounts === 'function') {
        await refreshPendenciasOverviewCounts();
    }
}

function bindThirdPartyProjectRevisionEvents() {
    document.getElementById('btn-close-third-party-revision')?.addEventListener('click', closeThirdPartyProjectRevisionModal);
    document.getElementById('btn-cancel-third-party-revision')?.addEventListener('click', closeThirdPartyProjectRevisionModal);
    document.getElementById('btn-save-third-party-revision')?.addEventListener('click', saveThirdPartyProjectRevision);
    document.getElementById('btn-resend-third-party-project')?.addEventListener('click', resendThirdPartyProjectAfterRevision);
    document.getElementById('btn-add-third-party-revision-activity')?.addEventListener('click', () => {
        if (canConsultorEditThirdPartyRevisionDescriptions()) {
            addThirdPartyRevisionActivityRow();
        }
    });
    document.getElementById('btn-close-third-party-revisions-history')?.addEventListener('click', closeThirdPartyRevisionsHistoryModal);
    document.getElementById('btn-close-third-party-revisions-history-footer')?.addEventListener('click', closeThirdPartyRevisionsHistoryModal);

    if (typeof bindThirdPartyRevisionAttachmentEvents === 'function') {
        bindThirdPartyRevisionAttachmentEvents();
    }
}

window.approveThirdPartyProject = approveThirdPartyProject;
window.openThirdPartyProjectRevisionModal = openThirdPartyProjectRevisionModal;
window.openThirdPartyRevisionsHistoryModal = openThirdPartyRevisionsHistoryModal;
