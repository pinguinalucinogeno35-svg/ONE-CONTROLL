import { requireActiveUser } from "@/server/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { PeriodFilter } from "@/components/layout/period-filter";
import { REPORTS } from "@/server/services/reports";
import { resolvePeriod } from "@/lib/dates";

export const metadata = { title: "Relatórios" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const ctx = await requireActiveUser();
  const sp = await searchParams;
  const period = resolvePeriod(sp.periodo, sp.de, sp.ate);
  const list = Object.entries(REPORTS).filter(([, d]) => !d.adminOnly || ctx.profile.role === "admin");
  const qs = (fmt: string) => new URLSearchParams({ periodo: "custom", de: period.from, ate: period.to, formato: fmt }).toString();
  return (
    <>
      <PageHeader eyebrow="Gestão / Relatórios" title="Relatórios" description={ctx.profile.role === "admin" ? "Exportações completas da organização" : "Exportações limitadas à sua carteira"} />
      <PeriodFilter basePath="/relatorios" current={period.key} from={period.from} to={period.to} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map(([key, d]) => (
          <li key={key}><Card className="flex h-full flex-col gap-2">
            <p className="font-medium">{d.title}</p>
            <p className="flex-1 text-sm text-muted">{d.description}</p>
            <div className="flex gap-2">
              <a className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-elevated" href={`/api/exports/${key}?${qs("csv")}`}>CSV</a>
              <a className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-elevated" href={`/api/exports/${key}?${qs("xlsx")}`}>XLSX</a>
            </div>
          </Card></li>
        ))}
      </ul>
    </>
  );
}
