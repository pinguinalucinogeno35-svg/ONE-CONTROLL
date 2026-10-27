/* ONE CONTROL — Service Worker
 * Política de segurança: armazena SOMENTE recursos estáticos públicos e a
 * página offline. Respostas autenticadas, APIs, Server Actions e documentos
 * HTML com dados NUNCA são armazenados em cache. Operações financeiras exigem
 * conexão (sem fila offline, evitando duplicidade/conflitos).
 */
const VERSION = "one-control-v1";
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
