-- =============================================================================
-- ONE CONTROL — 0005 Financeiro: categorias, contas, caixa, cobranças,
-- recebimentos, contas a pagar, pagamentos, ajustes e comissões
-- =============================================================================

create table public.financial_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name            text not null check (length(btrim(name)) between 2 and 80),
  kind            public.category_kind not null,
  parent_id       uuid null references public.financial_categories (id),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create unique index uq_fin_categories on public.financial_categories (organization_id, kind, lower(name));
create index idx_fin_categories_parent on public.financial_categories (parent_id);
create trigger trg_fin_categories_audit after insert or update on public.financial_categories
  for each row execute function private.audit_row_change();

create table public.cash_accounts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name            text not null check (length(btrim(name)) between 2 and 80),
  account_type    public.cash_account_type not null default 'bank',
  opening_balance numeric(15,2) not null default 0,
  opening_date    date not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create unique index uq_cash_accounts_name on public.cash_accounts (organization_id, lower(name));
create trigger trg_cash_accounts_audit after insert or update on public.cash_accounts
  for each row execute function private.audit_row_change();

-- Saldo inicial só pode ser alterado enquanto a conta não tem movimentos.
create or replace function private.cash_accounts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.opening_balance <> old.opening_balance or new.opening_date <> old.opening_date)
     and exists (select 1 from public.cash_movements m where m.cash_account_id = old.id) then
    raise exception 'Conta já possui movimentos; registre um ajuste em vez de alterar o saldo inicial'
      using errcode = '42501';
  end if;
  if new.organization_id <> old.organization_id then
    raise exception 'Organização imutável' using errcode = '42501';
  end if;
  return new;
end;
$$;

create table public.cash_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  cash_account_id uuid not null references public.cash_accounts (id),
  movement_type   public.movement_type not null,
  source_type     text not null check (source_type in (
                    'receipt', 'receipt_reversal', 'outgoing_payment', 'outgoing_payment_reversal',
                    'commission_payout', 'commission_payout_reversal', 'transfer', 'adjustment')),
  source_id       uuid not null,
  amount          numeric(15,2) not null check (amount > 0),
  occurred_at     timestamptz not null,
  description     text not null check (length(description) <= 300),
  created_by      uuid null references public.profiles (id),
  created_at      timestamptz not null default now(),
  unique (source_type, source_id, cash_account_id)
);
create index idx_cash_movements_account_date on public.cash_movements (cash_account_id, occurred_at);
create index idx_cash_movements_org_date on public.cash_movements (organization_id, occurred_at);
create index idx_cash_movements_created_by on public.cash_movements (created_by);
create trigger trg_cash_movements_immutable before update or delete on public.cash_movements
  for each row execute function private.forbid_mutation();

create trigger trg_cash_accounts_guard before update on public.cash_accounts
  for each row execute function private.cash_accounts_guard();

-- ----------------------------------------------------------------------------
-- Cobranças recorrentes e contas a receber
-- ----------------------------------------------------------------------------
create table public.billing_schedules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  contract_id     uuid not null references public.contracts (id),
  frequency       public.billing_frequency not null default 'monthly',
  amount          numeric(15,2) not null check (amount > 0),
  billing_day     integer not null check (billing_day between 1 and 31),
  start_date      date not null,
  end_date        date null,
  next_due_date   date null,
  status          public.schedule_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index idx_billing_schedules_contract on public.billing_schedules (contract_id);
create index idx_billing_schedules_due on public.billing_schedules (organization_id, status, next_due_date);
create unique index uq_billing_schedule_active_contract on public.billing_schedules (contract_id)
  where status in ('active', 'paused');
create trigger trg_billing_schedules_updated before update on public.billing_schedules
  for each row execute function private.set_updated_at();

create table public.receivables (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id),
  client_id           uuid not null references public.clients (id),
  contract_id         uuid null references public.contracts (id),
  billing_schedule_id uuid null references public.billing_schedules (id),
  description         text not null check (length(btrim(description)) between 2 and 300),
  type                public.receivable_type not null,
  amount              numeric(15,2) not null check (amount > 0),
  due_date            date not null,
  competence_month    date null check (competence_month is null or extract(day from competence_month) = 1),
  status              public.receivable_status not null default 'open',
  external_reference  text null check (external_reference is null or length(external_reference) <= 120),
  created_by          uuid null references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  voided_at           timestamptz null,
  void_reason         text null check (void_reason is null or length(void_reason) <= 500),
  check ((status = 'cancelled') = (voided_at is not null))
);
create index idx_receivables_due on public.receivables (organization_id, due_date);
create index idx_receivables_status on public.receivables (organization_id, status);
create index idx_receivables_client on public.receivables (client_id);
create index idx_receivables_contract on public.receivables (contract_id);
create index idx_receivables_created_by on public.receivables (created_by);
-- Idempotência da geração recorrente: uma cobrança por agenda e competência.
create unique index uq_receivables_schedule_competence on public.receivables (billing_schedule_id, competence_month)
  where billing_schedule_id is not null;
