import { describe, expect, it, vi } from "vitest";
import { processNextJob } from "./worker.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

describe("ingest worker", () => {
  it("claims a queued job and reports completion", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          job: { id: "job-1", source_url: "https://github.com/acme/sample-skill", query: "sample" }
        })
      )
      .mockResolvedValueOnce(jsonResponse(201, { ingest: { id: "ing-1" } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const processed = await processNextJob({
      apiBaseUrl: "http://127.0.0.1:4311",
      workerId: "worker-1",
      fetchImpl: fetchMock as typeof fetch
    });

    expect(processed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v1/ingest/jobs/claim");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/v1/ingest/import");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/api/v1/ingest/jobs/job-1/complete");
  });
});
