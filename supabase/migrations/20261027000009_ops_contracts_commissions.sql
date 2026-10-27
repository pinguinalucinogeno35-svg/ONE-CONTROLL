-- =============================================================================
-- ONE CONTROL — 0009 Rotinas transacionais: contratos e comissões
-- =============================================================================
-- Decisões (ver docs/database/financial-rules.md):
--  * Taxas por origem vêm SEMPRE da política (nunca do payload do cliente).
--  * A taxa é congelada no contrato na aprovação (commission_rate_bps).
--  * Base e fato gerador vêm da política do contrato, se ativa; senão, da
--    política ativa na data do recebimento. Sem política ativa → somente
--    simulação provisória; nenhuma comissão a pagar é gerada.
--  * Os valores de cabeçalho do contrato (implementação/mensalidade) são a
--    referência autoritativa de cobrança; contract_services é descritivo.
-- =============================================================================

create or replace function private.rate_for_origin(p_policy public.commission_policies, p_origin public.sale_origin)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_origin
           when 'direct' then p_policy.direct_rate_bps
           when 'referral' then p_policy.referral_rate_bps
           when 'second_level_referral' then p_policy.second_level_rate_bps
         end;
$$;

-- Política vigente (ativa) em uma data.
create or replace function private.active_policy(p_org uuid, p_date date)
returns public.commission_policies
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.commission_policies
   where organization_id = p_org and status = 'active'
     and effective_from <= p_date and (effective_until is null or effective_until >= p_date)
   order by effective_from desc limit 1;
$$;

-- Política para simulação: ativa, ou o rascunho mais recente (provisória).
create or replace function private.estimation_policy(p_org uuid)
returns public.commission_policies
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.commission_policies
   where organization_id = p_org and status in ('active', 'draft')
   order by (status = 'active') desc, created_at desc limit 1;
$$;

