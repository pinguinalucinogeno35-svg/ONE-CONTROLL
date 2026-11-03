/**
 * Disponibilidade semanal em blocos (dia 1 = segunda … 7 = domingo).
 * Mesma regra de `private.availability_minutes`: blocos sobrepostos no mesmo
 * dia contam uma vez (presencial 9–14 + remoto 13–18 = 9 h, não 10 h).
 */
export type WorkMode = "onsite" | "remote" | "external";
export type AvailabilityBlock = { day: number; start: string; end: string; mode: WorkMode };

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function availabilityMinutes(blocks: AvailabilityBlock[], mode?: WorkMode): number {
  const byDay = new Map<number, [number, number][]>();
  for (const b of blocks) {
    if (mode && b.mode !== mode) continue;
    const s = toMinutes(b.start);
    const f = toMinutes(b.end);
    if (!(f > s)) continue;
    byDay.set(b.day, [...(byDay.get(b.day) ?? []), [s, f]]);
  }
  let total = 0;
  for (const ranges of byDay.values()) {
    ranges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let [cs, cf] = ranges[0]!;
    for (const [s, f] of ranges.slice(1)) {
      if (s > cf) { total += cf - cs; [cs, cf] = [s, f]; } else cf = Math.max(cf, f);
    }
    total += cf - cs;
  }
  return total;
}

/** "9 h", "9 h 30" ou "Não informado" (desconhecido nunca vira zero). */
export function formatWeeklyHours(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "Não informado";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}
