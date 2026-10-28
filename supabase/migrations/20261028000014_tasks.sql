-- =============================================================================
-- ONE CONTROL — 0014 Tarefas internas por grupo (AUDIOVISUAL, VENDAS, …)
-- =============================================================================
-- Regras:
--  * Administradores criam e mantêm os grupos.
--  * Qualquer colaborador ativo cria tarefas e as designa a qualquer colega
--    ativo (administrador ou vendedor). Vendedores só usam grupos liberados
--    pela administração (task_groups.sellers_can_assign) e só editam,
--    reatribuem ou cancelam as tarefas que eles mesmos criaram.
--  * Quem recebe a tarefa atualiza o andamento e comenta.
--  * Toda designação gera notificação personalizada para o destinatário.
--  * Visibilidade: admin vê todas; demais veem as que criaram ou receberam.
-- (As tarefas de projeto, project_tasks, continuam como checklist do projeto.)
-- =============================================================================

alter type public.notification_type add value if not exists 'task_assigned';
alter type public.notification_type add value if not exists 'task_updated';
alter type public.notification_type add value if not exists 'task_commented';
alter type public.notification_type add value if not exists 'task_due_soon';
alter type public.notification_type add value if not exists 'task_overdue';

create table public.task_groups (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id),
  name               text not null check (length(btrim(name)) between 2 and 60),
  description        text null check (description is null or length(description) <= 500),
  sellers_can_assign boolean not null default true,
  active             boolean not null default true,
  created_by         uuid null references public.profiles (id), -- nulo = criado pelo sistema
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index uq_task_groups_name on public.task_groups (organization_id, lower(name));
create index idx_task_groups_created_by on public.task_groups (created_by);
create trigger trg_task_groups_updated before update on public.task_groups
  for each row execute function private.set_updated_at();
create trigger trg_task_groups_audit after insert or update on public.task_groups
  for each row execute function private.audit_row_change();

create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  group_id        uuid not null references public.task_groups (id),
  title           text not null check (length(btrim(title)) between 3 and 160),
  description     text null check (description is null or length(description) <= 4000),
  assigned_to     uuid not null references public.profiles (id),
  created_by      uuid not null references public.profiles (id),
  status          public.task_status not null default 'todo',
  priority        public.task_priority not null default 'medium',
  due_date        date null,
  blocked_reason  text null check (blocked_reason is null or length(blocked_reason) <= 500),
  completed_at    timestamptz null,
  cancelled_at    timestamptz null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status = 'done') = (completed_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check (status <> 'blocked' or blocked_reason is not null)
);
create index idx_tasks_assigned on public.tasks (assigned_to, status, due_date);
create index idx_tasks_created_by on public.tasks (created_by, status);
create index idx_tasks_group on public.tasks (group_id, status);
create index idx_tasks_org_status on public.tasks (organization_id, status, due_date);
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function private.set_updated_at();

-- Histórico e comentários (append-only).
create table public.task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id),
  actor_id    uuid null references public.profiles (id),
  event_type  text not null check (event_type in ('created', 'assigned', 'reassigned', 'status_changed', 'edited', 'commented')),
  from_value  text null check (from_value is null or length(from_value) <= 200),
  to_value    text null check (to_value is null or length(to_value) <= 200),
  comment     text null check (comment is null or length(comment) <= 2000),
  created_at  timestamptz not null default now()
);
create index idx_task_events_task on public.task_events (task_id, created_at);
create index idx_task_events_actor on public.task_events (actor_id);
create trigger trg_task_events_immutable before update or delete on public.task_events
  for each row execute function private.forbid_mutation();

-- ----------------------------------------------------------------------------
-- RLS e grants (somente leitura direta; escritas por rotinas)
-- ----------------------------------------------------------------------------
alter table public.task_groups enable row level security;
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;
revoke all on public.task_groups, public.tasks, public.task_events from anon, authenticated;
grant select on public.task_groups, public.tasks, public.task_events to authenticated;

