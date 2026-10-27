import { BrandMark } from "@/components/layout/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="conteudo" className="flex min-h-dvh flex-col bg-bg px-5 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center">
        <p className="eyebrow mb-6 text-link">ONE / Acesso restrito</p>
        <div className="mb-8"><BrandMark size="lg" subtitle="ONE CONTROL · Gestão corporativa" /></div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 sm:p-8">{children}</div>
        <p className="eyebrow mt-8 text-muted">Feita para ser escolhida.</p>
      </div>
    </main>
  );
}
