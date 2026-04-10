# Workflow-Based Processing

## Overview
Production processing can now run as a per-upload Vercel Workflow instead of requiring a separate
always-on process.

## Key Files
- `frontend/app/api/audio/upload/route.ts`
- `frontend/app/api/jobs/[id]/route.ts`
- `frontend/lib/api/start-processing-job-workflow.ts`
- `frontend/workflows/process-upload-job.ts`
- `frontend/workflows/process-upload-job-orchestrator.ts`
- `backend/worker/claim-job-by-id.ts`
- `backend/worker/jobs/process-job.ts`

## Flow
1. Upload API stores audio in R2 and creates a `processing_jobs` row.
2. The upload route starts `processUploadJobWorkflow(jobId)`.
3. The workflow atomically claims that specific job and runs `processJob`.
4. Retryable failures sleep briefly and re-claim the same job until completion or terminal failure.
5. Job polling also attempts to start the workflow for `uploaded` or `failed_retryable` jobs, so
   previously orphaned jobs can self-heal.

## Deployment Notes
- Vercel must now have `DATABASE_URL` in addition to Supabase, R2, and encryption variables.
- `PROCESSING_RETRY_DELAY_MS` controls the sleep between retryable attempts.
- `frontend/next.config.ts` is wrapped with `withWorkflow(...)`.
- Local Docker now uses Node 24 to match the workflow runtime requirements and Vercel project.

## Pitfalls
- The workflow start is idempotent only because job claiming is status-gated in
  `claim-job-by-id.ts`.
- If `DATABASE_URL` is missing on Vercel, workflow steps cannot reach Postgres even if the web app
  itself can still talk to Supabase via the service role key.
- Old local recordings may still show `Pending processing` until their next job-status poll
  re-enqueues the workflow.

## Testing
- Frontend workflow orchestration tests:
  `frontend/workflows/process-upload-job-orchestrator.test.ts`
- Workflow start helper tests:
  `frontend/lib/api/start-processing-job-workflow.test.ts`
- Route wiring tests:
  `frontend/app/api/job-workflow-start.test.ts`
- Specific-claim SQL guard:
  `backend/worker/claim-job-by-id.test.ts`

---
Last updated: 2026-04-08
