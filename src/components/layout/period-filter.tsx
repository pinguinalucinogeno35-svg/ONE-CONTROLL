import Link from "next/link";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Filtro de período (links GET — funciona sem JavaScript). */
export function PeriodFilter({ basePath, current, from, to }: { basePath: string; current: PeriodKey; from: string; to: string }) {
  const keys: PeriodKey[] = ["today", "7d", "month", "3m", "year"];
  return (
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label="Período" className="flex flex-wrap gap-1.5">
        {keys.map((k) => (
          <Link key={k} href={`${basePath}?periodo=${k}`} aria-current={current === k ? "true" : undefined}
            className={cn("rounded-full border px-3 py-1.5 text-xs", current === k ? "border-primary bg-primary/15 text-fg" : "border-border text-muted hover:text-fg")}>
            {PERIOD_LABELS[k]}
          </Link>
        ))}
      </nav>
      <form action={basePath} className="flex flex-wrap items-end gap-2 text-xs">
        <input type="hidden" name="periodo" value="custom" />
        <label className="flex flex-col gap-1 text-muted">De<input type="date" name="de" defaultValue={from} className="rounded-lg border border-border bg-bg px-2 py-1.5 text-fg" /></label>
        <label className="flex flex-col gap-1 text-muted">Até<input type="date" name="ate" defaultValue={to} className="rounded-lg border border-border bg-bg px-2 py-1.5 text-fg" /></label>
        <button className="rounded-lg border border-border px-3 py-1.5 text-fg hover:bg-elevated">Aplicar</button>
      </form>
    </div>
  );
}
