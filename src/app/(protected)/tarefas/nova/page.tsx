import { requireActiveUser } from "@/server/auth/session";
import { Alert, Card, PageHeader } from "@/components/ui";
import { NewTaskForm } from "@/features/tasks/forms";
import { getPeople, getUsableGroups } from "@/server/services/tasks";

export const metadata = { title: "Nova tarefa" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ grupo?: string; para?: string }> }) {
  const ctx = await requireActiveUser();
  const { grupo, para } = await searchParams;
  const [groups, people] = await Promise.all([getUsableGroups(ctx), getPeople(ctx)]);
  const active = [...people.values()].filter((p) => p.active);
  const isAdmin = ctx.profile.role === "admin";
  return (
    <>
      <PageHeader eyebrow="Operação / Nova tarefa" title="Nova tarefa" description="Escolha o grupo e o responsável. A pessoa recebe uma notificação personalizada." />
      {groups.length === 0 ? (
        <Alert tone="warning" title="Nenhum grupo disponível">
          {isAdmin ? "Crie o primeiro grupo em Tarefas → Grupos." : "A administração ainda não liberou grupos para vendedores."}
        </Alert>
      ) : (
        <Card className="max-w-3xl">
          <NewTaskForm groups={groups} people={active} meId={ctx.userId} isAdmin={isAdmin}
            defaults={{ group_id: groups.some((g) => g.id === grupo) ? grupo : undefined, assigned_to: active.some((p) => p.id === para) ? para : undefined }} />
        </Card>
      )}
    </>
  );
}
