interface SearchResponse {
  candidates: Array<{ source_url: string }>;
}

interface JobResponse {
  job?: { id: string; source_url: string; query?: string };
}

interface WorkerDeps {
  apiBaseUrl: string;
  workerId: string;
  fetchImpl?: typeof fetch;
}

interface QueueDeps {
  apiBaseUrl: string;
  query?: string;
  sourceUrl?: string;
  fetchImpl?: typeof fetch;
}

async function requestJson<T>(fetchImpl: typeof fetch, url: string, options?: RequestInit): Promise<T> {
  const response = await fetchImpl(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export async function enqueueTargets({ apiBaseUrl, query, sourceUrl, fetchImpl = fetch }: QueueDeps): Promise<string[]> {
  const targets: string[] = [];

  if (sourceUrl) {
    targets.push(sourceUrl);
  }

  if (query) {
    const payload = await requestJson<SearchResponse>(fetchImpl, `${apiBaseUrl}/api/v1/ingest/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    for (const candidate of payload.candidates.slice(0, 5)) {
      targets.push(candidate.source_url);
    }
  }

  const jobIds: string[] = [];
  for (const target of [...new Set(targets)]) {
    const payload = await requestJson<{ job: { id: string } }>(fetchImpl, `${apiBaseUrl}/api/v1/ingest/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_url: target, query })
    });
    jobIds.push(payload.job.id);
  }

  return jobIds;
}

export async function processNextJob({ apiBaseUrl, workerId, fetchImpl = fetch }: WorkerDeps): Promise<boolean> {
  const claimResponse = await fetchImpl(`${apiBaseUrl}/api/v1/ingest/jobs/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worker_id: workerId })
  });

  if (claimResponse.status === 204) {
    return false;
  }
  if (!claimResponse.ok) {
    throw new Error(`claim failed: ${claimResponse.status} ${await claimResponse.text()}`);
  }

  const claimPayload = (await claimResponse.json()) as JobResponse;
  if (!claimPayload.job) {
    return false;
  }

  const importResponse = await fetchImpl(`${apiBaseUrl}/api/v1/ingest/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_url: claimPayload.job.source_url, query: claimPayload.job.query })
  });

  if (!importResponse.ok) {
    const errorText = await importResponse.text();
    await requestJson(fetchImpl, `${apiBaseUrl}/api/v1/ingest/jobs/${claimPayload.job.id}/fail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worker_id: workerId, error: errorText || `import failed: ${importResponse.status}` })
    });
    return true;
  }

  const importPayload = (await importResponse.json()) as { ingest: { id: string; skill_id: string; status: string } };
  await requestJson(fetchImpl, `${apiBaseUrl}/api/v1/ingest/jobs/${claimPayload.job.id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worker_id: workerId, ingest_id: importPayload.ingest.id })
  });

  return true;
}
