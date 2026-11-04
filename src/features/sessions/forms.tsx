"use client";

import { SelectField, ServerForm, TextAreaField, TextField } from "@/components/ui/server-form";
import { SESSION_KIND } from "@/lib/labels";
import { cancelSessionAction, saveSessionAction } from "./actions";

type Person = { id: string; full_name: string; active: boolean };
export type SessionFormValues = {
  kind?: string; title?: string; client_id?: string | null; date?: string; start_time?: string; end_time?: string;
  location?: string | null; address?: string | null; meeting_point?: string | null; contacts?: string | null;
  checklist?: string | null; notes?: string | null; participants?: string[]; works?: string[];
};

export function SessionForm({ sessionId, values = {}, people, clients, works }: {
  sessionId?: string; values?: SessionFormValues; people: Person[]; clients: { id: string; name: string }[];
  works: { id: string; title: string; client?: string }[];
}) {
  return (
    <ServerForm action={saveSessionAction.bind(null, sessionId ?? null)} submitLabel={sessionId ? "Salvar sessão" : "Agendar sessão"}
      successRedirect={(id) => `/calendario/${id as string}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="kind" label="Tipo" placeholder="Selecione" defaultValue={values.kind ?? ""} options={Object.entries(SESSION_KIND).map(([value, label]) => ({ value, label }))} />
        <TextField name="title" label="Título" required defaultValue={values.title ?? ""} placeholder="Ex.: Captação no restaurante" />
        <SelectField name="client_id" label="Cliente" placeholder="Sem cliente (interno)" defaultValue={values.client_id ?? ""} options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        <TextField name="date" label="Data" type="date" required defaultValue={values.date ?? ""} />
        <TextField name="start_time" label="Início" type="time" required defaultValue={values.start_time ?? "09:00"} />
        <TextField name="end_time" label="Fim" type="time" required defaultValue={values.end_time ?? "12:00"} />
        <TextField name="location" label="Local" defaultValue={values.location ?? ""} />
        <TextField name="address" label="Endereço" defaultValue={values.address ?? ""} hint="Vira um link de mapa na tela da sessão." />
        <TextField name="meeting_point" label="Ponto de encontro" defaultValue={values.meeting_point ?? ""} />
        <TextField name="contacts" label="Contato no local" defaultValue={values.contacts ?? ""} placeholder="Ex.: Gerente Ana — (71) 9…" />
        <TextAreaField name="checklist" label="Checklist" rows={3} defaultValue={values.checklist ?? ""} placeholder="Um item por linha" className="sm:col-span-2" />
        <TextAreaField name="notes" label="Observações" rows={2} defaultValue={values.notes ?? ""} className="sm:col-span-2" />
      </div>
      <fieldset>
        <legend className="mb-1 text-[15px] font-semibold">Participantes</legend>
        <p className="mb-2 text-sm text-muted">Uma sessão para todos (ex.: filmagem e fotografia juntas). Conflitos de agenda aparecem como aviso.</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {people.filter((p) => p.active).map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="checkbox" name="participants[]" value={p.id} defaultChecked={values.participants?.includes(p.id)} className="size-5 accent-[var(--one-action)]" />{p.full_name}
            </label>
          ))}
        </div>
      </fieldset>
      {works.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-[15px] font-semibold">Trabalhos ligados (opcional)</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {works.map((w) => (
              <label key={w.id} className="flex min-h-11 items-center gap-3 text-[15px]">
                <input type="checkbox" name="works[]" value={w.id} defaultChecked={values.works?.includes(w.id)} className="size-5 accent-[var(--one-action)]" />
                <span>{w.title}{w.client && <span className="text-xs text-muted"> · {w.client}</span>}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </ServerForm>
  );
}

export function CancelSessionForm({ sessionId }: { sessionId: string }) {
  return (
    <ServerForm action={cancelSessionAction.bind(null, sessionId)} submitLabel="Cancelar sessão" variant="danger" confirm="Cancelar a sessão e avisar os participantes?">
      <TextField name="reason" label="Motivo" required placeholder="Ex.: cliente remarcou" />
    </ServerForm>
  );
}
