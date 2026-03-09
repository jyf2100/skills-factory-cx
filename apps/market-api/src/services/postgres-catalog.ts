import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import {
  computeLeaderboardScore,
  leaderboardLabel,
  normalizeCategoryDetailOptions,
  riskRank,
  slugify,
  titleCase,
  type CatalogAuditDetail,
  type CatalogAuditItem,
  type CatalogAuditVersionDetail,
  type CatalogCategoryDetail,
  type CatalogCategorySummary,
  type CategoryDetailOptions,
  type CatalogLeaderboard,
  type CatalogLeaderboardItem,
  type CatalogReader,
  type CatalogSkillDetail,
  type CatalogSkillSummary,
  type CatalogSkillVersion
} from "./catalog-model.js";
import type { RiskLevel } from "@skills/shared";

interface SkillRow {
  skill_id: string;
  title: string;
  summary: string;
  latest_version: string;
  versions_count: number;
  risk_level: RiskLevel;
  published_at: string | Date;
  source_url: string;
  package_url: string;
  reviewer: string;
  reviewed_at: string | Date | null;
  review_note: string;
  scan_issue_count: number;
  review_status: "approved" | "rejected";
  static_scan_status: "clean" | "issues_detected";
  sandbox_status: "passed" | "blocked";
  category: string;
  category_slug: string;
  readme_markdown: string;
  readme_html: string;
  tags: string[] | null;
}

interface VersionRow {
  skill_id: string;
  version: string;
  title: string;
  summary: string;
  category: string;
  category_slug: string;
  risk_level: RiskLevel;
  published_at: string | Date;
  source_url: string;
  package_url: string;
  reviewer: string;
  reviewed_at: string | Date;
  review_note: string;
  scan_issue_count: number;
  review_status: "approved" | "rejected";
  static_scan_status: "clean" | "issues_detected";
  sandbox_status: "passed" | "blocked";
  readme_markdown: string;
  readme_html: string;
}

export class PostgresCatalogService implements CatalogReader {
  constructor(
    private readonly pool: Pool,
    private readonly config: AppConfig
  ) {}

  async listSkills(query?: string): Promise<CatalogSkillSummary[]> {
    const rows = await this.fetchSkillRows(query?.trim() || undefined);
    return rows.map((row) => this.toSkillSummary(row));
  }

  async getSkillDetail(skillId: string): Promise<CatalogSkillDetail | undefined> {
    const summary = await this.fetchSkillRowById(skillId);
    if (!summary) {
      return undefined;
    }

    const versionsResult = await this.pool.query<VersionRow>(
      `select
        skill_id, version, title, summary, category, category_slug, risk_level, published_at,
        source_url, package_url, reviewer, reviewed_at, review_note, scan_issue_count,
        review_status, static_scan_status, sandbox_status, readme_markdown, readme_html
      from catalog_skill_versions
      where skill_id = $1
      order by published_at desc`,
      [skillId]
    );

    return {
      ...this.toSkillSummary(summary),
      readme_markdown: summary.readme_markdown,
      readme_html: summary.readme_html,
      install_command: `npx local-install --from ${this.config.baseUrl} ${skillId} ${summary.latest_version}`,
      versions: versionsResult.rows.map((row) => this.toSkillVersion(row))
    };
  }

  async listAudits(limit = 12): Promise<CatalogAuditItem[]> {
    const result = await this.pool.query<VersionRow>(
      `select
        skill_id, version, title, summary, category, category_slug, risk_level, published_at,
        source_url, package_url, reviewer, reviewed_at, review_note, scan_issue_count,
        review_status, static_scan_status, sandbox_status, readme_markdown, readme_html
      from catalog_skill_versions
      order by published_at desc
      limit $1`,
      [limit]
    );
    return result.rows.map((row) => this.toAuditItem(row));
  }

  async getLeaderboard(limit = 10): Promise<CatalogLeaderboard> {
    const rows = await this.fetchSkillRows();
    return {
      all_time: this.buildLeaderboard(rows, "all_time", limit),
      trending: this.buildLeaderboard(rows, "trending", limit),
      hot: this.buildLeaderboard(rows, "hot", limit)
    };
  }

  async listCategories(): Promise<CatalogCategorySummary[]> {
    const items = await this.listSkills();
    const groups = new Map<string, CatalogSkillSummary[]>();
    for (const item of items) {
      const slug = slugify(item.category || "uncategorized");
      const existing = groups.get(slug) ?? [];
      existing.push(item);
      groups.set(slug, existing);
    }

    return [...groups.entries()]
      .map(([slug, entries]) => ({
        slug,
        label: titleCase(slug.replace(/-/g, " ")),
        skills_count: entries.length,
        latest_published_at: entries.map((item) => item.published_at).sort().reverse()[0],
        items: [...entries].sort((left, right) => right.published_at.localeCompare(left.published_at))
      }))
      .sort((left, right) => right.skills_count - left.skills_count || right.latest_published_at.localeCompare(left.latest_published_at));
  }

