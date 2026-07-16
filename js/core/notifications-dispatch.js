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
                message_html: payload.message_html,
                cc_email: payload.cc_email || ''
            }),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
}
async function notifyApprovalEmail(eventType, approval, options = {}) {
    if (!NOTIFICATIONS_ENABLED || !approval) return;

    if (!isGoogleAppsScriptConfigured()) {
        console.info('notifyApprovalEmail: Google Apps Script não configurado em js/core/config.js');
        return;
    }

    try {
        const context = await fetchApprovalNotificationContext(approval);
        const eventTitle = APPROVAL_EMAIL_TITLE[eventType] || 'Aprovação Atualizada';
        let caminhoRedeAprovacao = '';

        if (eventType === 'approval_requested' && approval.orderProjectId) {
            caminhoRedeAprovacao = await fetchProjectCaminhoRedeAprovacao(approval.orderProjectId);
        }

        const payload = {
            eventType,
            eventTitle,
            orderCode: context.orderCode,
            projectName: context.projectName,
            clientName: context.clientName,
            consultantName: context.consultantName,
            projetistaName: context.projetistaName,
            status: getApprovalStatusLabel(approval.status),
            actedByName: currentUser?.name || '-',
            actedByRole: currentUser?.role || '-',
            activities: options.activities || null,
            caminhoRedeAprovacao
        };

        const subject = buildApprovalEmailSubject(
            eventType,
            payload.orderCode,
            payload.clientName
        );
        const body = buildApprovalEmailBody(payload);
        const html = buildApprovalEmailHtml(payload);
        const toEmail = NOTIFICATION_TEST_MODE ? NOTIFICATION_TEST_EMAIL : NOTIFICATION_TEST_EMAIL;

        await sendEmailViaGoogleAppsScript({
            to_email: toEmail,
            from_name: NOTIFICATION_FROM_NAME,
            reply_to: NOTIFICATION_FROM_EMAIL,
            subject,
            message_body: body,
            message_html: html,
            cc_email: getApprovalCcEmailsPayload()
        });
    } catch (err) {
        console.warn('notifyApprovalEmail:', err);
    }
}

async function notifyOrderRequestEmail(eventType, requestData) {
    if (!NOTIFICATIONS_ENABLED || !requestData) return;

    if (!isGoogleAppsScriptConfigured()) {
        console.info('notifyOrderRequestEmail: Google Apps Script não configurado em js/core/config.js');
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
            actedByRole: currentUser?.role || '-',
            activities: requestData.activities || null
        };

        const subject = buildOrderRequestEmailSubject(
            eventType,
            payload.orderCode,
            payload.clientName
        );
        const body = buildOrderRequestEmailBody(payload);
        const html = buildOrderRequestEmailHtml(payload);
        const toEmail = NOTIFICATION_TEST_MODE ? NOTIFICATION_TEST_EMAIL : NOTIFICATION_TEST_EMAIL;

        await sendEmailViaGoogleAppsScript({
            to_email: toEmail,
            from_name: NOTIFICATION_FROM_NAME,
            reply_to: NOTIFICATION_FROM_EMAIL,
            subject,
            message_body: body,
            message_html: html,
            cc_email: getRequestCcEmailsPayload()
        });
    } catch (err) {
        console.warn('notifyOrderRequestEmail:', err);
    }
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

function buildCompraLiberacaoEmailSubject(tipoCompra, clientName, orderCode) {
    const tipoLabel = typeof formatCompraTipoLabel === 'function'
        ? formatCompraTipoLabel(tipoCompra)
        : (tipoCompra || '—');
    const client = clientName || '—';
    const order = orderCode || '—';
    return `Liberação de compra de ${tipoLabel} - ${client} (${order})`;
}

function buildCompraLiberacaoEmailBody(payload) {
    const lines = [
        payload.eventTitle,
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
        `Tipo: ${payload.tipoCompra}`,
        `Ação por: ${payload.actedByName} (${payload.actedByRole})`
    );

    if (payload.filePath) {
        lines.push(`Caminho do arquivo na rede: ${payload.filePath}`);
    }

    return appendEmailNoReplyFooterText(lines.join('\n'));
}

