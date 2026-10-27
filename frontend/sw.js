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

// ---------------- Notificações ----------------
self.addEventListener("push", (e) => {
  let dados = {};
  try { dados = e.data ? e.data.json() : {}; } catch (_) { dados = { texto: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(dados.titulo || "Katequese", {
    body: dados.texto || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: dados.url || "/paginas/index.html" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || "/paginas/index.html", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
    const aberta = abertas.find((c) => c.url.startsWith(self.location.origin));
    if (aberta) return aberta.focus().then(() => aberta.navigate(destino).catch(() => {}));
    return self.clients.openWindow(destino);
  }));
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
