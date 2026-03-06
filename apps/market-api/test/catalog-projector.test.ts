import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadDotEnv } from "@skills/shared";
import { createDbPool } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { CatalogProjector } from "../src/services/catalog-projector.js";
import { PostgresCatalogService } from "../src/services/postgres-catalog.js";
import { createCatalogFixtureRepo } from "./helpers/catalog-db-fixture.js";
import { loadConfig } from "../src/config.js";

loadDotEnv();
const baseConfig = loadConfig();
const pool = createDbPool(baseConfig);

beforeAll(async () => {
  await runMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query("truncate table catalog_sync_runs, catalog_skill_tags, catalog_skill_versions, catalog_skills");
});

afterEach(async () => {
  await pool.query("truncate table catalog_sync_runs, catalog_skill_tags, catalog_skill_versions, catalog_skills");
});

describe("catalog projector", () => {
  it("rebuilds local repo into postgres read model", async () => {
    const fixture = createCatalogFixtureRepo([
      {
        skillId: "react-state",
        version: "0.2.0",
        title: "React State Toolkit",
        summary: "Manage shared React state safely.",
        category: "development",
        tags: ["react", "state"],
        riskLevel: "low",
        reviewer: "alice",
        reviewNote: "approved",
        publishedAt: "2026-03-06T03:00:00.000Z",
        reviewedAt: "2026-03-06T03:10:00.000Z"
      },
      {
        skillId: "react-state",
        version: "0.1.0",
        title: "React State Toolkit",
        summary: "Manage shared React state safely.",
        category: "development",
        tags: ["react", "state"],
        riskLevel: "medium",
        reviewer: "alice",
        reviewNote: "older",
        publishedAt: "2026-03-05T03:00:00.000Z",
        reviewedAt: "2026-03-05T03:10:00.000Z"
      },
      {
        skillId: "design-system",
        version: "1.0.0",
        title: "Design System Auditor",
        summary: "Review design systems and tokens.",
        category: "design",
        tags: ["figma", "tokens"],
        riskLevel: "medium",
        reviewer: "bob",
        reviewNote: "watch network",
        publishedAt: "2026-03-04T03:00:00.000Z",
        reviewedAt: "2026-03-04T03:10:00.000Z",
        scanIssueCount: 1,
        sandboxOk: false
      }
    ]);

    try {
      const projector = new CatalogProjector(pool, fixture.config);
      const repo = new PostgresCatalogService(pool, fixture.config);
      await projector.rebuildAll();

      const skills = await repo.listSkills();
      const detail = await repo.getSkillDetail("react-state");
      const audits = await repo.listAudits(10);

      expect(skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ skill_id: "react-state", latest_version: "0.2.0", versions_count: 2 }),
          expect.objectContaining({ skill_id: "design-system", category: "design" })
        ])
      );
      expect(detail).toEqual(
        expect.objectContaining({
          skill_id: "react-state",
          title: "React State Toolkit",
          readme_html: expect.stringContaining("<h1>React State Toolkit</h1>"),
          versions: [expect.objectContaining({ version: "0.2.0" }), expect.objectContaining({ version: "0.1.0" })]
        })
      );
      expect(audits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ skill_id: "design-system", static_scan_status: "issues_detected", sandbox_status: "blocked" })
        ])
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("projects a single skill after a new version is published", async () => {
    const fixture = createCatalogFixtureRepo([
      {
        skillId: "api-design",
        version: "0.1.0",
        title: "API Design",
        summary: "Design production APIs.",
        category: "development",
        tags: ["api"],
        riskLevel: "low",
        reviewer: "roc",
        reviewNote: "initial",
        publishedAt: "2026-03-05T03:00:00.000Z",
        reviewedAt: "2026-03-05T03:10:00.000Z"
      }
    ]);

    try {
      const projector = new CatalogProjector(pool, fixture.config);
      const repo = new PostgresCatalogService(pool, fixture.config);
      await projector.rebuildAll();
      let detail = await repo.getSkillDetail("api-design");
      expect(detail?.latest_version).toBe("0.1.0");

      const updatedFixture = createCatalogFixtureRepo([
        {
          skillId: "api-design",
          version: "0.1.0",
          title: "API Design",
          summary: "Design production APIs.",
          category: "development",
          tags: ["api"],
          riskLevel: "low",
          reviewer: "roc",
          reviewNote: "initial",
          publishedAt: "2026-03-05T03:00:00.000Z",
          reviewedAt: "2026-03-05T03:10:00.000Z"
        },
        {
          skillId: "api-design",
          version: "0.2.0",
          title: "API Design",
          summary: "Design production APIs with pagination.",
          category: "development",
          tags: ["api", "rest"],
          riskLevel: "low",
          reviewer: "roc",
          reviewNote: "upgrade",
          publishedAt: "2026-03-06T03:00:00.000Z",
          reviewedAt: "2026-03-06T03:10:00.000Z"
        }
      ]);

      fixture.cleanup();
      fixture.config.localSkillsRepo = updatedFixture.root;
      await projector.projectSkill("api-design");
      detail = await repo.getSkillDetail("api-design");
      expect(detail).toEqual(expect.objectContaining({ latest_version: "0.2.0", versions_count: 2 }));
      updatedFixture.cleanup();
    } finally {
      try { fixture.cleanup(); } catch {}
    }
  });
});
