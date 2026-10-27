import { requireAdmin } from "@/server/auth/session";
import { Card, CardTitle, DataTable, PageHeader, Stat } from "@/components/ui";
import { CashAccountForm, TransferForm } from "@/features/finance/forms";
import { formatDecimalBRL, fromDecimalString, formatBRL } from "@/lib/money";

export const metadata = { title: "Financeiro" };
type Bal = { cash_account_id: string; name: string; account_type: string; active: boolean; opening_balance: string; credits: string; debits: string; balance: string };

export default async function FinancePage() {
  const ctx = await requireAdmin();
  const { data } = await ctx.supabase.rpc("get_cash_balances");
  const rows = (data ?? []) as Bal[];
  const total = rows.reduce((s, r) => s + fromDecimalString(r.balance), 0);
  return (
    <>
      <PageHeader title="Contas e saldos" description="Saldo de caixa = saldo inicial + movimentos confirmados. Valores contratados ou previstos não entram aqui." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Saldo consolidado" value={formatBRL(total)} /></div>
      <DataTable<Bal> caption="Contas financeiras" rows={rows} rowKey={(r) => r.cash_account_id} columns={[
        { key: "n", header: "Conta", cell: (r) => <span className="font-medium">{r.name}{!r.active && " (inativa)"}</span> },
        { key: "o", header: "Saldo inicial", cell: (r) => <span className="tabular">{formatDecimalBRL(r.opening_balance)}</span> },
        { key: "c", header: "Entradas", cell: (r) => <span className="tabular">{formatDecimalBRL(r.credits)}</span> },
        { key: "d", header: "Saídas", cell: (r) => <span className="tabular">{formatDecimalBRL(r.debits)}</span> },
        { key: "b", header: "Saldo", cell: (r) => <span className="tabular font-semibold">{formatDecimalBRL(r.balance)}</span> },
      ]} />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card><CardTitle className="mb-4">Nova conta</CardTitle><CashAccountForm /></Card>
        <Card><CardTitle className="mb-4">Transferência entre contas</CardTitle><TransferForm accounts={rows.filter((r) => r.active).map((r) => ({ id: r.cash_account_id, name: r.name }))} /></Card>
      </div>
    </>
  );
}
