-- =============================================================================
-- ONE CONTROL — 0011 Indicadores, fluxo de caixa (13 semanas), rotinas diárias
-- Agregações sensíveis ocorrem no banco; o navegador nunca soma linhas brutas.
-- =============================================================================

create or replace function public.admin_financial_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record; v_today date := private.today(); r jsonb;
begin
  select * into a from private.require_admin();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3660 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  with
  recv as (
    select r.*, r.amount - private.receivable_paid_amount(r.id) as balance
      from public.receivables r where r.organization_id = a.organization_id and r.status <> 'cancelled'),
  pay as (
    select p.*, p.amount - private.payable_paid_amount(p.id) as balance
      from public.payables p where p.organization_id = a.organization_id
       and p.status in ('approved', 'partially_paid', 'paid')),
  comm as (
    select e.*, e.commission_amount - private.commission_paid_amount(e.id) as balance
      from public.commission_entitlements e where e.organization_id = a.organization_id
       and e.status not in ('cancelled', 'reversed'))
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'saldo_de_caixa', (select coalesce(sum(balance), 0) from public.get_cash_balances()),
    'total_contratado', (select coalesce(sum(k.implementation_amount), 0) from public.contracts k
                          where k.organization_id = a.organization_id and k.status in ('approved', 'active', 'completed')
                            and (k.approved_at at time zone 'America/Bahia')::date between p_from and p_to),
    'contratos_fechados', (select count(*) from public.contracts k
                          where k.organization_id = a.organization_id and k.status in ('approved', 'active', 'completed')
                            and (k.approved_at at time zone 'America/Bahia')::date between p_from and p_to),
    'receita_recorrente_contratada', (select coalesce(sum(s.amount), 0) from public.billing_schedules s
                          where s.organization_id = a.organization_id and s.status = 'active' and s.frequency = 'monthly'),
    'total_recebido', (select coalesce(sum(x.amount), 0) from public.receipts x
                        where x.organization_id = a.organization_id and x.reversed_at is null
                          and (x.received_at at time zone 'America/Bahia')::date between p_from and p_to),
    'total_a_receber', (select coalesce(sum(balance), 0) from recv where balance > 0 and due_date >= v_today),
    'total_em_atraso', (select coalesce(sum(balance), 0) from recv where balance > 0 and due_date < v_today),
    'total_a_pagar', (select coalesce(sum(balance), 0) from pay where balance > 0),
    'total_pago', (select coalesce(sum(o.amount), 0) from public.outgoing_payments o
                    where o.organization_id = a.organization_id and o.reversed_at is null
                      and (o.paid_at at time zone 'America/Bahia')::date between p_from and p_to),
    'custos_diretos', (select coalesce(sum(amount), 0) from pay where kind = 'direct_cost'
                        and competence_month between date_trunc('month', p_from)::date and p_to),
    'despesas_operacionais', (select coalesce(sum(amount), 0) from pay where kind = 'expense'
                        and competence_month between date_trunc('month', p_from)::date and p_to),
    'despesas_aguardando_aprovacao', (select count(*) from public.payables p where p.organization_id = a.organization_id
                        and p.status in ('requested', 'pending_approval')),
    'comissoes_previstas', (select coalesce(sum(commission_amount), 0) from comm where status in ('estimated', 'pending_receipt', 'earned', 'awaiting_approval')),
    'comissoes_a_pagar', (select coalesce(sum(balance), 0) from comm where status in ('approved', 'partially_paid')),
    'comissoes_pagas', (select coalesce(sum(i.allocated_amount), 0) from public.commission_payout_items i
                        join public.commission_payouts p on p.id = i.commission_payout_id
                        where p.organization_id = a.organization_id and p.status = 'confirmed'
                          and (p.paid_at at time zone 'America/Bahia')::date between p_from and p_to),
    'novos_clientes', (select count(*) from public.clients c where c.organization_id = a.organization_id
                        and (c.created_at at time zone 'America/Bahia')::date between p_from and p_to),
    'projetos_ativos', (select count(*) from public.projects pr where pr.organization_id = a.organization_id
                        and pr.status in ('approved', 'in_progress', 'in_review')),
    'projetos_atrasados', (select count(*) from public.projects pr where pr.organization_id = a.organization_id
                        and pr.status in ('planning', 'approved', 'in_progress', 'in_review', 'on_hold') and pr.due_date < v_today),
    'despesas_por_categoria', (select coalesce(jsonb_agg(jsonb_build_object('category', fc.name, 'kind', fc.kind, 'amount', t.total) order by t.total desc), '[]'::jsonb)
                        from (select category_id, sum(amount) total from pay
                               where competence_month between date_trunc('month', p_from)::date and p_to
                               group by category_id) t
                        join public.financial_categories fc on fc.id = t.category_id),
    'desempenho_vendedores', (select coalesce(jsonb_agg(jsonb_build_object('seller_id', pr.id, 'name', pr.full_name,
                          'contracts', coalesce(k.n, 0), 'implementation', coalesce(k.impl, 0), 'monthly', coalesce(k.mon, 0),
                          'new_clients', coalesce(cl.n, 0)) order by coalesce(k.impl, 0) + coalesce(k.mon, 0) desc), '[]'::jsonb)
                        from public.profiles pr
                        left join (select seller_id, count(*) n, sum(implementation_amount) impl, sum(monthly_amount) mon
                                     from public.contracts where organization_id = a.organization_id
                                      and status in ('approved', 'active', 'completed')
                                      and (approved_at at time zone 'America/Bahia')::date between p_from and p_to
                                    group by seller_id) k on k.seller_id = pr.id
                        left join (select seller_id, count(*) n from public.clients where organization_id = a.organization_id
                                      and (created_at at time zone 'America/Bahia')::date between p_from and p_to
                                    group by seller_id) cl on cl.seller_id = pr.id
                        where pr.organization_id = a.organization_id and pr.role = 'seller')
  ) into r;
  return r;
