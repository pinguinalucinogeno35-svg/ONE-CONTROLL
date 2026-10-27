import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveUser } from "@/server/auth/session";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { PROJECT_STATUS, TASK_STATUS, PAYABLE_STATUS, label } from "@/lib/labels";
import { formatDate } from "@/lib/dates";
import { formatDecimalBRL } from "@/lib/money";
import { EditProjectForm, NewTaskForm, TaskStatusButtons } from "@/features/projects/forms";
import { Attachments } from "@/features/files/attachments";

export const metadata = { title: "Projeto" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireActiveUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: p } = await ctx.supabase.from("projects").select("*, clients(id, company_name)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const isAdmin = ctx.profile.role === "admin";
  const [tasks, members, costs] = await Promise.all([
    ctx.supabase.from("project_tasks").select("id, title, status, priority, due_date, assigned_to, profiles(full_name)").eq("project_id", id).order("created_at"),
    isAdmin ? ctx.supabase.from("profiles").select("id, full_name").eq("status", "active").order("full_name") : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    // Custos diretos: visíveis apenas para administradores (RLS).
    isAdmin ? ctx.supabase.from("payables").select("id, description, amount, status").eq("project_id", id).eq("kind", "direct_cost") : Promise.resolve({ data: [] as { id: string; description: string; amount: string; status: string }[] }),
  ]);
  const m = (members.data ?? []).map((x) => ({ id: x.id, name: x.full_name }));
  return (
    <>
      <PageHeader eyebrow="Operação / Projeto" title={p.name} description={`Cliente: ${p.clients?.company_name ?? "—"} · entrega ${formatDate(p.due_date)}`}
        actions={<Badge tone={label(PROJECT_STATUS, p.status)[1]}>{label(PROJECT_STATUS, p.status)[0]}</Badge>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle className="mb-3">Tarefas</CardTitle>
          {(tasks.data ?? []).length === 0 ? <p className="mb-4 text-sm text-muted">Nenhuma tarefa.</p> : (
            <ul className="mb-4 divide-y divide-border text-sm">
              {tasks.data!.map((t) => {
                const row = t as unknown as { id: string; title: string; status: string; due_date: string | null; assigned_to: string | null; profiles: { full_name: string } | null };
                return (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{row.title} <span className="text-xs text-muted">· {row.profiles?.full_name ?? "sem responsável"} · {formatDate(row.due_date)}</span></span>
                    <span className="flex items-center gap-2">
                      <Badge tone={label(TASK_STATUS, row.status)[1]}>{label(TASK_STATUS, row.status)[0]}</Badge>
                      {(isAdmin || row.assigned_to === ctx.userId) && <TaskStatusButtons projectId={p.id} taskId={row.id} status={row.status} />}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {isAdmin && <NewTaskForm projectId={p.id} members={m} />}
        </Card>
        <div className="flex flex-col gap-4">
          {isAdmin ? <Card><CardTitle className="mb-3">Dados do projeto</CardTitle><EditProjectForm project={p} members={m} /></Card>
            : <Card><CardTitle className="mb-2">Descrição</CardTitle><p className="whitespace-pre-line text-sm text-muted">{p.description ?? "—"}</p></Card>}
          {isAdmin && (
            <Card>
              <div className="mb-3 flex items-center justify-between"><CardTitle>Custos diretos</CardTitle><Link href={`/financeiro/custos?projeto=${p.id}`} className="text-xs text-primary underline">Lançar custo</Link></div>
              {(costs.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum custo lançado.</p> : (
                <ul className="divide-y divide-border text-sm">
                  {costs.data!.map((c) => <li key={c.id} className="flex justify-between gap-2 py-2"><span>{c.description}</span><span className="tabular text-muted">{formatDecimalBRL(c.amount)} · {label(PAYABLE_STATUS, c.status)[0]}</span></li>)}
                </ul>
              )}
            </Card>
          )}
        </div>
        <Card className="lg:col-span-3"><CardTitle className="mb-3">Documentos e entregas</CardTitle><Attachments resource="project_id" resourceId={p.id} canUpload={isAdmin} /></Card>
      </div>
    </>
  );
}
