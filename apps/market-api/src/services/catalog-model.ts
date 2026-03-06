import type { AttestationEnvelope, InstallManifest, RiskLevel, SkillRecord } from "@skills/shared";

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
  readme_html: string;
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
  filters: {
    sort: "latest" | "title" | "risk";
    q: string;
    risk: string;
    tag: string;
  };
  available_tags: string[];
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

export interface CatalogAuditVersionDetail extends CatalogAuditDetailVersion {
  skill_id: string;
  title: string;
  category: string;
  version: string;
  published_at: string;
  source_url: string;
  package_url: string;
}

export interface CategoryDetailOptions {
  sort?: "latest" | "title" | "risk";
  q?: string;
  risk?: RiskLevel;
  tag?: string;
}

export interface CatalogReader {
  listSkills(query?: string): Promise<CatalogSkillSummary[]>;
  getSkillDetail(skillId: string): Promise<CatalogSkillDetail | undefined>;
  listAudits(limit?: number): Promise<CatalogAuditItem[]>;
  getLeaderboard(limit?: number): Promise<CatalogLeaderboard>;
  listCategories(): Promise<CatalogCategorySummary[]>;
  getAuditDetail(skillId: string): Promise<CatalogAuditDetail | undefined>;
  getAuditVersionDetail(skillId: string, version: string): Promise<CatalogAuditVersionDetail | undefined>;
  getCategoryDetail(slug: string, options?: CategoryDetailOptions): Promise<CatalogCategoryDetail | undefined>;
}

export interface ParsedSkillMarkdown {
  title: string;
  summary: string;
  category: string;
  tags: string[];
}

export interface CatalogVersionProjection {
  record: SkillRecord;
  install: InstallManifest;
  attestation: AttestationEnvelope;
  readme_markdown: string;
  readme_html: string;
  parsed: ParsedSkillMarkdown;
  category_slug: string;
  review_status: "approved" | "rejected";
  static_scan_status: "clean" | "issues_detected";
  sandbox_status: "passed" | "blocked";
}

export function normalizeCategoryDetailOptions(options: CategoryDetailOptions): {
  sort: "latest" | "title" | "risk";
  q: string;
  risk: string;
  tag: string;
} {
  const sort = options.sort === "title" || options.sort === "risk" ? options.sort : "latest";
  return {
    sort,
    q: options.q?.trim().toLowerCase() ?? "",
    risk: options.risk?.trim().toLowerCase() ?? "",
    tag: options.tag?.trim().toLowerCase() ?? ""
  };
}

export function parseSkillMarkdown(skillId: string, markdown: string): ParsedSkillMarkdown {
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

export function renderSkillMarkdown(markdown: string): string {
  const body = stripFrontmatter(markdown).replace(/\r\n/g, "\n").trim();
  if (!body) {
    return "<p>No skill content available.</p>";
  }

  const lines = body.split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      const className = lang ? ` class="language-${escapeHtmlAttribute(lang)}"` : "";
      blocks.push(`<pre><code${className}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      const level = trimmed.match(/^#+/)?.[0].length ?? 1;
      blocks.push(`<h${level}>${renderInlineMarkdown(trimmed.replace(/^#{1,6}\s+/, ""))}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^-\s+/.test(lines[index].trim())) {
        items.push(`<li>${renderInlineMarkdown(lines[index].trim().replace(/^-\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const paragraph: string[] = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || next.startsWith("```") || /^#{1,6}\s+/.test(next) || /^-\s+/.test(next)) {
        break;
      }
      paragraph.push(next);
      index += 1;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return blocks.join("\n");
}

export function approvalStatus(attestation: AttestationEnvelope): "approved" | "rejected" {
  return attestation.approval.decision === "approve" ? "approved" : "rejected";
}

export function scanStatus(attestation: AttestationEnvelope): "clean" | "issues_detected" {
  return attestation.scan_issues.length > 0 ? "issues_detected" : "clean";
}

export function sandboxStatus(attestation: AttestationEnvelope): "passed" | "blocked" {
  return attestation.sandbox_result.ok ? "passed" : "blocked";
}

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "uncategorized";
}

export function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sortVersions(versions: string[]): string[] {
  return [...versions].sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
}

export function computeLeaderboardScore(summary: Pick<CatalogSkillSummary, "published_at" | "versions_count" | "risk_level" | "scan_issue_count"> & { sandbox_status: "passed" | "blocked" }, mode: "all_time" | "trending" | "hot"): number {
  const ageDays = Math.max(0, (Date.now() - Date.parse(summary.published_at)) / 86_400_000);
  const versionsBonus = summary.versions_count * 100;
  const riskBonus = riskWeight(summary.risk_level);
  const scanPenalty = summary.scan_issue_count * 18;
  const sandboxPenalty = summary.sandbox_status === "passed" ? 0 : 55;
  const freshness = Math.max(0, 90 - ageDays);

  if (mode === "all_time") {
    return Math.round(versionsBonus + freshness + riskBonus - scanPenalty - sandboxPenalty);
  }
  if (mode === "trending") {
    return Math.round(versionsBonus * 0.5 + freshness * 3 + riskBonus - scanPenalty * 1.2 - sandboxPenalty);
  }
  return Math.round(versionsBonus * 0.25 + freshness * 6 + riskBonus - scanPenalty * 1.5 - sandboxPenalty * 1.25);
}

export function leaderboardLabel(mode: "all_time" | "trending" | "hot"): string {
  if (mode === "all_time") return "All Time";
  if (mode === "trending") return "Trending";
  return "Hot";
}

export function riskRank(risk: RiskLevel): number {
  switch (risk) {
    case "low":
      return 0;
    case "medium":
      return 1;
    case "high":
      return 2;
    case "critical":
      return 3;
  }
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

function renderInlineMarkdown(value: string): string {
  const escaped = escapeHtml(value);
  return escaped.replace(/`([^`]+)`/g, (_match, code) => `<code>${code}</code>`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replaceAll(" `", " ");
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
