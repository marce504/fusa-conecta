// Fusa Conecta se mudó a https://fusa-conecta.web.app (v6 · Fase 5).
// Este service worker reemplaza al de la app vieja instalada desde Netlify (v29): borra lo que guardó en el
// teléfono, se da de baja y recarga las ventanas abiertas para que vean el aviso con el enlace a la dirección nueva.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k);
      await self.registration.unregister();
      for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
    })(),
  ),
);
