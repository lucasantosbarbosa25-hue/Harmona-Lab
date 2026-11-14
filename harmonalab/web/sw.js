// Service worker: guarda o app no aparelho para abrir rápido e funcionar sem internet.
// Estratégia "stale-while-revalidate": responde com a cópia guardada e, ao mesmo tempo,
// busca a versão nova na rede — a atualização aparece na próxima vez que o app abrir.

const CACHE = "harmona-lab-v57";
// O tocador de banco de sons (vendor/) fica fora da lista: só baixa quando alguém usa um .sf2, e aí fica guardado
// pela estratégia abaixo (toda resposta boa vai para o cache), funcionando também sem internet.
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./audio.js", "./voz.js", "./canto-gravador.js", "./diagram.js", "./keyboard.js", "./sound.js",
  "./engine/analysis.js", "./engine/canto.js", "./engine/midi.js", "./engine/model.js", "./engine/groove.js", "./engine/numbers.js", "./engine/phrase.js", "./engine/pitch.js", "./engine/voicing.js",
  "./partes.js", "./tom.js", "./engine/midi-read.js", "./engine/segunda.js", "./engine/riff.js", "./ai/chat.js", "./ai/check.js", "./ai/link.js", "./ai/prompt.js", "./ai/speech.js", "./ai/ui.js", "./kb/estilos.js", "./kb/fraseado.js", "./kb/sons.js",
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
