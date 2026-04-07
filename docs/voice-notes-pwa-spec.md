# Voice Notes PWA - Product and Technical Specification

## 1. Project Overview

### 1.1 Purpose
Build a minimal, fast, offline-first progressive web application that lets users dictate voice notes with one tap, then automatically converts those recordings into text and organizes them into hierarchical categories using AI.

The product goal is extreme simplicity:
- open app
- tap record
- speak
- stop
- later see processed notes organized into categories

### 1.2 Primary UX Principles
- **Fast capture first** - recording a note must require as few interactions as possible
- **Offline-first** - users must be able to record without internet access
- **Reliable sync** - recordings must not be lost under normal conditions
- **Minimal UI** - the main experience should stay visually simple
- **Asynchronous intelligence** - AI processing happens after capture, without blocking note creation
- **Provider-agnostic backend** - AI provider choice must not affect core business logic

### 1.3 Core User Story
A user opens the app, presses a single record button, dictates a note, and stops recording. The app stores the recording immediately in local browser storage. If online, the file is uploaded right away; if offline, it is queued. When connectivity is available, the app uploads queued recordings automatically. The backend temporarily stores audio, transcribes it, categorizes it using the user-selected AI provider, saves the final structured note, deletes the audio, and makes the processed note visible in the categorized notes list.

---

## 2. Goals and Non-Goals

### 2.1 Goals
- Record voice notes in a PWA
- Support offline recording and deferred sync
- Authenticate users with Google account
- Process audio into text notes
- Categorize notes into nested categories using AI
- Allow users to configure AI provider and models
- Support BYOK with secure encrypted storage of provider API keys
- Store only processed text notes long-term
- Delete audio after successful backend processing
- Keep UI minimal and fast

### 2.2 Non-Goals for Initial Version
- Manual text note creation
- Manual category management UI beyond basic display needs unless needed for corrections later
- Sharing notes with other users
- Team workspaces
- Real-time collaborative editing
- Long-term audio archive
- Rich note editing experience
- Multi-device conflict-heavy editing workflows beyond normal sync safety
- In-browser transcription for MVP

---

## 3. Functional Requirements

## 3.1 Authentication
The system must support authentication via Google account.

#### Requirements
- Users sign in using Google OAuth through Supabase Auth
- Authenticated session is persisted securely in the frontend
- Unauthenticated users cannot access notes or upload jobs
- Each note, category, upload job, AI credential, and AI configuration belongs to exactly one user

#### Acceptance Criteria
- User can sign in with Google from the app
- User can sign out
- After sign-in, user lands in the app without needing additional onboarding to start recording

---

## 3.2 Main Page - Recording UI
The main page contains only the essential recording interaction.

#### UI Elements
- Large central record button
- Recording state indication
- Optional subtle status text, for example:
  - Ready
  - Recording
  - Saved locally
  - Upload queued
  - Uploading
  - Processing

#### Behavior
- User taps button to start recording
- User taps again to stop recording
- Audio is saved locally immediately after recording finishes
- User gets instant confirmation that the recording is safely stored locally, even before upload succeeds
- App must work well on mobile-first layouts

#### Acceptance Criteria
- Recording starts within a short, perceptibly immediate delay after tap
- Stopping recording stores the audio in IndexedDB without requiring network
- User does not need to navigate anywhere to save the note

---

## 3.3 Notes List Page
A second page displays notes grouped by categories.

#### UI Structure
- Categories displayed as nested tree sections
- Notes grouped under their assigned category
- Categories may contain child categories recursively
- Notes within categories sorted newest first by default

#### Rendering Split (Implemented)
- The categorized notes list contains **processed notes only**.
- Local items that are pending upload, waiting for processing, or failed (retryable/terminal) appear in a separate **Sync status** section.
- Sync status entries are ordered newest first by local recording `createdAt` with deterministic tie-break by recording ID.
- Processed notes preserve category-path display in the tree (for example, `Work > Project A > Ideas`).

#### Required Note Fields in UI
- Note text
- Category path, if useful for context
- Created timestamp
- Processing status if note is pending or failed

#### Required Category Behavior
- Support paths like:
  - Work > Project A > Ideas
  - Personal > Health
