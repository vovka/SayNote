# Remaining implementation work for Voice Notes PWA

## Goal
Bring the current branch from a demo/skeleton implementation to a real implementation that satisfies `docs/voice-notes-pwa-spec.md` for the MVP scope.

## Current status summary
The branch already contains:
- real browser recording via `MediaRecorder`
- local persistence of recordings in IndexedDB via Dexie
- automatic foreground sync loop with retry/backoff
- minimal notes/settings pages
- draft API route structure
- draft worker/provider abstraction structure
- draft SQL schema

However, several core requirements from the spec are still implemented as placeholders, demo logic, or non-durable in-memory code.

---

## Main gaps to implement

### 1. Replace demo authentication with real Google sign-in via Supabase Auth
Current problem:
- `frontend/lib/auth/session.ts` uses `x-demo-user-id` or `demo-user`
- there is no real Google OAuth flow
- user isolation is not enforced by a real authenticated session

Required work:
- add Supabase client setup for browser and server
- implement Google OAuth sign-in and sign-out flow
- persist authenticated session securely
- protect app pages and API endpoints using real Supabase session/JWT validation
- remove the demo header-based identity fallback
- ensure each request resolves the real authenticated user id

Done when:
- user can sign in with Google
- user can sign out
- unauthenticated users cannot access notes, settings, uploads, or jobs
- records are associated with the real authenticated user

---

### 2. Replace in-memory backend state with durable Supabase persistence
Current problem:
- `frontend/lib/api/in-memory-store.ts` stores jobs, categories, notes, config, and credential presence in memory only
- all server-side data is lost on restart
- routes are not backed by the database schema

Required work:
- replace in-memory jobs with `processing_jobs` table reads/writes
- replace in-memory notes/categories with DB-backed queries and writes
- replace AI config storage with `user_ai_config`
- replace credential presence tracking with `user_ai_credentials`
- ensure routes use durable storage and no longer depend on in-memory maps
- verify row-level access rules work for real authenticated users

Done when:
- data survives server restart/redeploy
- `/api/jobs/:id`, `/api/notes`, and settings routes are backed by Supabase
- notes/categories/jobs/config/credentials are stored in DB tables defined in `db/schema.sql`

---

### 3. Implement real audio upload persistence to Cloudflare R2
Current problem:
- upload route does not actually store audio
- `backend/worker/storage/r2.ts` is only a stub returning success
- uploaded audio is not durable after frontend upload acceptance

Required work:
- implement real R2 client integration
- validate upload size and MIME type
- persist uploaded audio under a user/job-scoped storage key
- store the R2 key in `processing_jobs.audio_storage_key`
- define and apply temporary file retention/lifecycle policy
- implement real delete logic after successful processing

Done when:
- uploaded audio is actually written to R2
- job records reference the stored object key
- audio is deleted from R2 after successful processing
- stale failed objects can expire automatically or be cleaned safely

---

### 4. Replace fake async completion with a real background worker pipeline
Current problem:
- `POST /api/audio/upload` uses `setTimeout(...)` to create a placeholder note
- there is no durable job queue/claiming mechanism
- processing is not actually asynchronous and resumable

Required work:
- remove timeout-based fake completion logic
- create real job records in `processing_jobs`
- implement a worker loop or queue consumer that claims pending jobs atomically
- move state transitions through `uploaded` -> `processing` -> `completed` / `failed_retryable` / `failed_terminal`
- store retry counts and safe error codes/messages
- make the worker safe for retries and resumptions
- ensure one successful job creates at most one note

Done when:
- uploads only create/accept jobs
- a separate worker processes jobs independently of the request lifecycle
- retries do not create duplicate notes
- job state transitions are durable and auditable

---

### 5. Implement real AI provider integrations for transcription and categorization
Current problem:
- `backend/worker/providers/groq.ts` and `openrouter.ts` return placeholder transcription/category data
- provider calls are not real
- fallback behavior is not implemented

Required work:
- implement real HTTP/SDK integration for Groq and OpenRouter
- support transcription using the configured transcription model/provider path
- support categorization using the configured categorization model/provider path
- normalize provider responses into the shared adapter output shape
- implement structured error handling and retryable vs terminal failure classification
- implement fallback provider/model logic when primary provider fails and fallback is configured

Done when:
- transcription result comes from the configured provider/model
- categorization result comes from the configured provider/model
- provider adapters no longer return placeholder strings or hardcoded category paths
- fallback path works for retryable provider failures

---

### 6. Implement real BYOK encrypted storage
Current problem:
- credentials route calls `encryptSecret(...)` but discards the ciphertext
- only provider presence is remembered
- no encrypted key is stored or later retrievable by backend runtime

Required work:
- store encrypted API key in `user_ai_credentials.encrypted_api_key`
- optionally store a safe fingerprint for diagnostics
- never return plaintext keys to the frontend after save
- implement backend-only decryption in the worker processing path
- ensure secrets are never logged
- add tests/guards around secret-handling paths

Done when:
- user can save provider credentials once
- backend can later decrypt them during processing
- frontend cannot retrieve plaintext after save
- logs and safe errors do not expose secrets

---

### 7. Wire AI config routes to real stored config and worker usage
Current problem:
- config route currently writes to in-memory storage
- worker job path does not yet load persisted per-user config/credentials from DB

Required work:
- persist config in `user_ai_config`
- return safe config metadata from `GET /api/settings/ai-config`
- load the correct user config during job processing
- use the stored provider/model selections for actual transcription/categorization
- respect fallback provider/model configuration when present

