import { redirect } from "next/navigation";
import { requireActiveUser } from "@/server/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { TeamProfileForm } from "@/features/team/forms";
import { getMyTeamProfile } from "@/server/services/team";

export const metadata = { title: "Primeiro acesso" };

export default async function OnboardingPage() {
  const ctx = await requireActiveUser();
  const profile = await getMyTeamProfile(ctx);
  if (profile?.onboarding_completed_at) redirect("/dashboard");
  return (
    <>
      <PageHeader eyebrow="Primeiro acesso / 1 passo" title={`Bem-vindo(a), ${ctx.profile.full_name.split(" ")[0]}`}
        description="Conte sua função principal e quando você está disponível. Leva menos de 2 minutos e pode ser alterado depois em Meu perfil." />
      <Card><TeamProfileForm values={profile ?? {}} onboarding /></Card>
    </>
  );
}
