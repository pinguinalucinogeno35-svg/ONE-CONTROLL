"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/errors";
import { pushEndpointSchema, pushSubscriptionSchema } from "@/lib/validation/schemas";

export async function markAllReadAction(_p: ActionResult<unknown> | null, _fd: FormData) {
  return runAction({ name: "mark_notifications_read", schema: z.object({}), input: {} }, async (ctx) => {
    // RLS: somente as notificações do próprio usuário; grant permite alterar apenas read_at.
    const { error } = await ctx.supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).eq("recipient_user_id", ctx.userId);
    revalidatePath("/notificacoes");
    return { error };
  });
}

/** Registra este dispositivo para receber push (só o próprio usuário). */
export async function savePushSubscriptionAction(input: unknown) {
  return runAction({ name: "save_push_subscription", schema: pushSubscriptionSchema, input }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("save_push_subscription", {
      p_endpoint: d.endpoint, p_p256dh: d.keys.p256dh, p_auth: d.keys.auth, p_user_agent: d.userAgent ?? null,
    });
    return { error };
  });
}

export async function deletePushSubscriptionAction(endpoint: unknown) {
  return runAction({ name: "delete_push_subscription", schema: pushEndpointSchema, input: endpoint }, async (ctx, ep) => {
    const { error } = await ctx.supabase.rpc("delete_push_subscription", { p_endpoint: ep });
    return { error };
  });
}
