"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/server/errors";
import { Alert, Button, Field, Input, Select, Textarea } from "./index";

type FormAction = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;
const Ctx = React.createContext<{ errors?: Record<string, string[]>; pending: boolean }>({ pending: false });

/**
 * Formulário ligado a uma Server Action. Exibe erro geral, erros por campo
 * (aria-describedby) e mensagem de sucesso; opcionalmente redireciona.
 */
export function ServerForm({
  action, children, submitLabel = "Salvar", pendingLabel = "Salvando…", successRedirect, className, resetOnSuccess, confirm, variant, idempotencyPrefix,
}: {
  action: FormAction; children: React.ReactNode; submitLabel?: string; pendingLabel?: string;
  successRedirect?: string | ((data: unknown) => string); className?: string; resetOnSuccess?: boolean; confirm?: string;
  variant?: "primary" | "secondary" | "danger" | "success";
  /** Gera uma chave de idempotência por operação (renovada após sucesso). */
  idempotencyPrefix?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  const ref = React.useRef<HTMLFormElement>(null);
  // Chave criada no envio e mantida em novas tentativas após falha (repetição
  // segura); descartada após sucesso para que a próxima operação tenha outra.
  const idemRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (state?.ok && idemRef.current) idemRef.current.value = "";
  }, [state]);
  React.useEffect(() => {
    if (state?.ok) {
      if (successRedirect) router.push(typeof successRedirect === "function" ? successRedirect(state.data) : successRedirect);
      else router.refresh();
      if (resetOnSuccess) ref.current?.reset();
    }
  }, [state, successRedirect, router, resetOnSuccess]);
  return (
    <Ctx.Provider value={{ errors: state && !state.ok ? state.fieldErrors : undefined, pending }}>
      <form ref={ref} action={formAction} className={className ?? "flex flex-col gap-4"} noValidate
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) { e.preventDefault(); return; }
          if (idemRef.current && !idemRef.current.value) idemRef.current.value = `${idempotencyPrefix}-${crypto.randomUUID()}`;
        }}>
        {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
        {state?.ok && state.message && <Alert tone="success">{state.message}</Alert>}
        {idempotencyPrefix && <input ref={idemRef} type="hidden" name="idempotency_key" defaultValue="" />}
        {children}
        <div><Button type="submit" variant={variant} disabled={pending} aria-busy={pending}>{pending ? pendingLabel : submitLabel}</Button></div>
      </form>
    </Ctx.Provider>
  );
}

export function useFormErrors() {
  return React.useContext(Ctx);
}

type Common = { name: string; label: string; hint?: string; className?: string; id?: string };

export function TextField({ name, label, hint, className, id, ...props }: Common & React.InputHTMLAttributes<HTMLInputElement>) {
  const { errors } = useFormErrors();
  return <Field id={id ?? `f-${name}`} label={label} hint={hint} error={errors?.[name]} className={className}><Input name={name} {...props} /></Field>;
}

export function MoneyField({ name, label, hint, className, ...props }: Common & React.InputHTMLAttributes<HTMLInputElement>) {
  const { errors } = useFormErrors();
  return (
    <Field id={`f-${name}`} label={label} hint={hint ?? "Ex.: 2.000,00"} error={errors?.[name]} className={className}>
      <Input name={name} inputMode="decimal" autoComplete="off" placeholder="0,00" {...props} />
    </Field>
  );
}

export function SelectField({ name, label, hint, className, options, placeholder, ...props }: Common & React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  const { errors } = useFormErrors();
  return (
    <Field id={`f-${name}`} label={label} hint={hint} error={errors?.[name]} className={className}>
      <Select name={name} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );
}

export function TextAreaField({ name, label, hint, className, ...props }: Common & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { errors } = useFormErrors();
  return <Field id={`f-${name}`} label={label} hint={hint} error={errors?.[name]} className={className}><Textarea name={name} {...props} /></Field>;
}

/** Botão de ação única (aprovar, revogar…) com confirmação opcional. */
export function ActionButton({ action, label, confirm, variant = "secondary", hidden }: {
  action: FormAction; label: string; confirm?: string; variant?: "primary" | "secondary" | "danger" | "success" | "ghost"; hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  React.useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  return (
    <form action={formAction} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} className="inline-flex flex-col gap-1">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" size="sm" variant={variant} disabled={pending}>{pending ? "…" : label}</Button>
      {state && !state.ok && <span role="alert" className="max-w-56 text-xs text-danger">{state.error}</span>}
    </form>
  );
}
