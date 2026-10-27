import { z } from "zod";
import { isValidTaxId, normalizePhoneBR } from "./br";
import { MoneyError, parseBRL, toDecimalString } from "@/lib/money";

// Campo texto opcional: string vazia → undefined.
const optionalText = (max: number) =>
  z.string().trim().max(max, `Máximo de ${max} caracteres`).optional().transform((v) => (v ? v : undefined));

export const uuid = z.uuid({ message: "Identificador inválido" });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const optionalDate = z.string().optional().transform((v) => (v ? v : undefined)).pipe(isoDate.optional());

/** Valor monetário digitado (BRL) → string decimal canônica "1234.56" (não negativo). */
export const moneyInput = (opts: { required?: boolean; positive?: boolean } = {}) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || !v.trim()) {
        if (opts.required) ctx.addIssue({ code: "custom", message: "Informe o valor" });
        return opts.required ? z.NEVER : "0.00";
      }
      try {
        const cents = parseBRL(v);
        if (cents < 0) { ctx.addIssue({ code: "custom", message: "Valor não pode ser negativo" }); return z.NEVER; }
        if (opts.positive && cents === 0) { ctx.addIssue({ code: "custom", message: "Valor deve ser maior que zero" }); return z.NEVER; }
        return toDecimalString(cents);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: e instanceof MoneyError ? e.message : "Valor inválido" });
        return z.NEVER;
      }
    });

export const clientSchema = z.object({
  contact_name: z.string().trim().min(2, "Informe o nome do contato").max(120),
  company_name: z.string().trim().min(1, "Informe a empresa").max(160),
  email: z.string().trim().max(254).optional().transform((v) => (v ? v.toLowerCase() : undefined))
    .pipe(z.email({ message: "E-mail inválido" }).optional()),
  whatsapp: z.string().trim().max(40).optional().transform((v, ctx) => {
    if (!v) return undefined;
    const n = normalizePhoneBR(v);
    if (!n) { ctx.addIssue({ code: "custom", message: "WhatsApp inválido (use DDD + número)" }); return z.NEVER; }
    return n;
  }),
  instagram: optionalText(120),
  website: z.string().trim().max(300).optional().transform((v) => (v ? v : undefined))
    .pipe(z.url({ protocol: /^https?$/, message: "URL deve começar com http(s)://" }).optional()),
  tax_id: z.string().trim().max(20).optional().transform((v, ctx) => {
    if (!v) return undefined;
    if (!isValidTaxId(v)) { ctx.addIssue({ code: "custom", message: "CNPJ/CPF inválido" }); return z.NEVER; }
    return v.replace(/\D/g, "");
  }),
  business_description: optionalText(2000),
  lead_source: optionalText(80),
  service_ids: z.array(uuid).max(30).default([]),
  seller_id: uuid.optional(),
});
export type ClientInput = z.infer<typeof clientSchema>;

export const saleOrigin = z.enum(["direct", "referral", "second_level_referral"]);

export const contractSchema = z
  .object({
    client_id: uuid,
    project_id: uuid.optional().or(z.literal("").transform(() => undefined)),
    seller_id: uuid.optional().or(z.literal("").transform(() => undefined)),
    implementation_amount: moneyInput(),
    monthly_amount: moneyInput(),
    start_date: isoDate,
    delivery_due_date: optionalDate,
    delivery_date_justification: optionalText(500),
    recurring_start_date: optionalDate,
    billing_day: z.coerce.number().int().min(1).max(31).optional().or(z.literal("").transform(() => undefined)),
    billing_frequency: z.enum(["monthly", "quarterly", "yearly"]).optional(),
    sale_origin: saleOrigin,
    referral: z.object({
      first_referrer_client_id: uuid.optional().or(z.literal("").transform(() => undefined)),
      second_referrer_client_id: uuid.optional().or(z.literal("").transform(() => undefined)),
      external_referrer_name: optionalText(160),
      notes: optionalText(1000),
    }).prefault({}),
    services: z.array(z.object({ service_id: uuid, quantity: z.coerce.number().positive().max(9999).default(1), unit_amount: moneyInput(), description: optionalText(500) })).max(30).default([]),
    notes: optionalText(4000),
    submit: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.implementation_amount === "0.00" && v.monthly_amount === "0.00")
      ctx.addIssue({ code: "custom", path: ["implementation_amount"], message: "Informe implementação e/ou mensalidade" });
    if (v.monthly_amount !== "0.00" && (!v.recurring_start_date || !v.billing_day))
      ctx.addIssue({ code: "custom", path: ["billing_day"], message: "Mensalidade exige início da recorrência e dia de cobrança" });
    if (v.delivery_due_date && v.delivery_due_date < v.start_date && !v.delivery_date_justification)
      ctx.addIssue({ code: "custom", path: ["delivery_due_date"], message: "Entrega antes do início exige justificativa administrativa" });
    if (v.sale_origin !== "direct" && !v.referral.first_referrer_client_id && !v.referral.external_referrer_name)
      ctx.addIssue({ code: "custom", path: ["referral"], message: "Informe quem indicou" });
    if (v.sale_origin === "second_level_referral" && !v.referral.second_referrer_client_id)
      ctx.addIssue({ code: "custom", path: ["referral"], message: "Informe a indicação intermediária" });
  });
