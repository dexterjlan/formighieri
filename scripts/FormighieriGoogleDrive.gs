/**
 * Google Drive API — upload pela conta formighieri.notificacoes.
 *
 * O navegador não lê a resposta do Web App (CORS/redirect). O FGP envia POST
 * opaco (igual e-mail/calendário) e espera o Apps Script gravar em DriveFile.
 *
 * Ações:
 * - drive_upload  — arquivo até 8 MB (um POST, DriveApp.createFile)
 * - drive_start   — abre sessão resumível (Drive API) para arquivos maiores
 * - drive_chunk   — fatia da Drive API (PUT Content-Range)
 *
 * Cole no projeto "Notificacoes" e republicar: Nova versão, Executar como: Eu.
 *
 * Pasta prod: FGP / {pedido} / {projeto} / {detalhamento|revisao|requisicao}
 * Pasta dev:  FGP-DEV / {pedido} / {projeto} / ...
 * Detalhamento: PDF/ZIP. Requisição e revisão: uma imagem por atividade.
 */

var FGP_DRIVE_ROOT_FOLDER_NAME = 'FGP';
var FGP_DRIVE_ROOT_FOLDER_NAME_DEV = 'FGP-DEV';
var FGP_DRIVE_MAX_FILE_BYTES = 100 * 1024 * 1024;
var FGP_DRIVE_DIRECT_MAX_BYTES = 8 * 1024 * 1024;
var FGP_DRIVE_UPLOAD_CACHE_TTL = 3600;

var FGP_DRIVE_FOLDER_KIND = {
  detailing: 'detalhamento',
  revision: 'revisao',
  request: 'requisicao'
};

function handleDrivePostRequest_(body) {
  if (!body || body.secret !== getNotificationScriptSecret_()) {
    return jsonResponse_({ ok: false, error: 'Unauthorized' });
  }

  var action = String(body.action || '');
  if (action === 'drive_upload') {
    return jsonResponse_(uploadDriveFileSimple_(body));
  }
  if (action === 'drive_start') {
    return jsonResponse_(startDriveResumable_(body));
  }
  if (action === 'drive_chunk') {
    return jsonResponse_(uploadDriveChunk_(body));
  }
  if (action === 'drive_delete') {
    return jsonResponse_(deleteDriveFile_(body));
  }
  return jsonResponse_({ ok: false, error: 'Ação Drive inválida' });
}

function handleDriveGetRequest_(e) {
  var params = (e && e.parameter) || {};
  return jsonResponse_({ ok: false, error: 'Use POST drive_upload / drive_start / drive_chunk.' });
}

function isImageDriveFolderKind_(folderKind) {
  return folderKind === 'request' || folderKind === 'revision';
}

function isAllowedDriveUploadFileName_(fileName, folderKind) {
  var lower = String(fileName || '').toLowerCase();
  var kind = String(folderKind || 'detailing').toLowerCase();
  if (isImageDriveFolderKind_(kind)) {
    return /\.(jpe?g|png|webp|gif|heic|heif)$/.test(lower);
  }
  return /\.pdf$/.test(lower) || /\.zip$/.test(lower);
}

function mimeTypeForDriveUpload_(fileName, mimeType) {
  var lower = String(fileName || '').toLowerCase();
  if (/\.pdf$/.test(lower)) return 'application/pdf';
  if (/\.zip$/.test(lower)) return 'application/zip';
  if (/\.png$/.test(lower)) return 'image/png';
  if (/\.webp$/.test(lower)) return 'image/webp';
  if (/\.gif$/.test(lower)) return 'image/gif';
  if (/\.heic$/.test(lower)) return 'image/heic';
  if (/\.heif$/.test(lower)) return 'image/heif';
  if (/\.jpe?g$/.test(lower)) return 'image/jpeg';
  return String(mimeType || 'application/octet-stream');
}

