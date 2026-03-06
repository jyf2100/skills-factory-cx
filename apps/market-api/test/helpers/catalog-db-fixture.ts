import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../../src/config.js";

interface SkillVersionInput {
  skillId: string;
  version: string;
  title: string;
  summary: string;
  category?: string;
  tags?: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  reviewer: string;
  reviewNote: string;
  publishedAt: string;
  reviewedAt: string;
  scanIssueCount?: number;
  sandboxOk?: boolean;
}

export function createCatalogFixtureRepo(entries: SkillVersionInput[]): { root: string; config: ReturnType<typeof loadConfig>; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "catalog-db-fixture-"));
  const config = { ...loadConfig(), localSkillsRepo: root };
  const index = new Map<string, string[]>();

  for (const entry of entries) {
    const versions = index.get(entry.skillId) ?? [];
    versions.push(entry.version);
    index.set(entry.skillId, versions);

    writeJson(join(root, "metadata", entry.skillId, `${entry.version}.json`), {
      skill_id: entry.skillId,
      version: entry.version,
      source_url: `https://example.com/${entry.skillId}`,
      source_commit: `commit-${entry.skillId}-${entry.version}`,
      hash_sha256: `sha-${entry.skillId}-${entry.version}`,
      license: "MIT",
      risk_level: entry.riskLevel,
      published_at: entry.publishedAt
    });

    writeJson(join(root, "install-manifests", entry.skillId, `${entry.version}.json`), {
      skill_id: entry.skillId,
      version: entry.version,
      package_url: `https://example.com/packages/${entry.skillId}/${entry.version}.tgz`,
      package_sha256: `sha-${entry.skillId}-${entry.version}`,
      signature: `sig-${entry.skillId}-${entry.version}`,
      public_key_id: "market-ed25519-v1",
      source_url: `https://example.com/${entry.skillId}`,
      published_at: entry.publishedAt
    });

    writeJson(join(root, "attestations", entry.skillId, `${entry.version}.json`), {
      ingest_id: `ing-${entry.skillId}-${entry.version}`,
      scan_issues: Array.from({ length: entry.scanIssueCount ?? 0 }, (_item, index) => ({
        rule: `rule-${index}`,
        severity: "medium",
        message: "issue",
        file: "SKILL.md"
      })),
      sandbox_result: {
        ran: true,
        runtime: "docker",
        ok: entry.sandboxOk ?? true,
        output: entry.sandboxOk === false ? "blocked" : "ok"
      },
      approval: {
        ingest_id: `ing-${entry.skillId}-${entry.version}`,
        reviewer: entry.reviewer,
        decision: "approve",
        note: entry.reviewNote,
        reviewed_at: entry.reviewedAt
      },
      signature: `sig-${entry.skillId}-${entry.version}`,
      key_id: "market-ed25519-v1"
    });

    const category = entry.category ?? "development";
    const tags = entry.tags ?? [];
    const frontmatter = [
      "---",
      `name: ${entry.title}`,
      "description: >-",
      `  ${entry.summary}`,
      "metadata:",
      `  category: ${category}`,
      "  tags:",
      ...tags.map((tag) => `    - ${tag}`),
      "---",
      "",
      `# ${entry.title}`,
      "",
      entry.summary,
      "",
      "- item one",
      "- item two",
      "",
      "```ts",
      "console.log('demo')",
      "```",
      ""
    ].join("\n");
    writeText(join(root, "skills", entry.skillId, entry.version, "SKILL.md"), frontmatter);
  }

  writeJson(
    join(root, "index", "skills-index.json"),
    [...index.entries()].map(([skillId, versions]) => ({ skill_id: skillId, versions }))
  );

  return {
    root,
    config,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}
