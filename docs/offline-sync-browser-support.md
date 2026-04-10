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
5. Crash/restart stale-state recovery.
   - `uploading` entries older than the stale timeout are moved back to `queued_upload` while preserving the same idempotency key.
   - Stale processing states (`uploaded_waiting_processing` and processing-stage retryables with `serverJobId`) are re-scheduled immediately by setting `nextProcessingRetryAt` to "now".
   - Recovery runs inside the same single-flight sync guard used by normal sync cycles to prevent duplicate race-triggered work after restart.

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

## Worker temporary-audio retention and cleanup

- Uploaded raw audio is stored in R2 as temporary worker input until processing finishes.
- On successful processing, the worker performs a best-effort delete of the temporary object after the note and job are committed as `completed`.
- If that delete fails, completion is **not** rolled back; the worker logs a safe operational error and leaves the note/job intact.

### Stale audio lifecycle

- **Abandoned/failed uploads:** apply an R2 lifecycle expiration rule to the temporary audio prefix (for example `audio/`) so objects are automatically removed even if the worker never reaches successful cleanup.
- **Expected cleanup window:** set lifecycle expiration to roughly **24-72 hours**. This keeps enough buffer for retries/investigation while preventing long-term storage growth from stale objects.
