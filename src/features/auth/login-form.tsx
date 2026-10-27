"use client";

import { useActionState } from "react";
import { signIn } from "./actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Field id="email" label="E-mail corporativo">
        <Input name="email" type="email" autoComplete="username" required inputMode="email" />
      </Field>
      <Field id="password" label="Senha">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Entrando..." : "Entrar"}</Button>
      <a href="/recuperar-acesso" className="text-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline">Esqueci minha senha</a>
    </form>
  );
}
