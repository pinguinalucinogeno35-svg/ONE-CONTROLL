-- Contratos e comissões (20.4, Cenários B e I).
begin;
select tests.fixture();
select tests.as_user('seller_a');

-- Cenário B: simulação 12,5% / 20% / 25% sobre R$ 2.000
select tests.ok((public.calculate_commission_estimate('direct', 2000) ->> 'commission_amount')::numeric = 250.00, 'Direta: 12,5% de 2000 = 250,00');
select tests.ok((public.calculate_commission_estimate('referral', 2000) ->> 'commission_amount')::numeric = 400.00, 'Indicação: 20% de 2000 = 400,00');
select tests.ok((public.calculate_commission_estimate('second_level_referral', 2000) ->> 'commission_amount')::numeric = 500.00, 'Indicação da indicação: 25% de 2000 = 500,00');
select tests.ok((public.calculate_commission_estimate('direct', 0) ->> 'commission_amount')::numeric = 0, 'Base zero → comissão zero');
select tests.ok((public.calculate_commission_estimate('direct', 1234.57) ->> 'commission_amount')::numeric = 154.32, 'Base com centavos: 12,5% de 1234,57 = 154,32 (arredondado)');
select tests.ok((public.calculate_commission_estimate('direct', 0.04) ->> 'commission_amount')::numeric = 0.01, 'Arredondamento meio-para-cima: 0,005 → 0,01');
select tests.ok((public.calculate_commission_estimate('direct', 2000) ->> 'provisional')::boolean, 'Sem política ativa a simulação é provisória');
select tests.throws($$select public.calculate_commission_estimate('direct', 10.001)$$, 'Base com mais de 2 casas rejeitada', 'Base inválida');
select tests.throws($$select public.calculate_commission_estimate('direct', -1)$$, 'Base negativa rejeitada', 'Base inválida');

-- Cenário I: payload adulterado com comissão de 100% é ignorado
create temp table t_k (id uuid);
grant all on t_k to authenticated;
insert into t_k select public.create_contract(jsonb_build_object(
  'client_id', tests.id('client_a'), 'implementation_amount', '2000.00', 'monthly_amount', '500.00',
  'start_date', current_date, 'recurring_start_date', current_date, 'billing_day', 31, 'sale_origin', 'direct',
  'commission_rate_bps', 10000, 'commission_amount', '2000.00', 'seller_id', tests.id('seller_b'),
  'services', jsonb_build_array(jsonb_build_object('service_id', tests.id('service_lp'), 'quantity', 1, 'unit_amount', '2000.00'))));
select tests.ok((select commission_rate_bps = 1250 and seller_id = tests.id('seller_a') from public.contracts where id = (select id from t_k)),
  'Cenário I: taxa/vendedor adulterados ignorados (1250 bps, vendedor autenticado)');
select tests.throws($$select public.create_contract(jsonb_build_object('client_id', tests.id('client_b'), 'implementation_amount', '10.00', 'start_date', current_date))$$,
  'Vendedor não cria contrato para cliente de outra carteira', 'não encontrado');
select tests.throws($$select public.create_contract(jsonb_build_object('client_id', tests.id('client_a'), 'implementation_amount', '-10.00', 'start_date', current_date))$$,
  'Valor negativo rejeitado', 'inválido');
select tests.throws($$select public.create_contract(jsonb_build_object('client_id', tests.id('client_a'), 'implementation_amount', '10.00', 'start_date', current_date, 'delivery_due_date', current_date - 5))$$,
  'Entrega antes do início exige justificativa administrativa', 'justificativa');
select tests.throws($$select public.create_contract(jsonb_build_object('client_id', tests.id('client_a'), 'monthly_amount', '10.00', 'start_date', current_date))$$,
  'Mensalidade sem dia de cobrança rejeitada', 'Mensalidade');

-- Alteração de origem antes da aprovação recalcula a taxa
select public.update_contract_draft((select id from t_k), jsonb_build_object(
  'implementation_amount', '2000.00', 'monthly_amount', '500.00', 'start_date', current_date,
  'recurring_start_date', current_date, 'billing_day', 31, 'sale_origin', 'referral',
  'referral', jsonb_build_object('external_referrer_name', 'Parceiro X')));
select tests.ok((select commission_rate_bps = 2000 and sale_origin = 'referral' and version = 2 from public.contracts where id = (select id from t_k)),
  'Mudança de origem antes da aprovação: taxa 20% e nova versão');
