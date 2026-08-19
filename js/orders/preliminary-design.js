let anteprojetoConferencesCache = [];
let anteprojetoObservationsCache = [];
let editingAnteprojetoConferenceId = null;
let pendingAnteprojetoReturnConferenceId = null;
let pendingAnteprojetoApproveConferenceId = null;

const ANTEPROJETO_DISPOSITION_REQ_PROJ = 'req_proj';
const ANTEPROJETO_DISPOSITION_REQ_CONS = 'req_cons';
const ANTEPROJETO_DISPOSITION_OK = 'ok';
const ANTEPROJETO_CONFERENCE_REQUEST_TEXT = 'Requisição criada a partir da conferência.';

function normalizeConsultorDisposition(observation) {
    const disposition = observation?.consultantDisposition;
    if (disposition === ANTEPROJETO_DISPOSITION_REQ_PROJ
        || disposition === ANTEPROJETO_DISPOSITION_REQ_CONS
        || disposition === ANTEPROJETO_DISPOSITION_OK) {
        return disposition;
    }
    if (observation?.consultantChecked) {
        return ANTEPROJETO_DISPOSITION_OK;
    }
    return null;
}

function getConsultorDispositionLabel(disposition) {
    if (disposition === ANTEPROJETO_DISPOSITION_REQ_PROJ) return 'Req. Proj.';
    if (disposition === ANTEPROJETO_DISPOSITION_REQ_CONS) return 'Req. Cons.';
    if (disposition === ANTEPROJETO_DISPOSITION_OK) return 'OK';
    return '—';
}

function getObservationConferenteText(observation) {
    return observation?.observation?.text
        || observation?.text
        || '';
}

function buildConferenceRequestActivityDescription(moduleName, conferenteText, consultantResponse) {
    return [
        `Módulo: ${moduleName || '—'}`,
        `Conferente: ${conferenteText || '—'}`,
        `Resp. Consultor: ${consultantResponse || '—'}`
    ].join('\n');
}

function validateConsultorObservationDispositions(observations) {
    if (!observations.length) {
        return { valid: false, message: 'A conferência precisa ter ao menos uma observação.' };
    }

    for (const observation of observations) {
        const disposition = normalizeConsultorDisposition(observation);
        if (!disposition) {
            return {
                valid: false,
                message: 'Para cada observação, selecione Req. Proj., Req. Cons. ou OK.'
            };
        }

        if ((disposition === ANTEPROJETO_DISPOSITION_REQ_PROJ
                || disposition === ANTEPROJETO_DISPOSITION_REQ_CONS)
            && !String(observation.consultantResponse || '').trim()) {
            return {
                valid: false,
                message: 'Informe a resposta do consultor nas observações marcadas como Req. Proj. ou Req. Cons.'
            };
        }
    }

    return { valid: true, message: '' };
}

function getConferenceProjectObservations(conference) {
    return (conference?.conferenceProjects || []).flatMap(conferenceProject => {
        const orderProjectId = Number(conferenceProject.orderProjectId);
        return (conferenceProject.modules || []).flatMap(module => {
            const raw = module.observations;
            const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
            return list.map(obs => ({
                ...obs,
                moduleId: module.id,
                moduleName: module.name,
                orderProjectId,
                text: getObservationConferenteText(obs)
            }));
        });
    });
}

function isAdminOrOrderConsultorForOrder(orderId, consultantInfo = null) {
    if (currentUser?.role === 'Admin') return true;
    if (currentUser?.role !== 'Consultor') return false;

    const info = consultantInfo || {
        name: getOrderConsultantName(orderId),
        userId: getOrderConsultantUserId(orderId)
    };

    return isCurrentUserOrderConsultor(info.name, info.userId);
}

function isAnteprojetoConferenceConfirmed(conference) {
    return conference?.status === 'Confirmada' || conference?.status === 'Aprovada';
}

function isAnteprojetoConferenceApproved(conference) {
    return conference?.status === 'Aprovada';
}

const ANTEPROJETO_CONFERENCE_STATUS_DRAFT = 'Rascunho';
const ANTEPROJETO_CONFERENCE_STATUS_IN_PROGRESS = 'Em andamento';