  async getAuditDetail(skillId: string): Promise<CatalogAuditDetail | undefined> {
    const skill = await this.fetchSkillRowById(skillId);
    if (!skill) {
      return undefined;
    }

    const versionsResult = await this.pool.query<VersionRow>(
      `select
        skill_id, version, title, summary, category, category_slug, risk_level, published_at,
        source_url, package_url, reviewer, reviewed_at, review_note, scan_issue_count,
        review_status, static_scan_status, sandbox_status, readme_markdown, readme_html
      from catalog_skill_versions
      where skill_id = $1
      order by published_at desc`,
      [skillId]
    );

    return {
      skill_id: skill.skill_id,
      title: skill.title,
      category: skill.category,
      latest_version: skill.latest_version,
      latest_review_status: skill.review_status,
      latest_static_scan_status: skill.static_scan_status,
      latest_sandbox_status: skill.sandbox_status,
      versions: versionsResult.rows.map((row) => ({
        version: row.version,
        reviewer: row.reviewer,
        reviewed_at: toIsoString(row.reviewed_at),
        note: row.review_note,
        risk_level: row.risk_level,
        review_status: row.review_status,
        static_scan_status: row.static_scan_status,
        sandbox_status: row.sandbox_status,
        scan_issue_count: row.scan_issue_count
      }))
    };
  }

