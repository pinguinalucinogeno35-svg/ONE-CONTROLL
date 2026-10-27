-- Helpers de teste (somente banco local descartável).
drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to authenticated, service_role, anon;

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated, service_role, anon;

create function tests.id(p_name text) returns uuid language sql stable as $$ select id from tests.ids where name = p_name $$;

create function tests.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', tests.id(p_name), 'role', 'authenticated')::text, true);
end $$;

create function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

create function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- Executa SQL esperando erro (opcionalmente contendo um trecho na mensagem).
create function tests.throws(p_sql text, p_msg text, p_like text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_like is not null and sqlerrm not ilike '%' || p_like || '%' then
      raise exception 'FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
    end if;
    raise notice 'ok - % [%]', p_msg, left(sqlerrm, 80);
    return;
  end;
  raise exception 'FALHOU: % (não lançou erro)', p_msg;
end $$;

grant execute on all functions in schema tests to authenticated, service_role, anon;

-- Fixture: organização isolada, 3 admins, vendedores A/B, vendedor inativo, clientes.
create function tests.fixture() returns void language plpgsql as $$
declare v_org uuid := gen_random_uuid(); n text; v_id uuid;
begin
  delete from tests.ids;
  insert into public.organizations (id, legal_name, display_name, slug) values (v_org, 'Org Teste', 'Org Teste', 'org-teste-' || substr(v_org::text, 1, 8));
  insert into tests.ids values ('org', v_org);
  foreach n in array array['admin_a', 'admin_b', 'admin_c', 'seller_a', 'seller_b', 'seller_off'] loop
    v_id := gen_random_uuid();
    insert into auth.users (id, email) values (v_id, n || '.' || substr(v_id::text, 1, 8) || '@example.test');
    insert into public.profiles (id, organization_id, full_name, email, role, status)
    values (v_id, v_org, initcap(replace(n, '_', ' ')), n || '.' || substr(v_id::text, 1, 8) || '@example.test',
            case when n like 'admin%' then 'admin' else 'seller' end::public.user_role,
            case when n = 'seller_off' then 'inactive' else 'active' end::public.profile_status);
    insert into tests.ids values (n, v_id);
  end loop;
  insert into public.clients (id, organization_id, seller_id, original_seller_id, registered_by, contact_name, company_name, email, status)
  values (gen_random_uuid(), v_org, tests.id('seller_a'), tests.id('seller_a'), tests.id('seller_a'), 'Ana', 'Empresa A', 'contato@empresa-a.test', 'active')
  returning id into v_id;
  insert into tests.ids values ('client_a', v_id);
  insert into public.clients (id, organization_id, seller_id, original_seller_id, registered_by, contact_name, company_name, email, status)
  values (gen_random_uuid(), v_org, tests.id('seller_b'), tests.id('seller_b'), tests.id('seller_b'), 'Bruno', 'Empresa B', 'contato@empresa-b.test', 'active')
  returning id into v_id;
  insert into tests.ids values ('client_b', v_id);
  insert into public.cash_accounts (organization_id, name, opening_balance, opening_date)
  values (v_org, 'Conta Teste', 1000.00, current_date - 30) returning id into v_id;
  insert into tests.ids values ('account', v_id);
  insert into public.commission_policies (organization_id, name, direct_rate_bps, referral_rate_bps, second_level_rate_bps, effective_from)
  values (v_org, 'Política teste', 1250, 2000, 2500, current_date - 60) returning id into v_id;
  insert into tests.ids values ('policy', v_id);
  insert into public.financial_categories (organization_id, name, kind) values (v_org, 'Transporte', 'expense') returning id into v_id;
  insert into tests.ids values ('cat_expense', v_id);
  insert into public.financial_categories (organization_id, name, kind) values (v_org, 'Freelancer', 'direct_cost') returning id into v_id;
  insert into tests.ids values ('cat_cost', v_id);
  insert into public.services (organization_id, name, service_type) values (v_org, 'Landing Page', 'one_time') returning id into v_id;
  insert into tests.ids values ('service_lp', v_id);
end $$;
