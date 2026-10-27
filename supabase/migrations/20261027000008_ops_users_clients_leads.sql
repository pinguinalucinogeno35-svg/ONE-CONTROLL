-- =============================================================================
-- ONE CONTROL — 0008 Rotinas transacionais: usuários, clientes, captação, importação
-- =============================================================================
-- Todas as rotinas públicas abaixo são SECURITY DEFINER com search_path vazio,
-- nomes totalmente qualificados e verificação explícita de autorização no início.
-- =============================================================================

create or replace function private.today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Bahia')::date;
$$;

create or replace function private.is_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user = 'service_role'
      or coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') = 'service_role';
$$;

create or replace function private.sha256_hex(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(p, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function private.text_or_null(p jsonb, k text, maxlen integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare v text;
begin
  v := nullif(btrim(p ->> k), '');
  if v is not null and length(v) > maxlen then
    raise exception 'Campo % excede % caracteres', k, maxlen using errcode = '22001';
  end if;
  return v;
end;
$$;

-- Lê montante monetário de jsonb exigindo no máximo 2 casas e valor não negativo.
create or replace function private.money_from_json(p jsonb, k text, required boolean default true)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare v text; n numeric;
begin
  v := nullif(btrim(p ->> k), '');
  if v is null then
    if required then raise exception 'Campo monetário % obrigatório', k using errcode = '22023'; end if;
    return null;
  end if;
  if v !~ '^\d{1,13}(\.\d{1,2})?$' then
    raise exception 'Valor monetário inválido em %', k using errcode = '22023';
  end if;
  n := v::numeric(15,2);
  return n;
end;
$$;

-- ----------------------------------------------------------------------------
-- Usuários
-- ----------------------------------------------------------------------------

-- Bootstrap dos administradores iniciais. Executado SOMENTE pelo SQL Editor /
-- psql com papel privilegiado (não exposto à API). Limite de segurança: 3 admins
-- criados por bootstrap; depois disso use convites.
create or replace function private.bootstrap_admin(p_user_id uuid, p_full_name text, p_email text, p_org_slug text default 'one-studio-digital')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid; v_count int;
begin
  select id into v_org from public.organizations where slug = p_org_slug;
  if v_org is null then raise exception 'Organização % não encontrada', p_org_slug; end if;
  select count(*) into v_count from public.profiles where organization_id = v_org and role = 'admin';
  if v_count >= 3 then
    raise exception 'Bootstrap permite no máximo 3 administradores; use o fluxo de convite';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Usuário % não existe em auth.users', p_user_id;
  end if;
  insert into public.profiles (id, organization_id, full_name, email, role, status)
  values (p_user_id, v_org, p_full_name, lower(p_email), 'admin', 'active');
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, new_values, source)
  values (v_org, null, 'admin_bootstrapped', 'profiles', p_user_id, jsonb_build_object('email', lower(p_email)), 'system');
  return p_user_id;
end;
$$;

create or replace function public.create_user_invitation(p_email text, p_full_name text, p_role public.user_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; v_id uuid; v_email text := private.normalize_email(p_email);
begin
  select * into a from private.require_admin();
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where organization_id = a.organization_id and lower(email) = v_email) then
    raise exception 'Já existe colaborador com este e-mail' using errcode = '23505';
  end if;
  update public.user_invitations set status = 'expired'
   where organization_id = a.organization_id and lower(email) = v_email and status = 'pending' and expires_at < now();
  insert into public.user_invitations (organization_id, email, full_name, intended_role, status, expires_at, invited_by)
  values (a.organization_id, v_email, btrim(p_full_name), p_role, 'pending', now() + interval '7 days', a.user_id)
  returning id into v_id;
  perform private.log_audit(a.organization_id, 'invitation_created', 'user_invitations', v_id, null,
    jsonb_build_object('email', v_email, 'role', p_role));
  return v_id;
end;
$$;

-- Chamado pelo servidor (service_role) após auth.admin.inviteUserByEmail.
create or replace function public.provision_invited_profile(p_invitation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare i record;
begin
  if not private.is_service_role() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into i from public.user_invitations where id = p_invitation_id for update;
  if i.id is null or i.status <> 'pending' or i.expires_at < now() then
    raise exception 'Convite inválido ou expirado' using errcode = '22023';
  end if;
  insert into public.profiles (id, organization_id, full_name, email, role, status)
  values (p_user_id, i.organization_id, i.full_name, i.email, i.intended_role, 'invited')
  on conflict (id) do nothing;
  update public.user_invitations set accepted_by = p_user_id where id = i.id;
end;
$$;

-- Primeiro acesso: o próprio convidado ativa o perfil (invited → active).
create or replace function public.activate_own_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare p record; i record;
begin
  select * into p from public.profiles where id = (select auth.uid()) for update;
  if p.id is null then raise exception 'Perfil não encontrado' using errcode = '42501'; end if;
  if p.status = 'active' then return; end if;
  if p.status <> 'invited' then raise exception 'Conta não está apta à ativação' using errcode = '42501'; end if;
  select * into i from public.user_invitations
   where accepted_by = p.id and status = 'pending' and expires_at >= now()
   order by created_at desc limit 1 for update;
  if i.id is null then raise exception 'Convite expirado; solicite novo convite' using errcode = '42501'; end if;
  perform set_config('one.profile_activation', 'on', true);
  update public.profiles set status = 'active' where id = p.id;
  perform set_config('one.profile_activation', 'off', true);
  update public.user_invitations set status = 'accepted', accepted_at = now() where id = i.id;
  perform private.log_audit(p.organization_id, 'profile_activated', 'profiles', p.id);
end;
$$;

create or replace function public.revoke_user_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record;
begin
  select * into a from private.require_admin();
  update public.user_invitations set status = 'revoked'
   where id = p_invitation_id and organization_id = a.organization_id and status = 'pending';
  if not found then raise exception 'Convite não encontrado ou não pendente' using errcode = 'P0002'; end if;
  perform private.log_audit(a.organization_id, 'invitation_revoked', 'user_invitations', p_invitation_id);
end;
$$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status public.profile_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; t record;
begin
  select * into a from private.require_admin();
  if p_user_id = a.user_id then
    raise exception 'Administrador não pode alterar o próprio status' using errcode = '42501';
  end if;
  if p_status = 'invited' then raise exception 'Status inválido' using errcode = '22023'; end if;
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into t from public.profiles where id = p_user_id and organization_id = a.organization_id for update;
  if t.id is null then raise exception 'Usuário não encontrado' using errcode = 'P0002'; end if;
  if t.role = 'admin' and p_status <> 'active' and (
       select count(*) from public.profiles
        where organization_id = a.organization_id and role = 'admin' and status = 'active' and id <> t.id) < 1 then
    raise exception 'Não é possível desativar o último administrador ativo' using errcode = '42501';
  end if;
  update public.profiles set status = p_status where id = t.id;
  if p_status <> 'active' then
    -- Desabilita links de captação ativos do usuário.
    update public.lead_capture_links set status = 'revoked', revoked_at = now()
     where seller_id = t.id and status = 'active';
  end if;
  perform private.log_audit(a.organization_id, 'user_status_changed', 'profiles', t.id,
    jsonb_build_object('status', t.status), jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; t record;
begin
  select * into a from private.require_admin();
  if p_user_id = a.user_id then
    raise exception 'Administrador não pode alterar o próprio papel' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into t from public.profiles where id = p_user_id and organization_id = a.organization_id for update;
  if t.id is null then raise exception 'Usuário não encontrado' using errcode = 'P0002'; end if;
  if t.role = p_role then return; end if;
  update public.profiles set role = p_role where id = t.id;
  perform private.log_audit(a.organization_id, 'user_role_changed', 'profiles', t.id,
    jsonb_build_object('role', t.role), jsonb_build_object('role', p_role, 'reason', p_reason));
end;
$$;

create or replace function public.touch_last_active()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_active_at = now()
   where id = (select auth.uid()) and status = 'active'
     and (last_active_at is null or last_active_at < now() - interval '5 minutes');
$$;

-- ----------------------------------------------------------------------------
-- Clientes
-- ----------------------------------------------------------------------------

-- Busca possível duplicidade (e-mail, WhatsApp ou CNPJ/CPF idênticos na organização).
create or replace function private.find_duplicate_client(p_org uuid, p_email text, p_whatsapp text, p_tax_id text, p_exclude uuid default null)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.clients c
  where c.organization_id = p_org
    and (p_exclude is null or c.id <> p_exclude)
    and ((p_email is not null and c.email = private.normalize_email(p_email))
      or (p_whatsapp is not null and c.whatsapp = coalesce(private.normalize_phone_br(p_whatsapp), p_whatsapp))
      or (p_tax_id is not null and c.tax_id = regexp_replace(p_tax_id, '\D', '', 'g')))
  order by c.created_at
  limit 1;
$$;

-- Resolve o responsável comercial: vendedor só cria para si; admin pode indicar.
create or replace function private.resolve_seller(p_actor record, p_requested uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor.role = 'seller' then
    if p_requested is not null and p_requested <> p_actor.user_id then
      raise exception 'Vendedor não pode atribuir clientes a outra carteira' using errcode = '42501';
    end if;
    return p_actor.user_id;
  end if;
  if p_requested is null then
    raise exception 'Informe o vendedor responsável' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_requested and organization_id = p_actor.organization_id
                 and status = 'active') then
    raise exception 'Responsável inexistente ou inativo' using errcode = '22023';
  end if;
  return p_requested;
end;
$$;

create or replace function private.insert_client(
  p_org uuid, p_seller uuid, p_registered_by uuid, p jsonb, p_default_status public.client_status)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_whatsapp_raw text := private.text_or_null(p, 'whatsapp', 40);
  v_whatsapp text;
  v_dup uuid;
begin
  if v_whatsapp_raw is not null then
    v_whatsapp := private.normalize_phone_br(v_whatsapp_raw);
    if v_whatsapp is null then raise exception 'WhatsApp inválido' using errcode = '22023'; end if;
  end if;
  v_dup := private.find_duplicate_client(p_org, p ->> 'email', v_whatsapp, p ->> 'tax_id');
  insert into public.clients (organization_id, seller_id, contact_name, company_name, email, whatsapp,
    instagram, website, tax_id, business_description, lead_source, status, registered_by,
    original_seller_id, possible_duplicate_of)
  values (p_org, p_seller,
    coalesce(private.text_or_null(p, 'contact_name', 120), ''),
    coalesce(private.text_or_null(p, 'company_name', 160), ''),
    private.text_or_null(p, 'email', 254), v_whatsapp,
    private.text_or_null(p, 'instagram', 120), private.text_or_null(p, 'website', 300),
    private.text_or_null(p, 'tax_id', 20), private.text_or_null(p, 'business_description', 2000),
    private.text_or_null(p, 'lead_source', 80), p_default_status, p_registered_by, p_seller, v_dup)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_client(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a record; v_seller uuid; v_id uuid; v_service uuid; v_status public.client_status;
begin
  select * into a from private.require_active_user();
  v_seller := private.resolve_seller(a, nullif(p ->> 'seller_id', '')::uuid);
  v_status := coalesce(nullif(p ->> 'status', ''), 'lead')::public.client_status;
  if v_status not in ('lead', 'active', 'pending_completion') then
    raise exception 'Status inicial inválido' using errcode = '22023';
  end if;
  v_id := private.insert_client(a.organization_id, v_seller, a.user_id, p, v_status);
  for v_service in select (jsonb_array_elements_text(coalesce(p -> 'service_ids', '[]'::jsonb)))::uuid loop
    if not exists (select 1 from public.services where id = v_service and organization_id = a.organization_id) then
      raise exception 'Serviço inválido' using errcode = '22023';
    end if;
    insert into public.client_service_interests (client_id, service_id) values (v_id, v_service)
    on conflict do nothing;
  end loop;
  perform private.log_audit(a.organization_id, 'client_created', 'clients', v_id, null,
    jsonb_build_object('seller_id', v_seller, 'company_name', p ->> 'company_name'));
  perform private.notify_admins(a.organization_id, 'client_registered', 'Novo cliente cadastrado',
    coalesce(p ->> 'company_name', 'Cliente') || ' foi cadastrado.', 'clients', v_id);
  return v_id;
end;
$$;

create or replace function public.set_client_status(p_client_id uuid, p_status public.client_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; c record;
begin
  select * into a from private.require_active_user();
  select * into c from public.clients where id = p_client_id and organization_id = a.organization_id for update;
  if c.id is null or (a.role = 'seller' and c.seller_id <> a.user_id) then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  if (p_status = 'archived' or c.status = 'archived') and a.role <> 'admin' then
    raise exception 'Somente administradores arquivam/desarquivam clientes' using errcode = '42501';
  end if;
  update public.clients
     set status = p_status,
         archived_at = case when p_status = 'archived' then now() else null end
   where id = c.id;
  perform private.log_audit(a.organization_id, 'client_status_changed', 'clients', c.id,
    jsonb_build_object('status', c.status), jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.transfer_client(p_client_id uuid, p_new_seller_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record; c record;
begin
  select * into a from private.require_admin();
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  select * into c from public.clients where id = p_client_id and organization_id = a.organization_id for update;
  if c.id is null then raise exception 'Cliente não encontrado' using errcode = 'P0002'; end if;
  if c.seller_id = p_new_seller_id then raise exception 'Cliente já pertence a este vendedor' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_new_seller_id and organization_id = a.organization_id
                 and status = 'active') then
    raise exception 'Novo responsável inexistente ou inativo' using errcode = '22023';
  end if;
  perform set_config('one.client_transfer', 'on', true);
  update public.clients set seller_id = p_new_seller_id where id = c.id;
  perform set_config('one.client_transfer', 'off', true);
  insert into public.client_transfers (client_id, previous_seller_id, new_seller_id, reason, transferred_by)
  values (c.id, c.seller_id, p_new_seller_id, btrim(p_reason), a.user_id);
  -- Comissões históricas permanecem com o vendedor do contrato (contracts.seller_id).
  perform private.log_audit(a.organization_id, 'client_transferred', 'clients', c.id,
    jsonb_build_object('seller_id', c.seller_id), jsonb_build_object('seller_id', p_new_seller_id, 'reason', p_reason));
  perform private.notify(a.organization_id, p_new_seller_id, 'client_transferred', 'Cliente transferido para você',
    c.company_name || ' agora faz parte da sua carteira.', 'clients', c.id);
  perform private.notify(a.organization_id, c.seller_id, 'client_transferred', 'Cliente transferido',
    c.company_name || ' foi transferido para outra carteira.', 'clients', c.id);
end;
$$;

-- ----------------------------------------------------------------------------
-- Links de captação (Google Forms)
-- ----------------------------------------------------------------------------
create or replace function public.create_lead_capture_link(
  p_label text default null, p_valid_days integer default 30, p_max_uses integer default null,
  p_seller_id uuid default null)
returns table (link_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare a record; v_seller uuid; v_token text; v_form text;
begin
  select * into a from private.require_active_user();
  v_seller := case when a.role = 'admin' then coalesce(p_seller_id, a.user_id)
                   else private.resolve_seller(a, p_seller_id) end;
  if not exists (select 1 from public.profiles where id = v_seller and organization_id = a.organization_id and status = 'active') then
    raise exception 'Vendedor inválido' using errcode = '22023';
  end if;
  if p_valid_days is null or p_valid_days not between 1 and 90 then
    raise exception 'Validade deve estar entre 1 e 90 dias' using errcode = '22023';
  end if;
  -- 256 bits de entropia; somente o hash é persistido.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  select s.setting_value ->> 'form_id' into v_form from public.system_settings s
   where s.organization_id = a.organization_id and s.setting_key = 'google_forms.lead_form';
  link_id := gen_random_uuid();
  expires_at := now() + make_interval(days => p_valid_days);
  insert into public.lead_capture_links (id, organization_id, seller_id, external_form_id, token_hash, label,
                                         max_uses, expires_at)
  values (link_id, a.organization_id, v_seller, v_form, private.sha256_hex(v_token), left(p_label, 120),
          p_max_uses, create_lead_capture_link.expires_at);
  token := v_token;
  perform private.log_audit(a.organization_id, 'lead_link_created', 'lead_capture_links', link_id, null,
    jsonb_build_object('seller_id', v_seller));
  return next;
end;
$$;

create or replace function public.revoke_lead_capture_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record;
begin
  select * into a from private.require_active_user();
  update public.lead_capture_links set status = 'revoked', revoked_at = now()
   where id = p_link_id and organization_id = a.organization_id and status = 'active'
     and (a.role = 'admin' or seller_id = a.user_id);
  if not found then raise exception 'Link não encontrado' using errcode = 'P0002'; end if;
  perform private.log_audit(a.organization_id, 'lead_link_revoked', 'lead_capture_links', p_link_id);
end;
$$;

-- Ingestão de resposta do Google Forms. Executada SOMENTE pelo servidor com
-- service_role, após verificação HMAC/timestamp/replay no Route Handler.
-- O vendedor é resolvido pelo token do link — nunca por campo enviado.
create or replace function public.ingest_form_submission(
  p_token text, p_external_form_id text, p_external_response_id text,
  p_submitted_at timestamptz, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record; s record; v_errors jsonb := '[]'::jsonb; v_client uuid; v_dup uuid; v_sub uuid;
  v_status public.import_status; v_org uuid; v_whats text; v_service_text text; v_svc record;
  v_unmatched text[] := '{}'; v_item text;
begin
  if not private.is_service_role() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into s from public.form_submissions
   where external_form_id = p_external_form_id and external_response_id = p_external_response_id;
  if s.id is not null and s.import_status not in ('rejected', 'failed') then
    return jsonb_build_object('submission_id', s.id, 'status', s.import_status, 'client_id', s.client_id, 'replayed', true);
  elsif s.id is not null then
    -- Reprocessamento de evento rejeitado/falho (ex.: link reativado): substitui a tentativa anterior.
    delete from public.form_submissions where id = s.id;
    perform private.log_audit(s.organization_id, 'form_submission_reprocessed', 'form_submissions', s.id,
      jsonb_build_object('previous_status', s.import_status, 'errors', s.validation_errors), null, 'integration');
  end if;

  if p_token is not null and p_token ~ '^[0-9a-f]{64}$' then
    select * into l from public.lead_capture_links where token_hash = private.sha256_hex(p_token) for update;
  end if;
  if l.id is null then
    v_errors := v_errors || jsonb_build_array('link_invalido');
  else
    v_org := l.organization_id;
    if l.status <> 'active' then v_errors := v_errors || jsonb_build_array('link_' || l.status::text); end if;
    if l.expires_at < now() then v_errors := v_errors || jsonb_build_array('link_expirado'); end if;
    if l.max_uses is not null and l.use_count >= l.max_uses then v_errors := v_errors || jsonb_build_array('link_esgotado'); end if;
    if l.external_form_id is not null and l.external_form_id <> p_external_form_id then
      v_errors := v_errors || jsonb_build_array('formulario_divergente');
    end if;
    if not exists (select 1 from public.profiles where id = l.seller_id and status = 'active') then
      v_errors := v_errors || jsonb_build_array('vendedor_inativo');
    end if;
  end if;

  if coalesce(length(btrim(p_fields ->> 'nome_contato')), 0) < 2 then v_errors := v_errors || jsonb_build_array('nome_contato_obrigatorio'); end if;
  if coalesce(length(btrim(p_fields ->> 'nome_empresa')), 0) < 1 then v_errors := v_errors || jsonb_build_array('nome_empresa_obrigatorio'); end if;
  if nullif(btrim(p_fields ->> 'email'), '') is not null and btrim(p_fields ->> 'email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    v_errors := v_errors || jsonb_build_array('email_invalido');
  end if;
  if nullif(btrim(p_fields ->> 'whatsapp'), '') is not null then
    v_whats := private.normalize_phone_br(p_fields ->> 'whatsapp');
    if v_whats is null then v_errors := v_errors || jsonb_build_array('whatsapp_invalido'); end if;
  end if;

  if v_org is null then
    -- Sem link válido não há organização confiável: registra apenas para auditoria técnica.
    select id into v_org from public.organizations order by created_at limit 1;
  end if;

  if jsonb_array_length(v_errors) > 0 then
    insert into public.form_submissions (organization_id, lead_capture_link_id, external_form_id, external_response_id,
      submitted_at, import_status, validation_errors, payload)
    values (v_org, l.id, p_external_form_id, p_external_response_id, p_submitted_at, 'rejected', v_errors, null)
    returning id into v_sub;
    return jsonb_build_object('submission_id', v_sub, 'status', 'rejected', 'errors', v_errors);
  end if;

  -- Duplicidade na mesma carteira: não cria novo cadastro.
  select c.id into v_dup from public.clients c
   where c.organization_id = l.organization_id and c.seller_id = l.seller_id
     and ((nullif(p_fields ->> 'email', '') is not null and c.email = private.normalize_email(p_fields ->> 'email'))
       or (v_whats is not null and c.whatsapp = v_whats))
   limit 1;

  if v_dup is not null then
    v_client := v_dup; v_status := 'duplicate';
  else
    v_service_text := left(p_fields ->> 'servicos', 1000);
    v_client := private.insert_client(l.organization_id, l.seller_id, null, jsonb_build_object(
      'contact_name', p_fields ->> 'nome_contato', 'company_name', p_fields ->> 'nome_empresa',
      'email', p_fields ->> 'email', 'whatsapp', p_fields ->> 'whatsapp', 'instagram', p_fields ->> 'instagram',
      'lead_source', 'google_forms'), 'pending_completion');
    -- Associa serviços do catálogo pelo nome; o restante fica na descrição.
    if v_service_text is not null then
      foreach v_item in array regexp_split_to_array(v_service_text, '\s*[,;\n]\s*') loop
        continue when btrim(v_item) = '';
        select id into v_svc from public.services
         where organization_id = l.organization_id and lower(name) = lower(btrim(v_item)) and active;
        if v_svc.id is not null then
          insert into public.client_service_interests (client_id, service_id) values (v_client, v_svc.id) on conflict do nothing;
        else
          v_unmatched := v_unmatched || btrim(v_item);
        end if;
        v_svc := null;
      end loop;
      if array_length(v_unmatched, 1) > 0 then
        update public.clients set business_description = left('Serviços informados no formulário: ' || array_to_string(v_unmatched, ', '), 2000)
         where id = v_client;
      end if;
    end if;
    v_status := 'imported';
  end if;

  update public.lead_capture_links set use_count = use_count + 1,
         status = case when max_uses is not null and use_count + 1 >= max_uses then 'used'::public.link_status else status end
   where id = l.id;

  insert into public.form_submissions (organization_id, lead_capture_link_id, external_form_id, external_response_id,
    submitted_at, import_status, client_id, payload)
  values (l.organization_id, l.id, p_external_form_id, p_external_response_id, p_submitted_at, v_status, v_client,
    jsonb_build_object('nome_contato', left(p_fields ->> 'nome_contato', 120), 'nome_empresa', left(p_fields ->> 'nome_empresa', 160),
                       'email', left(p_fields ->> 'email', 254), 'whatsapp', left(p_fields ->> 'whatsapp', 40),
                       'instagram', left(p_fields ->> 'instagram', 120), 'servicos', left(p_fields ->> 'servicos', 1000)))
  returning id into v_sub;

  perform private.log_audit(l.organization_id, 'form_submission_' || v_status::text, 'form_submissions', v_sub, null,
    jsonb_build_object('client_id', v_client, 'seller_id', l.seller_id), 'integration');
  perform private.notify(l.organization_id, l.seller_id, 'form_submission_received',
    case when v_status = 'duplicate' then 'Resposta de formulário de cliente já cadastrado' else 'Novo cliente via formulário' end,
    left(coalesce(p_fields ->> 'nome_empresa', ''), 160) || ' — complete os dados comerciais.', 'clients', v_client);
  return jsonb_build_object('submission_id', v_sub, 'status', v_status, 'client_id', v_client);
end;
$$;

-- Expurgo de payloads brutos (minimização LGPD). Padrão: 90 dias.
create or replace function private.purge_form_payloads(p_days integer default 90)
returns integer
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.form_submissions set payload = null, payload_purged_at = now()
     where payload is not null and received_at < now() - make_interval(days => p_days)
    returning 1)
  select count(*)::int from u;
$$;

-- ----------------------------------------------------------------------------
-- Importação em lote (CSV/XLSX já parseado e validado no servidor)
-- ----------------------------------------------------------------------------
create or replace function public.import_clients_batch(
  p_rows jsonb, p_source text, p_file_name text, p_content_hash text, p_target_seller_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record; v_seller uuid; v_job uuid; v_row jsonb; v_idx int := 0; v_ok int := 0; v_bad int := 0;
  v_errors jsonb := '[]'::jsonb; v_dup uuid; v_total int;
begin
  select * into a from private.require_active_user();
  v_seller := private.resolve_seller(a, coalesce(p_target_seller_id, case when a.role = 'seller' then a.user_id end));
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Formato inválido' using errcode = '22023'; end if;
  v_total := jsonb_array_length(p_rows);
  if v_total = 0 or v_total > 1000 then raise exception 'Lote deve ter entre 1 e 1000 linhas' using errcode = '22023'; end if;
  if p_source not in ('csv', 'xlsx') then raise exception 'Origem inválida' using errcode = '22023'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then raise exception 'Hash inválido' using errcode = '22023'; end if;

  begin
    insert into public.import_jobs (organization_id, source, file_name, requested_by, target_seller_id, status, total_rows, content_hash)
    values (a.organization_id, p_source, left(p_file_name, 200), a.user_id, v_seller, 'processing', v_total, p_content_hash)
    returning id into v_job;
  exception when unique_violation then
    raise exception 'Este arquivo já foi importado para esta carteira' using errcode = '23505';
  end;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    begin
      v_dup := null;
      select c.id into v_dup from public.clients c
       where c.organization_id = a.organization_id and c.seller_id = v_seller
         and ((nullif(v_row ->> 'email', '') is not null and c.email = private.normalize_email(v_row ->> 'email'))
           or (nullif(v_row ->> 'whatsapp', '') is not null and c.whatsapp = private.normalize_phone_br(v_row ->> 'whatsapp')))
       limit 1;
      if v_dup is not null then
        raise exception 'Cliente já cadastrado nesta carteira';
      end if;
      perform private.insert_client(a.organization_id, v_seller, a.user_id,
        v_row || jsonb_build_object('lead_source', coalesce(nullif(v_row ->> 'lead_source', ''), 'importacao')), 'lead');
      v_ok := v_ok + 1;
    exception when others then
      v_bad := v_bad + 1;
      if jsonb_array_length(v_errors) < 200 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('row', v_idx, 'error', left(sqlerrm, 200)));
      end if;
    end;
  end loop;

  update public.import_jobs
     set accepted_rows = v_ok, rejected_rows = v_bad, errors = case when v_bad > 0 then v_errors end,
         status = case when v_bad = 0 then 'completed' when v_ok = 0 then 'failed' else 'completed_with_errors' end::public.import_job_status,
         finished_at = now()
   where id = v_job;
  perform private.log_audit(a.organization_id, 'clients_imported', 'import_jobs', v_job, null,
    jsonb_build_object('accepted', v_ok, 'rejected', v_bad, 'seller_id', v_seller), 'import');
  return jsonb_build_object('job_id', v_job, 'total', v_total, 'accepted', v_ok, 'rejected', v_bad, 'errors', v_errors);
end;
$$;
