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

describe("postgres catalog service", () => {
  it("supports category filtering, audit detail, and version detail", async () => {
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
        skillId: "react-forms",
        version: "1.0.0",
        title: "React Forms Assistant",
        summary: "Build forms with reusable hooks.",
        category: "development",
        tags: ["react", "forms"],
        riskLevel: "medium",
        reviewer: "dora",
        reviewNote: "forms ready",
        publishedAt: "2026-03-04T09:00:00.000Z",
        reviewedAt: "2026-03-04T09:30:00.000Z"
      }
    ]);

    try {
      const projector = new CatalogProjector(pool, fixture.config);
      const repo = new PostgresCatalogService(pool, fixture.config);
      await projector.rebuildAll();

      const category = await repo.getCategoryDetail("development", { sort: "title", q: "react", tag: "forms" });
      const auditDetail = await repo.getAuditDetail("react-state");
      const auditVersion = await repo.getAuditVersionDetail("react-forms", "1.0.0");
      const leaderboard = await repo.getLeaderboard(5);

      expect(category).toEqual(expect.objectContaining({ slug: "development", label: "Development" }));
      expect(category?.items).toEqual([expect.objectContaining({ skill_id: "react-forms", title: "React Forms Assistant" })]);
      expect(auditDetail).toEqual(expect.objectContaining({ skill_id: "react-state", latest_version: "0.2.0" }));
      expect(auditVersion).toEqual(expect.objectContaining({ skill_id: "react-forms", version: "1.0.0", reviewer: "dora" }));
      expect(leaderboard.all_time[0]).toEqual(expect.objectContaining({ skill_id: "react-state" }));
    } finally {
      fixture.cleanup();
    }
  });
});
