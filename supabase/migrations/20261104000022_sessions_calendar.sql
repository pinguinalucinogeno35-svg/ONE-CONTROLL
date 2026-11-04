-- =============================================================================
-- ONE CONTROL — 0022 Sessões de produção e calendário (setor de produção, fase 6)
-- =============================================================================
--  * Sessão = um evento com várias pessoas (captação, fotos, reunião,
--    entrega/visita). Uma captação com filmmaker e fotógrafo é UMA sessão,
--    ligada aos trabalhos de cada um (T12).
--  * Visibilidade: administração, quem criou e participantes. Participantes
--    veem o nome do cliente e o kit do cliente da sessão.
--  * Conflitos de agenda (outra sessão no mesmo horário ou ausência) geram
--    AVISO para a gestão; nunca bloqueiam.
--  * calendar_feed reúne sessões, prazos de trabalhos e ausências no período.
-- =============================================================================

alter type public.notification_type add value if not exists 'session_scheduled';
alter type public.notification_type add value if not exists 'session_updated';

create type public.session_kind as enum ('shoot', 'photo', 'meeting', 'delivery', 'other');

create table public.production_sessions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  kind            public.session_kind not null,
  title           text not null check (length(btrim(title)) between 3 and 160),
  client_id       uuid null references public.clients (id),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  location        text null check (location is null or length(location) <= 160),
  address         text null check (address is null or length(address) <= 300),
  meeting_point   text null check (meeting_point is null or length(meeting_point) <= 300),
  contacts        text null check (contacts is null or length(contacts) <= 500),
  checklist       text null check (checklist is null or length(checklist) <= 2000),
  notes           text null check (notes is null or length(notes) <= 2000),
  created_by      uuid not null references public.profiles (id),
  cancelled_at    timestamptz null,
  cancel_reason   text null check (cancel_reason is null or length(cancel_reason) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours'),
  check ((cancelled_at is null) = (cancel_reason is null))
);
create index idx_sessions_org_time on public.production_sessions (organization_id, starts_at);
create index idx_sessions_client on public.production_sessions (client_id);
create index idx_sessions_created_by on public.production_sessions (created_by);
create trigger trg_sessions_updated before update on public.production_sessions for each row execute function private.set_updated_at();

create table public.session_participants (
  session_id uuid not null references public.production_sessions (id) on delete cascade,
  user_id    uuid not null references public.profiles (id),
  role_note  text null check (role_note is null or length(role_note) <= 80),
  primary key (session_id, user_id)
);
create index idx_session_participants_user on public.session_participants (user_id);

create table public.session_works (
  session_id uuid not null references public.production_sessions (id) on delete cascade,
  work_id    uuid not null references public.works (id) on delete cascade,
  primary key (session_id, work_id)
);
create index idx_session_works_work on public.session_works (work_id);

create or replace function private.can_view_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.production_sessions s
     where s.id = p_session and s.organization_id = (select private.current_organization_id())
       and ((select private.is_active_admin()) or s.created_by = (select auth.uid())
            or exists (select 1 from public.session_participants sp where sp.session_id = s.id and sp.user_id = (select auth.uid()))));
$$;
revoke all on function private.can_view_session(uuid) from public;
grant execute on function private.can_view_session(uuid) to authenticated, service_role;

alter table public.production_sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.session_works enable row level security;
revoke all on public.production_sessions, public.session_participants, public.session_works from anon, authenticated;
grant select on public.production_sessions, public.session_participants, public.session_works to authenticated;
create policy sessions_select on public.production_sessions for select to authenticated using ((select private.can_view_session(id)));
create policy session_participants_select on public.session_participants for select to authenticated using ((select private.can_view_session(session_id)));
create policy session_works_select on public.session_works for select to authenticated using ((select private.can_view_session(session_id)));

-- Participante de sessão do cliente também vê o nome e o kit do cliente.
create or replace function private.can_view_client_kit(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clients c
     where c.id = p_client and c.organization_id = (select private.current_organization_id())
       and ((select private.is_active_admin()) or c.seller_id = (select auth.uid())
            or exists (select 1 from public.works w where w.client_id = c.id and private.can_view_work(w.id))
            or exists (select 1 from public.production_sessions s where s.client_id = c.id and s.cancelled_at is null and private.can_view_session(s.id))));
