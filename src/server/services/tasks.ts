import "server-only";
import type { ActiveContext } from "@/server/auth/session";

export type Person = { id: string; full_name: string; role: "admin" | "seller"; active: boolean };
export type TaskGroup = { id: string; name: string; description: string | null; sellers_can_assign: boolean; active: boolean };
export type TaskRow = {
  id: string; title: string; description: string | null; status: string; priority: string; due_date: string | null;
  group_id: string; assigned_to: string; created_by: string; blocked_reason: string | null; created_at: string; completed_at: string | null;
};

/** Diretório de colegas (nome e papel). Vendedores não leem `profiles` de outros via RLS. */
export async function getPeople(ctx: ActiveContext): Promise<Map<string, Person>> {
  const { data } = await ctx.supabase.rpc("people_directory");
  return new Map(((data ?? []) as Person[]).map((p) => [p.id, p]));
}

/** Grupos que o usuário pode usar ao criar/editar tarefas. */
export async function getUsableGroups(ctx: ActiveContext): Promise<TaskGroup[]> {
  let q = ctx.supabase.from("task_groups").select("id, name, description, sellers_can_assign, active").eq("active", true).order("name");
  if (ctx.profile.role !== "admin") q = q.eq("sellers_can_assign", true);
  const { data } = await q;
  return (data ?? []) as TaskGroup[];
}

export async function getAllGroups(ctx: ActiveContext): Promise<TaskGroup[]> {
  const { data } = await ctx.supabase.from("task_groups").select("id, name, description, sellers_can_assign, active").order("name");
  return (data ?? []) as TaskGroup[];
}

export const TASK_COLUMNS = "id, title, description, status, priority, due_date, group_id, assigned_to, created_by, blocked_reason, created_at, completed_at";
