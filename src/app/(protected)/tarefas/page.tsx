import Link from "next/link";
import { requireActiveUser } from "@/server/auth/session";
import { EmptyState, LinkButton, PageHeader, Select, Stat } from "@/components/ui";
import { TaskCard, isOverdue } from "@/features/tasks/task-card";
import { TASK_COLUMNS, getAllGroups, getPeople, type TaskRow } from "@/server/services/tasks";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tarefas" };

type SP = Promise<{ aba?: string; grupo?: string; situacao?: string }>;
const OPEN = ["todo", "in_progress", "blocked"];

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireActiveUser();
  const sp = await searchParams;
  const isAdmin = ctx.profile.role === "admin";
  const tab = sp.aba === "criadas" ? "criadas" : sp.aba === "todas" && isAdmin ? "todas" : "minhas";
  const situacao = sp.situacao === "concluidas" ? "concluidas" : sp.situacao === "todas" ? "todas" : "abertas";

  // RLS: vendedor só recebe as tarefas que criou ou recebeu; admin, todas.
  let q = ctx.supabase.from("tasks").select(TASK_COLUMNS).order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(300);
  if (tab === "minhas") q = q.eq("assigned_to", ctx.userId);
  if (tab === "criadas") q = q.eq("created_by", ctx.userId);
  if (situacao === "abertas") q = q.in("status", OPEN);
  if (situacao === "concluidas") q = q.in("status", ["done", "cancelled"]);
  if (sp.grupo && /^[0-9a-f-]{36}$/i.test(sp.grupo)) q = q.eq("group_id", sp.grupo);

  const [{ data }, groups, people, mine] = await Promise.all([
    q.returns<TaskRow[]>(), getAllGroups(ctx), getPeople(ctx),
    ctx.supabase.from("tasks").select("status, due_date").eq("assigned_to", ctx.userId).in("status", OPEN),
  ]);
  const rows = data ?? [];
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const byGroup = new Map<string, TaskRow[]>();
  for (const t of rows) byGroup.set(t.group_id, [...(byGroup.get(t.group_id) ?? []), t]);
  const myOpen = (mine.data ?? []) as Pick<TaskRow, "status" | "due_date">[];

  const tabs = [["minhas", "Para mim"], ["criadas", "Criadas por mim"], ...(isAdmin ? [["todas", "Todas"]] : [])] as [string, string][];
  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(Object.entries({ aba: tab, grupo: sp.grupo, situacao, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/tarefas?${params}`;
  };

  return (
    <>
      <PageHeader eyebrow="Operação / Tarefas" title="Tarefas" description="Designe trabalho por grupo. Quem recebe é notificado na hora."
        actions={<>
          {isAdmin && <LinkButton variant="secondary" href="/tarefas/grupos">Grupos</LinkButton>}
          <LinkButton href="/tarefas/nova">Nova tarefa</LinkButton>
        </>} />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Para mim, abertas" value={myOpen.length} />
        <Stat label="Em andamento" value={myOpen.filter((t) => t.status === "in_progress").length} />
        <Stat label="Atrasadas" value={myOpen.filter((t) => isOverdue(t)).length} tone={myOpen.some((t) => isOverdue(t)) ? "danger" : undefined} />
      </div>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Visão" className="flex gap-1 rounded-[var(--radius-control)] border border-border bg-surface p-1">
          {tabs.map(([k, l]) => (
            <Link key={k} href={href({ aba: k })} aria-current={tab === k ? "page" : undefined}
              className={cn("flex min-h-10 flex-1 items-center justify-center rounded-[var(--radius-detail)] px-4 text-sm font-semibold text-muted hover:text-fg sm:flex-none", tab === k && "bg-primary text-on-primary hover:text-on-primary")}>
              {l}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap gap-2" action="/tarefas">
          <input type="hidden" name="aba" value={tab} />
          <label className="sr-only" htmlFor="grupo">Grupo</label>
          <Select id="grupo" name="grupo" defaultValue={sp.grupo ?? ""} className="w-auto min-w-44">
            <option value="">Todos os grupos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.active ? "" : " (inativo)"}</option>)}
          </Select>
          <label className="sr-only" htmlFor="situacao">Situação</label>
          <Select id="situacao" name="situacao" defaultValue={situacao} className="w-auto">
            <option value="abertas">Abertas</option><option value="concluidas">Concluídas e canceladas</option><option value="todas">Todas</option>
          </Select>
          <button className="min-h-11 rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 text-sm font-semibold hover:bg-elevated">Filtrar</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={tab === "minhas" ? "Nenhuma tarefa para você por aqui." : "Nenhuma tarefa encontrada."}
          description="Crie uma tarefa, escolha o grupo e designe para alguém da equipe." action={<LinkButton href="/tarefas/nova">Nova tarefa</LinkButton>} />
      ) : (
        <div className="flex flex-col gap-8">
          {[...byGroup.entries()].sort((a, b) => (groupName.get(a[0]) ?? "").localeCompare(groupName.get(b[0]) ?? "")).map(([gid, tasks]) => (
            <section key={gid} aria-labelledby={`g-${gid}`}>
              <h2 id={`g-${gid}`} className="eyebrow mb-3 flex items-center gap-2 text-muted">
                <span aria-hidden className="h-0.5 w-6 bg-primary" />{groupName.get(gid) ?? "Grupo"} · {tasks.length}
              </h2>
              <div className="flex flex-col gap-3">{tasks.map((t) => <TaskCard key={t.id} task={t} people={people} meId={ctx.userId} />)}</div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
