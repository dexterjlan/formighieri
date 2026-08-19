/**
 * Regras centralizadas de destinatários de e-mail por status de projeto.
 * Consultor = consultor do pedido. Projetista = designerId do projeto.
 */
const PROJECT_STATUS_RECIPIENT_ROLE = {
    CONFERENTE: 'conferente',
    CONSULTOR: 'consultor',
    GESTOR_COMERCIAL: 'gestor_comercial',
    GESTOR_PROJETOS: 'gestor_projetos',
    GESTOR_FABRICA: 'gestor_fabrica',
    PROJETISTA: 'projetista',
    PPCP: 'ppcp',
    REVISOR: 'revisor'
};

/** status destino → papéis que recebem e-mail */
const ORDER_PROJECT_STATUS_EMAIL_RULES = {
    'Aguardando Medição': [
        PROJECT_STATUS_RECIPIENT_ROLE.CONFERENTE,
        PROJECT_STATUS_RECIPIENT_ROLE.CONSULTOR
    ],
    'Medição Realizada': [
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_COMERCIAL,
        PROJECT_STATUS_RECIPIENT_ROLE.CONSULTOR
    ],
    'Planta Levantada': [
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_COMERCIAL,
        PROJECT_STATUS_RECIPIENT_ROLE.CONSULTOR
    ],
    'Conferência Enviada': [
        PROJECT_STATUS_RECIPIENT_ROLE.CONSULTOR
    ],
    'Conferência Realizada': [
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_COMERCIAL
    ],
    'Aguardando Projeto Técnico': [
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_PROJETOS,
        PROJECT_STATUS_RECIPIENT_ROLE.CONSULTOR
    ],
    'Projeto Técnico': [
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_PROJETOS,
        PROJECT_STATUS_RECIPIENT_ROLE.CONSULTOR
    ],
    'Em Revisão Comercial Cons.': [
        PROJECT_STATUS_RECIPIENT_ROLE.CONSULTOR
    ],
    'Em Revisão Comercial Proj.': [
        PROJECT_STATUS_RECIPIENT_ROLE.PROJETISTA
    ],
    'Em Revisão Comercial': [
        PROJECT_STATUS_RECIPIENT_ROLE.CONSULTOR
    ],
    'Em Revisão Técnica': [
        PROJECT_STATUS_RECIPIENT_ROLE.PROJETISTA
    ],
    'Em Revisão Técnica Revisor': [
        PROJECT_STATUS_RECIPIENT_ROLE.REVISOR,
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_PROJETOS
    ],
    'Em Revisão Técnica Lider': [
        PROJECT_STATUS_RECIPIENT_ROLE.REVISOR,
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_PROJETOS
    ],
    'Em Revisão Técnica Proj.': [
        PROJECT_STATUS_RECIPIENT_ROLE.PROJETISTA
    ],
    'Aguardando Aprovação': [
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_COMERCIAL
    ],
    'Nomear': [
        PROJECT_STATUS_RECIPIENT_ROLE.PROJETISTA
    ],
    'Aguardando PPCP': [
        PROJECT_STATUS_RECIPIENT_ROLE.PPCP,
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_PROJETOS
    ],
    'Implantação': [
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_PROJETOS
    ],
    'Em Produção': [
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_PROJETOS,
        PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_FABRICA
    ],
    'Montagem Externa': [
        PROJECT_STATUS_RECIPIENT_ROLE.CONSULTOR
    ]
};

function hasOrderProjectStatusEmailRule(statusName) {
    return Boolean(statusName && ORDER_PROJECT_STATUS_EMAIL_RULES[statusName]?.length);
}

function getOrderProjectStatusEmailRoles(statusName) {
    return ORDER_PROJECT_STATUS_EMAIL_RULES[statusName] || [];
}

