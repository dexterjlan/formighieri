async function fetchOrderRequestNotificationContext(orderId, orderProjectId, designerId) {
    let order = typeof ordersCache !== 'undefined'
        ? ordersCache.find(o => o.id === orderId)
        : null;

    if (!order && orderId) {
        const { data } = await supabaseClient
            .from('salesOrders')
            .select(`orderCode, clientId, consultantUserId, ${SALES_ORDER_RELATIONS_SELECT}`)
            .eq('id', orderId)
            .maybeSingle();
        order = data;
    }

    let projectName = null;
    if (orderProjectId) {
        const cachedProject = typeof orderProjectsCache !== 'undefined'
            ? orderProjectsCache.find(p => p.id === orderProjectId)
            : null;

        if (cachedProject?.name) {
            projectName = cachedProject.name;
        } else {
            const { data: project } = await supabaseClient
                .from('OrderProject')
                .select('name')
                .eq('id', orderProjectId)
                .maybeSingle();
            projectName = project?.name || null;
        }
    }

    let projetistaName = '-';
    if (designerId) {
        const { data: user } = await supabaseClient
            .from('appUsers')
            .select('name')
            .eq('id', designerId)
            .maybeSingle();
        projetistaName = user?.name || '-';
    }

    return {
        orderCode: order?.orderCode || '-',
        clientName: getOrderClientName(order) || '-',
        consultantName: getOrderConsultantNameFromRecord(order) || '-',
        projectName,
        projetistaName
    };
}
async function fetchProjectApprovalNetworkPath(orderProjectId) {
    if (!orderProjectId) return '';

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('approvalNetworkPath')
        .eq('id', orderProjectId)
        .maybeSingle();

    if (error?.message?.includes('approvalNetworkPath')) return '';
    if (error) throw error;
    return data?.approvalNetworkPath || '';
}

async function resolveApprovalNotificationToEmail(eventType, approval) {
    if (NOTIFICATION_TEST_MODE) {
        return NOTIFICATION_TEST_EMAIL;
    }

    if (eventType === 'revision_created' || eventType === 'revision_updated') {
        const designerEmail = await fetchDesignerEmailById(approval?.designerId);
        return designerEmail || NOTIFICATION_TEST_EMAIL;
    }

    if (eventType === 'revision_started' || eventType === 'sent_back_to_approval') {
        return fetchConsultorEmailForOrder(approval?.orderId);
    }

    return NOTIFICATION_TEST_EMAIL;
}

async function fetchApprovalNotificationContext(approval) {
    const context = await fetchOrderRequestNotificationContext(
        approval.orderId,
        approval.orderProjectId,
        approval.designerId
    );

    return {
        ...context,
        projectName: getCommercialApprovalProjectName(approval) || context.projectName
    };
}
async function fetchActiveComprasRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('email')
        .eq('role', 'Compras')
        .eq('isActive', true);

    if (error) throw error;

    const emails = (data || [])
        .map(user => user.email?.trim())
        .filter(Boolean);

    return emails.length ? emails : [NOTIFICATION_TEST_EMAIL];
}
async function fetchCompraLiberacaoNotificationContext(orderProjectId) {
    let projectMeta = await supabaseClient
        .from('OrderProject')
        .select('orderId, designerId')
        .eq('id', orderProjectId)
        .maybeSingle();

    if (projectMeta.error) throw projectMeta.error;

    return fetchOrderRequestNotificationContext(
        projectMeta.data?.orderId,
        orderProjectId,
        projectMeta.data?.designerId
    );
}
function formatNotificationDate(dateStr) {
    if (!dateStr) return '—';
    const [year, month, day] = String(dateStr).split('T')[0].split('-');
    if (!year || !month || !day) return dateStr;
    return `${day}/${month}/${year}`;
}

function uniqueEmails(emails) {
    return [...new Set((emails || []).map(email => email?.trim()).filter(Boolean))];
}

async function fetchActiveProjetistasRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('email')
        .eq('role', 'Projetista')
        .eq('isActive', true);

    if (error) throw error;

    const emails = (data || []).map(user => user.email);
    const unique = uniqueEmails(emails);
    return unique.length ? unique : [NOTIFICATION_TEST_EMAIL];
}

async function fetchConferenciaAprovadaRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const [projetistas, gestores] = await Promise.all([
        fetchActiveProjetistasRecipientEmails(),
        fetchActiveGestoresRecipientEmails()
    ]);

    return uniqueEmails([...projetistas, ...gestores]);
}

async function fetchActiveGestorComercialRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('email, role, isCommercialManager')
        .eq('isActive', true);

    if (error) throw error;

    const emails = (data || [])
        .filter(user => (user.role === 'Admin' || user.role === 'Consultor') && user.isCommercialManager)
        .map(user => user.email);

    const unique = uniqueEmails(emails);
    return unique.length ? unique : [NOTIFICATION_TEST_EMAIL];
}

