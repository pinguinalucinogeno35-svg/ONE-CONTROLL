-- =============================================================================
-- ONE CONTROL — 0010 Rotinas transacionais financeiras
-- (cobranças, recebimentos, despesas/custos, pagamentos, estornos, caixa)
-- =============================================================================

create or replace function private.receivable_paid_amount(p_receivable_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::numeric(15,2) from public.receipts
   where receivable_id = p_receivable_id and reversed_at is null;
$$;

create or replace function private.payable_paid_amount(p_payable_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::numeric(15,2) from public.outgoing_payments
   where payable_id = p_payable_id and reversed_at is null;
$$;

-- Status operacional derivado dos recebimentos (fonte única de verdade = receipts).
create or replace function private.refresh_receivable_status(p_receivable_id uuid)
returns public.receivable_status
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_paid numeric(15,2); v_status public.receivable_status;
begin
  select * into r from public.receivables where id = p_receivable_id;
  if r.status = 'cancelled' then return r.status; end if;
  v_paid := private.receivable_paid_amount(r.id);
  v_status := case
    when v_paid >= r.amount then 'paid'
    when v_paid > 0 then 'partially_paid'
    when r.due_date < private.today() then 'overdue'
    else 'open' end;
  if v_status <> r.status then
    update public.receivables set status = v_status where id = r.id;
  end if;
  return v_status;
end;
$$;

create or replace function private.refresh_payable_status(p_payable_id uuid)
returns public.payable_status
language plpgsql
security definer
set search_path = ''
as $$
declare p record; v_paid numeric(15,2); v_status public.payable_status;
begin
  select * into p from public.payables where id = p_payable_id;
  if p.status in ('cancelled', 'rejected', 'requested', 'pending_approval') then return p.status; end if;
  v_paid := private.payable_paid_amount(p.id);
  v_status := case when v_paid >= p.amount then 'paid' when v_paid > 0 then 'partially_paid' else 'approved' end;
  if v_status <> p.status then update public.payables set status = v_status where id = p.id; end if;
  return v_status;
end;
$$;

-- ----------------------------------------------------------------------------
-- Contas a receber
-- ----------------------------------------------------------------------------
create or replace function public.create_receivable(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; c record; v_id uuid; v_type public.receivable_type; v_contract uuid;
begin
  select * into a from private.require_admin();
  select * into c from public.clients where id = (p ->> 'client_id')::uuid and organization_id = a.organization_id;
  if c.id is null then raise exception 'Cliente não encontrado' using errcode = 'P0002'; end if;
  v_type := coalesce(nullif(p ->> 'type', ''), 'additional_service')::public.receivable_type;
  if v_type in ('implementation', 'monthly_fee') then
    raise exception 'Implementação e mensalidades são geradas pelo contrato' using errcode = '22023';
  end if;
  v_contract := nullif(p ->> 'contract_id', '')::uuid;
  if v_contract is not null and not exists (
       select 1 from public.contracts where id = v_contract and client_id = c.id and status in ('approved', 'active', 'completed')) then
    raise exception 'Contrato inválido para cobrança' using errcode = '22023';
  end if;
  if private.money_from_json(p, 'amount') <= 0 then raise exception 'Valor deve ser positivo' using errcode = '22023'; end if;
  insert into public.receivables (organization_id, client_id, contract_id, description, type, amount, due_date,
                                  competence_month, status, external_reference, created_by)
  values (a.organization_id, c.id, v_contract, coalesce(private.text_or_null(p, 'description', 300), 'Cobrança avulsa'),
          v_type, private.money_from_json(p, 'amount'), (p ->> 'due_date')::date,
          date_trunc('month', (p ->> 'due_date')::date)::date, 'open',
          private.text_or_null(p, 'external_reference', 120), a.user_id)
  returning id into v_id;
  perform private.refresh_receivable_status(v_id);
  perform private.log_audit(a.organization_id, 'receivable_created', 'receivables', v_id, null,
    jsonb_build_object('amount', p ->> 'amount', 'type', v_type, 'client_id', c.id));
  return v_id;
end;
$$;

create or replace function public.cancel_receivable(p_receivable_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; r record;
begin
  select * into a from private.require_admin();
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into r from public.receivables where id = p_receivable_id and organization_id = a.organization_id for update;
  if r.id is null or r.status = 'cancelled' then raise exception 'Cobrança não encontrada ou já cancelada' using errcode = '22023'; end if;
  if private.receivable_paid_amount(r.id) > 0 then
    raise exception 'Cobrança com recebimentos ativos: estorne antes de cancelar' using errcode = '22023';
  end if;
  update public.receivables set status = 'cancelled', voided_at = now(), void_reason = left(p_reason, 500) where id = r.id;
  insert into public.financial_adjustments (organization_id, source_type, source_id, adjustment_type, amount, reason, approved_by)
  values (a.organization_id, 'receivable', r.id, 'void', r.amount, p_reason, a.user_id);
  perform private.log_audit(a.organization_id, 'receivable_cancelled', 'receivables', r.id,
    jsonb_build_object('status', r.status), jsonb_build_object('status', 'cancelled', 'reason', p_reason));
end;
$$;

-- Geração idempotente de mensalidades até p_until. Admin ou service_role (cron).
create or replace function public.generate_due_receivables(p_until date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid; s record; k record; v_due date; v_until date; v_count int := 0; v_step int; v_competence date; v_id uuid;
begin
  if private.is_service_role() then
    v_org := null;
  else
    select organization_id into v_org from private.require_admin();
  end if;
  v_until := coalesce(p_until, private.today() + 30);
  if v_until > private.today() + 400 then raise exception 'Horizonte máximo de geração: 400 dias' using errcode = '22023'; end if;

  for s in select * from public.billing_schedules
            where status = 'active' and next_due_date is not null and next_due_date <= v_until
              and (v_org is null or organization_id = v_org)
            order by id for update skip locked loop
    select * into k from public.contracts where id = s.contract_id;
    if k.status not in ('approved', 'active') then continue; end if;
    v_step := case s.frequency when 'monthly' then 1 when 'quarterly' then 3 else 12 end;
    v_due := s.next_due_date;
    while v_due <= v_until and (s.end_date is null or v_due <= s.end_date) loop
      v_competence := date_trunc('month', v_due)::date;
      insert into public.receivables (organization_id, client_id, contract_id, billing_schedule_id, description, type,
                                      amount, due_date, competence_month, status)
      values (s.organization_id, k.client_id, k.id, s.id,
              'Mensalidade ' || to_char(v_competence, 'MM/YYYY') || ' — ' || k.contract_number,
              'monthly_fee', s.amount, v_due, v_competence, 'open')
      on conflict (billing_schedule_id, competence_month) where billing_schedule_id is not null do nothing
      returning id into v_id;
      if v_id is not null then
        v_count := v_count + 1;
        perform private.refresh_receivable_status(v_id);
      end if;
      v_id := null;
      v_due := private.due_date_for_month((v_competence + make_interval(months => v_step))::date, s.billing_day);
    end loop;
    update public.billing_schedules
       set next_due_date = case when s.end_date is not null and v_due > s.end_date then null else v_due end,
           status = case when s.end_date is not null and v_due > s.end_date then 'ended'::public.schedule_status else status end
     where id = s.id;
    if k.status = 'approved' then
      update public.contracts set status = 'active' where id = k.id and status = 'approved';
    end if;
  end loop;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- Recebimentos
-- ----------------------------------------------------------------------------
create or replace function public.confirm_receipt(
  p_receivable_id uuid, p_cash_account_id uuid, p_amount numeric, p_payment_method public.payment_method,
  p_received_at timestamptz, p_reference text, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; r record; v_existing record; v_id uuid; v_balance numeric(15,2); v_company text; v_commission uuid;
begin
  select * into a from private.require_admin();
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Valor inválido' using errcode = '22023';
  end if;
  if p_received_at is null or p_received_at > now() + interval '1 day' then
    raise exception 'Data de recebimento inválida' using errcode = '22023';
  end if;

  -- Bloqueio da cobrança serializa confirmações concorrentes.
  select * into r from public.receivables where id = p_receivable_id and organization_id = a.organization_id for update;
  if r.id is null then raise exception 'Cobrança não encontrada' using errcode = 'P0002'; end if;

  select * into v_existing from public.receipts where organization_id = a.organization_id and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.receivable_id <> r.id or v_existing.amount <> p_amount then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = '23505';
    end if;
    return v_existing.id; -- repetição segura
  end if;

  if r.status = 'cancelled' then raise exception 'Cobrança cancelada' using errcode = '22023'; end if;
  if not exists (select 1 from public.cash_accounts where id = p_cash_account_id and organization_id = a.organization_id and active) then
    raise exception 'Conta financeira inválida' using errcode = '22023';
  end if;
  v_balance := r.amount - private.receivable_paid_amount(r.id);
  if p_amount > v_balance then
    raise exception 'Valor excede o saldo devido (R$ %)', v_balance using errcode = '22023';
  end if;

  insert into public.receipts (organization_id, receivable_id, cash_account_id, amount, payment_method, received_at,
                               confirmed_by, reference, idempotency_key)
  values (a.organization_id, r.id, p_cash_account_id, p_amount, p_payment_method, p_received_at, a.user_id,
          left(p_reference, 120), p_idempotency_key)
  returning id into v_id;

  select company_name into v_company from public.clients where id = r.client_id;
  insert into public.cash_movements (organization_id, cash_account_id, movement_type, source_type, source_id, amount,
                                     occurred_at, description, created_by)
  values (a.organization_id, p_cash_account_id, 'credit', 'receipt', v_id, p_amount, p_received_at,
          left('Recebimento — ' || r.description || ' — ' || v_company, 300), a.user_id);

  perform private.refresh_receivable_status(r.id);
  v_commission := private.accrue_commission_for_receipt(v_id);
  perform private.log_audit(a.organization_id, 'receipt_confirmed', 'receipts', v_id, null,
    jsonb_build_object('receivable_id', r.id, 'amount', p_amount, 'cash_account_id', p_cash_account_id,
                       'commission_entitlement_id', v_commission));
  return v_id;
end;
$$;

create or replace function public.reverse_receipt(p_receipt_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; x record; v_adj uuid; e record;
begin
  select * into a from private.require_admin();
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into x from public.receipts where id = p_receipt_id and organization_id = a.organization_id;
  if x.id is null then raise exception 'Recebimento não encontrado' using errcode = 'P0002'; end if;
  perform 1 from public.receivables where id = x.receivable_id for update;
  select * into x from public.receipts where id = p_receipt_id for update;
  if x.reversed_at is not null then raise exception 'Recebimento já estornado' using errcode = '22023'; end if;

  update public.receipts set reversed_at = now(), reversed_by = a.user_id, reversal_reason = left(p_reason, 500) where id = x.id;
  insert into public.financial_adjustments (organization_id, source_type, source_id, adjustment_type, amount, reason, approved_by)
  values (a.organization_id, 'receipt', x.id, 'reversal', x.amount, p_reason, a.user_id)
  returning id into v_adj;
  insert into public.cash_movements (organization_id, cash_account_id, movement_type, source_type, source_id, amount,
                                     occurred_at, description, created_by)
  values (a.organization_id, x.cash_account_id, 'debit', 'receipt_reversal', x.id, x.amount, now(),
          left('Estorno de recebimento — ' || p_reason, 300), a.user_id);
  perform private.refresh_receivable_status(x.receivable_id);

  -- Reversão de comissão vinculada (se ainda não paga).
  select * into e from public.commission_entitlements where receipt_id = x.id for update;
  if e.id is not null then
    if e.status in ('estimated', 'pending_receipt', 'earned', 'awaiting_approval', 'approved') then
      update public.commission_entitlements set status = 'reversed', reversal_reason = 'Estorno do recebimento: ' || left(p_reason, 400)
       where id = e.id;
    elsif e.status in ('partially_paid', 'paid') then
      perform private.notify_admins(a.organization_id, 'system', 'Comissão paga sobre recebimento estornado',
        'Defina tratamento (compensação futura) para a comissão ' || e.id::text, 'commission_entitlements', e.id);
    end if;
  end if;
  perform private.log_audit(a.organization_id, 'receipt_reversed', 'receipts', x.id,
    jsonb_build_object('amount', x.amount), jsonb_build_object('reason', p_reason, 'adjustment_id', v_adj));
  return v_adj;
end;
$$;

-- ----------------------------------------------------------------------------
-- Despesas e custos
-- ----------------------------------------------------------------------------
create or replace function private.validate_payable_refs(a record, p jsonb, p_kind public.payable_kind)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.financial_categories
                  where id = (p ->> 'category_id')::uuid and organization_id = a.organization_id
                    and kind::text = p_kind::text and active) then
    raise exception 'Categoria inválida para este tipo de lançamento' using errcode = '22023';
  end if;
  if nullif(p ->> 'client_id', '') is not null and not exists (
       select 1 from public.clients where id = (p ->> 'client_id')::uuid and organization_id = a.organization_id
         and (a.role = 'admin' or seller_id = a.user_id)) then
    raise exception 'Cliente inválido' using errcode = '22023';
  end if;
  if nullif(p ->> 'project_id', '') is not null and not exists (
       select 1 from public.projects pr join public.clients c on c.id = pr.client_id
        where pr.id = (p ->> 'project_id')::uuid and pr.organization_id = a.organization_id
          and (a.role = 'admin' or c.seller_id = a.user_id)) then
    raise exception 'Projeto inválido' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.insert_payable(a record, p jsonb, p_kind public.payable_kind, p_status public.payable_status)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_amount numeric(15,2);
begin
  perform private.validate_payable_refs(a, p, p_kind);
  v_amount := private.money_from_json(p, 'amount');
  if v_amount <= 0 then raise exception 'Valor deve ser positivo' using errcode = '22023'; end if;
  insert into public.payables (organization_id, client_id, project_id, category_id, kind, description, supplier_name,
    amount, due_date, competence_month, requested_by, approved_by, approved_at, status)
  values (a.organization_id, nullif(p ->> 'client_id', '')::uuid, nullif(p ->> 'project_id', '')::uuid,
    (p ->> 'category_id')::uuid, p_kind, coalesce(private.text_or_null(p, 'description', 300), ''),
    private.text_or_null(p, 'supplier_name', 160), v_amount, nullif(p ->> 'due_date', '')::date,
    date_trunc('month', coalesce(nullif(p ->> 'competence_month', '')::date, nullif(p ->> 'due_date', '')::date, private.today()))::date,
    a.user_id,
    case when p_status = 'approved' then a.user_id end, case when p_status = 'approved' then now() end, p_status)
  returning id into v_id;
  return v_id;
end;
$$;

-- Qualquer colaborador ativo solicita despesa; não altera caixa.
create or replace function public.request_expense(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; v_id uuid;
begin
  select * into a from private.require_active_user();
  v_id := private.insert_payable(a, p, 'expense', 'pending_approval');
  perform private.log_audit(a.organization_id, 'expense_requested', 'payables', v_id, null,
    jsonb_build_object('amount', p ->> 'amount', 'description', p ->> 'description'));
  perform private.notify_admins(a.organization_id, 'expense_pending_approval', 'Despesa aguardando aprovação',
    left(coalesce(p ->> 'description', ''), 200) || ' — R$ ' || replace(p ->> 'amount', '.', ','), 'payables', v_id);
  return v_id;
end;
$$;

-- Lançamento administrativo direto (custo direto ou despesa já autorizada).
create or replace function public.register_payable(p_kind public.payable_kind, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; ar record; v_id uuid;
begin
  select * into a from private.require_admin();
  select a.user_id, a.organization_id, 'admin'::public.user_role as role into ar;
  v_id := private.insert_payable(ar, p, p_kind, 'approved');
  perform private.log_audit(a.organization_id, case when p_kind = 'direct_cost' then 'direct_cost_registered' else 'expense_registered' end,
    'payables', v_id, null, jsonb_build_object('amount', p ->> 'amount', 'project_id', p ->> 'project_id'));
  return v_id;
end;
$$;

create or replace function public.approve_expense(p_payable_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; p record;
begin
  select * into a from private.require_admin();
  select * into p from public.payables where id = p_payable_id and organization_id = a.organization_id for update;
  if p.id is null then raise exception 'Despesa não encontrada' using errcode = 'P0002'; end if;
  if p.status not in ('requested', 'pending_approval') then raise exception 'Despesa não está pendente' using errcode = '22023'; end if;
  if p.requested_by = a.user_id then
    raise exception 'Quem solicita não aprova a própria despesa' using errcode = '42501';
  end if;
  update public.payables set status = 'approved', approved_by = a.user_id, approved_at = now() where id = p.id;
  perform private.log_audit(a.organization_id, 'expense_approved', 'payables', p.id,
    jsonb_build_object('status', p.status), jsonb_build_object('status', 'approved', 'amount', p.amount));
  perform private.notify(a.organization_id, p.requested_by, 'expense_approved', 'Despesa aprovada', left(p.description, 200), 'payables', p.id);
end;
$$;

create or replace function public.reject_expense(p_payable_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; p record;
begin
  select * into a from private.require_admin();
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into p from public.payables where id = p_payable_id and organization_id = a.organization_id for update;
  if p.id is null or p.status not in ('requested', 'pending_approval') then
    raise exception 'Despesa não está pendente' using errcode = '22023';
  end if;
  update public.payables set status = 'rejected', rejected_by = a.user_id, rejection_reason = left(p_reason, 500) where id = p.id;
  perform private.log_audit(a.organization_id, 'expense_rejected', 'payables', p.id, null, jsonb_build_object('reason', p_reason));
  perform private.notify(a.organization_id, p.requested_by, 'expense_rejected', 'Despesa rejeitada',
    left(p.description, 200) || ': ' || left(p_reason, 300), 'payables', p.id);
end;
$$;

create or replace function public.cancel_payable(p_payable_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; p record;
begin
  select * into a from private.require_active_user();
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

create or replace function public.confirm_outgoing_payment(
  p_payable_id uuid, p_cash_account_id uuid, p_amount numeric, p_payment_method public.payment_method,
  p_paid_at timestamptz, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; p record; v_existing record; v_id uuid; v_balance numeric(15,2);
begin
  select * into a from private.require_admin();
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'Valor inválido' using errcode = '22023'; end if;
  if p_paid_at is null or p_paid_at > now() + interval '1 day' then raise exception 'Data de pagamento inválida' using errcode = '22023'; end if;

  select * into p from public.payables where id = p_payable_id and organization_id = a.organization_id for update;
  if p.id is null then raise exception 'Lançamento não encontrado' using errcode = 'P0002'; end if;
  select * into v_existing from public.outgoing_payments where organization_id = a.organization_id and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.payable_id <> p.id or v_existing.amount <> p_amount then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  if p.status not in ('approved', 'partially_paid') then
    raise exception 'Somente lançamentos aprovados podem ser pagos (status atual: %)', p.status using errcode = '22023';
  end if;
  if not exists (select 1 from public.cash_accounts where id = p_cash_account_id and organization_id = a.organization_id and active) then
    raise exception 'Conta financeira inválida' using errcode = '22023';
  end if;
  v_balance := p.amount - private.payable_paid_amount(p.id);
  if p_amount > v_balance then raise exception 'Valor excede o saldo pendente (R$ %)', v_balance using errcode = '22023'; end if;

  insert into public.outgoing_payments (organization_id, payable_id, cash_account_id, amount, payment_method, paid_at,
                                        confirmed_by, idempotency_key)
  values (a.organization_id, p.id, p_cash_account_id, p_amount, p_payment_method, p_paid_at, a.user_id, p_idempotency_key)
  returning id into v_id;
  insert into public.cash_movements (organization_id, cash_account_id, movement_type, source_type, source_id, amount,
                                     occurred_at, description, created_by)
  values (a.organization_id, p_cash_account_id, 'debit', 'outgoing_payment', v_id, p_amount, p_paid_at,
          left(case p.kind when 'direct_cost' then 'Custo — ' else 'Despesa — ' end || p.description, 300), a.user_id);
  perform private.refresh_payable_status(p.id);
  perform private.log_audit(a.organization_id, 'outgoing_payment_confirmed', 'outgoing_payments', v_id, null,
    jsonb_build_object('payable_id', p.id, 'amount', p_amount, 'cash_account_id', p_cash_account_id));
  return v_id;
end;
$$;

create or replace function public.reverse_outgoing_payment(p_payment_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; x record; v_adj uuid;
begin
  select * into a from private.require_admin();
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into x from public.outgoing_payments where id = p_payment_id and organization_id = a.organization_id;
  if x.id is null then raise exception 'Pagamento não encontrado' using errcode = 'P0002'; end if;
  perform 1 from public.payables where id = x.payable_id for update;
  select * into x from public.outgoing_payments where id = p_payment_id for update;
  if x.reversed_at is not null then raise exception 'Pagamento já estornado' using errcode = '22023'; end if;
  update public.outgoing_payments set reversed_at = now(), reversed_by = a.user_id, reversal_reason = left(p_reason, 500) where id = x.id;
  insert into public.financial_adjustments (organization_id, source_type, source_id, adjustment_type, amount, reason, approved_by)
  values (a.organization_id, 'outgoing_payment', x.id, 'reversal', x.amount, p_reason, a.user_id) returning id into v_adj;
  insert into public.cash_movements (organization_id, cash_account_id, movement_type, source_type, source_id, amount,
                                     occurred_at, description, created_by)
  values (a.organization_id, x.cash_account_id, 'credit', 'outgoing_payment_reversal', x.id, x.amount, now(),
          left('Estorno de pagamento — ' || p_reason, 300), a.user_id);
  perform private.refresh_payable_status(x.payable_id);
  perform private.log_audit(a.organization_id, 'outgoing_payment_reversed', 'outgoing_payments', x.id,
    jsonb_build_object('amount', x.amount), jsonb_build_object('reason', p_reason, 'adjustment_id', v_adj));
  return v_adj;
end;
$$;

-- Transferência entre contas: dois movimentos correlacionados, caixa consolidado inalterado.
create or replace function public.transfer_between_accounts(
  p_from uuid, p_to uuid, p_amount numeric, p_occurred_at timestamptz, p_description text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; v_id uuid := gen_random_uuid();
begin
  select * into a from private.require_admin();
  if p_from = p_to then raise exception 'Contas de origem e destino iguais' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'Valor inválido' using errcode = '22023'; end if;
  if (select count(*) from public.cash_accounts where id in (p_from, p_to) and organization_id = a.organization_id and active) <> 2 then
    raise exception 'Conta financeira inválida' using errcode = '22023';
  end if;
  insert into public.cash_movements (organization_id, cash_account_id, movement_type, source_type, source_id, amount, occurred_at, description, created_by)
  values (a.organization_id, p_from, 'debit', 'transfer', v_id, p_amount, p_occurred_at, left(coalesce(p_description, 'Transferência entre contas'), 300), a.user_id),
         (a.organization_id, p_to, 'credit', 'transfer', v_id, p_amount, p_occurred_at, left(coalesce(p_description, 'Transferência entre contas'), 300), a.user_id);
  perform private.log_audit(a.organization_id, 'cash_transfer', 'cash_movements', v_id, null,
    jsonb_build_object('from', p_from, 'to', p_to, 'amount', p_amount));
  return v_id;
end;
$$;

create or replace function public.get_cash_balances()
returns table (cash_account_id uuid, name text, account_type public.cash_account_type, active boolean,
               opening_balance numeric, credits numeric, debits numeric, balance numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record;
begin
  select * into a from private.require_admin();
  return query
  select ca.id, ca.name, ca.account_type, ca.active, ca.opening_balance,
         coalesce(sum(m.amount) filter (where m.movement_type = 'credit'), 0)::numeric(15,2),
         coalesce(sum(m.amount) filter (where m.movement_type = 'debit'), 0)::numeric(15,2),
         (ca.opening_balance + coalesce(sum(case when m.movement_type = 'credit' then m.amount else -m.amount end), 0))::numeric(15,2)
    from public.cash_accounts ca
    left join public.cash_movements m on m.cash_account_id = ca.id
   where ca.organization_id = a.organization_id
   group by ca.id
   order by ca.name;
end;
$$;
