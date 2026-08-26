function getConferenceRequestProfileForDisposition(disposition) {
    return disposition === ANTEPROJETO_DISPOSITION_REQ_PROJ ? 'Consultor' : 'Projetista';
}

function groupConferenceObservationsForRequests(conference) {
    const grouped = {};

    getConferenceProjectObservations(conference).forEach(observation => {
        const disposition = normalizeConsultorDisposition(observation);
        if (disposition !== ANTEPROJETO_DISPOSITION_REQ_PROJ
            && disposition !== ANTEPROJETO_DISPOSITION_REQ_CONS) {
            return;
        }

        const orderProjectId = Number(observation.orderProjectId);
        if (!orderProjectId) return;

        const key = `${orderProjectId}:${disposition}`;
        if (!grouped[key]) {
            grouped[key] = {
                orderProjectId,
                disposition,
                observations: []
            };
        }
        grouped[key].observations.push(observation);
    });

    return Object.values(grouped);
}

async function insertConferenceOrderRequest({
    orderId,
    orderProjectId,
    designerId,
    requestProfile,
    createdById
}) {
    const now = new Date().toISOString();
    let payload = {
        orderId,
        orderProjectId,
        designerId,
        designerRequest: ANTEPROJETO_CONFERENCE_REQUEST_TEXT,
        requestProfile,
        status: getInitialRequestStatus(requestProfile),
        requestType: REQUEST_TYPE_PROJECT,
        fromConference: 'Y',
        createdById,
        updatedById: createdById,
        createdAt: now,
        updatedAt: now
    };

    let { data, error } = await supabaseClient
        .from('OrderRequest')
        .insert([payload])
        .select('*')
        .single();

    if (error?.message?.includes('requestType')) {
        const { requestType: _omitType, ...fallbackPayload } = payload;
        ({ data, error } = await supabaseClient
            .from('OrderRequest')
            .insert([fallbackPayload])
            .select('*')
            .single());
        payload = fallbackPayload;
    }

    if (error?.message?.includes('fromConference')) {
        const { fromConference: _omit, ...fallbackPayload } = payload;
        ({ data, error } = await supabaseClient
            .from('OrderRequest')
            .insert([fallbackPayload])
            .select('*')
            .single());
    }

    if (error?.message?.includes('orderProjectId')) {
        const { orderProjectId: _omit, ...fallbackPayload } = payload;
        ({ data, error } = await supabaseClient
            .from('OrderRequest')
            .insert([fallbackPayload])
            .select('*')
            .single());
    }

    if (error) throw error;
    return data;
}

async function insertConferenceOrderRequestActivities(requestId, observations) {
    const now = new Date().toISOString();

    for (let index = 0; index < observations.length; index += 1) {
        const observation = observations[index];
        const description = buildConferenceRequestActivityDescription(
            observation.moduleName,
            getObservationConferenteText(observation),
            observation.consultantResponse
        );

        const { error } = await supabaseClient
            .from('OrderRequestActivity')
            .insert([{
                orderRequestId: requestId,
                description,
                completed: false,
                observation: null,
                completedAt: null,
                sortOrder: index,
                createdAt: now,
                updatedAt: now
            }]);

        if (error) throw error;
    }
}

async function createConferenceOrderRequestsFromApproval(conference, approvedByUserId) {
    if (!conference?.id || !conference?.orderId) {
        return { created: [] };
    }

    const gestorProjetos = typeof fetchActiveGestorProjetosUser === 'function'
        ? await fetchActiveGestorProjetosUser()
        : null;

    if (!gestorProjetos?.id) {
        throw new Error('Gestor de projetos não encontrado para gerar as requisições da conferência.');
    }

    let sourceConference = conference;
    if (typeof fetchAnteprojetoConferenceById === 'function') {
        const freshConference = await fetchAnteprojetoConferenceById(conference.id);
        if (freshConference) {
            sourceConference = freshConference;
        }
    }

    const groups = groupConferenceObservationsForRequests(sourceConference);
    const created = [];

    for (const group of groups) {
        const request = await insertConferenceOrderRequest({
            orderId: sourceConference.orderId,
            orderProjectId: group.orderProjectId,
            designerId: gestorProjetos.id,
            requestProfile: getConferenceRequestProfileForDisposition(group.disposition),
            createdById: approvedByUserId
        });

        await insertConferenceOrderRequestActivities(request.id, group.observations);

        if (typeof notifyOrderRequestEmail === 'function') {
            await notifyOrderRequestEmail('created', {
                ...request,
                activities: group.observations.map((observation, index) => ({
                    description: buildConferenceRequestActivityDescription(
                        observation.moduleName,
                        getObservationConferenteText(observation),
                        observation.consultantResponse
                    ),
                    completed: false,
                    sortOrder: index
                }))
            });
        }

        created.push(request);
    }

    return { created };
}

window.createConferenceOrderRequestsFromApproval = createConferenceOrderRequestsFromApproval;
