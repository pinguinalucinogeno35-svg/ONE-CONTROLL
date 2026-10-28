# Relatório de testes

Execução em 28/10/2026, ambiente de desenvolvimento em nuvem (Node 22.22, PostgreSQL 16.15, Chromium 1.63).

| Suíte | Comando | Resultado |
|---|---|---|
| Lint (ESLint + regras Next/React) | `npm run lint` | ✅ sem erros/avisos |
| Tipos (TypeScript strict) | `npm run typecheck` | ✅ |
| Unitários (Vitest) | `npm test` | ✅ 47/47 |
| SQL — migrations 0001–0015 + seed | `scripts/db-test.sh` | ✅ aplicadas em banco limpo |
| SQL — RLS/autorização | `supabase/tests/10_rls_authorization.sql` | ✅ 38 asserções |
| SQL — contratos e comissões | `supabase/tests/20_contracts_commissions.sql` | ✅ 47 asserções |
| SQL — financeiro | `supabase/tests/30_finance.sql` | ✅ 37 asserções |
| SQL — Google Forms e importação | `supabase/tests/40_forms_imports.sql` | ✅ 22 asserções |
| SQL — Tarefas, grupos e notificações | `supabase/tests/50_tasks.sql` | ✅ 29 asserções |
| SQL — Notificações push (inscrições, reserva, expiração) | `supabase/tests/60_push.sql` | ✅ 12 asserções |
| Concorrência real (sessões paralelas) | `scripts/db-concurrency-test.sh` | ✅ 6 confirmações de R$ 300 sobre R$ 1.000 → 3 aceitas (R$ 900), 3 recusadas; 5 com a mesma chave → 1; 4 despachantes de push paralelos → 20 entregas reservadas, nenhuma repetida |
| Build de produção | `npm run build` | ✅ |
| E2E públicos + identidade visual + push no service worker (desktop, tablet, mobile) | `npm run test:e2e` | ✅ 54/54 (mensagem push real via protocolo do Chromium → notificação exibida; link externo descartado) |
| E2E autenticados | `tests/e2e/authenticated.spec.ts` | ⏭️ 12 ignorados — exigem projeto Supabase de homologação (`E2E_*`) |
| Dependências | `npm audit` | ✅ 0 vulnerabilidades |

## Cobertura dos critérios de aceitação

| Cenário | Evidência | Situação |
|---|---|---|
| A — Novo cliente via formulário | SQL 40 (link → ingestão → vendedor do link, `seller_id` injetado ignorado, pendente de complementação, notificação); unit `google-forms.test.ts` (HMAC, replay, payload, falha, reprocessamento) | Testado no banco e no handler; **não conectado a um Google Form real** |
| B — Comissão R$ 2.000 direta = R$ 250 | SQL 20 e unit `money.test.ts` (250/400/500, centavos, arredondamento, base zero) | ✅ |
| C — Vendedor A acessa cliente de B | SQL 10 (SELECT/UPDATE/INSERT negados, estado verificado) | ✅ no banco; E2E por URL pendente de homologação |
| D — Despesa → aprovação → pagamento | SQL 30 (caixa só muda no pagamento, parcial, rejeição, autoaprovação negada) | ✅ |
| E — Custo de projeto | SQL 30 (indicador de custos diretos; vendedor não vê/edita) | ✅ |
| F — Mensalidade | SQL 20 (geração idempotente, dia 31 em meses curtos, uma por competência) | ✅ |
| G — Paga R$ 400 de R$ 1.000 | SQL 30 (parcialmente paga, saldo R$ 600) | ✅ |
| H — Contratado ≠ previsto ≠ recebido | SQL 30 (saldo = movimentos confirmados; projeção consistente) | ✅ |
| I — Comissão de 100% no corpo | SQL 20 + unit `schemas-import.test.ts` | ✅ |
| J — Correção auditada | SQL 30 (estorno preserva original, ajuste, movimento compensatório, auditoria imutável) | ✅ |

## Limitações do ambiente de teste
- Não havia Supabase (Auth/PostgREST/Storage) disponível; a execução de binários externos foi
  bloqueada pela política do ambiente. Por isso as telas autenticadas e as chamadas reais via
  PostgREST/Storage **não foram exercitadas** — apenas compiladas, tipadas e revisadas.
  O banco usa um stub mínimo de `auth`/`storage` (`supabase/tests/local_bootstrap.sql`).
- E2E autenticados devem rodar em homologação antes do go-live.
- Push: a entrega pelo serviço do navegador (FCM/Mozilla/Apple) exige chaves VAPID e o app publicado
  com HTTPS; aqui foram testados o banco, o despacho (com `web-push` simulado) e o service worker.
