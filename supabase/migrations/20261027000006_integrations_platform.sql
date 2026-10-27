-- =============================================================================
-- ONE CONTROL — 0006 Captação (Google Forms), importações, idempotência,
-- eventos de integração, anexos, notificações e configurações
-- =============================================================================

create table public.lead_capture_links (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id),
  seller_id        uuid not null references public.profiles (id),
  form_provider    text not null default 'google_forms' check (form_provider in ('google_forms')),
  external_form_id text null check (external_form_id is null or length(external_form_id) <= 200),
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label            text null check (label is null or length(label) <= 120),
  status           public.link_status not null default 'active',
  max_uses         integer null check (max_uses is null or max_uses > 0),
  use_count        integer not null default 0 check (use_count >= 0),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz null,
  check ((status = 'revoked') = (revoked_at is not null))
);
create index idx_lead_links_seller on public.lead_capture_links (seller_id, status);
create index idx_lead_links_org on public.lead_capture_links (organization_id, status);

create table public.form_submissions (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id),
  lead_capture_link_id uuid null references public.lead_capture_links (id),
  external_form_id     text not null check (length(external_form_id) <= 200),
  external_response_id text not null check (length(external_response_id) <= 200),
  received_at          timestamptz not null default now(),
  submitted_at         timestamptz null,
  import_status        public.import_status not null default 'received',
  client_id            uuid null references public.clients (id),
  validation_errors    jsonb null,
  -- Payload mínimo normalizado (sem tokens). Retenção: ver private.purge_form_payloads.
  payload              jsonb null,
  payload_purged_at    timestamptz null,
  created_at           timestamptz not null default now(),
  unique (external_form_id, external_response_id)
);
create index idx_form_submissions_link on public.form_submissions (lead_capture_link_id);
create index idx_form_submissions_client on public.form_submissions (client_id);
create index idx_form_submissions_org_status on public.form_submissions (organization_id, import_status, received_at);

create table public.import_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  source          text not null check (source in ('csv', 'xlsx', 'google_forms')),
  file_name       text null check (file_name is null or length(file_name) <= 200),
  requested_by    uuid not null references public.profiles (id),
  target_seller_id uuid null references public.profiles (id),
  status          public.import_job_status not null default 'pending',
  total_rows      integer not null default 0 check (total_rows >= 0),
  accepted_rows   integer not null default 0 check (accepted_rows >= 0),
  rejected_rows   integer not null default 0 check (rejected_rows >= 0),
  errors          jsonb null,
  content_hash    text null check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz null,
  created_at      timestamptz not null default now(),
  check (accepted_rows + rejected_rows <= total_rows)
);
create index idx_import_jobs_org on public.import_jobs (organization_id, created_at desc);
create index idx_import_jobs_requested_by on public.import_jobs (requested_by);
create index idx_import_jobs_target on public.import_jobs (target_seller_id);
-- O mesmo arquivo não é importado duas vezes com sucesso para o mesmo destino.
create unique index uq_import_jobs_content on public.import_jobs (organization_id, content_hash, target_seller_id)
  where content_hash is not null and status in ('completed', 'completed_with_errors', 'processing');

create table public.idempotency_keys (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid null references public.organizations (id),
  scope            text not null check (length(scope) <= 80),
  key_hash         text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  request_hash     text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status           text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  result_reference text null check (result_reference is null or length(result_reference) <= 200),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  unique (scope, key_hash)
);
create index idx_idempotency_expires on public.idempotency_keys (expires_at);
create index idx_idempotency_org on public.idempotency_keys (organization_id);

create table public.integration_events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null check (provider in ('google_forms')),
  external_event_id text not null check (length(external_event_id) <= 200),
  payload_hash      text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status            text not null default 'received' check (status in ('received', 'processed', 'rejected', 'failed')),
  attempts          integer not null default 1 check (attempts >= 1),
  last_error        text null check (last_error is null or length(last_error) <= 1000),
  received_at       timestamptz not null default now(),
  processed_at      timestamptz null,
  unique (provider, external_event_id)
);
create index idx_integration_events_status on public.integration_events (provider, status, received_at);

