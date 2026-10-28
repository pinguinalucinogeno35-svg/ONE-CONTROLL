-- Tarefas por grupo, designação e notificações personalizadas.
begin;
select tests.fixture();
create temp table v (k text primary key, id uuid); grant all on v to authenticated;

-- Grupos: somente admin
select tests.as_user('seller_a');
select tests.throws($$select public.save_task_group(null, 'Audio Visual', null, true, true)$$, 'Vendedor não cria grupo', 'administradores');
select tests.as_user('admin_a');
insert into v select 'g_av', public.save_task_group(null, 'Audio Visual', 'Vídeo e foto', true, true);
insert into v select 'g_adm', public.save_task_group(null, 'Administração', null, false, true);
select tests.throws($$select public.save_task_group(null, 'audio visual', null, true, true)$$, 'Nome de grupo duplicado (sem diferenciar caixa)', 'Já existe');
reset role;
select tests.ok((select name from public.task_groups where id = (select id from v where k = 'g_av')) = 'AUDIO VISUAL', 'Nome do grupo padronizado em maiúsculas');

-- Admin designa para vendedor → notificação personalizada
select tests.as_user('admin_a');
insert into v select 't1', public.create_task(jsonb_build_object('group_id', (select id from v where k = 'g_adm'), 'title', 'Enviar notas fiscais',
  'assigned_to', tests.id('seller_a'), 'priority', 'high', 'due_date', (now() at time zone 'America/Bahia')::date + 3));
reset role;
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('seller_a') and type = 'task_assigned'
                  and title like 'Seller, você tem uma nova tarefa' and message like 'Admin A designou “Enviar notas fiscais” para você em ADMINISTRAÇÃO%prioridade alta.') = 1,
  'Notificação personalizada com nome, quem designou, grupo, prazo e prioridade');
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('admin_a')) = 0, 'Quem designou não recebe notificação da própria ação');

-- Vendedor designa para administrador e para outro vendedor (grupo liberado)
select tests.as_user('seller_a');
insert into v select 't2', public.create_task(jsonb_build_object('group_id', (select id from v where k = 'g_av'), 'title', 'Editar vídeo do cliente', 'assigned_to', tests.id('admin_b')));
insert into v select 't3', public.create_task(jsonb_build_object('group_id', (select id from v where k = 'g_av'), 'title', 'Captar fotos do evento', 'assigned_to', tests.id('seller_b')));
select tests.throws($$select public.create_task(jsonb_build_object('group_id', (select id from v where k = 'g_adm'), 'title', 'Pagar fornecedor', 'assigned_to', tests.id('admin_b')))$$,
  'Vendedor não usa grupo restrito à administração', 'apenas tarefas criadas pela administração');
select tests.throws($$select public.create_task(jsonb_build_object('group_id', (select id from v where k = 'g_av'), 'title', 'Tarefa x', 'assigned_to', tests.id('seller_off')))$$,
  'Não designa para colaborador inativo', 'inativo');
select tests.throws($$select public.create_task(jsonb_build_object('group_id', (select id from v where k = 'g_av'), 'title', 'Tarefa y', 'assigned_to', tests.id('seller_b'), 'due_date', (now() at time zone 'America/Bahia')::date - 1))$$,
  'Prazo no passado rejeitado', 'passado');
select tests.throws($$insert into public.tasks (organization_id, group_id, title, assigned_to, created_by) values (tests.id('org'), (select id from v where k = 'g_av'), 'direto', tests.id('seller_b'), tests.id('seller_a'))$$,
  'Sem INSERT direto na tabela', 'permission denied');
reset role;
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('admin_b') and type = 'task_assigned' and title like 'Admin, você%') = 1,
  'Administrador notificado da tarefa criada pelo vendedor');

