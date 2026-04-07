# Offline Sync + Browser Support Notes

## What was validated

The offline-first recording flow is designed around IndexedDB persistence plus foreground sync polling.

Validated scenarios:

1. Record while offline, then reload while still offline.
   - Recording metadata + audio blob remains in IndexedDB (`queued_upload`).
2. Record while offline, close/reopen app, and then reconnect.
   - Foreground sync loop resumes and uploads queued recordings automatically.
3. Record while online and transiently lose connectivity.
   - Retryable upload/process failures back off and are retried by foreground sync.
4. Service worker update lifecycle.
   - New worker pre-caches app shell routes, claims clients on activation, and prunes stale versioned caches.

## Caching strategy

- **App shell cache** (`saynote-shell-v2`)
  - Pre-caches core navigation routes: `/`, `/notes`, `/settings`.
  - Navigation requests prefer network, with cached route and `/` fallback when offline.
- **Runtime cache** (`saynote-runtime-v2`)
  - Same-origin GET requests use stale-while-revalidate behavior.
  - Cached response is served immediately when available; network response refreshes cache.

## Browser behavior

- **Primary path (all modern browsers with service workers)**
  - Foreground sync loop (`online` + `focus` + interval polling) performs upload/processing retries.
  - This remains the main compatibility path.
- **Optional enhancement (browsers supporting Background Sync API)**
  - Queued offline recordings attempt a one-off sync registration (`saynote-sync`).
  - On sync event, service worker posts a sync trigger message to open clients.
- **Browsers without Background Sync**
  - No behavior loss: foreground sync remains fully functional.

## Practical support matrix (high level)

- Chromium-based browsers (Chrome/Edge/Android): foreground sync + optional Background Sync enhancement.
- Firefox: foreground sync path supported; Background Sync availability is limited and should be treated as optional.
- Safari/iOS WebKit: foreground sync path supported; Background Sync should be considered unavailable/limited.

Because browser support can change over time, keep Background Sync as progressive enhancement only and do not depend on it for correctness.