- Empty categories may be hidden unless explicitly needed later

#### Acceptance Criteria
- User can browse notes grouped by nested categories
- Hierarchical structure is preserved in data and UI
- Notes appear after processing finishes and sync reaches the client

---

## 3.4 Offline Recording and Local Queue
The application must be offline-first for recording.

#### Requirements
- If the user is offline, recording must still work
- Recorded audio must be stored in IndexedDB immediately
- Each locally stored recording must have metadata indicating upload status
- Offline recordings must be queued automatically for later upload
- Queue must survive page refresh, tab close, browser restart, and intermittent connectivity

#### Local Queue States
Suggested local states:
- `recorded_local`
- `queued_upload`
- `uploading`
- `uploaded_waiting_processing`
- `processed`
- `failed_retryable`
- `failed_terminal`

#### Acceptance Criteria
- User can record multiple notes while offline
- Those notes remain stored locally after app restart
- Once internet is restored, queued recordings are uploaded automatically
- Under normal conditions, recordings are not lost

---

## 3.5 Automatic Sync and Retry Logic
Sync must happen automatically without user interaction.

#### Requirements
- Detect online/offline transitions
- Retry queued uploads automatically when network returns
- Retry transient failures using backoff strategy
- Prevent duplicate uploads for the same local recording
- Mark successfully uploaded items so they are not re-uploaded unnecessarily
- Support resume-safe behavior if browser or tab closes during sync

#### Retry Strategy
Recommended:
- exponential backoff with jitter
- max retry count for terminal failures
- retry on network errors, timeout errors, temporary provider/storage outages
- do not retry permanently invalid requests without state correction

#### Acceptance Criteria
- Upload retries happen automatically
- Temporary failures do not require manual action
- Duplicate note creation is prevented through idempotency design
- Browser behavior and offline validation scenarios are documented in `docs/offline-sync-browser-support.md`

---

## 3.6 Backend Audio Processing
After upload, audio is processed asynchronously on the backend.

#### Required Steps
1. Accept uploaded audio from authenticated user
2. Store audio temporarily in Cloudflare R2
3. Create upload/processing job record
4. Transcribe audio using configured AI provider/model
5. Categorize resulting text using configured AI provider/model
6. Create or map category path in database
7. Save note text, category reference, and metadata
8. Delete audio file from R2 after successful processing
9. Mark job as completed

#### Failure Handling
- If upload succeeds but processing fails, job remains retriable or visible as failed
- Audio should be retained temporarily only as long as needed for retries and processing lifecycle
- Permanent failure states must be tracked explicitly

#### Acceptance Criteria
- Audio is not retained long-term after successful processing
- Final note is stored with text, category, and timestamps
- Job status is queryable by frontend

---

## 3.7 AI Provider Configuration
The system must be AI-provider-agnostic.

#### Initial Providers
- Groq
- OpenRouter

#### Future Requirement
- New providers can be added later without changing core business logic

#### Per-User Configuration
Each user can configure:
- primary AI provider
- transcription model
- categorization model
- optional fallback provider
- fallback transcription model
- fallback categorization model

#### Acceptance Criteria
- User settings are persisted per account
- Backend selects provider based on user configuration
- Fallback provider can be used when primary provider fails

---

## 3.8 BYOK - Secure API Key Storage
Users may securely store their own API keys in the system.

#### Requirements
- User can submit provider API key over HTTPS
- Backend encrypts key before storing it at rest
- Encrypted key is stored in database
- API key is never returned back to frontend after save
- API key is decrypted only inside backend processing path when required for external provider calls
- Secrets must never be logged
- Errors must not expose key material

#### Security Rules
- TLS required for all client-server communication
- Use envelope encryption or equivalent secure server-side encryption design
- Access to decrypted keys limited to backend processing runtime only
- Rotate encryption keys through planned operational process
- Audit secret-handling paths

#### Acceptance Criteria
- User can save provider key once and later use the provider without re-entering it
- Frontend cannot retrieve plaintext key after storage
- Backend logs and error traces never contain plaintext secret

---

## 3.9 Categories
The data model must support hierarchical categories.

