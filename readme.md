# Aplicativo de gerenciamento de equipe — MVP

## Objetivo

Criar um sistema para ajudar na gestão de time técnico, centralizando informações das pessoas e gerando indicadores automáticos de produtividade e movimentação técnica com base em integrações como Jira e Git.

## Problema que o sistema resolve

Hoje muitas informações sobre o time ficam espalhadas: desempenho, contexto individual, histórico de entregas, participação em branches, versões criadas, retrabalho, movimentação em cards, observações gerenciais e sinais de sobrecarga. O objetivo do sistema é reunir isso em um só lugar para apoiar gestão, acompanhamento e tomadas de decisão.

## Visão do produto

O sistema deve permitir:

* cadastrar e manter informações dos membros do time
* registrar observações gerenciais sobre cada pessoa
* integrar com Jira para medir atividade por período
* integrar com Git para medir atividade técnica por período
* consolidar tudo em dashboards e relatórios
* permitir filtros por pessoa, squad, período, projeto e repositório

## MVP — primeira versão

### 1. Cadastro de pessoas

Cada membro pode ter:

* nome
* cargo
* senioridade
* squad/time
* projetos em que atua
* e-mail
* usuário do Jira
* usuário do Git
* data de entrada
* status ativo/inativo
* observações livres
* pontos de atenção
* metas combinadas

### 2. Anotações gerenciais

Tela para registrar informações como:

* feedbacks
* pontos fortes
* dificuldades
* acompanhamento de 1:1
* observações de performance
* riscos
* evolução ao longo do tempo

Idealmente com histórico por data.

### 3. Integração com Jira

Métricas iniciais:

* quantos cards a pessoa movimentou
* quantos cards concluiu
* quantos cards recebeu
* quantos cards ficaram parados muito tempo
* lead time médio dos cards
* quantidade por status
* quantidade por sprint
* quantidade por tipo de issue

### 4. Integração com Git

Métricas iniciais:

* quantos commits fez
* quantas branches criou
* quantas vezes mexeu em uma branch existente
* quantas PRs abriu
* quantas PRs aprovou
* quantas PRs tiveram retrabalho
* quantas releases/versões criou
* quantos merges realizou
* volume de arquivos alterados
* frequência de atividade por período

### 5. Relatórios

Relatórios iniciais:

* relatório individual por desenvolvedor
* relatório consolidado do time
* comparação por período
* evolução mensal
* ranking por atividade técnica
* resumo gerencial com destaques e alertas

### 6. Dashboard

Widgets sugeridos:

* cards concluídos por pessoa
* atividade Git por pessoa
* branches criadas por período
* releases criadas por período
* retrabalho em PRs
* membros com baixa atividade recente
* membros com maior volume de entrega

## O que medir com cuidado

Nem toda métrica representa produtividade real. O sistema deve evitar virar vigilância ou incentivar comportamento ruim.

### Métricas perigosas se usadas sozinhas

* número de commits
* quantidade de cards movidos
* quantidade de branches
* quantidade de PRs

### Métricas melhores quando contextualizadas

* entregas concluídas com qualidade
* tempo de ciclo
* retrabalho
* estabilidade das entregas
* participação em revisão
* constância ao longo do tempo
* relação entre volume e complexidade

## Regra importante do produto

O sistema deve ser um apoio à gestão, não um placar simplista de produtividade.

## Proposta de módulos

### Módulo 1 — Pessoas

Cadastro, perfil, histórico, observações, metas.

### Módulo 2 — Integrações

Conectores para Jira e Git.

### Módulo 3 — Coleta

Jobs agendados para buscar dados periodicamente.

### Módulo 4 — Normalização

Transformar dados crus em eventos padronizados.

### Módulo 5 — Métricas

Calcular indicadores por pessoa, time, período e projeto.

### Módulo 6 — Relatórios

Filtros, exportação e visualização.

### Módulo 7 — Painel gerencial

Resumo visual com alertas e tendências.

## Arquitetura 

front em next.js ( ts )

back fastify 

banco sqllite 

## Estrutura de dados inicial

### users

* id
* name
* email
* role
* seniority
* team_id
* jira_user_key
* git_username
* hired_at
* active

### teams

* id
* name
* leader_id

### notes

* id
* user_id
* author_id
* type
* title
* content
* created_at

### integrations

* id
* provider
* config_json
* active

### jira_events

* id
* external_id
* user_id
* issue_key
* action
* from_status
* to_status
* occurred_at
* raw_json

### git_events

* id
* external_id
* user_id
* repository
* branch
* action
* reference
* occurred_at
* raw_json

### metric_snapshots

* id
* user_id
* period_type
* period_start
* period_end
* metrics_json

## Fluxo de funcionamento

1. cadastrar pessoas e vínculos com Jira/Git
2. configurar integrações
3. rodar coleta periódica
4. salvar eventos crus
5. processar métricas
6. exibir dashboard e relatórios

## Exemplo de métricas calculadas

### Jira

* cards_movidos
* cards_finalizados
* cards_em_andamento
* media_dias_por_card
* cards_por_sprint

### Git

* commits_total
* branches_criadas
* branches_atualizadas
* prs_abertas
* prs_mergeadas
* reviews_feitas
* releases_criadas
* retrabalho_estimado

## Relatório individual ideal

* dados básicos
* resumo do período
* movimentação no Jira
* movimentação no Git
* comparativo com período anterior
* observações gerenciais
* alertas
* pontos de destaque

## Alertas úteis

* pessoa sem atividade recente
* excesso de retrabalho em PRs
* muitos cards iniciados e poucos concluídos
* aumento repentino de branches paralelas
* ausência de reviews

## Controle de acesso

Perfis iniciais:

* administrador
* gestor
* líder técnico
* visualizador

## Exportação

* PDF
* Excel
* CSV

## Roadmap sugerido

### Fase 1

* cadastro de pessoas
* anotações gerenciais
* integração com Jira
* dashboard básico
* relatório individual

### Fase 2

* integração com git
* comparativos por período
* ranking e alertas
* exportação

### Fase 3

* metas por pessoa

## Escopo mais inteligente para começar

Se você quiser validar rápido, comece só com:

* cadastro de pessoas
* observações
* integração com GitHub/GitLab
* relatório mensal por dev

Depois entra Jira.


## Próximo passo de implementação

Começar pelo modelo de dados, autenticação e tela de cadastro de pessoas. Em seguida, criar a integração Git e montar o primeiro relatório individual.

## Entrega inicial sugerida

Primeira entrega em formato funcional:

* login
* listagem de time
* detalhe de pessoa
* cadastro de observações
* importação/coleta Git
* dashboard simples
* relatório individual mensal

## Bootstrap atual do projeto (TeamSight)

Estrutura criada:

* `apps/frontend`: Next.js + TypeScript + Ant Design
* `apps/backend`: Fastify + TypeScript
* `packages/database`: Prisma + SQLite

### Como rodar

1. Instalar dependências:

```bash
npm install
```

2. Gerar client Prisma e criar banco local:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

3. Subir front + back juntos:

```bash
npm run dev
```

Frontend: `http://localhost:3000`
Backend: `http://localhost:3333`

### Login inicial

* e-mail: `admin@teamsight.local`
* senha: `123456`

### Variáveis de ambiente

Frontend (`apps/frontend/.env.local`):

```env
NEXT_PUBLIC_API_URL=http://localhost:3333
```

Backend (`apps/backend/.env`):

```env
PORT=3333
JWT_SECRET=teamsight-dev-secret
FRONTEND_ORIGIN=http://localhost:3000
DATABASE_URL="file:../../packages/database/prisma/dev.db"
```
