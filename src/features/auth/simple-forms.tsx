"use client";

import { useActionState } from "react";
import { requestPasswordReset, updatePassword } from "./actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function RecoverForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state && <Alert tone={state.ok ? "success" : "danger"}>{state.ok ? state.message : state.error}</Alert>}
      <Field id="email" label="E-mail corporativo"><Input name="email" type="email" required autoComplete="email" /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Enviando..." : "Enviar instruções"}</Button>
      <a href="/login" className="text-center text-sm text-muted hover:text-fg">Voltar ao login</a>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <Field id="password" label="Nova senha" hint="Mínimo de 12 caracteres, com maiúsculas, minúsculas e números." error={fe?.password}>
        <Input name="password" type="password" autoComplete="new-password" required minLength={12} />
      </Field>
      <Field id="confirm" label="Confirme a senha" error={fe?.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar senha"}</Button>
    </form>
  );
}
