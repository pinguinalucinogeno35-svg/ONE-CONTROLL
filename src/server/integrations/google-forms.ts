import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { googleFormsPayloadSchema } from "@/lib/validation/schemas";
import { sha256Hex, verifySignature } from "@/lib/security/hmac";

export const GOOGLE_FORMS_MAX_BODY = 32 * 1024;

export type IngestOutcome = { status: number; body: { status: string; reason?: string } };

/**
 * Processa uma entrega do Apps Script:
 * assinatura HMAC + janela de tempo → schema → anti-replay/idempotência
 * (integration_events) → rotina transacional no banco (vendedor resolvido
 * pelo token do link, nunca por campo do formulário).
 */
export async function handleGoogleFormsDelivery(params: {
  rawBody: string; timestamp: string | null; signature: string | null; secret: string; admin: SupabaseClient; nowSeconds?: number;
}): Promise<IngestOutcome> {
  const { rawBody, timestamp, signature, secret, admin } = params;
  if (Buffer.byteLength(rawBody, "utf8") > GOOGLE_FORMS_MAX_BODY) return { status: 413, body: { status: "rejected", reason: "payload_too_large" } };

  const sig = verifySignature({ secret, timestamp, signature, body: rawBody, nowSeconds: params.nowSeconds });
  if (!sig.ok) return { status: 401, body: { status: "rejected", reason: `signature_${sig.reason}` } };

  let json: unknown;
  try { json = JSON.parse(rawBody); } catch { return { status: 400, body: { status: "rejected", reason: "invalid_json" } }; }
  const parsed = googleFormsPayloadSchema.safeParse(json);
  if (!parsed.success) return { status: 422, body: { status: "rejected", reason: "invalid_payload" } };
  const p = parsed.data;

  const payloadHash = sha256Hex(rawBody);
  const { data: existing } = await admin.from("integration_events").select("id, status, attempts").eq("provider", "google_forms").eq("external_event_id", p.event_id).maybeSingle();
  let eventId: string;
  if (existing) {
    if (existing.status === "processed" || existing.status === "rejected") return { status: 200, body: { status: "duplicate" } };
    await admin.from("integration_events").update({ attempts: existing.attempts + 1, status: "received" }).eq("id", existing.id);
    eventId = existing.id;
  } else {
    const { data: inserted, error } = await admin.from("integration_events").insert({ provider: "google_forms", external_event_id: p.event_id, payload_hash: payloadHash }).select("id").single();
    if (error) {
      if (error.code === "23505") return { status: 200, body: { status: "duplicate" } }; // entrega concorrente
      throw new Error(`integration_events: ${error.message}`);
    }
    eventId = inserted.id;
  }

  const { data: result, error: rpcError } = await admin.rpc("ingest_form_submission", {
    p_token: p.ref || null, p_external_form_id: p.form_id, p_external_response_id: p.response_id,
    p_submitted_at: p.submitted_at ?? null, p_fields: p.fields,
  });
  if (rpcError) {
    await admin.from("integration_events").update({ status: "failed", last_error: rpcError.message.slice(0, 1000) }).eq("id", eventId);
    return { status: 500, body: { status: "failed" } }; // Apps Script tentará novamente
  }
  const status = (result as { status: string }).status;
  await admin.from("integration_events").update({ status: status === "rejected" ? "rejected" : "processed", processed_at: new Date().toISOString() }).eq("id", eventId);
  return { status: 200, body: { status } };
}
