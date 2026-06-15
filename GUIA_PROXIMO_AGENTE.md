# Guia do Próximo Agente (TeamSight)

## 1) Objetivo rápido do produto
TeamSight é um sistema de gestão de time (Dev, QA, PO, UX, BA, lideranças) com foco em:
- cadastro de pessoas
- acompanhamento individual (metas, 1:1, notas)
- integração Jira e GitHub
- relatórios de sprint e snapshots históricos

Regra de negócio importante: o sistema é apoio gerencial, não ranking simplista de produtividade.

## 2) Stack e arquitetura
- Frontend: Next.js 15 + React 19 + TypeScript + Ant Design + Recharts
- Backend: Fastify + TypeScript
- Banco: SQLite via Prisma
- Monorepo npm workspaces

Estrutura principal:
- `apps/frontend`
- `apps/backend`
- `packages/database`

## 3) Convenções atuais do projeto
- UI e textos para usuário: português (pt-BR)
- URLs e nomes de código: inglês
- Antd está em pt-BR via `ConfigProvider` no `providers.tsx`
- Tema dark/light global já implementado
- Padrão visual preferido: tabela + ações em modal
- Em tabelas de metas/histórico, padrão desejado é clicar na linha para editar

## 4) Rotas frontend principais
- `/login`
- `/people/progress` (acompanhamento individual)
- `/reports/jira` (relatórios Jira + dashboard + snapshots)

Observação:
- `/people` hoje redireciona para `/people/progress`.

## 5) Endpoints backend (resumo)
Auth:
- `POST /auth/login`
- `GET /auth/me`

Pessoas:
- `GET /people/metadata`
- `GET /people`
- `POST /people`
- `PATCH /people/:id`
- `POST /people/link-jira-by-email`
- `POST /people/link-integrations-auto`

Acompanhamento:
- `GET /people/:id/progress`
- `GET /people/:id/progress/jira-issue/:issueKey`
- CRUD de metas/sessões/notas em `/people/:id/progress/...`

Relatórios Jira:
- `GET /reports/jira/kanban-time`
- `GET /reports/jira/activities`
- `POST /reports/jira/snapshots`
- `GET /reports/jira/snapshots`
- `GET /reports/jira/snapshots/:id`
- `DELETE /reports/jira/snapshots/:id`
- `GET /reports/jira/issue/:issueKey/details`

## 6) Pontos críticos já ajustados
1. Loop em `auth/me` foi corrigido no hook:
   - arquivo: `apps/frontend/app/hooks/use-protected-session.ts`
   - existe trava de bootstrap e uso de `useRef` para callback de sessão inválida
2. Helpers Jira foram centralizados para reduzir duplicação:
   - arquivo: `apps/backend/src/lib/jira-common.ts`
   - `people-progress.ts` e `jira-reports.ts` já usam esse módulo
3. CORS backend permite `PATCH` (evita erro de preflight na edição)
4. Scroll lock de modal (AntD) tratado globalmente em `apps/frontend/app/providers.tsx`

## 7) Variáveis de ambiente
Backend (`apps/backend/.env`):
- `PORT`
- `JWT_SECRET`
- `FRONTEND_ORIGIN`
- `DATABASE_URL`
- `JIRA_BASE_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_STORY_POINTS_FIELD` (opcional)
- `GITHUB_TOKEN`
- `GITHUB_DEFAULT_ORG`

Frontend (`apps/frontend/.env`):
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_GITHUB_DEFAULT_ORG`

## 8) Como rodar local
Na raiz:
```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Comandos úteis:
```bash
npm run dev:backend
npm run dev:frontend
npm -w @teamsight/backend run build
npm -w @teamsight/frontend run build
npx tsc -p apps/backend/tsconfig.json --noUnusedLocals --noUnusedParameters
```

## 9) Banco e seed
- Schema: `packages/database/prisma/schema.prisma`
- Seed: `packages/database/prisma/seed.ts`
- Seed já inclui equipe padrão AllStrategy
- Usuário de referência no seed:
  - `luiz.valentin@allstrategy.com.br` com senha `123456789`
- Demais usuários seedados com senha `123456`

## 10) Organização recomendada para próximos incrementos
1. Sempre reaproveitar componentes em `apps/frontend/app/components`
2. Evitar lógica duplicada de integração Jira/Git no backend
3. Validar tipos e build antes de fechar tarefa
4. Em funcionalidades novas de dashboard, manter filtros e tabela detalhada com drilldown
5. Preservar responsividade mobile

## 11) Checklist mínimo antes de encerrar tarefa
- Build backend ok
- Build frontend ok
- Sem erro de hidratação no console
- Sem loop de `auth/me`
- Sem regressão de scroll ao abrir/fechar modal
- Textos em português e rotas em inglês

## 12) Contexto de manutenção imediata
Últimas frentes em andamento:
- componentização para reduzir acoplamento do frontend
- refinamento visual de cards/gráficos
- evolução de relatórios Jira com drilldown
- consolidação de manutenção backend (helpers comuns)

Se for mexer em autenticação ou provider global, testar login, navegação entre módulos e reabertura de modais (principalmente editor Markdown).
