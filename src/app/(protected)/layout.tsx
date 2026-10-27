import { cookies } from "next/headers";
import { requireActiveUser } from "@/server/auth/session";
import { navigationFor } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/labels";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { THEME_COOKIE, type ThemePreference } from "@/lib/theme";

// Todas as páginas protegidas são dinâmicas e nunca cacheadas.
export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireActiveUser();
  const [{ count }, , jar] = await Promise.all([
    ctx.supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ctx.supabase.rpc("touch_last_active"),
    cookies(),
  ]);
  const raw = jar.get(THEME_COOKIE)?.value;
  const theme: ThemePreference = raw === "light" || raw === "dark" ? raw : "system";
  return (
    <AppShell nav={navigationFor(ctx.profile.role)} user={{ name: ctx.profile.full_name, roleLabel: ROLE_LABEL[ctx.profile.role] ?? "" }}
      unread={count ?? 0} theme={theme === "system" ? undefined : theme} themeSwitcher={<ThemeSwitcher current={theme} />}>
      {children}
    </AppShell>
  );
}