function sanitizeDriveFolderName_(name) {
  var value = String(name || '').trim() || 'sem-nome';
  value = value.replace(/[\\/:*?"<>|]/g, '-');
  value = value.replace(/\s+/g, ' ');
  if (value.length > 120) value = value.substring(0, 120);
  return value;
}

function normalizeDriveFolderKind_(folderKind) {
  var kind = String(folderKind || 'detailing').trim().toLowerCase();
  if (FGP_DRIVE_FOLDER_KIND[kind]) return kind;
  return 'detailing';
}

function folderKindToFolderName_(folderKind) {
  var kind = normalizeDriveFolderKind_(folderKind);
  return FGP_DRIVE_FOLDER_KIND[kind] || kind;
}

function getOrCreateChildFolder_(parent, name) {
  var folderName = sanitizeDriveFolderName_(name);
  var iterator = parent.getFoldersByName(folderName);
  if (iterator.hasNext()) return iterator.next();
  return parent.createFolder(folderName);
}

function getDriveRootFolderName_(environment) {
  var env = String(environment || 'prod').toLowerCase();
  return env === 'dev' ? FGP_DRIVE_ROOT_FOLDER_NAME_DEV : FGP_DRIVE_ROOT_FOLDER_NAME;
}

function getOrCreateDriveRootFolder_(environment) {
  var rootName = getDriveRootFolderName_(environment);
  var iterator = DriveApp.getRootFolder().getFoldersByName(rootName);
  if (iterator.hasNext()) return iterator.next();
  return DriveApp.getRootFolder().createFolder(rootName);
}

function getDriveFolder_(folderKind, orderCode, projectName, environment) {
  var root = getOrCreateDriveRootFolder_(environment);
  var orderFolder = getOrCreateChildFolder_(root, orderCode);
  var projectFolder = getOrCreateChildFolder_(orderFolder, projectName);
  return getOrCreateChildFolder_(projectFolder, folderKindToFolderName_(folderKind));
}

function buildDrivePath_(folderKind, orderCode, projectName, environment) {
  return [
    getDriveRootFolderName_(environment),
    sanitizeDriveFolderName_(orderCode),
    sanitizeDriveFolderName_(projectName),
    folderKindToFolderName_(folderKind)
  ].join(' / ');
}

function getResponseHeader_(response, name) {
  var headers = response.getHeaders();
  var want = String(name).toLowerCase();
  for (var key in headers) {
    if (String(key).toLowerCase() === want) {
      var value = headers[key];
      if (Object.prototype.toString.call(value) === '[object Array]') {
        return value.length ? String(value[0]) : '';
      }
      return String(value || '');
    }
  }
  return '';
}

function supabaseDriveHeaders_(config, extra) {
  var headers = {
    apikey: config.key,
    Authorization: 'Bearer ' + config.key,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal'
  };
  if (extra) {
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) headers[key] = extra[key];
    }
  }
  return headers;
}

function getDriveSupabaseConfig_(body) {
  if (typeof getSupabaseConfig_ !== 'function') return null;
  return getSupabaseConfig_(body && body.environment);
}

