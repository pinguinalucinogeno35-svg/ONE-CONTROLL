"use server";

import { revalidatePath } from "next/cache";
import { runAction, formDataToObject } from "@/server/action";
import { reasonSchema, sessionSchema, uuid } from "@/lib/validation/schemas";
import { localToISO } from "@/lib/calendar";
import { z } from "zod";
import type { ActionResult } from "@/server/errors";

type Prev = ActionResult<unknown> | null;

// Agendar e alterar sessões é da gestão (banco: require_admin). Conflitos são avisos.
export async function saveSessionAction(sessionId: string | null, _p: Prev, fd: FormData) {
  return runAction({ name: "save_session", admin: true, schema: sessionSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { date, start_time, end_time, ...rest } = d;
    const { data, error } = await ctx.supabase.rpc("save_session", {
      p_session: sessionId ? uuid.parse(sessionId) : null,
      p: { ...rest, starts_at: localToISO(date, start_time), ends_at: localToISO(date, end_time) },
    });
    revalidatePath("/calendario");
    const res = data as { id: string; conflicts: unknown[] } | null;
    if (res?.id) revalidatePath(`/calendario/${res.id}`);
    return { data: res?.id, error, message: res && res.conflicts.length > 0 ? "Sessão salva com avisos de agenda (veja abaixo)." : "Sessão salva. Os participantes foram avisados." };
  });
}

export async function cancelSessionAction(sessionId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "cancel_session", admin: true, schema: z.object({ reason: reasonSchema }), input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("cancel_session", { p_session: uuid.parse(sessionId), p_reason: d.reason });
    revalidatePath("/calendario");
    revalidatePath(`/calendario/${sessionId}`);
    return { error, message: "Sessão cancelada. Os participantes foram avisados." };
  });
}
