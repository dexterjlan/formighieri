# Formighieri

Sistema de comunicação de pedidos (SPA estática + Supabase).

## Estrutura

```
index.html              # Shell da aplicação
css/app.css             # Estilos customizados
partials/               # Telas e modais (HTML)
  login.html
  register.html
  main-panel.html
  modals.html
js/
  bootstrap.js          # Carrega partials e scripts
  core/
    config.dev.js       # Supabase e flags de desenvolvimento
    config.prod.js      # Supabase e flags de produção
    config.js           # Seleção automática de ambiente + estado global
  utils.js              # Funções auxiliares
  auth.js               # Login, cadastro e sessão
  navigation.js         # Navegação entre telas
  orders.js             # Pedidos de venda
  conversations.js      # Conversas técnicas
  conversations-query.js
  users-admin.js
  main.js               # Inicialização de eventos
supabase/               # Scripts SQL pontuais
```

## Executar localmente

A aplicação carrega HTML parcial via `fetch`, então é necessário um servidor HTTP:

```bash
npx serve .
```

Depois acesse `http://localhost:3000`.

## Publicar no GitHub Pages

1. Faça push deste repositório para o GitHub (branch `main`).
2. No repositório: **Settings → Pages → Build and deployment**.
3. Em **Source**, selecione **GitHub Actions** (não "Deploy from branch").
4. O workflow `.github/workflows/deploy-pages.yml` publica o site a cada push na `main`.
5. URL do projeto: `https://<usuario>.github.io/formighieri/`

Se o workflow falhar, abra a aba **Actions** no GitHub e confira o log da execução.

## Supabase

Execute migrations em `supabase/` conforme necessário (ex.: `add-response-at.sql`).

### Ambientes (dev / prod)

O app escolhe o Supabase automaticamente:

| Onde roda | Ambiente | Arquivo |
|-----------|----------|---------|
| `localhost` / `127.0.0.1` | **dev** | `js/core/config.dev.js` |
| GitHub Pages e demais hosts | **prod** | `js/core/config.prod.js` |

1. Preencha `js/core/config.prod.js` com a **URL** e a **publishable key** do projeto Supabase de produção.
2. Mantenha `js/core/config.dev.js` apontando para o projeto de desenvolvimento.
3. Em produção, `NOTIFICATION_TEST_MODE` fica `false` (e-mails vão para os destinatários reais).

Para forçar um ambiente manualmente (útil em testes):

- Query string: `?env=dev` ou `?env=prod`
- Ou no console: `localStorage.setItem('formighieri-env', 'prod')` e recarregue a página

### Checklist do Supabase PROD

1. Criar o projeto no Supabase de produção.
2. Executar os scripts SQL de `supabase/` (na ordem indicada na documentação do projeto).
3. Cadastrar usuários e perfis em `appUsers`.
4. Atualizar `config.prod.js` e publicar com push na `main` (GitHub Pages).