async function fetchActiveGestoresRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('email, role, isCommercialManager, isProjectsManager, isFactoryManager')
        .eq('isActive', true);

    if (error) throw error;

    const emails = (data || [])
        .filter(user => (
            ((user.role === 'Admin' || user.role === 'Consultor') && user.isCommercialManager)
            || ((user.role === 'Admin' || user.role === 'Projetista') && user.isProjectsManager)
            || (user.role === 'Marceneiro' && user.isFactoryManager)
        ))
        .map(user => user.email);

    const unique = uniqueEmails(emails);
    return unique.length ? unique : [NOTIFICATION_TEST_EMAIL];
}

async function fetchActivePpcpProjetistasRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    let { data, error } = await supabaseClient
        .from('appUsers')
        .select('email')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .eq('isPpcp', true);

    if (error?.message?.includes('isPpcp')) {
        return [];
    }

    if (error) throw error;

    const emails = (data || []).map(user => user.email);
    return uniqueEmails(emails);
}

async function fetchActiveDetalhamentoProjetistasRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    let { data, error } = await supabaseClient
        .from('appUsers')
        .select('email')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .eq('isDetailing', true);

    if (error?.message?.includes('isDetailing')) {
        return [];
    }

    if (error) throw error;

    const emails = (data || []).map(user => user.email?.trim()).filter(Boolean);
    return uniqueEmails(emails);
}

async function fetchActiveGestorFabricaRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('email, role, isFactoryManager')
        .eq('isActive', true);

    if (error?.message?.includes('isFactoryManager')) {
        return [];
    }

    if (error) throw error;

    const emails = (data || [])
        .filter(user => user.role === 'Marceneiro' && user.isFactoryManager)
        .map(user => user.email);

    const unique = uniqueEmails(emails);
    return unique.length ? unique : [NOTIFICATION_TEST_EMAIL];
}

async function fetchActiveGestorProjetosUser() {
    let { data, error } = await supabaseClient
        .from('appUsers')
        .select('id, name, email, role, isProjectsManager')
        .eq('isActive', true);

    if (error?.message?.includes('isProjectsManager')) {
        return null;
    }

    if (error) throw error;

    const users = (data || [])
        .filter(user => (user.role === 'Admin' || user.role === 'Projetista') && user.isProjectsManager);

    return users[0] || null;
}

async function fetchActiveGestorProjetosRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    let { data, error } = await supabaseClient
        .from('appUsers')
        .select('email, role, isProjectsManager')
        .eq('isActive', true);

    if (error?.message?.includes('isProjectsManager')) {
        return [];
    }

    if (error) throw error;

    const emails = (data || [])
        .filter(user => (user.role === 'Admin' || user.role === 'Projetista') && user.isProjectsManager)
        .map(user => user.email);

    return uniqueEmails(emails);
}

async function fetchMontagemExternaFinalizadaRecipientEmails(orderId) {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    return fetchActiveGestorComercialRecipientEmails();
}

async function fetchIniciarProjetoTecnicoRecipientEmails(orderId, designerId) {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const [
        designerEmail,
        gestorProjetosEmails,
        consultorEmail,
        gestorComercialEmails
    ] = await Promise.all([
        fetchDesignerEmailById(designerId),
        fetchActiveGestorProjetosRecipientEmails(),
        fetchConsultorEmailForOrder(orderId),
        fetchActiveGestorComercialRecipientEmails()
    ]);

    const recipients = uniqueEmails([
        designerEmail,
        ...gestorProjetosEmails,
        consultorEmail,
        ...gestorComercialEmails
    ].filter(Boolean));

    return recipients.length ? recipients : [NOTIFICATION_TEST_EMAIL];
}

async function fetchNomearRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const [ppcpEmails, gestorProjetosEmails] = await Promise.all([
        fetchActivePpcpProjetistasRecipientEmails(),
        fetchActiveGestorProjetosRecipientEmails()
    ]);

    const recipients = uniqueEmails([...ppcpEmails, ...gestorProjetosEmails]);
    return recipients.length ? recipients : [NOTIFICATION_TEST_EMAIL];
}

async function fetchDesignerEmailById(designerId) {
    if (NOTIFICATION_TEST_MODE) {
        return NOTIFICATION_TEST_EMAIL;
    }

    if (!designerId) return null;

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('email')
        .eq('id', designerId)
        .eq('isActive', true)
        .maybeSingle();

    if (error) throw error;
    return data?.email?.trim() || null;
}

async function fetchImplantacaoEnviarProducaoRecipientEmails(orderId, designerId) {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const [
        gestores,
        consultorEmail,
        designerEmail,
        ppcpEmails,
        comprasEmails
    ] = await Promise.all([
        fetchActiveGestoresRecipientEmails(),
        fetchConsultorEmailForOrder(orderId),
        fetchDesignerEmailById(designerId),
        fetchActivePpcpProjetistasRecipientEmails(),
        fetchActiveComprasRecipientEmails()
    ]);

    const recipients = uniqueEmails([
        ...gestores,
        consultorEmail,
        designerEmail,
        ...ppcpEmails,
        ...comprasEmails
    ].filter(Boolean));

    return recipients.length ? recipients : [NOTIFICATION_TEST_EMAIL];
}

