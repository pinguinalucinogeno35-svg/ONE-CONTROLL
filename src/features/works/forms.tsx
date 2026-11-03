"use client";

import { Field, Select } from "@/components/ui";
import { ActionButton, SelectField, ServerForm, TextAreaField, TextField, useFormErrors } from "@/components/ui/server-form";
import { WORK_CATEGORY, WORK_LINK_KIND } from "@/lib/labels";
import type { ItemKind } from "@/lib/works";
import {
  addWorkLinkAction, commentWorkAction, createWorkAction, saveWorkItemAction, setWorkBlockedAction, setWorkStatusAction, updateWorkAction,
} from "./actions";

type Person = { id: string; full_name: string; role: string; active: boolean };
export type WorkFormValues = {
  title?: string; category?: string; client_id?: string | null; objective?: string | null; instructions?: string | null;
  deliverable_format?: string | null; due_current?: string | null; due_original?: string | null; estimated_hours?: number | null;
  reviewer_id?: string | null; assignees?: string[];
};

const CATEGORIES = Object.entries(WORK_CATEGORY).map(([value, label]) => ({ value, label }));
const ROLE_GROUP: Record<string, string> = { admin: "Administração", seller: "Comercial", production: "Produção" };

/** Qualquer colaborador ativo pode ser responsável por qualquer tipo de trabalho. */
function PeoplePicker({ people, selected }: { people: Person[]; selected: string[] }) {
  const { errors } = useFormErrors();
  const active = people.filter((p) => p.active);
  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1 text-[15px] font-semibold">Responsáveis</legend>
      <p className="mb-2 text-sm text-muted">Qualquer pessoa da equipe, de qualquer função. Cada uma recebe um aviso.</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {active.map((p) => (
          <label key={p.id} className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" name="assignees[]" value={p.id} defaultChecked={selected.includes(p.id)} className="size-5 accent-[var(--one-action)]" />
            <span>{p.full_name} <span className="text-xs text-muted">· {ROLE_GROUP[p.role] ?? p.role}</span></span>
          </label>
        ))}
      </div>
      {errors?.assignees && <p role="alert" className="mt-1 text-sm text-danger">{errors.assignees[0]}</p>}
    </fieldset>
  );
}

