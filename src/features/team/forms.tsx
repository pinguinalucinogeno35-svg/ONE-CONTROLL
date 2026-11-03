"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { SelectField, ServerForm, TextAreaField, TextField, useFormErrors } from "@/components/ui/server-form";
import { availabilityMinutes, formatWeeklyHours, type AvailabilityBlock, type WorkMode } from "@/lib/availability";
import { WEEKDAYS, WORK_FUNCTION, WORK_MODE } from "@/lib/labels";
import { addAbsenceAction, saveTeamProfileAction } from "./actions";

export type TeamProfileValues = {
  primary_function?: string; secondary_function?: string | null;
  works_onsite?: boolean; works_remote?: boolean; works_external?: boolean;
  availability?: AvailabilityBlock[]; weekly_hours_declared?: number | null;
  phone?: string | null; tools?: string | null; equipment?: string | null; travel_notes?: string | null; notes?: string | null;
};

const FUNCTIONS = Object.entries(WORK_FUNCTION).map(([value, label]) => ({ value, label }));
const checkboxClass = "size-5 accent-[var(--one-action)]";

/** Editor de blocos semanais; o total mostrado segue a mesma regra do banco (sem dupla contagem). */
function AvailabilityEditor({ initial }: { initial: AvailabilityBlock[] }) {
  const { errors } = useFormErrors();
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>(initial);
  const update = (i: number, patch: Partial<AvailabilityBlock>) => setBlocks((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = availabilityMinutes(blocks);
  const byMode = (["onsite", "remote", "external"] as WorkMode[])
    .map((m) => [m, availabilityMinutes(blocks, m)] as const).filter(([, v]) => v > 0);
  const error = Object.entries(errors ?? {}).find(([k]) => k.startsWith("availability"))?.[1];
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[15px] font-semibold">Horários disponíveis na semana</legend>
      <p className="text-sm text-muted">Adicione um bloco por período. Horários sobrepostos contam uma vez só.</p>
      <input type="hidden" name="availability" value={JSON.stringify(blocks)} />
      {blocks.map((b, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-[var(--radius-control)] border border-border p-3 sm:grid-cols-[1.2fr_1fr_1fr_1.2fr_auto] sm:items-end">
          <Field id={`av-day-${i}`} label="Dia"><Select value={b.day} onChange={(e) => update(i, { day: Number(e.target.value) })}>
            {Object.entries(WEEKDAYS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select></Field>
          <Field id={`av-start-${i}`} label="Início"><Input type="time" value={b.start} onChange={(e) => update(i, { start: e.target.value })} /></Field>
          <Field id={`av-end-${i}`} label="Fim"><Input type="time" value={b.end} onChange={(e) => update(i, { end: e.target.value })} /></Field>
          <Field id={`av-mode-${i}`} label="Formato"><Select value={b.mode} onChange={(e) => update(i, { mode: e.target.value as WorkMode })}>
            {Object.entries(WORK_MODE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select></Field>
          <Button type="button" variant="ghost" size="sm" onClick={() => setBlocks((x) => x.filter((_, j) => j !== i))} aria-label={`Remover bloco ${i + 1}`}>
            <Trash2 aria-hidden className="size-4" />Remover
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" disabled={blocks.length >= 28}
          onClick={() => setBlocks((x) => [...x, { day: 1, start: "09:00", end: "18:00", mode: "onsite" }])}>
          <Plus aria-hidden className="size-4" />Adicionar horário
        </Button>
        <p className="text-sm text-muted" aria-live="polite">
          Total semanal: <strong className="text-fg">{blocks.length ? formatWeeklyHours(total) : "Não informado"}</strong>
          {byMode.length > 0 && ` (${byMode.map(([m, v]) => `${WORK_MODE[m]?.toLowerCase()} ${formatWeeklyHours(v)}`).join(" · ")})`}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error[0]}</p>}
    </fieldset>
  );
}

/** Perfil de trabalho. `onboarding` = primeiro acesso (curto, com confirmação das regras). */
export function TeamProfileForm({ values = {}, onboarding = false }: { values?: TeamProfileValues; onboarding?: boolean }) {
  return (
    <ServerForm action={saveTeamProfileAction} submitLabel={onboarding ? "Concluir e começar" : "Salvar perfil"}
      successRedirect={onboarding ? "/dashboard" : undefined}>
      {onboarding && <input type="hidden" name="complete" value="1" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="primary_function" label="Função principal" placeholder="Selecione" defaultValue={values.primary_function ?? ""} options={FUNCTIONS}
          hint="Só personaliza seus atalhos. Você pode receber qualquer tipo de trabalho." />
        <SelectField name="secondary_function" label="Função secundária (opcional)" placeholder="Nenhuma" defaultValue={values.secondary_function ?? ""} options={FUNCTIONS} />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[15px] font-semibold">Formato de trabalho</legend>
        {(["onsite", "remote", "external"] as const).map((m) => (
          <label key={m} className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" name={`works_${m}`} defaultChecked={!!values[`works_${m}`]} className={checkboxClass} />
            {WORK_MODE[m]}{m === "external" ? " (captações e visitas)" : ""}
          </label>
        ))}
      </fieldset>
      <AvailabilityEditor initial={values.availability ?? []} />
      <TextField name="weekly_hours_declared" label="Ou total aproximado de horas por semana" inputMode="decimal" className="sm:max-w-xs"
        defaultValue={values.weekly_hours_declared ?? ""} hint="Use se ainda não tem horários fixos." />
      <details className="rounded-[var(--radius-control)] border border-border p-3" open={!onboarding}>
        <summary className="cursor-pointer text-[15px] font-semibold">Informações opcionais</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField name="phone" label="Celular profissional" inputMode="tel" defaultValue={values.phone ?? ""} />
          <TextField name="tools" label="Ferramentas que usa" defaultValue={values.tools ?? ""} placeholder="Ex.: Figma, Premiere, Lightroom" />
          <TextField name="equipment" label="Equipamento próprio" defaultValue={values.equipment ?? ""} />
          <TextField name="travel_notes" label="Deslocamento" defaultValue={values.travel_notes ?? ""} placeholder="Ex.: tem carro, atende região X" />
          <TextAreaField name="notes" label="Observações práticas" rows={3} defaultValue={values.notes ?? ""} className="sm:col-span-2" />
        </div>
      </details>
      {onboarding && (
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" name="accept_rules" className={`${checkboxClass} mt-0.5`} required />
          <span>Li e concordo com as regras internas da ONE: prazos combinados, sigilo dos materiais de clientes e uso dos arquivos apenas para o trabalho atribuído.</span>
        </label>
      )}
    </ServerForm>
  );
}

export function AbsenceForm({ people }: { people?: { id: string; full_name: string }[] }) {
  return (
    <ServerForm action={addAbsenceAction} submitLabel="Registrar ausência" variant="secondary" resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-3">
        {people && <SelectField name="user_id" label="Colaborador" placeholder="Selecione" options={people.map((p) => ({ value: p.id, label: p.full_name }))} />}
        <TextField name="starts_on" label="De" type="date" required />
        <TextField name="ends_on" label="Até" type="date" required />
        <TextField name="reason" label="Motivo (opcional)" placeholder="Ex.: férias" className={people ? "sm:col-span-3" : "sm:col-span-3"} />
      </div>
    </ServerForm>
  );
}
