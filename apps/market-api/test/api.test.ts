import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ensureEd25519Keypair, verifyHashSignature, type IngestRecord } from "@skills/shared";
import { createApp } from "../src/app.js";
import { JsonStateStore } from "../src/state.js";
import type { AppConfig } from "../src/config.js";
import { publishSkill } from "../src/services/publisher.js";

describe("market api", () => {
  it("rejects non-whitelisted import", async () => {
    const root = mkdtempSync(join(tmpdir(), "skills-market-"));
    const config: AppConfig = {
      port: 0,
      host: "127.0.0.1",
      baseUrl: "http://127.0.0.1:4310",
      dataDir: join(root, "data"),
      localSkillsRepo: join(root, "repo"),
      whitelistSources: ["https://github.com"],
      signingPrivateKeyPath: join(root, "keys", "private.pem"),
      signingPublicKeyPath: join(root, "keys", "public.pem")
    };
    ensureEd25519Keypair(config.signingPrivateKeyPath, config.signingPublicKeyPath);

    const store = new JsonStateStore(config.dataDir, config.whitelistSources);
    const app = createApp({ config, store });

    const response = await request(app).post("/api/v1/ingest/import").send({
      source_url: "https://evil.example.com/repo.git"
    });

    expect(response.status).toBe(400);
    expect(String(response.body.error)).toContain("not in whitelist");
  });

  it("enqueues and tracks ingest jobs", async () => {
    const root = mkdtempSync(join(tmpdir(), "skills-market-"));
    const config: AppConfig = {
      port: 0,
      host: "127.0.0.1",
      baseUrl: "http://127.0.0.1:4310",
      dataDir: join(root, "data"),
      localSkillsRepo: join(root, "repo"),
      whitelistSources: ["https://github.com"],
      signingPrivateKeyPath: join(root, "keys", "private.pem"),
      signingPublicKeyPath: join(root, "keys", "public.pem")
    };
    ensureEd25519Keypair(config.signingPrivateKeyPath, config.signingPublicKeyPath);

    const store = new JsonStateStore(config.dataDir, config.whitelistSources);
    const app = createApp({ config, store });

    const enqueueRes = await request(app).post("/api/v1/ingest/jobs").send({
      source_url: "https://github.com/acme/sample-skill",
      query: "sample"
    });

    expect(enqueueRes.status).toBe(202);
    expect(enqueueRes.body.job.status).toBe("queued");

    const jobId = String(enqueueRes.body.job.id);
    const claimRes = await request(app).post("/api/v1/ingest/jobs/claim").send({ worker_id: "worker-1" });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.job.id).toBe(jobId);
    expect(claimRes.body.job.status).toBe("processing");

    const completeRes = await request(app)
      .post(`/api/v1/ingest/jobs/${jobId}/complete`)
      .send({ worker_id: "worker-1", ingest_id: "ing-queued-1" });
    expect(completeRes.status).toBe(200);

    const secondRes = await request(app).post("/api/v1/ingest/jobs").send({
      source_url: "https://github.com/acme/sample-fail",
      query: "sample"
    });
    const secondId = String(secondRes.body.job.id);
    await request(app).post("/api/v1/ingest/jobs/claim").send({ worker_id: "worker-1" });

    const failRes = await request(app)
      .post(`/api/v1/ingest/jobs/${secondId}/fail`)
      .send({ worker_id: "worker-1", error: "git clone failed" });
    expect(failRes.status).toBe(200);

    const jobsRes = await request(app).get("/api/v1/ingest/jobs");
    expect(jobsRes.status).toBe(200);
    expect(jobsRes.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: jobId, status: "completed", ingest_id: "ing-queued-1" }),
        expect.objectContaining({ id: secondId, status: "failed", error: "git clone failed" })
      ])
    );
  });

  it("publishes approved skill and serves install manifest", async () => {
    const root = mkdtempSync(join(tmpdir(), "skills-market-"));
    const config: AppConfig = {
      port: 0,
      host: "127.0.0.1",
      baseUrl: "http://127.0.0.1:4310",
      dataDir: join(root, "data"),
      localSkillsRepo: join(root, "repo"),
      whitelistSources: ["https://github.com"],
      signingPrivateKeyPath: join(root, "keys", "private.pem"),
      signingPublicKeyPath: join(root, "keys", "public.pem")
    };
    ensureEd25519Keypair(config.signingPrivateKeyPath, config.signingPublicKeyPath);

    const workspacePath = join(root, "sample-skill");
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(join(workspacePath, "SKILL.md"), "# sample\n", "utf8");

    const ingest: IngestRecord = {
      id: "ing-1",
      source_url: "https://github.com/acme/sample-skill",
      imported_at: new Date().toISOString(),
      status: "pending_review",
      skill_id: "sample-skill",
      version: "0.1.0",
      workspace_path: workspacePath,
      source_commit: "abc123",
      scan_issues: [],
      risk_level: "low",
      sandbox_result: { ran: false, runtime: "none", ok: true, output: "skipped" }
    };

    const store = new JsonStateStore(config.dataDir, config.whitelistSources);
    store.appendIngest(ingest);

    const app = createApp({ config, store });
    const approveRes = await request(app).post("/api/v1/reviews/ing-1/approve").send({ reviewer: "alice" });
    expect(approveRes.status).toBe(200);

    const manifestRes = await request(app).get("/api/v1/install/sample-skill/0.1.0");
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.body.skill_id).toBe("sample-skill");

    const publicKeyPem = readFileSync(config.signingPublicKeyPath, "utf8");
    expect(
      verifyHashSignature(manifestRes.body.package_sha256, manifestRes.body.signature, publicKeyPem)
    ).toBe(true);
  });

  it("serves install manifest and package from local skills repo even when state is empty", async () => {
    const root = mkdtempSync(join(tmpdir(), "skills-market-"));
    const config: AppConfig = {
      port: 0,
      host: "127.0.0.1",
      baseUrl: "http://127.0.0.1:4311",
      dataDir: join(root, "data"),
      localSkillsRepo: join(root, "repo"),
      whitelistSources: ["https://github.com"],
      signingPrivateKeyPath: join(root, "keys", "private.pem"),
      signingPublicKeyPath: join(root, "keys", "public.pem")
    };
    ensureEd25519Keypair(config.signingPrivateKeyPath, config.signingPublicKeyPath);

    const workspacePath = join(root, "local-repo-skill");
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(join(workspacePath, "SKILL.md"), "# local repo skill\n", "utf8");

    const ingest: IngestRecord = {
      id: "ing-local-repo",
      source_url: "https://github.com/acme/local-repo-skill",
      imported_at: new Date().toISOString(),
      status: "approved",
      skill_id: "local-repo-skill",
      version: "1.0.0",
      workspace_path: workspacePath,
      source_commit: "abc123",
      scan_issues: [],
      risk_level: "low",
      sandbox_result: { ran: false, runtime: "none", ok: true, output: "skipped" }
    };

    await publishSkill({
      ingest,
      approval: {
        ingest_id: ingest.id,
        reviewer: "alice",
        decision: "approve",
        note: "ok",
        reviewed_at: new Date().toISOString()
      },
      config
    });

    const store = new JsonStateStore(config.dataDir, config.whitelistSources);
    const app = createApp({ config, store });

    const manifestRes = await request(app).get("/api/v1/install/local-repo-skill/1.0.0");
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.body.skill_id).toBe("local-repo-skill");

    const packageRes = await request(app).get("/api/v1/packages/local-repo-skill/1.0.0");
    expect(packageRes.status).toBe(200);

    const logRes = await request(app).post("/api/v1/install-log/local-repo-skill/1.0.0").send({ actor: "tester" });
    expect(logRes.status).toBe(202);
  });

  it("returns 500 when publish fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "skills-market-"));
    const config: AppConfig = {
      port: 0,
      host: "127.0.0.1",
      baseUrl: "http://127.0.0.1:4310",
      dataDir: join(root, "data"),
      localSkillsRepo: join(root, "repo"),
      whitelistSources: ["https://github.com"],
      signingPrivateKeyPath: join(root, "keys", "private.pem"),
      signingPublicKeyPath: join(root, "keys", "public.pem"),
      gitRemoteUrl: "http://127.0.0.1:9/nowhere.git",
      gitPushBranch: "main"
    };
    ensureEd25519Keypair(config.signingPrivateKeyPath, config.signingPublicKeyPath);

    const workspacePath = join(root, "sample-skill");
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(join(workspacePath, "SKILL.md"), "# sample\n", "utf8");

    const ingest: IngestRecord = {
      id: "ing-3",
      source_url: "https://github.com/acme/sample-skill",
      imported_at: new Date().toISOString(),
      status: "pending_review",
      skill_id: "sample-skill",
      version: "0.1.0",
      workspace_path: workspacePath,
      source_commit: "abc123",
      scan_issues: [],
      risk_level: "low",
      sandbox_result: { ran: false, runtime: "none", ok: true, output: "skipped" }
    };

    const store = new JsonStateStore(config.dataDir, config.whitelistSources);
    store.appendIngest(ingest);

    const app = createApp({ config, store });
    const approveRes = await request(app).post("/api/v1/reviews/ing-3/approve").send({ reviewer: "alice" });
    expect(approveRes.status).toBe(500);
    expect(String(approveRes.body.error ?? "")).toContain("publish failed");
  });

  it("publishes helper creates a git commit without relying on global git config", async () => {
    const root = mkdtempSync(join(tmpdir(), "skills-market-"));
    const originalHome = process.env.HOME;
    const originalGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL;
    process.env.HOME = join(root, "home-without-git-config");
    process.env.GIT_CONFIG_GLOBAL = join(root, "missing-gitconfig");

    try {
      const config: AppConfig = {
        port: 0,
        host: "127.0.0.1",
        baseUrl: "http://127.0.0.1:4310",
        dataDir: join(root, "data"),
        localSkillsRepo: join(root, "repo"),
        whitelistSources: ["https://github.com"],
        signingPrivateKeyPath: join(root, "keys", "private.pem"),
        signingPublicKeyPath: join(root, "keys", "public.pem")
      };

      const workspacePath = join(root, "skill-no-global-config");
      mkdirSync(workspacePath, { recursive: true });
      writeFileSync(join(workspacePath, "SKILL.md"), "# local\n", "utf8");

      const ingest: IngestRecord = {
        id: "ing-commit",
        source_url: "https://github.com/acme/skill",
        imported_at: new Date().toISOString(),
        status: "pending_review",
        skill_id: "skill-no-global-config",
        version: "1.0.0",
        workspace_path: workspacePath,
        source_commit: "fff",
        scan_issues: [],
        risk_level: "low",
        sandbox_result: { ran: false, runtime: "none", ok: true, output: "skip" }
      };

      await publishSkill({
        ingest,
        approval: {
          ingest_id: ingest.id,
          reviewer: "bob",
          decision: "approve",
          note: "ok",
          reviewed_at: new Date().toISOString()
        },
        config
      });

      const logOutput = readFileSync(join(config.localSkillsRepo, ".git", "logs", "HEAD"), "utf8");
      expect(logOutput).toContain("publish skill-no-global-config@1.0.0");
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      if (originalGitConfigGlobal === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL;
      } else {
        process.env.GIT_CONFIG_GLOBAL = originalGitConfigGlobal;
      }
    }
  });

  it("publishes helper writes index", async () => {
    const root = mkdtempSync(join(tmpdir(), "skills-market-"));
    const config: AppConfig = {
      port: 0,
      host: "127.0.0.1",
      baseUrl: "http://127.0.0.1:4310",
      dataDir: join(root, "data"),
      localSkillsRepo: join(root, "repo"),
      whitelistSources: ["https://github.com"],
      signingPrivateKeyPath: join(root, "keys", "private.pem"),
      signingPublicKeyPath: join(root, "keys", "public.pem")
    };

    const workspacePath = join(root, "skill");
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(join(workspacePath, "SKILL.md"), "# local\n", "utf8");

    const ingest: IngestRecord = {
      id: "ing-2",
      source_url: "https://github.com/acme/skill",
      imported_at: new Date().toISOString(),
      status: "pending_review",
      skill_id: "skill",
      version: "1.0.0",
      workspace_path: workspacePath,
      source_commit: "fff",
      scan_issues: [],
      risk_level: "low",
      sandbox_result: { ran: false, runtime: "none", ok: true, output: "skip" }
    };

    const published = await publishSkill({
      ingest,
      approval: {
        ingest_id: ingest.id,
        reviewer: "bob",
        decision: "approve",
        note: "ok",
        reviewed_at: new Date().toISOString()
      },
      config
    });

    expect(published.record.skill_id).toBe("skill");

    const indexPath = join(config.localSkillsRepo, "index", "skills-index.json");
    const indexPayload = JSON.parse(readFileSync(indexPath, "utf8")) as Array<{ skill_id: string; versions: string[] }>;
    expect(indexPayload.find((x) => x.skill_id === "skill")?.versions).toContain("1.0.0");
  });
});
