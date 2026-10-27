"use client";

export default function ProtectedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-sm text-muted">
        {typeof navigator !== "undefined" && !navigator.onLine ? "Você está sem conexão. Nenhuma operação foi registrada." : "Não foi possível carregar esta tela."}
        {error.digest && <span className="block text-xs">Referência: {error.digest}</span>}
      </p>
      <button onClick={reset} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">Tentar novamente</button>
    </div>
  );
}
