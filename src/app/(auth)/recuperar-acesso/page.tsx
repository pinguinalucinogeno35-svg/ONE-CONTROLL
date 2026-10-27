import { RecoverForm } from "@/features/auth/simple-forms";

export const metadata = { title: "Recuperar acesso" };

export default function RecoverPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Recuperar acesso</h1>
      <p className="mb-4 text-sm text-muted">Enviaremos um link seguro e temporário para redefinir sua senha.</p>
      <RecoverForm />
    </>
  );
}
