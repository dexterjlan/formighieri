# Matrix / Element — produção

## Comportamento do FGP

| Ambiente | Envio |
|----------|--------|
| **prod** (`FORMIGHIERI_APP_ENV === 'prod'`) | Apps Script (`matrix_send` / `matrix_ping`), token **não** no navegador |
| **dev** | Apps Script (igual produção) |

Sala padrão do grupo: **`#formighieri_projetos:matrix.org`**

Todas as salas oficiais ficam em **`js/core/matrix-rooms-config.js`** (`getMatrixRoomAlias('projects')`, etc.).

Helper no código: `sendMatrixProjectsRoomMessage(texto)` em `js/core/matrix-messaging.js`.

## Erro `to_email obrigatório` no teste Matrix

O Web App **publicado** ainda está na versão antiga: o POST não entra em `matrix_ping` / `matrix_send` e cai no handler de **e-mail**. Atualize os arquivos abaixo e faça **Implantar → Nova versão** (não basta salvar o código).

## Checklist Apps Script (projeto Notificações)

1. Arquivo **`FormighieriMatrix.gs`** (conteúdo de `scripts/FormighieriMatrix.gs` no repo).
2. **`FormighieriNotificacoes.gs`** com rota `matrix_*` → `handleMatrixPostRequest_` (trecho no repo):

```javascript
if (body.action && String(body.action).indexOf('matrix_') === 0) {
  return jsonResponse_(handleMatrixPostRequest_(body));
}
```
3. **Propriedades do script:**
   - `MATRIX_ACCESS_TOKEN` — access token do bot (curta duração no matrix.org)
   - `MATRIX_REFRESH_TOKEN` — refresh token (obrigatório; renovação automática no script)
   - `MATRIX_ACCESS_TOKEN_EXPIRES_AT` — preenchido pelo script ao renovar (não editar manualmente)
   - `MATRIX_HOMESERVER_URL` — `https://matrix.org` (opcional)
   - `MATRIX_BOT_USER_ID` — `@formighieri.notificacoes:matrix.org` (opcional)

   **Obter par de tokens (uma vez):** `POST https://matrix.org/_matrix/client/v3/login` com
   `refresh_token: true` na conta do bot. Não use só o token copiado do Element (expira em ~5 min
   e não traz refresh). O `FormighieriMatrix.gs` chama `/_matrix/client/v3/refresh` antes de expirar.
4. **Implantar → Nova versão** do Web App (mesma URL em `GOOGLE_APPS_SCRIPT_URL`).

## Validar em produção

1. Login admin → **Configurações → Matrix (teste)**.
2. Deve aparecer o aviso verde “Modo produção” (sem campos de token).
3. **Testar conexão** → `matrix_ping`.
4. **Enviar na sala** `#formighieri_projetos:matrix.org`.

## SQL Supabase

Nenhum script necessário para Matrix.
