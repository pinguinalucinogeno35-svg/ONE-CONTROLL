import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationHref, pushContent } from "@/lib/notification-links";

describe("conteúdo do push (tela de bloqueio)", () => {
  it("tarefas mostram o texto personalizado", () => {
    const c = pushContent("task_assigned", "Ana, você tem uma nova tarefa", "Ligar para o cliente · prioridade alta");
    expect(c).toEqual({ title: "Ana, você tem uma nova tarefa", body: "Ligar para o cliente · prioridade alta" });
  });

  it("avisos financeiros e comerciais não expõem valores nem nomes", () => {
    for (const type of ["invoice_overdue", "commission_paid", "expense_pending_approval", "contract_approved", "client_registered", "form_submission_received", "system"]) {
      const c = pushContent(type, "Comissão de R$ 1.250,00 paga — Cliente XPTO", "Valor R$ 1.250,00");
      expect(c.title).toBe("ONE CONTROL");
      expect(c.body).not.toMatch(/R\$|XPTO|1\.250/);
    }
  });

  it("limita o tamanho do texto", () => {
    const c = pushContent("task_updated", "x".repeat(500), "y".repeat(500));
    expect(c.title.length).toBe(120);
    expect(c.body.length).toBe(240);
  });
});

describe("destino do clique", () => {
  it("leva à tela interna correta por papel", () => {
    expect(notificationHref("tasks", "abc", "seller")).toBe("/tarefas/abc");
    expect(notificationHref("payables", "abc", "admin")).toBe("/financeiro/despesas");
    expect(notificationHref("receivables", "abc", "seller")).toBeNull();
    expect(notificationHref("desconhecido", "abc", "admin")).toBeNull();
    expect(notificationHref(null, null, "admin")).toBeNull();
  });
});

const rpc = vi.fn();
const sendNotification = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("web-push", () => {
  class WebPushError extends Error {
    constructor(message: string, readonly statusCode: number) { super(message); }
  }
  return { default: { sendNotification, WebPushError } };
});

const row = (id: string, endpoint: string, type = "task_assigned") => ({
  notification_id: `n-${id}`, subscription_id: `s-${id}`, endpoint, p256dh: "p", auth: "a",
  type, title: "Ana, você tem uma nova tarefa", message: "Ligar", entity_type: "tasks", entity_id: "t1", recipient_role: "seller",
});

describe("dispatchPendingPush", () => {
  beforeEach(() => {
    vi.resetModules();
    rpc.mockReset();
    sendNotification.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_teste_0000000000",
      SUPABASE_SECRET_KEY: "sb_secret_teste_000000000000000",
    });
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  });

  const configure = () => Object.assign(process.env, {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "B".repeat(87), VAPID_PRIVATE_KEY: "k".repeat(43), VAPID_SUBJECT: "mailto:contato@exemplo.com",
  });

  it("sem chaves VAPID não reserva nada (não simula envio)", async () => {
    const { dispatchPendingPush, isPushConfigured } = await import("@/server/push");
    expect(isPushConfigured()).toBe(false);
    expect(await dispatchPendingPush()).toEqual({ sent: 0, failed: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("envia, informa o resultado de cada dispositivo e remove inscrições expiradas", async () => {
    configure();
    const { default: webpush } = await import("web-push");
    rpc.mockImplementation(async (fn: string) => (fn === "claim_push_batch"
      ? { data: [row("1", "https://push.test/ok"), row("2", "https://push.test/gone")], error: null }
      : { data: null, error: null }));
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("gone")) throw new (webpush.WebPushError as unknown as new (m: string, s: number) => Error)("gone", 410);
      return { statusCode: 201 };
    });
    const { dispatchPendingPush } = await import("@/server/push");
    expect(await dispatchPendingPush()).toEqual({ sent: 1, failed: 1 });
    expect(rpc).toHaveBeenCalledWith("report_push_result", { p_subscription_id: "s-1", p_status: 201 });
    expect(rpc).toHaveBeenCalledWith("report_push_result", { p_subscription_id: "s-2", p_status: 410 });
    const [, payload, options] = sendNotification.mock.calls[0]!;
    expect(JSON.parse(payload as string)).toEqual({ title: "Ana, você tem uma nova tarefa", body: "Ligar", url: "/tarefas/t1", tag: "n-1" });
    expect(options).toMatchObject({ urgency: "high", vapidDetails: { subject: "mailto:contato@exemplo.com" } });
  });

  it("falha do banco não derruba a operação de origem", async () => {
    configure();
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "falha" } });
    const { dispatchPendingPush } = await import("@/server/push");
    await expect(dispatchPendingPush()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