async function fetchActiveConferenteRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('email')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .eq('isConferenceReviewer', true);

    if (error) throw error;

    const emails = (data || []).map(user => user.email);
    const unique = uniqueEmails(emails);
    return unique.length ? unique : [NOTIFICATION_TEST_EMAIL];
}

async function fetchActiveReviewerRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    let { data, error } = await supabaseClient
        .from('appUsers')
        .select('email, isReviewer, isProjectLeader')
        .eq('role', 'Projetista')
        .eq('isActive', true)
        .eq('isReviewer', true);

    if (error?.message?.includes('isReviewer') || error?.message?.includes('isProjectLeader')) {
        ({ data, error } = await supabaseClient
            .from('appUsers')
            .select('email, isProjectLeader')
            .eq('role', 'Projetista')
            .eq('isActive', true)
            .eq('isProjectLeader', true));
    }

    if (error) throw error;

    const emails = (data || [])
        .filter(user => user.isReviewer || user.isProjectLeader)
        .map(user => user.email);

    const unique = uniqueEmails(emails);
    if (!unique.length && NOTIFICATION_TEST_MODE && NOTIFICATION_TEST_EMAIL) {
        return [NOTIFICATION_TEST_EMAIL];
    }
    return unique;
}

async function fetchLiberacaoMedicaoRecipientEmails(orderId) {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const [conferentes, consultorEmail, gestores] = await Promise.all([
        fetchActiveConferenteRecipientEmails(),
        fetchConsultorEmailForOrder(orderId),
        fetchActiveGestoresRecipientEmails()
    ]);

    return uniqueEmails([
        ...conferentes,
        consultorEmail,
        ...gestores
    ]);
}

async function fetchThirdPartyProjectStatusRecipientEmails(orderId, designerId) {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    const [consultorEmail, designerEmail] = await Promise.all([
        fetchConsultorEmailForOrder(orderId),
        fetchDesignerEmailById(designerId)
    ]);

    const recipients = uniqueEmails([consultorEmail, designerEmail].filter(Boolean));
    return recipients.length ? recipients : [NOTIFICATION_TEST_EMAIL];
}

async function fetchConsultorEmailForOrder(orderId) {
    if (NOTIFICATION_TEST_MODE) {
        return NOTIFICATION_TEST_EMAIL;
    }

    let consultantUserId = typeof ordersCache !== 'undefined'
        ? ordersCache.find(order => Number(order.id) === Number(orderId))?.consultantUserId
        : null;

    if (!consultantUserId && orderId) {
        const { data } = await supabaseClient
            .from('salesOrders')
            .select('consultantUserId')
            .eq('id', orderId)
            .maybeSingle();
        consultantUserId = data?.consultantUserId || null;
    }

    const normalizedUserId = Number(consultantUserId);
    if (!normalizedUserId) {
        const cachedOrder = typeof ordersCache !== 'undefined'
            ? ordersCache.find(order => Number(order.id) === Number(orderId))
            : null;
        const consultantName = getOrderConsultantNameFromRecord(cachedOrder);
        if (!consultantName) {
            return NOTIFICATION_TEST_EMAIL;
        }

        const { data, error } = await supabaseClient
            .from('appUsers')
            .select('email')
            .eq('role', 'Consultor')
            .eq('isActive', true)
            .eq('name', consultantName)
            .maybeSingle();

        if (error) throw error;
        return data?.email?.trim() || NOTIFICATION_TEST_EMAIL;
    }

    const { data, error } = await supabaseClient
        .from('appUsers')
        .select('email')
        .eq('id', normalizedUserId)
        .eq('isActive', true)
        .maybeSingle();

    if (error) throw error;
    return data?.email?.trim() || NOTIFICATION_TEST_EMAIL;
}

async function resolveOrderProjectNames(orderProjectIds) {
    const uniqueIds = [...new Set((orderProjectIds || []).map(id => Number(id)).filter(Boolean))];
    const names = {};

    if (typeof orderProjectsCache !== 'undefined') {
        uniqueIds.forEach(id => {
            const project = orderProjectsCache.find(item => Number(item.id) === id);
            if (project?.name) names[id] = project.name;
        });
    }

    const missingIds = uniqueIds.filter(id => !names[id]);
    if (missingIds.length) {
        const { data, error } = await supabaseClient
            .from('OrderProject')
            .select('id, name')
            .in('id', missingIds);

        if (error) throw error;
        (data || []).forEach(project => {
            names[project.id] = project.name;
        });
    }

    return names;
}
