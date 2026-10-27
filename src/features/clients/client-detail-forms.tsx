"use client";

import { ServerForm, SelectField, TextField } from "@/components/ui/server-form";
import { setClientStatusAction, transferClientAction, updateClientAction, updateInterestsAction } from "./actions";
import { ClientFields, type ClientValues } from "./client-fields";
import { CLIENT_STATUS } from "@/lib/labels";

type ClientRow = ClientValues & { id: string };

export function EditClientForm({ client }: { client: ClientRow }) {
  return (
    <ServerForm action={updateClientAction.bind(null, client.id)} submitLabel="Salvar alterações">
      <ClientFields values={client} />
    </ServerForm>
  );
}

export function ClientStatusForm({ clientId, status, isAdmin }: { clientId: string; status: string; isAdmin: boolean }) {
  const options = Object.entries(CLIENT_STATUS).filter(([k]) => isAdmin || k !== "archived").map(([value, [label]]) => ({ value, label }));
  return (
    <ServerForm action={setClientStatusAction.bind(null, clientId)} submitLabel="Atualizar status" variant="secondary">
      <SelectField name="status" label="Status do cliente" options={options} defaultValue={status} />
    </ServerForm>
  );
}

export function InterestsForm({ clientId, services, selected }: { clientId: string; services: { id: string; name: string }[]; selected: string[] }) {
  return (
    <ServerForm action={updateInterestsAction.bind(null, clientId)} submitLabel="Salvar serviços" variant="secondary">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Serviços de interesse</legend>
        {services.map((s) => (
          <label key={s.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
            <input type="checkbox" name="service_ids[]" value={s.id} defaultChecked={selected.includes(s.id)} className="size-4 accent-[var(--one-action)]" />{s.name}
          </label>
        ))}
      </fieldset>
    </ServerForm>
  );
}

export function TransferForm({ clientId, sellers }: { clientId: string; sellers: { id: string; full_name: string }[] }) {
  return (
    <ServerForm action={transferClientAction.bind(null, clientId)} submitLabel="Transferir carteira" variant="secondary"
      confirm="Confirmar transferência? A operação é auditada e as comissões históricas permanecem com o vendedor original.">
      <SelectField name="new_seller_id" label="Novo responsável" options={sellers.map((s) => ({ value: s.id, label: s.full_name }))} placeholder="Selecione" />
      <TextField name="reason" label="Motivo" required />
    </ServerForm>
  );
}
