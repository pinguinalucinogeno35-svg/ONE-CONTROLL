-- Trabalhos (migration 0019): fluxo completo de um carrossel + regras de acesso e de estado.
begin;
select tests.fixture();
create temp table v (k text primary key, id uuid); grant all on v to authenticated, service_role;

-- Criação (administração), com copy por página e checklist obrigatório.
select tests.as_user('prod_a', 'aal1');
select tests.throws($$select public.create_work(jsonb_build_object('title', 'Teste', 'category', 'post'))$$, 'Produção não cria trabalho (gestão cria)', 'administradores');
select tests.as_user('admin_a');
insert into v select 'w', public.create_work(jsonb_build_object(
  'title', 'Carrossel de lançamento', 'category', 'carousel', 'client_id', tests.id('client_a'),
  'objective', 'Comunicar a mensagem aprovada', 'deliverable_format', '5 páginas 1080×1350', 'due_date', current_date + 7,
  'reviewer_id', tests.id('admin_b'), 'assignees', jsonb_build_array(tests.id('prod_a')),
  'items', jsonb_build_array(
    jsonb_build_object('kind', 'slide', 'title', 'Página 1', 'body', 'Título forte'),
    jsonb_build_object('kind', 'slide', 'title', 'Página 2', 'body', 'Benefício'),
    jsonb_build_object('kind', 'checklist', 'title', 'Copy aprovada', 'required', true),
    jsonb_build_object('kind', 'checklist', 'title', 'Logo oficial', 'required', true),
    jsonb_build_object('kind', 'checklist', 'title', 'Referência extra', 'required', false)),
  'links', jsonb_build_array(jsonb_build_object('kind', 'reference', 'label', 'Moodboard', 'url', 'https://example.test/mood'))));
reset role;
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('prod_a') and type = 'work_assigned') = 1,
  'Responsável recebe notificação personalizada ao ser atribuído');
select tests.ok((select title like 'Prod, você tem um novo trabalho' and message not like '%Empresa A%' from public.notifications
  where recipient_user_id = tests.id('prod_a') and type = 'work_assigned'), 'Notificação sem nome do cliente (aparece na tela de bloqueio)');

-- Visibilidade.
select tests.as_user('prod_a', 'aal1');
select tests.ok((select count(*) from public.works) = 1 and (select count(*) from public.work_items) = 5, 'Responsável vê o trabalho e a ficha');
select tests.ok((select count(*) from public.clients) = 0, 'Produção continua sem acesso à tabela de clientes');
select tests.ok((select string_agg(company_name, ',') from public.visible_client_names()) = 'Empresa A', 'Produção vê só o nome do cliente dos seus trabalhos (T05)');
select tests.as_user('seller_a', 'aal1');
select tests.ok((select count(*) from public.works) = 0, 'Quem não participa não vê o trabalho (nem o dono da carteira)');
select tests.throws($$select public.set_work_status((select id from v where k = 'w'), 'in_production', null)$$, 'Não participante não altera o trabalho', 'não encontrado');

-- Prontidão: itens obrigatórios (T10).
select tests.as_user('admin_a');
select tests.throws($$select public.set_work_status((select id from v where k = 'w'), 'ready', null)$$, 'Pronto bloqueado enquanto falta material', 'Aguardando material: Copy aprovada, Logo oficial');
select tests.as_user('prod_a', 'aal1');
select public.set_work_item_done(id, true) from public.work_items where work_id = (select id from v where k = 'w') and title in ('Copy aprovada', 'Logo oficial');
select tests.throws($$select public.set_work_status((select id from v where k = 'w'), 'ready', null)$$, 'Quem executa não marca como pronto', 'quem prepara');
select tests.as_user('admin_a');
select public.set_work_status((select id from v where k = 'w'), 'ready', null);
select tests.ok((select status::text from public.works where id = (select id from v where k = 'w')) = 'ready', 'Item opcional faltando não bloqueia');

