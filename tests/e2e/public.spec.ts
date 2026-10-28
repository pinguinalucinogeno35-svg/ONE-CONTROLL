import { expect, test } from "@playwright/test";

test.describe("superfície pública", () => {
  test("rotas protegidas redirecionam para o login sem sessão", async ({ page }) => {
    for (const path of ["/dashboard", "/clientes", "/financeiro", "/comissoes", "/auditoria"]) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveURL(/\/login(\?next=.*)?$/);
    }
  });

  test("login acessível: rótulos, foco e sem cadastro público", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await expect(page.getByLabel("E-mail corporativo")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByText("Não há cadastro público")).toBeVisible();
    await expect(page.getByRole("link", { name: /cadastr|criar conta|sign up/i })).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Ir para o conteúdo" })).toBeFocused();
  });

  test("login sem dados mostra erro compreensível", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Informe e-mail e senha válidos" })).toBeVisible();
  });

  test("cabeçalhos de segurança e CSP com nonce", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("API protegida não vaza dados sem sessão", async ({ request }) => {
    expect((await request.get("/api/exports/clientes?formato=csv")).status()).toBe(401);
    expect((await request.get("/api/files/00000000-0000-4000-8000-000000000000")).status()).toBe(401);
    expect((await request.get("/api/internal/cron")).status()).toBe(401);
    const gf = await request.post("/api/integrations/google-forms", { data: { a: 1 } });
    expect([401, 503]).toContain(gf.status()); // 503 = integração não configurada (nada simulado)
  });

  test("upload de outra origem é recusado", async ({ request }) => {
    const res = await request.post("/api/files", { headers: { origin: "https://evil.example" }, multipart: { resource: "client_id" } });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("PWA", () => {
  test("manifest instalável", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m).toMatchObject({ display: "standalone", short_name: "ONE CONTROL", theme_color: "#0B0B0F", start_url: "/dashboard" });
    const sizes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "192x192:maskable", "512x512:maskable"]));
    for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  });

  test("service worker não armazena respostas autenticadas", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.ok()).toBe(true);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const sw = await res.text();
    expect(sw).toContain('if (req.method !== "GET") return');
    expect(sw).toContain("/_next/static/");
    expect(sw).not.toMatch(/\/api\/.*cache\.put/);
  });

  test("página offline sem dados sensíveis", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: "Você está sem conexão" })).toBeVisible();
    await expect(page.getByText("Nenhuma operação foi registrada offline")).toBeVisible();
  });

  test("service worker registra e serve a página offline sem rede", async ({ page, context }) => {
    await page.goto("/login");
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()), null, { timeout: 15_000 });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await context.setOffline(true);
    await page.goto("/dashboard").catch(() => undefined);
    await expect(page.getByRole("heading", { name: "Você está sem conexão" })).toBeVisible();
    await context.setOffline(false);
  });
});

test("layout mobile do login sem rolagem horizontal", async ({ page }) => {
  await page.goto("/login");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.getByRole("button", { name: "Entrar" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44); // área de toque adequada
});

test.describe("links de e-mail no formato padrão do Supabase", () => {
  test("link expirado leva à recuperação com aviso e sem tokens na URL", async ({ page }) => {
    await page.goto("/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid");
    await expect(page).toHaveURL(/\/recuperar-acesso\?erro=link$/);
    await expect(page.getByText("O link expirou ou já foi usado")).toBeVisible();
  });

  test("sessão inválida no fragmento não fica na barra de endereço", async ({ page }) => {
    await page.goto("/login#access_token=invalido&refresh_token=invalido&type=recovery");
    await expect(page).toHaveURL(/\/recuperar-acesso\?erro=link$/, { timeout: 20_000 });
    expect(page.url()).not.toContain("access_token");
  });
});
