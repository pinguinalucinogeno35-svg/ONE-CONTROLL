-- Kit do cliente (migration 0021): leitura por trabalho atribuído, edição comercial.
begin;
select tests.fixture();
create temp table v (k text primary key, id uuid); grant all on v to authenticated, service_role;

-- Vendedor responsável monta o kit; vendedor de outra carteira não.
select tests.as_user('seller_a', 'aal1');
select public.save_client_kit(tests.id('client_a'), jsonb_build_object('activity', 'Clínica odontológica', 'positioning', 'Atendimento humanizado',
  'colors', jsonb_build_array(jsonb_build_object('name', 'Azul', 'hex', '#0066FF')), 'fonts', 'Inter', 'restrictions', 'Não usar a palavra "barato"'));
insert into v select 'logo', public.add_client_kit_asset(tests.id('client_a'), jsonb_build_object('kind', 'logo', 'label', 'Logo oficial', 'url', 'https://drive.example.test/logo'));
select tests.throws($$select public.save_client_kit(tests.id('client_a'), jsonb_build_object('colors', jsonb_build_array(jsonb_build_object('hex', 'azul'))))$$, 'Cor fora do formato é recusada', '#RRGGBB');
select tests.throws($$select public.add_client_kit_asset(tests.id('client_a'), jsonb_build_object('kind', 'logo', 'label', 'X', 'url', 'http://inseguro'))$$, 'Material exige https', 'https');
select tests.as_user('seller_b', 'aal1');
select tests.throws($$select public.save_client_kit(tests.id('client_a'), jsonb_build_object('activity', 'X'))$$, 'Vendedor de outra carteira não edita', 'não encontrado');
select tests.ok((select count(*) from public.client_kits) = 0 and (select count(*) from public.client_kit_assets) = 0, 'Vendedor de outra carteira não lê o kit');

-- Produção: sem trabalho no cliente, não vê o kit (T06); com trabalho, vê (T05), mas não edita.
select tests.as_user('prod_a', 'aal1');
select tests.ok((select count(*) from public.client_kits) = 0, 'Produção sem trabalho no cliente não vê o kit');
select tests.as_user('admin_a');
insert into v select 'w', public.create_work(jsonb_build_object('title', 'Post de novembro', 'category', 'post', 'client_id', tests.id('client_a'),
  'assignees', jsonb_build_array(tests.id('prod_a'))));
select tests.as_user('prod_a', 'aal1');
select tests.ok((select activity from public.client_kits where client_id = tests.id('client_a')) = 'Clínica odontológica', 'Produção com trabalho no cliente vê o kit');
select tests.ok((select count(*) from public.client_kit_assets where removed_at is null) = 1, 'Produção vê os materiais autorizados');
select tests.ok((select count(*) from public.client_kits where client_id = tests.id('client_b')) = 0, 'Kit de outro cliente continua invisível');
select tests.throws($$select public.save_client_kit(tests.id('client_a'), jsonb_build_object('activity', 'Alterado'))$$, 'Produção não edita o kit', 'Área comercial');
select tests.throws($$select public.remove_client_kit_asset((select id from v where k = 'logo'))$$, 'Produção não remove material', 'Área comercial');
select tests.ok((select count(*) from public.clients) = 0, 'Kit não abre o cadastro comercial do cliente');

-- Ao sair do trabalho, perde o acesso ao kit.
select tests.as_user('admin_a');
select public.set_work_assignees((select id from v where k = 'w'), array[]::uuid[]);
select tests.as_user('prod_a', 'aal1');
select tests.ok((select count(*) from public.client_kits) = 0, 'Sem trabalho visível, o kit some');

-- Administração edita; remoção preserva histórico.
select tests.as_user('admin_a');
select public.remove_client_kit_asset((select id from v where k = 'logo'));
reset role;
select tests.ok((select removed_at is not null and removed_by = tests.id('admin_a') from public.client_kit_assets where id = (select id from v where k = 'logo')),
  'Remoção registra quem e quando (histórico preservado)');
select tests.ok((select count(*) from public.audit_logs where action = 'client_kit_saved') = 1, 'Edição do kit auditada');
rollback;
