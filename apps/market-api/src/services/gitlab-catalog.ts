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
  category: string;
  tags: string[];
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
  review_status: "approved" | "rejected";
  static_scan_status: "clean" | "issues_detected";
  sandbox_status: "passed" | "blocked";
  category: string;
}

export interface CatalogLeaderboardItem extends CatalogSkillSummary {
  rank: number;
  score: number;
  score_label: string;
}

export interface CatalogLeaderboard {
  all_time: CatalogLeaderboardItem[];
  trending: CatalogLeaderboardItem[];
  hot: CatalogLeaderboardItem[];
}

export interface CatalogCategorySummary {
  slug: string;
  label: string;
  skills_count: number;
  latest_published_at: string;
  items: CatalogSkillSummary[];
}

export interface CatalogCategoryDetail {
  slug: string;
  label: string;
  items: CatalogSkillSummary[];
}

export interface CatalogAuditDetailVersion {
  version: string;
  reviewer: string;
  reviewed_at: string;
  note: string;
  risk_level: RiskLevel;
  review_status: "approved" | "rejected";
  static_scan_status: "clean" | "issues_detected";
  sandbox_status: "passed" | "blocked";
  scan_issue_count: number;
}

export interface CatalogAuditDetail {
  skill_id: string;
  title: string;
  category: string;
  latest_version: string;
  latest_review_status: "approved" | "rejected";
  latest_static_scan_status: "clean" | "issues_detected";
  latest_sandbox_status: "passed" | "blocked";
  versions: CatalogAuditDetailVersion[];
}

interface ParsedSkillMarkdown {
  title: string;
  summary: string;
  category: string;
  tags: string[];
}

interface VersionBundle {
  record: SkillRecord;
  install: InstallManifest;
  attestation: AttestationEnvelope;
  readmeMarkdown: string;
  parsed: ParsedSkillMarkdown;
}

interface SkillAggregate {
  entry: SkillIndexEntry;
  latest: VersionBundle;
  versions: VersionBundle[];
  summary: CatalogSkillSummary;
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
    const aggregates = await this.loadAggregates();
    const normalizedQuery = query?.trim().toLowerCase();
    const filtered = normalizedQuery
      ? aggregates
          .map((item) => item.summary)
          .filter(
            (item) =>
              item.skill_id.toLowerCase().includes(normalizedQuery) ||
              item.title.toLowerCase().includes(normalizedQuery) ||
              item.summary.toLowerCase().includes(normalizedQuery) ||
              item.category.toLowerCase().includes(normalizedQuery) ||
              item.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
          )
      : aggregates.map((item) => item.summary);

