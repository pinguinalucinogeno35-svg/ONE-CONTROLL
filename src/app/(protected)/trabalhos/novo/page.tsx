import { requireAdmin } from "@/server/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { WorkForm } from "@/features/works/forms";
import { getWorkContext } from "@/server/services/works";

export const metadata = { title: "Novo trabalho" };

export default async function NewWorkPage() {
  const ctx = await requireAdmin();
  const { people, clients } = await getWorkContext(ctx);
  return (
    <>
      <PageHeader eyebrow="Produção / Trabalhos" title="Novo trabalho"
        description="Prepare a ficha com tudo o que a pessoa precisa para produzir. Itens de conteúdo e materiais podem ser completados depois." />
      <Card><WorkForm people={people} clients={[...clients.entries()].map(([id, name]) => ({ id, name }))} /></Card>
    </>
  );
}
