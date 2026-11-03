-- Versões, ajustes localizados e aprovação da versão exata (migration 0020).
begin;
select tests.fixture();
create temp table v (k text primary key, id uuid); grant all on v to authenticated, service_role;

select tests.as_user('admin_a');
insert into v select 'w', public.create_work(jsonb_build_object('title', 'Carrossel institucional', 'category', 'carousel', 'client_id', tests.id('client_a'),
  'reviewer_id', tests.id('admin_b'), 'assignees', jsonb_build_array(tests.id('prod_a'))));
select public.set_work_status((select id from v where k = 'w'), 'ready', null);
select tests.as_user('prod_a', 'aal1');
select public.set_work_status((select id from v where k = 'w'), 'in_production', null);

-- v1
select tests.throws($$select public.submit_work_version((select id from v where k = 'w'), jsonb_build_object('url', 'http://x.test'))$$, 'Versão exige link https', 'https');
insert into v select 'v1', public.submit_work_version((select id from v where k = 'w'), jsonb_build_object('url', 'https://example.test/v1', 'label', 'Primeira proposta'));
reset role;
select tests.ok((select status::text from public.works where id = (select id from v where k = 'w')) = 'in_review', 'Enviar versão coloca em revisão');
select tests.ok((select number = 1 and status = 'submitted' from public.work_versions where id = (select id from v where k = 'v1')), 'Versão 1 registrada');
select tests.ok((select count(*) from public.work_links where work_id = (select id from v where k = 'w') and kind = 'preview' and label like 'Versão 1%') = 1, 'Prévia da versão vira link da ficha');

-- Quem executou não decide; ajustes localizados (T17).
select tests.as_user('prod_a', 'aal1');
select tests.throws($$select public.review_work_version((select id from v where k = 'v1'), jsonb_build_object('decision', 'approve'))$$, 'Quem executou não aprova a própria versão', 'não pode aprovar');
select tests.as_user('admin_b');
select tests.throws($$select public.review_work_version((select id from v where k = 'v1'), jsonb_build_object('decision', 'changes'))$$, 'Ajuste exige descrição', 'Descreva');
select public.review_work_version((select id from v where k = 'v1'), jsonb_build_object('decision', 'changes', 'feedback', jsonb_build_array(
  jsonb_build_object('location', 'Página 3', 'body', 'Ajustar contraste do título'),
  jsonb_build_object('location', 'Página 5', 'body', 'Trocar foto pela aprovada'))));
reset role;
select tests.ok((select status::text from public.work_versions where id = (select id from v where k = 'v1')) = 'changes_requested', 'Versão 1 marcada com ajustes');
select tests.ok((select count(*) from public.work_feedback where version_id = (select id from v where k = 'v1') and resolved_at is null) = 2, 'Cada ajuste vira item a resolver (S-07)');
select tests.ok((select status::text from public.works where id = (select id from v where k = 'w')) = 'in_production', 'Trabalho volta para produção');
select tests.ok((select message like '%v1 — Página 3: Ajustar contraste%' from public.notifications where recipient_user_id = tests.id('prod_a') and type = 'work_changes_requested'),
  'Aviso aponta a página específica');

-- Resolver ajuste e enviar v2.
select tests.as_user('prod_a', 'aal1');
select public.resolve_work_feedback(id, 'Feito na v2') from public.work_feedback where location = 'Página 3';
insert into v select 'v2', public.submit_work_version((select id from v where k = 'w'), jsonb_build_object('url', 'https://example.test/v2', 'note', 'Contraste e foto ajustados'));
reset role;
select tests.ok((select count(*) from public.work_feedback where resolved_at is not null) = 1, 'Ajuste resolvido com registro de quem resolveu');

