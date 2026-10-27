-- Captação via Google Forms e importação (20.5, Cenário A).
begin;
select tests.fixture();
create temp table v (k text primary key, t text); grant all on v to authenticated, service_role;

select tests.as_user('seller_a');
insert into v select 'token', token from public.create_lead_capture_link('Campanha', 30, null, null);
select tests.ok((select count(*) from public.lead_capture_links) = 1, 'Vendedor gera link de cadastro');
select tests.ok((select token_hash <> (select t from v where k = 'token') from public.lead_capture_links), 'Somente o hash do token é armazenado');
select tests.ok((select length(t) = 64 from v where k = 'token'), 'Token com 256 bits');
select tests.throws($$select public.create_lead_capture_link('x', 30, null, tests.id('seller_b'))$$, 'Vendedor não gera link para outra carteira', 'outra carteira');
select tests.throws($$select public.ingest_form_submission((select t from v where k='token'), 'form-1', 'resp-x', now(), '{}'::jsonb)$$,
  'Usuário autenticado não chama ingestão (somente service_role)', 'permission denied');

-- Cenário A: resposta válida importada para o vendedor do link
select tests.as_service();
select tests.ok((public.ingest_form_submission((select t from v where k = 'token'), 'form-1', 'resp-1', now(), jsonb_build_object(
  'nome_contato', 'Marina Souza', 'nome_empresa', 'Café Bahia', 'email', 'marina@cafebahia.test', 'whatsapp', '71 98888-7777',
  'instagram', '@CafeBahia', 'servicos', 'Landing Page, Tráfego pago', 'seller_id', tests.id('seller_b'))) ->> 'status') = 'imported',
  'Resposta válida importada');
reset role;
select tests.ok((select seller_id = tests.id('seller_a') and status = 'pending_completion' and instagram = 'cafebahia' and whatsapp = '+5571988887777'
                  from public.clients where company_name = 'Café Bahia'),
  'Cenário A: cliente associado ao vendedor do link (seller_id do payload ignorado), pendente de complementação');
select tests.ok((select count(*) from public.client_service_interests i join public.clients c on c.id = i.client_id where c.company_name = 'Café Bahia') = 1,
  'Serviço do catálogo associado');
select tests.ok((select business_description like '%Tráfego pago%' from public.clients where company_name = 'Café Bahia'), 'Serviço fora do catálogo preservado na descrição');
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('seller_a') and type = 'form_submission_received') = 1, 'Vendedor notificado');

select tests.as_service();
select tests.ok((public.ingest_form_submission((select t from v where k = 'token'), 'form-1', 'resp-1', now(), '{}'::jsonb) ->> 'replayed')::boolean,
  'Resposta repetida (replay) não duplica');
select tests.ok((public.ingest_form_submission((select t from v where k = 'token'), 'form-1', 'resp-2', now(), jsonb_build_object(
  'nome_contato', 'Marina S.', 'nome_empresa', 'Café Bahia Filial', 'email', 'MARINA@cafebahia.test')) ->> 'status') = 'duplicate',
  'Cliente duplicado na carteira detectado (sem novo cadastro)');
select tests.ok((public.ingest_form_submission(repeat('a', 64), 'form-1', 'resp-3', now(), jsonb_build_object('nome_contato', 'X Y', 'nome_empresa', 'Z')) ->> 'status') = 'rejected',
  'Token inexistente rejeitado');
select tests.ok((public.ingest_form_submission((select t from v where k = 'token'), 'form-1', 'resp-4', now(), jsonb_build_object('nome_contato', '', 'email', 'invalido')) -> 'errors') ?& array['nome_contato_obrigatorio', 'email_invalido'],
  'Payload inválido rejeitado com erros de validação');
reset role;
select tests.ok((select count(*) from public.clients where organization_id = tests.id('org')) = 3, 'Somente 1 cliente novo criado no total');

-- Link expirado e vendedor desativado
update public.lead_capture_links set expires_at = now() - interval '1 minute';
select tests.as_service();
select tests.ok((public.ingest_form_submission((select t from v where k = 'token'), 'form-1', 'resp-5', now(), jsonb_build_object('nome_contato', 'Novo Contato', 'nome_empresa', 'Nova')) -> 'errors') ? 'link_expirado',
  'Token expirado rejeitado');
reset role;
update public.lead_capture_links set expires_at = now() + interval '1 day';
select tests.as_user('admin_a');
select public.admin_set_user_status(tests.id('seller_a'), 'suspended', 'Afastamento');
select tests.as_service();
select tests.ok((public.ingest_form_submission((select t from v where k = 'token'), 'form-1', 'resp-6', now(), jsonb_build_object('nome_contato', 'Novo Contato', 'nome_empresa', 'Nova')) ->> 'status') = 'rejected',
  'Vendedor desativado: link revogado e resposta rejeitada');

reset role;
update public.lead_capture_links set status = 'active', revoked_at = null;
update public.profiles set status = 'active' where id = tests.id('seller_a');
select tests.as_service();
select tests.ok((public.ingest_form_submission((select t from v where k = 'token'), 'form-1', 'resp-6', now(), jsonb_build_object('nome_contato', 'Novo Contato', 'nome_empresa', 'Nova')) ->> 'status') = 'imported',
  'Reprocessamento de evento rejeitado após correção');
reset role;
select tests.ok((select count(*) from public.form_submissions where external_response_id = 'resp-6') = 1, 'Reprocessamento mantém um registro por resposta');

-- Importação em lote
reset role;
update public.profiles set status = 'active' where id = tests.id('seller_a');
select tests.as_user('seller_a');
select tests.ok((public.import_clients_batch(jsonb_build_array(
    jsonb_build_object('contact_name', 'Luiz', 'company_name', 'Padaria Sol', 'email', 'luiz@sol.test'),
    jsonb_build_object('contact_name', 'L', 'company_name', 'Inválido'),
    jsonb_build_object('contact_name', 'Ana Paula', 'company_name', 'Dup', 'email', 'contato@empresa-a.test'),
    jsonb_build_object('contact_name', 'Rita', 'company_name', 'Ótica Rita', 'tax_id', '11.111.111/1111-11')),
  'csv', 'clientes.csv', repeat('b', 64), null) ->> 'accepted')::int = 1,
  'Importação aceita linhas válidas e rejeita inválidas/duplicadas/CNPJ inválido');
select tests.throws($$select public.import_clients_batch(jsonb_build_array(jsonb_build_object('contact_name', 'Outro', 'company_name', 'Outro')), 'csv', 'clientes.csv', repeat('b', 64), null)$$,
  'Mesmo arquivo não é importado duas vezes', 'já foi importado');
select tests.throws($$select public.import_clients_batch(jsonb_build_array(jsonb_build_object('contact_name', 'Outro', 'company_name', 'Outro')), 'csv', 'c.csv', repeat('c', 64), tests.id('seller_b'))$$,
  'Vendedor não importa para outra carteira', 'outra carteira');
rollback;
