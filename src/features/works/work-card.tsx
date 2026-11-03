import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { WORK_CATEGORY, WORK_STATUS, label } from "@/lib/labels";
import { isOverdue, nextAction, type WorkState } from "@/lib/works";
import type { WorkRow } from "@/server/services/works";
import type { Person } from "@/server/services/tasks";

/** Cartão: próxima ação, prazo, responsável, cliente e bloqueio — nada além disso. */
export function WorkCard({ work, state, clientName, people, today }: {
  work: WorkRow; state: WorkState; clientName?: string; people: Map<string, Person>; today: string;
}) {
  const [statusLabel, statusTone] = label(WORK_STATUS, work.status);
  const action = nextAction(state);
  const overdue = isOverdue(work.due_current, work.status, today);
  const names = work.work_assignees.map((a) => people.get(a.user_id)?.full_name.split(" ")[0] ?? "—").join(", ");
  return (
    <Card className={action.mine ? "border-primary/60" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/trabalhos/${work.id}`} className="font-display text-lg font-bold leading-6 hover:underline">{work.title}</Link>
          <p className="text-sm text-muted">{[clientName, WORK_CATEGORY[work.category]].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={statusTone}>{statusLabel}</Badge>
          {state.blocked && <Badge tone="danger">Bloqueado</Badge>}
          {work.status === "draft" && state.missingRequired > 0 && <Badge tone="warning">Aguardando material</Badge>}
          {overdue && <Badge tone="danger">Atrasado</Badge>}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-muted">Próxima ação</dt><dd className={action.mine ? "font-semibold text-link" : ""}>{action.label}{action.mine ? " (você)" : ""}</dd></div>
        <div><dt className="text-xs text-muted">Prazo</dt><dd className="tabular">{work.due_current ? formatDate(work.due_current) : "Sem prazo"}</dd></div>
        <div className="col-span-2 sm:col-span-1"><dt className="text-xs text-muted">Responsáveis</dt><dd className="truncate">{names || "A definir"}</dd></div>
      </dl>
      {state.blocked && <p className="mt-2 text-sm text-danger">Bloqueio: {work.blocked_reason}</p>}
    </Card>
  );
}
