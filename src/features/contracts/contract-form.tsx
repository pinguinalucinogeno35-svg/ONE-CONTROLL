"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { contractSchema } from "@/lib/validation/schemas";
import { MoneyError, parseBRL } from "@/lib/money";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CommissionCalculator, type Origin } from "./commission-calculator";
import { createContractAction, updateContractDraftAction } from "./actions";
import { SALE_ORIGIN } from "@/lib/labels";
import type { CommissionPolicy } from "@/types/db";

type In = z.input<typeof contractSchema>;
type Out = z.output<typeof contractSchema>;
type Option = { id: string; name: string };

function safeCents(v: string | undefined): number | null {
  if (!v) return null;
  try { const c = parseBRL(v); return c >= 0 ? c : null; } catch (e) { if (e instanceof MoneyError) return null; throw e; }
}

export function ContractForm({ clients, services, sellers, projects, policy, isAdmin, defaults, contractId }: {
  clients: Option[]; services: Option[]; sellers?: Option[]; projects: (Option & { client_id: string })[];
  policy: CommissionPolicy | null; isAdmin: boolean; defaults?: Partial<In>; contractId?: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(contractSchema),
    defaultValues: { sale_origin: "direct", billing_frequency: "monthly", services: [], referral: {}, submit: false, implementation_amount: "", monthly_amount: "", ...defaults },
  });
  const { register, handleSubmit, control, formState: { errors } } = form;
  const items = useFieldArray({ control, name: "services" });
  const [origin, clientId, implRaw, monthlyRaw] = useWatch({ control, name: ["sale_origin", "client_id", "implementation_amount", "monthly_amount"] });
  const impl = safeCents(implRaw);
  const monthly = safeCents(monthlyRaw);
  const clientProjects = useMemo(() => projects.filter((p) => p.client_id === clientId), [projects, clientId]);
  const err = (path: string) => {
    const parts = path.split(".");
    let node: unknown = errors;
    for (const p of parts) node = (node as Record<string, unknown> | undefined)?.[p];
    return (node as { message?: string } | undefined)?.message;
  };

  // Validação no cliente (Zod via RHF); o servidor revalida e converte com o mesmo schema.
  const onSubmit = (submit: boolean) => handleSubmit(() => {
    setServerError(null);
    const fd = new FormData();
    // Envia apenas os campos do schema; nenhum valor de comissão sai do navegador.
    fd.set("payload", JSON.stringify({ ...form.getValues(), submit }));
    startTransition(async () => {
      const res = contractId ? await updateContractDraftAction(contractId, null, fd) : await createContractAction(null, fd);
      if (!res.ok) { setServerError(res.error); return; }
      router.push(`/contratos/${contractId ?? (res.data as string)}`);
      router.refresh();
    });
  });

  return (
    <form className="grid gap-6 lg:grid-cols-[1fr_360px]" noValidate onSubmit={(e) => e.preventDefault()}>
      <div className="flex flex-col gap-6">
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-muted">Cliente e responsável</legend>
          <Field id="client_id" label="Cliente" error={err("client_id")}>
            <Select {...register("client_id")} disabled={!!contractId}><option value="">Selecione</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
          <Field id="project_id" label="Projeto (opcional)" error={err("project_id")}>
            <Select {...register("project_id")}><option value="">Nenhum</option>{clientProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          </Field>
          {isAdmin && sellers && (
            <Field id="seller_id" label="Vendedor responsável" hint="Padrão: responsável atual do cliente">
              <Select {...register("seller_id")}><option value="">Responsável do cliente</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </Field>
          )}
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-muted">Valores e datas</legend>
          <Field id="implementation_amount" label="Valor de implementação (R$)" error={err("implementation_amount")} hint="Ex.: 2.000,00">
            <Input {...register("implementation_amount")} inputMode="decimal" placeholder="0,00" autoComplete="off" />
          </Field>
          <Field id="monthly_amount" label="Valor da mensalidade (R$)" error={err("monthly_amount")}>
            <Input {...register("monthly_amount")} inputMode="decimal" placeholder="0,00" autoComplete="off" />
          </Field>
          <Field id="start_date" label="Início do projeto" error={err("start_date")}><Input type="date" {...register("start_date")} /></Field>
          <Field id="delivery_due_date" label="Data de entrega" error={err("delivery_due_date")}><Input type="date" {...register("delivery_due_date")} /></Field>
          {isAdmin && (
            <Field id="delivery_date_justification" label="Justificativa administrativa (entrega antes do início)" className="sm:col-span-2" error={err("delivery_date_justification")}>
              <Input {...register("delivery_date_justification")} />
            </Field>
          )}
          {(monthly ?? 0) > 0 && (
            <>
              <Field id="recurring_start_date" label="Início das mensalidades" error={err("recurring_start_date")}><Input type="date" {...register("recurring_start_date")} /></Field>
              <Field id="billing_day" label="Dia de cobrança" error={err("billing_day")} hint="Dias 29–31 viram o último dia em meses curtos">
                <Input type="number" min={1} max={31} inputMode="numeric" {...register("billing_day")} />
              </Field>
              <Field id="billing_frequency" label="Periodicidade">
                <Select {...register("billing_frequency")}><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="yearly">Anual</option></Select>
              </Field>
            </>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-muted">Origem da venda</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(SALE_ORIGIN) as Origin[]).map((o) => (
              <label key={o} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                <input type="radio" value={o} {...register("sale_origin")} className="accent-[var(--one-action)]" />{SALE_ORIGIN[o]}
              </label>
            ))}
          </div>
          {origin !== "direct" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="first_ref" label="Cliente que indicou" error={err("referral")}>
                <Select {...register("referral.first_referrer_client_id")}><option value="">Não é cliente da carteira</option>{clients.filter((c) => c.id !== clientId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              </Field>
              <Field id="external_ref" label="Ou nome de quem indicou"><Input {...register("referral.external_referrer_name")} /></Field>
              {origin === "second_level_referral" && (
                <Field id="second_ref" label="Indicação intermediária (cliente)" className="sm:col-span-2">
                  <Select {...register("referral.second_referrer_client_id")}><option value="">Selecione</option>{clients.filter((c) => c.id !== clientId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                </Field>
              )}
              <p className="text-xs text-muted sm:col-span-2">O registro da indicação não gera pagamento a quem indicou; a comissão deste escopo pertence ao vendedor responsável.</p>
            </div>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-muted">Serviços contratados</legend>
          {items.fields.map((f, i) => (
            <div key={f.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_90px_140px_auto] sm:items-end">
              <Field id={`svc-${i}`} label="Serviço"><Select {...register(`services.${i}.service_id` as const)}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field id={`qty-${i}`} label="Qtd."><Input type="number" min={1} step="1" inputMode="numeric" {...register(`services.${i}.quantity` as const)} /></Field>
              <Field id={`unit-${i}`} label="Valor unitário"><Input inputMode="decimal" placeholder="0,00" {...register(`services.${i}.unit_amount` as const)} /></Field>
              <Button type="button" size="sm" variant="ghost" onClick={() => items.remove(i)}>Remover</Button>
            </div>
          ))}
          <div><Button type="button" size="sm" variant="secondary" onClick={() => items.append({ service_id: services[0]?.id ?? "", quantity: 1, unit_amount: "" })} disabled={!services.length}>Adicionar serviço</Button></div>
          <p className="text-xs text-muted">Os itens são descritivos. Os valores de implementação e mensalidade acima são a referência oficial de cobrança.</p>
        </fieldset>

        <Field id="notes" label="Observações"><Textarea {...register("notes")} /></Field>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <CommissionCalculator policy={policy} origin={origin as Origin} implementation={impl} monthly={monthly} />
        <Button type="button" variant="secondary" disabled={pending} onClick={onSubmit(false)}>{pending ? "Salvando…" : "Salvar rascunho"}</Button>
        <Button type="button" disabled={pending} onClick={onSubmit(true)}>Salvar e enviar para aprovação</Button>
      </aside>
    </form>
  );
}
