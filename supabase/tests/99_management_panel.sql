-- Painel da gestão (migration 0023).
begin;
select tests.fixture();
create temp table v (k text primary key, id uuid); grant all on v to authenticated, service_role;
create temp table r (k text primary key, j jsonb); grant all on r to authenticated, service_role;
create temp table t0 as select private.today() as d; grant select on t0 to authenticated, service_role;

-- Perfis de trabalho: Prod A com blocos (4 h por dia, 7 dias); Seller B só com total semanal (14 h).
select tests.as_user('prod_a', 'aal1');
select public.save_my_team_profile(jsonb_build_object('primary_function', 'design', 'works_remote', true,
  'availability', (select jsonb_agg(jsonb_build_object('day', d, 'start', '09:00', 'end', '13:00', 'mode', 'remote')) from generate_series(1, 7) d)));
select tests.as_user('seller_b', 'aal1');
select public.save_my_team_profile(jsonb_build_object('primary_function', 'photography', 'works_external', true, 'weekly_hours_declared', '14'));

select tests.as_user('admin_a');
select public.add_absence((select d from t0) + 1, (select d from t0) + 1, 'Consulta', tests.id('prod_a'));
insert into v select 'late', public.create_work(jsonb_build_object('title', 'Post atrasado', 'category', 'post', 'client_id', tests.id('client_a'),
  'due_date', (select d from t0) - 2, 'estimated_hours', '6', 'assignees', jsonb_build_array(tests.id('prod_a'), tests.id('seller_b'))));
insert into v select 'block', public.create_work(jsonb_build_object('title', 'Vídeo bloqueado', 'category', 'video_edit',
  'due_date', (select d from t0) + 3, 'estimated_hours', '10', 'assignees', jsonb_build_array(tests.id('prod_a'))));
select public.set_work_blocked((select id from v where k = 'block'), 'Cliente não enviou a trilha');
insert into v select 'mat', public.create_work(jsonb_build_object('title', 'Carrossel sem material', 'category', 'carousel',
  'due_date', (select d from t0) + 2, 'assignees', jsonb_build_array(tests.id('prod_a')),
  'items', jsonb_build_array(jsonb_build_object('kind', 'requirement', 'title', 'Logo em vetor', 'required', true))));
insert into v select 'far', public.create_work(jsonb_build_object('title', 'Site institucional', 'category', 'web',
  'due_date', (select d from t0) + 20, 'estimated_hours', '50', 'assignees', jsonb_build_array(tests.id('prod_a'), tests.id('admin_b'))));
insert into v select 'big', public.create_work(jsonb_build_object('title', 'Ensaio de produtos', 'category', 'photo',
  'due_date', (select d from t0) + 4, 'estimated_hours', '20', 'assignees', jsonb_build_array(tests.id('seller_b'))));
insert into v select 'rev', public.create_work(jsonb_build_object('title', 'Arte para revisar', 'category', 'design',
  'due_date', (select d from t0) + 1, 'estimated_hours', '3', 'reviewer_id', tests.id('admin_b'), 'assignees', jsonb_build_array(tests.id('prod_a'))));
select public.set_work_status((select id from v where k = 'rev'), 'ready', null);
select tests.as_user('prod_a', 'aal1');
select public.set_work_status((select id from v where k = 'rev'), 'in_production', null);
select public.submit_work_version((select id from v where k = 'rev'), jsonb_build_object('url', 'https://example.test/arte-v1'));

-- Sessões: captação conjunta (3 h), uma sobreposta só da Prod A (2 h), uma cancelada e uma fora da janela.
select tests.as_user('admin_a');
insert into r select 's1', public.save_session(null, jsonb_build_object('kind', 'shoot', 'title', 'Captação na loja', 'client_id', tests.id('client_a'),
  'starts_at', ((select d from t0) + 2)::text || ' 09:00-03:00', 'ends_at', ((select d from t0) + 2)::text || ' 12:00-03:00',
  'participants', jsonb_build_array(tests.id('prod_a'), tests.id('seller_b'))));
