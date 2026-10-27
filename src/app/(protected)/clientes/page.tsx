import Link from "next/link";
import { requireActiveUser } from "@/server/auth/session";
import { Badge, DataTable, EmptyState, Input, LinkButton, PageHeader, Pagination, Select } from "@/components/ui";
import { CLIENT_STATUS, label } from "@/lib/labels";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Clientes" };
const PAGE_SIZE = 25;

type Row = { id: string; company_name: string; contact_name: string; email: string | null; whatsapp: string | null; status: string; created_at: string; possible_duplicate_of: string | null; profiles: { full_name: string } | null };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await requireActiveUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").replace(/[,()*%\\]/g, " ").trim().slice(0, 80);
  // RLS restringe automaticamente à carteira do vendedor.
  let query = ctx.supabase.from("clients")
    .select("id, company_name, contact_name, email, whatsapp, status, created_at, possible_duplicate_of, profiles!clients_seller_id_fkey(full_name)", { count: "exact" })
    .order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (sp.status && sp.status in CLIENT_STATUS) query = query.eq("status", sp.status);
  else query = query.neq("status", "archived");
  const { data, count } = await query.returns<Row[]>();
  const isAdmin = ctx.profile.role === "admin";
  const href = (p: number) => `/clientes?${new URLSearchParams({ ...(q && { q }), ...(sp.status && { status: sp.status }), page: String(p) })}`;

  return (
    <>
      <PageHeader eyebrow="Comercial / Carteira" title="Clientes" description={isAdmin ? "Todos os clientes da organização" : "Sua carteira comercial"}
        actions={<>
          <LinkButton href="/clientes/links" variant="secondary">Links de cadastro</LinkButton>
          <LinkButton href="/clientes/importar" variant="secondary">Importar</LinkButton>
          <LinkButton href="/clientes/novo">Novo cliente</LinkButton>
        </>} />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <label className="sr-only" htmlFor="q">Buscar</label>
        <Input id="q" name="q" defaultValue={q} placeholder="Buscar por empresa, contato ou e-mail" />
        <label className="sr-only" htmlFor="status">Status</label>
        <Select id="status" name="status" defaultValue={sp.status ?? ""} className="sm:w-60">
          <option value="">Todos (exceto arquivados)</option>
          {Object.entries(CLIENT_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <button className="min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-elevated">Filtrar</button>
      </form>
      <DataTable<Row>
        caption="Lista de clientes"
        rows={data ?? []}
        rowKey={(r) => r.id}
        empty={<EmptyState title="Nenhum cliente encontrado" description="Cadastre um cliente ou gere um link de formulário." action={<LinkButton href="/clientes/novo">Novo cliente</LinkButton>} />}
        columns={[
          { key: "company", header: "Empresa", cell: (r) => <Link className="font-medium hover:underline" href={`/clientes/${r.id}`}>{r.company_name}</Link> },
          { key: "contact", header: "Contato", cell: (r) => <span className="text-muted">{r.contact_name}</span> },
          { key: "phone", header: "WhatsApp", cell: (r) => <span className="text-muted">{r.whatsapp ?? "—"}</span> },
          ...(isAdmin ? [{ key: "seller", header: "Vendedor", cell: (r: Row) => <span className="text-muted">{r.profiles?.full_name ?? "—"}</span> }] : []),
          { key: "status", header: "Status", cell: (r) => <span className="flex flex-wrap gap-1"><Badge tone={label(CLIENT_STATUS, r.status)[1]}>{label(CLIENT_STATUS, r.status)[0]}</Badge>{r.possible_duplicate_of && <Badge tone="warning">Possível duplicidade</Badge>}</span> },
          { key: "created", header: "Cadastro", cell: (r) => <span className="tabular text-muted">{formatDate(r.created_at)}</span> },
        ]}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={href} />
    </>
  );
}
