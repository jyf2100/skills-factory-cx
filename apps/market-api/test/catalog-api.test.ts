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

describe("gitlab-backed catalog service", () => {
  it("lists published skills from gitlab raw index", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/index/skills-index.json")) {
        return jsonResponse([{ skill_id: "demo-skill", versions: ["0.1.0", "0.2.0"] }]);
      }
      if (url.endsWith("/metadata/demo-skill/0.2.0.json")) {
        return jsonResponse({
          skill_id: "demo-skill",
          version: "0.2.0",
          source_url: "https://gitlab.local/root/demo-skill",
          source_commit: "abc123",
          hash_sha256: "deadbeef",
          license: "MIT",
          risk_level: "low",
          published_at: "2026-03-06T02:00:00.000Z"
        });
      }
      if (url.endsWith("/install-manifests/demo-skill/0.2.0.json")) {
        return jsonResponse({
          skill_id: "demo-skill",
          version: "0.2.0",
          package_url: `${rawBaseUrl}/packages/demo-skill/0.2.0.tgz`,
          package_sha256: "deadbeef",
          signature: "sig",
          public_key_id: "market-ed25519-v1",
          source_url: "https://gitlab.local/root/demo-skill",
          published_at: "2026-03-06T02:00:00.000Z"
        });
      }
      if (url.endsWith("/attestations/demo-skill/0.2.0.json")) {
        return jsonResponse({
          ingest_id: "ing-1",
          scan_issues: [],
          sandbox_result: { ran: true, runtime: "docker", ok: true, output: "ok" },
          approval: {
            ingest_id: "ing-1",
            reviewer: "alice",
            decision: "approve",
            note: "looks good",
            reviewed_at: "2026-03-06T02:01:00.000Z"
          },
          signature: "sig",
          key_id: "market-ed25519-v1"
        });
      }
      if (url.endsWith("/skills/demo-skill/0.2.0/SKILL.md")) {
        return new Response("# Demo Skill\n\nA local GitLab-backed demo skill.\n", { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const service = new GitLabCatalogService({ rawBaseUrl, fetchBaseUrl: rawBaseUrl, fetchImpl: fetchMock as typeof fetch });
    const items = await service.listSkills();

    expect(items).toEqual([
      expect.objectContaining({
        skill_id: "demo-skill",
        title: "Demo Skill",
        summary: "A local GitLab-backed demo skill.",
        latest_version: "0.2.0",
        versions_count: 2,
        source_url: "https://gitlab.local/root/demo-skill"
      })
    ]);
  });

  it("returns skill detail and recent audits from gitlab raw content", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/index/skills-index.json")) {
        return jsonResponse([{ skill_id: "demo-skill", versions: ["0.1.0"] }]);
      }
      if (url.endsWith("/metadata/demo-skill/0.1.0.json")) {
        return jsonResponse({
          skill_id: "demo-skill",
          version: "0.1.0",
          source_url: "https://gitlab.local/root/demo-skill",
          source_commit: "abc123",
          hash_sha256: "deadbeef",
          license: "MIT",
          risk_level: "medium",
          published_at: "2026-03-05T10:00:00.000Z"
        });
      }
      if (url.endsWith("/install-manifests/demo-skill/0.1.0.json")) {
        return jsonResponse({
          skill_id: "demo-skill",
          version: "0.1.0",
          package_url: `${rawBaseUrl}/packages/demo-skill/0.1.0.tgz`,
          package_sha256: "deadbeef",
          signature: "sig",
          public_key_id: "market-ed25519-v1",
          source_url: "https://gitlab.local/root/demo-skill",
          published_at: "2026-03-05T10:00:00.000Z"
        });
      }
      if (url.endsWith("/attestations/demo-skill/0.1.0.json")) {
        return jsonResponse({
          ingest_id: "ing-2",
          scan_issues: [{ rule: "network", severity: "medium", message: "needs review", file: "SKILL.md" }],
          sandbox_result: { ran: true, runtime: "docker", ok: true, output: "ok" },
          approval: {
            ingest_id: "ing-2",
            reviewer: "bob",
            decision: "approve",
            note: "reviewed",
            reviewed_at: "2026-03-05T10:10:00.000Z"
          },
          signature: "sig",
          key_id: "market-ed25519-v1"
        });
      }
      if (url.endsWith("/skills/demo-skill/0.1.0/SKILL.md")) {
        return new Response("# Demo Skill\n\nThis skill has audit evidence.\n", { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const service = new GitLabCatalogService({ rawBaseUrl, fetchBaseUrl: rawBaseUrl, fetchImpl: fetchMock as typeof fetch });
    const detail = await service.getSkillDetail("demo-skill");
    const audits = await service.listAudits();

    expect(detail).toEqual(
      expect.objectContaining({
        skill_id: "demo-skill",
        title: "Demo Skill",
        latest_version: "0.1.0",
        readme_markdown: expect.stringContaining("This skill has audit evidence."),
        versions: [expect.objectContaining({ version: "0.1.0", reviewer: "bob", risk_level: "medium" })]
      })
    );

    expect(audits).toEqual([
      expect.objectContaining({
        skill_id: "demo-skill",
        version: "0.1.0",
        reviewer: "bob",
        risk_level: "medium"
      })
    ]);
  });
});
