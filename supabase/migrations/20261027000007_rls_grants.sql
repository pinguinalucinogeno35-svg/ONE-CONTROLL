-- =============================================================================
-- ONE CONTROL — 0007 Grants e Row Level Security
-- =============================================================================
-- Modelo:
--  1. anon não tem acesso a nenhuma tabela.
--  2. authenticated recebe SELECT (filtrado por RLS) e apenas as colunas de
--     escrita estritamente necessárias. Toda escrita financeira/comercial
--     sensível passa por funções transacionais (migration 0008).
--  3. Policies combinam: organização do usuário + perfil ativo + escopo
--     (admin vê a organização; vendedor vê a própria carteira).
--  4. Helpers private.* são SECURITY DEFINER e consultados via (select ...)
--     para serem avaliados uma vez por consulta (initPlan).
-- =============================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- SELECT básico (as policies restringem as linhas).
grant select on
  public.organizations, public.profiles, public.user_invitations, public.audit_logs,
  public.services, public.clients, public.client_service_interests, public.client_transfers,
  public.commission_policies, public.projects, public.project_tasks, public.contracts,
  public.contract_services, public.contract_versions, public.contract_referrals,
  public.financial_categories, public.cash_accounts, public.cash_movements,
  public.billing_schedules, public.receivables, public.receipts, public.payables,
  public.outgoing_payments, public.financial_adjustments, public.commission_entitlements,
  public.commission_payouts, public.commission_payout_items, public.lead_capture_links,
  public.form_submissions, public.import_jobs, public.integration_events,
  public.file_attachments, public.notifications, public.system_settings
to authenticated;

-- Escritas diretas permitidas (por coluna).
grant update (full_name, phone, avatar_path) on public.profiles to authenticated;
grant update (contact_name, company_name, email, whatsapp, instagram, website, tax_id,
              business_description, lead_source) on public.clients to authenticated;
grant insert (client_id, service_id, notes) on public.client_service_interests to authenticated;
grant delete on public.client_service_interests to authenticated;
grant insert (organization_id, name, description, category, service_type, active),
      update (name, description, category, service_type, active) on public.services to authenticated;
grant insert (organization_id, name, kind, parent_id, active),
      update (name, parent_id, active) on public.financial_categories to authenticated;
grant insert (organization_id, name, account_type, opening_balance, opening_date, active),
      update (name, account_type, opening_balance, opening_date, active) on public.cash_accounts to authenticated;
grant insert (organization_id, client_id, name, description, status, start_date, due_date, manager_id, created_by),
      update (name, description, status, start_date, due_date, delivered_at, manager_id) on public.projects to authenticated;
grant insert (project_id, title, description, assigned_to, status, priority, due_date, completed_at),
      update (title, description, assigned_to, status, priority, due_date, completed_at) on public.project_tasks to authenticated;
grant insert (organization_id, name, direct_rate_bps, referral_rate_bps, second_level_rate_bps, base_rule,
              trigger_rule, recurring_limit_months, requires_approval, refunds_reverse, effective_from,
              effective_until, notes),
      update (name, direct_rate_bps, referral_rate_bps, second_level_rate_bps, base_rule, trigger_rule,
              recurring_limit_months, requires_approval, refunds_reverse, effective_from, effective_until, notes)
      on public.commission_policies to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert (organization_id, setting_key, setting_value, updated_by),
      update (setting_value, updated_by) on public.system_settings to authenticated;

-- ----------------------------------------------------------------------------
-- organizations / profiles / convites / auditoria
-- ----------------------------------------------------------------------------
create policy organizations_select on public.organizations for select to authenticated
  using (id = (select private.current_organization_id()));

create policy profiles_select on public.profiles for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin()) or id = (select auth.uid())));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select private.is_active_user()))
  with check (id = (select auth.uid()));

create policy invitations_select_admin on public.user_invitations for select to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()));

create policy audit_select_admin on public.audit_logs for select to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()));

-- ----------------------------------------------------------------------------
-- Catálogos (leitura para usuários ativos; escrita apenas admin)
-- ----------------------------------------------------------------------------
create policy services_select on public.services for select to authenticated
  using (organization_id = (select private.current_organization_id()));
create policy services_insert_admin on public.services for insert to authenticated
  with check (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()));
create policy services_update_admin on public.services for update to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()))
  with check (organization_id = (select private.current_organization_id()));

create policy fin_categories_select on public.financial_categories for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin()) or kind = 'expense'));
create policy fin_categories_insert_admin on public.financial_categories for insert to authenticated
  with check (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()));
create policy fin_categories_update_admin on public.financial_categories for update to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()))
  with check (organization_id = (select private.current_organization_id()));

create policy commission_policies_select on public.commission_policies for select to authenticated
  using (organization_id = (select private.current_organization_id()));
create policy commission_policies_insert_admin on public.commission_policies for insert to authenticated
  with check (organization_id = (select private.current_organization_id()) and (select private.is_active_admin())
              and status = 'draft');
create policy commission_policies_update_admin on public.commission_policies for update to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin())
         and status = 'draft')
  with check (organization_id = (select private.current_organization_id()));

create policy system_settings_select on public.system_settings for select to authenticated
  using (organization_id = (select private.current_organization_id()));
create policy system_settings_insert_admin on public.system_settings for insert to authenticated
  with check (organization_id = (select private.current_organization_id()) and (select private.is_active_admin())
              and updated_by = (select auth.uid()));
