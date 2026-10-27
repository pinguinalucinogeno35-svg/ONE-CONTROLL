"use client";

import { ServerForm, SelectField } from "@/components/ui/server-form";
import { createClientAction } from "./actions";
import { ClientFields } from "./client-fields";

export function NewClientForm({ services, sellers }: { services: { id: string; name: string }[]; sellers?: { id: string; full_name: string }[] }) {
  return (
    <ServerForm action={createClientAction} submitLabel="Cadastrar cliente" successRedirect={(id) => `/clientes/${id}`}>
      <ClientFields />
      {sellers && <SelectField name="seller_id" label="Vendedor responsável" options={sellers.map((s) => ({ value: s.id, label: s.full_name }))} placeholder="Eu mesmo" />}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Serviços de interesse</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {services.map((s) => (
            <label key={s.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
              <input type="checkbox" name="service_ids[]" value={s.id} className="size-4 accent-[#2563eb]" />{s.name}
            </label>
          ))}
        </div>
      </fieldset>
    </ServerForm>
  );
}