select public.submit_contract((select id from t_k));
select tests.throws($$select public.approve_contract((select id from t_k))$$, 'Vendedor não aprova contrato', 'administradores');

-- Aprovação administrativa
select tests.as_user('admin_a');
select public.approve_contract((select id from t_k));
reset role;
select tests.ok((select status = 'approved' and approved_by = tests.id('admin_a') from public.contracts where id = (select id from t_k)), 'Contrato aprovado');
select tests.ok((select count(*) from public.receivables where contract_id = (select id from t_k) and type = 'implementation' and amount = 2000) = 1,
  'Cobrança de implementação gerada');
select tests.ok((select count(*) from public.billing_schedules where contract_id = (select id from t_k) and amount = 500) = 1, 'Agenda de mensalidade criada');
select tests.ok((select count(*) from public.contract_versions where contract_id = (select id from t_k)) = 3, 'Versões imutáveis registradas');
select tests.throws($$update public.contract_versions set change_reason = 'x'$$, 'contract_versions imutável', 'imutável');

-- Vendedor não edita contrato aprovado
select tests.as_user('seller_a');
select tests.throws($$select public.update_contract_draft((select id from t_k), jsonb_build_object('implementation_amount', '1.00', 'start_date', current_date))$$,
  'Contrato aprovado não é editável pelo vendedor', 'aditivo');

-- Sem política ATIVA: recebimento não gera comissão a pagar
select tests.as_user('admin_a');
create temp table t_r (id uuid); grant all on t_r to authenticated;
insert into t_r select public.confirm_receipt((select id from public.receivables where contract_id = (select id from t_k) and type = 'implementation'),
  tests.id('account'), 2000.00, 'pix', now(), 'PIX-1', 'idem-receipt-0001');
reset role;
select tests.ok((select count(*) from public.commission_entitlements where contract_id = (select id from t_k)) = 0,
  'Sem política ativa nenhuma comissão a pagar é gerada');
select tests.ok((select status from public.receivables where contract_id = (select id from t_k) and type = 'implementation') = 'paid', 'Implementação quitada');

-- Ativação de política (base: implementação + 1ª mensalidade; no recebimento)
select tests.as_user('seller_a');
select tests.throws($$select public.activate_commission_policy(tests.id('policy'))$$, 'Vendedor não ativa política', 'administradores');
select tests.as_user('admin_a');
select tests.throws($$select public.activate_commission_policy(tests.id('policy'))$$, 'Política sem base não pode ser ativada', 'base de cálculo');
update public.commission_policies set base_rule = 'implementation_plus_first_month', trigger_rule = 'on_receipt' where id = tests.id('policy');
select public.activate_commission_policy(tests.id('policy'));
reset role;
select tests.throws($$update public.commission_policies set direct_rate_bps = 1 where id = tests.id('policy')$$, 'Política ativa é imutável', 'imutável');

-- Mensalidades: geração idempotente com dia 31 em meses curtos
select tests.as_user('admin_a');
select tests.ok(public.generate_due_receivables(current_date + 95) >= 3, 'Mensalidades geradas');
select tests.ok(public.generate_due_receivables(current_date + 95) = 0, 'Segunda execução não duplica cobranças');
reset role;
select tests.ok((select bool_and(extract(day from due_date) = extract(day from (date_trunc('month', due_date) + interval '1 month - 1 day')))
                  from public.receivables where contract_id = (select id from t_k) and type = 'monthly_fee'),
  'Dia 31 vira último dia do mês em meses curtos');
select tests.ok((select count(*) = count(distinct competence_month) from public.receivables where contract_id = (select id from t_k) and type = 'monthly_fee'),
  'Uma cobrança por competência');

-- Recebimento parcial da 1ª mensalidade gera comissão sobre o valor recebido
select tests.as_user('admin_a');
create temp table t_m (id uuid); grant all on t_m to authenticated;
insert into t_m select id from public.receivables where contract_id = (select id from t_k) and type = 'monthly_fee' order by competence_month limit 1;
select public.confirm_receipt((select id from t_m), tests.id('account'), 200.00, 'pix', now(), null, 'idem-receipt-0002');
reset role;
select tests.ok((select count(*) = 1 and sum(base_amount) = 200 and sum(commission_amount) = 40.00 and bool_and(rate_bps = 2000) and bool_and(status = 'awaiting_approval')
                  from public.commission_entitlements where contract_id = (select id from t_k)),
  'Pagamento parcial do cliente: comissão de 20% sobre R$ 200 = R$ 40 (aguardando aprovação)');
