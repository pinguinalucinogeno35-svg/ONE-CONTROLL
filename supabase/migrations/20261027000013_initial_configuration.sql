-- =============================================================================
-- ONE CONTROL — 0013 Configuração inicial real da ONE Studio Digital
-- (idempotente; não contém dados fictícios nem usuários)
-- =============================================================================
insert into public.organizations (legal_name, display_name, slug)
values ('ONE Studio Digital', 'ONE Studio Digital', 'one-studio-digital')
on conflict (slug) do nothing;

do $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'one-studio-digital';

  insert into public.services (organization_id, name, category, service_type)
  select v_org, s.name, s.category, s.kind::public.service_type
  from (values
    ('Landing Page', 'Web', 'one_time'),
    ('Site Institucional', 'Web', 'one_time'),
    ('E-commerce', 'Web', 'hybrid'),
    ('Identidade Visual', 'Design', 'one_time'),
    ('Gestão de Redes Sociais', 'Marketing', 'recurring'),
    ('Automação WhatsApp', 'Automação', 'hybrid'),
    ('CRM', 'Automação', 'hybrid'),
    ('Agentes de IA', 'Automação', 'hybrid'),
    ('SEO', 'Marketing', 'recurring'),
    ('Produção Audiovisual', 'Audiovisual', 'one_time'),
    ('Consultoria Digital', 'Consultoria', 'one_time'),
    ('Manutenção de Sites', 'Web', 'recurring')) as s(name, category, kind)
  on conflict do nothing;

  insert into public.financial_categories (organization_id, name, kind)
  select v_org, c.name, c.kind::public.category_kind
  from (values
    ('Transporte', 'expense'), ('Alimentação em reuniões', 'expense'), ('Aluguel', 'expense'),
    ('Energia', 'expense'), ('Internet', 'expense'), ('Assinaturas administrativas', 'expense'),
    ('Material de escritório', 'expense'), ('Marketing interno', 'expense'), ('Outras despesas', 'expense'),
    ('Hospedagem de cliente', 'direct_cost'), ('Freelancer de projeto', 'direct_cost'),
    ('Licença de serviço', 'direct_cost'), ('Produção terceirizada', 'direct_cost'),
    ('Material de entrega', 'direct_cost'), ('Outros custos diretos', 'direct_cost'),
    ('Implementação', 'revenue'), ('Mensalidade', 'revenue'), ('Serviço adicional', 'revenue')) as c(name, kind)
  on conflict do nothing;

  -- Taxas oficiais definidas pela diretoria. Base de cálculo e fato gerador
  -- PENDENTES de decisão comercial: a política permanece em rascunho e o
  -- sistema exibe apenas simulação provisória até sua ativação.
  if not exists (select 1 from public.commission_policies where organization_id = v_org) then
    insert into public.commission_policies (organization_id, name, direct_rate_bps, referral_rate_bps,
      second_level_rate_bps, base_rule, trigger_rule, status, effective_from, notes)
    values (v_org, 'Política inicial de comissões', 1250, 2000, 2500, null, null, 'draft', current_date,
      'Taxas: direta 12,5%, indicação 20%, indicação da indicação 25% (não cumulativas). Base e fato gerador pendentes de decisão.');
  end if;

  insert into public.system_settings (organization_id, setting_key, setting_value)
  values (v_org, 'google_forms.lead_form', jsonb_build_object('form_id', null, 'form_url', null, 'token_entry_id', null)),
         (v_org, 'billing.short_month_policy', to_jsonb('clamp_to_month_end'::text)),
         (v_org, 'privacy.form_payload_retention_days', to_jsonb(90))
  on conflict (organization_id, setting_key) do nothing;
end $$;
