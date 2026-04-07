# Deployment Guide: SayNote Voice Notes PWA

This document describes deployment for every component: frontend PWA, API routes, Supabase database/auth, Cloudflare R2, and async worker.

## Architecture Components

1. **Frontend PWA (Next.js)**
   - Runs on Vercel
   - Handles recording, offline queue, and sync triggers
2. **API Routes (Next.js server runtime)**
   - Upload endpoint
   - Jobs/Notes/Settings endpoints
3. **Supabase**
   - Google OAuth via Supabase Auth
   - Postgres persistent tables + RLS
4. **Cloudflare R2**
   - Temporary audio object store
5. **Async Worker**
   - Pulls pending jobs and performs transcribe/categorize/store/delete lifecycle

## Step 1: Database + Auth (Supabase)

1. Create project.
2. Enable Google provider in Auth.
3. Add redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://<prod-domain>/auth/callback`
4. Execute SQL in `db/schema.sql`.
5. Validate policies by testing with two separate users.

## Step 2: Object Storage (Cloudflare R2)

1. Create bucket for temporary audio.
2. Configure lifecycle expiration for stale files (e.g., 7 days).
3. Create API token restricted to that bucket.

## Step 3: Secrets and Environment Variables

Configure these in Vercel and worker runtime:

- `NEXT_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `ENCRYPTION_MASTER_KEY`

`ENCRYPTION_MASTER_KEY` requirements:
- Required in all non-local environments.
- Minimum 32 characters.
- Must include mixed character classes and sufficient uniqueness.
- Must not use the local fallback test/dev key.

## Step 4: Deploy Frontend + API on Vercel

1. Import repository into Vercel.
2. Build command: `npm run -w frontend build`
3. Output: Next.js default.
4. Deploy.
5. Smoke test:
   - `/` record UI renders
   - `/settings` saves config
   - `/api/settings/ai-config` returns saved config

## Step 5: Deploy Worker

Recommended: separate containerized service.

Worker loop responsibilities:
1. Claim pending jobs atomically.
2. Read user config + encrypted credentials.
3. Decrypt key in-memory only immediately before provider call.
4. Fetch audio from R2.
5. Transcribe and categorize using adapter registry.
6. Upsert categories and insert note.
7. Delete R2 object.
8. Mark job as `completed`.
9. On failure: increment retry with retryable/terminal split.

## Step 6: Integrate Real Services (Production Cutover)

Replace in-memory implementations with:
- Supabase table reads/writes
- Actual R2 upload/download/delete
- Queue or cron-based worker scheduler
- Real provider HTTP/API calls in adapters

## Step 7: Operational Controls

- Monitoring dashboard for upload success, processing latency, retries, and failures
- Alerts for failure spikes and queue backlog growth
- Log redaction rules preventing secret leakage
- Regular encryption key rotation policy

### Key rotation runbook

1. **Prepare new key version**
   - Generate a new strong master key and store it as a new secret value in your secret manager.
   - Deploy worker/API with support for reading current key id/version and writing new envelope version metadata.
2. **Dual-read, single-write period**
   - Keep decrypt backward-compatible with legacy payloads.
   - Start writing all newly saved credentials with the latest envelope/key version.
3. **Batch migration**
   - Run a migration job in small batches:
     - read encrypted credential row,
     - decrypt with old key/version,
     - immediately re-encrypt with new key/version,
     - update row atomically.
   - Track progress and failures by row id/job checkpoint.
4. **Validation**
   - Execute a dry-run provider call for a sample of migrated credentials.
   - Ensure no increase in auth failures or decryption errors.
5. **Cutover**
   - Promote the new key version to default for all write paths.
   - Keep old key read-only for a limited rollback window.
6. **Rollback plan**
   - If provider/decrypt failures spike, revert writer to old key version.
   - Reprocess affected rows from migration checkpoints.
   - Keep both keys available until incident is resolved.
7. **Retire old key**
   - After stability window passes, remove old key from runtime.
   - Record rotation completion in audit log/change management ticket.

### Secret scanning + incident response

- Enable repository secret scanning in CI and on default branch pushes.
- Add pre-commit scanning (for example, gitleaks/trufflehog) for local developer workflows.
- If exposure is suspected:
  1. Immediately rotate affected provider credentials and encryption master key.
  2. Invalidate leaked keys at provider level.
  3. Review logs/DB records to determine blast radius.
  4. Backfill migrated/re-encrypted credentials.
  5. Document incident timeline and preventive actions.

## Step 8: Validation Checklist

- Offline recording works and survives browser restart
- Online reconnect automatically uploads pending recordings
- Idempotency prevents duplicate job creation
- Completed jobs create notes with nested category paths
- R2 objects are deleted after successful processing
- Plaintext API keys are never returned by API
