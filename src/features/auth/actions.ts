"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { serverEnv } from "@/lib/env";
import { log } from "@/server/logger";
import type { ActionResult } from "@/server/errors";

const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/[a-z0-9\-/]*$/i.test(next) && !next.startsWith("//") ? next : "/dashboard";
}

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: "Informe e-mail e senha válidos." };
  const email = parsed.data.email.toLowerCase();
  const ip = await clientIp();
  // Limites: 5 tentativas/15 min por e-mail+IP e 30/15 min por IP.
  const byUser = rateLimit(`login:${email}:${ip}`, 5, 15 * 60_000);
  const byIp = rateLimit(`login-ip:${ip}`, 30, 15 * 60_000);
  if (!byUser.allowed || !byIp.allowed) {
    log("warn", "login_rate_limited", { ip });
    return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) {
    log("info", "login_failed", { ip, code: error.code });
    // Mensagem genérica: não revela se o e-mail existe.
    return { ok: false, error: "E-mail ou senha incorretos." };
  }
  resetRateLimit(`login:${email}:${ip}`);
  redirect(`/verificar-mfa?next=${encodeURIComponent(safeNext(formData.get("next")))}`);
}

export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z.email().safeParse(formData.get("email"));
  const generic: ActionResult = { ok: true, message: "Se o e-mail estiver cadastrado, você receberá as instruções em instantes." };
  if (!parsed.success) return { ok: false, error: "Informe um e-mail válido." };
  const ip = await clientIp();
  if (!rateLimit(`reset:${ip}`, 5, 60 * 60_000).allowed) return generic;
  const supabase = await createClient();
  const base = serverEnv().APP_URL ?? "";
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.toLowerCase(), {
    redirectTo: `${base}/auth/confirm?next=/redefinir-senha`,
  });
  // Resposta sempre genérica (não revela se o e-mail existe); o motivo fica só no log.
  if (error) log("warn", "password_reset_failed", { code: error.code, ip });
  return generic;
}

const passwordSchema = z
  .object({ password: z.string().min(12, "Mínimo de 12 caracteres").max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "As senhas não conferem", path: ["confirm"] })
  .refine((v) => /[a-z]/.test(v.password) && /[A-Z]/.test(v.password) && /\d/.test(v.password), {
    message: "Use letras maiúsculas, minúsculas e números", path: ["password"],
  });

export async function updatePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    parsed.error.issues.forEach((i) => (fieldErrors[String(i.path[0])] ??= []).push(i.message));
    return { ok: false, error: "Verifique a senha informada.", fieldErrors };
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, error: "Link expirado. Solicite um novo." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "Não foi possível atualizar a senha. Tente uma senha diferente." };
  // Primeiro acesso de convidado: ativa o perfil (invited → active), se aplicável.
  await supabase.rpc("activate_own_profile");
  redirect("/verificar-mfa");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

/** Encerra todas as sessões do usuário em todos os dispositivos. */
export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}