create policy system_settings_update_admin on public.system_settings for update to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()))
  with check (organization_id = (select private.current_organization_id()) and updated_by = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Clientes e carteira
-- ----------------------------------------------------------------------------
create policy clients_select on public.clients for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin()) or seller_id = (select auth.uid())));
create policy clients_update on public.clients for update to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin()) or seller_id = (select auth.uid())))
  with check (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin()) or seller_id = (select auth.uid())));

create policy csi_select on public.client_service_interests for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id));
create policy csi_insert on public.client_service_interests for insert to authenticated
  with check (exists (select 1 from public.clients c where c.id = client_id)
              and exists (select 1 from public.services s where s.id = service_id));
create policy csi_delete on public.client_service_interests for delete to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id));

create policy client_transfers_select on public.client_transfers for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id)
         and ((select private.is_active_admin()) or new_seller_id = (select auth.uid())));

create policy lead_links_select on public.lead_capture_links for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin()) or seller_id = (select auth.uid())));

create policy form_submissions_select on public.form_submissions for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin())
              or exists (select 1 from public.lead_capture_links l
                         where l.id = lead_capture_link_id and l.seller_id = (select auth.uid()))));

create policy import_jobs_select on public.import_jobs for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin()) or requested_by = (select auth.uid())));

create policy integration_events_select_admin on public.integration_events for select to authenticated
  using ((select private.is_active_admin()));

-- ----------------------------------------------------------------------------
-- Projetos e tarefas
-- ----------------------------------------------------------------------------
create policy projects_select on public.projects for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin())
              or exists (select 1 from public.clients c where c.id = client_id and c.seller_id = (select auth.uid()))));
create policy projects_insert_admin on public.projects for insert to authenticated
  with check (organization_id = (select private.current_organization_id()) and (select private.is_active_admin())
              and created_by = (select auth.uid())
              and exists (select 1 from public.clients c where c.id = client_id));
create policy projects_update_admin on public.projects for update to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()))
  with check (organization_id = (select private.current_organization_id()));

create policy tasks_select on public.project_tasks for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id));
create policy tasks_insert_admin on public.project_tasks for insert to authenticated
  with check ((select private.is_active_admin()) and exists (select 1 from public.projects p where p.id = project_id));
create policy tasks_update on public.project_tasks for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id)
         and ((select private.is_active_admin()) or assigned_to = (select auth.uid())))
  with check ((select private.is_active_admin()) or assigned_to = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Contratos
-- ----------------------------------------------------------------------------
create policy contracts_select on public.contracts for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin()) or seller_id = (select auth.uid())
              or exists (select 1 from public.clients c where c.id = client_id and c.seller_id = (select auth.uid()))));
create policy contract_services_select on public.contract_services for select to authenticated
  using (exists (select 1 from public.contracts k where k.id = contract_id));
create policy contract_versions_select on public.contract_versions for select to authenticated
  using (exists (select 1 from public.contracts k where k.id = contract_id));
create policy contract_referrals_select on public.contract_referrals for select to authenticated
  using (exists (select 1 from public.contracts k where k.id = contract_id));

-- ----------------------------------------------------------------------------
-- Financeiro (caixa e contas: somente admin; vendedor vê o que lhe diz respeito)
-- ----------------------------------------------------------------------------
create policy cash_accounts_select_admin on public.cash_accounts for select to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()));
create policy cash_accounts_insert_admin on public.cash_accounts for insert to authenticated
  with check (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()));
create policy cash_accounts_update_admin on public.cash_accounts for update to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()))
  with check (organization_id = (select private.current_organization_id()));

create policy cash_movements_select_admin on public.cash_movements for select to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()));

create policy billing_schedules_select_admin on public.billing_schedules for select to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()));

create policy receivables_select on public.receivables for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin())
              or exists (select 1 from public.clients c where c.id = client_id and c.seller_id = (select auth.uid()))));

create policy receipts_select_admin on public.receipts for select to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()));

create policy payables_select on public.payables for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin())
              or (kind = 'expense' and requested_by = (select auth.uid()))));

create policy outgoing_payments_select on public.outgoing_payments for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin())
              or exists (select 1 from public.payables p where p.id = payable_id
                         and p.kind = 'expense' and p.requested_by = (select auth.uid()))));

create policy fin_adjustments_select_admin on public.financial_adjustments for select to authenticated
  using (organization_id = (select private.current_organization_id()) and (select private.is_active_admin()));

-- ----------------------------------------------------------------------------
-- Comissões
-- ----------------------------------------------------------------------------
create policy commissions_select on public.commission_entitlements for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin()) or seller_id = (select auth.uid())));
create policy payouts_select on public.commission_payouts for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin()) or seller_id = (select auth.uid())));
create policy payout_items_select on public.commission_payout_items for select to authenticated
  using (exists (select 1 from public.commission_payouts p where p.id = commission_payout_id));

-- ----------------------------------------------------------------------------
-- Anexos: visíveis quando o recurso vinculado é visível ao usuário.
-- ----------------------------------------------------------------------------
create policy attachments_select on public.file_attachments for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and ((select private.is_active_admin())
              or (client_id is not null and exists (select 1 from public.clients c where c.id = client_id))
              or (project_id is not null and exists (select 1 from public.projects p where p.id = project_id))
              or (contract_id is not null and exists (select 1 from public.contracts k where k.id = contract_id))
              or (payable_id is not null and exists (select 1 from public.payables p where p.id = payable_id))
              or (receivable_id is not null and exists (select 1 from public.receivables r where r.id = receivable_id))));

-- ----------------------------------------------------------------------------
-- Notificações
-- ----------------------------------------------------------------------------
create policy notifications_select_own on public.notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()) and (select private.is_active_user()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (recipient_user_id = (select auth.uid()));
