import { BrandMark } from "@/components/layout/brand";

export const dynamic = "force-static";
export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 bg-bg px-5">
      <BrandMark />
      <h1 className="font-display text-[28px] font-bold leading-8 tracking-[-0.02em]">Você está sem conexão</h1>
      <p className="text-muted">
        Por segurança, dados de clientes e informações financeiras não ficam salvos no dispositivo. Reconecte-se à internet para continuar.
        Nenhuma operação foi registrada offline.
      </p>
      <div><a href="/dashboard" className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-primary px-5 font-semibold text-on-primary">Tentar novamente</a></div>
    </main>
  );
}