#### Requirements
- Categories belong to a user
- Categories support parent-child relationships
- Notes reference one category
- AI categorization may create a full path such as `Work > Project A > Ideas`
- System must either:
  - create missing categories automatically, or
  - resolve them to existing nodes when matching

#### Recommended Rules
- Category names unique within the same parent for the same user
- Root categories have `parent_id = null`
- Full path uniqueness enforced per user

#### Acceptance Criteria
- Nested categories are stored and queried correctly
- Notes can be grouped by category tree in frontend

---

## 3.10 Jobs and Processing Visibility
The system must track upload and processing jobs.

#### Job Purposes
- Track lifecycle of uploaded audio
- Support retries
- Expose processing state to frontend
- Support operational debugging

#### Job States
Suggested states:
- `pending_upload`
- `uploaded`
- `processing`
- `completed`
- `failed_retryable`
- `failed_terminal`

#### Acceptance Criteria
- Each uploaded audio maps to one job record
- Job state transitions are auditable
- Frontend can show pending/failed status when relevant

---

## 4. Non-Functional Requirements

## 4.1 Performance
- Main page must load quickly on mobile
- Recording interaction must feel immediate
- Local storage write must happen promptly after stop
- Notes list should remain responsive with a reasonable number of notes and categories

## 4.2 Reliability
- Recording must succeed regardless of network status
- Local queue must survive browser restarts
- Sync must be resilient to flaky mobile connectivity
- System should use idempotent upload semantics to avoid duplicates

## 4.3 Security
- Authentication required for protected resources
- Row-level access control enforced in database
- API keys encrypted at rest
- Audio stored temporarily only
- Secret handling must avoid logs, analytics leakage, and exception leakage

## 4.4 Privacy
- Audio is not stored long-term after successful processing
- Only resulting text notes, categories, and metadata are retained
- Users should be informed of provider involvement in processing and data flow

## 4.5 Maintainability
- Provider adapter layer must isolate provider-specific implementation details
- Worker processing should be independently deployable or executable
- Storage, auth, DB, and AI provider integrations should be replaceable with bounded changes

## 4.6 Extensibility
The architecture must allow future support for:
- additional AI providers
- additional auth providers
- note editing
- manual recategorization
- search
- tagging
- export

---

## 5. Proposed System Architecture

## 5.1 High-Level Components

### Frontend
- Next.js application
- PWA capabilities
- IndexedDB for offline audio queue
- Service worker for caching and possibly background sync support where available
- Supabase client for auth and realtime/data fetch as needed

### Backend API
- Server-side API endpoints hosted with Next.js server routes or separate backend service
- Auth verification using Supabase JWT/session
- Upload orchestration and job creation
- AI configuration and key management endpoints

### Async Worker
- Pulls or receives processing jobs
- Downloads temporary audio from R2 if needed
- Calls AI provider adapter for transcription and categorization
- Writes note and category results to database
- Deletes audio after success

### Database and Auth
- Supabase Auth for Google sign-in
- Supabase Postgres for relational data
- Supabase Row Level Security for user isolation

### Temporary File Storage
- Cloudflare R2 for temporary uploaded audio

### External AI Providers
- Groq
- OpenRouter
- Future providers through adapter interface

---

## 5.2 Suggested Logical Flow

### Recording Flow
1. User taps record
2. Browser records audio
3. User stops recording
4. Audio blob is saved in IndexedDB with local metadata
5. Sync manager attempts upload immediately if online
6. If offline, item remains queued

### Upload Flow
1. Sync manager selects queued item
2. Frontend sends authenticated upload request
3. Backend stores audio temporarily in R2
4. Backend creates job record in database
5. Frontend marks item uploaded or awaiting processing

### Processing Flow
1. Worker picks pending job
2. Worker loads user AI configuration and decrypts needed API key
3. Worker transcribes audio via provider adapter
4. Worker categorizes text via provider adapter
5. Worker resolves category tree
6. Worker saves note
7. Worker deletes audio from R2
8. Worker marks job completed
9. Frontend fetches or receives updated notes list

---

## 6. Recommended Technical Design

## 6.1 Frontend

### Stack
- Next.js
- TypeScript
- PWA setup with service worker
- IndexedDB wrapper library, such as Dexie, recommended