end;
$$;

-- Série mensal de entradas e saídas confirmadas (caixa realizado).
create or replace function public.admin_monthly_cash_series(p_months integer default 12)
returns table (month date, credits numeric, debits numeric, receipts numeric, direct_costs numeric, expenses numeric, commissions numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record; v_start date;
begin
  select * into a from private.require_admin();
  if p_months not between 1 and 36 then raise exception 'Intervalo inválido' using errcode = '22023'; end if;
  v_start := (date_trunc('month', private.today()) - make_interval(months => p_months - 1))::date;
  return query
  with months as (select generate_series(v_start, date_trunc('month', private.today())::date, interval '1 month')::date m),
  mv as (select date_trunc('month', occurred_at at time zone 'America/Bahia')::date m, m.*
           from public.cash_movements m where m.organization_id = a.organization_id
            and m.source_type <> 'transfer' and m.occurred_at >= v_start)
  select mo.m,
    coalesce(sum(mv.amount) filter (where mv.movement_type = 'credit'), 0)::numeric(15,2),
    coalesce(sum(mv.amount) filter (where mv.movement_type = 'debit'), 0)::numeric(15,2),
    coalesce(sum(mv.amount) filter (where mv.source_type = 'receipt'), 0)::numeric(15,2)
      - coalesce(sum(mv.amount) filter (where mv.source_type = 'receipt_reversal'), 0)::numeric(15,2),
    coalesce((select sum(o.amount) from public.outgoing_payments o join public.payables p on p.id = o.payable_id
               where o.organization_id = a.organization_id and o.reversed_at is null and p.kind = 'direct_cost'
                 and date_trunc('month', o.paid_at at time zone 'America/Bahia')::date = mo.m), 0)::numeric(15,2),
    coalesce((select sum(o.amount) from public.outgoing_payments o join public.payables p on p.id = o.payable_id
               where o.organization_id = a.organization_id and o.reversed_at is null and p.kind = 'expense'
                 and date_trunc('month', o.paid_at at time zone 'America/Bahia')::date = mo.m), 0)::numeric(15,2),
    coalesce(sum(mv.amount) filter (where mv.source_type = 'commission_payout'), 0)::numeric(15,2)
  from months mo left join mv on mv.m = mo.m
  group by mo.m order by mo.m;
end;
$$;

-- Fluxo de caixa de N semanas a partir da segunda-feira da semana atual.
--  * confirmed_*: movimentos efetivos (realizado).
--  * expected_*: valores originalmente previstos com vencimento na semana.
--  * pending_*: saldo ainda em aberto das cobranças/contas concretas da semana.
--  * commercial_estimate_in: mensalidades futuras ainda não geradas (estimativa
--    comercial; NÃO entra no saldo projetado).
--  * overdue_*: saldos vencidos antes do período (exibidos à parte, fora da projeção).
create or replace function public.cash_flow_projection(p_weeks integer default 13, p_cash_account_id uuid default null)
returns table (week_index integer, week_start date, week_end date, opening_balance numeric,
               expected_in numeric, confirmed_in numeric, pending_in numeric,
               expected_out numeric, confirmed_out numeric, pending_out numeric,
               commercial_estimate_in numeric, projected_closing numeric, overdue_in numeric, overdue_out numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a record; v_start date; i int; v_open numeric(15,2); v_ws date; v_we date;
  v_ein numeric(15,2); v_cin numeric(15,2); v_pin numeric(15,2); v_eout numeric(15,2); v_cout numeric(15,2);
  v_pout numeric(15,2); v_est numeric(15,2); v_odin numeric(15,2); v_odout numeric(15,2); v_today date := private.today();
begin
  select * into a from private.require_admin();
  if p_weeks not between 1 and 26 then raise exception 'Semanas entre 1 e 26' using errcode = '22023'; end if;
  if p_cash_account_id is not null and not exists (
       select 1 from public.cash_accounts where id = p_cash_account_id and organization_id = a.organization_id) then
    raise exception 'Conta inválida' using errcode = '22023';
  end if;
  v_start := (date_trunc('week', v_today))::date;

  -- Saldo no início da semana atual.
  select coalesce(sum(ca.opening_balance), 0) into v_open from public.cash_accounts ca
   where ca.organization_id = a.organization_id and (p_cash_account_id is null or ca.id = p_cash_account_id);
  select v_open + coalesce(sum(case when m.movement_type = 'credit' then m.amount else -m.amount end), 0) into v_open
    from public.cash_movements m
   where m.organization_id = a.organization_id and (p_cash_account_id is null or m.cash_account_id = p_cash_account_id)
     and (m.occurred_at at time zone 'America/Bahia')::date < v_start;

  select coalesce(sum(r.amount - private.receivable_paid_amount(r.id)), 0) into v_odin
    from public.receivables r where r.organization_id = a.organization_id and r.status not in ('cancelled', 'paid') and r.due_date < v_start;
  select coalesce(sum(p.amount - private.payable_paid_amount(p.id)), 0) into v_odout
    from public.payables p where p.organization_id = a.organization_id and p.status in ('approved', 'partially_paid') and p.due_date < v_start;

  for i in 1..p_weeks loop
    v_ws := v_start + (i - 1) * 7; v_we := v_ws + 6;
    select coalesce(sum(r.amount), 0), coalesce(sum(r.amount - private.receivable_paid_amount(r.id)), 0)
      into v_ein, v_pin
      from public.receivables r where r.organization_id = a.organization_id and r.status <> 'cancelled'
       and r.due_date between v_ws and v_we;
    select coalesce(sum(p.amount), 0), coalesce(sum(p.amount - private.payable_paid_amount(p.id)), 0)
      into v_eout, v_pout
      from public.payables p where p.organization_id = a.organization_id and p.status in ('approved', 'partially_paid', 'paid')
       and coalesce(p.due_date, v_ws) between v_ws and v_we
       and (p.due_date is not null or i = 1);
    select coalesce(sum(m.amount) filter (where m.movement_type = 'credit'), 0),
           coalesce(sum(m.amount) filter (where m.movement_type = 'debit'), 0)
      into v_cin, v_cout
      from public.cash_movements m
     where m.organization_id = a.organization_id and (p_cash_account_id is null or m.cash_account_id = p_cash_account_id)
       and (m.occurred_at at time zone 'America/Bahia')::date between v_ws and v_we
       and (p_cash_account_id is not null or m.source_type <> 'transfer');
    -- Estimativa comercial: agendas ativas cuja próxima ocorrência ainda não virou cobrança.
    select coalesce(sum(s.amount), 0) into v_est
      from public.billing_schedules s
      cross join lateral (
        select private.due_date_for_month((date_trunc('month', s.next_due_date) + make_interval(months => g))::date, s.billing_day) d
          from generate_series(0, 7) g) occ
     where s.organization_id = a.organization_id and s.status = 'active' and s.frequency = 'monthly'
       and occ.d between v_ws and v_we and occ.d >= s.next_due_date
       and (s.end_date is null or occ.d <= s.end_date)
       and not exists (select 1 from public.receivables r where r.billing_schedule_id = s.id
                        and r.competence_month = date_trunc('month', occ.d)::date);

    week_index := i; week_start := v_ws; week_end := v_we; opening_balance := v_open;
    expected_in := v_ein; confirmed_in := v_cin; pending_in := case when p_cash_account_id is null then v_pin else 0 end;
    expected_out := v_eout; confirmed_out := v_cout; pending_out := case when p_cash_account_id is null then v_pout else 0 end;
    commercial_estimate_in := v_est;
    projected_closing := v_open + v_cin - v_cout + pending_in - pending_out;
    overdue_in := case when i = 1 then v_odin else 0 end; overdue_out := case when i = 1 then v_odout else 0 end;
    return next;
    v_open := projected_closing;
  end loop;
end;
$$;

create or replace function public.seller_dashboard(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a record; r jsonb; v_today date := private.today();
begin
  select * into a from private.require_active_user();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3660 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  with comm as (
    select e.*, private.commission_paid_amount(e.id) as paid
      from public.commission_entitlements e where e.seller_id = a.user_id and e.organization_id = a.organization_id)
  select jsonb_build_object(
    'total_clientes', (select count(*) from public.clients where seller_id = a.user_id and status <> 'archived'),
    'novos_clientes', (select count(*) from public.clients where seller_id = a.user_id
                        and (created_at at time zone 'America/Bahia')::date between p_from and p_to),
    'clientes_pendentes', (select count(*) from public.clients where seller_id = a.user_id and status = 'pending_completion'),
    'contratos_fechados', (select count(*) from public.contracts where seller_id = a.user_id
                        and status in ('approved', 'active', 'completed') and (approved_at at time zone 'America/Bahia')::date between p_from and p_to),
    'contratos_aguardando', (select count(*) from public.contracts where seller_id = a.user_id and status = 'pending_approval'),
    'valor_implementacao_vendido', (select coalesce(sum(implementation_amount), 0) from public.contracts where seller_id = a.user_id
                        and status in ('approved', 'active', 'completed') and (approved_at at time zone 'America/Bahia')::date between p_from and p_to),
    'valor_mensal_vendido', (select coalesce(sum(monthly_amount), 0) from public.contracts where seller_id = a.user_id
                        and status in ('approved', 'active', 'completed') and (approved_at at time zone 'America/Bahia')::date between p_from and p_to),
    'comissoes_estimadas', (select coalesce(sum(private.commission_amount(k.implementation_amount, k.commission_rate_bps)), 0)
                        from public.contracts k where k.seller_id = a.user_id and k.status in ('draft', 'pending_approval')
                          and k.commission_rate_bps is not null),
    'comissoes_adquiridas', (select coalesce(sum(commission_amount), 0) from comm where status in ('earned', 'awaiting_approval')),
    'comissoes_aprovadas', (select coalesce(sum(commission_amount - paid), 0) from comm where status in ('approved', 'partially_paid')),
    'comissoes_recebidas', (select coalesce(sum(paid), 0) from comm),
    'comissoes_pendentes', (select coalesce(sum(commission_amount - paid), 0) from comm where status not in ('cancelled', 'reversed', 'paid')),
    'projetos_em_andamento', (select count(*) from public.projects pr join public.clients c on c.id = pr.client_id
                        where c.seller_id = a.user_id and pr.status in ('approved', 'in_progress', 'in_review')),
    'proximas_entregas', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'due_date', pr.due_date, 'client', c.company_name) order by pr.due_date), '[]'::jsonb)
                        from public.projects pr join public.clients c on c.id = pr.client_id
                        where c.seller_id = a.user_id and pr.status not in ('delivered', 'cancelled')
                          and pr.due_date between v_today and v_today + 30),
    'despesas_solicitadas', (select count(*) from public.payables where requested_by = a.user_id and status in ('requested', 'pending_approval'))
  ) into r;
  return r;
