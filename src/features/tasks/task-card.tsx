import Link from "next/link";
import { CalendarClock, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { ActionButton } from "@/components/ui/server-form";
import { TASK_PRIORITY, TASK_STATUS, label } from "@/lib/labels";
import { formatDate, todayISO } from "@/lib/dates";
import { setTaskStatusAction } from "./actions";
import type { Person, TaskRow } from "@/server/services/tasks";

export function isOverdue(t: Pick<TaskRow, "due_date" | "status">, today = todayISO()) {
  return !!t.due_date && t.due_date < today && ["todo", "in_progress", "blocked"].includes(t.status);
}

/** Cartão de tarefa com ação rápida para o responsável (iniciar/concluir). */
export function TaskCard({ task, people, meId, groupName }: { task: TaskRow; people: Map<string, Person>; meId: string; groupName?: string }) {
  const assignee = people.get(task.assigned_to)?.full_name ?? "—";
  const creator = people.get(task.created_by)?.full_name ?? "—";
  const late = isOverdue(task);
  const next = task.assigned_to === meId ? (task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : null) : null;
  return (
    <article className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        {groupName && <p className="eyebrow mb-1 text-muted">{groupName}</p>}
        <Link href={`/tarefas/${task.id}`} className="font-display text-lg font-bold leading-6 hover:underline">{task.title}</Link>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span>{creator}</span><ArrowRight aria-label="designou para" className="size-3.5" strokeWidth={1.75} /><span className="text-fg">{task.assigned_to === meId ? "você" : assignee}</span>
          {task.due_date && <span className={late ? "inline-flex items-center gap-1 font-semibold text-danger" : "inline-flex items-center gap-1"}><CalendarClock aria-hidden className="size-3.5" strokeWidth={1.75} />{late ? "Atrasada · " : ""}{formatDate(task.due_date)}</span>}
        </p>
        {task.status === "blocked" && task.blocked_reason && <p className="mt-1 text-sm text-danger">Bloqueio: {task.blocked_reason}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Badge tone={label(TASK_PRIORITY, task.priority)[1]}>{label(TASK_PRIORITY, task.priority)[0]}</Badge>
        <Badge tone={label(TASK_STATUS, task.status)[1]}>{label(TASK_STATUS, task.status)[0]}</Badge>
        {next && <ActionButton action={setTaskStatusAction.bind(null, task.id)} hidden={{ status: next }} label={next === "done" ? "Concluir" : "Iniciar"} variant={next === "done" ? "primary" : "secondary"} />}
      </div>
    </article>
  );
}
