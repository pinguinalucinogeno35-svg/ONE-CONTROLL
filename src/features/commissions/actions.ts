"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";
import { moneyInput, reasonSchema, uuid } from "@/lib/validation/schemas";
import type { ActionResult } from "@/server/errors";

type Prev = ActionResult<unknown> | null;

export async function approveCommissionsAction(_p: Prev, fd: FormData) {
  return runAction({ name: "approve_commissions", admin: true, schema: z.object({ ids: z.array(uuid).min(1, "Selecione ao menos uma comissão").max(200) }), input: formDataToObject(fd) }, async (ctx, d) => {
    const { data, error } = await ctx.supabase.rpc("approve_commissions", { p_entitlement_ids: d.ids });
    revalidatePath("/comissoes");
    return { error, message: `${data ?? 0} comissão(ões) aprovada(s).` };
  });
}

export async function cancelCommissionAction(id: string, _p: Prev, fd: FormData) {
  return runAction({ name: "cancel_commission", admin: true, schema: z.object({ reason: reasonSchema }), input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("cancel_commission", { p_entitlement_id: id, p_reason: d.reason });
    revalidatePath("/comissoes");
    return { error };
  });
}

export async function payCommissionAction(entitlementId: string, sellerId: string, _p: Prev, fd: FormData) {
  const schema = z.object({ cash_account_id: uuid, amount: moneyInput({ required: true, positive: true }), paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), idempotency_key: z.string().min(8).max(120) });
  return runAction({ name: "pay_commissions", admin: true, schema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("pay_commissions", {
      p_seller_id: sellerId, p_cash_account_id: d.cash_account_id,
      p_allocations: [{ entitlement_id: entitlementId, amount: d.amount }], p_paid_at: `${d.paid_at}T12:00:00-03:00`, p_idempotency_key: d.idempotency_key,
    });
    revalidatePath("/comissoes");
    return { error, message: "Pagamento de comissão registrado (saída única no caixa)." };
  });
}