end;
$$;

-- Rotina diária (cron via service_role): gera mensalidades, atualiza atrasos,
-- notifica vencimentos/atrasos e projetos, aplica retenção.
create or replace function public.run_daily_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_today date := private.today(); v_generated int; v_overdue int := 0; r record; v_purged int;
begin
  if not private.is_service_role() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  v_generated := public.generate_due_receivables(v_today + 30);

  for r in select rc.id from public.receivables rc where rc.status in ('open', 'scheduled') and rc.due_date < v_today loop
    perform private.refresh_receivable_status(r.id); v_overdue := v_overdue + 1;
  end loop;

  -- Vencimento em até 3 dias e atrasos: notifica vendedor do cliente e admins (dedupe por dia/cobrança).
  for r in select rc.*, c.seller_id, c.company_name from public.receivables rc join public.clients c on c.id = rc.client_id
            where rc.status in ('open', 'partially_paid', 'overdue') and rc.due_date <= v_today + 3 loop
    if r.due_date < v_today then
      perform private.notify(r.organization_id, r.seller_id, 'invoice_overdue', 'Cobrança em atraso',
        r.company_name || ' — ' || r.description, 'receivables', r.id, 'overdue:' || r.id || ':' || to_char(v_today, 'IYYY-IW'));
      perform private.notify_admins(r.organization_id, 'invoice_overdue', 'Cobrança em atraso',
        r.company_name || ' — ' || r.description, 'receivables', r.id, 'overdue:' || r.id || ':' || to_char(v_today, 'IYYY-IW'));
    else
      perform private.notify(r.organization_id, r.seller_id, 'invoice_due_soon', 'Cobrança próxima do vencimento',
        r.company_name || ' — vence em ' || to_char(r.due_date, 'DD/MM/YYYY'), 'receivables', r.id, 'due:' || r.id);
    end if;
  end loop;

  for r in select pr.*, c.seller_id from public.projects pr join public.clients c on c.id = pr.client_id
            where pr.status not in ('delivered', 'cancelled') and pr.due_date is not null and pr.due_date <= v_today + 5 loop
    if r.due_date < v_today then
      perform private.notify_admins(r.organization_id, 'project_overdue', 'Projeto atrasado', r.name, 'projects', r.id,
        'project_overdue:' || r.id || ':' || to_char(v_today, 'IYYY-IW'));
      perform private.notify(r.organization_id, r.seller_id, 'project_overdue', 'Projeto atrasado', r.name, 'projects', r.id,
        'project_overdue:' || r.id || ':' || to_char(v_today, 'IYYY-IW'));
    else
      perform private.notify(r.organization_id, r.seller_id, 'project_due_soon', 'Projeto próximo da entrega', r.name, 'projects', r.id,
        'project_due:' || r.id);
    end if;
  end loop;

  update public.lead_capture_links set status = 'expired' where status = 'active' and expires_at < now();
  update public.user_invitations set status = 'expired' where status = 'pending' and expires_at < now();
  delete from public.idempotency_keys where expires_at < now();
  v_purged := private.purge_form_payloads(90);

  return jsonb_build_object('receivables_generated', v_generated, 'overdue_checked', v_overdue, 'payloads_purged', v_purged);
