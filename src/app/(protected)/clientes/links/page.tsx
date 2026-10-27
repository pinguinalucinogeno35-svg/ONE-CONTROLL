import { requireActiveUser } from "@/server/auth/session";
import { Badge, Card, CardTitle, DataTable, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/server-form";
import { LeadLinkForm } from "@/features/clients/lead-link-form";
import { revokeLeadLinkAction } from "@/features/clients/lead-link-actions";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Links de cadastro" };

type Row = { id: string; label: string | null; status: string; use_count: number; max_uses: number | null; expires_at: string; created_at: string; profiles: { full_name: string } | null };
const TONE: Record<string, "success" | "neutral" | "danger" | "warning"> = { active: "success", used: "neutral", revoked: "danger", expired: "warning" };
const LABEL: Record<string, string> = { active: "Ativo", used: "Utilizado", revoked: "Revogado", expired: "Expirado" };

export default async function LeadLinksPage() {
  const ctx = await requireActiveUser();
  const { data } = await ctx.supabase.from("lead_capture_links").select("id, label, status, use_count, max_uses, expires_at, created_at, profiles(full_name)")
    .order("created_at", { ascending: false }).limit(100).returns<Row[]>();
  return (
    <>
      <PageHeader title="Links de cadastro (Google Forms)" description="Gere um link exclusivo e envie ao cliente. A resposta entra automaticamente na sua carteira, pendente de complementação." />
      <Card className="mb-6"><CardTitle className="mb-4">Gerar novo link</CardTitle><LeadLinkForm /></Card>
      <DataTable<Row> caption="Links gerados" rows={data ?? []} rowKey={(r) => r.id} columns={[
        { key: "label", header: "Identificação", cell: (r) => r.label ?? "—" },
        ...(ctx.profile.role === "admin" ? [{ key: "seller", header: "Vendedor", cell: (r: Row) => r.profiles?.full_name ?? "—" }] : []),
        { key: "status", header: "Status", cell: (r) => <Badge tone={TONE[r.status] ?? "neutral"}>{LABEL[r.status] ?? r.status}</Badge> },
        { key: "uses", header: "Usos", cell: (r) => `${r.use_count}${r.max_uses ? ` / ${r.max_uses}` : ""}` },
        { key: "exp", header: "Expira", cell: (r) => formatDateTime(r.expires_at) },
        { key: "act", header: "Ações", cell: (r) => r.status === "active" ? <ActionButton action={revokeLeadLinkAction.bind(null, r.id)} label="Revogar" variant="danger" confirm="Revogar este link? Novas respostas serão rejeitadas." /> : null },
      ]} />
    </>
  );
}
