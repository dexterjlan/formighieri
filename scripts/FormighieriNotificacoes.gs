/**
 * Web App FGP — e-mails + roteamento para Google Calendar.
 *
 * No projeto Apps Script "Notificacoes":
 * - Este arquivo costuma ser o "Código.gs" (arquivo principal).
 * - FormighieriGoogleCalendar.gs fica em arquivo separado no mesmo projeto.
 *
 * Propriedades do script:
 * - NOTIFICATION_SCRIPT_SECRET
 * - SUPABASE_URL_DEV / SUPABASE_SERVICE_KEY_DEV
 * - SUPABASE_URL_PROD / SUPABASE_SERVICE_KEY_PROD
 *
 * appsscript.json — oauthScopes mínimos:
 * - https://www.googleapis.com/auth/calendar
 * - https://www.googleapis.com/auth/gmail.send
 * - https://www.googleapis.com/auth/script.external_request
 */

var NOTIFICATION_FROM_EMAIL = 'formighieri.notificacoes@gmail.com';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // Calendário FGP → Google (FormighieriGoogleCalendar.gs)
    if (body.action && String(body.action).indexOf('calendar_') === 0) {
      return handleCalendarSyncRequest_(body);
    }

    // E-mail (fluxo original do FGP)
    return handleEmailRequest_(body);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) }, 500);
  }
}

function handleEmailRequest_(body) {
  if (!body || body.secret !== getNotificationScriptSecret_()) {
    return jsonResponse_({ ok: false, error: 'Unauthorized' }, 401);
  }

  var to = String(body.to_email || '').trim();
  if (!to) {
    return jsonResponse_({ ok: false, error: 'to_email obrigatório' }, 400);
  }

  var subject = String(body.subject || 'FGP - Notificação');
  var htmlBody = String(body.message_html || '');
  var textBody = String(body.message_body || '');
  var fromName = String(body.from_name || 'FGP - Formighieri');
  var replyTo = String(body.reply_to || NOTIFICATION_FROM_EMAIL);
  var cc = String(body.cc_email || '').trim();

  var options = {
    htmlBody: htmlBody || undefined,
    name: fromName,
    replyTo: replyTo
  };
  if (cc) {
    options.cc = cc;
  }

  GmailApp.sendEmail(to, subject, textBody || ' ', options);

  return jsonResponse_({ ok: true });
}

function getNotificationScriptSecret_() {
  return PropertiesService.getScriptProperties().getProperty('NOTIFICATION_SCRIPT_SECRET')
    || 'Hanna@2020';
}

function jsonResponse_(payload, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
