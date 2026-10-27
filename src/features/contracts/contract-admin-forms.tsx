"use client";

import { ServerForm, TextField, MoneyField } from "@/components/ui/server-form";
import { amendContractAction, approveContractAction, cancelContractAction, rejectContractAction } from "./actions";

export function ApproveForm({ id, startDate }: { id: string; startDate: string }) {
  return (
    <ServerForm action={approveContractAction.bind(null, id)} submitLabel="Aprovar contrato" variant="success" confirm="Aprovar? A taxa de comissão será congelada e as cobranças serão geradas.">
      <TextField name="implementation_due_date" label="Vencimento da implementação" type="date" defaultValue={startDate} />
    </ServerForm>
  );
}

export function RejectForm({ id }: { id: string }) {
  return (
    <ServerForm action={rejectContractAction.bind(null, id)} submitLabel="Devolver para ajustes" variant="secondary">
      <TextField name="reason" label="Motivo da devolução" required />
    </ServerForm>
  );
}

export function AmendForm({ id }: { id: string }) {
  return (
    <ServerForm action={amendContractAction.bind(null, id)} submitLabel="Registrar aditivo" variant="secondary">
      <p className="text-xs text-muted">Gera nova versão. Afeta apenas cobranças ainda não geradas; histórico e comissões são preservados.</p>
      <MoneyField name="monthly_amount" label="Nova mensalidade (opcional)" />
      <TextField name="billing_day" label="Novo dia de cobrança (opcional)" type="number" min={1} max={31} />
      <TextField name="delivery_due_date" label="Nova data de entrega (opcional)" type="date" />
      <TextField name="recurring_end_date" label="Encerrar mensalidades em (opcional)" type="date" />
      <TextField name="change_reason" label="Motivo do aditivo" required />
    </ServerForm>
  );
}

export function CancelForm({ id }: { id: string }) {
  return (
    <ServerForm action={cancelContractAction.bind(null, id)} submitLabel="Cancelar contrato" variant="danger" confirm="Cancelar o contrato? Cobranças futuras sem pagamento serão canceladas; o histórico é preservado.">
      <TextField name="reason" label="Motivo do cancelamento" required />
    </ServerForm>
  );
}
