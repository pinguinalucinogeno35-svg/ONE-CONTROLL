import { requireActiveUser } from "@/server/auth/session";
import { PageHeader } from "@/components/ui";
import { ContractForm } from "@/features/contracts/contract-form";
import { getContractFormData } from "@/server/services/commercial";
import { todayISO } from "@/lib/dates";

export const metadata = { title: "Novo contrato" };

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const ctx = await requireActiveUser();
  const { cliente } = await searchParams;
  const data = await getContractFormData(ctx);
  const preselected = data.clients.some((c) => c.id === cliente) ? cliente : undefined;
  return (
    <>
      <PageHeader eyebrow="Comercial / Novo contrato" title="Novo contrato" description="Cadastro comercial: valores, datas, origem da venda e simulação de comissão." />
      <ContractForm {...data} defaults={{ client_id: preselected ?? "", start_date: todayISO() }} />
    </>
  );
}
