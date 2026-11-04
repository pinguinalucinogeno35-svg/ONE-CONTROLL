import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveUser } from "@/server/auth/session";
import { Alert, Card, CardTitle, PageHeader } from "@/components/ui";
import { CancelSessionForm, SessionForm } from "@/features/sessions/forms";
import { getWorkContext, listWorks } from "@/server/services/works";
import { formatDayLabel, formatTime, localDate, mapsUrl } from "@/lib/calendar";
import { SESSION_KIND } from "@/lib/labels";
import { uuid } from "@/lib/validation/schemas";

export const metadata = { title: "Sessão" };

type Conflict = { user_id: string; name: string; kind: "session" | "absence"; title: string };

/** Tela da sessão: pensada para o celular, no local (horário, endereço, contato, checklist). */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await requireActiveUser();
  const isAdmin = ctx.profile.role === "admin";
  const [{ data: s }, { people, peopleById, clients }] = await Promise.all([
    ctx.supabase.from("production_sessions")
      .select("id, kind, title, client_id, starts_at, ends_at, location, address, meeting_point, contacts, checklist, notes, cancelled_at, cancel_reason, session_participants(user_id, role_note), session_works(work_id, works(id, title, status))")
      .eq("id", id).maybeSingle(),
    getWorkContext(ctx),
  ]);
  if (!s) notFound();
  const participants = (s.session_participants ?? []) as { user_id: string; role_note: string | null }[];
  const linked = (s.session_works ?? []) as unknown as { work_id: string; works: { id: string; title: string; status: string } | null }[];
  const [conflictsRes, allWorks] = isAdmin && !s.cancelled_at
    ? await Promise.all([ctx.supabase.rpc("session_conflicts", { p_session: id }), listWorks(ctx, { scope: "all" })])
    : [{ data: [] }, []];
  const conflicts = (conflictsRes.data ?? []) as Conflict[];
  const day = localDate(s.starts_at);
  const clientName = s.client_id ? clients.get(s.client_id) : undefined;
  return (
    <>
      <PageHeader eyebrow={`Calendário / ${SESSION_KIND[s.kind] ?? s.kind}`} title={s.title} description={clientName ?? "Compromisso interno"} />
      {s.cancelled_at && <div className="mb-4"><Alert tone="warning" title="Sessão cancelada">{s.cancel_reason}</Alert></div>}
      {conflicts.length > 0 && (
        <div className="mb-4"><Alert tone="warning" title="Avisos de agenda">
          <ul className="list-disc pl-5">{conflicts.map((c, i) => <li key={i}>{c.name}: {c.kind === "absence" ? `ausência registrada (${c.title})` : `outra sessão no mesmo horário (“${c.title}”)`}</li>)}</ul>
        </Alert></div>
      )}
      <Card className="mb-4">
        <p className="font-display text-2xl font-bold tabular">{formatTime(s.starts_at)}–{formatTime(s.ends_at)}</p>
        <p className="text-muted">{formatDayLabel(day)}</p>
        <dl className="mt-4 grid gap-3 text-[15px] sm:grid-cols-2">
          {s.location && <div><dt className="text-xs text-muted">Local</dt><dd>{s.location}</dd></div>}
          {s.address && <div><dt className="text-xs text-muted">Endereço</dt><dd><a href={mapsUrl(s.address)} target="_blank" rel="noopener noreferrer" className="text-link underline">{s.address}</a></dd></div>}
          {s.meeting_point && <div><dt className="text-xs text-muted">Ponto de encontro</dt><dd>{s.meeting_point}</dd></div>}
          {s.contacts && <div><dt className="text-xs text-muted">Contato no local</dt><dd className="whitespace-pre-line">{s.contacts}</dd></div>}
        </dl>
        {s.checklist && (
          <div className="mt-4"><p className="text-xs text-muted">Checklist</p>
            <ul className="mt-1 list-disc pl-5 text-[15px]">{s.checklist.split("\n").filter((l: string) => l.trim()).map((l: string, i: number) => <li key={i}>{l}</li>)}</ul></div>
        )}
        {s.notes && <p className="mt-4 whitespace-pre-line text-[15px]">{s.notes}</p>}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Equipe</CardTitle>
          <ul className="flex flex-col gap-1 text-[15px]">
            {participants.map((p) => <li key={p.user_id}>{peopleById.get(p.user_id)?.full_name ?? "—"}{p.role_note && <span className="text-muted"> · {p.role_note}</span>}</li>)}
          </ul>
        </Card>
        <Card>
          <CardTitle className="mb-3">Trabalhos ligados</CardTitle>
          {linked.length === 0 ? <p className="text-sm text-muted">Nenhum trabalho ligado.</p> : (
            <ul className="flex flex-col gap-1 text-[15px]">
              {linked.filter((l) => l.works).map((l) => <li key={l.work_id}><Link href={`/trabalhos/${l.work_id}`} className="text-link underline">{l.works!.title}</Link></li>)}
            </ul>
          )}
          {s.client_id && clientName && <p className="mt-3 text-sm"><Link href={`/kits/${s.client_id}`} className="font-semibold text-link hover:underline">Kit do cliente</Link></p>}
        </Card>
      </div>
      {isAdmin && !s.cancelled_at && (
        <Card className="mt-4">
          <details><summary className="cursor-pointer text-sm font-semibold text-link">Editar sessão</summary><div className="mt-4">
            <SessionForm sessionId={s.id} people={people} clients={[...clients.entries()].map(([cid, n]) => ({ id: cid, name: n }))}
              works={allWorks.map((w) => ({ id: w.id, title: w.title, client: w.client_id ? clients.get(w.client_id) : undefined }))}
              values={{ ...s, date: day, start_time: formatTime(s.starts_at), end_time: formatTime(s.ends_at),
                participants: participants.map((p) => p.user_id), works: linked.map((l) => l.work_id) }} /></div></details>
          <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-danger">Cancelar sessão</summary><div className="mt-3"><CancelSessionForm sessionId={s.id} /></div></details>
        </Card>
      )}
    </>
  );
}
