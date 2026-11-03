-- Perfil de trabalho, primeiro acesso, disponibilidade e ausências (migration 0018).
begin;
select tests.fixture();
create temp table v (k text primary key, id uuid); grant all on v to authenticated;

-- Horas: sobreposição presencial × remoto conta uma vez (T19).
select tests.ok(private.availability_minutes('[{"day":1,"start":"09:00","end":"14:00","mode":"onsite"},{"day":1,"start":"13:00","end":"18:00","mode":"remote"}]') = 540,
  'Blocos sobrepostos não somam em dobro (9 h, não 10 h)');
select tests.ok(private.availability_minutes('[{"day":1,"start":"09:00","end":"14:00","mode":"onsite"},{"day":1,"start":"13:00","end":"18:00","mode":"remote"}]', 'remote') = 300,
  'Horas por formato calculadas separadamente');
select tests.ok(private.availability_minutes('[{"day":1,"start":"09:00","end":"12:00","mode":"onsite"},{"day":2,"start":"09:00","end":"12:00","mode":"onsite"}]') = 360,
  'Dias diferentes somam normalmente');

-- Primeiro acesso.
select tests.as_user('prod_a', 'aal1');
select tests.ok((select count(*) from public.team_profiles) = 0, 'Sem perfil antes do primeiro acesso');
select tests.throws($$select public.save_my_team_profile(jsonb_build_object('primary_function', 'design', 'works_remote', true, 'weekly_hours_declared', '20', 'complete', true))$$,
  'Concluir exige confirmar as regras', 'regras');
select tests.throws($$select public.save_my_team_profile(jsonb_build_object('primary_function', 'design', 'complete', true, 'accept_rules', true))$$,
  'Concluir exige formato de trabalho', 'formato');
select tests.throws($$select public.save_my_team_profile(jsonb_build_object('primary_function', 'design', 'works_remote', true, 'complete', true, 'accept_rules', true))$$,
  'Concluir exige horários ou total de horas', 'horas');
select tests.throws($$select public.save_my_team_profile(jsonb_build_object('primary_function', 'design', 'works_remote', true,
  'availability', '[{"day":1,"start":"14:00","end":"09:00","mode":"remote"}]'::jsonb))$$, 'Horário final antes do inicial é recusado', 'depois do inicial');
select tests.throws($$select public.save_my_team_profile(jsonb_build_object('primary_function', 'design', 'works_remote', true,
  'availability', '[{"day":1,"start":"09:00","end":"12:00","mode":"onsite"}]'::jsonb))$$, 'Bloco em formato não marcado é recusado', 'formato de trabalho');
select public.save_my_team_profile(jsonb_build_object('primary_function', 'management', 'works_onsite', true, 'works_remote', true,
  'availability', '[{"day":1,"start":"09:00","end":"14:00","mode":"onsite"},{"day":1,"start":"13:00","end":"18:00","mode":"remote"}]'::jsonb,
  'tools', 'Figma, Premiere', 'complete', true, 'accept_rules', true));
select tests.ok((select onboarding_completed_at is not null and primary_function = 'management' from public.team_profiles where user_id = tests.id('prod_a')),
  'Primeiro acesso concluído e salvo');

-- Função "Gestão" é só preferência: não dá acesso (T02).
select tests.ok((select count(*) from public.clients) = 0 and (select count(*) from public.cash_accounts) = 0, 'Escolher "Gestão" não libera clientes nem financeiro');
select tests.throws($$select public.team_overview()$$, 'Escolher "Gestão" não libera a visão da equipe', 'administradores');
reset role;
select tests.ok((select role::text from public.profiles where id = tests.id('prod_a')) = 'production', 'Papel continua Produção');

-- Edição posterior não "desconclui" o primeiro acesso.
select tests.as_user('prod_a', 'aal1');
select public.save_my_team_profile(jsonb_build_object('primary_function', 'photography', 'works_external', true, 'weekly_hours_declared', '12'));
select tests.ok((select onboarding_completed_at is not null and primary_function = 'photography' from public.team_profiles where user_id = tests.id('prod_a')),
  'Atualizar perfil mantém o primeiro acesso concluído');

-- Ausências.
insert into v select 'abs_own', public.add_absence(current_date + 10, current_date + 12, 'Férias');
select tests.throws($$select public.add_absence(current_date + 1, current_date + 2, null, tests.id('seller_a'))$$,
  'Colaborador não registra ausência de outra pessoa', 'administração');
select tests.throws($$select public.add_absence(current_date + 5, current_date + 1)$$, 'Período invertido é recusado', 'inválido');
select tests.as_user('seller_a', 'aal1');
select tests.ok((select count(*) from public.absences) = 0 and (select count(*) from public.team_profiles) = 0, 'Vendedor não vê perfis nem ausências de outros');
select tests.throws($$select public.cancel_absence((select id from v where k = 'abs_own'))$$, 'Vendedor não cancela ausência alheia', 'não encontrada');
select tests.as_user('admin_a');
insert into v select 'abs_admin', public.add_absence(current_date + 3, current_date + 3, 'Consulta médica', tests.id('prod_a'));
select tests.ok((select count(*) from public.absences where user_id = tests.id('prod_a')) = 2, 'Administração vê e registra ausências da equipe');

-- Visão da equipe.
create temp table ov as select * from public.team_overview();
select tests.ok((select weekly_minutes is null and weekly_hours_declared = 12 from ov where user_id = tests.id('prod_a')),
  'Sem blocos de horário: horas desconhecidas (nulo), total declarado preservado');
select tests.ok((select next_absence_start = current_date + 3 from ov where user_id = tests.id('prod_a')), 'Próxima ausência aparece para a gestão');
select tests.ok((select weekly_minutes is null and not onboarding_completed from ov where user_id = tests.id('seller_b')),
  'Quem não preencheu aparece como não informado (não zero)');
select tests.as_user('prod_a', 'aal1');
select public.cancel_absence((select id from v where k = 'abs_own'));
reset role;
select tests.ok((select cancelled_at is not null from public.absences where id = (select id from v where k = 'abs_own')), 'Pessoa cancela a própria ausência (histórico preservado)');
rollback;
