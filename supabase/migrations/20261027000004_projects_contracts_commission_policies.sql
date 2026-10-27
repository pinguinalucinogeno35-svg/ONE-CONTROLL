-- =============================================================================
-- ONE CONTROL — 0004 Políticas de comissão, projetos, tarefas e contratos
-- =============================================================================

create table public.commission_policies (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id),
  name                   text not null check (length(btrim(name)) between 2 and 120),
  direct_rate_bps        integer not null check (direct_rate_bps between 0 and 10000),
  referral_rate_bps      integer not null check (referral_rate_bps between 0 and 10000),
  second_level_rate_bps  integer not null check (second_level_rate_bps between 0 and 10000),
  base_rule              public.commission_base_rule null,
  trigger_rule           public.commission_trigger_rule null,
  recurring_limit_months integer null check (recurring_limit_months is null or recurring_limit_months between 1 and 120),
  requires_approval      boolean not null default true,
  refunds_reverse        boolean not null default true,
  status                 public.policy_status not null default 'draft',
  effective_from         date not null,
  effective_until        date null,
  approved_by            uuid null references public.profiles (id),
  approved_at            timestamptz null,
  notes                  text null check (notes is null or length(notes) <= 2000),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (effective_until is null or effective_until >= effective_from),
  -- Uma política só pode ficar ativa com base e fato gerador definidos e aprovador.
  constraint ck_policy_active_complete check (
    status <> 'active' or (base_rule is not null and trigger_rule is not null and approved_by is not null))
);
create index idx_commission_policies_org_status on public.commission_policies (organization_id, status, effective_from);
create index idx_commission_policies_approved_by on public.commission_policies (approved_by);
create unique index uq_commission_policy_one_active on public.commission_policies (organization_id)
  where status = 'active';
create trigger trg_commission_policies_updated before update on public.commission_policies
  for each row execute function private.set_updated_at();
create trigger trg_commission_policies_audit after insert or update on public.commission_policies
  for each row execute function private.audit_row_change();

-- Política ativa não pode ter taxas/base alteradas: crie nova versão.
create or replace function private.commission_policies_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('active', 'retired') and (
       new.direct_rate_bps <> old.direct_rate_bps or new.referral_rate_bps <> old.referral_rate_bps
       or new.second_level_rate_bps <> old.second_level_rate_bps
       or new.base_rule is distinct from old.base_rule or new.trigger_rule is distinct from old.trigger_rule
       or new.recurring_limit_months is distinct from old.recurring_limit_months
       or new.effective_from <> old.effective_from) then
    raise exception 'Política ativa/aposentada é imutável; crie uma nova versão' using errcode = '42501';
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'Política aposentada não pode ser reativada' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_commission_policies_guard before update on public.commission_policies
  for each row execute function private.commission_policies_guard();

-- ----------------------------------------------------------------------------
-- Projetos
-- ----------------------------------------------------------------------------
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  client_id       uuid not null references public.clients (id),
  name            text not null check (length(btrim(name)) between 2 and 160),
  description     text null check (description is null or length(description) <= 4000),
  status          public.project_status not null default 'planning',
  start_date      date null,
  due_date        date null,
  delivered_at    timestamptz null,
  manager_id      uuid null references public.profiles (id),
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date),
  check ((status = 'delivered') = (delivered_at is not null))
);
create index idx_projects_client on public.projects (client_id);
create index idx_projects_org_status on public.projects (organization_id, status);
create index idx_projects_org_due on public.projects (organization_id, due_date);
create index idx_projects_manager on public.projects (manager_id);
create index idx_projects_created_by on public.projects (created_by);
create trigger trg_projects_updated before update on public.projects
  for each row execute function private.set_updated_at();

create table public.project_tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  title        text not null check (length(btrim(title)) between 2 and 200),
  description  text null check (description is null or length(description) <= 4000),
  assigned_to  uuid null references public.profiles (id),
  status       public.task_status not null default 'todo',
  priority     public.task_priority not null default 'medium',
  due_date     date null,
  completed_at timestamptz null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((status = 'done') = (completed_at is not null))
);
create index idx_project_tasks_project on public.project_tasks (project_id, status);
create index idx_project_tasks_assigned on public.project_tasks (assigned_to);
create trigger trg_project_tasks_updated before update on public.project_tasks
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- Contratos
-- ----------------------------------------------------------------------------
create sequence public.contract_number_seq;

