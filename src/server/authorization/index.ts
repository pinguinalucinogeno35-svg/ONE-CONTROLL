import "server-only";
import { notFound } from "next/navigation";
import type { ActiveContext } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { can, type Capability } from "@/lib/permissions";

// Verificações de escopo consultam o banco com o cliente do usuário (RLS):
// se a linha não é visível, o acesso é negado. Parâmetros de URL nunca
// comprovam autorização.

export async function requireClientAccess(ctx: ActiveContext, clientId: string) {
  const { data } = await ctx.supabase.from("clients").select("id, seller_id, organization_id").eq("id", clientId).maybeSingle();
  if (!data) notFound();
  return data as { id: string; seller_id: string; organization_id: string };
}

export async function requireProjectAccess(ctx: ActiveContext, projectId: string) {
  const { data } = await ctx.supabase.from("projects").select("id, client_id").eq("id", projectId).maybeSingle();
  if (!data) notFound();
  return data as { id: string; client_id: string };
}

export async function requireContractAccess(ctx: ActiveContext, contractId: string) {
  const { data } = await ctx.supabase.from("contracts").select("id, seller_id, client_id, status").eq("id", contractId).maybeSingle();
  if (!data) notFound();
  return data as { id: string; seller_id: string; client_id: string; status: string };
}

export function requireCapability(ctx: ActiveContext, capability: Capability) {
  if (!can(ctx.profile.role, capability)) throw new AppError("Acesso negado", 403);
}

export function requireFinancialPermission(ctx: ActiveContext, operation: "read" | "write") {
  requireCapability(ctx, operation === "read" ? "finance.cash" : "finance.confirm_receipt");
}

/** Vendedor só acessa as próprias comissões; admin acessa todas. */
export function requireCommissionAccess(ctx: ActiveContext, sellerId: string) {
  if (ctx.profile.role !== "admin" && ctx.profile.id !== sellerId) throw new AppError("Acesso negado", 403);
}
