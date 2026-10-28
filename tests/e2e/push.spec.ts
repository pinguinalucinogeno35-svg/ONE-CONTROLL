import { expect, test } from "@playwright/test";

// Push no service worker publicado: entrega real de mensagem via protocolo do Chromium.
// O headless-shell nega notificações; o Chromium completo (novo modo headless) as suporta.
test.use({ channel: "chromium" });
test.describe("notificações push (service worker)", () => {
  test("cartão de ativação informa quando o servidor não tem chaves VAPID", async ({ page }) => {
    await page.goto("/design-system?tema=light");
    await expect(page.getByRole("heading", { name: "Notificações neste dispositivo" })).toBeVisible();
    await expect(page.getByText("ainda não foi configurado no servidor")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ativar notificações" })).toHaveCount(0);
  });

  test("mensagem push vira notificação e links externos são descartados", async ({ page, context, baseURL }) => {
    await context.grantPermissions(["notifications"]);
    const cdp = await context.newCDPSession(page);
    const registrations: string[] = [];
    cdp.on("ServiceWorker.workerRegistrationUpdated", (e: { registrations: { registrationId: string; scopeURL: string }[] }) => {
      for (const r of e.registrations) if (!registrations.includes(r.registrationId)) registrations.push(r.registrationId);
    });
    await cdp.send("ServiceWorker.enable");
    await page.goto("/login");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect.poll(() => registrations.length).toBeGreaterThan(0);
    const origin = new URL(baseURL!).origin;

    const deliver = (data: object) => cdp.send("ServiceWorker.deliverPushMessage", { origin, registrationId: registrations[0]!, data: JSON.stringify(data) });
    const shown = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: (n.data as { url: string }).url })));

    await deliver({ title: "Ana, você tem uma nova tarefa", body: "Editar vídeo · prioridade alta", url: "/tarefas/abc", tag: "n1" });
    await expect.poll(shown).toContainEqual({ title: "Ana, você tem uma nova tarefa", body: "Editar vídeo · prioridade alta", tag: "n1", url: "/tarefas/abc" });

    await deliver({ title: "x", body: "y", url: "https://malicioso.example/roubo", tag: "n2" });
    await expect.poll(async () => (await shown()).find((n) => n.tag === "n2")?.url).toBe("/notificacoes");
  });
});
