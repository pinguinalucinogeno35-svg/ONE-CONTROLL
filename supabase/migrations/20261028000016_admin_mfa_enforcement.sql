-- =============================================================================
-- ONE CONTROL — 0016 MFA obrigatório para administradores TAMBÉM no banco
-- =============================================================================
-- Até aqui o MFA dos administradores era exigido só pelo app (Next.js). Quem
-- obtivesse a senha (ou um link de recuperação) de um administrador poderia
-- chamar a API do Supabase diretamente, sem o segundo fator. Agora:
--  * administrador só é reconhecido como tal com sessão AAL2 (MFA verificado);
--  * com sessão AAL1 ele não lê dados por RLS nem executa rotinas;
--  * continua podendo ler o próprio perfil (o app precisa disso para levá-lo à
--    tela de MFA) e cadastrar/verificar o fator pela API de Auth do Supabase.
-- Vendedores não mudam (MFA opcional para eles).
-- =============================================================================

create or replace function private.session_mfa_ok()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

-- Organização da sessão: administrador sem MFA não "pertence" a nenhuma (bloqueia
-- todas as políticas por organização, inclusive catálogos e configurações).
create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active'
    and (p.role <> 'admin' or private.session_mfa_ok());
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.organizations o on o.id = p.organization_id and o.status = 'active'
    where p.id = (select auth.uid()) and p.status = 'active'
      and (p.role <> 'admin' or private.session_mfa_ok()));
$$;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.organizations o on o.id = p.organization_id and o.status = 'active'
    where p.id = (select auth.uid()) and p.status = 'active' and p.role = 'admin')
    and private.session_mfa_ok();
$$;

create or replace function private.require_active_user(out user_id uuid, out organization_id uuid, out role public.user_role)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select p.id, p.organization_id, p.role
    into user_id, organization_id, role
  from public.profiles p
  join public.organizations o on o.id = p.organization_id and o.status = 'active'
  where p.id = (select auth.uid()) and p.status = 'active';
  if user_id is null then
    raise exception 'Acesso negado: usuário não autenticado ou inativo' using errcode = '42501';
  end if;
  if role = 'admin' and not private.session_mfa_ok() then
    raise exception 'Acesso negado: administradores precisam confirmar o MFA' using errcode = '42501';
  end if;
end;
$$;

-- O próprio perfil continua legível (o app o usa para encaminhar ao MFA).
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid())
         or (organization_id = (select private.current_organization_id()) and (select private.is_active_admin())));

revoke execute on function private.session_mfa_ok() from public, anon, authenticated;
