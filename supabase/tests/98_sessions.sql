-- Sessões de produção e calendário (migration 0022).
begin;
select tests.fixture();
create temp table v (k text primary key, id uuid); grant all on v to authenticated, service_role;
create temp table r (k text primary key, j jsonb); grant all on r to authenticated, service_role;

select tests.as_user('seller_a', 'aal1');
select public.save_client_kit(tests.id('client_a'), jsonb_build_object('activity', 'Restaurante'));
select tests.as_user('admin_a');
insert into v select 'wf', public.create_work(jsonb_build_object('title', 'Vídeo do cardápio', 'category', 'video_shoot', 'client_id', tests.id('client_a'),
  'due_date', current_date + 5, 'assignees', jsonb_build_array(tests.id('prod_a'))));
insert into v select 'wp', public.create_work(jsonb_build_object('title', 'Fotos dos pratos', 'category', 'photo', 'client_id', tests.id('client_a'),
  'due_date', current_date + 6, 'assignees', jsonb_build_array(tests.id('seller_b'))));

-- Validações.
select tests.throws($$select public.save_session(null, jsonb_build_object('kind', 'shoot', 'title', 'Sem gente', 'starts_at', now() + interval '1 day', 'ends_at', now() + interval '1 day 2 hours'))$$,
  'Sessão exige participante', 'participante');
select tests.throws($$select public.save_session(null, jsonb_build_object('kind', 'shoot', 'title', 'Invertida', 'starts_at', now() + interval '2 day', 'ends_at', now() + interval '1 day',
  'participants', jsonb_build_array(tests.id('prod_a'))))$$, 'Fim antes do início é recusado', 'Horário inválido');

-- Captação conjunta: um evento, duas pessoas, dois trabalhos (T12).
insert into r select 's1', public.save_session(null, jsonb_build_object('kind', 'shoot', 'title', 'Captação no restaurante', 'client_id', tests.id('client_a'),
  'starts_at', (current_date + 3)::text || ' 09:00-03:00', 'ends_at', (current_date + 3)::text || ' 12:00-03:00',
  'location', 'Restaurante', 'address', 'Rua Exemplo, 100', 'meeting_point', 'Entrada lateral', 'contacts', 'Gerente: (71) 0000-0000',
  'checklist', 'Bateria extra; cartões formatados',
  'participants', jsonb_build_array(tests.id('prod_a'), tests.id('seller_b')),
  'roles', jsonb_build_array(jsonb_build_object('user_id', tests.id('prod_a'), 'note', 'filmagem'), jsonb_build_object('user_id', tests.id('seller_b'), 'note', 'fotografia')),
  'works', jsonb_build_array((select id from v where k = 'wf'), (select id from v where k = 'wp'))));
insert into v select 's1', ((select j from r where k = 's1') ->> 'id')::uuid;
reset role;
select tests.ok((select count(*) from public.production_sessions) = 1 and (select count(*) from public.session_participants) = 2 and (select count(*) from public.session_works) = 2,
  'Uma sessão compartilhada, duas pessoas, dois trabalhos (T12)');
select tests.ok((select jsonb_array_length(j -> 'conflicts') = 0 from r where k = 's1'), 'Sem conflito na primeira sessão');
select tests.ok((select count(*) from public.notifications where type = 'session_scheduled') = 2, 'Cada participante é avisado');
select tests.ok((select title like 'Prod, você está em uma captação de vídeo' from public.notifications where recipient_user_id = tests.id('prod_a') and type = 'session_scheduled'),
  'Aviso personalizado');

-- Participantes veem sessão, cliente e kit; quem não participa não vê.
select tests.as_user('prod_a', 'aal1');
select tests.throws($$select public.save_session(null, jsonb_build_object('kind', 'other', 'title', 'X', 'starts_at', now(), 'ends_at', now() + interval '1 hour', 'participants', jsonb_build_array(tests.id('prod_a'))))$$,
  'Só a gestão agenda sessões', 'administradores');
