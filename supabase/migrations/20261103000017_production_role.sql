-- =============================================================================
-- ONE CONTROL — 0017 Papel "Produção" (setor de produção criativa)
-- =============================================================================
-- Novo papel `production` para designers, filmmakers, fotógrafos, editores etc.
-- Regra de segurança: o papel de produção NÃO acessa a área comercial nem a
-- financeira (clientes da carteira, contratos, links de captação, importação,
-- despesas, comissões, configurações). O acesso a clientes virá apenas pelos
-- trabalhos atribuídos (setor de produção, migrations seguintes).
--  * Rotinas comerciais passam a exigir `require_commercial_user` (admin ou
--    vendedor). Antes, várias tratavam "não vendedor" como administrador.
--  * Gatilhos impedem que um perfil de produção seja responsável comercial
--    (cliente, contrato, link) e que alguém com carteira vire "produção".
--  * Políticas de leitura de comissão, configurações e categorias financeiras
--    passam a exigir perfil comercial.
-- Obs.: o novo valor do enum não é usado literalmente nesta migration (o
-- PostgreSQL não permite usá-lo na mesma transação em que foi criado).
-- =============================================================================

alter type public.user_role add value if not exists 'production';

-- Usuário ativo da área comercial (admin com MFA, ou vendedor).
create or replace function private.is_commercial_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.organizations o on o.id = p.organization_id and o.status = 'active'
    where p.id = (select auth.uid()) and p.status = 'active'
      and p.role::text in ('admin', 'seller')
      and (p.role::text <> 'admin' or private.session_mfa_ok()));
$$;
revoke all on function private.is_commercial_user() from public;
grant execute on function private.is_commercial_user() to authenticated, service_role;

create or replace function private.require_commercial_user(out user_id uuid, out organization_id uuid, out role public.user_role)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select r.user_id, r.organization_id, r.role into user_id, organization_id, role
  from private.require_active_user() r;
  if role::text not in ('admin', 'seller') then
    raise exception 'Área comercial indisponível para este perfil' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_commercial_user() from public;

-- Responsável comercial precisa ser administrador ou vendedor.
create or replace function private.assert_commercial_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seller_id is not null and not exists (
       select 1 from public.profiles where id = new.seller_id and role::text in ('admin', 'seller')) then
    raise exception 'Somente administradores e vendedores podem ser responsáveis comerciais' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.assert_commercial_owner() from public;

create trigger trg_clients_commercial_owner before insert or update of seller_id on public.clients
  for each row execute function private.assert_commercial_owner();
create trigger trg_contracts_commercial_owner before insert or update of seller_id on public.contracts
  for each row execute function private.assert_commercial_owner();
create trigger trg_lead_links_commercial_owner before insert or update of seller_id on public.lead_capture_links
  for each row execute function private.assert_commercial_owner();

-- Quem tem carteira não pode passar para um papel não comercial sem transferi-la.
create or replace function private.profiles_role_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and new.role::text not in ('admin', 'seller') and (
       exists (select 1 from public.clients where seller_id = old.id)
       or exists (select 1 from public.contracts where seller_id = old.id and status <> 'cancelled')
       or exists (select 1 from public.lead_capture_links where seller_id = old.id and status = 'active')) then
    raise exception 'Transfira a carteira (clientes, contratos e links) antes de mudar o papel' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.profiles_role_owner_guard() from public;
create trigger trg_profiles_role_owner_guard before update of role on public.profiles
  for each row execute function private.profiles_role_owner_guard();

-- Leituras comerciais restritas ao perfil comercial.
drop policy commission_policies_select on public.commission_policies;
create policy commission_policies_select on public.commission_policies for select to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_commercial_user()));
drop policy system_settings_select on public.system_settings;
create policy system_settings_select on public.system_settings for select to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_commercial_user()));
drop policy fin_categories_select on public.financial_categories;
create policy fin_categories_select on public.financial_categories for select to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_commercial_user())
         and ((select private.is_active_admin()) or kind = 'expense'));

