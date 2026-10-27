import Link from "next/link";
import { requireActiveUser } from "@/server/auth/session";
import { Alert, Badge, Card, CardTitle, DataTable, PageHeader, Stat } from "@/components/ui";
import { ApproveCommissionsForm, CancelCommissionForm, PayCommissionForm } from "@/features/commissions/forms";
import { getActiveAccounts } from "@/server/services/finance";
import { getEstimationPolicy } from "@/server/services/commercial";
import { BASE_RULE, COMMISSION_STATUS, SALE_ORIGIN, label } from "@/lib/labels";
import { formatBps, formatBRL, formatDecimalBRL, fromDecimalString, toDecimalString } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";

export const metadata = { title: "Comissões" };
type Row = { id: string; seller_id: string; sale_origin: string; base_amount: string; rate_bps: number; commission_amount: string; status: string; created_at: string;
  contracts: { id: string; contract_number: string; clients: { company_name: string } | null } | null; profiles: { full_name: string } | null; commission_policies: { requires_approval: boolean } | null };

export default async function CommissionsPage() {
  const ctx = await requireActiveUser();
  const isAdmin = ctx.profile.role === "admin";
  // RLS: vendedor vê apenas as próprias comissões e pagamentos.
  const [list, payouts, policy, accounts] = await Promise.all([
    ctx.supabase.from("commission_entitlements").select("id, seller_id, sale_origin, base_amount, rate_bps, commission_amount, status, created_at, contracts(id, contract_number, clients(company_name)), profiles!commission_entitlements_seller_id_fkey(full_name), commission_policies(requires_approval)")
      .order("created_at", { ascending: false }).limit(300).returns<Row[]>(),
    ctx.supabase.from("commission_payouts").select("id, paid_amount, paid_at, status, profiles!commission_payouts_seller_id_fkey(full_name), commission_payout_items(commission_entitlement_id, allocated_amount)").order("paid_at", { ascending: false }).limit(100),
    getEstimationPolicy(ctx),
    isAdmin ? getActiveAccounts(ctx) : Promise.resolve([]),
  ]);
  const rows = list.data ?? [];
  const paidBy = new Map<string, number>();
  for (const p of payouts.data ?? []) {
    if (p.status !== "confirmed") continue;
    for (const i of (p.commission_payout_items ?? []) as { commission_entitlement_id: string; allocated_amount: string }[]) {
      paidBy.set(i.commission_entitlement_id, (paidBy.get(i.commission_entitlement_id) ?? 0) + fromDecimalString(i.allocated_amount));
    }
  }
  const sum = (st: string[], f: (r: Row) => number = (r) => fromDecimalString(r.commission_amount)) => rows.filter((r) => st.includes(r.status)).reduce((s, r) => s + f(r), 0);
  const awaiting = rows.filter((r) => ["earned", "awaiting_approval"].includes(r.status) && r.commission_policies?.requires_approval !== false);
  const payable = rows.filter((r) => ["approved", "partially_paid"].includes(r.status) || (r.status === "earned" && r.commission_policies?.requires_approval === false));

  return (
    <>
      <PageHeader title="Comissões" description={isAdmin ? "Apuração, aprovação e pagamento de comissões dos vendedores" : "Suas comissões"}
        actions={isAdmin ? <Link href="/configuracoes#politicas" className="text-sm text-primary underline">Políticas de comissão</Link> : undefined} />
      {policy && (policy.status !== "active" || !policy.base_rule) ? (
        <div className="mb-4"><Alert tone="warning" title="Política de comissão pendente de decisão comercial">
          Taxas definidas (direta {formatBps(policy.direct_rate_bps)}, indicação {formatBps(policy.referral_rate_bps)}, indicação da indicação {formatBps(policy.second_level_rate_bps)}), mas a base de cálculo e o fato gerador ainda não foram aprovados. Até lá, os valores exibidos nos contratos são simulações e nenhuma comissão a pagar é gerada.
        </Alert></div>
      ) : policy && <div className="mb-4"><Alert tone="info">Política ativa: base “{BASE_RULE[policy.base_rule!]}”, vigente desde {formatDate(policy.effective_from)}.</Alert></div>}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Adquiridas (aguardando aprovação)" value={formatBRL(sum(["earned", "awaiting_approval"]))} />
        <Stat label="Aprovadas a pagar" value={formatBRL(sum(["approved", "partially_paid"], (r) => fromDecimalString(r.commission_amount) - (paidBy.get(r.id) ?? 0)))} tone="warning" />
        <Stat label="Pagas" value={formatBRL([...paidBy.values()].reduce((a, b) => a + b, 0))} tone="success" />
        <Stat label="Revertidas/canceladas" value={formatBRL(sum(["reversed", "cancelled"]))} />
      </div>
      {isAdmin && awaiting.length > 0 && (
        <Card className="mb-6"><CardTitle className="mb-3">Aguardando aprovação</CardTitle>
          <ApproveCommissionsForm items={awaiting.map((r) => ({ id: r.id, amount: r.commission_amount, label: `${r.profiles?.full_name} · ${r.contracts?.contract_number} · ${formatBps(r.rate_bps)} × ${formatDecimalBRL(r.base_amount)}` }))} />
        </Card>
      )}
      {isAdmin && payable.length > 0 && (
        <Card className="mb-6"><CardTitle className="mb-3">Liberadas para pagamento</CardTitle>
          <ul className="flex flex-col gap-4">{payable.map((r) => {
            const balance = toDecimalString(fromDecimalString(r.commission_amount) - (paidBy.get(r.id) ?? 0));
            return (
              <li key={r.id} className="rounded-lg border border-border p-3">
                <p className="mb-2 text-sm"><strong>{r.profiles?.full_name}</strong> · {r.contracts?.contract_number} · total {formatDecimalBRL(r.commission_amount)} · saldo <strong>{formatDecimalBRL(balance)}</strong></p>
                {accounts.length ? <PayCommissionForm entitlementId={r.id} sellerId={r.seller_id} balance={balance} accounts={accounts} /> : <p className="text-xs text-amber-300">Cadastre uma conta financeira.</p>}
              </li>
            );
          })}</ul>
        </Card>
      )}
      <DataTable<Row> caption="Comissões" rows={rows} rowKey={(r) => r.id} columns={[
        { key: "d", header: "Data", cell: (r) => formatDate(r.created_at) },
        ...(isAdmin ? [{ key: "s", header: "Vendedor", cell: (r: Row) => r.profiles?.full_name ?? "—" }] : []),
        { key: "k", header: "Contrato", cell: (r) => r.contracts ? <Link className="hover:underline" href={`/contratos/${r.contracts.id}`}>{r.contracts.contract_number}</Link> : "—" },
        { key: "c", header: "Cliente", cell: (r) => r.contracts?.clients?.company_name ?? "—" },
        { key: "o", header: "Origem", cell: (r) => SALE_ORIGIN[r.sale_origin] },
        { key: "calc", header: "Cálculo", cell: (r) => <span className="tabular text-muted">{formatBps(r.rate_bps)} × {formatDecimalBRL(r.base_amount)}</span> },
        { key: "v", header: "Comissão", cell: (r) => <span className="tabular font-medium">{formatDecimalBRL(r.commission_amount)}</span> },
        { key: "p", header: "Pago", cell: (r) => <span className="tabular text-muted">{formatBRL(paidBy.get(r.id) ?? 0)}</span> },
        { key: "st", header: "Status", cell: (r) => <span className="flex flex-col items-end gap-1 md:items-start"><Badge tone={label(COMMISSION_STATUS, r.status)[1]}>{label(COMMISSION_STATUS, r.status)[0]}</Badge>
          {isAdmin && ["earned", "awaiting_approval", "approved", "pending_receipt", "estimated"].includes(r.status) && <details><summary className="cursor-pointer text-xs text-muted">Cancelar</summary><div className="mt-2 w-64"><CancelCommissionForm id={r.id} /></div></details>}</span> },
      ]} />
      <Card className="mt-6"><CardTitle className="mb-3">Pagamentos de comissão</CardTitle>
        {(payouts.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum pagamento.</p> : (
          <ul className="divide-y divide-border text-sm">{payouts.data!.map((p) => {
            const row = p as unknown as { id: string; paid_amount: string; paid_at: string; profiles: { full_name: string } | null };
            return <li key={row.id} className="flex justify-between gap-2 py-2"><span>{row.profiles?.full_name} · {formatDateTime(row.paid_at)}</span><span className="tabular">{formatDecimalBRL(row.paid_amount)}</span></li>;
          })}</ul>
        )}
      </Card>
    </>
  );
}