### Main Frontend Modules
- `auth`
- `recording`
- `offline_queue`
- `sync_manager`
- `notes_list`
- `api_client`
- `settings`

### IndexedDB Stores
Recommended stores:
- `recordings`
- `sync_state`
- possibly `cached_notes` for read-only offline viewing later

#### Example local recording shape
```ts
{
  id: string,
  userId: string,
  audioBlob: Blob,
  mimeType: string,
  durationMs: number,
  createdAt: string,
  status: 'recorded_local' | 'queued_upload' | 'uploading' | 'uploaded_waiting_processing' | 'processed' | 'failed_retryable' | 'failed_terminal',
  retryCount: number,
  nextRetryAt?: string,
  uploadIdempotencyKey: string,
  serverJobId?: string,
  lastError?: string
}
```

### Service Worker Responsibilities
- Cache app shell for offline use
- Enable launch and navigation while offline
- Potentially support background sync where browser support exists
- Do not rely exclusively on background sync because browser support is inconsistent, especially on iOS

### Sync Strategy
Use a foreground sync manager plus optional background sync enhancement.

Recommended triggers:
- app startup
- app resume / focus
- online event
- periodic timer while app is open
- service worker background sync where supported

---

## 6.2 Backend API

### Suggested Endpoints
#### Authenticated endpoints
- `POST /api/audio/upload`
  - accepts audio file or multipart payload
  - returns job metadata
- `GET /api/jobs/:id`
  - returns job status
- `GET /api/notes`
  - returns user notes with categories
- `GET /api/categories`
  - returns category tree or flat hierarchy
- `PUT /api/settings/ai-config`
  - saves provider/model/fallback config
- `PUT /api/settings/ai-credentials`
  - saves encrypted provider key
- `GET /api/settings/ai-config`
  - returns safe config metadata without plaintext secrets

### Upload Endpoint Responsibilities
- authenticate user
- validate payload size/type
- generate storage key
- upload audio to R2
- create job record
- return job id and accepted state

### Important Backend Rule
Audio upload endpoint should be idempotent with respect to a client-generated idempotency key to avoid duplicate jobs on retries.

---

## 6.3 Async Worker

### Worker Responsibilities
- poll or receive pending jobs
- transition job state atomically
- retrieve user AI configuration and credential
- call transcription
- call categorization
- create category hierarchy if needed
- insert note
- delete R2 audio on success
- mark job complete
- manage retries and fallback provider usage

### Retry Logic
- retry temporary AI/provider/network/storage failures
- optionally switch to fallback provider before final failure
- record structured error codes
- cap retries

### Idempotency
Worker must be able to safely resume/retry jobs without creating duplicate notes.

Recommended protections:
- unique constraint linking note to originating job
- transactional processing where possible

---

## 6.4 AI Provider Adapter Layer

The backend should expose a unified abstraction independent of any vendor.

### Interface Example
```ts
interface AIProviderAdapter {
  transcribe(input: {
    audioUrl?: string;
    audioBuffer?: Buffer;
    model: string;
    apiKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<TranscriptionResult>;

  categorize(input: {
    text: string;
    model: string;
    apiKey: string;
    allowedCategories?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<CategorizationResult>;
}
```

### Result Shapes
```ts
interface TranscriptionResult {
  text: string;
  raw?: unknown;
}

interface CategorizationResult {
  categoryPath: string[];
  confidence?: number;
  raw?: unknown;
}
```

### Provider Registry Example
```ts
interface ProviderRegistry {
  get(provider: 'groq' | 'openrouter' | string): AIProviderAdapter;
}
```

### Design Rules
- Business logic never calls provider SDKs directly
- Provider-specific request/response mapping stays inside adapter implementation
- Adapters normalize outputs and errors
- Adding a provider means implementing the adapter and registering it

---

## 6.5 AI Prompting and Categorization Strategy

### Transcription
- Use provider/model selected by user
- Prefer direct speech-to-text capability when available
- If a provider lacks native transcription, adapter may bridge through a compatible model or secondary supported mechanism if product policy allows

### Categorization
Categorization should produce a normalized category path.

#### Suggested categorization output contract
```json
{
  "category_path": ["Work", "Project A", "Ideas"]
}
```

