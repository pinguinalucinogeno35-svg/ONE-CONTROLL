import Link from "next/link";
import type { ActiveContext } from "@/server/auth/session";
import { Card, CardTitle } from "@/components/ui";
import { TASK_COLUMNS, getAllGroups, getPeople, type TaskRow } from "@/server/services/tasks";
import { TaskCard } from "./task-card";

/** Tarefas abertas designadas ao usuário (dashboard de admin e de vendedor). */
export async function MyTasks({ ctx }: { ctx: ActiveContext }) {
  const [{ data }, people, groups] = await Promise.all([
    ctx.supabase.from("tasks").select(TASK_COLUMNS).eq("assigned_to", ctx.userId).in("status", ["todo", "in_progress", "blocked"])
      .order("due_date", { ascending: true, nullsFirst: false }).limit(5).returns<TaskRow[]>(),
    getPeople(ctx), getAllGroups(ctx),
  ]);
  const rows = data ?? [];
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  return (
    <Card className="mb-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Minhas tarefas</CardTitle>
        <div className="flex gap-3 text-sm font-semibold">
          <Link href="/tarefas/nova" className="text-link hover:underline">Nova tarefa</Link>
          <Link href="/tarefas" className="text-link hover:underline">Ver todas</Link>
        </div>
      </div>
      {rows.length === 0 ? <p className="text-muted">Nenhuma tarefa aberta para você.</p> : (
        <div className="flex flex-col gap-3">{rows.map((t) => <TaskCard key={t.id} task={t} people={people} meId={ctx.userId} groupName={groupName.get(t.group_id)} />)}</div>
      )}
    </Card>
  );
}
