export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="conteudo" className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold tracking-[0.35em] text-primary">ONE</p>
          <p className="text-2xl font-semibold tracking-tight">ONE CONTROL</p>
          <p className="mt-1 text-sm text-muted">Gestão Corporativa · acesso restrito a colaboradores</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6">{children}</div>
      </div>
    </main>
  );
}