function patchDriveFileRow_(config, driveFileRowId, payload) {
  if (!config || !driveFileRowId) return;
  var response = UrlFetchApp.fetch(
    config.url + '/rest/v1/DriveFile?id=eq.' + encodeURIComponent(String(driveFileRowId)),
    {
      method: 'patch',
      headers: supabaseDriveHeaders_(config),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Supabase PATCH DriveFile HTTP ' + status + ': ' + (response.getContentText() || ''));
  }
}

function patchDriveFileError_(config, driveFileRowId, err) {
  try {
    patchDriveFileRow_(config, driveFileRowId, {
      ingestStatus: 'error',
      ingestError: String(err).substring(0, 500),
      updatedAt: new Date().toISOString()
    });
  } catch (ignored) {}
}

function patchDriveFileReady_(config, driveFileRowId, driveFileId, folderId, folderPath) {
  patchDriveFileRow_(config, driveFileRowId, {
    driveFileId: String(driveFileId),
    driveFolderId: String(folderId || ''),
    url: 'https://drive.google.com/uc?export=download&id=' + driveFileId + '&confirm=t',
    folderPath: folderPath || null,
    ingestStatus: 'ready',
    ingestError: null,
    updatedAt: new Date().toISOString()
  });
}

function driveUploadCacheKey_(uploadId) {
  return 'fgp-drive-up-' + String(uploadId || '');
}

function putDriveUploadSession_(uploadId, data) {
  CacheService.getScriptCache().put(
    driveUploadCacheKey_(uploadId),
    JSON.stringify(data),
    FGP_DRIVE_UPLOAD_CACHE_TTL
  );
}

function getDriveUploadSession_(uploadId) {
  var raw = CacheService.getScriptCache().get(driveUploadCacheKey_(uploadId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function removeDriveUploadSession_(uploadId) {
  CacheService.getScriptCache().remove(driveUploadCacheKey_(uploadId));
}

function startDriveResumableUpload_(token, folderId, fileName, mimeType, fileSize) {
  var response = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'post',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSize)
      },
      payload: JSON.stringify({
        name: fileName,
        parents: [folderId]
      }),
      muteHttpExceptions: true
    }
  );
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Drive session HTTP ' + status + ': ' + (response.getContentText() || ''));
  }
  var location = getResponseHeader_(response, 'Location');
  if (!location) throw new Error('Drive não devolveu a URL de upload resumível');
  return location;
}

function uploadDriveResumableChunk_(token, sessionUri, bytes, start, total) {
  var end = start + bytes.length - 1;
  var response = UrlFetchApp.fetch(sessionUri, {
    method: 'put',
    contentType: 'application/octet-stream',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total
    },
    payload: Utilities.newBlob(bytes),
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  if (status === 200 || status === 201) {
    try {
      return JSON.parse(response.getContentText() || '{}');
    } catch (err) {
      return {};
    }
  }
  if (status === 308) return null;
  throw new Error('Drive chunk HTTP ' + status + ': ' + (response.getContentText() || ''));
}

function trashDriveFilesByNameExcept_(folder, fileName, keepDriveFileId) {
  var existing = folder.getFilesByName(fileName);
  var keepId = String(keepDriveFileId || '');
  while (existing.hasNext()) {
    try {
      var file = existing.next();
      if (String(file.getId()) !== keepId) file.setTrashed(true);
    } catch (err) {}
  }
}

function trashDriveFilesByName_(folder, fileName) {
  trashDriveFilesByNameExcept_(folder, fileName, '');
}

function applyDriveFileSharing_(driveFileId) {
  try {
    DriveApp.getFileById(driveFileId).setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );
  } catch (err) {}
}

function trashPreviousDriveFile_(previousDriveFileId, keepDriveFileId) {
  var previousId = String(previousDriveFileId || '').trim();
  var keepId = String(keepDriveFileId || '').trim();
  if (!previousId || previousId === keepId) return;
  try {
    DriveApp.getFileById(previousId).setTrashed(true);
  } catch (err) {}
}