-- Visibilidade
select tests.as_user('seller_b');
select tests.ok((select count(*) from public.tasks) = 1, 'Vendedor B vê apenas a tarefa que recebeu');
select tests.ok((select count(*) from public.tasks where id = (select id from v where k = 't2')) = 0, 'Vendedor B não vê tarefa entre outras pessoas');
select tests.as_user('seller_a');
select tests.ok((select count(*) from public.tasks) = 3, 'Vendedor A vê as que criou e as que recebeu');
select tests.as_user('admin_c');
select tests.ok((select count(*) from public.tasks) = 3, 'Administrador vê todas');

-- Andamento pelo responsável; edição restrita ao criador/admin
select tests.as_user('seller_b');
select public.set_task_status((select id from v where k = 't3'), 'in_progress', null);
select tests.throws($$select public.update_task((select id from v where k = 't3'), jsonb_build_object('assigned_to', tests.id('admin_a')))$$,
  'Responsável não reatribui tarefa criada por outra pessoa', 'Somente quem criou');
select tests.throws($$select public.set_task_status((select id from v where k = 't3'), 'cancelled', null)$$, 'Responsável não cancela tarefa de outra pessoa', 'Somente quem criou');
select tests.throws($$select public.set_task_status((select id from v where k = 't3'), 'blocked', '')$$, 'Bloqueio exige motivo', 'motivo');
select public.set_task_status((select id from v where k = 't3'), 'done', 'Fotos entregues');
reset role;
select tests.ok((select status = 'done' and completed_at is not null from public.tasks where id = (select id from v where k = 't3')), 'Tarefa concluída');
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('seller_a') and type = 'task_updated' and message like '%concluída%') = 1,
  'Criador notificado da conclusão');

-- Reatribuição pelo criador: novo responsável notificado, anterior avisado e perde acesso
select tests.as_user('seller_a');
select public.update_task((select id from v where k = 't2'), jsonb_build_object('assigned_to', tests.id('admin_c')));
reset role;
select tests.ok((select assigned_to = tests.id('admin_c') from public.tasks where id = (select id from v where k = 't2')), 'Tarefa reatribuída');
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('admin_c') and type = 'task_assigned') = 1, 'Novo responsável notificado');
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('admin_b') and type = 'task_updated' and title like '%transferida') = 1, 'Responsável anterior avisado');
select tests.ok((select count(*) from public.task_events where task_id = (select id from v where k = 't2') and event_type = 'reassigned') = 1, 'Histórico registra a reatribuição');

-- Comentário notifica a outra ponta
select tests.as_user('admin_c');
select public.comment_task((select id from v where k = 't2'), 'Preciso do roteiro aprovado.');
select tests.as_user('seller_b');
select tests.throws($$select public.comment_task((select id from v where k = 't2'), 'intrometido')$$, 'Vendedor que não participa não comenta', 'não encontrada');
reset role;
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('seller_a') and type = 'task_commented' and message = 'Admin C: Preciso do roteiro aprovado.') = 1,
  'Comentário notifica quem criou');
select tests.throws($$delete from public.task_events$$, 'Histórico de tarefas imutável', 'imutável');

-- Lembretes diários: somente service_role; dedupe no mesmo dia
select tests.as_user('admin_a');
select tests.throws($$select public.run_task_reminders()$$, 'Usuário não dispara lembretes', 'permission denied');
reset role;
update public.tasks set due_date = (now() at time zone 'America/Bahia')::date where id = (select id from v where k = 't1');
select tests.as_service();
select public.run_task_reminders();
select public.run_task_reminders();
reset role;
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('seller_a') and type = 'task_due_soon') = 1, 'Lembrete de prazo sem duplicar');

-- Usuário desativado deixa de ver tarefas
select tests.as_user('admin_a');
select public.admin_set_user_status(tests.id('seller_b'), 'inactive', 'Desligamento');
select tests.as_user('seller_b');
select tests.ok((select count(*) from public.tasks) = 0, 'Usuário desativado não vê tarefas');
rollback;
