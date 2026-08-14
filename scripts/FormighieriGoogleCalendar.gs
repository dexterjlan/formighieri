/**
 * Sincronização FGP → Google Calendar ("FGP - Comercial")
 *
 * Integrar no Web App existente (FormighieriNotificacoes.gs):
 * 1. No início de doPost(e), após parse do JSON, se body.action começar com "calendar_",
 *    retornar handleCalendarSyncRequest_(body).
 * 2. Configurar Script Properties (Projeto → Configurações do projeto → Propriedades do script):
 *    - SUPABASE_URL_DEV / SUPABASE_SERVICE_KEY_DEV — Supabase de desenvolvimento
 *    - SUPABASE_URL_PROD / SUPABASE_SERVICE_KEY_PROD — Supabase de produção
 *    - (legado) SUPABASE_URL / SUPABASE_SERVICE_KEY — fallback se _DEV/_PROD não existirem
 *    - NOTIFICATION_SCRIPT_SECRET — mesmo segredo do config.js
 *
 * Republicar o Web App após alterar.
 */

var FGP_GOOGLE_CALENDAR_NAME = 'FGP - Comercial';

function handleCalendarSyncRequest_(body) {
  try {
    if (!body || body.secret !== getNotificationScriptSecret_()) {
      return jsonResponse_({ ok: false, error: 'Unauthorized' }, 401);
    }

    var calendar = body.calendar || {};
    var action = String(body.action || '');
    var environment = String(body.environment || 'prod').toLowerCase();

    if (action === 'calendar_upsert') {
      var upsertResult = upsertFgpCalendarEvent_(calendar);
      if (calendar.fgpEventId && upsertResult.googleCalendarEventId) {
        upsertResult.supabaseUpdate = updateFgpCalendarEventId_(
          calendar.fgpEventId,
          upsertResult.googleCalendarEventId,
          environment
        );
      } else if (!calendar.fgpEventId) {
        upsertResult.supabaseUpdate = { ok: false, error: 'fgpEventId ausente no payload' };
      }
      return jsonResponse_(upsertResult);
    }

    if (action === 'calendar_delete') {
      deleteFgpCalendarEvent_(calendar);
      if (calendar.fgpEventId) {
        clearFgpCalendarEventId_(calendar.fgpEventId, environment);
      }
      return jsonResponse_({ ok: true });
    }

    return jsonResponse_({ ok: false, error: 'Unknown calendar action' }, 400);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) }, 500);
  }
}

function getNotificationScriptSecret_() {
  return PropertiesService.getScriptProperties().getProperty('NOTIFICATION_SCRIPT_SECRET')
    || 'Hanna@2020';
}

function getOrCreateFgpGoogleCalendar_(calendarName) {
  var targetName = calendarName || FGP_GOOGLE_CALENDAR_NAME;
  var calendars = CalendarApp.getAllCalendars();
  for (var i = 0; i < calendars.length; i++) {
    if (calendars[i].getName() === targetName) {
      return calendars[i];
    }
  }
  return CalendarApp.createCalendar(targetName, {
    summary: 'Calendário comercial sincronizado pelo FGP',
    timeZone: 'America/Sao_Paulo'
  });
}

function parseFgpEventDateTime_(eventDate, eventTime) {
  var dateParts = String(eventDate || '').split('-');
  var timeParts = String(eventTime || '09:00:00').split(':');
  var year = Number(dateParts[0]) || 2026;
  var month = Number(dateParts[1]) || 1;
  var day = Number(dateParts[2]) || 1;
  var hours = Number(timeParts[0]) || 9;
  var minutes = Number(timeParts[1]) || 0;
  return new Date(year, month - 1, day, hours, minutes, 0);
}

function upsertFgpCalendarEvent_(calendar) {
  var cal = getOrCreateFgpGoogleCalendar_(calendar.calendarName);
  var start = parseFgpEventDateTime_(calendar.eventDate, calendar.eventTime);
  var durationMinutes = Number(calendar.durationMinutes) || 60;
  var end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  var summary = calendar.summary || 'Evento FGP';
  var description = calendar.description || '';

  if (calendar.googleCalendarEventId) {
    try {
      var existing = cal.getEventById(calendar.googleCalendarEventId);
      if (existing) {
        existing.setTitle(summary);
        existing.setTime(start, end);
        existing.setDescription(description);
        return { ok: true, googleCalendarEventId: existing.getId() };
      }
    } catch (ignored) {}
  }

  var created = cal.createEvent(summary, start, end, { description: description });
  return { ok: true, googleCalendarEventId: created.getId() };
}

