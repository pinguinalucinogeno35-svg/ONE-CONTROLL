// Matriz de permissões (camada de apresentação + servidor). A garantia final
// está no PostgreSQL (RLS, grants e rotinas). Ver docs/security/permissions.md.
export type Role = "admin" | "seller";

export const CAPABILITIES = {
  "clients.read_all": ["admin"],
  "clients.read_own": ["admin", "seller"],
  "clients.create": ["admin", "seller"],
  "clients.transfer": ["admin"],
  "clients.archive": ["admin"],
  "clients.import": ["admin", "seller"],
  "lead_links.create": ["admin", "seller"],
  "contracts.create": ["admin", "seller"],
  "contracts.approve": ["admin"],
  "contracts.amend": ["admin"],
  "projects.read": ["admin", "seller"],
  "projects.manage": ["admin"],
  "tasks.use": ["admin", "seller"],
  "tasks.groups": ["admin"],
  "tasks.read_all": ["admin"],
  "finance.cash": ["admin"],
  "finance.receivables": ["admin"],
  "finance.confirm_receipt": ["admin"],
  "finance.payables": ["admin"],
  "expenses.request": ["admin", "seller"],
  "expenses.approve": ["admin"],
  "costs.manage": ["admin"],
  "commissions.read_own": ["admin", "seller"],
  "commissions.read_all": ["admin"],
  "commissions.approve": ["admin"],
  "commissions.pay": ["admin"],
  "commissions.policies": ["admin"],
  "users.manage": ["admin"],
  "reports.full": ["admin"],
  "reports.own": ["admin", "seller"],
  "settings.manage": ["admin"],
  "audit.read": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role | null | undefined, capability: Capability): boolean {
  return !!role && (CAPABILITIES[capability] as readonly Role[]).includes(role);
}

export type NavItem = { href: string; label: string; icon: string; capability: Capability; children?: NavItem[] };

export const NAVIGATION: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard", capability: "clients.read_own" },
  { href: "/clientes", label: "Clientes", icon: "users", capability: "clients.read_own" },
  { href: "/contratos", label: "Contratos", icon: "file-text", capability: "contracts.create" },
  { href: "/tarefas", label: "Tarefas", icon: "list-checks", capability: "tasks.use" },
  { href: "/projetos", label: "Projetos", icon: "folder-kanban", capability: "projects.read" },
  {
    href: "/financeiro", label: "Financeiro", icon: "landmark", capability: "finance.cash",
    children: [
      { href: "/financeiro/receitas", label: "Receitas", icon: "trending-up", capability: "finance.receivables" },
      { href: "/financeiro/contas-a-receber", label: "Contas a Receber", icon: "receipt", capability: "finance.receivables" },
      { href: "/financeiro/despesas", label: "Despesas", icon: "wallet", capability: "expenses.approve" },
      { href: "/financeiro/custos", label: "Custos", icon: "hammer", capability: "costs.manage" },
      { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: "line-chart", capability: "finance.cash" },
    ],
  },
  { href: "/despesas", label: "Minhas Despesas", icon: "wallet", capability: "expenses.request" },
  { href: "/comissoes", label: "Comissões", icon: "percent", capability: "commissions.read_own" },
  { href: "/vendedores", label: "Vendedores", icon: "user-cog", capability: "users.manage" },
  { href: "/relatorios", label: "Relatórios", icon: "bar-chart-3", capability: "reports.own" },
  { href: "/notificacoes", label: "Notificações", icon: "bell", capability: "clients.read_own" },
  { href: "/configuracoes", label: "Configurações", icon: "settings", capability: "settings.manage" },
  { href: "/auditoria", label: "Auditoria", icon: "shield-check", capability: "audit.read" },
];

export function navigationFor(role: Role): NavItem[] {
  return NAVIGATION.filter((i) => can(role, i.capability))
    .filter((i) => !(role === "admin" && i.href === "/despesas"))
    .map((i) => ({ ...i, children: i.children?.filter((c) => can(role, c.capability)) }));
}
