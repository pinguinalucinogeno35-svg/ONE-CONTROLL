import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { authorizeAction, type ActiveContext } from "@/server/auth/session";
import { AppError, toSafeMessage, type ActionResult } from "@/server/errors";
import { log } from "@/server/logger";
import { dispatchPendingPush, isPushConfigured } from "@/server/push";

/**
 * Envelope padrão das Server Actions:
 * autentica → verifica conta ativa/MFA → papel → valida payload (Zod) →
 * executa (rotina transacional no banco) → oculta erros internos →
 * dispara push das notificações criadas (após a resposta).
 * Server Actions do Next.js já validam Origin vs Host (proteção CSRF).
 */
export async function runAction<S extends z.ZodType, T>(
  opts: { admin?: boolean; schema: S; input: unknown; name: string },
  fn: (ctx: ActiveContext, data: z.output<S>) => Promise<{ data?: T; error?: { code?: string; message?: string } | null; message?: string }>,
): Promise<ActionResult<T>> {
  let ctx: ActiveContext | undefined;
  try {
    ctx = await authorizeAction({ admin: opts.admin });
    const parsed = opts.schema.safeParse(opts.input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return { ok: false, error: "Verifique os campos destacados.", fieldErrors };
    }
    const res = await fn(ctx, parsed.data);
    if (res.error) {
      log("warn", "action_rejected", { action: opts.name, code: res.error.code, requestId: ctx.requestId, userId: ctx.userId });
      return { ok: false, error: toSafeMessage(res.error, ctx.requestId) };
    }
    // Notificações geradas pela operação seguem por push após a resposta.
    if (isPushConfigured()) after(() => dispatchPendingPush());
    return { ok: true, data: res.data, message: res.message };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    // Redirecionamentos/notFound do Next precisam ser propagados.
    if (e && typeof e === "object" && "digest" in e) throw e;
    log("error", "action_failed", { action: opts.name, requestId: ctx?.requestId, error: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
  }
}

export function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      const arr = (out[key] as string[] | undefined) ?? [];
      arr.push(v);
      out[key] = arr;
    } else out[k] = v;
  }
  return out;
}