-- ----------------------------------------------------------------------------
-- Anexos (Storage privado). Exatamente um vínculo de recurso por anexo.
-- ----------------------------------------------------------------------------
create table public.file_attachments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id),
  bucket            text not null default 'documents' check (bucket = 'documents'),
  object_path       text not null unique check (length(object_path) <= 400 and object_path !~ '\.\.'),
  original_filename text not null check (length(original_filename) between 1 and 200),
  mime_type         text not null check (mime_type in (
                      'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv')),
  size_bytes        bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256            text null check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by       uuid not null references public.profiles (id),
  client_id         uuid null references public.clients (id),
  project_id        uuid null references public.projects (id),
  contract_id       uuid null references public.contracts (id),
  payable_id        uuid null references public.payables (id),
  receivable_id     uuid null references public.receivables (id),
  created_at        timestamptz not null default now(),
  constraint ck_attachment_single_link check (num_nonnulls(client_id, project_id, contract_id, payable_id, receivable_id) = 1)
);
create index idx_attachments_client on public.file_attachments (client_id);
create index idx_attachments_project on public.file_attachments (project_id);
create index idx_attachments_contract on public.file_attachments (contract_id);
create index idx_attachments_payable on public.file_attachments (payable_id);
create index idx_attachments_receivable on public.file_attachments (receivable_id);
create index idx_attachments_uploaded_by on public.file_attachments (uploaded_by);
create index idx_attachments_org on public.file_attachments (organization_id);
create trigger trg_attachments_immutable before update on public.file_attachments
  for each row execute function private.forbid_mutation();

-- ----------------------------------------------------------------------------
-- Notificações internas
-- ----------------------------------------------------------------------------
create table public.notifications (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id),
  recipient_user_id uuid not null references public.profiles (id),
  type              public.notification_type not null,
  title             text not null check (length(title) between 1 and 160),
  message           text not null check (length(message) <= 1000),
  entity_type       text null check (entity_type is null or length(entity_type) <= 60),
  entity_id         uuid null,
  dedupe_key        text null check (dedupe_key is null or length(dedupe_key) <= 200),
  read_at           timestamptz null,
  created_at        timestamptz not null default now()
);
create index idx_notifications_recipient on public.notifications (recipient_user_id, read_at, created_at desc);
create index idx_notifications_org on public.notifications (organization_id);
create unique index uq_notifications_dedupe on public.notifications (recipient_user_id, dedupe_key)
  where dedupe_key is not null;

-- Destinatário só pode marcar como lida.
create or replace function private.notifications_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recipient_user_id <> old.recipient_user_id or new.title <> old.title or new.message <> old.message
     or new.type <> old.type or new.organization_id <> old.organization_id
     or new.entity_id is distinct from old.entity_id then
    raise exception 'Apenas read_at pode ser alterado' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_notifications_guard before update on public.notifications
  for each row execute function private.notifications_guard();

create or replace function private.notify(
  p_org uuid, p_recipient uuid, p_type public.notification_type, p_title text, p_message text,
  p_entity_type text default null, p_entity_id uuid default null, p_dedupe_key text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (organization_id, recipient_user_id, type, title, message,
                                    entity_type, entity_id, dedupe_key)
  values (p_org, p_recipient, p_type, left(p_title, 160), left(p_message, 1000),
          p_entity_type, p_entity_id, p_dedupe_key)
  on conflict (recipient_user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function private.notify_admins(
  p_org uuid, p_type public.notification_type, p_title text, p_message text,
  p_entity_type text default null, p_entity_id uuid default null, p_dedupe_key text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select id from public.profiles
           where organization_id = p_org and role = 'admin' and status = 'active' loop
    perform private.notify(p_org, r.id, p_type, p_title, p_message, p_entity_type, p_entity_id, p_dedupe_key);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Configurações (sem segredos)
-- ----------------------------------------------------------------------------
create table public.system_settings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  setting_key     text not null check (setting_key ~ '^[a-z0-9_.]{2,80}$'),
  setting_value   jsonb not null,
  updated_by      uuid null references public.profiles (id),
  updated_at      timestamptz not null default now(),
  unique (organization_id, setting_key),
  constraint ck_settings_no_secrets check (setting_key !~ '(secret|token|password|api_key|private_key)')
);
create index idx_system_settings_updated_by on public.system_settings (updated_by);
create trigger trg_system_settings_updated before update on public.system_settings
  for each row execute function private.set_updated_at();
create trigger trg_system_settings_audit after insert or update on public.system_settings
  for each row execute function private.audit_row_change();
