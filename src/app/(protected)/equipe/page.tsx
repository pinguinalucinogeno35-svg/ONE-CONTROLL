import { requireAdmin } from "@/server/auth/session";
import { Alert, Badge, Card, CardTitle, DataTable, PageHeader } from "@/components/ui";
import { AbsenceForm } from "@/features/team/forms";
import { AbsenceList } from "@/features/team/absence-list";
import { getUpcomingAbsences } from "@/server/services/team";
import { formatWeeklyHours } from "@/lib/availability";
import { formatDate, todayISO } from "@/lib/dates";
import { ROLE_LABEL, WORK_FUNCTION, WORK_MODE } from "@/lib/labels";

export const metadata = { title: "Equipe" };

type Row = {
  user_id: string; full_name: string; role: string; status: string; primary_function: string | null; secondary_function: string | null;
  works_onsite: boolean; works_remote: boolean; works_external: boolean;
  weekly_minutes: number | null; onsite_minutes: number | null; remote_minutes: number | null; external_minutes: number | null;
  weekly_hours_declared: number | null; onboarding_completed: boolean; next_absence_start: string | null; next_absence_end: string | null;
};

function hours(r: Row) {
  if (r.weekly_minutes !== null) return formatWeeklyHours(r.weekly_minutes);
  if (r.weekly_hours_declared !== null) return `~${String(r.weekly_hours_declared).replace(".", ",")} h (declarado)`;
  return "Não informado";
}

export default async function TeamPage() {
  const ctx = await requireAdmin();
  const today = todayISO();
  const [{ data, error }, absences] = await Promise.all([ctx.supabase.rpc("team_overview"), getUpcomingAbsences(ctx, today, false)]);
  const rows = (data ?? []) as Row[];
  return (
    <>
      <PageHeader eyebrow="Gestão / Equipe" title="Equipe"
        description="Função principal (preferência de interface), formatos, horas disponíveis e ausências. Horas sobrepostas contam uma vez." />
      {error ? <Alert tone="danger">Não foi possível carregar a equipe.</Alert> : (
        <DataTable caption="Equipe" rows={rows} rowKey={(r) => r.user_id} empty="Nenhum colaborador ativo." columns={[
          { key: "n", header: "Pessoa", cell: (r) => <span className="font-medium">{r.full_name}</span> },
          { key: "r", header: "Papel", cell: (r) => <Badge tone="info">{ROLE_LABEL[r.role] ?? r.role}</Badge> },
          { key: "f", header: "Função", cell: (r) => r.primary_function ? `${WORK_FUNCTION[r.primary_function]}${r.secondary_function ? ` · ${WORK_FUNCTION[r.secondary_function]}` : ""}` : <span className="text-muted">Não informado</span> },
          { key: "m", header: "Formato", cell: (r) => [r.works_onsite && "onsite", r.works_remote && "remote", r.works_external && "external"].filter(Boolean).map((m) => WORK_MODE[m as string]).join(", ") || <span className="text-muted">—</span> },
          { key: "h", header: "Horas/semana", cell: (r) => <span className="tabular">{hours(r)}</span> },
          { key: "a", header: "Próxima ausência", cell: (r) => r.next_absence_start ? (r.next_absence_start === r.next_absence_end ? formatDate(r.next_absence_start) : `${formatDate(r.next_absence_start)} a ${formatDate(r.next_absence_end)}`) : <span className="text-muted">—</span> },
          { key: "o", header: "Primeiro acesso", cell: (r) => r.onboarding_completed ? <Badge tone="success">Concluído</Badge> : <Badge>Pendente</Badge> },
        ]} />
      )}
      <Card className="mt-6">
        <CardTitle className="mb-4">Registrar ausência</CardTitle>
        <AbsenceForm people={rows.map((r) => ({ id: r.user_id, full_name: r.full_name }))} />
        <h3 className="mb-2 mt-6 text-sm font-semibold text-muted">Ausências programadas</h3>
        <AbsenceList items={absences} showName />
      </Card>
    </>
  );
}