$$;

create or replace function public.visible_client_names()
returns table (id uuid, company_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record;
begin
  select * into a from private.require_active_user();
  return query
  select c.id, c.company_name from public.clients c
   where c.organization_id = a.organization_id
     and (a.role::text = 'admin'
          or exists (select 1 from public.works w where w.client_id = c.id and private.can_view_work(w.id))
          or exists (select 1 from public.production_sessions s where s.client_id = c.id and private.can_view_session(s.id)))
   order by c.company_name;
end;
$$;

create or replace function private.session_kind_label(p public.session_kind)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p when 'shoot' then 'Captação de vídeo' when 'photo' then 'Sessão de fotos' when 'meeting' then 'Reunião de produção'
    when 'delivery' then 'Entrega/visita' else 'Compromisso' end;
$$;

create or replace function private.notify_session(p_session uuid, p_recipient uuid, p_kind text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare s record; v_recipient text; v_actor text; v_when text;
begin
  if p_recipient is null or p_recipient = p_actor then return; end if;
  select * into s from public.production_sessions where id = p_session;
  select full_name into v_recipient from public.profiles where id = p_recipient and status = 'active';
  if v_recipient is null then return; end if;
  select coalesce(full_name, 'O sistema') into v_actor from public.profiles where id = p_actor;
  v_when := to_char(s.starts_at at time zone 'America/Bahia', 'DD/MM "às" HH24:MI') || '–' || to_char(s.ends_at at time zone 'America/Bahia', 'HH24:MI');
  perform private.notify(s.organization_id, p_recipient,
    case when p_kind = 'scheduled' then 'session_scheduled' else 'session_updated' end::public.notification_type,
    case p_kind when 'scheduled' then private.first_name(v_recipient) || ', você está em uma ' || lower(private.session_kind_label(s.kind))
                when 'cancelled' then private.first_name(v_recipient) || ', sessão cancelada'
                else private.first_name(v_recipient) || ', sessão alterada' end,
    v_actor || ': “' || s.title || '” · ' || v_when || coalesce(' · ' || s.location, '')
      || case when p_kind = 'cancelled' then ' — ' || coalesce(s.cancel_reason, '') else '' end || '.',
    'production_sessions', s.id);
end;
$$;

-- Conflitos de agenda dos participantes (aviso; não bloqueia).
create or replace function private.session_conflicts(p_session uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(c order by c ->> 'name'), '[]'::jsonb) from (
    select jsonb_build_object('user_id', sp.user_id, 'name', p.full_name, 'kind', 'session', 'title', o.title) as c
      from public.production_sessions s
      join public.session_participants sp on sp.session_id = s.id
      join public.profiles p on p.id = sp.user_id
      join public.session_participants op on op.user_id = sp.user_id and op.session_id <> s.id
      join public.production_sessions o on o.id = op.session_id and o.cancelled_at is null
           and o.starts_at < s.ends_at and o.ends_at > s.starts_at
     where s.id = p_session
    union all
    select jsonb_build_object('user_id', sp.user_id, 'name', p.full_name, 'kind', 'absence', 'title', coalesce(ab.reason, 'Ausência'))
      from public.production_sessions s
      join public.session_participants sp on sp.session_id = s.id
      join public.profiles p on p.id = sp.user_id
      join public.absences ab on ab.user_id = sp.user_id and ab.cancelled_at is null
           and ab.starts_on <= (s.ends_at at time zone 'America/Bahia')::date and ab.ends_on >= (s.starts_at at time zone 'America/Bahia')::date
     where s.id = p_session
  ) x;
$$;

-- Cria ou altera uma sessão (administração). Devolve {id, conflicts}.
create or replace function public.save_session(p_session uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record; s record; v_id uuid; v_client uuid := nullif(p ->> 'client_id', '')::uuid; v_user uuid; v_work uuid;
  v_starts timestamptz := (p ->> 'starts_at')::timestamptz; v_ends timestamptz := (p ->> 'ends_at')::timestamptz;
  v_changed boolean := false; v_users uuid[]; v_old uuid[] := '{}';
begin
  select * into a from private.require_admin();
  if v_starts is null or v_ends is null or v_ends <= v_starts then raise exception 'Horário inválido: o fim deve ser depois do início' using errcode = '22023'; end if;
  if v_ends - v_starts > interval '24 hours' then raise exception 'Uma sessão dura no máximo 24 horas' using errcode = '22023'; end if;
  if v_client is not null and not exists (select 1 from public.clients where id = v_client and organization_id = a.organization_id) then
    raise exception 'Cliente inválido' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct (x #>> '{}')::uuid), '{}') into v_users from jsonb_array_elements(coalesce(p -> 'participants', '[]'::jsonb)) x;
  if coalesce(array_length(v_users, 1), 0) = 0 then raise exception 'Inclua pelo menos um participante' using errcode = '22023'; end if;
  if array_length(v_users, 1) > 20 then raise exception 'Máximo de 20 participantes' using errcode = '22023'; end if;
  foreach v_user in array v_users loop perform private.assert_active_member(a.organization_id, v_user, 'Participante'); end loop;

  if p_session is null then
    insert into public.production_sessions (organization_id, kind, title, client_id, starts_at, ends_at, location, address, meeting_point,
      contacts, checklist, notes, created_by)
    values (a.organization_id, (p ->> 'kind')::public.session_kind, btrim(p ->> 'title'), v_client, v_starts, v_ends,
      private.text_or_null(p, 'location', 160), private.text_or_null(p, 'address', 300), private.text_or_null(p, 'meeting_point', 300),
      private.text_or_null(p, 'contacts', 500), private.text_or_null(p, 'checklist', 2000), private.text_or_null(p, 'notes', 2000), a.user_id)
    returning id into v_id;
  else
    select * into s from public.production_sessions where id = p_session and organization_id = a.organization_id for update;
    if s.id is null then raise exception 'Sessão não encontrada' using errcode = 'P0002'; end if;
    if s.cancelled_at is not null then raise exception 'Sessão cancelada não pode ser alterada' using errcode = '22023'; end if;
    v_changed := s.starts_at <> v_starts or s.ends_at <> v_ends or s.location is distinct from private.text_or_null(p, 'location', 160)
                 or s.address is distinct from private.text_or_null(p, 'address', 300);
    update public.production_sessions set kind = (p ->> 'kind')::public.session_kind, title = btrim(p ->> 'title'), client_id = v_client,
      starts_at = v_starts, ends_at = v_ends, location = private.text_or_null(p, 'location', 160), address = private.text_or_null(p, 'address', 300),
      meeting_point = private.text_or_null(p, 'meeting_point', 300), contacts = private.text_or_null(p, 'contacts', 500),
      checklist = private.text_or_null(p, 'checklist', 2000), notes = private.text_or_null(p, 'notes', 2000)
    where id = s.id;
    v_id := s.id;
    select coalesce(array_agg(user_id), '{}') into v_old from public.session_participants where session_id = v_id;
    delete from public.session_participants where session_id = v_id and not (user_id = any(v_users));
    delete from public.session_works where session_id = v_id;
  end if;

  foreach v_user in array v_users loop
    insert into public.session_participants (session_id, user_id, role_note)
    values (v_id, v_user, (select nullif(btrim(left(r ->> 'note', 80)), '') from jsonb_array_elements(coalesce(p -> 'roles', '[]'::jsonb)) r
                           where (r ->> 'user_id')::uuid = v_user limit 1))
    on conflict (session_id, user_id) do update set role_note = excluded.role_note;
    if not (v_user = any(v_old)) then perform private.notify_session(v_id, v_user, 'scheduled', a.user_id);
    elsif v_changed then perform private.notify_session(v_id, v_user, 'updated', a.user_id); end if;
  end loop;

  for v_work in select distinct (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'works', '[]'::jsonb)) x loop
    if not exists (select 1 from public.works where id = v_work and organization_id = a.organization_id) then
      raise exception 'Trabalho inválido' using errcode = '22023';
    end if;
    insert into public.session_works (session_id, work_id) values (v_id, v_work);
    perform private.work_event(v_work, a.user_id, 'session_linked', btrim(p ->> 'title'), jsonb_build_object('session_id', v_id));
  end loop;

  return jsonb_build_object('id', v_id, 'conflicts', private.session_conflicts(v_id));
end;
$$;

create or replace function public.cancel_session(p_session uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; s record; v_user uuid;
begin
  select * into a from private.require_admin();
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into s from public.production_sessions where id = p_session and organization_id = a.organization_id for update;
  if s.id is null then raise exception 'Sessão não encontrada' using errcode = 'P0002'; end if;
  if s.cancelled_at is not null then return; end if;
  update public.production_sessions set cancelled_at = now(), cancel_reason = left(btrim(p_reason), 300) where id = s.id;
  for v_user in select user_id from public.session_participants where session_id = s.id loop
    perform private.notify_session(s.id, v_user, 'cancelled', a.user_id);
  end loop;
end;
$$;

-- Conflitos de uma sessão (para a tela da gestão).
create or replace function public.session_conflicts(p_session uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return private.session_conflicts(p_session);
end;
$$;

-- Agenda do período: sessões, prazos de trabalhos e ausências visíveis a quem consulta.
create or replace function public.calendar_feed(p_from date, p_to date, p_user uuid default null)
returns table (item_type text, item_id uuid, title text, starts_at timestamptz, ends_at timestamptz, day date,
               subtype text, client_id uuid, people uuid[], status text, location text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record; v_admin boolean;
begin
  select * into a from private.require_active_user();
  v_admin := a.role::text = 'admin';
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Período inválido (máximo de 62 dias)' using errcode = '22023';
  end if;
  if p_user is not null and not v_admin and p_user <> a.user_id then
    raise exception 'Somente a gestão consulta a agenda de outra pessoa' using errcode = '42501';
  end if;
  return query
  select 'session'::text, s.id, s.title, s.starts_at, s.ends_at, (s.starts_at at time zone 'America/Bahia')::date, s.kind::text, s.client_id,
         (select array_agg(sp.user_id order by sp.user_id) from public.session_participants sp where sp.session_id = s.id),
         case when s.cancelled_at is null then 'active' else 'cancelled' end, s.location
    from public.production_sessions s
   where s.organization_id = a.organization_id
     and (s.starts_at at time zone 'America/Bahia')::date between p_from and p_to
     and (v_admin or s.created_by = a.user_id or exists (select 1 from public.session_participants sp where sp.session_id = s.id and sp.user_id = a.user_id))
     and (p_user is null or exists (select 1 from public.session_participants sp where sp.session_id = s.id and sp.user_id = p_user))
  union all
  select 'work_due', w.id, w.title, null::timestamptz, null::timestamptz, w.due_current, w.category::text, w.client_id,
         (select array_agg(wa.user_id order by wa.user_id) from public.work_assignees wa where wa.work_id = w.id),
         w.status::text, null::text
    from public.works w
   where w.organization_id = a.organization_id and w.due_current between p_from and p_to and w.status <> 'cancelled'
     and (v_admin or w.created_by = a.user_id or w.reviewer_id = a.user_id
          or exists (select 1 from public.work_assignees wa where wa.work_id = w.id and wa.user_id = a.user_id))
     and (p_user is null or exists (select 1 from public.work_assignees wa where wa.work_id = w.id and wa.user_id = p_user))
  union all
  select 'absence', ab.id, coalesce(ab.reason, 'Ausência'), null::timestamptz, null::timestamptz, d::date, 'absence', null::uuid,
         array[ab.user_id], 'active', null::text
    from public.absences ab
    cross join lateral generate_series(greatest(ab.starts_on, p_from), least(ab.ends_on, p_to), interval '1 day') d
   where ab.organization_id = a.organization_id and ab.cancelled_at is null and ab.starts_on <= p_to and ab.ends_on >= p_from
     and (v_admin or ab.user_id = a.user_id)
     and (p_user is null or ab.user_id = p_user)
  order by 6, 4 nulls last;
end;
$$;

revoke all on function private.session_kind_label(public.session_kind), private.notify_session(uuid, uuid, text, uuid),
  private.session_conflicts(uuid) from public;
revoke execute on function public.save_session(uuid, jsonb), public.cancel_session(uuid, text), public.session_conflicts(uuid),
  public.calendar_feed(date, date, uuid) from public, anon;
grant execute on function public.save_session(uuid, jsonb), public.cancel_session(uuid, text), public.session_conflicts(uuid),
  public.calendar_feed(date, date, uuid) to authenticated;
