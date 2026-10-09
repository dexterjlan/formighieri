# Google Drive upload — checklist Apps Script (Notificações)

O FGP envia uploads pelo Web App (`GOOGLE_APPS_SCRIPT_URL` em `js/core/config.js`). O tempo que aparece no DevTools como `exec` (~7 s em PDF pequeno) é **execução síncrona no Apps Script** até o HTTP 200; o poll no Supabase é rápido.

Referência no front: `js/core/drive-files.js` (`saveDriveFileUpload`, `postGoogleDriveAction`).

---

## 1. Contrato do POST (corpo JSON)

Campos comuns em **todas** as ações `drive_*` (via `buildGoogleAppsScriptRequestBody`):

| Campo | Tipo | Uso |
|--------|------|-----|
| `secret` | string | Deve bater com `NOTIFICATION_SCRIPT_SECRET` |
| `environment` | `dev` \| `prod` | Escolhe `SUPABASE_URL_*` / `SUPABASE_SERVICE_KEY_*` |
| `createdById` | number \| null | `appUsers.id` de quem enviou |
| `action` | string | Ver tabela abaixo |

### `drive_warm` (aquecimento)

- **Quem chama:** `primeGoogleDriveAppsScript()` no login e ao abrir modal de orçamento da assistência.
- **Resposta esperada:** `{ "ok": true }` em &lt; 500 ms.
- **Implementação:** já no `FormighieriNotificacoes.gs` do repo (não tocar no Drive).

### `drive_upload` (arquivo ≤ 8 MB)

Payload extra (além dos campos comuns):

| Campo | Exemplo |
|--------|---------|
| `driveFileRowId` | ID da linha `DriveFile` já criada no Supabase (`pending`) |
| `folderKind` | `assistanceQuote`, `detailing`, `request`, … |
| `entityType` / `entityId` | ex. `AssistanceRequest` + `3` |
| `orderCode`, `projectName`, `folderLeafName` | Metadados de pasta |
| `folderPath` | ex. `FGP-DEV / assistencias / 3 / orcamento` |
| `fileName`, `mimeType`, `fileSizeBytes` | Arquivo |
| `contentBase64` | PDF/binário em base64 (sem prefixo `data:`) |
| `previousDriveFileId` | Se substituir, apagar/revisar arquivo antigo no Drive |

**Assistência (orçamento):** `folderKind: assistanceQuote`, `entityType: AssistanceRequest`, `replaceByEntity: true` no front → uma linha `DriveFile` por assistência.

### `drive_start` + `drive_chunk` (arquivo &gt; 8 MB)

- `drive_start`: `uploadId` + mesmo contexto de pasta/arquivo; o front espera `ingestError === 'session:ready'` na linha `driveFileRowId`.
- `drive_chunk`: `uploadId`, `driveFileRowId`, `start` (offset), `contentBase64`; o front espera `ingestError === 'uploading:{offset}'` ou `ingestStatus === 'ready'`.

### `drive_delete`

- `driveFileId`, `driveFileRowId` (opcional limpar registro).

---

## 2. O que o Supabase precisa ao terminar

O front só libera a UI quando a linha `DriveFile` (`driveFileRowId`) tem:

- `ingestStatus` = **`ready`**
- `driveFileId` preenchido (ID do arquivo no Google Drive)
- `ingestStatus === 'error'` → o front mostra `ingestError`

Campos úteis: `url` (link ou referência), `driveFolderId`, `mimeType`, `fileSizeBytes`, `updatedAt`.

**Ordem crítica:** atualizar o Supabase **na mesma execução** do `drive_upload`, **antes** de devolver o JSON HTTP. Se o GAS responder 200 e só depois atualizar o Supabase (ou em trigger assíncrono), o usuário espera o POST inteiro **e** ainda pode atrasar no poll.

---

## 3. Resposta HTTP que o front entende

- Status **2xx**, corpo JSON quando possível.
- Sucesso: `{ "ok": true, "driveFileId": "...", "ingestStatus": "ready" }` — o front usa isso para um fetch imediato e menos poll (`driveActionResponseHintsReady`).
- Erro: `{ "ok": false, "error": "mensagem" }` → o front lança exceção com a mensagem.

CORS: Web App publicado como **“Quem tem acesso: Qualquer pessoa”** (padrão atual do FGP).

---

## 4. Checklist de otimização no `handleDrivePostRequest_`

Marque no projeto **Notificações** (arquivo Drive no Apps Script, não está neste repo):

### A. Medir (Registro de execução)

1. [ ] Rodar um `drive_upload` de PDF ~100 KB e anotar tempo total.
2. [ ] Logar subetapas: validar secret → resolver pasta → `Drive.Files.create` → PATCH Supabase → lixo (`previousDriveFileId`).

### B. Pastas no Drive (maior ganho recorrente)

3. [ ] **Cachear IDs de pasta** em `CacheService` ou `PropertiesService` (chave: `environment` + segmentos de `folderPath`), TTL 24–72 h.
4. [ ] Evitar `getFoldersByName` em cadeia a cada upload; criar pasta só se o ID não estiver no cache.
5. [ ] Para assistência, chave estável: `FGP[-DEV]/assistencias/{id}/orcamento`.

### C. Upload do arquivo

6. [ ] Usar **Advanced Drive API** `Drive.Files.create` com `uploadType=multipart` ou `media` + metadata mínima (evitar cópias intermediárias).
7. [ ] Decodificar base64 uma vez; não re-encodar para Supabase.
8. [ ] Substituir arquivo: `update` no mesmo `fileId` quando `previousDriveFileId` existir, em vez de create + delete.

### D. Supabase

9. [ ] **Um único PATCH** na linha `driveFileRowId` com `ingestStatus: ready`, `driveFileId`, `url`, limpar `ingestError`.
10. [ ] Usar `service_role` da propriedade correta (`SUPABASE_URL_DEV` / `_PROD`).
11. [ ] Não fazer GET desnecessário antes do PATCH (o front já criou a linha `pending`).

### E. Cold start

12. [ ] Publicar Web App com **nova versão** após mudanças.
13. [ ] Confirmar `drive_warm` &lt; 1 s no Network (após deploy do `FormighieriNotificacoes.gs`).
14. [ ] Opcional: trigger time-based leve só em horário comercial (custo x benefício).

### F. Pós-deploy FGP

15. [ ] Copiar URL `/exec` para `js/core/config.js` se o deployment mudou.
16. [ ] Hard refresh no FGP; upload de assistência deve mostrar um `exec` mais curto se B–D foram feitos.

---

## 5. Teste rápido manual

1. Login no FGP → Network: deve aparecer `drive_warm` (~centenas de ms após deploy).
2. Assistência em **Orçamento** → escolher PDF pequeno → Salvar/Enviar.
3. `exec` deve ser a barra longa; `DriveFile` no Supabase várias requisições curtas até `ready`.
4. Botão **Ver** abre preview do Drive (`resolveDriveFilePdfBrowserOpenUrl`).

---

## 6. Sincronizar cópia no repo

O roteador `scripts/FormighieriNotificacoes.gs` é referência; o código vivo está em script.google.com. Após editar lá:

1. Implantar → **Nova versão** do Web App.
2. Atualizar este arquivo no git quando mudar `doPost` / `drive_warm`.
