/* ONE CONTROL — Service Worker
 * Política de segurança: armazena SOMENTE recursos estáticos públicos e a
 * página offline. Respostas autenticadas, APIs, Server Actions e documentos
 * HTML com dados NUNCA são armazenados em cache. Operações financeiras exigem
 * conexão (sem fila offline, evitando duplicidade/conflitos).
 */
const VERSION = "one-control-v2";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isStaticAsset(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // mutações sempre vão à rede
  const url = new URL(req.url);

  // Assets imutáveis com hash: cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }

  // Navegações: sempre rede; sem conexão → página offline (sem dados).
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
  // Demais requisições (APIs, RSC, Supabase): rede direta, sem cache.
});

/* ---------------------------------------------------------------------------
 * Notificações push. O conteúdo chega cifrado (Web Push) e já vem filtrado
 * pelo servidor: avisos financeiros mostram só um texto genérico. O clique
 * abre a tela interna correspondente — sempre sob login e permissões.
 * ------------------------------------------------------------------------ */
function safePath(url) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/notificacoes";
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === "string" && data.title ? data.title : "ONE CONTROL";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body : "Você tem uma nova notificação.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    lang: "pt-BR",
    data: { url: safePath(data.url) },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const same = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (same) return same.focus().then((w) => (w && "navigate" in w ? w.navigate(target) : undefined));
      return self.clients.openWindow(target);
    }),
  );
});