select tests.ok((select status from public.receivables where id = (select id from t_m)) = 'partially_paid', 'Mensalidade parcialmente paga');

-- Recebimento de mensalidade fora da base (2ª) não gera comissão
select tests.as_user('admin_a');
select public.confirm_receipt((select id from public.receivables where contract_id = (select id from t_k) and type = 'monthly_fee' order by competence_month offset 1 limit 1),
  tests.id('account'), 500.00, 'pix', now(), null, 'idem-receipt-0003');
reset role;
select tests.ok((select count(*) from public.commission_entitlements where contract_id = (select id from t_k)) = 1, '2ª mensalidade fora da base configurada');

-- Política alterada depois da venda não altera taxa congelada
select tests.ok((select commission_rate_bps from public.contracts where id = (select id from t_k)) = 2000, 'Taxa histórica preservada no contrato');

-- Aprovação e pagamento parcial de comissão
select tests.as_user('seller_a');
select tests.throws($$select public.approve_commissions(array(select id from public.commission_entitlements))$$, 'Vendedor não aprova a própria comissão', 'administradores');
select tests.as_user('admin_b');
select tests.ok(public.approve_commissions(array(select id from public.commission_entitlements where contract_id = (select id from t_k))) = 1, 'Admin aprova comissão');
select public.pay_commissions(tests.id('seller_a'), tests.id('account'),
  jsonb_build_array(jsonb_build_object('entitlement_id', (select id from public.commission_entitlements where contract_id = (select id from t_k)), 'amount', '15.00')),
  now(), 'idem-payout-0001');
select tests.ok((select status from public.commission_entitlements where contract_id = (select id from t_k)) = 'partially_paid', 'Comissão parcialmente paga');
select tests.ok(public.pay_commissions(tests.id('seller_a'), tests.id('account'),
  jsonb_build_array(jsonb_build_object('entitlement_id', (select id from public.commission_entitlements where contract_id = (select id from t_k)), 'amount', '15.00')),
  now(), 'idem-payout-0001') = (select id from public.commission_payouts where idempotency_key = 'idem-payout-0001'),
  'Pagamento duplicado (mesma chave) é idempotente');
select tests.throws($$select public.pay_commissions(tests.id('seller_a'), tests.id('account'),
  jsonb_build_array(jsonb_build_object('entitlement_id', (select id from public.commission_entitlements limit 1), 'amount', '25.01')), now(), 'idem-payout-0002')$$,
  'Pagamento acima do saldo da comissão rejeitado', 'excede');
select public.pay_commissions(tests.id('seller_a'), tests.id('account'),
  jsonb_build_array(jsonb_build_object('entitlement_id', (select id from public.commission_entitlements limit 1), 'amount', '25.00')), now(), 'idem-payout-0003');
reset role;
select tests.ok((select status from public.commission_entitlements where contract_id = (select id from t_k)) = 'paid', 'Comissão quitada em dois pagamentos');
select tests.ok((select count(*) from public.cash_movements where source_type = 'commission_payout') = 2, 'Uma saída de caixa por pagamento (sem duplicidade)');

-- Constraint de coerência: comissão adulterada no banco é rejeitada
select tests.throws($$update public.commission_entitlements set commission_amount = 999 where contract_id = (select id from t_k)$$,
  'Valor de comissão incoerente com base×taxa é rejeitado', 'ck_commission_math');

-- Transferência após contrato fechado não move comissão histórica
select tests.as_user('admin_a');
select public.transfer_client(tests.id('client_a'), tests.id('seller_b'), 'Teste pós-contrato');
reset role;
select tests.ok((select seller_id from public.contracts where id = (select id from t_k)) = tests.id('seller_a'), 'Contrato mantém vendedor da venda após transferência');
select tests.ok((select bool_and(seller_id = tests.id('seller_a')) from public.commission_entitlements), 'Comissões históricas permanecem com o vendedor original');

-- Estorno de recebimento com comissão já paga: não apaga histórico, alerta admins
select tests.as_user('admin_a');
select public.reverse_receipt((select receipt_id from public.commission_entitlements limit 1), 'Chargeback do cliente');
reset role;
select tests.ok((select status from public.commission_entitlements limit 1) = 'paid', 'Comissão paga não é apagada pelo estorno');
select tests.ok((select count(*) from public.notifications where type = 'system' and title like 'Comissão paga%') = 3, 'Admins alertados para tratar compensação');
rollback;