function isAnteprojetoConferenceDraft(conference) {
    if (!conference) return true;
    return conference.status === ANTEPROJETO_CONFERENCE_STATUS_DRAFT;
}

function canViewAnteprojetoConference(conference) {
    if (!isAnteprojetoConferenceDraft(conference)) return true;
    return canEditAnteprojetoConference(conference);
}

function canCreateAnteprojetoConference() {
    if (!activeOrderId) return false;
    return canCreateAsAdminOrConferente();
}

function canEditAnteprojetoConference(conference) {
    if (conference && isAnteprojetoConferenceConfirmed(conference)) return false;
    if (!conference) {
        return canCreateAnteprojetoConference();
    }
    if (currentUser?.role === 'Admin') return true;
    if (isAnteprojetoConferenceDraft(conference) && typeof isConferente === 'function' && isConferente()) {
        return !conference.createdById || Number(conference.createdById) === Number(currentUser.id);
    }
    return currentUser?.role === 'Projetista' && conference.designerId === currentUser.id;
}

function canExtendAnteprojetoConferenceStructure(conference) {
    if (!conference) return canCreateAnteprojetoConference();
    return isAnteprojetoConferenceDraft(conference) && canEditAnteprojetoConference(conference);
}

function canSendAnteprojetoConference(conference) {
    if (conference && !isAnteprojetoConferenceDraft(conference)) return false;
    return canEditAnteprojetoConference(conference);
}

function canEditAnteprojetoConsultorFields(conference) {
    if (!conference || isAnteprojetoConferenceConfirmed(conference) || isAnteprojetoConferenceDraft(conference)) {
        return false;
    }
    return isAdminOrOrderConsultorForOrder(conference.orderId || activeOrderId);
}

function canConfirmAnteprojetoConference(conference) {
    if (!conference || isAnteprojetoConferenceConfirmed(conference) || isAnteprojetoConferenceDraft(conference)) {
        return false;
    }
    return isAdminOrOrderConsultorForOrder(conference.orderId || activeOrderId);
}

function canApproveAnteprojetoConference(conference) {
    if (!conference || conference.status !== 'Confirmada') return false;
    if (currentUser?.role === 'Admin') return true;
    return isGestorComercial();
}

function canReturnPreliminaryDesignConferenceToConsultor(conference) {
    if (!conference || conference.status !== 'Confirmada') return false;
    if (currentUser?.role === 'Admin') return true;
    return isGestorComercial();
}

function getConferenceModules(conference) {
    return (conference?.conferenceProjects || []).flatMap(project => project.modules || []);
}

function getConferenceModuleObservations(conference) {
    return getConferenceModules(conference).flatMap(module => {
        const raw = module.observations;
        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
        return list.map(obs => ({
            ...obs,
            moduleId: module.id,
            moduleName: module.name
        }));
    });
}

function normalizeOrderId(orderId) {
    return orderId == null ? null : Number(orderId);
}

function getCachedOrderProjects(orderId) {
    const normalizedId = normalizeOrderId(orderId);
    if (normalizedId == null || typeof orderProjectsCache === 'undefined') return [];
    return orderProjectsCache.filter(project => Number(project.orderId) === normalizedId);
}

async function resolveOrderProjectsForOrder(orderId) {
    const normalizedId = normalizeOrderId(orderId);
    if (normalizedId == null) return [];

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

    if (result.error?.message?.includes('environmentType')) {
        result = await supabaseClient
            .from('OrderProject')
            .select('*')
            .eq('orderId', normalizedId)
            .order('name', { ascending: true });
    }

    if (result.error) {
        console.error('resolveOrderProjectsForOrder:', result.error);
        return [];
    }

    return enrichAnteprojetoProjectsWithStatus(result.data || []);
}

async function getConferenciaEnviadaStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Conferência Enviada')
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Conferência Enviada')
        .maybeSingle();

    return fallback?.id || null;
}

