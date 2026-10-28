import { notFound } from "next/navigation";
import { requireActiveUser } from "@/server/auth/session";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/server-form";
import { BlockTaskForm, CommentForm, EditTaskForm } from "@/features/tasks/forms";
import { setTaskStatusAction } from "@/features/tasks/actions";
import { isOverdue } from "@/features/tasks/task-card";
import { TASK_COLUMNS, getPeople, getUsableGroups, getAllGroups, type TaskRow } from "@/server/services/tasks";
import { TASK_PRIORITY, TASK_STATUS, label } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/dates";

export const metadata = { title: "Tarefa" };

type Ev = { id: string; actor_id: string | null; event_type: string; from_value: string | null; to_value: string | null; comment: string | null; created_at: string };
const STATUS_TEXT: Record<string, string> = { todo: "a fazer", in_progress: "em andamento", blocked: "bloqueada", done: "concluída", cancelled: "cancelada" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireActiveUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // RLS: só existe para admin, quem criou ou quem recebeu.
  const { data } = await ctx.supabase.from("tasks").select(TASK_COLUMNS).eq("id", id).maybeSingle();
  const task = data as TaskRow | null;
  if (!task) notFound();
  const [people, allGroups, usable, events] = await Promise.all([
    getPeople(ctx), getAllGroups(ctx), getUsableGroups(ctx),
    ctx.supabase.from("task_events").select("id, actor_id, event_type, from_value, to_value, comment, created_at").eq("task_id", id).order("created_at"),
  ]);
  const isAdmin = ctx.profile.role === "admin";
  const isCreator = task.created_by === ctx.userId;
  const isAssignee = task.assigned_to === ctx.userId;
  const canEdit = (isAdmin || isCreator) && !["done", "cancelled"].includes(task.status);
  const open = ["todo", "in_progress", "blocked"].includes(task.status);
  const group = allGroups.find((g) => g.id === task.group_id);
  const name = (uid: string | null) => (uid ? (uid === ctx.userId ? "Você" : people.get(uid)?.full_name ?? "—") : "Sistema");
  const groupsForEdit = group && !usable.some((g) => g.id === group.id) ? [group, ...usable] : usable;

  const describe = (e: Ev) => {
    switch (e.event_type) {
      case "created": return "criou a tarefa";
      case "assigned": return `designou para ${e.to_value}`;
      case "reassigned": return `transferiu de ${e.from_value} para ${e.to_value}`;
      case "status_changed": return `marcou como ${STATUS_TEXT[e.to_value ?? ""] ?? e.to_value}`;
      case "edited": return "editou a tarefa";
      default: return "comentou";
    }
  };
  const action = (status: string, text: string, variant: "primary" | "secondary" | "danger" = "secondary", confirm?: string) =>
    <ActionButton action={setTaskStatusAction.bind(null, task.id)} hidden={{ status }} label={text} variant={variant} confirm={confirm} />;

  return (
    <>
      <PageHeader eyebrow={`Tarefas / ${group?.name ?? "Grupo"}`} title={task.title}
        description={`${name(task.created_by)} designou para ${isAssignee ? "você" : name(task.assigned_to)}`}
        actions={<>
          <Badge tone={label(TASK_PRIORITY, task.priority)[1]}>Prioridade {label(TASK_PRIORITY, task.priority)[0].toLowerCase()}</Badge>
          <Badge tone={label(TASK_STATUS, task.status)[1]}>{label(TASK_STATUS, task.status)[0]}</Badge>
        </>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <div><dt className="eyebrow text-muted">Responsável</dt><dd className="mt-1 font-semibold">{name(task.assigned_to)}</dd></div>
              <div><dt className="eyebrow text-muted">Criada por</dt><dd className="mt-1">{name(task.created_by)}</dd></div>
              <div><dt className="eyebrow text-muted">Prazo</dt><dd className={isOverdue(task) ? "mt-1 font-semibold text-danger" : "mt-1"}>{task.due_date ? `${formatDate(task.due_date)}${isOverdue(task) ? " · atrasada" : ""}` : "Sem prazo"}</dd></div>
              <div><dt className="eyebrow text-muted">Criada em</dt><dd className="mt-1">{formatDate(task.created_at)}</dd></div>
            </dl>
            {task.description && <p className="mt-5 whitespace-pre-line border-t border-border pt-5">{task.description}</p>}
            {task.status === "blocked" && task.blocked_reason && <p className="mt-4 rounded-[var(--radius-control)] bg-danger-bg px-4 py-3 text-danger">Bloqueada: {task.blocked_reason}</p>}
          </Card>

          {(isAdmin || isCreator || isAssignee) && (
            <Card className="flex flex-col gap-4">
              <CardTitle>Andamento</CardTitle>
              <div className="flex flex-wrap gap-2">
                {task.status === "todo" && action("in_progress", "Iniciar", "primary")}
                {(task.status === "in_progress" || task.status === "blocked") && action("done", "Concluir", "primary")}
                {task.status === "blocked" && action("in_progress", "Retomar")}
                {(task.status === "done" || task.status === "cancelled") && action("todo", "Reabrir")}
                {open && (isAdmin || isCreator) && action("cancelled", "Cancelar tarefa", "danger", "Cancelar esta tarefa? O responsável será avisado.")}
              </div>
              {open && task.status !== "blocked" && (
                <details><summary className="cursor-pointer text-sm font-semibold text-link">Informar bloqueio</summary><div className="mt-3"><BlockTaskForm taskId={task.id} /></div></details>
              )}
            </Card>
          )}

          <Card className="flex flex-col gap-5">
            <CardTitle>Histórico e comentários</CardTitle>
            <ol className="flex flex-col gap-4 border-l-2 border-border pl-5">
              {((events.data ?? []) as Ev[]).map((e) => (
                <li key={e.id} className="relative">
                  <span aria-hidden className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-surface bg-primary" />
                  <p className="text-[15px]"><span className="font-semibold">{name(e.actor_id)}</span> {describe(e)}</p>
                  {e.comment && <p className="mt-1 whitespace-pre-line rounded-[var(--radius-control)] bg-elevated px-3 py-2 text-[15px]">{e.comment}</p>}
                  <p className="eyebrow mt-1 text-muted">{formatDateTime(e.created_at)}</p>
                </li>
              ))}
            </ol>
            <CommentForm taskId={task.id} />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {canEdit ? (
            <Card><CardTitle className="mb-4">Editar ou reatribuir</CardTitle>
              <EditTaskForm taskId={task.id} groups={groupsForEdit} people={[...people.values()].filter((p) => p.active)} meId={ctx.userId} isAdmin={isAdmin}
                values={{ title: task.title, description: task.description, group_id: task.group_id, assigned_to: task.assigned_to, priority: task.priority, due_date: task.due_date }} />
            </Card>
          ) : (
            <Card><CardTitle className="mb-2">Edição</CardTitle>
              <p className="text-sm text-muted">{["done", "cancelled"].includes(task.status) ? "Tarefa encerrada. Reabra para editar." : "Somente quem criou a tarefa ou um administrador pode editar ou reatribuir. Você pode atualizar o andamento e comentar."}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
