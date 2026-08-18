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
        let approvalNetworkPath = '';

        if (eventType === 'approval_requested' && approval.orderProjectId) {
            approvalNetworkPath = await fetchProjectApprovalNetworkPath(approval.orderProjectId);
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
            approvalNetworkPath
        };

        const subject = buildApprovalEmailSubject(
            eventType,
            payload.orderCode,
            payload.clientName
        );
        const body = buildApprovalEmailBody(payload);
        const html = buildApprovalEmailHtml(payload);
        const toEmail = await resolveApprovalNotificationToEmail(eventType, approval);

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
            const subtypeName = item.thirdPartySubtype?.name || item.subtypeName || '';
            const tipoLabel = typeof formatCompraTipoLabel === 'function'
                ? formatCompraTipoLabel(item.purchaseType || item.purchaseType, subtypeName)
                : (item.purchaseType || item.purchaseType || '—');
            const filePath = item.folderPath || item.path || '';
            const payload = {
                eventTitle: 'Liberação de Compra',
                orderCode: context.orderCode || '—',
                projectName: context.projectName || activeImplantacaoProjectName || '—',
                clientName: context.clientName || '—',
                consultantName: context.consultantName || '—',
                projetistaName: context.projetistaName || '—',
                purchaseType: tipoLabel,
                actedByName: currentUser?.name || '—',
                actedByRole: currentUser?.role || '—',
                filePath
            };

            const subject = buildCompraLiberacaoEmailSubject(
                item.purchaseType || item.purchaseType,
                payload.clientName,
                payload.orderCode,
                subtypeName
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

async function notifyOrderProjectStatusChangeEmail(options = {}) {
    const {
        statusName,
        orderId,
        orderProjectIds = [],
        designerId = null,
        extraFields = [],
        buildProjectDetails = null,
        projectSectionTitle = 'Projetos',
        showProjectDetails = true,
        accentColor = '#0d9488',
        includeProjetista = null
    } = options;

    if (!NOTIFICATIONS_ENABLED || !statusName || !orderId || !orderProjectIds.length) return;
    if (!hasOrderProjectStatusEmailRule(statusName)) return;

    if (!isGoogleAppsScriptConfigured()) {
        console.info('notifyOrderProjectStatusChangeEmail: Google Apps Script não configurado em js/core/config.js');
        return;
    }

    try {
        const roles = getOrderProjectStatusEmailRoles(statusName);
        const recipientEmails = await fetchEmailsForProjectStatusRoles(roles, { orderId, designerId });
        if (!recipientEmails.length) return;

        const shouldIncludeProjetista = includeProjetista != null
            ? includeProjetista
            : roles.includes(PROJECT_STATUS_RECIPIENT_ROLE.PROJETISTA);

        const payload = await buildProcessNotificationPayload('project_status_change', {
            orderId,
            orderProjectIds,
            designerId,
            includeProjetista: shouldIncludeProjetista,
            extraFields,
            buildProjectDetails,
            projectSectionTitle,
            showProjectDetails,
            accentColor
        });
        payload.eventTitle = statusName;

        const subject = buildProjectStatusEmailSubject(statusName, payload.orderCode, payload.clientName);
        const body = buildProcessEmailBody(payload);
        const html = buildProcessEmailHtml(payload);

        await sendEmailViaGoogleAppsScript({
            to_email: recipientEmails.join(', '),
            from_name: NOTIFICATION_FROM_NAME,
            reply_to: NOTIFICATION_FROM_EMAIL,
            subject,
            message_body: body,
            message_html: html
        });
    } catch (err) {
        console.warn('notifyOrderProjectStatusChangeEmail:', err);
    }
}

window.notifyOrderProjectStatusChangeEmail = notifyOrderProjectStatusChangeEmail;

async function notifyDesignerAssignedToProjectEmail(options = {}) {
    const { orderId, orderProjectIds = [], designerId = null } = options;
    if (!NOTIFICATIONS_ENABLED || !orderId || !orderProjectIds.length || !designerId) return;

    if (!isGoogleAppsScriptConfigured()) {
        console.info('notifyDesignerAssignedToProjectEmail: Google Apps Script não configurado em js/core/config.js');
        return;
    }

    try {
        const recipientEmail = await fetchDesignerEmailById(designerId);
        if (!recipientEmail) return;

        const payload = await buildProcessNotificationPayload('designer_assigned', {
            orderId,
            orderProjectIds,
            designerId,
            includeProjetista: true,
            showProjectDetails: false,
            projectSectionTitle: 'Projeto atribuído',
            accentColor: '#7c3aed'
        });

        const subject = buildProjectStatusEmailSubject('Projetista associado', payload.orderCode, payload.clientName);
        const body = buildProcessEmailBody(payload);
        const html = buildProcessEmailHtml(payload);

        await sendEmailViaGoogleAppsScript({
            to_email: recipientEmail,
            from_name: NOTIFICATION_FROM_NAME,
            reply_to: NOTIFICATION_FROM_EMAIL,
            subject,
            message_body: body,
            message_html: html
        });
    } catch (err) {
        console.warn('notifyDesignerAssignedToProjectEmail:', err);
    }
}

window.notifyDesignerAssignedToProjectEmail = notifyDesignerAssignedToProjectEmail;

async function notifyMedicaoRealizadaEmail(options = {}) {
    const { orderId, projects = [] } = options;
    if (!orderId || !projects.length) return;

    try {
        const measurementDates = Object.fromEntries(
            projects.map(project => [Number(project.orderProjectId), project.measurementDate])
        );

        await notifyOrderProjectStatusChangeEmail({
            statusName: 'Medição Realizada',
            orderId,
            orderProjectIds: projects.map(project => project.orderProjectId),
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
            projects.map(project => [Number(project.orderProjectId), project.floorPlanRaisedDate])
        );

        await notifyOrderProjectStatusChangeEmail({
            statusName: 'Planta Levantada',
            orderId,
            orderProjectIds: projects.map(project => project.orderProjectId),
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

        await notifyOrderProjectStatusChangeEmail({
            statusName: 'Conferência Enviada',
            orderId,
            orderProjectIds,
            designerId,
            includeProjetista: true,
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
        await notifyOrderProjectStatusChangeEmail({
            statusName: 'Conferência Realizada',
            orderId,
            orderProjectIds,
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
    const { orderId, orderProjectIds = [], networkPath = null } = options;
    if (!orderId || !orderProjectIds.length) return;

    try {
        const extraFields = [];
        if (networkPath) {
            extraFields.push({ label: 'Pasta / Caminho da rede da conferência', value: networkPath });
        }

        await notifyOrderProjectStatusChangeEmail({
            statusName: 'Aguardando Projeto Técnico',
            orderId,
            orderProjectIds,
            showProjectDetails: false,
            projectSectionTitle: 'Projetos aguardando projeto técnico',
            accentColor: '#6366f1',
            extraFields
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
        await notifyOrderProjectStatusChangeEmail({
            statusName: 'Aguardando PPCP',
            orderId,
            orderProjectIds,
            designerId,
            includeProjetista: true,
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
        technicalProjectForecastEndDate = null,
        technicalProjectForecastStartDate = null
    } = options;

    if (!orderId || !orderProjectId) return;

    try {
        const extraFields = [
            { label: 'Novo status', value: 'Projeto Técnico' }
        ];

        if (technicalProjectForecastStartDate) {
            extraFields.push({
                label: 'Início previsto',
                value: formatNotificationDate(technicalProjectForecastStartDate)
            });
        }

        if (technicalProjectForecastEndDate) {
            extraFields.push({
                label: 'Previsão de conclusão',
                value: formatNotificationDate(technicalProjectForecastEndDate)
            });
        }

        await notifyOrderProjectStatusChangeEmail({
            statusName: 'Projeto Técnico',
            orderId,
            orderProjectIds: [orderProjectId],
            designerId,
            includeProjetista: true,
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
        projectFilePath = ''
    } = options;

    if (!orderId || !orderProjectId) return;

    try {
        const extraFields = [
            { label: 'Novo status', value: 'Em Produção' }
        ];

        if (projectFilePath) {
            extraFields.push({ label: 'Caminho do projeto', value: projectFilePath });
        }
        if (wpsOpCode) {
            extraFields.push({ label: 'Código da OP no WPS', value: wpsOpCode });
        }

        await notifyOrderProjectStatusChangeEmail({
            statusName: 'Em Produção',
            orderId,
            orderProjectIds: [orderProjectId],
            designerId,
            includeProjetista: true,
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

async function notifyAguardandoDetalhamentoEmail(options = {}) {
    const { orderProjectId, projectFilePath = '' } = options;
    if (!orderProjectId) return;

    if (!NOTIFICATIONS_ENABLED) return;

    if (!isGoogleAppsScriptConfigured()) {
        console.info('notifyAguardandoDetalhamentoEmail: Google Apps Script não configurado em js/core/config.js');
        return;
    }

    try {
        const recipientEmails = await fetchActiveGestorProjetosRecipientEmails();
        if (!recipientEmails.length) return;

        const { data: project, error } = await supabaseClient
            .from('OrderProject')
            .select('id, orderId, designerId')
            .eq('id', orderProjectId)
            .maybeSingle();

        if (error) throw error;
        if (!project?.orderId) return;

        const extraFields = [
            {
                label: 'Mensagem',
                value: 'Há um projeto aguardando detalhamento. Associe o projetista responsável em Pendências > Aguardando Detalhamento.'
            }
        ];

        if (projectFilePath) {
            extraFields.push({ label: 'Caminho do projeto (implantação)', value: projectFilePath });
        }

        await sendProcessNotificationEmail('aguardando_detalhamento', {
            orderId: project.orderId,
            orderProjectIds: [orderProjectId],
            designerId: project.designerId,
            recipientEmails,
            includeProjetista: true,
            showProjectDetails: false,
            projectSectionTitle: 'Projeto aguardando detalhamento',
            accentColor: '#4f46e5',
            extraFields
        });
    } catch (err) {
        console.warn('notifyAguardandoDetalhamentoEmail:', err);
    }
}

window.notifyAguardandoDetalhamentoEmail = notifyAguardandoDetalhamentoEmail;

async function notifyDetalhamentoProjetistaAssociadoEmail(options = {}) {
    const { orderProjectId, designerId, projectFilePath = '' } = options;
    if (!orderProjectId || !designerId) return;

    if (!NOTIFICATIONS_ENABLED) return;

    if (!isGoogleAppsScriptConfigured()) {
        console.info('notifyDetalhamentoProjetistaAssociadoEmail: Google Apps Script não configurado em js/core/config.js');
        return;
    }

    try {
        const recipientEmail = await fetchDesignerEmailById(designerId);
        if (!recipientEmail) return;

        const { data: project, error } = await supabaseClient
            .from('OrderProject')
            .select('id, orderId')
            .eq('id', orderProjectId)
            .maybeSingle();

        if (error) throw error;
        if (!project?.orderId) return;

        const extraFields = [
            {
                label: 'Mensagem',
                value: 'Você foi associado ao detalhamento deste projeto. Acesse Pendências > Detalhamento para iniciar.'
            }
        ];

        if (projectFilePath) {
            extraFields.push({ label: 'Pasta (implantação)', value: projectFilePath });
        }

        await sendProcessNotificationEmail('detalhamento_projetista_associado', {
            orderId: project.orderId,
            orderProjectIds: [orderProjectId],
            designerId,
            recipientEmails: [recipientEmail],
            includeProjetista: true,
            showProjectDetails: false,
            projectSectionTitle: 'Detalhamento atribuído',
            accentColor: '#4f46e5',
            extraFields
        });
    } catch (err) {
        console.warn('notifyDetalhamentoProjetistaAssociadoEmail:', err);
    }
}

window.notifyDetalhamentoProjetistaAssociadoEmail = notifyDetalhamentoProjetistaAssociadoEmail;

async function notifyMontagemExternaFinalizadaEmail(options = {}) {
    const { orderId, orderProjectId } = options;
    if (!orderId || !orderProjectId) return;

    try {
        const recipientEmails = await fetchMontagemExternaFinalizadaRecipientEmails(orderId);

        await sendProcessNotificationEmail('montagem_externa_finalizada', {
            orderId,
            orderProjectIds: [orderProjectId],
            recipientEmails,
            showProjectDetails: false,
            projectSectionTitle: 'Projeto finalizado',
            accentColor: '#059669',
            extraFields: [
                { label: 'Novo status', value: 'Aguardando Entrega Técnica' }
            ]
        });
    } catch (err) {
        console.warn('notifyMontagemExternaFinalizadaEmail:', err);
    }
}

window.notifyMontagemExternaFinalizadaEmail = notifyMontagemExternaFinalizadaEmail;

async function notifyOrderDeliveredEmail(options = {}) {
    const { orderId, orderProjectId, actualDeliveryDate } = options;
    if (!orderId || !orderProjectId) return;

    try {
        const recipientEmails = await fetchActiveGestoresRecipientEmails();
        const dateLabel = typeof formatDisplayDate === 'function'
            ? formatDisplayDate(actualDeliveryDate)
            : (actualDeliveryDate || '—');

        await sendProcessNotificationEmail('pedido_entregue', {
            orderId,
            orderProjectIds: [orderProjectId],
            recipientEmails,
            showProjectDetails: false,
            projectSectionTitle: 'Projeto entregue',
            accentColor: '#059669',
            extraFields: [
                { label: 'Data de entrega', value: dateLabel },
                { label: 'Novo status', value: 'Entregue' }
            ]
        });
    } catch (err) {
        console.warn('notifyOrderDeliveredEmail:', err);
    }
}

window.notifyOrderDeliveredEmail = notifyOrderDeliveredEmail;

async function notifyLiberacaoMedicaoEmail(options = {}) {
    const { orderId, projects = [] } = options;
    if (!orderId || !projects.length) return;

    try {
        await notifyOrderProjectStatusChangeEmail({
            statusName: 'Aguardando Medição',
            orderId,
            orderProjectIds: projects.map(project => project.id),
            showProjectDetails: false,
            projectSectionTitle: 'Projetos liberados para medição',
            accentColor: '#06b6d4'
        });
    } catch (err) {
        console.warn('notifyLiberacaoMedicaoEmail:', err);
    }
}

window.notifyLiberacaoMedicaoEmail = notifyLiberacaoMedicaoEmail;

async function notifyThirdPartyProjectStatusEmail(options = {}) {
    const {
        orderId,
        orderProjectId,
        designerId = null,
        statusLabel = '—',
        previousStatusLabel = '—',
        subtypeName = '',
        filePath = ''
    } = options;

    if (!orderId || !orderProjectId) return;

    if (!NOTIFICATIONS_ENABLED) return;

    if (!isGoogleAppsScriptConfigured()) {
        console.info('notifyThirdPartyProjectStatusEmail: Google Apps Script não configurado em js/core/config.js');
        return;
    }

    try {
        const recipientEmails = await fetchThirdPartyProjectStatusRecipientEmails(orderId, designerId);
        const extraFields = [
            { label: 'Subtipo', value: subtypeName || '—' },
            { label: 'Status anterior', value: previousStatusLabel || '—' },
            { label: 'Novo status', value: statusLabel || '—' }
        ];

        if (filePath) {
            extraFields.push({ label: 'Caminho do arquivo', value: filePath });
        }

        if (options.activities?.length) {
            extraFields.push({
                label: 'Atividades da revisão',
                value: options.activities.map((activity, index) => {
                    const parts = [`${index + 1}. ${activity.description || '—'}`];
                    if (activity.observation) parts.push(`Obs: ${activity.observation}`);
                    if (activity.completed) parts.push('[Realizado]');
                    return parts.join(' · ');
                }).join('\n')
            });
        }

        await sendProcessNotificationEmail('third_party_project_status', {
            orderId,
            orderProjectIds: [orderProjectId],
            designerId,
            includeProjetista: true,
            recipientEmails,
            showProjectDetails: false,
            projectSectionTitle: 'Projeto de terceiros',
            accentColor: '#7c3aed',
            extraFields
        });
    } catch (err) {
        console.warn('notifyThirdPartyProjectStatusEmail:', err);
    }
}

window.notifyThirdPartyProjectStatusEmail = notifyThirdPartyProjectStatusEmail;

async function notifyThirdPartyDesignerAssignedEmail(options = {}) {
    const {
        orderId,
        orderProjectId,
        designerId,
        subtypeName = '',
        characteristicName = ''
    } = options;

    if (!orderId || !orderProjectId || !designerId) return;

    if (!NOTIFICATIONS_ENABLED) return;

    if (!isGoogleAppsScriptConfigured()) {
        console.info('notifyThirdPartyDesignerAssignedEmail: Google Apps Script não configurado em js/core/config.js');
        return;
    }

    try {
        const recipientEmail = await fetchDesignerEmailById(designerId);
        if (!recipientEmail) return;

        const extraFields = [
            {
                label: 'Mensagem',
                value: 'Você foi associado a este projeto de terceiros. Acesse Pendências > Projetista > Projetos de Terceiros para iniciar.'
            }
        ];

        if (characteristicName) {
            extraFields.unshift({ label: 'Característica', value: characteristicName });
        }

        if (subtypeName) {
            extraFields.unshift({ label: 'Subtipo', value: subtypeName });
        }

        await sendProcessNotificationEmail('third_party_designer_assigned', {
            orderId,
            orderProjectIds: [orderProjectId],
            designerId,
            recipientEmails: [recipientEmail],
            includeProjetista: true,
            showProjectDetails: false,
            projectSectionTitle: 'Projeto de terceiros atribuído',
            accentColor: '#7c3aed',
            extraFields
        });
    } catch (err) {
        console.warn('notifyThirdPartyDesignerAssignedEmail:', err);
    }
}

window.notifyThirdPartyDesignerAssignedEmail = notifyThirdPartyDesignerAssignedEmail;
