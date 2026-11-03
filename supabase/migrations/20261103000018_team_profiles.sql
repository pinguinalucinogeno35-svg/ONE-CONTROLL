-- =============================================================================
-- ONE CONTROL — 0018 Perfil de trabalho, primeiro acesso e ausências
-- =============================================================================
-- Setor de produção, fase 2 (docs/integracao/PLANO_SETOR_PRODUCAO.md).
--  * A função profissional é apenas PREFERÊNCIA de interface: não concede
--    permissão nem restringe o tipo de trabalho que a pessoa pode receber.
--  * Disponibilidade em blocos semanais (presencial/remoto/externo). Blocos
--    sobrepostos NÃO são somados em dobro. Sem informação = desconhecido
--    (nulo), nunca zero.
--  * Cada pessoa mantém o próprio perfil e as próprias ausências; a
--    administração vê a equipe e registra ausências de qualquer pessoa.
-- =============================================================================

create type public.work_function as enum (
  'design', 'filmmaking', 'photography', 'editing', 'development', 'management', 'commercial', 'administrative', 'other');

create table public.team_profiles (
  user_id                 uuid primary key references public.profiles (id) on delete cascade,
  organization_id         uuid not null references public.organizations (id),
  primary_function        public.work_function not null,
  secondary_function      public.work_function null,
  works_onsite            boolean not null default false,
  works_remote            boolean not null default false,
  works_external          boolean not null default false,
  availability            jsonb not null default '[]'::jsonb
                            check (jsonb_typeof(availability) = 'array' and jsonb_array_length(availability) <= 28),
  weekly_hours_declared   numeric(4,1) null check (weekly_hours_declared is null or weekly_hours_declared between 0 and 80),
  phone                   text null check (phone is null or length(phone) <= 30),
  tools                   text null check (tools is null or length(tools) <= 500),
  equipment               text null check (equipment is null or length(equipment) <= 500),
  travel_notes            text null check (travel_notes is null or length(travel_notes) <= 500),
  notes                   text null check (notes is null or length(notes) <= 1000),
  rules_accepted_at       timestamptz null,
  onboarding_completed_at timestamptz null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (onboarding_completed_at is null or rules_accepted_at is not null)
);
create index idx_team_profiles_org on public.team_profiles (organization_id);
create trigger trg_team_profiles_updated before update on public.team_profiles
  for each row execute function private.set_updated_at();

create table public.absences (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id         uuid not null references public.profiles (id),
  starts_on       date not null,
  ends_on         date not null,
  reason          text null check (reason is null or length(reason) <= 200),
  created_by      uuid not null references public.profiles (id),
  cancelled_at    timestamptz null,
  created_at      timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 366)
);
create index idx_absences_user on public.absences (user_id, starts_on);
create index idx_absences_org on public.absences (organization_id, starts_on);
create index idx_absences_created_by on public.absences (created_by);

alter table public.team_profiles enable row level security;
alter table public.absences enable row level security;
revoke all on public.team_profiles, public.absences from anon, authenticated;
grant select on public.team_profiles, public.absences to authenticated;
create policy team_profiles_select on public.team_profiles for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and (user_id = (select auth.uid()) or (select private.is_active_admin())));
create policy absences_select on public.absences for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and (user_id = (select auth.uid()) or (select private.is_active_admin())));

-- Minutos semanais cobertos pelos blocos (união por dia: sobreposição conta uma vez).
create or replace function private.availability_minutes(p jsonb, p_mode text default null)
returns integer
language sql
immutable
set search_path = ''
as $$
  with b as (
    select (e ->> 'day')::int as d,
           split_part(e ->> 'start', ':', 1)::int * 60 + split_part(e ->> 'start', ':', 2)::int as s,
           split_part(e ->> 'end', ':', 1)::int * 60 + split_part(e ->> 'end', ':', 2)::int as f
      from jsonb_array_elements(coalesce(p, '[]'::jsonb)) e
     where p_mode is null or e ->> 'mode' = p_mode
  ), o as (
    select d, s, f, max(f) over (partition by d order by s, f rows between unbounded preceding and 1 preceding) as prev_max from b
  ), g as (
    select d, s, f, sum(case when prev_max is null or s > prev_max then 1 else 0 end) over (partition by d order by s, f) as grp from o
  )
  select coalesce(sum(f2 - s2), 0)::int from (select d, grp, min(s) as s2, max(f) as f2 from g group by d, grp) x;
