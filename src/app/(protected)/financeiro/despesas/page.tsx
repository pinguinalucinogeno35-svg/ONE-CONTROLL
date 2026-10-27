import { requireAdmin } from "@/server/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { PayablesBoard, PayablesIntro } from "@/features/finance/payables-board";
import { RegisterPayableForm } from "@/features/finance/forms";
import { getCategories } from "@/server/services/finance";

export const metadata = { title: "Despesas" };

export default async function ExpensesAdminPage() {
  const ctx = await requireAdmin();
  const categories = await getCategories(ctx, "expense");
  return (
    <>
      <PageHeader eyebrow="Financeiro / Despesas" title="Despesas operacionais" description="Solicitação → aprovação → pagamento. Aprovar não altera o caixa; somente a confirmação do pagamento." />
      <PayablesBoard ctx={ctx} kind="expense" />
      <Card className="mt-6"><PayablesIntro kind="expense" /><RegisterPayableForm kind="expense" categories={categories} /></Card>
    </>
  );
}
