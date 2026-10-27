import { requireAdmin } from "@/server/auth/session";
import { Alert, Card, CardTitle, PageHeader, Select } from "@/components/ui";
import { ProjectionChart } from "@/components/charts";
import { formatDecimalBRL, fromDecimalString, formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { CashFlowWeek } from "@/types/db";

export const metadata = { title: "Fluxo de caixa" };

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
  const ctx = await requireAdmin();
  const { conta } = await searchParams;
  const account = conta && /^[0-9a-f-]{36}$/i.test(conta) ? conta : null;
  const [{ data, error }, { data: accounts }] = await Promise.all([
    ctx.supabase.rpc("cash_flow_projection", { p_weeks: 13, p_cash_account_id: account }),
    ctx.supabase.from("cash_accounts").select("id, name").order("name"),
  ]);
  const weeks = (data ?? []) as CashFlowWeek[];
  const first = weeks[0];
  const estimate = weeks.reduce((s, w) => s + fromDecimalString(w.commercial_estimate_in), 0);
  return (
    <>
      <PageHeader title="Fluxo de caixa — 13 semanas" description="Projeção baseada em cobranças e contas concretas. Estimativas comerciais e valores vencidos são mostrados à parte e não entram no saldo projetado." />
      <form className="mb-4 flex gap-2">
        <label htmlFor="conta" className="sr-only">Conta</label>
        <Select id="conta" name="conta" defaultValue={account ?? ""} className="sm:w-72"><option value="">Todas as contas (consolidado)</option>{(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <button className="min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-elevated">Aplicar</button>
      </form>
      {error && <Alert tone="danger">Não foi possível calcular a projeção.</Alert>}
      {account && <div className="mb-4"><Alert tone="info">Por conta, a projeção mostra apenas o realizado: cobranças e contas ainda não têm conta de destino definida.</Alert></div>}
      {first && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Alert tone="warning" title="Recebíveis vencidos (fora da projeção)">{formatDecimalBRL(first.overdue_in)}</Alert>
          <Alert tone="warning" title="Contas vencidas a pagar (fora da projeção)">{formatDecimalBRL(first.overdue_out)}</Alert>
          <Alert tone="info" title="Estimativa comercial (mensalidades não geradas)">{formatBRL(estimate)}</Alert>
        </div>
      )}
      <Card className="mb-6"><CardTitle className="mb-3">Saldo projetado ao fim de cada semana</CardTitle>
        <ProjectionChart data={weeks.map((w) => ({ label: formatDate(w.week_start).slice(0, 5), saldo: fromDecimalString(w.projected_closing) }))} />
      </Card>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border">
        <table className="w-full min-w-[960px] text-sm">
          <caption className="sr-only">Fluxo de caixa semanal</caption>
          <thead className="bg-elevated text-xs uppercase tracking-wide text-muted">
            <tr>{["Semana", "Saldo inicial", "Receb. previstos", "Receb. confirmados", "A receber", "Pag. previstos", "Pag. confirmados", "A pagar", "Estimativa comercial", "Saldo projetado", "Previsto − realizado (entradas)"].map((h) => <th key={h} scope="col" className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border tabular">
            {weeks.map((w) => (
              <tr key={w.week_index}>
                <th scope="row" className="px-3 py-2 text-left font-normal">{formatDate(w.week_start)} – {formatDate(w.week_end)}</th>
                <td className="px-3 py-2">{formatDecimalBRL(w.opening_balance)}</td>
                <td className="px-3 py-2">{formatDecimalBRL(w.expected_in)}</td>
                <td className="px-3 py-2">{formatDecimalBRL(w.confirmed_in)}</td>
                <td className="px-3 py-2">{formatDecimalBRL(w.pending_in)}</td>
                <td className="px-3 py-2">{formatDecimalBRL(w.expected_out)}</td>
                <td className="px-3 py-2">{formatDecimalBRL(w.confirmed_out)}</td>
                <td className="px-3 py-2">{formatDecimalBRL(w.pending_out)}</td>
                <td className="px-3 py-2 text-muted">{formatDecimalBRL(w.commercial_estimate_in)}</td>
                <td className="px-3 py-2 font-semibold">{formatDecimalBRL(w.projected_closing)}</td>
                <td className="px-3 py-2 text-muted">{formatBRL(fromDecimalString(w.expected_in) - fromDecimalString(w.confirmed_in))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
