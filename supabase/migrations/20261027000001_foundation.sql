-- =============================================================================
-- ONE CONTROL — 0001 Fundação: schemas, extensões, tipos de domínio, utilitários
-- =============================================================================
-- Convenções:
--   * public  : entidades expostas pela Data API (sempre com RLS).
--   * private : funções auxiliares e estruturas internas (NÃO exposto pela API).
--   * Montantes em numeric(15,2); percentuais em pontos-base (integer).
--   * Timestamps em timestamptz; fuso de apresentação America/Bahia.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
-- authenticated precisa de USAGE para que as policies RLS possam invocar os helpers.
grant usage on schema private to authenticated, service_role;
-- Funções novas não ganham EXECUTE implícito para PUBLIC.
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;

-- ----------------------------------------------------------------------------
-- Tipos enumerados
-- ----------------------------------------------------------------------------
create type public.organization_status as enum ('active', 'suspended');
create type public.user_role           as enum ('admin', 'seller');
create type public.profile_status      as enum ('invited', 'active', 'suspended', 'inactive');
create type public.invitation_status   as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.service_type        as enum ('one_time', 'recurring', 'hybrid');
create type public.client_status       as enum ('pending_completion', 'lead', 'active', 'inactive', 'archived');
create type public.link_status         as enum ('active', 'used', 'revoked', 'expired');
create type public.import_status       as enum ('received', 'imported', 'duplicate', 'rejected', 'failed');
create type public.import_job_status   as enum ('pending', 'processing', 'completed', 'completed_with_errors', 'failed');
create type public.project_status      as enum ('planning', 'awaiting_approval', 'approved', 'in_progress', 'in_review', 'delivered', 'on_hold', 'cancelled');
create type public.task_status         as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
create type public.task_priority       as enum ('low', 'medium', 'high', 'urgent');
create type public.contract_status     as enum ('draft', 'pending_approval', 'approved', 'active', 'completed', 'cancelled');
create type public.billing_frequency   as enum ('monthly', 'quarterly', 'yearly');
create type public.sale_origin         as enum ('direct', 'referral', 'second_level_referral');
create type public.policy_status       as enum ('draft', 'active', 'retired');
create type public.commission_base_rule as enum ('implementation_only', 'first_month_only', 'implementation_plus_first_month', 'recurring_receipts', 'all_eligible_receipts');
create type public.commission_trigger_rule as enum ('on_receipt', 'on_contract_approval');
create type public.commission_status   as enum ('estimated', 'pending_receipt', 'earned', 'awaiting_approval', 'approved', 'partially_paid', 'paid', 'reversed', 'cancelled');
create type public.payout_status       as enum ('confirmed', 'reversed');
create type public.schedule_status     as enum ('active', 'paused', 'ended', 'cancelled');
create type public.receivable_type     as enum ('implementation', 'monthly_fee', 'additional_service', 'other');
create type public.receivable_status   as enum ('scheduled', 'open', 'partially_paid', 'paid', 'overdue', 'cancelled');
create type public.payment_method      as enum ('pix', 'bank_transfer', 'boleto', 'credit_card', 'debit_card', 'cash', 'other');
create type public.category_kind       as enum ('expense', 'direct_cost', 'revenue');
create type public.payable_kind        as enum ('expense', 'direct_cost');
create type public.payable_status      as enum ('requested', 'pending_approval', 'approved', 'rejected', 'partially_paid', 'paid', 'cancelled');
create type public.cash_account_type   as enum ('bank', 'cash', 'digital_wallet', 'other');
create type public.movement_type       as enum ('credit', 'debit');
create type public.notification_type   as enum (
  'client_registered', 'contract_pending_approval', 'contract_approved', 'contract_rejected',
  'invoice_due_soon', 'invoice_overdue', 'expense_pending_approval', 'expense_approved',
  'expense_rejected', 'project_due_soon', 'project_overdue', 'commission_approved',
  'commission_paid', 'client_transferred', 'form_submission_received', 'system');

-- ----------------------------------------------------------------------------
-- Utilitários genéricos
-- ----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Bloqueia UPDATE/DELETE em tabelas append-only (histórico imutável).
create or replace function private.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registro imutável: % em %.% não é permitido', tg_op, tg_table_schema, tg_table_name
    using errcode = '42501';
end;
$$;

-- Normalização de e-mail (minúsculas, sem espaços).
create or replace function private.normalize_email(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(btrim(p)), '');
$$;

-- Normalização de telefone brasileiro para E.164 quando possível.
create or replace function private.normalize_phone_br(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text;
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;
  digits := regexp_replace(p, '\D', '', 'g');
  if digits ~ '^55\d{10,11}$' then
    return '+' || digits;
  elsif digits ~ '^\d{10,11}$' then
    return '+55' || digits;
  elsif btrim(p) ~ '^\+\d{8,15}$' then
    return '+' || digits;
  end if;
  return null; -- inválido; a camada de validação rejeita antes
end;
$$;

-- Normalização de Instagram (@handle minúsculo).
create or replace function private.normalize_instagram(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    lower(regexp_replace(regexp_replace(btrim(coalesce(p, '')),
      '^(https?://)?(www\.)?instagram\.com/', '', 'i'), '^@|/.*$', '', 'g')),
    '');
$$;

-- Validação de CNPJ (dígitos verificadores) ou CPF.
create or replace function private.is_valid_tax_id(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int; r int; i int;
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if length(d) = 14 then
    if d ~ '^(\d)\1{13}$' then return false; end if;
    s := 0;
    for i in 1..12 loop s := s + substr(d, i, 1)::int * w1[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 13, 1)::int then return false; end if;
    s := 0;
    for i in 1..13 loop s := s + substr(d, i, 1)::int * w2[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    return r = substr(d, 14, 1)::int;
  elsif length(d) = 11 then
    if d ~ '^(\d)\1{10}$' then return false; end if;
    s := 0;
    for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::int then return false; end if;
    s := 0;
    for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = substr(d, 11, 1)::int;
  end if;
  return false;
end;
$$;

-- Cálculo monetário de comissão: base × bps / 10000, arredondado a centavos
-- (ROUND de numeric = meio para longe de zero, determinístico).
create or replace function private.commission_amount(p_base numeric, p_rate_bps integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(p_base, 0) * p_rate_bps / 10000.0, 2)::numeric(15,2);
$$;

-- Data de vencimento para um mês, com dia de cobrança limitado ao último dia do
-- mês (política "clamp_to_month_end": dia 31 em fevereiro → 28/29).
create or replace function private.due_date_for_month(p_month date, p_billing_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_month)::date
          + (least(p_billing_day,
                   extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::int) - 1));
$$;
