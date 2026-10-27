import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveUser } from "@/server/auth/session";
import { Alert, Badge, Card, CardTitle, LinkButton, PageHeader } from "@/components/ui";
import { CLIENT_STATUS, CONTRACT_STATUS, PROJECT_STATUS, RECEIVABLE_STATUS, label } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatDecimalBRL } from "@/lib/money";
import { ClientStatusForm, EditClientForm, InterestsForm, TransferForm } from "@/features/clients/client-detail-forms";
import { Attachments } from "@/features/files/attachments";

export const metadata = { title: "Cliente" };

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireActiveUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = ctx.supabase;
  // Leitura sob RLS: cliente de outra carteira simplesmente não existe para o vendedor.
  const { data: client } = await db.from("clients").select("*, seller:profiles!clients_seller_id_fkey(full_name), original:profiles!clients_original_seller_id_fkey(full_name)").eq("id", id).maybeSingle();
  if (!client) notFound();
  const isAdmin = ctx.profile.role === "admin";
  const [services, interests, contracts, projects, receivables, transfers, sellers] = await Promise.all([
    db.from("services").select("id, name").eq("active", true).order("name"),
    db.from("client_service_interests").select("service_id").eq("client_id", id),
    db.from("contracts").select("id, contract_number, status, implementation_amount, monthly_amount, start_date").eq("client_id", id).order("created_at", { ascending: false }),
    db.from("projects").select("id, name, status, due_date").eq("client_id", id).order("created_at", { ascending: false }),
    db.from("receivables").select("id, description, amount, due_date, status").eq("client_id", id).order("due_date", { ascending: false }).limit(12),
    db.from("client_transfers").select("id, reason, transferred_at, prev:profiles!client_transfers_previous_seller_id_fkey(full_name), next:profiles!client_transfers_new_seller_id_fkey(full_name)").eq("client_id", id).order("transferred_at", { ascending: false }),
    isAdmin ? db.from("profiles").select("id, full_name").eq("status", "active").neq("id", client.seller_id).order("full_name") : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const [statusLabel, statusTone] = label(CLIENT_STATUS, client.status);

  return (
    <>
      <PageHeader eyebrow="Comercial / Cliente" title={client.company_name} description={`${client.contact_name} · responsável: ${client.seller?.full_name ?? "—"}${client.original_seller_id !== client.seller_id ? ` (original: ${client.original?.full_name ?? "—"})` : ""}`}
        actions={<><Badge tone={statusTone}>{statusLabel}</Badge><LinkButton href={`/contratos/novo?cliente=${client.id}`}>Novo contrato</LinkButton></>} />
      {client.status === "pending_completion" && <div className="mb-4"><Alert tone="warning" title="Cadastro pendente de complementação">Confira os dados recebidos e registre o contrato com valores, datas e origem da venda.</Alert></div>}
      {client.possible_duplicate_of && <div className="mb-4"><Alert tone="warning">Possível duplicidade com outro cadastro (mesmo e-mail, WhatsApp ou CNPJ). {isAdmin && <Link className="underline" href={`/clientes/${client.possible_duplicate_of}`}>Ver cadastro relacionado</Link>}</Alert></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardTitle className="mb-4">Dados do cliente</CardTitle><EditClientForm client={client} /></Card>
        <div className="flex flex-col gap-4">
          <Card><CardTitle className="mb-3">Status</CardTitle><ClientStatusForm clientId={client.id} status={client.status} isAdmin={isAdmin} /></Card>
          <Card><CardTitle className="mb-3">Serviços de interesse</CardTitle><InterestsForm clientId={client.id} services={services.data ?? []} selected={(interests.data ?? []).map((i) => i.service_id)} /></Card>
          {isAdmin && <Card><CardTitle className="mb-3">Transferir carteira</CardTitle><TransferForm clientId={client.id} sellers={sellers.data ?? []} /></Card>}
        </div>

        <Card className="lg:col-span-2">
          <CardTitle className="mb-3">Contratos</CardTitle>
          {(contracts.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum contrato.</p> : (
            <ul className="divide-y divide-border text-sm">
              {contracts.data!.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/contratos/${k.id}`} className="font-medium hover:underline">{k.contract_number}</Link>
                  <span className="tabular text-muted">Impl. {formatDecimalBRL(k.implementation_amount)} · Mensal {formatDecimalBRL(k.monthly_amount)} · início {formatDate(k.start_date)}</span>
                  <Badge tone={label(CONTRACT_STATUS, k.status)[1]}>{label(CONTRACT_STATUS, k.status)[0]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle className="mb-3">Projetos</CardTitle>
          {(projects.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum projeto.</p> : (
            <ul className="divide-y divide-border text-sm">
              {projects.data!.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/projetos/${p.id}`} className="hover:underline">{p.name}</Link>
                  <Badge tone={label(PROJECT_STATUS, p.status)[1]}>{label(PROJECT_STATUS, p.status)[0]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle className="mb-3">Cobranças</CardTitle>
          {(receivables.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhuma cobrança.</p> : (
            <ul className="divide-y divide-border text-sm">
              {receivables.data!.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{r.description}</span>
                  <span className="tabular text-muted">{formatDecimalBRL(r.amount)} · vence {formatDate(r.due_date)}</span>
                  <Badge tone={label(RECEIVABLE_STATUS, r.status)[1]}>{label(RECEIVABLE_STATUS, r.status)[0]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle className="mb-3">Histórico de carteira</CardTitle>
          {(transfers.data ?? []).length === 0 ? <p className="text-sm text-muted">Sem transferências.</p> : (
            <ul className="flex flex-col gap-2 text-sm">
              {transfers.data!.map((t) => {
                const tr = t as unknown as { id: string; reason: string; transferred_at: string; prev: { full_name: string } | null; next: { full_name: string } | null };
                return <li key={tr.id}><span className="text-muted">{formatDateTime(tr.transferred_at)}</span> — {tr.prev?.full_name} → {tr.next?.full_name}<br /><span className="text-xs text-muted">{tr.reason}</span></li>;
              })}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-3"><CardTitle className="mb-3">Documentos</CardTitle><Attachments resource="client_id" resourceId={client.id} /></Card>
      </div>
    </>
  );
}
