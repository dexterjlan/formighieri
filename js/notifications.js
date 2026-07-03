function buildOrderRequestEmailSubject(eventType, orderCode, projectName) {
    const eventLabel = eventType === 'created' ? 'Criada' : 'Respondida';
    return `Requisicao (${eventLabel}) ${orderCode}, ${projectName}`;
}

function buildOrderRequestEmailBody(payload) {
    const requestTitle = payload.requestProfile === 'Consultor'
        ? 'Solicitação do Consultor'
        : 'Solicitação do Projetista';

    const lines = [
        `Requisição ${payload.eventLabel}`,
        '',
        `Pedido: ${payload.orderCode}`,
        `Projeto: ${payload.projectName}`,
        `Cliente: ${payload.clientName}`,
        `Consultor: ${payload.consultantName}`,
        `Projetista: ${payload.projetistaName}`,
        `Status: ${payload.status}`,
        `Ação por: ${payload.actedByName} (${payload.actedByRole})`,
        '',
        requestTitle,
        payload.requestText || '-'
    ];

    if (payload.commercialResponse) {
        lines.push('', 'Resposta do Consultor', payload.commercialResponse);
    }

    if (payload.designerResponse) {
        lines.push('', 'Resposta do Projetista', payload.designerResponse);
    }

    return lines.join('\n');
}

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

    let projectName = 'Sem projeto';
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
            projectName = project?.name || 'Sem projeto';
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

function isGoogleAppsScriptConfigured() {
    return Boolean(GOOGLE_APPS_SCRIPT_URL && NOTIFICATION_SCRIPT_SECRET);
}

async function sendEmailViaGoogleAppsScript(payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
        await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                secret: NOTIFICATION_SCRIPT_SECRET,
                to_email: payload.to_email,
                from_name: payload.from_name,
                reply_to: payload.reply_to,
                subject: payload.subject,
                message_body: payload.message_body
            }),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function notifyOrderRequestEmail(eventType, requestData) {
    if (!NOTIFICATIONS_ENABLED || !requestData) return;

    if (!isGoogleAppsScriptConfigured()) {
        console.info('notifyOrderRequestEmail: Google Apps Script não configurado em js/config.js');
        return;
    }

    try {
        const context = await fetchOrderRequestNotificationContext(
            requestData.orderId,
            requestData.orderProjectId,
            requestData.designerId
        );

        const eventLabel = eventType === 'created' ? 'Criada' : 'Respondida';
        const payload = {
            eventType,
            eventLabel,
            orderCode: context.orderCode,
            projectName: context.projectName,
            clientName: context.clientName,
            consultantName: context.consultantName,
            projetistaName: context.projetistaName,
            requestProfile: requestData.requestProfile || 'Projetista',
            requestText: requestData.designerRequest || '',
            commercialResponse: requestData.commercialResponse || '',
            designerResponse: requestData.designerResponse || '',
            status: normalizeRequestStatus(requestData),
            actedByName: currentUser?.name || '-',
            actedByRole: currentUser?.role || '-'
        };

        const subject = buildOrderRequestEmailSubject(eventType, payload.orderCode, payload.projectName);
        const body = buildOrderRequestEmailBody(payload);
        const toEmail = NOTIFICATION_TEST_MODE ? NOTIFICATION_TEST_EMAIL : NOTIFICATION_TEST_EMAIL;

        await sendEmailViaGoogleAppsScript({
            to_email: toEmail,
            from_name: NOTIFICATION_FROM_NAME,
            reply_to: NOTIFICATION_FROM_EMAIL,
            subject,
            message_body: body
        });
    } catch (err) {
        console.warn('notifyOrderRequestEmail:', err);
    }
}
