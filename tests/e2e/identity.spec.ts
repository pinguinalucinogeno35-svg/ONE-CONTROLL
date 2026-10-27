import { expect, test } from "@playwright/test";

// Identidade Visual ONE v1.0 aplicada (catálogo com dados ilustrativos).
test.describe("identidade visual", () => {
  test("tipografia: Space Grotesk nos títulos, Inter na leitura, Roboto Mono nos rótulos", async ({ page }) => {
    await page.goto("/design-system?tema=light");
    await page.evaluate(() => document.fonts.ready);
    const h1 = await page.locator("h1").first().evaluate((e) => getComputedStyle(e).fontFamily);
    const body = await page.locator("body").evaluate((e) => getComputedStyle(e).fontFamily);
    const eyebrow = await page.locator(".eyebrow").first().evaluate((e) => getComputedStyle(e).fontFamily);
    expect(h1).toContain("Space Grotesk");
    expect(body).toContain("Inter");
    expect(eyebrow).toContain("Roboto Mono");
    expect(await page.evaluate(() => document.fonts.check('700 40px "Space Grotesk Variable"'))).toBe(true);
  });

  test("tema claro: marfim, carvão e azul elétrico com texto branco", async ({ page }) => {
    await page.goto("/design-system?tema=light");
    const shell = page.locator("[data-theme]").first();
    expect(await shell.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(246, 244, 239)");
    const btn = page.getByRole("button", { name: "Revisar exemplo" });
    expect(await btn.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(0, 102, 255)");
    expect(await btn.evaluate((e) => getComputedStyle(e).color)).toBe("rgb(255, 255, 255)");
  });

  test("tema escuro: pares próprios (#80ADFF com texto carvão)", async ({ page }) => {
    await page.goto("/design-system?tema=dark");
    const btn = page.getByRole("button", { name: "Revisar exemplo" });
    expect(await btn.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(128, 173, 255)");
    expect(await btn.evaluate((e) => getComputedStyle(e).color)).toBe("rgb(11, 11, 15)");
  });

  test("preferência do sistema escura sem escolha explícita", async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto("/login");
    expect(await page.locator("body").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(11, 11, 15)");
    await ctx.close();
  });

  test("foco visível de 3 px e alvos de toque ≥ 44 px", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail corporativo").focus();
    await page.keyboard.press("Tab");
    const outline = await page.getByLabel("Senha").evaluate((e) => getComputedStyle(e).outlineWidth);
    expect(outline).toBe("3px");
    for (const name of ["Entrar"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
