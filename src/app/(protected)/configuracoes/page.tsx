import { requireAdmin } from "@/server/auth/session";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/server-form";
import { CategoryForm, GoogleFormsForm, PolicyForm, ServiceForm, SubjectLookupForm } from "@/features/settings/forms";
import { activatePolicyAction, toggleCategoryAction, toggleServiceAction } from "@/features/settings/actions";
import { BASE_RULE, POLICY_STATUS, TRIGGER_RULE, label } from "@/lib/labels";
import { formatBps } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { CommissionPolicy } from "@/types/db";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requireAdmin();
  const [services, categories, policies, gf] = await Promise.all([
    ctx.supabase.from("services").select("id, name, category, service_type, active").order("name"),
    ctx.supabase.from("financial_categories").select("id, name, kind, active").order("kind").order("name"),
    ctx.supabase.from("commission_policies").select("*").order("created_at", { ascending: false }),
    ctx.supabase.from("system_settings").select("setting_value").eq("setting_key", "google_forms.lead_form").maybeSingle(),
  ]);
  const pols = (policies.data ?? []) as CommissionPolicy[];
  const kindLabel: Record<string, string> = { expense: "Despesa", direct_cost: "Custo direto", revenue: "Receita" };
  return (
    <>
      <PageHeader eyebrow="Sistema / Configurações" title="Configurações" description="Catálogos, políticas financeiras e integrações. Segredos nunca são armazenados aqui." />
      <div className="flex flex-col gap-6">
        <Card id="politicas">
          <CardTitle className="mb-1">Políticas de comissão</CardTitle>
          <p className="mb-4 text-sm text-muted">Política ativa é imutável: para mudar regras, crie uma nova versão com vigência futura e ative-a. Contratos preservam a taxa da aprovação.</p>
          <ul className="mb-6 flex flex-col gap-3">
            {pols.map((p) => (
              <li key={p.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{p.name} <span className="text-xs text-muted">· vigência {formatDate(p.effective_from)}{p.effective_until ? ` a ${formatDate(p.effective_until)}` : ""}</span></p>
                  <Badge tone={label(POLICY_STATUS, p.status)[1]}>{label(POLICY_STATUS, p.status)[0]}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">Direta {formatBps(p.direct_rate_bps)} · Indicação {formatBps(p.referral_rate_bps)} · Indicação da indicação {formatBps(p.second_level_rate_bps)} · Base: {p.base_rule ? BASE_RULE[p.base_rule] : "pendente"} · Fato gerador: {p.trigger_rule ? TRIGGER_RULE[p.trigger_rule] : "pendente"}{p.recurring_limit_months ? ` · limite ${p.recurring_limit_months} meses` : ""} · {p.requires_approval ? "exige aprovação" : "sem aprovação"}</p>
                {p.status === "draft" && (
                  <details className="mt-3"><summary className="cursor-pointer text-sm text-primary">Editar rascunho / ativar</summary>
                    <div className="mt-3 flex flex-col gap-4"><PolicyForm policy={p} />
                      <ActionButton action={activatePolicyAction.bind(null, p.id)} label="Ativar política" variant="success" confirm="Ativar esta política? A vigente será encerrada e comissões passarão a ser geradas pelos recebimentos elegíveis." />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
          <details><summary className="cursor-pointer text-sm text-primary">Criar nova versão</summary><div className="mt-3"><PolicyForm /></div></details>
        </Card>

        <Card id="google-forms">
          <CardTitle className="mb-1">Google Forms — captação de clientes</CardTitle>
          <p className="mb-4 text-sm text-muted">O segredo HMAC fica apenas nas variáveis de ambiente do servidor e nas propriedades do Apps Script. Veja docs/integrations/google-forms.md.</p>
          <GoogleFormsForm value={(gf.data?.setting_value ?? {}) as Record<string, string | null>} />
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle className="mb-3">Serviços</CardTitle>
            <ul className="mb-4 divide-y divide-border text-sm">{(services.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2"><span className={s.active ? "" : "text-muted line-through"}>{s.name} <span className="text-xs text-muted">{s.category}</span></span>
                <ActionButton action={toggleServiceAction.bind(null, s.id, !s.active)} label={s.active ? "Desativar" : "Reativar"} variant="ghost" /></li>
            ))}</ul>
            <ServiceForm />
          </Card>
          <Card>
            <CardTitle className="mb-3">Categorias financeiras</CardTitle>
            <ul className="mb-4 divide-y divide-border text-sm">{(categories.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2"><span className={c.active ? "" : "text-muted line-through"}>{c.name} <span className="text-xs text-muted">{kindLabel[c.kind]}</span></span>
                <ActionButton action={toggleCategoryAction.bind(null, c.id, !c.active)} label={c.active ? "Desativar" : "Reativar"} variant="ghost" /></li>
            ))}</ul>
            <CategoryForm />
          </Card>
        </div>

        <Card>
          <CardTitle className="mb-1">LGPD — consulta por titular</CardTitle>
          <p className="mb-4 text-sm text-muted">Localiza registros de um titular para atender solicitações de acesso ou correção.</p>
          <SubjectLookupForm />
        </Card>
      </div>
    </>
  );
}
