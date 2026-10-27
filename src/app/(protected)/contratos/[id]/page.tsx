import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveUser } from "@/server/auth/session";
import { Alert, Badge, Card, CardTitle, LinkButton, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/server-form";
import { COMMISSION_STATUS, CONTRACT_STATUS, RECEIVABLE_STATUS, RECEIVABLE_TYPE, SALE_ORIGIN, label } from "@/lib/labels";
import { formatDecimalBRL } from "@/lib/money";
import { formatBps } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { submitContractAction } from "@/features/contracts/actions";
import { AmendForm, ApproveForm, CancelForm, RejectForm } from "@/features/contracts/contract-admin-forms";
import { Attachments } from "@/features/files/attachments";

export const metadata = { title: "Contrato" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireActiveUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = ctx.supabase;
  const { data: k } = await db.from("contracts").select("*, clients(id, company_name), seller:profiles!contracts_seller_id_fkey(full_name), approver:profiles!contracts_approved_by_fkey(full_name), commission_policies(name, status, base_rule)").eq("id", id).maybeSingle();
  if (!k) notFound();
  const [services, referral, versions, receivables, commissions] = await Promise.all([
    db.from("contract_services").select("id, quantity, unit_amount, description, services(name)").eq("contract_id", id),
    db.from("contract_referrals").select("origin_type, external_referrer_name, notes, first:clients!contract_referrals_first_referrer_client_id_fkey(company_name), second:clients!contract_referrals_second_referrer_client_id_fkey(company_name)").eq("contract_id", id).maybeSingle(),
    db.from("contract_versions").select("id, version_number, change_reason, created_at, profiles(full_name)").eq("contract_id", id).order("version_number", { ascending: false }),
    db.from("receivables").select("id, description, type, amount, due_date, status").eq("contract_id", id).order("due_date").limit(24),
    db.from("commission_entitlements").select("id, base_amount, rate_bps, commission_amount, status, created_at").eq("contract_id", id).order("created_at"),
  ]);
  const isAdmin = ctx.profile.role === "admin";
  const isOwner = k.seller_id === ctx.userId;
  const editable = ["draft", "pending_approval"].includes(k.status) && (isAdmin || isOwner);
  const ref = referral.data as unknown as { origin_type: string; external_referrer_name: string | null; notes: string | null; first: { company_name: string } | null; second: { company_name: string } | null } | null;

  return (
    <>
      <PageHeader eyebrow="Comercial / Contrato" title={`Contrato ${k.contract_number}`} description={`${k.clients?.company_name ?? ""} · vendedor: ${k.seller?.full_name ?? "—"} · versão ${k.version}`}
        actions={<>
          <Badge tone={label(CONTRACT_STATUS, k.status)[1]}>{label(CONTRACT_STATUS, k.status)[0]}</Badge>
          {editable && <LinkButton variant="secondary" href={`/contratos/${k.id}/editar`}>Editar</LinkButton>}
          {k.status === "draft" && (isAdmin || isOwner) && <ActionButton action={submitContractAction.bind(null, k.id)} label="Enviar para aprovação" variant="primary" />}
        </>} />
      {k.rejection_reason && k.status === "draft" && <div className="mb-4"><Alert tone="warning" title="Devolvido pela administração">{k.rejection_reason}</Alert></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle className="mb-3">Condições comerciais</CardTitle>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted">Implementação</dt><dd className="tabular font-semibold">{formatDecimalBRL(k.implementation_amount)}</dd></div>
            <div><dt className="text-muted">Mensalidade</dt><dd className="tabular font-semibold">{formatDecimalBRL(k.monthly_amount)}</dd></div>
            <div><dt className="text-muted">Dia de cobrança</dt><dd>{k.billing_day ?? "—"}</dd></div>
            <div><dt className="text-muted">Início</dt><dd>{formatDate(k.start_date)}</dd></div>
            <div><dt className="text-muted">Entrega</dt><dd>{formatDate(k.delivery_due_date)}</dd></div>
            <div><dt className="text-muted">Início mensalidades</dt><dd>{formatDate(k.recurring_start_date)}</dd></div>
            <div><dt className="text-muted">Origem da venda</dt><dd>{SALE_ORIGIN[k.sale_origin]}</dd></div>
            <div><dt className="text-muted">Percentual de comissão</dt><dd>{k.commission_rate_bps != null ? formatBps(k.commission_rate_bps) : "—"} {["draft", "pending_approval"].includes(k.status) ? <span className="text-xs text-muted">(definido na aprovação)</span> : null}</dd></div>
            <div><dt className="text-muted">Aprovado por</dt><dd>{k.approver?.full_name ?? "—"} {k.approved_at && <span className="text-xs text-muted">em {formatDateTime(k.approved_at)}</span>}</dd></div>
          </dl>
          {ref && ref.origin_type !== "direct" && (
            <p className="mt-4 text-sm text-muted">Indicação: {ref.first?.company_name ?? ref.external_referrer_name ?? "—"}{ref.second && ` · intermediária: ${ref.second.company_name}`}</p>
          )}
          {(services.data ?? []).length > 0 && (
            <ul className="mt-4 divide-y divide-border text-sm">
              {services.data!.map((s) => {
                const row = s as unknown as { id: string; quantity: number; unit_amount: string | null; services: { name: string } | null };
                return <li key={row.id} className="flex justify-between py-2"><span>{row.services?.name} × {row.quantity}</span><span className="tabular text-muted">{row.unit_amount ? formatDecimalBRL(row.unit_amount) : "—"}</span></li>;
              })}
            </ul>
          )}
          {k.notes && <p className="mt-4 whitespace-pre-line text-sm text-muted">{k.notes}</p>}
        </Card>

        <div className="flex flex-col gap-4">
          {isAdmin && ["draft", "pending_approval"].includes(k.status) && <Card><CardTitle className="mb-3">Aprovação</CardTitle><ApproveForm id={k.id} startDate={k.start_date} />{k.status === "pending_approval" && <div className="mt-4 border-t border-border pt-4"><RejectForm id={k.id} /></div>}</Card>}
          {isAdmin && ["approved", "active"].includes(k.status) && <Card><CardTitle className="mb-3">Aditivo</CardTitle><AmendForm id={k.id} /></Card>}
          {isAdmin && k.status !== "cancelled" && <Card><CardTitle className="mb-3">Cancelamento</CardTitle><CancelForm id={k.id} /></Card>}
          <Card>
            <CardTitle className="mb-3">Versões</CardTitle>
            <ul className="flex flex-col gap-2 text-sm">
              {(versions.data ?? []).map((v) => {
                const row = v as unknown as { id: string; version_number: number; change_reason: string; created_at: string; profiles: { full_name: string } | null };
                return <li key={row.id}><span className="font-medium">v{row.version_number}</span> · {row.change_reason}<br /><span className="text-xs text-muted">{row.profiles?.full_name} · {formatDateTime(row.created_at)}</span></li>;
              })}
            </ul>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardTitle className="mb-3">Cobranças</CardTitle>
          {(receivables.data ?? []).length === 0 ? <p className="text-sm text-muted">Geradas após a aprovação.</p> : (
            <ul className="divide-y divide-border text-sm">
              {receivables.data!.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{RECEIVABLE_TYPE[r.type]} · {r.description}</span>
                  <span className="tabular text-muted">{formatDecimalBRL(r.amount)} · {formatDate(r.due_date)}</span>
                  <Badge tone={label(RECEIVABLE_STATUS, r.status)[1]}>{label(RECEIVABLE_STATUS, r.status)[0]}</Badge>
                </li>
              ))}
            </ul>
          )}
          {isAdmin && <Link href={`/financeiro/contas-a-receber?contrato=${k.id}`} className="mt-3 inline-block text-xs text-primary underline">Registrar recebimentos</Link>}
        </Card>
        <Card>
          <CardTitle className="mb-3">Comissões do contrato</CardTitle>
          {(commissions.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhuma comissão adquirida. Comissões são geradas pelos recebimentos, conforme a política ativa.</p> : (
            <ul className="divide-y divide-border text-sm">
              {commissions.data!.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="tabular">{formatBps(c.rate_bps)} × {formatDecimalBRL(c.base_amount)} = <strong>{formatDecimalBRL(c.commission_amount)}</strong></span>
                  <Badge tone={label(COMMISSION_STATUS, c.status)[1]}>{label(COMMISSION_STATUS, c.status)[0]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-3"><CardTitle className="mb-3">Documentos (contrato assinado, proposta)</CardTitle><Attachments resource="contract_id" resourceId={k.id} /></Card>
      </div>
    </>
  );
}
