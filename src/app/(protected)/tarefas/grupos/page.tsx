import { requireAdmin } from "@/server/auth/session";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { TaskGroupForm } from "@/features/tasks/forms";
import { getAllGroups } from "@/server/services/tasks";

export const metadata = { title: "Grupos de tarefas" };

export default async function TaskGroupsPage() {
  const ctx = await requireAdmin();
  const [groups, counts] = await Promise.all([
    getAllGroups(ctx),
    ctx.supabase.from("tasks").select("group_id").in("status", ["todo", "in_progress", "blocked"]),
  ]);
  const open = new Map<string, number>();
  for (const r of counts.data ?? []) open.set(r.group_id, (open.get(r.group_id) ?? 0) + 1);
  return (
    <>
      <PageHeader eyebrow="Operação / Grupos" title="Grupos de tarefas"
        description="Organize o trabalho por área. Defina em quais grupos os vendedores podem criar e designar tarefas." />
      <Card className="mb-6"><CardTitle className="mb-4">Novo grupo</CardTitle><TaskGroupForm /></Card>
      <ul className="flex flex-col gap-3">
        {groups.map((g) => (
          <li key={g.id}><Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-display text-lg font-bold">{g.name}</p>
                {g.description && <p className="text-sm text-muted">{g.description}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">{open.get(g.id) ?? 0} aberta(s)</Badge>
                <Badge tone={g.sellers_can_assign ? "success" : "neutral"}>{g.sellers_can_assign ? "Vendedores podem designar" : "Somente administração"}</Badge>
                {!g.active && <Badge tone="warning">Inativo</Badge>}
              </div>
            </div>
            <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-link">Editar grupo</summary><div className="mt-4"><TaskGroupForm group={g} /></div></details>
          </Card></li>
        ))}
      </ul>
    </>
  );
}
