import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/permissions";
import { AppError } from "@/server/errors";

export type Profile = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: Role;
  status: "invited" | "active" | "suspended" | "inactive";
};

export type AuthContext = {
  userId: string;
  profile: Profile | null; // null = sem perfil ativo (inativo, suspenso ou convite pendente)
  aal: "aal1" | "aal2";
  mfaEnrolled: boolean;
  supabase: Awaited<ReturnType<typeof createClient>>;
  requestId: string;
};

/**
 * Identidade verificada no servidor (getClaims valida a assinatura do JWT).
 * O perfil é lido sob RLS: só retorna se o colaborador estiver ATIVO, então
 * sessões de usuários desativados perdem acesso imediatamente.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims as { sub: string; aal?: string };
  const [{ data: profile }, aalRes] = await Promise.all([
    supabase.from("profiles").select("id, organization_id, full_name, email, role, status").eq("id", claims.sub).maybeSingle<Profile>(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const requestId = (await headers()).get("x-request-id") ?? crypto.randomUUID();
  return {
    userId: claims.sub,
    profile: profile && profile.status === "active" ? profile : null,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    mfaEnrolled: aalRes.data?.nextLevel === "aal2",
    supabase,
    requestId,
  };
});

export type ActiveContext = AuthContext & { profile: Profile };

/** MFA: obrigatório para administradores; exigido de vendedores que o ativaram. */
function needsMfa(ctx: ActiveContext): boolean {
  if (ctx.aal === "aal2") return false;
  return ctx.profile.role === "admin" || ctx.mfaEnrolled;
}

/** Guarda de páginas: redireciona quando não autorizado. */
export async function requireActiveUser(opts: { admin?: boolean } = {}): Promise<ActiveContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.profile) redirect("/login?erro=inativo");
  const active = ctx as ActiveContext;
  if (needsMfa(active)) redirect("/verificar-mfa");
  if (opts.admin && active.profile.role !== "admin") redirect("/dashboard?erro=acesso");
  return active;
}

export async function requireAdmin(): Promise<ActiveContext> {
  return requireActiveUser({ admin: true });
}

/** Guarda de Server Actions / Route Handlers: lança AppError (sem redirecionar). */
export async function authorizeAction(opts: { admin?: boolean } = {}): Promise<ActiveContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AppError("Sessão expirada. Entre novamente.", 401);
  if (!ctx.profile) throw new AppError("Conta inativa ou sem acesso.", 403);
  const active = ctx as ActiveContext;
  if (needsMfa(active)) throw new AppError("Verificação em duas etapas necessária.", 403);
  if (opts.admin && active.profile.role !== "admin") throw new AppError("Operação exclusiva de administradores.", 403);
  return active;
}
