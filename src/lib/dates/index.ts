// Datas de negócio são exibidas no fuso America/Bahia (UTC-3, sem horário de verão).
export const APP_TIMEZONE = "America/Bahia";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

/** "2026-10-27" (data pura do banco) → "27/10/2026" sem deslocamento de fuso. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return dateTimeFmt.format(new Date(value));
}

/** Data de hoje (AAAA-MM-DD) no fuso da aplicação. */
export function todayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA → AAAA-MM-DD
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function startOfMonthISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export type PeriodKey = "today" | "7d" | "month" | "3m" | "year" | "custom";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoje", "7d": "Últimos 7 dias", month: "Este mês", "3m": "Últimos 3 meses", year: "Este ano", custom: "Período personalizado",
};

/** Resolve filtros de período do dashboard para intervalo [from, to] em AAAA-MM-DD. */
export function resolvePeriod(key: string | undefined, from?: string, to?: string, now: Date = new Date()): { key: PeriodKey; from: string; to: string } {
  const today = todayISO(now);
  const isIso = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  switch (key) {
    case "today": return { key: "today", from: today, to: today };
    case "7d": return { key: "7d", from: addDaysISO(today, -6), to: today };
    case "3m": return { key: "3m", from: addDaysISO(today, -89), to: today };
    case "year": return { key: "year", from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom":
      if (isIso(from) && isIso(to) && from! <= to!) return { key: "custom", from: from!, to: to! };
      return { key: "month", from: startOfMonthISO(today), to: today };
    default: return { key: "month", from: startOfMonthISO(today), to: today };
  }
}

/** Replica a política "clamp_to_month_end" do banco (dia 31 → último dia do mês). */
export function dueDateForMonth(year: number, month1to12: number, billingDay: number): string {
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  const day = Math.min(billingDay, last);
  return `${year}-${String(month1to12).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
