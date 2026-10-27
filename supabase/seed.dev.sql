-- =============================================================================
-- DADOS DE DEMONSTRAÇÃO — SOMENTE DESENVOLVIMENTO LOCAL.  NÃO APLICAR EM
-- HOMOLOGAÇÃO OU PRODUÇÃO. Todos os registros usam domínio reservado
-- example.test e o prefixo "[DEMO]".
-- Uso: psql "$LOCAL_DB_URL" -f supabase/seed.dev.sql
-- Senha dos usuários demo (somente local): definida pelo Supabase Studio local.
-- =============================================================================
do $$
declare v_org uuid; v_admin uuid := '00000000-0000-4000-8000-0000000000a1'; v_seller uuid := '00000000-0000-4000-8000-0000000000b1';
begin
  if current_database() not in ('postgres', 'one_control_dev') or exists (select 1 from public.profiles where email not like '%@example.test') then
    raise exception 'seed.dev.sql recusado: banco não parece ser local/limpo';
  end if;
  select id into v_org from public.organizations where slug = 'one-studio-digital';
  insert into auth.users (id, email) values (v_admin, 'admin.demo@example.test'), (v_seller, 'vendedor.demo@example.test')
  on conflict do nothing;
  insert into public.profiles (id, organization_id, full_name, email, role, status) values
    (v_admin, v_org, '[DEMO] Administrador', 'admin.demo@example.test', 'admin', 'active'),
    (v_seller, v_org, '[DEMO] Vendedor', 'vendedor.demo@example.test', 'seller', 'active')
  on conflict do nothing;
  insert into public.cash_accounts (organization_id, name, account_type, opening_balance, opening_date)
  values (v_org, '[DEMO] Conta principal', 'bank', 0, current_date) on conflict do nothing;
end $$;
