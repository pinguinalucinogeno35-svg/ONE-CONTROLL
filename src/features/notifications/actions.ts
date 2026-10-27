"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/errors";

export async function markAllReadAction(_p: ActionResult<unknown> | null, _fd: FormData) {
  return runAction({ name: "mark_notifications_read", schema: z.object({}), input: {} }, async (ctx) => {
    // RLS: somente as notificações do próprio usuário; grant permite alterar apenas read_at.
    const { error } = await ctx.supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).eq("recipient_user_id", ctx.userId);
    revalidatePath("/notificacoes");
    return { error };
  });
}
