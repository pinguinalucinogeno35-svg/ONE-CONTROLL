import { Alert } from "@/components/ui";
import { RecoverForm } from "@/features/auth/simple-forms";

export const metadata = { title: "Recuperar acesso" };

export default async function RecoverPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <>
      <h1 className="mb-2 font-display text-2xl font-bold tracking-[-0.01em]">Recuperar acesso</h1>
      <p className="mb-4 text-sm text-muted">Enviaremos um link seguro e temporário para redefinir sua senha.</p>
      {erro === "link" && (
        <div className="mb-4"><Alert tone="warning">O link expirou ou já foi usado. Solicite um novo abaixo e use apenas o e-mail mais recente.</Alert></div>
      )}
      <RecoverForm />
    </>
  );
}
