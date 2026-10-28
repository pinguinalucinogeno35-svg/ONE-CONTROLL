-- Notificações push: inscrições por dispositivo e reserva atômica para envio.
begin;
select tests.fixture();
create temp table v (k text primary key, id uuid); grant all on v to authenticated, service_role;

select tests.as_user('seller_a');
select public.save_push_subscription('https://push.example.test/a1', repeat('A', 87), repeat('b', 22), 'Chrome Android');
select public.save_push_subscription('https://push.example.test/a1', repeat('C', 87), repeat('d', 22), 'Chrome Android');
select tests.throws($$select public.save_push_subscription('http://inseguro.test/x', repeat('A', 87), repeat('b', 22), null)$$, 'Endpoint sem HTTPS rejeitado', 'inválida');
select tests.throws($$insert into public.push_subscriptions (organization_id, user_id, endpoint, p256dh, auth) values (tests.id('org'), tests.id('seller_b'), 'https://x.test/1', repeat('A', 87), repeat('b', 22))$$,
  'Sem INSERT direto (não registra dispositivo de outra pessoa)', 'permission denied');
select tests.ok((select count(*) from public.push_subscriptions) = 1, 'Mesmo dispositivo não duplica (atualiza chaves)');
select tests.throws($$select endpoint from public.push_subscriptions$$, 'Endpoint e chaves não são legíveis pela API', 'permission denied');
select tests.as_user('seller_b');
select tests.ok((select count(*) from public.push_subscriptions) = 0, 'Vendedor B não vê dispositivos de A');
select public.save_push_subscription('https://push.example.test/b1', repeat('A', 87), repeat('b', 22), null);
select tests.throws($$select public.claim_push_batch(10)$$, 'Usuário não reserva envios', 'permission denied');

-- Notificações: tarefa para A (2 pendentes contando a de B)
select tests.as_user('admin_a');
insert into v select 'g', public.save_task_group(null, 'Vendas', null, true, true);
select public.create_task(jsonb_build_object('group_id', (select id from v where k = 'g'), 'title', 'Ligar para o cliente', 'assigned_to', tests.id('seller_a')));
select public.create_task(jsonb_build_object('group_id', (select id from v where k = 'g'), 'title', 'Enviar proposta', 'assigned_to', tests.id('seller_b')));
reset role;
update public.profiles set status = 'inactive' where id = tests.id('seller_b');

select tests.as_service();
create temp table batch as select * from public.claim_push_batch(100);
select tests.ok((select count(*) from batch) = 1, 'Uma entrega: só o dispositivo do destinatário ativo');
select tests.ok((select bool_and(endpoint = 'https://push.example.test/a1' and title like 'Seller, você tem uma nova tarefa') from batch), 'Entrega vai ao dispositivo correto com o texto personalizado');
select tests.ok((select count(*) from public.claim_push_batch(100)) = 0, 'Segunda reserva não reenvia (sem duplicidade)');
select public.report_push_result((select subscription_id from batch limit 1), 201);
reset role;
select tests.ok((select last_used_at is not null from public.push_subscriptions where endpoint = 'https://push.example.test/a1'), 'Sucesso registrado');
select tests.as_service();
select public.report_push_result((select subscription_id from batch limit 1), 410);
reset role;
select tests.ok((select count(*) from public.push_subscriptions where endpoint = 'https://push.example.test/a1') = 0, 'Inscrição expirada (410) removida');

select tests.as_user('seller_a');
select public.save_push_subscription('https://push.example.test/a2', repeat('A', 87), repeat('b', 22), null);
select public.delete_push_subscription('https://push.example.test/a2');
reset role;
select tests.ok((select count(*) from public.push_subscriptions where endpoint = 'https://push.example.test/a2') = 0, 'Usuário desativa push do próprio dispositivo');
rollback;
