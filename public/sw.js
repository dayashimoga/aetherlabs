'use strict';

/**
 * KubeLabs Service Worker (v4.0)
 * Provides 100% offline shell caching, stale-while-revalidate asset caching,
 * and seamless synthetic API fallbacks for standalone disconnected execution.
 * Backward compatibility marker: kubelabs-offline-v3
 */

const CACHE_NAME = 'kubelabs-offline-v4';
const LEGACY_CACHE_NAME = 'kubelabs-offline-v3';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/autocompletionEngine.js',
  '/js/terminalEmulator.js',
  '/js/syncCoordinator.js',
  '/js/offlineEngine.js',
  '/js/quickKeyEngine.js',
  '/js/terminalView.js',
  '/js/app.js',
  '/manifest.json',
  '/api/overview',
  '/api/tracks',
  '/api/curriculum',
  '/api/domains',
  '/api/war-room/scenarios',
  '/api/projects',
  '/api/certifications',
  '/api/certifications/performance/exams'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== LEGACY_CACHE_NAME)
          .map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Navigation requests (HTML fallback)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return response;
        })
        .catch(() => {
          return caches.match('/index.html').then((cached) => cached || caches.match('/'));
        })
    );
    return;
  }

  // 2. API requests (Network-first with cache or synthetic offline JSON fallback)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            if (cached) return cached;

            // Synthetic offline fallbacks
            let payload = { status: 'offline', offline: true, engine: 'kubelabs-offline-v4', version: '4.0.0' };

            if (url.pathname === '/api/overview') {
              payload = {
                status: 'offline',
                offline: true,
                engine: 'kubelabs-offline-v4',
                version: '4.0.0',
                learner: { profile: { xp: 0 } },
                tracks: [],
                domains: [],
                labs: [],
                projects: []
              };
            } else if (url.pathname === '/api/tracks') {
              payload = {
                status: 'offline',
                offline: true,
                tracks: [
                  { id: 'track-foundations', title: 'Cloud-Native Systems Foundations' },
                  { id: 'track-k8s-admin', title: 'Kubernetes, CNCF, GitOps & CI/CD Administrator' },
                  { id: 'track-mesh-obs-sre', title: 'Service Mesh, Observability, SRE & Platform Engineering' },
                  { id: 'track-cloud-arch-tofu', title: 'Cloud Architecture & OpenTofu / Multi-Cloud IaC' },
                  { id: 'track-emerging-aiops', title: 'Emerging Tech, AI-Ops & High-Scale Systems' },
                  { id: 'track-sec-platform', title: 'Advanced Security & Multi-Cloud Engineering' }
                ]
              };
            } else if (url.pathname === '/api/curriculum' || url.pathname === '/api/domains') {
              payload = { status: 'offline', offline: true, count: 45, domains: [] };
            } else if (url.pathname === '/api/war-room/scenarios') {
              payload = { status: 'offline', offline: true, count: 25, scenarios: [] };
            } else if (url.pathname === '/api/projects') {
              payload = { status: 'offline', offline: true, count: 8, projects: [] };
            } else if (url.pathname.startsWith('/api/certifications')) {
              payload = { status: 'offline', offline: true, count: 6, exams: [] };
            } else if (['/api/health', '/api/livez', '/api/readyz'].includes(url.pathname)) {
              payload = { status: 'ok', mode: 'offline', offline: true, version: '4.0.0' };
            }

            return new Response(JSON.stringify(payload), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'X-KubeLabs-Offline': 'true'
              }
            });
          });
        })
    );
    return;
  }

  // 3. Static Assets (Cache-first with network fallback)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Fetch in background to revalidate cache
        fetch(req)
          .then((fresh) => {
            if (fresh && fresh.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, fresh));
            }
          })
          .catch(() => {
            // Network failure is expected when offline
          });
        return cached;
      }

      return fetch(req)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => {
          return new Response('Asset unavailable offline', { status: 503, statusText: 'Offline' });
        });
    })
  );
});
