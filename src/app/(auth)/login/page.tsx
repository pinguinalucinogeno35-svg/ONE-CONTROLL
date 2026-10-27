import { Alert } from "@/components/ui";
import { LoginForm } from "@/features/auth/login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Entrar</h1>
      {erro === "inativo" && (
        <div className="mb-4"><Alert tone="warning">Sua conta está inativa ou ainda não foi liberada. Procure um administrador.</Alert></div>
      )}
      <LoginForm next={next} />
      <p className="mt-6 text-center text-xs text-muted">Não há cadastro público. Novos colaboradores são convidados pela administração.</p>
    </>
  );
}
