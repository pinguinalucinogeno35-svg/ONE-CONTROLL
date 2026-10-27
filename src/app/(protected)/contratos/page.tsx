import Link from "next/link";
import { requireActiveUser } from "@/server/auth/session";
import { Badge, DataTable, EmptyState, LinkButton, PageHeader, Pagination, Select } from "@/components/ui";
import { CONTRACT_STATUS, SALE_ORIGIN, label } from "@/lib/labels";
import { formatDecimalBRL } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Contratos" };
const PAGE_SIZE = 25;
type Row = { id: string; contract_number: string; status: string; implementation_amount: string; monthly_amount: string; start_date: string; sale_origin: string; clients: { company_name: string } | null; profiles: { full_name: string } | null };

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const ctx = await requireActiveUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  let q = ctx.supabase.from("contracts").select("id, contract_number, status, implementation_amount, monthly_amount, start_date, sale_origin, clients(company_name), profiles!contracts_seller_id_fkey(full_name)", { count: "exact" })
    .order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.status && sp.status in CONTRACT_STATUS) q = q.eq("status", sp.status);
  const { data, count } = await q.returns<Row[]>();
  return (
    <>
      <PageHeader title="Contratos" actions={<LinkButton href="/contratos/novo">Novo contrato</LinkButton>} />
      <form className="mb-4 flex gap-2">
        <label htmlFor="status" className="sr-only">Status</label>
        <Select id="status" name="status" defaultValue={sp.status ?? ""} className="sm:w-64"><option value="">Todos os status</option>{Object.entries(CONTRACT_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>
        <button className="min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-elevated">Filtrar</button>
      </form>
      <DataTable<Row> caption="Contratos" rows={data ?? []} rowKey={(r) => r.id}
        empty={<EmptyState title="Nenhum contrato" action={<LinkButton href="/contratos/novo">Novo contrato</LinkButton>} />}
        columns={[
          { key: "n", header: "Número", cell: (r) => <Link href={`/contratos/${r.id}`} className="font-medium hover:underline">{r.contract_number}</Link> },
          { key: "c", header: "Cliente", cell: (r) => r.clients?.company_name ?? "—" },
          ...(ctx.profile.role === "admin" ? [{ key: "s", header: "Vendedor", cell: (r: Row) => r.profiles?.full_name ?? "—" }] : []),
          { key: "i", header: "Implementação", cell: (r) => <span className="tabular">{formatDecimalBRL(r.implementation_amount)}</span> },
          { key: "m", header: "Mensalidade", cell: (r) => <span className="tabular">{formatDecimalBRL(r.monthly_amount)}</span> },
          { key: "o", header: "Origem", cell: (r) => <span className="text-muted">{SALE_ORIGIN[r.sale_origin]}</span> },
          { key: "d", header: "Início", cell: (r) => formatDate(r.start_date) },
          { key: "st", header: "Status", cell: (r) => <Badge tone={label(CONTRACT_STATUS, r.status)[1]}>{label(CONTRACT_STATUS, r.status)[0]}</Badge> },
        ]} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(p) => `/contratos?${new URLSearchParams({ ...(sp.status && { status: sp.status }), page: String(p) })}`} />
    </>
  );
}
