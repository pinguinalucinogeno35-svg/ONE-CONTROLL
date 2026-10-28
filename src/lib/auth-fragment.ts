/**
 * Links de e-mail no formato padrão do Supabase (fluxo implícito) chegam com a
 * sessão no fragmento da URL (#access_token=…&type=recovery). O servidor não
 * enxerga o fragmento; este parser é usado pelo navegador para concluir o acesso.
 */
export type AuthFragment =
  | { kind: "session"; accessToken: string; refreshToken: string; type: "recovery" | "invite" | "magiclink" }
  | { kind: "error"; code: string }
  | { kind: "none" };

const TYPES = new Set(["recovery", "invite", "magiclink"]);

export function parseAuthFragment(hash: string): AuthFragment {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return { kind: "none" };
  const p = new URLSearchParams(raw);
  const error = p.get("error_code") ?? p.get("error");
  if (error) return { kind: "error", code: error.slice(0, 60) };
  const accessToken = p.get("access_token");
  const refreshToken = p.get("refresh_token");
  const type = p.get("type");
  if (!accessToken || !refreshToken || !type || !TYPES.has(type)) return { kind: "none" };
  return { kind: "session", accessToken, refreshToken, type: type as "recovery" | "invite" | "magiclink" };
}
