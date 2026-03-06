import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { dirSha256, walkFiles } from "../fs-util.js";
import { withOutboundProxyEnv } from "../proxy.js";
import { runStaticScan } from "./scanner.js";
import { runSandboxCheck } from "./sandbox.js";
import { type IngestRecord, type RiskLevel } from "@skills/shared";

function assertWhitelisted(url: string, whitelist: string[]): void {
  const parsed = new URL(url);
  const isAllowed = whitelist.some((allowed) => {
    const host = new URL(allowed).host;
    return parsed.host === host;
  });
  if (!isAllowed) {
    throw new Error(`source host ${parsed.host} is not in whitelist`);
  }
}

function guessSkillIdFromUrl(url: string): string {
  const parsed = new URL(url);
  const pieces = parsed.pathname.split("/").filter(Boolean);
  return pieces[pieces.length - 1]?.replace(/\.git$/, "") ?? `skill-${Date.now()}`;
}

function normalizeVersion(versionText: string): string {
  const cleaned = versionText.trim().replace(/^v/i, "");
  return /^\d+\.\d+\.\d+$/.test(cleaned) ? cleaned : "0.1.0";
}

export interface ImportSkillInput {
  sourceUrl: string;
  query?: string;
  dataDir: string;
  whitelistSources: string[];
}

export function importSkillFromSource(input: ImportSkillInput): IngestRecord {
  assertWhitelisted(input.sourceUrl, input.whitelistSources);

  const id = `ing-${uuidv4()}`;
  const ingestRoot = resolve(join(input.dataDir, "ingests"));
  mkdirSync(ingestRoot, { recursive: true });

  const repoClonePath = join(ingestRoot, `${id}-repo`);
  const workspacePath = join(ingestRoot, id);
  rmSync(repoClonePath, { recursive: true, force: true });
  rmSync(workspacePath, { recursive: true, force: true });
  mkdirSync(repoClonePath, { recursive: true });

  execFileSync("git", ["clone", "--depth", "1", input.sourceUrl, repoClonePath], {
    stdio: "pipe",
    env: withOutboundProxyEnv(process.env)
  });

  const skillPath = chooseSkillFile(repoClonePath);
  if (!skillPath) {
    throw new Error("SKILL.md not found in repository");
  }
  cpSync(dirname(skillPath), workspacePath, { recursive: true });

  const staticScan = runStaticScan(workspacePath);
  const sandboxResult = runSandboxCheck(workspacePath);

  const skillId = guessSkillIdFromUrl(input.sourceUrl);
  const version = normalizeVersion("0.1.0");
  const sourceCommit = execFileSync("git", ["-C", repoClonePath, "rev-parse", "HEAD"], {
    encoding: "utf8",
    env: withOutboundProxyEnv(process.env)
  }).trim();

  const riskLevel: RiskLevel = sandboxResult.ok ? staticScan.riskLevel : staticScan.riskLevel === "critical" ? "critical" : "high";
  const status = riskLevel === "critical" ? "rejected_auto" : "pending_review";

  const ingest: IngestRecord = {
    id,
    query: input.query,
    source_url: input.sourceUrl,
    imported_at: new Date().toISOString(),
    status,
    reason: status === "rejected_auto" ? "static scan critical issue" : undefined,
    skill_id: skillId,
    version,
    workspace_path: workspacePath,
    source_commit: `${sourceCommit}:${dirSha256(workspacePath)}`,
    scan_issues: staticScan.issues,
    risk_level: riskLevel,
    sandbox_result: sandboxResult
  };

  rmSync(repoClonePath, { recursive: true, force: true });
  return ingest;
}

function chooseSkillFile(repoClonePath: string): string | undefined {
  const allSkills = walkFiles(repoClonePath).filter((file) => file.endsWith("/SKILL.md"));
  if (allSkills.length === 0) {
    return undefined;
  }
  allSkills.sort((a, b) => scoreSkillPath(repoClonePath, a) - scoreSkillPath(repoClonePath, b));
  return allSkills[0];
}

function scoreSkillPath(repoRoot: string, absPath: string): number {
  const rel = relative(repoRoot, absPath).replaceAll("\\", "/");
  const depth = rel.split("/").length;
  const skillsBonus = rel.includes("/skills/") ? -5 : 0;
  const samplesBonus = rel.includes("/samples/") ? -2 : 0;
  return depth + skillsBonus + samplesBonus;
}
