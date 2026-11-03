import Link from "next/link";
import type { ActiveContext } from "@/server/auth/session";
import { Card, CardTitle } from "@/components/ui";
import { getWorkContext, listWorks, workState } from "@/server/services/works";
import { nextAction } from "@/lib/works";
import { todayISO } from "@/lib/dates";
import { WorkCard } from "./work-card";

/** Início: trabalhos em que a pessoa tem a próxima ação (executar ou revisar). */
export async function MyWorks({ ctx }: { ctx: ActiveContext }) {
  const [mine, review, { peopleById, clients }] = await Promise.all([
    listWorks(ctx, { scope: "mine" }), listWorks(ctx, { scope: "review" }), getWorkContext(ctx),
  ]);
  const byId = new Map([...mine, ...review].map((w) => [w.id, w]));
  const rows = [...byId.values()]
    .map((w) => ({ w, s: workState(w, ctx) }))
    .filter(({ s }) => nextAction(s).mine)
    .slice(0, 5);
  const today = todayISO();
  return (
    <Card className="mb-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Meus trabalhos</CardTitle>
        <Link href="/trabalhos?ver=meus" className="text-sm font-semibold text-link hover:underline">Ver todos</Link>
      </div>
      {rows.length === 0 ? <p className="text-muted">Nenhum trabalho esperando por você.</p> : (
        <div className="flex flex-col gap-3">
          {rows.map(({ w, s }) => <WorkCard key={w.id} work={w} state={s} clientName={w.client_id ? clients.get(w.client_id) : undefined} people={peopleById} today={today} />)}
        </div>
      )}
    </Card>
  );
}