$$;

-- Valida a lista de blocos: [{day 1-7, start "HH:MM", end "HH:MM", mode}].
create or replace function private.validate_availability(p jsonb, p_onsite boolean, p_remote boolean, p_external boolean)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare e jsonb; v_s int; v_f int;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 28 then
    raise exception 'Disponibilidade inválida (máximo de 28 blocos)' using errcode = '22023';
  end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'day', '') !~ '^[1-7]$'
       or coalesce(e ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(e ->> 'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(e ->> 'mode', '') not in ('onsite', 'remote', 'external') then
      raise exception 'Bloco de horário inválido' using errcode = '22023';
    end if;
    v_s := split_part(e ->> 'start', ':', 1)::int * 60 + split_part(e ->> 'start', ':', 2)::int;
    v_f := split_part(e ->> 'end', ':', 1)::int * 60 + split_part(e ->> 'end', ':', 2)::int;
    if v_f <= v_s then raise exception 'O horário final deve ser depois do inicial' using errcode = '22023'; end if;
    if (e ->> 'mode' = 'onsite' and not p_onsite) or (e ->> 'mode' = 'remote' and not p_remote)
       or (e ->> 'mode' = 'external' and not p_external) then
      raise exception 'Marque o formato de trabalho usado nos horários (presencial, remoto ou externo)' using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- Salva o próprio perfil de trabalho. complete=true conclui o primeiro acesso.
create or replace function public.save_my_team_profile(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record; v_avail jsonb := coalesce(p -> 'availability', '[]'::jsonb);
  v_onsite boolean := coalesce((p ->> 'works_onsite')::boolean, false);
  v_remote boolean := coalesce((p ->> 'works_remote')::boolean, false);
  v_external boolean := coalesce((p ->> 'works_external')::boolean, false);
  v_hours numeric(4,1) := nullif(p ->> 'weekly_hours_declared', '')::numeric(4,1);
  v_complete boolean := coalesce((p ->> 'complete')::boolean, false);
  v_rules boolean := coalesce((p ->> 'accept_rules')::boolean, false);
  v_primary public.work_function := nullif(p ->> 'primary_function', '')::public.work_function;
  v_secondary public.work_function := nullif(p ->> 'secondary_function', '')::public.work_function;
begin
  select * into a from private.require_active_user();
  if v_primary is null then raise exception 'Informe sua função principal' using errcode = '22023'; end if;
  if v_secondary = v_primary then v_secondary := null; end if;
  perform private.validate_availability(v_avail, v_onsite, v_remote, v_external);
  if v_complete then
    if not (v_onsite or v_remote or v_external) then
      raise exception 'Informe pelo menos um formato de trabalho' using errcode = '22023';
    end if;
    if jsonb_array_length(v_avail) = 0 and v_hours is null then
      raise exception 'Informe seus horários ou o total de horas por semana' using errcode = '22023';
    end if;
    if not v_rules then raise exception 'É preciso confirmar as regras internas' using errcode = '22023'; end if;
  end if;
  insert into public.team_profiles as t (user_id, organization_id, primary_function, secondary_function,
    works_onsite, works_remote, works_external, availability, weekly_hours_declared,
    phone, tools, equipment, travel_notes, notes, rules_accepted_at, onboarding_completed_at)
  values (a.user_id, a.organization_id, v_primary, v_secondary, v_onsite, v_remote, v_external, v_avail, v_hours,
    private.text_or_null(p, 'phone', 30), private.text_or_null(p, 'tools', 500), private.text_or_null(p, 'equipment', 500),
    private.text_or_null(p, 'travel_notes', 500), private.text_or_null(p, 'notes', 1000),
    case when v_rules then now() end, case when v_complete then now() end)
  on conflict (user_id) do update set
    primary_function = excluded.primary_function, secondary_function = excluded.secondary_function,
    works_onsite = excluded.works_onsite, works_remote = excluded.works_remote, works_external = excluded.works_external,
    availability = excluded.availability, weekly_hours_declared = excluded.weekly_hours_declared,
    phone = excluded.phone, tools = excluded.tools, equipment = excluded.equipment,
    travel_notes = excluded.travel_notes, notes = excluded.notes,
    rules_accepted_at = coalesce(t.rules_accepted_at, excluded.rules_accepted_at),
    onboarding_completed_at = coalesce(t.onboarding_completed_at, excluded.onboarding_completed_at);
end;
$$;

-- Ausência: a própria pessoa, ou a administração para qualquer colaborador.
create or replace function public.add_absence(p_starts date, p_ends date, p_reason text default null, p_user_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; v_user uuid; v_id uuid;
begin
  select * into a from private.require_active_user();
  v_user := coalesce(p_user_id, a.user_id);
  if v_user <> a.user_id and a.role::text <> 'admin' then
    raise exception 'Somente a administração registra ausência de outra pessoa' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_user and organization_id = a.organization_id and status in ('active', 'invited')) then
    raise exception 'Colaborador não encontrado' using errcode = 'P0002';
  end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  insert into public.absences (organization_id, user_id, starts_on, ends_on, reason, created_by)
  values (a.organization_id, v_user, p_starts, p_ends, nullif(btrim(left(p_reason, 200)), ''), a.user_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancel_absence(p_absence_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; x record;
begin
  select * into a from private.require_active_user();
  select * into x from public.absences where id = p_absence_id and organization_id = a.organization_id for update;
  if x.id is null or (x.user_id <> a.user_id and a.role::text <> 'admin') then
    raise exception 'Ausência não encontrada' using errcode = 'P0002';
  end if;
  if x.cancelled_at is null then update public.absences set cancelled_at = now() where id = x.id; end if;
end;
$$;

-- Visão da equipe para a gestão (somente administração).
create or replace function public.team_overview()
returns table (user_id uuid, full_name text, role public.user_role, status public.profile_status,
               primary_function public.work_function, secondary_function public.work_function,
               works_onsite boolean, works_remote boolean, works_external boolean,
               weekly_minutes integer, onsite_minutes integer, remote_minutes integer, external_minutes integer,
               weekly_hours_declared numeric, onboarding_completed boolean, next_absence_start date, next_absence_end date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record;
begin
  select * into a from private.require_admin();
  return query
  select p.id, p.full_name, p.role, p.status, t.primary_function, t.secondary_function,
         coalesce(t.works_onsite, false), coalesce(t.works_remote, false), coalesce(t.works_external, false),
         case when t.user_id is null or jsonb_array_length(t.availability) = 0 then null else private.availability_minutes(t.availability) end,
         case when t.user_id is null or jsonb_array_length(t.availability) = 0 then null else private.availability_minutes(t.availability, 'onsite') end,
         case when t.user_id is null or jsonb_array_length(t.availability) = 0 then null else private.availability_minutes(t.availability, 'remote') end,
         case when t.user_id is null or jsonb_array_length(t.availability) = 0 then null else private.availability_minutes(t.availability, 'external') end,
         t.weekly_hours_declared, t.onboarding_completed_at is not null,
         nx.starts_on, nx.ends_on
    from public.profiles p
    left join public.team_profiles t on t.user_id = p.id
    left join lateral (
      select ab.starts_on, ab.ends_on from public.absences ab
       where ab.user_id = p.id and ab.cancelled_at is null and ab.ends_on >= private.today()
       order by ab.starts_on limit 1) nx on true
   where p.organization_id = a.organization_id and p.status in ('active', 'invited')
   order by p.full_name;
end;
$$;

revoke all on function private.availability_minutes(jsonb, text), private.validate_availability(jsonb, boolean, boolean, boolean) from public;
revoke execute on function public.save_my_team_profile(jsonb), public.add_absence(date, date, text, uuid),
  public.cancel_absence(uuid), public.team_overview() from public, anon;
grant execute on function public.save_my_team_profile(jsonb), public.add_absence(date, date, text, uuid),
  public.cancel_absence(uuid), public.team_overview() to authenticated;
