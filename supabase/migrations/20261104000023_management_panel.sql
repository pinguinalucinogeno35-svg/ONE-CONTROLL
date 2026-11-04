-- =============================================================================
-- ONE CONTROL — 0023 Painel da gestão (setor de produção, fase 7)
-- =============================================================================
-- Uma única leitura, exclusiva da administração, com o que exige decisão:
--  * approvals: trabalhos em revisão (versão aguardando, desde quando, quem revisa).
--  * at_risk:   trabalhos abertos atrasados, bloqueados ou aguardando material
--               (rascunho com item obrigatório pendente). O motivo vai junto.
--  * sessions:  sessões não canceladas que ainda não terminaram e começam na janela,
--               com o número de pessoas em conflito de agenda.
--  * load:      por pessoa, o compromisso na janela comparado à disponibilidade:
--               - disponível = blocos semanais do perfil aplicados a cada dia da
--                 janela, sem os dias de ausência; sem blocos, usa o total semanal
--                 declarado proporcional aos dias (fonte informada); sem nada, null
--                 ("Não informado" — desconhecido nunca vira zero);
--               - compromisso = horas de sessões na janela + estimativa dos trabalhos
--                 abertos com prazo até o fim da janela (inclui atrasados), dividida
--                 igualmente entre os responsáveis. Trabalhos sem estimativa são
--                 contados à parte, nunca como zero hora.
-- Somente leitura: nada é gravado. Janela de 1 a 31 dias a partir de hoje (Bahia).
-- =============================================================================