create policy task_groups_select on public.task_groups for select to authenticated
  using (organization_id = (select private.current_organization_id()));

create policy tasks_select on public.tasks for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin())
              or assigned_to = (select auth.uid()) or created_by = (select auth.uid())));

create policy task_events_select on public.task_events for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function private.first_name(p_full_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(split_part(btrim(p_full_name), ' ', 1), ''), p_full_name);
$$;

create or replace function private.priority_label(p public.task_priority)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p when 'low' then 'baixa' when 'medium' then 'média' when 'high' then 'alta' else 'urgente' end;
$$;

-- Notificação personalizada (nome do destinatário, quem designou, grupo, prazo, prioridade).
create or replace function private.notify_task(p_task_id uuid, p_recipient uuid, p_kind text, p_actor uuid, p_extra text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare t record; v_recipient text; v_actor text; v_group text; v_due text; v_title text; v_msg text;
        v_type public.notification_type;
begin
  if p_recipient is null or p_recipient = p_actor then return; end if; -- ninguém é notificado da própria ação
  select * into t from public.tasks where id = p_task_id;
  select full_name into v_recipient from public.profiles where id = p_recipient and status = 'active';
  if v_recipient is null then return; end if;
  select full_name into v_actor from public.profiles where id = p_actor;
  select name into v_group from public.task_groups where id = t.group_id;
  v_due := case when t.due_date is null then 'sem prazo definido' else 'prazo ' || to_char(t.due_date, 'DD/MM/YYYY') end;
  v_actor := coalesce(v_actor, 'O sistema');

  case p_kind
    when 'assigned' then
      v_type := 'task_assigned';
      v_title := private.first_name(v_recipient) || ', você tem uma nova tarefa';
      v_msg := v_actor || ' designou “' || t.title || '” para você em ' || upper(v_group) || ' · ' || v_due
               || ' · prioridade ' || private.priority_label(t.priority) || '.';
    when 'unassigned' then
      v_type := 'task_updated';
      v_title := private.first_name(v_recipient) || ', uma tarefa foi transferida';
      v_msg := v_actor || ' transferiu “' || t.title || '” (' || upper(v_group) || ') para outra pessoa.';
    when 'status' then
      v_type := 'task_updated';
      v_title := private.first_name(v_recipient) || ', “' || left(t.title, 60) || '” mudou de status';
      v_msg := v_actor || ' marcou como ' || coalesce(p_extra, t.status::text) || ' · ' || upper(v_group) || '.';
    when 'edited' then
      v_type := 'task_updated';
      v_title := private.first_name(v_recipient) || ', uma tarefa sua foi atualizada';
      v_msg := v_actor || ' alterou “' || t.title || '” · ' || v_due || ' · prioridade ' || private.priority_label(t.priority) || '.';
    when 'comment' then
      v_type := 'task_commented';
      v_title := private.first_name(v_recipient) || ', novo comentário em “' || left(t.title, 60) || '”';
      v_msg := v_actor || ': ' || left(coalesce(p_extra, ''), 300);
    when 'due_soon' then
      v_type := 'task_due_soon';
      v_title := private.first_name(v_recipient) || ', prazo chegando';
      v_msg := '“' || t.title || '” (' || upper(v_group) || ') vence em ' || to_char(t.due_date, 'DD/MM/YYYY') || '.';
    when 'overdue' then
      v_type := 'task_overdue';
      v_title := private.first_name(v_recipient) || ', tarefa atrasada';
      v_msg := '“' || t.title || '” (' || upper(v_group) || ') venceu em ' || to_char(t.due_date, 'DD/MM/YYYY') || '.';
    else
      return;
  end case;

  perform private.notify(t.organization_id, p_recipient, v_type, v_title, v_msg, 'tasks', t.id,
    case when p_kind in ('due_soon', 'overdue') then 'task_' || p_kind || ':' || t.id || ':' || to_char(private.today(), 'YYYY-MM-DD') end);
end;
$$;

create or replace function private.task_status_label(s public.task_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s when 'todo' then 'a fazer' when 'in_progress' then 'em andamento' when 'blocked' then 'bloqueada'
                when 'done' then 'concluída' else 'cancelada' end;
$$;

-- Destinatário válido: colaborador ATIVO da mesma organização (admin ou vendedor).
create or replace function private.assert_assignable(p_org uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = p_user and organization_id = p_org and status = 'active') then
    raise exception 'Responsável inexistente ou inativo' using errcode = '22023';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grupos (somente administradores)
-- ----------------------------------------------------------------------------
create or replace function public.save_task_group(p_id uuid, p_name text, p_description text, p_sellers_can_assign boolean, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; v_id uuid;
begin
  select * into a from private.require_admin();
  if coalesce(length(btrim(p_name)), 0) < 2 then raise exception 'Informe o nome do grupo' using errcode = '22023'; end if;
  begin
    if p_id is null then
      insert into public.task_groups (organization_id, name, description, sellers_can_assign, active, created_by)
      values (a.organization_id, upper(btrim(p_name)), nullif(btrim(p_description), ''), coalesce(p_sellers_can_assign, true), true, a.user_id)
      returning id into v_id;
    else
      update public.task_groups
         set name = upper(btrim(p_name)), description = nullif(btrim(p_description), ''),
             sellers_can_assign = coalesce(p_sellers_can_assign, sellers_can_assign), active = coalesce(p_active, active)
       where id = p_id and organization_id = a.organization_id
      returning id into v_id;
      if v_id is null then raise exception 'Grupo não encontrado' using errcode = 'P0002'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe um grupo com este nome' using errcode = '23505';
  end;
  return v_id;
end;
$$;

-- Diretório mínimo de colegas (nome e papel; sem e-mail/telefone) para designação.
create or replace function public.people_directory()
returns table (id uuid, full_name text, role public.user_role, active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record;
begin
  select * into a from private.require_active_user();
  return query
  select p.id, p.full_name, p.role, p.status = 'active'
    from public.profiles p
   where p.organization_id = a.organization_id and p.status in ('active', 'suspended', 'inactive')
   order by p.status = 'active' desc, p.full_name;
end;
$$;

-- ----------------------------------------------------------------------------
-- Tarefas
-- ----------------------------------------------------------------------------
create or replace function private.validate_task_group(a record, p_group uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare g record;
begin
  select * into g from public.task_groups where id = p_group and organization_id = a.organization_id;
  if g.id is null or not g.active then raise exception 'Grupo inválido ou inativo' using errcode = '22023'; end if;
  if a.role <> 'admin' and not g.sellers_can_assign then
    raise exception 'Este grupo aceita apenas tarefas criadas pela administração' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.create_task(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; v_id uuid; v_assignee uuid; v_group uuid; v_due date;
begin
  select * into a from private.require_active_user();
  v_group := (p ->> 'group_id')::uuid;
  v_assignee := (p ->> 'assigned_to')::uuid;
  v_due := nullif(p ->> 'due_date', '')::date;
  perform private.validate_task_group(a, v_group);
  perform private.assert_assignable(a.organization_id, v_assignee);
  if v_due is not null and v_due < private.today() then
    raise exception 'O prazo não pode estar no passado' using errcode = '22023';
  end if;
  insert into public.tasks (organization_id, group_id, title, description, assigned_to, created_by, priority, due_date)
  values (a.organization_id, v_group, btrim(coalesce(p ->> 'title', '')), private.text_or_null(p, 'description', 4000),
          v_assignee, a.user_id, coalesce(nullif(p ->> 'priority', ''), 'medium')::public.task_priority, v_due)
  returning id into v_id;
  insert into public.task_events (task_id, actor_id, event_type, to_value) values (v_id, a.user_id, 'created', null);
  insert into public.task_events (task_id, actor_id, event_type, to_value)
  values (v_id, a.user_id, 'assigned', (select full_name from public.profiles where id = v_assignee));
  perform private.notify_task(v_id, v_assignee, 'assigned', a.user_id);
  return v_id;
end;
$$;

-- Edição/reatribuição: administrador ou quem criou a tarefa.
create or replace function public.update_task(p_task_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; t record; v_assignee uuid; v_group uuid; v_due date; v_prio public.task_priority;
begin
  select * into a from private.require_active_user();
  select * into t from public.tasks where id = p_task_id and organization_id = a.organization_id for update;
  if t.id is null or (a.role <> 'admin' and t.created_by <> a.user_id and t.assigned_to <> a.user_id) then
    raise exception 'Tarefa não encontrada' using errcode = 'P0002';
  end if;
  if a.role <> 'admin' and t.created_by <> a.user_id then
    raise exception 'Somente quem criou a tarefa ou um administrador pode editá-la' using errcode = '42501';
  end if;
  if t.status in ('done', 'cancelled') then raise exception 'Tarefa encerrada; reabra antes de editar' using errcode = '22023'; end if;
  v_group := coalesce(nullif(p ->> 'group_id', '')::uuid, t.group_id);
  v_assignee := coalesce(nullif(p ->> 'assigned_to', '')::uuid, t.assigned_to);
  v_due := case when p ? 'due_date' then nullif(p ->> 'due_date', '')::date else t.due_date end;
  v_prio := coalesce(nullif(p ->> 'priority', '')::public.task_priority, t.priority);
  if v_group <> t.group_id then perform private.validate_task_group(a, v_group); end if;
  if v_assignee <> t.assigned_to then perform private.assert_assignable(a.organization_id, v_assignee); end if;
  if v_due is distinct from t.due_date and v_due < private.today() then
    raise exception 'O prazo não pode estar no passado' using errcode = '22023';
  end if;

  update public.tasks set
    title = coalesce(nullif(btrim(p ->> 'title'), ''), title),
    description = case when p ? 'description' then private.text_or_null(p, 'description', 4000) else description end,
    group_id = v_group, assigned_to = v_assignee, due_date = v_due, priority = v_prio
  where id = t.id;

  if v_assignee <> t.assigned_to then
    insert into public.task_events (task_id, actor_id, event_type, from_value, to_value)
    values (t.id, a.user_id, 'reassigned', (select full_name from public.profiles where id = t.assigned_to),
            (select full_name from public.profiles where id = v_assignee));
    perform private.notify_task(t.id, v_assignee, 'assigned', a.user_id);
    perform private.notify_task(t.id, t.assigned_to, 'unassigned', a.user_id);
  else
    insert into public.task_events (task_id, actor_id, event_type) values (t.id, a.user_id, 'edited');
    if v_due is distinct from t.due_date or v_prio <> t.priority or v_group <> t.group_id then
      perform private.notify_task(t.id, t.assigned_to, 'edited', a.user_id);
    end if;
  end if;
end;
$$;

-- Andamento: responsável, criador ou admin. Cancelar: criador ou admin.
create or replace function public.set_task_status(p_task_id uuid, p_status public.task_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; t record; v_note text := nullif(btrim(p_note), '');
begin
  select * into a from private.require_active_user();
  select * into t from public.tasks where id = p_task_id and organization_id = a.organization_id for update;
  if t.id is null or (a.role <> 'admin' and t.created_by <> a.user_id and t.assigned_to <> a.user_id) then
    raise exception 'Tarefa não encontrada' using errcode = 'P0002';
  end if;
  if t.status = p_status then return; end if;
  if p_status = 'cancelled' and a.role <> 'admin' and t.created_by <> a.user_id then
    raise exception 'Somente quem criou a tarefa ou um administrador pode cancelá-la' using errcode = '42501';
  end if;
  if p_status = 'blocked' and v_note is null then
    raise exception 'Informe o motivo do bloqueio' using errcode = '22023';
  end if;
  update public.tasks set status = p_status,
         blocked_reason = case when p_status = 'blocked' then left(v_note, 500) else null end,
         completed_at = case when p_status = 'done' then now() else null end,
         cancelled_at = case when p_status = 'cancelled' then now() else null end
   where id = t.id;
  insert into public.task_events (task_id, actor_id, event_type, from_value, to_value, comment)
  values (t.id, a.user_id, 'status_changed', t.status::text, p_status::text, left(v_note, 2000));
  -- Avisa a outra ponta (quem criou e/ou quem executa), exceto o próprio autor.
  perform private.notify_task(t.id, t.created_by, 'status', a.user_id, private.task_status_label(p_status));
  if t.assigned_to <> t.created_by then
    perform private.notify_task(t.id, t.assigned_to, 'status', a.user_id, private.task_status_label(p_status));
  end if;
end;
$$;

create or replace function public.comment_task(p_task_id uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; t record; v_text text := nullif(btrim(p_comment), '');
begin
  select * into a from private.require_active_user();
  select * into t from public.tasks where id = p_task_id and organization_id = a.organization_id;
  if t.id is null or (a.role <> 'admin' and t.created_by <> a.user_id and t.assigned_to <> a.user_id) then
    raise exception 'Tarefa não encontrada' using errcode = 'P0002';
  end if;
  if v_text is null or length(v_text) > 2000 then raise exception 'Comentário vazio ou acima de 2.000 caracteres' using errcode = '22023'; end if;
  insert into public.task_events (task_id, actor_id, event_type, comment) values (t.id, a.user_id, 'commented', v_text);
  perform private.notify_task(t.id, t.created_by, 'comment', a.user_id, v_text);
  if t.assigned_to <> t.created_by then perform private.notify_task(t.id, t.assigned_to, 'comment', a.user_id, v_text); end if;
end;
$$;

-- Lembretes diários (cron): vence amanhã ou hoje / atrasadas. Dedupe diário.
create or replace function public.run_task_reminders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_today date := private.today(); v_soon int := 0; v_late int := 0;
begin
  if not private.is_service_role() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  for r in select id, assigned_to, created_by, due_date from public.tasks
            where status in ('todo', 'in_progress', 'blocked') and due_date is not null and due_date <= v_today + 1 loop
    if r.due_date < v_today then
      perform private.notify_task(r.id, r.assigned_to, 'overdue', null);
      perform private.notify_task(r.id, r.created_by, 'overdue', null);
      v_late := v_late + 1;
    else
      perform private.notify_task(r.id, r.assigned_to, 'due_soon', null);
      v_soon := v_soon + 1;
    end if;
  end loop;
  return jsonb_build_object('due_soon', v_soon, 'overdue', v_late);
end;
$$;

-- EXECUTE apenas nas rotinas novas (mesmo modelo da migration 0012).
revoke execute on function
  public.save_task_group(uuid, text, text, boolean, boolean), public.people_directory(), public.create_task(jsonb),
  public.update_task(uuid, jsonb), public.set_task_status(uuid, public.task_status, text), public.comment_task(uuid, text),
  public.run_task_reminders()
from public, anon, authenticated;
revoke execute on function
  private.first_name(text), private.priority_label(public.task_priority), private.notify_task(uuid, uuid, text, uuid, text),
  private.task_status_label(public.task_status), private.assert_assignable(uuid, uuid), private.validate_task_group(record, uuid)
from public, anon, authenticated;

grant execute on function
  public.save_task_group(uuid, text, text, boolean, boolean), public.people_directory(), public.create_task(jsonb),
  public.update_task(uuid, jsonb), public.set_task_status(uuid, public.task_status, text), public.comment_task(uuid, text)
to authenticated;
grant execute on function public.run_task_reminders() to service_role;

-- Grupos iniciais sugeridos (editáveis pela administração).
insert into public.task_groups (organization_id, name, description)
select o.id, g.name, g.description
  from public.organizations o
  cross join (values ('AUDIOVISUAL', 'Captação, edição e produção de vídeo e foto'),
                     ('VENDAS', 'Prospecção, propostas e follow-up comercial'),
                     ('ADMINISTRAÇÃO', 'Rotinas administrativas e financeiras')) as g(name, description)
 where o.slug = 'one-studio-digital'
on conflict do nothing;