#### Prompting Guidelines
- Keep categorization deterministic
- Instruct model to return structured JSON only
- Normalize minor wording variations when possible
- Consider optional rules later such as merging close categories

### MVP Recommendation
Let AI propose category path from note text. If path does not exist, create it automatically.

---

## 7. Data Model Specification

## 7.1 Entities

### users
Managed primarily through Supabase Auth, with optional profile table.

#### Suggested profile table: `user_profiles`
| Field | Type | Notes |
|---|---|---|
| id | uuid pk | matches auth user id |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| display_name | text | optional |
| email | text | optional mirror |

### categories
Stores hierarchical user categories.

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | owner |
| parent_id | uuid nullable fk categories.id | null for root |
| name | text | category name under parent |
| path_cache | text | optional cached full path |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### Constraints
- unique `(user_id, parent_id, name)`

### notes
Stores final processed text notes.

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | owner |
| category_id | uuid fk categories.id | assigned category |
| source_job_id | uuid unique fk processing_jobs.id | one note per successful job |
| text | text | transcribed note text |
| created_at | timestamptz | original note timestamp |
| processed_at | timestamptz | processing completion time |
| updated_at | timestamptz | |
| metadata | jsonb | optional structured info |

### processing_jobs
Tracks upload and processing lifecycle.

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | owner |
| client_recording_id | text | local client-side identifier |
| idempotency_key | text unique | dedupe uploads |
| status | text | lifecycle state |
| audio_storage_key | text nullable | R2 key |
| audio_mime_type | text | |
| audio_duration_ms | integer nullable | |
| retry_count | integer default 0 | |
| error_code | text nullable | |
| error_message_safe | text nullable | sanitized only |
| provider_used | text nullable | |
| transcription_model | text nullable | |
| categorization_model | text nullable | |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| completed_at | timestamptz nullable | |

### user_ai_credentials
Stores encrypted BYOK credentials.

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | owner |
| provider | text | groq, openrouter, etc |
| encrypted_api_key | text | ciphertext |
| key_fingerprint | text nullable | optional for diagnostics, non-secret |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### Constraints
- unique `(user_id, provider)`

### user_ai_config
Stores provider/model selections.

| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid unique fk | one active config row |
| primary_provider | text | |
| transcription_model | text | |
| categorization_model | text | |
| fallback_provider | text nullable | |
| fallback_transcription_model | text nullable | |
| fallback_categorization_model | text nullable | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## 7.2 Notes on Category Tree Modeling
Two valid approaches:

### Option A - Adjacency List
Use `parent_id` self-reference.

Benefits:
- simple writes
- natural relational model
- easy for MVP

Tradeoffs:
- recursive queries for full tree

### Option B - Adjacency List + Cached Path
Add `path_cache` to simplify display and lookup.

Recommended for MVP:
- use adjacency list
- optionally maintain `path_cache` for easier UI and categorization matching

---

## 7.3 Example SQL-Oriented Constraints
- unique category name among siblings per user
- unique processing job idempotency key
- unique note per processing job
- foreign key ownership consistency enforced in application logic and RLS

---

## 8. Security Specification

## 8.1 Authentication and Authorization
- Supabase Auth handles Google sign-in
- All backend endpoints require authenticated user context except public auth callbacks
- Use Row Level Security in Postgres for user-owned tables
- User may only access own notes, categories, jobs, credentials metadata, and config

## 8.2 Secret Management
- Do not store provider API keys in plaintext
- Encrypt before writing to DB
- Decrypt only within trusted backend runtime
- Never return stored key to client
- Mask provider configuration responses so they reveal only presence of saved key, not value

## 8.3 Logging Rules
Never log:
- plaintext provider keys
- authorization headers
- uploaded audio content
- full provider request payloads if they may contain secret values
- raw exception objects that embed secrets

Allowed logging:
- job ids
- provider names
- model names
- safe error codes
- retry counts
- storage keys if not user-sensitive

## 8.4 Data Deletion Rules
- Delete audio from R2 after successful processing
- For failed jobs, retain audio only as long as needed for retry or manual operational recovery window
- Consider lifecycle policy in R2 to auto-expire stale temporary files