-- Uma cobrança de implantação ativa por contrato.
create unique index uq_receivables_contract_implementation on public.receivables (contract_id)
  where type = 'implementation' and status <> 'cancelled' and contract_id is not null;
create trigger trg_receivables_updated before update on public.receivables
  for each row execute function private.set_updated_at();

create table public.receipts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  receivable_id   uuid not null references public.receivables (id),
  cash_account_id uuid not null references public.cash_accounts (id),
  amount          numeric(15,2) not null check (amount > 0),
  payment_method  public.payment_method not null,
  received_at     timestamptz not null,
  confirmed_by    uuid not null references public.profiles (id),
  reference       text null check (reference is null or length(reference) <= 120),
  idempotency_key text null check (idempotency_key is null or length(idempotency_key) between 8 and 120),
  reversed_at     timestamptz null,
  reversed_by     uuid null references public.profiles (id),
  reversal_reason text null check (reversal_reason is null or length(reversal_reason) <= 500),
  created_at      timestamptz not null default now(),
  check ((reversed_at is null) = (reversed_by is null))
);
create index idx_receipts_receivable on public.receipts (receivable_id);
create index idx_receipts_account on public.receipts (cash_account_id);
create index idx_receipts_org_date on public.receipts (organization_id, received_at);
create index idx_receipts_confirmed_by on public.receipts (confirmed_by);
create index idx_receipts_reversed_by on public.receipts (reversed_by);
create unique index uq_receipts_idempotency on public.receipts (organization_id, idempotency_key)
  where idempotency_key is not null;

-- Recebimento confirmado é imutável; apenas os campos de estorno podem ser preenchidos uma vez.
create or replace function private.receipts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Recebimentos não podem ser excluídos; use estorno' using errcode = '42501';
  end if;
  if old.reversed_at is not null
     or new.amount <> old.amount or new.receivable_id <> old.receivable_id
     or new.cash_account_id <> old.cash_account_id or new.received_at <> old.received_at
     or new.confirmed_by <> old.confirmed_by or new.organization_id <> old.organization_id
     or new.payment_method <> old.payment_method then
    raise exception 'Recebimento confirmado é imutável' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_receipts_guard before update or delete on public.receipts
  for each row execute function private.receipts_guard();

-- ----------------------------------------------------------------------------
-- Contas a pagar (despesas e custos) e pagamentos
-- ----------------------------------------------------------------------------
create table public.payables (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id),
  client_id        uuid null references public.clients (id),
  project_id       uuid null references public.projects (id),
  category_id      uuid not null references public.financial_categories (id),
  kind             public.payable_kind not null,
  description      text not null check (length(btrim(description)) between 2 and 300),
  supplier_name    text null check (supplier_name is null or length(supplier_name) <= 160),
  amount           numeric(15,2) not null check (amount > 0),
  due_date         date null,
  competence_month date null check (competence_month is null or extract(day from competence_month) = 1),
  requested_by     uuid not null references public.profiles (id),
  approved_by      uuid null references public.profiles (id),
  approved_at      timestamptz null,
  rejected_by      uuid null references public.profiles (id),
  rejection_reason text null check (rejection_reason is null or length(rejection_reason) <= 500),
  cancelled_at     timestamptz null,
  status           public.payable_status not null default 'pending_approval',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (status not in ('approved', 'partially_paid', 'paid') or (approved_by is not null and approved_at is not null)),
  check (status <> 'rejected' or (rejected_by is not null and rejection_reason is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index idx_payables_due on public.payables (organization_id, due_date);
create index idx_payables_status on public.payables (organization_id, kind, status);
create index idx_payables_requested_by on public.payables (requested_by);
create index idx_payables_category on public.payables (category_id);
create index idx_payables_project on public.payables (project_id);
create index idx_payables_client on public.payables (client_id);
create index idx_payables_approved_by on public.payables (approved_by);
create index idx_payables_rejected_by on public.payables (rejected_by);
create trigger trg_payables_updated before update on public.payables
  for each row execute function private.set_updated_at();

create table public.outgoing_payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  payable_id      uuid not null references public.payables (id),
  cash_account_id uuid not null references public.cash_accounts (id),
  amount          numeric(15,2) not null check (amount > 0),
  payment_method  public.payment_method not null,
  paid_at         timestamptz not null,
  confirmed_by    uuid not null references public.profiles (id),
  idempotency_key text null check (idempotency_key is null or length(idempotency_key) between 8 and 120),
  reversed_at     timestamptz null,
  reversed_by     uuid null references public.profiles (id),
  reversal_reason text null check (reversal_reason is null or length(reversal_reason) <= 500),
  created_at      timestamptz not null default now()
);
create index idx_outgoing_payments_payable on public.outgoing_payments (payable_id);
create index idx_outgoing_payments_account on public.outgoing_payments (cash_account_id);
create index idx_outgoing_payments_org_date on public.outgoing_payments (organization_id, paid_at);
create index idx_outgoing_payments_confirmed_by on public.outgoing_payments (confirmed_by);
create index idx_outgoing_payments_reversed_by on public.outgoing_payments (reversed_by);
create unique index uq_outgoing_payments_idempotency on public.outgoing_payments (organization_id, idempotency_key)
  where idempotency_key is not null;

create or replace function private.outgoing_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Pagamentos não podem ser excluídos; use estorno' using errcode = '42501';
  end if;
  if old.reversed_at is not null or new.amount <> old.amount or new.payable_id <> old.payable_id
     or new.cash_account_id <> old.cash_account_id or new.paid_at <> old.paid_at then
    raise exception 'Pagamento confirmado é imutável' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_outgoing_payments_guard before update or delete on public.outgoing_payments
  for each row execute function private.outgoing_payments_guard();

create table public.financial_adjustments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  source_type     text not null check (source_type in ('receipt', 'outgoing_payment', 'commission_payout', 'receivable', 'payable', 'cash_account')),
  source_id       uuid not null,
  adjustment_type text not null check (adjustment_type in ('reversal', 'void', 'correction')),
  amount          numeric(15,2) not null check (amount >= 0),
  reason          text not null check (length(btrim(reason)) between 3 and 500),
  approved_by     uuid not null references public.profiles (id),
  created_at      timestamptz not null default now()
);
create index idx_fin_adjustments_source on public.financial_adjustments (source_type, source_id);
create index idx_fin_adjustments_approved_by on public.financial_adjustments (approved_by);
create index idx_fin_adjustments_org on public.financial_adjustments (organization_id, created_at);
create unique index uq_fin_adjustments_reversal on public.financial_adjustments (source_type, source_id)
  where adjustment_type = 'reversal';
