import { requireAdmin } from "@/server/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { PayablesBoard, PayablesIntro } from "@/features/finance/payables-board";
import { RegisterPayableForm } from "@/features/finance/forms";
import { getCategories } from "@/server/services/finance";

export const metadata = { title: "Custos" };

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const ctx = await requireAdmin();
  const { projeto } = await searchParams;
  const projectId = projeto && /^[0-9a-f-]{36}$/i.test(projeto) ? projeto : undefined;
  const [categories, projects, clients] = await Promise.all([
    getCategories(ctx, "direct_cost"),
    ctx.supabase.from("projects").select("id, name").order("name").limit(1000),
    ctx.supabase.from("clients").select("id, company_name").neq("status", "archived").order("company_name").limit(1000),
  ]);
  return (
    <>
      <PageHeader eyebrow="Financeiro / Custos" title="Custos diretos" description="Custos ligados à prestação dos serviços (exclusivo da administração). Aparecem separados das despesas nos relatórios." />
      <Card className="mb-6"><PayablesIntro kind="direct_cost" />
        <RegisterPayableForm kind="direct_cost" categories={categories} defaultProject={projectId}
          projects={projectId ? undefined : (projects.data ?? []).map((p) => ({ id: p.id, name: p.name }))}
          clients={(clients.data ?? []).map((c) => ({ id: c.id, name: c.company_name }))} />
      </Card>
      <PayablesBoard ctx={ctx} kind="direct_cost" projectId={projectId} />
    </>
  );
}
