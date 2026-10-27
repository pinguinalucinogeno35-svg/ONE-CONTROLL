-- Financeiro: recebimentos, despesas, custos, caixa e auditoria (Cenários D, E, G, H, J).
begin;
select tests.fixture();
create temp table v (k text primary key, id uuid); grant all on v to authenticated;

select tests.as_user('admin_a');
insert into v select 'recv', public.create_receivable(jsonb_build_object('client_id', tests.id('client_a'), 'description', 'Serviço extra',
  'amount', '1000.00', 'due_date', current_date + 10, 'type', 'additional_service'));

-- Cenário G: deve 1000, paga 400
insert into v select 'r1', public.confirm_receipt((select id from v where k = 'recv'), tests.id('account'), 400.00, 'pix', now(), 'pix-a', 'idem-g-0001');
reset role;
select tests.ok((select status from public.receivables where id = (select id from v where k = 'recv')) = 'partially_paid', 'Cenário G: cobrança parcialmente paga, não quitada');
select tests.ok((select amount - (select coalesce(sum(amount),0) from public.receipts where receivable_id = r.id and reversed_at is null) from public.receivables r
                  where id = (select id from v where k = 'recv')) = 600.00, 'Cenário G: saldo pendente de R$ 600');
select tests.ok((select count(*) from public.cash_movements where source_type = 'receipt' and amount = 400) = 1, 'Recebimento gera um crédito de caixa na mesma transação');

select tests.as_user('admin_a');
select tests.ok(public.confirm_receipt((select id from v where k = 'recv'), tests.id('account'), 400.00, 'pix', now(), 'pix-a', 'idem-g-0001') = (select id from v where k = 'r1'),
  'Confirmação duplicada (mesma chave) é idempotente');
select tests.throws($$select public.confirm_receipt((select id from v where k = 'recv'), tests.id('account'), 600.01, 'pix', now(), null, 'idem-g-0002')$$,
  'Recebimento acima do saldo rejeitado', 'excede');
select tests.throws($$select public.confirm_receipt((select id from v where k = 'recv'), tests.id('account'), 10.00, 'pix', now(), null, 'idem-g-0001')$$,
  'Chave de idempotência reutilizada com outro valor rejeitada', 'idempotência');
select tests.throws($$select public.confirm_receipt((select id from v where k = 'recv'), tests.id('account'), 10.555, 'pix', now(), null, 'idem-g-0003')$$,
  'Valor com 3 casas decimais rejeitado', 'inválido');
reset role;
select tests.ok((select count(*) from public.cash_movements where source_type = 'receipt') = 1, 'Nenhum crédito duplicado após tentativas');

-- Vendedor não confirma recebimento
select tests.as_user('seller_a');
select tests.throws($$select public.confirm_receipt((select id from v where k = 'recv'), tests.id('account'), 1.00, 'pix', now(), null, 'idem-seller-01')$$,
  'Vendedor não confirma recebimento', 'administradores');
select tests.ok((select count(*) from public.receivables where id = (select id from v where k = 'recv')) = 1, 'Vendedor vê cobrança do próprio cliente');
select tests.ok((select count(*) from public.receipts) = 0, 'Vendedor não vê recebimentos (conta/caixa)');

-- Cenário J: estorno preserva histórico e registra ajuste
select tests.as_user('admin_b');
select public.reverse_receipt((select id from v where k = 'r1'), 'Valor creditado na conta errada');
select tests.throws($$select public.reverse_receipt((select id from v where k = 'r1'), 'de novo')$$, 'Estorno duplicado rejeitado', 'já estornado');
reset role;
select tests.ok((select reversed_at is not null and amount = 400 from public.receipts where id = (select id from v where k = 'r1')), 'Recebimento original preservado (marcado como estornado)');
select tests.ok((select count(*) from public.financial_adjustments where source_id = (select id from v where k = 'r1')) = 1, 'Ajuste financeiro registrado');
select tests.ok((select count(*) from public.cash_movements where source_type = 'receipt_reversal') = 1, 'Movimento compensatório de caixa');
select tests.ok((select status from public.receivables where id = (select id from v where k = 'recv')) = 'open', 'Cobrança volta a aberta após estorno');
select tests.ok((select count(*) from public.audit_logs where action in ('receipt_confirmed', 'receipt_reversed')) = 2, 'Auditoria do recebimento e do estorno');
select tests.throws($$delete from public.cash_movements$$, 'Movimentos de caixa não podem ser excluídos', 'imutável');
select tests.throws($$update public.receipts set amount = 1 where id = (select id from v where k = 'r1')$$, 'Recebimento confirmado imutável', 'imutável');
select tests.throws($$delete from public.audit_logs$$, 'Auditoria imutável', 'imutável');

-- Cancelamento de cobrança
select tests.as_user('admin_a');
select public.cancel_receivable((select id from v where k = 'recv'), 'Serviço não prestado');
select tests.throws($$select public.confirm_receipt((select id from v where k = 'recv'), tests.id('account'), 1.00, 'pix', now(), null, 'idem-cancel-01')$$,
  'Não recebe cobrança cancelada', 'cancelada');

