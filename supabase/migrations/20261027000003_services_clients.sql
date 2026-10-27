-- =============================================================================
-- ONE CONTROL — 0003 Catálogo de serviços, clientes, interesses e transferências
-- =============================================================================

create table public.services (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name            text not null check (length(btrim(name)) between 2 and 120),
  description     text null check (description is null or length(description) <= 2000),
  category        text null check (category is null or length(category) <= 80),
  service_type    public.service_type not null default 'one_time',
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index uq_services_org_name on public.services (organization_id, lower(name));
create trigger trg_services_updated before update on public.services
  for each row execute function private.set_updated_at();
create trigger trg_services_audit after insert or update on public.services
  for each row execute function private.audit_row_change();

create table public.clients (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id),
  seller_id            uuid not null references public.profiles (id),
  contact_name         text not null check (length(btrim(contact_name)) between 2 and 120),
  company_name         text not null check (length(btrim(company_name)) between 1 and 160),
  email                text null check (email is null or (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254)),
  whatsapp             text null check (whatsapp is null or whatsapp ~ '^\+\d{8,15}$'),
  instagram            text null check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$'),
  website              text null check (website is null or (length(website) <= 300 and website ~* '^https?://')),
  tax_id               text null check (tax_id is null or tax_id ~ '^\d{11}$|^\d{14}$'),
  business_description text null check (business_description is null or length(business_description) <= 2000),
  lead_source          text null check (lead_source is null or length(lead_source) <= 80),
  status               public.client_status not null default 'pending_completion',
  registered_by        uuid null references public.profiles (id),
  original_seller_id   uuid not null references public.profiles (id),
  possible_duplicate_of uuid null references public.clients (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz null,
  constraint ck_clients_archived check ((status = 'archived') = (archived_at is not null))
);
create index idx_clients_seller on public.clients (seller_id);
create index idx_clients_org_status on public.clients (organization_id, status);
create index idx_clients_org_email on public.clients (organization_id, email) where email is not null;
create index idx_clients_org_whatsapp on public.clients (organization_id, whatsapp) where whatsapp is not null;
create index idx_clients_org_taxid on public.clients (organization_id, tax_id) where tax_id is not null;
create index idx_clients_original_seller on public.clients (original_seller_id);
create index idx_clients_registered_by on public.clients (registered_by);
create index idx_clients_dup on public.clients (possible_duplicate_of) where possible_duplicate_of is not null;
create trigger trg_clients_updated before update on public.clients
  for each row execute function private.set_updated_at();

-- Normaliza contatos e valida CNPJ/CPF em qualquer caminho de escrita.
create or replace function private.clients_normalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := private.normalize_email(new.email);
  if new.whatsapp is not null and new.whatsapp !~ '^\+\d{8,15}$' then
    new.whatsapp := private.normalize_phone_br(new.whatsapp);
  end if;
  new.instagram := private.normalize_instagram(new.instagram);
  if new.tax_id is not null then
    new.tax_id := nullif(regexp_replace(new.tax_id, '\D', '', 'g'), '');
    if new.tax_id is not null and not private.is_valid_tax_id(new.tax_id) then
      raise exception 'CNPJ/CPF inválido' using errcode = '22023';
    end if;
  end if;
  new.contact_name := btrim(new.contact_name);
  new.company_name := btrim(new.company_name);
  return new;
end;
$$;
create trigger trg_clients_normalize before insert or update on public.clients
  for each row execute function private.clients_normalize();

-- Vendedor não pode trocar responsável, organização, vendedor original nem
-- status de arquivamento por UPDATE direto. Transferência = rotina auditada.
create or replace function private.clients_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id or new.original_seller_id <> old.original_seller_id
     or new.registered_by is distinct from old.registered_by then
    raise exception 'Campos de origem do cliente são imutáveis' using errcode = '42501';
  end if;
  if new.seller_id <> old.seller_id and current_setting('one.client_transfer', true) is distinct from 'on' then
    raise exception 'Use a operação de transferência de carteira' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_clients_guard before update on public.clients
  for each row execute function private.clients_guard();

create table public.client_service_interests (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete cascade,
  service_id uuid not null references public.services (id),
  notes      text null check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (client_id, service_id)
);
create index idx_csi_service on public.client_service_interests (service_id);

create table public.client_transfers (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients (id),
  previous_seller_id uuid not null references public.profiles (id),
  new_seller_id      uuid not null references public.profiles (id),
  reason             text not null check (length(btrim(reason)) between 3 and 500),
  transferred_by     uuid not null references public.profiles (id),
  transferred_at     timestamptz not null default now(),
  check (previous_seller_id <> new_seller_id)
);
create index idx_client_transfers_client on public.client_transfers (client_id);
create index idx_client_transfers_prev on public.client_transfers (previous_seller_id);
create index idx_client_transfers_new on public.client_transfers (new_seller_id);
create index idx_client_transfers_by on public.client_transfers (transferred_by);
create trigger trg_client_transfers_immutable before update or delete on public.client_transfers
  for each row execute function private.forbid_mutation();