create or replace function public.management_panel(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a record; v_from date := private.today(); v_to date; v_start timestamptz; v_end timestamptz;
  v_approvals jsonb; v_risk jsonb; v_sessions jsonb; v_load jsonb;
begin
  select * into a from private.require_admin();
  if p_days is null or p_days not between 1 and 31 then
    raise exception 'Janela inválida (1 a 31 dias)' using errcode = '22023';
  end if;
  v_to := v_from + p_days - 1;
  v_start := v_from::timestamp at time zone 'America/Bahia';
  v_end := (v_to + 1)::timestamp at time zone 'America/Bahia';

  -- Aprovações pendentes: o mais antigo primeiro.
  select coalesce(jsonb_agg(q.x order by q.k, q.t), '[]'::jsonb) into v_approvals from (
    select jsonb_build_object(
             'work_id', w.id, 'title', w.title, 'category', w.category, 'client', c.company_name,
             'due_current', w.due_current, 'overdue', coalesce(w.due_current < v_from, false),
             'reviewer_id', coalesce(w.reviewer_id, w.created_by), 'reviewer', rp.full_name,
             'version', lv.number, 'waiting_since', coalesce(lv.submitted_at, ev.created_at, w.updated_at),
             'assignees', (select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]'::jsonb)
                             from public.work_assignees wa join public.profiles p on p.id = wa.user_id where wa.work_id = w.id)) as x,
           coalesce(lv.submitted_at, ev.created_at, w.updated_at) as k, w.title as t
      from public.works w
      left join public.clients c on c.id = w.client_id
      left join public.profiles rp on rp.id = coalesce(w.reviewer_id, w.created_by)
      left join lateral (select v.number, v.submitted_at from public.work_versions v
                          where v.work_id = w.id and v.status = 'submitted' order by v.number desc limit 1) lv on true
      left join lateral (select e.created_at from public.work_events e
                          where e.work_id = w.id and e.kind = 'status_in_review' order by e.created_at desc limit 1) ev on true
     where w.organization_id = a.organization_id and w.status = 'in_review'
  ) q;

  -- Entregas em risco: prazo mais antigo primeiro; sem prazo por último.
  select coalesce(jsonb_agg(q.x order by q.k nulls last, q.t), '[]'::jsonb) into v_risk from (
    select jsonb_build_object(
             'work_id', w.id, 'title', w.title, 'category', w.category, 'status', w.status, 'client', c.company_name,
             'due_current', w.due_current,
             'days_late', case when w.due_current < v_from then v_from - w.due_current end,
             'blocked_reason', w.blocked_reason, 'blocked_at', w.blocked_at,
             'missing', case when w.status = 'draft' then m.items end,
             'assignees', (select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]'::jsonb)
                             from public.work_assignees wa join public.profiles p on p.id = wa.user_id where wa.work_id = w.id),
             'reasons', to_jsonb(array_remove(array[
                 case when w.due_current < v_from then 'overdue' end,
                 case when w.blocked_reason is not null then 'blocked' end,
                 case when w.status = 'draft' and m.items is not null then 'waiting_material' end], null))) as x,
           w.due_current as k, w.title as t
      from public.works w
      left join public.clients c on c.id = w.client_id
      left join lateral (select jsonb_agg(i.title order by i.position, i.title) as items from public.work_items i
                          where i.work_id = w.id and i.required and not i.done) m on true
     where w.organization_id = a.organization_id and w.status not in ('done', 'cancelled')
       and (w.due_current < v_from or w.blocked_reason is not null or (w.status = 'draft' and m.items is not null))
  ) q;

  -- Próximas sessões (inclui a que está acontecendo agora).
  select coalesce(jsonb_agg(q.x order by q.k), '[]'::jsonb) into v_sessions from (
    select jsonb_build_object(
             'session_id', s.id, 'title', s.title, 'kind', s.kind, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
             'location', s.location, 'client', c.company_name,
             'participants', (select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]'::jsonb)
                                from public.session_participants sp join public.profiles p on p.id = sp.user_id where sp.session_id = s.id),
             'people_in_conflict', (select count(distinct cf ->> 'user_id') from jsonb_array_elements(private.session_conflicts(s.id)) cf)) as x,
           s.starts_at as k
      from public.production_sessions s
      left join public.clients c on c.id = s.client_id
     where s.organization_id = a.organization_id and s.cancelled_at is null and s.ends_at > now() and s.starts_at < v_end
  ) q;

  -- Carga por pessoa na janela.
  with days as (
    select d::date as day, extract(isodow from d)::int as dow from generate_series(v_from, v_to, interval '1 day') d
  ), people as (
    select p.id, p.full_name, p.role from public.profiles p
     where p.organization_id = a.organization_id and p.status = 'active'
       and (exists (select 1 from public.team_profiles t where t.user_id = p.id)
            or exists (select 1 from public.work_assignees wa join public.works w on w.id = wa.work_id
                        where wa.user_id = p.id and w.status not in ('done', 'cancelled'))
            or exists (select 1 from public.session_participants sp join public.production_sessions s on s.id = sp.session_id
                        where sp.user_id = p.id and s.cancelled_at is null and s.starts_at < v_end and s.ends_at > v_start))
  ), per_day as (
    select pe.id, dd.day, dd.dow,
           exists (select 1 from public.absences ab where ab.user_id = pe.id and ab.cancelled_at is null
                     and dd.day between ab.starts_on and ab.ends_on) as absent
      from people pe cross join days dd
  ), avail as (
    select pe.id,
           (select count(*) from per_day x where x.id = pe.id and x.absent)::int as absence_days,
           case
             when t.user_id is not null and jsonb_array_length(t.availability) > 0 then 'blocks'
             when t.weekly_hours_declared is not null then 'declared_total'
           end as source,
           case
             when t.user_id is not null and jsonb_array_length(t.availability) > 0 then
               (select coalesce(sum(private.availability_minutes(
                         (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(t.availability) e where (e ->> 'day')::int = x.dow))), 0)
                  from per_day x where x.id = pe.id and not x.absent)::int
             when t.weekly_hours_declared is not null then
               round(t.weekly_hours_declared * 60 * (select count(*) from per_day x where x.id = pe.id and not x.absent) / 7.0)::int
           end as available
      from people pe left join public.team_profiles t on t.user_id = pe.id
  ), sess as (
    select sp.user_id,
           round(sum(extract(epoch from (least(s.ends_at, v_end) - greatest(s.starts_at, v_start)))) / 60)::int as minutes,
           count(*)::int as sessions
      from public.session_participants sp join public.production_sessions s on s.id = sp.session_id
     where s.organization_id = a.organization_id and s.cancelled_at is null and s.starts_at < v_end and s.ends_at > v_start
     group by sp.user_id
  ), wk as (
    select wa.user_id,
           count(*) filter (where w.status in ('draft', 'ready', 'in_production'))::int as open_works,
           count(*) filter (where w.status = 'in_review')::int as in_review,
           count(*) filter (where w.status in ('draft', 'ready', 'in_production') and w.due_current <= v_to)::int as due_works,
           count(*) filter (where w.status in ('draft', 'ready', 'in_production') and w.due_current <= v_to and w.estimated_hours is null)::int as no_estimate,
           coalesce(round(sum(w.estimated_hours * 60 / n.cnt) filter (where w.status in ('draft', 'ready', 'in_production') and w.due_current <= v_to)), 0)::int as minutes
      from public.work_assignees wa
      join public.works w on w.id = wa.work_id
      cross join lateral (select count(*) as cnt from public.work_assignees x where x.work_id = w.id) n
     where w.organization_id = a.organization_id and w.status not in ('done', 'cancelled')
     group by wa.user_id
  ), lr as (
    select pe.id, pe.full_name, pe.role, av.available, av.source, av.absence_days,
           coalesce(se.minutes, 0) as session_minutes, coalesce(se.sessions, 0) as sessions,
           coalesce(wk.minutes, 0) as work_minutes, coalesce(se.minutes, 0) + coalesce(wk.minutes, 0) as committed,
           coalesce(wk.open_works, 0) as open_works, coalesce(wk.in_review, 0) as in_review,
           coalesce(wk.due_works, 0) as due_works, coalesce(wk.no_estimate, 0) as no_estimate
      from people pe
      join avail av on av.id = pe.id
      left join sess se on se.user_id = pe.id
      left join wk on wk.user_id = pe.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', r.id, 'name', r.full_name, 'role', r.role,
           'available_minutes', r.available, 'availability_source', r.source, 'absence_days', r.absence_days,
           'session_minutes', r.session_minutes, 'sessions', r.sessions, 'work_minutes', r.work_minutes,
           'committed_minutes', r.committed, 'open_works', r.open_works, 'in_review', r.in_review,
           'due_works', r.due_works, 'works_without_estimate', r.no_estimate,
           'over', case when r.available is null then null else r.committed > r.available end)
         order by (r.available is not null and r.committed > r.available) desc, r.available is null, r.full_name), '[]'::jsonb)
    into v_load from lr r;

  return jsonb_build_object('from', v_from, 'to', v_to, 'days', p_days,
    'approvals', v_approvals, 'at_risk', v_risk, 'sessions', v_sessions, 'load', v_load);
end;
$$;

revoke execute on function public.management_panel(integer) from public, anon;
grant execute on function public.management_panel(integer) to authenticated;