export type ContractInput = z.infer<typeof contractSchema>;

export const expenseSchema = z.object({
  category_id: uuid,
  description: z.string().trim().min(2, "Descreva a despesa").max(300),
  supplier_name: optionalText(160),
  amount: moneyInput({ required: true, positive: true }),
  due_date: optionalDate,
  competence_month: optionalDate,
  client_id: uuid.optional().or(z.literal("").transform(() => undefined)),
  project_id: uuid.optional().or(z.literal("").transform(() => undefined)),
});

export const paymentMethod = z.enum(["pix", "bank_transfer", "boleto", "credit_card", "debit_card", "cash", "other"]);

export const receiptSchema = z.object({
  receivable_id: uuid,
  cash_account_id: uuid,
  amount: moneyInput({ required: true, positive: true }),
  payment_method: paymentMethod,
  received_at: isoDate,
  reference: optionalText(120),
  idempotency_key: z.string().min(8).max(120),
});

export const outgoingPaymentSchema = z.object({
  payable_id: uuid,
  cash_account_id: uuid,
  amount: moneyInput({ required: true, positive: true }),
  payment_method: paymentMethod,
  paid_at: isoDate,
  idempotency_key: z.string().min(8).max(120),
});

export const reasonSchema = z.string().trim().min(3, "Informe o motivo").max(500);

export const inviteSchema = z.object({
  email: z.email({ message: "E-mail inválido" }).max(254),
  full_name: z.string().trim().min(2).max(120),
  role: z.enum(["admin", "seller"]),
});

/** Campos esperados do Google Forms (payload assinado do Apps Script). */
export const googleFormsPayloadSchema = z.object({
  event_id: z.string().min(8).max(200),
  form_id: z.string().min(5).max(200),
  response_id: z.string().min(5).max(200),
  submitted_at: z.iso.datetime({ offset: true }).optional(),
  ref: z.string().max(200).optional().default(""),
  fields: z.object({
    nome_contato: z.string().max(200).default(""),
    nome_empresa: z.string().max(200).default(""),
    email: z.string().max(254).default(""),
    whatsapp: z.string().max(40).default(""),
    instagram: z.string().max(120).default(""),
    servicos: z.string().max(1000).default(""),
  }).strict(),
}).strict();

export const importRowSchema = z.object({
  contact_name: z.string().trim().min(2, "nome_contato obrigatório").max(120),
  company_name: z.string().trim().min(1, "nome_empresa obrigatório").max(160),
  email: z.string().trim().max(254).optional().transform((v) => (v ? v.toLowerCase() : undefined))
    .pipe(z.email({ message: "e-mail inválido" }).optional()),
  whatsapp: z.string().trim().max(40).optional().transform((v, ctx) => {
    if (!v) return undefined;
    const n = normalizePhoneBR(v);
    if (!n) { ctx.addIssue({ code: "custom", message: "WhatsApp inválido" }); return z.NEVER; }
    return n;
  }),
  instagram: optionalText(120),
  tax_id: z.string().trim().max(20).optional().transform((v, ctx) => {
    if (!v) return undefined;
    if (!isValidTaxId(v)) { ctx.addIssue({ code: "custom", message: "CNPJ/CPF inválido" }); return z.NEVER; }
    return v.replace(/\D/g, "");
  }),
  business_description: optionalText(2000),
});
