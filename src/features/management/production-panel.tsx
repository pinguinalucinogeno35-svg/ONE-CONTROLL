import Link from "next/link";
import type { ActiveContext } from "@/server/auth/session";
import { Alert, Badge, Card, CardTitle } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatDayLabel, formatTime, localDate } from "@/lib/calendar";
import { formatWeeklyHours } from "@/lib/availability";
import { SESSION_KIND, WORK_CATEGORY } from "@/lib/labels";
import { loadBreakdown, loadVerdict, riskBadges, riskDetail, waitingLabel, type ManagementPanel } from "@/lib/management";

/**
 * Painel da gestão no Início da administração (fase 7): só o que pede decisão —
 * aprovações pendentes, entregas em risco, próximas sessões e carga × disponibilidade.
 */
export async function ProductionPanel({ ctx }: { ctx: ActiveContext }) {
  const { data, error } = await ctx.supabase.rpc("management_panel", { p_days: 7 });
  if (error || !data) {
    return <div className="mb-6"><Alert tone="danger">Não foi possível carregar o painel da produção.</Alert></div>;
  }
  const p = data as ManagementPanel;
  const now = new Date();
  return (
    <section aria-labelledby="producao" className="mb-6">
      <h2 id="producao" className="mb-3 text-sm font-semibold text-muted">
        Produção · {formatDate(p.from)} a {formatDate(p.to)}
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <PanelTitle title={`Aprovações pendentes (${p.approvals.length})`} href="/trabalhos?ver=todos&situacao=in_review" />
          {p.approvals.length === 0 ? <p className="text-sm text-muted">Nenhum trabalho esperando aprovação.</p> : (
            <ul className="divide-y divide-border text-sm">
              {p.approvals.map((a) => (
                <li key={a.work_id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/trabalhos/${a.work_id}`} className="block truncate font-semibold hover:underline">{a.title}</Link>
                    <p className="text-xs text-muted">
                      {[a.client, a.version ? `Versão ${a.version}` : null, a.reviewer ? `revisa: ${a.reviewer}` : null, a.assignees.join(", ") || null]
                        .filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted">{waitingLabel(a.waiting_since, now)}</span>
                    {a.overdue && <Badge tone="danger">Prazo vencido</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <PanelTitle title={`Entregas em risco (${p.at_risk.length})`} href="/trabalhos?ver=todos" />
          {p.at_risk.length === 0 ? <p className="text-sm text-muted">Nenhum trabalho atrasado, bloqueado ou aguardando material.</p> : (
            <ul className="divide-y divide-border text-sm">
              {p.at_risk.map((r) => {
                const detail = riskDetail(r);
                return (
                  <li key={r.work_id} className="flex flex-col gap-1 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/trabalhos/${r.work_id}`} className="min-w-0 truncate font-semibold hover:underline">{r.title}</Link>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {riskBadges(r).map((b) => <Badge key={b.label} tone={b.tone}>{b.label}</Badge>)}
                      </div>
                    </div>
                    <p className="text-xs text-muted">
                      {[r.client, WORK_CATEGORY[r.category] ?? r.category, r.due_current ? `prazo ${formatDate(r.due_current)}` : "sem prazo",
                        r.assignees.length ? r.assignees.join(", ") : "sem responsável"].filter(Boolean).join(" · ")}
                    </p>
                    {detail && <p className="text-xs text-fg">{detail}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <PanelTitle title={`Próximas sessões (${p.sessions.length})`} href="/calendario" />
          {p.sessions.length === 0 ? <p className="text-sm text-muted">Nenhuma sessão agendada no período.</p> : (
            <ul className="divide-y divide-border text-sm">
              {p.sessions.map((s) => (
                <li key={s.session_id} className="flex flex-col gap-1 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/calendario/${s.session_id}`} className="min-w-0 truncate font-semibold hover:underline">{s.title}</Link>
                    {s.people_in_conflict > 0 && (
                      <Badge tone="warning">{s.people_in_conflict === 1 ? "1 pessoa em conflito" : `${s.people_in_conflict} pessoas em conflito`}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {[formatDayLabel(localDate(s.starts_at)) + `, ${formatTime(s.starts_at)}–${formatTime(s.ends_at)}`,
                      SESSION_KIND[s.kind] ?? s.kind, s.client, s.location].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-xs text-muted">{s.participants.join(", ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <PanelTitle title="Carga da equipe" href="/equipe" linkLabel="Ver equipe" />
          <p className="mb-2 text-xs text-muted">
            Compromisso = sessões no período + estimativa dos trabalhos com prazo até {formatDate(p.to)} (inclui atrasados),
            dividida entre os responsáveis.
          </p>
          {p.load.length === 0 ? <p className="text-sm text-muted">Ninguém com perfil de trabalho, trabalho aberto ou sessão.</p> : (
            <ul className="divide-y divide-border text-sm">
              {p.load.map((l) => {
                const v = loadVerdict(l, p.days);
                return (
                  <li key={l.user_id} className="flex flex-col gap-1 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate font-semibold">{l.name}</p>
                      <Badge tone={v.tone}>{v.label}</Badge>
                    </div>
                    <div>
                      <p className="text-xs text-fg">
                        {formatWeeklyHours(l.committed_minutes)} comprometidas{l.available_minutes === null ? "; disponibilidade não informada" : ` de ${formatWeeklyHours(l.available_minutes)} disponíveis`}
                      </p>
                      <p className="text-xs text-muted">{loadBreakdown(l)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}

function PanelTitle({ title, href, linkLabel = "Ver todos" }: { title: string; href: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <CardTitle>{title}</CardTitle>
      <Link href={href} className="shrink-0 text-xs text-primary underline">{linkLabel}</Link>
    </div>
  );
}