-- Rotinas comerciais: idênticas às versões anteriores, exceto a verificação de
-- perfil (require_active_user → require_commercial_user). CREATE OR REPLACE
-- mantém as permissões de execução já concedidas.
-- create_client (origem: 20261027000008_ops_users_clients_leads.sql) — única mudança: require_commercial_user
create or replace function public.create_client(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; v_seller uuid; v_id uuid; v_service uuid; v_status public.client_status;
begin
  select * into a from private.require_commercial_user();
  v_seller := private.resolve_seller(a, nullif(p ->> 'seller_id', '')::uuid);
  v_status := coalesce(nullif(p ->> 'status', ''), 'lead')::public.client_status;
  if v_status not in ('lead', 'active', 'pending_completion') then
    raise exception 'Status inicial inválido' using errcode = '22023';
  end if;
  v_id := private.insert_client(a.organization_id, v_seller, a.user_id, p, v_status);
  for v_service in select (jsonb_array_elements_text(coalesce(p -> 'service_ids', '[]'::jsonb)))::uuid loop
    if not exists (select 1 from public.services where id = v_service and organization_id = a.organization_id) then
      raise exception 'Serviço inválido' using errcode = '22023';
    end if;
    insert into public.client_service_interests (client_id, service_id) values (v_id, v_service)
    on conflict do nothing;
  end loop;
  perform private.log_audit(a.organization_id, 'client_created', 'clients', v_id, null,
    jsonb_build_object('seller_id', v_seller, 'company_name', p ->> 'company_name'));
  perform private.notify_admins(a.organization_id, 'client_registered', 'Novo cliente cadastrado',
    coalesce(p ->> 'company_name', 'Cliente') || ' foi cadastrado.', 'clients', v_id);
  return v_id;
end;
$$;

-- create_lead_capture_link (origem: 20261027000008_ops_users_clients_leads.sql) — única mudança: require_commercial_user
create or replace function public.create_lead_capture_link(
  p_label text default null, p_valid_days integer default 30, p_max_uses integer default null,
  p_seller_id uuid default null)
returns table (link_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare a record; v_seller uuid; v_token text; v_form text;
begin
  select * into a from private.require_commercial_user();
  v_seller := case when a.role = 'admin' then coalesce(p_seller_id, a.user_id)
                   else private.resolve_seller(a, p_seller_id) end;
  if not exists (select 1 from public.profiles where id = v_seller and organization_id = a.organization_id and status = 'active') then
    raise exception 'Vendedor inválido' using errcode = '22023';
  end if;
  if p_valid_days is null or p_valid_days not between 1 and 90 then
    raise exception 'Validade deve estar entre 1 e 90 dias' using errcode = '22023';
  end if;
  -- 256 bits de entropia; somente o hash é persistido.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  select s.setting_value ->> 'form_id' into v_form from public.system_settings s
   where s.organization_id = a.organization_id and s.setting_key = 'google_forms.lead_form';
  link_id := gen_random_uuid();
  expires_at := now() + make_interval(days => p_valid_days);
  insert into public.lead_capture_links (id, organization_id, seller_id, external_form_id, token_hash, label,
                                         max_uses, expires_at)
  values (link_id, a.organization_id, v_seller, v_form, private.sha256_hex(v_token), left(p_label, 120),
          p_max_uses, create_lead_capture_link.expires_at);
  token := v_token;
  perform private.log_audit(a.organization_id, 'lead_link_created', 'lead_capture_links', link_id, null,
    jsonb_build_object('seller_id', v_seller));
  return next;
end;
$$;

-- import_clients_batch (origem: 20261027000008_ops_users_clients_leads.sql) — única mudança: require_commercial_user
create or replace function public.import_clients_batch(
  p_rows jsonb, p_source text, p_file_name text, p_content_hash text, p_target_seller_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record; v_seller uuid; v_job uuid; v_row jsonb; v_idx int := 0; v_ok int := 0; v_bad int := 0;
  v_errors jsonb := '[]'::jsonb; v_dup uuid; v_total int;
begin
  select * into a from private.require_commercial_user();
  v_seller := private.resolve_seller(a, coalesce(p_target_seller_id, case when a.role = 'seller' then a.user_id end));
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Formato inválido' using errcode = '22023'; end if;
  v_total := jsonb_array_length(p_rows);
  if v_total = 0 or v_total > 1000 then raise exception 'Lote deve ter entre 1 e 1000 linhas' using errcode = '22023'; end if;
  if p_source not in ('csv', 'xlsx') then raise exception 'Origem inválida' using errcode = '22023'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then raise exception 'Hash inválido' using errcode = '22023'; end if;

  begin
    insert into public.import_jobs (organization_id, source, file_name, requested_by, target_seller_id, status, total_rows, content_hash)
    values (a.organization_id, p_source, left(p_file_name, 200), a.user_id, v_seller, 'processing', v_total, p_content_hash)
    returning id into v_job;
  exception when unique_violation then
    raise exception 'Este arquivo já foi importado para esta carteira' using errcode = '23505';
  end;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    begin
      v_dup := null;
      select c.id into v_dup from public.clients c
       where c.organization_id = a.organization_id and c.seller_id = v_seller
         and ((nullif(v_row ->> 'email', '') is not null and c.email = private.normalize_email(v_row ->> 'email'))
           or (nullif(v_row ->> 'whatsapp', '') is not null and c.whatsapp = private.normalize_phone_br(v_row ->> 'whatsapp')))
       limit 1;
      if v_dup is not null then
        raise exception 'Cliente já cadastrado nesta carteira';
      end if;
      perform private.insert_client(a.organization_id, v_seller, a.user_id,
        v_row || jsonb_build_object('lead_source', coalesce(nullif(v_row ->> 'lead_source', ''), 'importacao')), 'lead');
      v_ok := v_ok + 1;
    exception when others then
      v_bad := v_bad + 1;
      if jsonb_array_length(v_errors) < 200 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('row', v_idx, 'error', left(sqlerrm, 200)));
      end if;
    end;
  end loop;

  update public.import_jobs
     set accepted_rows = v_ok, rejected_rows = v_bad, errors = case when v_bad > 0 then v_errors end,
         status = case when v_bad = 0 then 'completed' when v_ok = 0 then 'failed' else 'completed_with_errors' end::public.import_job_status,
         finished_at = now()
   where id = v_job;
  perform private.log_audit(a.organization_id, 'clients_imported', 'import_jobs', v_job, null,
    jsonb_build_object('accepted', v_ok, 'rejected', v_bad, 'seller_id', v_seller), 'import');
  return jsonb_build_object('job_id', v_job, 'total', v_total, 'accepted', v_ok, 'rejected', v_bad, 'errors', v_errors);
end;
$$;

-- revoke_lead_capture_link (origem: 20261027000008_ops_users_clients_leads.sql) — única mudança: require_commercial_user
create or replace function public.revoke_lead_capture_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record;
begin
  select * into a from private.require_commercial_user();
  update public.lead_capture_links set status = 'revoked', revoked_at = now()
   where id = p_link_id and organization_id = a.organization_id and status = 'active'
     and (a.role = 'admin' or seller_id = a.user_id);
  if not found then raise exception 'Link não encontrado' using errcode = 'P0002'; end if;
  perform private.log_audit(a.organization_id, 'lead_link_revoked', 'lead_capture_links', p_link_id);
end;
$$;

-- set_client_status (origem: 20261027000008_ops_users_clients_leads.sql) — única mudança: require_commercial_user
create or replace function public.set_client_status(p_client_id uuid, p_status public.client_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; c record;
begin
  select * into a from private.require_commercial_user();
  select * into c from public.clients where id = p_client_id and organization_id = a.organization_id for update;
  if c.id is null or (a.role = 'seller' and c.seller_id <> a.user_id) then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  if (p_status = 'archived' or c.status = 'archived') and a.role <> 'admin' then
    raise exception 'Somente administradores arquivam/desarquivam clientes' using errcode = '42501';
  end if;
  update public.clients
     set status = p_status,
         archived_at = case when p_status = 'archived' then now() else null end
   where id = c.id;
  perform private.log_audit(a.organization_id, 'client_status_changed', 'clients', c.id,
    jsonb_build_object('status', c.status), jsonb_build_object('status', p_status));
end;
$$;

-- calculate_commission_estimate (origem: 20261027000009_ops_contracts_commissions.sql) — única mudança: require_commercial_user
create or replace function public.calculate_commission_estimate(p_sale_origin public.sale_origin, p_base numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record; pol public.commission_policies; v_rate int;
begin
  select * into a from private.require_commercial_user();
  if p_base is null or p_base < 0 or p_base <> round(p_base, 2) or p_base > 9999999999999.99 then
    raise exception 'Base inválida' using errcode = '22023';
  end if;
  pol := private.estimation_policy(a.organization_id);
  if pol.id is null then
    return jsonb_build_object('available', false, 'provisional', true,
      'message', 'Nenhuma política de comissão cadastrada');
  end if;
  v_rate := private.rate_for_origin(pol, p_sale_origin);
  return jsonb_build_object(
    'available', true,
    'policy_id', pol.id, 'policy_status', pol.status, 'base_rule', pol.base_rule,
    'provisional', pol.status <> 'active' or pol.base_rule is null,
    'rate_bps', v_rate, 'base_amount', p_base,
    'commission_amount', private.commission_amount(p_base, v_rate));
end;
$$;

-- create_contract (origem: 20261027000009_ops_contracts_commissions.sql) — única mudança: require_commercial_user
create or replace function public.create_contract(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record; c record; f jsonb; v_id uuid; v_seller uuid; pol public.commission_policies; v_number text;
begin
  select * into a from private.require_commercial_user();
  select * into c from public.clients where id = (p ->> 'client_id')::uuid and organization_id = a.organization_id;
  if c.id is null or (a.role = 'seller' and c.seller_id <> a.user_id) then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  if c.status = 'archived' then raise exception 'Cliente arquivado' using errcode = '22023'; end if;
  f := private.contract_fields(p, a.role = 'admin');
  v_seller := case when a.role = 'admin' then coalesce(nullif(p ->> 'seller_id', '')::uuid, c.seller_id) else a.user_id end;
  if not exists (select 1 from public.profiles where id = v_seller and organization_id = a.organization_id and status = 'active') then
    raise exception 'Vendedor responsável inválido ou inativo' using errcode = '22023';
  end if;
  if f ->> 'project_id' is not null and not exists (
       select 1 from public.projects where id = (f ->> 'project_id')::uuid and client_id = c.id) then
    raise exception 'Projeto não pertence ao cliente' using errcode = '22023';
  end if;
  pol := private.estimation_policy(a.organization_id);
  v_number := 'ONE-' || to_char(private.today(), 'YYYY') || '-' || lpad(nextval('public.contract_number_seq')::text, 6, '0');

  insert into public.contracts (organization_id, client_id, project_id, seller_id, contract_number,
    implementation_amount, monthly_amount, start_date, delivery_due_date, delivery_date_justification,
    recurring_start_date, billing_day, billing_frequency, sale_origin, commission_policy_id, commission_rate_bps,
    status, notes, created_by)
  values (a.organization_id, c.id, (f ->> 'project_id')::uuid, v_seller, v_number,
    (f ->> 'implementation_amount')::numeric, (f ->> 'monthly_amount')::numeric, (f ->> 'start_date')::date,
    (f ->> 'delivery_due_date')::date, f ->> 'delivery_date_justification',
    (f ->> 'recurring_start_date')::date, (f ->> 'billing_day')::int, (f ->> 'billing_frequency')::public.billing_frequency,
    (f ->> 'sale_origin')::public.sale_origin, pol.id,
    case when pol.id is not null then private.rate_for_origin(pol, (f ->> 'sale_origin')::public.sale_origin) end,
    'draft', f ->> 'notes', a.user_id)
  returning id into v_id;

  perform private.apply_contract_children(a.organization_id, v_id, a.user_id, p);
  insert into public.contract_versions (contract_id, version_number, snapshot, change_reason, changed_by)
  values (v_id, 1, private.contract_snapshot(v_id), 'Criação do contrato', a.user_id);
  perform private.log_audit(a.organization_id, 'contract_created', 'contracts', v_id, null,
    jsonb_build_object('implementation_amount', f -> 'implementation_amount', 'monthly_amount', f -> 'monthly_amount',
                       'sale_origin', f -> 'sale_origin', 'seller_id', v_seller));
  if coalesce((p ->> 'submit')::boolean, false) then
    perform public.submit_contract(v_id);
  end if;
  return v_id;
end;
$$;

-- submit_contract (origem: 20261027000009_ops_contracts_commissions.sql) — única mudança: require_commercial_user
create or replace function public.submit_contract(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; k record; v_company text;
begin
  select * into a from private.require_commercial_user();
  select * into k from public.contracts where id = p_contract_id and organization_id = a.organization_id for update;
  if k.id is null or (a.role = 'seller' and k.seller_id <> a.user_id) then
    raise exception 'Contrato não encontrado' using errcode = 'P0002';
  end if;
  if k.status <> 'draft' then raise exception 'Apenas rascunhos podem ser enviados para aprovação' using errcode = '22023'; end if;
  update public.contracts set status = 'pending_approval', submitted_at = now(), rejection_reason = null where id = k.id;
  select company_name into v_company from public.clients where id = k.client_id;
  perform private.log_audit(a.organization_id, 'contract_submitted', 'contracts', k.id);
  perform private.notify_admins(a.organization_id, 'contract_pending_approval', 'Contrato aguardando aprovação',
    k.contract_number || ' — ' || v_company, 'contracts', k.id, 'contract_pending:' || k.id || ':' || k.version);
end;
$$;

-- update_contract_draft (origem: 20261027000009_ops_contracts_commissions.sql) — única mudança: require_commercial_user
create or replace function public.update_contract_draft(p_contract_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; k record; f jsonb; pol public.commission_policies;
begin
  select * into a from private.require_commercial_user();
  select * into k from public.contracts where id = p_contract_id and organization_id = a.organization_id for update;
  if k.id is null or (a.role = 'seller' and k.seller_id <> a.user_id) then
    raise exception 'Contrato não encontrado' using errcode = 'P0002';
  end if;
  if k.status not in ('draft', 'pending_approval') then
    raise exception 'Contrato aprovado só pode ser alterado por aditivo administrativo' using errcode = '42501';
  end if;
  f := private.contract_fields(p, a.role = 'admin');
  pol := private.estimation_policy(a.organization_id);
  update public.contracts set
    implementation_amount = (f ->> 'implementation_amount')::numeric, monthly_amount = (f ->> 'monthly_amount')::numeric,
    start_date = (f ->> 'start_date')::date, delivery_due_date = (f ->> 'delivery_due_date')::date,
    delivery_date_justification = coalesce(f ->> 'delivery_date_justification', case when a.role = 'admin' then null else k.delivery_date_justification end),
    recurring_start_date = (f ->> 'recurring_start_date')::date, billing_day = (f ->> 'billing_day')::int,
    billing_frequency = (f ->> 'billing_frequency')::public.billing_frequency,
    sale_origin = (f ->> 'sale_origin')::public.sale_origin, commission_policy_id = pol.id,
    commission_rate_bps = case when pol.id is not null then private.rate_for_origin(pol, (f ->> 'sale_origin')::public.sale_origin) end,
    notes = f ->> 'notes', project_id = (f ->> 'project_id')::uuid, version = k.version + 1
  where id = k.id;
  perform private.apply_contract_children(a.organization_id, k.id, a.user_id, p);
  insert into public.contract_versions (contract_id, version_number, snapshot, change_reason, changed_by)
  values (k.id, k.version + 1, private.contract_snapshot(k.id),
          coalesce(private.text_or_null(p, 'change_reason', 1000), 'Edição de rascunho'), a.user_id);
  perform private.log_audit(a.organization_id, 'contract_draft_updated', 'contracts', k.id,
    jsonb_build_object('implementation_amount', k.implementation_amount, 'monthly_amount', k.monthly_amount, 'sale_origin', k.sale_origin),
    jsonb_build_object('implementation_amount', f -> 'implementation_amount', 'monthly_amount', f -> 'monthly_amount', 'sale_origin', f -> 'sale_origin'));
end;
$$;

-- cancel_payable (origem: 20261027000010_ops_finance.sql) — única mudança: require_commercial_user
create or replace function public.cancel_payable(p_payable_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; p record;
begin
  select * into a from private.require_commercial_user();
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into p from public.payables where id = p_payable_id and organization_id = a.organization_id for update;
  if p.id is null or (a.role <> 'admin' and (p.requested_by <> a.user_id or p.status not in ('requested', 'pending_approval'))) then
    raise exception 'Lançamento não encontrado' using errcode = 'P0002';
  end if;
  if p.status in ('cancelled', 'rejected', 'paid') then raise exception 'Lançamento já encerrado' using errcode = '22023'; end if;
  if private.payable_paid_amount(p.id) > 0 then
    raise exception 'Há pagamentos ativos: estorne antes de cancelar' using errcode = '22023';
  end if;
  update public.payables set status = 'cancelled', cancelled_at = now() where id = p.id;
  perform private.log_audit(a.organization_id, 'payable_cancelled', 'payables', p.id,
    jsonb_build_object('status', p.status), jsonb_build_object('status', 'cancelled', 'reason', p_reason));
end;
$$;

-- request_expense (origem: 20261027000010_ops_finance.sql) — única mudança: require_commercial_user
create or replace function public.request_expense(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; v_id uuid;
begin
  select * into a from private.require_commercial_user();
  v_id := private.insert_payable(a, p, 'expense', 'pending_approval');
  perform private.log_audit(a.organization_id, 'expense_requested', 'payables', v_id, null,
    jsonb_build_object('amount', p ->> 'amount', 'description', p ->> 'description'));
  perform private.notify_admins(a.organization_id, 'expense_pending_approval', 'Despesa aguardando aprovação',
    left(coalesce(p ->> 'description', ''), 200) || ' — R$ ' || replace(p ->> 'amount', '.', ','), 'payables', v_id);
  return v_id;
end;
$$;

-- seller_dashboard (origem: 20261027000011_dashboards_jobs.sql) — única mudança: require_commercial_user
create or replace function public.seller_dashboard(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record; r jsonb; v_today date := private.today();
begin
  select * into a from private.require_commercial_user();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3660 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  with comm as (
    select e.*, private.commission_paid_amount(e.id) as paid
      from public.commission_entitlements e where e.seller_id = a.user_id and e.organization_id = a.organization_id)
  select jsonb_build_object(
    'total_clientes', (select count(*) from public.clients where seller_id = a.user_id and status <> 'archived'),
    'novos_clientes', (select count(*) from public.clients where seller_id = a.user_id
                        and (created_at at time zone 'America/Bahia')::date between p_from and p_to),
    'clientes_pendentes', (select count(*) from public.clients where seller_id = a.user_id and status = 'pending_completion'),
    'contratos_fechados', (select count(*) from public.contracts where seller_id = a.user_id
                        and status in ('approved', 'active', 'completed') and (approved_at at time zone 'America/Bahia')::date between p_from and p_to),
    'contratos_aguardando', (select count(*) from public.contracts where seller_id = a.user_id and status = 'pending_approval'),
    'valor_implementacao_vendido', (select coalesce(sum(implementation_amount), 0) from public.contracts where seller_id = a.user_id
                        and status in ('approved', 'active', 'completed') and (approved_at at time zone 'America/Bahia')::date between p_from and p_to),
    'valor_mensal_vendido', (select coalesce(sum(monthly_amount), 0) from public.contracts where seller_id = a.user_id
                        and status in ('approved', 'active', 'completed') and (approved_at at time zone 'America/Bahia')::date between p_from and p_to),
    'comissoes_estimadas', (select coalesce(sum(private.commission_amount(k.implementation_amount, k.commission_rate_bps)), 0)
                        from public.contracts k where k.seller_id = a.user_id and k.status in ('draft', 'pending_approval')
                          and k.commission_rate_bps is not null),
    'comissoes_adquiridas', (select coalesce(sum(commission_amount), 0) from comm where status in ('earned', 'awaiting_approval')),
    'comissoes_aprovadas', (select coalesce(sum(commission_amount - paid), 0) from comm where status in ('approved', 'partially_paid')),
    'comissoes_recebidas', (select coalesce(sum(paid), 0) from comm),
    'comissoes_pendentes', (select coalesce(sum(commission_amount - paid), 0) from comm where status not in ('cancelled', 'reversed', 'paid')),
    'projetos_em_andamento', (select count(*) from public.projects pr join public.clients c on c.id = pr.client_id
                        where c.seller_id = a.user_id and pr.status in ('approved', 'in_progress', 'in_review')),
    'proximas_entregas', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'due_date', pr.due_date, 'client', c.company_name) order by pr.due_date), '[]'::jsonb)
                        from public.projects pr join public.clients c on c.id = pr.client_id
                        where c.seller_id = a.user_id and pr.status not in ('delivered', 'cancelled')
                          and pr.due_date between v_today and v_today + 30),
    'despesas_solicitadas', (select count(*) from public.payables where requested_by = a.user_id and status in ('requested', 'pending_approval'))
  ) into r;
  return r;
end;
$$;