create trigger trg_fin_adjustments_immutable before update or delete on public.financial_adjustments
  for each row execute function private.forbid_mutation();

-- ----------------------------------------------------------------------------
-- Comissões
-- ----------------------------------------------------------------------------
create table public.commission_entitlements (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id),
  contract_id       uuid not null references public.contracts (id),
  seller_id         uuid not null references public.profiles (id),
  policy_id         uuid not null references public.commission_policies (id),
  receipt_id        uuid null references public.receipts (id),
  sale_origin       public.sale_origin not null,
  base_amount       numeric(15,2) not null check (base_amount >= 0),
  rate_bps          integer not null check (rate_bps between 0 and 10000),
  commission_amount numeric(15,2) not null check (commission_amount >= 0),
  status            public.commission_status not null,
  approved_by       uuid null references public.profiles (id),
  approved_at       timestamptz null,
  reversal_reason   text null check (reversal_reason is null or length(reversal_reason) <= 500),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Coerência do cálculo: o valor é sempre derivado de base × taxa.
  constraint ck_commission_math check (commission_amount = private.commission_amount(base_amount, rate_bps)),
  constraint ck_commission_self_approval check (approved_by is null or approved_by <> seller_id),
  check (status not in ('approved', 'partially_paid', 'paid') or approved_by is not null)
);
create index idx_commissions_seller on public.commission_entitlements (seller_id, status);
create index idx_commissions_contract on public.commission_entitlements (contract_id);
create index idx_commissions_org_status on public.commission_entitlements (organization_id, status);
create index idx_commissions_policy on public.commission_entitlements (policy_id);
create index idx_commissions_approved_by on public.commission_entitlements (approved_by);
-- Nunca duas comissões sobre o mesmo evento de recebimento.
create unique index uq_commission_receipt on public.commission_entitlements (receipt_id) where receipt_id is not null;
create trigger trg_commissions_updated before update on public.commission_entitlements
  for each row execute function private.set_updated_at();

create table public.commission_payouts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  seller_id       uuid not null references public.profiles (id),
  cash_account_id uuid not null references public.cash_accounts (id),
  paid_amount     numeric(15,2) not null check (paid_amount > 0),
  paid_at         timestamptz not null,
  confirmed_by    uuid not null references public.profiles (id),
  status          public.payout_status not null default 'confirmed',
  idempotency_key text null check (idempotency_key is null or length(idempotency_key) between 8 and 120),
  created_at      timestamptz not null default now(),
  check (confirmed_by <> seller_id)
);
create index idx_commission_payouts_seller on public.commission_payouts (seller_id, paid_at);
create index idx_commission_payouts_account on public.commission_payouts (cash_account_id);
create index idx_commission_payouts_confirmed_by on public.commission_payouts (confirmed_by);
create unique index uq_commission_payouts_idempotency on public.commission_payouts (organization_id, idempotency_key)
  where idempotency_key is not null;

create table public.commission_payout_items (
  id                        uuid primary key default gen_random_uuid(),
  commission_payout_id      uuid not null references public.commission_payouts (id),
  commission_entitlement_id uuid not null references public.commission_entitlements (id),
  allocated_amount          numeric(15,2) not null check (allocated_amount > 0),
  unique (commission_payout_id, commission_entitlement_id)
);
create index idx_payout_items_entitlement on public.commission_payout_items (commission_entitlement_id);
create trigger trg_payout_items_immutable before update or delete on public.commission_payout_items
  for each row execute function private.forbid_mutation();
