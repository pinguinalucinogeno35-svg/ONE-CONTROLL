import { requireAdmin } from "@/server/auth/session";
import { Badge, DataTable, PageHeader, Pagination, Stat } from "@/components/ui";
import { ReasonForm } from "@/features/finance/forms";
import { PAYMENT_METHOD } from "@/lib/labels";
import { formatDecimalBRL } from "@/lib/money";
import { formatDate, formatDateTime, resolvePeriod } from "@/lib/dates";
import { PeriodFilter } from "@/components/layout/period-filter";
import type { AdminSummary } from "@/types/db";

export const metadata = { title: "Receitas" };
const PAGE_SIZE = 30;
type Row = { id: string; amount: string; payment_method: string; received_at: string; reference: string | null; reversed_at: string | null; reversal_reason: string | null;
  receivables: { description: string; clients: { company_name: string } | null } | null; cash_accounts: { name: string } | null; profiles: { full_name: string } | null };

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string; page?: string }> }) {
  const ctx = await requireAdmin();
  const sp = await searchParams;
  const period = resolvePeriod(sp.periodo, sp.de, sp.ate);
  const page = Math.max(1, Number(sp.page) || 1);
  const [summary, list] = await Promise.all([
    ctx.supabase.rpc("admin_financial_summary", { p_from: period.from, p_to: period.to }),
    ctx.supabase.from("receipts").select("id, amount, payment_method, received_at, reference, reversed_at, reversal_reason, receivables(description, clients(company_name)), cash_accounts(name), profiles!receipts_confirmed_by_fkey(full_name)", { count: "exact" })
      .gte("received_at", `${period.from}T00:00:00-03:00`).lte("received_at", `${period.to}T23:59:59-03:00`)
      .order("received_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).returns<Row[]>(),
  ]);
  const s = summary.data as AdminSummary | null;
  return (
    <>
      <PageHeader eyebrow="Financeiro / Receitas" title="Receitas recebidas" description={`Recebimentos confirmados de ${formatDate(period.from)} a ${formatDate(period.to)}`} />
      <PeriodFilter basePath="/financeiro/receitas" current={period.key} from={period.from} to={period.to} />
      {s && <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recebido (líquido de estornos)" value={formatDecimalBRL(s.total_recebido)} tone="success" />
        <Stat label="A receber (a vencer)" value={formatDecimalBRL(s.total_a_receber)} />
        <Stat label="Em atraso" value={formatDecimalBRL(s.total_em_atraso)} tone="danger" />
        <Stat label="Recorrente contratada" value={formatDecimalBRL(s.receita_recorrente_contratada)} hint="Mensal — não é caixa" />
      </div>}
      <DataTable<Row> caption="Recebimentos" rows={list.data ?? []} rowKey={(r) => r.id} columns={[
        { key: "d", header: "Data", cell: (r) => formatDateTime(r.received_at) },
        { key: "c", header: "Cliente", cell: (r) => r.receivables?.clients?.company_name ?? "—" },
        { key: "x", header: "Cobrança", cell: (r) => <span className="text-muted">{r.receivables?.description}</span> },
        { key: "v", header: "Valor", cell: (r) => <span className="tabular font-medium">{formatDecimalBRL(r.amount)}</span> },
        { key: "m", header: "Forma/Conta", cell: (r) => <span className="text-muted">{PAYMENT_METHOD[r.payment_method]} · {r.cash_accounts?.name}</span> },
        { key: "u", header: "Confirmado por", cell: (r) => <span className="text-muted">{r.profiles?.full_name}</span> },
        { key: "s", header: "Situação", cell: (r) => r.reversed_at ? <Badge tone="danger">Estornado</Badge> : (
          <details><summary className="cursor-pointer text-xs text-muted">Estornar</summary><div className="mt-2 w-72"><ReasonForm kind="reverse_receipt" id={r.id} label="Estornar" /></div></details>) },
      ]} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={list.count ?? 0} hrefFor={(p) => `/financeiro/receitas?${new URLSearchParams({ periodo: period.key, de: period.from, ate: period.to, page: String(p) })}`} />
    </>
  );
}
