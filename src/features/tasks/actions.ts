"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";
import { reasonSchema, taskGroupSchema, taskSchema, taskStatus, uuid } from "@/lib/validation/schemas";
import type { ActionResult } from "@/server/errors";

type Prev = ActionResult<unknown> | null;

// As regras (quem pode designar, em quais grupos, quem edita) ficam nas rotinas
// do banco; aqui só validamos o formato e repassamos com o JWT do usuário.

export async function createTaskAction(_p: Prev, fd: FormData) {
  return runAction({ name: "create_task", schema: taskSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { data, error } = await ctx.supabase.rpc("create_task", { p: d });
    revalidatePath("/tarefas");
    return { data: data as string, error, message: "Tarefa criada. O responsável foi notificado." };
  });
}

export async function updateTaskAction(taskId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "update_task", schema: taskSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    // due_date sempre enviado: vazio limpa o prazo.
    const { error } = await ctx.supabase.rpc("update_task", { p_task_id: z.uuid().parse(taskId), p: { ...d, due_date: d.due_date ?? null } });
    revalidatePath(`/tarefas/${taskId}`);
    revalidatePath("/tarefas");
    return { error, message: "Tarefa atualizada." };
  });
}

export async function setTaskStatusAction(taskId: string, _p: Prev, fd: FormData) {
  const schema = z.object({ status: taskStatus, note: z.string().trim().max(500).optional() });
  return runAction({ name: "set_task_status", schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("set_task_status", { p_task_id: taskId, p_status: d.status, p_note: d.note || null });
    revalidatePath(`/tarefas/${taskId}`);
    revalidatePath("/tarefas");
    revalidatePath("/dashboard");
    return { error };
  });
}

export async function commentTaskAction(taskId: string, _p: Prev, fd: FormData) {
  const schema = z.object({ comment: z.string().trim().min(1, "Escreva um comentário").max(2000) });
  return runAction({ name: "comment_task", schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("comment_task", { p_task_id: taskId, p_comment: d.comment });
    revalidatePath(`/tarefas/${taskId}`);
    return { error };
  });
}

export async function blockTaskAction(taskId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "block_task", schema: z.object({ reason: reasonSchema }), input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("set_task_status", { p_task_id: taskId, p_status: "blocked", p_note: d.reason });
    revalidatePath(`/tarefas/${taskId}`);
    return { error };
  });
}

export async function saveTaskGroupAction(groupId: string | null, _p: Prev, fd: FormData) {
  return runAction({ name: "save_task_group", admin: true, schema: taskGroupSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("save_task_group", {
      p_id: groupId ? uuid.parse(groupId) : null, p_name: d.name, p_description: d.description ?? null,
      p_sellers_can_assign: d.sellers_can_assign, p_active: groupId ? d.active : true,
    });
    revalidatePath("/tarefas/grupos");
    revalidatePath("/tarefas");
    return { error, message: groupId ? "Grupo atualizado." : "Grupo criado." };
  });
}
