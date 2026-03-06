import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { InstallManifest, PublishedSkill, SkillRecord, AttestationEnvelope } from "@skills/shared";
import type { Pool, PoolClient } from "pg";
import type { AppConfig } from "../config.js";
import {
  approvalStatus,
  parseSkillMarkdown,
  renderSkillMarkdown,
  scanStatus,
  slugify,
  sortVersions,
  type CatalogVersionProjection,
  sandboxStatus
} from "./catalog-model.js";

interface SkillIndexEntry {
  skill_id: string;
  versions: string[];
}

export class CatalogProjector {
  constructor(
    private readonly pool: Pool,
    private readonly config: AppConfig
  ) {}

  async rebuildAll(): Promise<void> {
    const runId = randomUUID();
    await this.pool.query(
      "insert into catalog_sync_runs (id, mode, status, started_at, skills_scanned, versions_scanned) values ($1, $2, $3, now(), 0, 0)",
      [runId, "full_rebuild", "running"]
    );

    const index = this.readIndex();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("truncate table catalog_skill_tags, catalog_skill_versions, catalog_skills");
      let versionsScanned = 0;
      for (const entry of index) {
        await this.upsertSkill(client, entry.skill_id, entry.versions);
        versionsScanned += entry.versions.length;
      }
      await client.query("commit");
      await this.finishRun(runId, "completed", index.length, versionsScanned);
    } catch (error) {
      await rollbackQuietly(client);
      await this.failRun(runId, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async projectSkill(skillId: string): Promise<void> {
    const runId = randomUUID();
    await this.pool.query(
      "insert into catalog_sync_runs (id, mode, status, started_at, skills_scanned, versions_scanned) values ($1, $2, $3, now(), 0, 0)",
      [runId, "upsert_skill", "running"]
    );

    const entry = this.readIndex().find((item) => item.skill_id === skillId);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      if (!entry) {
        await client.query("delete from catalog_skill_tags where skill_id = $1", [skillId]);
        await client.query("delete from catalog_skill_versions where skill_id = $1", [skillId]);
        await client.query("delete from catalog_skills where skill_id = $1", [skillId]);
        await client.query("commit");
        await this.finishRun(runId, "completed", 0, 0);
        return;
      }

      await this.upsertSkill(client, entry.skill_id, entry.versions);
      await client.query("commit");
      await this.finishRun(runId, "completed", 1, entry.versions.length);
    } catch (error) {
      await rollbackQuietly(client);
      await this.failRun(runId, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async projectPublishedSkill(published: PublishedSkill): Promise<void> {
    await this.projectSkill(published.record.skill_id);
  }

  private async upsertSkill(client: PoolClient, skillId: string, rawVersions: string[]): Promise<void> {
    const versions = sortVersions(rawVersions);
    const projections = versions.map((version) => this.readVersion(skillId, version));
    const latest = projections[0];

    await client.query(
      "delete from catalog_skill_versions where skill_id = $1 and not (version = any($2::text[]))",
      [skillId, versions]
    );

    for (const projection of projections) {
      await client.query(
        `insert into catalog_skill_versions (
          skill_id, version, title, summary, category, category_slug, risk_level, published_at,
          source_url, package_url, reviewer, reviewed_at, review_note, scan_issue_count,
          review_status, static_scan_status, sandbox_status, readme_markdown, readme_html, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, now()
        )
        on conflict (skill_id, version) do update set
          title = excluded.title,
          summary = excluded.summary,
          category = excluded.category,
          category_slug = excluded.category_slug,
          risk_level = excluded.risk_level,
          published_at = excluded.published_at,
          source_url = excluded.source_url,
          package_url = excluded.package_url,
          reviewer = excluded.reviewer,
          reviewed_at = excluded.reviewed_at,
          review_note = excluded.review_note,
          scan_issue_count = excluded.scan_issue_count,
          review_status = excluded.review_status,
          static_scan_status = excluded.static_scan_status,
          sandbox_status = excluded.sandbox_status,
          readme_markdown = excluded.readme_markdown,
          readme_html = excluded.readme_html,
          updated_at = now()`,
        [
          projection.record.skill_id,
          projection.record.version,
          projection.parsed.title,
          projection.parsed.summary,
          projection.parsed.category,
          projection.category_slug,
          projection.record.risk_level,
          projection.record.published_at,
          projection.record.source_url,
          projection.install.package_url,
          projection.attestation.approval.reviewer,
          projection.attestation.approval.reviewed_at,
          projection.attestation.approval.note,
          projection.attestation.scan_issues.length,
          projection.review_status,
          projection.static_scan_status,
          projection.sandbox_status,
          projection.readme_markdown,
          projection.readme_html
        ]
      );
    }

    await client.query("delete from catalog_skill_tags where skill_id = $1", [skillId]);
    for (const tag of latest.parsed.tags) {
      await client.query("insert into catalog_skill_tags (skill_id, tag) values ($1, $2) on conflict do nothing", [skillId, tag]);
    }

    await client.query(
      `insert into catalog_skills (
        skill_id, title, summary, category, category_slug, latest_version, versions_count,
        risk_level, published_at, source_url, package_url, reviewer, reviewed_at,
        review_note, scan_issue_count, review_status, static_scan_status, sandbox_status,
        readme_markdown, readme_html, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18,
        $19, $20, now()
      )
      on conflict (skill_id) do update set
        title = excluded.title,
        summary = excluded.summary,
        category = excluded.category,
        category_slug = excluded.category_slug,
        latest_version = excluded.latest_version,
        versions_count = excluded.versions_count,
        risk_level = excluded.risk_level,
        published_at = excluded.published_at,
        source_url = excluded.source_url,
        package_url = excluded.package_url,
        reviewer = excluded.reviewer,
        reviewed_at = excluded.reviewed_at,
        review_note = excluded.review_note,
        scan_issue_count = excluded.scan_issue_count,
        review_status = excluded.review_status,
        static_scan_status = excluded.static_scan_status,
        sandbox_status = excluded.sandbox_status,
        readme_markdown = excluded.readme_markdown,
        readme_html = excluded.readme_html,
        updated_at = now()`,
      [
        latest.record.skill_id,
        latest.parsed.title,
        latest.parsed.summary,
        latest.parsed.category,
        latest.category_slug,
        latest.record.version,
        versions.length,
        latest.record.risk_level,
        latest.record.published_at,
        latest.record.source_url,
        latest.install.package_url,
        latest.attestation.approval.reviewer,
        latest.attestation.approval.reviewed_at,
        latest.attestation.approval.note,
        latest.attestation.scan_issues.length,
        latest.review_status,
        latest.static_scan_status,
        latest.sandbox_status,
        latest.readme_markdown,
        latest.readme_html
      ]
    );
  }

  private readIndex(): SkillIndexEntry[] {
    const indexPath = join(this.config.localSkillsRepo, "index", "skills-index.json");
    try {
      return JSON.parse(readFileSync(indexPath, "utf8")) as SkillIndexEntry[];
    } catch {
      return [];
    }
  }

  private readVersion(skillId: string, version: string): CatalogVersionProjection {
    const metadataPath = join(this.config.localSkillsRepo, "metadata", skillId, `${version}.json`);
    const installPath = join(this.config.localSkillsRepo, "install-manifests", skillId, `${version}.json`);
    const attestationPath = join(this.config.localSkillsRepo, "attestations", skillId, `${version}.json`);
    const readmePath = join(this.config.localSkillsRepo, "skills", skillId, version, "SKILL.md");

    const record = JSON.parse(readFileSync(metadataPath, "utf8")) as SkillRecord;
    const install = JSON.parse(readFileSync(installPath, "utf8")) as InstallManifest;
    const attestation = JSON.parse(readFileSync(attestationPath, "utf8")) as AttestationEnvelope;
    const readmeMarkdown = readFileSync(readmePath, "utf8");
    const parsed = parseSkillMarkdown(skillId, readmeMarkdown);

    return {
      record,
      install,
      attestation,
      readme_markdown: readmeMarkdown,
      readme_html: renderSkillMarkdown(readmeMarkdown),
      parsed,
      category_slug: slugify(parsed.category),
      review_status: approvalStatus(attestation),
      static_scan_status: scanStatus(attestation),
      sandbox_status: sandboxStatus(attestation)
    };
  }

  private async finishRun(runId: string, status: string, skillsScanned: number, versionsScanned: number): Promise<void> {
    await this.pool.query(
      "update catalog_sync_runs set status = $2, finished_at = now(), skills_scanned = $3, versions_scanned = $4 where id = $1",
      [runId, status, skillsScanned, versionsScanned]
    );
  }

  private async failRun(runId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.pool.query(
      "update catalog_sync_runs set status = $2, finished_at = now(), error_message = $3 where id = $1",
      [runId, "failed", message]
    );
  }
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("rollback");
  } catch {
    return;
  }
}