---

## 9. Offline-First Design Specification

## 9.1 Local Persistence Guarantees
Under normal browser behavior and available storage conditions:
- recording is saved locally before remote dependency
- browser refresh must not lose pending recordings
- intermittent network loss must not lose pending recordings

## 9.2 IndexedDB Usage
Store for each pending recording:
- audio blob
- local id
- timestamps
- mime type
- duration
- status
- retry metadata
- server job id if created
- idempotency key

## 9.3 Sync Execution Rules
- only one sync attempt per item at a time
- sync can be serialized or limited-concurrency
- item marked `uploading` before request starts
- on ambiguous timeout, retry using same idempotency key
- on success, local state updated with job id
- local audio removed only after server acceptance and enough confidence that backend has durable copy, or after later completion depending on chosen resilience policy

### Recommended local deletion policy
Keep a minimal local stub after upload and remove local audio blob only after server accepts upload. If extra safety is desired, optionally keep local audio until job reaches `completed`, but this increases device storage usage. For MVP, either is acceptable, but the policy must be explicit.

Recommended default:
- retain local audio until upload confirmed by server
- then remove blob and keep lightweight sync record
- rely on backend temporary storage after acceptance

## 9.4 Edge Cases
- user records while offline and closes app
- browser restarts before reconnect
- upload request times out after server may already have accepted file
- duplicate sync trigger fires from multiple app lifecycle events
- auth session expires while offline

System must handle all of the above gracefully.

---

## 10. API and Processing Contracts

## 10.1 Upload Request Contract
Recommended payload:
- multipart form upload or signed URL flow
- includes:
  - audio file
  - local recording id
  - idempotency key
  - duration
  - mime type
  - created timestamp

### Response example
```json
{
  "job_id": "uuid",
  "status": "uploaded"
}
```

## 10.2 Job Status Contract
```json
{
  "job_id": "uuid",
  "status": "processing",
  "note_id": null,
  "error_code": null
}
```

## 10.3 Notes Response Contract
Prefer returning either:
- flat list of categories and notes, assembled into tree on client, or
- pre-grouped hierarchical response

For MVP, flat relational response is simpler and often enough.

---

## 11. Suggested Database Access Rules (RLS Intent)

### categories
- user can select own rows
- user can insert own rows
- user can update own rows if feature is exposed
- user cannot access others' rows

### notes
- user can select own rows
- insert from worker/backend service role only, or controlled path

### processing_jobs
- user can select own rows
- insert by backend
- update by worker/backend only

### user_ai_credentials
- user can create/update own credential metadata record through backend
- plaintext value never selectable by client
- ideally client does not access this table directly at all

### user_ai_config
- user can read/update own config

---

## 12. Operational Considerations

## 12.1 Deployment
- Frontend hosted on Vercel
- Backend API may be implemented within Next.js server routes or separate service
- Worker can run as separate process/service
- Supabase hosts auth and Postgres
- R2 stores temporary audio

## 12.2 Recommended Separation
Even if API is inside Next.js, background processing should be separated from request-response lifecycle.

## 12.3 Monitoring
Track:
- upload success rate
- processing success rate
- average transcription latency
- average categorization latency
- queue retry counts
- failed jobs by provider/model
- orphaned temporary audio files

## 12.4 Alerts
Alert on:
- spike in failed uploads
- spike in failed processing jobs
- audio deletion failures
- provider adapter error rate increase
- worker backlog growth

---

## 13. MVP Scope Recommendation

To keep the first version minimal and shippable, the MVP should include:
- Google sign-in
- single-button record UI
- notes list page grouped by categories
- IndexedDB offline queue for recordings
- automatic sync when online
- temporary audio upload to R2
- backend transcription and categorization worker
- Groq and OpenRouter adapters
- BYOK encrypted key storage
- category auto-creation from AI result
- job status tracking
- audio deletion after success

Items that can wait until later:
- manual category rename/move UI
- note editing UI
- search
- manual recategorization
- export/import
- advanced background sync tuning
- audio playback history
- category merge tools

---

## 14. Recommended Implementation Decisions

