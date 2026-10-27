import { requireActiveUser } from "@/server/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { NewClientForm } from "@/features/clients/new-client-form";

export const metadata = { title: "Novo cliente" };

export default async function NewClientPage() {
  const ctx = await requireActiveUser();
  const [{ data: services }, sellersRes] = await Promise.all([
    ctx.supabase.from("services").select("id, name").eq("active", true).order("name"),
    ctx.profile.role === "admin"
      ? ctx.supabase.from("profiles").select("id, full_name").eq("status", "active").order("full_name")
      : Promise.resolve({ data: undefined }),
  ]);
  return (
    <>
      <PageHeader title="Novo cliente" description="Prefere que o cliente preencha? Gere um link de formulário em Clientes → Links de cadastro." />
      <Card><NewClientForm services={services ?? []} sellers={sellersRes.data ?? undefined} /></Card>
    </>
  );
}