    return filtered.sort((left, right) => right.published_at.localeCompare(left.published_at));
  }

  async getSkillDetail(skillId: string): Promise<CatalogSkillDetail | undefined> {
    const aggregate = (await this.loadAggregates()).find((item) => item.entry.skill_id === skillId);
    if (!aggregate) {
      return undefined;
    }

    return {
      ...aggregate.summary,
      readme_markdown: aggregate.latest.readmeMarkdown,
      install_command: `npx find-skills install --from <internal-market> ${skillId} ${aggregate.latest.record.version}`,
      versions: aggregate.versions.map((bundle) => ({
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
    const aggregates = await this.loadAggregates();
    return aggregates
      .flatMap((aggregate) =>
        aggregate.versions.map((bundle) => ({
          skill_id: bundle.record.skill_id,
          title: bundle.parsed.title,
          version: bundle.record.version,
          reviewer: bundle.attestation.approval.reviewer,
          reviewed_at: bundle.attestation.approval.reviewed_at,
          published_at: bundle.record.published_at,
          risk_level: bundle.record.risk_level,
          note: bundle.attestation.approval.note,
          scan_issue_count: bundle.attestation.scan_issues.length,
          review_status: (bundle.attestation.approval.decision === "approve" ? "approved" : "rejected") as "approved" | "rejected",
          static_scan_status: (bundle.attestation.scan_issues.length > 0 ? "issues_detected" : "clean") as "clean" | "issues_detected",
          sandbox_status: (bundle.attestation.sandbox_result.ok ? "passed" : "blocked") as "passed" | "blocked",
          category: bundle.parsed.category
        }))
      )
      .sort((left, right) => right.published_at.localeCompare(left.published_at))
      .slice(0, limit);
  }

  async getLeaderboard(limit = 10): Promise<CatalogLeaderboard> {
    const aggregates = await this.loadAggregates();
    return {
      all_time: this.buildLeaderboard(aggregates, "all_time", limit),
      trending: this.buildLeaderboard(aggregates, "trending", limit),
      hot: this.buildLeaderboard(aggregates, "hot", limit)
    };
  }

  async listCategories(): Promise<CatalogCategorySummary[]> {
    const aggregates = await this.loadAggregates();
    const groups = new Map<string, CatalogSkillSummary[]>();

    for (const aggregate of aggregates) {
      const slug = slugify(aggregate.summary.category || "uncategorized");
      const items = groups.get(slug) ?? [];
      items.push(aggregate.summary);
      groups.set(slug, items);
    }

    return [...groups.entries()]
      .map(([slug, items]) => ({
        slug,
        label: titleCase(slug.replace(/-/g, " ")),
        skills_count: items.length,
        latest_published_at: items.map((item) => item.published_at).sort().reverse()[0],
        items: items.sort((left, right) => right.published_at.localeCompare(left.published_at))
      }))
      .sort((left, right) => right.skills_count - left.skills_count || right.latest_published_at.localeCompare(left.latest_published_at));
  }

  async getAuditDetail(skillId: string): Promise<CatalogAuditDetail | undefined> {
    const aggregate = (await this.loadAggregates()).find((item) => item.entry.skill_id === skillId);
    if (!aggregate) {
      return undefined;
    }

    const versions = aggregate.versions.map((bundle) => ({
      version: bundle.record.version,
      reviewer: bundle.attestation.approval.reviewer,
      reviewed_at: bundle.attestation.approval.reviewed_at,
      note: bundle.attestation.approval.note,
      risk_level: bundle.record.risk_level,
      review_status: (bundle.attestation.approval.decision === "approve" ? "approved" : "rejected") as "approved" | "rejected",
      static_scan_status: (bundle.attestation.scan_issues.length > 0 ? "issues_detected" : "clean") as "clean" | "issues_detected",
      sandbox_status: (bundle.attestation.sandbox_result.ok ? "passed" : "blocked") as "passed" | "blocked",
      scan_issue_count: bundle.attestation.scan_issues.length
    }));

    return {
      skill_id: aggregate.summary.skill_id,
      title: aggregate.summary.title,
      category: aggregate.summary.category,
      latest_version: aggregate.summary.latest_version,
      latest_review_status: versions[0]?.review_status ?? "approved",
      latest_static_scan_status: versions[0]?.static_scan_status ?? "clean",
      latest_sandbox_status: versions[0]?.sandbox_status ?? "passed",
      versions
    };
  }

  async getCategoryDetail(slug: string): Promise<CatalogCategoryDetail | undefined> {
    const categories = await this.listCategories();
    const category = categories.find((item) => item.slug === slug);
    if (!category) {
      return undefined;
    }
    return { slug: category.slug, label: category.label, items: category.items };
  }

  private buildLeaderboard(aggregates: SkillAggregate[], mode: "all_time" | "trending" | "hot", limit: number): CatalogLeaderboardItem[] {
    return aggregates
      .map((aggregate) => {
        const score = computeLeaderboardScore(aggregate, mode);
        return {
          ...aggregate.summary,
          score,
          score_label: leaderboardLabel(mode),
          rank: 0
        };
      })
      .sort((left, right) => right.score - left.score || right.published_at.localeCompare(left.published_at))
      .slice(0, limit)
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }

  private async loadAggregates(): Promise<SkillAggregate[]> {
    const index = await this.fetchJson<SkillIndexEntry[]>("index", "skills-index.json");
    const aggregates = await Promise.all(
      index.map(async (entry) => {
        const versions = sortVersions(entry.versions);
        const bundles = await Promise.all(versions.map((version) => this.loadVersionBundle(entry.skill_id, version)));
        const latest = bundles[0];
        return {
          entry,
          latest,
          versions: bundles,
          summary: this.toSkillSummary(entry, latest)
        };
      })
    );

    return aggregates.sort((left, right) => right.summary.published_at.localeCompare(left.summary.published_at));
  }

  private async loadVersionBundle(skillId: string, version: string): Promise<VersionBundle> {
    const [record, install, attestation, readmeMarkdown] = await Promise.all([
      this.fetchJson<SkillRecord>("metadata", skillId, `${version}.json`),
      this.fetchJson<InstallManifest>("install-manifests", skillId, `${version}.json`),
      this.fetchJson<AttestationEnvelope>("attestations", skillId, `${version}.json`),
      this.fetchText("skills", skillId, version, "SKILL.md")
    ]);

    return {
      record,
      install,
      attestation,
      readmeMarkdown,
      parsed: parseSkillMarkdown(skillId, readmeMarkdown)
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
      title: bundle.parsed.title,
      summary: bundle.parsed.summary,
      latest_version: bundle.record.version,
      versions_count: entry.versions.length,
      risk_level: bundle.record.risk_level,
      published_at: bundle.record.published_at,
      source_url: bundle.record.source_url,
      package_url: this.catalogPackageUrl(bundle.record.skill_id, bundle.record.version, bundle.install.package_url),
      reviewer: bundle.attestation.approval.reviewer,
      scan_issue_count: bundle.attestation.scan_issues.length,
      category: bundle.parsed.category,
      tags: bundle.parsed.tags
    };
  }
}

function computeLeaderboardScore(aggregate: SkillAggregate, mode: "all_time" | "trending" | "hot"): number {
  const latest = aggregate.latest;
  const ageDays = Math.max(0, (Date.now() - Date.parse(latest.record.published_at)) / 86_400_000);
  const versionsBonus = aggregate.entry.versions.length * 100;
  const riskBonus = riskWeight(latest.record.risk_level);
  const scanPenalty = latest.attestation.scan_issues.length * 18;
  const sandboxPenalty = latest.attestation.sandbox_result.ok ? 0 : 55;
  const freshness = Math.max(0, 90 - ageDays);

  if (mode === "all_time") {
    return Math.round(versionsBonus + freshness + riskBonus - scanPenalty - sandboxPenalty);
  }
  if (mode === "trending") {
    return Math.round(versionsBonus * 0.5 + freshness * 3 + riskBonus - scanPenalty * 1.2 - sandboxPenalty);
  }
  return Math.round(versionsBonus * 0.25 + freshness * 6 + riskBonus - scanPenalty * 1.5 - sandboxPenalty * 1.25);
}

function leaderboardLabel(mode: "all_time" | "trending" | "hot"): string {
  if (mode === "all_time") return "All Time";
  if (mode === "trending") return "Trending";
  return "Hot";
}

function riskWeight(risk: RiskLevel): number {
  switch (risk) {
    case "low":
      return 80;
    case "medium":
      return 45;
    case "high":
      return 10;
    case "critical":
      return -30;
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

function parseSkillMarkdown(skillId: string, markdown: string): ParsedSkillMarkdown {
  const frontmatter = extractFrontmatter(markdown);
  const body = stripFrontmatter(markdown).trim();
  const title =
    frontmatter.name ||
    body.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("# "))?.slice(2).trim() ||
    humanizeSkillId(skillId);
  const summary = frontmatter.description || extractFirstParagraph(body) || "Internal GitLab-backed skill package.";
  const category = frontmatter.category || inferCategory(frontmatter.tags, skillId);
  return {
    title,
    summary,
    category,
    tags: frontmatter.tags
  };
}

function extractFrontmatter(markdown: string): { name?: string; description?: string; category?: string; tags: string[] } {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*/);
  if (!match) {
    return { tags: [] };
  }

  const lines = match[1].split(/\r?\n/);
  const result: { name?: string; description?: string; category?: string; tags: string[] } = { tags: [] };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith("name:")) {
      result.name = trimmed.slice(5).trim().replace(/^['"]|['"]$/g, "");
      continue;
    }

    if (trimmed.startsWith("description:")) {
      const raw = trimmed.slice(12).trim();
      if (raw === ">-" || raw === "|" || raw === ">") {
        const collected: string[] = [];
        while (index + 1 < lines.length && /^\s{2,}/.test(lines[index + 1])) {
          index += 1;
          collected.push(lines[index].trim().replace(/^[-]\s*/, ""));
        }
        result.description = collected.join(" ").trim();
      } else {
        result.description = raw.replace(/^['"]|['"]$/g, "");
      }
      continue;
    }

    if (trimmed === "metadata:") {
      continue;
    }

    if (trimmed.startsWith("category:")) {
      result.category = trimmed.slice(9).trim().replace(/^['"]|['"]$/g, "");
      continue;
    }

    if (/^category:\s*/.test(trimmed)) {
      result.category = trimmed.replace(/^category:\s*/, "").trim().replace(/^['"]|['"]$/g, "");
      continue;
    }

    if (trimmed === "tags:" || trimmed === "metadata.tags:") {
      while (index + 1 < lines.length && /^\s*-/i.test(lines[index + 1].trim())) {
        index += 1;
        result.tags.push(lines[index].trim().replace(/^-\s*/, "").replace(/^['"]|['"]$/g, ""));
      }
      continue;
    }

    if (/^tags:\s*\[.*\]$/.test(trimmed)) {
      result.tags.push(
        ...trimmed
          .replace(/^tags:\s*\[/, "")
          .replace(/\]$/, "")
          .split(",")
          .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean)
      );
      continue;
    }

    if (/^tags:\s*$/.test(trimmed)) {
      while (index + 1 < lines.length && /^\s*-/i.test(lines[index + 1].trim())) {
        index += 1;
        result.tags.push(lines[index].trim().replace(/^-\s*/, "").replace(/^['"]|['"]$/g, ""));
      }
      continue;
    }

    if (/^\w+:$/.test(trimmed)) {
      const parent = trimmed.slice(0, -1);
      if (parent === "metadata") {
        while (index + 1 < lines.length && /^\s{2,}\S/.test(lines[index + 1])) {
          index += 1;
          const nested = lines[index].trim();
          if (nested.startsWith("category:")) {
            result.category = nested.slice(9).trim().replace(/^['"]|['"]$/g, "");
          }
          if (nested === "tags:") {
            while (index + 1 < lines.length && /^\s{4,}-\s+/.test(lines[index + 1])) {
              index += 1;
              result.tags.push(lines[index].trim().replace(/^-\s*/, "").replace(/^['"]|['"]$/g, ""));
            }
          }
        }
      }
    }
  }

  return result;
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*/, "");
}

function extractFirstParagraph(body: string): string | undefined {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("-") && !line.startsWith("```"));
}

function inferCategory(tags: string[], _skillId: string): string {
  if (tags.length > 0) {
    return tags[0];
  }
  return "uncategorized";
}

function humanizeSkillId(skillId: string): string {
  return skillId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "uncategorized";
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sortVersions(versions: string[]): string[] {
  return [...versions].sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
}
