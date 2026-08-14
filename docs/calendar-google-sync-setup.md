# Sincronização FGP → Google Calendar

Sincronização unidirecional (FGP → Google) na conta `formighieri.notificacoes@gmail.com`.

| Ambiente FGP | Calendário Google | Sync ativo por padrão |
|---|---|---|
| **Desenvolvimento** (localhost) | `FGP - Comercial (Testes)` | Sim |
| **Produção** | `FGP - Comercial` | Não (ligar em `config.prod.js` quando validado) |

Configuração por ambiente em `js/core/config.dev.js` e `js/core/config.prod.js`:
- `GOOGLE_CALENDAR_SYNC_ENABLED`
- `GOOGLE_CALENDAR_SYNC_CALENDAR_NAME`

## 1. SQL

- **Dev:** execute `supabase/add-calendar-google-sync.sql` no Supabase de desenvolvimento.
- **Prod:** execute o mesmo script no Supabase de produção (quando for ativar em prod).

## 2. Google Apps Script (projeto **Notificacoes**)

1. Abra o projeto em [script.google.com](https://script.google.com).
2. Cole o conteúdo de `scripts/FormighieriGoogleCalendar.gs` em um **arquivo novo** (ex.: `FormighieriGoogleCalendar`).
3. O **`doPost` não fica no arquivo do calendário** — está no arquivo principal do projeto (geralmente **Código.gs**). Use a busca do editor (Ctrl+F) por `doPost`, `GmailApp` ou `to_email`.
4. No início de `doPost(e)`, após `JSON.parse`, adicione:

```javascript
if (body.action && String(body.action).indexOf('calendar_') === 0) {
  return handleCalendarSyncRequest_(body);
}
```

Referência do `doPost` completo (e-mail + calendário): `scripts/FormighieriNotificacoes.gs`. Se o seu projeto **já envia e-mails**, não substitua tudo — só insira o bloco `if (calendar_)` no `doPost` existente.

5. Em **Propriedades do script** (Configurações do projeto → Propriedades do script):

| Propriedade | Valor |
|---|---|
| `SUPABASE_URL_DEV` | URL do Supabase de **desenvolvimento** |
| `SUPABASE_SERVICE_KEY_DEV` | Chave **service_role** do dev |
| `SUPABASE_URL_PROD` | URL do Supabase de **produção** |
| `SUPABASE_SERVICE_KEY_PROD` | Chave **service_role** da prod |
| `NOTIFICATION_SCRIPT_SECRET` | Mesmo segredo do `config.js` |

As propriedades legadas `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` ainda funcionam como fallback se `_DEV` / `_PROD` não existirem.

O FGP envia `environment: "dev"` ou `"prod"` em cada requisição; o script grava `googleCalendarEventId` no Supabase correto.

6. **Republicar** o Web App (Implantar → Gerenciar implantações → Nova versão).

Na primeira execução de cada ambiente, o script cria o calendário com o nome configurado se ele não existir.

## 3. Testar em desenvolvimento

1. Rode o SQL no Supabase de dev.
2. Configure as Script Properties `_DEV` (e `_PROD` quando for usar prod).
3. Abra o FGP em **localhost** (ambiente dev).
4. Como **Admin**, crie/edite um evento no Calendário ou use **Sincronizar Google**.
5. No Google Calendar da conta notificações, confira **FGP - Comercial (Testes)**.

## 4. Ativar em produção

1. Execute o SQL no Supabase de produção.
2. Em `js/core/config.prod.js`, altere `GOOGLE_CALENDAR_SYNC_ENABLED` para `true`.
3. Faça deploy do FGP.
4. Como **Admin**, use **Sincronizar Google** para carga inicial (backfill).

## 5. Compartilhar com a equipe

No Google Calendar (conta notificações):

1. Localize **FGP - Comercial** (produção)
2. Configurações do calendário → **Compartilhar com determinadas pessoas**
3. Adicione os e-mails da equipe com permissão **Ver todos os detalhes do evento** (somente leitura)

Não compartilhe o calendário de testes com a equipe, a menos que queira que vejam eventos de dev.

## Comportamento

| Ação no FGP | Google Calendar |
|---|---|
| Criar evento | Cria no calendário do ambiente |
| Editar evento | Atualiza o mesmo evento |
| Excluir evento | Remove do Google |

A sincronização é **unidirecional** (FGP → Google). Não crie eventos diretamente no Google.

## Solução de problemas

### Erro: "The script does not have permission... calendar"

O script foi autorizado **antes** só para e-mail. Ao adicionar o Calendar, é preciso **autorizar de novo** com o novo escopo.

**Passo a passo (nessa ordem):**

1. **`appsscript.json`** — inclua o escopo do calendário **sem remover** os de e-mail:

```json
{
  "timeZone": "America/Sao_Paulo",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

2. **Revogar autorização antiga** (conta `formighieri.notificacoes@gmail.com`):
   - Abra [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
   - Remova o app **Notificacoes** (ou o nome do projeto)

3. No editor Apps Script, execute **`testarSyncCalendarioDev`**
   - Deve aparecer **Revisar permissões** → autorize tudo
   - Se pedir "app não verificado": **Avançado** → **Ir para Notificacoes**

4. **Google Cloud Console** (projeto vinculado ao script):
   - [console.cloud.google.com](https://console.cloud.google.com/) → selecione o projeto do Apps Script
   - **APIs e serviços** → **Biblioteca** → busque **Google Calendar API** → **Ativar**

5. **Reimplante** o Web App (Nova versão). Em **Executar como**, use **Eu** (`formighieri.notificacoes@gmail.com`), não "Quem acessa".

6. Rode **`testarSyncCalendarioDev`** de novo. O log deve mostrar `"ok": true` e o calendário **FGP - Comercial (Testes)** deve aparecer no Google Calendar.

Se ainda falhar: confirme que está logado no Google **somente** com `formighieri.notificacoes@gmail.com` ao executar no editor (sem conta pessoal misturada).

### O evento não aparece no Google Calendar

- Confirme que o `doPost` chama `handleCalendarSyncRequest_` para ações `calendar_*`.
- Republicou o Web App (**Nova versão**)?
- Na primeira vez, o script pode pedir permissão de **Google Calendar** — autorize com a conta `formighieri.notificacoes@gmail.com`.

### O evento aparece no Google, mas `googleCalendarEventId` fica vazio no Supabase

O FGP **não recebe** o ID no navegador (`no-cors`). O Apps Script grava no Supabase em segundo plano. Causas comuns:

1. **Propriedades Supabase erradas ou ausentes** para o ambiente `dev`:
   - `SUPABASE_URL_DEV` + `SUPABASE_SERVICE_KEY_DEV`
   - Use a chave **service_role** (não a publishable do `config.dev.js`)
2. **SQL não rodado** no Supabase de dev (`add-calendar-google-sync.sql`)
3. **ID do evento inexistente** no PATCH (evento apagado ou ambiente Supabase diferente do FGP)

**Teste no Apps Script:** execute a função `testarSyncCalendarioDev` no editor (troque `fgpEventId` por um ID real) e veja o **Registro de execução**. A resposta inclui `supabaseUpdate`:

```json
{
  "ok": true,
  "googleCalendarEventId": "...",
  "supabaseUpdate": { "ok": true }
}
```

Se `supabaseUpdate.ok` for `false`, a mensagem `error` indica o que corrigir.