insert into r select 's2', public.save_session(null, jsonb_build_object('kind', 'meeting', 'title', 'Reunião de pauta',
  'starts_at', ((select d from t0) + 2)::text || ' 11:00-03:00', 'ends_at', ((select d from t0) + 2)::text || ' 13:00-03:00',
  'participants', jsonb_build_array(tests.id('prod_a'))));
insert into r select 's3', public.save_session(null, jsonb_build_object('kind', 'photo', 'title', 'Sessão cancelada',
  'starts_at', ((select d from t0) + 3)::text || ' 09:00-03:00', 'ends_at', ((select d from t0) + 3)::text || ' 18:00-03:00',
  'participants', jsonb_build_array(tests.id('prod_a'))));
select public.cancel_session(((select j from r where k = 's3') ->> 'id')::uuid, 'Cliente remarcou');
insert into r select 's4', public.save_session(null, jsonb_build_object('kind', 'delivery', 'title', 'Entrega distante',
  'starts_at', ((select d from t0) + 10)::text || ' 09:00-03:00', 'ends_at', ((select d from t0) + 10)::text || ' 10:00-03:00',
  'participants', jsonb_build_array(tests.id('seller_b'))));

-- Somente a administração (com MFA) lê o painel.
select tests.as_user('seller_a', 'aal1');
select tests.throws($$select public.management_panel()$$, 'Vendedor não lê o painel da gestão', 'administradores');
select tests.as_user('prod_a', 'aal1');
select tests.throws($$select public.management_panel()$$, 'Produção não lê o painel da gestão', 'administradores');
select tests.as_user('admin_a', 'aal1');
select tests.throws($$select public.management_panel()$$, 'Administração sem MFA não lê o painel', 'MFA');
select tests.as_user('admin_a');
select tests.throws($$select public.management_panel(0)$$, 'Janela mínima de 1 dia', 'Janela inválida');
select tests.throws($$select public.management_panel(32)$$, 'Janela máxima de 31 dias', 'Janela inválida');

insert into r select 'p', public.management_panel();
reset role;
select tests.ok((select (j ->> 'from')::date = d and (j ->> 'to')::date = d + 6 from r, t0 where k = 'p'), 'Janela padrão: hoje + 6 dias');

-- Aprovações pendentes.
select tests.ok((select jsonb_array_length(j -> 'approvals') = 1 from r where k = 'p'), 'Uma aprovação pendente');
select tests.ok((select j -> 'approvals' -> 0 ->> 'title' = 'Arte para revisar' and (j -> 'approvals' -> 0 ->> 'version')::int = 1
                   and j -> 'approvals' -> 0 ->> 'reviewer' = 'Admin B' and j -> 'approvals' -> 0 -> 'assignees' = '["Prod A"]'::jsonb
                   and j -> 'approvals' -> 0 ->> 'waiting_since' is not null from r where k = 'p'),
  'Aprovação mostra versão, quem revisa, responsáveis e desde quando');

-- Entregas em risco: atrasada, bloqueada e aguardando material; o resto fica fora.
select tests.ok((select jsonb_array_length(j -> 'at_risk') = 3 from r where k = 'p'), 'Três entregas em risco');
select tests.ok((select j -> 'at_risk' -> 0 ->> 'title' = 'Post atrasado' and j -> 'at_risk' -> 0 -> 'reasons' = '["overdue"]'::jsonb
                   and (j -> 'at_risk' -> 0 ->> 'days_late')::int = 2 and j -> 'at_risk' -> 0 ->> 'client' = 'Empresa A' from r where k = 'p'),
  'Atraso vem primeiro, com dias de atraso e cliente');
select tests.ok((select count(*) = 1 from r, jsonb_array_elements(j -> 'at_risk') x
                  where k = 'p' and x ->> 'title' = 'Vídeo bloqueado' and x -> 'reasons' = '["blocked"]'::jsonb
                    and x ->> 'blocked_reason' = 'Cliente não enviou a trilha'), 'Bloqueio aparece com o motivo');
