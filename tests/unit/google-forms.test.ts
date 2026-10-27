import { describe, expect, it, vi } from "vitest";
import { handleGoogleFormsDelivery } from "@/server/integrations/google-forms";
import { signPayload } from "@/lib/security/hmac";

const secret = "k".repeat(48);
const payload = { event_id: "form123456:resp-1", form_id: "form123456", response_id: "resp-1", ref: "a".repeat(64), fields: { nome_contato: "Ana", nome_empresa: "Café", email: "", whatsapp: "", instagram: "", servicos: "" } };

// Cliente admin falso: registra chamadas e simula integration_events.
function fakeAdmin(opts: { existing?: { id: string; status: string; attempts: number } | null; rpcResult?: unknown; rpcError?: { message: string } } = {}) {
  const calls: { op: string; args: unknown }[] = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain, eq: chain,
      maybeSingle: async () => ({ data: opts.existing ?? null }),
      insert: (args: unknown) => { calls.push({ op: `insert:${table}`, args }); return { select: () => ({ single: async () => ({ data: { id: "evt-1" }, error: null }) }) }; },
      update: (args: unknown) => { calls.push({ op: `update:${table}`, args }); return { eq: async () => ({}) }; },
    });
    return b;
  };
  return {
    calls,
    client: {
      from: builder,
      rpc: vi.fn(async (name: string, args: unknown) => { calls.push({ op: `rpc:${name}`, args }); return { data: opts.rpcResult ?? { status: "imported" }, error: opts.rpcError ?? null }; }),
    },
  };
}

function signed(body: string, ts = "1790000000") {
  return { timestamp: ts, signature: signPayload(secret, ts, body), nowSeconds: Number(ts) };
}

describe("entrega do Google Forms", () => {
  it("formulário válido: grava evento e chama a rotina com o token (sem seller_id)", async () => {
    const body = JSON.stringify(payload);
    const admin = fakeAdmin();
    const out = await handleGoogleFormsDelivery({ rawBody: body, secret, admin: admin.client as never, ...signed(body) });
    expect(out).toEqual({ status: 200, body: { status: "imported" } });
    const rpc = admin.calls.find((c) => c.op === "rpc:ingest_form_submission")!.args as Record<string, unknown>;
    expect(rpc.p_token).toBe("a".repeat(64));
    expect(JSON.stringify(rpc)).not.toContain("seller");
  });
  it("assinatura inválida ou ausente: rejeita sem tocar no banco", async () => {
    const body = JSON.stringify(payload);
    const admin = fakeAdmin();
    expect((await handleGoogleFormsDelivery({ rawBody: body, secret, admin: admin.client as never, timestamp: "1790000000", signature: "0".repeat(64), nowSeconds: 1790000000 })).status).toBe(401);
    expect((await handleGoogleFormsDelivery({ rawBody: body, secret, admin: admin.client as never, timestamp: null, signature: null })).status).toBe(401);
    expect(admin.calls).toHaveLength(0);
  });
  it("payload inválido: 422", async () => {
    const body = JSON.stringify({ ...payload, seller_id: "x" });
    const out = await handleGoogleFormsDelivery({ rawBody: body, secret, admin: fakeAdmin().client as never, ...signed(body) });
    expect(out.status).toBe(422);
  });
  it("resposta repetida (já processada): duplicate sem reprocessar", async () => {
    const body = JSON.stringify(payload);
    const admin = fakeAdmin({ existing: { id: "evt-1", status: "processed", attempts: 1 } });
    const out = await handleGoogleFormsDelivery({ rawBody: body, secret, admin: admin.client as never, ...signed(body) });
    expect(out.body.status).toBe("duplicate");
    expect(admin.calls.some((c) => c.op.startsWith("rpc:"))).toBe(false);
  });
  it("falha temporária: marca evento como failed e devolve 500 para novo envio; reprocessa depois", async () => {
    const body = JSON.stringify(payload);
    const failing = fakeAdmin({ rpcError: { message: "timeout" } });
    expect((await handleGoogleFormsDelivery({ rawBody: body, secret, admin: failing.client as never, ...signed(body) })).status).toBe(500);
    expect(failing.calls.some((c) => c.op === "update:integration_events" && (c.args as { status: string }).status === "failed")).toBe(true);
    const retry = fakeAdmin({ existing: { id: "evt-1", status: "failed", attempts: 1 } });
    expect((await handleGoogleFormsDelivery({ rawBody: body, secret, admin: retry.client as never, ...signed(body) })).status).toBe(200);
  });
  it("payload acima do limite: 413", async () => {
    const body = JSON.stringify({ ...payload, pad: "x".repeat(40_000) });
    expect((await handleGoogleFormsDelivery({ rawBody: body, secret, admin: fakeAdmin().client as never, ...signed(body) })).status).toBe(413);
  });
});
