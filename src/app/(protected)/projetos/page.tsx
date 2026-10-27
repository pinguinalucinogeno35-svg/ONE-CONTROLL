import Link from "next/link";
import { requireActiveUser } from "@/server/auth/session";
import { Badge, DataTable, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { PROJECT_STATUS, label } from "@/lib/labels";
import { formatDate, todayISO } from "@/lib/dates";

export const metadata = { title: "Projetos" };
type Row = { id: string; name: string; status: string; due_date: string | null; start_date: string | null; clients: { company_name: string } | null };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const ctx = await requireActiveUser();
  const { todos } = await searchParams;
  let q = ctx.supabase.from("projects").select("id, name, status, due_date, start_date, clients(company_name)").order("due_date", { ascending: true, nullsFirst: false }).limit(200);
  if (!todos) q = q.not("status", "in", "(delivered,cancelled)");
  const { data } = await q.returns<Row[]>();
  const today = todayISO();
  return (
    <>
      <PageHeader eyebrow="Operação / Projetos" title="Projetos" description={todos ? "Todos os projetos" : "Projetos em aberto"}
        actions={<>
          <LinkButton variant="secondary" href={todos ? "/projetos" : "/projetos?todos=1"}>{todos ? "Somente em aberto" : "Incluir entregues/cancelados"}</LinkButton>
          {ctx.profile.role === "admin" && <LinkButton href="/projetos/novo">Novo projeto</LinkButton>}
        </>} />
      <DataTable<Row> caption="Projetos" rows={data ?? []} rowKey={(r) => r.id} empty={<EmptyState title="Nenhum projeto" />} columns={[
        { key: "n", header: "Projeto", cell: (r) => <Link href={`/projetos/${r.id}`} className="font-medium hover:underline">{r.name}</Link> },
        { key: "c", header: "Cliente", cell: (r) => r.clients?.company_name ?? "—" },
        { key: "s", header: "Início", cell: (r) => formatDate(r.start_date) },
        { key: "d", header: "Entrega", cell: (r) => <span className="flex items-center gap-2">{formatDate(r.due_date)}{r.due_date && r.due_date < today && !["delivered", "cancelled"].includes(r.status) && <Badge tone="danger">Atrasado</Badge>}</span> },
        { key: "st", header: "Status", cell: (r) => <Badge tone={label(PROJECT_STATUS, r.status)[1]}>{label(PROJECT_STATUS, r.status)[0]}</Badge> },
      ]} />
    </>
  );
}
