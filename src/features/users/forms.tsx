"use client";

import { SelectField, ServerForm, TextField } from "@/components/ui/server-form";
import { inviteUserAction, setUserRoleAction, setUserStatusAction } from "./actions";

export function InviteForm() {
  return (
    <ServerForm action={inviteUserAction} submitLabel="Enviar convite" resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="full_name" label="Nome completo" required />
        <TextField name="email" label="E-mail" type="email" required />
        <SelectField name="role" label="Papel" defaultValue="seller" options={[{ value: "seller", label: "Vendedor" }, { value: "admin", label: "Administrador" }]} />
      </div>
    </ServerForm>
  );
}

export function UserStatusForm({ userId, status }: { userId: string; status: string }) {
  return (
    <ServerForm action={setUserStatusAction.bind(null, userId)} submitLabel="Alterar status" variant="secondary" confirm="Confirmar alteração? Desativar encerra as sessões e revoga links de captação; o histórico é preservado.">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField name="status" label="Status" defaultValue={status === "invited" ? "active" : status} options={[{ value: "active", label: "Ativo" }, { value: "suspended", label: "Suspenso" }, { value: "inactive", label: "Inativo" }]} />
        <TextField name="reason" label="Motivo" required />
      </div>
    </ServerForm>
  );
}

export function UserRoleForm({ userId, role }: { userId: string; role: string }) {
  return (
    <ServerForm action={setUserRoleAction.bind(null, userId)} submitLabel="Alterar papel" variant="secondary" confirm="Alterar o papel deste usuário? A operação é auditada.">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField name="role" label="Papel" defaultValue={role} options={[{ value: "seller", label: "Vendedor" }, { value: "admin", label: "Administrador" }]} />
        <TextField name="reason" label="Motivo" required />
      </div>
    </ServerForm>
  );
}
