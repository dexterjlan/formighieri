async function fetchOrderRequestNotificationContext(orderId, orderProjectId, designerId) {
    let order = typeof ordersCache !== 'undefined'
        ? ordersCache.find(o => o.id === orderId)
        : null;

    if (!order && orderId) {
        const { data } = await supabaseClient
            .from('salesOrders')
            .select('orderCode, clientName, consultantName')
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
        clientName: order?.clientName || '-',
        consultantName: order?.consultantName || '-',
        projectName,
        projetistaName
    };
}
async function fetchProjectCaminhoRedeAprovacao(orderProjectId) {
    if (!orderProjectId) return '';

    const { data, error } = await supabaseClient
        .from('OrderProject')
        .select('caminhoRedeAprovacao')
        .eq('id', orderProjectId)
        .maybeSingle();

    if (error?.message?.includes('caminhoRedeAprovacao')) return '';
    if (error) throw error;
    return data?.caminhoRedeAprovacao || '';
}

async function fetchApprovalNotificationContext(approval) {
    const context = await fetchOrderRequestNotificationContext(
        approval.orderId,
        approval.orderProjectId,
        approval.designerId
    );

    return {
        ...context,
        projectName: approval.projectName || context.projectName
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
        .select('email, role, gestorComercial')
        .eq('isActive', true);

    if (error) throw error;

    const emails = (data || [])
        .filter(user => (user.role === 'Admin' || user.role === 'Consultor') && user.gestorComercial)
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
        .select('email, role, gestorComercial, gestorProjetos, gestorFabrica')
        .eq('isActive', true);

    if (error) throw error;

    const emails = (data || [])
        .filter(user => (
            ((user.role === 'Admin' || user.role === 'Consultor') && user.gestorComercial)
            || ((user.role === 'Admin' || user.role === 'Projetista') && user.gestorProjetos)
            || (user.role === 'Marceneiro' && user.gestorFabrica)
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
        .eq('ppcp', true);

    if (error?.message?.includes('ppcp')) {
        return [];
    }

    if (error) throw error;

    const emails = (data || []).map(user => user.email);
    return uniqueEmails(emails);
}

async function fetchActiveGestorProjetosRecipientEmails() {
    if (NOTIFICATION_TEST_MODE) {
        return [NOTIFICATION_TEST_EMAIL];
    }

    let { data, error } = await supabaseClient
        .from('appUsers')
        .select('email, role, gestorProjetos')
        .eq('isActive', true);

    if (error?.message?.includes('gestorProjetos')) {
        return [];
    }

    if (error) throw error;

    const emails = (data || [])
        .filter(user => (user.role === 'Admin' || user.role === 'Projetista') && user.gestorProjetos)
        .map(user => user.email);

    return uniqueEmails(emails);
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
        .eq('conferente', true);

    if (error) throw error;

    const emails = (data || []).map(user => user.email);
    const unique = uniqueEmails(emails);
    return unique.length ? unique : [NOTIFICATION_TEST_EMAIL];
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

async function fetchConsultorEmailForOrder(orderId) {
    if (NOTIFICATION_TEST_MODE) {
        return NOTIFICATION_TEST_EMAIL;
    }

    let consultantName = typeof ordersCache !== 'undefined'
        ? ordersCache.find(order => Number(order.id) === Number(orderId))?.consultantName
        : null;

    if (!consultantName && orderId) {
        const { data } = await supabaseClient
            .from('salesOrders')
            .select('consultantName')
            .eq('id', orderId)
            .maybeSingle();
        consultantName = data?.consultantName || null;
    }

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
