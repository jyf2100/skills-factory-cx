import { afterEach, describe, expect, it, vi } from "vitest";
import { GitLabCatalogService } from "../src/services/gitlab-catalog.js";

const rawBaseUrl = "http://gitlab.local/root/skills-repo/-/raw/main";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createFetchFixture() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/index/skills-index.json")) {
      return jsonResponse([
        { skill_id: "react-state", versions: ["0.1.0", "0.2.0"] },
        { skill_id: "design-system", versions: ["1.0.0"] },
        { skill_id: "ops-skill", versions: ["0.1.0"] }
      ]);
    }

    if (url.endsWith("/metadata/react-state/0.2.0.json")) {
      return jsonResponse({ skill_id: "react-state", version: "0.2.0", source_url: "https://gitlab.local/root/react-state", source_commit: "abc123", hash_sha256: "hash-1", license: "MIT", risk_level: "low", published_at: "2026-03-06T03:00:00.000Z" });
    }
    if (url.endsWith("/metadata/react-state/0.1.0.json")) {
      return jsonResponse({ skill_id: "react-state", version: "0.1.0", source_url: "https://gitlab.local/root/react-state", source_commit: "abc122", hash_sha256: "hash-0", license: "MIT", risk_level: "low", published_at: "2026-03-05T03:00:00.000Z" });
    }
    if (url.endsWith("/metadata/design-system/1.0.0.json")) {
      return jsonResponse({ skill_id: "design-system", version: "1.0.0", source_url: "https://gitlab.local/root/design-system", source_commit: "def123", hash_sha256: "hash-2", license: "Apache-2.0", risk_level: "medium", published_at: "2026-03-01T09:00:00.000Z" });
    }
    if (url.endsWith("/metadata/ops-skill/0.1.0.json")) {
      return jsonResponse({ skill_id: "ops-skill", version: "0.1.0", source_url: "https://gitlab.local/root/ops-skill", source_commit: "ops001", hash_sha256: "hash-3", license: "Apache-2.0", risk_level: "high", published_at: "2026-02-15T09:00:00.000Z" });
    }

    if (url.includes("/install-manifests/")) {
      const match = url.match(/install-manifests\/([^/]+)\/([^/]+)\.json$/);
      if (!match) throw new Error(`unexpected url ${url}`);
      const [, skillId, version] = match;
      return jsonResponse({ skill_id: skillId, version, package_url: `${rawBaseUrl}/packages/${skillId}/${version}.tgz`, package_sha256: `sha-${skillId}-${version}`, signature: "sig", public_key_id: "market-ed25519-v1", source_url: `https://gitlab.local/root/${skillId}`, published_at: "2026-03-06T03:00:00.000Z" });
    }

    if (url.endsWith("/attestations/react-state/0.2.0.json")) {
      return jsonResponse({ ingest_id: "ing-react-2", scan_issues: [], sandbox_result: { ran: true, runtime: "docker", ok: true, output: "ok" }, approval: { ingest_id: "ing-react-2", reviewer: "alice", decision: "approve", note: "clean review", reviewed_at: "2026-03-06T03:10:00.000Z" }, signature: "sig", key_id: "market-ed25519-v1" });
    }
    if (url.endsWith("/attestations/react-state/0.1.0.json")) {
      return jsonResponse({ ingest_id: "ing-react-1", scan_issues: [], sandbox_result: { ran: true, runtime: "docker", ok: true, output: "ok" }, approval: { ingest_id: "ing-react-1", reviewer: "alice", decision: "approve", note: "stable", reviewed_at: "2026-03-05T03:10:00.000Z" }, signature: "sig", key_id: "market-ed25519-v1" });
    }
    if (url.endsWith("/attestations/design-system/1.0.0.json")) {
      return jsonResponse({ ingest_id: "ing-design", scan_issues: [{ rule: "network", severity: "medium", message: "network access", file: "SKILL.md" }], sandbox_result: { ran: true, runtime: "docker", ok: true, output: "ok" }, approval: { ingest_id: "ing-design", reviewer: "bob", decision: "approve", note: "needs awareness", reviewed_at: "2026-03-01T10:00:00.000Z" }, signature: "sig", key_id: "market-ed25519-v1" });
    }
    if (url.endsWith("/attestations/ops-skill/0.1.0.json")) {
      return jsonResponse({ ingest_id: "ing-ops", scan_issues: [{ rule: "shell", severity: "high", message: "shell exec", file: "run.sh" }], sandbox_result: { ran: true, runtime: "docker", ok: false, output: "denied" }, approval: { ingest_id: "ing-ops", reviewer: "carol", decision: "approve", note: "restricted ops", reviewed_at: "2026-02-15T10:00:00.000Z" }, signature: "sig", key_id: "market-ed25519-v1" });
    }

    if (url.endsWith("/skills/react-state/0.2.0/SKILL.md")) {
      return new Response("---\nname: React State Toolkit\ndescription: >-\n  Manage shared React state safely.\nmetadata:\n  category: development\n  tags:\n    - react\n    - state\n---\n\n# React State Toolkit\n", { status: 200 });
    }
    if (url.endsWith("/skills/react-state/0.1.0/SKILL.md")) {
      return new Response("---\nname: React State Toolkit\ndescription: >-\n  Manage shared React state safely.\nmetadata:\n  category: development\n  tags:\n    - react\n    - state\n---\n", { status: 200 });
    }
    if (url.endsWith("/skills/design-system/1.0.0/SKILL.md")) {
      return new Response("---\nname: Design System Auditor\ndescription: >-\n  Review design systems and tokens.\nmetadata:\n  category: design\n  tags:\n    - figma\n    - tokens\n---\n", { status: 200 });
    }
    if (url.endsWith("/skills/ops-skill/0.1.0/SKILL.md")) {
      return new Response("# Ops Skill\n\nInfrastructure automation for internal teams.\n", { status: 200 });
    }

    throw new Error(`unexpected url ${url}`);
  });
}

