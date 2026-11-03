-- Papel "Produção": sem acesso comercial/financeiro; pode receber tarefas.
begin;
select tests.fixture();

-- Leituras: nada da área comercial ou financeira.
select tests.as_user('prod_a', 'aal1');
select tests.ok((select count(*) from public.clients) = 0, 'Produção não lê clientes da carteira');
select tests.ok((select count(*) from public.contracts) = 0 and (select count(*) from public.receivables) = 0, 'Produção não lê contratos nem cobranças');
select tests.ok((select count(*) from public.commission_policies) = 0, 'Produção não lê política de comissão');
select tests.ok((select count(*) from public.financial_categories) = 0 and (select count(*) from public.system_settings) = 0, 'Produção não lê categorias financeiras nem configurações');
select tests.ok((select count(*) from public.cash_accounts) = 0 and (select count(*) from public.payables) = 0, 'Produção não lê caixa nem despesas');
select tests.ok((select count(*) from public.profiles) = 1, 'Produção lê só o próprio perfil');
select tests.ok((select count(*) from public.services) >= 1 and (select count(*) from public.organizations) = 1, 'Produção lê catálogo de serviços e a organização');

-- Rotinas comerciais recusadas (antes, "não vendedor" era tratado como admin).
select tests.throws($$select public.create_client(jsonb_build_object('company_name', 'X', 'contact_name', 'Y', 'email', 'x@y.test', 'seller_id', tests.id('prod_a')))$$,
  'Produção não cria cliente', 'Área comercial');
select tests.throws($$select public.set_client_status(tests.id('client_a'), 'archived')$$, 'Produção não altera situação de cliente', 'Área comercial');
select tests.throws($$select public.create_contract(jsonb_build_object('client_id', tests.id('client_a'), 'implementation_amount', '1000.00', 'start_date', current_date))$$,
  'Produção não cria contrato para cliente alheio', 'Área comercial');
select tests.throws($$select public.create_lead_capture_link('Link', 30, null, null)$$, 'Produção não cria link de captação', 'Área comercial');
select tests.throws($$select public.import_clients_batch('[]'::jsonb, 'csv', 'a.csv', repeat('a', 64), null)$$, 'Produção não importa clientes', 'Área comercial');
select tests.throws($$select public.calculate_commission_estimate('direct', 1000)$$, 'Produção não simula comissão', 'Área comercial');
select tests.throws($$select public.request_expense(jsonb_build_object('category_id', tests.id('cat_expense'), 'description', 'Uber', 'amount', '30.00'))$$,
  'Produção não solicita despesa', 'Área comercial');
select tests.throws($$select public.seller_dashboard(current_date - 30, current_date)$$, 'Produção não abre painel comercial', 'Área comercial');
select tests.throws($$select public.create_receivable(jsonb_build_object('client_id', tests.id('client_a'), 'description', 'X', 'amount', '10.00', 'due_date', current_date))$$,
  'Produção não executa rotina administrativa', 'administradores');

-- Tarefas: produção recebe e executa como qualquer colaborador.
select tests.as_user('admin_a');
create temp table v (k text primary key, id uuid); grant all on v to authenticated;
insert into v select 'g', public.save_task_group(null, 'Audiovisual', null, false, true);
insert into v select 't', public.create_task(jsonb_build_object('group_id', (select id from v where k = 'g'), 'title', 'Editar vídeo do cliente', 'assigned_to', tests.id('prod_a')));
select tests.as_user('prod_a', 'aal1');
select tests.ok((select count(*) from public.tasks where id = (select id from v where k = 't')) = 1, 'Produção vê a tarefa atribuída a ela');
select public.set_task_status((select id from v where k = 't'), 'in_progress', null);
select tests.ok((select status::text from public.tasks where id = (select id from v where k = 't')) = 'in_progress', 'Produção atualiza o andamento da tarefa');
select tests.ok(exists (select 1 from public.people_directory() d where d.id = tests.id('prod_a')), 'Produção aparece no diretório de pessoas');

-- Ninguém de produção vira responsável comercial.
select tests.as_user('admin_a');
select tests.throws($$select public.create_client(jsonb_build_object('company_name', 'Nova', 'contact_name', 'Z', 'email', 'z@nova.test', 'seller_id', tests.id('prod_a')))$$,
  'Admin não cria cliente com responsável de produção', 'responsáveis comerciais');
select tests.throws($$select public.transfer_client(tests.id('client_a'), tests.id('prod_a'), 'Teste de transferência')$$,
  'Admin não transfere carteira para produção', 'responsáveis comerciais');
select tests.throws($$select public.create_lead_capture_link('Link', 30, null, tests.id('prod_a'))$$, 'Link de captação não vai para produção', 'responsáveis comerciais');

-- Mudança de papel: vendedor com carteira não vira produção; produção pode virar vendedor.
select tests.throws($$select public.admin_set_user_role(tests.id('seller_a'), 'production', 'Mudou de área')$$,
  'Vendedor com carteira não vira produção sem transferir', 'Transfira a carteira');
select public.admin_set_user_role(tests.id('prod_a'), 'seller', 'Passou para o comercial');
reset role;
select tests.ok((select role::text from public.profiles where id = tests.id('prod_a')) = 'seller', 'Produção pode passar a vendedor (auditado)');
rollback;
