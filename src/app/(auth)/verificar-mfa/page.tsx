import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/session";
import { MfaForm } from "@/features/auth/mfa-form";
import { signOut } from "@/features/auth/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificação em duas etapas" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = rawNext && /^\/[a-z0-9\-/]*$/i.test(rawNext) ? rawNext : "/dashboard";
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.profile) redirect("/login?erro=inativo");
  const isAdmin = ctx.profile.role === "admin";
  if (ctx.aal === "aal2" || (!isAdmin && !ctx.mfaEnrolled)) redirect(next);
  return (
    <>
      <h1 className="mb-2 font-display text-2xl font-bold tracking-[-0.01em]">Verificação em duas etapas</h1>
      <p className="mb-4 text-sm text-muted">Olá, {ctx.profile.full_name.split(" ")[0]}. Confirme sua identidade para continuar.</p>
      <MfaForm next={next} mustEnroll={isAdmin} />
      <form action={signOut} className="mt-4 text-center">
        <button className="text-sm text-muted hover:text-fg">Sair</button>
      </form>
    </>
  );
}