select tests.ok((select count(*) from public.production_sessions) = 1 and (select count(*) from public.session_participants) = 2, 'Participante vê a sessão e a equipe');
select tests.as_user('admin_a');
select public.set_work_assignees((select id from v where k = 'wp'), array[]::uuid[]);
select tests.as_user('seller_b', 'aal1');
select tests.ok((select count(*) from public.works) = 0, 'Sem trabalho atribuído no cliente…');
select tests.ok((select count(*) from public.client_kits where client_id = tests.id('client_a')) = 1
  and exists (select 1 from public.visible_client_names() where id = tests.id('client_a')), '…o participante da sessão ainda vê o nome e o kit do cliente');
select tests.as_user('seller_a', 'aal1');
select tests.ok((select count(*) from public.production_sessions) = 0, 'Dono da carteira que não participa não vê a sessão');

-- Conflitos avisam, não bloqueiam.
select tests.as_user('admin_a');
insert into v select 'abs', public.add_absence(current_date + 3, current_date + 3, 'Consulta', tests.id('seller_b'));
insert into r select 's2', public.save_session(null, jsonb_build_object('kind', 'photo', 'title', 'Fotos de equipe', 'starts_at', (current_date + 3)::text || ' 11:00-03:00',
  'ends_at', (current_date + 3)::text || ' 13:00-03:00', 'participants', jsonb_build_array(tests.id('prod_a'), tests.id('seller_b'))));
select tests.ok((select (select count(*) from jsonb_array_elements(j -> 'conflicts') c where c ->> 'kind' = 'session' and (c ->> 'user_id')::uuid = tests.id('prod_a')) = 1 from r where k = 's2'),
  'Sobreposição de horário vira aviso');
select tests.ok((select (select count(*) from jsonb_array_elements(j -> 'conflicts') c where c ->> 'kind' = 'absence') = 1 from r where k = 's2'),
  'Sessão durante ausência vira aviso');
select tests.ok((select count(*) from public.production_sessions where cancelled_at is null) = 2, 'Conflito não impede o agendamento');

-- Alteração de horário avisa; cancelamento exige motivo e avisa.
select public.save_session((select id from v where k = 's1'), jsonb_build_object('kind', 'shoot', 'title', 'Captação no restaurante', 'client_id', tests.id('client_a'),
  'starts_at', (current_date + 4)::text || ' 14:00-03:00', 'ends_at', (current_date + 4)::text || ' 17:00-03:00',
  'participants', jsonb_build_array(tests.id('prod_a'), tests.id('seller_b'))));
select tests.throws($$select public.cancel_session((select id from v where k = 's1'), '')$$, 'Cancelar exige motivo', 'motivo');
select public.cancel_session((select id from v where k = 's1'), 'Cliente remarcou');
reset role;
select tests.ok((select count(*) from public.notifications where type = 'session_updated' and recipient_user_id = tests.id('prod_a')) = 2, 'Mudança e cancelamento avisam o participante');
select tests.ok((select count(*) from public.session_works) = 0, 'Edição sem trabalhos remove os vínculos');

-- Calendário.
select tests.as_user('prod_a', 'aal1');
create temp table feed as select * from public.calendar_feed(current_date, current_date + 10);
select tests.ok((select count(*) from feed where item_type = 'session') = 2 and (select count(*) from feed where item_type = 'session' and status = 'cancelled') = 1,
  'Agenda mostra as sessões da pessoa (cancelada marcada)');
select tests.ok((select count(*) from feed where item_type = 'work_due') = 1, 'Agenda mostra só os prazos dos trabalhos da pessoa');
select tests.ok((select count(*) from feed where item_type = 'absence') = 0, 'Ausência de colega não aparece para a produção');
select tests.throws($$select * from public.calendar_feed(current_date, current_date + 7, tests.id('seller_b'))$$, 'Só a gestão consulta a agenda de outra pessoa', 'gestão');
select tests.throws($$select * from public.calendar_feed(current_date, current_date + 90)$$, 'Período limitado a 62 dias', '62 dias');
select tests.as_user('admin_a');
select tests.ok((select count(*) from public.calendar_feed(current_date, current_date + 10, tests.id('seller_b')) where item_type = 'absence') = 1,
  'Gestão vê ausências da equipe filtrando por pessoa');
rollback;