async function fetchEmailsForProjectStatusRoles(roles, context = {}) {
    if (NOTIFICATION_TEST_MODE && NOTIFICATION_TEST_EMAIL) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const { orderId, designerId } = context;
    const uniqueRoles = [...new Set((roles || []).filter(Boolean))];
    const emailLists = await Promise.all(uniqueRoles.map(role => {
        switch (role) {
            case PROJECT_STATUS_RECIPIENT_ROLE.CONFERENTE:
                return fetchActiveConferenteRecipientEmails();
            case PROJECT_STATUS_RECIPIENT_ROLE.CONSULTOR:
                return fetchConsultorEmailForOrder(orderId).then(email => email ? [email] : []);
            case PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_COMERCIAL:
                return fetchActiveGestorComercialRecipientEmails();
            case PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_PROJETOS:
                return fetchActiveGestorProjetosRecipientEmails();
            case PROJECT_STATUS_RECIPIENT_ROLE.GESTOR_FABRICA:
                return fetchActiveGestorFabricaRecipientEmails();
            case PROJECT_STATUS_RECIPIENT_ROLE.PROJETISTA:
                return fetchDesignerEmailById(designerId).then(email => email ? [email] : []);
            case PROJECT_STATUS_RECIPIENT_ROLE.PPCP:
                return fetchActivePpcpProjetistasRecipientEmails();
            case PROJECT_STATUS_RECIPIENT_ROLE.REVISOR:
                return fetchActiveReviewerRecipientEmails();
            default:
                return [];
        }
    }));

    const flat = emailLists.flat();
    const unique = typeof uniqueEmails === 'function' ? uniqueEmails(flat) : [...new Set(flat.filter(Boolean))];
    if (!unique.length && NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }
    return unique;
}

function buildProjectStatusEmailSubject(statusName, orderCode, clientName) {
    let subject = `${statusName}: Pedido ${orderCode || '—'}`;
    if (clientName && clientName !== '-' && clientName !== '—') {
        subject += `, ${clientName}`;
    }
    return subject;
}

async function resolveOrderProjectStatusNotificationContext(orderProjectIds, options = {}) {
    const ids = [...new Set((orderProjectIds || []).map(id => Number(id)).filter(Boolean))];
    let orderId = options.orderId != null ? Number(options.orderId) : null;
    let designerId = options.designerId !== undefined ? options.designerId : undefined;

    if ((!orderId || designerId === undefined) && ids.length) {
        const { data: projects, error } = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, designerId')
            .in('id', ids);

        if (error) throw error;

        if (!orderId && projects?.length) {
            orderId = projects[0].orderId;
        }
        if (designerId === undefined) {
            const designers = [...new Set((projects || []).map(project => project.designerId).filter(Boolean))];
            designerId = designers.length === 1 ? designers[0] : null;
        }
    }

    return { orderId, designerId, orderProjectIds: ids };
}

async function notifyOrderProjectStatusChangeForProjects(orderProjectIds, statusName, options = {}) {
    if (options.skipEmail || !hasOrderProjectStatusEmailRule(statusName)) return;
    if (typeof notifyOrderProjectStatusChangeEmail !== 'function') return;

    try {
        const context = await resolveOrderProjectStatusNotificationContext(orderProjectIds, options);
        if (!context.orderId || !context.orderProjectIds.length) return;

        await notifyOrderProjectStatusChangeEmail({
            statusName,
            orderId: context.orderId,
            orderProjectIds: context.orderProjectIds,
            designerId: context.designerId,
            ...options
        });
    } catch (err) {
        console.warn('notifyOrderProjectStatusChangeForProjects:', err);
    }
}

window.ORDER_PROJECT_STATUS_EMAIL_RULES = ORDER_PROJECT_STATUS_EMAIL_RULES;
window.PROJECT_STATUS_RECIPIENT_ROLE = PROJECT_STATUS_RECIPIENT_ROLE;
window.hasOrderProjectStatusEmailRule = hasOrderProjectStatusEmailRule;
window.getOrderProjectStatusEmailRoles = getOrderProjectStatusEmailRoles;
window.fetchEmailsForProjectStatusRoles = fetchEmailsForProjectStatusRoles;
window.buildProjectStatusEmailSubject = buildProjectStatusEmailSubject;
window.notifyOrderProjectStatusChangeForProjects = notifyOrderProjectStatusChangeForProjects;
