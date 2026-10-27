-- Testes de autorização e RLS (cenários 20.2 e Cenário C).
begin;
select tests.fixture();

-- Vendedor A ---------------------------------------------------------------
select tests.as_user('seller_a');
select tests.ok((select count(*) from public.clients where id = tests.id('client_a')) = 1, 'Vendedor A consulta seu cliente');
select tests.ok((select count(*) from public.clients where id = tests.id('client_b')) = 0, 'Vendedor A NÃO consulta cliente de B (IDOR)');
select tests.ok((select count(*) from public.clients) = 1, 'Vendedor A lista apenas a própria carteira');

update public.clients set company_name = 'Hackeado' where id = tests.id('client_b');
reset role;
select tests.ok((select company_name from public.clients where id = tests.id('client_b')) = 'Empresa B', 'Vendedor A NÃO altera cliente de B (0 linhas)');

select tests.as_user('seller_a');
select tests.throws($$update public.clients set seller_id = tests.id('seller_b') where id = tests.id('client_a')$$,
  'Vendedor A não troca responsável do próprio cliente (sem grant na coluna)', 'permission denied');
select tests.throws($$update public.clients set organization_id = gen_random_uuid() where id = tests.id('client_a')$$,
  'Vendedor não altera organization_id', 'permission denied');
select tests.throws($$insert into public.clients (organization_id, seller_id, original_seller_id, contact_name, company_name) values (tests.id('org'), tests.id('seller_b'), tests.id('seller_b'), 'X', 'Y')$$,
  'Vendedor não insere cliente direto na tabela', 'permission denied');
select tests.throws($$select public.create_client(jsonb_build_object('contact_name', 'Zé', 'company_name', 'Outra', 'seller_id', tests.id('seller_b')))$$,
  'Vendedor não cria cliente para outra carteira', 'outra carteira');
select tests.ok((select public.create_client('{"contact_name":"Carla","company_name":"Nova LTDA","whatsapp":"(71) 99999-0000","email":" Carla@Nova.TEST "}'::jsonb)) is not null,
  'Vendedor cria cliente na própria carteira via rotina');
select tests.ok((select whatsapp = '+5571999990000' and email = 'carla@nova.test' from public.clients where company_name = 'Nova LTDA'),
  'Contatos normalizados (E.164 e e-mail minúsculo)');

select tests.ok((select count(*) from public.cash_accounts) = 0, 'Vendedor A NÃO consulta contas (caixa geral)');
select tests.ok((select count(*) from public.cash_movements) = 0, 'Vendedor A NÃO consulta movimentos de caixa');
select tests.throws($$select * from public.get_cash_balances()$$, 'Vendedor não consulta saldos via rotina', 'administradores');
select tests.throws($$select public.admin_financial_summary(current_date - 30, current_date)$$, 'Vendedor não consulta resumo financeiro', 'administradores');
select tests.throws($$select public.register_payable('direct_cost', jsonb_build_object('category_id', tests.id('cat_cost'), 'description', 'Freela', 'amount', '100.00'))$$,
  'Vendedor A NÃO cadastra custo', 'administradores');
select tests.throws($$update public.profiles set role = 'admin' where id = tests.id('seller_a')$$, 'Vendedor A NÃO altera o próprio papel', 'permission denied');
select tests.throws($$select public.admin_set_user_role(tests.id('seller_a'), 'admin', 'tentativa')$$, 'Vendedor A NÃO usa rotina de papel', 'administradores');
update public.commission_policies set direct_rate_bps = 10000 where id = tests.id('policy');
reset role;
select tests.ok((select direct_rate_bps from public.commission_policies where id = tests.id('policy')) = 1250,
  'Vendedor A NÃO altera percentual de comissão (0 linhas afetadas por RLS)');
select tests.as_user('seller_a');
select tests.ok((select count(*) from public.audit_logs) = 0, 'Vendedor não lê auditoria');
select tests.ok((select count(*) from public.profiles) = 1, 'Vendedor vê apenas o próprio perfil');
update public.profiles set full_name = 'Seller A Atualizado' where id = tests.id('seller_a');
select tests.ok((select full_name from public.profiles where id = tests.id('seller_a')) = 'Seller A Atualizado', 'Vendedor atualiza o próprio nome');

-- Despesa: vendedor solicita, não aprova
select tests.ok(public.request_expense(jsonb_build_object('category_id', tests.id('cat_expense'), 'description', 'Uber reunião', 'amount', '45.90')) is not null,
  'Vendedor solicita despesa');
select tests.throws($$select public.approve_expense((select id from public.payables limit 1))$$, 'Vendedor A NÃO aprova despesa', 'administradores');
select tests.throws($$select public.request_expense(jsonb_build_object('category_id', tests.id('cat_cost'), 'description', 'x', 'amount', '1.00'))$$,
  'Vendedor não registra custo como despesa (categoria de custo)', 'Categoria');

-- Admin --------------------------------------------------------------------
select tests.as_user('admin_a');
select tests.ok((select count(*) from public.clients where organization_id = tests.id('org')) = 3, 'Administrador consulta todos os clientes');
select tests.ok((select count(*) from public.cash_accounts) = 1, 'Administrador consulta contas');
select tests.throws($$update public.profiles set role = 'seller' where id = tests.id('admin_a')$$, 'Admin não altera o próprio papel por tabela', 'permission denied');
select tests.throws($$select public.admin_set_user_role(tests.id('admin_a'), 'seller', 'auto rebaixamento')$$, 'Admin não altera o próprio papel', 'próprio');

-- Usuário desativado -------------------------------------------------------
select tests.as_user('seller_off');
select tests.ok((select count(*) from public.clients) = 0, 'Usuário desativado não lê clientes');
select tests.ok((select count(*) from public.services) = 0, 'Usuário desativado não lê catálogo');
select tests.throws($$select public.create_client('{"contact_name":"X Y","company_name":"Z"}'::jsonb)$$, 'Usuário desativado não cria cliente', 'inativo');

-- Desativar vendedor com sessão ativa: perde acesso imediatamente
select tests.as_user('admin_a');
select public.admin_set_user_status(tests.id('seller_b'), 'inactive', 'Desligamento');
select tests.as_user('seller_b');
select tests.ok((select count(*) from public.clients) = 0, 'Sessão antiga de vendedor desativado não acessa dados');

-- anon ---------------------------------------------------------------------
select tests.as_anon();
select tests.throws($$select count(*) from public.clients$$, 'anon sem acesso a clients', 'permission denied');
select tests.throws($$select public.create_client('{}'::jsonb)$$, 'anon sem EXECUTE em rotinas', 'permission denied');

-- Transferência de carteira (admin), histórico e comissões preservadas
reset role;
update public.profiles set status = 'active' where id = tests.id('seller_b');
select tests.as_user('admin_b');
select public.transfer_client(tests.id('client_a'), tests.id('seller_b'), 'Reorganização de carteira');
reset role;
select tests.ok((select seller_id = tests.id('seller_b') and original_seller_id = tests.id('seller_a') from public.clients where id = tests.id('client_a')),
  'Transferência preserva vendedor original');
select tests.ok((select count(*) from public.client_transfers where client_id = tests.id('client_a')) = 1, 'Transferência registrada');
select tests.ok((select count(*) from public.audit_logs where action = 'client_transferred') = 1, 'Transferência auditada');
select tests.throws($$delete from public.client_transfers$$, 'Histórico de transferência imutável', 'imutável');
rollback;
