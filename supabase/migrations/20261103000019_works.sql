-- =============================================================================
-- ONE CONTROL — 0019 Trabalhos (setor de produção, fase 3)
-- =============================================================================
-- Ficha única de trabalho para qualquer categoria (carrossel, foto, filmagem,
-- edição, web, administrativo…). Regras (docs/integracao/PLANO_SETOR_PRODUCAO.md):
--  * Qualquer colaborador ativo pode ser responsável por qualquer categoria;
--    a função profissional não restringe nada.
--  * Visibilidade: administração; quem criou; quem revisa; responsáveis.
--    A produção vê apenas o NOME do cliente dos seus trabalhos (sem dados
--    comerciais) — via visible_client_names().
--  * Estados: draft (A preparar) → ready (Pronto) → in_production → in_review
--    → done; cancelled. "Bloqueado" é indicador com motivo, não estado.
--  * Pronto exige responsável e todos os itens obrigatórios concluídos
--    ("Aguardando material" enquanto faltar). Revisão exige link de prévia;
--    conclusão exige link da entrega final e NÃO pode ser feita por quem
--    executou (sem autocertificação).
--  * Prazo original é imutável; o vigente muda com motivo registrado.
--  * Histórico append-only em work_events (inclui comentários).
-- =============================================================================

alter type public.notification_type add value if not exists 'work_assigned';
alter type public.notification_type add value if not exists 'work_updated';
alter type public.notification_type add value if not exists 'work_commented';
alter type public.notification_type add value if not exists 'work_review_requested';
alter type public.notification_type add value if not exists 'work_approved';
alter type public.notification_type add value if not exists 'work_changes_requested';

create type public.work_category as enum ('post', 'carousel', 'design', 'photo', 'video_shoot', 'video_edit', 'web', 'admin', 'other');
create type public.work_status as enum ('draft', 'ready', 'in_production', 'in_review', 'done', 'cancelled');
create type public.work_item_kind as enum ('slide', 'scene', 'shot', 'requirement', 'checklist');
create type public.work_link_kind as enum ('reference', 'material', 'raw', 'preview', 'editable', 'final', 'other');

