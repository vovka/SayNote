# Local Setup And Provisioning

## Overview
SayNote cannot run end-to-end as a purely local app today. Local development still depends on managed auth, managed Postgres via Supabase, Cloudflare R2 for uploaded audio, and at least one AI provider for job processing.

## Purpose
Capture the actual setup contract from code so local environment provisioning does not rely on the higher-level README alone.

## Key Files And Structure
- `frontend/app/signin/page.tsx`: sign-in is hardcoded to Supabase Google OAuth.
- `frontend/components/auth-gate.tsx`: main app routes require an authenticated Supabase session.
- `frontend/lib/supabase/browser.ts`: browser requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `frontend/lib/api/supabase-server.ts`: server API routes require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- `frontend/app/api/audio/upload/route.ts`: uploads write audio to R2 and create job rows in Supabase.
- `backend/worker/storage/r2.ts`: storage client is hardwired to Cloudflare R2 account-based endpoint.
- `backend/worker/db.ts`: worker requires direct `DATABASE_URL` access.
- `frontend/app/settings/page.tsx`: users store Groq/OpenRouter keys after signing in.
- `shared/types/model-policy.ts`: supported providers are `groq` and `openrouter`.
- `db/schema.sql`: Supabase/Postgres schema and RLS policies.

## Core Concepts
- The web app is gated behind auth, so Supabase Auth must work before normal local use.
- Audio upload is not stored on local disk; it is sent to Cloudflare R2 immediately.
- Processing is async: Next.js creates jobs, the separate worker claims them from Postgres.
- AI provider keys are per-user data stored through the app settings screen, not fixed global env vars.

## How It Works
1. User signs in with Google through Supabase OAuth.
2. Browser calls authenticated API routes using the Supabase access token.
3. Upload route stores audio in R2 and inserts a `processing_jobs` row.
4. Worker polls Postgres using `DATABASE_URL`, loads encrypted provider credentials, downloads audio from R2, calls Groq/OpenRouter, and writes notes/categories back to Supabase.

## Integration Points
- Supabase: Auth, API auth validation, service-role CRUD, Postgres storage.
- Google OAuth: required because sign-in currently only offers Google.
- Cloudflare R2: required for temporary audio object storage.
- Groq or OpenRouter: at least one required for transcription and categorization.

## Configuration
- Required local env from `.env`: `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `ENCRYPTION_MASTER_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- Code also requires `SUPABASE_URL` for server API routes even though `.env.example` only lists the public URL.
- `R2_ENDPOINT` exists in docs/env example but `backend/worker/storage/r2.ts` ignores it and always builds the Cloudflare endpoint from `R2_ACCOUNT_ID`.
- AI provider API keys are entered later in `/settings` after successful sign-in.

## Testing Strategy
- Validate sign-in flow at `/signin` and `/auth/callback`.
- Upload a recording and confirm a job row is created plus an R2 object exists.
- Run the worker and confirm job transition to `completed` plus note creation.
- Confirm the temporary R2 object is deleted after successful processing.

## Important Patterns And Pitfalls
- No auth means no usable app shell; `/`, `/notes`, and `/settings` all sit behind `AuthGate`.
- Supabase schema must be applied before uploads or settings persistence can work.
- The worker uses direct Postgres access, so Supabase project credentials alone are insufficient without `DATABASE_URL`.
- Local app startup can succeed before AI keys are stored, but processing jobs will fail until a provider key exists for the chosen provider.

## Known Issues Or Future Improvements
- Align env docs with code by documenting or adding `SUPABASE_URL` explicitly.
- Either honor `R2_ENDPOINT` in code or remove it from the public env contract.
- Add a true local-dev mode if offline or no-cloud bootstrapping is a goal.

---
Last updated: 2026-04-08
