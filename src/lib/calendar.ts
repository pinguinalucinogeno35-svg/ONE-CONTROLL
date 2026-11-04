import { APP_TIMEZONE, addDaysISO } from "@/lib/dates";

/** Segunda-feira da semana que contém a data (ISO yyyy-mm-dd). */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 = domingo
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}

export function weekDays(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(mondayIso, i));
}

/** Data + hora locais (America/Bahia, UTC−3, sem horário de verão) → ISO com fuso. */
export function localToISO(date: string, time: string): string {
  return `${date}T${time}:00-03:00`;
}

const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit" });
const dateInZone = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function formatTime(ts: string): string {
  return timeFmt.format(new Date(ts));
}

export function localDate(ts: string): string {
  return dateInZone.format(new Date(ts));
}

export function formatDayLabel(iso: string): string {
  const s = dayFmt.format(new Date(`${iso}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Link do Google Maps para o endereço (abre o app de mapas no celular). */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
