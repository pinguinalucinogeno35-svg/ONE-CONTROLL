import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/recuperar-acesso", "/auth/confirm", "/offline", "/api/integrations", "/api/internal"];

function buildCsp(nonce: string, isDev: boolean): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const wss = supabase.replace(/^https:/, "wss:");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabase} ${wss}`.trim(),
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    isDev ? "" : "upgrade-insecure-requests",
  ].filter(Boolean).join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" ? false : PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    });
    // Não inserir código entre createServerClient e getClaims (renovação de sessão).
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims && !isPublic) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = path && path !== "/" ? `?next=${encodeURIComponent(path)}` : "";
      const redirect = NextResponse.redirect(login);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      redirect.headers.set("Content-Security-Policy", csp);
      return redirect;
    }
  } else if (!isPublic) {
    return new NextResponse("Aplicação não configurada (variáveis do Supabase ausentes).", { status: 503 });
  }

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  // Respostas autenticadas nunca devem ser armazenadas em caches compartilhados.
  if (!isPublic) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    // Ignora assets estáticos, manifest, service worker e ícones.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|robots.txt).*)",
  ],
};
