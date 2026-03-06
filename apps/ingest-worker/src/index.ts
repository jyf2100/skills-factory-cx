import { loadDotEnv } from "@skills/shared";
import { enqueueTargets, processNextJob } from "./worker.js";

loadDotEnv();
const apiBaseUrl = process.env.MARKET_API_BASE_URL ?? "http://127.0.0.1:4310";
const query = process.env.INGEST_QUERY;
const sourceUrl = process.env.INGEST_SOURCE_URL;
const workerId = process.env.INGEST_WORKER_ID ?? `worker-${process.pid}`;
const pollIntervalMs = Number(process.env.INGEST_POLL_INTERVAL_MS ?? "3000");
const once = process.env.INGEST_WORKER_ONCE === "1";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runProducerMode(): Promise<void> {
  const jobIds = await enqueueTargets({ apiBaseUrl, query, sourceUrl });
  if (jobIds.length === 0) {
    process.stdout.write("No queue targets found.\n");
    return;
  }
  for (const jobId of jobIds) {
    process.stdout.write(`queued job_id=${jobId}\n`);
  }
}

async function runWorkerMode(): Promise<void> {
  if (once) {
    const processed = await processNextJob({ apiBaseUrl, workerId });
    process.stdout.write(processed ? `processed worker_id=${workerId}\n` : "no queued jobs\n");
    return;
  }

  process.stdout.write(`worker listening worker_id=${workerId} poll_ms=${pollIntervalMs}\n`);
  while (true) {
    try {
      const processed = await processNextJob({ apiBaseUrl, workerId });
      if (!processed) {
        await sleep(pollIntervalMs);
      }
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      await sleep(pollIntervalMs);
    }
  }
}

async function run(): Promise<void> {
  if (query || sourceUrl) {
    await runProducerMode();
    return;
  }

  await runWorkerMode();
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
