export const dynamic = "force-static";
export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold tracking-[0.3em] text-muted">ONE CONTROL</p>
      <h1 className="text-2xl font-semibold">Você está sem conexão</h1>
      <p className="text-muted">
        Por segurança, dados de clientes e informações financeiras não ficam salvos no dispositivo. Reconecte-se à internet para continuar.
        Nenhuma operação foi registrada offline.
      </p>
      <a href="/dashboard" className="rounded-lg bg-primary px-4 py-3 font-medium text-white">Tentar novamente</a>
    </main>
  );
}
