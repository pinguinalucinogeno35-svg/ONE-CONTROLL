import "server-only";
import type { ActiveContext } from "@/server/auth/session";
import { getPeople, type Person } from "@/server/services/tasks";
import type { ItemKind, VersionStatus, WorkCategory, WorkRole, WorkStatus } from "@/lib/works";

export type WorkRow = {
  id: string; title: string; category: WorkCategory; status: WorkStatus; client_id: string | null;
  objective: string | null; instructions: string | null; deliverable_format: string | null;
  due_original: string | null; due_current: string | null; estimated_hours: number | null;
  blocked_reason: string | null; reviewer_id: string | null; created_by: string; completed_at: string | null; created_at: string;
  work_assignees: { user_id: string }[];
  work_items: { id: string; kind: ItemKind; required: boolean; done: boolean }[];
  work_links: { kind: string; removed_at: string | null }[];
  work_versions: { number: number; status: VersionStatus }[];
  work_feedback: { resolved_at: string | null }[];
};

export type WorkDetail = Omit<WorkRow, "work_items" | "work_links" | "work_versions" | "work_feedback"> & {
  work_versions: { id: string; number: number; label: string | null; url: string; note: string | null; status: VersionStatus; submitted_by: string; submitted_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null }[];
  work_feedback: { id: string; version_id: string; location: string | null; body: string; created_by: string; created_at: string; resolved_at: string | null; resolved_by: string | null; resolved_note: string | null }[];
  work_items: { id: string; kind: ItemKind; position: number; title: string; body: string | null; required: boolean; done: boolean; done_by: string | null; done_at: string | null }[];
  work_links: { id: string; kind: string; label: string; url: string; note: string | null; created_by: string; created_at: string; backup_confirmed_at: string | null; removed_at: string | null }[];
  work_events: { id: string; actor_id: string | null; kind: string; body: string | null; data: Record<string, unknown> | null; created_at: string }[];
};

const BASE_COLUMNS = "id, title, category, status, client_id, objective, instructions, deliverable_format, due_original, due_current, estimated_hours, blocked_reason, reviewer_id, created_by, completed_at, created_at, work_assignees(user_id)";
const LIST_COLUMNS = `${BASE_COLUMNS}, work_items(id, kind, required, done), work_links(kind, removed_at), work_versions(number, status), work_feedback(resolved_at)`;

export type WorkFilters = { scope: "mine" | "review" | "all"; status?: string; category?: string; client?: string; person?: string };

/** Lista conforme RLS (cada um vê o que criou, revisa ou executa; administração vê tudo). */
export async function listWorks(ctx: ActiveContext, f: WorkFilters): Promise<WorkRow[]> {
  let q = ctx.supabase.from("works").select(LIST_COLUMNS).order("due_current", { ascending: true, nullsFirst: false }).limit(300);
  if (f.status === "open" || !f.status) q = q.not("status", "in", "(done,cancelled)");
  else if (f.status !== "any") q = q.eq("status", f.status);
  if (f.category) q = q.eq("category", f.category);
  if (f.client) q = q.eq("client_id", f.client);
  if (f.scope === "review") q = q.eq("reviewer_id", ctx.userId);
  const { data } = await q;
  let rows = (data ?? []) as unknown as WorkRow[];
  if (f.scope === "mine") rows = rows.filter((w) => w.work_assignees.some((a) => a.user_id === ctx.userId) || w.created_by === ctx.userId);
  if (f.person) rows = rows.filter((w) => w.work_assignees.some((a) => a.user_id === f.person));
  return rows;
}

export async function getWork(ctx: ActiveContext, id: string): Promise<WorkDetail | null> {
  const { data } = await ctx.supabase.from("works")
    .select(`${BASE_COLUMNS}, work_items(id, kind, position, title, body, required, done, done_by, done_at), work_links(id, kind, label, url, note, created_by, created_at, backup_confirmed_at, removed_at), work_events(id, actor_id, kind, body, data, created_at), work_versions(id, number, label, url, note, status, submitted_by, submitted_at, decided_by, decided_at, decision_note), work_feedback(id, version_id, location, body, created_by, created_at, resolved_at, resolved_by, resolved_note)`)
    .eq("id", id).maybeSingle();
  return (data as unknown as WorkDetail) ?? null;
}

/** Nomes de clientes visíveis (produção: apenas dos seus trabalhos; sem dados comerciais). */
export async function getClientNames(ctx: ActiveContext): Promise<Map<string, string>> {
  const { data } = await ctx.supabase.rpc("visible_client_names");
  return new Map(((data ?? []) as { id: string; company_name: string }[]).map((c) => [c.id, c.company_name]));
}

export async function getWorkContext(ctx: ActiveContext): Promise<{ people: Person[]; peopleById: Map<string, Person>; clients: Map<string, string> }> {
  const [peopleById, clients] = await Promise.all([getPeople(ctx), getClientNames(ctx)]);
  return { people: [...peopleById.values()], peopleById, clients };
}

export function roleIn(w: Pick<WorkRow, "created_by" | "reviewer_id" | "work_assignees">, ctx: ActiveContext): WorkRole | null {
  if (ctx.profile.role === "admin" || w.created_by === ctx.userId) return "manager";
  if (w.reviewer_id === ctx.userId) return "reviewer";
  return w.work_assignees.some((a) => a.user_id === ctx.userId) ? "assignee" : null;
}

export function workState(w: WorkRow, ctx: ActiveContext) {
  const live = w.work_links.filter((l) => !l.removed_at);
  const latest = [...w.work_versions].sort((a, b) => b.number - a.number)[0] ?? null;
  return {
    status: w.status,
    blocked: !!w.blocked_reason,
    missingRequired: w.work_items.filter((i) => i.required && !i.done).length,
    hasAssignees: w.work_assignees.length > 0,
    hasFinal: live.some((l) => l.kind === "final"),
    latestVersion: latest,
    openFeedback: w.work_feedback.filter((f) => !f.resolved_at).length,
    isAssignee: w.work_assignees.some((a) => a.user_id === ctx.userId),
    role: roleIn(w, ctx),
  };
}