-- Revisar versão antiga é recusado; aprovar v2 sem entrega final não conclui.
select tests.as_user('admin_b');
select tests.throws($$select public.review_work_version((select id from v where k = 'v1'), jsonb_build_object('decision', 'approve'))$$, 'Decisão vale só para a última versão', 'versão mais recente');
select public.review_work_version((select id from v where k = 'v2'), jsonb_build_object('decision', 'approve', 'note', 'Ótimo'));
reset role;
select tests.ok((select status::text from public.work_versions where id = (select id from v where k = 'v2')) = 'approved', 'Versão 2 aprovada (decisão sobre a versão exata)');
select tests.ok((select status::text from public.works where id = (select id from v where k = 'w')) = 'in_review', 'Sem entrega final, o trabalho não é concluído');
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('prod_a') and message like '%versão 2 aprovada — envie a entrega final%') = 1,
  'Quem executa é avisado para enviar a entrega final');

-- Nova versão depois da aprovação não herda a aprovação (APR-01).
select tests.as_user('prod_a', 'aal1');
insert into v select 'v3', public.submit_work_version((select id from v where k = 'w'), jsonb_build_object('url', 'https://example.test/v3', 'note', 'Pequeno ajuste de última hora'));
reset role;
select tests.ok((select status::text from public.work_versions where id = (select id from v where k = 'v2')) = 'superseded', 'Aprovação da v2 não vale para a v3');
select tests.as_user('admin_b');
select tests.throws($$select public.complete_work((select id from v where k = 'w'))$$, 'Concluir exige a última versão aprovada', 'Aprove a última versão');
select public.review_work_version((select id from v where k = 'v3'), jsonb_build_object('decision', 'approve'));
select tests.throws($$select public.complete_work((select id from v where k = 'w'))$$, 'Concluir exige entrega final', 'entrega final');
select tests.as_user('prod_a', 'aal1');
select public.add_work_link((select id from v where k = 'w'), jsonb_build_object('kind', 'final', 'label', 'Exportações finais', 'url', 'https://example.test/final'));
select tests.throws($$select public.complete_work((select id from v where k = 'w'))$$, 'Quem executou não conclui', 'não pode aprovar');
select tests.as_user('admin_b');
select public.complete_work((select id from v where k = 'w'));
reset role;
select tests.ok((select status::text = 'done' and completed_at is not null from public.works where id = (select id from v where k = 'w')), 'Concluído pelo revisor com v3 aprovada e entrega final');
select tests.ok((select count(*) from public.work_versions where work_id = (select id from v where k = 'w')) = 3, 'Histórico das 3 versões preservado');

-- Compatibilidade com a fase 3: botões antigos registram versão.
select tests.as_user('admin_a');
insert into v select 'w2', public.create_work(jsonb_build_object('title', 'Post rápido', 'category', 'post', 'assignees', jsonb_build_array(tests.id('prod_a'))));
select public.set_work_status((select id from v where k = 'w2'), 'ready', null);
select tests.as_user('prod_a', 'aal1');
select public.set_work_status((select id from v where k = 'w2'), 'in_production', null);
select public.add_work_link((select id from v where k = 'w2'), jsonb_build_object('kind', 'preview', 'label', 'Prévia', 'url', 'https://example.test/p'));
select public.set_work_status((select id from v where k = 'w2'), 'in_review', null);
select public.add_work_link((select id from v where k = 'w2'), jsonb_build_object('kind', 'final', 'label', 'Final', 'url', 'https://example.test/f'));
select tests.as_user('admin_a');
select public.set_work_status((select id from v where k = 'w2'), 'done', null);
reset role;
select tests.ok((select string_agg(number || ':' || status, ',') from public.work_versions where work_id = (select id from v where k = 'w2')) = '1:approved',
  'Fluxo da fase 3 gera versão 1 aprovada');
select tests.as_user('seller_a', 'aal1');
select tests.ok((select count(*) from public.work_versions) = 0 and (select count(*) from public.work_feedback) = 0, 'Quem não participa não vê versões nem ajustes');
rollback;
