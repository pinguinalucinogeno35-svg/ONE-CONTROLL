"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";
import { inviteSchema, reasonSchema } from "@/lib/validation/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { log } from "@/server/logger";
import type { ActionResult } from "@/server/errors";

type Prev = ActionResult<unknown> | null;

/**
 * Convite de colaborador (sem autocadastro):
 * 1) registra o convite (rotina com autorização de admin, auditada);
 * 2) Supabase Auth envia o e-mail de convite (chave secreta, só no servidor);
 * 3) provisiona o perfil "invited", ativado no primeiro acesso.
 */
export async function inviteUserAction(_p: Prev, fd: FormData) {
  return runAction({ name: "invite_user", admin: true, schema: inviteSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { data: invitationId, error } = await ctx.supabase.rpc("create_user_invitation", { p_email: d.email, p_full_name: d.full_name, p_role: d.role });
    if (error) return { error };
    const admin = createAdminClient();
    const base = serverEnv().APP_URL ?? "";
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(d.email.toLowerCase(), { redirectTo: `${base}/auth/confirm?next=/redefinir-senha` });
    if (invErr || !invited.user) {
      log("error", "invite_failed", { code: invErr?.code, requestId: ctx.requestId });
      await ctx.supabase.rpc("revoke_user_invitation", { p_invitation_id: invitationId });
      return { error: { code: "22023", message: "Não foi possível enviar o convite (o e-mail pode já possuir conta)." } };
    }
    const { error: provErr } = await admin.rpc("provision_invited_profile", { p_invitation_id: invitationId, p_user_id: invited.user.id });
    if (provErr) return { error: provErr };
    revalidatePath("/vendedores");
    return { message: `Convite enviado para ${d.email}. Válido por 7 dias.` };
  });
}

export async function setUserStatusAction(userId: string, _p: Prev, fd: FormData) {
  const schema = z.object({ status: z.enum(["active", "suspended", "inactive"]), reason: reasonSchema });
  return runAction({ name: "set_user_status", admin: true, schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("admin_set_user_status", { p_user_id: userId, p_status: d.status, p_reason: d.reason });
    if (!error) {
      // Além do bloqueio imediato pelo status no banco (RLS/rotinas), bloqueia o
      // usuário no Supabase Auth: impede login e renovação de sessão (refresh token).
      const { error: e2 } = await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: d.status === "active" ? "none" : "876000h" });
      if (e2) log("warn", "auth_ban_update_failed", { userId, requestId: ctx.requestId, code: e2.code });
    }
    revalidatePath("/vendedores");
    return { error, message: "Status atualizado." };
  });
}

export async function setUserRoleAction(userId: string, _p: Prev, fd: FormData) {
  const schema = z.object({ role: z.enum(["admin", "seller"]), reason: reasonSchema });
  return runAction({ name: "set_user_role", admin: true, schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("admin_set_user_role", { p_user_id: userId, p_role: d.role, p_reason: d.reason });
    revalidatePath("/vendedores");
    return { error, message: "Papel atualizado (auditado). O usuário precisará de MFA se for administrador." };
  });
}

export async function revokeInvitationAction(id: string, _p: Prev, _fd: FormData) {
  return runAction({ name: "revoke_invitation", admin: true, schema: z.object({}), input: {} }, async (ctx) => {
    const { error } = await ctx.supabase.rpc("revoke_user_invitation", { p_invitation_id: id });
    revalidatePath("/vendedores");
    return { error };
  });
}
