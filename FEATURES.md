# Formighieri — Funcionalidades

Sistema web de comunicação e acompanhamento de pedidos de venda, com requisições técnicas e fluxo de aprovação comercial.

**Stack:** SPA estática (HTML + JavaScript) · Supabase Auth · PostgreSQL · GitHub Pages

---

## Perfis de acesso

| Perfil | Descrição |
|--------|-----------|
| **Admin** | Acesso total: pedidos, requisições, aprovações, revisões e gestão de usuários. |
| **Consultor** | Atua nos pedidos em que é o consultor responsável; responde requisições e aprova comercialmente. |
| **Projetista** | Cria requisições e aprovações comerciais; responde solicitações do consultor. |

Usuários inativos (`isActive = false`) não conseguem entrar no sistema.

---

## Autenticação

- Login com e-mail e senha (Supabase Auth).
- Cadastro de novos usuários; o perfil é definido posteriormente por um Admin.
- Vinculação automática de conta Auth ao registro em `appUsers` (por `authId` ou e-mail legado).
- Sessão persistente; logout manual pelo botão **Sair**.

---

## Pedidos de venda

### Listagem
- Coluna de pedidos com código, cliente e consultor.
- Filtro em tempo real por nome do cliente.
- Seleção de pedido abre o painel de detalhes.

### Criação
- Campos: código do pedido, cliente e consultor.
- Consultor logado só pode criar pedidos com ele mesmo como consultor.
- Admin seleciona qualquer consultor ativo.

### Detalhes do pedido
- Exibe código, cliente, consultor e quem criou o pedido.
- Duas abas com contadores de pendências:
  - **Aprovações Comerciais (N)** — aprovações que ainda não estão com status `Aprovado`.
  - **Requisições (N)** — requisições com status diferente de `Encerrado`.

---

## Requisições técnicas

Comunicação entre **Projetista** e **Consultor** vinculada a um pedido.

### Criação
- Botão **Abrir Nova Requisição** (aba Requisições).
- Campos: Projetista designado e texto da solicitação.
- O perfil da requisição é definido automaticamente pelo criador (`Projetista` ou `Consultor`); Admin escolhe manualmente.

### Status

| Status | Quando ocorre |
|--------|----------------|
| **Aguardando Consultor** | Requisição criada pelo Projetista. |
| **Aguardando Projetista** | Requisição criada pelo Consultor. |
| **Encerrado** | Após resposta do perfil responsável. |

### Respostas
- Consultor responde requisições em `Aguardando Consultor` (campo `commercialResponse`).
- Projetista responde requisições em `Aguardando Projetista` (campo `designerResponse`).
- Resposta encerra a requisição e registra data de resposta.

### Edição
- Permitida apenas enquanto a requisição não está encerrada.
- **Admin:** pode editar qualquer requisição aberta.
- **Projetista:** só edita requisições criadas por Projetista em que ele é o designado.
- **Consultor:** só edita requisições criadas por Consultor do pedido dele.

### Exibição (aba Requisições)
- Projetista e consultor do pedido.
- Título da solicitação: **Solicitação do Projetista** ou **Solicitação do Consultor**.
- Status, botão **Editar** (quando permitido) e área de resposta inline.

---

## Aprovação comercial

Fluxo para solicitar e registrar aprovação de projeto comercial vinculado ao pedido.

### Criação
- Botão **Solicitar Aprovação Comercial** (aba Aprovações Comerciais).
- Disponível para **Admin** e **Projetista**.
- Campos: Nome do Projeto e Projetista designado.

### Status

| Status | Descrição |
|--------|-----------|
| **Aguardando Aprovação** | Aguardando decisão do consultor do pedido. |
| **Em revisão** | Consultor solicitou revisão com lista de atividades. |
| **Aprovado** | Aprovação registrada com data. |

### Ações por perfil

| Ação | Quem pode |
|------|-----------|
| **Aprovar** | Admin ou consultor responsável pelo pedido (status `Aguardando Aprovação`). |
| **Solicitar Revisão** | Admin ou consultor responsável pelo pedido. |
| **Ver Revisão** | Admin, consultor do pedido ou projetista designado (status `Em revisão`). |
| **Editar** | Admin ou consultor do pedido (campos comerciais, status `Aguardando Aprovação`). |

---

## Revisão comercial

Acionada quando o consultor solicita revisão de uma aprovação comercial.

### Atividades
- Lista de atividades com descrição, responsável e conclusão.
- Consultor (ou Admin) cadastra e edita atividades.
- Projetista designado (ou Admin) marca conclusão e data.

### Enviar novamente para aprovação
- Disponível quando todas as atividades estão concluídas.
- **Projetista designado** ou **Admin** (Consultor não executa esta ação).
- Retorna o status para `Aguardando Aprovação`.

### Histórico
- Revisões anteriores exibidas nos cards de aprovação comercial.

---

## Consultas globais

### Consulta Requisições
- Filtros: pedido, cliente, status, consultor e projetista.
- Tabela com solicitação, resposta, datas e ação **Editar** (conforme permissão).
- Destaque visual por status.

### Consulta Aprovações
- Filtros: pedido, consultor, projetista e status.
- Ações inline: **Aprovar**, **Solicitar Revisão**, **Ver Revisão** e **Editar** (conforme permissão).

---

## Gestão de usuários (Admin)

- Tela **Usuários** no cabeçalho (somente Admin).
- Listagem de usuários com nome, e-mail, status e perfil.
- Alteração de perfil: Admin, Projetista ou Consultor.
- Ativação/desativação de acesso.
- Admin não pode alterar o próprio perfil pela tela.

---

## Navegação

| Tela | Acesso |
|------|--------|
| **Pedidos** | Painel principal após login. |
| **Consulta Requisições** | Cabeçalho — todos os perfis. |
| **Consulta Aprovações** | Cabeçalho — todos os perfis. |
| **Usuários** | Cabeçalho — somente Admin. |

---

## Publicação

- Deploy automático via GitHub Actions a cada push na branch `main`.
- Workflow: `.github/workflows/deploy-pages.yml`
- Site publicado no GitHub Pages.

---

## Modelo de dados (principais entidades)

| Entidade | Uso |
|----------|-----|
| `appUsers` | Usuários, perfis e vínculo com Auth. |
| `salesOrders` | Pedidos de venda (código, cliente, consultor). |
| `OrderRequest` | Requisições técnicas entre Projetista e Consultor. |
| `CommercialApproval` | Solicitações de aprovação comercial. |
| `CommercialRevision` | Revisões solicitadas pelo consultor. |
| `CommercialRevisionActivity` | Atividades de cada revisão. |
