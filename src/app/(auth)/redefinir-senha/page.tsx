import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "@/features/auth/simple-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Definir senha" };

export default async function NewPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/recuperar-acesso");
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Definir senha</h1>
      <p className="mb-4 text-sm text-muted">Crie uma senha forte e exclusiva para o ONE CONTROL.</p>
      <NewPasswordForm />
    </>
  );
}
