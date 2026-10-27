"use client";

import { useActionState, useState } from "react";
import { createLeadLinkAction, type LeadLinkResult } from "./lead-link-actions";
import { Alert, Button, Field, Input } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";

export function LeadLinkForm() {
  const [state, action, pending] = useActionState(createLeadLinkAction, null);
  const [copied, setCopied] = useState(false);
  const result = state?.ok ? (state.data as LeadLinkResult) : null;
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="grid gap-4 sm:grid-cols-[1fr_140px_140px_auto] sm:items-end">
        <Field id="label" label="Identificação (opcional)"><Input name="label" placeholder="Ex.: Café Bahia — reunião 10/11" /></Field>
        <Field id="valid_days" label="Validade (dias)"><Input name="valid_days" type="number" min={1} max={90} defaultValue={30} inputMode="numeric" /></Field>
        <Field id="max_uses" label="Usos máximos"><Input name="max_uses" type="number" min={1} max={1000} defaultValue={1} inputMode="numeric" /></Field>
        <Button type="submit" disabled={pending}>{pending ? "Gerando…" : "Gerar link"}</Button>
      </form>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {result && (result.url ? (
        <Alert tone="success" title="Link gerado — copie agora (ele não será exibido novamente)">
          <p className="mt-1 break-all font-mono text-xs">{result.url}</p>
          <p className="mt-1 text-xs">Expira em {formatDateTime(result.expires_at)}.</p>
          <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={async () => { await navigator.clipboard.writeText(result.url!); setCopied(true); }}>
            {copied ? "Copiado" : "Copiar link"}
          </Button>
        </Alert>
      ) : (
        <Alert tone="warning" title="Formulário do Google ainda não configurado">
          O vínculo foi registrado, mas a URL do Google Forms não está configurada. Um administrador deve preencher
          “Google Forms” em Configurações (ver docs/integrations/google-forms.md). Nenhum link foi simulado.
        </Alert>
      ))}
    </div>
  );
}
