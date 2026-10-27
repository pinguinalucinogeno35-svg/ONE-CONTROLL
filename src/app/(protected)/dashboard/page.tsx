import Link from "next/link";
import { requireActiveUser, type ActiveContext } from "@/server/auth/session";
import { resolvePeriod, todayISO, addDaysISO, formatDate } from "@/lib/dates";
import { formatDecimalBRL, fromDecimalString } from "@/lib/money";
import type { AdminSummary, CashFlowWeek, MonthlySeries, SellerSummary } from "@/types/db";
import { Alert, Badge, Card, CardTitle, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui";
import { PeriodFilter } from "@/components/layout/period-filter";
import { CategoryBarChart, InOutChart, ProjectionChart } from "@/components/charts";
import { PAYABLE_STATUS, label } from "@/lib/labels";

export const metadata = { title: "Dashboard" };

type SP = Promise<{ periodo?: string; de?: string; ate?: string; erro?: string }>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireActiveUser();
  const sp = await searchParams;
  const period = resolvePeriod(sp.periodo, sp.de, sp.ate);
  return (
    <>
      {sp.erro === "acesso" && <div className="mb-4"><Alert tone="warning">Você não tem permissão para acessar aquela área.</Alert></div>}
      {ctx.profile.role === "admin" ? <AdminDashboard ctx={ctx} period={period} /> : <SellerDashboard ctx={ctx} period={period} />}
    </>
  );
}

type Period = ReturnType<typeof resolvePeriod>;

