function hasOrderProject(projectName) {
    return Boolean(projectName && projectName !== 'Sem projeto');
}

function buildOrderRequestEmailSubject(eventType, orderCode, projectName) {
    const eventLabel = eventType === 'created' ? 'Criada' : 'Respondida';
    let subject = `Requisicao ${eventLabel} Pedido ${orderCode}`;
    if (hasOrderProject(projectName)) {
        subject += `, ${projectName}`;
    }
    return subject;
}

function buildOrderRequestEmailBody(payload) {
    const requestTitle = payload.requestProfile === 'Consultor'
        ? 'Solicitação do Consultor'
        : 'Solicitação do Projetista';

    const lines = [
        `Requisição ${payload.eventLabel}`,
        '',
        `Pedido: ${payload.orderCode}`,
    ];

    if (hasOrderProject(payload.projectName)) {
        lines.push(`Projeto: ${payload.projectName}`);
    }

    lines.push(
        `Cliente: ${payload.clientName}`,
        `Consultor: ${payload.consultantName}`,
        `Projetista: ${payload.projetistaName}`,
        `Status: ${payload.status}`,
        `Ação por: ${payload.actedByName} (${payload.actedByRole})`,
        '',
        requestTitle,
        payload.requestText || '-'
    );

    if (payload.commercialResponse) {
        lines.push('', 'Resposta do Consultor', payload.commercialResponse);
    }

    if (payload.designerResponse) {
        lines.push('', 'Resposta do Projetista', payload.designerResponse);
    }

    return lines.join('\n');
}

function buildOrderRequestEmailHtml(payload) {
    const requestTitle = payload.requestProfile === 'Consultor'
        ? 'Solicitação do Consultor'
        : 'Solicitação do Projetista';

    const projectRow = hasOrderProject(payload.projectName)
        ? `<tr>
            <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Projeto</td>
            <td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.projectName)}</td>
           </tr>`
        : '';

    const commercialBlock = payload.commercialResponse
        ? `<div style="margin-top:16px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.04em;">Resposta do Consultor</p>
            <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px;font-size:14px;color:#0f172a;white-space:pre-wrap;">${escapeHtml(payload.commercialResponse)}</div>
           </div>`
        : '';

    const designerBlock = payload.designerResponse
        ? `<div style="margin-top:16px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.04em;">Resposta do Projetista</p>
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;font-size:14px;color:#0f172a;white-space:pre-wrap;">${escapeHtml(payload.designerResponse)}</div>
           </div>`
        : '';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.06);">
    <div style="background:#0f172a;color:#f59e0b;padding:18px 24px;">
      <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Formighieri</p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;">Requisição ${escapeHtml(payload.eventLabel)}</h1>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        <tr>
          <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;width:120px;">Pedido</td>
          <td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.orderCode)}</td>
        </tr>
        ${projectRow}
        <tr>
          <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Cliente</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.clientName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Consultor</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.consultantName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Projetista</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.projetistaName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Status</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.status)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#64748b;">Ação por</td>
          <td style="padding:8px 12px;">${escapeHtml(payload.actedByName)} <span style="color:#64748b;">(${escapeHtml(payload.actedByRole)})</span></td>
        </tr>
      </table>
      <div>
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(requestTitle)}</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:14px;color:#0f172a;white-space:pre-wrap;">${escapeHtml(payload.requestText || '-')}</div>
      </div>
      ${commercialBlock}
      ${designerBlock}
    </div>
  </div>
</body>
</html>`;
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
                message_body: payload.message_body,
                message_html: payload.message_html
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
        const html = buildOrderRequestEmailHtml(payload);
        const toEmail = NOTIFICATION_TEST_MODE ? NOTIFICATION_TEST_EMAIL : NOTIFICATION_TEST_EMAIL;

        await sendEmailViaGoogleAppsScript({
            to_email: toEmail,
            from_name: NOTIFICATION_FROM_NAME,
            reply_to: NOTIFICATION_FROM_EMAIL,
            subject,
            message_body: body,
            message_html: html
        });
    } catch (err) {
        console.warn('notifyOrderRequestEmail:', err);
    }
}
