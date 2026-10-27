import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { GOOGLE_FORMS_MAX_BODY, handleGoogleFormsDelivery } from "@/server/integrations/google-forms";
import { rateLimit } from "@/lib/security/rate-limit";
import { log } from "@/server/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = serverEnv().GOOGLE_FORMS_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ status: "unavailable" }, { status: 503 }); // integração não configurada: nada é simulado
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`gforms:${ip}`, 120, 60_000).allowed) return NextResponse.json({ status: "rate_limited" }, { status: 429 });
  if (Number(request.headers.get("content-length") ?? 0) > GOOGLE_FORMS_MAX_BODY) return NextResponse.json({ status: "rejected" }, { status: 413 });
  const rawBody = await request.text();
  try {
    const out = await handleGoogleFormsDelivery({
      rawBody, secret, admin: createAdminClient(),
      timestamp: request.headers.get("x-one-timestamp"), signature: request.headers.get("x-one-signature"),
    });
    log(out.status >= 400 ? "warn" : "info", "google_forms_delivery", { status: out.status, result: out.body.status, reason: out.body.reason });
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    log("error", "google_forms_failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ status: "failed" }, { status: 500 });
  }
}
