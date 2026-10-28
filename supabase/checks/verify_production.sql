-- =============================================================================
-- Conferência do banco definitivo — SOMENTE LEITURA (não altera nada).
-- Rodar no SQL Editor do Supabase e copiar o resultado (não mostra e-mails,
-- nomes, senhas nem valores financeiros; apenas contagens e sim/não).
-- =============================================================================
with expected_tables(name) as (values
  ('organizations'),('profiles'),('audit_logs'),('services'),('clients'),('contracts'),('projects'),
  ('commission_policies'),('receivables'),('receipts'),('payables'),('cash_movements'),
  ('commission_entitlements'),('notifications'),('integration_events'),('task_groups'),('tasks'),
  ('task_events'),('push_subscriptions')
)
select '01 Tabelas esperadas presentes' as item,
       (select count(*) from expected_tables e where to_regclass('public.' || e.name) is not null)::text || ' de ' || (select count(*) from expected_tables)::text as valor
union all select '02 Tabelas public SEM RLS (deve ser 0)',
       (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity)::text
union all select '03 Tabelas public no total',
       (select count(*) from pg_tables where schemaname = 'public')::text
union all select '04 Migration 0014 (tarefas) aplicada',
       case when to_regprocedure('public.create_task(jsonb)') is not null then 'sim' else 'NÃO' end
union all select '05 Migration 0015 (push) aplicada',
       case when to_regprocedure('public.claim_push_batch(integer)') is not null then 'sim' else 'NÃO' end
union all select '06 Organização ONE configurada',
       (select count(*) from public.organizations where slug = 'one-studio-digital')::text
union all select '07 Grupos de tarefa iniciais',
       (select count(*) from public.task_groups)::text
union all select '08 Política de comissão (situação)',
       coalesce((select string_agg(status::text, ', ') from public.commission_policies), 'nenhuma')
union all select '09 Usuários em Authentication',
       (select count(*) from auth.users)::text
union all select '10 Perfis por papel/situação',
       coalesce((select string_agg(role::text || '/' || status::text || ': ' || n, '; ' order by role, status)
                   from (select role, status, count(*) n from public.profiles group by 1, 2) x), 'nenhum')
union all select '11 Usuários de Auth SEM perfil no app',
       (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id))::text
union all select '12 Perfis SEM usuário de Auth (deve ser 0)',
       (select count(*) from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id))::text
union all select '13 Administradores com MFA verificado',
       (select count(distinct p.id) from public.profiles p join auth.mfa_factors f on f.user_id = p.id and f.status = 'verified'
         where p.role = 'admin')::text
union all select '14 Bootstrap de admin registrado na auditoria',
       (select count(*) from public.audit_logs where action = 'admin_bootstrapped')::text
union all select '15 Registros operacionais (clientes/contratos/cobranças)',
       (select count(*) from public.clients)::text || ' / ' || (select count(*) from public.contracts)::text || ' / ' || (select count(*) from public.receivables)::text
union all select '16 Schema de testes presente (deve ser NÃO)',
       case when to_regnamespace('tests') is not null then 'SIM — remover' else 'NÃO' end
union all select '17 Migrations registradas',
       case when to_regclass('supabase_migrations.schema_migrations') is null then 'nenhuma (aplicadas pelo SQL Editor?)'
            else (xpath('//v/text()', query_to_xml(
              'select count(*) || '': '' || coalesce(string_agg(right(version, 2), '','' order by version), '''') as v from supabase_migrations.schema_migrations',
              false, false, '')))[1]::text end
order by 1;
