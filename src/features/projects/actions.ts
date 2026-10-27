"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";
import { uuid } from "@/lib/validation/schemas";
import type { ActionResult } from "@/server/errors";

const optDate = z.string().optional().transform((v) => v || null).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const optUuid = z.string().optional().transform((v) => v || null).pipe(uuid.nullable());
const projectStatus = z.enum(["planning", "awaiting_approval", "approved", "in_progress", "in_review", "delivered", "on_hold", "cancelled"]);

const projectSchema = z.object({
  client_id: uuid,
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).optional().transform((v) => v || null),
  start_date: optDate, due_date: optDate, manager_id: optUuid,
}).refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, { message: "Entrega antes do início", path: ["due_date"] });

export async function createProjectAction(_prev: ActionResult<unknown> | null, fd: FormData) {
  return runAction({ name: "create_project", admin: true, schema: projectSchema, input: formDataToObject(fd) }, async (ctx, data) => {
    const { data: row, error } = await ctx.supabase.from("projects")
      .insert({ ...data, organization_id: ctx.profile.organization_id, created_by: ctx.userId, status: "planning" }).select("id").single();
    revalidatePath("/projetos");
    return { data: row?.id as string | undefined, error };
  });
}

export async function updateProjectAction(projectId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  const schema = z.object({
    name: z.string().trim().min(2).max(160), status: projectStatus,
    description: z.string().trim().max(4000).optional().transform((v) => v || null),
    start_date: optDate, due_date: optDate, manager_id: optUuid,
  });
  return runAction({ name: "update_project", admin: true, schema, input: formDataToObject(fd) }, async (ctx, data) => {
    const { data: current } = await ctx.supabase.from("projects").select("delivered_at, status").eq("id", projectId).single();
    const delivered_at = data.status === "delivered" ? (current?.delivered_at ?? new Date().toISOString()) : null;
    const { error } = await ctx.supabase.from("projects").update({ ...data, delivered_at }).eq("id", projectId);
    revalidatePath(`/projetos/${projectId}`);
    return { error, message: "Projeto atualizado." };
  });
}

export async function createTaskAction(projectId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  const schema = z.object({
    title: z.string().trim().min(2).max(200), assigned_to: optUuid, due_date: optDate,
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  });
  return runAction({ name: "create_task", admin: true, schema, input: formDataToObject(fd) }, async (ctx, data) => {
    const { error } = await ctx.supabase.from("project_tasks").insert({ ...data, project_id: projectId });
    revalidatePath(`/projetos/${projectId}`);
    return { error };
  });
}

export async function setTaskStatusAction(projectId: string, taskId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  const schema = z.object({ status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]) });
  return runAction({ name: "set_task_status", schema, input: formDataToObject(fd) }, async (ctx, data) => {
    // RLS: admin ou responsável pela tarefa.
    const { data: rows, error } = await ctx.supabase.from("project_tasks")
      .update({ status: data.status, completed_at: data.status === "done" ? new Date().toISOString() : null }).eq("id", taskId).select("id");
    if (!error && !rows?.length) return { error: { code: "42501", message: "Sem permissão para alterar esta tarefa" } };
    revalidatePath(`/projetos/${projectId}`);
    return { error };
  });
}
