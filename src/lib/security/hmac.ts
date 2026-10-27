import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export const SIGNATURE_MAX_AGE_SECONDS = 300;

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Assinatura HMAC-SHA256 sobre `${timestamp}.${corpo}` (hex). */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

export type SignatureCheck = { ok: true } | { ok: false; reason: "missing" | "malformed" | "expired" | "invalid" };

/** Verifica assinatura em tempo constante e rejeita mensagens fora da janela (anti-replay). */
export function verifySignature(params: {
  secret: string; timestamp: string | null; signature: string | null; body: string; nowSeconds?: number; maxAgeSeconds?: number;
}): SignatureCheck {
  const { secret, timestamp, signature, body } = params;
  if (!timestamp || !signature) return { ok: false, reason: "missing" };
  if (!/^\d{10}$/.test(timestamp) || !/^[0-9a-f]{64}$/i.test(signature)) return { ok: false, reason: "malformed" };
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > (params.maxAgeSeconds ?? SIGNATURE_MAX_AGE_SECONDS)) return { ok: false, reason: "expired" };
  const expected = Buffer.from(signPayload(secret, timestamp, body), "hex");
  const given = Buffer.from(signature.toLowerCase(), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "invalid" };
  return { ok: true };
}
