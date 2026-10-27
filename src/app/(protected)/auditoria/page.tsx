import { requireAdmin } from "@/server/auth/session";
import { DataTable, Input, PageHeader, Pagination } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Auditoria" };
const PAGE_SIZE = 50;
type Row = { id: string; action: string; entity_type: string; entity_id: string | null; previous_values: unknown; new_values: unknown; source: string; created_at: string; profiles: { full_name: string } | null };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ acao?: string; entidade?: string; page?: string }> }) {
  const ctx = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  let q = ctx.supabase.from("audit_logs").select("id, action, entity_type, entity_id, previous_values, new_values, source, created_at, profiles(full_name)", { count: "exact" })
    .order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const acao = (sp.acao ?? "").replace(/[^a-z_]/g, "").slice(0, 60);
  const entidade = (sp.entidade ?? "").replace(/[^a-z_]/g, "").slice(0, 60);
  if (acao) q = q.ilike("action", `%${acao}%`);
  if (entidade) q = q.eq("entity_type", entidade);
  const { data, count } = await q.returns<Row[]>();
  const preview = (v: unknown) => (v ? JSON.stringify(v).slice(0, 220) : "—");
  return (
    <>
      <PageHeader eyebrow="Sistema / Auditoria" title="Auditoria" description="Registros imutáveis de operações críticas. Não podem ser editados ou excluídos pela interface." />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="acao">Ação</label><Input id="acao" name="acao" defaultValue={acao} placeholder="Ação (ex.: receipt_confirmed)" />
        <label className="sr-only" htmlFor="entidade">Entidade</label><Input id="entidade" name="entidade" defaultValue={entidade} placeholder="Entidade (ex.: contracts)" />
        <button className="min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-elevated">Filtrar</button>
      </form>
      <DataTable<Row> caption="Registros de auditoria" rows={data ?? []} rowKey={(r) => r.id} columns={[
        { key: "t", header: "Data", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span> },
        { key: "u", header: "Usuário", cell: (r) => r.profiles?.full_name ?? (r.source === "integration" ? "Integração" : "Sistema") },
        { key: "a", header: "Ação", cell: (r) => <code className="text-xs">{r.action}</code> },
        { key: "e", header: "Entidade", cell: (r) => <span className="text-xs text-muted">{r.entity_type}</span> },
        { key: "d", header: "Alterações", cell: (r) => <details><summary className="cursor-pointer text-xs text-muted">Ver</summary><pre className="mt-1 max-w-md whitespace-pre-wrap break-all text-[11px] text-muted">antes: {preview(r.previous_values)}{"\n"}depois: {preview(r.new_values)}</pre></details> },
      ]} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(p) => `/auditoria?${new URLSearchParams({ ...(acao && { acao }), ...(entidade && { entidade }), page: String(p) })}`} />
    </>
  );
}