create or replace function public.calculate_commission_estimate(p_sale_origin public.sale_origin, p_base numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record; pol public.commission_policies; v_rate int;
begin
  select * into a from private.require_active_user();
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

create or replace function private.contract_snapshot(p_contract_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(k) || jsonb_build_object(
    'services', coalesce((select jsonb_agg(to_jsonb(s) - 'contract_id') from public.contract_services s where s.contract_id = k.id), '[]'::jsonb),
    'referral', (select to_jsonb(r) - 'contract_id' from public.contract_referrals r where r.contract_id = k.id))
  from public.contracts k where k.id = p_contract_id;
$$;

-- Aplica itens e indicação a partir do payload, validando escopo organizacional.
create or replace function private.apply_contract_children(p_org uuid, p_contract_id uuid, p_actor uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_item jsonb; v_origin public.sale_origin; v_ref jsonb;
begin
  delete from public.contract_services where contract_id = p_contract_id;
  for v_item in select * from jsonb_array_elements(coalesce(p -> 'services', '[]'::jsonb)) loop
    if not exists (select 1 from public.services where id = (v_item ->> 'service_id')::uuid and organization_id = p_org) then
      raise exception 'Serviço inválido' using errcode = '22023';
    end if;
    insert into public.contract_services (contract_id, service_id, description, quantity, unit_amount)
    values (p_contract_id, (v_item ->> 'service_id')::uuid, private.text_or_null(v_item, 'description', 500),
            coalesce(nullif(v_item ->> 'quantity', '')::numeric(12,2), 1),
            private.money_from_json(v_item, 'unit_amount', false));
  end loop;

  v_origin := coalesce(nullif(p ->> 'sale_origin', ''), 'direct')::public.sale_origin;
  v_ref := coalesce(p -> 'referral', '{}'::jsonb);
  delete from public.contract_referrals where contract_id = p_contract_id;
  if v_origin <> 'direct' then
    if nullif(v_ref ->> 'first_referrer_client_id', '') is not null and not exists (
         select 1 from public.clients where id = (v_ref ->> 'first_referrer_client_id')::uuid and organization_id = p_org) then
      raise exception 'Cliente indicador inválido' using errcode = '22023';
    end if;
    if nullif(v_ref ->> 'second_referrer_client_id', '') is not null and not exists (
         select 1 from public.clients where id = (v_ref ->> 'second_referrer_client_id')::uuid and organization_id = p_org) then
      raise exception 'Indicação intermediária inválida' using errcode = '22023';
    end if;
  end if;
  insert into public.contract_referrals (contract_id, origin_type, first_referrer_client_id, second_referrer_client_id,
                                         external_referrer_name, notes, created_by)
  values (p_contract_id, v_origin,
          case when v_origin <> 'direct' then nullif(v_ref ->> 'first_referrer_client_id', '')::uuid end,
          case when v_origin = 'second_level_referral' then nullif(v_ref ->> 'second_referrer_client_id', '')::uuid end,
          case when v_origin <> 'direct' then private.text_or_null(v_ref, 'external_referrer_name', 160) end,
          private.text_or_null(v_ref, 'notes', 1000), p_actor);
end;
$$;

-- Valida e grava os campos comerciais editáveis do contrato.
create or replace function private.contract_fields(p jsonb, p_is_admin boolean)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare r jsonb;
begin
  r := jsonb_build_object(
    'implementation_amount', coalesce(private.money_from_json(p, 'implementation_amount', false), 0),
    'monthly_amount', coalesce(private.money_from_json(p, 'monthly_amount', false), 0),
    'start_date', (p ->> 'start_date')::date,
    'delivery_due_date', nullif(p ->> 'delivery_due_date', '')::date,
    'delivery_date_justification', case when p_is_admin then private.text_or_null(p, 'delivery_date_justification', 500) end,
    'recurring_start_date', nullif(p ->> 'recurring_start_date', '')::date,
    'billing_day', nullif(p ->> 'billing_day', '')::int,
    'billing_frequency', nullif(p ->> 'billing_frequency', ''),
    'sale_origin', coalesce(nullif(p ->> 'sale_origin', ''), 'direct'),
    'notes', private.text_or_null(p, 'notes', 4000),
    'project_id', nullif(p ->> 'project_id', ''));
  if r ->> 'start_date' is null then raise exception 'Data de início obrigatória' using errcode = '22023'; end if;
  if (r ->> 'implementation_amount')::numeric = 0 and (r ->> 'monthly_amount')::numeric = 0 then
    raise exception 'Informe valor de implementação e/ou mensalidade' using errcode = '22023';
  end if;
  if (r ->> 'delivery_due_date') is not null and (r ->> 'delivery_due_date')::date < (r ->> 'start_date')::date
     and r ->> 'delivery_date_justification' is null then
    raise exception 'Entrega antes do início exige justificativa administrativa' using errcode = '22023';
  end if;
  if (r ->> 'monthly_amount')::numeric > 0 then
    if r ->> 'recurring_start_date' is null or r ->> 'billing_day' is null then
      raise exception 'Mensalidade exige início da recorrência e dia de cobrança' using errcode = '22023';
    end if;
    r := jsonb_set(r, '{billing_frequency}', to_jsonb(coalesce(r ->> 'billing_frequency', 'monthly')));
  else
    r := r || jsonb_build_object('recurring_start_date', null, 'billing_day', null, 'billing_frequency', null);
  end if;
  return r;
end;
$$;

create or replace function public.create_contract(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record; c record; f jsonb; v_id uuid; v_seller uuid; pol public.commission_policies; v_number text;
begin
  select * into a from private.require_active_user();
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

create or replace function public.update_contract_draft(p_contract_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; k record; f jsonb; pol public.commission_policies;
begin
  select * into a from private.require_active_user();
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

create or replace function public.submit_contract(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; k record; v_company text;
begin
  select * into a from private.require_active_user();
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

create or replace function private.first_due_on_or_after(p_start date, p_billing_day int)
returns date
language sql
immutable
set search_path = ''
as $$
  select case when private.due_date_for_month(p_start, p_billing_day) >= p_start
              then private.due_date_for_month(p_start, p_billing_day)
              else private.due_date_for_month((p_start + interval '1 month')::date, p_billing_day) end;
$$;

-- Comissão gerada na aprovação (políticas com trigger_rule = on_contract_approval).
create or replace function private.accrue_commission_on_approval(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare k record; pol public.commission_policies; v_base numeric(15,2);
begin
  select * into k from public.contracts where id = p_contract_id;
  pol := private.active_policy(k.organization_id, private.today());
  if pol.id is null or pol.trigger_rule <> 'on_contract_approval' then return; end if;
  v_base := case pol.base_rule
    when 'implementation_only' then k.implementation_amount
    when 'first_month_only' then k.monthly_amount
    when 'implementation_plus_first_month' then k.implementation_amount + k.monthly_amount
    else null end;
  if v_base is null or v_base = 0 then return; end if;
  if exists (select 1 from public.commission_entitlements where contract_id = k.id and receipt_id is null
             and status not in ('cancelled', 'reversed')) then
    return;
  end if;
  insert into public.commission_entitlements (organization_id, contract_id, seller_id, policy_id, receipt_id,
    sale_origin, base_amount, rate_bps, commission_amount, status)
  values (k.organization_id, k.id, k.seller_id, pol.id, null, k.sale_origin, v_base, k.commission_rate_bps,
    private.commission_amount(v_base, k.commission_rate_bps),
    case when pol.requires_approval then 'awaiting_approval' else 'earned' end::public.commission_status);
end;
$$;

create or replace function public.approve_contract(p_contract_id uuid, p_implementation_due_date date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; k record; pol public.commission_policies; v_rate int; v_company text; v_first date;
begin
  select * into a from private.require_admin();
  select * into k from public.contracts where id = p_contract_id and organization_id = a.organization_id for update;
  if k.id is null then raise exception 'Contrato não encontrado' using errcode = 'P0002'; end if;
  if k.status not in ('draft', 'pending_approval') then
    raise exception 'Contrato não está aguardando aprovação' using errcode = '22023';
  end if;
  -- Congela a taxa: política ativa; na falta dela, as taxas oficiais do rascunho vigente.
  pol := private.active_policy(a.organization_id, private.today());
  if pol.id is null then pol := private.estimation_policy(a.organization_id); end if;
  if pol.id is null then
    raise exception 'Cadastre uma política de comissão antes de aprovar contratos' using errcode = '22023';
  end if;
  v_rate := private.rate_for_origin(pol, k.sale_origin);
  update public.contracts set status = 'approved', approved_at = now(), approved_by = a.user_id,
         commission_policy_id = pol.id, commission_rate_bps = v_rate, rejection_reason = null
   where id = k.id;

  if k.implementation_amount > 0 then
    insert into public.receivables (organization_id, client_id, contract_id, description, type, amount, due_date,
                                    competence_month, status, created_by)
    values (a.organization_id, k.client_id, k.id, 'Implementação — ' || k.contract_number, 'implementation',
            k.implementation_amount, coalesce(p_implementation_due_date, k.start_date),
            date_trunc('month', coalesce(p_implementation_due_date, k.start_date))::date, 'open', a.user_id);
  end if;
  if k.monthly_amount > 0 then
    v_first := private.first_due_on_or_after(k.recurring_start_date, k.billing_day);
    insert into public.billing_schedules (organization_id, contract_id, frequency, amount, billing_day, start_date, next_due_date)
    values (a.organization_id, k.id, k.billing_frequency, k.monthly_amount, k.billing_day, k.recurring_start_date, v_first);
  end if;

  insert into public.contract_versions (contract_id, version_number, snapshot, change_reason, changed_by)
  values (k.id, k.version + 1, private.contract_snapshot(k.id), 'Aprovação administrativa', a.user_id);
  update public.contracts set version = k.version + 1 where id = k.id;
  perform private.accrue_commission_on_approval(k.id);

  select company_name into v_company from public.clients where id = k.client_id;
  perform private.log_audit(a.organization_id, 'contract_approved', 'contracts', k.id,
    jsonb_build_object('status', k.status), jsonb_build_object('status', 'approved', 'commission_rate_bps', v_rate, 'policy_id', pol.id));
  perform private.notify(a.organization_id, k.seller_id, 'contract_approved', 'Contrato aprovado',
    k.contract_number || ' — ' || v_company, 'contracts', k.id);
end;
$$;

create or replace function public.reject_contract(p_contract_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; k record;
begin
  select * into a from private.require_admin();
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into k from public.contracts where id = p_contract_id and organization_id = a.organization_id for update;
  if k.id is null or k.status <> 'pending_approval' then
    raise exception 'Contrato não está aguardando aprovação' using errcode = '22023';
  end if;
  update public.contracts set status = 'draft', rejection_reason = left(p_reason, 1000) where id = k.id;
  perform private.log_audit(a.organization_id, 'contract_rejected', 'contracts', k.id, null, jsonb_build_object('reason', p_reason));
  perform private.notify(a.organization_id, k.seller_id, 'contract_rejected', 'Contrato devolvido para ajustes',
    k.contract_number || ': ' || left(p_reason, 300), 'contracts', k.id);
end;
$$;

-- Aditivo administrativo (gera nova versão; afeta apenas cobranças futuras).
create or replace function public.amend_contract(p_contract_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; k record; v_reason text; v_monthly numeric(15,2); v_due date; v_day int; v_end date;
begin
  select * into a from private.require_admin();
  v_reason := private.text_or_null(p, 'change_reason', 1000);
  if v_reason is null or length(v_reason) < 3 then raise exception 'Informe o motivo do aditivo' using errcode = '22023'; end if;
  select * into k from public.contracts where id = p_contract_id and organization_id = a.organization_id for update;
  if k.id is null or k.status not in ('approved', 'active') then
    raise exception 'Somente contratos aprovados/ativos recebem aditivos' using errcode = '22023';
  end if;
  v_monthly := coalesce(private.money_from_json(p, 'monthly_amount', false), k.monthly_amount);
  v_due := coalesce(nullif(p ->> 'delivery_due_date', '')::date, k.delivery_due_date);
  v_day := coalesce(nullif(p ->> 'billing_day', '')::int, k.billing_day);
  v_end := nullif(p ->> 'recurring_end_date', '')::date;
  if v_monthly <> k.monthly_amount and k.monthly_amount = 0 then
    raise exception 'Inclusão de recorrência exige novo contrato' using errcode = '22023';
  end if;
  update public.contracts set monthly_amount = v_monthly, delivery_due_date = v_due, billing_day = v_day,
         notes = coalesce(private.text_or_null(p, 'notes', 4000), notes), version = k.version + 1
   where id = k.id;
  update public.billing_schedules set amount = case when v_monthly > 0 then v_monthly else amount end,
         billing_day = coalesce(v_day, billing_day),
         end_date = coalesce(v_end, end_date),
         status = case when v_monthly = 0 then 'ended'::public.schedule_status else status end
   where contract_id = k.id and status in ('active', 'paused');
  insert into public.contract_versions (contract_id, version_number, snapshot, change_reason, changed_by)
  values (k.id, k.version + 1, private.contract_snapshot(k.id), v_reason, a.user_id);
  perform private.log_audit(a.organization_id, 'contract_amended', 'contracts', k.id,
    jsonb_build_object('monthly_amount', k.monthly_amount, 'delivery_due_date', k.delivery_due_date, 'billing_day', k.billing_day),
    jsonb_build_object('monthly_amount', v_monthly, 'delivery_due_date', v_due, 'billing_day', v_day, 'reason', v_reason));
end;
$$;

create or replace function public.cancel_contract(p_contract_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; k record;
begin
  select * into a from private.require_admin();
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into k from public.contracts where id = p_contract_id and organization_id = a.organization_id for update;
  if k.id is null or k.status = 'cancelled' then raise exception 'Contrato não encontrado ou já cancelado' using errcode = '22023'; end if;
  update public.contracts set status = 'cancelled', cancelled_at = now(), cancellation_reason = left(p_reason, 1000) where id = k.id;
  update public.billing_schedules set status = 'cancelled' where contract_id = k.id and status in ('active', 'paused');
  -- Cancela apenas cobranças futuras sem recebimento; histórico é preservado.
  update public.receivables r set status = 'cancelled', voided_at = now(), void_reason = 'Contrato cancelado'
   where r.contract_id = k.id and r.status in ('open', 'scheduled', 'overdue') and r.due_date > private.today()
     and not exists (select 1 from public.receipts x where x.receivable_id = r.id and x.reversed_at is null);
  update public.commission_entitlements set status = 'cancelled', reversal_reason = 'Contrato cancelado'
   where contract_id = k.id and status in ('estimated', 'pending_receipt');
  perform private.log_audit(a.organization_id, 'contract_cancelled', 'contracts', k.id,
    jsonb_build_object('status', k.status), jsonb_build_object('status', 'cancelled', 'reason', p_reason));
end;
$$;

-- ----------------------------------------------------------------------------
-- Políticas de comissão
-- ----------------------------------------------------------------------------
create or replace function public.activate_commission_policy(p_policy_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; pol record; cur record;
begin
  select * into a from private.require_admin();
  select * into pol from public.commission_policies where id = p_policy_id and organization_id = a.organization_id for update;
  if pol.id is null or pol.status <> 'draft' then raise exception 'Política inexistente ou não é rascunho' using errcode = '22023'; end if;
  if pol.base_rule is null or pol.trigger_rule is null then
    raise exception 'Defina base de cálculo e fato gerador antes de ativar' using errcode = '22023';
  end if;
  if pol.trigger_rule = 'on_contract_approval' and pol.base_rule in ('recurring_receipts', 'all_eligible_receipts') then
    raise exception 'Base recorrente exige fato gerador no recebimento' using errcode = '22023';
  end if;
  select * into cur from public.commission_policies where organization_id = a.organization_id and status = 'active' for update;
  if cur.id is not null then
    if pol.effective_from <= cur.effective_from then
      raise exception 'Nova política deve iniciar após a vigente' using errcode = '22023';
    end if;
    update public.commission_policies set status = 'retired', effective_until = pol.effective_from - 1 where id = cur.id;
  end if;
  update public.commission_policies set status = 'active', approved_by = a.user_id, approved_at = now() where id = pol.id;
  perform private.log_audit(a.organization_id, 'commission_policy_activated', 'commission_policies', pol.id,
    case when cur.id is not null then jsonb_build_object('retired_policy_id', cur.id) end,
    jsonb_build_object('direct', pol.direct_rate_bps, 'referral', pol.referral_rate_bps,
                       'second_level', pol.second_level_rate_bps, 'base_rule', pol.base_rule, 'trigger_rule', pol.trigger_rule));
end;
$$;

-- ----------------------------------------------------------------------------
-- Apuração de comissão por recebimento (chamada dentro de confirm_receipt)
-- ----------------------------------------------------------------------------
create or replace function private.accrue_commission_for_receipt(p_receipt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  x record; r record; k record; pol public.commission_policies; v_eligible boolean := false;
  v_first_month date; v_id uuid;
begin
  select * into x from public.receipts where id = p_receipt_id;
  select * into r from public.receivables where id = x.receivable_id;
  if r.contract_id is null then return null; end if;
  select * into k from public.contracts where id = r.contract_id;
  if k.status not in ('approved', 'active', 'completed') or k.commission_rate_bps is null then return null; end if;

  select * into pol from public.commission_policies
   where id = k.commission_policy_id and status = 'active' and base_rule is not null;
  if pol.id is null then
    pol := private.active_policy(k.organization_id, (x.received_at at time zone 'America/Bahia')::date);
  end if;
  if pol.id is null or pol.trigger_rule <> 'on_receipt' then
    return null; -- sem política ativa: nenhuma comissão a pagar (somente simulação)
  end if;

  select min(competence_month) into v_first_month from public.receivables
   where contract_id = k.id and type = 'monthly_fee' and status <> 'cancelled';

  v_eligible := case pol.base_rule
    when 'implementation_only' then r.type = 'implementation'
    when 'first_month_only' then r.type = 'monthly_fee' and r.competence_month = v_first_month
    when 'implementation_plus_first_month' then r.type = 'implementation'
                                             or (r.type = 'monthly_fee' and r.competence_month = v_first_month)
    when 'recurring_receipts' then r.type = 'monthly_fee'
    when 'all_eligible_receipts' then r.type in ('implementation', 'monthly_fee', 'additional_service')
  end;
  if v_eligible and r.type = 'monthly_fee' and pol.recurring_limit_months is not null
     and r.competence_month >= (date_trunc('month', k.recurring_start_date) + make_interval(months => pol.recurring_limit_months))::date then
    v_eligible := false;
  end if;
  if not v_eligible then return null; end if;

  insert into public.commission_entitlements (organization_id, contract_id, seller_id, policy_id, receipt_id,
    sale_origin, base_amount, rate_bps, commission_amount, status)
  values (k.organization_id, k.id, k.seller_id, pol.id, x.id, k.sale_origin, x.amount, k.commission_rate_bps,
    private.commission_amount(x.amount, k.commission_rate_bps),
    case when pol.requires_approval then 'awaiting_approval' else 'earned' end::public.commission_status)
  on conflict (receipt_id) where receipt_id is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.approve_commissions(p_entitlement_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare a record; e record; v_count int := 0;
begin
  select * into a from private.require_admin();
  for e in select * from public.commission_entitlements
            where id = any(p_entitlement_ids) and organization_id = a.organization_id
            order by id for update loop
    if e.seller_id = a.user_id then
      raise exception 'Ninguém aprova a própria comissão' using errcode = '42501';
    end if;
    if e.status not in ('earned', 'awaiting_approval') then
      raise exception 'Comissão % não está apta à aprovação (status %)', e.id, e.status using errcode = '22023';
    end if;
    update public.commission_entitlements set status = 'approved', approved_by = a.user_id, approved_at = now() where id = e.id;
    perform private.log_audit(a.organization_id, 'commission_approved', 'commission_entitlements', e.id,
      jsonb_build_object('status', e.status), jsonb_build_object('status', 'approved', 'amount', e.commission_amount));
    perform private.notify(a.organization_id, e.seller_id, 'commission_approved', 'Comissão aprovada',
      'Comissão de R$ ' || replace(e.commission_amount::text, '.', ',') || ' aprovada.', 'commission_entitlements', e.id);
    v_count := v_count + 1;
  end loop;
  if v_count <> coalesce(array_length(p_entitlement_ids, 1), 0) then
    raise exception 'Algumas comissões não foram encontradas' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

create or replace function public.cancel_commission(p_entitlement_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; e record;
begin
  select * into a from private.require_admin();
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into e from public.commission_entitlements where id = p_entitlement_id and organization_id = a.organization_id for update;
  if e.id is null then raise exception 'Comissão não encontrada' using errcode = 'P0002'; end if;
  if e.status in ('partially_paid', 'paid', 'cancelled', 'reversed') then
    raise exception 'Comissão com pagamento ou já encerrada não pode ser cancelada' using errcode = '22023';
  end if;
  update public.commission_entitlements set status = 'cancelled', reversal_reason = left(p_reason, 500) where id = e.id;
  perform private.log_audit(a.organization_id, 'commission_cancelled', 'commission_entitlements', e.id,
    jsonb_build_object('status', e.status), jsonb_build_object('status', 'cancelled', 'reason', p_reason));
end;
$$;

create or replace function private.commission_paid_amount(p_entitlement_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(i.allocated_amount), 0)::numeric(15,2)
    from public.commission_payout_items i
    join public.commission_payouts p on p.id = i.commission_payout_id and p.status = 'confirmed'
   where i.commission_entitlement_id = p_entitlement_id;
$$;

-- Pagamento de comissões (total ou parcial), com saída única de caixa.
create or replace function public.pay_commissions(
  p_seller_id uuid, p_cash_account_id uuid, p_allocations jsonb, p_paid_at timestamptz, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record; v_existing uuid; v_payout uuid; v_total numeric(15,2) := 0; v_item jsonb; e record;
  v_alloc numeric(15,2); v_paid numeric(15,2); v_pol public.commission_policies; v_name text;
begin
  select * into a from private.require_admin();
  if p_seller_id = a.user_id then raise exception 'Ninguém paga a própria comissão' using errcode = '42501'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  select id into v_existing from public.commission_payouts
   where organization_id = a.organization_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  if not exists (select 1 from public.cash_accounts where id = p_cash_account_id and organization_id = a.organization_id and active) then
    raise exception 'Conta financeira inválida' using errcode = '22023';
  end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Informe as comissões a pagar' using errcode = '22023';
  end if;
  if p_paid_at > now() + interval '1 day' then raise exception 'Data de pagamento no futuro' using errcode = '22023'; end if;

  v_payout := gen_random_uuid();
  -- Bloqueia as comissões envolvidas (ordem estável evita deadlocks).
  perform 1 from public.commission_entitlements
   where id in (select (x ->> 'entitlement_id')::uuid from jsonb_array_elements(p_allocations) x)
   order by id for update;

  for v_item in select * from jsonb_array_elements(p_allocations) loop
    select * into e from public.commission_entitlements
     where id = (v_item ->> 'entitlement_id')::uuid and organization_id = a.organization_id;
    if e.id is null or e.seller_id <> p_seller_id then
      raise exception 'Comissão não pertence ao vendedor' using errcode = '22023';
    end if;
    select * into v_pol from public.commission_policies where id = e.policy_id;
    if not (e.status in ('approved', 'partially_paid') or (e.status = 'earned' and not v_pol.requires_approval)) then
      raise exception 'Comissão % não está liberada para pagamento', e.id using errcode = '22023';
    end if;
    v_alloc := private.money_from_json(v_item, 'amount');
    if v_alloc <= 0 then raise exception 'Valor alocado inválido' using errcode = '22023'; end if;
    v_paid := private.commission_paid_amount(e.id);
    if v_paid + v_alloc > e.commission_amount then
      raise exception 'Valor excede o saldo da comissão (saldo R$ %)', e.commission_amount - v_paid using errcode = '22023';
    end if;
    v_total := v_total + v_alloc;
  end loop;

  insert into public.commission_payouts (id, organization_id, seller_id, cash_account_id, paid_amount, paid_at,
                                         confirmed_by, idempotency_key)
  values (v_payout, a.organization_id, p_seller_id, p_cash_account_id, v_total, p_paid_at, a.user_id, p_idempotency_key);

  for v_item in select * from jsonb_array_elements(p_allocations) loop
    insert into public.commission_payout_items (commission_payout_id, commission_entitlement_id, allocated_amount)
    values (v_payout, (v_item ->> 'entitlement_id')::uuid, (v_item ->> 'amount')::numeric(15,2));
    update public.commission_entitlements e2
       set status = case when private.commission_paid_amount(e2.id) >= e2.commission_amount then 'paid' else 'partially_paid' end::public.commission_status,
           approved_by = coalesce(e2.approved_by, a.user_id), approved_at = coalesce(e2.approved_at, now())
     where e2.id = (v_item ->> 'entitlement_id')::uuid;
  end loop;

  select full_name into v_name from public.profiles where id = p_seller_id;
  insert into public.cash_movements (organization_id, cash_account_id, movement_type, source_type, source_id, amount,
                                     occurred_at, description, created_by)
  values (a.organization_id, p_cash_account_id, 'debit', 'commission_payout', v_payout, v_total, p_paid_at,
          left('Pagamento de comissão — ' || v_name, 300), a.user_id);
  perform private.log_audit(a.organization_id, 'commission_paid', 'commission_payouts', v_payout, null,
    jsonb_build_object('seller_id', p_seller_id, 'amount', v_total, 'allocations', p_allocations));
  perform private.notify(a.organization_id, p_seller_id, 'commission_paid', 'Comissão paga',
    'Pagamento de R$ ' || replace(v_total::text, '.', ',') || ' registrado.', 'commission_payouts', v_payout);
  return v_payout;
end;
$$;
