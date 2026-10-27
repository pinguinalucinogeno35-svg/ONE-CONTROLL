import { requireActiveUser } from "@/server/auth/session";
import { navigationFor } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/labels";
import { AppShell } from "@/components/layout/app-shell";

// Todas as páginas protegidas são dinâmicas e nunca cacheadas.
export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireActiveUser();
  const [{ count }] = await Promise.all([
    ctx.supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ctx.supabase.rpc("touch_last_active"),
  ]);
  return (
    <AppShell nav={navigationFor(ctx.profile.role)} user={{ name: ctx.profile.full_name, roleLabel: ROLE_LABEL[ctx.profile.role] ?? "" }} unread={count ?? 0}>
      {children}
    </AppShell>
  );
}
