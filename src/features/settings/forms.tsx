"use client";

import { useActionState } from "react";
import { SelectField, ServerForm, TextAreaField, TextField } from "@/components/ui/server-form";
import { Alert, Button, Field, Input } from "@/components/ui";
import { BASE_RULE, TRIGGER_RULE } from "@/lib/labels";
import { todayISO } from "@/lib/dates";
import type { CommissionPolicy } from "@/types/db";
import {
  createCategoryAction, createPolicyAction, createServiceAction, dataSubjectLookupAction, saveGoogleFormsAction, updatePolicyAction, type SubjectLookup,
} from "./actions";

export function ServiceForm() {
  return (
    <ServerForm action={createServiceAction} submitLabel="Adicionar serviço" resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField name="name" label="Nome" required />
        <TextField name="category" label="Categoria" />
        <SelectField name="service_type" label="Tipo" options={[{ value: "one_time", label: "Pontual" }, { value: "recurring", label: "Recorrente" }, { value: "hybrid", label: "Híbrido" }]} />
      </div>
    </ServerForm>
  );
}

export function CategoryForm() {
  return (
    <ServerForm action={createCategoryAction} submitLabel="Adicionar categoria" resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="name" label="Nome" required />
        <SelectField name="kind" label="Tipo" options={[{ value: "expense", label: "Despesa" }, { value: "direct_cost", label: "Custo direto" }, { value: "revenue", label: "Receita" }]} />
      </div>
    </ServerForm>
  );
}

const pct = (bps?: number) => (bps === undefined ? "" : String(bps / 100).replace(".", ","));

export function PolicyForm({ policy }: { policy?: CommissionPolicy }) {
  return (
    <ServerForm action={policy ? updatePolicyAction.bind(null, policy.id) : createPolicyAction} submitLabel={policy ? "Salvar rascunho" : "Criar nova versão (rascunho)"}>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField name="name" label="Nome" required defaultValue={policy?.name ?? "Política de comissões"} className="sm:col-span-3" />
        <TextField name="direct_rate_bps" label="Venda direta (%)" inputMode="decimal" defaultValue={pct(policy?.direct_rate_bps ?? 1250)} />
        <TextField name="referral_rate_bps" label="Indicação (%)" inputMode="decimal" defaultValue={pct(policy?.referral_rate_bps ?? 2000)} />
        <TextField name="second_level_rate_bps" label="Indicação da indicação (%)" inputMode="decimal" defaultValue={pct(policy?.second_level_rate_bps ?? 2500)} />
        <SelectField name="base_rule" label="Base de cálculo" placeholder="Pendente de decisão" defaultValue={policy?.base_rule ?? ""} options={Object.entries(BASE_RULE).map(([value, label]) => ({ value, label }))} />
        <SelectField name="trigger_rule" label="Fato gerador" placeholder="Pendente de decisão" defaultValue={policy?.trigger_rule ?? ""} options={Object.entries(TRIGGER_RULE).map(([value, label]) => ({ value, label }))} />
        <TextField name="recurring_limit_months" label="Limite de meses de recorrência" type="number" min={1} max={120} defaultValue={policy?.recurring_limit_months ?? ""} hint="Vazio = sem limite" />
        <TextField name="effective_from" label="Vigência a partir de" type="date" defaultValue={policy?.effective_from ?? todayISO()} />
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="requires_approval" defaultChecked={policy?.requires_approval ?? true} className="size-4 accent-[var(--one-action)]" />Exige aprovação administrativa para pagamento</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="refunds_reverse" defaultChecked={policy?.refunds_reverse ?? true} className="size-4 accent-[var(--one-action)]" />Estorno/reembolso reverte comissão</label>
        <TextAreaField name="notes" label="Observações" className="sm:col-span-3" defaultValue={policy?.notes ?? ""} />
      </div>
      <p className="text-xs text-muted">Descontos reduzem a base naturalmente: a comissão incide sobre o valor efetivamente recebido. Comissões já aprovadas nunca são recalculadas por novas políticas.</p>
    </ServerForm>
  );
}

export function GoogleFormsForm({ value }: { value: { form_id?: string | null; form_url?: string | null; token_entry_id?: string | null } }) {
  return (
    <ServerForm action={saveGoogleFormsAction} submitLabel="Salvar integração">
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField name="form_id" label="ID do formulário" defaultValue={value.form_id ?? ""} hint="Trecho da URL de edição: /forms/d/<ID>/edit" />
        <TextField name="form_url" label="URL pública (viewform)" defaultValue={value.form_url ?? ""} />
        <TextField name="token_entry_id" label="Entry do campo “ref”" defaultValue={value.token_entry_id ?? ""} hint="Número de entry.XXXX do link pré-preenchido" />
      </div>
    </ServerForm>
  );
}

export function SubjectLookupForm() {
  const [state, action, pending] = useActionState(dataSubjectLookupAction, null);
  const result = state?.ok ? (state.data as SubjectLookup) : null;
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
        <Field id="lgpd-email" label="E-mail do titular"><Input name="email" type="email" /></Field>
        <Field id="lgpd-wa" label="WhatsApp do titular"><Input name="whatsapp" type="tel" /></Field>
        <Button type="submit" variant="secondary" disabled={pending}>Consultar</Button>
      </div>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {result && (
        <Alert tone="info" title={`${result.clients.length} cadastro(s) e ${result.form_submissions} resposta(s) de formulário`}>
          <ul className="mt-1 list-disc pl-5">{result.clients.map((c) => <li key={c.id}><a className="underline" href={`/clientes/${c.id}`}>{c.company_name}</a> — {c.contact_name} · {c.email ?? "—"} · {c.whatsapp ?? "—"}</li>)}</ul>
          <p className="mt-2 text-xs">Correções: edite o cadastro. Exclusão: avaliar obrigações legais/contratuais de retenção antes (ver docs/security/lgpd.md). A consulta foi registrada na auditoria.</p>
        </Alert>
      )}
    </form>
  );
}