function buildCompraLiberacaoEmailHtml(payload) {
    const projectRow = hasOrderProject(payload.projectName)
        ? `<tr>
            <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Projeto</td>
            <td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.projectName)}</td>
           </tr>`
        : '';

    const caminhoArquivoBlock = payload.filePath
        ? `<div style="margin-top:16px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Caminho do arquivo na rede</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-family:Consolas,Monaco,monospace;font-size:13px;color:#0f172a;word-break:break-all;">${escapeHtml(payload.filePath)}</div>
           </div>`
        : '';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.06);">
    ${buildEmailBrandHeaderHtml(payload.eventTitle, '#f59e0b')}
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
          <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Tipo</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.tipoCompra)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#64748b;">Ação por</td>
          <td style="padding:8px 12px;">${escapeHtml(payload.actedByName)} <span style="color:#64748b;">(${escapeHtml(payload.actedByRole)})</span></td>
        </tr>
      </table>
      ${caminhoArquivoBlock}
      ${buildEmailNoReplyFooterHtml()}
    </div>
  </div>
</body>
</html>`;
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

async function notifyCompraLiberacaoEmails(options = {}) {
    const { items = [], formValues = {}, orderProjectId } = options;
    if (!NOTIFICATIONS_ENABLED || !items.length || !orderProjectId) return;

    if (!isGoogleAppsScriptConfigured()) {
        console.info('notifyCompraLiberacaoEmails: Google Apps Script não configurado em js/core/config.js');
        return;
    }

    try {
        const [context, recipients] = await Promise.all([
            fetchCompraLiberacaoNotificationContext(orderProjectId),
            fetchActiveComprasRecipientEmails()
        ]);
        const toEmail = recipients.join(', ');

        for (const item of items) {
            const tipoLabel = typeof formatCompraTipoLabel === 'function'
                ? formatCompraTipoLabel(item.tipoCompra)
                : (item.tipoCompra || '—');
            const filePath = formValues?.[item.pathKey] || '';
            const payload = {
                eventTitle: 'Liberação de Compra',
                orderCode: context.orderCode || '—',
                projectName: context.projectName || activeImplantacaoProjectName || '—',
                clientName: context.clientName || '—',
                consultantName: context.consultantName || '—',
                projetistaName: context.projetistaName || '—',
                tipoCompra: tipoLabel,
                actedByName: currentUser?.name || '—',
                actedByRole: currentUser?.role || '—',
                filePath
            };

            const subject = buildCompraLiberacaoEmailSubject(
                item.tipoCompra,
                payload.clientName,
                payload.orderCode
            );
            const body = buildCompraLiberacaoEmailBody(payload);
            const html = buildCompraLiberacaoEmailHtml(payload);

            await sendEmailViaGoogleAppsScript({
                to_email: toEmail,
                from_name: NOTIFICATION_FROM_NAME,
                reply_to: NOTIFICATION_FROM_EMAIL,
                subject,
                message_body: body,
                message_html: html
            });
        }
    } catch (err) {
        console.warn('notifyCompraLiberacaoEmails:', err);
    }
}
async function buildProcessNotificationPayload(eventType, options = {}) {
    const context = await fetchOrderRequestNotificationContext(
        options.orderId,
        options.orderProjectIds?.[0] || null,
        options.designerId || null
    );

    const projectNamesMap = await resolveOrderProjectNames(options.orderProjectIds || []);
    const projectRows = (options.orderProjectIds || []).map(orderProjectId => {
        const name = projectNamesMap[orderProjectId] || `Projeto ${orderProjectId}`;
        const details = typeof options.buildProjectDetails === 'function'
            ? options.buildProjectDetails(orderProjectId, name)
            : [];
        return { name, details: details.filter(Boolean) };
    });

    return {
        eventType,
        eventTitle: PROCESS_EMAIL_TITLE[eventType] || 'Atualização de Processo',
        orderCode: context.orderCode,
        clientName: context.clientName,
        consultantName: context.consultantName,
        projetistaName: options.includeProjetista ? context.projetistaName : null,
        projectRows,
        projectSectionTitle: options.projectSectionTitle || 'Projetos',
        showProjectDetails: options.showProjectDetails !== false,
        extraFields: options.extraFields || [],
        accentColor: options.accentColor || '#0d9488',
        actedByName: currentUser?.name || '—',
        actedByRole: currentUser?.role || '—'
    };
}

async function sendProcessNotificationEmail(eventType, options = {}) {
    if (!NOTIFICATIONS_ENABLED) return;

    if (!isGoogleAppsScriptConfigured()) {
        console.info('sendProcessNotificationEmail: Google Apps Script não configurado em js/core/config.js');
        return;
    }

    const payload = await buildProcessNotificationPayload(eventType, options);
    const subject = buildProcessEmailSubject(eventType, payload.orderCode, payload.clientName);
    const body = buildProcessEmailBody(payload);
    const html = buildProcessEmailHtml(payload);

    let toEmail = NOTIFICATION_TEST_EMAIL;
    let ccEmail = '';

    if (options.recipientMode === 'gestores') {
        const gestores = await fetchActiveGestoresRecipientEmails();
        toEmail = gestores.join(', ');
    } else if (options.recipientMode === 'consultor_and_gestores') {
        if (NOTIFICATION_TEST_MODE) {
            toEmail = NOTIFICATION_TEST_EMAIL;
        } else {
            const [consultorEmail, gestores] = await Promise.all([
                fetchConsultorEmailForOrder(options.orderId),
                fetchActiveGestoresRecipientEmails()
            ]);
            toEmail = consultorEmail;
            ccEmail = uniqueEmails(gestores.filter(email => email !== consultorEmail)).join(', ');
        }
    } else if (options.recipientMode === 'consultor') {
        if (NOTIFICATION_TEST_MODE) {
            toEmail = NOTIFICATION_TEST_EMAIL;
        } else {
            toEmail = await fetchConsultorEmailForOrder(options.orderId);
        }
    } else if (options.recipientEmails?.length) {
        toEmail = uniqueEmails(options.recipientEmails).join(', ');
    }

    await sendEmailViaGoogleAppsScript({
        to_email: toEmail,
        from_name: NOTIFICATION_FROM_NAME,
        reply_to: NOTIFICATION_FROM_EMAIL,
        subject,
        message_body: body,
        message_html: html,
        cc_email: ccEmail
    });
}

async function notifyMedicaoRealizadaEmail(options = {}) {
    const { orderId, projects = [] } = options;
    if (!orderId || !projects.length) return;

    try {
        const measurementDates = Object.fromEntries(
            projects.map(project => [Number(project.orderProjectId), project.measurementDate])
        );

        await sendProcessNotificationEmail('medicao_realizada', {
            orderId,
            orderProjectIds: projects.map(project => project.orderProjectId),
            recipientMode: 'gestores',
            projectSectionTitle: 'Projetos medidos',
            accentColor: '#14b8a6',
            buildProjectDetails: (orderProjectId) => {
                const date = measurementDates[Number(orderProjectId)];
                return date ? [`Data da medição: ${formatNotificationDate(date)}`] : [];
            }
        });
    } catch (err) {
        console.warn('notifyMedicaoRealizadaEmail:', err);
    }
}

async function notifyPlantaLevantadaEmail(options = {}) {
    const { orderId, projects = [] } = options;
    if (!orderId || !projects.length) return;

    try {
        const plantaDates = Object.fromEntries(
            projects.map(project => [Number(project.orderProjectId), project.plantaLevantadaDate])
        );

        await sendProcessNotificationEmail('planta_levantada', {
            orderId,
            orderProjectIds: projects.map(project => project.orderProjectId),
            recipientMode: 'gestores',
            projectSectionTitle: 'Projetos com planta levantada',
            accentColor: '#0891b2',
            buildProjectDetails: (orderProjectId) => {
                const date = plantaDates[Number(orderProjectId)];
                return date ? [`Data da planta: ${formatNotificationDate(date)}`] : [];
            }
        });
    } catch (err) {
        console.warn('notifyPlantaLevantadaEmail:', err);
    }
}

async function notifyConferenciaEnviadaEmail(options = {}) {
    const {
        orderId,
        orderProjectIds = [],
        designerId = null,
        sketchUpPath = null,
        conferenceObservation = null
    } = options;

    if (!orderId || !orderProjectIds.length) return;

    try {
        const extraFields = [];
        if (sketchUpPath) {
            extraFields.push({ label: 'Caminho SketchUp', value: sketchUpPath });
        }
        if (conferenceObservation) {
            extraFields.push({ label: 'Observação da conferência', value: conferenceObservation });
        }

        await sendProcessNotificationEmail('conferencia_enviada', {
            orderId,
            orderProjectIds,
            designerId,
            includeProjetista: true,
            recipientMode: 'consultor_and_gestores',
            projectSectionTitle: 'Projetos da conferência',
            showProjectDetails: false,
            accentColor: '#8b5cf6',
            extraFields
        });
    } catch (err) {
        console.warn('notifyConferenciaEnviadaEmail:', err);
    }
}

window.notifyMedicaoRealizadaEmail = notifyMedicaoRealizadaEmail;
window.notifyPlantaLevantadaEmail = notifyPlantaLevantadaEmail;
window.notifyConferenciaEnviadaEmail = notifyConferenciaEnviadaEmail;

async function notifyConferenciaConfirmadaEmail(options = {}) {
    const { orderId, orderProjectIds = [] } = options;
    if (!orderId || !orderProjectIds.length) return;

    try {
        const recipientEmails = await fetchActiveGestorComercialRecipientEmails();

        await sendProcessNotificationEmail('conferencia_confirmada', {
            orderId,
            orderProjectIds,
            recipientEmails,
            showProjectDetails: false,
            projectSectionTitle: 'Projetos da conferência confirmada',
            accentColor: '#0ea5e9'
        });
    } catch (err) {
        console.warn('notifyConferenciaConfirmadaEmail:', err);
    }
}

window.notifyConferenciaConfirmadaEmail = notifyConferenciaConfirmadaEmail;

async function notifyConferenciaAprovadaEmail(options = {}) {
    const { orderId, orderProjectIds = [] } = options;
    if (!orderId || !orderProjectIds.length) return;

    try {
        const recipientEmails = await fetchConferenciaAprovadaRecipientEmails();

        await sendProcessNotificationEmail('conferencia_aprovada', {
            orderId,
            orderProjectIds,
            recipientEmails,
            showProjectDetails: false,
            projectSectionTitle: 'Projetos da conferência aprovada',
            accentColor: '#6366f1'
        });
    } catch (err) {
        console.warn('notifyConferenciaAprovadaEmail:', err);
    }
}

window.notifyConferenciaAprovadaEmail = notifyConferenciaAprovadaEmail;

async function notifyConferenciaDevolvidaConsultorEmail(options = {}) {
    const { orderId, orderProjectIds = [], observation = null } = options;
    if (!orderId || !orderProjectIds.length) return;

    try {
        const extraFields = [];
        if (observation) {
            extraFields.push({ label: 'Observações do gestor comercial', value: observation });
        }

        await sendProcessNotificationEmail('conferencia_devolvida', {
            orderId,
            orderProjectIds,
            recipientMode: 'consultor',
            showProjectDetails: false,
            projectSectionTitle: 'Projetos da conferência devolvida',
            accentColor: '#d97706',
            extraFields
        });
    } catch (err) {
        console.warn('notifyConferenciaDevolvidaConsultorEmail:', err);
    }
}

window.notifyConferenciaDevolvidaConsultorEmail = notifyConferenciaDevolvidaConsultorEmail;

async function notifyProjetoNomeadoEmail(options = {}) {
    const { orderId, orderProjectIds = [], designerId = null } = options;
    if (!orderId || !orderProjectIds.length) return;

    try {
        const recipientEmails = await fetchNomearRecipientEmails();

        await sendProcessNotificationEmail('projeto_nomeado', {
            orderId,
            orderProjectIds,
            designerId,
            includeProjetista: true,
            recipientEmails,
            showProjectDetails: false,
            projectSectionTitle: 'Projeto nomeado',
            accentColor: '#a855f7',
            extraFields: [
                { label: 'Novo status', value: 'Aguardando PPCP' }
            ]
        });
    } catch (err) {
        console.warn('notifyProjetoNomeadoEmail:', err);
    }
}

window.notifyProjetoNomeadoEmail = notifyProjetoNomeadoEmail;

async function notifyProjetoTecnicoIniciadoEmail(options = {}) {
    const {
        orderId,
        orderProjectId,
        designerId = null,
        previsaoConclusaoProjetoTecnico = null
    } = options;

    if (!orderId || !orderProjectId) return;

    try {
        const recipientEmails = await fetchIniciarProjetoTecnicoRecipientEmails(orderId, designerId);
        const extraFields = [
            { label: 'Novo status', value: 'Projeto Técnico' }
        ];

        if (previsaoConclusaoProjetoTecnico) {
            extraFields.push({
                label: 'Previsão de conclusão',
                value: formatNotificationDate(previsaoConclusaoProjetoTecnico)
            });
        }

        await sendProcessNotificationEmail('projeto_tecnico_iniciado', {
            orderId,
            orderProjectIds: [orderProjectId],
            designerId,
            includeProjetista: true,
            recipientEmails,
            showProjectDetails: false,
            projectSectionTitle: 'Projeto técnico iniciado',
            accentColor: '#6366f1',
            extraFields
        });
    } catch (err) {
        console.warn('notifyProjetoTecnicoIniciadoEmail:', err);
    }
}

window.notifyProjetoTecnicoIniciadoEmail = notifyProjetoTecnicoIniciadoEmail;

async function notifyImplantacaoEnviarProducaoEmail(options = {}) {
    const {
        orderId,
        orderProjectId,
        designerId = null,
        wpsOpCode = '',
        projetoPath = ''
    } = options;

    if (!orderId || !orderProjectId) return;

    try {
        const recipientEmails = await fetchImplantacaoEnviarProducaoRecipientEmails(orderId, designerId);
        const extraFields = [
            { label: 'Novo status', value: 'Em Produção' }
        ];

        if (projetoPath) {
            extraFields.push({ label: 'Caminho do projeto', value: projetoPath });
        }
        if (wpsOpCode) {
            extraFields.push({ label: 'Código da OP no WPS', value: wpsOpCode });
        }

        await sendProcessNotificationEmail('implantacao_enviado_producao', {
            orderId,
            orderProjectIds: [orderProjectId],
            designerId,
            includeProjetista: true,
            recipientEmails,
            showProjectDetails: false,
            projectSectionTitle: 'Projeto enviado para produção',
            accentColor: '#7c3aed',
            extraFields
        });
    } catch (err) {
        console.warn('notifyImplantacaoEnviarProducaoEmail:', err);
    }
}

window.notifyImplantacaoEnviarProducaoEmail = notifyImplantacaoEnviarProducaoEmail;

async function notifyLiberacaoMedicaoEmail(options = {}) {
    const { orderId, projects = [] } = options;
    if (!orderId || !projects.length) return;

    try {
        const recipientEmails = await fetchLiberacaoMedicaoRecipientEmails(orderId);

        await sendProcessNotificationEmail('liberacao_medicao', {
            orderId,
            orderProjectIds: projects.map(project => project.id),
            recipientEmails,
            showProjectDetails: false,
            projectSectionTitle: 'Projetos liberados para medição',
            accentColor: '#06b6d4'
        });
    } catch (err) {
        console.warn('notifyLiberacaoMedicaoEmail:', err);
    }
}

window.notifyLiberacaoMedicaoEmail = notifyLiberacaoMedicaoEmail;
