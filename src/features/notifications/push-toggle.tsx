"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Alert, Button, Card, CardTitle } from "@/components/ui";
import { deletePushSubscriptionAction, savePushSubscriptionAction } from "./actions";
import { currentRegistration, currentSubscription, pushSupport, subscriptionPayload, urlBase64ToUint8Array } from "./push-client";

type State = "loading" | "not-configured" | "unsupported" | "ios-install" | "no-worker" | "denied" | "off" | "on";

const NOTES: Partial<Record<State, { tone: "info" | "warning"; text: string }>> = {
  "not-configured": { tone: "info", text: "O envio de notificações push ainda não foi configurado no servidor. Os avisos continuam aparecendo aqui na central." },
  unsupported: { tone: "info", text: "Este navegador não oferece notificações push. Os avisos continuam aparecendo aqui na central." },
  "ios-install": { tone: "info", text: "No iPhone e iPad (iOS 16.4 ou superior), instale o ONE CONTROL na tela de início (Compartilhar → Adicionar à Tela de Início) e ative por lá." },
  "no-worker": { tone: "info", text: "As notificações push funcionam no app publicado (o modo de desenvolvimento não registra o service worker)." },
  denied: { tone: "warning", text: "As notificações estão bloqueadas para este site. Libere nas configurações do navegador e volte aqui." },
};

/** Ativa/desativa push NESTE dispositivo. Cada aparelho é registrado separadamente. */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const support = pushSupport();
      let next: State;
      if (!vapidPublicKey) next = "not-configured";
      else if (support !== "supported") next = support;
      else if (!(await currentRegistration())) next = "no-worker";
      else if (Notification.permission === "denied") next = "denied";
      else next = (await currentSubscription()) && Notification.permission === "granted" ? "on" : "off";
      if (alive) setState(next);
    })().catch(() => alive && setState("unsupported"));
    return () => { alive = false; };
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true); setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return; }
      const reg = await currentRegistration();
      if (!reg) { setState("no-worker"); return; }
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const res = await savePushSubscriptionAction(subscriptionPayload(sub));
      if (!res.ok) { await sub.unsubscribe().catch(() => undefined); setError(res.error); return; }
      setState("on");
    } catch {
      setError("Não foi possível ativar as notificações neste dispositivo.");
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setError(null);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError("Não foi possível desativar as notificações neste dispositivo.");
    } finally { setBusy(false); }
  }

  const note = NOTES[state];
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-xl gap-3">
          <BellRing aria-hidden strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <CardTitle>Notificações neste dispositivo</CardTitle>
            <p className="mt-1 text-sm text-muted">
              Receba avisos de tarefas mesmo com o app fechado. Avisos financeiros aparecem só como texto genérico na tela de bloqueio; os detalhes ficam aqui, após o login.
            </p>
          </div>
        </div>
        {state === "on" && <Button variant="secondary" size="sm" onClick={disable} disabled={busy}>{busy ? "Desativando…" : "Desativar"}</Button>}
        {state === "off" && <Button size="sm" onClick={enable} disabled={busy}>{busy ? "Ativando…" : "Ativar notificações"}</Button>}
      </div>
      <div aria-live="polite" className="mt-3 flex flex-col gap-2 empty:hidden">
        {state === "on" && <p className="text-sm font-semibold text-success">Ativadas neste dispositivo.</p>}
        {note && <Alert tone={note.tone}>{note.text}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Card>
  );
}
