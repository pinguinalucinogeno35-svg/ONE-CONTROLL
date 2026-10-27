import "server-only";
import { log } from "./logger";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export class AppError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

type PgLikeError = { code?: string; message?: string; details?: string | null; hint?: string | null };

/**
 * Converte erros do PostgreSQL/PostgREST em mensagens seguras.
 * Mensagens das nossas rotinas (pt-BR, códigos 22023/P0002/23505/42501) são
 * repassadas; mensagens internas do banco nunca chegam ao cliente.
 */
export function toSafeMessage(error: PgLikeError | null | undefined, requestId?: string): string {
  if (!error) return "Erro inesperado";
  const msg = error.message ?? "";
  const ours = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(msg) && !/^(duplicate key|permission denied|new row|invalid input|null value|insert or update)/i.test(msg);
  switch (error.code) {
    case "42501":
      return ours ? msg : "Acesso negado";
    case "P0002":
      return ours ? msg : "Registro não encontrado";
    case "22023":
    case "22001":
      return ours ? msg : "Dados inválidos";
    case "23505":
      return ours ? msg : "Registro duplicado";
    case "23514":
      return "Os dados violam uma regra de integridade";
    case "PGRST116":
      return "Registro não encontrado";
    default:
      log("error", "db_error", { code: error.code, message: msg, requestId });
      return `Não foi possível concluir a operação.${requestId ? ` (ref. ${requestId.slice(0, 8)})` : ""}`;
  }
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}
