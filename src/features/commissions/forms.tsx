"use client";

import { MoneyField, SelectField, ServerForm, TextField } from "@/components/ui/server-form";
import { todayISO } from "@/lib/dates";
import { approveCommissionsAction, cancelCommissionAction, payCommissionAction } from "./actions";
import { Badge } from "@/components/ui";
import { formatDecimalBRL } from "@/lib/money";

export function ApproveCommissionsForm({ items }: { items: { id: string; label: string; amount: string }[] }) {
  return (
    <ServerForm action={approveCommissionsAction} submitLabel="Aprovar selecionadas" variant="success">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Comissões aguardando aprovação</legend>
        {items.map((i) => (
          <label key={i.id} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm">
            <span className="flex items-center gap-2"><input type="checkbox" name="ids[]" value={i.id} className="size-4 accent-[var(--one-action)]" />{i.label}</span>
            <span className="tabular font-medium">{formatDecimalBRL(i.amount)}</span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted">Ninguém aprova a própria comissão. <Badge>auditado</Badge></p>
    </ServerForm>
  );
}

export function PayCommissionForm({ entitlementId, sellerId, balance, accounts }: { entitlementId: string; sellerId: string; balance: string; accounts: { id: string; name: string }[] }) {
  return (
    <ServerForm action={payCommissionAction.bind(null, entitlementId, sellerId)} submitLabel="Registrar pagamento" variant="success" idempotencyPrefix="payout" className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <SelectField name="cash_account_id" label="Conta" options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
      <MoneyField name="amount" label="Valor" defaultValue={balance.replace(".", ",")} hint="Parcial permitido" />
      <TextField name="paid_at" label="Data" type="date" defaultValue={todayISO()} />
    </ServerForm>
  );
}

export function CancelCommissionForm({ id }: { id: string }) {
  return (
    <ServerForm action={cancelCommissionAction.bind(null, id)} submitLabel="Cancelar comissão" variant="danger" className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <TextField name="reason" label="Motivo" required className="flex-1" />
    </ServerForm>
  );
}
