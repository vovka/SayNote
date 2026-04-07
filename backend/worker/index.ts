import { claimJobs, closePool, withClient } from './db';
import { processJob } from './jobs/process-job';

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
  const batchSize = options.batchSize ?? Number(process.env.WORKER_BATCH_SIZE ?? 5);
  const pollIntervalMs = options.pollIntervalMs ?? Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000);
  const maxJobs = options.maxJobs ?? Number(process.env.WORKER_MAX_JOBS ?? 0);
  const continuous = options.continuous ?? process.env.WORKER_CONTINUOUS !== 'false';

  let processed = 0;

  while (true) {
    if (maxJobs > 0 && processed >= maxJobs) {
      break;
    }

    const remaining = maxJobs > 0 ? Math.max(maxJobs - processed, 0) : batchSize;
    const jobs = await claimJobs(Math.min(batchSize, Math.max(remaining, 1)));

    if (jobs.length === 0) {
      if (!continuous) {
        break;
      }
      await sleep(pollIntervalMs);
      continue;
    }

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
    console.log(`Worker finished after processing ${result.processed} job(s).`);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  void main();
}
