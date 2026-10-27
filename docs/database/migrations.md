# Migrations

Ordem (dependências resolvidas por número):

| Arquivo | Conteúdo |
|---|---|
| 0001_foundation | schemas `private`/`extensions`, pgcrypto, enums, utilitários (normalização, CNPJ, comissão, vencimento) |
| 0002_organizations_profiles_audit | organizations, profiles, convites, audit_logs, helpers de autorização |
| 0003_services_clients | serviços, clientes (normalização, guarda de responsável), interesses, transferências |
| 0004_projects_contracts_commission_policies | políticas, projetos, tarefas, contratos, itens, versões, indicações |
| 0005_finance_commissions | categorias, contas, caixa, agendas, recebíveis, recebimentos, pagáveis, pagamentos, ajustes, comissões |
| 0006_integrations_platform | links, respostas, importações, idempotência, eventos, anexos, notificações, configurações |
| 0007_rls_grants | revogações, grants por coluna, RLS e policies |
| 0008_ops_users_clients_leads | rotinas de usuários, clientes, captação e importação |
| 0009_ops_contracts_commissions | rotinas de contratos, políticas e comissões |
| 0010_ops_finance | rotinas financeiras |
| 0011_dashboards_jobs | indicadores, fluxo de 13 semanas, rotina diária, consulta LGPD |
| 0012_storage_function_grants | bucket privado, registro de anexos, EXECUTE por papel |
| 0013_initial_configuration | organização ONE, serviços, categorias, política inicial (rascunho), settings |

## Aplicar em um projeto Supabase

```bash
supabase login
supabase link --project-ref <ref-do-projeto>     # homologação primeiro
supabase db push                                 # aplica supabase/migrations em ordem
```

Ou cole cada arquivo, em ordem, no SQL Editor. **Nunca** aplique `supabase/tests/local_bootstrap.sql`
em um projeto Supabase (é um stub para PostgreSQL puro).

## Testar localmente sem Supabase

```bash
npm run test:db     # cria banco descartável one_control_test, aplica tudo e roda supabase/tests/*.sql
```

## Regras

- Migrations são imutáveis depois de aplicadas em homologação: correções = nova migration.
- Nada destrutivo (`drop`, `truncate`) em bancos existentes sem autorização explícita.
- Toda nova tabela em `public`: RLS habilitada (a migration 0007 faz para as existentes),
  grants explícitos, índices nas FKs e testes em `supabase/tests`.
