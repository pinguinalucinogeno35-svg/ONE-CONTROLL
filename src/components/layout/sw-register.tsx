"use client";

import { useEffect, useState } from "react";

/** Registra o Service Worker e avisa quando há nova versão disponível. */
export function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
      }).catch(() => undefined);
      // Recarrega apenas quando uma versão nova assume (não na primeira instalação).
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hadController && !reloaded) { reloaded = true; window.location.reload(); }
      });
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <>
      {offline && (
        <div role="status" className="fixed inset-x-0 top-0 z-50 bg-warning px-4 py-2 text-center text-sm font-medium text-black">
          Sem conexão. Consultas e lançamentos financeiros exigem internet — nada será salvo offline.
        </div>
      )}
      {waiting && (
        <div role="status" className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-elevated px-4 py-3 text-sm shadow-lg md:bottom-6">
          Nova versão disponível.
          <button className="rounded-md bg-primary px-3 py-1.5 font-medium text-white" onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}>
            Atualizar
          </button>
        </div>
      )}
    </>
  );
}
