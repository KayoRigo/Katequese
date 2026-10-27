// =====================================================================
// sw.js — service worker da Katequese (faz o site funcionar como app instalado).
// Estratégia: sempre pede a versão nova ao servidor. Se não tiver internet,
// usa a última cópia guardada. Pedidos ao Supabase e a CDNs não passam por aqui.
// A versão nova só assume depois que a pessoa clica em "Atualizar" no aviso.
// =====================================================================

const CACHE = "katequese";

self.addEventListener("message", (e) => {
  if (e.data === "pular-espera") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(e.request).then((guardada) => guardada || caches.match("/paginas/index.html")))
  );
});
