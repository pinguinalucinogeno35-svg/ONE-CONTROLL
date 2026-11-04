/**
 * Painel da gestão (fase 7). Tipos do retorno de `management_panel` e regras de
 * apresentação puras (testadas em tests/unit/management.test.ts).
 * Nada aqui inventa limite: "acima" é só compromisso > disponibilidade informada.
 */
import { formatWeeklyHours } from "@/lib/availability";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export type PanelApproval = {
  work_id: string; title: string; category: string; client: string | null; due_current: string | null; overdue: boolean;
  reviewer_id: string; reviewer: string | null; version: number | null; waiting_since: string; assignees: string[];
};
export type RiskReason = "overdue" | "blocked" | "waiting_material";
export type PanelRisk = {
  work_id: string; title: string; category: string; status: string; client: string | null; due_current: string | null;
  days_late: number | null; blocked_reason: string | null; blocked_at: string | null; missing: string[] | null;
  assignees: string[]; reasons: RiskReason[];
};
export type PanelSession = {
  session_id: string; title: string; kind: string; starts_at: string; ends_at: string; location: string | null;
  client: string | null; participants: string[]; people_in_conflict: number;
};
export type PanelLoad = {
  user_id: string; name: string; role: string; available_minutes: number | null;
  availability_source: "blocks" | "declared_total" | null; absence_days: number;
  session_minutes: number; sessions: number; work_minutes: number; committed_minutes: number;
  open_works: number; in_review: number; due_works: number; works_without_estimate: number; over: boolean | null;
};
export type ManagementPanel = {
  from: string; to: string; days: number;
  approvals: PanelApproval[]; at_risk: PanelRisk[]; sessions: PanelSession[]; load: PanelLoad[];
};

/** "hoje", "há 1 dia", "há 3 dias" (dias corridos desde o envio). */
export function waitingLabel(since: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(since).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

export function riskBadges(r: Pick<PanelRisk, "reasons" | "days_late">): { label: string; tone: Tone }[] {
  return r.reasons.map((reason) => {
    if (reason === "overdue") {
      const d = r.days_late ?? 0;
      return { label: d === 1 ? "Atrasado 1 dia" : `Atrasado ${d} dias`, tone: "danger" as const };
    }
    if (reason === "blocked") return { label: "Bloqueado", tone: "danger" as const };
    return { label: "Aguardando material", tone: "warning" as const };
  });
}

/** Detalhe do risco: motivo do bloqueio e/ou o que falta. */
export function riskDetail(r: Pick<PanelRisk, "blocked_reason" | "missing">): string | null {
  const parts: string[] = [];
  if (r.blocked_reason) parts.push(`Bloqueio: ${r.blocked_reason}`);
  if (r.missing?.length) parts.push(`Falta: ${r.missing.join(", ")}`);
  return parts.length ? parts.join(" · ") : null;
}

export function loadVerdict(l: Pick<PanelLoad, "available_minutes" | "over" | "absence_days" | "committed_minutes">, days: number): { label: string; tone: Tone } {
  if (l.absence_days >= days) return { label: "Ausente no período", tone: l.committed_minutes > 0 ? "danger" : "neutral" };
  if (l.available_minutes === null || l.over === null) return { label: "Disponibilidade não informada", tone: "neutral" };
  return l.over ? { label: "Acima da disponibilidade", tone: "danger" } : { label: "Dentro da disponibilidade", tone: "success" };
}

/** Linha de composição da carga, sem números inventados. */
export function loadBreakdown(l: PanelLoad): string {
  const parts = [`sessões ${formatWeeklyHours(l.session_minutes)}`, `trabalhos ${formatWeeklyHours(l.work_minutes)}`];
  if (l.works_without_estimate) parts.push(l.works_without_estimate === 1 ? "1 trabalho sem estimativa" : `${l.works_without_estimate} trabalhos sem estimativa`);
  if (l.absence_days) parts.push(l.absence_days === 1 ? "1 dia de ausência" : `${l.absence_days} dias de ausência`);
  if (l.availability_source === "declared_total") parts.push("disponibilidade pelo total semanal");
  return parts.join(" · ");
}
