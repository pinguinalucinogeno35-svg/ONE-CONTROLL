import Link from "next/link";
import { requireActiveUser } from "@/server/auth/session";
import { Alert, Badge, Button, Card, Field, LinkButton, PageHeader, Select } from "@/components/ui";
import { getWorkContext } from "@/server/services/works";
import { addDaysISO, todayISO } from "@/lib/dates";
import { formatDayLabel, formatTime, weekDays, weekStart } from "@/lib/calendar";
import { SESSION_KIND, WORK_CATEGORY, WORK_STATUS, label } from "@/lib/labels";
import { uuid } from "@/lib/validation/schemas";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendário" };

type FeedRow = {
  item_type: "session" | "work_due" | "absence"; item_id: string; title: string; starts_at: string | null; ends_at: string | null;
  day: string; subtype: string; client_id: string | null; people: string[] | null; status: string; location: string | null;
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ semana?: string; pessoa?: string }> }) {
  const ctx = await requireActiveUser();
  const sp = await searchParams;
  const isAdmin = ctx.profile.role === "admin";
  const today = todayISO();
  const monday = weekStart(sp.semana && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana) ? sp.semana : today);
  const days = weekDays(monday);
  const person = isAdmin && sp.pessoa && uuid.safeParse(sp.pessoa).success ? sp.pessoa : null;
  const [{ data, error }, { people, peopleById, clients }] = await Promise.all([
    ctx.supabase.rpc("calendar_feed", { p_from: days[0], p_to: days[6], p_user: person }),
    getWorkContext(ctx),
  ]);
  const rows = (data ?? []) as FeedRow[];
  const first = (id: string) => peopleById.get(id)?.full_name.split(" ")[0] ?? "—";
  const q = (week: string) => `/calendario?semana=${week}${person ? `&pessoa=${person}` : ""}`;
  return (
    <>
      <PageHeader eyebrow="Produção / Calendário" title="Calendário" description="Captações, sessões de fotos, prazos de entrega e ausências da semana."
        actions={isAdmin ? <LinkButton href="/calendario/nova">Agendar sessão</LinkButton> : undefined} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Semanas" className="flex flex-wrap gap-2">
          <LinkButton href={q(addDaysISO(monday, -7))} variant="secondary">← Anterior</LinkButton>
          <LinkButton href={q(weekStart(today))} variant="secondary">Esta semana</LinkButton>
          <LinkButton href={q(addDaysISO(monday, 7))} variant="secondary">Próxima →</LinkButton>
        </nav>
        {isAdmin && (
          <form method="get" className="flex items-end gap-2">
            <input type="hidden" name="semana" value={monday} />
            <Field id="f-pessoa" label="Pessoa"><Select name="pessoa" defaultValue={person ?? ""}>
              <option value="">Toda a equipe</option>
              {people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Select></Field>
            <Button type="submit" variant="secondary">Filtrar</Button>
          </form>
        )}
      </div>
      {error && <Alert tone="danger">Não foi possível carregar a agenda.</Alert>}
      <ol className="flex flex-col gap-3">
        {days.map((day) => {
          const items = rows.filter((r) => r.day === day);
          return (
            <li key={day}>
              <Card className={cn("p-4", day === today && "border-primary/60")}>
                <h2 className="mb-2 font-display text-base font-bold">{formatDayLabel(day)}{day === today && <Badge tone="info" className="ml-2">Hoje</Badge>}</h2>
                {items.length === 0 ? <p className="text-sm text-muted">Nada agendado.</p> : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {items.map((r) => (
                      <li key={`${r.item_type}-${r.item_id}-${r.day}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        {r.item_type === "session" && (
                          <>
                            <span className="tabular font-semibold">{formatTime(r.starts_at!)}–{formatTime(r.ends_at!)}</span>
                            <Badge tone={r.status === "cancelled" ? "neutral" : "info"}>{SESSION_KIND[r.subtype] ?? r.subtype}</Badge>
                            <Link href={`/calendario/${r.item_id}`} className={cn("font-medium hover:underline", r.status === "cancelled" && "text-muted line-through")}>{r.title}</Link>
                            <span className="text-muted">{[r.client_id && clients.get(r.client_id), r.location, (r.people ?? []).map(first).join(", ")].filter(Boolean).join(" · ")}</span>
                            {r.status === "cancelled" && <Badge>Cancelada</Badge>}
                          </>
                        )}
                        {r.item_type === "work_due" && (
                          <>
                            <span className="tabular font-semibold">Prazo</span>
                            <Badge tone={label(WORK_STATUS, r.status)[1]}>{label(WORK_STATUS, r.status)[0]}</Badge>
                            <Link href={`/trabalhos/${r.item_id}`} className="font-medium hover:underline">{r.title}</Link>
                            <span className="text-muted">{[WORK_CATEGORY[r.subtype], r.client_id && clients.get(r.client_id), (r.people ?? []).map(first).join(", ")].filter(Boolean).join(" · ")}</span>
                          </>
                        )}
                        {r.item_type === "absence" && (
                          <>
                            <span className="tabular font-semibold">Dia todo</span>
                            <Badge tone="warning">Ausente</Badge>
                            <span className="font-medium">{(r.people ?? []).map((id) => peopleById.get(id)?.full_name ?? "—").join(", ")}</span>
                            <span className="text-muted">{r.title}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </>
  );
}
