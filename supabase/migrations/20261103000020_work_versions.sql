-- =============================================================================
-- ONE CONTROL — 0020 Versões, ajustes localizados e aprovação da versão exata
-- =============================================================================
-- Setor de produção, fase 4.
--  * Cada envio para revisão vira uma versão numerada (v1, v2…), com o link
--    da prévia e o que mudou.
--  * O revisor decide sobre a VERSÃO: aprova ou pede ajustes. Ajustes podem
--    apontar o local (página 3, foto 12, 01:23) e viram itens a resolver.
--  * Aprovar v1 não aprova v2: um novo envio substitui ("superseded") a
--    versão anterior, inclusive uma já aprovada.
--  * Concluir exige a última versão aprovada e o link da entrega final, por
--    quem não executou o trabalho. Aprovação, entrega e publicação são
--    eventos distintos.
--  * Compatível com a fase 3: set_work_status passa a registrar a versão
--    (envio para revisão cria a versão a partir da prévia mais recente;
--    ajustes e aprovação valem para a última versão).
-- =============================================================================

create type public.work_version_status as enum ('submitted', 'changes_requested', 'approved', 'superseded');

create table public.work_versions (
  id            uuid primary key default gen_random_uuid(),
  work_id       uuid not null references public.works (id) on delete cascade,
  number        integer not null check (number between 1 and 999),
  label         text null check (label is null or length(label) <= 160),
  url           text not null check (url ~ '^https://[^\s]+$' and length(url) <= 2000),
  note          text null check (note is null or length(note) <= 1000),
  link_id       uuid null references public.work_links (id),
  status        public.work_version_status not null default 'submitted',
  submitted_by  uuid not null references public.profiles (id),
  submitted_at  timestamptz not null default now(),
  decided_by    uuid null references public.profiles (id),
  decided_at    timestamptz null,
  decision_note text null check (decision_note is null or length(decision_note) <= 1000),
  unique (work_id, number),
  check ((status in ('approved', 'changes_requested')) = (decided_at is not null) or status = 'superseded')
);
create index idx_work_versions_work on public.work_versions (work_id, number desc);
create index idx_work_versions_link on public.work_versions (link_id);
create index idx_work_versions_submitted_by on public.work_versions (submitted_by);
create index idx_work_versions_decided_by on public.work_versions (decided_by);

create table public.work_feedback (
  id            uuid primary key default gen_random_uuid(),
  work_id       uuid not null references public.works (id) on delete cascade,
  version_id    uuid not null references public.work_versions (id) on delete cascade,
  location      text null check (location is null or length(location) <= 80),
  body          text not null check (length(btrim(body)) between 2 and 1000),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz null,
  resolved_by   uuid null references public.profiles (id),
  resolved_note text null check (resolved_note is null or length(resolved_note) <= 500),
  check ((resolved_at is null) = (resolved_by is null))
);
create index idx_work_feedback_work on public.work_feedback (work_id, resolved_at);
create index idx_work_feedback_version on public.work_feedback (version_id);
create index idx_work_feedback_created_by on public.work_feedback (created_by);
create index idx_work_feedback_resolved_by on public.work_feedback (resolved_by);

alter table public.work_versions enable row level security;
alter table public.work_feedback enable row level security;
revoke all on public.work_versions, public.work_feedback from anon, authenticated;
grant select on public.work_versions, public.work_feedback to authenticated;
create policy work_versions_select on public.work_versions for select to authenticated using ((select private.can_view_work(work_id)));
create policy work_feedback_select on public.work_feedback for select to authenticated using ((select private.can_view_work(work_id)));

