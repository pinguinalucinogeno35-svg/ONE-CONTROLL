"use client";

/** Utilitários de Web Push no navegador (sem segredos: só a chave pública VAPID). */
export type PushSupport = "supported" | "unsupported" | "ios-install";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  // iPhone/iPad (iOS 16.4+) só permite push no app instalado na tela de início.
  if (ios && !standalone) return "ios-install";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "supported" : "unsupported";
}

export async function currentRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await currentRegistration();
  return reg?.pushManager ? reg.pushManager.getSubscription() : null;
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function subscriptionPayload(sub: PushSubscription) {
  const json = sub.toJSON();
  return { endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 300) };
}

/** Cancela a inscrição deste navegador (usado ao sair da conta). */
export async function unsubscribeDevice(): Promise<string | null> {
  try {
    const sub = await currentSubscription();
    if (!sub) return null;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    return endpoint;
  } catch {
    return null;
  }
}
