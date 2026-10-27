import "server-only";
import type { ActiveContext } from "@/server/auth/session";
import type { CommissionPolicy } from "@/types/db";

/** Política usada para simulação: a ativa; na falta, o rascunho mais recente (provisória). */
export async function getEstimationPolicy(ctx: ActiveContext): Promise<CommissionPolicy | null> {
  const { data } = await ctx.supabase.from("commission_policies").select("*").in("status", ["active", "draft"])
    .order("status", { ascending: true }).order("created_at", { ascending: false });
  const rows = (data ?? []) as CommissionPolicy[];
  return rows.find((p) => p.status === "active") ?? rows[0] ?? null;
}

/** Dados de apoio ao formulário de contrato (somente registros visíveis ao usuário via RLS). */
export async function getContractFormData(ctx: ActiveContext) {
  const isAdmin = ctx.profile.role === "admin";
  const [clients, services, projects, sellers, policy] = await Promise.all([
    ctx.supabase.from("clients").select("id, company_name").neq("status", "archived").order("company_name").limit(1000),
    ctx.supabase.from("services").select("id, name").eq("active", true).order("name"),
    ctx.supabase.from("projects").select("id, name, client_id").not("status", "in", "(delivered,cancelled)").order("name").limit(1000),
    isAdmin ? ctx.supabase.from("profiles").select("id, full_name").eq("status", "active").order("full_name") : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    getEstimationPolicy(ctx),
  ]);
  return {
    isAdmin,
    clients: (clients.data ?? []).map((c) => ({ id: c.id as string, name: c.company_name as string })),
    services: (services.data ?? []).map((s) => ({ id: s.id as string, name: s.name as string })),
    projects: (projects.data ?? []).map((p) => ({ id: p.id as string, name: p.name as string, client_id: p.client_id as string })),
    sellers: isAdmin ? (sellers.data ?? []).map((s) => ({ id: s.id, name: s.full_name })) : undefined,
    policy,
  };
}
