-- =============================================================================
-- ONE CONTROL — 0015 Notificações push (Web Push / PWA)
-- =============================================================================
-- * Cada dispositivo do colaborador registra uma inscrição (endpoint + chaves
--   públicas do navegador). Só o próprio usuário cria/remove as suas.
-- * O envio é feito pelo servidor (service_role) com chaves VAPID que nunca
--   saem do servidor. claim_push_batch reserva as notificações pendentes de
--   forma atômica (FOR UPDATE SKIP LOCKED): execuções paralelas não duplicam.
-- * Colaborador inativo não recebe push (filtro no claim).
-- =============================================================================

alter table public.notifications add column if not exists push_sent_at timestamptz null;
create index if not exists idx_notifications_push_pending on public.notifications (created_at)
  where push_sent_at is null;

create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  endpoint        text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh          text not null check (p256dh ~ '^[A-Za-z0-9_-]{40,200}={0,2}$'),
  auth            text not null check (auth ~ '^[A-Za-z0-9_-]{10,60}={0,2}$'),
  user_agent      text null check (user_agent is null or length(user_agent) <= 300),
  failure_count   integer not null default 0 check (failure_count >= 0),
  last_used_at    timestamptz null,
  created_at      timestamptz not null default now()
);
create index idx_push_subscriptions_user on public.push_subscriptions (user_id);
create index idx_push_subscriptions_org on public.push_subscriptions (organization_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select (id, user_agent, created_at, last_used_at) on public.push_subscriptions to authenticated;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()));

-- Registro/atualização da inscrição do dispositivo atual (máx. 10 por pessoa).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record;
begin
  select * into a from private.require_active_user();
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'Inscrição de notificação inválida' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (organization_id, user_id, endpoint, p256dh, auth, user_agent)
  values (a.organization_id, a.user_id, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, organization_id = excluded.organization_id, p256dh = excluded.p256dh,
        auth = excluded.auth, user_agent = excluded.user_agent, failure_count = 0;
  -- Mantém apenas os 10 dispositivos mais recentes.
  delete from public.push_subscriptions
   where user_id = a.user_id
     and id not in (select id from public.push_subscriptions where user_id = a.user_id order by created_at desc limit 10);
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a record;
begin
  select * into a from private.require_active_user();
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = a.user_id;
end;
$$;

-- Reserva notificações pendentes e devolve uma linha por dispositivo de destino.
create or replace function public.claim_push_batch(p_limit integer default 100)
returns table (notification_id uuid, subscription_id uuid, endpoint text, p256dh text, auth text,
               type public.notification_type, title text, message text, entity_type text, entity_id uuid,
               recipient_role public.user_role)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service_role() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  return query
  with picked as (
    select n.id from public.notifications n
     where n.push_sent_at is null and n.read_at is null and n.created_at > now() - interval '24 hours'
     order by n.created_at
     limit least(greatest(coalesce(p_limit, 100), 1), 500)
     for update of n skip locked
  ), done as (
    update public.notifications n set push_sent_at = now()
      from picked where n.id = picked.id
    returning n.id, n.recipient_user_id, n.type, n.title, n.message, n.entity_type, n.entity_id
  )
  select d.id, s.id, s.endpoint, s.p256dh, s.auth, d.type, d.title, d.message, d.entity_type, d.entity_id, p.role
    from done d
    join public.profiles p on p.id = d.recipient_user_id and p.status = 'active'
    join public.push_subscriptions s on s.user_id = d.recipient_user_id;
end;
$$;

-- Resultado do envio: 404/410 = inscrição expirada (remove); falhas repetidas também.
create or replace function public.report_push_result(p_subscription_id uuid, p_status integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service_role() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_status between 200 and 299 then
    update public.push_subscriptions set failure_count = 0, last_used_at = now() where id = p_subscription_id;
  elsif p_status in (404, 410) then
    delete from public.push_subscriptions where id = p_subscription_id;
  else
    update public.push_subscriptions set failure_count = failure_count + 1 where id = p_subscription_id;
    delete from public.push_subscriptions where id = p_subscription_id and failure_count >= 5;
  end if;
end;
$$;

revoke execute on function
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text),
  public.claim_push_batch(integer), public.report_push_result(uuid, integer)
from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) to authenticated;
grant execute on function public.claim_push_batch(integer), public.report_push_result(uuid, integer) to service_role;
