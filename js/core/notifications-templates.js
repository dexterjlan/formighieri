function hasOrderProject(projectName) {
    return Boolean(projectName && projectName !== 'Sem projeto');
}

const EMAIL_NO_REPLY_FOOTER_TEXT = 'Este é um e-mail automático. Por favor, não responda esta mensagem.';

function appendEmailNoReplyFooterText(body) {
    return `${body}\n\n---\n${EMAIL_NO_REPLY_FOOTER_TEXT}`;
}

function buildEmailNoReplyFooterHtml() {
    return `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">${escapeHtml(EMAIL_NO_REPLY_FOOTER_TEXT)}</p>`;
}

function getFgpEmailProdPublicUrl() {
    const prodUrl = window.FORMIGHIERI_CONFIG_PROD?.APP_PUBLIC_URL;
    if (prodUrl) {
        return String(prodUrl).replace(/\/$/, '');
    }
    return 'https://dexterjlan.github.io/formighieri';
}

function getFgpLogoEmailUrl() {
    return `${getFgpEmailProdPublicUrl()}/images/fgp_logo.png`;
}

function buildEmailBrandHeaderHtml(eventTitle, accentColor = '#f59e0b') {
    const logoUrl = getFgpLogoEmailUrl();
    const brandContent = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="FGP - Formighieri Gestão de Processo" style="height:54px;width:auto;display:block;max-width:300px;" />`
        : `<p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#d97706;">FGP</p>
           <p style="margin:2px 0 0;font-size:10px;color:#64748b;">Formighieri Gestão de Processo</p>`;

    return `<div style="background:#0f172a;padding:20px 24px;">
      <div style="display:inline-block;background:#ffffff;border-radius:8px;padding:3px 8px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.15);">
        ${brandContent}
      </div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;border-left:4px solid ${accentColor};padding-left:12px;line-height:1.3;">${escapeHtml(eventTitle)}</h1>
    </div>`;
}

function buildOrderRequestEmailSubject(eventType, orderCode, clientName) {
    const eventLabel = eventType === 'created' ? 'Criada' : 'Respondida';
    let subject = `Requisição ${eventLabel}: Pedido ${orderCode}`;
    if (clientName && clientName !== '-') {
        subject += `, ${clientName}`;
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

    if (payload.activities?.length) {
        lines.push('', 'Atividades');
        payload.activities.forEach((activity, index) => {
            lines.push(
                '',
                `${index + 1}. ${activity.description || '-'}`,
                `   Realizado: ${activity.completed ? 'Sim' : 'Não'}`,
                `   Observação: ${activity.observation || '—'}`
            );
        });
    }

    return appendEmailNoReplyFooterText(lines.join('\n'));
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

    const activitiesBlock = buildActivitiesEmailHtml(payload.activities);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.06);">
    ${buildEmailBrandHeaderHtml(`Requisição ${payload.eventLabel}`, '#f59e0b')}
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
      ${activitiesBlock}
      ${buildEmailNoReplyFooterHtml()}
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
                message_html: payload.message_html,
                cc_email: payload.cc_email || ''
            }),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

const APPROVAL_EMAIL_TITLE = {
    approval_requested: 'Aprovação Solicitada',
    revision_created: 'Revisão Criada',
    sent_back_to_approval: 'Aprovação Reenviada',
    approved: 'Aprovação Aprovada'
};

function buildApprovalEmailSubject(eventType, orderCode, clientName) {
    const prefix = APPROVAL_EMAIL_TITLE[eventType] || 'Aprovação Atualizada';
    let subject = `${prefix}: Pedido ${orderCode}`;
    if (clientName && clientName !== '-') {
        subject += `, ${clientName}`;
    }
    return subject;
}

function buildApprovalEmailBody(payload) {
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
        `Status: ${payload.status}`,
        `Ação por: ${payload.actedByName} (${payload.actedByRole})`
    );

    if (payload.activities?.length) {
        lines.push('', 'Atividades da revisão');
        payload.activities.forEach((activity, index) => {
            lines.push(
                '',
                `${index + 1}. ${activity.description || '-'}`,
                `   Realizado: ${activity.completed ? 'Sim' : 'Não'}`,
                `   Observação: ${activity.observation || '—'}`
            );
        });
    }

    if (payload.caminhoRedeAprovacao) {
        lines.push(`Caminho da rede para aprovação: ${payload.caminhoRedeAprovacao}`);
    }

    return appendEmailNoReplyFooterText(lines.join('\n'));
}

function buildActivitiesEmailHtml(activities, title = 'Atividades') {
    if (!activities?.length) return '';

    const rows = activities.map(activity => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${escapeHtml(activity.description || '-')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;vertical-align:middle;white-space:nowrap;">${activity.completed ? '<span style="color:#047857;font-weight:600;">Sim</span>' : '<span style="color:#94a3b8;">Não</span>'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${escapeHtml(activity.observation || '—')}</td>
        </tr>
    `).join('');

    return `<div style="margin-top:16px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(title)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f5f3ff;">
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Atividade</th>
              <th style="padding:8px 12px;text-align:center;font-size:10px;color:#64748b;text-transform:uppercase;">Realizado</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Observação</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
}

function buildApprovalActivitiesHtml(activities) {
    return buildActivitiesEmailHtml(activities, 'Atividades da Revisão');
}

function buildApprovalEmailHtml(payload) {
    const projectRow = hasOrderProject(payload.projectName)
        ? `<tr>
            <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Projeto</td>
            <td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.projectName)}</td>
           </tr>`
        : '';

    const caminhoRedeBlock = payload.caminhoRedeAprovacao
        ? `<div style="margin-top:16px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Caminho da rede para aprovação</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-family:Consolas,Monaco,monospace;font-size:13px;color:#0f172a;word-break:break-all;">${escapeHtml(payload.caminhoRedeAprovacao)}</div>
           </div>`
        : '';

    const activitiesBlock = buildApprovalActivitiesHtml(payload.activities);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.06);">
    ${buildEmailBrandHeaderHtml(payload.eventTitle, '#10b981')}
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
      ${activitiesBlock}
      ${caminhoRedeBlock}
      ${buildEmailNoReplyFooterHtml()}
    </div>
  </div>
</body>
</html>`;
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
const PROCESS_EMAIL_TITLE = {
    medicao_realizada: 'Medição Realizada',
    planta_levantada: 'Planta Levantada',
    conferencia_enviada: 'Conferência Enviada',
    conferencia_confirmada: 'Conferência Confirmada',
    conferencia_aprovada: 'Conferência Aprovada',
    conferencia_devolvida: 'Conferência Devolvida ao Consultor',
    liberacao_medicao: 'Liberação para Medição',
    projeto_nomeado: 'Projeto Nomeado',
    projeto_tecnico_iniciado: 'Projeto Técnico Iniciado',
    implantacao_enviado_producao: 'Projeto Enviado para Produção'
};
function buildProcessEmailSubject(eventType, orderCode, clientName) {
    const prefix = PROCESS_EMAIL_TITLE[eventType] || 'Atualização de Processo';
    let subject = `${prefix}: Pedido ${orderCode || '—'}`;
    if (clientName && clientName !== '-') {
        subject += `, ${clientName}`;
    }
    return subject;
}

