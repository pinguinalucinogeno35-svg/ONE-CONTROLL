"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";
import { contractSchema, moneyInput, reasonSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/server/errors";

function parseJsonPayload(fd: FormData): unknown {
  try {
    return JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {
    return {};
  }
}

// Campos de comissão eventualmente enviados pelo navegador são descartados pelo
// schema (não existem nele) — a taxa oficial é definida pelo banco (Cenário I).
export async function createContractAction(_prev: ActionResult<unknown> | null, fd: FormData) {
  return runAction({ name: "create_contract", schema: contractSchema, input: parseJsonPayload(fd) }, async (ctx, data) => {
    const { data: id, error } = await ctx.supabase.rpc("create_contract", { p: data });
    if (!error) revalidatePath("/contratos");
    return { data: id as string, error };
  });
}

export async function updateContractDraftAction(contractId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  return runAction({ name: "update_contract_draft", schema: contractSchema, input: parseJsonPayload(fd) }, async (ctx, data) => {
    const { error } = await ctx.supabase.rpc("update_contract_draft", { p_contract_id: contractId, p: data });
    if (!error && data.submit) {
      const { error: e2 } = await ctx.supabase.rpc("submit_contract", { p_contract_id: contractId });
      if (e2) return { error: e2 };
    }
    revalidatePath(`/contratos/${contractId}`);
    return { data: contractId, error };
  });
}

const empty = z.object({});

export async function submitContractAction(contractId: string, _prev: ActionResult<unknown> | null, _fd: FormData) {
  return runAction({ name: "submit_contract", schema: empty, input: {} }, async (ctx) => {
    const { error } = await ctx.supabase.rpc("submit_contract", { p_contract_id: contractId });
    revalidatePath(`/contratos/${contractId}`);
    return { error };
  });
}

export async function approveContractAction(contractId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  const schema = z.object({ implementation_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)) });
  return runAction({ name: "approve_contract", admin: true, schema, input: formDataToObject(fd) }, async (ctx, data) => {
    const { error } = await ctx.supabase.rpc("approve_contract", { p_contract_id: contractId, p_implementation_due_date: data.implementation_due_date ?? null });
    revalidatePath(`/contratos/${contractId}`);
    return { error, message: "Contrato aprovado. Cobranças e agenda de mensalidades criadas." };
  });
}

export async function rejectContractAction(contractId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  return runAction({ name: "reject_contract", admin: true, schema: z.object({ reason: reasonSchema }), input: formDataToObject(fd) }, async (ctx, data) => {
    const { error } = await ctx.supabase.rpc("reject_contract", { p_contract_id: contractId, p_reason: data.reason });
    revalidatePath(`/contratos/${contractId}`);
    return { error };
  });
}

export async function cancelContractAction(contractId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  return runAction({ name: "cancel_contract", admin: true, schema: z.object({ reason: reasonSchema }), input: formDataToObject(fd) }, async (ctx, data) => {
    const { error } = await ctx.supabase.rpc("cancel_contract", { p_contract_id: contractId, p_reason: data.reason });
    revalidatePath(`/contratos/${contractId}`);
    return { error };
  });
}

export async function amendContractAction(contractId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  const schema = z.object({
    change_reason: reasonSchema,
    monthly_amount: moneyInput().optional(),
    delivery_due_date: z.string().optional().transform((v) => v || undefined),
    billing_day: z.coerce.number().int().min(1).max(31).optional().or(z.literal("").transform(() => undefined)),
    recurring_end_date: z.string().optional().transform((v) => v || undefined),
  });
  const raw = formDataToObject(fd);
  if (raw.monthly_amount === "") delete raw.monthly_amount;
  return runAction({ name: "amend_contract", admin: true, schema, input: raw }, async (ctx, data) => {
    const { error } = await ctx.supabase.rpc("amend_contract", { p_contract_id: contractId, p: data });
    revalidatePath(`/contratos/${contractId}`);
    return { error, message: "Aditivo registrado com nova versão do contrato." };
  });
}
