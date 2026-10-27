"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";

import type { ActionResult } from "@/server/errors";

type Prev = ActionResult<unknown> | null;
const done = () => revalidatePath("/configuracoes");

export async function createServiceAction(_p: Prev, fd: FormData) {
  const schema = z.object({ name: z.string().trim().min(2).max(120), category: z.string().trim().max(80).optional(), service_type: z.enum(["one_time", "recurring", "hybrid"]), description: z.string().trim().max(2000).optional() });
  return runAction({ name: "create_service", admin: true, schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.from("services").insert({ ...d, organization_id: ctx.profile.organization_id });
    done();
    return { error, message: "Serviço cadastrado." };
  });
}

export async function toggleServiceAction(id: string, active: boolean, _p: Prev, _fd: FormData) {
  return runAction({ name: "toggle_service", admin: true, schema: z.object({}), input: {} }, async (ctx) => {
    const { error } = await ctx.supabase.from("services").update({ active }).eq("id", id);
    done();
    return { error };
  });
}

export async function createCategoryAction(_p: Prev, fd: FormData) {
  const schema = z.object({ name: z.string().trim().min(2).max(80), kind: z.enum(["expense", "direct_cost", "revenue"]) });
  return runAction({ name: "create_category", admin: true, schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.from("financial_categories").insert({ ...d, organization_id: ctx.profile.organization_id });
    done();
    return { error, message: "Categoria cadastrada." };
  });
}

export async function toggleCategoryAction(id: string, active: boolean, _p: Prev, _fd: FormData) {
  return runAction({ name: "toggle_category", admin: true, schema: z.object({}), input: {} }, async (ctx) => {
    const { error } = await ctx.supabase.from("financial_categories").update({ active }).eq("id", id);
    done();
    return { error };
  });
}

// Percentuais em % na interface → pontos-base inteiros (12,5% = 1250).
const pct = z.string().trim().transform((v, c) => {
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100 || Math.round(n * 100) !== n * 100) { c.addIssue({ code: "custom", message: "Percentual entre 0 e 100, até 2 casas" }); return z.NEVER; }
  return Math.round(n * 100);
});

const policySchema = z.object({
  name: z.string().trim().min(2).max(120),
  direct_rate_bps: pct, referral_rate_bps: pct, second_level_rate_bps: pct,
  base_rule: z.enum(["implementation_only", "first_month_only", "implementation_plus_first_month", "recurring_receipts", "all_eligible_receipts"]).optional().or(z.literal("").transform(() => undefined)),
  trigger_rule: z.enum(["on_receipt", "on_contract_approval"]).optional().or(z.literal("").transform(() => undefined)),
  recurring_limit_months: z.coerce.number().int().min(1).max(120).optional().or(z.literal("").transform(() => undefined)),
  requires_approval: z.literal("on").optional().transform((v) => v === "on"),
  refunds_reverse: z.literal("on").optional().transform((v) => v === "on"),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(2000).optional(),
});

function policyRow(d: z.output<typeof policySchema>) {
  return { ...d, base_rule: d.base_rule ?? null, trigger_rule: d.trigger_rule ?? null, recurring_limit_months: d.recurring_limit_months ?? null, notes: d.notes || null };
}

export async function createPolicyAction(_p: Prev, fd: FormData) {
  return runAction({ name: "create_policy", admin: true, schema: policySchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.from("commission_policies").insert({ ...policyRow(d), organization_id: ctx.profile.organization_id });
    done();
    return { error, message: "Nova versão de política criada como rascunho." };
  });
}

export async function updatePolicyAction(id: string, _p: Prev, fd: FormData) {
  return runAction({ name: "update_policy", admin: true, schema: policySchema, input: formDataToObject(fd) }, async (ctx, d) => {
    // RLS/policy: somente rascunhos podem ser editados.
    const { data, error } = await ctx.supabase.from("commission_policies").update(policyRow(d)).eq("id", id).eq("status", "draft").select("id");
    if (!error && !data?.length) return { error: { code: "42501", message: "Somente políticas em rascunho podem ser editadas" } };
    done();
    return { error, message: "Rascunho atualizado." };
  });
}

export async function activatePolicyAction(id: string, _p: Prev, _fd: FormData) {
  return runAction({ name: "activate_policy", admin: true, schema: z.object({}), input: {} }, async (ctx) => {
    const { error } = await ctx.supabase.rpc("activate_commission_policy", { p_policy_id: id });
    done();
    return { error, message: "Política ativada. Comissões passam a ser geradas pelos recebimentos elegíveis." };
  });
}

export async function saveGoogleFormsAction(_p: Prev, fd: FormData) {
  const schema = z.object({
    form_id: z.string().trim().regex(/^[A-Za-z0-9_-]{10,200}$/, "ID do formulário inválido"),
    form_url: z.url({ protocol: /^https$/ }).refine((u) => /^https:\/\/docs\.google\.com\/forms\//.test(u), "Use a URL do Google Forms (…/viewform)"),
    token_entry_id: z.string().trim().regex(/^\d{5,20}$/, "Informe apenas os números do entry (ex.: 123456789)"),
  });
  return runAction({ name: "save_google_forms", admin: true, schema, input: formDataToObject(fd) }, async (ctx, d) => {
    // Grants por coluna: atualização altera apenas setting_value/updated_by.
    const { data: rows, error: upErr } = await ctx.supabase.from("system_settings")
      .update({ setting_value: d, updated_by: ctx.userId }).eq("setting_key", "google_forms.lead_form").select("id");
    let error = upErr;
    if (!error && !rows?.length) {
      ({ error } = await ctx.supabase.from("system_settings").insert({ organization_id: ctx.profile.organization_id, setting_key: "google_forms.lead_form", setting_value: d, updated_by: ctx.userId }));
    }
    done();
    return { error, message: "Configuração do Google Forms salva." };
  });
}

export type SubjectLookup = { clients: { id: string; company_name: string; contact_name: string; email: string | null; whatsapp: string | null; status: string; created_at: string }[]; form_submissions: number };

export async function dataSubjectLookupAction(_p: Prev, fd: FormData) {
  const schema = z.object({ email: z.string().trim().max(254).optional(), whatsapp: z.string().trim().max(40).optional() })
    .refine((v) => v.email || v.whatsapp, { message: "Informe e-mail ou WhatsApp", path: ["email"] });
  return runAction({ name: "data_subject_lookup", admin: true, schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { data, error } = await ctx.supabase.rpc("data_subject_lookup", { p_email: d.email || null, p_whatsapp: d.whatsapp || null });
    return { data: data as SubjectLookup, error };
  });
}