  async getAuditVersionDetail(skillId: string, version: string): Promise<CatalogAuditVersionDetail | undefined> {
    const result = await this.pool.query<VersionRow>(
      `select
        skill_id, version, title, summary, category, category_slug, risk_level, published_at,
        source_url, package_url, reviewer, reviewed_at, review_note, scan_issue_count,
        review_status, static_scan_status, sandbox_status, readme_markdown, readme_html
      from catalog_skill_versions
      where skill_id = $1 and version = $2`,
      [skillId, version]
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return {
      skill_id: row.skill_id,
      title: row.title,
      category: row.category,
      version: row.version,
      reviewer: row.reviewer,
      reviewed_at: toIsoString(row.reviewed_at),
      note: row.review_note,
      risk_level: row.risk_level,
      review_status: row.review_status,
      static_scan_status: row.static_scan_status,
      sandbox_status: row.sandbox_status,
      scan_issue_count: row.scan_issue_count,
      published_at: toIsoString(row.published_at),
      source_url: row.source_url,
      package_url: row.package_url
    };
  }

  async getCategoryDetail(slug: string, options: CategoryDetailOptions = {}): Promise<CatalogCategoryDetail | undefined> {
    const rows = await this.pool.query<SkillRow>(
      `select
        s.skill_id, s.title, s.summary, s.latest_version, s.versions_count, s.risk_level,
        s.published_at, s.source_url, s.package_url, s.reviewer, s.reviewed_at, s.review_note,
        s.scan_issue_count, s.review_status, s.static_scan_status, s.sandbox_status, s.category,
        s.category_slug, s.readme_markdown, s.readme_html,
        coalesce((select array_agg(tag order by tag) from catalog_skill_tags t where t.skill_id = s.skill_id), '{}'::text[]) as tags
      from catalog_skills s
      where s.category_slug = $1`,
      [slug]
    );

    if (rows.rowCount === 0) {
      return undefined;
    }

    const allItems = rows.rows.map((row) => this.toSkillSummary(row));
    const normalized = normalizeCategoryDetailOptions(options);
    const availableTags = [...new Set(allItems.flatMap((item) => item.tags))].sort((left, right) => left.localeCompare(right));
    const items = allItems
      .filter((item) => {
        if (normalized.q) {
          const haystack = [item.skill_id, item.title, item.summary, item.category, ...item.tags].join(" ").toLowerCase();
          if (!haystack.includes(normalized.q)) {
            return false;
          }
        }
        if (normalized.risk && item.risk_level !== normalized.risk) {
          return false;
        }
        if (normalized.tag && !item.tags.some((tag) => tag.toLowerCase() === normalized.tag)) {
          return false;
        }
        return true;
      })
      .sort((left, right) => sortCategoryItems(left, right, normalized.sort));

    return {
      slug,
      label: titleCase(slug.replace(/-/g, " ")),
      items,
      filters: {
        sort: normalized.sort,
        q: options.q?.trim() ?? "",
        risk: options.risk?.trim() ?? "",
        tag: options.tag?.trim() ?? ""
      },
      available_tags: availableTags
    };
  }

  private async fetchSkillRows(query?: string): Promise<SkillRow[]> {
    const search = query ? `%${query}%` : null;
    const result = await this.pool.query<SkillRow>(
      `select
        s.skill_id, s.title, s.summary, s.latest_version, s.versions_count, s.risk_level,
        s.published_at, s.source_url, s.package_url, s.reviewer, s.reviewed_at, s.review_note,
        s.scan_issue_count, s.review_status, s.static_scan_status, s.sandbox_status, s.category,
        s.category_slug, s.readme_markdown, s.readme_html,
        coalesce((select array_agg(tag order by tag) from catalog_skill_tags t where t.skill_id = s.skill_id), '{}'::text[]) as tags
      from catalog_skills s
      where (
        $1::text is null
        or s.skill_id ilike $1
        or s.title ilike $1
        or s.summary ilike $1
        or s.category ilike $1
        or exists (select 1 from catalog_skill_tags t where t.skill_id = s.skill_id and t.tag ilike $1)
      )
      order by s.published_at desc`,
      [search]
    );
    return result.rows;
  }

  private async fetchSkillRowById(skillId: string): Promise<SkillRow | undefined> {
    const result = await this.pool.query<SkillRow>(
      `select
        s.skill_id, s.title, s.summary, s.latest_version, s.versions_count, s.risk_level,
        s.published_at, s.source_url, s.package_url, s.reviewer, s.reviewed_at, s.review_note,
        s.scan_issue_count, s.review_status, s.static_scan_status, s.sandbox_status, s.category,
        s.category_slug, s.readme_markdown, s.readme_html,
        coalesce((select array_agg(tag order by tag) from catalog_skill_tags t where t.skill_id = s.skill_id), '{}'::text[]) as tags
      from catalog_skills s
      where s.skill_id = $1`,
      [skillId]
    );
    return result.rows[0];
  }

  private toSkillSummary(row: SkillRow): CatalogSkillSummary {
    return {
      skill_id: row.skill_id,
      title: row.title,
      summary: row.summary,
      latest_version: row.latest_version,
      versions_count: Number(row.versions_count),
      risk_level: row.risk_level,
      published_at: toIsoString(row.published_at),
      source_url: row.source_url,
      package_url: row.package_url,
      reviewer: row.reviewer,
      scan_issue_count: Number(row.scan_issue_count),
      category: row.category,
      tags: row.tags ?? []
    };
  }

  private toSkillVersion(row: VersionRow): CatalogSkillVersion {
    return {
      version: row.version,
      risk_level: row.risk_level,
      published_at: toIsoString(row.published_at),
      package_url: row.package_url,
      source_url: row.source_url,
      reviewer: row.reviewer,
      note: row.review_note,
      scan_issue_count: Number(row.scan_issue_count)
    };
  }

  private toAuditItem(row: VersionRow): CatalogAuditItem {
    return {
      skill_id: row.skill_id,
      title: row.title,
      version: row.version,
      reviewer: row.reviewer,
      reviewed_at: toIsoString(row.reviewed_at),
      published_at: toIsoString(row.published_at),
      risk_level: row.risk_level,
      note: row.review_note,
      scan_issue_count: Number(row.scan_issue_count),
      review_status: row.review_status,
      static_scan_status: row.static_scan_status,
      sandbox_status: row.sandbox_status,
      category: row.category
    };
  }

  private buildLeaderboard(rows: SkillRow[], mode: "all_time" | "trending" | "hot", limit: number): CatalogLeaderboardItem[] {
    return rows
      .map((row) => {
        const item = this.toSkillSummary(row);
        return {
          ...item,
          score: computeLeaderboardScore({
            published_at: item.published_at,
            versions_count: item.versions_count,
            risk_level: item.risk_level,
            scan_issue_count: item.scan_issue_count,
            sandbox_status: row.sandbox_status
          }, mode),
          score_label: leaderboardLabel(mode),
          rank: 0
        };
      })
      .sort((left, right) => right.score - left.score || right.published_at.localeCompare(left.published_at))
      .slice(0, limit)
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }
}

function toIsoString(value: string | Date | null | undefined): string {
  if (!value) {
    return "";
  }
  return value instanceof Date ? value.toISOString() : value;
}

function sortCategoryItems(left: CatalogSkillSummary, right: CatalogSkillSummary, sort: "latest" | "title" | "risk"): number {
  if (sort === "title") {
    return left.title.localeCompare(right.title) || right.published_at.localeCompare(left.published_at);
  }
  if (sort === "risk") {
    return riskRank(left.risk_level) - riskRank(right.risk_level) || right.published_at.localeCompare(left.published_at);
  }
  return right.published_at.localeCompare(left.published_at) || left.title.localeCompare(right.title);
}
