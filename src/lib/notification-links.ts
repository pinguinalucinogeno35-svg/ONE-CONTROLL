/**
 * Destino de cada notificação (página interna). Compartilhado pela central de
 * notificações e pelo push: o clique leva à mesma tela, sempre sob login/RLS.
 */
const LINKS: Record<string, string> = {
  tasks: "/tarefas/",
  clients: "/clientes/",
  contracts: "/contratos/",
  projects: "/projetos/",
  payables: "/despesas",
  commission_entitlements: "/comissoes",
  commission_payouts: "/comissoes",
  receivables: "/clientes",
};

export function notificationHref(entityType: string | null, entityId: string | null, role: "admin" | "seller" | null): string | null {
  if (!entityType || !entityId) return null;
  const base = LINKS[entityType];
  if (!base) return null;
  if (entityType === "payables" && role === "admin") return "/financeiro/despesas";
  if (entityType === "receivables") return role === "admin" ? "/financeiro/contas-a-receber" : null;
  return base.endsWith("/") ? `${base}${entityId}` : base;
}

/**
 * Conteúdo exibido na tela de bloqueio. Tarefas mostram o texto personalizado;
 * avisos financeiros, comerciais e de clientes mostram só um aviso genérico —
 * valores, nomes de clientes e comissões ficam dentro do app, após login.
 */
export function pushContent(type: string, title: string, message: string): { title: string; body: string } {
  if (type.startsWith("task_")) return { title: title.slice(0, 120), body: message.slice(0, 240) };
  const generic: Record<string, string> = {
    invoice: "Há um aviso de cobrança para você.",
    expense: "Há uma despesa aguardando sua atenção.",
    commission: "Há uma atualização de comissão.",
    contract: "Há uma atualização de contrato.",
    project: "Há uma atualização de projeto.",
    client: "Há uma atualização de cliente.",
    form: "Chegou um novo cadastro pelo formulário.",
  };
  const key = Object.keys(generic).find((k) => type.startsWith(k));
  return { title: "ONE CONTROL", body: (key && generic[key]) || "Você tem uma nova notificação." };
}
