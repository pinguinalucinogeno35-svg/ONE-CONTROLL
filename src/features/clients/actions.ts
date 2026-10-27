"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";
import { clientSchema, reasonSchema, uuid } from "@/lib/validation/schemas";
import type { ActionResult } from "@/server/errors";

export async function createClientAction(_prev: ActionResult<unknown> | null, fd: FormData) {
  return runAction({ name: "create_client", schema: clientSchema, input: formDataToObject(fd) }, async (ctx, data) => {
    const payload = { ...data, seller_id: ctx.profile.role === "admin" ? data.seller_id ?? ctx.userId : undefined };
    const { data: id, error } = await ctx.supabase.rpc("create_client", { p: payload });
    if (!error) revalidatePath("/clientes");
    return { data: id as string, error };
  });
}

const updateSchema = clientSchema.omit({ seller_id: true, service_ids: true });

export async function updateClientAction(clientId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  return runAction({ name: "update_client", schema: updateSchema, input: formDataToObject(fd) }, async (ctx, data) => {
    // UPDATE direto: RLS restringe à carteira e grants limitam às colunas de contato.
    const { data: rows, error } = await ctx.supabase.from("clients").update({
      contact_name: data.contact_name, company_name: data.company_name, email: data.email ?? null, whatsapp: data.whatsapp ?? null,
      instagram: data.instagram ?? null, website: data.website ?? null, tax_id: data.tax_id ?? null,
      business_description: data.business_description ?? null, lead_source: data.lead_source ?? null,
    }).eq("id", z.uuid().parse(clientId)).select("id");
    if (!error && !rows?.length) return { error: { code: "P0002", message: "Cliente não encontrado" } };
    revalidatePath(`/clientes/${clientId}`);
    return { error, message: "Dados atualizados." };
  });
}

export async function setClientStatusAction(clientId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  const schema = z.object({ status: z.enum(["pending_completion", "lead", "active", "inactive", "archived"]) });
  return runAction({ name: "set_client_status", schema, input: formDataToObject(fd) }, async (ctx, data) => {
    const { error } = await ctx.supabase.rpc("set_client_status", { p_client_id: clientId, p_status: data.status });
    revalidatePath(`/clientes/${clientId}`);
    return { error, message: "Status atualizado." };
  });
}

export async function transferClientAction(clientId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  const schema = z.object({ new_seller_id: uuid, reason: reasonSchema });
  return runAction({ name: "transfer_client", admin: true, schema, input: formDataToObject(fd) }, async (ctx, data) => {
    const { error } = await ctx.supabase.rpc("transfer_client", { p_client_id: clientId, p_new_seller_id: data.new_seller_id, p_reason: data.reason });
    revalidatePath(`/clientes/${clientId}`);
    return { error, message: "Cliente transferido. Comissões históricas permanecem com o vendedor original." };
  });
}

export async function updateInterestsAction(clientId: string, _prev: ActionResult<unknown> | null, fd: FormData) {
  const schema = z.object({ service_ids: z.array(uuid).max(30).default([]) });
  return runAction({ name: "update_interests", schema, input: formDataToObject(fd) }, async (ctx, data) => {
    const { data: current, error: e1 } = await ctx.supabase.from("client_service_interests").select("service_id").eq("client_id", clientId);
    if (e1) return { error: e1 };
    const have = new Set((current ?? []).map((r) => r.service_id as string));
    const want = new Set(data.service_ids);
    const toDelete = [...have].filter((s) => !want.has(s));
    const toInsert = [...want].filter((s) => !have.has(s)).map((service_id) => ({ client_id: clientId, service_id }));
    if (toDelete.length) {
      const { error } = await ctx.supabase.from("client_service_interests").delete().eq("client_id", clientId).in("service_id", toDelete);
      if (error) return { error };
    }
    if (toInsert.length) {
      const { error } = await ctx.supabase.from("client_service_interests").insert(toInsert);
      if (error) return { error };
    }
    revalidatePath(`/clientes/${clientId}`);
    return { message: "Serviços atualizados." };
  });
}