async function applyConferenciaEnviadaStatusToProjects(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getConferenciaEnviadaStatusId();
    if (!statusId) {
        throw new Error('Status "Conferência Enviada" não encontrado. Cadastre em Gestão → Status de Projeto.');
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

async function getConferenciaRealizadaStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Conferência Realizada')
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Conferência Realizada')
        .maybeSingle();

    return fallback?.id || null;
}

function getConferenceOrderProjectIds(conference) {
    return [...new Set(
        (conference?.conferenceProjects || [])
            .map(project => Number(project.orderProjectId))
            .filter(Boolean)
    )];
}

async function applyConferenciaRealizadaStatusToProjects(orderProjectIds, options = {}) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getConferenciaRealizadaStatusId();
    if (!statusId) {
        throw new Error('Status "Conferência Realizada" não encontrado. Cadastre em Gestão → Status de Projeto.');
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

    if (options.skipEmail) return;

    const conference = options.conference || null;
    if (conference && typeof notifyConferenciaConfirmadaEmail === 'function') {
        await notifyConferenciaConfirmadaEmail({
            orderId: conference.orderId || options.orderId,
            orderProjectIds: uniqueIds,
            conference
        });
        return;
    }

    await notifyOrderProjectStatusChangeForProjects(uniqueIds, 'Conferência Realizada', options);
}

async function getAguardandoProjetoTecnicoStatusId() {
    const { data, error } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Aguardando Projeto Técnico')
        .eq('isActive', true)
        .maybeSingle();

    if (!error && data?.id) return data.id;

    const { data: fallback } = await supabaseClient
        .from('OrderProjectStatus')
        .select('id')
        .eq('name', 'Aguardando Projeto Técnico')
        .maybeSingle();

    return fallback?.id || null;
}

async function applyAguardandoProjetoTecnicoStatusToProjects(orderProjectIds) {
    const uniqueIds = [...new Set(orderProjectIds.map(id => Number(id)).filter(Boolean))];
    if (!uniqueIds.length) return;

    const statusId = await getAguardandoProjetoTecnicoStatusId();
    if (!statusId) {
        throw new Error('Status "Aguardando Projeto Técnico" não encontrado. Cadastre em Gestão → Status de Projeto.');
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

function getUsedOrderProjectIds(editingConferenceId = null) {
    const used = new Set();
    anteprojetoConferencesCache.forEach(conference => {
        if (conference.id === editingConferenceId) return;
        (conference.conferenceProjects || []).forEach(project => {
            if (project.orderProjectId) used.add(Number(project.orderProjectId));
        });
    });
    return used;
}

async function loadAnteprojetoObservations() {
    const { data, error } = await supabaseClient
        .from('PreliminaryDesignObservation')
        .select('id, text')
        .order('text', { ascending: true });

    if (error) {
        console.error('loadAnteprojetoObservations:', error);
        anteprojetoObservationsCache = [];
        return [];
    }

    anteprojetoObservationsCache = data || [];
    return anteprojetoObservationsCache;
}

function refreshAnteprojetoObservationDatalist() {
    const datalist = document.getElementById('anteprojeto-observation-options');
    if (!datalist) return;
    datalist.innerHTML = anteprojetoObservationsCache
        .map(obs => `<option value="${escapeHtml(obs.text)}"></option>`)
        .join('');
}

async function upsertAnteprojetoObservation(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;

    const existing = anteprojetoObservationsCache.find(
        obs => obs.text.localeCompare(trimmed, 'pt-BR', { sensitivity: 'base' }) === 0
    );
    if (existing) return existing.id;

    const { data, error } = await supabaseClient
        .from('PreliminaryDesignObservation')
        .insert({ text: trimmed, createdById: currentUser.id })
        .select('id, text')
        .single();

    if (error?.code === '23505') {
        const { data: found } = await supabaseClient
            .from('PreliminaryDesignObservation')
            .select('id, text')
            .eq('text', trimmed)
            .maybeSingle();
        if (found) {
            anteprojetoObservationsCache.push(found);
            return found.id;
        }
    }

    if (error) {
        console.error('upsertAnteprojetoObservation:', error);
        return null;
    }

    anteprojetoObservationsCache.push(data);
    anteprojetoObservationsCache.sort((a, b) =>
        a.text.localeCompare(b.text, 'pt-BR', { sensitivity: 'base' })
    );
    refreshAnteprojetoObservationDatalist();
    return data.id;
}

let anteprojetoAvailableProjectsCache = [];

function getConferenceSketchUpPath(conference) {
    if (!conference) return '';
    if (conference.sketchUpPath) return conference.sketchUpPath;
    const legacy = (conference.conferenceProjects || []).find(project => project.sketchUpPath);
    return legacy?.sketchUpPath || '';
}

function getProjectLabel(project) {
    return project.name || 'Projeto';
}

function getProjectStatusName(project) {
    return project?.projectStatus?.name || '';
}

function isProjectPlantaLevantada(project) {
    return getProjectStatusName(project) === 'Planta Levantada';
}

function canShowOrderProjectConferenciaAction(project, conferenceContext = null) {
    if (!canCreateAnteprojetoConference()) return false;
    if (!canActOnOrderProject(project)) return false;
    if (!isProjectPlantaLevantada(project)) return false;
    if (conferenceContext?.alreadyInConference) return false;
    return true;
}

function canShowOrderProjectVerConferenciaAction(project, orderId, conferenceContext = null) {
    if (!conferenceContext?.conferenceId) return false;

    const statusName = getOrderProjectStatusName(project);
    if (statusName === 'Conferência Enviada') {
        return isAdminOrOrderConsultorForOrder(orderId);
    }
    if (statusName === 'Conferência Realizada') {
        return currentUser?.role === 'Admin' || isGestorComercial();
    }
    return false;
}

async function fetchPreliminaryDesignConferenceContextByProjectIds(projectIds, orderId) {
    const normalizedProjectIds = [...new Set(projectIds.map(id => Number(id)).filter(Boolean))];
    const normalizedOrderId = Number(orderId);
    if (!normalizedProjectIds.length || !normalizedOrderId) return {};

    let result = await supabaseClient
        .from('PreliminaryDesignConferenceProject')
        .select('orderProjectId, conference:PreliminaryDesignConference(id, orderId, createdAt)')
        .in('orderProjectId', normalizedProjectIds);

    let rows = result.data || [];

    if (result.error?.message?.includes('PreliminaryDesignConference')) {
        const fallback = await supabaseClient
            .from('PreliminaryDesignConferenceProject')
            .select('orderProjectId, conferenceId')
            .in('orderProjectId', normalizedProjectIds);

        if (fallback.error) {
            console.error('fetchPreliminaryDesignConferenceContextByProjectIds:', fallback.error);
            return {};
        }

        rows = fallback.data || [];
        const conferenceIds = [...new Set(rows.map(row => Number(row.conferenceId)).filter(Boolean))];
        const conferenceById = {};

        if (conferenceIds.length) {
            const { data: conferences, error } = await supabaseClient
                .from('PreliminaryDesignConference')
                .select('id, orderId, createdAt')
                .in('id', conferenceIds);

            if (error) {
                console.error('fetchPreliminaryDesignConferenceContextByProjectIds:', error);
                return {};
            }

            (conferences || []).forEach(conference => {
                conferenceById[Number(conference.id)] = conference;
            });
        }

        rows = rows.map(row => ({
            ...row,
            conference: conferenceById[Number(row.conferenceId)] || null
        }));
    } else if (result.error) {
        console.error('fetchPreliminaryDesignConferenceContextByProjectIds:', result.error);
        return {};
    }

    const conferenceByProjectId = {};

    rows.forEach(row => {
        const conference = row.conference;
        if (!conference || Number(conference.orderId) !== normalizedOrderId) return;

        const projectId = Number(row.orderProjectId);
        const conferenceId = Number(conference.id);
        const existing = conferenceByProjectId[projectId];
        const createdAt = conference.createdAt ? new Date(conference.createdAt).getTime() : 0;
        const existingCreatedAt = existing?.createdAt ? new Date(existing.createdAt).getTime() : 0;

        if (!existing || createdAt >= existingCreatedAt) {
            conferenceByProjectId[projectId] = {
                conferenceId,
                createdAt: conference.createdAt || null
            };
        }
    });

    return Object.fromEntries(normalizedProjectIds.map(projectId => {
        const entry = conferenceByProjectId[projectId] || null;
        return [
            projectId,
            {
                alreadyInConference: Boolean(entry?.conferenceId),
                conferenceId: entry?.conferenceId || null
            }
        ];
    }));
}

async function openOrderProjectConferenciaModal(projectId, orderId = activeOrderId) {
    if (!canCreateAnteprojetoConference()) {
        alertAppDialog('Sem permissão para criar conferência.', { variant: 'warning', title: 'Aviso' });
        return;
    }

    const normalizedOrderId = Number(orderId);
    if (!normalizedOrderId) return;

    activeOrderId = normalizedOrderId;

    if (typeof loadPreliminaryDesignConferences === 'function') {
        await loadPreliminaryDesignConferences(normalizedOrderId);
    }

    await openPreliminaryDesignModal();
}

async function enrichAnteprojetoProjectsWithStatus(projects) {
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
        console.error('enrichAnteprojetoProjectsWithStatus:', error);
        return projects;
    }

    const statusById = Object.fromEntries((statuses || []).map(status => [status.id, status]));
    return projects.map(project => ({
        ...project,
        projectStatus: project.projectStatus || statusById[project.statusId] || null
    }));
}



function bindPreliminaryDesignEvents() {
    document.getElementById('btn-new-anteprojeto')?.addEventListener('click', () => openPreliminaryDesignModal());
    document.getElementById('btn-anteprojeto-modal-confirm')?.addEventListener('click', async () => {
        confirmPreliminaryDesignConferenceFromModal();
    });
    document.getElementById('btn-anteprojeto-modal-approve')?.addEventListener('click', async () => {
        if (!editingAnteprojetoConferenceId) return;
        await showPreliminaryDesignApproveDeliveryModal(editingAnteprojetoConferenceId);
    });
    document.getElementById('btn-anteprojeto-modal-return')?.addEventListener('click', () => {
        if (!editingAnteprojetoConferenceId) return;
        showPreliminaryDesignReturnObservationForm(editingAnteprojetoConferenceId);
    });
    document.getElementById('btn-anteprojeto-return-modal-cancel')?.addEventListener('click', closeAnteprojetoReturnModal);
    document.getElementById('btn-anteprojeto-return-modal-submit')?.addEventListener('click', submitAnteprojetoReturnModal);
    document.getElementById('btn-anteprojeto-approve-modal-cancel')?.addEventListener('click', closeAnteprojetoApproveDeliveryModal);
    document.getElementById('btn-anteprojeto-approve-modal-submit')?.addEventListener('click', submitAnteprojetoApproveDeliveryModal);
    document.getElementById('anteprojeto-approve-order-delivery')?.addEventListener('change', syncAnteprojetoApproveProjectDeliveryConstraints);
    document.getElementById('anteprojeto-approve-order-delivery')?.addEventListener('input', syncAnteprojetoApproveProjectDeliveryConstraints);
    document.getElementById('anteprojeto-projects-structure')?.addEventListener('change', event => {
        if (event.target?.classList?.contains('anteprojeto-observation-checked')) {
            refreshAnteprojetoModalConfirmButton();
        }
    });
    document.getElementById('btn-add-anteprojeto-project')?.addEventListener('click', async () => {
        const conference = editingAnteprojetoConferenceId
            ? anteprojetoConferencesCache.find(c => c.id === editingAnteprojetoConferenceId)
            : null;
        addAnteprojetoProjectFromSelect({
            canEditStructure: canEditAnteprojetoConference(conference),
            canExtendStructure: canExtendAnteprojetoConferenceStructure(conference),
            canEditConsultor: canEditAnteprojetoConsultorFields(conference),
            readOnly: false
        });
    });
    document.getElementById('anteprojeto-form')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        await saveAnteprojetoConference({ send: false });
    });
    document.getElementById('btn-anteprojeto-modal-send')?.addEventListener('click', async () => {
        await sendAnteprojetoConference();
    });
}

const bindAnteprojetoEvents = bindPreliminaryDesignEvents;
