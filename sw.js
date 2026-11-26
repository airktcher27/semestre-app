// Permite abrir la app sin internet. Siempre intenta traer la versión nueva primero.
const CACHE = "semestre-v0.2.0";
const ARCHIVOS = [
  "./", "index.html", "css/estilos.css", "js/app.js", "js/calculos.js",
  "js/comun/sync.js", "js/comun/cifrado.js", "js/comun/github.js",
  "js/nucleo.js", "js/fechas.js", "js/ics.js", "js/recordatorios.js",
  "js/vistas/notas.js", "js/vistas/tareas.js", "js/vistas/calendario.js",
  "js/componentes/composer.js", "js/componentes/popover.js",
  "manifest.webmanifest", "img/icono.svg", "img/icono-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // GitHub API: nunca se cachea
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// Al tocar una notificación, abre (o enfoca) la app en Tareas.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) if ("focus" in v) return v.focus();
      return self.clients.openWindow("./#tareas");
    })
  );
});