## 14.1 Frontend
- Use Dexie or similar for IndexedDB abstraction
- Use MediaRecorder API for capture
- Use service worker for app shell caching
- Use explicit sync manager in app code, not service worker only

## 14.2 Backend
- Use typed provider adapter interface from day one
- Use idempotency keys for upload endpoint
- Use sanitized structured error codes
- Use server-side encryption service abstraction for API key handling

## 14.3 Data
- Use adjacency list category table with unique sibling constraint
- Store processing jobs separately from notes
- Ensure one note per successful job

## 14.4 Security
- Restrict secret handling to backend service only
- Never expose AI key back to client after initial save
- Enforce HTTPS everywhere

---

## 15. Open Questions / Product Decisions to Finalize

These should be decided before implementation starts:

1. **Should local audio be deleted immediately after successful upload, or only after processing completes?**
   - Immediate deletion reduces device storage use
   - Delayed deletion provides extra resilience

2. **Should AI create new categories automatically without approval?**
   - Best for low-friction UX
   - But may create near-duplicate categories over time

3. **Should users later be able to correct category assignment manually?**
   - Strongly recommended for future versions

4. **Should notes list be available offline from cached server data?**
   - Not required by current scope, but useful later

5. **Which provider handles transcription if a configured provider lacks a direct speech-to-text model?**
   - Must be clearly defined in adapter policy

6. **What is the maximum allowed recording length and file size?**
   - Needed for UX and storage control

7. **How long should failed-job audio stay in temporary storage before expiration?**
   - Must align with retry policy and privacy expectations

---

## 16. Example User Flows

## 16.1 Happy Path Online
1. User opens app
2. User taps record
3. User speaks note
4. User stops recording
5. Audio saved locally
6. App uploads immediately
7. Backend stores audio in R2 and creates job
8. Worker transcribes and categorizes
9. Note saved in DB under category path
10. Audio deleted from R2
11. User opens notes page and sees note grouped correctly

## 16.2 Happy Path Offline
1. User opens app without internet
2. User records note
3. Audio saved to IndexedDB
4. Queue status marked pending
5. User closes app
6. Later internet becomes available
7. App reopens or reconnect event triggers sync
8. Recording uploads automatically
9. Backend processes note
10. User sees categorized text note later

## 16.3 Provider Failure with Fallback
1. Primary provider transcription fails with retryable provider error
2. Worker checks configured fallback provider
3. Worker retries via fallback
4. Processing succeeds
5. Job recorded with actual provider used

---

## 17. Acceptance Criteria Summary

The project is considered successful for MVP when all of the following are true:

- User can sign in with Google
- User can record a note from a one-button main screen
- Recording works offline
- Audio is stored locally immediately after recording
- Queued offline recordings upload automatically when internet is restored
- Upload retries happen automatically for transient failures
- Backend stores uploaded audio temporarily in R2
- Backend transcribes and categorizes notes asynchronously
- Final note text is saved in database with category assignment
- Categories support nested tree structure
- Notes page shows notes grouped by categories
- Audio is deleted after successful processing
- User can store provider API key securely
- Stored API key is encrypted at rest and never returned to client
- System supports at least Groq and OpenRouter via a unified provider adapter interface
- The architecture allows future providers to be added without rewriting business logic

---

## 18. Suggested Folder / Module Structure

```text
frontend/
  app/
    page.tsx                  # record screen
    notes/page.tsx            # categorized notes list
    settings/page.tsx         # AI config / BYOK
  lib/
    auth/
    db/indexeddb/
    recording/
    sync/
    api/
    pwa/

backend/
  api/
    upload/
    jobs/
    notes/
    settings/
  worker/
    jobs/
    providers/
      base.ts
      groq.ts
      openrouter.ts
    categories/
    notes/
    security/
      encryption.ts
    storage/
      r2.ts

shared/
  types/
  schemas/
```

---

## 19. Final Recommendation

This project should be built as an offline-first capture system with asynchronous AI enrichment, not as a synchronous voice assistant. The most important design decisions are:
- immediate local durability in IndexedDB
- idempotent upload pipeline
- robust async worker
- strict secret handling
- provider abstraction from day one

If these are implemented correctly, the product will remain minimal for the user while still being reliable, secure, and extensible.