export function WorkForm({ workId, values = {}, people, clients }: {
  workId?: string; values?: WorkFormValues; people: Person[]; clients: { id: string; name: string }[];
}) {
  const action = workId ? updateWorkAction.bind(null, workId) : createWorkAction;
  return (
    <ServerForm action={action} submitLabel={workId ? "Salvar ficha" : "Criar trabalho"}
      successRedirect={workId ? undefined : (id) => `/trabalhos/${id as string}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="title" label="Título" required defaultValue={values.title ?? ""} placeholder="Ex.: Carrossel de lançamento" className="sm:col-span-2" />
        <SelectField name="category" label="Tipo de trabalho" placeholder="Selecione" defaultValue={values.category ?? ""} options={CATEGORIES}
          hint="Define as seções da ficha (copy por página, roteiro, lista de fotos…)." />
        <SelectField name="client_id" label="Cliente" placeholder="Sem cliente (interno)" defaultValue={values.client_id ?? ""} options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        <TextAreaField name="objective" label="Objetivo" rows={2} defaultValue={values.objective ?? ""} className="sm:col-span-2" />
        <TextAreaField name="instructions" label="Instruções" rows={4} defaultValue={values.instructions ?? ""} className="sm:col-span-2"
          hint="O que a pessoa precisa saber para produzir sem procurar em outro lugar." />
        <TextField name="deliverable_format" label="Formato da entrega" defaultValue={values.deliverable_format ?? ""} placeholder="Ex.: 5 páginas 1080×1350 + editável" />
        <TextField name="due_date" label="Prazo" type="date" defaultValue={values.due_current ?? ""}
          hint={values.due_original && values.due_original !== values.due_current ? `Prazo original: ${values.due_original.split("-").reverse().join("/")}` : undefined} />
        {workId && values.due_original && <TextField name="due_change_reason" label="Motivo da mudança de prazo" hint="Obrigatório se o prazo mudar." />}
        <TextField name="estimated_hours" label="Horas estimadas (opcional)" inputMode="decimal" defaultValue={values.estimated_hours ?? ""} />
        <SelectField name="reviewer_id" label="Quem revisa e aprova" placeholder="Quem criou o trabalho" defaultValue={values.reviewer_id ?? ""}
          options={people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.full_name }))} hint="Não pode ser um dos responsáveis." />
        <PeoplePicker people={people} selected={values.assignees ?? []} />
        {!workId && (
          <label className="flex min-h-11 items-center gap-3 text-[15px] sm:col-span-2">
            <input type="checkbox" name="use_template" defaultChecked className="size-5 accent-[var(--one-action)]" />
            Incluir itens sugeridos para o tipo (páginas, checklist de preparação…), editáveis depois
          </label>
        )}
      </div>
    </ServerForm>
  );
}

export function ItemForm({ workId, kind, itemId, values, itemLabel, bodyLabel, allowRequired }: {
  workId: string; kind: ItemKind; itemId?: string; values?: { title: string; body: string | null; required: boolean };
  itemLabel: string; bodyLabel: string; allowRequired?: boolean;
}) {
  return (
    <ServerForm action={saveWorkItemAction.bind(null, workId, itemId ?? null)} submitLabel={itemId ? "Salvar" : `Adicionar ${itemLabel.toLowerCase()}`}
      variant="secondary" resetOnSuccess={!itemId}>
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <TextField name="title" label={itemLabel} required defaultValue={values?.title ?? ""} />
        <TextAreaField name="body" label={bodyLabel} rows={2} defaultValue={values?.body ?? ""} />
      </div>
      {allowRequired && (
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" name="required" defaultChecked={values?.required ?? false} className="size-5 accent-[var(--one-action)]" />
          Obrigatório para começar (enquanto faltar: “Aguardando material”)
        </label>
      )}
    </ServerForm>
  );
}

export function LinkForm({ workId, kinds }: { workId: string; kinds: string[] }) {
  return (
    <ServerForm action={addWorkLinkAction.bind(null, workId)} submitLabel="Adicionar link" variant="secondary" resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        <SelectField name="kind" label="Tipo" defaultValue={kinds[0]} options={kinds.map((k) => ({ value: k, label: WORK_LINK_KIND[k] ?? k }))} />
        <TextField name="label" label="Nome" required placeholder="Ex.: Prévia v1" />
        <TextField name="url" label="Link (https://)" required inputMode="url" placeholder="https://drive.google.com/…" />
      </div>
      <TextField name="note" label="Observação (opcional)" />
    </ServerForm>
  );
}

/** Ação principal de estado (sem texto) ou com nota obrigatória (ajustes, cancelamento, reabertura). */
export function StatusButton({ workId, status, label, variant = "primary", confirm }: {
  workId: string; status: string; label: string; variant?: "primary" | "secondary" | "success" | "danger"; confirm?: string;
}) {
  return <ActionButton action={setWorkStatusAction.bind(null, workId)} label={label} variant={variant} confirm={confirm} hidden={{ status }} />;
}

export function StatusNoteForm({ workId, status, label, noteLabel, variant = "secondary", placeholder }: {
  workId: string; status: string; label: string; noteLabel: string; variant?: "primary" | "secondary" | "danger"; placeholder?: string;
}) {
  return (
    <ServerForm action={setWorkStatusAction.bind(null, workId)} submitLabel={label} variant={variant}>
      <input type="hidden" name="status" value={status} />
      <TextAreaField name="note" label={noteLabel} rows={2} required placeholder={placeholder} />
    </ServerForm>
  );
}

export function BlockForm({ workId, blocked }: { workId: string; blocked: boolean }) {
  if (blocked) return <ActionButton action={setWorkBlockedAction.bind(null, workId)} label="Marcar bloqueio como resolvido" hidden={{ reason: "" }} />;
  return (
    <ServerForm action={setWorkBlockedAction.bind(null, workId)} submitLabel="Informar bloqueio" variant="secondary" resetOnSuccess>
      <TextField name="reason" label="O que está impedindo o trabalho?" required placeholder="Ex.: aguardando fotos do cliente" />
    </ServerForm>
  );
}

export function CommentForm({ workId }: { workId: string }) {
  return (
    <ServerForm action={commentWorkAction.bind(null, workId)} submitLabel="Comentar" variant="secondary" resetOnSuccess>
      <TextAreaField name="text" label="Comentário" rows={2} required />
    </ServerForm>
  );
}

/** Filtro simples por pessoa (lista). */
export function PersonFilter({ people, value }: { people: Person[]; value?: string }) {
  return (
    <Field id="f-person" label="Pessoa"><Select name="pessoa" defaultValue={value ?? ""}>
      <option value="">Todas</option>
      {people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
    </Select></Field>
  );
}
