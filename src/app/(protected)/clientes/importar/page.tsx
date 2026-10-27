import { requireActiveUser } from "@/server/auth/session";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { ImportForm } from "@/features/clients/import-form";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Importar clientes" };

export default async function ImportPage() {
  const ctx = await requireActiveUser();
  const isAdmin = ctx.profile.role === "admin";
  const [{ data: sellers }, { data: jobs }] = await Promise.all([
    isAdmin ? ctx.supabase.from("profiles").select("id, full_name").eq("status", "active").order("full_name") : Promise.resolve({ data: undefined }),
    ctx.supabase.from("import_jobs").select("id, file_name, status, total_rows, accepted_rows, rejected_rows, created_at").order("created_at", { ascending: false }).limit(10),
  ]);
  return (
    <>
      <PageHeader eyebrow="Comercial / Importação" title="Importar clientes" description="Alternativa ao Google Forms. Pré-visualize, revise os erros e confirme. O mesmo arquivo não é importado duas vezes." />
      <Card className="mb-6"><ImportForm sellers={sellers ?? undefined} /></Card>
      <Card>
        <CardTitle className="mb-3">Importações recentes</CardTitle>
        {(jobs ?? []).length === 0 ? <p className="text-sm text-muted">Nenhuma importação.</p> : (
          <ul className="divide-y divide-border text-sm">
            {jobs!.map((j) => (
              <li key={j.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{j.file_name}</span>
                <span className="text-muted">{j.accepted_rows}/{j.total_rows} aceitas · {formatDateTime(j.created_at)}</span>
                <Badge tone={j.status === "completed" ? "success" : j.status === "failed" ? "danger" : "warning"}>{j.status === "completed" ? "Concluída" : j.status === "failed" ? "Falhou" : "Com erros"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
