import { notFound, redirect } from "next/navigation";
import { requireActiveUser } from "@/server/auth/session";
import { PageHeader } from "@/components/ui";
import { ContractForm } from "@/features/contracts/contract-form";
import { getContractFormData } from "@/server/services/commercial";

export const metadata = { title: "Editar contrato" };

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireActiveUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: k } = await ctx.supabase.from("contracts").select("*").eq("id", id).maybeSingle();
  if (!k) notFound();
  if (!["draft", "pending_approval"].includes(k.status)) redirect(`/contratos/${id}`);
  const [form, services, referral] = await Promise.all([
    getContractFormData(ctx),
    ctx.supabase.from("contract_services").select("service_id, quantity, unit_amount, description").eq("contract_id", id),
    ctx.supabase.from("contract_referrals").select("*").eq("contract_id", id).maybeSingle(),
  ]);
  return (
    <>
      <PageHeader title={`Editar ${k.contract_number}`} description="Alterações geram nova versão do contrato." />
      <ContractForm {...form} contractId={id} defaults={{
        client_id: k.client_id, project_id: k.project_id ?? "", seller_id: k.seller_id,
        implementation_amount: String(k.implementation_amount), monthly_amount: String(k.monthly_amount),
        start_date: k.start_date, delivery_due_date: k.delivery_due_date ?? "", delivery_date_justification: k.delivery_date_justification ?? "",
        recurring_start_date: k.recurring_start_date ?? "", billing_day: k.billing_day ?? "", billing_frequency: k.billing_frequency ?? "monthly",
        sale_origin: k.sale_origin, notes: k.notes ?? "",
        referral: { first_referrer_client_id: referral.data?.first_referrer_client_id ?? "", second_referrer_client_id: referral.data?.second_referrer_client_id ?? "", external_referrer_name: referral.data?.external_referrer_name ?? "" },
        services: (services.data ?? []).map((s) => ({ service_id: s.service_id, quantity: Number(s.quantity), unit_amount: s.unit_amount != null ? String(s.unit_amount) : "", description: s.description ?? "" })),
      }} />
    </>
  );
}