create table public.contracts (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id),
  client_id              uuid not null references public.clients (id),
  project_id             uuid null references public.projects (id),
  seller_id              uuid not null references public.profiles (id),
  contract_number        text not null,
  implementation_amount  numeric(15,2) not null default 0 check (implementation_amount >= 0),
  monthly_amount         numeric(15,2) not null default 0 check (monthly_amount >= 0),
  currency_code          char(3) not null default 'BRL',
  start_date             date not null,
  delivery_due_date      date null,
  delivery_date_justification text null check (delivery_date_justification is null or length(delivery_date_justification) <= 500),
  recurring_start_date   date null,
  billing_day            integer null check (billing_day between 1 and 31),
  billing_frequency      public.billing_frequency null,
  sale_origin            public.sale_origin not null default 'direct',
  commission_policy_id   uuid null references public.commission_policies (id),
  commission_rate_bps    integer null check (commission_rate_bps between 0 and 10000),
  status                 public.contract_status not null default 'draft',
  signed_at              timestamptz null,
  submitted_at           timestamptz null,
  approved_at            timestamptz null,
  approved_by            uuid null references public.profiles (id),
  rejection_reason       text null check (rejection_reason is null or length(rejection_reason) <= 1000),
  cancelled_at           timestamptz null,
  cancellation_reason    text null check (cancellation_reason is null or length(cancellation_reason) <= 1000),
  notes                  text null check (notes is null or length(notes) <= 4000),
  created_by             uuid not null references public.profiles (id),
  version                integer not null default 1 check (version >= 1),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organization_id, contract_number),
  constraint ck_contract_delivery check (
    delivery_due_date is null or delivery_due_date >= start_date or delivery_date_justification is not null),
  constraint ck_contract_recurring check (
    monthly_amount = 0
    or (recurring_start_date is not null and billing_day is not null and billing_frequency is not null)),
  constraint ck_contract_cancel check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint ck_contract_approved check (
    status not in ('approved', 'active', 'completed') or (approved_at is not null and approved_by is not null
      and commission_rate_bps is not null))
);
create index idx_contracts_client on public.contracts (client_id);
create index idx_contracts_seller on public.contracts (seller_id, status);
create index idx_contracts_org_status on public.contracts (organization_id, status);
create index idx_contracts_org_start on public.contracts (organization_id, start_date);
create index idx_contracts_project on public.contracts (project_id);
create index idx_contracts_policy on public.contracts (commission_policy_id);
create index idx_contracts_approved_by on public.contracts (approved_by);
create index idx_contracts_created_by on public.contracts (created_by);
create trigger trg_contracts_updated before update on public.contracts
  for each row execute function private.set_updated_at();

create table public.contract_services (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  service_id  uuid not null references public.services (id),
  description text null check (description is null or length(description) <= 500),
  quantity    numeric(12,2) not null default 1 check (quantity > 0),
  unit_amount numeric(15,2) null check (unit_amount is null or unit_amount >= 0),
  created_at  timestamptz not null default now()
);
create index idx_contract_services_contract on public.contract_services (contract_id);
create index idx_contract_services_service on public.contract_services (service_id);

create table public.contract_versions (
  id             uuid primary key default gen_random_uuid(),
  contract_id    uuid not null references public.contracts (id),
  version_number integer not null check (version_number >= 1),
  snapshot       jsonb not null,
  change_reason  text not null check (length(btrim(change_reason)) between 3 and 1000),
  changed_by     uuid not null references public.profiles (id),
  created_at     timestamptz not null default now(),
  unique (contract_id, version_number)
);
create index idx_contract_versions_changed_by on public.contract_versions (changed_by);
create trigger trg_contract_versions_immutable before update or delete on public.contract_versions
  for each row execute function private.forbid_mutation();

create table public.contract_referrals (
  id                        uuid primary key default gen_random_uuid(),
  contract_id               uuid not null unique references public.contracts (id) on delete cascade,
  origin_type               public.sale_origin not null,
  first_referrer_client_id  uuid null references public.clients (id),
  second_referrer_client_id uuid null references public.clients (id),
  external_referrer_name    text null check (external_referrer_name is null or length(external_referrer_name) <= 160),
  notes                     text null check (notes is null or length(notes) <= 1000),
  created_by                uuid not null references public.profiles (id),
  created_at                timestamptz not null default now(),
  constraint ck_referral_shape check (
    (origin_type = 'direct' and first_referrer_client_id is null and second_referrer_client_id is null
       and external_referrer_name is null)
    or (origin_type = 'referral' and second_referrer_client_id is null
       and (first_referrer_client_id is not null or external_referrer_name is not null))
    or (origin_type = 'second_level_referral'
       and (first_referrer_client_id is not null or external_referrer_name is not null)
       and second_referrer_client_id is not null)),
  check (first_referrer_client_id is null or first_referrer_client_id <> coalesce(second_referrer_client_id, '00000000-0000-0000-0000-000000000000'))
);
create index idx_contract_referrals_first on public.contract_referrals (first_referrer_client_id);
create index idx_contract_referrals_second on public.contract_referrals (second_referrer_client_id);
create index idx_contract_referrals_created_by on public.contract_referrals (created_by);
