import { expect, test } from "@playwright/test";

// Editor de disponibilidade (catálogo ilustrativo; o envio exige login e não é exercitado aqui).
test("horas sobrepostas contam uma vez e o total aparece em tempo real", async ({ page }) => {
  await page.goto("/design-system?tema=light");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Concluir e começar" }) });
  await expect(form.getByText("Total semanal:")).toContainText("Não informado");
  await form.getByRole("button", { name: "Adicionar horário" }).click();
  await form.getByLabel("Início").first().fill("09:00");
  await form.getByLabel("Fim").first().fill("14:00");
  await form.getByRole("button", { name: "Adicionar horário" }).click();
  await form.getByLabel("Início").nth(1).fill("13:00");
  await form.getByLabel("Fim").nth(1).fill("18:00");
  await form.getByLabel("Formato").nth(1).selectOption("remote");
  await expect(form.getByText("Total semanal:")).toContainText("9 h");
  await expect(form.getByText("Total semanal:")).toContainText("presencial 5 h · remoto 5 h");
  await form.getByRole("button", { name: "Remover bloco 2" }).click();
  await expect(form.getByText("Total semanal:")).toContainText("5 h");
  await expect(form.getByText(/Você pode receber qualquer tipo de trabalho/)).toBeVisible();
});
