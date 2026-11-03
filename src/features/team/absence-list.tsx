import { ActionButton } from "@/components/ui/server-form";
import { formatDate } from "@/lib/dates";
import type { Absence } from "@/server/services/team";
import { cancelAbsenceAction } from "./actions";

export function AbsenceList({ items, showName }: { items: Absence[]; showName?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted">Nenhuma ausência programada.</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
          <span>
            {showName && <strong className="mr-2">{a.profiles?.full_name ?? "—"}</strong>}
            {a.starts_on === a.ends_on ? formatDate(a.starts_on) : `${formatDate(a.starts_on)} a ${formatDate(a.ends_on)}`}
            {a.reason && <span className="text-muted"> · {a.reason}</span>}
          </span>
          <ActionButton action={cancelAbsenceAction.bind(null, a.id)} label="Cancelar" confirm="Cancelar esta ausência?" />
        </li>
      ))}
    </ul>
  );
}
