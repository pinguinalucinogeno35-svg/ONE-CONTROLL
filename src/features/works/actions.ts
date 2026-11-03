"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";
import { uuid, workItemSchema, workLinkSchema, workReviewSchema, workSchema, workStatusSchema, workVersionSchema } from "@/lib/validation/schemas";
import { templateFor, type WorkCategory } from "@/lib/works";
import type { ActionResult } from "@/server/errors";

type Prev = ActionResult<unknown> | null;

// Permissões e transições de estado são decididas pelas rotinas do banco
// (quem prepara, quem executa, quem revisa; sem autocertificação).
function refresh(workId?: string) {
  revalidatePath("/trabalhos");
  revalidatePath("/dashboard");
  if (workId) revalidatePath(`/trabalhos/${workId}`);
}

export async function createWorkAction(_p: Prev, fd: FormData) {
  return runAction({ name: "create_work", admin: true, schema: workSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const items = d.use_template ? templateFor(d.category as WorkCategory) : [];
    const { data, error } = await ctx.supabase.rpc("create_work", { p: { ...d, items } });
    refresh();
    return { data: data as string, error, message: "Trabalho criado. Os responsáveis foram avisados." };
  });
}

export async function updateWorkAction(workId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "update_work", schema: workSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const id = uuid.parse(workId);
    const { error } = await ctx.supabase.rpc("update_work", { p_work: id, p: { ...d, due_date: d.due_date ?? null } });
    if (!error) {
      const { error: aErr } = await ctx.supabase.rpc("set_work_assignees", { p_work: id, p_user_ids: d.assignees });
      refresh(id);
      return { error: aErr, message: "Ficha atualizada." };
    }
    refresh(id);
    return { error };
  });
}

export async function setWorkStatusAction(workId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "set_work_status", schema: workStatusSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("set_work_status", { p_work: uuid.parse(workId), p_status: d.status, p_note: d.note ?? null });
    refresh(workId);
    return { error };
  });
}

export async function setWorkBlockedAction(workId: string, _p: Prev, fd: FormData) {
  const schema = z.object({ reason: z.string().trim().max(500).optional() });
  return runAction({ name: "set_work_blocked", schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("set_work_blocked", { p_work: uuid.parse(workId), p_reason: d.reason || null });
    refresh(workId);
    return { error };
  });
}

export async function saveWorkItemAction(workId: string, itemId: string | null, _p: Prev, fd: FormData) {
  return runAction({ name: "save_work_item", schema: workItemSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("save_work_item", { p_work: uuid.parse(workId), p_item_id: itemId ? uuid.parse(itemId) : null, p: d });
    refresh(workId);
    return { error, message: itemId ? "Item atualizado." : "Item adicionado." };
  });
}

export async function removeWorkItemAction(workId: string, itemId: string, _p: Prev, _fd: FormData) {
  return runAction({ name: "remove_work_item", schema: z.object({ id: uuid }), input: { id: itemId } }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("remove_work_item", { p_item_id: d.id });
    refresh(workId);
    return { error };
  });
}

export async function setWorkItemDoneAction(workId: string, itemId: string, done: boolean, _p: Prev, _fd: FormData) {
  return runAction({ name: "set_work_item_done", schema: z.object({ id: uuid }), input: { id: itemId } }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("set_work_item_done", { p_item_id: d.id, p_done: done });
    refresh(workId);
    return { error };
  });
}

export async function addWorkLinkAction(workId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "add_work_link", schema: workLinkSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("add_work_link", { p_work: uuid.parse(workId), p: d });
    refresh(workId);
    return { error, message: "Link adicionado." };
  });
}

export async function removeWorkLinkAction(workId: string, linkId: string, _p: Prev, _fd: FormData) {
  return runAction({ name: "remove_work_link", schema: z.object({ id: uuid }), input: { id: linkId } }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("remove_work_link", { p_link_id: d.id });
    refresh(workId);
    return { error };
  });
}

export async function confirmWorkBackupAction(workId: string, linkId: string, _p: Prev, _fd: FormData) {
  return runAction({ name: "confirm_work_backup", schema: z.object({ id: uuid }), input: { id: linkId } }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("confirm_work_backup", { p_link_id: d.id });
    refresh(workId);
    return { error };
  });
}

export async function commentWorkAction(workId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "comment_work", schema: z.object({ text: z.string().trim().min(1, "Escreva o comentário").max(2000) }), input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("comment_work", { p_work: uuid.parse(workId), p_text: d.text });
    refresh(workId);
    return { error, message: "Comentário enviado." };
  });
}

export async function submitWorkVersionAction(workId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "submit_work_version", schema: workVersionSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("submit_work_version", { p_work: uuid.parse(workId), p: d });
    refresh(workId);
    return { error, message: "Versão enviada. Quem revisa foi avisado." };
  });
}

export async function reviewWorkVersionAction(workId: string, versionId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "review_work_version", schema: workReviewSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const feedback = d.feedback.filter((f) => f.body.length > 0);
    const { error } = await ctx.supabase.rpc("review_work_version", { p_version: uuid.parse(versionId), p: { ...d, feedback } });
    refresh(workId);
    return { error, message: d.decision === "approve" ? "Versão aprovada." : "Ajustes enviados para quem executa." };
  });
}

export async function completeWorkAction(workId: string, _p: Prev, _fd: FormData) {
  return runAction({ name: "complete_work", schema: z.object({ id: uuid }), input: { id: workId } }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("complete_work", { p_work: d.id });
    refresh(workId);
    return { error };
  });
}

export async function resolveWorkFeedbackAction(workId: string, feedbackId: string, _p: Prev, _fd: FormData) {
  return runAction({ name: "resolve_work_feedback", schema: z.object({ id: uuid }), input: { id: feedbackId } }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("resolve_work_feedback", { p_feedback: d.id, p_note: null });
    refresh(workId);
    return { error };
  });
}
