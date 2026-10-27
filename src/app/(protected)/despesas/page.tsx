import { requireActiveUser } from "@/server/auth/session";
import { Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { RequestExpenseForm, ReasonForm } from "@/features/finance/forms";
import { getCategories } from "@/server/services/finance";
import { Attachments } from "@/features/files/attachments";
import { PAYABLE_STATUS, label } from "@/lib/labels";
import { formatDecimalBRL } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Minhas despesas" };

export default async function MyExpensesPage() {
  const ctx = await requireActiveUser();
  const [categories, clients, mine] = await Promise.all([
    getCategories(ctx, "expense"),
    ctx.supabase.from("clients").select("id, company_name").neq("status", "archived").order("company_name").limit(500),
    ctx.supabase.from("payables").select("id, description, amount, status, created_at, rejection_reason, financial_categories(name)").eq("requested_by", ctx.userId).eq("kind", "expense").order("created_at", { ascending: false }).limit(100),
  ]);
  return (
    <>
      <PageHeader title="Minhas despesas" description="Solicite reembolsos e anexe comprovantes. A administração aprova e confirma o pagamento." />
      <Card className="mb-6"><CardTitle className="mb-4">Nova solicitação</CardTitle><RequestExpenseForm categories={categories} clients={(clients.data ?? []).map((c) => ({ id: c.id, name: c.company_name }))} /></Card>
      {(mine.data ?? []).length === 0 ? <EmptyState title="Nenhuma solicitação ainda" /> : (
        <ul className="flex flex-col gap-3">
          {mine.data!.map((p) => {
            const row = p as unknown as { id: string; description: string; amount: string; status: string; created_at: string; rejection_reason: string | null; financial_categories: { name: string } | null };
            return (
              <li key={row.id}><Card className="flex flex-col gap-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div><p className="font-medium">{row.description}</p><p className="text-xs text-muted">{row.financial_categories?.name} · {formatDate(row.created_at)}{row.rejection_reason && ` · motivo: ${row.rejection_reason}`}</p></div>
                  <div className="flex items-center gap-2"><span className="tabular">{formatDecimalBRL(row.amount)}</span><Badge tone={label(PAYABLE_STATUS, row.status)[1]}>{label(PAYABLE_STATUS, row.status)[0]}</Badge></div>
                </div>
                <Attachments resource="payable_id" resourceId={row.id} canUpload={["requested", "pending_approval", "approved"].includes(row.status)} />
                {["requested", "pending_approval"].includes(row.status) && <details><summary className="cursor-pointer text-xs text-muted">Cancelar solicitação</summary><div className="mt-2"><ReasonForm kind="cancel_payable" id={row.id} label="Cancelar" /></div></details>}
              </Card></li>
            );
          })}
        </ul>
      )}
    </>
  );
}
