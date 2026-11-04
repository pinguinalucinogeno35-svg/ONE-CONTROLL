import { requireAdmin } from "@/server/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { SessionForm } from "@/features/sessions/forms";
import { getWorkContext, listWorks } from "@/server/services/works";

export const metadata = { title: "Agendar sessão" };

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ trabalho?: string }> }) {
  const ctx = await requireAdmin();
  const sp = await searchParams;
  const [{ people, clients }, works] = await Promise.all([getWorkContext(ctx), listWorks(ctx, { scope: "all" })]);
  const linked = works.find((w) => w.id === sp.trabalho);
  return (
    <>
      <PageHeader eyebrow="Produção / Calendário" title="Agendar sessão" description="Uma sessão reúne todas as pessoas do mesmo compromisso, com local, horário e contatos." />
      <Card>
        <SessionForm people={people} clients={[...clients.entries()].map(([id, name]) => ({ id, name }))}
          works={works.map((w) => ({ id: w.id, title: w.title, client: w.client_id ? clients.get(w.client_id) : undefined }))}
          values={linked ? { client_id: linked.client_id, title: linked.title, works: [linked.id], participants: linked.work_assignees.map((a) => a.user_id) } : undefined} />
      </Card>
    </>
  );
}