-- Cenário D: despesa do vendedor → aprovação → pagamento; caixa só muda no pagamento
select tests.as_user('seller_a');
insert into v select 'exp', public.request_expense(jsonb_build_object('category_id', tests.id('cat_expense'), 'description', 'Táxi cliente', 'amount', '80.00', 'due_date', current_date));
select tests.as_user('admin_a');
select tests.throws($$select public.confirm_outgoing_payment((select id from v where k = 'exp'), tests.id('account'), 80.00, 'pix', now(), 'idem-exp-0001')$$,
  'Despesa não aprovada não pode ser paga', 'aprovados');
create temp table b1 as select balance from public.get_cash_balances() where cash_account_id = tests.id('account');
select public.approve_expense((select id from v where k = 'exp'));
select tests.ok((select balance from public.get_cash_balances() where cash_account_id = tests.id('account')) = (select balance from b1),
  'Cenário D: aprovação não altera o caixa');
select public.confirm_outgoing_payment((select id from v where k = 'exp'), tests.id('account'), 30.00, 'pix', now(), 'idem-exp-0002');
select tests.ok((select status from public.payables where id = (select id from v where k = 'exp')) = 'partially_paid', 'Pagamento parcial de despesa');
select tests.throws($$select public.confirm_outgoing_payment((select id from v where k = 'exp'), tests.id('account'), 50.01, 'pix', now(), 'idem-exp-0003')$$,
  'Pagamento acima do saldo rejeitado', 'excede');
select public.confirm_outgoing_payment((select id from v where k = 'exp'), tests.id('account'), 50.00, 'pix', now(), 'idem-exp-0004');
select tests.ok((select balance from public.get_cash_balances() where cash_account_id = tests.id('account')) = (select balance from b1) - 80,
  'Cenário D: caixa reduz somente após confirmação do pagamento');
select tests.ok((select status from public.payables where id = (select id from v where k = 'exp')) = 'paid', 'Despesa quitada');

-- Despesa rejeitada
select tests.as_user('seller_a');
insert into v select 'exp2', public.request_expense(jsonb_build_object('category_id', tests.id('cat_expense'), 'description', 'Almoço', 'amount', '120.00'));
select tests.as_user('admin_b');
select public.reject_expense((select id from v where k = 'exp2'), 'Fora da política');
select tests.throws($$select public.confirm_outgoing_payment((select id from v where k = 'exp2'), tests.id('account'), 1.00, 'pix', now(), 'idem-exp-0005')$$,
  'Despesa rejeitada não é paga', 'aprovados');

-- Admin não aprova a própria solicitação
select tests.as_user('admin_a');
insert into v select 'exp3', public.request_expense(jsonb_build_object('category_id', tests.id('cat_expense'), 'description', 'Internet', 'amount', '99.90'));
select tests.throws($$select public.approve_expense((select id from v where k = 'exp3'))$$, 'Solicitante não aprova a própria despesa', 'própria');

-- Cenário E: custo direto por admin associado a projeto; vendedor não vê nem edita
insert into public.projects (organization_id, client_id, name, created_by) values (tests.id('org'), tests.id('client_a'), 'Site Empresa A', tests.id('admin_a'));
insert into v select 'proj', id from public.projects where name = 'Site Empresa A';
insert into v select 'cost', public.register_payable('direct_cost', jsonb_build_object('category_id', tests.id('cat_cost'), 'description', 'Freelancer front-end',
  'amount', '700.00', 'project_id', (select id from v where k = 'proj'), 'due_date', current_date + 5));
select tests.ok((select (public.admin_financial_summary(date_trunc('month', current_date)::date, current_date + 30) ->> 'custos_diretos')::numeric) = 700,
  'Cenário E: custo aparece no indicador de custos diretos');
select tests.as_user('seller_a');
select tests.ok((select count(*) from public.payables where kind = 'direct_cost') = 0, 'Cenário E: vendedor não vê custos');
select tests.ok((select count(*) from public.projects where id = (select id from v where k = 'proj')) = 1, 'Vendedor vê projeto do próprio cliente');
select tests.throws($$update public.payables set amount = 1 where id = (select id from v where k = 'cost')$$, 'Vendedor não edita custo', 'permission denied');

-- Cenário H: contratado/previsto não entra no saldo
select tests.as_user('admin_a');
select tests.ok((public.admin_financial_summary(current_date - 30, current_date) ->> 'saldo_de_caixa')::numeric
                 = (select sum(balance) from public.get_cash_balances()), 'Cenário H: saldo de caixa = somente movimentos confirmados');
select tests.ok((select count(*) = 13 from public.cash_flow_projection(13, null)), 'Fluxo de caixa de 13 semanas');
select tests.ok((select bool_and(projected_closing = opening_balance + confirmed_in - confirmed_out + pending_in - pending_out) from public.cash_flow_projection(13, null)),
  'Projeção consistente (abertura + realizado + pendente concreto)');

-- Transferência entre contas não altera o caixa consolidado
reset role;
insert into public.cash_accounts (organization_id, name, opening_balance, opening_date) values (tests.id('org'), 'Caixa físico', 0, current_date);
select tests.as_user('admin_a');
create temp table b3 as select sum(balance) s from public.get_cash_balances();
select public.transfer_between_accounts(tests.id('account'), (select id from public.cash_accounts where name = 'Caixa físico'), 100.00, now(), 'Sangria');
select tests.ok((select sum(balance) from public.get_cash_balances()) = (select s from b3), 'Transferência não altera o caixa consolidado');
rollback;
