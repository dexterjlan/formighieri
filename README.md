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
  config.js             # Supabase e estado global
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