select tests.ok((select count(*) = 1 from r, jsonb_array_elements(j -> 'at_risk') x
                  where k = 'p' and x ->> 'title' = 'Carrossel sem material' and x -> 'reasons' = '["waiting_material"]'::jsonb
                    and x -> 'missing' = '["Logo em vetor"]'::jsonb), 'Aguardando material lista o que falta');
select tests.ok((select count(*) = 0 from r, jsonb_array_elements(j -> 'at_risk') x
                  where k = 'p' and x ->> 'title' in ('Site institucional', 'Arte para revisar', 'Ensaio de produtos')),
  'Trabalho em dia não entra como risco');

-- Próximas sessões.
select tests.ok((select jsonb_array_length(j -> 'sessions') = 2 from r where k = 'p'), 'Sessão cancelada e fora da janela não aparecem');
select tests.ok((select j -> 'sessions' -> 0 ->> 'title' = 'Captação na loja' and j -> 'sessions' -> 0 -> 'participants' = '["Prod A", "Seller B"]'::jsonb
                   and (j -> 'sessions' -> 0 ->> 'people_in_conflict')::int = 1 and j -> 'sessions' -> 0 ->> 'client' = 'Empresa A' from r where k = 'p'),
  'Sessão mostra participantes e quem está em conflito');

-- Carga por pessoa.
select tests.ok((select x ->> 'availability_source' = 'blocks' and (x ->> 'available_minutes')::int = 1440 and (x ->> 'absence_days')::int = 1
                   and (x ->> 'session_minutes')::int = 300 and (x ->> 'work_minutes')::int = 780 and (x ->> 'committed_minutes')::int = 1080
                   and (x ->> 'open_works')::int = 4 and (x ->> 'in_review')::int = 1 and (x ->> 'due_works')::int = 3
                   and (x ->> 'works_without_estimate')::int = 1 and (x ->> 'over')::boolean = false
                  from r, jsonb_array_elements(j -> 'load') x where k = 'p' and x ->> 'name' = 'Prod A'),
  'Prod A: 6 dias × 4 h (sem o dia de ausência); sessões 5 h; trabalhos 13 h (estimativa dividida); um sem estimativa');
select tests.ok((select x ->> 'availability_source' = 'declared_total' and (x ->> 'available_minutes')::int = 840
                   and (x ->> 'committed_minutes')::int = 1560 and (x ->> 'over')::boolean
                  from r, jsonb_array_elements(j -> 'load') x where k = 'p' and x ->> 'name' = 'Seller B'),
  'Seller B: total semanal declarado; compromisso acima da disponibilidade');
select tests.ok((select j -> 'load' -> 0 ->> 'name' = 'Seller B' from r where k = 'p'), 'Quem está acima da disponibilidade vem primeiro');
select tests.ok((select x -> 'available_minutes' = 'null'::jsonb and x -> 'over' = 'null'::jsonb and x -> 'availability_source' = 'null'::jsonb
                  from r, jsonb_array_elements(j -> 'load') x where k = 'p' and x ->> 'name' = 'Admin B'),
  'Sem disponibilidade informada: não vira zero nem "acima"');
select tests.ok((select count(*) = 0 from r, jsonb_array_elements(j -> 'load') x where k = 'p' and x ->> 'name' in ('Seller A', 'Seller Off', 'Admin A')),
  'Sem perfil, trabalho ou sessão: fora da lista de carga');

-- Janela maior inclui a sessão distante; resolver o bloqueio tira o trabalho do risco.
select tests.as_user('admin_a');
select tests.ok((select jsonb_array_length(public.management_panel(14) -> 'sessions') = 3), 'Janela de 14 dias inclui a sessão distante');
select public.set_work_blocked((select id from v where k = 'block'), null);
select tests.ok((select count(*) = 0 from jsonb_array_elements(public.management_panel() -> 'at_risk') x where x ->> 'title' = 'Vídeo bloqueado'),
  'Bloqueio resolvido sai do painel');
rollback;
