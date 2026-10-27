"use client";

import { Badge } from "@/components/ui";
import { commissionCents, formatBps, formatBRL, type Cents } from "@/lib/money";
import { BASE_RULE, SALE_ORIGIN } from "@/lib/labels";
import type { CommissionPolicy } from "@/types/db";

export type Origin = "direct" | "referral" | "second_level_referral";

export function rateFor(policy: Pick<CommissionPolicy, "direct_rate_bps" | "referral_rate_bps" | "second_level_rate_bps">, origin: Origin) {
  return origin === "direct" ? policy.direct_rate_bps : origin === "referral" ? policy.referral_rate_bps : policy.second_level_rate_bps;
}

/**
 * Calculadora exibida no cadastro comercial. Atualiza instantaneamente,
 * mas é apenas SIMULAÇÃO: o valor oficial é recalculado no banco segundo a
 * política aprovada. As taxas não são cumulativas.
 */
export function CommissionCalculator({ policy, origin, implementation, monthly }: {
  policy: CommissionPolicy | null; origin: Origin; implementation: Cents | null; monthly: Cents | null;
}) {
  if (!policy) return <p className="text-sm text-warning">Nenhuma política de comissão cadastrada. A administração deve configurá-la.</p>;
  const rate = rateFor(policy, origin);
  const provisional = policy.status !== "active" || !policy.base_rule;
  const impl = implementation ?? 0;
  const mon = monthly ?? 0;
  return (
    <div aria-live="polite" className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Comissão — {SALE_ORIGIN[origin]}</p>
        {provisional ? <Badge tone="warning">Simulação provisória</Badge> : <Badge tone="success">Política ativa</Badge>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Percentual</dt><dd className="tabular text-right text-lg font-semibold">{formatBps(rate)}</dd>
        <dt className="text-muted">Sobre a implementação ({formatBRL(impl)})</dt><dd className="tabular text-right font-semibold">{formatBRL(commissionCents(impl, rate))}</dd>
        {mon > 0 && (<><dt className="text-muted">Sobre uma mensalidade ({formatBRL(mon)})</dt><dd className="tabular text-right">{formatBRL(commissionCents(mon, rate))}</dd></>)}
      </dl>
      <p className="text-xs text-muted">
        {provisional
          ? "A base de cálculo e o momento de aquisição ainda dependem de decisão comercial. Nenhuma comissão a pagar é gerada até a política ser ativada pela administração."
          : `Base oficial: ${BASE_RULE[policy.base_rule!] ?? policy.base_rule}. Comissão adquirida conforme os recebimentos confirmados.`}
        {" "}Taxas não cumulativas: direta {formatBps(policy.direct_rate_bps)}, indicação {formatBps(policy.referral_rate_bps)}, indicação da indicação {formatBps(policy.second_level_rate_bps)}.
      </p>
    </div>
  );
}
