"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";
import { expenseSchema, moneyInput, outgoingPaymentSchema, reasonSchema, receiptSchema, uuid } from "@/lib/validation/schemas";
import type { ActionResult } from "@/server/errors";

type Prev = ActionResult<unknown> | null;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
// Datas informadas são do fuso America/Bahia (UTC−3); meio-dia evita virada de dia.
const atNoonBahia = (d: string) => `${d}T12:00:00-03:00`;

function done(paths: string[]) {
  paths.forEach((p) => revalidatePath(p));
}

export async function confirmReceiptAction(_p: Prev, fd: FormData) {
  return runAction({ name: "confirm_receipt", admin: true, schema: receiptSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("confirm_receipt", {
      p_receivable_id: d.receivable_id, p_cash_account_id: d.cash_account_id, p_amount: d.amount, p_payment_method: d.payment_method,
      p_received_at: atNoonBahia(d.received_at), p_reference: d.reference ?? null, p_idempotency_key: d.idempotency_key,
    });
    done(["/financeiro/contas-a-receber", "/financeiro/receitas", "/dashboard"]);
    return { error, message: "Recebimento confirmado e lançado no caixa." };
  });
}

export async function reverseReceiptAction(receiptId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "reverse_receipt", admin: true, schema: z.object({ reason: reasonSchema }), input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("reverse_receipt", { p_receipt_id: receiptId, p_reason: d.reason });
    done(["/financeiro/receitas", "/financeiro/contas-a-receber"]);
    return { error, message: "Estorno registrado." };
  });
}

export async function createReceivableAction(_p: Prev, fd: FormData) {
  const schema = z.object({
    client_id: uuid, description: z.string().trim().min(2).max(300), amount: moneyInput({ required: true, positive: true }),
    due_date: isoDate, type: z.enum(["additional_service", "other"]), external_reference: z.string().trim().max(120).optional(),
  });
  return runAction({ name: "create_receivable", admin: true, schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("create_receivable", { p: d });
    done(["/financeiro/contas-a-receber"]);
    return { error, message: "Cobrança criada." };
  });
}

export async function cancelReceivableAction(receivableId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "cancel_receivable", admin: true, schema: z.object({ reason: reasonSchema }), input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("cancel_receivable", { p_receivable_id: receivableId, p_reason: d.reason });
    done(["/financeiro/contas-a-receber"]);
    return { error };
  });
}

export async function generateReceivablesAction(_p: Prev, _fd: FormData) {
  return runAction({ name: "generate_due_receivables", admin: true, schema: z.object({}), input: {} }, async (ctx) => {
    const { data, error } = await ctx.supabase.rpc("generate_due_receivables", { p_until: null });
    done(["/financeiro/contas-a-receber"]);
    return { error, message: `${data ?? 0} mensalidade(s) gerada(s) para os próximos 30 dias.` };
  });
}

export async function requestExpenseAction(_p: Prev, fd: FormData) {
  return runAction({ name: "request_expense", schema: expenseSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { data, error } = await ctx.supabase.rpc("request_expense", { p: d });
    done(["/despesas", "/financeiro/despesas"]);
    return { data: data as string, error, message: "Solicitação enviada para aprovação. O caixa só muda após o pagamento." };
  });
}

export async function registerPayableAction(kind: "expense" | "direct_cost", _p: Prev, fd: FormData) {
  return runAction({ name: `register_${kind}`, admin: true, schema: expenseSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("register_payable", { p_kind: kind, p: d });
    done(["/financeiro/despesas", "/financeiro/custos"]);
    return { error, message: kind === "direct_cost" ? "Custo lançado (aprovado, aguardando pagamento)." : "Despesa lançada (aprovada, aguardando pagamento)." };
  });
}

export async function approveExpenseAction(payableId: string, _p: Prev, _fd: FormData) {
  return runAction({ name: "approve_expense", admin: true, schema: z.object({}), input: {} }, async (ctx) => {
    const { error } = await ctx.supabase.rpc("approve_expense", { p_payable_id: payableId });
    done(["/financeiro/despesas"]);
    return { error };
  });
}

export async function rejectExpenseAction(payableId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "reject_expense", admin: true, schema: z.object({ reason: reasonSchema }), input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("reject_expense", { p_payable_id: payableId, p_reason: d.reason });
    done(["/financeiro/despesas"]);
    return { error };
  });
}

export async function cancelPayableAction(payableId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "cancel_payable", schema: z.object({ reason: reasonSchema }), input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("cancel_payable", { p_payable_id: payableId, p_reason: d.reason });
    done(["/financeiro/despesas", "/financeiro/custos", "/despesas"]);
    return { error };
  });
}

export async function payPayableAction(_p: Prev, fd: FormData) {
  return runAction({ name: "confirm_outgoing_payment", admin: true, schema: outgoingPaymentSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("confirm_outgoing_payment", {
      p_payable_id: d.payable_id, p_cash_account_id: d.cash_account_id, p_amount: d.amount, p_payment_method: d.payment_method,
      p_paid_at: atNoonBahia(d.paid_at), p_idempotency_key: d.idempotency_key,
    });
    done(["/financeiro/despesas", "/financeiro/custos", "/dashboard"]);
    return { error, message: "Pagamento confirmado e lançado no caixa." };
  });
}

export async function reversePaymentAction(paymentId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "reverse_outgoing_payment", admin: true, schema: z.object({ reason: reasonSchema }), input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("reverse_outgoing_payment", { p_payment_id: paymentId, p_reason: d.reason });
    done(["/financeiro/despesas", "/financeiro/custos"]);
    return { error, message: "Estorno registrado." };
  });
}

export async function createCashAccountAction(_p: Prev, fd: FormData) {
  const schema = z.object({
    name: z.string().trim().min(2).max(80), account_type: z.enum(["bank", "cash", "digital_wallet", "other"]),
    opening_balance: moneyInput(), opening_date: isoDate,
  });
  return runAction({ name: "create_cash_account", admin: true, schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.from("cash_accounts").insert({ ...d, organization_id: ctx.profile.organization_id });
    done(["/financeiro"]);
    return { error, message: "Conta criada." };
  });
}

export async function transferAction(_p: Prev, fd: FormData) {
  const schema = z.object({ from: uuid, to: uuid, amount: moneyInput({ required: true, positive: true }), occurred_at: isoDate, description: z.string().trim().max(300).optional() });
  return runAction({ name: "transfer_between_accounts", admin: true, schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("transfer_between_accounts", { p_from: d.from, p_to: d.to, p_amount: d.amount, p_occurred_at: atNoonBahia(d.occurred_at), p_description: d.description ?? null });
    done(["/financeiro"]);
    return { error, message: "Transferência registrada (caixa consolidado inalterado)." };
  });
}
