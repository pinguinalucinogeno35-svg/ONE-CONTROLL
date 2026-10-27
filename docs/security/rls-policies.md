# Estratégia de RLS

1. `revoke all` de `anon`/`authenticated` em tabelas, sequências e funções; privilégios padrão revogados.
2. RLS habilitada em **todas** as tabelas de `public`.
3. `authenticated` recebe `SELECT` (filtrado) e somente as colunas de escrita necessárias.
4. Policies separadas por operação (SELECT/INSERT/UPDATE/DELETE). DELETE só existe para
   `client_service_interests`. Nenhuma tabela financeira aceita INSERT/UPDATE/DELETE direto.
5. Toda policy combina: `organization_id = private.current_organization_id()` (que já exige
   perfil ativo) + escopo (`is_active_admin()` ou propriedade).
6. Helpers em `private` (não exposto), `SECURITY DEFINER`, `stable`, `search_path = ''`,
   nomes qualificados, `EXECUTE` só para `authenticated`/`service_role`. São definer para evitar
   recursão de policies em `profiles`.
7. Chamados como `(select private.fn())` → avaliados uma vez por consulta.
8. UPDATE sempre com `USING` (linha original) e `WITH CHECK` (linha resultante).
9. Rotinas públicas `SECURITY DEFINER`: `search_path = ''`, autorização na 1ª linha,
   `EXECUTE` revogado de `PUBLIC`/`anon`; integrações/cron só para `service_role`.
10. Storage: bucket `documents` privado, **sem policies** para `authenticated`; acesso só pelo
    servidor após checar o registro vinculado sob RLS.

## Exemplo

```sql
create policy clients_select on public.clients for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin()) or seller_id = (select auth.uid())));
```

## Testes

`supabase/tests/10_rls_authorization.sql` executa SELECT/INSERT/UPDATE/DELETE como cada
papel (`set role authenticated` + claims) e verifica o **estado efetivo** dos dados
(operações negadas por RLS retornam 0 linhas, não erro).

## Ao criar uma nova tabela

`alter table … enable row level security;` + policies + grants explícitos + teste.
Rode o "Security Advisor" do Supabase após aplicar migrations.
