import type { AttestationEnvelope, InstallManifest, RiskLevel, SkillRecord } from "@skills/shared";

interface SkillIndexEntry {
  skill_id: string;
  versions: string[];
}

interface CatalogDeps {
  rawBaseUrl?: string;
  fetchBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface CatalogSkillSummary {
  skill_id: string;
  title: string;
  summary: string;
  latest_version: string;
  versions_count: number;
  risk_level: RiskLevel;
  published_at: string;
  source_url: string;
  package_url: string;
  reviewer: string;
  scan_issue_count: number;
}

export interface CatalogSkillVersion {
  version: string;
  risk_level: RiskLevel;
  published_at: string;
  package_url: string;
  source_url: string;
  reviewer: string;
  note: string;
  scan_issue_count: number;
}

export interface CatalogSkillDetail extends CatalogSkillSummary {
  readme_markdown: string;
  install_command: string;
  versions: CatalogSkillVersion[];
}

export interface CatalogAuditItem {
  skill_id: string;
  title: string;
  version: string;
  reviewer: string;
  reviewed_at: string;
  published_at: string;
  risk_level: RiskLevel;
  note: string;
  scan_issue_count: number;
}

interface VersionBundle {
  record: SkillRecord;
  install: InstallManifest;
  attestation: AttestationEnvelope;
  readmeMarkdown: string;
  title: string;
  summary: string;
}

export class GitLabCatalogService {
  private readonly rawBaseUrl?: string;
  private readonly fetchBaseUrl?: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ rawBaseUrl, fetchBaseUrl, fetchImpl }: CatalogDeps) {
    this.rawBaseUrl = trimBase(rawBaseUrl);
    this.fetchBaseUrl = trimBase(fetchBaseUrl ?? rawBaseUrl);
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async listSkills(query?: string): Promise<CatalogSkillSummary[]> {
    const index = await this.loadIndex();
    const bundles = await Promise.all(
      index.map(async (entry) => {
        const latestVersion = sortVersions(entry.versions)[0];
        const latest = await this.loadVersionBundle(entry.skill_id, latestVersion);
        return this.toSkillSummary(entry, latest);
      })
    );

    const normalizedQuery = query?.trim().toLowerCase();
    const filtered = normalizedQuery
      ? bundles.filter(
          (item) =>
            item.skill_id.toLowerCase().includes(normalizedQuery) ||
            item.title.toLowerCase().includes(normalizedQuery) ||
            item.summary.toLowerCase().includes(normalizedQuery)
        )
      : bundles;

    return filtered.sort((left, right) => right.published_at.localeCompare(left.published_at));
  }

  async getSkillDetail(skillId: string): Promise<CatalogSkillDetail | undefined> {
    const index = await this.loadIndex();
    const entry = index.find((item) => item.skill_id === skillId);
    if (!entry) {
      return undefined;
    }

    const versions = sortVersions(entry.versions);
    const bundles = await Promise.all(versions.map((version) => this.loadVersionBundle(skillId, version)));
    const latest = bundles[0];

    return {
      ...this.toSkillSummary(entry, latest),
      readme_markdown: latest.readmeMarkdown,
      install_command: `npx find-skills install --from <internal-market> ${skillId} ${latest.record.version}`,
      versions: bundles.map((bundle) => ({
        version: bundle.record.version,
        risk_level: bundle.record.risk_level,
        published_at: bundle.record.published_at,
        package_url: this.catalogPackageUrl(bundle.record.skill_id, bundle.record.version, bundle.install.package_url),
        source_url: bundle.record.source_url,
        reviewer: bundle.attestation.approval.reviewer,
        note: bundle.attestation.approval.note,
        scan_issue_count: bundle.attestation.scan_issues.length
      }))
    };
  }

  async listAudits(limit = 12): Promise<CatalogAuditItem[]> {
    const index = await this.loadIndex();
    const bundles = await Promise.all(
      index.flatMap((entry) => entry.versions.map((version) => this.loadVersionBundle(entry.skill_id, version)))
    );

    return bundles
      .map((bundle) => ({
        skill_id: bundle.record.skill_id,
        title: bundle.title,
        version: bundle.record.version,
        reviewer: bundle.attestation.approval.reviewer,
        reviewed_at: bundle.attestation.approval.reviewed_at,
        published_at: bundle.record.published_at,
        risk_level: bundle.record.risk_level,
        note: bundle.attestation.approval.note,
        scan_issue_count: bundle.attestation.scan_issues.length
      }))
      .sort((left, right) => right.published_at.localeCompare(left.published_at))
      .slice(0, limit);
  }

  private async loadIndex(): Promise<SkillIndexEntry[]> {
    return this.fetchJson<SkillIndexEntry[]>("index", "skills-index.json");
  }

  private async loadVersionBundle(skillId: string, version: string): Promise<VersionBundle> {
    const [record, install, attestation, readmeMarkdown] = await Promise.all([
      this.fetchJson<SkillRecord>("metadata", skillId, `${version}.json`),
      this.fetchJson<InstallManifest>("install-manifests", skillId, `${version}.json`),
      this.fetchJson<AttestationEnvelope>("attestations", skillId, `${version}.json`),
      this.fetchText("skills", skillId, version, "SKILL.md")
    ]);

    const parsed = parseSkillMarkdown(skillId, readmeMarkdown);
    return {
      record,
      install,
      attestation,
      readmeMarkdown,
      title: parsed.title,
      summary: parsed.summary
    };
  }

  private async fetchJson<T>(...segments: string[]): Promise<T> {
    const response = await this.fetchImpl(buildUrl(this.fetchBaseUrl, segments));
    if (!response.ok) {
      throw new Error(`gitlab catalog fetch failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  private async fetchText(...segments: string[]): Promise<string> {
    const response = await this.fetchImpl(buildUrl(this.fetchBaseUrl, segments));
    if (!response.ok) {
      throw new Error(`gitlab catalog text fetch failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  private catalogPackageUrl(skillId: string, version: string, fallback: string): string {
    if (!this.rawBaseUrl) {
      return fallback;
    }
    return `${this.rawBaseUrl}/packages/${encodeURIComponent(skillId)}/${encodeURIComponent(version)}.tgz`;
  }

  private toSkillSummary(entry: SkillIndexEntry, bundle: VersionBundle): CatalogSkillSummary {
    return {
      skill_id: entry.skill_id,
      title: bundle.title,
      summary: bundle.summary,
      latest_version: bundle.record.version,
      versions_count: entry.versions.length,
      risk_level: bundle.record.risk_level,
      published_at: bundle.record.published_at,
      source_url: bundle.record.source_url,
      package_url: this.catalogPackageUrl(bundle.record.skill_id, bundle.record.version, bundle.install.package_url),
      reviewer: bundle.attestation.approval.reviewer,
      scan_issue_count: bundle.attestation.scan_issues.length
    };
  }
}

function trimBase(value?: string): string | undefined {
  return value?.replace(/\/+$/, "");
}

function buildUrl(baseUrl: string | undefined, segments: string[]): string {
  if (!baseUrl) {
    throw new Error("gitlab catalog requires GITLAB_RAW_BASE_URL or GITLAB_FETCH_BASE_URL");
  }
  return `${baseUrl}/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function parseSkillMarkdown(skillId: string, markdown: string): { title: string; summary: string } {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim());
  const title = lines.find((line) => line.startsWith("# "))?.slice(2).trim() || humanizeSkillId(skillId);
  const summary =
    lines.find((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("-") && !line.startsWith("```")) ||
    "Internal GitLab-backed skill package.";
  return { title, summary };
}

function humanizeSkillId(skillId: string): string {
  return skillId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sortVersions(versions: string[]): string[] {
  return [...versions].sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
}
