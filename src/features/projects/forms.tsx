"use client";

import { ServerForm, SelectField, TextAreaField, TextField, ActionButton } from "@/components/ui/server-form";
import { createProjectAction, createTaskAction, setTaskStatusAction, updateProjectAction } from "./actions";
import { PROJECT_STATUS } from "@/lib/labels";

type Opt = { id: string; name: string };

export function NewProjectForm({ clients, members, defaultClient }: { clients: Opt[]; members: Opt[]; defaultClient?: string }) {
  return (
    <ServerForm action={createProjectAction} submitLabel="Criar projeto" successRedirect={(id) => `/projetos/${id}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="client_id" label="Cliente" options={clients.map((c) => ({ value: c.id, label: c.name }))} placeholder="Selecione" defaultValue={defaultClient} />
        <TextField name="name" label="Nome do projeto" required />
        <TextField name="start_date" label="Início" type="date" />
        <TextField name="due_date" label="Entrega prevista" type="date" />
        <SelectField name="manager_id" label="Responsável" options={members.map((m) => ({ value: m.id, label: m.name }))} placeholder="Sem responsável" />
        <TextAreaField name="description" label="Descrição" className="sm:col-span-2" />
      </div>
    </ServerForm>
  );
}

export function EditProjectForm({ project, members }: { project: { id: string; name: string; status: string; description: string | null; start_date: string | null; due_date: string | null; manager_id: string | null }; members: Opt[] }) {
  return (
    <ServerForm action={updateProjectAction.bind(null, project.id)} submitLabel="Salvar projeto">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Nome" defaultValue={project.name} required />
        <SelectField name="status" label="Status" defaultValue={project.status} options={Object.entries(PROJECT_STATUS).map(([value, [label]]) => ({ value, label }))} />
        <TextField name="start_date" label="Início" type="date" defaultValue={project.start_date ?? ""} />
        <TextField name="due_date" label="Entrega prevista" type="date" defaultValue={project.due_date ?? ""} />
        <SelectField name="manager_id" label="Responsável" defaultValue={project.manager_id ?? ""} options={members.map((m) => ({ value: m.id, label: m.name }))} placeholder="Sem responsável" />
        <TextAreaField name="description" label="Descrição" className="sm:col-span-2" defaultValue={project.description ?? ""} />
      </div>
    </ServerForm>
  );
}

export function NewTaskForm({ projectId, members }: { projectId: string; members: Opt[] }) {
  return (
    <ServerForm action={createTaskAction.bind(null, projectId)} submitLabel="Adicionar tarefa" variant="secondary" resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-4">
        <TextField name="title" label="Tarefa" required className="sm:col-span-2" />
        <SelectField name="assigned_to" label="Responsável" options={members.map((m) => ({ value: m.id, label: m.name }))} placeholder="—" />
        <TextField name="due_date" label="Prazo" type="date" />
        <SelectField name="priority" label="Prioridade" defaultValue="medium" options={[{ value: "low", label: "Baixa" }, { value: "medium", label: "Média" }, { value: "high", label: "Alta" }, { value: "urgent", label: "Urgente" }]} />
      </div>
    </ServerForm>
  );
}

export function TaskStatusButtons({ projectId, taskId, status }: { projectId: string; taskId: string; status: string }) {
  const next = status === "todo" ? "in_progress" : status === "in_progress" ? "done" : status === "blocked" ? "in_progress" : null;
  if (!next) return null;
  return <ActionButton action={setTaskStatusAction.bind(null, projectId, taskId)} hidden={{ status: next }} label={next === "done" ? "Concluir" : "Iniciar"} />;
}
