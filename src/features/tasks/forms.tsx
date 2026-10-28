"use client";

import { SelectField, ServerForm, TextAreaField, TextField } from "@/components/ui/server-form";
import { useFormErrors } from "@/components/ui/server-form";
import { Field, Select } from "@/components/ui";
import { blockTaskAction, commentTaskAction, createTaskAction, saveTaskGroupAction, updateTaskAction } from "./actions";
import { todayISO } from "@/lib/dates";

type Person = { id: string; full_name: string; role: "admin" | "seller" };
type Group = { id: string; name: string; sellers_can_assign: boolean; active?: boolean; description?: string | null };
type TaskValues = { title?: string; description?: string | null; group_id?: string; assigned_to?: string; priority?: string; due_date?: string | null };

const PRIORITIES = [{ value: "low", label: "Baixa" }, { value: "medium", label: "Média" }, { value: "high", label: "Alta" }, { value: "urgent", label: "Urgente" }];

/** Responsável agrupado por papel: vendedores designam para administradores e entre si. */
function AssigneeField({ people, defaultValue, meId }: { people: Person[]; defaultValue?: string; meId: string }) {
  const { errors } = useFormErrors();
  const admins = people.filter((p) => p.role === "admin");
  const sellers = people.filter((p) => p.role === "seller");
  const name = (p: Person) => (p.id === meId ? `${p.full_name} (eu)` : p.full_name);
  return (
    <Field id="f-assigned_to" label="Responsável" error={errors?.assigned_to} hint="A pessoa recebe uma notificação personalizada ao ser designada.">
      <Select name="assigned_to" defaultValue={defaultValue ?? ""} required>
        <option value="">Selecione</option>
        {admins.length > 0 && <optgroup label="Administradores">{admins.map((p) => <option key={p.id} value={p.id}>{name(p)}</option>)}</optgroup>}
        {sellers.length > 0 && <optgroup label="Vendedores">{sellers.map((p) => <option key={p.id} value={p.id}>{name(p)}</option>)}</optgroup>}
      </Select>
    </Field>
  );
}

function TaskFields({ groups, people, meId, values = {}, isAdmin }: { groups: Group[]; people: Person[]; meId: string; values?: TaskValues; isAdmin: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField name="title" label="Tarefa" required defaultValue={values.title ?? ""} placeholder="Ex.: Editar vídeo institucional" className="sm:col-span-2" />
      <SelectField name="group_id" label="Grupo" placeholder="Selecione" defaultValue={values.group_id ?? ""}
        options={groups.map((g) => ({ value: g.id, label: g.name }))}
        hint={isAdmin ? undefined : "Aparecem apenas os grupos liberados para vendedores."} />
      <AssigneeField people={people} defaultValue={values.assigned_to} meId={meId} />
      <SelectField name="priority" label="Prioridade" defaultValue={values.priority ?? "medium"} options={PRIORITIES} />
      <TextField name="due_date" label="Prazo" type="date" min={todayISO()} defaultValue={values.due_date ?? ""} />
      <TextAreaField name="description" label="Detalhes" defaultValue={values.description ?? ""} className="sm:col-span-2"
        hint="Contexto, links e o que precisa ser entregue." />
    </div>
  );
}

export function NewTaskForm(props: { groups: Group[]; people: Person[]; meId: string; isAdmin: boolean; defaults?: TaskValues }) {
  return (
    <ServerForm action={createTaskAction} submitLabel="Criar e notificar responsável" successRedirect={(id) => `/tarefas/${id}`}>
      <TaskFields {...props} values={props.defaults} />
    </ServerForm>
  );
}

export function EditTaskForm({ taskId, ...props }: { taskId: string; groups: Group[]; people: Person[]; meId: string; isAdmin: boolean; values: TaskValues }) {
  return (
    <ServerForm action={updateTaskAction.bind(null, taskId)} submitLabel="Salvar alterações" variant="secondary">
      <TaskFields {...props} />
      <p className="text-sm text-muted">Ao trocar o responsável, a nova pessoa é notificada e a anterior é avisada.</p>
    </ServerForm>
  );
}

export function BlockTaskForm({ taskId }: { taskId: string }) {
  return (
    <ServerForm action={blockTaskAction.bind(null, taskId)} submitLabel="Marcar como bloqueada" variant="danger" className="flex flex-col gap-3">
      <TextField name="reason" label="O que está impedindo?" required placeholder="Ex.: aguardando aprovação do roteiro" />
    </ServerForm>
  );
}

export function CommentForm({ taskId }: { taskId: string }) {
  return (
    <ServerForm action={commentTaskAction.bind(null, taskId)} submitLabel="Comentar" variant="secondary" resetOnSuccess>
      <TextAreaField name="comment" label="Comentário" hint="Quem participa da tarefa é notificado." />
    </ServerForm>
  );
}

export function TaskGroupForm({ group }: { group?: Group }) {
  return (
    <ServerForm action={saveTaskGroupAction.bind(null, group?.id ?? null)} submitLabel={group ? "Salvar grupo" : "Criar grupo"} variant={group ? "secondary" : "primary"} resetOnSuccess={!group}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Nome do grupo" required defaultValue={group?.name ?? ""} placeholder="Ex.: AUDIOVISUAL" />
        <TextField name="description" label="Descrição" defaultValue={group?.description ?? ""} />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <input type="checkbox" name="sellers_can_assign" defaultChecked={group?.sellers_can_assign ?? true} className="size-5 accent-[var(--one-action)]" />
        Vendedores podem criar e designar tarefas neste grupo
      </label>
      {group && (
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" name="active" defaultChecked={group.active ?? true} className="size-5 accent-[var(--one-action)]" />
          Grupo ativo
        </label>
      )}
    </ServerForm>
  );
}
