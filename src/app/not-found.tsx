import Link from "next/link";

export default function NotFound() {
  return (
    <main id="conteudo" className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Registro não encontrado</h1>
      <p className="text-sm text-muted">O conteúdo não existe ou você não tem permissão para acessá-lo.</p>
      <Link href="/dashboard" className="text-primary underline">Voltar ao dashboard</Link>
    </main>
  );
}