function deleteDriveFile_(body) {
  if (!body || body.secret !== getNotificationScriptSecret_()) {
    return { ok: false, error: 'Unauthorized' };
  }
  var driveFileId = String(body.driveFileId || '').trim();
  if (!driveFileId) return { ok: false, error: 'driveFileId ausente' };
  try {
    DriveApp.getFileById(driveFileId).setTrashed(true);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function resolveDriveUploadContext_(body) {
  var fileName = String(body.fileName || '').replace(/[\\/:*?"<>|]/g, '-').trim();
  var orderCode = String(body.orderCode || '').trim();
  var fileSize = Number(body.fileSizeBytes || 0);
  var folderKind = normalizeDriveFolderKind_(body.folderKind);
  if (!orderCode) throw new Error('Pedido é obrigatório');
  if (!fileName || !isAllowedDriveUploadFileName_(fileName, folderKind)) {
    throw new Error(isImageDriveFolderKind_(folderKind)
      ? 'Envie apenas uma imagem (JPEG, PNG, WebP, GIF ou HEIC)'
      : 'Envie apenas PDF ou ZIP');
  }
  var maxBytes = folderKind === 'request'
    ? (10 * 1024 * 1024)
    : (folderKind === 'revision' ? (2 * 1024 * 1024) : FGP_DRIVE_MAX_FILE_BYTES);
  if (fileSize <= 0 || fileSize > maxBytes) {
    throw new Error(folderKind === 'request'
      ? 'A imagem deve ter no máximo 10 MB'
      : (folderKind === 'revision'
        ? 'A imagem deve ter no máximo 2 MB'
        : 'Arquivo passa de 100 MB ou está vazio'));
  }
  var projectName = String(body.projectName || '').trim();
  if (!projectName) throw new Error('Nome do projeto é obrigatório');
  return {
    folderKind: folderKind,
    orderCode: orderCode,
    projectName: projectName,
    fileName: fileName,
    fileSize: fileSize,
    mimeType: mimeTypeForDriveUpload_(fileName, body.mimeType),
    driveFileRowId: Number(body.driveFileRowId || 0),
    previousDriveFileId: String(body.previousDriveFileId || '').trim(),
    environment: String(body.environment || 'prod').toLowerCase()
  };
}

function uploadDriveFileSimple_(body) {
  var config = getDriveSupabaseConfig_(body);
  var driveFileRowId = Number(body.driveFileRowId || 0);
  try {
    var ctx = resolveDriveUploadContext_(body);
    if (!ctx.driveFileRowId) throw new Error('driveFileRowId ausente');
    if (!config) throw new Error('Supabase não configurado no Apps Script (SUPABASE_URL_DEV/PROD).');

    var contentBase64 = String(body.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!contentBase64) throw new Error('Arquivo inválido');

    var bytes = Utilities.base64Decode(contentBase64);
    if (bytes.length > FGP_DRIVE_DIRECT_MAX_BYTES) {
      throw new Error('Arquivo grande demais para envio direto');
    }

    var folder = getDriveFolder_(ctx.folderKind, ctx.orderCode, ctx.projectName, ctx.environment);
    var folderPath = buildDrivePath_(ctx.folderKind, ctx.orderCode, ctx.projectName, ctx.environment);
    trashDriveFilesByName_(folder, ctx.fileName);

    var blob = Utilities.newBlob(bytes, ctx.mimeType, ctx.fileName);
    var file = folder.createFile(blob);
    var driveFileId = String(file.getId());
    applyDriveFileSharing_(driveFileId);
    trashPreviousDriveFile_(ctx.previousDriveFileId, driveFileId);
    patchDriveFileReady_(config, ctx.driveFileRowId, driveFileId, folder.getId(), folderPath);
    return { ok: true, driveFileId: driveFileId, path: folderPath };
  } catch (err) {
    patchDriveFileError_(config, driveFileRowId, err);
    return { ok: false, error: String(err) };
  }
}

function startDriveResumable_(body) {
  var config = getDriveSupabaseConfig_(body);
  var driveFileRowId = Number(body.driveFileRowId || 0);
  try {
    var ctx = resolveDriveUploadContext_(body);
    if (!ctx.driveFileRowId) throw new Error('driveFileRowId ausente');
    if (!config) throw new Error('Supabase não configurado no Apps Script (SUPABASE_URL_DEV/PROD).');

    var uploadId = String(body.uploadId || '').trim();
    if (!uploadId) throw new Error('uploadId ausente');

    var folder = getDriveFolder_(ctx.folderKind, ctx.orderCode, ctx.projectName, ctx.environment);
    trashDriveFilesByName_(folder, ctx.fileName);

    var token = ScriptApp.getOAuthToken();
    var sessionUri = startDriveResumableUpload_(
      token,
      String(folder.getId()),
      ctx.fileName,
      ctx.mimeType,
      ctx.fileSize
    );

    putDriveUploadSession_(uploadId, {
      sessionUri: sessionUri,
      folderId: String(folder.getId()),
      folderPath: buildDrivePath_(ctx.folderKind, ctx.orderCode, ctx.projectName, ctx.environment),
      fileName: ctx.fileName,
      mimeType: ctx.mimeType,
      fileSize: ctx.fileSize,
      driveFileRowId: ctx.driveFileRowId,
      previousDriveFileId: ctx.previousDriveFileId,
      offset: 0
    });

    patchDriveFileRow_(config, ctx.driveFileRowId, {
      ingestStatus: 'pending',
      ingestError: 'session:ready',
      folderPath: buildDrivePath_(ctx.folderKind, ctx.orderCode, ctx.projectName, ctx.environment),
      driveFolderId: String(folder.getId()),
      updatedAt: new Date().toISOString()
    });

    return { ok: true, uploadId: uploadId };
  } catch (err) {
    patchDriveFileError_(config, driveFileRowId, err);
    return { ok: false, error: String(err) };
  }
}

function uploadDriveChunk_(body) {
  var config = getDriveSupabaseConfig_(body);
  var uploadId = String(body.uploadId || '');
  var session = getDriveUploadSession_(uploadId);
  var driveFileRowId = session && session.driveFileRowId
    ? session.driveFileRowId
    : Number(body.driveFileRowId || 0);

  try {
    if (!session) throw new Error('Sessão de upload expirada. Envie o arquivo de novo.');
    if (!config) throw new Error('Supabase não configurado no Apps Script (SUPABASE_URL_DEV/PROD).');

    var start = Number(body.start || 0);
    if (start !== Number(session.offset || 0)) {
      throw new Error('Chunk fora de ordem (esperado ' + session.offset + ')');
    }

    var contentBase64 = String(body.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!contentBase64) throw new Error('Chunk vazio');

    var bytes = Utilities.base64Decode(contentBase64);
    var token = ScriptApp.getOAuthToken();
    var created = uploadDriveResumableChunk_(
      token,
      session.sessionUri,
      bytes,
      start,
      session.fileSize
    );

    session.offset = start + bytes.length;
    if (created && created.id) {
      var driveFileId = String(created.id);
      applyDriveFileSharing_(driveFileId);
      trashPreviousDriveFile_(session.previousDriveFileId, driveFileId);
      trashDriveFilesByNameExcept_(
        DriveApp.getFolderById(session.folderId),
        session.fileName,
        driveFileId
      );
      removeDriveUploadSession_(uploadId);
      patchDriveFileReady_(config, session.driveFileRowId, driveFileId, session.folderId, session.folderPath);
      return { ok: true, done: true, driveFileId: driveFileId };
    }

    if (session.offset >= session.fileSize) {
      throw new Error('Drive não devolveu o id do arquivo');
    }

    putDriveUploadSession_(uploadId, session);
    patchDriveFileRow_(config, session.driveFileRowId, {
      ingestStatus: 'pending',
      ingestError: 'uploading:' + session.offset,
      updatedAt: new Date().toISOString()
    });
    return { ok: true, done: false, offset: session.offset };
  } catch (err) {
    patchDriveFileError_(config, driveFileRowId, err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Teste no editor: Executar → testarDriveDetalhamento.
 */
function testarDriveDetalhamento() {
  var folder = getDriveFolder_('detailing', 'TESTE-PEDIDO', 'Projeto Teste', 'dev');
  Logger.log(folder.getUrl());
  return folder.getUrl();
}
