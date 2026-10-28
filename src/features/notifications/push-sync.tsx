"use client";

import { useEffect } from "react";
import { savePushSubscriptionAction } from "./actions";
import { currentSubscription, subscriptionPayload } from "./push-client";

/**
 * Mantém a inscrição deste dispositivo vinculada a quem está logado
 * (chaves renovadas pelo navegador ou troca de usuário no mesmo aparelho).
 * Roda ao abrir o app (o layout persiste na navegação); nunca pede permissão.
 */
export function PushSync() {
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    currentSubscription()
      .then((sub) => (sub ? savePushSubscriptionAction(subscriptionPayload(sub)) : null))
      .catch(() => undefined);
  }, []);
  return null;
}