Done when:
- changing settings affects real future processing jobs
- worker reads provider/model config from durable storage

---

### 8. Complete notes and categories backend using the real hierarchy model
Current problem:
- category creation and note creation currently happen only in memory
- category resolution is simplistic and not transactional

Required work:
- implement DB-backed category path resolution/upsert
- enforce unique sibling category names per user
- create missing categories automatically when AI returns a new path
- write final notes into `notes` with `source_job_id`
- return category tree or flat data for the notes page from DB
- preserve hierarchical structure in API response and UI

Done when:
- categories are stored in Postgres with parent-child relationships
- notes are linked to the resolved category id
- notes page renders real DB-backed nested categories

---

### 9. Expose real processing visibility to the frontend
Current problem:
- frontend upload loop sets local state to `uploaded_waiting_processing`, but there is no follow-up sync from job status to final processed/failed state
- notes UI only shows finished notes, not pending/failed visibility described in the spec

Required work:
- poll or subscribe for job status updates after upload
- update local IndexedDB entries when jobs complete or fail
- surface pending/failed status in the UI where relevant
- decide whether local audio is deleted immediately after server acceptance or after job completion, and implement that policy explicitly
- optionally clean up lightweight local sync records after completion

Done when:
- user can see whether a recent upload is still processing or failed
- local state converges from queued/uploaded to processed/failed
- frontend reflects server job state reliably

---

### 10. Harden upload semantics and idempotency
Current problem:
- the client sends idempotency keys, but the production persistence path is not implemented yet
- ambiguous request/retry scenarios are not fully handled end-to-end

Required work:
- enforce unique `idempotency_key` at DB level in the real upload path
- return the existing job when the same idempotency key is retried
- ensure worker retries do not create duplicate notes
- add tests for duplicate upload requests, network timeout retries, and browser restart scenarios

Done when:
- repeated upload attempts with the same idempotency key do not create duplicate jobs or notes
- retry behavior is safe across browser/app restarts

---

### 11. Implement proper API validation and security controls
Current problem:
- upload route does not yet enforce production-safe limits and validation
- settings and secret routes are not production-hardened

Required work:
- add request size limits
- restrict accepted audio MIME types
- validate required metadata carefully
- add sanitized structured error codes
- avoid logging sensitive payloads or secrets
- add rate limits where appropriate
- ensure service-role-only operations stay server-side

Done when:
- invalid uploads fail safely
- secrets are not exposed through logs or errors
- routes enforce production-safe validation

---

### 12. Complete service worker / offline behavior to the intended MVP level
Current problem:
- current service worker only caches a tiny app shell with a simple cache-first fetch handler
- there is no optional background sync path or broader offline strategy beyond the foreground sync loop

Required work:
- keep app shell caching, but review whether additional assets/routes need caching for a reliable offline launch
- optionally add background sync enhancement where supported
- ensure app startup/offline navigation works robustly on supported browsers
- verify offline recording still works after fresh install/reload scenarios

Done when:
- app launches offline reliably enough for the intended MVP
- recording path remains usable offline
- sync resumes automatically when connectivity returns

---

### 13. Add integration tests for the real MVP flows
Current problem:
- there are no end-to-end tests proving the spec-critical flows

Required work:
- add tests for Google sign-in flow
- add tests for recording metadata save to IndexedDB logic where feasible
- add tests for upload route idempotency
- add tests for worker processing success/failure/retry behavior
- add tests for encrypted credential storage behavior
- add tests for category path creation and note insertion
- add tests for notes endpoint/tree output

Done when:
- the core MVP flows are covered by automated tests
- regressions in auth/upload/worker/category/secret handling are caught automatically

---

## Suggested implementation order
1. Real Supabase auth wiring
2. Durable DB-backed routes instead of in-memory store
3. Real R2 upload + storage abstraction
4. Real worker job claiming and processing lifecycle
5. Real provider integrations + fallback behavior
6. Real encrypted credential persistence and backend decryption
7. DB-backed category resolution and note persistence
8. Frontend job status sync and pending/failed visibility
9. Validation/security hardening
10. Integration tests and production cleanup

---

## Explicit files/modules to revisit
- `frontend/lib/auth/session.ts`
- `frontend/app/api/audio/upload/route.ts`
- `frontend/app/api/jobs/[id]/route.ts`
- `frontend/app/api/notes/route.ts`
- `frontend/app/api/settings/ai-config/route.ts`
- `frontend/app/api/settings/ai-credentials/route.ts`
- `frontend/lib/api/in-memory-store.ts`
- `frontend/lib/sync/sync-manager.ts`
- `backend/worker/index.ts`
- `backend/worker/jobs/process-job.ts`
- `backend/worker/providers/groq.ts`
- `backend/worker/providers/openrouter.ts`
- `backend/worker/storage/r2.ts`
- `backend/worker/security/encryption.ts`
- `db/schema.sql`

---

## Final acceptance criteria
This task is complete when the branch satisfies the MVP-level requirements from `docs/voice-notes-pwa-spec.md`, especially:
- real Google sign-in via Supabase Auth
- real durable backend persistence
- real temporary audio storage in R2
- real async worker processing
- real transcription and categorization via provider adapters
- encrypted provider key storage at rest
- real nested categories and durable notes
- real job visibility and retry-safe processing
- no demo identity fallback, no in-memory server persistence, and no placeholder transcription/categorization logic in the production path
