import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/**
 * Fluxos autenticados — executar SOMENTE contra um projeto Supabase de
 * HOMOLOGAÇÃO com usuários de teste. Variáveis:
 *   E2E_BASE_URL, E2E_SELLER_A_EMAIL, E2E_SELLER_A_PASSWORD,
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_ADMIN_TOTP_SECRET (base32),
 *   E2E_FOREIGN_CLIENT_ID (cliente pertencente ao vendedor B)
 * Sem elas, os testes são ignorados — nunca simulados.
 */
const env = process.env;
const hasSeller = !!(env.E2E_SELLER_A_EMAIL && env.E2E_SELLER_A_PASSWORD);
const hasAdmin = !!(env.E2E_ADMIN_EMAIL && env.E2E_ADMIN_PASSWORD && env.E2E_ADMIN_TOTP_SECRET);

function base32Decode(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
}
function totp(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail corporativo").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.describe("vendedor", () => {
  test.skip(!hasSeller, "Credenciais de homologação do vendedor ausentes");

  test("Cenários B, C e I: carteira, IDOR e simulação de comissão", async ({ page }) => {
    await login(page, env.E2E_SELLER_A_EMAIL!, env.E2E_SELLER_A_PASSWORD!);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("link", { name: "Financeiro" })).toHaveCount(0);

    // Área financeira e auditoria: redireciona com aviso.
    await page.goto("/financeiro");
    await expect(page).toHaveURL(/erro=acesso/);

    // Cenário C: cliente de outra carteira por URL.
    if (env.E2E_FOREIGN_CLIENT_ID) {
      await page.goto(`/clientes/${env.E2E_FOREIGN_CLIENT_ID}`);
      await expect(page.getByText("Registro não encontrado")).toBeVisible();
      const res = await page.request.get(`/api/exports/clientes?formato=csv`);
      expect(await res.text()).not.toContain(env.E2E_FOREIGN_CLIENT_ID);
    }

    // Cadastro de cliente.
    const company = `E2E Empresa ${Date.now()}`;
    await page.goto("/clientes/novo");
    await page.getByLabel("Nome do contato").fill("Contato E2E");
    await page.getByLabel("Empresa").fill(company);
    await page.getByLabel("WhatsApp").fill("(71) 99999-0000");
    await page.getByRole("button", { name: "Cadastrar cliente" }).click();
    await expect(page.getByRole("heading", { name: company })).toBeVisible();

    // Cenário B: R$ 2.000 venda direta → R$ 250,00 (simulação).
    await page.getByRole("link", { name: "Novo contrato" }).click();
    await page.getByLabel("Valor de implementação (R$)").fill("2.000,00");
    await expect(page.getByText("R$ 250,00")).toBeVisible();
    await page.getByLabel("Venda por indicação").check();
    await expect(page.getByText("R$ 400,00")).toBeVisible();
    await page.getByLabel("Indicação da indicação").check();
    await expect(page.getByText("R$ 500,00")).toBeVisible();
  });

  test("Cenário D (parte vendedor): solicitar despesa", async ({ page }) => {
    await login(page, env.E2E_SELLER_A_EMAIL!, env.E2E_SELLER_A_PASSWORD!);
    await page.goto("/despesas");
    await page.getByLabel("Categoria").selectOption({ index: 1 });
    await page.getByLabel("Descrição").fill(`Táxi E2E ${Date.now()}`);
    await page.getByLabel("Valor (R$)").fill("45,90");
    await page.getByRole("button", { name: /Solicitar/ }).click();
    await expect(page.getByText("Solicitação enviada para aprovação")).toBeVisible();
  });
});

test.describe("administrador", () => {
  test.skip(!hasAdmin, "Credenciais de homologação do administrador ausentes");

  test("MFA obrigatório e dashboard com valores separados (Cenário H)", async ({ page }) => {
    await login(page, env.E2E_ADMIN_EMAIL!, env.E2E_ADMIN_PASSWORD!);
    await expect(page).toHaveURL(/verificar-mfa/);
    await page.getByLabel("Código de 6 dígitos").fill(totp(env.E2E_ADMIN_TOTP_SECRET!));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard administrativo" })).toBeVisible();
    await expect(page.getByText("Saldo atual de caixa")).toBeVisible();
    await expect(page.getByText("A receber (a vencer)")).toBeVisible();
    await expect(page.getByText("Receita recorrente contratada")).toBeVisible();
    await page.goto("/financeiro/fluxo-de-caixa");
    await expect(page.locator("tbody tr")).toHaveCount(13);
  });
});
