import type { ActiveContext } from "@/server/auth/session";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui";
import { ActionButton } from "@/components/ui/server-form";
import { PayForm, ReasonForm } from "./forms";
import { approveExpenseAction } from "./actions";
import { getActiveAccounts, payableBalances, balanceString } from "@/server/services/finance";
import { PAYABLE_STATUS, PAYMENT_METHOD, label } from "@/lib/labels";
import { formatBRL, formatDecimalBRL } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { Attachments } from "@/features/files/attachments";

type Row = {
  id: string; description: string; supplier_name: string | null; amount: string; due_date: string | null; status: string; requested_by: string;
  created_at: string; rejection_reason: string | null; financial_categories: { name: string } | null; projects: { name: string } | null;
  requester: { full_name: string } | null;
};

/** Quadro administrativo de despesas/custos: aprovação → pagamento → histórico. */
export async function PayablesBoard({ ctx, kind, projectId }: { ctx: ActiveContext; kind: "expense" | "direct_cost"; projectId?: string }) {
  let q = ctx.supabase.from("payables")
    .select("id, description, supplier_name, amount, due_date, status, requested_by, created_at, rejection_reason, financial_categories(name), projects(name), requester:profiles!payables_requested_by_fkey(full_name)")
    .eq("kind", kind).order("created_at", { ascending: false }).limit(150);
  if (projectId) q = q.eq("project_id", projectId);
  const [{ data }, accounts] = await Promise.all([q.returns<Row[]>(), getActiveAccounts(ctx)]);
  const rows = data ?? [];
  const paid = await payableBalances(ctx, rows.map((r) => r.id));
  const { data: payments } = rows.length
    ? await ctx.supabase.from("outgoing_payments").select("id, payable_id, amount, payment_method, paid_at, reversed_at").in("payable_id", rows.map((r) => r.id)).order("paid_at", { ascending: false })
    : { data: [] as { id: string; payable_id: string; amount: string; payment_method: string; paid_at: string; reversed_at: string | null }[] };

  const pending = rows.filter((r) => ["requested", "pending_approval"].includes(r.status));
  const toPay = rows.filter((r) => ["approved", "partially_paid"].includes(r.status));
  const closed = rows.filter((r) => ["paid", "rejected", "cancelled"].includes(r.status));

  const header = (r: Row) => (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-medium">{r.description}</p>
        <p className="text-xs text-muted">{r.financial_categories?.name}{r.projects && ` · projeto ${r.projects.name}`}{r.supplier_name && ` · ${r.supplier_name}`} · solicitado por {r.requester?.full_name} em {formatDate(r.created_at)}{r.due_date && ` · vence ${formatDate(r.due_date)}`}</p>
      </div>
      <div className="flex items-center gap-2"><span className="tabular font-semibold">{formatDecimalBRL(r.amount)}</span><Badge tone={label(PAYABLE_STATUS, r.status)[1]}>{label(PAYABLE_STATUS, r.status)[0]}</Badge></div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {kind === "expense" && (
        <section aria-labelledby="pend">
          <h2 id="pend" className="mb-3 text-sm font-semibold text-muted">Aguardando aprovação ({pending.length})</h2>
          {pending.length === 0 ? <EmptyState title="Nenhuma solicitação pendente" /> : (
            <ul className="flex flex-col gap-3">{pending.map((r) => (
              <li key={r.id}><Card className="flex flex-col gap-3">
                {header(r)}
                <details><summary className="cursor-pointer text-xs text-muted">Comprovantes</summary><div className="mt-2"><Attachments resource="payable_id" resourceId={r.id} canUpload={false} /></div></details>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  {r.requested_by === ctx.userId ? <p className="text-xs text-muted">Você solicitou esta despesa — outro administrador deve aprová-la.</p>
                    : <ActionButton action={approveExpenseAction.bind(null, r.id)} label="Aprovar" variant="success" />}
                  <div className="flex-1"><ReasonForm kind="reject_expense" id={r.id} label="Rejeitar" /></div>
                </div>
              </Card></li>))}
            </ul>
          )}
        </section>
      )}
      <section aria-labelledby="pagar">
        <h2 id="pagar" className="mb-3 text-sm font-semibold text-muted">Aprovadas, aguardando pagamento ({toPay.length})</h2>
        {toPay.length === 0 ? <EmptyState title="Nada a pagar" /> : (
          <ul className="flex flex-col gap-3">{toPay.map((r) => {
            const balance = balanceString(r.amount, paid.get(r.id) ?? 0);
            return (
              <li key={r.id}><Card className="flex flex-col gap-3">
                {header(r)}
                <p className="text-sm text-muted">Pago: {formatBRL(paid.get(r.id) ?? 0)} · saldo: <strong className="text-fg">{formatDecimalBRL(balance)}</strong></p>
                {accounts.length ? <PayForm payableId={r.id} balance={balance} accounts={accounts} /> : <p className="text-xs text-warning">Cadastre uma conta financeira para registrar pagamentos.</p>}
                {(paid.get(r.id) ?? 0) === 0 && <details><summary className="cursor-pointer text-xs text-muted">Cancelar lançamento</summary><div className="mt-2"><ReasonForm kind="cancel_payable" id={r.id} label="Cancelar" /></div></details>}
              </Card></li>
            );
          })}</ul>
        )}
      </section>
      <section aria-labelledby="hist">
        <h2 id="hist" className="mb-3 text-sm font-semibold text-muted">Pagamentos registrados</h2>
        {(payments ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum pagamento.</p> : (
          <Card><ul className="divide-y divide-border text-sm">{payments!.map((p) => {
            const row = rows.find((r) => r.id === p.payable_id);
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{row?.description} <span className="text-xs text-muted">· {formatDateTime(p.paid_at)} · {PAYMENT_METHOD[p.payment_method]}</span></span>
                <span className="flex items-center gap-2"><span className="tabular">{formatDecimalBRL(p.amount)}</span>
                  {p.reversed_at ? <Badge tone="danger">Estornado</Badge> : <details><summary className="cursor-pointer text-xs text-muted">Estornar</summary><div className="mt-2 w-72"><ReasonForm kind="reverse_payment" id={p.id} label="Estornar" /></div></details>}
                </span>
              </li>
            );
          })}</ul></Card>
        )}
      </section>
      <section aria-labelledby="enc">
        <h2 id="enc" className="mb-3 text-sm font-semibold text-muted">Encerradas</h2>
        <Card><ul className="divide-y divide-border text-sm">{closed.slice(0, 50).map((r) => (
          <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{r.description}{r.rejection_reason && <span className="text-xs text-muted"> · {r.rejection_reason}</span>}</span><span className="flex items-center gap-2"><span className="tabular text-muted">{formatDecimalBRL(r.amount)}</span><Badge tone={label(PAYABLE_STATUS, r.status)[1]}>{label(PAYABLE_STATUS, r.status)[0]}</Badge></span></li>
        ))}{closed.length === 0 && <li className="py-2 text-muted">—</li>}</ul></Card>
      </section>
    </div>
  );
}

export function PayablesIntro({ kind }: { kind: "expense" | "direct_cost" }) {
  return (
    <CardTitle className="mb-4">{kind === "expense" ? "Lançar despesa administrativa (já autorizada)" : "Lançar custo direto"}</CardTitle>
  );
}