describe("gitlab catalog extras", () => {
  it("builds leaderboard modes from gitlab-backed releases", async () => {
    const service = new GitLabCatalogService({ rawBaseUrl, fetchBaseUrl: rawBaseUrl, fetchImpl: createFetchFixture() as typeof fetch });
    const leaderboard = await service.getLeaderboard();
    expect(leaderboard.all_time[0]).toEqual(expect.objectContaining({ skill_id: "react-state", title: "React State Toolkit", category: "development" }));
    expect(leaderboard.trending[0].skill_id).toBe("react-state");
    expect(leaderboard.hot[0].skill_id).toBe("react-state");
  });

  it("builds audits and categories with derived statuses", async () => {
    const service = new GitLabCatalogService({ rawBaseUrl, fetchBaseUrl: rawBaseUrl, fetchImpl: createFetchFixture() as typeof fetch });
    const audits = await service.listAudits(10);
    const categories = await service.listCategories();
    const designCategory = await service.getCategoryDetail("design");

    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill_id: "design-system", review_status: "approved", static_scan_status: "issues_detected", sandbox_status: "passed" }),
      expect.objectContaining({ skill_id: "ops-skill", sandbox_status: "blocked" })
    ]));
    expect(categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "development", label: "Development", skills_count: 1 }),
      expect.objectContaining({ slug: "design", label: "Design", skills_count: 1 }),
      expect.objectContaining({ slug: "uncategorized", label: "Uncategorized", skills_count: 1 })
    ]));
    expect(designCategory).toEqual(expect.objectContaining({ slug: "design", items: [expect.objectContaining({ skill_id: "design-system", category: "design" })] }));
  });

  it("returns category detail and single-skill audit detail", async () => {
    const service = new GitLabCatalogService({ rawBaseUrl, fetchBaseUrl: rawBaseUrl, fetchImpl: createFetchFixture() as typeof fetch });
    const category = await service.getCategoryDetail("development");
    const auditDetail = await service.getAuditDetail("react-state");

    expect(category).toEqual(expect.objectContaining({ slug: "development", label: "Development", items: [expect.objectContaining({ skill_id: "react-state", category: "development" })] }));
    expect(auditDetail).toEqual(expect.objectContaining({
      skill_id: "react-state",
      title: "React State Toolkit",
      latest_version: "0.2.0",
      latest_review_status: "approved",
      versions: [
        expect.objectContaining({ version: "0.2.0", reviewer: "alice", sandbox_status: "passed" }),
        expect.objectContaining({ version: "0.1.0", reviewer: "alice", sandbox_status: "passed" })
      ]
    }));
  });
});
