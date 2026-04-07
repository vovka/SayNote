const SHELL_CACHE = 'saynote-shell-v2';
const RUNTIME_CACHE = 'saynote-runtime-v2';
const CACHE_PREFIX = 'saynote-';
const APP_SHELL = ['/', '/notes', '/settings'];
const BG_SYNC_TAG = 'saynote-sync';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const active = new Set([SHELL_CACHE, RUNTIME_CACHE]);
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !active.has(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }

  event.respondWith(handleRuntimeRequest(event.request));
});

self.addEventListener('sync', (event) => {
  if (event.tag !== BG_SYNC_TAG) return;
  event.waitUntil(notifyClientsToSync());
});

async function handleNavigationRequest(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put('/', fresh.clone());
    return fresh;
  } catch (_error) {
    const shellFallback = await caches.match(request);
    if (shellFallback) return shellFallback;
    const rootShell = await caches.match('/');
    if (rootShell) return rootShell;
    return new Response('Offline. Open the app while online at least once.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function handleRuntimeRequest(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    void fetchPromise;
    return cached;
  }

  const fresh = await fetchPromise;
  if (fresh) return fresh;
  return new Response('Offline resource unavailable', { status: 503 });
}

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all(
    clients.map((client) => client.postMessage({ type: 'saynote-sync-request', source: 'background-sync' }))
  );
}
