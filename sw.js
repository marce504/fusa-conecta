// Service Worker de Fusa Conecta: app instalable y disponible sin conexión (RNF-02).
// - La interfaz, los datos base y las emergencias se guardan al instalar.
// - Las fotos, mapas y librerías se guardan la primera vez que se ven.
const VERSION = 'fusa-v60';
const CACHE_APP = VERSION + '-app';
const CACHE_RUNTIME = VERSION + '-runtime';
const CACHE_MAPAS = VERSION + '-mapas';
const MAX_TESELAS = 400;

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './app.css',
  './datos.js',
  './icons.js',
  './lib/qrcode.min.js',
  './lib/jsQR.js',
  './manifest.json',
  './limites.geojson',
  './img/icons/icon-192.png',
  './img/icons/icon-512.png',
  './img/icons/apple-touch-icon.png',
  './img/icons/favicon.svg',
  './logo.png',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
];

// Servicios en vivo que nunca se guardan en caché
const SIN_CACHE =
  /firestore\.googleapis\.com|fcm\.googleapis\.com|fcmregistrations\.googleapis\.com|firebaseinstallations\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|apis\.google\.com|accounts\.google\.com|firebaseapp\.com\/__\/|\/__\/(auth|firebase)\/|127\.0\.0\.1:(8099|9099)|estructuraweb\.com\.co|fusa-conecta-api\.onrender\.com|127\.0\.0\.1:8000/;

self.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open(CACHE_APP)
      .then(c => Promise.all(APP_SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function recortar(nombre, max) {
  const c = await caches.open(nombre);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

function guardar(nombre, req, r) {
  if (r && (r.ok || r.type === 'opaque')) {
    const copia = r.clone();
    caches.open(nombre).then(c => c.put(req, copia));
  }
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || SIN_CACHE.test(req.url)) return;
  const url = new URL(req.url);
  const propio = url.origin === location.origin;

  // Páginas y código propio: primero la red (siempre la versión publicada), sin conexión la copia guardada
  if (req.mode === 'navigate' || (propio && !url.pathname.includes('/img/'))) {
    e.respondWith(
      fetch(req.mode === 'navigate' ? req : new Request(req.url, { cache: 'no-cache' }))
        .then(r => guardar(CACHE_APP, req.mode === 'navigate' ? './index.html' : req, r))
        .catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req, { ignoreSearch: true })),
    );
    return;
  }

  // Teselas del mapa: caché primero, con límite de tamaño
  if (
    url.hostname.endsWith('tile.openstreetmap.org') ||
    url.hostname.endsWith('tiles.openfreemap.org') ||
    url.pathname.startsWith('/elevation-tiles-prod/')
  ) {
    e.respondWith(
      caches.match(req).then(
        hit =>
          hit ||
          fetch(req).then(r => {
            guardar(CACHE_MAPAS, req, r);
            recortar(CACHE_MAPAS, MAX_TESELAS);
            return r;
          }),
      ),
    );
    return;
  }

  // Fotos y librerías externas: responde con la copia y la actualiza en segundo plano
  e.respondWith(
    caches.match(req).then(hit => {
      const red = fetch(req)
        .then(r => guardar(CACHE_RUNTIME, req, r))
        .catch(() => hit);
      return hit || red;
    }),
  );
});

// Avisos al celular (FCM, v1.2.0). La API manda solo datos {titulo, texto, enlace, etiqueta, icono}; aquí se arma el aviso
// con el ícono de la marca. Funciona con la app cerrada (Android, computador y iPhone con la app instalada, iOS 16.4+).
self.addEventListener('push', e => {
  let d = {};
  try {
    const j = e.data ? e.data.json() : {};
    d = j.data || j.notification || j;
  } catch {
    d = { texto: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || d.title || 'Fusa Conecta', {
      body: d.texto || d.body || '',
      icon: './img/icons/icon-192.png',
      badge: './img/icons/icon-192.png',
      tag: d.etiqueta || 'fusa-aviso',
      lang: 'es-CO',
      data: { enlace: d.enlace || '' },
    }),
  );
});

// Al tocar un aviso se abre la app en la pantalla indicada (p. ej. #/mi-negocio). Si ya estaba abierta, se enfoca y se le
// pasa la pantalla por mensaje (cambiarle la dirección dispararía «Atrás» dentro de la app).
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const enlace = (e.notification.data && e.notification.data.enlace) || '';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const c = cs.find(x => x.url.startsWith(self.registration.scope));
      if (!c) return self.clients.openWindow(new URL('./' + enlace, self.registration.scope).href);
      if (enlace) c.postMessage({ tipo: 'aviso', enlace });
      return c.focus();
    }),
  );
});
