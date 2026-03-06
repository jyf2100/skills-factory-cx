export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ScanIssue {
  rule: string;
  severity: RiskLevel;
  message: string;
  file: string;
}

export interface SandboxResult {
  ran: boolean;
  runtime: "podman" | "docker" | "none";
  ok: boolean;
  output: string;
}

export interface SkillRecord {
  skill_id: string;
  version: string;
  source_url: string;
  source_commit: string;
  hash_sha256: string;
  license: string;
  risk_level: RiskLevel;
  published_at: string;
}

export interface ReviewDecision {
  ingest_id: string;
  reviewer: string;
  decision: "approve" | "reject";
  note: string;
  reviewed_at: string;
}

export interface AttestationEnvelope {
  ingest_id: string;
  scan_issues: ScanIssue[];
  sandbox_result: SandboxResult;
  approval: ReviewDecision;
  signature: string;
  key_id: string;
}

export interface InstallManifest {
  skill_id: string;
  version: string;
  package_url: string;
  package_sha256: string;
  signature: string;
  public_key_id: string;
  source_url: string;
  published_at: string;
}

export interface PublishedSkill {
  record: SkillRecord;
  install: InstallManifest;
  attestation_path: string;
  metadata_path: string;
  package_path: string;
}

export interface IngestRecord {
  id: string;
  query?: string;
  source_url: string;
  imported_at: string;
  status: "pending_review" | "rejected_auto" | "approved" | "rejected";
  reason?: string;
  skill_id: string;
  version: string;
  workspace_path: string;
  source_commit: string;
  scan_issues: ScanIssue[];
  risk_level: RiskLevel;
  sandbox_result: SandboxResult;
}

export type IngestJobStatus = "queued" | "processing" | "completed" | "failed";

export interface IngestJob {
  id: string;
  source_url: string;
  query?: string;
  status: IngestJobStatus;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  worker_id?: string;
  ingest_id?: string;
  error?: string;
  attempts: number;
}

export interface AuditEvent {
  id: string;
  event: "ingest" | "review" | "publish" | "install" | "queue";
  skill_id: string;
  version: string;
  at: string;
  actor: string;
  details: Record<string, unknown>;
}

export interface StoreState {
  whitelist_sources: string[];
  ingests: IngestRecord[];
  jobs: IngestJob[];
  published: PublishedSkill[];
  audit: AuditEvent[];
}
