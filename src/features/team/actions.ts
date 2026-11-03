"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";
import { absenceSchema, teamProfileSchema, uuid } from "@/lib/validation/schemas";
import type { ActionResult } from "@/server/errors";

type Prev = ActionResult<unknown> | null;

// Regras (obrigatoriedade no primeiro acesso, formatos × horários, quem registra
// ausência de quem) ficam nas rotinas do banco; aqui só o formato dos dados.

export async function saveTeamProfileAction(_p: Prev, fd: FormData) {
  return runAction({ name: "save_team_profile", schema: teamProfileSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("save_my_team_profile", { p: d });
    revalidatePath("/perfil");
    revalidatePath("/equipe");
    return { error, message: d.complete ? "Tudo pronto. Bom trabalho!" : "Perfil de trabalho salvo." };
  });
}

export async function addAbsenceAction(_p: Prev, fd: FormData) {
  return runAction({ name: "add_absence", schema: absenceSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("add_absence", {
      p_starts: d.starts_on, p_ends: d.ends_on, p_reason: d.reason ?? null, p_user_id: d.user_id ?? null,
    });
    revalidatePath("/perfil");
    revalidatePath("/equipe");
    return { error, message: "Ausência registrada." };
  });
}

export async function cancelAbsenceAction(absenceId: string, _p: Prev, _fd: FormData) {
  return runAction({ name: "cancel_absence", schema: z.object({ id: uuid }), input: { id: absenceId } }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("cancel_absence", { p_absence_id: d.id });
    revalidatePath("/perfil");
    revalidatePath("/equipe");
    return { error };
  });
}
