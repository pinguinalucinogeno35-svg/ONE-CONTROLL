import "server-only";
import type { ActiveContext } from "@/server/auth/session";
import { fromDecimalString, toDecimalString } from "@/lib/money";

export async function getActiveAccounts(ctx: ActiveContext) {
  const { data } = await ctx.supabase.from("cash_accounts").select("id, name").eq("active", true).order("name");
  return (data ?? []).map((a) => ({ id: a.id as string, name: a.name as string }));
}

/** Saldo em aberto = valor − pagamentos não estornados (calculado em centavos). */
export async function receivableBalances(ctx: ActiveContext, ids: string[]) {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const { data } = await ctx.supabase.from("receipts").select("receivable_id, amount").in("receivable_id", ids).is("reversed_at", null);
  for (const r of data ?? []) map.set(r.receivable_id, (map.get(r.receivable_id) ?? 0) + fromDecimalString(r.amount));
  return map;
}

export async function payableBalances(ctx: ActiveContext, ids: string[]) {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const { data } = await ctx.supabase.from("outgoing_payments").select("payable_id, amount").in("payable_id", ids).is("reversed_at", null);
  for (const r of data ?? []) map.set(r.payable_id, (map.get(r.payable_id) ?? 0) + fromDecimalString(r.amount));
  return map;
}

export function balanceString(amount: string | number, paidCents: number): string {
  return toDecimalString(fromDecimalString(amount) - paidCents);
}

export async function getCategories(ctx: ActiveContext, kind: "expense" | "direct_cost") {
  const { data } = await ctx.supabase.from("financial_categories").select("id, name").eq("kind", kind).eq("active", true).order("name");
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));
}
