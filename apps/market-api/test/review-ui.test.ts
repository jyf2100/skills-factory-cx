import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { JsonStateStore } from "../src/state.js";
import type { AppConfig } from "../src/config.js";

describe("review console UI", () => {
  it("renders admin console sections", async () => {
    const root = mkdtempSync(join(tmpdir(), "skills-market-"));
    const config: AppConfig = {
      port: 0,
      host: "127.0.0.1",
      baseUrl: "http://127.0.0.1:4311",
      dataDir: join(root, "data"),
      localSkillsRepo: join(root, "repo"),
      whitelistSources: ["https://github.com"],
      signingPrivateKeyPath: join(root, "keys", "private.pem"),
      signingPublicKeyPath: join(root, "keys", "public.pem"),
      gitPushBranch: "main"
    };

    const store = new JsonStateStore(config.dataDir, config.whitelistSources);
    const app = createApp({ config, store });

    const response = await request(app).get("/review");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Skills Admin Console");
    expect(response.text).toContain("Search &amp; Import");
    expect(response.text).toContain("Review Queue");
    expect(response.text).toContain("Published");
    expect(response.text).toContain("Queued Imports");
    expect(response.text).toContain("Audit &amp; Install");
  });
});
