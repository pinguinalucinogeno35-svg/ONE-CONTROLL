import "server-only";
import type { NextRequest } from "next/server";

/** Proteção CSRF para Route Handlers mutáveis: exige Origin igual ao host. */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