create table public.works (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id),
  client_id          uuid null references public.clients (id),
  project_id         uuid null references public.projects (id),
  title              text not null check (length(btrim(title)) between 3 and 160),
  category           public.work_category not null,
  objective          text null check (objective is null or length(objective) <= 1000),
  instructions       text null check (instructions is null or length(instructions) <= 8000),
  deliverable_format text null check (deliverable_format is null or length(deliverable_format) <= 500),
  status             public.work_status not null default 'draft',
  due_original       date null,
  due_current        date null,
  estimated_hours    numeric(5,1) null check (estimated_hours is null or estimated_hours between 0 and 999),
  blocked_reason     text null check (blocked_reason is null or length(blocked_reason) between 3 and 500),
  blocked_at         timestamptz null,
  reviewer_id        uuid null references public.profiles (id),
  created_by         uuid not null references public.profiles (id),
  completed_at       timestamptz null,
  cancelled_at       timestamptz null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((status = 'done') = (completed_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check ((blocked_reason is null) = (blocked_at is null)),
  check ((due_original is null) = (due_current is null))
);
create index idx_works_org_status on public.works (organization_id, status, due_current);
create index idx_works_client on public.works (client_id);
create index idx_works_project on public.works (project_id);
create index idx_works_reviewer on public.works (reviewer_id);
create index idx_works_created_by on public.works (created_by);
create trigger trg_works_updated before update on public.works for each row execute function private.set_updated_at();

create table public.work_assignees (
  work_id     uuid not null references public.works (id) on delete cascade,
  user_id     uuid not null references public.profiles (id),
  assigned_by uuid not null references public.profiles (id),
  assigned_at timestamptz not null default now(),
  primary key (work_id, user_id)
);
create index idx_work_assignees_user on public.work_assignees (user_id);
create index idx_work_assignees_by on public.work_assignees (assigned_by);

create table public.work_items (
  id         uuid primary key default gen_random_uuid(),
  work_id    uuid not null references public.works (id) on delete cascade,
  kind       public.work_item_kind not null,
  position   integer not null default 0 check (position between 0 and 999),
  title      text not null check (length(btrim(title)) between 1 and 200),
  body       text null check (body is null or length(body) <= 4000),
  required   boolean not null default false,
  done       boolean not null default false,
  done_by    uuid null references public.profiles (id),
  done_at    timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (done = (done_at is not null))
);
create index idx_work_items_work on public.work_items (work_id, kind, position);
create index idx_work_items_done_by on public.work_items (done_by);
create trigger trg_work_items_updated before update on public.work_items for each row execute function private.set_updated_at();

create table public.work_links (
  id                  uuid primary key default gen_random_uuid(),
  work_id             uuid not null references public.works (id) on delete cascade,
  kind                public.work_link_kind not null,
  label               text not null check (length(btrim(label)) between 1 and 160),
  url                 text not null check (url ~ '^https://[^\s]+$' and length(url) <= 2000),
  note                text null check (note is null or length(note) <= 500),
  created_by          uuid not null references public.profiles (id),
  created_at          timestamptz not null default now(),
  backup_confirmed_at timestamptz null,
  backup_confirmed_by uuid null references public.profiles (id),
  removed_at          timestamptz null,
  removed_by          uuid null references public.profiles (id),
  check ((backup_confirmed_at is null) = (backup_confirmed_by is null))
);
create index idx_work_links_work on public.work_links (work_id, kind) where removed_at is null;
create index idx_work_links_created_by on public.work_links (created_by);
create index idx_work_links_backup_by on public.work_links (backup_confirmed_by);
create index idx_work_links_removed_by on public.work_links (removed_by);

create table public.work_events (
  id         uuid primary key default gen_random_uuid(),
  work_id    uuid not null references public.works (id) on delete cascade,
  actor_id   uuid null references public.profiles (id),
  kind       text not null check (length(kind) <= 40),
  body       text null check (body is null or length(body) <= 2000),
  data       jsonb null,
  created_at timestamptz not null default now()
);
create index idx_work_events_work on public.work_events (work_id, created_at);
create index idx_work_events_actor on public.work_events (actor_id);
create trigger trg_work_events_immutable before update or delete on public.work_events
  for each row execute function private.forbid_mutation();

-- ----------------------------------------------------------------------------
-- Acesso
-- ----------------------------------------------------------------------------
create or replace function private.can_view_work(p_work uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.works w
     where w.id = p_work and w.organization_id = (select private.current_organization_id())
       and ((select private.is_active_admin()) or w.created_by = (select auth.uid()) or w.reviewer_id = (select auth.uid())
            or exists (select 1 from public.work_assignees a where a.work_id = w.id and a.user_id = (select auth.uid()))));
$$;
revoke all on function private.can_view_work(uuid) from public;
grant execute on function private.can_view_work(uuid) to authenticated, service_role;

alter table public.works enable row level security;
alter table public.work_assignees enable row level security;
alter table public.work_items enable row level security;
alter table public.work_links enable row level security;
alter table public.work_events enable row level security;
revoke all on public.works, public.work_assignees, public.work_items, public.work_links, public.work_events from anon, authenticated;
grant select on public.works, public.work_assignees, public.work_items, public.work_links, public.work_events to authenticated;
create policy works_select on public.works for select to authenticated using ((select private.can_view_work(id)));
create policy work_assignees_select on public.work_assignees for select to authenticated using ((select private.can_view_work(work_id)));
create policy work_items_select on public.work_items for select to authenticated using ((select private.can_view_work(work_id)));
create policy work_links_select on public.work_links for select to authenticated using ((select private.can_view_work(work_id)));
create policy work_events_select on public.work_events for select to authenticated using ((select private.can_view_work(work_id)));

-- Papel do usuário em um trabalho (para as rotinas).
create or replace function private.work_role(p_work public.works, p_user uuid, p_role public.user_role)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_role::text = 'admin' then 'manager'
    when p_work.created_by = p_user then 'manager'
    when p_work.reviewer_id = p_user then 'reviewer'
    when exists (select 1 from public.work_assignees a where a.work_id = p_work.id and a.user_id = p_user) then 'assignee'
    else null end;
$$;

create or replace function private.is_work_assignee(p_work uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.work_assignees where work_id = p_work and user_id = p_user);
$$;

create or replace function private.work_category_label(p public.work_category)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p when 'post' then 'Post' when 'carousel' then 'Carrossel' when 'design' then 'Design' when 'photo' then 'Fotografia'
    when 'video_shoot' then 'Filmagem' when 'video_edit' then 'Edição de vídeo' when 'web' then 'Web' when 'admin' then 'Administrativo'
    else 'Outro' end;
$$;

create or replace function private.work_event(p_work uuid, p_actor uuid, p_kind text, p_body text default null, p_data jsonb default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.work_events (work_id, actor_id, kind, body, data) values (p_work, p_actor, p_kind, left(p_body, 2000), p_data);
$$;

-- Notificação personalizada (nunca para o autor da ação; sem dados do cliente no texto).
create or replace function private.notify_work(p_work uuid, p_recipient uuid, p_kind text, p_actor uuid, p_extra text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare w record; v_recipient text; v_actor text; v_due text; v_title text; v_msg text; v_type public.notification_type;
begin
  if p_recipient is null or p_recipient = p_actor then return; end if;
  select * into w from public.works where id = p_work;
  select full_name into v_recipient from public.profiles where id = p_recipient and status = 'active';
  if v_recipient is null then return; end if;
  select full_name into v_actor from public.profiles where id = p_actor;
  v_actor := coalesce(v_actor, 'O sistema');
  v_due := case when w.due_current is null then 'sem prazo definido' else 'prazo ' || to_char(w.due_current, 'DD/MM/YYYY') end;
  case p_kind
    when 'assigned' then
      v_type := 'work_assigned';
      v_title := private.first_name(v_recipient) || ', você tem um novo trabalho';
      v_msg := v_actor || ' atribuiu “' || w.title || '” (' || private.work_category_label(w.category) || ') para você · ' || v_due || '.';
    when 'unassigned' then
      v_type := 'work_updated';
      v_title := private.first_name(v_recipient) || ', um trabalho foi transferido';
      v_msg := v_actor || ' retirou você de “' || w.title || '”.';
    when 'updated' then
      v_type := 'work_updated';
      v_title := private.first_name(v_recipient) || ', “' || left(w.title, 60) || '” foi atualizado';
      v_msg := v_actor || ': ' || coalesce(p_extra, 'alterações na ficha') || ' · ' || v_due || '.';
    when 'review' then
      v_type := 'work_review_requested';
      v_title := private.first_name(v_recipient) || ', há um trabalho para revisar';
      v_msg := v_actor || ' enviou “' || w.title || '” para revisão.';
    when 'changes' then
      v_type := 'work_changes_requested';
      v_title := private.first_name(v_recipient) || ', ajustes pedidos em “' || left(w.title, 60) || '”';
      v_msg := v_actor || ': ' || left(coalesce(p_extra, ''), 300);
    when 'approved' then
      v_type := 'work_approved';
      v_title := private.first_name(v_recipient) || ', “' || left(w.title, 60) || '” foi aprovado';
      v_msg := v_actor || ' aprovou a entrega. Obrigado!';
    when 'comment' then
      v_type := 'work_commented';
      v_title := private.first_name(v_recipient) || ', novo comentário em “' || left(w.title, 60) || '”';
      v_msg := v_actor || ': ' || left(coalesce(p_extra, ''), 300);
    else
      v_type := 'work_updated';
      v_title := private.first_name(v_recipient) || ', atualização em “' || left(w.title, 60) || '”';
      v_msg := v_actor || ': ' || coalesce(p_extra, '');
  end case;
  perform private.notify(w.organization_id, p_recipient, v_type, v_title, v_msg, 'works', w.id);
end;
$$;

-- Notifica todos os participantes (responsáveis, revisor e quem criou), exceto o autor.
create or replace function private.notify_work_participants(p_work uuid, p_kind text, p_actor uuid, p_extra text default null, p_only_assignees boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare w record; r uuid;
begin
  select * into w from public.works where id = p_work;
  for r in
    select user_id from public.work_assignees where work_id = p_work
    union select w.reviewer_id where not p_only_assignees and w.reviewer_id is not null
    union select w.created_by where not p_only_assignees
  loop
    perform private.notify_work(p_work, r, p_kind, p_actor, p_extra);
  end loop;
end;
$$;

create or replace function private.assert_active_member(p_org uuid, p_user uuid, p_what text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is not null and not exists (select 1 from public.profiles where id = p_user and organization_id = p_org and status = 'active') then
    raise exception '% inválido ou inativo', p_what using errcode = '22023';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rotinas
-- ----------------------------------------------------------------------------

-- Cria o trabalho (administração). Itens e links iniciais opcionais.
create or replace function public.create_work(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record; v_id uuid; v_client uuid := nullif(p ->> 'client_id', '')::uuid; v_project uuid := nullif(p ->> 'project_id', '')::uuid;
  v_reviewer uuid := nullif(p ->> 'reviewer_id', '')::uuid; v_due date := nullif(p ->> 'due_date', '')::date;
  v_user uuid; v_item jsonb; v_link jsonb; v_pos int := 0;
begin
  select * into a from private.require_admin();
  if v_client is not null and not exists (select 1 from public.clients where id = v_client and organization_id = a.organization_id) then
    raise exception 'Cliente inválido' using errcode = '22023';
  end if;
  if v_project is not null and not exists (select 1 from public.projects where id = v_project and organization_id = a.organization_id
       and (v_client is null or client_id = v_client)) then
    raise exception 'Projeto inválido para este cliente' using errcode = '22023';
  end if;
  perform private.assert_active_member(a.organization_id, v_reviewer, 'Revisor');
  insert into public.works (organization_id, client_id, project_id, title, category, objective, instructions, deliverable_format,
    due_original, due_current, estimated_hours, reviewer_id, created_by)
  values (a.organization_id, v_client, v_project, btrim(p ->> 'title'), (p ->> 'category')::public.work_category,
    private.text_or_null(p, 'objective', 1000), private.text_or_null(p, 'instructions', 8000), private.text_or_null(p, 'deliverable_format', 500),
    v_due, v_due, nullif(p ->> 'estimated_hours', '')::numeric(5,1), v_reviewer, a.user_id)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    insert into public.work_items (work_id, kind, position, title, body, required)
    values (v_id, (v_item ->> 'kind')::public.work_item_kind, v_pos, btrim(v_item ->> 'title'), private.text_or_null(v_item, 'body', 4000),
            coalesce((v_item ->> 'required')::boolean, false));
    v_pos := v_pos + 1;
  end loop;
  for v_link in select * from jsonb_array_elements(coalesce(p -> 'links', '[]'::jsonb)) loop
    insert into public.work_links (work_id, kind, label, url, note, created_by)
    values (v_id, (v_link ->> 'kind')::public.work_link_kind, btrim(v_link ->> 'label'), btrim(v_link ->> 'url'),
            private.text_or_null(v_link, 'note', 500), a.user_id);
  end loop;
  perform private.work_event(v_id, a.user_id, 'created');
  for v_user in select distinct (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'assignees', '[]'::jsonb)) x loop
    perform private.assert_active_member(a.organization_id, v_user, 'Responsável');
    insert into public.work_assignees (work_id, user_id, assigned_by) values (v_id, v_user, a.user_id);
    perform private.work_event(v_id, a.user_id, 'assigned', null, jsonb_build_object('user_id', v_user));
    perform private.notify_work(v_id, v_user, 'assigned', a.user_id);
  end loop;
  return v_id;
end;
$$;

-- Edita a ficha (administração ou quem criou). Prazo vigente muda com motivo; o original não muda.
create or replace function public.update_work(p_work uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record; w public.works; v_due date := nullif(p ->> 'due_date', '')::date; v_reason text := private.text_or_null(p, 'due_change_reason', 300);
  v_client uuid := nullif(p ->> 'client_id', '')::uuid; v_project uuid := nullif(p ->> 'project_id', '')::uuid;
  v_reviewer uuid := nullif(p ->> 'reviewer_id', '')::uuid;
begin
  select * into a from private.require_active_user();
  select * into w from public.works where id = p_work and organization_id = a.organization_id for update;
  if w.id is null or private.work_role(w, a.user_id, a.role) is distinct from 'manager' then
    raise exception 'Trabalho não encontrado' using errcode = 'P0002';
  end if;
  if w.status in ('done', 'cancelled') then raise exception 'Trabalho encerrado não pode ser editado' using errcode = '22023'; end if;
  if v_client is not null and not exists (select 1 from public.clients where id = v_client and organization_id = a.organization_id) then
    raise exception 'Cliente inválido' using errcode = '22023';
  end if;
  if v_project is not null and not exists (select 1 from public.projects where id = v_project and organization_id = a.organization_id
       and (v_client is null or client_id = v_client)) then
    raise exception 'Projeto inválido para este cliente' using errcode = '22023';
  end if;
  perform private.assert_active_member(a.organization_id, v_reviewer, 'Revisor');
  if v_reviewer is not null and private.is_work_assignee(w.id, v_reviewer) then
    raise exception 'Quem executa o trabalho não pode ser o revisor' using errcode = '22023';
  end if;
  if v_due is distinct from w.due_current and w.due_original is not null and v_reason is null then
    raise exception 'Informe o motivo da mudança de prazo' using errcode = '22023';
  end if;
  update public.works set
    title = btrim(p ->> 'title'), category = (p ->> 'category')::public.work_category, client_id = v_client, project_id = v_project,
    objective = private.text_or_null(p, 'objective', 1000), instructions = private.text_or_null(p, 'instructions', 8000),
    deliverable_format = private.text_or_null(p, 'deliverable_format', 500),
    estimated_hours = nullif(p ->> 'estimated_hours', '')::numeric(5,1), reviewer_id = v_reviewer,
    due_original = coalesce(w.due_original, v_due), due_current = v_due
  where id = w.id;
  if v_due is distinct from w.due_current then
    perform private.work_event(w.id, a.user_id, 'due_changed', v_reason,
      jsonb_build_object('from', w.due_current, 'to', v_due, 'original', coalesce(w.due_original, v_due)));
    perform private.notify_work_participants(w.id, 'updated', a.user_id,
      'prazo alterado para ' || coalesce(to_char(v_due, 'DD/MM/YYYY'), 'sem prazo') || coalesce(' (' || v_reason || ')', ''), true);
  else
    perform private.work_event(w.id, a.user_id, 'edited');
  end if;
end;
$$;

-- Define os responsáveis (administração ou quem criou). Qualquer colaborador ativo, de qualquer função.
create or replace function public.set_work_assignees(p_work uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; w public.works; v_user uuid;
begin
  select * into a from private.require_active_user();
  select * into w from public.works where id = p_work and organization_id = a.organization_id for update;
  if w.id is null or private.work_role(w, a.user_id, a.role) is distinct from 'manager' then
    raise exception 'Trabalho não encontrado' using errcode = 'P0002';
  end if;
  if w.status in ('done', 'cancelled') then raise exception 'Trabalho encerrado' using errcode = '22023'; end if;
  if coalesce(array_length(p_user_ids, 1), 0) > 10 then raise exception 'Máximo de 10 responsáveis' using errcode = '22023'; end if;
  if w.reviewer_id = any(p_user_ids) then raise exception 'Quem revisa não pode ser responsável pela execução' using errcode = '22023'; end if;
  for v_user in select user_id from public.work_assignees where work_id = w.id and not (user_id = any(coalesce(p_user_ids, '{}'))) loop
    delete from public.work_assignees where work_id = w.id and user_id = v_user;
    perform private.work_event(w.id, a.user_id, 'unassigned', null, jsonb_build_object('user_id', v_user));
    perform private.notify_work(w.id, v_user, 'unassigned', a.user_id);
  end loop;
  for v_user in select distinct u from unnest(coalesce(p_user_ids, '{}')) u
                 where not exists (select 1 from public.work_assignees where work_id = w.id and user_id = u) loop
    perform private.assert_active_member(a.organization_id, v_user, 'Responsável');
    insert into public.work_assignees (work_id, user_id, assigned_by) values (w.id, v_user, a.user_id);
    perform private.work_event(w.id, a.user_id, 'assigned', null, jsonb_build_object('user_id', v_user));
    perform private.notify_work(w.id, v_user, 'assigned', a.user_id);
  end loop;
end;
$$;

-- Itens da ficha (copy por página, cenas, fotos, requisitos, checklist). Quem prepara edita; quem executa marca como feito.
create or replace function public.save_work_item(p_work uuid, p_item_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; w public.works; v_role text; i record; v_id uuid; v_kind text := p ->> 'kind';
begin
  select * into a from private.require_active_user();
  select * into w from public.works where id = p_work and organization_id = a.organization_id for update;
  v_role := case when w.id is null then null else private.work_role(w, a.user_id, a.role) end;
  if v_role is null or v_role not in ('manager', 'reviewer') then raise exception 'Trabalho não encontrado' using errcode = 'P0002'; end if;
  if w.status in ('done', 'cancelled') then raise exception 'Trabalho encerrado' using errcode = '22023'; end if;
  if p_item_id is null then
    insert into public.work_items (work_id, kind, position, title, body, required)
    values (w.id, (p ->> 'kind')::public.work_item_kind,
            coalesce(nullif(p ->> 'position', '')::int, (select coalesce(max(position) + 1, 0) from public.work_items where work_id = w.id)),
            btrim(p ->> 'title'), private.text_or_null(p, 'body', 4000), coalesce((p ->> 'required')::boolean, false))
    returning id into v_id;
  else
    select * into i from public.work_items where id = p_item_id and work_id = w.id for update;
    if i.id is null then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
    update public.work_items set title = btrim(p ->> 'title'), body = private.text_or_null(p, 'body', 4000),
           required = coalesce((p ->> 'required')::boolean, i.required),
           position = coalesce(nullif(p ->> 'position', '')::int, i.position)
     where id = i.id;
    v_id := i.id;
    v_kind := i.kind::text;
  end if;
  -- Texto já em produção mudou: registra e avisa quem executa (nada muda em silêncio).
  if w.status in ('in_production', 'in_review') and v_kind in ('slide', 'scene', 'shot') then
    perform private.work_event(w.id, a.user_id, 'content_changed', btrim(p ->> 'title'), jsonb_build_object('item_id', v_id));
    perform private.notify_work_participants(w.id, 'updated', a.user_id, 'conteúdo alterado: ' || left(btrim(p ->> 'title'), 80), true);
  end if;
  return v_id;
end;
$$;

create or replace function public.remove_work_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; i record; w public.works;
begin
  select * into a from private.require_active_user();
  select * into i from public.work_items where id = p_item_id;
  select * into w from public.works where id = i.work_id and organization_id = a.organization_id for update;
  if w.id is null or private.work_role(w, a.user_id, a.role) not in ('manager', 'reviewer') then
    raise exception 'Item não encontrado' using errcode = 'P0002';
  end if;
  if w.status in ('done', 'cancelled') then raise exception 'Trabalho encerrado' using errcode = '22023'; end if;
  delete from public.work_items where id = i.id;
  perform private.work_event(w.id, a.user_id, 'item_removed', i.title, jsonb_build_object('kind', i.kind));
end;
$$;

create or replace function public.set_work_item_done(p_item_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; i record; w public.works;
begin
  select * into a from private.require_active_user();
  select * into i from public.work_items where id = p_item_id for update;
  select * into w from public.works where id = i.work_id and organization_id = a.organization_id;
  if w.id is null or private.work_role(w, a.user_id, a.role) is null then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  if w.status in ('done', 'cancelled') then raise exception 'Trabalho encerrado' using errcode = '22023'; end if;
  if i.done = p_done then return; end if;
  update public.work_items set done = p_done, done_by = case when p_done then a.user_id end, done_at = case when p_done then now() end
   where id = i.id;
  perform private.work_event(w.id, a.user_id, case when p_done then 'item_done' else 'item_undone' end, i.title);
end;
$$;

-- Links (referências, materiais, brutos, prévias, editáveis, entrega final). Qualquer participante adiciona.
create or replace function public.add_work_link(p_work uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; w public.works; v_id uuid; v_url text := btrim(coalesce(p ->> 'url', ''));
begin
  select * into a from private.require_active_user();
  select * into w from public.works where id = p_work and organization_id = a.organization_id;
  if w.id is null or private.work_role(w, a.user_id, a.role) is null then raise exception 'Trabalho não encontrado' using errcode = 'P0002'; end if;
  if w.status = 'cancelled' then raise exception 'Trabalho cancelado' using errcode = '22023'; end if;
  if v_url !~ '^https://[^\s]+$' or length(v_url) > 2000 then raise exception 'Informe um link https:// válido' using errcode = '22023'; end if;
  insert into public.work_links (work_id, kind, label, url, note, created_by)
  values (w.id, (p ->> 'kind')::public.work_link_kind, btrim(p ->> 'label'), v_url, private.text_or_null(p, 'note', 500), a.user_id)
  returning id into v_id;
  perform private.work_event(w.id, a.user_id, 'link_added', btrim(p ->> 'label'), jsonb_build_object('kind', p ->> 'kind', 'link_id', v_id));
  return v_id;
end;
$$;

create or replace function public.remove_work_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; l record; w public.works;
begin
  select * into a from private.require_active_user();
  select * into l from public.work_links where id = p_link_id for update;
  select * into w from public.works where id = l.work_id and organization_id = a.organization_id;
  if w.id is null or (l.created_by <> a.user_id and private.work_role(w, a.user_id, a.role) is distinct from 'manager') then
    raise exception 'Link não encontrado' using errcode = 'P0002';
  end if;
  if w.status in ('done', 'cancelled') then raise exception 'Trabalho encerrado: o histórico de links é preservado' using errcode = '22023'; end if;
  if l.removed_at is null then
    update public.work_links set removed_at = now(), removed_by = a.user_id where id = l.id;
    perform private.work_event(w.id, a.user_id, 'link_removed', l.label);
  end if;
end;
$$;

-- Confirmação de backup dos brutos: evento separado do envio do link.
create or replace function public.confirm_work_backup(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; l record; w public.works;
begin
  select * into a from private.require_active_user();
  select * into l from public.work_links where id = p_link_id for update;
  select * into w from public.works where id = l.work_id and organization_id = a.organization_id;
  if w.id is null or private.work_role(w, a.user_id, a.role) is null or l.removed_at is not null then
    raise exception 'Link não encontrado' using errcode = 'P0002';
  end if;
  if l.kind <> 'raw' then raise exception 'Confirmação de backup vale apenas para arquivos brutos' using errcode = '22023'; end if;
  if l.backup_confirmed_at is null then
    update public.work_links set backup_confirmed_at = now(), backup_confirmed_by = a.user_id where id = l.id;
    perform private.work_event(w.id, a.user_id, 'backup_confirmed', l.label);
  end if;
end;
$$;

-- Bloqueio com motivo (indicador; não é estado). Motivo nulo = desbloqueia.
create or replace function public.set_work_blocked(p_work uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; w public.works; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into a from private.require_active_user();
  select * into w from public.works where id = p_work and organization_id = a.organization_id for update;
  if w.id is null or private.work_role(w, a.user_id, a.role) is null then raise exception 'Trabalho não encontrado' using errcode = 'P0002'; end if;
  if w.status in ('done', 'cancelled') then raise exception 'Trabalho encerrado' using errcode = '22023'; end if;
  if v_reason is not null and length(v_reason) < 3 then raise exception 'Explique o motivo do bloqueio' using errcode = '22023'; end if;
  update public.works set blocked_reason = left(v_reason, 500), blocked_at = case when v_reason is null then null else now() end where id = w.id;
  perform private.work_event(w.id, a.user_id, case when v_reason is null then 'unblocked' else 'blocked' end, v_reason);
  perform private.notify_work_participants(w.id, 'updated', a.user_id,
    case when v_reason is null then 'bloqueio resolvido' else 'bloqueado — ' || left(v_reason, 200) end);
end;
$$;

-- Transições de estado com as regras de prontidão e de aprovação.
create or replace function public.set_work_status(p_work uuid, p_status public.work_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record; w public.works; v_role text; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_missing text;
  v_assignee boolean;
begin
  select * into a from private.require_active_user();
  select * into w from public.works where id = p_work and organization_id = a.organization_id for update;
  v_role := case when w.id is null then null else private.work_role(w, a.user_id, a.role) end;
  if v_role is null then raise exception 'Trabalho não encontrado' using errcode = 'P0002'; end if;
  v_assignee := private.is_work_assignee(w.id, a.user_id);
  if w.status = p_status then return; end if;

  if p_status = 'ready' and w.status = 'draft' then
    if v_role not in ('manager', 'reviewer') then raise exception 'Somente quem prepara o trabalho marca como pronto' using errcode = '42501'; end if;
    if not exists (select 1 from public.work_assignees where work_id = w.id) then
      raise exception 'Defina pelo menos um responsável' using errcode = '22023';
    end if;
    select string_agg(title, ', ' order by position) into v_missing from public.work_items where work_id = w.id and required and not done;
    if v_missing is not null then raise exception 'Aguardando material: %', left(v_missing, 300) using errcode = '22023'; end if;
  elsif p_status = 'draft' and w.status = 'ready' then
    if v_role <> 'manager' then raise exception 'Sem permissão' using errcode = '42501'; end if;
  elsif p_status = 'in_production' and w.status = 'ready' then
    if not v_assignee and v_role <> 'manager' then raise exception 'Somente responsáveis iniciam a produção' using errcode = '42501'; end if;
  elsif p_status = 'in_review' and w.status = 'in_production' then
    if not v_assignee and v_role <> 'manager' then raise exception 'Somente responsáveis enviam para revisão' using errcode = '42501'; end if;
    if w.blocked_reason is not null then raise exception 'Resolva o bloqueio antes de enviar para revisão' using errcode = '22023'; end if;
    if not exists (select 1 from public.work_links where work_id = w.id and removed_at is null and kind in ('preview', 'final')) then
      raise exception 'Adicione o link da prévia antes de enviar para revisão' using errcode = '22023';
    end if;
  elsif p_status = 'in_production' and w.status = 'in_review' then
    if v_assignee or v_role not in ('manager', 'reviewer') then raise exception 'Somente quem revisa pede ajustes' using errcode = '42501'; end if;
    if v_note is null then raise exception 'Descreva os ajustes (ex.: página 3, ajustar contraste)' using errcode = '22023'; end if;
  elsif p_status = 'done' and w.status = 'in_review' then
    if v_assignee then raise exception 'Quem executou não pode aprovar o próprio trabalho' using errcode = '42501'; end if;
    if v_role not in ('manager', 'reviewer') then raise exception 'Somente quem revisa aprova' using errcode = '42501'; end if;
    if w.blocked_reason is not null then raise exception 'Resolva o bloqueio antes de concluir' using errcode = '22023'; end if;
    if not exists (select 1 from public.work_links where work_id = w.id and removed_at is null and kind = 'final') then
      raise exception 'Inclua o link da entrega final antes de aprovar' using errcode = '22023';
    end if;
  elsif p_status = 'in_production' and w.status = 'done' then
    if v_role <> 'manager' then raise exception 'Somente a gestão reabre trabalhos' using errcode = '42501'; end if;
    if v_note is null then raise exception 'Informe o motivo da reabertura' using errcode = '22023'; end if;
  elsif p_status = 'cancelled' and w.status <> 'done' then
    if v_role <> 'manager' then raise exception 'Somente a gestão cancela trabalhos' using errcode = '42501'; end if;
    if v_note is null then raise exception 'Informe o motivo do cancelamento' using errcode = '22023'; end if;
  else
    raise exception 'Mudança de estado não permitida' using errcode = '22023';
  end if;

  update public.works set status = p_status,
         completed_at = case when p_status = 'done' then now() end,
         cancelled_at = case when p_status = 'cancelled' then now() end,
         blocked_reason = case when p_status in ('done', 'cancelled') then null else blocked_reason end,
         blocked_at = case when p_status in ('done', 'cancelled') then null else blocked_at end
   where id = w.id;
  perform private.work_event(w.id, a.user_id,
    case when p_status = 'in_production' and w.status = 'in_review' then 'changes_requested'
         when p_status = 'in_production' and w.status = 'done' then 'reopened'
         else 'status_' || p_status::text end, v_note, jsonb_build_object('from', w.status, 'to', p_status));

  if p_status = 'in_review' then
    if w.reviewer_id is not null then
      perform private.notify_work(w.id, w.reviewer_id, 'review', a.user_id);
    else
      perform private.notify_work(w.id, w.created_by, 'review', a.user_id);
    end if;
  elsif p_status = 'in_production' and w.status = 'in_review' then
    perform private.notify_work_participants(w.id, 'changes', a.user_id, v_note, true);
  elsif p_status = 'done' then
    perform private.notify_work_participants(w.id, 'approved', a.user_id, null, true);
  elsif p_status = 'ready' then
    perform private.notify_work_participants(w.id, 'updated', a.user_id, 'pronto para produzir', true);
  elsif p_status = 'cancelled' then
    perform private.notify_work_participants(w.id, 'updated', a.user_id, 'cancelado — ' || left(v_note, 200));
  end if;
end;
$$;

create or replace function public.comment_work(p_work uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; w public.works; v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  select * into a from private.require_active_user();
  select * into w from public.works where id = p_work and organization_id = a.organization_id;
  if w.id is null or private.work_role(w, a.user_id, a.role) is null then raise exception 'Trabalho não encontrado' using errcode = 'P0002'; end if;
  if v_text is null or length(v_text) > 2000 then raise exception 'Comentário vazio ou muito longo' using errcode = '22023'; end if;
  perform private.work_event(w.id, a.user_id, 'comment', v_text);
  perform private.notify_work_participants(w.id, 'comment', a.user_id, v_text);
end;
$$;

-- Nome dos clientes dos trabalhos visíveis (sem dados comerciais). Administração: todos.
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
     and (a.role::text = 'admin' or exists (select 1 from public.works w where w.client_id = c.id and private.can_view_work(w.id)))
   order by c.company_name;
end;
$$;

revoke all on function private.work_role(public.works, uuid, public.user_role), private.is_work_assignee(uuid, uuid),
  private.work_category_label(public.work_category), private.work_event(uuid, uuid, text, text, jsonb),
  private.notify_work(uuid, uuid, text, uuid, text), private.notify_work_participants(uuid, text, uuid, text, boolean),
  private.assert_active_member(uuid, uuid, text) from public;
revoke execute on function public.create_work(jsonb), public.update_work(uuid, jsonb), public.set_work_assignees(uuid, uuid[]),
  public.save_work_item(uuid, uuid, jsonb), public.remove_work_item(uuid), public.set_work_item_done(uuid, boolean),
  public.add_work_link(uuid, jsonb), public.remove_work_link(uuid), public.confirm_work_backup(uuid),
  public.set_work_blocked(uuid, text), public.set_work_status(uuid, public.work_status, text), public.comment_work(uuid, text),
  public.visible_client_names() from public, anon;
grant execute on function public.create_work(jsonb), public.update_work(uuid, jsonb), public.set_work_assignees(uuid, uuid[]),
  public.save_work_item(uuid, uuid, jsonb), public.remove_work_item(uuid), public.set_work_item_done(uuid, boolean),
  public.add_work_link(uuid, jsonb), public.remove_work_link(uuid), public.confirm_work_backup(uuid),
  public.set_work_blocked(uuid, text), public.set_work_status(uuid, public.work_status, text), public.comment_work(uuid, text),
  public.visible_client_names() to authenticated;