-- Registra uma nova versão (substitui a anterior pendente ou aprovada).
create or replace function private.submit_version(p_work uuid, p_actor uuid, p_url text, p_label text, p_note text, p_link uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_number int; v_id uuid;
begin
  update public.work_versions set status = 'superseded' where work_id = p_work and status in ('submitted', 'approved');
  select coalesce(max(number), 0) + 1 into v_number from public.work_versions where work_id = p_work;
  insert into public.work_versions (work_id, number, label, url, note, link_id, submitted_by)
  values (p_work, v_number, nullif(btrim(left(p_label, 160)), ''), p_url, nullif(btrim(left(p_note, 1000)), ''), p_link, p_actor)
  returning id into v_id;
  perform private.work_event(p_work, p_actor, 'version_submitted', nullif(btrim(p_note), ''), jsonb_build_object('number', v_number, 'version_id', v_id));
  return v_id;
end;
$$;

-- Versão a partir da prévia mais recente (compatibilidade com o fluxo da fase 3).
create or replace function private.version_from_latest_preview(p_work uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare l record;
begin
  select * into l from public.work_links where work_id = p_work and removed_at is null and kind in ('preview', 'final')
   order by (kind = 'preview') desc, created_at desc limit 1;
  if l.id is null then raise exception 'Adicione o link da prévia antes de enviar para revisão' using errcode = '22023'; end if;
  return private.submit_version(p_work, p_actor, l.url, l.label, null, l.id);
end;
$$;

-- Decide sobre a ÚLTIMA versão: 'approve' ou 'changes' (com ajustes localizados).
create or replace function private.decide_latest_version(p_work uuid, p_actor uuid, p_decision text, p_note text, p_feedback jsonb)
returns public.work_versions
language plpgsql
security definer
set search_path = ''
as $$
declare v public.work_versions; f jsonb; v_count int := 0;
begin
  select * into v from public.work_versions where work_id = p_work order by number desc limit 1 for update;
  if v.id is null then
    perform private.version_from_latest_preview(p_work, p_actor);
    select * into v from public.work_versions where work_id = p_work order by number desc limit 1 for update;
  end if;
  if p_decision = 'approve' then
    if v.status = 'approved' then return v; end if;
    if v.status <> 'submitted' then raise exception 'A última versão não está aguardando revisão' using errcode = '22023'; end if;
    update public.work_versions set status = 'approved', decided_by = p_actor, decided_at = now(), decision_note = nullif(btrim(left(p_note, 1000)), '')
     where id = v.id;
    perform private.work_event(p_work, p_actor, 'version_approved', nullif(btrim(p_note), ''), jsonb_build_object('number', v.number, 'version_id', v.id));
  elsif p_decision = 'changes' then
    if v.status <> 'submitted' then raise exception 'A última versão não está aguardando revisão' using errcode = '22023'; end if;
    for f in select * from jsonb_array_elements(coalesce(p_feedback, '[]'::jsonb)) loop
      if nullif(btrim(coalesce(f ->> 'body', '')), '') is not null then
        insert into public.work_feedback (work_id, version_id, location, body, created_by)
        values (p_work, v.id, nullif(btrim(left(f ->> 'location', 80)), ''), btrim(left(f ->> 'body', 1000)), p_actor);
        v_count := v_count + 1;
      end if;
    end loop;
    if v_count = 0 then
      if nullif(btrim(coalesce(p_note, '')), '') is null then
        raise exception 'Descreva os ajustes (ex.: página 3, ajustar contraste)' using errcode = '22023';
      end if;
      insert into public.work_feedback (work_id, version_id, location, body, created_by)
      values (p_work, v.id, null, btrim(left(p_note, 1000)), p_actor);
    end if;
    update public.work_versions set status = 'changes_requested', decided_by = p_actor, decided_at = now(), decision_note = nullif(btrim(left(p_note, 1000)), '')
     where id = v.id;
  else
    raise exception 'Decisão inválida' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- Envio de versão para revisão (quem executa). Link https da prévia obrigatório.
create or replace function public.submit_work_version(p_work uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; w public.works; v_url text := btrim(coalesce(p ->> 'url', '')); v_link uuid; v_id uuid; v_number int;
begin
  select * into a from private.require_active_user();
  select * into w from public.works where id = p_work and organization_id = a.organization_id for update;
  if w.id is null or private.work_role(w, a.user_id, a.role) is null then raise exception 'Trabalho não encontrado' using errcode = 'P0002'; end if;
  if not private.is_work_assignee(w.id, a.user_id) and private.work_role(w, a.user_id, a.role) <> 'manager' then
    raise exception 'Somente responsáveis enviam versões' using errcode = '42501';
  end if;
  if w.status not in ('in_production', 'in_review') then raise exception 'O trabalho não está em produção' using errcode = '22023'; end if;
  if w.blocked_reason is not null then raise exception 'Resolva o bloqueio antes de enviar para revisão' using errcode = '22023'; end if;
  if v_url !~ '^https://[^\s]+$' or length(v_url) > 2000 then raise exception 'Informe um link https:// válido' using errcode = '22023'; end if;
  select coalesce(max(number), 0) + 1 into v_number from public.work_versions where work_id = w.id;
  insert into public.work_links (work_id, kind, label, url, note, created_by)
  values (w.id, 'preview', 'Versão ' || v_number || coalesce(' — ' || nullif(btrim(left(p ->> 'label', 140)), ''), ''), v_url,
          private.text_or_null(p, 'note', 500), a.user_id)
  returning id into v_link;
  v_id := private.submit_version(w.id, a.user_id, v_url, p ->> 'label', p ->> 'note', v_link);
  if w.status = 'in_production' then
    update public.works set status = 'in_review' where id = w.id;
    perform private.work_event(w.id, a.user_id, 'status_in_review', null, jsonb_build_object('from', w.status, 'to', 'in_review'));
  end if;
  perform private.notify_work(w.id, coalesce(w.reviewer_id, w.created_by), 'review', a.user_id);
  return v_id;
end;
$$;

-- Revisão da versão: aprovar (conclui se já houver entrega final) ou pedir ajustes localizados.
create or replace function public.review_work_version(p_version uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record; v public.work_versions; w public.works; v_role text; v_decision text := p ->> 'decision';
  v_note text := nullif(btrim(coalesce(p ->> 'note', '')), ''); d public.work_versions; v_summary text;
begin
  select * into a from private.require_active_user();
  select * into v from public.work_versions where id = p_version;
  select * into w from public.works where id = v.work_id and organization_id = a.organization_id for update;
  v_role := case when w.id is null then null else private.work_role(w, a.user_id, a.role) end;
  if v_role is null then raise exception 'Versão não encontrada' using errcode = 'P0002'; end if;
  if private.is_work_assignee(w.id, a.user_id) then raise exception 'Quem executou não pode aprovar o próprio trabalho' using errcode = '42501'; end if;
  if v_role not in ('manager', 'reviewer') then raise exception 'Somente quem revisa decide sobre a versão' using errcode = '42501'; end if;
  if w.status <> 'in_review' then raise exception 'O trabalho não está em revisão' using errcode = '22023'; end if;
  if v.number <> (select max(number) from public.work_versions where work_id = w.id) then
    raise exception 'Existe uma versão mais recente; revise a versão %', (select max(number) from public.work_versions where work_id = w.id) using errcode = '22023';
  end if;
  if v_decision = 'changes' then
    d := private.decide_latest_version(w.id, a.user_id, 'changes', v_note, p -> 'feedback');
    update public.works set status = 'in_production' where id = w.id;
    perform private.work_event(w.id, a.user_id, 'changes_requested', v_note, jsonb_build_object('from', 'in_review', 'to', 'in_production', 'number', d.number));
    select string_agg(coalesce(location || ': ', '') || body, ' · ') into v_summary
      from public.work_feedback where version_id = d.id;
    perform private.notify_work_participants(w.id, 'changes', a.user_id, 'v' || d.number || ' — ' || left(v_summary, 280), true);
  elsif v_decision = 'approve' then
    if w.blocked_reason is not null then raise exception 'Resolva o bloqueio antes de aprovar' using errcode = '22023'; end if;
    d := private.decide_latest_version(w.id, a.user_id, 'approve', v_note, null);
    if exists (select 1 from public.work_links where work_id = w.id and removed_at is null and kind = 'final') then
      update public.works set status = 'done', completed_at = now() where id = w.id;
      perform private.work_event(w.id, a.user_id, 'status_done', v_note, jsonb_build_object('from', 'in_review', 'to', 'done', 'number', d.number));
      perform private.notify_work_participants(w.id, 'approved', a.user_id, null, true);
    else
      perform private.notify_work_participants(w.id, 'updated', a.user_id, 'versão ' || d.number || ' aprovada — envie a entrega final', true);
    end if;
  else
    raise exception 'Decisão inválida' using errcode = '22023';
  end if;
end;
$$;

-- Conclusão após versão aprovada + entrega final (quem não executou).
create or replace function public.complete_work(p_work uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; w public.works; v_role text; v public.work_versions;
begin
  select * into a from private.require_active_user();
  select * into w from public.works where id = p_work and organization_id = a.organization_id for update;
  v_role := case when w.id is null then null else private.work_role(w, a.user_id, a.role) end;
  if v_role is null then raise exception 'Trabalho não encontrado' using errcode = 'P0002'; end if;
  if private.is_work_assignee(w.id, a.user_id) then raise exception 'Quem executou não pode aprovar o próprio trabalho' using errcode = '42501'; end if;
  if v_role not in ('manager', 'reviewer') then raise exception 'Somente quem revisa conclui' using errcode = '42501'; end if;
  if w.status <> 'in_review' then raise exception 'O trabalho não está em revisão' using errcode = '22023'; end if;
  select * into v from public.work_versions where work_id = w.id order by number desc limit 1;
  if v.id is null or v.status <> 'approved' then raise exception 'Aprove a última versão antes de concluir' using errcode = '22023'; end if;
  if w.blocked_reason is not null then raise exception 'Resolva o bloqueio antes de concluir' using errcode = '22023'; end if;
  if not exists (select 1 from public.work_links where work_id = w.id and removed_at is null and kind = 'final') then
    raise exception 'Inclua o link da entrega final antes de concluir' using errcode = '22023';
  end if;
  update public.works set status = 'done', completed_at = now() where id = w.id;
  perform private.work_event(w.id, a.user_id, 'status_done', null, jsonb_build_object('from', 'in_review', 'to', 'done', 'number', v.number));
  perform private.notify_work_participants(w.id, 'approved', a.user_id, null, true);
end;
$$;

-- Ajuste resolvido (quem executa ou quem prepara), com observação opcional.
create or replace function public.resolve_work_feedback(p_feedback uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; f record; w public.works;
begin
  select * into a from private.require_active_user();
  select * into f from public.work_feedback where id = p_feedback for update;
  select * into w from public.works where id = f.work_id and organization_id = a.organization_id;
  if w.id is null or private.work_role(w, a.user_id, a.role) is null then raise exception 'Ajuste não encontrado' using errcode = 'P0002'; end if;
  if w.status in ('done', 'cancelled') then raise exception 'Trabalho encerrado' using errcode = '22023'; end if;
  if f.resolved_at is null then
    update public.work_feedback set resolved_at = now(), resolved_by = a.user_id, resolved_note = nullif(btrim(left(p_note, 500)), '') where id = f.id;
    perform private.work_event(w.id, a.user_id, 'feedback_resolved', coalesce(f.location || ': ', '') || left(f.body, 200));
  end if;
end;
$$;

-- set_work_status: igual à 0019, acrescida do registro de versões (3 linhas marcadas por perform private.*version*).
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
    perform private.version_from_latest_preview(w.id, a.user_id);
  elsif p_status = 'in_production' and w.status = 'in_review' then
    if v_assignee or v_role not in ('manager', 'reviewer') then raise exception 'Somente quem revisa pede ajustes' using errcode = '42501'; end if;
    if v_note is null then raise exception 'Descreva os ajustes (ex.: página 3, ajustar contraste)' using errcode = '22023'; end if;
    perform private.decide_latest_version(w.id, a.user_id, 'changes', v_note, null);
  elsif p_status = 'done' and w.status = 'in_review' then
    if v_assignee then raise exception 'Quem executou não pode aprovar o próprio trabalho' using errcode = '42501'; end if;
    if v_role not in ('manager', 'reviewer') then raise exception 'Somente quem revisa aprova' using errcode = '42501'; end if;
    if w.blocked_reason is not null then raise exception 'Resolva o bloqueio antes de concluir' using errcode = '22023'; end if;
    if not exists (select 1 from public.work_links where work_id = w.id and removed_at is null and kind = 'final') then
      raise exception 'Inclua o link da entrega final antes de aprovar' using errcode = '22023';
    end if;
    perform private.decide_latest_version(w.id, a.user_id, 'approve', v_note, null);
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

revoke all on function private.submit_version(uuid, uuid, text, text, text, uuid), private.version_from_latest_preview(uuid, uuid),
  private.decide_latest_version(uuid, uuid, text, text, jsonb) from public;
revoke execute on function public.submit_work_version(uuid, jsonb), public.review_work_version(uuid, jsonb), public.complete_work(uuid),
  public.resolve_work_feedback(uuid, text) from public, anon;
grant execute on function public.submit_work_version(uuid, jsonb), public.review_work_version(uuid, jsonb), public.complete_work(uuid),
  public.resolve_work_feedback(uuid, text) to authenticated;