function deleteFgpCalendarEvent_(calendar) {
  if (!calendar.googleCalendarEventId) return;
  try {
    var event = CalendarApp.getEventById(calendar.googleCalendarEventId);
    if (event) event.deleteEvent();
  } catch (ignored) {}
}

function updateFgpCalendarEventId_(fgpEventId, googleCalendarEventId, environment) {
  var config = getSupabaseConfig_(environment);
  if (!config) {
    return {
      ok: false,
      error: 'Supabase não configurado para ambiente "' + environment + '". '
        + 'Configure SUPABASE_URL_' + (environment === 'dev' ? 'DEV' : 'PROD')
        + ' e SUPABASE_SERVICE_KEY_' + (environment === 'dev' ? 'DEV' : 'PROD')
        + ' (ou SUPABASE_URL / SUPABASE_SERVICE_KEY legados).'
    };
  }

  var response = UrlFetchApp.fetch(
    config.url + '/rest/v1/CalendarEvent?id=eq.' + encodeURIComponent(String(fgpEventId)),
    {
      method: 'patch',
      headers: {
        apikey: config.key,
        Authorization: 'Bearer ' + config.key,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      payload: JSON.stringify({
        googleCalendarEventId: googleCalendarEventId,
        googleCalendarSyncedAt: new Date().toISOString()
      }),
      muteHttpExceptions: true
    }
  );

  var status = response.getResponseCode();
  var bodyText = response.getContentText() || '';

  if (status < 200 || status >= 300) {
    return {
      ok: false,
      error: 'Supabase PATCH HTTP ' + status + ': ' + bodyText,
      supabaseUrl: config.url,
      fgpEventId: fgpEventId
    };
  }

  var rows = [];
  try {
    rows = bodyText ? JSON.parse(bodyText) : [];
  } catch (ignored) {}

  if (!rows.length) {
    return {
      ok: false,
      error: 'Nenhum CalendarEvent com id ' + fgpEventId + ' em ' + config.url
        + '. Use um id real da tabela CalendarEvent (Supabase de ' + environment + ').',
      supabaseUrl: config.url,
      fgpEventId: fgpEventId
    };
  }

  return { ok: true, supabaseUrl: config.url, fgpEventId: fgpEventId };
}

function clearFgpCalendarEventId_(fgpEventId, environment) {
  var config = getSupabaseConfig_(environment);
  if (!config) return;

  UrlFetchApp.fetch(config.url + '/rest/v1/CalendarEvent?id=eq.' + encodeURIComponent(String(fgpEventId)), {
    method: 'patch',
    headers: {
      apikey: config.key,
      Authorization: 'Bearer ' + config.key,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    payload: JSON.stringify({
      googleCalendarEventId: null,
      googleCalendarSyncedAt: new Date().toISOString()
    }),
    muteHttpExceptions: true
  });
}

function getSupabaseConfig_(environment) {
  var props = PropertiesService.getScriptProperties();
  var env = String(environment || 'prod').toLowerCase() === 'dev' ? 'dev' : 'prod';
  var suffix = env === 'dev' ? '_DEV' : '_PROD';
  var url = props.getProperty('SUPABASE_URL' + suffix) || props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_SERVICE_KEY' + suffix) || props.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) return null;
  return { url: String(url).replace(/\/$/, ''), key: key };
}

function jsonResponse_(payload, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Só força o pedido de permissão do Google Calendar (Executar → autorizarCalendario).
 * Use se testarSyncCalendarioDev falhar por falta de escopo.
 */
function autorizarCalendario() {
  var count = CalendarApp.getAllCalendars().length;
  Logger.log('Calendários visíveis: ' + count);
}

/**
 * Teste manual no editor do Apps Script (Executar → testarSyncCalendarioDev).
 * Troque fgpEventId por um ID real da tabela CalendarEvent no Supabase de dev.
 */
function testarSyncCalendarioDev() {
  var output = handleCalendarSyncRequest_({
    secret: getNotificationScriptSecret_(),
    action: 'calendar_upsert',
    environment: 'dev',
    calendar: {
      calendarName: 'FGP - Comercial (Testes)',
      fgpEventId: 1,
      eventDate: '2026-08-15',
      eventTime: '14:00:00',
      summary: 'Teste Apps Script FGP',
      description: 'Executado manualmente no editor'
    }
  });
  Logger.log(output.getContent());
}
