import { RecoverForm } from "@/features/auth/simple-forms";

export const metadata = { title: "Recuperar acesso" };

export default function RecoverPage() {
  return (
    <>
      <h1 className="mb-2 font-display text-2xl font-bold tracking-[-0.01em]">Recuperar acesso</h1>
      <p className="mb-4 text-sm text-muted">Enviaremos um link seguro e temporário para redefinir sua senha.</p>
      <RecoverForm />
    </>
  );
}
