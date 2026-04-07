import { claimJobs, closePool, withClient } from './db';
import { processJob } from './jobs/process-job';
import { ensureEncryptionReady } from './security/encryption';
import { logWorkerEvent } from './security/safe-logging';

const IDLE_HEARTBEAT_MS = 30_000;

export interface WorkerRunOptions {
  batchSize?: number;
  pollIntervalMs?: number;
  maxJobs?: number;
  continuous?: boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWorker(options: WorkerRunOptions = {}) {
  ensureEncryptionReady();
  const batchSize = options.batchSize ?? Number(process.env.WORKER_BATCH_SIZE ?? 5);
  const pollIntervalMs = options.pollIntervalMs ?? Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000);
  const maxJobs = options.maxJobs ?? Number(process.env.WORKER_MAX_JOBS ?? 0);
  const continuous = options.continuous ?? process.env.WORKER_CONTINUOUS !== 'false';

  let processed = 0;
  let idleSince: number | null = null;
  let lastIdleLogAt = 0;

  logWorkerEvent('worker_started', {
    batchSize,
    pollIntervalMs,
    maxJobs,
    continuous
  });

  while (true) {
    if (maxJobs > 0 && processed >= maxJobs) {
      break;
    }

    const remaining = maxJobs > 0 ? Math.max(maxJobs - processed, 0) : batchSize;
    const claimLimit = Math.min(batchSize, Math.max(remaining, 1));
    const jobs = await claimJobs(claimLimit);

    if (jobs.length === 0) {
      const now = Date.now();
      if (idleSince === null) {
        idleSince = now;
        lastIdleLogAt = now;
        logWorkerEvent('worker_waiting', { pollIntervalMs });
      } else if (now - lastIdleLogAt >= IDLE_HEARTBEAT_MS) {
        lastIdleLogAt = now;
        logWorkerEvent('worker_waiting', {
          pollIntervalMs,
          idleForMs: now - idleSince
        });
      }

      if (!continuous) {
        break;
      }
      await sleep(pollIntervalMs);
      continue;
    }

    const idleForMs = idleSince === null ? null : Date.now() - idleSince;
    idleSince = null;
    lastIdleLogAt = 0;
    logWorkerEvent('worker_jobs_claimed', {
      count: jobs.length,
      claimLimit,
      idleForMs
    });

    for (const job of jobs) {
      await withClient((client) => processJob(client, job));
      processed += 1;
      if (maxJobs > 0 && processed >= maxJobs) {
        break;
      }
    }
  }

  return { processed };
}

async function main() {
  try {
    const result = await runWorker();
    logWorkerEvent('worker_finished', { processed: result.processed });
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  void main();
}
