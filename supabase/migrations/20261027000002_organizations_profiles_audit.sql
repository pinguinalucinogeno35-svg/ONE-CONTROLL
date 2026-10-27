-- =============================================================================
-- ONE CONTROL — 0002 Organizações, perfis, convites, auditoria e helpers de autorização
-- =============================================================================

create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  legal_name    text not null check (length(legal_name) between 2 and 200),
  display_name  text not null check (length(display_name) between 2 and 120),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  tax_id        text null,
  currency_code char(3) not null default 'BRL',
  timezone      text not null default 'America/Bahia',
  status        public.organization_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_organizations_updated before update on public.organizations
  for each row execute function private.set_updated_at();

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete restrict,
  organization_id uuid not null references public.organizations (id),
  full_name       text not null check (length(btrim(full_name)) between 2 and 120),
  email           text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role            public.user_role not null,
  status          public.profile_status not null default 'invited',
  avatar_path     text null check (avatar_path is null or length(avatar_path) <= 300),
  phone           text null check (phone is null or length(phone) <= 20),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_active_at  timestamptz null,
  unique (organization_id, email)
);
create index idx_profiles_org_role_status on public.profiles (organization_id, role, status);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function private.set_updated_at();

create table public.user_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  email           text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name       text not null check (length(btrim(full_name)) between 2 and 120),
  intended_role   public.user_role not null,
  token_hash      text null,
  status          public.invitation_status not null default 'pending',
  expires_at      timestamptz not null,
  invited_by      uuid not null references public.profiles (id),
  accepted_by     uuid null references public.profiles (id),
  accepted_at     timestamptz null,
  created_at      timestamptz not null default now()
);
create index idx_invitations_org_status on public.user_invitations (organization_id, status);
create unique index uq_invitations_pending_email on public.user_invitations (organization_id, lower(email))
  where status = 'pending';

-- ----------------------------------------------------------------------------
-- Auditoria (append-only)
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  actor_user_id   uuid null references public.profiles (id),
  action          text not null check (length(action) <= 80),
  entity_type     text not null check (length(entity_type) <= 60),
  entity_id       uuid null,
  previous_values jsonb null,
  new_values      jsonb null,
  request_id      text null check (request_id is null or length(request_id) <= 100),
  source          text not null default 'app' check (source in ('app', 'database', 'integration', 'system', 'import')),
  created_at      timestamptz not null default now()
);
create index idx_audit_org_created on public.audit_logs (organization_id, created_at desc);
create index idx_audit_entity on public.audit_logs (entity_type, entity_id);
create index idx_audit_actor on public.audit_logs (actor_user_id);

-- Imutável, exceto expurgo de retenção explicitamente habilitado na transação.
create or replace function private.audit_logs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('one.audit_retention_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'audit_logs é imutável' using errcode = '42501';
end;
$$;
create trigger trg_audit_logs_guard before update or delete on public.audit_logs
  for each row execute function private.audit_logs_guard();

-- ----------------------------------------------------------------------------
-- Helpers de autorização (SECURITY DEFINER para evitar recursão de RLS em profiles).
-- Todos consultam o status atual do perfil: sessões antigas de usuários
-- desativados perdem acesso imediatamente, mesmo com JWT ainda válido.
-- ----------------------------------------------------------------------------
create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active';
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.organizations o on o.id = p.organization_id and o.status = 'active'
    where p.id = (select auth.uid()) and p.status = 'active');
$$;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.organizations o on o.id = p.organization_id and o.status = 'active'
    where p.id = (select auth.uid()) and p.status = 'active' and p.role = 'admin');
$$;

create or replace function private.is_active_seller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.organizations o on o.id = p.organization_id and o.status = 'active'
    where p.id = (select auth.uid()) and p.status = 'active' and p.role = 'seller');
$$;

-- Garante usuário ativo; devolve o perfil (id, organização, papel).
create or replace function private.require_active_user(out user_id uuid, out organization_id uuid, out role public.user_role)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select p.id, p.organization_id, p.role
    into user_id, organization_id, role
  from public.profiles p
  join public.organizations o on o.id = p.organization_id and o.status = 'active'
  where p.id = (select auth.uid()) and p.status = 'active';
  if user_id is null then
    raise exception 'Acesso negado: usuário não autenticado ou inativo' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.require_admin(out user_id uuid, out organization_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  select r.user_id, r.organization_id, r.role into user_id, organization_id, v_role
  from private.require_active_user() r;
  if v_role <> 'admin' then
    raise exception 'Acesso negado: operação exclusiva de administradores' using errcode = '42501';
  end if;
end;
$$;

-- Registro de auditoria. Chamado pelas rotinas transacionais.
create or replace function private.log_audit(
  p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_previous jsonb default null, p_new jsonb default null, p_source text default 'app')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id,
                                 previous_values, new_values, request_id, source)
  values (p_organization_id,
          (select auth.uid()),
          p_action, p_entity_type, p_entity_id, p_previous, p_new,
          nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', ''),
          p_source);
end;
$$;

-- Trigger genérico de auditoria para tabelas de configuração.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_org := old.organization_id; v_id := old.id;
  else
    v_org := new.organization_id; v_id := new.id;
  end if;
  perform private.log_audit(v_org, lower(tg_op), tg_table_name, v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    'database');
  return coalesce(new, old);
end;
$$;

-- Proteção de colunas administrativas de profiles: ninguém altera o próprio
-- papel, status ou organização (inclusive administradores: exige outro admin).
create or replace function private.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id <> old.id or new.organization_id <> old.organization_id then
    raise exception 'Alteração de identidade/organização não permitida' using errcode = '42501';
  end if;
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and old.id = (select auth.uid())
     -- Única exceção: ativação do próprio convite (invited → active), via rotina dedicada.
     and not (old.status = 'invited' and new.status = 'active' and new.role = old.role
              and current_setting('one.profile_activation', true) = 'on') then
    raise exception 'Usuário não pode alterar o próprio papel ou status' using errcode = '42501';
  end if;
  if new.role is distinct from old.role or new.status is distinct from old.status then
    perform private.log_audit(old.organization_id, 'profile_role_status_changed', 'profiles', old.id,
      jsonb_build_object('role', old.role, 'status', old.status),
      jsonb_build_object('role', new.role, 'status', new.status));
  end if;
  return new;
end;
$$;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

-- Helpers podem ser executados por authenticated (necessário às policies),
-- mas nunca por anon.
revoke all on all functions in schema private from public;
grant execute on function
  private.current_organization_id(), private.is_active_user(), private.is_active_admin(),
  private.is_active_seller()
  to authenticated, service_role;
