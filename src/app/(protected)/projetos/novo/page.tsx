import { requireAdmin } from "@/server/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { NewProjectForm } from "@/features/projects/forms";

export const metadata = { title: "Novo projeto" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const ctx = await requireAdmin();
  const { cliente } = await searchParams;
  const [clients, members] = await Promise.all([
    ctx.supabase.from("clients").select("id, company_name").neq("status", "archived").order("company_name").limit(1000),
    ctx.supabase.from("profiles").select("id, full_name").eq("status", "active").order("full_name"),
  ]);
  return (
    <>
      <PageHeader eyebrow="Operação / Projetos" title="Novo projeto" />
      <Card><NewProjectForm defaultClient={cliente} clients={(clients.data ?? []).map((c) => ({ id: c.id, name: c.company_name }))} members={(members.data ?? []).map((m) => ({ id: m.id, name: m.full_name }))} /></Card>
    </>
  );
}