end;
$$;

-- Consulta LGPD: registros associados a um titular (por e-mail/WhatsApp). Somente admin.
create or replace function public.data_subject_lookup(p_email text, p_whatsapp text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a record; r jsonb;
begin
  select * into a from private.require_admin();
  select jsonb_build_object(
    'clients', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'company_name', c.company_name, 'contact_name', c.contact_name,
                 'email', c.email, 'whatsapp', c.whatsapp, 'status', c.status, 'created_at', c.created_at)), '[]'::jsonb),
    'form_submissions', (select count(*) from public.form_submissions f
                          where f.organization_id = a.organization_id
                            and (f.client_id in (select c2.id from public.clients c2 where c2.organization_id = a.organization_id
                                   and ((p_email is not null and c2.email = private.normalize_email(p_email))
                                     or (p_whatsapp is not null and c2.whatsapp = private.normalize_phone_br(p_whatsapp)))))))
    into r
    from public.clients c
   where c.organization_id = a.organization_id
     and ((p_email is not null and c.email = private.normalize_email(p_email))
       or (p_whatsapp is not null and c.whatsapp = private.normalize_phone_br(p_whatsapp)));
  perform private.log_audit(a.organization_id, 'data_subject_lookup', 'clients', null, null,
    jsonb_build_object('email_informed', p_email is not null, 'whatsapp_informed', p_whatsapp is not null));
  return r;
end;
$$;