-- Produção e mudança de copy avisada (T09).
select tests.as_user('prod_a', 'aal1');
select public.set_work_status((select id from v where k = 'w'), 'in_production', null);
select tests.throws($$select public.save_work_item((select id from v where k = 'w'), null, jsonb_build_object('kind', 'slide', 'title', 'Página 3'))$$,
  'Quem executa não edita a copy em silêncio (T08)', 'não encontrado');
select tests.as_user('admin_a');
select public.save_work_item((select id from v where k = 'w'), (select id from public.work_items where work_id = (select id from v where k = 'w') and title = 'Página 2'),
  jsonb_build_object('title', 'Página 2', 'body', 'Benefício revisado'));
select public.save_work_item((select id from v where k = 'w'), null, jsonb_build_object('kind', 'checklist', 'title', 'Fonte da marca'));
reset role;
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('prod_a') and type = 'work_updated' and message like '%conteúdo alterado%') = 1,
  'Mudança de copy em produção avisa quem executa (checklist novo não gera aviso)');
select tests.ok((select count(*) from public.work_events where kind = 'content_changed') = 1, 'Mudança de copy registrada no histórico');

-- Revisão: prévia obrigatória; quem executou não aprova.
select tests.as_user('prod_a', 'aal1');
select tests.throws($$select public.set_work_status((select id from v where k = 'w'), 'in_review', null)$$, 'Revisão exige link da prévia', 'prévia');
select tests.throws($$select public.add_work_link((select id from v where k = 'w'), jsonb_build_object('kind', 'preview', 'label', 'Prévia', 'url', 'http://inseguro.test/x'))$$,
  'Link sem https é recusado', 'https');
insert into v select 'preview', public.add_work_link((select id from v where k = 'w'), jsonb_build_object('kind', 'preview', 'label', 'Prévia v1', 'url', 'https://example.test/v1'));
select public.set_work_status((select id from v where k = 'w'), 'in_review', null);
reset role;
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('admin_b') and type = 'work_review_requested') = 1, 'Revisor é avisado');
select tests.as_user('prod_a', 'aal1');
select tests.throws($$select public.set_work_status((select id from v where k = 'w'), 'done', null)$$, 'Sem autocertificação: quem executou não aprova', 'não pode aprovar');

-- Ajustes com descrição.
select tests.as_user('admin_b');
select tests.throws($$select public.set_work_status((select id from v where k = 'w'), 'in_production', null)$$, 'Pedido de ajuste exige descrição', 'Descreva os ajustes');
select public.set_work_status((select id from v where k = 'w'), 'in_production', 'Página 3: ajustar contraste');
reset role;
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('prod_a') and type = 'work_changes_requested' and message like '%Página 3%') = 1,
  'Ajuste específico chega a quem executa');

-- Bloqueio é indicador (T20).
select tests.as_user('prod_a', 'aal1');
select public.set_work_blocked((select id from v where k = 'w'), 'Aguardando fotos do cliente');
select tests.ok((select status::text = 'in_production' and blocked_reason is not null from public.works where id = (select id from v where k = 'w')), 'Bloqueio não muda o estado');
select tests.throws($$select public.set_work_status((select id from v where k = 'w'), 'in_review', null)$$, 'Bloqueado não vai para revisão', 'bloqueio');
select public.set_work_blocked((select id from v where k = 'w'), null);
select public.set_work_status((select id from v where k = 'w'), 'in_review', null);

-- Aprovação exige entrega final.
select tests.as_user('admin_b');
select tests.throws($$select public.set_work_status((select id from v where k = 'w'), 'done', null)$$, 'Aprovação exige link da entrega final', 'entrega final');
select tests.as_user('prod_a', 'aal1');
select public.add_work_link((select id from v where k = 'w'), jsonb_build_object('kind', 'final', 'label', 'Exportação final', 'url', 'https://example.test/final'));
select tests.as_user('admin_b');
select public.set_work_status((select id from v where k = 'w'), 'done', null);
reset role;
select tests.ok((select status::text = 'done' and completed_at is not null from public.works where id = (select id from v where k = 'w')), 'Trabalho concluído pelo revisor');
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('prod_a') and type = 'work_approved') = 1, 'Quem executou é avisado da aprovação');
select tests.as_user('prod_a', 'aal1');
select tests.throws($$select public.remove_work_link((select id from v where k = 'preview'))$$, 'Links de trabalho concluído são preservados', 'preservado');
select tests.throws($$select public.set_work_status((select id from v where k = 'w'), 'in_production', 'quero mudar')$$, 'Só a gestão reabre', 'gestão');
select tests.throws($$delete from public.work_events$$, 'Histórico sem DELETE pela API', 'permission denied');

