-- =============================================================================
-- ONE CONTROL — 0021 Kit do cliente (setor de produção, fase 5)
-- =============================================================================
-- Página objetiva com o necessário para produzir: atividade, posicionamento,
-- público, cores, fontes, restrições, orientações de aprovação, contato
-- operacional e links para logos/fotos/vídeos/músicas/documentos autorizados.
--  * Sem dados comerciais (contrato, valores, CNPJ, e-mail/WhatsApp do
--    cadastro): o kit é uma ficha separada do cadastro do cliente.
--  * Leitura: administração, vendedor responsável pelo cliente e quem tem
--    trabalho visível naquele cliente (T05). Demais clientes: nada (T06).
--  * Edição: administração e vendedor responsável pelo cliente.
--  * Arquivos ficam no armazenamento autorizado (Drive etc.): o kit guarda
--    links https; o app não contorna as permissões desses serviços.
-- =============================================================================

create type public.kit_asset_kind as enum ('logo', 'font', 'photo', 'video', 'music', 'document', 'template', 'reference');

create table public.client_kits (
  client_id           uuid primary key references public.clients (id),
  organization_id     uuid not null references public.organizations (id),
  activity            text null check (activity is null or length(activity) <= 300),
  positioning         text null check (positioning is null or length(positioning) <= 1500),
  audience            text null check (audience is null or length(audience) <= 1000),
  colors              jsonb not null default '[]'::jsonb check (jsonb_typeof(colors) = 'array' and jsonb_array_length(colors) <= 12),
  fonts               text null check (fonts is null or length(fonts) <= 500),
  restrictions        text null check (restrictions is null or length(restrictions) <= 2000),
  image_rules         text null check (image_rules is null or length(image_rules) <= 1000),
  approval_notes      text null check (approval_notes is null or length(approval_notes) <= 1000),
  operational_contact text null check (operational_contact is null or length(operational_contact) <= 300),
  updated_by          uuid not null references public.profiles (id),
  updated_at          timestamptz not null default now()
);
create index idx_client_kits_org on public.client_kits (organization_id);
create index idx_client_kits_updated_by on public.client_kits (updated_by);

create table public.client_kit_assets (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id),
  organization_id uuid not null references public.organizations (id),
  kind            public.kit_asset_kind not null,
  label           text not null check (length(btrim(label)) between 1 and 160),
  url             text not null check (url ~ '^https://[^\s]+$' and length(url) <= 2000),
  note            text null check (note is null or length(note) <= 500),
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  removed_at      timestamptz null,
  removed_by      uuid null references public.profiles (id)
);
create index idx_kit_assets_client on public.client_kit_assets (client_id, kind) where removed_at is null;
create index idx_kit_assets_org on public.client_kit_assets (organization_id);
create index idx_kit_assets_created_by on public.client_kit_assets (created_by);
create index idx_kit_assets_removed_by on public.client_kit_assets (removed_by);

-- Quem pode ler o kit de um cliente.
create or replace function private.can_view_client_kit(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clients c
     where c.id = p_client and c.organization_id = (select private.current_organization_id())
       and ((select private.is_active_admin()) or c.seller_id = (select auth.uid())
            or exists (select 1 from public.works w where w.client_id = c.id and private.can_view_work(w.id))));
$$;
revoke all on function private.can_view_client_kit(uuid) from public;
grant execute on function private.can_view_client_kit(uuid) to authenticated, service_role;

