import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import {
  ingestImportSchema,
  ingestJobClaimSchema,
  ingestJobCompleteSchema,
  ingestJobFailSchema,
  ingestSearchSchema,
  listSkillsQuerySchema,
  reviewSchema,
  type IngestJob,
  type ReviewDecision,
  type RiskLevel,
  verifyHashSignature
} from "@skills/shared";
import type { AppConfig } from "./config.js";
import type { StateStore } from "./state.js";
import { searchWhitelistedSources } from "./services/source-search.js";
import { importSkillFromSource } from "./services/importer.js";
import { publishSkill } from "./services/publisher.js";
import { GitLabCatalogService } from "./services/gitlab-catalog.js";

interface AppDeps {
  config: AppConfig;
  store: StateStore;
}

export function createApp({ config, store }: AppDeps): express.Express {
  const app = express();
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const reviewHtmlPath = join(currentDir, "web", "review-console.html");
  const catalogHtmlPath = join(currentDir, "web", "catalog.html");
  const skillDetailHtmlPath = join(currentDir, "web", "skill-detail.html");
  const leaderboardHtmlPath = join(currentDir, "web", "leaderboard.html");
  const auditsHtmlPath = join(currentDir, "web", "audits.html");
  const categoriesHtmlPath = join(currentDir, "web", "categories.html");
  const categoryDetailHtmlPath = join(currentDir, "web", "category-detail.html");
  const auditDetailHtmlPath = join(currentDir, "web", "audit-detail.html");
  const auditVersionDetailHtmlPath = join(currentDir, "web", "audit-version-detail.html");
  const catalog = new GitLabCatalogService({
    rawBaseUrl: config.gitlabRawBaseUrl,
    fetchBaseUrl: config.gitlabFetchBaseUrl
  });
  app.use(express.json({ limit: "2mb" }));

  app.get("/", (_req, res) => {
    const page = readFileSync(catalogHtmlPath, "utf8");
    res.type("html").send(page);
  });

  app.get("/skills/:skillId", (_req, res) => {
    const page = readFileSync(skillDetailHtmlPath, "utf8");
    res.type("html").send(page);
  });

  app.get("/leaderboard", (_req, res) => {
    const page = readFileSync(leaderboardHtmlPath, "utf8");
    res.type("html").send(page);
  });

  app.get("/audits", (_req, res) => {
    const page = readFileSync(auditsHtmlPath, "utf8");
    res.type("html").send(page);
  });

  app.get("/audits/:skillId/:version", (_req, res) => {
    const page = readFileSync(auditVersionDetailHtmlPath, "utf8");
    res.type("html").send(page);
  });

  app.get("/audits/:skillId", (_req, res) => {
    const page = readFileSync(auditDetailHtmlPath, "utf8");
    res.type("html").send(page);
  });

  app.get("/categories", (_req, res) => {
    const page = readFileSync(categoriesHtmlPath, "utf8");
    res.type("html").send(page);
  });

  app.get("/categories/:slug", (_req, res) => {
    const page = readFileSync(categoryDetailHtmlPath, "utf8");
    res.type("html").send(page);
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, now: new Date().toISOString() });
  });

  app.get("/review", (_req, res) => {
    const page = readFileSync(reviewHtmlPath, "utf8");
    res.type("html").send(page);
  });

  app.get("/api/v1/public-key", (_req, res) => {
    const publicPem = readFileSync(config.signingPublicKeyPath, "utf8");
    res.json({ key_id: "market-ed25519-v1", pem: publicPem });
  });

  app.get("/api/v1/catalog/skills", async (req, res) => {
    try {
      const query = typeof req.query.query === "string" ? req.query.query : undefined;
      const items = await catalog.listSkills(query);
      return res.json({ items });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/v1/catalog/skills/:skillId", async (req, res) => {
    try {
      const item = await catalog.getSkillDetail(req.params.skillId);
      if (!item) {
        return res.status(404).json({ error: "skill not found" });
      }
      return res.json(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/v1/catalog/leaderboard", async (req, res) => {
    try {
      const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;
      const items = await catalog.getLeaderboard(Number.isFinite(limit) && limit > 0 ? limit : 10);
      return res.json(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/v1/catalog/audits", async (req, res) => {
    try {
      const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 12;
      const items = await catalog.listAudits(Number.isFinite(limit) && limit > 0 ? limit : 12);
      return res.json({ items });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/v1/catalog/audits/:skillId/:version", async (req, res) => {
    try {
      const item = await catalog.getAuditVersionDetail(req.params.skillId, req.params.version);
      if (!item) {
        return res.status(404).json({ error: "audit version detail not found" });
      }
      return res.json(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/v1/catalog/audits/:skillId", async (req, res) => {
    try {
      const item = await catalog.getAuditDetail(req.params.skillId);
      if (!item) {
        return res.status(404).json({ error: "audit detail not found" });
      }
      return res.json(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/v1/catalog/categories", async (_req, res) => {
    try {
      const items = await catalog.listCategories();
      return res.json({ items });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/v1/catalog/categories/:slug", async (req, res) => {
    try {
      const sort = req.query.sort === "title" || req.query.sort === "risk" || req.query.sort === "latest" ? req.query.sort : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const risk = typeof req.query.risk === "string" ? req.query.risk : undefined;
      const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
      const item = await catalog.getCategoryDetail(req.params.slug, {
        sort,
        q,
        risk: risk as RiskLevel | undefined,
        tag
      });
      if (!item) {
        return res.status(404).json({ error: "category not found" });
      }
      return res.json(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/v1/ingests", (req, res) => {
    const state = store.load();
    const status = req.query.status as string | undefined;
    const items = status ? state.ingests.filter((item) => item.status === status) : state.ingests;
    res.json({ items });
  });

  app.get("/api/v1/ingest/jobs", (req, res) => {
    const state = store.load();
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const items = status ? state.jobs.filter((item) => item.status === status) : state.jobs;
    res.json({ items });
  });

  app.post("/api/v1/ingest/search", async (req, res) => {
    const parsed = ingestSearchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const candidates = await searchWhitelistedSources(parsed.data.query, config.whitelistSources);
    return res.json({ query: parsed.data.query, candidates });
  });

  app.post("/api/v1/ingest/jobs", (req, res) => {
    const parsed = ingestImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const sourceHost = new URL(parsed.data.source_url).host;
      const allowed = config.whitelistSources.some((item) => new URL(item).host === sourceHost);
      if (!allowed) {
        return res.status(400).json({ error: `source host ${sourceHost} is not in whitelist` });
      }

      const job: IngestJob = {
        id: `job-${uuidv4()}`,
        source_url: parsed.data.source_url,
        query: parsed.data.query,
        status: "queued",
        created_at: new Date().toISOString(),
        attempts: 0
      };
      store.appendJob(job);
      store.appendAudit({
        id: uuidv4(),
        event: "queue",
        skill_id: "pending",
        version: "pending",
        at: new Date().toISOString(),
        actor: "system",
        details: { job_id: job.id, source_url: job.source_url, query: job.query ?? "" }
      });
      return res.status(202).json({ job });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: message });
    }
  });

  app.post("/api/v1/ingest/jobs/claim", (req, res) => {
    const parsed = ingestJobClaimSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const job = store.claimNextJob(parsed.data.worker_id);
    if (!job) {
      return res.status(204).send();
    }
    return res.json({ job });
  });

  app.post("/api/v1/ingest/jobs/:jobId/complete", (req, res) => {
    const parsed = ingestJobCompleteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const job = store.completeJob(req.params.jobId, parsed.data.worker_id, parsed.data.ingest_id);
    if (!job) {
      return res.status(409).json({ error: "job is not processing for this worker" });
    }
    return res.json({ job });
  });

  app.post("/api/v1/ingest/jobs/:jobId/fail", (req, res) => {
    const parsed = ingestJobFailSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const job = store.failJob(req.params.jobId, parsed.data.worker_id, parsed.data.error);
    if (!job) {
      return res.status(409).json({ error: "job is not processing for this worker" });
    }
    return res.json({ job });
  });

  app.post("/api/v1/ingest/import", (req, res) => {
    const parsed = ingestImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const ingest = importSkillFromSource({
        sourceUrl: parsed.data.source_url,
        query: parsed.data.query,
        dataDir: config.dataDir,
        whitelistSources: config.whitelistSources
      });
      store.appendIngest(ingest);
      store.appendAudit({
        id: uuidv4(),
        event: "ingest",
        skill_id: ingest.skill_id,
        version: ingest.version,
        at: new Date().toISOString(),
        actor: "system",
        details: { ingest_id: ingest.id, source_url: ingest.source_url }
      });
      return res.status(201).json({ ingest });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: message });
    }
  });

  app.post("/api/v1/reviews/:ingestId/approve", async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const state = store.load();
    const ingest = state.ingests.find((item) => item.id === req.params.ingestId);
    if (!ingest) {
      return res.status(404).json({ error: "ingest not found" });
    }
    if (ingest.status !== "pending_review") {
      return res.status(409).json({ error: `cannot approve ingest with status=${ingest.status}` });
    }

    const approval: ReviewDecision = {
      ingest_id: ingest.id,
      reviewer: parsed.data.reviewer,
      decision: "approve",
      note: parsed.data.note ?? "",
      reviewed_at: new Date().toISOString()
    };

    try {
      const published = await publishSkill({ ingest, approval, config });
      store.updateIngest(ingest.id, { status: "approved" });
      store.appendPublished(published);
      store.appendAudit({
        id: uuidv4(),
        event: "review",
        skill_id: ingest.skill_id,
        version: ingest.version,
        at: new Date().toISOString(),
        actor: approval.reviewer,
        details: { ingest_id: ingest.id, decision: approval.decision }
      });
      store.appendAudit({
        id: uuidv4(),
        event: "publish",
        skill_id: ingest.skill_id,
        version: ingest.version,
        at: new Date().toISOString(),
        actor: approval.reviewer,
        details: { package_path: published.package_path }
      });

      return res.json({ published });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: `publish failed: ${message}` });
    }
  });

  app.post("/api/v1/reviews/:ingestId/reject", (req, res) => {
    const parsed = reviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const state = store.load();
    const ingest = state.ingests.find((item) => item.id === req.params.ingestId);
    if (!ingest) {
      return res.status(404).json({ error: "ingest not found" });
    }
    if (!["pending_review", "rejected_auto"].includes(ingest.status)) {
      return res.status(409).json({ error: `cannot reject ingest with status=${ingest.status}` });
    }

    store.updateIngest(ingest.id, { status: "rejected", reason: parsed.data.note ?? "rejected by reviewer" });
    store.appendAudit({
      id: uuidv4(),
      event: "review",
      skill_id: ingest.skill_id,
      version: ingest.version,
      at: new Date().toISOString(),
      actor: parsed.data.reviewer,
      details: { ingest_id: ingest.id, decision: "reject", note: parsed.data.note }
    });

    return res.json({ ok: true });
  });

  app.get("/api/v1/skills", (req, res) => {
    const queryParsed = listSkillsQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return res.status(400).json({ error: queryParsed.error.flatten() });
    }

    const state = store.load();
    let results = state.published;

    if (queryParsed.data.query) {
      const q = queryParsed.data.query.toLowerCase();
      results = results.filter((item) => item.record.skill_id.toLowerCase().includes(q));
    }
    if (queryParsed.data.risk) {
      results = results.filter((item) => item.record.risk_level === queryParsed.data.risk);
    }
    if (queryParsed.data.source) {
      results = results.filter((item) => item.record.source_url.includes(queryParsed.data.source!));
    }

    return res.json({ items: results });
  });

  app.get("/api/v1/skills/:skillId", (req, res) => {
    const state = store.load();
    const versions = state.published.filter((item) => item.record.skill_id === req.params.skillId);
    if (versions.length === 0) {
      return res.status(404).json({ error: "skill not found" });
    }
    return res.json({ skill_id: req.params.skillId, versions: versions.map((v) => v.record.version) });
  });

  app.get("/api/v1/skills/:skillId/versions/:version", (req, res) => {
    const state = store.load();
    const item = state.published.find(
      (candidate) =>
        candidate.record.skill_id === req.params.skillId && candidate.record.version === req.params.version
    );
    if (!item) {
      return res.status(404).json({ error: "skill version not found" });
    }
    return res.json({ item });
  });

  app.get("/api/v1/install/:skillId/:version", (req, res) => {
    const state = store.load();
    const item = state.published.find(
      (candidate) =>
        candidate.record.skill_id === req.params.skillId && candidate.record.version === req.params.version
    );
    if (!item) {
      return res.status(404).json({ error: "install manifest not found" });
    }
    return res.json(item.install);
  });

  app.get("/api/v1/packages/:skillId/:version", (req, res) => {
    const state = store.load();
    const item = state.published.find(
      (candidate) =>
        candidate.record.skill_id === req.params.skillId && candidate.record.version === req.params.version
    );
    if (!item) {
      return res.status(404).json({ error: "package not found" });
    }
    return res.download(item.package_path);
  });

  app.get("/api/v1/audit/:skillId/:version", (req, res) => {
    const state = store.load();
    const events = state.audit.filter(
      (event) => event.skill_id === req.params.skillId && event.version === req.params.version
    );
    return res.json({ events });
  });

  app.post("/api/v1/install-log/:skillId/:version", (req, res) => {
    const state = store.load();
    const item = state.published.find(
      (candidate) =>
        candidate.record.skill_id === req.params.skillId && candidate.record.version === req.params.version
    );
    if (!item) {
      return res.status(404).json({ error: "not found" });
    }

    const publicPem = readFileSync(config.signingPublicKeyPath, "utf8");
    const signatureOk = verifyHashSignature(item.install.package_sha256, item.install.signature, publicPem);
    if (!signatureOk) {
      return res.status(409).json({ error: "signature verification failed" });
    }

    store.appendAudit({
      id: uuidv4(),
      event: "install",
      skill_id: req.params.skillId,
      version: req.params.version,
      at: new Date().toISOString(),
      actor: typeof req.body?.actor === "string" ? req.body.actor : "unknown",
      details: { host: req.body?.host ?? "unknown" }
    });

    return res.json({ ok: true });
  });

  return app;
}