async function AdminDashboard({ ctx, period }: { ctx: ActiveContext; period: Period }) {
  const today = todayISO();
  const db = ctx.supabase;
  const [summaryRes, seriesRes, flowRes, upcomingRes, overdueRes, pendingExpRes, projectsRes] = await Promise.all([
    db.rpc("admin_financial_summary", { p_from: period.from, p_to: period.to }),
    db.rpc("admin_monthly_cash_series", { p_months: 6 }),
    db.rpc("cash_flow_projection", { p_weeks: 13, p_cash_account_id: null }),
    db.from("receivables").select("id, description, amount, due_date, status, clients(company_name)").in("status", ["open", "partially_paid"])
      .gte("due_date", today).lte("due_date", addDaysISO(today, 7)).order("due_date").limit(8),
    db.from("receivables").select("id, description, amount, due_date, status, client_id, clients(company_name)").in("status", ["overdue", "partially_paid"])
      .lt("due_date", today).order("due_date").limit(8),
    db.from("payables").select("id, description, amount, status, created_at, profiles!payables_requested_by_fkey(full_name)").in("status", ["requested", "pending_approval"]).order("created_at").limit(6),
    db.from("projects").select("id, name, due_date, status, clients(company_name)").not("status", "in", "(delivered,cancelled)")
      .lte("due_date", addDaysISO(today, 15)).order("due_date").limit(6),
  ]);
  if (summaryRes.error) return <Alert tone="danger">Não foi possível carregar os indicadores.</Alert>;
  const s = summaryRes.data as AdminSummary;
  const series = (seriesRes.data ?? []) as MonthlySeries[];
  const flow = (flowRes.data ?? []) as CashFlowWeek[];
  const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });

  return (
    <>
      <PageHeader eyebrow="Visão geral / Administração" title="Dashboard administrativo" description={`Período: ${formatDate(period.from)} a ${formatDate(period.to)}`} />
      <PeriodFilter basePath="/dashboard" current={period.key} from={period.from} to={period.to} />

      <section aria-labelledby="caixa" className="mb-6">
        <h2 id="caixa" className="mb-3 text-sm font-semibold text-muted">Caixa e recebíveis</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Saldo atual de caixa" value={formatDecimalBRL(s.saldo_de_caixa)} hint="Somente movimentos confirmados" />
          <Stat label="Recebido no período" value={formatDecimalBRL(s.total_recebido)} tone="success" />
          <Stat label="A receber (a vencer)" value={formatDecimalBRL(s.total_a_receber)} hint="Previsto, ainda não é caixa" />
          <Stat label="Vencido" value={formatDecimalBRL(s.total_em_atraso)} tone={fromDecimalString(s.total_em_atraso) > 0 ? "danger" : undefined} />
          <Stat label="Contas a pagar" value={formatDecimalBRL(s.total_a_pagar)} hint="Aprovadas, não quitadas" />
          <Stat label="Despesas do período" value={formatDecimalBRL(s.despesas_operacionais)} hint="Competência" />
          <Stat label="Custos de projetos" value={formatDecimalBRL(s.custos_diretos)} hint="Competência" />
          <Stat label="Comissões a pagar" value={formatDecimalBRL(s.comissoes_a_pagar)} hint={`Pagas no período: ${formatDecimalBRL(s.comissoes_pagas)}`} />
        </div>
      </section>

      <section aria-labelledby="comercial" className="mb-6">
        <h2 id="comercial" className="mb-3 text-sm font-semibold text-muted">Comercial e operação</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Receita recorrente contratada" value={formatDecimalBRL(s.receita_recorrente_contratada)} hint="Mensal (contratado ≠ recebido)" />
          <Stat label="Implementações contratadas" value={formatDecimalBRL(s.total_contratado)} hint={`${s.contratos_fechados} contrato(s) aprovados`} />
          <Stat label="Novos clientes" value={s.novos_clientes} />
          <Stat label="Projetos ativos" value={s.projetos_ativos} />
          <Stat label="Projetos atrasados" value={s.projetos_atrasados} tone={s.projetos_atrasados > 0 ? "danger" : undefined} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Entradas e saídas confirmadas (6 meses)</CardTitle>
          <InOutChart data={series.map((m) => ({ label: monthFmt.format(new Date(`${m.month}T00:00:00Z`)), entradas: fromDecimalString(m.credits), saidas: fromDecimalString(m.debits) }))} />
        </Card>
        <Card>
          <CardTitle className="mb-1">Projeção de caixa — 13 semanas</CardTitle>
          <p className="mb-3 text-xs text-muted">Saldo + cobranças e contas concretas. Estimativas comerciais e valores vencidos ficam fora. <Link className="text-primary underline" href="/financeiro/fluxo-de-caixa">Detalhar</Link></p>
          <ProjectionChart data={flow.map((w) => ({ label: formatDate(w.week_start).slice(0, 5), saldo: fromDecimalString(w.projected_closing) }))} />
        </Card>
        <Card>
          <CardTitle className="mb-3">Despesas e custos por categoria</CardTitle>
          {s.despesas_por_categoria.length ? (
            <CategoryBarChart ariaLabel="Despesas e custos por categoria" data={s.despesas_por_categoria.map((c) => ({ label: `${c.category}${c.kind === "direct_cost" ? " (custo)" : ""}`, value: fromDecimalString(c.amount) }))} />
          ) : <EmptyState title="Sem despesas no período" />}
        </Card>
        <Card>
          <CardTitle className="mb-3">Desempenho por vendedor</CardTitle>
          {s.desempenho_vendedores.length ? (
            <ul className="divide-y divide-border text-sm">
              {s.desempenho_vendedores.map((v) => (
                <li key={v.seller_id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{v.name}</span>
                  <span className="tabular text-right text-muted">{v.contracts} contrato(s) · impl. {formatDecimalBRL(v.implementation)} · mensal {formatDecimalBRL(v.monthly)} · {v.new_clients} cliente(s)</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nenhum vendedor cadastrado" />}
        </Card>
        <ListCard title="Cobranças nos próximos 7 dias" href="/financeiro/contas-a-receber" empty="Nenhuma cobrança próxima"
          items={(upcomingRes.data ?? []).map((r) => ({ id: r.id, primary: (r.clients as unknown as { company_name: string } | null)?.company_name ?? "—", secondary: r.description, right: `${formatDecimalBRL(r.amount)} · ${formatDate(r.due_date)}` }))} />
        <ListCard title="Clientes inadimplentes" href="/financeiro/contas-a-receber?status=vencidas" empty="Nenhuma cobrança vencida"
          items={(overdueRes.data ?? []).map((r) => ({ id: r.id, primary: (r.clients as unknown as { company_name: string } | null)?.company_name ?? "—", secondary: `Venceu em ${formatDate(r.due_date)}`, right: formatDecimalBRL(r.amount), badge: <Badge tone="danger">Vencida</Badge> }))} />
        <ListCard title={`Despesas aguardando aprovação (${s.despesas_aguardando_aprovacao})`} href="/financeiro/despesas" empty="Nada pendente"
          items={(pendingExpRes.data ?? []).map((p) => ({ id: p.id, primary: p.description, secondary: (p.profiles as unknown as { full_name: string } | null)?.full_name ?? "", right: formatDecimalBRL(p.amount), badge: <Badge tone={label(PAYABLE_STATUS, p.status)[1]}>{label(PAYABLE_STATUS, p.status)[0]}</Badge> }))} />
        <ListCard title="Projetos próximos da entrega" href="/projetos" empty="Nenhuma entrega nos próximos 15 dias"
          items={(projectsRes.data ?? []).map((p) => ({ id: p.id, primary: p.name, secondary: (p.clients as unknown as { company_name: string } | null)?.company_name ?? "", right: formatDate(p.due_date), badge: p.due_date && p.due_date < today ? <Badge tone="danger">Atrasado</Badge> : undefined }))} />
      </div>
    </>
  );
}

function ListCard({ title, href, items, empty }: { title: string; href: string; empty: string; items: { id: string; primary: string; secondary?: string; right?: string; badge?: React.ReactNode }[] }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between"><CardTitle>{title}</CardTitle><Link href={href} className="text-xs text-primary underline">Ver todos</Link></div>
      {items.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
        <ul className="divide-y divide-border text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0"><p className="truncate">{i.primary}</p>{i.secondary && <p className="truncate text-xs text-muted">{i.secondary}</p>}</div>
              <div className="flex shrink-0 items-center gap-2"><span className="tabular text-muted">{i.right}</span>{i.badge}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function SellerDashboard({ ctx, period }: { ctx: ActiveContext; period: Period }) {
  const { data, error } = await ctx.supabase.rpc("seller_dashboard", { p_from: period.from, p_to: period.to });
  if (error) return <Alert tone="danger">Não foi possível carregar seus indicadores.</Alert>;
  const s = data as SellerSummary;
  return (
    <>
      <PageHeader eyebrow="Visão geral / Comercial" title={`Olá, ${ctx.profile.full_name.split(" ")[0]}`} description="Seu desempenho comercial" actions={<LinkButton href="/clientes/novo">Novo cliente</LinkButton>} />
      <PeriodFilter basePath="/dashboard" current={period.key} from={period.from} to={period.to} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Clientes na carteira" value={s.total_clientes} hint={`${s.clientes_pendentes} pendente(s) de complementação`} />
        <Stat label="Novos clientes" value={s.novos_clientes} />
        <Stat label="Contratos fechados" value={s.contratos_fechados} hint={`${s.contratos_aguardando} aguardando aprovação`} />
        <Stat label="Implementação vendida" value={formatDecimalBRL(s.valor_implementacao_vendido)} hint={`Mensalidades: ${formatDecimalBRL(s.valor_mensal_vendido)}`} />
        <Stat label="Comissões estimadas" value={formatDecimalBRL(s.comissoes_estimadas)} hint="Simulação de contratos em aprovação" />
        <Stat label="Comissões adquiridas" value={formatDecimalBRL(s.comissoes_adquiridas)} hint="Aguardando aprovação" />
        <Stat label="Comissões aprovadas" value={formatDecimalBRL(s.comissoes_aprovadas)} hint="A receber" tone="success" />
        <Stat label="Comissões recebidas" value={formatDecimalBRL(s.comissoes_recebidas)} />
        <Stat label="Comissões pendentes" value={formatDecimalBRL(s.comissoes_pendentes)} />
        <Stat label="Projetos em andamento" value={s.projetos_em_andamento} />
        <Stat label="Despesas solicitadas" value={s.despesas_solicitadas} hint="Aguardando aprovação" />
      </div>
      <Card className="mt-6">
        <CardTitle className="mb-3">Próximas entregas (30 dias)</CardTitle>
        {s.proximas_entregas.length === 0 ? <p className="text-sm text-muted">Nenhuma entrega prevista.</p> : (
          <ul className="divide-y divide-border text-sm">
            {s.proximas_entregas.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2"><Link href={`/projetos/${p.id}`} className="hover:underline">{p.name} <span className="text-muted">· {p.client}</span></Link><span className="tabular text-muted">{formatDate(p.due_date)}</span></li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
