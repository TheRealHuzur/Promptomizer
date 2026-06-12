// Kill-Switch Service Worker (Go-Live-Roadmap Punkt 8, 12.06.2026)
//
// Hintergrund: Vom 04.01. bis 16.01.2026 wurde ein Cache-first-Worker
// registriert, der index.html und CDN-Assets dauerhaft cachte. Clients aus
// diesem Zeitfenster haengen ohne Gegenmassnahme fuer immer auf der damals
// gecachten App-Version fest, weil der Browser registrierte Worker behaelt.
//
// Dieser Worker ersetzt den alten (Browser prueft sw.js bei jeder Navigation
// bzw. spaetestens alle 24h auf Aenderungen), loescht alle Caches,
// deregistriert sich selbst und laedt offene Tabs neu. Danach laeuft die App
// ohne Service Worker; neue Releases kommen direkt vom Server.
//
// Solange die App fuer alles Wesentliche eine Supabase-Verbindung braucht,
// bietet ein Offline-Cache keinen Nutzen und schafft nur Staleness-Risiken.
// Falls spaeter wieder ein Worker eingefuehrt wird: Navigationen immer
// network-first ausliefern und keine CDN-Skripte blind cachen.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => client.navigate(client.url));
  })());
});