function buildProcessEmailBody(payload) {
    const lines = [
        payload.eventTitle,
        '',
        `Pedido: ${payload.orderCode}`,
        `Cliente: ${payload.clientName}`,
        `Consultor: ${payload.consultantName}`
    ];

    if (payload.projetistaName) {
        lines.push(`Projetista: ${payload.projetistaName}`);
    }

    if (payload.projectRows?.length) {
        lines.push('', payload.projectSectionTitle || 'Projetos');
        payload.projectRows.forEach(row => {
            if (payload.showProjectDetails === false) {
                lines.push(`• ${row.name}`);
                return;
            }
            const details = row.details?.length ? ` (${row.details.join(' · ')})` : '';
            lines.push(`• ${row.name}${details}`);
        });
    }

    (payload.extraFields || []).forEach(field => {
        if (field.value) {
            lines.push(`${field.label}: ${field.value}`);
        }
    });

    lines.push(
        '',
        `Ação por: ${payload.actedByName} (${payload.actedByRole})`
    );

    return appendEmailNoReplyFooterText(lines.join('\n'));
}

function buildProcessProjectRowsHtml(projectRows, title = 'Projetos', showProjectDetails = true) {
    if (!projectRows?.length) return '';

    const rows = projectRows.map(row => {
        if (!showProjectDetails) {
            return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${escapeHtml(row.name)}</td>
        </tr>`;
        }
        return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${escapeHtml(row.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${escapeHtml(row.details?.join(' · ') || '—')}</td>
        </tr>`;
    }).join('');

    const header = showProjectDetails
        ? `<tr style="background:#f0fdfa;">
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Projeto</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Detalhes</th>
            </tr>`
        : `<tr style="background:#f0fdfa;">
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Projeto</th>
            </tr>`;

    return `<div style="margin-top:16px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#0d9488;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(title)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <thead>${header}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
}

function buildProcessExtraFieldsHtml(extraFields = []) {
    return extraFields
        .filter(field => field.value)
        .map(field => `
        <div style="margin-top:16px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(field.label)}</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:14px;color:#0f172a;white-space:pre-wrap;word-break:break-word;">${escapeHtml(field.value)}</div>
        </div>`)
        .join('');
}

function buildProcessEmailHtml(payload) {
    const projetistaRow = payload.projetistaName
        ? `<tr>
            <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Projetista</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.projetistaName)}</td>
           </tr>`
        : '';

    const accentColor = payload.accentColor || '#0d9488';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.06);">
    ${buildEmailBrandHeaderHtml(payload.eventTitle, accentColor)}
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        <tr>
          <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;width:120px;">Pedido</td>
          <td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.orderCode)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Cliente</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.clientName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Consultor</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.consultantName)}</td>
        </tr>
        ${projetistaRow}
        <tr>
          <td style="padding:8px 12px;color:#64748b;">Ação por</td>
          <td style="padding:8px 12px;">${escapeHtml(payload.actedByName)} <span style="color:#64748b;">(${escapeHtml(payload.actedByRole)})</span></td>
        </tr>
      </table>
      ${buildProcessProjectRowsHtml(payload.projectRows, payload.projectSectionTitle, payload.showProjectDetails !== false)}
      ${buildProcessExtraFieldsHtml(payload.extraFields)}
      ${buildEmailNoReplyFooterHtml()}
    </div>
  </div>
</body>
</html>`;
}
