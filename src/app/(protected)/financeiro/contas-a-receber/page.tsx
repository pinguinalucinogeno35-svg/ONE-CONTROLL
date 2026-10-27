import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { Alert, Badge, Card, CardTitle, EmptyState, PageHeader, Pagination } from "@/components/ui";
import { ActionButton } from "@/components/ui/server-form";
import { NewReceivableForm, ReasonForm, ReceiptForm } from "@/features/finance/forms";
import { generateReceivablesAction } from "@/features/finance/actions";
import { getActiveAccounts, receivableBalances, balanceString } from "@/server/services/finance";
import { RECEIVABLE_STATUS, RECEIVABLE_TYPE, label } from "@/lib/labels";
import { formatBRL, formatDecimalBRL } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/dates";

export const metadata = { title: "Contas a receber" };
const PAGE_SIZE = 20;
type Row = { id: string; description: string; type: string; amount: string; due_date: string; status: string; contract_id: string | null; clients: { id: string; company_name: string } | null };

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ status?: string; contrato?: string; page?: string }> }) {
  const ctx = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const today = todayISO();
  let q = ctx.supabase.from("receivables").select("id, description, type, amount, due_date, status, contract_id, clients(id, company_name)", { count: "exact" })
    .order("due_date").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.status === "vencidas") q = q.in("status", ["overdue", "partially_paid", "open"]).lt("due_date", today);
  else if (sp.status === "pagas") q = q.eq("status", "paid");
  else if (sp.status === "canceladas") q = q.eq("status", "cancelled");
  else q = q.in("status", ["open", "partially_paid", "overdue", "scheduled"]);
  if (sp.contrato && /^[0-9a-f-]{36}$/i.test(sp.contrato)) q = q.eq("contract_id", sp.contrato);
  const [{ data, count }, accounts, clients] = await Promise.all([
    q.returns<Row[]>(), getActiveAccounts(ctx),
    ctx.supabase.from("clients").select("id, company_name").neq("status", "archived").order("company_name").limit(1000),
  ]);
  const rows = data ?? [];
  const paid = await receivableBalances(ctx, rows.map((r) => r.id));
  const tabs = [["", "Em aberto"], ["vencidas", "Vencidas"], ["pagas", "Pagas"], ["canceladas", "Canceladas"]] as const;

  return (
    <>
      <PageHeader eyebrow="Financeiro / Receber" title="Contas a receber" description="Saldo em aberto derivado dos recebimentos confirmados. Recebimentos parciais mantêm o saldo pendente."
        actions={<ActionButton action={generateReceivablesAction} label="Gerar mensalidades (30 dias)" variant="secondary" />} />
      <nav aria-label="Filtro" className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => <Link key={k} href={`/financeiro/contas-a-receber${k ? `?status=${k}` : ""}`} aria-current={(sp.status ?? "") === k ? "true" : undefined} className="rounded-full border border-border px-3 py-1.5 text-xs aria-[current=true]:border-primary aria-[current=true]:bg-primary/15">{l}</Link>)}
      </nav>
      {accounts.length === 0 && <div className="mb-4"><Alert tone="warning">Cadastre uma conta financeira em Financeiro → Contas e saldos para registrar recebimentos.</Alert></div>}
      {rows.length === 0 ? <EmptyState title="Nenhuma cobrança neste filtro" /> : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const paidCents = paid.get(r.id) ?? 0;
            const balance = balanceString(r.amount, paidCents);
            const late = r.due_date < today && !["paid", "cancelled"].includes(r.status);
            return (
              <li key={r.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{r.clients?.company_name} <span className="text-muted">· {RECEIVABLE_TYPE[r.type]}</span></p>
                      <p className="text-sm text-muted">{r.description} · vence {formatDate(r.due_date)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="tabular">Total {formatDecimalBRL(r.amount)} · recebido {formatBRL(paidCents)} · <strong>saldo {formatDecimalBRL(balance)}</strong></span>
                      <Badge tone={label(RECEIVABLE_STATUS, r.status)[1]}>{label(RECEIVABLE_STATUS, r.status)[0]}</Badge>
                      {late && <Badge tone="danger">Em atraso</Badge>}
                    </div>
                  </div>
                  {!["paid", "cancelled"].includes(r.status) && accounts.length > 0 && (
                    <details><summary className="cursor-pointer text-sm text-primary">Registrar recebimento</summary><div className="mt-3"><ReceiptForm receivableId={r.id} balance={balance} accounts={accounts} /></div></details>
                  )}
                  {!["paid", "cancelled"].includes(r.status) && paidCents === 0 && (
                    <details><summary className="cursor-pointer text-xs text-muted">Cancelar cobrança</summary><div className="mt-3"><ReasonForm kind="cancel_receivable" id={r.id} label="Cancelar cobrança" /></div></details>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(p) => `/financeiro/contas-a-receber?${new URLSearchParams({ ...(sp.status && { status: sp.status }), page: String(p) })}`} />
      <Card className="mt-6"><CardTitle className="mb-4">Nova cobrança avulsa</CardTitle><NewReceivableForm clients={(clients.data ?? []).map((c) => ({ id: c.id, name: c.company_name }))} /></Card>
    </>
  );
}
