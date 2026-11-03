import { requireActiveUser } from "@/server/auth/session";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { AbsenceForm, TeamProfileForm } from "@/features/team/forms";
import { AbsenceList } from "@/features/team/absence-list";
import { getMyTeamProfile, getUpcomingAbsences } from "@/server/services/team";
import { todayISO } from "@/lib/dates";

export const metadata = { title: "Meu perfil" };

export default async function MyProfilePage() {
  const ctx = await requireActiveUser();
  const [profile, absences] = await Promise.all([getMyTeamProfile(ctx), getUpcomingAbsences(ctx, todayISO(), true)]);
  return (
    <>
      <PageHeader eyebrow="Conta / Perfil de trabalho" title="Meu perfil"
        description="Sua função personaliza atalhos e a disponibilidade ajuda a gestão a distribuir o trabalho. Nenhum desses dados muda suas permissões." />
      <Card className="mb-6"><CardTitle className="mb-4">Perfil de trabalho</CardTitle><TeamProfileForm values={profile ?? {}} /></Card>
      <Card>
        <CardTitle className="mb-1">Minhas ausências</CardTitle>
        <p className="mb-4 text-sm text-muted">Férias, folgas ou compromissos que impedem o trabalho no período.</p>
        <AbsenceForm />
        <div className="mt-6"><AbsenceList items={absences} /></div>
      </Card>
    </>
  );
}
