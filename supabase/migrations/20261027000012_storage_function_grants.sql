-- =============================================================================
-- ONE CONTROL — 0012 Storage privado e permissões de execução das rotinas
-- =============================================================================

-- Bucket privado para contratos, propostas, comprovantes e notas.
-- Nenhuma policy é criada para anon/authenticated em storage.objects:
-- upload e download passam pelo servidor, que autoriza o registro vinculado
-- (file_attachments + RLS) e usa URLs assinadas de curta duração.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Registro de anexo (chamado pelo servidor após upload autorizado).
create or replace function public.register_attachment(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid; v_org uuid; v_role public.user_role; v_id uuid; v_ok boolean := false;
begin
  -- Aceita service_role atuando em nome do usuário informado (já autenticado pelo servidor).
  if not private.is_service_role() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select id, organization_id, role into v_uid, v_org, v_role from public.profiles
   where id = (p ->> 'uploaded_by')::uuid and status = 'active';
  if v_uid is null then raise exception 'Usuário inválido' using errcode = '42501'; end if;
  -- Revalida a autorização sobre o recurso vinculado com o escopo do usuário.
  v_ok := case
    when v_role = 'admin' then true
    when nullif(p ->> 'client_id', '') is not null then exists (select 1 from public.clients where id = (p ->> 'client_id')::uuid and seller_id = v_uid)
    when nullif(p ->> 'contract_id', '') is not null then exists (select 1 from public.contracts where id = (p ->> 'contract_id')::uuid and seller_id = v_uid)
    when nullif(p ->> 'payable_id', '') is not null then exists (select 1 from public.payables where id = (p ->> 'payable_id')::uuid
                                                                  and requested_by = v_uid and kind = 'expense')
    else false end;
  if not v_ok then raise exception 'Sem permissão sobre o recurso vinculado' using errcode = '42501'; end if;
  insert into public.file_attachments (organization_id, bucket, object_path, original_filename, mime_type, size_bytes, sha256,
    uploaded_by, client_id, project_id, contract_id, payable_id, receivable_id)
  values (v_org, 'documents', p ->> 'object_path', left(p ->> 'original_filename', 200), p ->> 'mime_type',
    (p ->> 'size_bytes')::bigint, p ->> 'sha256', v_uid,
    nullif(p ->> 'client_id', '')::uuid, nullif(p ->> 'project_id', '')::uuid, nullif(p ->> 'contract_id', '')::uuid,
    nullif(p ->> 'payable_id', '')::uuid, nullif(p ->> 'receivable_id', '')::uuid)
  returning id into v_id;
  -- Garante que todos os vínculos são da mesma organização.
  if exists (select 1 from public.file_attachments f
              left join public.clients c on c.id = f.client_id
              left join public.projects pr on pr.id = f.project_id
              left join public.contracts k on k.id = f.contract_id
              left join public.payables pa on pa.id = f.payable_id
              left join public.receivables r on r.id = f.receivable_id
             where f.id = v_id and coalesce(c.organization_id, pr.organization_id, k.organization_id, pa.organization_id, r.organization_id) <> v_org) then
    raise exception 'Recurso de outra organização' using errcode = '42501';
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, new_values, source)
  values (v_org, v_uid, 'attachment_uploaded', 'file_attachments', v_id,
          jsonb_build_object('mime_type', p ->> 'mime_type', 'size_bytes', p ->> 'size_bytes'), 'app');
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- EXECUTE: nada para anon; rotinas de usuário para authenticated; rotinas de
-- integração/cron somente para service_role.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function
  private.current_organization_id(), private.is_active_user(), private.is_active_admin(), private.is_active_seller()
to authenticated, service_role;

grant execute on function
  public.create_user_invitation(text, text, public.user_role),
  public.activate_own_profile(),
  public.revoke_user_invitation(uuid),
  public.admin_set_user_status(uuid, public.profile_status, text),
  public.admin_set_user_role(uuid, public.user_role, text),
  public.touch_last_active(),
  public.create_client(jsonb),
  public.set_client_status(uuid, public.client_status),
  public.transfer_client(uuid, uuid, text),
  public.create_lead_capture_link(text, integer, integer, uuid),
  public.revoke_lead_capture_link(uuid),
  public.import_clients_batch(jsonb, text, text, text, uuid),
  public.calculate_commission_estimate(public.sale_origin, numeric),
  public.create_contract(jsonb),
  public.update_contract_draft(uuid, jsonb),
  public.submit_contract(uuid),
  public.approve_contract(uuid, date),
  public.reject_contract(uuid, text),
  public.amend_contract(uuid, jsonb),
  public.cancel_contract(uuid, text),
  public.activate_commission_policy(uuid),
  public.approve_commissions(uuid[]),
  public.cancel_commission(uuid, text),
  public.pay_commissions(uuid, uuid, jsonb, timestamptz, text),
  public.create_receivable(jsonb),
  public.cancel_receivable(uuid, text),
  public.generate_due_receivables(date),
  public.confirm_receipt(uuid, uuid, numeric, public.payment_method, timestamptz, text, text),
  public.reverse_receipt(uuid, text),
  public.request_expense(jsonb),
  public.register_payable(public.payable_kind, jsonb),
  public.approve_expense(uuid),
  public.reject_expense(uuid, text),
  public.cancel_payable(uuid, text),
  public.confirm_outgoing_payment(uuid, uuid, numeric, public.payment_method, timestamptz, text),
  public.reverse_outgoing_payment(uuid, text),
  public.transfer_between_accounts(uuid, uuid, numeric, timestamptz, text),
  public.get_cash_balances(),
  public.admin_financial_summary(date, date),
  public.admin_monthly_cash_series(integer),
  public.cash_flow_projection(integer, uuid),
  public.seller_dashboard(date, date),
  public.data_subject_lookup(text, text)
to authenticated;

grant execute on function
  public.provision_invited_profile(uuid, uuid),
  public.ingest_form_submission(text, text, text, timestamptz, jsonb),
  public.generate_due_receivables(date),
  public.run_daily_jobs(),
  public.register_attachment(jsonb)
to service_role;
