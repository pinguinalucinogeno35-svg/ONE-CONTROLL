import { describe, expect, it } from "vitest";
import { contractSchema, clientSchema, googleFormsPayloadSchema } from "@/lib/validation/schemas";
import { parseImport } from "@/server/services/import-parser";

const uuid = "4f3c1a2b-1234-4abc-8def-0123456789ab";

describe("contractSchema", () => {
  it("Cenário I: descarta campos de comissão enviados pelo navegador", () => {
    const r = contractSchema.parse({ client_id: uuid, implementation_amount: "2.000,00", start_date: "2026-10-27", sale_origin: "direct", commission_rate_bps: 10000, commission_amount: "2000" } as never);
    expect(r).not.toHaveProperty("commission_rate_bps");
    expect(r).not.toHaveProperty("commission_amount");
    expect(r.implementation_amount).toBe("2000.00");
  });
  it("valida regras de negócio", () => {
    expect(contractSchema.safeParse({ client_id: uuid, start_date: "2026-10-27", sale_origin: "direct" }).success).toBe(false);
    expect(contractSchema.safeParse({ client_id: uuid, monthly_amount: "100", start_date: "2026-10-27", sale_origin: "direct" }).success).toBe(false);
    expect(contractSchema.safeParse({ client_id: uuid, implementation_amount: "-5", start_date: "2026-10-27", sale_origin: "direct" }).success).toBe(false);
    expect(contractSchema.safeParse({ client_id: uuid, implementation_amount: "10", start_date: "2026-10-27", sale_origin: "referral" }).success).toBe(false);
    expect(contractSchema.safeParse({ client_id: uuid, implementation_amount: "10", start_date: "2026-10-27", sale_origin: "referral", referral: { external_referrer_name: "Parceiro" } }).success).toBe(true);
  });
});

describe("clientSchema", () => {
  it("normaliza e valida", () => {
    const r = clientSchema.parse({ contact_name: "Ana", company_name: "X", email: "ANA@X.COM", whatsapp: "71 99999-0000", tax_id: "11.222.333/0001-81" });
    expect(r).toMatchObject({ email: "ana@x.com", whatsapp: "+5571999990000", tax_id: "11222333000181" });
    expect(clientSchema.safeParse({ contact_name: "Ana", company_name: "X", tax_id: "11.111.111/1111-11" }).success).toBe(false);
  });
});

describe("payload do Google Forms", () => {
  it("rejeita campos extras (ex.: seller_id injetado)", () => {
    const base = { event_id: "form:resp-123", form_id: "formid123", response_id: "resp-123", ref: "a".repeat(64), fields: { nome_contato: "A", nome_empresa: "B" } };
    expect(googleFormsPayloadSchema.safeParse(base).success).toBe(true);
    expect(googleFormsPayloadSchema.safeParse({ ...base, seller_id: uuid }).success).toBe(false);
    expect(googleFormsPayloadSchema.safeParse({ ...base, fields: { ...base.fields, seller_id: uuid } }).success).toBe(false);
  });
});

describe("importação CSV", () => {
  it("mapeia colunas, valida linhas e calcula hash", async () => {
    const csv = "Nome do contato;Empresa;E-mail;WhatsApp;CNPJ\nAna;Café;ana@cafe.test;71 99999-0000;\nB;Sem nome válido;;;\nCarlos;Loja;email-invalido;;\nDiana;=CMD;diana@x.test;;11.222.333/0001-81\n";
    const r = await parseImport("clientes.csv", Buffer.from(csv, "utf8"));
    expect(r.totalRows).toBe(4);
    expect(r.mapping).toMatchObject({ "Nome do contato": "contact_name", Empresa: "company_name", CNPJ: "tax_id" });
    expect(r.valid).toHaveLength(2);
    expect(r.invalid.map((i) => i.row)).toEqual([3, 4]);
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("detecta codificação Windows-1252", async () => {
    const latin1 = Buffer.from([...Buffer.from("nome_contato;nome_empresa\nJos"), 0xe9, ...Buffer.from(";Padaria\n")]);
    const r = await parseImport("c.csv", latin1);
    expect(r.encoding).toBe("windows-1252");
    expect(r.valid[0]?.contact_name).toBe("José");
  });
  it("rejeita arquivo sem colunas obrigatórias, vazio ou com formato inválido", async () => {
    await expect(parseImport("c.csv", Buffer.from("foo;bar\n1;2\n"))).rejects.toThrow(/obrigatórias/);
    await expect(parseImport("c.csv", Buffer.alloc(0))).rejects.toThrow(/vazio/);
    await expect(parseImport("c.txt", Buffer.from("a"))).rejects.toThrow(/suportado/);
  });
});
