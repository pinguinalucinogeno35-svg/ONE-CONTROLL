import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Confirma links de convite e recuperação (token_hash) e cria a sessão.
const ALLOWED_TYPES: EmailOtpType[] = ["invite", "recovery", "email", "magiclink"];
const ALLOWED_NEXT = new Set(["/redefinir-senha", "/dashboard"]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/redefinir-senha";
  const next = ALLOWED_NEXT.has(nextParam) ? nextParam : "/redefinir-senha";
  const target = request.nextUrl.clone();
  target.search = "";

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      target.pathname = type === "invite" ? "/redefinir-senha" : next;
      return NextResponse.redirect(target);
    }
  }
  target.pathname = "/recuperar-acesso";
  target.searchParams.set("erro", "link");
  return NextResponse.redirect(target);
}
