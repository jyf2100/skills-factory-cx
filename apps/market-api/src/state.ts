import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type AuditEvent, type IngestJob, type IngestRecord, type PublishedSkill, type StoreState } from "@skills/shared";

export interface StateStore {
  load(): StoreState;
  save(next: StoreState): void;
  appendIngest(ingest: IngestRecord): void;
  updateIngest(id: string, patch: Partial<IngestRecord>): IngestRecord | undefined;
  appendJob(job: IngestJob): void;
  claimNextJob(workerId: string): IngestJob | undefined;
  completeJob(id: string, workerId: string, ingestId: string): IngestJob | undefined;
  failJob(id: string, workerId: string, error: string): IngestJob | undefined;
  appendPublished(skill: PublishedSkill): void;
  appendAudit(event: AuditEvent): void;
}

const defaultState: StoreState = {
  whitelist_sources: [],
  ingests: [],
  jobs: [],
  published: [],
  audit: []
};

export class JsonStateStore implements StateStore {
  private readonly filePath: string;

  constructor(dataDir: string, whitelistSources: string[]) {
    this.filePath = join(dataDir, "store.json");
    mkdirSync(dirname(this.filePath), { recursive: true });
    try {
      readFileSync(this.filePath, "utf8");
    } catch {
      const initial = { ...defaultState, whitelist_sources: whitelistSources };
      writeFileSync(this.filePath, JSON.stringify(initial, null, 2), "utf8");
    }
  }

  load(): StoreState {
    const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<StoreState>;
    return {
      whitelist_sources: parsed.whitelist_sources ?? [],
      ingests: parsed.ingests ?? [],
      jobs: parsed.jobs ?? [],
      published: parsed.published ?? [],
      audit: parsed.audit ?? []
    };
  }

  save(next: StoreState): void {
    writeFileSync(this.filePath, JSON.stringify(next, null, 2), "utf8");
  }

  appendIngest(ingest: IngestRecord): void {
    const state = this.load();
    state.ingests.push(ingest);
    this.save(state);
  }

  updateIngest(id: string, patch: Partial<IngestRecord>): IngestRecord | undefined {
    const state = this.load();
    const ingest = state.ingests.find((i) => i.id === id);
    if (!ingest) {
      return undefined;
    }
    Object.assign(ingest, patch);
    this.save(state);
    return ingest;
  }

  appendJob(job: IngestJob): void {
    const state = this.load();
    state.jobs.push(job);
    this.save(state);
  }

  claimNextJob(workerId: string): IngestJob | undefined {
    const state = this.load();
    const job = state.jobs.find((item) => item.status === "queued");
    if (!job) {
      return undefined;
    }
    job.status = "processing";
    job.worker_id = workerId;
    job.started_at = new Date().toISOString();
    job.finished_at = undefined;
    job.error = undefined;
    job.attempts += 1;
    this.save(state);
    return job;
  }

  completeJob(id: string, workerId: string, ingestId: string): IngestJob | undefined {
    const state = this.load();
    const job = state.jobs.find((item) => item.id === id);
    if (!job || job.status !== "processing" || job.worker_id !== workerId) {
      return undefined;
    }
    job.status = "completed";
    job.ingest_id = ingestId;
    job.finished_at = new Date().toISOString();
    job.error = undefined;
    this.save(state);
    return job;
  }

  failJob(id: string, workerId: string, error: string): IngestJob | undefined {
    const state = this.load();
    const job = state.jobs.find((item) => item.id === id);
    if (!job || job.status !== "processing" || job.worker_id !== workerId) {
      return undefined;
    }
    job.status = "failed";
    job.finished_at = new Date().toISOString();
    job.error = error;
    this.save(state);
    return job;
  }

  appendPublished(skill: PublishedSkill): void {
    const state = this.load();
    state.published = state.published.filter(
      (s) => !(s.record.skill_id === skill.record.skill_id && s.record.version === skill.record.version)
    );
    state.published.push(skill);
    this.save(state);
  }

  appendAudit(event: AuditEvent): void {
    const state = this.load();
    state.audit.push(event);
    this.save(state);
  }
}
