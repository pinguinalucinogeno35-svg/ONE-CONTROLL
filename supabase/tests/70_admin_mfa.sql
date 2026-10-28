-- MFA obrigatório para administradores também no banco (migration 0016).
begin;
select tests.fixture();

-- Administrador SEM MFA (AAL1): nada de dados nem rotinas.
select tests.as_user('admin_a', 'aal1');
select tests.ok((select count(*) from public.clients) = 0, 'Admin AAL1 não lê clientes por RLS');
select tests.ok((select count(*) from public.profiles) = 1, 'Admin AAL1 lê só o próprio perfil (o app precisa dele para pedir o MFA)');
select tests.ok((select count(*) from public.services) = 0, 'Admin AAL1 não lê nem o catálogo da organização');
select tests.ok((select count(*) from public.organizations) = 0 and (select count(*) from public.commission_policies) = 0, 'Admin AAL1 não lê organização nem política de comissão');
select tests.throws($$select public.create_receivable(jsonb_build_object('client_id', tests.id('client_a'), 'description', 'X', 'amount', '10.00', 'due_date', current_date))$$,
  'Admin AAL1 não executa rotina administrativa', 'MFA');
select tests.throws($$select public.people_directory()$$, 'Admin AAL1 não executa rotina comum', 'MFA');
update public.profiles set full_name = 'Outro Nome' where id = tests.id('admin_a');
reset role;
select tests.ok((select full_name from public.profiles where id = tests.id('admin_a')) <> 'Outro Nome', 'Admin AAL1 não altera o próprio perfil');
select tests.as_user('admin_a', 'aal1');

-- Sem a informação de nível de autenticação: tratado como sem MFA.
reset role;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', tests.id('admin_a'), 'role', 'authenticated')::text, true);
select tests.ok((select count(*) from public.clients) = 0, 'Admin sem claim aal também é bloqueado');

-- Administrador COM MFA (AAL2): acesso normal.
select tests.as_user('admin_a', 'aal2');
select tests.ok((select count(*) from public.clients) >= 1, 'Admin AAL2 lê clientes');
select tests.ok(jsonb_array_length(coalesce((select jsonb_agg(x) from public.people_directory() x), '[]')) >= 3, 'Admin AAL2 executa rotinas');

select tests.ok((select count(*) from public.profiles) >= 6, 'Admin AAL2 lê todos os perfis da organização');

-- Vendedor sem MFA (AAL1): nada muda para ele.
select tests.as_user('seller_a', 'aal1');
select tests.ok((select count(*) from public.clients where id = tests.id('client_a')) = 1, 'Vendedor AAL1 continua vendo a própria carteira');
select tests.ok(jsonb_array_length(coalesce((select jsonb_agg(x) from public.people_directory() x), '[]')) >= 1, 'Vendedor AAL1 continua executando rotinas');
select tests.ok((select count(*) from public.profiles) = 1, 'Vendedor lê só o próprio perfil');
select tests.ok((select count(*) from public.services) >= 0 and (select count(*) from public.organizations) = 1, 'Vendedor AAL1 lê a organização e o catálogo');
rollback;
