import { notFound } from "next/navigation";
import { requireActiveUser } from "@/server/auth/session";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { KitAssetForm, KitForm } from "@/features/kits/forms";
import { KitView } from "@/features/kits/kit-view";
import { getKit } from "@/server/services/kits";
import { getClientNames } from "@/server/services/works";
import { formatDateTime } from "@/lib/dates";
import { isCommercialRole } from "@/lib/permissions";
import { uuid } from "@/lib/validation/schemas";

export const metadata = { title: "Kit do cliente" };

export default async function ClientKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await requireActiveUser();
  const [{ kit, assets }, names] = await Promise.all([getKit(ctx, id), getClientNames(ctx)]);
  // Edição: administração ou vendedor responsável (RLS só devolve o cliente a quem pode vê-lo comercialmente).
  let canEdit = false;
  let name = names.get(id);
  if (isCommercialRole(ctx.profile.role)) {
    const { data } = await ctx.supabase.from("clients").select("id, company_name").eq("id", id).maybeSingle();
    canEdit = !!data;
    name = name ?? data?.company_name;
  }
  if (!name) notFound(); // sem trabalho visível nem carteira: não existe para esta pessoa (T06)
  return (
    <>
      <PageHeader eyebrow="Produção / Kit do cliente" title={name}
        description={kit ? `Atualizado em ${formatDateTime(kit.updated_at)}. Materiais ficam no armazenamento autorizado; os links respeitam as permissões de cada serviço.` : undefined} />
      <Card className="mb-6"><KitView clientId={id} kit={kit} assets={assets} canEdit={canEdit} /></Card>
      {canEdit && (
        <>
          <Card className="mb-6"><CardTitle className="mb-4">Adicionar material</CardTitle><KitAssetForm clientId={id} /></Card>
          <Card><CardTitle className="mb-4">Editar kit</CardTitle><KitForm clientId={id} kit={kit} /></Card>
        </>
      )}
    </>
  );
}
