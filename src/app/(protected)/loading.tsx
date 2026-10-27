export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Carregando…</span>
      <div className="h-8 w-48 animate-pulse rounded bg-elevated" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface" />)}
      </div>
      <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-surface" />
    </div>
  );
}