-- Quem pode editar: administração ou vendedor responsável (área comercial).
create or replace function private.require_kit_editor(p_client uuid, out user_id uuid, out organization_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record;
begin
  select * into a from private.require_commercial_user();
  if not exists (select 1 from public.clients c where c.id = p_client and c.organization_id = a.organization_id
                  and (a.role::text = 'admin' or c.seller_id = a.user_id)) then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  user_id := a.user_id; organization_id := a.organization_id;
end;
$$;
revoke all on function private.require_kit_editor(uuid) from public;

alter table public.client_kits enable row level security;
alter table public.client_kit_assets enable row level security;
revoke all on public.client_kits, public.client_kit_assets from anon, authenticated;
grant select on public.client_kits, public.client_kit_assets to authenticated;
create policy client_kits_select on public.client_kits for select to authenticated using ((select private.can_view_client_kit(client_id)));
create policy client_kit_assets_select on public.client_kit_assets for select to authenticated using ((select private.can_view_client_kit(client_id)));

create or replace function public.save_client_kit(p_client uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare e record; c jsonb; v_colors jsonb := coalesce(p -> 'colors', '[]'::jsonb);
begin
  select * into e from private.require_kit_editor(p_client);
  if jsonb_typeof(v_colors) <> 'array' or jsonb_array_length(v_colors) > 12 then
    raise exception 'Máximo de 12 cores' using errcode = '22023';
  end if;
  for c in select * from jsonb_array_elements(v_colors) loop
    if coalesce(c ->> 'hex', '') !~ '^#[0-9A-Fa-f]{6}$' or length(coalesce(c ->> 'name', '')) > 40 then
      raise exception 'Cor inválida (use o formato #RRGGBB)' using errcode = '22023';
    end if;
  end loop;
  insert into public.client_kits as k (client_id, organization_id, activity, positioning, audience, colors, fonts, restrictions,
    image_rules, approval_notes, operational_contact, updated_by)
  values (p_client, e.organization_id, private.text_or_null(p, 'activity', 300), private.text_or_null(p, 'positioning', 1500),
    private.text_or_null(p, 'audience', 1000), v_colors, private.text_or_null(p, 'fonts', 500), private.text_or_null(p, 'restrictions', 2000),
    private.text_or_null(p, 'image_rules', 1000), private.text_or_null(p, 'approval_notes', 1000),
    private.text_or_null(p, 'operational_contact', 300), e.user_id)
  on conflict (client_id) do update set
    activity = excluded.activity, positioning = excluded.positioning, audience = excluded.audience, colors = excluded.colors,
    fonts = excluded.fonts, restrictions = excluded.restrictions, image_rules = excluded.image_rules,
    approval_notes = excluded.approval_notes, operational_contact = excluded.operational_contact,
    updated_by = excluded.updated_by, updated_at = now();
  perform private.log_audit(e.organization_id, 'client_kit_saved', 'clients', p_client);
end;
$$;

create or replace function public.add_client_kit_asset(p_client uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare e record; v_id uuid; v_url text := btrim(coalesce(p ->> 'url', ''));
begin
  select * into e from private.require_kit_editor(p_client);
  if v_url !~ '^https://[^\s]+$' or length(v_url) > 2000 then raise exception 'Informe um link https:// válido' using errcode = '22023'; end if;
  insert into public.client_kit_assets (client_id, organization_id, kind, label, url, note, created_by)
  values (p_client, e.organization_id, (p ->> 'kind')::public.kit_asset_kind, btrim(p ->> 'label'), v_url, private.text_or_null(p, 'note', 500), e.user_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.remove_client_kit_asset(p_asset uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare x record; e record;
begin
  select * into x from public.client_kit_assets where id = p_asset for update;
  if x.id is null then raise exception 'Material não encontrado' using errcode = 'P0002'; end if;
  select * into e from private.require_kit_editor(x.client_id);
  if x.removed_at is null then update public.client_kit_assets set removed_at = now(), removed_by = e.user_id where id = x.id; end if;
end;
$$;

revoke execute on function public.save_client_kit(uuid, jsonb), public.add_client_kit_asset(uuid, jsonb), public.remove_client_kit_asset(uuid) from public, anon;
grant execute on function public.save_client_kit(uuid, jsonb), public.add_client_kit_asset(uuid, jsonb), public.remove_client_kit_asset(uuid) to authenticated;
