import { requireActiveUser } from "@/server/auth/session";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/server-form";
import { markAllReadAction } from "@/features/notifications/actions";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Notificações" };

const LINKS: Record<string, string> = { clients: "/clientes/", contracts: "/contratos/", projects: "/projetos/", payables: "/despesas", commission_entitlements: "/comissoes", commission_payouts: "/comissoes", receivables: "/clientes" };

export default async function NotificationsPage() {
  const ctx = await requireActiveUser();
  const { data } = await ctx.supabase.from("notifications").select("id, title, message, entity_type, entity_id, read_at, created_at").order("created_at", { ascending: false }).limit(100);
  const href = (t: string | null, id: string | null) => {
    if (!t || !id) return null;
    const base = LINKS[t];
    if (!base) return null;
    if (t === "payables" && ctx.profile.role === "admin") return "/financeiro/despesas";
    if (t === "receivables") return ctx.profile.role === "admin" ? "/financeiro/contas-a-receber" : null;
    return base.endsWith("/") ? `${base}${id}` : base;
  };
  return (
    <>
      <PageHeader eyebrow="Conta / Notificações" title="Notificações" actions={<ActionButton action={markAllReadAction} label="Marcar todas como lidas" />} />
      {(data ?? []).length === 0 ? <EmptyState title="Nenhuma notificação" /> : (
        <ul className="flex flex-col gap-2">
          {data!.map((n) => {
            const link = href(n.entity_type, n.entity_id);
            return (
              <li key={n.id}><Card className={n.read_at ? "opacity-70" : "border-primary/50"}>
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">{!n.read_at && <span className="sr-only">Não lida: </span>}{n.title}</p>
                  <span className="text-xs text-muted">{formatDateTime(n.created_at)}</span>
                </div>
                <p className="text-sm text-muted">{n.message}</p>
                {link && <a href={link} className="mt-1 inline-block text-xs text-primary underline">Abrir</a>}
              </Card></li>
            );
          })}
        </ul>
      )}
    </>
  );
}
