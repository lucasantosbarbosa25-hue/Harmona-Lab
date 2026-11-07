// Service worker: guarda o app no aparelho para abrir rápido e funcionar sem internet.
// Estratégia "stale-while-revalidate": responde com a cópia guardada e, ao mesmo tempo,
// busca a versão nova na rede — a atualização aparece na próxima vez que o app abrir.

const CACHE = "harmona-lab-v3";
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./audio.js", "./keyboard.js",
  "./engine/analysis.js", "./engine/midi.js", "./engine/model.js", "./engine/numbers.js", "./engine/pitch.js",
  "./example.json", "./manifest.webmanifest", "./icon.svg",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    const network = fetch(request)
      .then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const fresh = await network;
    if (fresh) return fresh;
    if (request.mode === "navigate") return (await cache.match("./")) || Response.error();
    return Response.error();
  })());
});
