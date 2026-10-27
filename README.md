# ONE CONTROL — Gestão Corporativa

PWA privado da **ONE Studio Digital** para gestão de clientes, carteiras comerciais,
contratos, projetos, comissões e financeiro (contas a receber/pagar, caixa e fluxo
de 13 semanas), com auditoria e controle de acesso em três camadas
(interface → servidor → PostgreSQL/RLS).

> Não há cadastro público. Colaboradores entram somente por convite.

## Stack

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 16 (App Router, Server Actions, Route Handlers, `proxy.ts`), React 19, TypeScript strict |
| UI | Tailwind CSS 4, componentes acessíveis próprios (padrão shadcn/ui), Lucide, Recharts |
| Formulários/validação | React Hook Form + Zod (cliente) e Zod novamente no servidor |
| Banco/Auth/Arquivos | Supabase: PostgreSQL 16, Auth (MFA TOTP), Storage privado, RLS |
| Hospedagem | Vercel (app + Cron) |
| Testes | Vitest (unitários), SQL contra PostgreSQL real (RLS/financeiro/concorrência), Playwright (E2E) |

## Estrutura

```
src/
  app/(auth)/          login, recuperar-acesso, redefinir-senha, verificar-mfa
  app/(protected)/     dashboard, clientes, contratos, projetos, financeiro/*, despesas,
                       comissoes, vendedores, relatorios, notificacoes, configuracoes, auditoria
  app/api/             files (upload/download), exports, integrations/google-forms, internal/cron
  proxy.ts             sessão Supabase, CSP com nonce, redirecionamentos, 401 em APIs
  server/              auth (sessão verificada), authorization, action (envelope), services, integrations
  features/            Server Actions + formulários por módulo
  lib/                 money (centavos), dates (America/Bahia), validation, security, supabase
supabase/
  migrations/          13 migrations versionadas (schema, RLS, rotinas, configuração inicial)
  tests/               testes SQL (RLS, contratos/comissões, financeiro, formulários)
scripts/               db-test.sh, db-concurrency-test.sh, google-forms/Code.gs, generate-icons.mjs
tests/unit, tests/e2e
docs/                  arquitetura, banco, segurança, integrações, operações
```

## Começando (desenvolvimento)

Requisitos: Node 22.12+, npm 11 (`npx npm@11.21.0`), PostgreSQL 16 (para testes SQL) e,
opcionalmente, Supabase CLI + Docker para a stack local completa.

```bash
npx -y npm@11.21.0 ci          # npm 10 tem um bug de resolução com Vitest 5
cp .env.example .env.local      # preencha com um projeto Supabase de DESENVOLVIMENTO
npm run dev
```

Banco: veja [docs/database/migrations.md](docs/database/migrations.md) (aplicar migrations) e
[docs/operations/deployment.md](docs/operations/deployment.md) (criar os 3 administradores iniciais).

## Testes

```bash
npm run lint && npm run typecheck
npm test                 # unitários (Vitest)
npm run test:db          # migrations + RLS + financeiro + concorrência em PostgreSQL local descartável
npm run build && npm run test:e2e   # E2E públicos (desktop, tablet, mobile)
```

E2E autenticados (`tests/e2e/authenticated.spec.ts`) rodam apenas contra **homologação**
com as variáveis `E2E_*` — veja `.env.example`. Relatório da última execução:
[docs/test-report.md](docs/test-report.md).

## Documentação

- Arquitetura: [overview](docs/architecture/overview.md) · [módulos](docs/architecture/modules.md) · [fluxo de dados](docs/architecture/data-flow.md) · [decisões (ADRs)](docs/architecture/decisions.md)
- Banco: [schema](docs/database/schema.md) · [relacionamentos (ER)](docs/database/relationships.md) · [migrations](docs/database/migrations.md) · [regras financeiras](docs/database/financial-rules.md)
- Segurança: [permissões](docs/security/permissions.md) · [RLS](docs/security/rls-policies.md) · [ameaças](docs/security/threat-model.md) · [checklist](docs/security/security-checklist.md) · [LGPD](docs/security/lgpd.md)
- Integrações: [Google Forms](docs/integrations/google-forms.md) · [importação](docs/integrations/imports.md)
- Operação: [deploy](docs/operations/deployment.md) · [backup/restauração](docs/operations/backup-restore.md) · [guia do administrador](docs/operations/admin-guide.md) · [guia do vendedor](docs/operations/seller-guide.md)
- [Status e pendências](docs/pending.md)

## Status

O código, as migrations e os testes estão no repositório. **Nada foi publicado em
produção e nenhuma conta externa foi alterada.** Conectar Supabase, Vercel e Google
Forms depende de credenciais e autorização da ONE — ver [docs/pending.md](docs/pending.md).