-- Prazo original preservado; responsáveis livres; revisor ≠ responsável; brutos e backup.
select tests.as_user('admin_a');
insert into v select 'w2', public.create_work(jsonb_build_object('title', 'Sessão de fotos da equipe', 'category', 'photo', 'client_id', tests.id('client_a'),
  'due_date', current_date + 10, 'assignees', jsonb_build_array(tests.id('prod_a'), tests.id('seller_b'))));
select tests.ok((select count(*) from public.work_assignees where work_id = (select id from v where k = 'w2')) = 2, 'Vendedor também pode ser responsável (sem trava por função, T03/T11)');
select tests.throws($$select public.update_work((select id from v where k = 'w2'), jsonb_build_object('title', 'Sessão de fotos da equipe', 'category', 'photo', 'client_id', tests.id('client_a'), 'due_date', current_date + 20))$$,
  'Mudança de prazo exige motivo', 'motivo');
select public.update_work((select id from v where k = 'w2'), jsonb_build_object('title', 'Sessão de fotos da equipe', 'category', 'photo', 'client_id', tests.id('client_a'),
  'due_date', current_date + 20, 'due_change_reason', 'Cliente remarcou'));
select tests.ok((select due_original = current_date + 10 and due_current = current_date + 20 from public.works where id = (select id from v where k = 'w2')),
  'Prazo original preservado, vigente atualizado (TRA-04)');
select tests.throws($$select public.update_work((select id from v where k = 'w2'), jsonb_build_object('title', 'Sessão de fotos da equipe', 'category', 'photo', 'client_id', tests.id('client_a'),
  'due_date', current_date + 20, 'reviewer_id', tests.id('prod_a')))$$, 'Responsável não pode ser revisor', 'não pode ser o revisor');
select public.set_work_assignees((select id from v where k = 'w2'), array[tests.id('prod_a')]);
reset role;
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('seller_b') and type = 'work_updated' and title like '%transferido%') = 1,
  'Quem sai do trabalho é avisado');
select tests.as_user('prod_a', 'aal1');
insert into v select 'raw', public.add_work_link((select id from v where k = 'w2'), jsonb_build_object('kind', 'raw', 'label', 'Originais', 'url', 'https://drive.example.test/raw'));
select tests.ok((select backup_confirmed_at is null from public.work_links where id = (select id from v where k = 'raw')), 'Enviar link não é confirmar backup');
select public.confirm_work_backup((select id from v where k = 'raw'));
select tests.ok((select backup_confirmed_at is not null from public.work_links where id = (select id from v where k = 'raw')), 'Backup confirmado como evento separado');
select tests.throws($$select public.confirm_work_backup((select id from v where k = 'preview'))$$, 'Backup só para brutos', 'brutos');
select tests.throws($$select public.set_work_status((select id from v where k = 'w2'), 'cancelled', 'teste')$$, 'Responsável não cancela', 'gestão');
select public.comment_work((select id from v where k = 'w2'), 'Chego às 9h no local.');
reset role;
select tests.ok((select count(*) from public.notifications where recipient_user_id = tests.id('admin_a') and type = 'work_commented') = 1, 'Comentário avisa quem criou');
select tests.as_user('seller_b', 'aal1');
select tests.ok((select count(*) from public.works where id = (select id from v where k = 'w2')) = 0, 'Quem saiu do trabalho deixa de vê-lo');
rollback;
