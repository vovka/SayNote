# Worker Runtime Logging

## Overview
The worker now emits small structured JSON log events to stdout so `docker compose logs worker` shows basic lifecycle
and job progress activity.

## Event Names
- `worker_started`: worker boot with batch and polling config.
- `worker_waiting`: no claimable jobs; first emitted immediately, then every 30 seconds while idle.
- `worker_jobs_claimed`: a batch of jobs was claimed from the queue.
- `worker_job_started`: a specific job entered processing.
- `worker_job_attempt_started`: a provider/model attempt started for a job.
- `worker_job_attempt_failed`: an attempt failed and the worker is moving to a fallback attempt.
- `worker_job_completed`: a job completed successfully.
- `worker_job_failed`: terminal or retryable failure, already emitted on stderr.
- `worker_finished`: worker exited in non-continuous mode.

## Safety Notes
- Logs do not include API keys or transcript text.
- Failure metadata is reduced to safe codes, names, and kinds.
- Category output is summarized as `categoryDepth` instead of full content.

## Verification
Running the compiled worker in short mode shows:

```text
[worker_started] {"batchSize":5,"pollIntervalMs":2000,"maxJobs":0,"continuous":false}
[worker_waiting] {"pollIntervalMs":2000}
manual_result {"processed":0}
```

---
Last updated: 2026-04-08
