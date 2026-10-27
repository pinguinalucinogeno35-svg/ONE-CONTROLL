"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";
import type { ActionResult } from "@/server/errors";

const schema = z.object({
  label: z.string().trim().max(120).optional(),
  valid_days: z.coerce.number().int().min(1).max(90).default(30),
  max_uses: z.coerce.number().int().min(1).max(1000).optional().or(z.literal("").transform(() => undefined)),
});

export type LeadLinkResult = { url: string | null; expires_at: string };

export async function createLeadLinkAction(_prev: ActionResult<unknown> | null, fd: FormData) {
  return runAction({ name: "create_lead_link", schema, input: formDataToObject(fd) }, async (ctx, data) => {
    const { data: rows, error } = await ctx.supabase.rpc("create_lead_capture_link", {
      p_label: data.label ?? null, p_valid_days: data.valid_days, p_max_uses: data.max_uses ?? null, p_seller_id: null,
    });
    if (error) return { error };
    const row = (rows as { link_id: string; token: string; expires_at: string }[])[0]!;
    const { data: setting } = await ctx.supabase.from("system_settings").select("setting_value").eq("setting_key", "google_forms.lead_form").maybeSingle();
    const cfg = (setting?.setting_value ?? {}) as { form_url?: string | null; token_entry_id?: string | null };
    // O token só é exibido agora; o banco guarda apenas o hash.
    const url = cfg.form_url && cfg.token_entry_id
      ? `${cfg.form_url}?usp=pp_url&entry.${encodeURIComponent(cfg.token_entry_id)}=${row.token}`
      : null;
    revalidatePath("/clientes/links");
    return { data: { url, expires_at: row.expires_at } satisfies LeadLinkResult };
  });
}

export async function revokeLeadLinkAction(linkId: string, _prev: ActionResult<unknown> | null, _fd: FormData) {
  return runAction({ name: "revoke_lead_link", schema: z.any(), input: null }, async (ctx) => {
    const { error } = await ctx.supabase.rpc("revoke_lead_capture_link", { p_link_id: linkId });
    revalidatePath("/clientes/links");
    return { error };
  });
}
